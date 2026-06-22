-- ============================================================
-- Dezu Budget Tracker - Supabase PostgreSQL schema
-- ============================================================
-- Run in the Supabase SQL Editor or with:
--   supabase db push
--
-- This schema is optimized for Supabase Auth, offline-first sync,
-- soft deletes, and per-user Row Level Security.

create extension if not exists pgcrypto;

-- ---------- Shared helpers ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_current_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null then
    new.user_id = auth.uid();
  end if;

  return new;
end;
$$;

-- ---------- Tables ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  base_currency text not null default 'PHP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  is_deleted boolean not null default false,
  constraint profiles_base_currency_check check (base_currency in ('PHP', 'USD', 'JPY', 'EUR', 'GBP', 'SGD', 'HKD', 'AUD', 'CAD'))
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  balance numeric(14, 2) not null default 0,
  credit_limit numeric(14, 2),
  color text,
  icon text,
  logo_url text,
  logo_path text,
  account_name text,
  account_number text,
  bank_name text,
  mobile_number text,
  qr_code_url text,
  qr_code_path text,
  qr_code_file_name text,
  qr_code_mime_type text,
  qr_code_size integer,
  local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  is_deleted boolean not null default false,
  constraint wallets_name_not_blank check (length(btrim(name)) > 0),
  constraint wallets_type_not_blank check (length(btrim(type)) > 0),
  constraint wallets_credit_limit_non_negative check (credit_limit is null or credit_limit >= 0)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  icon text,
  color text,
  is_default boolean not null default false,
  local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  is_deleted boolean not null default false,
  constraint categories_name_not_blank check (length(btrim(name)) > 0),
  constraint categories_type_check check (type in ('income', 'expense'))
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  destination_wallet_id uuid references public.wallets(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  amount numeric(14, 2) not null,
  transaction_type text not null,
  description text,
  notes text,
  transaction_date date not null,
  receipt_url text,
  receipt_path text,
  receipt_file_name text,
  receipt_mime_type text,
  receipt_size integer,
  local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  is_deleted boolean not null default false,
  constraint transactions_amount_positive check (amount > 0),
  constraint transactions_type_check check (transaction_type in ('income', 'expense', 'transfer'))
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric(14, 2) not null,
  month date not null,
  local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  is_deleted boolean not null default false,
  constraint budgets_amount_non_negative check (amount >= 0),
  constraint budgets_month_first_day check (extract(day from month) = 1)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14, 2) not null,
  current_amount numeric(14, 2) not null default 0,
  wallet_id uuid references public.wallets(id) on delete set null,
  target_date date,
  status text not null default 'active',
  icon text,
  color text,
  notes text,
  local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  is_deleted boolean not null default false,
  constraint goals_name_not_blank check (length(btrim(name)) > 0),
  constraint goals_target_amount_positive check (target_amount > 0),
  constraint goals_current_amount_non_negative check (current_amount >= 0),
  constraint goals_status_check check (status in ('active', 'completed', 'paused', 'cancelled'))
);

alter table public.transactions
  add column if not exists goal_id uuid references public.goals(id) on delete set null;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null,
  is_read boolean not null default false,
  local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  is_deleted boolean not null default false,
  constraint notifications_title_not_blank check (length(btrim(title)) > 0),
  constraint notifications_type_not_blank check (length(btrim(notification_type)) > 0)
);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  title text not null,
  amount numeric(14, 2) not null,
  transaction_type text not null default 'expense',
  frequency text not null,
  next_run_date date not null,
  is_active boolean not null default true,
  status text not null default 'active',
  end_condition text not null default 'forever',
  end_date date,
  max_occurrences integer,
  occurrences_count integer not null default 0,
  local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  is_deleted boolean not null default false,
  constraint recurring_transactions_title_not_blank check (length(btrim(title)) > 0),
  constraint recurring_transactions_amount_positive check (amount > 0),
  constraint recurring_transactions_type_check check (transaction_type in ('income', 'expense')),
  constraint recurring_transactions_frequency_check check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  constraint recurring_transactions_status_check check (status in ('active', 'paused', 'completed')),
  constraint recurring_transactions_end_condition_check check (end_condition in ('forever', 'end_date', 'occurrences')),
  constraint recurring_transactions_occurrences_count_non_negative check (occurrences_count >= 0),
  constraint recurring_transactions_max_occurrences_positive check (max_occurrences is null or max_occurrences > 0)
);

