import { randomUUID } from "node:crypto";
import { connect } from "./db.js";

// Populates FR22's Cohort Comparison with enough distinct readers to clear BR09's
// release threshold (planner_config.cohort_min_attempts, 30) on Set A / Geometry - the
// only exam set with a published answer key. Each fake reader is a real row in
// auth.users (shaped exactly like a genuine anonymous sign-in, not a stand-in table),
// so it satisfies local_profile's FK and every RLS policy the same way a real student
// would. Local/dev seeding only, same spirit as seed/answer_key.ts.

const NEW_READERS = 300;
const CHOICES = ["A", "B", "C", "D"] as const;

function randomWrongChoice(correct: string): string {
  const wrong = CHOICES.filter((c) => c !== correct);
  return wrong[Math.floor(Math.random() * wrong.length)]!;
}

async function main() {
  const db = connect();
  await db.connect();

  try {
    const setRes = await db.query<{ id: string; edition_id: number }>(
      `select es.id, es.edition_id from public.exam_set es
       join public.classification_value br on br.id = es.branch_value_id
       where es.set_name = 'Set A' and br.code = 'Geometry'`
    );
    const examSet = setRes.rows[0];
    if (!examSet) throw new Error("Set A / Geometry not found - run seed/catalog.ts first");

    const versionRes = await db.query<{ id: string }>(
      `select id from app_private.answer_key_version where exam_set_id = $1 and status = 'published'`,
      [examSet.id]
    );
    const versionId = versionRes.rows[0]?.id;
    if (!versionId) throw new Error("No published answer key for Set A / Geometry - run seed/answer_key.ts first");

    const itemsRes = await db.query<{ id: string; position: number; correct_choice: string }>(
      `select i.id, i."position", k.correct_choice
       from public.item i
       join app_private.answer_key_item k on k.answer_key_version_id = $1 and k.item_id = i.id
       where i.exam_set_id = $2
       order by i."position"`,
      [versionId, examSet.id]
    );
    if (itemsRes.rows.length === 0) throw new Error("No answer key items found for Set A / Geometry");

    await db.query("begin");

    for (let i = 0; i < NEW_READERS; i++) {
      const profileId = randomUUID();

      // Shaped to match a real anonymous sign-in's row exactly (verified against a
      // genuine one on this project) - never a hand-rolled stand-in row.
      await db.query(
        `insert into auth.users
           (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data,
            raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at, last_sign_in_at)
         values
           ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', null, '',
            '{}'::jsonb, '{}'::jsonb, false, true, now(), now(), now())`,
        [profileId]
      );

      await db.query(
        `insert into public.local_profile (id, edition_id) values ($1, $2)`,
        [profileId, examSet.edition_id]
      );

      const attemptId = randomUUID();
      const totalSeconds = 180 + Math.floor(Math.random() * 420);
      // Spread of accuracy across the fake cohort so Above/Near/Below average all show up.
      const targetAccuracy = 0.25 + Math.random() * 0.7;

      await db.query(
        `insert into public.attempt
           (id, profile_id, exam_set_id, scored_with_version_id, started_at, submitted_at, total_seconds, scored_at)
         values ($1, $2, $3, $4, now() - make_interval(secs => $5), now(), $5, now())`,
        [attemptId, profileId, examSet.id, versionId, totalSeconds]
      );

      for (const item of itemsRes.rows) {
        const choice = Math.random() < targetAccuracy ? item.correct_choice : randomWrongChoice(item.correct_choice);
        await db.query(
          `insert into public.item_response (attempt_id, profile_id, item_id, selected_choice, is_correct, flagged, seconds)
           values ($1, $2, $3, $4, $5, false, $6)`,
          [attemptId, profileId, item.id, choice, choice === item.correct_choice, 15 + Math.floor(Math.random() * 75)]
        );
      }
    }

    await db.query("commit");
    console.log(`Seeded ${NEW_READERS} fake readers' attempts on Set A / Geometry.`);

    await db.query("select public.refresh_rollups($1)", [examSet.edition_id]);
    console.log("Ran refresh_rollups() to recompute the cohort projections.");

    const cohort = await db.query(
      `select tcat.topic_label, tco.cohort_mastery, tco.based_on_answers
       from public.topic_cohort tco
       join public.topic_catalog tcat
         on tcat.topic_value_id = tco.topic_value_id and tcat.edition_id = tco.edition_id
       where tco.edition_id = $1`,
      [examSet.edition_id]
    );
    console.log("topic_cohort now shows:", cohort.rows);
  } catch (err) {
    await db.query("rollback").catch(() => {});
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
