import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code à 6 chiffres"),
});

type CodeFormValues = z.infer<typeof codeSchema>;

type Status = "loading" | "disabled" | "enrolling" | "enabled";

// Trouvé en audit pré-lancement : aucune double authentification, même pour les comptes
// à droits élevés (utilisateurs.gerer). Enrôlement volontaire ici, TOTP (Supabase Auth
// natif, supabase.auth.mfa.*) -- MfaChallengePage.tsx exige ensuite le code à chaque
// connexion pour tout compte ayant activé un facteur, via needsMfaChallenge
// (AuthProvider). Aucune obligation imposée par la base à ce stade (voir README) : ça
// resterait à ajouter séparément (policy RLS exigeant aal2 sur les actions sensibles),
// une fois les comptes admin réels effectivement enrôlés -- l'imposer avant risquerait de
// verrouiller un admin qui n'a pas encore activé son propre facteur.
export function MfaSettings() {
  const { refreshMfaStatus } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CodeFormValues>({ resolver: zodResolver(codeSchema) });

  async function loadStatus() {
    // data.totp ne contient que les facteurs déjà vérifiés (garanti par le SDK) -- les
    // facteurs "unverified" n'apparaissent que dans data.all, voir handleEnroll().
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp[0];
    if (verified) {
      setFactorId(verified.id);
      setStatus("enabled");
    } else {
      setFactorId(null);
      setStatus("disabled");
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function handleEnroll() {
    setServerError(null);
    // Nettoie tout facteur TOTP "unverified" laissé par une tentative abandonnée --
    // Supabase autorise plusieurs facteurs en parallèle, ça s'accumulerait sinon à
    // chaque annulation. data.all seul contient les facteurs non vérifiés (data.totp
    // n'expose, par construction du SDK, que les facteurs déjà vérifiés).
    const { data: existing } = await supabase.auth.mfa.listFactors();
    const stale = existing?.all.filter((f) => f.factor_type === "totp" && f.status === "unverified") ?? [];
    for (const factor of stale) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Application d'authentification",
    });
    if (error || !data) {
      setServerError("Impossible de démarrer l'activation. Réessayez.");
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStatus("enrolling");
  }

  async function handleCancelEnroll() {
    if (factorId) await supabase.auth.mfa.unenroll({ factorId });
    setFactorId(null);
    setQrCode(null);
    setSecret(null);
    setServerError(null);
    reset();
    setStatus("disabled");
  }

  async function onVerify(values: CodeFormValues) {
    if (!factorId) return;
    setServerError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: values.code });
    if (error) {
      setServerError("Code invalide ou expiré.");
      return;
    }
    await refreshMfaStatus();
    setQrCode(null);
    setSecret(null);
    reset();
    setStatus("enabled");
  }

  async function handleDisable() {
    if (!factorId) return;
    if (
      !window.confirm(
        "Désactiver la double authentification sur ce compte ? La prochaine connexion ne demandera plus de code.",
      )
    )
      return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      setServerError("Désactivation refusée. Réessayez.");
      return;
    }
    await refreshMfaStatus();
    setFactorId(null);
    setStatus("disabled");
  }

  if (status === "loading") {
    return <p className="text-sm text-gray-500">Chargement…</p>;
  }

  if (status === "enabled") {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-green-700">
          <span className="h-2 w-2 rounded-full bg-green-600" />
          Double authentification activée sur ce compte.
        </p>
        <Button variant="danger" onClick={() => void handleDisable()}>
          Désactiver
        </Button>
        {serverError && <p className="text-xs text-red-600">{serverError}</p>}
      </div>
    );
  }

  if (status === "enrolling") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Scannez ce QR code avec une application d'authentification (Google Authenticator,
          Authy...), puis entrez le code à 6 chiffres généré pour confirmer.
        </p>
        {qrCode && (
          <img src={qrCode} alt="QR code de configuration" className="h-40 w-40 rounded-md border border-gray-200" />
        )}
        {secret && (
          <p className="text-xs text-gray-500">
            Impossible de scanner ? Entrez cette clé manuellement :{" "}
            <span className="font-mono">{secret}</span>
          </p>
        )}
        <form onSubmit={handleSubmit(onVerify)} className="flex flex-wrap items-end gap-3" noValidate>
          <div>
            <label htmlFor="mfa-enroll-code" className="mb-1 block text-xs font-medium text-gray-600">
              Code à 6 chiffres
            </label>
            <Input
              id="mfa-enroll-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              {...register("code")}
            />
            {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
          </div>
          <Button type="submit" disabled={isSubmitting}>
            Activer
          </Button>
          <Button type="button" variant="secondary" onClick={() => void handleCancelEnroll()}>
            Annuler
          </Button>
        </form>
        {serverError && <p className="text-xs text-red-600">{serverError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Aucune double authentification sur ce compte. Recommandé pour les comptes ayant des
        droits d'administration.
      </p>
      <Button onClick={() => void handleEnroll()}>Activer la double authentification</Button>
      {serverError && <p className="text-xs text-red-600">{serverError}</p>}
    </div>
  );
}
