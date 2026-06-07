alter table public.wallets
  add column if not exists local_id text;

alter table public.categories
  add column if not exists local_id text;

alter table public.transactions
  add column if not exists local_id text;

alter table public.budgets
  add column if not exists local_id text;

alter table public.goals
  add column if not exists local_id text;

alter table public.recurring_transactions
  add column if not exists local_id text;

alter table public.bills
  add column if not exists local_id text;

alter table public.notifications
  add column if not exists local_id text;

create unique index if not exists wallets_user_local_id_uidx
  on public.wallets (user_id, local_id)
  where local_id is not null and is_deleted = false;

create unique index if not exists categories_user_local_id_uidx
  on public.categories (user_id, local_id)
  where local_id is not null and is_deleted = false;

create unique index if not exists transactions_user_local_id_uidx
  on public.transactions (user_id, local_id)
  where local_id is not null and is_deleted = false;

create unique index if not exists budgets_user_local_id_uidx
  on public.budgets (user_id, local_id)
  where local_id is not null and is_deleted = false;

create unique index if not exists goals_user_local_id_uidx
  on public.goals (user_id, local_id)
  where local_id is not null and is_deleted = false;

create unique index if not exists recurring_transactions_user_local_id_uidx
  on public.recurring_transactions (user_id, local_id)
  where local_id is not null and is_deleted = false;

create unique index if not exists bills_user_local_id_uidx
  on public.bills (user_id, local_id)
  where local_id is not null and is_deleted = false;
