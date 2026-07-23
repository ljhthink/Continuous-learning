# ADR-005: public 仓库决策（vs private + GitHub Pro）

| 项目 | 内容 |
| --- | --- |
| 状态 | Proposed |
| 日期 | 2026-07-23 |
| 决策者 | 主 Agent（P2 分支保护落地阶段，经用户确认） |
| 关联文档 | [CLAUDE.md](../../CLAUDE.md) §12.3（分支保护）/ §20.3（密钥管理）/ [ADR-003](ADR-003-vcs-github-flow-branch-protection.md)（分支保护策略） |
| 风险等级 | P2（跨模块：变更 DevOps 部署方案，影响安全态势与协作模式） |
| 前序 ADR | [ADR-003](ADR-003-vcs-github-flow-branch-protection.md)（分支保护，触发本决策） |

## 背景（Context）

P2 阶段尝试通过 `PUT /repos/ljhthink/Continuous-learning/branches/main/protection` 为 main 分支启用保护规则，GitHub API 返回 **HTTP 403**：

```text
"message": "Upgrade to GitHub Pro or make this repository public to enable this feature"
```

**核心张力**：

1. **CLAUDE.md §12.3 强制要求分支保护**：禁直接推送、必需状态检查、必需 review、squash only——这些规则写入 CLAUDE.md 后必须在 GitHub 实际落地，否则规则形同虚设。
2. **private 仓库的分支保护需 GitHub Pro**：付费方案（个人 $4/月，2026 年定价）。本项目是个人知识库，无收入场景，付费违背"轻量、低成本"原则。
3. **public 仓库的分支保护免费**：GitHub 对 public 仓库免费提供所有 branch protection 功能。
4. **公开即暴露**：仓库一旦 public，commit 作者邮箱、提交历史、机器特定路径（如已通过相对路径缓解）等将永久公开，无法"撤回"。

## 决策（Decision）

### D1. 仓库改为 public

通过 `PATCH /repos/ljhthink/Continuous-learning -F private=false` 将仓库可见性从 private 改为 public。

### D2. 改 public 前的安全确认

在改 public 之前，已完成以下安全扫描：

| 检查项 | 方法 | 结果 |
| --- | --- | --- |
| 硬编码密钥/token | ripgrep 正则扫描（命令见下方"密钥扫描命令"代码块） | 无敏感信息泄露 ✓ |
| `.env` 文件 | `Test-Path .env` 等 | 不存在，仅 `.env.example`（模板无真实值）✓ |
| 机器特定敏感路径 | `rg "file:///D:/s0611/" --type md` | 已全部改为相对路径（commit `6808e30`）✓ |
| SSH 私钥 | `.ssh/` 不在仓库内 | 无泄露风险 ✓ |
| GitHub token | 凭证存储在 `~/.config/gh/` 或 Windows Credential Manager，不入仓库 | 无泄露风险 ✓ |
| 第三方 API 凭证 | 无（MCP server 是本地 stdio，无云 API） | 无泄露风险 ✓ |

**密钥扫描命令**（注：因 markdown 表格中 `|` 是列分隔符，命令无法在表格单元格内正确显示，故移至此代码块）：

```bash
# PowerShell / bash 通用写法（单引号包裹 + 移除反斜杠转义）
# 注意：PowerShell 单引号仅阻止 PowerShell 解释管道符，但 ripgrep Rust 正则引擎
# 仍将 \| 解释为字面量管道符，必须移除 \ 使 | 成为 alternation
rg -i 'api[_-]?key|secret|token|password' --type-add 'cfg:*.{ts,js,json,toml,yml,yaml,md}' -t cfg
```

guardrail-enforcer 已用上述正确语法独立复核，匹配 32 行均为讨论性提及（如本 ADR 自身的描述性引用、CLAUDE.md/ADR 密钥规则、`search.ts` 的 `tokenize` 函数名等），无 `sk-`/`ghp_`/`AKIA`/`-----BEGIN` 等真实凭证泄露。

### D3. public 仓库可接受性论证

本项目改 public 后，以下信息将公开，但均为可接受：

| 公开信息 | 可接受性论证 |
| --- | --- |
| commit 作者邮箱（`2802250097@qq.com`） | 个人邮箱公开是 GitHub 默认行为，可通过 `git config user.email` 改为 GitHub noreply 邮箱（`<id>+<username>@users.noreply.github.com`）规避，本次未改是因已习惯 QQ 邮箱 |
| 知识库内容（wiki/、raw/、docs/） | 知识库本身设计为公开复利产物（Karpathy 原方案核心），无个人隐私 |
| 代码（server/、scripts/） | MCP server 实现无商业价值，开源可被社区复用 |
| 历史提交记录 | 全部为开发过程记录，无敏感操作 |
| 仓库地址 `github.com/ljhthink/Continuous-learning` | 个人项目公开符合"分享复利"理念 |

## 备选方案（Alternatives）

