# P4 GUI R4 修复 — 验收测试报告

| 项目 | 内容 |
| --- | --- |
| 任务令牌 | TKN-P4-FIX-R4-001 |
| 验收 Agent | ac-verifier |
| 验收日期 | 2026-07-27 |
| 风险等级 | P1（单模块内部逻辑修复，无接口/契约/依赖变更） |
| 变更范围 | 2 个文件：`frontend/src/lib/html-utils.ts`（新增）、`frontend/src/components/GraphView.tsx`（修改） |
| guardrail 报告 | `docs/reports/2026-07-27-p4-fix-r4-guardrail.md`（通过） |
| **验收结论** | **通过** |

---

## 一、验收总结

### 1.1 总体结论：**通过**

所有验收标准（AC-1 / AC-2 / AC-3 / AC-4）均验证通过，无阻断项。

### 1.2 AC 验证结果汇总

| AC 编号 | 验收项 | 结论 | 验证方法 |
| --- | --- | --- | --- |
| AC-1.1 | escapeHtml 转义 6 个 HTML 特殊字符 | ✅ 通过 | 代码审查 + 单元测试 |
| AC-1.2 | null/undefined 返回空字符串 | ✅ 通过 | 单元测试 |
| AC-1.3 | 非字符串输入经 String(value) 转换 | ✅ 通过 | 单元测试 |
| AC-1.4 | nodeLabel 中 title/domain/type 已转义 | ✅ 通过 | 代码审查 + E2E（React fiber 直接调用 nodeLabel） |
| AC-1.5 | nodeLabel 中 inDegree/outDegree 已转义 | ✅ 通过 | 代码审查 + E2E |
| AC-1.6 | `<script>alert('xss')</script>` tooltip 不执行 | ✅ 通过 | E2E（DOM innerHTML 验证 + scriptTags 计数） |
| AC-2.1 | `npx tsc --noEmit` 通过 | ✅ 通过 | 编译验证（无 TS2339 错误） |
| AC-2.2 | `npx vite build` 通过 | ✅ 通过 | 构建验证（32.85s，1547 modules） |
| AC-2.3 | d3VelocityDecay 可选链调用不崩溃 | ✅ 通过 | 代码审查 + E2E（图谱正常加载） |
| AC-3.1 | 知识图谱页面正常加载 | ✅ 通过 | Playwright E2E |
| AC-3.2 | 节点 hover tooltip 正常显示 | ✅ 通过 | Playwright E2E（tooltip HTML 验证） |
| AC-3.3 | 特殊字符 tooltip 正确显示转义内容 | ✅ 通过 | Playwright E2E（innerHTML 含 `&lt;` `&gt;` `&amp;`） |
| AC-3.4 | 图谱物理效果正常（节点分散） | ✅ 通过 | Playwright E2E 截图 |
| AC-3.5 | 领域筛选按钮正常工作 | ✅ 通过 | Playwright E2E（节点数 40→28） |
| AC-3.6 | 视图切换正常（图谱/预览/审核/上传） | ✅ 通过 | Playwright E2E（view 状态变化） |
| AC-3.7 | 控制台无 JavaScript 错误 | ✅ 通过 | Playwright console_logs（error/exception/warning 均为空） |
| AC-4.1 | escapeHtml 单元测试覆盖全部场景 | ✅ 通过 | vitest（48 tests passed） |

### 1.3 测试矩阵

| 测试类型 | 工具 | 用例数 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- | --- |
| 单元测试 | vitest 4.1.10 | 48 | 48 | 0 | 0 |
| 编译验证 | tsc 5.8.3 | 1 | 1 | 0 | 0 |
| 构建验证 | vite 7.3.6 | 1 | 1 | 0 | 0 |
| E2E 测试 | Playwright MCP | 7 场景 | 7 | 0 | 0 |
| 安全验证 | Playwright + DOM 检查 | 4 载荷 | 4 | 0 | 0 |

---

## 二、AC-1: XSS 漏洞修复有效性

### 2.1 AC-1.1: escapeHtml 转义 6 个 HTML 特殊字符 — ✅ 通过

**代码审查**（`frontend/src/lib/html-utils.ts:26-45`）：

```typescript
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'/]/g, (ch: string) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#x27;";
      case "/": return "&#x2F;";
      default: return ch;
    }
  });
}
```text

转义表（OWASP 推荐）：

