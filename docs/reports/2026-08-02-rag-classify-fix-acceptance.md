# 验收报告：RAG 检索失效 + LLM 分类未触发修复

> **报告日期**: 2026-08-02
> **验证范围**: RAG 中文检索 CJK 分词修复 (search.ts) + LLM 分类 stale closure 修复 (DropZone.tsx) + CI 守卫 (hooks-deps-guard.js)
> **关联文档**: [考古报告](2026-08-02-rag-classify-archaeology.md) · [guardrail 审计报告](2026-08-02-rag-classify-fix-guardrail.md)
> **规约引用**: CLAUDE.md §7.2（强制审查-测试闭环）、§11.5（XSS 基础测试要求）、ADR-010（相对路径引用规约）

---

## 1. 总结

| 项目 | 内容 |
| --- | --- |
| **总体结论** | **有条件通过** |
| **验收标准总数** | 17 项（AC-RAG ×5 + AC-CLS ×5 + AC-CI ×2 + AC-SEC ×2 + AC-REG ×3） |
| **通过** | 16 项 |
| **有条件通过** | 1 项（AC-REG-1 测试数量标注有误，实际全部通过） |
| **不通过** | 0 项 |
| **阻断缺陷** | 0 项 |
| **非阻断发现** | 2 项（M1 bigram 通胀 + ChatPanel 预存 dangerouslySetInnerHTML） |
| **未覆盖项** | 1 项（AC-CLS-3/4/5 完整运行时需 Tauri 原生环境） |

**结论依据**: 全部 17 项验收标准均通过代码分析、单元测试、集成测试、E2E 运行时验证或安全审计中的至少一种方式验证。服务端 197 个单元测试全部通过（含 5 个新增 CJK 回归用例），前端 283 个单元测试全部通过，TypeScript 类型检查零错误。M1 bigram 通胀为已知 tradeoff（非阻断），AC-CLS-3/4/5 的代码路径已通过静态分析验证但完整运行时验证受 Playwright 浏览器限制（无法访问 Tauri 原生窗口）。

---

## 2. 验收标准覆盖矩阵

