# 审核页 / LLM 新领域建议 / 领域管理 考古与方案设计

| 项目 | 内容 |
| --- | --- |
| 任务令牌 | TKN-REVIEW-DOMAIN-ARCH-001 |
| 执行 Agent | 主 Agent（GLM-5.2） |
| 日期 | 2026-08-02 |
| 上游报告 | `docs/reports/2026-08-02-karpathy-implementation-analysis.md` |
| 引用规约 | 全文使用相对路径引用代码（ADR-010，禁止 `file:///` 绝对路径） |
| 证据方法 | 静态源码考古 + 联网案例研究 + 推理综合 |

---

## 0. 执行摘要

用户在手动测试中报告三个相互关联的功能缺陷：

1. **审核页只是摆设**：`App.tsx:133` 仅挂载 `<ExperienceInbox />`，未展示 staging 页面审核队列。
2. **LLM 无法建议新领域**：`classify_domain` 的 prompt（`lib.rs:1535`）用「仅当确实没有合适领域时」过严措辞抑制了新领域提议；`Domain` 类型为固定枚举（`types/index.ts:9-17`），即便 LLM 提议新领域也会因 `as Domain` 强转 + `DOMAIN_LABELS` 缺键导致下游 UI 失真。
3. **缺新增/删除领域功能**：后端仅有 `create_domain_directory`（`lib.rs:1625`）与 `move_page_domain`（`lib.rs:1685`），**完全缺失 `delete_domain_directory`**；前端无任何领域管理 UI 入口（`SettingsPanel.tsx`、`CategoryTree.tsx` 均无相关按钮）。

本报告基于源码考古与联网案例研究（TnT-LLM、TaxoAdapt、shadcn Reviews Moderation Queue、Tauri fs scope、trash crate 等），给出三个问题的根因诊断与可落地方案。

---

## 1. 问题 1：审核页只是摆设

### 1.1 现象

用户进入「审核」视图后只看到经验卡片列表（且多为空，因为大多数经验卡 confidence ≥ 0.8 已被 Tier 1 自动 promote），看不到最近上传的、待确认/拒绝的 staging 文档。

### 1.2 源码考古

| 位置 | 现状 | 问题 |
| --- | --- | --- |
| `frontend/src/App.tsx:133` | `{view === "review" && <ExperienceInbox />}` | 单一组件，无 Tabs 切分 |
| `frontend/src/components/ExperienceInbox.tsx:49-101` | `refresh()` 仅调用 `callMcpTool("kb_list_inbox", {})` | 从未调用 `listStaging` IPC |
| `frontend/src/lib/ipc.ts:94-107` | `listStaging(domain?)` IPC 包装已实现 | **IPC 已就绪但无组件消费** |
| `frontend/src/lib/ipc.ts:110-125` | `confirmStaging(pagePath)` / `rejectStaging(pagePath)` 已实现 | **同样无组件消费** |
| `server/src/tools/staging.ts:67-155` | `kbListStaging` 工具实现完整，返回 `StagingPage[]` | 后端能力齐全 |
| `frontend/src/components/FileList.tsx` | 上传页展示 staging 文件卡片，但**不提供 confirm/reject 按钮** | 仅做展示，不做审核动作 |

### 1.3 根因诊断

1. **路由层缺 Tabs**：`App.tsx` 把「审核」视图与「经验卡 inbox」组件 1:1 绑定，没有给 staging 审核留入口。
2. **IPC 与组件脱节**：`listStaging` / `confirmStaging` / `rejectStaging` 三个 IPC 自 P4b 阶段就已实现，但从未被任何 React 组件调用——属于「后端就绪、前端断链」。
3. **`FileList` 角色错位**：`FileList` 位于「上传」视图，定位是「上传后即时反馈」，而非「审核工作台」。用户即便在那里看到 staging 文件也没有审核动作按钮。

### 1.4 方案

参考 shadcn Reviews Moderation Queue 与 `@bernierllc/workflow-ui` 的 `ApprovalQueue` 模式（见 §3.1 案例）：

