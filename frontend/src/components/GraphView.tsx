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
 *
 * 交互（DEF-1/2/3/4 修复）：
 *   - 键盘：+/- 缩放 · 0/F 适应 · G 模式切换 · Tab 节点循环 · Enter 跳转 · Esc 取消
 *   - 鼠标：单击选中 · 双击跳转预览 · 右键菜单 · 拖拽节点 · 滚轮缩放 · 拖拽空白平移
 *   - 筛选：领域 / 类型 / 状态 / 边类型 / 局部跳数 五维
 *   - 局部模式：1/2/3-hop BFS 邻域
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { forceCollide } from "d3-force-3d";
import { useViewStore } from "@/store/viewStore";
import { useGraphStore } from "@/store/graphStore";
import { DOMAIN_COLORS, DOMAIN_LABELS, domainColor, domainLabel } from "@/types";
import type { GraphNode, GraphEdge, Domain, PageType, PageStatus, GraphData } from "@/types";
import { callMcpTool, isTauri } from "@/lib/ipc";
import { escapeHtml } from "@/lib/html-utils";

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

/** 页面类型中文标签（用于筛选提示条 + 筛选按钮） */
const PAGE_TYPE_LABELS: Record<PageType, string> = {
  concept: "概念",
  entity: "实体",
  source: "来源",
  experience: "经验",
};

/** UX-5: 类型含义说明（筛选按钮 tooltip），帮助用户理解分类依据 */
const PAGE_TYPE_TOOLTIPS: Record<PageType, string> = {
  concept: "概念页：解释某个概念/原理的知识页（如「异步编程模式」）",
  entity: "实体页：描述具体对象/工具/库的知识页（如「Python asyncio 库」）",
  source: "来源页：从原始资料（PDF/Word 等）ingest 生成的页面",
  experience: "经验卡片：编码实践中沉淀的可复用方案/踩坑记录",
};

/** UX-5: 状态中文标签 + 说明（筛选按钮用中文 + tooltip） */
const STATUS_LABELS_ZH: Record<PageStatus, string> = {
  active: "正式",
  staging: "待审",
  pending: "待审",
  archived: "归档",
  rejected: "驳回",
};
const STATUS_TOOLTIPS: Record<PageStatus, string> = {
  active: "已通过审核，进入正式知识库",
  staging: "从原始资料 ingest，等待用户确认入库",
  pending: "经验卡片待审核（inbox）",
  archived: "老化降级，仍可检索但不进 top 结果",
  rejected: "审核驳回，不进入正式库",
};

/** UX-5: 边类型中文标签 + 说明 */
const EDGE_TYPE_LABELS: Record<GraphEdge["type"], string> = {
  wikilink: "正文引用",
  related: "相关关联",
  tags: "标签同属",
};
const EDGE_TYPE_TOOLTIPS: Record<GraphEdge["type"], string> = {
  wikilink: "页面正文中通过 [[wikilink]] 直接引用的关系",
  related: "frontmatter related 字段声明的相关页面",
  tags: "共享相同 tag 的页面（基于 tags 字段聚类）",
};

function nodeRadius(inDegree: number, type?: PageType): number {
  // 按类型设置最小半径，确保低入度节点也清晰可见
  // experience 节点通常入度低（0-1），但作为高价值内容不应被埋没
  const minRadiusByType: Record<PageType, number> = {
    experience: 12,
    source: 10,
    concept: 7,
    entity: 7,
  };
  const minRadius = type ? minRadiusByType[type] : 5;
  return Math.max(minRadius, Math.min(20, Math.sqrt(inDegree + 1) * 3.5));
}

/** 所有类型/状态的枚举数组（用于筛选面板渲染） */
const ALL_TYPES: PageType[] = ["concept", "entity", "source", "experience"];
const ALL_STATUSES: PageStatus[] = ["active", "staging", "pending", "archived"];
const ALL_EDGE_TYPES: GraphEdge["type"][] = ["wikilink", "related", "tags"];

