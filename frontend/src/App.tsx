/**
 * App — 主应用组件
 *
 * P4 计划 §4.3 三栏布局（240 / flex-1 / 320）+ TopBar 48px + StatusBar 28px。
 * 视图路由：根据 viewStore.currentView 切换主内容区。
 * 全局快捷键：⌘1-4 切换视图，⌘G 图谱，⌘, 设置。
 * 主题切换：data-theme 属性绑定到 <html>。
 */

import { useEffect } from "react";
import { useViewStore } from "@/store/viewStore";
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
import { mockGraphData } from "@/data/mockData";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "@/types";
import type { ViewName } from "@/types";

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

/** 主内容区：根据视图切换 */
function MainContent({ view }: { view: ViewName }) {
  switch (view) {
    case "upload":
      return (
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
      );
    case "preview":
      return (
        <div className="h-full overflow-y-auto">
          <MarkdownPreview />
        </div>
      );
    case "review":
      return <ExperienceInbox />;
    case "graph":
      return <GraphView />;
  }
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

/** 图谱统计面板（右栏，graph 视图时显示） */
function GraphStats() {
  const { summary } = mockGraphData;
  return (
    <div className="p-3">
      <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase mb-2">
        网络统计
      </div>
      <div className="space-y-1.5 text-[12px]">
        <StatRow label="总节点数" value={summary.totalNodes} />
        <StatRow label="总边数" value={summary.totalEdges} />
        <StatRow label="wikilink" value={summary.byEdgeType.wikilink} color="#4a9eff" />
        <StatRow label="related" value={summary.byEdgeType.related} color="#5ba88a" />
        <StatRow label="tags" value={summary.byEdgeType.tags} color="#e0a458" />
        <StatRow label="孤儿页" value={summary.orphanPages} />
        <StatRow label="最大连通分量" value={summary.largestCcSize} />
      </div>
      <div className="text-[10px] font-semibold tracking-wider text-text-muted uppercase mt-3 mb-2">
        领域分布
      </div>
      <div className="space-y-1">
        {Object.entries(summary.domains).map(([domain, count]) => (
          <div key={domain} className="flex items-center gap-2 text-[11px]">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: DOMAIN_COLORS[domain as keyof typeof DOMAIN_COLORS] }}
            />
            <span className="text-text-secondary">{DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS]}</span>
            <span className="ml-auto font-mono text-text-muted">{count}</span>
          </div>
        ))}
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
