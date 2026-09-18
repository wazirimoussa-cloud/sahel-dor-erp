import { z } from "zod";

// Trouvé en audit pré-lancement : téléphone en texte libre, sans validation de format,
// sur clients/fournisseurs/transporteurs (4 occurrences identiques). Pas un problème de
// sécurité, mais une donnée mal saisie une fois (numéro tronqué, texte au lieu d'un
// numéro) restait ainsi indéfiniment -- pertinent si ces numéros doivent un jour être
// exploités automatiquement (SMS, export). Volontairement permissif sur le format (pas de
// préfixe pays imposé, chiffres/espaces/tirets/parenthèses/+ acceptés) : l'app n'a pas de
// convention de saisie unique documentée, l'objectif est d'écarter le texte qui n'est
// clairement pas un numéro, pas d'imposer un format régional strict.
export const phoneSchema = z
  .string()
  .optional()
  .refine((value) => !value || /^[+]?[\d\s().-]{6,20}$/.test(value), {
    message: "Numéro de téléphone invalide",
  });
