/**
 * Write MCP tool handlers (US-004):
 *   kb_ingest_source, kb_write_experience, kb_promote_experience
 *
 * Interface contracts: ARCH.md §3.1
 * Side effects: write wiki/, update index.md, append log.md
 *
 * kb_ingest_source — P1 scope: markdown sources only. Binary parsing
 *   (PDF/Word/Excel via MinerU/office2md) is a separate Python component
 *   integrated at a later phase; here we ingest pre-converted markdown.
 *
 * kb_promote_experience — P3 two-tier review gate (AGENTS.md §7.4):
 *   moves an inbox experience card to active (promote) or marks it rejected.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { getKbRoot, getRawDir, getWikiDir } from "../config.js";
import {
  readFile,
  writeFile,
  ensureDir,
  fileExists,
  listMarkdownFiles,
} from "../utils/fileio.js";
import { parseFrontmatter, serializeFrontmatter } from "../utils/frontmatter.js";
import { addPageToIndex, updateIndexHeader } from "../utils/index-md.js";
import { appendLogEntry } from "../utils/log.js";
import { loadAllPages } from "../utils/pages.js";
import {
  levenshteinRatio,
  sorensenDiceBigram,
} from "../utils/similarity.js";
import { runAutoXref } from "../utils/xref.js";
import { jsonResult, errorResult } from "./helpers.js";
import type { ToolResult } from "./helpers.js";

// ---------------------------------------------------------------------------
// Duplicate-detection thresholds (ADR-011)
// ---------------------------------------------------------------------------

/**
 * Title-similarity threshold for duplicate detection (AGENTS.md §7.4 original
 * value). Levenshtein ratio is code-point safe. Two titles differing by one
 * char out of 10 score 0.9 — empirically the right "likely duplicate" cutoff.
 */
const DUPLICATE_TITLE_THRESHOLD = 0.9;

/**
 * Body-similarity threshold for duplicate detection (ADR-011).
 *
 * Calibrated against the 4 existing active experience cards in this KB:
 *   - max pairwise body similarity among unrelated cards: 0.3557
 *   - identical body: 1.0
 *   - small-edit duplicate (1-word case change): ~0.95+
 *
 * 0.7 sits with a ~2x safety margin above the highest unrelated pair and
 * well below genuine duplicates. Re-run `npx tsx scripts/calibrate-similarity.ts`
 * if the KB grows significantly or to re-validate before tuning.
 */
const DUPLICATE_CONTENT_THRESHOLD = 0.7;

/** Duplicate match metadata returned by kb_promote_experience. */
interface DuplicateMatch {
  path: string; // active card relPath (forward slashes, no .md)
  title_sim: number;
  content_sim: number;
}

/**
 * Scan same-domain active experience cards for duplicates of the inbox card
 * being promoted (ADR-011).
 *
 * Range: only `type=experience` AND `status=active` cards whose `domain`
 * includes the inbox card's primary domain. Cross-domain cards are skipped
 * (per plan §"promote 重复检测范围": cross-domain cards typically cover
 * distinct topics, and limiting to same-domain keeps 1000-card scans ~50ms).
 *
 * A card is a suspected duplicate if title_sim > 0.9 OR content_sim > 0.7.
 * The inbox card itself is `status=pending` so it is naturally excluded.
 */
async function findDuplicateExperiences(card: {
  title: string;
  body: string;
  domain: string;
}): Promise<DuplicateMatch[]> {
  const allPages = await loadAllPages();
  const matches: DuplicateMatch[] = [];
  for (const p of allPages) {
    if (p.type !== "experience") continue;
    if (p.status !== "active") continue;
    if (!p.domains.includes(card.domain)) continue;

    const titleSim = levenshteinRatio(card.title, p.title);
    const contentSim = sorensenDiceBigram(card.body, p.body);
    if (
      titleSim > DUPLICATE_TITLE_THRESHOLD ||
      contentSim > DUPLICATE_CONTENT_THRESHOLD
    ) {
      matches.push({
        path: p.relPath,
        title_sim: round3(titleSim),
        content_sim: round3(contentSim),
      });
    }
  }
  return matches;
}

