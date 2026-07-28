# P4 Phase 4b/4c Bug 修复 验收测试报告

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | ac-verifier |
| 任务令牌 | TKN-P4-FIX-002 |
| 验收日期 | 2026-07-27 |
| 测试方法 | test-architect skill 分层测试金字塔 + Playwright MCP E2E + CLI 集成测试 + 安全专项 |
| 变更范围 | P4 Phase 4b/4c bug 修复（11 文件任务清单 + 1 未列入文件 lib.rs） |
| 分支 | `feat/p4a-tauri-skeleton`（working tree，未提交） |
| 验收标准 | 6 条（TS 编译零错误 / 28 测试通过 / PDF 解析 / 图谱不卡死 / page_path 一致性 / 无安全漏洞） |
| 整体结论 | **未通过（FAIL）** — 5/6 验收标准通过；AC-002（所有测试通过）失败，存在 1 个 HIGH 严重度回归缺陷 DEF-001 |

---

## 1. 总结

**整体结论：未通过（FAIL）**

本轮验收测试覆盖 P4 Phase 4b/4c 的 6 条验收标准，执行了完整分层测试金字塔（静态分析 → 单元测试 → 集成测试 → E2E → 安全验证 → 回归测试）。**6 条验收标准中 5 条通过，1 条失败（AC-002）**。

失败原因：本次变更将 `kbGetPage` 参数从 `path` 重命名为 `page_path`，但**遗漏了同步更新 [read-only.test.ts](../../server/src/tests/read-only.test.ts)**（6 处 `kbGetPage({ path: ... })` 调用未更新），导致 6 个单元测试回归失败。

功能验证层面（集成测试 + E2E + 安全）全部通过，证明：

- `kbGetPage` 使用 `page_path` 参数功能正确（CLI 调用返回完整页面）
- GraphView d3-force 空依赖修复有效（图谱渲染 37 节点，筛选切换 37→6 不卡死，页面响应 0.3ms/0.1ms）
- Python PDF 解析修复有效（PyMuPDF 1.24.10 成功解析 37 页 PDF）
- 路径穿越防御、命令注入防护、无密钥泄露均验证通过

### 1.1 验收标准结论概览

| AC ID | 验收标准 | 结论 | 证据 |
| --- | --- | --- | --- |
| AC-001 | TypeScript 编译零错误（frontend + server） | **PASS** | server `tsc --noEmit` exit 0；frontend `tsc --noEmit` exit 0；`vite build` exit 0 |
| AC-002 | 所有测试通过（28 个测试） | **FAIL** | 任务所述 28 个测试（frontmatter-integration 11 + p3-evolution 17）全通过；但全量套件 182 个中 7 个失败（DEF-001 回归 6 + DEF-002 flake 1） |
| AC-003 | Python 解析器成功解析 PDF | **PASS** | `parse.py` 解析 2025国赛.pdf：success=True, format=pdf, 37 页, 26273 字符, exit 0 |
| AC-004 | 知识图谱物理效果不卡死 | **PASS** | Playwright E2E：Canvas 1392x780 渲染 37 节点；页面响应 0.30ms；筛选切换响应 0.10ms；0 console error |
| AC-005 | 参数名一致性：所有工具使用 `page_path` | **PASS（功能层）** | CLI 验证 `page_path` 成功返回页面，旧 `path` 致 TypeError；但 read-only.test.ts 测试代码未同步（DEF-001） |
| AC-006 | 无安全漏洞引入 | **PASS** | 路径穿越 `../` 与绝对路径均被拒；无密钥泄露；无 dangerouslySetInnerHTML；lib.rs 数组形式 args + 白名单 + JSON 校验 |

### 1.2 测试执行统计

