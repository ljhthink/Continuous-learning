/**
 * SearchBar — 知识库检索框
 *
 * P4 计划 §4.4.6：Cmd/Ctrl+K 聚焦，输入时 debounce 300ms，
 * 下拉 top 10 结果。Phase 4a 为静态 mock，4c 接入 kb_search。
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { mockPageSummaries } from "@/data/mockData";
import { useViewStore } from "@/store/viewStore";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "@/types";
import type { PageSummary } from "@/types";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<PageSummary[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setView, setCurrentPagePath } = useViewStore();

  // Cmd/Ctrl+K 聚焦
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        inputRef.current?.blur();
        setFocused(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // debounce 搜索（mock：本地过滤）
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      const q = query.toLowerCase();
      const filtered = mockPageSummaries
        .filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.path.toLowerCase().includes(q) ||
            p.domain.toLowerCase().includes(q),
        )
        .slice(0, 10);
      setResults(filtered);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const placeholder = useMemo(() => "搜索知识库... (⌘K)", []);

  const handleSelect = (page: PageSummary) => {
    setCurrentPagePath(page.path);
    setView("preview");
    setQuery("");
    setFocused(false);
    inputRef.current?.blur();
  };

  return (
    <div className="flex-1 max-w-[480px] relative flex items-center">
      <span
        className="material-symbols-outlined absolute left-2.5 pointer-events-none text-text-muted"
        style={{ fontSize: 18 }}
      >
        search
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        className="w-full h-8 pl-9 pr-12 bg-elevated border border-border-subtle rounded-md text-text-primary text-[13px] outline-none transition-colors focus:border-accent-primary focus:bg-canvas placeholder:text-text-muted"
      />
      <kbd className="absolute right-2 font-mono text-[10px] text-text-muted bg-canvas px-1.5 py-0.5 border border-border-subtle rounded-sm">
        ⌘K
      </kbd>

      {/* 搜索结果下拉 */}
      {focused && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-elevated border border-border-strong rounded-md shadow-lg z-50 max-h-96 overflow-y-auto">
          {results.map((page) => (
            <button
              key={page.path}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(page);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-hover transition-colors border-b border-border-subtle last:border-b-0"
            >
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: DOMAIN_COLORS[page.domain] }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text-primary truncate">{page.title}</div>
                <div className="text-[11px] text-text-muted font-mono truncate">{page.path}</div>
              </div>
              <span className="text-[10px] text-text-muted px-1.5 py-0.5 bg-canvas rounded-sm">
                {DOMAIN_LABELS[page.domain]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
