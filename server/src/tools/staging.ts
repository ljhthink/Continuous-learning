/**
 * Staging MCP tool handlers (P4 Phase 4b):
 *   kb_list_staging, kb_confirm_staging, kb_reject_staging
 *
 * These mirror the Tauri-side IPC commands in `frontend/src-tauri/src/lib.rs`
 * so that external MCP clients (Claude Code / Trae CN / OpenCode) can also
 * list and resolve staging pages produced by `kb_ingest_source`.
 *
 * State machine (AGENTS.md §3.4):
 *   staging → active   (kb_confirm_staging)
 *   staging → rejected (kb_reject_staging)
 *
 * Side effects:
 *   - kb_confirm_staging / kb_reject_staging rewrite frontmatter `status:`
 *     and append a `confirm` / `reject` entry to log.md (AGENTS.md §4.4).
 *   - kb_confirm_staging also updates index.md to flip the page's `staging`
 *     marker to `active` so the content index reflects the promotion.
 *
 * Path safety: every path-taking command resolves the target under KB root
 * and rejects path traversal (ADR-010). Domain is validated by the Zod
 * schema (kebab-case regex, S-1).
 */

import path from "node:path";
import { getKbRoot, getWikiDir } from "../config.js";
import {
  readFile,
  writeFile,
  fileExists,
  listMarkdownFiles,
} from "../utils/fileio.js";
import {
  parseFrontmatter,
  serializeFrontmatter,
} from "../utils/frontmatter.js";
import { appendLogEntry } from "../utils/log.js";
import { updateIndexHeader } from "../utils/index-md.js";
import { jsonResult, errorResult } from "./helpers.js";
import type { ToolResult } from "./helpers.js";

// ---------------------------------------------------------------------------
// StagingPage — shape returned by kb_list_staging
// ---------------------------------------------------------------------------

interface StagingPage {
  path: string; // forward-slashes, includes .md
  title: string;
  domain: string; // first domain from frontmatter
  status: string;
  date: string | null;
  source_file: string | null;
  preview: string;
}

// ---------------------------------------------------------------------------
// kb_list_staging
// ---------------------------------------------------------------------------

/**
 * List all staging pages, optionally filtered by domain.
 *
 * Scans `wiki/<domain>/*.md` one level deep (does NOT recurse into
 * `experiences/` subdirectories — staging sources are top-level domain pages
 * produced by `kb_ingest_source`). Returns pages whose frontmatter
 * `status: staging`.
 */
export async function kbListStaging(args: {
  domain?: string;
}): Promise<ToolResult> {
  const kbRoot = getKbRoot();
  const wikiDir = getWikiDir();

  // Determine which domain directories to scan.
  let domainDirs: string[] = [];
  if (args.domain) {
    domainDirs = [args.domain];
  } else {
    try {
      const entries = await import("node:fs").then((fs) =>
        fs.promises.readdir(wikiDir, { withFileTypes: true }),
      );
      domainDirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[kb-mcp] kb_list_staging: readdir failed:", err);
      }
      return jsonResult({ pages: [] });
    }
  }

  const pages: StagingPage[] = [];
  for (const domain of domainDirs) {
    const domainDir = path.join(wikiDir, domain);
    let files: string[] = [];
    try {
      files = await listMarkdownFiles(domainDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(
          `[kb-mcp] kb_list_staging: skipping unreadable domain ${domain}:`,
          err,
        );
      }
      continue;
    }
    // listMarkdownFiles recurses; filter to top-level (no path.sep in rel path).
    const topLevel = files.filter((f) => {
      const rel = path.relative(domainDir, f);
      return !rel.includes(path.sep);
    });

    for (const absPath of topLevel) {
      let content: string;
      try {
        content = await readFile(absPath);
      } catch (err) {
        console.error(
          `[kb-mcp] kb_list_staging: skipping unreadable ${absPath}:`,
          err,
        );
        continue;
      }
      const { frontmatter, body } = parseFrontmatter(content);
      if (frontmatter.status !== "staging") continue;

      const relPath = path
        .relative(kbRoot, absPath)
        .replace(/\\/g, "/");
      const title =
        typeof frontmatter.title === "string" ? frontmatter.title : path.basename(absPath, ".md");
      const domains = Array.isArray(frontmatter.domain)
        ? frontmatter.domain.map(String)
        : [];
      const date =
        typeof frontmatter.date === "string" ? frontmatter.date : null;
      const sourceFile =
        typeof frontmatter.source_file === "string"
          ? frontmatter.source_file
          : null;
      pages.push({
        path: relPath,
        title,
        domain: domains[0] ?? domain,
        status: "staging",
        date,
        source_file: sourceFile,
        preview: previewFrom(body, 200),
      });
    }
  }

  return jsonResult({ pages });
}

