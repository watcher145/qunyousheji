import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { getNoname } from "./mock-noname.mjs";
import { getKnownEvents, getEngineSkillNames } from "./engine-events.mjs";

register(new URL("./loader.mjs", import.meta.url));

const mock = getNoname();
const { lib, game, get, ui, _status } = mock;

// 引擎自带技能注入 mock（角色引用/翻译检查用）
const engineSkills = getEngineSkillNames();
for (const s of engineSkills) {
	if (!lib.skill[s]) lib.skill[s] = {};
}

const base = pathToFileURL("G:/game/noname/resources/app/extension/群友设计/src/").href;
const { skills: rawSkills } = await import(base + "skill/index.js");
const { characterData } = await import(base + "character/data.js");
const { characterTranslate } = await import(base + "character/translate.js");
const { characterTitle } = await import(base + "character/title.js");
const { characterIntro } = await import(base + "character/intro.js");
const { skillTranslate } = await import(base + "translate/skill.js");
const { getPackage } = await import(base + "package.js");

// 模拟引擎 expandSkills
const skills = { ...rawSkills };
const subParentOf = {};
for (const [parentId, info] of Object.entries(rawSkills)) {
	if (info.subSkill) {
		for (const [subName, subInfo] of Object.entries(info.subSkill)) {
			const subId = subInfo.skill_id || `${parentId}_${subName}`;
			skills[subId] = { ...subInfo, sourceSkill: info.sourceSkill || parentId };
			subParentOf[subId] = parentId;
		}
	}
}
for (const [k, v] of Object.entries(skills)) lib.skill[k] = v;

const expandedSubs = new Set(Object.keys(skills).filter((k) => !(k in rawSkills)));
const markerSuffix = /_(used|mark|clear|record|reset|disabled|ban|block|count|effect|tracker|end|draw|discard|watcher|return|check|dist|up|down|bonus|gain|loss|remove|sync|phase|roundReset|banned|handcard|norespond|restrict|backwater_bonus|damageCheck|applyDraw|zero|shan|die|ask|settle|backup|juedou|extra)$/;

const results = [];
const ok = (name, pass, detail = "") => {
	results.push({ name, pass, detail });
	if (!pass) console.log(`FAIL  ${name}  |  ${detail}`);
};

// ========== 0. content/filter 函数签名静态检查（无参引用 event/trigger/player = 真bug） ==========
const PARAM_NAMES = ["event", "trigger", "player"];
const GLOBALS = new Set(["game", "get", "ui", "lib", "_status", "Math", "Object", "Array", "String", "Number", "Boolean", "Promise", "Set", "Map", "console", "JSON", "Infinity", "NaN", "undefined", "parseInt", "parseFloat", "isNaN", "get", "qunyou", "zishu", "yachai", "clan", "shanhe", "qiufeng", "threed", "xiaobai", "zhuoming"]);
const checkSignature = (skillId, fnName, fn) => {
	if (typeof fn != "function") return;
	const src = fn.toString();
	const m = /^function\s*\(([^)]*)\)/.exec(src) || /^\(([^)]*)\)\s*=>/.exec(src);
	const params = m ? m[1].split(",").map((s) => s.trim().split("=")[0]).filter(Boolean) : null;
	if (params == null) return; // 无法解析（方法简写等）
	for (const p of PARAM_NAMES) {
		// 函数体内引用 p 但参数列表无 p
		if (!params.includes(p)) {
			const re = new RegExp(`\\b${p}\\b`);
			if (re.test(src)) {
				ok(`技能 ${skillId} ${fnName}签名`, false, `函数参数无 ${p} 但体内引用了 ${p}（真bug）`);
			}
		}
	}
};
for (const [skillId, info] of Object.entries(skills)) {
	for (const fnName of ["content", "filter", "cost", "precontent", "check", "onremove"]) {
		if (info[fnName]) checkSignature(skillId, fnName, info[fnName]);
	}
	if (info.chooseButton) {
		for (const fnName of ["dialog", "filter", "check", "backup", "prompt"]) {
			if (typeof info.chooseButton[fnName] == "function") checkSignature(skillId, "chooseButton." + fnName, info.chooseButton[fnName]);
		}
	}
	if (info.mod) {
		for (const [modName, modFn] of Object.entries(info.mod)) {
			if (typeof modFn == "function") checkSignature(skillId, "mod." + modName, modFn);
		}
	}
}

