/**
 * RAG 工具函数单元测试（P6-R4 RAG 对话窗口）
 *
 * 测试矩阵：
 *   1. RAG_SYSTEM_PROMPT —— 提示词内容完整性
 *   2. buildRagContext —— 检索结果拼接
 *      - 空数组 / 单页 / 多页 / body 截断 / 特殊字符
 *   3. renderContent —— 安全 HTML 渲染
 *      - 纯文本换行 / XSS 转义 / 引用链接 / 代码块 / 行内代码 / 加粗
 *      - 组合场景 / 引用路径去空格 / 事件委托 data-citation 属性
 *
 * 环境：node（无 jsdom），纯逻辑测试，与项目现有测试约定一致。
 */

import { describe, it, expect } from "vitest";
import {
  RAG_SYSTEM_PROMPT,
  buildRagContext,
  renderContent,
  type RagPage,
} from "@/lib/ragUtils";

// ---------------------------------------------------------------------------
// 1. RAG_SYSTEM_PROMPT
// ---------------------------------------------------------------------------

describe("P6-R4 RAG_SYSTEM_PROMPT 提示词", () => {
  it("包含引用格式指令 [[页面路径]]", () => {
    expect(RAG_SYSTEM_PROMPT).toContain("[[页面路径]]");
    expect(RAG_SYSTEM_PROMPT).toContain("[[wiki/coding/async-patterns]]");
  });

  it("包含不编造约束", () => {
    expect(RAG_SYSTEM_PROMPT).toContain("不要编造");
  });

  it("包含资料不足时的兜底指令", () => {
    expect(RAG_SYSTEM_PROMPT).toContain("暂无法完整回答");
  });

  it("要求中文回答", () => {
    expect(RAG_SYSTEM_PROMPT).toContain("中文");
  });

  it("保留代码与公式格式", () => {
    expect(RAG_SYSTEM_PROMPT).toContain("代码");
    expect(RAG_SYSTEM_PROMPT).toContain("公式");
  });

  it("长度合理（80-500 字符，足够约束又不过度消耗 token）", () => {
    expect(RAG_SYSTEM_PROMPT.length).toBeGreaterThan(80);
    expect(RAG_SYSTEM_PROMPT.length).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// 2. buildRagContext
// ---------------------------------------------------------------------------

describe("P6-R4 buildRagContext 检索结果拼接", () => {
  it("空数组返回空字符串", () => {
    expect(buildRagContext([])).toBe("");
  });

  it("单页：格式为「### 参考资料 1：{title}\n路径: {path}\n\n{body}」", () => {
    const pages: RagPage[] = [
      {
        path: "wiki/coding/async-patterns",
        title: "异步模式",
        body: "asyncio 是 Python 的异步编程库。",
      },
    ];
    const result = buildRagContext(pages);
    expect(result).toContain("### 参考资料 1：异步模式");
    expect(result).toContain("路径: wiki/coding/async-patterns");
    expect(result).toContain("asyncio 是 Python 的异步编程库。");
  });

  it("多页：以「\\n\\n---\\n\\n」分隔", () => {
    const pages: RagPage[] = [
      { path: "wiki/coding/a", title: "A", body: "body-a" },
      { path: "wiki/coding/b", title: "B", body: "body-b" },
    ];
    const result = buildRagContext(pages);
    expect(result).toContain("### 参考资料 1：A");
    expect(result).toContain("### 参考资料 2：B");
    expect(result).toContain("\n\n---\n\n");
    // 编号正确递增
    expect(result.indexOf("参考资料 1")).toBeLessThan(result.indexOf("参考资料 2"));
  });

  it("body 超过 3000 字符时截断", () => {
    const longBody = "x".repeat(5000);
    const pages: RagPage[] = [
      { path: "wiki/test", title: "T", body: longBody },
    ];
    const result = buildRagContext(pages);
    // 截断到 3000 字符
    const expectedBody = "x".repeat(3000);
    expect(result).toContain(expectedBody);
    // 不应包含第 3001 个字符之后的 x 序列（4000 个连续 x 不应出现）
    expect(result).not.toContain("x".repeat(3001));
  });

  it("body 恰好 3000 字符时不截断", () => {
    const body = "y".repeat(3000);
    const pages: RagPage[] = [
      { path: "wiki/test", title: "T", body },
    ];
    const result = buildRagContext(pages);
    expect(result).toContain("y".repeat(3000));
  });

  it("标题和路径中的特殊字符原样保留（不转义，context 是给 LLM 的纯文本）", () => {
    const pages: RagPage[] = [
      {
        path: "wiki/coding/async-patterns",
        title: "异步 <模式> & 并发",
        body: "body",
      },
    ];
    const result = buildRagContext(pages);
    // context 是纯文本给 LLM，不应 HTML 转义
    expect(result).toContain("异步 <模式> & 并发");
    expect(result).not.toContain("&lt;");
    expect(result).not.toContain("&amp;");
  });

  it("三个页面编号分别为 1/2/3", () => {
    const pages: RagPage[] = [
      { path: "p1", title: "T1", body: "b1" },
      { path: "p2", title: "T2", body: "b2" },
      { path: "p3", title: "T3", body: "b3" },
    ];
    const result = buildRagContext(pages);
    expect(result).toMatch(/参考资料 1：T1/);
    expect(result).toMatch(/参考资料 2：T2/);
    expect(result).toMatch(/参考资料 3：T3/);
  });
});

// ---------------------------------------------------------------------------
// 3. renderContent
// ---------------------------------------------------------------------------

describe("P6-R4 renderContent 安全 HTML 渲染", () => {
  // --- 3.1 纯文本与换行 ---

  it("纯文本原样输出", () => {
    const result = renderContent("hello world");
    expect(result).toBe("hello world");
  });

  it("换行符转为 <br>", () => {
    const result = renderContent("line1\nline2");
    expect(result).toContain("<br>");
    expect(result).not.toContain("\n");
  });

  it("空字符串返回空字符串", () => {
    expect(renderContent("")).toBe("");
  });

  // --- 3.2 XSS 防御（关键安全测试） ---

  it("转义 <script> 标签", () => {
    const result = renderContent("<script>alert(1)</script>");
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("转义 HTML 特殊字符 & < > \" ' /", () => {
    const result = renderContent('<img src=x onerror="alert(1)">');
    expect(result).not.toContain("<img");
    expect(result).toContain("&lt;img");
    expect(result).toContain("&quot;");
  });

  it("转义单引号防 SQL/JS 注入", () => {
    const result = renderContent("it's a 'test'");
    expect(result).toContain("&#x27;");
    expect(result).not.toContain("'test'");
  });

  it("转义斜杠防御 </script> 注入", () => {
    const result = renderContent("</script>");
    expect(result).toContain("&#x2F;");
    expect(result).not.toContain("</script>");
  });

  it("XSS payload 不产生可执行 HTML", () => {
    const payloads = [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "<svg/onload=alert(1)>",
      "javascript:alert(1)",
    ];
    for (const payload of payloads) {
      const result = renderContent(payload);
      // 渲染结果中不应包含原始的 < 标签开头（已转义）
      expect(result).not.toMatch(/<(script|img|svg)\b/i);
    }
  });

  // --- 3.3 引用链接 [[wiki/xxx/page]] ---

  it("将 [[wiki/coding/async-patterns]] 转为可点击链接", () => {
    const result = renderContent("参见 [[wiki/coding/async-patterns]] 了解更多");
    expect(result).toContain('<a href="#"');
    // 注意：escapeHtml 先于引用替换执行，路径中的 / 被转义为 &#x2F;
    // 这是正确的安全行为——浏览器 getAttribute 会自动解码实体还原为 /
    expect(result).toContain('data-citation="wiki&#x2F;coding&#x2F;async-patterns"');
    expect(result).toContain("wiki&#x2F;coding&#x2F;async-patterns</a>");
  });

  it("引用路径两端空格被 trim", () => {
    const result = renderContent("[[  wiki/coding/x  ]]");
    // trim 后的路径（/ 被转义为 &#x2F;）
    expect(result).toContain('data-citation="wiki&#x2F;coding&#x2F;x"');
    // 不应包含带空格的 data-citation
    expect(result).not.toContain('data-citation="  wiki');
  });

  it("多个引用链接都被转换", () => {
    const result = renderContent(
      "[[wiki/a]] 和 [[wiki/b]] 都是相关页面",
    );
    expect(result).toContain('data-citation="wiki&#x2F;a"');
    expect(result).toContain('data-citation="wiki&#x2F;b"');
  });

  it("引用链接使用 class=\"citation-link\"", () => {
    const result = renderContent("[[wiki/x]]");
    expect(result).toContain('class="citation-link"');
  });

  it("单个方括号 [text] 不被转换为链接", () => {
    const result = renderContent("[普通文本]");
    expect(result).not.toContain("data-citation");
    expect(result).not.toContain("<a ");
  });

  // --- 3.4 代码块 ---

  it("```代码块转为 <pre><code>", () => {
    const result = renderContent("```\ncode here\n```");
    expect(result).toContain('<pre class="code-block">');
    expect(result).toContain("<code>");
    expect(result).toContain("code here");
  });

  it("带语言标识的代码块", () => {
    const result = renderContent("```python\nprint('hi')\n```");
    expect(result).toContain('<pre class="code-block">');
    // 代码内容已被 escapeHtml 转义：' → &#x27;（浏览器渲染时还原为 '）
    expect(result).toContain("print(&#x27;hi&#x27;)");
  });

  it("代码块内的 HTML 特殊字符被转义（先 escape 再匹配代码块）", () => {
    const result = renderContent("```\n<div>x</div>\n```");
    expect(result).not.toContain("<div>x</div>");
    expect(result).toContain("&lt;div&gt;");
  });

  // --- 3.5 行内代码 ---

  it("行内代码 `code` 转为 <code>", () => {
    const result = renderContent("使用 `npm test` 运行测试");
    expect(result).toContain('<code class="inline-code">npm test</code>');
  });

  it("多个行内代码都被转换", () => {
    const result = renderContent("`a` 和 `b`");
    expect(result).toContain('<code class="inline-code">a</code>');
    expect(result).toContain('<code class="inline-code">b</code>');
  });

  // --- 3.6 加粗 ---

  it("**text** 转为 <strong>", () => {
    const result = renderContent("这是 **加粗** 文本");
    expect(result).toContain("<strong>加粗</strong>");
  });

  it("单个 * 不被识别为加粗", () => {
    const result = renderContent("3 * 4 = 12");
    expect(result).not.toContain("<strong>");
  });

  // --- 3.7 组合场景 ---

  it("引用 + 代码块 + 加粗组合渲染", () => {
    const content = "参见 [[wiki/coding/x]]，关键代码：\n```python\nprint('hi')\n```\n**注意**：重要";
    const result = renderContent(content);
    // 路径 / 被转义为 &#x2F;，代码 ' 被转义为 &#x27;（安全行为）
    expect(result).toContain('data-citation="wiki&#x2F;coding&#x2F;x"');
    expect(result).toContain('<pre class="code-block">');
    expect(result).toContain("<strong>注意</strong>");
  });

  it("中文内容正确渲染", () => {
    const result = renderContent("这是中文回答，参见 [[wiki/coding/异步模式]]");
    // 路径 / 被转义为 &#x2F;（浏览器 getAttribute 解码还原）
    expect(result).toContain('data-citation="wiki&#x2F;coding&#x2F;异步模式"');
    expect(result).toContain("这是中文回答");
  });

  it("渲染结果是单行（换行已转 <br>，无 \\n）", () => {
    const result = renderContent("line1\nline2\nline3");
    expect(result).not.toContain("\n");
    expect(result).toContain("<br>");
  });

  // --- 3.8 边界情况 ---

  it("仅有换行符的字符串", () => {
    const result = renderContent("\n\n\n");
    expect(result).toBe("<br><br><br>");
  });

  it("未闭合的 [[ 不被转换", () => {
    const result = renderContent("[[wiki/unclosed");
    expect(result).not.toContain("data-citation");
    expect(result).not.toContain("<a ");
  });

  it("未闭合的代码块 ``` 不被转换", () => {
    const result = renderContent("```\nunclosed code");
    // 未匹配的 ``` 不产生 <pre>，但反引号本身已被 escapeHtml 处理（反引号不在转义表内，原样保留）
    expect(result).not.toContain('<pre class="code-block">');
  });
});
