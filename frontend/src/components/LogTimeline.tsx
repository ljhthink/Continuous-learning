/**
 * LogTimeline — log.md 时间线（右栏）
 *
 * P4 计划 §4.4.7：数据源 kb_list_recent(limit: 50)。
 * 顶部分类筛选：[全部] [ingest] [experience] [promote] [dream] [lint]。
 *
 * 4c：接入 callMcpTool("kb_list_recent")，浏览器 dev 回退 mockLogEntries。
 */

import { useState, useEffect, useMemo } from "react";
import { mockLogEntries } from "@/data/mockData";
import type { LogEntry } from "@/types";
import { callMcpTool, isTauri } from "@/lib/ipc";

const TYPE_FILTERS: Array<{ key: LogEntry["type"] | "all"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "ingest", label: "ingest" },
  { key: "experience", label: "experience" },
  { key: "promote", label: "promote" },
  { key: "dream", label: "dream" },
  { key: "lint", label: "lint" },
];

const TYPE_COLORS: Record<LogEntry["type"], string> = {
  ingest: "var(--accent-primary)",
  experience: "var(--accent-warning)",
  promote: "var(--accent-secondary)",
  reject: "var(--accent-danger)",
  dream: "#8b5cf6",
  lint: "var(--text-muted)",
};

export function LogTimeline() {
  const [filter, setFilter] = useState<LogEntry["type"] | "all">("all");
  const [entries, setEntries] = useState<LogEntry[]>(mockLogEntries);
  const [loading, setLoading] = useState(false);
  const tauriEnv = isTauri();

  useEffect(() => {
    if (!tauriEnv) {
      setEntries(mockLogEntries);
      return;
    }
    setLoading(true);
    callMcpTool("kb_list_recent", { limit: 50 })
      .then((result) => {
        if (result.success && result.data) {
          const data = result.data as { entries?: LogEntry[] };
          if (data.entries && data.entries.length > 0) {
            setEntries(data.entries);
          }
        }
      })
      .catch((err) => {
        console.warn("[LogTimeline] kb_list_recent failed:", err);
      })
      .finally(() => setLoading(false));
  }, [tauriEnv]);

  const filtered = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.type === filter)),
    [entries, filter],
  );

  return (
    <div className="flex flex-col h-full">
      {/* 标题 */}
      <div className="px-3 py-2 text-[10px] font-semibold tracking-wider text-text-muted uppercase border-b border-border-subtle flex items-center justify-between">
        <span>时间线</span>
        {loading && (
          <span className="material-symbols-outlined animate-spin text-text-muted" style={{ fontSize: 12 }}>
            progress_activity
          </span>
        )}
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border-subtle">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-2 py-0.5 text-[10px] font-mono rounded-sm transition-all ${
              filter === f.key
                ? "bg-active text-accent-primary"
                : "text-text-muted hover:bg-hover hover:text-text-primary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 时间线列表 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && !loading && (
          <div className="px-3 py-4 text-[11px] text-text-muted italic">无日志条目</div>
        )}
        {filtered.map((entry, idx) => (
          <div
            key={idx}
            className="px-3 py-2 border-b border-border-subtle hover:bg-hover transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: TYPE_COLORS[entry.type] ?? "var(--text-muted)" }}
              />
              <span className="font-mono text-[10px] text-text-muted">{entry.date}</span>
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm"
                style={{
                  color: TYPE_COLORS[entry.type] ?? "var(--text-muted)",
                  background: `color-mix(in srgb, ${TYPE_COLORS[entry.type] ?? "var(--text-muted)"} 15%, transparent)`,
                }}
              >
                {entry.type}
              </span>
            </div>
            <div className="text-[12px] text-text-primary leading-snug">{entry.title}</div>
            {entry.details && (
              <div className="text-[11px] text-text-muted font-mono mt-0.5 truncate">
                {entry.details}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
