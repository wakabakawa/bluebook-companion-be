-- Content: book editions, generic classification vocabulary, exam sets, items.
-- No question text or answer choices anywhere in this file (BR01).

create schema if not exists app_private;

create table public.edition (
  id        int  primary key,
  title     text not null,
  is_active boolean not null default true
);

create table public.classification (
  id              smallint primary key,
  code            text not null unique,
  label           text not null,
  is_hierarchical boolean not null default false
);

create table public.classification_value (
  id                 bigint generated always as identity primary key,
  classification_id  smallint not null references public.classification(id),
  parent_id          bigint references public.classification_value(id),
  code               text not null,
  label              text not null,
  ref_seconds        int check (ref_seconds between 1 and 600),
  sort_order         int not null default 0,
  unique (classification_id, code)
);

create table public.exam_set (
  id                uuid primary key default gen_random_uuid(),
  edition_id        int  not null references public.edition(id),
  set_name          text not null,
  subject_value_id  bigint not null references public.classification_value(id),
  branch_value_id   bigint not null references public.classification_value(id),
  item_count        smallint not null check (item_count between 1 and 200),
  allotment_seconds int not null check (allotment_seconds > 0),
  published_at      timestamptz,
  unique (edition_id, set_name, branch_value_id)
);

create table public.item (
  id                       uuid primary key default gen_random_uuid(),
  edition_id               int  not null references public.edition(id),
  exam_set_id              uuid references public.exam_set(id),
  position                 smallint,
  subject_value_id         bigint not null references public.classification_value(id),
  branch_value_id          bigint not null references public.classification_value(id),
  topic_value_id           bigint not null references public.classification_value(id),
  key_concept_value_id     bigint references public.classification_value(id),
  cognitive_skill_value_id bigint references public.classification_value(id),
  difficulty_value_id      bigint not null references public.classification_value(id),
  book_page                int,
  ref_seconds_override     int check (ref_seconds_override between 1 and 600),
  constraint item_set_position check ((exam_set_id is null) = (position is null)),
  unique (exam_set_id, position)
);

create index on public.item (edition_id, topic_value_id);
create index on public.item (exam_set_id, position);

-- RLS: authenticated students read everything here except unpublished item rows;
-- admins (app_metadata.role = 'admin') get full read/write. anon gets nothing.

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

alter table public.edition               enable row level security;
alter table public.classification        enable row level security;
alter table public.classification_value  enable row level security;
alter table public.exam_set              enable row level security;
alter table public.item                  enable row level security;

create policy read_edition on public.edition              for select to authenticated using (true);
create policy read_class   on public.classification       for select to authenticated using (true);
create policy read_value   on public.classification_value for select to authenticated using (true);
create policy read_set     on public.exam_set             for select to authenticated using (true);

-- BR12: item-level tags only for sets whose answer key is published
create policy read_item on public.item for select to authenticated
using (exists (
  select 1 from public.exam_set es
  where es.id = item.exam_set_id and es.published_at is not null
));

create policy admin_edition on public.edition for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin_class on public.classification for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin_value on public.classification_value for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin_set on public.exam_set for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin_item on public.item for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.edition, public.classification, public.classification_value,
                public.exam_set, public.item to authenticated;
