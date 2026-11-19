-- Operations: planner defaults, an empty job queue (no producer yet - BR07 re-scoring
-- is a later milestone, but the shape is locked in now so it's not a later migration),
-- and an append-only audit trail wired to exactly the two privileged write paths that
-- already exist. Deliberately NOT wired to student reads/submissions - a per-profile
-- activity log is exactly the personal-data artefact BR01/NFR01 exist to prevent.

create table public.planner_config (
  edition_id              int primary key references public.edition(id),
  budget_min              int      not null default 120 check (budget_min between 1 and 600),
  min_strong              smallint not null default 1   check (min_strong between 0 and 5),
  strong_threshold        numeric(4, 3) not null default 0.800 check (strong_threshold between 0 and 1),
  min_items               smallint not null default 3   check (min_items between 1 and 50),
  prior_strength          numeric(5, 2) not null default 2.00 check (prior_strength > 0 and prior_strength <= 50),
  default_prior           numeric(4, 3) not null default 0.500 check (default_prior between 0 and 1),
  recency_weight          numeric(4, 2) not null default 0.50 check (recency_weight between 0 and 5),
  half_life_days          numeric(6, 2) not null default 7.00 check (half_life_days > 0 and half_life_days <= 365),
  review_factor           numeric(4, 2) not null default 2.00 check (review_factor > 0 and review_factor <= 10),
  cohort_min_attempts     int not null default 30 check (cohort_min_attempts >= 1),
  reveal_key_after_submit boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.engine_job (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('rescore_exam_set', 'refresh_statistics')),
  payload    jsonb not null default '{}'::jsonb,
  status     text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts   smallint not null default 0,
  run_after  timestamptz not null default now(),
  locked_at  timestamptz,
  locked_by  text,
  last_error text,
  created_at timestamptz not null default now()
);

create index engine_job_ready on public.engine_job (run_after, id) where status = 'queued';

create table public.audit_record (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor        uuid,
  action       text not null,
  object_table text not null,
  object_id    text not null,
  detail       jsonb not null default '{}'::jsonb
);

revoke update, delete, truncate on public.audit_record from public, anon, authenticated, service_role;

create or replace function public.audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_record is append-only';
end
$$;

create trigger audit_no_change
  before update or delete on public.audit_record
  for each row execute function public.audit_immutable();

alter table public.planner_config enable row level security;
alter table public.engine_job     enable row level security;
alter table public.audit_record   enable row level security;

create policy read_config  on public.planner_config for select to authenticated using (true);
create policy admin_config on public.planner_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy admin_jobs on public.engine_job for select to authenticated using (public.is_admin());

create policy admin_audit_read on public.audit_record for select to authenticated using (public.is_admin());
-- No INSERT/UPDATE/DELETE policy for any interactive role: writes happen via triggers
-- on the two privileged tables (wired in the functions migration), owned by definer functions.

grant select on public.planner_config to authenticated;
grant select on public.engine_job, public.audit_record to authenticated; -- still gated by is_admin()
