---
title: "归并排序跨语言实现模式对比"
domain: [coding]
type: concept
status: active
date: 2026-07-25
tags: [algorithm, sorting, mergesort, python, java, cpp, javascript, c, rust, typescript, cross-language, divide-and-conquer]
related: [[wiki/coding/thealgorithms-python]], [[wiki/coding/thealgorithms-java]], [[wiki/coding/thealgorithms-c-plus-plus]], [[wiki/coding/thealgorithms-javascript]], [[wiki/coding/thealgorithms-c]], [[wiki/coding/thealgorithms-rust]], [[wiki/coding/thealgorithms-typescript]], [[wiki/coding/quick-sort-impl-patterns]], [[wiki/coding/binary-search-impl-patterns]]
---

## 概念

归并排序的分治骨架在所有语言中高度一致（`mid = len/2` → 递归左右 → merge），真正的工程差异集中在两个选择：**merge 是否原地** 与 **临时存储如何管理**。理解这两个维度，就能解释为什么同一个"归并排序"在不同语言中的空间占用、性能特征、甚至正确性风险都不同。

本页基于 TheAlgorithms 七个仓库的**真实代码**进行对比，不是教科书伪代码改写。

七个实现分为两大阵营：

- **函数式非原地**（Python / JavaScript / TypeScript）：输入不变，返回新数组，merge 通过双指针索引填充结果数组
- **命令式原地**（Java / C++ / C / Rust）：修改输入数组，merge 需要临时存储暂存数据，差异在临时存储的分配策略

**特别值得注意**：Rust 仓库是唯一同时提供 **top-down（递归）** 和 **bottom-up（迭代）** 两种实现的仓库，且 Python 实现中藏着一个 O(n²) 的性能陷阱。

## 七种实现对比

### 1. Python — 函数式非原地（含性能陷阱）

