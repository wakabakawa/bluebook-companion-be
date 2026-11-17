import { connect } from "./db.js";

// The only place this repo writes an answer key. Local/dev seeding only — mirrors
// SampleData.kt's hardcoded Geometry key, which is exactly what this migration retires
// from the Android client once Postgres is the source of truth (see the plan's §4).

const GEOMETRY_KEY = "BDACBDAACD".split("");

async function main() {
  const db = connect();
  await db.connect();

  try {
    await db.query("begin");

    const setRes = await db.query<{ id: string }>(
      `select es.id from public.exam_set es
       join public.classification_value br on br.id = es.branch_value_id
       where es.set_name = 'Set A' and br.code = 'Geometry'`
    );
    const examSetId = setRes.rows[0]?.id;
    if (!examSetId) throw new Error("Set A / Geometry not found — run seed/catalog.ts first");

    const versionRes = await db.query<{ id: string }>(
      `insert into app_private.answer_key_version (exam_set_id, version_no, status, published_at)
       values ($1, 1, 'published', now())
       on conflict (exam_set_id, version_no) do update set status = 'published', published_at = now()
       returning id`,
      [examSetId]
    );
    const versionId = versionRes.rows[0]!.id;

    const itemsRes = await db.query<{ id: string; position: number }>(
      `select id, "position" from public.item where exam_set_id = $1 order by "position"`,
      [examSetId]
    );

    for (const item of itemsRes.rows) {
      const correct = GEOMETRY_KEY[item.position - 1]!;
      await db.query(
        `insert into app_private.answer_key_item (answer_key_version_id, item_id, correct_choice)
         values ($1, $2, $3)
         on conflict (answer_key_version_id, item_id) do update set correct_choice = excluded.correct_choice`,
        [versionId, item.id, correct]
      );
    }

    await db.query("commit");
    console.log(`Published answer key for Set A / Geometry (${itemsRes.rows.length} items).`);
  } catch (err) {
    await db.query("rollback");
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
