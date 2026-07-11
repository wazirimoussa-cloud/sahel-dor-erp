-- Phase 13 : facture d'avoir transporteur en cas de perte constatée à la réception,
-- avant l'entrée en stock. Réponse à la demande du module Logistique.

create table public.transporters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now()
);

create index transporters_company_id_idx on public.transporters (company_id);

alter table public.transporters enable row level security;

create policy transporters_select on public.transporters
  for select to authenticated
  using (public.current_role_name() = 'admin' or company_id = public.current_company_id());

create policy transporters_insert on public.transporters
  for insert to authenticated
  with check (
    public.current_role_name() in ('warehouse_manager', 'logistics_transport')
    and company_id = public.current_company_id()
  );

create policy transporters_update on public.transporters
  for update to authenticated
  using (
    public.current_role_name() in ('warehouse_manager', 'logistics_transport')
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role_name() in ('warehouse_manager', 'logistics_transport')
    and company_id = public.current_company_id()
  );

create trigger trg_audit_transporters
  after insert or update or delete on public.transporters
  for each row execute function public.fn_audit_log();

-- Perte constatée à la réception d'un achat, avant l'entrée en stock : append-only,
-- comme transactions/logs — c'est une réclamation formelle contre le transporteur, pas
-- un brouillon éditable. unit_cost est copié de purchase_items au moment de la
-- réception pour figer la base de calcul, même si purchase_items venait à changer.
create table public.purchase_losses (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id),
  transporter_id uuid not null references public.transporters (id),
  product_id uuid not null references public.products (id),
  quantity_lost integer not null check (quantity_lost > 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  reason text,
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create index purchase_losses_purchase_id_idx on public.purchase_losses (purchase_id);
create index purchase_losses_transporter_id_idx on public.purchase_losses (transporter_id);

alter table public.purchase_losses enable row level security;

create policy purchase_losses_select on public.purchase_losses
  for select to authenticated
  using (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_losses.purchase_id
        and (public.current_role_name() = 'admin' or p.company_id = public.current_company_id())
    )
  );

create trigger trg_purchase_losses_immutable
  before update or delete on public.purchase_losses
  for each row execute function public.fn_block_mutation();

-- receive_purchase change de signature : Postgres distingue les fonctions par
-- signature, pas seulement par nom — l'ancienne à 1 argument doit être retirée
-- explicitement, sans quoi elle resterait appelable en parallèle de la nouvelle.
drop function if exists public.receive_purchase(uuid);

-- Réceptionne un achat en acceptant une quantité réellement reçue par ligne (≤
-- commandée). `losses` ne liste que les lignes ayant effectivement une perte
-- ([{product_id, transporter_id, quantity_lost, reason}]) ; les lignes absentes sont
-- reçues en totalité (cas courant, tableau vide). Seule la quantité reçue entre en
-- stock. L'écriture comptable ACHATS reste calculée sur la quantité commandée
-- complète : Sahel d'Or doit toujours au fournisseur le montant facturé, la perte est
-- une réclamation séparée contre le transporteur, pas une réduction de cette dette.
create or replace function public.receive_purchase(purchase_id uuid, losses jsonb default '[]')
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_purchase public.purchases;
  v_item record;
  v_loss jsonb;
  v_quantity_lost integer;
  v_quantity_received integer;
  v_total numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_601 uuid;
  v_account_401 uuid;
  v_account_4452 uuid;
  v_entry_id uuid;
begin
  if v_role is null or v_role <> 'warehouse_manager' then
    raise exception 'Rôle % non autorisé à réceptionner un achat', coalesce(v_role, '(aucun)');
  end if;

  select * into v_purchase from public.purchases p where p.id = receive_purchase.purchase_id;

  if v_purchase is null then
    raise exception 'Achat introuvable';
  end if;

  if v_purchase.company_id is distinct from v_caller_company then
    raise exception 'Impossible de réceptionner un achat d''une autre société';
  end if;

  if v_purchase.status <> 'pending' then
    raise exception 'Seul un achat en attente peut être réceptionné (statut actuel : %)', v_purchase.status;
  end if;

  for v_item in select * from public.purchase_items where purchase_items.purchase_id = v_purchase.id
  loop
    v_loss := (
      select l from jsonb_array_elements(coalesce(receive_purchase.losses, '[]')) l
      where (l ->> 'product_id')::uuid = v_item.product_id
      limit 1
    );

    v_quantity_lost := coalesce((v_loss ->> 'quantity_lost')::integer, 0);
    v_quantity_received := v_item.quantity - v_quantity_lost;

    if v_quantity_received < 0 then
      raise exception 'La perte déclarée dépasse la quantité commandée pour un produit';
    end if;

    if v_quantity_received > 0 then
      insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, purchase_id)
      values (v_item.product_id, 'IN', v_quantity_received, auth.uid(), v_purchase.warehouse_id, v_purchase.id);
    end if;

    if v_quantity_lost > 0 then
      if (v_loss ->> 'transporter_id') is null then
        raise exception 'Un transporteur est requis pour déclarer une perte';
      end if;

      insert into public.purchase_losses (purchase_id, transporter_id, product_id, quantity_lost, unit_cost, reason, user_id)
      values (
        v_purchase.id,
        (v_loss ->> 'transporter_id')::uuid,
        v_item.product_id,
        v_quantity_lost,
        v_item.unit_cost,
        v_loss ->> 'reason',
        auth.uid()
      );
    end if;

    v_total := v_total + (v_item.quantity * v_item.unit_cost);
  end loop;

  update public.purchases set status = 'received' where id = v_purchase.id
  returning * into v_purchase;

  if v_total > 0 then
    select vat_rate into v_vat_rate from public.companies where id = v_purchase.company_id;
    v_vat := round(v_total * v_vat_rate / 100, 2);

    select id into v_account_601 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '601';
    select id into v_account_401 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '401';
    select id into v_account_4452 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '4452';

    if v_account_601 is null or v_account_401 is null or v_account_4452 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 601/401/4452 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, purchase_id)
    values (v_purchase.company_id, 'ACHATS', 'Réception achat #' || left(v_purchase.id::text, 8), v_purchase.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_601, v_total, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_4452, v_vat, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_401, 0, v_total + v_vat);
  end if;

  return v_purchase;
end;
$$;

grant execute on function public.receive_purchase(uuid, jsonb) to authenticated;
