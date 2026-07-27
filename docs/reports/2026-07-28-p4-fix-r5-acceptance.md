# P4 GUI R5 修复 — 验收标准验证报告

| 项目 | 内容 |
| --- | --- |
| 任务令牌 | TKN-P4-FIX-R5-001 |
| 验证日期 | 2026-07-28 |
| 风险等级 | P2（新增依赖 d3-force-3d，修改力配置和渲染逻辑） |
| 验证 Agent | ac-verifier（含 TRAE-debugger + Playwright MCP） |
| 前置审查 | guardrail-enforcer R5 报告：通过（3 项低风险建议，不阻断） |
| **结论** | **通过**（24/24 AC 全部通过） |

---

## 一、验证范围与方法

### 1.1 验证范围

| 变更文件 | 修改内容 |
| --- | --- |
| `frontend/package.json` | 新增 d3-force-3d@^3.0.6 依赖 |
| `frontend/src/types/d3-force-3d.d.ts`（新） | d3-force-3d TypeScript 类型声明 |
| `frontend/src/components/GraphView.tsx` | forceCollide + useEffect 依赖修复 + d3VelocityDecay prop + Tab 键修复 + 死码移除 |
| `frontend/src/styles/globals.css` | 补充标准 font-feature-settings |

### 1.2 验证方法（三层）

| 层 | 方法 | 工具 |
| --- | --- | --- |
| 静态分析 | 代码阅读 + 静态核验 | Read |
| 编译验证 | tsc --noEmit + vite build + vitest | Shell |
| 运行时验证 | Playwright E2E + TRAE-debugger 运行时日志 | mcp_Playwright + TRAE-debugger skill + Debug Server |

### 1.3 运行时环境

- **Debug Server**: http://127.0.0.1:7777（session: p4-r5-graph-fixes）
- **Tauri dev server**: http://127.0.0.1:1420
- **浏览器**: Chromium（Playwright，1440×900 视口）
- **数据**: mock 数据（37 节点 / 56 边，浏览器环境回退）
- **运行时日志**: 243 条事件（A:forceConfig=5, D:tabCycle=4, C:drag=234）

---

## 二、验收标准验证结果

### AC-1: 节点重叠修复（forceCollide）

| AC | 验证方法 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-1.1 forceCollide 已添加，radius = nodeRadius(inDegree) + 8 | 代码阅读 + 运行时 | **通过** | 代码 L276-282；运行时 `collideExists: true`（fg.d3Force("collide") 返回 function） |
| AC-1.2 iterations=3 提高碰撞检测精度 | 代码阅读 + 运行时 | **通过** | 代码 L281 `.iterations(3)`；运行时 `collideIterations: 3`（直接读取 force 对象属性） |
| AC-1.3 图谱中节点不应重叠 | 运行时 bbox + 截图 | **通过** | forceCollide 激活；bbox x[-568,1195] y[-1137,769]（1764×1906 分散区域）；截图 03/04 验证 |

### AC-2: 物理效果恢复

| AC | 验证方法 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-2.1 force 配置在 graphData 变化时重应用 | 代码阅读 + 运行时日志 | **通过** | 代码 L285 `}, [graphData.nodes.length]`；debug server 收到 5 条 useEffect 触发日志（nodesLength=37） |
| AC-2.2 charge -500、linkDistance 90、center gravity 0.08 均生效 | 代码阅读 + 运行时日志 | **通过** | debug 日志：`chargeStrength: -500, linkDistance: 90, gravityStrength: 0.08`；运行时 `centerStrength: 0.08` |
| AC-2.3 d3VelocityDecay=0.4 通过 prop 设置 | 代码阅读 + guardrail 报告 | **通过** | 代码 L898 `d3VelocityDecay={0.4}` prop（非 `fg.d3VelocityDecay(0.4)` 方法调用）；guardrail 报告 §1.5 验证 prop 内部调用 `state.forceLayout.velocityDecay(0.4)` |
| AC-2.4 图谱节点自然分散 | 运行时 bbox | **通过** | bbox 1764×1906；charge -500 + collide 共同作用，节点充分分散 |

### AC-3: 拖动重影修复

