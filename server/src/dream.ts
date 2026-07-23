#!/usr/bin/env tsx
/**
 * /dream — periodic aging pass for the continuous-evolution KB (AGENTS.md §7.5).
 *
 * Demotes experience cards that are BOTH:
 *   - use_count === 0  (never retrieved since last reset)
 *   - date older than 90 days
 * from status=active → status=archived, moving the file from
 *   wiki/<domain>/experiences/<slug>.md
 * to
 *   wiki/<domain>/experiences/archive/<slug>.md
 *
 * Archived pages remain retrievable (kb_search / kb_get_page still find them)
 * but are excluded from the lint link graph (LINK_GRAPH_SKIP_STATUSES) and do
 * not surface as top results in future passes.
 *
 * Run: `npm run dream` (or `tsx src/dream.ts`). Reads KB_ROOT from env.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { getWikiDir } from "./config.js";
import {
  listMarkdownFiles,
  readFile,
  writeFile,
  ensureDir,
} from "./utils/fileio.js";
import {
  parseFrontmatter,
  serializeFrontmatter,
  normalizeDate,
} from "./utils/frontmatter.js";
import { removePageFromIndex } from "./utils/index-md.js";
import { appendLogEntry } from "./utils/log.js";

const ARCHIVE_AGE_DAYS = 90;

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

interface DreamReport {
  scanned: number;
  demoted: number;
  demoted_paths: string[];
}

export async function dream(): Promise<DreamReport> {
  const wikiDir = getWikiDir();
  const today = todayDate();
  const report: DreamReport = { scanned: 0, demoted: 0, demoted_paths: [] };

  const inboxSeg = path.join("experiences", "inbox");
  const archiveSeg = path.join("experiences", "archive");
  const experiencesSeg = path.join("experiences");

  let allFiles: string[] = [];
  try {
    allFiles = await listMarkdownFiles(wikiDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    console.log("[dream] wiki directory does not exist; nothing to do.");
    return report;
  }

  for (const file of allFiles) {
    // Only consider active experience cards directly under experiences/
    // (skip inbox/ pending cards and already-archived cards).
    const relToWiki = path.relative(wikiDir, file);
    const normalized = relToWiki.split(path.sep).join("/");
    if (!normalized.includes(`/${experiencesSeg.split(path.sep).join("/")}/`)) {
      continue;
    }
    if (normalized.includes(`/${inboxSeg.split(path.sep).join("/")}/`)) continue;
    if (normalized.includes(`/${archiveSeg.split(path.sep).join("/")}/`)) continue;

    let content: string;
    try {
      content = await readFile(file);
    } catch {
      continue;
    }
    const { frontmatter, body } = parseFrontmatter(content);
    if (frontmatter.type !== "experience") continue;
    if (frontmatter.status !== "active") continue;

    report.scanned++;

    const useCount =
      typeof frontmatter.use_count === "number" ? frontmatter.use_count : 0;
    const dateStr = normalizeDate(frontmatter.date);
    if (!dateStr) continue;

    if (useCount !== 0) continue;
    if (!isOlderThan(dateStr, ARCHIVE_AGE_DAYS, today)) continue;

    // Demote: status=archived, move to archive/, remove from index.md.
    // Wrap the whole demote block in try-catch so a single card's failure
    // (e.g., archive dir not writable, index.md locked) does NOT abort the
    // batch — we log and continue to the next card. Without this, one bad
    // card would skip all subsequent demotions, defeating the periodic pass.
    try {
      const parts = normalized.split("/");
      const domain = parts[0];
      const slug = path.basename(file, ".md");
      const archivePath = path.join(
        wikiDir,
        domain,
        "experiences",
        "archive",
        `${slug}.md`
      );
      const archiveRelPath = `wiki/${domain}/experiences/archive/${slug}.md`;
      const oldRelPath = `wiki/${domain}/experiences/${slug}.md`;

      frontmatter.status = "archived";
      frontmatter.date = today;
      await ensureDir(path.dirname(archivePath));
      await writeFile(archivePath, serializeFrontmatter(frontmatter, body));
      await fs.unlink(file);
      await removePageFromIndex(oldRelPath);

      await appendLogEntry({
        date: today,
        type: "experience",
        title: typeof frontmatter.title === "string" ? frontmatter.title : slug,
        details: {
          archived: archiveRelPath,
          from: oldRelPath,
          reason: `use_count=0 and date ${dateStr} older than ${ARCHIVE_AGE_DAYS} days`,
        },
      });

      report.demoted++;
      report.demoted_paths.push(archiveRelPath);
    } catch (err) {
      // One card's failure must not abort the whole batch — log and continue.
      // CLAUDE.md §19.4: never swallow exceptions; surface to stderr.
      console.error(`[dream] failed to demote ${file}:`, err);
      continue;
    }
  }

  return report;
}

async function main(): Promise<void> {
  const report = await dream();
  console.log(
    `[dream] scanned ${report.scanned} active experience cards, demoted ${report.demoted} to archived.`
  );
  if (report.demoted > 0) {
    for (const p of report.demoted_paths) {
      console.log(`  → ${p}`);
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
