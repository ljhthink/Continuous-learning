/**
 * SettingsPanel — 配置面板（Modal）
 *
 * P4 计划 §4.4.8：主题切换 / LLM 模式 / API Key / MCP server 状态。
 * 4c：接入 callMcpTool("kb_health") 显示 KB 健康状态 + getKbConfig() 显示路径。
 *
 * LLM 集成策略由 ADR-013 决定（cloud-first / local-first / disabled 三态）。
 * 当前仅为 UI 占位，API Key 不持久化（4c 后续迭代接入 tauri-plugin-store）。
 */

import { useState, useEffect } from "react";
import { useViewStore } from "@/store/viewStore";
import type { Theme } from "@/types";
import { callMcpTool, getKbConfig, isTauri } from "@/lib/ipc";
import type { KbConfigIPC } from "@/lib/ipc";

type LlmMode = "cloud-first" | "local-first" | "disabled";

interface KbHealth {
  total_pages?: number;
  status?: string;
  last_ingest?: string;
  last_lint?: string;
  index_up_to_date?: boolean;
}

export function SettingsPanel() {
  const { settingsOpen, setSettingsOpen, theme, setTheme } = useViewStore();
  const [llmMode, setLlmMode] = useState<LlmMode>("cloud-first");
  const [apiKey, setApiKey] = useState("");
  const [kbConfig, setKbConfig] = useState<KbConfigIPC | null>(null);
  const [kbHealth, setKbHealth] = useState<KbHealth | null>(null);
  const [mcpRestarting, setMcpRestarting] = useState(false);
  const tauriEnv = isTauri();

  // 加载 KB 配置和健康状态
  useEffect(() => {
    if (!settingsOpen || !tauriEnv) return;
    getKbConfig()
      .then(setKbConfig)
      .catch((err) => console.warn("[SettingsPanel] getKbConfig failed:", err));
    callMcpTool("kb_health")
      .then((result) => {
        if (result.success && result.data) {
          setKbHealth(result.data as KbHealth);
        }
      })
      .catch((err) => console.warn("[SettingsPanel] kb_health failed:", err));
  }, [settingsOpen, tauriEnv]);

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
    // 重新加载健康状态
    if (tauriEnv) {
      callMcpTool("kb_health")
        .then((result) => {
          if (result.success && result.data) {
            setKbHealth(result.data as KbHealth);
          }
        })
        .finally(() => setMcpRestarting(false));
    } else {
      setTimeout(() => setMcpRestarting(false), 1500);
    }
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

          {/* LLM 模式（ADR-013） */}
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

          {/* KB 路径 */}
          {kbConfig && (
            <SettingRow label="KB Root" icon="folder">
              <div
                className="px-2 py-1 text-[11px] font-mono bg-elevated border border-border-subtle rounded-md text-text-secondary truncate"
                title={kbConfig.kb_root}
              >
                {kbConfig.kb_root}
              </div>
            </SettingRow>
          )}

          {/* MCP server 状态 */}
          <SettingRow label="MCP Server" icon="dns">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{
                    background: kbHealth?.status === "ok"
                      ? "var(--accent-secondary)"
                      : "var(--text-muted)",
                  }}
                />
                {kbHealth ? `${kbHealth.total_pages ?? 0} 页` : "运行中"}
              </span>
              <button
                type="button"
                onClick={handleMcpRestart}
                disabled={mcpRestarting}
                className="px-2 py-1 text-xs bg-elevated text-text-secondary rounded-md hover:bg-hover transition-colors disabled:opacity-50"
              >
                {mcpRestarting ? "刷新中..." : "刷新状态"}
              </button>
            </div>
          </SettingRow>

          {/* KB 健康详情 */}
          {kbHealth && (kbHealth.last_ingest || kbHealth.last_lint) && (
            <div className="text-[10px] font-mono text-text-muted space-y-0.5 pl-2 border-l border-border-subtle">
              {kbHealth.last_ingest && (
                <div>最近 ingest: {kbHealth.last_ingest}</div>
              )}
              {kbHealth.last_lint && (
                <div>最近 lint: {kbHealth.last_lint}</div>
              )}
              {kbHealth.index_up_to_date !== undefined && (
                <div>索引状态: {kbHealth.index_up_to_date ? "✅ 已同步" : "⚠️ 需更新"}</div>
              )}
            </div>
          )}
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