// ========== 1. 结构完整性 ==========
for (const [skillId, info] of Object.entries(skills)) {
	if (expandedSubs.has(skillId)) {
		// 子技能：纯标记（charlotte+mark/intro）、backup、AI配置、onremove 清理 都合法
		const isMarker = info.charlotte && (info.mark || info.intro || info.onremove || (info.trigger == null && info.mod == null));
		const isBackup = /_backup$/.test(skillId);
		const isAiCore = /_ai(_core)?$/.test(skillId) || (info.ai != null && info.trigger == null && info.mod == null);
		if (isMarker || isBackup || isAiCore) continue;
		const hasJob = info.trigger || info.mod || info.enable || info.mark || info.intro || info.onremove || info.init || info.content || info.ai;
		if (!hasJob) ok(`子技能 ${skillId} 结构`, false, "无任何职责字段");
		continue;
	}
	if (info.enable == null && info.trigger == null && info.mod == null && info.group == null && info.subSkill == null) {
		// 纯标记/觉醒技/纯容器（marktext+intro 或 awaken）合法；平铺子技能（父_子 命名）也合法
		const isMarkerSkill = (info.marktext && info.intro) || info.awaken || markerSuffix.test(skillId);
		if (!isMarkerSkill) ok(`技能 ${skillId} 结构`, false, "既非主动技也非触发技也非mod也非容器");
	}
	if (info.enable != null && typeof info.enable != "string" && !Array.isArray(info.enable)) {
		ok(`技能 ${skillId} enable 类型`, false);
	}
	if (info.trigger != null && typeof info.trigger != "object") {
		ok(`技能 ${skillId} trigger 类型`, false);
	}
	if (info.content != null && typeof info.content != "function" && typeof info.content != "string") {
		ok(`技能 ${skillId} content 类型`, false);
	}
	if (info.trigger != null && info.content == null && info.cost == null) {
		ok(`技能 ${skillId} content 缺失`, false, "触发技缺少 content 与 cost");
	}
	for (const g of [].concat(info.group || [])) {
		if (!skills[g] && !engineSkills.has(g)) ok(`技能 ${skillId} group 引用 ${g}`, false, "group 指向的技能不存在");
	}
	if (info.subSkill) {
		// 收集技能对象全部函数源码（含 content/filter/cost 等），用于动态引用检测
		const collectSrc = (obj) => {
			let src = "";
			for (const v of Object.values(obj)) {
				if (typeof v == "function") src += v.toString();
				else if (v && typeof v == "object") src += collectSrc(v);
			}
			return src;
		};
		const allSrc = collectSrc(info);
		for (const sub of Object.keys(info.subSkill)) {
			const subId = `${skillId}_${sub}`;
			const inGroup = [].concat(info.group || []).includes(subId);
			const refs = allSrc.includes(subId) || JSON.stringify(info).includes(subId);
			// 动态挂载：addSkill/addTempSkill/addMark 引用子技能（字面量或 skill+"_"+x 拼接）
			const dynPatterns = [
				`"${subId}"`,
				`'${subId}'`,
				`skill + "_${sub}"`,
				`skill + '${sub}'`,
			];
			const dynMount = dynPatterns.some((p) => allSrc.includes(p));
			// chooseButton.backup 引用的 backup 子技能
			const isBackupRef = sub == "backup" && info.chooseButton?.backup != null;
			// chooseButton 技能的子技能全部由 backup 动态驱动，豁免
			const isChooseBtnSkill = info.chooseButton != null;
			const isDynRef = info.subSkill[sub].charlotte && (info.subSkill[sub].mark || info.subSkill[sub].intro);
			if (!inGroup && !refs && !dynMount && !isBackupRef && !isChooseBtnSkill && !isDynRef && !info.subSkill[sub].charlotte) {
				ok(`技能 ${skillId} 子技能 ${sub}`, false, `${subId} 未被 group 挂载也未动态引用`);
			}
		}
	}
}

