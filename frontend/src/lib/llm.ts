/**
 * LLM 集成层 — P5（ADR-013）
 *
 * 适配中国三厂商最新旗舰（2026-07-28 网络搜索确认）：
 *   - DeepSeek V4（deepseek-v4-pro，1M 上下文，OpenAI 兼容）
 *   - GLM-5.2（智谱 AI，OpenAI 兼容，Bearer Token 非 JWT）
 *   - Kimi K3（月之暗面，2.8T 参数，OpenAI 兼容）
 *
 * 三家厂商全部 OpenAI 兼容 + Bearer Token 认证，统一调用接口。
 * 严禁使用老版本模型名（如 gpt-4o、deepseek-chat、deepseek-reasoner）。
 *
 * 架构：前端 → Tauri IPC → Rust 端 reqwest 发 HTTP（避免 CORS，API Key 不暴露到 webview）
 *
 * local-first 模式走 Ollama（http://localhost:11434），推荐模型 qwen3:7b。
 */

import { isTauri } from "@/lib/ipc";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** Cloud 模式下可选的模型提供商（中国三厂商） */
export type CloudProvider = "deepseek" | "glm" | "kimi";

/** LLM 模式（三态，ADR-013 D1） */
export type LlmMode = "cloud-first" | "local-first" | "disabled";

/** 厂商配置 */
export interface ProviderConfig {
  /** API 基础 URL（OpenAI 兼容端点） */
  baseUrl: string;
  /** 模型 ID（API 调用时的 model 字段值） */
  model: string;
  /** 厂商显示名称 */
  name: string;
  /** 官方 API 文档 URL */
  docsUrl: string;
  /** API Key 占位符提示 */
  keyPlaceholder: string;
}

/** LLM 调用参数 */
export interface LlmCallParams {
  provider: CloudProvider;
  apiKey: string;
  prompt: string;
  systemPrompt?: string;
}

/** LLM 调用结果 */
export interface LlmCallResult {
  success: boolean;
  content?: string;
  error?: string;
}

/** 连接测试结果 */
export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// 厂商配置（研究结论，2026-07-28）
// ---------------------------------------------------------------------------

export const PROVIDERS: Record<CloudProvider, ProviderConfig> = {
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-v4-pro",
    name: "DeepSeek V4",
    docsUrl: "https://api-docs.deepseek.com",
    keyPlaceholder: "sk-...（DeepSeek API Key）",
  },
  glm: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.2",
    name: "GLM-5.2",
    docsUrl: "https://docs.bigmodel.cn",
    keyPlaceholder: "xxx.xxx（智谱 BigModel API Key）",
  },
  kimi: {
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k3",
    name: "Kimi K3",
    docsUrl: "https://platform.kimi.com/docs",
    keyPlaceholder: "sk-...（Moonshot API Key）",
  },
};

/**
 * 禁止使用的老版本模型名（用于运行时校验，防止误配置）。
 * 旧模型名 deepseek-chat / deepseek-reasoner 已于 2026-07-24 停用。
 */
export const DEPRECATED_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt4o",
  "deepseek-chat",
  "deepseek-reasoner",
  "moonshot-v1-128k",
  "moonshot-v1-32k",
  "moonshot-v1-8k",
  "glm-4",
  "glm-4.5",
];

// ---------------------------------------------------------------------------
// 系统提示词
// ---------------------------------------------------------------------------

/**
 * staging 页面整理的系统提示词。
 * 指导 LLM 将原始 markdown 整理为结构化 wiki 页面。
 */
export const STAGING_SYSTEM_PROMPT = `你是一个知识库整理助手。请将用户提供的原始 markdown 内容整理为结构化的 wiki 页面：

1. 提炼简洁的标题（≤50 字）
2. 生成 frontmatter（YAML，含 title/domain/date/type=source/status=staging）
3. 抽取 3-5 个 tags（kebab-case）
4. 生成 100 字以内的摘要
5. 保留原文核心内容，组织为清晰的小节（使用 ## / ### 标题）
6. 如有代码块，保留并标注语言

输出格式：完整的 markdown 页面（含 frontmatter），直接可用，不要包裹在代码块中。`;

// ---------------------------------------------------------------------------
// Tauri IPC 调用
// ---------------------------------------------------------------------------

/**
 * 懒加载 Tauri invoke 函数（与 ipc.ts 模式一致）。
 * 浏览器 dev 模式下抛出清晰错误。
 */
