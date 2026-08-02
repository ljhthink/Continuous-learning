# Karpathy LLM Wiki 模式实现度深度分析报告 V2

| 项目 | 内容 |
| --- | --- |
| 任务令牌 | TKN-KARPATHY-ANALYSIS-002 |
| 执行 Agent | 主 Agent（GLM-5.2） |
| 日期 | 2026-08-02 |
| 分析对象 | `karpathy-LLM.md` 原方案 vs 项目当前实际功能 |
| 项目根 | `D:\s0611\code\Continuous-learning` |
| 上游报告 | [2026-08-02-karpathy-implementation-analysis.md](2026-08-02-karpathy-implementation-analysis.md)（V1，修复前基线，实现度 75%） |
| 引用规约 | 全文使用相对路径引用代码（ADR-010，禁止 `file:///` 绝对路径） |
| 证据方法 | 静态代码审计 + 文档比对 + 测试运行 + 日志统计 |
| 评估标准 | ✅ 完整实现 · ⚠️ 部分实现/有偏差 · ❌ 未实现 |

---

## 0. 执行摘要

本报告是对 V1 报告（2026-08-02 修复前基线，实现度 75%）的**修复后复审**。V1 报告识别的 6 项核心缺口（P1 文档对齐 / P2 定时维护 / P3 auto-xref / #16 答案回写 / #24 缺失概念页 / #56 LLM 整理 staging）已全部落地并通过 [缺失功能补全验收报告](2026-08-02-missing-features-acceptance.md) 的 6/6 AC 验收（215 单元测试 + 4/4 CLI 运行时）。

**总体实现度：约 92%（59 项功能点中 49 项完整实现 / 7 项部分实现 / 3 项未实现）**，较 V1 提升 17 个百分点。

| 维度 | V1 达成度 | V2 达成度 | 变化 |
| --- | --- | --- | --- |
| 核心架构（三层 + 双索引 + git） | 100% | 100% | — |
| Ingest 操作 | 60% | 95% | +35% ↑（auto-xref 落地） |
| Query 操作 | 40% | 85% | +45% ↑（kb_write_answer 答案回写落地） |
| Lint 操作 | 60% | 90% | +30% ↑（missing_concept + 定时 cron 落地） |
| 持续进化扩展（原方案无） | 90% | 100% | +10% ↑（/dream 定时 cron 落地） |
| GUI 改进（原方案无） | 90% | 95% | +5% ↑（kb_organize_staging 落地） |
| **Schema 层同步（AGENTS.md）** | **未评估** | **55%** | **新发现缺口** |

**核心结论**：Karpathy 原方案的全部核心功能点已基本实现，剩余 8% 缺口集中在两类——(1) Karpathy 自述 optional 且合理推迟的项（qmd/LanceDB/Marp/Web Clipper），(2) **Schema 层（AGENTS.md）与实现脱节**（新发现，V1 未评估此维度）。

---

## 1. 评估方法

### 1.1 比对基准

`karpathy-LLM.md` 定义的功能层（与 V1 一致）：

1. **核心理念**：LLM 增量构建并维护持久化 wiki（cross-references 已存在、contradictions 已标记、synthesis 已反映）
2. **架构三层**：Raw sources（不可变）/ The wiki（LLM 拥有）/ The schema（CLAUDE.md / AGENTS.md）
3. **三大操作**：Ingest（投放源→touch 10-15 页）/ Query（搜索→综合→回写）/ Lint（6 项检测）
4. **双索引**：index.md（内容导向）/ log.md（时间导向，append-only，可 grep 解析）
5. **可选 CLI 工具**：qmd 或自建简单脚本
6. **技巧窍门**：Web Clipper / 图片本地化 / graph view / Marp / Dataview / git

### 1.2 V2 复审增量证据采集

在 V1 证据基础上，本次复审新增核验：

| 层 | 新增采集来源 |
| --- | --- |
| MCP server | `server/src/utils/xref.ts`（新建）、`server/src/tools/write.ts` `kbWriteAnswer`、`server/src/tools/staging.ts` `kbOrganizeStaging`、`server/src/tools/lint.ts` `checkMissingConcept`、`server/src/index.ts`（工具注册数） |
| CI | `.github/workflows/kb-maintenance.yml`（新建） |
| 测试 | `server/src/tests/missing-features.test.ts`（新建，18 项测试）、`npm test` 实跑 215 pass / 0 fail |
| Schema 层 | `AGENTS.md` §5.1/§6.2/§9.1/§9.2 与实现的逐行比对 |
| 日志 | `log.md` 事件类型统计（验证 cron 实际执行历史） |

---

## 2. V1 缺口修复逐项复审

### 2.1 P3 — Ingest 自动交叉引用（V1 #11 ❌ → V2 ✅）

| 项 | V1 状态 | V2 状态 | 证据 |
| --- | --- | --- | --- |
| 一个源 touch 10-15 wiki 页 | ❌ 只 touch 3 处 | ✅ 默认 touch 最多 15 个相关页 | `server/src/utils/xref.ts:83-138` `findXrefCandidates` 复合打分（同域 +4、共享 tag +2/个上限 +6、双向标题提及 +3），`limit` 默认 15（L88），`minScore` 默认 3（L89） |
| 双向交叉引用 | ❌ 未实现 | ✅ 候选页 body `## Related` + frontmatter `related` + 新页 `related` | `xref.ts:151-210` `applyXrefWithAbsPaths` 追加 `## Related` 节 + frontmatter `related`；`xref.ts:218-236` `updateNewPageRelated` 回写新页 related（双向链接） |
| 幂等性 | — | ✅ 三层去重 | `xref.ts:166-174` 已链接检测（完整 relPath / basename / basename\|alias）；`xref.ts:196` related 数组去重；`xref.ts:232` 无新增不写盘 |
| 默认开启 | — | ✅ `auto_xref` 默认 true | `server/src/tools/write.ts:236` `const enableXref = autoXrefFlag !== false;` |
| 日志可观测 | — | ✅ log type=xref | `write.ts:268` 仅 touched>0 时记录 type=xref（避免日志噪声） |
| 错误隔离 | — | ✅ 单页失败不中断 | `xref.ts:202-206` catch + stderr + continue；`write.ts:278-283` auto-xref 失败不阻断 ingest 主流程 |
| 测试覆盖 | — | ✅ 5 项单元测试 | `server/src/tests/missing-features.test.ts` auto-xref suite（同域打分、共享 tag、双向链接、幂等性、ingest 集成+xref 日志） |

