---
title: 快速排序跨语言实现模式对比
domain: [coding]
type: concept
status: active
date: 2026-07-24
tags: [algorithm, sorting, quicksort, python, java, cpp, cross-language, partition]
related: [wiki/coding/thealgorithms-python, wiki/coding/thealgorithms-java, wiki/coding/thealgorithms-c-plus-plus, wiki/coding/binary-search-impl-patterns]
use_count: 3
---


## 概念

快速排序的核心差异不在算法本身（都是分治 + 递归），而在三个工程选择：**分区策略**、**枢轴选择**、**是否原地**。理解这四个变量的组合，就能解释为什么同一个"快速排序"在不同语言/库中的表现差异巨大。

本页基于 TheAlgorithms 三个仓库的**真实代码**进行对比，不是教科书伪代码改写。

## 四种实现对比

### 1. Python — 函数式非原地（2-way，随机枢轴）

来源：[TheAlgorithms/Python `sorts/quick_sort.py`](https://github.com/TheAlgorithms/Python/blob/master/sorts/quick_sort.py)（MIT）

```python
from random import randrange

def quick_sort(collection: list) -> list:
    if len(collection) < 2:
        return collection

    pivot_index = randrange(len(collection))
    pivot = collection.pop(pivot_index)

    lesser = [item for item in collection if item <= pivot]
    greater = [item for item in collection if item > pivot]

    return [*quick_sort(lesser), pivot, *quick_sort(greater)]
```

**特征**：

- **非原地**：每次递归创建 `lesser` 和 `greater` 两个新列表，空间 O(n)（不含递归栈）
- **函数式风格**：输入不变，返回新列表，无副作用
- **随机枢轴**：`randrange` 随机选择，避免有序输入的最坏情况
- **2-way 分区**：`<= pivot` 归左，`> pivot` 归右，等于枢轴的元素统一在左侧
- **可读性最高**，但性能最差（大量列表分配 + 拷贝）

### 2. Java — Hoare 原地分区（2-way，随机枢轴）

来源：[TheAlgorithms/Java `QuickSort.java`](https://github.com/TheAlgorithms/Java/blob/master/src/main/java/com/thealgorithms/sorts/QuickSort.java)（MIT）

```java
class QuickSort implements SortAlgorithm {
    @Override
    public <T extends Comparable<T>> T[] sort(T[] array) {
        doSort(array, 0, array.length - 1);
        return array;
    }

    private static <T extends Comparable<T>> void doSort(T[] array, final int left, final int right) {
        if (left < right) {
            final int pivot = randomPartition(array, left, right);
            doSort(array, left, pivot - 1);
            doSort(array, pivot, right);
        }
    }

    private static <T extends Comparable<T>> int randomPartition(T[] array, final int left, final int right) {
        final int randomIndex = left + (int) (Math.random() * (right - left + 1));
        SortUtils.swap(array, randomIndex, right);
        return partition(array, left, right);
    }

    private static <T extends Comparable<T>> int partition(T[] array, int left, int right) {
        final int mid = (left + right) >>> 1;
        final T pivot = array[mid];
        while (left <= right) {
            while (SortUtils.less(array[left], pivot)) ++left;
            while (SortUtils.less(pivot, array[right])) --right;
            if (left <= right) {
                SortUtils.swap(array, left, right);
                ++left;
                --right;
            }
        }
        return left;
    }
}
```

**特征**：

- **原地排序**：直接在数组上交换，空间 O(log n)（仅递归栈）
- **Hoare 分区**：双指针从两端向中间扫描，相遇时分区完成
- **随机枢轴**：随机选择后交换到 `right` 位置，再用中间元素作为比较基准
- **泛型**：`<T extends Comparable<T>>` 支持任意可比较类型
- **注意**：递归调用 `doSort(array, left, pivot - 1)` 和 `doSort(array, pivot, right)`——Hoare 分区返回的 `pivot` 不保证枢轴元素已在最终位置，所以右侧从 `pivot` 而非 `pivot + 1` 开始

### 3. C++ — Lomuto 原地分区（2-way，末位枢轴）

来源：[TheAlgorithms/C-Plus-Plus `sorting/quick_sort.cpp`](https://github.com/TheAlgorithms/C-Plus-Plus/blob/master/sorting/quick_sort.cpp)（MIT）

```cpp
template <typename T>
int partition(std::vector<T> *arr, const int &low, const int &high) {
    T pivot = (*arr)[high];  // 取最后一个元素作为枢轴
    int i = (low - 1);       // 小于枢轴的元素的边界

    for (int j = low; j < high; j++) {
        if ((*arr)[j] <= pivot) {
            i++;
            std::swap((*arr)[i], (*arr)[j]);
        }
    }
    std::swap((*arr)[i + 1], (*arr)[high]);
    return (i + 1);
}

template <typename T>
void quick_sort(std::vector<T> *arr, const int &low, const int &high) {
    if (low < high) {
        int p = partition(arr, low, high);
        quick_sort(arr, low, p - 1);
        quick_sort(arr, p + 1, high);
    }
}
```

**特征**：

- **原地排序**：通过 `std::swap` 就地交换
- **Lomuto 分区**：单指针 `j` 扫描，`i` 维护"小于枢轴"的右边界，代码最简洁
- **末位枢轴**：取 `arr[high]` 作为枢轴，无随机化——**有序输入会退化为 O(n²)**
- **模板泛型**：`template <typename T>` 支持任意类型
- **递归不对称**：`quick_sort(arr, low, p - 1)` 和 `quick_sort(arr, p + 1, high)`——Lomuto 分区保证枢轴在最终位置

### 4. C++ — Dutch National Flag 3-way 分区

来源：[TheAlgorithms/C-Plus-Plus `sorting/quick_sort_3.cpp`](https://github.com/TheAlgorithms/C-Plus-Plus/blob/master/sorting/quick_sort_3.cpp)（MIT）

```cpp
template <typename T>
void partition3(std::vector<T> *arr, int32_t low, int32_t high, int32_t *i, int32_t *j) {
    if (high - low <= 1) {
        if ((*arr)[high] < (*arr)[low])
            std::swap((*arr)[high], (*arr)[low]);
        *i = low;
        *j = high;
        return;
    }

    int32_t mid = low;
    T pivot = (*arr)[high];
    while (mid <= high) {
        if ((*arr)[mid] < pivot) {
            std::swap((*arr)[low++], (*arr)[mid++]);
        } else if ((*arr)[mid] == pivot) {
            mid++;
        } else {
            std::swap((*arr)[mid], (*arr)[high--]);
        }
    }
    *i = low - 1;
    *j = mid;
}

template <typename T>
void quicksort(std::vector<T> *arr, int32_t low, int32_t high) {
    if (low >= high) return;
    int32_t i = 0, j = 0;
    partition3(arr, low, high, &i, &j);
    quicksort(arr, low, i);
    quicksort(arr, j, high);
}
```

**特征**：

- **3-way 分区**：将数组分为 `< pivot`、`= pivot`、`> pivot` 三段（荷兰国旗问题）
- **重复元素优化**：所有等于枢轴的元素一次到位，后续递归不再处理——**大量重复元素时从 O(n²) 降为 O(n)**
- **双返回值**：通过指针参数 `i` 和 `j` 返回两个分区边界
- **末位枢轴**：取 `arr[high]` 作为枢轴

## 分区策略对比表

| 策略 | 实现 | 扫描方式 | 重复元素处理 | 额外空间 | 交换次数 | 代码复杂度 |
| --- | --- | --- | --- | --- | --- | --- |
| 函数式 | Python | 列表推导 | `<=` 归左，不区分 | O(n) | 0（无交换，新建列表） | 最低 |
| Hoare | Java | 双向对进 | 等于枢轴参与交换，最终散布两侧 | O(log n) | 最少（双指针各停一次） | 中等 |
| Lomuto | C++ | 单向 | `<=` 归左，枢轴落位 | O(log n) | 最多（每次比较可能交换） | 低 |
| 3-way | C++ | 三向 | 等于枢轴单独成区，不再递归 | O(log n) | 中等 | 最高 |

## 枢轴选择策略

| 策略 | 实现 | 优势 | 风险 |
| --- | --- | --- | --- |
| 随机 | Python、Java | 概率上避免最坏情况 | 伪随机数开销 |
| 末位元素 | C++（两个版本） | 代码最简 | 有序输入退化为 O(n²) |
| 中间元素 | Java（partition 内部） | 对部分有序数据稍好 | 仍可能被构造攻击 |
| 三数取中 | 未在 TheAlgorithms 中实现 | 工业常用，近似最优 | 额外比较开销 |
| median-of-medians | 未在 TheAlgorithms 中实现 | 最坏 O(n log n) 保证 | 实践中常数因子过大 |

## 复杂度分析

| 维度 | 2-way（随机枢轴） | 3-way（重复元素多时） | 2-way（末位枢轴，有序输入） |
| --- | --- | --- | --- |
| 时间最优 | O(n log n) | O(n) | O(n²) |
| 时间平均 | O(n log n) | O(n log n) | O(n²) |
| 时间最坏 | O(n²) | O(n²) | O(n²) |
| 空间（原地） | O(log n) | O(log n) | O(n)（退化为链式递归） |
| 空间（非原地） | O(n)（Python 版） | — | — |

## 工业实现对比

TheAlgorithms 是教学实现，工业级排序有本质区别：

| 语言 | 工业实现 | 算法 | 与教学版差异 |
| --- | --- | --- | --- |
| C++ | `std::sort` | **Introsort**：快排 + 堆排 + 插入排序混合 | 递归深度超 `2*log(n)` 时切堆排，避免 O(n²) |
| Java | `Arrays.sort()` | **Dual-Pivot Quicksort**：双轴快排 | 两个枢轴分三区，比 3-way 更细粒度 |
| Python | `list.sort()` | **Timsort**：归并 + 插入排序混合 | 不用快排——稳定排序需求 + 实际数据多有局部有序 |

**关键洞察**：工业实现都**不使用纯快排**。C++ 和 Java 用混合算法避免最坏情况，Python 干脆放弃快排改用 Timsort（因为 Python 排序需要稳定性，而快排不稳定）。

## 何时选择哪种变体

| 场景 | 推荐变体 | 理由 |
| --- | --- | --- |
| 教学/演示 | Python 函数式 | 可读性最高，一眼看出分治思想 |
| 通用排序 | 用 stdlib（std::sort / Arrays.sort） | 工业实现已优化，无需手写 |
| 大量重复元素 | 3-way 分区 | 重复元素一次到位，O(n) |
| 内存受限 | Hoare 或 Lomuto 原地 | O(log n) 额外空间 |
| 需要稳定性 | **不用快排**，用归并排序或 Timsort | 快排不稳定（交换改变相对顺序） |
| 面试手写 | Lomuto + 末位枢轴 | 代码最短，10 行内可写完 |

## 常见陷阱

1. **Lomuto + 末位枢轴 + 有序输入 = O(n²)**：最经典的面试坑。解法：随机化枢轴或用三数取中。
2. **Hoare 分区的递归边界**：`doSort(array, left, pivot - 1)` 和 `doSort(array, pivot, right)`——注意右侧从 `pivot` 而非 `pivot + 1` 开始，因为 Hoare 分区不保证枢轴在最终位置。写错会导致死递归或越界。
3. **整数溢出**：`mid = (left + right) / 2` 在大数组时溢出。Java 版用 `(left + right) >>> 1`（无符号右移）规避。
4. **Python 版的空间陷阱**：看似简洁的 `lesser = [item for item in collection if item <= pivot]` 每层递归分配 O(n) 新列表，总空间 O(n log n)——远超原地版的 O(log n)。

5. **Java Hoare 分区随机化效果有限**：`randomPartition` 将随机元素交换到 `right` 位置，但 `partition` 方法实际取 `array[mid]`（中间元素）作为比较基准，而非 `array[right]`。随机元素被换到 `right` 后并不直接参与比较——随机化仅通过打乱数组间接影响 `mid` 位置元素的分布。若要真正随机化枢轴，应在 `partition` 中用 `array[right]` 而非 `array[mid]`，或直接随机选择 `mid` 索引。

## 来源

> 以下代码片段遵循 MIT License，版权归 TheAlgorithms 贡献者所有。
> 完整许可证见各仓库根目录 LICENSE 文件。

- [TheAlgorithms/Python: sorts/quick_sort.py](https://github.com/TheAlgorithms/Python/blob/master/sorts/quick_sort.py)（MIT License，Copyright (c) TheAlgorithms contributors）
- [TheAlgorithms/Java: QuickSort.java](https://github.com/TheAlgorithms/Java/blob/master/src/main/java/com/thealgorithms/sorts/QuickSort.java)（MIT License，Copyright (c) TheAlgorithms contributors）
- [TheAlgorithms/C-Plus-Plus: sorting/quick_sort.cpp](https://github.com/TheAlgorithms/C-Plus-Plus/blob/master/sorting/quick_sort.cpp)（MIT License，Copyright (c) TheAlgorithms contributors）
- [TheAlgorithms/C-Plus-Plus: sorting/quick_sort_3.cpp](https://github.com/TheAlgorithms/C-Plus-Plus/blob/master/sorting/quick_sort_3.cpp)（MIT License，Copyright (c) TheAlgorithms contributors）

## 相关页面

- [[wiki/coding/thealgorithms-python]] — Python 算法实现合集（本页算法来源之一）
- [[wiki/coding/thealgorithms-java]] — Java 算法实现合集（本页算法来源之一）
- [[wiki/coding/thealgorithms-c-plus-plus]] — C++ 算法实现合集（本页算法来源之一）
- [[wiki/coding/binary-search-impl-patterns]] — 二分搜索跨语言实现对比（姊妹篇）

## 同领域算法仓库

- [[wiki/coding/thealgorithms-python]] — Python 算法教育实现合集
- [[wiki/coding/thealgorithms-java]] — Java 算法教育实现合集
- [[wiki/coding/thealgorithms-c-plus-plus]] — C++ 算法教育实现合集
- [[wiki/coding/thealgorithms-c]] — C 算法教育实现合集
- [[wiki/coding/thealgorithms-javascript]] — JavaScript 算法教育实现合集
- [[wiki/coding/thealgorithms-go]] — Go 算法教育实现合集
- [[wiki/coding/thealgorithms-rust]] — Rust 算法教育实现合集
- [[wiki/coding/thealgorithms-typescript]] — TypeScript 算法教育实现合集
