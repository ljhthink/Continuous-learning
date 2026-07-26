/**
 * GraphView — 知识网络图谱（核心组件）
 *
 * P4 计划 §4.4.9：节点视觉编码（颜色按领域、大小按入度、形状按 type）
 * + 边编码（实线 wikilink / 虚线 related / 点线 tags）
 * + 全局/局部双模 + 筛选面板 + 图例。
 *
 * Phase 4a：纯 SVG 静态 mock（圆形布局），不含 d3-force 交互。
 * Phase 4c：替换为 react-force-graph-2d + d3-force 力导向布局。
 */

import { useState, useMemo } from "react";
import { useViewStore } from "@/store/viewStore";
import { mockGraphData } from "@/data/mockData";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "@/types";
import type { GraphNode, GraphEdge, Domain, PageType } from "@/types";

// 节点形状路径生成
function nodeShapePath(type: PageType, r: number): string {
  switch (type) {
    case "concept": // 圆
      return `M ${-r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
    case "entity": // 方
      return `M ${-r} ${-r} L ${r} ${-r} L ${r} ${r} L ${-r} ${r} Z`;
    case "source": // 菱
      return `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;
    case "experience": // 三角
      return `M 0 ${-r} L ${r} ${r * 0.8} L ${-r} ${r * 0.8} Z`;
  }
}

function nodeRadius(inDegree: number): number {
  return Math.max(6, Math.min(24, Math.sqrt(inDegree + 1) * 4));
}

// 圆形布局：按领域分扇区
function computeLayout(nodes: GraphNode[]): Record<string, { x: number; y: number }> {
  const W = 900, H = 600;
  const cx = W / 2, cy = H / 2;
  const domains: Domain[] = ["kb-system", "coding", "design", "resources", "emotions", "reading", "academic", "life"];
  const layout: Record<string, { x: number; y: number }> = {};

  domains.forEach((domain, dIdx) => {
    const domainNodes = nodes.filter((n) => n.domain === domain);
    const sectorAngle = (Math.PI * 2) / domains.length;
    const baseAngle = dIdx * sectorAngle;
    const baseR = 200;
    const domainCx = cx + Math.cos(baseAngle) * baseR;
    const domainCy = cy + Math.sin(baseAngle) * baseR;

    domainNodes.forEach((node, nIdx) => {
      const localR = Math.min(60, domainNodes.length * 8);
      const localAngle = (nIdx / Math.max(domainNodes.length, 1)) * Math.PI * 2;
      layout[node.id] = {
        x: domainCx + Math.cos(localAngle) * localR,
        y: domainCy + Math.sin(localAngle) * localR,
      };
    });
  });

  return layout;
}

