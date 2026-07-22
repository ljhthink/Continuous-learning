/**
 * Read-only MCP tool handlers (US-002):
 *   kb_health, kb_list_categories, kb_list_recent, kb_get_page
 *
 * Interface contracts: ARCH.md §3.1
 * Utils used: frontmatter, fileio, log
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { KB_ROOT, WIKI_DIR, INDEX_FILE, LOG_FILE } from "../config.js";
import { readFile, fileExists, listMarkdownFiles } from "../utils/fileio.js";
import { parseFrontmatter, normalizeDate } from "../utils/frontmatter.js";
import { parseLog } from "../utils/log.js";
import { extractLinks, extractSection } from "../utils/markdown.js";
import { jsonResult, errorResult } from "./helpers.js";
import type { ToolResult } from "./helpers.js";

// ---------------------------------------------------------------------------
// kb_health: { total_pages, index_status, last_ingest, last_lint }
// ---------------------------------------------------------------------------

export async function kbHealth(): Promise<ToolResult> {
  const files = await listMarkdownFiles(WIKI_DIR);
  const totalPages = files.length;

  const indexExists = await fileExists(INDEX_FILE);

  let lastIngest: string | null = null;
  let lastLint: string | null = null;
  try {
    const logContent = await readFile(LOG_FILE);
    const entries = parseLog(logContent);
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (!lastIngest && entry.type === "ingest") {
        lastIngest = `${entry.date} | ${entry.title}`;
      }
      if (!lastLint && entry.type === "lint") {
        lastLint = `${entry.date} | ${entry.title}`;
      }
      if (lastIngest && lastLint) break;
    }
  } catch {
    // Log file may not exist yet
  }

  return jsonResult({
    total_pages: totalPages,
    index_status: indexExists ? "ok" : "missing",
    last_ingest: lastIngest,
    last_lint: lastLint,
  });
}

// ---------------------------------------------------------------------------
// kb_list_categories: { categories: [{ name, page_count?, last_update? }] }
// ---------------------------------------------------------------------------

export async function kbListCategories(args: {
  include_stats?: boolean;
}): Promise<ToolResult> {
  const { include_stats } = args;

  let domains: string[] = [];
  try {
    const entries = await fs.readdir(WIKI_DIR, { withFileTypes: true });
    domains = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_"))
      .map((e) => e.name);
  } catch (err) {
    // Distinguish "empty KB" (ENOENT, expected on fresh KB) from genuine
    // read failures (permissions, disk). ENOENT → empty list; other errors
    // are logged to stderr so they surface instead of being silently swallowed
    // (CLAUDE.md §19.4 "不吞异常"). Either way we return an empty list so the
    // tool stays usable, but the operator can see real failures in logs.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[kb-mcp] kb_list_categories: failed to read WIKI_DIR:", err);
    }
    return jsonResult({ categories: [] });
  }

  if (!include_stats) {
    return jsonResult({ categories: domains.map((name) => ({ name })) });
  }

  const categories: Array<{
    name: string;
    page_count: number;
    last_update: string | null;
  }> = [];

  for (const domain of domains) {
    const domainDir = path.join(WIKI_DIR, domain);
    const files = await listMarkdownFiles(domainDir);

    let lastUpdate: string | null = null;
    for (const file of files) {
      try {
        const content = await readFile(file);
        const { frontmatter } = parseFrontmatter(content);
        const date = normalizeDate(frontmatter.date);
        if (date && (!lastUpdate || date > lastUpdate)) {
          lastUpdate = date;
        }
      } catch {
        // Skip unreadable files
      }
    }

    categories.push({
      name: domain,
      page_count: files.length,
      last_update: lastUpdate,
    });
  }

  return jsonResult({ categories });
}

// ---------------------------------------------------------------------------
// kb_list_recent: { entries: [{ date, type, title, path }] }
// ---------------------------------------------------------------------------

export async function kbListRecent(args: {
  limit?: number;
  type?: string;
}): Promise<ToolResult> {
  const limit = args.limit ?? 10;
  const typeFilter = args.type;

  let entries: ReturnType<typeof parseLog> = [];
  try {
    const logContent = await readFile(LOG_FILE);
    entries = parseLog(logContent);
  } catch {
    return jsonResult({ entries: [] });
  }

  const filtered = typeFilter
    ? entries.filter((e) => e.type === typeFilter)
    : entries;

  const recent = filtered.slice(-limit).reverse();

  return jsonResult({
    entries: recent.map((e) => ({
      date: e.date,
      type: e.type,
      title: e.title,
      path: e.details.wiki || e.details.inbox || e.details.source || "",
    })),
  });
}

// ---------------------------------------------------------------------------
// kb_get_page: { frontmatter, body, links }
// ---------------------------------------------------------------------------

export async function kbGetPage(args: {
  path: string;
  section?: string;
}): Promise<ToolResult> {
  const { path: pagePath, section } = args;

  // Resolve path relative to KB root
  const withExt = pagePath.endsWith(".md") ? pagePath : `${pagePath}.md`;
  const fullPath = path.resolve(KB_ROOT, withExt);

  // Security: prevent path traversal outside KB root
  const relativePath = path.relative(KB_ROOT, fullPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return errorResult(`Path traversal detected: ${pagePath}`);
  }

  if (!(await fileExists(fullPath))) {
    return errorResult(`Page not found: ${pagePath}`);
  }

  const content = await readFile(fullPath);
  const { frontmatter, body } = parseFrontmatter(content);

  const finalBody = section ? extractSection(body, section) : body;
  const links = extractLinks(finalBody);

  return jsonResult({ frontmatter, body: finalBody, links });
}
