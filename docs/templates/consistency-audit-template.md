# 文档与规则一致性审计报告 · 模板

> 复制本模板在里程碑或重大版本发布前执行一致性审计，存档于 `docs/reports/YYYY-MM-DD-<milestone>-audit.md`。
> 由主 Agent 或 functional-validation-auditor 执行（CLAUDE.md 第十四节 14.2）。

## 元信息

| 项目 | 内容 |
|---|---|
| 审计日期 | YYYY-MM-DD |
| 审计范围 | <里程碑名 / 版本号> |
| 审计员 | <主 Agent / functional-validation-auditor> |
| 任务令牌 | TKN-XXX-NNN（若由子 Agent 执行） |

## 1. ADR 与实际代码一致性

| ADR | 决策点 | 实际实现 | 一致性 | 偏差说明 |
|---|---|---|---|---|
| ADR-001 | A 部署形态 | | ✅/❌ | |

## 2. PRD 功能完整性

| US | 验收标准 | 实现状态 | 测试状态 | 偏差 |
|---|---|---|---|---|

## 3. ARCH 与代码结构一致性

| 组件 | ARCH 描述 | 实际路径 | 一致性 |
|---|---|---|---|

## 4. 文档索引有效性

- [ ] `README.md` 文档索引中每个相对链接指向的文件真实存在
- [ ] `docs/decisions/README.md` 包含所有 `ADR-*.md`
- [ ] `docs/templates/README.md` 包含所有 `*-template.md`
- [ ] `docs/reports/` 报告命名符合 `YYYY-MM-DD-<task>-<type>.md`

## 5. 引用链接可达性

- [ ] ADR 中的引用链接可达
- [ ] reports 中的链接可达

## 6. 发现的偏差与修复计划

| 偏差 | 严重度 | 修复项 | 负责人 | 截止 |
|---|---|---|---|---|

## 7. 审计结论

- [ ] **通过**：可进入下一里程碑
- [ ] **不通过**：必须修复上述偏差后方可推进
