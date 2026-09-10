// Recrée les 5 comptes de formation (auth + public.users + user_attributions) dans un
// projet Supabase neuf, après `supabase db push` et `seed-formation.sql`.
//
// Contexte : la séparation Formation / Production (docs/runbook-separation-formation.md)
// donne à Formation son propre projet. auth.users n'est pas copiable proprement d'un
// projet à l'autre — on recrée les comptes via l'API Admin. Les UUID ne sont pas
// préservés ; tout est mappé par `login`.
//
// Prérequis (env) :
//   SUPABASE_URL               URL du NOUVEAU projet Formation
//   SUPABASE_SERVICE_ROLE_KEY  clé service_role du NOUVEAU projet
//   DEFAULT_PASSWORD           mot de passe partagé des comptes (même secret que l'app)
//
// Usage :
//   node supabase/scripts/provision-formation-auth.mjs --dry-run   # liste sans rien créer
//   node supabase/scripts/provision-formation-auth.mjs             # crée
//
// Idempotent : un login déjà présent dans public.users est laissé tel quel.

import { createClient } from "@supabase/supabase-js";

const FORMATION_COMPANY_ID = "00000000-0000-0000-0000-0000000000f0";
const LOGIN_EMAIL_DOMAIN = "login.saheldor.internal";
const C = "consultative";
const O = "operationnelle";

// Référentiel des profils de formation — extrait du projet partagé le 2026-09-10, source
// de vérité versionnée. `[action_key, niveau]`. Les paires en conflit de séparation des
// tâches (achats.creer/receptionner, ventes.creer/valider, pertes_stock.declarer/approuver)
// ne sont jamais toutes deux en `operationnelle` pour un même profil — le trigger de
// conflit reste donc satisfait.
const PROFILES = {
  "admin.formation": [
    ["achats.annuler", C], ["achats.creer", C], ["achats.receptionner", C],
    ["clients.gerer", C], ["comptabilite.consulter_prix_revient", C],
    ["comptabilite.gerer_immobilisations", C], ["comptabilite.gerer_plan_comptable", C],
    ["comptabilite.modifier_capital_social", C], ["entrepots.gerer", C],
    ["etats_financiers.consulter", C], ["fournisseurs.gerer", C],
    ["journal_audit.consulter", C], ["journal_comptable.consulter", C],
    ["paie.consulter", C], ["pertes_stock.approuver", C], ["pertes_stock.declarer", C],
    ["production.creer", C], ["produits.gerer_catalogue", C], ["produits.modifier_prix", C],
    ["stock.mouvement_manuel", C], ["stock.transfert", C], ["transformation.creer", C],
    ["transporteurs.gerer", C], ["utilisateurs.gerer", O],
    ["ventes.annuler_commande", C], ["ventes.creer_commande", C],
    ["ventes.encaisser_paiement", C], ["ventes.valider_commande", C],
  ],
  "comptable.formation": [
    ["comptabilite.consulter_prix_revient", C], ["comptabilite.gerer_immobilisations", O],
    ["comptabilite.gerer_plan_comptable", O], ["comptabilite.modifier_capital_social", O],
    ["etats_financiers.consulter", C], ["journal_comptable.consulter", C],
    ["paie.gerer", O], ["ventes.encaisser_paiement", O],
  ],
  "gerant.formation": [
    ["achats.annuler", O], ["achats.creer", O], ["achats.receptionner", C],
    ["clients.gerer", O], ["entrepots.gerer", O], ["fournisseurs.gerer", O],
    ["production.creer", O], ["produits.gerer_catalogue", O], ["produits.modifier_prix", O],
    ["stock.mouvement_manuel", C], ["stock.transfert", C], ["transformation.creer", O],
    ["ventes.annuler_commande", O], ["ventes.creer_commande", O],
  ],
  "magasinier.formation": [
    ["achats.receptionner", O], ["entrepots.gerer", C], ["pertes_stock.declarer", O],
    ["stock.mouvement_manuel", O], ["stock.transfert", O], ["transporteurs.gerer", C],
  ],
  "superviseur.formation": [
    ["achats.annuler", C], ["achats.creer", C], ["clients.gerer", C],
    ["comptabilite.consulter_prix_revient", C], ["comptabilite.gerer_immobilisations", C],
    ["comptabilite.gerer_plan_comptable", C], ["comptabilite.modifier_capital_social", C],
    ["entrepots.gerer", C], ["etats_financiers.consulter", C], ["fournisseurs.gerer", C],
    ["journal_comptable.consulter", C], ["pertes_stock.approuver", O],
    ["pertes_stock.declarer", C], ["production.creer", C], ["produits.gerer_catalogue", C],
    ["produits.modifier_prix", C], ["stock.mouvement_manuel", C], ["stock.transfert", C],
    ["transformation.creer", C], ["transporteurs.gerer", C], ["ventes.annuler_commande", C],
    ["ventes.creer_commande", C], ["ventes.encaisser_paiement", C],
    ["ventes.valider_commande", O],
  ],
};

const dryRun = process.argv.includes("--dry-run");
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEFAULT_PASSWORD;

if (!url || !serviceKey || !password) {
  console.error(
    "Env manquant : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEFAULT_PASSWORD requis.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// Garde-fou : refuser de tourner contre le projet historique partagé.
const SHARED_PROJECT_HOST = "parbrpqsotkpwxoqlmcn";
if (url.includes(SHARED_PROJECT_HOST)) {
  console.error(
    `Refus : SUPABASE_URL pointe le projet partagé (${SHARED_PROJECT_HOST}). ` +
      "Ce script ne doit tourner que contre le NOUVEAU projet Formation.",
  );
  process.exit(1);
}

async function attributionIds() {
  const { data, error } = await admin.from("attributions").select("id, action_key");
  if (error) throw new Error(`Lecture de attributions : ${error.message}`);
  return new Map(data.map((a) => [a.action_key, a.id]));
}

async function run() {
  const attrMap = await attributionIds();

  for (const [login, attributions] of Object.entries(PROFILES)) {
    const email = `${login}@${LOGIN_EMAIL_DOMAIN}`;

    const { data: existing } = await admin
      .from("users")
      .select("id")
      .eq("login", login)
      .maybeSingle();

    if (existing) {
      console.log(`= ${login} : déjà présent (${existing.id}), ignoré`);
      continue;
    }

    if (dryRun) {
      console.log(`+ ${login} : créerait le compte + ${attributions.length} attributions`);
      continue;
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      throw new Error(`createUser(${login}) : ${createErr?.message ?? "échec"}`);
    }
    const userId = created.user.id;

    // handle_new_user (trigger) a créé public.users ; on renseigne société + login.
    const { error: updErr } = await admin
      .from("users")
      .update({ company_id: FORMATION_COMPANY_ID, login, must_change_password: false })
      .eq("id", userId);
    if (updErr) throw new Error(`update users(${login}) : ${updErr.message}`);

    const rows = attributions.map(([actionKey, level]) => {
      const attributionId = attrMap.get(actionKey);
      if (!attributionId) throw new Error(`attribution inconnue : ${actionKey}`);
      return { user_id: userId, attribution_id: attributionId, level, granted_by: null };
    });
    const { error: attrErr } = await admin.from("user_attributions").insert(rows);
    if (attrErr) throw new Error(`user_attributions(${login}) : ${attrErr.message}`);

    console.log(`+ ${login} : créé (${userId}) + ${rows.length} attributions`);
  }

  console.log(dryRun ? "\nDry-run terminé." : "\nProvisioning terminé.");
}

run().catch((err) => {
  console.error("\nÉchec :", err.message);
  process.exit(1);
});
