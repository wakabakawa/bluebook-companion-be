-- Two fixes found testing against the deployed project:
--
-- 1. v_sheet_catalog is security_invoker, so it runs with the CALLER's privileges —
--    but it left-joined app_private.answer_key_version to derive key_version_id.
--    authenticated has zero grants on app_private (by design), so Postgres rejects the
--    whole query with "permission denied for table answer_key_version" the moment a
--    real signed-in user hits it, regardless of whether a row would match. The fix is
--    to stop reading app_private from a security_invoker view at all: submit_attempt()
--    already resolves the published version server-side, so it's the one place that
--    should hand key_version_id back to the client, not the catalogue.
--
-- 2. refresh_rollups(int) was the one SECURITY DEFINER function in this schema missing
--    the revoke/grant pair every other one has — Postgres grants EXECUTE on new
--    functions to PUBLIC by default, so it was reachable by anon and authenticated via
--    PostgREST's rpc/refresh_rollups endpoint. Its only real callers are the seed
--    scripts and a future pg_cron job, both of which connect as a role that owns (or
--    is) postgres and so is unaffected by REVOKE — there's no end-user path to this
--    function, admin or otherwise, so it's restricted to service_role rather than
--    gated by is_admin(): a service_role call often has no auth.uid()/app_metadata
--    claims at all, and is_admin()'s coalesce(..., false) would reject it. Restricting
--    by grant alone avoids locking out the function's one legitimate caller.
--    log_planner_config_audit() gets the same explicit revoke for consistency, though
--    its trigger-only use already makes it low-risk.

drop function if exists public.submit_attempt(uuid, uuid, timestamptz, int, jsonb);
drop view if exists public.v_sheet_catalog;

create view public.v_sheet_catalog
with (security_invoker = true) as
select
  es.id    as sheet_id,
  es.edition_id,
  es.set_name,
  sub.label as subject,
  br.label  as branch,
  es.item_count,
  es.allotment_seconds,
  (es.published_at is not null) as published
from public.exam_set es
join public.classification_value sub on sub.id = es.subject_value_id
join public.classification_value br  on br.id = es.branch_value_id;

grant select on public.v_sheet_catalog to authenticated;

create function public.submit_attempt(
  p_attempt_id    uuid,
  p_exam_set_id   uuid,
  p_started_at    timestamptz,
  p_total_seconds int,
  p_responses     jsonb -- [{"position":1,"choice":"B","flagged":false,"seconds":42}, ...]
)
returns table ("position" smallint, selected_choice char(1), is_correct boolean, correct_choice char(1), key_version_id uuid)
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_profile uuid := auth.uid();
  v_edition int;
  v_version uuid;
  v_reveal  boolean;
  v_fresh   boolean := false;
begin
  if v_profile is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select es.edition_id into v_edition from public.exam_set es where es.id = p_exam_set_id;
  if v_edition is null then
    raise exception 'unknown exam set' using errcode = 'P0002';
  end if;

  insert into public.local_profile (id, edition_id) values (v_profile, v_edition)
  on conflict (id) do update set last_seen_at = now();

  select akv.id into v_version
  from app_private.answer_key_version akv
  where akv.exam_set_id = p_exam_set_id and akv.status = 'published';
  if v_version is null then
    raise exception 'no published answer key for this set' using errcode = 'P0002';
  end if;

  insert into public.attempt
    (id, profile_id, exam_set_id, scored_with_version_id, started_at, submitted_at, total_seconds, scored_at)
  values
    (p_attempt_id, v_profile, p_exam_set_id, v_version, p_started_at, now(), p_total_seconds, now())
  on conflict (id) do nothing;
  get diagnostics v_fresh = row_count;

  if v_fresh then
    insert into public.item_response
      (attempt_id, profile_id, item_id, selected_choice, is_correct, flagged, seconds)
    select
      p_attempt_id, v_profile, i.id,
      nullif(upper(x.choice), ''),
      (x.choice is not null and upper(x.choice) = k.correct_choice), -- blank -> false (BR05)
      coalesce(x.flagged, false),
      coalesce(x.seconds, 0)
    from jsonb_to_recordset(p_responses) as x("position" smallint, choice text, flagged boolean, seconds int)
    join public.item i on i.exam_set_id = p_exam_set_id and i.position = x.position
    join app_private.answer_key_item k on k.answer_key_version_id = v_version and k.item_id = i.id;
  end if;

  select pc.reveal_key_after_submit into v_reveal
  from public.planner_config pc where pc.edition_id = v_edition;

  return query
    select
      i.position, r.selected_choice, r.is_correct,
      case when v_reveal then k.correct_choice end,
      v_version
    from public.item_response r
    join public.item i on i.id = r.item_id
    join app_private.answer_key_item k
      on k.answer_key_version_id = v_version and k.item_id = i.id
    where r.attempt_id = p_attempt_id and r.profile_id = v_profile
    order by i.position;