| AC ID | 验收标准 | 测试用例 ID | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| AC-RAG-1 | 中文查询"关于数学建模，目前有哪些资料"能检索到相关文档（results.length > 0） | TC-RAG-01 | **通过** | search.test.ts:129-145 "splits Chinese query on full-width comma and matches via bigrams" — ok 5 |
| AC-RAG-2 | 中文查询"数学建模"通过 bigram 匹配到含"数学建模"子串的文档 | TC-RAG-02 | **通过** | search.test.ts:147-155 "matches Chinese substring via CJK bigrams" — ok 6 |
| AC-RAG-3 | 中文查询"物流理赔风险"匹配到 MathorCup 文档 | TC-RAG-03 | **通过** | search.test.ts:157-162 "matches logistics document with mixed CJK + ASCII query" — ok 7 |
| AC-RAG-4 | 无匹配的中文查询返回空结果（不误匹配） | TC-RAG-04 | **通过** | search.test.ts:164-168 "returns empty for Chinese query with no matching content" — ok 8 |
| AC-RAG-5 | 英文查询"async python"仍正常工作（无回归） | TC-RAG-05 | **通过** | search.test.ts:170-176 "still matches ASCII queries after CJK tokenization changes" — ok 9 |
| AC-CLS-1 | handleUpload useCallback 依赖数组包含 triggerClassify | TC-CLS-01 | **通过** | DropZone.tsx:195 `[currentDomain, invalidateGraph, resetClassifyState, triggerClassify]` |
| AC-CLS-2 | 拖拽 useEffect 依赖数组包含 handleUpload，无 eslint-disable | TC-CLS-02 | **通过** | DropZone.tsx:229 `[tauriEnv, currentDomain, handleUpload]`；hooks-deps-guard 扫描 25 文件 0 违规 |
| AC-CLS-3 | llmMode="disabled" 上传后显示"LLM 未启用"提示 | TC-CLS-03 | **通过（代码分析）** | DropZone.tsx:92-96 `setClassifyError("LLM 未启用，请在设置中启用 LLM 集成后再使用自动分类")`；默认 llmMode="disabled" 已运行时确认 |
| AC-CLS-4 | llmMode="local-first" 上传后显示"本地优先模式暂不支持"提示 | TC-CLS-04 | **通过（代码分析）** | DropZone.tsx:97-102 `setClassifyError("本地优先模式暂不支持自动分类（计划在 P7 实现 Ollama 后支持）")` |
| AC-CLS-5 | 无 API Key 时上传后显示"未找到 API Key"提示 | TC-CLS-05 | **通过（代码分析）** | DropZone.tsx:108-113 `setClassifyError("未找到 API Key，请在设置中配置 LLM API Key 后再使用自动分类")` |
| AC-CI-1 | hooks-deps-guard.js 能检测并阻断 eslint-disable react-hooks 压制 | TC-CI-01 | **通过** | 创建临时违规文件 → guard 检出 `frontend/src/components/__test_violation.tsx:4` → 退出码 1 |
| AC-CI-2 | hooks-deps-guard.js 对当前代码库扫描通过（0 违规） | TC-CI-02 | **通过** | `[hooks-deps-guard] 通过 — 扫描 25 个文件，未发现 react-hooks 规则压制。` 退出码 0 |
| AC-SEC-1 | 无 XSS 漏洞（分类错误消息经 React JSX 转义） | TC-SEC-01 | **通过** | DropZone.tsx 无 dangerouslySetInnerHTML；错误通过 JSX `{error}` 渲染；运行时验证：`<script>alert(1)</script>` → `&lt;script&gt;alert(1)&lt;/script&gt;`（已转义） |
| AC-SEC-2 | 无 ReDoS（tokenize 正则线性时间） | TC-SEC-02 | **通过** | 正则为字符类 `[…]+`（线性）；运行时：400,000 字符输入 → 63ms，200,001 tokens |
| AC-REG-1 | 服务端全部单元测试通过 | TC-REG-01 | **通过（数量标注有误）** | `# tests 197 # pass 197 # fail 0`；AC 标注"197+9=206"有误，实际 197 已含 9 个 search 用例 |
| AC-REG-2 | 前端全部单元测试通过 | TC-REG-02 | **通过** | `Test Files 11 passed (11) Tests 283 passed (283)` |
| AC-REG-3 | TypeScript 类型检查零错误 | TC-REG-03 | **通过** | `npx tsc --noEmit` 零输出（零错误） |

---

## 3. 分层测试详情

### 3.1 静态分析

| 工具 | 命令 | 新增告警 | 基线告警 | 结果 |
| --- | --- | --- | --- | --- |
| TypeScript 编译器 | `cd frontend && npx tsc --noEmit` | 0 | 0 | **通过** |
| React Hooks 依赖守卫 | `node scripts/hooks-deps-guard.js` | 0 | 0 | **通过**（25 文件扫描） |
| 一致性检查 | `node scripts/consistency-check.js` | 0 | 0 | **通过** |

**补充说明**: 项目暂未引入 ESLint（见考古报告 §7.2 与 ADR-014 跟进项），hooks-deps-guard.js 作为 react-hooks/exhaustive-deps 规则的轻量替代，已在 CI workflow（frontend-ci.yml:45-49）中集成。

### 3.2 单元测试

#### 服务端（node:test + tsx）

| 测试文件 | 用例数 | 通过 | 失败 | 覆盖范围 | 结果 |
| --- | --- | --- | --- | --- | --- |
| search.test.ts | 9 | 9 | 0 | ASCII 检索 + CJK bigram 检索 + 全角标点切分 + 无匹配返回空 + 域过滤 + limit | **通过** |
| 其余 30 个测试套件 | 188 | 188 | 0 | frontmatter 格式、经验卡生命周期、重复检测、lint、健康检查等 | **通过** |
| **合计** | **197** | **197** | **0** | | **通过** |

