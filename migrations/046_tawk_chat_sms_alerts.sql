create table if not exists public.tawk_webhook_events (
  event_id text primary key,
  event_type text not null,
  chat_id text,
  received_at timestamptz not null default now(),
  sms_sent_at timestamptz,
  provider_message_id text
);

alter table public.tawk_webhook_events enable row level security;

revoke all on table public.tawk_webhook_events from anon, authenticated;
grant select, insert, update, delete on table public.tawk_webhook_events to service_role;

create index if not exists tawk_webhook_events_received_at_idx
  on public.tawk_webhook_events (received_at desc);

comment on table public.tawk_webhook_events is
  'Private webhook delivery ledger used to prevent duplicate live-chat SMS alerts.';
