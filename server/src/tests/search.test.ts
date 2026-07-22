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
});
