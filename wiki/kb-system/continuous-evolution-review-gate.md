---
title: "持续进化门禁：两 Tier 审核与老化"
domain: [kb-system]
type: concept
status: active
date: 2026-07-26
tags: [kb-system, evolution, review-gate, aging]
related: [wiki/kb-system/page-types-and-state-machine, wiki/kb-system/dual-index-mechanism]
---

## 概念

经验卡片从 `pending`（inbox）到 `active`（正式）需经过**两 Tier 审核门禁**。这是本知识库区别于普通 RAG 的核心扩展：编码实践中发现的更好方案，自动沉淀回知识库，但通过门禁保证质量。

## 两 Tier 门禁

| Tier | 条件 | 动作 | 占比 |
| --- | --- | --- | --- |
| Tier 1（自动） | `confidence ≥ 0.8` 且单域且非重复 | 自动提升为正式页（status=active，移出 inbox） | ~90% |
| Tier 2（人工） | `confidence < 0.8` 或跨域或疑似重复 | 进入人工审核队列 | ~10% |

### Tier 1 自动提升判定

```typescript
const tier = confidence >= 0.8 && isSingleDomain && !isDuplicate ? "auto" : "manual";
```

注意：tier 仅标记「如何提升」（auto vs manual），不改变提升动作本身。一旦人工调用 `kb_promote_experience(action="promote")`，两种 tier 都执行相同的提升流程。

### 重复检测（已实现，ADR-011）

promote 时实时检测，扫描同 domain 的 `type=experience, status=active` 卡片：

- **标题相似度**：Levenshtein 比率（码点安全）> 0.9 → 疑似重复
- **内容相似度**：Sorensen-Dice 字符 bigram 系数 > 0.7 → 疑似重复
- 任一触发即强制 `tier="manual"`，但仍执行 promote（reviewer 主动调用即视为人工确认）
- 结果通过 `duplicate_with: Array<{path, title_sim, content_sim}>` 字段返回（始终为数组，空也为 `[]`）

**算法选择理由**：项目无向量库（核心依赖 ≤5 原则，ADR-001），Sorensen-Dice 字符 bigram 对 CJK 天然友好，无需中文分词器。阈值基于 4 张真实经验卡两两实测校准（不相关卡最高 0.3557，2x 安全余量取 0.7）。算法实现、阈值校准数据、合并策略见 [ADR-011](../../docs/decisions/ADR-011-duplicate-detection-and-quality-scoring.md)。

## 提升流程（kb_promote_experience）

### promote 动作

1. 验证 inbox 文件存在 + 路径安全（`path.relative` 防 traversal）
2. 验证 `frontmatter.type === "experience"`（状态机守卫）
3. 验证 `frontmatter.status === "pending"`（防重复 promote）
4. **重复检测**（ADR-011）：扫描同 domain 的 `type=experience, status=active` 卡片，标题 Levenshtein > 0.9 或内容 Sorensen-Dice > 0.7 → `duplicate_with` 非空
5. 计算 tier（auto / manual）：`confidence ≥ 0.8 && isSingleDomain && duplicate_with.length === 0 ? "auto" : "manual"`
6. 写入新位置：`wiki/<domain>/experiences/<slug>.md`（移出 inbox）
7. 删除 inbox 文件
8. 更新 frontmatter `status: active`、`date: today`
9. 追加 log.md（type=`promote`，details 含 tier/confidence；若 `duplicate_with` 非空追加路径列表与 `duplicate_max_content_sim`）
10. 更新 index.md（experiences 段）

### reject 动作

1-4 同上
5. 更新 frontmatter `status: rejected`（文件保留在 inbox）
6. 追加 log.md（type=`reject`，语义清晰且避免与原始 write 条目形成 MD024 重复 heading；DEF-007 已落地）

## 老化与淘汰

### use_count 计数

每次 `kb_get_page` 被调用时，目标页面的 `frontmatter.use_count` +1，并立即回写（body 保持不变）。

