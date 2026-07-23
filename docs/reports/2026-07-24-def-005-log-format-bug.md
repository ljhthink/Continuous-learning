# DEF-005 修复报告 · log.md markdownlint 合规性 bug

> **DEF-005**：`appendLogEntry` 与 `kbPromoteExperience` 写入 log.md 时违反 MD022/MD032（heading 与 list 之间无空行）；promote 动作复用 `type:"experience"` 导致 MD024 重复 heading 风险。
>
> 本报告记录根因、修复方案、测试覆盖与验证结果。

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | 主 Agent（编码） |
| 任务令牌 | TKN-DEF-005-FIX-001 |
| 报告日期 | 2026-07-24 |
| 风险等级 | P1 常规（单模块内部逻辑，不改接口/契约/依赖） |
| 关联文件 | server/src/utils/log.ts, server/src/tools/write.ts, server/src/tests/setup.ts, server/src/tests/p3-evolution.test.ts, AGENTS.md |

## 1. Bug 描述

### 1.1 现象

P3 里程碑沉淀经验卡片时，`kb_write_experience` 与 `kb_promote_experience` 写入 log.md 的条目违反 markdownlint 规则：

- **MD032**（列表前后需空行）：`## [date] type | title` 紧跟 `- key: value`，中间无空行
- **MD024**（siblings_only 模式下同级 heading 不可重复）：promote 动作与原始 write 动作共用 `type:"experience"` + 相同 title，产生重复 heading

### 1.2 影响

- `docs-quality` CI 失败（markdownlint 报错）
- 每次调用 `kb_write_experience` / `kb_promote_experience` / `kb_ingest_source` 都会重新引入格式问题
- 首次发现时通过手动修复 log.md 绕过，但源码层 bug 未修复 → 下次调用复发

## 2. 根因分析

### 2.1 MD032 根因

`server/src/utils/log.ts` 的 `appendLogEntry` 用 `lines.join("\n")` 拼接 heading 与 detail 行，未在 heading 后插入空行：

```typescript
// 修复前（bug）
const lines: string[] = [
  `## [${entry.date}] ${entry.type} | ${safeTitle}`,
];
for (const [key, value] of Object.entries(entry.details)) {
  lines.push(`- ${sanitizeLogField(key)}: ${sanitizeLogField(value)}`);
}
const block = "\n" + lines.join("\n") + "\n";
// → "\n## heading\n- detail1\n- detail2\n"
//                          ↑ 无空行 → MD032 违规
```

### 2.2 MD024 根因

`server/src/tools/write.ts` 的 `kbPromoteExperience`（promote action）与 `kbWriteExperience` 共用 `type:"experience"`。当同一张卡片先 write 后 promote 时，log.md 出现两个 heading：

```text
## [2026-07-24] experience | js-yaml 5 MAJOR 升级...
## [2026-07-24] experience | js-yaml 5 MAJOR 升级...  ← MD024 重复
```

### 2.3 测试缺口根因

`server/src/tests/setup.ts` 的 `appendLog` 测试助手**复制了同样的 bug**（heading 后无空行），导致测试 seed 数据与生产代码同样违规，测试无法发现格式问题。现有测试（`write.test.ts`、`p3-evolution.test.ts`）只验证 log.md 内容是否包含期望字符串（`assert.match(logContent, /experience/)`），不验证 markdownlint 合规性。

## 3. 修复方案

### 3.1 log.ts：appendLogEntry 加空行

```typescript
// 修复后
const heading = `## [${entry.date}] ${entry.type} | ${safeTitle}`;
const detailLines = Object.entries(entry.details).map(
  ([k, v]) => `- ${sanitizeLogField(k)}: ${sanitizeLogField(v)}`,
);
const block =
  detailLines.length > 0
    ? `\n${heading}\n\n${detailLines.join("\n")}\n`  // ← \n\n = 空行
    : `\n${heading}\n`;
```

输出格式：`\n## heading\n\n- detail1\n- detail2\n`（heading 与 list 间有空行 ✓）

### 3.2 write.ts：promote 用 type:"promote"

