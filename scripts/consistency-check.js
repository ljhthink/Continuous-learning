#!/usr/bin/env node
/**
 * 文档一致性检查脚本
 * 用法: node scripts/consistency-check.js
 *
 * 检查项（CLAUDE.md 14.1）:
 *  1. README.md 文档索引中的每个相对链接指向的文件真实存在
 *  2. docs/decisions/README.md 包含所有 docs/decisions/ADR-*.md
 *  3. docs/templates/README.md 包含所有 *-template.md
 *  4. docs/reports/ 中除 README.md 外的文件命名符合 YYYY-MM-DD-<task>-<type>.md
 *  5. 所有 .md 文件中不出现 file:/// 绝对路径（ADR-010，子 Agent 报告必须用相对路径）
 *  6. 所有 .md 文件中的相对链接 ../ 深度不超过 3 层（P3.4，ADR-010 延伸）
 *
 * 退出码: 0=通过, 1=失败
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errors = [];

// --- Helpers for recursive markdown walk ---
function listMarkdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Skip non-tracked / heavy dirs to keep CI fast and avoid false positives
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' ||
          entry.name === '.git' || entry.name === 'target' ||
          entry.name === 'build' || entry.name === 'out' ||
          entry.name === '.trae' || entry.name === '.idea') {
        continue;
      }
      out.push(...listMarkdownFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// 1. README 相对链接检查
function checkReadmeLinks() {
  const readme = path.join(ROOT, 'README.md');
  if (!fs.existsSync(readme)) {
    errors.push('README.md 不存在');
    return;
  }
  const text = fs.readFileSync(readme, 'utf8');
  const linkRe = /\]\(([^)]+\.md[^)]*)\)/g;
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    let link = m[1].split('#')[0].split('?')[0];
    if (/^https?:/.test(link)) continue; // 跳过外链
    if (!exists(link)) {
      errors.push(`README.md 链接指向不存在的文件: ${link}`);
    }
  }
}

// 2. decisions 索引检查
function checkDecisionsIndex() {
  const dir = path.join(ROOT, 'docs', 'decisions');
  const idx = path.join(dir, 'README.md');
  if (!fs.existsSync(dir)) return; // 目录未建则跳过
  const adrs = fs.readdirSync(dir).filter(f => /^ADR-\d+.*\.md$/.test(f) && f !== 'README.md');
  if (adrs.length === 0) return;
  if (!fs.existsSync(idx)) {
    errors.push('docs/decisions/ 存在 ADR 但缺少 README.md 索引');
    return;
  }
  const text = fs.readFileSync(idx, 'utf8');
  adrs.forEach(a => {
    if (!text.includes(a)) errors.push(`docs/decisions/README.md 未引用 ${a}`);
  });
}

// 3. templates 索引检查
function checkTemplatesIndex() {
  const dir = path.join(ROOT, 'docs', 'templates');
  const idx = path.join(dir, 'README.md');
  if (!fs.existsSync(dir)) return;
  const tpls = fs.readdirSync(dir).filter(f => /-template\.md$/.test(f));
  if (tpls.length === 0) return;
  if (!fs.existsSync(idx)) {
    errors.push('docs/templates/ 存在模板但缺少 README.md 索引');
    return;
  }
  const text = fs.readFileSync(idx, 'utf8');
  tpls.forEach(t => {
    if (!text.includes(t)) errors.push(`docs/templates/README.md 未引用 ${t}`);
  });
}

// 4. reports 命名检查
function checkReportsNaming() {
  const dir = path.join(ROOT, 'docs', 'reports');
  if (!fs.existsSync(dir)) return;
  const nameRe = /^\d{4}-\d{2}-\d{2}-.+\.md$/;
  fs.readdirSync(dir).forEach(f => {
    if (f === 'README.md') return;
    if (!f.endsWith('.md')) return;
    if (!nameRe.test(f)) {
      errors.push(`docs/reports/${f} 命名不符合 YYYY-MM-DD-<task>-<type>.md`);
    }
  });
}

// 5. file:/// 绝对路径检测（ADR-010）
// 子 Agent 生成报告时易硬编码 `[text](file:///D:/...)` 形式的 markdown 链接，
// 在 Linux CI 上 lychee 报错且路径不可移植。本检查扫描所有 .md 文件，
// 匹配 markdown 链接格式 `(file:///` + 盘符/路径首字母，发现即报错。
// v2 增强：跳过代码块（``` 包裹的多行）与反引号 inline code，
// 避免误伤文档中描述 file:/// 概念的合法内容（如 ADR-010、guardrail 报告）。
function checkFileAbsolutePath() {
  // 正则匹配 markdown 链接格式：(file:/// 后紧跟盘符或路径首字母
  const fileLinkRe = /\(file:\/\/\/[A-Za-z]/g;
  // inline code 正则：匹配反引号包裹的内容（非贪婪，单行）
  const inlineCodeRe = /`[^`\n]*`/g;
  const files = listMarkdownFiles(ROOT);
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const lines = text.split(/\r?\n/);
    let inCodeBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      // 代码块围栏切换（``` 或 ~~~）
      if (/^\s*(```|~~~)/.test(rawLine)) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue; // 代码块内跳过
      // 去除 inline code 后再匹配（避免反引号包裹的描述性示例误报）
      const line = rawLine.replace(inlineCodeRe, '');
      let m;
      while ((m = fileLinkRe.exec(line)) !== null) {
        errors.push(`${rel(f)}:${i + 1} 出现 file:/// 绝对路径链接: ${rawLine.trim()}`);
      }
      fileLinkRe.lastIndex = 0; // 重置正则 lastIndex（g 标志跨行复用）
    }
  }
}

// 6. 相对路径深度检测（P3.4，ADR-010 延伸）
// 子 Agent 生成报告时易写出过多的 ../ 前缀（如 wiki/coding/page.md 引用
// docs/decisions/ADR-001.md 时写成 ../../../../docs/decisions/ADR-001.md），
// 导致 Linux CI lychee 报错。本检查扫描所有 .md 文件中的 markdown 相对链接，
// 如果 ../ 数量超过 3 层则报错（wiki/<domain>/page.md 回到根目录最多 2 层）。
function checkRelativePathDepth() {
  const MAX_DEPTH = 3; // 允许最多 3 层 ../（wiki/<domain>/<subdir>/page.md → 根目录需 ../../..）
  const linkRe = /\]\(([^)]+)\)/g;
  const files = listMarkdownFiles(ROOT);
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const lines = text.split(/\r?\n/);
    let inCodeBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      // 代码块围栏切换（``` 或 ~~~）
      if (/^\s*(```|~~~)/.test(rawLine)) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue; // 代码块内跳过
      // inline code 去除
      const line = rawLine.replace(/`[^`\n]*`/g, '');
      let m;
      while ((m = linkRe.exec(line)) !== null) {
        const link = m[1].split('#')[0].split('?')[0];
        // 跳过外链、锚点、纯锚点、mailto
        if (/^(https?:|mailto:|#|\/)/.test(link)) continue;
        // 计算 ../ 数量
        const depthMatches = link.match(/\.\.\//g);
        const depth = depthMatches ? depthMatches.length : 0;
        if (depth > MAX_DEPTH) {
          errors.push(
            `${rel(f)}:${i + 1} 相对路径 ../ 深度=${depth} 超过 ${MAX_DEPTH} 层: ${link}`
          );
        }
      }
      linkRe.lastIndex = 0;
    }
  }
}

checkReadmeLinks();
checkDecisionsIndex();
checkTemplatesIndex();
checkReportsNaming();
checkFileAbsolutePath();
checkRelativePathDepth();

if (errors.length) {
  console.error('一致性检查失败:');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log('一致性检查通过 ✓');
process.exit(0);
