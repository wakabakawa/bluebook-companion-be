-- Found while testing v_topic_stats directly: local_profile has no INSERT policy (by
-- design - see the attempts migration), so a brand-new user who hasn't submitted an
-- attempt yet has no local_profile row and v_topic_stats returns zero rows instead of
-- the intended cold-start (all topics of the edition, zero practice). submit_attempt()
-- already upserts the row as a side effect, but the plan-gateway Edge Function needs to
-- do the same thing before it can read v_topic_stats for a first-time caller, and it
-- runs as `authenticated` (anon key + forwarded JWT, not service_role) so it cannot
-- INSERT directly either. This RPC is that one missing capability, nothing more.

create or replace function public.ensure_profile(p_edition_id int)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.local_profile (id, edition_id) values (auth.uid(), p_edition_id)
  on conflict (id) do update set last_seen_at = now();
end
$$;

revoke all    on function public.ensure_profile(int) from public, anon;
grant execute on function public.ensure_profile(int) to authenticated;
