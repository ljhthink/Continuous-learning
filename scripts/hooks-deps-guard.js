#!/usr/bin/env node
/**
 * React Hooks 依赖数组守卫脚本
 * 用法: node scripts/hooks-deps-guard.js
 *
 * 背景（TKN-RAG-CLASSIFY-ARCHAEOLOGY-001）:
 *   DropZone.tsx 的 handleUpload useCallback 依赖数组遗漏 triggerClassify，
 *   导致 stale closure，LLM 分类永远不触发。原代码用 `eslint-disable-next-line
 *   react-hooks/exhaustive-deps` 注释压制了警告，使缺陷逃脱审查。
 *
 * 本脚本作为 ESLint react-hooks/exhaustive-deps 规则的轻量替代（项目暂未引入
 * ESLint，见考古报告 §7.2 与 ADR-014 跟进项），在 CI 中阻断对 React Hooks
 * 规则的 eslint-disable 压制，强制开发者正确补全依赖数组或重构代码。
 *
 * 检查项:
 *   1. frontend/src/ 下所有 .ts/.tsx 文件（排除 .test.ts/.test.tsx）
 *      中不得出现压制 react-hooks 规则的 eslint-disable 注释
 *
 * 退出码: 0=通过, 1=失败
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_SRC = path.join(ROOT, 'frontend', 'src');
let violations = [];

function listTsFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' ||
          entry.name === '.git' || entry.name === 'target') continue;
      listTsFiles(path.join(dir, entry.name), out);
    } else if (entry.isFile()) {
      const name = entry.name;
      if ((name.endsWith('.ts') || name.endsWith('.tsx')) &&
          !name.endsWith('.test.ts') && !name.endsWith('.test.tsx') &&
          !name.endsWith('.d.ts')) {
        out.push(path.join(dir, name));
      }
    }
  }
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

// 匹配 eslint-disable 注释中压制 react-hooks 规则的行。
// 例:
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   /* eslint-disable react-hooks/rules-of-hooks */
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps
const HOOKS_DISABLE_RE = /eslint-disable(?:-next-line|-line)? .*react-hooks\/(exhaustive-deps|rules-of-hooks)/;

function checkFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (HOOKS_DISABLE_RE.test(line)) {
      violations.push({
        file: rel(file),
        line: idx + 1,
        content: line.trim(),
      });
    }
  });
}

const files = [];
listTsFiles(FRONTEND_SRC, files);

if (files.length === 0) {
  console.error('[hooks-deps-guard] 未找到任何 .ts/.tsx 文件，请检查 frontend/src/ 是否存在');
  process.exit(1);
}

for (const file of files) {
  checkFile(file);
}

if (violations.length > 0) {
  console.error('\n[hooks-deps-guard] 发现 React Hooks 规则被 eslint-disable 压制（禁止）：\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.content}`);
    console.error('');
  }
  console.error(`共 ${violations.length} 处违规。`);
  console.error('');
  console.error('React Hooks 的 exhaustive-deps / rules-of-hooks 规则禁止被 eslint-disable 压制。');
  console.error('stale closure 会导致回调使用过期状态，引发难以定位的 bug（见');
  console.error('docs/reports/2026-08-02-rag-classify-archaeology.md §3.2）。');
  console.error('请补全依赖数组，或重构代码以移除对过期闭包的依赖。');
  console.error('如确需在 effect 中只运行一次，使用 useRef 同步最新值（见 React 官方文档）。');
  process.exit(1);
}

console.log(`[hooks-deps-guard] 通过 — 扫描 ${files.length} 个文件，未发现 react-hooks 规则压制。`);
process.exit(0);
