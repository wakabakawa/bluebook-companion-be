-- Shrinks submit_attempt()'s response further: it echoed back selected_choice (the
-- student's own submitted letter, never the correct one) purely so the client could tell
-- BLANK apart from WRONG. The client already has its own answers in the local draft at
-- submit time, so it doesn't need the server to echo them back at all - the response now
-- carries only is_correct, nothing answer-shaped whatsoever.

drop function if exists public.submit_attempt(uuid, uuid, timestamptz, int, jsonb);

create function public.submit_attempt(
  p_attempt_id    uuid,
  p_exam_set_id   uuid,
  p_started_at    timestamptz,
  p_total_seconds int,
  p_responses     jsonb -- [{"position":1,"choice":"B","flagged":false,"seconds":42}, ...]
)
returns table ("position" smallint, is_correct boolean, key_version_id uuid)
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_profile uuid := auth.uid();
  v_edition int;
  v_version uuid;
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

  return query
    select i.position, r.is_correct, v_version
    from public.item_response r
    join public.item i on i.id = r.item_id
    where r.attempt_id = p_attempt_id and r.profile_id = v_profile
    order by i.position;
end
$$;

revoke all    on function public.submit_attempt(uuid, uuid, timestamptz, int, jsonb) from public, anon;
grant execute on function public.submit_attempt(uuid, uuid, timestamptz, int, jsonb) to authenticated;
