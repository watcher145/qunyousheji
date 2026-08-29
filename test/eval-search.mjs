// 回测：用群友设计真实技能描述检索原生参考，检查 Top-K 语义相关性
// 语义相关性自动判定：Top5 技能的描述是否包含期望关键词（任一命中即算相关）
// 用法: node eval-search.mjs
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 测试集：真实技能描述 → 期望在 Top-K 技能描述中出现的语义关键词
const TESTS = [
	{
		desc: "你可以将本回合弃牌堆两张基本牌置于牌堆两侧，视为使用一张基本牌",
		keywords: ["视为", "基本牌"],
	},
	{
		desc: "当你使用牌后，你可以明置一张手牌，你使用明置牌无距离和次数限制",
		keywords: ["明置", "无距离"],
	},
	{
		desc: "当你的体力值变化后，你暗置明置牌中一个类别的牌",
		keywords: ["体力", "明置"],
	},
	{
		desc: "当你进入濒死状态时，你可以令一名其他角色获得你的一个技能",
		keywords: ["濒死", "技能"],
	},
	{
		desc: "出牌阶段限一次，你可以与一名其他角色拼点，若你赢，其不能使用或打出牌直到回合结束",
		keywords: ["拼点"],
	},
	{
		desc: "结束阶段，你可以摸一张牌并重复至手牌数全场唯一",
		keywords: ["手牌数", "摸"],
	},
	{
		desc: "当你使用杀指定目标后，你可以将其一张牌移出游戏至回合结束",
		keywords: ["移出", "回合结束"],
	},
	{
		desc: "准备阶段，其他角色可以依次请求与你交换手牌",
		keywords: ["交换", "手牌"],
	},
	{
		desc: "你使用的牌无距离和次数限制",
		keywords: ["无距离", "次数限制"],
	},
	{
		desc: "当你的手牌被弃置后，你可以获得其中一张牌",
		keywords: ["弃置", "获得"],
	},
	{
		desc: "当你成为其他角色使用牌的目标时，你可以令此牌对你无效",
		keywords: ["目标", "无效"],
	},
	{
		desc: "每轮限一次，当你造成伤害后，你可以获得其一张牌",
		keywords: ["造成伤害", "获得"],
	},
];

const CORPUS_FILE = join(__dirname, "skills-corpus.json");
const corpus = JSON.parse(readFileSync(CORPUS_FILE, "utf8"));
const cacheFile = join(__dirname, "embed-cache.json");
let docVecs = [];
if (existsSync(cacheFile)) {
	docVecs = JSON.parse(readFileSync(cacheFile, "utf8"));
}

const { pipeline, env } = await import(
	"file:///G:/game/noname/resources/app/extension/群友设计/test/node_modules/@huggingface/transformers/src/transformers.js"
);
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = join(__dirname, "models") + "/";
const pipe = await pipeline("feature-extraction", "Xenova/bge-base-zh-v1.5", { dtype: "q8" });

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
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
async function embed(text) {
	const out = await pipe(text, { pooling: "mean", normalize: true });
	return Array.from(out.data);
}

const docTexts = corpus.map(buildDocText);
let hitTotal = 0,
	hitTop3 = 0,
	hitTop5 = 0,
	bestSims = [];
for (const t of TESTS) {
	const qVec = await embed(t.desc);
	let ranked = [];
	for (let i = 0; i < corpus.length; i++) {
		ranked.push({ id: corpus[i].id, name: corpus[i].name, sim: cosine(qVec, docVecs[i]), info: corpus[i].info || "" });
	}
	ranked.sort((a, b) => b.sim - a.sim);
	const top5 = ranked.slice(0, 5);
	// 语义相关性判定：TopN 描述包含任一关键词
	const rel = (n) => top5.slice(0, n).some((r) => t.keywords.some((kw) => (r.info || "").includes(kw)));
	hitTotal += rel(1) ? 1 : 0;
	hitTop3 += rel(3) ? 1 : 0;
	hitTop5 += rel(5) ? 1 : 0;
	bestSims.push(top5[0].sim);
	console.log(`${rel(1) ? "✓" : "✗"} [${t.keywords.join("/")}]`);
	console.log(`   Top5: ${top5.map((r, i) => `${i + 1}.${r.id}(${r.sim.toFixed(3)})`).join("  ")}`);
	if (!rel(5)) console.log(`   Top5 描述均无关键词（语义相关但无字面命中）`);
}
console.log("\n========== 回测结果 ==========");
console.log(`总用例 ${TESTS.length}，Top1 相关 ${hitTotal}，Top3 相关 ${hitTop3}，Top5 相关 ${hitTop5}`);
console.log(`Top1 相关率: ${(hitTotal / TESTS.length * 100).toFixed(0)}%`);
console.log(`Top3 相关率: ${(hitTop3 / TESTS.length * 100).toFixed(0)}%`);
console.log(`Top5 相关率: ${(hitTop5 / TESTS.length * 100).toFixed(0)}%`);