-- For existing Supabase instances: add columns if they don't exist yet.
alter table public.recurring_transactions
  add column if not exists status text not null default 'active';
alter table public.recurring_transactions
  add column if not exists end_condition text not null default 'forever';
alter table public.recurring_transactions
  add column if not exists end_date date;
alter table public.recurring_transactions
  add column if not exists max_occurrences integer;
alter table public.recurring_transactions
  add column if not exists occurrences_count integer not null default 0;

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
  generated_occurrence_date date,
  bill_id uuid generated always as (id) stored,
  receipt_url text,
  receipt_path text,
  receipt_file_name text,
  receipt_mime_type text,
  receipt_size integer,
  local_id text,
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

-- ---------- Updated-at and owner triggers ----------

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

drop trigger if exists notifications_set_updated_at on public.notifications;
create trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

drop trigger if exists recurring_transactions_set_updated_at on public.recurring_transactions;
create trigger recurring_transactions_set_updated_at
  before update on public.recurring_transactions
  for each row execute function public.set_updated_at();

drop trigger if exists bills_set_updated_at on public.bills;
create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();

drop trigger if exists wallets_set_current_user_id on public.wallets;
create trigger wallets_set_current_user_id
  before insert on public.wallets
  for each row execute function public.set_current_user_id();

drop trigger if exists categories_set_current_user_id on public.categories;
create trigger categories_set_current_user_id
  before insert on public.categories
  for each row execute function public.set_current_user_id();

drop trigger if exists transactions_set_current_user_id on public.transactions;
create trigger transactions_set_current_user_id
  before insert on public.transactions
  for each row execute function public.set_current_user_id();

drop trigger if exists budgets_set_current_user_id on public.budgets;
create trigger budgets_set_current_user_id
  before insert on public.budgets
  for each row execute function public.set_current_user_id();

drop trigger if exists goals_set_current_user_id on public.goals;
create trigger goals_set_current_user_id
  before insert on public.goals
  for each row execute function public.set_current_user_id();

drop trigger if exists notifications_set_current_user_id on public.notifications;
create trigger notifications_set_current_user_id
  before insert on public.notifications
  for each row execute function public.set_current_user_id();

drop trigger if exists recurring_transactions_set_current_user_id on public.recurring_transactions;
create trigger recurring_transactions_set_current_user_id
  before insert on public.recurring_transactions
  for each row execute function public.set_current_user_id();

drop trigger if exists bills_set_current_user_id on public.bills;
create trigger bills_set_current_user_id
  before insert on public.bills
  for each row execute function public.set_current_user_id();

-- ---------- Profile creation from Supabase Auth ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Foreign key ownership guards ----------
-- RLS protects reads/writes, but these triggers prevent a user from attaching
-- a row to another user's wallet/category via known UUIDs.

create or replace function public.assert_transaction_owner_refs()
returns trigger
language plpgsql
as $$
begin
  if not exists (
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

  if new.destination_wallet_id is not null and not exists (
    select 1 from public.wallets
    where id = new.destination_wallet_id and user_id = new.user_id and is_deleted = false
  ) then
    raise exception 'destination_wallet_id does not belong to the current user';
  end if;

  if new.goal_id is not null and not exists (
    select 1 from public.goals
    where id = new.goal_id and user_id = new.user_id and is_deleted = false
  ) then
    raise exception 'goal_id does not belong to the current user';
  end if;

  return new;
end;
$$;

create or replace function public.assert_goal_owner_refs()
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

create or replace function public.assert_budget_owner_refs()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.categories
    where id = new.category_id and user_id = new.user_id and is_deleted = false
  ) then
    raise exception 'category_id does not belong to the current user';
  end if;

  return new;
