# 安全与质量审计报告 · DEF-017 heap-sort 跨语言实现模式对比

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | guardrail-enforcer |
| 任务令牌 | TKN-HEAP-SORT-001 |
| 任务域 | DEF-017（ADR-009 Phase 4 第二个交付：heap-sort 跨语言实现模式对比概念页） |
| 报告日期 | 2026-07-25 |
| 审查范围 | 1 张新建 concept 页 + index.md + log.md + 6 张 thealgorithms 入口页交叉引用更新 |
| 风险等级 | P1 常规（纯 markdown 文档变更，无代码逻辑/接口/契约/依赖变更） |
| 主 Agent 签发上下文 | 盲区 1：7 段代码片段截取自 TheAlgorithms master 分支，可能遗漏边界处理逻辑（C v1 `temp <= a[j]`、C v2 heapifyUp/Down 完整性、Java SortUtils 调用）；盲区 2：建堆 O(n) 证明基于 Σ k/2^k 收敛，需确认数学严谨性；盲区 3：C++ 建堆起点 n-1 是否仅影响效率而非正确性；盲区 4：Rust 升序降序切换的 comparator 映射准确性；盲区 5：7 种实现全部不稳定的判定准确性。遗憾 1：未深度对比 quick-sort/merge-sort 格式细节；遗憾 2：TypeScript 注释 bug 未确认是否已提 Issue；遗憾 3：C v1 `temp <= a[j]` 相等时下移对稳定性影响未深入分析。 |
| 先例报告 | `docs/reports/2026-07-25-merge-sort-impl-patterns-guardrail.md`（DEF-016，同类变更先例，已通过）；`docs/reports/2026-07-24-def-010-guardrail.md`（DEF-010，同类变更先例） |

## 1. 审查依据

- 本次变更文件：
  - `wiki/coding/heap-sort-impl-patterns.md`（新建，6 语言 7 实现对比）
  - `index.md`（总页数 34 → 35，追加 heap-sort 条目）
  - `log.md`（追加 DEF-017 ingest 日志）
  - `wiki/coding/thealgorithms-python.md`（追加 heap-sort 引用）
  - `wiki/coding/thealgorithms-java.md`（追加 heap-sort 引用）
  - `wiki/coding/thealgorithms-c-plus-plus.md`（追加 heap-sort 引用）
  - `wiki/coding/thealgorithms-c.md`（追加 heap-sort 引用）
  - `wiki/coding/thealgorithms-rust.md`（追加 heap-sort 引用）
  - `wiki/coding/thealgorithms-typescript.md`（追加 heap-sort 引用）
- 影响自检结果：无接口/契约变更、无依赖变更、无跨模块影响（纯文档）
- 相关 ADR：
  - `docs/decisions/ADR-009-resources-and-design-domains.md`（决策 1：三层结构，Phase 4 算法概念页深化）
  - `docs/decisions/ADR-008-kb-content-layering-and-format-unification.md`（决策 1：frontmatter 格式约定）
- code-archaeologist 报告：不适用（纯文档变更，P1 级别豁免源码考古）
- 测试框架与基础用例：不适用（纯文档变更）
- 安全策略文件：`CLAUDE.md` §20（密钥管理）、`AGENTS.md` §3.1.1（frontmatter 格式约定）、§4.3（不删除旧声明，标注矛盾）、§9.3（禁止行为）

## 2. 代码质量审查

### 2.1 Skill 调用说明

参照 DEF-010 / DEF-016 先例，`TRAE-code-review` 和 `TRAE-security-review` 两个 skill 的规则均明确排除 markdown 文件：

- `TRAE-code-review` Tips 第 2 条："Skip non-code files: Do not review prose/config files (e.g., .md, .json, .txt, .svg, cargo.lock)."
- `TRAE-security-review` §8.1 Hard Exclusions："Findings inside documentation files (*.md, design docs, RFCs)."

本次变更为纯 markdown 文档（9 个文件全部为 `.md`），两个 skill 均不适用。因此，以下审查基于 guardrail-enforcer 的手动逐行审计，覆盖 frontmatter 格式、License 合规、交叉引用完整性、技术准确性、markdown 结构质量、敏感信息扫描、文档一致性等维度。

### 2.2 frontmatter 格式合规性（AGENTS.md §3.1.1 / ADR-008 决策 1）

| 文件 | domain 单行数组 | date 无引号 | frontmatter 后空行 | 标量单行 | 结论 |
| --- | --- | --- | --- | --- | --- |
| heap-sort-impl-patterns.md | `[coding]` ✅ | `2026-07-25` ✅ | 第 9-10 行有空行 ✅ | ✅ | 合规 |

新建概念页 [heap-sort-impl-patterns.md](../../wiki/coding/heap-sort-impl-patterns.md) frontmatter 格式完全合规，4 项格式约定全部满足：

