-- Confidential: answer keys. SEC-08/SEC-09/SEC-11.
-- Four independent layers block client access: (1) app_private is not in Supabase's
-- "Exposed schemas" setting, so PostgREST won't route to it at all; (2) no USAGE grant
-- on the schema; (3) no table grants; (4) RLS enabled with zero permissive policies.
-- All four would have to be removed, in separate migrations, for a leak.

create table app_private.answer_key_version (
  id           uuid primary key default gen_random_uuid(),
  exam_set_id  uuid not null references public.exam_set(id),
  version_no   int  not null,
  status       text not null check (status in ('draft', 'published', 'superseded')),
  published_at timestamptz,
  note         text,
  created_by   uuid,
  unique (exam_set_id, version_no)
);

create unique index answer_key_one_published_per_set
  on app_private.answer_key_version (exam_set_id) where status = 'published';

create table app_private.answer_key_item (
  answer_key_version_id uuid not null references app_private.answer_key_version(id) on delete cascade,
  item_id               uuid not null references public.item(id),
  correct_choice        char(1) not null check (correct_choice in ('A', 'B', 'C', 'D')),
  primary key (answer_key_version_id, item_id)
);

revoke all on schema app_private from anon, authenticated;
alter default privileges in schema app_private revoke all on tables from anon, authenticated;

alter table app_private.answer_key_version enable row level security;
alter table app_private.answer_key_item    enable row level security;
-- Intentionally zero policies: no role but the table owner and service_role can read these.
