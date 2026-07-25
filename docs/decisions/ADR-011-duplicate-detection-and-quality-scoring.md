# ADR-011: 经验卡重复检测与质量评分

| 项目 | 内容 |
| --- | --- |
| 状态 | Proposed |
| 日期 | 2026-07-26 |
| 决策者 | 主 Agent（P3 持续进化闭环收尾阶段） |
| 关联文档 | [ADR-006](ADR-006-continuous-evolution-loop.md)（持续进化循环）/ [AGENTS.md](../../AGENTS.md) §3.3 / §7.4 / §7.5 / [PRD](../PRD.md) US-001 AC-006 |
| 风险等级 | P2（跨模块：write.ts + dream.ts + schemas.ts + AGENTS.md 规约同步） |
| 前序 ADR | [ADR-006](ADR-006-continuous-evolution-loop.md)（D3/D4 列出去重/合并/质量评分为后续增强） |

## 背景（Context）

[ADR-006](ADR-006-continuous-evolution-loop.md) 建立了持续进化闭环的两 tier 审核门禁 + `/dream` 老化降级，但将**去重、合并、质量评分**明确列为 D3/D4 后续增强。这导致 [PRD](../PRD.md) US-001 AC-006 长期标 ⚠️ 部分完成：

> `[ ] 每日/按需 /dream 整理：去重、合并、质量评分、老化低 use_count 条目（⚠️ 部分完成：仅老化实现，去重/合并/质量评分见 ADR-006 D4 后续增强）`

[AGENTS.md](../../AGENTS.md) §7.4 规定重复检测条件为「标题相似度 > 0.9 或内容嵌入相似度 > 0.92」，但：

1. **项目无向量库**：核心依赖 ≤5 原则（[ADR-001](ADR-001-knowledge-base-tech-stack.md)）禁止引入 embedding 模型，"内容嵌入相似度"实际无法实现
2. **阈值 0.92 缺乏校准**：原始值来自通用 RAG 实践，未在本项目真实数据上验证
3. **无质量评分机制**：经验卡质量参差，但 `/dream` 不评估、不记录，未来 P4+ 无法基于质量做展示或筛选
4. **合并策略未定义**：检测到重复后是否自动合并、如何合并，规约未覆盖

本 ADR 闭合上述缺口，使 P3 里程碑达到 ✅ 状态，为 P4 GUI 阶段扫清底座。

## 决策（Decision）

### D1. 去重算法选择：Levenshtein + Sorensen-Dice 字符 bigram

| 维度 | 算法 | 适用场景 | 理由 |
| --- | --- | --- | --- |
| 标题相似度 | Levenshtein 比率（码点安全） | 短字符串（标题 <100 字符） | 编辑距离是人类直觉的"差几个字"的数学化；O(m×n) 在短串上开销可忽略 |
| 内容相似度 | Sorensen-Dice 字符 bigram 系数 | 长文本（body） | 对 CJK 天然友好（每个汉字参与 2 个 bigram），无需中文分词器；O(\|a\|+\|b\|) 线性复杂度 |

**码点安全**：两个算法均通过 `[...str]` 展开为 Unicode 码点数组，确保 emoji（代理对）和扩展平面 CJK 字符计为 1 个单位而非 2 个 UTF-16 码元。这是中文 + emoji 混合标题（如 `lychee 链接检查 CI：...`）的正确性前提。

**判定条件**：`title_sim > 0.9 || content_sim > 阈值` → 疑似重复

### D2. 阈值校准（基于真实数据）

运行 `npx tsx scripts/calibrate-similarity.ts` 对 4 张现有活跃经验卡两两实测：

| 卡对 | 标题相似度 | 内容相似度 |
| --- | --- | --- |
| js-yaml ↔ lychee | 0.0833 | 0.2625 |
| js-yaml ↔ mcp-cache | 0.0625 | 0.2476 |
| js-yaml ↔ sub-agent | 0.1250 | 0.2720 |
| lychee ↔ mcp-cache | 0.0444 | 0.2482 |
| lychee ↔ sub-agent | 0.0889 | 0.3557 |
| mcp-cache ↔ sub-agent | 0.0256 | 0.2788 |

**实测结论**：
- 不相关卡的内容相似度范围：0.2476 - 0.3557（最高 0.3557）
- 完全相同内容：1.0
- 小幅编辑（1 词大小写改写）：≥ 0.95

**选定阈值**：