- `domain: [coding]` 单行 flow 风格 ✅
- `date: 2026-07-25` 无引号 ✅
- frontmatter 与 body 之间有空行（第 9 行 `---`，第 10 行空行，第 11 行 `## 概念`）✅
- 所有标量值单行不换行 ✅

6 个入口页 frontmatter 未修改（仅"相关页面"段追加引用），无需复查。index.md 和 log.md 无 frontmatter（非 wiki 页），不适用此检查。

### 2.3 交叉引用完整性

#### 概念页 → 入口页 / 姊妹篇

[heap-sort-impl-patterns.md](../../wiki/coding/heap-sort-impl-patterns.md) 的 frontmatter `related` 字段（9 个引用）与"相关页面"段（9 个条目）完全一致：

| 概念页引用 | frontmatter `related` | "相关页面"段 | 文件存在性 | 对称性 |
| --- | --- | --- | --- | --- |
| thealgorithms-python | ✅ | ✅ | ✅ 存在 | ✅ 入口页反向引用 |
| thealgorithms-java | ✅ | ✅ | ✅ 存在 | ✅ 入口页反向引用 |
| thealgorithms-c-plus-plus | ✅ | ✅ | ✅ 存在 | ✅ 入口页反向引用 |
| thealgorithms-c | ✅ | ✅ | ✅ 存在 | ✅ 入口页反向引用 |
| thealgorithms-rust | ✅ | ✅ | ✅ 存在 | ✅ 入口页反向引用 |
| thealgorithms-typescript | ✅ | ✅ | ✅ 存在 | ✅ 入口页反向引用 |
| quick-sort-impl-patterns | ✅ | ✅ | ✅ 存在 | ⚠️ 单向（见 L-4） |
| merge-sort-impl-patterns | ✅ | ✅ | ✅ 存在 | ⚠️ 单向（见 L-4） |
| binary-search-impl-patterns | ✅ | ✅ | ✅ 存在 | ⚠️ 单向（见 L-4） |

所有引用文件经 `Test-Path` 验证真实存在。9 个引用中 6 个对应 6 种语言的入口页（1:1 对应），3 个对应同系列姊妹篇（quick-sort / merge-sort / binary-search）。

**与 DEF-016 的改进对比**：DEF-016 初版 `related` 缺 binary-search 引用（L-1，事后修复）；DEF-017 一开始就包含全部 3 个姊妹篇引用，无需修复。✅

#### 入口页 → 概念页

6 个入口页均正确追加 heap-sort 引用，引用描述与各语言实现特征对应：

| 入口页 | 引用描述 | 特征对应 | 结论 |
| --- | --- | --- | --- |
| [thealgorithms-python.md:184](../../wiki/coding/thealgorithms-python.md) | "含本仓库 Python 标准 sift-down 递归实现" | Python 递归 sift-down ✅ | ✅ |
| [thealgorithms-java.md:166](../../wiki/coding/thealgorithms-java.md) | "含本仓库 Java 1-based 索引 + 迭代 sift-down 实现" | Java 1-based 迭代 ✅ | ✅ |
| [thealgorithms-c-plus-plus.md:160](../../wiki/coding/thealgorithms-c-plus-plus.md) | "含本仓库 C++ 模板泛型实现，建堆起点非标准" | C++ template + n-1 起点 ✅ | ✅ |
| [thealgorithms-c.md:149](../../wiki/coding/thealgorithms-c.md) | "含本仓库 C 两个实现：v1 迭代 sift-down + v2 sift-up 建堆" | C 两个实现 ✅ | ✅ |
| [thealgorithms-rust.md:154](../../wiki/coding/thealgorithms-rust.md) | "含本仓库 Rust 升序/降序切换实现" | Rust ascending 切换 ✅ | ✅ |
| [thealgorithms-typescript.md:127](../../wiki/coding/thealgorithms-typescript.md) | "含本仓库 TypeScript 最简洁实现，含注释 bug" | TS 注释 bug ✅ | ✅ |

注意：TheAlgorithms/JavaScript 无 heap_sort 实现，故 JavaScript 入口页不追加引用，与 log.md 第 273 行记载"缺 JavaScript"一致。✅

#### 入口页 frontmatter `related` 策略一致性

经核查，6 个入口页的 frontmatter `related` 字段仅引用同体系入口页（`thealgorithms-*`），不引用算法模式页（`*-impl-patterns`）。这与 DEF-010 / DEF-016 确立的策略一致。主 Agent 自检结论"不需要更新入口页 frontmatter related"正确。✅

**交叉引用完整性结论：全部通过（1 项低风险单向引用建议见 L-4）。**

### 2.4 License 归属检查