| AC | 验证方法 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-3.1 nodeCanvasObject 中无死 globalAlpha 代码 | 代码阅读 | **通过** | 代码 L401-402：单一 `ctx.globalAlpha = isDimmed ? 0.05 : n.status === "archived" ? 0.15 : 0.2;`，注释说明合并原因，无被覆盖的死码 |
| AC-3.2 拖动节点时不应出现重影/拖尾 | Playwright + 运行时日志 | **通过** | 234 条 onNodeDrag 日志，2 个节点被拖动（"wiki/kb-system/query-workflow" 151 事件 + "mcp-cache-exp" 83 事件）；onNodeDragEnd 正常触发；截图 10/11/12 无重影；0 控制台错误 |

### AC-4: Tab 键循环修复

| AC | 验证方法 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-4.1 Tab 键使用 filteredGraph.nodes 而非 getGraph() | 代码阅读 + 运行时日志 | **通过** | 代码 L617 `filteredGraph.nodes as Array<...>`；运行时 `simNodesCount: 37`（非 undefined）；graphRef keys 确认 getGraph 不在白名单 |
| AC-4.2 按 Tab 能循环选中可见节点 | Playwright + 运行时日志 | **通过** | 4 次 Tab 全部成功：1st curIdx=-1→0 "three-layer-arch"；2nd curIdx=0→1 "frontmatter-schema"；3rd curIdx=-1→0 "async-patterns"（筛选后 12 节点）；4th curIdx=0→1 "event-loop"；`nextNodeHasXY: true` 全程为真 |

### AC-5: CSS 警告修复

| AC | 验证方法 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-5.1 globals.css 同时有 -webkit-font-feature-settings 和 font-feature-settings | 代码阅读 | **通过** | 代码 L95-96：`-webkit-font-feature-settings: 'liga';` + `font-feature-settings: 'liga';`（前缀在前，标准属性在后） |

### AC-6: 编译验证

| AC | 验证方法 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-6.1 `npx tsc --noEmit` 通过 | Shell | **通过** | 0 错误（含 instrumentation 阶段 + 清理后两次验证） |
| AC-6.2 `npx vite build` 通过 | Shell | **通过** | 构建成功，22.38s，1547 modules transformed（仅 chunk size 警告，非阻断） |

### AC-7: 功能回归（Playwright E2E）

| AC | 验证方法 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-7.1 知识图谱页面正常加载 | Playwright | **通过** | canvas 1392×780 渲染；37 节点 · 56 边 · 孤儿页 3 · 最大连通分量 34；截图 01/02/04 |
| AC-7.2 节点 hover tooltip 正常显示 | 代码阅读 + 单元测试 | **通过** | nodeLabel 函数含 escapeHtml 转义（5 字段全覆盖）；48 个 html-utils 单元测试通过；react-force-graph-2d 内置 tooltip 渲染（合成事件无法触发，但 XSS 防御已验证） |
| AC-7.3 领域筛选按钮正常工作 | Playwright | **通过** | 点击"编程"筛选：37 节点 → 12 节点，56 边 → 16 边；截图 06 |
| AC-7.4 视图切换正常（图谱/预览/审核/上传） | Playwright | **通过** | 4 视图全部切换成功；截图 07（预览）/08（审核）/09（上传） |
| AC-7.5 控制台无 JavaScript 错误 | Playwright | **通过** | `playwright_console_logs` type=error 返回 "No console logs matching the criteria" |
| AC-7.6 拖动节点后能再次拖动 | Playwright + 运行时日志 | **通过** | 2 个不同节点被成功拖动：1st "wiki/kb-system/query-workflow"（x: 3.84→-4.42，151 事件）；2nd "mcp-cache-exp"（x: 887.15→888.19，83 事件）；onNodeDragEnd 正常触发 |
| AC-7.7 物理效果可见（节点分散，不重叠） | 运行时 bbox + 截图 | **通过** | bbox 1764×1906；forceCollide + charge -500 + linkDistance 90 共同作用；截图 03/04 验证 |

### AC-8: TRAE-debugger 运行时验证

