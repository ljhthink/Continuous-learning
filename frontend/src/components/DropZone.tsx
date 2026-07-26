/**
 * DropZone — 拖拽上传区
 *
 * P4 计划 §4.4.1：三态（empty / hover / loading）。
 * 4a 为静态 mock，4b 接入 Tauri 拖拽事件 + IPC。
 */

import { useState } from "react";

const FORMAT_CHIPS: Array<{ icon: string; label: string }> = [
  { icon: "picture_as_pdf", label: "PDF" },
  { icon: "description", label: "DOCX" },
  { icon: "table_chart", label: "XLSX" },
  { icon: "article", label: "MD" },
];

export function DropZone() {
  const [state, setState] = useState<"empty" | "hover">("empty");

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setState("hover");
      }}
      onDragLeave={() => setState("empty")}
      onDrop={(e) => {
        e.preventDefault();
        setState("empty");
      }}
      className={`border-2 border-dashed rounded-lg p-12 text-center bg-surface transition-all cursor-pointer ${
        state === "hover"
          ? "border-accent-primary bg-elevated"
          : "border-border-strong hover:border-accent-primary hover:bg-elevated"
      }`}
    >
      <span
        className="material-symbols-outlined text-text-muted mb-3"
        style={{ fontSize: 48 }}
      >
        {state === "hover" ? "download" : "upload_file"}
      </span>
      <div className="text-[15px] font-medium text-text-primary mb-1">
        {state === "hover" ? "释放以解析" : "拖拽 PDF / DOCX / XLSX 到此处"}
      </div>
      <div className="text-xs text-text-muted font-mono">
        或点击选择文件 · 单文件最大 50MB
      </div>

      <div className="flex justify-center gap-3 mt-4">
        {FORMAT_CHIPS.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-elevated border border-border-subtle rounded-full text-[11px] font-mono text-text-secondary"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {chip.icon}
            </span>
            {chip.label}
          </span>
        ))}
      </div>
    </div>
  );
}
