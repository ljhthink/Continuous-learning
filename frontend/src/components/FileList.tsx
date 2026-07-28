/**
 * FileList — staging 文件列表（Phase 4b：接入 Tauri IPC）
 *
 * 启动时调用 `list_staging` 加载所有 staging 页面；每次 confirm/reject 后刷新。
 * 卡片：格式图标 + 标题 + 领域·日期·source_file + 预览 + [预览] [LLM整理] [确认] [拒绝]。
 *
 * P5（ADR-013）：新增 "LLM 整理" 按钮 — 调用中国三厂商 LLM 将原始 markdown
 * 整理为结构化 wiki 页面。整理结果在模态框中展示，用户可采用或丢弃。
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
  updateStagingContent,
  isTauri,
  type StagingPageIPC,
} from "@/lib/ipc";
import { useViewStore } from "@/store/viewStore";
import { useLlmStore } from "@/store/llmStore";
import { organizeStagingPage, loadApiKey, PROVIDERS } from "@/lib/llm";

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
  // P5 LLM 整理状态（ADR-013）
  const { llmMode, cloudProvider } = useLlmStore();
  const [organizingPath, setOrganizingPath] = useState<string | null>(null);
  const [organizeResult, setOrganizeResult] = useState<
    { path: string; content: string; fileName: string } | null
  >(null);
  const [organizeError, setOrganizeError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState(false);

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

  // P5：LLM 整理 staging 页面（ADR-013）
  const handleOrganize = useCallback(
    async (file: StagingFile) => {
      if (!tauriEnv) return;
      setOrganizeError(null);
      if (llmMode === "disabled") {
        setOrganizeError("请先在设置中启用 LLM 集成（⌘, 打开设置）");
        return;
      }
      if (llmMode === "local-first") {
        setOrganizeError("本地模式暂不支持 staging 整理，请切换到 Cloud 模式");
        return;
      }
      setOrganizingPath(file.id);
      setOrganizeResult(null);
      try {
        const apiKey = await loadApiKey(cloudProvider);
        if (!apiKey) {
          setOrganizeError(
            `未找到 ${PROVIDERS[cloudProvider].name} 的 API Key，请先在设置中保存`,
          );
          return;
        }
        const result = await organizeStagingPage(
          cloudProvider,
          apiKey,
          file.preview,
        );
        if (result.success && result.content) {
          setOrganizeResult({
            path: file.id,
            content: result.content,
            fileName: file.name,
          });
        } else {
          setOrganizeError(result.error ?? "LLM 整理失败");
        }
      } catch (err) {
        setOrganizeError(err instanceof Error ? err.message : String(err));
      } finally {
        setOrganizingPath(null);
      }
    },
    [tauriEnv, llmMode, cloudProvider],
  );

  // 采用 LLM 整理结果：更新 staging 文件内容
  const handleAdopt = useCallback(async () => {
    if (!organizeResult) return;
    setAdopting(true);
    setOrganizeError(null);
    try {
      await updateStagingContent(organizeResult.path, organizeResult.content);
      setOrganizeResult(null);
      await refresh();
    } catch (err) {
      setOrganizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdopting(false);
    }
  }, [organizeResult, refresh]);

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

      {organizeError && (
        <div className="mb-3 px-3 py-2 bg-elevated border border-accent-warning rounded-md text-[12px] text-accent-warning flex items-start gap-2">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            warning
          </span>
          <span className="flex-1">{organizeError}</span>
          <button
            type="button"
            onClick={() => setOrganizeError(null)}
            className="text-accent-warning hover:text-text-primary"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              close
            </span>
          </button>
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
              organizing={organizingPath === file.id}
              llmEnabled={llmMode !== "disabled"}
              onPreview={() => handlePreview(file)}
              onOrganize={() => handleOrganize(file)}
              onConfirm={() => handleConfirm(file)}
              onReject={() => handleReject(file)}
            />
          ))}
        </div>
      )}

      {/* P5：LLM 整理结果模态框（ADR-013） */}
      {organizeResult && (
        <LlmOrganizeModal
          fileName={organizeResult.fileName}
          content={organizeResult.content}
          providerName={PROVIDERS[cloudProvider].name}
          adopting={adopting}
          onAdopt={handleAdopt}
          onClose={() => setOrganizeResult(null)}
        />
      )}
    </div>
  );
}

interface FileCardProps {
  file: StagingFile;
  busy: boolean;
  organizing: boolean;
  llmEnabled: boolean;
  onPreview: () => void;
  onOrganize: () => void;
  onConfirm: () => void;
  onReject: () => void;
}

function FileCard({
  file,
  busy,
  organizing,
  llmEnabled,
  onPreview,
  onOrganize,
  onConfirm,
  onReject,
}: FileCardProps) {
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
          disabled={busy || organizing}
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
        {/* P5：LLM 整理按钮（ADR-013） */}
        <button
          type="button"
          onClick={onOrganize}
          disabled={busy || organizing || !llmEnabled}
          className="flex items-center justify-center w-7 h-7 rounded-md text-accent-primary hover:bg-hover transition-all disabled:opacity-50 disabled:cursor-wait"
          title={
            llmEnabled
              ? "LLM 整理（调用云端大模型结构化内容）"
              : "LLM 未启用（请在设置中开启）"
          }
        >
          <span
            className={`material-symbols-outlined ${organizing ? "animate-spin" : ""}`}
            style={{ fontSize: 16 }}
          >
            {organizing ? "progress_activity" : "auto_fix_high"}
          </span>
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || organizing}
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
          disabled={busy || organizing}
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

// ---------------------------------------------------------------------------
// P5：LLM 整理结果模态框（ADR-013）
// ---------------------------------------------------------------------------

interface LlmOrganizeModalProps {
  fileName: string;
  content: string;
  providerName: string;
  adopting: boolean;
  onAdopt: () => void;
  onClose: () => void;
}

function LlmOrganizeModal({
  fileName,
  content,
  providerName,
  adopting,
  onAdopt,
  onClose,
}: LlmOrganizeModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border-strong rounded-lg shadow-lg w-full max-w-3xl mx-4 flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-accent-primary"
              style={{ fontSize: 20 }}
            >
              auto_fix_high
            </span>
            <div>
              <h3 className="text-[14px] font-semibold text-text-primary">
                LLM 整理结果
              </h3>
              <p className="text-[11px] text-text-muted">
                {fileName} · 由 {providerName} 生成
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md text-text-secondary hover:bg-hover hover:text-text-primary transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              close
            </span>
          </button>
        </div>

        {/* 内容区：展示整理后的 markdown */}
        <div className="flex-1 overflow-y-auto p-5">
          <pre className="text-[12px] text-text-primary font-mono whitespace-pre-wrap leading-relaxed">
            {content}
          </pre>
        </div>

        {/* 底部：操作按钮 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
          <span className="text-[11px] text-text-muted">
            采用后将替换 staging 页面内容（status 仍为 staging，需手动确认入库）
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={adopting}
              className="px-4 py-1.5 text-[12px] bg-elevated text-text-secondary rounded-md hover:bg-hover transition-colors disabled:opacity-50"
            >
              丢弃
            </button>
            <button
              type="button"
              onClick={onAdopt}
              disabled={adopting}
              className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] bg-accent-secondary text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <span
                className={`material-symbols-outlined ${adopting ? "animate-spin" : ""}`}
                style={{ fontSize: 14 }}
              >
                {adopting ? "progress_activity" : "check"}
              </span>
              {adopting ? "采用中..." : "采用"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
