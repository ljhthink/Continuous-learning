# 安全与质量审计报告 · API Key localStorage 加密改造

> 由 `guardrail-enforcer` 子 Agent 产出，独立于主 Agent 编码流程。

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | guardrail-enforcer |
| 任务令牌 | TKN-APIKEY-CRYPTO-001 |
| 任务域 | API Key localStorage 降级存储加密（Web Crypto API AES-256-GCM + PBKDF2） |
| 报告日期 | 2026-08-05 |
| 审查范围 | `frontend/src/lib/crypto-utils.ts`、`frontend/src/lib/llm.ts`、`scripts/consistency-check.js`、`frontend/src/lib/__tests__/crypto-utils.test.ts`、`scripts/__tests__/consistency-check.test.js`、`.github/workflows/docs.yml`、`docs/decisions/ADR-015-*.md`、`frontend/src/lib/__tests__/p5-r3-integration.test.ts` |
| 风险等级 | P2 |
| 主 Agent 签发上下文 | 最没把握：是否引入明文落盘/密钥硬编码、consistency-check 重构后 CLI 行为是否一致；盲区：XSS/注入/密钥泄露、crypto-utils 异步错误处理是否吞异常 |

## 审查依据

- 本次代码变更：`git diff HEAD`（5 个已跟踪文件 + 3 个新文件，见范围）
- 相关 ADR：`docs/decisions/ADR-015-api-key-localstorage-encryption.md`
- 测试框架：Vitest（frontend）+ Node `node:test`（scripts）
- 技能调用：TRAE-code-review（质量）+ TRAE-security-review（安全）

---

## 1. 代码质量审查（TRAE-code-review）

### 1.1 Karpathy Guidelines 合规性

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 命名 | ⚠️ | `provider` 参数名暗示参与密钥作用域，实际完全未参与派生（见 Q2）；其余命名清晰 |
| 设计简洁性 | ⚠️ | `bufToB64`/`b64ToBuf` 逐字节手写 base64 可读性低于 `Uint8Array↔base64` 封装，但规避大数组栈溢出是合理取舍；`decryptSecret` 的 `provider` 为死参数 |
| 错误处理 | ⚠️ | `readLocalStorageKey` 外层 catch 静默吞掉解密失败（主 Agent 盲区确认属实，见 Q1） |
| 假设显式化 | ✅ | 威胁模型、格式、迁移逻辑均在文件头与 ADR-015 显式声明，诚实度高 |

### 1.2 逻辑与性能

- PBKDF2 100k 迭代 + 随机盐 + 随机 IV 的密码学参数配置正确（AES-256-GCM / 12B IV / 16B salt / SHA-256）。
- 每次加密独立盐/IV，同明文产生不同密文（测试已覆盖），防跨值密钥复用与重放。
- 性能：100k 迭代在 desktop 场景单次读写毫秒级，可接受，ADR-015 已声明。

### 1.3 跨模块影响识别

- `llm.ts` 的 `saveApiKey`/`loadApiKey` 双层存储路径全部切换为加密读写，`deleteApiKey` 同步清理，迁移后旧 provider 条目被移除，无遗留明文。
- `llmStore.ts`（`llm-settings`）仅存非敏感偏好（llmMode/provider/baseUrl/model/limits），**不含 apiKey**，确认无并行明文路径。
- `p5-r3-integration.test.ts` 同步更新为空字符串/旧格式迁移断言，与加密行为一致。

### 1.4 测试框架充分性

- crypto-utils 15 例：往返、Unicode/特殊字符、空串、随机性、反篡改、格式错误、provider 元信息、前缀识别，覆盖充分。
- consistency-check 12 例：validateToolCount 全分支（英文/中文/历史最大值/缺失/多文档）覆盖。
- 旧 base64 → 加密迁移路径由 `p5-r3-integration.test.ts` L116-130 覆盖（seed 旧明文 → 迁移后验证 `kb-env:` 前缀 + 解密还原）。
- 覆盖缺口：无「三段非空但非法 base64 字符」用例（见 Q3）；无「解密失败时是否告警」断言（与 Q1 相关）。

---

## 2. 安全漏洞扫描（TRAE-security-review）

### 2.1 OWASP Top 10 / CWE 扫描结果

