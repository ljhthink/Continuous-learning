# ADR-008: 知识库内容分层与格式统一

| 项目 | 内容 |
| --- | --- |
| 状态 | Proposed |
| 日期 | 2026-07-24 |
| 决策者 | 用户 + 主 Agent |
| 关联文档 | ADR-001（技术栈）、ADR-006（持续进化闭环）、AGENTS.md §3/§8 |
| 风险等级 | P2 跨模块（涉及多文件、多模块结构变更） |

## 背景（Context）

Route B 完成后（PR #16 合并），用户对知识库设计提出三个深刻反思，触及知识库的**定位混乱**与**格式不一致**问题：

### 问题 1：experiences 文件夹表头混乱

`wiki/coding/experiences/` 下 4 张卡片 frontmatter 格式与 concept/entity 页不一致：

| 字段 | experiences（MCP 自动生成） | concept/entity（Agent 手写） |
| --- | --- | --- |
| domain | 多行数组 `domain:\n  - coding` | 单行数组 `domain: [coding]` |
| date | 带引号 `date: '2026-07-24'` | 无引号 `date: 2026-07-24` |
| frontmatter 后 | 无空行（MD022 违规） | 有空行（合规） |

**根因**：`server/src/utils/frontmatter.ts` 的 `serializeFrontmatter` 调用 js-yaml `dump()` 生成 YAML，而 js-yaml 默认序列化格式与 Agent 手写习惯不同。两条生成路径在 AGENTS.md §3 中没有强制统一约定。

### 问题 2：新领域如何处理

用户询问未来上传不属于 coding/emotions/reading 的资料时如何归类。

**现有机制**（AGENTS.md §4.2 第 3 步 + §8.3）：Agent 在 ingest 时判断领域归属，若无合适领域则建议新建，与用户讨论确认后创建目录 + 更新 index.md + 更新 AGENTS.md §8.1。是「Agent 建议 + 用户确认」机制，非纯自动分类。

### 问题 3：知识库定位混乱（核心问题）

