-- Target schema for persisting Nexus state in Supabase Postgres.
-- Not wired up yet: the app currently uses the in-memory store in
-- src/lib/nexus/store.ts, whose async API mirrors these tables.

create table if not exists listings (
  id text primary key,                 -- "<merchant>:<product>"
  merchant_id text not null,
  product_id text not null,
  list_price_cents integer not null,
  floor_price_cents integer not null,  -- private: never exposed via RLS
  stock integer not null check (stock >= 0),
  data jsonb not null
);

create table if not exists sessions (
  id text primary key,
  user_id uuid references auth.users (id),
  status text not null,
  negotiation_run integer not null default 0,
  data jsonb not null,                 -- intent, chat, messages, offers, result, agreement
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id text primary key,
  session_id text not null references sessions (id),
  user_id uuid references auth.users (id),
  merchant_id text not null,
  status text not null,
  total_cents integer not null,
  terms_hash char(64) not null,
  paypal_order_id text unique,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_events (
  event_id text primary key,           -- PayPal event id, for idempotency
  received_at timestamptz not null default now()
);

-- Atomic stock reservation used when a deal is locked.
create or replace function reserve_stock(p_listing text, p_qty integer)
returns boolean language sql as $$
  update listings set stock = stock - p_qty where id = p_listing and stock >= p_qty returning true;
$$;

alter table sessions enable row level security;
alter table orders enable row level security;
create policy "own sessions" on sessions for select using (auth.uid() = user_id);
create policy "own orders" on orders for select using (auth.uid() = user_id);
