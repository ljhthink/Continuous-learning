/**
 * App — 主应用组件
 *
 * P4 计划 §4.3 三栏布局（240 / flex-1 / 320）+ TopBar 48px + StatusBar 28px。
 * 视图路由：根据 viewStore.currentView 切换主内容区。
 * 全局快捷键：⌘1-4 切换视图，⌘G 图谱，⌘, 设置。
 * 主题切换：data-theme 属性绑定到 <html>。
 */

import { useEffect, useMemo } from "react";
import { useViewStore } from "@/store/viewStore";
import { useGraphStore } from "@/store/graphStore";
import { TopBar } from "@/components/TopBar";
import { StatusBar } from "@/components/StatusBar";
import { CategoryTree } from "@/components/CategoryTree";
import { DropZone } from "@/components/DropZone";
import { FileList } from "@/components/FileList";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { ExperienceInbox } from "@/components/ExperienceInbox";
import { GraphView } from "@/components/GraphView";
import { BacklinksPanel } from "@/components/BacklinksPanel";
import { LogTimeline } from "@/components/LogTimeline";
import { SettingsPanel } from "@/components/SettingsPanel";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "@/types";
import type { ViewName, Domain } from "@/types";

export function App() {
  const { currentView, setView, theme, setSettingsOpen } = useViewStore();

  // 主题绑定到 <html data-theme>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⌘1-4 切换视图
      if ((e.metaKey || e.ctrlKey) && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        const views: ViewName[] = ["upload", "preview", "review", "graph"];
        setView(views[parseInt(e.key, 10) - 1]);
        return;
      }
      // ⌘G 图谱
      if ((e.metaKey || e.ctrlKey) && e.key === "g") {
        e.preventDefault();
        setView("graph");
        return;
      }
      // ⌘, 设置
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setView, setSettingsOpen]);

  return (
    <div
      className="grid h-screen w-screen bg-canvas"
      style={{
        gridTemplateRows: "var(--topbar-h) 1fr var(--statusbar-h)",
        gridTemplateColumns: "var(--left-w) 1fr var(--right-w)",
        gridTemplateAreas: `
          "topbar topbar topbar"
          "left main right"
          "status status status"
        `,
      }}
    >
      <div style={{ gridArea: "topbar" }}>
        <TopBar />
      </div>

      <div style={{ gridArea: "left" }}>
        <CategoryTree />
      </div>

      <main style={{ gridArea: "main" }} className="bg-canvas overflow-hidden relative">
        <MainContent view={currentView} />
      </main>

      <div style={{ gridArea: "right" }} className="bg-surface border-l border-border-subtle overflow-hidden">
        <RightPanel view={currentView} />
      </div>

      <div style={{ gridArea: "status" }}>
        <StatusBar />
      </div>

      <SettingsPanel />
    </div>
  );
}

/** 主内容区：根据视图切换
 *  GraphView 始终挂载（用 CSS display 切换显隐），避免切换视图时 Canvas 重建 +
 *  d3-force 模拟重启导致的卡顿。其他视图按需挂载。 */
function MainContent({ view }: { view: ViewName }) {
  return (
    <div className="h-full w-full relative">
      {/* GraphView 保活：display:none 时不渲染但保留 DOM + Canvas + simulation 状态 */}
      <div
        style={{ display: view === "graph" ? "block" : "none" }}
        className="h-full w-full"
      >
        <GraphView />
      </div>

      {view === "upload" && (
        <div className="h-full overflow-y-auto px-12 py-8">
          <div className="mb-6">
            <h1 className="text-[22px] font-semibold text-text-primary mb-1">上传资料</h1>
            <p className="text-[13px] text-text-secondary">
              拖拽 PDF / DOCX / XLSX 文件，经解析管道转为 markdown 后入 staging
            </p>
          </div>
          <DropZone />
          <FileList />
        </div>
      )}

      {view === "preview" && (
        <div className="h-full overflow-y-auto">
          <MarkdownPreview />
        </div>
      )}

      {view === "review" && <ExperienceInbox />}
    </div>
  );
}

