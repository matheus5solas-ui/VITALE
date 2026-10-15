create table public.facial_unmatched_events (device_serial text not null,log_id bigint not null,user_id bigint not null,occurred_at timestamptz not null,reason text not null,received_at timestamptz not null default now(),primary key(device_serial,log_id));
alter table public.facial_unmatched_events enable row level security;
revoke all on public.facial_unmatched_events from anon,authenticated;
grant select,insert,update on public.facial_unmatched_events to service_role;