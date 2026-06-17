alter table public.bills
  add column if not exists generated_occurrence_date date;

update public.bills
set generated_occurrence_date = due_date
where is_recurring = true
  and recurring_id is not null
  and generated_occurrence_date is null;

alter table public.bills
  add column if not exists bill_id uuid generated always as (id) stored;

create index if not exists bills_recurring_occurrence_idx
  on public.bills (recurring_id, generated_occurrence_date)
  where recurring_id is not null and generated_occurrence_date is not null and is_deleted = false;
