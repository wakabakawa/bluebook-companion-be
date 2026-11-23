import { connect } from "./db.js";

// The only place this repo writes an answer key. Local/dev seeding only. Publishes every
// published exam_set returned by seed/catalog.ts - Set A/Geometry keeps its original,
// already-demoed key; Set B/Set C branches get a deterministic per-branch key (there's no
// real answer-key source for this sample content, so the key is reproducible rather than
// invented fresh on every run).

const CHOICES = ["A", "B", "C", "D"] as const;
const GEOMETRY_KEY = "BDACBDAACD".split("");

function branchSeed(code: string): number {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h;
}

async function main() {
  const db = connect();
  await db.connect();

  try {
    await db.query("begin");

    const sets = await db.query<{ id: string; set_name: string; branch_code: string }>(
      `select es.id, es.set_name, bv.code as branch_code
       from public.exam_set es
       join public.classification_value bv on bv.id = es.branch_value_id
       where es.published_at is not null
       order by es.set_name, bv.code`
    );
    if (sets.rows.length === 0) throw new Error("No published exam sets found - run seed/catalog.ts first");

    for (const set of sets.rows) {
      const versionRes = await db.query<{ id: string }>(
        `insert into app_private.answer_key_version (exam_set_id, version_no, status, published_at)
         values ($1, 1, 'published', now())
         on conflict (exam_set_id, version_no) do update set status = 'published', published_at = now()
         returning id`,
        [set.id]
      );
      const versionId = versionRes.rows[0]!.id;

      const itemsRes = await db.query<{ id: string; position: number }>(
        `select id, "position" from public.item where exam_set_id = $1 order by "position"`,
        [set.id]
      );

      const isGeometryA = set.set_name === "Set A" && set.branch_code === "Geometry";
      for (const item of itemsRes.rows) {
        const correct = isGeometryA
          ? GEOMETRY_KEY[item.position - 1]!
          : CHOICES[(branchSeed(set.branch_code) + item.position) % 4]!;
        await db.query(
          `insert into app_private.answer_key_item (answer_key_version_id, item_id, correct_choice)
           values ($1, $2, $3)
           on conflict (answer_key_version_id, item_id) do update set correct_choice = excluded.correct_choice`,
          [versionId, item.id, correct]
        );
      }
      console.log(`Published answer key for ${set.set_name} / ${set.branch_code} (${itemsRes.rows.length} items).`);
    }

    await db.query("commit");
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