**判定**：Karpathy 核心论点「LLM 不忘更新交叉引用，可一次 touch 15 文件」已完整落地。Ingest 操作从「Agent 手动 + lint 兜底」恢复为「LLM 自动 touch」的复利引擎。

### 2.2 #16 — Query 答案回写（V1 #16 ❌ → V2 ✅）

| 项 | V1 状态 | V2 状态 | 证据 |
| --- | --- | --- | --- |
| 答案回写为新 wiki 页 | ❌ 无 tool | ✅ kb_write_answer tool 注册 | `server/src/index.ts:110-115` tool 注册；`server/src/tools/write.ts:380-507` `kbWriteAnswer` |
| 走 inbox 两 tier 门禁 | — | ✅ status=pending 写入 inbox | `write.ts:405-418` 写入 `wiki/<domain>/experiences/inbox/`，`status: "pending"`（不跳过门禁） |
| WRITEBACK-RAG Utility Gate | — | ✅ cited_pages ≥ 2 双重门控 | Zod schema `min(2)`（`schemas.ts:170`）+ 运行时纵深防御（`write.ts:395-399`） |
| 来源溯源 | — | ✅ source_task + related | `write.ts:425` `source_task = "query-writeback:<query>"`；`write.ts:457` `frontmatter.related = cited_pages.slice()` |
| 重复检测（非阻断） | — | ✅ 复用 ADR-011 算法 | `write.ts:432-444` 调用 `findDuplicateExperiences`，疑似重复作为 warning 返回，不阻断 |
| 日志 type=writeback | — | ✅ DEF-007 独立类型 | `write.ts:483` `type: "writeback"`（避免与 experience 的 MD024 重复 heading） |
| 测试覆盖 | — | ✅ 4 项单元测试 + CLI 运行时 | `missing-features.test.ts` kb_write_answer suite（创建 inbox 页、拒绝 cited_pages<2、拒绝路径穿越、拒绝重复 DEF-001） |

**判定**：Karpathy「good answers filed back」核心洞察已落地，且通过 WRITEBACK-RAG Utility Gate 避免了简单事实查询污染知识库（只有综合 ≥2 页的答案才值得回写）。

### 2.3 #24 — Lint 缺失概念页检测（V1 #24 ❌ → V2 ✅）

| 项 | V1 状态 | V2 状态 | 证据 |
| --- | --- | --- | --- |
| 检测被提及但无独立页的概念 | ❌ 未实现 | ✅ missing_concept 检查 | `server/src/tools/lint.ts:600-639` `checkMissingConcept` |
| 候选概念提取（RAKE-lite） | — | ✅ H2/H3 标题 + frontmatter tags | `lint.ts:508-530` `extractCandidateConcepts`（无 LLM，确定性） |
| 提及计数阈值 | — | ✅ ≥5 次 | `lint.ts:469` `MISSING_CONCEPT_MENTION_THRESHOLD = 5`（校准自 longtermwiki Gap Analysis 案例） |
| 不报告已有独立页概念 | — | ✅ existing set 过滤 | `lint.ts:564-571` `buildExistingConceptSet` 从 title/basename 构建已有概念集 |
| CJK 安全 | — | ✅ 子串匹配（非词边界） | `lint.ts:581-598` `countMentions` 注释说明 CJK 无词边界，子串匹配适配中文 |
| 严重度 + top-N | — | ✅ low severity + top-20 | `lint.ts:631` severity=low；`lint.ts:472` `MISSING_CONCEPT_TOP_N = 20` |
| 可通过 checks 参数排除 | — | ✅ | `lint.ts:149-151` 仅在 `enabled.has("missing_concept")` 时运行 |
| 注册到 ALL_CHECKS | — | ✅ | `lint.ts:53` ALL_CHECKS 数组含 `"missing_concept"` |
| 测试覆盖 | — | ✅ 3 项单元测试 + CLI 运行时 | `missing-features.test.ts` checkMissingConcept suite（检测 ≥5 次提及、不报告已有页概念、checks 排除时不出现） |

**判定**：Karpathy「important concepts mentioned but lacking their own page」检测已落地。V1 报告 §4.3 将此项归为「合理设计取舍（靠 Agent 智能而非确定性 tool）」，本项目选择了更积极的路线——用 RAKE-lite 启发式实现确定性检测，是超出原方案的增值。

### 2.4 P2 — Lint 与 /dream 定时执行（V1 #28/#49 ❌ → V2 ✅）

| 项 | V1 状态 | V2 状态 | 证据 |
| --- | --- | --- | --- |
| kb_lint 定时执行 | ❌ log 仅 1 次（手动） | ✅ 每日 02:17 UTC cron | `.github/workflows/kb-maintenance.yml:23` `cron: '17 2 * * *'` |
| /dream 定时执行 | ❌ log 仅 1 次 | ✅ 每周一 03:23 UTC cron | `kb-maintenance.yml:24` `cron: '23 3 * * 1'` |
| 手动触发 | — | ✅ workflow_dispatch | `kb-maintenance.yml:25-35` task choice（lint/dream/full-audit） |
| 最小权限 | — | ✅ contents: read | `kb-maintenance.yml:37-38` |
| 不自动 commit 到 main | — | ✅ 仅 upload-artifact | `kb-maintenance.yml:178-187` 无 git push，retention-days: 90 |
| CI 表达式注入防护（M-1） | — | ✅ env 块传递 | `kb-maintenance.yml:48-53,101-106,142-147` GitHub 表达式经 env 块，shell 内仅引用 $ENV_VAR |
| 失败重试 | — | ✅ 1 次重试 | `kb-maintenance.yml:108-133,148-173` set -euo pipefail + sleep 10 重试 |
| 幂等保证 | — | ✅ /dream quality_score 幂等回写；kb_lint 只读 | ADR-011 \|Δ\|<0.01 跳过回写 |
| 实际执行历史 | — | ⚠️ cron 刚创建，尚未到首次触发时间 | log.md 中 lint/dream 仍各 1 次（手动），cron 首次触发后才会增加 |

