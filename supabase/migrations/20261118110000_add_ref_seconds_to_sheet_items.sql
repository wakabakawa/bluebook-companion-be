-- FR17/CC03: expose a real per-item reference time through v_sheet_items so the client can do
-- per-item speed comparisons instead of one flat AppConfig constant (the charter specifies
-- "measured against the reference time configured per subject"). Only joins public.item and
-- public.classification_value, both already granted to authenticated with permissive RLS - no
-- app_private, so this cannot reintroduce the v_sheet_catalog security_invoker permission bug
-- fixed in 20261118090000.

drop view if exists public.v_sheet_items;

create view public.v_sheet_items
with (security_invoker = true) as
select
  i.exam_set_id as sheet_id,
  i.position    as item_no,
  t.code        as topic_id,
  sub.label     as subject,
  br.label      as branch,
  t.label       as topic,
  kc.label      as key_concept,
  cs.label      as cognitive_skill,
  d.label       as difficulty,
  i.book_page,
  -- Same precedence refresh_rollups() already uses for the topic-level rollup (per-item
  -- override, else its difficulty's default, else a 60s hard fallback) - no new business
  -- rule invented here.
  coalesce(i.ref_seconds_override, d.ref_seconds, 60) as ref_seconds
from public.item i
join public.classification_value sub on sub.id = i.subject_value_id
join public.classification_value br  on br.id = i.branch_value_id
join public.classification_value t   on t.id = i.topic_value_id
left join public.classification_value kc on kc.id = i.key_concept_value_id
left join public.classification_value cs on cs.id = i.cognitive_skill_value_id
join public.classification_value d   on d.id = i.difficulty_value_id
where i.exam_set_id is not null;

grant select on public.v_sheet_items to authenticated;
