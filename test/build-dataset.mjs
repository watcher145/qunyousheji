// 构建训练数据集：原生技能 (描述, 特征文本) 对 + 模式标签 + 硬负例
// 用法: node build-dataset.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(__dirname, "skills-corpus.json"), "utf8"));
console.log(`语料: ${corpus.length} 技能`);

// 模式标签规则（从技能对象特征推断）
const PATTERN_RULES = [
	{ name: "印牌类", test: (s) => (s.enable || []).some((e) => ["chooseToUse", "chooseToRespond"].includes(e)) && (s.apis || []).includes("autoViewAs") },
	{ name: "转化类", test: (s) => (s.enable || []).some((e) => ["chooseToUse", "chooseToRespond", "phaseUse"].includes(e)) && (s.tags || []).includes("viewAs") },
	{ name: "触发类-受伤", test: (s) => !!s.trigger && (s.trigger.player || []).some((e) => e.includes("damage") || e.includes("loseHp") || e.includes("changeHp")) },
	{ name: "触发类-用牌", test: (s) => !!s.trigger && (s.trigger.player || []).some((e) => e.includes("useCard")) },
	{ name: "触发类-回合", test: (s) => !!s.trigger && (s.trigger.player || []).some((e) => e.includes("phase")) },
	{ name: "触发类-全局", test: (s) => !!s.trigger && !!s.trigger.global },
	{ name: "触发类-目标", test: (s) => !!s.trigger && (s.trigger.target || []).length > 0 },
	{ name: "触发类-来源", test: (s) => !!s.trigger && (s.trigger.source || []).length > 0 },
	{ name: "觉醒技", test: (s) => (s.tags || []).includes("awaken") || (s.tags || []).includes("limited") },
	{ name: "限定技", test: (s) => (s.tags || []).includes("limited") },
	{ name: "锁定技", test: (s) => (s.tags || []).includes("locked") || (s.tags || []).includes("forced") },
	{ name: "转换技", test: (s) => (s.tags || []).includes("zhuanhuanji") },
	{ name: "连招技", test: (s) => (s.tags || []).includes("comboSkill") },
	{ name: "宗族技", test: (s) => (s.tags || []).includes("clanSkill") },
	{ name: "标记技", test: (s) => (s.tags || []).includes("mark") || (s.tags || []).includes("marktext") },
	{ name: "摸牌类", test: (s) => (s.apis || []).includes("draw") },
	{ name: "弃牌类", test: (s) => (s.apis || []).includes("discard") || (s.apis || []).includes("chooseToDiscard") },
	{ name: "伤害类", test: (s) => (s.apis || []).includes("damage") },
	{ name: "回复类", test: (s) => (s.apis || []).includes("recover") },
	{ name: "失去体力类", test: (s) => (s.apis || []).includes("loseHp") },
	{ name: "拼点类", test: (s) => (s.apis || []).includes("chooseToCompare") },
	{ name: "交换类", test: (s) => (s.apis || []).includes("swapHandcards") },
	{ name: "判定类", test: (s) => (s.apis || []).includes("judge") },
	{ name: "明置/翻面类", test: (s) => (s.apis || []).includes("turnOver") || (s.apis || []).includes("addGaintag") },
	{ name: "濒死类", test: (s) => !!s.trigger && (s.trigger.player || []).some((e) => e.includes("dying")) },
	{ name: "移出游戏类", test: (s) => (s.apis || []).includes("addToExpansion") || (s.apis || []).includes("cardsGotoSpecial") },
	{ name: "自定义事件", test: (s) => (s.apis || []).includes("createEvent") },
];

// 为技能打模式标签
function tagPatterns(s) {
	const tags = [];
	for (const r of PATTERN_RULES) {
		try {
			if (r.test(s)) tags.push(r.name);
		} catch {}
	}
	return tags;
}

// 构建特征文本（训练用 doc 侧；描述是 query 侧）
function buildFeatureText(s, patterns) {
	const parts = [];
	if (s.name) parts.push(`技能名：${s.name}`);
	if (patterns.length) parts.push(`模式：${patterns.join("、")}`);
	if (s.enable?.length) parts.push(`类型：${s.enable.join("、")}`);
	if (s.trigger) {
		const evts = [];
		for (const [k, v] of Object.entries(s.trigger)) for (const e of v) evts.push(`${k}:${e}`);
		if (evts.length) parts.push(`时机：${evts.join("、")}`);
	}
	if (s.tags?.length) parts.push(`标签：${s.tags.join("、")}`);
	if (s.mod?.length) parts.push(`mod：${s.mod.join("、")}`);
	if (s.apis?.length) parts.push(`API：${s.apis.join("、")}`);
	if (s.group?.length) parts.push(`挂载：${s.group.join("、")}`);
	if (s.structure?.subSkillCount) parts.push(`子技能数：${s.structure.subSkillCount}`);
	return parts.join("\n");
}

// 仅保留有描述且有意义的技能
const usable = corpus.filter((s) => s.info && s.info.length >= 10);
console.log(`有描述技能: ${usable.length}`);

// 数据集样本
const samples = [];
for (const s of usable) {
	const patterns = tagPatterns(s);
	const feature = buildFeatureText(s, patterns);
	if (!feature) continue;
	samples.push({
		id: s.id,
		name: s.name || s.id,
		desc: s.info, // query
		feature, // doc
		patterns,
	});
}
console.log(`数据集样本: ${samples.length}`);

// 硬负例：描述相似但模式不同的技能对（训练区分"同描述不同实现"）
// 策略：按描述关键词分组，组内找模式不同的对
const hardNegatives = [];
const descGroups = {};
for (const s of samples) {
	// 用描述前 12 字作为粗分组键（相似开头）
	const key = s.desc.slice(0, 12);
	(descGroups[key] = descGroups[key] || []).push(s);
}
for (const group of Object.values(descGroups)) {
	if (group.length < 2) continue;
	for (let i = 0; i < group.length; i++) {
		for (let j = i + 1; j < group.length; j++) {
			const a = group[i], b = group[j];
			const common = a.patterns.filter((p) => b.patterns.includes(p)).length;
			if (common === 0) {
				hardNegatives.push([a.id, b.id]);
			}
		}
	}
}
console.log(`硬负例对: ${hardNegatives.length}`);

// 评估集：人工挑选的代表性描述（后续人工标注参考技能）
const evalCases = [
	"你可以将一张牌当任意基本牌或普通锦囊牌使用",
	"当你使用牌后，你可以摸一张牌",
	"出牌阶段限一次，你可以与一名其他角色拼点",
	"锁定技，当你受到伤害后，你摸一张牌",
	"你可以将一张红色牌当【杀】使用或打出",
	"当你成为其他角色使用牌的目标时，你可以令此牌对你无效",
	"限定技，当你进入濒死状态时，你可以回复至1点体力",
	"当你失去最后一张手牌后，你摸两张牌",
	"准备阶段，你可以弃置一张牌并摸一张牌",
	"你使用的【杀】无距离和次数限制",
];

// 保存数据集
const out = {
	version: "1.0",
	builtAt: new Date().toISOString(),
	count: samples.length,
	samples,
	hardNegatives,
	evalCases,
};
writeFileSync(join(__dirname, "train-dataset.json"), JSON.stringify(out), "utf8");
console.log(`已写入 train-dataset.json (${(JSON.stringify(out).length / 1024 / 1024).toFixed(1)} MB)`);