- 在 `App.tsx` 的 `review` 视图引入一个轻量 Tabs（不引入 shadcn 依赖，用原生 button + state 实现以保持现有 styling 一致）：
  - **Tab 1 经验卡片**：`<ExperienceInbox />`（保持现状）
  - **Tab 2 待审核文档**：新增 `<StagingReview />` 组件
- `<StagingReview />` 内部：
  - 调用 `listStaging()` 拉取所有 staging 页
  - 左栏列表（标题 / 领域 / 上传日期 / 摘要前 80 字）
  - 右栏详情（完整 markdown preview，复用现有 markdown 渲染逻辑或 `<MarkdownPreview>` 子集）
  - 底部「确认入 wiki」「驳回」按钮 → 调用 `confirmStaging` / `rejectStaging`
  - 操作完成后调用 `useGraphStore.invalidate()` 刷新图谱缓存（呼应 project_memory「Cache invalidation must be triggered by all document lifecycle events」）
- Tab 标题内嵌 Badge 显示队列长度，便于用户判断是否有积压

---

## 2. 问题 2：LLM 无法建议新领域

### 2.1 现象

用户上传「2025 数学建模国赛三天速成指南」「2025年MathorCup大数据竞赛赛道B」等数学建模相关文档时，LLM 始终把它们归入 `academic` 或 `coding` 等已有领域，从未提议创建 `math-modeling` 这类新分类；用户也没有任何手动入口去新建/删除领域。

### 2.2 源码考古

| 位置 | 现状 | 问题 |
| --- | --- | --- |
| `frontend/src-tauri/src/lib.rs:1522-1539` | system_prompt 已含 `new_domain_proposal` 字段说明 | prompt 措辞「仅当确实没有合适领域时」过严 |
| `frontend/src-tauri/src/lib.rs:1535` | `"仅当确实没有合适领域时，将 domain 设为空字符串 \"\"..."` | LLM 倾向于「找到某个勉强匹配的领域」而非提议新领域 |
| `frontend/src-tauri/src/lib.rs:1598-1607` | 兜底逻辑：若 LLM 返回的 domain 不在列表且无 proposal → 取 `existing_domains.first()` | **静默吞掉 LLM 的新领域意图**，强制归入第一个已有领域 |
| `frontend/src/types/index.ts:9-17` | `Domain` 是 8 个固定字符串字面量联合类型 | 新领域名无法通过 `as Domain` 类型断言；`DOMAIN_LABELS[domain]` 会得到 `undefined` |
| `frontend/src/types/index.ts:35-56` | `DOMAIN_COLORS` / `DOMAIN_LABELS` 是 `Record<Domain, string>` | 新领域无配色、无中文标签，UI 渲染会显示 `undefined` 或灰色 |
| `frontend/src/components/DropZone.tsx:270-292` | `handleCreateNewDomain` 已实现，调用 `createDomain` IPC | 流程链路完整，但因 LLM 不提议 + 类型阻拦，路径走不通 |
| `frontend/src/components/DropZone.tsx:662-678` | UI 已渲染「建议新建分类」卡片 | 证明 UI 层已就绪，缺的是上游 LLM 真的返回 proposal |

### 2.3 根因诊断

1. **Prompt 设计抑制新领域**：当前措辞「仅当确实没有合适领域时」对 LLM 是高门槛触发条件。8 个固定领域覆盖面广（`coding`/`academic`/`reading`/`life` 几乎能兜住任何文档），LLM 倾向于「找到勉强匹配」而非「承认无匹配」。
2. **兜底逻辑吞提议**：`lib.rs:1598-1607` 当 LLM 返回的 domain 不在 `existing_domains` 列表时，**若没有 proposal，直接取 `existing_domains.first()`**——这一兜底虽然防止了无效 domain 名，但隐含假设「LLM 不会瞎给 domain 名」，掩盖了「LLM 想提议新领域但格式没对齐」的真实意图。
3. **类型系统硬约束**：`Domain` 是字面量联合类型，`DOMAIN_LABELS` / `DOMAIN_COLORS` 是 `Record<Domain, string>`（不是 `Record<string, string>`）。即便 LLM 提议了 `math-modeling`，下游所有 `domain as Domain` 强转在运行时虽不报错，但 `DOMAIN_LABELS[domain]` 返回 `undefined`，UI 显示空白或 `undefined`，给用户「功能坏掉」的错觉。

