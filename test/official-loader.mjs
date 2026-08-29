// 官方全量技能加载器：把 character/card/引擎 的官方技能 + 描述抽出来，作为"标定集"
// 官方技能 = 描述与实现均正确的 ground truth，用于校验 spec 规则的准确率
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getNoname } from "./mock-noname.mjs";

register(new URL("./loader.mjs", import.meta.url));
const mock = getNoname();
const { lib, game, ui, get, _status, ai } = mock;

const ROOT = "G:/game/noname/resources/app";

// ---------- 捕获 game.import("character"|"extension", factory) 老式回调 ----------
const captured = [];
game.import = (type, factory) => {
	if (typeof factory === "function") {
		const r = factory(lib, game, ui, get, ai, _status);
		if (r && typeof r === "object") captured.push({ type, result: r });
		return r;
	}
	if (factory && typeof factory === "object") captured.push({ type, result: factory });
	return factory;
};

// ---------- 待加载清单（全量官方） ----------
function buildFileList() {
	const list = [];
	// 1. 子包 skill.js（9 个）+ 各自 translate.js
	for (const pkg of ["mobile", "offline", "onlyOL", "sb", "shiji", "sp", "sp2", "tw", "xianding"]) {
		list.push(`character/${pkg}/skill.js`);
	}
	// 2. offline 分片聚合器
	list.push("character/offline/skill/index.js");
	// 3. 根级 character 包（21 个，含 characters + skills + translate）
	list.push("character/bingshi.js", "character/clan.js", "character/collab.js", "character/diy.js", "character/extra.js", "character/huicui.js", "character/jsrg.js", "character/key.js", "character/newjiang.js", "character/old.js", "character/refresh.js", "character/rank.js", "character/shenhua.js", "character/shiji.js", "character/sixiang.js", "character/standard.js", "character/sxrm.js", "character/yijiang.js", "character/yingbian.js", "character/perfectPairs.js", "character/replace.js");
	// 4. 卡牌包（含卡牌技能）
	for (const c of ["extra", "guozhan", "huodong", "sp", "standard", "xianxia", "yingbian", "yongjian", "zhulu"]) {
		list.push(`card/${c}.js`);
	}
	// 5. 引擎内置技能
	list.push("noname/library/skill.js");
	return list.filter((f) => existsSync(`${ROOT}/${f}`));
}

// ---------- 逐个加载 ----------
const skills = {};
const translate = {};
const errors = [];
const stats = [];

function absorb(obj, from) {
	if (!obj || typeof obj !== "object") return;
	if (obj.skill && typeof obj.skill === "object") Object.assign(skills, obj.skill);
	if (obj.translate && typeof obj.translate === "object") Object.assign(translate, obj.translate);
	if (obj.character && typeof obj.character === "object") {
		// 角色定义不影响技能，但可扩展技能 id 白名单
	}
}

const files = buildFileList();
console.log(`待加载官方文件 ${files.length} 个`);

for (const rel of files) {
	const t0 = Date.now();
	const before = { s: Object.keys(skills).length, t: Object.keys(translate).length };
	try {
		const mod = await import(pathToFileURL(`${ROOT}/${rel}`).href);
		// ESM 形式：default 可能是 skills 对象，也可能是完整包对象
		const d = mod.default;
		if (d && typeof d === "object") {
			if (d.skill || d.translate) absorb(d, rel);
			else if (Object.keys(d).length && !Array.isArray(d)) {
				// 纯 skills 映射（如 character/sp/skill.js）
				Object.assign(skills, d);
			}
		}
		// game.import 回调形式
		while (captured.length) absorb(captured.shift().result, rel);
	} catch (e) {
		errors.push({ file: rel, err: `${e.constructor.name}: ${String(e.message).slice(0, 120)}` });
	}
	// 副作用式赋值 lib.skill.xxx / lib.translate.xxx
	if (lib.skill && typeof lib.skill === "object") Object.assign(skills, lib.skill);
	if (lib.translate && typeof lib.translate === "object") Object.assign(translate, lib.translate);
	stats.push({
		file: rel,
		ms: Date.now() - t0,
		newSkill: Object.keys(skills).length - before.s,
		newTrans: Object.keys(translate).length - before.t,
	});
}

// ---------- 展开 subSkill（与群友设计口径一致，保证对比公平）----------
const expanded = {};
for (const [pid, info] of Object.entries(skills)) {
	expanded[pid] = info;
	if (info && info.subSkill && typeof info.subSkill === "object") {
		for (const [sn, si] of Object.entries(info.subSkill)) {
			expanded[`${pid}_${sn}`] = si;
		}
	}
}

const descKeys = Object.keys(translate).filter((k) => k.endsWith("_info"));
const out = {
	meta: {
		files: files.length,
		loadedAt: new Date().toISOString(),
		skills: Object.keys(skills).length,
		skillsExpanded: Object.keys(expanded).length,
		translateKeys: Object.keys(translate).length,
		descKeys: descKeys.length,
		errors: errors.length,
	},
	stats,
	errors,
	skillIds: Object.keys(expanded),
	descs: Object.fromEntries(descKeys.map((k) => [k, translate[k]])),
};

writeFileSync(new URL("./official-skills.json", import.meta.url), JSON.stringify(out, null, 0), "utf8");

console.log(`\n===== 官方技能加载完成 =====`);
console.log(`文件 ${out.meta.files} 个，失败 ${out.meta.errors} 个`);
console.log(`技能 ${out.meta.skills} 个，展开 subSkill 后 ${out.meta.skillsExpanded} 个`);
console.log(`翻译键 ${out.meta.translateKeys}，其中描述(_info) ${out.meta.descKeys} 条`);
if (errors.length) {
	console.log(`\n--- 加载失败明细 ---`);
	for (const e of errors) console.log(`  ${e.file}  ${e.err}`);
}
console.log(`\n--- 各文件贡献 (top15) ---`);
for (const s of [...stats].sort((a, b) => b.newSkill - a.newSkill).slice(0, 15)) {
	console.log(`  ${s.newSkill.toString().padStart(5)} 技能  ${s.newTrans.toString().padStart(5)} 翻译  ${s.ms}ms  ${s.file}`);
}
