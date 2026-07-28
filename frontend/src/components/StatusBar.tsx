/**
 * StatusBar (28px) — 底部状态栏
 *
 * P4 计划 §4.3：MCP 状态 + 领域 + 页数 + 边数 + 经验卡数 + 最后 ingest + 快捷键提示。
 */

import { useViewStore } from "@/store/viewStore";
import { mockGraphData, mockCategories } from "@/data/mockData";
import type { ViewName } from "@/types";

const VIEW_LABELS: Record<ViewName, string> = {
  upload: "上传",
  preview: "预览",
  review: "审核",
  graph: "图谱",
};

export function StatusBar() {
  const { currentView, currentDomain, graphMode } = useViewStore();
  const { summary } = mockGraphData;
  const totalExperiences = mockCategories.reduce((a, c) => a + c.experienceCount, 0);

  return (
    <footer
      className="flex items-center gap-3 px-4 bg-surface border-t border-border-subtle text-xs text-text-muted font-mono"
      style={{ height: "var(--statusbar-h)" }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: "var(--accent-secondary)" }}
        />
        <span>MCP ready</span>
      </div>
      <Sep />
      <div>
        domain:{" "}
        <span className="text-accent-primary">
          {currentDomain ?? "全部"}
        </span>
      </div>
      <Sep />
      <div>{summary.totalNodes} pages</div>
      <Sep />
      <div>{summary.totalEdges} edges</div>
      <Sep />
      <div>{totalExperiences} experiences</div>
      <Sep />
      <div>last ingest: 2026-07-26</div>
      <Sep />
      <div className="text-text-secondary">
        {currentView === "graph"
          ? `图谱：${graphMode === "global" ? "全局网络" : "局部模式"}`
          : ""}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div>
          view: <span className="text-accent-primary">{VIEW_LABELS[currentView]}</span>
        </div>
        <Sep />
        <div>⌘1 upload · ⌘2 preview · ⌘3 review · ⌘4 graph</div>
      </div>
    </footer>
  );
}

function Sep() {
  return <span className="text-border-strong">·</span>;
}
