import { z } from "zod";

// Trouvé en audit pré-lancement : seule règle appliquée jusqu'ici, 8 caractères minimum,
// aucune exigence de complexité. Renforcé a minima (lettre + chiffre) sans imposer de
// caractère spécial -- un ERP interne à effectif réduit, pas un service grand public ;
// une règle trop stricte pousse surtout à noter le mot de passe quelque part, contre-
// productif. Partagé entre ChangePasswordForm et ResetPasswordPage (même règle, même
// message) plutôt que dupliqué.
export const passwordSchema = z
  .string()
  .min(8, "8 caractères minimum")
  .regex(/[a-zA-Z]/, "Doit contenir au moins une lettre")
  .regex(/[0-9]/, "Doit contenir au moins un chiffre");

export const PASSWORD_POLICY_HINT = "8 caractères minimum, avec au moins une lettre et un chiffre.";
