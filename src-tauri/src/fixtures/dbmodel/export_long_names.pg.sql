-- Lumen schema export
-- PostgreSQL 17 / Supabase. Row level security is enabled on every table.
-- No policies are generated: the anon and authenticated roles can read or
-- write nothing until you add policies (see docs/SUPABASE.md).
-- Prefer Supabase Auth for login; treat app users tables as profiles, not
-- password stores.

create table public.aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncation_xxxxxx (
  id uuid default gen_random_uuid() not null,
  cccccccccccccccccccccccccccccc_very_long_column_name_yyyyyyyyyy text not null,
  a text not null,
  b text not null,
  a_b text not null,
  ref_id uuid,
  constraint aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_f3e5b5f7 primary key (id),
  constraint aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_cc5354f8 unique (cccccccccccccccccccccccccccccc_very_long_column_name_yyyyyyyyyy),
  constraint aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_117e1726 unique (a, b),
  constraint aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_3eb9eaaa unique (a_b),
  constraint aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_6664d533 check (cccccccccccccccccccccccccccccc_very_long_column_name_yyyyyyyyyy in ('x', 'y'))
);

alter table public.aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncation_xxxxxx add constraint aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_f696a44d foreign key (ref_id) references public.aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncation_xxxxxx (id) on delete cascade;

create index aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_203341b3 on public.aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncation_xxxxxx (ref_id);

alter table public.aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncation_xxxxxx enable row level security;
