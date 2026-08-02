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

// Tauri v2 在运行时向 window 注入 `__TAURI_INTERNALS__`，但 TS 类型定义未包含。
// 扩展 Window 接口以避免 `as any` 类型断言。
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

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
    // Tauri v2 injects __TAURI_INTERNALS__ on window at runtime
    window.__TAURI_INTERNALS__ !== undefined
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

/** Update a staging page's content with LLM-organized markdown (P5, ADR-013). */
export async function updateStagingContent(
  pagePath: string,
  newContent: string,
): Promise<void> {
  if (!isTauriEnvironment()) {
    throw new Error(
      "Tauri 环境不可用 — 请在 Tauri 应用中调用 update_staging_content。",
    );
  }
  const invoke = await getInvoke();
  await invoke("update_staging_content", { pagePath, newContent });
}

/**
 * Delete a wiki page (P5 UX-3: manual deletion). Works for staging and active pages.
 * P5-R2 问题 5: 可选删除 raw/ 原始文件（deleteRaw=true，用户授权例外）。
 * @returns 被删除的 raw 文件路径（若删除了），空字符串表示未删除 raw 文件。
 */
export async function deletePage(pagePath: string, deleteRaw?: boolean): Promise<string> {
  if (!isTauriEnvironment()) {
    throw new Error(
      "Tauri 环境不可用 — 请在 Tauri 应用中调用 delete_page。",
    );
  }
  const invoke = await getInvoke();
  return (await invoke("delete_page", { pagePath, deleteRaw })) as string;
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
// P6-R3: LLM 自动分类（建议+确认模式）— IPC wrappers
// ---------------------------------------------------------------------------

/**
 * P6-R3: 创建新分类目录（用户确认后调用）。
 *
 * 安全约束：
 * - 域名经 Rust 端 kebab-case 校验，防止路径遍历
 * - 幂等：目录已存在时返回成功
 * - 更新 index.md 追加新领域分组
 * - 不自动修改 AGENTS.md（schema 文件由用户手动更新）
 *
 * @param name - kebab-case 分类名
 * @param description - 分类描述（可选，写入 index.md 注释）
 * @returns 结果消息（含提示用户更新 AGENTS.md）
 */
export async function createDomain(
  name: string,
  description?: string,
): Promise<string> {
  if (!isTauriEnvironment()) {
    throw new Error(
      "Tauri 环境不可用 — 请在 Tauri 应用中调用 create_domain_directory。",
    );
  }
  const invoke = await getInvoke();
  return (await invoke("create_domain_directory", {
    name,
    description: description ?? null,
  })) as string;
}

/**
 * P6-R3: 移动页面到新领域（重新分类）。
 *
 * 用于上传后用户接受 LLM 分类建议、将页面从默认领域移到推荐领域的场景。
 * 更新 frontmatter domain 字段 + 移动文件到目标领域目录。
 *
 * @param pagePath - 页面相对路径（如 wiki/coding/foo.md）
 * @param newDomain - 目标领域（kebab-case）
 * @returns 新的相对路径（如 wiki/design/foo.md）
 */
export async function movePageDomain(
  pagePath: string,
  newDomain: string,
): Promise<string> {
  if (!isTauriEnvironment()) {
    throw new Error(
      "Tauri 环境不可用 — 请在 Tauri 应用中调用 move_page_domain。",
    );
  }
  const invoke = await getInvoke();
  return (await invoke("move_page_domain", { pagePath, newDomain })) as string;
}

// ---------------------------------------------------------------------------
// P6-R5: 领域管理 IPC（删除 + 列表）
// ---------------------------------------------------------------------------

/** 领域信息（后端 list_domains 返回结构） */
export interface DomainInfoIPC {
  name: string;
  page_count: number;
  experience_count: number;
}

/**
 * P6-R5: 删除领域目录。
 *
 * 安全约束（后端四层防护）：
 * 1. 域名 kebab-case 校验
 * 2. 路径遍历防护（validate_inside）
 * 3. 受保护领域白名单（raw/.git/kb-system 不可删）
 * 4. 非空目录需 force=true 且用户二次确认
 *
 * 同步操作：移除 index.md 中该领域分组（防止 lint 报孤儿页）
 *
 * @param name - kebab-case 分类名
 * @param force - 是否强制删除非空目录
 * @returns 被删除的页面数量
 */
export async function deleteDomain(
  name: string,
  force: boolean,
): Promise<number> {
  if (!isTauriEnvironment()) {
    throw new Error(
      "Tauri 环境不可用 — 请在 Tauri 应用中调用 delete_domain_directory。",
    );
  }
  const invoke = await getInvoke();
  return (await invoke("delete_domain_directory", { name, force })) as number;
}

/**
 * P6-R5: 列出所有领域目录及统计信息。
 *
 * 返回 wiki/ 下所有子目录（按字母序），含页面数与经验卡数。
 * 用于前端 DomainManager 表格展示。
 */
export async function listDomains(): Promise<DomainInfoIPC[]> {
  if (!isTauriEnvironment()) {
    throw new Error(
      "Tauri 环境不可用 — 请在 Tauri 应用中调用 list_domains。",
    );
  }
  const invoke = await getInvoke();
  return (await invoke("list_domains")) as DomainInfoIPC[];
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