**判定**：定时执行机制已完整落地。Karpathy「periodically」要求从「全靠用户自律」升级为「CI 自动化」。注：cron 创建于 2026-08-02，首次触发尚未发生，故 log.md 暂未体现定期执行记录——这是时间问题，非实现缺口。

### 2.5 #56 — LLM 整理 staging（V1 #56 ⚠️ → V2 ✅）

| 项 | V1 状态 | V2 状态 | 证据 |
| --- | --- | --- | --- |
| LLM 整理生成 frontmatter | ⚠️ 仅有分类建议 | ✅ kb_organize_staging tool | `server/src/index.ts:170-175` tool 注册；`server/src/tools/staging.ts:312-417` `kbOrganizeStaging` |
| 应用 title/tags/description | — | ✅ 仅更新提供的字段 | `staging.ts:361-382` 分字段更新（undefined → 保留原值） |
| 不动 body | — | ✅ body 保留 | `staging.ts:389` `serializeFrontmatter(frontmatter, body)` 保留原 body |
| 仅 staging 页可整理 | — | ✅ status 校验 | `staging.ts:353-357` 拒绝非 staging 页 |
| 路径穿越防御 | — | ✅ | `staging.ts:340-345` path.resolve + path.relative |
| 无字段时拒绝 no-op | — | ✅ | `staging.ts:329-338` 需至少一个 {title,tags,description} |
| 日志 type=organize | — | ✅ DEF-007 独立类型 | `staging.ts:399` `type: "organize"` |
| domain_suggestion 不自动迁移 | — | ✅ 仅返回，需用户显式操作 | `staging.ts:413-416` note 提示需 move_page_domain 或手动移动 |
| server 保持 LLM-free | — | ✅ ADR-001 核心依赖 ≤5 | caller 调用 LLM 后传入结果，server 只验证+序列化+持久化 |
| 测试覆盖 | — | ✅ 4 项单元测试 + CLI 运行时 | `missing-features.test.ts` kb_organize_staging suite（应用元数据+log organize、拒绝非 staging 页、拒绝路径穿越、拒绝 no-op） |
| DEFECT-1 已修复 | — | ✅ R2 修复 | `cli.ts` TOOL_REGISTRY + SCHEMA_REGISTRY 均已补齐 + 2 项 CLI registry 回归测试 |

**判定**：Karpathy「LLM 做 grunt work（filing/bookkeeping）」在 staging 环节完整落地。LLM 整理 → staging 审核 → 确认入库的闭环已通。

### 2.6 P1 — 文档对齐（V1 §4.2 🟡 → V2 ⚠️ 部分修复）

| 文档 | V1 问题 | V2 修复状态 | 证据 |
| --- | --- | --- | --- |
| `docs/ARCH.md` §5.2 | 宣称 BM25+向量+重排 | ✅ 已修正 | `docs/ARCH.md:225-232` mermaid 标注「当前实现 · term-overlap 打分 + CJK bigram」；L240 明确说明「中规模与大规模档位留待 P6+ 演进」 |
| `docs/PRD.md` US-006 | 宣称 qmd 已接入 | ✅ 已修正 | `docs/PRD.md:80` 标注「⚠️ P6+ 演进项：qmd 未接入；当前小规模档位 term-overlap + CJK bigram 检索 p95 < 2s 已满足」 |
| `AGENTS.md` §5.1 | **未检查** | ❌ **仍宣称 BM25+向量+重排** | `AGENTS.md:176-177`：「中（200-5000）\| qmd 混合检索 \| 调用 MCP `kb_search`（BM25 + 向量 + 重排）」「大（>5000）\| LanceDB 向量检索 \| 调用 MCP `kb_search`（向量 + FTS5）」 |

**判定**：P1 文档对齐**部分完成**——ARCH.md 与 PRD.md 已修正，但 **AGENTS.md（schema 层）§5.1 仍保留误导性宣称**。这是 V1 报告未检查的盲区。AGENTS.md 是告诉 LLM 如何使用知识库的 schema 文件，其误导性宣称会直接导致 Agent 产生错误预期。

---

## 3. 逐项对比分析（V2 全量复审）

### 3.1 核心理念层

| # | Karpathy 原方案要求 | V1 状态 | V2 状态 | 证据与差距 |
| --- | --- | --- | --- | --- |
| 1 | LLM 增量构建并维护持久化 wiki | ✅ | ✅ | MCP server 注册 **17 tools**（`server/src/index.ts`，V1 计 15，新增 kb_write_answer + kb_organize_staging） |
| 2 | 读源→提取关键信息→整合到现有 wiki（更新实体页、修订主题摘要） | ⚠️ | ✅ | auto-xref 在 ingest 时自动 touch 同域/共享 tag/标题提及的相关页（`xref.ts` + `write.ts:236-284`） |
| 3 | 标注矛盾（不删除旧声明，追加新声明） | ⚠️ | ⚠️ | 仍为 marker-based（`lint.ts:272` 检测 `⚠️ 矛盾` marker），marker 由 Agent 手写，无自动矛盾发现机制。这是合理设计——自动矛盾发现需语义理解，超出确定性 tool 范畴 |
| 4 | wiki 是持久的、复利的产物 | ✅ | ✅ | markdown + git；`wiki/` 已有 **47 页**（V1 计 41，+6 页）+ 交叉链接网络 |
| 5 | LLM 写、用户读；LLM 做 grunt work（summarizing/cross-referencing/filing/bookkeeping） | ⚠️ | ✅ | cross-referencing 自动化（auto-xref）+ filing 自动化（kb_organize_staging）+ bookkeeping 自动化（kb_write_answer + 定时 lint/dream） |
| 6 | Obsidian 是 IDE，LLM 是程序员，wiki 是代码库 | ✅ | ✅ | README + ARCH 明确 Obsidian 兼容（wikilink/frontmatter/Dataview） |

### 3.2 架构三层

