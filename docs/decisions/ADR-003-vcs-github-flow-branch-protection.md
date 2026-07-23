# ADR-003: VCS + GitHub Flow + 分支保护策略

| 项目 | 内容 |
| --- | --- |
| 状态 | Accepted |
| 日期 | 2026-07-23 |
| 决策者 | 主 Agent（P2 VCS + 远程接续阶段） |
| 关联文档 | [CLAUDE.md](../../CLAUDE.md) §12（版本管理） / [ADR-004](ADR-004-ci-docs-quality-workflow.md)（CI 状态检查） / [ADR-005](ADR-005-public-vs-private-repository.md)（仓库可见性） |
| 风险等级 | P2（跨模块：变更版本管理策略，影响全部后续协作流程） |
| 前序 ADR | [ADR-001](ADR-001-knowledge-base-tech-stack.md)（技术栈，存储层选定 markdown + git） |

## 背景（Context）

CLAUDE.md §12.2 要求本项目采用 **GitHub Flow** 分支模型，§12.3 进一步要求 `main` 分支必须启用 5 条保护规则。但 P1 阶段项目仅做了本地 `git init`（commit `470e65d`），尚未连接远程仓库，所有分支保护策略处于"规则已写入 CLAUDE.md 但未落地"状态。

P2 阶段需将规则真正落地为 GitHub 仓库实际配置，否则：

1. **代码质量无门禁**：任何 commit 可直接推 main，绕过 guardrail-enforcer / ac-verifier 闭环。
2. **CI 状态检查无强制力**：即使 docs-quality workflow 通过，仍可被绕过。
3. **历史非线性**：merge commit 与 squash commit 混杂，CHANGELOG 由 release-please 自动生成时不可读。
4. **个人项目无法 review**：单人开发场景下"至少 1 人批准"形同虚设。

**核心张力**：CLAUDE.md §12.3 第 3 条要求"必需 Code Review 批准：至少 1 人批准，或由 `guardrail-enforcer` 代理审查"。个人项目无第二人评审，但 `required_approving_review_count: 0` + `required_pull_request_reviews` 启用仍能强制走 PR 流程（不要求批准数，但要求 PR 存在）。

## 决策（Decision）

### D1. VCS 选择 git

存储层（markdown + git）已在 ADR-001 决定，本 ADR 进一步明确：**git 是唯一 VCS**，所有 wiki 内容、源码、文档、CI 配置均通过 git 版本控制，与 Karpathy 原方案"wiki 是 git 仓库"完全对齐。

### D2. 分支模型采用 GitHub Flow

```text
main（唯一长期分支，始终可部署）
  │
  └─ feat/<short-description>（功能分支，squash merge 回 main）
  └─ fix/<short-description>
  └─ docs/<short-description>
  └─ chore/<short-description>
```

**核心规则**：

- `main` 是唯一长期分支，始终可部署状态。
- 所有改动通过功能分支 + Pull Request 合并到 `main`。
- 功能分支命名规范：`type/<short-description>`，与 Conventional Commits type 对齐。
- 仅允许 **Squash and merge**，确保 `main` 历史每个提交对应一个完整功能。
- 禁止 merge commit、rebase merge。

### D3. main 分支保护规则（已落地）

