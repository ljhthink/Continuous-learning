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

// ---------------------------------------------------------------------------
// Tool registry — maps tool name → handler function
// ---------------------------------------------------------------------------

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

const TOOL_REGISTRY: Record<string, ToolHandler> = {
  // Read-only
  kb_search: kbSearch,
  kb_get_page: kbGetPage,
  kb_list_categories: kbListCategories,
  kb_list_recent: kbListRecent,
  kb_health: kbHealth,
  // Lint
  kb_lint: kbLint,
  // Graph (P4c)
  kb_get_graph: kbGetGraph,
  kb_get_backlinks: kbGetBacklinks,
  // Inbox (P4c)
  kb_list_inbox: kbListInbox,
  // Staging (P4b)
  kb_list_staging: kbListStaging,
  kb_confirm_staging: kbConfirmStaging,
  kb_reject_staging: kbRejectStaging,
  // Write (ingest + experience)
  kb_ingest_source: kbIngestSource,
  kb_write_experience: kbWriteExperience,
  kb_promote_experience: kbPromoteExperience,
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
