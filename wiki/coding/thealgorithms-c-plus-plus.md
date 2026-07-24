---
title: "TheAlgorithms/C-Plus-Plus — C++17 算法教育实现合集"
domain: [coding]
type: entity
status: active
date: 2026-07-24
tags: [cpp, cpp17, algorithm, open-source, learning, thealgorithms]
related: [[wiki/coding/thealgorithms-c]], [[wiki/coding/thealgorithms-java]]
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

## 相关页面

- [[wiki/coding/quick-sort-impl-patterns]] — 快速排序跨语言实现对比（含本仓库 C++ Lomuto + 3-way Dutch National Flag 实现）
- [[wiki/coding/thealgorithms-c]] — 同体系 C 版本（C11 + GPLv3），对比 C/C++ 实现差异
- [[wiki/coding/thealgorithms-java]] — 同体系 Java 版本
- [[wiki/coding/thealgorithms-rust]] — 同体系 Rust 版本，对比内存安全模型
- [[wiki/coding/thealgorithms-python]] — 同体系 Python 版本，对比动态/静态类型实现差异
