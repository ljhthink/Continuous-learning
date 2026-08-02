/**
 * ChatPanel — RAG 对话窗口（P6-R4，决策计划 §4.4）
 *
 * 架构（前端编排，无需改 MCP server）：
 *   用户提问
 *     → callMcpTool("kb_search", {query, limit: 5})  检索 top-5 相关页
 *     → 对 top-3 结果 callMcpTool("kb_get_page", {path})  获取完整 body
 *     → 拼接 context（title + body 摘要）
 *     → callLlmStream 生成回答（流式渲染）
 *     → 回答中标注引用来源
 *
 * 引用渲染：回答中的 [[wiki/xxx/page]] 渲染为可点击链接，
 * 点击后切换到 preview 视图并加载该页面。
 *
 * 消息持久化：使用 chatStore（Zustand），跨视图切换不丢失。
 */

import { useCallback, useRef, useEffect, useState } from "react";
import { useChatStore, type ChatCitation } from "@/store/chatStore";
import { useViewStore } from "@/store/viewStore";
import { useLlmStore } from "@/store/llmStore";
import { callMcpTool, isTauri } from "@/lib/ipc";
import {
  callLlmStream,
  loadApiKey,
  type LlmUsage,
} from "@/lib/llm";
// P6-R4: 纯函数抽取到 lib/ragUtils.ts，便于在 node 环境单元测试（无 jsdom 依赖）
import {
  RAG_SYSTEM_PROMPT,
  buildRagContext,
  renderContent,
} from "@/lib/ragUtils";

export function ChatPanel() {
  const tauriEnv = isTauri();
  const {
    messages,
    streaming,
    addUserMessage,
    addAssistantMessage,
    appendToLastAssistant,
    finalizeLastAssistant,
    clearMessages,
    setStreaming,
  } = useChatStore();
  const { setCurrentPagePath, setView } = useViewStore();
  const { llmMode, cloudProvider, customBaseUrl, customModelName, maxTokens } = useLlmStore();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** 点击引用链接 → 切换到 preview 视图 */
  const handleCitationClick = useCallback(
    (path: string) => {
      // 确保路径以 .md 结尾（preview 需要完整路径）
      const fullPath = path.endsWith(".md") ? path : `${path}.md`;
      setCurrentPagePath(fullPath);
      setView("preview");
    },
    [setCurrentPagePath, setView],
  );

  /** RAG 对话主流程 */
  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || streaming) return;

    // 前置检查
    if (!tauriEnv) {
      setError("对话功能需要在 Tauri 桌面环境中使用");
      return;
    }
    if (llmMode === "disabled") {
      setError("请先在设置中启用 LLM 集成（⌘, 打开设置）");
      return;
    }
    if (llmMode === "local-first") {
      setError("本地模式暂不支持对话，请切换到 Cloud 模式");
      return;
    }

    setError(null);
    setInput("");

    // 1. 添加用户消息
    addUserMessage(question);
    setStreaming(true);

    try {
      const apiKey = await loadApiKey(cloudProvider);
      if (!apiKey) {
        addAssistantMessage();
        finalizeLastAssistant({
          error: `未找到 API Key，请先在设置中保存（确认已点击"保存"或"测试连接"按钮）`,
        });
        setStreaming(false);
        return;
      }

      // 2. RAG 检索：kb_search
      const searchResult = await callMcpTool("kb_search", {
        query: question,
        limit: 5,
      });

      let citations: ChatCitation[] = [];
      if (searchResult.success && searchResult.data) {
        const data = searchResult.data as { results?: Array<{ path: string; title: string; snippet: string; score: number }> };
        citations = (data.results ?? []).map((r) => ({
          path: r.path,
          title: r.title,
          snippet: r.snippet,
          score: r.score,
        }));
      }

      // 3. 获取 top-3 完整内容
      const topPaths = citations.slice(0, 3);
      const pageResults = await Promise.all(
        topPaths.map(async (c) => {
          const pageResult = await callMcpTool("kb_get_page", {
            page_path: c.path,
          });
          if (pageResult.success && pageResult.data) {
            const data = pageResult.data as { body?: string; title?: string };
            return {
              path: c.path,
              title: c.title,
              body: data.body ?? "",
            };
          }
          return { path: c.path, title: c.title, body: c.snippet };
        }),
      );

      // 4. 构造 context + prompt
      const context = buildRagContext(pageResults);
      const systemPrompt = context
        ? `${RAG_SYSTEM_PROMPT}\n\n参考资料：\n${context}`
        : `${RAG_SYSTEM_PROMPT}\n\n（注意：知识库中未检索到相关资料，请根据你的知识尝试回答，并说明这不是来自知识库的内容）`;

      // 5. 添加 assistant 占位消息（含 citations）
      addAssistantMessage(citations.length > 0 ? citations : undefined);

      // 6. 流式生成回答
      let usage: LlmUsage | undefined;
      let truncated = false;

      const result = await callLlmStream(
        {
          provider: cloudProvider,
          apiKey,
          prompt: question,
          systemPrompt,
          customBaseUrl,
          customModelName,
          maxTokens: maxTokens ?? undefined,
        },
        {
          onToken: (token) => appendToLastAssistant(token),
          onUsage: (u) => { usage = u; },
          onTruncated: () => { truncated = true; },
        },
      );

      // 7. 完成
      if (!result.success) {
        finalizeLastAssistant({
          error: result.error ?? "LLM 生成失败",
          usage: usage ? { total_tokens: usage.total_tokens } : undefined,
        });
      } else {
        finalizeLastAssistant({
          usage: usage ? { total_tokens: usage.total_tokens } : undefined,
          truncated,
        });
      }
    } catch (err) {
      addAssistantMessage();
      finalizeLastAssistant({
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setStreaming(false);
    }
  }, [
    input,
    streaming,
    tauriEnv,
    llmMode,
    cloudProvider,
    customBaseUrl,
    customModelName,
    maxTokens,
    addUserMessage,
    addAssistantMessage,
    appendToLastAssistant,
    finalizeLastAssistant,
    setStreaming,
  ]);

  /** 键盘快捷键：Enter 发送，Shift+Enter 换行 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="h-full flex flex-col bg-canvas">
      {/* 对话头部 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-subtle bg-surface">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-primary" style={{ fontSize: 20 }}>
            forum
          </span>
          <h2 className="text-sm font-semibold text-text-primary">知识库对话</h2>
          <span className="text-[10px] text-text-muted px-1.5 py-0.5 bg-elevated rounded-sm">
            RAG
          </span>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearMessages}
            disabled={streaming}
            className="text-xs text-text-muted hover:text-accent-danger transition-colors disabled:opacity-50"
            title="清空对话"
          >
            清空
          </button>
        )}
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <EmptyState disabled={llmMode === "disabled"} />
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onCitationClick={handleCitationClick}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="px-6 py-3 border-t border-border-subtle bg-surface">
        {error && (
          <div className="mb-2 text-xs text-accent-danger px-3 py-1.5 bg-accent-danger/10 rounded">
            {error}
          </div>
        )}
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              llmMode === "disabled"
                ? "请先在设置中启用 LLM…"
                : llmMode === "local-first"
                  ? "请切换到 Cloud 模式…"
                  : "输入问题，Enter 发送…"
            }
            disabled={streaming || llmMode === "disabled" || llmMode === "local-first"}
            className="flex-1 px-3 py-2 bg-elevated border border-border-subtle rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={streaming || !input.trim() || llmMode === "disabled" || llmMode === "local-first"}
            className="flex items-center justify-center w-10 h-10 bg-accent-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            title="发送 (Enter)"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              {streaming ? "progress_activity" : "send"}
            </span>
          </button>
        </div>
        <div className="text-[10px] text-text-muted text-center mt-1.5">
          回答基于知识库检索（kb_search + kb_get_page），引用来源可点击跳转
        </div>
      </div>
    </div>
  );
}

/** 空状态（欢迎信息） */
function EmptyState({ disabled }: { disabled: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
      <span
        className="material-symbols-outlined text-text-muted mb-4"
        style={{ fontSize: 56 }}
      >
        forum
      </span>
      <h3 className="text-lg font-semibold text-text-primary mb-2">
        知识库对话
      </h3>
      <p className="text-sm text-text-secondary mb-4">
        向知识库提问，LLM 会根据检索到的相关页面生成回答并引用来源。
      </p>
      {disabled ? (
        <div className="text-xs text-accent-warning px-3 py-1.5 bg-accent-warning/10 rounded">
          ⚠ LLM 未启用，请先在设置中配置（⌘,）
        </div>
      ) : (
        <div className="space-y-1.5 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>search</span>
            自动检索知识库中相关页面
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
            LLM 根据资料生成带引用的回答
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>link</span>
            点击引用可跳转到对应页面
          </div>
        </div>
      )}
    </div>
  );
}

