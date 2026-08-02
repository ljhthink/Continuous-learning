/**
 * StagingReview — 待审核文档审核队列（P6-R5）
 *
 * 与 ExperienceInbox 并列于「审核」视图的 staging 子标签。
 * 调用 listStaging() IPC 拉取所有 staging 页面，提供：
 *   - 左栏列表（标题 / 领域 / 上传日期 / 摘要前 80 字）
 *   - 右栏详情（完整 markdown preview）
 *   - 底部「确认入 wiki」「驳回」按钮
 *
 * 操作完成后调用 useGraphStore.invalidate() 刷新图谱缓存
 * （呼应 project_memory「Cache invalidation must be triggered by all document lifecycle events」）。
 *
 * 浏览器 dev 模式回退 mockStagingPages。
 */

import { useState, useEffect, useCallback } from "react";
import { mockStagingPages } from "@/data/mockData";
import { domainColor, domainLabel } from "@/types";
import { useGraphStore } from "@/store/graphStore";
import {
  listStaging,
  confirmStaging,
  rejectStaging,
  isTauri,
  type StagingPageIPC,
} from "@/lib/ipc";

// UX-4: staging 列表内存缓存（模块级，跨组件实例保留）。
// 切换视图再回来时立即显示缓存，后台静默刷新，避免"每次进入都加载一会"。
// confirm/reject 后置空以强制下次 refresh 从服务器加载最新列表。
let stagingCache: { pages: StagingPageIPC[] } | null = null;

/** 比较两组页面路径是否相同（用于决定是否跳过 setPages）。 */
function pagesEqual(a: StagingPageIPC[], b: StagingPageIPC[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.path === b[i].path && p.title === b[i].title);
}