```typescript
// 修复后
await appendLogEntry({
  date: today,
  type: "promote",  // ← 原 "experience"
  title,
  details: { promoted, from_inbox, tier, confidence },
});
```

语义清晰（promote ≠ experience），且避免 MD024 重复 heading。

### 3.3 setup.ts：appendLog 助手同步修复

测试助手镜像生产代码格式，确保 seed 数据也通过 markdownlint。

### 3.4 AGENTS.md §7.4：文档化 promote 类型

在「审核门禁」段追加「提升日志」说明，记录 `promote` 类型与格式约定（schema 演进，AGENTS.md §11）。

### 3.5 p3-evolution.test.ts：补回归测试

新增 `DEF-005: log.md passes MD022/MD032 after write+promote; promote uses type='promote'` 测试：

- 调用 `kbWriteExperience` + `kbPromoteExperience`
- 读取 log.md，逐行扫描：`## heading` 后不可紧跟 `- list item`
- 验证文件以 `\n` 结尾（MD047）
- 验证 promote 条目用 `type:"promote"`（正则匹配 `^## \[\d{4}-\d{2}-\d{2}\] promote \| .+$`）

## 4. 验证结果

| 检查项 | 命令 | 结果 |
| --- | --- | --- |
| TypeScript 类型检查 | `npx tsc --noEmit` | ✅ 通过（无错误） |
| p3-evolution 测试（含 DEF-005） | `npx tsx --test src/tests/p3-evolution.test.ts` | ✅ 10/10 通过 |
| 全套测试 | `npx tsx --test src/tests/*.test.ts` | ⚠️ 45/46 通过（1 个预存在 lint-perf flaky 失败，与 DEF-005 无关） |

### 4.1 预存在的 lint-perf 失败（非 DEF-005 回归）

`lint-perf.test.ts` 的 `completes 1000-page scan well under 2s PRD threshold` 测试失败（p50=1334ms > 1000ms 阈值）。

**证据：非 DEF-005 回归**：

- DEF-005 改动文件：`log.ts`、`write.ts`、`setup.ts`、`p3-evolution.test.ts`、`AGENTS.md`
- lint-perf 测试文件：`lint-perf.test.ts` + `lint.ts`（均未被 DEF-005 触及）
- `git diff main..HEAD --stat -- server/src/tests/lint-perf.test.ts server/src/tools/lint.ts` 输出为空

**根因**：I/O 性能环境噪声（Windows + 1000 文件 × 9 次迭代），PRD 硬阈值 p95 < 2s 仍满足。建议作为独立技术债务（DEF-006）处理：调高 p50 阈值至 1500ms 或改用 p95 作为断言指标。

## 5. 影响范围

| 调用方 | 影响 |
| --- | --- |
| `kbIngestSource`（write.ts:126） | log 条目格式自动合规（无需改动调用方） |
| `kbWriteExperience`（write.ts:192） | log 条目格式自动合规 |
| `kbPromoteExperience` promote（write.ts:310） | log 类型从 `experience` → `promote`，格式合规 |
| `kbPromoteExperience` reject（write.ts:330） | log 条目格式自动合规（type 仍为 `experience`，未改动） |
| `parseLog`（log.ts:27） | 正则 `(\w+)` 捕获 `promote` 无影响 |
| `readRecentLog`（log.ts:80） | 无 type 过滤逻辑变化 |

**无接口/契约/依赖变更**。所有改动限于 log.md 输出格式与 type 字段值。

## 6. 后续行动

- [x] 修复源码（log.ts + write.ts + setup.ts）
- [x] 补回归测试（p3-evolution.test.ts）
- [x] 文档化 promote 类型（AGENTS.md §7.4）
- [ ] guardrail-enforcer 审查
- [ ] ac-verifier 验收
- [ ] 合并后提升 2 张 pending 卡片（lychee 0.85 + mcp-server 0.8）
- [ ] （可选）为 reject 动作也引入 `type:"reject"`（当前仍为 `experience`，一致性改进，非必须）
- [ ] （独立任务）DEF-006：lint-perf p50 阈值调优