### 2.4 方案

借鉴 TnT-LLM 两阶段 + TaxoAdapt 密度信号 + Obsidian Auto Tags 上下文感知（见 §3.2 案例）：

#### 2.4.1 Prompt 改造（`lib.rs:1522-1539`）

把「仅当确实没有合适领域时」改为**两段式评分**：

- 让 LLM 先给 top-1 已有领域打分（`matched_confidence`）
- 若 `matched_confidence < 0.6`，**强制要求**输出 `new_domain_proposal`
- 若 `matched_confidence ≥ 0.6`，`new_domain_proposal` 为 `null`

新增少样本示例（few-shot），给 2 个正例（建议新 domain）+ 1 个反例（匹配到现有 domain），让 LLM 学会区分。

#### 2.4.2 兜底逻辑修正（`lib.rs:1598-1607`）

- 若 LLM 返回的 domain 非空但不在 `existing_domains`：
  - **不再**静默取 `first()`，而是把 `domain` 置空 + 把 LLM 给出的「无效 domain 名」转化为 `new_domain_proposal.name`（若 LLM 没给 proposal，构造一个 `name=<llm-domain>, description="由 LLM 提议"` 的 proposal）
  - 这样用户的「新建并移入」按钮始终可用
- 若 LLM 返回空 domain 且无 proposal（极少见）：返回错误，让前端显示「LLM 分类失败，请手动选择」，不再静默兜底

#### 2.4.3 类型系统放宽（`frontend/src/types/index.ts`）

把 `Domain` 从字面量联合类型改为 `string`：

```typescript
export type Domain = string;  // 动态领域，kebab-case 校验由后端负责
```

保留 `DOMAIN_LABELS` / `DOMAIN_COLORS` 作为「已知领域的默认配色/标签」字典，但类型改为 `Record<string, string>`，并在所有消费点加 fallback：

```typescript
function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain;  // 未知领域回退为原名称
}
function domainColor(domain: string): string {
  return DOMAIN_COLORS[domain] ?? "#6b7280";  // 未知领域回退为灰色
}
```

（注：`DropZone.tsx:55-62` 已经实现了这两个 fallback 函数，但其他组件如 `CategoryTree`、`FileList`、`GraphView` 可能未做 fallback——需要全量审计。）

#### 2.4.4 已知领域列表动态化

`kb_list_categories` 已能返回真实领域列表（`server/src/tools/index.ts:45-80`），`triggerClassify` 在 `DropZone.tsx:117-122` 已正确消费。问题在于 LLM 拿到 8 个固定领域后几乎总能找到匹配。改造后 prompt 会显式要求 LLM 评估「top-1 置信度 < 0.6 时必须提议新领域」，把决策权交还 LLM 智能而非领域列表覆盖度。

---

## 3. 问题 3：缺新增/删除领域功能

### 3.1 现象

后端有 `create_domain_directory`，但前端无入口；`delete_domain_directory` 完全缺失。用户无法在 GUI 内管理领域生命周期。

### 3.2 源码考古

| 位置 | 现状 | 问题 |
| --- | --- | --- |
| `frontend/src-tauri/src/lib.rs:1625-1672` | `create_domain_directory(name, description)` 已实现 | 后端就绪 |
| `frontend/src-tauri/src/lib.rs` | **无 `delete_domain_directory` 命令** | 完全缺失 |
| `frontend/src/lib/ipc.ts:182-196` | `createDomain(name, description)` 已实现 | 就绪 |
| `frontend/src/lib/ipc.ts` | **无 `deleteDomain` IPC 包装** | 完全缺失 |
| `frontend/src/components/SettingsPanel.tsx:377-387` | LLM 设置区无领域管理 | 无入口 |
| `frontend/src/components/CategoryTree.tsx:145-168` | 领域切换 + 视图切换，无右键/管理按钮 | 无入口 |
| `frontend/src/components/DropZone.tsx:270-292` | `handleCreateNewDomain` 是唯一调用 `createDomain` 的地方 | 只在上传流程中触发，无独立管理面板 |