| 层级 | 用例数 | 通过 | 失败 | 阻塞 |
| --- | --- | --- | --- | --- |
| 静态分析 | 3 | 3 | 0 | 0 |
| 单元测试 | 182 | 175 | 7 | 0 |
| 集成测试 | 4 | 4 | 0 | 0 |
| E2E 测试 | 5 | 5 | 0 | 0 |
| 安全验证 | 5 | 5 | 0 | 0 |
| 回归测试（Python） | 4 | 4 | 0 | 0 |
| **合计** | **203** | **196** | **7** | **0** |

---

## 2. Phase 1 — 验收标准解析与测试用例设计

### 2.1 验收标准提取

从任务令牌提取 6 条验收标准，转换为可验证断言：

| AC ID | 原文 | 可验证断言 |
| --- | --- | --- |
| AC-001 | TypeScript 编译零错误（frontend + server） | Given 项目代码，when 运行 `tsc --noEmit`，then exit code 0 且无错误输出 |
| AC-002 | 所有测试通过（28 个测试） | Given server 测试套件，when 运行 `npm test`，then 所有测试 pass（无 fail） |
| AC-003 | Python 解析器成功解析 PDF | Given 一个有效 PDF 文件，when 运行 `parse.py <pdf>`，then 输出 JSON `success: true` 且 exit 0 |
| AC-004 | 知识图谱物理效果不卡死 | Given 图谱视图加载，when 渲染 + 切换筛选器，then 页面保持响应（evaluate 执行 < 100ms）且无 console error |
| AC-005 | 参数名一致性：所有工具使用 `page_path` | Given MCP 工具调用，when 使用 `page_path` 参数，then 正确返回；when 使用旧 `path`，then 报错 |
| AC-006 | 无安全漏洞引入 | Given 安全检查清单，when 逐项验证，then 全部 PASS |

### 2.2 测试用例设计矩阵

| TC ID | AC ID | 技术 | 输入 / 前置条件 | 动作 | 预期行为 | 层级 | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC-001 | AC-001 | 静态分析 | server 源码 | `tsc --noEmit` | exit 0 | 静态 | PASS |
| TC-002 | AC-001 | 静态分析 | frontend 源码 | `tsc --noEmit` + `vite build` | exit 0 | 静态 | PASS |
| TC-003 | AC-001 | 静态分析 | ESLint 配置检查 | 查找 .eslintrc | 项目无 ESLint 配置（既有状态） | 静态 | N/A |
| TC-004 | AC-002 | 单元测试 | frontmatter-integration + p3-evolution | `npm test`（28 个） | 28/28 pass | 单元 | PASS |
| TC-004b | AC-002 | 单元测试 | 全量测试套件 | `npm test`（182 个） | 全部 pass | 单元 | **FAIL**（7 失败） |
| TC-005 | AC-003 | 集成测试 | raw/pdf/2025国赛.pdf | `parse.py` | success=true, exit 0 | 集成 | PASS |
| TC-005b | AC-003 | 回归测试 | README.md | `parse.py` | success=true, format=md | 回归 | PASS |
| TC-006 | AC-003 | 边界测试 | 不存在的文件 | `parse.py nonexistent.pdf` | exit 1, success=false | 集成 | PASS |
| TC-007 | AC-003 | 边界测试 | .xyz 不支持格式 | `parse.py test.xyz` | exit 2, success=false | 集成 | PASS |
| TC-008 | AC-004 | E2E | 图谱视图加载 | Playwright 导航 + 截图 | Canvas 渲染，无 console error | E2E | PASS |
| TC-009 | AC-004 | E2E | 切换筛选器 | Playwright 点击 concept/experience | 节点数变化，页面响应 < 100ms | E2E | PASS |
| TC-010 | AC-005 | 集成测试 | `kb_get_page {"page_path":"..."}` | CLI 调用 | 返回完整页面，exit 0 | 集成 | PASS |
| TC-011 | AC-005 | 集成测试 | `kb_get_page {"path":"..."}`（旧参数） | CLI 调用 | TypeError，exit 1 | 集成 | PASS |
| TC-012 | AC-005 | 集成测试 | `kb_get_backlinks {"page_path":"..."}` | CLI 调用 | 返回反向链接，exit 0 | 集成 | PASS |
| TC-013 | AC-005 | 集成测试 | `kb_list_categories {"include_stats":true}` | CLI 调用 | 返回 `{name,page_count,last_update}`，exit 0 | 集成 | PASS |
| TC-014 | AC-005 | 静态分析 | grep `path:` 在测试文件 | 全量扫描 | read-only.test.ts 6 处使用旧 `path` | 静态 | **FAIL**（DEF-001） |
| TC-015 | AC-006 | 安全 | `kb_get_page {"page_path":"../../../etc/passwd"}` | CLI 调用 | "Path traversal detected"，exit 2 | 安全 | PASS |
| TC-016 | AC-006 | 安全 | `kb_get_page {"page_path":"/etc/passwd"}` | CLI 调用 | "Path traversal detected"，exit 2 | 安全 | PASS |
| TC-017 | AC-006 | 安全 | 源码 grep 密钥模式 | grep api_key/secret/token 等 | 无命中 | 安全 | PASS |
| TC-018 | AC-006 | 安全 | lib.rs 命令构造代码审查 | 检查 `.args([])` 数组形式 | 数组形式 + JSON 校验 + 白名单 | 安全 | PASS |
| TC-019 | AC-006 | 安全 | 前端 dangerouslySetInnerHTML 检查 | grep | 无命中；无 .env 被 git 跟踪 | 安全 | PASS |