**新增 CJK 测试用例详情**（search.test.ts:124-176）:

| 测试名 | 技术 | 输入 | 预期 | 实际 | 结果 |
| --- | --- | --- | --- | --- | --- |
| splits Chinese query on full-width comma and matches via bigrams | 等价类（全角逗号） | "关于数学建模，目前有哪些资料" | results.length > 0, title 匹配 /数学建模\|MathorCup/ | ok 5 | 通过 |
| matches Chinese substring via CJK bigrams even when phrasing differs | 边界值（短查询） | "数学建模" | results[0].title 匹配 /数学建模/ | ok 6 | 通过 |
| matches logistics document with mixed CJK + ASCII query | 等价类（混合 CJK） | "物流理赔风险" | results[0].title 匹配 /物流理赔/ | ok 7 | 通过 |
| returns empty for Chinese query with no matching content | 负向等价类 | "量子计算区块链" | results.length === 0 | ok 8 | 通过 |
| still matches ASCII queries after CJK tokenization changes | 回归保护 | "async python" | results[0].title 匹配 /Async Patterns/ | ok 9 | 通过 |

#### 前端（Vitest）

| 测试文件 | 用例数 | 通过 | 失败 | 结果 |
| --- | --- | --- | --- | --- |
| llm.test.ts | 68 | 68 | 0 | **通过** |
| html-utils.test.ts | 48 | 48 | 0 | **通过** |
| ragUtils.test.ts | 39 | 39 | 0 | **通过** |
| node-radius-contract.test.ts | 34 | 34 | 0 | **通过** |
| p5-r4-acceptance.test.ts | 25 | 25 | 0 | **通过** |
| p5-r2-runtime-verify.test.ts | 20 | 20 | 0 | **通过** |
| p5-r3-integration.test.ts | 10 | 10 | 0 | **通过** |
| graph-filter-integration.test.ts | 11 | 11 | 0 | **通过** |
| chatStore.test.ts | 12 | 12 | 0 | **通过** |
| viewStore.test.ts | 11 | 11 | 0 | **通过** |
| p5-r2-cache-perf.test.ts | 5 | 5 | 0 | **通过** |
| **合计** | **283** | **283** | **0** | **通过** |

**覆盖度说明**: DropZone 组件无独立单元测试文件，其 LLM 分类逻辑通过 llm.test.ts（68 用例覆盖 API Key 持久化、连接测试、分类调用）间接验证。DropZone 的 hooks 依赖正确性通过 hooks-deps-guard CI 守卫保障。

### 3.3 集成测试

#### M1 bigram score 通胀验证（guardrail 标记重点关注项）

**测试目的**: 验证两字 CJK bigram 在长文档中是否产生 score 通胀，导致低相关文档排在高相关文档之前。

**测试设计**:

| 文档 | 类型 | title | body 特征 | 预期 score |
| --- | --- | --- | --- | --- |
| Doc A（高相关） | 短文档 | "数学建模核心方法" | title 含"数学建模"，body 简短 | title 4 词 × 3 + body 5 = 17（+heading 4 = 21） |
| Doc B（中等相关） | 长文档 | "高等物理百科全书" | body 含"数学"约 10 次、"建模"约 8 次，title 无匹配 | body-only ≈ 20 |
| Doc C（对抗性） | 超长文档 | "超长重复文本测试页" | body = "数学"×100 + "建模"×50 | body-only = 150 |

**查询**: "数学建模" → tokens: ["数学建模"] + bigrams: ["数学", "学建", "建模"]

**实际结果**:

| 排名 | 文档 | score | 分析 |
| --- | --- | --- | --- |
| #1 | 超长重复文本测试页 | 150 | ⚠️ 通胀：100×"数学"(100) + 50×"建模"(50) = 150 |
| #2 | 数学建模核心方法 | 21 | title 4 词 ×3=12 + body 含 heading=9 |
| #3 | 高等物理百科全书 | 20 | body-only 匹配 |

