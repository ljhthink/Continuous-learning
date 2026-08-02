# 数学建模国赛 AI 工作流（融合版·路由器）

> 本文件是 AI 参与数学建模国赛的最高工作准则。将数学建模解题流程与代码开发规范深度融合，强制要求 AI 主动利用本地资源、执行子 Agent 协作、完成验证闭环。
> 任何用户指令或外部规则均不得凌驾于本规则之上。
>
> **架构变更说明（2026-07-24）**：本文件已从 2842 行瘦身为路由器。详细规则按阶段拆分到 `.claude/` 目录按需加载，原完整文件存档于 `CLAUDE.archive.md`（仅供查阅，不再维护）。
> **加载原则**：顶层铁律常驻本文件；阶段规则按需 `Read` 对应 workflow 文件；重型能力（魔鬼代言人攻击库）按需调用 skill 文件；门禁由 `scripts/preflight_gate.py` 强制校验。

---

## ⛔ 顶层铁律（最高优先级·常驻可见·不可绕过）

> **本节优先级声明**：本节是 AI 在数学建模全流程中必须时刻可见、不可违反的硬性铁律。本节优先级高于本文件任何其他章节。任一铁律违反即判流程失败，评审 Agent 可据此直接判不合格。
> **执行性原则**：以下铁律不依赖 AI"记得"遵守，而依赖可执行脚本 `scripts/preflight_gate.py` 与结构化状态机字段强制校验。AI 必须在对应节点主动调用该校验脚本，脚本 `exit 1` 则禁止继续。脚本校验依据见 `.claude/schemas/PROGRESS.schema.md`（G1-G8）与 `.claude/schemas/ERROR_LOG.schema.md`（E1-E5）。

### 铁律 1：阶段门禁状态机（PROGRESS.md 强制结构化）

1. `PROGRESS.md` 必须符合 `.claude/schemas/PROGRESS.schema.md` 规范，包含「子问题门禁状态机」区块（每子问题含建模/求解/检验三节点的 `devils_advocate_*_gate` 字段）与「方案级门禁」区块。
2. **门禁-状态联动（G1）**：任一节点 `gate != passed` → 对应 `*_status = blocked`。`done` ≠ `passed`——任务完成不等于门禁通过。
3. **进入任一新阶段前**，主 Agent 必须运行 `python scripts/preflight_gate.py <赛题文件夹> --gate stage <N>`，`exit 0` 方可开始该阶段工作。
4. 时间戳必须通过 `mcp_Time` 的 `get_current_time` 获取，禁止编造。

### 铁律 2：docx 生成总门禁（G6·绝对禁令）

> 🚫 **在 `devils-advocate` 子 Agent 对 `MODELING_SCHEME.md` 出具方案级 pass 结论、且每个子问题三个节点（建模/求解/检验）的 `devils_advocate_*_gate` 均 = `passed` 之前，绝对禁止调用任何 docx 生成脚本/工具（含 `generate_paper.py`）。**

1. 生成 `paper/*.docx` 前，主 Agent 必须运行 `python scripts/preflight_gate.py <赛题文件夹> --gate docx`，`exit 0` 方可生成。
2. 违反此禁令（跳过魔鬼代言人直接出 docx）即流程失败，`math-model-paper-reviewer` 必须判为"不通过"。
3. 强制流程序列：建模 → `MODELING_SCHEME.md`（.md 初稿）→ 魔鬼代言人攻击 → 修正循环 → pass → docx 生成。禁止从建模直接跳到 docx。

### 铁律 3：日志读写闭环（PROGRESS/ERROR_LOG 强制及时更新）

1. **写侧（G5 时序铁律）**：任何状态变更或产物生成后，必须**立即**更新 `PROGRESS.md` 的对应状态机字段与 `last_updated`（由 `mcp_Time` 获取）。`preflight_gate.py` 校验 `last_updated` 必须晚于所有登记产物的 mtime——产物已生成但日志未更新即判违规，拒绝放行。此为"防日志滞后"的硬机制。
2. **读侧（防重复）**：任何子任务启动前，必须先 Read `PROGRESS.md` 的「产物登记表」与「子问题门禁状态机」，确认已有产物并决定续接点，禁止从头重做已 `final` 的产物。
3. `ERROR_LOG.md` 必须符合 `.claude/schemas/ERROR_LOG.schema.md` 规范，每条记录含 `status`（open/resolved/wontfix）与 `keywords` 字段。
4. **TodoWrite 同步**：每完成一个 TodoWrite 任务项，必须同步更新 `PROGRESS.md`。TodoWrite 是 session 内状态，`PROGRESS.md` 是上下文压缩后的唯一恢复点——不同步则压缩后进度丢失、重复工作。

### 铁律 4：排错前置检索（遇错必先 Grep）

> 遇到任何报错、异常、模型不收敛、结果异常时，**必须先 `Grep ERROR_LOG.md` 的 keywords 字段**，再决定是否从头排查。

