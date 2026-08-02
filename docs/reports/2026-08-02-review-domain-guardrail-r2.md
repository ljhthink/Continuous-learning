# 领域护栏修复聚焦复审报告（R2）

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | guardrail-enforcer（子 Agent） |
| 任务令牌 | TKN-REVIEW-DOMAIN-GUARDRAIL-002 |
| 角色 | guardrail-enforcer |
| 允许输出 | `docs/reports/2026-08-02-review-domain-guardrail-r2.md` |
| 日期 | 2026-08-02 |
| 上游报告 | `docs/reports/2026-08-02-review-domain-guardrail.md`（R1，首轮审计，结论「通过（有条件）」） |
| 审查范围 | 主 Agent 针对 MED-1 / MED-2 / LOW-3 / LOW-4 的 4 处修复 delta + 3 个新增回归测试 |
| 引用规约 | 全文使用相对路径引用代码（ADR-010，禁止 `file:///` 绝对路径） |
| 风险等级 | P2 跨模块（沿用 R1 判定） |

---

## 1. 总体结论

**通过** — 4 项修复均正确解决了 R1 指出的原始问题，未引入阻断级（Blocking）或高危（High-risk）安全漏洞，未破坏 `delete_domain_directory` 的四层安全防护链与 `classify_domain` 的 LLM 输出隔离。

本轮复审聚焦主 Agent 的 4 个自问疑点，逐项给出证据驱动结论：

| 主 Agent 自问疑点 | 复审结论 |
| --- | --- |
| MED-1 `while` 循环 `&content[abs_idx + header_len..]` 是否越界 panic？ | **安全** — `str::find` 仅在完整子串匹配时返回 `Some`，保证 `abs_idx + header_len <= content.len()`，切片上界恒合法 |
| MED-1 `search_from = abs_idx + 1` 是否死循环 / 越界？ | **安全** — `search_from` 严格递增且 `<= content.len()`，`content[search_from..]` 永不越界，循环必然终止 |
| LOW-3 `start_idx == 1` 时文件开头出现双换行是否违反 MD012？ | **理论存在、实际不可达** — index.md 首行恒为 `# Index`，`## {name}` 必有前导 `\n` 且前有内容，`start_idx == 1` 场景不可触发；后果仅为格式警告，不阻断 |
| MED-2 fallback `"llm-proposed-domain"` 多个纯中文 proposal 同名是否冲突？ | **功能性低风险、非安全风险** — 固定字符串通过 `is_valid_domain` 校验，无注入；多个纯中文领域会合并同名目录，概率极低且可逆 |

| 维度 | 结论 |
| --- | --- |
| 安全漏洞扫描 | 通过 — 无阻断级/高危漏洞，原有防护未被破坏 |
| 代码质量审查 | 通过 — 4 项修复逻辑正确，边界覆盖充分 |
| 测试验证 | 有条件通过 — 3 个新测试覆盖 MED-1 真实路径；MED-2 测试复制逻辑未端到端验证；LOW-3 缺格式回归断言（均为低风险，不阻断） |
| 风险等级 | P2 跨模块（沿用） |

---

## 2. 审查范围摘要

| 指标 | 数值 |
| --- | --- |
| 审查文件数 | 2（`frontend/src-tauri/src/lib.rs` + `frontend/src/components/CategoryTree.tsx`） |
| 审查函数数 | 4（`remove_domain_from_index` / `classify_domain` / `slugify` / `is_valid_domain`）+ 辅助确认 `domainColor`/`domainLabel`/`delete_domain_directory`/`create_domain_directory` |
| 审查测试数 | 3（`test_remove_domain_from_index_prefix_collision` / `test_med2_slugify_preserves_unicode_but_is_valid_domain_rejects` / `test_med2_slugify_mixed_cn_en_extracts_ascii`） |
| 阻断级问题 | 0 |
| 高危问题 | 0 |
| 中风险问题 | 0 |
| 低风险/建议 | 5（均不阻断） |

---

## 3. 详细发现

### 3.1 MED-1 修复审查：`remove_domain_from_index` 精确 heading 匹配