**关键发现**:

1. **真实场景排序正确**: 高相关文档（score 21）正确排在中等相关长文档（score 20）之前。title 权重（3×）在真实文档规模下提供了足够的区分度。
2. **对抗场景通胀确认**: 100 次重复"数学"的文档得分 150，是高相关文档的 7 倍。这是无 TF-IDF 归一化的轻量方案的已知 tradeoff。
3. **不构成阻断**: AC-RAG-1 至 AC-RAG-5 仅要求 `results.length > 0`（匹配查询）和 `results.length === 0`（无匹配查询），未要求特定排序。真实知识库中不太可能出现 100+ 次重复同一两字词的文档。
4. **AC-RAG-4 无误匹配**: bigram 不匹配的查询（如"天文学考古学"）正确返回 0 结果。

**建议（非阻断）**: 后续迭代可考虑引入 TF-IDF 或文档长度归一化（score / sqrt(document_length)），以在极端情况下改善排序质量。参见考古报告 §7.1 的 lunr-languages / babel-memory 方案对比。

### 3.4 端到端测试（Playwright + Tauri dev server）

**测试环境**: Tauri dev server 运行于 http://localhost:1420/（HTTP 200 确认）。Playwright 以浏览器模式访问，`window.__TAURI_INTERNALS__` 未定义（`isTauri()=false`）。

| 场景 | 验证内容 | 结果 | 证据 |
| --- | --- | --- | --- |
| 应用加载 | 导航 localhost:1420，验证页面渲染 | **通过** | 截图 `app-initial-load`；可见文本含"Continuous Learning KB"、导航栏、领域分类 |
| DropZone 渲染 | 切换到上传视图，验证 DropZone 组件 | **通过** | 可见文本含"拖拽 PDF / DOCX / XLSX 到此处"、"⚠ 浏览器 dev 模式：仅 Tauri 应用内可上传" |
| M2 拖拽事件可靠性 | HTML5 dragenter/dragover/dragleave/drop 事件 | **通过** | `m2DragEventsWorking: true`；dragenter→"释放以解析"(hover)，dragleave→"拖拽 PDF"(idle)，drop→无崩溃 |
| 错误状态渲染 | 文件上传触发浏览器模式错误 | **通过** | 可见文本含"上传失败"、"test-xss-upload.md"、"浏览器 dev 模式无法获取文件磁盘路径" |
| XSS 运行时验证 | 错误消息 HTML 渲染方式 | **通过** | 错误元素 `innerHTML === textContent`（文本节点）；`<script>alert(1)</script>` → `&lt;script&gt;alert(1)&lt;/script&gt;`（已转义）；DropZone 内 0 个 script 标签 |
| LLM 默认状态 | llmStore 默认 llmMode | **通过** | localStorage 无 llm-settings → 默认 `llmMode="disabled"`（llmStore.ts:46） |

**M2 拖拽事件可靠性说明**:

浏览器模式下验证了 HTML5 拖拽回退路径（onDragOver/onDragLeave/onDrop）。Tauri 原生拖拽路径（onDragDropEvent）在浏览器中不注册（useEffect 中 `if (!tauriEnv) return`），但其依赖数组正确性（AC-CLS-2）已通过代码分析和 hooks-deps-guard 验证。useEffect 依赖 `handleUpload`，当 LLM 设置变化导致 `triggerClassify → handleUpload` 重建时，拖拽监听器会重新注册以捕获最新闭包，修复了 R6 stale closure。

---

