// 重建训练数据集：正对 = (技能A描述, 技能B特征) 当 A、B 有相同触发时机/模式（同类技能）
// 这样模型学的是"描述 → 同类技能的代码特征"，检索时按特征找同类
// 用法: node build-dataset-v2.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(__dirname, "skills-corpus.json"), "utf8"));

// 只保留有描述的
const usable = corpus.filter((s) => s.info && s.info.length >= 10);
console.log(`有描述技能: ${usable.length}`);

// 同类键：触发时机（trigger.player/global 首位事件）或模式（tags）
function simKey(s) {
	const evts = [];
	if (s.trigger) {
		for (const [k, v] of Object.entries(s.trigger)) for (const e of v) evts.push(`${k}:${e}`);
	}
	if (evts.length) return "trigger:" + evts[0];
	// 无触发：按 enable 首位
	if (s.enable?.length) return "enable:" + s.enable[0];
	return "other";
}

// 特征文本（doc 侧）
function buildFeatureText(s) {
	const parts = [];
	if (s.name) parts.push(`技能名：${s.name}`);
	if (s.tags?.length) parts.push(`标签：${s.tags.join("、")}`);
	if (s.enable?.length) parts.push(`类型：${s.enable.join("、")}`);
	if (s.trigger) {
		const evts = [];
		for (const [k, v] of Object.entries(s.trigger)) for (const e of v) evts.push(`${k}:${e}`);
		if (evts.length) parts.push(`时机：${evts.join("、")}`);
	}
	if (s.mod?.length) parts.push(`mod：${s.mod.join("、")}`);
	if (s.apis?.length) parts.push(`API：${s.apis.join("、")}`);
	if (s.group?.length) parts.push(`挂载：${s.group.join("、")}`);
	return parts.join("\n");
}

// 按同类键分组
const groups = {};
for (const s of usable) {
	const key = simKey(s);
	(groups[key] = groups[key] || []).push(s);
}
console.log(`同类组: ${Object.keys(groups).length}`);

// 构造正对：(A描述, B特征) A、B 同组；负对：随机异组
const positives = [];
const negatives = [];
const groupList = Object.values(groups);
for (const g of groupList) {
	if (g.length < 2) continue;
	// 组内两两配正对（限制数量）
	const pairs = Math.min(g.length * 2, 40);
	for (let i = 0; i < pairs && i < g.length; i++) {
		const a = g[i];
		const b = g[(i + 1) % g.length];
		positives.push({ query: a.info, doc: buildFeatureText(b) });
	}
}
// 负对：随机取 2 个不同组
for (let i = 0; i < Math.min(positives.length, 8000); i++) {
	const g1 = groupList[Math.floor(Math.random() * groupList.length)];
	const g2 = groupList[Math.floor(Math.random() * groupList.length)];
	if (g1 === g2 || !g1?.length || !g2?.length) continue;
	const a = g1[Math.floor(Math.random() * g1.length)];
	const b = g2[Math.floor(Math.random() * g2.length)];
	if (a && b) negatives.push({ query: a.info, doc: buildFeatureText(b) });
}
console.log(`正对: ${positives.length}, 负对: ${negatives.length}`);

writeFileSync(join(__dirname, "train-pairs-v2.json"), JSON.stringify({ positives, negatives }), "utf8");
console.log("已写入 train-pairs-v2.json");