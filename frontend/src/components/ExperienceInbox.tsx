/**
 * ExperienceInbox — 经验卡片审核队列
 *
 * P4 计划 §4.4.4：双栏（左 inbox 列表 + 右详情）。
 * promote 时若返回 duplicate_with 非空 → 弹出确认对话框。
 * 4a 为静态 mock，4c 接入 kb_promote_experience / kb_reject。
 */

import { useState } from "react";
import { mockExperienceCards } from "@/data/mockData";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "@/types";
import type { ExperienceCard } from "@/types";

export function ExperienceInbox() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected: ExperienceCard | undefined = mockExperienceCards[selectedIdx];

  return (
    <div className="flex h-full">
      {/* 左栏：inbox 列表 */}
      <div className="w-80 border-r border-border-subtle bg-surface overflow-y-auto">
        <div className="px-4 py-2 text-[10px] font-semibold tracking-wider text-text-muted uppercase border-b border-border-subtle">
          待审核经验卡片（{mockExperienceCards.length}）
        </div>
        {mockExperienceCards.map((card, idx) => (
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
                style={{ background: DOMAIN_COLORS[card.domain] }}
              />
              <span className="text-[11px] font-mono text-text-muted">
                {DOMAIN_LABELS[card.domain]}
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
                  style={{ background: DOMAIN_COLORS[selected.domain] }}
                />
                <span className="text-text-secondary">{DOMAIN_LABELS[selected.domain]}</span>
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
            </div>

            {/* body */}
            <div className="bg-surface border border-border-subtle rounded-lg p-4 mb-4">
              <pre className="text-[13px] text-text-primary font-sans whitespace-pre-wrap leading-relaxed">
                {selected.body.replace(/\\n/g, "\n")}
              </pre>
            </div>

            {/* 重复警告（mock） */}
            {selected.duplicateWith && selected.duplicateWith.length > 0 && (
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
                    与 {selected.duplicateWith.length} 张已有经验卡相似度超阈值：
                  </div>
                  {selected.duplicateWith.map((p) => (
                    <div key={p} className="text-[11px] font-mono text-accent-warning mt-1">
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <button
                type="button"
                className="flex items-center gap-1.5 px-4 py-2 bg-accent-secondary text-white rounded-md text-[13px] font-medium hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  check
                </span>
                Promote（提升为正式）
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 px-4 py-2 bg-elevated text-accent-danger rounded-md text-[13px] font-medium hover:bg-hover transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  close
                </span>
                Reject（驳回）
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 px-4 py-2 bg-elevated text-text-secondary rounded-md text-[13px] font-medium hover:bg-hover transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  edit
                </span>
                编辑
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
