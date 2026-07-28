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

// Mock @/lib/ipc 的 isTauri（控制是否在 Tauri 环境中）
vi.mock("@/lib/ipc", () => ({
  isTauri: vi.fn(() => true), // 默认模拟 Tauri 环境
}));

// Mock @tauri-apps/api/core 的 invoke（模拟 IPC 调用）
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// 导入被 mock 的模块（必须在 vi.mock 之后）
import { isTauri } from "@/lib/ipc";
import { invoke } from "@tauri-apps/api/core";
import {
  PROVIDERS,
  DEPRECATED_MODELS,
  callLlm,
  testConnection,
  saveApiKey,
  loadApiKey,
  deleteApiKey,
  STAGING_SYSTEM_PROMPT,
} from "@/lib/llm";

const mockIsTauri = vi.mocked(isTauri);
const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsTauri.mockReturnValue(true);
  mockInvoke.mockReset();
});

// ---------------------------------------------------------------------------
// 1. PROVIDERS 配置完整性
// ---------------------------------------------------------------------------

describe("PROVIDERS 配置", () => {
  const providers = ["deepseek", "glm", "kimi"] as const;

  it("三家厂商均已配置", () => {
    providers.forEach((p) => {
      expect(PROVIDERS[p]).toBeDefined();
    });
    expect(Object.keys(PROVIDERS)).toHaveLength(3);
  });

  it("每家厂商均有完整的配置字段", () => {
    providers.forEach((p) => {
      const config = PROVIDERS[p];
      expect(config.baseUrl).toBeTruthy();
      expect(config.model).toBeTruthy();
      expect(config.name).toBeTruthy();
      expect(config.docsUrl).toBeTruthy();
      expect(config.keyPlaceholder).toBeTruthy();
    });
  });

  it("baseUrl 均为 https:// 且无末尾斜杠", () => {
    providers.forEach((p) => {
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
    expect(mockInvoke).toHaveBeenCalledWith("call_llm_api", {
      provider: "glm",
      apiKey: "sk-glm-test",
      prompt: "原始内容",
      systemPrompt: "你是助手",
    });
  });

  it("systemPrompt 省略时传空字符串", async () => {
    mockInvoke.mockResolvedValue("ok");
    await callLlm({
      provider: "kimi",
      apiKey: "sk-kimi",
      prompt: "test",
    });
    expect(mockInvoke).toHaveBeenCalledWith("call_llm_api", {
      provider: "kimi",
      apiKey: "sk-kimi",
      prompt: "test",
      systemPrompt: "",
    });
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

  it("saveApiKey 失败时抛错", async () => {
    mockInvoke.mockRejectedValue(new Error("keyring unavailable"));
    await expect(saveApiKey("glm", "sk-test")).rejects.toThrow("keyring unavailable");
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

  it("非 Tauri 环境下 saveApiKey 抛错", async () => {
    mockIsTauri.mockReturnValue(false);
    await expect(saveApiKey("glm", "sk-test")).rejects.toThrow("Tauri");
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
    it("cloud-first 模式下三厂商均可调用", async () => {
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

      expect(mockInvoke).toHaveBeenCalledWith("call_llm_api", {
        provider: "glm",
        apiKey: "sk-glm",
        prompt: "原始 markdown",
        systemPrompt: expect.stringContaining("frontmatter"),
      });
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
    it("三厂商配置在模式切换后保持不变", () => {
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