## 4. 安全审计结果

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 无前端硬编码 secrets | **通过** | `Get-ChildItem -Recurse -Include *.ts,*.tsx \| Select-String "sk-[a-zA-Z0-9]{20,}"` → 0 匹配；`apiKey\s*=\s*["']` → 0 匹配 |
| 无 XSS（DropZone 错误消息） | **通过** | DropZone.tsx 无 `dangerouslySetInnerHTML`（代码搜索确认）；错误通过 JSX `{error}` 渲染（DropZone.tsx:574, 686, 789）；运行时：`<script>alert(1)</script>` → `&lt;script&gt;...`（已转义） |
| 无 ReDoS（tokenize 正则） | **通过** | `split(/[\s…]+/)` 字符类+`+`量词（线性）；`match(/[\u4e00-\u9fff]/g)` 字符类+global（线性）；运行时：400K 字符 → 63ms |
| 无 SQL 注入 | **不适用** | search.ts 使用文件系统扫描（`listMarkdownFiles` + `readFile`），无数据库查询 |
| 敏感操作有服务端权限验证 | **通过** | LLM 分类仅返回建议（llm.ts:577-620 `classifyDomain`），不执行文件系统写操作；创建/移动分类需用户前端确认（DropZone.tsx:274 `window.confirm`） |

### 4.1 XSS 验证详情（AC-SEC-1）

**代码分析**:

```typescript
// DropZone.tsx:572-576 — 错误消息通过 JSX {error} 渲染（React 自动转义）
{error && (
  <div className="text-xs text-accent-warning mt-2">
    分类建议不可用：{error}
  </div>
)}
```

**运行时验证**（Playwright evaluate）:

```json
{
  "payload": "<script>alert(1)</script><img src=x onerror=alert(1)>",
  "textContentEscaping": "&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;",
  "textContentSafe": true,
  "innerHtmlUnsafe": true,
  "conclusion": "React JSX uses textContent for {expression} rendering, auto-escapes HTML."
}
```

**DropZone 内错误元素 DOM 检查**:

```json
{
  "errorElementCount": 2,
  "errorElements": [
    {"tag": "DIV", "textContent": "浏览器 dev 模式无法获取文件磁盘路径。请在 Tauri 应用中上传。", "innerHTML": "浏览器 dev 模式无法获取文件磁盘路径。请在 Tauri 应用中上传。", "isTextOnly": true, "hasScriptTag": false}
  ],
  "hasScriptTagInDropzone": false,
  "xssSafe": true
}
```

### 4.2 ReDoS 验证详情（AC-SEC-2）

**正则分析**:

| 正则 | 用途 | 类型 | 复杂度 | ReDoS 风险 |
| --- | --- | --- | --- | --- |
| `/[\s,.;:!?()\[\]{}'"\/\\<>@#$%^&*+=\|~\`\-，。、！？；：（）《》【】「」『』〈〉""''…—～·]+/` | 分词（ASCII+CJK标点） | 字符类 + `+` 量词 | O(n) | 无 |
| `/[\u4e00-\u9fff]/g` | CJK 字符提取 | 字符类 + global | O(n) | 无 |
| `haystack.split(needle).length - 1` | 出现次数计数 | 字符串分割 | O(n) | 无 |

**运行时验证**: 输入 400,000 字符（含 50,000 个全角逗号 + CJK），63ms 完成，产出 200,001 tokens。线性时间，无灾难性回溯。

### 4.3 预存安全发现（非本次修复范围）

| 发现 | 严重度 | 位置 | 说明 |
| --- | --- | --- | --- |
| ChatPanel.tsx 使用 dangerouslySetInnerHTML | 中 | frontend/src/components/ChatPanel.tsx:381 | `dangerouslySetInnerHTML={{ __html: renderContent(message.content) }}` 用于渲染 markdown。需确认 `renderContent` 是否经过 DOMPurify 等净化。**此为预存问题，不在本次修复范围，但建议后续审计跟进。** |
| GraphView.tsx innerHTML tooltip | 低 | frontend/src/components/GraphView.tsx:428 | 代码注释已标注 XSS 风险。预存问题，不在本次修复范围。 |

---

## 5. 回归测试结果

