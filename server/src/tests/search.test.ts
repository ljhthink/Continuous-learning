/**
 * Unit tests for kb_search (US-006).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTempKB, cleanupKB, writePage, parseResult } from "./setup.js";

let tmp: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tools: any;

before(async () => {
  tmp = await createTempKB("kb-search");

  await writePage(
    tmp,
    "wiki/coding/async-patterns.md",
    {
      title: "Async Patterns in Python",
      domain: ["coding"],
      type: "concept",
      status: "active",
      date: "2026-07-15",
      tags: ["python", "async"],
    },
    "# Async Patterns\nPython async/await with asyncio. Use async patterns for I/O.",
  );
  await writePage(
    tmp,
    "wiki/coding/testing-basics.md",
    {
      title: "Testing Basics",
      domain: ["coding"],
      type: "concept",
      status: "active",
      date: "2026-07-20",
    },
    "# Testing\nWrite tests for your code. Test early, test often.",
  );
  await writePage(
    tmp,
    "wiki/emotions/stress-management.md",
    {
      title: "Stress Management",
      domain: ["emotions"],
      type: "concept",
      status: "active",
      date: "2026-07-10",
    },
    "# Stress\nManage stress with async breathing techniques.",
  );
  // CJK pages — guard against the "multilingual blind spot" regression
  // (tokenize() must split on full-width punctuation and emit CJK bigrams).
  await writePage(
    tmp,
    "wiki/reading/2025-guo-sai.md",
    {
      title: "2025 数学建模国赛三天速成指南",
      domain: ["mathematical-modeling"],
      type: "source",
      status: "active",
      date: "2025-09-01",
      tags: ["math-modeling", "national-competition"],
    },
    "# 2025 国赛三天速成攻略\n数学建模国赛入门及赛题分析。涵盖建模步骤、必备模型、论文写作与摘要秘诀。\n历年赛题模型和算法推荐。",
  );
  await writePage(
    tmp,
    "wiki/reading/mathorcup-2025.md",
    {
      title: "2025年MathorCup大数据竞赛赛道B：物流理赔风险识别及服务升级问题",
      domain: ["big-data"],
      type: "source",
      status: "staging",
      date: "2025-04-18",
      tags: ["logistics-claims", "risk-identification"],
    },
    "# 物流理赔风险识别\n本文档为2025年MathorCup大数据竞赛赛道B题目，聚焦物流理赔风险识别及服务升级。",
  );

  process.env.KB_ROOT = tmp;
  tools = { search: await import("../tools/search.js") };
});

after(async () => {
  await cleanupKB(tmp);
});

describe("kb_search", () => {
  it("returns pages matching query terms", async () => {
    const result = await tools.search.kbSearch({ query: "async python" });
    const data = parseResult(result);
    assert.ok(data.results.length > 0);
    const top = data.results[0];
    assert.match(top.title, /Async Patterns/);
    assert.ok(top.score > 0);
    assert.ok(top.snippet.length > 0);
  });

  it("returns empty results for empty query", async () => {
    const result = await tools.search.kbSearch({ query: "   " });
    const data = parseResult(result);
    assert.equal(data.results.length, 0);
  });

  it("filters by domain", async () => {
    const result = await tools.search.kbSearch({
      query: "async",
      domain: "emotions",
    });
    const data = parseResult(result);
    // "async" appears in emotions/stress-management
    assert.ok(data.results.length > 0);
    assert.match(data.results[0].path, /emotions/);
  });

  it("respects limit parameter", async () => {
    const result = await tools.search.kbSearch({ query: "test", limit: 1 });
    const data = parseResult(result);
    assert.ok(data.results.length <= 1);
  });

  // --- CJK / Chinese retrieval regression tests (TKN-RAG-CLASSIFY-ARCHAEOLOGY-001) ---
  // These guard against the "multilingual blind spot" where a full-width
  // punctuation mark (e.g. ，U+FF0C) caused the entire Chinese query to
  // collapse into a single non-matching token. See archaeology report §2.

  it("splits Chinese query on full-width comma and matches via bigrams", async () => {
    // The exact user-reported failing query. Before the fix, "，" was not a
    // delimiter → 1 giant token → 0 results. After the fix, bigrams "数学",
    // "学建", "建模" match the 国赛 page title/body.
    const result = await tools.search.kbSearch({
      query: "关于数学建模，目前有哪些资料",
    });
    const data = parseResult(result);
    assert.ok(
      data.results.length > 0,
      "Chinese query with full-width comma must return results",
    );
    const top = data.results[0];
    assert.match(top.title, /数学建模|MathorCup/);
    assert.ok(top.score > 0);
    assert.ok(top.snippet.length > 0);
  });

  it("matches Chinese substring via CJK bigrams even when phrasing differs", async () => {
    // Query "数学建模" (4 chars) → bigrams 数学/学建/建模. Document title is
    // "2025 数学建模国赛三天速成指南" which contains "数学建模" as a substring.
    // Before the bigram fix, the whole "关于数学建模" token never matched.
    const result = await tools.search.kbSearch({ query: "数学建模" });
    const data = parseResult(result);
    assert.ok(data.results.length > 0);
    assert.match(data.results[0].title, /数学建模/);
  });

  it("matches logistics document with mixed CJK + ASCII query", async () => {
    const result = await tools.search.kbSearch({ query: "物流理赔风险" });
    const data = parseResult(result);
    assert.ok(data.results.length > 0);
    assert.match(data.results[0].title, /物流理赔/);
  });

  it("returns empty for Chinese query with no matching content", async () => {
    const result = await tools.search.kbSearch({ query: "量子计算区块链" });
    const data = parseResult(result);
    assert.equal(data.results.length, 0);
  });

  it("still matches ASCII queries after CJK tokenization changes", async () => {
    // Regression guard: the CJK bigram addition must not break English search.
    const result = await tools.search.kbSearch({ query: "async python" });
    const data = parseResult(result);
    assert.ok(data.results.length > 0);
    assert.match(data.results[0].title, /Async Patterns/);
  });
});
