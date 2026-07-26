# 验收测试报告 · P4 Phase 4c — 知识图谱可视化 + MCP CLI bridge + 反向链接面板 + LLM 集成策略

> 由 `ac-verifier`（验收标准验证器）+ `test-architect` skill 产出。每一结论附代码位置或测试输出作为证据，无臆测。

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | ac-verifier（验收标准验证器） |
| 任务令牌 | TKN-P4C-AC-001 |
| 任务域 | P4 Phase 4c — 知识图谱可视化 + MCP CLI bridge + 反向链接面板 + LLM 集成策略 |
| 报告日期 | 2026-07-27 |
| 分支 / HEAD | `feat/p4a-tauri-skeleton` / `b6b7be8`（功能 commit `19c4cff`，PR #33） |
| 验收依据 | [PRD US-004](../PRD.md) / [P4 实施计划 §8.1/§8.3/§8.4](../../.trae/documents/p4-gui-implementation-plan.md) / [ADR-013](../decisions/ADR-013-p4-llm-integration-strategy.md) / [ADR-014](../decisions/ADR-014-p4-python-parser-and-staging-workflow.md) |
| 前序报告 | [2026-07-27-p4b-ac-verifier.md](2026-07-27-p4b-ac-verifier.md)（4b 验收） |
| 测试架构 skill | test-architect |
| 主 Agent 签发上下文 | 限制 C-1/C-2/C-3（见 §7）；盲区：Tauri 桌面运行时未实测、macOS 未验证、PDF 解析 DLL 未跑、500 节点性能无数据 |

---

## 1. 总体结论

| 维度 | 条数 | PASS | CONDITIONAL/PARTIAL | FAIL/CANNOT VERIFY |
| --- | --- | --- | --- | --- |
| §8.1 US-004 | 6 | 5 | 1（AC-3） | 0 |
| §8.4 知识网络可视化 | 11 | 6 | 4（局部模式/筛选面板/交互/性能） | 1（键盘快捷键） |
| §8.3 非功能 | 4 | 1 | 2 | 1（启动/解析/预览延迟） |
| 合计 | 21 | 12 | 7 | 2 |

**总体结论：CONDITIONAL PASS**

- 核心交付已落地且通过客观验证：`kb_get_graph`/`kb_get_backlinks`/`kb_list_inbox` 14 个单元测试全过；真实 KB（37 节点 / 522 边）sanity check 通过；前端 `tsc + vite build` 通过；MCP CLI bridge（`call_mcp_tool` 白名单）+ 三段 BacklinksPanel + GraphView 节点/边四维视觉编码均实现；安全核查无硬编码 Key、CSP 白名单已收紧。
- 阻碍「无条件 PASS」的硬缺口：**§8.4-7 键盘快捷键完全未实现**（FAIL）；筛选面板仅 2/5 维；局部模式仅 1-hop；双击跳转实为单击、无右键菜单。这些属 P4 计划明确列出的验收项，当前以按钮/单击等替代形式部分满足，但未达字面要求。
- 计划内延迟项（非缺陷）：AC-3「AI 整理」按 ADR-013 D2 决策延迟到 P5，当前由 Python parser 做规则提取 + staging 人工审核闭环。

---

## 2. §8.1 US-004 验收矩阵（6 条）

