create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  privy_user_id text unique not null,
  wallet_address text,
  business_name text not null default 'ArcFlow Workspace',
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  slug text unique not null,
  source text not null check (source in ('invoice', 'checkout', 'agent')),
  title text not null,
  description text,
  payer_email text,
  recipient_address text not null,
  amount text not null,
  currency text not null check (currency in ('USDC', 'EURC')),
  settlement_chain_id integer not null default 5042002,
  source_chain_id integer,
  status text not null default 'created' check (status in ('created', 'pending', 'paid', 'failed', 'refunded', 'expired')),
  onchain_intent_id numeric,
  tx_hash text,
  paid_at timestamptz,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_vaults (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  agent_label text not null,
  vault_address text,
  currency text not null check (currency in ('USDC', 'EURC')),
  budget_amount text not null,
  spent_amount text not null default '0',
  single_spend_limit text not null,
  allowed_recipients text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chain_indexer_state (
  chain_id integer primary key,
  last_indexed_block numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.chain_events (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  contract_address text not null,
  event_name text not null,
  block_number numeric not null,
  tx_hash text not null,
  log_index integer not null,
  args jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index)
);

create index if not exists payment_intents_owner_idx on public.payment_intents(owner_id);
create index if not exists payment_intents_slug_idx on public.payment_intents(slug);
create index if not exists payment_intents_status_idx on public.payment_intents(status);
create index if not exists agent_vaults_owner_idx on public.agent_vaults(owner_id);
create index if not exists chain_events_block_idx on public.chain_events(chain_id, block_number);

alter table public.profiles enable row level security;
alter table public.payment_intents enable row level security;
alter table public.agent_vaults enable row level security;
alter table public.chain_indexer_state enable row level security;
alter table public.chain_events enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute procedure public.touch_updated_at();

drop trigger if exists payment_intents_touch_updated_at on public.payment_intents;
create trigger payment_intents_touch_updated_at
before update on public.payment_intents
for each row execute procedure public.touch_updated_at();

drop trigger if exists agent_vaults_touch_updated_at on public.agent_vaults;
create trigger agent_vaults_touch_updated_at
before update on public.agent_vaults
for each row execute procedure public.touch_updated_at();