| 阈值 | 取值 | 安全余量 |
| --- | --- | --- |
| `DUPLICATE_TITLE_THRESHOLD` | 0.9 | 沿用 [AGENTS.md](../../AGENTS.md) §7.4 原值；10 字符标题差 1 字 = 0.9 |
| `DUPLICATE_CONTENT_THRESHOLD` | 0.7 | 不相关最高 0.3557 的 ~2x 安全余量；远低于真实重复的 ≥0.95 |

**重校准**：若 KB 显著增长（>500 经验卡）或出现假阳性/假阴性报告，重跑校准脚本并调整阈值。脚本输出记录于本 ADR §D2 表格。

### D3. 检测范围：仅同 domain 活跃卡

| 维度 | 范围 | 理由 |
| --- | --- | --- |
| type | experience | 仅经验卡参与去重（概念页/实体页/源页主题不同） |
| status | active | 排除 pending（inbox）/ archived（已降级） |
| domain | 同域 | 跨域卡通常主题不同；限制同域使 1000 卡扫描 ~50ms |

**promote 门禁实时检测**（[write.ts](../../server/src/tools/write.ts)）：在 tier 计算前扫描同域活跃卡，发现重复强制 `tier="manual"`，但仍执行 promote（reviewer 主动调用即视为人工确认）。返回 `duplicate_with: Array<{path, title_sim, content_sim}>`（始终为数组，空也为 `[]`）。

**`/dream` 批量扫描**（[dream.ts](../../server/src/dream.ts) Phase 2）：domain 分桶 + `seenPairs` 去重（复用 [lint.ts](../../server/src/tools/lint.ts) L477-L505 模式），避免 O(N²) 全局两两比较。单桶 >500 卡时跳过该桶去重（保留老化+评分），并记日志告警。

### D4. 合并策略：report-only，不自动合并

**决策**：检测到重复仅报告，不自动合并、不自动删除。

**理由**：
1. 合并是不可逆决策（删除一方即丢失信息）
2. 当前无真实重复数据验证合并算法的正确性
3. 重复可能是"主题相近但视角不同"的合法卡片（如同一模式的不同语言实现）
4. 人工 review 后可手动合并，`/dream` 报告提供候选对

**`/dream` 报告字段**：`duplicates: Array<{a, b, title_sim, content_sim}>`，原卡文件不变。

### D5. 质量评分 rubric（0-1）

4 维度加权评分，写入 frontmatter `quality_score` 字段：

| 维度 | 权重 | 计算方式 |
| --- | --- | --- |
| frontmatter 完整性 | 0.15 | 有 `confidence` +0.05、有 `source_task` +0.05、有 `tags`（非空数组）+0.05 |
| body 结构 | 0.35 | 每存在一个 section（背景/方案/证据/适用场景，中英文均识别）+0.0875（线性累加） |
| 证据丰富度 | 0.25 | body 含 ```` ``` ```` 代码块 → 0.25，否则 0 |
| 长度合理性 | 0.25 | body 长度 500-5000 码点 → 1.0；<500 线性 ramp；>5000 平滑衰减至 0.5（`0.5 + 0.5 * 5000/len`，永不低于 0.5） |

**section 匹配**：负向前瞻 `(?![\u4e00-\u9fff])` 避免复合词误匹配（`背景音乐` ≠ `背景`），同时接受尾随标点（`背景：xxx` 计为 1）。中英文均通过 `i` + `u` 正则标志识别。

**长度度量**：码点数（`[...body].length`），Han 字符和 emoji 各计为 1，符合用户对"字符"的直觉。

**评分用途**：
- 仅记录到 frontmatter，**不门禁 promote**（[AGENTS.md](../../AGENTS.md) §7.4 门禁条件不变）
- 未来 P4+ 可基于 `quality_score` 做展示筛选、低质卡提醒、质量趋势可视化
- 当前作为诊断信号，为后续产品决策提供数据支撑

**幂等性**：`/dream` 计算前读当前 `quality_score`，若与重算值差异 < 0.01（`QUALITY_IDEMPOTENCE_EPSILON`）跳过回写。重跑 `/dream` 不会重复写入未变化的分数。

**回写失败**：best-effort（catch + `console.error`，不中断批量，与 `use_count` 回写语义一致）。

### D6. log type 迁移：`experience` → `dream`

[AGENTS.md](../../AGENTS.md) §7.4 原规定 promote/reject 日志使用 `type="promote"` / `type="reject"`，但 `/dream` 老化降级事件仍用 `type="experience"`（P2 决策）。本次迁移：

| 事件 | 迁移前 type | 迁移后 type |
| --- | --- | --- |
| `/dream` 老化降级（archived） | `experience` | `dream` |
| `/dream` 摘要条目（新增） | — | `dream` |
| `kb_write_experience` 新建卡 | `experience` | `experience`（不变） |
| `kb_promote_experience` promote | `promote` | `promote`（不变） |
| `kb_promote_experience` reject | `reject` | `reject`（不变） |

**理由**：
1. 语义清晰：`/dream` 动作（降级 + 摘要）统一归 `dream`，与"新建经验卡"的 `experience` 区分
2. 避免 MD024：同一卡同日新建（`experience`）+ 降级（原 `experience`）会产生两个 `## [date] experience | <title>` heading，触发 markdownlint MD024（siblings_only）
3. 客户端过滤：`kb_list_recent({type:"dream"})` 可查看完整 `/dream` 历史

