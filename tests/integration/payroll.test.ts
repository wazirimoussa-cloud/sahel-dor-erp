import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { CREDENTIALS, hasCredentials, signInAs } from "./helpers/auth";

// Vérifie 0063_module_paie.sql contre Formation (RLS + attributions réelles, zéro
// mock) : create_payslip() calcule net_pay et génère une écriture "PAIE" (débit 661,
// crédit 421/431/447) -- retenues pension/ITS saisies manuellement, décision
// confirmée avec l'utilisateur (voir le plan de cette session).
//
// Nécessite les comptes provisoires Formation -- voir .env.example. Suite ignorée
// (jamais en échec) si les identifiants sont absents.

describe.skipIf(!hasCredentials)("module paie (Formation, réel)", () => {
  let gerant: SupabaseClient<Database>;
  let comptable: SupabaseClient<Database>;
  let companyId: string;
  const tag = `Intégration paie ${new Date().toISOString()}`;

  beforeAll(async () => {
    gerant = await signInAs("gerant");
    comptable = await signInAs("comptable");

    const { data: gerantRow, error: gerantErr } = await gerant
      .from("users")
      .select("company_id")
      .eq("login", CREDENTIALS.gerant.login as string)
      .single();
    if (gerantErr || !gerantRow?.company_id) {
      throw new Error(`Impossible de résoudre la société du Gérant : ${gerantErr?.message}`);
    }
    companyId = gerantRow.company_id;
  });

  afterAll(async () => {
    await Promise.all([gerant?.auth.signOut(), comptable?.auth.signOut()]);
  });

  async function createEmployee(suffix: string) {
    const { data: employee, error } = await comptable
      .from("employees")
      .insert({
        company_id: companyId,
        full_name: `${tag} ${suffix}`,
        base_salary: 300000,
        family_dependents: 2,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return employee!.id;
  }

  it(
    "un bulletin avec retenues génère une écriture PAIE équilibrée " +
      "(débit 661 = brut, crédit 421 = net, crédit 431 = pension, crédit 447 = ITS)",
    async () => {
      const employeeId = await createEmployee("A");

      const { data: payslip, error: payslipErr } = await comptable.rpc("create_payslip", {
        payload: {
          employee_id: employeeId,
          period: "2026-08-01",
          gross_salary: 300000,
          pension_withholding: 15000,
          its_withholding: 25000,
        },
      });
      expect(payslipErr).toBeNull();
      expect(Number(payslip!.net_pay)).toBe(260000);

      const { data: entries, error: entriesErr } = await comptable
        .from("journal_entries")
        .select("id, journal_code, journal_entry_lines(debit, credit, chart_of_accounts(code))")
        .eq("payslip_id", payslip!.id);
      expect(entriesErr).toBeNull();
      expect(entries).toHaveLength(1);
      expect(entries![0].journal_code).toBe("PAIE");

      const lines = entries![0].journal_entry_lines as unknown as {
        debit: number;
        credit: number;
        chart_of_accounts: { code: string } | { code: string }[] | null;
      }[];
      expect(lines).toHaveLength(4);

      const codeOf = (line: (typeof lines)[number]) => {
        const coa = line.chart_of_accounts;
        return Array.isArray(coa) ? coa[0]?.code : coa?.code;
      };

      const byCode = Object.fromEntries(lines.map((l) => [codeOf(l), l]));
      expect(Number(byCode["661"]?.debit)).toBe(300000);
      expect(Number(byCode["421"]?.credit)).toBe(260000);
      expect(Number(byCode["431"]?.credit)).toBe(15000);
      expect(Number(byCode["447"]?.credit)).toBe(25000);
    },
  );

  it("un bulletin sans retenue ne génère que 2 lignes (débit 661, crédit 421 = brut entier)", async () => {
    const employeeId = await createEmployee("B");

    const { data: payslip, error: payslipErr } = await comptable.rpc("create_payslip", {
      payload: {
        employee_id: employeeId,
        period: "2026-08-01",
        gross_salary: 200000,
        pension_withholding: 0,
        its_withholding: 0,
      },
    });
    expect(payslipErr).toBeNull();
    expect(Number(payslip!.net_pay)).toBe(200000);

    const { data: entries } = await comptable
      .from("journal_entries")
      .select("journal_entry_lines(debit, credit, chart_of_accounts(code))")
      .eq("payslip_id", payslip!.id);

    const lines = entries![0].journal_entry_lines as unknown as { debit: number; credit: number }[];
    expect(lines).toHaveLength(2);
  });

  it("un profil sans paie.gerer ne peut pas créer de bulletin", async () => {
    const employeeId = await createEmployee("C");

    const { error } = await gerant.rpc("create_payslip", {
      payload: {
        employee_id: employeeId,
        period: "2026-08-01",
        gross_salary: 200000,
      },
    });
    expect(error).not.toBeNull();
  });

  it(
    "une avance sur salaire génère une écriture PAIE équilibrée (débit 425, crédit 522), " +
      "puis son remboursement sur un bulletin réduit le net et crédite 425",
    async () => {
      const employeeId = await createEmployee("D");

      const { data: advance, error: advanceErr } = await comptable.rpc("create_salary_advance", {
        payload: { employee_id: employeeId, amount: 50000, reason: `${tag} avance` },
      });
      expect(advanceErr).toBeNull();

      const { data: advanceEntries, error: advanceEntriesErr } = await comptable
        .from("journal_entries")
        .select("journal_code, journal_entry_lines(debit, credit, chart_of_accounts(code))")
        .eq("company_id", companyId)
        .eq("description", `Avance sur salaire — ${tag} D`);
      expect(advanceEntriesErr).toBeNull();
      expect(advanceEntries).toHaveLength(1);
      expect(advanceEntries![0].journal_code).toBe("PAIE");

      const advanceLines = advanceEntries![0].journal_entry_lines as unknown as {
        debit: number;
        credit: number;
        chart_of_accounts: { code: string } | { code: string }[] | null;
      }[];
      const codeOf = (line: (typeof advanceLines)[number]) => {
        const coa = line.chart_of_accounts;
        return Array.isArray(coa) ? coa[0]?.code : coa?.code;
      };
      const advanceByCode = Object.fromEntries(advanceLines.map((l) => [codeOf(l), l]));
      expect(Number(advanceByCode["425"]?.debit)).toBe(50000);
      expect(Number(advanceByCode["522"]?.credit)).toBe(50000);

      // Remboursement : le bulletin doit référencer l'avance et en déduire le net.
      const { data: payslip, error: payslipErr } = await comptable.rpc("create_payslip", {
        payload: {
          employee_id: employeeId,
          period: "2026-08-01",
          gross_salary: 300000,
          pension_withholding: 0,
          its_withholding: 0,
          advance_repaid_id: advance!.id,
        },
      });
      expect(payslipErr).toBeNull();
      expect(Number(payslip!.net_pay)).toBe(250000);

      const { data: payslipEntries } = await comptable
        .from("journal_entries")
        .select("journal_entry_lines(debit, credit, chart_of_accounts(code))")
        .eq("payslip_id", payslip!.id);
      const payslipLines = payslipEntries![0].journal_entry_lines as unknown as {
        debit: number;
        credit: number;
        chart_of_accounts: { code: string } | { code: string }[] | null;
      }[];
      expect(payslipLines).toHaveLength(3); // débit 661, crédit 421 (net), crédit 425 (avance) -- pas de 431/447
      const payslipByCode = Object.fromEntries(payslipLines.map((l) => [codeOf(l), l]));
      expect(Number(payslipByCode["661"]?.debit)).toBe(300000);
      expect(Number(payslipByCode["421"]?.credit)).toBe(250000);
      expect(Number(payslipByCode["425"]?.credit)).toBe(50000);

      // Une avance déjà remboursée ne peut pas l'être une seconde fois.
      const { error: secondRepaymentErr } = await comptable.rpc("create_payslip", {
        payload: {
          employee_id: employeeId,
          period: "2026-09-01",
          gross_salary: 300000,
          advance_repaid_id: advance!.id,
        },
      });
      expect(secondRepaymentErr).not.toBeNull();
    },
  );

  it("un enregistrement de congé/absence se crée, se liste et se supprime (aucun impact comptable)", async () => {
    const employeeId = await createEmployee("E");

    const { data: leave, error: leaveErr } = await comptable
      .from("leave_records")
      .insert({
        company_id: companyId,
        employee_id: employeeId,
        type: "conge_paye",
        start_date: "2026-08-10",
        end_date: "2026-08-14",
        reason: `${tag} congé`,
        user_id: (await comptable.auth.getUser()).data.user!.id,
      })
      .select("id")
      .single();
    expect(leaveErr).toBeNull();

    const { data: found, error: findErr } = await comptable
      .from("leave_records")
      .select("id, type, start_date, end_date")
      .eq("id", leave!.id)
      .single();
    expect(findErr).toBeNull();
    expect(found!.type).toBe("conge_paye");

    // Aucune écriture comptable ne doit être générée par un enregistrement de congé.
    const { data: entries } = await comptable
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .ilike("description", `%${tag} E%`);
    expect(entries?.length ?? 0).toBe(0);

    // Contrairement à payslips/salary_advances, un congé reste modifiable/supprimable.
    const { error: deleteErr } = await comptable.from("leave_records").delete().eq("id", leave!.id);
    expect(deleteErr).toBeNull();

    const { data: afterDelete } = await comptable
      .from("leave_records")
      .select("id")
      .eq("id", leave!.id);
    expect(afterDelete ?? []).toHaveLength(0);
  });

  it("un profil sans paie.gerer ne peut pas créer d'enregistrement de congé/absence", async () => {
    const employeeId = await createEmployee("F");

    const { error } = await gerant.from("leave_records").insert({
      company_id: companyId,
      employee_id: employeeId,
      type: "maladie",
      start_date: "2026-08-01",
      end_date: "2026-08-02",
      user_id: (await gerant.auth.getUser()).data.user!.id,
    });
    expect(error).not.toBeNull();
  });
});
