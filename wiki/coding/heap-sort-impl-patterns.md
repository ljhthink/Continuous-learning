---
title: "堆排序跨语言实现模式对比"
domain: [coding]
type: concept
status: active
date: 2026-07-25
tags: [algorithm, sorting, heapsort, python, java, cpp, c, rust, typescript, cross-language, binary-heap, heapify]
related: [[wiki/coding/thealgorithms-python]], [[wiki/coding/thealgorithms-java]], [[wiki/coding/thealgorithms-c-plus-plus]], [[wiki/coding/thealgorithms-c]], [[wiki/coding/thealgorithms-rust]], [[wiki/coding/thealgorithms-typescript]], [[wiki/coding/quick-sort-impl-patterns]], [[wiki/coding/merge-sort-impl-patterns]], [[wiki/coding/binary-search-impl-patterns]]
---

## 概念

堆排序的核心差异不在算法骨架（都是"建堆 → 反复取出堆顶"），而在三个工程选择：**建堆策略**、**堆化方向**、**索引基础**。理解这三个维度的组合，就能解释为什么同一个"堆排序"在不同语言/库中的性能常数、代码简洁度、甚至正确性风险都不同。

本页基于 TheAlgorithms 六个仓库的**真实代码**进行对比（C 仓库有两个实现），不是教科书伪代码改写。

七个实现分为三大阵营：

- **标准自底向下建堆 + 递归 sift-down**（Python / C++ / TypeScript / Rust）：教科书式实现，建堆 O(n)，代码最易读
- **1-based 索引 + 迭代 sift-down**（Java / C v1）：用 1-based 简化父子关系计算，迭代避免递归栈开销
- **sift-up 建堆 + sift-down 排序**（C v2）：唯一用 sift-up 建堆的实现，建堆 O(n log n)，教学对比价值极高

**特别值得注意**：C 仓库的 `heap_sort_2.c` 是七种实现中唯一使用 **sift-up 建堆** 的，建堆复杂度从 O(n) 退化为 O(n log n)，但代码结构最清晰展示"堆是如何建立的"。Rust 仓库是唯一支持 **升序/降序切换** 的实现。C++ 版本从 `n-1` 开始建堆（而非标准的 `n/2-1`），多出了对叶子节点的无效调用。

## 七种实现对比

### 1. Python — 标准 sift-down 递归（教学风格）

