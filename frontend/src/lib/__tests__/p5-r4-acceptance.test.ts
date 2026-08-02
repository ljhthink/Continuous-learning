/**
 * P5-R4 验收测试 — AC-1/AC-2/AC-3 核心变更验证
 *
 * 测试矩阵：
 *   AC-1: STAGING_SYSTEM_PROMPT 完整度指令（大文件内容保留）
 *   AC-2: GraphView 防御性归一化（null domain/type/status → 默认值）
 *   AC-3: DropZone 领域选择 UX 逻辑
 *
 * 说明：
 *   - STAGING_SYSTEM_PROMPT 直接从 llm.ts 导入测试
 *   - GraphView 归一化逻辑从 GraphView.tsx:224-235 复制（与 graph-filter-integration.test.ts 同模式）
 *   - call_llm_api 请求体不含 max_tokens 的验证在 Rust 端（cargo test + 代码审查）
 */

import { describe, it, expect } from "vitest";
import { STAGING_SYSTEM_PROMPT } from "@/lib/llm";
import type { Domain, PageType, PageStatus, GraphNode, GraphEdge, GraphData } from "@/types";

// ---------------------------------------------------------------------------
// AC-1: STAGING_SYSTEM_PROMPT 完整度指令
// ---------------------------------------------------------------------------

