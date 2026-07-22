# 知识库时间日志

> append-only 日志，记录 ingest/query/lint/experience 事件。
> 内容索引见 [index.md](index.md)。结构约定见 [AGENTS.md](AGENTS.md)。
>
> 解析约定：每条以 `## [YYYY-MM-DD] <type> | <title>` 起始，
> 可用 `grep "^## \[" log.md | tail -5` 获取最近 5 条。

## [2026-07-22] init | 知识库初始化

- action: 创建知识库目录骨架与双索引
- domains: coding, emotions, reading
- wiki_pages: 0
