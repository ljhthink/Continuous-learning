# ADR-006: 持续进化闭环（config 函数化 + 两 tier 审核门禁 + /dream 老化）

| 项目 | 内容 |
| --- | --- |
| 状态 | Accepted |
| 日期 | 2026-07-23 |
| 决策者 | 主 Agent（P3 持续进化闭环阶段） |
| 关联文档 | [AGENTS.md](../../AGENTS.md) §7（持续进化工作流）/ [ARCH.md](../ARCH.md) §3.1（接口契约）/ [CLAUDE.md](../../CLAUDE.md) §17.1（ADR 触发） |
| 风险等级 | P2（跨模块：改 config 公共接口 + 新增 MCP 工具 + 新增脚本） |
| 前序 ADR | [ADR-001](ADR-001-knowledge-base-tech-stack.md)（技术栈） |

## 背景（Context）

P1 阶段实现 8 个 MCP 工具后，遗留三个问题阻塞 P3 持续进化闭环：

1. **config.ts 懒加载根因**：`KB_ROOT` 等以 `export const` 在模块加载时一次性捕获 `process.env.KB_ROOT`。测试要为每个 fixture 切换 KB_ROOT，被迫在 `lint-perf.test.ts` 中 spawn 子进程以强制重新加载模块——这是 workaround，不是设计。
2. **缺审核门禁**：`kb_write_experience` 只能写 inbox（status=pending），无法 promote 到 active（AGENTS.md §7.4 两 tier 门禁未实现），经验卡片永久滞留 inbox。
3. **缺老化机制**：AGENTS.md §7.5 要求 use_count 长期为 0 且超 90 天的经验卡片降级 archived，但无 `/dream` 整理脚本，且 `kb_get_page` 不自增 use_count（老化机制无输入数据）。

## 决策（Decision）

### D1. config.ts 路径常量改为函数

`KB_ROOT / RAW_DIR / WIKI_DIR / INDEX_FILE / LOG_FILE` 从 `export const`（模块加载时求值）改为 `export function getKbRoot()` 等（调用时求值）。`SERVER_VERSION` 保留 const（与路径无关）。

每次调用读 `process.env.KB_ROOT` + `path.resolve`，无缓存。理由：

- 这些函数总在文件 I/O 前后调用，I/O 是毫秒级，env 读取是微秒级，开销可忽略。
- 无缓存 → 测试在 `before()` 设 `process.env.KB_ROOT = tmp` 后，所有工具立即生效，无需子进程、无需 reset。
- 调用方不得跨"可能切换 KB_ROOT 的操作"缓存返回值；在长循环（如 lint 的 1000 页扫描）中必须把 `getKbRoot()` 提到循环外只调一次（已在 lint.ts/search.ts 落地，避免性能回归）。

### D2. kb_get_page 自增 use_count

`kb_get_page` 读取页面后，`frontmatter.use_count`（默认 0）+1 并回写文件。关键约束：

- 回写**完整原始 body**（非 section 截断视图），确保 section 读不会截断存储。
- 写失败非致命（best-effort）：只读文件系统下读仍返回内容。
- ARCH.md §3.1 的 kb_get_page 副作用列从"无"改为"use_count+1 并回写"。

### D3. 新增 kb_promote_experience 工具（两 tier 门禁）

输入 `{ inbox_path, action: "promote"|"reject" }`：

- **promote**：将 inbox 卡片移动到 `wiki/<domain>/experiences/<slug>.md`，status→active，更新 index.md + log.md。返回 `tier`：confidence≥0.8 且单域 → `"auto"`，否则 `"manual"`（AGENTS.md §7.4）。重复检测（相似度>0.9/0.92）为未来增强，当前只回报 tier。
- **reject**：status→rejected，文件留在 inbox，追加 log。

这是第 9 个 MCP 工具，扩展了 ARCH.md §3.1 接口契约。

### D4. 新增 /dream 老化脚本

`server/src/dream.ts`（`npm run dream`）：扫描所有 active experience 卡片，将 `use_count===0` 且 `date` 超 90 天的降级为 archived，移动到 `wiki/<domain>/experiences/archive/`，从 index.md 移除并追加 log。archived 页仍可被检索但不进 lint 链接图。