来源：[TheAlgorithms/Python `sorts/heap_sort.py`](https://github.com/TheAlgorithms/Python/blob/master/sorts/heap_sort.py)（MIT）

```python
def heapify(unsorted: list[int], index: int, heap_size: int) -> None:
    largest = index
    left_index = 2 * index + 1
    right_index = 2 * index + 2
    if left_index < heap_size and unsorted[left_index] > unsorted[largest]:
        largest = left_index
    if right_index < heap_size and unsorted[right_index] > unsorted[largest]:
        largest = right_index
    if largest != index:
        unsorted[largest], unsorted[index] = (unsorted[index], unsorted[largest])
        heapify(unsorted, largest, heap_size)

def heap_sort(unsorted: list[int]) -> list[int]:
    n = len(unsorted)
    for i in range(n // 2 - 1, -1, -1):
        heapify(unsorted, i, n)
    for i in range(n - 1, 0, -1):
        unsorted[0], unsorted[i] = unsorted[i], unsorted[0]
        heapify(unsorted, 0, i)
    return unsorted
```

**特征**：

- **建堆策略**：自底向上 sift-down，从 `n // 2 - 1`（最后一个非叶子节点）到 0，标准 O(n) 建堆
- **堆化方向**：递归 sift-down（`largest != index` 时递归调用 `heapify`）
- **索引基础**：0-based（`2 * index + 1` / `2 * index + 2`）
- **原地排序**：直接在输入列表上交换，空间 O(1)（不含递归栈）
- **泛型**：无（`list[int]` 类型注解，但运行时不强制）
- **稳定性**：不稳定（`>` 严格大于，相等元素不交换，但 swap 可能跨越相等元素）

### 2. Java — 1-based 索引 + 迭代 sift-down

来源：[TheAlgorithms/Java `src/main/java/com/thealgorithms/sorts/HeapSort.java`](https://github.com/TheAlgorithms/Java/blob/master/src/main/java/com/thealgorithms/sorts/HeapSort.java)（MIT）

```java
public class HeapSort implements SortAlgorithm {
    @Override
    public <T extends Comparable<T>> T[] sort(T[] array) {
        int n = array.length;
        heapify(array, n);
        while (n > 1) {
            SortUtils.swap(array, 0, n - 1);
            n--;
            siftDown(array, 1, n);
        }
        return array;
    }

    private <T extends Comparable<T>> void heapify(final T[] array, final int n) {
        for (int k = n / 2; k >= 1; k--) {
            siftDown(array, k, n);
        }
    }

    private <T extends Comparable<T>> void siftDown(final T[] array, int k, final int n) {
        while (2 * k <= n) {
            int j = 2 * k;
            if (j < n && SortUtils.less(array[j - 1], array[j])) {
                j++;
            }
            if (!SortUtils.less(array[k - 1], array[j - 1])) {
                break;
            }
            SortUtils.swap(array, k - 1, j - 1);
            k = j;
        }
    }
}
```

**特征**：

- **建堆策略**：自底向上 sift-down，从 `n / 2` 到 1
- **堆化方向**：**迭代 sift-down**（`while (2 * k <= n)`），避免递归栈开销
- **索引基础**：**1-based**（注释明确："considering the heap root index as 1 instead of 0"），访问数组时需 `-1` 偏移（`array[k - 1]`）
- **1-based 设计权衡**：父子关系简化为 `2*k` 和 `2*k+1`，但每次数组访问都要 `-1`，是可读性 vs 计算效率的权衡
- **泛型**：`<T extends Comparable<T>>` 支持任意可比较类型
- **工具函数**：使用 `SortUtils.less()` 和 `SortUtils.swap()`，与 Java 仓库其他排序算法统一

### 3. C++ — 模板泛型 + 递归 sift-down（建堆起点非标准）

来源：[TheAlgorithms/C-Plus-Plus `sorting/heap_sort.cpp`](https://github.com/TheAlgorithms/C-Plus-Plus/blob/master/sorting/heap_sort.cpp)（MIT）

```cpp
template <typename T>
void heapify(T *arr, int n, int i) {
    int largest = i;
    int l = 2 * i + 1;
    int r = 2 * i + 2;
    if (l < n && arr[l] > arr[largest])
        largest = l;
    if (r < n && arr[r] > arr[largest])
        largest = r;
    if (largest != i) {
        std::swap(arr[i], arr[largest]);
        heapify(arr, n, largest);
    }
}

template <typename T>
void heapSort(T *arr, int n) {
    for (int i = n - 1; i >= 0; i--) heapify(arr, n, i);
    for (int i = n - 1; i >= 0; i--) {
        std::swap(arr[0], arr[i]);
        heapify(arr, i, 0);
    }
}
```

**特征**：

- **建堆策略**：⚠️ **从 `n - 1` 到 0**（而非标准的 `n/2 - 1` 到 0），多出了对叶子节点的 `heapify` 调用
- **多余调用分析**：叶子节点没有子节点，`heapify` 在 `largest == i` 时立即返回，是 no-op。结果正确，但多了约 n/2 次无效函数调用
- **堆化方向**：递归 sift-down
- **索引基础**：0-based
- **泛型**：`template <typename T>` 支持任意类型（int、double 等均可用）
- **指针参数**：`T *arr` 原始指针，C 风格数组操作

### 4. Rust — 升序/降序切换 + Ordering 比较器

来源：[TheAlgorithms/Rust `src/sorting/heap_sort.rs`](https://github.com/TheAlgorithms/Rust/blob/master/src/sorting/heap_sort.rs)（MIT）

```rust
fn build_heap<T: Ord>(arr: &mut [T], is_max_heap: bool) {
    let mut i = (arr.len() - 1) / 2;
    while i > 0 {
        heapify(arr, i, is_max_heap);
        i -= 1;
    }
    heapify(arr, 0, is_max_heap);
}

fn heapify<T: Ord>(arr: &mut [T], i: usize, is_max_heap: bool) {
    let comparator: fn(&T, &T) -> Ordering = if is_max_heap {
        |a, b| a.cmp(b)
    } else {
        |a, b| b.cmp(a)
    };
    let mut idx = i;
    let l = 2 * i + 1;
    let r = 2 * i + 2;
    if l < arr.len() && comparator(&arr[l], &arr[idx]) == Ordering::Greater {
        idx = l;
    }
    if r < arr.len() && comparator(&arr[r], &arr[idx]) == Ordering::Greater {
        idx = r;
    }
    if idx != i {
        arr.swap(i, idx);
        heapify(arr, idx, is_max_heap);
    }
}

pub fn heap_sort<T: Ord>(arr: &mut [T], ascending: bool) {
    if arr.len() <= 1 {
        return;
    }
    build_heap(arr, ascending);
    let mut end = arr.len() - 1;
    while end > 0 {
        arr.swap(0, end);
        heapify(&mut arr[..end], 0, ascending);
        end -= 1;
    }
}
```

**特征**：

- **建堆策略**：自底向上 sift-down，从 `(len - 1) / 2` 到 0
- **堆化方向**：递归 sift-down
- **索引基础**：0-based
- **泛型**：`T: Ord` 支持任意可排序类型
- **独特特性**：**支持升序/降序切换**（`ascending` 参数 → `is_max_heap` → `comparator` 函数指针切换），是七种实现中唯一支持双向排序的
- **切片限定堆范围**：`heapify(&mut arr[..end], 0, ascending)` 用切片代替 `heap_size` 参数，更 Rust 风格
- **原子交换**：`arr.swap(i, idx)` 是安全的原地交换
- **测试覆盖**：9 个测试用例（空数组、单元素、已排序、逆序、重复元素、字符串等）

### 5. TypeScript — 最简洁实现（含注释 bug）

来源：[TheAlgorithms/TypeScript `sorts/heap_sort.ts`](https://github.com/TheAlgorithms/TypeScript/blob/master/sorts/heap_sort.ts)（MIT）

```typescript
export const HeapSort = (arr: number[]): number[] => {
  buildMaxHeap(arr)
  for (let i = arr.length - 1; i > 0; i--) {
    swap(arr, 0, i)
    heapify(arr, 0, i)
  }
  return arr
}

function buildMaxHeap(arr: number[]): void {
  const n = arr.length
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    heapify(arr, i, n)
  }
}

function heapify(arr: number[], index: number, size: number): void {
  let largest = index
  const left = 2 * index + 1
  const right = 2 * index + 2
  if (left < size && arr[left] > arr[largest]) {
    largest = left
  }
  if (right < size && arr[right] > arr[largest]) {
    largest = right
  }
  if (largest !== index) {
    swap(arr, index, largest)
    heapify(arr, largest, size)
  }
}
```

**特征**：

- **建堆策略**：自底向上 sift-down，从 `Math.floor(n / 2) - 1` 到 0
- **堆化方向**：递归 sift-down
- **索引基础**：0-based
- **泛型**：无（`number[]` 专用）
- **代码风格**：函数式（`export const`），最简洁的实现
- **⚠️ 注释 bug**：JSDoc 中 `@example MergeSort([7, 3, 5, 1, 4, 2])` 误写为 `MergeSort`，应为 `HeapSort`（复制粘贴错误）

### 6. C (版本 1) — 1-based 索引 + 迭代 sift-down + temp 暂存

来源：[TheAlgorithms/C `sorting/heap_sort.c`](https://github.com/TheAlgorithms/C/blob/master/sorting/heap_sort.c)（GPLv3）

```c
void max_heapify(int *a, int i, int n) {
    int j, temp;
    temp = a[i];
    j = 2 * i;
    while (j <= n) {
        if (j < n && a[j + 1] > a[j])
            j = j + 1;
        if (temp > a[j]) {
            break;
        } else if (temp <= a[j]) {
            a[j / 2] = a[j];
            j = 2 * j;
        }
    }
    a[j / 2] = temp;
}

void heapsort(int *a, int n) {
    int i, temp;
    for (i = n; i >= 2; i--) {
        temp = a[i];
        a[i] = a[1];
        a[1] = temp;
        max_heapify(a, 1, i - 1);
    }
}

void build_maxheap(int *a, int n) {
    int i;
    for (i = n / 2; i >= 1; i--) {
        max_heapify(a, i, n);
    }
}
```

**特征**：

- **建堆策略**：自底向上 sift-down，从 `n / 2` 到 1
- **堆化方向**：**迭代 sift-down**（`while (j <= n)`），避免递归
- **索引基础**：**1-based**（`a[1]` 到 `a[n]`，`a[0]` 未使用）
- **temp 暂存技巧**：`temp = a[i]` 暂存根节点，逐层下移子节点，最后 `a[j/2] = temp` 落位，减少交换次数（从 3 次赋值降为 1 次）
- **泛型**：无（`int` 专用）
- **License**：**GPLv3**（与其他 MIT 仓库不同，引用需注意 copyleft 约束）

### 7. C (版本 2) — sift-up 建堆 + sift-down 排序（混合策略）

来源：[TheAlgorithms/C `sorting/heap_sort_2.c`](https://github.com/TheAlgorithms/C/blob/master/sorting/heap_sort_2.c)（GPLv3）

```c
void heapifyDown(int8_t *arr, const uint8_t size) {
    uint8_t i = 0;
    while (2 * i + 1 < size) {
        uint8_t maxChild = 2 * i + 1;
        if (2 * i + 2 < size && arr[2 * i + 2] > arr[maxChild]) {
            maxChild = 2 * i + 2;
        }
        if (arr[maxChild] > arr[i]) {
            swap(&arr[i], &arr[maxChild]);
            i = maxChild;
        } else {
            break;
        }
    }
}

void heapifyUp(int8_t *arr, uint8_t i) {
    while (i > 0 && arr[(i - 1) / 2] < arr[i]) {
        swap(&arr[(i - 1) / 2], &arr[i]);
        i = (i - 1) / 2;
    }
}

void heapSort(int8_t *arr, const uint8_t size) {
    if (size <= 1) return;
    for (uint8_t i = 0; i < size; i++) {
        heapifyUp(arr, i);
    }
    for (uint8_t i = size - 1; i >= 1; i--) {
        swap(&arr[0], &arr[i]);
        heapifyDown(arr, i);
    }
}
```

**特征**：

- **建堆策略**：⚠️ **sift-up（自顶向上）**——从 `i = 0` 到 `size - 1`，逐个将元素"插入"堆中并上浮，建堆复杂度 **O(n log n)** 而非标准的 O(n)
- **堆化方向**：**混合策略**——建堆用 `heapifyUp`（sift-up），排序阶段用 `heapifyDown`（sift-down）
- **索引基础**：0-based
- **泛型**：无（`int8_t` 专用，范围 -128 到 127）
- **教学价值**：唯一展示 sift-up 建堆的实现，对比标准 sift-down 建堆可直观理解两种策略的复杂度差异
- **License**：**GPLv3**

## 跨语言对比矩阵

| 语言 | 建堆策略 | 建堆复杂度 | 堆化方向 | 索引基础 | 泛型 | 稳定性 | 独特特性 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Python | sift-down 自底向上 | O(n) | 递归 | 0-based | ❌ | ❌ 不稳定 | doctest 示例 |
| Java | sift-down 自底向上 | O(n) | 迭代 | 1-based | ✅ `<T extends Comparable<T>>` | ❌ 不稳定 | 1-based 简化计算 |
| C++ | sift-down 从 n-1 开始 | O(n)（多无效调用） | 递归 | 0-based | ✅ `template<typename T>` | ❌ 不稳定 | 建堆起点非标准 |
| Rust | sift-down 自底向上 | O(n) | 递归 | 0-based | ✅ `T: Ord` | ❌ 不稳定 | 升序/降序切换 |
| TypeScript | sift-down 自底向上 | O(n) | 递归 | 0-based | ❌ | ❌ 不稳定 | 注释 bug（MergeSort） |
| C (v1) | sift-down 自底向上 | O(n) | 迭代 | 1-based | ❌ | ❌ 不稳定 | temp 暂存技巧 |
| C (v2) | **sift-up 自顶向上** | **O(n log n)** | 混合 | 0-based | ❌ | ❌ 不稳定 | 混合策略教学对比 |

> 💡 **稳定性说明**：堆排序的 swap 操作可能跨越远距离（如 `a[0]` 与 `a[n-1]` 直接交换），破坏相等元素的相对顺序，因此 7 种实现**全部为不稳定排序**。若需稳定排序，应选择归并排序或 TimSort（见 [[wiki/coding/merge-sort-impl-patterns]]）。

## 选型决策矩阵

| 场景 | 推荐实现 | 理由 |
| --- | --- | --- |
| 教学演示（标准实现） | Python | 代码最清晰，建堆起点标准，doctest 可验证 |
| 教学演示（对比建堆策略） | C v2 | 唯一 sift-up 建堆，对比理解 O(n) vs O(n log n) |
| 生产环境（泛型需求） | Java 或 Rust | Java 泛型 + 迭代避免栈溢出；Rust 泛型 + 升序降序切换 |
| 生产环境（性能优先） | Java | 迭代 sift-down + 1-based 简化计算，常数因子最优 |
| 需要降序排序 | Rust | 唯一原生支持升序/降序切换的实现 |
| 嵌入式 / 无递归栈环境 | Java 或 C v1 | 迭代 heapify，避免递归栈溢出风险 |
| 学习 1-based 索引设计 | Java 或 C v1 | 两种 1-based 实现，对比 0-based 理解索引设计权衡 |
| 快速原型 | TypeScript | 代码最简洁，函数式风格易于集成 |

## 关键洞察

### 1. 建堆策略是性能分水岭

标准 sift-down 自底向上建堆复杂度为 **O(n)**，而 sift-up 自顶向上建堆复杂度为 **O(n log n)**。C v2 是唯一使用 sift-up 的实现，虽然整体排序复杂度仍为 O(n log n)（排序阶段主导），但建堆阶段的常数因子差异在 n 较大时显著。

**证明 sift-down 建堆为 O(n)**：设堆高度为 h = log n。第 k 层有 n/2^(k+1) 个节点，每个节点 sift-down 最多移动 k 步。总工作量为 Σ(k=0 to h) (n/2^(k+1)) × k = (n/2) Σ(k=0 to h) k/2^k = O(n)（因为 Σ k/2^k 收敛于常数）。

### 2. 1-based 索引是历史遗产

Java 和 C v1 使用 1-based 索引（根节点在索引 1），源于堆排序的早期学术文献。优点是父子关系简化为 `2*k` 和 `2*k+1`（无需 +1/-1 偏移）；缺点是访问数组时需要 `-1` 偏移（Java: `array[k-1]`），且 `a[0]` 被浪费（C v1）。现代实现（Python、C++、Rust、TypeScript）均采用 0-based，这是工业标准。

### 3. 迭代 vs 递归是工程权衡

Java 和 C v1 使用迭代 sift-down（while 循环），其余 5 种使用递归。迭代版本避免递归栈开销（空间严格 O(1)），在极端情况下（如 n 极大导致栈溢出）更安全；递归版本代码更简洁，但栈深度为 O(log n)。对于教学目的，递归更易理解；对于生产环境，迭代更稳健。

### 4. C++ 版本的建堆起点是非标准的

C++ 版本从 `n - 1` 到 0 建堆（`for (int i = n - 1; i >= 0; i--) heapify(arr, n, i)`），而非标准的从 `n/2 - 1` 到 0。对叶子节点（索引 > n/2 - 1）调用 heapify 是 no-op（没有子节点，`largest == i` 立即返回），所以结果正确，但多了约 n/2 次无效函数调用。这是 C++ 版本的实现瑕疵，非标准做法。

### 5. Rust 的升序/降序切换设计

Rust 通过 `is_max_heap` 布尔参数切换比较器函数指针：

- `ascending = true` → `is_max_heap = true` → 建最大堆 → 排序后升序
- `ascending = false` → `is_max_heap = false` → 建最小堆 → 排序后降序

这是七种实现中唯一的双向排序设计，通过函数指针避免了代码重复，体现了 Rust 的抽象能力。其他实现若需降序，需手动反转结果或修改比较运算符。

## 工业实现对比

TheAlgorithms 是教学实现，工业级排序有本质区别：

| 语言 | 工业实现 | 算法 | 与教学版差异 |
| --- | --- | --- | --- |
| C++ | `std::sort_heap` + `std::make_heap` | 标准库堆操作 | `make_heap` 使用更优化的 sift-down，支持自定义比较器；`sort_heap` 是稳定的"反复 pop_heap" |
| Java | `PriorityQueue` | 二叉堆数据结构 | 不是排序算法而是优先队列；基于数组实现，自动扩容；`Collections.sort()` 实际用 Timsort |
| Python | `heapq` 模块 | 最小堆 + 装饰器模式 | `heapq.heapify()` 是 O(n) 原地建堆；`heapq.nsmallest()` 用堆实现；排序用 Timsort |
| Rust | `BinaryHeap` | 最大堆数据结构 | 标准库提供堆数据结构而非排序算法；`BinaryHeap` 默认最大堆 |

**关键洞察**：工业实现都将"堆"封装为**数据结构**（PriorityQueue / BinaryHeap / heapq），而非直接提供排序函数。堆排序只是堆数据结构的一个应用。工业排序通常不用纯堆排序（常数因子大于快排），但堆是优先队列、Top-K、Dijkstra 等场景的核心数据结构。

## 何时选择堆排序

| 场景 | 是否推荐堆排序 | 理由 |
| --- | --- | --- |
| 通用排序 | ❌ 不推荐 | 常数因子大于快排/归并，且不稳定 |
| 需要 O(n log n) 最坏保证 | ✅ 推荐 | 堆排序最坏仍为 O(n log n)，优于快排的 O(n²) |
| 内存受限（O(1) 空间） | ✅ 推荐 | 原地排序，空间 O(1)，优于归并的 O(n) |
| 需要 Top-K 元素 | ✅ 推荐（用堆数据结构） | 维护大小为 K 的堆，O(n log K) |
| 优先队列场景 | ✅ 推荐（用堆数据结构） | 二叉堆是优先队列的标准实现 |
| 需要稳定排序 | ❌ 不推荐 | 堆排序本质不稳定，改用归并或 Timsort |
| 流式数据排序 | ✅ 推荐（用堆数据结构） | 堆支持动态插入 + 取最值 |

## 相关页面

- [[wiki/coding/quick-sort-impl-patterns]] — 同系列：快速排序跨语言对比（4 种分区策略）
- [[wiki/coding/merge-sort-impl-patterns]] — 同系列：归并排序跨语言对比（7 语言）
- [[wiki/coding/binary-search-impl-patterns]] — 同系列：二分搜索跨语言对比（5 种实现）
- [[wiki/coding/thealgorithms-python]] — 本仓库 Python 实现（MIT）
- [[wiki/coding/thealgorithms-java]] — 本仓库 Java 实现（MIT）
- [[wiki/coding/thealgorithms-c-plus-plus]] — 本仓库 C++ 实现（MIT）
- [[wiki/coding/thealgorithms-c]] — 本仓库 C 实现（GPLv3）
- [[wiki/coding/thealgorithms-rust]] — 本仓库 Rust 实现（MIT）
- [[wiki/coding/thealgorithms-typescript]] — 本仓库 TypeScript 实现（MIT）
