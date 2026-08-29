// 语义检索器：输入技能描述 → 输出 Top-N 参考技能（原生语料 + 语义相似）
// 用法: node skill-search.mjs "描述文本" [--top 5] [--file 输出json]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_FILE = join(__dirname, "skills-corpus.json");
const CACHE_FILE = join(__dirname, `embed-cache${process.env.TUNED ? "-" + process.env.TUNED : ""}.json`);
const MODEL_NAME = "Xenova/bge-base-zh-v1.5"; // 中文专用，准确优先
const MODEL_DIR = join(__dirname, "models", "bge-base-zh-v1.5"); // 本地模型（离线）

let corpus = [];
try {
	corpus = JSON.parse(readFileSync(CORPUS_FILE, "utf8"));
	console.log(`语料库: ${corpus.length} 技能`);
} catch (e) {
	console.error("未找到 skills-corpus.json，请先运行 extract-skill-corpus.mjs");
	process.exit(1);
}

// 构建检索文本：描述 + 结构特征（语义检索的"文档"）
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

// 关键词评分（通道3：精确词命中）
function keywordScore(query, s) {
	const q = query.toLowerCase();
	let score = 0;
	const info = (s.info || "").toLowerCase();
	const name = (s.name || "").toLowerCase();
	const id = s.id.toLowerCase();
	// 描述关键词命中
	for (const kw of query.split(/[，。；、！？\s（()）]/).filter((x) => x.length >= 2)) {
		const k = kw.toLowerCase();
		if (info.includes(k)) score += 3;
		if (name.includes(k)) score += 2;
	}
	// 技能 ID 直接命中
	if (id.includes(q) && q.length >= 3) score += 10;
	return score;
}

let pipe = null;
let embedCache = new Map();
const USE_TUNED = process.env.TUNED === "1" || process.env.TUNED === "v2" || process.env.TUNED === "v1";
async function getPipe() {
	if (!pipe) {
		const { pipeline, env } = await import(
			"file:///G:/game/noname/resources/app/extension/群友设计/test/node_modules/@huggingface/transformers/src/transformers.js"
		);
		// 离线本地模型（localModelPath 会拼接 "模型名/文件名"，指向 models/ 即可）
		env.allowRemoteModels = false;
		env.allowLocalModels = true;
		env.localModelPath = join(__dirname, "models") + "/";
		if (process.env.TUNED === "v3") {
			console.log("使用微调模型 v3（描述↔完整文档对齐） tuned-bge-zh-v3-onnx");
			pipe = await pipeline("feature-extraction", "tuned-bge-zh-v3-onnx", { dtype: "fp32" });
		} else if (process.env.TUNED === "v2") {
			console.log("使用微调模型 v2（同类对比学习） tuned-bge-zh-v2-onnx");
			pipe = await pipeline("feature-extraction", "tuned-bge-zh-v2-onnx", { dtype: "fp32" });
		} else if (process.env.TUNED === "v1") {
			console.log("使用微调模型 v1（自参照对齐） tuned-bge-zh-onnx");
			pipe = await pipeline("feature-extraction", "tuned-bge-zh-onnx", { dtype: "fp32" });
		} else {
			console.log("使用基座模型 Xenova/bge-base-zh-v1.5");
			pipe = await pipeline("feature-extraction", "Xenova/bge-base-zh-v1.5", { dtype: "q8" });
		}
		console.log("模型就绪");
	}
	return pipe;
}

async function embed(text) {
	if (embedCache.has(text)) return embedCache.get(text);
	const p = await getPipe();
	const out = await p(text, { pooling: "mean", normalize: true });
	const vec = Array.from(out.data ?? out.ort_tensor?.data ?? []);
	embedCache.set(text, vec);
	return vec;
}

