// 场景断言框架：给技能写"行为契约断言"（mock 环境 → 调技能方法 → 校验输出）
// 抓"结构对但行为错"类 bug（武圣教训：候选集错误、颜色强错、属性变体缺失）
// 用法: node skill-scene.mjs
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { getNoname } from "./mock-noname.mjs";
register(new URL("./loader.mjs", import.meta.url));
const mock = getNoname();
const { lib, game, get, ui, _status } = mock;

const base = pathToFileURL("G:/game/noname/resources/app/extension/群友设计/src/").href;
const { skills } = await import(base + "skill/index.js");
for (const [k, v] of Object.entries(skills)) lib.skill[k] = v;

// ============ 测试工具 ============
const results = [];
const ok = (name, pass, detail = "") => {
	results.push({ name, pass });
	console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  |  " + detail : ""}`);
};

// 构造技能场景环境
function setupScene({ inpile, natures, libCard, playerCards }) {
	lib.inpile = inpile || ["sha", "shan", "tao", "jiu", "juedou", "huogong", "nanmanruqin"];
	lib.inpile_nature = natures || ["fire", "thunder", "ice"];
	lib.card = libCard || {};
	lib.translate = lib.translate || {};
	// mock 玩家
	const player = {
		playerid: "p1",
		storage: {},
		hesCards: playerCards || [],
		hasCard(filter, pos) {
			return this.hesCards.some(filter);
		},
		countCards(filter, pos) {
			return filter ? this.hesCards.filter(filter).length : this.hesCards.length;
		},
		getCards(filter, pos) {
			return filter ? this.hesCards.filter(filter) : this.hesCards.slice();
		},
		getUseValue() {
			return 1;
		},
	};
	return player;
}
const event = {
	type: "phase",
	filterCard(vcard) {
		return !!lib.card[vcard.name];
	},
};

const makeCard = (name, { color, suit, number, nature } = {}) => ({
	name,
	...(color ? { color } : {}),
	suit: suit || "heart",
	number: number ?? 5,
	isCard: true,
	hasGaintag: () => false,
	storage: {},
});

// ============ 武圣场景断言 ============
// 场景1: 玩家只有一张红杀（红+伤害+基本 全满足）
let player = setupScene({
	inpile: ["sha", "shan", "tao", "jiu", "juedou", "huogong", "nanmanruqin"],
	natures: ["fire", "thunder", "ice"],
	libCard: {
		sha: { type: "basic", ai: { tag: { damage: true, respondSha: true } } },
		shan: { type: "basic", ai: { tag: { respondShan: true } } },
		tao: { type: "basic", ai: { tag: { save: true } } },
		jiu: { type: "basic" },
		juedou: { type: "trick", ai: { tag: { damage: true } } },
		huogong: { type: "trick", ai: { tag: { damage: true } } },
		nanmanruqin: { type: "trick", ai: { tag: { damage: true } } },
	},
	playerCards: [makeCard("sha", { color: "red" })],
});
const wusheng = lib.skill.qunyou_wusheng;
const cands = wusheng.getCandidateCards(event, player);

// 断言1: ①组（红牌→伤害+基本）含杀+火/雷/冰变体，不含闪/桃/酒
const g1 = cands.filter((c) => c[4] == "g1");
ok("武圣①组含杀", g1.some((c) => c[2] == "sha" && !c[3]), `候选: ${g1.map((c) => c[2] + (c[3] ? "(" + c[3] + ")" : "")).join(",")}`);
ok("武圣①组含火/雷/冰杀变体", ["fire", "thunder", "ice"].every((n) => g1.some((c) => c[2] == "sha" && c[3] == n)), `变体: ${g1.filter((c) => c[3]).map((c) => c[3]).join(",")}`);
ok("武圣①组不含闪/桃/酒", !g1.some((c) => ["shan", "tao", "jiu"].includes(c[2])), `候选含: ${g1.map((c) => c[2]).join(",")}`);

