# P4 GUI R3 修复 — 验收标准验证报告

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | ac-verifier（验收标准验证器） |
| 任务令牌 | TKN-P4-FIX-R3-002 |
| 验证日期 | 2026-07-27 |
| 测试方法论 | test-architect skill 分层测试金字塔 |
| 测试环境 | Vite dev server `http://localhost:1420`（浏览器 dev 模式，mock 数据，isTauri()=false） |
| 浏览器 | Chromium 1440×900 |
| 前置审查 | guardrail-enforcer 第二轮审查通过（docs/reports/2026-07-27-p4-fix-r3-guardrail.md） |

---

## 一、总结

| 维度 | 结论 |
| --- | --- |
| **总体结论** | **有条件通过** — 5 条 AC 中 4 条通过、1 条部分通过；发现 3 个缺陷（1 低危本次引入、1 低危本次引入、1 中危既有） |
| 验收标准覆盖 | 5/5 条 AC 全部验证，无遗漏 |
| 静态分析 | 通过（tsc --noEmit + vite build 1546 模块） |
| E2E 测试 | 11 个场景全部通过 |
| 安全审计 | 1 个既有 XSS 风险（不在本次变更范围，但需后续修复） |
| 回归测试 | 通过（4 视图功能正常，控制台无错误） |

### 关键发现

1. **AC-2 的 collide force 是死代码**：`fg.d3Force("collide")` 返回 null（force-graph 不创建默认 collide force），`if (collide)` 守卫跳过配置。但 charge(-400) 和 link(80) 已正确生效，足以防止严重重叠。
2. **AC-1 的 color-scheme 不完整**：仅添加了 `color-scheme: light`，暗色主题缺失 `color-scheme: dark`（运行时 computed value 为 "normal"）。
3. **nodeLabel 存储型 XSS**：`node.title` 未 HTML 转义直接拼入 tooltip HTML 字符串，经 float-tooltip `.html()` 渲染为 innerHTML。既有问题，非本次引入。

---

## 二、验收标准覆盖矩阵

| AC ID | 验收标准 | 测试用例 ID | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| AC-1 | IDE 警告修复：charset/viewport meta、globals.css、compiler option | TC-101 ~ TC-106 | **部分通过** | index.html ✓、tsconfig ✓、color-scheme: dark 缺失 ✗ |
| AC-2 | 知识图谱节点不再严重混叠 | TC-201 ~ TC-204 | **通过**（含缺陷备注） | charge=-400 ✓、link=80 ✓、center=0.08 ✓、collide 死代码 ✗、bbox 2135×2255 |
| AC-3 | 左上角领域分类按钮点击有效 | TC-301 ~ TC-304 | **通过** | 编程过滤→12节点+横幅、清除→37节点、知识库系统过滤→横幅 |
| AC-4 | 右侧领域分布不显示后端不存在的学术/生活领域 | TC-401 ~ TC-403 | **通过** | GraphStats 从 graphData.nodes 计算、dataSource 徽章、mock 模式 8 领域 |
| AC-5 | 进入审核/预览界面不再卡顿几秒 | TC-501 ~ TC-504 | **通过** | 切换 58.5ms/30.6ms、Canvas 同一节点、过滤跨视图保留 |

---

## 三、测试用例设计文档

### AC-1 测试用例

| 用例 ID | 技术 | 输入/前置条件 | 预期行为 | 测试层级 | 结果 |
| --- | --- | --- | --- | --- | --- |
| TC-101 | 静态检查 | index.html void 元素 | 无 `/>` 自闭合 | 静态 | 通过 |
| TC-102 | 静态检查 | tsconfig.json target/lib | ES2022 + useDefineForClassFields | 静态 | 通过 |
| TC-103 | 静态检查 | globals.css light 主题 | 有 `color-scheme: light` | 静态 | 通过 |
| TC-104 | 静态检查 | globals.css dark 主题 | 有 `color-scheme: dark` | 静态 | **失败**（缺失） |
| TC-105 | 编译验证 | `npx tsc --noEmit` | exit 0 | 静态 | 通过 |
| TC-106 | 构建验证 | `npx vite build` | 成功 | 静态 | 通过（1546 模块） |

### AC-2 测试用例

| 用例 ID | 技术 | 输入/前置条件 | 预期行为 | 测试层级 | 结果 |
| --- | --- | --- | --- | --- | --- |
| TC-201 | 等价分区 | charge force strength | 返回 -400 | 集成 | 通过 |
| TC-202 | 等价分区 | link force distance | 返回 80 | 集成 | 通过 |
| TC-203 | 等价分区 | center force strength | 返回 0.08 | 集成 | 通过 |
| TC-204 | 等价分区 | collide force | 存在并配置 radius | 集成 | **失败**（null，死代码） |

