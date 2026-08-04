/**
 * API Key localStorage 加密存储工具（P7 安全债修复，ADR-013 增强）
 *
 * 背景：系统 keyring 是主存储，localStorage 是 keyring 不可用时的降级后备。
 * 此前降级用 `btoa(encodeURIComponent(key))` 明文 base64 存储——任何持 localStorage
 * 访问权限者（devtools、字符串扫描、意外备份导出）都能直接读取明文 API Key。
 * 本模块用 Web Crypto API（AES-GCM + PBKDF2）将明文加密为密文后再落盘。
 *
 * 威胁模型（诚实声明）：
 * - 防护对象：localStorage 明文泄露（简单字符串扫描 / atob 裸解码 / 误提交备份）。
 * - 不防护对象：持有前端 JS bundle 的攻者本地解密（派生种子随包分发，见 §限制）。
 *   真正的主存储仍是系统 keyring（OS 级加密，ADR-013），本模块仅将降级后备的
 *   安全下限从「明文 base64」提升到「AES-256-GCM 加密」。
 *
 * 格式：`kb-env:<base64(salt)>.<base64(iv)>.<base64(ciphertext)>`
 * - salt: 16 字节随机数（PBKDF2 盐，每次加密独立，防跨值密钥复用/预计算）
 * - iv: 12 字节随机数（AES-GCM 标准 iv 长度）
 * - ciphertext: AES-GCM 输出（含 16 字节认证标签，subtle 自动追加）
 * - `kb-env:` 前缀用于与旧 base64 明文格式区分，便于迁移检测。
 */

// 派生种子（随 bundle 分发的常量）。威胁模型见文件头：仅防明文泄露，不防御本地攻者。
const APP_SEED = "continuous-learning-kb:api-key:enc:v1";
// PBKDF2 迭代次数：提高暴力破解成本（desktop 场景 100k 适中，不影响单次读写体验）
const PBKDF2_ITERATIONS = 100_000;
// PBKDF2 盐长度（与 OWASP WebCrypto 实践一致，16 字节 CSPRNG）
const SALT_LENGTH = 16;
// 密文标识前缀（llm.ts 用它判断旧明文 → 新密文的迁移）
export const ENCRYPTED_PREFIX = "kb-env:";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: ArrayBuffer): string => new TextDecoder().decode(b);

/** ArrayBuffer → base64（规避大数组 StackOverflow，用逐字节拼接） */
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

/** base64 → Uint8Array */
function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * 由派生种子 + 随机盐派生 AES-256-GCM 密钥（PBKDF2-HMAC-SHA256）。
 * 盐随密文存储，每次加密独立，确保同一明文在不同时机产生不同密钥。
 */
async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const seed = await crypto.subtle.importKey(
    "raw",
    enc(APP_SEED),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    seed,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * 加密明文，返回 `kb-env:<base64(salt)>.<base64(iv)>.<base64(ciphertext)>` 格式密文。
 *
 * @param _provider - 厂商（仅用于区分 payload 归属的元信息；密钥完全由随机盐决定）
 * @param plaintext - 待加密明文（API Key）
 */
export async function encryptSecret(_provider: string, plaintext: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc(plaintext),
  );
  return `${ENCRYPTED_PREFIX}${bufToB64(salt)}.${bufToB64(iv)}.${bufToB64(cipher)}`;
}

/**
 * 解密密文，返回明文。
 *
 * @param _provider - 厂商（解密与加密一致时无需匹配；参数保留以兼容调用方签名）
 * @param payload - `kb-env:` 前缀密文
 * @throws 非 `kb-env:` 格式或 salt/iv/cipher 缺失时抛错；密文被篡改或密钥不匹配时
 *         AES-GCM 认证失败（OperationalError），由调用方捕获降级。
 */
export async function decryptSecret(_provider: string, payload: string): Promise<string> {
  if (typeof payload !== "string" || !payload.startsWith(ENCRYPTED_PREFIX)) {
    throw new Error("not an encrypted payload (missing kb-env: prefix)");
  }
  const parts = payload.slice(ENCRYPTED_PREFIX.length).split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new Error("malformed encrypted payload (missing salt, iv, or ciphertext)");
  }
  // 非法 base64 统一封装为可诊断错误（避免抛出原始 InvalidCharacterError）
  let salt: Uint8Array, iv: Uint8Array, cipher: Uint8Array;
  try {
    salt = b64ToBuf(parts[0]);
    iv = b64ToBuf(parts[1]);
    cipher = b64ToBuf(parts[2]);
  } catch {
    throw new Error("malformed encrypted payload (invalid base64)");
  }
  const key = await deriveKey(salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return dec(plain);
}

/** 判断 payload 是否为已加密格式（llm.ts 迁移检测用） */
export function isEncryptedPayload(payload: string | null | undefined): boolean {
  return typeof payload === "string" && payload.startsWith(ENCRYPTED_PREFIX);
}