// ========== 2. 事件名合法性 ==========
const knownEvents = getKnownEvents();
for (const [skillId, info] of Object.entries(skills)) {
	const src = String(info.content || "") + String(info.precontent || "") + String(info.cost || "");
	const re = /createEvent\(["']([a-zA-Z][a-zA-Z0-9_]*)["']\)/g;
	let m;
	while ((m = re.exec(src))) knownEvents.add(m[1]);
}
const evtShape = /^[a-zA-Z][a-zA-Z0-9_]*$/;
for (const [skillId, info] of Object.entries(skills)) {
	const trig = info.trigger;
	if (!trig) continue;
	const scan = (eventName) => {
		if (typeof eventName != "string" || !evtShape.test(eventName)) return;
		if (!knownEvents.has(eventName)) {
			ok(`技能 ${skillId} 事件名 ${eventName}`, false, "引擎与扩展均无此事件");
		}
	};
	for (const key of ["player", "global", "target", "source"]) {
		const v = trig[key];
		if (Array.isArray(v)) v.forEach(scan);
		else if (v) scan(v);
	}
}

// ========== 3. 翻译/角色/包完整性 ==========
for (const skillId of Object.keys(skills)) {
	if (expandedSubs.has(skillId) && markerSuffix.test(skillId)) continue;
	const sinfo = skills[skillId];
	// 纯 mod 辅助技能（无任何 UI/触发面）不需要翻译
	const isPureMod = sinfo.mod != null && sinfo.trigger == null && sinfo.enable == null && sinfo.mark == null && sinfo.intro == null;
	if (isPureMod) continue;
	if (!skillTranslate[skillId] && !skillTranslate[skillId + "_info"]) {
		const parent = subParentOf[skillId] || skillId.slice(0, skillId.lastIndexOf("_"));
		if (parent && skillTranslate[parent]) continue;
		ok(`翻译 ${skillId}`, false, "缺少技能名与 info 翻译");
	}
}
const knownMissingTitle = new Set(["zishu_wangguan", "qunyou_dongzhuo"]);
for (const charId of Object.keys(characterData)) {
	if (!characterTranslate[charId]) ok(`角色翻译 ${charId}`, false, "缺少名字");
	if (characterTitle[charId] == null && !knownMissingTitle.has(charId)) ok(`角色称号 ${charId}`, false, "缺少 title");
	if (characterIntro[charId] == null) ok(`角色 intro ${charId}`, false, "缺少 intro");
	for (const s of characterData[charId].skills || []) {
		if (!skills[s] && !lib.skill[s]) ok(`角色 ${charId} 技能 ${s}`, false, "技能不存在");
	}
}
const pkg = getPackage();
for (const [pkgName, list] of Object.entries(pkg.character.characterSort?.mode_extension_群友设计 || {})) {
	for (const cid of list) {
		if (!characterData[cid]) ok(`包 ${pkgName} 引用 ${cid}`, false, "角色不存在");
	}
}

// ========== 4. content 沙盒执行 ==========
const stubPlayer = () => {
	const player = {
		storage: {},
		hp: 3,
		maxHp: 3,
		playerid: "p1",
		stat: [{ skill: {}, card: {} }],
		actionHistory: [{ useSkill: [], lose: [], gain: [], useCard: [] }],
		getHistory: () => [],
		getStat: (k) => (k ? player.stat[0][k] : player.stat[0]),
		isIn: () => true,
		isDying: () => false,
		isDead: () => false,
		isDamaged: () => false,
		isHealthy: () => true,
		isLinked: () => false,
		isTurnedOver: () => false,
		countCards: () => 3,
		getCards: () => [],
		hasCard: () => true,
		getUseValue: () => 1,
		getDamagedHp: () => 1,
		getStorage: (k) => player.storage[k] || [],
		markSkill: () => {},
		unmarkSkill: () => {},
		updateMarks: () => {},
		draw: async () => {},
		discard: async () => {},
		gain: async () => {},
		recover: async () => {},
		loseHp: async () => {},
		chooseBool: async () => ({ bool: false }),
		chooseCard: async () => ({ bool: false, cards: [] }),
		chooseControl: async () => ({ bool: false }),
		chooseButton: async () => ({ bool: false, links: [] }),
		chooseTarget: async () => ({ bool: false, targets: [] }),
		chooseToMove_new: async () => ({ bool: false }),
		chooseToCompare: async () => ({ winner: player }),
		changeZhuanhuanji: () => {},
		logSkill: () => {},
		showCards: async () => {},
		popup: () => {},
		addSkill: () => {},
		removeSkill: () => {},
		addTempSkill: () => {},
		markAuto: () => {},
		unmarkAuto: () => {},
	};
	return player;
};
const fakeEvent = {
	name: "test",
	player: null,
	target: null,
	card: { name: "sha", isCard: true, storage: {} },
	cards: [],
	targets: [],
	changedHp: -1,
	num: 1,
	getParent: () => null,
	getl: () => ({ hs: [], cards2: [] }),
	getd: () => [],
	getg: () => [],
};
const fakeTrigger = { ...fakeEvent };

const contentSandbox = async (skillId, fn) => {
	const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("死循环/超时")), 3000));
	try {
		await Promise.race([fn(), timeout]);
		return { pass: true, detail: "" };
	} catch (e) {
		if (e instanceof ReferenceError) {
			return { pass: false, detail: `ReferenceError: ${e.message}` };
		}
		if (e.message == "死循环/超时") {
			return { pass: false, detail: "content 超时（疑似死循环）" };
		}
		return { pass: true, detail: `[mock限制] ${e.constructor.name}: ${String(e.message).slice(0, 100)}` };
	}
};

