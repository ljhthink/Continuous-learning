/**
 * LLM 设置共享状态（P5, ADR-013）
 *
 * 将 LLM 模式和厂商选择从 SettingsPanel 局部 useState 提取为全局 store，
 * 使 FileList（staging 整理按钮）和其他组件可以共享 LLM 配置。
 *
 * 持久化策略：
 *   - llmMode / cloudProvider → localStorage（用户偏好，非敏感）
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
}

interface LlmState extends LlmSettings {
  setLlmMode: (mode: LlmMode) => void;
  setCloudProvider: (provider: CloudProvider) => void;
}

/** 从 localStorage 加载已保存的 LLM 设置。 */
function loadSettings(): LlmSettings {
  const defaults: LlmSettings = {
    llmMode: "disabled",
    cloudProvider: "deepseek",
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<LlmSettings>;
    return {
      llmMode: parsed.llmMode ?? defaults.llmMode,
      cloudProvider: parsed.cloudProvider ?? defaults.cloudProvider,
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

  setLlmMode: (mode) => {
    set({ llmMode: mode });
    saveSettings({ llmMode: mode, cloudProvider: get().cloudProvider });
  },

  setCloudProvider: (provider) => {
    set({ cloudProvider: provider });
    saveSettings({ llmMode: get().llmMode, cloudProvider: provider });
  },
}));
