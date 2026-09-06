/**
 * 武将添加器 — 零依赖本地服务器
 * 用法: node server.mjs [--port 9527] [--no-open]
 * 浏览器打开 http://localhost:9527 ，选择扩展后按表单添加武将，
 * 自动定位并修改 data / translate / title / intro / package 五个文件（写前备份、写后 node --check）。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 角色添加器 → tools → 扩展目录 → extension → app
const APP_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const EXTENSIONS_DIR = path.join(APP_ROOT, "extension");
const CHARACTER_DIR = path.join(APP_ROOT, "character");
const BACKUP_DIR = path.join(__dirname, "backups");
const PUBLIC_DIR = __dirname;

/* ---------------- 字符串/注释感知的基础扫描器 ---------------- */

function skipQuoted(src, i, q) {
	i++;
	while (i < src.length) {
		if (src[i] === "\\") { i += 2; continue; }
		if (src[i] === q) return i + 1;
		i++;
	}
	return src.length;
}

function skipTemplate(src, i) {
	// src[i] === "`"
	i++;
	while (i < src.length) {
		const c = src[i];
		if (c === "\\") { i += 2; continue; }
		if (c === "`") return i + 1;
		if (c === "$" && src[i + 1] === "{") {
			let depth = 1;
			i += 2;
			while (i < src.length && depth > 0) {
				const d = src[i];
				if (d === "\\") { i += 2; continue; }
				if (d === "'" || d === '"') { i = skipQuoted(src, i, d); continue; }
				if (d === "`") { i = skipTemplate(src, i); continue; }
				if (d === "{") depth++;
				else if (d === "}") depth--;
				i++;
			}
			continue;
		}
		i++;
	}
	return src.length;
}

function matchDelim(src, openIdx) {
	// 从 { 或 [ 的位置找到配对的闭合下标（跳过注释/字符串/模板串）
	const open = src[openIdx];
	const close = open === "{" ? "}" : "]";
	let depth = 0;
	let i = openIdx;
	while (i < src.length) {
		const c = src[i];
		if (c === "/" && src[i + 1] === "/") { const e = src.indexOf("\n", i); i = e < 0 ? src.length : e; continue; }
		if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
		if (c === '"' || c === "'") { i = skipQuoted(src, i, c); continue; }
		if (c === "`") { i = skipTemplate(src, i); continue; }
		if (c === open) depth++;
		else if (c === close) { depth--; if (depth === 0) return i; }
		i++;
	}
	return -1;
}

/** 从花括号对象内部猜测缩进单位（首个条目的前导空白） */
function detectIndent(src, openIdx) {
	const m = /\r?\n([ \t]+)/.exec(src.slice(openIdx, openIdx + 2000));
	return m ? m[1] : "\t";
}

