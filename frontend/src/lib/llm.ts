/**
 * LLM 集成层 — P5（ADR-013）
 *
 * 支持 OpenAI 兼容 + Bearer Token 认证的所有厂商，统一调用接口。
 * 模型名与 API 地址均可自定义（P5-R2），用户可配置任意兼容端点。
 *
 * 架构：前端 → Tauri IPC → Rust 端 reqwest 发 HTTP（避免 CORS，API Key 不暴露到 webview）
 *
 * local-first 模式走 Ollama（http://localhost:11434），推荐模型 qwen3:7b。
 */

import { isTauri } from "@/lib/ipc";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** Cloud 模式下可选的模型提供商 */
export type CloudProvider = "custom" | "deepseek" | "glm" | "kimi";

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
  /** 自定义 API base URL（覆盖 PROVIDERS 默认值，可选） */
  customBaseUrl?: string;
  /** 自定义模型名（覆盖 PROVIDERS 默认值，可选，P5-R2 问题 2） */
  customModelName?: string;
  /** P6-R1: 输出 token 上限（可选，成本控制；默认不限） */
  maxTokens?: number;
}

/** LLM 调用结果 */
export interface LlmCallResult {
  success: boolean;
  content?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// P6-R1: 流式响应 / 重试 / 截断检测 / 成本控制 类型定义
// ---------------------------------------------------------------------------

/** token 用量统计（OpenAI 兼容 usage 字段） */
export interface LlmUsage {
  total_tokens: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

/** 流式调用回调（P6-R1） */
export interface LlmStreamCallbacks {
  /** 收到 token 增量（流式渲染） */
  onToken?: (token: string) => void;
  /** 重试通知（指数退避） */
  onRetry?: (attempt: number, delayMs: number, error: string) => void;
  /** token 用量统计（成本控制） */
  onUsage?: (usage: LlmUsage) => void;
  /** 截断检测（finish_reason === "length"） */
  onTruncated?: () => void;
  /** 流式完成（full content） */
  onDone?: (fullContent: string) => void;
}

/** 连接测试结果 */
export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// 厂商默认配置（用户可通过 customBaseUrl / customModelName 覆盖）
// ---------------------------------------------------------------------------

export const PROVIDERS: Record<CloudProvider, ProviderConfig> = {
  // P5-R3 问题 3: "custom" 为唯一 UI 可选项，baseUrl/model 由用户填写
  custom: {
    baseUrl: "",
    model: "",
    name: "自定义",
    docsUrl: "",
    keyPlaceholder: "sk-...（API Key）",
  },
  // Legacy presets: 保留用于向后兼容已保存的 keyring 条目，UI 不展示
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
5. **保留原文全部核心内容**，组织为清晰的小节（使用 ## / ### 标题）
   - ⚠️ 不要删减、省略或概括原文内容，必须完整保留所有知识点、公式、表格、代码
   - 如果原文很长，输出也应该很长——完整度优先于简洁性
6. 如有代码块，保留并标注语言
7. 如有数学公式，保留原始 LaTeX 格式（$...$ 或 $$...$$）

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
 * 调用 LLM API 整理内容（非流式，向后兼容）。
 *
 * 经 Tauri IPC → Rust 端 reqwest 发 HTTP 请求（OpenAI 兼容格式）。
 * 统一 OpenAI 兼容接口，仅 provider/model/baseUrl 不同。
 *
 * P6-R1: 底层 Rust 端已支持重试/usage/截断检测，非流式模式同样受益。
 *
 * @param params.provider - 厂商（deepseek / glm / kimi）
 * @param params.apiKey - API Key（Bearer Token）
 * @param params.prompt - 用户提示词（原始 markdown 内容）
 * @param params.systemPrompt - 系统提示词（可选，staging 整理时用 STAGING_SYSTEM_PROMPT）
 * @param params.maxTokens - 输出 token 上限（可选，P6-R1 成本控制）
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
      baseUrl: params.customBaseUrl ?? "",
      model: params.customModelName ?? "",
      // P6-R1: 非流式（向后兼容）+ 可选 max_tokens
      stream: false,
      maxTokens: params.maxTokens ?? null,
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
 * 流式调用 LLM API（P6-R1）。
 *
 * 与 `callLlm` 的区别：
 * - 请求 `stream: true`，Rust 端逐 chunk 解析 SSE 并 emit `llm-token` 事件
 * - 前端通过 `@tauri-apps/api/event` 的 `listen` 接收 token 增量
 * - 回调驱动：onToken(增量渲染) / onUsage(用量显示) / onTruncated(截断提示) / onRetry(重试通知)
 * - 函数返回时流已结束，result.content 为完整内容
 *
 * 降级策略（P6-R2）：若流式调用失败，前端可 catch 后回退到 `callLlm`（非流式）。
 *
 * @param params - 同 callLlm 的参数
 * @param callbacks - 流式事件回调
 * @returns 调用结果（success + content 或 error）
 */
export async function callLlmStream(
  params: LlmCallParams,
  callbacks?: LlmStreamCallbacks,
): Promise<LlmCallResult> {
  const unlisteners: Array<() => void> = [];
  try {
    // P6-R1: 注册 Tauri 事件监听
    if (callbacks?.onToken) {
      const { listen } = await import("@tauri-apps/api/event");
      unlisteners.push(
        await listen<string>("llm-token", (e) => callbacks.onToken!(e.payload)),
      );
    }
    if (callbacks?.onRetry) {
      const { listen } = await import("@tauri-apps/api/event");
      unlisteners.push(
        await listen<{
          attempt: number;
          delay_ms: number;
          error: string;
        }>("llm-retry", (e) =>
          callbacks.onRetry!(
            e.payload.attempt,
            e.payload.delay_ms,
            e.payload.error,
          ),
        ),
      );
    }
    if (callbacks?.onUsage) {
      const { listen } = await import("@tauri-apps/api/event");
      unlisteners.push(
        await listen<LlmUsage>("llm-usage", (e) => callbacks.onUsage!(e.payload)),
      );
    }
    if (callbacks?.onTruncated) {
      const { listen } = await import("@tauri-apps/api/event");
      unlisteners.push(
        await listen<string>("llm-truncated", () => callbacks.onTruncated!()),
      );
    }
    if (callbacks?.onDone) {
      const { listen } = await import("@tauri-apps/api/event");
      unlisteners.push(
        await listen<string>("llm-done", (e) => callbacks.onDone!(e.payload)),
      );
    }

    const invoke = await getInvoke();
    const content = (await invoke("call_llm_api", {
      provider: params.provider,
      apiKey: params.apiKey,
      prompt: params.prompt,
      systemPrompt: params.systemPrompt ?? "",
      baseUrl: params.customBaseUrl ?? "",
      model: params.customModelName ?? "",
      stream: true,
      maxTokens: params.maxTokens ?? null,
    })) as string;
    return { success: true, content };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // P6-R1: 无论成功/失败，都清理事件监听，避免内存泄漏
    unlisteners.forEach((un) => un());
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
  customBaseUrl?: string,
  customModelName?: string,
): Promise<ConnectionTestResult> {
  if (!apiKey.trim()) {
    return { ok: false, message: "请先输入 API Key" };
  }

  const result = await callLlm({
    provider,
    apiKey,
    prompt: "请回复 'OK' 两个字以确认连接正常。",
    customBaseUrl,
    customModelName,
  });

  if (result.success) {
    const effectiveModel = customModelName?.trim() || PROVIDERS[provider].model;
    return {
      ok: true,
      message: `连接成功：${PROVIDERS[provider].name}（${effectiveModel}）已就绪`,
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
  // P5-R3 fix: 双层存储 — keyring 为主，localStorage 为降级后备。
  // keyring 在 Windows 上可能因 VaultSci 服务问题失败（考古报告问题 1），
  // localStorage 保证 key 至少可读（base64 编码，非安全存储但胜于丢失）。
  try {
    localStorage.setItem(`llm-key-${provider}`, btoa(encodeURIComponent(apiKey)));
  } catch {
    /* localStorage 不可用时忽略，keyring 仍可尝试 */
  }
  try {
    const invoke = await getInvoke();
    await invoke("save_api_key", { provider, apiKey });
  } catch (err) {
    // keyring 失败不抛错（localStorage 已有备份），仅警告
    console.warn(`[llm] save_api_key keyring failed for ${provider}, using localStorage fallback:`, err);
  }
}

/**
 * 从操作系统密钥环读取 API Key。
 *
 * @param provider - 厂商
 * @returns API Key（未保存时返回 null）
 *
 * P5-R2 fix: 区分"未保存"（NoEntry，正常返回 null）与"keyring 访问失败"（真实错误）。
 * 前者是预期状态，后者需详细日志便于排查（考古报告问题 4 故障点 2）。
 *
 * P5-R3 fix:
 * 1. keyring 失败时降级到 localStorage（考古报告问题 1）
 * 2. "custom" provider 无 key 时尝试从旧 provider（deepseek/glm/kimi）迁移
 *    — 旧版用户可能在 "deepseek" 下保存了 key，迁移到 "custom" 后需要自动迁移
 */
export async function loadApiKey(
  provider: CloudProvider,
): Promise<string | null> {
  // P5-R3 fix: 先试 keyring，失败降级 localStorage（考古报告问题 1）
  try {
    const invoke = await getInvoke();
    const result = (await invoke("load_api_key", { provider })) as string | null;
    if (result) return result;
    // keyring 返回 null（NoEntry），尝试 localStorage 降级
  } catch (err) {
    // keyring 访问失败（非 NoEntry）——降级到 localStorage
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[llm] load_api_key keyring failed for ${provider}: ${errMsg}. Falling back to localStorage.`,
    );
  }
  // localStorage 降级读取
  try {
    const stored = localStorage.getItem(`llm-key-${provider}`);
    if (stored) {
      return decodeURIComponent(atob(stored));
    }
  } catch {
    /* localStorage 不可用或数据损坏 */
  }
  // P5-R3: "custom" provider 无 key 时，尝试从旧 provider 迁移
  // 旧版用户可能在 "deepseek"/"glm"/"kimi" 下保存了 key，
  // 迁移到 "custom" 后自动读取旧 key 并迁移到 "custom"。
  if (provider === "custom") {
    const legacyProviders: CloudProvider[] = ["deepseek", "glm", "kimi"];
    for (const legacy of legacyProviders) {
      // 先试 keyring
      try {
        const invoke = await getInvoke();
        const legacyKey = (await invoke("load_api_key", { provider: legacy })) as string | null;
        if (legacyKey) {
          // 迁移：保存到 "custom" 并删除旧条目
          await saveApiKey("custom", legacyKey);
          try { await invoke("delete_api_key", { provider: legacy }); } catch { /* ignore */ }
          console.info(`[llm] migrated API key from "${legacy}" to "custom"`);
          return legacyKey;
        }
      } catch {
        /* keyring 不可用，尝试 localStorage */
      }
      // 再试 localStorage
      try {
        const legacyStored = localStorage.getItem(`llm-key-${legacy}`);
        if (legacyStored) {
          const legacyKey = decodeURIComponent(atob(legacyStored));
          await saveApiKey("custom", legacyKey);
          try { localStorage.removeItem(`llm-key-${legacy}`); } catch { /* ignore */ }
          console.info(`[llm] migrated API key from localStorage "${legacy}" to "custom"`);
          return legacyKey;
        }
      } catch {
        /* localStorage 不可用或数据损坏 */
      }
    }
  }
  return null;
}

/**
 * 删除已保存的 API Key。
 *
 * @param provider - 厂商
 */
export async function deleteApiKey(provider: CloudProvider): Promise<void> {
  // P5-R3: 同时清除 keyring 和 localStorage
  try { localStorage.removeItem(`llm-key-${provider}`); } catch { /* ignore */ }
  try {
    const invoke = await getInvoke();
    await invoke("delete_api_key", { provider });
  } catch (err) {
    console.warn(`[llm] delete_api_key keyring failed for ${provider}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Staging 页面整理（P2.1.8：FileList "LLM 整理" 按钮调用）
// ---------------------------------------------------------------------------

/**
 * 整理 staging 页面内容。
 *
 * 将原始 markdown（完整页面 body，P5-R2 修复）发送给 LLM，
 * 返回结构化的 wiki 页面 markdown（含 frontmatter）。
 *
 * 流程：FileList 按钮 → organizeStagingPage → callLlm → Tauri IPC → Rust reqwest → LLM API
 *
 * @param provider - 厂商
 * @param apiKey - API Key
 * @param rawContent - 原始 markdown 内容（完整页面 body）
 * @param customBaseUrl - 自定义 API 地址（可选）
 * @param customModelName - 自定义模型名（可选，P5-R2 问题 2）
 * @returns 整理后的 markdown（含 frontmatter）或错误
 */
export async function organizeStagingPage(
  provider: CloudProvider,
  apiKey: string,
  rawContent: string,
  customBaseUrl?: string,
  customModelName?: string,
): Promise<LlmCallResult> {
  return callLlm({
    provider,
    apiKey,
    prompt: rawContent,
    systemPrompt: STAGING_SYSTEM_PROMPT,
    customBaseUrl,
    customModelName,
  });
}

/**
 * 流式整理 staging 页面内容（P6-R1）。
 *
 * 与 `organizeStagingPage` 的区别：使用 `callLlmStream` 流式调用，
 * token 逐步 emit 供前端增量渲染，大文件整理时用户无需等待完整响应。
 *
 * @param provider - 厂商
 * @param apiKey - API Key
 * @param rawContent - 原始 markdown 内容（完整页面 body）
 * @param customBaseUrl - 自定义 API 地址（可选）
 * @param customModelName - 自定义模型名（可选）
 * @param callbacks - 流式回调（onToken 增量渲染 / onUsage 用量 / onTruncated 截断 / onRetry 重试）
 * @returns 整理后的 markdown（含 frontmatter）或错误
 */
export async function organizeStagingPageStream(
  provider: CloudProvider,
  apiKey: string,
  rawContent: string,
  customBaseUrl?: string,
  customModelName?: string,
  maxTokens?: number,
  callbacks?: LlmStreamCallbacks,
): Promise<LlmCallResult> {
  return callLlmStream(
    {
      provider,
      apiKey,
      prompt: rawContent,
      systemPrompt: STAGING_SYSTEM_PROMPT,
      customBaseUrl,
      customModelName,
      maxTokens,
    },
    callbacks,
  );
}

// ---------------------------------------------------------------------------
// P6-R3: LLM 自动分类（建议+确认模式，决策计划 §4.3）
// ---------------------------------------------------------------------------

/** LLM 提议的新分类（需用户确认后才创建） */
export interface NewDomainProposal {
  /** kebab-case 分类名 */
  name: string;
  /** 分类描述（一句话说明用途） */
  description: string;
}

/** 分类结果（LLM 建议，非最终决策） */
export interface ClassifyResult {
  /** 推荐的已有领域（空字符串表示无匹配，需看 new_domain_proposal） */
  domain: string;
  /** 置信度 0.0-1.0（<0.7 时前端不自动推荐，让用户手动选） */
  confidence: number;
  /** 新分类提议（当无合适已有领域时） */
  new_domain_proposal: NewDomainProposal | null;
  /** 推荐理由（供用户判断是否接受） */
  reason: string;
}

/**
 * P6-R3: 调用 LLM 对文档进行分类建议（建议+确认模式）。
 *
 * 安全约束（决策计划 §4.3.3）：
 * - 此函数只返回 LLM 的分类**建议**，不执行任何文件系统写操作
 * - 新分类创建需用户在前端确认后，调用 `createDomain` IPC
 * - LLM 无法通过此函数删除或修改已有分类
 *
 * @param provider - 厂商
 * @param apiKey - API Key
 * @param title - 文档标题
 * @param preview - 文档内容预览（前 2000 字符即可）
 * @param existingDomains - 已有领域列表（从 kb_list_categories 获取）
 * @param customBaseUrl - 自定义 API 地址
 * @param customModelName - 自定义模型名
 * @returns 分类结果（domain + confidence + new_domain_proposal + reason）
 */
export async function classifyDomain(
  provider: CloudProvider,
  apiKey: string,
  title: string,
  preview: string,
  existingDomains: string[],
  customBaseUrl?: string,
  customModelName?: string,
): Promise<{ success: boolean; result?: ClassifyResult; error?: string }> {
  try {
    const invoke = await getInvoke();
    const result = (await invoke("classify_domain", {
      provider,
      apiKey,
      title,
      preview,
      existingDomains,
      baseUrl: customBaseUrl ?? "",
      model: customModelName ?? "",
    })) as ClassifyResult;
    return { success: true, result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
