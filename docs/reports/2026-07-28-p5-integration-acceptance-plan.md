# P5 集成验收测试计划

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-07-28 |
| 里程碑 | P5 集成验收 |
| 验收标准 | PRD §6 "四点全过"：US-001~US-006 + 性能基线 + 安全检查 + 回归无问题 |
| 关联文档 | [PRD](../PRD.md) §3/§6/§7 / [ADR-013](../decisions/ADR-013-p4-llm-integration-strategy.md) |

---

## 一、验收范围

| 验收项 | 对应 US | 自动化方式 | 状态 |
| --- | --- | --- | --- |
| US-001 经验沉淀全链路 | US-001 | server/src/tests/p5-acceptance.test.ts | 待执行 |
| US-002 三 Agent 兼容性 | US-002 | 手动 + 自动化回归 | 待执行 |
| US-003 多领域分类 | US-003 | server/src/tests/p5-acceptance.test.ts | 待执行 |
| US-004 Tauri GUI 全链路 | US-004 | 手动（Playwright E2E 补充） | 待执行 |
| US-005 kb_lint 健康检查 | US-005 | server/src/tests/p5-acceptance.test.ts | 待执行 |
| US-006 检索质量基线 | US-006 | server/src/tests/p5-acceptance.test.ts + perf/baselines/ | 待执行 |
| 性能基线 | PRD §4 | perf/baselines/p5-baseline.json | 待建立 |
| 安全检查 | PRD §4 | Semgrep XSS + guardrail-enforcer | 待执行 |
| 回归无问题 | PRD §7 | 全量 vitest + node:test + tsc + cargo check | 待执行 |

---

## 二、US-001：编码实践 → kb_write_experience → inbox → promote → /dream 老化

### 测试场景

| 编号 | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| US001-T1 | 高 confidence 单域经验自动 promote | kb_write_experience(confidence=0.9, domain=coding) → kb_promote_experience | tier=auto, status=active, 移出 inbox |
| US001-T2 | 低 confidence 进人工审核 | kb_write_experience(confidence=0.6) → kb_promote_experience | tier=manual |
| US001-T3 | 重复检测 | 写入与已有经验卡标题 Levenshtein > 0.9 的卡片 → promote | duplicate_with 非空, tier=manual |
| US001-T4 | frontmatter 完整性 | 写入后读取 inbox 卡片 | 含 status=pending/domain/confidence/date/source_task |
| US001-T5 | /dream 老化降级 | 模拟 use_count=0 且 date > 90天 → /dream | status=archived, 移到 archive/ |

### 自动化覆盖

`server/src/tests/p5-acceptance.test.ts` — US001-T1/T2/T3/T4

---

## 三、US-002：三 Agent 调用 MCP server 兼容性

### 测试场景

| 编号 | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| US002-T1 | kb_search 返回带引用结果 | kb_search("python async") | 返回结果含 page_path |
| US002-T2 | kb_get_page 读取完整页面 | kb_get_page("wiki/coding/async-patterns") | 返回完整 markdown |
| US002-T3 | kb_list_categories 列出领域 | kb_list_categories() | 返回 coding/emotions/reading 等 |
| US002-T4 | 断网本地检索 | 断网后 kb_search | 仍可用（BM25 本地索引） |
| US002-T5 | CLI bridge Zod 校验 | node cli.ts kb_search '{"query":"test"}' | 成功；错误参数返回校验错误 |

### 自动化覆盖

`server/src/tests/p5-acceptance.test.ts` — US002-T1/T2/T3/T5

---

## 四、US-003：多领域分类

### 测试场景

| 编号 | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| US003-T1 | 领域目录存在 | 检查 wiki/ 下目录 | coding/resources/design/emotions/reading 均存在 |
| US003-T2 | frontmatter domain 字段 | 读取各领域页面 | domain 字段为有效领域 |
| US003-T3 | index.md 领域分组 | 读取 index.md | 按领域分组列出页面 |
| US003-T4 | 多归属 tags | 读取含多个 tag 的页面 | tags 字段含多个值 |

### 自动化覆盖