来源：[TheAlgorithms/Python `sorts/merge_sort.py`](https://github.com/TheAlgorithms/Python/blob/master/sorts/merge_sort.py)（MIT）

```python
def merge_sort(collection: list) -> list:
    def merge(left: list, right: list) -> list:
        result = []
        while left and right:
            result.append(left.pop(0) if left[0] <= right[0] else right.pop(0))
        result.extend(left)
        result.extend(right)
        return result

    if len(collection) <= 1:
        return collection
    mid_index = len(collection) // 2
    return merge(merge_sort(collection[:mid_index]), merge_sort(collection[mid_index:]))
```

**特征**：

- **非原地**：每次递归通过切片 `collection[:mid_index]` 创建两个新列表，空间 O(n)（不含递归栈）
- **性能陷阱**：`left.pop(0)` 是 O(n) 操作（需移动后续所有元素），导致 merge 阶段从理想的 O(n) 退化为 O(n²)
- **可读性最高**：嵌套函数 + 切片语法，代码最接近教科书定义
- **稳定性**：`left[0] <= right[0]` 保证相等元素左侧优先，是稳定排序

> ⚠️ **陷阱说明**：若将 `pop(0)` 改为索引访问 `left[i]`（如 JavaScript 版本），merge 阶段可恢复 O(n)。这是 Python 实现特有的性能缺陷。

### 2. JavaScript — 函数式非原地（索引版）

来源：[TheAlgorithms/JavaScript `Sorts/MergeSort.js`](https://github.com/TheAlgorithms/JavaScript/blob/master/Sorts/MergeSort.js)（MIT）

```javascript
export function merge(list1, list2) {
  const results = []
  let i = 0
  let j = 0
  while (i < list1.length && j < list2.length) {
    if (list1[i] < list2[j]) {
      results.push(list1[i++])
    } else {
      results.push(list2[j++])
    }
  }
  return results.concat(list1.slice(i), list2.slice(j))
}

export function mergeSort(list) {
  if (list.length < 2) return list
  const listHalf = Math.floor(list.length / 2)
  return merge(mergeSort(list.slice(0, listHalf)), mergeSort(list.slice(listHalf)))
}
```

**特征**：

- **非原地**：`slice` 创建新数组，与 Python 阵营一致
- **索引访问**：用 `i++` / `j++` 而非 `pop(0)`，merge 阶段保持 O(n)，**规避了 Python 版的性能陷阱**
- **收尾简洁**：`results.concat(list1.slice(i), list2.slice(j))` 一行处理剩余元素
- **不稳定**：`list1[i] < list2[j]` 严格小于，相等时取右侧，**不是稳定排序**（与 Python 相反）

### 3. TypeScript — 函数式非原地（预分配版）

来源：[TheAlgorithms/TypeScript `sorts/merge_sort.ts`](https://github.com/TheAlgorithms/TypeScript/blob/master/sorts/merge_sort.ts)（MIT）

```typescript
export function mergeSort(array: number[]): number[] {
  if (array.length <= 1) return array.slice()
  const midIndex = Math.floor(array.length / 2)
  const left = array.slice(0, midIndex)
  const right = array.slice(midIndex, array.length)
  return merge(mergeSort(left), mergeSort(right))
}

function merge(left: number[], right: number[]): number[] {
  const result = Array<number>(left.length + right.length)
  let curIndex = 0
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] < right[rightIndex]) {
      result[curIndex++] = left[leftIndex++]
    } else {
      result[curIndex++] = right[rightIndex++]
    }
  }
  while (leftIndex < left.length) result[curIndex++] = left[leftIndex++]
  while (rightIndex < right.length) result[curIndex++] = right[rightIndex++]
  return result
}
```

**特征**：

- **非原地**：与 JS 版同为函数式风格
- **预分配数组**：`Array<number>(left.length + right.length)` 预分配精确容量，避免 `push` 的动态扩容开销
- **类型注解**：`number[]` 限定，比 JS 版有更强的类型安全（但非泛型，仅支持 number）
- **JSDoc 完整**：包含复杂度分析与递推关系 `T(n) = 2T(n/2) + O(n)`
- **不稳定**：严格 `<` 比较，与 JS 版一致

### 4. Java — 原地排序（tempArray 实例字段复用）

来源：[TheAlgorithms/Java `src/main/java/com/thealgorithms/sorts/MergeSort.java`](https://github.com/TheAlgorithms/Java/blob/master/src/main/java/com/thealgorithms/sorts/MergeSort.java)（MIT）

```java
@SuppressWarnings("rawtypes")
class MergeSort implements SortAlgorithm {
    private Comparable[] tempArray;

    @Override
    public <T extends Comparable<T>> T[] sort(T[] unsorted) {
        tempArray = new Comparable[unsorted.length];
        doSort(unsorted, 0, unsorted.length - 1);
        return unsorted;
    }

    private <T extends Comparable<T>> void doSort(T[] arr, int left, int right) {
        if (left < right) {
            int mid = (left + right) >>> 1;
            doSort(arr, left, mid);
            doSort(arr, mid + 1, right);
            merge(arr, left, mid, right);
        }
    }

    private <T extends Comparable<T>> void merge(T[] arr, int left, int mid, int right) {
        int i = left;
        int j = mid + 1;
        System.arraycopy(arr, left, tempArray, left, right + 1 - left);
        for (int k = left; k <= right; k++) {
            if (j > right) {
                arr[k] = (T) tempArray[i++];
            } else if (i > mid) {
                arr[k] = (T) tempArray[j++];
            } else if (less(tempArray[j], tempArray[i])) {
                arr[k] = (T) tempArray[j++];
            } else {
                arr[k] = (T) tempArray[i++];
            }
        }
    }
}
```

**特征**：

- **原地排序**：修改输入数组，仅返回引用
- **tempArray 实例字段**：在 `sort()` 入口一次分配 `new Comparable[unsorted.length]`，全递归复用 — **七种实现中最高效的临时存储策略**，避免每次 merge 重复分配
- **泛型**：`<T extends Comparable<T>>` 支持任意可比较类型
- **无符号右移**：`(left + right) >>> 1` 计算 mid，避免 `int` 溢出
- **稳定性**：`less(tempArray[j], tempArray[i])` 严格小于，相等时取左侧 `i`，**是稳定排序**
- **`@SuppressWarnings("unchecked")`**：泛型数组擦除的妥协，`Comparable[]` 转 `T[]` 需强制转换

### 5. C++ — 原地排序（std::vector 临时数组）

来源：[TheAlgorithms/C-Plus-Plus `sorting/merge_sort.cpp`](https://github.com/TheAlgorithms/C-Plus-Plus/blob/master/sorting/merge_sort.cpp)（MIT）

```cpp
void merge(int *arr, int l, int m, int r) {
    int n1 = m - l + 1;
    int n2 = r - m;
    std::vector<int> L(n1), R(n2);

    for (int i = 0; i < n1; i++) L[i] = arr[l + i];
    for (int j = 0; j < n2; j++) R[j] = arr[m + 1 + j];

    int i = 0, j = 0, k = l;
    while (i < n1 && j < n2) {
        if (L[i] <= R[j]) {
            arr[k] = L[i];
            i++;
        } else {
            arr[k] = R[j];
            j++;
        }
        k++;
    }
    while (i < n1) { arr[k] = L[i]; i++; k++; }
    while (j < n2) { arr[k] = R[j]; j++; k++; }
}

void mergeSort(int *arr, int l, int r) {
    if (l < r) {
        int m = l + (r - l) / 2;
        mergeSort(arr, l, m);
        mergeSort(arr, m + 1, r);
        merge(arr, l, m, r);
    }
}
```

**特征**：

- **原地排序**：修改 `int *arr` 指向的内存
- **每次 merge 分配**：`std::vector<int> L(n1), R(n2)` 每次调用都创建临时向量 — 比 Java 的复用策略低效，但比 C 的手动管理安全
- **无泛型**：仅支持 `int`，未使用模板 `<typename T>`
- **溢出防护**：`m = l + (r - l) / 2` 避免 `(l + r) / 2` 溢出
- **稳定性**：`L[i] <= R[j]` 含等号，**稳定排序**
- **RAII**：`std::vector` 析构自动释放，无内存泄漏风险

### 6. C — 原地排序（malloc/free 手动管理）

来源：[TheAlgorithms/C `sorting/merge_sort.c`](https://github.com/TheAlgorithms/C/blob/master/sorting/merge_sort.c)（GPLv3）

```c
void merge(int *a, int l, int r, int n) {
    int *b = (int *)malloc(n * sizeof(int));
    if (b == NULL) {
        printf("Can't Malloc! Please try again.");
        exit(EXIT_FAILURE);
    }
    int c = l;
    int p1 = l, p2 = ((l + r) / 2) + 1;
    while ((p1 < ((l + r) / 2) + 1) && (p2 < r + 1)) {
        if (a[p1] <= a[p2]) { b[c++] = a[p1++]; }
        else { b[c++] = a[p2++]; }
    }
    // 处理剩余元素（原代码含 if/else 两个 while 循环处理 p1/p2 剩余，此处省略）
    for (c = l; c < r + 1; c++) a[c] = b[c];
    free(b);
}

void merge_sort(int *a, int n, int l, int r) {
    if (r - l == 1) {
        if (a[l] > a[r]) swap(&a[l], &a[r]);
    } else if (l != r) {
        merge_sort(a, n, l, (l + r) / 2);
        merge_sort(a, n, ((l + r) / 2) + 1, r);
        merge(a, l, r, n);
    }
}
```

**特征**：

- **原地排序**：修改 `int *a`
- **malloc/free 手动管理**：每次 merge 调用 `malloc(n * sizeof(int))` 分配整个数组大小的临时空间 — **分配粒度最粗**（按 n 而非按子区间），且 `free` 在函数末尾，若中途出错会泄漏
- **边界优化**：`r - l == 1` 时直接 `swap`，避免对 2 元素区间走完整 merge 流程 — 七种实现中独有的优化
- **稳定性**：`a[p1] <= a[p2]` 含等号，**稳定排序**
- **溢出风险**：`(l + r) / 2` 未防溢出（与 Java/C++ 不同）
- **参数冗余**：`merge` 接收 `n`（总长度）但实际只用 `r - l + 1` 的大小，接口设计不够紧凑

### 7. Rust — 双实现（top-down 递归 + bottom-up 迭代）

来源：[TheAlgorithms/Rust `src/sorting/merge_sort.rs`](https://github.com/TheAlgorithms/Rust/blob/master/src/sorting/merge_sort.rs)（MIT）

```rust
fn merge<T: Ord + Copy>(arr: &mut [T], mid: usize) {
    let left_half = arr[..mid].to_vec();
    let right_half = arr[mid..].to_vec();
    let mut l = 0;
    let mut r = 0;
    for v in arr {
        if r == right_half.len() || (l < left_half.len() && left_half[l] < right_half[r]) {
            *v = left_half[l];
            l += 1;
        } else {
            *v = right_half[r];
            r += 1;
        }
    }
}

// top-down：递归分治
pub fn top_down_merge_sort<T: Ord + Copy>(arr: &mut [T]) {
    if arr.len() > 1 {
        let mid = arr.len() / 2;
        top_down_merge_sort(&mut arr[..mid]);
        top_down_merge_sort(&mut arr[mid..]);
        merge(arr, mid);
    }
}

// bottom-up：迭代归并（七仓库中唯一）
pub fn bottom_up_merge_sort<T: Copy + Ord>(a: &mut [T]) {
    if a.len() > 1 {
        let len: usize = a.len();
        let mut sub_array_size: usize = 1;
        while sub_array_size < len {
            let mut start_index: usize = 0;
            while len - start_index > sub_array_size {
                let end_idx: usize = if start_index + 2 * sub_array_size > len {
                    len
                } else {
                    start_index + 2 * sub_array_size
                };
                merge(&mut a[start_index..end_idx], sub_array_size);
                start_index = end_idx;
            }
            sub_array_size *= 2;
        }
    }
}
```

**特征**：

- **唯一双实现**：同时提供 `top_down_merge_sort`（递归）和 `bottom_up_merge_sort`（迭代），是七仓库中唯一覆盖两种范式的
- **泛型最强**：`<T: Ord + Copy>` trait bound，支持任意可比较且可复制的类型
- **slice 语义**：`&mut arr[..mid]` / `&mut arr[mid..]` 零拷贝分割，编译期保证越界安全
- **to_vec() 分配**：`arr[..mid].to_vec()` 每次创建临时向量，安全但每次分配
- **bottom-up 优势**：无递归栈开销，适合极大数组（避免栈溢出）；`sub_array_size` 倍增归并
- **不稳定**：`left_half[l] < right_half[r]` 严格小于，**非稳定排序**
- **完整测试套件**：含 `basic`、`basic_string`、`empty`、`one_element`、`pre_sorted`、`reverse_sorted` 六组测试（top_down + bottom_up 各一套）

## 跨语言对比矩阵

| 维度 | Python | JavaScript | TypeScript | Java | C++ | C | Rust |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **范式** | 函数式非原地 | 函数式非原地 | 函数式非原地 | 命令式原地 | 命令式原地 | 命令式原地 | 命令式原地 |
| **临时存储** | 切片新列表 | slice 新数组 | 预分配 Array | tempArray 实例字段 | std::vector L/R | malloc 全数组 | to_vec() 临时向量 |
| **临时分配次数** | 每次递归 2 次 | 每次递归 2 次 | 每次递归 2 次 | **1 次（全复用）** | 每次 merge 2 次 | 每次 merge 1 次 | 每次 merge 2 次 |
| **泛型支持** | 动态类型 | 动态类型 | 仅 number | `Comparable<T>` | 仅 int | 仅 int | `Ord + Copy` |
| **递归/迭代** | 递归 | 递归 | 递归 | 递归 | 递归 | 递归 | **两者都有** |
| **稳定性** | ✅ 稳定 | ❌ 不稳定 | ❌ 不稳定 | ✅ 稳定 | ✅ 稳定 | ✅ 稳定 | ❌ 不稳定 |
| **溢出防护** | N/A | N/A | N/A | `>>> 1` | `l+(r-l)/2` | ❌ 无 | N/A（usize） |
| **性能陷阱** | ⚠️ `pop(0)` O(n²) | 无 | 无 | 无 | 无 | 无 | 无 |
| **内存安全** | GC | GC | GC | GC | RAII | ⚠️ 手动 free | 借用检查 |
| **测试覆盖** | doctest | 无 | 无 | 无 | 无 | 无 | ✅ 6 组 × 2 |
| **代码行数** | ~20 | ~25 | ~30 | ~35 | ~30 | ~40 | ~50（双实现） |

## 选型决策矩阵

| 场景 | 推荐语言实现 | 理由 |
| --- | --- | --- |
| **教学/可读性优先** | Python | 切片语法最接近教科书定义，但注意 `pop(0)` 陷阱 |
| **Web 前端轻量排序** | JavaScript | 函数式风格契合 JS 生态，`concat` 收尾简洁 |
| **TypeScript 项目** | TypeScript | 预分配 + 类型注解，比 JS 版更安全 |
| **JVM 企业级排序** | Java | `tempArray` 复用策略最高效，泛型 `Comparable` 适用广 |
| **C++ 性能敏感场景** | C++ | `std::vector` RAII 安全，但建议补充模板泛型 |
| **嵌入式/裸机环境** | C | 唯一可选，但需注意 malloc 失败处理与 free 泄漏风险 |
| **超大数据集（栈敏感）** | Rust bottom_up | 无递归栈溢出风险，trait bound 保证类型安全 |
| **需要稳定排序** | Python / Java / C++ / C | 严格 `<=` 保证相等元素相对顺序 |
| **需要完整测试保障** | Rust | 唯一含 12 组单元测试的实现 |

## 关键洞察

### 1. 临时存储策略是最大工程差异

七种实现展示了四种临时存储管理策略，性能与安全权衡明显：

- **实例字段复用**（Java）：`tempArray` 在 `sort()` 入口一次分配，全递归复用。**最高效**，但引入实例状态（非线程安全）
- **RAII 自动释放**（C++ `std::vector` / Rust `to_vec()`）：每次 merge 分配，析构自动释放。**安全但频繁分配**
- **手动 malloc/free**（C）：每次 merge 分配，手动释放。**最危险**，`free` 前若 `exit` 会泄漏
- **切片创建新数组**（Python/JS/TS）：函数式风格天然安全，但空间开销最大

### 2. Python 的 `pop(0)` 是教科书级陷阱

`list.pop(0)` 在 CPython 中是 O(n) 操作（需移动后续所有元素）。当 merge 两边各 n/2 个元素时，总共调用 n 次 `pop(0)`，导致 merge 阶段从理想的 O(n) 退化为 O(n²)，整体复杂度从 O(n log n) 退化为 O(n²)。

**修复方式**：改用索引访问（如 JS 版的 `i++`），或使用 `collections.deque` 的 `popleft()`（O(1)）。

### 3. Rust 的 bottom-up 是唯一迭代实现

bottom-up 归并排序从大小为 1 的子数组开始，逐步倍增 `sub_array_size`（1 → 2 → 4 → 8...）进行归并。优势：

- **无递归栈**：适合极大数组（如 10⁹ 元素），避免栈溢出
- **缓存友好**：顺序归并比递归的随机访问更利于 CPU 缓存
- **复杂度相同**：仍为 O(n log n)，但常数因子可能更优

### 4. 稳定性差异源于比较运算符

`<=`（含等号）取左侧 → **稳定排序**（Python / Java / C++ / C）
`<`（严格小于）取右侧 → **不稳定排序**（JavaScript / TypeScript / Rust）

归并排序**天然可以做到稳定**，不稳定是实现选择而非算法本质。JS/TS/Rust 版本若需稳定，将 `<` 改为 `<=` 即可。

### 5. Java 的无符号右移是细节但重要

`(left + right) >>> 1` 与 `(left + right) / 2` 的区别：

- `>>> 1`：无符号右移，始终是非负数（即使 `left + right` 溢出为负）
- `/ 2`：有符号除法，溢出后结果为负数，导致 `mid` 计算错误

C++ 用 `l + (r - l) / 2` 规避溢出（减法不溢出），C 版本未做任何防护。

## 相关页面

- [[wiki/coding/quick-sort-impl-patterns]] — 同系列：快速排序跨语言对比（同为 DEF-010 模式）
- [[wiki/coding/binary-search-impl-patterns]] — 同系列：二分搜索跨语言对比（迭代/递归/bisect/泛型）
- [[wiki/coding/thealgorithms-python]] — Python 仓库入口页（含 merge_sort.py 路径）
- [[wiki/coding/thealgorithms-java]] — Java 仓库入口页
- [[wiki/coding/thealgorithms-c-plus-plus]] — C++ 仓库入口页
- [[wiki/coding/thealgorithms-javascript]] — JavaScript 仓库入口页
- [[wiki/coding/thealgorithms-c]] — C 仓库入口页
- [[wiki/coding/thealgorithms-rust]] — Rust 仓库入口页（含 top_down + bottom_up 双实现索引）
- [[wiki/coding/thealgorithms-typescript]] — TypeScript 仓库入口页
