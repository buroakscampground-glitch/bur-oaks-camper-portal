alter table public.invoices
  add column if not exists ach_expected_date date;

comment on column public.invoices.ach_expected_date is
  'Estimated ACH completion date calculated from the Stripe processing event; cleared when the payment resolves.';