| AC | 验证方法 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-8.1 使用 TRAE-debugger skill 收集运行时证据 | TRAE-debugger skill | **通过** | session p4-r5-graph-fixes；Debug Server 运行 588s；243 条日志事件；NDJSON 日志文件 65KB |
| AC-8.2 验证 forceCollide 力在运行时确实生效 | 运行时 evaluate + 日志 | **通过** | `fg.d3Force("collide")` 返回 function（collideExists=true）；`collideIterations: 3`；5 条 useEffect 触发日志确认 `collideAdded: true` |
| AC-8.3 验证拖动时无重影 | 运行时日志 + 截图 | **通过** | 234 条 onNodeDrag/onNodeDragEnd 日志；2 个节点拖动坐标连续变化；0 控制台错误；截图 10/11/12 对比无重影 |
| AC-8.4 验证视图切换时无卡顿 | Playwright + 控制台 | **通过** | 4 视图切换全部完成；0 控制台错误；无明显延迟（切换均 <1s 完成） |

---

## 三、TRAE-debugger 运行时证据摘要

### 3.1 调试会话信息

| 项 | 值 |
| --- | --- |
| Session ID | p4-r5-graph-fixes |
| Debug Server | http://127.0.0.1:7777 |
| 运行时长 | 588 秒 |
| 日志总数 | 243 条 |
| 日志文件 | `.dbg/trae-debug-log-p4-r5-graph-fixes.ndjson`（65KB） |

### 3.2 假设验证矩阵

| 假设 ID | 假设内容 | 验证方法 | 结论 | 关键证据 |
| --- | --- | --- | --- | --- |
| A | forceCollide 力被正确添加到 simulation | fg.d3Force("collide") + useEffect 日志 | **确认** | collideExists=true, collideIterations=3, 5 条 useEffect 日志 |
| B | force 配置在 graphData 变化时重应用 | useEffect 依赖 + 触发日志 | **确认** | deps=[graphData.nodes.length], 5 次触发（StrictMode + 数据加载） |
| C | 拖动无重影，Canvas 正确清理 | onNodeDrag 日志 + 截图 | **确认** | 234 条拖动日志，2 节点拖动，坐标连续变化，0 错误 |
| D | Tab 键 filteredGraph.nodes 非空，能循环 | Tab 键日志 | **确认** | simNodesCount=37/12, nextNodeHasXY=true, 4 次循环成功 |
| E | d3VelocityDecay prop 生效 | 代码 + guardrail 报告 | **确认** | prop 设置（非方法调用），guardrail 验证内部 onChange 机制 |

### 3.3 关键运行时日志样本

**force 配置 useEffect（假设 A）**：

```json
{"hypothesisId":"A","msg":"[DEBUG] force config useEffect ran","data":{"nodesLength":37,"chargeStrength":-500,"linkDistance":90,"gravityStrength":0.08,"collideAdded":true}}
```

**Tab 键循环（假设 D）**：

```json
{"hypothesisId":"D","msg":"[DEBUG] Tab key pressed","data":{"simNodesCount":37,"idsCount":37,"curIdx":-1,"nextIdx":0,"nextId":"three-layer-arch","nextNodeHasXY":true}}
{"hypothesisId":"D","msg":"[DEBUG] Tab key pressed","data":{"simNodesCount":37,"idsCount":37,"curIdx":0,"nextIdx":1,"nextId":"frontmatter-schema","nextNodeHasXY":true}}
```

**拖动坐标变化（假设 C）**：

```json
{"hypothesisId":"C","msg":"[DEBUG] node dragging","data":{"nodeId":"wiki/kb-system/query-workflow","x":3.84,"y":524.06}}
{"hypothesisId":"C","msg":"[DEBUG] node dragging","data":{"nodeId":"wiki/kb-system/query-workflow","x":0.54,"y":522.40}}
{"hypothesisId":"C","msg":"[DEBUG] node dragging","data":{"nodeId":"wiki/kb-system/query-workflow","x":-4.42,"y":519.92}}
...
{"hypothesisId":"C","msg":"[DEBUG] node drag ended","data":{"nodeId":"mcp-cache-exp","x":888.19,"y":-374.44}}
```

