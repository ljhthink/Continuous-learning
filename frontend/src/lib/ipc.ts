/**
 * Tauri IPC wrappers — Phase 4b
 *
 * Thin async wrappers around `@tauri-apps/api/core` `invoke()` for the
 * Rust IPC commands defined in `src-tauri/src/lib.rs`:
 *   - upload_file(file_path, domain)
 *   - list_staging(domain?)
 *   - confirm_staging(page_path)
 *   - reject_staging(page_path)
 *   - get_kb_config()
 *
 * In browser dev mode (Vite without Tauri), `invoke` is undefined; we
 * detect that and throw a clear error so the calling component can fall
 * back to mock data. Detection is via `window.__TAURI_INTERNALS__` which
 * Tauri v2 injects on `window`.
 */

// Tauri v2 exposes `invoke` via `@tauri-apps/api/core`. We import lazily
// so that browser-only dev mode (no Tauri) does not crash on import.

async function getInvoke(): Promise<
  (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
> {
  // Lazy-load @tauri-apps/api/core so the import only happens when IPC is
  // actually invoked. This keeps browser-only preview (vite dev) working.
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke;
}

function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    // Tauri v2 injects this on window
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ !== undefined
  );
}

// ---------------------------------------------------------------------------
// Types — mirror `src-tauri/src/lib.rs` StagingPage / UploadResult / KbConfig
// ---------------------------------------------------------------------------

export interface StagingPageIPC {
  path: string;
  title: string;
  domain: string;
  format: string;
  status: string;
  date: string;
  preview: string;
  source_file: string;
}

export interface UploadResultIPC {
  success: boolean;
  page: StagingPageIPC | null;
  error: string | null;
}

export interface KbConfigIPC {
  kb_root: string;
  python_path: string;
  parser_path: string;
}

// ---------------------------------------------------------------------------
// IPC functions
// ---------------------------------------------------------------------------

/** Upload a file: copy to raw/, run Python parser, create staging wiki page. */
export async function uploadFile(
  filePath: string,
  domain: string,
): Promise<UploadResultIPC> {
  if (!isTauriEnvironment()) {
    throw new Error(
      "Tauri 环境不可用 — 请在 Tauri 应用中调用 upload_file。当前可能处于浏览器 dev 模式。",
    );
  }
  const invoke = await getInvoke();
  return invoke("upload_file", {
    filePath,
    domain,
  }) as Promise<UploadResultIPC>;
}

/** List all staging pages, optionally filtered by domain. */
export async function listStaging(
  domain?: string,
): Promise<StagingPageIPC[]> {
  if (!isTauriEnvironment()) {
    throw new Error(
      "Tauri 环境不可用 — 请在 Tauri 应用中调用 list_staging。",
    );
  }
  const invoke = await getInvoke();
  return invoke("list_staging", { domain: domain ?? null }) as Promise<
    StagingPageIPC[]
  >;
}

/** Confirm a staging page → promote to active. */
export async function confirmStaging(pagePath: string): Promise<void> {
  if (!isTauriEnvironment()) {
    throw new Error("Tauri 环境不可用 — 请在 Tauri 应用中调用 confirm_staging。");
  }
  const invoke = await getInvoke();
  await invoke("confirm_staging", { pagePath });
}

/** Reject a staging page → mark as rejected. */
export async function rejectStaging(pagePath: string): Promise<void> {
  if (!isTauriEnvironment()) {
    throw new Error("Tauri 环境不可用 — 请在 Tauri 应用中调用 reject_staging。");
  }
  const invoke = await getInvoke();
  await invoke("reject_staging", { pagePath });
}

/** Get the current KB config (kb_root + parser paths). */
export async function getKbConfig(): Promise<KbConfigIPC> {
  if (!isTauriEnvironment()) {
    throw new Error("Tauri 环境不可用 — 请在 Tauri 应用中调用 get_kb_config。");
  }
  const invoke = await getInvoke();
  return invoke("get_kb_config") as Promise<KbConfigIPC>;
}

// ---------------------------------------------------------------------------
// Phase 4c — MCP tool bridge (call_mcp_tool)
// ---------------------------------------------------------------------------

/** Result shape from `call_mcp_tool` Rust IPC command. */
export interface McpToolResultIPC {
  success: boolean;
  data: unknown;
  error: string | null;
}

/**
 * Call an MCP server tool via the Tauri Rust backend.
 *
 * The Rust side spawns `node --import tsx server/src/cli.ts <tool> <args>`
 * as a subprocess and returns the tool's JSON output. This bridges the React
 * frontend to MCP tool implementations (kb_get_graph, kb_search, etc.)
 * without duplicating their logic in Rust.
 *
 * Only whitelisted read-only tools are allowed (see TOOL_WHITELIST in lib.rs).
 * Write tools (kb_ingest_source, kb_write_experience, kb_promote_experience,
 * kb_confirm_staging, kb_reject_staging) have dedicated IPC commands instead.
 *
 * In browser dev mode, throws — callers should fall back to mock data.
 */
export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<McpToolResultIPC> {
  if (!isTauriEnvironment()) {
    throw new Error(
      `Tauri 环境不可用 — 请在 Tauri 应用中调用 call_mcp_tool("${toolName}")。当前可能处于浏览器 dev 模式。`,
    );
  }
  const invoke = await getInvoke();
  const argsJson = JSON.stringify(args);
  return invoke("call_mcp_tool", {
    toolName,
    argsJson,
  }) as Promise<McpToolResultIPC>;
}

/** True when running inside a Tauri window (vs. plain browser dev). */
export function isTauri(): boolean {
  return isTauriEnvironment();
}
