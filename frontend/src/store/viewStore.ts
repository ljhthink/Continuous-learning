/**
 * 视图状态管理（Zustand）
 *
 * P4 计划 §11.3 决策：自定义 viewStore 路由（无 React Router）。
 * 管理：当前视图、当前领域、主题、图谱模式、设置面板可见性。
 */

import { create } from "zustand";
import type { ViewName, Theme, Domain, GraphMode, PageType } from "@/types";

/** 审核视图内的子标签（P6-R5：分离经验卡 inbox 与 staging 审核） */
export type ReviewTab = "experience" | "staging";

/** 设置面板可直达的分区（P6-R5：CategoryTree 齿轮按钮跳转领域管理） */
export type SettingsSection = "llm" | "domain-management" | "about";

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
  /** 设置面板当前激活分区（打开时可指定，便于从其他入口直达） */
  settingsSection: SettingsSection;
  setSettingsSection: (section: SettingsSection) => void;
  /** 便捷方法：打开设置面板并直达指定分区 */
  openSettings: (section?: SettingsSection) => void;

  // 审核视图子标签
  reviewTab: ReviewTab;
  setReviewTab: (tab: ReviewTab) => void;

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
  settingsSection: "llm",
  setSettingsSection: (section) => set({ settingsSection: section }),
  openSettings: (section) =>
    set((state) => ({
      settingsOpen: true,
      settingsSection: section ?? state.settingsSection,
    })),

  reviewTab: "experience",
  setReviewTab: (tab) => set({ reviewTab: tab }),

  currentPagePath: null,
  setCurrentPagePath: (path) => set({ currentPagePath: path }),
}));
