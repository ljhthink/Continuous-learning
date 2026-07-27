/**
 * HTML 实体编码工具
 *
 * 用于在 HTML 字符串拼接场景中防御存储型 XSS。
 * react-force-graph-2d 的 nodeLabel 回调内部使用 innerHTML 渲染 tooltip，
 * 因此任何插入 tooltip 的用户可控字段（如 wiki 页面标题）必须先经过 escapeHtml。
 *
 * 在 Tauri 环境下，webview XSS 可能通过 IPC 导致 RCE，所以这层防御尤为关键。
 */

/**
 * 将字符串中的 HTML 特殊字符转义为对应的 HTML 实体。
 *
 * 转义表（遵循 OWASP 推荐）：
 *   &  → &amp;   （必须最先转义，否则会二次转义其他实体）
 *   <  → &lt;
 *   >  → &gt;
 *   "  → &quot;
 *   '  → &#x27;  （HTML 实体 &#39; 也可，但 OWASP 推荐 &#x27;）
 *   /  → &#x2F;  （防御 </script> 注入，react-force-graph tooltip 非 script 上下文，
 *                  但保留以备复用于其他 HTML 拼接场景）
 *
 * @param value 原始值（可能是 string | undefined | null）
 * @returns 转义后的字符串；输入为 null/undefined 时返回空字符串
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'/]/g, (ch: string) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#x27;";
      case "/":
        return "&#x2F;";
      default:
        return ch;
    }
  });
}
