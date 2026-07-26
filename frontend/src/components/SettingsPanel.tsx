/**
 * SettingsPanel — 配置面板（Modal）
 *
 * P4 计划 §4.4.8：主题切换 / LLM 模式 / API Key / MCP server 重启。
 * 4a 为静态 UI，4c 接入 tauri-plugin-store 加密存储。
 */

import { useState, useEffect } from "react";
import { useViewStore } from "@/store/viewStore";
import type { Theme } from "@/types";

type LlmMode = "cloud-first" | "local-first" | "disabled";

export function SettingsPanel() {
  const { settingsOpen, setSettingsOpen, theme, setTheme } = useViewStore();
  const [llmMode, setLlmMode] = useState<LlmMode>("cloud-first");
  const [apiKey, setApiKey] = useState("");
  const [mcpRestarting, setMcpRestarting] = useState(false);

  // Esc 关闭
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsOpen, setSettingsOpen]);

  if (!settingsOpen) return null;

  const handleMcpRestart = () => {
    setMcpRestarting(true);
    setTimeout(() => setMcpRestarting(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={() => setSettingsOpen(false)}
    >
      <div
        className="bg-surface border border-border-strong rounded-lg shadow-lg w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <h2 className="text-base font-semibold text-text-primary">设置</h2>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="flex items-center justify-center w-7 h-7 rounded-md text-text-secondary hover:bg-hover hover:text-text-primary transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-4 space-y-5">
          {/* 主题 */}
          <SettingRow label="主题" icon="palette">
            <div className="flex gap-1">
              {(["dark", "light"] as Theme[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`px-3 py-1 text-xs rounded-md transition-all ${
                    theme === t
                      ? "bg-active text-accent-primary border border-border-strong"
                      : "bg-elevated text-text-secondary hover:bg-hover border border-transparent"
                  }`}
                >
                  {t === "dark" ? "🌙 暗色" : "☀️ 亮色"}
                </button>
              ))}
            </div>
          </SettingRow>

          {/* LLM 模式 */}
          <SettingRow label="LLM 集成" icon="psychology">
            <select
              value={llmMode}
              onChange={(e) => setLlmMode(e.target.value as LlmMode)}
              className="px-2 py-1 text-xs bg-elevated border border-border-subtle rounded-md text-text-primary outline-none focus:border-accent-primary"
            >
              <option value="cloud-first">Cloud 优先（Claude/GPT）</option>
              <option value="local-first">本地优先（Ollama）</option>
              <option value="disabled">禁用 LLM</option>
            </select>
          </SettingRow>

          {/* API Key */}
          {llmMode !== "disabled" && (
            <SettingRow label="API Key" icon="key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-2 py-1 text-xs font-mono bg-elevated border border-border-subtle rounded-md text-text-primary outline-none focus:border-accent-primary placeholder:text-text-muted"
              />
            </SettingRow>
          )}

          {/* MCP server 状态 */}
          <SettingRow label="MCP Server" icon="dns">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: "var(--accent-secondary)" }}
                />
                运行中
              </span>
              <button
                type="button"
                onClick={handleMcpRestart}
                disabled={mcpRestarting}
                className="px-2 py-1 text-xs bg-elevated text-text-secondary rounded-md hover:bg-hover transition-colors disabled:opacity-50"
              >
                {mcpRestarting ? "重启中..." : "重启"}
              </button>
            </div>
          </SettingRow>
        </div>

        {/* 底部 */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="px-4 py-1.5 text-xs bg-accent-primary text-white rounded-md hover:opacity-90 transition-opacity"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-28 flex-shrink-0">
        <span className="material-symbols-outlined text-text-muted" style={{ fontSize: 16 }}>
          {icon}
        </span>
        <span className="text-xs text-text-secondary">{label}</span>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