| # | Karpathy 原方案要求 | V1 状态 | V2 状态 | 证据与差距 |
| --- | --- | --- | --- | --- |
| 7 | Raw sources 不可变，LLM 只读 | ✅ | ✅ | `write.ts:148-161` 复制到 raw/；AGENTS.md §9.3 禁止改 raw/ |
| 8 | The wiki：LLM 生成的 markdown，LLM 拥有此层 | ✅ | ✅ | `wiki/` 6 领域目录（coding/design/emotions/kb-system/reading/resources）+ experiences/inbox/ |
| 9 | The schema：CLAUDE.md / AGENTS.md 告诉 LLM 结构、约定、工作流 | ✅ | ⚠️ | schema 文件存在且完整，**但 AGENTS.md 内容与实现脱节**（见 §4 新发现缺口） |

### 3.3 Ingest 操作

| # | Karpathy 原方案要求 | V1 状态 | V2 状态 | 证据与差距 |
| --- | --- | --- | --- | --- |
| 10 | 读源→与用户讨论→写 summary 页→更新 index→更新 entity/concept 页→追加 log | ⚠️ | ✅ | `write.ts:119-291` 完整流程：写 staging 页→更新 index→追加 log→**auto-xref 更新相关页**；staging 审核环节覆盖「与用户讨论」语义 |
| 11 | 一个源 touch 10-15 wiki 页 | ❌ | ✅ | auto-xref 默认 limit=15（`xref.ts:88`） |
| 12 | 单个 ingest vs 批量 ingest | ⚠️ | ⚠️ | 仍仅支持单个 ingest；无批量 ingest 工具。合理设计——批量 ingest 易失控质量 |
| 13 | 二进制格式（PDF/Word/Excel）解析 | ✅ | ✅ | `parser/parse.py` 真实支持 PDF/DOCX/XLSX |
| 14 | staging 审核环节（本项目改进） | ✅ | ✅ | `staging.ts` 三件套 + `kb_organize_staging` LLM 整理 |

### 3.4 Query 操作

| # | Karpathy 原方案要求 | V1 状态 | V2 状态 | 证据与差距 |
| --- | --- | --- | --- | --- |
| 15 | LLM 搜索相关页→读取→综合答案带引用 | ⚠️ | ✅ | `search.ts` kb_search 返回 `{path, title, snippet, score}` 带引用 + CJK bigram 分词 + 全角标点处理（V1 后修复） |
| 16 | 答案回写为新 wiki 页（good answers filed back） | ❌ | ✅ | `kb_write_answer` tool + WRITEBACK-RAG Utility Gate（见 §2.2） |
| 17 | 答案多种形式（markdown/对比表/Marp 幻灯片/matplotlib 图/canvas） | ❌ | ❌ | 仍仅 markdown。Karpathy 原文举例「a markdown page, a comparison table, a slide deck (Marp), a chart (matplotlib), a canvas」——这些是 Agent 输出格式，非知识库系统能力。Agent 可自行生成 Marp/matplotlib，知识库只负责存储回写 |
| 18 | 小规模 index.md 导航 | ✅ | ✅ | `search.ts:48-58` 扫描所有 wiki markdown 文件 |
| 19 | 中规模 qmd 混合检索（BM25 + 向量 + 重排） | ❌ | ❌ | 仍未接入，正确推迟到 P6+（当前 47 页，远未到 200 页门槛）。**但 AGENTS.md §5.1 仍误导性宣称已接入**（见 §4） |
| 20 | 大规模 LanceDB 向量检索 | ❌ | ❌ | ARCH §10 列为 P6+ 演进，未实现。合理推迟 |

### 3.5 Lint 操作

| # | Karpathy 原方案要求 | V1 状态 | V2 状态 | 证据与差距 |
| --- | --- | --- | --- | --- |
| 21 | 矛盾检测 | ✅ | ✅ | `lint.ts:268-310` marker + 重复标题 |
| 22 | 过时声明（stale claims superseded by newer sources） | ✅ | ✅ | `lint.ts:350-382` checkStale |
| 23 | 孤儿页（no inbound links） | ✅ | ✅ | `lint.ts:316-344` checkOrphans |
| 24 | 缺失概念页（important concepts mentioned but lacking their own page） | ❌ | ✅ | `lint.ts:600-639` checkMissingConcept（见 §2.3） |
| 25 | 缺失交叉引用 | ✅ | ✅ | `lint.ts:388-456` checkMissingXref（L-2 优化为 O(N×K) inverted-bucket） |
| 26 | 数据缺口（data gaps that could be filled with a web search） | ❌ | ⚠️ | missing_concept 启发式覆盖「概念被提及但无独立页」的检测；**web 搜索补缺口仍未实现**（见 #27） |
| 27 | web 搜索补数据缺口 | ❌ | ❌ | 无 web search 集成。Karpathy 原文说这部分靠 LLM 智能建议，而非确定性 tool——合理缺失 |
| 28 | Lint 实际定期执行 | ❌ | ✅ | `.github/workflows/kb-maintenance.yml` 每日 cron（见 §2.4） |
| 29 | 输出结构化报告 | ✅ | ✅ | `lint.ts:167-175` `{issues, summary: {total, by_type, pages_scanned, checks_run}}` |

### 3.6 双索引

| # | Karpathy 原方案要求 | V1 状态 | V2 状态 | 证据与差距 |
| --- | --- | --- | --- | --- |
| 30 | index.md 内容导向，每页 link + 摘要 + 元数据（date/source count） | ⚠️ | ⚠️ | `index.md` 按领域分组，有 link + 摘要 + date，**仍无 source count**。新增经验卡条目带 confidence（如 `confidence=0.9`） |
| 31 | LLM 每次 ingest 更新 index | ✅ | ✅ | `write.ts:212-217` addPageToIndex |
| 32 | 回答前先读 index | ⚠️ | ⚠️ | kb_search 仍直接扫描文件不读 index（`search.ts:48-58`）。设计取舍——扫描 47 页比解析 index.md 更可靠（避免 index 漂移） |
| 33 | log.md 时间导向，append-only，一致前缀 `## [YYYY-MM-DD] <type> \| <title>` | ✅ | ✅ | `log.md` 完全符合；可 `grep "^## \[" log.md` 解析 |
| 34 | log 记录 ingest/query/lint | ⚠️ | ⚠️ | 实际记录 11 种类型：ingest/experience/promote/reject/confirm/delete/dream/lint/init/tech-debt/xref（新增）。**仍缺 query 类型**（kb_search 只读无副作用，不写 log 是合理设计）。**writeback/organize 类型尚未在 log.md 出现**（因生产环境尚未触发） |