| 属性 | 值 |
| --- | --- |
| 修复位置 | `frontend/src-tauri/src/lib.rs` `remove_domain_from_index` L1959-L1979 |
| 原问题（R1 MED-1） | `content.find("\n## {name}")` 子串匹配，`design` 误命中 `design-resources` |
| 修复手法 | `while` 循环 + 匹配后验证 `after.is_empty() \|\| after.starts_with('\n')`，前缀碰撞时 `search_from = abs_idx + 1` 继续搜索 |

**修复代码**（L1963-L1975）：

```rust
let section_header = format!("\n## {}", name);
let header_len = section_header.len();
let mut start_idx: Option<usize> = None;
let mut search_from = 0;
while let Some(idx) = content[search_from..].find(&section_header) {
    let abs_idx = search_from + idx;
    let after = &content[abs_idx + header_len..];
    if after.is_empty() || after.starts_with('\n') {
        start_idx = Some(abs_idx + 1); // +1 跳过前缀换行，指向 # 字符
        break;
    }
    search_from = abs_idx + 1; // 前缀碰撞，继续搜索
}
```

#### 3.1.1 切片越界分析（主 Agent 疑点 1）

**结论：安全，无 panic 风险。**

`content[search_from..].find(&section_header)` 的语义契约：`str::find` 仅在 `section_header` 作为完整子串出现时返回 `Some(idx)`。因此子串 `[idx, idx + header_len)` 完整落在 `content[search_from..]` 内，即：

```text
idx + header_len <= content[search_from..].len()
=> search_from + idx + header_len <= content.len()
=> abs_idx + header_len <= content.len()
```

故 `&content[abs_idx + header_len..]` 的切片上界 `abs_idx + header_len <= content.len()`：

- 若 `== content.len()`，则 `&content[content.len()..]` 合法返回空串 `""`（Rust 允许 `&s[s.len()..]`）。
- 若 `< content.len()`，正常切片。

两者均合法，**无越界 panic**。

补充：`header_len = section_header.len()` 是字节数。调用链 `delete_domain_directory`（L1826）在调用 `remove_domain_from_index`（L1863）前已通过 `is_valid_domain(&name)` 校验，保证 `name` 为纯 ASCII kebab-case。故 `section_header` 全 ASCII，`header_len` 既等于字节数也等于字符数，切片边界对齐 UTF-8 字符边界。**字符边界安全**。

#### 3.1.2 死循环与 `search_from` 越界分析（主 Agent 疑点 2）

**结论：无死循环，无 `search_from` 越界。**

- **严格递增**：每次循环 `search_from` 被设为 `abs_idx + 1 = search_from + idx + 1`。因 `section_header` 以 `\n` 开头（至少 1 字节），匹配位置 `idx >= 0`，故 `abs_idx + 1 >= search_from + 1 > search_from`。`search_from` 严格单调递增。
- **上界保证**：每次匹配成立时 `abs_idx + header_len <= content.len()`，即 `abs_idx + 1 <= content.len()`（因 `header_len >= 1`），故下次 `search_from <= content.len()`。当 `search_from == content.len()` 时 `content[search_from..]` 为空串，`find` 返回 `None`，循环退出。`search_from` 永不超过 `content.len()`，`content[search_from..]` 永不越界。
- **终止性**：`search_from` 严格递增且有上界 `content.len()`，循环必然在有限步内终止。**无死循环**。

最坏复杂度：理论上每次仅推进 1 字节，最坏 O(n·m)（n=content 长度，m=section_header 长度）。但 index.md 通常 < 100 行、领域名 < 20 字符，性能可忽略。主 Agent 自评正确。

#### 3.1.3 逻辑正确性验证

精确匹配条件 `after.is_empty() || after.starts_with('\n')`：

- `design` vs `design-resources`：`\n## design` 命中 `\n## design-resources` 前缀，`after = "-resources\n..."`，不以 `\n` 开头且非空 → 前缀碰撞，继续搜索。**正确跳过**。
- `\n## design\n`：`after = "\n- [[wiki/design/bar]]..."`，以 `\n` 开头 → 精确匹配。**正确命中**。

