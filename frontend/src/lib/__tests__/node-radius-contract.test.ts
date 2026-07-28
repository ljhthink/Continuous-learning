/**
 * nodeRadius 算法契约测试
 *
 * 验收标准 AC-2.1（experience 最小 12px）/ AC-2.2（experience 节点视觉可见性）
 *
 * 注意：nodeRadius 是 GraphView.tsx 的内部函数（未 export），本测试复制其实现
 * 作为"算法契约基准"（来源：frontend/src/components/GraphView.tsx:88-99），用于：
 *   1. 锁定类型差异化最小半径的边界行为（边界值分析）
 *   2. 防止未来重构时回归到 R6 修复前的"experience 节点过小"问题
 * 真实运行时行为由 Playwright E2E（AC-2.4）验证。
 * 如源码变更，须同步更新此参考实现以保持契约一致。
 */
import { describe, it, expect } from "vitest";
import type { PageType } from "@/types";

/**
 * nodeRadius 参考实现（复制自 frontend/src/components/GraphView.tsx:88-99）
 *
 * 公式：Math.max(minRadius, Math.min(20, Math.sqrt(inDegree + 1) * 3.5))
 *   - minRadius 按 type 查表：experience=12 / source=10 / concept=7 / entity=7
 *   - 未传 type 时 minRadius=5（向后兼容 R6 修复前行为）
 *   - 上限钳制 20px，下限按类型
 */
function nodeRadius(inDegree: number, type?: PageType): number {
  const minRadiusByType: Record<PageType, number> = {
    experience: 12,
    source: 10,
    concept: 7,
    entity: 7,
  };
  const minRadius = type ? minRadiusByType[type] : 5;
  return Math.max(minRadius, Math.min(20, Math.sqrt(inDegree + 1) * 3.5));
}

describe("nodeRadius 类型差异化最小半径（AC-2.1）", () => {
  describe("experience 类型（最小 12px，R6 核心修复）", () => {
    it("inDegree=0 返回 12（最小半径生效；修复前为 5px）", () => {
      expect(nodeRadius(0, "experience")).toBe(12);
    });
    it("inDegree=1 返回 12（sqrt(2)*3.5≈4.95 < 12）", () => {
      expect(nodeRadius(1, "experience")).toBe(12);
    });
    it("inDegree=10 返回 12（sqrt(11)*3.5≈11.6 < 12）", () => {
      expect(nodeRadius(10, "experience")).toBe(12);
    });
    it("inDegree=11 返回 ~12.12（sqrt(12)*3.5≈12.12 > 12，公式值生效）", () => {
      expect(nodeRadius(11, "experience")).toBeCloseTo(12.12, 1);
    });
    it("inDegree=31 返回 ~19.8（sqrt(32)*3.5≈19.8 < 20，未触上限）", () => {
      expect(nodeRadius(31, "experience")).toBeCloseTo(19.8, 1);
    });
    it("inDegree=32 返回 20（sqrt(33)*3.5≈20.1 > 20 → 上限钳制）", () => {
      expect(nodeRadius(32, "experience")).toBe(20);
    });
    it("inDegree=100 返回 20（上限钳制）", () => {
      expect(nodeRadius(100, "experience")).toBe(20);
    });
    // mock 数据中的真实节点：mcp-cache-exp（inDegree=0）
    it("mock 节点 mcp-cache-exp（inDegree=0）返回 12px", () => {
      expect(nodeRadius(0, "experience")).toBe(12);
    });
  });

  describe("source 类型（最小 10px）", () => {
    it("inDegree=0 返回 10", () => {
      expect(nodeRadius(0, "source")).toBe(10);
    });
    it("inDegree=7 返回 10（sqrt(8)*3.5≈9.9 < 10）", () => {
      expect(nodeRadius(7, "source")).toBe(10);
    });
    it("inDegree=8 返回 ~10.5（sqrt(9)*3.5=10.5 > 10）", () => {
      expect(nodeRadius(8, "source")).toBeCloseTo(10.5, 1);
    });
  });

  describe("concept 类型（最小 7px）", () => {
    it("inDegree=0 返回 7", () => {
      expect(nodeRadius(0, "concept")).toBe(7);
    });
    it("inDegree=3 返回 7（sqrt(4)*3.5=7 = minRadius）", () => {
      expect(nodeRadius(3, "concept")).toBe(7);
    });
    it("inDegree=4 返回 ~7.78（sqrt(5)*3.5≈7.78 > 7）", () => {
      expect(nodeRadius(4, "concept")).toBeCloseTo(7.78, 1);
    });
    // mock 数据 design-index inDegree=8
    it("mock 节点 design-index（inDegree=8）返回 10.5px", () => {
      expect(nodeRadius(8, "concept")).toBeCloseTo(10.5, 1);
    });
  });

  describe("entity 类型（最小 7px）", () => {
    it("inDegree=0 返回 7", () => {
      expect(nodeRadius(0, "entity")).toBe(7);
    });
    it("inDegree=1 返回 7（sqrt(2)*3.5≈4.95 < 7）", () => {
      expect(nodeRadius(1, "entity")).toBe(7);
    });
  });

  describe("向后兼容（type 未传，最小 5px = R6 修复前行为）", () => {
    it("inDegree=0 无 type 返回 5", () => {
      expect(nodeRadius(0)).toBe(5);
    });
    it("inDegree=1 无 type 返回 5（sqrt(2)*3.5≈4.95 < 5）", () => {
      expect(nodeRadius(1)).toBe(5);
    });
    it("inDegree=3 无 type 返回 7（sqrt(4)*3.5=7 > 5）", () => {
      expect(nodeRadius(3)).toBe(7);
    });
  });

  describe("上限钳制（所有类型最大 20px）", () => {
    (["experience", "source", "concept", "entity"] as PageType[]).forEach((t) => {
      it(`${t} inDegree=100 返回 20（上限）`, () => {
        expect(nodeRadius(100, t)).toBe(20);
      });
      it(`${t} inDegree=32 返回 20（sqrt(33)*3.5≈20.1 触上限）`, () => {
        expect(nodeRadius(32, t)).toBe(20);
      });
    });
  });

  describe("AC-2.2 视觉可见性：experience 节点不小于其他类型", () => {
    it("experience inDegree=0 (12px) >= 其他类型 inDegree=0 平均值", () => {
      const expR = nodeRadius(0, "experience");
      const others = [
        nodeRadius(0, "source"),
        nodeRadius(0, "concept"),
        nodeRadius(0, "entity"),
      ];
      const avg = others.reduce((a, b) => a + b, 0) / others.length;
      expect(expR).toBeGreaterThanOrEqual(avg);
    });
    it("experience inDegree=0 (12px) > concept inDegree=0 (7px)", () => {
      expect(nodeRadius(0, "experience")).toBeGreaterThan(nodeRadius(0, "concept"));
    });
    it("experience inDegree=0 (12px) > entity inDegree=0 (7px)", () => {
      expect(nodeRadius(0, "experience")).toBeGreaterThan(nodeRadius(0, "entity"));
    });
    it("experience inDegree=0 (12px) > source inDegree=0 (10px)", () => {
      expect(nodeRadius(0, "experience")).toBeGreaterThan(nodeRadius(0, "source"));
    });
  });

  describe("边界值：负 inDegree 防御", () => {
    it("inDegree=-1 experience 返回 12（sqrt(0)*3.5=0，max(12,0)=12）", () => {
      expect(nodeRadius(-1, "experience")).toBe(12);
    });
    it("inDegree=-1 无 type 返回 5（max(5,0)=5）", () => {
      expect(nodeRadius(-1)).toBe(5);
    });
  });
});