| 方案 | 优点 | 缺点 / 否决理由 |
| --- | --- | --- |
| **public 仓库**（选定） | 分支保护免费、社区可见、可被引用、与 Karpathy"开源复利"理念一致 | commit 邮箱公开、机器特定路径暴露（已通过相对路径缓解） |
| private + GitHub Pro（$4/月） | 信息不公开、分支保护可用 | 个人 KB 无收入场景付费违背轻量原则；持续订阅成本累积 |
| private 不开分支保护 | 免费 | 违背 CLAUDE.md §12.3，guardrail-enforcer 闭环可被绕过，CI 无强制力 |
| private + 自建 Gitea/GitLab | 完全自主 | 需运维服务器（24/7 在线）、维护成本高、失去 GitHub Actions 免费额度 |
| private + 仅开 `required_status_checks`（不开 `required_pull_request_reviews`） | 部分免费 | 仍需 GitHub Pro（branch protection API 整体付费） |
| 多账号 self-review 满足 `required_approving_review_count: 1` | 满足严格 review | 操作繁琐，且仍需 Pro |
| 迁移到 GitLab.com public | 同样免费分支保护 | 失去 GitHub 生态（gh CLI、Dependabot、release-please 集成成本高） |
| 迁移到 Codeberg.org public | 完全免费无广告 | 社区小、CI 配置不同、迁移成本 |

## 后果（Consequences）

### 正面后果

1. **分支保护免费可用**：ADR-003 的 5 条保护规则全部落地，无月费成本。
2. **CI 额度充足**：public 仓库 GitHub Actions 免费额度远超个人项目所需（public 不计费）。
3. **社区可见**：知识库作为"持续进化个人 KB 系统"的参考实现，可被社区引用与学习。
4. **与 Karpathy 理念对齐**：原方案明确"wiki 是持久复利、人类可读、vendor-neutral 产物"，公开仓库强化这一属性。
5. **备份与迁移友好**：public 仓库可被任意人 fork，作为额外的"分布式备份"。

### 负面后果 / 代价

1. **commit 邮箱永久公开**：`2802250097@qq.com` 进入公开历史，无法"撤回"（即使未来改邮箱，旧 commit 仍含旧邮箱）。
   - **缓解**：未来可通过 `git config user.email "<id>+ljhthink@users.noreply.github.com"` 切换为 GitHub noreply 邮箱，新 commit 不再暴露 QQ 邮箱。
2. **机器特定路径暴露风险**：若未来子 Agent 再次硬编码 `file:///D:/s0611/...`，将公开本地开发路径。
   - **缓解**：lychee CI 检查 + 子 Agent 报告模板要求相对路径（见 ADR-004）。
3. **知识库内容公开**：raw/ 下原始资料若含个人信息（如笔记、截图），将泄露。
   - **缓解**：raw/ 资料由用户主动投放，用户对内容负责；本次改 public 前已扫描无敏感信息。
4. **GitHub 账号被关联**：commit 历史 + 仓库地址可关联到 GitHub 账号 `ljhthink`，进而关联到个人信息。
   - **缓解**：个人 GitHub 账号本就用于公开协作，无隐私期待。
5. **依赖 GitHub 平台风险**：GitHub 政策变更（如限流、TOS 变更）可能影响仓库可用性。
   - **缓解**：git 是分布式 VCS，可随时 `git remote add` 迁移到其他平台；本地完整副本始终存在。

### 需要同步更新的文档或代码

- [README.md](../../README.md)：可在"项目状态"章节标注"public 仓库"。
- [CLAUDE.md](../../CLAUDE.md) §20.3：密钥管理章节强调 public 仓库下"禁止硬编码任何密钥"的强制力更强，无需修改规则本身。
- 子 Agent 报告模板（`docs/templates/reports/`）：明确"public 仓库下，禁止在报告中包含本地绝对路径、机器特定配置、未脱敏的个人信息"。

## 验证

落地验证（P2 阶段已完成）：

1. `gh api repos/ljhthink/Continuous-learning --jq '.private'` 返回 `false` ✓
2. `gh api repos/ljhthink/Continuous-learning/branches/main/protection` 返回完整保护配置（HTTP 200，非 403）✓
3. 仓库页面 `https://github.com/ljhthink/Continuous-learning` 公开可访问 ✓
4. 安全扫描：`rg -i 'api[_-]?key|secret|token|password' --type-add 'cfg:*.{ts,js,json,toml,yml,yaml,md}' -t cfg` 无敏感信息泄露 ✓（guardrail-enforcer 独立复核，原 ADR 草稿中 `\|` 转义 bug 已修正）
5. 绝对路径扫描：`rg "file:///D:/s0611/" --type md` 无 markdown 链接以绝对路径形式残留 ✓（排除 ADR 内部对扫描命令的描述性引用）

## 生命周期

- **Proposed**：本 ADR 随 P2 收尾 PR 提交。
- **Accepted**：经 guardrail-enforcer 审查通过且 PR 合并后转为 Accepted（CLAUDE.md §17.3）。说明：本 ADR 的"转 Accepted"与 PR 合并存在顺序依赖——guardrail 审查通过是 PR 合并的前置条件，PR 合并是 ADR 转 Accepted 的前置条件，二者构成顺序链而非循环依赖。
- **Superseded**：若未来以下任一情况发生，需新建 ADR 取代：
  1. 仓库引入商业敏感代码（如付费 API、客户数据），需转回 private + Pro。
  2. 知识库内容含个人隐私资料，需转回 private。
  3. GitHub 政策变更导致 public 仓库无法满足需求。

## 参考

- [CLAUDE.md](../../CLAUDE.md) §12.3（分支保护规则）、§20.3（密钥管理）
- [GitHub Branch Protection API](https://docs.github.com/en/rest/branches/branch-protection)
- [GitHub Pro 计划](https://github.com/pricing)（分支保护 private 仓库需 Pro）
- [ADR-003](ADR-003-vcs-github-flow-branch-protection.md)：分支保护策略（本决策的直接触发原因）
- [karpathy-LLM.md](../../karpathy-LLM.md) §"wiki 是持久复利"（公开仓库符合原方案理念）