匹配语义等价于 R1 建议的方案 B（找到后验证行尾），实现正确。

#### 3.1.4 边界场景：`## {name}` 出现在文件开头（无前导 `\n`）

若 index.md 异常地以 `## {name}` 开头（第 0 字节为 `#`），`find("\n## {name}")` 不会匹配（缺前导 `\n`），函数幂等返回 `Ok(())`，保守不删。

- 正常 index.md 首行恒为 `# Index`（见 `frontend/src-tauri/src/lib.rs` L1940 注释及测试 L2697），领域分组均为 `\n## {name}`，此场景不可达。
- 保守不删比误删安全，行为可接受。

**MED-1 结论：修复正确，无安全风险。**

---

### 3.2 LOW-3 修复审查：段间空行恢复

| 属性 | 值 |
| --- | --- |
| 修复位置 | `frontend/src-tauri/src/lib.rs` `remove_domain_from_index` L1992-L2006 |
| 原问题（R1 LOW-3） | 删除中间分组时段间 `\n\n` 变 `\n`，违反 markdownlint MD022 |
| 修复手法 | 拼接时 `if !result.ends_with("\n\n")` 补换行至双空行 |

**修复代码**（L1991-L2006）：

```rust
let mut result = String::with_capacity(content.len());
result.push_str(&content[..start_idx.saturating_sub(1)]); // 保留前缀（含换行）
// LOW-3 fix: 确保段间空行（markdownlint MD022）
if !result.ends_with("\n\n") {
    if !result.ends_with('\n') {
        result.push('\n');
    }
    result.push('\n');
}
result.push_str(&content[end..]); // 保留下一个 heading 起的内容
```

#### 3.2.1 正常场景验证

以 R1 测试构造的 index.md（L2696-L2710）删除 `design` 为例：

- `start_idx` 指向 `## design` 的 `#`，`abs_idx` 指向其前导 `\n`（`## coding` 分组末尾 `\n\n` 的第二个 `\n`）。
- `content[..start_idx-1]` = `content[..abs_idx]`，末尾为 `]]` 后第一个 `\n`（单换行）。
- `result.ends_with("\n\n")` = false → `ends_with('\n')` = true → 仅 push 一个 `\n` → result 末尾变为 `\n\n`。
- 接 `content[end..]`（`## design-resources...`），结果 `## coding\n...\n\n## design-resources`。**段间空行恢复，符合 MD022**。

#### 3.2.2 文件开头边界（主 Agent 疑点 3）

**结论：理论存在双换行，实际不可达，后果仅为格式警告，不阻断。**

若 `start_idx == 1`（即 `\n## {name}` 位于文件最开头，`abs_idx == 0`）：

- `content[..start_idx.saturating_sub(1)]` = `content[..0]` = `""`（空串）。
- `result = ""`，`ends_with("\n\n")` = false，`ends_with('\n')` = false → push `\n` + `\n` → `result = "\n\n"`。
- 接 `content[end..]` → 文件开头变为 `"\n\n## next-section..."`。

此结果在文件开头产生 2 个换行符。markdownlint MD012（`maximum: 1`）可能在严格模式下报告「Multiple consecutive blank lines」。

**可达性分析**：触发条件为 index.md 以 `\n## {name}` 开头（首字符即换行，紧接要删除的领域 heading）。正常 index.md 首行为 `# Index`，所有领域分组前必有 `# Index\n\n` 或前一分组内容，`abs_idx` 指向的 `\n` 前必有非空内容。**该场景在正常数据下不可达**。即便异常触发，后果仅为 lint 警告，不影响数据完整性或安全。

**LOW-3 结论：正常场景修复正确；文件开头边界为不可达的理论场景，不阻断。建议（可选）：在 `result.is_empty()` 时跳过补空行以彻底消除理论瑕疵。**

---

### 3.3 MED-2 修复审查：`classify_domain` ASCII 提取与 fallback

