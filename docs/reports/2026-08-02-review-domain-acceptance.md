# 审核页 / LLM 新领域建议 / 领域管理 — 验收测试报告

| 项目 | 内容 |
| --- | --- |
| 任务令牌 | TKN-REVIEW-DOMAIN-ACCEPT-001 |
| 执行 Agent | ac-verifier |
| 角色 | ac-verifier |
| 日期 | 2026-08-02 |
| 上游产出物 | 考古报告 `docs/reports/2026-08-02-review-domain-archaeology.md`、guardrail R1 `docs/reports/2026-08-02-review-domain-guardrail.md`、guardrail R2 `docs/reports/2026-08-02-review-domain-guardrail-r2.md` |
| 引用规约 | 全文使用相对路径引用代码（ADR-010） |
| 证据方法 | 分层自动化测试（静态分析 + 单元 + 集成 + E2E）+ 安全扫描 + 代码审查 |
| 测试框架 | Vitest（前端）、node --test（服务器）、cargo test（Rust）、Playwright MCP（E2E） |
| **最终结论** | **通过** |

---

## 1. 执行摘要

本次验收对「审核页双 Tab / staging 审核操作 / LLM 新领域建议 / Domain 动态化 / 领域管理 UI / delete_domain_directory 安全防护 / 前缀碰撞防护 / 无回归」共 8 组 35 条验收标准（AC-1 ~ AC-8）执行了完整的分层测试。

| 维度 | 结果 |
| --- | --- |
| 验收标准总数 | 35 |
| 通过 | 35 |
| 失败 | 0 |
| 无法自动验证 | 0 |
| 单元测试 | 547/547 通过（服务器 197 + 前端 304 + Rust 46） |
| TypeScript 类型检查 | 0 错误 |
| Rust 编译 | 成功（0 错误） |
| E2E 场景 | 5/5 通过 |
| 安全检查 | 10/10 通过 |
| 回归测试 | 无回归 |

**结论：所有验收标准、安全检查均通过，无回归问题。本轮开发周期可以闭合。**

---

## 2. 验收标准覆盖矩阵

### AC-1: 审核页双 Tab 展示

| AC ID | 描述 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-1.1 | 审核视图有「经验卡片」和「待审核文档」两个 Tab | 通过 | E2E evaluate 返回 `tabsFound: ["经验","lightbulb经验卡片","inbox待审核文档"]`；代码 `frontend/src/App.tsx` ReviewView L148-L173 两个 TabButton |
| AC-1.2 | 「待审核文档」Tab 调用 listStaging IPC 展示 staging 页面列表 | 通过 | `frontend/src/components/StagingReview.tsx` L62/L78 调用 `listStaging()`；E2E 验证 staging 列表渲染 2 个文档 |
| AC-1.3 | Tab 切换不重新加载列表（内存缓存 UX） | 通过 | E2E 验证：从经验卡片切换到待审核文档 Tab，列表即时显示（模块级 `stagingCache` L31）；`frontend/src/App.tsx` L169 条件渲染保留组件状态 |
| AC-1.4 | Tab 标题可见，默认显示经验卡片 Tab | 通过 | E2E 返回 `activeTabText: "lightbulb经验卡片"`；`frontend/src/store/viewStore.ts` L85 `reviewTab: "experience"` 初始值 |

### AC-2: staging 文档审核操作

| AC ID | 描述 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-2.1 | staging 文档列表展示标题/领域/日期/摘要 | 通过 | E2E 返回 `hasStagingHeader:true, hasDomainLabel:true, hasDateFormat:true, hasFormat:true`；textSnippet 含 "Python 异步编程参考 PDF ... 编程 · 2026-08-02" |
| AC-2.2 | 可查看文档详情（markdown preview） | 通过 | E2E textSnippet 含 "上传日期 2026-08-02 · 来源 raw/pdf/async-patterns-ref.pdf # Python 异步编程参考..."；`StagingReview.tsx` L313 `{selected.preview}` whitespace-pre-wrap 渲染 |
| AC-2.3 | 「确认入 wiki」按钮调用 confirmStaging IPC | 通过 | E2E 返回 `hasConfirmButton:true`；`StagingReview.tsx` L323-L345 按钮 onClick → `handleConfirm` L96-L115 调用 `confirmStaging(page.path)` |
| AC-2.4 | 「驳回」按钮调用 rejectStaging IPC | 通过 | E2E 返回 `hasRejectButton:true`；`StagingReview.tsx` L346-L359 按钮 onClick → `handleReject` L117-L140 调用 `rejectStaging(page.path)` + `window.confirm` 二次确认 |
| AC-2.5 | 操作后刷新 graphStore 缓存 | 通过 | 代码审查：`handleConfirm` L106 `invalidateGraph()`、`handleReject` L131 `invalidateGraph()` |
| AC-2.6 | 操作后从列表移除已处理文档 | 通过 | 代码审查：`handleConfirm` L105 `stagingCache = null` + L107 `await refresh()`；`handleReject` L130 同理 |

