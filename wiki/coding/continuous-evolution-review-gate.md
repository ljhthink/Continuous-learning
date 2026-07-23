---
title: "持续进化门禁：两 Tier 审核与老化"
domain: [coding]
type: concept
status: active
date: 2026-07-24
tags: [kb-system, evolution, review-gate, aging]
related: [[wiki/coding/page-types-and-state-machine]], [[wiki/coding/dual-index-mechanism]]
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
const tier = confidence >= 0.8 && isSingleDomain ? "auto" : "manual";
```

注意：tier 仅标记「如何提升」（auto vs manual），不改变提升动作本身。一旦人工调用 `kb_promote_experience(action="promote")`，两种 tier 都执行相同的提升流程。

### 重复检测（未来增强）

- 标题相似度 > 0.9 视为疑似重复
- 内容嵌入相似度 > 0.92 视为疑似重复
- 重复检测触发 Tier 2 人工审核
- 当前实现：tier 字段仅作审计标记，重复检测为 future enhancement

## 提升流程（kb_promote_experience）

### promote 动作

1. 验证 inbox 文件存在 + 路径安全（`path.relative` 防 traversal）
2. 验证 `frontmatter.type === "experience"`（状态机守卫）
3. 验证 `frontmatter.status === "pending"`（防重复 promote）
4. 计算 tier（auto / manual）
5. 写入新位置：`wiki/<domain>/experiences/<slug>.md`（移出 inbox）
6. 删除 inbox 文件
7. 更新 frontmatter `status: active`、`date: today`
8. 追加 log.md（type=`promote`，details 含 tier/confidence）
9. 更新 index.md（experiences 段）

### reject 动作

1-4 同上
5. 更新 frontmatter `status: rejected`（文件保留在 inbox）
6. 追加 log.md（type=`experience`，当前实现；DEF-007 建议改 `reject`）

## 老化与淘汰

### use_count 计数

每次 `kb_get_page` 被调用时，目标页面的 `frontmatter.use_count` +1，并立即回写（body 保持不变）。

### /dream 整理

定期 `/dream` 时：

- `use_count` 长期为 0
- 且 `date` 超过 90 天
- 的经验卡片，降级为 `archived`
- 移到 `wiki/<domain>/experiences/archive/`

archived 页仍可被检索，但不进 top 结果。

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

- [[wiki/coding/page-types-and-state-machine]] — experience 类型的状态机。
- [[wiki/coding/dual-index-mechanism]] — promote 事件写入 log.md。
- [[wiki/coding/ingest-workflow]] — 与 ingest 的区别（ingest 处理 raw 资料，experience 处理 Agent 实践）。

## 来源

- `AGENTS.md` §7（持续进化工作流）、§7.4（审核门禁）、§7.5（老化与淘汰）、§7.6（质量自检）
- `server/src/tools/write.ts`（kbPromoteExperience 实现）
