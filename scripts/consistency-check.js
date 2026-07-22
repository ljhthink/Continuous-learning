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
 *
 * 退出码: 0=通过, 1=失败
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errors = [];

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

checkReadmeLinks();
checkDecisionsIndex();
checkTemplatesIndex();
checkReportsNaming();

if (errors.length) {
  console.error('一致性检查失败:');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log('一致性检查通过 ✓');
process.exit(0);
