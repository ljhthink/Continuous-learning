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

## [2026-07-24] experience | js-yaml 5 MAJOR 升级：load() 空字符串行为变化与 try/catch 降级

- inbox: wiki/coding/experiences/inbox/js-yaml-5-major-升级load-空字符串行为变化与-trycatch-降级.md
- confidence: 0.9
- source_task: TKN-DEPS-UPGRADE-001

## [2026-07-24] experience | lychee 链接检查 CI：绝对路径、node_modules 引用与裸 URL 的处理

- inbox: wiki/coding/experiences/inbox/lychee-链接检查-ci绝对路径node-modules-引用与裸-url-的处理.md
- confidence: 0.85
- source_task: TKN-CI-LYCHEE-FIX

## [2026-07-24] experience | MCP server 新增工具后客户端描述符缓存过期：需重连刷新才能发现

- inbox: wiki/coding/experiences/inbox/mcp-server-新增工具后客户端描述符缓存过期需重连刷新才能发现.md
- confidence: 0.8
- source_task: TKN-MILESTONE-AUDIT-001

## [2026-07-24] promote | js-yaml 5 MAJOR 升级：load() 空字符串行为变化与 try/catch 降级

- promoted: wiki/coding/experiences/js-yaml-5-major-升级load-空字符串行为变化与-trycatch-降级.md
- from_inbox: wiki/coding/experiences/inbox/js-yaml-5-major-升级load-空字符串行为变化与-trycatch-降级.md
- tier: auto
- confidence: 0.9