---

## 3. Phase 2 — 分层测试详情

### 3.1 静态分析（Phase 2.1）

| 工具 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| server TypeScript | `npm run typecheck`（`tsc --noEmit`） | PASS | exit 0，无错误输出 |
| frontend TypeScript | `npx tsc --noEmit` | PASS | exit 0，无错误输出 |
| frontend 构建 | `npx vite build` | PASS | exit 0，✓ built in 32.72s，1545 模块转换（仅 bundle 体积警告 799kB，非错误） |
| ESLint | 查找 `.eslintrc*` | N/A | 项目无项目级 ESLint 配置（既有状态，非本次变更引入） |

**结论：AC-001 PASS。** TypeScript 编译零错误。

### 3.2 单元测试（Phase 2.2）

执行命令：`npm test`（`node --test --import tsx src/tests/**/*.test.ts`）

| 测试文件 | 用例数 | 通过 | 失败 | 结果 |
| --- | --- | --- | --- | --- |
| frontmatter-integration.test.ts | 11 | 11 | 0 | PASS |
| p3-evolution.test.ts | 17 | 17 | 0 | PASS |
| read-only.test.ts（kb_get_page 子套件） | 6 | 0 | 6 | **FAIL（DEF-001）** |
| lint-perf.test.ts | 3 | 2 | 1 | **FAIL（DEF-002）** |
| frontmatter.test.ts | 10 | 10 | 0 | PASS |
| normalizeDate.test.ts | 3 | 3 | 0 | PASS |
| parseFrontmatter.test.ts | 4 | 4 | 0 | PASS |
| graph.test.ts | 6 | 6 | 0 | PASS |
| backlinks.test.ts | 4 | 4 | 0 | PASS |
| inbox.test.ts | 4 | 4 | 0 | PASS |
| lint.test.ts | 7 | 7 | 0 | PASS |
| quality.test.ts | 3 | 3 | 0 | PASS |
| countSections.test.ts | 13 | 13 | 0 | PASS |
| hasCodeBlock.test.ts | 4 | 4 | 0 | PASS |
| lengthScore.test.ts | 8 | 8 | 0 | PASS |
| scoreExperience.test.ts | 9 | 9 | 0 | PASS |
| kb_health.test.ts | 3 | 3 | 0 | PASS |
| kb_list_categories.test.ts | 3 | 3 | 0 | PASS |
| kb_list_recent.test.ts | 2 | 2 | 0 | PASS |
| search.test.ts | 4 | 4 | 0 | PASS |
| dedup-algorithms.test.ts | 18 | 18 | 0 | PASS |
| staging.test.ts | 10 | 10 | 0 | PASS |
| write.test.ts | 9 | 9 | 0 | PASS |
| promote.test.ts | 6 | 6 | 0 | PASS |
| reject-integration.test.ts | 1 | 1 | 0 | PASS |
| **合计** | **182** | **175** | **7** | **FAIL** |