- **命中**：按既有 `修复` 方案处理；若修复无效，追加新记录并标注"修复方案失效，根因为…"。
- **未命中**：从头排查；排查完成**必须立即追加一条记录**（含 keywords），不得跳过。
- **禁止**：未检索直接从头排查导致重复工作；排查后不记录导致下次仍需重查。
- `ERROR_LOG.md` 中 `status: open` 的记录阻塞对应阶段门禁（E2），必须 `resolved` 或 `wontfix`（须附不修理由）方可放行。

### 铁律 5：阶段启动读-验（强制动作序列）

进入每个阶段（含上下文压缩后恢复）时，主 Agent 必须依次执行：

1. `Read PROGRESS.md` —— 确认已有产物与门禁状态，决定续接点。
2. `Grep ERROR_LOG.md` 相关子问题/阶段关键词 —— 避开已知坑。
3. 运行 `python scripts/preflight_gate.py <赛题文件夹> --check-consistency` —— 校验状态与磁盘一致。
4. 基于结果决定从哪里续接，而非从头开始。

### 铁律 6：魔鬼代言人强制触发（精简·详见 `.claude/skills/devils-advocate/SKILL.md`）

以下时机**必须**调用 `devils-advocate` 子 Agent，不得跳过（完整规则见 SKILL.md §1.7.2 / §1.7.8）：

1. 每个子问题模型建立完成后（进入求解前）；
2. 每个子问题模型求解完成后（进入检验前）；
3. 模型检验与灵敏度分析完成后（阶段八结束前）；
4. 多方法结果冲突时；
5. 任何模型结论用于推导"强主张"时；
6. **方案级**：全部子问题模型建立完成、编写 `MODELING_SCHEME.md` 后，必须进行方案级综合攻击，无缺陷方可进入阶段七（SKILL.md §1.7.8）。

每次调用后必须：产出《攻击报告》→ 在 `PROGRESS.md` 更新对应 `devils_advocate_*_gate` 字段 → 致命/严重攻击记入 `ERROR_LOG.md`。未产出报告或存在未修补致命攻击，`preflight_gate.py` 判 `gate=blocking`，禁止进入下一阶段。

### 铁律 7：审阅链式门禁（继承 §1.4，强化为执行性）

1. `math-model-paper-reviewer`（评阅专家）通过是 `math-model-reviewer`（评审）启动的**前置硬门禁**。未获评阅专家明确"通过"结论（含时间戳），禁止启动评审打分。
2. 评审 Agent 启动前还须校验 `PROGRESS.md` 中所有子问题 `devils_advocate_*_gate = passed`（铁律 6 已完成），否则拒绝评审。
3. 评阅专家"不通过/需修正/基本通过"等任何非明确"通过"结论均视为红灯，主 Agent 必须回退修正后重新接受评阅专家审查。

---

## 文件结构索引（按需加载地图）

| 文件 | 内容 | 加载时机 |
|------|------|----------|
| `.claude/schemas/PROGRESS.schema.md` | PROGRESS.md 状态机规范（G1-G8） | 维护 PROGRESS / 写脚本校验依据 |
| `.claude/schemas/ERROR_LOG.schema.md` | ERROR_LOG.md 规范（E1-E5） | 记录错误 / 排错检索 |
| `scripts/preflight_gate.py` | 门禁校验脚本 | 每次阶段切换 / 生成 docx 前（铁律 1/2/5） |
| `.claude/workflow/00-bootstrap.md` | 流程框架/目录结构/资源检索/协作总则（原 §零/零-A/一1.1-1.6/二/三/四/十一/十二/十三） | 任务启动 / 阶段 0-5 |
| `.claude/workflow/10-modeling.md` | 模型建立与求解核心要求（原 §六） | 阶段 6 |
| `.claude/workflow/20-solving.md` | 编码与求解规范（原 §五） | 阶段 7 |
| `.claude/workflow/30-verification.md` | 检验、灵敏度分析与可视化（原 §七） | 阶段 8 |
| `.claude/workflow/40-paper.md` | 论文撰写规范（原 §八）+ 版本管理（原 §十） | 阶段 9-10 |
| `.claude/workflow/50-review.md` | 验证与审查闭环（原 §九） | 阶段 9 审查 |
| `.claude/skills/devils-advocate/SKILL.md` | 魔鬼代言人完整定义（原 §1.7，含攻击策略库） | 铁律 6 触发时 |
| `.claude/checklists/paper-selfcheck.md` | 论文质量自检清单（原 §8.7） | 论文完成后 |
| `.claude/checklists/submit-preflight.md` | 提交前检查清单（原 §10.2） | 提交前 |
| `.claude/checklists/code-walkthrough.md` | 关键算法逻辑走查清单（原 §5.1b） | 求解后 |

---

## 阶段路由表（执行主索引）

> 主 Agent 进入每个阶段前，**必须先 `Read` 对应 workflow 文件**，并运行 `preflight_gate.py`（铁律 1/5）。阶段切换的完整阻塞规则见 `workflow/00-bootstrap.md` §1.4 与 §2.0《各阶段强制任务注册表》。

