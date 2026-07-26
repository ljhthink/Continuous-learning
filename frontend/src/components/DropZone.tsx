/**
 * DropZone — 拖拽上传区（Phase 4b：接入 Tauri IPC）
 *
 * 双模式：
 *   - Tauri 环境：监听 webview onDragDropEvent，获取文件路径，调用 upload_file IPC。
 *     同时提供「点击选择」按钮，通过 @tauri-apps/plugin-dialog 打开原生文件选择器。
 *   - 浏览器 dev 模式：HTML5 拖拽 + <input type=file>，但无法获取磁盘路径，
 *     仅显示「请在 Tauri 应用中操作」提示（因为 upload_file 需要 OS 文件路径）。
 *
 * 三态：empty / hover / uploading。上传中显示进度条 + 当前文件名。
 */

import { useEffect, useState, useCallback } from "react";
import { useViewStore } from "@/store/viewStore";
import { uploadFile, isTauri } from "@/lib/ipc";
import type { Domain } from "@/types";
import type { StagingPageIPC } from "@/lib/ipc";

const FORMAT_CHIPS: Array<{ icon: string; label: string }> = [
  { icon: "picture_as_pdf", label: "PDF" },
  { icon: "description", label: "DOCX" },
  { icon: "table_chart", label: "XLSX" },
  { icon: "article", label: "MD" },
];

type UploadState = "idle" | "uploading" | "success" | "error";

interface UploadStatus {
  state: UploadState;
  fileName: string;
  error: string | null;
  page: StagingPageIPC | null;
}

export function DropZone() {
  const { currentDomain } = useViewStore();
  const [hover, setHover] = useState(false);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [tauriEnv] = useState(() => isTauri());

  // 监听 Tauri 拖拽事件（仅 Tauri 环境）。
  useEffect(() => {
    if (!tauriEnv) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === "enter" || payload.type === "over") {
            setHover(true);
          } else if (payload.type === "leave") {
            setHover(false);
          } else if (payload.type === "drop") {
            setHover(false);
            const paths = payload.paths as string[];
            if (paths.length > 0) {
              void handleUpload(paths[0]);
            }
          }
        });
      } catch (err) {
        console.warn("[DropZone] Tauri drag-drop listener 不可用:", err);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tauriEnv, currentDomain]);

  const handleUpload = useCallback(
    async (filePath: string) => {
      const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
      const domain: Domain = currentDomain ?? "coding";
      setStatus({ state: "uploading", fileName, error: null, page: null });
      try {
        const result = await uploadFile(filePath, domain);
        if (result.success && result.page) {
          setStatus({
            state: "success",
            fileName,
            error: null,
            page: result.page,
          });
          // 1.5s 后清除成功状态，让 FileList 刷新显示新页面
          setTimeout(() => setStatus(null), 1500);
        } else {
          setStatus({
            state: "error",
            fileName,
            error: result.error ?? "未知错误",
            page: null,
          });
        }
      } catch (err) {
        setStatus({
          state: "error",
          fileName,
          error: err instanceof Error ? err.message : String(err),
          page: null,
        });
      }
    },
    [currentDomain],
  );

  /** 点击选择文件：Tauri 用 plugin-dialog；浏览器用 <input type=file>（仅显示路径）。 */
  const handleClickSelect = useCallback(async () => {
    if (!tauriEnv) {
      // 浏览器 dev 模式：触发隐藏 input
      document.getElementById("dropzone-file-input")?.click();
      return;
    }
    try {
      const dialogMod = await import("@tauri-apps/plugin-dialog");
      const selected = await dialogMod.open({
        multiple: false,
        filters: [
          { name: "文档", extensions: ["pdf", "docx", "xlsx", "md", "txt"] },
        ],
      });
      const filePath =
        typeof selected === "string"
          ? selected
          : selected && typeof selected === "object" && "path" in selected
            ? String((selected as { path: unknown }).path)
            : null;
      if (filePath) {
        void handleUpload(filePath);
      }
    } catch (err) {
      console.error("[DropZone] dialog 打开失败:", err);
      setStatus({
        state: "error",
        fileName: "(unknown)",
        error: err instanceof Error ? err.message : String(err),
        page: null,
      });
    }
  }, [tauriEnv, handleUpload]);

  // 浏览器 input type=file fallback：拿到 File 对象，但无路径，提示用户。
  const handleBrowserFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setStatus({
        state: "error",
        fileName: file.name,
        error: "浏览器 dev 模式无法获取文件磁盘路径。请在 Tauri 应用中上传。",
        page: null,
      });
    },
    [],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!tauriEnv) setHover(true);
      }}
      onDragLeave={() => !tauriEnv && setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        if (!tauriEnv) setHover(false);
      }}
      onClick={handleClickSelect}
      className={`border-2 border-dashed rounded-lg p-12 text-center bg-surface transition-all cursor-pointer ${
        hover
          ? "border-accent-primary bg-elevated"
          : "border-border-strong hover:border-accent-primary hover:bg-elevated"
      }`}
    >
      <input
        id="dropzone-file-input"
        type="file"
        accept=".pdf,.docx,.xlsx,.md,.txt"
        onChange={handleBrowserFile}
        className="hidden"
      />

      {status?.state === "uploading" ? (
        <UploadProgress fileName={status.fileName} />
      ) : status?.state === "success" ? (
        <UploadSuccess fileName={status.fileName} page={status.page} />
      ) : status?.state === "error" ? (
        <UploadError fileName={status.fileName} error={status.error ?? ""} />
      ) : (
        <UploadIdle hover={hover} tauriEnv={tauriEnv} />
      )}
    </div>
  );
}