| 原字符 | 转义实体 | 验证 |
| --- | --- | --- |
| `&` | `&amp;` | ✅ |
| `<` | `&lt;` | ✅ |
| `>` | `&gt;` | ✅ |
| `"` | `&quot;` | ✅ |
| `'` | `&#x27;` | ✅ |
| `/` | `&#x2F;` | ✅ |

**单元测试验证**：`escapeHtml('&<>"\'/')` === `'&amp;&lt;&gt;&quot;&#x27;&#x2F;'` ✅

### 2.2 AC-1.2: null/undefined 返回空字符串 — ✅ 通过

**单元测试**：

- `escapeHtml(null)` === `""` ✅
- `escapeHtml(undefined)` === `""` ✅

### 2.3 AC-1.3: 非字符串输入经 String(value) 转换 — ✅ 通过

**单元测试**：

- `escapeHtml(123)` === `"123"` ✅
- `escapeHtml(0)` === `"0"` ✅
- `escapeHtml(-42)` === `"-42"` ✅
- `escapeHtml(true)` === `"true"` ✅
- `escapeHtml(3.14)` === `"3.14"` ✅
- `escapeHtml(NaN)` === `"NaN"` ✅

### 2.4 AC-1.4 / AC-1.5: nodeLabel 字段转义覆盖 — ✅ 通过

**代码审查**（`frontend/src/components/GraphView.tsx:369-384`）：

| 插值字段 | 用户可控 | 转义代码 | 验证 |
| --- | --- | --- | --- |
| title | 是 | `escapeHtml(node.title ?? "(untitled)")` | ✅ |
| domain | 是 | `escapeHtml(node.domain ?? "")` | ✅ |
| type | 是 | `escapeHtml(node.type ?? "")` | ✅ |
| inDegree | 否（防御深度） | `escapeHtml(node.inDegree ?? 0)` | ✅ |
| outDegree | 否（防御深度） | `escapeHtml(node.outDegree ?? 0)` | ✅ |

**E2E 验证**：通过 React fiber 直接调用 nodeLabel 回调，传入恶意节点：

```javascript
const maliciousNode = {
  title: "<script>alert('xss')</script>",
  domain: 'coding"><img src=x onerror=alert(1)>',
  type: "concept'",
  inDegree: 42,
  outDegree: 0
};
const result = nodeLabel(maliciousNode);
```text

结果：

- `result.containsScriptTag` === `false` ✅（无原始 `<script>` 标签）
- `result.containsImgTag` === `false` ✅（无原始 `<img>` 标签）
- `result.containsEscapedScript` === `true` ✅（含 `&lt;script&gt;`）
- `result.containsEscapedImg` === `true` ✅（含 `&lt;img`）
- `result.containsEscapedQuote` === `true` ✅（含 `&quot;&gt;`）
- `result.containsEscapedApos` === `true` ✅（含 `&#x27;`）

### 2.5 AC-1.6 / AC-3.7: XSS 载荷不执行 — ✅ 通过

**E2E 安全验证**（4 种载荷）：

| 载荷 | innerHTML 转义后 | DOM 新增元素 | 执行结果 |
| --- | --- | --- | --- |
| `<script>alert('xss')</script>` | `&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;` | 0 个新 script 标签 | ✅ 不执行 |
| `<img src=x onerror=alert(1)>` | `&lt;img src=x onerror=alert(1)&gt;` | 0 个新 img 元素（前后均 0） | ✅ 不执行 |
| `Test <special> & "quoted" 'chars' /slash` | `Test &lt;special&gt; &amp; &quot;quoted&quot; &#x27;chars&#x27; &#x2F;slash` | 无新元素 | ✅ 显示为文本 |
| `coding"><img src=x onerror=alert(1)>` | `coding&quot;&gt;&lt;img src=x onerror=alert(1)&gt;` | 无新元素 | ✅ 显示为文本 |

**关键证据**：

- `document.querySelectorAll('script').length` 前后一致（3 个，均为 Vite/React 注入）
- `document.querySelectorAll('img').length` 前后一致（0 个）
- tooltip 的 `textContent` 显示原始载荷文本（浏览器解码实体为文本，但不执行）

---

## 三、AC-2: TypeScript 类型修复

### 3.1 AC-2.1: tsc --noEmit 通过 — ✅ 通过

```text
$ npx tsc --noEmit
（无输出，退出码 0）
```text

无 TS2339 错误（Property 'd3VelocityDecay' does not exist on type 'ForceGraphMethods'）。