### 3.3 根因诊断

1. **后端 CRUD 残缺**：只有 Create + Read（隐含，通过 `kb_list_categories`），缺 Delete + Update（重命名）。
2. **前端无管理面板**：`create_domain_directory` 仅在 DropZone 的 LLM 分类建议流程中被调用，用户无法主动新建领域（必须等 LLM 提议）；删除则完全无处可点。
3. **`index.md` 同步隐患**：`create_domain_directory` 已实现「追加领域分组到 index.md」（`lib.rs:1644-1664`），但若实现 `delete_domain_directory`，必须同步移除 index.md 中的领域分组 heading 及其下页面条目，否则 `kb_lint` 会报「孤儿页」「过时声明」。

### 3.4 方案

参考 Tauri fs scope + canonicalize + trash crate + kebab-case 正则（见 §3.3 案例）：

#### 3.4.1 后端新增 `delete_domain_directory`（`lib.rs`）

```rust
/// P6-R5: 删除领域目录（用户二次确认后调用）。
///
/// 安全约束（四层防护）：
/// 1. 域名经 is_valid_domain 校验（kebab-case）
/// 2. 路径经 validate_inside 校验（防路径遍历）
/// 3. 拒绝删除受保护目录：raw/、.git、wiki 本身、wiki/kb-system（系统领域）
/// 4. 拒绝删除非空目录（除非 force=true 且用户二次确认）
///
/// 同步操作：
/// - 移除 index.md 中该领域的分组 heading 及其下所有页面条目
/// - 不自动修改 AGENTS.md（schema 文件由用户手动更新，前端提示）
///
/// @param name - kebab-case 分类名
/// @param force - 是否强制删除非空目录（需用户在前端二次确认）
/// @returns 被删除的页面数量
#[tauri::command]
fn delete_domain_directory(
    name: String,
    force: bool,
    config: State<'_, KbConfig>,
) -> Result<usize, String> {
    // 校验
    if !is_valid_domain(&name) { return Err(...); }
    let protected = ["raw", ".git", "kb-system"];
    if protected.contains(&name.as_str()) {
        return Err(format!("受保护领域「{}」不可删除", name));
    }
    let dir = wiki_dir(&config.kb_root, &name);
    if !dir.exists() {
        return Err(format!("领域「{}」不存在", name));
    }

    // 统计页面数
    let page_count = count_markdown_files(&dir)?;

    // 非空目录需 force=true
    if page_count > 0 && !force {
        return Err(format!(
            "领域「{}」非空（{} 个页面），需在前端勾选「强制删除」",
            name, page_count
        ));
    }

    // 删除目录（递归）
    fs::remove_dir_all(&dir).map_err(|e| format!("failed to remove dir: {}", e))?;

    // 同步移除 index.md 中的领域分组
    remove_domain_from_index(&config.kb_root, &name)?;

    Ok(page_count)
}
```

> **注**：考虑过用 `trash::delete` 移到回收站而非永久删除，但本项目依赖 `Cargo.toml` 现有依赖最小化，且用户已通过 git 作为存储层有版本历史可恢复。MVP 阶段先用 `fs::remove_dir_all`，若后续用户反馈需要回收站，再加 `trash` crate（见 §6 后续演进）。

#### 3.4.2 后端新增 `list_domains`（`lib.rs`）

返回所有领域目录 + 页面数 + 经验卡数，供前端管理面板展示：

```rust
#[tauri::command]
fn list_domains(config: State<'_, KbConfig>) -> Result<Vec<DomainInfo>, String> {
    let wiki = Path::new(&config.kb_root).join("wiki");
    let mut domains = Vec::new();
    for entry in fs::read_dir(&wiki).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            let name = entry.file_name().to_string_lossy().to_string();
            let page_count = count_markdown_files(&entry.path())?;
            let experience_count = count_markdown_files(
                &entry.path().join("experiences")
            ).unwrap_or(0);
            domains.push(DomainInfo { name, page_count, experience_count });
        }
    }
    Ok(domains)
}
```

