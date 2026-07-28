/**
 * viewStore currentType / setType 单元测试
 *
 * 验收标准 AC-3.1 ~ AC-3.4（类型筛选状态机）+ AC-3.5（类型与领域筛选独立可叠加）
 * 验证 R6 新增的 currentType 状态与 setType 动作的行为契约。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useViewStore } from "../viewStore";
import type { PageType } from "@/types";

describe("viewStore currentType 状态机（R6 新增）", () => {
  beforeEach(() => {
    // 重置 store 到初始状态（Zustand setState 是 merge 语义）
    useViewStore.setState({
      currentType: null,
      currentDomain: null,
      currentView: "preview",
      graphMode: "global",
    });
  });

  // AC-3.1 基础：currentType 默认 null（未筛选）
  it("初始状态 currentType 为 null（表示未筛选）", () => {
    expect(useViewStore.getState().currentType).toBeNull();
  });

  // AC-3.2：setType 接受 4 种 PageType（concept/entity/source/experience）
  describe("setType 接受所有 PageType", () => {
    const types: PageType[] = ["concept", "entity", "source", "experience"];
    types.forEach((t) => {
      it(`setType("${t}") 设置 currentType 为 "${t}"`, () => {
        useViewStore.getState().setType(t);
        expect(useViewStore.getState().currentType).toBe(t);
      });
    });
  });

  // AC-3.4：setType(null) 取消筛选
  it("setType(null) 取消筛选（currentType 回到 null）", () => {
    useViewStore.getState().setType("experience");
    expect(useViewStore.getState().currentType).toBe("experience");
    useViewStore.getState().setType(null);
    expect(useViewStore.getState().currentType).toBeNull();
  });

  // AC-3.4 toggle 语义（CategoryTree 使用的模式：相同类型再次点击取消）
  it("toggle 语义：相同类型再次点击变 null，不同类型切换", () => {
    const store = useViewStore.getState();
    // 首次选中 experience
    store.setType("experience");
    expect(useViewStore.getState().currentType).toBe("experience");
    // CategoryTree 逻辑：setType(currentType === t ? null : t)
    const cur = useViewStore.getState().currentType;
    useViewStore.getState().setType(cur === "experience" ? null : "experience");
    expect(useViewStore.getState().currentType).toBeNull();
    // 切换到不同类型
    useViewStore.getState().setType("concept");
    expect(useViewStore.getState().currentType).toBe("concept");
  });

  // AC-3.5：currentType 与 currentDomain 独立，可叠加
  it("currentType 与 currentDomain 互不影响（可叠加筛选）", () => {
    useViewStore.getState().setDomain("coding");
    useViewStore.getState().setType("experience");
    expect(useViewStore.getState().currentDomain).toBe("coding");
    expect(useViewStore.getState().currentType).toBe("experience");
    // 清除类型不影响领域
    useViewStore.getState().setType(null);
    expect(useViewStore.getState().currentDomain).toBe("coding");
    expect(useViewStore.getState().currentType).toBeNull();
  });

  // setType 纯替换语义（不读前序状态，无读-改-写竞争）
  it("setType 纯替换语义（连续设置取最后一次）", () => {
    useViewStore.getState().setType("concept");
    useViewStore.getState().setType("entity");
    expect(useViewStore.getState().currentType).toBe("entity");
  });

  // setType 不影响其他视图状态
  it("setType 不影响 currentView / theme / graphMode", () => {
    useViewStore.getState().setView("graph");
    useViewStore.getState().setGraphMode("local");
    useViewStore.getState().setType("source");
    expect(useViewStore.getState().currentView).toBe("graph");
    expect(useViewStore.getState().graphMode).toBe("local");
    expect(useViewStore.getState().currentType).toBe("source");
  });

  // currentType 默认值 null 与 currentDomain 默认值 null 语义一致
  it("currentType 默认 null 与 currentDomain 默认 null 语义对称", () => {
    const state = useViewStore.getState();
    expect(state.currentType).toBeNull();
    expect(state.currentDomain).toBeNull();
  });
});
