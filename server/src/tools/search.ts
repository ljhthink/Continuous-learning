/**
 * kb_search tool handler (US-003).
 *
 * Small-scale retrieval strategy (ARCH.md §5.2, <200 pages):
 *   scan all wiki markdown files → score by query-term overlap →
 *   return top-N with snippets. No external index dependency.
 *
 * Interface contract: ARCH.md §3.1
 *   input:  { query: string, domain?: string, limit?: number }
 *   output: { results: [{ path, title, snippet, score }] }
 *   side effect: none (read-only)
 */

import path from "node:path";
import { getKbRoot, getWikiDir } from "../config.js";
import { readFile, listMarkdownFiles } from "../utils/fileio.js";
import { parseFrontmatter } from "../utils/frontmatter.js";
import { jsonResult } from "./helpers.js";
import type { ToolResult } from "./helpers.js";

/** Scoring weights: title matches are worth 3x body matches. */
const TITLE_WEIGHT = 3;
const BODY_WEIGHT = 1;
const DEFAULT_LIMIT = 10;
const SNIPPET_MAX_LEN = 200;
const SNIPPET_WINDOW = 40; // chars of context before the matched term

interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
}

export async function kbSearch(args: {
  query: string;
  domain?: string;
  limit?: number;
}): Promise<ToolResult> {
  const { query, domain, limit: limitArg } = args;
  const limit = limitArg ?? DEFAULT_LIMIT;

  const terms = tokenize(query);
  if (terms.length === 0) {
    return jsonResult({ results: [] });
  }

  let allFiles: string[] = [];
  try {
    allFiles = await listMarkdownFiles(getWikiDir());
  } catch (err) {
    // See note in kb_list_categories: ENOENT on a fresh KB is expected;
    // other failures are logged per CLAUDE.md §19.4.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[kb-mcp] kb_search: failed to list markdown files:", err);
    }
    return jsonResult({ results: [] });
  }

  const results: SearchResult[] = [];
  // Hoist getKbRoot() out of the per-file loop (see lint.ts for rationale).
  const kbRoot = getKbRoot();

  for (const file of allFiles) {
    try {
      const content = await readFile(file);
      const { frontmatter, body } = parseFrontmatter(content);

      // Domain filter: use frontmatter.domain as source of truth.
      if (domain) {
        const pageDomains = Array.isArray(frontmatter.domain)
          ? frontmatter.domain.map(String)
          : [];
        if (!pageDomains.includes(domain)) continue;
      }

      const title =
        (typeof frontmatter.title === "string" && frontmatter.title) ||
        path.basename(file, ".md");
      const titleLower = title.toLowerCase();
      const bodyLower = body.toLowerCase();

      let score = 0;
      for (const term of terms) {
        if (titleLower.includes(term)) score += TITLE_WEIGHT;
        score += BODY_WEIGHT * countOccurrences(bodyLower, term);
      }

      if (score > 0) {
        const relPath = path.relative(kbRoot, file).replace(/\\/g, "/");
        const snippet = extractSnippet(body, terms, SNIPPET_MAX_LEN);
        results.push({ path: relPath, title, snippet, score });
      }
    } catch (err) {
      // Skip unreadable or malformed pages, but surface to stderr (CLAUDE.md §19.4).
      console.error(`[kb-mcp] kb_search: skipping unreadable page ${file}:`, err);
    }
  }

  results.sort((a, b) => b.score - a.score);
  return jsonResult({ results: results.slice(0, limit) });
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Tokenize a query into lowercase search terms.
 * Splits on whitespace and punctuation. CJK runs are kept intact (no word
 * segmentation), so a Chinese phrase is matched as a single substring.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}'"\/\\<>@#$%^&*+=|~`\-]+/)
    .filter((t) => t.length > 0);
}

/** Count case-insensitive occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  return haystack.split(needle).length - 1;
}

/**
 * Extract a snippet around the earliest match of any term.
 * Falls back to the start of the body if no term is found.
 */
function extractSnippet(body: string, terms: string[], maxLen: number): string {
  const lower = body.toLowerCase();
  let earliest = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx !== -1 && (earliest === -1 || idx < earliest)) {
      earliest = idx;
    }
  }

  const start = earliest === -1 ? 0 : Math.max(0, earliest - SNIPPET_WINDOW);
  let snippet = body.slice(start, start + maxLen);

  // Ellipsis if truncated.
  if (start > 0) snippet = "…" + snippet;
  if (start + maxLen < body.length) snippet = snippet + "…";

  // Collapse internal newlines for a single-line snippet.
  return snippet.replace(/\s+/g, " ").trim();
}
