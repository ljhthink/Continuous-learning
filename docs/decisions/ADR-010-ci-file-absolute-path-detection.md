# ADR-010: CI 新增 file 协议绝对路径检测门禁

| 项目 | 内容 |
| --- | --- |
| 状态 | Accepted |
| 日期 | 2026-07-25 |
| 决策者 | 主 Agent（技术债务清理阶段） |
| 关联文档 | [ADR-004](ADR-004-ci-docs-quality-workflow.md)（CI docs-quality 三件套）/ [CLAUDE.md](../../CLAUDE.md) §14.1 / §20.1 |
| 风险等级 | P2（跨模块：变更 CI 检查逻辑 + 脚本 + 规则文档） |
| 前序 ADR | [ADR-004](ADR-004-ci-docs-quality-workflow.md)（CI docs-quality workflow） |

## 背景（Context）

ADR-004 建立的 CI docs-quality 三件套（markdownlint + lychee + consistency-check）已稳定运行，但在 Phase 4 算法深化交付过程中**反复出现子 Agent 生成报告时硬编码 `file:///` 绝对路径的问题**：

- **PR #25 / #26 / #27 均触发**：merge-sort / heap-sort / graph-traversal 三次交付的 guardrail-enforcer 与 ac-verifier 报告初版均包含形如 ` ` + `file:///` + ` ` + `D:/s0611/...` 的 Windows 盘符绝对路径
- **Linux CI 失败**：lychee 在 Ubuntu runner 上无法解析 Windows 盘符路径（`file:///` + 盘符 + `:/...`），导致 docs-quality workflow 阻塞合并
- **修复成本**：每次都需主 Agent 手动替换为相对路径并重新提交，增加 1-2 轮 CI 迭代

**根因**：子 Agent 在 Windows 环境生成报告时，倾向使用 `file:///` 绝对路径引用项目内文件（典型形态为 `[file](file:/// + 盘符 + :/项目路径)`）。当前 CI 三件套中：

- markdownlint 不检查路径格式
- lychee 能发现 `file:///` + 盘符路径不可达，但报错信息是"链接失败"而非"禁止绝对路径"，误导调试
- consistency-check.js 只检查 README 链接存在性、ADR/模板/报告命名，**不扫描全量 .md 文件的路径格式**

ADR-004 §"需要同步更新的文档或代码"已埋下伏笔："子 Agent 生成报告时**必须使用相对路径**，禁止 `file:///` + 盘符绝对路径"，但当时未落地为 CI 检查。

## 决策（Decision）

**在 `scripts/consistency-check.js` 新增第 5 项检查：`file:///` 绝对路径检测门禁。**

### D1. 检查逻辑

扫描项目内所有 `.md` 文件（排除 `node_modules` / `dist` / `.git` / `target` / `build` / `out` / `.trae` / `.idea` 等重型与 IDE 本地目录），使用正则 `\(file:\/\/\/[A-Za-z]` 匹配 **markdown 链接格式** `(file:///` + 盘符或路径首字母的绝对路径：

- **Windows 路径**：`[text](file:///` + `D:/path)`、`[text](file:///` + `C:\path)`
- **Linux 路径**：`[text](file:///` + `home/...)`、`[text](file:///` + `Users/...)`
- **通用匹配**：`(file:///` + 任意字母（盘符或路径首字母）

任何匹配即视为绝对路径链接并报错，列出文件路径与匹配行内容。

**不匹配的情况**（合法的描述性引用，保留不动）：

- 反引号包裹的 inline code（如 `file:///D:/path/to/file` 字面量举例，v2 已增强跳过）
- 代码块（``` 包裹的多行）内的描述性示例（v2 已增强跳过）
- 命令示例中的 `rg "file:///D:"` 字符串
- 经验卡片中描述踩坑时引用的 `file:///D:/...` 字面量

### D2. 设计取舍

| 设计点 | 选择 | 理由 |
| --- | --- | --- |
| 匹配范围 | markdown 链接括号后接 `file:///` + 字母 | 精准捕获真实链接（子 Agent 硬编码的 `[text]` 后跟 file 协议绝对路径），不误伤描述性引用（反引号内、代码块内、命令示例） |
| 扫描目录 | 递归扫描项目根，排除重型与 IDE 本地目录 | 避免 `node_modules` / `dist` / `.trae` 等干扰 |
| 错误定位 | 输出文件相对路径 + 匹配行内容 | 子 Agent 可直接定位并修复 |
| 严格度 | 任何 markdown 链接格式绝对路径即报错（无白名单） | 绝对路径在仓库内无合法用途，白名单会削弱门禁 |
| 与 lychee 互补 | lychee 检查链接可达，本检查检查链接格式 | lychee 报错信息是"链接失败"易误导，本检查直接报"禁止绝对路径" |