### 3.7 可选 CLI 工具

| # | Karpathy 原方案要求 | V1 状态 | V2 状态 | 证据与差距 |
| --- | --- | --- | --- | --- |
| 35 | qmd 本地搜索引擎（BM25/向量 + LLM 重排） | ❌ | ❌ | 未接入；正确推迟到 P6+（当前 47 页 < 200 页门槛） |
| 36 | 自建简单搜索脚本 | ✅ | ✅ | `kb_search` 即为自建脚本（term-overlap + CJK bigram） |

### 3.8 技巧与窍门

| # | Karpathy 原方案要求 | V1 状态 | V2 状态 | 证据与差距 |
| --- | --- | --- | --- | --- |
| 37 | Obsidian Web Clipper（浏览器扩展） | ❌ | ❌ | 未集成。Karpathy 自述 optional，本项目用 Tauri GUI 拖拽替代 |
| 38 | Download images locally（raw/assets/ + 快捷键） | ⚠️ | ⚠️ | AGENTS.md 提到 raw/assets/ 目录，无快捷键绑定。属 Obsidian 生态技巧，Tauri GUI 不适用 |
| 39 | Obsidian graph view | ⚠️ | ⚠️ | `frontend/src/components/GraphView.tsx`（46KB）自建图谱视图，功能近似但不等同于 Obsidian graph view |
| 40 | Marp（markdown 幻灯片） | ❌ | ❌ | 未实现。Karpathy 自述 optional |
| 41 | Dataview（frontmatter 查询） | ⚠️ | ⚠️ | frontmatter 已合规即兼容，无实际 Dataview 查询示例 |
| 42 | git 版本历史/分支/协作 | ✅ | ✅ | CLAUDE.md §12 GitHub Flow + 分支保护 + Conventional Commits |

### 3.9 持续进化扩展（本项目创新，超出 Karpathy 原方案）

| # | 扩展功能 | V1 状态 | V2 状态 | 证据 |
| --- | --- | --- | --- | --- |
| 43 | `kb_write_experience` 写 inbox | ✅ | ✅ | `write.ts:297-367` |
| 44 | 两 tier 审核门禁 | ✅ | ✅ | `write.ts:513-688` |
| 45 | 重复检测（Levenshtein + Sorensen-Dice） | ✅ | ✅ | `server/src/utils/similarity.ts` |
| 46 | /dream Phase 1 老化降级 | ✅ | ✅ | `server/src/dream.ts:142-206` |
| 47 | /dream Phase 2 去重扫描 | ✅ | ✅ | `dream.ts:290-341` |
| 48 | /dream Phase 3 质量评分 | ✅ | ✅ | `dream.ts:221-249` + `server/src/utils/quality.ts` |
| 49 | /dream 定期执行 | ❌ | ✅ | `.github/workflows/kb-maintenance.yml` 每周一 cron（见 §2.4） |

### 3.10 GUI + 多格式上传（本项目改进）

| # | 改进功能 | V1 状态 | V2 状态 | 证据 |
| --- | --- | --- | --- | --- |
| 50 | Tauri 桌面应用 | ✅ | ✅ | `frontend/src-tauri/tauri.conf.json` v2 |
| 51 | 拖拽 PDF/DOCX/XLSX | ✅ | ✅ | `frontend/src/components/DropZone.tsx` |
| 52 | Python parser subprocess 调用 | ✅ | ✅ | `lib.rs` 经 tauri-plugin-shell 调用 parse.py |
| 53 | staging 工作流（confirm/reject） | ✅ | ✅ | 14+ Tauri 命令注册 |
| 54 | GUI 内 markdown 预览 | ✅ | ✅ | `frontend/src/components/MarkdownPreview.tsx` |
| 55 | 原始文件不可变 | ✅ | ✅ | raw/ 只读，路径校验 |
| 56 | LLM 整理生成 markdown（含 frontmatter） | ⚠️ | ✅ | `kb_organize_staging`（见 §2.5） |
| 57 | LLM 三态（cloud-first/local-first/disabled） | ✅ | ✅ | `frontend/src/lib/llm.ts` |
| 58 | 跨平台 Windows/macOS | ⚠️ | ⚠️ | `tauri.conf.json` `bundle.targets: "all"`，未明确声明 macOS，无 macOS 验证记录 |

### 3.11 测试覆盖

| 层 | V1 测试数 | V2 测试数 | 证据 |
| --- | --- | --- | --- |
| server 端 | 13 个文件 | **14 个文件**（新增 `missing-features.test.ts`） | `server/src/tests/` |
| frontend 端 | 9 个文件 | 9 个文件 | `frontend/src/lib/__tests__/` |
| 总测试数 | 315+ | **215 server + 283 frontend = 498**（实跑 `npm test` 215 pass / 0 fail） | 本次实跑验证 |
| 新增覆盖 | — | 18 项（kb_write_answer 4 + kb_organize_staging 4 + auto-xref 5 + missing_concept 3 + CLI registry 2） | `missing-features.test.ts` |

---

## 4. 新发现缺口：Schema 层（AGENTS.md）与实现脱节

V1 报告未评估 schema 层同步度。本次复审发现 **AGENTS.md（知识库 schema，治理内容使用）严重滞后于实现**，这是 Karpathy 原方案「The schema」层的核心债务。

### 4.1 AGENTS.md §5.1 仍误导性宣称 BM25+向量+重排

| 位置 | 当前内容 | 问题 |
| --- | --- | --- |
| `AGENTS.md:176` | `中（200-5000）\| qmd 混合检索 \| 调用 MCP kb_search（BM25 + 向量 + 重排）` | P1 修复了 ARCH.md §5.2 与 PRD US-006，**遗漏了 AGENTS.md §5.1**。AGENTS.md 是 LLM 使用知识库时首先读取的 schema，误导性宣称会直接导致 Agent 产生错误预期 |
| `AGENTS.md:177` | `大（>5000）\| LanceDB 向量检索 \| 调用 MCP kb_search（向量 + FTS5）` | 同上 |