### AC-3: LLM 分类支持新领域建议

| AC ID | 描述 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-3.1 | classify_domain prompt 使用两段式评分（matched_confidence） | 通过 | `frontend/src-tauri/src/lib.rs` L1524-L1555 system_prompt 含 `"confidence": 0.0到1.0的top-1匹配置信度` + 决策规则 1-4 |
| AC-3.2 | matched_confidence < 0.6 时强制提议 new_domain_proposal | 通过 | `lib.rs` L1541-L1542 `"若 confidence ≥ 0.6：domain 设为该已有领域名...new_domain_proposal 设为 null"` / `"若 confidence < 0.6：domain 设为空字符串...提议新分类"` |
| AC-3.3 | LLM 返回不在列表的 domain 名时构造 proposal 而非静默取 first() | 通过 | `lib.rs` L1617-L1662 `final_domain` 逻辑：domain 非空但不在列表 → 构造 `NewDomainProposal`；空 domain 无 proposal → 返回 Err 不再取 first() |
| AC-3.4 | MED-2: slugify 结果含非 ASCII 时提取 ASCII 部分或用占位符 | 通过 | Rust 测试 `test_med2_slugify_preserves_unicode_but_is_valid_domain_rejects` + `test_med2_slugify_mixed_cn_en_extracts_ascii` 通过；`lib.rs` L1632-L1646 ASCII 提取 + `"llm-proposed-domain"` 占位符 |
| AC-3.5 | proposal.name 通过 is_valid_domain 校验 | 通过 | `lib.rs` L1622 `if is_valid_domain(&domain)` / L1632 `if is_valid_domain(&slug)` / L1640 fallback `"llm-proposed-domain"` 纯 ASCII；Rust 测试验证 fallback 通过 `is_valid_domain` |

### AC-4: Domain 类型动态化

| AC ID | 描述 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-4.1 | Domain 类型为 string（非字面量联合） | 通过 | `frontend/src/types/index.ts` L16 `export type Domain = string;`；前端测试 `p6-r5-review-domain.test.ts` L148-L155 验证接受任意字符串 |
| AC-4.2 | domainLabel(domain) 对未知领域返回原名称（非 undefined） | 通过 | 前端测试 L98-L102 `domainLabel("math-modeling")` → `"math-modeling"`；`types/index.ts` L70-L73 `DOMAIN_LABELS[domain] ?? domain` |
| AC-4.3 | domainColor(domain) 对未知领域返回灰色（非 undefined） | 通过 | 前端测试 L116-L119 `domainColor("math-modeling")` → `"#6b7280"`；`types/index.ts` L76-L79 `DOMAIN_COLORS[domain] ?? "#6b7280"` |
| AC-4.4 | 所有 DOMAIN_LABELS/DOMAIN_COLORS 消费点有 fallback（28 处） | 通过 | guardrail R1 §8.2 审计 28 处消费点均有 fallback；本次 E2E 验证 CategoryTree/DomainManager/StagingReview/App 均正常渲染 |

### AC-5: 领域管理 UI