/** Round to 3 decimal places for readable log/API output. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// kb_ingest_source
// ---------------------------------------------------------------------------

export async function kbIngestSource(args: {
  source_path: string;
  domain: string;
  type?: "source";
  auto_xref?: boolean;
}): Promise<ToolResult> {
  const { source_path: sourcePath, domain, auto_xref: autoXrefFlag } = args;
  const kbRoot = getKbRoot();
  const rawDir = getRawDir();
  const wikiDir = getWikiDir();

  // Resolve + traversal protection (source must stay inside KB root).
  const fullSourcePath = path.resolve(kbRoot, sourcePath);
  const relSource = path.relative(kbRoot, fullSourcePath);
  if (relSource.startsWith("..") || path.isAbsolute(relSource)) {
    return errorResult(`Path traversal detected in source_path: ${sourcePath}`);
  }

  if (!(await fileExists(fullSourcePath))) {
    return errorResult(`Source file not found: ${sourcePath}`);
  }

  // P1: only markdown is directly ingestable. Binary formats require the
  // Python parser (MinerU/office2md), integrated in a later phase.
  const ext = path.extname(fullSourcePath).toLowerCase();
  if (ext !== ".md" && ext !== ".markdown") {
    return errorResult(
      `Binary ingestion (${ext}) requires the Python parser (MinerU/office2md), not yet integrated. Convert to markdown first.`
    );
  }

  // Record in raw/ — copy the file if it lives outside raw/ (immutability of raw/).
  const relToRaw = path.relative(rawDir, fullSourcePath);
  const isInRaw =
    !relToRaw.startsWith("..") && !path.isAbsolute(relToRaw);
  let rawRelPath: string;
  if (isInRaw) {
    rawRelPath = path.relative(kbRoot, fullSourcePath).replace(/\\/g, "/");
  } else {
    const rawTargetDir = path.join(rawDir, "assets");
    const rawTarget = path.join(rawTargetDir, path.basename(fullSourcePath));
    await ensureDir(rawTargetDir);
    await fs.copyFile(fullSourcePath, rawTarget);
    rawRelPath = path.relative(kbRoot, rawTarget).replace(/\\/g, "/");
  }

  // Read markdown body.
  const body = await readFile(fullSourcePath);

  // Derive slug + paths.
  const baseName = path.basename(fullSourcePath, ext);
  const slug = slugify(baseName) || `page-${Date.now()}`;
  const today = todayDate();

  const wikiFullPath = path.join(wikiDir, domain, `${slug}.md`);
  // Defense-in-depth: schemas.ts validates domain via kebab-case regex (S-1),
  // but verify the resolved path stays inside the wiki directory at runtime too,
  // so a future schema regression cannot enable path traversal.
  const relWiki = path.relative(wikiDir, wikiFullPath);
  if (relWiki.startsWith("..") || path.isAbsolute(relWiki)) {
    return errorResult(`Path traversal detected in domain: ${domain}`);
  }
  const wikiRelPath = `wiki/${domain}/${slug}.md`;

  // Build staging page (AGENTS.md §3.4 status machine: staging → active).
  const frontmatter: Record<string, unknown> = {
    title: baseName,
    domain: [domain],
    type: "source",
    status: "staging",
    date: today,
    source_file: rawRelPath,
  };
  // DEF-001: atomic create-only write (flag 'wx') removes the TOCTOU race
  // that existed between the prior fileExists pre-check and writeFile. On
  // EEXIST (POSIX/Windows) or EPERM (Windows target locked), surface the
  // same friendly "already exists" error the pre-check used to return.
  try {
    await writeFile(
      wikiFullPath,
      serializeFrontmatter(frontmatter, body),
      "wx"
    );
  } catch (err) {
    if (isAlreadyExistsError(err)) {
      return errorResult(
        `Page already exists at ${wikiRelPath}; remove it first or rename the source.`
      );
    }
    throw err;
  }

  // Update index.md (AGENTS.md §4.2 step 6) + header.
  await addPageToIndex(domain, {
    path: wikiRelPath,
    title: baseName,
    date: today,
    extra: "staging",
  });
  await refreshIndexHeader();

  // Append log.md (AGENTS.md §4.2 step 7).
  await appendLogEntry({
    date: today,
    type: "ingest",
    title: baseName,
    details: {
      source: rawRelPath,
      wiki: wikiRelPath,
      status: "staging",
    },
  });

  // Auto cross-reference (Karpathy "touch 5-15 pages" core thesis,
  // docs/reports/2026-08-02-missing-features-solution.md §3.3).
  // Default enabled; caller can pass auto_xref=false to skip (e.g., tests
  // or batch ingest). Best-effort: failure does not abort ingest.
  const enableXref = autoXrefFlag !== false;
  let xrefSummary: { touched: string[]; skipped: string[]; candidates: number } | null = null;
  if (enableXref) {
    try {
      // Reload pages so the newly-written staging page is included in the
      // candidate pool's "already linked" check (defense-in-depth against
      // self-link). We pass the new page's metadata separately.
      const allPages = await loadAllPages();
      const xrefResult = await runAutoXref(
        {
          relPath: wikiRelPath.replace(/\.md$/, ""),
          absPath: wikiFullPath,
          title: baseName,
          domain,
          tags: [], // staging frontmatter has no tags yet
          body,
        },
        allPages,
      );
      xrefSummary = {
        touched: xrefResult.touched,
        skipped: xrefResult.skipped,
        candidates: xrefResult.candidates.length,
      };

      // Log xref event only when we actually touched pages (avoid log noise
      // for ingest into an empty/sparse domain).
      if (xrefResult.touched.length > 0) {
        await appendLogEntry({
          date: today,
          // DEF-007: type="xref" distinct from "ingest" to avoid MD024
          // duplicate-heading collision with the ingest entry above.
          type: "xref",
          title: baseName,
          details: {
            new_page: wikiRelPath,
            touched: xrefResult.touched.join(", "),
            touched_count: String(xrefResult.touched.length),
            candidates: String(xrefResult.candidates.length),
          },
        });
      }
    } catch (err) {
      // Best-effort: auto-xref failure must NOT abort the ingest main flow.
      // Surface to stderr (CLAUDE.md §19.4 不吞异常) and continue.
      console.error(`[kb_ingest_source] auto-xref failed for ${wikiRelPath}:`, err);
      xrefSummary = { touched: [], skipped: [], candidates: 0 };
    }
  }

  return jsonResult({
    wiki_path: wikiRelPath,
    status: "staging",
    xref: xrefSummary,
  });
}

// ---------------------------------------------------------------------------
// kb_write_experience
// ---------------------------------------------------------------------------

export async function kbWriteExperience(args: {
  title: string;
  domain: string;
  content: string;
  confidence: number;
  source_task: string;
}): Promise<ToolResult> {
  const { title, domain, content, confidence, source_task } = args;
  const kbRoot = getKbRoot();
  const wikiDir = getWikiDir();

  const slug = slugify(title) || `experience-${Date.now()}`;
  const today = todayDate();

  const inboxFullPath = path.join(
    wikiDir,
    domain,
    "experiences",
    "inbox",
    `${slug}.md`
  );
  // Defense-in-depth: schemas.ts validates domain via kebab-case regex (S-1),
  // but verify the resolved path stays inside the wiki directory at runtime too.
  const relInbox = path.relative(wikiDir, inboxFullPath);
  if (relInbox.startsWith("..") || path.isAbsolute(relInbox)) {
    return errorResult(`Path traversal detected in domain: ${domain}`);
  }
  const inboxRelPath = `wiki/${domain}/experiences/inbox/${slug}.md`;

  const frontmatter: Record<string, unknown> = {
    title,
    domain: [domain],
    type: "experience",
    status: "pending",
    confidence,
    date: today,
    source_task,
  };
  // DEF-001: atomic create-only write (flag 'wx') removes the TOCTOU race
  // between the prior fileExists pre-check and writeFile. EEXIST/EPERM is
  // surfaced as the same friendly "already exists" error.
  try {
    await writeFile(
      inboxFullPath,
      serializeFrontmatter(frontmatter, content),
      "wx"
    );
  } catch (err) {
    if (isAlreadyExistsError(err)) {
      return errorResult(
        `Experience already exists at ${inboxRelPath}; a card with this title is already in the inbox.`
      );
    }
    throw err;
  }

  // Append log.md. Pending cards are NOT added to index.md until promoted
  // to active by the review gate (AGENTS.md §7.4).
  await appendLogEntry({
    date: today,
    type: "experience",
    title,
    details: {
      inbox: inboxRelPath,
      confidence: String(confidence),
      source_task,
    },
  });

  return jsonResult({ path: inboxRelPath, status: "pending" });
}

// ---------------------------------------------------------------------------
// kb_write_answer (Query 答案回写, AGENTS.md §5.2 step 5, Karpathy "good answers filed back")
// ---------------------------------------------------------------------------

/**
 * Maximum length of source_query used to derive source_task provenance.
 * Keeps frontmatter source_task compact and grep-friendly; full query is
 * retained in the log entry details.
 */