/** 消息气泡 */
function MessageBubble({
  message,
  onCitationClick,
}: {
  message: import("@/store/chatStore").ChatMessage;
  onCitationClick: (path: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
          isUser
            ? "bg-accent-primary text-white"
            : "bg-surface border border-border-subtle text-text-primary"
        }`}
      >
        {/* 消息内容（流式渲染） */}
        {message.content ? (
          <div
            className="text-sm leading-relaxed prose-sm"
            onClick={isUser ? undefined : (e) => {
              // 事件委托：拦截 [data-citation] 链接点击
              const target = e.target as HTMLElement;
              const link = target.closest("[data-citation]") as HTMLElement | null;
              if (link) {
                e.preventDefault();
                const path = link.getAttribute("data-citation");
                if (path) onCitationClick(path);
              }
            }}
            dangerouslySetInnerHTML={{
              __html: renderContent(message.content),
            }}
          />
        ) : message.error ? (
          <div className="text-sm text-accent-danger">
            ⚠ {message.error}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>
              progress_activity
            </span>
            正在检索知识库并生成回答…
          </div>
        )}

        {/* 截断提示 */}
        {message.truncated && (
          <div className="mt-2 text-[11px] text-accent-warning">
            ⚠ 内容可能被截断（达到 token 上限）
          </div>
        )}

        {/* token 用量 */}
        {message.usage && (
          <div className={`mt-1.5 text-[10px] ${isUser ? "text-white/60" : "text-text-muted"}`}>
            {message.usage.total_tokens} tokens
          </div>
        )}

        {/* 引用来源 */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-border-subtle">
            <div className="text-[10px] text-text-muted mb-1.5">引用来源：</div>
            <div className="flex flex-wrap gap-1.5">
              {message.citations.map((c, i) => (
                <button
                  key={c.path}
                  type="button"
                  onClick={() => onCitationClick(c.path)}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-elevated border border-border-subtle rounded text-[11px] text-text-secondary hover:border-accent-primary hover:text-accent-primary transition-colors"
                  title={c.snippet}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>link</span>
                  <span className="truncate max-w-[200px]">{c.title}</span>
                  <span className="text-text-muted font-mono">#{i + 1}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// renderContent 已抽取到 lib/ragUtils.ts（P6-R4，便于单元测试）