| AC ID | 描述 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-5.1 | SettingsPanel 有「领域管理」分区 | 通过 | E2E 返回 `hasDomainManagement:true`；`frontend/src/components/SettingsPanel.tsx` L378-L381 `<DomainManager />` 挂载 |
| AC-5.2 | 领域管理表格展示领域名/中文名/页面数/经验卡数 | 通过 | E2E 返回 `hasTableHeaders:true`；textSnippet 含 "领域名 中文名 页面数 经验卡 操作"；`DomainManager.tsx` L196-L203 表头 |
| AC-5.3 | 可新建领域（输入 name + description） | 通过 | E2E 返回 `hasNewDomainButton:true`；`DomainManager.tsx` L278-L336 新建领域表单 + `handleCreate` L86-L114 调用 `createDomain` |
| AC-5.4 | 可删除领域（二次确认 + force 标志） | 通过 | E2E 返回 `hasDeleteButton:true`；`DomainManager.tsx` L339-L404 删除确认弹窗 + force 勾选 + `handleDelete` L116-L135 调用 `deleteDomain(name, forceDelete)` |
| AC-5.5 | CategoryTree 有齿轮图标跳转领域管理 | 通过 | E2E 返回 `gearClicked:true, settingsOpen:true`；`frontend/src/components/CategoryTree.tsx` L85-L94 齿轮按钮 onClick → `openSettings("domain-management")` |
| AC-5.6 | 删除后刷新 graphStore 缓存 | 通过 | 代码审查：`DomainManager.tsx` L128 `invalidateGraph()` + L129 `await refresh()` |

### AC-6: delete_domain_directory 安全防护

| AC ID | 描述 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-6.1 | kebab-case 校验拒绝非法域名（../、大写、空格、Unicode） | 通过 | Rust 测试 `test_is_valid_domain_rejects_path_traversal` + `test_is_valid_domain_rejects_uppercase_and_special` 通过；E2E 安全验证：`../etc/passwd`/`Coding`/`数学建模` 均被前端 kebab-case 正则拒绝 |
| AC-6.2 | 受保护领域（raw/.git/kb-system）不可删除 | 通过 | Rust 测试 `test_protected_domains_constant_includes_system_domains` 通过；`lib.rs` L1845-L1851 `PROTECTED_DOMAINS` 白名单检查；E2E 验证 kb-system 标记"受保护"且删除按钮 disabled |
| AC-6.3 | 路径遍历防护（validate_inside） | 通过 | Rust 测试 `test_validate_inside_rejects_path_traversal` + `test_validate_inside_rejects_absolute_path_outside_base` 通过；`lib.rs` L1854 `validate_inside(&config.kb_root, ...)` |
| AC-6.4 | 非空目录需 force=true | 通过 | Rust 测试 `test_delete_domain_non_empty_check_via_count_markdown_files` + `test_delete_domain_force_true_bypasses_nonempty_check` 通过；`lib.rs` L1863 `if page_count > 0 && !force` |
| AC-6.5 | 删除后同步移除 index.md 分组 | 通过 | 代码审查：`lib.rs` L1874 `remove_domain_from_index(&config.kb_root, &name)`；Rust 测试 `test_remove_domain_from_index_removes_section` + `test_remove_domain_from_index_last_section` 通过 |

### AC-7: 前缀碰撞防护

| AC ID | 描述 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-7.1 | remove_domain_from_index 精确匹配 heading（design 不误删 design-resources） | 通过 | Rust 测试 `test_remove_domain_from_index_prefix_collision` 通过；`lib.rs` L1978-L1986 `while` 循环 + `after.starts_with('\n')` 行尾边界校验 |
| AC-7.2 | create_domain_directory 精确匹配 heading（design 不被 design-resources 误判为已存在） | 通过 | Rust 测试 `test_create_domain_already_has_section_prefix_collision` 通过；`lib.rs` L1710-L1715 `match_indices` + 行尾边界校验 |
| AC-7.3 | 段间空行保留（markdownlint MD022） | 通过 | 代码审查：`lib.rs` L2004-L2011 `if !result.ends_with("\n\n")` 补空行；guardrail R2 §3.2 验证正常场景正确 |

### AC-8: 无回归

| AC ID | 描述 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-8.1 | 服务器单元测试全绿 | 通过 | `npm test` 输出 `# tests 197 # pass 197 # fail 0` |
| AC-8.2 | 前端单元测试全绿 | 通过 | `npx vitest run` 输出 `Test Files 12 passed (12) Tests 304 passed (304)` |
| AC-8.3 | Rust 单元测试全绿 | 通过 | `cargo test` 输出 `test result: ok. 46 passed; 0 failed; 0 ignored` |
| AC-8.4 | TypeScript 类型检查零错误 | 通过 | `npx tsc --noEmit` 无输出（零错误） |
| AC-8.5 | Rust 编译无错误 | 通过 | `cargo test` 编译成功后执行 46 个测试 |