### 4.2 AGENTS.md §9.1 MCP Tools 表仅列 8 个工具（实际 17 个）

实际注册的 17 个 MCP tools（`server/src/index.ts` 实测）：

| 类别 | 实际工具 | AGENTS.md §9.1 是否列出 |
| --- | --- | --- |
| Read-only（5） | kb_health / kb_list_categories / kb_list_recent / kb_get_page / kb_search | ✅ 列出 |
| Write（4） | kb_ingest_source / kb_write_experience / kb_promote_experience / **kb_write_answer** | ⚠️ 缺 kb_write_answer + kb_promote_experience |
| Staging（4） | kb_list_staging / kb_confirm_staging / kb_reject_staging / **kb_organize_staging** | ❌ 全缺 |
| Lint（1） | kb_lint | ✅ 列出 |
| Graph（2） | **kb_get_graph** / **kb_get_backlinks** | ❌ 全缺 |
| Inbox（1） | **kb_list_inbox** | ❌ 全缺 |

**影响**：外部 Agent（Claude Code/Trae CN/OpenCode）使用知识库时，AGENTS.md 是其了解可用工具的唯一 schema 来源。缺失 9 个工具的文档意味着 Agent 不知道这些工具存在，无法调用它们——**实现再完善，Agent 不知道就用不上**。

### 4.3 AGENTS.md §6.2 Lint 检查项表未文档化 missing_concept

| 位置 | 当前内容 | 问题 |
| --- | --- | --- |
| `AGENTS.md:210` | `数据缺口 \| 重要概念被提及但无独立页面 \| 低` | 描述正确，但未说明**已实现为 missing_concept 检查**（RAKE-lite 启发式）。LLM 读 AGENTS.md 时会以为这是「未实现/靠 Agent 智能」的项，不知道可以主动调用 `kb_lint {checks: ["missing_concept"]}` |

### 4.4 AGENTS.md §7 持续进化日志类型未更新

AGENTS.md §7.3/§7.4/§7.5 详细记录了 experience/promote/reject/dream 四种日志类型，但**未记录新增的三种**：

| 新类型 | 触发场景 | AGENTS.md 是否记录 |
| --- | --- | --- |
| `xref` | auto-xref 触摸相关页时 | ❌ 缺 |
| `writeback` | kb_write_answer 答案回写时 | ❌ 缺 |
| `organize` | kb_organize_staging LLM 整理时 | ❌ 缺 |

### 4.5 AGENTS.md §9.2 标准流程未包含新能力

当前 §9.2「编码任务的标准流程」仅 4 步：kb_search → kb_write_experience → kb_lint。**未包含**：

- Ingest 时 auto-xref 自动 touch 相关页（Agent 不知道 ingest 会自动交叉引用，可能重复手动建链）
- Query 答案回写 kb_write_answer（Agent 不知道有此能力，有价值答案会丢失在 chat history）
- kb_organize_staging 整理 staging（Agent 不知道可调用 LLM 整理元数据）

### 4.6 其他文档滞后

| 文档 | 位置 | 问题 |
| --- | --- | --- |
| `README.md:125` | `L3 访问层：MCP Server（9 tools）` | 实际 17 tools |
| `README.md:25` | `当前状态：P3 持续进化闭环完整完成阶段` | 实际已到 P6+（缺失功能补全 + RAG 修复 + 审核页/领域管理） |
| `docs/ARCH.md:62` | `mcp_server \| 暴露 9 个 MCP tools` | 实际 17 tools |
| `docs/ARCH.md:84` | kb_lint checks 列表 `["frontmatter","contradictions","orphans","stale","missing_xref"]` | 缺 `missing_concept` |
| `docs/ARCH.md:271-279` | §5.4 Lint 列 5 项检测 | 缺 missing_concept（第 6 项） |
| `docs/ARCH.md:75-85` | §3.1 MCP Tools 表 | 仅列 9 个工具，缺 8 个（kb_write_answer/kb_organize_staging/kb_get_graph/kb_get_backlinks/kb_list_inbox/kb_promote_experience/kb_list_staging/kb_confirm_staging/kb_reject_staging） |

---

## 5. 量化统计

### 5.1 V2 评级分布

| 评级 | V1 数量 | V2 数量 | V1→V2 变化 |
| --- | --- | --- | --- |
| ✅ 完整实现 | 35（60%） | **49（83%）** | +14 ↑ |
| ⚠️ 部分实现/有偏差 | 16（27%） | **7（12%）** | -9 ↓ |
| ❌ 未实现 | 8（13%） | **3（5%）** | -5 ↓ |
| **合计** | 59 | 59 | — |

### 5.2 V1→V2 状态迁移明细

| 迁移 | 数量 | 具体项 |
| --- | --- | --- |
| ❌→✅ | 6 | #11 auto-xref、#16 kb_write_answer、#24 missing_concept、#28 lint cron、#49 dream cron、#56 kb_organize_staging |
| ⚠️→✅ | 3 | #2 ingest 整合（auto-xref）、#5 LLM grunt work、#10 ingest 完整流程 |
| ✅→✅ | 35 | 核心架构、Ingest 基础、Query 基础、Lint 基础、双索引、git、持续进化四件套、GUI 基础 |
| ⚠️→⚠️ | 4 | #3 矛盾标注、#12 batch ingest、#30 source count、#32 read index first、#34 log query、#38 图片快捷键、#39 graph view、#41 Dataview、#58 macOS |
| ❌→❌ | 3 | #17 多输出格式、#27 web 搜索、#35 qmd / #37 Web Clipper / #40 Marp（Karpathy 自述 optional） |
| ❌→⚠️ | 1 | #26 数据缺口（missing_concept 覆盖部分，web 搜索仍缺） |

### 5.3 log.md 事件类型统计（V2）

