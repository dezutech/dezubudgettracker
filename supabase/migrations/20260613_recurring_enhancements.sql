-- ============================================================
-- Migration: Recurring Transaction Enhancements
-- Adds: status, end_condition, end_date, max_occurrences, occurrences_count
-- ============================================================

-- Add new columns (idempotent via IF NOT EXISTS)
alter table public.recurring_transactions
  add column if not exists status text not null default 'active',
  add column if not exists end_condition text not null default 'forever',
  add column if not exists end_date date,
  add column if not exists max_occurrences integer,
  add column if not exists occurrences_count integer not null default 0;

-- Add check constraints (drop first to allow re-running the migration)
alter table public.recurring_transactions
  drop constraint if exists recurring_transactions_status_check;
alter table public.recurring_transactions
  add constraint recurring_transactions_status_check
    check (status in ('active', 'paused', 'completed'));

alter table public.recurring_transactions
  drop constraint if exists recurring_transactions_end_condition_check;
alter table public.recurring_transactions
  add constraint recurring_transactions_end_condition_check
    check (end_condition in ('forever', 'end_date', 'occurrences'));

alter table public.recurring_transactions
  drop constraint if exists recurring_transactions_occurrences_count_non_negative;
alter table public.recurring_transactions
  add constraint recurring_transactions_occurrences_count_non_negative
    check (occurrences_count >= 0);

alter table public.recurring_transactions
  drop constraint if exists recurring_transactions_max_occurrences_positive;
alter table public.recurring_transactions
  add constraint recurring_transactions_max_occurrences_positive
    check (max_occurrences is null or max_occurrences > 0);

-- Back-fill: set status from existing is_active values so old rows are consistent
update public.recurring_transactions
  set status = case when is_active then 'active' else 'paused' end
  where status = 'active' and is_active = false;

-- Drop the old partial index (it was scoped to is_active = true only)
drop index if exists public.recurring_transactions_due_idx;

-- New index: scope to status = 'active' so completed/paused rows are excluded
create index if not exists recurring_transactions_active_due_idx
  on public.recurring_transactions (user_id, next_run_date)
  where status = 'active' and is_deleted = false;

-- Index for filtering by status
create index if not exists recurring_transactions_status_idx
  on public.recurring_transactions (user_id, status)
  where is_deleted = false;
