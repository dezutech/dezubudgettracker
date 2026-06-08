alter table public.transactions
  add column if not exists debt_id uuid references public.debts(id) on delete set null,
  add column if not exists debt_type text,
  add column if not exists person_name text;

alter table public.transactions
  drop constraint if exists transactions_debt_type_check;

alter table public.transactions
  add constraint transactions_debt_type_check
  check (debt_type is null or debt_type in ('i_owe', 'owes_me'));

create index if not exists transactions_debt_id_idx
  on public.transactions (debt_id, transaction_date desc)
  where is_deleted = false;

create or replace function public.assert_transaction_owner_refs()
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

  if new.debt_id is not null and not exists (
    select 1 from public.debts
    where id = new.debt_id and user_id = new.user_id and is_deleted = false
  ) then
    raise exception 'debt_id does not belong to the current user';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_assert_owner_refs on public.transactions;
create trigger transactions_assert_owner_refs
  before insert or update of user_id, wallet_id, category_id, destination_wallet_id, goal_id, debt_id on public.transactions
  for each row execute function public.assert_transaction_owner_refs();