end;
$$;

create or replace function public.assert_recurring_transaction_owner_refs()
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

  return new;
end;
$$;

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

drop trigger if exists transactions_assert_owner_refs on public.transactions;
create trigger transactions_assert_owner_refs
  before insert or update of user_id, wallet_id, category_id, destination_wallet_id, goal_id on public.transactions
  for each row execute function public.assert_transaction_owner_refs();

create or replace function public.apply_transaction_wallet_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_delta numeric(14, 2);
begin
  -- Offline sync uploads wallet balances that already include local transactions.
  -- Those sync payloads are marked with local_id + synced_at, so do not replay them.
  if tg_op = 'INSERT' and new.local_id is not null and new.synced_at is not null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.local_id is not null
    and new.synced_at is distinct from old.synced_at then
    return new;
  end if;

  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    if old.is_deleted = false then
      source_delta := case old.transaction_type
        when 'income' then -old.amount
        when 'expense' then old.amount
        when 'transfer' then old.amount
        else 0
      end;

      update public.wallets
      set balance = balance + source_delta
      where id = old.wallet_id
        and user_id = old.user_id
        and is_deleted = false;

      if old.transaction_type = 'transfer' and old.destination_wallet_id is not null then
        update public.wallets
        set balance = balance - old.amount
        where id = old.destination_wallet_id
          and user_id = old.user_id
          and is_deleted = false;
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.is_deleted = false then
      source_delta := case new.transaction_type
        when 'income' then new.amount
        when 'expense' then -new.amount
        when 'transfer' then -new.amount
        else 0
      end;

      update public.wallets
      set balance = balance + source_delta
      where id = new.wallet_id
        and user_id = new.user_id
        and is_deleted = false;

      if new.transaction_type = 'transfer' and new.destination_wallet_id is not null then
        update public.wallets
        set balance = balance + new.amount
        where id = new.destination_wallet_id
          and user_id = new.user_id
          and is_deleted = false;
      end if;
    end if;

    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists transactions_apply_wallet_balance on public.transactions;
create trigger transactions_apply_wallet_balance
  after insert or update or delete on public.transactions
  for each row execute function public.apply_transaction_wallet_balance();

drop trigger if exists goals_assert_owner_refs on public.goals;
create trigger goals_assert_owner_refs
  before insert or update of user_id, wallet_id on public.goals
  for each row execute function public.assert_goal_owner_refs();

drop trigger if exists budgets_assert_owner_refs on public.budgets;
create trigger budgets_assert_owner_refs
  before insert or update of user_id, category_id on public.budgets
  for each row execute function public.assert_budget_owner_refs();

drop trigger if exists recurring_transactions_assert_owner_refs on public.recurring_transactions;
create trigger recurring_transactions_assert_owner_refs
  before insert or update of user_id, wallet_id, category_id on public.recurring_transactions
  for each row execute function public.assert_recurring_transaction_owner_refs();

drop trigger if exists bills_assert_owner_refs on public.bills;
create trigger bills_assert_owner_refs
  before insert or update of user_id, wallet_id, category_id, recurring_id on public.bills
  for each row execute function public.assert_bill_owner_refs();

-- ---------- Indexes ----------

create index if not exists wallets_user_id_idx on public.wallets (user_id);
create index if not exists wallets_user_active_idx on public.wallets (user_id, updated_at desc) where is_deleted = false;
create unique index if not exists wallets_user_local_id_uidx
  on public.wallets (user_id, local_id)
  where local_id is not null and is_deleted = false;

create index if not exists categories_user_id_idx on public.categories (user_id);
create index if not exists categories_user_type_idx on public.categories (user_id, type) where is_deleted = false;
create unique index if not exists categories_user_name_type_active_uidx
  on public.categories (user_id, lower(name), type)
  where is_deleted = false;
