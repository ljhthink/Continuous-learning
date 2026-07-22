/**
 * Helper functions for constructing MCP tool results.
 * All tool handlers return objects shaped as ToolResult.
 */

export interface ToolResult {
  // Index signature required by the MCP SDK's tool handler return type
  // (SDK expects `{ [x: string]: unknown; content: ...; _meta?: ... }`).
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** Return a plain text result. */
export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/** Return a JSON-serializable result as formatted text. */
export function jsonResult(data: unknown): ToolResult {
  return textResult(JSON.stringify(data, null, 2));
}

/** Return an error result (isError=true). */
export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
