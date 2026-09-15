-- Complète la couverture du journal d'audit générique (fn_audit_log, 0002) : la quasi-
-- totalité des tables métier ont déjà un trigger trg_audit_<table> (products, orders,
-- clients, suppliers, transporters, warehouses, employees, purchases, productions,
-- transformations, payslips, salary_advances, leave_records, chart_of_accounts...) — un
-- système déjà en place, découvert en revoyant la question "toute modification a-t-elle un
-- historique ?" après coup (0087 avait ajouté un mécanisme dédié aux taux fiscaux avant que
-- ce système générique existant soit identifié). 5 tables réellement mutées en place restaient
-- hors de cette couverture :
--   - companies (capital_social, taux fiscaux, infos légales) — 0087 ne trace que les taux
--     fiscaux ; ce trigger couvre aussi capital_social et le reste.
--   - users (bascule actif/inactif, must_change_password)
--   - user_attributions (octroi/retrait de droits — jusqu'ici set_user_attributions fait un
--     delete puis un insert sans aucune trace de l'état précédent)
--   - stock_loss_requests (approbation/rejet — approve_stock_loss/reject_stock_loss)
--   - fixed_assets (cession — dispose_fixed_asset)
-- Hors périmètre volontairement : product_stocks/stock_lots (état dérivé, recalculé à chaque
-- transaction déjà auditée via trg_audit_transactions — les auditer en plus ne ferait que
-- dupliquer le même événement sans information nouvelle) ; order_payments/purchase_losses/
-- transaction_lot_allocations (jamais modifiés après création, seulement insérés puis lus —
-- déjà visibles intégralement via leurs propres écrans) ; attributions/attribution_conflicts/
-- roles (catalogues statiques, jamais modifiés depuis l'UI).

create trigger trg_audit_companies
  after insert or update or delete on public.companies
  for each row execute function public.fn_audit_log();

create trigger trg_audit_users
  after insert or update or delete on public.users
  for each row execute function public.fn_audit_log();

create trigger trg_audit_user_attributions
  after insert or update or delete on public.user_attributions
  for each row execute function public.fn_audit_log();

create trigger trg_audit_stock_loss_requests
  after insert or update or delete on public.stock_loss_requests
  for each row execute function public.fn_audit_log();

create trigger trg_audit_fixed_assets
  after insert or update or delete on public.fixed_assets
  for each row execute function public.fn_audit_log();
