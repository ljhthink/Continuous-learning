/**
 * P6-R5: 审核页/领域管理 单元测试
 *
 * 验收标准 AC-REV-* / AC-LLM-* / AC-DOM-*（见 docs/reports/2026-08-02-review-domain-archaeology.md §7）
 *
 * 覆盖：
 * 1. viewStore 新增 reviewTab / openSettings / settingsSection 状态
 * 2. types/index.ts 新增 domainLabel / domainColor 辅助函数（含 null/undefined/未知领域 fallback）
 * 3. Domain 类型从字面量联合改为 string 的兼容性
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useViewStore } from "@/store/viewStore";
import {
  domainLabel,
  domainColor,
  DOMAIN_LABELS,
  DOMAIN_COLORS,
  KNOWN_DOMAINS,
  type Domain,
} from "@/types";

describe("P6-R5 viewStore 审核子标签与设置分区", () => {
  beforeEach(() => {
    useViewStore.setState({
      reviewTab: "experience",
      settingsOpen: false,
      settingsSection: "llm",
    });
  });

  it("初始状态 reviewTab 为 'experience'", () => {
    expect(useViewStore.getState().reviewTab).toBe("experience");
  });

  it("setReviewTab('staging') 切换到 staging 子标签", () => {
    useViewStore.getState().setReviewTab("staging");
    expect(useViewStore.getState().reviewTab).toBe("staging");
  });

  it("setReviewTab 支持 experience 与 staging 两种值", () => {
    useViewStore.getState().setReviewTab("staging");
    expect(useViewStore.getState().reviewTab).toBe("staging");
    useViewStore.getState().setReviewTab("experience");
    expect(useViewStore.getState().reviewTab).toBe("experience");
  });

  it("初始状态 settingsOpen 为 false, settingsSection 为 'llm'", () => {
    expect(useViewStore.getState().settingsOpen).toBe(false);
    expect(useViewStore.getState().settingsSection).toBe("llm");
  });

  it("openSettings() 打开设置面板，默认保留当前分区", () => {
    useViewStore.getState().setSettingsSection("domain-management");
    useViewStore.getState().openSettings();
    expect(useViewStore.getState().settingsOpen).toBe(true);
    expect(useViewStore.getState().settingsSection).toBe("domain-management");
  });

  it("openSettings('domain-management') 打开并直达领域管理分区", () => {
    useViewStore.getState().openSettings("domain-management");
    expect(useViewStore.getState().settingsOpen).toBe(true);
    expect(useViewStore.getState().settingsSection).toBe("domain-management");
  });

  it("openSettings('llm') 打开并直达 LLM 分区", () => {
    useViewStore.getState().setSettingsSection("domain-management");
    useViewStore.getState().openSettings("llm");
    expect(useViewStore.getState().settingsOpen).toBe(true);
    expect(useViewStore.getState().settingsSection).toBe("llm");
  });

  it("setSettingsSection 不影响 settingsOpen 状态", () => {
    useViewStore.getState().setSettingsOpen(true);
    useViewStore.getState().setSettingsSection("domain-management");
    expect(useViewStore.getState().settingsOpen).toBe(true);
    useViewStore.getState().setSettingsOpen(false);
    useViewStore.getState().setSettingsSection("llm");
    expect(useViewStore.getState().settingsOpen).toBe(false);
  });

  it("reviewTab 与 settingsSection 互不影响", () => {
    useViewStore.getState().setReviewTab("staging");
    useViewStore.getState().setSettingsSection("domain-management");
    useViewStore.getState().openSettings();
    expect(useViewStore.getState().reviewTab).toBe("staging");
    expect(useViewStore.getState().settingsSection).toBe("domain-management");
    expect(useViewStore.getState().settingsOpen).toBe(true);
  });
});

describe("P6-R5 types domainLabel/domainColor 辅助函数", () => {
  it("domainLabel 返回已知领域的中文名", () => {
    expect(domainLabel("coding")).toBe("编程");
    expect(domainLabel("kb-system")).toBe("知识库系统");
    expect(domainLabel("design")).toBe("设计素材");
  });

  it("domainLabel 未知领域回退为原名称", () => {
    expect(domainLabel("math-modeling")).toBe("math-modeling");
    expect(domainLabel("data-science")).toBe("data-science");
    expect(domainLabel("finance")).toBe("finance");
  });

  it("domainLabel null/undefined 回退为 '未分类'", () => {
    expect(domainLabel(null)).toBe("未分类");
    expect(domainLabel(undefined)).toBe("未分类");
    expect(domainLabel("")).toBe("未分类");
  });

  it("domainColor 返回已知领域的配色", () => {
    expect(domainColor("coding")).toBe("#4a9eff");
    expect(domainColor("kb-system")).toBe("#8b5cf6");
    expect(domainColor("design")).toBe("#ec4899");
  });

  it("domainColor 未知领域回退为灰色 #6b7280", () => {
    expect(domainColor("math-modeling")).toBe("#6b7280");
    expect(domainColor("data-science")).toBe("#6b7280");
  });

  it("domainColor null/undefined 回退为灰色 #6b7280", () => {
    expect(domainColor(null)).toBe("#6b7280");
    expect(domainColor(undefined)).toBe("#6b7280");
    expect(domainColor("")).toBe("#6b7280");
  });

  it("DOMAIN_LABELS / DOMAIN_COLORS 类型为 Record<string, string>", () => {
    // 确认改为动态类型后，未知 key 不会触发 TypeScript 错误（运行时返回 undefined）
    const labels: Record<string, string> = DOMAIN_LABELS;
    const colors: Record<string, string> = DOMAIN_COLORS;
    expect(labels["coding"]).toBe("编程");
    expect(colors["coding"]).toBe("#4a9eff");
    expect(labels["nonexistent"]).toBeUndefined();
    expect(colors["nonexistent"]).toBeUndefined();
  });
});

describe("P6-R5 Domain 类型从字面量联合改为 string 的兼容性", () => {
  it("Domain 类型接受已知领域名", () => {
    const d1: Domain = "coding";
    const d2: Domain = "kb-system";
    const d3: Domain = "design";
    expect(d1).toBe("coding");
    expect(d2).toBe("kb-system");
    expect(d3).toBe("design");
  });

  it("Domain 类型接受任意字符串（动态领域）", () => {
    const d1: Domain = "math-modeling";
    const d2: Domain = "data-science";
    const d3: Domain = "finance";
    expect(d1).toBe("math-modeling");
    expect(d2).toBe("data-science");
    expect(d3).toBe("finance");
  });

  it("Domain 类型接受空字符串", () => {
    const d: Domain = "";
    expect(d).toBe("");
  });

  it("KNOWN_DOMAINS 包含 8 个已知领域", () => {
    expect(KNOWN_DOMAINS).toHaveLength(8);
    expect(KNOWN_DOMAINS).toContain("coding");
    expect(KNOWN_DOMAINS).toContain("kb-system");
    expect(KNOWN_DOMAINS).toContain("design");
    expect(KNOWN_DOMAINS).toContain("emotions");
    expect(KNOWN_DOMAINS).toContain("reading");
    expect(KNOWN_DOMAINS).toContain("resources");
    expect(KNOWN_DOMAINS).toContain("academic");
    expect(KNOWN_DOMAINS).toContain("life");
  });

  it("Domain 类型可作为函数参数传递（与 viewStore.setDomain 兼容）", () => {
    useViewStore.setState({ currentDomain: null });
    const newDomain: Domain = "math-modeling";
    useViewStore.getState().setDomain(newDomain);
    expect(useViewStore.getState().currentDomain).toBe("math-modeling");
    // 清理
    useViewStore.getState().setDomain(null);
  });
});