| 属性 | 值 |
| --- | --- |
| 修复位置 | `frontend/src-tauri/src/lib.rs` `classify_domain` L1622-L1646 |
| 原问题（R1 MED-2） | `slugify` 保留 Unicode（含中文），`is_valid_domain` 仅接受 ASCII，proposal.name 含中文时下游 `create_domain_directory` 拒绝 |
| 修复手法 | slugify 后追加 `is_valid_domain` 校验；不通过则提取 ASCII 部分；全无 ASCII 用占位符 `"llm-proposed-domain"` |

**修复代码**（L1622-L1646）：

```rust
let proposed_name = if is_valid_domain(&domain) {
    domain.clone()
} else {
    let slug = slugify(&domain);
    if is_valid_domain(&slug) {
        slug
    } else {
        let ascii_part: String = slug
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
            .collect();
        let cleaned = ascii_part.trim_matches('-');
        if cleaned.is_empty() {
            "llm-proposed-domain".to_string()
        } else {
            cleaned.to_string()
        }
    }
};
```

#### 3.3.1 契约不一致修复正确性

`slugify`（L112-L120）用 `c.is_alphanumeric()` 保留 Unicode；`is_valid_domain`（L283-L289）用 `c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'` 仅接受 ASCII。修复在两者之间插入校验层：

- `domain` 已是合法 ASCII → 直接用（`is_valid_domain(&domain)` 分支）。
- `slug` 经 slugify 后为合法 ASCII → 用 slug（如 LLM 返回 `"Data Science"` → slug `"data-science"` → 通过）。
- `slug` 含非 ASCII → 提取 ASCII 部分（如 `"数学 modeling 建模"` → `"modeling"`）。
- 全无 ASCII → `"llm-proposed-domain"`。

修复后 `proposed_name` **必定**满足 `is_valid_domain`（纯 `[a-z0-9-]+` ASCII），下游 `create_domain_directory`（L1685）再次校验时必然通过。**契约不一致被消除**。

#### 3.3.2 注入风险分析

**结论：无注入风险。**

`domain` 来自 LLM JSON 输出（L1582-L1586），是用户间接可控输入（用户上传文档的 title/preview 进入 LLM prompt，LLM 返回 domain）。威胁模型考虑 prompt injection：恶意文档诱导 LLM 返回特定 domain 名。

无论 LLM 返回什么字符串，`proposed_name` 经三重过滤后必为 `[a-z0-9-]+`：

1. `slugify`：非 alphanumeric/`-` 字符全部转 `-`。
2. ASCII 提取：`filter(|c| c.is_ascii_alphanumeric() || *c == '-')`，剔除所有非 ASCII。
3. `trim_matches('-')`：去首尾连字符。

