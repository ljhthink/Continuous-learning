---
title: CJK bigram 分词：无分词库依赖的中文子串检索方案
domain: [coding]
type: experience
status: active
confidence: 0.85
date: 2026-08-02
source_task: TKN-RAG-CLASSIFY-ARCHAEOLOGY-001
use_count: 1
---

## 背景

在基于子串匹配的轻量检索系统（<200 页规模，无 BM25/向量检索）中，中文查询失效。根因是 tokenize 函数仅按 ASCII 标点切分，不处理全角中文标点（，。、！？等），导致整句中文查询退化为单个超长 token，无法匹配任何文档。

即使加入全角标点切分，CJK 连续字符不做分词的设计意味着「关于数学建模」作为整体 token 去匹配标题「2025 数学建模国赛三天速成指南」仍然失败（子串不包含）。

## 方案

在 tokenize 函数中，对每个已切分的 part 额外提取 CJK bigram（二元组）：

```typescript
function tokenize(text: string): string[] {
  const parts = text
    .toLowerCase()
    .split(/[\s,.;:!?()\[\]{}'"\/\\<>@#$%^&*+=|~`\-，。、！？；：（）【】「」『』〈〉“”‘’…—～·]+/)
    .filter((t) => t.length > 0);

  const result: string[] = [...parts];
  for (const part of parts) {
    const cjkChars = part.match(/[\u4e00-\u9fff]/g) || [];
    for (let i = 0; i < cjkChars.length - 1; i++) {
      result.push(cjkChars[i] + cjkChars[i + 1]);
    }
  }
  return result;
}
```

关键点：

1. 分隔符正则必须包含全角中文标点（U+FF0C 逗号、U+3002 句号等）
2. 对每个 part 中的 CJK 连续字符提取 bigram（如「数学建模」→「数学」「学建」「建模」）
3. bigram 与原始 token 共同参与子串匹配

## 证据

- 修复前：查询「关于数学建模，目前有哪些资料」→ 1 个 token → 0 结果
- 修复后：查询同上 → bigram「数学」「学建」「建模」匹配到标题含「数学建模」的文档
- 单元测试：5 个 CJK 回归用例（全角标点切分、bigram 匹配、混合 CJK+ASCII、无匹配返回空、ASCII 回归）
- 运行时验证：400,000 字符输入 → 63ms（线性时间，无 ReDoS）
- 联网案例研究：babel-memory、lunr-languages 均采用类似 bigram 策略处理 CJK

## 适用场景

- 适用：小规模（<200 页）基于子串匹配的检索系统，无 jieba/segmentit 分词依赖需求
- 适用：需要在标题/正文中匹配中文关键短语的场景
- 不适用：大规模检索（>5000 页）应使用 BM25 + 向量检索
- 不适用：需要精确分词（如「南京市长江大桥」歧义消解）的场景，应使用 jieba 等分词库
- 已知 tradeoff：bigram 在超长文档中可能产生 score 通胀（如 100 次重复「数学」的文档得分高于高相关短文档），建议后续引入 TF-IDF 归一化
