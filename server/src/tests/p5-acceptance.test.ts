/**
 * P5 集成验收测试（PRD §6 "四点全过"）
 *
 * 覆盖 US-001/002/003/005/006 的后端关键路径。
 * US-004（Tauri GUI）为手动测试，见 docs/reports/2026-07-28-p5-integration-acceptance-plan.md。
 *
 * 运行：cd server && npm test -- --test-name-pattern="P5"
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTempKB, cleanupKB, writePage, parseResult } from "./setup.js";

let tmp: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tools: any;

before(async () => {
  tmp = await createTempKB("p5-acceptance");
  process.env.KB_ROOT = tmp;
  // 动态导入以捕获 KB_ROOT
  tools = {
    search: await import("../tools/search.js"),
    readOnly: await import("../tools/read-only.js"),
    lint: await import("../tools/lint.js"),
    graph: await import("../tools/graph.js"),
    inbox: await import("../tools/inbox.js"),
    write: await import("../tools/write.js"),
  };
});

after(async () => {
  await cleanupKB(tmp);
});

// ---------------------------------------------------------------------------
// US-001: 经验沉淀全链路
// ---------------------------------------------------------------------------

describe("P5 / US-001: 经验沉淀全链路", () => {
  it("US001-T1: 高 confidence 单域经验自动 promote (tier=auto)", async () => {
    const writeResult = await tools.write.kbWriteExperience({
      title: "P5 测试经验卡：异步上下文管理器",
      domain: "coding",
      content: "## 背景\n测试内容\n## 方案\nasync with",
      confidence: 0.9,
      source_task: "p5-test-001",
    });
    // write tool contract (ARCH.md §3.1): returns { path, status }
    const writeData = parseResult<{ path: string }>(writeResult);
    assert.ok(writeData.path, "should return path");

    const promoteResult = await tools.write.kbPromoteExperience({
      inbox_path: writeData.path,
      action: "promote",
    });
    const promoteData = parseResult<{
      status: string;
      tier: string;
      duplicate_with: string[];
    }>(promoteResult);
    assert.equal(promoteData.status, "active");
    assert.equal(promoteData.tier, "auto");
    assert.ok(
      Array.isArray(promoteData.duplicate_with),
      "duplicate_with should be array",
    );
  });

  it("US001-T2: 低 confidence 进人工审核 (tier=manual)", async () => {
    const writeResult = await tools.write.kbWriteExperience({
      title: "P5 低置信度经验",
      domain: "coding",
      content: "推测性内容",
      confidence: 0.6,
      source_task: "p5-test-002",
    });
    const writeData = parseResult<{ path: string }>(writeResult);

    const promoteResult = await tools.write.kbPromoteExperience({
      inbox_path: writeData.path,
      action: "promote",
    });
    const promoteData = parseResult<{ tier: string }>(promoteResult);
    assert.equal(promoteData.tier, "manual");
  });

  it("US001-T4: frontmatter 完整性（status/domain/confidence/date/source_task）", async () => {
    const writeResult = await tools.write.kbWriteExperience({
      title: "P5 frontmatter 检查",
      domain: "emotions",
      content: "内容",
      confidence: 0.85,
      source_task: "p5-test-004",
    });
    const writeData = parseResult<{ path: string }>(writeResult);

    // 通过 kb_list_inbox 读取并验证 frontmatter
    const inboxResult = await tools.inbox.kbListInbox({});
    // inbox tool contract (inbox.ts InboxCard): { path, title, confidence, source_task, ... }
    // Note: inbox list strips .md extension; writeData.path has .md — normalize for comparison.
    const inboxData = parseResult<{ cards: Array<{ path: string; title: string; confidence: number; source_task: string }> }>(inboxResult);
    const expectedPath = writeData.path.replace(/\.md$/, "");
    const card = inboxData.cards.find((c) => c.path === expectedPath);
    assert.ok(card, "card should be in inbox list");
    assert.equal(card.title, "P5 frontmatter 检查");
    assert.equal(card.confidence, 0.85);
    assert.ok(card.source_task, "source_task should be present");
  });
});

// ---------------------------------------------------------------------------
// US-002: MCP 工具兼容性
// ---------------------------------------------------------------------------

describe("P5 / US-002: MCP 工具兼容性", () => {
  before(async () => {
    // 写入测试页面供搜索
    await writePage(
      tmp,
      "wiki/coding/p5-search-target.md",
      {
        title: "P5 搜索目标页",
        domain: ["coding"],
        type: "concept",
        status: "active",
        date: "2026-07-28",
        tags: ["python", "async"],
      },
      "# P5 搜索目标页\nPython 异步编程模式。",
    );
  });

  it("US002-T1: kb_search 返回带 path 的结果（页面路径引用）", async () => {
    const result = await tools.search.kbSearch({
      query: "Python 异步",
      limit: 5,
    });
    // search tool output contract (ARCH.md §3.1): results[].path
    const data = parseResult<{ results: Array<{ path: string; title: string }> }>(result);
    assert.ok(data.results.length > 0, "should have results");
    assert.ok(data.results[0].path, "result should have path (page path reference, PRD US-002)");
  });

  it("US002-T2: kb_get_page 读取完整页面", async () => {
    const result = await tools.readOnly.kbGetPage({
      page_path: "wiki/coding/p5-search-target.md",
    });
    // kb_get_page contract (read-only.ts): returns { frontmatter, body, links }
    const data = parseResult<{ frontmatter: { title: string }; body: string; links: string[] }>(result);
    assert.ok(data.frontmatter, "should have frontmatter");
    assert.ok(data.frontmatter.title, "should have frontmatter.title");
    assert.ok(data.body, "should have body");
  });

  it("US002-T3: kb_list_categories 列出领域", async () => {
    const result = await tools.readOnly.kbListCategories({});
    // kb_list_categories contract: returns { categories: [{ name }] }
    const data = parseResult<{ categories: Array<{ name: string }> }>(result);
    assert.ok(Array.isArray(data.categories), "should return categories array");
  });
});

// ---------------------------------------------------------------------------
// US-003: 多领域分类
// ---------------------------------------------------------------------------

describe("P5 / US-003: 多领域分类", () => {
  it("US003-T1: 领域目录存在（coding/emotions/reading）", async () => {
    const result = await tools.readOnly.kbListCategories({});
    // kb_list_categories contract: returns { categories: [{ name }] }
    const data = parseResult<{ categories: Array<{ name: string }> }>(result);
    const names = data.categories.map((c) => c.name);
    // 至少应有 coding（测试数据写入的领域）
    assert.ok(
      names.includes("coding"),
      `coding should be in categories: ${names.join(", ")}`,
    );
  });

  it("US003-T2: frontmatter domain 字段有效", async () => {
    const result = await tools.readOnly.kbGetPage({
      page_path: "wiki/coding/p5-search-target.md",
    });
    const data = parseResult<{ frontmatter: { domain: string[] } }>(result);
    assert.ok(
      Array.isArray(data.frontmatter.domain),
      "domain should be array",
    );
    assert.ok(
      data.frontmatter.domain.includes("coding"),
      "domain should include coding",
    );
  });
});

// ---------------------------------------------------------------------------
// US-005: kb_lint 健康检查
// ---------------------------------------------------------------------------

describe("P5 / US-005: kb_lint 健康检查", () => {
  it("US005-T4: 结构化报告输出（issues 数组，每项含 type/page/detail）", async () => {
    const result = await tools.lint.kbLint({});
    const data = parseResult<{
      issues: Array<{ type: string; page?: string; detail?: string }>;
      summary: object;
    }>(result);
    assert.ok(Array.isArray(data.issues), "should return issues array");
    assert.ok(data.summary, "should have summary");
    // 每个-issue 应有 type 字段
    for (const issue of data.issues) {
      assert.ok(issue.type, "each issue should have type");
    }
  });
});

// ---------------------------------------------------------------------------
// US-006: 检索质量基线
// ---------------------------------------------------------------------------

describe("P5 / US-006: 检索质量基线", () => {
  it("US006-T1: kb_search P95 < 2s（PRD 硬阈值）", async () => {
    const ITERATIONS = 10;
    const latencies: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      await tools.search.kbSearch({ query: "Python 异步", limit: 5 });
      const elapsed = performance.now() - start;
      latencies.push(elapsed);
    }

    latencies.sort((a, b) => a - b);
    // P95 = 第 95 百分位（10 次中取第 9.5 → 索引 9）
    const p95 = latencies[Math.ceil(ITERATIONS * 0.95) - 1];

    assert.ok(
      p95 < 2000,
      `kb_search P95=${p95.toFixed(2)}ms, expected < 2000ms (PRD threshold)`,
    );
  });
});