路径遍历字符（`/`、`\`、`.`、空格）在 `slugify` 阶段已转 `-`，无法存活到 `proposed_name`。且 `classify_domain` 本身无文件系统写操作——`proposed_name` 仅放入 `NewDomainProposal` 返回前端展示（L1647-L1650）。用户点击「创建并移入」才调用 `create_domain_directory`，后者独立执行 `is_valid_domain` + `validate_inside` 防护。**纵深防御完整，无注入逃逸路径**。

#### 3.3.3 fallback 同名冲突分析（主 Agent 疑点 4）

**结论：功能性低风险，非安全风险。**

`"llm-proposed-domain"` 是固定字符串，通过 `is_valid_domain`（纯 ASCII 小写+连字符）。若 LLM 对多个不同文档均返回纯中文领域名（如「数学建模」「物理仿真」），多个 proposal 的 `name` 都 fallback 为 `"llm-proposed-domain"`：

- 第一个文档：`createDomain("llm-proposed-domain")` → 创建 `wiki/llm-proposed-domain/`，index.md 追加分组。
- 第二个文档：`createDomain("llm-proposed-domain")` → `create_domain_directory` 检测 `content.contains("## llm-proposed-domain")`（L1705）已存在，不追加分组；`fs::create_dir_all` 幂等返回 Ok；页面移入同一目录。

**后果**：两个语义不同的领域被合并到同一目录。这是数据语义混淆（功能性问题），非安全问题：

- 概率极低：LLM prompt 明确要求 `name 必须为 kebab-case`（L1532-L1543）并给出英文示例（`math-modeling`），纯中文返回属异常行为。
- 可逆：用户可在 DomainManager 中手动重命名/移动页面。
- 原始输入保留：`description` 字段含 `由 LLM 提议（原始输入：{domain}）`（L1649），用户可据此判断。
- 无安全影响：合并的目录名仍是合法 kebab-case，不突破任何防护。

主 Agent 自评「保证功能性——这个权衡可接受」成立。建议后续迭代引入音译或前端强制改名（见 §5）。

#### 3.3.4 `cleaned` 边界完整性

- `cleaned` 可能为空：`ascii_part` 全为 `-` 时 `trim_matches('-')` 后为空 → 走 fallback。**已处理**。
- `cleaned` 可能含连续 `-`（如 `"a--b"`）：`is_valid_domain` 仅校验字符集不校验连续性，`"a--b"` 通过。MCP 侧正则 `/^[a-z0-9][a-z0-9-]*$/` 同样允许。功能合法，语义略差。**可接受**。
- `cleaned` 可能纯数字（如 LLM 返回 `"数学123"` → `"123"`）：`is_valid_domain("123")` = true。合法但语义差。**可接受**。

**MED-2 结论：修复正确消除契约不一致，无注入风险。fallback 同名合并为低概率功能性低风险，不阻断。**

---

### 3.4 LOW-4 修复审查：`CategoryTree.tsx` 配色统一

| 属性 | 值 |
| --- | --- |
| 修复位置 | `frontend/src/components/CategoryTree.tsx` L13, L60-L61 |
| 原问题（R1 LOW-4） | `DOMAIN_COLORS[d] ?? "#888"` 与 `domainColor()` 的 `?? "#6b7280"` 灰色不一致 |
| 修复手法 | 改用 `domainColor(domain)` / `domainLabel(domain)` helper |

**修复代码**（L13, L60-L61）：

```tsx
import { domainColor, domainLabel } from "@/types";
// ...
label: domainLabel(domain),
color: domainColor(domain),
```

**helper 实现确认**（`frontend/src/types/index.ts` L70-L79）：

```typescript
export function domainLabel(domain: string | null | undefined): string {
  if (!domain) return "未分类";
  return DOMAIN_LABELS[domain] ?? domain;
}
export function domainColor(domain: string | null | undefined): string {
  if (!domain) return "#6b7280";
  return DOMAIN_COLORS[domain] ?? "#6b7280";
}
```

- 旧 `?? "#888"` 已替换为 `domainColor()`，fallback 统一为 `#6b7280`。**配色一致性恢复**。
- 旧 `?? c.name` 已替换为 `domainLabel()`，增加 `null` → `"未分类"` 保护。**比原 fallback 更健壮**。
- 导入从 `DOMAIN_COLORS, DOMAIN_LABELS`（直接常量）改为 `domainColor, domainLabel`（helper），消除重复 fallback 逻辑。

**LOW-4 结论：修复正确，配色统一，且额外增强了 null 安全。无风险。**

---

## 4. 安全审查（Stage 1-2 聚焦）

### 4.1 切片与索引边界（Stage 1.2）

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| MED-1 `&content[abs_idx + header_len..]` 越界 | 安全 | `find` 完整匹配保证 `abs_idx + header_len <= content.len()`（§3.1.1） |
| MED-1 `content[search_from..]` 越界 | 安全 | `search_from` 严格递增且 `<= content.len()`（§3.1.2） |
| MED-1 `content[..start_idx.saturating_sub(1)]` 越界 | 安全 | `saturating_sub` 防下溢，`start_idx >= 1`（因 `abs_idx >= 0`，`start_idx = abs_idx + 1`） |
| MED-1 UTF-8 字符边界 | 安全 | `name` 经 `is_valid_domain` 校验为纯 ASCII，`section_header` 全 ASCII，字节切片=字符切片 |
| MED-1 `rest[1..]` 切片 | 安全 | `rest = content[start_idx..]`，`start_idx` 指向 `#`（ASCII），`rest[1..]` 跳过 `#` 不跨多字节边界 |

### 4.2 注入防护（Stage 2.1）

