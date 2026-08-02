/**
 * 图谱数据缓存（Zustand）
 *
 * GraphView 在加载真实图谱数据后写入此 store，
 * GraphStats（右栏统计面板）读取此 store 渲染领域分布。
 *
 * 这样避免 GraphStats 直接使用 mockGraphData.summary（含后端不存在的 academic/life），
 * 也避免重复请求 kb_get_graph。
 *
 * dataSource 字段标识当前数据来源：
 *   - 'mock'：初始值或浏览器 dev 模式，数据来自 mockGraphData
 *   - 'real'：Tauri 环境下从 kb_get_graph 加载的真实后端数据
 * GraphStats 据此显示数据来源提示，避免 Tauri 环境下短暂显示幽灵 mock 数据。
 */

import { create } from "zustand";
import type { GraphData } from "@/types";
import { mockGraphData } from "@/data/mockData";

interface GraphState {
  /** 当前图谱数据（GraphView 加载后写入；初始为 mock，Tauri 环境下被真实数据覆盖） */
  graphData: GraphData;
  /** 是否正在加载 */
  loading: boolean;
  /** 加载错误（null 表示无错误） */
  error: string | null;
  /** 数据来源标识（避免 Tauri 环境下误显示 mock 数据为真实统计） */
  dataSource: "mock" | "real";
  /** P5-R3 问题 5: 刷新触发器，invalidate 递增，GraphView useEffect 依赖此值自动重载 */
  reloadTrigger: number;
  /** GraphView 加载完成后调用，写入真实数据并标记 dataSource='real' */
  setGraphData: (data: GraphData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  /** P5-R3: 使图谱缓存失效，下次 GraphView mount/更新时重新请求 kb_get_graph */
  invalidate: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  graphData: mockGraphData,
  loading: false,
  error: null,
  dataSource: "mock",
  reloadTrigger: 0,
  setGraphData: (data) => set({ graphData: data, dataSource: "real" }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  invalidate: () => set((s) => ({ reloadTrigger: s.reloadTrigger + 1 })),
}));