**`kb_list_recent` schema 同步**：enum 新增 `dream`（同时补齐之前遗漏的 `promote` / `reject`）。

## 备选方案（Alternatives）

### 去重算法

| 方案 | 优点 | 缺点 / 否决理由 |
| --- | --- | --- |
| **Levenshtein + Sorensen-Dice bigram**（选定） | 无 ML 依赖、CJK 友好、码点安全、O(N) 线性（body） | 阈值需校准；对同义不同字的表达不敏感（但经验卡重复通常是字面重复） |
| 向量 embedding + 余弦相似度 | 语义相似性强 | 违反核心依赖 ≤5 原则（[ADR-001](ADR-001-knowledge-base-tech-stack.md)）；需引入 ONNX Runtime + 模型文件 ~100MB；推理延迟 ~50ms/对 |
| Jaccard on tokens | 简单 | 需分词器，CJK 不友好；Token 级粒度对短文本不稳定 |
| MinHash + LSH | 大规模可扩展 | 实现复杂，当前规模（<100 卡）过重 |
| 仅 Levenshtein（标题 + body） | 单一算法 | body 长文本 O(m×n) 开销大（1000 字符 × 1000 字符 = 100万次操作） |

### 合并策略

| 方案 | 优点 | 缺点 / 否决理由 |
| --- | --- | --- |
| **report-only**（选定） | 安全、可逆、人工决策 | 需人工介入合并 |
| 自动合并（保留较长 body） | 自动化 | 不可逆；可能丢失独特视角；无真实数据验证合并逻辑 |
| 自动删除较低 confidence 卡 | 简单 | 不可逆；confidence 不反映内容质量 |
| 标记 `duplicate_with` 字段 + 等待人工 | 保留信息 + 显式关联 | 增加字段维护复杂度；当前无强烈需求 |

### 质量评分

| 方案 | 优点 | 缺点 / 否决理由 |
| --- | --- | --- |
| **4 维度 rubric**（选定） | 可解释、确定性、无外部依赖 | 主观权重；可能无法捕捉"真正有价值但结构非标"的卡 |
| LLM 评分 | 语义理解强 | 引入 LLM 调用成本与延迟；非确定性；核心依赖 ≤5 原则 |
| 用户手动评分 | 真实偏好 | 不可扩展；用户不会持续维护 |
| 引用数 + use_count 加权 | 行为信号 | 仅反映"被发现"频率，不反映内容质量；新卡永远低分 |

## 后果（Consequences）

### 正面后果

1. **PRD US-001 AC-006 闭合**：去重 + 质量评分落地，`/dream` 从单阶段老化升级为三阶段维护
2. **promote 门禁增强**：实时重复检测强制疑似重复卡走人工 review，避免低质重复进入正式库
3. **质量可观测**：`quality_score` 为 P4+ GUI 提供筛选/排序维度，为质量趋势分析提供数据
4. **日志语义清晰**：`type="dream"` 统一所有 `/dream` 事件，`kb_list_recent` 过滤更直观
5. **无新依赖**：纯字符串算法 + 纯函数实现，核心依赖数不变（[ADR-001](ADR-001-knowledge-base-tech-stack.md)）

### 负面后果 / 代价

