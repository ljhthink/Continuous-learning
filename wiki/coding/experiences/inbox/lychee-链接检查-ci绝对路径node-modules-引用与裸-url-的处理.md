---
title: lychee 链接检查 CI：绝对路径、node_modules 引用与裸 URL 的处理
domain:
  - coding
type: experience
status: pending
confidence: 0.85
date: '2026-07-24'
source_task: TKN-CI-LYCHEE-FIX
---
## 背景

项目采用 lychee-action 做 markdown 链接检查 CI。首次运行出现 76 个错误，分三类：14 个外部链接 HTTP 错误（403/401/521）、约 60 个 Windows 绝对路径（`file:///D:/...`）、2 个错误的目标链接。后续多轮修复中又发现相对路径深度错误（报告位于 `docs/reports/`，到 `server/` 需 `../../server/`，误写 `server/` 被 lychee 解析为 `docs/reports/server/` 不存在）。

## 方案

1. **外部链接排除**：在 `lychee.toml` 的 `exclude` 列表追加不可达域名（如 flaticon.com、blog.csdn.net 等反爬虫站点），而非尝试修复无法控制的第三方 403
2. **绝对路径转相对路径**：报告中的 `file:///D:/...` 本地绝对路径全部改为相对路径，与仓库内其他报告的链接约定一致（`docs/reports/` 下的报告引用 `server/` 文件需 `../../server/`）
3. **node_modules 引用转行内代码**：`[package.json:38](server/node_modules/js-yaml/package.json#L38)` 这类指向 node_modules 的 markdown 链接改为反引号行内代码（lychee 不检查行内代码）
4. **裸 URL 用反引号包裹**：文档中举例用的 `file:///D:/` 会被 lychee 识别为裸链接，需用反引号包裹为行内代码
5. **lychee.toml 只用文档化选项**：不要在 regex 字段填 glob 模式，不要用无效的 `include_fragments` 值

## 证据

- CI 从 76 错误 → 0 错误，docs-quality workflow 通过
- `consistency-check.js` 作为补充检查验证相对链接可达性
- markdownlint 配合 MD032 等规则保证列表格式

## 适用场景

**适用**：任何使用 lychee 做链接检查的 markdown 文档项目；Windows 开发环境（绝对路径污染是 Windows 特有问题）。

**不适用**：纯外部链接检查不涉及本地文件路径的项目。

**经验**：lychee 把行内代码（反引号包裹）和 markdown 链接（`[text](url)`）区分对待——行内代码不检查。善用这一点可避免把所有 URL 都改成纯文本而损失可读性。
