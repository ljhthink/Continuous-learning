---
title: "多领域分类规范"
domain: [coding]
type: concept
status: active
date: 2026-07-24
tags: [kb-system, domain, classification, tags]
related: [[wiki/coding/frontmatter-schema]], [[wiki/coding/three-layer-architecture]]
---

## 概念

wiki 层按**领域**组织为一级目录。每个页面通过 frontmatter 的 `domain` 字段声明归属，通过 `tags` 实现横切归属。

## 领域目录

`wiki/` 下每个一级目录是一个领域。常见领域：

| 领域 | 目录 | 说明 |
| --- | --- | --- |
| 编程 | `coding/` | 编程语言、框架、架构、DevOps |
| 情感 | `emotions/` | 心理、情绪、自我成长 |
| 读书 | `reading/` | 书籍笔记、读后感 |
| 学术 | `academic/` | 论文、研究方法 |
| 生活 | `life/` | 健康、旅行、爱好 |

## 多归属处理

### 主归属（物理位置）

页面文件放在**最相关**的领域目录下。例如 Python 异步模式放 `wiki/coding/async-patterns.md`，即使它也涉及「学术研究方法」。

### 横切归属（tags）

通过 `tags` 字段实现跨领域归属，无需复制文件：

```yaml
---
title: "Python 异步上下文管理器"
domain: [coding]
type: concept
tags: [python, async, context-manager]
---
```

### frontmatter domain 字段

`domain` 是数组，可填多个领域，但**文件物理位置只在一个目录**：

```yaml
domain: [coding, academic]   # 可选：声明多归属
```

实际使用中，`domain` 通常为单元素数组（主归属），多归属通过 `tags` 表达。

## 新建领域

当内容不属于任何现有领域时：

1. 在 `wiki/` 下新建目录（kebab-case 命名）。
2. 在 `index.md` 中追加新领域分组（`## <new-domain>`）。
3. 在 `AGENTS.md` §8.1 追加领域说明（schema 演进，AGENTS.md §11）。
4. 通过 PR 提交变更。

**判断标准**：新领域应有持续的内容流入预期。一次性单页内容应放在最接近的现有领域并用 tags 横切。

## 与 tags 的区别

| 维度 | domain | tags |
| --- | --- | --- |
| 必填 | 是（≥1） | 否 |
| 控制物理位置 | 是（文件所在目录） | 否 |
| 用于检索过滤 | 是（按领域分组） | 是（按标签检索） |
| 数量建议 | 1-2 个 | 0-5 个 |
| 演进成本 | 高（需新建目录 + 索引 + AGENTS.md） | 低（直接写 frontmatter） |

## 跨领域经验卡片

经验卡片虽然物理位置在 `wiki/<domain>/experiences/`，但 frontmatter 的 `domain` 可声明多归属。例如：

```yaml
---
title: "Python 异步测试中的 pytest fixture 复用"
domain: [coding, academic]    # 主归属 coding，横切 academic
type: experience
status: pending
confidence: 0.85
source_task: "task-async-test-001"
tags: [python, pytest, fixture, testing]
---
```

## 相关概念

- [[wiki/coding/frontmatter-schema]] — domain 与 tags 字段的定义。
- [[wiki/coding/three-layer-architecture]] — 领域目录属于 wiki 层。
- [[wiki/coding/lint-workflow]] — 缺失交叉引用是中严重度 lint 项。

## 来源

- `AGENTS.md` §8（多领域分类规范）
- `docs/ARCH.md` §4（数据模型与存储）