#### 3.4.3 前端新增 IPC 包装（`ipc.ts`）

```typescript
export interface DomainInfo {
  name: string;
  page_count: number;
  experience_count: number;
}

export async function deleteDomain(name: string, force: boolean): Promise<number> { ... }
export async function listDomains(): Promise<DomainInfo[]> { ... }
```

#### 3.4.4 前端新增 `<DomainManager />` 组件

放在 `SettingsPanel` 内新增「领域管理」分区（与「LLM 设置」并列）：

- 表格列：领域名 / 中文名（`DOMAIN_LABELS[name] ?? name`）/ 页面数 / 经验卡数 / 操作
- 操作按钮：「新建领域」（弹窗输入 name + description → `createDomain`）、「删除」（二次确认 → `deleteDomain(name, force=pageCount===0)`）
- 删除前提示：「将删除 N 个页面 + 同步移除 index.md 分组，此操作不可恢复（但 git 可回滚）」
- 删除后调用 `useGraphStore.invalidate()` 刷新缓存

#### 3.4.5 CategoryTree 添加「管理」入口

在 `CategoryTree.tsx` 顶部添加一个齿轮图标按钮，点击后跳转到 SettingsPanel 的「领域管理」分区。这样用户在左侧领域树旁就能快速进入管理面板。

---

## 3. 联网案例研究

### 3.1 React 审核队列 UI（主题 2）

| 案例 | URL | 借鉴点 |
| --- | --- | --- |
| shadcn Reviews Moderation Queue | https://www.shadcn.io/blocks/reviews-moderation-queue | approve/reject/escalate 三动作 + severity 左边框 + motion/react 退出动画 |
| @bernierllc/workflow-ui | https://www.npmjs.com/package/@bernierllc/workflow-ui | `useApprovalQueue` hook 暴露 `selectedIds/bulkApprove/bulkReject/toggleSelection` |
| shadcn Tabs 12 Patterns | https://www.shadcndeck.com/blog/shadcn-tabs-component | Badge 计数 + controlled state + 键盘导航 |
| useTransition Hook | https://reactdevelopers.org/docs/react-hooks/use-transition/ | Tab 切换 + 列表过滤非阻塞更新 |

**对本项目落地**：因项目 styling 是手写 Tailwind + CSS 变量（非 shadcn 体系），不引入新依赖，用原生 `<button>` + `useState` 实现轻量 Tabs。批量审核留待 P7，MVP 先做单条审核。

### 3.2 LLM 动态分类（主题 1）

| 案例 | URL | 借鉴点 |
| --- | --- | --- |
| TaxoAdapt | https://arxiv.org/html/2506.10737v1 | 节点密度信号触发深度/宽度扩展 |
| TnT-LLM | https://arxiv.org/pdf/2403.12173 | 两阶段（taxonomy generation + classification）+ update prompt 三步走 |
| Obsidian Auto Tags | https://community.obsidian.md/plugins/auto-tags | 上下文感知：现有标签作为 prompt 上下文 + 数量限制 |
| Iterative Contrastive Refinement | https://arxiv.org/html/2508.00957v1 | 零样本 + 人类在环引入新类别 |

**对本项目落地**：MVP 不做完整的 TaxoAdapt 密度信号（需 embedding），仅借鉴 TnT-LLM 的「update prompt」思路——让 LLM 显式评估 top-1 置信度，低于阈值强制提议新领域。这与 AGENTS.md §7.4 的两 tier 门禁（confidence ≥ 0.8 自动提升）天然对齐：新领域提议本身也可走类似门禁。

### 3.3 Tauri 目录管理安全（主题 3）

