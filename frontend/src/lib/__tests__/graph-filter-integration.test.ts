/**
 * 图谱筛选集成测试 — viewStore currentType 联动 filteredGraph
 *
 * 验收标准 AC-3.3（点击 experience 只显示 experience 节点）
 *          AC-3.5（类型筛选与领域筛选可叠加）
 *          AC-3.4（再次点击取消筛选）
 *
 * 集成对象：useViewStore（真实 Zustand store） + mockGraphData（真实 mock 数据）
 *           + filteredGraph 过滤逻辑（复制自 GraphView.tsx:236-266）
 *
 * 说明：filteredGraph 是 GraphView 组件内 useMemo，未导出。本测试复制其过滤逻辑
 * 作为"集成契约基准"，验证 store 状态变化与数据过滤的端到端契约。
 * 真实组件渲染行为由 Playwright E2E（AC-3.6）验证。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useViewStore } from "@/store/viewStore";
import { mockGraphData } from "@/data/mockData";
import type { Domain, PageType, PageStatus, GraphNode, GraphEdge } from "@/types";

// 复制自 GraphView.tsx:101-104 的枚举数组
const ALL_TYPES: PageType[] = ["concept", "entity", "source", "experience"];
const ALL_STATUSES: PageStatus[] = ["active", "staging", "pending", "archived"];
const ALL_EDGE_TYPES: GraphEdge["type"][] = ["wikilink", "related"];

/**
 * filteredGraph 过滤逻辑（复制自 GraphView.tsx:236-266）
 * currentType 非 null 时覆盖 filterTypes；currentDomain 非 null 时覆盖 filterDomains。
 */
function computeFilteredGraph(opts: {
  currentDomain: Domain | null;
  currentType: PageType | null;
  filterDomains: Set<Domain>;
  filterTypes: Set<PageType>;
  filterStatuses: Set<PageStatus>;
  filterEdgeTypes: Set<GraphEdge["type"]>;
}) {
  const { currentDomain, currentType, filterDomains, filterTypes, filterStatuses, filterEdgeTypes } =
    opts;
  const activeDomainFilter = currentDomain ? new Set<Domain>([currentDomain]) : filterDomains;
  const visibleNodes: GraphNode[] = mockGraphData.nodes.filter(
    (n) =>
      activeDomainFilter.has(n.domain) &&
      (currentType ? n.type === currentType : filterTypes.has(n.type)) &&
      filterStatuses.has(n.status),
  );
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = mockGraphData.edges.filter(
    (e) =>
      filterEdgeTypes.has(e.type) &&
      visibleNodeIds.has(e.source) &&
      visibleNodeIds.has(e.target),
  );
  return { nodes: visibleNodes, links: visibleEdges };
}

// 默认筛选状态（模拟 GraphView useState 初值）
const defaultFilterDomains = new Set(Object.keys({
  "kb-system": 1,
  coding: 1,
  resources: 1,
  design: 1,
  emotions: 1,
  reading: 1,
  academic: 1,
  life: 1,
}) as Domain[]);
const defaultFilterTypes = new Set(ALL_TYPES);
const defaultFilterStatuses = new Set(ALL_STATUSES);
const defaultFilterEdgeTypes = new Set(ALL_EDGE_TYPES);