function cosine(a, b) {
	if (!a?.length || !b?.length || a.length != b.length) return 0;
	let dot = 0,
		na = 0,
		nb = 0;
	for (let i = 0; i < a.length; i++) {
		if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return 0;
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na == 0 || nb == 0) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// 规则词典（通道2）：描述短语 → 技能ID 白名单（复用映射表的术语）
const RULE_TABLE = [
	[/明置|倒置|暗置/, ["mbxishang", "mbweizhuang", "pianchong", "pepianchong"]],
	[/弃牌堆/, ["repojun", "pojun", "jsrgpianchong", "qunyou_shenshi", "zishu_guomie"]],
	[/视为使用一张基本牌/, ["dunshi", "taoluan", "sbtaoluan"]],
	[/视为使用.{0,4}(普通)?锦囊/, ["taoluan", "jingshi", "sbshenxing"]],
	[/体力值变化/, ["mbxiezhi", "dcmaimeng", "qunyou_zisheng"]],
	[/濒死/, ["jijiang", "buqu", "wanfa", "qunyou_yongli"]],
	[/交换手牌/, ["jsrgguiji", "qunyou_dinglue", "zishu_bugu"]],
	[/拼点/, ["jsrgguiji", "tianxiang", "xuying", "qunyou_daolie"]],
	[/勾股|点数/, ["qunyou_xianlv", "sm_feidian", "potjianzhuan"]],
	[/手牌上限/, ["ignoredHandcard", "kongcheng", "zishu_buqun"]],
	[/转换技/, ["zishu_jiaoxi", "qiufeng_paoshi"]],
	[/回合结束/, ["repojun2", "qingjian", "zishu_buqun"]],
	[/进入濒死/, ["qunyou_dinglue", "zishu_bugu"]],
	[/弃两张/, ["qiufeng_paoshi", "zishu_buqun"]],
	[/牌堆顶|牌堆底/, ["kanyu", "qiufeng_paoshi", "threed_cat_eye"]],
	[/宗族|族/, ["clanzhongliu", "clanzhuding", "clanmuyin"]],
	[/觉醒/, ["awaken", "jiexi", "sbshelie"]],
	[/限定技/, ["lianhua", "xunsxun", "qunyou_haoxian"]],
	[/每轮限/, ["usable", "zishu_duliang"]],
	[/摸牌阶段/, ["pepianchong", "zishu_duliang", "mbweizhuang"]],
	[/出牌阶段限一次/, ["usable", "zishu_duliang", "yachai_chengshi"]],
	[/失去体力/, ["loseHp", "zishu_haixiang"]],
	[/造成伤害/, ["damage", "zishu_guomie", "qunyou_zhihu"]],
];

function ruleHits(query) {
	const ids = new Set();
	for (const [re, list] of RULE_TABLE) {
		if (re.test(query)) for (const id of list) ids.add(id);
	}
	return ids;
}

// 主流程
const args = process.argv.slice(2);
const query = args[0];
if (!query) {
	console.error("用法: node skill-search.mjs \"技能描述\" [--top 5] [--file out.json]");
	process.exit(1);
}
const topArg = args.indexOf("--top");
const topN = topArg >= 0 ? parseInt(args[topArg + 1]) || 5 : 5;
const outFile = args[args.indexOf("--file") + 1];

console.log(`查询: ${query}`);
const docTexts = corpus.map(buildDocText);
const qVec = await embed(query);
// 语料向量缓存（首次计算后落盘，之后直接加载）
let docVecs = [];
if (existsSync(CACHE_FILE)) {
	try {
		const cached = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
		if (Array.isArray(cached) && cached.length == docTexts.length) {
			docVecs = cached;
			console.log(`载入向量缓存 ${docVecs.length} 条`);
		}
	} catch {}
}
if (!docVecs.length) {
	console.log("计算语料向量（首次约 1-2 分钟，之后缓存）...");
	for (let i = 0; i < docTexts.length; i++) {
		docVecs.push(await embed(docTexts[i]));
		if (i % 500 == 0) process.stdout.write(`  ${i}/${docTexts.length}\n`);
	}
	writeFileSync(CACHE_FILE, JSON.stringify(docVecs), "utf8");
	console.log(`向量缓存已写入 ${CACHE_FILE}`);
}
const scores = corpus.map((s, i) => {
	const sim = cosine(qVec, docVecs[i]);
	const kw = keywordScore(query, s) * 0.5;
	const rules = ruleHits(query).has(s.id) ? 2 : 0;
	return { skill: s, score: sim + kw + rules, sim, kw, rules };
});
scores.sort((a, b) => b.score - a.score);

// 检索置信度判定
const top = scores.slice(0, topN);
const bestSim = top[0]?.sim ?? 0;
console.log(`\n===== Top ${topN} 参考技能（语义相似度最高 ${bestSim.toFixed(3)}）=====`);
let out = [];
for (let i = 0; i < top.length; i++) {
	const { skill: s, score, sim, kw, rules } = top[i];
	console.log(`\n[${i + 1}] ${s.id} (${s.name || "?"})  综合${score.toFixed(2)} 语义${sim.toFixed(3)} 关键词${kw} 规则${rules}`);
	if (s.info) console.log(`    描述: ${s.info.slice(0, 120)}${s.info.length > 120 ? "…" : ""}`);
	if (s.tags?.length) console.log(`    标签: ${s.tags.join("、")}`);
	if (s.trigger) console.log(`    时机: ${JSON.stringify(s.trigger)}`);
	if (s.enable?.length) console.log(`    类型: ${s.enable.join("、")}`);
	if (s.apis?.length) console.log(`    API: ${s.apis.slice(0, 15).join("、")}`);
	out.push({ id: s.id, name: s.name, score, sim, kw, rules, info: s.info, trigger: s.trigger, enable: s.enable, mod: s.mod, tags: s.tags, apis: s.apis?.slice(0, 25) });
}

// 检索不到/不准确的降级提示
if (bestSim < 0.3 && top[0].kw < 2) {
	console.log(`\n⚠️ 检索置信度低（最佳语义相似度 ${bestSim.toFixed(2)} < 0.3）。可能原因：`);
	console.log("  - 描述包含自定义新概念（语料库无对应原生技能）");
	console.log("  - 建议：人工核对 Top 列表，若都不相关，参考技能开发模式 SKILL.md 的模板库，或让设计者确认语义");
}
if (outFile) {
	writeFileSync(join(__dirname, outFile), JSON.stringify(out, null, 2), "utf8");
	console.log(`\n已写入 ${outFile}`);
}