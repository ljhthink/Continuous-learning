/**
 * Shared page loader for tools that need to scan the entire wiki.
 *
 * Extracted from lint.ts (P3 /dream dedup + quality scoring) so that
 * kb_lint and /dream share a single source of truth for page metadata
 * loading. Pure refactor — no behavior change to kb_lint.
 *
 * PageInfo carries every field either tool needs: frontmatter, body,
 * extracted links, normalized title/type/status/date, domains, tags,
 * confidence. Callers filter on type/status as needed.
 */

import path from "node:path";
import { getKbRoot, getWikiDir } from "../config.js";
import { listMarkdownFiles, readFile } from "./fileio.js";
import { parseFrontmatter, normalizeDate } from "./frontmatter.js";
import { extractLinks } from "./markdown.js";

/** Metadata + content for a single wiki page. */
export interface PageInfo {
  absPath: string;
  relPath: string; // forward slashes, no .md
  basename: string;
  frontmatter: Record<string, unknown>;
  body: string;
  links: string[]; // raw link target strings
  title: string;
  type: string | null;
  status: string | null;
  date: string | null; // YYYY-MM-DD
  domains: string[];
  tags: string[];
  confidence: number | null;
}

/**
 * Load every markdown page under wiki/ into PageInfo records.
 *
 * Hoists getKbRoot() out of the per-page loop: it reads process.env + resolves
 * a path on every call, which on a 1000-page scan added ~100ms of overhead vs
 * the old const (perf baseline lint-perf.test.ts). KB_ROOT is stable for the
 * duration of one scan, so a single snapshot is correct.
 *
 * Unreadable/malformed pages are logged to stderr and skipped (CLAUDE.md §19.4
 * 不吞异常). Returns an empty array if wiki/ does not exist.
 */
export async function loadAllPages(): Promise<PageInfo[]> {
  let files: string[];
  try {
    files = await listMarkdownFiles(getWikiDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return [];
  }
  const kbRoot = getKbRoot();
  const pages: PageInfo[] = [];
  for (const absPath of files) {
    try {
      const content = await readFile(absPath);
      const { frontmatter, body } = parseFrontmatter(content);
      const relPath = path
        .relative(kbRoot, absPath)
        .replace(/\\/g, "/")
        .replace(/\.md$/, "");
      const basename = path.basename(absPath, ".md");
      const title =
        (typeof frontmatter.title === "string" && frontmatter.title) ||
        basename;
      const type =
        typeof frontmatter.type === "string" ? frontmatter.type : null;
      const status =
        typeof frontmatter.status === "string" ? frontmatter.status : null;
      const date = normalizeDate(frontmatter.date);
      const domains = toStringArray(frontmatter.domain);
      const tags = toStringArray(frontmatter.tags);
      const confidence =
        typeof frontmatter.confidence === "number"
          ? frontmatter.confidence
          : null;
      pages.push({
        absPath,
        relPath,
        basename,
        frontmatter,
        body,
        links: extractLinks(body),
        title,
        type,
        status,
        date,
        domains,
        tags,
        confidence,
      });
    } catch (err) {
      // Skip unreadable or malformed pages, but log to stderr so the
      // operator can see which page is corrupt (CLAUDE.md §19.4 不吞异常).
      console.error(`[kb-mcp] loadAllPages: skipping unreadable page ${absPath}:`, err);
    }
  }
  return pages;
}

/** Coerce a frontmatter value to a string array (accepts string or array). */
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}
