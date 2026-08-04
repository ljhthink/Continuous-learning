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
 *  7. MCP 工具数一致性：README.md / docs/ARCH.md 宣称的工具数与 server/src/index.ts 实际注册数一致（V2 报告 §6.2）
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

// 7. MCP 工具数一致性检查（V2 报告 §6.2）
// 防止 README.md / docs/ARCH.md 宣称的工具数与 server/src/index.ts 实际注册数脱节。
// 实现：统计 index.ts 中 `server.tool(` 调用数（实际工具数），再用正则提取文档中
// 宣称的工具数（如 "17 tools" / "17 个 tools" / "17 个 MCP tools"），两者必须一致。
// 取文档中提到的最大工具数作为"当前状态"宣称值（工具数随演进递增，历史阶段如
// "P1: 8 tools" / "P3 增至 9 tools" 不会被误判为当前宣称）。

/**
 * 纯函数：校验文档宣称的 MCP 工具数与 index.ts 实际注册数一致。
 *
 * 提取为纯函数以便脚本可被 `node --test` 单测（见 __tests__/consistency-check.test.js），
 * 函数不访问文件系统，仅根据传入的文本内容做断言。
 *
 * @param {object} input
 * @param {string} input.indexTsContent - server/src/index.ts 的文本内容
 * @param {Record<string,string>} input.docs - { 标签: 文档文本 }，如 { 'README.md': '...', 'docs/ARCH.md': '...' }
 * @returns {string[]} 断言不一致时的错误描述数组；全部一致返回空数组
 */
function validateToolCount({ indexTsContent, docs }) {
  const errors = [];
  const toolCalls = (indexTsContent || '').match(/server\.tool\(/g) || [];
  const actualCount = toolCalls.length;
  // 匹配 "<数字> tools" / "<数字> 个 tools" / "<数字> 个 MCP tools" 等中文/英文表述
  const countRe = /(\d+)\s*(?:个\s*)?(?:MCP\s*)?tools?/gi;
  for (const [label, text] of Object.entries(docs || {})) {
    let m;
    let maxMentioned = 0;
    while ((m = countRe.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      if (n > maxMentioned) maxMentioned = n;
    }
    if (maxMentioned === 0) {
      // 文档中未提及工具数，跳过（不强制要求每处都写数字）
      continue;
    }
    if (maxMentioned !== actualCount) {
      errors.push(
        `${label} 宣称 ${maxMentioned} 个 MCP tools（最大值），但 server/src/index.ts 实际注册 ${actualCount} 个（server.tool() 调用数）`
      );
    }
  }
  return errors;
}

function checkMcpToolCount() {
  const indexTs = path.join(ROOT, 'server', 'src', 'index.ts');
  if (!fs.existsSync(indexTs)) {
    errors.push('server/src/index.ts 不存在，无法核对 MCP 工具数');
    return;
  }
  const indexText = fs.readFileSync(indexTs, 'utf8');

  // 校验 README.md 与 ARCH.md 中宣称的工具数
  const docsToCheck = [
    { file: 'README.md', label: 'README.md' },
    { file: 'docs/ARCH.md', label: 'docs/ARCH.md' },
  ];
  const docs = {};
  for (const { file, label } of docsToCheck) {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) {
      docs[label] = fs.readFileSync(fullPath, 'utf8');
    }
  }
  errors.push(...validateToolCount({ indexTsContent: indexText, docs }));
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

// 仅当直接执行脚本（node scripts/consistency-check.js）时运行全部检查；
// 被 require 导入（单测）时跳过，避免副作用。
if (require.main === module) {
  checkReadmeLinks();
  checkDecisionsIndex();
  checkTemplatesIndex();
  checkReportsNaming();
  checkFileAbsolutePath();
  checkRelativePathDepth();
  checkMcpToolCount();

  if (errors.length) {
    console.error('一致性检查失败:');
    errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  }
  console.log('一致性检查通过 ✓');
  process.exit(0);
}

module.exports = { validateToolCount };