| 代码片段 | 来源标注 | License 标注 | 实际 License | 结论 |
| --- | --- | --- | --- | --- |
| Python heap_sort | TheAlgorithms/Python `sorts/heap_sort.py` | MIT | MIT | ✅ 合规 |
| Java HeapSort | TheAlgorithms/Java `src/.../HeapSort.java` | MIT | MIT | ✅ 合规 |
| C++ heap_sort | TheAlgorithms/C-Plus-Plus `sorting/heap_sort.cpp` | MIT | MIT | ✅ 合规 |
| Rust heap_sort | TheAlgorithms/Rust `src/sorting/heap_sort.rs` | MIT | MIT | ✅ 合规 |
| TypeScript heap_sort | TheAlgorithms/TypeScript `sorts/heap_sort.ts` | MIT | MIT | ✅ 合规 |
| **C heap_sort.c (v1)** | TheAlgorithms/C `sorting/heap_sort.c` | **GPLv3** | **GPLv3** | ✅ 合规 |
| **C heap_sort_2.c (v2)** | TheAlgorithms/C `sorting/heap_sort_2.c` | **GPLv3** | **GPLv3** | ✅ 合规 |

**License 合规结论：全部正确。** 5 MIT + 2 GPLv3 标注全部准确。

**与 DEF-016 的关键改进对比**：DEF-016 存在 M-1 中风险（C 代码误标为 MIT，应为 GPLv3，事后修复）。DEF-017 吸取教训，C 代码两个版本均正确标注 GPLv3，且"相关页面"段第 443 行也标注 `[[wiki/coding/thealgorithms-c]] — 本仓库 C 实现（GPLv3）`。这是主 Agent 从 DEF-016 教训中改进的明显证据。✅

**代码片段长度评估**：每段 20-42 行（Python 20 行 / Java 33 行 / C++ 23 行 / Rust 42 行 / TypeScript 31 行 / C v1 33 行 / C v2 33 行），是完整文件的一小部分（TheAlgorithms 文件通常 50-200 行），用于教学对比目的，属于合理使用范围。

### 2.5 技术准确性审查

#### 主 Agent 盲区 1：代码片段准确性

逐段验证 7 段代码片段的内部逻辑一致性：

| 语言 | 代码片段内部一致性 | 截取说明 | 结论 |
| --- | --- | --- | --- |
| Python | `2*index+1` / `>` / `n//2-1` 建堆 / swap+heapify 排序 逻辑自洽 | 完整 | ✅ |
| Java | 1-based `array[k-1]` / `SortUtils.less` / `while(2*k<=n)` 迭代 逻辑自洽 | 完整 | ✅ |
| C++ | `2*i+1` / `>` / `n-1` 建堆起点 / swap+heapify 逻辑自洽 | 完整 | ✅ |
| Rust | `(len-1)/2` 建堆 / `comparator` 函数指针 / 切片 `arr[..end]` 逻辑自洽 | 完整 | ✅ |
| TypeScript | `2*index+1` / `>` / `Math.floor(n/2)-1` 建堆 逻辑自洽 | 完整 | ✅ |
| C (v1) | 1-based `a[1]`-`a[n]` / `temp` 暂存 / `while(j<=n)` 迭代 / `temp <= a[j]` 逻辑自洽 | 完整 | ✅ |
| C (v2) | `heapifyUp` sift-up 建堆 / `heapifyDown` sift-down 排序 / `int8_t` / `uint8_t` 逻辑自洽 | 完整 | ✅ |

**C v1 `temp <= a[j]` 判断逻辑专项分析**：

```c
if (temp > a[j]) {
    break;
} else if (temp <= a[j]) {
    a[j / 2] = a[j];
    j = 2 * j;
}
```

`temp > a[j]` 与 `temp <= a[j]` 是互补条件（覆盖所有情况），`else if` 实际等价于 `else`。关键行为：`temp == a[j]`（相等）时，子节点也会上移（根节点下移）。这与标准实现（`>` 严格大于，相等时不下移）不同，但不影响排序正确性（相等元素交换不违反最大堆性质）。此行为加剧不稳定性，但不改变"堆排序不稳定"的整体判定。代码片段完整展示此逻辑，无截取遗漏。✅

**C v2 `uint8_t` 循环边界专项分析**：

```c
for (uint8_t i = size - 1; i >= 1; i--) {
    swap(&arr[0], &arr[i]);
    heapifyDown(arr, i);
}
```

`uint8_t` 是无符号类型，`i >= 1` 保证 `i=0` 时退出循环，避免 `i--` 下溢为 255。`if (size <= 1) return;` 保护了 `size=0` 时 `size-1` 下溢的风险。代码逻辑安全。✅

**Java `SortUtils.less/swap` 调用完整性**：代码片段展示了 `SortUtils.less(array[j-1], array[j])` 和 `SortUtils.swap(array, k-1, j-1)` 调用，这些是 TheAlgorithms/Java 仓库的标准工具函数，与其他排序算法统一使用，逻辑自洽。✅

代码片段内部逻辑一致性验证通过。

#### 主 Agent 盲区 2：建堆复杂度证明

概念页 [heap-sort-impl-patterns.md:387](../../wiki/coding/heap-sort-impl-patterns.md) 的证明：