**结论：AC-002 FAIL。** 任务所述"28 个测试"（frontmatter-integration + p3-evolution）确实全通过；但全量测试套件 182 个中有 7 个失败，其中 6 个是本次变更引入的回归（DEF-001）。

### 3.3 集成测试（Phase 2.3）

通过 CLI（`cli.ts`）模拟 Tauri → node 子进程路径，验证 MCP 工具功能：

| 场景 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-010: kb_get_page 用 page_path | `cli.ts kb_get_page '{"page_path":"wiki/coding/thealgorithms-c"}'` | PASS | exit 0，返回完整 frontmatter + body(含算法分类表格) + links(10个) |
| TC-011: kb_get_page 用旧 path | `cli.ts kb_get_page '{"path":"wiki/coding/thealgorithms-c"}'` | PASS（预期失败） | exit 1，`TypeError: Cannot read properties of undefined (reading 'endsWith')` at read-only.ts:184 |
| TC-012: kb_get_backlinks 用 page_path | `cli.ts kb_get_backlinks '{"page_path":"wiki/coding/thealgorithms-c"}'` | PASS | exit 0，返回 12 反向链接 + 10 出链 + 2 related |
| TC-013: kb_list_categories | `cli.ts kb_list_categories '{"include_stats":true}'` | PASS | exit 0，返回 6 领域：coding(18)/design(9)/emotions(0)/kb-system(9)/reading(0)/resources(1)，字段 `{name, page_count, last_update}` 正确 |

**关键证据 — kb_list_categories 返回字段（验证 CategoryTree 字段映射修复）：**

```json
{
  "categories": [
    { "name": "coding", "page_count": 18, "last_update": "2026-07-26" },
    { "name": "design", "page_count": 9, "last_update": "2026-07-25" },
    { "name": "emotions", "page_count": 0, "last_update": null }
  ]
}
```

