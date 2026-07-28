/**
 * kb_get_backlinks tool (P4 Phase 4c): Reverse-link index for a page.
 *
 * Returns the BacklinksPanel data:
 *   - backlinks: pages that link TO this page (with surrounding context)
 *   - outbound:  pages this page links to (resolved from body links)
 *   - related:   pages listed in this page's frontmatter `related:` array
 *
 * Used by the frontend BacklinksPanel component to render the three-section
 * right-panel view in preview mode.
 */

import path from "node:path";
import { getKbRoot } from "../config.js";
import { fileExists, readFile, listMarkdownFiles } from "../utils/fileio.js";
import { parseFrontmatter } from "../utils/frontmatter.js";
import { extractLinks } from "../utils/markdown.js";
import { loadAllPages } from "../utils/pages.js";
import type { PageInfo } from "../utils/pages.js";
import { jsonResult, errorResult } from "./helpers.js";
import type { ToolResult } from "./helpers.js";

interface BacklinkEntry {
  path: string; // relPath without .md
  title: string;
  context: string; // ~120 chars surrounding the link
}

interface SimpleEntry {
  path: string;
  title: string;
}

interface BacklinksData {
  backlinks: BacklinkEntry[];
  outbound: SimpleEntry[];
  related: SimpleEntry[];
}

// ---------------------------------------------------------------------------
// kb_get_backlinks handler
// ---------------------------------------------------------------------------

export async function kbGetBacklinks(args: {
  page_path: string;
}): Promise<ToolResult> {
  const { page_path: pagePath } = args;
  const kbRoot = getKbRoot();

  // Resolve + traversal protection.
  const withExt = pagePath.endsWith(".md") ? pagePath : `${pagePath}.md`;
  const fullPath = path.resolve(kbRoot, withExt);
  const rel = path.relative(kbRoot, fullPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return errorResult(`Path traversal detected: ${pagePath}`);
  }
  if (!(await fileExists(fullPath))) {
    return errorResult(`Page not found: ${pagePath}`);
  }

  // Load target page to get its outbound links + related field.
  const targetContent = await readFile(fullPath);
  const { frontmatter: targetFm, body: targetBody } =
    parseFrontmatter(targetContent);
  const targetRelPath = rel.replace(/\\/g, "/").replace(/\.md$/, "");

  // Load all pages to build reverse index.
  let allPages: PageInfo[];
  try {
    allPages = await loadAllPages();
  } catch (err) {
    return jsonResult({
      error: `Failed to load pages: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Build basename/relPath indexes for link resolution.
  const relPathIndex = new Map<string, PageInfo>();
  const basenameIndex = new Map<string, PageInfo[]>();
  for (const p of allPages) {
    relPathIndex.set(p.relPath, p);
    const arr = basenameIndex.get(p.basename) ?? [];
    arr.push(p);
    basenameIndex.set(p.basename, arr);
  }

  // -------------------------------------------------------------------
  // Outbound links (from this page's body)
  // -------------------------------------------------------------------
  const outbound: SimpleEntry[] = [];
  const outboundSeen = new Set<string>();
  const rawLinks = extractLinks(targetBody);
  for (const target of rawLinks) {
    const resolved = resolveLink(target, basenameIndex, relPathIndex);
    if (resolved && resolved.relPath !== targetRelPath && !outboundSeen.has(resolved.relPath)) {
      outboundSeen.add(resolved.relPath);
      outbound.push({ path: resolved.relPath, title: resolved.title });
    }
  }

  // -------------------------------------------------------------------
  // Related (from frontmatter.related array)
  // -------------------------------------------------------------------
  const related: SimpleEntry[] = [];
  const relatedSeen = new Set<string>();
  const relatedRaw = Array.isArray(targetFm.related) ? targetFm.related : [];
  for (const r of relatedRaw) {
    if (typeof r !== "string") continue;
    const resolved = resolveLink(r, basenameIndex, relPathIndex);
    if (resolved && resolved.relPath !== targetRelPath && !relatedSeen.has(resolved.relPath)) {
      relatedSeen.add(resolved.relPath);
      related.push({ path: resolved.relPath, title: resolved.title });
    }
  }

  // -------------------------------------------------------------------
  // Backlinks (pages whose body links to this page)
  // -------------------------------------------------------------------
  const backlinks: BacklinkEntry[] = [];
  const backlinksSeen = new Set<string>();
  for (const linker of allPages) {
    if (linker.relPath === targetRelPath) continue;
    let linksToTarget = false;
    for (const target of linker.links) {
      const resolved = resolveLink(target, basenameIndex, relPathIndex);
      if (resolved && resolved.relPath === targetRelPath) {
        linksToTarget = true;
        break;
      }
    }
    if (!linksToTarget) continue;
    if (backlinksSeen.has(linker.relPath)) continue;
    backlinksSeen.add(linker.relPath);

    // Extract context around the link.
    const context = extractLinkContext(linker.body, targetRelPath, linker.basename);
    backlinks.push({
      path: linker.relPath,
      title: linker.title,
      context,
    });
  }

  const data: BacklinksData = { backlinks, outbound, related };
  return jsonResult(data);
}

// ---------------------------------------------------------------------------
// Link resolution (mirrors graph.ts / lint.ts resolveLink)
// ---------------------------------------------------------------------------

function resolveLink(
  target: string,
  basenameIndex: Map<string, PageInfo[]>,
  relPathIndex: Map<string, PageInfo>,
): PageInfo | null {
  let t = target.trim();
  if (t.endsWith(".md")) t = t.slice(0, -3);
  else if (t.endsWith(".markdown")) t = t.slice(0, -9);
  if (t.startsWith("./")) t = t.slice(2);

  const exact = relPathIndex.get(t);
  if (exact) return exact;

  const basename = t.includes("/") ? (t.split("/").pop() as string) : t;
  const candidates = basenameIndex.get(basename);
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  // Ambiguous: return first (callers should prefer exact relPath links).
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Context extraction: find the link in the body and return surrounding text.
// ---------------------------------------------------------------------------

function extractLinkContext(
  body: string,
  targetRelPath: string,
  targetBasename: string,
): string {
  // Look for [[<basename>]] or [[<path>|alias]] or [text](<basename>.md)
  // Try multiple patterns and pick the first match.
  const patterns = [
    new RegExp(`\\[\\[[^\\]|]*${escapeRegex(targetBasename)}[^\\]|]*(?:\\|[^\\]]+)?\\]\\]`, "i"),
    new RegExp(`\\[[^\\]]*\\]\\([^)]*${escapeRegex(targetBasename)}[^)]*\\)`, "i"),
    new RegExp(`\\[\\[[^\\]|]*${escapeRegex(targetRelPath)}[^\\]|]*(?:\\|[^\\]]+)?\\]\\]`, "i"),
  ];

  for (const re of patterns) {
    const match = body.match(re);
    if (match && match.index !== undefined) {
      const start = Math.max(0, match.index - 60);
      const end = Math.min(body.length, match.index + match[0].length + 60);
      const snippet = body.slice(start, end).replace(/\s+/g, " ").trim();
      return snippet.length > 200 ? `${snippet.slice(0, 200)}...` : snippet;
    }
  }

  // Fallback: first 120 chars of body.
  const fallback = body.replace(/\s+/g, " ").trim().slice(0, 120);
  return fallback || "(no context)";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Silence unused-import warning for listMarkdownFiles (kept for future use).
void listMarkdownFiles;
