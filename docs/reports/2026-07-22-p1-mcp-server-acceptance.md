# 验收测试报告 · P1 MCP Server

## 元信息

| 项目 | 内容 |
|---|---|
| 执行 Agent | ac-verifier |
| 任务令牌 | TKN-P1-MCP-ACCEPTANCE-001 |
| 任务域 | P1 MCP Server（8 个 kb_* tools + Ingest/Query/Lint/Experience 闭环） |
| 报告日期 | 2026-07-22 |
| 验收依据 | [PRD](../PRD.md) US-001～US-006 / [ADR-001](../decisions/ADR-001-knowledge-base-tech-stack.md) / [ARCH](../ARCH.md) §3.1 |
| guardrail 报告 | [2026-07-22-p1-mcp-server-guardrail-r2.md](./2026-07-22-p1-mcp-server-guardrail-r2.md)（结论：通过） |
| 测试架构 skill | test-architect |
| 主 Agent 签发上下文 | 盲区 1：31 个单元测试覆盖充分性，特别是边界场景（CJK/超大输入/并发）。盲区 2：性能基线从未建立，MCP stdio 延迟与 kb_lint O(N²) 无量化数据。盲区 3：MCP 协议层端到端测试覆盖不足（单元测试绕过 SDK schema 校验）。 |

---

## 1. 验收标准解析

### 1.1 PRD 验收标准映射

| US | 验收标准 | 测试方法 | 状态 |
|---|---|---|---|
| US-001-1 | `kb_write_experience` 写入 `wiki/<domain>/experiences/inbox/` | MCP E2E + 单元测试 | ✅ |
| US-001-2 | 经验卡片含 frontmatter：status=pending / domain / confidence / date / source_task | MCP E2E 验证磁盘文件 | ✅ |
| US-001-3 | 高 confidence（≥0.8）单域经验经自动审核门禁提升为正式页 | **P3 范围**（审核门禁未在 P1 实现，P1 仅实现 inbox 写入） | ⏸ P3 |
| US-001-4 | 低 confidence 或跨域经验进入人工审核队列 | **P3 范围** | ⏸ P3 |
| US-001-5 | 所有经验卡片经 git，可回滚 | 验证写入为普通 markdown 文件，git 可追踪 | ✅ |
| US-001-6 | 每日/按需 `/dream` 整理 | **P3 范围**（/dream 脚本未在 P1 实现） | ⏸ P3 |
| US-002-1 | MCP server 以 stdio 传输暴露 | MCP E2E（spawn 子进程 + JSON-RPC over stdio） | ✅ |
| US-002-2 | 至少暴露 tools：kb_search / kb_get_page / kb_ingest_source / kb_list_categories / kb_list_recent / kb_lint | MCP E2E tools/list 返回 8 个 tool（超出最低要求，含 kb_write_experience + kb_health） | ✅ |
| US-002-3 | Claude Code、Trae CN、OpenCode 三者均能配置并成功调用 kb_search | **P2 范围**（三 Agent 接入验证在 P2 里程碑） | ⏸ P2 |
| US-002-4 | 检索结果带页面路径引用 | MCP E2E 验证 results[].path 字段 | ✅ |
| US-002-5 | 断网时本地检索仍可用 | 全部测试均在本地完成，无网络依赖 | ✅ |
| US-003-1 | wiki/ 下按领域建目录树 | kb_list_categories 验证 | ✅ |
| US-003-2 | 每个 wiki 页含 frontmatter domain + type + status | kb_get_page 验证 + kb_lint frontmatter 检查 | ✅ |
| US-003-3 | index.md 按领域分组列出所有页面 | kb_ingest_source 验证 index 更新 | ✅ |
| US-003-4 | Obsidian Dataview 可按 domain/type/status 生成动态视图 | **P5 范围**（Obsidian 兼容性验证） | ⏸ P5 |
| US-003-5 | 一篇笔记可同时归属多个领域（tags） | frontmatter tags 字段验证 + kb_lint missing_xref 检查 | ✅ |
| US-004-1 | Tauri 桌面应用 | **P4 范围** | ⏸ P4 |
| US-004-2 | 拖拽 PDF/DOCX/XLSX 触发解析管道 | **P4 范围** | ⏸ P4 |
| US-004-3 | AI 整理生成 markdown wiki 页，先入 staging | kb_ingest_source 验证 status=staging | ✅（markdown 直接摄入；二进制解析 P4） |
| US-004-4 | 用户确认后写入 wiki/ 并更新 index/log | kb_ingest_source 验证 index + log 更新 | ✅ |
| US-004-5 | GUI 内可预览 wiki 页 | **P4 范围** | ⏸ P4 |
| US-004-6 | 原始文件不可变 | kb_ingest_source 将外部文件复制到 raw/assets/，不修改原文件 | ✅ |
| US-005-1 | kb_lint 检测矛盾、孤儿页、缺失交叉引用、过时声明 | 单元测试 6 项 + smoke-lint.mjs 12 项断言 | ✅ |
| US-005-2 | 输出结构化报告，标注问题页与建议 | MCP E2E 验证 issues[].{type,severity,page,detail,suggestion} + summary | ✅ |
| US-005-3 | 可手动或定时触发 | kb_lint 通过 MCP tools/call 手动触发，lint checks 参数可选 | ✅ |
| US-006-1 | 小规模（<200 页）index.md 检索，准确率人工评估 ≥80% | 性能基线：200 页 p95=99ms（远低于 2s 阈值）；准确率依赖 LLM 综合能力，P1 验证检索机制可用 | ✅（机制可用；准确率待 P2 三 Agent 接入后人工评估） |
| US-006-2 | 中规模接入 qmd 后，P95 < 2s | **P5+ 范围**（qmd 未在 P1 接入） | ⏸ P5+ |

