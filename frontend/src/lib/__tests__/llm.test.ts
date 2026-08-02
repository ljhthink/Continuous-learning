/**
 * LLM 集成层单元测试（P5, ADR-013）
 *
 * 测试矩阵：
 *   1. PROVIDERS 配置完整性（三家厂商均有 baseUrl/model/name/docsUrl/keyPlaceholder）
 *   2. model ID 正确性（禁止老版本名如 gpt-4o / deepseek-chat）
 *   3. base_url 格式（https://，无末尾斜杠）
 *   4. callLlm 在非 Tauri 环境下友好降级
 *   5. callLlm 成功调用（mock invoke）
 *   6. callLlm IPC 失败处理
 *   7. testConnection 成功/失败/空 Key
 *   8. saveApiKey / loadApiKey / deleteApiKey（mock invoke）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// P5-R3: localStorage mock（node 环境无 localStorage，saveApiKey/loadApiKey 双层存储需要）
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

// Mock @/lib/ipc 的 isTauri（控制是否在 Tauri 环境中）
vi.mock("@/lib/ipc", () => ({
  isTauri: vi.fn(() => true), // 默认模拟 Tauri 环境
}));

// Mock @tauri-apps/api/core 的 invoke（模拟 IPC 调用）
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// P6-R1: Mock @tauri-apps/api/event 的 listen（模拟事件监听）
// 注意：vi.mock 工厂被提升到文件顶部，不能引用外部变量（TDZ），
// 因此工厂内只返回 vi.fn()，具体行为在 beforeEach 中配置
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

// 导入被 mock 的模块（必须在 vi.mock 之后）
import { isTauri } from "@/lib/ipc";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  PROVIDERS,
  DEPRECATED_MODELS,
  callLlm,
  callLlmStream,
  organizeStagingPageStream,
  classifyDomain,
  testConnection,
  saveApiKey,
  loadApiKey,
  deleteApiKey,
  STAGING_SYSTEM_PROMPT,
  type LlmUsage,
  type LlmStreamCallbacks,
  type ClassifyResult,
} from "@/lib/llm";

const mockIsTauri = vi.mocked(isTauri);
const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);
// P6-R1: 记录每次 listen 返回的 unlisten 函数调用次数
let unlistenCallCount = 0;

beforeEach(() => {
  vi.clearAllMocks();
  mockIsTauri.mockReturnValue(true);
  mockInvoke.mockReset();
  // P6-R1: 每次 listen 调用返回一个独立的 unlisten mock（记录调用）
  unlistenCallCount = 0;
  mockListen.mockReset();
  mockListen.mockImplementation(() => {
    const unlisten = vi.fn(() => { unlistenCallCount++; });
    return Promise.resolve(unlisten);
  });
  localStorageMock.clear();
});

// ---------------------------------------------------------------------------
// 1. PROVIDERS 配置完整性
// ---------------------------------------------------------------------------

describe("PROVIDERS 配置", () => {
  // P5-R3: custom 为 UI 唯一可选 provider，deepseek/glm/kimi 保留用于向后兼容
  const legacyProviders = ["deepseek", "glm", "kimi"] as const;

  it("custom + 三家旧厂商均已配置", () => {
    expect(PROVIDERS.custom).toBeDefined();
    legacyProviders.forEach((p) => {
      expect(PROVIDERS[p]).toBeDefined();
    });
    expect(Object.keys(PROVIDERS)).toHaveLength(4);
  });

  it("每家旧厂商均有完整的配置字段", () => {
    legacyProviders.forEach((p) => {
      const config = PROVIDERS[p];
      expect(config.baseUrl).toBeTruthy();
      expect(config.model).toBeTruthy();
      expect(config.name).toBeTruthy();
      expect(config.docsUrl).toBeTruthy();
      expect(config.keyPlaceholder).toBeTruthy();
    });
  });

  it("旧厂商 baseUrl 均为 https:// 且无末尾斜杠", () => {
    // P5-R3: custom 的 baseUrl 为空（由用户填写），只检查旧厂商
    legacyProviders.forEach((p) => {
      const url = PROVIDERS[p].baseUrl;
      expect(url).toMatch(/^https:\/\//);
      expect(url).not.toMatch(/\/$/);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. model ID 正确性（禁止老版本名）
// ---------------------------------------------------------------------------

describe("model ID 正确性", () => {
  it("DeepSeek 使用 deepseek-v4-pro（非 deepseek-chat/reasoner）", () => {
    expect(PROVIDERS.deepseek.model).toBe("deepseek-v4-pro");
    expect(DEPRECATED_MODELS).toContain("deepseek-chat");
    expect(DEPRECATED_MODELS).toContain("deepseek-reasoner");
  });

  it("GLM 使用 glm-5.2（非 glm-4/glm-4.5）", () => {
    expect(PROVIDERS.glm.model).toBe("glm-5.2");
    expect(DEPRECATED_MODELS).toContain("glm-4");
  });

  it("Kimi 使用 kimi-k3（非 moonshot-v1-*）", () => {
    expect(PROVIDERS.kimi.model).toBe("kimi-k3");
    expect(DEPRECATED_MODELS).toContain("moonshot-v1-128k");
  });

  it("严禁使用 gpt-4o 等老版本名", () => {
    const allModels = Object.values(PROVIDERS).map((c) => c.model);
    DEPRECATED_MODELS.forEach((deprecated) => {
      expect(allModels).not.toContain(deprecated);
    });
  });

  it("DEPRECATED_MODELS 列表包含已知老版本", () => {
    expect(DEPRECATED_MODELS).toContain("gpt-4o");
    expect(DEPRECATED_MODELS).toContain("gpt-4o-mini");
  });
});

// ---------------------------------------------------------------------------
// 3. base_url 域名正确性
// ---------------------------------------------------------------------------

describe("base_url 域名", () => {
  it("DeepSeek 指向 api.deepseek.com", () => {
    expect(PROVIDERS.deepseek.baseUrl).toBe("https://api.deepseek.com/v1");
  });

  it("GLM 指向 open.bigmodel.cn", () => {
    expect(PROVIDERS.glm.baseUrl).toBe("https://open.bigmodel.cn/api/paas/v4");
  });

  it("Kimi 指向 api.moonshot.cn", () => {
    expect(PROVIDERS.kimi.baseUrl).toBe("https://api.moonshot.cn/v1");
  });
});

// ---------------------------------------------------------------------------
// 4. callLlm 在非 Tauri 环境下友好降级
// ---------------------------------------------------------------------------

describe("callLlm 非 Tauri 环境降级", () => {
  it("浏览器 dev 模式返回友好错误，不崩溃", async () => {
    mockIsTauri.mockReturnValue(false);
    const result = await callLlm({
      provider: "deepseek",
      apiKey: "sk-test",
      prompt: "test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Tauri");
  });
});

// ---------------------------------------------------------------------------
// 5. callLlm 成功调用
// ---------------------------------------------------------------------------

describe("callLlm 成功调用", () => {
  it("正确传递 provider/apiKey/prompt/systemPrompt 给 invoke", async () => {
    const mockResponse = "# 整理后的 markdown 内容";
    mockInvoke.mockResolvedValue(mockResponse);

    const result = await callLlm({
      provider: "glm",
      apiKey: "sk-glm-test",
      prompt: "原始内容",
      systemPrompt: "你是助手",
    });

    expect(result.success).toBe(true);
    expect(result.content).toBe(mockResponse);
    // AC-5 (UX-2): callLlm 现在透传 baseUrl（customBaseUrl 缺省时为 ""）。
    // 用 objectContaining 容忍未来可选字段，同时显式断言 baseUrl="" 契约。
    expect(mockInvoke).toHaveBeenCalledWith(
      "call_llm_api",
      expect.objectContaining({
        provider: "glm",
        apiKey: "sk-glm-test",
        prompt: "原始内容",
        systemPrompt: "你是助手",
        baseUrl: "",
      }),
    );
  });

  it("systemPrompt 省略时传空字符串", async () => {
    mockInvoke.mockResolvedValue("ok");
    await callLlm({
      provider: "kimi",
      apiKey: "sk-kimi",
      prompt: "test",
    });
    // AC-5: 同上，customBaseUrl 缺省时透传 baseUrl=""。
    expect(mockInvoke).toHaveBeenCalledWith(
      "call_llm_api",
      expect.objectContaining({
        provider: "kimi",
        apiKey: "sk-kimi",
        prompt: "test",
        systemPrompt: "",
        baseUrl: "",
      }),
    );
  });

  it("AC-5: customBaseUrl 透传给 invoke 的 baseUrl 字段", async () => {
    mockInvoke.mockResolvedValue("ok");
    await callLlm({
      provider: "glm",
      apiKey: "sk-glm-test",
      prompt: "原始内容",
      customBaseUrl: "https://my.proxy.example.com/v1",
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      "call_llm_api",
      expect.objectContaining({
        provider: "glm",
        baseUrl: "https://my.proxy.example.com/v1",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 6. callLlm IPC 失败处理
// ---------------------------------------------------------------------------

describe("callLlm IPC 失败", () => {
  it("invoke 抛错时返回 success=false + error 信息", async () => {
    mockInvoke.mockRejectedValue(new Error("LLM API error 401: unauthorized"));
    const result = await callLlm({
      provider: "deepseek",
      apiKey: "invalid-key",
      prompt: "test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("401");
    expect(result.error).toContain("unauthorized");
  });

  it("invoke 抛非 Error 类型时也能处理", async () => {
    mockInvoke.mockRejectedValue("string error");
    const result = await callLlm({
      provider: "deepseek",
      apiKey: "sk-test",
      prompt: "test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("string error");
  });
});

// ---------------------------------------------------------------------------
// 7. testConnection
// ---------------------------------------------------------------------------

describe("testConnection", () => {
  it("成功时返回 ok=true + 厂商名", async () => {
    mockInvoke.mockResolvedValue("OK");
    const result = await testConnection("deepseek", "sk-valid");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("DeepSeek V4");
    expect(result.message).toContain("deepseek-v4-pro");
  });

  it("失败时返回 ok=false + 错误信息", async () => {
    mockInvoke.mockRejectedValue(new Error("401 unauthorized"));
    const result = await testConnection("glm", "invalid");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("连接失败");
    expect(result.message).toContain("401");
  });

  it("空 API Key 时返回 ok=false 不调用 invoke", async () => {
    const result = await testConnection("kimi", "");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("请先输入 API Key");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("仅空白字符的 API Key 也视为空", async () => {
    const result = await testConnection("kimi", "   ");
    expect(result.ok).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 8. API Key 持久化（saveApiKey / loadApiKey / deleteApiKey）
// ---------------------------------------------------------------------------

describe("API Key 持久化", () => {
  it("saveApiKey 正确调用 invoke", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await saveApiKey("deepseek", "sk-save-test");
    expect(mockInvoke).toHaveBeenCalledWith("save_api_key", {
      provider: "deepseek",
      apiKey: "sk-save-test",
    });
  });

  it("saveApiKey keyring 失败时降级到 localStorage（不抛错）", async () => {
    // P5-R3: keyring 失败不再抛错，降级到 localStorage
    mockInvoke.mockRejectedValue(new Error("keyring unavailable"));
    localStorage.clear();
    await expect(saveApiKey("glm", "sk-test")).resolves.toBeUndefined();
    // 验证 localStorage 降级存储
    const stored = localStorage.getItem("llm-key-glm");
    expect(stored).toBeTruthy();
  });

  it("loadApiKey 返回已保存的 Key", async () => {
    mockInvoke.mockResolvedValue("sk-saved");
    const key = await loadApiKey("kimi");
    expect(key).toBe("sk-saved");
    expect(mockInvoke).toHaveBeenCalledWith("load_api_key", {
      provider: "kimi",
    });
  });

  it("loadApiKey 未保存时返回 null", async () => {
    mockInvoke.mockResolvedValue(null);
    const key = await loadApiKey("deepseek");
    expect(key).toBeNull();
  });

  it("loadApiKey 失败时返回 null（不抛错，降级处理）", async () => {
    mockInvoke.mockRejectedValue(new Error("keyring error"));
    const key = await loadApiKey("glm");
    expect(key).toBeNull();
  });

  it("deleteApiKey 正确调用 invoke", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await deleteApiKey("kimi");
    expect(mockInvoke).toHaveBeenCalledWith("delete_api_key", {
      provider: "kimi",
    });
  });

  it("deleteApiKey 失败时不抛错（静默降级）", async () => {
    mockInvoke.mockRejectedValue(new Error("delete failed"));
    await expect(deleteApiKey("deepseek")).resolves.toBeUndefined();
  });

  it("非 Tauri 环境下 saveApiKey 降级到 localStorage（不抛错）", async () => {
    // P5-R3: 非 Tauri 环境 keyring 不可用，降级到 localStorage
    mockIsTauri.mockReturnValue(false);
    localStorage.clear();
    await expect(saveApiKey("glm", "sk-test")).resolves.toBeUndefined();
    // 验证 localStorage 降级存储
    const stored = localStorage.getItem("llm-key-glm");
    expect(stored).toBeTruthy();
  });

  it("非 Tauri 环境下 loadApiKey 返回 null", async () => {
    mockIsTauri.mockReturnValue(false);
    const key = await loadApiKey("kimi");
    expect(key).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. STAGING_SYSTEM_PROMPT
// ---------------------------------------------------------------------------

describe("STAGING_SYSTEM_PROMPT", () => {
  it("包含整理指令", () => {
    expect(STAGING_SYSTEM_PROMPT).toContain("frontmatter");
    expect(STAGING_SYSTEM_PROMPT).toContain("tags");
    expect(STAGING_SYSTEM_PROMPT).toContain("摘要");
  });

  it("长度合理（100-1000 字符）", () => {
    expect(STAGING_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    expect(STAGING_SYSTEM_PROMPT.length).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// 10. 三态模式测试矩阵（P2.4, ADR-013 D1）
// ---------------------------------------------------------------------------

describe("P2.4 三态模式测试矩阵", () => {
  describe("disabled 模式", () => {
    it("disabled 模式不调用 LLM（callLlm 在非 Tauri 环境返回错误）", async () => {
      mockIsTauri.mockReturnValue(false);
      const result = await callLlm({
        provider: "deepseek",
        apiKey: "sk-test",
        prompt: "test",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Tauri");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("disabled 模式下 organizeStagingPage 不调用 invoke", async () => {
      mockIsTauri.mockReturnValue(false);
      const { organizeStagingPage } = await import("@/lib/llm");
      const result = await organizeStagingPage("deepseek", "sk-test", "raw");
      expect(result.success).toBe(false);
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe("cloud-first 模式", () => {
    it("cloud-first 模式下所有 provider 均可调用", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue("整理结果");

      const providers = ["deepseek", "glm", "kimi"] as const;
      for (const provider of providers) {
        const result = await callLlm({
          provider,
          apiKey: `sk-${provider}`,
          prompt: "test content",
          systemPrompt: "system prompt",
        });
        expect(result.success).toBe(true);
        expect(result.content).toBe("整理结果");
      }

      expect(mockInvoke).toHaveBeenCalledTimes(3);
    });

    it("cloud-first 模式下 organizeStagingPage 使用 STAGING_SYSTEM_PROMPT", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue("# 整理后的页面");

      const { organizeStagingPage } = await import("@/lib/llm");
      await organizeStagingPage("glm", "sk-glm", "原始 markdown");

      // AC-5: organizeStagingPage 未传 customBaseUrl/customModelName，透传空字符串。
      expect(mockInvoke).toHaveBeenCalledWith(
        "call_llm_api",
        expect.objectContaining({
          provider: "glm",
          apiKey: "sk-glm",
          prompt: "原始 markdown",
          systemPrompt: expect.stringContaining("frontmatter"),
          baseUrl: "",
          model: "",
        }),
      );
    });

    // P5-R2 问题 2: customModelName 透传到 IPC model 参数（guardrail Q-3 补充测试）
    it("customModelName 透传到 call_llm_api 的 model 参数", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue("整理结果");

      const { organizeStagingPage } = await import("@/lib/llm");
      await organizeStagingPage(
        "deepseek",
        "sk-test",
        "原始 markdown",
        "https://custom.api/v1",
        "my-custom-model-name",
      );

      expect(mockInvoke).toHaveBeenCalledWith(
        "call_llm_api",
        expect.objectContaining({
          provider: "deepseek",
          baseUrl: "https://custom.api/v1",
          model: "my-custom-model-name",
        }),
      );
    });

    // P5-R2 问题 2: callLlm 直接调用时 customModelName 透传
    it("callLlm 直接调用时 customModelName 透传 model 参数", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue("结果");

      await callLlm({
        provider: "kimi",
        apiKey: "sk-kimi",
        prompt: "test",
        customModelName: "custom-k3-model",
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "call_llm_api",
        expect.objectContaining({
          model: "custom-k3-model",
        }),
      );
    });

    it("cloud-first 模式下 API Key 从 keyring 加载", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue("sk-saved-key");

      const key = await loadApiKey("kimi");
      expect(key).toBe("sk-saved-key");
      expect(mockInvoke).toHaveBeenCalledWith("load_api_key", {
        provider: "kimi",
      });
    });
  });

  describe("local-first 模式", () => {
    it("local-first 模式暂不支持 staging 整理（FileList 层面拦截）", async () => {
      // local-first 模式的拦截逻辑在 FileList.handleOrganize 中，
      // 不在 llm.ts 层面。这里验证 callLlm 本身仍可被调用
      //（local-first 模式未来可能通过 Ollama IPC 调用）。
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue("Ollama 结果");

      const result = await callLlm({
        provider: "deepseek", // local-first 模式下 provider 字段不影响
        apiKey: "", // local-first 不需要 API Key
        prompt: "test",
      });

      // callLlm 本身不区分模式，它只是 IPC 调用
      expect(result.success).toBe(true);
    });
  });

  describe("模式切换一致性", () => {
    it("provider 配置在模式切换后保持不变", () => {
      // PROVIDERS 是静态配置，不受模式切换影响
      expect(PROVIDERS.deepseek.model).toBe("deepseek-v4-pro");
      expect(PROVIDERS.glm.model).toBe("glm-5.2");
      expect(PROVIDERS.kimi.model).toBe("kimi-k3");
    });

    it("DEPRECATED_MODELS 在所有模式下均生效", () => {
      // 黑名单是静态的，不受模式影响
      expect(DEPRECATED_MODELS).toContain("gpt-4o");
      expect(DEPRECATED_MODELS).toContain("deepseek-chat");
      expect(DEPRECATED_MODELS).toContain("glm-4");
    });
  });
});

// ---------------------------------------------------------------------------
// 11. P6-R1: 流式响应 / 重试 / 截断检测 / 成本控制 测试
// ---------------------------------------------------------------------------

describe("P6-R1 流式响应与增强能力", () => {
  describe("callLlm 非流式模式（P6-R1 向后兼容）", () => {
    it("callLlm 传递 stream: false（向后兼容）", async () => {
      mockInvoke.mockResolvedValue("结果");

      await callLlm({
        provider: "deepseek",
        apiKey: "sk-test",
        prompt: "test",
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "call_llm_api",
        expect.objectContaining({
          stream: false,
          maxTokens: null,
        }),
      );
    });

    it("callLlm 传递可选 maxTokens（成本控制）", async () => {
      mockInvoke.mockResolvedValue("结果");

      await callLlm({
        provider: "deepseek",
        apiKey: "sk-test",
        prompt: "test",
        maxTokens: 4096,
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "call_llm_api",
        expect.objectContaining({
          maxTokens: 4096,
        }),
      );
    });
  });

  describe("callLlmStream 流式模式", () => {
    it("callLlmStream 传递 stream: true", async () => {
      mockInvoke.mockResolvedValue("流式完整结果");

      await callLlmStream({
        provider: "deepseek",
        apiKey: "sk-test",
        prompt: "test",
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "call_llm_api",
        expect.objectContaining({
          stream: true,
          maxTokens: null,
        }),
      );
    });

    it("callLlmStream 成功时返回完整内容", async () => {
      mockInvoke.mockResolvedValue("完整 markdown 内容");

      const result = await callLlmStream({
        provider: "glm",
        apiKey: "sk-glm",
        prompt: "原始内容",
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe("完整 markdown 内容");
    });

    it("callLlmStream 注册 onToken 回调时监听 llm-token 事件", async () => {
      mockInvoke.mockResolvedValue("结果");

      const onToken = vi.fn();
      await callLlmStream(
        { provider: "deepseek", apiKey: "sk-test", prompt: "test" },
        { onToken },
      );

      expect(mockListen).toHaveBeenCalledWith(
        "llm-token",
        expect.any(Function),
      );
    });

    it("callLlmStream 注册 onUsage 回调时监听 llm-usage 事件", async () => {
      mockInvoke.mockResolvedValue("结果");

      const onUsage = vi.fn();
      await callLlmStream(
        { provider: "deepseek", apiKey: "sk-test", prompt: "test" },
        { onUsage },
      );

      expect(mockListen).toHaveBeenCalledWith(
        "llm-usage",
        expect.any(Function),
      );
    });

    it("callLlmStream 注册 onTruncated 回调时监听 llm-truncated 事件", async () => {
      mockInvoke.mockResolvedValue("结果");

      const onTruncated = vi.fn();
      await callLlmStream(
        { provider: "deepseek", apiKey: "sk-test", prompt: "test" },
        { onTruncated },
      );

      expect(mockListen).toHaveBeenCalledWith(
        "llm-truncated",
        expect.any(Function),
      );
    });

    it("callLlmStream 注册 onRetry 回调时监听 llm-retry 事件", async () => {
      mockInvoke.mockResolvedValue("结果");

      const onRetry = vi.fn();
      await callLlmStream(
        { provider: "deepseek", apiKey: "sk-test", prompt: "test" },
        { onRetry },
      );

      expect(mockListen).toHaveBeenCalledWith(
        "llm-retry",
        expect.any(Function),
      );
    });

    it("callLlmStream 注册 onDone 回调时监听 llm-done 事件", async () => {
      mockInvoke.mockResolvedValue("结果");

      const onDone = vi.fn();
      await callLlmStream(
        { provider: "deepseek", apiKey: "sk-test", prompt: "test" },
        { onDone },
      );

      expect(mockListen).toHaveBeenCalledWith(
        "llm-done",
        expect.any(Function),
      );
    });

    it("callLlmStream 完成后清理所有事件监听（unlisten），避免内存泄漏", async () => {
      mockInvoke.mockResolvedValue("结果");

      await callLlmStream(
        { provider: "deepseek", apiKey: "sk-test", prompt: "test" },
        {
          onToken: vi.fn(),
          onUsage: vi.fn(),
          onTruncated: vi.fn(),
          onRetry: vi.fn(),
          onDone: vi.fn(),
        },
      );

      // 5 个回调 → 5 个 listen → 5 个 unlisten
      expect(mockListen).toHaveBeenCalledTimes(5);
      expect(unlistenCallCount).toBe(5);
    });

    it("callLlmStream 失败时也清理事件监听（finally 块）", async () => {
      mockInvoke.mockRejectedValue(new Error("网络错误"));

      const result = await callLlmStream(
        { provider: "deepseek", apiKey: "sk-test", prompt: "test" },
        { onToken: vi.fn() },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("网络错误");
      // 即使失败，unlisten 仍被调用（finally 块保证）
      expect(unlistenCallCount).toBe(1);
    });

    it("callLlmStream 无回调时不注册任何事件监听", async () => {
      mockInvoke.mockResolvedValue("结果");

      await callLlmStream({
        provider: "deepseek",
        apiKey: "sk-test",
        prompt: "test",
      });

      expect(mockListen).not.toHaveBeenCalled();
    });

    it("callLlmStream 非 Tauri 环境返回友好错误", async () => {
      mockIsTauri.mockReturnValue(false);

      const result = await callLlmStream({
        provider: "deepseek",
        apiKey: "sk-test",
        prompt: "test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Tauri");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("callLlmStream 传递 maxTokens（成本控制）", async () => {
      mockInvoke.mockResolvedValue("结果");

      await callLlmStream(
        {
          provider: "deepseek",
          apiKey: "sk-test",
          prompt: "test",
          maxTokens: 8192,
        },
        { onToken: vi.fn() },
      );

      expect(mockInvoke).toHaveBeenCalledWith(
        "call_llm_api",
        expect.objectContaining({
          stream: true,
          maxTokens: 8192,
        }),
      );
    });
  });

  describe("organizeStagingPageStream 流式整理", () => {
    it("使用 STAGING_SYSTEM_PROMPT 作为 systemPrompt", async () => {
      mockInvoke.mockResolvedValue("# 整理结果");

      await organizeStagingPageStream(
        "deepseek",
        "sk-test",
        "原始 markdown",
      );

      expect(mockInvoke).toHaveBeenCalledWith(
        "call_llm_api",
        expect.objectContaining({
          systemPrompt: expect.stringContaining("frontmatter"),
          stream: true,
        }),
      );
    });

    it("传递 customBaseUrl 和 customModelName", async () => {
      mockInvoke.mockResolvedValue("结果");

      await organizeStagingPageStream(
        "deepseek",
        "sk-test",
        "原始内容",
        "https://custom.api/v1",
        "my-model",
      );

      expect(mockInvoke).toHaveBeenCalledWith(
        "call_llm_api",
        expect.objectContaining({
          baseUrl: "https://custom.api/v1",
          model: "my-model",
        }),
      );
    });

    it("回调被正确传递到底层 callLlmStream", async () => {
      mockInvoke.mockResolvedValue("结果");

      const onToken = vi.fn();
      await organizeStagingPageStream(
        "deepseek",
        "sk-test",
        "内容",
        undefined,
        undefined,
        undefined,
        { onToken },
      );

      expect(mockListen).toHaveBeenCalledWith(
        "llm-token",
        expect.any(Function),
      );
    });
  });

  describe("LlmStreamCallbacks 类型与 LlmUsage 接口", () => {
    it("LlmUsage 接口包含 total_tokens 必填字段", () => {
      const usage: LlmUsage = {
        total_tokens: 1234,
        prompt_tokens: 500,
        completion_tokens: 734,
      };
      expect(usage.total_tokens).toBe(1234);
    });

    it("LlmUsage 允许仅 total_tokens（其他可选）", () => {
      const usage: LlmUsage = { total_tokens: 100 };
      expect(usage.total_tokens).toBe(100);
      expect(usage.prompt_tokens).toBeUndefined();
    });

    it("LlmStreamCallbacks 所有回调均为可选", () => {
      const callbacks: LlmStreamCallbacks = {};
      expect(callbacks.onToken).toBeUndefined();
      expect(callbacks.onUsage).toBeUndefined();
      expect(callbacks.onTruncated).toBeUndefined();
      expect(callbacks.onRetry).toBeUndefined();
      expect(callbacks.onDone).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// P6-R3: LLM 自动分类（建议+确认模式）测试
// ---------------------------------------------------------------------------

describe("P6-R3 classifyDomain 分类建议", () => {
  const mockClassifyResult: ClassifyResult = {
    domain: "coding",
    confidence: 0.92,
    new_domain_proposal: null,
    reason: "文档包含大量编程代码示例",
  };

  it("成功调用 classify_domain IPC 并返回分类结果", async () => {
    mockInvoke.mockResolvedValue(mockClassifyResult);

    const result = await classifyDomain(
      "custom",
      "sk-test",
      "Python 异步编程指南",
      "asyncio 是 Python 的异步编程库...",
      ["coding", "design", "emotions"],
    );

    expect(result.success).toBe(true);
    expect(result.result?.domain).toBe("coding");
    expect(result.result?.confidence).toBe(0.92);
    expect(result.result?.reason).toContain("编程");
    expect(mockInvoke).toHaveBeenCalledWith(
      "classify_domain",
      expect.objectContaining({
        provider: "custom",
        apiKey: "sk-test",
        title: "Python 异步编程指南",
        existingDomains: ["coding", "design", "emotions"],
      }),
    );
  });

  it("传递 customBaseUrl 和 customModelName 给 IPC", async () => {
    mockInvoke.mockResolvedValue(mockClassifyResult);

    await classifyDomain(
      "custom",
      "sk-test",
      "测试文档",
      "预览内容",
      ["coding"],
      "https://my.api/v1",
      "my-model",
    );

    expect(mockInvoke).toHaveBeenCalledWith(
      "classify_domain",
      expect.objectContaining({
        baseUrl: "https://my.api/v1",
        model: "my-model",
      }),
    );
  });

  it("IPC 抛错时返回 success=false + error 信息", async () => {
    mockInvoke.mockRejectedValue(new Error("API Key 未配置"));

    const result = await classifyDomain(
      "custom",
      "",
      "测试",
      "预览",
      ["coding"],
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("API Key");
  });

  it("非 Tauri 环境返回友好错误", async () => {
    mockIsTauri.mockReturnValue(false);

    const result = await classifyDomain(
      "custom",
      "sk-test",
      "测试",
      "预览",
      ["coding"],
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Tauri");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("返回新分类提议时 new_domain_proposal 非空", async () => {
    const newProposalResult: ClassifyResult = {
      domain: "",
      confidence: 0.85,
      new_domain_proposal: {
        name: "machine-learning",
        description: "机器学习相关文档",
      },
      reason: "无合适已有领域，建议新建机器学习分类",
    };
    mockInvoke.mockResolvedValue(newProposalResult);

    const result = await classifyDomain(
      "custom",
      "sk-test",
      "深度学习入门",
      "神经网络与反向传播...",
      ["coding", "design"],
    );

    expect(result.success).toBe(true);
    expect(result.result?.domain).toBe("");
    expect(result.result?.new_domain_proposal).not.toBeNull();
    expect(result.result?.new_domain_proposal?.name).toBe("machine-learning");
    expect(result.result?.new_domain_proposal?.description).toContain("机器学习");
  });

  it("安全约束：classifyDomain 不调用任何文件系统写操作 IPC", async () => {
    // classifyDomain 只应调用 "classify_domain" IPC，不应调用
    // create_domain_directory / move_page_domain / delete_page 等写操作
    mockInvoke.mockResolvedValue(mockClassifyResult);

    await classifyDomain("custom", "sk-test", "测试", "预览", ["coding"]);

    const calledCommands = mockInvoke.mock.calls.map((c) => c[0]);
    expect(calledCommands).toContain("classify_domain");
    expect(calledCommands).not.toContain("create_domain_directory");
    expect(calledCommands).not.toContain("move_page_domain");
    expect(calledCommands).not.toContain("delete_page");
  });
});