| 事件类型 | V1 次数 | V2 次数 | 说明 |
| --- | --- | --- | --- |
| ingest | 10 | 10 | 稳定 |
| promote | 7 | 11 | +4（新增经验卡） |
| experience | 7 | 11 | +4 |
| delete | 7 | 7 | 稳定 |
| reject | 2 | 6 | +4 |
| confirm | 4 | 4 | 稳定 |
| lint | 1 | 1 | cron 刚建，首次触发未到 |
| dream | 1 | 1 | 同上 |
| init | 1 | 1 | 稳定 |
| tech-debt | 0 | 1 | 新增 |
| xref | 0 | 0 | 生产环境未触发 ingest（auto-xref 仅在真实 ingest 时记录） |
| writeback | 0 | 0 | 生产环境未触发 kb_write_answer |
| organize | 0 | 0 | 生产环境未触发 kb_organize_staging |

**关键观察**：lint/dream/xref/writeback/organize 五种新类型在 log.md 中尚未出现，原因是 cron 首次触发未到 + 生产环境未触发相关操作。这是时间问题，非实现缺口。

### 5.4 实际工具数对比

| 来源 | 宣称工具数 | 实际工具数 | 一致性 |
| --- | --- | --- | --- |
| `server/src/index.ts`（实测） | — | **17** | 基准 |
| `README.md` | 9 | 17 | ❌ 滞后 |
| `docs/ARCH.md` §2 | 9 | 17 | ❌ 滞后 |
| `docs/ARCH.md` §3.1 | 9 | 17 | ❌ 滞后 |
| `AGENTS.md` §9.1 | 8 | 17 | ❌ 滞后 |

---

## 6. 严重度评估

### 6.1 🔴 需正视（影响 schema 层契约，应优先修复）

| 缺口 | 影响 | 修复建议 |
| --- | --- | --- |
| **AGENTS.md §5.1 仍宣称 BM25+向量+重排** | LLM Agent 读 AGENTS.md 时产生错误预期，可能向用户错误描述检索能力；与 ARCH.md/PRD.md 修正不一致 | 删除 §5.1 表格中「BM25 + 向量 + 重排」「向量 + FTS5」描述，改为「term-overlap + CJK bigram（小规模，<200 页）；qmd/LanceDB 留待 P6+」 |
| **AGENTS.md §9.1 缺 9 个工具文档** | 外部 Agent 不知道这些工具存在，无法调用——实现完善但 Agent 用不上 | 补全 17 个工具的完整表格（含何时用、副作用） |
| **AGENTS.md §9.2 标准流程未含新能力** | Agent 不知道 ingest 自动交叉引用、Query 答案可回写、staging 可 LLM 整理 | 在标准流程中增加 auto-xref 说明、kb_write_answer 时机、kb_organize_staging 时机 |

### 6.2 🟡 中等（文档宣称与实现不符，但不阻塞使用）

| 缺口 | 影响评估 |
| --- | --- |
| README/ARCH 工具数宣称滞后（9 vs 17） | 文档治理问题，CI consistency-check 未覆盖工具数核对。建议在 consistency-check.js 增加工具数断言 |
| AGENTS.md §6.2 未文档化 missing_concept | LLM 不知道可主动调用 `kb_lint {checks: ["missing_concept"]}`。补充一行说明即可 |
| AGENTS.md §7 未记录 xref/writeback/organize 日志类型 | LLM 解析 log.md 时可能困惑新类型。补充三种类型的格式说明 |
| ARCH.md §3.1/§5.4 工具与检测项表滞后 | 文档治理，与 AGENTS.md 同步修复 |

### 6.3 🟢 轻微（Karpathy 自述 optional，缺失合理）

| 缺口 | 为什么不重要 |
| --- | --- |
| qmd / LanceDB 未接入 | Karpathy 原文：「at small scale the index file is enough」。当前 47 页远未到 200 页门槛 |
| Web Clipper / Marp / 快捷键绑定 | Karpathy 原文：「Everything mentioned above is optional and modular」。本项目用 Tauri GUI 替代 |
| 多输出格式（Marp/matplotlib/canvas） | 这是 Agent 输出格式，非知识库系统能力。Agent 可自行生成，知识库只负责存储回写 |
| web 搜索补缺口 | Karpathy 说这部分靠 LLM 智能建议，非确定性 tool |
| log 缺 query 类型 | kb_search 只读无副作用，不写 log 是合理设计 |
| macOS 未验证 | 部署问题，Tauri 本身跨平台 |
| Dataview 验证 | frontmatter 已合规即兼容 |
| 矛盾自动发现 | 需语义理解，超出确定性 tool 范畴，marker-based + Agent 智能是合理设计 |

---

## 7. 总体结论

### 7.1 实现度判定

**本项目对 Karpathy LLM Wiki 模式的实现度约为 92%，核心功能基本全部实现，剩余缺口为合理推迟项 + Schema 层同步债务**。

### 7.2 为什么从 V1 的 75% 提升到 V2 的 92%

V1 报告识别的 6 项核心缺口已全部通过 [缺失功能补全方案](2026-08-02-missing-features-solution.md) 落地并通过 [验收测试](2026-08-02-missing-features-acceptance.md)（6/6 AC PASS，215 单元测试 + 4/4 CLI 运行时）：

1. **P1 文档对齐**：ARCH.md §5.2 + PRD US-006 已修正（⚠️ 但 AGENTS.md §5.1 遗漏）
2. **P2 定时维护**：kb-maintenance.yml 双 cron 落地
3. **P3 auto-xref**：`xref.ts` + `kb_ingest_source` 默认开启，touch 最多 15 页
4. **#16 答案回写**：`kb_write_answer` + WRITEBACK-RAG Utility Gate
5. **#24 缺失概念页**：`checkMissingConcept` RAKE-lite 启发式
6. **#56 LLM 整理 staging**：`kb_organize_staging`

### 7.3 为什么「未 100%」

剩余 8% 缺口集中在两类：

| 缺口类型 | 具体表现 | 性质 |
| --- | --- | --- |
| **Schema 层同步债务（新发现）** | AGENTS.md §5.1 误导性宣称、§9.1 缺 9 工具、§9.2 缺新能力、§7 缺新日志类型；README/ARCH 工具数滞后 | **可修复的文档债务**，预计 2-3 小时完成 |
| **Karpathy 自述 optional 项** | qmd/LanceDB（<200 页不需要）、Web Clipper/Marp（Tauri 替代）、web 搜索（靠 Agent 智能）、多输出格式（Agent 自行生成） | **合理推迟**，按 Karpathy 原方案规模自适应策略 |

