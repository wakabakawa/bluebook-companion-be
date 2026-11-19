-- Cohort statistics: raw tables (admin-only) feeding published projection tables
-- (safe for every authenticated reader by construction). BR08/BR09 gating lives in
-- which rows get published, not in a CASE a client could bypass - a missing row
-- just means "not released yet", which fails closed.

create table public.item_statistics (
  item_id        uuid primary key references public.item(id) on delete cascade,
  answered_count int not null default 0,
  correct_count  int not null default 0,
  avg_seconds    numeric(6, 2),
  refreshed_at   timestamptz not null default now(),
  check (correct_count <= answered_count)
);

create table public.exam_set_statistics (
  exam_set_id       uuid primary key references public.exam_set(id) on delete cascade,
  attempts_count    int not null default 0,
  distinct_profiles int not null default 0,
  released_at       timestamptz, -- BR09: set once, never cleared (sticky)
  refreshed_at      timestamptz not null default now()
);

create table public.topic_catalog (
  edition_id     int not null references public.edition(id),
  topic_value_id bigint not null references public.classification_value(id),
  topic_id       text not null,
  topic_label    text not null,
  subject_label  text not null,
  branch_label   text not null,
  items_in_book  int  not null check (items_in_book >= 1),
  ref_seconds    int  not null check (ref_seconds between 1 and 600),
  book_page_ref  int,
  primary key (edition_id, topic_value_id)
);

create table public.topic_cohort (
  edition_id       int not null references public.edition(id),
  topic_value_id   bigint not null references public.classification_value(id),
  cohort_mastery   numeric(7, 6) not null check (cohort_mastery between 0 and 1),
  based_on_answers int not null,
  released_at      timestamptz not null default now(),
  primary key (edition_id, topic_value_id)
);

alter table public.item_statistics     enable row level security;
alter table public.exam_set_statistics enable row level security;
alter table public.topic_catalog       enable row level security;
alter table public.topic_cohort        enable row level security;

create policy admin_item_stats on public.item_statistics     for select to authenticated using (public.is_admin());
create policy admin_set_stats  on public.exam_set_statistics for select to authenticated using (public.is_admin());

create policy read_catalog on public.topic_catalog for select to authenticated using (true);
create policy read_cohort  on public.topic_cohort  for select to authenticated using (true);
create policy admin_catalog on public.topic_catalog for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin_cohort on public.topic_cohort for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.item_statistics, public.exam_set_statistics to authenticated; -- still gated by is_admin()
grant select on public.topic_catalog, public.topic_cohort to authenticated;
