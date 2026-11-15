-- Vite Studio schema export
-- PostgreSQL 17 / Supabase. Row level security is enabled on every table.
-- No policies are generated: the anon and authenticated roles can read or
-- write nothing until you add policies (see docs/SUPABASE.md).
-- Prefer Supabase Auth for login; treat app users tables as profiles, not
-- password stores.

create table public.memberships (
  user_id uuid not null,
  team_id uuid not null,
  role text not null,
  invited_by uuid,
  constraint memberships_pkey primary key (user_id, team_id),
  constraint memberships_role_invited_by_key unique (role, invited_by)
);

create table public.teams (
  id uuid default gen_random_uuid() not null,
  role text not null,
  constraint teams_pkey primary key (id),
  constraint teams_role_key unique (role)
);

create table public.users (
  id uuid default gen_random_uuid() not null,
  constraint users_pkey primary key (id)
);

alter table public.memberships add constraint memberships_user_id_fkey foreign key (user_id) references public.users (id) on delete cascade;
alter table public.memberships add constraint memberships_team_id_fkey foreign key (team_id) references public.teams (id) on delete cascade;
alter table public.memberships add constraint memberships_invited_by_fkey foreign key (invited_by) references public.users (id) on delete set null;
alter table public.memberships add constraint memberships_role_fkey foreign key (role) references public.teams (role) on delete restrict;

create index memberships_team_id_idx on public.memberships (team_id);
create index memberships_invited_by_idx on public.memberships (invited_by);

alter table public.memberships enable row level security;
alter table public.teams enable row level security;
alter table public.users enable row level security;