async function getInvoke(): Promise<
  (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
> {
  if (!isTauri()) {
    throw new Error("LLM 调用需要 Tauri 桌面环境（浏览器 dev 模式不支持）");
  }
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke;
}

// ---------------------------------------------------------------------------
// LLM 调用（核心）
// ---------------------------------------------------------------------------

/**
 * 调用 LLM API 整理内容。
 *
 * 经 Tauri IPC → Rust 端 reqwest 发 HTTP 请求（OpenAI 兼容格式）。
 * 三厂商统一接口，仅 provider/model/baseUrl 不同。
 *
 * @param params.provider - 厂商（deepseek / glm / kimi）
 * @param params.apiKey - API Key（Bearer Token）
 * @param params.prompt - 用户提示词（原始 markdown 内容）
 * @param params.systemPrompt - 系统提示词（可选，staging 整理时用 STAGING_SYSTEM_PROMPT）
 * @returns 调用结果（success + content 或 error）
 */
export async function callLlm(params: LlmCallParams): Promise<LlmCallResult> {
  try {
    const invoke = await getInvoke();
    const content = (await invoke("call_llm_api", {
      provider: params.provider,
      apiKey: params.apiKey,
      prompt: params.prompt,
      systemPrompt: params.systemPrompt ?? "",
    })) as string;
    return { success: true, content };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 测试 LLM 连接（发送简短 prompt 验证 API Key 有效性）。
 *
 * @param provider - 厂商
 * @param apiKey - API Key
 * @returns 连接测试结果（ok + message）
 */
export async function testConnection(
  provider: CloudProvider,
  apiKey: string,
): Promise<ConnectionTestResult> {
  if (!apiKey.trim()) {
    return { ok: false, message: "请先输入 API Key" };
  }

  const result = await callLlm({
    provider,
    apiKey,
    prompt: "请回复 'OK' 两个字以确认连接正常。",
  });

  if (result.success) {
    return {
      ok: true,
      message: `连接成功：${PROVIDERS[provider].name}（${PROVIDERS[provider].model}）已就绪`,
    };
  }

  return {
    ok: false,
    message: `连接失败：${result.error ?? "未知错误"}`,
  };
}

// ---------------------------------------------------------------------------
// API Key 加密持久化（操作系统密钥环，ADR-013 D3/V7）
// ---------------------------------------------------------------------------

/**
 * 保存 API Key 到操作系统密钥环。
 *
 * 使用 Rust keyring crate，跨平台支持：
 * - Windows: Credential Manager
 * - macOS: Keychain
 * - Linux: Secret Service (D-Bus)
 *
 * @param provider - 厂商（作为 keyring 的 username 字段）
 * @param apiKey - API Key 明文（经 IPC 传给 Rust 端，由 keyring 加密存储）
 */
export async function saveApiKey(
  provider: CloudProvider,
  apiKey: string,
): Promise<void> {
  try {
    const invoke = await getInvoke();
    await invoke("save_api_key", { provider, apiKey });
  } catch (err) {
    // 密钥环不可用时降级为仅内存（不阻断用户操作）
    console.warn(`[llm] save_api_key failed for ${provider}:`, err);
    throw new Error(
      err instanceof Error
        ? `保存 API Key 失败：${err.message}`
        : "保存 API Key 失败（密钥环不可用）",
    );
  }
}

/**
 * 从操作系统密钥环读取 API Key。
 *
 * @param provider - 厂商
 * @returns API Key（未保存时返回 null）
 */
export async function loadApiKey(
  provider: CloudProvider,
): Promise<string | null> {
  try {
    const invoke = await getInvoke();
    const result = (await invoke("load_api_key", { provider })) as string | null;
    return result;
  } catch (err) {
    console.warn(`[llm] load_api_key failed for ${provider}:`, err);
    return null;
  }
}

/**
 * 删除已保存的 API Key。
 *
 * @param provider - 厂商
 */
export async function deleteApiKey(provider: CloudProvider): Promise<void> {
  try {
    const invoke = await getInvoke();
    await invoke("delete_api_key", { provider });
  } catch (err) {
    console.warn(`[llm] delete_api_key failed for ${provider}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Staging 页面整理（P2.1.8：FileList "LLM 整理" 按钮调用）
// ---------------------------------------------------------------------------

/**
 * 整理 staging 页面内容。
 *
 * 将原始 markdown（parser 输出的 preview）发送给 LLM，
 * 返回结构化的 wiki 页面 markdown（含 frontmatter）。
 *
 * 流程：FileList 按钮 → organizeStagingPage → callLlm → Tauri IPC → Rust reqwest → LLM API
 *
 * @param provider - 厂商
 * @param apiKey - API Key
 * @param rawContent - 原始 markdown 内容（staging 页面 preview）
 * @returns 整理后的 markdown（含 frontmatter）或错误
 */
export async function organizeStagingPage(
  provider: CloudProvider,
  apiKey: string,
  rawContent: string,
): Promise<LlmCallResult> {
  return callLlm({
    provider,
    apiKey,
    prompt: rawContent,
    systemPrompt: STAGING_SYSTEM_PROMPT,
  });
}
