# 文档模板索引

本目录存放所有文档模板。新增 PRD/ARCH/ADR/Task 时必须从对应模板复制开始。

## 模板列表

| 模板 | 用途 |
|---|---|
| [adr-template.md](adr-template.md) | 架构决策记录 |
| [prd-template.md](prd-template.md) | 产品需求文档 |
| [arch-template.md](arch-template.md) | 架构设计文档 |
| [performance-baseline-template.md](performance-baseline-template.md) | 性能基线记录（供 ac-verifier 对比） |
| [consistency-audit-template.md](consistency-audit-template.md) | 文档与规则一致性审计报告 |
| [error-code-registry-template.md](error-code-registry-template.md) | 错误码登记表 |

## 报告模板（reports/）

子 Agent 报告必须从 `reports/` 子目录对应模板复制，并包含任务令牌字段（CLAUDE.md 第二十节 20.4）。

| 模板 | 执行 Agent | 场景 |
|---|---|---|
| [reports/archaeology-template.md](reports/archaeology-template.md) | code-archaeologist | 源码探查 |
| [reports/guardrail-template.md](reports/guardrail-template.md) | guardrail-enforcer | 代码安全与质量审计 |
| [reports/acceptance-template.md](reports/acceptance-template.md) | ac-verifier | 验收测试 |
| [reports/debug-template.md](reports/debug-template.md) | 主 Agent（TRAE-debugger skill） | 运行时调试 |

## 使用规则

- 新增任何文档前，从对应模板复制，保留元信息表格与结论结构。
- 子 Agent 报告必须填写任务令牌（`TKN-XXX-NNN`），主 Agent 读取前验证令牌一致性。
- 性能基线存放于 `perf/baselines/` 或 `docs/reports/perf/`。
- 一致性审计报告在里程碑或重大版本前执行，存档于 `docs/reports/`。