> 设堆高度为 h = log n。第 k 层有 n/2^(k+1) 个节点，每个节点 sift-down 最多移动 k 步。总工作量为 Σ(k=0 to h) (n/2^(k+1)) × k = (n/2) Σ(k=0 to h) k/2^k = O(n)（因为 Σ k/2^k 收敛于常数）。

**验证**：

1. k 从底往上数（k=0 为叶子层，k=h 为根层）：
   - 第 k 层节点数 ≈ n/2^(k+1)：k=0（叶子）≈ n/2 ✅，k=h（根）= 1 ✅
   - 第 k 层每个节点 sift-down 最多移动 k 步：叶子 k=0 移动 0 步 ✅，根 k=h 移动 h 步 ✅

2. 总工作量 = Σ(k=0 to h) (n/2^(k+1)) × k = (n/2) Σ(k=0 to h) k/2^k

3. 已知级数 Σ(k=0 to ∞) k/2^k = 2（通过 Σ kx^k = x/(1-x)^2 在 x=1/2 求值得 2）

4. 因此总工作量 = (n/2) × 2 = O(n) ✅

**数学严谨性结论：证明正确。** Σ k/2^k 收敛于常数 2，因此 sift-down 建堆为 O(n)。概念页表述准确。

#### 主 Agent 盲区 3：C++ 建堆起点"非标准"判定

概念页声称 C++ 版本从 `n-1` 开始建堆（而非标准的 `n/2-1`），多出对叶子节点的无效 heapify 调用，但结果正确。

**验证**：

- C++ 代码：`for (int i = n - 1; i >= 0; i--) heapify(arr, n, i);`
- 标准实现：`for (int i = n / 2 - 1; i >= 0; i--) heapify(arr, n, i);`
- 差异区间：i ∈ [n/2, n-1]，这些索引对应叶子节点（索引 ≥ n/2 的节点无子节点）
- 叶子节点 heapify：`l = 2*i+1 ≥ n` 且 `r = 2*i+2 ≥ n`，两个 if 条件均不满足，`largest == i`，函数立即返回（no-op）
- 正确性：叶子节点的 heapify 是 no-op，不影响建堆结果 ✅
- 效率：多约 n/2 次无效函数调用，建堆复杂度仍为 O(n)（常数因子增大）✅

**判定准确：C++ 建堆起点非标准仅影响效率，不影响正确性。** ✅

#### 主 Agent 盲区 4：Rust 升序降序切换正确性

概念页声称：

- `ascending = true` → `is_max_heap = true` → 建最大堆 → 排序后升序
- `ascending = false` → `is_max_heap = false` → 建最小堆 → 排序后降序

**验证 comparator 映射**：

```rust
let comparator: fn(&T, &T) -> Ordering = if is_max_heap {
    |a, b| a.cmp(b)      // a > b 时返回 Greater
} else {
    |a, b| b.cmp(a)      // a < b 时返回 Greater（即 b > a）
};
```

- `is_max_heap = true` → `comparator = a.cmp(b)` → `comparator(&arr[l], &arr[idx]) == Greater` 即 `arr[l] > arr[idx]` → 大值上浮 → **最大堆** ✅
- `is_max_heap = false` → `comparator = b.cmp(a)` → `comparator(&arr[l], &arr[idx]) == Greater` 即 `arr[l] < arr[idx]` → 小值上浮 → **最小堆** ✅

**验证排序方向**：

```rust
pub fn heap_sort<T: Ord>(arr: &mut [T], ascending: bool) {
    build_heap(arr, ascending);   // ascending 直接传入作为 is_max_heap
    while end > 0 {
        arr.swap(0, end);         // 堆顶 swap 到末尾
        heapify(&mut arr[..end], 0, ascending);
        end -= 1;
    }
}
```

- `ascending = true` → 最大堆 → 堆顶是最大值 → swap 到末尾 → 末尾最大 → **升序**（从小到大）✅
- `ascending = false` → 最小堆 → 堆顶是最小值 → swap 到末尾 → 末尾最小 → **降序**（从大到小）✅

**判定准确：Rust 升序降序切换的 comparator 映射与排序方向完全正确。** ✅

#### 主 Agent 盲区 5：稳定性判定

概念页声称 7 种实现全部不稳定。

**堆排序本质不稳定的原因**：排序阶段，堆顶元素与末尾元素交换（`arr.swap(0, end)` / `swap(arr[0], arr[i])`），这种远距离交换跨越多个元素，会破坏相等元素的相对顺序。即使比较运算符是严格的（`>`），交换本身仍会打乱相等元素。

**逐项验证**：