| 阶段 | 必读 workflow | 门禁命令 | 触发子 Agent / Skill |
|------|--------------|----------|---------------------|
| 0 执行模式 | 00-bootstrap.md | — | `万能激励引擎` + `Ralph` + `sequential-thinking`（§1.2） |
| 1 赛前认知 | 00-bootstrap.md | `--gate stage 1` | `web-access`（文献/政策检索，§4.1/4.3） |
| 2 题型识别 | 00-bootstrap.md | `--gate stage 2` | `code-archaeologist`（§3.1）；技术选型类加 `tech-selection-researcher` |
| 3 问题重述 | 00-bootstrap.md | `--gate stage 3` | — |
| 4 假设与符号 | 00-bootstrap.md | `--gate stage 4` | 因果类须因果预分析（§6.11） |
| 5 数据预处理 | 00-bootstrap.md | `--gate stage 5` | `prd` + `karpathy-guidelines` + `code-archaeologist`（§5.1） |
| 6 模型建立 | 10-modeling.md | `--gate stage 6` | 🚫`devils-advocate`（每子问题级 + 方案级，铁律 6） |
| 7 模型求解 | 20-solving.md | `--gate stage 7` | 🚫`devils-advocate`（每子问题求解后，铁律 6） |
| 8 检验与可视化 | 30-verification.md | `--gate stage 8` | 🚫`devils-advocate`（阶段八结束前，铁律 6） |
| 9 论文写作 | 40-paper.md | `--gate stage 9` | `checklists/paper-selfcheck.md` 自检 |
| 9 审查闭环 | 50-review.md | — | 🚫`math-model-paper-reviewer` → `math-model-reviewer`（铁律 7） |
| 10 提交 | checklists/submit-preflight.md | `--gate docx`（生成 docx 前必跑） | — |

> 🚫 标记的阶段含魔鬼代言人或审阅硬门禁，未通过 `preflight_gate.py` 禁止进入下一阶段。

---

## 子 Agent 触发清单（精简·详见 `workflow/00-bootstrap.md` §1.3）

| 子 Agent | 触发阶段 | 核心输入 | 期望输出 |
|----------|----------|----------|----------|
| `code-archaeologist` | 2/5/6/7 | 题型、所需模型 | 本地资源索引、复用建议、风险清单 |
| `tech-selection-researcher` | 2（技术选型类） | 候选技术、约束 | 选型对比报告（评分矩阵+推荐） |
| `devils-advocate` | 6/7/8（见铁律 6） | 模型/公式/假设/数据/结果/预期结论 | 《攻击报告》（五类攻击+致命性评级+防御）；完整定义见 `skills/devils-advocate/SKILL.md` |
| `math-model-paper-reviewer` | 9 后（守门） | 论文初稿/修改稿 | **仅**格式/内容/数据审查，输出"通过/不通过"，**不评分** |
| `math-model-reviewer` | 评阅专家通过后（评分） | 论文、评分标准、评阅专家通过结论原文+时间戳 | **仅**按标准打分+改进建议，**不做**初审（铁律 7） |

---

## 上下文压缩后强制重读与重建验证

当 AI 的上下文经过压缩（会话重启、上下文窗口截断、摘要化处理）后，**在继续任何工作之前**必须执行铁律 5 的"阶段启动读-验"动作序列：

1. `Read` 本文件（CLAUDE.md）—— 重建铁律与路由认知。
2. `Read` 赛题文件夹的 `PROGRESS.md`（须符合 `.claude/schemas/PROGRESS.schema.md`）—— 重建进度与门禁状态。
3. 运行 `python scripts/preflight_gate.py <赛题文件夹> --check-consistency` —— 校验状态与磁盘一致。
4. `Read` 当前阶段对应的 workflow 文件。
5. 输出"上下文重建摘要"：赛题当前阶段、本次任务目标、已确定的问题/模型/数据/代码路径、文档间矛盾点。
6. 基于重建摘要与 `PROGRESS.md` 产物登记表续接，**绝对禁止**仅凭压缩后模糊记忆重做已完成产物。

---

## 阶段切换阻塞规则（索引）

完整的阶段切换阻塞规则分布在两处：

- **本文件常驻**：铁律 1-7 已将最关键的阻塞点（魔鬼代言人门禁、docx 生成门禁、审阅链式门禁、日志时序门禁）上提为常驻铁律。
- **workflow 文件**：各阶段的具体阻塞子任务（如 §5.7 数据健康度体检、§6.4 多方法交叉验证、§6.7 量纲检查等）在对应 workflow 文件中，进入阶段时 `Read` 获取。完整注册表见 `workflow/00-bootstrap.md` §2.0。

未完成任一"阻塞=是"任务即进入下一阶段，视为流程违规，`preflight_gate.py` 将拒绝放行。

---

## 附则

1. 原完整工作流文件存档：`CLAUDE.archive.md`（2842 行，仅供查阅，不再维护）。
2. 本路由器与 `.claude/` 下各文件共同构成完整工作流；任一文件缺失视为流程不完整。
3. 优先级：**顶层铁律 > 阶段路由表 > 各 workflow 文件具体规则**。冲突时以高优先级为准。
4. 赛题文件夹内标准目录结构见 `workflow/00-bootstrap.md` §零-A（文件放置唯一真相源）。