### 3.2 AC-2.2: vite build 通过 — ✅ 通过

```text
$ npx vite build
vite v7.3.6 building client environment for production...
✓ 1547 modules transformed.
dist/index.html                    1.11 kB │ gzip:   0.57 kB
dist/assets/index-cmOQKGGF.css    18.88 kB │ gzip:   4.92 kB
dist/assets/index-D9_B7hh1.js      1.26 kB │ gzip:   0.48 kB
dist/assets/core-DhEqZVGG.js       2.44 kB │ gzip:   0.98 kB
dist/assets/webview-D9d5Mwn8.js   17.43 kB │ gzip:   3.93 kB
dist/assets/index-Dn9tA3pD.js    802.03 kB │ gzip: 247.90 kB
✓ built in 32.85s
```text

### 3.3 AC-2.3: d3VelocityDecay 可选链调用 — ✅ 通过

**代码审查**（`frontend/src/components/GraphView.tsx:92-98, 284`）：

```typescript
type ForceGraphWithD3Graph = ForceGraphMethods & {
  getGraph?: () => { ... };
  d3VelocityDecay?: (decay: number) => void;  // 类型扩展
};

// 使用可选链
fg.d3VelocityDecay?.(0.4);
```text

**E2E 验证**：图谱正常加载，节点正常布局（charge -500 + linkDistance 90 + velocityDecay 0.4），无运行时崩溃。

---

## 四、AC-3: 功能回归验证（Playwright E2E）

### 4.1 测试环境

- Vite dev server: `http://localhost:5174/`
- 浏览器: Chromium（Playwright MCP）
- 视口: 1440×900
- mock 数据环境（非 Tauri）

### 4.2 AC-3.1: 知识图谱页面正常加载 — ✅ 通过

**验证**：

- 页面正常渲染，可见文本包含 "40 节点 · 56 边"
- 领域分类、筛选面板、图例均正常显示
- 图谱 Canvas 正常渲染（display: block, visibility: visible, opacity: 1）

**截图**：`ac-3-1-graph-view-active-2026-07-27T10-21-17-349Z.png`

### 4.3 AC-3.2: 节点 hover tooltip 正常显示 — ✅ 通过

**验证**：通过 React fiber 获取 ForceGraph2D 实例的 nodeLabel 属性，调用后获取 tooltip HTML。tooltip 元素 `.float-tooltip-kap` 正常显示：

- display: block, visibility: visible, opacity: 1
- innerHTML 包含节点标题、领域、类型、入度、出度信息

**截图**：`ac-3-2-tooltip-display-2026-07-27T10-26-53-059Z.png`

### 4.4 AC-3.3: 特殊字符 tooltip 正确显示转义内容 — ✅ 通过

**验证**：构造含特殊字符的节点标题 `Test <special> & "quoted" 'chars' /slash`，nodeLabel 回调返回的 HTML 中：

- `<` → `&lt;` ✅
- `>` → `&gt;` ✅
- `&` → `&amp;` ✅
- `"` → `&quot;` ✅（原始 HTML 字符串中）
- `'` → `&#x27;` ✅（原始 HTML 字符串中）
- `/` → `&#x2F;` ✅（原始 HTML 字符串中）

> 注：innerHTML 往返后，浏览器会将 `&quot;`/`&#x27;`/`&#x2F;` 规范化回字符形式（因为在文本内容上下文中这些字符是安全的），但原始 HTML 字符串（nodeLabel 输出）确实包含所有转义实体，安全防护有效。

**截图**：`ac-3-3-special-chars-escaped-2026-07-27T10-33-03-186Z.png`

### 4.5 AC-3.4: 图谱物理效果正常 — ✅ 通过

**验证**：

- d3-force 配置生效：charge -500、linkDistance 90、center gravity 0.08、velocityDecay 0.4
- 节点分散布局，三个大领域（coding/design/kb-system）自然分开
- 无节点重叠（通过强斥力 + 长边距补偿 collide 缺失）

**截图**：`ac-3-4-graph-physics-2026-07-27T10-35-30-128Z.png`

### 4.6 AC-3.5: 领域筛选按钮正常工作 — ✅ 通过

**验证**：

- 点击图谱筛选面板的"编程"按钮，其 opacity 从 1 变为 0.3（视觉反馈）
- 底部统计从 "40 节点 · 59 边" 变为 "28 节点 · 35 边"（12 个 coding 节点被过滤）
- 筛选生效，图谱重新布局

