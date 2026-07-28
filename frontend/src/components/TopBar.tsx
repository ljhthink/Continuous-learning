/**
 * TopBar (48px) — 顶部栏
 *
 * P4 计划 §4.3：品牌标识 + 搜索框 + 视图切换按钮 + 设置/主题按钮。
 */

import { useViewStore } from "@/store/viewStore";
import { SearchBar } from "@/components/SearchBar";
import type { ViewName } from "@/types";

const VIEW_BUTTONS: Array<{ view: ViewName; icon: string; label: string; kbd: string }> = [
  { view: "upload", icon: "upload_file", label: "上传", kbd: "⌘1" },
  { view: "preview", icon: "article", label: "预览", kbd: "⌘2" },
  { view: "review", icon: "gavel", label: "审核", kbd: "⌘3" },
  { view: "graph", icon: "hub", label: "图谱", kbd: "⌘4" },
];

export function TopBar() {
  const { currentView, setView, setSettingsOpen, theme, toggleTheme } = useViewStore();

  return (
    <header
      className="flex items-center gap-4 px-4 bg-surface border-b border-border-subtle select-none"
      style={{ height: "var(--topbar-h)" }}
    >
      {/* 品牌标识 */}
      <div className="flex items-center gap-2 font-semibold text-sm min-w-[200px]">
        <span className="material-symbols-outlined text-accent-primary" style={{ fontSize: 22 }}>
          menu_book
        </span>
        <span>Continuous Learning KB</span>
        <span
          className="font-mono text-xs text-text-muted ml-1.5 px-1.5 py-0.5 bg-elevated rounded-sm"
          style={{ letterSpacing: "0.05em" }}
        >
          P4a
        </span>
      </div>

      {/* 搜索框 */}
      <SearchBar />

      {/* 视图切换按钮 */}
      <div className="flex items-center gap-1">
        {VIEW_BUTTONS.map((btn) => (
          <button
            key={btn.view}
            type="button"
            onClick={() => setView(btn.view)}
            className={`flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs transition-all ${
              currentView === btn.view
                ? "bg-active text-accent-primary border border-border-strong"
                : "text-text-secondary hover:bg-hover hover:text-text-primary border border-transparent"
            }`}
            title={`${btn.label} (${btn.kbd})`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {btn.icon}
            </span>
            <span className="hidden lg:inline">{btn.label}</span>
          </button>
        ))}
      </div>

      {/* 设置 + 主题 */}
      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center justify-center w-8 h-8 rounded-md text-text-secondary hover:bg-hover hover:text-text-primary transition-all"
          title={theme === "dark" ? "切换到亮色" : "切换到暗色"}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            {theme === "dark" ? "light_mode" : "dark_mode"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center justify-center w-8 h-8 rounded-md text-text-secondary hover:bg-hover hover:text-text-primary transition-all"
          title="设置"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            settings
          </span>
        </button>
      </div>
    </header>
  );
}