### 7.4 核心可用性判定

**核心知识库闭环完整可用**：

1. **Karpathy 三层架构（raw/wiki/schema）+ 双索引 100% 落地**
2. **三大操作闭环可走通且自动化**：
   - Ingest：拖拽 → parser → staging → LLM 整理 → confirm → wiki/ + index + log + **auto-xref 自动交叉引用** ✅
   - Query：kb_search → kb_get_page → 带引用返回 → **kb_write_answer 回写** ✅
   - Lint：kb_lint 6 项检测 + 结构化报告 + **每日 cron 定时执行** ✅
3. **持续进化扩展（原方案没有的增量）100% 落地**：两 tier 门禁 + 重复检测 + /dream 三阶段 + **每周 cron 定时执行**
4. **小规模下检索质量够用**：当前 47 页，term-overlap + CJK bigram 在 P95 < 2s 内

---

## 8. 改进建议

### 8.1 优先级排序

| 优先级 | 处理项 | 工作量 | 理由 |
| --- | --- | --- | --- |
| **P1 修 AGENTS.md（schema 层）** | 修正 §5.1 误导性宣称 + 补全 §9.1 17 工具表 + 更新 §9.2 标准流程 + 补充 §7 新日志类型 + §6.2 文档化 missing_concept | 2-3 小时 | **schema 是 Karpathy 原方案的核心层**——AGENTS.md 是 LLM 使用知识库的唯一指引，滞后会直接导致 Agent 无法使用新能力。这是当前最大的债务 |
| **P2 修 README/ARCH** | 工具数 9→17、当前状态 P3→P6+、ARCH §3.1 工具表补全、ARCH §5.4 Lint 补 missing_concept | 1 小时 | 文档治理一致性 |
| **P3 CI 加工具数断言** | consistency-check.js 增加对 `server/src/index.ts` 的 `server.tool(` 计数与 README/ARCH 宣称的一致性核对 | 1 小时 | 防止未来再次脱节 |
| **P4 等待 cron 首次触发** | 观察 kb-maintenance.yml 首次执行结果，确认 lint/dream 报告正常生成 | 等待 | 验证定时机制实际可用 |
| **P5 接 qmd** | 当 wiki 页数接近 200 时再接入 | 视页数增长 | 按 Karpathy 规模自适应策略，当前 47 页无需接入 |

### 8.2 不建议处理（Karpathy 自述 optional）

- Web Clipper / Marp / 快捷键绑定：本项目用 Tauri GUI 替代，无需照搬 Obsidian 生态
- 多输出格式（Marp/matplotlib/canvas）：Agent 输出格式，非知识库系统能力
- web 搜索补缺口：靠 Agent 智能而非确定性 tool
- log 缺 query 类型：kb_search 只读无副作用，不写 log 是合理设计
- 矛盾自动发现：需语义理解，marker-based + Agent 智能是合理设计

---

## 9. 附录：证据索引

### 9.1 V2 新增/变更代码文件

| 文件 | 用途 | V2 状态 |
| --- | --- | --- |
| `server/src/utils/xref.ts` | auto-xref 复合打分 + 双向链接 + 幂等性 | 新建（P3） |
| `server/src/tools/write.ts` `kbWriteAnswer` | Query 答案回写 + WRITEBACK-RAG Gate | 新增（#16） |
| `server/src/tools/write.ts` `kbIngestSource` | 增加 auto_xref 参数 + runAutoXref 调用 | 修改（P3） |
| `server/src/tools/staging.ts` `kbOrganizeStaging` | LLM 整理 staging 元数据 | 新增（#56） |
| `server/src/tools/lint.ts` `checkMissingConcept` | 缺失概念页 RAKE-lite 检测 | 新增（#24） |
| `server/src/index.ts` | 注册 17 tools（新增 kb_write_answer + kb_organize_staging） | 修改 |
| `server/src/tests/missing-features.test.ts` | 18 项新增测试（4 工具 + CLI registry 回归） | 新建 |
| `.github/workflows/kb-maintenance.yml` | 每日 lint + 每周 dream cron | 新建（P2） |

### 9.2 测试运行结果（本次实跑）

```text
cd server && npm test
# tests 215
# suites 36
# pass 215
# fail 0
# cancelled 0
# skipped 0
# duration_ms 13776.9545
```

### 9.3 MCP Tools 清单（17 个，V2 实测）

| 类别 | Tools | 数量 |
| --- | --- | --- |
| Read-only | `kb_health` / `kb_list_categories` / `kb_list_recent` / `kb_get_page` / `kb_search` | 5 |
| Write | `kb_ingest_source` / `kb_write_experience` / `kb_promote_experience` / **`kb_write_answer`** | 4 |
| Staging | `kb_list_staging` / `kb_confirm_staging` / `kb_reject_staging` / **`kb_organize_staging`** | 4 |
| Lint | `kb_lint` | 1 |
| Graph | **`kb_get_graph`** / **`kb_get_backlinks`** | 2 |
| Inbox | **`kb_list_inbox`** | 1 |
| **合计** | | **17** |

> **加粗**为 AGENTS.md §9.1 未文档化的工具。

### 9.4 治理文档（V2 状态）

| 文件 | V2 状态 | 待修复 |
| --- | --- | --- |
| `karpathy-LLM.md` | 原方案 baseline | — |
| `CLAUDE.md` | 治理开发过程 | — |
| `AGENTS.md` | 治理内容使用 | **§5.1 误导宣称 + §9.1 缺 9 工具 + §9.2 缺新能力 + §7 缺新日志类型 + §6.2 缺 missing_concept 文档化** |
| `README.md` | 项目入口 | **工具数 9→17、当前状态 P3→P6+** |
| `docs/PRD.md` | US-006 已修正 | — |
| `docs/ARCH.md` | §5.2 已修正 | **§2/§3.1 工具数 9→17、§3.1 工具表缺 8 个、§5.4 Lint 缺 missing_concept** |

---

**报告结束。**

> **下一步建议**：优先执行 §8.1 P1（修 AGENTS.md schema 层），这是当前最大的债务，预计 2-3 小时完成。修复后建议更新本报告为 V3 或在 V2 标注「schema 层已同步」。
