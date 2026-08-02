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
  page_path: z
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
  auto_xref: z
    .boolean()
    .optional()
    .describe(
      "Auto-update cross-references in 5-15 related wiki pages (Karpathy 'touch 5-15 pages'). Default true. Set false to skip."
    ),
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

/**
 * kb_write_answer: Write a valuable Query answer back as an experience card
 * (AGENTS.md §5.2 step 5 "回写有价值的发现"; Karpathy "good answers filed back").
 *
 * Goes through the inbox two-tier review gate — never writes directly to the
 * active wiki (AGENTS.md §9.3). The caller is responsible for rewriting the
 * answer in encyclopedic style (not query-answer style) before calling.
 *
 * Gating (WRITEBACK-RAG Utility Gate simplified): cited_pages must include
 * at least 2 entries — only answers synthesizing ≥2 pages are worth filing
 * back; simple fact lookups are not (RAG/Wiki/Memory 三层分工).
 */
export const kbWriteAnswerSchema = {
  title: z.string().max(500).describe("Answer title (encyclopedic style)"),
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
      "Answer content in markdown, encyclopedic style (background, synthesis, evidence, applicability)"
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score 0-1 (0.9=highly certain, 0.6=speculative)"),
  source_query: z
    .string()
    .max(1000)
    .describe("The original query that triggered this writeback (for provenance)"),
  cited_pages: z
    .array(
      z
        .string()
        .max(512)
        .regex(
          /^(?!.*\.\.).+$/,
          "Page path must not contain '..' (path traversal defense, ADR-010)"
        )
    )
    .min(2)
    .max(50)
    .describe(
      "Wiki page paths cited by this answer (≥2 required — WRITEBACK-RAG Utility Gate). Used to populate frontmatter.related."
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
    .enum([
      "ingest",
      "query",
      "lint",
      "experience",
      "promote",
      "reject",
      "confirm",
      "dream",
      "init",
      "writeback",
      "xref",
    ])
    .optional()
    .describe("Filter by event type"),
};

/**
 * kb_lint: Run health checks on the knowledge base.
 *
 * Checks (AGENTS.md §6.2):
 *   frontmatter      — missing or incomplete frontmatter fields (high)
 *   contradictions   — conflicting statements or duplicate titles (high)
 *   orphans          — pages with no inbound links (mid; high-confidence experiences exempt)
 *   stale            — source page newer than its referrers (high)
 *   missing_xref     — same-domain pages sharing tags but not cross-linked (mid)
 *   missing_concept  — concepts mentioned ≥N times but lacking their own page (low)
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
        "missing_concept",
      ])
    )
    .optional()
    .describe("Specific checks to run (default: all)"),
};

/** kb_health: Query server and knowledge base health. */
export const kbHealthSchema = {};

// ---------------------------------------------------------------------------
// P4 Phase 4b — staging workflow tools
// ---------------------------------------------------------------------------

/** kb_list_staging: List all staging pages (P4 Phase 4b). */
export const kbListStagingSchema = {
  domain: z
    .string()
    .regex(
      DOMAIN_REGEX,
      "Domain must be kebab-case (lowercase alphanumeric with hyphens)"
    )
    .max(64)
    .optional()
    .describe("Filter by domain (e.g., 'coding'). If omitted, lists all domains."),
};

/** kb_confirm_staging: Promote a staging page to active (P4 Phase 4b). */
export const kbConfirmStagingSchema = {
  page_path: z
    .string()
    .max(512)
    .describe(
      "Path to the staging page relative to KB root (e.g., 'wiki/coding/foo.md' or 'wiki/coding/foo')"
    ),
};

/** kb_reject_staging: Reject a staging page (P4 Phase 4b). */
export const kbRejectStagingSchema = {
  page_path: z
    .string()
    .max(512)
    .describe(
      "Path to the staging page relative to KB root (e.g., 'wiki/coding/foo.md' or 'wiki/coding/foo')"
    ),
};

/**
 * kb_organize_staging: Apply LLM-organized metadata to a staging page.
 *
 * Caller (Tauri GUI / external Agent) is responsible for invoking the LLM and
 * passing the result here; the server stays LLM-dependency-free (ADR-001:
 * core deps ≤5). This tool only validates + serializes + persists.
 *
 * Updates frontmatter.title, frontmatter.tags, and frontmatter.description
 * (LLM-generated summary). Body is NOT modified — the user can still edit
 * content during the staging review. domain_suggestion is returned but NOT
 * auto-applied (domain migration is a separate kb_confirm_staging / move
 * decision the user must make explicitly).
 *
 * At least one of {title, tags, description} must be provided.
 */
export const kbOrganizeStagingSchema = {
  page_path: z
    .string()
    .max(512)
    .describe(
      "Path to the staging page relative to KB root (e.g., 'wiki/coding/foo.md' or 'wiki/coding/foo')"
    ),
  title: z
    .string()
    .max(500)
    .optional()
    .describe("LLM-refined page title (overrides filename-derived default)"),
  tags: z
    .array(z.string().max(64))
    .max(20)
    .optional()
    .describe("LLM-extracted cross-cutting tags (e.g., ['python', 'async'])"),
  description: z
    .string()
    .max(500)
    .optional()
    .describe("LLM-generated one-line summary (stored as frontmatter.description)"),
  domain_suggestion: z
    .string()
    .regex(
      DOMAIN_REGEX,
      "Domain must be kebab-case (lowercase alphanumeric with hyphens)"
    )
    .max(64)
    .optional()
    .describe(
      "LLM-suggested target domain. Returned in result for caller action; NOT auto-applied (domain migration is a separate user decision)."
    ),
};

// ---------------------------------------------------------------------------
// P4 Phase 4c — knowledge graph tool
// ---------------------------------------------------------------------------

/**
 * kb_get_graph: Build the wiki knowledge graph (P4 Phase 4c).
 *
 * Returns nodes + edges + summary for the GraphView component.
 * Edge types: wikilink (from body), related (frontmatter.related), tags (shared).
 */
export const kbGetGraphSchema = {
  domain: z
    .string()
    .max(64)
    .optional()
    .describe(
      "Filter to a single domain (e.g., 'coding'). If omitted, includes all domains."
    ),
  include_statuses: z
    .array(z.string())
    .optional()
    .describe(
      "Page statuses to include (e.g., ['active', 'staging']). If omitted, excludes pending and archived by default."
    ),
};

/** kb_get_backlinks: Reverse-link index for a page (P4 Phase 4c). */
export const kbGetBacklinksSchema = {
  page_path: z
    .string()
    .max(512)
    .describe(
      "Path to the wiki page relative to KB root (e.g., 'wiki/coding/foo' or 'wiki/coding/foo.md')"
    ),
};

/**
 * kb_list_inbox: List pending experience cards for GUI review (P4 Phase 4c).
 *
 * Scans wiki/<domain>/experiences/inbox/*.md for status=pending cards.
 * Returns title/domain/confidence/source_task/body for ExperienceInbox.
 */
export const kbListInboxSchema = {
  domain: z
    .string()
    .regex(
      DOMAIN_REGEX,
      "Domain must be kebab-case (lowercase alphanumeric with hyphens)"
    )
    .max(64)
    .optional()
    .describe(
      "Filter by domain (e.g., 'coding'). If omitted, lists all domains."
    ),
};