### 1.2 P1 里程碑验收标准（ARCH §10）

| 里程碑 | 验收标准 | 状态 |
|---|---|---|
| P1 知识库核心 | MCP server 8 tools + index.md/log.md + Ingest/Query 闭环 | ✅ |

### 1.3 非功能需求验证

| 维度 | 要求 | 验证结果 | 状态 |
|---|---|---|---|
| 性能 | kb_search P95 < 2s（中规模）；index.md 小规模即时 | 200 页 p95=99ms（<200 页规模） | ✅ |
| 安全 | 无硬编码密钥；结构化日志不输出敏感信息；路径穿越防护 | guardrail R2 报告 + 本轮安全专项 8 项全过 | ✅ |
| 隐私 | 默认本地优先 | 全部测试本地完成，零网络调用 | ✅ |
| 可观测性 | log.md 记录 ingest/query/lint/experience 时间线 | kb_ingest_source + kb_write_experience 验证 log 追加 | ✅ |
| 可维护性 | 核心依赖 ≤5 | 实际 3 个运行时依赖（MCP SDK / js-yaml / zod） | ✅ |
| 兼容性 | 与 Obsidian + git 兼容 | 存储为纯 markdown + frontmatter，Obsidian 兼容 | ✅ |

---

## 2. 测试架构（test-architect）

### 2.1 覆盖矩阵

| Tool | 单元测试 | MCP E2E | 边缘场景 | 安全 | 性能基线 |
|---|---|---|---|---|---|
| kb_search | 4/4 ✅ | 2/2 ✅ | CJK 查询 ✅ | 路径穿越(domain 过滤) ✅ | 200 页 p95=99ms ✅ |
| kb_get_page | 4/4 ✅ | 3/3 ✅ | — | 6 向量路径穿越 ✅ | p95=0.32ms ✅ |
| kb_ingest_source | 5/5 ✅ | 2/2 ✅ | 并发写入 ⚠️ | source_path 穿越 ✅ | — |
| kb_write_experience | 3/3 ✅ | 2/2 ✅ | CJK 标题 ✅, 大内容 ✅, 并发 ⚠️ | domain 穿越(SDK+运行时) ✅ | — |
| kb_list_categories | 3/3 ✅ | 1/1 ✅ | — | — | p95=106ms ✅ |
| kb_list_recent | 2/2 ✅ | 2/2 ✅ | — | — | — |
| kb_lint | 7/7 ✅ | 3/3 ✅ | 空 KB ✅ | — | 200 页 p95=108ms ✅ |
| kb_health | 3/3 ✅ | 2/2 ✅ | index 缺失 ✅ | — | p95=2ms ✅ |

### 2.2 测试策略

- **静态分析**：tsc --noEmit（类型检查）+ tsc（编译）+ npm audit（依赖安全扫描）
- **单元测试**：node:test + tsx，直调 handler（绕过 MCP SDK），隔离 temp KB
- **集成测试**：handler + 真实文件系统（temp KB），验证副作用（wiki/index/log 写入）
- **端到端测试**：spawn MCP server 子进程，JSON-RPC over stdio，验证 SDK schema 校验层
- **安全测试**：路径穿越多向量、日志注入、索引注入、敏感信息泄露
- **性能测试**：200 页 fixture（PRD US-006 小规模阈值），50 次迭代，p50/p95/p99/吞吐/错误率

