# 错误码登记表 · 模板

> 复制本模板创建 `docs/error-code-registry.md`，登记全局错误码。
> 错误码格式：`ERR-<域>-<序号>`（CLAUDE.md 第十九节 19.2）。

## 错误码规范

- 格式：`ERR-<域>-<序号>`，如 `ERR-AUTH-001`、`ERR-KB-001`
- 全局唯一，新增需在此表登记
- 错误返回必须包含 `error_code` 和 `message`，不包含内部堆栈或路径

## 错误码清单

| 错误码 | 域 | HTTP 状态（如适用） | message（用户可见） | 说明（内部） | 引入版本 |
| --- | --- | --- | --- | --- | --- |
| ERR-KB-001 | knowledge-base | - | 知识库未初始化 | 仓库目录不存在或无 index.md | v0.1.0 |
| ERR-KB-002 | knowledge-base | - | 检索引擎不可用 | qmd/LanceDB 未配置 | v0.1.0 |
| ERR-KB-003 | knowledge-base | - | 解析失败 | 文件格式不支持或损坏 | v0.1.0 |
| ERR-KB-004 | knowledge-base | - | 经验卡片审核未通过 | confidence 过低或重复 | v0.1.0 |
| ERR-PARSE-001 | parser | - | PDF 解析失败 | MinerU 调用异常 | v0.1.0 |
| ERR-PARSE-002 | parser | - | Word 解析失败 | office2md/mammoth 异常 | v0.1.0 |
| ERR-PARSE-003 | parser | - | Excel 解析失败 | pandas/openpyxl 异常 | v0.1.0 |
