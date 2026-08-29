// 模型对比评测：基座 vs v1 vs v2，在 eval 用例上的 TopN 语义相关率
// 用法: node eval-models.mjs [base|v1|v2]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 评测用例（语义相关性判定）
const CASES = [
	{ desc: "你可以将本回合弃牌堆两张基本牌置于牌堆两侧，视为使用一张基本牌", kw: ["视为", "基本牌"] },
	{ desc: "当你使用牌后，你可以明置一张手牌，你使用明置牌无距离和次数限制", kw: ["明置", "无距离"] },
	{ desc: "当你的体力值变化后，你暗置明置牌中一个类别的牌", kw: ["体力值", "明置"] },
	{ desc: "当你进入濒死状态时，你可以令一名其他角色获得你的技能", kw: ["濒死", "技能"] },
	{ desc: "出牌阶段限一次，你可以与一名其他角色拼点", kw: ["拼点"] },
	{ desc: "结束阶段，你可以摸一张牌并重复至手牌数全场唯一", kw: ["手牌数", "摸"] },
	{ desc: "当你使用杀指定目标后，你可以将其一张牌移出游戏至回合结束", kw: ["移出", "回合结束"] },
	{ desc: "准备阶段，其他角色可以依次请求与你交换手牌", kw: ["交换", "手牌"] },
	{ desc: "你使用的牌无距离和次数限制", kw: ["无距离", "次数限制"] },
	{ desc: "当你的手牌被弃置后，你可以获得其中一张牌", kw: ["弃置", "获得"] },
	{ desc: "当你成为其他角色使用牌的目标时，你可以令此牌对你无效", kw: ["目标", "无效"] },
	{ desc: "每轮限一次，当你造成伤害后，你可以获得其一张牌", kw: ["造成伤害", "获得"] },
];

const MODEL = process.argv[2] || "base"; // base/v1/v2
const corpus = JSON.parse(readFileSync(join(__dirname, "skills-corpus.json"), "utf8"));

function buildDocText(s) {
	const parts = [];
	if (s.name) parts.push(`技能名：${s.name}`);
	if (s.info) parts.push(`描述：${s.info}`);
	if (s.tags?.length) parts.push(`标签：${s.tags.join("、")}`);
	if (s.enable?.length) parts.push(`类型：${s.enable.join("、")}`);
	if (s.trigger) {
		const evts = [];
		for (const [k, v] of Object.entries(s.trigger)) for (const e of v) evts.push(`${k}:${e}`);
		if (evts.length) parts.push(`时机：${evts.join("、")}`);
	}
	if (s.apis?.length) parts.push(`API：${s.apis.join("、")}`);
	return parts.join("\n");
}
function cosine(a, b) {
	let dot = 0, na = 0, nb = 0;
	for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
	return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// 加载模型 + 计算向量
process.env.TUNED = MODEL == "base" ? "0" : MODEL;
const { pipeline, env } = await import(
	"file:///G:/game/noname/resources/app/extension/群友设计/test/node_modules/@huggingface/transformers/src/transformers.js"
);
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = join(__dirname, "models") + "/";
const modelName = MODEL == "base" ? "Xenova/bge-base-zh-v1.5" : MODEL == "v1" ? "tuned-bge-zh-onnx" : "tuned-bge-zh-v2-onnx";
console.log(`模型: ${MODEL} (${modelName})`);
const pipe = await pipeline("feature-extraction", modelName, { dtype: MODEL == "base" ? "q8" : "fp32" });

async function embed(text) {
	const out = await pipe(text, { pooling: "mean", normalize: true });
	return Array.from(out.data);
}

const docTexts = corpus.map(buildDocText);
const cacheFile = join(__dirname, `embed-cache-${MODEL}.json`);
let docVecs = [];
if (existsSync(cacheFile)) {
	docVecs = JSON.parse(readFileSync(cacheFile, "utf8"));
	console.log(`载入向量缓存 ${docVecs.length} 条`);
}
if (!docVecs.length) {
	console.log("计算语料向量（约 2-4 分钟）...");
	for (let i = 0; i < docTexts.length; i++) {
		docVecs.push(await embed(docTexts[i]));
		if (i % 1000 == 0) process.stdout.write(`  ${i}/${docTexts.length}\n`);
	}
	writeFileSync(cacheFile, JSON.stringify(docVecs), "utf8");
	console.log(`缓存已写入 ${cacheFile}`);
}

// 评测
let top1 = 0, top3 = 0, top5 = 0;
for (const c of CASES) {
	const qVec = await embed(c.desc);
	let ranked = [];
	for (let i = 0; i < corpus.length; i++) {
		ranked.push({ id: corpus[i].id, info: corpus[i].info || "", sim: cosine(qVec, docVecs[i]) });
	}
	ranked.sort((a, b) => b.sim - a.sim);
	const top5r = ranked.slice(0, 5);
	const rel = (n) => top5r.slice(0, n).some((r) => c.kw.some((kw) => r.info.includes(kw)));
	top1 += rel(1) ? 1 : 0;
	top3 += rel(3) ? 1 : 0;
	top5 += rel(5) ? 1 : 0;
}
console.log(`\n===== ${MODEL.toUpperCase()} 评测结果 =====`);
console.log(`用例 ${CASES.length} | Top1 相关 ${top1} (${(top1 / CASES.length * 100).toFixed(0)}%) | Top3 ${top3} (${(top3 / CASES.length * 100).toFixed(0)}%) | Top5 ${top5} (${(top5 / CASES.length * 100).toFixed(0)}%)`);