create unique index if not exists categories_user_local_id_uidx
  on public.categories (user_id, local_id)
  where local_id is not null and is_deleted = false;

create index if not exists transactions_user_id_idx on public.transactions (user_id);
create index if not exists transactions_user_date_idx on public.transactions (user_id, transaction_date desc) where is_deleted = false;
create index if not exists transactions_wallet_date_idx on public.transactions (wallet_id, transaction_date desc) where is_deleted = false;
create index if not exists transactions_destination_wallet_date_idx on public.transactions (destination_wallet_id, transaction_date desc) where is_deleted = false;
create index if not exists transactions_goal_id_idx on public.transactions (goal_id, transaction_date desc) where is_deleted = false;
create index if not exists transactions_category_date_idx on public.transactions (category_id, transaction_date desc) where is_deleted = false;
create index if not exists transactions_sync_idx on public.transactions (user_id, updated_at desc, synced_at) where is_deleted = false;
create unique index if not exists transactions_user_local_id_uidx
  on public.transactions (user_id, local_id)
  where local_id is not null and is_deleted = false;

create index if not exists budgets_user_id_idx on public.budgets (user_id);
create index if not exists budgets_user_month_idx on public.budgets (user_id, month desc) where is_deleted = false;
create unique index if not exists budgets_user_category_month_active_uidx
  on public.budgets (user_id, category_id, month)
  where is_deleted = false;
create unique index if not exists budgets_user_local_id_uidx
  on public.budgets (user_id, local_id)
  where local_id is not null and is_deleted = false;

create index if not exists goals_user_id_idx on public.goals (user_id);
create index if not exists goals_user_status_idx on public.goals (user_id, status) where is_deleted = false;
create index if not exists goals_target_date_idx on public.goals (user_id, target_date) where is_deleted = false;
create unique index if not exists goals_user_local_id_uidx
  on public.goals (user_id, local_id)
  where local_id is not null and is_deleted = false;

create index if not exists notifications_user_id_idx on public.notifications (user_id);
create index if not exists notifications_user_unread_idx on public.notifications (user_id, created_at desc) where is_read = false and is_deleted = false;
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc) where is_deleted = false;

create index if not exists recurring_transactions_user_id_idx on public.recurring_transactions (user_id);
-- Legacy index kept for backwards compat; new code filters on status instead.
create index if not exists recurring_transactions_due_idx
  on public.recurring_transactions (user_id, next_run_date)
  where is_active = true and is_deleted = false;
create index if not exists recurring_transactions_active_due_idx
  on public.recurring_transactions (user_id, next_run_date)
  where status = 'active' and is_deleted = false;
create index if not exists recurring_transactions_status_idx
  on public.recurring_transactions (user_id, status)
  where is_deleted = false;
create unique index if not exists recurring_transactions_user_local_id_uidx
  on public.recurring_transactions (user_id, local_id)
  where local_id is not null and is_deleted = false;

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
create index if not exists bills_recurring_occurrence_idx
  on public.bills (recurring_id, generated_occurrence_date)
  where recurring_id is not null and generated_occurrence_date is not null and is_deleted = false;
create unique index if not exists bills_user_recurring_due_active_uidx
  on public.bills (user_id, recurring_id, due_date)
  where recurring_id is not null and is_deleted = false;
create unique index if not exists bills_user_local_id_uidx
  on public.bills (user_id, local_id)
  where local_id is not null and is_deleted = false;

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.goals enable row level security;
alter table public.notifications enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.bills enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  using (auth.uid() = id);

drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own"
  on public.wallets for select
  using (auth.uid() = user_id);

drop policy if exists "wallets_insert_own" on public.wallets;
create policy "wallets_insert_own"
  on public.wallets for insert
  with check (auth.uid() = user_id);

drop policy if exists "wallets_update_own" on public.wallets;
create policy "wallets_update_own"
  on public.wallets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "wallets_delete_own" on public.wallets;
