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

/**
 * Serialize frontmatter + body back to markdown with YAML frontmatter.
 *
 * Output format matches hand-written pages (AGENTS.md §3.1.1, ADR-008 decision 1):
 *   - Top-level arrays use flow style on a single line (`domain: [coding]`)
 *     via `flowLevel: 1` — js-yaml's default would emit block style
 *     (`domain:\n  - coding`), diverging from hand-written pages.
 *   - Line wrapping is disabled (`lineWidth: -1`) so scalar values stay on
 *     one line, keeping frontmatter compact and grep-friendly.
 *   - ISO dates (`date: 2026-07-24`) are emitted unquoted. js-yaml v5
 *     serializes string-valued dates with single quotes by default
 *     (`date: '2026-07-24'`); we strip the quotes post-serialization so
 *     frontmatter reads `date: 2026-07-24` matching hand-written pages.
 *     On read, `parseFrontmatter` yields a string for both quoted and
 *     unquoted forms (js-yaml v5 CORE_SCHEMA parses `date: 2026-07-24` as
 *     a string, not a Date), so the quote-stripping is purely cosmetic and
 *     does not affect semantics. `normalizeDate` retains Date-object handling
 *     as defensive code for future schema changes.
 *   - A blank line separates the closing `---` from the body to satisfy
 *     markdownlint MD022 (blank line after a heading / `---` fence).
 */
export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string
): string {
  const yamlText = dump(frontmatter, {
    flowLevel: 1,
    lineWidth: -1,
    noRefs: true,
  });
  // Strip single quotes that js-yaml adds around the `date` field's ISO
  // value so the emitted frontmatter matches hand-written form
  // (`date: 2026-07-24`). The regex is anchored to the `date:` key to avoid
  // accidentally unquoting other fields that legitimately need quotes (e.g.
  // a `source_task` value that happens to look like a date). Only strips
  // when the entire value is a quoted YYYY-MM-DD — partial matches (e.g.
  // dates inside a longer string) are left untouched.
  const stripped = yamlText.replace(
    /^(\s*date:\s*)'(\d{4}-\d{2}-\d{2})'$/gm,
    "$1$2"
  );
  // Ensure exactly one blank line between the closing `---` and the body
  // (MD022). Trim leading newlines from body so we control the spacing
  // deterministically rather than depending on the caller's body formatting.
  const normalizedBody = body.replace(/^\n+/, "");
  return `---\n${stripped}---\n\n${normalizedBody}`;
}

/**
 * Normalize a frontmatter date value to a "YYYY-MM-DD" string.
 *
 * js-yaml v5 with CORE_SCHEMA parses both `date: 2026-07-20` and
 * `date: '2026-07-20'` as strings (verified empirically for v5.2.1), so in
 * practice this function receives a string and passes it through. The
 * Date-object branch is retained as defensive code: if a future js-yaml
 * upgrade or schema change reintroduces Date parsing, this function still
 * produces a consistent YYYY-MM-DD string for lexicographic comparison.
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
