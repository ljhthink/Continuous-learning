/**
 * BacklinksPanel — 反向链接面板（右栏，preview 视图时显示）
 *
 * P4 计划 §4.4.10：三段折叠（反向链接 / 出链 / related）。
 * 4a 为静态 mock，4c 接入 kb_get_page 返回的 links 字段。
 */

import { useState } from "react";
import { mockBacklinks } from "@/data/mockData";

type Section = "backlinks" | "outbound" | "related";

export function BacklinksPanel() {
  const [open, setOpen] = useState<Record<Section, boolean>>({
    backlinks: true,
    outbound: true,
    related: true,
  });

  const { backlinks, outbound, related } = mockBacklinks;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[10px] font-semibold tracking-wider text-text-muted uppercase border-b border-border-subtle">
        反向链接
      </div>

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
            <Empty text="无反向链接" />
          ) : (
            backlinks.map((bl) => (
              <BacklinkItem
                key={bl.path}
                title={bl.title}
                path={bl.path}
                context={bl.context}
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
            <Empty text="无出链" />
          ) : (
            outbound.map((ol) => (
              <SimpleItem key={ol.path} title={ol.title} path={ol.path} />
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
            <Empty text="无 related 字段" />
          ) : (
            related.map((r) => (
              <SimpleItem key={r.path} title={r.title} path={r.path} />
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

function BacklinkItem({ title, path, context }: { title: string; path: string; context: string }) {
  return (
    <button
      type="button"
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

function SimpleItem({ title, path }: { title: string; path: string }) {
  return (
    <button
      type="button"
      className="w-full text-left px-3 py-1.5 hover:bg-hover transition-colors block"
    >
      <div className="text-[12px] text-accent-primary hover:underline truncate">{title}</div>
      <div className="text-[10px] font-mono text-text-muted truncate">{path}</div>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-3 py-3 text-[11px] text-text-muted italic">{text}</div>
  );
}
