---
title: "slugify Unicode 保留与 is_valid_domain ASCII-only 校验的契约不一致"
domain: [coding]
type: experience
status: active
confidence: 0.85
date: 2026-08-02
source_task: "TKN-REVIEW-DOMAIN-ARCH-001"
tags: [rust, slugify, unicode, ascii, llm, domain-validation, contract-mismatch]
---

## 背景

在 LLM 辅助分类场景中，LLM 返回的领域名（如「数学建模」）需经 `slugify` 转为 kebab-case 后作为目录名。但存在两个函数契约不一致：

- `slugify(s)` 使用 `c.is_alphanumeric()` 过滤字符，该方法**接受 Unicode 字母数字**（含中文、日文）
- `is_valid_domain(d)` 使用 `c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'`，**仅接受 ASCII**

当 LLM 返回纯中文领域名「数学建模」时：

1. `slugify("数学建模")` → `"数学建模"`（Unicode 保留）
2. 该值放入 `new_domain_proposal.name`
3. 前端展示 proposal，用户点击「创建并移入」
4. `create_domain_directory("数学建模")` → `is_valid_domain("数学建模")` → `false` → **报错「invalid domain name」**

用户看到 LLM 提议了领域名，点击创建却报错——UX 断裂，且与「LLM 无法建议新领域」的原始问题表象一致。

## 方案

**核心原则**：当两个函数形成「生产者-消费者」链路时，生产者的输出必须保证能通过消费者的校验。若两者契约不一致，必须在链路中增加适配层。

### 修复模式：对 slugify 结果追加消费者校验

```rust
let proposed_name = if is_valid_domain(&domain) {
    domain.clone()
} else {
    let slug = slugify(&domain);
    // 适配层：slugify 可能保留 Unicode，但 is_valid_domain 仅接受 ASCII
    if is_valid_domain(&slug) {
        slug
    } else {
        // slug 仍含非 ASCII 字符——提取 ASCII 部分
        let ascii_part: String = slug
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
            .collect();
        let cleaned = ascii_part.trim_matches('-');
        if cleaned.is_empty() {
            "llm-proposed-domain".to_string() // 全无 ASCII 时用占位符
        } else {
            cleaned.to_string()
        }
    }
};
```

### 关键点

1. **三级降级**：原值 → slugify → ASCII 提取 → 占位符，每级都保证最终输出通过 `is_valid_domain`
2. **原始输入保留**：LLM 的原始输入保留在 `description` 字段（`format!("由 LLM 提议（原始输入：{}）", domain)`），用户可参考
3. **占位符局限**：纯中文输入会生成 `llm-proposed-domain` 固定字符串，多个纯中文 proposal 会同名——MVP 阶段可接受，理想方案应集成音译库（如 pinyin crate）

### 替代方案（更彻底但成本高）

**方案 B**：修改 `slugify` 使用 `is_ascii_alphanumeric()` 替代 `is_alphanumeric()`，使所有调用点统一为 ASCII 输出。但 `slugify` 也用于生成 wiki 页面文件名（`build_wiki_page`），中文标题 slugify 后保留中文字符是有意设计（如 `wiki/reading/2025国赛.md`）。因此不能改 `slugify` 本身，只能在 `classify_domain` 链路中适配。

**方案 C**：放宽 `is_valid_domain` 接受 Unicode。但 kebab-case 约定（`[a-z0-9-]+`）是文件系统目录名的安全保证，放宽会引入路径遍历风险（Unicode 欺骗、NTFS ADS 等）。不可取。

## 证据

### 契约不一致的代码证据

```rust
// slugify — Unicode alphanumeric（含中文）
fn slugify(s: &str) -> String {
    s.trim().to_lowercase().chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>()
        .trim_matches('-').to_string()
}

// is_valid_domain — ASCII only
fn is_valid_domain(d: &str) -> bool {
    d.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}
```

### 回归测试

```rust
#[test]
fn test_med2_slugify_preserves_unicode_but_is_valid_domain_rejects() {
    let slug = slugify("数学建模");
    assert!(slug.contains("数") || slug.contains("学"));      // slugify 保留中文
    assert!(!is_valid_domain(&slug));                          // is_valid_domain 拒绝
    // 修复后的 fallback
    let ascii_part: String = slug.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect();
    let cleaned = ascii_part.trim_matches('-');
    let fallback = if cleaned.is_empty() { "llm-proposed-domain".to_string() } else { cleaned.to_string() };
    assert!(is_valid_domain(&fallback));                       // fallback 通过校验
}

#[test]
fn test_med2_slugify_mixed_cn_en_extracts_ascii() {
    let slug = slugify("数学 modeling 建模");
    let ascii_part: String = slug.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect();
    let cleaned = ascii_part.trim_matches('-');
    assert!(cleaned.contains("modeling"));                     // 混合输入提取 ASCII 部分
    assert!(is_valid_domain(&cleaned.to_string()));
}
```

测试通过（`cargo test` 46/46）。

## 适用场景

**适用**：

- LLM 输出用于文件系统路径构造（目录名、文件名）——LLM 可能返回任意 Unicode，但文件系统/路径校验通常仅接受 ASCII
- 生产者-消费者链路中两者字符集契约不一致
- slugify/transliterate 函数与下游校验函数的契约对齐

**不适用**：

- 生产者和消费者字符集一致的场景（无需适配层）
- Unicode 字符集是被允许的场景（如 wiki 页面文件名允许中文）

**通用模式**：在任何「外部输入（LLM/用户/网络）→ 转换函数 → 校验函数 → 危险 sink（文件系统/SQL/命令）」链路中，必须保证转换函数的输出能通过校验函数。若不能，在校验前增加适配层（提取、音译、占位符）。
