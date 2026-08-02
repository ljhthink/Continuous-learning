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
 *
 * P6-R3（决策计划 §4.3）：上传成功后若用户未选领域，自动调用 LLM 分类建议。
 * 采用「LLM 建议 + 用户确认」模式：LLM 推荐领域并提议新分类，但创建/移动必须用户确认。
 */

import { useEffect, useState, useCallback } from "react";
import { useViewStore } from "@/store/viewStore";
import { useGraphStore } from "@/store/graphStore";
import { useLlmStore } from "@/store/llmStore";
import {
  uploadFile,
  isTauri,
  createDomain,
  movePageDomain,
  callMcpTool,
  type StagingPageIPC,
} from "@/lib/ipc";
import {
  classifyDomain,
  loadApiKey,
  type ClassifyResult,
} from "@/lib/llm";
import { DOMAIN_LABELS, domainLabel, domainColor } from "@/types";
import type { Domain } from "@/types";

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
  /** 用户是否在上传前显式选择了领域（false=默认归入 coding，需 LLM 分类建议） */
  userSelectedDomain: boolean;
}

export function DropZone() {
  const { currentDomain, setDomain } = useViewStore();
  const invalidateGraph = useGraphStore((s) => s.invalidate);
  const { llmMode, cloudProvider, customBaseUrl, customModelName } = useLlmStore();
  const [hover, setHover] = useState(false);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [tauriEnv] = useState(() => isTauri());

  // P6-R3: 分类建议状态
  const [classifying, setClassifying] = useState(false);
  const [classifySuggestion, setClassifySuggestion] = useState<ClassifyResult | null>(null);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [showDomainPicker, setShowDomainPicker] = useState(false);
  const [existingDomains, setExistingDomains] = useState<string[]>([]);
  const [moving, setMoving] = useState(false);

  /** P6-R3: 重置分类建议状态 */
  const resetClassifyState = useCallback(() => {
    setClassifying(false);
    setClassifySuggestion(null);
    setClassifyError(null);
    setShowDomainPicker(false);
  }, []);

  /** P6-R3: 触发 LLM 分类建议（建议+确认模式） */
  const triggerClassify = useCallback(
    async (page: StagingPageIPC) => {
      // LLM 未启用时不分类，但需明确告知用户原因（避免"空面板"困惑）
      if (llmMode === "disabled") {
        setClassifyError("LLM 未启用，请在设置中启用 LLM 集成后再使用自动分类");
        setTimeout(() => setStatus(null), 4000);
        return;
      }
      if (llmMode === "local-first") {
        // local-first 暂不支持分类（P7 实现 Ollama 后再支持）
        setClassifyError("本地优先模式暂不支持自动分类（计划在 P7 实现 Ollama 后支持）");
        setTimeout(() => setStatus(null), 4000);
        return;
      }

      setClassifying(true);
      setClassifyError(null);
      try {
        const apiKey = await loadApiKey(cloudProvider);
        if (!apiKey) {
          // 无 API Key：明确提示，避免用户误以为功能损坏
          setClassifying(false);
          setClassifyError("未找到 API Key，请在设置中配置 LLM API Key 后再使用自动分类");
          setTimeout(() => setStatus(null), 4000);
          return;
        }

        // 获取已有领域列表
        const catsResult = await callMcpTool("kb_list_categories");
        const domains: string[] =
          catsResult.success && Array.isArray((catsResult.data as { categories?: unknown }).categories)
            ? ((catsResult.data as { categories: Array<{ name: string }> }).categories).map((c) => c.name)
            : Object.keys(DOMAIN_LABELS);
        setExistingDomains(domains);

        // 调用分类
        const result = await classifyDomain(
          cloudProvider,
          apiKey,
          page.title,
          page.preview,
          domains,
          customBaseUrl,
          customModelName,
        );

        if (result.success && result.result) {
          setClassifySuggestion(result.result);
        } else {
          setClassifyError(result.error ?? "分类失败");
        }
      } catch (err) {
        setClassifyError(err instanceof Error ? err.message : String(err));
      } finally {
        setClassifying(false);
      }
    },
    [llmMode, cloudProvider, customBaseUrl, customModelName],
  );

  const handleUpload = useCallback(
    async (filePath: string) => {
      const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
      const userSelectedDomain = currentDomain !== null;
      const domain: Domain = currentDomain ?? "coding";
      // P6-R3: 重置上一次的分类建议
      resetClassifyState();
      setStatus({ state: "uploading", fileName, error: null, page: null, userSelectedDomain });
      try {
        const result = await uploadFile(filePath, domain);
        if (result.success && result.page) {
          setStatus({
            state: "success",
            fileName,
            error: null,
            page: result.page,
            userSelectedDomain,
          });
          invalidateGraph();

          // P6-R3: 若用户未显式选择领域，自动触发 LLM 分类建议
          if (!userSelectedDomain) {
            void triggerClassify(result.page);
          } else {
            // 用户已选领域，1.5s 后清除成功状态
            setTimeout(() => setStatus(null), 1500);
          }
        } else {
          setStatus({
            state: "error",
            fileName,
            error: result.error ?? "未知错误",
            page: null,
            userSelectedDomain,
          });
        }
      } catch (err) {
        setStatus({
          state: "error",
          fileName,
          error: err instanceof Error ? err.message : String(err),
          page: null,
          userSelectedDomain,
        });
      }
    },
    [currentDomain, invalidateGraph, resetClassifyState, triggerClassify],
  );

  // 监听 Tauri 拖拽事件（仅 Tauri 环境）。
  // 依赖 handleUpload：当 LLM 设置变化导致 triggerClassify → handleUpload 重建时，
  // 拖拽监听器需重新注册以捕获最新闭包（修复 R6 stale closure，见考古报告 §3.2/§4.3）。
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
  }, [tauriEnv, currentDomain, handleUpload]);

  /** P6-R3: 接受 LLM 分类建议 — 移动页面到推荐领域 */
  const handleAcceptSuggestion = useCallback(async () => {
    if (!status?.page || !classifySuggestion?.domain) return;
    const targetDomain = classifySuggestion.domain;
    setMoving(true);
    try {
      await movePageDomain(status.page.path, targetDomain);
      setDomain(targetDomain as Domain);
      invalidateGraph();
      resetClassifyState();
      setStatus(null);
    } catch (err) {
      setClassifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setMoving(false);
    }
  }, [status, classifySuggestion, setDomain, invalidateGraph, resetClassifyState]);

  /** P6-R3: 改选领域 — 从已有领域列表中选择 */
  const handleChangeDomain = useCallback(
    async (targetDomain: string) => {
      if (!status?.page) return;
      setMoving(true);
      try {
        await movePageDomain(status.page.path, targetDomain);
        setDomain(targetDomain as Domain);
        invalidateGraph();
        resetClassifyState();
        setStatus(null);
      } catch (err) {
        setClassifyError(err instanceof Error ? err.message : String(err));
      } finally {
        setMoving(false);
      }
    },
    [status, setDomain, invalidateGraph, resetClassifyState],
  );

  /** P6-R3: 创建新分类并移动页面（用户二次确认） */
  const handleCreateNewDomain = useCallback(async () => {
    if (!status?.page || !classifySuggestion?.new_domain_proposal) return;
    const proposal = classifySuggestion.new_domain_proposal;
    // 二次确认（安全约束：创建分类必须用户显式确认）
    const confirmed = window.confirm(
      `确认创建新分类「${proposal.name}」？\n\n描述：${proposal.description}\n\n点击"确定"将：\n1. 创建 wiki/${proposal.name}/ 目录\n2. 更新 index.md 追加领域分组\n3. 将当前文档移入新分类\n4. 请手动在 AGENTS.md §8.1 追加领域说明`,
    );
    if (!confirmed) return;

    setMoving(true);
    try {
      await createDomain(proposal.name, proposal.description);
      await movePageDomain(status.page.path, proposal.name);
      setDomain(proposal.name as Domain);
      invalidateGraph();
      resetClassifyState();
      setStatus(null);
    } catch (err) {
      setClassifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setMoving(false);
    }
  }, [status, classifySuggestion, setDomain, invalidateGraph, resetClassifyState]);

  /** P6-R3: 保持当前分类（不移动） */
  const handleKeepCurrent = useCallback(() => {
    resetClassifyState();
    setStatus(null);
  }, [resetClassifyState]);

  /** 点击选择文件：Tauri 用 plugin-dialog；浏览器用 <input type=file>（仅显示路径）。 */
  const handleClickSelect = useCallback(async () => {
    if (!tauriEnv) {
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
        userSelectedDomain: false,
      });
    }
  }, [tauriEnv, handleUpload]);

  // 浏览器 input type=file fallback
  const handleBrowserFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setStatus({
        state: "error",
        fileName: file.name,
        error: "浏览器 dev 模式无法获取文件磁盘路径。请在 Tauri 应用中上传。",
        page: null,
        userSelectedDomain: false,
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
        <UploadSuccessWithClassify
          fileName={status.fileName}
          page={status.page}
          classifying={classifying}
          suggestion={classifySuggestion}
          error={classifyError}
          showDomainPicker={showDomainPicker}
          existingDomains={existingDomains}
          moving={moving}
          currentDomain={status.page?.domain ?? "coding"}
          onAccept={handleAcceptSuggestion}
          onChangeDomain={handleChangeDomain}
          onCreateNew={handleCreateNewDomain}
          onKeep={handleKeepCurrent}
          onTogglePicker={() => setShowDomainPicker((v) => !v)}
        />
      ) : status?.state === "error" ? (
        <UploadError fileName={status.fileName} error={status.error ?? ""} />
      ) : (
        <UploadIdle hover={hover} tauriEnv={tauriEnv} currentDomain={currentDomain} />
      )}
    </div>
  );
}