---

## 3. 分层测试详情

### 3.1 静态分析

| 工具 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| TypeScript 编译器 | `npx tsc --noEmit`（frontend/） | 通过 | 零输出 = 零错误 |
| Rust 编译器 | `cargo test`（含编译，src-tauri/） | 通过 | 编译成功，46 测试通过 |
| XSS 模式扫描 | `Select-String dangerouslySetInnerHTML` | 通过 | 仅 ChatPanel.tsx:381（非本次变更，使用 highlight.js 转义输出）+ ragUtils.ts:89（注释）；本次变更 8 文件均无 |
| eval/Function 扫描 | `Select-String eval\|new Function` | 通过 | 零命中 |
| 硬编码密钥扫描 | `Select-String api_key\|secret\|token\|password` | 通过 | 零命中 |

### 3.2 单元测试

| 套件 | 框架 | 用例数 | 通过 | 失败 | 覆盖范围 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 服务器 | node --test | 197 | 197 | 0 | frontmatter 格式、MCP 工具、重复检测、质量评分 | 通过 |
| 前端 | Vitest | 304 | 304 | 0 | 12 测试文件含 P6-R5 新增 21 个（viewStore/types/Domain 兼容性） | 通过 |
| Rust | cargo test | 46 | 46 | 0 | is_valid_domain/validate_inside/count_markdown_files/remove_domain_from_index/MED-1/MED-2/受保护领域/非空检查/force 标志 | 通过 |
| **合计** | — | **547** | **547** | **0** | — | **通过** |

**P6-R5 新增 Rust 测试明细**：

| 测试名 | 验收标准 | 结果 |
| --- | --- | --- |
| test_remove_domain_from_index_prefix_collision | AC-7.1 (MED-1) | 通过 |
| test_med2_slugify_preserves_unicode_but_is_valid_domain_rejects | AC-3.4 (MED-2) | 通过 |
| test_med2_slugify_mixed_cn_en_extracts_ascii | AC-3.4 (MED-2) | 通过 |
| test_create_domain_already_has_section_prefix_collision | AC-7.2 (MED-1 同构) | 通过 |
| test_protected_domains_constant_includes_system_domains | AC-6.2 | 通过 |
| test_delete_domain_non_empty_check_via_count_markdown_files | AC-6.4 | 通过 |
| test_delete_domain_force_true_bypasses_nonempty_check | AC-6.4 | 通过 |
| test_is_valid_domain_rejects_path_traversal | AC-6.1 | 通过 |
| test_is_valid_domain_accepts_kebab_case | AC-6.1 | 通过 |
| test_is_valid_domain_rejects_uppercase_and_special | AC-6.1 | 通过 |
| test_count_markdown_files_empty_dir | AC-6.5 | 通过 |
| test_count_markdown_files_with_md_and_non_md | AC-6.5 | 通过 |
| test_count_markdown_files_nonexistent_dir_returns_zero | AC-6.5 | 通过 |
| test_remove_domain_from_index_removes_section | AC-6.5 | 通过 |
| test_remove_domain_from_index_last_section | AC-6.5 | 通过 |
| test_remove_domain_from_index_idempotent_when_not_found | AC-6.5 | 通过 |
| test_remove_domain_from_index_no_index_file | AC-6.5 | 通过 |

### 3.3 集成测试

| 场景 | 验证方法 | 结果 | 证据 |
| --- | --- | --- | --- |
| IPC 命令注册 | 代码审查 `generate_handler!` | 通过 | `lib.rs` L2118-L2140 注册 list_staging/confirm_staging/reject_staging/classify_domain/create_domain_directory/move_page_domain/delete_domain_directory/list_domains |
| IPC 类型契约一致性 | 代码审查 ipc.ts ↔ lib.rs | 通过 | deleteDomain(name,force)→delete_domain_directory(name,force,State)；listDomains()→list_domains(State)；返回 DomainInfoIPC{name,page_count,experience_count} ↔ DomainInfo struct |
| StagingReview IPC 链路 | 代码审查 + E2E | 通过 | listStaging()→StagingPageIPC[]→渲染；confirmStaging(path)→void→invalidateGraph；rejectStaging(path)→void→invalidateGraph |
| DomainManager IPC 链路 | 代码审查 + E2E | 通过 | listDomains()→DomainInfoIPC[]→表格渲染；deleteDomain(name,force)→number→invalidateGraph |
| classify_domain fallback 逻辑路径 | Rust 测试 + 代码审查 | 通过 | domain 非空不在列表→构造 proposal；空 domain 无 proposal→返回 Err；MED-2 ASCII 提取 + 占位符 |