### AC-3 测试用例

| 用例 ID | 技术 | 输入/前置条件 | 预期行为 | 测试层级 | 结果 |
| --- | --- | --- | --- | --- | --- |
| TC-301 | 正常路径 | 点击"编程"领域 | 横幅"领域筛选：编程（12 节点）" | E2E | 通过 |
| TC-302 | 边界值 | 点击"✕ 清除" | 横幅消失，恢复 37 节点 | E2E | 通过 |
| TC-303 | 正常路径 | 点击"知识库系统" | 横幅出现，显示该领域节点 | E2E | 通过 |
| TC-304 | 状态保持 | 过滤后切换视图再切回 | 过滤状态保留 | E2E | 通过 |

### AC-4 测试用例

| 用例 ID | 技术 | 输入/前置条件 | 预期行为 | 测试层级 | 结果 |
| --- | --- | --- | --- | --- | --- |
| TC-401 | 代码审查 | GraphStats domainCounts 计算 | 从 graphData.nodes 动态计算 | 静态 | 通过 |
| TC-402 | 运行时验证 | mock 数据（含 8 领域） | 显示全部 8 领域 + MOCK 徽章 | E2E | 通过 |
| TC-403 | 代码审查 | Tauri 模式真实数据（无 academic/life） | 只显示有节点的领域 + LIVE 徽章 | 静态 | 通过（推理） |

### AC-5 测试用例

| 用例 ID | 技术 | 输入/前置条件 | 预期行为 | 测试层级 | 结果 |
| --- | --- | --- | --- | --- | --- |
| TC-501 | 性能测量 | 图谱→审核切换 | <100ms，Canvas 保持 | E2E | 通过（58.5ms） |
| TC-502 | 性能测量 | 审核→图谱切换 | <100ms，Canvas 同一节点 | E2E | 通过（30.6ms） |
| TC-503 | DOM 验证 | 所有视图切换 | Canvas 始终在 DOM 中 | E2E | 通过 |
| TC-504 | 状态保持 | 过滤→切换→切回 | 过滤状态保留 | E2E | 通过 |

---

## 四、分层测试详情

### 4.1 静态分析

| 工具 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | 通过（exit 0） | 无类型错误 |
| Vite 构建 | `npx vite build` | 通过（1546 模块，26.88s） | dist/ 生成成功 |
| ESLint | 未配置 | N/A | 项目无 ESLint 配置文件 |
| AC-1 index.html | git diff 审查 | 通过 | void 元素 `/>` → `>`，charset/viewport 优先 |
| AC-1 tsconfig.json | git diff 审查 | 通过 | target ES2020→ES2022，lib 同步 |
| AC-1 globals.css | git diff + 运行时 | **部分通过** | light 有 color-scheme: light；dark 缺失 color-scheme: dark（computed: "normal"） |

**AC-1 index.html 验证**（git diff 证据）：

```diff
-    <meta charset="UTF-8" />
-    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
-    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
+    <meta charset="UTF-8">
+    <meta name="viewport" content="width=device-width, initial-scale=1.0">
+    <link rel="icon" type="image/svg+xml" href="/vite.svg">
```

**AC-1 globals.css 缺陷证据**（playwright_evaluate 运行时）：

```json
{
  "currentTheme": "dark",
  "computedColorScheme": "normal",
  "hasColorSchemeDark": false
}
```

`globals.css` 第 17-34 行 `:root[data-theme="dark"]` 块中无 `color-scheme: dark;` 声明。浏览器 computed value 为 "normal"，暗色主题下原生表单控件和滚动条不会渲染为暗色。

### 4.2 单元/集成测试

项目无单元测试框架（package.json 无 vitest/jest 依赖，无 *.test.* 文件）。采用 playwright_evaluate 在真实运行的应用中验证 store/force 逻辑，等效于集成级测试。

| 场景 | 方法 | 结果 | 证据 |
| --- | --- | --- | --- |
| d3-force charge 配置 | fiber 树访问 ForceGraph 实例，调用 `charge.strength()` 并执行返回函数 | 通过 | `charge.strength()({index:0},0,[])` = -400 |
| d3-force link 配置 | 同上，调用 `link.distance()` 并执行 | 通过 | `link.distance()({index:0},0,[])` = 80 |
| d3-force center 配置 | 同上，调用 `center.strength()` | 通过 | 0.08（number） |
| d3-force collide | `fgInstance.d3Force('collide')` | **失败** | null（force-graph 无默认 collide） |
| force 存在性 | 遍历 7 种 force 名称 | link/charge/center 存在，collide/dagRadial/x/y/radial 均为 null | — |