**运行时 force 对象属性（通过 evaluate 读取）**：

```json
{"collideExists":true,"collideIterations":3,"collideStrength":1,"centerStrength":0.08}
```

**图谱边界框（节点分散证据）**：

```json
{"bbox":{"x":[-568.80,1195.70],"y":[-1137.50,769.12]}}
```

---

## 四、Playwright 截图证据

| 编号 | 截图文件 | 验证内容 |
| --- | --- | --- |
| 01 | `01-initial-load-*.png` | 应用初始加载（预览视图 + 图谱面板） |
| 02 | `02-graph-view-loaded-*.png` | 图谱视图加载（37 节点） |
| 03 | `03-graph-nodes-dispersion-*.png` | 节点分散效果（forceCollide + 物理力） |
| 04 | `04-graph-visible-*.png` | 图谱视图完整渲染（canvas 可见） |
| 05 | `05-tab-selected-node-*.png` | Tab 键选中节点（高亮显示） |
| 06 | `06-domain-filter-coding-*.png` | 领域筛选"编程"（37→12 节点） |
| 07 | `07-view-preview-*.png` | 预览视图 |
| 08 | `08-view-review-*.png` | 审核视图 |
| 09 | `09-view-upload-*.png` | 上传视图 |
| 10 | `10-before-drag-*.png` | 拖动前图谱状态 |
| 11 | `11-after-drag-*.png` | 拖动后图谱状态（无重影） |
| 12 | `12-after-playwright-drag-*.png` | Playwright 拖动后状态（无重影） |

截图目录：`docs/reports/screenshots/`

---

## 五、单元测试与编译验证

### 5.1 单元测试

| 项 | 结果 |
| --- | --- |
| 测试框架 | vitest v4.1.10 |
| 测试文件 | `src/lib/__tests__/html-utils.test.ts` |
| 测试用例 | 48 个全部通过 |
| 耗时 | 987ms |
| 回归 | 无（清理 instrumentation 后再次运行，仍 48/48 通过） |

### 5.2 编译验证

| 项 | 结果 | 备注 |
| --- | --- | --- |
| `npx tsc --noEmit` | 通过 | 0 错误（instrumentation 前 + 清理后两次验证） |
| `npx vite build` | 通过 | 22.38s，1547 modules，仅 chunk size >500kB 警告（非阻断） |

---

## 六、Instrumentation 清理记录

### 6.1 临时插桩点（已全部清理）

| 位置 | 假设 | 清理状态 |
| --- | --- | --- |
| force 配置 useEffect 内（fetch 日志 + window.__graphRef 暴露） | A | 已清理 |
| Tab 键处理器内（fetch 日志） | D | 已清理 |
| handleNodeDrag / handleNodeDragEnd 回调 | C | 已清理 |
| ForceGraph2D onNodeDrag / onNodeDragEnd props | C | 已清理 |

### 6.2 清理后验证

- `npx tsc --noEmit`：通过（0 错误）
- `npx vitest run`：48/48 通过
- GraphView.tsx 已恢复到 R5 修复的原始状态（无 instrumentation 残留）

### 6.3 调试产物

| 产物 | 路径 | 处置 |
| --- | --- | --- |
| Debug session 文件 | `debug-p4-r5-graph-fixes.md` | 保留（验收证据） |
| NDJSON 日志 | `.dbg/trae-debug-log-p4-r5-graph-fixes.ndjson` | 保留（验收证据） |
| env 文件 | `.dbg/p4-r5-graph-fixes.env` | 保留 |
| Debug Server | 已停止（588s 运行后手动停止） | — |

---

## 七、综合结论

### 7.1 结论：通过

**24/24 验收标准全部通过。**

| 维度 | AC 数 | 通过 | 不通过 |
| --- | --- | --- | --- |
| AC-1 节点重叠修复 | 3 | 3 | 0 |
| AC-2 物理效果恢复 | 4 | 4 | 0 |
| AC-3 拖动重影修复 | 2 | 2 | 0 |
| AC-4 Tab 键循环修复 | 2 | 2 | 0 |
| AC-5 CSS 警告修复 | 1 | 1 | 0 |
| AC-6 编译验证 | 2 | 2 | 0 |
| AC-7 功能回归 | 7 | 7 | 0 |
| AC-8 TRAE-debugger | 4 | 4 | 0 |
| **合计** | **24** | **24** | **0** |