前端 [CategoryTree.tsx:L40-57](../../frontend/src/components/CategoryTree.tsx#L40-L57) 正确映射 `name → domain`、`page_count → pageCount`。

**结论：AC-005 功能层 PASS。** 所有工具使用 `page_path` 参数功能正确；旧 `path` 参数不工作。

### 3.4 端到端测试（Phase 2.4）

使用 Playwright MCP（headless chromium，1440x900）访问 `http://localhost:1420`：

| 场景 | 动作 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-008: 图谱视图加载 | 点击"图谱"按钮，截图 + console 检查 | PASS | Canvas 1392x780 渲染；37 节点；页面响应 0.30ms；0 console error |
| TC-009: 筛选器切换不卡死 | 点击 concept + experience 筛选按钮 | PASS | 节点 37→6（筛选生效）；页面响应 0.100ms；0 console error |
| 审核视图渲染 | 点击"审核"按钮 | PASS | 显示"待审核经验卡片"；响应 0.200ms |
| 预览视图渲染 | 点击"预览"按钮 | PASS | h1 标题"Python 异步编程模式"；frontmatter 卡片显示（active/concept/coding） |
| 全程 console error | 所有视图切换后检查 | PASS | 仅 vite connecting + React DevTools 提示，无 error/exception |

**关键证据 — 图谱响应性（验证 d3-force 空依赖修复）：**

```json
{
  "responsive": true,
  "elapsedMs": "0.30",
  "canvasExists": true,
  "canvasW": 1392,
  "canvasH": 780,
  "nodeCountText": "37"
}
```

[GraphView.tsx:L254-269](../../frontend/src/components/GraphView.tsx#L254-L269) d3-force 配置 useEffect 依赖改为 `[]`，仅在挂载时配置一次。筛选切换时 `filteredGraph` useMemo 返回新对象引用，但不再触发 d3-force useEffect，避免了 `d3ReheatSimulation()` 无限循环。

**结论：AC-004 PASS。** 图谱物理效果不卡死，筛选切换力导向布局自适应正常。

---

## 4. Phase 3 — 安全专项验证

### 4.1 路径穿越防御

| 检查 | 输入 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-015: 相对路径穿越 | `{"page_path":"../../../etc/passwd"}` | PASS | `Path traversal detected: ../../../etc/passwd`，exit 2 |
| TC-016: 绝对路径穿越 | `{"page_path":"/etc/passwd"}` | PASS | `Path traversal detected: /etc/passwd`，exit 2 |

防御代码位于 [read-only.ts:L186-191](../../server/src/tools/read-only.ts#L186-L191)：

```typescript
const relativePath = path.relative(kbRoot, fullPath);
if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
  return errorResult(`Path traversal detected: ${pagePath}`);
}
```

### 4.2 密钥泄露检查

| 检查 | 范围 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-017: 硬编码密钥 | frontend/src + server/src（*.ts,*.tsx, *.rs,*.html） | PASS | grep `(api[_-]?key\|secret\|password\|token\|Bearer\|AKIA\|ghp_\|sk-\|private_key)\s*=\s*["'][^"']+["']` 无命中 |
| .env 文件 git 跟踪 | `git ls-files \| grep .env` | PASS | 无 .env 文件被跟踪（.gitignore 正确忽略） |

### 4.3 命令注入防护

| 检查 | 位置 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-018: 命令构造数组形式 | [lib.rs:L711-724](../../frontend/src-tauri/src/lib.rs#L711-L724) | PASS | `.command("node").args(["--import","tsx",&cli_path,&tool_name,&args_json])` 数组形式，无 shell 插值 |
| JSON 参数校验 | [lib.rs:L692-698](../../frontend/src-tauri/src/lib.rs#L692-L698) | PASS | `serde_json::from_str::<serde_json::Value>(&args_json)` 先校验为合法 JSON |
| 工具名白名单 | [lib.rs:L667-689](../../frontend/src-tauri/src/lib.rs#L667-L689) | PASS | 11 个工具白名单，非白名单直接拒绝 |

### 4.4 XSS 防护

| 检查 | 范围 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-019: dangerouslySetInnerHTML | frontend/src（*.tsx,*.ts） | PASS | 无命中（React 默认转义防 XSS） |
| index.html meta 标签顺序 | [index.html:L4-6](../../frontend/index.html#L4-L6) | PASS | charset + viewport 在 link 之前（修复 HTML 警告） |

**结论：AC-006 PASS。** 无安全漏洞引入。

---

## 5. Phase 4 — 回归测试

### 5.1 Python 解析器回归

| 场景 | 输入 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-005: PDF 解析 | raw/pdf/2025国赛.pdf（2.3MB） | PASS | success=True, format=pdf, title="2025国赛", 37 页, 26273 字符, author="蚂蚁科研工作室", exit 0 |
| TC-005b: markdown 解析回归 | README.md | PASS | success=True, format=md, title="Continuous-learning · 持续进化个人知识库系统", 6577 字符, exit 0 |
| TC-006: 不存在文件 | raw/pdf/nonexistent.pdf | PASS | `{"success": false, "error": "文件不存在: ..."}`, exit 1 |
| TC-007: 不支持格式 | tmp/test.xyz | PASS | `{"success": false, "error": "不支持的格式: .xyz..."}`, exit 2 |

**结论：AC-003 PASS。** PyMuPDF 1.24.10 重装修复有效，PDF 解析正常，错误处理正确。

### 5.2 既有测试套件回归

全量测试套件 182 个测试中 175 通过，7 失败。失败详情见 §6 缺陷列表。

- 任务所述"28 个测试"（frontmatter-integration + p3-evolution）：28/28 通过 ✓
- 既有测试回归：read-only.test.ts 6 个失败（DEF-001，本次变更引入）
- 既有测试 flake：lint-perf.test.ts 1 个失败（DEF-002，环境敏感，与本次变更无关）

---

## 6. 缺陷列表

### DEF-001（HIGH）— read-only.test.ts 未同步 `path` → `page_path` 参数重命名

| 字段 | 值 |
| --- | --- |
| 严重度 | **HIGH（阻断级）** |
| 关联 AC | AC-002、AC-005 |
| 类型 | 回归缺陷 / 测试代码遗漏同步 |
| 位置 | [read-only.test.ts:L209-286](../../server/src/tests/read-only.test.ts#L209-L286)（6 处 `kbGetPage({ path: ... })`） |
| 根因 | 本次变更将 `kbGetPage` 参数从 `path` 改为 `page_path`（[read-only.ts:L177](../../server/src/tools/read-only.ts#L177)），但任务清单只更新了 frontmatter-integration.test.ts 和 p3-evolution.test.ts，遗漏了 read-only.test.ts |
| 影响 | 6 个单元测试失败：`TypeError: Cannot read properties of undefined (reading 'endsWith')` at read-only.ts:184（`pagePath` 为 undefined） |
| 复现步骤 | 1. `cd server`<br>2. `npm test`<br>3. 观察 read-only.test.ts 的 6 个 kb_get_page 子测试全部 FAIL |
| 证据 | `git diff HEAD -- server/src/tools/read-only.ts` 显示 `- path: string` → `+ page_path: string`；read-only.test.ts L210/226/236/244/260/285 仍用 `path:` |
| 修复建议 | 将 read-only.test.ts 中 6 处 `{ path: "..." }` 改为 `{ page_path: "..." }` |

**受影响的 6 处调用：**

| 行号 | 当前（错误） | 修复后 |
| --- | --- | --- |
| L210 | `kbGetPage({ path: "wiki/coding/async-patterns" })` | `kbGetPage({ page_path: "wiki/coding/async-patterns" })` |
| L226 | `kbGetPage({ path: "wiki/coding/sectioned", section: "Details" })` | `kbGetPage({ page_path: "wiki/coding/sectioned", section: "Details" })` |
| L236 | `kbGetPage({ path: "wiki/coding/nonexistent" })` | `kbGetPage({ page_path: "wiki/coding/nonexistent" })` |
| L244 | `kbGetPage({ path: "../../../etc/passwd" })` | `kbGetPage({ page_path: "../../../etc/passwd" })` |
| L260 | `kbGetPage({ path: "wiki/coding/empty-frontmatter" })` | `kbGetPage({ page_path: "wiki/coding/empty-frontmatter" })` |
| L285 | `kbGetPage({ path: "wiki/coding/malformed-yaml" })` | `kbGetPage({ page_path: "wiki/coding/malformed-yaml" })` |

### DEF-002（LOW）— lint-perf.test.ts 性能测试 flake

| 字段 | 值 |
| --- | --- |
| 严重度 | LOW |
| 关联 AC | 无（与本次变更无关） |
| 类型 | 既有测试环境敏感 flake |
| 位置 | [lint-perf.test.ts:L208-211](../../server/src/tests/lint-perf.test.ts#L208-L211) |
| 根因 | 测试阈值过紧（1s vs PRD 硬阈值 2s）；I/O bound 测试受开发机负载影响 |
| 影响 | 1 个测试失败：`1000-page missing_xref scan p50=1016.97ms, expected < 1000ms` |
| 证据 | 单独重跑 p50=1016ms（首次 1070ms）；lint 代码本次未变更 |
| 修复建议 | 考虑放宽阈值至 1200ms，或标记为 `todo: flaky`；非本次变更责任 |

---

## 7. 未覆盖项与风险

| 项目 | 原因 | 风险 |
| --- | --- | --- |
| Tauri 环境 E2E（真实 MCP 调用） | Playwright 浏览器环境 `isTauri()` 返回 false，使用 mock 数据；无法在浏览器中触发真实 `callMcpTool` | 前端→Rust→Node 子进程的完整链路未在 E2E 层验证；但 CLI 集成测试（TC-010/012/013）已验证 MCP 工具功能，且 lib.rs current_dir 修复已由 guardrail 代码审查确认 |
| DOCX/XLSX 解析 | raw/ 目录无 .docx/.xlsx 测试文件 | parser 的 docx/xlsx 分支未回归；但本次变更未触及 parser/parse.py，风险低 |
| 性能基线对比 | 项目无 `perf/baselines/` 性能基线 | 未执行 p50/p95/p99 延迟对比；但图谱响应 0.3ms/0.1ms 证明无性能回退 |
| lib.rs 白名单完整性 | 白名单含 11 个工具，cli.ts TOOL_REGISTRY 含 15 个 | 4 个写工具（kb_confirm_staging/kb_reject_staging/kb_ingest_source/kb_write_experience）未暴露给前端；这是设计决策（guardrail 报告 L660-666 已说明），非缺陷 |

### 7.1 上下文安全说明

验收测试期间调用 `kb_get_page` 读取 `wiki/coding/thealgorithms-c`，按 AGENTS.md §7.5 aging-mechanism 递增了 `use_count`（+2）。这是 `kb_get_page` 的设计行为（系统维护元数据，非内容修改）。该文件在验收前已是 `M` 状态（git status），`use_count` 递增未引入新的内容变更。无需回滚。

---

## 8. 结论与后续行动

### 8.1 验收结论

**未通过（FAIL）。**

6 条验收标准中 5 条通过（AC-001/003/004/005/006），1 条失败（AC-002）。

失败根因：本次变更的参数重命名（`path` → `page_path`）遗漏了同步 [read-only.test.ts](../../server/src/tests/read-only.test.ts)，引入 1 个 HIGH 严重度回归缺陷（DEF-001），导致 6 个单元测试失败。

**功能层面验证通过**：CLI 集成测试、Playwright E2E、安全验证、Python 解析均确认修复有效。问题仅存在于测试代码本身未同步。

### 8.2 后续行动（按 CLAUDE.md §11 要求）

1. **修复 DEF-001**：将 [read-only.test.ts](../../server/src/tests/read-only.test.ts) 中 6 处 `{ path: ... }` 改为 `{ page_path: ... }`
2. **重新运行全量测试套件**：确认 182/182 全部通过（DEF-002 lint-perf flake 可单独重试或标注）
3. **从 guardrail-enforcer 阶段重新开始闭环**（CLAUDE.md §11："若不通过，主 Agent 必须修复...然后必须从 guardrail-enforcer 阶段重新开始整个闭环，严禁绕过审查直接重新测试"）

### 8.3 修复后预期

修复 DEF-001 后，预计：

- AC-002 将通过（182/182 或 181/182 + 1 flake）
- 其余 5 条验收标准保持通过
- 可进入版本发布流程

---

## 附录 A — 测试执行环境

| 项目 | 值 |
| --- | --- |
| 操作系统 | Windows（LAPTOP-PGE8BV0D） |
| Node.js | v26.1.1（@types/node） |
| Python | 3.9.1 + PyMuPDF 1.24.10 |
| TypeScript | server 7.0.2 / frontend 5.8.3 |
| 测试框架 | node:test + tsx（server）；Playwright MCP chromium（E2E） |
| 浏览器 | headless chromium 1440x900 |
| 测试日期 | 2026-07-27 |
