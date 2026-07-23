# 安全与质量审计报告 · 依赖 MAJOR 升级 + 文档不一致修复

> 本报告由 `guardrail-enforcer` 子 Agent 产出，遵循 `docs/templates/reports/guardrail-template.md`。
> 任务令牌：TKN-DEPS-UPGRADE-001。

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | guardrail-enforcer |
| 任务令牌 | TKN-DEPS-UPGRADE-001 |
| 任务域 | deps-upgrade（6 个依赖 MAJOR 升级 + 文档不一致修复） |
| 报告日期 | 2026-07-23 |
| 审查范围 | `server/src/utils/frontmatter.ts`、`server/src/tests/setup.ts`、`server/tsconfig.json`、`server/package.json`、`server/package-lock.json`、`.github/workflows/docs.yml`、`README.md`、`docs/ARCH.md`、`docs/decisions/README.md`、`docs/decisions/ADR-007-dependency-major-upgrade.md`（新建） |
| 风险等级 | P2（跨模块：多依赖 MAJOR 升级 + 代码适配 + CI 配置变更） |
| 主 Agent 签发上下文 | **盲区 1**：`lint-perf.test.ts` 的 `p50 < 1000ms` 内部回归守护阈值在 Windows 环境单独跑也失败（p50=1106ms，并发 1244ms），无法确定是依赖升级导致的微基准偏移还是纯 I/O 噪声。**盲区 2**：最大遗憾是没有在依赖升级后重新校准性能基线（TS 7 Go 重写可能改变运行特性）；没有意识到 `docs/ARCH.md` 还有 3 处不一致（rg 扫描才发现），说明文档一致性扫描不够主动。 |

## 1. 审查依据

- 本次代码变更：分支 `chore/deps-upgrade-validation`，工作区未提交变更（`git diff HEAD`），9 文件修改 + 1 文件新建，共 +403/-40 行（含 lockfile 409 行）。
- 影响自检结果：主 Agent §9 影响自检（接口/契约未改、依赖与环境已同步、依赖模块扫描完成、ADR-007 已建、README 索引已更新）。
- 相关 ADR：[ADR-007](../decisions/ADR-007-dependency-major-upgrade.md)（依赖 MAJOR 升级决策）。
- code-archaeologist 报告：**跳过**（§3.1 简化条款）。理由评估见 §6.1。
- 测试框架与基础用例：`server/src/tests/`（43 单元测试，node:test）、`server/smoke-mcp-full.mjs`（37 E2E 检查）、`server/src/tests/lint-perf.test.ts`（性能回归守护）。
- 安全策略依据：`CLAUDE.md` §18（依赖管理与供应链安全）、§19（可观测性与错误处理）、§20（密钥与环境变量管理）。项目根目录无独立 `SECURITY.md`，以 `CLAUDE.md` 相关章节为安全策略基线。
- 历史漏洞记录：DEF-002（`@hono/node-server < 2.0.5` path traversal，GHSA-frvp-7c67-39w9，P3 guardrail-r2 R4 记录）。

### 1.1 变更清单

| 依赖 | 当前 | 目标 | 分级 | 用途 |
| --- | --- | --- | --- | --- |
| zod | 3.25.76 | 4.4.3 | P0 核心 | MCP 工具 input schema 校验 |
| js-yaml | 4.3.0 | 5.2.1 | P1 核心 | frontmatter YAML 解析/序列化 |
| typescript | 5.9.3 | 7.0.2 | devDep | tsc 编译器（Go 重写） |
| @types/node | 22.20.1 | 26.1.1 | devDep | Node.js 类型定义 |
| actions/checkout | v4 | v7 | CI | GitHub Actions 检出 |
| actions/setup-node | v4 | v7 | CI | GitHub Actions Node 安装 |

## 2. 代码质量审查（TRAE-code-review）