for (const [skillId, info] of Object.entries(skills)) {
	if (!info.content || typeof info.content != "function") continue;
	const player = stubPlayer();
	fakeEvent.player = player;
	fakeTrigger.player = player;
	const r = await contentSandbox(skillId, async () => {
		await info.content.call(info, fakeEvent, fakeTrigger, player);
	});
	if (!r.pass) {
		ok(`技能 ${skillId} content 执行`, false, r.detail);
	} else {
		results.push({ name: `技能 ${skillId} content`, pass: true, detail: r.detail });
	}
	// StepCompiler 全局化模拟：提取 content 函数体，new Function 全局作用域执行
	const r2 = await contentSandbox(skillId + "(全局化)", async () => {
		const src = info.content.toString();
		// 提取函数体：content(event, trigger, player) { ... } / content() { ... } / function content() {...} / 箭头
		const m =
			/^(?:function\s*)?\w*\s*\([^)]*\)\s*\{([\s\S]*)\}$/.exec(src) ||
			/^\([^)]*\)\s*=>\s*\{([\s\S]*)\}$/.exec(src) ||
			/^([\s\S]*)$/.exec(src);
		const body = m ? m[1] : src;
		const fn = new Function(
			"event", "trigger", "player", "game", "get", "lib", "ui", "_status",
			`return (async () => { ${body} })();`
		);
		await fn(fakeEvent, fakeTrigger, player, game, get, lib, ui, _status);
	});
	if (!r2.pass) {
		ok(`技能 ${skillId} content 全局化`, false, r2.detail);
	} else {
		results.push({ name: `技能 ${skillId} content 全局化`, pass: true, detail: "" });
	}
}

// ========== 汇总 ==========
const fails = results.filter((r) => !r.pass);
console.log("\n========== 汇总 ==========");
console.log(`总检查 ${results.length} 项，失败 ${fails.length} 项`);
for (const f of fails) console.log(`  FAIL ${f.name} | ${f.detail}`);
if (fails.length) {
	process.exitCode = 1;
} else {
	console.log("全部通过");
}