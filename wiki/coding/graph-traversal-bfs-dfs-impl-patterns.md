---
title: "图遍历 BFS/DFS 跨语言实现模式对比"
domain: [coding]
type: concept
status: active
date: 2026-07-25
tags: [algorithm, graph, bfs, dfs, traversal, python, java, cpp, c, rust, cross-language, queue, stack]
related: [[wiki/coding/thealgorithms-python]], [[wiki/coding/thealgorithms-java]], [[wiki/coding/thealgorithms-c-plus-plus]], [[wiki/coding/thealgorithms-c]], [[wiki/coding/thealgorithms-rust]], [[wiki/coding/quick-sort-impl-patterns]], [[wiki/coding/merge-sort-impl-patterns]], [[wiki/coding/heap-sort-impl-patterns]], [[wiki/coding/binary-search-impl-patterns]]
---

## 概念

图遍历的核心差异不在算法骨架（都是"标记访问 → 处理当前 → 推入邻居"），而在四个工程选择：**图表示法**、**数据结构**（Queue vs Stack vs VecDeque）、**遍历策略**（递归 vs 迭代）、**访问标记**（Set vs Array vs 3-coloring）。理解这四个维度的组合，就能解释为什么同一个"BFS/DFS"在不同语言中的内存占用、栈溢出风险、甚至语义（全遍历 vs 目标搜索）都不同。

本页基于 TheAlgorithms 五个仓库的**真实代码**进行对比（Python / Java / C++ / C / Rust 各一对 BFS+DFS 实现，共 10 个实现）。TypeScript 仓库无纯 BFS/DFS 实现（搜索 `breadth_first_search` / `depth_first_search` 在 TheAlgorithms/TypeScript 仓库中返回 0 结果），是六仓库中唯一缺失图遍历基础实现的，本页末尾"实现缺口"段说明。

十个实现分为三大阵营：

- **递归 DFS**（Java DFS / C DFS）：DFS 用递归调用栈，最接近教科书定义；Java 用邻接矩阵、C 用链表邻接表
- **显式栈 DFS**（Python DFS / C++ DFS / Rust DFS）：用显式 stack（list / std::stack / VecDeque）替代递归调用栈，规避栈溢出风险；图表示各异（邻接表 / 邻接表 / 边列表）
- **目标搜索语义**（Rust BFS / Rust DFS）：返回 `Option<Vec<u32>>`，找到目标返回访问历史，未找到返回 `None`；其他 8 个实现均为"全遍历"语义

**特别值得注意**：Rust 的 `VecDeque` 是 10 个实现中唯一用**同一数据结构**同时服务 BFS（`pop_front`）和 DFS（`push_front`）的，体现了"deque 既是 queue 又是 stack"的设计哲学。C++ 仓库的 DFS 实现是唯一采用 **3-coloring**（WHITE/GREY/BLACK）标记法的，借鉴 CLRS 教科书风格。

## 十种实现对比

### 1. Python BFS — Queue + 邻接表（全遍历语义）