export function GraphView() {
  const { graphMode, setGraphMode } = useViewStore();
  const [filterDomains, setFilterDomains] = useState<Set<Domain>>(
    new Set(Object.keys(DOMAIN_COLORS) as Domain[]),
  );
  const [filterEdgeTypes, setFilterEdgeTypes] = useState<Set<GraphEdge["type"]>>(
    new Set(["wikilink", "related"]),
  );
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  const layout = useMemo(() => computeLayout(mockGraphData.nodes), []);

  // 局部模式：计算聚焦节点的 1-hop 邻域
  const neighborhood = useMemo(() => {
    if (graphMode !== "local" || !focusedNodeId) return null;
    const nb = new Set<string>([focusedNodeId]);
    mockGraphData.edges.forEach((e) => {
      if (e.source === focusedNodeId) nb.add(e.target);
      if (e.target === focusedNodeId) nb.add(e.source);
    });
    return nb;
  }, [graphMode, focusedNodeId]);

  const visibleNodes = mockGraphData.nodes.filter(
    (n) => filterDomains.has(n.domain),
  );
  const visibleEdges = mockGraphData.edges.filter(
    (e) => filterEdgeTypes.has(e.type) && filterDomains.has(mockGraphData.nodes.find((n) => n.id === e.source)!.domain) && filterDomains.has(mockGraphData.nodes.find((n) => n.id === e.target)!.domain),
  );

  return (
    <div className="relative w-full h-full bg-canvas overflow-hidden">
      {/* 工具栏（顶部居中）：模式切换 */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex bg-surface border border-border-subtle rounded-md p-0.5 shadow-md z-10">
        <button
          type="button"
          onClick={() => setGraphMode("global")}
          className={`flex items-center gap-1.5 px-3.5 py-1 text-xs rounded-sm transition-all ${
            graphMode === "global"
              ? "bg-active text-accent-primary"
              : "text-text-secondary hover:bg-hover hover:text-text-primary"
          }`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>public</span>
          全局网络
        </button>
        <button
          type="button"
          onClick={() => {
            setGraphMode("local");
            if (!focusedNodeId) {
              const maxInDeg = mockGraphData.nodes.reduce((a, b) => (a.inDegree > b.inDegree ? a : b));
              setFocusedNodeId(maxInDeg.id);
            }
          }}
          className={`flex items-center gap-1.5 px-3.5 py-1 text-xs rounded-sm transition-all ${
            graphMode === "local"
              ? "bg-active text-accent-primary"
              : "text-text-secondary hover:bg-hover hover:text-text-primary"
          }`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>center_focus_strong</span>
          局部 1/2/3-hop
        </button>
      </div>

      {/* 局部模式提示 */}
      {graphMode === "local" && focusedNodeId && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3.5 py-1.5 bg-surface border border-accent-primary rounded-md text-[11px] font-mono text-accent-primary z-10 shadow-md">
          聚焦：{mockGraphData.nodes.find((n) => n.id === focusedNodeId)?.title} · 1-hop 邻域（{neighborhood?.size ?? 0} 节点）· 点击其他节点切换
        </div>
      )}

      {/* 筛选面板（左侧） */}
      <div className="absolute top-3 left-3 bg-surface border border-border-subtle rounded-md p-3 z-10 max-w-[180px]">
        <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase mb-2">领域筛选</div>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(DOMAIN_COLORS) as Domain[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                const next = new Set(filterDomains);
                if (next.has(d)) next.delete(d);
                else next.add(d);
                setFilterDomains(next);
              }}
              className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-sm transition-all ${
                filterDomains.has(d) ? "opacity-100" : "opacity-30"
              }`}
              style={{
                color: DOMAIN_COLORS[d],
                background: `color-mix(in srgb, ${DOMAIN_COLORS[d]} 15%, transparent)`,
              }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: DOMAIN_COLORS[d] }} />
              {DOMAIN_LABELS[d]}
            </button>
          ))}
        </div>
        <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase mt-3 mb-2">边类型</div>
        <div className="flex flex-wrap gap-1">
          {(["wikilink", "related", "tags"] as GraphEdge["type"][]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                const next = new Set(filterEdgeTypes);
                if (next.has(t)) next.delete(t);
                else next.add(t);
                setFilterEdgeTypes(next);
              }}
              className={`px-1.5 py-0.5 text-[10px] font-mono rounded-sm transition-all ${
                filterEdgeTypes.has(t)
                  ? "bg-active text-accent-primary"
                  : "bg-elevated text-text-muted opacity-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 图例（右侧） */}
      <div className="absolute top-3 right-3 bg-surface border border-border-subtle rounded-md p-3 z-10">
        <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase mb-2">节点形状 / 边类型</div>
        <div className="space-y-1 text-[11px] text-text-secondary">
          <LegendItem shape="circle" label="concept（圆）" />
          <LegendItem shape="square" label="entity（方）" />
          <LegendItem shape="diamond" label="source（菱）" />
          <LegendItem shape="triangle" label="experience（三角）" />
          <div className="h-1" />
          <EdgeLegend type="wikilink" />
          <EdgeLegend type="related" />
          <EdgeLegend type="tags" />
        </div>
      </div>

      {/* SVG 图谱 */}
      <svg viewBox="0 0 900 600" preserveAspectRatio="xMidYMid meet" className="w-full h-full">
        {/* 边 */}
        <g className="edges">
          {visibleEdges.map((edge, idx) => {
            const source = layout[edge.source];
            const target = layout[edge.target];
            if (!source || !target) return null;
            const isDimmed = neighborhood && (!neighborhood.has(edge.source) || !neighborhood.has(edge.target));
            const isHighlighted = neighborhood && (edge.source === focusedNodeId || edge.target === focusedNodeId);

            return (
              <line
                key={`edge-${idx}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={
                  edge.type === "wikilink" ? "#4a9eff" : edge.type === "related" ? "#5ba88a" : "#e0a458"
                }
                strokeWidth={edge.type === "wikilink" ? 1.5 : edge.type === "related" ? 1.3 : 1}
                strokeDasharray={edge.type === "related" ? "4 2" : edge.type === "tags" ? "1 3" : undefined}
                opacity={isDimmed ? 0.05 : isHighlighted ? 1 : edge.type === "wikilink" ? 0.6 : edge.type === "related" ? 0.5 : 0.3}
                style={{ transition: "opacity 0.2s" }}
              />
            );
          })}
        </g>

        {/* 聚焦节点的脉冲外环 */}
        {graphMode === "local" && focusedNodeId && layout[focusedNodeId] && (
          <circle
            cx={layout[focusedNodeId].x}
            cy={layout[focusedNodeId].y}
            r={nodeRadius(mockGraphData.nodes.find((n) => n.id === focusedNodeId)!.inDegree) + 8}
            fill="none"
            stroke="#4a9eff"
            strokeWidth={2}
            opacity={0.8}
            style={{ animation: "pulse-focus 1.5s ease-in-out infinite" }}
          />
        )}

        {/* 节点 */}
        <g className="nodes">
          {visibleNodes.map((node) => {
            const pos = layout[node.id];
            if (!pos) return null;
            const r = nodeRadius(node.inDegree);
            const color = DOMAIN_COLORS[node.domain];
            const isDimmed = neighborhood && !neighborhood.has(node.id);
            const isFocused = node.id === focusedNodeId;

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => {
                  if (graphMode === "local") setFocusedNodeId(node.id);
                }}
                style={{ cursor: "pointer", opacity: isDimmed ? 0.1 : 1, transition: "opacity 0.2s" }}
              >
                <path
                  d={nodeShapePath(node.type, r)}
                  fill={color}
                  fillOpacity={node.status === "archived" ? 0.2 : 0.18}
                  stroke={color}
                  strokeWidth={isFocused ? 3.5 : node.inDegree >= 4 ? 2.5 : node.inDegree >= 2 ? 1.8 : 1.5}
                  strokeDasharray={node.status === "staging" ? "4 2" : node.status === "pending" ? "2 2" : undefined}
                />
                <text
                  y={r + 12}
                  textAnchor="middle"
                  fontSize={10}
                  fill={node.inDegree >= 4 ? "var(--text-primary)" : "var(--text-secondary)"}
                  fontWeight={node.inDegree >= 4 ? 600 : 400}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {node.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* 底部统计 */}
      <div className="absolute bottom-3 left-3 px-3 py-1 bg-surface border border-border-subtle rounded-md text-[11px] font-mono text-text-muted z-10">
        {visibleNodes.length} 节点 · {visibleEdges.length} 边 · 孤儿页: {mockGraphData.summary.orphanPages} · 最大连通分量: {mockGraphData.summary.largestCcSize}
      </div>

      {/* 脉冲动画 keyframes（内联，避免全局污染） */}
      <style>{`
        @keyframes pulse-focus {
          0%, 100% { stroke-width: 2; opacity: 0.9; }
          50%      { stroke-width: 5; opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}

function LegendItem({ shape, label }: { shape: "circle" | "square" | "diamond" | "triangle"; label: string }) {
  const renderShape = () => {
    const stroke = "var(--text-secondary)";
    switch (shape) {
      case "circle":
        return <circle cx={7} cy={7} r={5} fill="none" stroke={stroke} strokeWidth={1.5} />;
      case "square":
        return <rect x={2} y={2} width={10} height={10} fill="none" stroke={stroke} strokeWidth={1.5} />;
      case "diamond":
        return <polygon points="7,1 13,7 7,13 1,7" fill="none" stroke={stroke} strokeWidth={1.5} />;
      case "triangle":
        return <polygon points="7,2 13,12 1,12" fill="none" stroke={stroke} strokeWidth={1.5} />;
    }
  };
  return (
    <div className="flex items-center gap-2">
      <svg width={14} height={14}>{renderShape()}</svg>
      <span>{label}</span>
    </div>
  );
}

function EdgeLegend({ type }: { type: GraphEdge["type"] }) {
  const color = type === "wikilink" ? "#4a9eff" : type === "related" ? "#5ba88a" : "#e0a458";
  const dash = type === "related" ? "4 2" : type === "tags" ? "1 3" : undefined;
  return (
    <div className="flex items-center gap-2">
      <svg width={20} height={6}>
        <line x1={0} y1={3} x2={20} y2={3} stroke={color} strokeWidth={1.5} strokeDasharray={dash} />
      </svg>
      <span>{type}</span>
    </div>
  );
}