1. **阈值需持续观察**：Sorensen-Dice 0.7 是基于 4 张卡校准的，KB 增长后可能需调整；提供 `scripts/calibrate-similarity.ts` 重校准
2. **质量分主观性**：4 维度权重（0.15/0.35/0.25/0.25）基于经验卡模板的"理想形态"，可能不适用所有领域；未来可按领域调整
3. **接口契约扩展**：`kb_promote_experience` 返回新增 `duplicate_with` 字段，严格 schema 校验的客户端需适配（MCP 规范建议客户端容忍未知字段，影响小）
4. **frontmatter 字段增加**：`quality_score` 由系统维护，Agent 不应手写；与 `use_count` 语义一致，但增加 schema 复杂度

### 需要同步更新的文档或代码

- [AGENTS.md](../../AGENTS.md) §3.3：可选字段追加 `quality_score`（系统维护）
- [AGENTS.md](../../AGENTS.md) §7.4：去重条件措辞从"内容嵌入相似度 > 0.92"改为"字符 bigram Sorensen-Dice 系数 > 0.7（见 ADR-011）"
- [AGENTS.md](../../AGENTS.md) §7.5：`/dream` 整理子项追加"去重、质量评分"；log type 改为 `dream`
- [docs/ARCH.md](../ARCH.md) §3.1：`kb_promote_experience` 输出列加 `duplicate_with`
- [docs/PRD.md](../PRD.md) US-001 AC-006：状态从 ⚠️ 部分完成改为 ✅
- [wiki/kb-system/continuous-evolution-review-gate.md](../../wiki/kb-system/continuous-evolution-review-gate.md)：更新"重复检测（未来增强）"段为"已实现"

## 验证

落地验证（由 `ac-verifier` 子 Agent 在 PR 验收阶段执行）：

| AC ID | 验收标准 | 验证方法 |
| --- | --- | --- |
| AC-006a | 标题相似度 > 0.9 触发 Tier 2 | 单元 + E2E：构造标题仅差一字的卡 → promote 返回 `tier=manual` + `duplicate_with` 非空 |
| AC-006b | 内容相似度 > 0.7 触发 Tier 2 | 单元 + E2E：构造 body 高度相似的卡 → promote 返回 `duplicate_with` |
| AC-006c | 不自动合并，仅报告 | E2E：`/dream` 报告 `duplicates` 字段，原卡文件不变 |
| AC-006d | 计算并写入 `quality_score` | 单元 + E2E：`/dream` 后 frontmatter 含 `quality_score`，值在 [0,1] |
| AC-006e | 老化（已有） | 现有测试不回归 |
| AC-006f | 幂等 | 单元：二次运行 `/dream` `quality_updated=0` |

**真实 KB 验证**（主 Agent 自检阶段）：
1. `npm run dream` 对真实 KB（36 页 / 4 经验卡）执行
2. 4 张卡 `quality_score` 合理（预期 0.7-0.95）
3. `log.md` 含 `## [date] dream |` 条目，无 MD024 重复
4. `log.md` 通过 markdownlint
5. `kb_lint` 无新增 orphan/stale/missing_xref/frontmatter 问题

## 生命周期

- **Proposed**：本 ADR 随 P3 收尾 PR 提交。
- **Accepted**：经 `guardrail-enforcer` 审查通过（TKN-P3-DREAM-DEDUP-001）+ `ac-verifier` 验收通过（TKN-P3-DREAM-DEDUP-002）且 PR 合并后转为 Accepted。
- **Superseded**：若未来引入向量库（KB 规模 >500 卡且字符串算法假阳性率 >10%），新建 ADR 取代本算法选择部分；质量评分 rubric 可独立演进。

## 参考

- [ADR-001](ADR-001-knowledge-base-tech-stack.md)：技术选型（核心依赖 ≤5 原则）
- [ADR-006](ADR-006-continuous-evolution-loop.md)：持续进化循环（D3/D4 后续增强）
- [AGENTS.md](../../AGENTS.md) §3.3（可选字段）/ §7.4（两 tier 审核门禁）/ §7.5（老化与淘汰）
- [PRD](../PRD.md) US-001 AC-006（`/dream` 整理）
- [server/src/utils/similarity.ts](../../server/src/utils/similarity.ts)：Levenshtein + Sorensen-Dice 实现
- [server/src/utils/quality.ts](../../server/src/utils/quality.ts)：质量评分 rubric 实现
- [server/src/tools/write.ts](../../server/src/tools/write.ts)：promote 重复检测
- [server/src/dream.ts](../../server/src/dream.ts)：`/dream` 三阶段（老化 + 去重 + 评分）
- [server/scripts/calibrate-similarity.ts](../../server/scripts/calibrate-similarity.ts)：阈值校准脚本
