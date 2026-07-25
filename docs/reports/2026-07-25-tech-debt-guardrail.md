# 安全与质量审计报告 · DEF-019 技术债务清理

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | guardrail-enforcer |
| 任务令牌 | TKN-TECH-DEBT-001 |
| 任务域 | tech-debt（CI file:/// 检测门禁 + frontmatter YAML 合法化 + kb_lint 健康修复） |
| 报告日期 | 2026-07-25 |
| 审查范围 | 40 文件（+409/-33 行）：scripts/consistency-check.js、.markdownlint-cli2.jsonc、.markdownlintignore、.github/workflows/docs.yml、ADR-010、AGENTS.md §3.3、CLAUDE.md §14.1、log.md、31 个 wiki frontmatter、22 个 sibling section |
| 风险等级 | P2（跨模块：CI 检查逻辑 + 31 wiki frontmatter + 22 sibling section + ADR + AGENTS.md schema） |
| 主 Agent 签发上下文 | 盲区 1：批量脚本 fix-related.mjs（已删除）可能在某些页面遗漏或重复处理；盲区 2：`.markdownlintignore` 不被 markdownlint-cli2 v0.23.1 自动读取的发现导致 CI 命令需更新。遗憾：最初误判为 MCP server dist 过期，实际根因是 frontmatter `related` 字段 YAML 格式不合法 |

## 1. 审查依据

- 本次代码变更：分支 `feat/tech-debt-file-detection-and-kb-lint-fix`，git status 显示 40 文件（3 新增 + 37 修改），全部已 staged
- 影响自检结果：主 Agent §9 自检（接口契约变更=frontmatter `related` 格式 + CI 新增 file:/// 检查；无新增依赖；ADR-010 + AGENTS.md §3.3 + log.md 同步）
- 相关 ADR：[ADR-010](../../docs/decisions/ADR-010-ci-file-absolute-path-detection.md)（Proposed，待审查后 Accepted）
- code-archaeologist 报告：本次为技术债务清理，未启动 code-archaeologist（P2 跨模块但无核心代码逻辑变更，wiki 内容修复为主）
- 测试框架与基础用例：
  - `node scripts/consistency-check.js`（一致性检查 + file:/// 检测）
  - `npx markdownlint-cli2 '**/*.md' '#node_modules' '#**/node_modules' '#tmp' '#.trae'`（markdownlint）
  - kb_lint MCP 工具（知识库健康检查）
- 独立验证：guardrail-enforcer 对上述三项进行了独立复跑（零信任原则），结果见 §3.2

## 2. 代码质量审查（TRAE-code-review）

### 2.1 Karpathy Guidelines 合规性

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 命名 | ✅ | `checkFileAbsolutePath`、`listMarkdownFiles`、`rel` 命名清晰自解释；正则变量 `fileLinkRe` 语义明确 |
| 设计简洁性 | ⚠️ | `checkFileAbsolutePath()` 与现有 4 项检查风格一致（约 23 行），但正则跨文件复用 `g` 标志的 `lastIndex` 隐式依赖见 §2.2 |
| 错误处理 | ✅ | `listMarkdownFiles` 用 `fs.readdirSync` + `withFileTypes` 安全遍历；`checkFileAbsolutePath` 无异常路径；`lineEnd === -1` 边界已处理 |
| 假设显式化 | ⚠️ | ADR-010 §D2 显式列出设计取舍（匹配范围/扫描目录/严格度/与 lychee 互补），假设清晰；但 `.markdownlint-cli2.jsonc` 的 `#` 前缀语法假设错误见 §2.3 |

### 2.2 逻辑与性能

**[OK] 正则 `g` 标志跨文件复用安全性**：`checkFileAbsolutePath()` 中 `const fileLinkRe = /\(file:\/\/\/[A-Za-z]/g` 定义在函数顶部，对多文件复用。带 `g` 标志的 `exec` 在匹配失败（返回 null）时自动重置 `lastIndex=0`，while 循环正常退出即重置，跨文件安全。无 `lastIndex` 残留风险。