**d3-force-3d 特殊行为说明**：

d3-force-3d（force-graph 的依赖）的 `forceManyBody.strength()` 和 `forceLink.distance()` 始终返回**函数**（用 `constant(value)` 包装），而非直接返回数值。需调用返回的函数获取实际值。这导致初次检查时误判为"未配置"，实际值正确：

```javascript
// d3-force-3d manyBody.js:122-123
force.strength = function(_) {
    return arguments.length ? (strength = typeof _ === "function" ? _ : constant(+_), initialize(), force) : strength;
};
// constant(-400) = function() { return -400; }
```

**collide force 死代码分析**：

force-graph 源码（`force-graph.mjs:835`）默认创建的 forces：

```javascript
forceSimulation()
  .force('link', forceLink())
  .force('charge', forceManyBody())
  .force('center', forceCenter())
  .force('dagRadial', null)
  .stop()
```

无 `forceCollide`。GraphView.tsx:279-285 用 getter 形式 `fg.d3Force("collide")` 获取不存在的 force，返回 null，`if (collide)` 守卫跳过配置。正确写法应使用 setter：`fg.d3Force("collide", forceCollide().radius(...).iterations(3))`。

### 4.3 端到端测试（Playwright MCP）

| 流程 | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| 初始加载 | 导航到 localhost:1420 | 通过 | Canvas 存在，控制台无错误 |
| 图谱视图 | 点击图谱按钮 | 通过 | graphDivDisplay=block，Canvas 1392×780 |
| 编程领域过滤 | 点击"编程" | 通过 | 横幅"领域筛选：编程（12 节点）✕ 清除"，stats 12 节点 16 边 |
| 清除过滤 | 点击"✕ 清除" | 通过 | 横幅消失，恢复 37 节点 56 边 |
| 视图切换→审核 | 图谱→审核 | 通过 | 58.5ms，canvasSameNode=true，display=none |
| 视图切换→图谱 | 审核→图谱 | 通过 | 30.6ms，canvasSameNode=true，display=block |
| 过滤跨视图保留 | 编程过滤→审核→图谱 | 通过 | 横幅"领域筛选：编程（12 节点）"保留 |
| 全视图回归 | upload/preview/review/graph | 通过 | 4 视图均有内容，Canvas 全程保持 |
| 领域分布面板 | 检查 GraphStats | 通过 | 8 领域显示（mock），MOCK 徽章 |
| force 参数验证 | charge/link/center | 通过 | -400 / 80 / 0.08 |
| bbox 测量 | getGraphBbox() | 通过 | x[-541,1594] y[-1374,881]，spread 2135×2255 |

**截图证据**：

- `ac2-graph-initial-layout`：初始图谱布局
- `ac2-graph-final-layout`：清除过滤后最终布局

### 4.4 极端场景验证（代码审查）

| 场景 | 代码路径 | 结果 | 说明 |
| --- | --- | --- | --- |
| 空图谱数据（0 节点） | filteredGraph 返回空数组；GraphStats domainCounts.length===0 → "暂无数据" | 通过 | 不会崩溃 |
| 单节点 | nodeRadius(0)=5（Math.max 下界）；charge 推至中心 | 通过 | 正常渲染 |
| currentDomain=null | filteredGraph 使用 filterDomains（全选） | 通过 | 显示全部节点 |
| currentDomain=undefined | `currentDomain ?` 为 falsy，同 null | 通过 | 安全降级 |
| inDegree=undefined | `n.inDegree ?? 0` 防御（Q2 修复） | 通过 | nodeRadius(0)=5 |
| loading=true（Tauri 加载中） | "加载知识图谱..." + MOCK + "加载中…" 徽章 | 通过 | 四种徽章状态正确 |
| error 有值 | "⚠️ {error}（显示 mock 数据）" + ERROR 徽章 | 通过 | React JSX 自动转义 error |

---

