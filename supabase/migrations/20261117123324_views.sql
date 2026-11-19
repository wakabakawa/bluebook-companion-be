-- Three read-only views. ALL must be security_invoker = true, or they run with the
-- view owner's privileges and silently bypass every RLS policy above - the single
-- easiest way this schema could accidentally leak the answer key.

-- v_topic_stats: the plan-gateway Edge Function's input. One row per topic of the
-- caller's edition (not just topics they've touched) so a brand-new student still
-- gets a cold-start plan (PDF §6.5) instead of EMPTY_INPUT.
create or replace view public.v_topic_stats
with (security_invoker = true) as
with resp as (
  select
    r.profile_id,
    i.topic_value_id,
    count(*) filter (where r.selected_choice is not null)::int as answered,
    count(*) filter (where r.is_correct)::int                  as correct,
    max(a.submitted_at) filter (where r.selected_choice is not null) as last_practiced
  from public.item_response r
  join public.attempt a on a.id = r.attempt_id and a.scored_at is not null
  join public.item   i  on i.id = r.item_id
  group by r.profile_id, i.topic_value_id
)
select
  p.id                           as profile_id,
  tc.topic_id,
  tc.topic_label,
  tc.subject_label,
  tc.branch_label,
  tc.items_in_book,
  coalesce(r.answered, 0)        as answered,
  coalesce(r.correct, 0)         as correct,
  r.last_practiced,
  co.cohort_mastery,
  tc.ref_seconds,
  tc.book_page_ref,
  (coalesce(r.answered, 0) >= pc.min_items) as reliable
from public.local_profile p
join public.planner_config pc on pc.edition_id = p.edition_id
join public.topic_catalog  tc on tc.edition_id = p.edition_id
left join resp r on r.profile_id = p.id and r.topic_value_id = tc.topic_value_id
left join public.topic_cohort co
  on co.edition_id = p.edition_id and co.topic_value_id = tc.topic_value_id;

-- v_sheet_catalog: replaces SampleData.kt's hardcoded Sheet list. `published` is now a
-- stored flag, not derived from a key the client holds.
create or replace view public.v_sheet_catalog
with (security_invoker = true) as
select
  es.id    as sheet_id,
  es.edition_id,
  es.set_name,
  sub.label as subject,
  br.label  as branch,
  es.item_count,
  es.allotment_seconds,
  (es.published_at is not null) as published,
  akv.id as key_version_id
from public.exam_set es
join public.classification_value sub on sub.id = es.subject_value_id
join public.classification_value br  on br.id = es.branch_value_id
left join app_private.answer_key_version akv
  on akv.exam_set_id = es.id and akv.status = 'published';

-- v_sheet_items: classification tags only - no key, no question text (BR01). Item's
-- own RLS (published sets only) already applies because this view is security_invoker.
create or replace view public.v_sheet_items
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
  i.book_page
from public.item i
join public.classification_value sub on sub.id = i.subject_value_id
join public.classification_value br  on br.id = i.branch_value_id
join public.classification_value t   on t.id = i.topic_value_id
left join public.classification_value kc on kc.id = i.key_concept_value_id
left join public.classification_value cs on cs.id = i.cognitive_skill_value_id
join public.classification_value d   on d.id = i.difficulty_value_id
where i.exam_set_id is not null;

grant select on public.v_topic_stats, public.v_sheet_catalog, public.v_sheet_items to authenticated;