| 类别 | 结论 |
| --- | --- |
| 注入（SQL/命令/代码/模板） | ✅ 无新增注入面；无 eval/exec/拼接查询；LLM prompt 内容注入按 §8 排除 |
| 敏感数据暴露 | ✅ 全程无明文 API Key 落盘（grep 确认仅加密写入 + llmStore 非敏感设置）；日志仅输出错误对象，不含 Key |
| 崩溃与输入边界 | ✅ `decryptSecret` 的 atob 异常被 `readLocalStorageKey` 外层 catch 拦截，无未处理拒绝 |
| 密钥与配置 | ⚠️ `APP_SEED` 硬编码派生种子（见 S1，ADR-015 已诚实声明为混淆层） |

**结论：无 HIGH / 无阻断级安全漏洞。**

### 2.2 输入与边界审计

- `decryptSecret`（crypto-utils.ts L106-116）：三段拆分 + 非空校验 + `kb-env:` 前缀前置校验；非法 base64 由 atob 抛错并被调用方 catch，无崩溃。
- `consistency-check.js` 的 `countRe` 正则仅做数字提取与比较，无 ReDoS 风险（规则 §8 排除）。

### 2.3 执行安全审计（注入防护）

- 无命令执行、无动态代码、无模板引擎执行。通过。

### 2.4 密钥与配置安全

- **无明文 API Key 落盘**：`writeLocalStorageKey` 先 `encryptSecret` 再 `setItem`；迁移路径仅内存持有明文后立即重加密。
- **无生产密钥硬编码**：`APP_SEED` 是随 bundle 分发的公知派生种子（sec.2.5 详述），非 keyring 私密材料。
- **`.gitignore`**：frontend 目录存在 `.gitignore`；本次新增 `coverage/` 为未跟踪目录，需确认已忽略（见待澄清）。

### 2.5 密钥派生与混淆边界（诚实声明，非阻断）

`APP_SEED`（crypto-utils.ts L23）硬编码于源码，随前端 bundle 分发，属**公知常量**。因此 localStorage 加密是**混淆层**而非完整加密：能阻止 devtools/字符串扫描/误备份导出等「偶然提取」，**不能**阻止持有 bundle 的本地攻者复现派生并解密。这正是浏览器端 localStorage 加密的固有限制（代码与派生材料必然到达客户端）。该限制已在 ADR-015 威胁模型显式声明，真正主存储安全由 OS keyring 保证。按安全审查规则 §8（客户端 JS 加密局限），不构成阻断项，但建议在 UI/文档中避免给用户「已完全加密」的过度安全感。

---

## 3. CLI 行为一致性验证（consistency-check.js 重构）

- `require.main === module` 守卫正确：直接执行 `node scripts/consistency-check.js` 时运行全部 7 项检查并保留退出码；被 `require` 导入时跳过副作用。
- **实测**：`node scripts/consistency-check.js` → `一致性检查通过 ✓`，`EXIT=0`。
- **实测**：`node --test scripts/__tests__/consistency-check.test.js` → 12/12 通过。
- 纯函数提取 `validateToolCount` 与原逻辑等价（原 inline 逻辑逐行对比，无行为偏差）。
- 次要：`module.exports` 同时导出有副作用的 `checkMcpToolCount`（依赖模块级 `errors`/`ROOT`），单测未使用，属设计冗余（见 Q4）。

---

## 4. 测试验证结果（实测）

| 命令 | 结果 |
| --- | --- |
| `cd frontend && pnpm test` | 13 文件 / 319 用例全通过（含 crypto 15 例、p5-r3 迁移 10 例） |
| `node --test scripts/__tests__/consistency-check.test.js` | 12/12 通过 |
| `node scripts/consistency-check.js` | exit 0，`一致性检查通过 ✓` |

---

## 5. 综合结论

- [x] **有条件通过**：可进入测试/合并流程，但需先修复 Q1（必须）并评估 Q2-Q5/S1（建议）。

理由：无阻断级安全漏洞（无明文落盘、无注入、无密钥泄露、无硬编码生产密钥），测试全绿，CLI 行为一致；但 `readLocalStorageKey` 静默吞掉解密失败存在「用户 API Key 静默丢失且不可诊断」的功能风险，须在合并前修复。

---

## 6. 阻塞项与回退指令

### 必须修复（合并前）

