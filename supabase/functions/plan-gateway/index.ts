import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";
import type { DbTopicRow } from "../_shared/gateway/wire-types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function fetchTopicRows(authHeader: string, editionId: number): Promise<DbTopicRow[]> {
  // anon key + the caller's own JWT forwarded, never service_role: RLS is the real
  // boundary, this client has no more access than the caller already has.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: ensureError } = await supabase.rpc("ensure_profile", { p_edition_id: editionId });
  if (ensureError) {
    if (ensureError.code === "28000" || ensureError.message?.includes("not authenticated")) {
      throw new Error("unauthorized");
    }
    throw new Error(`ensure_profile failed: ${ensureError.message}`);
  }

  const { data, error } = await supabase
    .from("v_topic_stats")
    .select("profile_id,topic_id,topic_label,subject_label,branch_label,items_in_book,answered,correct,last_practiced,cohort_mastery,ref_seconds,book_page_ref,reliable")
    .limit(750);
  if (error) throw new Error(`v_topic_stats query failed: ${error.message}`);

  return (data ?? []) as DbTopicRow[];
}

const handle = createHandler({ fetchTopicRows, now: () => Date.now() });

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req: Request) => handle(req)),
};

/* To invoke locally:

  1. Run `supabase start`
  2. Sign in anonymously to get a JWT (see README), then:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/plan-gateway' \
    --header 'apiKey: <publishable key>' \
    --header 'Authorization: Bearer <anon user JWT>' \
    --header 'Content-Type: application/json' \
    --data '{"request_id":"<uuid>","edition_id":1,"params":{"budget_min":30,"min_strong":1}}'
*/