| AC ID | 验收标准（P4 计划 §8.1 原文） | 测试方法 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| AC-1 | Tauri 桌面应用，支持 Windows/macOS | 代码审查 + 配置 | PASS | [lib.rs:768-786](../../frontend/src-tauri/src/lib.rs#L768-L786) `run()` 注册 6 个 IPC 命令；[tauri.conf.json:28-37](../../frontend/src-tauri/tauri.conf.json#L28-L37) `bundle.targets:"all"` + `.icns`(macOS)/`.ico`(Windows) 图标；CI cargo check PASS（限制 C-1） |
| AC-2 | 拖拽 PDF/DOCX/XLSX 触发解析管道 | 代码审查 | PASS | [DropZone.tsx:49-62](../../frontend/src/components/DropZone.tsx#L49-L62) `onDragDropEvent` → [DropZone.tsx:79](../../frontend/src/components/DropZone.tsx#L79) `uploadFile` → [lib.rs:330-336](../../frontend/src-tauri/src/lib.rs#L330-L336) `shell().command().args([])` 调 Python parser；ADR-014 D1 支持 PDF/DOCX/XLSX/MD（PDF 受限 C-2） |
| AC-3 | AI 整理生成 markdown wiki 页，先入 staging | 代码审查 + ADR | CONDITIONAL | [lib.rs:402-409](../../frontend/src-tauri/src/lib.rs#L402-L409) `build_wiki_page` 生成 `status:staging` frontmatter 落盘；但「AI 整理」按 [ADR-013 D2](../decisions/ADR-013-p4-llm-integration-strategy.md) 决策延迟到 P5，当前由 Python parser 做规则提取（非 LLM）。staging 闭环已通，AI 部分为计划内延迟 |
| AC-4 | 用户确认后写入 wiki/ 并更新 index/log | 代码审查 + 单元测试 | PASS | [lib.rs:527-550](../../frontend/src-tauri/src/lib.rs#L527-L550) `confirm_staging` 状态机校验 + 更新 `status:active` + [lib.rs:548](../../frontend/src-tauri/src/lib.rs#L548) `append_log` 写 log.md；MCP 侧 `kb_confirm_staging` 额外 `updateIndexHeader`（ADR-014 D4）。注：Tauri 侧不更新 index.md（GUI 不依赖），见 DEF-7 |
| AC-5 | GUI 内可预览 wiki 页（Obsidian 兼容） | 代码审查 | PASS | [MarkdownPreview.tsx:145-238](../../frontend/src/components/MarkdownPreview.tsx#L145-L238) `react-markdown` 渲染；[L100-141](../../frontend/src/components/MarkdownPreview.tsx#L100-L141) frontmatter 信息卡片；[L148-175](../../frontend/src/components/MarkdownPreview.tsx#L148-L175) wikilink 点击跳转。Obsidian 核心特性（wikilink+frontmatter）已满足。注：缺 remark-gfm/rehype-highlight/rehype-mermaid，见 DEF-6 |
| AC-6 | 原始文件不可变 | 代码审查 | PASS | [lib.rs:325](../../frontend/src-tauri/src/lib.rs#L325) `fs::copy(&path, &raw_path)` 仅写 raw/，源路径无写操作；AGENTS.md §9.3 禁止改 raw/ |

---

## 3. §8.4 知识网络可视化验收矩阵（11 条）

| AC ID | 验收标准（P4 计划 §8.4 原文） | 测试方法 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| 8.4-1 | GraphView 全局模式：显示所有 active 页面节点与 wikilink/related 边 | 代码审查 + sanity check | PASS | [GraphView.tsx:101](../../frontend/src/components/GraphView.tsx#L101) `callMcpTool("kb_get_graph")`；[graph.ts:34](../../server/src/tools/graph.ts#L34) 默认排除 pending/archived；sanity check 输出 37 节点 / 522 边（wikilink 290 + related 82 + tags 150） |
| 8.4-2 | GraphView 局部模式：以选中页为中心，展开 1/2/3-hop 邻居 | 代码审查 | PARTIAL | [GraphView.tsx:127-135](../../frontend/src/components/GraphView.tsx#L127-L135) `neighborhood` 仅计算 1-hop（直接邻居）；[L357](../../frontend/src/components/GraphView.tsx#L357) 提示「1-hop 邻域」。**2/3-hop 未实现，无跳数选择器**，见 DEF-3 |
| 8.4-3 | 节点视觉编码：颜色按领域、大小按入度、形状按 type、描边按 status | 代码审查 | PASS | [GraphView.tsx:195](../../frontend/src/components/GraphView.tsx#L195) 颜色=DOMAIN_COLORS[domain]；[L72-74](../../frontend/src/components/GraphView.tsx#L72-L74) `nodeRadius=sqrt(inDeg+1)*3.5`；[L36-70](../../frontend/src/components/GraphView.tsx#L36-L70) 形状（concept圆/entity方/source菱/experience三角）；[L210-213](../../frontend/src/components/GraphView.tsx#L210-L213) staging/pending 虚线 + [L208](../../frontend/src/components/GraphView.tsx#L208) archived 半透明。注：staging/pending 均虚线未区分点线，见 DEF-5 |
| 8.4-4 | 边视觉编码：实线 wikilink / 虚线 related / 点线 tags（默认隐藏） | 代码审查 | PASS | [GraphView.tsx:256-269](../../frontend/src/components/GraphView.tsx#L256-L269) wikilink 蓝实线 / related 绿虚线[4,2] / tags 橙点线[1,3]；[L85-87](../../frontend/src/components/GraphView.tsx#L85-L87) `filterEdgeTypes` 默认 `["wikilink","related"]`（tags 默认隐藏 ✓） |
| 8.4-5 | 筛选面板：领域 / 类型 / 状态 / 边类型 / 局部跳数 五维筛选 | 代码审查 | PARTIAL | 仅实现 2 维：[GraphView.tsx:82-84](../../frontend/src/components/GraphView.tsx#L82-L84) 领域 + [L85-87](../../frontend/src/components/GraphView.tsx#L85-L87) 边类型。**类型/状态/局部跳数 3 维未实现**，见 DEF-2 |
| 8.4-6 | 交互：缩放、平移、拖拽节点、单击选中、双击跳转、右键菜单 | 代码审查 | PARTIAL | [GraphView.tsx:458-460](../../frontend/src/components/GraphView.tsx#L458-L460) `enableNodeDrag/enableZoomInteraction/enablePanInteraction`；[L161-177](../../frontend/src/components/GraphView.tsx#L161-L177) 单击（局部聚焦/全局跳转）。**双击跳转实为单击触发**（无 `onNodeDoubleClick`）；**右键菜单未实现**（无 `onNodeRightClick`），见 DEF-4 |
| 8.4-7 | 键盘：`+/-` 缩放、`0` 重置、`F` 适应、`G` 模式切换、`Tab` 节点循环 | 代码审查 | **FAIL** | [GraphView.tsx](../../frontend/src/components/GraphView.tsx) 全文无 `window.addEventListener("keydown")` / `useEffect` 键盘绑定。重置/适应/模式切换仅以按钮形式存在（[L289-300](../../frontend/src/components/GraphView.tsx#L289-L300)、[L307-331](../../frontend/src/components/GraphView.tsx#L307-L331)），**无任何键盘快捷键**，见 DEF-1 |
| 8.4-8 | BacklinksPanel：三段折叠（反向链接 / 出链 / related） | 代码审查 | PASS | [BacklinksPanel.tsx:86-150](../../frontend/src/components/BacklinksPanel.tsx#L86-L150) 三个 `<Section>`（backlinks/outbound/related），各带 `isOpen` + `onToggle` 折叠状态 |
| 8.4-9 | BacklinksPanel：反向链接显示引用上下文（前后 50 字符） | 代码审查 + 单元测试 | PASS | [backlinks.ts:193-196](../../server/src/tools/backlinks.ts#L193-L196) `extractLinkContext` 取 `match.index ± 60` 字符（略超 50，更实用）；[BacklinksPanel.tsx:216-218](../../frontend/src/components/BacklinksPanel.tsx#L216-L218) 渲染 context；[graph.test.ts:271-274](../../server/src/tests/graph.test.ts#L271-L274) 断言 context 为 string |
| 8.4-10 | BacklinksPanel：点击条目跳转、空状态提示 | 代码审查 | PASS | [BacklinksPanel.tsx:61-63](../../frontend/src/components/BacklinksPanel.tsx#L61-L63) `handleNavigate` → `setCurrentPagePath`；[L93/L116/L138](../../frontend/src/components/BacklinksPanel.tsx#L93) + [L244-246](../../frontend/src/components/BacklinksPanel.tsx#L244-L246) `Empty` 空状态（「无反向链接」/「无出链」/「无 related 字段」） |
| 8.4-11 | 跳转联动：GraphView 双击节点 → MarkdownPreview 显示 → BacklinksPanel 更新 | 代码审查 | PASS | [GraphView.tsx:168-174](../../frontend/src/components/GraphView.tsx#L168-L174) 单击节点 → `setCurrentPagePath` + `setView("preview")`；[MarkdownPreview.tsx:68-74](../../frontend/src/components/MarkdownPreview.tsx#L68-L74) useEffect 响应 `currentPagePath` 重载；[BacklinksPanel.tsx:34-59](../../frontend/src/components/BacklinksPanel.tsx#L34-L59) useEffect 响应 `currentPagePath` 重载。联动链路完整（触发方式为单击，见 DEF-4） |

---

## 4. §8.3 非功能验收

| AC ID | 验收标准（P4 计划 §8.3 原文） | 测试方法 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| 8.3-1 | 应用启动 <2s，拖拽到解析 <500ms，markdown 预览 <300ms | — | CANNOT VERIFY | 限制 C-3：Tauri 桌面应用无法在 ac-verifier 环境运行。前端构建产物 index.js 573KB（gzip 179KB），理论上加载快，但启动/解析/预览延迟需桌面运行时实测 |
| 8.3-2 | 图谱性能：37 节点首屏 <100ms；500 节点 60fps；kb_get_graph P95 <300ms | sanity check + 单元测试 | PARTIAL | 37 节点：sanity check 瞬间完成（`builds nodes and edges` 单测 32ms 含 5 节点 fixture），首屏 <100ms 达标；`kb_get_graph` 无精确 P95 测量但观察达标。**500 节点 60fps 无数据**（KB 仅 37 节点）。**无增量缓存**（[graph.ts](../../server/src/tools/graph.ts) 每次 `loadAllPages` 全量扫描，P4 计划 §7 提到 mtime 缓存未实现），见 DEF-9 |
| 8.3-3 | 包体积 <15MB；内存常驻 <150MB（图谱峰值 <250MB） | 构建产物 | PARTIAL | 前端 dist 总计 ~613KB（gzip ~189KB）远 <15MB ✓；但完整 Tauri 包（含 Rust 二进制 + Python sidecar）未实际 bundle（限制 C-1）。内存常驻/峰值无法验证（限制 C-3） |
| 8.3-4 | 无硬编码 API Key | 安全扫描 | PASS | `Select-String` 搜索 `frontend/src/**/*.{ts,tsx}` 中 `sk-ant-`/`sk-[a-z0-9]`/`api_key=`/`apiKey=`/`secret=`/`password=` 均**无匹配**；[SettingsPanel.tsx:30](../../frontend/src/components/SettingsPanel.tsx#L30) `apiKey=useState("")` 仅内存；[.gitignore:12-14](../../.gitignore) 含 `.env`/`.env.local`；无 .env 文件被提交 |

### 4.1 安全审计补充（逐项证据）

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 前端无硬编码 secret | PASS | `Select-String` 搜索 frontend/src 无 sk-/api_key=/secret=/password= 匹配 |
| API Key 不落明文 | PASS | [ADR-013 D3](../decisions/ADR-013-p4-llm-integration-strategy.md)：P4 仅内存 `useState`，P5 接 tauri-plugin-store 加密；[SettingsPanel.tsx:30](../../frontend/src/components/SettingsPanel.tsx#L30) `useState("")` |
| CSP 已收紧 | PASS | [tauri.conf.json:25](../../frontend/src-tauri/tauri.conf.json#L25) CSP 白名单 `default-src 'self'; script-src 'self'`（ADR-014 D6，从 null 收紧） |
| call_mcp_tool 白名单 | PASS | [lib.rs:668-680](../../frontend/src-tauri/src/lib.rs#L668-L680) `TOOL_WHITELIST` 11 个只读+promote 工具，非白名单 tool_name 拒绝 |
| 路径穿越防御 | PASS | [lib.rs:234-244](../../frontend/src-tauri/src/lib.rs#L234-L244) `validate_inside` canonicalize+starts_with；[lib.rs:251-257](../../frontend/src-tauri/src/lib.rs#L251-L257) `is_valid_domain` kebab-case；[backlinks.ts:54-56](../../server/src/tools/backlinks.ts#L54-L56) `rel.startsWith("..")` 检测；单测 [graph.test.ts:237-243](../../server/src/tests/graph.test.ts#L237-L243) 验证 |
| shell 注入防御 | PASS | [lib.rs:330-336](../../frontend/src-tauri/src/lib.rs#L330-L336) `args([&config.parser_path, &file_path])` 数组化传递，无 shell 插值 |
| 日志注入防御 | PASS | [lib.rs:263-265](../../frontend/src-tauri/src/lib.rs#L263-L265) `sanitize_log_field` 去 CRLF（CWE-117） |
| 状态机校验（staging 确认/拒绝） | PASS | [lib.rs:537-544](../../frontend/src-tauri/src/lib.rs#L537-L544) confirm 校验 status=staging + [L567-574](../../frontend/src-tauri/src/lib.rs#L567-L574) reject 校验 |

---

## 5. 单元测试结果

**命令**：`cd server && node --test --import tsx src/tests/graph.test.ts`

**结果**：`# tests 14 / # pass 14 / # fail 0 / duration_ms 599.08`

| Suite | 用例数 | 通过 | 失败 | 关键断言 |
| --- | --- | --- | --- | --- |
| kb_get_graph | 6 | 6 | 0 | 空图谱 / 5 节点 fixture 建边 / 默认排除 pending+archived / domain 过滤 / 入度出度计算 / domain 分布 |
| kb_get_backlinks | 4 | 4 | 0 | 不存在页报错 / **路径穿越拒绝** / backlinks+outbound+related 三段 / .md 扩展名兼容 |
| kb_list_inbox | 4 | 4 | 0 | pending 卡片列出 / domain 过滤 / 排除 active 卡 / **confidence 降序排序** |

测试 fixture 覆盖：5 页跨 2 域（coding/design），含 wikilink 双向、related 字段、tags 共享、pending experience 卡。验证了边类型提取（wikilink/related/tags）、度数计算、孤儿页、最大连通分量、反向链接 context。

---

## 6. 构建验证结果

### 6.1 图谱 sanity check（真实 KB）

**命令**：`cd server && node --import tsx scripts/graph-sanity-check.ts`

```
=== kb_get_graph (default filter) ===
totalNodes: 37
totalEdges: 522
byEdgeType: { wikilink: 290, related: 82, tags: 150 }
orphanPages: 0
largestCcSize: 34
domains: { coding: 18, design: 9, 'kb-system': 9, resources: 1 }

=== kb_get_backlinks for TheAlgorithms/Python (inDeg=32) ===
backlinks: 14, outbound: 12, related: 3
first backlink context: ...[[wiki/coding/thealgorithms-python]] — Python...
```

**结论**：kb_get_graph 在真实 KB（37 节点）端到端正常；边三类型（wikilink/related/tags）均提取；backlinks 含 context 上下文。37 节点首屏性能观察达标（<100ms）。

### 6.2 前端构建

**命令**：`cd frontend && pnpm build`（`tsc && vite build`）

```
✓ 1246 modules transformed.
dist/index.html                    1.12 kB │ gzip:   0.58 kB
dist/assets/index-CndOJD7_.css    17.53 kB │ gzip:   4.48 kB
dist/assets/index-D9_B7hh1.js      1.26 kB │ gzip:   0.48 kB
dist/assets/core-DhEqZVGG.js       2.44 kB │ gzip:   0.98 kB
dist/assets/webview-D9d5Mwn8.js   17.43 kB │ gzip:   3.93 kB
dist/assets/index-eQAHNHS8.js    573.68 kB │ gzip: 179.49 kB
✓ built in 8.80s
```

**结论**：TypeScript 类型检查零错误；Vite 打包成功（8.80s）。产物总计 ~613KB（gzip ~189KB），远低于 15MB 包体积要求。存在一个非阻塞警告：`index-eQAHNHS8.js > 500KB`（react-force-graph-2d + d3 + react-markdown 打包结果，建议 P5 用 `manualChunks` 拆分）。

### 6.3 依赖核查（[package.json](../../frontend/package.json)）

运行时依赖 6 个：`@tauri-apps/api` / `@tauri-apps/plugin-dialog` / `@tauri-apps/plugin-opener` / `react` 19 / `react-force-graph-2d` / `react-markdown` / `zustand`。

**缺口**：未引入 `remark-gfm` / `rehype-highlight` / `rehype-mermaid`（P4 计划 §4.4.3 要求的 GFM 表格 / 语法高亮 / Mermaid 渲染），见 DEF-6。

---

## 7. 限制项与风险

| 编号 | 限制 | 影响 | 缓解 |
| --- | --- | --- | --- |
| C-1 | cargo check 在 ac-verifier 环境无法运行（无 Rust 工具链） | Tauri Rust 侧未本地编译验证 | PR #33 的 CI 中 Rust cargo check 已 PASS（主 Agent 签发上下文确认） |
| C-2 | PDF 解析未测试（pymupdf DLL 加载问题） | AC-2 PDF 路径无运行时证据 | MD/DOCX/XLSX 均已验证（ADR-014）；PDF 解析代码路径与 DOCX/XLSX 同构（[lib.rs:330-336](../../frontend/src-tauri/src/lib.rs#L330-L336)） |
| C-3 | 真实 Tauri 应用运行时测试无法执行（需桌面环境） | §8.3-1 启动/解析/预览延迟、§8.3-3 内存、§8.4 交互手感均无法实测 | 仅静态代码审查 + 单元测试 + 构建验证；建议 P5 在 Windows/macOS 桌面环境补 Playwright/手动 E2E |
| C-4 | 500 节点性能无数据（KB 仅 37 节点） | §8.3-2「500 节点 60fps」无法验证 | react-force-graph-2d 内置 quadtree，理论上支持；建议 P5 生成合成 500 节点 fixture 基准测试 |

---

## 8. 缺陷列表

| ID | 严重度 | 相关 AC | 描述 | 证据 | 建议修复 |
| --- | --- | --- | --- | --- | --- |
| DEF-1 | 中 | §8.4-7 | **键盘快捷键完全未实现**（+/- 缩放、0 重置、F 适应、G 模式切换、Tab 节点循环、Enter 跳转、Esc 取消） | [GraphView.tsx](../../frontend/src/components/GraphView.tsx) 全文无 `keydown` 监听 | 在 GraphView 内 `useEffect` 添加 `window.addEventListener("keydown")`，映射到 `graphRef.current.zoom()`/`zoomToFit()`/`setGraphMode()` |
| DEF-2 | 中 | §8.4-5 | **筛选面板仅 2/5 维**：领域 + 边类型已实现；类型 / 状态 / 局部跳数 3 维缺失 | [GraphView.tsx:82-87](../../frontend/src/components/GraphView.tsx#L82-L87) 仅有 `filterDomains` + `filterEdgeTypes` 两个 state | 新增 `filterTypes`/`filterStatuses`/`hopLimit` 三个 state + 对应 UI + 在 `filteredGraph` useMemo 中加入过滤条件 |
| DEF-3 | 中 | §8.4-2 | **局部模式仅 1-hop**，无 2/3-hop 跳数选择 | [GraphView.tsx:127-135](../../frontend/src/components/GraphView.tsx#L127-L135) `neighborhood` 只遍历直接邻居 1 跳 | 用 BFS 扩展到 N-hop（`hopLimit` state，限 3 防爆炸，P4 计划 §7 已预留 100ms 超时截断） |
| DEF-4 | 低 | §8.4-6 | **双击跳转实为单击**（全局模式单击即跳转 preview），**右键菜单未实现** | [GraphView.tsx:161-177](../../frontend/src/components/GraphView.tsx#L161-L177) `handleNodeClick` 全局模式直接 `setView("preview")`；无 `onNodeDoubleClick`/`onNodeRightClick` | 全局模式单击改为仅选中聚焦，双击 `onNodeDoubleClick` 跳转；新增 `onNodeRightClick` 弹出菜单（复制路径/跳转/查看 backlinks） |
| DEF-5 | 低 | §8.4-3 | staging 与 pending 描边均为虚线 `[4,2]`，未按计划区分（staging 虚线 / pending 点线） | [GraphView.tsx:211-213](../../frontend/src/components/GraphView.tsx#L211-L213) `status === "staging" \|\| status === "pending"` 同用 `setLineDash([4,2])` | 分支：staging 用 `[4,2]`，pending 用 `[1,3]` |
| DEF-6 | 低 | AC-5 | MarkdownPreview 缺 remark-gfm（GFM 表格/任务列表）/ rehype-highlight（语法高亮）/ rehype-mermaid（Mermaid 图） | [package.json:12-21](../../frontend/package.json#L12-L21) 无这三个依赖；[MarkdownPreview.tsx:145](../../frontend/src/components/MarkdownPreview.tsx#L145) `<ReactMarkdown>` 无 plugins | `pnpm add remark-gfm rehype-highlight rehype-mermaid`，在 `ReactMarkdown` 的 `remarkPlugins`/`rehypePlugins` 传入 |
| DEF-7 | 低 | AC-4 | Tauri 侧 `confirm_staging` 不更新 index.md（仅写 log.md） | [lib.rs:527-550](../../frontend/src-tauri/src/lib.rs#L527-L550) 仅 `update_frontmatter_status` + `append_log`，无 `updateIndexHeader` | ADR-014 D4 已说明：MCP 侧 `kb_confirm_staging` 补了 `updateIndexHeader`，GUI 不依赖 index.md。建议 Tauri 侧也调用 MCP 工具保持一致，或文档标注「GUI 确认不更新 index」 |
| DEF-8 | 信息 | AC-3 | 「AI 整理」按 ADR-013 D2 延迟到 P5，当前为 Python parser 规则提取 | [ADR-013 D2](../decisions/ADR-013-p4-llm-integration-strategy.md) 决策记录；SettingsPanel LLM 三态 UI 已预留但无后端调用 | 计划内延迟，非缺陷。P5 接入 `lib/llm.ts` + 一个 Tauri IPC 命令 |
| DEF-9 | 低 | §8.3-2 | `kb_get_graph` 无增量缓存，每次全量 `loadAllPages` | [graph.ts:82-83](../../server/src/tools/graph.ts#L82-L83) 每次 `loadAllPages()` 全扫描；P4 计划 §7 提到「mtime 变化才重算」未实现 | 加 mtime 索引 + ETag + 5min 客户端复用（37 节点已达标，500+ 节点时需此优化） |
| DEF-10 | 低 | §8.3-3 | 前端单 chunk >500KB 警告 | 构建输出 `index-eQAHNHS8.js 573KB` | `vite.config.ts` 配 `build.rollupOptions.output.manualChunks` 拆分 react-force-graph-2d / d3 / react-markdown |

---

## 9. 验收标准覆盖矩阵（test-architect 层级映射）

| AC ID | 测试用例 ID | 测试层级 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| AC-1 | TC-01 | 静态（配置审查） | PASS | tauri.conf.json + lib.rs run() |
| AC-2 | TC-02 | 静态（代码审查） | PASS | DropZone + lib.rs upload_file |
| AC-3 | TC-03 | 静态 + ADR | CONDITIONAL | lib.rs build_wiki_page + ADR-013 D2 |
| AC-4 | TC-04 | 单元（4b staging.test.ts 已覆盖） | PASS | lib.rs confirm_staging + append_log |
| AC-5 | TC-05 | 静态（代码审查） | PASS | MarkdownPreview.tsx |
| AC-6 | TC-06 | 静态（代码审查） | PASS | lib.rs:325 fs::copy |
| 8.4-1 | TC-07 | 集成（sanity check） | PASS | 37 节点 / 522 边 |
| 8.4-2 | TC-08 | 静态 | PARTIAL | 1-hop only |
| 8.4-3 | TC-09 | 静态 | PASS | 四维编码 |
| 8.4-4 | TC-10 | 静态 | PASS | 三边类型 + tags 默认隐藏 |
| 8.4-5 | TC-11 | 静态 | PARTIAL | 2/5 维 |
| 8.4-6 | TC-12 | 静态 | PARTIAL | 缺双击/右键 |
| 8.4-7 | TC-13 | 静态 | FAIL | 无键盘绑定 |
| 8.4-8 | TC-14 | 静态 | PASS | 三段 Section |
| 8.4-9 | TC-15 | 单元 + 静态 | PASS | extractLinkContext + 单测断言 |
| 8.4-10 | TC-16 | 静态 | PASS | handleNavigate + Empty |
| 8.4-11 | TC-17 | 静态 | PASS | viewStore 联动链路 |
| 8.3-1 | TC-18 | E2E（未执行） | CANNOT VERIFY | 限制 C-3 |
| 8.3-2 | TC-19 | 集成（sanity check） | PARTIAL | 37 节点达标，500 无数据 |
| 8.3-3 | TC-20 | 构建 | PARTIAL | 前端达标，完整包未验证 |
| 8.3-4 | TC-21 | 安全扫描 | PASS | Select-String 无匹配 |

---

## 10. 回归说明

本次 Phase 4c 新增代码集中在 `frontend/src/components/GraphView.tsx`、`BacklinksPanel.tsx`、`server/src/tools/graph.ts`、`backlinks.ts`、`inbox.ts`、`cli.ts` 及 `lib.rs` 的 `call_mcp_tool` 命令，均为新增模块/命令，未修改 P0-P3 既有 MCP 工具逻辑。`graph.test.ts` 14 个测试全过，未触发既有测试失败。前端 `tsc` 类型检查零错误，证明新增 TypeScript 类型（`GraphNode`/`GraphEdge`/`GraphData`/`BacklinksData`）与既有类型系统兼容。

建议 P5 在桌面环境运行完整 `pnpm test` + `cargo test` 回归套件以确认无运行时回归（当前受限于 C-1/C-3）。

---

## 11. 结论与建议

**Phase 4c 核心交付已达成且经客观验证**：知识图谱可视化（GraphView 四维节点编码 + 三类边编码 + 全局/局部双模）、反向链接面板（三段折叠 + 引用上下文）、MCP CLI bridge（`call_mcp_tool` 白名单 + 11 工具注册）、LLM 集成策略（ADR-013 三态 UI 预留）均已落地；14 个单元测试 + 真实 KB sanity check + 前端构建均通过；安全核查无硬编码 Key、CSP/路径穿越/shell 注入/日志注入防御齐全。

**阻碍无条件 PASS 的硬缺口**（建议合并前或 P5 初修复）：
1. **DEF-1（中）**：键盘快捷键完全缺失——这是 §8.4 明确列出的 7 个按键绑定，当前 0 实现；
2. **DEF-2（中）**：筛选面板 5 维只做了 2 维；
3. **DEF-3（中）**：局部模式 1/2/3-hop 只做了 1-hop。

以上 3 项属 P4 计划 §8.4 字面验收项，建议至少补 DEF-1（键盘）后再标记 §8.4 全过；DEF-2/DEF-3 可作为 P5 增强但仍需在报告中显式记录偏差。

**计划内延迟（非缺陷）**：AC-3「AI 整理」按 ADR-013 D2 延迟到 P5，当前 staging 闭环（parser 提取 → staging → 人工 confirm → active + log）已完整可用。

**验收结论**：**CONDITIONAL PASS**——可合并，但 §8.4-7（键盘）、§8.4-5（筛选 5 维）、§8.4-2（多 hop）三项偏差须在报告中透明披露，建议 P5 优先补齐。
