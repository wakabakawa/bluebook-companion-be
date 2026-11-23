import { connect } from "./db.js";

// Mirrors bluebook-companion-fe's SampleData.kt layout exactly, so the two stay comparable
// while both exist. Only Set A / Geometry is "published" (FR05) with real item tags.
//
// Set A is capped at 10 items total (the Charter's requested Set A/B/C sizing). Set A /
// Geometry already carries 10 published items with real attempt/cohort history attached
// (no cascade delete on item_response/answer_key_item), so it's left untouched here and
// Set A simply has no other branches. Set B (30) and Set C (40) had zero items/responses,
// so they're free to cover the full subject/branch taxonomy, scaled to their totals.

const GEOMETRY_KEY = "BDACBDAACD".split("");
const GEOMETRY_TOPICS = ["Triangles", "Triangles", "Circles", "Polygons", "Circles", "Solids", "Polygons", "Triangles", "Solids", "Circles"];
const GEOMETRY_CONCEPTS = ["Angle sum", "Pythagorean theorem", "Arc length", "Interior angles", "Chords", "Volume", "Perimeter", "Similarity", "Surface area", "Tangents"];
const SKILLS = ["Recall", "Application", "Analysis"];
const GEOMETRY_DIFFS = ["EASY", "EASY", "AVERAGE", "EASY", "AVERAGE", "HARD", "EASY", "AVERAGE", "HARD", "HARD"];
const REF_SECONDS: Record<string, number> = { EASY: 30, AVERAGE: 60, HARD: 120 };
const EDITION_ID = 1;

type BranchContent = { subject: string; topics: string[]; concepts: string[]; bookPageBase: number };

// Topic/key-concept pools for Set B and Set C's items. Sized to the largest item count any
// set asks of that branch (Trigonometry needs 12 distinct concepts for Set C, etc.) so no
// list has to repeat within one exam set.
const BRANCH_CONTENT: Record<string, BranchContent> = {
  Geometry: {
    subject: "Mathematics",
    topics: ["Triangles", "Circles", "Polygons", "Solids"],
    concepts: GEOMETRY_CONCEPTS,
    bookPageBase: 11,
  },
  Trigonometry: {
    subject: "Mathematics",
    topics: ["Right Triangles", "Unit Circle", "Identities", "Graphs"],
    concepts: ["Sine rule", "Cosine rule", "Radian measure", "Pythagorean identity", "Amplitude", "Period", "Phase shift", "Law of tangents", "Double angle", "Inverse functions", "Bearings", "Polar form"],
    bookPageBase: 45,
  },
  Calculus: {
    subject: "Mathematics",
    topics: ["Limits", "Derivatives", "Integrals", "Applications"],
    concepts: ["Limit laws", "Chain rule", "Product rule", "Quotient rule", "Definite integral", "Indefinite integral", "Related rates", "Optimization"],
    bookPageBase: 70,
  },
  Chemistry: {
    subject: "Science",
    topics: ["Atomic Structure", "Bonding", "Reactions", "Stoichiometry"],
    concepts: ["Electron configuration", "Ionic bonds", "Balancing equations", "Moles"],
    bookPageBase: 100,
  },
  Biology: {
    subject: "Science",
    topics: ["Cell Biology", "Genetics", "Ecology", "Physiology"],
    concepts: ["Cell organelles", "Mitosis", "Food webs", "Homeostasis"],
    bookPageBase: 130,
  },
  Grammar: {
    subject: "Language Proficiency",
    topics: ["Parts of Speech", "Sentence Structure", "Usage", "Punctuation"],
    concepts: ["Subject-verb agreement", "Tenses", "Modifiers", "Commas"],
    bookPageBase: 160,
  },
  Passages: {
    subject: "Reading Comprehension",
    topics: ["Main Idea", "Inference", "Vocabulary in Context", "Author's Purpose"],
    concepts: ["Topic sentence", "Implied meaning", "Context clues", "Tone"],
    bookPageBase: 180,
  },
};

const DIFF_CYCLE = ["EASY", "EASY", "AVERAGE", "AVERAGE", "HARD", "AVERAGE"];

// Set A / Geometry (10) is excluded - it already exists and is left untouched.
const SET_LAYOUTS: Record<string, Record<string, number>> = {
  "Set B": { Geometry: 3, Trigonometry: 9, Calculus: 6, Chemistry: 3, Biology: 3, Grammar: 3, Passages: 3 },
  "Set C": { Geometry: 4, Trigonometry: 12, Calculus: 8, Chemistry: 4, Biology: 4, Grammar: 4, Passages: 4 },
};

const UNUSED_SET_A_BRANCHES = ["Biology", "Calculus", "Chemistry", "Grammar", "Passages", "Trigonometry"];

