/**
 * 对话状态管理（P6-R4 RAG 对话窗口）
 *
 * 使用 Zustand 管理对话消息，使消息在视图切换（chat → preview → chat）时不丢失。
 * 对话状态纯内存（不持久化到 localStorage），应用重启后清空。
 *
 * 架构（决策计划 §4.4）：
 *   用户提问 → kb_search 检索 top-5 → kb_get_page 取 top-3 完整内容
 *   → 拼接 context → callLlmStream 流式生成回答 → 引用来源标注
 */

import { create } from "zustand";

/** 引用来源（RAG 检索到的相关页面） */
export interface ChatCitation {
  /** 页面相对路径（如 wiki/coding/async-patterns） */
  path: string;
  /** 页面标题 */
  title: string;
  /** 匹配片段（kb_search 返回的 snippet） */
  snippet: string;
  /** 检索得分（越高越相关） */
  score: number;
}

/** 对话消息 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 引用来源（仅 assistant 消息有） */
  citations?: ChatCitation[];
  /** token 用量（仅 assistant 消息有） */
  usage?: { total_tokens: number };
  /** 是否被截断（finish_reason=length） */
  truncated?: boolean;
  /** 错误信息（检索/生成失败时） */
  error?: string;
  /** 时间戳 */
  timestamp: number;
}

interface ChatState {
  messages: ChatMessage[];
  streaming: boolean;
  /** 生成唯一消息 ID */
  genId: () => string;
  /** 添加用户消息 */
  addUserMessage: (content: string) => string;
  /** 添加 assistant 消息（占位，流式更新 content） */
  addAssistantMessage: (citations?: ChatCitation[]) => string;
  /** 更新最后一条 assistant 消息的 content（流式增量） */
  appendToLastAssistant: (token: string) => void;
  /** 完成最后一条 assistant 消息（设置 usage/truncated/error） */
  finalizeLastAssistant: (opts: {
    usage?: { total_tokens: number };
    truncated?: boolean;
    error?: string;
  }) => void;
  /** 清空对话 */
  clearMessages: () => void;
  /** 设置 streaming 状态 */
  setStreaming: (s: boolean) => void;
}

let idCounter = 0;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streaming: false,
  genId: () => `msg-${Date.now()}-${++idCounter}`,
  addUserMessage: (content) => {
    const id = get().genId();
    const msg: ChatMessage = {
      id,
      role: "user",
      content,
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, msg] }));
    return id;
  },
  addAssistantMessage: (citations) => {
    const id = get().genId();
    const msg: ChatMessage = {
      id,
      role: "assistant",
      content: "",
      citations,
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, msg] }));
    return id;
  },
  appendToLastAssistant: (token) => {
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + token };
      }
      return { messages: msgs };
    });
  },
  finalizeLastAssistant: (opts) => {
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = {
          ...last,
          usage: opts.usage,
          truncated: opts.truncated,
          error: opts.error,
        };
      }
      return { messages: msgs };
    });
  },
  clearMessages: () => set({ messages: [] }),
  setStreaming: (streaming) => set({ streaming }),
}));