| 案例 | URL | 借鉴点 |
| --- | --- | --- |
| Tauri File System Plugin | https://tauri.app/es/plugin/file-system/ | `remove()` + `recursive: true` + scope 配置 |
| strict-path crate | https://crates.io/crates/strict-path/0.2.3 | 防御 19+ CVE（TOCTOU、Windows 8.3、NTFS ADS、Unicode 欺骗） |
| trash crate | https://lib.rs/crates/trash | 跨平台回收站，月下载 20 万+ |
| heck crate | http://raw.githubusercontent.com/mozilla-firefox/firefox/main/third_party/rust/heck/src/kebab.rs | kebab-case 转换事实标准 |

**对本项目落地**：

- 路径校验复用现有 `validate_inside` + `is_valid_domain`（`lib.rs` 已实现）
- 受保护领域白名单：`raw`、`.git`、`kb-system`（系统元知识不可删）
- MVP 用 `fs::remove_dir_all`，后续可加 `trash` crate 实现回收站（见 §6）
- `index.md` 同步：新增 `remove_domain_from_index` 辅助函数，删除 heading + 其下条目直到下一个 `##` heading

---

## 4. 影响自检（CLAUDE.md §9）

### 4.1 接口/契约变更

| 变更 | 影响范围 | 应对 |
| --- | --- | --- |
| `Domain` 类型从联合字面量改为 `string` | 全前端 | 全量审计 `DOMAIN_LABELS[domain]` / `DOMAIN_COLORS[domain]` 消费点，加 fallback |
| 新增 `delete_domain_directory` Tauri command | Rust 后端 + capabilities | 在 `tauri.conf.json` capabilities 注册新命令 |
| 新增 `list_domains` Tauri command | Rust 后端 | 同上 |
| 新增 `<StagingReview />` 组件 | App.tsx 路由 | 新增组件，不改现有 `ExperienceInbox` |
| 新增 `<DomainManager />` 组件 | SettingsPanel | 新增分区，不改现有 LLM 设置 |

### 4.2 依赖变更

无新增 npm/cargo 依赖。MVP 用 `fs::remove_dir_all` 而非 `trash` crate。

### 4.3 跨模块影响

- `viewStore`：可能需要新增 `reviewTab` state（`"experience" | "staging"`），区分审核视图内的子标签
- `graphStore.invalidate()`：`<StagingReview />` 在 confirm/reject 后必须调用
- `index.md` 同步：`delete_domain_directory` 必须同步移除 index.md 分组，否则 `kb_lint` 报孤儿页

### 4.4 文档同步

- `README.md`：在功能列表追加「领域管理」「staging 审核」
- `log.md`：本次修复完成后追加 `## [2026-08-02] fix | 审核页/LLM新领域/领域管理`
- `docs/ARCH.md` §3.1：Tauri 命令清单追加 `delete_domain_directory` / `list_domains`
- 经验卡片：写入「LLM 分类 prompt 设计：两段式置信度评估」经验卡（confidence 0.85）

---

## 5. 实施计划

| 步骤 | 文件 | 动作 | 预计行数 |
| --- | --- | --- | --- |
| 1 | `frontend/src/types/index.ts` | `Domain` 改为 `string`，`DOMAIN_LABELS`/`DOMAIN_COLORS` 改为 `Record<string, string>` | ~10 |
| 2 | `frontend/src-tauri/src/lib.rs` | 新增 `delete_domain_directory` + `list_domains` + `remove_domain_from_index` + `count_markdown_files` 辅助函数；修正 `classify_domain` prompt 与兜底逻辑 | ~120 |
| 3 | `frontend/src/lib/ipc.ts` | 新增 `deleteDomain` / `listDomains` IPC 包装 + `DomainInfo` 类型 | ~40 |
| 4 | `frontend/src/components/StagingReview.tsx` | 新建组件：Tabs 左栏列表 + 右栏详情 + confirm/reject 按钮 | ~250 |
| 5 | `frontend/src/components/DomainManager.tsx` | 新建组件：表格 + 新建弹窗 + 删除二次确认 | ~200 |
| 6 | `frontend/src/App.tsx` | review 视图改为 Tabs（经验卡片 / 待审核文档） | ~30 |
| 7 | `frontend/src/components/SettingsPanel.tsx` | 新增「领域管理」分区挂载 `<DomainManager />` | ~20 |
| 8 | `frontend/src/components/CategoryTree.tsx` | 顶部添加齿轮按钮跳转设置面板 | ~15 |
| 9 | `frontend/src/data/mockData.ts` | 补充 staging mock 数据（dev 模式回退） | ~30 |
| 10 | 测试 | server 单元测试（`delete_domain` 安全测试）+ frontend 单元测试（`DomainManager` 渲染） | ~150 |
| 11 | guardrail-enforcer | 安全审计（重点：路径遍历、XSS、命令注入） | - |
| 12 | ac-verifier | 验收测试（6 个 Playwright 场景：staging 审核 / 新领域建议 / 领域 CRUD） | - |