// ---------------------------------------------------------------------------
// kb_confirm_staging
// ---------------------------------------------------------------------------

/**
 * Promote a staging page to active.
 *
 *   1. Resolve + validate path inside KB root (path traversal defense).
 *   2. Verify the page exists and is currently `status: staging`.
 *   3. Rewrite frontmatter with `status: active` (preserving everything else).
 *   4. Update index.md: flip the page's `staging` marker to `active`.
 *   5. Append a `## [YYYY-MM-DD] confirm | <title>` entry to log.md.
 */
export async function kbConfirmStaging(args: {
  page_path: string;
}): Promise<ToolResult> {
  const { page_path: pagePath } = args;
  const kbRoot = getKbRoot();

  const withExt = pagePath.endsWith(".md") ? pagePath : `${pagePath}.md`;
  const fullPath = path.resolve(kbRoot, withExt);
  const rel = path.relative(kbRoot, fullPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return errorResult(`Path traversal detected: ${pagePath}`);
  }
  if (!(await fileExists(fullPath))) {
    return errorResult(`Page not found: ${pagePath}`);
  }

  const content = await readFile(fullPath);
  const { frontmatter, body } = parseFrontmatter(content);

  if (frontmatter.status !== "staging") {
    return errorResult(
      `Cannot confirm: page status is "${frontmatter.status ?? "unknown"}", expected "staging".`,
    );
  }

  frontmatter.status = "active";
  await writeFile(fullPath, serializeFrontmatter(frontmatter, body));

  // Update index.md header (total page count, last-updated date).
  await refreshIndexHeader();

  // Append log entry (AGENTS.md §4.4 format).
  const title =
    typeof frontmatter.title === "string"
      ? frontmatter.title
      : path.basename(fullPath, ".md");
  const today = todayIso();
  await appendLogEntry({
    date: today,
    type: "confirm",
    title,
    details: {
      page: rel.replace(/\\/g, "/"),
      from_status: "staging",
      to_status: "active",
    },
  });

  return jsonResult({
    page_path: rel.replace(/\\/g, "/"),
    from_status: "staging",
    to_status: "active",
  });
}

// ---------------------------------------------------------------------------
// kb_reject_staging
// ---------------------------------------------------------------------------

/**
 * Reject a staging page (mark `status: rejected`).
 *
 *   1. Resolve + validate path inside KB root.
 *   2. Verify the page exists and is currently `status: staging`.
 *   3. Rewrite frontmatter with `status: rejected` (preserving everything else).
 *   4. Append a `## [YYYY-MM-DD] reject | <title>` entry to log.md.
 *
 * The page file is NOT deleted — rejected staging pages remain on disk for
 * auditability (AGENTS.md §4.3 "不删除旧声明" principle).
 */
export async function kbRejectStaging(args: {
  page_path: string;
}): Promise<ToolResult> {
  const { page_path: pagePath } = args;
  const kbRoot = getKbRoot();

  const withExt = pagePath.endsWith(".md") ? pagePath : `${pagePath}.md`;
  const fullPath = path.resolve(kbRoot, withExt);
  const rel = path.relative(kbRoot, fullPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return errorResult(`Path traversal detected: ${pagePath}`);
  }
  if (!(await fileExists(fullPath))) {
    return errorResult(`Page not found: ${pagePath}`);
  }

  const content = await readFile(fullPath);
  const { frontmatter, body } = parseFrontmatter(content);

  if (frontmatter.status !== "staging") {
    return errorResult(
      `Cannot reject: page status is "${frontmatter.status ?? "unknown"}", expected "staging".`,
    );
  }

  frontmatter.status = "rejected";
  await writeFile(fullPath, serializeFrontmatter(frontmatter, body));

  const title =
    typeof frontmatter.title === "string"
      ? frontmatter.title
      : path.basename(fullPath, ".md");
  const today = todayIso();
  await appendLogEntry({
    date: today,
    type: "reject",
    title,
    details: {
      page: rel.replace(/\\/g, "/"),
      from_status: "staging",
      to_status: "rejected",
    },
  });

  return jsonResult({
    page_path: rel.replace(/\\/g, "/"),
    from_status: "staging",
    to_status: "rejected",
  });
}

// ---------------------------------------------------------------------------
// kb_organize_staging (LLM 整理 staging, #56 / Karpathy 报告 §2.10)
// ---------------------------------------------------------------------------