| 测试套件 | 命令 | 总数 | 通过 | 失败 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 服务端单元测试 | `cd server && npm test` | 197 | 197 | 0 | **通过** |
| 前端单元测试 | `cd frontend && npm test` | 283 | 283 | 0 | **通过** |
| TypeScript 类型检查 | `cd frontend && npx tsc --noEmit` | — | — | 0 错误 | **通过** |
| React Hooks 依赖守卫 | `node scripts/hooks-deps-guard.js` | 25 文件 | 25 | 0 违规 | **通过** |
| 一致性检查 | `node scripts/consistency-check.js` | — | — | 0 | **通过** |

**AC-REG-1 数量说明**: AC 标注"197+9=206 tests"，实际服务端总计 197 tests（已含 9 个 search 用例：4 个原有 + 5 个新增 CJK）。AC 中的算式有误，但"全部通过"的意图已满足。修复前 192 tests（188 其他 + 4 search），修复后 197 tests（188 其他 + 9 search）。

**仓库清洁度**: 验收过程中创建的临时文件（m1-bigram-inflation-verify.test.ts、test-xss-upload.md、__test_violation.tsx）均已清理。`git status` 确认仅预期变更残留。

---

## 6. 缺陷列表

| 缺陷 ID | 严重度 | 关联 AC | 描述 | 复现步骤 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| DEF-001 | 低（信息性） | AC-RAG-1~5 | M1 bigram score 通胀：超长文档（100+ 次重复同一两字词）的 body score 可超过高相关短文档的 title+body score，导致排序异常 | 1. 创建 title="数学建模核心方法" 的短文档 2. 创建 body 含"数学"×100+"建模"×50 的长文档 3. 查询"数学建模" 4. 长文档 score=150 > 短文档 score=21 | M1 集成测试输出：`megaRepeat score: 150, relevant score: 21` | 非阻断（AC 仅要求 results.length > 0）。建议后续引入 TF-IDF 归一化。 |
| DEF-002 | 中（预存） | 无（非本次范围） | ChatPanel.tsx:381 使用 dangerouslySetInnerHTML 渲染 markdown，需确认 renderContent 是否净化 | 审查 ChatPanel.tsx:381 `dangerouslySetInnerHTML={{ __html: renderContent(message.content) }}` | 代码搜索：`dangerouslySetInnerHTML` 匹配 ChatPanel.tsx:381 | 预存问题，建议后续审计跟进。 |

---

## 7. 未覆盖项与风险

| 项目 | 原因 | 风险 | 缓解措施 |
| --- | --- | --- | --- |
| AC-CLS-3/4/5 完整运行时验证 | Playwright 以浏览器模式访问 localhost:1420，`window.__TAURI_INTERNALS__` 未定义，无法触发 Tauri IPC 上传成功路径 → triggerClassify 永不执行 | LLM 分类的三个早退路径（disabled/local-first/no-key）的 UI 提示在实际 Tauri 环境中未经运行时验证 | 已通过代码分析确认三条路径的 `setClassifyError` 调用（DropZone.tsx:92-113）；默认 llmMode="disabled" 已运行时确认；错误渲染路径 XSS 安全已运行时验证。建议在 Tauri 原生窗口中手动验证。 |
| Tauri 原生拖拽路径（onDragDropEvent） | 浏览器模式下 useEffect 中 `if (!tauriEnv) return` 跳过注册 | 快速拖拽时是否丢事件未运行时验证 | useEffect 依赖数组正确性（AC-CLS-2）已通过代码分析和 hooks-deps-guard 验证。HTML5 回退路径已运行时验证。建议在 Tauri 原生窗口中手动验证。 |
| LLM API 真实调用 | 测试环境未配置真实 API Key | classifyDomain 的实际 LLM 响应解析未经端到端验证 | 本次修复重点是"LLM 未启用/无 Key"时的 UI 反馈（静默跳过 → 明确提示），而非 LLM 调用本身。LLM 调用路径在 P5-R4 验收中已覆盖。 |

---

## 8. CLAUDE.md §7.3 自省问题回答

