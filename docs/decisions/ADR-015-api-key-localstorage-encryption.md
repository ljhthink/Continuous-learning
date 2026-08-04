# ADR-015: API Key localStorage 降级存储加密（Web Crypto API）

| 项目 | 内容 |
| --- | --- |
| 状态 | Accepted |
| 日期 | 2026-08-05 |
| 决策者 | 主 Agent（经 guardrail-enforcer 审查） |
| 关联文档 | ADR-013（LLM 集成策略）、ARCH、PRD |
| 风险等级 | P2 |

## 背景（Context）

ADR-013 确立 API Key 双层存储：系统 keyring 为主、localStorage 为降级后备。
此前降级后备用 `btoa(encodeURIComponent(key))` 明文 base64 落盘——任何持
localStorage 访问权限者（devtools、字符串扫描、浏览器扩展、误提交备份）都能
直接读出明文 API Key。技术债快照标记为「🔴 中风险，P7 优先修复」。

浏览器场景下引入新安全依赖（如密码学库）会增大包体与供应链风险，故优先评估
内置 Web Crypto API。

## 决策（Decision）

**localStorage 降级后备改为 Web Crypto API 加密存储**，新增
`frontend/src/lib/crypto-utils.ts`：

- 算法：**AES-256-GCM**（认证加密，防篡改）+ **PBKDF2-HMAC-SHA256**（100k 迭代）。
- 存储格式：`kb-env:<base64(salt)>.<base64(iv)>.<base64(ciphertext)>`。
  - salt：16 字节 CSPRNG 随机数，每次加密独立，随密文存储（防跨值密钥复用/预计算）。
  - iv：12 字节随机数（AES-GCM 标准）。
  - `kb-env:` 前缀用于与旧 base64 明文区分，便于迁移检测。
- 迁移：旧 base64 明文经 `isEncryptedPayload` 判定后，就地解码并重加密为密文。
- 主存储架构不变：keyring 仍是唯一主存储，本改造仅提升降级后备的安全下限。

**诚实威胁模型（本 ADR 的关键声明）**：派生种子 `APP_SEED` 随前端 bundle 分发，
属公知常量，因此本实现是**混淆层**而非完整加密——能阻止 devtools/字符串扫描/
误备份导出等「偶然提取」，**不能**阻止持有前端 bundle 的攻者在本地复现派生并解密。
这正是浏览器端 localStorage 加密的固有限制（代码与派生材料必然到达客户端）。
真正的主存储安全由 OS keyring 保证（ADR-013）。

## 备选方案（Alternatives）

| 方案 | 优点 | 缺点 / 否决理由 |
|---|---|---|
| 继续 base64 明文 | 零改动、零成本 | 明文可被直接读取，正是本 ADR 要解决的缺陷 |
| 引入第三方加密库（如 crypto-js） | 传统、文档多 | 新增依赖增大包体与供应链攻击面；Web Crypto 为内置标准，性能高 10-20 倍，无依赖 |
| 改用 keyring 且移除 localStorage 降级 | 单一主存储更简单 | 破坏 ADR-013 的降级容错（Windows keyring 可能失败）；用户 Key 会在 keyring 故障时丢失 |
| 主密码派生密钥（用户每次输入） | 真加密（私密口令不在 bundle） | 破坏「无感自动登录」体验；Tauri desktop 场景用户不期望每次输入主密码 |

## 后果（Consequences）

- 正面后果：
  - localStorage 中的 API Key 不再明文可读，防偶然提取。
  - 随机盐 + 认证标签使密文不可被针对单 provider 预计算密钥破解，且篡改即认证失败。
  - 旧数据自动迁移，无用户感知。
- 负面后果 / 代价：
  - 加密/解密为异步 PBKDF2（100k 迭代），单次读写有轻微延迟（desktop 场景可忽略）。
  - **安全增益有上限**：不能防持有 bundle 的本地攻者（见威胁模型）。
  - 存储格式变更，需保证与旧格式迁移逻辑自洽（已由测试覆盖）。
- 需要同步更新的文档或代码：
  - `crypto-utils.ts` 集成进 `llm.ts`（writeLocalStorageKey / readLocalStorageKey）。
  - 更新 `llm.ts` 迁移逻辑与注释（格式描述、provider 定位为元信息）。
  - 为 `consistency-check.js` 补充工具数断言单测（本轮一并落地）。

## 参考

- 调研：Web Crypto API AES-GCM + PBKDF2 最佳实践（OWASP、MDN、真实项目 accordproject/template-playground PR#753）。
- 上游报告：`docs/reports/2026-08-05-api-key-crypto-archaeology.md`。
