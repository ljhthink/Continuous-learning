/**
 * MarkdownPreview — wiki 页预览
 *
 * P4 计划 §4.4.3：Obsidian 兼容渲染（frontmatter 卡片 + wikilinks
 * + 代码高亮 + Mermaid）。4a 为简化静态渲染，4c 接入 react-markdown。
 */

import { mockPageDetail } from "@/data/mockData";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "@/types";
import type { PageType, PageStatus } from "@/types";

const TYPE_LABELS: Record<PageType, string> = {
  concept: "概念",
  entity: "实体",
  source: "来源",
  experience: "经验",
};

const STATUS_LABELS: Record<PageStatus, string> = {
  active: "active",
  staging: "staging",
  pending: "pending",
  archived: "archived",
  rejected: "rejected",
};

export function MarkdownPreview() {
  const page = mockPageDetail;

  return (
    <div className="max-w-3xl mx-auto px-8 py-6">
      {/* frontmatter 信息卡片 */}
      <div className="bg-surface border border-border-subtle rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ background: DOMAIN_COLORS[page.domain] }}
          />
          <span className="text-xs font-mono text-text-secondary">
            {DOMAIN_LABELS[page.domain]}
          </span>
          <span className="text-text-muted">·</span>
          <span className="text-xs font-mono text-text-secondary">{TYPE_LABELS[page.type]}</span>
          <span className="text-text-muted">·</span>
          <span
            className={`text-xs font-mono px-1.5 py-0.5 rounded-sm ${
              page.status === "active"
                ? "text-accent-secondary bg-active"
                : "text-accent-warning bg-elevated"
            }`}
          >
            {STATUS_LABELS[page.status]}
          </span>
          <span className="text-text-muted">·</span>
          <span className="text-xs font-mono text-text-muted">{page.date}</span>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary mb-2">{page.title}</h1>
        <div className="flex flex-wrap gap-1.5">
          {page.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] font-mono text-text-secondary bg-elevated px-2 py-0.5 rounded-full"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* body 渲染（简化版：按行解析标题/代码块/段落） */}
      <div className="prose prose-invert max-w-none">
        <MarkdownBody body={page.body} />
      </div>
    </div>
  );
}

/** 简化版 markdown 渲染（4a 静态版本，4c 替换为 react-markdown） */
function MarkdownBody({ body }: { body: string }) {
  const lines = body.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = "";

  lines.forEach((line, idx) => {
    // 代码块开始/结束
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${idx}`}
            data-lang={codeLang || undefined}
            className="bg-code-bg text-code-text font-mono text-xs p-4 rounded-md overflow-x-auto my-3"
          >
            <code>{codeBuffer.join("\n")}</code>
          </pre>,
        );
        codeBuffer = [];
        codeLang = "";
        inCodeBlock = false;
      } else {
        codeLang = line.slice(3).trim();
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    // 标题
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={idx} className="text-xl font-semibold text-text-primary mt-6 mb-3">
          {line.slice(2)}
        </h1>,
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={idx} className="text-lg font-semibold text-text-primary mt-5 mb-2">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={idx} className="text-base font-medium text-text-primary mt-4 mb-2">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("- ")) {
      elements.push(
        <li key={idx} className="text-text-primary ml-6 list-disc">
          {renderInline(line.slice(2))}
        </li>,
      );
    } else if (line.trim() === "") {
      elements.push(<div key={idx} className="h-3" />);
    } else {
      elements.push(
        <p key={idx} className="text-text-primary leading-relaxed my-1">
          {renderInline(line)}
        </p>,
      );
    }
  });

  return <>{elements}</>;
}

/** 内联渲染：wikilinks + code */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // [[wikilink|alias]]
    const wikiMatch = remaining.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    // `code`
    const codeMatch = remaining.match(/`([^`]+)`/);

    const wikiIdx = wikiMatch ? remaining.indexOf(wikiMatch[0]) : -1;
    const codeIdx = codeMatch ? remaining.indexOf(codeMatch[0]) : -1;

    if (wikiIdx === -1 && codeIdx === -1) {
      parts.push(remaining);
      break;
    }

    if (wikiIdx !== -1 && (codeIdx === -1 || wikiIdx < codeIdx)) {
      if (wikiIdx > 0) parts.push(remaining.slice(0, wikiIdx));
      const path = wikiMatch![1];
      const alias = wikiMatch![2] || path.split("/").pop() || path;
      parts.push(
        <span
          key={`wiki-${key++}`}
          className="text-accent-primary cursor-pointer hover:underline"
          title={path}
        >
          {alias}
        </span>,
      );
      remaining = remaining.slice(wikiIdx + wikiMatch![0].length);
    } else {
      if (codeIdx > 0) parts.push(remaining.slice(0, codeIdx));
      parts.push(
        <code
          key={`code-${key++}`}
          className="bg-code-bg text-code-text font-mono text-[13px] px-1.5 py-0.5 rounded-sm"
        >
          {codeMatch![1]}
        </code>,
      );
      remaining = remaining.slice(codeIdx + codeMatch![0].length);
    }
  }

  return <>{parts}</>;
}
