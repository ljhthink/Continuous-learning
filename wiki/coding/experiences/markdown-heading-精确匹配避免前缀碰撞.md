---
title: "Markdown heading 精确匹配：避免子串搜索导致的前缀碰撞"
domain: [coding]
type: experience
status: active
confidence: 0.9
date: 2026-08-02
source_task: "TKN-REVIEW-DOMAIN-ARCH-001"
tags: [rust, markdown, string-matching, prefix-collision, index-file]
---

## 背景

在知识库的 index.md 中，每个领域有一个 `## {domain}` heading 分组。当需要删除领域 `design` 时，实现用 `content.find("\n## design")` 子串搜索定位 heading。但 Rust `str::find` 执行的是子串匹配而非整词匹配——当 index.md 同时存在 `## design` 和 `## design-resources` 两个分组时，`find("\n## design")` 会命中 `\n## design-resources` 的前缀，导致：

- 删除 `design` 时误删 `design-resources` 分组
- 创建 `design` 时误判 `design-resources` 已存在而跳过追加

这是「前缀关系命名」+「子串搜索」组合下的经典数据完整性缺陷。同样的缺陷同时存在于 `remove_domain_from_index`（删除路径）和 `create_domain_directory`（创建路径），是同构问题。

## 方案

**核心原则**：对结构化文本（markdown heading、INI section、HTTP header 等）做匹配时，必须验证「行尾边界」，不能仅靠子串搜索。

### 通用模式：找到后验证下一个字符

```rust
let section_header = format!("\n## {}", name);
let header_len = section_header.len();
let mut search_from = 0;
while let Some(idx) = content[search_from..].find(&section_header) {
    let abs_idx = search_from + idx;
    // 验证 heading 后的字符为换行或字符串结尾（精确匹配行尾边界）
    let after = &content[abs_idx + header_len..];
    if after.is_empty() || after.starts_with('\n') {
        // 命中精确匹配
        return Some(abs_idx + 1);
    }
    // 前缀碰撞，继续搜索
    search_from = abs_idx + 1;
}
return None;
```

### 关键点

1. **`while` 循环而非单次 `find`**：前缀碰撞时需继续搜索下一个匹配位置
2. **`search_from = abs_idx + 1`**：严格递增，保证循环终止（`abs_idx + 1 > search_from`）
3. **边界验证**：`after.is_empty() || after.starts_with('\n')` 确保匹配的是完整 heading 行
4. **ASCII 安全**：`name` 经 `is_valid_domain` 校验为纯 ASCII，字节切片 `&content[abs_idx + header_len..]` 对齐字符边界，无 panic 风险

### 替代方案（更简洁但适用场景窄）

若确定 heading 后必有换行，可用 `content.find(&format!("\n## {}\n", name))` 直接带换行匹配。但若 heading 是文件最后一个分组（无尾部换行），此方案会漏匹配。

## 证据

### 修复前（缺陷代码）

```rust
// remove_domain_from_index — 子串匹配，前缀碰撞
let section_header = format!("\n## {}", name);
let start_idx = match content.find(&section_header) {
    Some(idx) => idx + 1,
    None => return Ok(()),
};
```

### 修复后（精确匹配）

```rust
let section_header = format!("\n## {}", name);
let header_len = section_header.len();
let mut start_idx: Option<usize> = None;
let mut search_from = 0;
while let Some(idx) = content[search_from..].find(&section_header) {
    let abs_idx = search_from + idx;
    let after = &content[abs_idx + header_len..];
    if after.is_empty() || after.starts_with('\n') {
        start_idx = Some(abs_idx + 1);
        break;
    }
    search_from = abs_idx + 1;
}
```

### 回归测试

```rust
#[test]
fn test_remove_domain_from_index_prefix_collision() {
    let index_content = "# Index\n\n## coding\n- [[wiki/coding/foo]]\n\n## design\n- [[wiki/design/bar]]\n\n## design-resources\n- [[wiki/design-resources/baz]]\n\n## reading\n- [[wiki/reading/qux]]\n";
    fs::write(tmp.join("index.md"), index_content).unwrap();
    remove_domain_from_index(tmp.to_str().unwrap(), "design").unwrap();
    let updated = fs::read_to_string(tmp.join("index.md")).unwrap();
    assert!(!updated.contains("## design\n"));      // design 被移除
    assert!(updated.contains("## design-resources")); // design-resources 保留
}
```

测试通过（`cargo test` 46/46）。

### 同构问题同步修复

`create_domain_directory` 中的 `content.contains("## {name}")` 存在相同缺陷，用 `match_indices().any()` + 边界验证同步修复：

```rust
let already_has_section = content
    .match_indices(&section_header)
    .any(|(idx, _)| {
        let after = &content[idx + header_len..];
        after.is_empty() || after.starts_with('\n')
    });
```

## 适用场景

**适用**：

- Markdown heading 匹配（`##`、`###` 等）
- INI/TOML section 匹配（`[section]`）
- HTTP header 匹配（`Header-Name:`）
- 任何「名称 + 分隔符」的结构化文本匹配，且名称可能存在前缀关系

**不适用**：

- 自然语言全文搜索（本就需要子串匹配）
- 名称保证全局唯一且无前缀关系（如 UUID）

**语言无关性**：此模式适用于所有提供子串搜索的语言（Rust `str::find`、Python `str.find`、Java `String.indexOf`、JavaScript `String.indexOf`）。
