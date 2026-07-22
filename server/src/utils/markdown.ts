/**
 * Markdown body utilities shared across tool handlers.
 * Pure functions operating on markdown text (no I/O).
 */

/**
 * Extract link targets from a markdown body.
 * Recognizes:
 *   - Obsidian wikilinks: [[target]] and [[target|alias]]
 *   - Markdown links: [text](url) — only internal/relative urls (not http(s))
 * Returns a deduplicated list of raw link target strings.
 */
export function extractLinks(body: string): string[] {
  const links = new Set<string>();

  const wikiLinkRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = wikiLinkRe.exec(body)) !== null) {
    links.add(match[1]);
  }

  const mdLinkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
  while ((match = mdLinkRe.exec(body)) !== null) {
    const url = match[2];
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      links.add(url);
    }
  }

  return [...links];
}

/**
 * Extract the content under a specific markdown heading (case-insensitive).
 * Returns the section body (excluding the heading line) up to the next
 * heading of the same or higher level.
 */
export function extractSection(body: string, sectionTitle: string): string {
  const lines = body.split("\n");
  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      if (!inSection && title.toLowerCase() === sectionTitle.toLowerCase()) {
        inSection = true;
        sectionLevel = level;
        continue; // skip the heading itself
      }

      if (inSection && level <= sectionLevel) {
        break; // next section of same or higher level
      }
    }

    if (inSection) {
      sectionLines.push(line);
    }
  }

  return sectionLines.join("\n").trim();
}
