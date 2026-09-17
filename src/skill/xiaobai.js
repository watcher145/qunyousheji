import { lib, game, get, ui, _status } from "noname";
import { getTurnDiscardCards, qunyou_adjustHandTo } from "./helpers.js";

// 狈变：改写【决斗】的结算流程，在每次响应前插入“是否变更势力至魏”的询问
async function xiaobaiBeibianDuel(event, trigger, player) {
	const target = event.target;
	const source = player;
	const responsers = [target, source];
	let currentTurn = 1;
	let currentResponser = target;
	let doChange = true;
	const doChanges = { 1: false, 2: false };
	let extraDamage = 0;
	while (currentResponser.isAlive()) {
		let respond = false;
		if (currentResponser.group != "wei" && doChange) {
			const agree = (
				await currentResponser
					.chooseBool("狈变：是否将势力变更至魏？", () => !currentResponser.countCards("h", { name: "sha" }))
					.forResult()
			).bool;
			doChange = agree;
			if (!doChange) {
				extraDamage++;
			} else {
				await currentResponser.changeGroup("wei");
				doChanges[currentTurn] = true;
				if (doChanges[1] && doChanges[2]) {
					doChange = false;
					await source.draw(2);
					await target.draw(2);
				}
				respond = true;
			}
		}
		if (!respond) {
			const next = currentResponser.chooseToRespond();
			next.set("filterCard", (card, player2) => get.name(card) == "sha" && lib.filter.cardRespondable(card, player2));
			next.set("prompt", "狈变：请打出一张【杀】响应【决斗】");
			next.set("respondTo", [responsers[currentTurn == 1 ? 1 : 0], event.card]);
			const result = await next.forResult();
			if (result?.bool) respond = true;
		}
		if (!respond) break;
		currentTurn = (currentTurn % 2) + 1;
		currentResponser = responsers[currentTurn - 1];
	}
	if (currentResponser.isAlive()) {
		await responsers[currentTurn == 1 ? 1 : 0].damage(1 + extraDamage, currentResponser, event.card);
	}
}

// 博涉：统计一名角色本回合失去过牌的方式集合
function xiaobaiBosheWays(target) {
	const ways = new Set();
	const add = (evt) => {
		const l = evt.getl ? evt.getl(target) : null;
		if (!l || !l.cards || !l.cards.length) return;
		let way = evt.type;
		if (!way) {
			const name = evt.getParent()?.name;
			if (name == "useCard") way = "use";
			else if (name == "respond") way = "respond";
			else if (name == "discard") way = "discard";
			else way = name || "other";
		}
		ways.add(way);
	};
	(target.getHistory("lose") || []).forEach(add);
	(target.getHistory("loseAsync") || []).forEach(add);
	return ways;
}

// 博文：本阶段已使用的牌数（至多5）
function xiaobaiBowenX(player) {
	// X = 你本阶段已使用的牌数（至多 5）。用 getHistory("useCard") 而不用 getStat("card")，
	// 后者会把「打出/响应」也计入。
	const used = player.getHistory("useCard") || [];
	return Math.min(5, used.length);
}

// 长河：从若干技能的描述中提取【】内的、可主动使用的基本牌/普通锦囊牌牌名
function xiaobaiChangheNames(skills) {
	const names = [];
	// ⚠️ lib.card 是按「牌 id」索引的（sha / wuxie …），而技能描述里的【】是**中文牌名**，
	// 直接 lib.card["杀"] 永远取不到 → 必须先建「中文名 → 牌 id」反查表。
	const byCn = {};
	for (const id of lib.inpile) {
		const cardInfo = lib.card[id];
		if (!cardInfo || (cardInfo.type != "basic" && cardInfo.type != "trick")) continue;
		const cn = get.translation(id);
		if (!cn) continue;
		if (!byCn[cn]) byCn[cn] = id;
		// 【火杀】【雷杀】这类带属性的写法也映射到同一个牌 id（大白展示时会自动展开属性）
		for (const nature of lib.inpile_nature) {
			const key = get.translation(nature) + cn;
			if (!byCn[key]) byCn[key] = id;
		}
	}
	for (const skill of skills) {
		const info = lib.translate[`${skill}_info`];
		if (typeof info != "string") continue;
		const matched = info.match(/【[^【】]+】/g);
		if (!matched) continue;
		for (const str of matched) {
			const id = byCn[str.slice(1, -1)];
			if (!id || names.includes(id)) continue;
			names.push(id);
		}
	}
	return names;
}

// 策图：令一名角色「使用一张牌」（不计次数）；返回是否使用了牌
async function xiaobaiCetuPlay(player, prompt) {
	if (!player?.isIn()) return false;
	player.addTempSkill("xiaobai_cetu_free");
	const result = await player.chooseToUse(null, prompt).set("addCount", false).forResult();
	player.removeSkill("xiaobai_cetu_free");
	return Boolean(result?.bool);
}

// 博议：某一项当前能否执行
function xiaobaiBoyiCan(player, item) {
	if (!player?.isIn()) return false;
	if (item == "peach") return player.countCards("he") > 0 && player.canUse({ name: "tao", isCard: true }, player, false);
	if (item == "recast") return player.countCards("he") >= 2;
	if (item == "put") return player.countCards("h") >= 3;
	return true;
}

// 博议·1：将一张牌当作【桃】使用
async function xiaobaiBoyiPeach(player) {
	const vcard = { name: "tao", isCard: true };
	if (!xiaobaiBoyiCan(player, "peach")) return;
	const res = await player
		.chooseCard("he", 1, () => true)
		.set("prompt", "博议：将一张牌当作【桃】使用")
		.set("ai", (card) => 5 - get.value(card))
		.forResult();
	if (!res.bool || !res.cards?.length) return;
	await player.useCard(vcard, res.cards, player);
}

// 博议·2：重铸两张牌并进行一次【闪电】判定
async function xiaobaiBoyiRecast(player) {
	if (!xiaobaiBoyiCan(player, "recast")) return;
	const res = await player
		.chooseCard("he", 2, () => true)
		.set("prompt", "博议：重铸两张牌并进行一次【闪电】判定")
		.set("ai", (card) => 5 - get.value(card))
		.forResult();
	if (!res.bool || res.cards?.length != 2) return;
	await player.recast(res.cards);
	if (!player.isIn()) return;
	const isLightning = (card) => get.suit(card) == "spade" && get.number(card) > 1 && get.number(card) < 10;
	const result = await player.judge((card) => (isLightning(card) ? -5 : 1)).forResult();
	if (result?.card && isLightning(result.card) && player.isIn()) await player.damage(3, "nosource", "thunder");
}

// 博议·3：将三张手牌置于牌堆顶
async function xiaobaiBoyiPut(player) {
	if (!xiaobaiBoyiCan(player, "put")) return;
	const res = await player
		.chooseCard("h", 3, () => true)
		.set("prompt", "博议：将三张手牌置于牌堆顶")
		.set("ai", (card) => 5 - get.value(card))
		.forResult();
	if (!res.bool || res.cards?.length != 3) return;
	await player.lose(res.cards, ui.cardPile, "insert");
}

// 鉴戒：获得一个「鉴戒」（计数标记，效果按份数结算）
function xiaobaiJianjieGrant(player) {
	if (!player.hasSkill("xiaobai_jianjie")) player.addSkill("xiaobai_jianjie");
	player.addMark("xiaobai_jianjie", 1, false);
	// 初始化记录：本回合使用过的花色 / 本阶段最后使用牌的花色
	const suits = [];
	let last = 0;
	for (const evt of player.getHistory("useCard") || []) {
		const card = evt.card;
		if (!card) continue;
		const suit = get.suit(card);
		const inPhase = Boolean(evt.getParent("phaseUse"));
		if (suit && suit != "none") {
			if (!suits.includes(suit)) suits.push(suit);
			if (inPhase) last = suit;
		} else if (inPhase) {
			last = 0;
		}
	}
	player.storage.xiaobai_jianjie_suits = suits;
	player.storage.xiaobai_jianjie_last = last;
	player.markSkill("xiaobai_jianjie");
}

// 博议·4：摸四张牌并获得一个单独的“鉴戒”
async function xiaobaiBoyiDraw(player) {
	await player.draw(4);
	if (!player.isIn()) return;
	xiaobaiJianjieGrant(player);
}

// 博议：执行某一项
async function xiaobaiBoyiDo(player, item, active) {
	if (!xiaobaiBoyiCan(player, item)) return;
	if (item == "peach") await xiaobaiBoyiPeach(player);
	else if (item == "recast") await xiaobaiBoyiRecast(player);
	else if (item == "put") await xiaobaiBoyiPut(player);
	else await xiaobaiBoyiDraw(player);
}

// 究典：本轮所有角色使用过的牌名（不含无牌名）
function xiaobaiJiudianUsedNames() {
	const names = [];
	for (const evt of game.getRoundHistory("useCard", (evt) => evt.card) || []) {
		const name = get.name(evt.card);
		if (name && !names.includes(name)) names.push(name);
	}
	return names;
}

// 逝浪：从一批牌里筛出「已进入弃牌堆并被销毁的『白』牌」
function xiaobaiShilangDestroyed(cards) {
	return (cards || []).filter((card) => card && card.name == "xiaobai_dabai" && card._selfDestroyed && card.storage?.xiaobai_changhe?.general);
}

// 逝浪：武将的势力（含双势力的副势力）
function xiaobaiShilangGroups(general) {
	const info = lib.character[general];
	if (!info) return [];
	return [info[1], info[2]].filter((group) => group && group != "unknown");
}

// 逝浪：这些「白」牌对应的势力中，已在本局「长河」牌堆里全部消逝的势力
function xiaobaiShilangVanished(cards, player) {
	const list = player.storage.xiaobai_changhe_generals;
	if (!Array.isArray(list) || !list.length) return [];
	if (!cards?.length) return [];
	const remain = list.filter((general) => !cards.some((card) => card.storage.xiaobai_changhe.general == general));
	const remainGroups = remain.flatMap((general) => lib.xiaobaiShilangGroups(general));
	const groups = [];
	for (const card of cards) {
		for (const group of lib.xiaobaiShilangGroups(card.storage.xiaobai_changhe.general)) {
			if (groups.includes(group)) continue;
			if (!remainGroups.includes(group)) groups.push(group);
		}
	}
	return groups;
}

// 逝浪：把已消逝的势力从「长河」记录里移除
function xiaobaiShilangUpdate(cards, player) {
	const list = (player.storage.xiaobai_changhe_generals || []).slice();
	for (const card of cards || []) {
		if (!card || card.name != "xiaobai_dabai") continue;
		const general = card.storage?.xiaobai_changhe?.general;
		if (!general) continue;
		const index = list.indexOf(general);
		if (index >= 0) list.splice(index, 1);
	}
	player.storage.xiaobai_changhe_generals = list;
}

// 逝浪：按「逝浪」层数刷新永久【酒】效果
function xiaobaiShilangRefresh(player) {
	const num = player.countMark("xiaobai_shilang");
	if (num <= 0) return;
	player.storage.jiu = (player.storage.jiu || 0) + num;
	player.addSkill("jiu");
}

// 印牌技能公用：候选牌面里挑出当前事件真正可用的（铁律二：filter/dialog 都必须用 event.filterCard 探测）
// 铁律四：调用方需先自检 event.skill === 自身技能id（自身选择流程会被引擎包装 filterCard，直接探测即无限递归）
function xiaobaiViewAsList(event, player, candidates) {
	const list = [];
	for (const info of candidates) {
		if (event.filterCard(get.autoViewAs({ name: info[2], nature: info[3], isCard: true }, "unsure"), player, event)) list.push(info);
	}
	return list;
}

// 梗谏的候选牌面：【杀】/【无懈可击】
const XIAOBAI_GENGJIAN_CANDIDATES = [
	["基本", "", "sha"],
	["锦囊", "", "wuxie"],
];

// 印牌技能公用：该技能本次是否处于「自身选择流程」（此时不可再做 event.filterCard 探测）
function xiaobaiIsSelfSelect(event, skill) {
	return event?.skill == skill || event?._skill == skill;
}

// 攒和：技能当前是否可用（未失效 + 场上存在手牌数相差 1/2/3 的其他角色）
function xiaobaiCuanheUsable(player) {
	if (player.hasSkill("xiaobai_cuanhe_disabled")) return false;
	return game.hasPlayer((current) => current != player && current.isIn() && [1, 2, 3].includes(Math.abs(current.countCards("h") - player.countCards("h"))));
}

// 大白：手牌中「白」牌能印出的全部牌名
function xiaobaiDabaiNames(player) {
	const names = [];
	for (const card of player.getCards("hs", (current) => current.storage?.xiaobai_changhe?.names?.length)) {
		for (const name of card.storage.xiaobai_changhe.names) {
			if (!names.includes(name)) names.push(name);
		}
	}
	return names;
}

// 究典：候选牌面（本轮没有角色使用过的基本牌/普通锦囊；需手牌中有「白」牌）
function xiaobaiJiudianCandidates(player) {
	if (!player.countCards("h", (card) => card.name == "xiaobai_dabai")) return [];
	const used = lib.xiaobaiJiudianUsedNames();
	const list = [];
	for (const name of lib.inpile) {
		const type = get.type(name);
		if (type != "basic" && type != "trick") continue;
		if (used.includes(name)) continue;
		list.push([get.translation(type), "", name]);
		if (name == "sha") {
			for (const nature of lib.inpile_nature) list.push(["基本", "", "sha", nature]);
		}
	}
	return list;
}

// 大白：候选牌面（【杀】展开属性变体）
function xiaobaiDabaiCandidates(player) {
	const list = [];
	for (const name of xiaobaiDabaiNames(player)) {
		list.push([get.translation(get.type(name)), "", name]);
		if (name == "sha") {
			for (const nature of lib.inpile_nature) list.push(["基本", "", "sha", nature]);
		}
	}
	return list;
}

// 悲笳：手牌里是否存在「交替明/暗置 + 点数严格递减」的 X 张合法选择（镜像原生 beijia_active 的可行性预检）
function xiaobaiBeijiaFeasible(player, x) {
	const cards = player.getCards("h");
	let upper = 14;
	for (let i = 0; i < x; i++) {
		const needShown = i % 2 === 1;
		let next = 0;
		for (const card of cards) {
			if (get.is.shownCard(card) !== needShown) continue;
			const num = get.number(card);
			if (num < upper && num > next) next = num;
		}
		if (next === 0) return false;
		upper = next;
	}
	return true;
}

// 悖伺：本次「获得」事件里，其他角色将获得的、原本属于你的牌（手牌/装备/判定区）
function xiaobaiBeisiCards(event, player) {
	return (event.cards || []).filter((card) => get.owner(card) == player && "he".includes(get.position(card)));
}

// 攥功：从引擎的协力记录里取本次「攥功」协力信息（chooseCooperationFor 已自动写入 cooperationWith）
function xiaobaiZuangongInfo(player) {
	return (player.getStorage("cooperation") || []).find((info) => info.reason == "xiaobai_zuangong");
}

// 攥功：协力是否达成。自己按出力数据判定（阈值同引擎 cooperation_<type>.checkx），
// 不依赖 checkCooperationStatus 的调用时机 —— 引擎那套只在 4 个事件里累计，判定时机一旦错开就永远判不出成功。
function xiaobaiZuangongDone(player, mine) {
	const entry = mine?.contrib || {};
	const mineData = entry[player.playerid] || {};
	const theirsData = entry[mine.target?.playerid] || {};
	if (mine.type == "damage") return (mineData.num || 0) + (theirsData.num || 0) >= 4;
	if (mine.type == "draw") return (mineData.num || 0) + (theirsData.num || 0) >= 8;
	const suits = [...new Set([...(mineData.suits || []), ...(theirsData.suits || [])])];
	return suits.length >= 4;
}

// 攥功：累计某一方在“协力”中的贡献
function xiaobaiZuangongAdd(player, id, key, value) {
	const info = player.storage.xiaobai_zuangong;
	if (!info || id == null) return;
	if (!info.contrib) info.contrib = {};
	if (!info.contrib[id]) info.contrib[id] = {};
	const entry = info.contrib[id];
	if (key == "suits") {
		const set = entry.suits || [];
		if (!set.includes(value)) set.push(value);
		entry.suits = set;
	} else {
		entry.num = (entry.num || 0) + value;
	}
}

// 攥功：“协力”成功后的结算
async function xiaobaiZuangongResolve(player) {
	const info = player.storage.xiaobai_zuangong;
	if (!info) return;
	const target = info.target;
	lib.xiaobaiZuangongClear(player);
	if (!player.isIn() || !target?.isIn()) return;
	const score = (entry) => {
		if (!entry) return 0;
		if (info.type == "discard" || info.type == "use") return (entry.suits || []).length;
		return entry.num || 0;
	};
	const mine = score(info.contrib?.[player.playerid]);
	const theirs = score(info.contrib?.[target.playerid]);
	if (mine == theirs) return;
	const more = mine > theirs ? player : target;
	const less = mine > theirs ? target : player;
	game.log(player, "与", target, "的“协力”成功，出力更多者为", more);
	await more.draw(2);
	if (!more.isIn() || !less.isIn()) return;
	await less.useCard({ name: "tuixinzhifu", isCard: true }, more);
}

// 攥功：清除协力状态（引擎记录 + 本次挂载的检查子技能 + 自己的出力记录）
function xiaobaiZuangongClear(player) {
	for (const info of (player.getStorage("cooperation") || []).slice()) {
		if (info.reason == "xiaobai_zuangong") player.removeCooperation(info);
	}
	player.removeSkill("xiaobai_zuangong_track");
	player.removeSkill("xiaobai_zuangong_keep");
	player.removeSkill("xiaobai_zuangong_settle");
	player.removeSkill("xiaobai_zuangong_clear");
	delete player.storage.xiaobai_zuangong;
}

// content 在“全局化”编译环境下只能访问 lib/game/get/ui/_status，故把 content 内用到的 helper 挂到 lib 上
lib.xiaobaiBeibianDuel = xiaobaiBeibianDuel;
lib.xiaobaiChangheNames = xiaobaiChangheNames;
lib.xiaobaiCetuPlay = xiaobaiCetuPlay;
lib.xiaobaiBoyiDo = xiaobaiBoyiDo;
lib.xiaobaiJiudianUsedNames = xiaobaiJiudianUsedNames;
lib.xiaobaiShilangDestroyed = xiaobaiShilangDestroyed;
lib.xiaobaiShilangGroups = xiaobaiShilangGroups;
lib.xiaobaiShilangVanished = xiaobaiShilangVanished;
lib.xiaobaiShilangUpdate = xiaobaiShilangUpdate;
lib.xiaobaiShilangRefresh = xiaobaiShilangRefresh;
lib.xiaobaiBeijiaFeasible = xiaobaiBeijiaFeasible;
lib.xiaobaiBeisiCards = xiaobaiBeisiCards;
lib.xiaobaiZuangongInfo = xiaobaiZuangongInfo;
lib.xiaobaiZuangongDone = xiaobaiZuangongDone;
lib.xiaobaiZuangongAdd = xiaobaiZuangongAdd;
lib.xiaobaiZuangongResolve = xiaobaiZuangongResolve;
lib.xiaobaiZuangongClear = xiaobaiZuangongClear;

