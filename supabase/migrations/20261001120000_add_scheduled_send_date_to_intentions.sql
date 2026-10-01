-- Ministers can schedule a DRAFT request to be auto-submitted on a given date.
-- A cron job (app/api/cron/send-scheduled-requests) moves due drafts to PENDING.
alter table public.budget_intentions
  add column scheduled_send_date date;

-- Only drafts may carry a schedule; clearing happens when the request is submitted/cancelled.
alter table public.budget_intentions
  add constraint budget_intentions_scheduled_only_draft
  check (scheduled_send_date is null or status = 'DRAFT');

create index budget_intentions_scheduled_due_idx
  on public.budget_intentions (scheduled_send_date)
  where status = 'DRAFT' and scheduled_send_date is not null;
