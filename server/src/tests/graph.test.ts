/**
 * Unit tests for P4 Phase 4c knowledge-graph tools:
 *   kb_get_graph, kb_get_backlinks, kb_list_inbox
 *
 * Verifies node/edge extraction, summary stats, backlink reverse-index,
 * and inbox listing with confidence sorting.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  createTempKB,
  cleanupKB,
  writePage,
  parseResult,
} from "./setup.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let graph: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let backlinks: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let inbox: any;

let tmp: string;

before(async () => {
  tmp = await createTempKB("kb-graph");
  process.env.KB_ROOT = tmp;
  graph = await import("../tools/graph.js");
  backlinks = await import("../tools/backlinks.js");
  inbox = await import("../tools/inbox.js");
});

after(async () => {
  await cleanupKB(tmp);
});

// ---------------------------------------------------------------------------
// Test fixture: a small wiki with 5 pages across 2 domains.
//
//   wiki/coding/alpha.md      → wikilinks to [[beta]] + related: [gamma]
//   wiki/coding/beta.md       → wikilinks to [[alpha]] (bidirectional)
//   wiki/design/gamma.md      → tags: [tutorial]; related: [alpha]
//   wiki/coding/delta.md      → tags: [tutorial]; pending status (filtered out by default)
//   wiki/coding/experiences/inbox/exp1.md → experience card, status=pending
//
// Expected edges (after default status filter excludes pending):
//   alpha → beta (wikilink)
//   beta  → alpha (wikilink)
//   alpha → gamma (related)
//   gamma → alpha (related)
//   gamma ↔ delta (tags) — but delta is pending, so excluded
// ---------------------------------------------------------------------------

async function seedGraphFixture(): Promise<void> {
  await writePage(
    tmp,
    "wiki/coding/alpha.md",
    {
      title: "Alpha Concept",
      domain: ["coding"],
      type: "concept",
      status: "active",
      date: "2026-07-27",
      tags: ["python"],
      related: ["wiki/design/gamma"],
    },
    "# Alpha\n\nSee also [[beta]] for more.\n",
  );

  await writePage(
    tmp,
    "wiki/coding/beta.md",
    {
      title: "Beta Concept",
      domain: ["coding"],
      type: "concept",
      status: "active",
      date: "2026-07-27",
      tags: ["python"],
    },
    "# Beta\n\nReferences [[alpha]].\n",
  );

  await writePage(
    tmp,
    "wiki/design/gamma.md",
    {
      title: "Gamma Design",
      domain: ["design"],
      type: "entity",
      status: "active",
      date: "2026-07-27",
      tags: ["tutorial"],
      related: ["wiki/coding/alpha"],
    },
    "# Gamma\n\nDesign notes.\n",
  );

  await writePage(
    tmp,
    "wiki/coding/delta.md",
    {
      title: "Delta Pending",
      domain: ["coding"],
      type: "concept",
      status: "pending",
      date: "2026-07-27",
      tags: ["tutorial"],
    },
    "# Delta\n\nPending page.\n",
  );

  // Experience card in inbox
  await writePage(
    tmp,
    "wiki/coding/experiences/inbox/exp1.md",
    {
      title: "Test Experience Card",
      domain: ["coding"],
      type: "experience",
      status: "pending",
      confidence: 0.85,
      date: "2026-07-27",
      source_task: "task-test-001",
      tags: ["python"],
    },
    "## 背景\n\nTest background.\n\n## 方案\n\nTest solution.\n",
  );
}

// ---------------------------------------------------------------------------
// kb_get_graph
// ---------------------------------------------------------------------------

describe("kb_get_graph", () => {
  it("returns empty graph on a fresh KB", async () => {
    const result = await graph.kbGetGraph({});
    const data = parseResult(result);
    assert.equal(data.nodes.length, 0);
    assert.equal(data.edges.length, 0);
    assert.equal(data.summary.totalNodes, 0);
    assert.equal(data.summary.totalEdges, 0);
  });

  it("builds nodes and edges from seeded wiki", async () => {
    await seedGraphFixture();
    const result = await graph.kbGetGraph({
      include_statuses: ["active", "staging", "pending"],
    });
    const data = parseResult(result);

    // 5 pages total: alpha, beta, gamma, delta, exp1
    assert.equal(data.nodes.length, 5);
    assert.equal(data.summary.totalNodes, 5);

    // Edges:
    //   alpha→beta (wikilink), beta→alpha (wikilink)
    //   alpha→gamma (related), gamma→alpha (related)
    //   gamma↔delta (tags, shared "tutorial" in coding domain)
    //   exp1 shares "python" tag with alpha+beta in coding domain → 2 edges (exp1↔alpha, exp1↔beta)
    assert.ok(
      data.edges.length >= 4,
      `expected at least 4 edges, got ${data.edges.length}`,
    );
    assert.equal(data.summary.totalEdges, data.edges.length);

    // Edge type breakdown
    assert.ok(data.summary.byEdgeType.wikilink >= 2);
    assert.ok(data.summary.byEdgeType.related >= 2);
    assert.ok(data.summary.byEdgeType.tags >= 1);
  });

  it("excludes pending and archived by default", async () => {
    const result = await graph.kbGetGraph({});
    const data = parseResult(result);

    // Default excludes pending/archived → delta (pending) and exp1 (pending) excluded
    const nodeTitles = data.nodes.map((n: { title: string }) => n.title);
    assert.ok(!nodeTitles.includes("Delta Pending"), "delta should be excluded");
    assert.ok(
      !nodeTitles.includes("Test Experience Card"),
      "exp1 should be excluded",
    );
    assert.equal(data.nodes.length, 3); // alpha, beta, gamma
  });

  it("filters by domain", async () => {
    const result = await graph.kbGetGraph({
      domain: "design",
      include_statuses: ["active"],
    });
    const data = parseResult(result);
    assert.equal(data.nodes.length, 1); // only gamma
    assert.equal(data.nodes[0].domain, "design");
  });

  it("computes in-degree and out-degree correctly", async () => {
    const result = await graph.kbGetGraph({
      include_statuses: ["active", "staging", "pending"],
    });
    const data = parseResult(result);
    const alpha = data.nodes.find(
      (n: { title: string }) => n.title === "Alpha Concept",
    );
    assert.ok(alpha, "alpha node should exist");
    // alpha has: 1 outbound wikilink (to beta) + 1 outbound related (to gamma) = outDeg 2
    // alpha has: 1 inbound wikilink (from beta) + 1 inbound related (from gamma) = inDeg 2
    assert.ok(alpha.inDegree >= 2, `alpha inDeg=${alpha.inDegree}`);
    assert.ok(alpha.outDegree >= 2, `alpha outDeg=${alpha.outDegree}`);
  });

  it("summary includes domain distribution", async () => {
    const result = await graph.kbGetGraph({
      include_statuses: ["active", "staging", "pending"],
    });
    const data = parseResult(result);
    const domains = data.summary.domains;
    assert.ok(domains.coding >= 3, `coding count=${domains.coding}`);
    assert.ok(domains.design >= 1, `design count=${domains.design}`);
  });
});

// ---------------------------------------------------------------------------
// kb_get_backlinks
// ---------------------------------------------------------------------------

describe("kb_get_backlinks", () => {
  it("returns error for non-existent page", async () => {
    const result = await backlinks.kbGetBacklinks({
      page_path: "wiki/coding/nonexistent",
    });
    assert.equal(result.isError, true);
  });

  it("rejects path traversal", async () => {
    const result = await backlinks.kbGetBacklinks({
      page_path: "../../../etc/passwd",
    });
    assert.equal(result.isError, true);
  });

  it("returns backlinks, outbound, and related for alpha", async () => {
    const result = await backlinks.kbGetBacklinks({
      page_path: "wiki/coding/alpha",
    });
    const data = parseResult(result);

    // Outbound: alpha wikilinks to [[beta]] → 1 outbound
    assert.ok(
      data.outbound.length >= 1,
      `outbound=${data.outbound.length}`,
    );
    const outboundBeta = data.outbound.find(
      (o: { title: string }) => o.title === "Beta Concept",
    );
    assert.ok(outboundBeta, "beta should be in outbound");

    // Backlinks: beta wikilinks to [[alpha]] → 1 backlink
    assert.ok(
      data.backlinks.length >= 1,
      `backlinks=${data.backlinks.length}`,
    );
    const backlinkFromBeta = data.backlinks.find(
      (b: { title: string }) => b.title === "Beta Concept",
    );
    assert.ok(backlinkFromBeta, "beta should be a backlink");

    // Backlinks should include context
    assert.ok(
      typeof backlinkFromBeta.context === "string",
      "context should be a string",
    );

    // Related: alpha's frontmatter.related = [gamma]
    assert.ok(
      data.related.length >= 1,
      `related=${data.related.length}`,
    );
    const relatedGamma = data.related.find(
      (r: { title: string }) => r.title === "Gamma Design",
    );
    assert.ok(relatedGamma, "gamma should be in related");
  });

  it("accepts page_path with .md extension", async () => {
    const result = await backlinks.kbGetBacklinks({
      page_path: "wiki/coding/alpha.md",
    });
    assert.equal(result.isError, undefined);
    const data = parseResult(result);
    assert.ok(data.outbound !== undefined);
  });
});

// ---------------------------------------------------------------------------
// kb_list_inbox
// ---------------------------------------------------------------------------

describe("kb_list_inbox", () => {
  it("lists pending experience cards", async () => {
    const result = await inbox.kbListInbox({});
    const data = parseResult(result);
    assert.ok(data.cards.length >= 1, `cards=${data.cards.length}`);

    const exp = data.cards.find(
      (c: { title: string }) => c.title === "Test Experience Card",
    );
    assert.ok(exp, "exp1 should be in inbox");
    assert.equal(exp.domain, "coding");
    assert.equal(exp.confidence, 0.85);
    assert.equal(exp.source_task, "task-test-001");
    assert.ok(typeof exp.body === "string" && exp.body.length > 0);
  });

  it("filters by domain", async () => {
    const result = await inbox.kbListInbox({ domain: "design" });
    const data = parseResult(result);
    // No experience cards in design domain
    assert.equal(data.cards.length, 0);
  });

  it("excludes non-pending experience cards", async () => {
    // Add an active (promoted) experience card
    await writePage(
      tmp,
      "wiki/coding/experiences/active-exp.md",
      {
        title: "Active Experience",
        domain: ["coding"],
        type: "experience",
        status: "active",
        confidence: 0.9,
        date: "2026-07-27",
        source_task: "task-test-002",
      },
      "Active experience body.\n",
    );

    const result = await inbox.kbListInbox({ domain: "coding" });
    const data = parseResult(result);
    const titles = data.cards.map((c: { title: string }) => c.title);
    assert.ok(titles.includes("Test Experience Card"));
    assert.ok(!titles.includes("Active Experience"), "active card should be excluded");
  });

  it("sorts cards by confidence descending", async () => {
    // Add a higher-confidence pending card
    await writePage(
      tmp,
      "wiki/coding/experiences/inbox/high-conf.md",
      {
        title: "High Confidence Card",
        domain: ["coding"],
        type: "experience",
        status: "pending",
        confidence: 0.95,
        date: "2026-07-27",
        source_task: "task-test-003",
      },
      "High confidence body.\n",
    );

    const result = await inbox.kbListInbox({ domain: "coding" });
    const data = parseResult(result);
    const confidences = data.cards.map(
      (c: { confidence: number }) => c.confidence,
    );
    for (let i = 1; i < confidences.length; i++) {
      assert.ok(
        confidences[i - 1] >= confidences[i],
        `cards not sorted desc: ${confidences.join(", ")}`,
      );
    }
  });
});
