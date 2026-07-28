---
title: 二分搜索跨语言实现模式对比
domain: [coding]
type: concept
status: active
date: 2026-07-24
tags: [algorithm, search, binary-search, python, java, cross-language, bisect]
related: [wiki/coding/thealgorithms-python, wiki/coding/thealgorithms-java, wiki/coding/quick-sort-impl-patterns]
use_count: 19
---


## 概念

二分搜索看似简单——"在有序数组中折半查找"，但工程实现中的差异比算法本身更值得理解。本页对比 TheAlgorithms 仓库中 Python 和 Java 的真实实现，聚焦四个工程选择：**中点计算**、**边界语义**、**迭代 vs 递归**、**返回值语义**。

## 五种实现对比

### 1. Python — 标准迭代版（返回索引或 -1）

来源：[TheAlgorithms/Python `searches/binary_search.py`](https://github.com/TheAlgorithms/Python/blob/master/searches/binary_search.py)（MIT）

```python
def binary_search(sorted_collection: list[int], item: int) -> int:
    if any(a > b for a, b in pairwise(sorted_collection)):
        raise ValueError("sorted_collection must be sorted in ascending order")
    left = 0
    right = len(sorted_collection) - 1
    while left <= right:
        midpoint = left + (right - left) // 2
        current_item = sorted_collection[midpoint]
        if current_item == item:
            return midpoint
        elif item < current_item:
            right = midpoint - 1
        else:
            left = midpoint + 1
    return -1
```

**特征**：

- **输入校验**：`pairwise` 检查数组是否升序——**教学代码特有**，工业实现不做（性能开销 O(n) 抵消二分搜索的 O(log n) 优势）
- **闭区间边界**：`left = 0, right = len - 1`，循环条件 `left <= right`（inclusive-inclusive）
- **溢出安全的中点**：`left + (right - left) // 2`——不写 `(left + right) // 2`
- **返回 -1 表示未找到**——经典语义

### 2. Python — 递归版

来源：同上文件

```python
def binary_search_by_recursion(
    sorted_collection: list[int], item: int, left: int = 0, right: int = -1
) -> int:
    if right < 0:
        right = len(sorted_collection) - 1
    if list(sorted_collection) != sorted(sorted_collection):
        raise ValueError("sorted_collection must be sorted in ascending order")
    if right < left:
        return -1
    midpoint = left + (right - left) // 2
    if sorted_collection[midpoint] == item:
        return midpoint
    elif sorted_collection[midpoint] > item:
        return binary_search_by_recursion(sorted_collection, item, left, midpoint - 1)
    else:
        return binary_search_by_recursion(sorted_collection, item, midpoint + 1, right)
```

**特征**：

- **递归终止**：`right < left` 返回 -1
- **输入校验**：`sorted(sorted_collection)` 比较——比迭代版的 `pairwise` 更慢（完整排序 O(n log n) vs 单遍扫描 O(n)）
- **空间 O(log n)**：递归调用栈

### 3. Python — bisect_left（返回插入位置）

来源：同上文件

```python
def bisect_left(
    sorted_collection: list[int], item: int, lo: int = 0, hi: int = -1
) -> int:
    if hi < 0:
        hi = len(sorted_collection)
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if sorted_collection[mid] < item:
            lo = mid + 1
        else:
            hi = mid
    return lo
```

**特征**：

- **半开区间边界**：`lo = 0, hi = len`（注意是 `len` 不是 `len - 1`），循环条件 `lo < hi`（inclusive-exclusive）
- **返回插入位置**：即使元素不存在也返回有意义的值——第一个 `>= item` 的位置
- **`<` 而非 `<=`**：`sorted_collection[mid] < item` 时右移，等于枢轴时 `hi = mid`（向左收缩）——保证找到最左匹配

### 4. Python — bisect_right（返回右插入位置）

来源：同上文件

```python
def bisect_right(
    sorted_collection: list[int], item: int, lo: int = 0, hi: int = -1
) -> int:
    if hi < 0:
        hi = len(sorted_collection)
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if sorted_collection[mid] <= item:
            lo = mid + 1
        else:
            hi = mid
    return lo
```

**特征**：

- **`<=` 而非 `<`**：唯一区别——`sorted_collection[mid] <= item` 时右移，等于枢轴时也右移——保证找到第一个 `> item` 的位置
- 与 `bisect_left` 的**唯一差异**就是比较运算符从 `<` 变为 `<=`

### 5. Java — 递归泛型版

来源：[TheAlgorithms/Java `BinarySearch.java`](https://github.com/TheAlgorithms/Java/blob/master/src/main/java/com/thealgorithms/searches/BinarySearch.java)（MIT）

```java
class BinarySearch implements SearchAlgorithm {
    @Override
    public <T extends Comparable<T>> int find(T[] array, T key) {
        if (array == null || array.length == 0) return -1;
        if (key == null) return -1;
        return search(array, key, 0, array.length - 1);
    }

    private <T extends Comparable<T>> int search(T[] array, T key, int left, int right) {
        if (right < left) return -1;
        int median = (left + right) >>> 1;  // 无符号右移，防溢出
        int comp = key.compareTo(array[median]);
        if (comp == 0) return median;
        else if (comp < 0) return search(array, key, left, median - 1);
        else return search(array, key, median + 1, right);
    }
}
```

**特征**：

- **无输入校验**：不检查数组是否有序——工业惯例，调用方负责
- **无符号右移**：`(left + right) >>> 1` 防溢出——Java 特有技巧（Python 不需要，因为整数无限精度）
- **泛型**：`<T extends Comparable<T>>` 支持任意可比较类型
- **空值防护**：`key == null` 返回 -1

## 四个工程选择对比

### 1. 中点计算（防整数溢出）

| 写法 | 语言 | 安全性 | 说明 |
| --- | --- | --- | --- |
| `left + (right - left) // 2` | Python | 安全 | 数学等价，无溢出风险 |
| `left + (right - left) // 2` | Python bisect | 安全 | 同上 |
| `(left + right) >>> 1` | Java | 安全 | 无符号右移，即使溢出也正确 |
| `(left + right) / 2` | 通用 | **危险** | 大数组时 `left + right` 溢出为负数 |

**关键洞察**：Python 整数无限精度，无需防溢出，但 TheAlgorithms 仍用 `left + (right - left) // 2`——**为了教学移植性**，让代码能直接翻译到 C/Java。

### 2. 边界语义

| 语义 | 边界 | 循环条件 | 实现 | 返回值 |
| --- | --- | --- | --- | --- |
| 闭区间 `[left, right]` | `right = len - 1` | `left <= right` | Python `binary_search`、Java | 索引或 -1 |
| 半开区间 `[lo, hi)` | `hi = len` | `lo < hi` | Python `bisect_left/right` | 插入位置 |

**关键差异**：

- 闭区间的 `right = midpoint - 1` 和 `left = midpoint + 1`——跳过 mid
- 半开区间的 `hi = mid` 和 `lo = mid + 1`——`hi` 不减 1，因为 `hi` 是 exclusive

写错边界是最常见的二分搜索 bug。**建议**：选定一种语义，在整份代码中保持一致。

### 3. 迭代 vs 递归

| 维度 | 迭代 | 递归 |
| --- | --- | --- |
| 空间 | O(1) | O(log n)（调用栈） |
| 可读性 | 循环结构 | 接近数学定义 |
| 栈溢出 | 无风险 | 深度 > 1000 时风险（Python 默认递归深度 1000） |
| 尾递归优化 | 不适用 | Java 不优化；Python 不优化；C++ 编译器可能优化 |

**实践建议**：生产代码用迭代版。递归版仅用于教学和小规模数据。

### 4. 返回值语义

| 语义 | 返回值 | 适用场景 |
| --- | --- | --- |
| 索引或 -1 | 找到返回索引，未找到返回 -1 | 查找特定元素是否存在 |
| 插入位置 | 总是返回 `[0, len]` 范围的索引 | 维护有序数组、查找范围边界 |

`bisect_left` 和 `bisect_right` 返回**插入位置**而非索引或 -1，这是更强大的语义：

- 检查存在性：`bisect_left(arr, x) != bisect_right(arr, x)` 表示 x 存在
- 查找范围：`[bisect_left(arr, x), bisect_right(arr, x))` 是所有等于 x 的元素区间
- 插入保持有序：`arr.insert(bisect_left(arr, x), x)`

## 工业实现对比

| 语言 | 工业实现 | 与教学版的差异 |
| --- | --- | --- |
| Python | `bisect` 模块（C 实现） | 同接口，但底层 C 加速；`bisect_left` / `bisect_right` 直接可用 |
| Java | `Arrays.binarySearch()` | 返回索引或 `-(insertion_point) - 1`——**混合语义** |
| C++ | `std::binary_search` / `std::lower_bound` / `std::upper_bound` | `lower_bound` 等价 bisect_left，`upper_bound` 等价 bisect_right |

**Java 的混合返回值**：`Arrays.binarySearch()` 返回找到的索引（>= 0），或 `-(insertion_point) - 1`（< 0）。这个 `-1` 是为了区分"插入位置 0"和"未找到"——如果直接返回 `-insertion_point`，插入位置 0 和找到索引 0 都返回 0，无法区分。

## 常见陷阱

1. **`(left + right) / 2` 溢出**：经典 bug。当 `left + right > INT_MAX` 时，结果为负数，导致 `ArrayIndexOutOfBoundsException`。Joshua Bloch 2006 年在 Java 标准库中发现此 bug（[Google Research Blog](https://research.google/blog/extra-extra-read-all-about-it-nearly-all-binary-searches-and-mergesorts-are-broken/)），影响 Java、C++ 等语言的标准库长达 9 年。

2. **边界写反**：闭区间用 `left < right`（少了 `=`），导致漏检最后一个元素。或半开区间用 `left <= right`，导致越界。

3. **死循环**：半开区间中 `hi = mid`（不减 1），如果同时 `lo = mid`（不减 1），当区间只剩 2 个元素时 `mid` 始终等于 `lo`，死循环。正确写法是至少一边收缩（`lo = mid + 1` 或 `hi = mid - 1`）。

4. **输入未排序**：二分搜索要求数组有序，但教学代码的 `pairwise` 校验有 O(n) 开销。工业代码不做校验——调用方负责。如果不确定是否有序，**先排序或用线性搜索**。

5. **重复元素的返回索引不确定**：标准 `binary_search` 找到任意一个等于目标的元素即返回，不保证是最左/最右。需要确定语义时用 `bisect_left` / `bisect_right`。

6. **递归版 `right = -1` 默认值陷阱**：`binary_search_by_recursion` 用 `right = -1` 作为"使用末位索引"的哨兵默认值。但递归调用 `binary_search_by_recursion(..., left, midpoint - 1)` 当 `midpoint = 0` 时传入 `right = -1`——这会触发 `if right < 0: right = len - 1` 重置为全数组长度，**导致搜索范围错误回弹到整个数组而非"未找到"**。正确做法是用 `None` 哨兵或显式传递 `len - 1`，不用 `-1`。

## 何时选择哪种变体

| 场景 | 推荐变体 | 理由 |
| --- | --- | --- |
| 查找元素是否存在 | `binary_search`（返回 -1） | 语义清晰 |
| 维护有序数组 | `bisect_left` / `bisect_right` | 返回插入位置，可直接 `insert` |
| 查找重复元素范围 | `bisect_left` + `bisect_right` | `[left, right)` 即重复元素区间 |
| 生产代码 | 用 stdlib（`bisect` / `Arrays.binarySearch` / `std::lower_bound`） | 已经过充分测试和优化 |
| 面试手写 | 迭代 + 闭区间 + `left + (right - left) // 2` | 最不易出错 |

## 来源

> 以下代码片段遵循 MIT License，版权归 TheAlgorithms 贡献者所有。
> 完整许可证见各仓库根目录 LICENSE 文件。

- [TheAlgorithms/Python: searches/binary_search.py](https://github.com/TheAlgorithms/Python/blob/master/searches/binary_search.py)（MIT License，Copyright (c) TheAlgorithms contributors）
- [TheAlgorithms/Java: BinarySearch.java](https://github.com/TheAlgorithms/Java/blob/master/src/main/java/com/thealgorithms/searches/BinarySearch.java)（MIT License，Copyright (c) TheAlgorithms contributors）

## 相关页面

- [[wiki/coding/thealgorithms-python]] — Python 算法实现合集（本页算法来源之一）
- [[wiki/coding/thealgorithms-java]] — Java 算法实现合集（本页算法来源之一）
- [[wiki/coding/quick-sort-impl-patterns]] — 快速排序跨语言实现对比（姊妹篇）

## 同领域算法仓库

- [[wiki/coding/thealgorithms-python]] — Python 算法教育实现合集
- [[wiki/coding/thealgorithms-java]] — Java 算法教育实现合集
- [[wiki/coding/thealgorithms-c-plus-plus]] — C++ 算法教育实现合集
- [[wiki/coding/thealgorithms-c]] — C 算法教育实现合集
- [[wiki/coding/thealgorithms-javascript]] — JavaScript 算法教育实现合集
- [[wiki/coding/thealgorithms-go]] — Go 算法教育实现合集
- [[wiki/coding/thealgorithms-rust]] — Rust 算法教育实现合集
- [[wiki/coding/thealgorithms-typescript]] — TypeScript 算法教育实现合集