/** 右栏：根据视图切换 */
function RightPanel({ view }: { view: ViewName }) {
  if (view === "preview") {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-hidden">
          <BacklinksPanel />
        </div>
        <div className="h-64 border-t border-border-subtle">
          <LogTimeline />
        </div>
      </div>
    );
  }

  if (view === "graph") {
    return (
      <div className="h-full flex flex-col">
        <GraphStats />
        <div className="flex-1 border-t border-border-subtle">
          <LogTimeline />
        </div>
      </div>
    );
  }

  // upload / review 视图：只显示 LogTimeline
  return (
    <div className="h-full">
      <LogTimeline />
    </div>
  );
}

/** 图谱统计面板（右栏，graph 视图时显示）
 *  从 graphStore 读取真实图谱数据，按需计算领域分布与边类型统计。
 *  只显示实际存在节点的领域（过滤掉 mock 中残留的 academic/life）。
 *  dataSource='mock' 时显示警告徽章，避免 Tauri 环境下误将 mock 数据当作真实统计。 */
function GraphStats() {
  const { graphData, dataSource, loading, error } = useGraphStore();

  // 从真实节点计算领域分布（只显示 count > 0 的领域）
  const domainCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of graphData.nodes) {
      counts[node.domain] = (counts[node.domain] ?? 0) + 1;
    }
    // 按计数降序排列
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]);
  }, [graphData.nodes]);

  // 边类型统计
  const edgeTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { wikilink: 0, related: 0, tags: 0 };
    for (const edge of graphData.edges) {
      counts[edge.type] = (counts[edge.type] ?? 0) + 1;
    }
    return counts;
  }, [graphData.edges]);

  // 孤儿页（入度=0 且出度=0）
  const orphanCount = useMemo(() => {
    return graphData.nodes.filter((n) => n.inDegree === 0 && n.outDegree === 0).length;
  }, [graphData.nodes]);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase">
          网络统计
        </div>
        {/* 数据来源徽章：Tauri 环境下加载完成前显示 mock 警告 */}
        {dataSource === "mock" && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-sm font-mono"
            style={{ background: "var(--accent-warning)", color: "var(--bg-canvas)" }}
            title="当前显示 mock 数据，正在加载真实数据或后端不可用"
          >
            MOCK
          </span>
        )}
        {dataSource === "real" && !loading && !error && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-sm font-mono"
            style={{ background: "var(--accent-secondary)", color: "var(--bg-canvas)" }}
            title="数据来自后端 kb_get_graph"
          >
            LIVE
          </span>
        )}
        {loading && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-mono text-text-muted bg-elevated">
            加载中…
          </span>
        )}
        {error && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-sm font-mono"
            style={{ background: "var(--accent-danger)", color: "var(--bg-canvas)" }}
            title={error}
          >
            ERROR
          </span>
        )}
      </div>
      <div className="space-y-1.5 text-[12px]">
        <StatRow label="总节点数" value={graphData.nodes.length} />
        <StatRow label="总边数" value={graphData.edges.length} />
        <StatRow label="wikilink" value={edgeTypeCounts.wikilink ?? 0} color="#4a9eff" />
        <StatRow label="related" value={edgeTypeCounts.related ?? 0} color="#5ba88a" />
        <StatRow label="tags" value={edgeTypeCounts.tags ?? 0} color="#e0a458" />
        <StatRow label="孤儿页" value={orphanCount} />
      </div>
      <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase mt-3 mb-2">
        领域分布
      </div>
      <div className="space-y-1">
        {domainCounts.map(([domain, count]) => (
          <div key={domain} className="flex items-center gap-2 text-[11px]">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: DOMAIN_COLORS[domain as Domain] ?? "#888" }}
            />
            <span className="text-text-secondary">
              {DOMAIN_LABELS[domain as Domain] ?? domain}
            </span>
            <span className="ml-auto font-mono text-text-muted">{count}</span>
          </div>
        ))}
        {domainCounts.length === 0 && (
          <div className="text-[11px] text-text-muted italic">暂无数据</div>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      {color && (
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      )}
      <span className="text-text-secondary">{label}</span>
      <span className="ml-auto font-mono text-text-primary">{value}</span>
    </div>
  );
}