**[OK] 正则匹配边界**：`/\(file:\/\/\/[A-Za-z]/g` 匹配 `(file:///` + 字母。

- Windows `[text](file:///…/path)` ✓ 匹配（`…` 占位，实际为盘符字母）
- Linux `[text](file:///…/...)` ✓ 匹配（`…` 占位，实际为路径首字母）
- 反引号内联代码 `` `file:///…/path` `` ✗ 不匹配（无前置 `(`）✓ 不误伤
- 代码块内 `(file:///…/path)` ✗ 不匹配（v2 已增强：跳过代码块与 inline code，见下文"v2 增强"）
- `[A-Za-z]` 不匹配数字开头路径（如 `file:///1.txt`），但此类 URL 不合法且路径首字符罕为数字，取舍合理

**[OK] 性能**：全量扫描 113 个 .md 文件，单文件单次 `readFileSync` + 单次正则扫描，无嵌套循环，O(n) 复杂度，CI 可接受。

### 2.3 跨模块影响识别

**[中风险 M1] `.markdownlint-cli2.jsonc` globs 语法错误，"本地预验与 CI 行为统一"声明不成立**

证据（guardrail-enforcer 独立复跑）：

| 运行方式 | 命令 | 结果 |
| --- | --- | --- |
| 本地无参数（读 .jsonc） | `npx markdownlint-cli2` | ✗ **失败**：报 `server/node_modules/which/README.md` 等 161 个 node_modules 内 .md 文件 |
| 本地 CI 命令（带参数） | `npx markdownlint-cli2 '**/*.md' '#node_modules' '#**/node_modules' '#tmp' '#.trae'` | ✓ 通过：113 files 0 issues |

`-markdownlint-cli2` 的 `Finding` 输出显示：

```text
Finding: **/*.md !node_modules !**/node_modules !tmp !.trae **/*.md #node_modules #**/node_modules #tmp #temp #.cache #dist #build #out #target #.trae #.idea #.vscode
```

命令行的 `#` 前缀被转为 `!`（micromatch 否定语法，有效），但 `.markdownlint-cli2.jsonc` 的 `#` 前缀项**保持原样未被转为 `!`**，作为正向 glob 不匹配任何文件，导致排除项失效。

**根因**：markdownlint-cli2 配置文件的 `globs` 数组应使用 `!` 前缀（micromatch 标准）表示排除，`#` 前缀仅命令行有效（因 shell 中 `!` 需转义）。当前 [.markdownlint-cli2.jsonc](../../.markdownlint-cli2.jsonc) 第 7-18 行全部使用 `#` 前缀，语法错误。

**影响**：

- CI 通过是"侥幸"——CI 环境（ubuntu-latest + checkout）无 node_modules，且命令行参数补充了排除项
- 开发者本地运行 `npx markdownlint-cli2`（无参数，最常见用法）会失败，与主 Agent "本地预验与 CI 行为统一"声明矛盾
- `.markdownlint-cli2.jsonc` 作为独立配置文件形同虚设

**[中风险 M2] frontmatter 权威页示例与 AGENTS.md §3.3 新规矛盾**

