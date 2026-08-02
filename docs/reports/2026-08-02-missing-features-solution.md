# Karpathy 缺失功能补全 · 方案设计与实施记录

| 项目 | 内容 |
| --- | --- |
| 任务令牌 | TKN-KARPATHY-FIX-002 |
| 执行 Agent | 主 Agent（GLM-5.2） |
| 日期 | 2026-08-02 |
| 上游报告 | [2026-08-02-karpathy-implementation-analysis.md](2026-08-02-karpathy-implementation-analysis.md) |
| 引用规约 | 全文使用相对路径引用代码（ADR-010） |
| 治理依据 | CLAUDE.md §7.2 审查-测试闭环、§10 guardrail-enforcer、§11 ac-verifier |

---

## 0. 目标与范围

依据 `docs/reports/2026-08-02-karpathy-implementation-analysis.md` 识别的缺失功能，本方案通过「联网案例研究 + 源码考古 + 推理」形成可落地方案，并完成实施。

**覆盖项**：

| # | 缺口 | 优先级 | 报告章节 |
| --- | --- | --- | --- |
| P1 | 文档宣称与实现不符（BM25+向量+重排 vs 实际 term-overlap） | P1 | §2.4 #15、§4.2 |
| P2 | Lint 与 /dream 未定期执行 | P2 | §2.5 #28、§2.9 #49、§4.1 |
| P3 | Ingest 不自动 touch 5-15 页交叉引用 | P3 | §2.3 #11、§4.1 |
| #16 | Query 答案回写无 tool 实现 | P3 | §2.4 #16、§4.2 |
| #24 | 缺失概念页检测未实现 | 中 | §2.5 #24 |
| #56 | LLM 整理生成 staging 内容缺失 | 中 | §2.10 #56 |

**不实施项**（报告 §6.2 已说明属合理设计取舍）：Web Clipper / Marp / 快捷键绑定 / Dataview 验证 / log 缺 query 类型 / qmd LanceDB（<200 页不需要）。

---

## 1. 联网案例研究关键发现

> 来源：两个联网研究 Agent 的综合报告。每个问题均找到 ≥3 个权威案例（开源实现 + 学术论文 + 生产案例）。

### 1.1 自动交叉引用（P3 / #11）

