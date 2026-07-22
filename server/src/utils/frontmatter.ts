import yaml from "js-yaml";

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
  const frontmatter = (yaml.load(yamlText) ?? {}) as Record<string, unknown>;
  return { frontmatter, body };
}

/** Serialize frontmatter + body back to markdown with YAML frontmatter. */
export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string
): string {
  const yamlText = yaml.dump(frontmatter, { lineWidth: -1 });
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