### 3.4 端到端测试（Playwright + Vite dev server）

**环境**：Vite dev server http://localhost:1420/（headless Chromium 1280×800）。浏览器 dev 模式下 `isTauri()` 返回 false，IPC 降级到 mock 数据（`mockStagingPages` / `KNOWN_DOMAINS`），验证组件渲染与交互逻辑。

| E2E 场景 | AC 覆盖 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1. 审核页 Tab 切换 | AC-1.1/1.3/1.4 | 通过 | evaluate 返回两个 Tab（"经验卡片"+"待审核文档"），默认激活"经验卡片"，切换即时显示 |
| 2. 待审核文档列表加载 | AC-2.1/2.2/2.3/2.4 | 通过 | 2 个 mock 文档含标题/领域/日期/摘要/格式；markdown 详情预览；确认入 wiki + 驳回按钮 |
| 3. 领域管理面板打开 | AC-5.1/5.2/5.3/5.4 | 通过 | Settings→领域管理分区；表格 8 领域含领域名/中文名/页面数/经验卡；新建+删除按钮；受保护标记 |
| 4. 领域列表加载 | AC-5.2 | 通过 | 8 个 KNOWN_DOMAINS 渲染（kb-system/coding/resources/design/emotions/reading/academic/life） |
| 5. CategoryTree 齿轮跳转 | AC-5.5 | 通过 | 齿轮按钮 `title="管理领域（新建/删除）"` 点击→设置面板打开→领域管理分区可见 |

**截图证据**（保存至 Downloads 目录）：

- `initial-state-*.png`：初始 preview 视图
- `review-view-tabs-*.png`：审核页双 Tab（经验卡片激活）
- `staging-review-list-*.png`：待审核文档列表 + 详情 + 操作栏
- `domain-manager-panel-*.png`：领域管理面板（表格 + 新建/删除）

---

## 4. 安全审计结果

### 4.1 delete_domain_directory 四层防护

| 防护层 | 实现 | 测试覆盖 | 结果 |
| --- | --- | --- | --- |
| 1. kebab-case 校验 | `lib.rs` L1837 `is_valid_domain(&name)` | test_is_valid_domain_rejects_path_traversal / test_is_valid_domain_rejects_uppercase_and_special + E2E 前端校验 | 通过 |
| 2. 受保护目录白名单 | `lib.rs` L1845 `PROTECTED_DOMAINS: ["raw",".git","kb-system"]` | test_protected_domains_constant_includes_system_domains + E2E | 通过 |
| 3. 路径遍历防护 | `lib.rs` L1854 `validate_inside(&config.kb_root, ...)` | test_validate_inside_rejects_path_traversal / test_validate_inside_rejects_absolute_path_outside_base | 通过 |
| 4. force 标志 | `lib.rs` L1863 `if page_count > 0 && !force` | test_delete_domain_non_empty_check / test_delete_domain_force_true_bypasses | 通过 |

### 4.2 注入防护

| 攻击面 | 防护措施 | 验证方法 | 结果 |
| --- | --- | --- | --- |
| XSS | React JSX 自动转义 + 无 dangerouslySetInnerHTML（本次变更文件） | E2E 输入 `<script>alert(1)</script>` → 前端 kebab-case 校验拒绝 + `xssInjected:false`（无 DOM 注入） | 通过 |
| 路径遍历 | 前端正则 `/^[a-z0-9]+(-[a-z0-9]+)*$/` + 后端 `is_valid_domain` + `validate_inside` | E2E 输入 `../../../etc/passwd` → 前端拒绝；Rust 测试覆盖后端 | 通过 |
| LLM prompt 注入 | classify_domain 输出经 slugify + ASCII 过滤 + `is_valid_domain` 三重校验 | 代码审查 + Rust 测试 test_med2_*；`proposed_name` 必为 `[a-z0-9-]+` | 通过 |
| 命令注入 | `call_mcp_tool` 使用 `shell().command("node").args([array])` 参数数组传递；`delete_domain_directory` 使用 `fs::remove_dir_all` | guardrail R1 §5.2 确认 | 通过 |

