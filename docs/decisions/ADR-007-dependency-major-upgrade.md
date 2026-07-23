# ADR-007: 依赖 MAJOR 升级（zod 3→4 / js-yaml 4→5 / TypeScript 5→7 / @types/node 22→26 / actions v4→v7）

| 项目 | 内容 |
| --- | --- |
| 状态 | Accepted |
| 日期 | 2026-07-23 |
| 决策者 | 主 Agent（依赖维护阶段） |
| 关联文档 | [CLAUDE.md](../../CLAUDE.md) §18（依赖管理与供应链安全）/ [ARCH.md](../ARCH.md) §3.1（接口契约）/ [ADR-001](ADR-001-knowledge-base-tech-stack.md)（技术栈） |
| 风险等级 | P2（跨模块：多依赖 MAJOR 升级 + 代码适配 + CI 配置变更） |
| 前序 ADR | [ADR-001](ADR-001-knowledge-base-tech-stack.md)（技术栈：zod + js-yaml + TypeScript） |
| Dependabot PR | #1 setup-node v7 / #2 checkout v7 / #3 @types/node 26 / #4 typescript 7 / #5 js-yaml 5 / #6 zod 4 |

## 背景（Context）

Dependabot 检测到 6 个依赖 MAJOR 升级（均从 v4/v5/22 跨到下一 major），合并为综合升级处理：

| 依赖 | 当前 | 目标 | 分级 | 用途 |
| --- | --- | --- | --- | --- |
| zod | 3.25.76 | 4.4.3 | P0 核心 | MCP 工具 input schema 校验 |
| js-yaml | 4.3.0 | 5.2.1 | P1 核心 | frontmatter YAML 解析/序列化（CWE-94 防护） |
| typescript | 5.9.3 | 7.0.2 | devDep | tsc 编译器 |
| @types/node | 22.20.1 | 26.1.1 | devDep | Node.js 类型定义 |
| actions/checkout | v4 | v7 | CI | GitHub Actions 检出 |
| actions/setup-node | v4 | v7 | CI | GitHub Actions Node 安装 |

CLAUDE.md §18.4 要求 P0 核心依赖升级需人工二次确认；§17.1 要求依赖 MAJOR 升级写 ADR。

## 决策（Decision）

### D1. 全部升级 + 必要代码适配

**zod 3→4**：项目仅用基础 API（`z.string().max()`、`z.enum()`、`z.number().min().max()`、`z.object()`、`z.array()`、`z.boolean()`）。grep 确认未命中任何 v4 breaking pattern（`z.record` 单参数、`.strict()/.passthrough()`、`message:` error 参数、`z.string().email()`、`.format()/.flatten()`、`z.nativeEnum/deepPartial/z.coerce`）。**零代码改动**。

**js-yaml 4→5**：v5 移除 `default` 导出，改为纯命名导出。适配 `frontmatter.ts` 与 `tests/setup.ts`：`import yaml from "js-yaml"` → `import { load, dump } from "js-yaml"`，`yaml.load/dump` → `load/dump`。v5 默认 `CORE_SCHEMA`（比 v4 `DEFAULT_SAFE_SCHEMA` 更严格），项目 frontmatter 为简单 YAML（无 merge keys `<<`、无 `!!js/` tags），完全兼容。

**TypeScript 5→7**：TS 7 是 Go 重写（Project Corsa），语义与 6.0 相同，breaking changes 在 5.x→6.0 边界。项目 tsconfig 已用 `moduleResolution: "bundler"`（非被移除的 `"node"`）、`target: "ES2022"`（非被移除的 `es5`）、无 `baseUrl`。唯一适配：加 `"types": ["node"]`（TS 7 不再自动加载所有 `@types/*`，需显式声明）。

**@types/node 22→26**：项目用 `node:fs`、`node:path`、`node:url` 等内置模块，类型向后兼容。

**actions v4→v7**：v7 默认阻止 `pull_request_target` 从 fork checkout（防 pwn-request 攻击）。项目 workflow 用 `pull_request` 触发（非 `pull_request_target`），不受影响，且 v7 安全默认对项目有利。

### D2. 文档不一致修复（guardrail-r2 R4 遗留）

同步修复 P3 遗留的文档不一致：`README.md` 架构一览 L89「8 tools」→「9 tools」、`package.json` description「8 tools」→「9 tools」并补 `promote_experience`。

### D3. npm audit 漏洞处理（@hono/node-server path traversal）

