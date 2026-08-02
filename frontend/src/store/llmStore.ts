/**
 * LLM 设置共享状态（P5, ADR-013）
 *
 * 将 LLM 模式和厂商选择从 SettingsPanel 局部 useState 提取为全局 store，
 * 使 FileList（staging 整理按钮）和其他组件可以共享 LLM 配置。
 *
 * 持久化策略：
 *   - llmMode / cloudProvider / customBaseUrl → localStorage（用户偏好，非敏感）
 *   - apiKey → 操作系统密钥环（经 llm.ts 的 saveApiKey/loadApiKey，不进 store）
 *
 * 默认值（ADR-013 V2）：llmMode="disabled"（开箱即用不依赖外部服务）
 */

import { create } from "zustand";
import type { LlmMode, CloudProvider } from "@/lib/llm";

const STORAGE_KEY = "llm-settings";

interface LlmSettings {
  llmMode: LlmMode;
  cloudProvider: CloudProvider;
  /** 自定义 API base URL（覆盖 PROVIDERS 默认值，空字符串表示用默认） */
  customBaseUrl: string;
  /** 自定义模型名（覆盖 PROVIDERS 默认值，空字符串表示用默认，P5-R2 问题 2） */
  customModelName: string;
  /** P6-R1 成本控制：单次调用输出 token 上限（null=不限，决策计划 §4.1.4） */
  maxTokens: number | null;
  /** P6-R1 成本控制：日累计 token 上限告警阈值（null=不限，超限软提示） */
  dailyTokenLimit: number | null;
}

interface LlmState extends LlmSettings {
  setLlmMode: (mode: LlmMode) => void;
  setCloudProvider: (provider: CloudProvider) => void;
  setCustomBaseUrl: (url: string) => void;
  setCustomModelName: (model: string) => void;
  setMaxTokens: (max: number | null) => void;
  setDailyTokenLimit: (limit: number | null) => void;
  /** 持久化当前完整状态到 localStorage（内部辅助） */
  _persist: () => void;
}

/** 从 localStorage 加载已保存的 LLM 设置。 */
function loadSettings(): LlmSettings {
  const defaults: LlmSettings = {
    llmMode: "disabled",
    cloudProvider: "custom", // P5-R3 问题 3: 默认 custom，移除预设
    customBaseUrl: "",
    customModelName: "",
    maxTokens: null, // P6-R1: 默认不限（与 P5-R4 移除 max_tokens 的决策一致）
    dailyTokenLimit: null,
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<LlmSettings>;
    // P5-R3: 旧版 cloudProvider 可能是 deepseek/glm/kimi，统一迁移为 custom
    const migratedProvider = parsed.cloudProvider && parsed.cloudProvider !== "custom"
      ? "custom"
      : (parsed.cloudProvider ?? defaults.cloudProvider);
    return {
      llmMode: parsed.llmMode ?? defaults.llmMode,
      cloudProvider: migratedProvider as CloudProvider,
      customBaseUrl: parsed.customBaseUrl ?? defaults.customBaseUrl,
      customModelName: parsed.customModelName ?? defaults.customModelName,
      maxTokens: typeof parsed.maxTokens === "number" ? parsed.maxTokens : defaults.maxTokens,
      dailyTokenLimit: typeof parsed.dailyTokenLimit === "number" ? parsed.dailyTokenLimit : defaults.dailyTokenLimit,
    };
  } catch {
    return defaults;
  }
}

/** 保存 LLM 设置到 localStorage。 */
function saveSettings(settings: LlmSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage 不可用时静默降级（仅内存）
  }
}

const initial = loadSettings();

export const useLlmStore = create<LlmState>((set, get) => ({
  llmMode: initial.llmMode,
  cloudProvider: initial.cloudProvider,
  customBaseUrl: initial.customBaseUrl,
  customModelName: initial.customModelName,
  maxTokens: initial.maxTokens,
  dailyTokenLimit: initial.dailyTokenLimit,

  // 持久化辅助：保存当前完整状态到 localStorage
  _persist: () => {
    const s = get();
    saveSettings({
      llmMode: s.llmMode,
      cloudProvider: s.cloudProvider,
      customBaseUrl: s.customBaseUrl,
      customModelName: s.customModelName,
      maxTokens: s.maxTokens,
      dailyTokenLimit: s.dailyTokenLimit,
    });
  },

  setLlmMode: (mode) => {
    set({ llmMode: mode });
    get()._persist();
  },

  setCloudProvider: (provider) => {
    set({ cloudProvider: provider });
    get()._persist();
  },

  setCustomBaseUrl: (url) => {
    set({ customBaseUrl: url });
    get()._persist();
  },

  setCustomModelName: (model) => {
    set({ customModelName: model });
    get()._persist();
  },

  setMaxTokens: (max) => {
    set({ maxTokens: max });
    get()._persist();
  },

  setDailyTokenLimit: (limit) => {
    set({ dailyTokenLimit: limit });
    get()._persist();
  },
}));