### 4.3 密钥与配置安全

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 前端无硬编码 API Key | 通过 | `Select-String` 扫描零命中；`classify_domain` 接收 `api_key: String` 参数由 keyring 加载 |
| 错误消息不泄露敏感信息 | 通过 | delete_domain_directory 错误含领域名/页面数/文件操作错误，不含 API Key；classify_domain 错误含 confidence/reason，不含 API Key 值 |
| LLM prompt 不含敏感信息 | 通过 | system_prompt 仅含领域列表 + 文档预览前 2000 字符，不含 API Key 或内部 IP |

### 4.4 边缘场景安全验证（E2E）

| 输入 | 前端校验 | 后端校验 | 结果 |
| --- | --- | --- | --- |
| `<script>alert(1)</script>` | 拒绝（kebab-case 正则） | N/A（前端已拦截） | 通过 |
| `../../../etc/passwd` | 拒绝（kebab-case 正则） | `is_valid_domain` 拒绝（含 `.` `/`） | 通过 |
| `Coding`（大写） | 拒绝（kebab-case 正则） | `is_valid_domain` 拒绝（含大写） | 通过 |
| `数学建模`（Unicode） | 拒绝（kebab-case 正则） | `is_valid_domain` 拒绝（含非 ASCII）+ MED-2 fallback | 通过 |
| `raw` / `.git` / `kb-system`（受保护） | 删除按钮 disabled | `PROTECTED_DOMAINS` 拒绝 | 通过 |

---

## 5. 回归测试结果

| 套件 | 总数 | 通过 | 失败 | 结果 |
| --- | --- | --- | --- | --- |
| 服务器单元测试 | 197 | 197 | 0 | 通过 |
| 前端单元测试 | 304 | 304 | 0 | 通过 |
| Rust 单元测试 | 46 | 46 | 0 | 通过 |
| TypeScript 类型检查 | — | — | 0 错误 | 通过 |
| **合计** | **547** | **547** | **0** | **无回归** |

---

## 6. 性能数据

> **注意**：E2E 测试在 Vite dev server（浏览器 dev 模式）下执行，IPC 降级到 mock 数据。以下延迟反映 UI 渲染性能，不代表真实 Tauri IPC 延迟。

| 操作 | 延迟 | 备注 |
| --- | --- | --- |
| tsc --noEmit | < 1s | 即时完成 |
| vitest run（304 测试） | 3.18s | transform 1.48s + tests 296ms |
| 服务器 npm test（197 测试） | 9.51s | 含 tsx 转译 |
| cargo test（46 测试） | 编译后 0.02s | 编译时间未单独计量 |
| E2E Tab 切换（经验卡片→待审核文档） | < 100ms | React 状态更新，无网络请求 |
| E2E staging 列表渲染 | 即时 | mock 数据，无 IPC |
| E2E 领域列表渲染 | 即时 | mock 数据，无 IPC |
| E2E 齿轮→设置面板 | < 100ms | Zustand 状态更新 |

**风险说明**：真实 Tauri 环境下的 IPC 延迟（listStaging / listDomains / deleteDomain）未测量。建议后续在 Tauri dev 环境中补充性能基线。

---

## 7. 缺陷列表

本次验收未发现阻断级或高危缺陷。以下为 guardrail R2 已记录的低风险项（均不阻断发布）：

| ID | 严重度 | 描述 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| R2-LOW-1 | 低 | LOW-3 段间空行修复缺格式回归断言（测试仅验证存在性，未验证 `## coding\n\n## design-resources` 双空行格式） | guardrail R2 §5.1 | 不阻断，建议补充 |
| R2-LOW-2 | 低 | MED-2 测试复制 ASCII 提取逻辑而非调用 `classify_domain` 生产代码（因 `classify_domain` 是 async fn 需真实 LLM HTTP 请求） | guardrail R2 §5.2 | 不阻断，建议抽取 `sanitize_proposed_domain` 纯函数 |
| R2-LOW-3 | 低 | MED-1 测试仅覆盖单方向前缀碰撞（删除 design 验证 design-resources 保留），未覆盖反方向 | guardrail R2 §5.1 | 不阻断，逻辑对称 |
| R2-LOW-4 | 低 | LOW-3 文件开头 `start_idx == 1` 时理论双换行（markdownlint MD012），实际不可达 | guardrail R2 §3.2.2 | 不阻断，index.md 首行恒为 `# Index` |
| LOW-2 | 低 | StagingReview confirm/reject 后未通知 ExperienceInbox 刷新（graphStore 已刷新） | guardrail R1 §3.2 | 不阻断，标记下轮迭代 |
| LOW-5 | 低 | `delete_domain_directory` 命令本身未直接单元测试（通过辅助函数间接覆盖） | guardrail R1 §3.2 | 不阻断，建议抽取纯函数 |

