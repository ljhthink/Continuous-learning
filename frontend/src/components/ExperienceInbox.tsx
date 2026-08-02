/**
 * ExperienceInbox — 经验卡片审核队列
 *
 * P4 计划 §4.4.4：双栏（左 inbox 列表 + 右详情）。
 * promote 时若返回 duplicate_with 非空 → 显示重复警告。
 *
 * 4c：接入 callMcpTool("kb_list_inbox") 加载列表 +
 *      callMcpTool("kb_promote_experience") 执行 promote/reject。
 *      浏览器 dev 回退 mockExperienceCards。
 */

import { useState, useEffect, useCallback } from "react";
import { mockExperienceCards } from "@/data/mockData";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "@/types";
import type { ExperienceCard } from "@/types";
import { callMcpTool, isTauri } from "@/lib/ipc";

interface PromoteResult {
  status: string;
  tier?: string;
  duplicate_with?: string[];
  duplicate_max_content_sim?: number;
}

// UX-4: inbox 列表内存缓存（模块级，跨组件实例保留）。
// 切换视图再回来时立即显示缓存，后台静默刷新，避免"每次进入都加载一会"。
// promote/reject 后置空以强制下次 refresh 从服务器加载最新列表。
// P5-R2 fix: 后台刷新结果与缓存相同时跳过 setCards，避免列表重渲染（问题 6）。
let inboxCache: { cards: ExperienceCard[] } | null = null;

