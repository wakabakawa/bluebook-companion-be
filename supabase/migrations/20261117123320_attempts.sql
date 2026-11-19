-- Attempts: profile, attempt headers, per-item responses.
-- profile_id IS auth.uid() - no separate mapping table, no device-derived identifier (BR04/NFR01).

create table public.local_profile (
  id           uuid primary key references auth.users(id) on delete cascade,
  edition_id   int  not null references public.edition(id),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.attempt (
  id                     uuid primary key,
  profile_id             uuid not null references public.local_profile(id) on delete cascade,
  exam_set_id            uuid not null references public.exam_set(id),
  scored_with_version_id uuid references app_private.answer_key_version(id),
  started_at             timestamptz,
  submitted_at           timestamptz not null default now(),
  total_seconds          int not null check (total_seconds >= 0),
  scored_at              timestamptz,
  unique (id, profile_id)
);

create index on public.attempt (profile_id, submitted_at desc);

create table public.item_response (
  attempt_id      uuid not null,
  profile_id      uuid not null,
  item_id         uuid not null references public.item(id),
  selected_choice char(1) check (selected_choice in ('A', 'B', 'C', 'D')),
  is_correct      boolean,
  flagged         boolean not null default false,
  seconds         int not null default 0 check (seconds >= 0),
  primary key (attempt_id, item_id),
  foreign key (attempt_id, profile_id)
    references public.attempt(id, profile_id) on delete cascade
);

create index on public.item_response (item_id);
create index on public.item_response (profile_id);

alter table public.local_profile enable row level security;
alter table public.attempt       enable row level security;
alter table public.item_response enable row level security;

create policy own_profile_read on public.local_profile for select to authenticated
  using (id = auth.uid());
create policy own_profile_write on public.local_profile for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy own_profile_erase on public.local_profile for delete to authenticated
  using (id = auth.uid());

create policy own_attempt_read on public.attempt for select to authenticated
  using (profile_id = auth.uid());
create policy own_attempt_erase on public.attempt for delete to authenticated
  using (profile_id = auth.uid());

-- No INSERT/UPDATE policy on attempt or item_response for any interactive role: the
-- only writer is the submit_attempt() SECURITY DEFINER function (see functions migration).
-- A student who could insert their own is_correct could fabricate mastery and poison
-- the cohort statistics everyone else's plan depends on.
create policy own_response_read on public.item_response for select to authenticated
  using (profile_id = auth.uid());

grant select, update, delete on public.local_profile to authenticated;
grant select, delete         on public.attempt       to authenticated;
grant select                 on public.item_response to authenticated;
