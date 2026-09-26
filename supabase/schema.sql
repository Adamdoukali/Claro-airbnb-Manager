-- Claro Airbnb Manager - Supabase schema
-- Run this once in Supabase > SQL Editor (it is idempotent).
--
-- Records are stored as one row per object (id + jsonb "data") so the server can
-- keep a simple document model while everything is queryable in Postgres.
-- All access goes through the server with the service role key; RLS is enabled so
-- the anon/public key can never read anything directly.

create table if not exists public.properties (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.police_registrations (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_logs (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

-- Useful jsonb indexes for the dashboard queries
create index if not exists bookings_property_idx on public.bookings ((data->>'propertyId'));
create index if not exists bookings_checkin_idx on public.bookings ((data->>'checkIn'));
create index if not exists police_registrations_code_idx on public.police_registrations ((data->>'accessCode'));
create index if not exists police_registrations_property_idx on public.police_registrations ((data->>'propertyId'));

-- Lock everything down: only the service role (used by the server) can access these tables.
alter table public.properties enable row level security;
alter table public.bookings enable row level security;
alter table public.police_registrations enable row level security;
alter table public.sync_logs enable row level security;
alter table public.settings enable row level security;
alter table public.users enable row level security;

-- Private storage bucket for ID scans, signatures and generated PDFs.
-- The server also creates it automatically at startup if it is missing.
insert into storage.buckets (id, name, public)
values ('claro-files', 'claro-files', false)
on conflict (id) do nothing;
