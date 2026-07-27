/**
 * 视图状态管理（Zustand）
 *
 * P4 计划 §11.3 决策：自定义 viewStore 路由（无 React Router）。
 * 管理：当前视图、当前领域、主题、图谱模式、设置面板可见性。
 */

import { create } from "zustand";
import type { ViewName, Theme, Domain, GraphMode, PageType } from "@/types";

interface ViewState {
  // 主视图
  currentView: ViewName;
  setView: (view: ViewName) => void;

  // 当前领域（CategoryTree 选中）
  currentDomain: Domain | null;
  setDomain: (domain: Domain | null) => void;

  // 当前类型筛选（CategoryTree "按类型筛选"）
  currentType: PageType | null;
  setType: (type: PageType | null) => void;

  // 主题
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;

  // 图谱模式
  graphMode: GraphMode;
  setGraphMode: (mode: GraphMode) => void;

  // 设置面板
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  // 当前预览页面（preview 视图）
  currentPagePath: string | null;
  setCurrentPagePath: (path: string | null) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  currentView: "preview",
  setView: (view) => set({ currentView: view }),

  currentDomain: null,
  setDomain: (domain) => set({ currentDomain: domain }),

  currentType: null,
  setType: (type) => set({ currentType: type }),

  theme: "dark",
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
  setTheme: (theme) => set({ theme }),

  graphMode: "global",
  setGraphMode: (mode) => set({ graphMode: mode }),

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  currentPagePath: null,
  setCurrentPagePath: (path) => set({ currentPagePath: path }),
}));
