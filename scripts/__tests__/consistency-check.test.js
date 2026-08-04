/**
 * consistency-check.js 工具数断言单测
 *
 * 使用 Node 内置测试运行器（node:test + node:assert），零依赖，无需安装。
 * 运行方式：`node --test scripts/__tests__/`
 *
 * 覆盖 validateToolCount 纯函数的所有分支：
 *   1. 英文 "N tools" 表述一致 → 无错误
 *   2. 中文 "N 个 MCP tools" 表述一致 → 无错误
 *   3. README 宣称数少于实际 → 报错
 *   4. ARCH 宣称数多于实际 → 报错
 *   5. 文档未提及工具数 → 跳过，无错误
 *   6. 取最大宣称值（历史阶段不误判）
 *   7. index.ts 无 server.tool 调用
 *   8. docs 为空对象 / indexTsContent 为空
 *   9. 多份文档同时不一致时分别报错
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateToolCount } = require('../consistency-check.js');

/** 构造含 n 次 `server.tool(` 调用的 index.ts 文本 */
function indexWithToolCount(n) {
  return Array(Number(n)).fill('server.tool(').join('\n');
}

describe('validateToolCount 工具数断言', () => {
  it('英文 "N tools" 表述与 index.ts 一致时无错误', () => {
    const errors = validateToolCount({
      indexTsContent: indexWithToolCount(17),
      docs: { 'README.md': '本模块注册 17 tools' },
    });
    assert.deepEqual(errors, []);
  });

  it('中文 "N 个 MCP tools" 表述一致时无错误', () => {
    const errors = validateToolCount({
      indexTsContent: indexWithToolCount(17),
      docs: { 'README.md': '当前注册 17 个 MCP tools' },
    });
    assert.deepEqual(errors, []);
  });

  it('同义表述 "N 个 tools" 一致时无错误', () => {
    const errors = validateToolCount({
      indexTsContent: indexWithToolCount(9),
      docs: { 'docs/ARCH.md': 'P3 增至 9 个 tools' },
    });
    assert.deepEqual(errors, []);
  });

  it('README 宣称数少于实际时报告 README.md 错误', () => {
    const errors = validateToolCount({
      indexTsContent: indexWithToolCount(17),
      docs: { 'README.md': '注册 16 tools' },
    });
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /^README\.md 宣称 16 个 MCP tools/);
    assert.match(errors[0], /实际注册 17 个/);
  });

  it('ARCH 宣称数多于实际时报告 docs/ARCH.md 错误', () => {
    const errors = validateToolCount({
      indexTsContent: indexWithToolCount(17),
      docs: { 'docs/ARCH.md': '注册 18 tools' },
    });
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /^docs\/ARCH\.md 宣称 18 个 MCP tools/);
    assert.match(errors[0], /实际注册 17 个/);
  });

  it('文档未提及工具数时跳过，不误报', () => {
    const errors = validateToolCount({
      indexTsContent: indexWithToolCount(17),
      docs: { 'README.md': '本模块无任何工具数声明' },
    });
    assert.deepEqual(errors, []);
  });

  it('取最大宣称值：历史阶段数字不误判当前状态', () => {
    // "P1: 8 tools" 与 "当前 17 个 MCP tools" 并存，应取 17
    const errors = validateToolCount({
      indexTsContent: indexWithToolCount(17),
      docs: {
        'README.md': '演进：P1 注册 8 tools，P3 增至 12 tools，当前 17 个 MCP tools',
      },
    });
    assert.deepEqual(errors, []);
  });

  it('index.ts 无 server.tool 调用时 actualCount=0', () => {
    // 文档宣称 0 个 tools（无调用数）也应一致
    const errors = validateToolCount({
      indexTsContent: 'import { Server } from "@modelcontextprotocol/sdk";',
      docs: { 'README.md': '注册 0 tools' },
    });
    assert.deepEqual(errors, []);
  });

  it('index.ts 无调用但文档宣称 >0 时报错', () => {
    const errors = validateToolCount({
      indexTsContent: '// 无任何 server.tool 注册',
      docs: { 'README.md': '注册 5 tools' },
    });
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /实际注册 0 个/);
  });

  it('docs 为空对象时无错误', () => {
    const errors = validateToolCount({
      indexTsContent: indexWithToolCount(17),
      docs: {},
    });
    assert.deepEqual(errors, []);
  });

  it('indexTsContent 为 undefined 时无错误（防御）', () => {
    const errors = validateToolCount({
      indexTsContent: undefined,
      docs: { 'README.md': '注册 0 tools' },
    });
    assert.deepEqual(errors, []);
  });

  it('多份文档同时不一致时分别报错', () => {
    const errors = validateToolCount({
      indexTsContent: indexWithToolCount(17),
      docs: {
        'README.md': '注册 16 tools',
        'docs/ARCH.md': '注册 18 个 MCP tools',
      },
    });
    assert.strictEqual(errors.length, 2);
    assert.match(errors[0], /README\.md/);
    assert.match(errors[1], /docs\/ARCH\.md/);
  });
});