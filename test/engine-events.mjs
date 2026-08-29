import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(d, out = []) {
	for (const f of readdirSync(d)) {
		const p = join(d, f);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (f.endsWith(".js") || f.endsWith(".ts")) out.push(p);
	}
	return out;
}

const ENGINE = "G:/game/noname/resources/app/noname";
const events = new Set();
// 1. content 定义键（基础事件）
const contentSrc = readFileSync(join(ENGINE, "library/element/content.js"), "utf8");
for (const l of contentSrc.split(/\r?\n/)) {
	const m = /^\s{2}([a-zA-Z_][a-zA-Z0-9_]*): \[\s*$/.exec(l);
	if (m) events.add(m[1]);
}
// 2. 源码里所有带后缀的事件字符串与 useCardTo/chooseTo 系
for (const file of walk(ENGINE)) {
	const src = readFileSync(file, "utf8");
	const re = /"([a-zA-Z][a-zA-Z0-9_]*(?:Before|Begin\d?|End\d?|After\d?|Omitted))"/g;
	let m;
	while ((m = re.exec(src))) events.add(m[1]);
	const re2 = /"((?:useCardTo|chooseTo|addToExpansion|loseToDiscardpile|discardPlayerCard|gainPlayerCard)[a-zA-Z0-9_]*)"|"((?:useCard|respond|gain|lose|damage|dying|die|judge|phase)[a-zA-Z0-9_]*)"/g;
	while ((m = re2.exec(src))) {
		if (m[1]) events.add(m[1]);
		if (m[2]) events.add(m[2]);
	}
	// 3. trigger("xxx") / createEvent("xxx") 派发名
	const re3 = /(?:trigger|createEvent|game\.trigger)\("([a-zA-Z][a-zA-Z0-9_]*)"\)/g;
	while ((m = re3.exec(src))) events.add(m[1]);
	// 4. trigger: { player/global/target/source: "xxx" } 监听名
	const re4 = /(?:player|global|target|source):\s*\[?["']([a-zA-Z][a-zA-Z0-9_]*)["']/g;
	while ((m = re4.exec(src))) events.add(m[1]);
}

export function addCustomEvents(list) {
	for (const x of list || []) events.add(x);
}

// 引擎 library/skill.js 顶层技能名（角色引用的引擎技能判定用）
export function getEngineSkillNames() {
	const names = new Set();
	const src = readFileSync(join(ENGINE, "library/skill.js"), "utf8");
	const re = /^  ([a-zA-Z_$][\w$]*): \{/gm;
	let m;
	while ((m = re.exec(src))) names.add(m[1]);
	// 官方 character 包技能（character/*.js 及子目录 skill.js 的顶层定义）
	const CHAR = "G:/game/noname/resources/app/character";
	for (const file of walk(CHAR)) {
		const t = readFileSync(file, "utf8");
		const re2 = /^  ([a-zA-Z_$][\w$]*): \{/gm;
		while ((m = re2.exec(t))) names.add(m[1]);
		// 有些文件顶层不缩进
		const re3 = /^([a-zA-Z_$][\w$]*): \{/gm;
		while ((m = re3.exec(t))) names.add(m[1]);
	}
	return names;
}

export function getKnownEvents() {
	// 补：基础事件 X 自动派发所有后缀变体
	const baseNames = new Set();
	for (const e of events) {
		const b = e.replace(/(Before|Begin\d?|End\d?|After\d?|Omitted)$/, "");
		baseNames.add(b);
	}
	for (const b of baseNames) {
		events.add(b);
		events.add(b + "Before");
		events.add(b + "Begin");
		events.add(b + "Begin1");
		events.add(b + "Begin2");
		events.add(b + "Begin3");
		events.add(b + "Begin4");
		events.add(b + "End");
		events.add(b + "End1");
		events.add(b + "After");
		events.add(b + "Omitted");
	}
	// 引擎级特殊事件
	for (const x of ["shaMiss", "wuguRemained", "useCardToBegin", "eventNeutralized", "compareFixing", "enterGame", "damageSource", "removeJiu", "shaDamage", "phaseBeginAfter", "phaseBeginStart", "phaseBeginStartAfter", "changeHujia"]) {
		events.add(x);
	}
	// 引擎 library/skill.js 与 hooks 中监听的技能级事件
	const skillSrc = readFileSync(join(ENGINE, "library/skill.js"), "utf8");
	const hookSrc = readFileSync(join(ENGINE, "library/hooks/index.js"), "utf8");
	for (const src of [skillSrc, hookSrc]) {
		const re = /(?:player|global|target|source):\s*\[?["']([a-zA-Z][a-zA-Z0-9_]*)["']/g;
		let m;
		while ((m = re.exec(src))) events.add(m[1]);
	}
	return events;
}
if (import.meta.url === process.argv[1] && !process.argv[1]?.includes("skill-test")) {
	console.log("事件数:", events.size);
}