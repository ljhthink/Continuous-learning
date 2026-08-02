---
title: GitHub Actions shell 注入防护：用 env 块替代内联 ${{ }} 表达式
domain: [coding]
type: experience
status: active
confidence: 0.9
date: 2026-08-02
source_task: task-missing-features-2026-08-02
---

## 背景

在 Continuous-learning 项目的 `.github/workflows/kb-maintenance.yml` 定时维护 workflow 中，最初直接在 shell 脚本内联使用 `${{ github.event_name }}`、`${{ github.repository }}`、`${{ inputs.task }}` 等 GitHub 表达式。

guardrail-enforcer 审计标记为中危 M-1：GitHub Security Lab 已知反模式。虽然当前所有值均为 GitHub 控制值或 choice 枚举（不可利用），但若未来某个值变为用户可控（如 issue 标题、PR 分支名），会构成 shell 注入。

## 方案

用 `env:` 块将 GitHub 表达式注入为环境变量，shell 内改用 `$VAR` 引用：

```yaml
- name: Run kb_lint
  working-directory: server
  env:
    # GitHub context via env, not inline ${{ }} in shell (GitHub Security Lab recommendation)
    EVENT_NAME: ${{ github.event_name }}
    REPOSITORY: ${{ github.repository }}
    REF_NAME: ${{ github.ref_name }}
    SHA: ${{ github.sha }}
  run: |
    echo "| 触发 | $EVENT_NAME |"
    echo "| 仓库 | $REPOSITORY |"
```

关键点：
- `env:` 块的 `${{ }}` 赋值由 GitHub Actions 运行时直接注入环境，不经过 shell 解析，天然防注入。
- shell 内 `$VAR` 是 POSIX 变量展开，即使值含 `;` `$(...)` 等特殊字符也不会被解释为命令。
- 同样适用 `inputs.*`：`INPUT_TASK: ${{ inputs.task }}` → `TASK="$INPUT_TASK"`。
- `with:` 块中的 `${{ }}`（如 `name: artifact-${{ matrix.task }}`）不受此问题影响，因为不经过 shell。

## 证据

- 修复后 YAML 通过 `js-yaml` 解析校验，jobs/on 结构完整。
- guardrail-enforcer M-1 复审：所有 shell 步骤的 `${{ }}` 内联均已改为 `env:` 块 + `$VAR` 引用。
- 215 项单元测试 + TS 零错误不受影响（CI 文件不影响 server 代码）。

## 适用场景

- 所有 GitHub Actions workflow 中 `run:` 步骤使用 GitHub 表达式的场景。
- 特别是引用 `github.event.*`（可能含 PR/issue 用户可控内容）、`inputs.*`（workflow_dispatch 输入）的步骤。
- `permissions: contents: read` 最小权限 + `env:` 块 = CI 安全基线。

不适用：`with:`、`if:`、`name:` 等非 shell 上下文中的 `${{ }}`（由 GitHub 运行时直接处理，无注入风险）。