-- Lumen schema export
-- PostgreSQL 17 / Supabase. Row level security is enabled on every table.
-- No policies are generated: the anon and authenticated roles can read or
-- write nothing until you add policies (see docs/SUPABASE.md).
-- Prefer Supabase Auth for login; treat app users tables as profiles, not
-- password stores.

create table public.items (
  id uuid default gen_random_uuid() not null,
  title text default 'it''s \ ok' not null,
  qty bigint default -9223372036854775808,
  price numeric(12,2) default -10.50,
  rate numeric(5,0),
  active boolean default true not null,
  flag boolean default false,
  born date default '2026-01-02',
  seen date default current_date,
  created_at timestamptz default now() not null,
  token uuid,
  meta jsonb,
  status text default 'draft' not null,
  note text,
  constraint items_pkey primary key (id),
  constraint items_title_key unique (title),
  constraint items_status_born_key unique (status, born),
  constraint items_status_check check (status in ('draft', 'live', 'it''s'))
);

comment on table public.items is 'สินค้า ''ทดสอบ''';
comment on column public.items.id is 'รหัส';
comment on column public.items.title is 'ชื่อสินค้า';

alter table public.items enable row level security;