来源：[TheAlgorithms/Python `graphs/breadth_first_search.py`](https://github.com/TheAlgorithms/Python/blob/master/graphs/breadth_first_search.py)（MIT）

```python
from queue import Queue

class Graph:
    def __init__(self) -> None:
        self.vertices: dict[int, list[int]] = {}

    def add_edge(self, from_vertex: int, to_vertex: int) -> None:
        if from_vertex in self.vertices:
            self.vertices[from_vertex].append(to_vertex)
        else:
            self.vertices[from_vertex] = [to_vertex]

    def bfs(self, start_vertex: int) -> set[int]:
        visited = set()
        queue: Queue = Queue()
        visited.add(start_vertex)
        queue.put(start_vertex)

        while not queue.empty():
            vertex = queue.get()
            for adjacent_vertex in self.vertices[vertex]:
                if adjacent_vertex not in visited:
                    queue.put(adjacent_vertex)
                    visited.add(adjacent_vertex)
        return visited
```

**特征**：

- **数据结构**：`queue.Queue`（线程安全，比 `collections.deque` 慢但有同步开销）
- **图表示**：邻接表 `dict[int, list[int]]`
- **返回值**：`set[int]`（已访问顶点集合，**无顺序信息**）
- **访问标记**：`set`，`in` 查找 O(1) 平均
- **入队时机**：访问标记与入队同步（`visited.add` + `queue.put` 同时），避免重复入队
- **泛型**：无（顶点固定为 `int`）
- **doctest 完整**：含可执行示例

### 2. Python DFS — 显式栈 + 邻接表（全遍历语义）

来源：[TheAlgorithms/Python `graphs/depth_first_search.py`](https://github.com/TheAlgorithms/Python/blob/master/graphs/depth_first_search.py)（MIT）

```python
def depth_first_search(graph: dict, start: str) -> set[str]:
    explored, stack = set(start), [start]

    while stack:
        v = stack.pop()
        explored.add(v)
        # Differences from BFS:
        # 1) pop last element instead of first one
        # 2) add adjacent elements to stack without exploring them
        for adj in reversed(graph[v]):
            if adj not in explored:
                stack.append(adj)
    return explored
```

**特征**：

- **数据结构**：`list` 作为栈（`pop()` 默认弹出末尾，O(1)）
- **图表示**：邻接表 `dict[str, list[str]]`（注意键为字符串）
- **返回值**：`set[str]`（已探索顶点集合）
- **访问标记**：`set`，但 `explored` 与 `stack` **分离初始化**（`set(start)` 与 `[start]`）
- **reversed 遍历**：`reversed(graph[v])` 控制遍历顺序，使结果与递归 DFS 一致
- **注释亮点**：明确标注与 BFS 的两点差异（pop 末尾 vs 首部、不立即标记访问）
- **非递归**：避免 Python 默认递归深度限制（`sys.getrecursionlimit()` 默认 1000）

### 3. Java BFS — Queue + 邻接矩阵（全遍历语义）

来源：[TheAlgorithms/Java `src/main/java/com/thealgorithms/datastructures/graphs/MatrixGraphs.java`](https://github.com/TheAlgorithms/Java/blob/master/src/main/java/com/thealgorithms/datastructures/graphs/MatrixGraphs.java)（MIT）

```java
public List<Integer> breadthFirstOrder(int startVertex) {
    if (startVertex >= vertexCount || startVertex < 0) {
        return new ArrayList<>();
    }
    boolean[] visited = new boolean[vertexCount];
    ArrayList<Integer> orderList = new ArrayList<>();
    Queue<Integer> queue = new LinkedList<>();
    queue.add(startVertex);

    while (!queue.isEmpty()) {
        int currentVertex = queue.poll();
        if (visited[currentVertex]) {
            continue;  // 延迟过滤：已访问则跳过
        }
        orderList.add(currentVertex);
        visited[currentVertex] = true;

        int[] adjacent = adjMatrix[currentVertex];
        for (int vertex = 0; vertex < adjacent.length; vertex++) {
            if (adjacent[vertex] == AdjacencyMatrixGraph.EDGE_EXIST) {
                queue.add(vertex);  // 未检查 visited，可能重复入队
            }
        }
    }
    return orderList;
}
```

**特征**：

- **数据结构**：`LinkedList` 作为 `Queue`（`poll()` 弹出队首）
- **图表示**：**邻接矩阵** `int[][]`（O(V²) 空间，但 O(1) 边查询）
- **返回值**：`List<Integer>`（**有序遍历序列**，与 Python 的 `set` 不同）
- **访问标记**：`boolean[]` 数组，O(1) 查找
- **延迟过滤（lazy deletion）**：入队时不检查 `visited`，出队时才检查 — **可能导致队列中存在重复元素**，但简化代码逻辑
- **泛型**：无（`int` 专用）
- **边界处理**：`startVertex` 越界返回空列表

### 4. Java DFS — 递归 + 邻接矩阵（全遍历语义）

来源：[TheAlgorithms/Java `src/main/java/com/thealgorithms/datastructures/graphs/MatrixGraphs.java`](https://github.com/TheAlgorithms/Java/blob/master/src/main/java/com/thealgorithms/datastructures/graphs/MatrixGraphs.java)（MIT）

```java
public List<Integer> depthFirstOrder(int startVertex) {
    if (startVertex >= vertexCount || startVertex < 0) {
        return new ArrayList<>();
    }
    boolean[] visited = new boolean[vertexCount];
    ArrayList<Integer> orderList = new ArrayList<>();
    depthFirstOrder(startVertex, visited, orderList);
    return orderList;
}

private void depthFirstOrder(int currentVertex, boolean[] visited, List<Integer> orderList) {
    if (visited[currentVertex]) {
        return;
    }
    visited[currentVertex] = true;
    orderList.add(currentVertex);

    int[] adjacent = adjMatrix[currentVertex];
    for (int i = 0; i < adjacent.length; i++) {
        if (adjacent[i] == AdjacencyMatrixGraph.EDGE_EXIST) {
            depthFirstOrder(i, visited, orderList);  // 递归
        }
    }
}
```

**特征**：

- **遍历策略**：**递归**（方法重载：public 入口 + private 递归 helper）
- **图表示**：邻接矩阵 `int[][]`
- **返回值**：`List<Integer>`（有序遍历序列）
- **访问标记**：`boolean[]` 数组
- **方法重载模式**：public 方法做参数校验与初始化，private 方法做递归 — 教科书级 API 设计
- **栈溢出风险**：深度为 V 的图可能触发 `StackOverflowError`（Java 默认栈大小约 512KB）

### 5. C++ BFS — std::queue + 邻接表（泛型 + 全遍历）

来源：[TheAlgorithms/C-Plus-Plus `graph/breadth_first_search.cpp`](https://github.com/TheAlgorithms/C-Plus-Plus/blob/master/graph/breadth_first_search.cpp)（MIT）

```cpp
template <typename T>
class Graph {
    std::map<T, std::list<T>> adjacency_list;

 public:
    void add_edge(T u, T v, bool bidir = true) {
        adjacency_list[u].push_back(v);  // u-->v edge added
        if (bidir == true) {
            adjacency_list[v].push_back(u);  // v-->u edge added
        }
    }

    std::map<T, bool> breadth_first_search(T src) {
        std::map<T, bool> visited;
        for (auto const &adjlist : adjacency_list) {
            visited[adjlist.first] = false;
            for (auto const &node : adjacency_list[adjlist.first]) {
                visited[node] = false;
            }
        }

        std::queue<T> tracker;
        tracker.push(src);
        visited[src] = true;
        while (!tracker.empty()) {
            T node = tracker.front();
            tracker.pop();
            for (T const &neighbour : adjacency_list[node]) {
                if (!visited[neighbour]) {
                    tracker.push(neighbour);
                    visited[neighbour] = true;
                }
            }
        }
        return visited;
    }
};
```

**特征**：

- **数据结构**：`std::queue<T>`（适配器，默认基于 `std::deque`）
- **图表示**：`std::map<T, std::list<T>>`（有序邻接表，O(log V) 查找）
- **返回值**：`std::map<T, bool>`（顶点 → 是否访问过的映射）
- **泛型**：`template <typename T>` — **10 个实现中泛型支持最完整**（可用于任意可比较类型）
- **双向图支持**：`add_edge(u, v, bidir=true)` 默认双向
- **预初始化 visited**：遍历所有顶点预先设为 `false`，再开始 BFS — 冗余但安全
- **测试覆盖**：含 3 组测试（int + std::string）

### 6. C++ DFS — std::stack + 3-coloring（显式栈 + 三色标记）

来源：[TheAlgorithms/C-Plus-Plus `graph/depth_first_search_with_stack.cpp`](https://github.com/TheAlgorithms/C-Plus-Plus/blob/master/graph/depth_first_search_with_stack.cpp)（MIT）

```cpp
constexpr int WHITE = 0;  // 未探索
constexpr int GREY = 1;   // 在栈中待探索
constexpr int BLACK = 2;  // 已探索完成

std::vector<size_t> dfs(const std::vector<std::vector<size_t>> &graph, size_t start) {
    std::vector<size_t> checked(graph.size(), WHITE), traversed_path;
    checked[start] = GREY;
    std::stack<size_t> stack;
    stack.push(start);

    while (!stack.empty()) {
        int act = stack.top();
        stack.pop();

        if (checked[act] == GREY) {
            traversed_path.push_back(act + 1);  // 输出时 +1（1-based 展示）

            for (auto it : graph[act]) {
                stack.push(it);
                if (checked[it] != BLACK) {
                    checked[it] = GREY;
                }
            }
            checked[act] = BLACK;
        }
    }
    return traversed_path;
}
```

**特征**：

- **数据结构**：`std::stack<size_t>`（适配器，默认基于 `std::deque`）
- **图表示**：`std::vector<std::vector<size_t>>`（无序邻接表，O(1) 索引）
- **返回值**：`std::vector<size_t>`（**有序遍历路径**，含 1-based 转换）
- **3-coloring 标记法**：WHITE（未访问）/ GREY（在栈中）/ BLACK（已完成）— **10 个实现中唯一采用三色标记**，借鉴 CLRS《算法导论》风格，区分"已发现"与"已完成"
- **1-based 输入 / 0-based 内部**：`addEdge` 接收 1-based，内部 `u - 1` 转 0-based — 接口语义与实现分离
- **GREY 判定**：`if (checked[act] == GREY)` 弹出后才处理，避免重复处理（同一节点可能多次入栈）
- **测试覆盖**：含 3 组测试

### 7. C BFS — 自定义队列 + 链表邻接表（手动内存管理）

来源：[TheAlgorithms/C `data_structures/graphs/bfs.c`](https://github.com/TheAlgorithms/C/blob/master/data_structures/graphs/bfs.c)（GPLv3）

```c
#define SIZE 40  // 假设图最大 40 节点

struct queue {
    int items[SIZE];
    int front;
    int rear;
};

struct node {
    int vertex;
    struct node *next;
};

struct Graph {
    int numVertices;
    struct node **adjLists;
    int *visited;
};

void bfs(struct Graph *graph, int startVertex) {
    struct queue *q = createQueue();
    graph->visited[startVertex] = 1;
    enqueue(q, startVertex);

    while (!isEmpty(q)) {
        printf("%d ", pollQueue(q));      // 打印队首但不删除
        int currentVertex = dequeue(q);   // 删除队首

        struct node *temp = graph->adjLists[currentVertex];
        while (temp) {
            int adjVertex = temp->vertex;
            if (graph->visited[adjVertex] == 0) {
                graph->visited[adjVertex] = 1;
                enqueue(q, adjVertex);
            }
            temp = temp->next;
        }
    }
}
```

**特征**：

- **数据结构**：**自定义队列**（`struct queue` + 固定大小数组 `items[SIZE]`）
- **图表示**：**链表邻接表**（`struct node*` 指针数组）
- **返回值**：无（直接 `printf` 打印遍历序列）— **10 个实现中唯一无返回值的**
- **访问标记**：`int* visited`（0/1 数组）
- **固定容量**：`#define SIZE 40`，超过 40 节点溢出
- **手动内存管理**：`malloc`/`free`，无 RAII 保护
- **pollQueue 与 dequeue 分离**：`pollQueue` 看队首不删除，`dequeue` 删除队首 — **10 个实现中独有的两阶段操作**
- **双向图**：`addEdge` 默认双向
- **License**：**GPLv3**

### 8. C DFS — 递归 + 链表邻接表

来源：[TheAlgorithms/C `data_structures/graphs/dfs.c`](https://github.com/TheAlgorithms/C/blob/master/data_structures/graphs/dfs.c)（GPLv3）

```c
void dfs(struct Graph *graph, int vertex) {
    struct node *adjList = graph->adjLists[vertex];
    struct node *temp = adjList;

    graph->visited[vertex] = 1;
    printf("%d ", vertex);

    while (temp != NULL) {
        int connectedVertex = temp->vertex;
        if (graph->visited[connectedVertex] == 0) {
            dfs(graph, connectedVertex);  // 递归
        }
        temp = temp->next;
    }
}
```

**特征**：

- **遍历策略**：**递归**（与 C BFS 共享同一 `struct Graph`）
- **图表示**：链表邻接表（同 C BFS）
- **返回值**：无（直接 `printf`）
- **访问标记**：`int* visited`（0/1 数组）
- **代码极简**：DFS 函数仅 10 行，最接近教科书伪代码
- **栈溢出风险**：深度为 V 的图可能栈溢出（C 默认栈大小约 1MB）
- **License**：**GPLv3**

### 9. Rust BFS — VecDeque + 边列表（目标搜索语义）

来源：[TheAlgorithms/Rust `src/graph/breadth_first_search.rs`](https://github.com/TheAlgorithms/Rust/blob/master/src/graph/breadth_first_search.rs)（MIT）

```rust
use std::collections::HashSet;
use std::collections::VecDeque;

pub fn breadth_first_search(graph: &Graph, root: Node, target: Node) -> Option<Vec<u32>> {
    let mut visited: HashSet<Node> = HashSet::new();
    let mut history: Vec<u32> = Vec::new();
    let mut queue = VecDeque::new();

    visited.insert(root);
    queue.push_back(root);
    while let Some(currentnode) = queue.pop_front() {
        history.push(currentnode.value());

        if currentnode == target {
            return Some(history);  // 找到目标，返回访问历史
        }

        for neighbor in currentnode.neighbors(graph) {
            if visited.insert(neighbor) {  // insert 返回 bool（是否首次插入）
                queue.push_back(neighbor);
            }
        }
    }
    None  // 全遍历完未找到目标
}
```

**特征**：

- **数据结构**：`VecDeque`（双端队列，`push_back` + `pop_front` 实现 FIFO）
- **图表示**：**边列表** `Vec<Edge>`（非邻接表，`neighbors()` 方法遍历所有边过滤）— **10 个实现中唯一用边列表**
- **返回值**：`Option<Vec<u32>>`（找到返回 `Some(history)`，未找到返回 `None`）— **10 个实现中唯一目标搜索语义**
- **访问标记**：`HashSet<Node>`，`insert()` 返回 `bool` 表示是否首次插入 — **idiomatic Rust**，避免 `if !visited.contains() { visited.insert() }` 双次哈希查找
- **泛型**：通过 `Node`/`Edge` newtype 模式，类型安全
- **测试覆盖**：含 4 组测试（graph1 + graph2，含无路径场景）
- **neighbors 复杂度**：每次调用遍历所有边，O(E) 而非 O(deg(v)) — 性能劣势

### 10. Rust DFS — VecDeque + push_front（同一数据结构双用途）

来源：[TheAlgorithms/Rust `src/graph/depth_first_search.rs`](https://github.com/TheAlgorithms/Rust/blob/master/src/graph/depth_first_search.rs)（MIT）

```rust
pub fn depth_first_search(graph: &Graph, root: Vertex, objective: Vertex) -> Option<Vec<u32>> {
    let mut visited: HashSet<Vertex> = HashSet::new();
    let mut history: Vec<u32> = Vec::new();
    let mut queue = VecDeque::new();
    queue.push_back(root);

    while let Some(current_vertex) = queue.pop_front() {
        history.push(current_vertex.value());

        if current_vertex == objective {
            return Some(history);
        }

        for neighbor in current_vertex.neighbors(graph).into_iter().rev() {
            if visited.insert(neighbor) {
                queue.push_front(neighbor);  // 前端插入实现 LIFO（栈语义）
            }
        }
    }
    None
}
```

**特征**：

- **数据结构**：`VecDeque`（**与 BFS 同一类型**，但用 `push_front` 实现栈语义）— **10 个实现中唯一用同一数据结构服务 BFS/DFS 的**
- **图表示**：边列表（同 Rust BFS）
- **返回值**：`Option<Vec<u32>>`（目标搜索语义，同 Rust BFS）
- **访问标记**：`HashSet<Vertex>` + `insert()` 返回 bool
- **rev() 控制**：`neighbors(graph).into_iter().rev()` 反转遍历顺序，使结果与递归 DFS 一致
- **命名差异**：BFS 用 `Node`，DFS 用 `Vertex`（**同一仓库内命名不一致**，可能是不同作者贡献）
- **测试覆盖**：含 4 组测试

## 跨语言对比矩阵

### BFS 实现对比

| 语言 | 数据结构 | 图表示 | 返回值 | 访问标记 | 泛型 | 测试覆盖 | 独特特性 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Python | `queue.Queue` | 邻接表 dict | `set[int]` | set | ❌ | ✅ doctest | 线程安全 Queue |
| Java | `LinkedList` as Queue | 邻接矩阵 `int[][]` | `List<Integer>` | `boolean[]` | ❌ | ❌ | 延迟过滤（lazy deletion） |
| C++ | `std::queue<T>` | `map<T, list<T>>` | `map<T, bool>` | `map<T, bool>` | ✅ `template` | ✅ 3 tests | 双向图支持 + 预初始化 |
| C | 自定义 struct queue | 链表邻接表 | 无（printf） | `int*` | ❌ | ❌ | pollQueue/dequeue 分离 |
| Rust | `VecDeque` | 边列表 `Vec<Edge>` | `Option<Vec<u32>>` | `HashSet<Node>` | ✅ newtype | ✅ 4 tests | 目标搜索语义 + insert() 返回 bool |

### DFS 实现对比

| 语言 | 数据结构 | 图表示 | 返回值 | 访问标记 | 策略 | 测试覆盖 | 独特特性 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Python | `list` as stack | 邻接表 dict | `set[str]` | set | 迭代 | ✅ doctest | reversed() 控制顺序 |
| Java | 递归调用栈 | 邻接矩阵 `int[][]` | `List<Integer>` | `boolean[]` | 递归 | ❌ | 方法重载（public + private helper） |
| C++ | `std::stack` | `vector<vector<size_t>>` | `vector<size_t>` | 3-coloring | 迭代 | ✅ 3 tests | WHITE/GREY/BLACK 三色标记 |
| C | 递归调用栈 | 链表邻接表 | 无（printf） | `int*` | 递归 | ❌ | 代码最简洁（10 行） |
| Rust | `VecDeque` + push_front | 边列表 `Vec<Edge>` | `Option<Vec<u32>>` | `HashSet<Vertex>` | 迭代 | ✅ 4 tests | 同一 VecDeque 服务 BFS/DFS |

> 💡 **策略选择说明**：递归 DFS（Java/C）代码最接近教科书定义，但有栈溢出风险（深度为 V 的图可能触发 `StackOverflowError`）；迭代 DFS（Python/C++/Rust）用显式栈规避此风险，但代码稍复杂。CLRS《算法导论》第三版 22.3 节原文采用递归定义，但工程实现应优先迭代。

## 选型决策矩阵

| 场景 | 推荐实现 | 理由 |
| --- | --- | --- |
| 教学演示（BFS 标准实现） | Python BFS | `queue.Queue` 语义清晰，doctest 可验证 |
| 教学演示（DFS 递归定义） | Java DFS | 方法重载 public/private 模式最清晰，邻接矩阵直观 |
| 教学演示（DFS 迭代 + 三色标记） | C++ DFS | WHITE/GREY/BLACK 三色标记最贴近 CLRS 教科书 |
| 教学演示（对比 BFS/DFS 数据结构） | Rust BFS + DFS | 同一 `VecDeque` 服务两种语义，直观对比 queue vs stack |
| 生产环境（泛型需求） | C++ BFS/DFS | `template<typename T>` 泛型支持最完整 |
| 生产环境（目标搜索而非全遍历） | Rust BFS/DFS | `Option<Vec<u32>>` 语义最精确，找到即返回 |
| 嵌入式 / 无递归栈环境 | C++ DFS 或 Rust DFS | 显式栈规避栈溢出风险 |
| 大规模图（V > 1000） | Python DFS 或 Rust DFS | 迭代实现避免递归深度限制 |
| 需要有序遍历序列 | Java BFS/DFS 或 C++ DFS | 返回 `List`/`vector` 含顺序信息 |
| 需要测试保障 | Rust BFS/DFS 或 C++ BFS/DFS | 含完整测试套件 |
| 极简代码优先 | C DFS | 递归 DFS 仅 10 行，最接近伪代码 |

## 关键洞察

### 1. 图表示法选择影响查询效率

10 个实现展示了三种图表示法：

- **邻接表**（Python dict / C++ map+list / C 链表）：O(deg(v)) 查询邻居，空间 O(V+E)，**稀疏图最优**
- **邻接矩阵**（Java `int[][]`）：O(V) 查询邻居但 O(1) 边存在性查询，空间 O(V²)，**稠密图或频繁边查询最优**
- **边列表**（Rust `Vec<Edge>`）：O(E) 查询邻居（需过滤），空间 O(E)，**最简单但查询最慢**

Rust 的边列表实现是 10 个实现中查询效率最差的（`neighbors()` 遍历所有边过滤），但代码最简洁，适合教学演示图遍历本身（而非图数据结构设计）。

### 2. 递归 vs 迭代 DFS 是工程关键选择

DFS 有两种实现策略，差异显著：

- **递归 DFS**（Java / C）：代码最简洁，最接近教科书定义，但栈深度受限于语言运行时（Java ~512KB / C ~1MB），深度为 V 的链状图会栈溢出
- **迭代 DFS**（Python / C++ / Rust）：用显式栈（`list` / `std::stack` / `VecDeque`）规避栈溢出，但需手动管理栈状态

**工程建议**：生产环境优先迭代实现；教学场景可递归（直观）但需说明栈溢出风险。Python 的 `sys.getrecursionlimit()` 默认 1000，对深度 > 1000 的图必须用迭代。

### 3. C++ 的 3-coloring 标记法借鉴 CLRS

C++ DFS 是 10 个实现中唯一采用 WHITE/GREY/BLACK 三色标记的：

- **WHITE**（未访问）：节点尚未被发现
- **GREY**（在栈中）：节点已入栈但尚未完成探索
- **BLACK**（已完成）：节点的所有邻居都已处理

这种标记法源自 CLRS《算法导论》第三版 22.3 节，比二值标记（`visited` / `unvisited`）提供更多信息，可用于检测环（GREY 节点再次出现说明有环）和强连通分量分析。其他 9 个实现用二值标记，功能上足够但语义较弱。

### 4. Rust 的 VecDeque 双用途体现 deque 设计哲学

Rust BFS 和 DFS **共享同一数据结构 `VecDeque`**，差异仅在操作端：

- BFS：`push_back` + `pop_front`（FIFO，队列语义）
- DFS：`push_front` + `pop_front`（LIFO，栈语义）

这体现了 deque（双端队列）的设计哲学：**一个数据结构同时服务 queue 和 stack 两种语义**，避免为 BFS/DFS 分别引入 `Queue` 和 `Stack` 类型。Python 的 `collections.deque` 也有此特性，但 TheAlgorithms/Python 的 BFS 用了 `queue.Queue`（线程安全但更重），DFS 用了 `list`（只能做栈），未利用 deque 的双用途优势。

### 5. 返回值语义分歧：全遍历 vs 目标搜索

10 个实现按返回值语义分为两阵营：

- **全遍历语义**（8 个实现）：遍历所有可达节点，返回访问集合或序列。Python 返回 `set`（无序）、Java/C++ 返回 `List`/`vector`（有序）、C 直接 `printf`（无返回值）
- **目标搜索语义**（Rust BFS/DFS）：`Option<Vec<u32>>`，找到目标返回 `Some(history)`，未找到返回 `None`

**工程建议**：目标搜索语义更精确（找到即停，不全遍历），但需调用方处理 `None`；全遍历语义更通用（可用于连通性判断、拓扑排序等），但搜索目标时浪费算力。Rust 的 `Option` 返回值是 10 个实现中最类型安全的。

### 6. 实现缺口：TypeScript 仓库无纯 BFS/DFS

搜索 `breadth_first_search` / `depth_first_search` 在 TheAlgorithms/TypeScript 仓库返回 0 结果，是六仓库中唯一缺失图遍历基础实现的。TypeScript 仓库的 `Sorts/` 目录完善（含 merge-sort、quick-sort 等），但 `graphs/` 或类似图算法目录不存在。

**可能原因**：TypeScript 仓库定位偏重排序/搜索/字符串等"纯算法"，图算法需要先定义图数据结构（邻接表/矩阵），实现成本较高。对比 Python 仓库的 `graphs/` 目录有 50+ 个图算法文件，TypeScript 仓库的图算法覆盖明显不足。

**建议**：若需 TypeScript 的 BFS/DFS 实现，可参考 Python 版本改写，但需先定义 `Graph` 类与邻接表结构。

## 何时选择 BFS vs DFS

| 问题特征 | 推荐算法 | 理由 |
| --- | --- | --- |
| 最短路径（无权图） | BFS | BFS 按层扩展，首次到达即最短 |
| 连通性判断 | 任一 | BFS/DFS 均可，DFS 代码更简洁 |
| 拓扑排序 | DFS | DFS 完成顺序的逆序即拓扑序 |
| 环检测 | DFS | GREY 节点再次出现说明有环（需 3-coloring） |
| 强连通分量 | DFS | Kosaraju/Tarjan 算法基于 DFS |
| 二分图判定 | 任一 | BFS 用层奇偶性，DFS 用染色法 |
| 所有路径枚举 | DFS | BFS 不适合枚举所有路径 |
| 层级遍历 | BFS | 天然按层扩展 |

## 相关页面

- [[wiki/coding/thealgorithms-python]] — Python 仓库入口（含本页 Python BFS `queue.Queue` + DFS 显式栈实现）
- [[wiki/coding/thealgorithms-java]] — Java 仓库入口（含本页 Java BFS `LinkedList` + DFS 递归实现，源自 `MatrixGraphs.java`）
- [[wiki/coding/thealgorithms-c-plus-plus]] — C++ 仓库入口（含本页 C++ BFS 泛型 `template` + DFS 3-coloring 三色标记实现）
- [[wiki/coding/thealgorithms-c]] — C 仓库入口（含本页 C BFS 自定义队列 + DFS 递归实现，GPLv3 License）
- [[wiki/coding/thealgorithms-rust]] — Rust 仓库入口（含本页 Rust BFS/DFS 共享 `VecDeque` 双用途 + 目标搜索 `Option` 语义）
- [[wiki/coding/quick-sort-impl-patterns]] — 快速排序跨语言实现对比（同系列姊妹篇）
- [[wiki/coding/merge-sort-impl-patterns]] — 归并排序跨语言实现对比（同系列姊妹篇，含 pop(0) 陷阱分析）
- [[wiki/coding/heap-sort-impl-patterns]] — 堆排序跨语言实现模式对比（同系列姊妹篇，含建堆 O(n) 证明）
- [[wiki/coding/binary-search-impl-patterns]] — 二分搜索跨语言实现对比（同系列姊妹篇）
