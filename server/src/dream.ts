#!/usr/bin/env tsx
/**
 * /dream — periodic maintenance pass for the continuous-evolution KB
 * (AGENTS.md §7.5, ADR-011).
 *
 * Three phases, all scoped to active experience cards:
 *
 *   Phase 1 (aging):   demote use_count=0 AND date>90d cards from
 *                      active → archived, moving the file to
 *                      wiki/<domain>/experiences/archive/<slug>.md.
 *                      (Existing P2 behavior — preserved.)
 *
 *   Phase 2 (dedup):   report-only scan for suspected duplicate pairs
 *                      within each domain bucket. Does NOT merge or
 *                      delete — merging is an irreversible decision that
 *                      requires human review (plan §"合并策略").
 *
 *   Phase 3 (quality): compute quality_score for each remaining active
 *                      card via the 4-dimension rubric (utils/quality.ts)
 *                      and write it back to frontmatter. Idempotent —
 *                      skip writeback if |current - new| < 0.01.
 *
 * Run: `npm run dream` (or `tsx src/dream.ts`). Reads KB_ROOT from env.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { getWikiDir } from "./config.js";
import { writeFile, ensureDir } from "./utils/fileio.js";
import { serializeFrontmatter, normalizeDate } from "./utils/frontmatter.js";
import { removePageFromIndex } from "./utils/index-md.js";
import { appendLogEntry } from "./utils/log.js";
import { loadAllPages } from "./utils/pages.js";
import type { PageInfo } from "./utils/pages.js";
import { levenshteinRatio, sorensenDiceBigram } from "./utils/similarity.js";
import { scoreExperience } from "./utils/quality.js";

const ARCHIVE_AGE_DAYS = 90;

// ---------------------------------------------------------------------------
// Duplicate-detection thresholds (ADR-011)
// ---------------------------------------------------------------------------
// MUST match server/src/tools/write.ts DUPLICATE_TITLE_THRESHOLD /
// DUPLICATE_CONTENT_THRESHOLD. Kept as local consts rather than a shared
// module to keep the change surgical (plan does not list a new utils file).
// ADR-011 is the canonical source of truth for these values.
const DUPLICATE_TITLE_THRESHOLD = 0.9;
const DUPLICATE_CONTENT_THRESHOLD = 0.7;
/** Skip dedup for a domain bucket larger than this (O(N²) gets expensive). */
const DEDUP_BUCKET_SIZE_LIMIT = 500;
/** Quality-score writeback idempotency threshold (skip if |Δ| < this). */
const QUALITY_IDEMPOTENCE_EPSILON = 0.01;

/** Today's date as YYYY-MM-DD (local time, consistent with write.ts). */
function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string to a UTC epoch ms (date-only, midnight UTC). */
function parseDateEpoch(s: string): number {
  const parts = s.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return Number.NaN;
  }
  const [y, m, d] = parts;
  return Date.UTC(y, m - 1, d);
}

/** True iff `dateStr` is more than `days` older than `today`. */
function isOlderThan(dateStr: string, days: number, today: string): boolean {
  const then = parseDateEpoch(dateStr);
  const now = parseDateEpoch(today);
  if (Number.isNaN(then) || Number.isNaN(now)) return false;
  const diffDays = (now - then) / (1000 * 60 * 60 * 24);
  return diffDays > days;
}

/** Round to 3 decimal places for readable report output. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Suspected duplicate pair (report-only, Phase 2). */
export interface DuplicatePair {
  a: string; // relPath (forward slashes, no .md), lexically smaller
  b: string; // relPath, lexically larger
  title_sim: number;
  content_sim: number;
}

interface DreamReport {
  scanned: number; // active experience cards considered in Phase 1
  demoted: number; // archived in Phase 1
  demoted_paths: string[];
  duplicates: DuplicatePair[]; // Phase 2 (report-only)
  scored: number; // Phase 3 total cards scored
  quality_updated: number; // Phase 3 writebacks (idempotent)
}

/**
 * Run a full /dream pass: aging → dedup scan → quality scoring.
 *
 * Returns a structured report. All phases are best-effort: a single card's
 * failure does not abort the batch (CLAUDE.md §19.4 不吞异常 — failures
 * are logged to stderr and the pass continues).
 */