## 五、安全审计结果

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 前端无硬编码密钥 | 通过 | 6 个变更文件无 API key/token/password |
| SQL 注入防护 | N/A | 本次变更无数据库交互 |
| XSS 防护 — nodeLabel | **失败（既有）** | [GraphView.tsx:365-375](../../frontend/src/components/GraphView.tsx#L365-L375) `${node.title}` 未转义 → `float-tooltip.mjs:218` `.html()` innerHTML |
| XSS 防护 — error 消息 | 通过 | [GraphView.tsx:759](../../frontend/src/components/GraphView.tsx#L759) `{error}` 使用 React JSX 自动转义 |
| XSS 防护 — GraphStats | 通过 | [App.tsx:255-263](../../frontend/src/App.tsx#L255-L263) React JSX 渲染，自动转义 |
| 权限验证 | 通过 | Tauri IPC TOOL_WHITELIST 仅允许只读工具（guardrail 报告确认） |
| CSP 配置 | 未验证 | Tauri CSP 配置不在本次变更范围 |

### XSS 漏洞详析（DEFECT-3）

**攻击链**：

1. 用户创建 wiki 页面，frontmatter title 设为 `<img src=x onerror=alert(1)>`
2. kb_get_graph 返回该页面作为 GraphNode，`node.title = "<img src=x onerror=alert(1)>"`
3. 用户在图谱中 hover 该节点 → react-force-graph-2d 调用 `nodeLabel(node)`
4. `nodeLabel` 返回 HTML 字符串 `...<div>${node.title}</div>...`，title 未转义
5. float-tooltip 调用 `state.tooltipEl.html(content)` → `innerHTML = content`
6. 浏览器解析 HTML，执行 `onerror` 回调 → XSS 触发

**代码证据**：

```typescript
// GraphView.tsx:365-375
const nodeLabel = useCallback(
    (node: { title?: string; ... }) => {
      return `<div style="...">
        <div style="font-weight:600">${node.title ?? "(untitled)"}</div>
        <!-- node.title 未 HTML 实体编码，直接插入 -->
        ...
      </div>`;
    },
    [],
);
```

```javascript
// float-tooltip.mjs:217-218
} else if (typeof state.content === 'string') {
    state.tooltipEl.html(state.content);  // d3-selection .html() = innerHTML
}
```

**影响**：在 Tauri 环境下，webview XSS 可能通过 IPC 导致 RCE。

**修复建议**：对 `node.title` 进行 HTML 实体编码（`&` `<` `>` `"` `'`），或改用 DOM API 创建元素。

**范围说明**：此代码在本次 R3 变更前已存在（diff 未修改 `nodeLabel`），guardrail-enforcer 确认不在本次阻断范围。但 CLAUDE.md §11 要求"基础安全：XSS 检查"，故记录为既有风险。

---

## 六、回归测试结果

| 套件 | 总数 | 通过 | 失败 | 结果 |
| --- | --- | --- | --- | --- |
| TypeScript 类型检查 | — | — | — | 通过（exit 0） |
| Vite 生产构建 | 1546 模块 | 1546 | 0 | 通过 |
| 控制台错误/警告 | — | 0 | 0 | 通过（仅 Vite 连接日志） |
| 视图功能回归 | 4 视图 | 4 | 0 | 通过（upload/preview/review/graph 均正常） |

**无既有测试套件**：项目无 *.test.* 文件，package.json 无 test 脚本。回归依赖编译验证 + E2E 功能验证。

---

## 七、缺陷列表

| ID | 严重度 | 关联 AC | 描述 | 复现步骤 | 代码位置 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| DEFECT-1 | 低 | AC-1 | 暗色主题缺失 `color-scheme: dark` | 1. 切换到暗色主题 2. 检查 `getComputedStyle(document.documentElement).colorScheme` → "normal" | [globals.css:17-34](../../frontend/src/styles/globals.css#L17-L34) | 新发现 |
| DEFECT-2 | 低 | AC-2 | collide force 死代码：`d3Force("collide")` 返回 null，配置被 `if (collide)` 跳过 | 1. 图谱视图 2. `fgInstance.d3Force('collide')` → null | [GraphView.tsx:279-285](../../frontend/src/components/GraphView.tsx#L279-L285) | 新发现 |
| DEFECT-3 | 中 | 安全 | nodeLabel 存储型 XSS：`node.title` 未 HTML 转义，经 innerHTML 渲染 | 1. 创建 title 含 `<img onerror>` 的 wiki 页 2. 图谱中 hover 该节点 | [GraphView.tsx:365-375](../../frontend/src/components/GraphView.tsx#L365-L375) | 既有（非本次引入） |

### DEFECT-2 修复建议

```typescript
// 当前（死代码）：
const collide = fg.d3Force("collide");
if (collide) {
  collide.radius(...).iterations(3);
}

// 修复（使用 setter 创建 force）：
import { forceCollide } from "d3-force-3d";
fg.d3Force("collide", forceCollide()
  .radius((node: unknown) => {
    const n = node as GraphNode;
    return nodeRadius(n.inDegree ?? 0) + 5;
  })
  .iterations(3)
);
```

### DEFECT-2 影响评估

虽然 collide force 未生效，但 AC-2 仍判定为**通过**，理由：

1. charge(-400) 是默认(-30)的 13 倍，提供强力斥力
2. link(80) 是默认(30)的 2.67 倍，给链接节点充足间距
3. bbox 显示节点分布在 2135×2255 单位空间内，无严重聚集
4. 最大节点半径 20，链接距离 80，两链接节点间距 80 > 20+20=40，不会重叠

collide 是额外的碰撞检测安全网，其缺失不导致严重的节点混叠（用户报告的原问题）。

---

## 八、未覆盖项与风险

| 项目 | 原因 | 风险 |
| --- | --- | --- |
| Tauri 环境真实数据验证 | 浏览器 dev 模式 isTauri()=false，无法触发 kb_get_graph | Tauri 环境下数据结构/CSP/IPC 延迟可能影响体验（主 Agent Q1 自问已识别） |
| d3-force 性能量化测试 | 未测量节点布局稳定时间、CPU 占用 | "三个大领域节点混在一起"问题可能需更激进参数或领域聚类（主 Agent Q2 自问已识别） |
| Tauri CSP 限制 | Tauri CSP 配置不在本次变更范围 | Tauri webview 的 CSP 可能阻止某些 canvas/字体资源加载 |
| 真实 XSS 利用验证 | 未在运行时注入恶意 title 验证 | 代码链路分析已确认可利用性，但未做端到端 PoC |
| 单元测试覆盖率 | 项目无测试框架 | 核心逻辑（nodeRadius、filteredGraph、domainCounts）无自动化测试保护 |

---

## 九、主 Agent 自问回应

### Q1：Playwright 测试只在浏览器 dev 模式下执行

**验证器回应**：确认此限制。本次验收全部在浏览器 dev 模式（mock 数据）下执行。AC-4 的 Tauri 模式验证通过代码审查推理完成（GraphStats 从 `graphData.nodes` 动态计算领域分布，`setGraphData` 设置 `dataSource='real'`）。建议在 Tauri 环境下补充集成测试。

### Q2：未对 d3-force 物理效果进行量化性能测试

**验证器回应**：本次通过 `getGraphBbox()` 获取了节点空间分布（bbox 2135×2255 单位），并验证了 force 参数（charge=-400、link=80、center=0.08）。但未测量 CPU 占用和布局稳定时间。发现 collide force 死代码（DEFECT-2），这意味着节点防重叠仅靠 charge + link，可能需要补充 collide force 或领域聚类才能完全解决"三大领域节点混在一起"问题。

---

## 十、结论

### 10.1 各 AC 验证结论

| AC | 结论 | 说明 |
| --- | --- | --- |
| AC-1 | **部分通过** | index.html ✓、tsconfig ✓；globals.css 暗色主题缺 color-scheme: dark（DEFECT-1，低危） |
| AC-2 | **通过** | charge=-400、link=80、center=0.08 均已生效；collide 死代码（DEFECT-2，低危，不阻断） |
| AC-3 | **通过** | 领域按钮点击→过滤横幅+节点数正确；清除按钮→恢复全部；跨视图保留 |
| AC-4 | **通过** | GraphStats 从真实节点计算领域分布；dataSource 徽章（MOCK/LIVE/加载中/ERROR） |
| AC-5 | **通过** | 视图切换 30-59ms；Canvas 同一 DOM 节点保持；无卡顿 |

### 10.2 最终建议

1. **可发布**：5 条 AC 核心功能均已实现且验证通过，DEFECT-1/2 为低危不阻断发布
2. **建议后续修复**：
   - DEFECT-1：globals.css 添加 `color-scheme: dark` 到暗色主题块
   - DEFECT-2：collide force 改用 setter 形式创建，或移除死代码注释说明
   - DEFECT-3：nodeLabel 对 `node.title` 进行 HTML 实体编码（**优先级最高，Tauri RCE 风险**）
3. **建议补充测试基建**：引入 vitest + @testing-library/react，为核心纯函数（nodeRadius、filteredGraph、domainCounts）编写单元测试