end
$$;

revoke all    on function public.submit_attempt(uuid, uuid, timestamptz, int, jsonb) from public, anon;
grant execute on function public.submit_attempt(uuid, uuid, timestamptz, int, jsonb) to authenticated;

-- Close the missing-revoke gap: only an admin may trigger a rebuild via PostgREST.
create or replace function public.refresh_rollups(p_edition_id int)
returns void
language plpgsql security definer set search_path = public, app_private, pg_temp
as $$
declare
  v_min int;
begin
  select cohort_min_attempts into v_min from public.planner_config where edition_id = p_edition_id;

  insert into public.topic_catalog as tc
    (edition_id, topic_value_id, topic_id, topic_label, subject_label, branch_label,
     items_in_book, ref_seconds, book_page_ref)
  select
    i.edition_id, t.id, t.code, t.label, sub.label, br.label,
    count(*)::int,
    greatest(1, ceil(avg(coalesce(i.ref_seconds_override, d.ref_seconds, 60)))::int),
    min(i.book_page)
  from public.item i
  join public.classification_value t   on t.id  = i.topic_value_id
  join public.classification_value br  on br.id = i.branch_value_id
  join public.classification_value sub on sub.id = i.subject_value_id
  join public.classification_value d   on d.id  = i.difficulty_value_id
  where i.edition_id = p_edition_id
  group by i.edition_id, t.id, t.code, t.label, sub.label, br.label
  on conflict (edition_id, topic_value_id) do update
    set items_in_book = excluded.items_in_book,
        ref_seconds   = excluded.ref_seconds,
        book_page_ref = excluded.book_page_ref;

  insert into public.exam_set_statistics as ess
    (exam_set_id, attempts_count, distinct_profiles, released_at, refreshed_at)
  select
    es.id, count(a.id)::int, count(distinct a.profile_id)::int,
    case when count(distinct a.profile_id) >= v_min then now() end, now()
  from public.exam_set es
  left join public.attempt a on a.exam_set_id = es.id and a.scored_at is not null
  where es.edition_id = p_edition_id
  group by es.id
  on conflict (exam_set_id) do update
    set attempts_count    = excluded.attempts_count,
        distinct_profiles = excluded.distinct_profiles,
        released_at       = coalesce(ess.released_at, excluded.released_at),
        refreshed_at      = now();

  insert into public.item_statistics as s (item_id, answered_count, correct_count, avg_seconds, refreshed_at)
  select
    r.item_id,
    count(*) filter (where r.selected_choice is not null)::int,
    count(*) filter (where r.is_correct)::int,
    avg(nullif(r.seconds, 0)), now()
  from public.item_response r
  join public.attempt a on a.id = r.attempt_id and a.scored_at is not null
  join public.item i on i.id = r.item_id and i.edition_id = p_edition_id
  group by r.item_id
  on conflict (item_id) do update
    set answered_count = excluded.answered_count,
        correct_count  = excluded.correct_count,
        avg_seconds    = excluded.avg_seconds,
        refreshed_at   = now();

  delete from public.topic_cohort where edition_id = p_edition_id;
  insert into public.topic_cohort (edition_id, topic_value_id, cohort_mastery, based_on_answers)
  select
    i.edition_id, i.topic_value_id,
    round(sum(s.correct_count)::numeric / sum(s.answered_count), 6),
    sum(s.answered_count)::int
  from public.item i
  join public.exam_set es             on es.id = i.exam_set_id
  join public.exam_set_statistics ess on ess.exam_set_id = es.id
  join public.item_statistics s       on s.item_id = i.id
  where i.edition_id = p_edition_id
    and ess.released_at is not null -- BR09 gate
  group by i.edition_id, i.topic_value_id
  having sum(s.answered_count) > 0;
end
$$;

revoke all    on function public.refresh_rollups(int) from public, anon, authenticated;
grant execute on function public.refresh_rollups(int) to service_role;

revoke all on function public.log_planner_config_audit() from public, anon, authenticated;
