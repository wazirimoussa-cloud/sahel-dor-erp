// Mot de passe par défaut : utilisé à la création d'un compte par l'admin et lors d'une
// réinitialisation admin. Jamais transmis ni connu du frontend — uniquement manipulé
// côté serveur (clé service_role) par create-user et reset-password. Le changement est
// forcé dès la première connexion (voir must_change_password, 0013_password_policy.sql).
export const DEFAULT_PASSWORD = "saheldor2026";
