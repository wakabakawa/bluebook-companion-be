import { connect } from "./db.js";

// Mirrors bluebook-companion-fe's SampleData.kt layout exactly, so the two stay comparable
// while both exist. Only Set A / Geometry is "published" (FR05) with real item tags.

const SET_NAMES = ["Set A", "Set B", "Set C"];
const LAYOUT: Array<[string, Array<[string, number]>]> = [
  ["Mathematics", [["Geometry", 10], ["Trigonometry", 30], ["Calculus", 20]]],
  ["Science", [["Chemistry", 10], ["Biology", 10]]],
  ["Language Proficiency", [["Grammar", 10]]],
  ["Reading Comprehension", [["Passages", 10]]],
];

const GEOMETRY_KEY = "BDACBDAACD".split("");
const TOPICS = ["Triangles", "Triangles", "Circles", "Polygons", "Circles", "Solids", "Polygons", "Triangles", "Solids", "Circles"];
const CONCEPTS = ["Angle sum", "Pythagorean theorem", "Arc length", "Interior angles", "Chords", "Volume", "Perimeter", "Similarity", "Surface area", "Tangents"];
const SKILLS = ["Recall", "Application", "Analysis"];
const DIFFS = ["EASY", "EASY", "AVERAGE", "EASY", "AVERAGE", "HARD", "EASY", "AVERAGE", "HARD", "HARD"];
const REF_SECONDS: Record<string, number> = { EASY: 30, AVERAGE: 60, HARD: 120 };
const EDITION_ID = 1;

async function main() {
  const db = connect();
  await db.connect();

  try {
    await db.query("begin");

    await db.query(
      `insert into public.edition (id, title, is_active) values ($1, $2, true)
       on conflict (id) do nothing`,
      [EDITION_ID, "The Maroon Bluebook — sample edition"]
    );

    const classifications: Array<[number, string, string]> = [
      [1, "subject", "Subject"],
      [2, "branch", "Branch"],
      [3, "topic", "Topic"],
      [4, "key_concept", "Key Concept"],
      [5, "cognitive_skill", "Cognitive Skill"],
      [6, "difficulty", "Difficulty"],
    ];
    for (const [id, code, label] of classifications) {
      await db.query(
        `insert into public.classification (id, code, label) values ($1, $2, $3)
         on conflict (id) do nothing`,
        [id, code, label]
      );
    }

    const valueId = async (classificationId: number, code: string, label: string, refSeconds: number | null = null) => {
      const res = await db.query<{ id: string }>(
        `insert into public.classification_value (classification_id, code, label, ref_seconds)
         values ($1, $2, $3, $4)
         on conflict (classification_id, code) do update set label = excluded.label
         returning id`,
        [classificationId, code, label, refSeconds]
      );
      return res.rows[0]!.id;
    };

    const subjectIds = new Map<string, string>();
    for (const [subject] of LAYOUT) subjectIds.set(subject, await valueId(1, subject, subject));

    const branchIds = new Map<string, string>();
    for (const [, branches] of LAYOUT) {
      for (const [branch] of branches) branchIds.set(branch, await valueId(2, branch, branch));
    }

    const topicIds = new Map<string, string>();
    for (const topic of new Set(TOPICS)) topicIds.set(topic, await valueId(3, topic, topic));

    const conceptIds = new Map<string, string>();
    for (const concept of new Set(CONCEPTS)) conceptIds.set(concept, await valueId(4, concept, concept));

    const skillIds = new Map<string, string>();
    for (const skill of SKILLS) skillIds.set(skill, await valueId(5, skill, skill));

    const diffIds = new Map<string, string>();
    for (const diff of ["EASY", "AVERAGE", "HARD"]) {
      diffIds.set(diff, await valueId(6, diff, diff[0] + diff.slice(1).toLowerCase(), REF_SECONDS[diff]!));
    }

    const examSetIds = new Map<string, string>(); // key: "Set A|Geometry"
    for (const setName of SET_NAMES) {
      for (const [subject, branches] of LAYOUT) {
        for (const [branch, itemCount] of branches) {
          const published = setName === "Set A" && branch === "Geometry";
          const res = await db.query<{ id: string }>(
            `insert into public.exam_set
               (edition_id, set_name, subject_value_id, branch_value_id, item_count, allotment_seconds, published_at)
             values ($1, $2, $3, $4, $5, $6, $7)
             on conflict (edition_id, set_name, branch_value_id) do update set item_count = excluded.item_count
             returning id`,
            [EDITION_ID, setName, subjectIds.get(subject), branchIds.get(branch), itemCount, itemCount * 30, published ? new Date() : null]
          );
          examSetIds.set(`${setName}|${branch}`, res.rows[0]!.id);
        }
      }
    }

    const geometrySetId = examSetIds.get("Set A|Geometry")!;
    for (let i = 0; i < 10; i++) {
      await db.query(
        `insert into public.item
           (edition_id, exam_set_id, position, subject_value_id, branch_value_id, topic_value_id,
            key_concept_value_id, cognitive_skill_value_id, difficulty_value_id, book_page)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (exam_set_id, position) do nothing`,
        [
          EDITION_ID,
          geometrySetId,
          i + 1,
          subjectIds.get("Mathematics"),
          branchIds.get("Geometry"),
          topicIds.get(TOPICS[i]!),
          conceptIds.get(CONCEPTS[i]!),
          skillIds.get(SKILLS[i % 3]!),
          diffIds.get(DIFFS[i]!),
          11 + Math.floor(i / 3),
        ]
      );
    }

    await db.query(
      `insert into public.planner_config (edition_id) values ($1) on conflict (edition_id) do nothing`,
      [EDITION_ID]
    );

    await db.query("commit");

    await db.query("select public.refresh_rollups($1)", [EDITION_ID]);

    console.log("Seeded catalog: 1 edition, 21 exam sets, 10 items (Set A / Geometry), 4 topics.");
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