function UploadIdle({ hover, tauriEnv }: { hover: boolean; tauriEnv: boolean }) {
  return (
    <>
      <span
        className="material-symbols-outlined text-text-muted mb-3"
        style={{ fontSize: 48 }}
      >
        {hover ? "download" : "upload_file"}
      </span>
      <div className="text-[15px] font-medium text-text-primary mb-1">
        {hover ? "释放以解析" : "拖拽 PDF / DOCX / XLSX 到此处"}
      </div>
      <div className="text-xs text-text-muted font-mono">
        或点击选择文件 · 单文件最大 50MB
        {!tauriEnv && (
          <span className="block mt-1 text-accent-warning">
            ⚠ 浏览器 dev 模式：仅 Tauri 应用内可上传
          </span>
        )}
      </div>
      <div className="flex justify-center gap-3 mt-4">
        {FORMAT_CHIPS.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-elevated border border-border-subtle rounded-full text-[11px] font-mono text-text-secondary"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 14 }}
            >
              {chip.icon}
            </span>
            {chip.label}
          </span>
        ))}
      </div>
    </>
  );
}

function UploadProgress({ fileName }: { fileName: string }) {
  return (
    <>
      <span
        className="material-symbols-outlined text-accent-primary mb-3 animate-spin"
        style={{ fontSize: 48 }}
      >
        progress_activity
      </span>
      <div className="text-[15px] font-medium text-text-primary mb-1">
        正在解析…
      </div>
      <div className="text-xs text-text-muted font-mono truncate max-w-md mx-auto">
        {fileName}
      </div>
    </>
  );
}

function UploadSuccess({
  fileName,
  page,
}: {
  fileName: string;
  page: StagingPageIPC | null;
}) {
  return (
    <>
      <span
        className="material-symbols-outlined text-accent-secondary mb-3"
        style={{ fontSize: 48 }}
      >
        check_circle
      </span>
      <div className="text-[15px] font-medium text-text-primary mb-1">
        上传成功 · 已入 staging
      </div>
      <div className="text-xs text-text-muted font-mono truncate max-w-md mx-auto">
        {page?.title ?? fileName} → {page?.path}
      </div>
    </>
  );
}

function UploadError({ fileName, error }: { fileName: string; error: string }) {
  return (
    <>
      <span
        className="material-symbols-outlined text-accent-danger mb-3"
        style={{ fontSize: 48 }}
      >
        error
      </span>
      <div className="text-[15px] font-medium text-text-primary mb-1">
        上传失败
      </div>
      <div className="text-xs text-text-muted font-mono truncate max-w-md mx-auto">
        {fileName}
      </div>
      <div className="text-xs text-accent-danger mt-2 max-w-md mx-auto">
        {error}
      </div>
    </>
  );
}
