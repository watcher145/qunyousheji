import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(dirname(fileURLToPath(import.meta.url)));

function read(name) {
  return readFileSync(join(DIR, 'src', name), 'utf8');
}

// --- Parse characterSort from package.js ---
const pkgSrc = read('package.js');

function parseObj(src, varName) {
  const rx = new RegExp(`(?:const|let|var)\\s+${varName}\\s*=\\s*(\\{[\\s\\S]*?\\});`, 'm');
  const m = src.match(rx);
  if (!m) throw new Error(`Cannot find ${varName}`);
  return m[1];
}

function parseObjText(text) {
  text = text.replace(/;(\s*[}\]])/g, '$1');
  const result = {};
  const pairRx = /(\w+)\s*:\s*((?:"[^"]*")|(?:\[[\s\S]*?\]))/g;
  let match;
  while ((match = pairRx.exec(text)) !== null) {
    const key = match[1];
    let val = match[2];
    if (val.startsWith('[')) {
      const arrStr = val.slice(1, -1);
      result[key] = arrStr.split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    } else {
      result[key] = val.slice(1, -1);
    }
  }
  return result;
}

function parseObjStringValues(text) {
  const result = {};
  const pairRx = /(\w+)\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = pairRx.exec(text)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

function parseAllCharacterIds(dataSrc) {
  const ids = [];
  const keyRx = /^\s*(\w+):\s*\{/gm;
  let match;
  while ((match = keyRx.exec(dataSrc)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

// --- Parse ---
const characterSort = parseObjText(parseObj(pkgSrc, 'characterSort'));
const sortTranslate = parseObjStringValues(parseObj(pkgSrc, 'characterSortTranslate'));

const introSrc = read('character/intro.js');
const characterIntro = parseObjStringValues(introSrc);

const translateSrc = read('character/translate.js');
const characterTranslate = parseObjStringValues(translateSrc);

const dataSrc = read('character/data.js');
const allIds = parseAllCharacterIds(dataSrc);

// --- Extract designer/source name ---
function extractDesigner(id) {
  const intro = characterIntro[id] || '';
  const m = intro.match(/(?:设计|来源)[：:]\s*([^<。\n]+)/);
  if (m) return m[1].trim();
  return '未知';
}

function getDisplayName(id) {
  return characterTranslate[id] || id;
}

// --- Collect all packaged IDs ---
const packagedIds = new Set();
for (const [pkg, ids] of Object.entries(characterSort)) {
  for (const id of ids) packagedIds.add(id);
}

// --- Classify ---
const packages = {};
const gaishe = [];
const needImprove = [];
const collectedDesigner = [];
const collectedSource = [];

for (const id of allIds) {
  if (packagedIds.has(id)) {
    for (const [pkg, ids] of Object.entries(characterSort)) {
      if (ids.includes(id)) {
        (packages[pkg] ??= []).push(id);
      }
    }
    continue;
  }

  const intro = characterIntro[id] || '';
  const designer = extractDesigner(id);
  const isBV = /^BV\d/.test(designer);
  const hasSource = intro.includes('来源：');
  const hasModify = intro.includes('修改') || intro.includes('补充');
  const needsImprove = intro.includes('需要改进');

  if (hasModify) {
    gaishe.push(id);
  } else if (needsImprove) {
    needImprove.push(id);
  } else if (isBV || (hasSource && !intro.includes('设计：'))) {
    collectedSource.push(id);
  } else {
    collectedDesigner.push(id);
  }
}

// --- Helpers: merge same-designer entries into one line ---
function makeMergedLines(ids) {
  const groups = {};
  for (const id of ids) {
    const designer = extractDesigner(id);
    const name = getDisplayName(id);
    (groups[designer] ??= []).push(name);
  }
  return Object.entries(groups).map(([designer, names]) =>
    `- \`${designer}\`：${names.join('、')}`
  );
}

// --- Generate sections ---
const sections = [];

// Hardcoded yachaiclan groups: 3 lines by clan family
const yachaiclanGroups = [
  ["yachaiclan_cuiyan", "yachaiclan_wangxiang", "yachaiclan_diaochan", "yachaiclan_wuyi", "yachaiclan_xunyu"],
  ["yachaiclan_luxun", "yachaiclan_lukang", "yachaiclan_luji", "yachaiclan_luyun", "yachaiclan_luji2", "yachaiclan_luyusheng", "yachaiclan_lukai"],
  ["yachaiclan_zhugeliang", "yachaiclan_zhugezhan", "yachaiclan_zhugeshang", "yachaiclan_zhugejin", "yachaiclan_zhugeke", "yachaiclan_zhugedan", "yachaiclan_zhugeliang2"],
];

// Package order: follow characterSort, but yongdong & gaijin are handled separately at the very end
const pkgLast = ['qunyou_yongdong', 'qunyou_gaijin'];
const pkgOrder = Object.keys(characterSort).filter(
  p => !pkgLast.includes(p)
);

// Build package sections (first block)
const pkgSections = [];
for (const pkg of pkgOrder) {
  const ids = packages[pkg];
  if (!ids || ids.length === 0) continue;
  const pkgName = sortTranslate[pkg] || pkg;

  let lines;
  if (pkg === 'yachaiclan') {
    lines = yachaiclanGroups.map(group => {
      const names = group.map(id => getDisplayName(id));
      return '- `崖柴xxxF（B站）`：' + names.join('、');
    });
  } else {
    lines = makeMergedLines(ids);
  }
  pkgSections.push(`### ${pkgName}\n${lines.join('\n')}`);
}
sections.push(pkgSections.join('\n\n'));

// Non-package sections
if (collectedDesigner.length > 0) {
  sections.push('\n### 收集到的好设\n' + makeMergedLines(collectedDesigner).join('\n'));
}

if (collectedSource.length > 0) {
  sections.push('\n### 收集到的好设，但只有来源\n' + makeMergedLines(collectedSource).join('\n'));
}

if (gaishe.length > 0) {
  const lines = ['#有些设计由于存在边界问题或技能逻辑需要修改或补充，特此列出，欢迎提出意见'];
  for (const id of gaishe) {
    const designer = extractDesigner(id);
    const name = getDisplayName(id);
    const intro = characterIntro[id] || '';
    const modM = intro.match(/修改[：:]\s*([^<。\n]+)/);
    if (modM) {
      lines.push(`- \`${designer}\`：${name}（修改：${modM[1].trim()}）`);
    } else {
      lines.push(`- \`${designer}\`：${name}`);
    }
  }
  sections.push('\n### 改设和补设\n' + lines.join('\n'));
}

if (needImprove.length > 0) {
  sections.push('\n### 需要改进的设计\n' + makeMergedLines(needImprove).join('\n'));
}

// Last packages: 能永动的武将, 有问题的设计 (always at the very end)
for (const pkg of pkgLast) {
  const ids = packages[pkg];
  if (!ids || ids.length === 0) continue;
  const pkgName = sortTranslate[pkg] || pkg;
  sections.push(`\n### ${pkgName}\n${makeMergedLines(ids).join('\n')}`);
}

const newContent = sections.join('\n');

// --- Read current README and replace from "设计者与来源索引" ---
const readmePath = join(DIR, 'README.md');
const readme = readFileSync(readmePath, 'utf8');

const marker = '## 设计者与来源索引';
const idx = readme.indexOf(marker);
if (idx === -1) {
  console.error('Error: Cannot find "## 设计者与来源索引" in README.md');
  process.exit(1);
}

const before = readme.slice(0, idx);
const output = before + marker + '\n\n' + newContent + '\n';

writeFileSync(readmePath, output, 'utf8');
