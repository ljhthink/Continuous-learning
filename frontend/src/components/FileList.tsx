/**
 * FileList — staging 文件列表
 *
 * P4 计划 §4.4.2：卡片含文件类型图标 + 文件名 + 领域·大小·日期
 * + markdown 预览片段 + [预览] [确认] [拒绝] 按钮。
 * 4a 为静态 mock，4b 接入 staging IPC。
 */

import { mockStagingFiles } from "@/data/mockData";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "@/types";
import type { StagingFile } from "@/types";

const FORMAT_ICONS: Record<StagingFile["format"], string> = {
  pdf: "picture_as_pdf",
  docx: "description",
  xlsx: "table_chart",
  md: "article",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileList() {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">待确认文件</h3>
        <span className="font-mono text-[11px] text-text-muted">
          {mockStagingFiles.length} 个文件待审核
        </span>
      </div>
      <div className="space-y-2">
        {mockStagingFiles.map((file) => (
          <FileCard key={file.id} file={file} />
        ))}
      </div>
    </div>
  );
}

function FileCard({ file }: { file: StagingFile }) {
  return (
    <div className="grid grid-cols-[36px_1fr_auto] gap-3 p-3 bg-surface border border-border-subtle rounded-md hover:border-border-strong transition-colors items-center">
      {/* 图标 */}
      <div className="w-9 h-9 flex items-center justify-center bg-elevated rounded-sm">
        <span className="material-symbols-outlined text-accent-primary" style={{ fontSize: 20 }}>
          {FORMAT_ICONS[file.format]}
        </span>
      </div>

      {/* 主体 */}
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-text-primary truncate">{file.name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-mono text-text-muted"
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: DOMAIN_COLORS[file.domain] }}
            />
            {DOMAIN_LABELS[file.domain]}
          </span>
          <span className="text-text-muted">·</span>
          <span className="font-mono text-[11px] text-text-muted">{formatSize(file.size)}</span>
          <span className="text-text-muted">·</span>
          <span className="font-mono text-[11px] text-text-muted">
            {new Date(file.uploadedAt).toLocaleString("zh-CN")}
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
          className="flex items-center justify-center w-7 h-7 rounded-md text-text-secondary hover:bg-hover hover:text-text-primary transition-all"
          title="预览"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            visibility
          </span>
        </button>
        <button
          type="button"
          className="flex items-center justify-center w-7 h-7 rounded-md text-accent-secondary hover:bg-hover transition-all"
          title="确认入库"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            check
          </span>
        </button>
        <button
          type="button"
          className="flex items-center justify-center w-7 h-7 rounded-md text-accent-danger hover:bg-hover transition-all"
          title="拒绝"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            close
          </span>
        </button>
      </div>
    </div>
  );
}