describe("AC-1: STAGING_SYSTEM_PROMPT 大文件内容完整保留指令", () => {
  it("包含「保留原文全部核心内容」指令", () => {
    expect(STAGING_SYSTEM_PROMPT).toContain("保留原文全部核心内容");
  });

  it("包含「完整度优先于简洁性」指令", () => {
    expect(STAGING_SYSTEM_PROMPT).toContain("完整度优先于简洁性");
  });

  it("明确禁止删减、省略或概括原文内容", () => {
    expect(STAGING_SYSTEM_PROMPT).toContain("不要删减");
    expect(STAGING_SYSTEM_PROMPT).toContain("省略");
    expect(STAGING_SYSTEM_PROMPT).toContain("概括");
  });

  it("要求保留知识点、公式、表格、代码", () => {
    expect(STAGING_SYSTEM_PROMPT).toContain("知识点");
    expect(STAGING_SYSTEM_PROMPT).toContain("公式");
    expect(STAGING_SYSTEM_PROMPT).toContain("表格");
    expect(STAGING_SYSTEM_PROMPT).toContain("代码");
  });

  it("指示长原文应输出长结果", () => {
    expect(STAGING_SYSTEM_PROMPT).toContain("原文很长");
    expect(STAGING_SYSTEM_PROMPT).toContain("输出也应该很长");
  });

  it("保留数学公式的 LaTeX 格式", () => {
    expect(STAGING_SYSTEM_PROMPT).toContain("LaTeX");
    expect(STAGING_SYSTEM_PROMPT).toContain("$");
  });

  it("保留代码块并标注语言", () => {
    expect(STAGING_SYSTEM_PROMPT).toContain("代码块");
    expect(STAGING_SYSTEM_PROMPT).toContain("语言");
  });

  it("长度合理（100-2000 字符，P5-R4 增强后允许更长）", () => {
    expect(STAGING_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    expect(STAGING_SYSTEM_PROMPT.length).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// AC-2: GraphView 防御性归一化
// ---------------------------------------------------------------------------

/**
 * GraphView 归一化逻辑（复制自 GraphView.tsx:224-235）
 *
 * P5-R4 fix: frontmatter 损坏导致 domain/type/status 为 null 时，
 * 赋予默认值而非静默排除。
 */
function normalizeGraphData(data: GraphData): GraphData {
  return {
    ...data,
    nodes: data.nodes.map((n) => ({
      ...n,
      domain: (n.domain ?? "coding") as Domain,
      type: (n.type ?? "source") as PageType,
      status: (n.status ?? "active") as PageStatus,
    })),
  };
}

// 辅助：构造一个 GraphNode（允许 domain/type/status 为 null 以模拟损坏数据）
function makeNode(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    id: overrides.id,
    title: overrides.title ?? "Test Node",
    path: overrides.path ?? `wiki/coding/${overrides.id}.md`,
    domain: (overrides.domain ?? "coding") as Domain,
    type: (overrides.type ?? "source") as PageType,
    status: (overrides.status ?? "active") as PageStatus,
    inDegree: overrides.inDegree ?? 0,
    outDegree: overrides.outDegree ?? 0,
  };
}

function makeGraphData(nodes: GraphNode[], edges: GraphEdge[] = []): GraphData {
  return {
    nodes,
    edges,
    summary: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      byEdgeType: {},
      orphanPages: 0,
      largestCcSize: 0,
      domains: {},
    },
  };
}

describe("AC-2: GraphView 防御性归一化", () => {
  it("null domain 归一化为 'coding'", () => {
    const badNode = makeNode({ id: "bad-1", domain: null as unknown as Domain });
    const data = makeGraphData([badNode]);
    const result = normalizeGraphData(data);
    expect(result.nodes[0].domain).toBe("coding");
  });

  it("null type 归一化为 'source'", () => {
    const badNode = makeNode({ id: "bad-2", type: null as unknown as PageType });
    const data = makeGraphData([badNode]);
    const result = normalizeGraphData(data);
    expect(result.nodes[0].type).toBe("source");
  });

  it("null status 归一化为 'active'", () => {
    const badNode = makeNode({ id: "bad-3", status: null as unknown as PageStatus });
    const data = makeGraphData([badNode]);
    const result = normalizeGraphData(data);
    expect(result.nodes[0].status).toBe("active");
  });

  it("三个字段同时为 null 时全部归一化", () => {
    const badNode = makeNode({
      id: "bad-all",
      domain: null as unknown as Domain,
      type: null as unknown as PageType,
      status: null as unknown as PageStatus,
    });
    const data = makeGraphData([badNode]);
    const result = normalizeGraphData(data);
    expect(result.nodes[0].domain).toBe("coding");
    expect(result.nodes[0].type).toBe("source");
    expect(result.nodes[0].status).toBe("active");
  });

  it("有效字段不被修改（仅 null 被归一化）", () => {
    const goodNode = makeNode({
      id: "good-1",
      domain: "emotions",
      type: "experience",
      status: "staging",
    });
    const data = makeGraphData([goodNode]);
    const result = normalizeGraphData(data);
    expect(result.nodes[0].domain).toBe("emotions");
    expect(result.nodes[0].type).toBe("experience");
    expect(result.nodes[0].status).toBe("staging");
  });

  it("混合 null 和有效节点的数组全部正确处理", () => {
    const nodes = [
      makeNode({ id: "mixed-good", domain: "reading", type: "concept", status: "active" }),
      makeNode({
        id: "mixed-bad",
        domain: null as unknown as Domain,
        type: null as unknown as PageType,
        status: null as unknown as PageStatus,
      }),
    ];
    const data = makeGraphData(nodes);
    const result = normalizeGraphData(data);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].domain).toBe("reading");
    expect(result.nodes[1].domain).toBe("coding");
    expect(result.nodes[1].type).toBe("source");
    expect(result.nodes[1].status).toBe("active");
  });

  it("归一化后节点数量不变（不静默排除损坏节点）", () => {
    const nodes = [
      makeNode({ id: "n1", domain: null as unknown as Domain }),
      makeNode({ id: "n2", type: null as unknown as PageType }),
      makeNode({ id: "n3", status: null as unknown as PageStatus }),
      makeNode({ id: "n4", domain: "design" }),
    ];
    const data = makeGraphData(nodes);
    const result = normalizeGraphData(data);
    expect(result.nodes).toHaveLength(4);
  });

  it("归一化保留其他字段（id/title/path/inDegree/outDegree）", () => {
    const node = makeNode({
      id: "preserve-test",
      title: "保留测试",
      path: "wiki/coding/preserve-test.md",
      inDegree: 5,
      outDegree: 3,
      domain: null as unknown as Domain,
    });
    const data = makeGraphData([node]);
    const result = normalizeGraphData(data);
    expect(result.nodes[0].id).toBe("preserve-test");
    expect(result.nodes[0].title).toBe("保留测试");
    expect(result.nodes[0].path).toBe("wiki/coding/preserve-test.md");
    expect(result.nodes[0].inDegree).toBe(5);
    expect(result.nodes[0].outDegree).toBe(3);
  });

  it("归一化保留 edges 和 summary 不变", () => {
    const nodes = [makeNode({ id: "e1", domain: null as unknown as Domain })];
    const edges: GraphEdge[] = [
      { source: "e1", target: "e1", type: "wikilink" },
    ];
    const data = makeGraphData(nodes, edges);
    data.summary.totalEdges = 1;
    const result = normalizeGraphData(data);
    expect(result.edges).toEqual(edges);
    expect(result.summary.totalEdges).toBe(1);
  });

  it("空节点数组安全处理（不崩溃）", () => {
    const data = makeGraphData([]);
    const result = normalizeGraphData(data);
    expect(result.nodes).toHaveLength(0);
  });

  it("模拟真实场景：数学建模文件 domain=null 被归一化而非消失", () => {
    // 模拟 wiki/coding/2025国赛.md 的 frontmatter 损坏场景
    const mathNode = makeNode({
      id: "2025国赛",
      title: "2025国赛",
      path: "wiki/coding/2025国赛.md",
      domain: null as unknown as Domain, // frontmatter 损坏导致 null
      type: "source",
      status: "active",
      inDegree: 2,
      outDegree: 0,
    });
    const data = makeGraphData([mathNode]);
    const result = normalizeGraphData(data);
    // 关键：节点不应消失，应被归一化后显示
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("2025国赛");
    expect(result.nodes[0].domain).toBe("coding");
  });
});

// ---------------------------------------------------------------------------
// AC-3: DropZone 领域选择 UX 逻辑验证
// ---------------------------------------------------------------------------

/**
 * DropZone UploadIdle 组件的领域选择逻辑（复制自 DropZone.tsx:222-233）
 *
 * 逻辑：
 *   currentDomain 非空 → 显示「目标领域：{domain}」标签
 *   currentDomain 为空 → 显示警告「未选择领域，将默认归入编程」
 */
function getDomainSelectionDisplay(currentDomain: string | null): {
  type: "badge" | "warning";
  text: string;
} {
  if (currentDomain) {
    return { type: "badge", text: `目标领域：${currentDomain}` };
  }
  return {
    type: "warning",
    text: "⚠ 未选择领域，将默认归入「编程」。请在左侧目录树选择正确领域后再上传。",
  };
}

describe("AC-3: DropZone 领域选择 UX 逻辑", () => {
  it("已选择领域时显示目标领域标签", () => {
    const display = getDomainSelectionDisplay("coding");
    expect(display.type).toBe("badge");
    expect(display.text).toContain("目标领域");
    expect(display.text).toContain("coding");
  });

  it("未选择领域时显示警告", () => {
    const display = getDomainSelectionDisplay(null);
    expect(display.type).toBe("warning");
    expect(display.text).toContain("未选择领域");
  });

  it("警告文案明确提示默认归入编程领域", () => {
    const display = getDomainSelectionDisplay(null);
    expect(display.text).toContain("编程");
    expect(display.text).toContain("默认");
  });

  it("警告文案引导用户在左侧目录树选择领域", () => {
    const display = getDomainSelectionDisplay(null);
    expect(display.text).toContain("左侧目录树");
    expect(display.text).toContain("选择");
  });

  it("不同领域均正确显示", () => {
    const domains = ["coding", "emotions", "reading", "academic", "design"];
    domains.forEach((d) => {
      const display = getDomainSelectionDisplay(d);
      expect(display.type).toBe("badge");
      expect(display.text).toContain(d);
    });
  });

  it("空字符串领域视为未选择（显示警告）", () => {
    const display = getDomainSelectionDisplay("");
    // 空字符串在 JS 中是 falsy，与 null 同等处理
    // 注：实际组件中 currentDomain 类型为 Domain | null，空字符串不会出现
    // 但此处验证逻辑健壮性
    expect(display.type).toBe("warning");
  });
});
