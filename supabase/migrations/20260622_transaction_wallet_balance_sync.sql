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
  for each row
  execute function public.apply_transaction_wallet_balance();
