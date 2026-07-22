# 持续进化个人知识库系统 · 技术选型对比分析报告

> **研究日期**：2026-07-22
> **研究执行 Agent**：技术选型调研专家（tech-selection-researcher）
> **调研方法**：定标尺 → 广撒网 → 深验证 → 出报告（强制 web-access 网络搜索验证 2026 年最新现状）
> **Baseline**：Andrej Karpathy「LLM Wiki」模式（见 [karpathy-LLM.md](file:///D:/s0611/code/Continuous-learning/karpathy-LLM.md)）
> **信息时效提醒**：本报告基于 2026-07-22 的公开信息。MCP 生态、解析库迭代极快，若决策时间距本报告超过 3 个月，建议针对 MCP 规范（2026-07-28 候选版）与解析库版本重新核验。

---

## 0. 上下文重建摘要（CLAUDE.md 零节要求）

1. **项目当前阶段**：本项目 `Continuous-learning` 处于立项/技术决策期，目标是基于 Karpathy LLM Wiki 模式设计「持续进化的个人知识库系统」。仓库当前仅有 `karpathy-LLM.md` 原始方案文件与 `CLAUDE.md` 治理规则，尚无实现代码。
2. **本次任务目标**：对四点改进（持续进化机制、可被外部 Agent 调用、多领域分类、图形化界面+多格式上传）涉及的 7 个技术决策点（A-G）做系统化选型对比，输出可执行的推荐组合。
3. **文档间矛盾/模糊点**：用户需求中「本地优先 vs Web 服务」「桌面 GUI vs 纯 Web」「本地 LLM vs 云 API」三组取向未定，本报告以**量化验收矩阵 + 刚性约束**倒推，给出分档建议而非单点强推。

---

## 1. Executive Summary

本研究围绕「在 Karpathy LLM Wiki 模式上构建持续进化、可被外部 Agent 调用、多领域分类、带 GUI 与多格式上传的个人知识库系统」，对 7 个决策点（A 部署形态、B GUI 技术栈、C 文件解析、D MCP server、E 检索方案、F 持续进化机制、G 分类管理）完成定标尺—广撒网—深验证—出报告四阶段调研。

**一句话推荐**：采用**混合分层架构**——以 `markdown + git` 为不可变存储层（与 Karpathy 原方案 100% 兼容），以 **MCP server**（优先评估开源 `enquire-mcp`，自建则用 TypeScript SDK）为 Agent 访问层，以 **Obsidian** 为人工浏览/图谱层，以 **Tauri** 包裹的轻量 Web GUI 为多格式上传/管理层；文件解析统一收敛到 **MinerU（PDF）+ mammoth/office2md（Word）+ pandas（Excel）**；检索按规模分档（小→index.md，中→qmd/markdown-vault-mcp，大→LanceDB）；持续进化用「AGENTS.md 强制经验卡片 + MCP ingest tool + /dream 定期整理 + 人工审核门禁」四件套；分类用「目录树（领域）+ frontmatter tags（横切）+ Dataview（动态视图）」混合。

**核心依据**：2026 年 MCP 已被 Claude Code、Cursor、Trae CN、OpenCode/OpenClaw 全线接入（[CSDN 2026-07](https://blog.csdn.net/aidoudoulong/article/details/161085784)）；Tauri v2 包体积 3-10MB、内存 40-80MB，较 Electron 小 20-50x（[rustify.rs 2026-04](https://rustify.rs/articles/rust-tauri-vs-electron-2026)）；MinerU v3.4 开源 15k+ stars、Apache 2.0 风格许可、原生支持 PDF/DOCX/PPTX/XLSX 且内置 MCP server（[PyPI mineru 3.4.1](https://pypi.org/project/mineru/3.4.1/)）。

---

## 2. 需求与约束回顾（Phase 1 定标尺）

### 2.1 量化验收矩阵

| 指标名称 | 最低要求 | 理想目标 | 测量方法 | 权重(1-10) |
|---|---|---|---|---|
| 与 Karpathy 原方案兼容性 | 不破坏三层架构（raw/wiki/schema）与双索引（index.md/log.md） | 原方案作为子集无缝运行 | 人工对照原方案操作清单回归 | 10 |
| Agent 可调用性 | 至少 1 个编码 Agent 能查询知识库 | Claude Code / Trae / OpenCode 三者均可经 MCP 查询+回写 | 在三客户端配置 MCP server 并实测 search/ingest | 10 |
| 检索延迟（P95） | < 2s（含重排） | < 200ms（BM25 纯关键词） | 本地压测 wiki 规模档位 | 8 |
| 多格式上传覆盖 | PDF + Word + Excel 三类 | PDF/Word/Excel/PPT/图片/网页全覆盖 | 各格式样本转换后人工评估 markdown 质量 | 8 |
| 持续进化防污染 | 新经验有审核门禁，可回滚 | 自动质量评分 + 去重 + 人工两 tier 审核 | 注入低质量经验卡片观察是否被拦截 | 9 |
| GUI 开发成本 | 1 人 2 周内出可用原型 | 复用现成 MCP server，GUI 仅做上传壳 | 工时记录 | 7 |
| 本地/隐私 | 支持完全离线运行（云 API 可选） | 全链路本地优先，敏感数据不出本机 | 断网验证 ingest/query 全流程 | 8 |
| 可维护性 | 依赖 ≤ 5 个核心组件 | 零独立服务进程，单二进制或单 npm 包 | 依赖树审计 | 7 |
| 规模上限 | 支撑 1000 篇 wiki 页面 | 支撑 10w 篇仍亚秒检索 | 递增数据压测 | 6 |

### 2.2 刚性约束（一票否决项）

| # | 约束 | 说明 |
|---|---|---|
| V1 | **License 必须允许商业闭源/自由使用** | 排除纯 AGPLv3（MinerU 已于 2026-04 从 AGPLv3 切到 Apache 2.0 风格许可，可通过） |
| V2 | **存储层必须是 markdown + git 仓库** | 与 Karpathy 原方案兼容的硬性要求，排除纯数据库存储方案 |
| V3 | **MCP server 必须支持 stdio 传输** | 本地 Agent（Claude Code/OpenCode）默认 stdio，无网络面 |
| V4 | **不得引入需要常驻多进程的重量中间件** | 个人知识库场景，排除 Milvus(etcd+MinIO+Milvus 三容器) 等重型向量库 |
| V5 | **团队技术栈以 TypeScript/Python 为主** | 排除需要深度 Rust 开发的方案作为首选（但可接受预编译 Rust 二进制如 obsidian-mcp） |

### 2.3 场景分档（解决用户未明确的规模问题）

| 档位 | wiki 页面数 | raw 源文件数 | 推荐检索策略 |
|---|---|---|---|
| 小 | < 200 | < 100 | 纯 index.md（Karpathy 原方案，零依赖） |
| 中 | 200–5000 | 100–1000 | qmd / markdown-vault-mcp（BM25+向量混合） |
| 大 | > 5000 | > 1000 | LanceDB 嵌入式向量库 + FTS5 |

---

## 3. 候选广撒网与初筛日志（Phase 2）

### 3.1 MCP 知识库 Server 候选全景

| 候选 | 语言 | License | 检索能力 | 关键特性 | 初筛结论 |
|---|---|---|---|---|---|
| **enquire-mcp** ([GitHub](https://github.com/oomkapwn/enquire-mcp)) | Node | MIT | BM25+ML embeddings+BGE reranker, RRF, HNSW+int8 | 44 tools, 923 单测, SLSA-3 签名, PDF+OCR, 零云调用, v3.8.x stable | **入围（功能最强）** |
| **obsidian-mcp (Rust)** ([crates.io](https://crates.io/crates/obsidian-mcp/2.0.0)) | Rust | MIT | Tantivy BM25 + 本地 embeddings | 单二进制, 18 tools, 文件系统直访, 无需 Obsidian 运行 | **入围（性能最佳）** |
| **markdown-vault-mcp** ([PyPI](https://pypi.org/project/markdown-vault-mcp/3.0.3/)) | Python | MIT | FTS5 + 语义向量, RRF 混合 | 增量重索引, frontmatter 感知, Obsidian vault 通用 | **入围（Python 生态亲和）** |
| **knowledge-base-server** ([mcprepository](https://mcprepository.com/willynikes2/knowledge-base-server)) | Node | MIT | SQLite FTS5 + embeddings | 131 stars, 三层记忆(cold/warm/hot), 自学习管道, 200+ 文档生产验证 | **入围（持续进化参考实现）** |
| **mcp-obsidian-vault** ([jsdelivr](https://www.jsdelivr.com/package/npm/mcp-obsidian-vault)) | Node | MIT | 正则全文 | 27 tools, 多 agent 任务编排, HITL 审核, git sync | 淘汰（检索能力弱，偏任务管理） |
| **qmd** ([GitHub tobi/qmd](https://github.com/tobi/qmd)) | Node | MIT | BM25+向量+LLM 重排, RRF | Karpathy 原方案推荐, 内置 MCP server, 3 个本地 GGUF 模型(~2GB) | **入围（原方案钦定，作为检索层候选）** |
| **WikiMind** ([lobehub](https://lobehub.com/mcp/hal-9909-llm-wikimind)) | Python | MIT | 纯 BM25(qmd), 无向量 | Karpathy 模式的"生产就绪实现", 自动 watcher | 淘汰（功能为 qmd 子集，依赖 qmd） |

### 3.2 GUI 框架候选

| 候选 | 包体积 | 内存(空闲) | 原生文件系统能力 | 跨端一致性 | 初筛 |
|---|---|---|---|---|---|
| **Tauri v2** | 3-10MB | 40-80MB | Rust 后端直访 FS | 随 OS WebView 变化 | **入围** |
| Electron | 120-200MB | 150-400MB | Node.js 全访问 | 完全一致(Chromium) | 淘汰（资源占用过重，违背 V4） |
| Next.js Web | 0(浏览器) | 0 | 需后端中转 | 一致 | **入围（若选 Web 服务形态）** |
| SvelteKit / Vite+React | 0(浏览器) | 0 | 需后端中转 | 一致 | 备选 |

### 3.3 文件解析候选

| 候选 | 格式覆盖 | License | 本地/云 | 质量 | 初筛 |
|---|---|---|---|---|---|
| **MinerU** ([PyPI](https://pypi.org/project/mineru/3.4.1/)) | PDF/DOCX/PPTX/XLSX/图片/网页 | MinerU OSS(Apache 2.0 风格) | 本地(CPU/GPU) | SOTA(OmniDocBench 95.39) | **入围（PDF 首选）** |
| **unstructured.io** ([benchmarks](https://www.unstructured.io/benchmarks)) | 20+ 格式 | Apache 2.0(OSS)/商业(云) | 二者皆有 | 企业 ETL 第一(0.880) | 备选（OSS 质量低于 MinerU，云版付费） |
| LlamaParse | 多格式 | 商业 API | 云 | 强(0.835) | 淘汰（云依赖，违背隐私可选约束） |
| marker | PDF | MIT | 本地 | 学术文档强(8.1/10) | 备选（仅 PDF） |
| **mammoth** ([PyPI](https://pypi.org/project/mammoth/)) | DOCX | BSD-2 | 本地 | 语义化 HTML/MD | **入围（Word 首选）** |
| python-docx | DOCX | MIT | 本地 | 结构化访问 | 备选（偏格式操作非转换） |
| **pandas** | XLSX/CSV | BSD-3 | 本地 | DataFrame | **入围（Excel 首选）** |
| openpyxl | XLSX | MIT | 本地 | 精细格式 | 备选（pandas 已含其引擎） |
| **office2md** ([PyPI](https://pypi.org/project/office2md/)) | DOCX/XLSX/PPTX/PDF | MIT | 本地 | 智能选择器 | **入围（统一入口候选）** |

### 3.4 检索方案候选

| 候选 | 依赖度 | 检索质量 | 维护成本 | 规模上限 | 初筛 |
|---|---|---|---|---|---|
| 纯 index.md | 零依赖 | 中(小规模够用) | 极低 | ~数百页 | **入围（小规模）** |
| **qmd** | npm 包 + 3 GGUF 模型(~2GB) | 高(混合+重排) | 低 | 数千页 | **入围（中规模）** |
| **markdown-vault-mcp** | Python + 可选 embedding | 高(FTS5+语义) | 低 | 数千页 | **入围（中规模）** |
| **LanceDB** ([yage.ai](https://yage.ai/share/lancedb-selection-guide-en-20260327.html)) | pip install, 无服务进程 | 高(向量) | 中(版本文件清理) | 10w-100w | **入围（大规模）** |
| Chroma | pip install, SQLite 底层 | 高 | 低 | ~10w 变慢 | 备选（LanceDB 多模态更优） |
| sqlite-vss / sqlite-vec | SQLite 扩展 | 中高 | 低 | 中 | 备选 |
| ripgrep / whoosh | 命令行/Python | 低(纯关键词) | 极低 | 大 | 淘汰（无语义） |

---

## 4. 决赛方案深度对比（Phase 3，按 A-G 决策点）

### 决策点 A：整体部署形态

| 维度 | ① 纯本地（Obsidian+git+CLI+MCP） | ② 本地优先+轻量 Web GUI（Tauri） | ③ Web 服务（前后端分离） | ④ 混合分层（推荐） |
|---|---|---|---|---|
| 与 Karpathy 兼容性 | 100% | 100% | 70%（存储仍 md+git，但访问层脱离 Obsidian） | 100%（Karpathy 是其子集） |
| 开发成本 | 最低（零 GUI） | 中（需学 Tauri） | 高（前后端+部署） | 中高（分层但复用现成组件） |
| 多 Agent 调用便利 | 高（stdio MCP） | 高（同左） | 最高（HTTP MCP 可远程） | 高（stdio 本地 + 可选 HTTP） |
| 多格式上传难度 | 高（手动放 raw/） | 低（GUI 拖拽→解析→入 raw/） | 低 | 低 |
| 可维护性 | 高 | 高 | 中（多组件） | 中高 |
| 远程访问 | 不支持 | 不支持 | 支持 | 可选支持 |

**推荐：④ 混合分层架构。**

理由：
1. **与 Karpathy 完全兼容**：存储层仍是 `raw/` + `wiki/` + `CLAUDE.md/AGENTS.md`，双索引 `index.md` + `log.md` 不变。Karpathy 原方案明确写道「wiki 就是 git 仓库的 markdown 文件」「Obsidian 是 IDE，LLM 是程序员，wiki 是代码库」，混合方案保留这一内核。
2. **解耦关注点**：存储（markdown+git）、Agent 访问（MCP server）、人工浏览（Obsidian）、批量管理（Tauri GUI）各司其职，任一层可独立替换。
3. **覆盖用户全部四点改进**：持续进化→MCP ingest tool + AGENTS.md 规则；外部 Agent 调用→MCP server；多领域分类→目录树+tags；GUI+多格式上传→Tauri 层。
4. **降级路径清晰**：若不做 GUI，退化为方案①（纯本地）仍是完整可用的 Karpathy 系统；若需远程，存储层不变，仅 MCP server 切 HTTP 传输即升级为方案③能力。

**降级触发**：若 1 人 2 周内无法完成 Tauri GUI，先按方案①上线（Obsidian + MCP server），GUI 作为 Phase 2 增量。

---

### 决策点 B：图形化界面技术栈

| 维度 | Tauri v2 | Electron | Next.js Web | SvelteKit |
|---|---|---|---|---|
| 包体积 | 3-10MB | 120-200MB | 0(浏览器) | 0(浏览器) |
| 内存(空闲) | 40-80MB | 150-400MB | 0 | 0 |
| 启动时间 | <200ms | 2-5s | 即时 | 即时 |
| 原生 FS 能力 | Rust 后端直访 | Node.js 全访问 | 需后端 | 需后端 |
| markdown/git 集成 | Rust 侧调 git/FS | Node 调 isomorphic-git | 需后端 API | 需后端 API |
| 跨端一致性 | 随 OS WebView | 完全一致 | 一致 | 一致 |
| 学习曲线 | 需 Rust 基础(后端) | 纯 JS/TS | 纯 JS/TS | 纯 JS/TS |
| 移动端支持 | Tauri 2 支持 iOS/Android | 不支持 | 响应式 | 响应式 |
| License | Apache-2.0/MIT | MIT | MIT | MIT |

数据来源：[rustify.rs 2026-04](https://rustify.rs/articles/rust-tauri-vs-electron-2026)、[pkgpulse 2026-02](https://www.pkgpulse.com/guides/electron-vs-tauri-2026/raw.md)、[CSDN 2026版](https://blog.csdn.net/qq_21460781/article/details/156802161)。

**推荐：Tauri v2（桌面）+ 可选 Next.js Web（若需远程）。**

理由：
1. **资源占用**：知识库 GUI 是常驻后台的工具型应用，Tauri 40-80MB 内存 vs Electron 150-400MB，对老旧设备/并行跑多个 Agent 的场景显著更友好（V4 约束）。
2. **原生文件系统能力**：多格式上传需要写 `raw/` 目录、调 git 提交、触发解析管道。Tauri 的 Rust 后端可直访 FS 与调 `git` CLI，无需额外后端服务，契合「本地优先」。
3. **安全模型**：Tauri v2 默认前后端隔离 + 命令白名单 + capability 系统，优于 Electron 默认 XSS 风险面（知识库可能含用户上传的不可信文档，安全敏感）。
4. **移动端**：Tauri 2 支持 iOS/Android，为未来「手机上传照片/截图到知识库」留扩展空间。

**风险与缓解**：
- 风险：团队无 Rust 经验。缓解：Tauri 后端命令可极简（FS 读写 + 调 Python 解析脚本 + git 操作），核心逻辑用 TypeScript；或用 `tauri-plugin-shell` 调外部进程，Rust 侧仅做薄封装。若 Rust 门槛过高，**降级方案为 Next.js Web + 本地 Node 后端**（纯 TS 栈）。
- 风险：OS WebView 跨端渲染差异。缓解：GUI 不做像素级复杂渲染（主要是文件列表+上传+预览），差异可忽略。

---

### 决策点 C：文件解析

#### C-1 PDF 解析

| 维度 | MinerU | unstructured(OSS) | marker | LlamaParse |
|---|---|---|---|---|
| 准确度(OmniDocBench) | 95.39(vlm) / 86.47(pipeline) | 0.715-0.88(云版) | 8.1/10 | 0.835 |
| 格式覆盖 | PDF/DOCX/PPTX/XLSX/图片/网页 | 20+ 格式 | 仅 PDF | 多格式 |
| 本地运行 | CPU(16GB)或 GPU | 本地(OSS) | 本地 | 仅云 |
| 公式/表格 | LaTeX/HTML | 中 | 强(学术) | 强 |
| OCR | 109 语言, PP-OCRv6 | 有 | 有 | 有 |
| License | MinerU OSS(Apache 2.0 风格) | Apache 2.0(OSS) | MIT | 商业 |
| MCP 内置 | 有(Cursor/Claude/Windsurf) | 无 | 无 | 有(LangChain) |
| 活跃度 | 15k+ stars, v3.4.4(2026-07) | 高 | 中 | 高 |

数据来源：[PyPI mineru 3.4.1](https://pypi.org/project/mineru/3.4.1/)、[juejin MinerU 深度解析](https://juejin.cn/post/7656556949906915371)、[unstructured benchmarks](https://www.unstructured.io/benchmarks)、[blazedocs 2026-06](https://blazedocs.io/benchmarks)。

**推荐：MinerU（PDF 首选）。**

理由：
1. **多格式一站式**：原生支持 PDF/DOCX/PPTX/XLSX，无需为每种格式配不同工具，降低集成复杂度。
2. **License 解除地雷**：2026-04 从 AGPLv3 切到 Apache 2.0 风格许可，满足 V1 约束（此前 AGPLv3 是重大否决项）。
3. **内置 MCP server**：可直接暴露给 Claude Code/Cursor，与知识库 MCP server 形成解析+入库的协作链。
4. **纯 CPU 可跑**：pipeline 后端最低 16GB 内存，无 GPU 也可用，适合个人本地部署。
5. **双引擎**：pipeline（快、确定性、无幻觉）适合批量；vlm（高精度）适合复杂版式。

#### C-2 Word/Excel 解析

| 格式 | 推荐库 | 备选 | 理由 |
|---|---|---|---|
| Word(.docx) | **mammoth** | python-docx / docx2python | mammoth 直接输出语义化 HTML/Markdown，BSD-2 许可，Production/Stable；python-docx 偏格式操作 |
| Excel(.xlsx) | **pandas** | openpyxl | pandas `read_excel` 已封装 openpyxl 引擎，DataFrame→markdown 表格一行代码；openpyxl 用于需精细格式的场景 |
| 统一入口 | **office2md** | — | MIT，智能选择最佳转换器，支持 DOCX/XLSX/PPTX/PDF，内置 wiki builder，可作 Tauri 后端调用的单一命令 |

数据来源：[PyPI mammoth 1.12.0](https://pypi.org/project/mammoth/)、[PyPI office2md 0.5.6](https://pypi.org/project/office2md/)、[CSDN openpyxl vs pandas](https://blog.csdn.net/m0_56086190/article/details/157438928)。

**推荐组合**：Tauri 后端调 `office2md`（统一 CLI）作为默认入口；PDF 走 `MinerU`（质量更高）；Word/Excel 在 office2md 内部回落到 mammoth/pandas。这样 GUI 层只需一个「上传→调用 office2md/mineru→写入 raw/→触发 ingest」管道。

---

### 决策点 D：MCP Server 实现

#### D-1 各编码 Agent 的 MCP 支持现状（2026-07）

| Agent | MCP 支持 | 传输方式 | 配置方式 | 成熟度 | 来源 |
|---|---|---|---|---|---|
| **Claude Code** | 全面 | stdio/SSE/Streamable HTTP/WebSocket | `claude mcp add` / `.mcp.json` / `~/.claude.json` | 生产级 | [code.claude.com/docs/mcp](https://code.claude.com/docs/en/mcp) |
| **Claude Desktop** | 全面 | stdio + 远程 HTTP(Pro/Max/Team/Enterprise) | `claude_desktop_config.json` | 生产级 | [support.claude.com](https://support.claude.com/ja/articles/11503834) |
| **Trae CN** | 已接入 | stdio | `.trae/mcp.json` | 可用 | [CSDN 2026-07](https://blog.csdn.net/aidoudoulong/article/details/161085784) |
| **OpenCode / OpenClaw** | 已接入 | stdio | mcp.json | 可用 | [lobehub trae-mcp](https://lobehub.com/mcp/zxcalbert-traemcp) |
| **Cursor / Windsurf** | 全面 | stdio/HTTP | `.cursor/mcp.json` | 生产级 | 多源验证 |

**结论**：2026 年 MCP 已是编码 Agent 的事实标准接入方式，五条主线全部支持 stdio 本地 MCP server。知识库作为 MCP server 可被所有目标 Agent 调用，D 决策点可行性完全成立。

#### D-2 MCP SDK 选型

| 维度 | TypeScript SDK | Python SDK | Go SDK |
|---|---|---|---|
| Tier | 1（参考实现） | 1 | 1 |
| 类型安全 | 优秀(Zod) | 良好(Pydantic) | 良好(struct tags) |
| 生态 | npm, 全栈首选 | pip, ML/数据科学亲和 | 高性能微服务 |
| 新规范(2026-07-28) | v2 拆分包, beta | v2, beta | beta |
| 自动 server 生成 | Stainless 支持 | 仅客户端 | 仅客户端 |

数据来源：[modelcontextprotocol.io/docs/sdk](https://modelcontextprotocol.io/docs/sdk)、[blog.modelcontextprotocol.io 2026-07-28](https://blog.modelcontextprotocol.io/posts/sdk-betas-2026-07-28/)、[stainless MCP 对比](https://www.stainless.com/mcp/mcp-sdk-comparison-python-vs-typescript-vs-go-implementations/)、[ayautomate 2026-06](https://www.ayautomate.com/blog/mcp-server-development-guide)。

**推荐：自建则 TypeScript SDK；优先复用 enquire-mcp。**

#### D-3 知识库 MCP Server 应暴露的 Tools

基于 Karpathy 三大操作（Ingest/Query/Lint）+ 双索引 + 分类需求，推荐 tool 清单：

| Tool | 对应 Karpathy 操作 | 说明 |
|---|---|---|
| `kb_search` | Query | 混合检索(BM25+向量)，返回带引用的页面片段 |
| `kb_get_page` | Query | 按 path/标题读取完整 wiki 页面（支持 section 级） |
| `kb_ingest_source` | Ingest | 接收原始资料路径/内容，LLM 整理后写 wiki 页面 + 更新 index/log |
| `kb_write_experience` | （新增·持续进化） | Agent 在编码实践中沉淀经验卡片，写入 `wiki/experiences/`，待审核 |
| `kb_list_categories` | （新增·分类） | 列出领域分类树与各分类页面统计 |
| `kb_list_recent` | Query | 读 log.md 最近 N 条（时间导向导航） |
| `kb_lint` | Lint | 健康检查：矛盾/孤儿页/缺失交叉引用/过时声明 |
| `kb_health` | （运维） | 索引状态、文档数、最后 ingest 时间 |

#### D-4 现成 MCP Server 推荐

| 候选 | 推荐场景 | 优势 | 短板 |
|---|---|---|---|
| **enquire-mcp** | 中大规模、要最强检索 | 44 tools, BGE reranker, HNSW, PDF+OCR, 零云调用, SLSA-3 | Node 生态，需 npm, 模型下载 |
| **obsidian-mcp (Rust)** | 追求极致性能/单二进制 | 单二进制无依赖, Tantivy BM25, 18 tools | Rust 二次开发门槛, 无内置重排 |
| **markdown-vault-mcp** | Python 栈、中规模 | FTS5+语义, frontmatter 感知, 增量索引 | star 较少(18), 社区较小 |
| **knowledge-base-server** | 需要持续进化参考 | 三层记忆, 自学习管道, 生产验证 | 检索为 FTS5, 无向量重排 |

**推荐策略**：
- **快速启动**：直接用 `enquire-mcp` 指向 wiki 目录，零开发获得 search/ingest 能力。
- **定制化**：以 TypeScript SDK 自建薄 MCP server，复用 enquire-mcp 的检索内核（或回落 qmd），补齐 `kb_write_experience` / `kb_lint` 等知识库专属 tool。
- **与 Karpathy 兼容**：所有候选均操作 markdown 文件目录，不破坏 raw/wiki/schema 三层结构。

---

### 决策点 E：检索方案

| 维度 | 纯 index.md | qmd | markdown-vault-mcp | LanceDB |
|---|---|---|---|---|
| 零依赖程度 | 完全零依赖 | npm+3 GGUF(~2GB) | Python+可选 embedding | pip, 无服务进程 |
| 检索质量 | 中(小规模够) | 高(BM25+向量+LLM重排) | 高(FTS5+语义 RRF) | 高(向量, 需自配 BM25) |
| 延迟 | 即时(LLM 读索引) | 0.2s(BM25)/2-3s(混合) | 毫秒级(FTS5) | 毫秒级 |
| 维护成本 | 极低 | 低 | 低 | 中(版本文件清理) |
| 规模上限 | ~数百页 | 数千页 | 数千页 | 10w-100w |
| 与 Karpathy 关系 | 原方案默认 | 原方案推荐选项 | 第三方增强 | 超出原方案范围 |
| MCP 内置 | 无(LLM 直读) | 有 | 有 | 无(需自包) |

数据来源：[hermes-agent qmd 文档](https://hermes-agent.nousresearch.com/docs/user-guide/skills/optional/research/research-qmd)、[CSDN qmd 指南](https://blog.csdn.net/gitblog_00814/article/details/155018420)、[lobehub WikiMind](https://lobehub.com/mcp/hal-9909-llm-wikimind)、[yage.ai LanceDB](https://yage.ai/share/lancedb-selection-guide-en-20260327.html)、[腾讯云向量库对比](https://developer.cloud.tencent.com/article/2697120)。

**推荐：分档递进。**

- **小规模（<200 页）**：纯 `index.md`。Karpathy 原文明确：「在中等规模（~100 源，~数百页）下效果出奇地好，避免了 embedding RAG 基础设施」。零依赖，LLM 先读索引再钻取。
- **中规模（200-5000 页）**：`qmd` 或 `markdown-vault-mcp`。qmd 是 Karpathy 原方案钦定（「qmd 是个好选择：本地 BM25/向量混合搜索 + LLM 重排，有 CLI 和 MCP server」），与原方案无缝衔接。markdown-vault-mcp 适合 Python 栈。
- **大规模（>5000 页）**：`LanceDB` 嵌入式向量库。它是「向量搜索的 SQLite」——`pip install` 即用，无服务进程，Lance 格式基于 Parquet 可被 DuckDB/Pandas 直读，多模态（向量+元数据+原文）单文件存储。比 Chroma 多模态与版本控制更强，比 Milvus 轻量万倍（V4 约束）。

**演进路径**：index.md → qmd → LanceDB 三档可平滑切换，因存储层始终是 markdown 文件，检索层只换索引引擎不动数据。

---

### 决策点 F：持续进化机制

#### F-1 候选机制对比

| 机制 | 触发时机 | 自动化程度 | 防污染能力 | 与 Karpathy 兼容 |
|---|---|---|---|---|
| ① AGENTS.md 规定任务结束强制写经验卡片 | Agent 任务完成时 | 半自动(Agent 执行) | 弱(需审核) | 高(schema 层扩展) |
| ② MCP server 提供 `kb_write_experience` tool | Agent 主动调用 | 自动 | 中(可加门禁) | 高 |
| ③ git hook 自动触发整理 | commit/push 时 | 自动 | 弱 | 中 |
| ④ /dream 定期整理（dream loop） | 定时/cron | 自动 | 强(去重+质量评分) | 高(外部记忆层) |
| ⑤ 定期 Lint | 手动/定时 | 半自动 | 中 | 高（原方案 Lint 操作） |

#### F-2 业界实践参考（2026）

1. **Anthropic Dream Loop（2026-05 Code-with-Claude）**：4 层记忆模型，核心是第 4 层「外部记忆」（CLAUDE.md + `.dream/sessions/*.md` + `/dream` 子 agent + review gate）。Agent 每次运行写 session log，`/dream` 子 agent 读近期 log + CLAUDE.md 提 diff，经两 tier 审核门禁后单 commit 应用。来源：[hyperautomationlabs playbook](https://hyperautomationlabs.co/self-learning-agent-playbook.pdf)。
2. **Self-Improving Agent（2026-05）**：夜间 cron 审查 24h 会话日志，识别重复错误，写 skill 进 agents.md，30 天 token 消耗降 30-40%。来源：[eliteaiadvantage](https://eliteaiadvantage.com/blog/claude-code-agents-learn-mistakes-automatically)。
3. **knowledge-base-server 三层记忆**：Hot（活跃项目）/Warm（积累经验）/Cold（原始归档），自动区分信号与噪声。来源：[mcprepository](https://mcprepository.com/willynikes2/knowledge-base-server)。

**推荐：四件套组合（①+②+④+⑤）。**

```
Agent 编码实践
    │ 发现更好方案 / 踩坑
    ▼
② MCP kb_write_experience → 写经验卡片到 wiki/experiences/inbox/
    │ (frontmatter: status=pending, domain, confidence)
    ▼
① AGENTS.md 规则强制：任务收尾时若产生可复用经验必须调用 ②
    │
    ▼ (定时, 如每日)
④ /dream 整理：子 agent 读 inbox 经验 + 现有 wiki
    │ → 去重 / 合并 / 质量评分 / 提升为正式页面
    ▼
Review Gate（两 tier）:
    │  90% 自动(高 confidence 直接合并) + 10% 人工(低 confidence/跨域)
    ▼
git commit → log.md 追加条目 → index.md 更新
    │
    ▼ (周期性)
⑤ kb_lint 健康检查：矛盾/孤儿/过时声明
```

**防污染设计**：
- **版本控制**：所有经验卡片经 git，可回滚（Karpathy 原方案「wiki 就是 git 仓库」天然支持）。
- **两 tier 审核门禁**：高 confidence + 单域内自动合并；低 confidence / 跨域 / 矛盾触发人工审核（借鉴 Dream Loop）。
- **质量评分**：经验卡片携带 `use_count` / `confidence` / `date` frontmatter，`/dream` 据此决定提升/老化/删除（借鉴 Dream Loop schema）。
- **三层记忆**：inbox（待审）→ wiki/（正式）→ archive/（老化），借鉴 knowledge-base-server。

**与 Karpathy 兼容性**：完全兼容。Karpathy 的 Query 操作已提出「好答案应回写 wiki」，本机制将其从「Query 时回写」扩展到「Agent 工作流中持续沉淀」，schema 层（AGENTS.md）增加经验卡片规范即可。

---

### 决策点 G：分类管理

| 维度 | 目录树 | frontmatter tags | Dataview 查询 | 数据库索引 |
|---|---|---|---|---|
| 多归属 | 否(一文件一目录) | 是(多 tag) | 依赖前两者 | 是 |
| 层级 | 强(树) | 弱(扁平, 支持 a/b) | 依赖前两者 | 强(可任意) |
| 语义表达 | 弱(位置即归属) | 中(属性/状态) | 强(可组合查询) | 强 |
| LLM 友好 | 高(路径直观) | 高(YAML 易解析) | 中(需插件) | 低(脱离 markdown) |
| 跨工具 | 高(纯 FS) | 高(纯文本) | 低(Obsidian 专属) | 低(锁定) |
| 与 Karpathy 兼容 | 高 | 高 | 中 | 低 |

数据来源：[Obsidian Forum 分类对比](https://forum.obsidian.md/t/how-to-structure-notes-categories-tags-and-folders/103125)、[CSDN Dataview 指南](https://blog.csdn.net/gitblog_00545/article/details/160076073)、[Obsidian Forum Dataview 90% 用例](https://forum.obsidian.md/t/three-dataview-queries-that-cover-90-of-use-cases/109350)。

**推荐：混合方案（目录树为主 + frontmatter tags 为辅 + Dataview 为动态视图）。**

```
wiki/
├── coding/          ← 领域目录(主分类, 强归属)
│   ├── concepts/
│   ├── entities/
│   └── experiences/
├── emotions/        ← 情感领域
├── reading/         ← 读书笔记领域
├── index.md
└── log.md
```

每页 frontmatter：
```yaml
---
domain: [coding, reading]   # 横切多归属(tag)
type: concept               # concept/entity/source/experience
status: active              # 状态(tag)
date: 2026-07-22
sources: 3
---
```

理由：
1. **目录树**承担「物理存储 + 主领域归属」，对 LLM 与文件系统都直观（Karpathy 原方案的 index.md 即按类别组织）。
2. **frontmatter tags**承担「多归属 + 状态/属性横切」，解决目录树一文件一目录的限制（一篇读书笔记可同时属 reading 与 coding）。
3. **Dataview**承担「动态视图」（如「coding 域 status=draft 的所有经验」），仅在 Obsidian 内生效，不污染 markdown 本身，跨工具仍可用 tags。
4. **排除数据库索引**：违背 V2（markdown+git 存储）约束，且锁定工具链。

---

## 5. PoC 与关键发现

### 5.1 推荐 PoC 计划（最小验证集）

| 步骤 | 验证目标 | 工具 | 预期产出 |
|---|---|---|---|
| 1 | 基础 Karpathy 系统可跑 | Obsidian + git + AGENTS.md | raw/wiki/index.md/log.md 结构 |
| 2 | MCP 可被 Claude Code 调用 | enquire-mcp 指向 wiki/ | `kb_search` 返回带引用结果 |
| 3 | PDF 上传→解析→入库 | MinerU pipeline + kb_ingest | 一篇 PDF 生成 wiki 页面 + 更新索引 |
| 4 | 持续进化闭环 | kb_write_experience + /dream | 经验卡片经审核提升为正式页 |
| 5 | Trae CN 接入 | `.trae/mcp.json` 配 stdio | Trae 内可查询知识库 |
| 6 | Tauri GUI 上传壳 | Tauri + 调 office2md | 拖拽 Word→raw/→wiki 页面 |

### 5.2 关键发现（含致命项）

1. **[致命-已解除] MinerU License**：2026-04 前 MinerU 为 AGPLv3，对商业闭源不友好（V1 否决）。现已切 Apache 2.0 风格许可，**否决项解除**，可放心采用。来源：[juejin](https://juejin.cn/post/7656556949906915371)。
2. **[关键] MCP 规范 2026-07-28 候选版**：将移除 `initialize` 握手与协议级 session，转向无状态，支持简单轮询负载均衡。Python v2 / TypeScript v2 beta 已发布。**现有 stdio server 不受影响**（向后兼容），但新项目应关注 v2 迁移窗口。来源：[blog.modelcontextprotocol.io](https://blog.modelcontextprotocol.io/posts/sdk-betas-2026-07-28/)。
3. **[关键] qmd 模型体积**：首次运行下载 3 个本地 GGUF 模型共 ~2GB（embeddinggemma-300M + qwen3-reranker-0.6b + qmd-query-expansion-1.7B）。冷启动混合检索 ~19s，热启 ~2-3s。对纯 CPU 设备需评估可接受性。来源：[hermes-agent qmd](https://hermes-agent.nousresearch.com/docs/user-guide/skills/optional/research/research-qmd)。
4. **[注意] Tauri WebView 跨端差异**：Windows WebView2 / macOS WKWebView / Linux WebKitGTK 行为不完全一致。知识库 GUI 以表单+列表为主，风险低，但需三平台实测。
5. **[注意] mammoth Markdown 支持已废弃**：官方建议生成 HTML 再用独立库转 Markdown。office2md 内部已处理此转换，直接用 office2md 可规避。来源：[npm mammoth](https://www.npmjs.com/package/@xm721806280/mammoth)。
6. **[注意] LanceDB 版本文件增长**：每次写产生新版本文件，需应用层定期清理（写 cron）。S3 后端有内存放大案例（2GB 数据耗 16GB RAM）。本地磁盘模式无此问题。来源：[yage.ai](https://yage.ai/share/lancedb-selection-guide-en-20260327.html)。

### 5.3 异常场景行为

| 场景 | 推荐方案行为 | 降级策略 |
|---|---|---|
| 网络分区（云 LLM 不可达） | 本地 qmd/embedding 仍可检索；ingest 回退本地 LLM(Ollama) 或排队 | 标记经验卡片 status=pending，待网络恢复 |
| 磁盘满 | git commit 失败，ingest 中止 | MCP server 返回明确错误码，不写半成品 |
| 低质量经验注入 | 两 tier 门禁拦截，留 inbox 不提升 | 定期 Lint 标记 stale，人工清理 |
| Agent 并发写同一页 | git 冲突检测 | MCP server 串行化写操作（单写者模型，借鉴 Chroma） |

---

## 6. 风险与缓解（推荐方案 Top 3）

| # | 风险 | 等级 | 缓解措施 |
|---|---|---|---|
| 1 | **MCP 生态快速演化**：2026-07-28 规范候选版 + SDK v2，半年内可能有破坏性变更 | 中 | 锁定 SDK 稳定版（TS v1.x / Python mcp>=1.27,<2）；MCP server 保持薄封装，核心逻辑与协议解耦；关注 v2 正式发布后 6 个月迁移窗口 |
| 2 | **持续进化污染知识库**：低质量经验累积，wiki 退化 | 中高 | 强制两 tier 审核门禁 + use_count/confidence 老化机制 + 定期 Lint + git 可回滚；inbox 与正式 wiki 物理隔离 |
| 3 | **Tauri Rust 门槛**：团队无 Rust 经验，定制原生能力受阻 | 中 | Tauri 后端保持极薄（FS+shell+git），复杂逻辑全放 TypeScript/Python；预编译 Rust 二进制（如 obsidian-mcp）直接调用无需改 Rust；降级为 Next.js+Node 后端（纯 TS） |

### 备选方案切换触发条件

| 推荐方案 | 切换到 | 触发条件 |
|---|---|---|
| Tauri GUI | Next.js Web + Node 后端 | 2 周内 Tauri 原型无法跑通，或团队 Rust 门槛实测过高 |
| enquire-mcp | markdown-vault-mcp | enquire-mcp 在目标 wiki 规模下检索质量不达标，或 Node 依赖链与团队栈冲突 |
| MinerU | unstructured(OSS) | MinerU 在目标 PDF 类型（如纯中文扫描件）准确度不达标 |
| qmd(中规模) | LanceDB | wiki 页面突破 5000，qmd 检索延迟 P95 > 2s |
| 混合分层④ | 纯本地① | 用户确认不需要 GUI/多格式上传，仅需 Obsidian+MCP |

---

## 7. 最终推荐与下一步

### 7.1 整体技术栈推荐组合

```
┌─────────────────────────────────────────────────────┐
│  访问层                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Obsidian │  │ MCP Srv  │  │ Tauri GUI        │   │
│  │ (人工浏览)│  │(Agent调用)│  │ (上传/管理)       │   │
│  │ 图谱/编辑 │  │ enquire  │  │ office2md/MinerU │   │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │             │                 │              │
├───────┴─────────────┴─────────────────┴──────────────┤
│  存储层（不可变事实来源）                               │
│  wiki/  (markdown + git)                              │
│  ├── coding/  emotions/  reading/   ← 目录树分类       │
│  ├── experiences/inbox/             ← 持续进化入口     │
│  ├── index.md  log.md               ← 双索引          │
│  └── frontmatter tags               ← 横切分类        │
│  raw/   (不可变原始资料)                               │
│  AGENTS.md/CLAUDE.md  (schema)                        │
├──────────────────────────────────────────────────────┤
│  检索层（按规模分档）                                   │
│  小: index.md  →  中: qmd  →  大: LanceDB             │
└──────────────────────────────────────────────────────┘
```

| 层 | 推荐选型 | 与 Karpathy 兼容 |
|---|---|---|
| 存储 | markdown + git + Obsidian | 100%（原方案内核） |
| Agent 访问 | MCP server（优先 enquire-mcp，自建用 TS SDK） | 100%（原方案可选 qmd MCP） |
| 人工浏览 | Obsidian + Dataview | 100%（原方案载体） |
| GUI 管理 | Tauri v2（降级 Next.js） | 新增层，不破坏原方案 |
| PDF 解析 | MinerU（pipeline+vlm 双引擎） | 新增能力 |
| Word/Excel | office2md（内含 mammoth/pandas） | 新增能力 |
| 检索 | index.md → qmd → LanceDB 分档 | 100%（原方案 index.md/qmd） |
| 持续进化 | AGENTS.md 规则 + MCP ingest + /dream + Lint | 扩展原方案 Query 回写 |
| 分类 | 目录树 + frontmatter tags + Dataview | 100%（原方案按类别 index） |

### 7.2 核心推荐理由

1. **Karpathy 兼容性优先**：所有选型确保原方案三层架构、双索引、三大操作不被动摇。原方案是「wiki 持续复利的艺术品」，任何技术选型都应增强而非替代它。
2. **MCP 是多 Agent 调用的唯一正解**：2026 年五大编码 Agent 全线接入 MCP，知识库作为 MCP server 是「可被外部 Agent 调用」的标准化、零锁定方案，远优于私有 API。
3. **分档递进控制复杂度**：检索从零依赖 index.md 到 qmd 到 LanceDB，GUI 从 Obsidian 到 Tauri，均可在不推翻存储层的前提下平滑升级，避免过度工程。
4. **持续进化有成熟范式**：Dream Loop + 三层记忆 + 两 tier 门禁已是 2026 年社区验证的实践，非凭空设计。

### 7.3 下一步实施计划

| 阶段 | 周期 | 交付物 |
|---|---|---|
| **P0 基础系统** | 1 周 | wiki/ 目录结构 + AGENTS.md schema + index.md/log.md + git 仓库 |
| **P1 MCP 接入** | 1 周 | enquire-mcp 配置 + Claude Code/Trae CN 实测 search/ingest |
| **P2 解析管道** | 1 周 | MinerU + office2md 集成 + PDF/Word/Excel 样本入库 |
| **P3 持续进化** | 1 周 | kb_write_experience tool + /dream 命令 + 审核门禁 |
| **P4 GUI（可选）** | 2 周 | Tauri 上传壳 + 拖拽→解析→入库流程 |
| **P5 规模演进** | 按需 | index.md → qmd → LanceDB 切换 |

### 7.4 关键人员能力准备

- **MCP 开发**：TypeScript SDK + Zod schema（或 Python FastMCP）
- **Tauri**：基础 Rust（FS/shell 命令）+ 前端 React/Vue
- **解析管道**：Python（MinerU/office2md CLI 调用）
- **Obsidian/Dataview**：frontmatter 规范 + Dataview 查询语法

---

## 附录 A：量化验收矩阵（Phase 1 产出，全文引用基线）

见本文 §2.1。

## 附录 B：外部参考链接清单

### MCP 生态
- MCP 官方 SDK 列表：https://modelcontextprotocol.io/docs/sdk
- MCP 2026-07-28 候选规范 SDK beta：https://blog.modelcontextprotocol.io/posts/sdk-betas-2026-07-28/
- Claude Code MCP 文档：https://code.claude.com/docs/en/mcp
- MCP Server 开发指南 2026：https://www.ayautomate.com/blog/mcp-server-development-guide
- MCP SDK 对比(Python/TS/Go)：https://www.stainless.com/mcp/mcp-sdk-comparison-python-vs-typescript-vs-go-implementations/
- Trae/Claude/OpenCode MCP 部署实战：https://blog.csdn.net/aidoudoulong/article/details/161085784

### MCP 知识库 Server
- enquire-mcp：https://github.com/oomkapwn/enquire-mcp
- obsidian-mcp (Rust)：https://crates.io/crates/obsidian-mcp/2.0.0
- markdown-vault-mcp：https://pypi.org/project/markdown-vault-mcp/3.0.3/
- knowledge-base-server：https://mcprepository.com/willynikes2/knowledge-base-server
- mcp-obsidian-vault：https://www.jsdelivr.com/package/npm/mcp-obsidian-vault
- WikiMind (Karpathy 实现)：https://lobehub.com/mcp/hal-9909-llm-wikimind

### 检索
- qmd (tobi/qmd)：https://github.com/tobi/qmd
- qmd 指南：https://blog.csdn.net/gitblog_00814/article/details/155018420
- qmd Hermes skill：https://hermes-agent.nousresearch.com/docs/user-guide/skills/optional/research/research-qmd
- LanceDB 选型指南：https://yage.ai/share/lancedb-selection-guide-en-20260327.html
- 轻量向量库对比：https://developer.cloud.tencent.com/article/2697120
- LanceDB vs OpenSearch：https://www.lancedb.com/blog/opensearch-vs-lancedb-for-vector-search-query-cost-and-infrastructure

### GUI
- Tauri vs Electron 2026：https://rustify.rs/articles/rust-tauri-vs-electron-2026
- Electron vs Tauri 2026(中文)：https://blog.csdn.net/qq_21460781/article/details/156802161
- PkgPulse 对比：https://www.pkgpulse.com/guides/electron-vs-tauri-2026/raw.md

### 文件解析
- MinerU PyPI：https://pypi.org/project/mineru/3.4.1/
- MinerU 深度解析：https://juejin.cn/post/7656556949906915371
- unstructured benchmarks：https://www.unstructured.io/benchmarks
- PDF 解析对比 2026：https://blazedocs.io/benchmarks
- mammoth PyPI：https://pypi.org/project/mammoth/
- office2md PyPI：https://pypi.org/project/office2md/
- openpyxl vs pandas：https://blog.csdn.net/m0_56086190/article/details/157438928

### 持续进化
- Dream Loop Playbook：https://hyperautomationlabs.co/self-learning-agent-playbook.pdf
- Self-Improving Agent：https://eliteaiadvantage.com/blog/claude-code-agents-learn-mistakes-automatically
- Claude Code 持久记忆：https://www.mindstudio.ai/blog/how-to-add-persistent-memory-claude-code
- CLAUDE.md/AGENTS.md 深度：https://redreamality.com/blog/claude-md-agents-md-deep-dive/

### 分类管理
- Obsidian 分类对比：https://forum.obsidian.md/t/how-to-structure-notes-categories-tags-and-folders/103125
- Dataview 指南：https://blog.csdn.net/gitblog_00545/article/details/160076073
- Dataview 90% 用例：https://forum.obsidian.md/t/three-dataview-queries-that-cover-90-of-use-cases/109350

### Baseline
- Karpathy LLM Wiki 原方案：见本项目 [karpathy-LLM.md](file:///D:/s0611/code/Continuous-learning/karpathy-LLM.md)

---

> **报告结束**。本报告为 tech-selection-researcher 子 Agent 产出，供主 Agent 据此进行后续 ADR 编写与架构设计。所有结论均附可追溯链接，决策时间距本报告超 3 个月建议复核 MCP 规范与解析库版本。
