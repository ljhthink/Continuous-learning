/**
 * chatStore 单元测试（P6-R4 RAG 对话窗口）
 *
 * 测试矩阵：
 *   1. 初始状态（空消息、非流式）
 *   2. addUserMessage 添加用户消息
 *   3. addAssistantMessage 添加带 citations 的 assistant 消息
 *   4. appendToLastAssistant 流式增量追加 token
 *   5. finalizeLastAssistant 设置 usage/truncated/error
 *   6. clearMessages 清空对话
 *   7. setStreaming 切换流式状态
 *   8. 多条消息顺序与 ID 唯一性
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@/store/chatStore";
import type { ChatCitation } from "@/store/chatStore";

describe("P6-R4 chatStore 对话状态管理", () => {
  beforeEach(() => {
    // 每个测试前重置 store
    useChatStore.getState().clearMessages();
    useChatStore.getState().setStreaming(false);
  });

  it("初始状态：空消息列表、streaming=false", () => {
    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(0);
    expect(state.streaming).toBe(false);
  });

  it("addUserMessage 添加用户消息并返回 ID", () => {
    const id = useChatStore.getState().addUserMessage("什么是异步编程？");
    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("user");
    expect(state.messages[0].content).toBe("什么是异步编程？");
    expect(state.messages[0].id).toBe(id);
    expect(state.messages[0].timestamp).toBeGreaterThan(0);
  });

  it("addAssistantMessage 添加带 citations 的 assistant 消息", () => {
    const citations: ChatCitation[] = [
      { path: "wiki/coding/async-patterns", title: "异步模式", snippet: "...", score: 10 },
    ];
    const id = useChatStore.getState().addAssistantMessage(citations);
    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("assistant");
    expect(state.messages[0].content).toBe("");
    expect(state.messages[0].citations).toEqual(citations);
    expect(state.messages[0].id).toBe(id);
  });

  it("addAssistantMessage 不传 citations 时 citations 为 undefined", () => {
    useChatStore.getState().addAssistantMessage();
    const state = useChatStore.getState();
    expect(state.messages[0].citations).toBeUndefined();
  });

  it("appendToLastAssistant 流式追加 token 到最后一条 assistant 消息", () => {
    useChatStore.getState().addUserMessage("问题");
    useChatStore.getState().addAssistantMessage();

    useChatStore.getState().appendToLastAssistant("Hello");
    useChatStore.getState().appendToLastAssistant(" World");

    const state = useChatStore.getState();
    expect(state.messages[1].content).toBe("Hello World");
  });

  it("appendToLastAssistant 不影响 user 消息", () => {
    useChatStore.getState().addUserMessage("问题");
    useChatStore.getState().appendToLastAssistant("token");
    // 最后一条是 user 消息，应不受影响
    expect(useChatStore.getState().messages[0].content).toBe("问题");
  });

  it("finalizeLastAssistant 设置 usage 和 truncated", () => {
    useChatStore.getState().addAssistantMessage();
    useChatStore.getState().finalizeLastAssistant({
      usage: { total_tokens: 1234 },
      truncated: true,
    });
    const state = useChatStore.getState();
    expect(state.messages[0].usage).toEqual({ total_tokens: 1234 });
    expect(state.messages[0].truncated).toBe(true);
  });

  it("finalizeLastAssistant 设置 error", () => {
    useChatStore.getState().addAssistantMessage();
    useChatStore.getState().finalizeLastAssistant({
      error: "API Key 未配置",
    });
    const state = useChatStore.getState();
    expect(state.messages[0].error).toBe("API Key 未配置");
  });

  it("clearMessages 清空所有消息", () => {
    useChatStore.getState().addUserMessage("问题1");
    useChatStore.getState().addUserMessage("问题2");
    expect(useChatStore.getState().messages).toHaveLength(2);

    useChatStore.getState().clearMessages();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it("setStreaming 切换流式状态", () => {
    useChatStore.getState().setStreaming(true);
    expect(useChatStore.getState().streaming).toBe(true);
    useChatStore.getState().setStreaming(false);
    expect(useChatStore.getState().streaming).toBe(false);
  });

  it("多条消息保持顺序且 ID 唯一", () => {
    const id1 = useChatStore.getState().addUserMessage("问题1");
    const id2 = useChatStore.getState().addAssistantMessage();
    const id3 = useChatStore.getState().addUserMessage("问题2");

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(3);
    expect(state.messages[0].role).toBe("user");
    expect(state.messages[1].role).toBe("assistant");
    expect(state.messages[2].role).toBe("user");
    // ID 唯一
    const ids = new Set([id1, id2, id3]);
    expect(ids.size).toBe(3);
  });

  it("完整 RAG 对话流程模拟（add → stream → finalize）", () => {
    const store = useChatStore.getState;

    // 1. 用户提问
    store().addUserMessage("什么是快速排序？");
    store().setStreaming(true);

    // 2. 检索完成，添加 assistant 占位（带 citations）
    const citations: ChatCitation[] = [
      { path: "wiki/coding/quick-sort-impl-patterns", title: "快速排序实现模式", snippet: "分治法...", score: 15 },
    ];
    store().addAssistantMessage(citations);

    // 3. 流式追加 token
    store().appendToLastAssistant("快速排序");
    store().appendToLastAssistant("是一种");
    store().appendToLastAssistant("分治算法");

    // 4. 完成
    store().finalizeLastAssistant({ usage: { total_tokens: 500 } });
    store().setStreaming(false);

    // 验证
    const state = store();
    expect(state.messages).toHaveLength(2);
    expect(state.streaming).toBe(false);

    const userMsg = state.messages[0];
    expect(userMsg.role).toBe("user");
    expect(userMsg.content).toBe("什么是快速排序？");

    const aiMsg = state.messages[1];
    expect(aiMsg.role).toBe("assistant");
    expect(aiMsg.content).toBe("快速排序是一种分治算法");
    expect(aiMsg.citations).toHaveLength(1);
    expect(aiMsg.citations?.[0].path).toBe("wiki/coding/quick-sort-impl-patterns");
    expect(aiMsg.usage?.total_tokens).toBe(500);
  });
});