### /dream 整理（三阶段维护 pass，ADR-011）

定期 `/dream` 是三阶段维护 pass，所有事件以 `type="dream"` 记录到 `log.md`：

**Phase 1 — 老化降级**：

- `use_count` 长期为 0
- 且 `date` 超过 90 天
- 的经验卡片，降级为 `archived`
- 移到 `wiki/<domain>/experiences/archive/`

archived 页仍可被检索，但不进 top 结果。降级事件追加 log.md，格式 `## [YYYY-MM-DD] dream | <标题>`。

**Phase 2 — 去重扫描**（report-only）：

- 按 domain 分桶，同桶内两两计算标题 Levenshtein + 内容 Sorensen-Dice 相似度（阈值同 §重复检测）
- 疑似重复对记录到 `/dream` 报告 `duplicates` 字段，**不自动合并、不删除**（合并是不可逆决策，需人工 review）
- 单桶 >500 卡时跳过该桶去重（保留老化+评分），记日志告警

**Phase 3 — 质量评分**：

- 对剩余 active 经验卡计算四维度 `quality_score`（frontmatter 完整性 0.15 + body 结构 0.35 + 证据丰富度 0.25 + 长度合理性 0.25）
- 幂等回写到 frontmatter `quality_score` 字段：若与当前值差异 < 0.01 跳过回写
- 回写失败 best-effort（catch + 日志，不中断批量）
- 不门禁 promote，仅作为诊断信号供 P4+ 筛选/排序

**摘要日志**：每次 `/dream` 执行结束追加 `## [YYYY-MM-DD] dream | /dream pass summary`，记录 scanned / demoted / duplicates_found / quality_scored / quality_updated 统计。

## 门禁的质量保证

### 防止误提升

- 概念页（type=concept）不能被 promote（即使放在 inbox 目录也会被拒）
- 已 active 的卡片不能重复 promote
- 已 rejected 的卡片不能再次审核（需重新 write 一张新卡）

### 防止注入

- `sanitizeLogField` 防护 log.md 的 CWE-117 注入
- `sanitizeIndexField` 防护 index.md 的换行注入
- `path.relative` 防护路径遍历（CWE-22）

## 经验卡片质量自检（写入前）

Agent 在调用 `kb_write_experience` 前**必须**自检：

- [ ] 是否真的可复用（不是一次性的 hack）？
- [ ] 是否包含可验证的证据（代码/测试/数据）？
- [ ] confidence 评估是否诚实？（0.9 高度确信，0.6 推测性）
- [ ] 是否标注了适用场景与不适用场景？
- [ ] 是否与知识库已有内容重复？（查 `kb_search` 确认）

## 相关概念

- [[wiki/kb-system/page-types-and-state-machine]] — experience 类型的状态机。
- [[wiki/kb-system/dual-index-mechanism]] — promote 事件写入 log.md。
- [[wiki/kb-system/ingest-workflow]] — 与 ingest 的区别（ingest 处理 raw 资料，experience 处理 Agent 实践）。

## 来源

- `AGENTS.md` §7（持续进化工作流）、§7.4（审核门禁）、§7.5（老化与淘汰）、§7.6（质量自检）
- `server/src/tools/write.ts`（kbPromoteExperience 实现）

## 同领域概念

- [[wiki/kb-system/three-layer-architecture]] — 三层架构：Raw / Wiki / Schema
- [[wiki/kb-system/dual-index-mechanism]] — 双索引机制：内容索引 + 时间日志
- [[wiki/kb-system/frontmatter-schema]] — frontmatter Schema 规约
- [[wiki/kb-system/page-types-and-state-machine]] — 页面类型与状态机
- [[wiki/kb-system/multi-domain-classification]] — 多领域分类规范
- [[wiki/kb-system/ingest-workflow]] — Ingest 工作流
- [[wiki/kb-system/query-workflow]] — Query 工作流
- [[wiki/kb-system/lint-workflow]] — Lint 工作流
