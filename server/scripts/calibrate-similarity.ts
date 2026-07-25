/**
 * Calibration script: compute pairwise Levenshtein (title) + Sorensen-Dice
 * (body) similarity across all active experience cards in the real KB.
 *
 * Run: npx tsx scripts/calibrate-similarity.ts
 *
 * Output: a matrix used to pick DUPLICATE_CONTENT_THRESHOLD for ADR-011.
 * The goal is to find a threshold that:
 *   - scores WELL BELOW for unrelated cards (the 4 existing cards span
 *     js-yaml, lychee, mcp cache, sub-agent paths — all distinct topics)
 *   - scores WELL ABOVE for genuinely duplicate cards (synthetic test:
 *     same body with minor edits)
 *
 * Threshold selection rule (per plan §"待澄清问题" #1):
 *   pick the lowest value that (a) is comfortably above the max unrelated
 *   pair score and (b) is comfortably below the synthetic-duplicate score.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { levenshteinRatio, sorensenDiceBigram } from "../src/utils/similarity.js";
import { parseFrontmatter } from "../src/utils/frontmatter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KB_ROOT = path.resolve(__dirname, "../../"); // repo root

const EXPERIENCES_DIR = path.join(KB_ROOT, "wiki", "coding", "experiences");

async function loadCards(): Promise<
  Array<{ file: string; title: string; body: string }>
> {
  const files = (await fs.readdir(EXPERIENCES_DIR)).filter(
    (f) => f.endsWith(".md") && !f.includes("inbox"),
  );
  const cards = [];
  for (const f of files) {
    const full = path.join(EXPERIENCES_DIR, f);
    const content = await fs.readFile(full, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    cards.push({
      file: f,
      title: String(frontmatter.title ?? f),
      body,
    });
  }
  return cards;
}

function fmt(n: number): string {
  return n.toFixed(4);
}

async function main(): Promise<void> {
  const cards = await loadCards();
  console.log(`Loaded ${cards.length} active experience cards:\n`);
  for (const c of cards) console.log(`  - ${c.title}`);
  console.log("");

  // Pairwise
  console.log("Pairwise similarity (Levenshtein title / Sorensen-Dice body):\n");
  const titleScores: number[] = [];
  const bodyScores: number[] = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i];
      const b = cards[j];
      const titleSim = levenshteinRatio(a.title, b.title);
      const bodySim = sorensenDiceBigram(a.body, b.body);
      titleScores.push(titleSim);
      bodyScores.push(bodySim);
      console.log(
        `  [${i + 1}↔${j + 1}] title=${fmt(titleSim)} body=${fmt(bodySim)}`,
      );
      console.log(`        A: ${a.title}`);
      console.log(`        B: ${b.title}`);
    }
  }

  console.log("");
  const maxTitle = Math.max(...titleScores);
  const maxBody = Math.max(...bodyScores);
  const minTitle = Math.min(...titleScores);
  const minBody = Math.min(...bodyScores);
  console.log(`Title similarity: min=${fmt(minTitle)} max=${fmt(maxTitle)}`);
  console.log(`Body similarity:  min=${fmt(minBody)} max=${fmt(maxBody)}`);

  // Synthetic duplicate test: take card 1's body, make a 1-character edit,
  // confirm the score is near 1.0.
  if (cards.length > 0) {
    const orig = cards[0].body;
    const tampered = orig.replace(/characters/, "CHARACTERS"); // minor edit
    const selfSim = sorensenDiceBigram(orig, orig);
    const tamperedSim = sorensenDiceBigram(orig, tampered);
    console.log("");
    console.log("Synthetic duplicate check (card 1 vs itself + 1-word case edit):");
    console.log(`  self:    ${fmt(selfSim)}`);
    console.log(`  tampered: ${fmt(tamperedSim)}`);
  }

  // Recommendation
  console.log("");
  const ceiling = maxBody; // highest unrelated score
  const floor = 0.95; // expected for genuine duplicates
  const recommended = Math.min(0.8, Math.max(0.7, (ceiling + floor) / 2));
  console.log(
    `Recommended DUPLICATE_CONTENT_THRESHOLD ≈ ${fmt(recommended)} ` +
      `(midpoint of unrelated-ceiling ${fmt(ceiling)} and duplicate-floor ${fmt(floor)}, clamped to [0.7, 0.8])`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
