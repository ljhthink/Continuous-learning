# ADR-004: CI docs-quality workflow（markdownlint + lychee + consistency-check）

| 项目 | 内容 |
| --- | --- |
| 状态 | Proposed |
| 日期 | 2026-07-23 |
| 决策者 | 主 Agent（P2 CI 落地阶段） |
| 关联文档 | [CLAUDE.md](../../CLAUDE.md) §5.5（文档质量 CI）/ §14.1（一致性检查） / [ADR-003](ADR-003-vcs-github-flow-branch-protection.md)（分支保护必需状态检查） |
| 风险等级 | P2（跨模块：变更 DevOps/CI/CD 方案） |
| 前序 ADR | [ADR-001](ADR-001-knowledge-base-tech-stack.md)（技术栈） |

## 背景（Context）

CLAUDE.md §5.5 要求"所有 `.md` 文件必须通过 `markdownlint-cli2` 与 `lychee` 检查"，§14.1 进一步要求 `scripts/consistency-check.js` 作为 `.github/workflows/docs.yml` 的必需状态检查。P2 阶段将这套 CI 从"规则已写入文档"落地为"GitHub Actions 实际运行"。

**核心张力**：

1. **三件套各管一面**：markdownlint 管"格式规范"（如 MD022 段落空行、MD032 列表空行），lychee 管"链接可达"，consistency-check.js 管"索引一致性"（README 链接存在、ADR/模板/报告命名）。三者互补，缺一不可。
2. **本地 vs CI 版本差异**：本地 markdownlint v0.41 与 CI v0.40 在 MD032 判定上有细微差异，需以 CI 为准。
3. **lychee 外链可达性**：flaticon/unsplash/npmjs 等域名禁止 bot 访问返回 403/401，CSDN 服务器 521，claude.com 301 重定向未跟随——这些非真实死链，需在 `lychee.toml` 中 exclude。
4. **Windows 绝对路径陷阱**：子 Agent 生成报告时易硬编码 `file:///D:/s0611/...`，在 Linux CI 上路径不存在，lychee 报错。需用相对路径。

## 决策（Decision）

### D1. workflow 名为 `docs-quality`，触发条件双向

```yaml
on:
  pull_request:
    paths:
      - '**/*.md'
      - 'scripts/consistency-check.js'
      - '.github/workflows/docs.yml'
  push:
    branches: [main]
```

- **PR 触发**：改动 markdown / consistency-check / docs.yml 本身时触发，避免无关 PR 浪费 CI 资源。
- **push main 触发**：合并后回测，确保 main 始终 CI 绿。
- 运行环境：`ubuntu-latest` + Node 20。

### D2. 三个 job 顺序执行（实际为单 job 内串行 steps）

```text
checkout → setup-node → install markdownlint-cli2
  → markdownlint-cli2 '**/*.md'
  → node scripts/consistency-check.js
  → lycheeverse/lychee-action@v2 (--config lychee.toml '**/*.md', fail: true)
```

任一 step 失败则整个 workflow 失败，进而被 ADR-003 的 `required_status_checks` 拦截，PR 无法合并。

### D3. markdownlint 配置（`.markdownlint.json`）

```json
{
  "default": true,
  "MD013": false,
  "MD033": false,
  "MD041": false,
  "MD034": false,
  "MD024": { "siblings_only": true },
  "MD060": false,
  "MD036": false
}
```

**关闭规则的理由**：

| 规则 | 关闭理由 |
| --- | --- |
| MD013（line-length） | 强制 80 字符换行破坏可读性，现代编辑器自动换行 |
| MD033（no-inline-html） | 知识库报告需用 `<details>` / `<sup>` 等 HTML 增强表达 |
| MD041（first-line-h1） | 部分 frontmatter 后紧跟表格的页面 |
| MD034（no-bare-urls） | 允许裸 URL，与 Obsidian 风格一致 |
| MD024（no-duplicate-headers） | `siblings_only: true`，允许不同层级同名标题 |
| MD060（no-punctuation-at-end-of-header） | 中文标题常用顿号、冒号收尾 |
| MD036（no-emphasis-as-heading） | 允许用粗体代替小标题 |

### D4. consistency-check.js 四项检查

1. **README 相对链接检查**：解析 `README.md` 中所有 `](path.md)` 链接，跳过外链，验证文件存在。
2. **decisions 索引检查**：`docs/decisions/` 下每个 `ADR-*.md` 必须被 `docs/decisions/README.md` 引用。
3. **templates 索引检查**：`docs/templates/` 下每个 `*-template.md` 必须被 `docs/templates/README.md` 引用。
4. **reports 命名检查**：`docs/reports/` 下除 `README.md` 外的文件必须匹配 `^\d{4}-\d{2}-\d{2}-.+\.md$`。

任一检查失败，输出错误清单并 exit 1。

### D5. lychee 配置（`lychee.toml`）

```toml
exclude = [
  'localhost',
  '127\.0\.0\.1',
  'flaticon\.com',
  'lottiefiles\.com',
  'pixabay\.com',
  'unsplash\.com',
  'pexels\.com',
  'texturelabs\.org',
  'blog\.csdn\.net',
  'support\.claude\.com',
  'npmjs\.com',
]
timeout = 20
max_retries = 2
accept = [200, 206, 429]
include_fragments = "none"
```

**关键决策**：

