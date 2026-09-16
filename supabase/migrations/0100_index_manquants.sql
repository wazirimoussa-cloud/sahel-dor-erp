-- Ajoute les index manquants trouvés lors de l'audit pré-lancement (RLS + clés de
-- jointure sur les chemins de requête les plus sollicités). Postgres n'indexe jamais
-- automatiquement une colonne de clé étrangère (contrairement à la clé primaire ou à une
-- contrainte unique) — chacune ci-dessous a été vérifiée manquante en comparant la liste
-- complète des `create index` existants aux colonnes `references public....` du schéma,
-- faute d'accès direct à la base (Docker indisponible pour `supabase db dump`, comme déjà
-- noté ailleurs dans cette session).
--
-- Deux catégories :
-- 1. company_id sur les tables dont la policy RLS filtre systématiquement dessus (RLS
--    ajoute ce filtre à TOUTE requête sur ces tables, même la plus anodine) : stock_lots,
--    stock_loss_requests, fixed_assets, et les 3 tables du module paie — celles-ci
--    viennent tout juste de gagner un second has_attribution() par ligne (migration 0099),
--    un filtre company_id indexé limite d'autant mieux le volume de lignes à évaluer.
-- 2. Clés de jointure/filtre réellement utilisées côté application, pas ajoutées par
--    précaution : stock_lots.source_transaction_id (jointure exacte de la requête la plus
--    lourde de l'app, useFinancialStatements.ts), purchases.warehouse_id/supplier_id/
--    transporter_id (filtres/aggrégations de PurchasesPage, usePurchasingPeriodSummary
--    "top fournisseurs", PurchaseLossesPage), orders.user_id (agrégation "top créateurs"
--    de useSalesPeriodSummary), journal_entries.entry_date (colonne sur laquelle un futur
--    filtre de date devra porter pour corriger la requête ci-dessus), logs.user_id
--    (jointure utilisée par la policy RLS de logs pour vérifier la société, cette table
--    n'ayant pas de company_id propre).

create index stock_lots_company_id_idx on public.stock_lots (company_id);
create index stock_lots_source_transaction_id_idx on public.stock_lots (source_transaction_id);

create index stock_loss_requests_company_id_idx on public.stock_loss_requests (company_id);

create index fixed_assets_company_id_idx on public.fixed_assets (company_id);

create index employees_company_id_idx on public.employees (company_id);
create index payslips_company_id_idx on public.payslips (company_id);
create index salary_advances_company_id_idx on public.salary_advances (company_id);
create index salary_advances_employee_id_idx on public.salary_advances (employee_id);
create index leave_records_company_id_idx on public.leave_records (company_id);

create index purchases_warehouse_id_idx on public.purchases (warehouse_id);
create index purchases_supplier_id_idx on public.purchases (supplier_id);
create index purchases_transporter_id_idx on public.purchases (transporter_id);

create index orders_user_id_idx on public.orders (user_id);

create index journal_entries_entry_date_idx on public.journal_entries (entry_date);

create index logs_user_id_idx on public.logs (user_id);
