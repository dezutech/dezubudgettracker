create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  amount numeric(14, 2) not null,
  due_date date not null,
  category_id uuid references public.categories(id) on delete set null,
  wallet_id uuid references public.wallets(id) on delete set null,
  status text not null default 'unpaid',
  notes text,
  is_recurring boolean not null default false,
  recurring_id uuid references public.recurring_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  is_deleted boolean not null default false,
  constraint bills_title_not_blank check (length(btrim(title)) > 0),
  constraint bills_amount_positive check (amount > 0),
  constraint bills_status_check check (status in ('unpaid', 'paid', 'overdue', 'scheduled')),
  constraint bills_recurring_id_required_when_recurring check (
    is_recurring = false or recurring_id is not null
  )
);

drop trigger if exists bills_set_updated_at on public.bills;
create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();

drop trigger if exists bills_set_current_user_id on public.bills;
create trigger bills_set_current_user_id
  before insert on public.bills
  for each row execute function public.set_current_user_id();

create or replace function public.assert_bill_owner_refs()
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

  if new.category_id is not null and not exists (
    select 1 from public.categories
    where id = new.category_id and user_id = new.user_id and is_deleted = false
  ) then
    raise exception 'category_id does not belong to the current user';
  end if;

  if new.recurring_id is not null and not exists (
    select 1 from public.recurring_transactions
    where id = new.recurring_id and user_id = new.user_id and is_deleted = false
  ) then
    raise exception 'recurring_id does not belong to the current user';
  end if;

  return new;
end;
$$;

drop trigger if exists bills_assert_owner_refs on public.bills;
create trigger bills_assert_owner_refs
  before insert or update of user_id, wallet_id, category_id, recurring_id on public.bills
  for each row execute function public.assert_bill_owner_refs();

create index if not exists bills_user_id_idx on public.bills (user_id);
create index if not exists bills_user_due_idx
  on public.bills (user_id, due_date)
  where is_deleted = false;
create index if not exists bills_user_status_idx
  on public.bills (user_id, status, due_date)
  where is_deleted = false;
create index if not exists bills_recurring_due_idx
  on public.bills (recurring_id, due_date)
  where recurring_id is not null and is_deleted = false;
create unique index if not exists bills_user_recurring_due_active_uidx
  on public.bills (user_id, recurring_id, due_date)
  where recurring_id is not null and is_deleted = false;

alter table public.bills enable row level security;

drop policy if exists "bills_select_own" on public.bills;
create policy "bills_select_own"
  on public.bills for select
  using (auth.uid() = user_id);

drop policy if exists "bills_insert_own" on public.bills;
create policy "bills_insert_own"
  on public.bills for insert
  with check (auth.uid() = user_id);

drop policy if exists "bills_update_own" on public.bills;
create policy "bills_update_own"
  on public.bills for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "bills_delete_own" on public.bills;
create policy "bills_delete_own"
  on public.bills for delete
  using (auth.uid() = user_id);