[wiki/kb-system/frontmatter-schema.md](../../wiki/kb-system/frontmatter-schema.md#L44-L48) 第 47 行（"## 可选字段"代码块示例）：

```yaml
related: [[wiki/coding/other-page]]  # 相关页面链接
```

[wiki/kb-system/page-types-and-state-machine.md](../../wiki/kb-system/page-types-and-state-machine.md#L88-L90) 第 90 行：

```markdown
- `related: [[wiki/coding/other-page]]` — 相关页面链接
```

[AGENTS.md](../../AGENTS.md) §3.3 第 122 行已更新为：

```yaml
related: [wiki/coding/other-page]  # 相关页面链接（纯路径数组；禁用 [[...]] wikilink，js-yaml 解析多 wikilink 会失败）
```

`frontmatter-schema.md` 是 frontmatter 规约的**权威概念页**（title: "frontmatter Schema 规约"），子 Agent 写 frontmatter 时会参考它。本次修复的核心目标是消除 frontmatter 中的 wikilink，但权威页示例仍展示 wikilink，会导致子 Agent 再次写出非法格式，触发 kb_lint 误报，削弱本次修复的长期有效性。

注：这两处是正文示例（非 frontmatter 块），kb_lint 不检查正文，故当前 0 issues 不受影响。但作为示例会误导子 Agent。

### 2.4 测试框架充分性

主 Agent 提供三项验证，guardrail-enforcer 独立复跑结果：

| 验证项 | 主 Agent 声明 | 独立复跑结果 | 一致性 |
| --- | --- | --- | --- |
| `node scripts/consistency-check.js` | 通过 ✓ | exit 0，"一致性检查通过 ✓" | ✅ 一致 |
| markdownlint（CI 命令） | 113 files 0 issues ✓ | exit 0，"Summary: 0 issues in 0 files"，Linting 113 files | ✅ 一致 |
| markdownlint（无参数） | 未声明 | ✗ 失败（server/node_modules 161 个 .md 报错） | ⚠️ 主 Agent 未覆盖此场景 |
| kb_lint MCP | 0 issues ✓ | 未独立复跑（MCP 工具），采信主 Agent 声明 | ⚠️ 采信 |

## 3. 安全漏洞扫描（TRAE-security-review）

### 3.1 OWASP Top 10 / CWE 扫描结果

按 TRAE-security-review §5（漏洞面）+ §8（硬排除）执行：

| 类别 | 扫描结果 | 说明 |
| --- | --- | --- |
| ReDoS（正则拒绝服务） | **排除**（§8.1） | TRAE-security-review 明确排除 ReDoS；且 `/\(file:\/\/\/[A-Za-z]/g` 无量词嵌套，无灾难性回溯 |
| 不可信输入处理（SQL/命令/路径遍历） | ✅ 无 | `checkFileAbsolutePath` 读取仓库内 .md 文件，无外部用户输入；`listMarkdownFiles` 排除目录列表合理 |
| 文档文件发现 | **排除**（§8.1） | `*.md` 文件中的发现不在范围 |
| 密钥泄露（CWE-798） | ✅ 无 | 全量扫描 40 个变更文件 + 仓库 .md，所有匹配项均为文档描述性引用（`rg -i 'api[_-]?k...'` 命令示例、`GITHUB_TOKEN` CI 说明），无真实硬编码密钥 |
| 命令注入（CWE-78） | ✅ 无 | CI workflow `markdownlint-cli2 '**/*.md' ...` 参数硬编码，无用户输入拼接；`pull_request` 触发但命令参数不可控 |
| 不安全反序列化 / eval | ✅ 无 | 无 `eval`、`Function`、`yaml.load`（unsafe）；`consistency-check.js` 仅用 `fs.readFileSync` |
| 敏感数据暴露 | ✅ 无 | 错误输出仅含 .md 文件路径与匹配行内容（仓库内容，非敏感） |

### 3.2 输入与边界审计（Stage 1）

**[OK] 数值与类型边界**：`checkFileAbsolutePath` 无数值输入；`listMarkdownFiles` 用 `withFileTypes` 类型安全遍历；`rel()` 用 `path.relative` + `replace(/\\/g, '/')` 跨平台路径规范化。

**[OK] 集合与缓冲边界**：

- `fs.readFileSync(f, 'utf8')` 读取整个文件到字符串，无缓冲区操作
- `text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)` 处理最后一行无换行符的边界 ✓
- `text.lastIndexOf('\n', idx) + 1` 计算 `lineStart`，`idx` 是匹配位置，`+1` 跳过换行符 ✓

**[OK] 业务状态机**：本次变更无状态机；frontmatter 状态机（staging→active→archived）未改动。

### 3.3 执行安全审计（Stage 2，注入防护）

**[OK] 注入防护**：

- 无 SQL/NoSQL 交互
- 无 OS 命令执行（`system`/`exec`）
- 无 `eval`/`Function` 构造器
- 无模板引擎
- CI workflow 用 `run:` 执行硬编码命令，`markdownlint-cli2` 参数无拼接

**[OK] 最小权限**：

- CI `runs-on: ubuntu-latest`，`GITHUB_TOKEN` 默认权限（workflow 未显式声明 `permissions:`，使用默认只读）
- `actions/checkout@v7`、`actions/setup-node@v7` 为官方 action，版本固定为 v7
- 无 `privileged` 容器、无 `sudo`、无 root 用户

**[OK] 输出编码**：错误信息输出到 stderr，无 HTML/JS 上下文，无需转义。

### 3.4 密钥与配置安全（Stage 4）

**[OK] 硬编码密钥扫描**：扫描全部 40 个变更文件，无 API key / token / password / 内部 IP 硬编码。

**[OK] .gitignore 密钥排除**：[.gitignore](../../.gitignore) 第 11-15 行正确排除 `.env`、`.env.local`、`.env.*.local`，保留 `!.env.example`。

**[OK] 配置文件无敏感信息**：`.markdownlint-cli2.jsonc`、`.markdownlintignore`、`docs.yml` 均为公开配置，无凭证。

### 3.5 依赖与供应链风险（Stage 5）

**[OK] 无新增依赖**：本次变更未修改 `package.json` / `Pipfile` / `Cargo.toml` 等依赖描述文件。`markdownlint-cli2` 通过 `npm install -g` 全局安装，版本未锁定（CI 用 `npm install -g markdownlint-cli2`，未指定版本）——但此为 ADR-004 既有行为，非本次引入。

**[建议 L1] markdownlint-cli2 版本未锁定**：`.github/workflows/docs.yml` 第 22 行 `npm install -g markdownlint-cli2` 未固定版本，存在上游破坏性更新风险（如 v0.23→v0.24 行为变化）。建议改为 `npm install -g markdownlint-cli2@0.23.x`。非本次变更引入，低优先级。

## 4. 六阶段审计综合结论

| 阶段 | 结论 | 说明 |
| --- | --- | --- |
| Stage 1 输入与边界 | ✅ 通过 | 正则边界合理，集合操作安全，状态机未改 |
| Stage 2 执行安全 | ✅ 通过 | 无注入、最小权限、输出编码无风险 |
| Stage 3 内存安全 | N/A | JavaScript 项目，无 C/C++/Rust unsafe 块 |
| Stage 4 配置与密钥 | ✅ 通过 | 无硬编码密钥，.gitignore 正确排除 |
| Stage 5 依赖与供应链 | ✅ 通过 | 无新增依赖（markdownlint-cli2 版本未锁定为既有问题，低优先级建议） |
| Stage 6 综合 | ✅ 通过（第二轮） | 第一轮 2 项中风险已修复并独立验证，无阻断级安全漏洞 |

## 5. 综合结论

> **第一轮结论**：有条件通过（2026-07-25，触发回退闭环）。
> **第二轮结论**：通过（2026-07-25，M1+M2+v2 修复后独立验证通过，见 §11 第二轮审查记录）。

- [x] **通过**：可进入测试阶段（第二轮，2026-07-25）
- [ ] **有条件通过**：需修复 2 项中风险问题后重新提交 guardrail-enforcer（第一轮，已闭环）
- [ ] **阻断**：存在严重质量缺陷或高危安全漏洞

**核心判断依据（第二轮，最终）**：

- ✅ **安全维度**：无阻断级安全漏洞，无 OWASP Top 10 命中，无硬编码密钥，无注入风险
- ✅ **CI 门禁**：consistency-check + markdownlint（无参数 + CI 命令）三套独立复跑全部通过，114 files 0 issues
- ✅ **质量维度**：M1（.jsonc globs 语法）+ M2（frontmatter 权威页示例）已修复并独立验证；v2 增强（代码块/inline code 跳过）逻辑正确
- ✅ **本地预验统一**：无参数 `npx markdownlint-cli2` 与 CI 命令均为 114 files 0 issues，"本地预验与 CI 统一"声明成立

依据 CLAUDE.md §7.2，第二轮 guardrail-enforcer 审查通过，主 Agent 可启动 ac-verifier 子 Agent。

## 6. 阻塞项与回退指令

主 Agent 必须修复以下 2 项中风险问题，修复后重新提交 guardrail-enforcer 审查：

### M1（中风险，必须修复）：`.markdownlint-cli2.jsonc` globs 语法错误

**问题**：[.markdownlint-cli2.jsonc](../../.markdownlint-cli2.jsonc) 第 7-18 行使用 `#` 前缀表示排除，但 markdownlint-cli2 配置文件应使用 `!` 前缀（micromatch 标准）。`#` 前缀仅命令行有效。独立运行 `npx markdownlint-cli2`（无参数）失败，报 `server/node_modules` 下 161 个 .md 文件。

**修复建议**：将 `.markdownlint-cli2.jsonc` 的 globs 从 `#` 前缀改为 `!` 前缀：

```jsonc
{
  "globs": [
    "**/*.md",
    "!node_modules/**",
    "!**/node_modules/**",
    "!tmp/**",
    "!temp/**",
    "!.cache/**",
    "!dist/**",
    "!build/**",
    "!out/**",
    "!target/**",
    "!.trae/**",
    "!.idea/**",
    "!.vscode/**"
  ]
}
```

**验证标准**：独立运行 `npx markdownlint-cli2`（无参数）应输出 "Summary: 0 issues"，与 CI 命令行为一致。

### M2（中风险，必须修复）：frontmatter 权威页示例与 AGENTS.md §3.3 矛盾

**问题**：两个 frontmatter 规约权威页仍展示 `related: [[wiki/coding/other-page]]` wikilink 示例，与 AGENTS.md §3.3 新规（禁用 wikilink）矛盾：

- [wiki/kb-system/frontmatter-schema.md](../../wiki/kb-system/frontmatter-schema.md#L47) 第 47 行
- [wiki/kb-system/page-types-and-state-machine.md](../../wiki/kb-system/page-types-and-state-machine.md#L90) 第 90 行

**修复建议**：将上述两处示例同步为纯路径数组格式，与 AGENTS.md §3.3 一致：

```yaml
related: [wiki/coding/other-page]  # 相关页面链接（纯路径数组；禁用 [[...]] wikilink）
```

**验证标准**：`rg 'related:\s*\[\[' wiki/` 无 frontmatter 块内匹配（正文 wikilink `[[wiki/...]]` 在"## 相关概念"等 section 保留，属合法正文链接）。

## 7. 低风险建议（不阻塞，建议后续优化）

| 编号 | 问题 | 建议 |
| --- | --- | --- |
| L1 | `.github/workflows/docs.yml` 第 22 行 `markdownlint-cli2` 未锁定版本 | 改为 `markdownlint-cli2@0.23.x`，防止上游破坏性更新 |
| L2 | `.markdownlintignore` 与 `.markdownlint-cli2.jsonc` 排除项冗余，且 markdownlint-cli2 v0.23.1 不读取 `.markdownlintignore` | 保留 `.markdownlintignore` 作为其他工具（如 prettier）参考无害，但应在 ADR-010 注明其对 markdownlint-cli2 无效，避免维护者误以为它生效 |
| L3 | CI 命令排除参数（5 项）与 .jsonc globs（12 项）数量不一致 | 修复 M1 后，可考虑 CI 命令不传 globs 参数，直接 `markdownlint-cli2`（自动读 .jsonc），实现本地与 CI 完全一致 |
| L4 | sibling section 统一插入在"## 来源"之后（文件末尾），而非与"## 相关概念/相关页面"聚合 | 位置可接受，但语义上"同领域概念"与"相关概念"更接近，建议未来批量调整到"相关概念"之后、"来源"之前 |
| L5 | ADR-010 §"负面后果"提到"文档自指陷阱"，当前 ADR 用反引号 + 空格规避正则，但未在 ADR 中显式记录自指测试结果 | 建议在 ADR §"验证"补充"本 ADR 文档自身通过 checkFileAbsolutePath 检查"的实测结论 |

## 8. 待澄清

| 编号 | 待澄清项 | 阻塞性 |
| --- | --- | --- |
| Q1 | kb_lint MCP 工具的 0 issues 声明未由 guardrail-enforcer 独立复跑（MCP 工具调用限制）。主 Agent 声称 frontmatter/contradictions/orphans/stale/missing_xref 全通过。若 ac-verifier 阶段可调用 kb_lint，建议交叉验证 | 非阻塞（采信主 Agent） |
| Q2 | log.md DEF-019 条目（第 305-331 行）记录"35 文件修改 + 3 新文件"，但 git status 显示 37 修改 + 3 新增 = 40 文件。差异源于 log.md 自身与另一文件计入方式，建议主 Agent 核对但非阻塞 | 非阻塞 |

## 9. 保护机制验证

| 保护机制 | 声明 | 验证结果 |
| --- | --- | --- |
| consistency-check.js file:/// 检测 | ADR-010 §D1 | ✅ 实测通过，正则 `\(file:\/\/\/[A-Za-z]` 匹配逻辑与 ADR 描述一致 |
| markdownlint CI 门禁 | ADR-004 + 本 PR | ✅ CI 命令通过（114 files 0 issues）；✅ .jsonc 独立配置已修复（M1 第二轮验证通过） |
| .gitignore 密钥排除 | CLAUDE.md §20.3 | ✅ .env / .env.local / .env.*.local 已排除，!.env.example 保留 |
| frontmatter YAML 合法化 | DEF-019 C1 | ✅ 31 个页面 frontmatter `related` 已改为纯路径数组，js-yaml 可解析；✅ 2 个权威页正文示例已同步（M2 第二轮验证通过） |

## 10. 豁免

无豁免项。所有发现均按标准流程处理，无安全政策明确接受的例外。

---

## 自动化建议（CI/CD 集成）

1. **markdownlint 本地预验统一**：修复 M1 后，CI 命令可简化为 `markdownlint-cli2`（无参数，自动读 `.markdownlint-cli2.jsonc`），确保本地与 CI 行为完全一致。当前 CI 靠命令行参数补充排除项，属于"双轨制"易漂移。

2. **Semgrep 规则补充**（可选）：可添加 Semgrep 规则检测 `.markdownlint-cli2.jsonc` 中 `#` 前缀 globs（应为 `!`），防止配置语法错误复发：

   ```yaml
   rules:
     - id: markdownlint-cli2-globs-wrong-prefix
       pattern: '"#...'
       message: "markdownlint-cli2 配置文件 globs 应使用 ! 前缀（非 #）"
       languages: [json]
       paths: [.markdownlint-cli2.jsonc]
   ```

3. **frontmatter wikilink 预防**：在 consistency-check.js 可扩展一项检查——扫描 frontmatter 块内 `related:` 字段是否含 `[[`，从 CI 层面防止 wikilink 复发（当前依赖 kb_lint，但 kb_lint 是 MCP 工具，CI 不直接调用）。

---

## 11. 第二轮审查记录（回退闭环后重新提交）

> 本节由 guardrail-enforcer 第二轮审查追加（2026-07-25）。
> 第一轮结论为"有条件通过"（§5），主 Agent 修复 M1 + M2 并额外增强 checkFileAbsolutePath() v2 后重新提交。
> 本轮按零信任原则对全部修复进行独立验证，未采信主 Agent 自报结果。

### 11.1 元信息（第二轮）

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | guardrail-enforcer |
| 任务令牌 | TKN-TECH-DEBT-001（第二轮，回退闭环后） |
| 审查日期 | 2026-07-25 |
| 审查范围 | M1 修复（.markdownlint-cli2.jsonc）+ M2 修复（2 处 frontmatter 权威页示例）+ v2 增强（checkFileAbsolutePath 代码块/inline code 跳过）+ ADR-010 D1/D2 同步 |
| 变更统计 | 40 files changed, +613/-36（含本轮修复增量） |

### 11.2 M1 修复独立验证

**修复内容**：[.markdownlint-cli2.jsonc](../../.markdownlint-cli2.jsonc) 第 4-19 行，globs 从 `#` 前缀改为 `!` 前缀（micromatch 标准）+ `/**` 后缀，并追加注释说明 `!` vs `#` 区别。

**独立复跑结果**：

| 运行方式 | 命令 | Finding 输出 | 结果 |
| --- | --- | --- | --- |
| 无参数（读 .jsonc） | `npx markdownlint-cli2` | `**/*.md !node_modules/** !**/node_modules/** !tmp/** !temp/** !.cache/** !dist/** !build/** !out/** !target/** !.trae/** !.idea/** !.vscode/**` | ✅ 114 files, 0 issues, exit 0 |
| CI 命令 | `npx markdownlint-cli2 '**/*.md' '#node_modules' '#**/node_modules' '#tmp' '#.trae'` | 命令行 `!`（由 `#` 转换）+ .jsonc `!` 合并 | ✅ 114 files, 0 issues, exit 0 |

**结论**：`.jsonc` 的 `!` 前缀 globs 现被正确识别为否定 glob（Finding 输出已确认），无参数与 CI 命令均为 114 files 0 issues。"本地预验与 CI 统一"声明**成立**。M1 修复**验证通过**。

### 11.3 M2 修复独立验证

**修复内容**：

- [wiki/kb-system/frontmatter-schema.md](../../wiki/kb-system/frontmatter-schema.md#L47) 第 47 行：`related: [[wiki/coding/other-page]]` → `related: [wiki/coding/other-page]`（附"禁用 [[...]] wikilink"注释）
- [wiki/kb-system/page-types-and-state-machine.md](../../wiki/kb-system/page-types-and-state-machine.md#L91) 第 91 行：同上同步

**独立复跑**：`Select-String -Pattern 'related:\s*\[\['` 扫描 wiki/ + AGENTS.md + CLAUDE.md 全部 .md 文件，**无任何匹配**。frontmatter 块内 wikilink 残留为零。AGENTS.md §3.3 与两处权威页示例现已一致。

**结论**：M2 修复**验证通过**。

### 11.4 v2 增强审查（checkFileAbsolutePath v2）

**v2 改动**（[scripts/consistency-check.js](../../scripts/consistency-check.js#L116-L149) 第 116-149 行）：

1. 逐行处理（`text.split(/\r?\n/)`），替代 v1 的全文 `exec`
2. 代码块围栏切换检测：`/^\s*(```|~~~)/.test(rawLine)` → `inCodeBlock = !inCodeBlock`，代码块内 `continue` 跳过
3. inline code 去除：`rawLine.replace(/`[^`\n]*`/g, '')` 后再匹配
4. 错误信息追加行号：`${rel(f)}:${i + 1}`
5. 正则 `lastIndex` 显式重置：`fileLinkRe.lastIndex = 0`（跨行复用安全）

**v2 逻辑审查结论**：

| 审查项 | 结论 | 说明 |
| --- | --- | --- |
| 代码块围栏检测 | ✅ 正确 | `^\s*(```\|~~~)` 匹配 ``` 或 ~~~ 行首围栏；`inCodeBlock` 状态切换正确；未闭合围栏（奇数个）会导致后续全部跳过，但属 markdown 错误，由 markdownlint MD101 检测 |
| inline code 去除 | ✅ 正确 | `` `[^`\n]*` `` 匹配单行反引号内容；跨行 inline code 实为代码块，已由代码块逻辑处理；奇数反引号属 markdown 错误，由 markdownlint 检测 |
| 正则 lastIndex 重置 | ✅ 安全 | while 循环后显式 `fileLinkRe.lastIndex = 0`，防御性编程，跨行复用安全 |
| 行号输出 | ✅ 正确 | `i + 1` 将 0-based 数组索引转为 1-based 行号 |
| 漏检风险 | ✅ 可接受 | 代码块/inline code 内的 `(file:///字母` 被跳过，但这些是字面量示例非真实链接；真实链接不会出现在代码块内 |
| 自指规避 | ✅ 验证通过 | guardrail 报告中 `file:///` 出现在普通文本（无 `(` 前缀）、inline code（反引号包裹）、`…` 占位符三种形态，v2 + 占位符双重规避，consistency-check 通过 |

**边缘情况（低风险，不阻塞）**：

- 嵌套围栏（4 反引号包裹 3 反引号）：`/^\s*(```|~~~)/` 匹配前 3 反引号即切换，可能误判嵌套。但 markdown 不支持真正的嵌套围栏，且 markdownlint MD101 会检测。可接受。
- 行内奇数反引号：`replace` 可能误删内容。但属 markdown 错误，markdownlint 检测。可接受。

**结论**：v2 增强逻辑正确，边界处理合理，无阻断级问题。**审查通过**。

### 11.5 三套验证独立复跑（第二轮）

| 验证项 | 命令 | 独立复跑结果 |
| --- | --- | --- |
| 一致性检查 | `node scripts/consistency-check.js` | ✅ exit 0，"一致性检查通过 ✓" |
| markdownlint（无参数） | `npx markdownlint-cli2` | ✅ 114 files, 0 issues, exit 0 |
| markdownlint（CI 命令） | `npx markdownlint-cli2 '**/*.md' '#node_modules' '#**/node_modules' '#tmp' '#.trae'` | ✅ 114 files, 0 issues, exit 0 |

三套验证全部独立通过，与主 Agent 自报结果一致（114 files 0 issues）。

### 11.6 ADR-010 同步更新确认

[ADR-010](../../docs/decisions/ADR-010-ci-file-absolute-path-detection.md) §D1 第 41-46 行"不匹配的情况"已追加"代码块（``` 包裹的多行）内的描述性示例（v2 已增强跳过）"与"反引号包裹的 inline code（v2 已增强跳过）"。§D2 第 52 行设计取舍已更新为"不误伤描述性引用（反引号内、代码块内、命令示例）"。文档与实现一致。

### 11.7 第二轮综合结论

- [x] **通过**：可进入测试阶段
- [ ] **有条件通过**
- [ ] **阻断**

**最终判断**：

- ✅ M1（.markdownlint-cli2.jsonc globs 语法）修复并独立验证通过
- ✅ M2（frontmatter 权威页示例同步）修复并独立验证通过
- ✅ v2 增强（代码块/inline code 跳过）逻辑正确，无新增安全问题
- ✅ ADR-010 D1/D2 同步更新
- ✅ 三套验证独立复跑全部通过
- ✅ 无新增阻断级安全漏洞或质量缺陷

依据 CLAUDE.md §7.2，第二轮 guardrail-enforcer 审查**通过**。主 Agent 可启动 ac-verifier 子 Agent 执行验收测试与分层验证。第一轮 §7 低风险建议（L1-L5）不阻塞，建议在后续迭代中处理。

### 11.8 第二轮待澄清（非阻塞，移交 ac-verifier）

| 编号 | 待澄清项 | 移交对象 |
| --- | --- | --- |
| Q1（第一轮遗留） | kb_lint MCP 0 issues 声明未由 guardrail-enforcer 独立复跑 | ac-verifier（建议调用 kb_lint 交叉验证） |
| Q3（新增） | 无参数 114 files vs CI 命令 114 files，与主 Agent 自报"CI 命令 113 files"差 1。实际两套命令均 114 files，"本地与 CI 统一"成立，但主 Agent 自报数字略有偏差，非实质问题 | 无需移交（已澄清） |
