/**
 * d3-force-3d 类型声明
 *
 * d3-force-3d 是 d3-force 的 3D 扩展版本，被 react-force-graph-2d 作为底层物理引擎使用。
 * 该包未自带 TypeScript 类型声明，此处提供最小化声明以支持 forceCollide 导入。
 *
 * 完整 API 参考：https://github.com/vasturiano/d3-force-3d
 */

declare module "d3-force-3d" {
  /**
   * 碰撞检测力：将节点视为圆形，防止节点重叠。
   * 两个节点 a 和 b 会被分开，使其距离至少为 radius(a) + radius(b)。
   */
  export function forceCollide<NodeDatum = unknown>(
    radius?: number | ((node: NodeDatum) => number),
  ): ForceCollide<NodeDatum>;

  /**
   * d3-force 的力对象本质是一个带方法的函数。
   * 调用签名 (alpha: number): void 是 d3-force simulation 每帧调用力时使用的接口。
   * 方法 .radius()/.strength()/.iterations() 用于配置力参数。
   */
  export interface ForceCollide<NodeDatum> {
    (alpha: number): void;
    /**
     * 设置每个节点的碰撞半径（或半径访问器函数）。
     * 节点半径仅在力初始化或此方法被调用时重新计算，不在每次应用时计算。
     */
    radius(radius: number | ((node: NodeDatum) => number)): this;
    /**
     * 设置碰撞强度，范围 [0, 1]。默认 1。
     * 较高的值更刚性地解决重叠，但可能导致抖动。
     */
    strength(strength: number): this;
    /**
     * 设置每次应用的迭代次数。默认 1。
     * 增加迭代次数可提高碰撞检测精度，但增加运行时成本。
     */
    iterations(iterations: number): this;
  }

  export function forceManyBody<NodeDatum = unknown>(): ForceManyBody<NodeDatum>;
  export interface ForceManyBody<NodeDatum> {
    strength(strength: number | ((node: NodeDatum) => number)): this;
    theta(theta: number): this;
    distanceMin(distance: number): this;
    distanceMax(distance: number): this;
  }

  export function forceLink<NodeDatum = unknown, LinkDatum = unknown>(): ForceLink<NodeDatum, LinkDatum>;
  export interface ForceLink<NodeDatum, LinkDatum> {
    id(id: (node: NodeDatum) => string): this;
    distance(distance: number | ((link: LinkDatum) => number)): this;
    strength(strength: number | ((link: LinkDatum) => number)): this;
    iterations(iterations: number): this;
  }

  export function forceCenter<NodeDatum = unknown>(): ForceCenter<NodeDatum>;
  export interface ForceCenter<NodeDatum> {
    x(x: number): this;
    y(y: number): this;
    z(z: number): this;
    strength(strength: number): this;
  }
}
