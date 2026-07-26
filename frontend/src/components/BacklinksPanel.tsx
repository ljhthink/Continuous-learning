/**
 * BacklinksPanel — 反向链接面板（右栏，preview 视图时显示）
 *
 * P4 计划 §4.4.10：三段折叠（反向链接 / 出链 / related）。
 * 4c 接入 callMcpTool("kb_get_backlinks")，根据 currentPagePath 加载。
 *
 * 数据来源：
 *   - Tauri 环境：callMcpTool("kb_get_backlinks", { page_path })
 *   - 浏览器 dev：mockBacklinks
 *
 * 点击条目：跳转到对应页面预览（setCurrentPagePath）
 */

import { useState, useEffect } from "react";
import { useViewStore } from "@/store/viewStore";
import { mockBacklinks } from "@/data/mockData";
import type { BacklinksData } from "@/types";
import { callMcpTool, isTauri } from "@/lib/ipc";

type Section = "backlinks" | "outbound" | "related";

export function BacklinksPanel() {
  const { currentPagePath, setCurrentPagePath } = useViewStore();
  const [open, setOpen] = useState<Record<Section, boolean>>({
    backlinks: true,
    outbound: true,
    related: true,
  });
  const [data, setData] = useState<BacklinksData>(mockBacklinks);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tauriEnv = isTauri();

  useEffect(() => {
    if (!tauriEnv) {
      setData(mockBacklinks);
      return;
    }
    if (!currentPagePath) {
      setData({ backlinks: [], outbound: [], related: [] });
      return;
    }
    setLoading(true);
    setError(null);
    callMcpTool("kb_get_backlinks", { page_path: currentPagePath })
      .then((result) => {
        if (result.success && result.data) {
          setData(result.data as BacklinksData);
        } else {
          setError(result.error ?? "加载反向链接失败");
          setData({ backlinks: [], outbound: [], related: [] });
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setData({ backlinks: [], outbound: [], related: [] });
      })
      .finally(() => setLoading(false));
  }, [currentPagePath, tauriEnv]);

  const handleNavigate = (path: string) => {
    setCurrentPagePath(path.replace(/\.md$/, ""));
  };

  const { backlinks, outbound, related } = data;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[10px] font-semibold tracking-wider text-text-muted uppercase border-b border-border-subtle flex items-center justify-between">
        <span>反向链接</span>
        {loading && (
          <span className="material-symbols-outlined animate-spin text-text-muted" style={{ fontSize: 12 }}>
            progress_activity
          </span>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 text-[11px] text-red-400 border-b border-border-subtle">
          ⚠️ {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* 反向链接 */}
        <Section
          title="反向链接"
          icon="arrow_back"
          count={backlinks.length}
          isOpen={open.backlinks}
          onToggle={() => setOpen((s) => ({ ...s, backlinks: !s.backlinks }))}
        >
          {backlinks.length === 0 ? (
            <Empty text={loading ? "加载中..." : "无反向链接"} />
          ) : (
            backlinks.map((bl) => (
              <BacklinkItem
                key={bl.path}
                title={bl.title}
                path={bl.path}
                context={bl.context}
                onClick={() => handleNavigate(bl.path)}
              />
            ))
          )}
        </Section>

        {/* 出链 */}
        <Section
          title="出链"
          icon="arrow_forward"
          count={outbound.length}
          isOpen={open.outbound}
          onToggle={() => setOpen((s) => ({ ...s, outbound: !s.outbound }))}
        >
          {outbound.length === 0 ? (
            <Empty text={loading ? "加载中..." : "无出链"} />
          ) : (
            outbound.map((ol) => (
              <SimpleItem
                key={ol.path}
                title={ol.title}
                path={ol.path}
                onClick={() => handleNavigate(ol.path)}
              />
            ))
          )}
        </Section>

        {/* related */}
        <Section
          title="related"
          icon="link"
          count={related.length}
          isOpen={open.related}
          onToggle={() => setOpen((s) => ({ ...s, related: !s.related }))}
        >
          {related.length === 0 ? (
            <Empty text={loading ? "加载中..." : "无 related 字段"} />
          ) : (
            related.map((r) => (
              <SimpleItem
                key={r.path}
                title={r.title}
                path={r.path}
                onClick={() => handleNavigate(r.path)}
              />
            ))
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  count,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  icon: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border-subtle">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-hover transition-colors"
      >
        <span className="material-symbols-outlined text-text-muted" style={{ fontSize: 14 }}>
          {icon}
        </span>
        <span className="text-[12px] font-medium text-text-primary">{title}</span>
        <span className="font-mono text-[10px] text-text-muted bg-elevated px-1.5 py-0.5 rounded-sm">
          {count}
        </span>
        <span
          className="material-symbols-outlined text-text-muted ml-auto transition-transform"
          style={{ fontSize: 16, transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          chevron_right
        </span>
      </button>
      {isOpen && <div className="pb-1">{children}</div>}
    </div>
  );
}

function BacklinkItem({
  title,
  path,
  context,
  onClick,
}: {
  title: string;
  path: string;
  context: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-hover transition-colors block"
    >
      <div className="text-[12px] text-accent-primary hover:underline truncate">{title}</div>
      <div className="text-[10px] font-mono text-text-muted truncate mt-0.5">{path}</div>
      <div className="text-[11px] text-text-secondary mt-1 line-clamp-2 leading-snug">
        {context}
      </div>
    </button>
  );
}

function SimpleItem({
  title,
  path,
  onClick,
}: {
  title: string;
  path: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 hover:bg-hover transition-colors block"
    >
      <div className="text-[12px] text-accent-primary hover:underline truncate">{title}</div>
      <div className="text-[10px] font-mono text-text-muted truncate">{path}</div>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-3 py-3 text-[11px] text-text-muted italic">{text}</div>;
}