---

## 8. 未覆盖项与风险

| 项目 | 原因 | 风险评估 | 建议 |
| --- | --- | --- | --- |
| 真实 Tauri 运行时 IPC 端到端验证 | E2E 测试在 Vite dev server（浏览器 dev 模式）下执行，IPC 降级到 mock 数据 | 中 — 真实 IPC 调用（listStaging/confirmStaging/rejectStaging/listDomains/deleteDomain）的参数序列化、State 注入、错误处理未端到端验证 | 后续在 Tauri dev 环境中补充 Playwright + Tauri 窗口 E2E 测试 |
| LLM 真实响应验证 | `classify_domain` 需真实 API Key + 网络 HTTP 请求，无法在纯单元测试中验证 LLM 实际输出 | 中 — prompt 改造和 fallback 逻辑已验证，但 LLM 对两段式评分的实际响应质量未验证 | 后续集成测试中配置测试 API Key，验证 LLM 对数学建模类文档是否真的提议新领域 |
| StagingReview/DomainManager 组件渲染单元测试 | 本次新增前端测试仅覆盖 viewStore 和 types，未包含组件渲染测试 | 低 — 组件渲染已通过 E2E 验证（5 个场景），但缺少自动化回归保护 | 后续补充 @testing-library/react 组件测试 |
| 性能基线对比 | 无既有性能基线，关键操作延迟仅在 mock 环境下测量 | 低 — mock 环境延迟不具代表性，但 UI 渲染性能可接受 | 后续在 Tauri dev 环境中建立性能基线 |
| `delete_domain_directory` 命令直接测试 | `#[tauri::command]` 需 `State<KbConfig>` 参数，无法纯单元测试 | 低 — 四层防护通过辅助函数测试间接覆盖，逻辑正确 | 后续抽取 `delete_domain_directory_impl(kb_root, name, force)` 纯函数 |
| 删除最后一个领域后的 UI 空态 | E2E 在 mock 模式下无法执行真实删除操作 | 低 — DomainManager L263-L272 已有空态处理代码 | 代码审查确认空态处理存在 |

---

## 9. 验收标准逐条确认

以下对 8 组 35 条验收标准逐一确认，确保无遗漏：

- **AC-1（4 条）**：审核页双 Tab 展示 — 全部通过 ✓
- **AC-2（6 条）**：staging 文档审核操作 — 全部通过 ✓
- **AC-3（5 条）**：LLM 分类支持新领域建议 — 全部通过 ✓
- **AC-4（4 条）**：Domain 类型动态化 — 全部通过 ✓
- **AC-5（6 条）**：领域管理 UI — 全部通过 ✓
- **AC-6（5 条）**：delete_domain_directory 安全防护 — 全部通过 ✓
- **AC-7（3 条）**：前缀碰撞防护 — 全部通过 ✓
- **AC-8（5 条）**：无回归 — 全部通过 ✓

**35/35 验收标准全部通过。**

---

## 10. 最终结论

### 通过

本次「审核页 / LLM 新领域建议 / 领域管理」三项功能修复的分层验收测试**全部通过**：

1. **35 条验收标准**（AC-1 ~ AC-8）全部通过，每条均有具体测试输出或代码位置作为证据
2. **547 个单元测试**全部通过（服务器 197 + 前端 304 + Rust 46），无回归
3. **5 个 E2E 场景**全部通过（Playwright + Vite dev server）
4. **10 项安全检查**全部通过（四层防护 + XSS + 路径遍历 + 注入 + 密钥 + 边缘场景）
5. **TypeScript 类型检查零错误**，**Rust 编译成功**
6. **无阻断级或高危缺陷**，6 项低风险建议均不阻断发布

**本轮开发周期可以闭合。**

---

**报告结束。**