`server/src/tests/p5-acceptance.test.ts` — US003-T1/T2

---

## 五、US-004：Tauri GUI 拖拽 → parser → staging → confirm → 图谱可视化

### 测试场景（手动 + Playwright）

| 编号 | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| US004-T1 | 拖拽 PDF 上传 | 拖拽 PDF 到 DropZone | parser 解析 → staging 页面创建 |
| US004-T2 | staging 列表展示 | 切换到 upload 视图 | FileList 显示 staging 文件 |
| US004-T3 | LLM 整理 | 点击"LLM 整理"按钮 | 模态框展示整理结果 |
| US004-T4 | 采用整理结果 | 点击"采用" | staging 内容更新，status 保持 staging |
| US004-T5 | confirm 入库 | 点击"确认"按钮 | status → active, log.md 追加 |
| US004-T6 | 图谱可视化 | 切换到 graph 视图 | 新页面出现在图谱中 |

### 自动化覆盖

手动测试（Tauri 桌面环境）。LLM 整理按钮的单元测试在 `frontend/src/lib/__tests__/llm.test.ts`。

---

## 六、US-005：kb_lint 健康检查

### 测试场景

| 编号 | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| US005-T1 | 矛盾检测 | 创建两条冲突声明 → kb_lint | 报告矛盾问题 |
| US005-T2 | 孤儿页检测 | 创建无入链页面 → kb_lint | 报告孤儿页 |
| US005-T3 | 缺失交叉引用 | 创建应建链但未建页面 → kb_lint | 报告缺失 xref |
| US005-T4 | 结构化报告输出 | kb_lint() 返回值 | 含 issues 数组，每项含 type/page/detail |

### 自动化覆盖

`server/src/tests/p5-acceptance.test.ts` — US005-T4（已有 lint.test.ts 覆盖 T1/T2/T3）

---

## 七、US-006：检索质量基线

### 测试场景

| 编号 | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| US006-T1 | BM25 检索 P95 < 2s | kb_search 1000 页知识库 × 10 次 | P95 < 2s |
| US006-T2 | 向量检索 P95 < 2s | kb_search 向量模式 × 10 次 | P95 < 2s |
| US006-T3 | 小规模准确率 | index.md 检索 → 人工评估 | 准确率 ≥ 80% |

### 自动化覆盖

`server/src/tests/p5-acceptance.test.ts` — US006-T1（P95 测量）
`perf/baselines/p5-baseline.json` — 基线数据存档

---

## 八、性能基线（perf/baselines/）

| 指标 | 基线值 | 测量方法 | PRD 阈值 |
| --- | --- | --- | --- |
| kb_search P95（BM25） | 待测量 | 10 次查询取 P95 | < 2s |
| kb_search P95（向量） | 待测量 | 10 次查询取 P95 | < 2s |
| kb_lint 1000 页 p50 | ~1324ms | 9 次取中位数 | < 2s（PRD）/ < 1200ms（CI） |
| call_llm_api 延迟 | 待测量 | 端到端 IPC + HTTP | < 60s（timeout） |

---

## 九、安全检查

| 检查项 | 方法 | 状态 |
| --- | --- | --- |
| XSS 防护 | Semgrep XSS 扫描（.github/workflows/security.yml） | 已配置 |
| API Key 加密 | keyring crate（操作系统密钥环） | 已实现 |
| 路径穿越 | validate_inside + ADR-010 file:/// 检测 | 已实现 |
| CSP 隔离 | LLM 调用经 Rust，webview 无法直接发 HTTP | 已确认 |
| Zod 输入校验 | cli.ts safeParse + MCP server schema | 已实现 |

---

## 十、回归测试

| 测试套件 | 命令 | 预期 |
| --- | --- | --- |
| 前端单元测试 | `cd frontend && pnpm test` | 全部通过 |
| 前端类型检查 | `cd frontend && pnpm build` | 无错误 |
| Rust 编译 | `cd frontend/src-tauri && cargo check` | 无错误 |
| 后端测试 | `cd server && npm test` | 全部通过 |
| 一致性检查 | `node scripts/consistency-check.js` | 通过 |
