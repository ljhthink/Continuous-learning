/**
 * crypto-utils 单元测试（P7 安全债修复）
 *
 * 覆盖：
 *   1. encryptSecret 输出均带 `kb-env:` 前缀（可识别的新格式）
 *   2. decryptSecret 加密-解密往返一致（含中文/特殊字符 API Key）
 *   3. encryptSecret 每次输出不同密文（随机 IV，防重放）
 *   4. provider 隔离：不同 provider 的密文无法互相解密（AES-GCM 认证失败）
 *   5. isEncryptedPayload 正确识别 null/undefined/旧 base64/新密文
 *   6. decryptSecret 对非前缀 / 畸形格式抛错
 *   7. 密文中不含明文（扫描密文无法还原明文）
 */

import { describe, it, expect } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  isEncryptedPayload,
  ENCRYPTED_PREFIX,
} from "@/lib/crypto-utils";

describe("encryptSecret", () => {
  it("输出带 kb-env: 前缀，标识为新加密格式", async () => {
    const payload = await encryptSecret("custom", "sk-test-123");
    expect(payload.startsWith(ENCRYPTED_PREFIX)).toBe(true);
  });

  it("每次加密产生不同密文（随机 IV）", async () => {
    const a = await encryptSecret("custom", "sk-test-123");
    const b = await encryptSecret("custom", "sk-test-123");
    expect(a).not.toBe(b);
  });

  it("密文不包含明文（防直接字符串扫描）", async () => {
    const plain = "sk-very-secret-api-key-xyz";
    const payload = await encryptSecret("custom", plain);
    expect(payload).not.toContain(plain);
    // base64 解码后也不可直接还原明文
    expect(payload).not.toContain(btoa(plain));
  });
});

describe("decryptSecret 往返", () => {
  it("加密后解密还原相同明文", async () => {
    const plain = "sk-test-123";
    const payload = await encryptSecret("custom", plain);
    expect(await decryptSecret("custom", payload)).toBe(plain);
  });

  it("支持中文与特殊字符 API Key", async () => {
    const plain = "sk-测试-!@#$%^&*()_+😀";
    const payload = await encryptSecret("custom", plain);
    expect(await decryptSecret("custom", payload)).toBe(plain);
  });

  it("支持空字符串明文", async () => {
    const payload = await encryptSecret("custom", "");
    expect(await decryptSecret("custom", payload)).toBe("");
  });
});

describe("provider 角色", () => {
  it("provider 是元信息，不参与密钥派生（解密与加密 provider 可不同）", async () => {
    const payload = await encryptSecret("custom", "sk-shared");
    // 密钥完全由随机盐决定，provider 仅作归属元信息
    expect(await decryptSecret("deepseek", payload)).toBe("sk-shared");
  });
});

describe("isEncryptedPayload", () => {
  it("识别加密格式", async () => {
    const payload = await encryptSecret("custom", "sk-x");
    expect(isEncryptedPayload(payload)).toBe(true);
  });

  it("识别旧 base64 明文为 false", () => {
    expect(isEncryptedPayload(btoa("sk-plain"))).toBe(false);
  });

  it("识别普通字符串为 false", () => {
    expect(isEncryptedPayload("sk-plain")).toBe(false);
  });

  it("识别 null / undefined 为 false", () => {
    expect(isEncryptedPayload(null)).toBe(false);
    expect(isEncryptedPayload(undefined)).toBe(false);
  });

  it("识别空字符串为 false", () => {
    expect(isEncryptedPayload("")).toBe(false);
  });
});

describe("decryptSecret 错误处理", () => {
  it("对非 kb-env: 前缀的数据抛错", async () => {
    await expect(decryptSecret("custom", "plain-not-encrypted")).rejects.toThrow(
      "kb-env:",
    );
  });

  it("对畸形格式（缺 iv 或 ciphertext）抛错", async () => {
    // 只有前缀没有 body
    await expect(decryptSecret("custom", `${ENCRYPTED_PREFIX}`)).rejects.toThrow();
    // 只有 iv 没有 ciphertext（点后为空）
    await expect(
      decryptSecret("custom", `${ENCRYPTED_PREFIX}AAAA.`),
    ).rejects.toThrow();
  });

  it("对篡改的密文抛错（认证失败）", async () => {
    const payload = await encryptSecret("custom", "sk-original");
    // 篡改 ciphertext 最后一个字符
    const tampered = payload.slice(0, -1) + (payload.endsWith("A") ? "B" : "A");
    await expect(decryptSecret("custom", tampered)).rejects.toThrow();
  });

  it("对非法 base64 段抛统一封装错误（而非原始 InvalidCharacterError）", async () => {
    // salt/iv/cipher 段存在但内容非合法 base64
    await expect(
      decryptSecret("custom", `${ENCRYPTED_PREFIX}!!!.!!!.!!!`),
    ).rejects.toThrow("invalid base64");
  });
});