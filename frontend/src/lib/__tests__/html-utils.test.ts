/**
 * escapeHtml 单元测试
 *
 * 验收标准 AC-4.1：覆盖以下场景：
 *   - 空字符串
 *   - null/undefined
 *   - 数值输入
 *   - 6 个特殊字符单独转义
 *   - 组合注入载荷（<script>alert('xss')</script>）
 *   - 双重编码场景（&amp; → &amp;amp;）
 *   - 正常文本不转义
 *
 * 同时覆盖 AC-1.1 / AC-1.2 / AC-1.3 / AC-1.6 的纯函数层面验证。
 */
import { describe, it, expect } from "vitest";
import { escapeHtml } from "../html-utils";

describe("escapeHtml", () => {
  // ---------------------------------------------------------------------------
  // AC-1.2: null / undefined 输入返回空字符串
  // ---------------------------------------------------------------------------
  describe("null / undefined 处理", () => {
    it("null 输入返回空字符串", () => {
      expect(escapeHtml(null)).toBe("");
    });

    it("undefined 输入返回空字符串", () => {
      expect(escapeHtml(undefined)).toBe("");
    });
  });

  // ---------------------------------------------------------------------------
  // AC-4.1: 空字符串
  // ---------------------------------------------------------------------------
  describe("空字符串", () => {
    it("空字符串输入返回空字符串", () => {
      expect(escapeHtml("")).toBe("");
    });
  });

  // ---------------------------------------------------------------------------
  // AC-1.3 / AC-4.1: 非字符串输入
  // ---------------------------------------------------------------------------
  describe("非字符串输入", () => {
    it("数值 123 转换为字符串 '123'", () => {
      expect(escapeHtml(123)).toBe("123");
    });

    it("数值 0 转换为字符串 '0'（不为空）", () => {
      expect(escapeHtml(0)).toBe("0");
    });

    it("负数 -42 转换为字符串 '-42'", () => {
      expect(escapeHtml(-42)).toBe("-42");
    });

    it("布尔 true 转换为字符串 'true'", () => {
      expect(escapeHtml(true)).toBe("true");
    });

    it("布尔 false 转换为字符串 'false'", () => {
      expect(escapeHtml(false)).toBe("false");
    });

    it("浮点数 3.14 转换为字符串 '3.14'", () => {
      expect(escapeHtml(3.14)).toBe("3.14");
    });

    it("NaN 转换为字符串 'NaN'", () => {
      expect(escapeHtml(NaN)).toBe("NaN");
    });
  });

  // ---------------------------------------------------------------------------
  // AC-1.1 / AC-4.1: 6 个特殊字符单独转义
  // ---------------------------------------------------------------------------
  describe("6 个特殊字符单独转义", () => {
    it("& 转义为 &amp;", () => {
      expect(escapeHtml("&")).toBe("&amp;");
    });

    it("< 转义为 &lt;", () => {
      expect(escapeHtml("<")).toBe("&lt;");
    });

    it("> 转义为 &gt;", () => {
      expect(escapeHtml(">")).toBe("&gt;");
    });

    it('" 转义为 &quot;', () => {
      expect(escapeHtml('"')).toBe("&quot;");
    });

    it("' 转义为 &#x27;", () => {
      expect(escapeHtml("'")).toBe("&#x27;");
    });

    it("/ 转义为 &#x2F;", () => {
      expect(escapeHtml("/")).toBe("&#x2F;");
    });

    it("所有 6 个特殊字符各自独立转义（拼接测试）", () => {
      expect(escapeHtml('&<>"\'/')).toBe("&amp;&lt;&gt;&quot;&#x27;&#x2F;");
    });
  });

  // ---------------------------------------------------------------------------
  // AC-1.6 / AC-4.1: 组合注入载荷
  // ---------------------------------------------------------------------------
  describe("组合注入载荷", () => {
    it("<script>alert('xss')</script> 被完整转义", () => {
      const payload = "<script>alert('xss')</script>";
      const expected = "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;";
      expect(escapeHtml(payload)).toBe(expected);
    });

    it("<img src=x onerror=alert(1)> 被完整转义", () => {
      const payload = '<img src=x onerror=alert(1)>';
      const expected = "&lt;img src=x onerror=alert(1)&gt;";
      expect(escapeHtml(payload)).toBe(expected);
    });

    it("javascript:alert(1) 不被改变（无特殊字符需转义）", () => {
      // 该载荷本身不含 6 个特殊字符，转义后保持不变。
      // 但实际 XSS 防御依赖于属性上下文的引号转义（已转义 " 和 '）。
      const payload = "javascript:alert(1)";
      expect(escapeHtml(payload)).toBe("javascript:alert(1)");
    });

    it('"><script>alert(1)</script> 载荷被转义', () => {
      const payload = '"><script>alert(1)</script>';
      const expected = "&quot;&gt;&lt;script&gt;alert(1)&lt;&#x2F;script&gt;";
      expect(escapeHtml(payload)).toBe(expected);
    });

    it("';--<script>alert(1)</script> SQL/XSS 混合载荷被转义", () => {
      const payload = "';--<script>alert(1)</script>";
      const expected = "&#x27;;--&lt;script&gt;alert(1)&lt;&#x2F;script&gt;";
      expect(escapeHtml(payload)).toBe(expected);
    });

    it("<svg/onload=alert(1)> HTML5 载荷被转义", () => {
      const payload = "<svg/onload=alert(1)>";
      const expected = "&lt;svg&#x2F;onload=alert(1)&gt;";
      expect(escapeHtml(payload)).toBe(expected);
    });

    it("<iframe src=javascript:alert(1)> 被转义", () => {
      const payload = "<iframe src=javascript:alert(1)>";
      const expected = "&lt;iframe src=javascript:alert(1)&gt;";
      expect(escapeHtml(payload)).toBe(expected);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-4.1: 双重编码场景
  // ---------------------------------------------------------------------------
  describe("双重编码场景（已是实体的输入）", () => {
    it("&amp; 被转义为 &amp;amp;（& 被转义）", () => {
      // 这是预期行为：escapeHtml 不做反向解析，&amp; 中的 & 也会被转义。
      // 攻击者无法通过预编码绕过：&amp; 不会先解码再重新编码。
      expect(escapeHtml("&amp;")).toBe("&amp;amp;");
    });

    it("&lt; 被转义为 &amp;lt;", () => {
      expect(escapeHtml("&lt;")).toBe("&amp;lt;");
    });

    it("&gt; 被转义为 &amp;gt;", () => {
      expect(escapeHtml("&gt;")).toBe("&amp;gt;");
    });

    it("&#x27; 被转义为 &amp;#x27;", () => {
      expect(escapeHtml("&#x27;")).toBe("&amp;#x27;");
    });

    it("&quot; 被转义为 &amp;quot;", () => {
      expect(escapeHtml("&quot;")).toBe("&amp;quot;");
    });

    it("&#x2F; 被转义为 &amp;#x2F;", () => {
      expect(escapeHtml("&#x2F;")).toBe("&amp;#x2F;");
    });
  });

  // ---------------------------------------------------------------------------
  // AC-4.1: 正常文本不转义
  // ---------------------------------------------------------------------------
  describe("正常文本不转义", () => {
    it("纯英文文本保持不变", () => {
      expect(escapeHtml("hello world")).toBe("hello world");
    });

    it("中文文本保持不变", () => {
      expect(escapeHtml("你好，世界")).toBe("你好，世界");
    });

    it("包含空格、数字、字母的混合文本保持不变", () => {
      expect(escapeHtml("abc 123 XYZ 中文")).toBe("abc 123 XYZ 中文");
    });

    it("包含常见标点（非 HTML 特殊字符）保持不变", () => {
      // ! @ # $ % ^ * ( ) - _ = + [ ] { } | \\ : ; , . ? ~ ` 等
      expect(escapeHtml("!@#$%^*()-_=[]{}|\\:;,.?~`")).toBe("!@#$%^*()-_=[]{}|\\:;,.?~`");
    });

    it("emoji 保持不变", () => {
      expect(escapeHtml("🚀 ✨ 📚")).toBe("🚀 ✨ 📚");
    });

    it("混合换行符保持不变", () => {
      expect(escapeHtml("line1\nline2\ttabbed")).toBe("line1\nline2\ttabbed");
    });
  });

  // ---------------------------------------------------------------------------
  // AC-1.4 / AC-1.5: 模拟 nodeLabel 回调中的字段转义
  // ---------------------------------------------------------------------------
  describe("模拟 nodeLabel 字段转义（集成场景）", () => {
    it("恶意 title 字段被正确转义", () => {
      const title = "<script>alert('xss')</script>";
      const escaped = escapeHtml(title);
      expect(escaped).toBe("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;");
      // 关键断言：转义后不应包含原始 <script> 子串
      expect(escaped).not.toContain("<script>");
      expect(escaped).not.toContain("</script>");
    });

    it("数值字段 inDegree=42 被转义为字符串 '42'", () => {
      expect(escapeHtml(42)).toBe("42");
    });

    it("数值字段 outDegree=0 被转义为字符串 '0'", () => {
      expect(escapeHtml(0)).toBe("0");
    });

    it("domain 字段含特殊字符被转义", () => {
      // 假设恶意 domain
      const domain = 'coding"><img src=x onerror=alert(1)>';
      const escaped = escapeHtml(domain);
      expect(escaped).toBe("coding&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
      // 不应包含未转义的 <img 标签
      expect(escaped).not.toContain("<img");
    });

    it("type 字段含单引号被转义", () => {
      const type = "concept';";
      const escaped = escapeHtml(type);
      expect(escaped).toBe("concept&#x27;;");
    });

    it("完整 nodeLabel 拼接后的 HTML 不会被注入", () => {
      // 模拟 GraphView.tsx 中 nodeLabel 的拼接逻辑
      const node = {
        title: '<script>alert("xss")</script>',
        domain: 'coding"><script>',
        type: "concept'",
        inDegree: 5,
        outDegree: 2,
      };
      const title = escapeHtml(node.title);
      const domain = escapeHtml(node.domain);
      const type = escapeHtml(node.type);
      const inDeg = escapeHtml(node.inDegree);
      const outDeg = escapeHtml(node.outDegree);
      const html = `<div>${title}</div><div>${domain} · ${type} · inDeg=${inDeg} · outDeg=${outDeg}</div>`;

      // 验证拼接后的 HTML 不含可执行的 <script> 标签
      expect(html).not.toMatch(/<script>/);
      expect(html).not.toMatch(/<\/script>/);
      // 验证所有用户输入都已转义为实体
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&quot;xss&quot;");
    });
  });

  // ---------------------------------------------------------------------------
  // 边界情况补充
  // ---------------------------------------------------------------------------
  describe("边界情况", () => {
    it("对象输入转换为 [object Object]", () => {
      expect(escapeHtml({})).toBe("[object Object]");
    });

    it("数组输入转换为逗号分隔字符串", () => {
      expect(escapeHtml([1, 2, 3])).toBe("1,2,3");
    });

    it("数组输入含特殊字符被转义", () => {
      expect(escapeHtml(["<", ">"])).toBe("&lt;,&gt;");
    });

    it("Infinity 转换为 'Infinity'", () => {
      expect(escapeHtml(Infinity)).toBe("Infinity");
    });

    it("重复字符 & 被全部转义", () => {
      expect(escapeHtml("&&&")).toBe("&amp;&amp;&amp;");
    });

    it("长字符串性能无 ReDoS（5000 字符）", () => {
      const long = "<".repeat(5000);
      const expected = "&lt;".repeat(5000);
      expect(escapeHtml(long)).toBe(expected);
    });
  });
});