**Q1 · 高优先级 · [llm.ts:L399-408](../../frontend/src/lib/llm.ts#L399-L408)**
`readLocalStorageKey` 外层 catch 静默吞掉**所有**异常（含 AES-GCM 认证失败），与「未保存（null）」无法区分。若未来 `APP_SEED` 变更/数据损坏，用户 API Key 将静默丢失且日志无任何痕迹，主 Agent 自问的「吞异常」盲区在这里得到实证。
修复建议：在 `stored` 存在但 `decryptSecret` 抛错时，`console.warn` 记录结构化告警（含 provider、不打印明文）后返回 null；仅「无条目」静默返回 null。

### 建议修复（非阻断）

**Q2 · [crypto-utils.ts:L80-85](../../frontend/src/lib/crypto-utils.ts#L80-L85)**
`encryptSecret`/`decryptSecret` 的 `provider` 参数实际未参与密钥派生（密钥完全由随机盐决定，测试已断言 provider 可互换）。此参数名暗示「密钥按 provider 作用域隔离」，与实际不符，易误导后续维护者。建议删除参数或在 JSDoc 显著标注「纯元信息，不影响密钥」。

**Q3 · [crypto-utils.ts:L106-126](../../frontend/src/lib/crypto-utils.ts#L106-L126)**
`b64ToBuf` 对非法 base64 抛原始 `InvalidCharacterError`，错误信息不友好。虽被调用方 catch，但作为导出 API 建议在 `atob` 外包一层 try 并统一抛「invalid base64 in payload」；并为「三段非空但非法 base64」补充单测。

**Q4 · [consistency-check.js:L277-282](../../scripts/consistency-check.js#L277-L282)**
`module.exports` 导出了有副作用的 `checkMcpToolCount`（依赖模块级 `errors`/`ROOT`），单测仅需纯函数 `validateToolCount`。建议仅导出纯函数，避免误用导致共享状态污染。

**Q5 · [llm.ts:L443-448](../../frontend/src/lib/llm.ts#L443-L448)**
`saveApiKey` 未拦空 Key：`apiKey=""` 时现会加密空串为 truthy 密文落盘（旧行为存 falsy `""`），`loadApiKey` 解密得 `""` 后仍视为无 Key，但残留 truthy 条目会反复触发 custom legacy 迁移扫描。建议在 `saveApiKey` 入口对空/空白 Key 直接 return，避免无效落盘。

**S1 · [crypto-utils.ts:L22-29](../../frontend/src/lib/crypto-utils.ts#L22-L29)（已接受限制，记录不阻断）**
`APP_SEED` 硬编码派生种子 = 仅混淆。已获 ADR-015 豁免声明，真实保护由 keyring 承担。建议在设置面板避免向用户宣称「已加密存储」的绝对化表述。

---

## 7. 待澄清

1. **`frontend/coverage/` 未跟踪目录**：`git status` 显示 `?? frontend/coverage/`。需确认 `frontend/.gitignore` 已忽略 `coverage/`，否则测试覆盖率产物可能被误提交（含路径信息，虽非密钥，但属构建产物污染）。→ **已解决**：根 `.gitignore` 已加入 `coverage/` 与 `frontend/coverage/`（L30-31），`git check-ignore -v` 命中，`git ls-files` 无已跟踪文件被误忽略。
2. **`docs/reports/2026-08-05-api-key-crypto-archaeology.md`**：ADR-015「参考」引用了该上游报告，但本次 `git status` 未见其新增/存在确认，需主 Agent 确认该报告已入库且命名符合 `YYYY-MM-DD-<task>-<type>.md`（否则 `consistency-check.js` 的 reports 命名检查会失败）。→ **已解决**：该考古报告已落盘且命名符合规范，README 与 ADR 索引均已更新。

---

## 9. 复审结论（delta review，2026-08-05）

| 项 | 状态 |
|---|---|
| Q1 解密失败告警 | ✅ 已修复 |
| Q2 provider 死参数标注 | ✅ 已修复 |
| Q3 非法 base64 封装 + 单测 | ✅ 已修复 |
| Q4 consistency-check 仅导出纯函数 | ✅ 已修复 |
| Q5 saveApiKey 空 Key 拦截 + 测试 | ✅ 已修复 |
| 待澄清 1（coverage 忽略） | ✅ 已解决 |
| 待澄清 2（考古报告落盘） | ✅ 已解决 |
| 阻断 B1（报告自身 file:/// 链接） | ✅ 已修复为相对路径 |

**验证**：`frontend && pnpm test` 320/320 通过；`node --test scripts/__tests__/consistency-check.test.js` 12/12 通过；`node scripts/consistency-check.js` exit 0。

**结论：通过**。执行 Agent：guardrail-enforcer；任务令牌：TKN-APIKEY-CRYPTO-001。

---

## 8. 自动化建议（CI/CD 集成）

建议将本护栏逻辑固化为 CI 门禁，避免回归：

```yaml
# 在 CI（如 docs.yml 或独立 guardrail job）新增
- name: Secret scanning (gitleaks)
  run: gitleaks detect --redact --source .
- name: Crypto/migration unit tests
  run: cd frontend && pnpm test
- name: Consistency-check unit tests + CLI
  run: node --test scripts/__tests__/ && node scripts/consistency-check.js
- name: Semgrep crypto/secret rules
  run: semgrep --config "p/owasp-top-ten" --config "p/javascript" . || true
```

要点：`gitleaks` 拦截硬编码密钥/明文 token；`semgrep` 的 `javascript` 规则可捕获 `eval`/不安全 base64/密钥落盘模式；两端测试套件作为提交门禁，任一失败即阻断。

---

## 10. delta 复审（DEF-001/DEF-002 修复，2026-08-05）

> 本节点仅针对 ac-verifier 报告的 2 处 TS6133 未使用参数错误（构建阻断项）的修复做
> 增量复审。修复内容：`frontend/src/lib/crypto-utils.ts` 的 `encryptSecret`/`decryptSecret`
> 参数名由 `provider` 改为 `_provider`（下划线前缀豁免 `noUnusedParameters`），仅参数改命，
> 无逻辑/接口/行为变化。JSDoc 同步更新。调用方无需改动。

### 10.1 验证结果（实测）

| 命令 | 结果 |
| --- | --- |
| `cd frontend && npx tsc --noEmit` | exit 0，0 错误（DEF-001/DEF-002 已消除，无新增告警） |
| `cd frontend && pnpm test` | 13 文件 / 320 用例全通过（含 crypto-utils 16 例、p5-r3 迁移 10 例） |
| `node --test scripts/__tests__/consistency-check.test.js` | 12/12 通过 |
| `node scripts/consistency-check.js` | exit 0，`一致性检查通过 ✓` |

### 10.2 调用点命名引用核对（针对性审查 1）

全部 `encryptSecret`/`decryptSecret` 调用点均为**位置传参**，无任何命名实参引用，改名不破坏任何调用：

- `frontend/src/lib/llm.ts`：L376 `encryptSecret(provider, plaintext)`、L401 `decryptSecret(provider, stored)`、L421 `encryptSecret(provider, plain)`。
- `frontend/src/lib/__tests__/crypto-utils.test.ts`：L24/29/30/36/46/47/52/53/57/58/64/66/72/96/103/106/111/114/120 全部位置传参。
- `frontend/src/lib/__tests__/p5-r3-integration.test.ts`：L129 `decryptSecret("custom", customStored!)` 位置传参。

TS 配置 `frontend/tsconfig.json` L18-19 开启 `noUnusedLocals`/`noUnusedParameters`；`tsc --noEmit` 0 错误即证明改名完全豁免未使用参数告警且未引入新的未使用符号。

### 10.3 ADR-015 一致性核对（针对性审查 2）

ADR-015 L61 声明「provider 定位为元信息」，与 `_provider` 的 JSDoc 标注（crypto-utils.ts L83「仅用于区分 payload 归属的元信息；密钥完全由随机盐决定」、L101「解密与加密一致时无需匹配；参数保留以兼容调用方签名」）完全一致。改名不改变任何对外语义，仅消除编译器告警。grep 确认无其他文件声明未使用的 provider 受影响参数。

### 10.4 本次 diff 新增问题审查

- 仅参数改名，`encryptSecret`/`decryptSecret` 函数体、密钥派生、返回格式、抛错逻辑零改动。
- 无死代码：`_provider` 虽未在函数体内使用，但属签名保留参数（兼容调用方），非冗余代码。
- JSDoc `@param` 名与实参名一致（`_provider`），无文档错位。
- 无新安全面：改名不触及任何输入边界、密钥派生或落盘路径。

### 10.5 delta 复审结论

**结论：通过。** 无阻断级、无高危问题；改名纯净、无行为改变、无命名引用破坏、无新告警，全部验证全绿。执行 Agent：guardrail-enforcer；任务令牌：TKN-APIKEY-CRYPTO-001。
