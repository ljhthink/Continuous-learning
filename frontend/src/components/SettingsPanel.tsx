/**
 * SettingsPanel — 配置面板（Modal）
 *
 * P4 计划 §4.4.8：主题切换 / LLM 模式 / API Key / MCP server 状态。
 * 4c：接入 callMcpTool("kb_health") 显示 KB 健康状态 + getKbConfig() 显示路径。
 *
 * LLM 集成策略由 ADR-013 决定（cloud-first / local-first / disabled 三态）。
 * P5-R2：模型名与 API 地址均可自定义，支持任意 OpenAI 兼容端点。
 * API Key 经操作系统密钥环加密持久化（ADR-013 V7，keyring crate）。
 */

import { useState, useEffect } from "react";
import { useViewStore } from "@/store/viewStore";
import { useLlmStore } from "@/store/llmStore";
import type { Theme } from "@/types";
import { callMcpTool, getKbConfig, isTauri } from "@/lib/ipc";
import type { KbConfigIPC } from "@/lib/ipc";
import { DomainManager } from "@/components/DomainManager";
import {
  testConnection,
  saveApiKey,
  loadApiKey,
  deleteApiKey,
} from "@/lib/llm";
import type { LlmMode, ConnectionTestResult } from "@/lib/llm";

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
  const { llmMode, cloudProvider, setLlmMode, customBaseUrl, setCustomBaseUrl, customModelName, setCustomModelName, maxTokens, setMaxTokens, dailyTokenLimit, setDailyTokenLimit } = useLlmStore();
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
  // P5-R2 fix: 无论测试成功或失败都保存 key（用户主动输入即应保存），
  // 避免"测试失败 → key 未保存 → LLM 整理时找不到 key"的连锁问题（考古报告问题 4 根因）。
  const handleTestConnection = async () => {
    setTestStatus("testing");
    setTestMessage("");
    const result: ConnectionTestResult = await testConnection(
      cloudProvider,
      apiKey,
      customBaseUrl,
      customModelName,
    );
    setTestStatus(result.ok ? "success" : "error");
    // 无论测试结果如何，都保存用户输入的 key（尊重用户意图，测试只验证不阻断保存）
    try {
      await saveApiKey(cloudProvider, apiKey);
      setKeySaved(true);
      setTestMessage(
        result.ok
          ? `${result.message}（已自动保存到系统密钥环）`
          : `${result.message}（Key 已保存，可稍后重试连接或检查模型名/网络）`,
      );
    } catch (err) {
      setTestMessage(
        `${result.message}（保存到密钥环失败：${err instanceof Error ? err.message : "未知错误"}）`,
      );
    }
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
            <div className="flex flex-col gap-1 w-full">
              <select
                value={llmMode}
                onChange={(e) => setLlmMode(e.target.value as LlmMode)}
                className="px-2 py-1 text-xs bg-elevated border border-border-subtle rounded-md text-text-primary outline-none focus:border-accent-primary"
              >
                <option value="disabled">禁用 LLM（默认）</option>
                <option value="cloud-first">Cloud 优先（OpenAI 兼容）</option>
                <option value="local-first">本地优先（Ollama）</option>
              </select>
              <div className="text-[10px] text-text-muted leading-relaxed">
                {llmMode === "disabled" && "LLM 已禁用。staging 页面需手工整理标题、标签和摘要。"}
                {llmMode === "cloud-first" && "启用后，staging 页面可一键调用大模型自动整理：生成标题、frontmatter、标签和摘要。需配置 API Key。"}
                {llmMode === "local-first" && "通过本地 Ollama 运行大模型整理 staging 页面，内容不出本机。需先安装 Ollama 并拉取模型。"}
              </div>
            </div>
          </SettingRow>

          {/* P5-R3 问题 3: 移除预设 provider 下拉，仅保留自定义配置 */}
          {/* Custom API URL（必填，OpenAI 兼容端点） */}
          {llmMode === "cloud-first" && (
            <SettingRow label="API 地址 *" icon="link">
              <input
                type="text"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                placeholder="https://api.deepseek.com/v1（OpenAI 兼容端点）"
                className="w-full px-2 py-1 text-xs font-mono bg-elevated border border-border-subtle rounded-md text-text-primary outline-none focus:border-accent-primary placeholder:text-text-muted"
              />
            </SettingRow>
          )}

          {/* Custom Model Name（必填，支持任意 OpenAI 兼容模型） */}
          {llmMode === "cloud-first" && (
            <SettingRow label="模型名 *" icon="memory">
              <input
                type="text"
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                placeholder="如 deepseek-chat / glm-5.2 / kimi-k3"
                className="w-full px-2 py-1 text-xs font-mono bg-elevated border border-border-subtle rounded-md text-text-primary outline-none focus:border-accent-primary placeholder:text-text-muted"
              />
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
                  placeholder="sk-...（你的 API Key）"
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

          {/* P6-R1 成本控制（决策计划 §4.1.4）：max_tokens 用户可选 + 日累计上限告警 */}
          {llmMode === "cloud-first" && (
            <SettingRow label="成本控制" icon="savings">
              <div className="flex flex-col gap-1 w-full">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={4294967295}
                    value={maxTokens ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      // H-2: 钳制到 [0, u32::MAX]，防止超出 Rust u32 反序列化范围
                      setMaxTokens(v === "" ? null : Math.max(0, Math.min(4294967295, Math.floor(Number(v) || 0))));
                    }}
                    placeholder="不限"
                    className="w-20 px-2 py-1 text-xs font-mono bg-elevated border border-border-subtle rounded-md text-text-primary outline-none focus:border-accent-primary placeholder:text-text-muted"
                  />
                  <span className="text-[10px] text-text-muted">单次输出 token 上限</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={4294967295}
                    value={dailyTokenLimit ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      // H-2: 钳制到 [0, u32::MAX]，防止超出 Rust u32 反序列化范围
                      setDailyTokenLimit(v === "" ? null : Math.max(0, Math.min(4294967295, Math.floor(Number(v) || 0))));
                    }}
                    placeholder="不限"
                    className="w-20 px-2 py-1 text-xs font-mono bg-elevated border border-border-subtle rounded-md text-text-primary outline-none focus:border-accent-primary placeholder:text-text-muted"
                  />
                  <span className="text-[10px] text-text-muted">日累计上限（超限提示）</span>
                </div>
                <div className="text-[10px] text-text-muted leading-relaxed">
                  留空=不限（默认，与 P5-R4 一致）。设上限可防大文件整理 token 消耗过高；达到日累计上限仅软提示，不硬中断。
                </div>
              </div>
            </SettingRow>
          )}

          {/* Cloud 模式隐私告知（ADR-013 V4/D5） */}
          {llmMode === "cloud-first" && (
            <div className="text-[10px] text-text-muted px-2 py-1.5 rounded-md border border-border-subtle bg-elevated">
              ☁️ Cloud 模式：staging 页面内容将发送到你配置的 API 进行整理。请确保不含敏感信息。
            </div>
          )}

          {/* Local 模式提示（P5：更新为 qwen3:7b） */}
          {llmMode === "local-first" && (
            <div className="text-[10px] text-text-muted px-2 py-1.5 rounded-md border border-border-subtle bg-elevated">
              🏠 本地模式：所有调用走 http://localhost:11434（Ollama），内容不出本机。需先 <code className="font-mono text-accent-primary">ollama pull qwen3:7b</code>
            </div>
          )}

          {/* P6-R5: 领域管理（新增/删除领域目录） */}
          <div className="pt-3 border-t border-border-subtle">
            <DomainManager />
          </div>

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
