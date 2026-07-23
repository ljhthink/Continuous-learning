import { getIndexFile } from "../config.js";
import { readFile, writeFile } from "./fileio.js";

/**
 * Index.md parsing and updating utilities.
 *
 * Index format (AGENTS.md §4.3, ARCH.md §4.3):
 *   # 知识库索引
 *   > 最后更新：YYYY-MM-DD · 总页数：N
 *   > ...
 *
 *   ## <domain>
 *   - [[wiki/<domain>/<page>]] · Page Title · YYYY-MM-DD
 *
 *   ## experiences（最近正式经验卡片）
 *   - [[wiki/<domain>/experiences/<page>]] · Title · confidence=0.x · YYYY-MM-DD
 */

export interface IndexPageEntry {
  path: string; // e.g., wiki/coding/async-patterns
  title: string;
  date: string; // YYYY-MM-DD
  extra?: string; // e.g., "confidence=0.9"
}

/** Read the raw index.md content. */
export async function readIndexContent(): Promise<string> {
  return readFile(getIndexFile());
}

/**
 * Sanitize a string for safe inclusion in a markdown index line.
 * Strips CR/LF to prevent index injection (CWE-117): a malicious domain or
 * title containing newlines could forge a fake section header or entry line.
 * `path` and `date` are system-controlled (path is built from validated
 * domain + slug; date is YYYY-MM-DD), so they need no sanitization here.
 */
function sanitizeIndexField(value: string): string {
  return value.replace(/[\r\n]/g, " ");
}

/** Add a page entry to a domain section in index.md. */
export async function addPageToIndex(
  domain: string,
  entry: IndexPageEntry
): Promise<void> {
  const content = await readFile(getIndexFile());
  const lines = content.split("\n");

  const safeDomain = sanitizeIndexField(domain);
  const safeTitle = sanitizeIndexField(entry.title);
  const safeExtra = entry.extra
    ? sanitizeIndexField(entry.extra)
    : undefined;

  const entryLine = safeExtra
    ? `- [[${entry.path}]] · ${safeTitle} · ${safeExtra} · ${entry.date}`
    : `- [[${entry.path}]] · ${safeTitle} · ${entry.date}`;

  const sectionHeader = `## ${safeDomain}`;
  let foundSection = false;
  let insertIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === sectionHeader) {
      foundSection = true;
      continue;
    }
    // Next section header marks insertion point
    if (foundSection && /^## /.test(lines[i])) {
      insertIndex = i;
      break;
    }
  }

  if (!foundSection) {
    // Section not found: create it at end
    if (lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push(sectionHeader, entryLine);
  } else if (insertIndex >= 0) {
    lines.splice(insertIndex, 0, entryLine);
  } else {
    // Section found but no next section: append at end
    lines.push(entryLine);
  }

  await writeFile(getIndexFile(), lines.join("\n"));
}

/** Remove all entries matching the given page path from index.md. */
export async function removePageFromIndex(pagePath: string): Promise<void> {
  const content = await readFile(getIndexFile());
  const lines = content
    .split("\n")
    .filter((line) => !line.includes(`[[${pagePath}]]`));
  await writeFile(getIndexFile(), lines.join("\n"));
}

/** Update the header metadata line (last update date and total page count). */
export async function updateIndexHeader(
  totalPages: number,
  lastUpdate: string
): Promise<void> {
  const content = await readFile(getIndexFile());
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("> 最后更新：")) {
      lines[i] = `> 最后更新：${lastUpdate} · 总页数：${totalPages}`;
      break;
    }
  }

  await writeFile(getIndexFile(), lines.join("\n"));
}