create policy "wallets_delete_own"
  on public.wallets for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wallet-logos',
  'wallet-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wallet_logos_select_public" on storage.objects;
create policy "wallet_logos_select_public"
  on storage.objects for select
  using (bucket_id = 'wallet-logos');

drop policy if exists "wallet_logos_insert_own_folder" on storage.objects;
create policy "wallet_logos_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'wallet-logos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallet_logos_update_own_folder" on storage.objects;
create policy "wallet_logos_update_own_folder"
  on storage.objects for update
  using (
    bucket_id = 'wallet-logos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'wallet-logos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallet_logos_delete_own_folder" on storage.objects;
create policy "wallet_logos_delete_own_folder"
  on storage.objects for delete
  using (
    bucket_id = 'wallet-logos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wallet-assets',
  'wallet-assets',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wallet_assets_select_own_folder" on storage.objects;
create policy "wallet_assets_select_own_folder"
  on storage.objects for select
  using (
    bucket_id = 'wallet-assets'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallet_assets_insert_own_folder" on storage.objects;
create policy "wallet_assets_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'wallet-assets'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallet_assets_update_own_folder" on storage.objects;
create policy "wallet_assets_update_own_folder"
  on storage.objects for update
  using (
    bucket_id = 'wallet-assets'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'wallet-assets'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallet_assets_delete_own_folder" on storage.objects;
create policy "wallet_assets_delete_own_folder"
  on storage.objects for delete
  using (
    bucket_id = 'wallet-assets'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipts_select_public" on storage.objects;
create policy "receipts_select_public"
  on storage.objects for select
  using (bucket_id = 'receipts');

drop policy if exists "receipts_insert_own_folder" on storage.objects;
create policy "receipts_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipts_update_own_folder" on storage.objects;
create policy "receipts_update_own_folder"
  on storage.objects for update
  using (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipts_delete_own_folder" on storage.objects;
create policy "receipts_delete_own_folder"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own"
  on public.categories for select
  using (auth.uid() = user_id);

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own"
  on public.categories for insert
  with check (auth.uid() = user_id);

drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own"
  on public.categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own"
  on public.categories for delete
  using (auth.uid() = user_id);

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
  on public.transactions for select
  using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own"
  on public.transactions for insert
  with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own"
  on public.transactions for delete
  using (auth.uid() = user_id);

drop policy if exists "budgets_select_own" on public.budgets;
create policy "budgets_select_own"
  on public.budgets for select
  using (auth.uid() = user_id);

drop policy if exists "budgets_insert_own" on public.budgets;
create policy "budgets_insert_own"
  on public.budgets for insert
  with check (auth.uid() = user_id);

drop policy if exists "budgets_update_own" on public.budgets;
create policy "budgets_update_own"
  on public.budgets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "budgets_delete_own" on public.budgets;
create policy "budgets_delete_own"
  on public.budgets for delete
  using (auth.uid() = user_id);

drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own"
  on public.goals for select
  using (auth.uid() = user_id);

drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own"
  on public.goals for insert
  with check (auth.uid() = user_id);

drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own"
  on public.goals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own"
  on public.goals for delete
  using (auth.uid() = user_id);

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own"
  on public.notifications for insert
  with check (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  using (auth.uid() = user_id);

drop policy if exists "recurring_transactions_select_own" on public.recurring_transactions;
create policy "recurring_transactions_select_own"
  on public.recurring_transactions for select
  using (auth.uid() = user_id);

drop policy if exists "recurring_transactions_insert_own" on public.recurring_transactions;
create policy "recurring_transactions_insert_own"
  on public.recurring_transactions for insert
  with check (auth.uid() = user_id);

drop policy if exists "recurring_transactions_update_own" on public.recurring_transactions;
create policy "recurring_transactions_update_own"
  on public.recurring_transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "recurring_transactions_delete_own" on public.recurring_transactions;
create policy "recurring_transactions_delete_own"
  on public.recurring_transactions for delete
  using (auth.uid() = user_id);

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
