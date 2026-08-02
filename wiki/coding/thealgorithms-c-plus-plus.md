---
title: TheAlgorithms/C-Plus-Plus — C++17 算法教育实现合集
domain: [coding]
type: entity
status: active
date: 2026-07-24
tags: [cpp, cpp17, algorithm, open-source, learning, thealgorithms]
related: [wiki/coding/thealgorithms-c, wiki/coding/thealgorithms-java]
use_count: 2
---



## 简介

[TheAlgorithms/C-Plus-Plus](https://github.com/TheAlgorithms/C-Plus-Plus) 是 TheAlgorithms 组织用 C++ 实现的算法教育仓库，严格遵循 **C++17 标准**，仅使用 STL（Standard Template Library），**不依赖任何外部库**。这一约束让算法本身成为绝对主角，学习者无需与构建系统搏斗即可深入研究算法本质。

C++ 版与 Python 版的关键差异：**C++ 版提供「同目标多实现」对比**——同一问题（如排序）会用不同算法策略（分治、堆、计数）实现，便于横向对比时间/空间复杂度与适用场景。

## 核心特点

- **零外部依赖**：仅用 STL，编译即跑，无需 vcpkg/Conan 包管理
- **C++17 严格标准**：保证可移植性，甚至能在 ESP32、ARM Cortex 等嵌入式平台运行
- **跨平台 CI**：每次提交在 Windows（MSVC 19 2022）、MacOS（AppleClang 15.0.15）、Ubuntu（GNU 13.3.0）三平台编译测试
- **Doxygen 文档自动生成**：在线文档 <https://TheAlgorithms.github.io/C-Plus-Plus> 含源码片段、执行流程图、STL 函数交叉引用
- **自检机制**：每个程序内置 self-check，验证实现正确性
- **多重 CI 防线**：CodeQL（安全扫描）+ Doxygen CI + Awesome CI Workflow
- **模块化设计**：函数可直接复用到其他应用

## 算法分类覆盖

按 README 与目录组织，覆盖：

- 计算机科学经典：排序、搜索、动态规划、贪心、回溯、分治
- 数学与统计：素数、GCD、模逆、组合数、数值方法
- 数据科学 / 机器学习基础：从零实现的回归、聚类
- 工程：信号处理、控制论相关算法
- 加解密：经典与现代密码学
- 数据结构：树（AVL、红黑、B-tree、Segment Tree）、堆、图、并查集

## 使用建议

- **嵌入式学习首选**：C++17 标准 + 零依赖，可移植到 ESP32/ARM 学习嵌入式算法
- **Doxygen 阅读法**：先看在线文档的执行流程图，再读源码，效率更高
- **多实现对比**：选定主题，横向对比仓库内不同实现（如 quick_sort vs merge_sort vs heap_sort），观察 STL 用法差异
- **竞赛训练**：C++ 是 ICPC/IOI 主流语言，仓库覆盖竞赛常考算法
- **避免误区**：仍是教育实现，不如 `std::sort`（introsort）等工业实现

## 元数据

| 项 | 值 |
| --- | --- |
| 仓库 | <https://github.com/TheAlgorithms/C-Plus-Plus> |
| 默认分支 | master |
| License | MIT（以仓库根 LICENSE 文件为准） |
| 标准 | C++17 |
| 依赖 | 仅 STL |
| 平台 | Windows / MacOS / Ubuntu |
| CI | CodeQL + Doxygen CI + Awesome CI Workflow |
| 在线文档 | <https://TheAlgorithms.github.io/C-Plus-Plus> |
| 在线开发 | Gitpod 一键启动 |
| 算法清单 | DIRECTORY.md |
| 社区 | Discord、Gitter、Liberapay |

## 算法目录索引

> 数据来源：[TheAlgorithms/C-Plus-Plus DIRECTORY.md](https://github.com/TheAlgorithms/C-Plus-Plus/blob/master/DIRECTORY.md)
> 提取时间：2026-07-25
> License：MIT

### 一级分类总览

| 一级分类 | 二级分类数 | 算法文件数 |
| --- | --- | --- |
| Backtracking | 0 | 13 |
| Bit Manipulation | 0 | 10 |
| Ciphers | 0 | 11 |
| CPU Scheduling | 0 | 2 |
| Data Structures | 1 | 42 |
| Divide And Conquer | 0 | 2 |
| Dynamic Programming | 0 | 32 |
| Games | 0 | 1 |
| Geometry | 0 | 4 |
| Graphs | 0 | 21 |
| Graphics | 0 | 1 |
| Greedy Algorithms | 0 | 10 |
| Hashing | 0 | 7 |
| Machine Learning | 0 | 8 |
| Math | 0 | 60 |
| Numerical Methods | 0 | 23 |
| Operations On Data Structures | 0 | 12 |
| Others | 0 | 27 |
| Physics | 0 | 1 |
| Probability | 0 | 7 |
| Range Queries | 0 | 7 |
| Search | 0 | 16 |
| Sorting | 0 | 43 |
| Strings | 0 | 8 |
| 合计 | 24 个一级分类 | 368 个算法文件 |

### 详细分类（代表性算法）

#### 经典算法领域

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Sorting | 43 | Bead Sort、Binary Insertion Sort、Bitonic Sort、Bogo Sort、Bubble Sort、Bucket Sort、Cocktail Selection Sort、Comb Sort、Count Inversions、Counting Sort |
| Search | 16 | Binary Search、Exponential Search、Fibonacci Search、Floyd Cycle Detection Algo、Hash Search、Interpolation Search、Interpolation Search2、Jump Search、Linear Search、Longest Increasing Subsequence Using Binary Search |
| Strings | 8 | Boyer Moore、Brute Force String Searching、Duval、Horspool、Knuth Morris Pratt、Manacher Algorithm、Rabin Karp、Z Function |
| Graphs | 21 | Bidirectional Dijkstra、Breadth First Search、Bridge Finding With Tarjan Algorithm、Connected Components、Connected Components With Dsu、Cycle Check Directed Graph、Depth First Search、Depth First Search With Stack、Dijkstra、Hamiltons Cycle |
| Dynamic Programming | 32 | 0 1 Knapsack、Abbreviation、Armstrong Number Templated、Bellman Ford、Catalan Numbers、Coin Change、Coin Change Topdown、Cut Rod、Edit Distance、Egg Dropping Puzzle |
| Backtracking | 13 | Generate Parentheses、Graph Coloring、Knight Tour、Magic Sequence、Minimax、N Queens、N Queens All Solution Optimised、Nqueen Print All Solutions、Rat Maze、Subarray Sum |
| Divide And Conquer | 2 | Karatsuba Algorithm For Fast Multiplication、Strassen Matrix Multiplication |
| Greedy Algorithms | 10 | Binary Addition、Boruvkas Minimum Spanning Tree、Digit Separation、Dijkstra Greedy、Gale Shapley、Huffman、Jump Game、Knapsack、Kruskals Minimum Spanning Tree、Prims Minimum Spanning Tree |
| Bit Manipulation | 10 | Count Bits Flip、Count Of Set Bits、Count Of Trailing Ciphers In Factorial N、Find Non Repeating Number、Gray Code、Hamming Distance、Next Higher Number With Same Number Of Set Bits、Power Of 2、Set Kth Bit、Travelling Salesman Using Bit Manipulation |

#### 数据结构

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Data Structures | 42 | Avltree、Binary Search Tree、Binary Search Tree2、Binaryheap、Bloom Filter、Circular Queue Using Linked List、Cll、Cll、Main Cll、Disjoint Set |
| Operations On Data Structures | 12 | Array Left Rotation、Array Right Rotation、Circular Linked List、Circular Queue Using Array、Get Size Of Linked List、Inorder Successor Of Bst、Intersection Of Two Arrays、Reverse A Linked List Using Recusion、Reverse Binary Tree、Selectionsortlinkedlist |
| Range Queries | 7 | Fenwick Tree、Heavy Light Decomposition、Mo、Persistent Seg Tree Lazy Prop、Prefix Sum Array、Segtree、Sparse Table Range Queries |
| Hashing | 7 | Chaining、Double Hash Hash Table、Linear Probing Hash Table、Md5、Quadratic Probing Hash Table、Sha1、Sha256 |

#### 数学与科学计算

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Math | 60 | Aliquot Sum、Approximate Pi、Area、Armstrong Number、Binary Exponent、Binomial Calculate、Check Amicable Pair、Check Factorial、Check Prime、Complex Numbers |
| Numerical Methods | 23 | Babylonian Method、Bisection Method、Brent Method Extrema、Composite Simpson Rule、Durand Kerner Roots、False Position、Fast Fourier Transform、Gaussian Elimination、Golden Search Extrema、Gram Schmidt |
| Geometry | 4 | Graham Scan Algorithm、Graham Scan Functions、Jarvis Algorithm、Line Segment Intersection |
| Probability | 7 | Addition Rule、Bayes Theorem、Binomial Dist、Exponential Dist、Geometric Dist、Poisson Dist、Windowed Median |
| Physics | 1 | Ground To Ground Projectile Motion |

#### 加解密与安全

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Ciphers | 11 | A1Z26 Cipher、Atbash Cipher、Base64 Encoding、Caesar Cipher、Elliptic Curve Key Exchange、Hill Cipher、Morse Code、Uint128 T、Uint256 T、Vigenere Cipher |

#### 机器学习与人工智能

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Machine Learning | 8 | A Star Search、Adaline Learning、K Nearest Neighbors、Kohonen Som Topology、Kohonen Som Trace、Neural Network、Ordinary Least Squares Regressor、Vector Ops |

#### 应用领域

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| CPU Scheduling | 2 | Fcfs Scheduling、Non Preemptive Sjf Scheduling |
| Games | 1 | Memory Game |
| Graphics | 1 | Spirograph |
| Others | 27 | Buzz Number、Decimal To Binary、Decimal To Hexadecimal、Decimal To Roman Numeral、Easter、Fast Integer Input、Happy Number、Iterative Tree Traversals、Kadanes3、Kelvin To Celsius |

> 使用提示：需要具体算法实现时，可通过 GitHub MCP `get_file_contents` 实时获取 `TheAlgorithms/C-Plus-Plus/<category>/<file>` 文件内容。

## 相关页面

- [[wiki/coding/quick-sort-impl-patterns]] — 快速排序跨语言实现对比（含本仓库 C++ Lomuto + 3-way Dutch National Flag 实现）
- [[wiki/coding/merge-sort-impl-patterns]] — 归并排序跨语言实现对比（含本仓库 C++ std::vector 临时数组实现）
- [[wiki/coding/heap-sort-impl-patterns]] — 堆排序跨语言实现模式对比（含本仓库 C++ 模板泛型实现，建堆起点非标准）
- [[wiki/coding/graph-traversal-bfs-dfs-impl-patterns]] — 图遍历 BFS/DFS 跨语言实现模式对比（含本仓库 C++ BFS 泛型 + DFS 3-coloring 三色标记实现）
- [[wiki/coding/thealgorithms-c]] — 同体系 C 版本（C11 + GPLv3），对比 C/C++ 实现差异
- [[wiki/coding/thealgorithms-java]] — 同体系 Java 版本
- [[wiki/coding/thealgorithms-rust]] — 同体系 Rust 版本，对比内存安全模型
- [[wiki/coding/thealgorithms-python]] — 同体系 Python 版本，对比动态/静态类型实现差异

## 同领域算法仓库

- [[wiki/coding/thealgorithms-python]] — Python 算法教育实现合集
- [[wiki/coding/thealgorithms-java]] — Java 算法教育实现合集
- [[wiki/coding/thealgorithms-c]] — C 算法教育实现合集
- [[wiki/coding/thealgorithms-javascript]] — JavaScript 算法教育实现合集
- [[wiki/coding/thealgorithms-go]] — Go 算法教育实现合集
- [[wiki/coding/thealgorithms-rust]] — Rust 算法教育实现合集
- [[wiki/coding/thealgorithms-typescript]] — TypeScript 算法教育实现合集