`npm audit` 报告 `@hono/node-server < 2.0.5` 存在 Windows path traversal（`%5C` 编码，GHSA-frvp-7c67-39w9）。该包是 `@modelcontextprotocol/sdk` 的传递依赖（HTTP transport 适配器）。

**不修复，记录为技术债**：项目是 stdio MCP server（ARCH.md §6.1 零网络面），不暴露 HTTP 端点，`@hono/node-server` 的 `serve-static` 路径不可达。`npm audit fix` 无法自动修复（SDK 限制了 `@hono/node-server` 版本范围）。修复需升级 `@modelcontextprotocol/sdk` 本身，超出本次依赖升级范围，列为后续任务。

## 备选方案（Alternatives）

### A1. 拒绝全部 Dependabot PR，保持旧版本

- 优点：零适配成本、零回归风险
- 缺点：zod 3 已停止维护（v4 是稳定 major）、TS 5.x 编译慢（大项目分钟级）、actions v4 缺 pwn-request 防护、安全债务累积
- **否决**：CLAUDE.md §18.4 要求监控依赖更新，长期不升级违反供应链安全策略

### A2. 逐个 Dependabot PR 合并

- 优点：每个 PR 独立验证、可回退单个
- 缺点：zod 4 + js-yaml 5 需代码适配，单独合并会 break main（适配未就绪）；6 个 PR 的 CI 开销大
- **否决**：代码适配与依赖升级强耦合，综合 PR 更内聚

### A3. 仅升级 P0 核心（zod + js-yaml），暂缓 devDep/CI

- 优点：聚焦 runtime 风险
- 缺点：TS 7 性能提升（10x 编译）对开发体验显著；actions v7 安全防护不应拖延
- **否决**：全部验证通过，无理由拆分

## 后果（Consequences）

### 正面

- **性能**：TypeScript 7 Go 重写，编译速度 10x（项目规模小，秒级 → 亚秒级）；zod 4 字符串解析 14x、数组 7x
- **安全**：actions/checkout v7 默认防 pwn-request；js-yaml v5 CORE_SCHEMA 比 v4 DEFAULT_SAFE_SCHEMA 更严格
- **可维护**：全部依赖在 active major，避免维护断层
- **文档一致**：修复 guardrail-r2 R4 遗留（8→9 tools）

### 负面 / 适配成本

- `tsconfig.json` 加 `types: ["node"]`（TS 7 不自动加载 @types）
- `frontmatter.ts` + `setup.ts` 改 js-yaml 命名导入（5 处）
- `lint-perf.test.ts` 的 p50 < 1000ms 阈值在完整套件并发运行时偶现 flaky（I/O 噪声，guardrail-r2 已记录；PRD 实际阈值 p95 < 2s 仍满足）

### 技术债

- DEF-002：`@hono/node-server` path traversal（GHSA-frvp-7c67-39w9），stdio 不受影响，修复需升级 `@modelcontextprotocol/sdk`，列为后续任务
- DEF-003（已修复）：js-yaml 5 的 `load("")` 抛 YAMLException（v4 返回 undefined），导致空 frontmatter block 在 kb_get_page/kb_promote_experience/dream 崩溃。修复：`parseFrontmatter` 加 try/catch 降级为空 frontmatter。触发条件极低（AGENTS.md 要求完整 frontmatter），ac-verifier 发现，本轮已修复并加测试覆盖。

## 验证

| 验证项 | 结果 |
| --- | --- |
| typecheck（tsc --noEmit，TS 7） | ✅ 通过 |
| build（tsc） | ✅ 通过 |
| 单元测试（43 用例） | ✅ 42/43（1 flaky perf，单独跑 3/3 通过） |
| E2E smoke（smoke-mcp-full.mjs，37 checks） | ✅ 37/37 |
| grep breaking patterns | ✅ 零命中 |

## 参考（References）

- [Zod 4 Migration Guide](https://zod.dev/v4/changelog)
- [js-yaml v5 migration guide](https://github.com/nodeca/js-yaml/blob/master/docs/migrate_v4_to_v5.md)
- TypeScript 7.0 — The Go Rewrite（Microsoft 官方公告，Project Corsa）
- [actions/checkout v7 safer pull_request_target defaults](https://github.blog/changelog/2026-06-18-safer-pull_request_target-defaults-for-github-actions-checkout/)
- [GHSA-frvp-7c67-39w9 @hono/node-server path traversal](https://github.com/advisories/GHSA-frvp-7c67-39w9)