- **exclude 用域名而非 exclude_path**：域名排除只跳过外链 HTTP 检查，本地相对路径链接仍被检查。若用 `exclude_path` 排除报告文件，会跳过本地链接检查，无法发现路径错误。
- **TOML literal string（单引号 `'...'`）**：避免反斜杠转义，`'flaticon\.com'` 作为 regex 时 `\.` 匹配字面量点号。
- **`include_fragments = "none"`**：跳过 GitHub 锚点检查（fragment 通常需 JS 渲染）。
- **`accept = [200, 206, 429]`**：429（rate limit）视为可接受，避免误报。

## 备选方案（Alternatives）

| 方案 | 优点 | 缺点 / 否决理由 |
| --- | --- | --- |
| **三件套（markdownlint + lychee + consistency-check）**（选定） | 三层互补，覆盖格式/链接/索引 | 配置项多，初学者上手成本中等 |
| 仅 markdownlint | 单一工具，配置简单 | 无法发现死链与索引不一致 |
| 仅 lychee | 链接可达性最强 | 无法检查格式与索引 |
| Vale | 文风/术语检查强大 | 偏向"语气"而非"格式/链接"，且需额外配置 |
| markdownlint + lychee（无 consistency-check） | 双工具 | 索引不一致（如 ADR 未登记）无法发现 |
| 自建 Node 脚本全检 | 灵活 | 维护成本高，重复造轮子 |
| 预提交 hook（pre-commit）而非 CI | 即时反馈 | 不强制，子 Agent 可绕过；CI 是最后一道门 |
| 用 Super-Linter 综合套件 | 一键全检 | 资源占用大，本项目仅 markdown 文档场景过重 |

## 后果（Consequences）

### 正面后果

1. **CI 第 7 次跑绿**：经过 7 轮迭代，76 个 lychee 错误 + MD036/MD026/MD040/MD056/MD032 全部修复，CI 稳定通过。
2. **绝对路径绝迹**：通过 lychee 反向逼迫所有报告使用相对路径，跨环境可移植性大幅提升。
3. **索引一致性自动化**：consistency-check.js 防止"新建 ADR/模板/报告但忘记登记索引"的低级错误。
4. **与分支保护联动**：CI 是 ADR-003 `required_status_checks` 的唯一 context，CI 失败则 PR 无法合并。

### 负面后果 / 代价

1. **lychee exclude 维护**：每遇到一个新的"返回 403 但实际可访问"的域名，都需追加到 `lychee.toml` exclude 列表。当前 11 个域名（`localhost`、`127.0.0.1`、`flaticon.com`、`lottiefiles.com`、`pixabay.com`、`unsplash.com`、`pexels.com`、`texturelabs.org`、`blog.csdn.net`、`support.claude.com`、`npmjs.com`）是历史经验沉淀。其中 `pexels.com` 与 `texturelabs.org` 是 ARCH.md §7.2.2 图像资源表格中的素材库链接，分别返回 403（禁止 bot）与 202（Accepted，未在 `accept` 列表中），按素材库同类策略 exclude。
2. **版本差异**：本地 markdownlint v0.41 与 CI v0.40 在 MD032 判定上有细微差异，需以 CI 为准。
3. **本地预验负担**：开发者（或子 Agent）在 push 前需运行 `markdownlint-cli2` + `node scripts/consistency-check.js`，否则 CI 失败阻塞合并。
4. **`**/*.md` 扫描 `server/node_modules/`**：本地若误用 `**/*.md` 会扫到第三方库 README 报无关错误；需用 `git ls-files "*.md"` 模拟 CI 行为。

### 需要同步更新的文档或代码

- [CLAUDE.md](../../CLAUDE.md) §5.5：本 ADR 落地后，CI 配置从"规则"变为"实际运行"，无需修改规则本身。
- 新增 report 时必须遵守 `YYYY-MM-DD-<task>-<type>.md` 命名规范，否则 consistency-check.js 失败。
- 子 Agent 生成报告时**必须使用相对路径**，禁止 `file:///D:/...` 绝对路径（lychee 在 Linux CI 会报错）。

## 验证

落地验证（P2 阶段已完成）：

1. `gh run list --workflow=docs-quality --limit=5` 显示最新 1 次 success（commit `8e79439`）✓
2. 本地预验：`markdownlint-cli2 $(git ls-files "*.md")` 0 issues；`node scripts/consistency-check.js` 通过 ✓
3. `rg "file:///D:" --type md` 无匹配 ✓
4. 分支保护 `required_status_checks.contexts = ["docs-quality"]` 已生效 ✓

## 生命周期

- **Proposed**：本 ADR 随 P2 收尾 PR 提交。
- **Accepted**：经 guardrail-enforcer 审查通过且 PR 合并后转为 Accepted（CLAUDE.md §17.3）。说明：本 ADR 的"转 Accepted"与 PR 合并存在顺序依赖——guardrail 审查通过是 PR 合并的前置条件，PR 合并是 ADR 转 Accepted 的前置条件，二者构成顺序链而非循环依赖。
- **Superseded**：若未来引入代码类 CI（如 npm test、tsc、安全扫描），新建 ADR-006 取代。

## 参考

- [CLAUDE.md](../../CLAUDE.md) §5.5（文档质量 CI）、§14.1（CI 自动化一致性检查）
- [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2)
- [lycheeverse/lychee-action](https://github.com/lycheeverse/lychee-action)
- [lychee.toml](../../lychee.toml)（本项目配置）
- [.markdownlint.json](../../.markdownlint.json)（本项目配置）
- [scripts/consistency-check.js](../../scripts/consistency-check.js)（本项目脚本）
- [ADR-003](ADR-003-vcs-github-flow-branch-protection.md)：分支保护（CI 是必需状态检查）