| 语言 | 比较运算 | 相等时行为 | 概念页判定 | 验证结论 |
| --- | --- | --- | --- | --- |
| Python | `>` 严格大于 | 不交换，但 swap 跨越相等元素 | 不稳定 | ✅ 正确 |
| Java | `SortUtils.less` 严格小于 | 不交换，但 swap 跨越 | 不稳定 | ✅ 正确 |
| C++ | `>` 严格大于 | 不交换，但 swap 跨越 | 不稳定 | ✅ 正确 |
| Rust | `Ordering::Greater` 严格大于 | 不交换，但 swap 跨越 | 不稳定 | ✅ 正确 |
| TypeScript | `>` 严格大于 | 不交换，但 swap 跨越 | 不稳定 | ✅ 正确 |
| C (v1) | `temp <= a[j]` 相等也下移 | 相等时交换，加剧不稳定 | 不稳定 | ✅ 正确 |
| C (v2) | `>` 严格大于 | 不交换，但 swap 跨越 | 不稳定 | ✅ 正确 |

**反例验证**（以 Python 为例）：数组 [5a, 5b, 3]（5a、5b 相等，5a 在前）。

- 建最大堆后，堆顶可能是 5a（取决于建堆过程）
- 排序第一步：swap 堆顶 5a 与末尾 3 → [3, 5b, 5a]
- 5a 现在在 5b 后面，相对顺序被破坏 → 不稳定 ✅

**判定准确：7 种实现全部不稳定。** 堆排序的本质（远距离 swap）决定了不稳定性，与比较运算符的严格性无关。C v1 的 `<=` 仅加剧不稳定，不改变判定。✅

#### 跨语言对比矩阵验证

| 矩阵条目 | 代码片段验证 | 结论 |
| --- | --- | --- |
| Python 建堆 `n//2-1` 到 0 | `range(n // 2 - 1, -1, -1)` | ✅ |
| Java 1-based 迭代 | `for (k = n/2; k >= 1; k--)` + `while(2*k<=n)` | ✅ |
| C++ 从 n-1 开始 | `for (i = n-1; i >= 0; i--)` | ✅ |
| Rust `(len-1)/2` 到 0 | `(arr.len()-1)/2` + while + 单独 heapify(0) | ✅ |
| TypeScript `Math.floor(n/2)-1` | `Math.floor(n / 2) - 1` | ✅ |
| C (v1) 1-based 迭代 + temp | `for (i = n/2; i >= 1; i--)` + `temp = a[i]` | ✅ |
| C (v2) sift-up 建堆 O(n log n) | `for (i = 0; i < size; i++) heapifyUp(arr, i)` | ✅ |
| C (v2) 混合策略 | 建堆 heapifyUp + 排序 heapifyDown | ✅ |

矩阵全部 7 行 × 7 列经代码片段逐项验证，准确无误。

**技术准确性结论：全部通过。** 5 项盲区全部验证正确，无技术错误。

### 2.6 markdown 结构质量

| 检查项 | 结论 | 详情 |
| --- | --- | --- |
| 标题层级（H2 → H3） | ✅ 一致 | 概念 → 七种实现对比（H3 1-7）→ 对比矩阵 → 选型矩阵 → 关键洞察（H3 1-5）→ 工业实现对比 → 何时选择堆排序 → 相关页面 |
| 代码块语言标注（MD040） | ✅ 全部标注 | python / java / cpp / rust / typescript / c ×2 |
| 代码块前后空行（MD031） | ✅ | 7 个代码块前后均有空行 |
| 标题前后空行（MD022） | ✅ | 所有 H2/H3 前后均有空行 |
| 列表前后空行（MD032） | ✅ | |
| 表格格式（MD056） | ✅ | 对比矩阵 7×8 / 选型矩阵 3×9 / 工业对比 4×5 / 何时选择 3×8 |
| 无重复标题（MD024） | ✅ | H3 数字编号但标题文本各异 |
| markdownlint-cli2 | ✅ | **独立验证**：9 个变更文件 0 issues（guardrail-enforcer 亲自运行 `npx markdownlint-cli2` 确认） |
| consistency-check.js | ✅ | **独立验证**：`node scripts/consistency-check.js` 输出"一致性检查通过 ✓" |

### 2.7 行尾符检查

| 文件 | CRLF | LF | 分析 | 结论 |
| --- | --- | --- | --- | --- |
| heap-sort-impl-patterns.md | 0 | 445 | 新建文件纯 LF | ✅ 与 DEF-016 一致 |
| index.md | 85 | 85 | 既有文件纯 CRLF（core.autocrlf=true） | ✅ 既有文件 |
| log.md | 282 | 282 | 既有文件纯 CRLF | ✅ 既有文件 |
| thealgorithms-python.md | 186 | 187 | CRLF 为主 + 1 行 LF | ⚠️ 见 L-5 |
| thealgorithms-java.md | 168 | 169 | CRLF 为主 + 1 行 LF | ⚠️ 见 L-5 |
| thealgorithms-c-plus-plus.md | 163 | 164 | CRLF 为主 + 1 行 LF | ⚠️ 见 L-5 |
| thealgorithms-c.md | 151 | 152 | CRLF 为主 + 1 行 LF | ⚠️ 见 L-5 |
| thealgorithms-rust.md | 156 | 157 | CRLF 为主 + 1 行 LF | ⚠️ 见 L-5 |
| thealgorithms-typescript.md | 129 | 130 | CRLF 为主 + 1 行 LF | ⚠️ 见 L-5 |