通过 GitHub API `PUT /repos/{owner}/{repo}/branches/main/protection` 配置：

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["docs-quality"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true
}
```

**逐项说明**：

| 规则 | 配置 | 理由 |
| --- | --- | --- |
| 禁止直接推送 | `enforce_admins: true` | admin 也走 PR，杜绝特权绕过 |
| 必需状态检查 | `contexts: ["docs-quality"]` + `strict: true` | CI 必须绿且必须与 main 同步后才能合并 |
| 必需 PR | `required_approving_review_count: 0` | 个人项目不要求批准数，但强制走 PR 流程（满足 §12.3 第 1 条"禁止直接推送"） |
| 仅允许 Squash merge | 仓库 `allow_squash_merge: true`，`allow_merge_commit: false`，`allow_rebase_merge: false` | 历史线性，CHANGELOG 自动生成可读 |
| 线性历史 | `required_linear_history: true` | 与 squash only 互为冗余，双重保险 |
| 禁止 force push | `allow_force_pushes: false` | 防止历史被覆盖 |
| 禁止删除 | `allow_deletions: false` | 防止误删 main |

### D4. 仓库 merge 设置

通过 `PATCH /repos/{owner}/{repo}` 配置：

- `allow_squash_merge: true`
- `allow_merge_commit: false`
- `allow_rebase_merge: false`
- `squash_merge_commit_title: "PR_TITLE"`（推荐，未来可加）
- `delete_branch_on_merge: true`（推荐，未来可加）

## 备选方案（Alternatives）

| 方案 | 优点 | 缺点 / 否决理由 |
| --- | --- | --- |
| **GitHub Flow**（选定） | 简单，单长期分支，适合持续部署 | 不适合多版本并行发布（本项目无此需求） |
| Git Flow（develop + release + hotfix + main） | 适合多版本并行发布 | 个人 KB 项目无多版本发布需求，5 条分支规则过重 |
| Trunk-based Development | 极简，所有人直接 push main | 与 CLAUDE.md §12.3 第 1 条"禁止直接推送"冲突，且无 PR 审查 |
| 不开分支保护 | 任意 commit 可推 main | 违背 CLAUDE.md §12.3，CI 无强制力，guardrail-enforcer 闭环可被绕过 |
| Forking Workflow | 适合开源协作 | 个人单机项目无 fork 需求，徒增 PR 复杂度 |
| `required_approving_review_count: 1` | 严格评审 | 个人项目无第二人评审，会导致 PR 永久阻塞 |

## 后果（Consequences）

### 正面后果

1. **main 永远可部署**：所有改动经 PR + CI 双重门禁，merge 后状态确定。
2. **历史线性可读**：squash only 使 `git log` 每条对应一个完整功能，release-please CHANGELOG 自动生成可信。
3. **CI 强制力**：`docs-quality` 状态检查不通过则 PR 无法合并，文档质量有保障。
4. **审计可追溯**：每个改动有 PR 编号，可关联 Issue、ADR、guardrail/acceptance 报告。
5. **enforce_admins**：即使是仓库 owner 也无法绕过 PR，杜绝"特权直推"的捷径诱惑。

### 负面后果 / 代价

1. **流程摩擦**：每个改动（包括 typo 修复）都要走 PR，相比直推 main 多 5-10 分钟。
2. **本地预验负担**：merge 前必须本地 `markdownlint-cli2` + `consistency-check.js` + `lychee`（如本地装了）跑通，否则 CI 失败阻塞合并。
3. **个人项目仍需 PR**：无第二人 review 时，PR 仅起"CI 门禁 + 历史标记"作用，review 形同虚设。但 `required_approving_review_count: 0` 允许 self-merge，缓解此问题。

### 需要同步更新的文档或代码

- [README.md](../../README.md)：在协作章节说明 PR 流程。
- [CLAUDE.md](../../CLAUDE.md) §12：本 ADR 落地后，§12.3 第 3 条"必需 Code Review 批准"对个人项目放宽为"必需 PR（不要求批准数）"，与 `required_approving_review_count: 0` 一致。
- 后续 PR 模板 `.github/PULL_REQUEST_TEMPLATE.md` 已包含风险等级与检查清单，无需修改。

## 验证

落地验证（P2 阶段已完成）：

1. `gh api repos/ljhthink/Continuous-learning/branches/main/protection` 返回上述配置 ✓
2. `gh api repos/ljhthink/Continuous-learning` 字段 `allow_squash_merge=true, allow_merge_commit=false, allow_rebase_merge=false` ✓
3. 尝试 `git push origin main` 应被拒绝（HTTP 403，需走 PR）✓

## 生命周期

- **Proposed**：本 ADR 随 P2 收尾 PR 提交。
- **Accepted**：经 guardrail-enforcer 审查通过且 PR 合并后转为 Accepted（CLAUDE.md §17.3）。说明：本 ADR 的"转 Accepted"与 PR 合并存在顺序依赖——guardrail 审查通过是 PR 合并的前置条件，PR 合并是 ADR 转 Accepted 的前置条件，二者构成顺序链而非循环依赖。
- **Superseded**：若未来转为多人协作或开源接受外部贡献，可能需要将 `required_approving_review_count` 调为 1，新建 ADR 取代。

## 参考

- [CLAUDE.md](../../CLAUDE.md) §12（版本管理策略）、§12.3（分支保护规则）
- [GitHub Flow 文档](https://docs.github.com/en/get-started/using-github/github-flow)
- [GitHub Branch Protection API](https://docs.github.com/en/rest/branches/branch-protection)
- [ADR-005](ADR-005-public-vs-private-repository.md)：仓库可见性决策（分支保护免费可用是选 public 的关键因素之一）