| 攻击面 | 结果 | 证据 |
| --- | --- | --- |
| MED-2 LLM prompt 注入 → 路径遍历 | 安全 | `proposed_name` 经 slugify + ASCII 过滤 + trim，必为 `[a-z0-9-]+`；`/`、`\`、`.` 在 slugify 阶段转 `-`（§3.3.2） |
| MED-2 proposal 直接触达 sink | 安全 | `classify_domain` 无文件系统写操作；proposal 仅返回前端；`create_domain_directory` 独立执行 `is_valid_domain` + `validate_inside`（L1685, L1843） |
| MED-2 fallback 字符串注入 | 安全 | `"llm-proposed-domain"` 为编译期常量，无用户输入参与构造 |

### 4.3 防护链完整性确认

`delete_domain_directory` 四层防护（L1826-L1857）本次未修改，调用 `remove_domain_from_index`（L1863）时 `name` 已经过 `is_valid_domain` 校验，保证传入 `remove_domain_from_index` 的 `name` 为纯 ASCII kebab-case。MED-1 修复在已校验输入上运作，切片边界安全有双重保证。

| 防护层 | 状态 | 证据 |
| --- | --- | --- |
| kebab-case 校验 | 未改动 | L1826 `is_valid_domain(&name)` |
| 受保护目录白名单 | 未改动 | L1834 `PROTECTED_DOMAINS` |
| 路径遍历防护 | 未改动 | L1843 `validate_inside` |
| force 标志 | 未改动 | L1852 `page_count > 0 && !force` |

**安全审查结论：修复未破坏任何原有安全防护，未引入新攻击面。**

---

## 5. 测试质量审查

### 5.1 测试 1：`test_remove_domain_from_index_prefix_collision`（L2691-L2733）

| 维度 | 评估 |
| --- | --- |
| 测试路径 | 直接调用 `remove_domain_from_index` 生产代码 ✓ |
| 前缀碰撞覆盖 | `design` + `design-resources` 共存，删除 `design` 验证 `design-resources` 保留 ✓ |
| 断言充分性 | 验证目标分组移除 + 前缀分组保留 + 其他分组不受影响 ✓ |

**遗漏场景**（低风险，不阻断）：

1. **反向前缀未覆盖**：删除 `design-resources` 验证 `design` 保留。逻辑对称应同样工作，但测试仅覆盖单方向。
2. **LOW-3 空行格式未验证**：断言仅检查 `contains("## design-resources")` 等存在性，未验证 `## coding\n\n## design-resources` 的段间空行格式。若 LOW-3 修复回退（产生 `## coding\n## design-resources` 无空行），所有断言仍通过。**LOW-3 修复缺乏回归测试保护**。
3. **删除末尾分组**：`next_section_idx = None` 分支（L2008-L2015）未在本测试覆盖（既有测试 L2684 前可能有覆盖，但本 delta 未新增）。

建议补充断言：

```rust
// LOW-3 格式回归：验证段间双空行
assert!(
    updated.contains("## coding\n\n## design-resources"),
    "删除中间分组后段间应保留空行（MD022），实际：\n{}",
    updated
);
```

### 5.2 测试 2：`test_med2_slugify_preserves_unicode_but_is_valid_domain_rejects`（L2739-L2769）

| 维度 | 评估 |
| --- | --- |
| 契约不一致证据 | 直接调用 `slugify("数学建模")` + `is_valid_domain`，验证 slug 保留中文且 is_valid_domain 拒绝 ✓ |
| 修复路径覆盖 | **未调用 `classify_domain`**，而是复制 ASCII 提取逻辑（L2754-L2763 与生产 L1635-L1644 重复） ⚠ |

**问题**：测试验证的是「若按此逻辑执行，结果通过校验」，而非「`classify_domain` 中的实际修复代码」。若生产代码修复被误删/回退，此测试仍通过（因为它测的是自包含的复制逻辑）。

**根因**：`classify_domain` 是 `async fn`（L1499），内部调用 `llm_complete_non_streaming`（L1562）发起真实 LLM HTTP 请求，无法在纯单元测试中直接调用。主 Agent 因此复制了逻辑。