// 小白杯（xiaobai_ 前缀）技能
export const skills = {
// === 鸷刎 ===
xiaobai_zhiwen: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		var restrict = player.storage.xiaobai_zhiwen_restrict;
		var canThree = !restrict || restrict.method !== "last" ? player.countCards("hes") >= 3 : false;
		var canLast = !restrict || restrict.method !== "three" ? player.countCards("h") === 1 : false;
		if (!canThree && !canLast) return false;
		if (restrict?.name) {
			if (!lib.filter.cardEnabled({ name: restrict.name, isCard: true }, player, event)) return false;
			return player.hasUseTarget({ name: restrict.name, isCard: true }, null, false);
		}
		return (lib.filter.cardEnabled({ name: "sha", isCard: true }, player, event) && player.hasUseTarget({ name: "sha", isCard: true }, null, false))
			|| (lib.filter.cardEnabled({ name: "juedou", isCard: true }, player, event) && player.hasUseTarget({ name: "juedou", isCard: true }, null, false));
	},
	async content(event, trigger, player) {
		// 选择牌面 + 转化方式
		var restrict = player.storage.xiaobai_zhiwen_restrict;
		var list = [];
		var names = restrict?.name ? [restrict.name] : ["sha", "juedou"];
		for (var name of names) {
			if (player.countCards("hes") >= 3 && (!restrict || restrict.method !== "last")) {
				list.push([get.type(name), "", name, "three"]);
			}
			if (player.countCards("h") === 1 && (!restrict || restrict.method !== "three")) {
				list.push([get.type(name), "", name, "last"]);
			}
		}
		var dialog = ui.create.dialog("鸷刎", [list, "vcard"], "hidden");
		var chooseResult = await player.chooseButton(dialog, true).forResult();
		if (!chooseResult.bool) return;
		var cardName = chooseResult.links[0][2];
		var isLast = chooseResult.links[0][3] === "last";

		// 选择选项
		var optResult = await player.chooseControl("选项一", "选项二", "选项三", "cancel2")
			.set("choiceList", [
				"下次仅能以另一种方式转化",
				"下次仅能转化为另一种牌名",
				"背水"
			])
			.set("prompt", "鸷刎：选择一项")
			.set("ai", function() { return "cancel2" })
			.forResult();
		if (optResult.control === "cancel2") return;

		// 设置下次限制
		var st = {};
		if (optResult.index === 0 || optResult.index === 2) {
			st.method = isLast ? "three" : "last";
		}
		if (optResult.index === 1 || optResult.index === 2) {
			st.name = cardName === "sha" ? "juedou" : "sha";
		}
		if (Object.keys(st).length) {
			player.storage.xiaobai_zhiwen_restrict = st;
			player.markSkill("xiaobai_zhiwen_restrict");
		}

		// 背水：此牌对其他角色造成的伤害+1
		if (optResult.index === 2) {
			player.addTempSkill("xiaobai_zhiwen_backwater_bonus", { player: "useCardAfter" });
		}

		// 选牌并印牌使用
		var cardResult = await player.chooseCard(isLast ? "h" : "hes", isLast ? 1 : 3, true).set("prompt", "鸷刎：选择" + (isLast ? "一张手牌" : "三张牌") + "转化").forResult();
		if (!cardResult.bool) return;
		var vcard = get.autoViewAs({ name: cardName, isCard: true, storage: { xiaobai_zhiwen: true, isLast } });
		var chooseEvt = player.chooseUseTarget(vcard, cardResult.cards, false, true);
		chooseEvt.logSkill = "xiaobai_zhiwen";
		await chooseEvt;
	},
	ai: {
		// 出牌阶段 AI 排序依赖 ai.order(此前缺失,AI 不会主动发动);强转化技取 6,
		// 收益评估由转化出的【杀】/【决斗】自带 result 承担;content 内选项(含背水)暂取保守不选
		order: 6,
		result: { player: 1 },
	},
	mod: {
		cardUsable(card, player, num) {
			if (card?.storage?.xiaobai_zhiwen) return Infinity;
		},
	},
	subSkill: {
		backwater_bonus: {
			trigger: { player: "useCard", source: "damageBegin1" },
			forced: true,
			popup: false,
			charlotte: true,
			filter(event, player) {
				if (event.skill === "xiaobai_zhiwen") return true;
				return event.target !== player && player.storage.xiaobai_zhiwen_backwater_active;
			},
			async content(event, trigger, player) {
				if (trigger.skill === "xiaobai_zhiwen") {
					player.storage.xiaobai_zhiwen_backwater_active = true;
				} else {
					trigger.num++;
				}
			},
			onremove(player) {
				delete player.storage.xiaobai_zhiwen_backwater_active;
			},
		},
		restrict: {
			charlotte: true,
			onremove(player, skill) {
				delete player.storage[skill];
			},
			mark: true,
			marktext: "鸷",
			intro: {
				content(storage, player) {
					if (!storage) return "无限制";
					var parts = [];
					if (storage.method) {
						parts.push(storage.method === "last" ? "仅能用最后一张手牌转化" : "仅能用三张牌转化");
					}
					if (storage.name) {
						parts.push("仅能转化" + get.translation(storage.name));
					}
					return parts.length ? "下次发动鸷刎" + parts.join("") : "无限制";
				},
			},
		},
	},
},
// === 泯念 ===
xiaobai_minnian: {
	audio: 2,
	trigger: { player: "dying" },
	filter(event, player) {
		return !player.hasSkill("xiaobai_minnian_used");
	},
	check(event, player) {
		return true;
	},
	async content(event, trigger, player) {
		player.addTempSkill("xiaobai_minnian_used", { player: "phaseAfter" });
		const diff = player.maxHp - player.countCards("h");
		if (diff > 0) {
			await player.draw(diff);
		} else if (diff < 0) {
			await player.loseToDiscardpile(player.getCards("h").randomGets(-diff));
		}
		const targetResult = await player.chooseTarget(2, true, "泯念：横置两名角色").set("ai", (target) => get.attitude(player, target) < 0 ? 1 : 0).forResult();
		if (targetResult.bool && targetResult.targets.length) {
			for (const target of targetResult.targets) {
				if (!target.isLinked()) {
					await target.link(true);
				}
			}
			if (targetResult.targets.includes(player) && player.hp < 1) {
				await player.recover(1 - player.hp);
			}
		}
	},
	subSkill: {
		used: {
			charlotte: true,
		},
	},
},
// === 俱焚 ===
xiaobai_jufen: {
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "fire",
	enable: "phaseUse",
	filter(event, player) {
		return player.countCards("h") === 0;
	},
	async content(event, trigger, player) {
		player.awakenSkill("xiaobai_jufen");
		await player.damage(player, 1, "fire");
		if (_status.discarded?.length) {
			await player.gain(Array.from(_status.discarded), "gain2");
		}
	},
	ai: {
		order: 3,
		result: {
			player(player) {
				let value = 0;
				const ds = _status.discarded;
				if (ds) {
					for (const c of ds) {
						if (c && get.itemtype(c) === "card") value += get.value(c, player);
					}
				}
				return value > 4 ? 1 : 0;
			},
		},
	},
},
// === 聚澜 ===
xiaobai_julan: {
	audio: 2,
	comboSkill: true,
	locked: false,
	group: ["xiaobai_julan_yinpai", "xiaobai_julan_check"],
	init(player, skill) {
		if (!player.storage.xiaobai_julan_condition) {
			player.storage.xiaobai_julan_condition = ["basic"];
		}
		player.addSkill(`${skill}_mark`);
	},
	onremove(player, skill) {
		player.removeSkill(`${skill}_mark`);
		delete player.storage.xiaobai_julan_condition;
		delete player.storage.xiaobai_julan_progress;
		player.removeTip("xiaobai_julan");
	},
	trigger: { player: "useCard1" },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		const cond = player.storage.xiaobai_julan_condition;
		if (!cond?.length) return false;
		return (player.storage.xiaobai_julan_progress || 0) < cond.length;
	},
	async content(event, trigger, player) {
		const cond = player.storage.xiaobai_julan_condition || ["basic"];
		const progress = player.storage.xiaobai_julan_progress || 0;
		const type = get.type2(trigger.card);
		if (type === cond[progress]) {
			const next = progress + 1;
			player.storage.xiaobai_julan_progress = next;
			player.markSkill("xiaobai_julan_mark");
			if (next >= cond.length) {
				await player.draw(cond.length);
				cond.push("basic");
				player.storage.xiaobai_julan_progress = 0;
				player.markSkill("xiaobai_julan_mark");
				player.removeTip("xiaobai_julan");
			} else {
				player.addTip("xiaobai_julan", "聚澜 可连击");
			}
		} else if (progress > 0) {
			player.storage.xiaobai_julan_progress = 0;
			player.markSkill("xiaobai_julan_mark");
			player.removeTip("xiaobai_julan");
			if (player.hasSkill("xiaobai_kuotao")) {
				await get.info("xiaobai_kuotao").onBreak(player, type);
			}
		}
	},
	subSkill: {
		// 印牌：一张牌当【趁火打劫】
		yinpai: {
			audio: "xiaobai_julan",
			enable: "chooseToUse",
			viewAsFilter(player) {
				return player.storage.xiaobai_julan_progress > 0;
			},
			filterCard(card, player) {
				return get.itemtype(card) == "card";
			},
			selectCard: 1,
			position: "he",
			viewAs: { name: "chenghuodajie", storage: { xiaobai_julan: true } },
			prompt: "聚澜：将一张牌当【趁火打劫】使用",
		},
		// 替换趁火打劫结算：展示基本牌时由使用者选择
		check: {
			trigger: { player: "useCardToBegin" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.card?.storage?.xiaobai_julan;
			},
			async content(event, trigger, player) {
				trigger.setContent(get.info("xiaobai_julan").chenghuoContent);
			},
		},
		// 连招进度显示：澜字 + 右下角进度/条件数
		mark: {
			charlotte: true,
			marktext: "澜",
			intro: {
				content(storage, player, skill) {
					const cond = player.storage.xiaobai_julan_condition || ["basic"];
					const progress = player.storage.xiaobai_julan_progress || 0;
					return `连招进度：${progress}/${cond.length}`;
				},
				markcount(storage, player) {
					const cond = player.storage.xiaobai_julan_condition || ["basic"];
					const progress = player.storage.xiaobai_julan_progress || 0;
					return `${progress}/${cond.length}`;
				},
			},
			init(player, skill) {
				player.markSkill(skill);
			},
			onremove(player, skill) {
				player.unmarkSkill(skill);
			},
		},
	},
	async chenghuoContent(event, trigger, player) {
		const { target } = event;
		if (typeof event.baseDamage !== "number") {
			event.baseDamage = 1;
		}
		if (typeof event.extraDamage !== "number") {
			event.extraDamage = 0;
		}
		if (!target.hasCards("h") || !player.isIn()) {
			return;
		}
		const result = await player.choosePlayerCard(target, "h", true).forResult();
		if (!result.bool) {
			return;
		}
		event.show_card = result.cards[0];
		const str = get.translation(player);
		await player.showCards(event.show_card);
		if (get.type(event.show_card) == "basic") {
			const controlResult = await player.chooseControl().set("choiceList", [`令使用者获得${get.translation(event.show_card)}`, `令${get.translation(target)}受到${event.baseDamage + event.extraDamage}点伤害`]).set("ai", () => {
				const evt = get.event().getParent();
				const card = evt.show_card;
				const source = evt.player;
				const target2 = evt.target;
				if (get.damageEffect(target2, source, source) > get.value(card, source)) {
					return 1;
				}
				return 0;
			}).forResult();
			if (controlResult.index === 0) {
				await target.give(event.show_card, player);
			} else {
				await target.damage();
			}
		} else {
			const controlResult = await target.chooseControl().set("choiceList", [`令${str}获得${get.translation(event.show_card)}`, `受到${str}造成的${event.baseDamage + event.extraDamage}点伤害`]).set("ai", () => {
				const evt = get.event().getParent();
				if (evt == null) {
					return 1;
				}
				const current = evt.target;
				const source = evt.player;
				const card = evt.show_card;
				if (get.damageEffect(current, source, current) > 0) {
					return 1;
				}
				if (get.attitude(current, source) * get.value(card, source) >= 0) {
					return 0;
				}
				if (card.name === "tao") {
					return 1;
				}
				return get.value(card, current) > 6 + (Math.max(current.maxHp, 3) - current.hp) * 1.5 ? 1 : 0;
			}).forResult();
			if (controlResult.index === 0) {
				await target.give(event.show_card, player);
			} else {
				await target.damage();
			}
		}
	},
	ai: {
		order: 6,
		result: { player: 1 },
	},
},
// === 括涛 ===
xiaobai_kuotao: {
	audio: 2,
	locked: false,
	group: ["xiaobai_kuotao_check"],
	mod: {
		cardUsable(card, player, num) {
			if (get.name(card) == "sha") {
				return num + (player.storage.xiaobai_kuotao_sha_count || 0);
			}
		},
	},
	trigger: {
		global: ["phaseBeginAfter", "phaseJudgeAfter", "phaseDrawAfter", "phaseUseAfter", "phaseDiscardAfter", "phaseJieshuAfter"],
	},
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		return Array.isArray(player.storage.xiaobai_kuotao_end) && player.storage.xiaobai_kuotao_end.length > 0;
	},
	async content(event, trigger, player) {
		const list = player.storage.xiaobai_kuotao_end || [];
		delete player.storage.xiaobai_kuotao_end;
		for (const X of list) {
			//if (!lib.card.binglinchengxiax) break;
			const vcard = get.autoViewAs({ name: "binglinchengxiax", isCard: true, storage: { xiaobai_kuotao_extra: X } });
			if (game.hasPlayer(target => target != player && lib.filter.filterTarget(vcard, player, target))) {
				await player.chooseUseTarget(vcard, true, false).set("prompt", "括涛：视为使用一张【兵临城下】").forResult();
			}
		}
	},
	init(player, skill) {
		player.addSkill(`${skill}_mark`);
		if (player.storage.xiaobai_kuotao_sha_count) {
			player.addTip("xiaobai_kuotao", `出杀次数+${player.storage.xiaobai_kuotao_sha_count}`);
		}
	},
	onremove(player, skill) {
		player.removeSkill(`${skill}_mark`);
		player.removeTip("xiaobai_kuotao");
		delete player.storage.xiaobai_kuotao_sha_count;
		delete player.storage.xiaobai_kuotao_last_break;
		delete player.storage.xiaobai_kuotao_end;
	},
	async onBreak(player, breakType) {
		const last = player.storage.xiaobai_kuotao_last_break;
		player.storage.xiaobai_kuotao_last_break = breakType;
		player.markSkill("xiaobai_kuotao_mark");
		if (last === breakType) {
			player.logSkill("xiaobai_kuotao");
			player.storage.xiaobai_kuotao_sha_count = (player.storage.xiaobai_kuotao_sha_count || 0) + 1;
			player.addTip("xiaobai_kuotao", `出杀次数+${player.storage.xiaobai_kuotao_sha_count}`);
			return;
		}
		const shaCount = player.storage.xiaobai_kuotao_sha_count || 0;
		const condLen = (player.storage.xiaobai_julan_condition || ["basic"]).length;
		const result = await player
			.chooseControl(["使用【杀】的次数", "连招条件"], "cancel2")
			.set("prompt", "括涛：将使用【杀】的次数或连招条件减少至1")
			.set("ai", () => {
				const player = get.player();
				const shaCount = player.storage.xiaobai_kuotao_sha_count || 0;
				const condLen = (player.storage.xiaobai_julan_condition || ["basic"]).length;
				return shaCount >= condLen - 1 ? 0 : 1;
			})
			.forResult();
		if (result.control === "cancel2") {
			return;
		}
		let X;
		if (result.control === "使用【杀】的次数") {
			X = shaCount;
			delete player.storage.xiaobai_kuotao_sha_count;
			player.removeTip("xiaobai_kuotao");
		} else {
			X = condLen - 1;
			player.storage.xiaobai_julan_condition = ["basic"];
			if (player.hasSkill("xiaobai_julan_mark")) {
				player.markSkill("xiaobai_julan_mark");
			}
		}
		(player.storage.xiaobai_kuotao_end ??= []).push(X);
	},
	subSkill: {
		// 替换兵临城下结算：多展示 X 张牌
		check: {
			trigger: { player: "useCardToBegin" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.card?.storage?.xiaobai_kuotao_extra;
			},
			async content(event, trigger, player) {
				trigger.setContent(get.info("xiaobai_kuotao").binglinContent);
			},
		},
		// 中断类别显示：涛字 + 右下角类别（基/锦/装）
		mark: {
			charlotte: true,
			marktext: "涛",
			intro: {
				content(storage, player, skill) {
					const type = player.storage.xiaobai_kuotao_last_break;
					const shaCount = player.storage.xiaobai_kuotao_sha_count || 0;
					const condLen = (player.storage.xiaobai_julan_condition || ["basic"]).length;
					let str = "";
					if (type) {
						str += `上次导致中断的牌类别：${get.translation(type)}<br>`;
					} else {
						str += "未记录中断牌<br>";
					}
					str += `出杀次数：${1 + shaCount}<br>连招条件数：${condLen}`;
					return str;
				},
				markcount(storage, player) {
					const type = player.storage.xiaobai_kuotao_last_break;
					return type ? { basic: "基", trick: "锦", equip: "装" }[type] || "" : "";
				},
			},
			init(player, skill) {
				player.markSkill(skill);
			},
			onremove(player, skill) {
				player.unmarkSkill(skill);
			},
		},
	},
	async binglinContent(event, trigger, player) {
		const { target } = event;
		if (!player.isIn() || !target.isIn()) {
			event.finish();
			return;
		}
		const extra = event.card?.storage?.xiaobai_kuotao_extra || 0;
		event.showCards = get.cards(4 + extra, true);
		await game.cardsGotoOrdering(event.showCards);
		await player.showCards(event.showCards, `${get.translation(player)}使用了【${get.translation(event.card)}】`, true).set("clearArena", false);
		if (player.isIn() && target.isIn() && event.showCards.length) {
			for (const card of event.showCards.slice()) {
				if (get.name(card) == "sha" && player.canUse(card, target, false)) {
					event.showCards.remove(card);
					await player.useCard(card, target, false);
				}
			}
		}
		game.broadcastAll(ui.clear);
		if (event.showCards.length) {
			await game.cardsGotoPile(event.showCards.reverse(), "insert");
		}
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
},
// === 胆执 ===
xiaobai_danzhi: {
	audio: 2,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		const data = player.storage.xiaobai_danzhi;
		if (data) {
			return get.suit(event.card) == data.suit;
		}
		if (event.player != player) return false;
		if (_status.dying.length) return false;
		const history = player.getHistory("useCard");
		return history[0] === event;
	},
	async cost(event, trigger, player) {
		if (player.storage.xiaobai_danzhi) {
			event.result = { bool: true };
			return;
		}
		const result = await player
			.chooseTarget(get.prompt2("xiaobai_danzhi"), "选择一名角色", (card, p, target) => target.isIn(), false)
			.set("ai", (target) => {
				const card = trigger?.card;
				const hasEntity = trigger?.cards?.length > 0 && card && get.suit(card) != "none";
				const att = get.attitude(player, target);
				if (!hasEntity) return -att;
				if (att > 0) {
					const value = get.value(card, player);
					if (value > 6) return value / 10;
					return 0;
				}
				return -att;
			})
			.forResult();
		if (!result?.bool || !result.targets?.length) return;
		const target = result.targets[0];
		let choice = "losehp";
		if (trigger.cards?.length) {
			const res = await player
				.chooseControl(["失去体力", "获得此牌"])
				.set("choiceList", ["令其失去1点体力", "令其获得此牌"])
				.set("prompt", "胆执：选择效果")
				.set("ai", () => {
					// 敌人→失去体力（伤害）；队友→获得此牌（送牌，未来收益）
					return get.attitude(player, target) > 0 ? 1 : 0;
				})
				.forResult();
			if (!res?.control) return;
			choice = res.control == "获得此牌" ? "gain" : "losehp";
		}
		event.result = { bool: true, cost_data: { target, choice } };
	},
	async content(event, trigger, player) {
		if (player.storage.xiaobai_danzhi) {
			const data = player.storage.xiaobai_danzhi;
			const target = data.target;
			if (target.isAlive()) {
				if (data.choice == "losehp") {
					await target.recover();
				} else if (target.countDiscardableCards(target, "he")) {
					await target.chooseToDiscard("胆执：弃置一张牌", 1, "he", true);
				}
			}
			return;
		}
		const { target, choice } = event.cost_data;
		if (choice == "losehp") {
			await target.loseHp();
		} else {
			await target.gain(trigger.cards, "gain2");
		}
		player.storage.xiaobai_danzhi = { target, choice, suit: get.suit(trigger.card) };
		target.storage.xiaobai_danzhi_mark = { suit: get.suit(trigger.card), choice };
		target.addSkill("xiaobai_danzhi_mark");
		player.addTempSkill("xiaobai_danzhi_clear", { global: "phaseAfter" });
	},
	subSkill: {
		// 执 mark（挂在被选角色身上）
		mark: {
			charlotte: true,
			marktext: "执",
			intro: {
				content(storage, player, skill) {
					if (!storage) return "未记录";
					const suitText = storage.suit == "none" ? "无色" : get.translation(storage.suit);
					const effect = storage.choice == "losehp" ? "回复1点体力" : "弃置一张牌";
					return `本回合${suitText}牌被使用后，${effect}`;
				},
				markcount(storage, player) {
					if (!storage) return "";
					return storage.suit == "none" ? "无" : get.translation(storage.suit);
				},
			},
			init(player, skill) {
				player.markSkill(skill);
			},
			onremove(player, skill) {
				delete player.storage[skill];
				player.unmarkSkill(skill);
			},
		},
		// 回合结束清理
		clear: {
			charlotte: true,
			onremove(player) {
				const data = player.storage.xiaobai_danzhi;
				if (data?.target) {
					data.target.removeSkill("xiaobai_danzhi_mark");
				}
				delete player.storage.xiaobai_danzhi;
			},
		},
	},
},
// === 骤笔 ===
xiaobai_zhoubi: {
	audio: 2,
	enable: "chooseToUse",
	init(player, skill) {
		player.addSkill(`${skill}_mark`);
	},
	onremove(player, skill) {
		player.removeSkill(`${skill}_mark`);
		player.removeSkill("xiaobai_zhoubi_disabled");
		player.enableSkill("xiaobai_zhoubi_disabled");
		delete player.storage.xiaobai_zhoubi_last_name;
		delete player.storage.xiaobai_zhoubi_words;
		delete player.storage.xiaobai_zhoubi_num;
	},
	filter(event, player) {
		if (player.hasSkill("xiaobai_zhoubi_disabled")) return false;
		const phase = _status.currentPhase;
		if (!phase?.isIn() || !phase.countDiscardableCards(phase, "he")) return false;
		return get.inpileVCardList(info => {
			if (info[0] !== "basic") return false;
			const card = new lib.element.VCard({ name: info[2], nature: info[3], isCard: true });
			return event.filterCard(card, player, event);
		}).length;
	},
	chooseButton: {
		dialog(event, player) {
			const list = get.inpileVCardList(info => {
				if (info[0] !== "basic") return false;
				const card = new lib.element.VCard({ name: info[2], nature: info[3], isCard: true });
				return event.filterCard(card, player, event);
			});
			const dialog = ui.create.dialog("骤笔", [list, "vcard"], "hidden");
			dialog.direct = true;
			return dialog;
		},
		check(button) {
			const player = get.player(),
				card = new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true });
			return player.getUseValue(card);
		},
		backup(links, player) {
			return {
				audio: "xiaobai_zhoubi",
				viewAs: {
					name: links[0][2],
					nature: links[0][3],
					isCard: true,
				},
				filterCard: () => false,
				selectCard: 0,
				async precontent(event, trigger, player) {
					const phase = _status.currentPhase;
					if (!phase?.isIn()) {
						event.result.bool = false;
						return;
					}
					const lastWords = player.storage.xiaobai_zhoubi_words ?? 0;
					const lastNum = player.storage.xiaobai_zhoubi_num ?? 0;
					const result = await player
						.choosePlayerCard(phase, "he", true, `骤笔：弃置${get.translation(phase)}一张牌`)
						.set("ai", card => get.value(card, phase))
						.forResult();
					if (!result?.bool || !result.cards?.length) {
						event.result.bool = false;
						return;
					}
					const card = result.cards[0];
					await phase.discard(card);
					const words = get.translation(card.name).length;
					const num = get.number(card);
					player.storage.xiaobai_zhoubi_last_name = card.name;
					player.storage.xiaobai_zhoubi_words = words;
					player.storage.xiaobai_zhoubi_num = num;
					player.markSkill("xiaobai_zhoubi_mark");
					game.broadcastAll((player2) => {
						const mark = player2.marks.xiaobai_zhoubi_mark;
						if (mark) {
							const cn = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五" }[player2.storage.xiaobai_zhoubi_words];
							mark.firstChild.innerHTML = cn || player2.storage.xiaobai_zhoubi_words;
						}
					}, player);
					const wordsOK = words > lastWords;
					const numOK = num < lastNum;
					if (wordsOK && numOK) {
						await player.drawTo(5);
						player.disableSkill("xiaobai_zhoubi_disabled", "xiaobai_zhoubi");
						player.addSkill("xiaobai_zhoubi_disabled");
						return;
					}
					if (wordsOK) {
						return;
					}
					if (numOK) {
						await player.drawTo(5);
						player.disableSkill("xiaobai_zhoubi_disabled", "xiaobai_zhoubi");
						player.addSkill("xiaobai_zhoubi_disabled");
						event.result.cancel = true;
						return;
					}
					event.result.cancel = true;
				},
			};
		},
		prompt(links, player) {
			return `弃置本回合角色一张牌，若字数更多则视为使用一张${get.translation(links[0][3] || "")}${get.translation(links[0][2])}`;
		},
	},
	hiddenCard(player, name) {
		if (get.type(name) != "basic") return false;
		if (player.hasSkill("xiaobai_zhoubi_disabled")) return false;
		return true;
	},
	subSkill: {
		// 失效监听：手牌数变化为1时解除
		disabled: {
			charlotte: true,
			trigger: {
				player: "loseAfter",
				global: ["loseAsyncAfter", "equipAfter", "addToExpansionAfter", "gainAfter", "addJudgeAfter"],
			},
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const lost = event.getl?.(player)?.hs?.length || 0;
				const gained = event.getg?.(player)?.length || 0;
				console.log("骤笔失效检测：", { 事件: event.name, 失去手牌: lost, 获得手牌: gained, 当前手牌数: player.countCards("h") });
				return lost + gained > 0 && player.countCards("h") == 1;
			},
			content(event, trigger, player) {
				console.log("骤笔失效解除判定成功：手牌数变化为1");
				player.enableSkill("xiaobai_zhoubi_disabled");
				player.removeSkill("xiaobai_zhoubi_disabled");
			},
		},
		// 上次弃置的牌信息
		mark: {
			charlotte: true,
			marktext: "笔",
			intro: {
				content(storage, player, skill) {
					const name = player.storage.xiaobai_zhoubi_last_name;
					if (!name) return "尚未发动过骤笔";
					let str = `上次弃置的牌：${get.translation(name)}（字数${player.storage.xiaobai_zhoubi_words ?? 0}，点数${player.storage.xiaobai_zhoubi_num ?? 0}）`;
					if (player.hasSkill("xiaobai_zhoubi_disabled")) {
						str += "<br>骤笔已失效（手牌数变为1时恢复）";
					}
					return str;
				},
				markcount(storage, player) {
					if (typeof player.storage.xiaobai_zhoubi_num !== "number") return "";
					return player.storage.xiaobai_zhoubi_num;
				},
			},
			init(player, skill) {
				player.markSkill(skill);
			},
			onremove(player, skill) {
				player.unmarkSkill(skill);
			},
		},
	},
	ai: {
		save: true,
		skillTagFilter(player, tag) {
			if (player.hasSkill("xiaobai_zhoubi_disabled")) return false;
			return true;
		},
		order: 1,
		result: { player: 1 },
	},
},
// === 烈忤 ===
xiaobai_liewu: {
	audio: 2,
	trigger: {
		player: ["respond", "chooseToUseAfter"],
		global: "_wuxieAfter",
	},
	filter(event, player) {
		if (player.hasSkill("xiaobai_liewu_used")) return false;
		if (event.name == "chooseToUse") {
			// 闪响应杀走 chooseToUse(type respondShan)（standard.js:161），不产生 respond 事件
			if (event.type != "respondShan") return false;
			const respondTo = event.respondTo;
			if (!respondTo?.[0] || !respondTo?.[1]) return false;
			if (respondTo[0] == player) return false;
			return get.color(respondTo[1], false) == "black";
		}
		if (event.name == "respond") {
			// respondTo 可能存在或需要从父事件链取（content.js:5020 的条件可能不满足）
			const respondTo = event.respondTo || event.getParent("chooseToUse")?.respondTo || event.getParent("chooseToRespond")?.respondTo;
			if (!respondTo?.[0] || !respondTo?.[1]) return false;
			if (respondTo[0] == player) return false;
			return get.color(respondTo[1], false) == "black";
		}
		if (event.name == "_wuxie") {
			if (event.wuxieresult != player) return false;
			const card = event._trigger?.card;
			if (!card) return false;
			if (event._info_map?.player == player) return false;
			return get.color(card, false) == "black";
		}
		return false;
	},
	check(event, player) {
		// AI 发动门槛：按策略计划判定（队友需能打入濒死才发动；敌人按剩余体力定最优 X）
		let source;
		if (event.name == "respond" || event.name == "chooseToUse") {
			const respondTo = event.respondTo || event.getParent("chooseToUse")?.respondTo || event.getParent("chooseToRespond")?.respondTo;
			source = respondTo?.[0];
		} else if (event.name == "_wuxie") {
			source = event._trigger?.player || event._info_map?.player;
		}
		if (!source?.isIn() || !player.countCards("he")) return false;
		return !!lib.skill.xiaobai_liewu.liewuPlan(player, source);
	},
	async content(event, trigger, player) {
		let source;
		if (trigger.name == "respond" || trigger.name == "chooseToUse") {
			const respondTo = trigger.respondTo || trigger.getParent("chooseToUse")?.respondTo || trigger.getParent("chooseToRespond")?.respondTo;
			source = respondTo?.[0];
		} else {
			source = trigger._trigger?.player || trigger._info_map?.player;
		}
		if (!source?.isIn()) return;
		// AI 按计划选牌；人类玩家不受限（aiX 上限仅约束 AI 选牌数）
		const plan = lib.skill.xiaobai_liewu.liewuPlan(player, source);
		const aiX = plan ? plan.X : 99;
		player.addTempSkill("xiaobai_liewu_used", "roundStart");
		const result = await player
			.chooseToDiscard(
				`烈忤：弃置任意张类别不同的牌，对${get.translation(source)}造成等量伤害`,
				[1, Infinity],
				"he",
				(card) => {
					const type = get.type2(card);
					for (const cardx of ui.selected.cards) {
						if (get.type2(cardx) == type) return false;
					}
					return true;
				},
			)
			.set("ai", card => {
				// 恰好选 X 张（collab.js:6060 同款）：选满前取价值最低的，选满后不再选
				if (ui.selected.cards.length >= aiX) return -1;
				return 10 - get.value(card);
			})
			// 对齐官方"弃置任意张X互异"写法（聚攸 junkyuheng）
			.set("complexCard", true)
			.forResult();
		if (!result?.bool || !result.cards?.length) return;
		const X = result.cards.length;
		// 标记挂在伤害事件上：濒死子技能只对本次伤害导致的濒死生效（避免残留到之后无关的濒死）
		const dmg = source.damage(player, X);
		dmg.liewu_info = { sourcePlayer: player, X };
		source.addTempSkill("xiaobai_liewu_dying", "dyingAfter");
		await dmg;
	},
	// AI 策略计划：返回 { X, mode } 或 null（null = 不值得发动）
	liewuPlan(player, source) {
		// 类别互异（get.type2 只有 basic/trick/equip 三类），X 上限 = 手牌+装备区的类别数
		const cats = new Set();
		for (const card of player.getCards("he")) {
			cats.add(get.type2(card));
		}
		const maxX = cats.size;
		if (!maxX) return null;
		const hp = source.hp;
		if (get.attitude(player, source) > 0) {
			// 队友：必须能打入濒死（X >= 体力），打得进则越多越好（其回复至X并令你摸X，双赢）
			if (maxX < hp) return null;
			return { X: maxX, mode: "friend" };
		}
		// 敌人：砸到只剩1血（X = 体力-1，不过量——过量会濒死后被奶回更高体力）
		if (hp >= 2) {
			return { X: Math.min(maxX, hp - 1), mode: "enemy" };
		}
		// 1血敌人：只砸1（濒死 → 其迫于生存压力接受，回复至1并令你摸1，其不亏血你赚牌）
		return { X: 1, mode: "enemy" };
	},
	ai: {
		threaten: 1.5,
		effect: {
			target(card, player, target) {
				if (get.tag(card, "damage") && player.hasSkillTag("jueqing", false, target)) return [1, -1];
				if (get.tag(card, "damage")) return [1, 0.5];
			},
		},
	},
	subSkill: {
		used: {
			charlotte: true,
		},
		dying: {
			trigger: { global: "dying" },
			forceDie: true,
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				// 仅响应带标记的烈忤伤害导致的濒死
				const dmg = event.getParent("damage");
				return !!(dmg && dmg.liewu_info && event.player == dmg.player);
			},
			async content(event, trigger, player) {
				const target = trigger.player;
				const info = event.getParent("damage").liewu_info;
				const X = info.X;
				const sourcePlayer = info.sourcePlayer;
				target.removeSkill("xiaobai_liewu_dying");
				const choice = await target
					.chooseBool(
						`烈忤：你可以回复至${get.cnNumber(X)}点体力并令${get.translation(sourcePlayer)}摸${get.cnNumber(X)}张牌`,
					)
					.set("ai", () => {
						// 接受必然不亏：回复至 min(X, maxHp) 高于濒死时的体力（X>=1 > 濒死hp<=0）。
						// 队友是双赢（回血+令其摸牌）；敌人迫于生存压力也接受（活命优先）。
						return true;
					})
					.forResult();
				if (choice?.bool) {
					const recoverAmount = Math.max(0, Math.min(X, target.maxHp) - target.hp);
					await target.recover(recoverAmount);
					await sourcePlayer.draw(X);
					game.log(target, "回复了", recoverAmount, "点体力，并令", sourcePlayer, "摸了", X, "张牌");
				}
			},
		},
	},
},
// === 宠眷 ===
xiaobai_chongjuan: {
	audio: 2,
	trigger: { player: ["phaseDrawAfter", "phaseDiscardAfter"] },
	filter(event, player) {
		const maxCount = Math.max(...game.filterPlayer().map(p => p.countCards("h")));
		const maxPlayers = game.filterPlayer(p => p.countCards("h") == maxCount);
		return maxPlayers.length == 1;
	},
	check(event, player) {
		const maxCount = Math.max(...game.filterPlayer().map(p => p.countCards("h")));
		const maxPlayers = game.filterPlayer(p => p.countCards("h") == maxCount);
		if (maxPlayers.length != 1) return false;
		const target = maxPlayers[0];
		// 有队友或自己可受益才发动
		return get.attitude(player, target) > 0;
	},
	async content(event, trigger, player) {
		const maxCount = Math.max(...game.filterPlayer().map(p => p.countCards("h")));
		const maxPlayers = game.filterPlayer(p => p.countCards("h") == maxCount);
		if (maxPlayers.length != 1) return;
		const target = maxPlayers[0];
		await target.draw();
		// 优化：当技能拥有者就是手牌唯一最多的角色时，跳过询问（自己命自己摸牌无意义）
		if (target == player) return;
		// 其可以令你将手牌数摸至比其少一张（至多摸5张）
		const choice = await target
			.chooseBool(
				`宠眷：是否令${get.translation(player)}将手牌数摸至比${get.translation(target)}少一张（至多摸5张）？`,
			)
			.set("source", player)
			.set("ai", () => {
				const evt = _status.event;
				const p = evt.player;
				const s = evt.source;
				if (!s || !s.isIn()) return false;
				const draw = Math.min(p.countCards("h") - 1 - s.countCards("h"), 5);
				if (draw <= 0) return false;
				return get.attitude(p, s) > 0;
			})
			.forResult();
		if (choice?.bool) {
			const drawAmount = Math.min(target.countCards("h") - 1 - player.countCards("h"), 5);
			if (drawAmount > 0) {
				await player.draw(drawAmount);
			}
			if (choice?.bool) {
				const drawAmount = Math.min(target.countCards("h") - 1 - player.countCards("h"), 5);
				if (drawAmount > 0) {
					await player.draw(drawAmount);
				}
			}
		}
	},
},
// === 斛珍 ===
xiaobai_huzhen: {
	audio: 2,
	trigger: { player: "loseAfter" },
	filter(event, player) {
		// 失去过手牌：lose 事件的 hs（loseAsync 内部的失去有自己的 lose 事件，同样走这里，无需 loseAsyncAfter 重复评估）
		return !!event.hs?.length;
	},
	async content(event, trigger, player) {
		const lastWay = player.storage.xiaobai_huzhen_lastWay;
		const currentWay = lib.skill.xiaobai_huzhen.getLoseWay(trigger, player);
		player.storage.xiaobai_huzhen_lastWay = currentWay;
		player.markSkill("xiaobai_huzhen_mark");
		if (currentWay !== lastWay) {
			await player.draw();
			game.log(player, "因", "#g【斛珍】", "不同方式失去手牌，摸了1张牌");
		} else {
			const hiddenCards = player.getCards("h", card => !get.is.shownCard(card));
			if (!hiddenCards.length) return;
			// 明置选牌：标准 chooseCard("h") + filterCard 排除已明置（数组首参会令 get.filter 产出恒假过滤器导致卡死）
			const result = await player
				.chooseCard("h", true)
				.set("prompt", "斛珍：明置一张手牌（上次失去方式：" + get.translation(currentWay) + "）")
				.set("filterCard", card => !get.is.shownCard(card))
				.set("ai", card => get.value(card))
				.forResult();
			if (!result?.bool || !result.cards?.length) return;
			const card = result.cards[0];
			await player.addShownCards(card, "visible_xiaobai_huzhen");
			game.log(player, "因", "#g【斛珍】", "明置了一张手牌");
			if (player.countCards("h") >= 2 && player.getCards("h").every(c => get.is.shownCard(c))) {
				const chooseResult = await player
				.chooseTarget("斛珍：选择一名其他角色交换手牌（你2张换其3张）", (card, player, target) => {
					return target != player && target.countCards("h") >= 3;
				})
				.set("ai", target => -get.attitude(player, target))
					.forResult();
				if (!chooseResult?.bool || !chooseResult.targets?.length) return;
				const target = chooseResult.targets[0];
				const myResult = await player
					.chooseCard("h", 2, true, "斛珍：选择2张手牌用于交换（你将获得对方3张）")
					.set("ai", card => 7 - get.value(card))
					.forResult();
				if (!myResult?.bool || !myResult.cards?.length || myResult.cards.length < 2) return;
				const myCards = myResult.cards;
				const targetResult = await target
					.chooseCard("h", 3, true, "斛珍：选择3张手牌与" + get.translation(player) + "交换")
					.set("ai", card => 5 - get.value(card))
					.forResult();
				if (!targetResult?.bool || !targetResult.cards?.length || targetResult.cards.length < 3) return;
				const targetCards = targetResult.cards;
				await player.swapHandcards(target, myCards, targetCards);
				game.log(player, "因", "#g【斛珍】", "与", target, "交换了手牌");
			}
		}
	},
	getLoseWay(event, player) {
		const parent = event.getParent();
		const name = parent?.name;
		// loseAsync 只是包装层：向上递归取真实原因（交换→交换手牌、技能→其事件名）
		if (name === "loseAsync" && parent !== event) return lib.skill.xiaobai_huzhen.getLoseWay(parent, player);
		if (name === "useCard") return "use";
		if (name === "respond") return "respond";
		if (name === "phaseDiscard" || name === "discard") return "discard";
		if (name === "compare" || name === "compareMultiple") return "compare";
		if (name === "recast") return "recast";
		if (name === "swapHandcards") return "swap";
		if (name === "addToExpansion") return "expansion";
		if (name === "gain") {
			// 被获得：因 gain 事件失去手牌（被拿走/交给他人），统一归类
			return "obtained";
		}
		return name || "unknown";
	},
	ai: {
		threaten: 1.2,
	},
	subSkill: {
			mark: {
				name: "斛珍",
			mark: true,
			marktext: "珍",
			intro: {
				content(storage, player) {
					const way = player.storage.xiaobai_huzhen_lastWay;
					if (!way) return "尚未失去手牌";
					const map = {
						use: "使用牌",
						respond: "打出响应",
						discard: "弃置",
						compare: "拼点",
						recast: "重铸",
						obtained: "被获得",
						swap: "交换手牌",
						expansion: "移出游戏",
						unknown: "未知",
					};
					return "上次失去方式：" + (map[way] || "未知方式(" + way + ")");
				},
			},
		},
	},
},
// === 流芳 ===
xiaobai_liufang: {
	audio: 2,
	enable: "chooseToUse",
	filter(event, player) {
		if (player.hasSkill("xiaobai_liufang_used")) return false;
		if (!player.countCards("h")) return false;
		return get.inpileVCardList(info => {
			if (info[0] !== "basic") return false;
			return event.filterCard(new lib.element.VCard({ name: info[2], nature: info[3], isCard: true }), player, event);
		}).length > 0;
	},
	// hiddenCard 位于技能顶层:喂 hasWuxie/hasUsableCard 预检;翻转颜色条件由 chooseButton 再筛
	hiddenCard(player, name) {
		if (player.hasSkill("xiaobai_liufang_used")) return false;
		return player.countCards("h") > 0 && get.type({ name, isCard: true }) == "basic";
	},
	chooseButton: {
		dialog(event, player) {
			const list = get.inpileVCardList(info => {
				if (info[0] !== "basic") return false;
				return event.filterCard(new lib.element.VCard({ name: info[2], nature: info[3], isCard: true }), player, event);
			});
			const dialog = ui.create.dialog("流芳", [list, "vcard"], "hidden");
			dialog.direct = true;
			return dialog;
		},
		check(button) {
			const player = get.player();
			const card = new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true });
			return player.getUseValue(card);
		},
		backup(links, player) {
			return {
				audio: "xiaobai_liufang",
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true },
				filterCard: () => false,
				selectCard: 0,
				async precontent(event, trigger, player) {
					// 仅提供可行选项：手牌不足 3 张时不出现"翻转三张"
					const controls = ["翻转一张"];
					if (player.countCards("h") >= 3) controls.push("翻转三张");
					const countResult = await player
						.chooseControl(controls)
						.set("prompt", "流芳：选择翻转手牌数量")
						.set("ai", () => {
							const p = get.player();
							if (controls.includes("翻转三张")) return "翻转三张";
							return "翻转一张";
						})
						.forResult();
					if (!countResult?.control) {
						// 中止用 cancel 而非 bool=false：bool=false 会让 chooseToUse 以取消收场，出牌阶段循环视为结束阶段
						event.result.cancel = true;
						return;
					}
					const flipCount = countResult.control === "翻转三张" ? 3 : 1;
					if (player.countCards("h") < flipCount) {
						event.result.cancel = true;
						return;
					}
					const cardResult = await player
						.chooseCard("h", flipCount, true, "流芳：选择" + get.cnNumber(flipCount) + "张手牌翻转")
						.set("ai", card => 5 - get.value(card))
						.forResult();
					if (!cardResult?.bool || !cardResult.cards?.length) {
						event.result.cancel = true;
						return;
					}
					const flipCards = cardResult.cards;
					for (const card of flipCards) {
						if (get.is.shownCard(card)) {
							// 翻转为暗置：清除该牌全部明置标记（含斛珍等其他来源）
							await player.hideShownCards(card);
						} else {
							await player.addShownCards(card, "visible_xiaobai_liufang");
						}
					}
					const shownCards = player.getCards("h", c => get.is.shownCard(c));
					const colors = new Set(shownCards.map(c => get.color(c, false)));
					if (colors.size === 1) {
						const hiddenCards = player.getCards("h", c => !get.is.shownCard(c));
						if (hiddenCards.length) {
							await player.discard(hiddenCards);
						}
						player.addTempSkill("xiaobai_liufang_used", "phaseAfter");
					} else {
						// 明置牌颜色数不为一种：取消本次使用并回到用牌提示（bool 保持 true + cancel → goto(0) 重开）
						event.result.cancel = true;
					}
				},
			};
		},
		prompt(links) {
			return "流芳：翻转手牌，若明置牌颜色数为一则视为使用" + (links[0][3] ? get.translation(links[0][3]) : "") + "【" + get.translation(links[0][2]) + "】";
		},
	},
	ai: {
		order: 5,
		result: { player: 1 },
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag, arg) {
			if (player.hasSkill("xiaobai_liufang_used")) return false;
			if (!player.countCards("h")) return false;
			if (tag === "respondSha") return true;
			if (tag === "respondShan") return true;
			if (tag === "save") return true;
			return false;
		},
	},
	subSkill: {
		used: {
			charlotte: true,
		},
	},
},
// === 辩眉 ===
xiaobai_bianmei: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filterTarget(card, player, target) {
		// 手牌恰好比你多一张，且双方可拼点
		return target != player && target.countCards("h") == player.countCards("h") + 1 && player.canCompare(target);
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		const cmp = player.chooseToCompare(target);
		const result = await cmp.forResult();
		const winner = result.winner;
		// 平局：无人拼点成功，无后续
		if (!winner) return;
		const loser = winner == player ? target : player;
		const loserCard = winner == player ? cmp.card2 : cmp.card1;
		const choice = await winner
			.chooseControl("摸一张牌", "摸两张牌并令对方收回拼点牌")
			.set("prompt", "辩眉：请选择一项")
			.set("ai", () => {
				// 对方拼点牌对其价值高（弃掉更亏）选拆掉，否则多拿一张
				const evt = get.event();
				return evt.bmloserCard && get.value(evt.bmloserCard, evt.bmloser) > 1 ? "摸一张牌" : "摸两张牌并令对方收回拼点牌";
			})
			.set("bmloser", loser)
			.set("bmloserCard", loserCard)
			.forResult();
		if (!choice?.control) return;
		if (choice.control == "摸一张牌") {
			await winner.draw();
		} else {
			await winner.draw(2);
			if (loserCard) {
				await loser.gain(loserCard, "gain2");
				game.log(loser, "收回了拼点牌");
			}
		}
		if (winner == player) {
			// 你赢：重置限次，可以再发动（引擎 resetSkills 同款重置）
			delete player.getStat("skill").xiaobai_bianmei;
			delete player.getStat("triggerSkill").xiaobai_bianmei;
		}
	},
	ai: {
		order: 6,
		result: {
			target(player, target) {
				return -get.attitude(player, target) - 1;
			},
		},
	},
},
// === 营盈 ===
xiaobai_yingying: {
	audio: 2,
	enable: ["chooseToUse", "chooseToRespond"],
	group: ["xiaobai_yingying_lock"],
	filter(event, player) {
		// 手牌数等于手牌上限：无事可调整，不出现按钮
		if (player.countCards("h") == player.getHandcardLimit()) return false;
		const info = player.storage.xiaobai_yingying || { draw: 0, discard: 0 };
		// 累计摸牌数大于弃牌数时锁定：只能通过弃牌发动（当前手牌数须超过手牌上限）
		if (info.draw > info.discard && player.countCards("h") <= player.getHandcardLimit()) return false;
		return get.inpileVCardList(info2 => {
			if (info2[0] !== "basic") return false;
			return event.filterCard(new lib.element.VCard({ name: info2[2], nature: info2[3], isCard: true }), player, event);
		}).length > 0;
	},
	hiddenCard(player, name) {
		// 可印任意基本牌（杀/闪/桃/酒）
		if (get.type(name) != "basic") return false;
		if (player.countCards("h") == player.getHandcardLimit()) return false;
		const info = player.storage.xiaobai_yingying || { draw: 0, discard: 0 };
		return !(info.draw > info.discard && player.countCards("h") <= player.getHandcardLimit());
	},
	chooseButton: {
		dialog(event, player) {
			// 与 filter 同源：列出当前窗口下所有可用的基本牌（杀/闪/桃/酒——
			// 出牌阶段看各牌自身 enable，濒死窗口由 cardSavable 筛出桃/酒，响应窗口只留杀/闪）
			const list = get.inpileVCardList(info => {
				if (info[0] !== "basic") return false;
				return event.filterCard(new lib.element.VCard({ name: info[2], nature: info[3], isCard: true }), player, event);
			});
			return ui.create.dialog("营盈：将手牌数调整为手牌上限，视为使用或打出", [list, "vcard"]);
		},
		check(button) {
			const player = get.player();
			const card = new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true });
			return player.getUseValue(card);
		},
		backup(links, player) {
			return {
				audio: "xiaobai_yingying",
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true },
				filterCard: () => false,
				selectCard: 0,
				log: false,
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_yingying");
					// 将手牌数调整为手牌上限，并累计因营盈产生的摸牌/弃牌数
					const info = (player.storage.xiaobai_yingying ??= { draw: 0, discard: 0 });
					const limit = player.getHandcardLimit();
					const count = player.countCards("h");
					if (count < limit) {
						info.draw += limit - count;
						await player.draw(limit - count);
					} else if (count > limit) {
						const num = count - limit;
						await player.chooseToDiscard(num, "h", true).set("prompt", "营盈：弃置" + get.cnNumber(num) + "张手牌（将手牌数调整为手牌上限）").forResult();
						info.discard += num;
					}
					// 锁定标记：累计摸牌数大于弃牌数时显示
					if (info.draw > info.discard) {
						player.markSkill("xiaobai_yingying_lock");
					} else {
						player.unmarkSkill("xiaobai_yingying_lock");
					}
					player.updateMarks("xiaobai_yingying");
				},
			};
		},
		prompt(links) {
			return "营盈：将手牌数调整为手牌上限，视为使用或打出" + (links[0][3] ? get.translation(links[0][3]) : "") + "【" + get.translation(links[0][2]) + "】";
		},
	},
	ai: {
		order: 4,
		result: { player: 1 },
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag, arg) {
			if (tag != "respondSha" && tag != "respondShan" && tag != "save") return false;
			if (player.countCards("h") == player.getHandcardLimit()) return false;
			const info = player.storage.xiaobai_yingying || { draw: 0, discard: 0 };
			return !(info.draw > info.discard && player.countCards("h") <= player.getHandcardLimit());
		},
	},
	mark: true,
	marktext: "盈",
	intro: {
		markcount(storage, player) {
			const info = player.storage.xiaobai_yingying || { draw: 0, discard: 0 };
			return Math.max(0, info.draw - info.discard);
		},
		content(storage, player) {
			const info = player.storage.xiaobai_yingying || { draw: 0, discard: 0 };
			let str = "因〖营盈〗累计摸牌" + get.cnNumber(info.draw) + "张，累计弃牌" + get.cnNumber(info.discard) + "张";
			if (info.draw > info.discard) {
				str += "<br>当前仅可通过弃牌发动〖营盈〗";
			}
			return str;
		},
	},
	init(player) {
		player.storage.xiaobai_yingying ??= { draw: 0, discard: 0 };
	},
	onremove(player) {
		delete player.storage.xiaobai_yingying;
		player.unmarkSkill("xiaobai_yingying_lock");
	},
	subSkill: {
		used: {
			charlotte: true,
		},
		lock: {
			// 锁定提示标记：累计摸牌数大于弃牌数时由 precontent 动态挂/摘
			name: "营盈",
			mark: true,
			marktext: "锁",
			intro: {
				content(storage, player) {
					const info = player.storage.xiaobai_yingying || { draw: 0, discard: 0 };
					return "累计摸牌" + get.cnNumber(info.draw) + "张大于累计弃牌" + get.cnNumber(info.discard) + "张：当前仅可通过弃牌发动〖营盈〗（发动时须弃置手牌至手牌上限）";
				},
			},
		},
	},
},
// === 横弦 ===
xiaobai_hengxian: {
	audio: 2,
	trigger: { player: "phaseUseEnd" },
	filter(event, player) {
		// 场上存在三名角色的手牌数能构成三角形
		return lib.skill.xiaobai_hengxian.hasTriangle(lib.skill.xiaobai_hengxian.getCounts(), false);
	},
	async content(event, trigger, player) {
		// 将手牌数调整为4
		await qunyou_adjustHandTo(player, 4);
		// 用调整后的场上手牌数判定是否存在等腰三角形
		if (!lib.skill.xiaobai_hengxian.hasTriangle(lib.skill.xiaobai_hengxian.getCounts(), true)) return;
		const chooseResult = await player
			.chooseTarget([3, 3], "横弦：选择三名能构成等腰三角形的角色", (card, player2, target) => {
				// 单个角色可行性：场上存在包含该角色的等腰三角形三元组
				const others = game.filterPlayer(current => current != target).map(current => current.countCards("h"));
				const myNum = target.countCards("h");
				for (let i = 0; i < others.length; i++) {
					for (let j = i + 1; j < others.length; j++) {
						if (lib.skill.xiaobai_hengxian.canFormTriangle(myNum, others[i], others[j]) && (myNum == others[i] || myNum == others[j] || others[i] == others[j])) {
							return true;
						}
					}
				}
				return false;
			})
			.set("complexSelect", true)
			.set("filterOk", () => {
				// 确定按钮实时校验：当前选中的三人须构成等腰三角形
				if (ui.selected.targets.length < 3) return false;
				const [a, b, c] = ui.selected.targets.map(current => current.countCards("h"));
				return lib.skill.xiaobai_hengxian.canFormTriangle(a, b, c) && (a == b || a == c || b == c);
			})
			.set("ai", target => -get.attitude(player, target))
			.forResult();
		if (!chooseResult?.bool || !chooseResult.targets?.length || chooseResult.targets.length < 3) return;
		const three = chooseResult.targets;
		const swapResult = await player
			.chooseTarget([2, 2], "横弦：选择其中两名角色交换其全部手牌", (card, player2, target) => {
				return three.includes(target);
			})
			.set("ai", target => -get.attitude(player, target))
			.forResult();
		if (!swapResult?.bool || !swapResult.targets?.length || swapResult.targets.length < 2) return;
		await swapResult.targets[0].swapHandcards(swapResult.targets[1]);
		game.log(swapResult.targets[0], "和", swapResult.targets[1], "交换了全部手牌");
	},
	canFormTriangle(a, b, c) {
		return a + b > c && a + c > b && b + c > a;
	},
	getCounts() {
		return game.filterPlayer().map(current => current.countCards("h"));
	},
	hasTriangle(counts, isosceles) {
		// isosceles=true 时要求至少两人手牌数相等（等腰，含等边）
		for (let i = 0; i < counts.length; i++) {
			for (let j = i + 1; j < counts.length; j++) {
				for (let k = j + 1; k < counts.length; k++) {
					const a = counts[i], b = counts[j], c = counts[k];
					if (!lib.skill.xiaobai_hengxian.canFormTriangle(a, b, c)) continue;
					if (!isosceles || a == b || a == c || b == c) return true;
				}
			}
		}
		return false;
	},
	ai: {
		threaten: 1.2,
	},
},
// === 琢圆 ===
xiaobai_zhuyuan: {
	audio: 2,
	locked: true,
	trigger: { player: "phaseDiscardBefore" },
	forced: true,
	group: ["xiaobai_zhuyuan_refresh"],
	mark: true,
	marktext: "圆",
	intro: {
		markcount(storage, player) {
			return game.countPlayer(current => current.countCards("h") == 4);
		},
		content(storage, player) {
			const num = game.countPlayer(current => current.countCards("h") == 4);
			let str = "你的弃牌阶段改为弃置" + get.cnNumber(num * num) + "张牌（X为场上手牌数为4的角色数：" + get.cnNumber(num) + "；不足全弃）";
			if (player.hasSkill("xiaobai_zhuyuan_eff")) {
				str += "<br>当前处于调整状态：直到你的下个回合开始，你的手牌数发生变化后，将调整为4";
			}
			return str;
		},
	},
	async content(event, trigger, player) {
		// 弃牌阶段改为弃置 X² 张牌（X为场上手牌数为4的角色数，不足全弃）
		trigger.cancel();
		const X = game.countPlayer(current => current.countCards("h") == 4);
		const num = Math.min(X * X, player.countCards("h"));
		if (num > 0) {
			await player.chooseToDiscard(num, "h", true).set("prompt", "琢圆：弃置" + get.cnNumber(num) + "张手牌").set("ai", card => 5 - get.value(card)).forResult();
		}
		// 直到下个你的回合开始：手牌数发生变化后调整为4（本次弃牌即一次变化，会立即拉回4）
		player.addTempSkill("xiaobai_zhuyuan_eff", { player: "phaseBeginStart" });
		player.unmarkSkill("xiaobai_zhuyuan");
	},
	subSkill: {
		refresh: {
			// 手牌数变化时实时刷新计数气泡（圆/○ 状态共用，updateMarks 只刷新当前显示的标记）
			name: "琢圆",
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: {
				global: ["loseAfter", "gainAfter", "loseAsyncAfter", "equipAfter", "addToExpansionAfter", "addJudgeAfter"],
			},
			content(event, trigger, player) {
				player.updateMarks();
			},
		},
		eff: {
			// 调整状态：手牌数变化后调整为4，直到下个你的回合开始（过期自动移除并切回"圆"标记）
			name: "琢圆",
			mark: true,
			marktext: "○",
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			intro: {
				markcount(storage, player) {
					return game.countPlayer(current => current.countCards("h") == 4);
				},
				content(storage, player) {
					const num = game.countPlayer(current => current.countCards("h") == 4);
					return "直到你的下个回合开始：当你的手牌数发生变化后，你将手牌数调整为4（当前场上手牌数为4的角色数：" + get.cnNumber(num) + "）";
				},
			},
			trigger: {
				player: ["loseAfter", "gainAfter"],
				global: ["loseAsyncAfter", "equipAfter", "addToExpansionAfter", "gainAfter", "addJudgeAfter"],
			},
			filter(event, player) {
				return player.countCards("h") != 4;
			},
			async content(event, trigger, player) {
				await qunyou_adjustHandTo(player, 4);
			},
			onremove(player) {
				// 状态结束：切回"圆"标记
				player.markSkill("xiaobai_zhuyuan");
			},
		},
	},
},
// === 三法 ===
xiaobai_sanfa: {
	audio: 2,
	enable: "chooseToUse",
	group: ["xiaobai_sanfa_add_name", "xiaobai_sanfa_add_base"],
	getTargets(player) {
		// 转化目标：牌名池（正向）；登仙后 ⇄：牌名池的属性杀实体牌也可反转为底牌池类别
		const info = lib.skill.xiaobai_sanfa.getInfo(player);
		const targets = info.names.map(n => ["basic", "", "sha", n]);
		if (player.storage.xiaobai_dengxian) {
			if (info.bases.includes("sha")) targets.push(["basic", "", "sha", ""]);
			if (info.bases.includes("basic")) for (const name of ["tao", "jiu", "shan"]) targets.push(["basic", "", name, ""]);
			if (info.bases.includes("trick")) for (const name of get.inpile("trick")) targets.push(["trick", "", name, ""]);
		}
		return targets;
	},
	materialForTarget(card, target, info) {
		// 配对转化：底牌池类别的牌→牌名池产物；牌名池的属性杀→底牌池类别产物（登仙后⇄）
		const name = get.name(card);
		const nature = get.nature(card);
		const type = get.type(card);
		if (target[2] == "sha" && info.names.includes(target[3])) {
			return (name == "sha" && info.bases.includes("sha")) ||
				(info.bases.includes("basic") && type == "basic") ||
				(info.bases.includes("trick") && type == "trick");
		}
		return name == "sha" && nature && info.names.includes(nature);
	},
	filter(event, player) {
		const info = lib.skill.xiaobai_sanfa.getInfo(player);
		if (!player.hasCard(card => lib.skill.xiaobai_sanfa.isMaterial(card, info), "h")) return false;
		return lib.skill.xiaobai_sanfa.getTargets(player).some(t =>
			event.filterCard(new lib.element.VCard({ name: t[2], nature: t[3], isCard: true, storage: { xiaobai_sanfa: true } }), player, event) &&
			player.hasCard(card => lib.skill.xiaobai_sanfa.materialForTarget(card, t, info), "h")
		);
	},
	chooseButton: {
		dialog(event, player) {
			const info = lib.skill.xiaobai_sanfa.getInfo(player);
			const targets = lib.skill.xiaobai_sanfa.getTargets(player).filter(t =>
				event.filterCard(new lib.element.VCard({ name: t[2], nature: t[3], isCard: true, storage: { xiaobai_sanfa: true } }), player, event) &&
				player.hasCard(card => lib.skill.xiaobai_sanfa.materialForTarget(card, t, info), "h")
			);
			const title = player.storage.xiaobai_dengxian
				? "三法：相互转化使用"
				: "三法：将一张【杀】当" + info.names.map(n => (n == "fire" ? "火" : n == "ice" ? "冰" : "雷") + "【杀】").join("、") + "使用";
			return ui.create.dialog(title, [targets, "vcard"]);
		},
		check(button) {
			const player = get.player();
			return player.getUseValue(new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true }));
		},
		backup(links, player) {
			const target = links[0];
			const info = lib.skill.xiaobai_sanfa.getInfo(player);
			return {
				audio: "xiaobai_sanfa",
				viewAs: { name: target[2], nature: target[3], isCard: true, storage: { xiaobai_sanfa: true } },
				filterCard: card => lib.skill.xiaobai_sanfa.materialForTarget(card, target, info),
				selectCard: 1,
				prompt: "三法：将一张牌当" + (target[3] ? get.translation(target[3]) : "") + "【" + get.translation(target[2]) + "】使用",
			};
		},
	},
	getInfo(player) {
		return (player.storage.xiaobai_sanfa ??= { names: ["thunder"], bases: ["sha"] });
	},
	isMaterial(card, info) {
		// 底牌池：初始为【杀】（含雷/火/冰杀变体），随添加扩展基本牌/普通锦囊牌
		const name = get.name(card);
		if (name == "sha") return true;
		if (info.bases.includes("basic") && get.type(card) == "basic") return true;
		if (info.bases.includes("trick") && get.type(card) == "trick") return true;
		return false;
	},
	addName(player) {
		const info = lib.skill.xiaobai_sanfa.getInfo(player);
		for (const n of ["fire", "ice"]) {
			if (!info.names.includes(n)) {
				info.names.push(n);
				return n;
			}
		}
		return null;
	},
	addBase(player) {
		const info = lib.skill.xiaobai_sanfa.getInfo(player);
		for (const b of ["basic", "trick"]) {
			if (!info.bases.includes(b)) {
				info.bases.push(b);
				return b;
			}
		}
		return null;
	},
	subSkill: {
		add_name: {
			name: "三法",
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { source: "damage" },
			filter(event, player) {
				// 三法产出的杀造成伤害（被防止不算）：牌名池添加下一个未添加项（每次使用只添加一次）
				if (!event.card?.storage?.xiaobai_sanfa || !(event.num > 0)) return false;
				if (event.getParent("useCard").sanfa_damaged) return false;
				const info = lib.skill.xiaobai_sanfa.getInfo(player);
				return ["fire", "ice"].some(n => !info.names.includes(n));
			},
			async content(event, trigger, player) {
				trigger.getParent("useCard").sanfa_damaged = true;
				const n = lib.skill.xiaobai_sanfa.addName(player);
				game.log(player, "的〖三法〗转换牌名添加了", "#g" + (n == "fire" ? "火【杀】" : "冰【杀】"));
			},
		},
		add_base: {
			name: "三法",
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { player: "useCardAfter" },
			filter(event, player) {
				// 三法产出的牌未造成伤害：底牌池添加下一个未添加项
				if (!event.card?.storage?.xiaobai_sanfa || event.sanfa_damaged) return false;
				const info = lib.skill.xiaobai_sanfa.getInfo(player);
				return ["basic", "trick"].some(b => !info.bases.includes(b));
			},
			async content(event, trigger, player) {
				const b = lib.skill.xiaobai_sanfa.addBase(player);
				game.log(player, "的〖三法〗转换底牌添加了", "#g" + (b == "basic" ? "基本牌" : "普通锦囊牌"));
			},
		},
	},
	ai: {
		order: 6,
		result: { player: 1 },
		// 登仙后产物含闪/桃/任意锦囊：响应与濒死窗口的预检（未登仙时产物仅属性杀，无这些窗口）
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag, arg) {
			if (!player.storage.xiaobai_dengxian) return false;
			if (tag != "respondSha" && tag != "respondShan" && tag != "save") return false;
			return player.hasCard(card => lib.skill.xiaobai_sanfa.isMaterial(card, lib.skill.xiaobai_sanfa.getInfo(player)), "h");
		},
		hiddenCard(player, name) {
			if (!player.storage.xiaobai_dengxian) return false;
			return get.type(name) == "basic";
		},
	},
},
// === 释道 ===
xiaobai_shidao: {
	audio: 2,
	trigger: { global: "phaseEnd" },
	filter(event, player) {
		// 本回合内有人造成过属性伤害（伤害历史在个人历史上，全局历史无 damage 键）
		if (lib.skill.xiaobai_shidao.getTurnAttrs(event).size <= 0) return false;
		// he 区域没有可重铸的牌：无事可做，不发动
		return player.countCards("he", card => lib.filter.cardRecastable(card, player)) > 0;
	},
	getTurnAttrs(turnEvent) {
		const attrs = new Set();
		for (const current of game.players.concat(game.dead)) {
			current.getHistory("damage", evt => {
				if (evt.nature && evt.getParent?.("phase") === turnEvent) attrs.add(evt.nature);
			});
		}
		return attrs;
	},
	async content(event, trigger, player) {
		// he 区域没有可重铸的牌：直接返回
		if (!player.countCards("he", card => lib.filter.cardRecastable(card, player))) return;
		const result = await player
			.chooseCard("he", true, "释道：重铸一张牌")
			.set("filterCard", card => lib.filter.cardRecastable(card, player))
			.set("ai", card => 5 - get.value(card))
			.forResult();
		const card = result?.cards?.[0];
		if (!card) return;
		await player.recast(card);
		const info = lib.skill.xiaobai_sanfa.getInfo(player);
		const type = get.type(card);
		const name = get.name(card);
		const nature = get.nature(card);
		// 转换底牌匹配：【杀】（含雷/火/冰杀）/已添加的基本牌/已添加的普通锦囊牌——摸一张牌
		const isBase =
			(name == "sha" && info.bases.includes("sha")) ||
			(info.bases.includes("basic") && type == "basic") ||
			(info.bases.includes("trick") && type == "trick");
		if (isBase) {
			player.storage.xiaobai_shidao_base = true;
			await player.draw();
			game.log(player, "因〖释道〗摸了一张牌");
		}
		// 转换牌名匹配：雷/火/冰杀——对一名其他角色造成1点属性伤害（属性为本回合出现过的属性伤害中选一种）
		// 雷杀等同时满足底牌与牌名：两效皆发
		if (name == "sha" && nature && info.names.includes(nature)) {
			player.storage.xiaobai_shidao_name = true;
			const attrs = [...lib.skill.xiaobai_shidao.getTurnAttrs(trigger)];
			let attr = attrs[0];
			if (attrs.length > 1) {
				const sel = await player
					.chooseControl(attrs.map(a => get.translation(a) + "属性"))
					.set("prompt", "释道：选择造成伤害的属性")
					.set("ai", () => 0)
					.forResult();
				if (!sel?.control) return;
				attr = attrs.find(a => get.translation(a) + "属性" == sel.control) || attr;
			}
			const targetResult = await player
				.chooseTarget("释道：对一名其他角色造成1点" + get.translation(attr) + "属性伤害", (card, player2, target) => target != player2 && target.isIn())
				.set("ai", target => get.damageEffect(target, player, player, attr))
				.forResult();
			if (!targetResult?.bool || !targetResult.targets?.length) return;
			await targetResult.targets[0].damage(player, 1, attr);
		}
	},
	ai: {
		threaten: 1.2,
	},
},
// === 登仙 ===
xiaobai_dengxian: {
	audio: 2,
	juexingji: true,
	skillAnimation: true,
	animationColor: "wood",
	lastDo: true,
	trigger: { global: ["useCardAfter", "phaseEnd"] },
	forced: true,
	filter(event, player) {
		if (player.awakenedSkills.includes("xiaobai_dengxian")) return false;
		// 三法双池全满 + 释道两分支均执行过
		const info = player.storage.xiaobai_sanfa;
		if (!info || info.names.length < 3 || info.bases.length < 2) return false;
		if (!player.storage.xiaobai_shidao_base || !player.storage.xiaobai_shidao_name) return false;
		return true;
	},
	async content(event, trigger, player) {
		player.awakenSkill("xiaobai_dengxian");
		// 体力上限调整为9（只改上限，不动体力）
		player.maxHp = 9;
		player.update();
		game.log(player, "的体力上限调整为9");
		// 可令一名其他角色获得一个全新的〖三法〗
		const result = await player
			.chooseTarget("登仙：可令一名其他角色获得〖三法〗（可取消）", (card, player2, target) => target != player2 && !target.hasSkill("xiaobai_sanfa"))
			.set("ai", target => (get.attitude(player, target) > 0 ? 1 : 0))
			.forResult();
		if (result?.bool && result.targets?.length) {
			const target = result.targets[0];
			target.addSkill("xiaobai_sanfa");
			game.log(target, "获得了技能", "#g【三法】");
		}
		// 此后你的三法开启相互转化（动态描述与材料范围随之变化）
		player.storage.xiaobai_dengxian = true;
	},
},
// === 叛探 ===
xiaobai_pantan: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	position: "hes",
	filterCard: true,
	viewAs: { name: "zhibi" },
	filter(event, player) {
		if (!lib.card.zhibi) return false;
		if (!player.countCards("hes")) return false;
		return player.hasUseTarget({ name: "zhibi", isCard: true });
	},
	prompt: "将一张牌当【知己知彼】使用",
	check(card) {
		return 6 - get.value(card);
	},
	group: ["xiaobai_pantan_effect"],
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
	subSkill: {
		effect: {
			charlotte: true,
			name: "叛探",
			forced: true,
			popup: false,
			trigger: { player: "useCardAfter" },
			filter(event, player) {
				return event.skill == "xiaobai_pantan";
			},
			async content(event, trigger, player) {
				// 转化的牌 + 观看的牌（身份局【知己知彼】观看的即目标手牌）
				const cards = (trigger.cards || []).slice(0);
				const target = trigger.targets?.find((current) => current.isIn());
				const viewed = target ? target.getCards("h").slice(0) : [];
				const all = cards.concat(viewed);
				const hasDamage = all.some((card) => get.is.damageCard(card));
				const names = all.map((card) => get.name(card, false));
				const hasSame = new Set(names).size < names.length;
				if (hasDamage) {
					await player.draw();
				}
				if (hasSame) {
					const vcard = get.autoViewAs({ name: "juedou", isCard: true }, "unsure");
					if (player.hasUseTarget(vcard)) {
						await player.chooseUseTarget(vcard, true);
					}
				}
				// 乘势：其余分支的触发条件均满足后，你变更势力
				if (hasDamage && hasSame) {
					const groups = lib.group.filter((group) => !lib.selectGroup.includes(group) && group != player.group);
					if (!groups.length) return;
					const choice = await player
						.chooseButton(["叛探：选择要变更的势力", [groups.map((group) => ["", "", `group_${group}`]), "vcard"]], true)
						.set("direct", true)
						.set("ai", (button) => {
							const group = button.link[2].slice(6);
							if (group === "wei") return 10;
							if (group === "qun") return 5;
							return 1;
						})
						.forResult();
					if (choice?.bool && choice.links?.length) {
						await player.changeGroup(choice.links[0][2].slice(6));
					}
				}
			},
		},
	},
},
// === 蛮异 ===
xiaobai_manyi: {
	audio: 2,
	direct: true,
	trigger: { player: "phaseJieshuBegin" },
	group: ["xiaobai_manyi_snapshot"],
	filter(event, player) {
		const info = player.storage.xiaobai_manyi_snapshot;
		if (!info) return false;
		const canDamage = game.hasPlayer(
			(current) => current != player && current.isIn() && info.players[current.playerid] == info.group && current.group != player.group
		);
		const canDraw = game.hasPlayer((current) => current.isIn() && current.group == player.group);
		return canDamage || canDraw;
	},
	async content(event, trigger, player) {
		const info = player.storage.xiaobai_manyi_snapshot;
		const canDamage = game.hasPlayer(
			(current) => current != player && current.isIn() && info?.players[current.playerid] == info?.group && current.group != player.group
		);
		const canDraw = game.hasPlayer((current) => current.isIn() && current.group == player.group);
		const controls = [];
		const choiceList = [];
		if (canDamage) {
			controls.push("选项一");
			choiceList.push("对一名与你本回合开始时势力相同但此时不同的角色造成1点伤害");
		}
		if (canDraw) {
			controls.push("选项二");
			choiceList.push("令一名与你此时势力相同的角色摸两张牌");
		}
		controls.push("背水", "cancel2");
		choiceList.push("背水");
		const result = await player
			.chooseControl(controls)
			.set("choiceList", choiceList)
			.set("prompt", "蛮异：选择一项")
			.set("ai", () => "cancel2")
			.forResult();
		if (result.control === "cancel2") return;
		player.logSkill("xiaobai_manyi");
		const backwater = result.control === "背水";
		if (result.control === "选项一" || backwater) {
			const targets = game.filterPlayer(
				(current) => current != player && info?.players[current.playerid] == info?.group && current.group != player.group
			);
			if (targets.length) {
				const result2 = await player
					.chooseTarget("蛮异：对一名角色造成1点伤害", (card, player2, target) => targets.includes(target))
					.set("ai", (target) => get.damageEffect(target, get.player(), get.player()))
					.forResult();
				if (result2?.bool && result2.targets?.length) {
					await result2.targets[0].damage({ num: 1, source: player });
				}
			}
		}
		if (result.control === "选项二" || backwater) {
			const targets = game.filterPlayer((current) => current.group == player.group);
			if (targets.length) {
				const result2 = await player
					.chooseTarget("蛮异：令一名角色摸两张牌", (card, player2, target) => targets.includes(target))
					.set("ai", (target) => (target == get.player() ? 3 : get.attitude(get.player(), target)))
					.forResult();
				if (result2?.bool && result2.targets?.length) {
					await result2.targets[0].draw(2);
				}
			}
		}
		// 背水：本局游戏你不能变更至本回合开始时的势力
		if (backwater) {
			player.storage.xiaobai_manyi_forbidGroup = info?.group;
			player.addSkill("xiaobai_manyi_forbid");
			game.log(player, "发动了背水，本局游戏不能变更至", `#y${get.translation(info?.group)}`, "势力");
		}
	},
	subSkill: {
		snapshot: {
			charlotte: true,
			trigger: { player: "phaseBeginStart" },
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				const players = {};
				game.players.forEach((current) => {
					players[current.playerid] = current.group;
				});
				player.storage.xiaobai_manyi_snapshot = { group: player.group, players };
			},
		},
		forbid: {
			charlotte: true,
			name: "蛮异",
			trigger: { player: "changeGroupBegin" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const group = player.storage.xiaobai_manyi_forbidGroup;
				return !!group && event.group == group;
			},
			content(event, trigger, player) {
				trigger.cancel();
				game.log(player, "不能变更至", `#y${get.translation(trigger.group)}`, "势力");
			},
		},
	},
},
// === 补隙 ===
xiaobai_buxi: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("he") >= 2 && game.hasPlayer((current) => current.countCards("he") > 0);
	},
	async content(event, trigger, player) {
		const discard = await player.chooseToDiscard(2, "he", true, "补隙：弃置两张牌").forResult();
		if (!discard?.bool || !discard.cards?.length) return;
		const guo = await player.chooseUseTarget({ name: "guohe", isCard: true }, true).forResult();
		if (!guo?.bool) return;
		// 按全局移动历史取“最后进入弃牌堆的三张牌”（偏宠同款收集）
		const order = [];
		game.getGlobalHistory("cardMove", (evt) => {
			if (evt.name != "cardsDiscard" && (evt.name != "lose" || evt.position != ui.discardPile)) return;
			order.addArray(evt.cards);
		});
		const last3 = order.slice(-3).filter((card) => card && get.position(card, true) == "d");
		let picks = [];
		if (last3.length === 3) {
			// 类型与余者均不同：三张中该牌类型唯一者；三类型互异则三张全入（按进堆顺序使用）
			const types = last3.map((card) => get.type2(card));
			picks = last3.filter((card) => types.filter((type) => type == get.type2(card)).length == 1);
		}
		if (picks.length) {
			// 直接使用弃牌堆里的实体牌（保留原牌面），引擎将其从弃牌堆拉出正常结算
			for (const card of picks) {
				if (player.hasUseTarget(card)) {
					player.logSkill("xiaobai_buxi");
					await player.chooseUseTarget(card, true);
				}
			}
			return;
		}
		// 没有此类牌：视为使用一张单体伤害牌（凭空 vcard）
		const list = get.inpileVCardList(
			(info) => info[0] != "delay" && get.tag({ name: info[2] }, "damage") && !["nanman", "wanjian"].includes(info[2])
		);
		if (!list.some((info) => player.hasUseTarget({ name: info[2], nature: info[3], isCard: true }))) return;
		player.logSkill("xiaobai_buxi");
		const picked = await player
			.chooseButton(["补隙：视为使用一张单体伤害牌", [list, "vcard"]], true)
			.set("ai", (button) => {
				const player2 = get.player();
				const vcard = { name: button.link[2], nature: button.link[3], isCard: true };
				return player2.hasUseTarget(vcard) ? player2.getUseValue(vcard, null, true) + 0.1 : 0;
			})
			.forResult();
		if (!picked?.bool || !picked.links?.length) return;
		const vcard = { name: picked.links[0][2], nature: picked.links[0][3], isCard: true };
		if (player.hasUseTarget(vcard)) await player.chooseUseTarget(vcard, true, false);
	},
},
// === 贞律 ===
xiaobai_zhenlv: {
	audio: 2,
	group: ["xiaobai_zhenlv_grant"],
	// 你的回合内使用牌后，本回合全场无懈仅能以收回装备方式使用（tempSkill 回合结束自动过期）
	trigger: { player: "useCard1" },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		return _status.currentPhase === player;
	},
	content(event, trigger, player) {
		for (const current of game.filterPlayer((current2) => current2.isIn())) {
			current.addTempSkill("xiaobai_zhenlv_g", "phaseAfter");
		}
	},
	subSkill: {
		grant: {
			charlotte: true,
			forced: true,
			name: "贞律",
			popup: false,
			silent: true,
			trigger: { global: "useCard1" },
			filter(event, player) {
				return event.card?.storage?.xiaobai_zhenlv && event.player.isIn();
			},
			content(event, trigger, player) {
				const user = trigger.player;
				if (!user.hasSkill("xiaobai_shuanglv")) user.addSkill("xiaobai_shuanglv");
				user.addMark("xiaobai_shuanglv", 1, false);
				user.updateMarks("xiaobai_shuanglv");
				game.log(user, "获得一层", "#g【爽律】");
			},
		},
	},
},
// 收回一张装备牌当【无懈可击】使用（贞律激活时挂给全场角色，回合结束自动移除）
xiaobai_zhenlv_g: {
	audio: "xiaobai_zhenlv",
	charlotte: true,
	name: "贞律",
	enable: "chooseToUse",
	position: "e",
	filter(event, player) {
		if (event.name != "chooseToUse" || event.type != "wuxie") return false;
		return player.countCards("e") > 0;
	},
	hiddenCard(player, name) {
		return name == "wuxie" && player.countCards("e") > 0;
	},
	filterCard() {
		return true;
	},
	selectCard: 1,
	viewAs(cards) {
		// 防御空 cards（引擎点按钮/缓存期会以空选中调用 viewAs，知识库 #57）；透传装备花色点数
		const card = cards?.[0];
		return card
			? { name: "wuxie", suit: get.suit(card), number: get.number(card), isCard: true, storage: { xiaobai_zhenlv: true } }
			: { name: "wuxie", isCard: true, storage: { xiaobai_zhenlv: true } };
	},
	async precontent(event, trigger, player) {
		player.logSkill("xiaobai_zhenlv", player);
		// 收回装备进手牌后清空材料列表，无懈按纯虚拟牌结算，装备牌不被消耗（逾围 #60 模式）
		const card = event.result?.cards?.[0];
		if (card && get.position(card) == "e") {
			player.$give(card, player, false);
			await player.gain(card, "gain2");
			event.result.cards = [];
		}
	},
	prompt: "将装备区里的一张牌收回，视为使用【无懈可击】",
	// 无懈响应窗口 filterCard 走 cardEnabled(…, "forceEnable")，仍过 checkMod("cardEnabled")：
	// 封掉无贞律标记的（手牌实体）无懈，仅放行本技能转化出的 vcard
	mod: {
		cardEnabled(card) {
			if (get.name(card) == "wuxie" && !card.storage?.xiaobai_zhenlv) return false;
		},
	},
},
// === 爽律 ===
xiaobai_shuanglv: {
	audio: 2,
	locked: true,
	forced: true,
	mark: true,
	marktext: "爽",
	intro: {
		markcount(storage) {
			return storage || 0;
		},
		content(storage) {
			return `拥有${get.cnNumber(storage || 0)}张“爽律”`;
		},
	},
	onremove(player, skill) {
		delete player.storage[skill];
	},
	trigger: { target: "useCardToTargeted", player: "phaseJieshuBegin" },
	filter(event, player, name) {
		return (player.storage.xiaobai_shuanglv || 0) > 0;
	},
	async content(event, trigger, player) {
		const num = player.storage.xiaobai_shuanglv || 0;
		if (!num) return;
		// 一次全消耗：失去此技能（onremove 清层），按现有层数结算
		player.removeSkill("xiaobai_shuanglv");
		if (event.triggername === "useCardToTargeted") {
			// trigger.player = 使用者（_triggerTo 里 next.player = player）
			const user = trigger.player;
			await player.draw(num);
			if (user?.isIn() && user !== player) await user.draw(num);
		} else {
			await player.loseHp(1);
		}
	},
},
// === 安氓 ===
xiaobai_anmang: {
	audio: 2,
	trigger: { global: "damageBegin1" },
	filter(event, player) {
		if (!event.source || event.source === event.player) return false;
		if (event.source === player) return !player.hasSkill("xiaobai_anmang_deal");
		if (event.player === player) return !player.hasSkill("xiaobai_anmang_take");
		return false;
	},
	async content(event, trigger, player) {
		const isSource = trigger.source === player;
		player.addTempSkill(isSource ? "xiaobai_anmang_deal" : "xiaobai_anmang_take", "roundStart");
		trigger.num++;
		// 伤害值与本回合上次摸牌数相同 → 「可以」获得本回合弃牌堆两张牌并回复1点体力（原生：先问是否获得，再由玩家从弃牌堆选牌）
		const last = player.storage.xiaobai_anmang_lastDraw;
		if (typeof last != "number" || last <= 0 || trigger.num != last) return;
		const pile = getTurnDiscardCards().slice(0);
		if (!pile.length) return;
		const want = await player.chooseBool("安氓：是否获得本回合弃牌堆的两张牌并回复1点体力？").set("ai", () => true).forResult();
		if (!want.bool) return;
		const num = Math.min(2, pile.length);
		const res = await player
			.chooseButton([`安氓：选择${get.cnNumber(num)}张牌获得`, [pile, "card"]], true)
			.set("selectButton", [num, num])
			.set("ai", (button) => 6 - get.value(button.link))
			.forResult();
		if (res.bool && res.links?.length) await player.gain(res.links, "gain2");
		if (player.isIn() && player.isDamaged()) await player.recover();
	},
	group: ["xiaobai_anmang_record", "xiaobai_anmang_clear"],
	subSkill: {
		record: {
			charlotte: true,
			name: "安氓",
			trigger: { player: "drawAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.num > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_anmang_lastDraw = trigger.num;
			},
		},
		clear: {
			charlotte: true,
			name: "安氓",
			trigger: { global: "phaseBeginStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return typeof player.storage.xiaobai_anmang_lastDraw == "number";
			},
			content(event, trigger, player) {
				delete player.storage.xiaobai_anmang_lastDraw;
			},
		},
	},
},
// === 按祚 ===
xiaobai_anzuo: {
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "orange",
	enable: "phaseUse",
	filter(event, player) {
		return true;
	},
	async content(event, trigger, player) {
		player.awakenSkill("xiaobai_anzuo");
		const result = await player
			.chooseTarget("按祚：令一名角色加1点体力上限", true)
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		const target = result?.targets?.[0];
		if (!target) return;
		target.gainMaxHp();
		target.addSkill("xiaobai_anzuo_buff");
	},
},
// 按祚·附加效果（挂在目标身上的常驻技）
xiaobai_anzuo_buff: {
	audio: 2,
	charlotte: true,
	name: "按祚",
	group: ["xiaobai_anzuo_buff_hp", "xiaobai_anzuo_buff_max", "xiaobai_anzuo_buff_clear"],
	subSkill: {
		hp: {
			charlotte: true,
			name: "按祚",
			trigger: { player: "loseAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				// 「每回合首次」由两个效果共用（原生用 usedEffectTimes(name, HistoryTurn) < 1）
				if (player.storage.xiaobai_anzuo_buff_used) return false;
				// 须是「失去所有手牌」（失去的牌里要有手牌，且失完手牌为空）
				if (!event.hs?.length) return false;
				return !player.countCards("h");
			},
			async content(event, trigger, player) {
				player.storage.xiaobai_anzuo_buff_used = true;
				if (player.isDamaged()) await player.recover();
			},
		},
		max: {
			charlotte: true,
			name: "按祚",
			trigger: { player: "changeHpAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (player.storage.xiaobai_anzuo_buff_used) return false;
				return player.maxHp > 0 && player.hp >= player.maxHp;
			},
			async content(event, trigger, player) {
				player.storage.xiaobai_anzuo_buff_used = true;
				player.loseMaxHp();
			},
		},
		clear: {
			charlotte: true,
			name: "按祚",
			trigger: { global: "phaseBeginStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return Boolean(player.storage.xiaobai_anzuo_buff_used);
			},
			content(event, trigger, player) {
				delete player.storage.xiaobai_anzuo_buff_used;
			},
		},
	},
	onremove(player, skill) {
		delete player.storage.xiaobai_anzuo_buff_used;
	},
},
// === 悲笳 ===
xiaobai_beijia: {
	audio: 2,
	// 防止伤害用 damageBegin4 + trigger.cancel()（原生范本 shixin，mobile/skill.js:32161）
	trigger: { global: "damageBegin4" },
	filter(event, player) {
		if (player.hasSkill("xiaobai_beijia_used")) return false;
		if (!event.source || event.source === event.player) return false;
		const alive = game.filterPlayer((p) => p.isIn());
		if (!alive.length) return false;
		const min = Math.min(...alive.map((p) => p.hp));
		if (event.player.hp !== min) return false;
		const x = event.source.distanceTo(player) + 1;
		return x > 0 && lib.xiaobaiBeijiaFeasible(player, x);
	},
	async content(event, trigger, player) {
		player.addTempSkill("xiaobai_beijia_used", "roundStart");
		const x = trigger.source.distanceTo(player) + 1;
		const cards = [];
		let upper = 15;
		for (let i = 0; i < x; i++) {
			// 第 i+1 张：i 为偶数须「暗置」、为奇数须「明置」（原生 beijia_active 的 is_shown == (i % 2 == 0)）
			const needShown = i % 2 === 1;
			const result = await player
				.chooseCard("h", true, (card) => !cards.includes(card) && get.number(card) < upper && get.is.shownCard(card) === needShown)
				.set("prompt", `悲笳：选择第${get.cnNumber(i + 1)}张${needShown ? "明" : "暗"}置牌（点数须小于${upper > 13 ? "K" : upper}）`)
				.forResult();
			const card = result?.cards?.[0];
			if (!card) break;
			cards.push(card);
			upper = get.number(card);
		}
		if (cards.length < x) return;
		// 交替明置/暗置（第1张明置，第2张暗置，……）
		for (let i = 0; i < cards.length; i++) {
			if (i % 2 === 0) await player.addShownCards(cards[i], "visible_xiaobai_beijia");
			else await player.hideShownCards(cards[i], "visible_xiaobai_beijia");
		}
		trigger.cancel();
	},
},
// === 悖伺 ===
xiaobai_beisi: {
	audio: 2,
	// 原生范本 stdjuxian（sixiang.js:2147）：gainBefore + event.cards 里筛「原本属于你、且在 he 区的牌」
	// （不要用 event.giver —— 它只有 player.give() 才会设，顺手牵羊/技能获得都不会有）
	trigger: { global: "gainBefore" },
	filter(event, player) {
		if (event.player === player) return false;
		if (game.hasPlayer((p) => p.isDying())) return false;
		return lib.xiaobaiBeisiCards(event, player).length > 0;
	},
	async cost(event, trigger, player) {
		event.result = await player.chooseBool(get.prompt2("xiaobai_beisi")).set("ai", () => true).forResult();
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const cards = lib.xiaobaiBeisiCards(trigger, player).slice(0);
		if (!cards.length) return;
		// 改为将这些牌置于牌堆顶：取消本次获得，再把这批牌插到牌堆顶
		trigger.cancel();
		if (!player.isIn()) return;
		await game.cardsGotoPile(cards, "insert");
		game.log(player, "将", cards, "置于牌堆顶");
		// 于当前结算后视为对其使用【笑里藏刀】
		if (!target?.isIn() || !player.isIn()) return;
		const card = new lib.element.VCard({ name: "wy_xiaolicangdao", isCard: true });
		if (player.canUse(card, target, false)) await player.useCard(card, target);
	},
},
// === 秉严 ===
xiaobai_bingyan: {
	audio: 2,
	trigger: { global: "useCard" },
	filter(event, player) {
		if (player.hasSkill("xiaobai_bingyan_disabled")) return false;
		if (!get.tag(event.card, "damage")) return false;
		return get.color(event.card) === "black";
	},
	async content(event, trigger, player) {
		// 令此牌无法被响应
		trigger.directHit.addArray(game.players);
		// 本技能失效（图标变灰 + 标记）至下一次失去黑色牌后；此期间内无法响应基本牌或普通锦囊牌
		player.disableSkill("xiaobai_bingyan_disabled", "xiaobai_bingyan");
		player.addSkill("xiaobai_bingyan_disabled");
		player.addSkill("xiaobai_bingyan_self");
	},
	onremove(player, skill) {
		player.removeSkill("xiaobai_bingyan_disabled");
		player.removeSkill("xiaobai_bingyan_self");
		player.enableSkill("xiaobai_bingyan_disabled");
	},
},
// 秉严·失效（图标变灰 + 标记；失去黑色牌后恢复）
xiaobai_bingyan_disabled: {
	audio: 2,
	charlotte: true,
	name: "秉严",
	mark: true,
	marktext: "严",
	intro: { content: "〖秉严〗已失效（图标变灰）：你无法响应基本牌或普通锦囊牌，直到你下一次失去黑色牌后。" },
	trigger: { player: "loseAfter" },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		return (event.cards || []).some((card) => get.color(card) === "black");
	},
	content(event, trigger, player) {
		player.enableSkill("xiaobai_bingyan_disabled");
		player.removeSkill("xiaobai_bingyan_disabled");
		player.removeSkill("xiaobai_bingyan_self");
	},
	init(player, skill) {
		player.markSkill(skill);
	},
	onremove(player, skill) {
		player.unmarkSkill(skill);
	},
},
// 秉严·锁定期内禁止响应基本牌/普通锦囊牌
xiaobai_bingyan_self: {
	audio: 2,
	charlotte: true,
	name: "秉严",
	mod: {
		cardRespondable(card, player) {
			if (get.type(card) === "basic" || get.type2(card) === "trick") return false;
		},
	},
},
// === 蔽诏 ===
xiaobai_bizhao: {
	audio: 2,
	usable: 1,
	trigger: { global: "useCardToTarget" },
	filter(event, player) {
		if (!get.tag(event.card, "damage")) return false;
		const useEvt = event.getParent("useCard");
		if (!useEvt || useEvt.targets?.length !== 1) return false;
		const target = event.target;
		if (!target || target === event.player) return false;
		if (target === player) return true;
		return player.inRange(target);
	},
	async content(event, trigger, player) {
		const debaters = game.filterPlayer((p) => p.countCards("h") >= player.countCards("h"));
		if (!debaters.length) return;
		const result = await player.chooseToDebate(debaters).forResult();
		if (!result?.bool) return;
		if (result.opinion === "red") {
			// 红色：此牌造成的伤害+1
			if (trigger.card) trigger.card.storage = trigger.card.storage || {};
			if (trigger.card) trigger.card.storage.xiaobai_bizhao_damage = true;
		} else if (result.opinion === "black") {
			// 黑色：使用者弃置一张牌
			const user = trigger.player;
			if (user?.isIn()) await user.chooseToDiscard("he", true);
		}
	},
	group: ["xiaobai_bizhao_damage"],
	subSkill: {
		damage: {
			charlotte: true,
			name: "蔽诏",
			trigger: { global: "damageBegin2" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return !!event.card?.storage?.xiaobai_bizhao_damage;
			},
			content(event, trigger, player) {
				trigger.num++;
			},
		},
	},
},
// === 暗谋 ===
xiaobai_anmou: {
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		return game.hasPlayer((current) => current !== player);
	},
	async cost(event, trigger, player) {
		event.result = await player
			.chooseTarget(get.prompt2("xiaobai_anmou"), (card, player2, target) => target !== player2, true)
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		if (!target) return;
		const storage = { target, list: [] };
		player.storage.xiaobai_anmou = storage;
		const result = await player
			.chooseTarget(`暗谋：令至多三名角色摸一张牌并与${get.translation(target)}延时拼点`, [1, 3], (card, player2, current) => current !== target)
			.set("ai", (current) => (get.attitude(player, current) > 0 ? 2 : 1))
			.forResult();
		if (!result.bool || !result.targets.length) {
			delete player.storage.xiaobai_anmou;
			return;
		}
		await game.asyncDraw(result.targets);
		await game.delay();
		for (const current of result.targets) {
			if (!current.isIn() || !target.isIn() || !current.countCards("h")) continue;
			const res = await current
				.chooseCard("h", true, () => true)
				.set("prompt", `暗谋：选择一张手牌与${get.translation(target)}延时拼点`)
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (!res.bool || !res.cards?.length) continue;
			const otherCard = res.cards[0];
			const selfCard = get.cards()[0];
			if (!selfCard) continue;
			const nums = [get.number(otherCard, current), get.number(selfCard, target)];
			await game.cardsGotoSpecial([otherCard, selfCard]);
			storage.list.push({ cards: [otherCard, selfCard], players: [current, target], nums });
		}
		if (!storage.list.length) {
			delete player.storage.xiaobai_anmou;
			return;
		}
		game.log(player, "发起了", storage.list.length, "次延时拼点");
	},
	group: ["xiaobai_anmou_end"],
	subSkill: {
		end: {
			charlotte: true,
			trigger: { player: ["phaseJieshuBegin", "dieAfter"] },
			forced: true,
			filter(event, player) {
				return !!player.storage.xiaobai_anmou?.list?.length;
			},
			async content(event, trigger, player) {
				const storage = player.storage.xiaobai_anmou;
				const list = storage.list;
				const target = storage.target;
				delete player.storage.xiaobai_anmou;
				if (event.triggername === "dieAfter" || !target?.isIn()) {
					for (const item of list) await game.cardsDiscard(item.cards);
					return;
				}
				while (list.length) {
					let index = 0;
					if (list.length > 1) {
						const controls = list.map((item, i) => `第${get.cnNumber(i + 1)}组`);
						const res = await target
							.chooseControl(controls)
							.set("prompt", "暗谋：选择一组延时拼点公开")
							.set("ai", () => {
								let best = 0,
									bestNum = -Infinity;
								list.forEach((item, i) => {
									const num = (item.nums[1] || 0) - (item.nums[0] || 0);
									if (num > bestNum) {
										bestNum = num;
										best = i;
									}
								});
								return best;
							})
							.forResult();
						index = Math.max(0, controls.indexOf(res.control));
					}
					const item = list.splice(index, 1)[0];
					const [other, self] = item.players;
					const [otherCard, selfCard] = item.cards;
					const [otherNum, selfNum] = item.nums;
					await game.cardsGotoOrdering([otherCard, selfCard]);
					game.log(self, "公开了与", other, "的延时拼点结果");
					game.log(other, "的拼点牌为", otherCard);
					game.log(self, "的拼点牌为", selfCard);
					await game.delayx();
					let winner = null,
						loser = null;
					if (selfNum > otherNum) {
						winner = self;
						loser = other;
					} else if (otherNum > selfNum) {
						winner = other;
						loser = self;
					}
					if (winner) {
						if (winner.isIn()) winner.popup("胜");
						if (loser.isIn()) loser.popup("负");
						const card = new lib.element.VCard({ name: "sha", isCard: true });
						if (winner.isIn() && loser.isIn() && winner.canUse(card, loser)) await winner.useCard(card, loser);
					} else {
						if (self.isIn()) self.popup("平");
						if (other.isIn()) other.popup("平");
					}
					await game.cardsDiscard([otherCard, selfCard]);
					if (winner === self || !self.isIn()) break;
				}
				for (const item of list) await game.cardsDiscard(item.cards);
			},
		},
	},
},
// === 狈变 ===
xiaobai_beibian: {
	audio: 2,
	groupSkill: "shu",
	enable: "chooseToUse",
	// hiddenCard 必须在技能顶层：喂 hasUsableCard 预检
	hiddenCard(player, name) {
		if (name != "juedou" || player.group != "shu") return false;
		return player.hasCard((card) => lib.skill.xiaobai_beibian.filterCard(card, player), "hes");
	},
	position: "hes",
	viewAs: { name: "juedou" },
	viewAsFilter(player) {
		if (player.group != "shu") return false;
		return player.hasCard((card) => lib.skill.xiaobai_beibian.filterCard(card, player), "hes");
	},
	filterCard(card, player) {
		const type = get.type2(card);
		return type != "basic" && type != player.storage.xiaobai_beibian_type;
	},
	selectCard: 1,
	prompt: "将一张非基本牌当【决斗】使用",
	check(card) {
		return 6 - get.value(card);
	},
	onuse(result, player) {
		const sub = result.card?.cards?.[0] || result.cards?.[0];
		if (sub) player.storage.xiaobai_beibian_type = get.type2(sub);
	},
	group: ["xiaobai_beibian_effect"],
	subSkill: {
		effect: {
			charlotte: true,
			popup: false,
			forced: true,
			firstDo: true,
			priority: 100,
			trigger: { player: "useCardToBefore" },
			filter(event, player) {
				return event.type === "card" && event.skill === "xiaobai_beibian";
			},
			content(event, trigger, player) {
				trigger.setContent(lib.xiaobaiBeibianDuel);
			},
		},
	},
},
// === 博涉 ===
xiaobai_boshe: {
	audio: 2,
	trigger: { global: "phaseEnd" },
	filter(event, player) {
		const target = event.player;
		if (!target) return false;
		return xiaobaiBosheWays(target).size >= 4;
	},
	async cost(event, trigger, player) {
		event.result = await player.chooseBool(get.prompt2("xiaobai_boshe")).set("ai", () => true).forResult();
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		await player.draw();
		if (player.isIn()) await player.gain(game.createCard("ying", "spade", 1), "gain2");
		if (target.isIn()) await target.gain(game.createCard("ying", "spade", 1), "gain2");
	},
},
// === 博文 ===
xiaobai_bowen: {
	audio: 2,
	enable: "phaseUse",
	usable(skill, player) {
		return xiaobaiBowenX(player);
	},
	filter(event, player) {
		return xiaobaiBowenX(player) > 0;
	},
	async content(event, trigger, player) {
		const x = xiaobaiBowenX(player);
		if (x <= 0) return;
		const viewOption = "观看牌堆顶的牌";
		const controls = [viewOption];
		const candidates = Object.keys(lib.card).filter((name) => {
			const info = lib.card[name];
			if (!info || (info.type != "basic" && info.type != "trick")) return false;
			if (get.translation(name).length != x) return false;
			return player.hasUseTarget(new lib.element.VCard({ name, isCard: true }));
		});
		for (const name of candidates) controls.push(get.translation(name));
		let choice = viewOption;
		if (controls.length > 1) {
			choice = (await player
				.chooseControl(controls)
				.set("prompt", `博文：选择一项（X=${x}）`)
				.set("ai", () => 0)
				.forResult()).control;
		}
		if (choice == viewOption) {
			const viewed = get.cards(x);
			if (!viewed.length) return;
			await player.viewCards("博文：牌堆顶的牌", viewed);
			const res1 = await player.chooseCard("博文：可以弃置任意张牌", [0, Infinity], () => true, "he").forResult();
			const discarded = res1.bool ? res1.cards || [] : [];
			let budget = 0;
			for (const card of discarded) budget += get.translation(card.name).length;
			if (discarded.length) await player.discard(discarded);
			let gained = [];
			if (budget > 0) {
				const res2 = await player
					.chooseButton([`博文：选择获得的牌（牌名字数和不超过${budget}）`, viewed], [0, viewed.length])
					.set("filterButton", (button) => {
						let num = get.translation(button.link.name).length;
						for (const btn of ui.selected.buttons) {
							if (btn != button) num += get.translation(btn.link.name).length;
						}
						return num <= budget;
					})
					.forResult();
				if (res2.bool) gained = res2.links || [];
			}
			if (gained.length) await player.gain(gained, "gain2");
			const rest = viewed.filter((card) => !gained.includes(card));
			if (rest.length) await game.cardsGotoPile(rest.slice().reverse(), "insert");
		} else {
			const name = candidates.find((current) => get.translation(current) == choice);
			if (!name) return;
			const card = new lib.element.VCard({ name, isCard: true });
			if (!player.hasUseTarget(card)) return;
			await player.chooseUseTarget(card);
			const phase = event.getParent("phaseUse");
			if (phase) phase.skipped = true;
		}
	},
},
// === 拨珠 ===
xiaobai_bozhu: {
	audio: 2,
	mark: true,
	intro: { content: "expansion", markcount: "expansion" },
	trigger: { player: "useCardToPlayer", target: "useCardToTarget" },
	filter(event, player, name) {
		if (!event.card) return false;
		const type = get.type(event.card);
		if (type != "basic" && type != "trick") return false;
		if (name == "useCardToPlayer" && !event.isFirstTarget) return false;
		return player.countCards("he") >= 3 || player.getExpansions("xiaobai_bozhu").length >= 2;
	},
	async content(event, trigger, player) {
		const canSet = player.countCards("he") >= 3;
		const canGet = player.getExpansions("xiaobai_bozhu").length >= 2;
		const choices = [];
		if (canSet) choices.push("将三张牌置于武将牌上");
		if (canGet) choices.push("获得武将牌上的两张牌");
		if (!choices.length) return;
		let control = choices[0];
		if (choices.length > 1) {
			control = (await player.chooseControl(choices).set("prompt", "拨珠：选择一项").set("ai", () => choices[0]).forResult()).control;
		}
		if (control == "将三张牌置于武将牌上") {
			const res = await player.chooseCard("he", [3, 3], () => true).set("prompt", "拨珠：选择三张牌置于武将牌上").forResult();
			if (!res.bool || !res.cards || res.cards.length != 3) return;
			await player.addToExpansion(res.cards, player, "give").set("gaintag", ["xiaobai_bozhu"]);
		} else {
			const expansion = player.getExpansions("xiaobai_bozhu");
			const res = await player.chooseButton(["拨珠：选择获得武将牌上的两张牌", expansion], 2).forResult();
			if (!res.bool || !res.links || res.links.length != 2) return;
			await player.gain(res.links, "gain2");
		}
		if (!player.isIn()) return;
		if (player.countCards("h") != player.countExpansions("xiaobai_bozhu")) return;
		const choice = await player.chooseControl(["令此牌额外结算一次", "令此牌无效"]).set("prompt", "拨珠：选择一项").set("ai", () => 0).forResult();
		const use = trigger.getParent("useCard");
		if (!use) return;
		if (choice.control == "令此牌额外结算一次") {
			use.effectCount = (typeof use.effectCount == "number" ? use.effectCount : 1) + 1;
			game.log(trigger.card, "额外结算一次");
		} else {
			use.all_excluded = true;
			game.log(trigger.card, "被无效了");
		}
	},
},
// === 豺刃 ===
xiaobai_cairen: {
	audio: 2,
	// 仅「使用」（FreeKill enabled_at_response 带 not response）
	enable: "chooseToUse",
	lose: false,
	// hiddenCard 必须在技能顶层：喂 hasSha/hasUsableCard 预检
	hiddenCard(player, name) {
		return name == "sha" && !player.hasSkill("xiaobai_cairen_used");
	},
	ai: {
		order: 4,
		respondSha: true,
		skillTagFilter(player, tag, arg) {
			if (player.hasSkill("xiaobai_cairen_used")) return false;
			if (arg === "respond") return false;
			return tag == "respondSha";
		},
		result: { player: 1 },
	},
	viewAs: { name: "sha", storage: { xiaobai_cairen: true } },
	position: "h",
	selectCard() {
		const selected = ui.selected.cards;
		if (selected.length == 1) return get.type(selected[0]) == "basic" ? [2, 2] : [1, 1];
		return [1, 2];
	},
	filterCard(card, player) {
		const selected = ui.selected.cards;
		if (!selected.length) return true;
		if (selected.length >= 2) return false;
		if (get.type(selected[0]) != "basic") return false;
		return get.type(card) == "basic";
	},
	viewAsFilter(player) {
		return !player.hasSkill("xiaobai_cairen_used");
	},
	prompt: "弃置一张非基本牌，或重铸两张基本牌，视为使用一张【杀】",
	check(card) {
		return 6 - get.value(card);
	},
	mod: {
		targetInRange(card, player, target) {
			if (card?.storage?.xiaobai_cairen && card.cards?.length && card.cards.every((current) => current.name == "ying")) return true;
		},
	},
	group: ["xiaobai_cairen_effect"],
	subSkill: {
		used: {
			charlotte: true,
			popup: false,
		},
		effect: {
			charlotte: true,
			popup: false,
			forced: true,
			trigger: { player: "useCard" },
			filter(event, player) {
				return event.skill == "xiaobai_cairen";
			},
			async content(event, trigger, player) {
				player.addTempSkill("xiaobai_cairen_used", "phaseAfter");
				const cards = trigger.cards || [];
				if (cards.length == 1) await player.discard(cards);
				else if (cards.length >= 2) await player.recast(cards);
				const sub = trigger.card?.cards || cards;
				if (sub.length == 1 || (sub.length >= 2 && get.suit(sub[0]) == get.suit(sub[1]))) {
					await player.gain(game.createCard("ying", "spade", 1), "gain2");
				}
			},
		},
	},
},
// === 长河 ===
xiaobai_changhe: {
	audio: 2,
	trigger: { global: "phaseBefore", player: "enterGame" },
	forced: true,
	filter(event, player) {
		return !_status.xiaobaiChangheDone && (event.name != "phase" || game.phaseNumber == 0);
	},
	async content(event, trigger, player) {
		_status.xiaobaiChangheDone = true;
		const inPlay = [];
		for (const current of game.players.concat(game.dead)) {
			for (const key of [current.name, current.name1, current.name2]) {
				if (key && !inPlay.includes(key)) inPlay.push(key);
			}
		}
		const cards = [];
		for (const name of Object.keys(lib.character)) {
			const info = lib.character[name];
			if (!info || !Array.isArray(info[3]) || inPlay.includes(name)) continue;
			const skills = info[3].filter((skill) => skill.startsWith("xiaobai_") && lib.skill[skill]);
			if (!skills.length) continue;
			const names = xiaobaiChangheNames(skills);
			if (!names.length) continue;
			const card = game.createCard2("xiaobai_dabai", "spade", 9);
			card.storage.xiaobai_changhe = { general: name, names };
			cards.push(card);
		}
		if (!cards.length) return;
		// 记录仍在牌堆里的“小白杯”武将，供〖逝浪〗判断某势力是否已全部消逝
		player.storage.xiaobai_changhe_generals = cards.map((card) => card.storage.xiaobai_changhe.general);
		await game.cardsGotoPile(cards, () => ui.cardPile.childNodes[get.rand(0, ui.cardPile.childNodes.length - 1)]);
		game.log(player, `将${get.cnNumber(cards.length)}张「白」洗入了牌堆`);
		if (!lib.skill.global.has("xiaobai_dabai")) game.addGlobalSkill("xiaobai_dabai");
	},
	onremove(player, skill) {
		delete player.storage.xiaobai_changhe_generals;
	},
},
// === 大白 ===
xiaobai_dabai: {
	audio: 2,
	enable: ["chooseToUse", "chooseToRespond"],
	// hiddenCard 必须在技能顶层：喂 hasWuxie/hasShan/hasSha/canSave 预检
	hiddenCard(player, name) {
		return xiaobaiDabaiNames(player).includes(name);
	},
	ai: {
		order: 5,
		// 「白」牌能印任意牌名，四类响应预检都要放行；打出型检查仅在纯打出场景拦截
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag, arg) {
			if (!xiaobaiDabaiNames(player).length) return false;
			if (tag == "save") return true;
			return tag == "respondSha" || tag == "respondShan";
		},
		result: { player: 1 },
	},
	filter(event, player) {
		const candidates = xiaobaiDabaiCandidates(player);
		if (!candidates.length) return false;
		if (xiaobaiIsSelfSelect(event, "xiaobai_dabai")) return true;
		return xiaobaiViewAsList(event, player, candidates).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			return ui.create.dialog("大白：将一张「白」当对应武将技能中的牌名使用", [xiaobaiViewAsList(event, player, xiaobaiDabaiCandidates(player)), "vcard"]);
		},
		filter(button, player) {
			const name = button.link[2];
			const cards = player.getCards("hs", (card) => card.storage?.xiaobai_changhe?.names?.includes(name));
			if (!cards.length) return false;
			const parent = _status.event.getParent();
			if (typeof parent?.filterCard != "function") return true;
			return cards.some((card) => parent.filterCard({ name, nature: button.link[3], isCard: true, cards: [card] }, player, parent));
		},
		check(button) {
			const player = _status.event.player;
			return player.getUseValue({ name: button.link[2], nature: button.link[3] }) || 1;
		},
		backup(links, player) {
			const name = links[0][2], nature = links[0][3];
			return {
				audio: 2,
				position: "hs",
				selectCard: 1,
				filterCard(card) {
					return card.storage?.xiaobai_changhe?.names?.includes(name);
				},
				viewAs: { name, nature, isCard: true },
				prompt: "大白：选择一张「白」",
			};
		},
	},
},
// === 诚谟 ===
xiaobai_chengmo: {
	audio: 2,
	round: 1,
	trigger: { global: "useCardToPlayer" },
	filter(event, player) {
		if (!event.isFirstTarget || !event.card || !event.targets?.length) return false;
		if (get.name(event.card) != "sha") return false;
		if (event.player == player || _status.currentPhase != event.player) return false;
		return player.countCards("h") > 0 && game.hasPlayer((current) => current != player);
	},
	async cost(event, trigger, player) {
		const result = await player
			.chooseCardTarget({
				prompt: "诚谟：你可以选择任意张手牌和等量名其他角色，按选择顺序依次分配",
				position: "h",
				selectCard: [1, player.countCards("h")],
				selectTarget: [1, game.countPlayer((current) => current != player)],
				filterCard: () => true,
				filterTarget: (card, player2, target) => target != player2,
				ai1: (card) => 5 - get.value(card),
				ai2: (target) => get.attitude(get.player(), target),
			})
			.forResult();
		if (!result?.bool || !result.cards?.length || !result.targets?.length) {
			event.result = { bool: false };
			return;
		}
		event.result = result;
	},
	async content(event, trigger, player) {
		const cards = event.cards || [];
		const targets = event.targets || [];
		const gains = [];
		const num = Math.min(cards.length, targets.length);
		for (let i = 0; i < num; i++) {
			if (!targets[i].isIn() || !cards[i]) continue;
			gains.push(targets[i]);
			await player.give(cards[i], targets[i]);
		}
		if (!gains.length) return;
		const user = trigger.player;
		const choice = await user
			.chooseControl(["被使用【杀】或【过河拆桥】", "取消此【杀】所有目标"])
			.set("prompt", "诚谟：选择一项")
			.set("ai", () => 0)
			.forResult();
		const use = trigger.getParent("useCard");
		if (choice.control == "取消此【杀】所有目标") {
			if (use) {
				use.all_excluded = true;
				game.log(use.card, "被取消了所有目标");
			}
			return;
		}
		if (!use) return;
		user
			.when({ player: "useCardAfter" })
			.filter((evt) => evt == use)
			.step(async (event2, trigger2, player2) => {
				for (const target of gains.slice().sortBySeat()) {
					if (!target.isIn() || !target.countCards("h") || !user.isIn()) continue;
					const res = await target
						.chooseControl(["sha", "guohe", "cancel2"])
						.set("prompt", `诚谟：你可以将一张手牌当【杀】或【过河拆桥】对${get.translation(user)}使用`)
						.set("choiceList", ["将一张手牌当【杀】对其使用", "将一张手牌当【过河拆桥】对其使用", "取消"])
						.set("ai", () => (Math.random() < 0.5 ? 0 : 1))
						.forResult();
					if (res.control == "cancel2") continue;
					const name = res.control;
					const cardResult = await target
						.chooseCard("h", 1, (card) => true)
						.set("prompt", `诚谟：选择一张手牌当【${get.translation(name)}】对${get.translation(user)}使用`)
						.set("ai", (card) => 6 - get.value(card))
						.forResult();
					if (!cardResult.bool || !cardResult.cards?.length) continue;
					await target.useCard({ name, isCard: true }, cardResult.cards, user);
				}
			});
	},
},
// === 沉光 ===
xiaobai_chenguang: {
	audio: 2,
	mark: true,
	intro: { content: "已修改" },
	group: ["xiaobai_chenguang_damage", "xiaobai_chenguang_recover", "xiaobai_chenguang_wash"],
	subSkill: {
		damage: {
			audio: "xiaobai_chenguang",
			trigger: { player: "damageBegin4" },
			filter(event, player) {
				if (!event.num) return false;
				const gained = player.getRoundHistory("gain", (evt) => evt.cards?.length > 0).length > 0;
				return player.hasMark("xiaobai_chenguang") ? gained : !gained;
			},
			async cost(event, trigger, player) {
				if (player.hasMark("xiaobai_chenguang")) {
					const result = await player
						.chooseToDiscard("he", `沉光：你可以弃置一张牌，防止此伤害`, true)
						.set("ai", (card) => 8 - get.value(card))
						.forResult();
					event.result = { bool: result.bool, cards: result.cards };
				} else {
					event.result = await player.chooseBool("沉光：你可以摸一张牌，防止此伤害").set("ai", () => true).forResult();
				}
			},
			async content(event, trigger, player) {
				if (player.hasMark("xiaobai_chenguang")) {
					if (event.cards?.length) await player.discard(event.cards);
				} else {
					await player.draw();
				}
				trigger.cancel();
			},
		},
		recover: {
			audio: "xiaobai_chenguang",
			trigger: { player: "recoverBegin" },
			filter(event, player) {
				if (!event.num) return false;
				const lost = player.getRoundHistory("lose", (evt) => evt.cards?.length > 0).length > 0;
				return player.hasMark("xiaobai_chenguang") ? lost : !lost;
			},
			async cost(event, trigger, player) {
				if (player.hasMark("xiaobai_chenguang")) {
					event.result = await player
						.chooseBool(`沉光：你可以摸一张牌，额外回复${get.cnNumber(trigger.num)}点体力`)
						.set("ai", () => true)
						.forResult();
				} else {
					const result = await player
						.chooseToDiscard("he", `沉光：你可以弃置一张牌，额外回复${get.cnNumber(trigger.num)}点体力`, true)
						.set("ai", (card) => 8 - get.value(card))
						.forResult();
					event.result = { bool: result.bool, cards: result.cards };
				}
			},
			async content(event, trigger, player) {
				if (player.hasMark("xiaobai_chenguang")) {
					await player.draw();
				} else if (event.cards?.length) {
					await player.discard(event.cards);
				}
				trigger.num *= 2;
			},
		},
		wash: {
			audio: "xiaobai_chenguang",
			charlotte: true,
			forced: true,
			trigger: { global: "washCard" },
			filter(event, player) {
				return !player.hasMark("xiaobai_chenguang");
			},
			async content(event, trigger, player) {
				player.addMark("xiaobai_chenguang", 1, false);
				game.log(player, "修改了", "#g【沉光】");
			},
		},
	},
},
// === 沉诛 ===
xiaobai_chenzhu: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		const res1 = await player
			.chooseCard("he", [1, 2], () => true)
			.set("prompt", "沉诛：你可以重铸至多两张牌")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res1.bool || !res1.cards?.length) return;
		const cards1 = res1.cards.slice();
		await player.recast(cards1);
		if (!player.isIn()) return;
		let cards2 = [];
		const others = game.filterPlayer((current) => current != player && current.isIn() && current.countCards("he") > 0);
		if (others.length) {
			const res2 = await player
				.chooseTarget("沉诛：选择一名其他角色，令其也可重铸至多两张牌", (card, player2, target) => others.includes(target), true)
				.set("ai", (target) => -get.attitude(get.player(), target))
				.forResult();
			if (res2.bool) {
				const target = res2.targets[0];
				const res3 = await target
					.chooseCard("he", [1, 2], () => true)
					.set("prompt", "沉诛：你可以重铸至多两张牌")
					.set("ai", (card) => 5 - get.value(card))
					.forResult();
				if (res3.bool && res3.cards?.length) {
					cards2 = res3.cards.slice();
					await target.recast(cards2);
				}
			}
		}
		if (!player.isIn()) return;
		const all = cards1.concat(cards2);
		if (all.length < 2) return;
		const suits = all.map((card) => get.suit(card)).filter((suit) => suit && suit != "none");
		if (new Set(suits).size != suits.length) return;
		player.storage.xiaobai_chenzhu_use = true;
		await player
			.chooseToUse((card) => get.name(card) == "sha", "沉诛：你可以使用一张【杀】")
			.set("addCount", false)
			.forResult();
		delete player.storage.xiaobai_chenzhu_use;
	},
	mod: {
		cardUsable(card, player) {
			if (player.storage.xiaobai_chenzhu_use && get.name(card) == "sha") return Infinity;
		},
	},
},
// === 传经 ===
xiaobai_chuanjing: {
	audio: 2,
	trigger: { player: "damageBegin1", source: "damageBegin1" },
	filter(event, player) {
		return event.num > 0;
	},
	async cost(event, trigger, player) {
		event.result = await player.chooseBool("传经：是否将牌堆底的三张牌置于牌堆顶？").set("ai", () => true).forResult();
	},
	async content(event, trigger, player) {
		// 取牌堆底三张：用 get.cardPile(..., "bottom")，不要直接操作 ui.cardPile.childNodes
		// （直接改 DOM 不广播、不触发卡牌移动事件，联机会不同步）
		const bottoms = [];
		for (let i = 0; i < 3; i++) {
			const card = get.cardPile(true, null, "bottom");
			if (!card) break;
			bottoms.push(card);
		}
		if (bottoms.length) await game.cardsGotoPile(bottoms.slice().reverse(), "insert");
		const targets = [player];
		const current = _status.currentPhase;
		if (current?.isIn() && current != player) targets.push(current);
		const res = await player
			.chooseTarget("传经：你可以令你或当前回合角色用所有手牌交换牌堆顶的三张牌", (card, player2, target) => targets.includes(target))
			.set("ai", (target) => (target == get.player() ? 1 : -1))
			.forResult();
		if (!res.bool) return;
		const target = res.targets[0];
		const pileCards = get.cards(3);
		const handCards = target.getCards("h");
		if (handCards.length) await target.lose(handCards, ui.cardPile, "insert");
		if (pileCards.length) await target.gain(pileCards, "gain2");
	},
},
// === 攒和 ===
xiaobai_cuanhe: {
	audio: 2,
	// 仅「使用」基本牌（闪响应/无懈窗口/濒死求桃都走 chooseToUse）
	enable: "chooseToUse",
	// hiddenCard 必须在技能顶层：喂 hasWuxie/hasShan/canSave 预检
	hiddenCard(player, name) {
		if (get.type(name) != "basic") return false;
		return xiaobaiCuanheUsable(player);
	},
	filter(event, player) {
		if (!xiaobaiCuanheUsable(player)) return false;
		if (xiaobaiIsSelfSelect(event, "xiaobai_cuanhe")) return true;
		return xiaobaiViewAsList(event, player, get.inpileVCardList((info) => info[0] == "basic")).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			return ui.create.dialog("攒和：视为使用一张基本牌", [xiaobaiViewAsList(event, player, get.inpileVCardList((info) => info[0] == "basic")), "vcard"]);
		},
		check(button) {
			if (_status.event.getParent().type != "phase") return 1;
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2], nature: button.link[3], isCard: true }, null, true));
		},
		backup(links, player) {
			return {
				audio: "xiaobai_cuanhe",
				position: "h",
				selectCard: -1,
				filterCard() {
					return false;
				},
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true },
				popname: true,
				async precontent(event, trigger, player2) {
					player2.logSkill("xiaobai_cuanhe");
					const before = player2.countCards("h");
					let count = 0;
					for (const diff of [1, 2, 3]) {
						const targets = game.filterPlayer((current) => current != player2 && current.isIn() && Math.abs(current.countCards("h") - player2.countCards("h")) == diff);
						if (!targets.length) break;
						const res = await player2
							.chooseTarget(`攒和：你可以和一名手牌数相差${get.cnNumber(diff)}的其他角色交换手牌`, (card, player3, target) => targets.includes(target))
							.set("ai", () => 1)
							.forResult();
						if (!res.bool) break;
						await player2.swapHandcards(res.targets[0]);
						count++;
					}
					// 手牌数未减少 → 本技能本轮失效（图标变灰 + 标记）
					if (player2.countCards("h") >= before) {
						player2.disableSkill("xiaobai_cuanhe_disabled", "xiaobai_cuanhe");
						player2.addTempSkill("xiaobai_cuanhe_disabled", "roundStart");
					}
					if (count < 3) event.result.bool = false;
				},
			};
		},
		prompt(links, player) {
			return `攒和：选择${get.translation(links[0][2])}的目标`;
		},
	},
	ai: {
		order: 5,
		// 仅使用：respondSha/respondShan/save 是各类询问的可达开关；打出型检查（arg === "respond"）不放行
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag, arg) {
			if (!xiaobaiCuanheUsable(player)) return false;
			if (arg === "respond") return false;
			if (tag == "save") return true;
			return tag == "respondSha" || tag == "respondShan";
		},
		result: { player: 1 },
	},
	subSkill: {
		// 失效状态：技能变灰 + 标记，本轮结束时（roundStart）自动解除
		disabled: {
			charlotte: true,
			mark: true,
			marktext: "和",
			intro: { content: "〖攒和〗本轮已失效（图标变灰），直至本轮结束。" },
			init(player, skill) {
				player.markSkill(skill);
			},
			onremove(player, skill) {
				player.unmarkSkill(skill);
				// enableSkill 的参数是「禁用者键」（即 disableSkill 的第一个参数），不是被禁用的技能名
				player.enableSkill("xiaobai_cuanhe_disabled");
			},
		},
	},
},
// === 党构 ===
xiaobai_danggou: {
	audio: 2,
	forced: true,
	trigger: { global: "useCardToPlayer" },
	filter(event, player) {
		if (!event.card) return false;
		return get.name(event.card) == "sha" && (event.player == player || event.target == player);
	},
	async content(event, trigger, player) {
		const to = trigger.target;
		const list = [player];
		const prev = to.getPrevious(), next = to.getNext();
		if (prev && prev != player && !list.includes(prev)) list.push(prev);
		if (next && next != player && !list.includes(next)) list.push(next);
		const valid = list.filter((current) => current.isIn() && current.countCards("he") >= 2);
		if (!valid.length) return;
		const chooseEvent = player.chooseCardOL(
			valid,
			"he",
			false,
			2,
			"党构：是否弃置两张牌令此【杀】额外结算一次？",
			(card) => true,
			(card) => 6 - get.value(card)
		);
		chooseEvent._args.remove("glow_result");
		const result = await chooseEvent.forResult();
		const chosen = valid.map((current, index) => Boolean(result?.[index]?.bool && result[index].cards?.length == 2));
		const throwSelf = chosen[0];
		const use = trigger.getParent("useCard");
		for (let i = 0; i < valid.length; i++) {
			if (!chosen[i]) continue;
			if (use) use.effectCount = (typeof use.effectCount == "number" ? use.effectCount : 1) + 1;
			await valid[i].discard(result[i].cards);
		}
		const differs = valid.filter((current, index) => chosen[index] !== throwSelf);
		if (differs.length != 1 || !use) return;
		const onlyDifferent = differs[0];
		trigger.player
			.when({ player: "useCardAfter" })
			.filter((evt) => evt == use)
			.step(async (event2, trigger2, player2) => {
				const hasDying = game.getGlobalHistory("everything", (evt) => evt.name == "dying" && evt.getParent("useCard") == use).length > 0;
				if (!hasDying && onlyDifferent.isIn()) await onlyDifferent.turnOver();
			});
	},
},
// === 党连 ===
xiaobai_danglian: {
	audio: 2,
	group: ["xiaobai_danglian_draw", "xiaobai_danglian_prevent"],
	subSkill: {
		draw: {
			audio: "xiaobai_danglian",
			usable: 1,
			trigger: { player: "loseAfter" },
			filter(event, player) {
				// 不因「使用/打出」失去牌（原生：move.moveReason ~= ReasonUse / ReasonResponse）
				const evt = event.relatedEvent || event.getParent();
				if (["useCard", "respond"].includes(evt?.name)) return false;
				// 失去的须是手牌或装备区的牌（原生 fromArea == PlayerHand or PlayerEquip）
				const evtx = event.getl(player);
				return Boolean(evtx?.hs?.length || evtx?.es?.length);
			},
			async cost(event, trigger, player) {
				event.result = await player.chooseBool("党连：你可以横置并摸两张牌").set("ai", () => true).forResult();
			},
			async content(event, trigger, player) {
				await player.link(true);
				if (player.isIn()) await player.draw(2);
			},
		},
		prevent: {
			audio: "xiaobai_danglian",
			usable: 1,
			trigger: { player: "damageBegin4" },
			filter(event, player) {
				// 原生只判「非属性伤害」（damageType == NormalDamage），不要求已横置
				return !event.nature && event.num > 0;
			},
			async cost(event, trigger, player) {
				event.result = await player.chooseBool("党连：你可以重置并防止此伤害").set("ai", () => true).forResult();
			},
			async content(event, trigger, player) {
				await player.link(false);
				trigger.cancel();
			},
		},
	},
},
// === 策图 ===
xiaobai_cetu: {
	audio: 2,
	trigger: { player: "phaseBefore" },
	filter(event, player) {
		if (event.player != player) return false;
		return game.hasPlayer((current) => current != player && current.isIn());
	},
	async cost(event, trigger, player) {
		event.result = await player
			.chooseTarget("策图：是否跳过额定回合，改为询问一名其他角色是否使用一张牌？", lib.filter.notMe, true)
			.set("ai", (target) => get.attitude(get.player(), target))
			.forResult();
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		// 跳过额定回合
		trigger.phaseList = [];
		game.log(player, "跳过了额定回合");
		if (!target?.isIn()) return;
		if (!(await lib.xiaobaiCetuPlay(target, "策图：你可以使用一张牌"))) return;
		if (!player.isIn() || !game.hasPlayer((current) => current != player && current.isIn())) return;
		const again = await player.chooseBool("策图：是否摸两张牌并继续询问？").set("ai", () => true).forResult();
		if (!again.bool) return;
		await player.draw(2);
		if (!player.isIn() || !game.hasPlayer((current) => current != player && current.isIn())) return;
		const res2 = await player
			.chooseTarget("策图：询问一名其他角色是否使用一张牌", lib.filter.notMe)
			.set("ai", (target2) => get.attitude(get.player(), target2))
			.forResult();
		if (!res2.bool) return;
		if (!(await lib.xiaobaiCetuPlay(res2.targets[0], "策图：你可以使用一张牌"))) return;
		if (!player.isIn()) return;
		if (!(await lib.xiaobaiCetuPlay(player, "策图：你可以使用一张牌"))) return;
		if (!player.isIn() || !game.hasPlayer((current) => current != player && current.isIn())) return;
		const res3 = await player
			.chooseTarget("策图：询问一名其他角色是否使用一张牌", lib.filter.notMe, true)
			.set("ai", (target2) => get.attitude(get.player(), target2))
			.forResult();
		if (!res3.bool) return;
		await lib.xiaobaiCetuPlay(res3.targets[0], "策图：你可以使用一张牌");
	},
	subSkill: {
		free: {
			charlotte: true,
			popup: false,
			mod: {
				cardUsable(card, player) {
					return Infinity;
				},
			},
		},
	},
},
// === 博议 ===
xiaobai_boyi: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return ["peach", "recast", "put", "draw"].some((item) => xiaobaiBoyiCan(player, item));
	},
	async content(event, trigger, player) {
		const all = ["peach", "recast", "put", "draw"];
		const labels = {
			peach: "将一张牌当作【桃】使用",
			recast: "重铸两张牌并进行一次【闪电】判定",
			put: "将三张手牌置于牌堆顶",
			draw: "摸四张牌并获得一个单独的“鉴戒”",
		};
		const choices = all.filter((item) => xiaobaiBoyiCan(player, item));
		if (!choices.length) return;
		const control = await player
			.chooseControl(choices)
			.set("prompt", "博议：执行一项")
			.set("choiceList", choices.map((item) => labels[item]))
			.set("ai", () => choices.indexOf("draw"))
			.forResult();
		const choice = control.control;
		if (!choice) return;
		await lib.xiaobaiBoyiDo(player, choice, true);
		if (!player.isIn()) return;
		const targets = game.filterPlayer((current) => current.isIn() && current.countCards("h") == player.countCards("h"));
		if (!targets.length) return;
		const res = await player
			.chooseTarget(
				"博议：你可以删去此项，令手牌数与你相同的任意名角色依次依序执行所有剩余项",
				(card, player2, target) => targets.includes(target)
			)
			.set("selectTarget", [1, targets.length])
			.set("ai", (target) => -get.attitude(get.player(), target))
			.forResult();
		if (!res.bool || !res.targets?.length) return;
		const others = all.filter((item) => item != choice);
		for (const target of res.targets.slice().sortBySeat()) {
			for (const item of others) {
				if (!target.isIn()) break;
				await lib.xiaobaiBoyiDo(target, item, false);
			}
		}
	},
},
// === 鉴戒（博议衍生） ===
xiaobai_jianjie: {
	audio: 2,
	forced: true,
	mark: true,
	intro: { content: "已拥有#个“鉴戒”" },
	trigger: { player: "useCard" },
	filter(event, player) {
		if (!event.getParent("phaseUse")?.name) return false;
		if (player.countMark("xiaobai_jianjie") <= 0) return false;
		const suit = get.suit(event.card);
		if (!suit || suit == "none") return false;
		const last = player.storage.xiaobai_jianjie_last || 0;
		return Boolean(last && last != suit);
	},
	async content(event, trigger, player) {
		const suit = get.suit(trigger.card);
		const suits = (player.storage.xiaobai_jianjie_suits || []).slice();
		if (suit && suit != "none") {
			if (!suits.includes(suit)) suits.push(suit);
			player.storage.xiaobai_jianjie_suits = suits;
			player.storage.xiaobai_jianjie_last = suit;
		}
		// 一份「鉴戒」结算一次，按份数依次弃置
		const count = player.countMark("xiaobai_jianjie");
		for (let i = 0; i < count; i++) {
			if (!player.isIn()) break;
			const num = Math.min(suits.length, player.countCards("he", (card) => lib.filter.cardDiscardable(card, player, "xiaobai_jianjie")));
			if (num <= 0) break;
			await player
				.chooseToDiscard(num, "he", true)
				.set("prompt", `鉴戒：弃置${get.cnNumber(num)}张牌`)
				.set("skill", "xiaobai_jianjie")
				.forResult();
		}
	},
	group: ["xiaobai_jianjie_reset"],
	onremove(player, skill) {
		delete player.storage[`${skill}_suits`];
		delete player.storage[`${skill}_last`];
	},
	subSkill: {
		reset: {
			charlotte: true,
			silent: true,
			popup: false,
			forced: true,
			trigger: { player: "useCard" },
			filter(event, player) {
				if (!event.getParent("phaseUse")?.name) return false;
				if (player.countMark("xiaobai_jianjie") <= 0) return false;
				const suit = get.suit(event.card);
				return !suit || suit == "none";
			},
			content(event, trigger, player) {
				player.storage.xiaobai_jianjie_last = 0;
			},
		},
	},
},
// === 究典 ===
xiaobai_jiudian: {
	audio: 2,
	// 仅「使用」（FreeKill enabled_at_response 带 not response）
	enable: "chooseToUse",
	// hiddenCard 必须在技能顶层：喂 hasWuxie/hasShan/hasSha/canSave 预检
	hiddenCard(player, name) {
		return xiaobaiJiudianCandidates(player).some((info) => info[2] == name);
	},
	ai: {
		order: 5,
		// 究典能印基本牌/普通锦囊，四类响应预检都要放行；打出型检查拦截
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag, arg) {
			if (!xiaobaiJiudianCandidates(player).length) return false;
			if (arg === "respond") return false;
			if (tag == "save") return true;
			return tag == "respondSha" || tag == "respondShan";
		},
		result: { player: 1 },
	},
	init(player, skill) {
		for (const current of game.filterPlayer((p) => p != player)) current.addSkill("xiaobai_jiudian_gift");
	},
	onremove(player, skill) {
		if (game.hasPlayer((current) => current != player && current.hasSkill("xiaobai_jiudian"))) return;
		for (const current of game.filterPlayer((p) => p != player)) current.removeSkill("xiaobai_jiudian_gift");
	},
	filter(event, player) {
		const candidates = xiaobaiJiudianCandidates(player);
		if (!candidates.length) return false;
		if (xiaobaiIsSelfSelect(event, "xiaobai_jiudian")) return true;
		return xiaobaiViewAsList(event, player, candidates).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			return ui.create.dialog("究典：视为使用一张本轮没有角色使用过的基本牌或普通锦囊牌", [xiaobaiViewAsList(event, player, xiaobaiJiudianCandidates(player)), "vcard"]);
		},
		filter(button, player) {
			const parent = _status.event.getParent();
			if (typeof parent?.filterCard != "function") return true;
			return parent.filterCard({ name: button.link[2], nature: button.link[3], isCard: true }, player, parent);
		},
		check(button) {
			const player = _status.event.player;
			return player.getUseValue({ name: button.link[2], nature: button.link[3] }) || 1;
		},
		backup(links, player) {
			return {
				audio: "xiaobai_jiudian",
				position: "h",
				selectCard: -1,
				filterCard() {
					return false;
				},
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true },
				async precontent(event, trigger, player2) {
					const cards = player2.getCards("h", (card) => card.name == "xiaobai_dabai");
					if (cards.length) await player2.recast(cards);
				},
			};
		},
		prompt(links, player) {
			return `究典：选择${get.translation(links[0][2])}的目标`;
		},
	},
},
// === 究典·赠予（持有〖究典〗时其他角色获得） ===
xiaobai_jiudian_gift: {
	audio: "xiaobai_jiudian",
	enable: "phaseUse",
	usable: 1,
	prompt: "每回合限一次，你可以赠予一名拥有〖究典〗的角色一张“小白杯”武将，然后摸一张牌。",
	filter(event, player) {
		return (
			player.countCards("h", (card) => card.name == "xiaobai_dabai") > 0 &&
			game.hasPlayer((current) => current != player && current.isIn() && current.hasSkill("xiaobai_jiudian"))
		);
	},
	filterCard(card) {
		return card.name == "xiaobai_dabai";
	},
	selectCard: 1,
	filterTarget(card, player, target) {
		return target != player && target.hasSkill("xiaobai_jiudian");
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		await player.give(event.cards[0], event.targets[0]);
		await player.draw();
	},
},
// === 逝浪 ===
xiaobai_shilang: {
	audio: 2,
	locked: true,
	forced: true,
	mark: true,
	intro: { content: "永久【酒】效果层数" },
	trigger: { global: ["loseAfter", "cardsDiscardAfter"] },
	filter(event, player) {
		return lib.xiaobaiShilangVanished(lib.xiaobaiShilangDestroyed(event.cards), player).length > 0;
	},
	async content(event, trigger, player) {
		const cards = lib.xiaobaiShilangDestroyed(trigger.cards);
		const groups = lib.xiaobaiShilangVanished(cards, player);
		lib.xiaobaiShilangUpdate(cards, player);
		for (let i = 0; i < groups.length; i++) {
			if (!player.isIn()) break;
			game.log(player, "的「白」牌中，", "#y" + get.translation(groups[i]), "势力已全部消逝");
			await player.loseMaxHp();
			if (!player.isIn()) break;
			await player.draw(2);
			player.addMark("xiaobai_shilang", 1, false);
		}
		if (player.isIn()) lib.xiaobaiShilangRefresh(player);
	},
	group: ["xiaobai_shilang_refresh"],
	subSkill: {
		refresh: {
			charlotte: true,
			silent: true,
			popup: false,
			forced: true,
			trigger: { player: ["useCard", "phaseBegin"] },
			filter(event, player) {
				return player.countMark("xiaobai_shilang") > 0 && !player.storage.jiu;
			},
			content(event, trigger, player) {
				lib.xiaobaiShilangRefresh(player);
			},
		},
	},
},
// === 猊伺 ===
xiaobai_nisi: {
	audio: 2,
	groupSkill: "wei",
	trigger: { player: "damage", source: "damage" },
	filter(event, player) {
		if (player.group != "wei") return false;
		if (!event.source || event.source == event.player || !event.num) return false;
		return event.source.isIn() && event.player.isIn();
	},
	async cost(event, trigger, player) {
		event.result = await player.chooseBool("猊伺：是否发动？").set("ai", () => true).forResult();
	},
	async content(event, trigger, player) {
		const other = trigger.source == player ? trigger.player : trigger.source;
		if (!other?.isIn()) return;
		// 「同时选择」用原生 chooseButtonOL：list = [目标, [prompt, [buttons, "vcard"]], forced]，
		// 结果按 target.playerid 索引（联机同时弹框；本地为顺序弹框，但双方互不可见）
		const list = [player, other].map((current) => {
			const buttons = [["摸一张牌", "", "draw"]];
			if (current.group != "shu") buttons.push(["变更势力至蜀", "", "change"]);
			return [current, ["猊伺：选择一项", [buttons, "vcard"]], true];
		});
		const result = await player.chooseButtonOL(list).forResult();
		const pickOf = (current) => {
			const res = result?.[current.playerid];
			if (res?.bool && res.links?.length) return res.links[0][2];
			return "draw";
		};
		const mine = pickOf(player);
		const theirs = pickOf(other);
		if (!other.isIn()) return;
		if (mine == "change") await player.changeGroup("shu");
		else await player.draw();
		if (!other.isIn()) return;
		if (theirs == "change") await other.changeGroup("shu");
		else await other.draw();
		if (mine != theirs && other.isIn() && player.isIn() && other.countCards("he")) {
			const res = await player.choosePlayerCard("猊伺：获得其一张牌", other, "he", true).forResult();
			if (res.bool && res.cards?.length) await player.gain(res.cards, other, "giveAuto");
		}
	},
},
// === 梗谏 ===
xiaobai_gengjian: {
	audio: 2,
	// 仅「使用」（无懈窗口/闪响应等走 chooseToUse）；纯打出才走 chooseToRespond，本技能不可打出
	enable: "chooseToUse",
	// hiddenCard 必须在技能顶层：引擎 hasUsableCard/hasWuxie 预检只读 info.hiddenCard（player.js:2988）
	hiddenCard(player, name) {
		if (name != "sha" && name != "wuxie") return false;
		return !player.hasSkill("xiaobai_gengjian_disabled") && player.countCards("h") > 0;
	},
	filter(event, player) {
		if (player.hasSkill("xiaobai_gengjian_disabled")) return false;
		if (!player.countCards("h")) return false;
		if (xiaobaiIsSelfSelect(event, "xiaobai_gengjian")) return true;
		return xiaobaiViewAsList(event, player, XIAOBAI_GENGJIAN_CANDIDATES).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			return ui.create.dialog("梗谏：将所有手牌当【杀】或【无懈可击】使用", [xiaobaiViewAsList(event, player, XIAOBAI_GENGJIAN_CANDIDATES), "vcard"]);
		},
		check(button) {
			if (_status.event.getParent().type != "phase") return 1;
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2], isCard: true }, null, true));
		},
		backup(links, player) {
			return {
				audio: "xiaobai_gengjian",
				position: "h",
				selectCard: -1,
				filterCard: () => true,
				viewAs: { name: links[0][2], isCard: true },
				popname: true,
				async precontent(event, trigger, player2) {
					player2.logSkill("xiaobai_gengjian");
					// 本技能失效（图标变灰 + 标记）至你下一次受到伤害后
					player2.disableSkill("xiaobai_gengjian_disabled", "xiaobai_gengjian");
					player2.addSkill("xiaobai_gengjian_disabled");
				},
			};
		},
		prompt(links, player) {
			return `梗谏：将所有手牌当【${get.translation(links[0][2])}】使用`;
		},
	},
	ai: {
		order: 5,
		// 仅使用：respondSha 是「使用杀」询问的可达开关；打出型检查（arg === "respond"）不放行
		respondSha: true,
		skillTagFilter(player, tag, arg) {
			if (player.hasSkill("xiaobai_gengjian_disabled") || !player.countCards("h")) return false;
			if (arg === "respond") return false;
			return tag == "respondSha";
		},
		result: { player: 1 },
	},
	subSkill: {
		// 失效状态：技能变灰 + 标记；下一次受到伤害后解除并摸至四张
		disabled: {
			charlotte: true,
			mark: true,
			marktext: "梗",
			intro: { content: "〖梗谏〗已失效（图标变灰），直至你下一次受到伤害后；此期间内你受到伤害后，将手牌摸至四张。" },
			trigger: { player: "damage" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.hasSkill("xiaobai_gengjian_disabled");
			},
			async content(event, trigger, player) {
				player.enableSkill("xiaobai_gengjian_disabled");
				player.removeSkill("xiaobai_gengjian_disabled");
				if (player.isIn() && player.countCards("h") < 4) await player.drawTo(4);
			},
			init(player, skill) {
				player.markSkill(skill);
			},
			onremove(player, skill) {
				player.unmarkSkill(skill);
			},
		},
	},
	onremove(player, skill) {
		player.removeSkill("xiaobai_gengjian_disabled");
		player.enableSkill("xiaobai_gengjian_disabled");
	},
},
// === 攥功 ===
xiaobai_zuangong: {
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		if (player.storage.xiaobai_zuangong) return false;
		return game.hasPlayer((current) => current != player && current.isIn());
	},
	async cost(event, trigger, player) {
		event.result = await player
			.chooseTarget("攥功：选择一名其他角色，与其进行“协力”", lib.filter.notMe, true)
			.set("ai", (target) => get.attitude(get.player(), target))
			.forResult();
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		await player.draw();
		if (!player.isIn() || !target.isIn()) return;
		// 原生 API：弹出「选择和X的协力方式」（按钮用 cooperation_* 的官方译名），选完自动 cooperationWith
		await player
			.chooseCooperationFor(target, "xiaobai_zuangong")
			.set("ai", (button) => {
				const base = { cooperation_damage: 0.1, cooperation_draw: 0.6, cooperation_discard: 0.1, cooperation_use: 0.6 }[button.link] || 0.1;
				return base + Math.random();
			})
			.forResult();
		const info = lib.xiaobaiZuangongInfo(player);
		if (!info) return;
		// 引擎的 cooperation_<type> 只维护「双方合计」，出力多少要自己按事件累计
		player.storage.xiaobai_zuangong = { target: info.target, type: info.type, contrib: {} };
		// 原生同款挂载：addAdditionalSkill("cooperation", [...])（同源二次调用会清掉前一次，必须一次传数组）
		player.addAdditionalSkill("cooperation", ["xiaobai_zuangong_track", "xiaobai_zuangong_keep", "xiaobai_zuangong_settle", "xiaobai_zuangong_clear"]);
		game.log(player, "向", target, "发起了“协力”");
	},
	onremove(player, skill) {
		player.removeSkill("xiaobai_zuangong_track");
		player.removeSkill("xiaobai_zuangong_keep");
		player.removeSkill("xiaobai_zuangong_settle");
		player.removeSkill("xiaobai_zuangong_clear");
		delete player.storage.xiaobai_zuangong;
	},
	subSkill: {
		track: {
			charlotte: true,
			silent: true,
			popup: false,
			forced: true,
			trigger: { global: ["damage", "gainAfter", "loseAfter", "useCard1"] },
			filter(event, player) {
				const mine = player.storage.xiaobai_zuangong;
				if (!mine?.target?.isIn()) return false;
				// 用自己存的 type，不读引擎记录 —— 引擎的 cooperation 会在「协力者回合结束」时就被清掉，
				// 而攥功要求持续到「你下回合开始」，此时引擎记录已不存在。
				const ids = [player.playerid, mine.target.playerid];
				if (event.name == "damage") {
					return mine.type == "damage" && Boolean(event.source) && ids.includes(event.source.playerid);
				}
				if (event.name == "gain") {
					return mine.type == "draw" && event.getParent()?.name == "draw" && ids.includes(event.player.playerid);
				}
				if (event.name == "lose") {
					return mine.type == "discard" && event.type == "discard" && ids.includes(event.player.playerid);
				}
				if (event.name == "useCard") {
					return mine.type == "use" && ids.includes(event.player.playerid);
				}
				return false;
			},
			async content(event, trigger, player) {
				const info = player.storage.xiaobai_zuangong;
				if (!info) return;
				if (trigger.name == "damage") {
					lib.xiaobaiZuangongAdd(player, trigger.source.playerid, "num", trigger.num);
				} else if (trigger.name == "gain") {
					lib.xiaobaiZuangongAdd(player, trigger.player.playerid, "num", (trigger.cards || []).length);
				} else if (trigger.name == "lose") {
					for (const card of trigger.cards || []) {
						const suit = get.suit(card);
						if (suit && suit != "none") lib.xiaobaiZuangongAdd(player, trigger.player.playerid, "suits", suit);
					}
				} else if (trigger.name == "useCard") {
					const suit = get.suit(trigger.card);
					if (suit && suit != "none") lib.xiaobaiZuangongAdd(player, trigger.player.playerid, "suits", suit);
				}
				if (lib.xiaobaiZuangongDone(player, info) || player.checkCooperationStatus(info.target, "xiaobai_zuangong")) {
					await lib.xiaobaiZuangongResolve(player);
				}
			},
		},
		// 引擎的 cooperation 子技能在「协力者回合结束」（phaseAfter）时就会把协力记录清掉，
		// 但攥功的描述是「直到你下回合开始」→ 协力者回合结束时把记录补回来。
		keep: {
			charlotte: true,
			silent: true,
			popup: false,
			forced: true,
			trigger: { global: "phaseAfter" },
			filter(event, player) {
				const mine = player.storage.xiaobai_zuangong;
				if (!mine?.type || !mine.target?.isIn()) return false;
				if (event.player != mine.target) return false;
				return !lib.xiaobaiZuangongInfo(player);
			},
			content(event, trigger, player) {
				const mine = player.storage.xiaobai_zuangong;
				player.cooperationWith(mine.target, mine.type, "xiaobai_zuangong");
				game.log(player, "与", mine.target, "的“协力”继续维持");
			},
		},
		// 保险：结束阶段再判一次（原生三个协力技能都在 phaseJieshuBegin 检查，防止漏事件导致永不结算）
		settle: {
			charlotte: true,
			silent: true,
			popup: false,
			forced: true,
			trigger: { global: "phaseJieshuBegin" },
			filter(event, player) {
				const info = player.storage.xiaobai_zuangong;
				if (!info) return false;
				if (event.player != player && event.player != info.target) return false;
				return lib.xiaobaiZuangongDone(player, info);
			},
			async content(event, trigger, player) {
				await lib.xiaobaiZuangongResolve(player);
			},
		},
		clear: {
			charlotte: true,
			silent: true,
			popup: false,
			forced: true,
			trigger: { player: "phaseBegin", global: "dieAfter" },
			filter(event, player) {
				const info = player.storage.xiaobai_zuangong;
				if (!info) return false;
				if (event.name == "die") return event.player == info.target;
				return event.player == player;
			},
			content(event, trigger, player) {
				lib.xiaobaiZuangongClear(player);
			},
		},
	},
},
};