// ---------------------------------------------------------------------------
// 右键菜单
// ---------------------------------------------------------------------------

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

export function GraphView() {
  const {
    currentView,
    currentDomain,
    currentType,
    graphMode,
    setGraphMode,
    setCurrentPagePath,
    setView,
    theme,
  } = useViewStore();
  const [filterDomains, setFilterDomains] = useState<Set<Domain>>(
    new Set(Object.keys(DOMAIN_COLORS) as Domain[]),
  );
  const [filterEdgeTypes, setFilterEdgeTypes] = useState<Set<GraphEdge["type"]>>(
    new Set(["wikilink", "related"]),
  );
  // DEF-2: 类型 + 状态筛选
  const [filterTypes, setFilterTypes] = useState<Set<PageType>>(
    new Set(ALL_TYPES),
  );
  const [filterStatuses, setFilterStatuses] = useState<Set<PageStatus>>(
    new Set(ALL_STATUSES),
  );
  // DEF-3: 局部模式跳数
  const [localHop, setLocalHop] = useState<1 | 2 | 3>(1);

  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  // DEF-4: 键盘选中节点（区别于局部模式聚焦节点）
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // DEF-4: 右键菜单
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // 图谱数据从共享 graphStore 读取（GraphStats 右栏面板也读取同一份），
  // 避免重复请求 kb_get_graph，且确保统计面板显示真实数据而非 mock。
  const { graphData, loading, error, setGraphData, setLoading, setError, reloadTrigger } = useGraphStore();
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 双击检测：onNodeDoubleClick 不在 react-force-graph-2d 的 props 中，
  // 用 onNodeClick + 时间窗口（350ms）模拟双击
  const lastClickTimeRef = useRef<number>(0);
  const lastClickNodeIdRef = useRef<string | null>(null);
  const tauriEnv = isTauri();

  // Canvas 2D API 不支持 CSS 变量（如 `var(--text-primary)`），需读取实际颜色值。
  // 在主题切换时重新读取。
  const themeColors = useRef({ primary: "#e6e9ef", secondary: "#9aa3b2" });
  useEffect(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    themeColors.current = {
      primary: style.getPropertyValue("--text-primary").trim() || "#e6e9ef",
      secondary: style.getPropertyValue("--text-secondary").trim() || "#9aa3b2",
    };
  }, [theme]);

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
            // P5-R4 fix: 防御性归一化 — frontmatter 损坏导致 domain/type/status
            // 为 null 时，赋予默认值而非静默排除（考古报告问题 2 根因防御）。
            const normalizedData: GraphData = {
              ...data,
              nodes: data.nodes.map((n) => ({
                ...n,
                domain: (n.domain ?? "coding") as Domain,
                type: (n.type ?? "source") as PageType,
                status: (n.status ?? "active") as PageStatus,
              })),
            };
            setGraphData(normalizedData);
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
  }, [tauriEnv, reloadTrigger]);

  // DEF-3: 局部模式 N-hop 邻域（BFS）
  const neighborhood = useMemo(() => {
    if (graphMode !== "local" || !focusedNodeId) return null;
    const nb = new Set<string>([focusedNodeId]);
    let frontier: string[] = [focusedNodeId];
    for (let hop = 0; hop < localHop; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const e of graphData.edges) {
          if (e.source === id && !nb.has(e.target)) {
            nb.add(e.target);
            next.push(e.target);
          }
          if (e.target === id && !nb.has(e.source)) {
            nb.add(e.source);
            next.push(e.source);
          }
        }
      }
      frontier = next;
    }
    return nb;
  }, [graphMode, focusedNodeId, graphData, localHop]);

  // 过滤后的节点和边（DEF-2: 五维筛选）
  // currentDomain 来自 viewStore（CategoryTree 点击），优先级高于本地图谱筛选面板。
  // 当用户在左栏点击某领域时，currentDomain 被设置，图谱只显示该领域的节点。
  // 当 currentDomain 为 null（"全部"），使用本地 filterDomains 集合。
  // currentType 来自 viewStore（CategoryTree "按类型筛选"点击），非 null 时只显示该类型。
  const filteredGraph = useMemo(() => {
    const activeDomainFilter = currentDomain
      ? new Set<Domain>([currentDomain])
      : filterDomains;
    const visibleNodes = graphData.nodes.filter(
      (n) =>
        activeDomainFilter.has(n.domain) &&
        (currentType ? n.type === currentType : filterTypes.has(n.type)) &&
        filterStatuses.has(n.status),
    );
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = graphData.edges.filter(
      (e) =>
        filterEdgeTypes.has(e.type) &&
        visibleNodeIds.has(e.source) &&
        visibleNodeIds.has(e.target),
    );

    // react-force-graph-2d 期望 `links` 而非 `edges`，且 source/target 为 id 字符串
    // （内部会替换为节点对象引用）
    // 注意：不 spread 节点对象（`{...n}`），保持引用稳定——否则 force simulation
    // 每次重渲染都视为新节点，丢失 x/y 坐标，导致拖动后无法再次拖动。
    return {
      nodes: visibleNodes,
      links: visibleEdges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
      })),
    };
  }, [graphData, filterDomains, filterEdgeTypes, filterTypes, filterStatuses, currentDomain, currentType]);

  // d3-force 物理参数配置
  // 修复"三个大领域节点混在一起"+"物理效果缺失"问题：
  //   - charge -500：强斥力让同类节点自然聚拢、异类节点分开
  //   - linkDistance 90：加长边，给节点更多空间避免重叠
  //   - center gravity 0.08：适度收敛，避免图谱散开过远
  //   - forceCollide：碰撞检测，防止节点重叠（核心修复）
  //   - velocityDecay 0.4：通过 prop 设置（d3VelocityDecay 方法不在 react-kapsule 白名单中）
  //
  // 关键修复：依赖数组改为 [graphData.nodes.length]
  // 原因：当 mock 数据（37 节点）切换到真实 kb_get_graph 数据时，
  // react-force-graph-2d 会重建 simulation，但旧的 force 配置会丢失。
  // 必须在节点数量变化时重新配置力参数。
  // 用 nodes.length 而非 graphData 引用，避免 filteredGraph 变化导致的频繁重配置。
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    // charge: 节点间斥力（负值），-500 强斥力确保节点分散
    const charge = fg.d3Force("charge");
    if (charge) charge.strength(-500);
    // link: 边的弹簧力，distance 90 增加边长
    const link = fg.d3Force("link");
    if (link) link.distance(90);
    // center gravity: 向中心聚集的力
    const gravity = fg.d3Force("center");
    if (gravity) gravity.strength(0.08);
    // collide: 碰撞检测力，防止节点重叠
    // radius = 节点视觉半径 + 8px 间距，iterations=3 提高碰撞检测精度
    fg.d3Force(
      "collide",
      forceCollide((node: unknown) => {
        const n = node as GraphNode;
        return nodeRadius(n.inDegree ?? 0, n.type) + 8;
      }).iterations(3),
    );
    // 重新加热模拟
    fg.d3ReheatSimulation();
  }, [graphData.nodes.length]);

  // 当 currentDomain 变化（CategoryTree 点击）时，重新加热模拟以重布局
  // 筛选后的节点子集。不重新配置 force 参数（避免叠加）。
  // 守卫：仅在图谱可见时执行 reheat + zoomToFit，避免 display:none 时浪费 CPU。
  // 不可见时切换的领域过滤会在切回图谱视图后由 filteredGraph 自动应用。
  useEffect(() => {
    if (currentView !== "graph") return;
    const fg = graphRef.current;
    if (!fg) return;
    fg.d3ReheatSimulation();
    // 给 simulation 一点时间稳定后 zoomToFit
    const timer = setTimeout(() => {
      fg.zoomToFit(400, 60);
    }, 300);
    return () => clearTimeout(timer);
  }, [currentDomain, currentType, currentView]);

  // 跳转到预览（复用于双击、Enter、右键菜单）
  const navigateToNode = useCallback(
    (nodeId: string) => {
      const graphNode = graphData.nodes.find((n) => n.id === nodeId);
      if (graphNode) {
        setCurrentPagePath(graphNode.path);
        setView("preview");
      }
    },
    [graphData.nodes, setCurrentPagePath, setView],
  );

  // DEF-4: 单击 = 选中（全局模式）/ 切换聚焦（局部模式）；双击 = 跳转预览
  // react-force-graph-2d 无 onNodeDoubleClick，用时间窗口模拟
  const handleNodeClick = useCallback(
    (node: { id?: string }) => {
      const nodeId = node.id;
      if (!nodeId) return;
      const now = Date.now();
      const isDoubleClick =
        lastClickNodeIdRef.current === nodeId &&
        now - lastClickTimeRef.current < 350;
      lastClickTimeRef.current = now;
      lastClickNodeIdRef.current = nodeId;

      setSelectedNodeId(nodeId);
      setContextMenu(null);

      if (isDoubleClick) {
        // 双击：跳转预览
        navigateToNode(nodeId);
      } else if (graphMode === "local") {
        // 单击（局部模式）：切换聚焦
        setFocusedNodeId(nodeId);
      }
    },
    [graphMode, navigateToNode],
  );

  // DEF-4: 右键 = 菜单
  const handleNodeRightClick = useCallback(
    (node: { id?: string }, ev: { clientX?: number; clientY?: number; x?: number; y?: number }) => {
      const nodeId = node.id;
      if (!nodeId) return;
      const x = ev.clientX ?? ev.x ?? 0;
      const y = ev.clientY ?? ev.y ?? 0;
      setContextMenu({ x, y, nodeId });
      setSelectedNodeId(nodeId);
    },
    [],
  );

  // 关闭右键菜单（点击空白）
  const handleBackgroundClick = useCallback(() => {
    if (contextMenu) setContextMenu(null);
  }, [contextMenu]);

  // 节点 hover：显示 title tooltip（react-force-graph-2d 内置 nodeLabel）
  // XSS 防御：node.title / node.domain / node.type 来自 wiki 页面 frontmatter（用户可控），
  // react-force-graph-2d 内部用 innerHTML 渲染 tooltip，直接拼接会导致存储型 XSS。
  // 在 Tauri 环境下 webview XSS 可能通过 IPC 导致 RCE，所以所有用户可控字段
  // 必须经 escapeHtml 转义后再插入 HTML 字符串。
  // 数值字段（inDegree/outDegree）虽然来自后端计算，也一并转义以保持一致性与防御深度。
  const nodeLabel = useCallback(
    (node: { title?: string; domain?: string; inDegree?: number; outDegree?: number; type?: string }) => {
      const title = escapeHtml(node.title ?? "(untitled)");
      const domain = escapeHtml(node.domain ?? "");
      const type = escapeHtml(node.type ?? "");
      const inDeg = escapeHtml(node.inDegree ?? 0);
      const outDeg = escapeHtml(node.outDegree ?? 0);
      return `<div style="background:var(--bg-surface);color:var(--text-primary);padding:6px 10px;border:1px solid var(--border-subtle);border-radius:4px;font-size:12px;max-width:240px">
        <div style="font-weight:600">${title}</div>
        <div style="color:var(--text-muted);font-size:11px;margin-top:2px">
          ${domain} · ${type} · inDeg=${inDeg} · outDeg=${outDeg}
        </div>
      </div>`;
    },
    [],
  );

  // 节点 Canvas 绘制
  const nodeCanvasObject = useCallback(
    (node: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x?: number; y?: number };
      if (n.x === undefined || n.y === undefined) return;
      const r = nodeRadius(n.inDegree ?? 0, n.type);
      const color = DOMAIN_COLORS[n.domain] ?? "#888";

      const isDimmed = neighborhood !== null && !neighborhood.has(n.id);
      const isFocused = n.id === focusedNodeId;
      const isSelected = n.id === selectedNodeId;

      ctx.save();
      ctx.translate(n.x, n.y);

      // 填充 + 描边
      // 透明度：邻域外的节点淡化，archived 节点更淡
      // 修复死码：原 L402 globalAlpha 被 L406 覆盖，合并为一处设置
      ctx.fillStyle = color;
      ctx.globalAlpha = isDimmed ? 0.05 : n.status === "archived" ? 0.15 : 0.2;
      ctx.strokeStyle = color;
      // 选中节点用 accent-primary 描边加粗
      if (isSelected) {
        ctx.strokeStyle = "#4a9eff";
        ctx.lineWidth = 3.5 / globalScale;
      } else if (isFocused) {
        ctx.lineWidth = 3.5 / globalScale;
      } else if (n.inDegree >= 4) {
        ctx.lineWidth = 2.5 / globalScale;
      } else {
        ctx.lineWidth = 1.5 / globalScale;
      }
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

      // 选中节点的方框外环
      if (isSelected && !isFocused) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#4a9eff";
        ctx.lineWidth = 2 / globalScale;
        ctx.setLineDash([2 / globalScale, 2 / globalScale]);
        ctx.beginPath();
        ctx.arc(0, 0, r + 4 / globalScale, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      // 标签：experience/source 类型始终显示（高价值内容不应被埋没）
      // concept/entity 在缩放足够或入度高时显示
      const alwaysShowLabel = n.type === "experience" || n.type === "source";
      if (alwaysShowLabel || globalScale >= 1.5 || n.inDegree >= 4 || isFocused || isSelected) {
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.globalAlpha = isDimmed ? 0.2 : 1;
        // experience/source 节点用更大字号和主色，确保可读性
        const isHighValue = alwaysShowLabel;
        ctx.font = `${n.inDegree >= 4 || isHighValue ? 11 : 10}px Inter, sans-serif`;
        ctx.fillStyle = n.inDegree >= 4 || isHighValue
          ? themeColors.current.primary
          : themeColors.current.secondary;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const label = n.title.length > 28 ? n.title.slice(0, 27) + "…" : n.title;
        ctx.fillText(label, 0, r + 4);
        ctx.restore();
      }
    },
    [neighborhood, focusedNodeId, selectedNodeId],
  );

  // 边绘制（颜色 + 虚线样式）
  const linkCanvasObject = useCallback(
    (link: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const l = link as {
        source?: { x?: number; y?: number };
        target?: { x?: number; y?: number };
        type?: string;
      };
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
      const maxInDeg = graphData.nodes.reduce((a, b) =>
        a.inDegree > b.inDegree ? a : b,
      );
      setFocusedNodeId(maxInDeg.id);
    }
  }, [graphMode, focusedNodeId, graphData.nodes]);

  // 重置视图按钮
  const handleResetView = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 60);
    }
    setFocusedNodeId(null);
    setSelectedNodeId(null);
  }, []);

  const handleFitView = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 60);
    }
  }, []);

  // DEF-1: 键盘快捷键
  useEffect(() => {
    if (currentView !== "graph") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框中的按键
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      const fg = graphRef.current;
      switch (e.key) {
        case "+":
        case "=": {
          e.preventDefault();
          if (fg) {
            const cur = typeof fg.zoom === "function" ? fg.zoom() : 1;
            fg.zoom(cur * 1.3, 300);
          }
          break;
        }
        case "-":
        case "_": {
          e.preventDefault();
          if (fg) {
            const cur = typeof fg.zoom === "function" ? fg.zoom() : 1;
            fg.zoom(cur / 1.3, 300);
          }
          break;
        }
        case "0": {
          e.preventDefault();
          if (fg) fg.zoomToFit(400, 60);
          break;
        }
        case "f":
        case "F": {
          e.preventDefault();
          if (fg) fg.zoomToFit(400, 60);
          break;
        }
        case "g":
        case "G": {
          e.preventDefault();
          setGraphMode(graphMode === "global" ? "local" : "global");
          break;
        }
        case "Tab": {
          e.preventDefault();
          if (!fg) break;
          // 修复：getGraph() 不在 react-kapsule methodNames 白名单中，恒返回 undefined。
          // 改为从 filteredGraph（当前可见节点）读取节点列表。
          // filteredGraph.nodes 保留了 d3-force 添加的 x/y 坐标（引用稳定，不 spread）。
          const simNodes = filteredGraph.nodes as Array<GraphNode & { x?: number; y?: number }>;
          if (!simNodes || simNodes.length === 0) break;
          const ids = simNodes.map((n) => n.id).filter((id): id is string => typeof id === "string");
          if (ids.length === 0) break;
          const curIdx = selectedNodeId ? ids.indexOf(selectedNodeId) : -1;
          const nextIdx = (curIdx + 1) % ids.length;
          const nextId = ids[nextIdx];
          setSelectedNodeId(nextId);
          const nextNode = simNodes.find((n) => n.id === nextId);
          if (nextNode && typeof nextNode.x === "number" && typeof nextNode.y === "number") {
            fg.centerAt(nextNode.x, nextNode.y, 300);
            fg.zoom(1.8, 300);
          }
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (selectedNodeId) {
            navigateToNode(selectedNodeId);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          if (contextMenu) {
            setContextMenu(null);
          } else if (selectedNodeId) {
            setSelectedNodeId(null);
          } else if (graphMode === "local") {
            setGraphMode("global");
          }
          break;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentView,
    graphMode,
    selectedNodeId,
    contextMenu,
    setGraphMode,
    navigateToNode,
    filteredGraph,
  ]);

  // 右键菜单项：复制路径
  const handleCopyPath = useCallback(async (nodeId: string) => {
    const node = graphData.nodes.find((n) => n.id === nodeId);
    if (node && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(node.path);
      } catch {
        // 忽略剪贴板权限失败
      }
    }
    setContextMenu(null);
  }, [graphData.nodes]);

  // 右键菜单项：聚焦（切换到局部模式并聚焦）
  const handleFocusNode = useCallback((nodeId: string) => {
    setGraphMode("local");
    setFocusedNodeId(nodeId);
    setContextMenu(null);
  }, [setGraphMode]);

  // 切换集合中某个元素的辅助函数
  const toggleSetItem = <T,>(set: Set<T>, item: T): Set<T> => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    return next;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-canvas overflow-hidden"
      onClick={handleBackgroundClick}
    >
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
            局部 {localHop}-hop
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
        {/* 键盘快捷键提示 */}
        <div className="hidden md:flex items-center px-2.5 py-1 bg-surface border border-border-subtle rounded-md text-[10px] font-mono text-text-muted shadow-md">
          <span title="放大">+</span>
          <span className="mx-1">·</span>
          <span title="缩小">−</span>
          <span className="mx-1">·</span>
          <span title="适应">F</span>
          <span className="mx-1">·</span>
          <span title="模式切换">G</span>
          <span className="mx-1">·</span>
          <span title="节点循环">Tab</span>
          <span className="mx-1">·</span>
          <span title="跳转">↵</span>
          <span className="mx-1">·</span>
          <span title="取消">Esc</span>
        </div>
      </div>

      {/* 局部模式提示 */}
      {graphMode === "local" && focusedNodeId && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3.5 py-1.5 bg-surface border border-accent-primary rounded-md text-[11px] font-mono text-accent-primary z-10 shadow-md">
          聚焦：{graphData.nodes.find((n) => n.id === focusedNodeId)?.title} · {localHop}-hop 邻域（{neighborhood?.size ?? 0} 节点）· 点击其他节点切换聚焦
        </div>
      )}

      {/* 领域过滤提示（来自左栏 CategoryTree 点击） */}
      {currentDomain && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-1.5 bg-surface border rounded-md text-[11px] z-10 shadow-md"
          style={{ borderColor: domainColor(currentDomain), color: domainColor(currentDomain) }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: domainColor(currentDomain) }} />
          <span>领域筛选：{domainLabel(currentDomain)}（{graphData.nodes.filter((n) => n.domain === currentDomain).length} 节点）</span>
          <button
            type="button"
            onClick={() => useViewStore.getState().setDomain(null)}
            className="ml-1 px-1.5 py-0.5 text-[10px] rounded-sm bg-elevated text-text-secondary hover:text-text-primary transition-colors"
            title="清除领域筛选（显示全部）"
          >
            ✕ 清除
          </button>
        </div>
      )}

      {/* 类型筛选提示条 */}
      {currentType && (
        <div className={`absolute ${currentDomain ? "top-24" : "top-14"} left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-1.5 bg-surface border rounded-md text-[11px] z-10 shadow-md`}
          style={{ borderColor: "var(--accent-primary)", color: "var(--accent-primary)" }}
        >
          <span>类型筛选：{PAGE_TYPE_LABELS[currentType]}（{graphData.nodes.filter((n) => n.type === currentType).length} 节点）</span>
          <button
            type="button"
            onClick={() => useViewStore.getState().setType(null)}
            className="ml-1 px-1.5 py-0.5 text-[10px] rounded-sm bg-elevated text-text-secondary hover:text-text-primary transition-colors"
            title="清除类型筛选（显示全部）"
          >
            ✕ 清除
          </button>
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

      {/* 筛选面板（左侧）— DEF-2: 五维筛选 */}
      <div className="absolute top-3 left-3 bg-surface border border-border-subtle rounded-md p-3 z-10 max-w-[200px] max-h-[calc(100%-100px)] overflow-y-auto">
        <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase mb-2">领域筛选</div>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(DOMAIN_COLORS) as Domain[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setFilterDomains((s) => toggleSetItem(s, d))}
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

        <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase mt-3 mb-2">类型</div>
        <div className="flex flex-wrap gap-1">
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterTypes((s) => toggleSetItem(s, t))}
              title={PAGE_TYPE_TOOLTIPS[t]}
              className={`px-1.5 py-0.5 text-[10px] rounded-sm transition-all ${
                filterTypes.has(t)
                  ? "bg-active text-accent-primary"
                  : "bg-elevated text-text-muted opacity-50"
              }`}
            >
              {PAGE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {/* P5-R2 问题 7: 常驻帮助文本，说明类型划分依据（AGENTS.md §3.2） */}
        <div className="text-[9px] text-text-muted mt-1 leading-relaxed">
          概念=原理/方法 · 实体=工具/库 · 来源=原始资料 ingest · 经验=实践沉淀
        </div>

        <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase mt-3 mb-2">状态</div>
        <div className="flex flex-wrap gap-1">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatuses((prev) => toggleSetItem(prev, s))}
              title={STATUS_TOOLTIPS[s]}
              className={`px-1.5 py-0.5 text-[10px] rounded-sm transition-all ${
                filterStatuses.has(s)
                  ? "bg-active text-accent-primary"
                  : "bg-elevated text-text-muted opacity-50"
              }`}
            >
              {STATUS_LABELS_ZH[s]}
            </button>
          ))}
        </div>

        <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase mt-3 mb-2">边类型</div>
        <div className="flex flex-wrap gap-1">
          {ALL_EDGE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterEdgeTypes((s) => toggleSetItem(s, t))}
              title={EDGE_TYPE_TOOLTIPS[t]}
              className={`px-1.5 py-0.5 text-[10px] rounded-sm transition-all ${
                filterEdgeTypes.has(t)
                  ? "bg-active text-accent-primary"
                  : "bg-elevated text-text-muted opacity-50"
              }`}
            >
              {EDGE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* DEF-3: 局部跳数选择器（仅 local 模式） */}
        {graphMode === "local" && (
          <>
            <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase mt-3 mb-2">局部跳数</div>
            <div className="flex gap-1">
              {([1, 2, 3] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setLocalHop(h)}
                  className={`flex-1 px-1.5 py-0.5 text-[10px] font-mono rounded-sm transition-all ${
                    localHop === h
                      ? "bg-active text-accent-primary border border-accent-primary"
                      : "bg-elevated text-text-muted border border-transparent"
                  }`}
                >
                  {h}-hop
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 图例（右侧） */}
      <div className="absolute top-3 right-3 bg-surface border border-border-subtle rounded-md p-3 z-10">
        <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase mb-2">节点形状 / 边类型</div>
        <div className="space-y-1 text-[11px] text-text-secondary">
          <LegendItem shape="circle" label="概念 concept（圆）" />
          <LegendItem shape="square" label="实体 entity（方）" />
          <LegendItem shape="diamond" label="来源 source（菱）" />
          <LegendItem shape="triangle" label="经验 experience（三角）" />
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
        onNodeRightClick={handleNodeRightClick as (node: unknown, ev: unknown) => void}
        onBackgroundClick={handleBackgroundClick}
        cooldownTicks={150}
        d3VelocityDecay={0.4}
        width={typeof window !== "undefined" ? window.innerWidth - 48 : 1200}
        height={typeof window !== "undefined" ? window.innerHeight - 120 : 800}
        backgroundColor="transparent"
        enableNodeDrag
        enableZoomInteraction
        enablePanInteraction
      />

      {/* DEF-4: 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          nodeTitle={graphData.nodes.find((n) => n.id === contextMenu.nodeId)?.title ?? "(unknown)"}
          onNavigate={() => {
            navigateToNode(contextMenu.nodeId);
            setContextMenu(null);
          }}
          onFocus={() => handleFocusNode(contextMenu.nodeId)}
          onCopyPath={() => void handleCopyPath(contextMenu.nodeId)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 底部统计 */}
      <div className="absolute bottom-3 left-3 px-3 py-1 bg-surface border border-border-subtle rounded-md text-[11px] font-mono text-text-muted z-10">
        {filteredGraph.nodes.length} 节点 · {filteredGraph.links.length} 边 · 孤儿页: {graphData.summary.orphanPages} · 最大连通分量: {graphData.summary.largestCcSize}
        {selectedNodeId && (
          <span className="ml-2 text-accent-primary">
            选中: {graphData.nodes.find((n) => n.id === selectedNodeId)?.title?.slice(0, 20)}
          </span>
        )}
        {!tauriEnv && <span className="ml-2 text-amber-400">（mock 数据）</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------------

function LegendItem({
  shape,
  label,
}: {
  shape: "circle" | "square" | "diamond" | "triangle";
  label: string;
}) {
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
      <span>{EDGE_TYPE_LABELS[type]}（{type}）</span>
    </div>
  );
}

/** DEF-4: 右键菜单组件 */
function ContextMenu({
  state,
  nodeTitle,
  onNavigate,
  onFocus,
  onCopyPath,
  onClose,
}: {
  state: ContextMenuState;
  nodeTitle: string;
  onNavigate: () => void;
  onFocus: () => void;
  onCopyPath: () => void;
  onClose: () => void;
}) {
  // 边界保护：避免菜单超出视窗
  const x = Math.min(state.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 180);
  const y = Math.min(state.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 140);

  return (
    <>
      {/* 透明遮罩：点击任意位置关闭菜单 */}
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-50 min-w-[160px] bg-surface border border-border-subtle rounded-md shadow-lg py-1"
        style={{ left: x, top: y }}
      >
        <div className="px-3 py-1.5 text-[10px] font-mono text-text-muted border-b border-border-subtle truncate">
          {nodeTitle}
        </div>
        <button
          type="button"
          onClick={onNavigate}
          className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-hover flex items-center gap-2"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>description</span>
          跳转到预览
        </button>
        <button
          type="button"
          onClick={onFocus}
          className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-hover flex items-center gap-2"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>center_focus_strong</span>
          聚焦此节点（局部模式）
        </button>
        <button
          type="button"
          onClick={onCopyPath}
          className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-hover flex items-center gap-2"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span>
          复制路径
        </button>
      </div>
    </>
  );
}
