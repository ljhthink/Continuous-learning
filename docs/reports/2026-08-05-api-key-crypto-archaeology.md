# 代码考古与理解报告 — API Key 存储模块

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | code-archaeologist |
| 任务令牌 | TKN-APIKEY-CRYPTO-001 |
| 日期 | 2026-08-05 |
| 范围 | frontend/src/lib/llm.ts、crypto-utils.ts、ipc.ts、src-tauri/src/lib.rs、相关测试与全部调用方 |
| 性质 | 纯研究，未改动代码 |

## 1. 模块职责

API Key 存储采用双层架构（P5-R3 既定设计 + P7 安全债修复）：

- 前端组件层（SettingsPanel / ChatPanel / DropZone / FileList）→ `await` 调用服务层。
- 服务层 `llm.ts`：`saveApiKey` / `loadApiKey` / `deleteApiKey`。
  - `writeLocalStorageKey` / `readLocalStorageKey`（P7 新增）→ 委托 `crypto-utils.ts`。
  - 经 `ipc.ts` → Tauri invoke（`save_api_key` 等）→ Rust keyring。
- `crypto-utils.ts`：AES-256-GCM + PBKDF2，`kb-env:<salt>.<iv>.<ciphertext>` 三段格式。

双层语义：keyring（OS 级加密）为主，localStorage 为降级后备；P7 将降级后备从明文 base64 提升为 AES-GCM 加密。

## 2. 关键依赖

| 依赖 | 位置 | 说明 |
|---|---|---|
| 全局 `crypto.subtle`（Web Crypto） | crypto-utils.ts | AES-GCM + PBKDF2，依赖 Node 19+/现代浏览器 |
| `@tauri-apps/api/core` invoke | ipc.ts | 懒加载，`isTauri()` 判环境 |
| Rust `keyring` crate | src-tauri/src/lib.rs | `Entry::new("continuous-learning-kb", provider)` |

## 3. 全部调用点清单

| 调用方 | 调用 | await | 异步化影响 |
|---|---|---|---|
| SettingsPanel.tsx | loadApiKey / saveApiKey / deleteApiKey | 是（.then/await） | 安全 |
| ChatPanel.tsx | loadApiKey | await | 安全 |
| DropZone.tsx | loadApiKey | await | 安全 |
| FileList.tsx | loadApiKey | await | 安全 |
| llm.ts（custom 迁移） | saveApiKey | await | 安全 |

**结论**：所有调用方均正确 await，无同步/非 Promise 假设。无任何组件绕过 llm.ts 直接读 `llm-key-*` 且假设 base64 明文（`llm-key-*` 仅出现在 llm.ts 与测试）。

## 4. 潜在风险点（探查时发现，已在本轮修复）

| 风险 | 说明 | 处置 |
|---|---|---|
| 注释格式漂移 | llm.ts 旧注释写 `kb-env:<iv>.<cipher>` 两段，实际三段 | 已修正注释 |
| "provider 隔离"措辞不符 | provider 不参与密钥派生（随机盐决定），注释言"隔离" | 已改为"归属元信息" |
| 迁移异常静默丢 key | `decodeURIComponent(atob())` 抛错时整体 catch 返回 null | 已补内层 catch，损坏值返回 null 并告警 |
| 解密失败不可诊断 | 密文存在但解密失败与"未保存"无法区分 | guardrail Q1：解密失败 console.warn（不打印明文） |
| 非法 base64 报原始错误 | b64ToBuf 的 atob 抛 InvalidCharacterError | guardrail Q3：封装统一错误 |
| 空 Key 残留 truthy 密文 | saveApiKey 未拦空 Key | guardrail Q5：入口拦截空 Key |

## 5. 迁移与格式兼容性（已验证安全）

- 旧 base64 明文字符集（`A-Za-z0-9+/=`）不含 `:` 与 `.`，不可能被误判为 `kb-env:` 三段格式。
- `isEncryptedPayload` 前缀判断与 `readLocalStorageKey` 迁移分支逻辑自洽，无二义冲突。

## 6. 总体结论

异步化改造无破坏；无绕过解密逻辑的读取路径；格式迁移兼容；潜在风险点已定位并在 guardrail 阶段修复。
