/**
 * P5-R3 集成测试 — 补充 guardrail-enforcer 建议的 4 个未覆盖场景
 *
 * 1. loadApiKey 迁移逻辑：custom 无 Key 时从旧 provider 迁移
 * 2. loadApiKey localStorage 降级往返
 * 3. loadApiKey 无任何 Key 时返回 null
 * 4. saveApiKey + loadApiKey 双层存储往返一致性
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// localStorage mock（node 环境无 localStorage）
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

vi.mock("@/lib/ipc", () => ({
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { isTauri } from "@/lib/ipc";
import { invoke } from "@tauri-apps/api/core";
import { saveApiKey, loadApiKey } from "@/lib/llm";
import { decryptSecret } from "@/lib/crypto-utils";

const mockIsTauri = vi.mocked(isTauri);
const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsTauri.mockReturnValue(true);
  mockInvoke.mockReset();
  localStorageMock.clear();
});

// ---------------------------------------------------------------------------
// AC-1: loadApiKey 旧 provider 迁移逻辑（guardrail Finding-3, 未覆盖场景 1）
// ---------------------------------------------------------------------------

describe("AC-1: loadApiKey 旧 provider 迁移逻辑", () => {
  it("custom 无 Key 时从 deepseek 迁移（keyring）", async () => {
    // custom 无 key
    // deepseek 有 key
    mockInvoke.mockImplementation(// eslint-disable-next-line @typescript-eslint/no-explicit-any
(cmd: string, args?: any) => {
      if (cmd === "load_api_key" && args?.provider === "custom") return Promise.resolve(null);
      if (cmd === "load_api_key" && args?.provider === "deepseek") return Promise.resolve("sk-deepseek-migrated");
      if (cmd === "save_api_key") return Promise.resolve(undefined);
      if (cmd === "delete_api_key") return Promise.resolve(undefined);
      return Promise.resolve(null);
    });

    const key = await loadApiKey("custom");
    expect(key).toBe("sk-deepseek-migrated");
    // 验证迁移：saveApiKey("custom", ...) 被调用
    const saveCall = mockInvoke.mock.calls.find(
      (c) => c[0] === "save_api_key" && (c[1] as Record<string, unknown>)?.provider === "custom",
    );
    expect(saveCall).toBeDefined();
    expect((saveCall![1] as Record<string, unknown>).apiKey).toBe("sk-deepseek-migrated");
  });

  it("custom 无 Key 且 deepseek 也无 Key 时从 glm 迁移", async () => {
    mockInvoke.mockImplementation(// eslint-disable-next-line @typescript-eslint/no-explicit-any
(cmd: string, args?: any) => {
      if (cmd === "load_api_key" && args?.provider === "custom") return Promise.resolve(null);
      if (cmd === "load_api_key" && args?.provider === "deepseek") return Promise.resolve(null);
      if (cmd === "load_api_key" && args?.provider === "glm") return Promise.resolve("sk-glm-migrated");
      if (cmd === "save_api_key") return Promise.resolve(undefined);
      if (cmd === "delete_api_key") return Promise.resolve(undefined);
      return Promise.resolve(null);
    });

    const key = await loadApiKey("custom");
    expect(key).toBe("sk-glm-migrated");
  });

  it("custom 无 Key 且所有旧 provider 也无 Key 时返回 null", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "load_api_key") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const key = await loadApiKey("custom");
    expect(key).toBeNull();
  });

  it("custom 有 Key 时不触发迁移", async () => {
    mockInvoke.mockImplementation(// eslint-disable-next-line @typescript-eslint/no-explicit-any
(cmd: string, args?: any) => {
      if (cmd === "load_api_key" && args?.provider === "custom") return Promise.resolve("sk-custom-existing");
      return Promise.resolve(null);
    });

    const key = await loadApiKey("custom");
    expect(key).toBe("sk-custom-existing");
    // 不应该尝试读旧 provider
    const legacyCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === "load_api_key" &&
      ["deepseek", "glm", "kimi"].includes((c[1] as Record<string, unknown>)?.provider as string),
    );
    expect(legacyCalls).toHaveLength(0);
  });

  it("keyring 全部失败时从 localStorage 旧 provider 迁移", async () => {
    // keyring 全部抛错
    mockInvoke.mockRejectedValue(new Error("keyring unavailable"));
    // 在 localStorage 中存一个 deepseek key
    localStorage.setItem("llm-key-deepseek", btoa(encodeURIComponent("sk-localstorage-deepseek")));

    const key = await loadApiKey("custom");
    expect(key).toBe("sk-localstorage-deepseek");
    // 验证迁移到 custom 的 localStorage：P7 修复后应为 AES-GCM 加密格式，
    // 解密后还原明文（不再明文 base64 落盘）。
    const customStored = localStorage.getItem("llm-key-custom");
    expect(customStored).toBeTruthy();
    expect(customStored!.startsWith("kb-env:")).toBe(true);
    expect(await decryptSecret("custom", customStored!)).toBe("sk-localstorage-deepseek");
  });
});

// ---------------------------------------------------------------------------
// AC-1: saveApiKey + loadApiKey 双层存储往返一致性
// ---------------------------------------------------------------------------

describe("AC-1: 双层存储往返一致性", () => {
  it("keyring 成功时 save → load 往返一致", async () => {
    mockInvoke.mockImplementation(// eslint-disable-next-line @typescript-eslint/no-explicit-any
(cmd: string, args?: any) => {
      if (cmd === "save_api_key") {
        // 模拟 keyring 存储
        mockInvoke.mockImplementation((c: string, a?: any) => {
          if (c === "load_api_key" && a?.provider === args?.provider) {
            return Promise.resolve(args?.apiKey as string);
          }
          return Promise.resolve(null);
        });
        return Promise.resolve(undefined);
      }
      return Promise.resolve(null);
    });

    await saveApiKey("custom", "sk-roundtrip-test");
    const loaded = await loadApiKey("custom");
    expect(loaded).toBe("sk-roundtrip-test");
  });

  it("keyring 失败时 localStorage 降级往返一致", async () => {
    mockInvoke.mockRejectedValue(new Error("keyring unavailable"));

    await saveApiKey("custom", "sk-fallback-test");
    const loaded = await loadApiKey("custom");
    expect(loaded).toBe("sk-fallback-test");
  });

  it("包含 Unicode 字符的 Key 往返一致（base64 编码正确性）", async () => {
    mockInvoke.mockRejectedValue(new Error("keyring unavailable"));
    const unicodeKey = "sk-测试-🔑-unicode";

    await saveApiKey("custom", unicodeKey);
    const loaded = await loadApiKey("custom");
    expect(loaded).toBe(unicodeKey);
  });
});

// ---------------------------------------------------------------------------
// AC-1: 非 Tauri 环境降级（边缘场景）
// ---------------------------------------------------------------------------

describe("AC-1: 非 Tauri 环境边缘场景", () => {
  it("非 Tauri 环境 saveApiKey → loadApiKey localStorage 往返", async () => {
    mockIsTauri.mockReturnValue(false);

    await saveApiKey("custom", "sk-notauri-test");
    const loaded = await loadApiKey("custom");
    // 非 Tauri 环境下 keyring 不可用，loadApiKey 降级到 localStorage
    // 但迁移逻辑中 invoke 会抛错，所以需要检查 localStorage 降级路径
    expect(loaded).toBe("sk-notauri-test");
  });

  it("空字符串 Key 不被存储（saveApiKey 入口拦截）", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await saveApiKey("custom", "");
    // 空 Key 被入口拦截，不触发加密落盘，localStorage 无对应条目
    const stored = localStorage.getItem("llm-key-custom");
    expect(stored).toBeNull();
    // 空白字符串同样被拦截
    await saveApiKey("custom", "   ");
    expect(localStorage.getItem("llm-key-custom")).toBeNull();
    // loadApiKey 返回 null
    mockInvoke.mockResolvedValue(null);
    const loaded = await loadApiKey("custom");
    expect(loaded).toBeNull();
  });
});
