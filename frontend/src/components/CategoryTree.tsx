/**
 * CategoryTree — 领域分类树（左栏）
 *
 * P4 计划 §4.4.5：数据源 kb_list_categories(include_stats: true)。
 * 领域名前圆点用 §4.2.1 领域配色。点击切换 currentDomain。
 *
 * 4c：接入 callMcpTool("kb_list_categories")，浏览器 dev 回退 mockCategories。
 */

import { useState, useEffect } from "react";
import { useViewStore } from "@/store/viewStore";
import { mockCategories } from "@/data/mockData";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "@/types";
import type { ViewName, CategoryItem, Domain } from "@/types";
import { callMcpTool, isTauri } from "@/lib/ipc";

const VIEW_SWITCHER: Array<{ view: ViewName; icon: string; label: string; kbd: string }> = [
  { view: "upload", icon: "upload_file", label: "上传", kbd: "⌘1" },
  { view: "preview", icon: "article", label: "预览", kbd: "⌘2" },
  { view: "review", icon: "gavel", label: "审核", kbd: "⌘3" },
  { view: "graph", icon: "hub", label: "图谱", kbd: "⌘4" },
];

export function CategoryTree() {
  const { currentDomain, setDomain, currentView, setView } = useViewStore();
  const [categories, setCategories] = useState<CategoryItem[]>(mockCategories);
  const tauriEnv = isTauri();

  useEffect(() => {
    if (!tauriEnv) {
      setCategories(mockCategories);
      return;
    }
    callMcpTool("kb_list_categories", { include_stats: true })
      .then((result) => {
        if (result.success && result.data) {
          const data = result.data as { categories?: CategoryItem[] };
          if (data.categories && data.categories.length > 0) {
            // Merge with DOMAIN_COLORS/LABELS to ensure consistent display
            const merged = data.categories.map((c) => ({
              ...c,
              color: DOMAIN_COLORS[c.domain] ?? c.color,
              label: DOMAIN_LABELS[c.domain] ?? c.label,
            }));
            setCategories(merged);
          }
        }
      })
      .catch((err) => {
        console.warn("[CategoryTree] kb_list_categories failed:", err);
      });
  }, [tauriEnv]);

  const totalCount = categories.reduce((a, c) => a + c.pageCount, 0);

  return (
    <aside
      className="bg-surface border-r border-border-subtle overflow-y-auto py-3"
      style={{ width: "var(--left-w)" }}
    >
      {/* 领域分类 */}
      <div className="px-4 pb-1.5 text-[10px] font-semibold tracking-wider text-text-muted uppercase">
        领域分类
      </div>
      <div>
        <CategoryItemRow
          label="全部"
          color="var(--text-muted)"
          count={totalCount}
          active={currentDomain === null}
          onClick={() => setDomain(null)}
        />
        {categories.map((cat) => (
          <CategoryItemRow
            key={cat.domain}
            label={cat.label}
            color={cat.color}
            count={cat.pageCount}
            expCount={cat.experienceCount}
            active={currentDomain === cat.domain}
            onClick={() => setDomain(cat.domain as Domain)}
          />
        ))}
      </div>

      <div className="h-px bg-border-subtle mx-4 my-3" />

      {/* 视图切换 */}
      <div className="px-4 pb-1.5 text-[10px] font-semibold tracking-wider text-text-muted uppercase">
        视图
      </div>
      <div className="px-2">
        {VIEW_SWITCHER.map((item) => (
          <button
            key={item.view}
            type="button"
            onClick={() => setView(item.view)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 my-0.5 rounded-md text-[13px] transition-all ${
              currentView === item.view
                ? "bg-active text-accent-primary"
                : "text-text-secondary hover:bg-hover hover:text-text-primary"
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {item.icon}
            </span>
            <span>{item.label}</span>
            <kbd className="ml-auto font-mono text-[10px] text-text-muted bg-elevated px-1.5 py-0.5 rounded-sm">
              {item.kbd}
            </kbd>
          </button>
        ))}
      </div>
    </aside>
  );
}

interface CategoryItemProps {
  label: string;
  color: string;
  count: number;
  expCount?: number;
  active: boolean;
  onClick: () => void;
}

function CategoryItemRow({ label, color, count, expCount, active, onClick }: CategoryItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-4 py-1.5 text-[13px] transition-all ${
        active
          ? "bg-active text-text-primary"
          : "text-text-secondary hover:bg-hover hover:text-text-primary"
      }`}
      style={active ? { borderLeft: "2px solid var(--accent-primary)", paddingLeft: "14px" } : {}}
    >
      <span
        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      <span className="flex-1 text-left font-medium">{label}</span>
      <span className="font-mono text-[11px] text-text-muted">{count}</span>
      {expCount && expCount > 0 ? (
        <span
          className="font-mono text-[10px] text-accent-warning px-1"
          title={`${expCount} 张经验卡`}
        >
          +{expCount}
        </span>
      ) : null}
    </button>
  );
}