describe("图谱筛选集成：viewStore currentType 联动 filteredGraph", () => {
  beforeEach(() => {
    useViewStore.setState({ currentType: null, currentDomain: null });
  });

  // mock 数据统计基准（37 节点）
  it("mock 数据基准：37 节点（27 concept + 4 entity + 2 source + 4 experience）", () => {
    expect(mockGraphData.nodes.length).toBe(37);
    const byType = mockGraphData.nodes.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    expect(byType.concept).toBe(27);
    expect(byType.entity).toBe(4);
    expect(byType.source).toBe(2);
    expect(byType.experience).toBe(4);
  });

  // AC-3.3：currentType=null（默认）→ 所有节点可见
  it("AC-3.3 基准：currentType=null 时显示全部 37 节点", () => {
    const result = computeFilteredGraph({
      currentDomain: null,
      currentType: null,
      filterDomains: defaultFilterDomains,
      filterTypes: defaultFilterTypes,
      filterStatuses: defaultFilterStatuses,
      filterEdgeTypes: defaultFilterEdgeTypes,
    });
    expect(result.nodes.length).toBe(37);
  });

  // AC-3.3：currentType="experience" → 只剩 4 个 experience 节点
  it("AC-3.3：currentType=experience → 只显示 4 个 experience 节点", () => {
    const result = computeFilteredGraph({
      currentDomain: null,
      currentType: "experience",
      filterDomains: defaultFilterDomains,
      filterTypes: defaultFilterTypes,
      filterStatuses: defaultFilterStatuses,
      filterEdgeTypes: defaultFilterEdgeTypes,
    });
    expect(result.nodes.length).toBe(4);
    expect(result.nodes.every((n) => n.type === "experience")).toBe(true);
    // 验证包含 inDegree=0 的 mcp-cache-exp（AC-2.4 关键节点）
    expect(result.nodes.some((n) => n.id === "mcp-cache-exp")).toBe(true);
  });

  // AC-3.3：各类型筛选节点数正确
  it("AC-3.3：各类型筛选节点数正确（concept=27/entity=4/source=2/experience=4）", () => {
    const cases: Array<{ type: PageType; expected: number }> = [
      { type: "concept", expected: 27 },
      { type: "entity", expected: 4 },
      { type: "source", expected: 2 },
      { type: "experience", expected: 4 },
    ];
    cases.forEach(({ type, expected }) => {
      const result = computeFilteredGraph({
        currentDomain: null,
        currentType: type,
        filterDomains: defaultFilterDomains,
        filterTypes: defaultFilterTypes,
        filterStatuses: defaultFilterStatuses,
        filterEdgeTypes: defaultFilterEdgeTypes,
      });
      expect(result.nodes.length).toBe(expected);
    });
  });

  // AC-3.5：类型筛选 + 领域筛选叠加
  it("AC-3.5：currentType=experience + currentDomain=coding → 4 个 coding experience 节点", () => {
    const result = computeFilteredGraph({
      currentDomain: "coding",
      currentType: "experience",
      filterDomains: defaultFilterDomains,
      filterTypes: defaultFilterTypes,
      filterStatuses: defaultFilterStatuses,
      filterEdgeTypes: defaultFilterEdgeTypes,
    });
    expect(result.nodes.length).toBe(4);
    expect(result.nodes.every((n) => n.type === "experience" && n.domain === "coding")).toBe(true);
  });

  // AC-3.5：领域筛选单独（currentType=null）
  it("AC-3.5：currentDomain=coding + currentType=null → 12 个 coding 节点", () => {
    const result = computeFilteredGraph({
      currentDomain: "coding",
      currentType: null,
      filterDomains: defaultFilterDomains,
      filterTypes: defaultFilterTypes,
      filterStatuses: defaultFilterStatuses,
      filterEdgeTypes: defaultFilterEdgeTypes,
    });
    expect(result.nodes.length).toBe(12);
    expect(result.nodes.every((n) => n.domain === "coding")).toBe(true);
  });

  // AC-3.4：再次点击取消筛选（toggle 语义）
  it("AC-3.4：toggle 取消筛选 — experience→null 节点数恢复 37", () => {
    // 选中 experience
    useViewStore.getState().setType("experience");
    const filtered = computeFilteredGraph({
      currentDomain: null,
      currentType: useViewStore.getState().currentType,
      filterDomains: defaultFilterDomains,
      filterTypes: defaultFilterTypes,
      filterStatuses: defaultFilterStatuses,
      filterEdgeTypes: defaultFilterEdgeTypes,
    });
    expect(filtered.nodes.length).toBe(4);
    // 再次点击取消（CategoryTree toggle 逻辑）
    useViewStore.getState().setType(
      useViewStore.getState().currentType === "experience" ? null : "experience",
    );
    const restored = computeFilteredGraph({
      currentDomain: null,
      currentType: useViewStore.getState().currentType,
      filterDomains: defaultFilterDomains,
      filterTypes: defaultFilterTypes,
      filterStatuses: defaultFilterStatuses,
      filterEdgeTypes: defaultFilterEdgeTypes,
    });
    expect(restored.nodes.length).toBe(37);
  });

  // currentType 优先级：非 null 时覆盖 filterTypes（即使 filterTypes 为空）
  it("currentType 优先级：currentType=experience 时即使 filterTypes 为空也显示 experience", () => {
    const emptyFilterTypes = new Set<PageType>();
    const result = computeFilteredGraph({
      currentDomain: null,
      currentType: "experience",
      filterDomains: defaultFilterDomains,
      filterTypes: emptyFilterTypes, // 空集
      filterStatuses: defaultFilterStatuses,
      filterEdgeTypes: defaultFilterEdgeTypes,
    });
    // currentType 非 null → 忽略 filterTypes，仍显示 experience
    expect(result.nodes.length).toBe(4);
  });

  // currentType=null 时回退 filterTypes
  it("currentType=null 时回退 filterTypes 集合", () => {
    const onlyExperience = new Set<PageType>(["experience"]);
    const result = computeFilteredGraph({
      currentDomain: null,
      currentType: null,
      filterDomains: defaultFilterDomains,
      filterTypes: onlyExperience,
      filterStatuses: defaultFilterStatuses,
      filterEdgeTypes: defaultFilterEdgeTypes,
    });
    expect(result.nodes.length).toBe(4);
    expect(result.nodes.every((n) => n.type === "experience")).toBe(true);
  });

  // 边过滤：筛选后边只连接可见节点
  it("边过滤：筛选 experience 后，visibleEdges 只连接可见节点", () => {
    const result = computeFilteredGraph({
      currentDomain: null,
      currentType: "experience",
      filterDomains: defaultFilterDomains,
      filterTypes: defaultFilterTypes,
      filterStatuses: defaultFilterStatuses,
      filterEdgeTypes: defaultFilterEdgeTypes,
    });
    const visibleIds = new Set(result.nodes.map((n) => n.id));
    expect(result.links.every((l) => visibleIds.has(l.source) && visibleIds.has(l.target))).toBe(
      true,
    );
  });

  // AC-2.4 关键：inDegree=0 的 experience 节点在筛选后仍可见
  it("AC-2.4：inDegree=0 的 mcp-cache-exp 在 experience 筛选后可见", () => {
    const result = computeFilteredGraph({
      currentDomain: null,
      currentType: "experience",
      filterDomains: defaultFilterDomains,
      filterTypes: defaultFilterTypes,
      filterStatuses: defaultFilterStatuses,
      filterEdgeTypes: defaultFilterEdgeTypes,
    });
    const mcpCache = result.nodes.find((n) => n.id === "mcp-cache-exp");
    expect(mcpCache).toBeDefined();
    expect(mcpCache?.inDegree).toBe(0);
    expect(mcpCache?.type).toBe("experience");
  });
});