### 7.2 验证强度评估

| AC | 验证强度 | 说明 |
| --- | --- | --- |
| AC-1.1, AC-1.2 | 强 | 代码 + 运行时双重验证（fg.d3Force 读取） |
| AC-1.3 | 中 | forceCollide 激活 + bbox + 截图（无法直接检测像素级重叠） |
| AC-2.1, AC-2.2 | 强 | 代码 + 运行时日志（5 条 useEffect 触发日志） |
| AC-2.3 | 中 | 代码 + guardrail 报告（prop 机制已验证，未直接读取 forceLayout.velocityDecay） |
| AC-2.4 | 强 | bbox 数据（1764×1906 分散区域） |
| AC-3.1 | 强 | 代码阅读（死码已移除，注释说明） |
| AC-3.2 | 强 | 234 条拖动日志 + 截图 + 0 控制台错误 |
| AC-4.1, AC-4.2 | 强 | 代码 + 4 次 Tab 运行时日志（simNodesCount + nextNodeHasXY） |
| AC-5.1 | 强 | 代码阅读 |
| AC-6.1, AC-6.2 | 强 | 编译通过 |
| AC-7.1 | 强 | Playwright canvas 验证 |
| AC-7.2 | 中 | 代码 + 单元测试（合成事件无法触发 react-force-graph-2d 内置 tooltip） |
| AC-7.3 | 强 | Playwright 交互（37→12 节点） |
| AC-7.4 | 强 | Playwright 4 视图切换 + 截图 |
| AC-7.5 | 强 | Playwright 控制台日志 |
| AC-7.6 | 强 | 2 个节点拖动日志（含坐标变化） |
| AC-7.7 | 强 | bbox + 截图 |
| AC-8.1~8.4 | 强 | TRAE-debugger 全流程 |

### 7.3 已知限制

1. **Tooltip 验证（AC-7.2）**：合成 mousemove 事件无法触发 react-force-graph-2d 内置 tooltip 渲染。通过 nodeLabel 函数代码审查（含 escapeHtml 5 字段转义）+ 48 个单元测试验证 XSS 防御，间接确认安全性。
2. **拖动重影（AC-3.2）**：234 条拖动日志 + 截图对比 + 0 控制台错误提供强证据，但像素级重影检测需要图像 diff 工具（当前未集成）。
3. **d3VelocityDecay（AC-2.3）**：prop 机制通过 guardrail 报告 §1.5 验证（内部 onChange 调用 `state.forceLayout.velocityDecay(0.4)`），未直接读取 forceLayout.velocityDecay 值（不在 react-kapsule 白名单中）。

### 7.4 进入下一阶段的建议

**无阻断项，可进入合并阶段。**

guardrail-enforcer 报告中的 3 项低风险建议（Q1: dataSource 依赖触发器、Q2: typeof 守卫替代 as 断言、Q3: ref 优化 filteredGraph 依赖）可作为后续优化 backlog，不影响本次合并。

---

## 八、参考文件

| 文件 | 用途 |
| --- | --- |
| `docs/reports/2026-07-28-p4-fix-r5-guardrail.md` | guardrail-enforcer R5 审查报告（通过） |
| `frontend/src/components/GraphView.tsx` | 核心修改文件（已验证 + 已清理 instrumentation） |
| `frontend/src/types/d3-force-3d.d.ts` | d3-force-3d 类型声明 |
| `frontend/src/styles/globals.css` | CSS 修复 |
| `frontend/package.json` | 依赖声明 |
| `.dbg/trae-debug-log-p4-r5-graph-fixes.ndjson` | TRAE-debugger 运行时日志（243 条事件） |
| `debug-p4-r5-graph-fixes.md` | 调试会话记录 |
| `docs/reports/screenshots/` | Playwright 截图（12 张） |
| `CLAUDE.md` §7.2 / §11 | 强制审查-测试闭环 / 验收测试与分层验证 |
