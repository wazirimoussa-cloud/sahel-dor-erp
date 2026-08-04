-- Audit sécurité (session du 2026-08-04) : fn_consume_specific_lot et
-- fn_consume_stock_lots sont des fonctions internes SECURITY DEFINER, utilisées
-- uniquement en interne par des RPC déjà protégées (create_order, request_stock_loss,
-- receive_purchase, etc.) pour décrémenter stock_lots.quantity_remaining et journaliser
-- les allocations FEFO -- jamais appelées depuis le frontend (confirmé par recherche
-- dans src/).
--
-- Elles n'ont jamais eu de vérification d'attribution ni de portée par société (aucun
-- has_attribution()/current_company_id() dans leur corps), un choix défendable pour une
-- fonction purement interne -- SAUF que PostgreSQL accorde par défaut EXECUTE à PUBLIC
-- sur toute nouvelle fonction, et ce grant par défaut n'a jamais été révoqué ici. Résultat
-- constaté : n'importe quel appelant possédant la seule clé anon publique (visible dans
-- le bundle du site, donc accessible à quiconque ouvre les DevTools) peut les appeler
-- directement via PostgREST, sans connexion, pour décrémenter le stock de n'importe
-- quelle société avec un transaction_id inventé -- corrompt silencieusement les données
-- de stock et casse la piste d'audit FEFO/coût.
--
-- Correctif : ne retirer l'accès qu'à PUBLIC/anon/authenticated. Les deux fonctions
-- appartiennent à `postgres` (comme tous les RPC de ce projet) : un appel interne depuis
-- une autre fonction SECURITY DEFINER owned by postgres s'exécute déjà avec les
-- privilèges du propriétaire, jamais soumis à ce grant -- aucun chemin d'appel légitime
-- n'est donc affecté.

revoke execute on function public.fn_consume_specific_lot(uuid, uuid, uuid, uuid, numeric)
  from public, anon, authenticated;

revoke execute on function public.fn_consume_stock_lots(uuid, uuid, uuid, numeric)
  from public, anon, authenticated;