async function main() {
  const db = connect();
  await db.connect();

  try {
    await db.query("begin");

    await db.query(
      `insert into public.edition (id, title, is_active) values ($1, $2, true)
       on conflict (id) do nothing`,
      [EDITION_ID, "The Maroon Bluebook - sample edition"]
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

    const subjects = [...new Set(Object.values(BRANCH_CONTENT).map((b) => b.subject))];
    const subjectIds = new Map<string, string>();
    for (const subject of subjects) subjectIds.set(subject, await valueId(1, subject, subject));

    const branchIds = new Map<string, string>();
    for (const branch of Object.keys(BRANCH_CONTENT)) branchIds.set(branch, await valueId(2, branch, branch));

    const allTopics = new Set<string>();
    const allConcepts = new Set<string>();
    for (const content of Object.values(BRANCH_CONTENT)) {
      content.topics.forEach((t) => allTopics.add(t));
      content.concepts.forEach((c) => allConcepts.add(c));
    }
    const topicIds = new Map<string, string>();
    for (const topic of allTopics) topicIds.set(topic, await valueId(3, topic, topic));

    const conceptIds = new Map<string, string>();
    for (const concept of allConcepts) conceptIds.set(concept, await valueId(4, concept, concept));

    const skillIds = new Map<string, string>();
    for (const skill of SKILLS) skillIds.set(skill, await valueId(5, skill, skill));

    const diffIds = new Map<string, string>();
    for (const diff of ["EASY", "AVERAGE", "HARD"]) {
      diffIds.set(diff, await valueId(6, diff, diff[0] + diff.slice(1).toLowerCase(), REF_SECONDS[diff]!));
    }

    // Set A / Geometry: untouched, same 10 items/content as every prior seed run.
    const geomRes = await db.query<{ id: string }>(
      `insert into public.exam_set
         (edition_id, set_name, subject_value_id, branch_value_id, item_count, allotment_seconds, published_at)
       values ($1, 'Set A', $2, $3, 10, 300, now())
       on conflict (edition_id, set_name, branch_value_id) do update set item_count = excluded.item_count
       returning id`,
      [EDITION_ID, subjectIds.get("Mathematics"), branchIds.get("Geometry")]
    );
    const geometrySetId = geomRes.rows[0]!.id;
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
          topicIds.get(GEOMETRY_TOPICS[i]!),
          conceptIds.get(GEOMETRY_CONCEPTS[i]!),
          skillIds.get(SKILLS[i % 3]!),
          diffIds.get(GEOMETRY_DIFFS[i]!),
          11 + Math.floor(i / 3),
        ]
      );
    }

    // Set B and Set C: full subject/branch taxonomy, scaled to each set's item-count budget.
    for (const [setName, branches] of Object.entries(SET_LAYOUTS)) {
      for (const [branchCode, itemCount] of Object.entries(branches)) {
        const content = BRANCH_CONTENT[branchCode]!;
        const subjectValueId = subjectIds.get(content.subject)!;
        const branchValueId = branchIds.get(branchCode)!;

        const res = await db.query<{ id: string }>(
          `insert into public.exam_set
             (edition_id, set_name, subject_value_id, branch_value_id, item_count, allotment_seconds, published_at)
           values ($1, $2, $3, $4, $5, $6, now())
           on conflict (edition_id, set_name, branch_value_id)
           do update set item_count = excluded.item_count, allotment_seconds = excluded.allotment_seconds,
             published_at = coalesce(public.exam_set.published_at, excluded.published_at)
           returning id`,
          [EDITION_ID, setName, subjectValueId, branchValueId, itemCount, itemCount * 30]
        );
        const examSetId = res.rows[0]!.id;

        // Safe to prune here (unlike Set A/Geometry): no item_response/answer_key_item
        // rows exist yet for these sets as of this restructuring.
        await db.query(`delete from public.item where exam_set_id = $1 and position > $2`, [examSetId, itemCount]);

        for (let i = 0; i < itemCount; i++) {
          const topic = content.topics[i % content.topics.length]!;
          const concept = content.concepts[i % content.concepts.length]!;
          const skill = SKILLS[i % SKILLS.length]!;
          const diff = DIFF_CYCLE[i % DIFF_CYCLE.length]!;
          await db.query(
            `insert into public.item
               (edition_id, exam_set_id, position, subject_value_id, branch_value_id, topic_value_id,
                key_concept_value_id, cognitive_skill_value_id, difficulty_value_id, book_page)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             on conflict (exam_set_id, position) do nothing`,
            [
              EDITION_ID,
              examSetId,
              i + 1,
              subjectValueId,
              branchValueId,
              topicIds.get(topic),
              conceptIds.get(concept),
              skillIds.get(skill),
              diffIds.get(diff),
              content.bookPageBase + Math.floor(i / 2),
            ]
          );
        }
      }
    }

    // Set A no longer carries the other 6 branches - drop the empty placeholder rows.
    await db.query(
      `delete from public.exam_set es
       using public.classification_value bv
       where es.branch_value_id = bv.id and es.set_name = 'Set A' and bv.code = any($1)
         and not exists (select 1 from public.item i where i.exam_set_id = es.id)`,
      [UNUSED_SET_A_BRANCHES]
    );

    await db.query(
      `insert into public.planner_config (edition_id) values ($1) on conflict (edition_id) do nothing`,
      [EDITION_ID]
    );

    await db.query("commit");

    await db.query("select public.refresh_rollups($1)", [EDITION_ID]);

    console.log("Seeded catalog: 1 edition, Set A (10 items, Geometry only), Set B (30 items), Set C (40 items).");
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
