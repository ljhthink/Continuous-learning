# P4-FIX 护栏二次审查报告（R2）

| 字段 | 值 |
| --- | --- |
| 任务令牌 | TKN-P4-FIX-003 |
| 审查轮次 | 第 2 轮（DEF-001 修复后二次审查） |
| 审查日期 | 2026-07-27 |
| 审查范围 | `server/src/tests/read-only.test.ts`（仅 1 个文件） |
| 变更性质 | 测试文件参数名同步：`path` → `page_path` |
| 审查结论 | **PASS** |
| 阻断级问题 | 0 |

---

## 1. 审查触发背景

上一轮审查（TKN-P4-FIX-001）已通过，但 ac-verifier 发现 [read-only.test.ts](server/src/tests/read-only.test.ts) 中 6 处 `kbGetPage({ path: "..." })` 未同步为 `page_path:`，导致 6 个测试失败。本轮针对该遗漏进行聚焦审查。

---

## 2. 变更内容核对

本次仅修改 1 个文件，6 处参数名替换，行号与任务令牌声明完全一致：

| 行号 | 上下文 | 旧参数名 | 新参数名 | 核对 |
| --- | --- | --- | --- | --- |
| 210 | `kbGetPage({ page_path: "wiki/coding/async-patterns" })` | `path` | `page_path` | OK |
| 226 | `kbGetPage({ page_path: "wiki/coding/sectioned", section: "Details" })` | `path` | `page_path` | OK |
| 236 | `kbGetPage({ page_path: "wiki/coding/nonexistent" })` | `path` | `page_path` | OK |
| 244 | `kbGetPage({ page_path: "../../../etc/passwd" })`（路径穿越测试） | `path` | `page_path` | OK |
| 260 | `kbGetPage({ page_path: "wiki/coding/empty-frontmatter" })`（DEF-003） | `path` | `page_path` | OK |
| 285 | `kbGetPage({ page_path: "wiki/coding/malformed-yaml" })`（DEF-003） | `path` | `page_path` | OK |

**结论**：6 处替换全部正确，无遗漏，无多余修改。

---

## 3. 残留调用全局搜索

为排除"是否还有其他文件遗漏"的风险，对整个 `server/src` 目录执行了全局搜索。

### 3.1 搜索旧参数名残留

搜索模式：`kbGetPage({ path:`

```text
搜索范围：D:\s0611\code\Continuous-learning\server\src\**\*.ts
匹配结果：0 条（空）
```text

**结论**：整个 `server/src` 下**无任何** `kbGetPage({ path:` 残留调用。本轮遗漏已彻底修复。

### 3.2 确认所有 kbGetPage 调用均使用 page_path

搜索模式：`page_path:`（全量列出，确认覆盖所有 kbGetPage 调用点）

| 文件 | 行号 | 所属工具 | 状态 |
| --- | --- | --- | --- |
| read-only.test.ts | 210, 226, 236, 244, 260, 285 | kbGetPage | 本轮修复，OK |
| frontmatter-integration.test.ts | 217, 254, 260, 266, 324, 347 | kbGetPage | 上轮已修复，OK |
| p3-evolution.test.ts | 84, 87, 121, 124 | kbGetPage | 上轮已修复，OK |
| graph.test.ts | 232, 239, 246, 289 | kbBacklinks 等 | 非本次范围，参数名本就为 page_path |
| staging.test.ts | 120, 137, 144, 152, 171, 196, 223, 230, 270 | kbPromote 等 | 非本次范围，参数名本就为 page_path |
| schemas.ts | 30, 190, 200, 236 | schema 定义 | 实现层基线，OK |
| tools/read-only.ts | 177, 180 | kbGetPage 实现 | 实现层基线，OK |
| tools/staging.ts | 171, 173, 219, 241, 243, 285 | kbPromote 实现 | 实现层基线，OK |
| tools/backlinks.ts | 45, 47 | kbBacklinks 实现 | 实现层基线，OK |

**结论**：测试层（3 个文件共 16 处 kbGetPage 调用）与实现层（schemas.ts + 3 个 tool 文件）参数名完全一致，均为 `page_path`。

---

## 4. 测试逻辑完整性核对

逐个比对 6 处修改的断言部分，确认**仅参数名变更，断言逻辑未变**：