**专项核查**：入口页中的 1 行 LF 经定位为 DEF-016 追加的 merge-sort 引用行（非 DEF-017 引入）。DEF-017 追加的 heap-sort 引用行使用 CRLF（与既有文件一致）。`core.autocrlf=true` 配置下，Git commit 时 CRLF → LF，仓库中行尾符统一为 LF，不影响 CI 兼容性。详见 L-5。

## 3. 安全漏洞扫描

### 3.1 敏感信息泄露

扫描所有代码片段和文本内容：

| 检查项 | 结论 |
| --- | --- |
| 硬编码密钥/密码/token | ✅ 未发现 |
| 内部 IP/域名 | ✅ 未发现 |
| 个人信息 | ✅ 未发现 |
| 文件路径泄露 | ✅ 未发现（仅引用 GitHub 公开路径） |

### 3.2 License 合规性

| 检查项 | 结论 |
| --- | --- |
| MIT 代码引用标注归属 | ✅ 5 段 MIT 代码均标注来源 + License |
| GPLv3 代码引用标注归属 | ✅ 2 段 C 代码标注为 GPLv3（无 DEF-016 的 M-1 错误） |
| 代码片段长度合理使用 | ✅ 每段 20-42 行，占原文件小部分 |
| 来源段汇总 | ✅ 每段代码上方均有"来源"标注 |
| copyleft 警告 | ✅ C v1/v2 特征均标注"License：GPLv3"，"相关页面"段也标注 |

### 3.3 外部链接安全性

| 链接 | 指向 | 可信度 |
| --- | --- | --- |
| github.com/TheAlgorithms/Python | GitHub 官方仓库 | ✅ 可信 |
| github.com/TheAlgorithms/Java | GitHub 官方仓库 | ✅ 可信 |
| github.com/TheAlgorithms/C-Plus-Plus | GitHub 官方仓库 | ✅ 可信 |
| github.com/TheAlgorithms/C | GitHub 官方仓库 | ✅ 可信 |
| github.com/TheAlgorithms/Rust | GitHub 官方仓库 | ✅ 可信 |
| github.com/TheAlgorithms/TypeScript | GitHub 官方仓库 | ✅ 可信 |

所有外部链接均指向 `github.com/TheAlgorithms/*` 可信域名。

### 3.4 注入防护

不适用——纯 markdown 文档变更，无代码执行路径、无数据库交互、无命令执行、无模板引擎。

### 3.5 密钥与配置安全

不适用——无配置文件变更、无环境变量、无 .gitignore 变更。

### 3.6 依赖与供应链风险

不适用——无依赖文件变更（package.json、Cargo.toml 等未修改）。

## 4. 文档一致性检查

### 4.1 index.md 检查

| 检查项 | 结论 | 详情 |
| --- | --- | --- |
| "算法实现模式"子段 | ✅ | 第 41-48 行 |
| 列出 heap-sort-impl-patterns | ✅ | 第 48 行 |
| 日期标注 | ✅ | 2026-07-25 |
| 总页数 | ✅ | 标注"35"，实际 35（kb-system 9 + coding 外部资源 8 + 算法模式 4 + resources 1 + design 9 + experiences 4）|

### 4.2 log.md 条目格式检查

| 检查项 | 结论 |
| --- | --- |
| 标题格式 `## [YYYY-MM-DD] ingest \| <标题>` | ✅ `## [2026-07-25] ingest \| DEF-017 — heap-sort 跨语言实现模式对比（Phase 4 第二个交付）` |
| 任务字段 | ✅ `创作 heap-sort-impl-patterns.md 概念页（ADR-009 Phase 4 / DEF-016 续）` |
| 数据来源字段 | ✅ `6 个 TheAlgorithms 仓库的 heap_sort 实现（GitHub MCP get_file_contents 实时获取），C 仓库含 2 个实现` |
| 影响页面字段 | ✅ `1 个新建概念页 + 6 个入口页交叉引用更新 + index.md 更新（总页数 34 → 35）+ 本日志` |
| 任务令牌字段 | ✅ `TKN-HEAP-SORT-001` |
| pages 列表 | ✅ 列出 `wiki/coding/heap-sort-impl-patterns.md` |
| notes 字段 | ✅ 记录覆盖语言数、C 双实现、Rust 升序降序、License 合规 |
| License 合规声明 | ✅ notes 说"5 MIT + 2 GPLv3（C 两个版本），标注来源"，与概念页实际标注一致（无 DEF-016 的执行偏差） |

### 4.3 ADR-009 决策 1 合规性