export function StagingReview() {
  const [pages, setPages] = useState<StagingPageIPC[]>(
    () => stagingCache?.pages ?? mockStagingPages,
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const tauriEnv = isTauri();
  const invalidateGraph = useGraphStore((s) => s.invalidate);

  const refresh = useCallback(async () => {
    if (!tauriEnv) {
      setPages(mockStagingPages);
      return;
    }
    // 缓存命中 → 立即显示，后台静默刷新
    if (stagingCache) {
      setPages(stagingCache.pages);
      setLoading(false);
      setError(null);
      try {
        const result = await listStaging();
        if (!pagesEqual(stagingCache.pages, result)) {
          stagingCache = { pages: result };
          setPages(result);
        } else {
          stagingCache = { pages: result };
        }
      } catch {
        /* 静默失败，保留缓存内容 */
      }
      return;
    }
    // 未命中缓存 → 正常加载
    setLoading(true);
    setError(null);
    try {
      const result = await listStaging();
      stagingCache = { pages: result };
      setPages(result);
      if (result.length > 0) {
        setSelectedIdx(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [tauriEnv]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleConfirm = useCallback(
    async (page: StagingPageIPC) => {
      if (!tauriEnv) return;
      setBusyPath(page.path);
      setActionMsg(null);
      try {
        await confirmStaging(page.path);
        setActionMsg(`已确认「${page.title}」入 wiki`);
        // 强制刷新：清除缓存
        stagingCache = null;
        invalidateGraph();
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyPath(null);
      }
    },
    [tauriEnv, refresh, invalidateGraph],
  );

  const handleReject = useCallback(
    async (page: StagingPageIPC) => {
      if (!tauriEnv) return;
      // 驳回是破坏性操作，二次确认
      const confirmed = window.confirm(
        `确认驳回「${page.title}」？\n\n驳回后页面状态变为 rejected，不会再出现在审核队列。原始文件保留在 raw/。`,
      );
      if (!confirmed) return;
      setBusyPath(page.path);
      setActionMsg(null);
      try {
        await rejectStaging(page.path);
        setActionMsg(`已驳回「${page.title}」`);
        stagingCache = null;
        invalidateGraph();
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyPath(null);
      }
    },
    [tauriEnv, refresh, invalidateGraph],
  );

  // 空态
  if (!loading && !error && pages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <span
            className="material-symbols-outlined text-text-muted mb-3"
            style={{ fontSize: 56 }}
          >
            inbox
          </span>
          <div className="text-[15px] font-medium text-text-primary mb-1">
            没有待审核的文档
          </div>
          <div className="text-xs text-text-muted">
            上传文档后会出现在此处等待审核。去「上传」视图拖拽文件开始。
          </div>
        </div>
      </div>
    );
  }

  // 加载态（首次未命中缓存）
  if (loading && pages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <span
          className="material-symbols-outlined text-accent-primary animate-spin"
          style={{ fontSize: 32 }}
        >
          progress_activity
        </span>
        <span className="ml-2 text-sm text-text-muted">加载 staging 列表…</span>
      </div>
    );
  }

  // 错误态
  if (error && pages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <span
            className="material-symbols-outlined text-accent-danger mb-3"
            style={{ fontSize: 48 }}
          >
            error
          </span>
          <div className="text-[15px] font-medium text-text-primary mb-1">
            加载 staging 列表失败
          </div>
          <div className="text-xs text-text-muted font-mono mb-3">{error}</div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="px-3 py-1.5 bg-accent-primary text-white rounded text-xs font-medium hover:opacity-90"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const selected = pages[selectedIdx];

  return (
    <div className="h-full flex">
      {/* 左栏：staging 列表 */}
      <div className="w-2/5 border-r border-border-subtle overflow-y-auto bg-surface">
        <div className="px-4 py-3 border-b border-border-subtle sticky top-0 bg-surface z-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold text-text-primary">
                待审核文档
              </div>
              <div className="text-[11px] text-text-muted">
                共 {pages.length} 个文档等待审核
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              title="刷新列表"
              className="p-1.5 rounded hover:bg-elevated text-text-secondary disabled:opacity-50"
            >
              <span
                className={`material-symbols-outlined ${loading ? "animate-spin" : ""}`}
                style={{ fontSize: 16 }}
              >
                refresh
              </span>
            </button>
          </div>
        </div>

        <div>
          {pages.map((page, idx) => (
            <button
              key={page.path}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`w-full text-left px-4 py-3 border-b border-border-subtle transition-colors ${
                idx === selectedIdx
                  ? "bg-active"
                  : "hover:bg-hover"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: domainColor(page.domain) }}
                />
                <span className="text-[13px] font-medium text-text-primary truncate flex-1">
                  {page.title}
                </span>
                <span className="text-[10px] font-mono text-text-muted flex-shrink-0">
                  {page.format.toUpperCase()}
                </span>
              </div>
              <div className="text-[11px] text-text-muted ml-4 mb-1 line-clamp-2">
                {page.preview.replace(/^#+\s*/gm, "").slice(0, 80)}
              </div>
              <div className="flex items-center gap-3 ml-4 text-[10px] text-text-muted">
                <span>{domainLabel(page.domain)}</span>
                <span>·</span>
                <span className="font-mono">{page.date}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 右栏：详情 + 操作按钮 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-canvas">
        {selected && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: domainColor(selected.domain) }}
                />
                <span className="text-[11px] text-text-muted">
                  {domainLabel(selected.domain)}
                </span>
                <span className="text-[11px] text-text-muted">·</span>
                <span className="text-[11px] font-mono text-text-muted">
                  {selected.path}
                </span>
              </div>
              <h2 className="text-[18px] font-semibold text-text-primary mb-1">
                {selected.title}
              </h2>
              <div className="text-[11px] text-text-muted mb-4">
                上传日期 {selected.date} · 来源 {selected.source_file}
              </div>

              {actionMsg && (
                <div className="mb-3 px-3 py-2 bg-accent-secondary/10 border border-accent-secondary/30 rounded text-xs text-accent-secondary">
                  {actionMsg}
                </div>
              )}
              {error && (
                <div className="mb-3 px-3 py-2 bg-accent-danger/10 border border-accent-danger/30 rounded text-xs text-accent-danger">
                  {error}
                </div>
              )}

              {/* Markdown preview（简单渲染，不复用 MarkdownPreview 组件避免重复加载） */}
              <div className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap font-mono bg-surface border border-border-subtle rounded p-4">
                {selected.preview}
              </div>
            </div>

            {/* 底部操作栏 */}
            <div className="border-t border-border-subtle px-6 py-3 bg-surface flex items-center gap-2">
              <div className="text-[11px] text-text-muted mr-auto">
                审核操作：确认入 wiki 或驳回。原始文件保留在 raw/ 不可变。
              </div>
              <button
                type="button"
                onClick={() => void handleConfirm(selected)}
                disabled={busyPath === selected.path}
                className="px-4 py-1.5 bg-accent-secondary text-white rounded text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {busyPath === selected.path ? (
                  <span
                    className="material-symbols-outlined animate-spin"
                    style={{ fontSize: 14 }}
                  >
                    progress_activity
                  </span>
                ) : (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 14 }}
                  >
                    check
                  </span>
                )}
                确认入 wiki
              </button>
              <button
                type="button"
                onClick={() => void handleReject(selected)}
                disabled={busyPath === selected.path}
                className="px-4 py-1.5 bg-elevated border border-border-subtle text-accent-danger rounded text-xs font-medium hover:bg-surface disabled:opacity-50 flex items-center gap-1.5"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14 }}
                >
                  block
                </span>
                驳回
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
