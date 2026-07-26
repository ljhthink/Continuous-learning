/**
 * GraphView — 知识网络图谱（核心组件）
 *
 * P4 计划 §4.4.9：节点视觉编码（颜色按领域、大小按入度、形状按 type）
 * + 边编码（实线 wikilink / 虚线 related / 点线 tags）
 * + 全局/局部双模 + 筛选面板 + 图例。
 *
 * Phase 4c：使用 react-force-graph-2d + d3-force 力导向布局，接入真实
 * MCP server 的 kb_get_graph 数据。浏览器 dev 模式回退到 mockGraphData。
 *
 * 节点编码：
 *   - 颜色 = 领域（DOMAIN_COLORS）
 *   - 大小 = 入度（sqrt scale）
 *   - 形状 = type（concept 圆 / entity 方 / source 菱 / experience 三角）
 *   - 描边 = 入度（粗 = 高引用）
 *   - 虚线描边 = status（staging/pending）
 *
 * 边编码：
 *   - wikilink: 蓝色实线，opacity 0.6
 *   - related:  绿色虚线 4-2，opacity 0.5
 *   - tags:     橙色点线 1-3，opacity 0.3
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { useViewStore } from "@/store/viewStore";
import { mockGraphData } from "@/data/mockData";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "@/types";
import type { GraphNode, GraphEdge, Domain, PageType, GraphData } from "@/types";
import { callMcpTool, isTauri } from "@/lib/ipc";

// ---------------------------------------------------------------------------
// 节点形状渲染（Canvas 2D）
// ---------------------------------------------------------------------------

function drawNodeShape(ctx: CanvasRenderingContext2D, type: PageType, r: number): void {
  switch (type) {
    case "concept": // 圆
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "entity": // 方
      ctx.beginPath();
      ctx.rect(-r, -r, r * 2, r * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "source": // 菱
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "experience": // 三角
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, r * 0.8);
      ctx.lineTo(-r, r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
  }
}

function nodeRadius(inDegree: number): number {
  return Math.max(5, Math.min(20, Math.sqrt(inDegree + 1) * 3.5));
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

export function GraphView() {
  const { graphMode, setGraphMode, setCurrentPagePath, setView } = useViewStore();
  const [filterDomains, setFilterDomains] = useState<Set<Domain>>(
    new Set(Object.keys(DOMAIN_COLORS) as Domain[]),
  );
  const [filterEdgeTypes, setFilterEdgeTypes] = useState<Set<GraphEdge["type"]>>(
    new Set(["wikilink", "related"]),
  );
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData>(mockGraphData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const tauriEnv = isTauri();

  // 加载真实图谱数据（仅 Tauri 环境）
  useEffect(() => {
    if (!tauriEnv) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    callMcpTool("kb_get_graph", { include_statuses: ["active", "staging"] })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          const data = result.data as GraphData;
          if (data.nodes && data.nodes.length > 0) {
            setGraphData(data);
          }
        } else {
          setError(result.error ?? "加载图谱失败");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tauriEnv]);

  // 局部模式：计算聚焦节点的 1-hop 邻域
  const neighborhood = useMemo(() => {
    if (graphMode !== "local" || !focusedNodeId) return null;
    const nb = new Set<string>([focusedNodeId]);
    graphData.edges.forEach((e) => {
      if (e.source === focusedNodeId) nb.add(e.target);
      if (e.target === focusedNodeId) nb.add(e.source);
    });
    return nb;
  }, [graphMode, focusedNodeId, graphData]);

  // 过滤后的节点和边
  const filteredGraph = useMemo(() => {
    const visibleNodes = graphData.nodes.filter((n) => filterDomains.has(n.domain));
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = graphData.edges.filter(
      (e) =>
        filterEdgeTypes.has(e.type) &&
        visibleNodeIds.has(e.source) &&
        visibleNodeIds.has(e.target),
    );

    // react-force-graph-2d 期望 `links` 而非 `edges`，且 source/target 为 id 字符串
    // （内部会替换为节点对象引用）
    return {
      nodes: visibleNodes.map((n) => ({ ...n })),
      links: visibleEdges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
      })),
    };
  }, [graphData, filterDomains, filterEdgeTypes]);

  // 节点点击：局部模式切换聚焦 / 全局模式跳转预览
  const handleNodeClick = useCallback(
    (node: { id?: string }) => {
      const nodeId = node.id;
      if (!nodeId) return;
      if (graphMode === "local") {
        setFocusedNodeId(nodeId);
      } else {
        // 全局模式：点击节点跳转到预览
        const graphNode = graphData.nodes.find((n) => n.id === nodeId);
        if (graphNode) {
          setCurrentPagePath(graphNode.path);
          setView("preview");
        }
      }
    },
    [graphMode, graphData.nodes, setCurrentPagePath, setView],
  );

  // 节点 hover：显示 title tooltip（react-force-graph-2d 内置 nodeLabel）
  const nodeLabel = useCallback((node: { title?: string; domain?: string; inDegree?: number }) => {
    return `<div style="background:var(--bg-surface);color:var(--text-primary);padding:6px 10px;border:1px solid var(--border-subtle);border-radius:4px;font-size:12px;max-width:240px">
      <div style="font-weight:600">${node.title ?? "(untitled)"}</div>
      <div style="color:var(--text-muted);font-size:11px;margin-top:2px">
        ${node.domain ?? ""} · inDeg=${node.inDegree ?? 0}
      </div>
    </div>`;
  }, []);

  // 节点 Canvas 绘制
  const nodeCanvasObject = useCallback(
    (node: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x?: number; y?: number };
      if (n.x === undefined || n.y === undefined) return;
      const r = nodeRadius(n.inDegree);
      const color = DOMAIN_COLORS[n.domain] ?? "#888";

      const isDimmed = neighborhood !== null && !neighborhood.has(n.id);
      const isFocused = n.id === focusedNodeId;

      ctx.save();
      ctx.translate(n.x, n.y);

      // 透明度：邻域外的节点淡化
      ctx.globalAlpha = isDimmed ? 0.12 : 1;

      // 填充 + 描边
      ctx.fillStyle = color;
      ctx.globalAlpha = isDimmed ? 0.05 : n.status === "archived" ? 0.15 : 0.2;
      ctx.strokeStyle = color;
      ctx.lineWidth = isFocused ? 3.5 / globalScale : n.inDegree >= 4 ? 2.5 / globalScale : 1.5 / globalScale;
      if (n.status === "staging" || n.status === "pending") {
        ctx.setLineDash([4 / globalScale, 2 / globalScale]);
      }

      drawNodeShape(ctx, n.type, r);

      // 聚焦节点的脉冲外环
      if (isFocused) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / globalScale;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(0, 0, r + 6 / globalScale, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      // 标签：仅在缩放足够或入度高时显示
      if (globalScale >= 1.5 || n.inDegree >= 4 || isFocused) {
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.globalAlpha = isDimmed ? 0.2 : 1;
        ctx.font = `${n.inDegree >= 4 ? 11 : 10}px Inter, sans-serif`;
        ctx.fillStyle = n.inDegree >= 4 ? "var(--text-primary)" : "var(--text-secondary)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const label = n.title.length > 28 ? n.title.slice(0, 27) + "…" : n.title;
        ctx.fillText(label, 0, r + 4);
        ctx.restore();
      }
    },
    [neighborhood, focusedNodeId],
  );

  // 边绘制（颜色 + 虚线样式）
  const linkCanvasObject = useCallback(
    (link: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const l = link as { source?: { x?: number; y?: number }; target?: { x?: number; y?: number }; type?: string };
      const source = l.source as { x?: number; y?: number } | undefined;
      const target = l.target as { x?: number; y?: number } | undefined;
      if (!source?.x || !source?.y || !target?.x || !target?.y) return;

      const type = l.type as GraphEdge["type"];
      const color = type === "wikilink" ? "#4a9eff" : type === "related" ? "#5ba88a" : "#e0a458";
      const opacity = type === "wikilink" ? 0.6 : type === "related" ? 0.5 : 0.3;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = opacity;
      ctx.lineWidth = (type === "wikilink" ? 1.5 : type === "related" ? 1.3 : 1) / globalScale;
      if (type === "related") {
        ctx.setLineDash([4 / globalScale, 2 / globalScale]);
      } else if (type === "tags") {
        ctx.setLineDash([1 / globalScale, 3 / globalScale]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.restore();
    },
    [],
  );

  // 切换到局部模式时自动聚焦最高入度节点
  useEffect(() => {
    if (graphMode === "local" && !focusedNodeId && graphData.nodes.length > 0) {
      const maxInDeg = graphData.nodes.reduce((a, b) => (a.inDegree > b.inDegree ? a : b));
      setFocusedNodeId(maxInDeg.id);
    }
  }, [graphMode, focusedNodeId, graphData.nodes]);

  // 重置视图按钮
  const handleResetView = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 60);
    }
    setFocusedNodeId(null);
  }, []);

  const handleFitView = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 60);
    }
  }, []);

  return (
    <div className="relative w-full h-full bg-canvas overflow-hidden">
      {/* 工具栏（顶部居中）：模式切换 + 重置/适应 */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        <div className="flex bg-surface border border-border-subtle rounded-md p-0.5 shadow-md">
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
            onClick={() => setGraphMode("local")}
            className={`flex items-center gap-1.5 px-3.5 py-1 text-xs rounded-sm transition-all ${
              graphMode === "local"
                ? "bg-active text-accent-primary"
                : "text-text-secondary hover:bg-hover hover:text-text-primary"
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>center_focus_strong</span>
            局部 1-hop
          </button>
        </div>
        <div className="flex bg-surface border border-border-subtle rounded-md p-0.5 shadow-md">
          <button
            type="button"
            onClick={handleResetView}
            className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-sm text-text-secondary hover:bg-hover hover:text-text-primary transition-all"
            title="重置视图（清除聚焦 + 缩放适应）"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restart_alt</span>
            重置
          </button>
          <button
            type="button"
            onClick={handleFitView}
            className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-sm text-text-secondary hover:bg-hover hover:text-text-primary transition-all"
            title="缩放至适应所有节点"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>fit_screen</span>
            适应
          </button>
        </div>
      </div>

      {/* 局部模式提示 */}
      {graphMode === "local" && focusedNodeId && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3.5 py-1.5 bg-surface border border-accent-primary rounded-md text-[11px] font-mono text-accent-primary z-10 shadow-md">
          聚焦：{graphData.nodes.find((n) => n.id === focusedNodeId)?.title} · 1-hop 邻域（{neighborhood?.size ?? 0} 节点）· 点击其他节点切换
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-2 bg-surface border border-border-subtle rounded-md text-xs text-text-secondary z-10 shadow-md">
          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 16, verticalAlign: "middle" }}>progress_activity</span>
          {" "}加载知识图谱...
        </div>
      )}

      {/* 错误提示 */}
      {error && !loading && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3.5 py-1.5 bg-surface border border-red-500 rounded-md text-[11px] text-red-400 z-10 shadow-md max-w-md">
          ⚠️ {error}（显示 mock 数据）
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

      {/* 力导向图谱 */}
      <ForceGraph2D
        ref={graphRef}
        graphData={filteredGraph}
        nodeCanvasObject={nodeCanvasObject}
        linkCanvasObject={linkCanvasObject}
        nodeRelSize={6}
        nodeId="id"
        nodeLabel={nodeLabel as (node: unknown) => string}
        linkSource="source"
        linkTarget="target"
        onNodeClick={handleNodeClick as (node: unknown) => void}
        cooldownTicks={150}
        width={typeof window !== "undefined" ? window.innerWidth - 48 : 1200}
        height={typeof window !== "undefined" ? window.innerHeight - 120 : 800}
        backgroundColor="transparent"
        enableNodeDrag
        enableZoomInteraction
        enablePanInteraction
      />

      {/* 底部统计 */}
      <div className="absolute bottom-3 left-3 px-3 py-1 bg-surface border border-border-subtle rounded-md text-[11px] font-mono text-text-muted z-10">
        {filteredGraph.nodes.length} 节点 · {filteredGraph.links.length} 边 · 孤儿页: {graphData.summary.orphanPages} · 最大连通分量: {graphData.summary.largestCcSize}
        {!tauriEnv && <span className="ml-2 text-amber-400">（mock 数据）</span>}
      </div>
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
