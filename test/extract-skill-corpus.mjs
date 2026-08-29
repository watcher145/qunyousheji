import { register } from "node:module";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { getNoname } from "./mock-noname.mjs";

register(new URL("./loader.mjs", import.meta.url));

const mock = getNoname();
const { lib, game, get, ui, _status } = mock;

// 收集 game.import 注册的包
const packs = [];
game.import = (type, fn) => {
	try {
		const obj = typeof fn == "function" ? fn() : fn;
		packs.push({ type, obj });
		return obj;
	} catch (e) {
		return null;
	}
};

const CHAR_DIR = "G:/game/noname/resources/app/character";
const files = [];
(function walk(d) {
	for (const f of readdirSync(d)) {
		const p = join(d, f);
		if (statSync(p).isDirectory()) {
			if (f.startsWith(".") || f == "node_modules") continue;
			walk(p);
		} else if (f.endsWith(".js") && !f.endsWith(".bak")) {
			files.push(p);
		}
	}
})(CHAR_DIR);

console.log("character/ 下 .js 文件数:", files.length);

let loaded = 0,
	failed = 0;
for (const file of files) {
	try {
		await import(pathToFileURL(file).href);
		loaded++;
	} catch (e) {
		failed++;
		if (failed <= 5) console.log("加载失败:", relative(CHAR_DIR, file), e.message?.slice(0, 120));
	}
}
console.log("加载成功:", loaded, "失败:", failed);
console.log("收集包数:", packs.length);

// 聚合技能 + 翻译
const skills = {};
const translates = {};
for (const p of packs) {
	if (p.obj.skill && typeof p.obj.skill == "object") Object.assign(skills, p.obj.skill);
	if (p.obj.translate && typeof p.obj.translate == "object") Object.assign(translates, p.obj.translate);
}
console.log("聚合技能数:", Object.keys(skills).length);
console.log("聚合翻译键数:", Object.keys(translates).length);

// 提取每个技能的结构化特征
const API_PATTERN = /(?:player|target|game|get|ui|trigger|event)[.\[]?\s*[a-zA-Z_$][\w$]*\.([a-zA-Z_$][\w$]*)\s*\(/g;
const PATTERN_TAGS = [
	["locked", /locked:\s*true/],
	["forced", /forced:\s*true/],
	["limited", /limited:\s*true/],
	["awaken", /awaken:\s*true/],
	["zhuanhuanji", /zhuanhuanji/],
	["comboSkill", /comboSkill:\s*true/],
	["clanSkill", /clanSkill:\s*true/],
	["mission", /mission:\s*true|jishi\s*:\s*true/],
	["beishui", /beishui:\s*true/],
	["angyang", /angyang:\s*true/],
	["mark", /mark:\s*true/],
	["marktext", /marktext:/],
	["charlotte", /charlotte:\s*true/],
	["direct", /direct:\s*true/],
	["usable", /usable:/],
	["round", /round:/],
	["enable", /enable:\s*/],
	["chooseButton", /chooseButton:/],
	["viewAs", /viewAs:/],
	["hiddenCard", /hiddenCard/],
	["mod", /mod:\s*\{/],
	["init", /init\s*\(/],
	["onremove", /onremove/],
	["precontent", /precontent/],
	["getIndex", /getIndex/],
	["skillAnimation", /skillAnimation:/],
];
const EVENT_KEY = ["player", "global", "target", "source"];

function extractFeatures(id, skillObj) {
	const src = typeof skillObj == "function" ? skillObj.toString() : "";
	const objSrc = (() => {
		try {
			return JSON.stringify(skillObj, (k, v) => {
				if (typeof v == "function") return `__FN__${v.toString().slice(0, 2000)}`;
				if (v === undefined) return "__UNDEF__";
				return v;
			});
		} catch {
			return "";
		}
	})();
	const allSrc = src + objSrc;
	const features = { id };
	// trigger 事件
	if (skillObj.trigger) {
		features.trigger = {};
		for (const k of EVENT_KEY) {
			const v = skillObj.trigger[k];
			if (v) features.trigger[k] = Array.isArray(v) ? v : [v];
		}
	}
	// enable
	if (skillObj.enable) features.enable = Array.isArray(skillObj.enable) ? skillObj.enable : [skillObj.enable];
	// mod
	if (skillObj.mod) features.mod = Object.keys(skillObj.mod);
	// group
	if (skillObj.group) features.group = Array.isArray(skillObj.group) ? skillObj.group : [skillObj.group];
	// 模式标签
	features.tags = [];
	for (const [tag, re] of PATTERN_TAGS) {
		if (re.test(allSrc)) features.tags.push(tag);
	}
	// 关键 API 调用（从 content/filter 源码提取）
	const apis = new Set();
	let m;
	const re = new RegExp(API_PATTERN.source, "g");
	while ((m = re.exec(allSrc))) apis.add(m[1]);
	features.apis = [...apis].slice(0, 60);
	// 结构摘要（供检索展示）
	features.structure = {
		hasSubSkill: !!skillObj.subSkill,
		subSkillCount: skillObj.subSkill ? Object.keys(skillObj.subSkill).length : 0,
		hasContent: !!skillObj.content,
		hasCost: !!skillObj.cost,
		hasFilter: !!skillObj.filter,
		hasCheck: !!skillObj.check,
	};
	return features;
}

const corpus = [];
for (const [id, skillObj] of Object.entries(skills)) {
	if (typeof skillObj != "object" || skillObj == null) continue;
	const info = translates[id + "_info"];
	const name = translates[id];
	const feat = extractFeatures(id, skillObj);
	feat.name = typeof name == "string" ? name : id;
	feat.info = typeof info == "string" ? info : "";
	corpus.push(feat);
}
console.log("语料技能数:", corpus.length);
console.log("有描述(info)的技能:", corpus.filter((c) => c.info).length);

writeFileSync(join(import.meta.dirname, "skills-corpus.json"), JSON.stringify(corpus, null, 1), "utf8");
console.log("已写入 skills-corpus.json");