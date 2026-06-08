create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_name text not null,
  debt_type text not null,
  wallet_id uuid references public.wallets(id) on delete set null,
  original_amount numeric(14, 2) not null,
  remaining_balance numeric(14, 2) not null,
  borrowed_date date not null,
  due_date date,
  notes text,
  status text not null default 'active',
  local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  is_deleted boolean not null default false,
  constraint debts_person_name_not_blank check (length(btrim(person_name)) > 0),
  constraint debts_original_amount_positive check (original_amount > 0),
  constraint debts_remaining_balance_non_negative check (remaining_balance >= 0),
  constraint debts_remaining_balance_not_above_original check (remaining_balance <= original_amount),
  constraint debts_type_check check (debt_type in ('i_owe', 'owes_me')),
  constraint debts_status_check check (status in ('active', 'paid', 'overdue'))
);

drop trigger if exists debts_set_updated_at on public.debts;
create trigger debts_set_updated_at
  before update on public.debts
  for each row execute function public.set_updated_at();

drop trigger if exists debts_set_current_user_id on public.debts;
create trigger debts_set_current_user_id
  before insert on public.debts
  for each row execute function public.set_current_user_id();

create index if not exists debts_user_id_idx on public.debts (user_id);
create index if not exists debts_user_status_idx
  on public.debts (user_id, status, due_date)
  where is_deleted = false;
create index if not exists debts_user_type_idx
  on public.debts (user_id, debt_type)
  where is_deleted = false;
create index if not exists debts_wallet_id_idx
  on public.debts (wallet_id)
  where is_deleted = false;
create index if not exists debts_user_due_idx
  on public.debts (user_id, due_date)
  where is_deleted = false;

alter table public.debts enable row level security;

create or replace function public.assert_debt_owner_refs()
returns trigger
language plpgsql
as $$
begin
  if new.wallet_id is not null and not exists (
    select 1 from public.wallets
    where id = new.wallet_id and user_id = new.user_id and is_deleted = false
  ) then
    raise exception 'wallet_id does not belong to the current user';
  end if;

  return new;
end;
$$;

drop trigger if exists debts_assert_owner_refs on public.debts;
create trigger debts_assert_owner_refs
  before insert or update of user_id, wallet_id on public.debts
  for each row execute function public.assert_debt_owner_refs();

drop policy if exists "debts_select_own" on public.debts;
create policy "debts_select_own"
  on public.debts for select
  using (auth.uid() = user_id);

drop policy if exists "debts_insert_own" on public.debts;
create policy "debts_insert_own"
  on public.debts for insert
  with check (auth.uid() = user_id);

drop policy if exists "debts_update_own" on public.debts;
create policy "debts_update_own"
  on public.debts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "debts_delete_own" on public.debts;
create policy "debts_delete_own"
  on public.debts for delete
  using (auth.uid() = user_id);
