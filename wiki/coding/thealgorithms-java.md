---
title: "TheAlgorithms/Java — Java 算法教育实现合集"
domain: [coding]
type: entity
status: active
date: 2026-07-24
tags: [java, algorithm, open-source, learning, thealgorithms]
related: [[wiki/coding/thealgorithms-python]], [[wiki/coding/thealgorithms-c-plus-plus]]
---

## 简介

[TheAlgorithms/Java](https://github.com/TheAlgorithms/Java) 是 TheAlgorithms 组织用 Java 实现的算法与数据结构教育仓库。README 简洁直白："All algorithms are implemented in Java (for educational purposes)"，与 Python 版定位一致：**学习为先，效率其次**。

Java 版特别适合结合 OOP 思想与泛型理解算法：仓库大量使用泛型容器、接口抽象与经典设计模式（策略、迭代器、访问者），是观察「算法如何在静态类型语言中以工程化方式组织」的样本。

## 核心特点

- **面向对象范式**：算法以类与接口组织，可观察 Strategy 模式（多种排序策略）、Iterator 模式（树遍历）、Factory 模式等
- **泛型广泛使用**：使用 `Comparable<T>`、`List<T>` 等泛型容器，类型安全且复用性强
- **DIRECTORY.md 全量索引**：所有算法清单可一键查阅
- **Gitpod 一键运行**：浏览器内运行调试，无需安装 JDK
- **CI + Codecov**：`build.yml` 守护编译与测试，覆盖率可视化
- **Discord 社区**：与各语言仓库共享 TheAlgorithms Discord 频道

## 算法分类覆盖

典型主题（基于 DIRECTORY.md 分组）：

- 排序：快排、归并、堆、桶、基数排序等
- 搜索：二分、插值、跳表、BFS/DFS
- 动态规划与回溯
- 字符串匹配（KMP、Z-algorithm、Rabin-Karp）
- 图算法（Dijkstra、Prim、Kruskal、拓扑排序）
- 数学与数论
- 数据结构：树（AVL、红黑、B-tree）、堆、图、并查集、Trie
- 加解密：AES、DES、RSA、Hill 密码

## 使用建议

- **OOP 切入点**：相比 Python 版的脚本式实现，Java 版的类设计更能训练抽象思维
- **泛型训练**：研究 `<T extends Comparable<T>>` 这类约束如何在算法中复用
- **测试驱动样本**：每个算法通常配 JUnit 测试，是学习测试用例设计的范本
- **面试准备**：Java 是大厂面试高频语言，仓库覆盖 LeetCode 类题型
- **避免误区**：性能仍弱于 `java.util.Arrays.sort`（其用 Dual-Pivot Quicksort + Timsort 混合），仅供学习

## 元数据

| 项 | 值 |
| --- | --- |
| 仓库 | <https://github.com/TheAlgorithms/Java> |
| 默认分支 | master |
| License | MIT（以仓库根 LICENSE 文件为准） |
| CI | GitHub Actions `build.yml` |
| 覆盖率 | Codecov |
| 在线开发 | Gitpod 一键启动 |
| 算法清单 | DIRECTORY.md |
| 社区 | Discord |

## 算法目录索引

> 数据来源：[TheAlgorithms/Java DIRECTORY.md](https://github.com/TheAlgorithms/Java/blob/master/DIRECTORY.md)
> 提取时间：2026-07-25
> License：MIT

### 一级分类总览

| 一级分类 | 二级分类数 | 算法文件数 |
| --- | --- | --- |
| Audio Filters | 0 | 4 |
| Backtracking | 0 | 36 |
| Bit Manipulation | 0 | 70 |
| Ciphers | 1 | 57 |
| Compression | 0 | 16 |
| Conversions | 0 | 68 |
| Data Structures | 15 | 260 |
| Dev Utils | 3 | 9 |
| Divide And Conquer | 0 | 14 |
| Dynamic Programming | 0 | 107 |
| Geometry | 0 | 20 |
| Graphs | 0 | 34 |
| Greedy Algorithms | 0 | 30 |
| IO | 0 | 2 |
| Line Clipping | 1 | 6 |
| Maths | 1 | 253 |
| Matrix | 2 | 24 |
| Misc | 0 | 25 |
| Others | 0 | 64 |
| Physics | 0 | 20 |
| Puzzles And Games | 0 | 4 |
| Randomized | 0 | 12 |
| Recursion | 0 | 10 |
| Scheduling | 1 | 48 |
| Searches | 0 | 63 |
| Sliding Window | 0 | 14 |
| Sorts | 0 | 99 |
| Stacks | 0 | 47 |
| Strings | 1 | 71 |
| Tree | 0 | 2 |
| 合计 | 30 个一级分类 | 1489 个算法文件 |

### 详细分类（代表性算法）

#### 经典算法领域

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Sorts | 99 | AdaptiveMergeSort、BeadSort、BinaryInsertionSort、BitonicSort、BogoSort、BubbleSort、BubbleSortRecursive、BucketSort、CircleSort、CocktailShakerSort |
| Searches | 63 | BM25InvertedIndex、BinarySearch、BinarySearch2dArray、BoyerMoore、BreadthFirstSearch、DepthFirstSearch、ExponentialSearch、FibonacciSearch、HowManyTimesRotated、InterpolationSearch |
| Strings | 71 | AhoCorasick、Alphabetical、AlternativeStringArrange、Anagrams、CharactersSame、CheckVowels、CountChar、CountWords、HammingDistance、HorspoolSearch |
| Graphs | 34 | BronKerbosch、ConstrainedShortestPath、Dinic、Edmonds、EdmondsKarp、GomoryHuTree、HierholzerAlgorithm、HierholzerEulerianPath、HopcroftKarp、HungarianAlgorithm |
| Dynamic Programming | 107 | Abbreviation、AllConstruct、AssignmentUsingBitmask、BoardPath、BoundaryFill、BruteForceKnapsack、CatalanNumber、ClimbingStairs、CoinChange、CountFriendsPairing |
| Backtracking | 36 | AllPathsFromSourceToTarget、ArrayCombination、Combination、CombinationSum、CrosswordSolver、FloodFill、KnightsTour、MColoring、MazeRecursion、NQueens |
| Divide And Conquer | 14 | BinaryExponentiation、ClosestPair、CountingInversions、MedianOfTwoSortedArrays、SkylineAlgorithm、StrassenMatrixMultiplication、TilingProblem |
| Greedy Algorithms | 30 | ActivitySelection、BandwidthAllocation、BinaryAddition、CoinChange、DigitSeparation、EgyptianFraction、FractionalKnapsack、GaleShapley、JobSequencing、KCenters |
| Bit Manipulation | 70 | BcdConversion、BinaryPalindromeCheck、BitRotate、BitSwap、BitwiseGCD、BooleanAlgebraGates、ClearLeftmostSetBit、CountBitsFlip、CountLeadingZeros、CountSetBits |
| Randomized | 12 | KargerMinCut、MonteCarloIntegration、RandomizedClosestPair、RandomizedMatrixMultiplicationVerification、RandomizedQuickSort、ReservoirSampling |
| Sliding Window | 14 | LongestSubarrayWithSumLessOrEqualToK、LongestSubstringWithoutRepeatingCharacters、MaxSumKSizeSubarray、MaximumSlidingWindow、MinSumKSizeSubarray、MinimumWindowSubstring、ShortestCoprimeSegment |
| Recursion | 10 | DiceThrower、FactorialRecursion、FibonacciSeries、GenerateSubsets、SylvesterSequence |

#### 数据结构

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Data Structures | 260 | Node、Bag、BloomFilter、CircularBuffer、FIFOCache、LFUCache、LIFOCache、LRUCache、MRUCache、RRCache |
| Stacks | 47 | BalancedBrackets、CelebrityFinder、DecimalToAnyUsingStack、DuplicateBrackets、GreatestElementConstantTime、InfixToPostfix、InfixToPrefix、LargestRectangle、MaximumMinimumWindow、MinStackUsingSingleStack |
| Tree | 2 | HeavyLightDecomposition |

#### 数学与科学计算

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Maths | 253 | ADTFraction、AbsoluteMax、AbsoluteMin、AbsoluteValue、AbundantNumber、AliquotSum、AmicableNumber、Area、Armstrong、AutoCorrelation |
| Matrix | 24 | InverseOfMatrix、LUDecomposition、MatrixMultiplication、MatrixRank、MatrixTranspose、MedianOfMatrix、MirrorOfMatrix、PrintAMatrixInSpiralOrder、RotateMatrixBy90Degrees、SolveSystem |
| Physics | 20 | CoulombsLaw、DampedOscillator、ElasticCollision2D、Gravitation、GroundToGroundProjectileMotion、Kinematics、ProjectileMotion、SimplePendulumRK4、SnellLaw、ThinLens |
| Geometry | 20 | BentleyOttmann、BresenhamLine、ConvexHull、DDALine、GrahamScan、Haversine、MidpointCircle、MidpointEllipse、Point、WusLine |

#### 加解密与安全

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Ciphers | 57 | ADFGVXCipher、AES、AESEncryption、AffineCipher、AtbashCipher、Autokey、BaconianCipher、Blowfish、Caesar、ColumnarTranspositionCipher |

#### 应用领域

| 一级分类 | 算法文件数 | 代表性算法 |
| --- | --- | --- |
| Scheduling | 48 | AgingScheduling、EDFScheduling、FCFSScheduling、FairShareScheduling、GangScheduling、HighestResponseRatioNextScheduling、JobSchedulingWithDeadline、LotteryScheduling、MLFQScheduler、MultiAgentScheduling |
| Conversions | 68 | AffineConverter、AnyBaseToAnyBase、AnyBaseToDecimal、AnytoAny、Base64、BinaryToDecimal、BinaryToHexadecimal、BinaryToOctal、CoordinateConverter、DecimalToAnyBase |
| Compression | 16 | ArithmeticCoding、BurrowsWheelerTransform、LZ77、LZ78、LZW、MoveToFront、RunLengthEncoding、ShannonFano |
| Audio Filters | 4 | EMAFilter、IIRFilter |
| Others | 64 | ArrayLeftRotation、ArrayRightRotation、BFPRT、BankersAlgorithm、BoyerMoore、BrianKernighanAlgorithm、CRC16、CRC32、CRCAlgorithm、Conway |
| Puzzles And Games | 4 | TowerOfHanoi、WordBoggle |
| Line Clipping | 6 | CohenSutherland、LiangBarsky、Line、Point |
| Misc | 25 | ColorContrastRatio、MapReduce、MedianOfRunningArray、MedianOfRunningArrayByte、MedianOfRunningArrayDouble、MedianOfRunningArrayFloat、MedianOfRunningArrayInteger、MedianOfRunningArrayLong、PalindromePrime、PalindromeSinglyLinkedList |
| IO | 2 | BufferedReader |
| Dev Utils | 9 | ProcessDetails、LargeTreeNode、Node、SimpleNode、SimpleTreeNode、TreeNode、MatrixSearchAlgorithm、SearchAlgorithm |

> 使用提示：需要具体算法实现时，可通过 GitHub MCP `get_file_contents` 实时获取 `TheAlgorithms/Java/src/main/java/com/thealgorithms/<category>/<file>` 文件内容。

## 相关页面

- [[wiki/coding/quick-sort-impl-patterns]] — 快速排序跨语言实现对比（含本仓库 Java Hoare 分区实现）
- [[wiki/coding/binary-search-impl-patterns]] — 二分搜索跨语言实现对比（含本仓库 Java 递归泛型实现）
- [[wiki/coding/thealgorithms-python]] — 同体系 Python 版本，对比动态/静态类型实现差异
- [[wiki/coding/thealgorithms-c-plus-plus]] — 同体系 C++ 版本
- [[wiki/coding/thealgorithms-go]] — 同体系 Go 版本
