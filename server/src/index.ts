#!/usr/bin/env node
/**
 * MCP Server entry point for the continuous-evolution knowledge base.
 *
 * Registers all 17 tools defined in ARCH.md §3.1:
 *   Read-only:  kb_health, kb_list_categories, kb_list_recent, kb_get_page, kb_search
 *   Write:      kb_ingest_source, kb_write_experience, kb_promote_experience, kb_write_answer
 *   Staging:    kb_list_staging, kb_confirm_staging, kb_reject_staging, kb_organize_staging
 *   Lint:       kb_lint
 *   Graph:      kb_get_graph, kb_get_backlinks
 *   Inbox:      kb_list_inbox
 *
 * US-001: Scaffolding with stub handlers. ✅
 * US-002: Read-only tools implemented (kb_health, kb_list_categories, kb_list_recent, kb_get_page). ✅
 * US-003: kb_search implemented (full-text scan + term-overlap scoring + CJK bigram). ✅
 * US-004: Write tools implemented (kb_ingest_source, kb_write_experience). ✅
 * US-005: kb_lint implemented (frontmatter, contradictions, orphans, stale, missing_xref, missing_concept). ✅
 * P3:     kb_get_page use_count increment + kb_promote_experience two-tier gate. ✅
 * P4b:    kb_list_staging / kb_confirm_staging / kb_reject_staging. ✅
 * P4c:    kb_get_graph / kb_get_backlinks / kb_list_inbox. ✅
 * P6+:    kb_write_answer (WRITEBACK-RAG) + kb_organize_staging (LLM整理) + auto-xref + missing_concept. ✅
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_VERSION } from "./config.js";
import {
  kbSearchSchema,
  kbGetPageSchema,
  kbIngestSourceSchema,
  kbWriteExperienceSchema,
  kbPromoteExperienceSchema,
  kbWriteAnswerSchema,
  kbListCategoriesSchema,
  kbListRecentSchema,
  kbLintSchema,
  kbHealthSchema,
  kbListStagingSchema,
  kbConfirmStagingSchema,
  kbRejectStagingSchema,
  kbOrganizeStagingSchema,
  kbGetGraphSchema,
  kbGetBacklinksSchema,
  kbListInboxSchema,
} from "./schemas.js";
import {
  kbHealth,
  kbListCategories,
  kbListRecent,
  kbGetPage,
} from "./tools/read-only.js";
import {
  kbIngestSource,
  kbWriteExperience,
  kbPromoteExperience,
  kbWriteAnswer,
} from "./tools/write.js";
import {
  kbListStaging,
  kbConfirmStaging,
  kbRejectStaging,
  kbOrganizeStaging,
} from "./tools/staging.js";
import { kbGetGraph } from "./tools/graph.js";
import { kbGetBacklinks } from "./tools/backlinks.js";
import { kbListInbox } from "./tools/inbox.js";
import { kbSearch } from "./tools/search.js";
import { kbLint } from "./tools/lint.js";

const server = new McpServer({
  name: "continuous-learning-kb",
  version: SERVER_VERSION,
});

// ---------------------------------------------------------------------------
// Tool registrations
// ---------------------------------------------------------------------------

server.tool(
  "kb_search",
  "Search the knowledge base. Returns matching pages with snippets.",
  kbSearchSchema,
  async (args) => kbSearch(args)
);

server.tool(
  "kb_get_page",
  "Retrieve a full wiki page by path, including frontmatter and body.",
  kbGetPageSchema,
  async (args) => kbGetPage(args)
);

server.tool(
  "kb_ingest_source",
  "Ingest a new source file into the knowledge base. Creates wiki/staging page and appends to log.",
  kbIngestSourceSchema,
  async (args) => kbIngestSource(args)
);

server.tool(
  "kb_write_experience",
  "Write a reusable experience card to the inbox for review.",
  kbWriteExperienceSchema,
  async (args) => kbWriteExperience(args)
);

server.tool(
  "kb_promote_experience",
  "Promote an inbox experience card to active (two-tier review gate), or reject it.",
  kbPromoteExperienceSchema,
  async (args) => kbPromoteExperience(args)
);

server.tool(
  "kb_write_answer",
  "Write a valuable Query answer back as a pending experience card (Karpathy 'good answers filed back'). Goes through inbox two-tier review gate. Requires cited_pages >= 2 (WRITEBACK-RAG Utility Gate).",
  kbWriteAnswerSchema,
  async (args) => kbWriteAnswer(args)
);

server.tool(
  "kb_list_categories",
  "List all knowledge base domains with optional statistics.",
  kbListCategoriesSchema,
  async (args) => kbListCategories(args)
);

server.tool(
  "kb_list_recent",
  "List recent log entries (ingest/query/lint/experience events).",
  kbListRecentSchema,
  async (args) => kbListRecent(args)
);

server.tool(
  "kb_lint",
  "Run health checks on the knowledge base (frontmatter, contradictions, orphans, stale, missing cross-references).",
  kbLintSchema,
  async (args) => kbLint(args)
);

server.tool(
  "kb_health",
  "Query knowledge base health: total pages, index status, last ingest, last lint.",
  kbHealthSchema,
  async () => kbHealth()
);

// ---------------------------------------------------------------------------
// P4 Phase 4b — staging workflow tools
// ---------------------------------------------------------------------------

server.tool(
  "kb_list_staging",
  "List all staging pages (status=staging). Optionally filter by domain.",
  kbListStagingSchema,
  async (args) => kbListStaging(args),
);

server.tool(
  "kb_confirm_staging",
  "Promote a staging page to active. Updates frontmatter status, refreshes index header, appends log entry.",
  kbConfirmStagingSchema,
  async (args) => kbConfirmStaging(args),
);

server.tool(
  "kb_reject_staging",
  "Reject a staging page (mark status=rejected). The page file is kept for auditability. Appends log entry.",
  kbRejectStagingSchema,
  async (args) => kbRejectStaging(args),
);

server.tool(
  "kb_organize_staging",
  "Apply LLM-organized metadata (title/tags/description) to a staging page. Caller invokes the LLM and passes the result; server stays LLM-free. Body is not modified. domain_suggestion is returned but not auto-applied.",
  kbOrganizeStagingSchema,
  async (args) => kbOrganizeStaging(args),
);

// ---------------------------------------------------------------------------
// P4 Phase 4c — knowledge graph tool
// ---------------------------------------------------------------------------

server.tool(
  "kb_get_graph",
  "Build the wiki knowledge graph: nodes + edges (wikilink/related/tags) + summary (totals, orphans, largest CC, domain distribution).",
  kbGetGraphSchema,
  async (args) => kbGetGraph(args),
);

server.tool(
  "kb_get_backlinks",
  "Get reverse-link index for a page: backlinks (pages linking to this), outbound (pages this links to), related (frontmatter.related).",
  kbGetBacklinksSchema,
  async (args) => kbGetBacklinks(args),
);

server.tool(
  "kb_list_inbox",
  "List pending experience cards in the inbox for GUI review. Returns title/domain/confidence/source_task/body, sorted by confidence descending.",
  kbListInboxSchema,
  async (args) => kbListInbox(args),
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[kb-mcp] Server started (v${SERVER_VERSION})`);
}

main().catch((error: unknown) => {
  console.error("[kb-mcp] Fatal:", error);
  process.exit(1);
});