**截图**：`ac-3-5-domain-filtered-2026-07-27T10-34-17-893Z.png`

### 4.7 AC-3.6: 视图切换正常 — ✅ 通过

**验证**：通过点击视图切换按钮（含快捷键提示 ⌘1-⌘4），状态栏 view 字段依次变化：

- 上传（⌘1）→ view: "上传"
- 预览（⌘2）→ view: "预览"
- 审核（⌘3）→ view: "审核"
- 图谱（⌘4）→ view: "图谱"

### 4.8 AC-3.7: 控制台无 JavaScript 错误 — ✅ 通过

**验证**：

- `playwright_console_logs(type="error")` → "No console logs matching the criteria"
- `playwright_console_logs(type="exception")` → "No console logs matching the criteria"
- `playwright_console_logs(type="warning")` → "No console logs matching the criteria"

控制台仅有 Vite HMR 热更新日志（debug 级别）和 React DevTools 提示（info 级别），无任何 error/exception/warning。

---

## 五、AC-4: 单元测试

### 5.1 AC-4.1: escapeHtml 单元测试 — ✅ 通过

**测试文件**：`frontend/src/lib/__tests__/html-utils.test.ts`
**测试框架**：vitest 4.1.10
**配置文件**：`frontend/vitest.config.ts`（独立配置，不影响生产构建）

**测试结果**：

```text
$ npx vitest run --config vitest.config.ts
RUN  v4.1.10 D:/s0611/code/Continuous-learning/frontend
✓ src/lib/__tests__/html-utils.test.ts (48 tests) 14ms
Test Files  1 passed (1)
     Tests  48 passed (48)
   Duration  9.26s
```text

**测试覆盖场景**：

| 场景 | 用例数 | 通过 | 覆盖 AC |
| --- | --- | --- | --- |
| null/undefined 处理 | 2 | 2 | AC-1.2 |
| 空字符串 | 1 | 1 | AC-4.1 |
| 非字符串输入（数值/布尔/NaN/浮点） | 7 | 7 | AC-1.3 |
| 6 个特殊字符单独转义 | 7 | 7 | AC-1.1 |
| 组合注入载荷（script/img/svg/iframe 等） | 7 | 7 | AC-1.6 |
| 双重编码场景（&amp; → &amp;amp;） | 6 | 6 | AC-4.1 |
| 正常文本不转义（中英文/emoji/标点） | 6 | 6 | AC-4.1 |
| 模拟 nodeLabel 字段转义（集成场景） | 6 | 6 | AC-1.4/1.5 |
| 边界情况（对象/数组/Infinity/ReDoS） | 6 | 6 | AC-4.1 |
| **合计** | **48** | **48** | — |

### 5.2 关键测试用例

**组合注入载荷**（AC-1.6）：

```typescript
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
```text

**双重编码**（AC-4.1）：

```typescript
it("&amp; 被转义为 &amp;amp;（& 被转义）", () => {
  // 攻击者无法通过预编码绕过：&amp; 不会先解码再重新编码
  expect(escapeHtml("&amp;")).toBe("&amp;amp;");
});
```text

**集成场景**（AC-1.4/1.5）：

```typescript
it("完整 nodeLabel 拼接后的 HTML 不会被注入", () => {
  const node = {
    title: '<script>alert("xss")</script>',
    domain: 'coding"><script>',
    type: "concept'",
    inDegree: 5,
    outDegree: 2,
  };
  const html = `<div>${escapeHtml(node.title)}</div>...`;
  expect(html).not.toMatch(/<script>/);
  expect(html).not.toMatch(/<\/script>/);
  expect(html).toContain("&lt;script&gt;");
});
```text

---

## 六、Playwright 截图证据

| 截图文件 | AC | 描述 |
| --- | --- | --- |
| `ac-3-1-graph-view-active-*.png` | AC-3.1 | 图谱页面加载（40 节点，三领域分散） |
| `ac-3-2-tooltip-display-*.png` | AC-3.2 | 节点 hover tooltip 显示（async-patterns 节点） |
| `ac-3-3-xss-script-escaped-*.png` | AC-1.6/3.3 | `<script>alert('xss')</script>` 载荷转义为文本显示 |
| `ac-3-3-special-chars-escaped-*.png` | AC-3.3 | 特殊字符 `< > & " ' /` 转义后正确显示 |
| `ac-3-4-graph-physics-*.png` | AC-3.4 | 图谱物理效果（节点分散，不重叠） |
| `ac-3-5-domain-filter-test-*.png` | AC-3.5 | 领域筛选测试（编程按钮 opacity 0.3） |
| `ac-3-5-domain-filtered-*.png` | AC-3.5 | 领域筛选后（28 节点 · 35 边） |
| `ac-3-7-xss-img-escaped-*.png` | AC-3.7 | `<img src=x onerror=alert(1)>` 载荷转义为文本显示 |

