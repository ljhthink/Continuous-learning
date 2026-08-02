/**
 * DomainManager — 领域管理面板（P6-R5）
 *
 * 提供：
 *   - 领域表格（名称 / 中文名 / 页面数 / 经验卡数 / 操作）
 *   - 新建领域（弹窗输入 name + description → createDomain IPC）
 *   - 删除领域（二次确认 → deleteDomain IPC，含 force 选项）
 *
 * 安全约束：
 *   - 后端拒绝删除受保护领域（raw/.git/kb-system）
 *   - 后端拒绝删除非空目录除非 force=true
 *   - 前端二次确认（window.confirm）+ 强制删除勾选框
 *   - 删除后调用 useGraphStore.invalidate() 刷新缓存
 *
 * 浏览器 dev 模式回退 KNOWN_DOMAINS 静态列表。
 */

import { useState, useEffect, useCallback } from "react";
import { KNOWN_DOMAINS, domainColor, domainLabel } from "@/types";
import { useGraphStore } from "@/store/graphStore";
import {
  listDomains,
  deleteDomain,
  createDomain,
  isTauri,
  type DomainInfoIPC,
} from "@/lib/ipc";

/** 受保护领域（与后端 PROTECTED_DOMAINS 一致，前端预禁用按钮） */
const PROTECTED_DOMAINS = new Set(["raw", ".git", "kb-system"]);

