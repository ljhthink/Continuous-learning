#!/usr/bin/env node
/**
 * MCP tool CLI bridge (P4 Phase 4c).
 *
 * Allows the Tauri Rust backend to invoke MCP server tools as a subprocess:
 *
 *   node --import tsx src/cli.ts <tool_name> [json_args]
 *
 * Examples:
 *   node --import tsx src/cli.ts kb_get_graph '{}'
 *   node --import tsx src/cli.ts kb_get_page '{"page_path":"wiki/coding/async-patterns"}'
 *   node --import tsx src/cli.ts kb_search '{"query":"python async","limit":5}'
 *
 * Output: JSON result on stdout (the tool's `content[0].text` parsed back to
 * an object). Errors go to stderr with exit code 1.
 *
 * Used by the Tauri IPC command `call_mcp_tool` in frontend/src-tauri/src/lib.rs
 * to bridge React frontend → Rust → Node subprocess → MCP tool implementation.
 *
 * Why a subprocess instead of HTTP? The MCP server normally speaks JSON-RPC
 * over stdio, which is stateful (handshake + tool registration). For Phase 4c
 * the GUI only needs one-shot reads (graph, backlinks, search, page), so a
 * thin CLI wrapper that imports the tool handler directly is simpler than
 * running a long-lived MCP server process. Each call pays ~200ms Node startup
 * but avoids protocol complexity.
 */

import { z } from "zod";
import { kbSearch } from "./tools/search.js";
import { kbGetPage } from "./tools/read-only.js";
import { kbListCategories, kbListRecent, kbHealth } from "./tools/read-only.js";
import { kbLint } from "./tools/lint.js";
import { kbGetGraph } from "./tools/graph.js";
import { kbGetBacklinks } from "./tools/backlinks.js";
import { kbListInbox } from "./tools/inbox.js";
import {
  kbListStaging,
  kbConfirmStaging,
  kbRejectStaging,
} from "./tools/staging.js";
import {
  kbIngestSource,
  kbWriteExperience,
  kbPromoteExperience,
} from "./tools/write.js";
import type { ToolResult } from "./tools/helpers.js";
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
  kbListStagingSchema,
  kbConfirmStagingSchema,
  kbRejectStagingSchema,
  kbGetGraphSchema,
  kbGetBacklinksSchema,
  kbListInboxSchema,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Tool registry — maps tool name → handler function
// ---------------------------------------------------------------------------

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

// Tool functions have specific parameter types (e.g., { page_path: string }),
// but the registry needs a uniform type for dynamic dispatch. We cast to
// ToolHandler — the Zod schemas validate inputs before the handler runs.
const TOOL_REGISTRY: Record<string, ToolHandler> = {
  // Read-only
  kb_search: kbSearch as unknown as ToolHandler,
  kb_get_page: kbGetPage as unknown as ToolHandler,
  kb_list_categories: kbListCategories as unknown as ToolHandler,
  kb_list_recent: kbListRecent as unknown as ToolHandler,
  kb_health: kbHealth as unknown as ToolHandler,
  // Lint
  kb_lint: kbLint as unknown as ToolHandler,
  // Graph (P4c)
  kb_get_graph: kbGetGraph as unknown as ToolHandler,
  kb_get_backlinks: kbGetBacklinks as unknown as ToolHandler,
  // Inbox (P4c)
  kb_list_inbox: kbListInbox as unknown as ToolHandler,
  // Staging (P4b)
  kb_list_staging: kbListStaging as unknown as ToolHandler,
  kb_confirm_staging: kbConfirmStaging as unknown as ToolHandler,
  kb_reject_staging: kbRejectStaging as unknown as ToolHandler,
  // Write (ingest + experience)
  kb_ingest_source: kbIngestSource as unknown as ToolHandler,
  kb_write_experience: kbWriteExperience as unknown as ToolHandler,
  kb_promote_experience: kbPromoteExperience as unknown as ToolHandler,
};

// ---------------------------------------------------------------------------
// Schema registry — maps tool name → Zod schema (P3.2, M-1 fix)
// ---------------------------------------------------------------------------

// Schemas in schemas.ts are ZodRawShape objects (plain objects of Zod types),
// not ZodObject instances. We wrap each in z.object() to get a usable schema
// with safeParse(). This ensures the CLI subprocess path validates inputs
// identically to the MCP server path (which uses server.tool(name, desc,
// schema, handler) — the MCP SDK internally wraps ZodRawShape the same way).
const SCHEMA_REGISTRY: Record<string, z.ZodType> = {
  kb_search: z.object(kbSearchSchema),
  kb_get_page: z.object(kbGetPageSchema),
  kb_list_categories: z.object(kbListCategoriesSchema),
  kb_list_recent: z.object(kbListRecentSchema),
  kb_health: z.object(kbHealthSchema),
  kb_lint: z.object(kbLintSchema),
  kb_get_graph: z.object(kbGetGraphSchema),
  kb_get_backlinks: z.object(kbGetBacklinksSchema),
  kb_list_inbox: z.object(kbListInboxSchema),
  kb_list_staging: z.object(kbListStagingSchema),
  kb_confirm_staging: z.object(kbConfirmStagingSchema),
  kb_reject_staging: z.object(kbRejectStagingSchema),
  kb_ingest_source: z.object(kbIngestSourceSchema),
  kb_write_experience: z.object(kbWriteExperienceSchema),
  kb_promote_experience: z.object(kbPromoteExperienceSchema),
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const toolName = process.argv[2];
  if (!toolName) {
    console.error("Usage: node cli.ts <tool_name> [json_args]");
    console.error(`Available tools: ${Object.keys(TOOL_REGISTRY).join(", ")}`);
    process.exit(1);
  }

  const handler = TOOL_REGISTRY[toolName];
  if (!handler) {
    console.error(`Unknown tool: ${toolName}`);
    console.error(`Available tools: ${Object.keys(TOOL_REGISTRY).join(", ")}`);
    process.exit(1);
  }

  // Parse JSON args (default to empty object).
  const argsJson = process.argv[3] ?? "{}";
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJson);
  } catch (err) {
    console.error(
      `Invalid JSON args: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  // P3.2 (M-1 fix): Validate args via Zod safeParse before calling handler.
  // This ensures the CLI subprocess path validates inputs identically to the
  // MCP server path (which uses server.tool() with the same schemas).
  // Without this, the CLI path relied solely on handler-internal defensive
  // checks, allowing malformed args (e.g., wrong types, missing required
  // fields) to reach the handler and produce cryptic runtime errors.
  const schema = SCHEMA_REGISTRY[toolName];
  if (schema) {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      console.error(`Invalid args for ${toolName}:\n${issues}`);
      process.exit(1);
    }
    args = parsed.data as Record<string, unknown>;
  }

  // Call the tool handler.
  const result = await handler(args);

  // If the tool returned an error result, exit non-zero so the Rust side
  // can detect errors via exit status (in addition to the isError flag).
  if (result.isError) {
    // Still print the result to stdout so the caller can read the error message.
    const text = result.content[0]?.text ?? "{}";
    console.log(text);
    process.exit(2);
  }

  // Print the result's first text content to stdout. The MCP tool result
  // shape is `{ content: [{ type: "text", text: "..." }], isError?: boolean }`.
  // We extract just the text (which is itself a JSON string) and print it
  // directly, so the Rust side gets clean JSON on stdout.
  const text = result.content[0]?.text ?? "{}";
  console.log(text);
}

main().catch((err: unknown) => {
  console.error(`[kb-cli] Fatal: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
