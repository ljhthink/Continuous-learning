---
title: React useCallback stale closure：依赖数组遗漏导致闭包过期
domain: [coding]
type: experience
status: active
confidence: 0.9
date: 2026-08-02
source_task: TKN-RAG-CLASSIFY-ARCHAEOLOGY-001
---

## 背景

React 函数组件中，handleUpload（useCallback）调用了 triggerClassify（另一个 useCallback），但 handleUpload 的依赖数组未包含 triggerClassify。当 triggerClassify 因其依赖的 llmMode 变化而重建时，handleUpload 未重建，仍引用旧版 triggerClassify（捕获过期的 llmMode="disabled"），导致 LLM 分类被静默跳过。

## 方案

1. **补全依赖数组**：handleUpload 的依赖数组必须包含 triggerClassify
2. **正确排列 hooks 声明顺序**：被引用的 useCallback 必须在引用者之前声明，避免 temporal dead zone
3. **增加 UI 反馈**：所有早退路径（disabled/local-first/no-key）必须 setClassifyError 显示明确提示，不能静默跳过
4. **CI 守卫防复发**：创建 hooks-deps-guard.js 扫描 eslint-disable react-hooks 规则压制，阻断此类反模式

```typescript
// 正确顺序：resetClassifyState → triggerClassify → handleUpload → useEffect
const triggerClassify = useCallback(
  async (page: StagingPageIPC) => {
    if (llmMode === "disabled") {
      setClassifyError("LLM 未启用，请在设置中启用 LLM 集成后再使用自动分类");
      return;
    }
    // ...
  },
  [llmMode, cloudProvider, customBaseUrl, customModelName],
);

const handleUpload = useCallback(
  async (filePath: string) => {
    // ...
    if (!userSelectedDomain) {
      void triggerClassify(result.page);
    }
  },
  [currentDomain, invalidateGraph, resetClassifyState, triggerClassify], // 包含 triggerClassify
);
```

## 证据

- 修复前：用户启用 LLM 后上传文件 → handleUpload 引用旧 triggerClassify（llmMode="disabled"）→ 分类被静默跳过
- 修复后：triggerClassify 重建 → handleUpload 重建 → 引用最新 triggerClassify → 分类正常触发
- 验证：hooks-deps-guard.js 扫描 25 个文件 0 违规；TypeScript 类型检查零错误
- 回归保护：CI workflow 集成 hooks-deps-guard，阻断 eslint-disable 压制 react-hooks 规则

## 适用场景

- 适用：所有使用 React useCallback 的函数组件，尤其是回调函数相互引用的场景
- 适用：useCallback A 引用 useCallback B 时，A 的依赖数组必须包含 B
- 诊断方法：若回调函数行为不符合预期（尤其是状态相关的条件分支），优先检查依赖数组是否遗漏
- 静默失败特征：函数不报错但行为异常（如条件分支走错路径），通常是 stale closure
- 防复发：CI 中禁止 eslint-disable react-hooks/exhaustive-deps 和 react-hooks/rules-of-hooks
