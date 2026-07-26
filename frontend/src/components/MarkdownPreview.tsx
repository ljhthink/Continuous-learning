/**
 * MarkdownPreview — wiki 页预览
 *
 * P4 计划 §4.4.3：Obsidian 兼容渲染（frontmatter 卡片 + wikilinks
 * + 代码高亮）。4c 接入 react-markdown + callMcpTool("kb_get_page")。
 *
 * 数据来源：
 *   - Tauri 环境：callMcpTool("kb_get_page", { page_path })
 *   - 浏览器 dev：mockPageDetail
 *
 * wikilink 点击：[[wiki/coding/foo]] → setCurrentPagePath + 重新加载
 */

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { useViewStore } from "@/store/viewStore";
import { mockPageDetail } from "@/data/mockData";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "@/types";
import type { PageType, PageStatus, PageDetail } from "@/types";
import { callMcpTool, isTauri } from "@/lib/ipc";

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
  const { currentPagePath, setCurrentPagePath } = useViewStore();
  const [page, setPage] = useState<PageDetail>(mockPageDetail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tauriEnv = isTauri();

  const loadPage = useCallback(
    (pagePath: string) => {
      if (!tauriEnv) {
        setPage(mockPageDetail);
        return;
      }
      setLoading(true);
      setError(null);
      callMcpTool("kb_get_page", { page_path: pagePath })
        .then((result) => {
          if (result.success && result.data) {
            setPage(result.data as PageDetail);
          } else {
            setError(result.error ?? "加载页面失败");
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setLoading(false));
    },
    [tauriEnv],
  );

  useEffect(() => {
    if (currentPagePath) {
      loadPage(currentPagePath);
    } else if (!tauriEnv) {
      setPage(mockPageDetail);
    }
  }, [currentPagePath, loadPage, tauriEnv]);

  // wikilink 点击处理：[[wiki/coding/foo]] → 导航
  const handleWikiLinkClick = useCallback(
    (path: string) => {
      // Normalize: strip .md suffix if present (kb_get_page accepts both)
      const normalized = path.replace(/\.md$/, "");
      setCurrentPagePath(normalized);
    },
    [setCurrentPagePath],
  );

  return (
    <div className="max-w-3xl mx-auto px-8 py-6">
      {loading && (
        <div className="text-sm text-text-secondary flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>
            progress_activity
          </span>
          加载中...
        </div>
      )}
      {error && !loading && (
        <div className="text-sm text-red-400 mb-4">⚠️ {error}</div>
      )}

      {/* frontmatter 信息卡片 */}
      <div className="bg-surface border border-border-subtle rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ background: DOMAIN_COLORS[page.domain] ?? "#888" }}
          />
          <span className="text-xs font-mono text-text-secondary">
            {DOMAIN_LABELS[page.domain] ?? page.domain}
          </span>
          <span className="text-text-muted">·</span>
          <span className="text-xs font-mono text-text-secondary">
            {TYPE_LABELS[page.type] ?? page.type}
          </span>
          <span className="text-text-muted">·</span>
          <span
            className={`text-xs font-mono px-1.5 py-0.5 rounded-sm ${
              page.status === "active"
                ? "text-accent-secondary bg-active"
                : "text-accent-warning bg-elevated"
            }`}
          >
            {STATUS_LABELS[page.status] ?? page.status}
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
        <div className="mt-2 text-[10px] font-mono text-text-muted">
          {page.path}
        </div>
      </div>

      {/* body 渲染：react-markdown + GFM + 语法高亮（DEF-6 修复；Mermaid 推迟 P5） */}
      <div className="prose prose-invert max-w-none text-text-primary">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            // 自定义链接：内部 wikilink vs 外部 URL
            a: ({ href, children }) => {
              if (!href) return <a>{children}</a>;
              // wikilink 形式：path 或 [[path|alias]]
              if (href.startsWith("wiki/") || href.startsWith("/wiki/")) {
                return (
                  <span
                    className="text-accent-primary cursor-pointer hover:underline"
                    title={href}
                    onClick={(e) => {
                      e.preventDefault();
                      handleWikiLinkClick(href);
                    }}
                  >
                    {children}
                  </span>
                );
              }
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline"
                >
                  {children}
                </a>
              );
            },
            // 代码块
            pre: ({ children, className }) => {
              // rehype-mermaid "pre-mermaid" strategy 产出 <pre class="mermaid">
              if (className === "mermaid") {
                return (
                  <pre className="mermaid bg-surface border border-border-subtle rounded-md p-4 my-3 text-xs font-mono text-text-secondary overflow-x-auto">
                    {children}
                    <div className="mt-2 text-[10px] text-text-muted">
                      （Mermaid 图表 — 客户端渲染待 P5 启用）
                    </div>
                  </pre>
                );
              }
              return (
                <pre className="bg-code-bg text-code-text font-mono text-xs p-4 rounded-md overflow-x-auto my-3">
                  {children}
                </pre>
              );
            },
            code: ({ className, children, ...props }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code
                    className="bg-code-bg text-code-text font-mono text-[13px] px-1.5 py-0.5 rounded-sm"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              // rehype-highlight 添加的 hljs / language-xxx 类名保留
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            // 标题样式
            h1: ({ children }) => (
              <h1 className="text-xl font-semibold text-text-primary mt-6 mb-3">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-lg font-semibold text-text-primary mt-5 mb-2">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-base font-medium text-text-primary mt-4 mb-2">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="text-text-primary leading-relaxed my-2">{children}</p>
            ),
            ul: ({ children }) => <ul className="ml-6 list-disc my-2">{children}</ul>,
            ol: ({ children }) => <ol className="ml-6 list-decimal my-2">{children}</ol>,
            li: ({ children }) => <li className="text-text-primary my-0.5">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-accent-primary pl-4 text-text-secondary italic my-3">
                {children}
              </blockquote>
            ),
            table: ({ children }) => (
              <table className="w-full text-sm border-collapse my-3">{children}</table>
            ),
            th: ({ children }) => (
              <th className="border border-border-subtle px-3 py-1.5 bg-elevated text-left text-text-primary font-medium">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-border-subtle px-3 py-1.5 text-text-secondary">
                {children}
              </td>
            ),
            hr: () => <hr className="border-border-subtle my-4" />,
          }}
        >
          {page.body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