export function DomainManager() {
  const [domains, setDomains] = useState<DomainInfoIPC[]>(() =>
    KNOWN_DOMAINS.map((name) => ({
      name,
      page_count: 0,
      experience_count: 0,
    })),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busyDomain, setBusyDomain] = useState<string | null>(null);

  // 新建领域弹窗状态
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // 删除确认状态
  const [deleteTarget, setDeleteTarget] = useState<DomainInfoIPC | null>(null);
  const [forceDelete, setForceDelete] = useState(false);

  const tauriEnv = isTauri();
  const invalidateGraph = useGraphStore((s) => s.invalidate);

  const refresh = useCallback(async () => {
    if (!tauriEnv) {
      // 浏览器 dev：回退 KNOWN_DOMAINS
      setDomains(
        KNOWN_DOMAINS.map((name) => ({
          name,
          page_count: 0,
          experience_count: 0,
        })),
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listDomains();
      setDomains(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [tauriEnv]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    setCreateError(null);
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError("领域名不能为空");
      return;
    }
    // 前端预校验 kebab-case（后端会再次校验）
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(trimmedName)) {
      setCreateError(
        "领域名必须为 kebab-case（小写字母/数字/连字符，如 math-modeling）",
      );
      return;
    }
    setBusyDomain(trimmedName);
    try {
      const msg = await createDomain(trimmedName, newDesc.trim() || undefined);
      setActionMsg(msg);
      setShowCreateForm(false);
      setNewName("");
      setNewDesc("");
      invalidateGraph();
      await refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyDomain(null);
    }
  }, [newName, newDesc, invalidateGraph, refresh]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setBusyDomain(deleteTarget.name);
    setError(null);
    setActionMsg(null);
    try {
      const deletedCount = await deleteDomain(deleteTarget.name, forceDelete);
      setActionMsg(
        `已删除领域「${deleteTarget.name}」${deletedCount > 0 ? `（含 ${deletedCount} 个页面）` : ""}`,
      );
      setDeleteTarget(null);
      setForceDelete(false);
      invalidateGraph();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyDomain(null);
    }
  }, [deleteTarget, forceDelete, invalidateGraph, refresh]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-text-primary">
            领域管理
          </div>
          <div className="text-[11px] text-text-muted">
            新建、删除 wiki 领域目录。删除会同步移除 index.md 中的领域分组。
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(true);
              setCreateError(null);
            }}
            className="px-3 py-1.5 bg-accent-primary text-white rounded text-xs font-medium hover:opacity-90 flex items-center gap-1.5"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 14 }}
            >
              create_new_folder
            </span>
            新建领域
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className="px-3 py-2 bg-accent-secondary/10 border border-accent-secondary/30 rounded text-xs text-accent-secondary">
          {actionMsg}
        </div>
      )}
      {error && (
        <div className="px-3 py-2 bg-accent-danger/10 border border-accent-danger/30 rounded text-xs text-accent-danger">
          {error}
        </div>
      )}

      {/* 领域表格 */}
      <div className="border border-border-subtle rounded overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-elevated text-text-muted">
            <tr>
              <th className="text-left px-3 py-2 font-medium">领域名</th>
              <th className="text-left px-3 py-2 font-medium">中文名</th>
              <th className="text-right px-3 py-2 font-medium">页面数</th>
              <th className="text-right px-3 py-2 font-medium">经验卡</th>
              <th className="text-right px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {domains.map((d) => {
              const isProtected = PROTECTED_DOMAINS.has(d.name);
              return (
                <tr
                  key={d.name}
                  className="border-t border-border-subtle hover:bg-hover"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ background: domainColor(d.name) }}
                      />
                      <span className="font-mono text-text-primary">
                        {d.name}
                      </span>
                      {isProtected && (
                        <span
                          className="text-[9px] px-1 py-0.5 rounded bg-elevated text-text-muted"
                          title="系统元知识领域，不可删除"
                        >
                          受保护
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {domainLabel(d.name)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-text-secondary">
                    {d.page_count}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-text-secondary">
                    {d.experience_count}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTarget(d);
                        setForceDelete(false);
                        setError(null);
                      }}
                      disabled={isProtected || busyDomain === d.name}
                      title={
                        isProtected
                          ? "受保护领域不可删除"
                          : `删除领域「${d.name}」`
                      }
                      className="px-2 py-1 text-[11px] text-accent-danger border border-border-subtle rounded hover:bg-accent-danger/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
            {domains.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-text-muted text-[12px]"
                >
                  暂无领域目录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 新建领域弹窗（内联展开，非 modal） */}
      {showCreateForm && (
        <div className="border border-accent-primary/40 rounded p-3 bg-surface">
          <div className="text-[12px] font-medium text-text-primary mb-2">
            新建领域
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-[11px] text-text-muted block mb-1">
                领域名（kebab-case，如 math-modeling）
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="math-modeling"
                className="w-full px-2 py-1.5 bg-canvas border border-border-subtle rounded text-[12px] font-mono text-text-primary focus:outline-none focus:border-accent-primary"
              />
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">
                描述（可选，写入 index.md 注释）
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="数学建模竞赛技巧、赛题分析与论文写作"
                className="w-full px-2 py-1.5 bg-canvas border border-border-subtle rounded text-[12px] text-text-primary focus:outline-none focus:border-accent-primary"
              />
            </div>
            {createError && (
              <div className="text-[11px] text-accent-danger">{createError}</div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={busyDomain !== null}
                className="px-3 py-1.5 bg-accent-primary text-white rounded text-[11px] font-medium hover:opacity-90 disabled:opacity-50"
              >
                {busyDomain ? "创建中…" : "创建"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewName("");
                  setNewDesc("");
                  setCreateError(null);
                }}
                disabled={busyDomain !== null}
                className="px-3 py-1.5 text-text-secondary text-[11px] hover:bg-elevated rounded"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除二次确认弹窗（内联展开） */}
      {deleteTarget && (
        <div className="border border-accent-danger/40 rounded p-3 bg-accent-danger/5">
          <div className="text-[12px] font-medium text-accent-danger mb-2 flex items-center gap-1.5">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16 }}
            >
              warning
            </span>
            确认删除领域「{deleteTarget.name}」
          </div>
          <div className="text-[11px] text-text-secondary mb-2">
            将执行以下操作：
            <ol className="list-decimal ml-5 mt-1 space-y-0.5">
              <li>递归删除 wiki/{deleteTarget.name}/ 目录（{deleteTarget.page_count} 个页面）</li>
              <li>移除 index.md 中「## {deleteTarget.name}」分组及条目</li>
              <li>调用 graphStore.invalidate() 刷新图谱缓存</li>
              <li>不修改 AGENTS.md（请手动移除 §8.1 中的领域说明）</li>
            </ol>
            <div className="mt-2 text-text-muted">
              此操作不可恢复，但 git 历史可回滚。原始文件保留在 raw/ 不可变。
            </div>
          </div>
          {deleteTarget.page_count > 0 && (
            <label className="flex items-center gap-2 text-[11px] text-text-primary mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={forceDelete}
                onChange={(e) => setForceDelete(e.target.checked)}
                className="cursor-pointer"
              />
              <span>
                我已知晓该领域非空（{deleteTarget.page_count} 个页面），勾选以强制删除
              </span>
            </label>
          )}
          {error && (
            <div className="text-[11px] text-accent-danger mb-2">{error}</div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={
                busyDomain === deleteTarget.name ||
                (deleteTarget.page_count > 0 && !forceDelete)
              }
              className="px-3 py-1.5 bg-accent-danger text-white rounded text-[11px] font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busyDomain === deleteTarget.name ? "删除中…" : "确认删除"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteTarget(null);
                setForceDelete(false);
                setError(null);
              }}
              disabled={busyDomain === deleteTarget.name}
              className="px-3 py-1.5 text-text-secondary text-[11px] hover:bg-elevated rounded"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {!tauriEnv && (
        <div className="text-[10px] text-accent-warning px-2 py-1 bg-accent-warning/10 rounded">
          ⚠ 浏览器 dev 模式：领域管理操作需在 Tauri 应用内执行。当前仅显示已知领域列表。
        </div>
      )}
    </div>
  );
}