// 断言2: ②组（伤害牌→红色基本牌）含桃/闪/酒/杀/火杀，不含雷/冰杀
const g2 = cands.filter((c) => c[4] == "g2");
ok("武圣②组含桃/闪/酒/杀", ["tao", "shan", "jiu", "sha"].every((n) => g2.some((c) => c[2] == n && !c[3])), `候选: ${g2.map((c) => c[2]).join(",")}`);
ok("武圣②组含火杀", g2.some((c) => c[2] == "sha" && c[3] == "fire"));
ok("武圣②组不含雷/冰杀", !g2.some((c) => c[2] == "sha" && ["thunder", "ice"].includes(c[3])), `含: ${g2.filter((c) => c[3]).map((c) => c[3]).join(",")}`);

// 断言3: ③组（基本牌→红色伤害牌）含杀/决斗/火攻/南蛮+火杀，不含闪/桃/酒、不含雷杀
const g3 = cands.filter((c) => c[4] == "g3");
ok("武圣③组含伤害牌", ["sha", "juedou", "huogong", "nanmanruqin"].every((n) => g3.some((c) => c[2] == n && !c[3])), `候选: ${g3.map((c) => c[2]).join(",")}`);
ok("武圣③组不含闪/桃/酒", !g3.some((c) => ["shan", "tao", "jiu"].includes(c[2])));
ok("武圣③组含火杀不含雷杀", g3.some((c) => c[2] == "sha" && c[3] == "fire") && !g3.some((c) => c[2] == "sha" && c[3] == "thunder"));

// 断言4: 颜色/属性标记（按钮格式 [类型,"",牌名,属性,组]）
const mk1 = wusheng.makeVCard(["基本", "", "sha", "", "g1"]);
const mk2 = wusheng.makeVCard(["基本", "", "tao", "", "g2"]);
const mk3 = wusheng.makeVCard(["锦囊", "", "juedou", "", "g3"]);
const mk2fire = wusheng.makeVCard(["基本", "", "sha", "fire", "g2"]);
ok("武圣g1不强制红(继承素材)", !mk1.color, JSON.stringify(mk1));
ok("武圣g2强制红", mk2.color === "red", JSON.stringify(mk2));
ok("武圣g3强制红", mk3.color === "red", JSON.stringify(mk3));
ok("武圣g2火杀带fire+红", mk2fire.color === "red" && mk2fire.nature === "fire", JSON.stringify(mk2fire));

// 断言5: filter 可用性（有红杀素材时可发动）
ok("武圣filter(有红杀素材)返回true", wusheng.filter(event, player) === true);

// 断言6: hiddenCard
ok("武圣hiddenCard(杀)", wusheng.hiddenCard(player, "sha") === true);
ok("武圣hiddenCard(桃)", wusheng.hiddenCard(player, "tao") === true);
ok("武圣hiddenCard(决斗)", wusheng.hiddenCard(player, "juedou") === true);
ok("武圣hiddenCard(无懈)false", wusheng.hiddenCard(player, "wuxie") === false);

// ============ 场景2: 玩家只有一张黑桃闪（无红/无伤害，只有基本） ============
player = setupScene({
	inpile: ["sha", "shan", "tao", "jiu", "juedou"],
	natures: ["fire", "thunder", "ice"],
	libCard: {
		sha: { type: "basic", ai: { tag: { damage: true } } },
		shan: { type: "basic" },
		tao: { type: "basic" },
		jiu: { type: "basic" },
		juedou: { type: "trick", ai: { tag: { damage: true } } },
	},
	playerCards: [makeCard("shan", { color: "black" })],
});
const cands2 = wusheng.getCandidateCards(event, player);
const g1b = cands2.filter((c) => c[4] == "g1");
const g3b = cands2.filter((c) => c[4] == "g3");
ok("场景2(只有黑闪)①组为空(无红牌)", g1b.length === 0, `①组: ${g1b.length}`);
ok("场景2(只有黑闪)③组含伤害牌(基本可印)", g3b.some((c) => c[2] == "juedou"), `${g3b.map((c) => c[2]).join(",")}`);
ok("场景2(只有黑闪)filter为true(有基本可印)", wusheng.filter(event, player) === true);

// ============ 汇总 ============
const fails = results.filter((r) => !r.pass);
console.log(`\n===== 场景断言结果: 总 ${results.length} 项, 失败 ${fails.length} =====`);
if (fails.length) {
	for (const f of fails) console.log(`  FAIL ${f.name}`);
	process.exitCode = 1;
} else {
	console.log("全部通过");
}