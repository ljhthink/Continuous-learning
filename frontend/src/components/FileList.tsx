/**
 * FileList — staging 文件列表（Phase 4b：接入 Tauri IPC）
 *
 * 启动时调用 `list_staging` 加载所有 staging 页面；每次 confirm/reject 后刷新。
 * 卡片：格式图标 + 标题 + 领域·日期·source_file + 预览 + [预览] [确认] [拒绝]。
 *
 * 在浏览器 dev 模式下，IPC 不可用 → 回退到 mockStagingFiles + 显示 dev 提示。
 */

import { useEffect, useState, useCallback } from "react";
import { mockStagingFiles } from "@/data/mockData";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "@/types";
import type { StagingFile } from "@/types";
import {
  listStaging,
  confirmStaging,
  rejectStaging,
  isTauri,
  type StagingPageIPC,
} from "@/lib/ipc";
import { useViewStore } from "@/store/viewStore";

const FORMAT_ICONS: Record<StagingFile["format"], string> = {
  pdf: "picture_as_pdf",
  docx: "description",
  xlsx: "table_chart",
  md: "article",
};

/** 将 IPC StagingPageIPC 映射为前端展示用 StagingFile。 */
function ipcToStagingFile(p: StagingPageIPC): StagingFile {
  // IPC path 形如 "wiki/<domain>/<slug>.md"；用 source_file 估算格式
  const ext = (p.source_file.split(".").pop() ?? p.format ?? "md").toLowerCase() as StagingFile["format"];
  return {
    id: p.path,
    name: p.title,
    size: 0, // staging 页面没有原始字节大小；用 source_file 路径展示
    format: ["pdf", "docx", "xlsx", "md"].includes(ext)
      ? (ext as StagingFile["format"])
      : "md",
    domain: p.domain as StagingFile["domain"],
    uploadedAt: p.date,
    preview: p.preview,
    status: "staging",
  };
}

export function FileList() {
  const tauriEnv = isTauri();
  const [files, setFiles] = useState<StagingFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const { setCurrentPagePath, setView } = useViewStore();

  const refresh = useCallback(async () => {
    if (!tauriEnv) {
      setFiles(mockStagingFiles);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const pages = await listStaging();
      setFiles(pages.map(ipcToStagingFile));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [tauriEnv]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleConfirm = useCallback(
    async (file: StagingFile) => {
      if (!tauriEnv) return;
      setBusyPath(file.id);
      try {
        await confirmStaging(file.id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyPath(null);
      }
    },
    [tauriEnv, refresh],
  );

  const handleReject = useCallback(
    async (file: StagingFile) => {
      if (!tauriEnv) return;
      setBusyPath(file.id);
      try {
        await rejectStaging(file.id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyPath(null);
      }
    },
    [tauriEnv, refresh],
  );

  const handlePreview = useCallback(
    (file: StagingFile) => {
      // 切到 preview 视图，并设置当前页面路径
      setCurrentPagePath(file.id);
      setView("preview");
    },
    [setCurrentPagePath, setView],
  );

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">待确认文件</h3>
        <span className="font-mono text-[11px] text-text-muted">
          {loading
            ? "加载中…"
            : `${files.length} 个文件待审核` + (tauriEnv ? "" : " · dev mock")}
        </span>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 bg-elevated border border-accent-danger rounded-md text-[12px] text-accent-danger">
          IPC 错误：{error}
        </div>
      )}

      {files.length === 0 && !loading ? (
        <div className="px-4 py-8 text-center text-[12px] text-text-muted italic">
          暂无 staging 文件 — 拖拽文件到上方区域以上传
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              busy={busyPath === file.id}
              onPreview={() => handlePreview(file)}
              onConfirm={() => handleConfirm(file)}
              onReject={() => handleReject(file)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FileCardProps {
  file: StagingFile;
  busy: boolean;
  onPreview: () => void;
  onConfirm: () => void;
  onReject: () => void;
}

function FileCard({ file, busy, onPreview, onConfirm, onReject }: FileCardProps) {
  return (
    <div className="grid grid-cols-[36px_1fr_auto] gap-3 p-3 bg-surface border border-border-subtle rounded-md hover:border-border-strong transition-colors items-center">
      {/* 图标 */}
      <div className="w-9 h-9 flex items-center justify-center bg-elevated rounded-sm">
        <span
          className="material-symbols-outlined text-accent-primary"
          style={{ fontSize: 20 }}
        >
          {FORMAT_ICONS[file.format] ?? "article"}
        </span>
      </div>

      {/* 主体 */}
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-text-primary truncate">
          {file.name}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-text-muted">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: DOMAIN_COLORS[file.domain] ?? "var(--text-muted)",
              }}
            />
            {DOMAIN_LABELS[file.domain] ?? file.domain}
          </span>
          <span className="text-text-muted">·</span>
          <span className="font-mono text-[11px] text-text-muted">
            {new Date(file.uploadedAt).toLocaleDateString("zh-CN")}
          </span>
        </div>
        <div className="text-xs text-text-secondary mt-1 font-mono truncate">
          {file.preview}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onPreview}
          disabled={busy}
          className="flex items-center justify-center w-7 h-7 rounded-md text-text-secondary hover:bg-hover hover:text-text-primary transition-all disabled:opacity-50 disabled:cursor-wait"
          title="预览"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 16 }}
          >
            visibility
          </span>
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="flex items-center justify-center w-7 h-7 rounded-md text-accent-secondary hover:bg-hover transition-all disabled:opacity-50 disabled:cursor-wait"
          title="确认入库"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 16 }}
          >
            {busy ? "progress_activity" : "check"}
          </span>
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="flex items-center justify-center w-7 h-7 rounded-md text-accent-danger hover:bg-hover transition-all disabled:opacity-50 disabled:cursor-wait"
          title="拒绝"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 16 }}
          >
            close
          </span>
        </button>
      </div>
    </div>
  );
}