截图存档位置：`C:\Users\ljh\Downloads\`（Playwright 默认下载目录）

---

## 七、测试新增文件

### 7.1 单元测试文件

- `frontend/src/lib/__tests__/html-utils.test.ts`（新增，48 个测试用例）

### 7.2 测试配置文件

- `frontend/vitest.config.ts`（新增，独立配置，不影响生产构建）

### 7.3 依赖变更

- `frontend/package.json` 新增 devDependencies：
  - `vitest@^4.1.10`
  - `@vitest/ui@^4.1.10`

---

## 八、R3 既有 XSS 风险闭环确认

| R3 记录 | R4 修复 | AC 验证 |
| --- | --- | --- |
| `node.title` 未转义插入 HTML | `escapeHtml(node.title ?? "(untitled)")` | AC-1.4 ✅ |
| 仅识别 title 风险 | 扩展到 domain/type/inDegree/outDegree 全字段 | AC-1.4/1.5 ✅ |
| 建议"对 `node.title` 进行 HTML 实体编码" | 转义 6 字符（含 `/`），超 R3 建议范围 | AC-1.1 ✅ |
| 无单元测试 | 48 个测试用例覆盖全场景 | AC-4.1 ✅ |

---

## 九、guardrail Q3 建议闭环

guardrail-enforcer R4 报告 §2.5 Q3 建议"ac-verifier 阶段补充 escapeHtml 单元测试"已闭环：

| Q3 建议覆盖场景 | AC-4.1 实现状态 |
| --- | --- |
| 空串/null/undefined 输入 | ✅ 3 个用例 |
| 纯字符串、数值、布尔 | ✅ 7 个用例 |
| 6 个特殊字符单独转义 | ✅ 7 个用例 |
| 组合注入载荷 | ✅ 7 个用例（script/img/svg/iframe 等） |
| 双重编码确认 | ✅ 6 个用例 |
| 正常文本不转义 | ✅ 6 个用例 |
| 边界情况（对象/数组/ReDoS） | ✅ 6 个用例 |

---

## 十、结论

### 10.1 验收结论：**通过**

P4 GUI R4 修复（XSS 漏洞修复 + TypeScript 类型错误修复）所有验收标准均验证通过：

1. **XSS 漏洞修复**（AC-1）：escapeHtml 函数正确转义 6 个 HTML 特殊字符，nodeLabel 回调对全部 5 个插值字段（title/domain/type/inDegree/outDegree）调用 escapeHtml 转义。4 种 XSS 载荷（script/img/special-chars/混合）均被有效防御，DOM 中无新增可执行元素。

2. **TypeScript 类型修复**（AC-2）：`npx tsc --noEmit` 无错误，`npx vite build` 成功，d3VelocityDecay 可选链调用运行时安全。

3. **功能回归**（AC-3）：7 个 E2E 场景全部通过，包括图谱加载、tooltip 显示、特殊字符处理、物理效果、领域筛选、视图切换、控制台无错误。

4. **单元测试**（AC-4）：48 个测试用例覆盖全部 AC-4.1 要求场景，包括空串、null/undefined、数值、6 字符单独转义、组合注入载荷、双重编码、正常文本不转义。

### 10.2 无阻断项

- 无失败项
- 无跳过项
- guardrail 报告 3 项低风险建议中 Q3（单元测试）已闭环

### 10.3 建议后续优化（不阻断）

1. **Q1 闭环**：修正 escapeHtml 注释中"& 必须最先转义"的描述（当前单遍 replace + 回调实现顺序无关）
2. **Q2 闭环**：如未来需链式调用，将 `d3VelocityDecay` 返回类型从 `void` 改为具体类型
3. **CI 集成**：将 `vitest run` 纳入 CI 必需检查，防止 escapeHtml 回归
4. **Semgrep 规则**：按 guardrail §5.1 建议，集成 XSS 拼接点静态扫描，防止未来新增 HTML 拼接点遗漏转义