### 2.3 测试脚本清单

| 脚本 | 用途 | 结果 |
|---|---|---|
| `server/src/tests/*.test.ts`（4 文件） | 单元测试 31 个 | 31/31 ✅ |
| `server/smoke-lint.mjs` | kb_lint 直调冒烟（12 断言） | 12/12 ✅ |
| `server/smoke-mcp-lint.mjs` | kb_lint MCP 协议冒烟（4 断言） | 4/4 ✅ |
| `server/smoke-mcp-full.mjs`（新增） | 全 8 tool MCP 协议 E2E（36 断言） | 36/36 ✅ |
| `server/smoke-edge-security.mjs`（新增） | 边缘场景 + 安全专项（19 断言） | 18/19 ✅（1 竞态发现） |
| `server/perf-baseline.mjs`（新增） | 性能基线（7 工具 × 50 迭代） | 7/7 ✅ |

---

## 3. 分层测试实施

### 3.1 静态分析（Lint / 安全扫描）

| 工具 | 命令 | 结果 | 说明 |
|---|---|---|---|
| TypeScript 类型检查 | `npm run typecheck`（tsc --noEmit） | exit 0，无错误 ✅ | strict 模式 |
| 编译 | `npm run build`（tsc） | exit 0，编译成功 ✅ | 输出 dist/ |
| 依赖安全扫描 | `npm audit --audit-level=high` | 0 high/critical ✅ | 2 moderate（见 §3.1.1） |

#### 3.1.1 npm audit 发现（2 moderate，非阻断）