| 行号 | 断言内容 | 是否保留 |
| --- | --- | --- |
| 210-216 | `frontmatter.title === "Async Patterns"` + body 匹配 + links 包含 `emotion-regulation` | 完整保留 |
| 225-231 | body 匹配 `Detail content` + 不匹配 `Other content` | 完整保留 |
| 235-239 | `isError === true` + content 匹配 `/not found/i` | 完整保留 |
| 243-247 | `isError === true` + content 匹配 `/traversal/i`（路径穿越防护） | 完整保留 |
| 259-266 | `isError === undefined` + `use_count === 1` + body 匹配（DEF-003 空 frontmatter） | 完整保留 |
| 284-291 | `isError === undefined` + `use_count === 1` + body 匹配（DEF-003 畸形 YAML） | 完整保留 |

**结论**：6 处修改均为纯参数名同步，断言逻辑、测试覆盖意图、安全测试用例（路径穿越防护）全部完整保留，未被破坏。

---

## 5. 安全维度复核

本次变更仅涉及测试文件参数名同步，不触碰生产代码、不触碰 schema 定义、不触碰权限边界。但仍按护栏规程逐项确认：

| 维度 | 检查项 | 结论 |
| --- | --- | --- |
| 1.1 数值/类型边界 | 无数值输入变更 | N/A |
| 1.2 集合/缓冲边界 | 无缓冲操作变更 | N/A |
| 1.3 状态机约束 | 无状态机变更 | N/A |
| 2.1 注入防护 | 路径穿越测试用例（行 244）参数名同步后仍正确触发 `page_path` 校验路径 | OK |
| 2.2 最小权限 | 无权限配置变更 | N/A |
| 2.3 输出编码 | 无输出逻辑变更 | N/A |
| 3 内存安全 | TypeScript，无 unsafe | N/A |
| 4 配置/密钥 | 无硬编码密钥新增 | OK |
| 5 依赖供应链 | 无依赖文件变更 | N/A |

**特别说明**：行 244 的路径穿越测试（`page_path: "../../../etc/passwd"`）是安全测试用例，参数名同步后，该测试仍能正确命中 [read-only.ts](server/src/tools/read-only.ts) 中的 `page_path` 解构与校验逻辑，验证 `isError === true` 且错误信息匹配 `/traversal/i`。安全防护测试覆盖未被削弱。

---

## 6. §9 二次自检回复

针对任务令牌中提出的两个自问，审查结论如下：

### 6.1 "除 read-only.test.ts 外，是否还有其他文件遗漏？"

**答复：无遗漏。**

全局搜索 `kbGetPage({ path:` 在整个 `server/src` 下返回 0 条匹配。所有 16 处 `kbGetPage` 调用（分布在 read-only.test.ts / frontmatter-integration.test.ts / p3-evolution.test.ts 三个文件）均已使用 `page_path`。

### 6.2 "最大的遗憾：第一次修复时没有全局搜索"

**答复：已在本轮补救。**

本轮通过 `Select-String -Pattern 'kbGetPage\(\{ path:'` 全量扫描确认无残留。建议将此搜索模式纳入 DEF 类修复的回归检查清单，避免同类遗漏。

---

## 7. 总体结论

| 项目 | 结论 |
| --- | --- |
| 6 处替换正确性 | 全部正确，无遗漏 |
| 残留调用检查 | 全局 0 残留 |
| 测试逻辑完整性 | 断言未变，覆盖意图保留 |
| 安全测试有效性 | 路径穿越防护测试仍生效 |
| **最终判定** | **PASS — 可进入下一阶段** |

本次变更性质为测试文件参数名同步，与上一轮已审查的 [frontmatter-integration.test.ts](server/src/tests/frontmatter-integration.test.ts)（6 处）和 [p3-evolution.test.ts](server/src/tests/p3-evolution.test.ts)（4 处）完全相同的修复模式，无新增安全风险。read-only.test.ts 14/14 通过，全量 182 个测试 181 通过（1 个性能 flake 与本次无关），验证修复有效。

---

## 8. 自动化建议

建议在 CI 中增加一条回归检查，防止 `path` → `page_path` 类参数名漂移再次遗漏：

```yaml
# .github/workflows/test.yml 片段
- name: Guardrail - kbGetPage param name drift check
  run: |
    $hits = Get-ChildItem -Path server/src -Recurse -Filter *.ts |
      Select-String -Pattern 'kbGetPage\(\{ path:'
    if ($hits) {
      Write-Error "Found kbGetPage({ path: ... }) calls — must use page_path"
      $hits | Format-Table Path, LineNumber, Line
      exit 1
    }
```text

或等效的 grep/ripgrep 规则，作为 DEF-001 类修复的防回归门禁。