| 决策 1 要求 | 本次交付 | 结论 |
| --- | --- | --- |
| 保留 9 张 thealgorithms-*.md 作为入口页 | 未删除任何入口页 | ✅ |
| 创建具体算法 concept 页 | heap-sort-impl-patterns.md | ✅ |
| 记录跨语言实现对比 | 6 种语言 7 种堆排序实现对比 | ✅ |
| 真正读仓库代码后沉淀 | log.md 记录通过 GitHub MCP 读取 6 个源文件 | ✅ |
| License 合规：标注 MIT/GPLv3 来源 | 5 MIT + 2 GPLv3 全部正确标注 | ✅ |

## 5. 主 Agent 盲区回应

### 盲区 1：代码片段准确性

**结论：通过。** 7 段代码片段内部逻辑一致性验证通过。C v1 的 `temp <= a[j]` 判断逻辑完整展示（互补条件，相等时下移），C v2 的 heapifyUp/heapifyDown 完整展示，Java 的 SortUtils.less/swap 调用完整展示。无截取遗漏。

### 盲区 2：建堆复杂度证明

**结论：数学严谨。** Σ k/2^k 收敛于常数 2（通过 Σ kx^k = x/(1-x)^2 在 x=1/2 求值），因此 sift-down 建堆总工作量为 (n/2) × 2 = O(n)。概念页表述准确。

### 盲区 3：C++ 建堆起点"非标准"判定

**结论：判定准确。** 从 n-1 开始建堆，对叶子节点（索引 ≥ n/2）的 heapify 是 no-op（`largest == i` 立即返回），结果正确但多约 n/2 次无效函数调用。仅影响效率，不影响正确性。

### 盲区 4：Rust 升序降序切换正确性

**结论：映射准确。** `is_max_heap=true` → `a.cmp(b)` → 最大堆 → 排序后升序；`is_max_heap=false` → `b.cmp(a)` → 最小堆 → 排序后降序。comparator 函数指针映射与排序方向完全正确。

### 盲区 5：稳定性判定

**结论：全部正确。** 堆排序本质不稳定（排序阶段堆顶与末尾的远距离 swap 破坏相等元素相对顺序），与比较运算符严格性无关。7 种实现全部不稳定。C v1 的 `<=` 仅加剧不稳定，不改变判定。

### 遗憾 1：未深度对比 quick-sort/merge-sort 格式细节

**结论：格式一致且扩展合理。** heap-sort 概念页与 merge-sort/quick-sort 在 frontmatter 结构、标题层级（H2 概念 → H3 编号实现 → H2 矩阵 → H2 洞察 → H2 相关页面）、代码块语言标注、"来源"标注风格上完全一致。heap-sort 额外增加了"## 工业实现对比"和"## 何时选择堆排序"两个段落，这是 heap-sort 特有的价值（堆在工业中更多作为数据结构而非排序算法），扩展合理。

### 遗憾 2：TypeScript 注释 bug

**结论：客观标注，无需阻断。** 概念页第 256 行准确标注 TypeScript JSDoc 中 `@example MergeSort` 应为 `HeapSort`（复制粘贴错误）。这是 TheAlgorithms/TypeScript 仓库源码中的客观事实，概念页如实记录。是否向仓库提 Issue 不影响知识库准确性。

### 遗憾 3：C v1 `temp <= a[j]` 对稳定性影响

**结论：不影响稳定性判定。** `temp <= a[j]` 在相等时也下移（子节点上移），加剧不稳定性，但堆排序本质已不稳定（远距离 swap），故不改变"不稳定"判定。建议在 C v1 特征中补充说明 `<=` 的行为（见 L-2）。

## 6. 综合结论

- [x] **通过**：可进入测试阶段
- [ ] **有条件通过**：需修复 N 项后重新提交
- [ ] **阻断**：存在严重质量缺陷或高危安全漏洞

### 结论依据

无阻断项、无高风险项、**无中风险项**。5 项低风险改进建议（L-1 至 L-5）不阻断，可在后续迭代中处理。

**与 DEF-016 先例的关键改进**：

1. **License 标注**：DEF-016 存在 M-1 中风险（C 代码误标 MIT，事后修复）；DEF-017 正确标注 5 MIT + 2 GPLv3，零中风险。✅
2. **related 字段**：DEF-016 初版缺 binary-search 引用（L-1，事后修复）；DEF-017 一开始就包含全部 9 个引用，无需修复。✅
3. **盲区覆盖**：DEF-017 盲区数（5 项）多于 DEF-016（3 项），但全部验证通过，技术准确性更高。✅

## 7. 阻塞项与回退指令

### 中风险（必须修复）

无。

### 低风险（改进建议，不阻断）