function detectEol(src) {
	return src.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * 线性扫描 JS 源码，提取所有 `key: "字符串"` / `key: `模板串`` / `key: function` 条目。
 * key 为标识符；value 为字符串内容（模板串保留 ${...} 原文）或 null（表示函数/动态值）。
 */
function extractStringEntries(src) {
	const out = [];
	const isIdStart = c => /[A-Za-z_$]/.test(c);
	const isId = c => /[A-Za-z0-9_$]/.test(c);
	const keywords = new Set(["if", "for", "while", "switch", "return", "case", "typeof", "else", "do", "catch", "throw", "await", "yield", "new", "delete", "void", "in", "of", "export", "import", "from", "const", "let", "var", "class", "extends", "this"]);
	let i = 0;
	const n = src.length;
	while (i < n) {
		const c = src[i];
		if (c === "/" && src[i + 1] === "/") { const e = src.indexOf("\n", i); i = e < 0 ? n : e; continue; }
		if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
		if (c === '"' || c === "'") {
			// 可能是带引号的键："xxx_info": "..."
			const keyEnd = skipQuoted(src, i, c);
			let k = keyEnd;
			while (k < n && (src[k] === " " || src[k] === "\t" || src[k] === "\n" || src[k] === "\r")) k++;
			if (src[k] === ":") {
				k++;
				while (k < n && /\s/.test(src[k])) k++;
				const v = src[k];
				const key = src.slice(i + 1, keyEnd - 1);
				if (v === '"' || v === "'") {
					const end = skipQuoted(src, k, v);
					out.push({ key, value: src.slice(k + 1, end - 1), quote: v });
					i = end;
					continue;
				}
				if (v === "`") {
					const end = skipTemplate(src, k);
					out.push({ key, value: src.slice(k + 1, end - 1), quote: "`" });
					i = end;
					continue;
				}
				if (v === "(" || src.startsWith("function", k) || src.startsWith("async", k)) {
					out.push({ key, value: null });
					i = keyEnd;
					continue;
				}
			}
			i = keyEnd;
			continue;
		}
		if (c === "`") { i = skipTemplate(src, i); continue; }
		if (isIdStart(c)) {
			let j = i;
			while (j < n && isId(src[j])) j++;
			const word = src.slice(i, j);
			let k = j;
			while (k < n && (src[k] === " " || src[k] === "\t" || src[k] === "\n" || src[k] === "\r")) k++;
			if (src[k] === ":" && !keywords.has(word)) {
				k++;
				while (k < n && /\s/.test(src[k])) k++;
				const v = src[k];
				if (v === '"' || v === "'") {
					const end = skipQuoted(src, k, v);
					out.push({ key: word, value: src.slice(k + 1, end - 1), quote: v });
					i = end;
					continue;
				}
				if (v === "`") {
					const end = skipTemplate(src, k);
					out.push({ key: word, value: src.slice(k + 1, end - 1), quote: "`" });
					i = end;
					continue;
				}
				if (v === "(" || src.startsWith("function", k) || src.startsWith("async", k)) {
					out.push({ key: word, value: null });
					i = j;
					continue;
				}
			}
			i = j;
			continue;
		}
		i++;
	}
	return out;
}

/** 找到 `anchor 正则` 之后第一个对象字面量的 { 与 } 下标 */
function findObjectRange(src, anchorRe) {
	const m = anchorRe.exec(src);
	if (!m) return null;
	let i = m.index + m[0].length;
	while (i < src.length && /\s/.test(src[i])) i++;
	if (src[i] !== "{") {
		// 兼容 `export const x = {...}` 前带类型标注等，继续找最近的 {
		const j = src.indexOf("{", i);
		if (j < 0) return null;
		i = j;
	}
	const close = matchDelim(src, i);
	if (close < 0) return null;
	return { open: i, close };
}

/* ---------------- 五文件定位 ---------------- */

const TARGET_ROLES = ["data", "translate", "title", "intro", "package"];

function walkJsFiles(dir, baseDir, out = []) {
	let entries;
	try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
	for (const ent of entries) {
		if (ent.isDirectory()) {
			if (["image", "audio", "font", "node_modules", ".git", "theme", "layout"].includes(ent.name)) continue;
			walkJsFiles(path.join(dir, ent.name), baseDir, out);
		} else if (ent.isFile() && ent.name.endsWith(".js")) {
			const full = path.join(dir, ent.name);
			try {
				const stat = fs.statSync(full);
				if (stat.size > 3 * 1024 * 1024) continue;
				out.push({ rel: path.relative(baseDir, full).replace(/\\/g, "/"), full });
			} catch { /* ignore */ }
		}
	}
	return out;
}

function locateTargets(extName) {
	const extDir = path.join(EXTENSIONS_DIR, extName);
	const files = walkJsFiles(extDir, extDir).map(f => ({ ...f, src: fs.readFileSync(f.full, "utf8") }));
	const targets = {};
	const anchors = {
		data: /(?:export\s+)?(?:const|let|var)\s+characterData\s*=/,
		translate: /(?:export\s+)?(?:const|let|var)\s+characterTranslate\s*=/,
		title: /(?:export\s+)?(?:const|let|var)\s+characterTitle\s*=/,
		intro: /(?:export\s+)?(?:const|let|var)\s+characterIntro\s*=/,
		package: /(?:export\s+)?(?:const|let|var)\s+characterSort\s*=/,
	};
	for (const role of TARGET_ROLES) {
		const hit = files.find(f => anchors[role].test(f.src));
		targets[role] = hit ? { rel: hit.rel } : null;
	}
	// 兜底
	if (!targets.data) {
		const hit = files.find(f => {
			const cnt = (f.src.match(/skills\s*:\s*\[/g) || []).length;
			return cnt >= 3 && /group\s*:/.test(f.src);
		});
		if (hit) targets.data = { rel: hit.rel };
	}
	if (!targets.translate) {
		const hit = files.find(f => (f.src.match(/_prefix\s*:/g) || []).length >= 2);
		if (hit) targets.translate = { rel: hit.rel };
	}
	if (!targets.title) {
		const hit = files.find(f => /title\.js$/.test(f.rel) && /:\s*["'`]/.test(f.src));
		if (hit) targets.title = { rel: hit.rel };
	}
	if (!targets.intro) {
		const hit = files.find(f => /intro\.js$/.test(f.rel) && /:\s*["'`]/.test(f.src));
		if (hit) targets.intro = { rel: hit.rel };
	}
	if (!targets.package) {
		const hit = files.find(f => /characterSort\s*[:=]/.test(f.src));
		if (hit) targets.package = { rel: hit.rel };
	}
	// 已有武将 id（供前端查重）
	let existingIds = [];
	if (targets.data) {
		const f = files.find(x => x.rel === targets.data.rel);
		const range = findObjectRange(f.src, anchors.data) ?? findObjectRange(f.src, /characterData\s*=/);
		if (range) {
			const body = f.src.slice(range.open, range.close);
			const idRe = /^[ \t]*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*\{/gm;
			let m;
			while ((m = idRe.exec(body))) existingIds.push(m[1] || m[2] || m[3]);
		}
	}
	return {
		targets,
		existingIds,
		files: files.map(f => f.rel),
	};
}

function readTarget(extName, rel) {
	return fs.readFileSync(path.join(EXTENSIONS_DIR, extName, rel), "utf8");
}

/* ---------------- 技能扫描 ---------------- */

const skillCache = { global: null, ext: new Map() };

// 收集目录下所有 js 的 mtime 指纹，用于缓存失效（文件有增删改就重扫）
function filesFingerprint(files) {
	let fp = files.length + "|";
	for (const { full } of files) {
		try { fp += full + ":" + fs.statSync(full).mtimeMs + "|"; } catch { /* ignore */ }
	}
	return fp;
}

function isCacheValid(cacheEntry, files) {
	if (!cacheEntry) return false;
	if (cacheEntry.fp !== filesFingerprint(files)) return false;
	return true;
}

function scanSkillsInFiles(files) {
	const map = new Map();
	for (const { full, rel } of files) {
		let src;
		try { src = fs.readFileSync(full, "utf8"); } catch { continue; }
		const entries = extractStringEntries(src);
		// 第一遍：收集 info 键 → 技能 id 集合
		const ids = new Set();
		for (const e of entries) {
			if (e.key.endsWith("_info")) ids.add(e.key.slice(0, -5));
		}
		// 第二遍：info 与 name
		for (const e of entries) {
			if (!e.key.endsWith("_info")) continue;
			const id = e.key.slice(0, -5);
			const cur = map.get(id) ?? { id, name: "", info: "", from: rel };
			if (!cur.info && e.value !== null) cur.info = e.value;
			else if (!cur.info && e.value === null) cur.info = "（动态描述，进游戏查看）";
			if (cur.info && e.value !== null && map.has(id) === false) cur.from = rel;
			map.set(id, cur);
		}
		for (const e of entries) {
			if (e.value === null || !map.has(e.key)) continue;
			if (!map.get(e.key).name) map.get(e.key).name = e.value;
		}
	}
	return map;
}

function scanGlobalSkills() {
	const files = walkJsFiles(CHARACTER_DIR, CHARACTER_DIR);
	if (!isCacheValid(skillCache.global, files)) {
		skillCache.global = { fp: filesFingerprint(files), map: scanSkillsInFiles(files) };
	}
	return skillCache.global.map;
}

function scanExtSkills(extName) {
	const extDir = path.join(EXTENSIONS_DIR, extName);
	const files = walkJsFiles(extDir, extDir);
	if (!isCacheValid(skillCache.ext.get(extName), files)) {
		skillCache.ext.set(extName, { fp: filesFingerprint(files), map: scanSkillsInFiles(files) });
	}
	return skillCache.ext.get(extName).map;
}

/* ---------------- 前缀 / 包扫描 ---------------- */

function scanMeta(extName, targets) {
	const prefixes = new Set();
	const packages = [];
	// 包：characterSort 的键 + characterSortTranslate 的中文名
	let sortTranslate = {};
	if (targets.package) {
		const src = readTarget(extName, targets.package.rel);
		const range = findObjectRange(src, /(?:export\s+)?(?:const|let|var)\s+characterSort\s*=/);
		if (range) {
			const body = src.slice(range.open, range.close);
			const keyRe = /^[ \t]*(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*\[/gm;
			let m;
			while ((m = keyRe.exec(body))) packages.push({ key: m[1] || m[2], name: "" });
		}
		const stRange = findObjectRange(src, /(?:export\s+)?(?:const|let|var)\s+characterSortTranslate\s*=/);
		if (stRange) {
			for (const e of extractStringEntries(src.slice(stRange.open, stRange.close))) {
				if (e.value !== null) sortTranslate[e.key] = e.value;
			}
		}
		// pkgPrefixMap 的值也算注册前缀
		const pp = /(?:const|let|var)\s+pkgPrefixMap\s*=\s*\{([\s\S]*?)\n\}/.exec(src);
		if (pp) {
			for (const e of extractStringEntries(pp[1])) {
				if (e.value) prefixes.add(e.value);
			}
		}
	}
	for (const p of packages) p.name = sortTranslate[p.key] || p.key;
	// 前缀：translate 文件里所有 *_prefix 值按 | 拆开
	if (targets.translate) {
		const src = readTarget(extName, targets.translate.rel);
		for (const e of extractStringEntries(src)) {
			if (e.key.endsWith("_prefix") && e.value) {
				for (const part of e.value.split("|")) if (part.trim()) prefixes.add(part.trim());
			}
		}
	}
	return {
		prefixes: [...prefixes].sort((a, b) => a.localeCompare(b, "zh")),
		packages,
	};
}

/* ---------------- 五文件写入 ---------------- */

function escapeJsString(s) {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
}

function quoteKey(key) {
	return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

/** 在对象字面量的末尾插入一个条目（自动补前一逗号、匹配缩进与换行符） */
function insertObjectEntry(src, anchorRe, entryText) {
	const range = findObjectRange(src, anchorRe);
	if (!range) throw new Error("未找到目标对象（anchor 匹配失败）");
	const { open, close } = range;
	const eol = detectEol(src);
	const indent = detectIndent(src, open);
	let p = close - 1;
	while (p >= 0 && /\s/.test(src[p])) p--;
	const needComma = p >= 0 && src[p] !== ",";
	// 闭合大括号所在行的缩进
	let lineStart = src.lastIndexOf("\n", close - 1) + 1;
	const closeLineIndent = src.slice(lineStart, close).match(/^[ \t]*/)[0];
	const entryLines = entryText.split("\n").map(l => indent + l.replaceAll("\t", indent)).join(eol);
	const insert = (needComma ? "," : "") + eol + entryLines + eol + closeLineIndent;
	return src.slice(0, close) + insert + src.slice(close);
}

/** 在 characterSort[(pkg)] 数组末尾追加一个 id */
function insertIntoPackageArray(src, pkg, id) {
	const range = findObjectRange(src, /(?:export\s+)?(?:const|let|var)\s+characterSort\s*=/);
	if (!range) throw new Error("未找到 characterSort 对象");
	const bodyStart = range.open, bodyEnd = range.close;
	const re = new RegExp(`${quoteKey(pkg).replace(/^"|"$/g, m => "\\" + m)}\\s*:\\s*\\[`);
	const rest = src.slice(bodyStart, bodyEnd);
	const m = re.exec(rest);
	if (!m) throw new Error(`characterSort 中没有包 "${pkg}"`);
	const bracketOpen = bodyStart + m.index + m[0].length - 1;
	const bracketClose = matchDelim(src, bracketOpen);
	if (bracketClose < 0) throw new Error(`包 "${pkg}" 的数组括号不匹配`);
	let p = bracketClose - 1;
	while (p >= 0 && /\s/.test(src[p])) p--;
	if (p <= bracketOpen) {
		// 空数组
		return src.slice(0, bracketClose) + `"${id}"` + src.slice(bracketClose);
	}
	if (src[p] === ",") {
		// 多行数组（末元素后已有逗号）：在 ] 前按缩进换行插入
		const eol = detectEol(src);
		let lineStart = src.lastIndexOf("\n", p) + 1;
		const indent = src.slice(lineStart, bracketClose).match(/^[ \t]*/)[0] || "\t";
		return src.slice(0, bracketClose) + indent + `"${id}"` + eol + src.slice(bracketClose);
	}
	return src.slice(0, bracketClose) + `, "${id}"` + src.slice(bracketClose);
}

function buildDataEntry(char, indentUnit, eol) {
	const lines = [];
	lines.push(`${quoteKey(char.id)}: {`);
	lines.push(`\tsex: ${JSON.stringify(char.sex || "male")},`);
	lines.push(`\tgroup: ${JSON.stringify(char.group)},`);
	lines.push(`\thp: ${char.hp},`);
	lines.push(`\tmaxHp: ${char.maxHp},`);
	lines.push(`\thujia: ${char.hujia ?? 0},`);
	if (char.extra) {
		for (const [k, v] of Object.entries(char.extra)) {
			lines.push(`\t${quoteKey(k)}: ${JSON.stringify(v)},`);
		}
	}
	lines.push(`\tskills: [${char.skills.map(s => JSON.stringify(s)).join(", ")}],`);
	lines.push(`},`);
	// 内层 \t 是嵌套标记，由 insertObjectEntry / previewOf 统一替换为文件实际缩进
	return lines.join("\n");
}

function backupFile(extName, rel, stampDir) {
	const full = path.join(EXTENSIONS_DIR, extName, rel);
	const dest = path.join(stampDir, rel.replace(/[\\/]/g, "__"));
	fs.copyFileSync(full, dest);
	return dest;
}

function nodeCheck(full) {
	const r = spawnSync(process.execPath, ["--check", full], { encoding: "utf8" });
	return r.status === 0 ? null : (r.stderr || "node --check 失败").slice(0, 800);
}

async function handleAdd(body, dryRun) {
	const extName = body.ext;
	const char = body.char;
	const errors = [];
	const warns = [];
	if (!TARGET_ROLES.every(r => body.targets?.[r]?.rel)) {
		// 重新定位
		const loc = locateTargets(extName);
		body.targets = loc.targets;
	}
	const targets = body.targets;
	for (const role of TARGET_ROLES) {
		if (!targets[role]?.rel) errors.push(`未能定位 ${role} 文件，请在界面上手动指定`);
	}
	if (!/^[A-Za-z_$][\w$]*$/.test(char.id || "")) errors.push(`武将 id "${char.id}" 不是合法标识符`);
	if (!char.name && !body.name) errors.push("缺少角色全称（translate）");
	if (!Array.isArray(char.skills) || !char.skills.length) errors.push("至少选择一个技能");
	// 技能存在性
	if (char.skills?.length) {
		const known = new Set([...scanExtSkills(extName).keys(), ...scanGlobalSkills().keys()]);
		const unknown = char.skills.filter(s => !known.has(s));
		if (unknown.length && !body.force) errors.push(`以下技能在扫描结果中不存在（若确认无误可勾选“仍要添加”）：${unknown.join(", ")}`);
	}
	if (!Array.isArray(body.packages) || !body.packages.length) warns.push("未选择任何包（characterSort），武将将不会出现在任何武将包分组里");
	// 重复 id
	if (targets.data && /^[A-Za-z_$][\w$]*$/.test(char.id || "")) {
		const dataSrc = readTarget(extName, targets.data.rel);
		const range = findObjectRange(dataSrc, /characterData\s*=/);
		if (range && new RegExp(`[\\s,{]\\s*(?:"${char.id}"|${char.id})\\s*:`).test(dataSrc.slice(range.open, range.close))) {
			errors.push(`武将 id "${char.id}" 已存在于 data 文件`);
		}
	}
	// 包存在性
	if (body.packages?.length && targets.package?.rel) {
		const known = new Set(scanMeta(extName, targets).packages.map(p => p.key));
		const unknownPkgs = body.packages.filter(p => !known.has(p));
		if (unknownPkgs.length) errors.push(`以下包在 characterSort 中不存在：${unknownPkgs.join(", ")}`);
	}
	if (errors.length) return { ok: false, errors, warns };

	const extDir = path.join(EXTENSIONS_DIR, extName);
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const stampDir = path.join(BACKUP_DIR, stamp);
	const results = [];

	const run = (role, fn) => {
		const rel = targets[role].rel;
		const full = path.join(extDir, rel);
		try {
			const src = fs.readFileSync(full, "utf8");
			const out = fn(src);
			if (dryRun) {
				const idx = out.indexOf("《INSERT》");
				results.push({ role, rel, snippet: out.replace("《INSERT》", "……此处插入……") });
			} else {
				fs.mkdirSync(stampDir, { recursive: true });
				const backup = backupFile(extName, rel, stampDir);
				fs.writeFileSync(full, out);
				const check = nodeCheck(full);
				results.push({ role, rel, backup, check, ok: !check });
			}
		} catch (e) {
			results.push({ role, rel, error: String(e.message || e) });
		}
	};

	// 预览模式：先在内容里插占位，再截取插入点附近文本
	const previewOf = (src, anchorRe, entryText) => {
		const range = findObjectRange(src, anchorRe);
		if (!range) return "（anchor 未匹配）";
		const eol = detectEol(src);
		const indent = detectIndent(src, range.open);
		const entryLines = entryText.split("\n").map(l => indent + l.replaceAll("\t", indent)).join(eol);
		return "……\n" + entryLines + "\n" + src.slice(range.close, range.close + 40).split("\n")[0] + "\n……";
	};

	const dataSrc = readTarget(extName, targets.data.rel);
	const indentUnit = detectIndent(dataSrc, (findObjectRange(dataSrc, /characterData\s*=/) || { open: 0 }).open);
	const eol = detectEol(dataSrc);
	const dataEntry = buildDataEntry(char, indentUnit, eol);
	const translateEntry = `${quoteKey(char.id)}: ${JSON.stringify(body.name || char.name || "")},` + (body.prefixes?.length ? `\n${quoteKey(char.id + "_prefix")}: ${JSON.stringify(body.prefixes.join("|"))},` : "");
	const titleEntry = body.title ? `${quoteKey(char.id)}: ${JSON.stringify(body.title)},` : null;
	const introEntry = body.intro ? `${quoteKey(char.id)}: ${JSON.stringify(body.intro)},` : null;

	if (dryRun) {
		run("data", () => dataSrc.replace("characterData", "characterData《INSERT》"));
		results[0].snippet = previewOf(dataSrc, /characterData\s*=/, dataEntry);
		const translateSrc = readTarget(extName, targets.translate.rel);
		results.push({ role: "translate", rel: targets.translate.rel, snippet: previewOf(translateSrc, /characterTranslate\s*=/, translateEntry) });
		if (titleEntry) {
			const titleSrc = readTarget(extName, targets.title.rel);
			results.push({ role: "title", rel: targets.title.rel, snippet: previewOf(titleSrc, /characterTitle\s*=/, titleEntry) });
		}
		if (introEntry) {
			const introSrc = readTarget(extName, targets.intro.rel);
			results.push({ role: "intro", rel: targets.intro.rel, snippet: previewOf(introSrc, /characterIntro\s*=/, introEntry) });
		}
		const pkgSrc = readTarget(extName, targets.package.rel);
		for (const pkg of body.packages || []) {
			const range = findObjectRange(pkgSrc, /characterSort\s*=/);
			let snippet = "（未找到包）";
			if (range) {
				const re = new RegExp(`${quoteKey(pkg).replace(/^"|"$/g, c => "\\" + c)}\\s*:\\s*\\[[^\\]]*`);
				const m = re.exec(pkgSrc.slice(range.open, range.close));
				if (m) snippet = "……" + m[0] + `, "${char.id}" …………`;
			}
			results.push({ role: "package", rel: targets.package.rel, snippet: `${pkg}: ${snippet}` });
		}
		return { ok: true, dryRun: true, results, warns };
	}

	// 正式写入
	run("data", src => insertObjectEntry(src, /(?:export\s+)?(?:const|let|var)\s+characterData\s*=/, dataEntry));
	run("translate", src => insertObjectEntry(src, /(?:export\s+)?(?:const|let|var)\s+characterTranslate\s*=/, translateEntry));
	if (titleEntry) run("title", src => insertObjectEntry(src, /(?:export\s+)?(?:const|let|var)\s+characterTitle\s*=/, titleEntry));
	if (introEntry) run("intro", src => insertObjectEntry(src, /(?:export\s+)?(?:const|let|var)\s+characterIntro\s*=/, introEntry));
	{
		const rel = targets.package.rel;
		const full = path.join(extDir, rel);
		try {
			fs.mkdirSync(stampDir, { recursive: true });
			const backup = backupFile(extName, rel, stampDir);
			let src = fs.readFileSync(full, "utf8");
			for (const pkg of body.packages || []) {
				src = insertIntoPackageArray(src, pkg, char.id);
			}
			fs.writeFileSync(full, src);
			const check = nodeCheck(full);
			results.push({ role: "package", rel, backup, check, ok: !check });
		} catch (e) {
			results.push({ role: "package", rel, error: String(e.message || e) });
		}
	}

	// 立绘检查
	const imgJpg = path.join(extDir, "image", "character", char.id + ".jpg");
	const imgPng = path.join(extDir, "image", "character", char.id + ".png");
	if (!fs.existsSync(imgJpg) && !fs.existsSync(imgPng)) {
		warns.push(`立绘缺失：请放置 image/character/${char.id}.jpg（或 .png）`);
	}
	return { ok: results.every(r => !r.error && r.ok !== false), results, warns };
}

/* ---------------- HTTP ---------------- */

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, "http://localhost");
	const send = (code, data, type = "application/json; charset=utf-8") => {
		res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
		res.end(typeof data === "string" ? data : JSON.stringify(data));
	};
	try {
		if (url.pathname === "/" || url.pathname === "/index.html") {
			return send(200, fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8"), MIME[".html"]);
		}
		if (url.pathname === "/app.js") return send(200, fs.readFileSync(path.join(PUBLIC_DIR, "app.js"), "utf8"), MIME[".js"]);
		if (url.pathname === "/style.css") return send(200, fs.readFileSync(path.join(PUBLIC_DIR, "style.css"), "utf8"), MIME[".css"]);

		if (url.pathname === "/api/bootstrap") {
			const exts = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
				.filter(d => d.isDirectory() && d.name !== "node_modules")
				.map(d => d.name);
			return send(200, { extensions: exts, appRoot: APP_ROOT });
		}
		if (url.pathname === "/api/locate") {
			const ext = url.searchParams.get("ext");
			if (!ext || !fs.existsSync(path.join(EXTENSIONS_DIR, ext))) return send(400, { error: "扩展不存在" });
			const loc = locateTargets(ext);
			return send(200, loc);
		}
		if (url.pathname === "/api/meta") {
			const ext = url.searchParams.get("ext");
			const loc = locateTargets(ext);
			return send(200, scanMeta(ext, loc.targets));
		}
		if (url.pathname === "/api/skills") {
			const ext = url.searchParams.get("ext");
			const toArr = m => [...m.values()].map(s => ({ id: s.id, name: s.name || s.id, info: s.info || "" }));
			return send(200, { ext: toArr(scanExtSkills(ext)), global: toArr(scanGlobalSkills()) });
		}
		if (url.pathname === "/api/preview" && req.method === "POST") {
			const body = await readBody(req);
			return send(200, await handleAdd(JSON.parse(body), true));
		}
		if (url.pathname === "/api/add" && req.method === "POST") {
			const body = await readBody(req);
			return send(200, await handleAdd(JSON.parse(body), false));
		}
		send(404, { error: "not found" });
	} catch (e) {
		send(500, { error: String(e.stack || e) });
	}
});

function readBody(req) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on("data", c => {
			size += c.length;
			if (size > 2 * 1024 * 1024) { reject(new Error("body too large")); req.destroy(); return; }
			chunks.push(c);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) || 9527 : 9527;
const noOpen = args.includes("--no-open");

server.listen(PORT, "127.0.0.1", () => {
	const url = `http://localhost:${PORT}`;
	console.log(`[武将添加器] 已启动: ${url}`);
	console.log(`[武将添加器] 游戏根目录: ${APP_ROOT}`);
	if (!noOpen && process.platform === "win32") {
		spawnSync("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
	}
});