**3a. KB 系统文档错放 coding/**

`page-types-and-state-machine.md`、`frontmatter-schema.md`、`ingest-workflow.md` 等 9 张文档描述的是「知识库系统本身如何工作」（元知识），不是「编程知识」。错误地放在 `wiki/coding/` 下，相当于把「图书馆管理手册」放在「计算机科学」书架上。

**3b. thealgorithms-*.md 索引页价值低**

当前 9 张 TheAlgorithms + public-apis 页面是低密度索引页（指向 GitHub README），不是高密度知识页（记录具体算法实现）。当其他 agent 调用 `kb_search("快速排序如何实现")` 时，这些页面无法直接回答，只能告诉它"GitHub 上有这个仓库"——价值有限，更像"书签"而非"笔记"。

## 决策（Decision）

### 决策 0：新领域机制维持现状（针对背景问题 2）

背景问题 2 询问"未来上传不属于 coding/emotions/reading 的资料如何归类"。经核实，现有机制（AGENTS.md §4.2 第 3 步 + §8.3）已足够：

- **机制**：Agent 在 ingest 时判断领域归属，若无合适领域则建议新建，与用户讨论确认后创建目录 + 更新 index.md + 更新 AGENTS.md §8.1
- **性质**：「Agent 建议 + 用户确认」，非纯自动分类
- **无需新决策**：现有机制覆盖了新领域扩展场景，用户可在 ingest 时与 Agent 讨论确认

### 决策 1：experiences 表头格式统一（修 MCP server + 批量修复存量）

修改 `serializeFrontmatter` 强制单行数组 + 无引号 date + frontmatter 后加空行，与手写格式对齐。同时批量修复现有 4 张 experiences 卡片。

**影响面（经 guardrail-enforcer 源码核实）**：`serializeFrontmatter` 有 **5 个调用点**，不限于 experiences 卡片：

1. `kb_get_page` 的 `use_count` 写回（[read-only.ts:209](../../server/src/tools/read-only.ts#L209)，高频调用）
2. `kb_ingest_source`（[write.ts:114](../../server/src/tools/write.ts#L114)）
3. `kb_write_experience`（[write.ts:188](../../server/src/tools/write.ts#L188)）
4. `kb_promote_experience` promote（[write.ts:297](../../server/src/tools/write.ts#L297)）
5. `kb_promote_experience` reject（[write.ts:328](../../server/src/tools/write.ts#L328)）

修改引入 bug 会影响 `kb_get_page` 高频写回路径，可能导致大范围页面格式损坏。DEF-008 必须回归测试覆盖全部 5 个调用方。

**理由**：一劳永逸根治双轨生成路径不一致，未来所有自动生成的 experiences 都合规。

### 决策 2：新建 kb-system/ 领域

新建 `wiki/kb-system/` 领域，把 9 张 KB 系统文档从 `wiki/coding/` 迁移过去。在 AGENTS.md §8.1 追加 `kb-system` 领域说明。

**MCP 工具兼容性（经 guardrail-enforcer 源码核实）**：`kb_search`（[search.ts:69-75](../../server/src/tools/search.ts#L69-L75)）和 `kb_list_categories`（[read-only.ts:80-85](../../server/src/tools/read-only.ts#L80-L85)）均基于**动态扫描** wiki 目录，不硬编码领域列表。新建 `kb-system/` 领域无需修改 MCP server 代码，工具会自动发现新领域。

**理由**：结构清晰，符合领域归属原则。元知识（KB 系统如何工作）与编程知识（算法/语言/框架）分层。

### 决策 3：thealgorithms 索引页深化为算法知识页

保留 9 张 thealgorithms-*.md 作为入口页，但额外创建具体算法 concept 页（如 `quick-sort-impl-patterns.md`），记录跨语言实现对比（Python 三路分区 vs C++ 双路分区 vs stdlib introsort）。每页需要真正读仓库代码后沉淀。

**理由**：让知识库从"资源索引"升级为"知识沉淀"。当 agent 查询算法实现时，能直接获得跨语言对比的高密度知识，而非跳转 GitHub。

## 备选方案（Alternatives）

### 决策 1 备选

| 方案 | 优点 | 缺点 / 否决理由 |
| --- | --- | --- |
| 修 MCP server 代码 | 根治，未来自动合规 | 不清理存量，4 张旧卡片仍是旧格式 |
| 仅手动修复 4 张卡片 | 不动代码 | 下次 `kb_write_experience` 还会生成旧格式，治标不治本 |
| 两者都做（选定） | 根治 + 清理存量 | 工作量最大但最彻底 |

### 决策 2 备选

| 方案 | 优点 | 缺点 / 否决理由 |
| --- | --- | --- |
| 新建 kb-system/ 领域（选定） | 结构清晰，符合领域归属 | 需迁移 9 张文档 + 更新交叉引用 |
| 留 coding/ 加子目录 | 不动主结构 | 仍混在 coding 下，治标不治本 |
| 保持现状 | 无工作量 | 承认设计缺陷但不修复，未来更乱 |

### 决策 3 备选

| 方案 | 优点 | 缺点 / 否决理由 |
| --- | --- | --- |
| 深化为算法知识页（选定） | 高价值，真正沉淀知识 | 高成本，需读仓库代码 |
| 分层标注（resources/ 子目录） | 结构清晰 | 仍是索引页，价值密度未提升 |
| 删除索引页 | 低成本 | 丢失 License 风险提示等已有价值 |
| 保持现状 + disambiguation | 不动文件 | 价值密度问题未解决 |

## 后果（Consequences）

### 正面后果

- experiences 表头格式统一，未来自动生成的卡片与手写格式一致
- KB 系统元知识独立成领域，`coding/` 只放真正的编程知识
- 知识库从"资源索引"升级为"知识沉淀"，对调用 agent 真正有用
- 跨语言算法对比页成为知识库的高价值资产

### 负面后果 / 代价

- 需迁移 9 张 KB 系统文档，更新所有交叉引用（`related` 字段、`[[wiki/coding/...]]` 链接）
- 深化 thealgorithms 页需要逐个读仓库代码，工作量大（每个算法 concept 页需 1-4 小时估算）
- 短期内知识库结构变动频繁，需同步更新 index.md 和 AGENTS.md

### 需要同步更新的文档或代码

- `AGENTS.md` §8.1 追加 `kb-system` 领域说明
- `AGENTS.md` §3 frontmatter Schema 追加格式约定（单行数组 + 无引号 date + frontmatter 后空行）
- `server/src/utils/frontmatter.ts` `serializeFrontmatter` 修改
- `index.md` 重组结构（新增 kb-system 段，coding 段瘦身）
- `docs/decisions/README.md` 追加本 ADR
- `README.md` 文档索引（如有引用）

## 后续任务清单

按优先级排序（标注 DEF 编号）。**归属**列区分本 ADR 直接产出的任务与顺带列入的既有技术债，避免混淆 ADR 聚焦范围：

| 编号 | 任务 | 归属 | 风险等级 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| DEF-007 | reject 动作 MD024 修复（`write.ts:330` `type:"experience"` → `type:"reject"` + 回归测试 + AGENTS.md §7.4 文档化） | 顺带列入（既有技术债） | P1 常规 | 无 | 待开始 |
| DEF-001 | kb_write_experience TOCTOU 竞态修复（`fs.exists` + `fs.writeFile` → `fs.writeFile flag:'wx'`） | 顺带列入（既有安全债） | P1 常规 | 无 | 待开始 |
| DEF-008 | experiences 表头格式统一（修 `serializeFrontmatter` + 批量修复 4 张卡片 + 补测试） | 本 ADR 决策 1 | P1 常规 | 无 | 待开始 |
| DEF-009 | 新建 kb-system/ 领域 + 迁移 9 张 KB 系统文档 + 更新交叉引用 | 本 ADR 决策 2 | P2 跨模块 | DEF-008（格式规范确立后再迁移，确保迁移时遵循新规范） | 待开始 |
| DEF-010 | thealgorithms 深化为算法知识页（创建具体算法 concept 页，如 `quick-sort-impl-patterns.md`） | 本 ADR 决策 3 | P2 跨模块 | DEF-009（结构稳定后再深化） | 待开始 |
| DEF-006 | lint-perf p50 阈值调优（Windows 环境噪声 flaky） | 顺带列入（既有技术债） | 低 | 无 | 待开始 |
| 重启 MCP server | 验证 DEF-005 修复在端到端流程生效 | 运维操作 | — | DEF-008 完成后一并验证 | 待用户操作 |

### 执行顺序建议

1. **DEF-007**（P1，与 DEF-005 同根因，趁热打铁）
2. **DEF-001**（P1，安全问题）
3. **DEF-008**（P1，本 ADR 决策 1，为 DEF-009 铺路）
4. **DEF-009**（P2，本 ADR 决策 2，结构重组）
5. **DEF-010**（P2，本 ADR 决策 3，知识深化，长期任务）
6. **DEF-006**（低，独立技术债）

## 参考

- AGENTS.md §3（frontmatter Schema）、§4.2（Ingest 工作流）、§8.1（领域目录）、§8.3（新建领域）
- `server/src/utils/frontmatter.ts`（serializeFrontmatter 实现）
- `server/src/tools/write.ts`（kbWriteExperience、kbPromoteExperience）
- Route B PR #16（触发本次反思的变更）