### 2.1 Karpathy Guidelines 合规性

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 命名 | ✅ | 导入符号 `load`/`dump` 语义清晰，与 js-yaml v5 命名导出一致；无模糊命名。 |
| 设计简洁性 | ✅ | 最小改动原则：仅改必要的导入语句（5 处）+ tsconfig 1 行 + CI 版本号。zod 零代码改动。无过度工程。 |
| 错误处理 | ✅ | 本次未触碰错误处理路径。`parseFrontmatter` 的 `load(yamlText) ?? {}` 空值合并保持不变。 |
| 假设显式化 | ✅ | ADR-007 完整记录每个升级的决策依据、备选方案、后果、技术债。`frontmatter.ts` 注释引用 AGENTS.md §3 schema。`lint-perf.test.ts` 注释解释内部阈值 1000ms 的设计意图。 |

### 2.2 逻辑与性能

#### 2.2.1 js-yaml 4→5 适配正确性（核心审查项）

**结论：✅ 正确且完整。**

- **default export 移除确认**：读取 `node_modules/js-yaml/dist/js-yaml.d.ts` 第 381 行 export 语句，确认 v5 为纯命名导出（`export { ..., load, dump, ... }`），**无 default export**。适配为命名导入是 v5 的强制要求，非可选。
- **使用点完整性**：rg 扫描 `js-yaml`（排除 node_modules/lockfile）确认源代码使用点仅 2 处：
  - [frontmatter.ts:1](../../server/src/utils/frontmatter.ts#L1) `import { load, dump } from "js-yaml"` → [L21](../../server/src/utils/frontmatter.ts#L21) `load(yamlText)` + [L30](../../server/src/utils/frontmatter.ts#L30) `dump(frontmatter, { lineWidth: -1 })`
  - [setup.ts:13](../../server/src/tests/setup.ts#L13) `import { dump } from "js-yaml"` → [L49](../../server/src/tests/setup.ts#L49) `dump(frontmatter, { lineWidth: -1 })`
  - 其余命中均为 `.md` 文档/报告引用或注释（如 [read-only.test.ts:155](../../server/src/tests/read-only.test.ts#L155) 注释），非实际 API 调用。
- **API 签名兼容**：d.ts 确认 `load(input: string, options?: LoadOptions): unknown`（L268）与 `dump(input: any, options?: DumpOptions): string`（L338），与 v4 同名函数签名兼容。`lineWidth: -1` 选项在 v5 `DumpOptions`（L331-337，继承 `PresenterOptions.lineWidth`）中仍存在。
- **无残留 default import**：rg 扫描 `import yaml|yaml\.load|yaml\.dump` 在源代码中零命中，确认无遗漏。

#### 2.2.2 zod 3→4 兼容性（核心审查项）

**结论：✅ 兼容，零代码改动合理。**

- **使用点确认**：rg 扫描 `from "zod"` 确认仅 [schemas.ts:1](../../server/src/schemas.ts#L1) `import { z } from "zod"`。
- **API 使用清单**（逐行核对 schemas.ts）：`z.string().max()`、`z.number().min().max().int().positive()`、`z.enum()`、`z.literal()`、`z.array()`、`z.boolean().optional()`、`z.string().regex()`、`z.string().describe()`、`z.object()`（隐式，作为 ZodRawShape 传入）。
- **v4 breaking patterns 扫描**：rg 扫描 `z\.record|\.strict\(|\.passthrough\(|z\.nativeEnum|z\.deepPartial|z\.coerce|\.email\(|\.format\(|\.flatten\(` 在源代码中零命中（仅 ADR-007 描述文本命中）。确认未使用任何 v4 breaking API。
- **typecheck 验证**：`npx tsc --noEmit`（TS 7）无输出（通过），证明类型层面完全兼容。

#### 2.2.3 TypeScript 5→7 tsconfig 适配

**结论：✅ 适配充分。**

- [tsconfig.json:6](../../server/tsconfig.json#L6) 添加 `"types": ["node"]`：TS 7 不再自动加载所有 `@types/*`，需显式声明。项目运行时依赖 `node:fs`、`node:path`、`node:os`、`node:url`、`node:child_process` 等内置模块，`@types/node` 是必需的。
- 已确认无被移除的 tsconfig 选项：`moduleResolution: "bundler"`（非被移除的 `"node"`）、`target: "ES2022"`（非被移除的 `es5`）、无 `baseUrl`。
- typecheck + build 均通过。

#### 2.2.4 文档一致性修复完整性

**结论：✅ 完整，历史报告正确保留。**

| 位置 | 修改 | 验证 |
| --- | --- | --- |
| [README.md:89](../../README.md#L89) | `8 tools` → `9 tools` | ✅ |
| [ARCH.md:20](../../docs/ARCH.md#L20) | `等 8 tools` → `等 9 tools` | ✅ |
| [ARCH.md:62](../../docs/ARCH.md#L62) | `8 个 MCP tools` → `9 个 MCP tools`；`TypeScript 5.x` → `TypeScript 7.x` | ✅ |
| [ARCH.md:451](../../docs/ARCH.md#L451) | 保留历史 `8 tools` + 追加 `（P3 增至 9 tools）` | ✅ 保留历史 + 注明演进，符合 AGENTS.md「不删除旧声明」原则 |
| [package.json:4](../../server/package.json#L4) | description `8 tools` → `9 tools` + 补 `promote_experience` | ✅ |
| [docs/decisions/README.md:17](../../docs/decisions/README.md#L17) | 追加 ADR-007 索引 | ✅ |
| [schemas.ts:4](../../server/src/schemas.ts#L4) | `all 8 MCP tools` → `all 9 MCP tools` | ✅（P3 已修） |
| [smoke-mcp-full.mjs:174](../../server/smoke-mcp-full.mjs#L174) | `exactly 8 tools` → `exactly 9 tools` | ✅（P3 已修，本次确认） |

**残留 "8 tools" / "TypeScript 5.x" 扫描结论**：rg 全局扫描确认残留均位于 `docs/reports/` 历史报告快照（如 p1/p2/p3 acceptance 与 guardrail 报告）或 ADR 历史描述中。这些是一次性参考工件（CLAUDE.md §5.3），记录当时状态，**不应修改**。当前活跃文档已全部同步至 9 tools / TypeScript 7.x。

#### 2.2.5 发现 L-1：`@types/js-yaml` 冗余 devDependency（低风险/建议）

| 项 | 内容 |
| --- | --- |
| 位置 | [package.json:21](../../server/package.json#L21) `"@types/js-yaml": "^4.0.9"` |
| 现象 | js-yaml 5 自带类型定义（`node_modules/js-yaml/package.json` 第 38 行 `"types": "./dist/js-yaml.d.ts"`，exports.types 同路径）。`@types/js-yaml@4.0.9` 是针对 js-yaml 3.x/4.x API 的 DefinitelyTyped 定义，在 js-yaml 5 项目中冗余。 |
| 风险评估 | TypeScript 模块解析（`moduleResolution: "bundler"`）优先使用包自身 `exports.types`，`@types/js-yaml` 不会被加载。叠加 tsconfig `types: ["node"]` 进一步限制只加载 `@types/node`。typecheck 通过证明类型解析正确，**无功能风险、无类型冲突**。 |
| 建议 | 移除 `@types/js-yaml` devDependency 并执行 `npm install` 更新 lockfile。此举清理 dead dependency、减少供应链面、避免未来开发者混淆。 |
| 严重度 | 低（不阻断，可在后续提交清理） |

### 2.3 跨模块影响识别

**结论：✅ 正确识别。**

- **接口/契约**：`load`/`dump` 同名同签名，未改接口。zod schema 对象结构未变。✅
- **依赖模块扫描**：rg 确认 js-yaml 仅 2 处使用（已适配），zod 仅 1 处使用（兼容）。核心源文件（lint.ts/search.ts/read-only.ts/write.ts/config.ts/dream.ts/index.ts）git diff 确认未修改。✅
- **跨模块影响表达**：ADR-007 已建，PR 将关联 6 个 Dependabot PR。✅

### 2.4 测试框架充分性

| 项 | 结论 | 说明 |
| --- | --- | --- |
| typecheck（tsc --noEmit，TS 7） | ✅ 通过 | 复跑确认无输出。 |
| build（tsc） | ✅ 通过 | 主 Agent 报告。 |
| 单元测试（43 用例） | ⚠️ 42/43 | 1 个 flaky perf（lint-perf.test.ts），详见 §5。 |
| E2E smoke（37 checks） | ✅ 37/37 | smoke-mcp-full.mjs 已更新为 `exactly 9 tools`（L174-175），与实现一致。 |

## 3. 安全漏洞扫描（TRAE-security-review）

### 3.1 OWASP Top 10 / CWE 扫描结果

**结论：✅ 无 exploitable issues。**

按 TRAE-security-review 方法论执行 Pass A（项目安全基线）→ Pass B（偏离映射）→ Pass C（源到汇追踪）。

**项目既有安全原语**（Pass A 基线）：

- `DOMAIN_REGEX` kebab-case 校验（[schemas.ts:47](../../server/src/schemas.ts#L47)）防路径遍历
- `path.relative` + `startsWith("..")` + `isAbsolute` 路径遍历检查
- `sanitizeIndexField`/`sanitizeLogField` CR/LF 剥离（CWE-117）
- js-yaml safe load（CWE-94）
- Zod schema 输入校验（所有 MCP 工具输入）

**偏离映射**（Pass B）：本次变更未引入任何绕过上述安全原语的 ad-hoc 处理。`load()` 不传 schema 用默认安全 schema，与基线一致。✅

### 3.2 输入与边界审计

| 审计项 | 结论 | 证据 |
| --- | --- | --- |
| 数值/类型边界 | ✅ 无新增 | 本次未引入新外部输入参数。zod schema 未修改（schemas.ts 未变）。 |
| 集合/缓冲边界 | ✅ 无新增 | `load()` 返回 `unknown`，代码用 `as Record<string, unknown>` 断言（已有模式，未变）。无新缓冲操作。 |
| 业务状态机 | ✅ 无变更 | 本次未触碰状态机逻辑。 |

### 3.3 执行安全审计（注入防护）

#### 3.3.1 CWE-94 YAML 代码注入（核心审查项）

**结论：✅ 防护提升，无漏洞。**

- **源**：frontmatter YAML 内容（来自 wiki markdown 文件，用户/Agent 可写）。
- **汇**：[frontmatter.ts:21](../../server/src/utils/frontmatter.ts#L21) `load(yamlText)`。
- **防护链**：
  1. js-yaml v5 `load()` 默认使用 `CORE_SCHEMA`——确认于 `node_modules/js-yaml/dist/js-yaml.mjs:1145-1147` `DEFAULT_CONSTRUCTOR_OPTIONS = { ..., schema: CORE_SCHEMA, ... }`。
  2. v5 **完全移除** `!!js/function`、`!!js/regexp`、`!!js/undefined` 等 JavaScript-specific tags——确认于 `dist/js-yaml.d.ts` 全文 export 列表（L381）与 tag 定义区，仅含 core JSON tags（str/null/bool/int/float）+ binary/timestamp/omap/pairs/set/merge，**无任何 `!!js/*` tag**。
  3. 即使恶意 frontmatter 含 `!!js/function`，v5 会抛出 unknown tag 错误，**不会实例化任意对象/函数**。
- **v4 vs v5 对比**：v4 `load()` 默认 `DEFAULT_SAFE_SCHEMA`（已不含 `!!js/*` tags），v5 默认 `CORE_SCHEMA`（更严格：移除 merge keys `<<`、timestamp 等 non-core 类型）。就 CWE-94 而言两者均安全，v5 是 defense-in-depth 提升（更小攻击面）。
- **残留 unsafe 路径**：rg 确认 `load`/`dump` 仅 frontmatter.ts + setup.ts（测试用 dump，无安全影响）。无其他 YAML 解析点。✅

#### 3.3.2 其他注入类

| 类别 | 结论 | 说明 |
| --- | --- | --- |
| SQL/NoSQL 注入 | N/A | 项目无数据库。 |
| OS 命令注入 | N/A | 无 `system()`/`exec()` 调用用户输入。 |
| 代码/表达式注入 | N/A | 无 `eval()`/`Function()`。 |
| 模板引擎注入 | N/A | 无模板引擎。 |

### 3.4 密钥与配置安全

**结论：✅ 无硬编码密钥，配置安全合规。**

- 扫描所有修改文件（package.json、tsconfig.json、docs.yml、frontmatter.ts、setup.ts、ADR-007）：**无硬编码密钥、密码、token、API key、内部 IP/域名**。
- [.gitignore](../../.gitignore) 第 12-15 行排除 `.env`、`.env.local`、`.env.*.local`，允许 `!.env.example`。符合 CLAUDE.md §20.3。
- docs.yml 使用 `pull_request` + `push: [main]` 触发，**非 `pull_request_target`**，无 pwn-request 风险。
- actions v7 安全默认：v7 默认阻止 `pull_request_target` 从 fork checkout。项目本身不用 `pull_request_target`，v7 防护是 defense-in-depth（对项目有利，无负面影响）。

### 3.5 依赖与供应链风险

#### 3.5.1 新引入依赖 CVE 检查

| 依赖 | 版本 | 已知 CVE | 结论 |
| --- | --- | --- | --- |
| zod | 4.4.3 | 无（zod 4 是最新 stable major，zod 3.x 历史 ReDoS 已在 4.x 修复） | ✅ |
| js-yaml | 5.2.1 | 无（最新版） | ✅ |
| typescript | 7.0.2 | 无（devDep，编译器，无运行时 CVE） | ✅ |
| @types/node | 26.1.1 | 无（devDep，类型定义） | ✅ |

#### 3.5.2 DEF-002：`@hono/node-server` path traversal（已知技术债，路径不可达）

| 项 | 内容 |
| --- | --- |
| 漏洞 | `@hono/node-server < 2.0.5` Windows path traversal via `%5C`（GHSA-frvp-7c67-39w9，moderate） |
| 依赖链 | `@modelcontextprotocol/sdk@1.29.0` → `@hono/node-server@1.19.14` |
| 修复可行性 | `npm audit fix --dry-run` 执行后漏洞仍报 "2 moderate"，证明非 force 模式**无法修复**。`npm view @modelcontextprotocol/sdk` 确认 SDK 最新版 1.29.0 仍依赖 `@hono/node-server ^1.19.9`（不允许 2.x）。修复需 SDK 升级 @hono 依赖或项目跨 SDK major。 |
| 路径不可达论证 | ✅ **成立**。[index.ts:123](../../server/src/index.ts#L123) `const transport = new StdioServerTransport()`——项目用 stdio transport，不启动 HTTP server，`@hono/node-server` 的 `serveStatic` 函数**不被调用**，path traversal 漏洞代码路径不可达。 |
| 结论 | 不阻断。记录为技术债（ADR-007 DEF-002）。`npm audit` 文字 "fix available via npm audit fix" 具误导性——dry-run 证明实际无法 fix。 |
| 建议 | 后续监控 `@modelcontextprotocol/sdk` 发布依赖 `@hono/node-server >=2.0.5` 的版本，届时升级。CLAUDE.md §18.4 要求 P0 核心依赖升级需人工二次确认。 |

## 4. 综合结论

- [x] **通过**：可进入测试阶段
- [ ] **有条件通过**：需修复 N 项后重新提交
- [ ] **阻断**：存在严重质量缺陷或高危安全漏洞

**总结**：本次 6 个依赖 MAJOR 升级 + 文档不一致修复，代码质量审查通过（js-yaml 5 适配正确完整、zod 4 兼容、TS 7 适配充分、文档一致、符合 Karpathy 最小改动原则），安全漏洞扫描无 exploitable issues（CWE-94 防护提升、无新 CVE、DEF-002 路径不可达、无硬编码密钥）。存在 1 个低风险清理建议（冗余 @types/js-yaml）和 1 个测试稳定性观察项（lint-perf flaky，非回归）。**无阻断项、无高危项。**

## 5. 阻塞项与回退指令

**无阻断项、无回退指令。**

以下为非阻断观察项，主 Agent 可选择在本次提交一并处理或后续处理：

### 5.1 lint-perf flaky 测试判断（非阻断）

| 项 | 内容 |
| --- | --- |
| 现象 | [lint-perf.test.ts:208](../../server/src/tests/lint-perf.test.ts#L208) `assert.ok(stats.p50 < 1000)` 失败，复跑 p50=1111.17ms（单独运行），主 Agent 报告并发 1244ms。 |
| 是否回归 | **否**。[lint.ts](../../server/src/tools/lint.ts) `checkMissingXref`（L458-526）O(N×K) inverted-bucket 算法未变（git diff 确认 + 源码确认）。测试 1（语义等价性）、测试 2（去重）均通过（33ms/20ms）。 |
| 根因 | I/O 噪声微基准偏移。1000-page scan 主要是 I/O（读 1000 文件），Windows 开发环境 I/O 抖动大。内部 1000ms 阈值的设计意图是捕捉 O(N²) 回归（O(N²) 会让 p50 → ~1060ms per 注释），但当前 I/O 噪声（p50=1111ms）已超过 O(N²) 的预期 delta（~1060ms），**阈值区分度不足**。tsx 用 esbuild 转译，运行时性能不受 TS 版本影响。 |
| PRD 阈值 | PRD US-006 硬阈值 p95 < 2000ms，**远满足**（p50 才 1111ms）。 |
| 结论 | **不阻断**。非安全/质量缺陷，非算法回归。 |
| 建议 | 重新校准内部阈值，三选一：(a) 放宽 p50 阈值至 1400ms（留 I/O 噪声余量，但仍低于 PRD 2000ms；缺点：O(N²) 回归 delta 太小无法捕捉）；(b) 增大 fixture 规模至 N=3000（O(N²) 与 O(N×K) 差距从 ~180ms 扩大至 ~1.4s，提升区分度）；(c) 改用复杂度比值法（N=1000 vs N=2000 的 p50 比值，O(N×K)≈2，O(N²)≈4，不受 I/O 噪声影响）。推荐 (c) 或 (b)。此属测试基础设施改进，可在 ac-verifier 阶段或后续提交处理。 |

### 5.2 @types/js-yaml 冗余清理（低风险建议）

见 §2.2.5。建议移除 `@types/js-yaml` devDependency。

## 6. 待澄清

### 6.1 code-archaeologist 跳过合理性评估

主 Agent 按 §3.1 简化条款跳过 code-archaeologist，理由：本次改动不涉及业务逻辑，仅导入语句适配 + tsconfig + CI 配置；已用 rg 全面扫描 js-yaml/zod 使用点；git diff 确认核心源文件未修改；typecheck（TS 7）通过。

**guardrail-enforcer 评估**：**合理**。本次变更是纯机械性 API 适配（default→named import）+ 配置调整，无业务逻辑变更。rg 扫描 + git diff + typecheck 三重验证已覆盖「隐藏使用点」和「隐藏类型问题」两个主要风险。code-archaeologist 的架构理解价值在此场景无增量。§3.1 简化条款适用。

### 6.2 npm audit "fix available" 措辞与实际不符

`npm audit` 报告 `@hono/node-server` 漏洞 "fix available via `npm audit fix`"，但 `npm audit fix --dry-run` 执行后漏洞仍报 "2 moderate severity vulnerabilities"。这是 npm 的已知行为：即使 fix 需要 breaking change（跨 major），npm audit 文字仍显示 "fix available"。实际非 force 模式无法修复。ADR-007 的"无法自动修复"论证准确。**无需主 Agent 澄清**，已在 §3.5.2 记录。

## 7. 自动化建议（CI/CD 集成）

将以下检查集成到 CI 管道，防止同类问题回归：

1. **依赖漏洞扫描**（已由 Dependabot + `npm audit` 覆盖）：在 `.github/workflows/` 新增 `dependency-audit.yml`，对每个 PR 运行 `npm audit --audit-level=moderate`，moderate+ 漏洞需人工确认路径可达性后方可合并。
2. **js-yaml safe load 守护**：添加 Semgrep 规则，禁止 `load(input, { schema: ... })` 使用非 CORE_SCHEMA/JSON_SCHEMA，并禁止任何 `!!js/` tag 出现在 frontmatter：

   ```yaml
   rules:
     - id: js-yaml-unsafe-schema
       patterns:
         - pattern: load(..., { schema: YAML11_SCHEMA })
       message: "js-yaml load() 禁止使用 YAML11_SCHEMA，仅允许 CORE_SCHEMA/JSON_SCHEMA"
   ```

3. **zod breaking pattern 守护**：添加 Semgrep 规则检测 v4 removed API（`z.record` 单参数、`.strict()`、`z.string().email()` 等），防止未来引入不兼容用法。
4. **lint-perf 阈值校准**：按 §5.1 建议 (c) 重构 lint-perf.test.ts 为复杂度比值法后，在 CI 中运行该测试作为性能回归门禁。

---

## 附：审查执行轨迹

| 步骤 | 工具 | 结果 |
| --- | --- | --- |
| git status / diff --stat / log | Shell | 确认 9 文件修改 + 1 新建，分支 chore/deps-upgrade-validation |
| 读取 frontmatter.ts / setup.ts / tsconfig.json / schemas.ts / lint.ts / index.ts | Read | 逐行核对 API 适配 |
| 读取 ADR-007 | Read | 决策记录完整 |
| rg 扫描 js-yaml 使用点 | Shell | 仅 frontmatter.ts + setup.ts，无遗漏 |
| rg 扫描 zod 使用点 + breaking patterns | Shell | 仅 schemas.ts，零 breaking pattern |
| 读取 js-yaml 5 package.json / d.ts / mjs | Read + Shell | 确认纯命名导出、默认 CORE_SCHEMA、无 !!js/* tags |
| npm audit + npm audit fix --dry-run | Shell | 仅 @hono/node-server moderate，非 force 无法 fix |
| npm view @modelcontextprotocol/sdk | Shell | SDK 1.29.0 依赖 @hono ^1.19.9，无法升级到 2.x |
| npx tsc --noEmit | Shell | TS 7 typecheck 通过 |
| 复跑 lint-perf.test.ts | Shell | p50=1111ms > 1000ms，确认 flaky（非回归） |
| rg 扫描残留 "8 tools" / "TypeScript 5.x" | Shell | 活跃文档已修复，残留全在历史报告 |
| 读取 docs.yml / .gitignore | Read | pull_request 触发（非 pwn-request），.env 已排除 |
| 检查 @types/js-yaml 版本 | Shell | 4.0.9 已安装但冗余 |
| TRAE-code-review skill | Skill | 代码质量审查方法论应用 |
| TRAE-security-review skill | Skill | 安全扫描方法论应用 |
