---
title: "TheAlgorithms/C — C11 算法教育实现合集（GPLv3）"
domain: [coding]
type: entity
status: active
date: 2026-07-24
tags: [c, c11, algorithm, open-source, learning, thealgorithms, gpl]
related: [[wiki/coding/thealgorithms-c-plus-plus]], [[wiki/coding/thealgorithms-rust]]
---

## 简介

[TheAlgorithms/C](https://github.com/TheAlgorithms/C) 是 TheAlgorithms 组织用 C 语言实现的算法教育仓库，严格遵循 **C11 标准**，仅使用标准 C 库 [`libc`](https://en.wikipedia.org/wiki/C_standard_library)，**不依赖任何外部库**。这与 C++ 版的「零依赖」理念一致，但 C 版更贴近底层内存与指针操作。

⚠️ **License 注意**：与多数 MIT 兄弟仓库不同，C 版采用 **GPLv3 License**。集成到商业项目时需特别注意 copyleft 传染性约束——衍生作品必须开源。学习参考无影响，但代码再分发需遵守 GPL 条款。

## 核心特点

- **零外部依赖**：仅用 libc，编译即跑，特别适合嵌入式与系统级学习
- **C11 严格标准**：保证可移植性，可在 ESP32、ARM Cortex 等嵌入式平台运行
- **跨平台 CI**：MacOS（AppleClang 14.0.0）+ Ubuntu（GNU 11.3.0）双平台编译测试
- **Doxygen 文档自动生成**：在线文档 <https://TheAlgorithms.github.io/C> 含源码片段、执行流程图、libc 函数交叉引用
- **自检机制**：每个程序内置 self-check 验证实现正确性
- **多重 CI 防线**：CodeQL（安全扫描）+ Doxygen CI + Awesome CI Workflow
- **模块化设计**：函数可直接复用

## 算法分类覆盖

按 README 与目录组织，覆盖：

- 计算机科学经典：排序、搜索、动态规划、贪心、回溯、分治
- 数学与统计：素数、GCD、模逆、组合数、数值方法
- 数据科学 / 机器学习基础：从零实现的回归、聚类
- 工程：信号处理、控制论
- 加解密：经典与现代密码学
- 数据结构：链表、树（AVL、红黑、B-tree、Segment Tree）、堆、图、并查集

## 使用建议

- **指针与内存训练**：C 版强制手动管理内存与指针，是理解底层机制的最佳训练
- **嵌入式首选**：C11 + libc 零依赖，可直接移植到 ESP32/ARM Cortex
- **Doxygen 阅读法**：先看在线文档的执行流程图，再读源码
- **系统编程基础**：与《Unix 环境高级编程》《CSAPP》结合阅读
- **⚠️ License 警告**：**禁止将 C 版代码直接合入闭源商业项目**——GPLv3 强制开源。学习参考无影响，但代码再分发必须开源
- **避免误区**：仍是教育实现，性能弱于工业库

## 元数据

| 项 | 值 |
| --- | --- |
| 仓库 | <https://github.com/TheAlgorithms/C> |
| 默认分支 | master |
| License | **GPLv3**（⚠️ 与多数 MIT 兄弟仓库不同，以仓库根 LICENSE 文件为准） |
| 标准 | C11 |
| 依赖 | 仅 libc |
| 平台 | MacOS、Ubuntu |
| CI | CodeQL + Doxygen CI + Awesome CI Workflow |
| 在线文档 | <https://TheAlgorithms.github.io/C> |
| 在线开发 | Gitpod 一键启动 |
| 算法清单 | DIRECTORY.md |
| 社区 | Discord、Gitter、Liberapay |

## 算法目录索引

> 数据来源：[TheAlgorithms/C DIRECTORY.md](https://github.com/TheAlgorithms/C/blob/master/DIRECTORY.md)
> 提取时间：2026-07-25
> License：GPLv3

### 一级分类总览

| 一级分类 | 二级分类数 | 算法文件数 |
| --- | --- | --- |
| Audio | 0 | 1 |
| Cipher | 0 | 2 |
| Client Server | 0 | 12 |
| Conversions | 0 | 21 |
| Data Structures | 12 | 64 |
| Developer Tools | 0 | 5 |
| Dynamic Programming | 0 | 2 |
| Exercism | 5 | 10 |
| Games | 0 | 3 |
| Geometry | 0 | 3 |
| Graphics | 0 | 1 |
| Greedy Approach | 0 | 2 |
| Hash | 0 | 6 |
| Machine Learning | 0 | 4 |
| Math | 0 | 23 |
| Misc | 0 | 16 |
| Numerical Methods | 0 | 19 |
| Process Scheduling | 0 | 1 |
| Project Euler | 23 | 34 |
| Searching | 1 | 14 |
| Sorting | 0 | 34 |
| 合计 | 21 个一级分类 | 277 个算法文件 |

### 详细分类（代表性算法）

#### 经典算法领域

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Sorting | 34 | Bead Sort、Binary Insertion Sort、Bogo Sort、Bubble Sort、Bubble Sort 2、Bubble Sort Recursion、Bucket Sort、Cocktail Sort、Comb Sort、Counting Sort |
| Searching | 14 | Binary Search、Exponential Search、Fibonacci Search、Floyd Cycle Detection Algorithm、Interpolation Search、Jump Search、Linear Search、Modified Binary Search、Other Binary Search、Boyer Moore Search |
| Dynamic Programming | 2 | Lcs、Matrix Chain Order |
| Greedy Approach | 2 | Dijkstra、Prim |

#### 数据结构

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Data Structures | 64 | Carray、Carray、Carray Tests、Avl Tree、Binary Search Tree、Create Node、Recursive Traversals、Red Black Tree、Segment Tree、Threaded Binary Trees |
| Hash | 6 | Hash Adler32、Hash Blake2B、Hash Crc32、Hash Djb2、Hash Sdbm、Hash Xor8 |

#### 数学与科学计算

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Math | 23 | Armstrong Number、Cantor Set、Cartesian To Polar、Catalan、Collatz、Euclidean Algorithm Extended、Factorial、Factorial Large Number、Factorial Trailing Zeroes、Fibonacci |
| Numerical Methods | 19 | Bisection Method、Durand Kerner Roots、Gauss Elimination、Gauss Seidel Method、Lagrange Theorem、Lu Decompose、Mean、Median、Newton Raphson Root、Ode Forward Euler |
| Geometry | 3 | Geometry Datatypes、Quaternions、Vectors 3D |

#### 加解密与安全

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Cipher | 2 | Affine、Rot13 |

#### 应用领域

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Client Server | 12 | Bool、Client、Fork、Remote Command Exec Udp Client、Remote Command Exec Udp Server、Server、Tcp Full Duplex Client、Tcp Full Duplex Server、Tcp Half Duplex Client、Tcp Half Duplex Server |
| Conversions | 21 | Binary To Decimal、Binary To Hexadecimal、Binary To Octal、C Atoi Str To Integer、Celsius To Fahrenheit、Decimal To Any Base、Decimal To Binary、Decimal To Binary Recursion、Decimal To Hexa、Decimal To Octal |
| Games | 3 | Hangman、Naval Battle、Tic Tac Toe |
| Audio | 1 | Alaw |
| Misc | 16 | Demonetization、Hamming Distance、Lexicographic Permutations、Longest Subsequence、Mcnaughton Yamada Thompson、Mirror、Pid、Poly Add、Postfix Evaluation、Quartile |
| Exercism | 10 | Acronym、Acronym、Hello World、Hello World、Isogram、Isogram、Rna Transcription、Rna Transcription、Word Count、Word Count |
| Project Euler | 34 | Sol1、Sol2、Sol3、Sol4、Sol1、Sol2、Sol1、Sol1、Sol1、Sol1 |
| Developer Tools | 5 | Malloc Dbg、Malloc Dbg、Min Printf、Test Malloc Dbg、Test Min Printf |
| Process Scheduling | 1 | Non Preemptive Priority Scheduling |
| Machine Learning | 4 | Adaline Learning、K Means Clustering、Kohonen Som Topology、Kohonen Som Trace |
| Graphics | 1 | Spirograph |

> 使用提示：需要具体算法实现时，可通过 GitHub MCP `get_file_contents` 实时获取 `TheAlgorithms/C/<category>/<file>` 文件内容。

## 相关页面

- [[wiki/coding/merge-sort-impl-patterns]] — 归并排序跨语言实现对比（含本仓库 C malloc/free 手动管理实现）
- [[wiki/coding/thealgorithms-c-plus-plus]] — 同体系 C++ 版本（MIT + C++17），对比 C/C++ 实现差异
- [[wiki/coding/thealgorithms-rust]] — 同体系 Rust 版本，对比内存安全模型
- [[wiki/coding/thealgorithms-go]] — 同体系 Go 版本