/** 比较两组卡片路径是否相同（用于决定是否跳过 setCards）。 */
function cardsEqual(a: ExperienceCard[], b: ExperienceCard[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((c, i) => c.path === b[i].path && c.title === b[i].title);
}

export function ExperienceInbox() {
  // P5-R2 fix: 初始值从缓存读取，避免 mockExperienceCards 闪烁（问题 6）
  const [cards, setCards] = useState<ExperienceCard[]>(
    () => inboxCache?.cards ?? mockExperienceCards,
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [promoteResult, setPromoteResult] = useState<PromoteResult | null>(null);
  const tauriEnv = isTauri();

  const refresh = useCallback(async () => {
    if (!tauriEnv) {
      setCards(mockExperienceCards);
      return;
    }
    // UX-4: 缓存命中 → 立即显示（无 loading），后台静默刷新
    // P5-R2 fix: 后台刷新结果与缓存相同时跳过 setCards
    if (inboxCache) {
      setCards(inboxCache.cards);
      setLoading(false);
      setError(null);
      try {
        const result = await callMcpTool("kb_list_inbox", {});
        if (result.success && result.data) {
          const data = result.data as { cards?: ExperienceCard[] };
          const newCards = data.cards ?? [];
          // 内容相同则跳过 setCards，避免列表重渲染
          if (!cardsEqual(inboxCache.cards, newCards)) {
            inboxCache = { cards: newCards };
            setCards(newCards);
          } else {
            inboxCache = { cards: newCards };
          }
        }
      } catch {
        /* 静默失败，保留缓存内容 */
      }
      return;
    }
    // 未命中缓存 → 正常加载（显示 loading）
    setLoading(true);
    setError(null);
    try {
      const result = await callMcpTool("kb_list_inbox", {});
      if (result.success && result.data) {
        const data = result.data as { cards?: ExperienceCard[] };
        const newCards = data.cards ?? [];
        inboxCache = { cards: newCards };
        setCards(newCards);
        if (newCards.length > 0) {
          setSelectedIdx(0);
        }
      } else {
        setError(result.error ?? "加载 inbox 失败");
        setCards([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [tauriEnv]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handlePromote = useCallback(
    async (card: ExperienceCard) => {
      if (!tauriEnv) return;
      setBusyPath(card.path);
      setPromoteResult(null);
      try {
        const result = await callMcpTool("kb_promote_experience", {
          inbox_path: card.path,
          action: "promote",
        });
        if (result.success && result.data) {
          setPromoteResult(result.data as PromoteResult);
          // Refresh list after successful promote（强制刷新：清除缓存）
          inboxCache = null;
          await refresh();
        } else {
          setError(result.error ?? "promote 失败");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyPath(null);
      }
    },
    [tauriEnv, refresh],
  );

  const handleReject = useCallback(
    async (card: ExperienceCard) => {
      if (!tauriEnv) return;
      setBusyPath(card.path);
      setPromoteResult(null);
      try {
        const result = await callMcpTool("kb_promote_experience", {
          inbox_path: card.path,
          action: "reject",
        });
        if (result.success) {
          inboxCache = null;
          await refresh();
        } else {
          setError(result.error ?? "reject 失败");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyPath(null);
      }
    },
    [tauriEnv, refresh],
  );

  const selected: ExperienceCard | undefined = cards[selectedIdx];

  return (
    <div className="flex h-full">
      {/* 左栏：inbox 列表 */}
      <div className="w-80 border-r border-border-subtle bg-surface overflow-y-auto">
        <div className="px-4 py-2 text-[10px] font-semibold tracking-wider text-text-muted uppercase border-b border-border-subtle flex items-center justify-between">
          <span>待审核经验卡片（{cards.length}）</span>
          {loading && (
            <span className="material-symbols-outlined animate-spin text-text-muted" style={{ fontSize: 12 }}>
              progress_activity
            </span>
          )}
        </div>
        {error && (
          <div className="px-4 py-2 text-[11px] text-red-400 border-b border-border-subtle">⚠️ {error}</div>
        )}
        {cards.length === 0 && !loading && (
          <div className="px-4 py-6 text-[12px] text-text-muted italic text-center">
            inbox 为空
          </div>
        )}
        {cards.map((card, idx) => (
          <button
            key={card.path}
            type="button"
            onClick={() => setSelectedIdx(idx)}
            className={`w-full text-left px-4 py-3 border-b border-border-subtle transition-all ${
              idx === selectedIdx
                ? "bg-active border-l-2 border-l-accent-primary"
                : "hover:bg-hover"
            }`}
            style={idx === selectedIdx ? { borderLeft: "2px solid var(--accent-primary)" } : {}}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: DOMAIN_COLORS[card.domain] ?? "#888" }}
              />
              <span className="text-[11px] font-mono text-text-muted">
                {DOMAIN_LABELS[card.domain] ?? card.domain}
              </span>
              <span className="ml-auto text-[11px] font-mono text-accent-warning">
                conf={card.confidence.toFixed(2)}
              </span>
            </div>
            <div className="text-[13px] text-text-primary leading-snug">{card.title}</div>
            <div className="text-[11px] font-mono text-text-muted mt-1 truncate">
              {card.sourceTask}
            </div>
          </button>
        ))}
      </div>

      {/* 右栏：详情 */}
      <div className="flex-1 overflow-y-auto p-6">
        {selected && (
          <>
            {/* frontmatter */}
            <div className="bg-surface border border-border-subtle rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-2 text-[11px] font-mono">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: DOMAIN_COLORS[selected.domain] ?? "#888" }}
                />
                <span className="text-text-secondary">
                  {DOMAIN_LABELS[selected.domain] ?? selected.domain}
                </span>
                <span className="text-text-muted">·</span>
                <span className="text-text-secondary">experience</span>
                <span className="text-text-muted">·</span>
                <span className="text-accent-warning">pending</span>
                <span className="text-text-muted">·</span>
                <span className="text-text-muted">confidence: {selected.confidence}</span>
              </div>
              <h2 className="text-lg font-semibold text-text-primary">{selected.title}</h2>
              <div className="text-[11px] font-mono text-text-muted mt-1">
                source_task: {selected.sourceTask}
              </div>
              <div className="text-[11px] font-mono text-text-muted mt-0.5">
                path: {selected.path}
              </div>
            </div>

            {/* body */}
            <div className="bg-surface border border-border-subtle rounded-lg p-4 mb-4">
              <pre className="text-[13px] text-text-primary font-sans whitespace-pre-wrap leading-relaxed">
                {selected.body}
              </pre>
            </div>

            {/* 重复检测结果 */}
            {promoteResult?.duplicate_with && promoteResult.duplicate_with.length > 0 && (
              <div className="bg-elevated border border-accent-warning rounded-lg p-3 mb-4 flex items-start gap-2">
                <span
                  className="material-symbols-outlined text-accent-warning"
                  style={{ fontSize: 18 }}
                >
                  warning
                </span>
                <div className="flex-1">
                  <div className="text-[13px] text-text-primary font-medium">
                    疑似重复检测
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    与 {promoteResult.duplicate_with.length} 张已有经验卡相似度超阈值
                    {promoteResult.duplicate_max_content_sim !== undefined &&
                      ` (max_sim=${promoteResult.duplicate_max_content_sim.toFixed(3)})`}
                    ：
                  </div>
                  {promoteResult.duplicate_with.map((p) => (
                    <div key={p} className="text-[11px] font-mono text-accent-warning mt-1">
                      {p}
                    </div>
                  ))}
                  <div className="text-[11px] text-text-muted mt-1">
                    tier={promoteResult.tier ?? "manual"} · 已提升但需人工复核
                  </div>
                </div>
              </div>
            )}

            {/* promote 成功提示 */}
            {promoteResult?.status === "active" && !promoteResult.duplicate_with?.length && (
              <div className="bg-elevated border border-accent-secondary rounded-lg p-3 mb-4 flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-accent-secondary"
                  style={{ fontSize: 18 }}
                >
                  check_circle
                </span>
                <div className="text-[13px] text-text-primary">
                  已提升为正式经验卡（tier={promoteResult.tier ?? "auto"}）
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePromote(selected)}
                disabled={busyPath === selected.path}
                className="flex items-center gap-1.5 px-4 py-2 bg-accent-secondary text-white rounded-md text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {busyPath === selected.path ? "progress_activity" : "check"}
                </span>
                Promote（提升为正式）
              </button>
              <button
                type="button"
                onClick={() => handleReject(selected)}
                disabled={busyPath === selected.path}
                className="flex items-center gap-1.5 px-4 py-2 bg-elevated text-accent-danger rounded-md text-[13px] font-medium hover:bg-hover transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  close
                </span>
                Reject（驳回）
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
