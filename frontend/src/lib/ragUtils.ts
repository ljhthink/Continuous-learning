/**
 * RAG 对话工具函数（P6-R4，决策计划 §4.4）
 *
 * 从 ChatPanel.tsx 抽取的纯函数，便于在 node 环境（无 jsdom）下单元测试。
 *
 * 职责：
 *   - RAG_SYSTEM_PROMPT：指导 LLM 根据参考资料回答并引用来源
 *   - buildRagContext：将检索结果拼接为 LLM context
 *   - renderContent：将 LLM 回答渲染为安全 HTML（含引用链接、代码块、XSS 防御）
 *
 * 安全约束：
 *   - renderContent 必须先调用 escapeHtml 防御存储型 XSS（webview XSS 在 Tauri 下可致 RCE）
 *   - 引用链接通过 data-citation 属性 + 事件委托处理，不使用 href="javascript:"
 */

import { escapeHtml } from "@/lib/html-utils";

/**
 * RAG 系统提示词：指导 LLM 根据参考资料回答并引用来源。
 *
 * 约束 LLM：
 *   1. 回答基于参考资料，不编造
 *   2. 引用格式 [[页面路径]]
 *   3. 资料不足时明确说明
 *   4. 中文回答
 *   5. 保留代码/公式原始格式
 */
export const RAG_SYSTEM_PROMPT = `你是知识库助手。请根据以下参考资料回答用户的问题。

要求：
1. 回答必须基于提供的参考资料，不要编造未在资料中出现的信息
2. 在回答中引用来源，格式为 [[页面路径]]（如 [[wiki/coding/async-patterns]]）
3. 若参考资料不足以回答问题，明确说明"根据知识库现有资料，暂无法完整回答该问题"
4. 回答简洁准确，使用中文
5. 如有代码或公式，保留原始格式`;

/** RAG 检索结果项（与 kb_get_page 返回数据对齐） */
export interface RagPage {
  /** 页面相对路径（如 wiki/coding/async-patterns） */
  path: string;
  /** 页面标题 */
  title: string;
  /** 页面正文（完整 body） */
  body: string;
}

/** 单页 body 截取上限（控制 token 消耗，决策计划 §4.4） */
const BODY_PREVIEW_MAX_CHARS = 3000;

/**
 * 构造 RAG context（从检索结果拼接）。
 *
 * 格式：
 *   ### 参考资料 1：{title}
 *   路径: {path}
 *
 *   {body 前 3000 字符}
 *
 *   ---
 *
 *   ### 参考资料 2：...
 *
 * @param pages 检索到的相关页面（已取完整 body）
 * @returns 拼接后的 context 字符串；空数组返回空字符串
 */
export function buildRagContext(pages: RagPage[]): string {
  return pages
    .map((p, i) => {
      // 截取 body 前 3000 字符（控制 token 消耗）
      const bodyPreview = p.body.slice(0, BODY_PREVIEW_MAX_CHARS);
      return `### 参考资料 ${i + 1}：${p.title}\n路径: ${p.path}\n\n${bodyPreview}`;
    })
    .join("\n\n---\n\n");
}

/**
 * 渲染消息内容为安全 HTML。
 *
 * 处理顺序（顺序关键，不可调换）：
 *   1. escapeHtml —— 先转义所有 HTML 特殊字符，防御 XSS
 *   2. [[wiki/xxx/page]] → 可点击引用链接（data-citation 属性，事件委托处理）
 *      注意：escapeHtml 不转义方括号，[[ ]] 仍为原文，可被正则匹配
 *   3. ```lang\ncode``` → <pre><code> 代码块
 *   4. `code` → <code> 行内代码
 *   5. **text** → <strong> 加粗
 *   6. \n → <br> 换行
 *
 * @param content LLM 生成的原始回答（可能含 markdown 语法）
 * @returns 安全 HTML 字符串，可直接通过 dangerouslySetInnerHTML 渲染
 */
export function renderContent(content: string): string {
  let html = escapeHtml(content);

  // 将 [[wiki/xxx/page]] 转为可点击链接
  // 注意：escapeHtml 后方括号不变，[[ ]] 仍为原文
  html = html.replace(
    /\[\[([^\]]+)\]\]/g,
    (_, path: string) => {
      const trimmed = path.trim();
      return `<a href="#" data-citation="${trimmed}" class="citation-link">${trimmed}</a>`;
    },
  );

  // 基础 markdown：代码块 ```
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, _lang, code) =>
      `<pre class="code-block"><code>${code}</code></pre>`,
  );

  // 行内代码 `code`
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 加粗 **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 换行
  html = html.replace(/\n/g, "<br>");

  return html;
}
