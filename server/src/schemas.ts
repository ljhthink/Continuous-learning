import { z } from "zod";

/**
 * Zod input schemas for all 9 MCP tools.
 * These are ZodRawShape objects (plain objects of Zod types),
 * passed directly to server.tool(name, description, schema, handler).
 *
 * Interface contracts defined in ARCH.md §3.1.
 */

/** kb_search: Query the knowledge base. */
export const kbSearchSchema = {
  query: z.string().max(1000).describe("Search query string"),
  domain: z
    .string()
    .max(64)
    .optional()
    .describe("Filter by domain (e.g., 'coding', 'emotions')"),
  limit: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("Max results (default 10)"),
};

/** kb_get_page: Retrieve a full wiki page. */
export const kbGetPageSchema = {
  path: z
    .string()
    .max(512)
    .describe(
      "Wiki page path relative to KB root (e.g., 'wiki/coding/async-patterns')"
    ),
  section: z
    .string()
    .max(200)
    .optional()
    .describe("Specific section heading to return (default: full page)"),
};

/**
 * Domain name validation pattern: kebab-case (lowercase alphanumeric + hyphens).
 * Prevents path traversal via domain parameter (S-1 security fix).
 */
const DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*$/;

/** kb_ingest_source: Ingest a new source file into the knowledge base. */
export const kbIngestSourceSchema = {
  source_path: z
    .string()
    .max(512)
    .describe(
      "Path to raw source file relative to KB root (e.g., 'raw/pdf/example.pdf')"
    ),
  domain: z
    .string()
    .regex(
      DOMAIN_REGEX,
      "Domain must be kebab-case (lowercase alphanumeric with hyphens)"
    )
    .max(64)
    .describe("Target domain (e.g., 'coding')"),
  type: z
    .literal("source")
    .optional()
    .describe("Page type (always 'source' for ingested files)"),
};

/** kb_write_experience: Write a reusable experience card to inbox. */
export const kbWriteExperienceSchema = {
  title: z.string().max(500).describe("Experience title"),
  domain: z
    .string()
    .regex(
      DOMAIN_REGEX,
      "Domain must be kebab-case (lowercase alphanumeric with hyphens)"
    )
    .max(64)
    .describe("Target domain (e.g., 'coding')"),
  content: z
    .string()
    .max(100000)
    .describe(
      "Experience content in markdown (background, solution, evidence, applicability)"
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score 0-1 (0.9=highly certain, 0.6=speculative)"),
  source_task: z
    .string()
    .max(200)
    .describe("Source task identifier (e.g., 'task-async-refactor-001')"),
};

/**
 * kb_promote_experience: Two-tier review gate (AGENTS.md §7.4).
 * Moves an inbox experience card to active (promote) or marks it rejected.
 */
export const kbPromoteExperienceSchema = {
  inbox_path: z
    .string()
    .max(512)
    .describe(
      "Path to the inbox experience card relative to KB root (e.g., 'wiki/coding/experiences/inbox/foo')"
    ),
  action: z
    .enum(["promote", "reject"])
    .describe(
      "promote = move to wiki/<domain>/experiences/ with status=active; reject = mark status=rejected (stays in inbox)"
    ),
};

/** kb_list_categories: Browse knowledge base domain structure. */
export const kbListCategoriesSchema = {
  include_stats: z
    .boolean()
    .optional()
    .describe("Include page count and last update per category"),
};

/** kb_list_recent: List recent log entries. */
export const kbListRecentSchema = {
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Max entries (default 10)"),
  type: z
    .enum(["ingest", "query", "lint", "experience", "init"])
    .optional()
    .describe("Filter by event type"),
};

/**
 * kb_lint: Run health checks on the knowledge base.
 *
 * Checks (AGENTS.md §6.2):
 *   frontmatter    — missing or incomplete frontmatter fields (high)
 *   contradictions — conflicting statements or duplicate titles (high)
 *   orphans        — pages with no inbound links (mid; high-confidence experiences exempt)
 *   stale          — source page newer than its referrers (high)
 *   missing_xref   — same-domain pages sharing tags but not cross-linked (mid)
 *
 * Note: AGENTS.md §6.2 also lists "data gaps" (low), intentionally omitted — requires
 *       heuristic judgment unsuitable for deterministic linting.
 */
export const kbLintSchema = {
  checks: z
    .array(
      z.enum([
        "frontmatter",
        "contradictions",
        "orphans",
        "stale",
        "missing_xref",
      ])
    )
    .optional()
    .describe("Specific checks to run (default: all)"),
};

/** kb_health: Query server and knowledge base health. */
export const kbHealthSchema = {};