**建议**（低风险，不阻断）：抽取纯函数 `fn sanitize_proposed_domain(domain: &str) -> String`，封装 L1622-L1646 的 ASCII 提取逻辑，`classify_domain` 调用它，测试直接测试该纯函数。这样既消除逻辑重复，又使修复路径可直接测试。

### 5.3 测试 3：`test_med2_slugify_mixed_cn_en_extracts_ascii`（L2773-L2790）

| 维度 | 评估 |
| --- | --- |
| 混合输入覆盖 | `"数学 modeling 建模"` → 提取 `"modeling"` ✓ |
| 修复路径覆盖 | 同测试 2，复制逻辑而非调用生产代码 ⚠ |

与测试 2 相同的测试质量问题。建议同 §5.2。

### 5.4 测试质量总结

| 测试 | 覆盖真实代码 | 主要价值 | 缺口 |
| --- | --- | --- | --- |
| 测试 1（MED-1） | 是 | 前缀碰撞防护端到端验证 | LOW-3 格式断言、反向前缀、末尾分组 |
| 测试 2（MED-2 契约） | 部分（slugify/is_valid_domain 真实，提取逻辑复制） | 契约不一致证据固化 | 未测 classify_domain 修复路径 |
| 测试 3（MED-2 混合） | 部分（同上） | 混合输入 ASCII 提取 | 同测试 2 |

**测试质量结论**：3 个测试覆盖了核心修复点的关键场景，但存在两个低风险缺口（LOW-3 格式无断言、MED-2 复制逻辑未端到端）。均不阻断本次发布，建议按 §5.1/§5.2 建议补充。

---

## 6. 范围外观察（记录不阻断）

### 6.1 `create_domain_directory` 的 `contains` 子串匹配（MED-1 姊妹问题）

`create_domain_directory`（L1705）使用 `content.contains(&format!("## {}", name))` 检查分组是否已存在。这与 R1 MED-1 原始缺陷同构：若已存在 `## design-resources`，创建 `design` 时 `contains("## design")` 命中 `## design-resources` 子串，导致**不追加 `## design` 分组**（目录创建成功但 index.md 缺分组）。

- 此为既有代码，不在本次 4 项修复 delta 内。
- 后果：index.md 缺少新领域分组，`kb_lint` 可能报数据缺口；不影响安全（目录已创建，`is_valid_domain` 已校验）。
- 建议：后续迭代同步修复，采用与 MED-1 相同的精确 heading 匹配。

### 6.2 MED-2 fallback 语义化（主 Agent 自评遗憾）

`"llm-proposed-domain"` 不够语义化。理想方案是音译（如 `pinyin` crate 转中文为拼音），但引入新依赖与 MVP 最小依赖原则冲突。主 Agent 的权衡（功能性优先、原始输入保留在 description）可接受。建议 P7+ 评估音译库或前端强制改名流程。

---

## 7. 修复建议汇总

| ID | 严重度 | 建议 | 优先级 | 阻断 |
| --- | --- | --- | --- | --- |
| R2-LOW-1 | 低 | LOW-3 补充段间空行格式回归断言（§5.1） | 随手 | 否 |
| R2-LOW-2 | 低 | MED-2 抽取 `sanitize_proposed_domain` 纯函数消除测试逻辑重复（§5.2） | 下轮迭代 | 否 |
| R2-LOW-3 | 低 | MED-1 测试补充反向前缀 + 末尾分组场景 | 下轮迭代 | 否 |
| R2-LOW-4 | 低 | LOW-3 `result.is_empty()` 时跳过补空行，消除文件开头理论双换行（§3.2.2） | 随手 | 否 |
| R2-LOW-5 | 低 | `create_domain_directory` 的 `contains` 子串匹配同步精确化（§6.1） | 下轮迭代 | 否 |

---

## 8. 防护机制验证