export async function dream(): Promise<DreamReport> {
  const wikiDir = getWikiDir();
  const today = todayDate();
  const report: DreamReport = {
    scanned: 0,
    demoted: 0,
    demoted_paths: [],
    duplicates: [],
    scored: 0,
    quality_updated: 0,
  };

  // Load all pages once; filter to active experience cards directly under
  // experiences/ (skip inbox/ pending and archive/ already-demoted).
  // status=active already excludes pending/archived, but the path-based
  // check is defense-in-depth against data inconsistencies.
  const allPages = await loadAllPages();
  const experiencesSeg = "experiences/";
  const inboxSeg = "/inbox/";
  const archiveSeg = "/archive/";
  const activeExperiences = allPages.filter((p) => {
    if (p.type !== "experience") return false;
    if (p.status !== "active") return false;
    if (!p.relPath.includes(experiencesSeg)) return false;
    if (p.relPath.includes(inboxSeg)) return false;
    if (p.relPath.includes(archiveSeg)) return false;
    return true;
  });
  report.scanned = activeExperiences.length;

  // -------------------------------------------------------------------------
  // Phase 1: aging — demote use_count=0 + old-date cards (existing P2 logic)
  // -------------------------------------------------------------------------
  const demotedSet = new Set<string>();
  for (const page of activeExperiences) {
    const useCount =
      typeof page.frontmatter.use_count === "number"
        ? page.frontmatter.use_count
        : 0;
    const dateStr = normalizeDate(page.frontmatter.date);
    if (!dateStr) continue;
    if (useCount !== 0) continue;
    if (!isOlderThan(dateStr, ARCHIVE_AGE_DAYS, today)) continue;

    // Demote: status=archived, move to archive/, remove from index.md.
    // Wrap in try-catch so a single card's failure does NOT abort the batch.
    try {
      const parts = page.relPath.split("/");
      const domain = parts[1]; // relPath = "wiki/<domain>/experiences/<slug>"
      const slug = path.basename(page.absPath, ".md");
      const archivePath = path.join(
        wikiDir,
        domain,
        "experiences",
        "archive",
        `${slug}.md`,
      );
      const archiveRelPath = `wiki/${domain}/experiences/archive/${slug}.md`;
      const oldRelPath = `wiki/${domain}/experiences/${slug}.md`;

      const updatedFm = { ...page.frontmatter, status: "archived", date: today };
      await ensureDir(path.dirname(archivePath));
      await writeFile(archivePath, serializeFrontmatter(updatedFm, page.body));
      await fs.unlink(page.absPath);
      await removePageFromIndex(oldRelPath);

      await appendLogEntry({
        date: today,
        // ADR-011: type="dream" for all /dream events (archived + summary).
        // Previously "experience" (P2 convention), migrated for semantic
        // clarity — a demoted card is a /dream action, not a new experience.
        // Also avoids MD024 duplicate-heading collisions with the original
        // `## [date] experience` entry written when the card was created.
        type: "dream",
        title:
          typeof page.frontmatter.title === "string"
            ? page.frontmatter.title
            : slug,
        details: {
          archived: archiveRelPath,
          from: oldRelPath,
          reason: `use_count=0 and date ${dateStr} older than ${ARCHIVE_AGE_DAYS} days`,
        },
      });

      report.demoted++;
      report.demoted_paths.push(archiveRelPath);
      demotedSet.add(page.relPath);
    } catch (err) {
      // One card's failure must not abort the whole batch — log and continue.
      // CLAUDE.md §19.4: never swallow exceptions; surface to stderr.
      console.error(`[dream] failed to demote ${page.absPath}:`, err);
      continue;
    }
  }

  // Remaining active cards (not demoted in Phase 1).
  const stillActive = activeExperiences.filter(
    (p) => !demotedSet.has(p.relPath),
  );

  // -------------------------------------------------------------------------
  // Phase 2: dedup scan (report-only, domain bucketing)
  // -------------------------------------------------------------------------
  report.duplicates = findDuplicatePairs(stillActive);

  // -------------------------------------------------------------------------
  // Phase 3: quality scoring + idempotent writeback
  // -------------------------------------------------------------------------
  for (const page of stillActive) {
    report.scored++;
    const newScore = scoreExperience(page.frontmatter, page.body);
    const currentScore =
      typeof page.frontmatter.quality_score === "number"
        ? page.frontmatter.quality_score
        : null;

    // Idempotent: skip writeback if current score is within epsilon of new.
    if (
      currentScore !== null &&
      Math.abs(currentScore - newScore) < QUALITY_IDEMPOTENCE_EPSILON
    ) {
      continue;
    }

    try {
      const updatedFm = { ...page.frontmatter, quality_score: round3(newScore) };
      await writeFile(page.absPath, serializeFrontmatter(updatedFm, page.body));
      report.quality_updated++;
    } catch (err) {
      // Best-effort writeback (matches use_count writeback semantics in
      // read-only.ts): log and continue, do not abort the batch.
      console.error(
        `[dream] failed to write quality_score to ${page.absPath}:`,
        err,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Summary log entry (type="dream" — ADR-011)
  // -------------------------------------------------------------------------
  try {
    await appendLogEntry({
      date: today,
      type: "dream",
      title: "/dream pass summary",
      details: {
        scanned: String(report.scanned),
        demoted: String(report.demoted),
        duplicates_found: String(report.duplicates.length),
        quality_scored: String(report.scored),
        quality_updated: String(report.quality_updated),
      },
    });
  } catch (err) {
    // Summary log failure is non-fatal — the report is still returned.
    console.error("[dream] failed to write summary log entry:", err);
  }

  return report;
}

/**
 * Phase 2: scan for suspected duplicate pairs within domain buckets.
 *
 * Bucketing by domain avoids O(N²) global pairwise comparison: two cards
 * are candidates only if they share at least one domain (matches the
 * promote-gate range in write.ts). A pair sharing multiple domains is
 * deduplicated via seenPairs (same pattern as lint.ts L477-L505).
 *
 * Buckets larger than DEDUP_BUCKET_SIZE_LIMIT are skipped with a warning —
 * O(N²) on 500+ cards would be 125k+ pairs per bucket, an expensive scan
 * for a periodic pass. Aging + quality scoring still run for those cards.
 *
 * Report-only: no files are modified. Merging is an irreversible decision
 * requiring human review (plan §"合并策略").
 */
function findDuplicatePairs(pages: PageInfo[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const seenPairs = new Set<string>(); // "${loRel}::${hiRel}"

  // Build inverted index: domain → PageInfo[]
  const buckets = new Map<string, PageInfo[]>();
  for (const p of pages) {
    for (const domain of p.domains) {
      const arr = buckets.get(domain) ?? [];
      arr.push(p);
      buckets.set(domain, arr);
    }
  }

  for (const [domain, bucket] of buckets) {
    if (bucket.length > DEDUP_BUCKET_SIZE_LIMIT) {
      console.warn(
        `[dream] domain "${domain}" has ${bucket.length} active experience cards; ` +
          `skipping dedup scan for this bucket (O(N²)=${(bucket.length * (bucket.length - 1)) / 2} pairs). ` +
          `Aging + quality scoring still run. Consider splitting the domain.`,
      );
      continue;
    }
    for (let i = 0; i < bucket.length; i++) {
      const a = bucket[i];
      for (let j = i + 1; j < bucket.length; j++) {
        const b = bucket[j];
        const [lo, hi] =
          a.relPath < b.relPath ? [a, b] : [b, a];
        const pairKey = `${lo.relPath}::${hi.relPath}`;
        if (seenPairs.has(pairKey)) continue; // pair already compared in another domain bucket
        seenPairs.add(pairKey);

        const titleSim = levenshteinRatio(a.title, b.title);
        const contentSim = sorensenDiceBigram(a.body, b.body);
        if (
          titleSim > DUPLICATE_TITLE_THRESHOLD ||
          contentSim > DUPLICATE_CONTENT_THRESHOLD
        ) {
          pairs.push({
            a: lo.relPath,
            b: hi.relPath,
            title_sim: round3(titleSim),
            content_sim: round3(contentSim),
          });
        }
      }
    }
  }

  return pairs;
}

async function main(): Promise<void> {
  const report = await dream();
  console.log(
    `[dream] scanned ${report.scanned} active experience cards: ` +
      `${report.demoted} archived, ${report.duplicates.length} duplicate pairs found, ` +
      `${report.quality_updated}/${report.scored} quality scores written.`,
  );
  if (report.demoted > 0) {
    console.log("  archived:");
    for (const p of report.demoted_paths) console.log(`    → ${p}`);
  }
  if (report.duplicates.length > 0) {
    console.log("  suspected duplicates (report-only, no merge):");
    for (const d of report.duplicates) {
      console.log(
        `    ${d.a} ↔ ${d.b}  (title=${d.title_sim}, content=${d.content_sim})`,
      );
    }
  }
}

// Only auto-run when invoked directly (`tsx src/dream.ts` / `npm run dream`),
// not when imported by tests. Matching import.meta.url against process.argv[1]
// tells us whether this module is the entry point.
const __filename = fileURLToPath(import.meta.url);
const isMain =
  !!process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  main().catch((error: unknown) => {
    console.error("[dream] fatal:", error);
    process.exit(1);
  });
}