---

## 6. 后续演进（非本轮范围）

| 演进项 | 触发条件 | 方案 |
| --- | --- | --- |
| 回收站（trash crate） | 用户反馈误删领域需恢复 | `Cargo.toml` 加 `trash = "5"`，`delete_domain_directory` 改用 `trash::delete` |
| 领域重命名 | 用户频繁要求改领域名 | 新增 `rename_domain(old, new)` command，同步更新所有 frontmatter + index.md |
| TaxoAdapt 密度信号 | wiki 页数 > 200 | 接入 embedding，按节点密度自动建议新领域 |
| 批量审核 | staging 队列长期积压 | 参考 `@bernierllc/workflow-ui` 的 `useApprovalQueue` hook |
| LLM 整理生成 staging 内容 | Karpathy 原方案 #56 | 在 `<StagingReview />` 详情区加「LLM 整理」按钮，调用 LLM 重写 markdown |

---

## 7. 验收标准（供 ac-verifier）

| AC ID | 描述 |
| --- | --- |
| AC-REV-1 | 进入「审核」视图后看到两个 Tab：「经验卡片」与「待审核文档」 |
| AC-REV-2 | 「待审核文档」Tab 显示所有 staging 页面，每条含标题/领域/日期/摘要 |
| AC-REV-3 | 点击 staging 条目后右栏显示完整 markdown preview |
| AC-REV-4 | 点击「确认入 wiki」后 staging 页面从列表消失，graph 缓存刷新 |
| AC-REV-5 | 点击「驳回」后 staging 页面状态变为 rejected，列表刷新 |
| AC-LLM-1 | 上传与所有已有领域语义距离都大的文档时，LLM 返回 `new_domain_proposal` 非空 |
| AC-LLM-2 | `new_domain_proposal.name` 为 kebab-case，UI 显示「建议新建分类」卡片 |
| AC-LLM-3 | 点击「创建并移入」后新领域目录创建 + 文档移入 + index.md 追加分组 |
| AC-LLM-4 | `Domain` 类型为 `string`，未知领域在 UI 显示原名称（非 `undefined`） |
| AC-DOM-1 | 设置面板有「领域管理」分区，显示所有领域表格 |
| AC-DOM-2 | 点击「新建领域」弹窗输入 name + description，提交后目录创建 + index.md 更新 |
| AC-DOM-3 | 点击「删除」二次确认后领域目录删除 + index.md 移除分组 |
| AC-DOM-4 | 删除受保护领域（`raw`/`.git`/`kb-system`）返回明确错误 |
| AC-DOM-5 | 删除非空领域未勾选「强制删除」时返回明确错误 |
| AC-SEC-1 | `delete_domain_directory` 拒绝路径遍历攻击（`../`、Unicode 分隔符、Windows 8.3） |
| AC-SEC-2 | `delete_domain_directory` 拒绝删除 `raw/` 目录 |
| AC-TEST-1 | server 单元测试全部通过（含新增 `delete_domain` 安全测试） |
| AC-TEST-2 | frontend 单元测试全部通过（含新增 `DomainManager` / `StagingReview` 渲染测试） |
| AC-TEST-3 | TypeScript 类型检查零错误 |
| AC-TEST-4 | 6 个 Playwright 场景通过 |

---

**报告结束。**
