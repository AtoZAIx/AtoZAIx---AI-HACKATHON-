-- Immutable security ledger (target schema; not applied in this project yet).
-- Mirrors src/lib/nexus/security/ledger.ts: hash-chained, append-only records.

create table if not exists public.security_ledger (
  seq         bigint primary key,
  at          timestamptz not null default now(),
  kind        text not null check (kind in ('security-event', 'risk-decision', 'trust-event')),
  data        jsonb not null,
  prev_hash   char(64) not null,
  hash        char(64) not null unique
);

create index if not exists security_ledger_kind_at on public.security_ledger (kind, at desc);

alter table public.security_ledger enable row level security;

-- Only the server (service role) may write, and only by inserting.
revoke all on public.security_ledger from anon, authenticated;
grant select, insert on public.security_ledger to service_role;
revoke update, delete, truncate on public.security_ledger from service_role;

create policy security_ledger_insert on public.security_ledger
  for insert to service_role with check (true);
create policy security_ledger_read on public.security_ledger
  for select to service_role using (true);

-- Belt and braces: block updates and deletes even for table owners.
create or replace function public.security_ledger_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'security_ledger is append-only';
end;
$$;

drop trigger if exists security_ledger_no_update on public.security_ledger;
create trigger security_ledger_no_update before update or delete on public.security_ledger
  for each row execute function public.security_ledger_immutable();