### D3. 失败行为

检查失败时 `consistency-check.js` 输出错误清单并 `exit 1`，触发 `docs-quality` workflow 失败，进而被 ADR-003 的 `required_status_checks` 拦截，PR 无法合并。子 Agent 必须将 `file:///` + 盘符路径替换为相对路径（如 `../../wiki/coding/foo.md`）后重新提交。

### D4. 与 lychee 的分工

- **consistency-check.js（本 ADR）**：检查"路径格式"——禁止 `file:///` 绝对路径
- **lychee（ADR-004 D5）**：检查"链接可达"——相对路径指向的文件必须存在

两者互补：lychee 能发现绝对路径不可达，但报错信息误导；本检查直接禁止绝对路径格式，错误信息清晰。即使未来 lychee 配置变化，本检查仍作为独立门禁守护路径格式规范。

## 备选方案（Alternatives）

| 方案 | 优点 | 缺点 / 否决理由 |
| --- | --- | --- |
| **consistency-check.js 新增检查**（选定） | 与现有三件套统一管理，零额外依赖，错误信息清晰 | 需维护扫描逻辑（已实现，约 25 行） |
| 增强 lychee 配置 | 复用现有工具 | lychee 报错信息是"链接失败"而非"禁止绝对路径"，误导调试；且 lychee 对 `file:///` 的处理依赖版本，不稳定 |
| Git pre-commit hook | 即时反馈 | 不强制，子 Agent 可绕过；CI 是最后一道门 |
| 自定义 ESLint 规则 | 可配置性强 | 引入新依赖，过重；本项目以 markdown 文档为主 |
| 仅靠 ADR-004 文档约定 | 零代码 | 无强制力，已证明子 Agent 会违反 |
| markdownlint 自定义规则 | 与 markdownlint 统一 | markdownlint 不擅长路径格式检查，自定义规则成本高 |

## 后果（Consequences）

### 正面后果

1. **CI 即时拦截**：子 Agent 生成含 `file:///` 绝对路径的报告时，CI 立即失败并给出清晰错误，避免 lychee 误导性报错
2. **减少 CI 迭代**：Phase 4 三次交付中每次都需 1-2 轮 CI 修复绝对路径，本门禁可在本地预验阶段捕获
3. **跨环境可移植性**：强制相对路径确保仓库在 Windows / Linux / macOS 任意环境克隆后路径均有效
4. **与 ADR-004 互补**：consistency-check.js 从"索引一致性"扩展为"索引一致性 + 路径格式"，CI 门禁体系更完整

### 负面后果 / 代价

1. **文档自指陷阱**：本 ADR 文档若需提到 `file:///` 作为概念，必须用反引号包裹且后跟空格/标点，避免触发自检。当前实现已考虑此情况（正则要求 `file:///` 后跟字母）
2. **子 Agent 适配成本**：子 Agent 生成报告时需学习相对路径写法（如 `../../wiki/coding/foo.md`），而非直接复制 Windows 路径
3. **维护成本**：新增约 25 行扫描逻辑，与 consistency-check.js 现有 4 项检查风格一致，维护负担低

### 需要同步更新的文档或代码

- [CLAUDE.md](../../CLAUDE.md) §14.1：检查项列表追加第 5 项
- [scripts/consistency-check.js](../../scripts/consistency-check.js)：新增 `checkFileAbsolutePath()` 函数
- 子 Agent 报告模板（`docs/templates/reports/*.md`）：可追加"路径规范"提示（可选，非强制）

## 验证

落地验证：

1. `node scripts/consistency-check.js` 通过（当前仓库无 `file:///` + 盘符绝对路径）
2. 故意在某 .md 文件中插入 `file:///` + `D:/test/path` 形态的绝对路径，运行检查应报错并 exit 1
3. CI `docs-quality` workflow 在 PR 触发时自动运行本检查

## 生命周期

- **Proposed**：本 ADR 随技术债务清理 PR 提交（PR #28）。
- **Accepted**：经 guardrail-enforcer 第二轮审查通过（TKN-TECH-DEBT-001）且 PR #28 合并后转为 Accepted（2026-07-26，commit 8c8d613）。
- **Superseded**：若未来引入更通用的路径规范检查（如禁止所有绝对 URL scheme），新建 ADR 取代。

## 参考

- [CLAUDE.md](../../CLAUDE.md) §14.1（CI 自动化一致性检查）、§20.1（运行时产物目录规范）
- [ADR-004](ADR-004-ci-docs-quality-workflow.md)：CI docs-quality workflow 三件套
- [ADR-003](ADR-003-vcs-github-flow-branch-protection.md)：分支保护（CI 是必需状态检查）
- [scripts/consistency-check.js](../../scripts/consistency-check.js)：本项目脚本