const WRITEBACK_QUERY_PROVENANCE_LEN = 50;

export async function kbWriteAnswer(args: {
  title: string;
  domain: string;
  content: string;
  confidence: number;
  source_query: string;
  cited_pages: string[];
}): Promise<ToolResult> {
  const { title, domain, content, confidence, source_query, cited_pages } = args;
  const kbRoot = getKbRoot();
  const wikiDir = getWikiDir();

  // Gating already enforced by Zod schema (cited_pages.min(2)), but defend
  // in depth: a caller bypassing the schema (CLI misuse) must still be gated.
  // WRITEBACK-RAG Utility Gate: only answers synthesizing ≥2 pages are worth
  // filing back (RAG/Wiki/Memory 三层分工 — simple fact lookups are not).
  if (!Array.isArray(cited_pages) || cited_pages.length < 2) {
    return errorResult(
      `kb_write_answer requires cited_pages.length >= 2 (WRITEBACK-RAG Utility Gate). Got ${cited_pages?.length ?? 0}. Simple fact lookups should not be filed back.`
    );
  }

  const slug = slugify(title) || `answer-${Date.now()}`;
  const today = todayDate();

  const inboxFullPath = path.join(
    wikiDir,
    domain,
    "experiences",
    "inbox",
    `${slug}.md`,
  );
  // Defense-in-depth: schemas.ts validates domain via kebab-case regex (S-1),
  // but verify the resolved path stays inside the wiki directory at runtime too.
  const relInbox = path.relative(wikiDir, inboxFullPath);
  if (relInbox.startsWith("..") || path.isAbsolute(relInbox)) {
    return errorResult(`Path traversal detected in domain: ${domain}`);
  }
  const inboxRelPath = `wiki/${domain}/experiences/inbox/${slug}.md`;

  // Provenance: derive source_task from source_query (compact, grep-friendly).
  // Strip CR/LF (CWE-117-ish — frontmatter YAML safety) and truncate.
  const provenanceQuery = source_query
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, WRITEBACK_QUERY_PROVENANCE_LEN);
  const sourceTask = `query-writeback:${provenanceQuery}`;

  // Pre-writeback duplicate detection (ADR-011 reuse): scan same-domain
  // active experience cards. Suspected duplicates do NOT block — the answer
  // still goes to inbox for human review (WRITEBACK-RAG "独立索引保持原库洁净"
  // + AGENTS.md §9.3 "禁止跳过 inbox 直接写正式经验页"). The duplicate_with
  // list is surfaced as a warning for the reviewer.
  let duplicates: DuplicateMatch[] = [];
  try {
    duplicates = await findDuplicateExperiences({
      title,
      body: content,
      domain,
    });
  } catch (err) {
    // Duplicate detection failure is non-fatal (best-effort, like /dream
    // quality writeback). Surface to stderr and proceed with empty list.
    console.error(`[kb_write_answer] duplicate detection failed:`, err);
    duplicates = [];
  }

  const frontmatter: Record<string, unknown> = {
    title,
    domain: [domain],
    type: "experience",
    status: "pending",
    confidence,
    date: today,
    source_task: sourceTask,
    // AGENTS.md §3.3: related is a pure-path array; [[...]] wikilinks
    // forbidden (js-yaml parses multiple wikilinks incorrectly). cited_pages
    // are already pure paths from the schema, safe to assign directly.
    related: cited_pages.slice(),
  };

  // DEF-001: atomic create-only write (flag 'wx') — same TOCTOU protection
  // as kb_write_experience / kb_ingest_source.
  try {
    await writeFile(
      inboxFullPath,
      serializeFrontmatter(frontmatter, content),
      "wx"
    );
  } catch (err) {
    if (isAlreadyExistsError(err)) {
      return errorResult(
        `Answer already exists at ${inboxRelPath}; a card with this title is already in the inbox.`
      );
    }
    throw err;
  }

  // Append log.md (type=writeback — DEF-007 distinct from "experience" to
  // avoid MD024 duplicate-heading collision with the experience entry pattern
  // and to make writeback events grep-able separately).
  await appendLogEntry({
    date: today,
    type: "writeback",
    title,
    details: {
      inbox: inboxRelPath,
      confidence: String(confidence),
      source_query: source_query.replace(/[\r\n]+/g, " ").trim(),
      cited_pages: cited_pages.join(", "),
      duplicate_with: duplicates.map((d) => d.path).join(", "),
    },
  });

  return jsonResult({
    path: inboxRelPath,
    status: "pending",
    source_task: sourceTask,
    duplicate_warning:
      duplicates.length > 0
        ? {
            message:
              "Suspected duplicates found in same-domain active cards. Reviewer should resolve overlap before promoting.",
            duplicates,
          }
        : null,
  });
}