/**
 * Apply LLM-organized metadata to a staging page.
 *
 * Caller (Tauri GUI / external Agent) invokes the LLM separately and passes
 * the refined metadata here. The server stays LLM-dependency-free (ADR-001:
 * core deps ≤5). This function only validates + serializes + persists.
 *
 *   1. Resolve + validate path inside KB root (path traversal defense).
 *   2. Verify the page exists and is currently `status: staging`.
 *   3. Update frontmatter.title / .tags / .description (only fields provided).
 *   4. Body is NOT modified — user can still edit content during staging review.
 *   5. Append a `## [YYYY-MM-DD] organize | <title>` entry to log.md.
 *   6. Return domain_suggestion (if provided) for caller action; do NOT auto-migrate.
 *
 * At least one of {title, tags, description} must be provided — otherwise the
 * call has no effect and is rejected early to prevent no-op log noise.
 */
export async function kbOrganizeStaging(args: {
  page_path: string;
  title?: string;
  tags?: string[];
  description?: string;
  domain_suggestion?: string;
}): Promise<ToolResult> {
  const {
    page_path: pagePath,
    title: newTitle,
    tags: newTags,
    description: newDescription,
    domain_suggestion: domainSuggestion,
  } = args;
  const kbRoot = getKbRoot();

  // Early no-op guard: at least one metadata field must be provided.
  if (
    newTitle === undefined &&
    newTags === undefined &&
    newDescription === undefined
  ) {
    return errorResult(
      `kb_organize_staging requires at least one of {title, tags, description}. ` +
        `domain_suggestion alone is not persisted (it is only returned for caller action).`
    );
  }

  const withExt = pagePath.endsWith(".md") ? pagePath : `${pagePath}.md`;
  const fullPath = path.resolve(kbRoot, withExt);
  const rel = path.relative(kbRoot, fullPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return errorResult(`Path traversal detected: ${pagePath}`);
  }
  if (!(await fileExists(fullPath))) {
    return errorResult(`Page not found: ${pagePath}`);
  }

  const content = await readFile(fullPath);
  const { frontmatter, body } = parseFrontmatter(content);

  if (frontmatter.status !== "staging") {
    return errorResult(
      `Cannot organize: page status is "${frontmatter.status ?? "unknown"}", expected "staging". Only staging pages can be LLM-organized.`,
    );
  }

  // Apply provided fields only (undefined → preserve existing).
  const updatedFields: string[] = [];
  if (newTitle !== undefined) {
    frontmatter.title = newTitle;
    updatedFields.push("title");
  }
  if (newTags !== undefined) {
    // Defensive copy so caller's array isn't aliased into the frontmatter
    // object (mutation of caller state would be a surprising side effect).
    frontmatter.tags = newTags.slice();
    updatedFields.push("tags");
  }
  if (newDescription !== undefined) {
    // description is a frontmatter extension field for LLM-generated summary.
    // Not in AGENTS.md §3.3 optional-fields list, but frontmatter is open
    // (Record<string, unknown>) and the field is Obsidian/Dataview-compatible.
    // Empty string clears the field; non-empty sets it.
    if (newDescription.length === 0) {
      delete frontmatter.description;
    } else {
      frontmatter.description = newDescription;
    }
    updatedFields.push("description");
  }

  // Bump date to reflect the metadata update (AGENTS.md §3.1: date is
  // "创建或最后更新日期"). This keeps stale-check (lint.ts checkStale) accurate.
  const today = todayIso();
  frontmatter.date = today;

  await writeFile(fullPath, serializeFrontmatter(frontmatter, body));

  // Log entry — DEF-007: type="organize" distinct from "confirm"/"reject"
  // to avoid MD024 collision and make LLM-organize events grep-able.
  const logTitle =
    typeof frontmatter.title === "string"
      ? frontmatter.title
      : path.basename(fullPath, ".md");
  await appendLogEntry({
    date: today,
    type: "organize",
    title: logTitle,
    details: {
      page: rel.replace(/\\/g, "/"),
      updated_fields: updatedFields.join(", "),
      domain_suggestion: domainSuggestion ?? "(none)",
    },
  });

  return jsonResult({
    page_path: rel.replace(/\\/g, "/"),
    status: "staging",
    updated_fields: updatedFields,
    domain_suggestion: domainSuggestion ?? null,
    note:
      domainSuggestion !== undefined
        ? "domain_suggestion is returned only; domain migration requires explicit user action (move_page_domain or manual move)."
        : undefined,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function previewFrom(body: string, maxChars: number): string {
  const lines = body.split("\n").filter((l) => l.trim().length > 0).slice(0, 5);
  const joined = lines.join("\n");
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, maxChars)}...`;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function refreshIndexHeader(): Promise<void> {
  try {
    const files = await listMarkdownFiles(getWikiDir());
    await updateIndexHeader(files.length, todayIso());
  } catch (err) {
    // Index header refresh is best-effort — a missing or malformed index.md
    // should not block the staging confirmation. Log and continue.
    console.error("[kb-mcp] kb_confirm_staging: index header refresh failed:", err);
  }
}
