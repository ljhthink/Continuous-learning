/**
 * SettingsPanel — 配置面板（Modal）
 *
 * P4 计划 §4.4.8：主题切换 / LLM 模式 / API Key / MCP server 状态。
 * 4c：接入 callMcpTool("kb_health") 显示 KB 健康状态 + getKbConfig() 显示路径。
 *
 * LLM 集成策略由 ADR-013 决定（cloud-first / local-first / disabled 三态）。
 * P5 已实际接入 LLM（ADR-013 V6-V8），适配中国三厂商最新旗舰：
 *   - DeepSeek V4（deepseek-v4-pro）
 *   - GLM-5.2（智谱 AI）
 *   - Kimi K3（月之暗面）
 * API Key 经操作系统密钥环加密持久化（ADR-013 V7，keyring crate）。
 */

import { useState, useEffect } from "react";
import { useViewStore } from "@/store/viewStore";
import { useLlmStore } from "@/store/llmStore";
import type { Theme } from "@/types";
import { callMcpTool, getKbConfig, isTauri } from "@/lib/ipc";
import type { KbConfigIPC } from "@/lib/ipc";
import {
  PROVIDERS,
  testConnection,
  saveApiKey,
  loadApiKey,
  deleteApiKey,
} from "@/lib/llm";
import type { CloudProvider, LlmMode, ConnectionTestResult } from "@/lib/llm";

interface KbHealth {
  total_pages?: number;
  status?: string;
  last_ingest?: string;
  last_lint?: string;
  index_up_to_date?: boolean;
}

export function SettingsPanel() {
  const { settingsOpen, setSettingsOpen, theme, setTheme } = useViewStore();
  // LLM 模式和厂商选择从全局 llmStore 读取（与 FileList 共享，P2.1.8）
  const { llmMode, cloudProvider, setLlmMode, setCloudProvider } = useLlmStore();
  const [apiKey, setApiKey] = useState("");
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [testMessage, setTestMessage] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
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

  // 切换厂商时从密钥环加载已保存的 API Key（ADR-013 V7）
  useEffect(() => {
    if (!tauriEnv || llmMode !== "cloud-first") return;
    setApiKey("");
    setKeySaved(false);
    setTestStatus("idle");
    loadApiKey(cloudProvider)
      .then((saved) => {
        if (saved) {
          setApiKey(saved);
          setKeySaved(true);
        }
      })
      .catch((err) => console.warn("[SettingsPanel] loadApiKey failed:", err));
  }, [cloudProvider, llmMode, tauriEnv]);

  // 真实测试连接（P5：调用 LLM API 发送简短 prompt 验证 Key 有效性）
  const handleTestConnection = async () => {
    setTestStatus("testing");
    setTestMessage("");
    const result: ConnectionTestResult = await testConnection(
      cloudProvider,
      apiKey,
    );
    setTestStatus(result.ok ? "success" : "error");
    setTestMessage(result.message);
  };

  // 保存 API Key 到操作系统密钥环（ADR-013 V7）
  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setSavingKey(true);
    try {
      await saveApiKey(cloudProvider, apiKey);
      setKeySaved(true);
    } catch (err) {
      setTestStatus("error");
      setTestMessage(
        err instanceof Error ? err.message : "保存 API Key 失败",
      );
    } finally {
      setSavingKey(false);
    }
  };

  // 清除已保存的 API Key
  const handleClearKey = async () => {
    await deleteApiKey(cloudProvider);
    setApiKey("");
    setKeySaved(false);
    setTestStatus("idle");
    setTestMessage("");
  };

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
              <option value="disabled">禁用 LLM（默认）</option>
              <option value="cloud-first">Cloud 优先（中国三厂商）</option>
              <option value="local-first">本地优先（Ollama）</option>
            </select>
          </SettingRow>

          {/* Cloud 模式：模型选择（中国三厂商，ADR-013 D6 P5 更新） */}
          {llmMode === "cloud-first" && (
            <SettingRow label="模型" icon="smart_toy">
              <select
                value={cloudProvider}
                onChange={(e) => setCloudProvider(e.target.value as CloudProvider)}
                className="px-2 py-1 text-xs bg-elevated border border-border-subtle rounded-md text-text-primary outline-none focus:border-accent-primary"
              >
                <option value="deepseek">DeepSeek V4（性价比高，1M 上下文）</option>
                <option value="glm">GLM-5.2（智谱，思考模式）</option>
                <option value="kimi">Kimi K3（月之暗面，2.8T 参数）</option>
              </select>
            </SettingRow>
          )}

          {/* API Key（cloud-first 模式，ADR-013 V7 keyring 持久化） */}
          {llmMode === "cloud-first" && (
            <SettingRow label="API Key" icon="key">
              <div className="flex flex-col gap-1 w-full">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setKeySaved(false);
                    setTestStatus("idle");
                  }}
                  placeholder={PROVIDERS[cloudProvider].keyPlaceholder}
                  className="w-full px-2 py-1 text-xs font-mono bg-elevated border border-border-subtle rounded-md text-text-primary outline-none focus:border-accent-primary placeholder:text-text-muted"
                />
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] text-text-muted">
                    {keySaved ? "🔒 已保存到系统密钥环" : "未保存"}
                  </span>
                  <div className="flex gap-1">
                    {/* 保存到密钥环按钮 */}
                    <button
                      type="button"
                      onClick={handleSaveKey}
                      disabled={savingKey || !apiKey.trim()}
                      className="text-[10px] px-2 py-0.5 rounded-sm bg-elevated text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                    >
                      {savingKey ? "保存中..." : "保存"}
                    </button>
                    {/* 清除按钮 */}
                    {keySaved && (
                      <button
                        type="button"
                        onClick={handleClearKey}
                        className="text-[10px] px-2 py-0.5 rounded-sm bg-elevated text-text-secondary hover:text-text-primary transition-colors"
                      >
                        清除
                      </button>
                    )}
                    {/* 测试连接按钮 */}
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testStatus === "testing" || !apiKey.trim()}
                      className="text-[10px] px-2 py-0.5 rounded-sm bg-elevated text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                    >
                      {testStatus === "testing" ? "测试中..." : "测试连接"}
                    </button>
                  </div>
                </div>
                {/* 测试结果反馈 */}
                {testStatus === "success" && (
                  <div className="text-[10px] text-accent-secondary px-1.5 py-1 bg-elevated rounded-sm">
                    ✅ {testMessage}
                  </div>
                )}
                {testStatus === "error" && (
                  <div className="text-[10px] text-accent-warning px-1.5 py-1 bg-elevated rounded-sm">
                    ❌ {testMessage}
                  </div>
                )}
              </div>
            </SettingRow>
          )}

          {/* Cloud 模式隐私告知（ADR-013 V4/D5） */}
          {llmMode === "cloud-first" && (
            <div className="text-[10px] text-text-muted px-2 py-1.5 rounded-md border border-border-subtle bg-elevated">
              ☁️ Cloud 模式：staging 页面内容将发送到 {PROVIDERS[cloudProvider].name} API 进行整理。请确保不含敏感信息。
            </div>
          )}

          {/* Local 模式提示（P5：更新为 qwen3:7b） */}
          {llmMode === "local-first" && (
            <div className="text-[10px] text-text-muted px-2 py-1.5 rounded-md border border-border-subtle bg-elevated">
              🏠 本地模式：所有调用走 http://localhost:11434（Ollama），内容不出本机。需先 <code className="font-mono text-accent-primary">ollama pull qwen3:7b</code>
            </div>
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