脚本通过 `import.meta.url === process.argv[1]` guard 仅在直接执行时跑 main()，测试可 import `dream()` 函数而不触发副作用。

## 备选方案（Alternatives）

| 方案 | 优点 | 缺点 / 否决理由 |
| --- | --- | --- |
| **config 函数化**（选定） | 测试无 workaround、语义清晰 | 每次调用读 env（微秒级，可忽略） |
| config 保留 const + 测试用 vi.mock 重置模块 | 零运行时开销 | 需引入 vitest 等测试框架的重载机制，当前用 node:test 无此能力；mock 污染全局 |
| config 保留 const + 缓存 + reset 函数 | 兼顾性能与可测 | 引入隐藏状态，测试需记得调 reset，易漏 |
| use_count 由独立工具维护 | kb_get_page 保持纯读 | 违背 AGENTS.md §7.5"每次 kb_get_page 调用 use_count+1"的明确规约 |
| promote 复用 kb_ingest_source | 少一个工具 | ingest 写 staging，promote 是 pending→active 状态迁移，语义不同 |
| /dream 实现为 MCP 工具 kb_dream | 统一 MCP 接口 | dream 是批量维护操作，非单页 CRUD，脚本语义更合适；且避免 MCP 工具数膨胀 |

## 后果（Consequences）

### 正面后果

1. **测试隔离**：config 函数化消除子进程 workaround，lint-perf.test.ts 可简化（保留子进程作为真实隔离验证亦可）。
2. **闭环成型**：write(pending) → promote(active) → get_page(use_count) → dream(archived) 构成完整持续进化生命周期。
3. **接口对齐**：ARCH.md §3.1 与实现一致，kb_get_page 副作用如实标注。

### 负面后果 / 代价

1. **kb_get_page 现有副作用**：原"无副作用"契约变更。调用方若依赖读不改文件，需知 use_count 回写。已在 ARCH.md 标注。
2. **性能注意点**：长循环必须 hoist `getKbRoot()`，否则 1000 页扫描性能回归（已在 lint/search 落地，lint-perf.test.ts 守护）。
3. **promote 移动文件**：使用 fs.unlink + writeFile，非原子。若中途失败可能 inbox 与 active 并存。当前无事务，未来可加 journal。
4. **dream 重复检测未实现**：AGENTS.md §7.4 提及相似度>0.9/0.92 的重复检测，当前只回报 tier，未实际去重。列为后续增强。

### 需要同步更新的文档或代码

- [ARCH.md](../ARCH.md) §3.1：kb_get_page 副作用列 + 新增 kb_promote_experience 行 ✓
- [AGENTS.md](../../AGENTS.md) §7.4/§7.5：规约已存在，实现补齐 ✓
- `server/src/tests/setup.ts`：注释更新（不再需"模块加载前设 KB_ROOT"）✓

## 验证

1. `npm run typecheck` 通过 ✓
2. `npm test`：41 测试全过（原 34 + P3 新增 7：config 动态切换、use_count 递增/section 不截断、promote auto/manual/reject、dream 老化）✓
3. lint-perf.test.ts missing_xref 1000 页 p50 < 1000ms（hoist getKbRoot 后回归修复）✓
4. config 动态切换测试：同进程改 KB_ROOT 后 getKbRoot() 立即反映新值 ✓

## 生命周期

- **Proposed**：本 ADR 随 P3 闭环 PR 提交。
- **Accepted**：经 guardrail-enforcer + ac-verifier 闭环通过且 PR 合并后转 Accepted。
- **Superseded**：若引入向量数据库（LanceDB）使检索路径变化，或 promote 重复检测需求落地，需评估是否新建 ADR。

## 参考

- [AGENTS.md](../../AGENTS.md) §7.4（两 tier 审核）/ §7.5（老化淘汰）
- [ARCH.md](../ARCH.md) §3.1（MCP 工具契约）
- [CLAUDE.md](../../CLAUDE.md) §17.1（ADR 触发条件）
- [ADR-001](ADR-001-knowledge-base-tech-stack.md)：技术栈选型