function UploadIdle({ hover, tauriEnv, currentDomain }: { hover: boolean; tauriEnv: boolean; currentDomain: Domain | null }) {
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
      {/* P5-R4: 显示目标领域，提醒用户上传前在左侧选择正确领域 */}
      <div className="mt-3 text-xs">
        {currentDomain ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-elevated border border-border-subtle rounded-full text-text-secondary">
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>folder</span>
            目标领域：{domainLabel(currentDomain)}
          </span>
        ) : (
          <span className="text-accent-warning">
            ⚠ 未选择领域，将默认归入「编程」。上传后 LLM 会自动推荐分类（需启用 LLM）。
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

/**
 * P6-R3: 上传成功 + 分类建议组件。
 *
 * 三种子状态：
 * 1. classifying=true：正在分析分类（loading）
 * 2. suggestion 存在：显示分类建议 + 操作按钮
 * 3. 否则：普通成功提示
 */
function UploadSuccessWithClassify({
  fileName,
  page,
  classifying,
  suggestion,
  error,
  showDomainPicker,
  existingDomains,
  moving,
  currentDomain,
  onAccept,
  onChangeDomain,
  onCreateNew,
  onKeep,
  onTogglePicker,
}: {
  fileName: string;
  page: StagingPageIPC | null;
  classifying: boolean;
  suggestion: ClassifyResult | null;
  error: string | null;
  showDomainPicker: boolean;
  existingDomains: string[];
  moving: boolean;
  currentDomain: string;
  onAccept: () => void;
  onChangeDomain: (domain: string) => void;
  onCreateNew: () => void;
  onKeep: () => void;
  onTogglePicker: () => void;
}) {
  if (classifying) {
    return (
      <>
        <span
          className="material-symbols-outlined text-accent-primary mb-3 animate-spin"
          style={{ fontSize: 48 }}
        >
          progress_activity
        </span>
        <div className="text-[15px] font-medium text-text-primary mb-1">
          上传成功 · 正在分析分类…
        </div>
        <div className="text-xs text-text-muted font-mono truncate max-w-md mx-auto">
          {page?.title ?? fileName} → {page?.path}
        </div>
        <div className="text-xs text-text-muted mt-2">
          LLM 正在根据文档内容推荐最合适的领域
        </div>
      </>
    );
  }

  if (suggestion) {
    return (
      <ClassifySuggestion
        suggestion={suggestion}
        error={error}
        showDomainPicker={showDomainPicker}
        existingDomains={existingDomains}
        moving={moving}
        currentDomain={currentDomain}
        page={page}
        onAccept={onAccept}
        onChangeDomain={onChangeDomain}
        onCreateNew={onCreateNew}
        onKeep={onKeep}
        onTogglePicker={onTogglePicker}
      />
    );
  }

  // 无分类建议（LLM 未启用或无 API Key）
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
      {error && (
        <div className="text-xs text-accent-warning mt-2">
          分类建议不可用：{error}
        </div>
      )}
    </>
  );
}

/** P6-R3: 分类建议卡片（LLM 建议 + 用户确认） */
function ClassifySuggestion({
  suggestion,
  error,
  showDomainPicker,
  existingDomains,
  moving,
  currentDomain,
  page,
  onAccept,
  onChangeDomain,
  onCreateNew,
  onKeep,
  onTogglePicker,
}: {
  suggestion: ClassifyResult;
  error: string | null;
  showDomainPicker: boolean;
  existingDomains: string[];
  moving: boolean;
  currentDomain: string;
  page: StagingPageIPC | null;
  onAccept: () => void;
  onChangeDomain: (domain: string) => void;
  onCreateNew: () => void;
  onKeep: () => void;
  onTogglePicker: () => void;
}) {
  const hasDomainRec = suggestion.domain && suggestion.domain !== currentDomain;
  const hasNewProposal = !!suggestion.new_domain_proposal;
  const confidencePct = Math.round(suggestion.confidence * 100);
  const highConfidence = suggestion.confidence >= 0.7;

  return (
    <div className="text-left" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 mb-3">
        <span
          className="material-symbols-outlined text-accent-secondary"
          style={{ fontSize: 32 }}
        >
          auto_awesome
        </span>
        <div>
          <div className="text-[15px] font-medium text-text-primary">
            上传成功 · LLM 分类建议
          </div>
          <div className="text-xs text-text-muted font-mono truncate max-w-md">
            {page?.title ?? "未知文件"}
          </div>
        </div>
      </div>

      {/* 分类建议主体 */}
      <div className="bg-elevated border border-border-subtle rounded-lg p-4 mb-3">
        {hasDomainRec ? (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: domainColor(suggestion.domain) }}
              />
              <span className="text-sm font-medium text-text-primary">
                建议归入「{domainLabel(suggestion.domain)}」
              </span>
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                  highConfidence
                    ? "bg-accent-secondary/15 text-accent-secondary"
                    : "bg-accent-warning/15 text-accent-warning"
                }`}
              >
                置信度 {confidencePct}%
              </span>
            </div>
            <div className="text-xs text-text-muted ml-5">
              {suggestion.reason}
            </div>
            <div className="text-[11px] text-text-muted ml-5 mt-1">
              当前领域：{domainLabel(currentDomain)} → 建议：{domainLabel(suggestion.domain)}
            </div>
          </div>
        ) : hasNewProposal ? (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-accent-warning" style={{ fontSize: 18 }}>
                lightbulb
              </span>
              <span className="text-sm font-medium text-text-primary">
                建议新建分类「{suggestion.new_domain_proposal!.name}」
              </span>
            </div>
            <div className="text-xs text-text-muted ml-6">
              {suggestion.new_domain_proposal!.description}
            </div>
            <div className="text-xs text-text-muted ml-6 mt-1">
              理由：{suggestion.reason}
            </div>
          </div>
        ) : (
          <div className="mb-3 text-sm text-text-muted">
            LLM 未给出明确建议（置信度 {confidencePct}%）。请手动选择领域。
          </div>
        )}

        {error && (
          <div className="text-xs text-accent-danger mb-2">{error}</div>
        )}

        {/* 领域选择器（改选时展开） */}
        {showDomainPicker && (
          <div className="mb-3 bg-surface border border-border-subtle rounded-lg p-2 max-h-48 overflow-y-auto">
            <div className="text-[11px] text-text-muted mb-1 px-1">选择领域：</div>
            {existingDomains.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChangeDomain(d)}
                disabled={moving}
                className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-elevated flex items-center gap-2 disabled:opacity-50"
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: domainColor(d) }}
                />
                <span className="text-text-primary">{domainLabel(d)}</span>
                {d === currentDomain && (
                  <span className="text-[10px] text-text-muted ml-auto">当前</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex flex-wrap gap-2">
          {hasDomainRec && (
            <button
              type="button"
              onClick={onAccept}
              disabled={moving}
              className="px-3 py-1.5 bg-accent-primary text-white rounded text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
            >
              {moving ? (
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>progress_activity</span>
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
              )}
              接受建议
            </button>
          )}
          {hasNewProposal && (
            <button
              type="button"
              onClick={onCreateNew}
              disabled={moving}
              className="px-3 py-1.5 bg-accent-secondary text-white rounded text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
            >
              {moving ? (
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>progress_activity</span>
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>create_new_folder</span>
              )}
              创建并移入
            </button>
          )}
          <button
            type="button"
            onClick={onTogglePicker}
            disabled={moving}
            className="px-3 py-1.5 bg-elevated border border-border-subtle text-text-secondary rounded text-xs font-medium hover:bg-surface disabled:opacity-50 flex items-center gap-1"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>swap_horiz</span>
            {showDomainPicker ? "收起" : "改选领域"}
          </button>
          <button
            type="button"
            onClick={onKeep}
            disabled={moving}
            className="px-3 py-1.5 text-text-muted rounded text-xs hover:bg-elevated disabled:opacity-50"
          >
            保持「{domainLabel(currentDomain)}」
          </button>
        </div>
      </div>

      <div className="text-[11px] text-text-muted text-center">
        文档已暂存于 staging，可在「待审核」中查看或整理
      </div>
    </div>
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