| 防护机制 | R1 状态 | R2 复审状态 | 备注 |
| --- | --- | --- | --- |
| `delete_domain_directory` 四层防护 | 通过 | 通过（未改动） | MED-1 修复在已校验输入上运作 |
| `is_valid_domain` kebab-case 校验 | 通过 | 通过（未改动） | MED-2 fallback 通过此校验 |
| `validate_inside` 路径遍历防护 | 通过 | 通过（未改动） | — |
| `classify_domain` LLM 输出隔离 | 通过 | 通过（增强） | MED-2 修复增加 ASCII 提取层，纵深防御更深 |
| 前端 XSS 防护 | 通过 | 通过（未改动） | LOW-4 仅改 helper 调用，React 默认转义不变 |
| 切片边界安全 | N/A | 通过 | MED-1 全部切片经 `find` 契约 + ASCII 保证安全 |
| 死循环/整数溢出 | N/A | 通过 | `search_from` 严格递增有界，`saturating_sub` 防下溢 |

---

## 9. 审查清单确认

| 审查项 | 状态 | 备注 |
| --- | --- | --- |
| MED-1 `while` 循环切片越界 | 通过 | `find` 完整匹配保证上界合法（§3.1.1） |
| MED-1 `search_from` 死循环/越界 | 通过 | 严格递增有界，必然终止（§3.1.2） |
| MED-1 精确匹配逻辑正确性 | 通过 | 前缀碰撞正确跳过，精确 heading 正确命中（§3.1.3） |
| LOW-3 段间空行恢复 | 通过 | 正常场景正确；文件开头边界不可达（§3.2） |
| LOW-3 文件开头双换行 | 通过（理论瑕疵） | 不可达场景，后果仅 lint 警告，不阻断 |
| MED-2 契约不一致消除 | 通过 | proposed_name 必通过 is_valid_domain（§3.3.1） |
| MED-2 LLM 注入风险 | 通过 | 三重过滤 + 下游独立校验（§3.3.2） |
| MED-2 fallback 同名冲突 | 通过（功能低风险） | 概率极低，可逆，无安全影响（§3.3.3） |
| LOW-4 配色统一 | 通过 | domainColor/domainLabel fallback 一致 #6b7280（§3.4） |
| 安全防护链未被破坏 | 通过 | 四层防护未改动，classify_domain 隔离增强（§4.3） |
| 测试覆盖充分性 | 有条件通过 | MED-1 真实路径覆盖；MED-2 复制逻辑；LOW-3 缺格式断言（§5） |

---

## 10. 自动化建议（CI/CD 集成）

针对本轮发现的测试缺口，建议在 CI 中追加：

### 10.1 markdownlint 守护 LOW-3 格式

```yaml
# .github/workflows/lint.yml
- name: markdownlint index.md format
  run: npx markdownlint-cli2 '**/index.md'
  # 配置 .markdownlint.json 启用 MD022（heading 前后空行）+ MD012（空行数）
```

注：当前 `remove_domain_from_index` 写出的 index.md 应通过 MD022。若 CI 报 MD022，说明删除逻辑有空行回归。

### 10.2 Semgrep 规则守护 MED-1 模式

```yaml
# .semgrep/rules/heading-exact-match.yml
rules:
  - id: rust-heading-substring-find-without-boundary
    patterns:
      - pattern: content.find(&format!("\n## {}", $NAME))
      - pattern-not-inside: |
          while ... {
              ...
              if $AFTER.is_empty() || $AFTER.starts_with('\n') { ... }
              ...
          }
    message: "heading find 缺行尾边界校验，前缀碰撞可误匹配（MED-1 回归守护）"
    severity: WARNING
    languages: [rust]
```

### 10.3 同步守护 create_domain_directory contains（§6.1）

```yaml
  - id: rust-heading-contains-substring-match
    pattern: content.contains(&format!("## {}", $NAME))
    message: "contains 子串匹配可前缀碰撞，建议改用精确 heading 匹配（MED-1 姊妹问题）"
    severity: INFO
    languages: [rust]
```

---

**报告结束。**

结论：**通过** — 4 项修复均正确解决原始问题，未引入阻断级/高危安全漏洞，未破坏原有安全防护。5 项低风险建议（测试补强 + 可选优化）不阻断本次发布，建议在下轮迭代或随手修复中处理。