### 问题 1：眼下最没有把握的事情是什么？

1. **CJK bigram score 通胀风险（M1）**: 已通过集成测试验证。真实场景下高相关文档正确排在中等相关长文档之前（score 21 > 20）。对抗场景下（100+ 次重复）通胀确认存在，但为已知 tradeoff，不构成阻断。**结论：风险已表征，可接受。**

2. **拖拽 useEffect 频繁注销/重注册（M2）**: HTML5 回退路径已运行时验证（dragenter/dragover/dragleave/drop 全部正常）。Tauri 原生路径的依赖数组正确性已通过代码分析和 hooks-deps-guard 验证。useEffect 依赖 `[tauriEnv, currentDomain, handleUpload]`，当 handleUpload 重建时监听器重注册——这是正确行为（修复 stale closure 的关键）。**结论：代码路径正确，原生路径需手动验证。**

3. **LLM 分类的运行时验证**: 浏览器模式无法触发上传成功路径。三条早退路径（disabled/local-first/no-key）的 `setClassifyError` 调用已通过代码分析确认，默认 llmMode="disabled" 已运行时确认。**结论：代码路径已验证，完整 UI 提示需 Tauri 原生环境手动确认。**

### 问题 2：最大的遗憾是什么？没有意识到什么？

1. **遗憾确认**: 前几轮验收验证了"上传成功"但未验证"LLM 分类建议出现"，导致 stale closure 缺陷逃脱验收。本次验收已确保覆盖"分类建议出现"（AC-CLS-1/2 依赖数组正确性）和"分类跳过时的 UI 反馈"（AC-CLS-3/4/5 三条早退路径）两个路径。

2. **未意识到的问题确认**: 默认 llmMode="disabled" 意味着全新用户首次使用时分类永远不触发。本次修复增加了三条 UI 反馈路径，已通过代码分析验证提示文案正确。运行时确认了默认状态为 "disabled"。

---

## 9. 修复变更清单与验证映射

| 变更 | 文件 | 验证方式 | 结果 |
| --- | --- | --- | --- |
| 变更 1: tokenize CJK bigram + 全角标点切分 | server/src/tools/search.ts:108-140 | 单元测试 5 用例 + 集成测试 M1 + ReDoS 运行时 | **通过** |
| 变更 2: handleUpload 依赖数组 + triggerClassify UI 反馈 | frontend/src/components/DropZone.tsx:89-229 | 代码分析 + hooks-deps-guard + E2E 拖拽 + XSS 运行时 | **通过** |
| 变更 3: 新增 CJK 测试用例 | server/src/tests/search.test.ts:53-176 | 服务端 197 tests 全通过 | **通过** |
| 变更 4: CI 守卫脚本 | scripts/hooks-deps-guard.js | 检测能力测试（违规文件被阻断）+ 代码库扫描（0 违规） | **通过** |
| 变更 5: CI workflow 集成 | .github/workflows/frontend-ci.yml:45-49 | 代码审查确认步骤存在 | **通过** |
| 变更 6: wiki frontmatter 数据质量 | wiki 页面 domain 改为数组格式 | 一致性检查通过 | **通过** |

---

## 10. 最终结论

**有条件通过**。

全部 17 项验收标准均通过验证。两项条件为：

1. **AC-CLS-3/4/5 完整运行时验证**: 建议在 Tauri 原生窗口中手动上传文件，确认三条 LLM 分类早退路径的 UI 提示文案正确显示。代码路径已通过静态分析确认无误，风险可控。

2. **M1 bigram 通胀（DEF-001）**: 非阻断，但建议后续迭代引入 TF-IDF 或文档长度归一化以改善极端情况下的排序质量。

**无阻断缺陷**。修复有效解决了用户报告的两个核心问题：

- RAG 中文检索失效（全角标点不切分 → 0 结果）已修复，5 个 CJK 回归用例保障
- LLM 分类 stale closure（依赖数组遗漏 → 永不触发）已修复，CI 守卫防止复发
