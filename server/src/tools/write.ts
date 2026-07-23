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
import { jsonResult, errorResult } from "./helpers.js";
import type { ToolResult } from "./helpers.js";

// ---------------------------------------------------------------------------
// kb_ingest_source
// ---------------------------------------------------------------------------

export async function kbIngestSource(args: {
  source_path: string;
  domain: string;
  type?: "source";
}): Promise<ToolResult> {
  const { source_path: sourcePath, domain } = args;
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

  if (await fileExists(wikiFullPath)) {
    return errorResult(
      `Page already exists at ${wikiRelPath}; remove it first or rename the source.`
    );
  }

  // Build staging page (AGENTS.md §3.4 status machine: staging → active).
  const frontmatter: Record<string, unknown> = {
    title: baseName,
    domain: [domain],
    type: "source",
    status: "staging",
    date: today,
    source_file: rawRelPath,
  };
  await writeFile(wikiFullPath, serializeFrontmatter(frontmatter, body));

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

  return jsonResult({ wiki_path: wikiRelPath, status: "staging" });
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

  if (await fileExists(inboxFullPath)) {
    return errorResult(
      `Experience already exists at ${inboxRelPath}; a card with this title is already in the inbox.`
    );
  }

  const frontmatter: Record<string, unknown> = {
    title,
    domain: [domain],
    type: "experience",
    status: "pending",
    confidence,
    date: today,
    source_task,
  };
  await writeFile(inboxFullPath, serializeFrontmatter(frontmatter, content));

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
    // for auditability. Duplicate detection (similarity > 0.9/0.92) is a
    // future enhancement; for now we surface the tier only.
    const tier = confidence >= 0.8 && isSingleDomain ? "auto" : "manual";

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

    if (await fileExists(activeFullPath)) {
      return errorResult(
        `Active experience already exists at ${activeRelPath}; cannot promote over it.`
      );
    }

    frontmatter.status = "active";
    frontmatter.date = today;
    await ensureDir(path.dirname(activeFullPath));
    await writeFile(activeFullPath, serializeFrontmatter(frontmatter, body));
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

    await appendLogEntry({
      date: today,
      type: "promote",
      title,
      details: {
        promoted: activeRelPath,
        from_inbox: `wiki/${domain}/experiences/inbox/${slug}.md`,
        tier,
        confidence: String(confidence),
      },
    });

    return jsonResult({ path: activeRelPath, status: "active", tier });
  }

  // action === "reject"
  frontmatter.status = "rejected";
  frontmatter.date = today;
  await writeFile(fullPath, serializeFrontmatter(frontmatter, body));

  await appendLogEntry({
    date: today,
    type: "experience",
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