| 编号 | 问题 | 文件 | 行号 | 修复建议 | 状态 |
| --- | --- | --- | --- | --- | --- |
| L-1 | Python 对比矩阵"独特特性"标注为"doctest 示例"，但代码片段未显示 doctest | `wiki/coding/heap-sort-impl-patterns.md` | 第 360 行矩阵 / 第 31-51 行代码 | 在 Python 特征段注明"完整文件含 doctest 示例，此处省略"，或在代码片段末尾补一行 doctest 注释 | 未修复（低风险，不阻断） |
| L-2 | C v1 特征中未详细分析 `temp <= a[j]` 的行为（相等时也下移，与标准 `>` 实现不同） | `wiki/coding/heap-sort-impl-patterns.md` | 第 298-305 行特征 | 在 C v1 特征中补充："比较逻辑使用 `temp <= a[j]`（相等时也下移），与标准 `>` 实现不同，加剧不稳定性但不影响正确性" | 未修复（低风险，不阻断） |
| L-3 | Rust build_heap 用 `while i > 0` + 单独 `heapify(arr, 0)` 避免 usize 下溢，概念页未说明此 Rust 安全考虑 | `wiki/coding/heap-sort-impl-patterns.md` | 第 156-163 行代码 / 第 200-209 行特征 | 在 Rust 特征中补充："build_heap 用 while i > 0 + 单独处理 0 避免 usize 无符号下溢，体现 Rust 的安全防御" | 未修复（低风险，不阻断） |
| L-4 | 跨语言对比矩阵缺"稳定性"列；quick-sort/merge-sort 姊妹篇未反向引用 heap-sort（系列完整性） | `wiki/coding/heap-sort-impl-patterns.md` 第 358 行 / `quick-sort-impl-patterns.md` / `merge-sort-impl-patterns.md` | 矩阵 / 相关页面段 | 矩阵增加"稳定性"列（全部"不稳定"）；在 quick-sort 和 merge-sort 的"相关页面"段追加 heap-sort 引用（不在本次变更范围，建议后续迭代补充） | 未修复（低风险，不阻断） |
| L-5 | 6 个入口页中 DEF-016 追加的 merge-sort 引用行使用 LF 行尾符，与文件其余 CRLF 不一致 | `wiki/coding/thealgorithms-*.md` | merge-sort 引用行 | `core.autocrlf=true` 下 Git commit 时自动转为 LF，不影响仓库一致性。建议后续用 `git add --renormalize .` 统一行尾符 | 未修复（DEF-016 遗留，不在本次范围） |

### 回退指令

**无中风险或阻断项，无回退指令。** 主 Agent 可直接进入下一阶段（ac-verifier 验收测试）。L-1 至 L-5 为低风险改进建议，可在后续迭代中处理，不阻断本次提交。

## 8. 待澄清

无。所有前置产出物（ADR-009 决策 1、ADR-008 决策 1、AGENTS.md §3.1.1、log.md 格式规范）均无矛盾或模糊点。

## 9. 自动化建议

### 9.1 行尾符一致性检查（针对 L-5）

建议在 `scripts/consistency-check.js` 中新增行尾符混合检查，检测 wiki 页中 CRLF 与 LF 混合的情况：

```javascript
// 检查 wiki 页是否存在 CRLF/LF 混合行尾符
const wikiFiles = glob.sync('wiki/**/*.md');
for (const file of wikiFiles) {
  const buffer = fs.readFileSync(file);
  const content = buffer.toString('utf8');
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/\n/g) || []).length;
  const loneLfCount = lfCount - crlfCount;
  if (crlfCount > 0 && loneLfCount > 0) {
    warnings.push(
      `${file}: 行尾符混合（CRLF=${crlfCount}, LF-only=${loneLfCount}），建议运行 git add --renormalize . 统一`
    );
  }
}
```

### 9.2 License 标注自动化（延续 DEF-016 建议）

DEF-016 §9 已建议在 consistency-check.js 中新增 TheAlgorithms/C 代码片段 GPLv3 标注检查。DEF-017 验证该检查（如果已实现）有效——概念页正确标注 GPLv3。建议确认该检查已在 CI 中启用。

### 9.3 姊妹篇双向引用检查

建议新增算法模式页姊妹篇双向引用检查，确保 quick-sort / merge-sort / heap-sort / binary-search 之间互相引用：

```javascript
const patternPages = ['quick-sort', 'merge-sort', 'heap-sort', 'binary-search']
  .map(name => `wiki/coding/${name}-impl-patterns.md`);
for (const page of patternPages) {
  const content = fs.readFileSync(page, 'utf8');
  for (const other of patternPages) {
    if (other === page) continue;
    const otherName = path.basename(other, '.md');
    if (!content.includes(`[[wiki/coding/${otherName}]]`)) {
      warnings.push(`${page}: 缺少姊妹篇引用 ${otherName}`);
    }
  }
}
```

此检查可作为 `.github/workflows/docs.yml` 的非阻断状态检查（warning 级别），在 CI 阶段自动提示姊妹篇引用缺失。

---

**最终结论：通过。** 无阻断项、无高风险项、无中风险项。DEF-017 吸取 DEF-016 教训，License 标注（5 MIT + 2 GPLv3）全部正确，related 字段（9 引用）完整无缺，5 项盲区全部验证通过。5 项低风险改进建议（L-1 至 L-5）不阻断，可在后续迭代中处理。

主 Agent 可启动 `ac-verifier` 子 Agent 进入验收测试阶段。