// ---------------------------------------------------------------------------
// kb_promote_experience (P3 two-tier review gate, AGENTS.md §7.4)
// ---------------------------------------------------------------------------

export async function kbPromoteExperience(args: {
  inbox_path: string;
  action: "promote" | "reject";
}): Promise<ToolResult> {
  const { inbox_path: inboxPath, action } = args;
  const kbRoot = getKbRoot();
  const wikiDir = getWikiDir();

  // Resolve + traversal protection.
  const withExt = inboxPath.endsWith(".md") ? inboxPath : `${inboxPath}.md`;
  const fullPath = path.resolve(kbRoot, withExt);
  const rel = path.relative(kbRoot, fullPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return errorResult(`Path traversal detected: ${inboxPath}`);
  }
  if (!(await fileExists(fullPath))) {
    return errorResult(`Inbox page not found: ${inboxPath}`);
  }

  const content = await readFile(fullPath);
  const { frontmatter, body } = parseFrontmatter(content);

  // Validate this is actually a pending experience card (AGENTS.md §7.4).
  // The promote/reject action is only meaningful for inbox experience cards;
  // applying it to a concept/entity/source page, or to an already-promoted
  // card, would corrupt the KB state machine. Fail fast with a clear error
  // rather than silently moving non-experience content (CLAUDE.md §19.4).
  if (frontmatter.type !== "experience") {
    return errorResult(
      `Cannot ${action}: page type is "${frontmatter.type ?? "unknown"}", expected "experience". Only experience cards go through the review gate.`
    );
  }
  if (frontmatter.status !== "pending") {
    return errorResult(
      `Cannot ${action}: page status is "${frontmatter.status ?? "unknown"}", expected "pending". Only inbox-pending experience cards can be promoted or rejected.`
    );
  }

  const title =
    typeof frontmatter.title === "string"
      ? frontmatter.title
      : path.basename(fullPath, ".md");
  const today = todayDate();

  if (action === "promote") {
    const domains = Array.isArray(frontmatter.domain)
      ? frontmatter.domain.map(String)
      : [];
    if (domains.length === 0) {
      return errorResult(
        `Cannot promote: experience has no domain in frontmatter.`
      );
    }
    const confidence =
      typeof frontmatter.confidence === "number" ? frontmatter.confidence : 0;
    const isSingleDomain = domains.length === 1;
    // Tier classification (AGENTS.md §7.4): confidence ≥ 0.8 AND single-domain
    // qualifies for the auto-promotion tier. Lower confidence or cross-domain
    // cards require manual review (tier=manual) — but once a human invokes
    // promote, both tiers are promoted the same way; the tier is reported
    // for auditability.
    //
    // P3 dedup (ADR-011): scan same-domain active experience cards for
    // duplicates. Any suspected duplicate forces tier=manual regardless of
    // confidence, so a human reviewer can resolve the overlap. The inbox
    // card is still promoted (the reviewer invoked promote intentionally),
    // but the duplicate_with list is surfaced for follow-up.
    const duplicates = await findDuplicateExperiences({
      title,
      body,
      domain: domains[0],
    });
    const hasDuplicates = duplicates.length > 0;
    const tier =
      confidence >= 0.8 && isSingleDomain && !hasDuplicates
        ? "auto"
        : "manual";

    const domain = domains[0];
    const slug = path.basename(fullPath, ".md");
    const activeFullPath = path.join(
      wikiDir,
      domain,
      "experiences",
      `${slug}.md`
    );
    const relActive = path.relative(wikiDir, activeFullPath);
    if (relActive.startsWith("..") || path.isAbsolute(relActive)) {
      return errorResult(`Path traversal detected in domain: ${domain}`);
    }
    const activeRelPath = `wiki/${domain}/experiences/${slug}.md`;

    frontmatter.status = "active";
    frontmatter.date = today;
    await ensureDir(path.dirname(activeFullPath));
    // DEF-001: atomic create-only write (flag 'wx') removes the TOCTOU race
    // between the prior fileExists pre-check and writeFile. EEXIST/EPERM is
    // surfaced as the same friendly "already exists" error so promote cannot
    // silently clobber an existing active card.
    try {
      await writeFile(
        activeFullPath,
        serializeFrontmatter(frontmatter, body),
        "wx"
      );
    } catch (err) {
      if (isAlreadyExistsError(err)) {
        return errorResult(
          `Active experience already exists at ${activeRelPath}; cannot promote over it.`
        );
      }
      throw err;
    }
    // Remove from inbox now that it lives in the active location.
    await fs.unlink(fullPath);

    // Add to index.md experiences section + refresh header.
    await addPageToIndex(domain, {
      path: activeRelPath,
      title,
      date: today,
      extra: `confidence=${confidence}`,
    });
    await refreshIndexHeader();

    // Log details: include duplicate_with paths for auditability when present.
    // Multiple paths are joined with ", " (sanitizeLogField in log.ts handles
    // any embedded newlines per CWE-117).
    const logDetails: Record<string, string> = {
      promoted: activeRelPath,
      from_inbox: `wiki/${domain}/experiences/inbox/${slug}.md`,
      tier,
      confidence: String(confidence),
    };
    if (hasDuplicates) {
      logDetails.duplicate_with = duplicates.map((d) => d.path).join(", ");
      logDetails.duplicate_max_content_sim = String(
        Math.max(...duplicates.map((d) => d.content_sim)),
      );
    }

    await appendLogEntry({
      date: today,
      type: "promote",
      title,
      details: logDetails,
    });

    return jsonResult({
      path: activeRelPath,
      status: "active",
      tier,
      duplicate_with: duplicates,
    });
  }

  // action === "reject"
  frontmatter.status = "rejected";
  frontmatter.date = today;
  await writeFile(fullPath, serializeFrontmatter(frontmatter, body));

  await appendLogEntry({
    date: today,
    // DEF-007: type "reject" (not "experience") aligns with the promote
    // convention (AGENTS.md §7.4) — using a distinct type avoids MD024
    // duplicate-heading collisions with the original `## [date] experience`
    // entry written when the card was created, and is semantically clearer.
    type: "reject",
    title,
    details: {
      rejected: inboxPath,
    },
  });

  return jsonResult({ path: inboxPath, status: "rejected" });
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if a filesystem error from an atomic create (`flag: 'wx'`)
 * should be surfaced as a friendly "already exists" error.
 *
 * DEF-001: `flag: 'wx'` makes create-only writes atomic, removing the
 * TOCTOU race between a `fileExists` pre-check and `writeFile`. On a
 * collision Node.js reports `EEXIST` (POSIX + Windows). On Windows, when
 * the existing target is locked (open handle, antivirus/indexer hook),
 * `EPERM` may surface instead — treat both as "already exists" to keep
 * user-facing behavior parity with the prior pre-check.
 *
 * Trade-off: a genuine permission failure on a non-existent target would
 * also be reported as "already exists" rather than rethrown. This is
 * acceptable inside the temp KB (where such failures are rare and the
 * caller cannot act on a raw EPERM anyway), but means this helper is NOT
 * suitable for paths where EPERM must be distinguished from EEXIST.
 */
function isAlreadyExistsError(err: unknown): boolean {
  if (!(err instanceof Error) || !("code" in err)) return false;
  const code = (err as { code?: string }).code;
  return code === "EEXIST" || code === "EPERM";
}

/** Today's date as YYYY-MM-DD in the runtime's local timezone.
 *  Uses local time (not UTC) so a page written "today" is dated today
 *  from the user's perspective — important for a personal knowledge base. */
function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Slugify text to a filesystem-safe kebab-case name.
 * Keeps unicode letters/numbers (including CJK); collapses whitespace and
 * punctuation into hyphens. Returns empty string if nothing remains.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Recompute total wiki page count and refresh the index header line. */
async function refreshIndexHeader(): Promise<void> {
  const files = await listMarkdownFiles(getWikiDir());
  await updateIndexHeader(files.length, todayDate());
}
