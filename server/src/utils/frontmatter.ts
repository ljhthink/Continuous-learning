import { load, dump } from "js-yaml";

/**
 * Frontmatter parsing and serialization for wiki markdown pages.
 * Format: YAML frontmatter delimited by --- markers, followed by markdown body.
 * Schema defined in AGENTS.md §3.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

/** Parse markdown into frontmatter metadata and body. */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const [, yamlText, body] = match;
  // js-yaml 5 throws YAMLException on empty/invalid YAML (v4 returned
  // undefined). Wrap in try/catch so a malformed frontmatter block degrades
  // gracefully to empty frontmatter instead of crashing the calling tool
  // (kb_get_page / kb_promote_experience / /dream). kb_lint has its own
  // try/catch and will report the malformed page via the frontmatter check.
  let frontmatter: Record<string, unknown> = {};
  try {
    frontmatter = (load(yamlText) ?? {}) as Record<string, unknown>;
  } catch (err) {
    // CLAUDE.md §19.4: no swallowed exceptions. Log to stderr (MCP uses
    // stdout, so stderr never corrupts the protocol). Degrade to empty
    // frontmatter so callers (kb_get_page / promote / dream) don't crash;
    // kb_lint's frontmatter check will also report the malformed page.
    console.error(`[frontmatter] malformed YAML, degrading to empty: ${err instanceof Error ? err.message : String(err)}`);
    frontmatter = {};
  }
  return { frontmatter, body };
}

/** Serialize frontmatter + body back to markdown with YAML frontmatter. */
export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string
): string {
  const yamlText = dump(frontmatter, { lineWidth: -1 });
  return `---\n${yamlText}---\n${body}`;
}

/**
 * Normalize a frontmatter date value to a "YYYY-MM-DD" string.
 * js-yaml parses unquoted ISO dates (e.g., `date: 2026-07-20`) into JavaScript
 * Date objects at UTC midnight; we convert back to a string for consistent
 * lexicographic comparison. Quoted strings pass through unchanged.
 */
export function normalizeDate(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}