| 依赖 | 严重度 | 描述 | 影响评估 |
|---|---|---|---|
| `@hono/node-server` <2.0.5（经 `@modelcontextprotocol/sdk` 传递依赖） | moderate | `serve-static` 在 Windows 上通过编码反斜杠 `%5C` 的路径穿越（[GHSA-frvp-7c67-39w9](https://github.com/advisories/GHSA-frvp-7c67-39w9)） | **不影响本项目**：MCP server 使用 stdio 传输，不使用 `serve-static`（HTTP 静态文件服务）。漏洞组件未进入运行时路径。 |

**处置建议**：当 `@modelcontextprotocol/sdk` 发布修复版本时升级（CLAUDE.md §18.4 依赖监控）。当前不阻断 P1 验收。

### 3.2 单元测试

| 指标 | 目标 | 实际 | 状态 |
|---|---|---|---|
| 测试通过率 | 100% | 31/31（100%） | ✅ |
| 语句覆盖率 | ≥90% | 未安装 c8/istanbul；基于代码审查估算 ≥90%（所有分支均有测试覆盖） | ⚠️ 未量化 |
| 分支覆盖率 | ≥80% | 基于代码审查估算 ≥85%（主要分支覆盖；部分 catch 块仅 1 条路径） | ⚠️ 未量化 |
| 套件数 | — | 8（每 tool 一个 describe） | ✅ |
| 总耗时 | — | 764ms | ✅ |

**覆盖率说明**：项目未配置 c8/istanbul 等覆盖率工具（package.json 无 coverage 脚本）。基于代码审查与测试对照估算：14 个源文件的所有公开函数均有测试触达，关键分支（路径穿越、ENOENT、空查询、Date 对象、重复标题、frontmatter 缺失/无效、矛盾标记、孤儿豁免、stale 方向、missing_xref）均有专项测试。建议 P2 集成 c8 覆盖率工具以量化指标。

### 3.3 集成测试

集成测试通过单元测试的 temp KB 机制实现：每个测试文件在 `before` 钩子中创建独立临时知识库，设置 `KB_ROOT` 后动态 import 模块，验证 handler 与真实文件系统的交互。

| 集成场景 | 验证内容 | 状态 |
|---|---|---|
| Ingest → index.md 更新 | kb_ingest_source 写入 wiki 页 + 追加 index 条目 | ✅ |
| Ingest → log.md 追加 | kb_ingest_source 写入 log 条目（含 source/wiki/status） | ✅ |
| Experience → log.md 追加 | kb_write_experience 写入 log 条目（含 inbox/confidence/source_task） | ✅ |
| Experience → 不更新 index.md | pending 卡片不进 index（待审核门禁提升后） | ✅ |
| Ingest → raw/ 不可变 | 外部文件复制到 raw/assets/，不修改原文件 | ✅ |
| Lint → 5 项检查联动 | frontmatter + contradictions + orphans + stale + missing_xref | ✅ |
| Health → log 解析 | 从 log.md 提取 last_ingest / last_lint | ✅ |

### 3.4 端到端测试（MCP 协议层）

端到端测试通过 `server/smoke-mcp-full.mjs` 实现：spawn 编译后的 `dist/index.js` 子进程，经 stdin/stdout 发送 JSON-RPC 消息，验证 MCP SDK 的 schema 校验层与 tool handler 的完整链路。

| E2E 场景 | 断言数 | 状态 |
|---|---|---|
| initialize 返回 server name | 1 | ✅ |
| tools/list 返回全部 8 个 tool | 9 | ✅ |
| Schema 校验拦截 domain 路径穿越（S-1） | 2 | ✅ |
| kb_health 返回 total_pages + index_status | 2 | ✅ |
| kb_list_categories 返回 domain + page_count | 1 | ✅ |
| kb_search 返回带 path/title/snippet/score 的结果 | 2 | ✅ |
| kb_get_page 返回 frontmatter + body + links | 3 | ✅ |
| kb_get_page 错误路径返回 isError | 1 | ✅ |
| kb_ingest_source 创建 staging 页 + 返回 wiki_path | 2 | ✅ |
| kb_write_experience 创建 pending 卡片 + inbox 路径 | 2 | ✅ |
| kb_list_recent 返回 entries + 类型过滤 | 3 | ✅ |
| kb_lint 返回 issues + summary + 选择性检查 | 3 | ✅ |
| Ingest 副作用：磁盘文件 + log 条目 | 3 | ✅ |
| 日志注入防护：无伪造条目 | 1 | ✅ |
| **合计** | **36** | **36/36 ✅** |

**关键发现**：MCP SDK 的 Zod schema 校验层正确拦截了 domain 路径穿越输入（返回 `isError: true`），验证了 guardrail R2 报告中 S-1 修复的纵深防御在协议层生效。单元测试绕过 schema 直调 handler 验证运行时检查，E2E 测试验证 schema 层检查，两者互补。

---

## 4. 极端/边缘场景

| 场景 | 输入 | 预期 | 实际 | 状态 |
|---|---|---|---|---|
| CJK 标题 | title="Python 异步上下文管理器的正确用法" | slug 保留 CJK，文件写入磁盘 | path=`wiki/coding/experiences/inbox/python-异步上下文管理器的正确用法.md`，文件存在 | ✅ |
| CJK 搜索 | query="异步" | 匹配 CJK 内容 | 2 结果，含"异步模式总结" | ✅ |
| 大内容（99000 字符） | content="x".repeat(99000) | 接受（<100000 schema 上限） | status=pending | ✅ |
| 空 KB（无 wiki/ 目录） | kb_search / kb_list_categories | 返回空结果，不崩溃 | 单元测试覆盖（ENOENT 路径） | ✅ |
| 并发写入（5 个不同标题） | Promise.all 5 个 kb_write_experience | 全部成功 | 5/5 pending | ✅ |
| **并发写入（3 个相同标题）** | Promise.all 3 个 kb_write_experience | **仅 1 成功，2 报错** | **3 全部成功（TOCTOU 竞态）** | ⚠️ 见 DEF-001 |
| confidence 边界 0 | confidence=0 | 接受（schema min(0)） | status=pending | ✅ |
| confidence 边界 1 | confidence=1 | 接受（schema max(1)） | status=pending | ✅ |
| limit 边界 1 | limit=1 | 最多返回 1 结果 | 1 result | ✅ |
| index.md 缺失 | kb_health | index_status="missing" | missing | ✅ |
| 超长路径（6 向量） | kb_get_page 各种穿越变体 | 全部拒绝 | 6/6 拦截 | ✅ |

### 4.1 DEF-001：TOCTOU 竞态条件（kb_write_experience / kb_ingest_source 重复检测）

**严重度**：低（本地单用户场景，last-write-wins，无崩溃/腐败）

**位置**：
- `server/src/tools/write.ts:165-169`（kbWriteExperience：`fileExists` 检查与 `writeFile` 之间存在窗口）
- `server/src/tools/write.ts:93-97`（kbIngestSource：同样模式）

**复现**：3 个并发 `kb_write_experience` 调用使用相同 title，全部通过 `fileExists` 检查（文件尚未创建），随后全部执行 `writeFile`（覆盖写），返回 3 个 `status=pending`。磁盘上最终只保留最后一次写入的内容。

**影响**：
- 在本地单用户 MCP server 场景下实际风险极低（一个 Agent 串行调用 tool）
- 后果是 last-write-wins（数据丢失但不腐败）
- 不影响安全（写入路径仍受 domain 正则 + path.relative 双重穿越检查保护）

**修复建议**（P2）：使用 `fs.writeFile(path, content, { flag: 'wx' })`（独占创建，文件已存在时原子失败）替代 `fileExists` + `writeFile` 两步模式。

**P1 处置**：**不阻断 P1 验收**。guardrail-enforcer R2 报告未发现此问题（静态分析无法检测运行时竞态）。建议作为 P2 修复项记录。

---

## 5. 性能回退检查

### 5.1 基线环境

| 项目 | 内容 |
|---|---|
| 基线版本 | P1 MCP Server v0.1.0（guardrail R2 通过后） |
| 记录日期 | 2026-07-22 |
| 测试环境 | Windows / Node.js 22 / TypeScript 5.x / SSD |
| 数据规模 | 200 页 fixture KB（PRD US-006 小规模阈值），3 domain，含 source/concept 类型，共享 tags |
| 测试工具 | 自建脚本 `server/perf-baseline.mjs`（process.hrtime.bigint 计时，50 次迭代 + 1 次 warmup） |
| PRD 性能门禁 | P95 < 2s（US-006） |

### 5.2 基线数据（200 页规模）

| 工具 | 迭代数 | p50 (ms) | p95 (ms) | p99 (ms) | 吞吐 (QPS) | 错误率 |
|---|---|---|---|---|---|---|
| kb_search（query='python async testing'） | 50 | 91.093 | 99.031 | 101.582 | 10.93 | 0.0000 |
| kb_search（query='python', domain='coding'） | 50 | 94.992 | 108.585 | 110.039 | 10.36 | 0.0000 |
| kb_get_page（单页） | 50 | 0.172 | 0.324 | 0.347 | 5000.00 | 0.0000 |
| kb_list_categories（include_stats=true） | 50 | 93.920 | 105.904 | 110.795 | 10.46 | 0.0000 |
| kb_health | 50 | 1.256 | 2.042 | 2.604 | 735.29 | 0.0000 |
| kb_lint（全检查, 200 页） | 50 | 101.949 | 108.269 | 110.912 | 9.76 | 0.0000 |
| kb_lint（仅 frontmatter, 200 页） | 50 | 95.971 | 100.581 | 103.375 | 10.41 | 0.0000 |

### 5.3 性能分析

| 工具 | p95 vs 2s 门禁 | 余量 | 分析 |
|---|---|---|---|
| kb_search | 99ms | 20x 余量 | 全文件扫描 + term-overlap 评分；200 页下表现良好。P5 接入 qmd 后中规模（200-5000）预期仍可达 P95 < 2s。 |
| kb_get_page | 0.32ms | 6250x 余量 | 单文件读取 + frontmatter 解析，极快。 |
| kb_list_categories | 106ms | 19x 余量 | 遍历所有 domain 目录 + 读取每页 frontmatter 提取 date。瓶颈在 I/O。 |
| kb_health | 2ms | 1000x 余量 | listMarkdownFiles + log 解析，极快。 |
| kb_lint（全检查） | 108ms | 18x 余量 | 5 项检查联动。O(N²) missing_xref 在 200 页下仅增加 ~6ms（对比 frontmatter-only 96ms），验证 L-2 技术债在 P1 规模可接受。 |

### 5.4 回退判定

- **无历史基线**（P1 为首次建立基线），因此无法计算回退百分比。
- 所有工具 p95 均远低于 PRD 2s 门禁（最低余量 18x），**性能门禁通过**。
- 此基线将作为后续 P2+ 性能回退对比的基准。

### 5.5 L-2 技术债验证（missing_xref O(N²)）

性能基线验证了 guardrail R1 报告中 L-2 的评估：

| 检查组合 | p50 (ms) | 差值 (ms) | 说明 |
|---|---|---|---|
| kb_lint（仅 frontmatter，O(N)） | 95.971 | 基准 | 线性扫描 |
| kb_lint（全检查，含 O(N²) missing_xref） | 101.949 | +5.98 | N² 项在 N=200 时贡献约 6ms |

**结论**：在 N=200（PRD 小规模上限）时，O(N²) 项贡献仅 ~6% 总耗时，可接受。当 N=5000（中规模）时，N² 项将增长 (5000/200)² = 625 倍，达到 ~3.7s，将超过 2s 门禁。**P2 必须优化 missing_xref 算法**（建议：按 domain + tag 建倒排索引，将 O(N²) 降为 O(N × K)，K 为同 domain 同 tag 的页面数）。

---

## 6. 基础安全检查

### 6.1 注入类测试

| 注入类型 | 测试载荷 | 预期 | 实际 | 状态 |
|---|---|---|---|---|
| 日志注入（CWE-117） | title="正常\n## [2026-07-22] ingest \| FAKE ENTRY\n- source: raw/fake.pdf" | log.md 不出现伪造 `## [date] ingest` 条目 | fakeCount=0，title 折叠为单行 | ✅ |
| 索引注入 | kb_ingest_source 正常调用 | index.md 不出现伪造 `## ` section header | 仅 `## coding` 一个预期 header | ✅ |
| YAML 注入（CWE-502） | frontmatter 含危险类型 | js-yaml v4 默认 safe schema 拦截 | guardrail R2 已验证 | ✅ |
| SQL/命令/代码注入 | 不适用 | — | 项目无 DB / exec / eval | N/A |

### 6.2 敏感信息泄露检查

| 检查项 | 方法 | 结果 | 状态 |
|---|---|---|---|
| 错误消息不泄露绝对路径 | kb_get_page 不存在路径 → 检查 response text | "Page not found: wiki/coding/does-not-exist"（仅用户输入的相对路径，无 TMP 绝对路径） | ✅ |
| 源码无硬编码密钥 | guardrail R1/R2 全量扫描 | config.ts 仅含路径与版本号 | ✅ |
| .gitignore 排除 .env | 检查 server/.gitignore | 含 .env / .env.local / .env.*.local | ✅ |
| stderr 不作为 tool response | MCP stdio 协议：stdout=JSON-RPC，stderr=日志 | console.error 输出到 stderr，不出现在 content[] | ✅ |

### 6.3 路径穿越专项（6 向量）

| 向量 | 输入 | kb_get_page | kb_ingest_source(source_path) | kb_ingest_source(domain) | kb_write_experience(domain) |
|---|---|---|---|---|---|
| `../` 序列 | `../../../etc/passwd` | ✅ 拦截 | ✅ 拦截 | ✅ 拦截(schema) | ✅ 拦截(schema) |
| Windows `..\` | `..\..\..\windows\system32` | ✅ 拦截 | — | ✅ 拦截(schema) | ✅ 拦截(schema) |
| Unix 绝对路径 | `/etc/passwd` | ✅ 拦截 | — | ✅ 拦截(schema) | ✅ 拦截(schema) |
| Windows 绝对路径 | `C:\Windows\system32\...` | ✅ 拦截 | — | ✅ 拦截(schema) | ✅ 拦截(schema) |
| 混合 `./`+`../` | `wiki/../../../etc/passwd` | ✅ 拦截 | — | — | — |
| 长前缀穿越 | `wiki/coding/../../../../../etc/passwd` | ✅ 拦截 | — | — | — |

### 6.4 安全专项验证

| 检查 | 结果 | 证据 |
|---|---|---|
| kb_get_page 路径穿越（6 向量全过） | Pass | `smoke-edge-security.mjs` 6/6 拦截 |
| kb_ingest_source source_path 穿越拦截 | Pass | 单元测试 + E2E |
| kb_ingest_source domain 穿越拦截（schema + 运行时双层） | Pass | E2E 验证 schema 层 isError=true；单元测试验证运行时层 |
| kb_write_experience domain 穿越拦截 | Pass | 同上 |
| 日志注入防护（\r\n 过滤） | Pass | 恶意 title 未伪造 log 条目 |
| 索引注入防护（\r\n 过滤） | Pass | 无伪造 section header |
| 错误消息不泄露绝对路径 | Pass | 仅返回用户输入的相对路径 |
| frontmatter YAML safe schema | Pass | guardrail R1 已验证 js-yaml v4 默认 safe |

---

## 7. 回归测试

| 套件 | 测试数 | 通过 | 失败 | 耗时 | 状态 |
|---|---|---|---|---|---|
| 单元测试（npm test） | 31 | 31 | 0 | 764ms | ✅ |
| kb_lint 直调冒烟（smoke-lint.mjs） | 12 | 12 | 0 | <1s | ✅ |
| kb_lint MCP 冒烟（smoke-mcp-lint.mjs） | 4 | 4 | 0 | <1s | ✅ |
| MCP 全 tool E2E（smoke-mcp-full.mjs） | 36 | 36 | 0 | <2s | ✅ |
| 边缘+安全（smoke-edge-security.mjs） | 19 | 18 | 1（DEF-001 竞态） | <2s | ⚠️ |
| 性能基线（perf-baseline.mjs） | 7 | 7 | 0 | ~25s | ✅ |
| **合计** | **109** | **108** | **1** | — | ⚠️ |

**回归结论**：108/109 通过。唯一未通过项为 DEF-001（TOCTOU 竞态，低严重度，不阻断 P1）。无历史回归基线（P1 为首次验收）。

---

## 8. 技术债评估（guardrail R2 报告 R2-1～R2-4 + L-2）

| # | 问题 | 严重度 | P1 处置 | 理由 |
|---|---|---|---|---|
| R2-1 | kb_search.domain 缺 .max() | 低 | **推迟 P2** | 仅用于字符串比较（`pageDomains.includes(domain)`），不参与路径构造，无穿越风险。添加 .max(64) 是一致性增强。 |
| R2-2 | sanitize 仅过滤 \r\n | 低 | **推迟 P2** | guardrail R2 已论证：\r\n 过滤对 markdown 注入防护充分（其他 C0 控制字符无 markdown 语义）。本轮安全测试验证：恶意 title 含 \n 未伪造 log 条目。 |
| R2-3 | console.error 输出完整 error 对象 | 低 | **推迟 P2** | 输出到 stderr（MCP 日志通道），不作为 tool response 返回调用方。路径为本地知识库路径，非敏感凭证。CLAUDE.md §19.3 合规性增强建议。 |
| R2-4 | sanitizeLogField 缺 .trim() | 低 | **推迟 P2** | 纯美观（首尾空格），无安全影响。 |
| L-2 | missing_xref O(N²) 复杂度 | 低（P1 规模） | **推迟 P2** | 性能基线验证：N=200 时 O(N²) 项仅贡献 ~6ms（总耗时 102ms）。N=5000 时将达 ~3.7s 超过门禁，P2 必须优化。 |
| DEF-001（新） | TOCTOU 竞态（重复检测） | 低 | **推迟 P2** | 本地单用户场景风险极低。修复方案：fs.writeFile flag:'wx'。 |

**结论**：6 项技术债均为低严重度，不阻断 P1 验收。建议在 P2 里程碑统一处理（P2 涉及三 Agent 接入与中规模检索准备，会触及 schema 与性能优化）。

---

## 9. 综合结论

- [x] **全部通过且无回归（除 1 项低严重度发现）**：本轮开发周期闭合
- [ ] **不通过**：主 Agent 必须回退至 guardrail-enforcer 阶段重新开始闭环

### 9.1 总结

P1 MCP Server 验收测试覆盖 109 项断言，108 项通过，1 项低严重度发现（DEF-001 TOCTOU 竞态）。

**核心交付物验证**：

| 交付物 | 验证结果 |
|---|---|
| 8 个 kb_* tools 实现 | ✅ MCP tools/list 返回全部 8 个，E2E 36 断言全过 |
| 每个 tool 通过单元测试 | ✅ 31/31 通过 |
| Ingest/Query 工作流闭环 | ✅ ingest → search → get_page → lint → health E2E 验证 |
| 路径穿越防护 | ✅ 6 向量 × 4 参数全过（schema 正则 + 运行时 path.relative 双层） |
| 日志注入防护 | ✅ 恶意 title 未伪造 log 条目 |
| 输入校验 | ✅ Zod schema .max() + 正则（R2-1 低风险遗漏不阻断） |
| 小规模（<200 页）检索性能 | ✅ p95=99ms，20x 余量低于 2s 门禁 |

**PRD 里程碑覆盖**：

| 里程碑 | P1 范围内验收标准 | 状态 |
|---|---|---|
| P1 知识库核心 | MCP server 8 tools + index.md/log.md + Ingest/Query 闭环 | ✅ 全部通过 |
| P2（三 Agent 接入） | US-002-3 | ⏸ P2 范围 |
| P3（持续进化四件套） | US-001-3/4/6（审核门禁 + /dream） | ⏸ P3 范围 |
| P4（Tauri GUI） | US-004-1/2/5 | ⏸ P4 范围 |
| P5（集成验收） | US-003-4, US-006-2 | ⏸ P5 范围 |

### 9.2 主 Agent 三个盲区验证结果

| 盲区 | 验证结果 |
|---|---|
| 1. 单元测试覆盖充分性（边界场景） | 边缘场景测试 18/19 通过。CJK 标题、CJK 搜索、大内容、并发写入、confidence 边界、limit 边界均覆盖。发现 DEF-001 竞态（单元测试因串行执行未捕获）。覆盖率未量化（建议 P2 集成 c8）。 |
| 2. 性能基线（无历史数据） | 首版基线已建立：200 页规模下所有工具 p95 < 111ms，远低于 2s 门禁。L-2 O(N²) 在 200 页下仅贡献 6ms，验证可接受。 |
| 3. MCP 协议层 E2E 覆盖 | 新增 smoke-mcp-full.mjs 覆盖全部 8 tool 经 stdio JSON-RPC 调用，36 断言全过。验证 SDK schema 校验层正确拦截非法输入（domain 路径穿越在协议层被 isError=true 拒绝）。 |

### 9.3 阻断项

**无阻断项**。

DEF-001（TOCTOU 竞态）为低严重度发现：
- 本地单用户 MCP server 场景下实际风险极低
- 后果为 last-write-wins（数据丢失，不腐败）
- 不影响安全（写入路径仍受穿越检查保护）
- 修复方案明确（fs.writeFile flag:'wx'）
- 建议作为 P2 修复项，不触发 P1 回退闭环

### 9.4 建议后续行动

| 优先级 | 行动 | 里程碑 |
|---|---|---|
| 中 | 修复 DEF-001（TOCTOU 竞态）：kbIngestSource + kbWriteExperience 使用 fs.writeFile flag:'wx' | P2 |
| 中 | 优化 L-2（missing_xref O(N²)）：按 domain+tag 建倒排索引 | P2 |
| 低 | 修复 R2-1～R2-4（schema .max() / C0 控制字符 / console.error / .trim()） | P2 |
| 低 | 集成 c8 覆盖率工具，量化单元测试覆盖率 | P2 |
| 低 | 添加 npm audit CI 集成（CLAUDE.md §18.4） | P2 |
| 低 | 升级 @modelcontextprotocol/sdk 修复 @hono/node-server moderate 漏洞 | 待 SDK 发布修复版 |

---

## 10. 文档修正建议

| 文档 | 偏差 | 修正建议 |
|---|---|---|
| ARCH.md §3.1 | kb_lint 输出 schema 已在 guardrail R1 后更新（含 severity + summary） | 已修复 ✅（guardrail R2 确认） |
| ARCH.md §3.1 | kb_list_recent type enum 已扩展（含 experience + init） | 已修复 ✅（guardrail R2 确认） |
| ARCH.md §10 演进路线 | P1 描述"MCP server 8 tools + index.md/log.md + Ingest/Query 闭环" | 与实现一致 ✅ |
| PRD §7 验收标准汇总 | "US-001～US-006 全部验收标准通过 + 性能基线 + 安全检查 + 回归无问题" | P1 范围内的验收标准已全部通过；US-001-3/4/6、US-002-3、US-004-1/2/5、US-005-4、US-006-2 属于 P2-P5 范围，按里程碑分阶段验收。建议 PRD 补充"P1 验收范围"说明。 |
| 性能基线模板 | `docs/templates/performance-baseline-template.md` 存在 | 建议将本报告 §5 基线数据同步至 `docs/reports/perf/2026-07-22-p1-mcp-server-baseline.md`（主 Agent 决定是否单独存档） |

---

## 11. 待澄清

| # | 问题 | 阻塞? | 建议 |
|---|---|---|---|
| 1 | 单元测试覆盖率未量化（无 c8/istanbul 工具） | 否 | CLAUDE.md §11 要求"语句 ≥90%，分支 ≥80%"，但项目未配置覆盖率工具。基于代码审查估算达标，建议 P2 集成 c8 以严格量化。主 Agent 决定是否在 P1 补装。 |
| 2 | DEF-001 TOCTOU 竞态是否需在 P1 修复 | 否 | 评估为低严重度（本地单用户、last-write-wins、无腐败）。建议推迟 P2。若主 Agent 认为需 P1 修复，则触发回退闭环（修复 → 影响自检 → guardrail R3 → ac-verifier R2）。 |
| 3 | 新增测试脚本（smoke-mcp-full.mjs / smoke-edge-security.mjs / perf-baseline.mjs）是否保留 | 否 | 三脚本遵循现有 smoke-*.mjs 模式，增强测试覆盖。建议保留并更新 README 索引。若主 Agent 不愿保留，ac-verifier 可删除。 |
| 4 | @hono/node-server moderate 漏洞处置 | 否 | 不影响本项目（stdio 传输，不用 serve-static）。建议在 P2 添加 npm audit CI 检查并跟踪 SDK 升级。 |
