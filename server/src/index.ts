#!/usr/bin/env node
/**
 * MCP Server entry point for the continuous-evolution knowledge base.
 *
 * Registers all tools defined in ARCH.md §3.1:
 *   Read-only:  kb_health, kb_list_categories, kb_list_recent, kb_get_page, kb_search
 *   Write:      kb_ingest_source, kb_write_experience, kb_promote_experience
 *   Lint:       kb_lint
 *
 * US-001: Scaffolding with stub handlers. ✅
 * US-002: Read-only tools implemented (kb_health, kb_list_categories, kb_list_recent, kb_get_page). ✅
 * US-003: kb_search implemented (full-text scan + term-overlap scoring). ✅
 * US-004: Write tools implemented (kb_ingest_source, kb_write_experience). ✅
 * US-005: kb_lint implemented (frontmatter, contradictions, orphans, stale, missing_xref). ✅
 * P3:     kb_get_page use_count increment + kb_promote_experience two-tier gate. ✅
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
  kbListCategoriesSchema,
  kbListRecentSchema,
  kbLintSchema,
  kbHealthSchema,
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
} from "./tools/write.js";
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