| 来源 | 关键思路 |
| --- | --- |
| [Cross-Linker skill](https://www.skill4agent.com/en/skill/ar9av-obsidian-wiki/cross-linker) | 5 步算法：页面注册表 → 扫描缺失链接 → 复合打分（精确名匹配 +4、共享 tags≥2 +2、同目录无链接 +2、实体提及 +2）→ 三档置信度门控（≥6 自动应用 / 3-5 推荐应用 / 1-2 跳过）→ 仅链接首次自然提及 |
| [LLM Wiki 4-signal](https://www.aitoolnet.com/llm-wiki) | 4 加权信号：直接 wikilinks ×3.0、共享源文件 ×4.0、Adamic-Adar 邻域重叠 ×1.5、类型亲和度 ×1.0；Two-Step CoT Ingest（先分析后综合） |
| [Semantic Note Network](https://katrina.dotzlaw.com/articles/obsidiannotes/03semanticnoteletwork/) | 嵌入向量 + 余弦相似度 + top-K → 双向链接；1024 孤立笔记生成 2757 链接 |
| [MindStudio Claude Code + Obsidian](https://www.mindstudio.ai/blog/build-llm-wiki-knowledge-base-obsidian-claude-code) | CLAUDE.md 强制约定「保存前先扫描现有笔记标题/标签」；inbox→notes staging 流程让早期笔记成为后续笔记上下文 |

**核心结论**：复合打分 + 双向链接是行业共识；轻量场景用规则打分（零成本），高质量场景用 LLM 语义判定。**避免过度链接**：只链接首次自然提及、跳过常见词、不重复链接、不链接代码块/frontmatter 内。

### 1.2 GitHub Actions 定时维护（P2）

| 来源 | 关键思路 |
| --- | --- |
| [cronjobpro 完整指南](https://cronjobpro.com/blog/github-actions-scheduled-workflows) | `on.schedule.cron` 必须单引号、5 字段、UTC-only、最短 5 分钟间隔；60 天无活动自动禁用；多 cron 可叠加 |
| [cronbuilder 5 陷阱](https://cronbuilder.dev/blog/github-actions-cron-schedule.html) | 仅默认分支生效、fork 默认禁用、DOM+DOW 是 OR 语义、高峰延迟 5-30 分钟、避开整点 :00/:30 |
| [Markdown Automation Workflows](https://blog.markdowntools.com/posts/markdown-automation-workflows-complete-guide) | 四触发挂 `push`/`pr`/`schedule`/`workflow_dispatch`；`upload-artifact@v4` + `retention-days` 存档报告 |
| [CronSignal 排障](https://cronsignal.io/troubleshoot/github-actions-cron-not-running) | 静默失败无通知；必须幂等 job；外部 heartbeat ping 监控；`workflow_dispatch` 用于功能分支测试 |

**核心结论**：cron 必须在 main 分支生效、幂等（`/dream` 已幂等回写 quality_score，ADR-011）、加 heartbeat、artifact 存档、`workflow_dispatch` 手动触发。

### 1.3 LLM 整理生成 frontmatter/摘要（#56）

| 来源 | 关键思路 |
| --- | --- |
| [MDKeyChunker 论文](https://arxiv.org/pdf/2603.23533) | 单次 LLM 调用提取 7 字段（title/summary/keywords/entities/questions/key/related_keys）；Rolling Key 字典（LRU 上限 40）避免同义词增殖；API 失败降级保留 parser 字段 |
| [MarkItDown](https://blog.csdn.net/sinat_28461591/article/details/148048165) | 多格式 → Markdown 统一输出；模块化路由；GPT-4 增强图像理解 |
| [any2md](https://pypi.org/project/any2md/) | 固定 YAML frontmatter 契约；启发式标题精炼；多 lane 设计 |
| [Taotoken 聚合 API](https://blog.csdn.net/weixin_42511832/article/details/160946928) | 两段式 prompt（≤150 字摘要 + 3-5 标签）+ 严格 JSON 输出 + 正则容错提取 + temperature=0.3 + 截断 6000 字控成本 |

**核心结论**：单次 LLM 调用提取多字段（O(n) vs O(n·m)）；严格 JSON Schema 校验；解析失败降级保留 parser 字段；遵循 DEF-008 frontmatter 格式约定。

### 1.4 缺失概念页检测（#24）

| 来源 | 关键思路 |
| --- | --- |
| [longtermwiki Gap Analysis](https://www.longtermwiki.com/wiki/E762) | 真实生产案例：639 页 wiki 识别 100 缺失页；扫描所有页面 EntityLinks 数量找「高提及但无独立页」；priority_score = importance × quality |
| [ConExion 论文](https://arxiv.org/pdf/2504.12915) | LLM 概念抽取优于 TF-IDF/YAKE/TextRank/keyBERT；区分 extractive（present）vs abstractive（absent）keyphrases |
| [无监督关键词提取对比](https://blog.csdn.net/beingstrong/article/details/135326517) | TF-IDF 简单高效但漏低频重要词；TextRank 基于 PageRank 共现构图；RAKE 停用词分割 + degree/frequency 打分，无需训练 |
| [zetl CLI](https://zetl.anuna.io/finding/finding-orphans-and-dead-links/) | dead links + orphans + syntax errors 三类检查；`--fail-on error` 退出码做 CI gate；`--json` 输出供 dashboard |

**核心结论**：用「EntityLinks 提及计数」作主信号，配合 RAKE/TextRank 抽取候选概念；过滤已有页面 + 停用词；阈值门控（mention_count ≥ N 触发建议）；LLM 二次验证避免高频但泛化词误判。

### 1.5 Query 答案回写（#16）

| 来源 | 关键思路 |
| --- | --- |
| [WRITEBACK-RAG 论文](https://arxiv.org/pdf/2603.25737) | 两阶段门控：Utility Gate（检索是否获益）+ Document Gate（哪些文档贡献知识）；LLM Distiller 融合压缩为 encyclopedic 风格知识单元；独立索引 K' = K ∪ K_wb 保持原库洁净 |
| [Caching Strategies for RAG](https://nemorize.com/roadmaps/2026-modern-ai-search-rag-roadmap/lessons/caching-strategies) | 四层缓存；Freshness vs Performance 权衡；版本化策略新建 KB_v2 集合供回滚 |
| [ylanglabs LLM Wiki](https://ylanglabs.com/blogs/llm-wiki) | 「Markdown 不是核心，Writeback 才是」；`wiki/topics/answers/candidates/` 目录；回写先进 candidates 暂存审核 |
| [RAG/Wiki/Memory 三层分工](https://www.datacamp.com/tr/blog/llm-wiki) | Wiki 仅记「经过整理的理解」；回写仅适用于综合多文档产生新理解的答案，简单事实查找不回写 |

**核心结论**：回写是选择动作而非默认；门控条件（综合 ≥2 页或引入新论断）；复用 ADR-011 去重算法（Levenshtein + Sorensen-Dice）；encyclopedic 风格改写；走 inbox 两 tier 门禁；标注 `source_task: "query-writeback"` 便于回滚。

---

## 2. 源码考古关键发现

> 来源：code-archaeologist Agent 对 server/src 关键文件的深度分析。

### 2.1 现有实现基线

| 文件 | 现状 | 扩展点 |
| --- | --- | --- |
| [server/src/tools/write.ts](../../server/src/tools/write.ts) | `kbIngestSource` L118-L231：写 staging 页 + index + log；不 touch 相关页 | 在 index/log 更新后追加 auto-xref pass |
| [server/src/tools/lint.ts](../../server/src/tools/lint.ts) | `ALL_CHECKS` L37-L43 注册 5 项检测；`checkMissingXref` L374-L441 已用 (domain,tag) 倒排桶 O(N×K) | 新增 `missing_concept` check + 注册到 ALL_CHECKS |
| [server/src/tools/search.ts](../../server/src/tools/search.ts) | `kbSearch` L35-L102：term-overlap + CJK bigram；无 BM25/向量 | 文档对齐（不改实现） |
| [server/src/dream.ts](../../server/src/dream.ts) | `dream()` L112-L273 三阶段已幂等；`isMain` L367-L376 绑定 `npm run dream` | GitHub Actions 调用 `npm run dream` + `npm test` |
| [server/src/index.ts](../../server/src/index.ts) | L71-L182 注册 15 tools；`server.tool(name, desc, schema, handler)` 模式 | 新增 `kb_write_answer` tool 注册 |
| [server/src/schemas.ts](../../server/src/schemas.ts) | ZodRawShape 模式；`DOMAIN_REGEX` L47 防路径穿越 | 新增 `kbWriteAnswerSchema` |
| [server/src/utils/pages.ts](../../server/src/utils/pages.ts) | `PageInfo` L20-L34 含 frontmatter/body/links/tags/domains；`loadAllPages` L47-L102 | auto-xref 与 missing_concept 复用 |
| [server/src/utils/log.ts](../../server/src/utils/log.ts) | `appendLogEntry` L67-L80 自动 sanitize CWE-117；type 是开放字符串 | 新增 type `writeback`、`xref` |
| [server/src/utils/index-md.ts](../../server/src/utils/index-md.ts) | `addPageToIndex` L43-L90；`removePageFromIndex` L93-L99 | auto-xref 不动 index，仅追加 `## Related` 节 |

### 2.2 关键约束（必须遵守）

1. **DEF-001 原子写**：所有新文件用 `writeFile(path, content, "wx")` create-only，EEXIST/EPERM 友好提示（见 [write.ts:511-515](../../server/src/tools/write.ts#L511-L515)）。
2. **DEF-007 type 命名**：log.md 的 type 必须用 distinct 名（避免 MD024 重复 heading），如 `writeback`、`xref` 而非 `experience`。
3. **ADR-008 格式约定**：frontmatter `domain: [coding]` 单行 flow、`date: 2026-08-02` 无引号、`---` 后空行；`serializeFrontmatter` 已强制。
4. **ADR-011 去重**：标题 Levenshtein > 0.9 或内容 Sorensen-Dice bigram > 0.7 视为重复；复用 [utils/similarity.ts](../../server/src/utils/similarity.ts)。
5. **CWE-117 日志注入**：所有用户输入经 `sanitizeLogField`（[log.ts:62-64](../../server/src/utils/log.ts#L62-L64)）。
6. **路径穿越**：domain 经 `DOMAIN_REGEX` schema 校验 + 运行时 `path.relative` 二次校验（[write.ts:175-178](../../server/src/tools/write.ts#L175-L178)）。
7. **AGENTS.md §9.3 禁止**：不跳过 inbox 直接写正式经验页（query-writeback 必须走 inbox → 两 tier 门禁）。
8. **AGENTS.md frontmatter `related`**：纯路径数组，禁用 `[[...]]` wikilink（js-yaml 解析多 wikilink 失败）。

---

## 3. 解决方案设计

### 3.1 P1 文档对齐（ARCH.md / PRD.md）

**问题**：[docs/ARCH.md §3.1](../../docs/ARCH.md) 表格与 §5.2 mermaid 宣称「BM25 + 向量 + 重排」，实际 [search.ts](../../server/src/tools/search.ts) 是 term-overlap + CJK bigram。[docs/PRD.md US-006](../../docs/PRD.md) 验收标准也宣称「BM25+向量检索」。

**方案**：

- ARCH.md §3.1 `kb_search` 输出契约保留不变（实现确实返回 `{path,title,snippet,score}`），但补一行注释说明打分算法；§5.2 mermaid 的「qmd BM25 + 向量混合」改为「term-overlap + CJK bigram（小规模方案）」。
- PRD.md US-006 验收标准第二项「BM25+向量检索 p95 < 2s」修正为「term-overlap + CJK bigram 检索 p95 < 2s」，并说明 qmd/LanceDB 留待 P6+。
- 不改实现（小规模下 term-overlap 够用，Karpathy 原文 <200 页 index.md 即可）。

**风险**：P0 微小（仅文档），按 CLAUDE.md §7.4 仅需 `guardrail-enforcer` 快速审查。

### 3.2 P2 GitHub Actions 定时维护

**问题**：`log.md` 中 `lint` 类型事件仅 1 次、`dream` 类型仅 1 次，均未定期执行。

**方案**：新增 `.github/workflows/kb-maintenance.yml`，双 cron + workflow_dispatch：

```yaml
name: kb-maintenance
on:
  schedule:
    - cron: '17 2 * * *'    # 每日 02:17 UTC 跑 lint（避开整点 :00/:30 高峰）
    - cron: '23 3 * * 1'    # 每周一 03:23 UTC 跑 dream
  workflow_dispatch:
    inputs:
      task:
        description: 'lint | dream | full-audit'
        required: true
        default: 'lint'
```

**关键设计**：

- **幂等保证**：`/dream` 已幂等回写 quality_score（[dream.ts:230-235](../../server/src/dream.ts#L230-L235)）；`kb_lint` 只读无副作用。
- **报告存档**：跑完后 `upload-artifact@v4` 上传 `docs/reports/YYYY-MM-DD-kb-{lint|dream}.md`，`retention-days: 90`。
- **不自动 commit**：报告作为 artifact，避免 CI bot 写 main 分支触发额外 CI（CLAUDE.md §12 GitHub Flow 要求 PR）。
- **失败重试**：脚本内 `||` 重试 1 次 + `timeout-minutes: 15` + `continue-on-error: false`。
- **heartbeat**：可选 ping（本期不强制，留 P6+）。
- **路径**：仅 main 分支生效；workflow_dispatch 供功能分支测试。

**风险**：P1 常规（新增 CI 文件，不改业务代码）。

### 3.3 P3 Ingest auto-xref

**问题**：`kbIngestSource` 仅 touch 1 staging 页 + index + log = 3 处，未实现 Karpathy「一个源 touch 5-15 页」核心论点。

**方案**：在 `kbIngestSource` 内追加可选 auto-xref pass（默认启用，可通过参数关闭）：

```typescript
// 新增参数
auto_xref?: boolean  // default true

// 流程
1. 写完 staging 页后
2. loadAllPages() 加载所有非 pending/archived 页
3. 用复合打分找候选页（同域 +4、共享 tag≥1 +2、标题/body 提及新页标题 +3）
4. 取 top 5-15 候选
5. 在候选页 body 末尾追加 `## Related` 节，写入 `[[wiki/<domain>/<slug>]]` 链接 + 一句话
6. 同时在新 staging 页 frontmatter `related` 字段追加候选路径数组
7. log.md 追加 type=xref 条目记录 touched pages
```

**关键设计**：

- **避免重复**：先检查候选页 body 是否已含新页链接，已含则跳过。
- **不破坏现有内容**：仅在 body 末尾追加 `## Related` 节；若已有该节，追加到节内。
- **frontmatter `related` 数组**：纯路径，禁 `[[...]]`（ADR-008）；用 `serializeFrontmatter` 重新序列化整页。
- **错误隔离**：单个候选页更新失败不中断，记 stderr 继续（CLAUDE.md §19.4）。
- **不走 inbox**：auto-xref 是 ingest 的辅助操作，不是经验卡，不走两 tier 门禁。
- **保留可关闭**：`auto_xref: false` 跳过（用于测试或大批量 ingest）。

**风险**：P2 跨模块（修改 ingest 接口契约 + 写已存在 wiki 页），需写 ADR-012 记录决策。

### 3.4 #16 Query 答案回写

**问题**：AGENTS.md §5.2 step 5 标注「可选」但无 tool 实现。

**方案**：新增 `kb_write_answer` tool，走经验卡 inbox → 两 tier 门禁：

```typescript
// schema
{
  title: string,
  domain: string,
  content: string,        // 已 encyclopedic 风格改写的答案
  confidence: number,
  source_query: string,   // 触发回写的原始 query
  cited_pages: string[],  // 答案引用的 wiki 页路径
}

// 流程
1. 校验 cited_pages 至少 2 个（门控：综合 ≥2 页才回写）
2. 用 ADR-011 算法对同 domain active experience 卡做去重检测
3. 写入 wiki/<domain>/experiences/inbox/<slug>.md
   frontmatter: type=experience, status=pending,
                source_task="query-writeback:<source_query>",
                related=cited_pages
4. log.md 追加 type=writeback 条目
5. 不自动 promote（人工 review 通过 kb_promote_experience）
```

**关键设计**：

- **门控条件**：`cited_pages.length >= 2`（WRITEBACK-RAG Utility Gate 简化版）；不满足返回错误。
- **去重前置**：写入前用 `findDuplicateExperiences` 检测，疑似重复返回警告但不阻断（人工 review 决定）。
- **encyclopedic 风格**：caller（Agent）负责改写；tool 只负责落盘 + 日志。
- **source_task 命名**：`query-writeback:<原 query 前 50 字>`，便于回滚 grep。
- **type=writeback**：DEF-007 distinct type，避免与 `experience` MD024 冲突。
- **走 inbox**：AGENTS.md §9.3 禁止跳过 inbox 直接写正式页。

**风险**：P1 常规（新增 tool，不改现有接口）。

### 3.5 #24 缺失概念页检测

**问题**：lint.ts L11-L12 注释「intentionally omitted — requires heuristic judgment」；报告 §2.5 #24 标 ❌。

**方案**：在 lint.ts 新增 `missing_concept` check，启发式 + 阈值门控：

```typescript
// 算法
1. 收集所有非 pending/archived 页的 title + frontmatter tags + body H1/H2 标题
   → 构建已有概念词典（lowercase）
2. 用 RAKE-lite 算法从所有页 body 抽取候选短语
   （停用词分割 + degree/frequency 打分，无需训练）
3. 过滤：长度 < 2 词、含数字、纯停用词、已在概念词典中
4. 统计每个候选短语在所有页 body 的提及次数（case-insensitive）
5. 排序：mention_count desc
6. 输出 top-N（默认 20）作为 low severity issues
   detail: 候选概念 + 提及次数 + 出处页面 top 3
   suggestion: 考虑为「<concept>」建立独立概念页

// 阈值
MENTION_THRESHOLD = 5  // <5 次提及不报告
TOP_N = 20             // 最多报告 20 个候选
```

**关键设计**：

- **low severity**：避免噪音；不影响 lint 整体 high/mid 信号。
- **RAKE-lite**：纯统计，无 LLM 调用，确定性（符合 lint 性质）。
- **过滤已有概念**：title + tags + H1/H2 都算「已有独立页」。
- **CJK 支持**：CJK 不分词，用 2-4 字符滑动窗口作候选（参考 search.ts CJK bigram）。
- **可关闭**：`kb_lint` 的 `checks` 参数支持排除 `missing_concept`。
- **更新 schema**：[schemas.ts](../../server/src/schemas.ts) `kbLintSchema.checks` enum 追加 `missing_concept`。

**风险**：P1 常规（lint 内部新增 check，不改接口契约）。

### 3.6 #56 LLM 整理 staging

**问题**：DropZone 有 LLM 分类建议，但 staging 内容直接来自 parser 转换，未经 LLM 整理生成 frontmatter/标签/摘要。

**方案**：server 端新增 `kb_organize_staging` tool（LLM 整理 staging 内容）：

```typescript
// schema
{
  page_path: string,    // staging 页路径
  // LLM 由 caller 注入（Tauri 通过 call_llm_api 调用，server 端不直接调 LLM）
}

// 流程
1. 读取 staging 页 body（parser 转换后的纯 markdown）
2. 截断至 6000 字控成本
3. 构造 prompt（system + user），要求 LLM 返回严格 JSON：
   {
     "title": "...",
     "summary": "≤150 字",
     "tags": ["...", "..."],
     "domain_suggestion": "coding|emotions|...",
     "frontmatter": { title, domain, type, status, date, tags }
   }
4. 解析 JSON（失败则保留 parser 字段，返回 warning）
5. 用 serializeFrontmatter 重新写 staging 页（保留原 body）
6. 返回整理结果 + domain_suggestion
```

**关键设计**：

- **LLM 由 caller 注入**：server 端不内置 LLM client（保持依赖 ≤5，ADR-001）；caller（Tauri/Agent）负责调 LLM 后传回结果。这避免 server 端引入新依赖。
- **重新设计**：实际上 tool 接收 `llm_result` 参数（caller 已调 LLM），server 端只做「校验 + 序列化 + 落盘」。
- **降级策略**：JSON 解析失败保留 parser 字段（MDKeyChunker 模式）。
- **DEF-008 格式**：`serializeFrontmatter` 强制 flow 风格。
- **不动 body**：只更新 frontmatter；body 由用户在 staging 阶段手动编辑。
- **不自动 confirm**：整理后仍是 status=staging，等用户 confirm_staging。

**修正方案（更简洁）**：改为 `kb_organize_staging` 接收 caller 传来的 LLM 整理结果（title/summary/tags/domain_suggestion），server 端只负责校验 + 落盘 + 返回。这样 server 端零 LLM 依赖，符合 ADR-001。

**风险**：P1 常规（新增 tool）。

---

## 4. 实施计划与顺序

| 阶段 | 任务 | 文件 | 风险等级 |
| --- | --- | --- | --- |
| 1 | P1 文档对齐 | docs/ARCH.md、docs/PRD.md | P0 |
| 2 | P2 GitHub Actions | .github/workflows/kb-maintenance.yml（新） | P1 |
| 3 | #24 missing_concept check | server/src/tools/lint.ts、server/src/schemas.ts | P1 |
| 4 | #16 kb_write_answer | server/src/tools/write.ts、server/src/schemas.ts、server/src/index.ts | P1 |
| 5 | P3 ingest auto-xref | server/src/tools/write.ts、server/src/schemas.ts、server/src/utils/xref.ts（新） | P2 |
| 6 | #56 kb_organize_staging | server/src/tools/staging.ts、server/src/schemas.ts、server/src/index.ts | P1 |
| 7 | 新增 ADR-012 | docs/decisions/ADR-012-auto-xref-and-writeback.md | — |
| 8 | 单元测试 | server/src/tests/{xref,write-answer,missing-concept,organize-staging}.test.ts | — |
| 9 | guardrail-enforcer 审计 | docs/reports/2026-08-02-karpathy-fix-guardrail.md | — |
| 10 | ac-verifier 验收 | docs/reports/2026-08-02-karpathy-fix-acceptance.md | — |
| 11 | 更新 index.md/log.md + 经验卡 | index.md、log.md、wiki/kb-system/experiences/inbox/ | — |

---

## 5. 验收标准（自检 + 子 Agent）

### 5.1 功能验收

- [ ] P1：ARCH.md §3.1/§5.2 与 PRD.md US-006 不再宣称「BM25+向量+重排」，与 search.ts 实现一致。
- [ ] P2：`.github/workflows/kb-maintenance.yml` 存在，含双 cron + workflow_dispatch，`npm run dream` 与 `npm test` 跑通。
- [ ] P3：`kb_ingest_source` 新增 `auto_xref` 参数（默认 true），ingest 后 top 5-15 相关页 frontmatter `related` 与 body `## Related` 节被更新，log.md 追加 `xref` 条目。
- [ ] #16：`kb_write_answer` tool 注册成功，`cited_pages < 2` 拒绝，写入 inbox 走两 tier 门禁，log.md 追加 `writeback` 条目。
- [ ] #24：`kb_lint` 含 `missing_concept` check，输出 low severity issues，`checks` 参数可排除。
- [ ] #56：`kb_organize_staging` tool 注册成功，接收 LLM 结果后落盘 frontmatter，JSON 解析失败降级保留原字段。

### 5.2 非功能验收

- [ ] 全部既有单元测试通过（无回归）。
- [ ] 新增功能均有单元测试覆盖（≥80% 分支）。
- [ ] guardrail-enforcer 审计通过（无高危安全漏洞、无质量缺陷）。
- [ ] ac-verifier 验收通过（性能回退 < 20%、基础安全检查通过）。
- [ ] frontmatter 格式遵循 DEF-008（serializeFrontmatter 强制）。
- [ ] 日志遵循 CWE-117 sanitize（appendLogEntry 强制）。
- [ ] 路径穿越防御完整（DOMAIN_REGEX + path.relative 二次校验）。

---

## 6. 风险与缓解

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| auto-xref 误链（低质量链接污染） | 中 | 复合打分阈值门控 + 仅追加 `## Related` 节不 inline + 可关闭 + 人工 review |
| missing_concept 噪音（高频泛化词） | 中 | RAKE 停用词过滤 + 长度/词数阈值 + low severity + top-N 限制 |
| kb_write_answer 滥用（污染 inbox） | 中 | 门控 cited_pages ≥ 2 + 不自动 promote + 走两 tier 审核 + source_task 标识 |
| GitHub Actions cron 静默失败 | 低 | workflow_dispatch 手动测试 + artifact 存档 + 失败重试 |
| 文档对齐遗漏 | 低 | CI consistency-check 已存在（.github/workflows/docs.yml） |

---

## 7. 附录：联网案例来源汇总

| 问题 | 最权威来源 | 类型 |
| --- | --- | --- |
| 1. 自动交叉引用 | cross-linker skill + LLM Wiki + Semantic Note Network | 开源 + 学术 |
| 2. GH Actions 定时 | cronjobpro + cronbuilder + Markdown Automation | 权威教程 |
| 3. LLM frontmatter | MDKeyChunker 论文 + MarkItDown + Taotoken | 学术 + 开源 |
| 4. 缺失概念页 | longtermwiki Gap Analysis + ConExion + zetl | 生产 + 学术 |
| 5. Query 回写 | WRITEBACK-RAG 论文 + ylanglabs + Caching Strategies | 学术 + 实战 |

---

**方案文档结束。** 实施细节见后续 git commit 与 guardrail/acceptance 报告。
