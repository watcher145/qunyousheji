import { lib, game, get, ui, _status } from "noname";
import { getTurnDiscardCards, qunyou_adjustHandTo } from "./helpers.js";


// 预诫：可移出的角色（其他角色；排除「上轮」以此法移出过的）
function xiaobaiYujieTargets(player) {
	const last = player.storage.xiaobai_yujie_last;
	return game.filterPlayer((current) => {
		if (current == player) return false;
		if (last && last.round == game.roundNumber - 1 && last.target == current.playerid) return false;
		return true;
	});
}

// 预诫：本回合被使用/打出的牌的花色集合（不含无色）
function xiaobaiYujieSuits() {
	const suits = [];
	for (const current of game.players.concat(game.dead)) {
		for (const key of ["useCard", "respond"]) {
			for (const evt of current.getHistory(key) || []) {
				const suit = get.suit(evt.card);
				if (!lib.suit.includes(suit) || suits.includes(suit)) continue;
				suits.push(suit);
			}
		}
	}
	return suits;
}

// ===== 失去牌方式判定（12 种口径，斛珍/博涉共享）=====
// 源码依据（2026-09 全面验证）：
// 1. 所有失去路径的 lose 事件都会执行 content.js:10907 `player.getHistory("lose").push(event)`，
//    且尾部无条件挂载 hs/es/js/ss 分类（content.js:10936）——getlx=false 只让 getl() 返回空 map，
//    不影响直读事件字段。因此统计一律遍历 getHistory("lose") + 直读字段，绝不走 getl()。
// 2. getHistory("loseAsync") 是死路：actionHistory 初始键只有 useCard/respond/skipped/lose/gain/
//    sourceDamage/damage/custom/useSkill（player.js:117-129），没有 loseAsync 键，永远取不到。
// 3. 各路径 lose 事件的 type/position/宿主（均在 content.js 实测）：
//    使用：useCard content 直接 lose(type="use")；打出：respond content 直接 lose(type="use"——与使用同 type！须靠宿主链细分)
//    装备：equip 前置 lose(type="equip",getlx=false,ui.special)；延时锦囊：addJudge 前置 lose(type="addJudge",getlx=false)
//    弃置：discard→lose(type="discard")；重铸：recast→loseToDiscardpile→lose(type="loseToDiscardpile")
//    交给/被获得：gain 前置 lose(type="gain",getlx=false,ui.special；宿主 gain.giver==失去者 为"交给")
//    拼点：chooseToCompare→loseAsync(chooseToCompareLose)→lose(getlx=false,ui.ordering，relatedEvent=拼点事件)
//    交换：swapHandcards→loseAsync(swapHandcardsx)→lose(getlx=false,ui.ordering，relatedEvent=swapHandcards)
//    武将牌上：addToExpansion 前置 lose(type="loseToExpansion",getlx=false)
//    木牛等特殊区域：loseToSpecial→loseAsync(tag)→lose(getlx=false,ui.special，宿主 loseAsync 带 tag)
//    置入牌堆/移出游戏：技能直接 player.lose(cards, ui.cardPile/ui.special)，无 type，宿主是技能事件
function xiaobaiLoseWay(evt) {
	switch (evt.type) {
		case "use":
			break; // useCard 与 respond 共用 type="use"，落宿主链细分
		case "discard":
			return "discard";
		case "gain":
			break; // 交给/被获得共用 type="gain"，落宿主链按 gain.giver 细分
		case "equip": // 使用装备（含换装时旧装备被换下）——三种"使用"合一
		case "addJudge": // 使用延时锦囊
			return "use";
		case "loseToDiscardpile":
			// 重铸默认实现走 loseToDiscardpile；但该 API 也被普通"置入弃牌堆"效果直接调用，按宿主区分
			// ⚠️ getParent(name) 找不到时返回根事件（恒真值）→ 必须核对 .name
			return evt.getParent("recast")?.name == "recast" ? "recast" : "discard";
		case "loseToExpansion":
			return "expansion";
		default:
			// 裸 lose（无 type）：直接进弃牌堆的按弃置归类
			if (evt.position == ui.discardPile) return "discard";
			break;
	}
	// 宿主链：relatedEvent 优先（拼点/交换的子 lose 靠它一层命中），沿 parent 穿透 loseAsync
	let cur = evt;
	for (let i = 0; i < 8 && cur; i++) {
		switch (cur.name) {
			case "useCard":
				return "use";
			case "respond":
				return "respond";
			case "gain":
				return cur.giver == evt.player ? "give" : "obtained";
			case "chooseToCompare":
			case "chooseToCompareMeanwhile":
				return "compare";
			case "swapHandcards":
			case "swapHandcardsx":
			case "swapEquip":
				return "swap";
			case "recast":
				return "recast";
			case "equip":
			case "addJudge":
				return "use";
			case "addToExpansion":
				return "expansion";
			case "loseAsync":
				if (cur.tag) return "loseToSpecial"; // 木牛流马等 loseAsync(tag) 扣置包装
				break;
		}
		cur = cur.relatedEvent || cur.parent;
	}
	// 去向兜底（宿主是技能事件等无法归类的直接 lose）
	if (evt.position == ui.cardPile) return "pile"; // 置入牌堆顶/底
	if (evt.position == ui.special) return "removed"; // 移出游戏（暂存处理区无宿主归属）
	return "other";
}

// 博涉：统计一名角色本回合失去过牌的方式集合（"失去牌"=手牌/装备区/暗置手牌的牌离开；判定区 js、武将牌上 xs 不计）
function xiaobaiBosheWays(target) {
	const ways = new Set();
	(target.getHistory("lose") || []).forEach((evt) => {
		// 直读分类字段（getlx=false 的附属失去 getl() 返回空 map，不能走 getl）
		if (!(evt.hs?.length || evt.es?.length || evt.ss?.length)) return;
		ways.add(xiaobaiLoseWay(evt));
	});
	return ways;
}

// 博涉/斛珍：失去方式的中文显示（12 种口径 + 兜底，未知值回退原文）
function xiaobaiBosheWayTranslate(way) {
	const map = {
		use: "使用牌",
		respond: "打出牌",
		discard: "弃置",
		give: "交给他人",
		obtained: "被他人获得",
		compare: "拼点",
		recast: "重铸",
		swap: "交换",
		pile: "置入牌堆",
		expansion: "置于武将牌上",
		removed: "移出游戏",
		loseToSpecial: "扣置于场上",
		other: "其他方式",
	};
	return map[way] || (lib.translate[way] ?? way);
}

// 博文：本阶段已使用的牌数（至多5）
function xiaobaiBowenX(player) {
	// X = 你本阶段已使用的牌数（至多 5）。用 getHistory("useCard") 而不用 getStat("card")，
	// 后者会把「打出/响应」也计入。
	const used = player.getHistory("useCard") || [];
	return Math.min(5, used.length);
}

// 长河：「白」牌对应的武将名（去掉「小白」这类包名前缀，牌面左下角位置有限）
function xiaobaiChangheGeneralName(general) {
	const full = get.translation(general);
	const prefix = lib.translate[`${general}_prefix`];
	if (typeof prefix == "string") {
		const first = prefix.split("|")[0];
		if (first && full.startsWith(first)) return full.slice(first.length);
	}
	return full;
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

// 挑衅流程（嚣獚版：无攻击范围限制；使用杀则记「严教」额外数，否则弃置 1+「挑衅」额外数 张）
async function xiaobaiZhanweiFlow(player, target, cards, cardOwner) {
	const owner = cardOwner || player;
	if (cards.length) {
		await owner.discard(cards);
	}
	if (!player.isIn() || !target.isIn()) return;
	await target.damage(player, 1, "nocard");
	// 若目标为体力值最大的角色：可对目标使用任意张以此法弃置的牌
	if (!target.isIn()) return;
	const isMax = game.filterPlayer().every((current) => current.hp <= target.hp);
	if (!isMax) return;
	const pool = cards.filter((card) => get.position(card, true) == "d");
	for (const card of pool.slice(0)) {
		if (!player.isIn() || !target.isIn()) break;
		if (!player.hasUseTarget(card, true, false)) continue;
		const res = await player
			.chooseCardButton("斩威：你可以对" + get.translation(target) + "使用以此法弃置的牌", pool.filter((c) => get.position(c, true) == "d" && player.hasUseTarget(c, true, false)))
			.set("ai", (button) => get.player().getUseValue(button.link))
			.forResult();
		const pick = res?.links?.[0];
		if (!pick) break;
		pool.remove(pick);
		// 无视距离次数、仅指定该目标（实体牌直调 useCard）
		await player.useCard(pick, [target], "xiaobai_zhanwei").set("addCount", false);
	}
}


async function xiaobaiZhuanyuFlow(player, fromBottom) {
	const cards = fromBottom ? get.bottomCards(8, true) : get.cards(8, true);
	await player.showCards(cards, "撰域：展示牌堆" + (fromBottom ? "底" : "顶") + "八张牌");
	const arranged = cards.slice(0);
	let remain = 4;
	// 交换其中两张（至多四次，可提前取消）
	while (remain > 0 && arranged.length > 1 && player.isIn()) {
		const pick1 = await player
			.chooseCardButton("撰域：选择第一张要交换的牌（剩余" + remain + "次，选择取消即结束）", arranged, 1)
			.set("ai", (button) => 1)
			.forResult();
		if (!pick1?.links?.length) break;
		const pick2 = await player
			.chooseCardButton("撰域：选择第二张要交换的牌", arranged.filter((c) => c != pick1.links[0]), 1)
			.set("ai", (button) => 1)
			.forResult();
		if (!pick2?.links?.length) break;
		const i = arranged.indexOf(pick1.links[0]);
		const j = arranged.indexOf(pick2.links[0]);
		if (i < 0 || j < 0) break;
		[arranged[i], arranged[j]] = [arranged[j], arranged[i]];
		remain--;
	}
	// 相同花色均相邻判定
	const suitsAdjacent = () => {
		const seen = {};
		for (let i = 0; i < arranged.length; i++) {
			const suit = get.suit(arranged[i]);
			if (!suit) continue;
			if (seen[suit] != undefined && seen[suit] != i - 1) {
				// 该花色之前出现过且不在上一张位置：检查是否连续段（从头找该花色段）
				let contiguous = false;
				for (let j = 0; j < i; j++) {
					if (get.suit(arranged[j]) == suit) {
						contiguous = i - j == 1 || contiguous;
					}
				}
				if (!contiguous) return false;
			}
			seen[suit] = i;
		}
		return true;
	};
	const adjacent = remain > 0 && suitsAdjacent();
	if (adjacent) {
		// 获得其中至多剩余次数张花色不同的牌
		const picked = [];
		while (picked.length < remain && player.isIn()) {
			const avail = arranged.filter((c) => !picked.includes(c) && !picked.some((p) => get.suit(p) == get.suit(c)));
			if (!avail.length) break;
			const pick = await player
				.chooseCardButton("撰域：选择至多" + remain + "张花色不同的牌获得（点击取消结束）", avail, 1)
				.set("ai", (button) => get.value(button.link))
				.forResult();
			if (!pick?.links?.length) break;
			picked.push(pick.links[0]);
		}
		if (picked.length) {
			await player.gain(picked, "gain2");
			for (const card of picked) arranged.remove(card);
		}
	}
	// 其余牌置于牌堆底（无参）
	if (arranged.length) {
		game.cardsGotoPile(arranged);
	}
}


function xiaobaiKenyanMatch(card, player, info) {
	let match = 0;
	if (get.color(card, player) == info.color) match++;
	if (get.type(card, null, player) == info.type) match++;
	const dmg = Boolean(get.tag(card, "damage")) ? 1 : 0;
	if (dmg == info.isDamage) match++;
	return match;
}




// 迭锋单项条件：剩余亮牌中能否选出 num 张互异牌
function xiaobaiDiefengCan(cards, num) {
	if (num == 1) {
		return cards.some((card) => get.number(card) == 13);
	}
	if (num == 2) {
		const colors = new Set(cards.map((card) => get.color(card)));
		return colors.has("black") && colors.has("red");
	}
	if (num == 3) {
		const types = new Set(cards.map((card) => get.type(card, false)));
		return types.size >= 3;
	}
	if (num == 4) {
		const suits = new Set(cards.map((card) => get.suit(card)));
		return suits.size >= 4;
	}
	return false;
}

async function xiaobaiTiaoxinFlow(player, target) {	const next = target.chooseToUse("挑衅：对" + get.translation(player) + "使用一张【杀】，否则其弃置你一张牌");
	next.set("filterCard", (card, player2, event2) => {
		if (get.name(card) != "sha") return false;
		return lib.filter.cardEnabled(card, player2) && lib.filter.targetEnabledx(card, player2, player);
	});
	next.set("filterTarget", (card, player2, target2) => target2 == player);
	next.set("nodistance", true);
	next.set("addCount", false);
	const useRes = await next.forResult();
	if (useRes?.bool) {
		// 其因此使用【杀】：下一次发动「严教」时额外亮出一张牌
		player.storage.xiaobai_yanjiao_extra = (player.storage.xiaobai_yanjiao_extra || 0) + 1;
		return "used";
	}
	// 未使用：弃置其 1 + 「挑衅」额外数 张牌
	const num = 1 + (player.storage.xiaobai_tiaoxin_extra || 0);
	if (target.isIn() && target.countCards("he") > 0) {
		const n = Math.min(num, target.countCards("he"));
		const res = await player
			.choosePlayerCard(target, "he", true, n, "挑衅：弃置" + get.translation(target) + get.cnNumber(n) + "张牌")
			.forResult();
		const cards = res?.cards || res?.links || [];
		if (cards.length) {
			await player.discard(cards);
		}
	}
	player.storage.xiaobai_tiaoxin_extra = 0;
	return "discarded";
}

// 严教流程（复用原生界徐庶分牌逻辑 lib.skill.yanjiao.getResult；extra = 额外亮牌数）
async function xiaobaiYanjiaoFlow(player, target, extra) {
	const n = Math.min(4 + (extra || 0), 10);
	player.storage.xiaobai_yanjiao_extra = 0;
	const cards = get.cards(n);
	await game.cardsGotoOrdering(cards);
	await player.showCards(cards);
	// 原生分牌方案
	const got = lib.skill.yanjiao.getResult(cards.slice(0));
	if (!got.length) {
		return { myNum: 0, toNum: 0 };
	}
	const plan = got[0]; // [组1, 组2, 剩余]
	// 目标选择自己拿哪组（另一组给徐母）
	let index = 0;
	if (plan[0].length && plan[1].length) {
		const ctrl = await target
			.chooseControl()
			.set("choiceList", ["获得" + get.translation(plan[1]), "获得" + get.translation(plan[0])])
			.set("ai", () => (get.value(plan[1], target) >= get.value(plan[0], target) ? 0 : 1))
			.forResult();
		index = ctrl?.index || 0;
	} else if (!plan[0].length) {
		index = 0;
	} else {
		index = 1;
	}
	const toGroup = plan[index];
	const myGroup = plan[1 - index];
	if (myGroup.length) {
		await player.gain(myGroup, "gain2");
	}
	if (toGroup.length && target.isIn()) {
		await target.gain(toGroup, "gain2");
	}
	if (plan[2].length > 1 && player.isIn()) {
		// 未分组的牌超过一张：本回合手牌上限-1
		player.addTempSkill("xiaobai_yanjiao_minus", "phaseAfter");
	}
	return { myNum: myGroup.length, toNum: toGroup.length };
}

async function xiaobaiShendianFlow(player) {
	// 发动前弃牌堆花色计数快照
	const origin = {};
	const pileCards = Array.from(ui.discardPile.childNodes || []);
	for (const card of pileCards) {
		const suit = get.suit(card);
		if (suit) origin[suit] = (origin[suit] || 0) + 1;
	}
	const X = Math.min(pileCards.length, 20);
	const additional = {};
	const triggered = new Set();
	let drawCount = 0;
	for (let i = 0; i < X; i++) {
		if (!player.isIn() || player.countCards("he") == 0) break;
		const res = await player
			.chooseCard("he", true, 1, "神点：请重铸一张牌（第" + get.cnNumber(i + 1) + "次）")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.cards?.length) break;
		await player.recast(res.cards);
		// 重铸进入弃牌堆的牌：检查花色是否翻倍
		for (const card of res.cards) {
			const suit = get.suit(card);
			if (!suit) continue;
			additional[suit] = (additional[suit] || 0) + 1;
			if (additional[suit] == (origin[suit] || 0) && !triggered.has(suit)) {
				triggered.add(suit);
				if (!player.isIn()) break;
				const opts = ["摸一张牌"];
				if (game.hasPlayer((cur) => cur != player && cur.countCards("he") > 0)) opts.push("弃置一名角色一张牌");
				const ctrl = await player
					.chooseControl(opts)
					.set("prompt", "神点：" + get.translation(suit) + "花色的牌数翻倍，请选择")
					.set("ai", () => 0)
					.forResult();
				if (ctrl?.control == "摸一张牌") {
					await player.draw(1);
					drawCount++;
				} else if (ctrl?.control) {
					const t = await player
						.chooseTarget("神点：选择弃置其一张牌的角色", 1, (card2, player2, targetx) => targetx != player && targetx.countCards("he") > 0)
						.set("ai", (target) => -get.attitude(player, target))
						.forResult();
					if (t?.targets?.length) {
						const c = await player
							.choosePlayerCard(t.targets[0], "he", true, 1, "神点：弃置" + get.translation(t.targets[0]) + "的一张牌")
							.forResult();
						const card = c?.cards?.[0] || c?.links?.[0];
						if (card) {
							await player.discard([card]);
						}
					}
				}
			}
		}
	}
	return drawCount;
}

// 博议：某一项当前能否执行
function xiaobaiBoyiCan(player, item) {
	if (!player?.isIn()) return false;
	if (item == "peach") return player.countCards("he") > 0 && player.canUse({ name: "tao", isCard: true }, player, false);
	if (item == "recast") return player.countCards("he") >= 2;
	if (item == "put") return player.countCards("h") >= 3;
	return true;
}

// 转锋单次流程：mode = "obtain"（获得）/"give"（交给）
async function xiaobaiZhuanfengFlow(player, mode) {
	const targets = game.filterPlayer((current) => current != player && current.isIn() && player.inRange(current));
	if (!targets.length) return;
	if (mode == "obtain") {
		// 获得攻击范围内所有角色各一张牌
		for (const target of targets) {
			if (!player.isIn() || !target.isIn() || target.countCards("h") <= 0) continue;
			const res = await player
				.choosePlayerCard(target, "h", true, 1, "转锋：获得" + get.translation(target) + "的一张手牌")
				.forResult();
			const card = res?.cards?.[0] || res?.links?.[0];
			if (card) {
				await player.gain([card], target, "giveAuto");
			}
		}
	} else {
		// 交给攻击范围内所有角色各一张手牌
		for (const target of targets) {
			if (!player.isIn() || player.countCards("h") <= 0 || !target.isIn()) continue;
			const res = await player
				.chooseCard("h", true, 1, "转锋：选择交给" + get.translation(target) + "的一张手牌")
				.set("ai", (card) => 5 - get.value(card))
				.forResult();
			if (res?.cards?.length) {
				player.give(res.cards, target);
			}
		}
	}
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

// 逝浪：武将的势力（含双势力的全部势力）
// ⚠️ 本版 lib.character[id] 是 Character 实例：[0]=性别 [1]=势力 [2]=体力 [3]=技能
// （noname/library/element/character.js:317-356）——不能按老数组格式取 info[2]，那是体力值。
// 取法与 get.selectGroup（noname/get/index.js:6129）一致，对应 FreeKill 的 kingdom / subkingdom
function xiaobaiShilangGroups(general) {
	const info = lib.character[general];
	if (!info) return [];
	const list = Array.isArray(info.doubleGroup) && info.doubleGroup.length ? info.doubleGroup : [info.group];
	return list.filter((group, index) => group && group != "unknown" && list.indexOf(group) == index);
}

// 逝浪：这些「白」牌对应的势力中，已在本局「长河」牌堆里全部消逝的势力
// 判定按「剔除本批之后」计算，因此与「长河移除记录」谁先执行无关
function xiaobaiShilangVanished(cards, player) {
	const list = player.storage.xiaobai_changhe_generals;
	// 注意不能用 !list.length 提前返回：最后一张「白」被销毁时列表已空，
	// 若「长河」的记录更新先执行，这里就再也判不出最后一个势力的消逝了
	if (!Array.isArray(list)) return [];
	if (!cards?.length) return [];
	// 已消逝的势力只结算一次（loseAfter 与 cardsDiscardAfter 会对同一张牌各触发一次）
	const done = player.storage.xiaobai_shilang_groups || [];
	const remain = list.filter((general) => !cards.some((card) => card.storage.xiaobai_changhe.general == general));
	const remainGroups = remain.flatMap((general) => lib.xiaobaiShilangGroups(general));
	const groups = [];
	for (const card of cards) {
		for (const group of lib.xiaobaiShilangGroups(card.storage.xiaobai_changhe.general)) {
			if (groups.includes(group) || done.includes(group)) continue;
			if (!remainGroups.includes(group)) groups.push(group);
		}
	}
	return groups;
}

// 逝浪：把已销毁的武将从「长河」记录里移除（每次销毁都要更新，不只是有势力消逝时）
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

// 逝浪：按「逝浪」层数刷新永久【酒】效果（层数 + 技能 + 红色特效）
function xiaobaiShilangRefresh(player) {
	const num = player.countMark("xiaobai_shilang");
	if (num <= 0) return;
	player.storage.jiu = (player.storage.jiu || 0) + num;
	// 引擎只在「使用【酒】」时创建 .playerjiu 节点（card/extra.js:100-106），
	// 直接 addSkill("jiu") 不会有红色特效 → 按 game/index.js:3238 jiuNode 的写法补上
	game.addVideo("jiuNode", player, true);
	game.broadcastAll((player2) => {
		player2.addSkill("jiu");
		if (!player2.node.jiu && lib.config.jiu_effect) {
			player2.node.jiu = ui.create.div(".playerjiu", player2.node.avatar);
			player2.node.jiu2 = ui.create.div(".playerjiu", player2.node.avatar2);
		}
	}, player);
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

// 攒和：给定「我的手牌数 + 其他人的手牌数列表 + 剩余差值序列」，判断剩余交换能否全部走完。
// 交换后：我 = 对方的手牌数，对方 = 我的旧手牌数 —— 所以只查「场上有没有某手牌数」是不够的
function xiaobaiCuanheCanFinish(mine, list, diffs) {
	if (!diffs.length) return true;
	const diff = diffs[0];
	for (let i = 0; i < list.length; i++) {
		if (Math.abs(list[i] - mine) != diff) continue;
		const next = list.slice(0);
		next[i] = mine;
		if (xiaobaiCuanheCanFinish(list[i], next, diffs.slice(1))) return true;
	}
	return false;
}

// 攒和：发动门槛——未失效，且场上存在手牌数与自己相差 1 的其他角色
function xiaobaiCuanheUsable(player) {
	if (player.hasSkill("xiaobai_cuanhe_disabled")) return false;
	const mine = player.countCards("h");
	return game.hasPlayer((current) => current != player && current.isIn() && Math.abs(current.countCards("h") - mine) == 1);
}

// 攒和：场上其他角色的手牌数列表（喂 xiaobaiCuanheCanFinish）
function xiaobaiCuanheOthers(player) {
	return game.filterPlayer((current) => current != player && current.isIn()).map((current) => current.countCards("h"));
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

// 浚金：本回合是否有角色使用过「与此牌类型相同、花色不同」的牌（含自己）
// 类型按基本/锦囊/装备三分（get.type2：延时锦囊归锦囊类，知识库 #12）
function xiaobaiJunjinHasSameTypeDiffSuit(event, player) {
	const card = event.card;
	if (!card) return false;
	const type = get.type2(card);
	const suit = get.suit(card);
	for (const current of game.players.concat(game.dead)) {
		for (const evt of current.getHistory("useCard") || []) {
			if (evt === event) continue;
			const c = evt.card;
			if (!c) continue;
			if (get.type2(c) != type) continue;
			const s = get.suit(c);
			if (!lib.suit.includes(s) || s == suit) continue;
			return true;
		}
	}
	return false;
}

// 浚金：此牌当前可额外指定的目标（不占次数，只看目标合法性 + 距离）
function xiaobaiJunjinExtraTargets(event, player) {
	const card = event.card;
	if (!card) return [];
	const targets = event.targets || [];
	return game.filterPlayer((current) => !targets.includes(current) && lib.filter.targetEnabled(card, player, current) && lib.filter.targetInRange(card, player, current));
}

// 狈变：被询问者是否同意「变更势力至魏」
// 同意 = 永久变魏 + 本次视为打出【杀】（不用真出牌）+ 双方都同意则各摸两张牌；
// 拒绝 = 本次照常打【杀】 + 令此【决斗】伤害 +1（对「最终没响应成功」的一方不利，敌我不分）。
// 决策要点：
//   ① 对方已同意 → 自己也同意才能触发「双方各摸两张」，**只对友方划算**（不给敌方摸牌）
//   ② 自己打不出【杀】→ 同意可免于承受伤害（拒绝就得硬挨 1 点），一律同意
//   ③ 打得出来 → 友方同意（促成双方各摸两张）；敌方拒绝（不让对方摸牌，且让伤害 +1 压对方）
function xiaobaiBeibianAi(responder, duel, opposite) {
	const player = get.player();
	const friendly = get.attitude(player, opposite) > 0;
	if (duel.xiaobai_beibian_agreed?.[opposite.playerid]) {
		return friendly;
	}
	const canSha = player.mayHaveSha(player, "respond");
	if (!canSha) return true;
	return friendly;
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

// 延时拼点：枚举**当前仍然存在**（未被公开、未被销毁）的延时拼点事件。
// 判定依据（引擎 isDelay 机制，content.js:6428-6448）：
//   · 事件名 chooseToCompare 且 evt.isDelay 为真；
//   · 未被清理（清理会把 evt.isDestroyed 置 true）；
//   · 两张拼点牌都还停在移出区 —— get.position(card, true) == "s"。
//     （公开时 chooseToCompareEffect 会把它们 cardsGotoOrdering → "o"；清理时直接进弃牌堆 → "d"）
// ⚠️ 只能从 getGlobalHistory("everything") 里筛：actionHistory/globalHistory 都没有
//    chooseToCompare 这个键，everything 才是全事件表（gameEvent.js:204 每个事件都 push）。
// ⚠️ globalHistory 每个回合开始时压栈重建（content.js:4048 在 phase content 里），
//    但延时拼点牌必然在该回合 phaseEnd 被引擎清理（poptip `sxrm_compare` 的官方语义），
//    所以「本回合的 everything」就足以覆盖所有尚存活的延时拼点。
function xiaobaiDelayCompares() {
	return (game.getGlobalHistory("everything") || []).filter(
		(evt) =>
			evt.name == "chooseToCompare" &&
			evt.isDelay &&
			!evt.isDestroyed &&
			evt.card1 &&
			evt.card2 &&
			get.position(evt.card1, true) == "s" &&
			get.position(evt.card2, true) == "s"
	);
}

// 施贫 mark 同步：按「当前是否还有待公开的延时拼点」决定 显示/隐藏「拼」标记。
// 只动存在性（markSkill/unmarkSkill 内部都会 updateMarks），内容由 intro.content 惰性生成。
function xiaobaiShipinSyncMark(player) {
	const need = xiaobaiDelayCompares().length > 0;
	const has = Boolean(player.marks?.xiaobai_shipin);
	if (need && !has) player.markSkill("xiaobai_shipin");
	else if (!need && has) player.unmarkSkill("xiaobai_shipin");
}

// content 在“全局化”编译环境下只能访问 lib/game/get/ui/_status，故把 content 内用到的 helper 挂到 lib 上
lib.xiaobaiDelayCompares = xiaobaiDelayCompares;
lib.xiaobaiShipinSyncMark = xiaobaiShipinSyncMark;
lib.xiaobaiChangheNames = xiaobaiChangheNames;
lib.xiaobaiChangheGeneralName = xiaobaiChangheGeneralName;
lib.xiaobaiCetuPlay = xiaobaiCetuPlay;
lib.xiaobaiTiaoxinFlow = xiaobaiTiaoxinFlow;
lib.xiaobaiYanjiaoFlow = xiaobaiYanjiaoFlow;
lib.xiaobaiZhuanfengFlow = xiaobaiZhuanfengFlow;
lib.xiaobaiShendianFlow = xiaobaiShendianFlow;
lib.xiaobaiZhanweiFlow = xiaobaiZhanweiFlow;
lib.xiaobaiZhuanyuFlow = xiaobaiZhuanyuFlow;
lib.xiaobaiKenyanMatch = xiaobaiKenyanMatch;
lib.xiaobaiDiefengCan = xiaobaiDiefengCan;
lib.xiaobaiBoyiDo = xiaobaiBoyiDo;
lib.xiaobaiJiudianUsedNames = xiaobaiJiudianUsedNames;
lib.xiaobaiShilangDestroyed = xiaobaiShilangDestroyed;
lib.xiaobaiShilangGroups = xiaobaiShilangGroups;
lib.xiaobaiShilangVanished = xiaobaiShilangVanished;
lib.xiaobaiShilangUpdate = xiaobaiShilangUpdate;
lib.xiaobaiShilangRefresh = xiaobaiShilangRefresh;
lib.xiaobaiYujieTargets = xiaobaiYujieTargets;
lib.xiaobaiYujieSuits = xiaobaiYujieSuits;
lib.xiaobaiJunjinHasSameTypeDiffSuit = xiaobaiJunjinHasSameTypeDiffSuit;
lib.xiaobaiJunjinExtraTargets = xiaobaiJunjinExtraTargets;
lib.xiaobaiBeibianAi = xiaobaiBeibianAi;
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
			// ⚠️ 不能用「按某一张牌判定」的写法。引擎判定「某牌名能不能用」时，走的是
			// lib.filter.cardEnabled / cardUsable，其参数常常是全局可用牌表
			// lib.card.sha / lib.card.juedou（AI 版还有 lib.card.sha_ai / juedou_ai）里那条
			// **按牌名缓存、跨玩家共享**的记录——它只是 lib.card[name]，不带某个具体牌的 storage。
			// 只写 `card?.storage?.xiaobai_zhiwen` 在这里就恒不命中 → 鸷刎印出的【杀】仍按
			// 【杀】的次数限制计数 → AI 打完一次后看到「【杀】没得用了」，就再去发动鸷刎
			// 印一张新的，如此往复 → **AI 无限发动**。
			// 所以两条都要：
			// ① 最终 useCard 事件上的那张牌（带 storage，player.js:6416 chooseUseTarget 的二次
			//    content 以同一 card 对象调 useCard，标记会保留）；
			// ② 全局牌名表里正挂着本技能印出的牌时也放行（这是引擎真正用来判定可用性的那一路）。
			if (card?.storage?.xiaobai_zhiwen) return Infinity;
			if ((card?.name === "sha" || card?.name === "juedou") && player) {
				for (const list of [lib.card.sha, lib.card.juedou, lib.card.sha_ai, lib.card.juedou_ai]) {
					if (!Array.isArray(list)) continue;
					if (list.some((c) => c?.storage?.xiaobai_zhiwen)) return Infinity;
				}
			}
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
		// 统一走共享判定 xiaobaiLoseWay（12 种口径：use/respond、give/obtained 细分 + type/宿主链/去向兜底）
		return xiaobaiLoseWay(event);
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
						give: "交给他人",
						obtained: "被他人获得",
						compare: "拼点",
						recast: "重铸",
						swap: "交换",
						pile: "置入牌堆",
						expansion: "置于武将牌上",
						removed: "移出游戏",
						loseToSpecial: "扣置于场上",
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
// 按祚·附加效果（挂在目标身上的常驻技；对外只呈现一个 mark，文本说明两个效果）
xiaobai_anzuo_buff: {
	audio: 2,
	charlotte: true,
	name: "按祚",
	mark: true,
	marktext: "祚",
	intro: {
		content(storage, player) {
			const used = Boolean(player.storage.xiaobai_anzuo_buff_used);
			return `每回合首次失去所有手牌后，回复1点体力；每回合首次回满体力后，减1点体力上限。<br>本回合${used ? "已" : "尚未"}触发。`;
		},
	},
	init(player, skill) {
		player.markSkill(skill);
	},
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
				player.updateMarks();
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
				player.updateMarks();
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
				player.updateMarks();
			},
		},
	},
	onremove(player, skill) {
		player.unmarkSkill(skill);
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
	subSkill: {
		// ⚠️ 必须真实存在：主技能用 addTempSkill("xiaobai_beijia_used", …) + hasSkill("xiaobai_beijia_used") 做次数限制，
		//    缺这个空壳子技能时标记加不进去、限制形同虚设（同预诫的坑）。
		used: {
			charlotte: true,
			sub: true,
		},
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
		// 描述是「**你可以**选择一名其他角色」→ 不能传 forced（同预诫）：
		// 触发技带 cost 函数时引擎直接执行 cost、不再另发「是否发动」询问（content.js:3550），
		// 而取消按钮只在 `!event.forced` 时才渲染（game/index.js:6995）→ 传 forced 会把「可以」变成「必须」。
		event.result = await player
			.chooseTarget(get.prompt2("xiaobai_anmou"), (card, player2, target) => target !== player2)
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		if (!target) return;
		const result = await player
			.chooseTarget(`暗谋：令至多三名角色摸一张牌并与${get.translation(target)}延时拼点`, [1, 3], (card, player2, current) => current !== target)
			.set("ai", (current) => (get.attitude(player, current) > 0 ? 2 : 1))
			.forResult();
		if (!result.bool || !result.targets.length) return;
		await game.asyncDraw(result.targets);
		await game.delay();
		const list = [];
		for (const current of result.targets) {
			if (!current.isIn() || !target.isIn()) continue;
			// 走引擎**原生延时拼点**：`isDelay` 分支会把两张拼点牌扣置进移出区、注册
			// dieAfter/phaseEnd 清理，然后 untrigger + finish 中止本事件（content.js:6428-6448）。
			// 公开在结束阶段（phaseJieshuBegin，早于 phaseEnd）用 chooseToCompareEffect 拉起。
			const next = current.chooseToCompare(target).set("isDelay", true);
			// 「其只能观看并用牌堆顶的牌拼点」→ 用 fixedResult 把 target 的拼点牌钉成牌堆顶
			// （原生写法：character/newjiang.js:2534-2537 斥贼；fixedResult 命中时该角色不再被询问选牌，
			//   引擎在 content.js:6395 直接把这张牌并入 lose_list）
			const pileCard = get.cards()[0];
			if (!pileCard) continue;
			if (!next.fixedResult) next.fixedResult = {};
			next.fixedResult[target.playerid] = pileCard;
			await next.forResult();
			// isDelay 分支不给 result，只留 card1/card2；被清理掉的事件 isDestroyed 为真
			if (next.card1 && next.card2 && !next.isDestroyed) list.push(next);
		}
		if (!list.length) return;
		player.storage.xiaobai_anmou = { target, list };
		game.log(player, "发起了", list.length, "次延时拼点");
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
				const list = storage.list.slice(0);
				const target = storage.target;
				delete player.storage.xiaobai_anmou;
				// 持有者阵亡：本次结算直接作废，扣置的拼点牌当场进弃牌堆
				if (event.triggername == "dieAfter" || !target?.isIn()) {
					for (const evt of list) {
						const cards = [evt.card1, evt.card2].filter((card) => card && get.position(card, true) == "s");
						if (cards.length) await game.cardsDiscard(cards);
					}
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
								// 目标视角：挑「其赢面最大」的一组（card2 是其一方的牌）
								let best = 0,
									bestNum = -Infinity;
								list.forEach((item, i) => {
									const num = (get.number(item.card2, item.target) || 0) - (get.number(item.card1, item.player) || 0);
									if (num > bestNum) {
										bestNum = num;
										best = i;
									}
								});
								return controls[best];
							})
							.forResult();
						index = Math.max(0, controls.indexOf(res.control));
					}
					const evt = list.splice(index, 1)[0];
					const other = evt.player;
					const self = evt.target;
					// 原生公开：chooseToCompareEffect 从 parentEvent 拷贝 card1/card2/lose_list、
					// 重算点数、写 result.winner，并把拼点牌搬到展示区（之后由 orderingDiscard 自动进弃牌堆）
					const result = await game
						.createEvent("chooseToCompare", false)
						.set("player", other)
						.set("parentEvent", evt)
						.setContent("chooseToCompareEffect")
						.forResult();
					const winner = result?.winner;
					if (winner) {
						// 「赢的角色视为对没赢的角色使用一张【杀】」——注意是**视为使用**：
						// 与原生写法一致（character/mobile/skill.js:2521 的 "nodistance"），
						// 「视为使用」不受距离/攻击范围限制，只校验「目标能否被指定」。
						// 若这里用 winner.canUse(card, loser)（含距离判定），一旦发起者攻击范围不足
						// 或距离过远，canUse 会静默返回 false → 该组不出杀（表现为「最后一组不出杀」）。
						const loser = winner == other ? self : other;
						const card = new lib.element.VCard({ name: "sha", isCard: true });
						// 第 3 参 distance=false → 跳过 targetInRange，但仍保留 targetEnabled 检查
						const canUse = winner.isIn() && loser.isIn() && winner.canUse(card, loser, false);
						if (canUse) await winner.useCard(card, loser, "xiaobai_anmou");
					}
					// 「若其没赢，重复此流程」：target 赢下这一组才停
					if (winner === target || !target.isIn()) break;
				}
				// 剩余未公开的组交给引擎的 isDelay 清理在 phaseEnd 移回弃牌堆
				// （poptip `sxrm_compare` 的官方语义：此回合结束后仍未公开 → 移回弃牌堆且不再执行后续效果）
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
	viewAs: { name: "juedou", storage: { xiaobai_beibian: true } },
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
		// 不再替换【决斗】的 content —— 原版 content 里有 shaReq（每人所需杀数，无双等技能改它）、
		// directHit、baseDamage/extraDamage，以及每轮派发的 "juedou" 时机（card/standard.js:2021）。
		// 钩住 "juedou" 时机即可完整保留这些机制，并在其中插入「变更势力至魏」的分支。
		effect: {
			charlotte: true,
			popup: false,
			forced: true,
			trigger: { global: "juedou" },
			filter(event, player) {
				// 只处理狈变转化出来的【决斗】
				return Boolean(event.card?.storage?.xiaobai_beibian) && Boolean(event.turn?.isIn());
			},
			async content(event, trigger, player) {
				const duel = trigger;
				const responder = duel.turn;
				const opposite = responder == duel.source ? duel.target : duel.source;
				if (!duel.xiaobai_beibian_asked) {
					duel.xiaobai_beibian_asked = {};
				}
				// 每人只问一次：已问过的（同意过 / 拒绝过）不再询问
				if (duel.xiaobai_beibian_asked[responder.playerid]) {
					// 同意过的人：本次响应要照常打【杀】（把之前置 0 的所需杀数恢复）
					if (responder.group == "wei" && duel.shaReq?.[responder.playerid] === 0) {
						duel.shaReq[responder.playerid] = 1;
					}
					return;
				}
				// 本来就是魏势力 → 不询问
				if (responder.group == "wei") return;
				duel.xiaobai_beibian_asked[responder.playerid] = true;
				const agree = (
					await responder
						.chooseBool("狈变：是否将势力变更至魏以响应此【决斗】？")
						.set("ai", () => lib.xiaobaiBeibianAi(responder, duel, opposite))
						.forResult()
				).bool;
				if (!agree) {
					// 拒绝：本次仍要正常打出【杀】；「一方拒绝」的伤害 +1 只结算一次
					if (!duel.xiaobai_beibian_refused) {
						duel.xiaobai_beibian_refused = true;
						duel.extraDamage = (duel.extraDamage || 0) + 1;
						game.log(responder, "拒绝变更势力，此【决斗】伤害 +1");
					}
					return;
				}
				// 同意：变更势力至魏（永久），本次视为已打出【杀】
				await responder.changeGroup("wei");
				if (!duel.xiaobai_beibian_agreed) {
					duel.xiaobai_beibian_agreed = {};
				}
				duel.xiaobai_beibian_agreed[responder.playerid] = true;
				// 双方都同意 → 各摸两张牌（只结算一次）
				if (!duel.xiaobai_beibian_drawn && duel.xiaobai_beibian_agreed[duel.source.playerid] && duel.xiaobai_beibian_agreed[duel.target.playerid]) {
					duel.xiaobai_beibian_drawn = true;
					game.log(duel.source, "与", duel.target, "双方同意变更势力，各摸两张牌");
					if (duel.source.isIn()) await duel.source.draw(2);
					if (duel.target.isIn()) await duel.target.draw(2);
				}
				// 本次跳过响应：把该方所需杀数置 0，原版 content 的 while 会直接跳过
				if (duel.shaReq) {
					duel.shaReq[responder.playerid] = 0;
				}
			},
		},
	},
},
// === 博涉 ===
xiaobai_boshe: {
	audio: 2,
	// 实时标记：显示当前回合角色本回合失去牌的方式（intro）与方式总数（markcount）
	mark: true,
	marktext: "涉",
	intro: {
		markcount(storage, player) {
			const current = _status.currentPhase;
			return current ? xiaobaiBosheWays(current).size : 0;
		},
		content(storage, player) {
			const current = _status.currentPhase;
			if (!current) return "当前没有回合进行";
			const ways = [...xiaobaiBosheWays(current)];
			if (!ways.length) return `当前回合角色（${get.translation(current)}）本回合尚未失去过牌`;
			return (
				`当前回合角色（${get.translation(current)}）本回合失去方式（共${ways.length}种）：` +
				ways.map((way) => xiaobaiBosheWayTranslate(way)).join("、")
			);
		},
	},
	group: ["xiaobai_boshe_track"],
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
	subSkill: {
		// 每次有角色失去/弃置牌后刷新标记角标（markcount 函数在渲染时实时计算，updateMarks 触发重绘）
		track: {
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { global: ["loseAfter", "cardsDiscardAfter", "loseAsyncAfter"] },
			content(event, trigger, player) {
				player.updateMarks("xiaobai_boshe");
			},
		},
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
		// 选项二候选：牌名字数为X的基本牌/普通锦囊牌（须有可用目标）；池子用 lib.inpile（标准牌名表，与其他视为使用技一致）
		const candidates = lib.inpile.filter((name) => {
			const info = lib.card[name];
			if (!info || (info.type != "basic" && info.type != "trick")) return false;
			if (get.translation(name).length != x) return false;
			return player.hasUseTarget(new lib.element.VCard({ name, isCard: true }));
		});
		const viewOption = "观看牌堆顶的牌";
		const useOption = "视为使用一张牌";
		let choice = viewOption;
		if (candidates.length) {
			choice = (await player
				.chooseControl(viewOption, useOption)
				.set("prompt", `博文：选择一项（X=${x}）`)
				.set("prompt2", "选项一：观看牌堆顶X张牌，然后可以弃置任意张牌，获得其中牌名字数之和不大于你弃置牌的牌。选项二：视为使用一张牌名字数为X的基本牌或普通锦囊牌，然后本阶段结束。")
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
			// 选项二：vcard 按钮显示候选牌面（[type, "", name] 格式，get.inpileVCardList 同款），选中后视为使用
			const list = candidates.map((name) => [lib.card[name].type, "", name]);
			const result = await player
				.chooseButton([`博文：视为使用一张牌名字数为${get.cnNumber(x)}的牌（然后本阶段结束）`, [list, "vcard"]], true)
				.set("ai", (button) => get.order(new lib.element.VCard({ name: button.link[2], isCard: true })) || 0)
				.forResult();
			if (!result?.bool || !result.links?.length) return;
			const card = new lib.element.VCard({ name: result.links[0][2], isCard: true });
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
	group: ["xiaobai_changhe_remove", "xiaobai_changhe_destroy"],
	filter(event, player) {
		return !_status.xiaobaiChangheDone && (event.name != "phase" || game.phaseNumber == 0);
	},
	async content(event, trigger, player) {
		_status.xiaobaiChangheDone = true;
		// 小白杯武将图位于 image/character/xiaobai_*.jpg，而引擎注册扩展武将时回填的
		// img 是扩展根路径（不存在）——统一纠正后 setBackground(…,"character") 才能取到图；
		// 无图文件的武将走引擎的性别剪影回退，不会空白
		for (const name of Object.keys(lib.character)) {
			if (name.startsWith("xiaobai_")) {
				lib.character[name].img = "extension/群友设计/image/character/" + name + ".jpg";
			}
		}
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
			// 无牌名的小白杯武将也生成「白」：names 为空，仅为一张黑桃9的普通锦囊牌（仍参与逝浪的势力判定）
			const names = xiaobaiChangheNames(skills);
			const card = game.createCard2("xiaobai_dabai", "spade", 9);
			card.storage.xiaobai_changhe = { general: name, names };
			// 预设 destroyed=false：绕开引擎 lose content 分支三（destroy 牌“首次不移动只标记”，content.js:10770），
			// 使 recast/使用/弃置时正常进入目标区域（离开手牌区），由〖长河〗的 destroy 兜底子技能统一补销毁
			card.destroyed = false;
			// 牌面左下角显示对应武将（对应 FreeKill 原版 room:setCardMark(card, "@xiaobai__tianxiadaba", 武将名)）
			card.addGaintag(lib.xiaobaiChangheGeneralName(name));
			// $init 渲染牌面时 storage 尚未赋值（image 函数取不到武将），此处手动补渲染武将图
			card.setBackground(name, "character");
			cards.push(card);
		}
		if (!cards.length) return;
		// 记录仍在牌堆里的“小白杯”武将，供〖逝浪〗判断某势力是否已全部消逝
		player.storage.xiaobai_changhe_generals = cards.map((card) => card.storage.xiaobai_changhe.general);
		// 初始总数，供〖逝浪〗标记提示显示「剩余 / 总数」
		player.storage.xiaobai_changhe_total = cards.length;
		await game.cardsGotoPile(cards, () => ui.cardPile.childNodes[get.rand(0, ui.cardPile.childNodes.length - 1)]);
		game.log(player, `将${get.cnNumber(cards.length)}张「白」洗入了牌堆`);
		// 大白挂全场角色：addGlobalSkill 的全局技能只进触发派发链、不渲染进技能栏（按钮无法显示）；
		// addSkill 后技能栏正常显示「大白」，手里没「白」时 filter 自然置灰；无 trigger 字段，无需 global 注册
		for (const current of game.players) {
			if (!current.hasSkill("xiaobai_dabai")) current.addSkill("xiaobai_dabai");
		}
	},
	onremove(player, skill) {
		delete player.storage.xiaobai_changhe_generals;
		delete player.storage.xiaobai_changhe_total;
	},
	subSkill: {
		// 「白」牌销毁后即时从「长河」记录里移除该武将
		// 对应 FreeKill 原版长河的第二个 effect（白牌进弃牌堆就从 @&xiaobai__changhe 表标记里删掉该武将）
			remove: {
				charlotte: true,
				silent: true,
				popup: false,
				forced: true,
				trigger: { global: ["loseAfter", "cardsDiscardAfter"] },
				filter(event, player) {
					if (!Array.isArray(player.storage.xiaobai_changhe_generals)) return false;
					return lib.xiaobaiShilangDestroyed(event.cards).length > 0;
				},
				content(event, trigger, player) {
					lib.xiaobaiShilangUpdate(lib.xiaobaiShilangDestroyed(trigger.cards), player);
				},
			},
			// 兜底销毁：「白」预设 destroyed=false 绕开引擎 lose 分支三（destroy 牌“首次不移动只标记”），
			// 经 recast/使用/弃置正常进入弃牌堆后，在此统一补销毁（对齐描述“进入弃牌堆后销毁”）。
			// 用 getd() 取已入弃牌堆的牌（lose 的 getlx=false 时返回空则退回 event.cards），按位置双保险
			destroy: {
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				name: "长河",
				trigger: { global: ["loseAfter", "cardsDiscardAfter"] },
				filter(event, player) {
					const cards = (event.getd ? event.getd() : null) || event.cards || [];
					return cards.some(
						(card) => card?.name == "xiaobai_dabai" && card.storage?.xiaobai_changhe && get.position(card, true) == "d" && !card._selfDestroyed
					);
				},
				async content(event, trigger, player) {
					for (const card of trigger.getd ? trigger.getd() : trigger.cards) {
						if (card?.name == "xiaobai_dabai" && card.storage?.xiaobai_changhe && get.position(card, true) == "d" && !card._selfDestroyed) {
							card.selfDestroy(event);
						}
					}
				},
			},
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
		// 一次询问只能发动一次：中止后引擎 goto(0) 重开询问，此处拦掉重复弹出
		if (event.xiaobai_cuanhe) return false;
		if (!xiaobaiCuanheUsable(player)) return false;
		if (xiaobaiIsSelfSelect(event, "xiaobai_cuanhe")) return true;
		return xiaobaiViewAsList(event, player, get.inpileVCardList((info) => info[0] == "basic")).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			return ui.create.dialog("攒和：视为使用一张基本牌", [xiaobaiViewAsList(event, player, get.inpileVCardList((info) => info[0] == "basic")), "vcard"]);
		},
		check(button) {
			const player2 = get.player();
			// AI：走不完 1/2/3 三次交换就不会视为使用，白白换手牌 → 直接不给分（ai.basic.chooseButton ≤0 即不选）
			if (!xiaobaiCuanheCanFinish(player2.countCards("h"), xiaobaiCuanheOthers(player2), [1, 2, 3])) return 0;
			if (_status.event.getParent().type != "phase") return 1;
			return player2.getUseValue(get.autoViewAs({ name: button.link[2], nature: button.link[3], isCard: true }, null, true));
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
					const diffs = [1, 2, 3];
					let count = 0;
					// 依次找手牌数相差 1 / 2 / 3 的其他角色交换手牌；每步都可取消，取消或没有合格角色即中止
					for (const diff of diffs) {
						const res = await player2
							.chooseTarget(`攒和：你可以与一名手牌数相差${get.cnNumber(diff)}的其他角色交换手牌`, (card, player3, target) => {
								return target != player3 && target.isIn() && Math.abs(target.countCards("h") - player3.countCards("h")) == diff;
							})
							.set("ai", () => 1)
							.forResult();
						if (!res.bool || !res.targets?.length) break;
						await player2.swapHandcards(res.targets[0]);
						count++;
					}
					// 后续（换满三次与否都要走）：手牌数未减少 → 本技能本轮失效（图标变灰 + 标记）
					// 注意：此判定必须在 useResult 之前，否则用牌本身会让手牌减少，永远判不出"未减少"
					if (player2.countCards("h") >= before) {
						player2.disableSkill("xiaobai_cuanhe_disabled", "xiaobai_cuanhe");
						player2.addTempSkill("xiaobai_cuanhe_disabled", "roundStart");
					}
					if (count < 3) {
						// 没换满三次 → 不视为使用。保持 bool=true + cancel，让引擎 goto(0) 重开本次用牌询问：
						// ① 不能写 bool=false（那会让出牌阶段循环视为结束阶段）；
						// ② 换到手的新牌（闪/桃）在重开的询问里依然可选
						const evt = event.getParent();
						evt.set("xiaobai_cuanhe", true);
						evt._aiexclude.add("xiaobai_cuanhe");
						event.result.cancel = true;
					}
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
			(card) => {
				// 目标为我方 → 弃牌令此【杀】多结算一次有害，AI 倾向不弃；目标为敌方 → 弃低价值牌
				return get.attitude(player, to) < 0 ? 6 - get.value(card) : -get.value(card);
			}
		);
		chooseEvent._args.remove("glow_result");
		const result = await chooseEvent.forResult();
		const chosen = valid.map((current, index) => Boolean(result?.[index]?.bool && result[index].cards?.length == 2));
		const use = trigger.getParent("useCard");
		for (let i = 0; i < valid.length; i++) {
			if (!chosen[i]) continue;
			if (use) use.effectCount = (typeof use.effectCount == "number" ? use.effectCount : 1) + 1;
			await valid[i].discard(result[i].cards);
		}
		// “唯一与你意见不一致”：你不参与询问（无两张可弃牌）时不存在“你的意见”，不结算翻面
		const myIndex = valid.indexOf(player);
		if (!use || myIndex < 0) return;
		const differs = valid.filter((current, index) => chosen[index] !== chosen[myIndex]);
		if (differs.length != 1) return;
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
			// 「失去牌」全家桶入口（七巧/沦佚同款）：
			// loseAfter 覆盖 player.lose（含 gain/equip/addToExpansion 的前置 lose、loseToSpecial 的子 lose，
			// 如木牛流马置牌/移动装备）；discardAfter 覆盖弃置（弃置的牌必来自手牌/装备区，无需分类）；
			// loseAsyncAfter 为批量失去的冗余保险
			trigger: {
				player: ["loseAfter", "discardAfter"],
				global: ["loseAsyncAfter"],
			},
			filter(event, player) {
				// 仅未横置时可发动（横置状态下没有“横置”可执行）
				if (player.isLinked()) return false;
				// 不因「使用/打出」失去牌
				const evt = event.relatedEvent || event.getParent();
				if (["useCard", "respond"].includes(evt?.name)) return false;
				// 失去的须是手牌或装备区的牌（FreeKill 原版语义 fromArea == PlayerHand or PlayerEquip）
				// ⚠ lose 事件的 getl 对 getlx=false 的附属失去（gain/equip/addToExpansion 的前置 lose）
				// 返回空 map（player.js:8566），须直接读事件自身的 hs/es 分类（content 尾部无条件挂载）
				if (event.name == "lose") {
					return event.player == player && Boolean(event.hs?.length || event.es?.length);
				}
				if (event.name == "loseAsync") {
					// 木牛流马置牌（loseToSpecial）等批量失去：getl 聚合该 player 的子 lose 记录
					const evtx = event.getl?.(player);
					return Boolean(evtx?.hs?.length || evtx?.es?.length);
				}
				// discardAfter：弃置的牌必来自手牌/装备区（he），无需再分类
				return true;
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
				// 仅翻面或横置状态（或两者皆有）时可发动；只判「非属性伤害」
				if (!player.isTurnedOver() && !player.isLinked()) return false;
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
		// 可取消（不传 true）：取消则本回合正常进行，不消耗任何资源
		event.result = await player
			.chooseTarget("策图：是否跳过额定回合，改为询问一名其他角色是否使用一张牌？", lib.filter.notMe)
			.set("ai", (target) => get.attitude(get.player(), target))
			.forResult();
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		// 跳过额定回合：**取消整个 phase 事件**。
		// ⚠️ 只清空 phaseList 是不够的 —— 「回合开始」的播报与日志写在 phase 事件的 content 里且**无条件执行**
		//    （content.js:4115 `popup("回合开始")`、4134 `game.log(player, "的…回合开始")`），
		//    清空 phaseList 拦不住它，所以玩家仍会看到/看到日志里的回合开始。
		// event.cancel() 会 finish()（gameEvent.js:627-639）→ content 立即停止、回合不再播报，
		// 且 phase 类事件会记进 getHistory("skipped")。等价于 FreeKill 在 TurnStart 里
		// `getCurrentEvent():shutdown()` 的写法。
		trigger.cancel();
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
		// chooseControl 的按钮文本 = get.translation(控件值)（control.js:88），
		// 直接传 "recast"/"put" 这类英文键会原样显示英文 → 控件值必须用中文短标签
		const names = {
			peach: "用桃",
			recast: "重铸",
			put: "放牌",
			draw: "摸牌",
		};
		// 对话框里展示的完整说明（choiceList）
		const labels = {
			peach: "将一张牌当作【桃】使用",
			recast: "重铸两张牌并进行一次【闪电】判定",
			put: "将三张手牌置于牌堆顶",
			draw: "摸四张牌并获得一个单独的“鉴戒”",
		};
		const choices = all.filter((item) => xiaobaiBoyiCan(player, item));
		if (!choices.length) return;
		const control = await player
			.chooseControl(choices.map((item) => names[item]))
			.set("prompt", "博议：执行一项")
			.set("choiceList", choices.map((item) => labels[item]))
			.set("ai", () => choices.indexOf("draw"))
			.forResult();
		const choice = choices.find((item) => names[item] === control.control);
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
		if (suit && suit != "none") {
			player.storage.xiaobai_jianjie_last = suit;
		}
		// 一份「鉴戒」结算一次，每份弃置一张
		const count = player.countMark("xiaobai_jianjie");
		for (let i = 0; i < count; i++) {
			if (!player.isIn()) break;
			if (!player.countCards("he", (card) => lib.filter.cardDiscardable(card, player, "xiaobai_jianjie"))) break;
			await player
				.chooseToDiscard(1, "he", true)
				.set("prompt", "鉴戒：弃置一张牌")
				.set("skill", "xiaobai_jianjie")
				.forResult();
		}
	},
	group: ["xiaobai_jianjie_reset"],
	onremove(player, skill) {
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
					// 「白」经 loseToDiscardpile→lose 时，引擎对 destroy 牌“首次不移动只标记
					// （card.destroyed='discardPile'，延迟删除且可能被手牌区刷新取消）”，
					// 导致白牌回手牌区：由〖长河〗的 destroy 兜底子技能统一补销毁
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
	ai: {
		order: 4,
		result: {
			// 送出对自己无用的「白」换摸一张，纯赚；目标按敌我打分，避免资敌（仅剩敌方究典时 AI 取消目标选择）
			player: 1,
			target: (player, target) => get.attitude(player, target),
		},
	},
	async content(event, trigger, player) {
		const card = event.cards[0];
		// destroy 牌经 give 的前置 lose 会被引擎“标记不移动”（留在赠予者手里、受赠者拿不到）：
		// 赠予前临时放行（走 lose 分支二正常移动），赠予后恢复销毁属性
		const saved = card.destroyed;
		card.destroyed = false;
		await player.give(card, event.targets[0]);
		if (saved === undefined) delete card.destroyed;
		else card.destroyed = saved;
		await player.draw();
	},
},
// === 逝浪 ===
xiaobai_shilang: {
	audio: 2,
	locked: true,
	forced: true,
	mark: true,
	marktext: "浪",
	intro: {
		content(storage, player) {
			const remain = (player.storage.xiaobai_changhe_generals || []).length;
			const total = player.storage.xiaobai_changhe_total || remain;
			const vanished = player.storage.xiaobai_shilang_groups || [];
			return [
				`永久【酒】效果：${player.countMark("xiaobai_shilang")}层`,
				`「白」剩余武将：${remain}/${total}`,
				`已消逝势力：${vanished.length ? vanished.map((group) => get.translation(group)).join("、") : "无"}`,
			].join("<br>");
		},
	},
	trigger: { global: ["loseAfter", "cardsDiscardAfter"] },
	filter(event, player) {
		return lib.xiaobaiShilangVanished(lib.xiaobaiShilangDestroyed(event.cards), player).length > 0;
	},
	init(player, skill) {
		// 开局就显示标记，方便随时查看「白」剩余武将数
		player.markSkill(skill);
	},
	async content(event, trigger, player) {
		const cards = lib.xiaobaiShilangDestroyed(trigger.cards);
		const groups = lib.xiaobaiShilangVanished(cards, player);
		// 记录已消逝的势力（既用于去重，也用于标记提示）
		player.storage.xiaobai_shilang_groups = (player.storage.xiaobai_shilang_groups || []).concat(groups);
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
	onremove(player, skill) {
		delete player.storage.xiaobai_shilang_groups;
		// 引擎的 jiu 技能 onremove 会一并清掉 node.jiu / storage.jiu（card/extra.js:1048-1056）
		player.removeSkill("jiu");
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
		// 描述是「**你可以**摸一张牌并与一名其他角色"协力"」→ 不能传 forced（同预诫/暗谋）
		event.result = await player
			.chooseTarget("攥功：选择一名其他角色，与其进行“协力”", lib.filter.notMe)
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
// === 浚金 ===
xiaobai_junjin: {
	audio: 2,
	mark: true,
	marktext: "金",
	intro: {
		name2: "金",
		markcount: (storage, player) => player.countMark("xiaobai_junjin"),
		content(storage, player) {
			const n = player.countMark("xiaobai_junjin");
			return n > 0 ? "本回合下次摸牌数 +" + n : "本回合下次摸牌数无加成";
		},
	},
	trigger: { player: "useCard1" },
	filter(event, player) {
		const card = event.card;
		if (!card || !player.countCards("he")) return false;
		const suit = get.suit(card);
		if (!lib.suit.includes(suit)) return false;
		return lib.xiaobaiJunjinHasSameTypeDiffSuit(event, player);
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseCard("he", "浚金：重铸一张牌", true)
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.bool || !res.cards?.length) {
			event.result = { bool: false };
			return;
		}
		// 即时牌（基本/普通锦囊）且有合法候选 → 可多指定一个目标；取消则仅重铸
		let targets = [];
		const type = get.type(trigger.card);
		const list = lib.xiaobaiJunjinExtraTargets(trigger, player);
		if ((type == "basic" || type == "trick") && list.length) {
			const res2 = await player
				.chooseTarget("浚金：可以为此牌多指定一个目标", (card, player2, target) => list.includes(target))
				.set("ai", (target) => get.effect(target, trigger.card, player, player))
				.forResult();
			if (res2?.bool && res2.targets?.length) targets = res2.targets;
		}
		event.result = { bool: true, cards: res.cards, targets };
	},
	async content(event, trigger, player) {
		const cards = event.cards || [];
		const target = event.targets?.[0];
		const isEquip = cards.length > 0 && get.type(cards[0]) == "equip";
		// 记录本次使用：供「造成伤害」分支判断，并保证每次使用只记一次
		trigger.xiaobai_junjin_user = player.playerid;
		if (cards.length) await player.recast(cards);
		if (target?.isIn()) {
			if (!trigger.targets) trigger.targets = [];
			trigger.targets.push(target);
			game.log(player, "为", trigger.card, "额外指定了目标", target);
		}
		// 重铸了装备牌 → 你本回合下次摸牌数 +1
		if (isEquip) player.addMark("xiaobai_junjin", 1, false);
	},
	onremove(player) {
		const n = player.countMark("xiaobai_junjin");
		if (n > 0) player.removeMark("xiaobai_junjin", n, false);
	},
	group: ["xiaobai_junjin_damage", "xiaobai_junjin_draw"],
	subSkill: {
		damage: {
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { global: "damageBegin1" },
			filter(event, player) {
				if (!event.source || event.source != player) return false;
				const use = event.getParent("useCard");
				if (!use || use.xiaobai_junjin_user != player.playerid) return false;
				return !use.xiaobai_junjin_damage_added;
			},
			content(event, trigger, player) {
				const use = trigger.getParent("useCard");
				use.xiaobai_junjin_damage_added = true;
				player.addMark("xiaobai_junjin", 1, false);
			},
		},
		draw: {
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { player: "drawBegin" },
			filter(event, player) {
				return event.num > 0 && player.countMark("xiaobai_junjin") > 0;
			},
			content(event, trigger, player) {
				const n = player.countMark("xiaobai_junjin");
				trigger.num += n;
				player.removeMark("xiaobai_junjin", n, false);
			},
		},
	},
},

// === 境颐 ===
xiaobai_jingyi: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { global: "phaseEnd" },
	filter(event, player) {
		return Boolean(player.storage.xiaobai_jingyi_damage || player.storage.xiaobai_jingyi_lose);
	},
	async content(event, trigger, player) {
		const noDamage = Boolean(player.storage.xiaobai_jingyi_damage);
		const lostLast = Boolean(player.storage.xiaobai_jingyi_lose);
		delete player.storage.xiaobai_jingyi_damage;
		delete player.storage.xiaobai_jingyi_lose;
		if (!noDamage && !lostLast) return;
		player.logSkill("xiaobai_jingyi");
		await player.draw();
		// 均满足：重置「诚谟」，当前回合角色也摸一张牌
		if (noDamage && lostLast) {
			if (player.storage["xiaobai_chengmo_roundcount"] != null) {
				delete player.storage["xiaobai_chengmo_roundcount"];
				player.unmarkSkill("xiaobai_chengmo_roundcount");
			}
			game.log(player, "重置了", "#g【诚谟】");
			const current = trigger.player;
			if (current?.isIn()) await current.draw();
		}
	},
	onremove(player) {
		delete player.storage.xiaobai_jingyi_damage;
		delete player.storage.xiaobai_jingyi_lose;
	},
	group: ["xiaobai_jingyi_track"],
	subSkill: {
		track: {
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { global: ["phaseBegin", "damageAfter", "loseAfter"] },
			filter(event, player) {
				if (event.name == "damage") return !event.cancelled;
				return true;
			},
			content(event, trigger, player) {
				if (trigger.name == "phase") {
					// 回合开始：重置两个记录
					player.storage.xiaobai_jingyi_damage = true;
					delete player.storage.xiaobai_jingyi_lose;
				} else if (trigger.name == "damage") {
					delete player.storage.xiaobai_jingyi_damage;
				} else if (trigger.name == "lose") {
					// 有角色失去过最后一张手牌
					// ⚠ 不能用 trigger.getl()：give/分配等 gain 附属的 lose 带 getlx=false，
					// getl() 对其永远返回空 map（player.js:8566），须直接读事件自身的 hs 分类
					const loser = trigger.player;
					if (loser && trigger.hs?.length > 0 && !loser.countCards("h")) {
						player.storage.xiaobai_jingyi_lose = true;
					}
				}
			},
		},
	},
},

// === 羁讯 ===
xiaobai_jixun: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.countCards("h") >= 2);
	},
	async content(event, trigger, player) {
		const res = await player
			.chooseTarget("羁讯：获得一名其他角色两张牌", (card, player2, target) => target != player2 && target.countCards("h") >= 2, true)
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
		const target = res?.targets?.[0];
		if (!target) return;
		const res2 = await player
			.choosePlayerCard(target, "he", 2, true, "羁讯：选择获得其两张牌")
			.set("ai", (card) => get.value(card))
			.forResult();
		if (!res2?.bool || res2.cards?.length != 2) return;
		const cards = res2.cards.slice();
		await player.gain(cards, target, "giveAuto");
		// “羁讯”标记：直到原角色收回这些牌时才移除
		player.addGaintag(cards, "xiaobai_jixun");
		// 记录：目标此回合结束后收回这些牌（used 按次记录，多持有者互不干扰）
		if (!Array.isArray(target.storage.xiaobai_jixun_cards)) target.storage.xiaobai_jixun_cards = [];
		const recs = cards.map((card) => ({ card: card, used: false }));
		target.storage.xiaobai_jixun_cards.addArray(recs);
		// 其可以视为使用一张由你指定目标的【杀】（无视距离）
		const vcard = new lib.element.VCard({ name: "sha", isCard: true });
		// canUse 第三参须传 false 才关闭距离检查（“无视距离”）
		const usable = game.hasPlayer((current) => current != target && target.canUse(vcard, current, false, true));
		let used = false;
		if (usable) {
			const want = await target
				.chooseBool("羁讯：你可以视为使用一张由" + get.translation(player) + "指定目标的【杀】（无视距离）")
				.set("ai", () => get.attitude(target, player) > 0)
				.forResult();
			if (want.bool) {
				const res3 = await player
					.chooseTarget("羁讯：替" + get.translation(target) + "选择【杀】的目标", (card, player2, current) => current != target && target.canUse(vcard, current, false, true), true)
					.set("ai", (current) => -get.attitude(player, current))
					.forResult();
				const slashTarget = res3?.targets?.[0];
				if (slashTarget) {
					await target.useCard(vcard, slashTarget, false, "xiaobai_jixun");
					used = true;
				}
			}
		}
		if (used) {
			for (const rec of recs) rec.used = true;
		}
	},
	group: ["xiaobai_jixun_settle"],
	ai: {
		order: 6,
		// 拿敌人两张牌（回合末归还）+ 可令其被指定目标出【杀】，净收益为正
		result: { player: 1 },
	},
	subSkill: {
		settle: {
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { player: "phaseEnd" },
			filter(event, player) {
				return game.hasPlayer((current) => (current.storage.xiaobai_jixun_cards || []).length > 0);
			},
			async content(event, trigger, player) {
				for (const current of game.filterPlayer((p) => (p.storage.xiaobai_jixun_cards || []).length > 0)) {
					const list = current.storage.xiaobai_jixun_cards.slice();
					delete current.storage.xiaobai_jixun_cards;
					const cards = [];
					for (const rec of list) {
						if (!rec?.card) continue;
						// 拒绝使用【杀】者：只能收回当前仍在弃牌堆里的那些牌
						if (!rec.used && get.position(rec.card) != "d") continue;
						cards.push(rec.card);
					}
					if (cards.length && current.isIn()) {
						// “羁讯”标记到收回为止
						current.removeGaintag("xiaobai_jixun", cards);
						await current.gain(cards, "gain2");
					}
				}
			},
		},
	},
},


// === 预诫 ===
xiaobai_yujie: {
	audio: 2,
	group: ["xiaobai_yujie_draw", "xiaobai_yujie_refresh"],
	trigger: { global: "phaseBegin" },
	filter(event, player) {
		if (player.hasSkill("xiaobai_yujie_used")) return false;
		return lib.xiaobaiYujieTargets(player).length > 0;
	},
	async cost(event, trigger, player) {
		const list = lib.xiaobaiYujieTargets(player);
		// ⚠️ 这里**不能**传 forced（chooseTarget 第 3 个参数 true）。
		// 原因：本技能用 cost 做发动流程，引擎在 `typeof info.cost === "function"` 分支里
		// **不再弹「是否发动」的 chooseBool**（content.js:3550），所以「选目标」这个面板
		// 就是玩家唯一的询问入口。而取消按钮的渲染条件是
		// `!event.forced && get.noSelected()`（game/index.js:6995）——
		// 一旦 forced，取消按钮直接不创建 → 描述里的「你可以」变成了「你必须」。
		// 去掉 forced 后：玩家点取消 → 返回 {bool:false} → 引擎 `if (!result || !result.bool) return`
		// （content.js:3629）→ 技能不发动，语义与描述一致。
		const res = await player
			.chooseTarget("预诫：将一名角色于本回合移出游戏", (card, player2, target) => list.includes(target))
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
		event.result = res?.bool && res.targets?.length ? res : { bool: false };
	},
	async content(event, trigger, player) {
		player.addTempSkill("xiaobai_yujie_used", "roundStart");
		const target = event.targets[0];
		// 记录本轮移出过谁（下一轮以此法移出过的角色除外）
		player.storage.xiaobai_yujie_last = { round: game.roundNumber, target: target.playerid };
		// 摸牌结算时按归属找到目标
		target.storage.xiaobai_yujie_owner = player.playerid;
		// 调虎离山同款：tempSkill 不传 expire → 引擎默认本回合结束（phaseAfter/phaseBeforeStart）自动过期
		target.addTempSkill("xiaobai_yujie_out");
	},
	onremove(player) {
		delete player.storage.xiaobai_yujie_last;
	},
	subSkill: {
		// ⚠️ 必须真实存在：主技能用 addTempSkill("xiaobai_yujie_used", "roundStart") 做「每轮限一次」，
		//    原来没有这个 subSkill → 加进去的是空技能，flag 形同虚设 → 每回合都能发动。
		used: {
			charlotte: true,
			sub: true,
		},
		// markcount 实时刷新：intro.markcount 只在 updateMarks 被调用时求值（player.js:4700），
		// 「诫」标记创建时花色数为 0，必须随牌被使用/打出主动刷新，否则数字永远不出现。
		// 挂在**持有者**（始终在场）身上，刷新的是被移出者的 mark。
		refresh: {
			charlotte: true,
			sub: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { global: ["useCardAfter", "respondAfter"] },
			filter(event, player) {
				return game.hasPlayer((current) => current.hasSkill("xiaobai_yujie_out"));
			},
			content(event, trigger, player) {
				for (const current of game.players.concat(game.dead)) {
					if (current.hasSkill("xiaobai_yujie_out")) current.updateMarks();
				}
			},
		},
		out: {
			charlotte: true,
			group: "undist",
			mark: true,
			marktext: "诫",
			// ⚠️ markcount 的实时刷新**不能**挂在本子技能上：持有者是被移出游戏的角色，
			//    引擎不会为离场角色派发 global 触发器 → updateMarks 永远不执行 → 角标不出现。
			//    刷新改由主技能侧的 _refresh 子技能驱动（见下）。
			intro: {
				markcount(storage, player) {
					return player.hasSkill("xiaobai_yujie_out") ? lib.xiaobaiYujieSuits().length : 0;
				},
				content: "已移出游戏：本回合结束时回到游戏；移出期间每有一种花色的牌被使用或打出，摸一张牌。",
			},
			init(player) {
				if (player.isIn()) {
					game.broadcastAll((player2) => {
						player2.classList.add("out");
					}, player);
					game.log(player, "移出了游戏");
				}
			},
			onremove(player) {
				if (player.isOut()) {
					game.broadcastAll((player2) => {
						player2.classList.remove("out");
					}, player);
					game.log(player, "移回了游戏");
					// 记下移出期间被使用/打出的花色种数（= 回来时摸牌数），由持有者的 _draw 结算
					player.storage.xiaobai_yujie_heals = lib.xiaobaiYujieSuits().length;
				}
			},
		},
		draw: {
			charlotte: true,
			forced: true,
			name: "预诫",
			popup: false,
			silent: true,
			// 不能 group 挂在 _out 下（_out 被引擎过期清理时 group 断链，知识库 #59），
			// 故常驻持有者：phaseAfter 派发时目标的 _out 已先被清理并写入摸牌数
			trigger: { global: "phaseAfter" },
			filter(event, player) {
				return game.hasPlayer(
					(current) => current.storage.xiaobai_yujie_owner == player.playerid && (current.storage.xiaobai_yujie_heals || 0) > 0
				);
			},
			async content(event, trigger, player) {
				for (const current of game.filterPlayer()) {
					if (current.storage.xiaobai_yujie_owner != player.playerid) continue;
					const n = current.storage.xiaobai_yujie_heals || 0;
					if (n <= 0) continue;
					delete current.storage.xiaobai_yujie_heals;
					if (!current.isIn()) continue;
					game.log(current, "移出期间有", get.cnNumber(n), "种花色的牌被使用或打出，摸", get.cnNumber(n), "张牌");
					await current.draw(n);
				}
			},
		},
	},
},



// === 噬契 ===
xiaobai_shiqi: {
	audio: 2,
	limited: true,
	animationColor: "water",
	// ⚠️ reset（效果②）绝不能进 group：awakenSkill 内部的 disableSkill 会沿 group 级联禁用子技能
	// （player.js:11214-11253，知识库#59），而效果②恰恰要在「已发动」之后继续触发。
	// 所以它走「动态独立挂载」（才瑕 dccaixia_clear 同款）：id 与被禁用键不同名，不被摘除。
	group: ["xiaobai_shiqi_use"],
	subSkill: {
		// 效果①（未发动时）：一名角色使用装备牌后，可视为使用【过河拆桥】；发动即消耗限定技
		use: {
			audio: "xiaobai_shiqi",
			charlotte: true,
			sub: true,
			name: "噬契",
			trigger: { global: "useCardAfter" },
			direct: true,
			popup: false,
			filter(event, player) {
				if (player.awakenedSkills.includes("xiaobai_shiqi")) return false;
				if (!event.card || get.type(event.card) != "equip") return false;
				// 有合法拆桥目标才询问（过河拆桥 enable:true，任意时机可用；牌 id 是 guohe）
				return player.hasUseTarget({ name: "guohe", isCard: true });
			},
			async content(event, trigger, player) {
				// 非强制：玩家可直接取消选目标 → bool=false，不消耗限定技（对齐 FreeKill 的 skip 语义）
				const result = await player
					.chooseUseTarget({ name: "guohe", isCard: true }, "噬契：是否视为使用【过河拆桥】？", false)
					.forResult();
				if (!result?.bool) return;
				player.awakenSkill("xiaobai_shiqi");
				// 把效果②独立挂上来（不在 group 里 → 不会被上面那句的级联禁用波及）
				player.addSkill("xiaobai_shiqi_reset");
			},
		},
		// 效果②（行置期间）：其他角色的准备阶段可视为对田续使用【借刀杀人】；
		// 田续被迫使用的【杀】造成伤害 → 重置限定技（效果①重新可用、效果②关闭）
		reset: {
			audio: "xiaobai_shiqi",
			charlotte: true,
			sub: true,
			name: "噬契",
			trigger: { global: "phaseZhunbeiBegin" },
			direct: true,
			popup: false,
			filter(event, player) {
				if (!player.awakenedSkills.includes("xiaobai_shiqi")) return false;
				const current = event.player;
				if (current == player || !current.isIn()) return false;
				// 【借刀杀人】的前置：被借刀方（田续）须有武器，且其攻击范围内存在合法的出杀目标
				if (!player.getEquips(1).length) return false;
				const sha = { name: "sha", isCard: true };
				return game.hasPlayer((cur) => cur != player && player.inRange(cur) && lib.filter.targetEnabled(sha, player, cur));
			},
			async content(event, trigger, player) {
				const current = trigger.player;
				const go = await current
					.chooseBool(`噬契：是否视为对${get.translation(player)}使用【借刀杀人】？`)
					.set("ai", () => {
						// 队友：持有者手牌有【杀】（借刀后可出杀造成伤害、重置限定技）才同意；敌人无条件同意
						if (get.attitude(current, player) > 0) {
							return player.hasCard((card) => get.name(card) == "sha", "h") ? 1 : 0;
						}
						return 1;
					})
					.forResult();
				if (!go?.bool) return;
				// 出杀目标：照抄【借刀杀人】自带的 filterAddedTarget（standard.js:2791）
				const result = await current
					.chooseTarget(`选择【杀】的目标（须在${get.translation(player)}的攻击范围内）`, 1, (card, playerx, targetx) => {
						return targetx != player && player.inRange(targetx) && lib.filter.targetEnabled({ name: "sha", isCard: true }, player, targetx);
					})
					.set("ai", (targetx) => get.effect(targetx, { name: "sha" }, player, current))
					.forResult();
				if (!result?.bool || !result.targets?.length) return;
				// 【借刀杀人】singleCard:true → useCard 时引擎自动拆成 event.target=田续、event.addedTarget=出杀目标（player.js:7478）
				const useEvent = current.useCard({ name: "jiedao", isCard: true }, [player, result.targets[0]], "xiaobai_shiqi");
				await useEvent;
				if (!player.isIn()) return;
				// 重置判定：借刀结算子树里唯一的伤害来源就是田续被迫使用的【杀】
				// （对应 FreeKill 的 getActualDamageEvents(… data.card == 被响应的杀)）
				const dealt = (function find(evt) {
					for (const child of evt.childEvents || []) {
						if (child.name == "damage" && child.num > 0 && (!child.source || child.source == player)) return true;
						if (find(child)) return true;
					}
					return false;
				})(useEvent);
				if (dealt) {
					player.restoreSkill("xiaobai_shiqi");
					game.log(player, "重置了", "#g【噬契】");
				}
			},
		},
	},
},

// === 求道 ===
// 字母牌 = 点数 A/J/Q/K，即 1/11/12/13
xiaobai_qiudao: {
	audio: 2,
	trigger: { global: "phaseAfter" },
	filter(event, player) {
		if (!player.isIn()) return false;
		// 本回合（不限回合角色）没有被使用过字母牌。
		// getHistory 取的是「当前回合」的 actionHistory 记录（content.js:4055-4068 每回合为全体角色各推一条），
		// 遍历全体含阵亡角色，与预诫的 xiaobaiYujieSuits 同款
		return !game.players.concat(game.dead).some((current) =>
			(current.getHistory("useCard") || []).some((evt) => evt.card && [1, 11, 12, 13].includes(get.number(evt.card)))
		);
	},
	async cost(event, trigger, player) {
		// ⚠ 本技能不能写 direct: true——引擎对 direct 技能直接 result={bool:true} 进 content
		//   （content.js:3544），cost 根本不执行，cost_data 恒 undefined（get.cards 兜底看 1 张）。
		//   非 direct + cost：引擎直接跑 cost（不弹"是否发动"），chooseControl 的 cancel2 即"放弃发动"。
		// chooseControl 的 result 没有 bool，但引擎会在结算尾部无条件补 index（content.js:7588）；
		// 取消走 cancel2 选项（result.control == "cancel2" → bool=false）
		const result = await player
			.chooseControl("一张", "两张", "三张", "四张", "五张", "cancel2")
			.set("prompt", "求道：你可以观看牌堆顶至多五张牌，使用最后一张牌")
			.set("ai", () => 4) // AI 恒看五张：观看只给自己看、回合外获得无弃牌压力，看的越多潜在收益越大（仅当最后一张是字母牌才有其余牌），恒选1张只会白看
			.forResult();
		event.result = { bool: result.control !== "cancel2", cost_data: result.index + 1 };
	},
	async content(event, trigger, player) {
		const num = event.cost_data;
		// ★ 第二参必须传 true（peek）：看完仍按原序留在牌堆顶。
		//   漏传会把这 n 张牌真的拿走，「其余牌」就不在牌堆里了（get/index.js:3502-3506）
		const cards = get.cards(num, true);
		if (!cards.length) return;
		await player.viewCards("求道：观看牌堆顶" + get.cnNumber(num) + "张牌", cards);
		if (!player.isIn()) return;
		const cardx = cards[cards.length - 1];
		// 使用牌堆里的真实牌（可放弃：目标型走 chooseTarget 可取消、无目标型走 chooseBool 可拒绝；
		// 放弃则整体结束，牌仍留在牌堆顶）。
		// 第三参 false → addCount:false，对齐 Lua 的 bypass_times（不占每回合限用次数）
		const use = await player
			.chooseUseTarget(cardx, "求道：你可以使用" + get.translation(cardx), false)
			.forResult();
		if (!use?.bool || !player.isIn()) return;
		// 只有用出去的牌是字母牌才拿其余牌
		if (![1, 11, 12, 13].includes(get.number(cardx))) return;
		// 其余牌：用掉的那张已被 useCard 移走；若结算中牌堆被洗/被摸走，这里会自动剔除
		const rest = cards.slice(0, -1).filter((card) => (ui.cardPile ? ui.cardPile.contains(card) : get.position(card, true) == "c"));
		if (!rest.length) return;
		await player.gain(rest, "draw");
		if (!player.isIn()) return;
		const gained = rest.filter((card) => player.getCards("h").includes(card));
		if (!gained.length) return;
		// 可将其中任意张置于牌堆底（取消 = 一张都不置底）
		const put = await player
			.chooseCard("h", "求道：你可以将任意张获得的牌置于牌堆底", [1, gained.length], (card) => gained.includes(card))
			.forResult();
		if (put?.bool && put.cards?.length) await game.cardsGotoPile(put.cards);
	},
	ai: {
		result: { player: 1 },
	},
},

// === 毁诉 ===
xiaobai_huisu: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.countCards("h") > 0);
	},
	filterTarget(card, player, target) {
		return target != player && target.countCards("h") > 0;
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		// 奖池：因上一项双方「展示或失去过」的手牌。跨项持久（拼点平局时不清池，滚入下一项）
		let pot = [];
		let win = 0;
		let otherWin = 0;
		// ① 议事：双方各展示一张手牌（展示后留在各自手上，不移走）
		if (player.countCards("h")) {
			const debate = await player.chooseToDebate([player, target]).forResult();
			if (!player.isIn() || !target.isIn()) return;
			for (const color of ["red", "black", "others"]) {
				for (const pair of debate?.[color] || []) {
					const card = pair?.[1];
					if (get.itemtype(card) == "card" && !pot.includes(card)) pot.push(card);
				}
			}
		}
		if (!player.isIn() || !target.isIn()) return;
		// ② 拼点
		let compareEvent = null;
		if (player.canCompare(target)) {
			compareEvent = player.chooseToCompare(target);
			const compare = await compareEvent.forResult();
			if (!player.isIn() || !target.isIn()) return;
			// 赢家自比 num1/num2 判定（result.winner 在平局时缺失；发起者 = num1）
			const winner = compare?.num1 > compare?.num2 ? player : compare?.num2 > compare?.num1 ? target : null;
			if (winner) {
				if (winner == player) win++;
				else otherWin++;
				// 赢家拿走奖池里「不在自己手上」的牌——自己展示的那张还在自己手里，不拿
				const take = pot.filter((card) => !winner.getCards("h").includes(card));
				if (take.length) await winner.gain(take, winner == player ? target : player, "gain2");
				pot = [];
			}
			// ⚠️ 平局（winner 为 nil）时上面整块不执行 → 议事牌留在奖池滚入下一项，与 Lua 一致
			// 拼点牌（此时已进弃牌堆）追加进奖池
			for (const card of [compareEvent.card1, compareEvent.card2]) {
				if (get.itemtype(card) == "card" && get.position(card, true) == "d" && !pot.includes(card)) pot.push(card);
			}
		}
		// ③ 视为使用【决斗】（不绕每回合限用：canUse 先查，useCard 不传 addCount:false）
		if (player.isIn() && target.isIn() && player.canUse({ name: "juedou", isCard: true }, target)) {
			const useEvent = player.useCard({ name: "juedou", isCard: true }, target, "xiaobai_huisu");
			await useEvent;
			let playerHurt = false;
			let targetHurt = false;
			// 决斗里唯一对对方造成伤害的一方为赢家（child.player 是受伤者）
			(function find(evt) {
				for (const child of evt.childEvents || []) {
					if (child.name == "damage" && child.num > 0) {
						if (child.player == player) playerHurt = true;
						if (child.player == target) targetHurt = true;
					}
					find(child);
				}
			})(useEvent);
			if (targetHurt && !playerHurt) {
				win++;
				const take = pot.filter((card) => !player.getCards("h").includes(card));
				if (take.length && player.isIn()) await player.gain(take, "gain2");
			} else if (playerHurt && !targetHurt) {
				otherWin++;
				const take = pot.filter((card) => !target.getCards("h").includes(card));
				if (take.length && target.isIn()) await target.gain(take, "gain2");
			}
		}
		if (!player.isIn()) return;
		// ④ 赢的次数更多 → 可重铸至多三张牌（可放弃）
		if (win > otherWin && player.countCards("h")) {
			const recast = await player
				.chooseCard("he", "毁诉：你可以重铸至多三张牌", [1, 3], lib.filter.cardRecastable)
				.forResult();
			if (recast?.bool && recast.cards?.length) await player.recast(recast.cards);
		}
	},
	ai: {
		order: 5,
		result: { player: 1, target: -1 },
	},
},


// === 履阶 ===
xiaobai_lvjie: {
	audio: 2,
	// ①你造成伤害后（source = 你是伤害来源）②装备牌置入你的装备区后
	trigger: { source: "damage", player: "equipAfter" },
	prompt: "履阶：你可以视为使用一张【树上开花】",
	filter(event, player) {
		// 每轮每项限一次：两项各自独立计数
		if (event.name == "damage") return !player.hasSkill("xiaobai_lvjie_used1");
		return !player.hasSkill("xiaobai_lvjie_used2");
	},
	check(event, player) {
		return player.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		const isDamage = trigger.name == "damage";
		const maxKey = isDamage ? "xiaobai_lvjie_max1" : "xiaobai_lvjie_max2";
		player.addTempSkill(isDamage ? "xiaobai_lvjie_used1" : "xiaobai_lvjie_used2", "roundStart");
		// 视为使用一张【树上开花】（目标为你自己）。【树上开花】本身 toself + selectTarget:-1，
		// 直接 useCard 不查距离，对齐 Lua 的 useVirtualCard("bogus_flower", nil, player, {player}, lvjie.name)
		const useEvent = player.useCard({ name: "kaihua", isCard: true }, player, "xiaobai_lvjie");
		await useEvent;
		// 统计本次【树上开花】结算中你因此摸到的牌
		// （= Lua 里 skillName 为 bogus_flower_skill、toArea 为 PlayerHand 的牌。
		//   卡牌结算事件以牌名作事件名（content.js:9436 的 game.createEvent(event.card.name)），
		//   其下 draw 事件的 result.cards 即此次摸到的牌，用 getParent 限定在本次结算内。
		//   ⚠️ getParent(name) 找不到时返回 {}（真值！），必须传第二参 forced=true 才会返回 undefined）
		let cardNum = 0;
		const collect = (evt) => {
			for (const child of evt.childEvents || []) {
				if (child.name == "draw" && child.player == player && child.getParent("kaihua", true)) {
					cardNum += child.result?.cards?.length || 0;
				}
				collect(child);
			}
		};
		collect(useEvent);
		if (!player.isIn()) return;
		// 「为此前唯一最多」= 严格大于历史最大值 → 摸一张牌并刷新记录
		if (cardNum > player.countMark(maxKey)) {
			player.setMark(maxKey, cardNum, false);
			await player.draw();
		}
		if (!player.isIn()) return;
		// 另一项也以此法摸过至少三张 → 可移动场上一张牌（moveCard 可取消，取消则无事发生）
		if (player.countMark("xiaobai_lvjie_max1") >= 3 && player.countMark("xiaobai_lvjie_max2") >= 3 && player.canMoveCard()) {
			await player.moveCard("履阶：你可以移动场上一张牌");
		}
	},
	subSkill: {
		used1: {
			charlotte: true,
			onremove: true,
		},
		used2: {
			charlotte: true,
			onremove: true,
		},
		max1: {
			charlotte: true,
			mark: true,
			marktext: "履伤",
			intro: {
				name2: "履阶·伤害",
				markcount: (storage, player) => player.countMark("xiaobai_lvjie_max1"),
				content: (storage, player) => "以此法（造成伤害后）获得的牌数最大值：" + player.countMark("xiaobai_lvjie_max1"),
			},
		},
		max2: {
			charlotte: true,
			mark: true,
			marktext: "履备",
			intro: {
				name2: "履阶·装备",
				markcount: (storage, player) => player.countMark("xiaobai_lvjie_max2"),
				content: (storage, player) => "以此法（装备牌置入装备区后）获得的牌数最大值：" + player.countMark("xiaobai_lvjie_max2"),
			},
		},
	},
},

// === 兴族 ===
xiaobai_xingzu: {
	audio: 2,
	forced: true,
	mark: true,
	marktext: "兴",
	// 手牌上限 +1 要作用在「被选中」的角色身上，只能走全局 mod
	// （game.checkMod 会把 lib.skill.global 一并纳入（game/index.js:8493），mod 的第一参即被计算的玩家）
	global: "xiaobai_xingzu_g",
	group: ["xiaobai_xingzu_draw", "xiaobai_xingzu_lose", "xiaobai_xingzu_death", "xiaobai_xingzu_turn"],
	trigger: { global: "gameStart" },
	filter(event, player) {
		return game.hasPlayer((current) => current != player);
	},
	intro: {
		name2: "兴族",
		content(storage, player) {
			const id = player.storage.xiaobai_xingzu_target;
			const target = id == null ? null : game.players.concat(game.dead).find((current) => current.playerid == id);
			return target ? "兴族目标：" + get.translation(target) : "尚未选择兴族目标";
		},
	},
	async content(event, trigger, player) {
		// 锁定技：forced 已跳过「是否发动」，这里的选择本身不可取消
		const result = await player
			.chooseTarget("兴族：选择一名其他角色", lib.filter.notMe, true)
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		const target = result?.targets?.[0];
		if (!target) return;
		player.storage.xiaobai_xingzu_target = target.playerid;
		player.updateMarks("xiaobai_xingzu");
		game.log(player, "选择了", target, "作为「兴族」目标");
	},
	subSkill: {
		// 其摸牌阶段多摸一张牌（妙风发 mia_fengfa 同款：phaseDrawBegin2 改 num）
		draw: {
			charlotte: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: { global: "phaseDrawBegin2" },
			filter(event, player) {
				return !event.numFixed && player.storage.xiaobai_xingzu_target == event.player.playerid;
			},
			content(event, trigger, player) {
				trigger.num++;
			},
		},
		// 其因弃置或打出而失去牌后，你摸一张牌（每回合至多摸5张）
		// 弃置/打出在引擎里分别是 discard 事件与 respond 事件，各自派发 discardAfter / respondAfter
		lose: {
			charlotte: true,
			forced: true,
			name: "兴族",
			trigger: { global: ["discardAfter", "respondAfter"] },
			filter(event, player) {
				if (player.countMark("xiaobai_xingzu_turn") >= 5) return false;
				if (player.storage.xiaobai_xingzu_target != event.player.playerid) return false;
				return (event.cards || []).length > 0;
			},
			async content(event, trigger, player) {
				player.addMark("xiaobai_xingzu_turn", 1, false);
				await player.draw();
			},
		},
		// 其死亡后，你直接死亡（player.die() 是直接死亡，不经濒死求桃，对齐 room:killPlayer）
		death: {
			charlotte: true,
			forced: true,
			name: "兴族",
			trigger: { global: "dieAfter" },
			filter(event, player) {
				return player.storage.xiaobai_xingzu_target == event.player.playerid;
			},
			async content(event, trigger, player) {
				game.log(player, "因「兴族」目标", trigger.player, "的死亡而死亡");
				await player.die();
			},
		},
		// 每回合至多摸5张：对齐 FreeKill 的 -turn 后缀标记（回合结束后清除）
		turn: {
			charlotte: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: { global: "phaseAfter" },
			filter(event, player) {
				return player.countMark("xiaobai_xingzu_turn") > 0;
			},
			content(event, trigger, player) {
				player.setMark("xiaobai_xingzu_turn", 0, false);
			},
		},
	},
},
// 兴族的手牌上限 +1：全局技能，只对「被某名兴族持有者选中」的角色生效。
// 对齐 Lua 的 maxcards correct_func：只数**存活**的兴族持有者（alive_players），
// 所以用 game.countPlayer（内部按 isOut() 过滤），不是 hasPlayer 的一次性判断。
xiaobai_xingzu_g: {
	charlotte: true,
	mod: {
		maxHandcard(player, num) {
			if (!game.players || !game.players.length) return;
			const count = game.countPlayer((current) => current.hasSkill("xiaobai_xingzu") && current.storage.xiaobai_xingzu_target == player.playerid);
			if (count > 0) return num + count;
		},
	},
},

// === 权宜 ===
xiaobai_quanyi: {
	audio: 2,
	// 你的上家回合结束时（phaseAfter 的 event.player 就是回合角色；
	// getPrevious/getNext 走的是**活人链**——arrangePlayers 只在 game.players 之间维护 next/previous，
	// 死亡时会把 player.next/previous 互相接上，所以等价于 FreeKill 的 getLastAlive/getNextAlive）
	trigger: { global: "phaseAfter" },
	prompt(event, player) {
		const next = player.getNext();
		return next ? `权宜：你可以与${get.translation(next)}交换位次` : "权宜：你可以与下家交换位次";
	},
	filter(event, player) {
		// 每轮限一次（Lua: usedSkillTimes(quanyi.name, Player.HistoryRound) < 1）
		if (!player.isIn() || player.hasSkill("xiaobai_quanyi_used")) return false;
		const next = player.getNext();
		if (!next || !next.isIn()) return false;
		return event.player == player.getPrevious();
	},
	async content(event, trigger, player) {
		player.addTempSkill("xiaobai_quanyi_used", "roundStart");
		// ⚠️ game.swapSeat 会调 game.arrangePlayers() 重排座位链，
		// 换位后 getNext() 就变了 —— 所有引用必须在换位前取好
		const next = player.getNext();
		if (!next?.isIn()) return;
		// 换位标记打在**对方**身上：对方身上已有此标记 = 「曾与该角色交换过位置」
		// （Lua 的 room:addPlayerMark(next, "@@xiaobai__quanyi")）
		const did = next.hasSkill("xiaobai_quanyi_swapped");
		// 官方换位写法：game.broadcastAll 包 game.swapSeat（baiyi 败移 mobile/skill.js:25897、shiji.js:4187）
		game.broadcastAll((t1, t2) => game.swapSeat(t1, t2), player, next);
		next.addSkill("xiaobai_quanyi_swapped");
		if (!player.isIn()) return;
		// 视为使用一张「未以此法使用过」的基本牌或普通锦囊牌。
		// 候选 = 基本牌 + 普通锦囊（get.type 里延时锦囊是 "delay"，自然被排除），
		// 且**当前确实可用**（对齐 Lua 的 Fk:getAllCardNames("bt") + getViewAsCardNames 的 canUse 过滤）。
		// ⚠️ 可用性判定一律走 player.hasUseTarget —— 闪/无懈无 enable、满血桃 enable 为假，都会被正确排除
		const record = player.storage.xiaobai_quanyi_record || [];
		const list = get.inpileVCardList((info) => {
			if (info[0] != "basic" && info[0] != "trick") return false;
			if (record.includes(info[2])) return false;
			return player.hasUseTarget(get.autoViewAs({ name: info[2], nature: info[3], isCard: true }));
		});
		if (list.length) {
			const pick = await player
				.chooseButton(["权宜：你可以视为使用一张基本牌或普通锦囊牌", [list, "vcard"]])
				.set("ai", (button) => get.player().getUseValue(get.autoViewAs({ name: button.link[2], nature: button.link[3], isCard: true })))
				.forResult();
			if (pick?.bool && pick.links?.length) {
				const link = pick.links[0];
				const vcard = get.autoViewAs({ name: link[2], nature: link[3], isCard: true });
				// chooseUseTarget 第三参 false = addCount:false（不占次数，对齐 Lua 的 skillName 出牌）；
				// 非 forced，取消 → result.bool = false；牌不可用时引擎内部直接返回 {bool:false}，不会卡住
				const useRes = await player.chooseUseTarget(vcard, `权宜：是否使用${get.translation(vcard)}`, false).forResult();
				if (useRes?.bool) {
					// 确认使用后才记录牌名（放弃使用不记录，下次还能选它）
					record.push(link[2]);
					player.storage.xiaobai_quanyi_record = record;
				}
			}
		}
		if (!player.isIn()) return;
		// 与同一人重复换位：把「所有已用过的牌名」逐个再问一遍（每个可放弃），然后失去此技能
		if (did) {
			for (const name of (player.storage.xiaobai_quanyi_record || []).slice()) {
				if (!player.isIn()) return;
				const vcard = get.autoViewAs({ name, isCard: true });
				if (!player.hasUseTarget(vcard)) continue;
				await player.chooseUseTarget(vcard, `权宜：是否视为使用【${get.translation(name)}】`, false).forResult();
			}
			if (player.isIn()) {
				player.removeSkillLog("xiaobai_quanyi");
				delete player.storage.xiaobai_quanyi_record;
			}
		}
	},
	subSkill: {
		// 每轮限一次标记（动态挂载，绝不放进 group，否则 hasSkill 恒真 → addTempSkill 直接 return）
		used: {
			charlotte: true,
		},
		// 对方身上的「已换位」标记（Lua 的 @@xiaobai__quanyi）
		swapped: {
			charlotte: true,
			mark: true,
			marktext: "宜",
			intro: { content: "曾因〖权宜〗与你交换过位置" },
		},
	},
	ai: { result: { player: 1 } },
},

// === 权倾 ===
xiaobai_quanqing: {
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "water",
	// 议事结束后（原生参照 jsrgfumou character/jsrg.js:2663）
	trigger: { global: "chooseToDebateAfter" },
	filter(event, player) {
		if (!player.isIn() || player.awakenedSkills.includes("xiaobai_quanqing")) return false;
		const result = event.result;
		if (!result) return false;
		// 自己的意见必须是红/黑（Lua: table.contains({"red","black"}, results[player].opinion)）
		const myColor = ["red", "black"].find((key) => (result[key] || []).some((pair) => pair[0] == player));
		if (!myColor) return false;
		// 存在「意见不同、且展示牌仍在手牌中」的其他参与者
		return (result.opinions || []).some((key) => {
			if (key == myColor) return false;
			return (result[key] || []).some((pair) => pair[0] != player && pair[0]?.isIn() && get.itemtype(pair[1]) == "card" && get.position(pair[1]) == "h");
		});
	},
	async content(event, trigger, player) {
		player.awakenSkill("xiaobai_quanqing");
		const result = trigger.result;
		const myColor = ["red", "black"].find((key) => (result[key] || []).some((pair) => pair[0] == player));
		if (!myColor) return;
		// 收集所有「与自己意见不同」的展示牌（按持有者分组，只取仍在手牌里的）
		// 议事按颜色分组：result.red / result.black / result.others = [[角色, 展示的牌], ...]，
		// result.opinions 是完整颜色列表（debateIgnore 为假时还会有额外颜色组），照它遍历最稳
		const groups = [];
		for (const key of result.opinions || []) {
			if (key == myColor) continue;
			for (const pair of result[key] || []) {
				const [owner, card] = pair;
				if (owner == player || !owner?.isIn()) continue;
				if (get.itemtype(card) != "card" || get.position(card) != "h") continue;
				const group = groups.find((i) => i.owner == owner);
				if (group) group.cards.push(card);
				else groups.push({ owner, cards: [card] });
			}
		}
		if (!groups.length) return;
		// 由持有者弃置、归因于你（discard 第二参 = discarder），对齐 Lua 的 room:throwCard(cards, name, p, player)
		let num = 0;
		for (const { owner, cards } of groups) {
			player.line(owner, "green");
			await owner.discard(cards, player);
			num += cards.length;
		}
		if (num > 0 && player.isIn()) await player.draw(num);
	},
	ai: { result: { player: 1 } },
},

// === 施贫 ===
xiaobai_shipin: {
	audio: 2,
	group: ["xiaobai_shipin_refresh"],
	// 延时拼点可视化：把「当前所有尚未公开的延时拼点组」挂在施贫的技能拥有者身上。
	// 拼点牌在移出区是**扣置**的，故只显示「每张拼点牌的归属者名字」，不露牌面。
	mark: true,
	marktext: "拼",
	intro: {
		content(storage, player) {
			const list = lib.xiaobaiDelayCompares();
			if (!list.length) return "当前没有待公开的延时拼点。";
			// 每组两张拼点牌，各标一个归属者名字 tag（bluetext 是原生 dialog 里惯用的强调类）
			const groups = list.map((evt, i) => {
				const nameOf = (who) => (get.itemtype(who) == "player" ? get.translation(who) : "牌堆");
				return `第${get.cnNumber(i + 1)}组：<span class="bluetext">${nameOf(evt.player)}</span> / <span class="bluetext">${nameOf(evt.target)}</span>`;
			});
			return `当前延时拼点（共${get.cnNumber(list.length)}组，每组两个名字分别是两张拼点牌的归属者）：<br>${groups.join("<br>")}`;
		},
	},
	// 你使用非伤害牌后。
	// ⚠️ Lua 用的是 fk.CardUsing（= 牌效果结算**前**，对应无名杀的 useCard2）；
	// 这里按技能描述「使用非伤害牌后」用 useCardAfter —— 避免在牌结算中途把角色移出游戏，
	// 导致同一张牌的后续目标结算时场上状态已变（例如多目标锦囊的其余目标）。
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		if (!player.isIn() || !event.card) return false;
		// 非伤害牌（杀/决斗/南蛮/万箭等 ai.tag.damage 为真 → 排除）
		if (get.tag(event.card, "damage")) return false;
		// 至少要有一名「非当前回合」的其他存活角色
		return game.hasPlayer((current) => current != _status.currentPhase);
	},
	async cost(event, trigger, player) {
		// 「体力值或手牌数最低」的比较范围是**全部存活角色**（含当前回合角色），
		// 只有选择对象排除当前回合角色（Lua: table.every(room.alive_players, ...) + cp ~= room.current）
		const players = game.filterPlayer();
		const minHp = Math.min(...players.map((current) => current.hp));
		const minHand = Math.min(...players.map((current) => current.countCards("h")));
		const targets = players.filter((current) => current != _status.currentPhase && (current.hp == minHp || current.countCards("h") == minHand));
		if (!targets.length) {
			event.result = { bool: false };
			return;
		}
		const res = await player
			.chooseTarget("施贫：令一名体力值或手牌数最低的非当前回合角色摸一张牌", (card, player2, target) => targets.includes(target))
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		event.result = res?.bool && res.targets?.length ? res : { bool: false };
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		await target.draw(1);
		if (!target.isIn()) return;
		// 枚举本回合**未公开**的延时拼点（统一走 lib.xiaobaiDelayCompares，与 mark 用同一份数据源）
		const pendings = lib.xiaobaiDelayCompares();
		// 顺手把 mark 刷成当前状态（useCardAfter 不在 refresh 子技能的刷新点里，
		// 而玩家正是在此刻要挑「替换哪一组」，必须保证 mark 与待选列表一致）
		lib.xiaobaiShipinSyncMark(player);
		// 「其未参与」= 目标既不是该拼点的发起者、也不是对方。
		// ⚠️ 还要至少有一名**存活**的参与角色才谈得上「替换」——
		// 用 get.itemtype 判角色（拼点另一方可能是字符串 "cardPile"，直接调 .isIn() 会抛异常）
		const usable = pendings.filter((evt) => evt.player != target && evt.target != target && [evt.player, evt.target].some((who) => get.itemtype(who) == "player" && who.isIn()));
		// 名字 tag：拼点牌可能属于「牌堆」（compareWithCardPile），那一侧没有归属角色
		const nameOf = (who) => (get.itemtype(who) == "player" ? get.translation(who) : "牌堆");
		// 目标选择：替换延时拼点牌 / 本回合移出游戏
		// ⚠️ 一旦进入「令其选择一项」（即 `content` 跑到这里），该角色**必须**二选一、没有取消：
		// 有可替换的组 → chooseControl 不带 cancel2 且 forced；没有组可换 → 只有「移出游戏」一条路，
		// 直接用 `direct: true` 的 chooseBool（不弹询问、不留取消按钮），保证是「不选也要移出」而不是「可选可不选」。
		let choice;
		if (usable.length) {
			const ctrl = await target
				.chooseControl("替换延时拼点牌", "本回合移出游戏")
				.set("forced", true)
				.set("prompt", "施贫：请选择一项")
				.set("ai", () => "本回合移出游戏")
				.forResult();
			choice = ctrl?.control;
		} else {
			const go = await target.chooseBool("施贫：本回合移出游戏").set("direct", true).forResult();
			choice = go?.bool ? "本回合移出游戏" : null;
		}
		// 一旦选了「替换」，就必须一路走完：下面所有分支都只有「继续」没有「取消」。
		// 下面的每个 return 都是**防崩保护**（数据异常/可能被别的技能挤成空列表），不是玩家的取消选项。
		if (!choice) return;
		if (choice == "本回合移出游戏") {
			// 调虎离山同款：不传 expire → 引擎默认本回合结束（phaseAfter / phaseBeforeStart）自动过期
			target.addTempSkill("xiaobai_shipin_out");
			return;
		}
		// 替换三步走：① 选「哪一组延时拼点」→ ② 选「替换这一组里哪一方的拼点牌」→ ③ 选自己一张手牌。
		// ① 的按钮上直接标出该组的双方，所以「同一角色出现在多组」时也不会分不清是哪一组
		// （旧版直接按角色 find 第一组，会漏掉后续的组）。
		const groupControls = usable.map((evt, i) => `第${get.cnNumber(i + 1)}组：${nameOf(evt.player)}、${nameOf(evt.target)}`);
		const groupRes = await target
			.chooseControl(groupControls)
			.set("forced", true)
			.set("prompt", "施贫：选择要替换的延时拼点组")
			.set("ai", () => {
				// 目标视角：挑「其中一方与自己关系最好」的那组
				const me = get.player();
				let best = 0,
					bestAtt = -Infinity;
				usable.forEach((evt, i) => {
					for (const who of [evt.player, evt.target]) {
						if (get.itemtype(who) != "player") continue;
						const att = get.attitude(me, who);
						if (att > bestAtt) {
							bestAtt = att;
							best = i;
						}
					}
				});
				return groupControls[best];
			})
			.forResult();
		const cmpEvt = usable[groupControls.indexOf(groupRes.control)];
		if (!cmpEvt) return;
		// ② 只列真实角色（「牌堆」那一侧无从替换）
		const sides = [cmpEvt.player, cmpEvt.target].filter((who) => get.itemtype(who) == "player" && who.isIn());
		if (!sides.length) return;
		// chooseControl 返回的是**选项字符串**，所以两侧重名（同角色镜像局）时按钮会撞在一起 →
		// 只有真撞了才补「发起/对方」后缀消歧，平时保持干净的名字
		let sideLabels = sides.map((who) => get.translation(who));
		if (new Set(sideLabels).size != sideLabels.length) {
			sideLabels = sides.map((who) => `${get.translation(who)}（${who == cmpEvt.player ? "发起" : "对方"}）`);
		}
		const sideControls = sideLabels.slice(0);
		const sideRes = await target
			.chooseControl(sideControls)
			.set("forced", true)
			.set("prompt", `施贫：选择要替换谁的拼点牌（${nameOf(cmpEvt.player)} 对 ${nameOf(cmpEvt.target)}）`)
			.set("ai", () => {
				const me = get.player();
				let best = 0,
					bestAtt = -Infinity;
				sides.forEach((who, i) => {
					const att = get.attitude(me, who);
					if (att > bestAtt) {
						bestAtt = att;
						best = i;
					}
				});
				return sideControls[best];
			})
			.forResult();
		const participant = sides[sideControls.indexOf(sideRes.control)];
		if (!participant) return;
		const isInitiator = cmpEvt.player == participant;
		const oldCard = isInitiator ? cmpEvt.card1 : cmpEvt.card2;
		const cardPick = await target.chooseCard("h", "施贫：选择用于替换的一张手牌", true).forResult();
		const newCard = cardPick?.cards?.[0];
		if (!newCard) return;
		// 新牌进移出区（与延时拼点牌同区，position "s"）
		await target.lose([newCard], ui.special);
		// 替换即改事件上的拼点牌字段：
		// chooseToCompareEffect 是**运行时**才从 parentEvent 拷 card1/card2 并重算点数
		// （content.js:6553），所以改字段即完成替换。
		if (isInitiator) cmpEvt.card1 = newCard;
		else cmpEvt.card2 = newCard;
		// ⚠️ lose_list 必须同步改：chooseToCompareEffect 算点数时用
		// `getNum(card)` 遍历 lose_list 找归属者（content.js:6581-6588），
		// 不改的话新牌找不到归属 → 退化成 `get.number(card, false)`，该角色的点数加成会丢
		if (Array.isArray(cmpEvt.lose_list)) {
			for (const item of cmpEvt.lose_list) {
				if (Array.isArray(item?.[1]) && item[1].includes(oldCard)) {
					item[1] = item[1].map((card) => (card === oldCard ? newCard : card));
				}
			}
		}
		// 被替换掉的旧拼点牌进入弃牌堆
		await game.cardsDiscard([oldCard]);
	},
	subSkill: {
		// mark 刷新：`intro.content` 本身是**惰性求值**的（悬停时才调 get.storageintro →
		// `type(content, player, skill)`，get/index.js:4893-4900），所以这里只需维护**标记的存在性**：
		// 有待公开的组 → markSkill，没有 → unmarkSkill。
		// 刷新点：① loseAsyncAfter —— 新延时拼点产生（isDelay 分支里的 chooseToCompareLose 走 loseAsync）、
		//   或被施贫替换拼点牌；② chooseToCompareAfter —— 一组被公开；
		//   ③ phaseEnd —— 引擎清理未公开的扣置牌；④ phaseBegin —— 新回合 globalHistory 重建。
		refresh: {
			charlotte: true,
			sub: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { global: ["loseAsyncAfter", "chooseToCompareAfter", "phaseEnd", "phaseBegin"] },
			content(event, trigger, player) {
				lib.xiaobaiShipinSyncMark(player);
			},
		},
		// 本回合移出游戏：调虎离山同款（group: "undist" → hasSkill("undist") 为真 →
		// getNext/getPrevious 断开、inRange/targetInRange 为假、targetEnabled2 因 isOut() 拒绝指定目标），
		// 另加三处「数值归零」保护，全部随 tempSkill 到回合结束一起失效
		out: {
			charlotte: true,
			group: "undist",
			mark: true,
			marktext: "贫",
			intro: { content: "本回合移出游戏：不可被指定为目标，受到的伤害、回复与失去体力均无效。" },
			trigger: { player: ["damageBegin4", "recoverBegin", "loseHpBegin"] },
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				// 三者的 content 都在 Begin 之后才读 num（damage 的 num 在 damageBegin4 之后解构），
				// 所以 Begin 里归零即可
				trigger.num = 0;
			},
			init(player) {
				if (player.isIn()) {
					game.broadcastAll((player2) => {
						player2.classList.add("out");
					}, player);
					game.log(player, "移出了游戏");
				}
			},
			onremove(player) {
				if (player.isOut()) {
					game.broadcastAll((player2) => {
						player2.classList.remove("out");
					}, player);
					game.log(player, "移回了游戏");
				}
			},
		},
	},
	ai: { result: { player: 1 } },
},

// === 乾象 ===
xiaobai_qianxiang: {
	audio: 2,
	// 一名角色回合结束时（Lua 的 fk.TurnEnd；on_cost = Util.TrueFunc → 不询问是否发动，
	// 用 direct: true 跳过询问又不误判成锁定技）
	trigger: { global: "phaseAfter" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		const { lost, gained } = lib.skill.xiaobai_qianxiang.count(player);
		return lost > 0 && gained > 0;
	},
	async content(event, trigger, player) {
		const { lost, gained } = lib.skill.xiaobai_qianxiang.count(player);
		let X = Math.abs(lost - gained);
		if (X > 5) X = 5;
		// X = 0 的退化分支：获得数 = 失去数 ≠ 0 → 可弃置全部手牌
		if (X == 0) {
			const go = await player.chooseBool("乾象：是否将你的手牌数调整为0？").set("ai", () => false).forResult();
			if (go?.bool && player.countCards("h")) await player.discard(player.getCards("h"));
			return;
		}
		// peek 牌堆顶 X 张（第二参 true = 只看不拿，对齐 FreeKill 的 room:getNCards 只切片不抽走）
		const cards = get.cards(X, true);
		if (!cards.length) return;
		const pick = await player
			.chooseCardButton(cards, "乾象：你可以使用其中一张牌")
			.set("filterButton", (button) => get.player().hasUseTarget(button.link))
			.set("ai", (button) => get.player().getUseValue(button.link))
			.forResult();
		const picked = pick?.bool && pick.links?.length ? pick.links[0] : null;
		if (picked) {
			// 第三参 false = addCount:false（不占次数，对齐 Lua 的 bypass_times/extraUse）
			const useRes = await player.chooseUseTarget(picked, `乾象：是否使用${get.translation(picked)}`, false).forResult();
			if (useRes?.bool) return; // 已以此法使用牌 → 不再调整手牌
		}
		// 未以此法使用牌 → 可将手牌数调整为 X
		const num = X - player.countCards("h");
		if (!num) return;
		const go = await player
			.chooseBool(`乾象：是否将你的手牌数调整为${get.cnNumber(X)}张？`)
			.set("ai", () => num > 0)
			.forResult();
		if (!go?.bool) return;
		if (num > 0) await player.draw(num);
		else await player.chooseToDiscard(-num, "h", true).forResult();
	},
	// 本回合「失去 / 获得」牌的计数（对齐 FreeKill 的 AfterCardsMove refresh：只看手牌区与装备区的进出）
	// getHistory 本身就是**本回合**范围（引擎每回合开始重建 actionHistory），无需子技能清零
	count(player) {
		let lost = 0;
		let gained = 0;
		for (const evt of player.getHistory("lose") || []) {
			lost += (evt.hs?.length || 0) + (evt.es?.length || 0);
			// 装备牌置入装备区时，引擎在 equip 里先建一条 type:"equip" 的 lose（牌离开手牌/装备区），
			// 而「进入装备区」不入任何历史 → 借这条 lose 补记，保证两侧同步（否则手牌→装备会凭空多算 1 点差值）
			if (evt.type == "equip") gained += evt.cards?.length || 0;
		}
		for (const evt of player.getHistory("gain") || []) {
			gained += (evt.cards || []).length;
		}
		return { lost, gained };
	},
	ai: { result: { player: 1 } },
},

// === 擅恣 ===
xiaobai_shanzi: {
	audio: 2,
	// 每轮开始时（roundStart 在 phaseLoop 给全员补好 seatNum 之后才派发，所以一号位一定查得到）
	trigger: { global: "roundStart" },
	filter(event, player) {
		if (!player.isIn()) return false;
		const first = game.findPlayer((current) => current.getSeatNum() == 1);
		if (!first) return false;
		// 一号位是别人时，其必须手牌/装备区有牌才能交（对齐 Lua 的 not first:isNude()）
		return first == player || first.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		const first = game.findPlayer((current) => current.getSeatNum() == 1);
		if (!first) return;
		if (first != player) {
			// Lua 的 askToChooseCard(flag "he") + obtainCard(ReasonGive) → noname 的 give
			const res = await first.chooseCard("he", `擅恣：交给${get.translation(player)}一张牌`, true).forResult();
			if (res?.cards?.length) await first.give(res.cards, player);
		}
		if (!player.isIn()) return;
		// 手牌数比较发生在**收牌之后**（Lua 原样）；「为全场最多」= 没有人比赵娆多（并列也算）
		if (!game.hasPlayer((current) => current != player && current.countCards("h") > player.countCards("h"))) {
			// addTempSkill 的 expire 用 "roundStart" 与 trigger 同名是安全的：
			// GameEvent.trigger 里先清 tempSkill 再派发 hook（gameEvent.js:541-579），所以下轮开始时会先过期再重新授予
			if (!player.hasSkill("xiaobai_shanzi_feiyang")) player.addTempSkill("xiaobai_shanzi_feiyang", "roundStart");
			if (!player.hasSkill("xiaobai_shanzi_bahu")) player.addTempSkill("xiaobai_shanzi_bahu", "roundStart");
			return;
		}
		// 不为最多 → 由**一号位**决定是否令「权倾」视为未发动过（仅当权倾已发动过）
		if (!player.awakenedSkills.includes("xiaobai_quanqing")) return;
		const go = await first
			.chooseBool(`擅恣：是否令${get.translation(player)}的〖权倾〗视为未发动过？`)
			.set("ai", () => get.attitude(first, player) < 0)
			.forResult();
		if (go?.bool) player.restoreSkill("xiaobai_quanqing");
	},
	subSkill: {
		// 飞扬：对齐 FreeKill 的 m_feiyang（不是斗地主的 feiyang）——
		// 判定阶段开始时，弃置**两张手牌**，然后弃置自己判定区的**一张**牌
		feiyang: {
			name: "飞扬",
			trigger: { player: "phaseJudgeBegin" },
			filter(event, player) {
				return player.countCards("h") >= 2 && player.countCards("j") > 0;
			},
			async cost(event, trigger, player) {
				event.result = await player
					.chooseToDiscard(2, "h", "飞扬：你可以弃置两张手牌，然后弃置判定区的一张牌")
					.set("ai", (card) => 9 - get.value(card))
					.forResult();
			},
			async content(event, trigger, player) {
				if (event.cards?.length) await player.discard(event.cards);
				if (player.isIn() && player.countCards("j")) await player.discardPlayerCard(player, "j", true, 1);
			},
		},
		// 跋扈：对齐 FreeKill 的 m_bahu —— 锁定技，准备阶段摸一张牌；出牌阶段可以多使用一张【杀】
		// （lib.filter.cardUsable 对 updateUsable: "phaseUse" 的牌只在出牌阶段计数，故这里无需再加阶段判断）
		bahu: {
			name: "跋扈",
			trigger: { player: "phaseZhunbeiBegin" },
			forced: true,
			content(event, trigger, player) {
				player.draw();
			},
			mod: {
				cardUsable(card, player, num) {
					if (card.name == "sha") return num + 1;
				},
			},
		},
	},
	ai: { result: { player: 1 } },
},

// === 怀烈 ===
xiaobai_huailie: {
	audio: 2,
	// 契定技：引擎原生支持（get.is.qidingSkill / get.is.locked + intro.content "qidingSkill"）。
	// 状态存在 player.storage.xiaobai_huailie，由 player.awakenQidingSkill 置真。
	// 参照原生 sxrmqishi / sxrmdancui（character/sxrm.js:843 / 1597）
	qidingSkill(skill, player) {
		return !player?.storage?.xiaobai_huailie;
	},
	locked(skill, player) {
		return Boolean(player?.storage?.xiaobai_huailie);
	},
	// 【杀】的实体牌从结算区 flush 进弃牌堆时派发 cardsDiscardAfter
	// （useCard content → cardsGotoOrdering → orderingDiscard → game.cardsDiscard，父链上 useCard 可达）
	trigger: { global: "cardsDiscardAfter" },
	filter(event, player) {
		if (!player.isIn()) return false;
		const useEvent = event.getParent("useCard", true);
		if (!useEvent || get.name(useEvent.card) != "sha") return false;
		// 该【杀】的实体牌（转化杀取 useEvent.cards 里的实体牌，不能用牌名判，否则转化杀会被漏掉）
		const useCards = useEvent.cards?.length ? useEvent.cards : useEvent.card?.cards || [];
		if (!useCards.some((card) => (event.cards || []).includes(card) && get.position(card, true) == "d")) return false;
		// 同一张【杀】对同一名怀烈只结算一次
		if ((useEvent.xiaobai_huailie_resolved || []).includes(player.playerid)) return false;
		if (!lib.skill.xiaobai_huailie.relevant(useEvent, player)) return false;
		// 未造成任何伤害（子事件树里没有 num > 0 的 damage；被闪挡掉的才算）
		let hurt = false;
		const scan = (evt) => {
			for (const child of evt.childEvents || []) {
				if (child.name == "damage" && child.num > 0) hurt = true;
				scan(child);
			}
		};
		scan(useEvent);
		if (hurt) return false;
		// 可行性：有未明置的♥手牌，或还有可执行的代价项（全失效且无♥ → 不触发）
		if (player.countCards("h", (card) => get.suit(card) == "heart" && !get.is.shownCard(card))) return true;
		const disabled = player.storage.xiaobai_huailie_disabled || [];
		if (!disabled.includes("recast") && player.countCards("he") >= 3) return true;
		if (!disabled.includes("draw")) return true;
		if (!disabled.includes("obtain") && game.hasPlayer((current) => current.countCards("ej") > 0)) return true;
		return false;
	},
	async cost(event, trigger, player) {
		const useEvent = trigger.getParent("useCard", true);
		const shaCards = (event.cards || []).filter((card) => get.position(card, true) == "d");
		const contracted = Boolean(player.storage.xiaobai_huailie);
		const hearts = player.getCards("h", (card) => get.suit(card) == "heart" && !get.is.shownCard(card));
		let heart = null;
		let choice = null;
		if (hearts.length) {
			// 契定前可取消；契定后不可取消（Lua: cancelable = not contracted）
			const res = await player
				.chooseCard("h", "怀烈：明置一张♥手牌，然后获得此【杀】", contracted)
				.set("filterCard", (card) => hearts.includes(card))
				.forResult();
			if (res?.cards?.length) heart = res.cards[0];
			else if (contracted) heart = hearts[0];
			else {
				event.result = { bool: false };
				return;
			}
		}
		if (!heart) {
			const disabled = player.storage.xiaobai_huailie_disabled || [];
			const options = [];
			if (!disabled.includes("recast") && player.countCards("he") >= 3) options.push("recast");
			if (!disabled.includes("draw")) options.push("draw");
			if (!disabled.includes("obtain") && game.hasPlayer((current) => current.countCards("ej") > 0)) options.push("obtain");
			if (!options.length) {
				event.result = { bool: false };
				return;
			}
			const names = { recast: "重铸三张牌", draw: "摸两张牌", obtain: "获得场上一张牌" };
			const controls = options.map((key) => names[key]);
			if (!contracted) controls.push("cancel2");
			const ctrl = await player
				.chooseControl(controls)
				.set("prompt", "怀烈：选择一项，随后尝试明置一张♥手牌并获得此【杀】")
				.set("ai", () => 0)
				.forResult();
			if (!ctrl?.control || ctrl.control == "cancel2") {
				event.result = { bool: false };
				return;
			}
			choice = options[ctrl.index];
		}
		event.result = { bool: true, useEvent, shaCards, heart, choice };
	},
	async content(event, trigger, player) {
		const { useEvent, shaCards, heart, choice } = event.result;
		useEvent.xiaobai_huailie_resolved ||= [];
		useEvent.xiaobai_huailie_resolved.push(player.playerid);
		// 契定：此后明置不可取消、无放弃项，标签变「锁定技」、描述去掉「可以」
		player.awakenQidingSkill("xiaobai_huailie");
		let shown = heart;
		if (shown) {
			await player.addShownCards([shown], "visible_xiaobai_huailie");
		} else {
			if (choice == "recast") {
				const res = await player.chooseCard({ position: "he", prompt: "怀烈：重铸三张牌", selectCard: 3, forced: true }).forResult();
				if (res?.cards?.length) await player.recast(res.cards);
			} else if (choice == "draw") {
				await player.draw(2);
			} else if (choice == "obtain") {
				const tp = await player
					.chooseTarget("怀烈：选择一名场上有牌的角色", (card, player2, targetx) => targetx.countCards("ej") > 0)
					.forResult();
				const targetx = tp?.targets?.[0];
				if (targetx) await player.gainPlayerCard({ target: targetx, position: "ej", forced: true });
			}
			if (!player.isIn()) return;
			// 代价执行后重试明置♥（此时不可取消）
			const hearts = player.getCards("h", (card) => get.suit(card) == "heart" && !get.is.shownCard(card));
			if (hearts.length) {
				const res = await player
					.chooseCard("h", "怀烈：明置一张♥手牌", true)
					.set("filterCard", (card) => hearts.includes(card))
					.forResult();
				shown = res?.cards?.[0] || hearts[0];
				await player.addShownCards([shown], "visible_xiaobai_huailie");
			}
			if (!shown) {
				// 依然不能明置 → 该代价项整局失效 + 失去1点体力
				(player.storage.xiaobai_huailie_disabled ||= []).push(choice);
				await player.loseHp(1);
				return;
			}
		}
		const gainable = shaCards.filter((card) => get.position(card, true) == "d");
		if (gainable.length && player.isIn()) await player.gain(gainable, "gain2");
	},
	// 「指定或途经」：沿座位链（getNext/getPrevious 走活人链）取从使用者到每个目标的**较短弧**，
	// 刘琨在该弧上即算途经；步数相等时两个方向都算。对齐 huailie.lua:53-81
	relevant(useEvent, player) {
		const from = useEvent.player;
		if (!from || !from.isIn()) return false;
		const targets = useEvent.targets || [];
		if (targets.includes(player)) return true;
		for (const to of targets) {
			if (to == from || !to.isIn()) continue;
			let clockwise = false;
			let counterclockwise = false;
			let cwSteps = 1;
			let ccwSteps = 1;
			let current = from.getNext();
			while (current && current != from) {
				if (current == player) clockwise = true;
				if (current == to) break;
				current = current.getNext();
				cwSteps++;
			}
			current = from.getPrevious();
			while (current && current != from) {
				if (current == player) counterclockwise = true;
				if (current == to) break;
				current = current.getPrevious();
				ccwSteps++;
			}
			if ((cwSteps < ccwSteps && clockwise) || (cwSteps > ccwSteps && counterclockwise) || (cwSteps == ccwSteps && (clockwise || counterclockwise))) return true;
		}
		return false;
	},
	mark: true,
	intro: { content: "qidingSkill" },
	ai: { result: { player: 1 } },
},

// === 柳隐 ===
xiaobai_jinwei: {
	audio: 2,
	trigger: { global: "useCardBegin" },
	filter(event, player) {
		if (!player.isIn()) return false;
		// 任何角色使用【闪】（含响应杀/万箭时，闪必为响应使用）
		if (get.name(event.card) == "shan") return true;
		// 翻至正面后的扩展分支：无效任意基本牌或普通锦囊牌（排除响应使用，对齐 FreeKill 仅监听 CardUsing）
		if (!player.hasSkill("xiaobai_jinwei_on")) return false;
		if (event.respondTo && event.respondTo.length) return false;
		const type = get.type(event.card);
		return type == "basic" || type == "trick";
	},
	async content(event, trigger, player) {
		await player.turnOver();
		if (!player.isIn()) return;
		if (!player.isTurnedOver()) {
			// 武将牌因此翻至正面：本回合可继续无效基本牌或普通锦囊牌
			player.addTempSkill("xiaobai_jinwei_on", "phaseAfter");
		}
		if (get.name(trigger.card) == "shan") {
			// 响应中的闪：令宿主 chooseToUse 判定为未响应（杀结算读 result.bool，standard.js:153 isShaned）
			const chooseEvt = trigger.getParent("chooseToUse");
			if (chooseEvt?.result) chooseEvt.result.bool = false;
		}
		// 无效本次使用（无懈同款机制：untrigger + finish，content 不再执行）
		trigger.neutralize();
	},
	ai: {
		order: 8.5,
		result: {
			player(player) {
				const evt = get.event();
				if (!evt?.card) return 0;
				if (get.name(evt.card) == "shan") {
					// 无效敌人的闪（其将承受杀/万箭的伤害）
					return get.attitude(player, evt.player) < 0 ? 1 : 0;
				}
				// 该牌对使用者收益越高，无效它越划算；翻回正面（背面→正面）几乎白赚
				const target = evt.targets?.[0] || evt.player;
				const eff = -get.effect(target, evt.card, evt.player, player);
				return player.isTurnedOver() ? eff : eff - 2;
			},
		},
	},
	subSkill: {
		on: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "围",
			intro: { content: "本回合你可以发动〖金围〗，无效任意基本牌或普通锦囊牌" },
		},
	},
},

// === 刘基 ===
xiaobai_meijian: {
	audio: 2,
	trigger: { global: ["loseAfter", "gainAfter", "loseAsyncAfter"] },
	filter(event, player) {
		if (!player.isIn()) return false;
		if (player.hasSkill("xiaobai_meijian_used")) return false;
		const moved = lib.skill.xiaobai_meijian.getMoved(event, player);
		return moved.some((current) => current.isIn() && lib.skill.xiaobai_meijian.isExtreme(current) > 0);
	},
	// 本事件中手牌发生进出的其他角色
	getMoved(event, player) {
		const moved = [];
		if (event.name == "gain") {
			// FreeKill 判的是 move.toArea == Card.PlayerHand，即「获得**到手牌**」；
			// 拿到装备区的牌不算，所以要按牌当前所在区域过滤。
			const inHand = (event.cards || []).some((card) => get.position(card, true) == "h");
			if (inHand && event.player && event.player != player) moved.push(event.player);
		} else if (event.name == "lose") {
			if ((event.hs?.length || 0) > 0 && event.player && event.player != player) moved.push(event.player);
		} else if (event.name == "loseAsync") {
			game.countPlayer((current) => {
				if (current != player && (event.getl?.(current)?.hs?.length || 0) > 0) moved.push(current);
			});
		}
		return moved;
	},
	// 2=全场最小（存活者都>=其），1=全场最大（存活者都<=其），0=非极值；与 FreeKill 判定顺序一致（先最小）
	// ⚠️ 只统计存活角色（FreeKill 用 room.alive_players）：game.players 含阵亡者，
	//    阵亡者手牌数为 0，会把「全场最小」的判定带偏。
	isExtreme(current) {
		if (!current.isIn()) return 0;
		const hand = current.countCards("h");
		const list = game.filterPlayer((p) => p.isIn());
		if (list.every((p) => p.countCards("h") >= hand)) return 2;
		if (list.every((p) => p.countCards("h") <= hand)) return 1;
		return 0;
	},
	// 存活角色中，手牌数为最大/最小的角色个数（「大」「小」两个 mark 的角标用）
	countAt(type) {
		const list = game.filterPlayer((p) => p.isIn());
		if (!list.length) return 0;
		const nums = list.map((p) => p.countCards("h"));
		const value = type == "max" ? Math.max(...nums) : Math.min(...nums);
		return list.filter((p) => p.countCards("h") == value).length;
	},
	async content(event, trigger, player) {
		player.addTempSkill("xiaobai_meijian_used", "roundStart");
		const target = lib.skill.xiaobai_meijian.getMoved(trigger, player).find(
			(current) => current.isIn() && lib.skill.xiaobai_meijian.isExtreme(current) > 0
		);
		if (!target) return;
		// 另一者的角色数：其为最小 → 数最大值的人数；其为最大 → 数最小值的人数
		const type = lib.skill.xiaobai_meijian.isExtreme(target);
		// 其为最小 → 数「手牌数最大」的角色数；其为最大 → 数「手牌数最小」的角色数（只数存活）
		const targetNum = lib.skill.xiaobai_meijian.countAt(type == 2 ? "max" : "min");
		// 依次调整：刘基 → 目标（多弃少摸，弃置强制仅手牌）
		const adjust = async (current, diff) => {
			if (diff > 0) {
				// ⚠️ 必须用 chooseToDiscard（选完即弃）。chooseCard 只是"选牌"，不会弃置，
				//    选了牌等于没选（FreeKill 用的是 room:askToDiscard）。
				const res = await current
					.chooseToDiscard("h", true, diff, `美谏：弃置${get.cnNumber(diff)}张手牌`)
					.set("ai", (card) => 6 - get.value(card))
					.forResult();
				return res?.cards || [];
			}
			if (diff < 0) {
				// ⚠️ draw 事件把摸到的牌放在 result.cards（content.js:9945），没有 event.cards
				const next = current.draw(-diff);
				await next;
				return next.result?.cards || [];
			}
			return [];
		};
		const myDiff = player.countCards("h") - targetNum;
		const myCards = await adjust(player, myDiff);
		if (!player.isIn()) return;
		const toDiff = target.countCards("h") - targetNum;
		const toCards = await adjust(target, toDiff);
		void toCards;
		if (!player.isIn() || !target.isIn()) return;
		// 目标调整的牌数大于你 且 你因此弃置或摸了牌 → 目标可获得这些牌
		if (Math.abs(toDiff) > Math.abs(myDiff) && myCards.length) {
			const go = await target
				.chooseBool("美谏：是否获得" + get.translation(player) + "因此弃置或摸的牌？")
				.set("ai", () => (myCards.every((card) => get.owner(card) == player) ? myCards.some((card) => get.value(card, player) < 0) : myCards.some((card) => get.value(card, target) > 0)))
				.forResult();
			if (go?.bool) {
				await target.gain(myCards, "gain2");
			}
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},

	group: ["xiaobai_meijian_da", "xiaobai_meijian_xiao", "xiaobai_meijian_refresh"],
	subSkill: {
		// ⚠️ 必须真实存在：主技能用 addTempSkill("xiaobai_meijian_used", …) + hasSkill("xiaobai_meijian_used") 做次数限制，
		//    缺这个空壳子技能时标记加不进去、限制形同虚设（同预诫的坑）。
		used: {
			charlotte: true,
			sub: true,
		},
		// 「大」：手牌数最大的角色数（markcount 实时显示）
		da: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "大",
			intro: {
				name: "美谏",
				content: "手牌数最多的角色数",
				markcount: () => lib.skill.xiaobai_meijian.countAt("max"),
			},
			init(player, skill) {
				player.markSkill(skill);
			},
		},
		// 「小」：手牌数最小的角色数（markcount 实时显示）
		xiao: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "小",
			intro: {
				name: "美谏",
				content: "手牌数最少的角色数",
				markcount: () => lib.skill.xiaobai_meijian.countAt("min"),
			},
			init(player, skill) {
				player.markSkill(skill);
			},
		},
		// 任何角色手牌数变化后刷新两个角标（引擎只在 markSkill/storage 变化时重算 markcount）
		refresh: {
			charlotte: true,
			sub: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { global: ["gainAfter", "loseAfter", "loseAsyncAfter"] },
			filter(event, player) {
				return player.hasSkill("xiaobai_meijian_da");
			},
			content(event, trigger, player) {
				player.markSkill("xiaobai_meijian_da");
				player.markSkill("xiaobai_meijian_xiao");
			},
		},
	},},
xiaobai_yongchong: {
	audio: 2,
	// 「每回合限一次」用原生 usable —— 引擎在触发流程里判它（content.js:3667）。
	// ⚠️ 不要用 addTempSkill(..., "phaseAfter")：字符串 expire 会被包成 {global:"phaseAfter"}，
	// 那是「当前阶段结束」就失效，做不到每回合限一次。
	usable: 1,
	trigger: { global: ["loseAfter", "loseAsyncAfter"] },
	filter(event, player) {
		if (!player.isIn()) return false;
		const cards = lib.skill.xiaobai_yongchong.lostCards(event, player);
		if (!cards.length) return false;
		// 本轮只失去过该颜色的牌（本轮颜色记录 + 本次颜色去重后为一种）
		const colors = new Set(player.storage.xiaobai_yongchong_colors || []);
		cards.forEach((card) => colors.add(get.color(card) || "none"));
		return colors.size == 1;
	},
	// 本次事件中刘基从手牌/装备区失去的牌
	lostCards(event, player) {
		const l = event.getl?.(player);
		if (!l) return [];
		return (l.hs || []).concat(l.es || []);
	},
	async content(event, trigger, player) {
		const cards = lib.skill.xiaobai_yongchong.lostCards(trigger, player);
		const hadMark = cards.some((card) => card.hasGaintag?.("xiaobai_yongchong_tag"));
		// 以此法获得的牌挂「用宠」tag，直到这些牌被失去（gaintag 随牌存在，牌离开则自然消失）
		// ⚠️ 引擎把摸到的牌放在 draw 事件的 result.cards（content.js:9945），不是 event.cards；
		//    正确做法是直接给 draw 事件挂 gaintag —— 引擎会转挂到 gain 上（content.js:9942）。
		const next = player.draw(2);
		next.gaintag.add("xiaobai_yongchong_tag");
		await next;
		if (hadMark) {
			player.removeSkill("xiaobai_yongchong");
			game.log(player, "失去了技能", "#g【用宠】");
		}
	},
	group: ["xiaobai_yongchong_record", "xiaobai_yongchong_clear"],
	subSkill: {
		// 本轮失去过的颜色记录（引擎无跨回合的轮历史，用记录子技能自行维护）
		record: {
			charlotte: true,
			sub: true,
			trigger: { global: ["loseAfter", "loseAsyncAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return lib.skill.xiaobai_yongchong.lostCards(event, player).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_yongchong_colors ??= [];
				for (const card of lib.skill.xiaobai_yongchong.lostCards(trigger, player)) {
					const color = get.color(card) || "none";
					if (!player.storage.xiaobai_yongchong_colors.includes(color)) {
						player.storage.xiaobai_yongchong_colors.push(color);
					}
				}
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_yongchong_colors || []).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_yongchong_colors = [];
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 刘敏 ===
xiaobai_yizuo: {
	audio: 2,
	trigger: { global: "phaseUseBegin" },
	filter(event, player) {
		if (!event.player?.isIn?.()) return false;
		if (player.countCards("h") == 0) return false;
		// 本轮已选完四种花色 → 本轮不能再发动（不论是谁的回合）
		if (lib.skill.xiaobai_yizuo.usedSuits(player).length >= 4) return false;
		// 手里没有「本轮未选过」的花色 → 发动了也没牌可选，同样不发
		return lib.skill.xiaobai_yizuo.availSuits(player).length > 0;
	},
	// 本轮已被选择过的花色
	usedSuits(player) {
		return player.storage.xiaobai_yizuo_round || [];
	},
	// 本轮还能选的花色（你手牌里有的、且本轮没选过的）
	availSuits(player) {
		const used = lib.skill.xiaobai_yizuo.usedSuits(player);
		const suits = [];
		for (const card of player.getCards("h")) {
			const suit = get.suit(card, player);
			if (suit && !used.includes(suit) && !suits.includes(suit)) suits.push(suit);
		}
		return suits;
	},
	// AI 是否发动：引擎对触发技的默认 ai 是 `!check || check(...)`（content.js:3604），
	// 即**没有 check 就恒发动**——会在敌方回合也发动、大概率花色不同白掉 1 血。这里补上判断。
	check(event, player) {
		const target = event.player;
		// 自己的回合：只有自己选花色，永远不会「花色不同」→ 白嫖一张【无中生有】，必发
		if (target == player) return true;
		// 队友的回合：双方 AI 都会挑便宜的花色，大概率选到同一种 → 基本不亏，值得发
		if (get.attitude(player, target) > 0) return true;
		// 敌方回合：对方会挑最贵的花色 → 大概率花色不同、要吃 1 点伤害。
		// 只有自己已受伤（能顺手用【桃】回血）时才值得冒险。
		return player.isDamaged();
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		// 其观看你的手牌
		if (target != player) {
			await target.viewCards("翼佐：观看" + get.translation(player) + "的手牌", player.getCards("h"));
		}
		// 候选花色：你手牌中的花色，排除本轮已选过的
		const suits = lib.skill.xiaobai_yizuo.availSuits(player);
		if (!suits.length) return;
		// 双方各选一种花色（同时选择，依次模拟且互不可见对方结果）
		// 选花色的 ai：**队友**尽量少损失（挑价值最低的花色，如三张【影】所在的♠），**敌人**反过来挑最贵的。
		// ⚠️ 写法对齐原生 clan.js:552（坚白）：ai 里用 `get.event()` 取上下文、返回**选项字符串**，
		//    不要把上下文放闭包（引擎对 set("ai", fn) 的处理不保证保留闭包作用域）。
		const pick = (chooser) =>
			chooser
				.chooseControl(suits)
				.set("prompt", "翼佐：选择一种花色")
				.set("yizuoSuits", suits)
				.set("yizuoOwner", player)
				.set("ai", () => {
					const { player: me, yizuoSuits: list, yizuoOwner: owner } = get.event();
					// 某花色的总价值 = 技能拥有者手牌里该花色牌的价值之和（数量少 / 单张便宜 → 总价值低）
					const score = (suit) =>
						owner
							.getCards("h", (card) => get.suit(card, owner) === suit)
							.reduce((sum, card) => sum + get.value(card, owner), 0);
					const sorted = list.slice().sort((a, b) => score(a) - score(b)); // 升序：便宜在前
					return get.attitude(me, owner) > 0 ? sorted[0] : sorted[sorted.length - 1];
				})
				.forResult();
		const chosen = [];
		// ⚠️ chooseControl 带取消按钮，取消时 control === "cancel2"，不能当成花色记进去。
		// ⚠️ 必须**去重**（对齐 FreeKill 的 `table.insertIfNeed`）：后面的「花色不同」判定用的是
		//    `chosen.length > 1`，若不去重，双方选了同一种花色也会被算成 2 → 误触发扣血。
		const add = (res) => {
			if (res?.control && res.control != "cancel2" && suits.includes(res.control) && !chosen.includes(res.control)) {
				chosen.push(res.control);
			}
		};
		if (target == player) {
			add(await pick(player));
		} else {
			add(await pick(target));
			add(await pick(player));
		}
		if (!chosen.length) return;
		// 记录本轮已被选择过的花色，并刷新 mark
		player.storage.xiaobai_yizuo_round ??= [];
		for (const suit of chosen) {
			if (!player.storage.xiaobai_yizuo_round.includes(suit)) player.storage.xiaobai_yizuo_round.push(suit);
		}
		player.markSkill("xiaobai_yizuo_mark");
		// 可将被选择花色的牌当【无中生有】或【桃】对你或其使用
		const cards = player.getCards("h").filter((card) => chosen.includes(get.suit(card, player)));
		if (cards.length) {
			// 可用性：【无中生有】恒可用（摸两张牌）；【桃】只有「收牌人受伤」时才可用。
			// ⚠️ 无名杀桃的 enable 是「使用者受伤」、filterTarget 是「目标是自己」，
			//    直接拿 canUse 判会误杀，所以按「你或对方是否受伤」决定是否展示【桃】选项。
			//    注意：即便两个选项都不可用也不跳过选择环节 —— 该选择本身可以取消。
			// ⚠️ 自己回合时 target === player，必须去重，否则同一个人会出现两份、导致「可选目标数」被算成 2
			const pair = target == player ? [player] : [player, target];
			const hurt = pair.filter((current) => current.isIn() && current.isDamaged());
			const choices = ["wuzhong"];
			const choiceList = ["当【无中生有】使用（摸两张牌）"];
			if (hurt.length) {
				choices.push("tao");
				choiceList.push("当【桃】使用（回复1点体力）");
			}
			choices.push("cancel2");
			const namePick = await player
				.chooseControl(choices)
				.set("prompt", "翼佐：是否将这" + get.cnNumber(cards.length) + "张牌当【无中生有】或【桃】使用？")
				.set("choiceList", choiceList)
				.set("yizuoChoices", choices)
				.set("ai", () => {
					const { player: me, yizuoChoices: list } = get.event();
					// 自己受伤优先回血，否则摸牌（返回选项字符串，与原生 chooseControl 的 ai 约定一致）
					if (me.isDamaged() && list.includes("tao")) return "tao";
					return "wuzhong";
				})
				.forResult();
			if (namePick?.control && namePick.control != "cancel2") {
				// 目标二选一（你 / 对方）——【无中生有】保持原来的二选一；
				// 【桃】的收牌人必须受伤，所以此时不能选未受伤的角色。
				const cands = pair.filter((current) => current.isIn() && (namePick.control != "tao" || current.isDamaged()));
				// 只有一个可选目标 → 跳过目标选择环节，直接用它
				let who = cands.length == 1 ? cands[0] : null;
				if (cands.length > 1) {
					const useTarget = await player
						.chooseTarget("翼佐：选择此牌的使用目标", 1, (card, player2, targetx) => cands.includes(targetx))
						.set("ai", (targetx) => {
							const me = get.player();
							if (namePick.control == "tao") return targetx.isDamaged() ? get.attitude(me, targetx) : -1;
							return get.attitude(me, targetx);
						})
						.forResult();
					who = useTarget?.targets?.[0] || null;
				}
				if (who?.isIn()) {
					// ⚠️ 实体牌要显式传第 2 参，否则 event.cards 只含虚拟牌本身，底牌不消耗
					await player.useCard(get.autoViewAs({ name: namePick.control }, cards), cards, [who], "xiaobai_yizuo");
				}
			}
		}
		// 花色不同（chosen 已去重，长度 2 即「你与其选择的花色不同」）：移去本轮已被选择过的花色，
		// 并失去1点体力（无论是否使用了牌）
		if (chosen.length > 1 && player.isIn()) {
			player.storage.xiaobai_yizuo_round = [];
			player.markSkill("xiaobai_yizuo_mark");
			await player.loseHp();
		}
	},
	group: ["xiaobai_yizuo_clear", "xiaobai_yizuo_mark"],
	subSkill: {
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_yizuo_round || []).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_yizuo_round = [];
				player.markSkill("xiaobai_yizuo_mark");
			},
		},
		// 「翼佐」mark：角标显示本轮已选过的花色数，内容列出具体花色
		mark: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "翼",
			intro: {
				name: "翼佐",
				content(storage, player) {
					const used = player.storage.xiaobai_yizuo_round || [];
					if (!used.length) return "本轮尚未选择过花色";
					return "本轮已选择过的花色：" + used.map((suit) => get.translation(suit)).join("、");
				},
				markcount: (storage, player) => (player.storage.xiaobai_yizuo_round || []).length,
			},
			init(player, skill) {
				player.markSkill(skill);
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_lianzhi: {
	audio: 2,
	// direct: true —— 技能描述里的「可以」写在 content 内部（获得三张【影】/ 展示手牌摸三张 各有一次 chooseBool），
	// 若再让引擎问一次「是否发动连帜」就会变成三次询问（用户反馈的"重复询问"）。
	// direct 会短路引擎的发动询问（content.js:3544），直接进 content。
	direct: true,
	trigger: { global: ["loseAfter", "loseAsyncAfter"] },
	filter(event, player) {
		if (!player.isIn()) return false;
		const lost = lib.skill.xiaobai_lianzhi.lostHand(event, player);
		if (!lost.length) return false;
		return player.countCards("h") == 0 || (lost.some((card) => get.name(card) == "ying") && !player.countCards("h", (card) => get.name(card) == "ying"));
	},
	lostHand(event, player) {
		if (event.name == "lose") {
			return event.player == player ? event.hs || [] : [];
		}
		return event.getl?.(player)?.hs || [];
	},
	async content(event, trigger, player) {
		const lost = lib.skill.xiaobai_lianzhi.lostHand(trigger, player);
		// 两个条件都在结算开始时判定（对齐 FreeKill 同事件双效果）
		const canGain = player.countCards("h") == 0;
		const canDraw = lost.some((card) => get.name(card) == "ying") && !player.countCards("h", (card) => get.name(card) == "ying");
		if (canGain) {
			const go1 = await player
				.chooseBool("连帜：是否获得三张【影】？")
				.set("ai", () => true)
				.forResult();
			if (go1?.bool) {
				await player.gain(lib.card.ying.getYing(3), "gain2");
			}
		}
		if (canDraw && player.isIn()) {
			const go2 = await player
				.chooseBool("连帜：是否展示手牌并摸三张牌？")
				.set("ai", () => true)
				.forResult();
			if (go2?.bool) {
				if (player.countCards("h")) {
					player.showHandcards("连帜：展示手牌");
				}
				await player.draw(3);
			}
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 李丰 ===
xiaobai_danming: {
	audio: 2,
	mark: true,
	marktext: "名",
	intro: {
		content(storage, player) {
			return "当前可将手牌数调整至" + get.cnNumber(4 - (player.storage.xiaobai_danming_reduce || 0)) + "张";
		},
	},
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		return player.countCards("h") != 4 - (player.storage.xiaobai_danming_reduce || 0);
	},
	async content(event, trigger, player) {
		const reduce = player.storage.xiaobai_danming_reduce || 0;
		const num = 4 - reduce - player.countCards("h");
		if (num > 0) {
			await player.draw(num);
			if (!player.isIn()) return;
			// 因此摸牌才有的二选一（弃牌分支没有）
			const ctrl = await player
				.chooseControl("令数值-1", "本回合失效")
				.set("prompt", "耽名：你可以令此数值本轮-1，或令本回合此技能失效")
				.set("ai", () => 0)
				.forResult();
			if (ctrl?.control == "令数值-1") {
				player.storage.xiaobai_danming_reduce = reduce + 1;
				player.updateMarks("xiaobai_danming");
			} else {
				// 本回合失效：disableSkill 让描述变灰，随 tempSkill 过期在 onremove 恢复（AGENTS 写法A）
				player.disableSkill("xiaobai_danming_ban", "xiaobai_danming");
				player.addTempSkill("xiaobai_danming_ban", "phaseAfter");
			}
		} else if (num < 0) {
			await player.chooseToDiscard(-num, "h", true).forResult();
		}
	},
	group: ["xiaobai_danming_clear"],
	subSkill: {
		ban: {
			charlotte: true,
			sub: true,
			onremove(player) {
				player.enableSkill("xiaobai_danming_ban");
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_danming_reduce || 0) > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_danming_reduce = 0;
				player.updateMarks("xiaobai_danming");
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_youbai: {
	audio: 2,
	trigger: { player: "loseAfter" },
	filter(event, player) {
		if (!player.isIn()) return false;
		if (player.hasSkill("xiaobai_youbai_used")) return false;
		// 不因使用或打出失去手牌（使用/打出的 lose type 同为 "use"，知识库九）
		return (event.hs?.length || 0) > 0 && event.type != "use";
	},
	async content(event, trigger, player) {
		const maxEquip = Math.max(...game.filterPlayer().map((p) => p.countCards("e")));
		const maxHand = Math.max(...game.filterPlayer().map((p) => p.countCards("h")));
		const equipCands = game.filterPlayer((p) => p.countCards("e") == maxEquip);
		const handCands = game.filterPlayer((p) => p.countCards("h") == maxHand);
		const eq = await player
			.chooseTarget("游摆：选择一名装备区牌数最多的角色", 1, (card, player2, targetx) => equipCands.includes(targetx))
			.set("ai", (targetx) => get.attitude(player, targetx))
			.forResult();
		if (!eq?.bool || !eq.targets?.length) return;
		const hd = await player
			.chooseTarget("游摆：选择一名手牌数最多的角色", 1, (card, player2, targetx) => handCands.includes(targetx))
			.set("ai", (targetx) => get.attitude(player, targetx))
			.forResult();
		if (!hd?.bool || !hd.targets?.length) return;
		// 两次选择都确定后才消耗每回合次数
		player.addTempSkill("xiaobai_youbai_used", "phaseAfter");
		const t1 = eq.targets[0];
		const t2 = hd.targets[0];
		await t1.draw(1);
		await t2.draw(1);
		if (t1 != t2 && player.isIn()) {
			// moveCard 内建可移动预检与取消
			await player.moveCard("游摆：移动场上一张牌");
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
	subSkill: {
		// ⚠️ 必须真实存在：主技能用 addTempSkill("xiaobai_youbai_used", …) + hasSkill("xiaobai_youbai_used") 做次数限制，
		//    缺这个空壳子技能时标记加不进去、限制形同虚设（同预诫的坑）。
		used: {
			charlotte: true,
			sub: true,
		},
	},
},

// === 卢毓 ===
xiaobai_jinti: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	mark: true,
	marktext: "替",
	intro: {
		// 只显示当前顺序（详细说明交给技能描述，避免 mark 里重复一大段话）
		content(storage, player) {
			const order = player.storage.xiaobai_jinti_order || 1;
			const items = [];
			for (let i = 1; i <= 5; i++) items.push(i == order ? "摸牌至四张" : "使用一张牌");
			return items.map((t, i) => i + 1 + "." + t).join("，");
		},
	},
	filter(event, player) {
		// 摸牌项不在首位时，第一项是使用牌：手牌需有牌
		if ((player.storage.xiaobai_jinti_order || 1) != 1) {
			return player.countCards("h") > 0;
		}
		return true;
	},
	async content(event, trigger, player) {
		let order = player.storage.xiaobai_jinti_order || 1;
		if (order < 1) order = 1;
		let executed = 0;
		for (let i = 1; i <= 5; i++) {
			if (i == order) {
				// 摸牌至四张（可拒绝，拒绝则后续全部终止）
				if (player.countCards("h") >= 4) {
					const skipAsk = await player
						.chooseBool("进替：是否执行「将手牌摸至四张」？（已有至少四张牌则摸0张）")
						.set("ai", () => false)
						.forResult();
					if (!skipAsk?.bool) break;
				} else {
					const go = await player
						.chooseBool("进替：是否将手牌摸至四张？")
						.set("ai", () => true)
						.forResult();
					if (!go?.bool) break;
					await player.draw(4 - player.countCards("h"));
				}
				executed++;
			} else if (i < order) {
				// 摸牌之前的项：使用一张牌，不受次数限制
				const used = await lib.skill.xiaobai_jinti.useCard(player, true, null);
				if (!used) break;
				executed++;
			} else {
				// 摸牌之后的项：使用一张牌，花色须为本回合未被使用过的
				const used = await lib.skill.xiaobai_jinti.useCard(player, false, lib.skill.xiaobai_jinti.usedSuits(player));
				if (!used) break;
				executed++;
			}
		}
		// 执行了 N 项 → 摸牌项移至第 N 位（即与最后执行的项交换）；一项未执行则恢复原位
		player.storage.xiaobai_jinti_order = executed > 0 ? executed : order;
		player.updateMarks("xiaobai_jinti");
	},
	// 单项「使用一张牌」；extraUse=不受次数限制（临时 mod + 不计次），suitsExclude=花色黑名单
	async useCard(player, extraUse, suitsExclude) {
		if (!player.isIn()) return false;
		if (extraUse) player.addTempSkill("xiaobai_jinti_free");
		const next = player.chooseToUse(null, extraUse ? "进替：你可以使用一张牌（不受次数限制）" : "进替：你可以使用一张牌（不能用已使用过的花色）");
		if (suitsExclude) {
			next.set("filterCard", (card, player2, event2) => {
				if (suitsExclude.includes(get.suit(card, player2))) return false;
				return lib.filter.filterCard(card, player2, event2);
			});
		}
		if (extraUse) next.set("addCount", false);
		const result = await next.forResult();
		player.removeSkill("xiaobai_jinti_free");
		return Boolean(result?.bool);
	},
	// 本回合已使用过的花色集合
	usedSuits(player) {
		const suits = [];
		for (const evt of player.getHistory("useCard")) {
			const suit = get.suit(evt.card, player);
			if (suit && !suits.includes(suit)) suits.push(suit);
		}
		return suits;
	},
	subSkill: {
		free: {
			charlotte: true,
			popup: false,
			mod: {
				cardUsable() {
					return Infinity;
				},
			},
		},
	},
	ai: {
		order: 7,
		result: {
			player: 1,
		},
	},
},
xiaobai_lincai: {
	audio: 2,
	trigger: { player: "damageEnd" },
	filter(event, player) {
		const x = (player.storage.xiaobai_jinti_order || 1) - 1;
		return game.hasPlayer((current) => current.countCards("e") <= x);
	},
	async content(event, trigger, player) {
		const x = (player.storage.xiaobai_jinti_order || 1) - 1;
		const res = await player
			.chooseTarget("遴才：选择一名装备区牌数不大于" + get.cnNumber(x) + "的角色，令其摸两张牌", 1, (card, player2, targetx) => targetx.countCards("e") <= x)
			.set("ai", (targetx) => get.attitude(player, targetx))
			.forResult();
		if (res?.bool && res.targets?.length) {
			await res.targets[0].draw(2);
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 韦诞 ===
xiaobai_jinmo: {
	audio: 2,
	enable: "phaseUse",
	mark: true,
	marktext: "墨",
	intro: {
		// 显示牌面：上一张「单张进入弃牌堆」的红牌，以及它之后「单张进入」的黑牌
		content(storage, player) {
			// 牌面图：优先 lib.card[].image（扩展卡会被 patchAssets 设成 ext:群友设计/...），
			// 否则用原生约定 image/card/<牌名>.png（引擎 content.js:2408 也是这个路径）
			const face = (card) => {
				const name = get.name(card);
				let src = lib.card[name]?.image;
				if (src && src.startsWith("ext:")) src = "extension/" + src.slice(4);
				if (!src) src = `image/card/${name}.png`;
				const text = get.translation(card);
				return `<img src="${src}" style="width:30px;vertical-align:middle;margin:0 2px 0 6px" onerror="this.style.display='none'">${text}`;
			};
			const red = player.storage.xiaobai_jinmo_red;
			const redOk = red && get.position(red, true) == "d";
			const head = redOk ? `上一张单张进入弃牌堆的红牌：${face(red)}` : "尚未有红牌参照";
			const list = (player.storage.xiaobai_jinmo_cards || []).filter((card) => get.position(card, true) == "d");
			if (!list.length) return `${head}<br>其后暂无单张进入弃牌堆的黑牌`;
			return `${head}<br>其后单张进入弃牌堆的黑牌（共${list.length}张）：${list.map(face).join("")}`;
		},
	},
	filter(event, player) {
		return player.countCards("he") > 0;
	},
	// 本次事件中「进入了弃牌堆」的牌：**任意来源、任意角色**（弃置/使用/打出/重铸…）
	// ⚠️ 不限归属：FreeKill 原版同样只看 `#moveInfo == 1 and toArea == DiscardPile`。
	discarded(event) {
		const pick = (cards) => (cards || []).filter((card) => get.position(card, true) == "d");
		if (event.name == "lose") return pick(event.cards);
		const list = [];
		for (const current of game.players.concat(game.dead)) {
			const l = event.getl?.(current);
			for (const card of pick(l?.cards)) {
				if (!list.includes(card)) list.push(card);
			}
		}
		return list;
	},
	filterCard: true,
	selectCard: 1,
	position: "he",
	async content(event, trigger, player) {
		const card = event.cards[0];
		if (get.color(card, player) == "red") {
			// 本阶段失效（禁用但记录继续，对齐 Lua invalidateSkill "-phase"）
			player.addTempSkill("xiaobai_jinmo_ban", "phaseUseAfter");
			// 读「这张红牌之前的黑牌」快照（record 在弃置时已把 cards 清空，直接读 cards 恒为空）
			const list = (player.storage.xiaobai_jinmo_prev || []).filter((c) => get.position(c, true) == "d");
			player.storage.xiaobai_jinmo_prev = [];
			player.updateMarks("xiaobai_jinmo");
			if (list.length) {
				await player.gain(list, "gain2");
			}
		}
	},
	// record 动态独立挂载（不进 group）：失效期间仍需记录（知识库 #59）
	init(player) {
		player.addSkill("xiaobai_jinmo_record");
	},
	onremove(player) {
		player.removeSkill("xiaobai_jinmo_record");
	},
	subSkill: {
		ban: {
			charlotte: true,
			sub: true,
			init(player, skill) {
				player.disableSkill(skill, "xiaobai_jinmo");
			},
			onremove(player, skill) {
				player.enableSkill(skill);
			},
		},
		record: {
			charlotte: true,
			sub: true,
			// ⚠️ 不能只监听 cardsDiscardAfter（只覆盖「弃置」）：使用/打出/重铸的牌进弃牌堆走的是 lose，
			//    不派发 cardsDiscard。FreeKill 原版用 AfterCardsMove + `#moveInfo == 1 and toArea == DiscardPile`，
			//    即**任意来源**的单张入堆 → 这里改成 loseAfter/loseAsyncAfter + 区域筛选。
			trigger: { global: ["loseAfter", "loseAsyncAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return lib.skill.xiaobai_jinmo.discarded(event).length == 1;
			},
			content(event, trigger, player) {
				const card = lib.skill.xiaobai_jinmo.discarded(trigger)[0];
				if (!card) return;
				player.storage.xiaobai_jinmo_cards ??= [];
				if (get.color(card) == "red") {
					// 记下红牌参照，并清空「其后」的黑牌。
					// ★ 同时快照一份「这张红牌之前的黑牌」——技能结算时读的就是它：
					//   弃置本身是该技能的代价、发生在 content 之前，record 会先把 cards 清空，
					//   所以 content 不能直接读 cards（那会恒为空 → 永远获得 0 张）。
					player.storage.xiaobai_jinmo_prev = player.storage.xiaobai_jinmo_cards.slice(0);
					player.storage.xiaobai_jinmo_red = card;
					player.storage.xiaobai_jinmo_cards = [];
				} else if (!player.storage.xiaobai_jinmo_cards.includes(card)) {
					player.storage.xiaobai_jinmo_cards.push(card);
				}
				player.updateMarks("xiaobai_jinmo");
			},
		},
	},
	ai: {
		order: 5,
		result: {
			player(player) {
				const list = (player.storage.xiaobai_jinmo_cards || []).filter((c) => get.position(c, true) == "d");
				return list.length ? 1 : -0.5;
			},
		},
	},
},
xiaobai_yinhan: {
	locked: true,
	mark: true,
	marktext: "瀚",
	// 获得技能时直接读「弃牌堆顶」定色（比回看历史更简单也更准）
	init(player, skill) {
		const top = lib.skill.xiaobai_yinhan.lastToDiscardPile();
		if (!top) return;
		player.storage.xiaobai_yinhan_top = top;
		player.storage.xiaobai_yinhan_color = get.color(top);
		// mark 要到 addSkill 阶段才创建（init 早于它），延后一帧补染色
		setTimeout(() => lib.skill.xiaobai_yinhan.paint(player), 0);
	},
	intro: {
		content(storage, player) {
			const color = player.storage.xiaobai_yinhan_color;
			if (color == "black") return "当前为黑色状态：你的非转化即时牌以明置替代使用（牌不消耗），打出的牌改为交给一名其他角色；明置牌无法使用。";
			if (color == "red") return "当前为红色状态：你的非转化即时牌以暗置替代使用（牌不消耗），弃置的牌改为重铸；暗置牌无法使用。";
			return "尚未定色。";
		},
	},
	// 状态刷新：**最后进入弃牌堆的那张牌**的颜色。
	// 「弃牌堆顶」= ui.discardPile 的**最后一个** childNode —— card.discard() 用的是
	// `ui.discardPile.appendChild(this)`（card.js:926-930），所以最新进入弃牌堆的牌永远在末尾。
	// 项目内同款写法：呆鋩 `qunyou_daimang.lastTrick()`（sanshe.js:11060「从弃牌堆顶向下找」，
	// `for (let i = childNodes.length - 1; i >= 0; i--)`）；外部扩展银竹离火 extContent.js:739
	// 亦注明「ui.discardPile.childNodes 最后一张牌，是最新进入弃牌堆的卡牌！逻辑上的弃牌堆顶部」。
	// ⚠️ 别用 get.discardPile(true)：文档写「从弃牌堆顶自顶向下遍历」，但实现是
	//    `findInPile(ui.discardPile, false)` → 从 nodes[0] 开始（get/index.js:4609-4637），
	//    拿到的是**最旧**的一张，与实际堆顶（末尾）正好相反。
	// 触发用「一切可能让牌进弃牌堆」的事件全家桶（呆鋩同款 + discardAfter/loseToDiscardpileAfter），
	// 因为本实现读的是「当前堆顶」而非本事件带进来的牌，多触发几次是幂等的、不会算错。
	trigger: { global: ["cardsDiscardAfter", "loseAfter", "loseAsyncAfter", "discardAfter", "loseToDiscardpileAfter"] },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		return Boolean(ui.discardPile?.childNodes?.length);
	},
	content(event, trigger, player) {
		const top = lib.skill.xiaobai_yinhan.lastToDiscardPile();
		if (!top || player.storage.xiaobai_yinhan_top === top) return;
		player.storage.xiaobai_yinhan_top = top;
		player.storage.xiaobai_yinhan_color = get.color(top);
		player.updateMarks("xiaobai_yinhan");
		lib.skill.xiaobai_yinhan.paint(player);
	},
	// 弃牌堆顶（最后进入弃牌堆的那张牌）：从最后一个 childNode 往前找第一张真牌
	lastToDiscardPile() {
		const nodes = ui.discardPile?.childNodes;
		if (!nodes?.length) return null;
		for (let i = nodes.length - 1; i >= 0; i--) {
			if (get.itemtype(nodes[i]) == "card") return nodes[i];
		}
		return null;
	},
	// 把 mark 上的「瀚」按状态染色：红色状态染红，更直观
	// （marktext 是静态的 —— 引擎会把它写进 lib.translate[技能id + "_bg"]，
	//  所以只能在运行时改 DOM：mark 的文字节点是 .background.skillmark）
	paint(player) {
		const bg = player.marks?.xiaobai_yinhan?.querySelector?.(".background");
		if (!bg) return;
		bg.style.color = player.storage.xiaobai_yinhan_color == "red" ? "#f04a4a" : "";
	},
	group: ["xiaobai_yinhan_replace", "xiaobai_yinhan_respond", "xiaobai_yinhan_discard"],
	mod: {
		// prohibit：黑色禁明置牌使用，红色禁暗置牌使用（mod 键 cardEnabled 不影响打出的 cardRespondable）
		cardEnabled(card, player) {
			const color = player.storage.xiaobai_yinhan_color;
			if (!color) return "unchanged";
			// VCard 不透传 gaintag，经 cards[0] 取实体牌判定明置
			const real = card.cards?.[0] || card;
			const shown = get.is.shownCard(real);
			if (shown === undefined) return "unchanged";
			if ((color == "black" && shown) || (color == "red" && !shown)) return false;
			return "unchanged";
		},
	},
	subSkill: {
		// 非转化即时牌因使用离开手牌区：取消移动改为明置（黑）/暗置（红），使用照常结算（逾围同款，牌不消耗）
		replace: {
			charlotte: true,
			sub: true,
			trigger: { global: "useCardBefore" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const color = player.storage.xiaobai_yinhan_color;
				if (!color || event.player != player) return false;
				const type = get.type(event.card);
				if (type != "basic" && type != "trick") return false;
				const cards = event.cards || [];
				if (!cards.length || !cards.every((c) => get.position(c) == "h")) return false;
				// 非转化：虚拟牌名与实体牌名一致
				if (get.name(cards[0], player) != get.name(event.card, player)) return false;
				return true;
			},
			async content(event, trigger, player) {
				const cards = trigger.cards.slice(0);
				trigger.cards = [];
				if (trigger.card) trigger.card.cards = [];
				if (player.storage.xiaobai_yinhan_color == "black") {
					player.addShownCards(cards, "visible_xiaobai_yinhan");
				} else {
					player.hideShownCards(cards, "visible_xiaobai_yinhan");
				}
			},
		},
		// 黑色状态：打出的牌改为交给一名其他角色（「以交给替代打出」→ 牌不进弃牌堆）。
		// 与 _replace 同款「不收回」写法：在 respondBefore 先把 event.cards 清空，
		// respond content 开头 `const { cards, card } = event`（content.js:9983）拿到的就是空数组，
		// 于是整段「失去牌」逻辑被跳过（content.js:10158 `if (cards.length)`）→ 牌原地留在手牌区，
		// 再直接 give 出去，全程不经过处理区/弃牌堆。
		// ⚠️ 旧版在 respondAfter 读 `event.result.cards` —— respond 事件的 content 里**根本没有
		//    `event.result = ...` 的赋值**（content.js:9981-10200 全段无 result），所以那永远是
		//    undefined → filter 恒假 → 这个子技能从来没发动过。牌在 respond 事件上叫 `event.cards`。
		respond: {
			charlotte: true,
			sub: true,
			trigger: { global: "respondBefore" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (player.storage.xiaobai_yinhan_color != "black" || event.player != player) return false;
				const cards = event.cards || [];
				// 只处理「手牌里的实体牌」（装备区/武将牌上等不在此列）
				if (!cards.length || !cards.every((c) => get.position(c) == "h")) return false;
				return game.hasPlayer((current) => current != player && current.isIn());
			},
			async content(event, trigger, player) {
				const cards = trigger.cards.slice(0);
				// 先问交给谁：取消则**什么都不改**，走正常「打出→进弃牌堆」
				const res = await player
					.chooseTarget("引瀚：将打出的牌交给一名其他角色", 1, lib.filter.notMe)
					.set("ai", (targetx) => get.attitude(player, targetx))
					.forResult();
				if (!res?.bool || !res.targets?.length) return;
				// 确认交付后才拦下「失去牌」，牌留在手牌区再给出去
				trigger.cards = [];
				if (trigger.card) trigger.card.cards = [];
				await player.give(cards, res.targets[0]);
			},
		},
		// 红色状态：把「弃置」直接改成「重铸」——在 discardBefore 就拦下，取消原弃置，就地从手牌重铸。
		discard: {
			charlotte: true,
			sub: true,
			trigger: { player: "discardBefore" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (player.storage.xiaobai_yinhan_color != "red") return false;
				// ⚠️ 不能写 `if (event.getParent("recast")) return false;` ——
				//    无名杀的 getParent(name) 在**找不到匹配时返回根事件（恒为真值）**，
				//    必须核对返回事件的 .name（否则 guard 永远成立）。
				if (event.getParent("recast")?.name == "recast") return false;
				return (event.cards || []).length > 0;
			},
			async content(event, trigger, player) {
				const cards = (trigger.cards || []).slice(0);
				// 取消原弃置（牌留在手里），再重铸
				trigger.cancel();
				if (!cards.length || !player.isIn()) return;
				await player.recast(cards);
			},
		},
	},
},

// === 杨琰 ===
xiaobai_youjian: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("h") > 0 && game.hasPlayer((current) => current != player && current.countCards("h") > 0);
	},
	filterTarget(card, player, target) {
		return target != player && target.countCards("h") > 0;
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		// 记录"上次忧谏交换牌的目标"（忠惜读取）
		player.storage.xiaobai_youjian_target = target;
		player.addTempSkill("xiaobai_youjian_active", "phaseAfter");
		// 选自己的 1~2 张手牌
		const res1 = await player
			.chooseCard("h", "忧谏：选择至多两张手牌与" + get.translation(target) + "交换（等量）", [1, 2], true)
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		const myCards = res1?.cards || [];
		if (!myCards.length) return;
		// 选目标的等量手牌
		const res2 = await player
			.choosePlayerCard(target, "h", true, myCards.length, "忧谏：选择" + get.translation(target) + "的" + get.cnNumber(myCards.length) + "张手牌交换")
			.forResult();
		const toCards = res2?.cards || res2?.links || [];
		if (!toCards.length || toCards.length != myCards.length) return;
		// 双向交换
		await player.give(myCards, target);
		if (player.isIn()) {
			await target.give(toCards.filter((card) => get.owner(card) == target), player);
		}
		// 你以此获得的牌打上追踪标记（本回合使用该伤害牌后可各摸一张）
		for (const card of toCards) {
			card.storage ??= {};
			card.storage.xiaobai_youjian_mark = true;
		}
	},
	group: ["xiaobai_youjian_draw"],
	subSkill: {
		active: {
			charlotte: true,
			sub: true,
		},
		draw: {
			audio: "xiaobai_youjian",
			charlotte: true,
			sub: true,
			name: "忧谏",
			trigger: { player: "useCardAfter" },
			filter(event, player) {
				if (!player.hasSkill("xiaobai_youjian_active")) return false;
				if (!get.tag(event.card, "damage")) return false;
				return (event.cards || []).some((card) => card.storage?.xiaobai_youjian_mark);
			},
			async content(event, trigger, player) {
				const target = player.storage.xiaobai_youjian_target;
				if (!target?.isIn()) return;
				const num = (trigger.cards || []).filter((card) => card.storage?.xiaobai_youjian_mark).length;
				for (let i = 0; i < num; i++) {
					if (!player.isIn() || !target.isIn()) return;
					const go = await player
						.chooseBool("忧谏：是否与" + get.translation(target) + "各摸一张牌？")
						.set("ai", () => true)
						.forResult();
					if (!go?.bool) return;
					await player.draw(1);
					await target.draw(1);
				}
			},
		},
	},
	ai: {
		order: 6,
		result: {
			player: 1,
			target: 0.5,
		},
	},
},
xiaobai_zhongxi: {
	audio: 2,
	trigger: { global: "phaseDiscardBegin" },
	filter(event, player) {
		const target = player.storage.xiaobai_youjian_target;
		if (!target?.isIn()) return false;
		const current = event.player;
		if (current != player && current != target) return false;
		// X = 弃牌者手牌数 - 其手牌上限，须为正
		return current.countCards("h") > current.getHandcardLimit();
	},
	async content(event, trigger, player) {
		const target = player.storage.xiaobai_youjian_target;
		const from = trigger.player; // 弃牌者 = 手牌上限被增加者
		const to = from == player ? target : player; // 弃牌执行者
		const num = from.countCards("h") - from.getHandcardLimit();
		if (num <= 0) return;
		const res = await to
			.chooseCard("h", `忠惜：弃置至多${get.cnNumber(num)}张手牌，令${get.translation(from)}本回合手牌上限增加等量`, [1, num])
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		const cards = res?.cards || [];
		if (!cards.length) return;
		// 弃置前判定「弃了X张或全部手牌」
		const awarded = cards.length == num || to.countCards("h") == cards.length;
		await to.discard(cards);
		if (!from.isIn()) return;
		// 手牌上限本回合增加等量（可叠加）
		from.addTempSkill("xiaobai_zhongxi_up", "phaseAfter");
		from.storage.xiaobai_zhongxi_up_num = (from.storage.xiaobai_zhongxi_up_num || 0) + cards.length;
		if (awarded && player.isIn() && to.isIn()) {
			const go = await player
				.chooseBool("忠惜：是否令" + get.translation(to) + "回复1点体力或摸两张牌？")
				.set("ai", () => true)
				.forResult();
			if (go?.bool) {
				const choice = await player
					.chooseControl("回复1点体力", "摸两张牌")
					.set("prompt", "忠惜：令" + get.translation(to) + "回复1点体力或摸两张牌")
					.set("ai", () => (to.isDamaged() ? 0 : 1))
					.forResult();
				if (choice?.control == "回复1点体力" && to.isDamaged()) {
					await to.recover(1);
				} else {
					await to.draw(2);
				}
			}
		}
	},
	subSkill: {
		up: {
			charlotte: true,
			sub: true,
			mod: {
				maxHandcard(current, num) {
					return num + (current.storage.xiaobai_zhongxi_up_num || 0);
				},
			},
			onremove(current, skill) {
				delete current.storage.xiaobai_zhongxi_up_num;
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 邓夫人 ===
xiaobai_dianchi: {
	audio: 2,
	zhuanhuanji: true,
	mark: true,
	marktext: "☯",
	intro: {
		content(storage) {
			return storage ? "当前状态：阴。当你回复体力至上限后，你将手牌摸至四张。" : "当前状态：阳。当你的体力变化为1后，你将手牌摸至四张。";
		},
	},
	trigger: { player: "changeHp" },
	filter(event, player) {
		// 阳（storage 为 false）：体力变化为 1 后；阴（storage 为 true）：回复体力至上限后
		if (player.storage.xiaobai_dianchi) {
			return event.num > 0 && player.hp == player.maxHp;
		}
		return player.hp == 1;
	},
	async content(event, trigger, player) {
		if (player.countCards("h") < 4) {
			await player.draw(4 - player.countCards("h"));
		}
		player.changeZhuanhuanji("xiaobai_dianchi");
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_xiancu: {
	audio: 2,
	mark: true,
	marktext: "簇",
	intro: {
		content(storage, player) {
			const suits = player.storage.xiaobai_xiancu_suits || [];
			if (!suits.length) return "本回合暂无牌进入弃牌堆。";
			return "本回合进入弃牌堆的花色：" + suits.map((s) => get.translation(s)).join("、");
		},
	},
	init(player) {
		// 全局转化：所有角色（含自己）获得羡簇的发动能力（帐灯 others 同款模式）
		game.countPlayer((current) => {
			current.addSkill("xiaobai_xiancu_o");
		});
	},
	onremove(player) {
		game.countPlayer((current) => {
			current.removeSkill("xiaobai_xiancu_o");
		});
		delete player.storage.xiaobai_xiancu_suits;
	},
	group: ["xiaobai_xiancu_record", "xiaobai_xiancu_clear"],
	subSkill: {
		record: {
			charlotte: true,
			sub: true,
			trigger: { global: ["cardsDiscardAfter", "discardAfter", "loseAfter", "loseAsyncAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (event.cards || []).some((card) => get.position(card, true) == "d");
			},
			content(event, trigger, player) {
				player.storage.xiaobai_xiancu_suits ??= [];
				for (const card of trigger.cards || []) {
					if (get.position(card, true) != "d") continue;
					const suit = get.suit(card);
					if (suit && !player.storage.xiaobai_xiancu_suits.includes(suit)) {
						player.storage.xiaobai_xiancu_suits.push(suit);
					}
				}
				player.updateMarks("xiaobai_xiancu");
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_xiancu_suits || []).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_xiancu_suits = [];
				player.updateMarks("xiaobai_xiancu");
			},
		},
	},
},
// 挂载到全员的羡簇转化技（charlotte：不显示在技能栏但可用）
xiaobai_xiancu_o: {
	charlotte: true,
	enable: ["chooseToUse", "phaseUse"],
	filter(event, player) {
		const beneficiary = game.findPlayer((current) => current.hasSkill("xiaobai_xiancu"));
		if (!beneficiary?.isIn() || !beneficiary.isDamaged()) return false;
		if (!lib.skill.xiaobai_xiancu_o.checkCards(player)) return false;
		if (event.skill == "xiaobai_xiancu_o" || event._skill == "xiaobai_xiancu_o") return true;
		if (event.name == "chooseToUse" && event.type == "dying") {
			// 邓夫人濒死求桃窗口
			if (event.dying != beneficiary) return false;
			return Boolean(event.filterCard?.(get.autoViewAs({ name: "tao" }, "unsure"), player, event));
		}
		if (event.name == "chooseToUse" && event.type == "phase") {
			// 出牌阶段窗口：桃对邓夫人的可用性已由 isDamaged 判定
			return true;
		}
		return false;
	},
	// 两张与本回合进入弃牌堆花色均不同的手牌
	checkCards(player) {
		const beneficiary = game.findPlayer((current) => current.hasSkill("xiaobai_xiancu"));
		if (!beneficiary) return false;
		const suits = beneficiary.storage.xiaobai_xiancu_suits || [];
		return player.countCards("h", (card) => !suits.includes(get.suit(card, player))) >= 2;
	},
	filterCard(card, player) {
		const beneficiary = game.findPlayer((current) => current.hasSkill("xiaobai_xiancu"));
		const suits = beneficiary?.storage.xiaobai_xiancu_suits || [];
		return !suits.includes(get.suit(card, player));
	},
	selectCard: 2,
	position: "h",
	viewAs: { name: "tao", isCard: true },
	prompt: "羡簇：将两张与本回合进入弃牌堆花色均不同的牌当【桃】对其使用",
	check(card) {
		return 6 - get.value(card);
	},
	async precontent(event, trigger, player) {
		// 出牌阶段窗口：桃的 toself 会把目标锁成使用者，这里强改为受益者（濒死窗口由引擎锁定，不改）
		if (event.type == "phase" && event.result) {
			const beneficiary = game.findPlayer((current) => current.hasSkill("xiaobai_xiancu"));
			if (beneficiary) {
				event.result.targets = [beneficiary];
			}
		}
	},
	ai: {
		order: 4,
		// 濒死求桃预检三件套：canSave 只扫手牌 + save 标签（知识库 #61）
		save: true,
		skillTagFilter(player, tag, arg) {
			if (tag != "save") return false;
			if (!arg?.hasSkill("xiaobai_xiancu")) return false;
			return lib.skill.xiaobai_xiancu_o.checkCards(player);
		},
		result: {
			player(player2) {
				if (_status.event.type == "dying") {
					return get.attitude(player2, _status.event.dying);
				}
				return 0;
			},
		},
	},
},
xiaobai_quanxi: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		return game.hasPlayer((current) => current.isIn());
	},
	filterTarget: true,
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		// 视为对其使用一张真实【树上开花】（原版结算，可被无懈）
		await player.useCard({ name: "kaihua" }, target, "xiaobai_quanxi");
		if (player.isIn() && target.isIn()) {
			// 受到其造成的1点伤害（调用者是受伤者，player 参数为来源）
			await player.damage(target, 1, "nocard");
		}
	},
	ai: {
		order: 5,
		result: {
			player(player) {
				// 树上开花弃牌摸牌对自己有利，但代价1点伤害
				return player.countCards("h") >= 3 ? 0.5 : -0.5;
			},
			target(player, target) {
				return -0.5;
			},
		},
	},
},

// === 楼玄 ===
xiaobai_linji: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { player: "changeHpBefore" },
	filter(event, player) {
		// 每回合首次变化（标记在 content 里打，防止后 After 不派发导致重复触发）
		if (player.storage.xiaobai_linji_round || !player.isIn()) return false;
		const current = _status.currentPhase;
		return Boolean(current?.isIn() && current.countCards("he") >= 2);
	},
	async content(event, trigger, player) {
		player.storage.xiaobai_linji_round = true;
		const current = _status.currentPhase;
		if (!current?.isIn()) return;
		const res = await current.chooseCard("he", true, 2, "凛脊：将两张牌置于牌堆顶或牌堆底").forResult();
		const cards = res?.cards || [];
		if (cards.length < 2) return;
		const pos = await current
			.chooseControl("置于牌堆顶", "置于牌堆底")
			.set("prompt", "凛脊：选择置入端")
			.set("ai", () => 0)
			.forResult();
		const toTop = pos?.control != "置于牌堆底";
		if (toTop) {
			game.cardsGotoPile(cards, "insert");
		} else {
			game.cardsGotoPile(cards);
		}
		game.log(current, "将两张牌置于了牌堆" + (toTop ? "顶" : "底"));
		if (!current.isIn()) return;
		// 可从另一端摸两张牌，防止此体力变化
		const go = await current
			.chooseBool("凛脊：是否从牌堆" + (toTop ? "底" : "顶") + "摸两张牌，防止" + get.translation(player) + "本次体力变化？")
			.set("ai", () => true)
			.forResult();
		if (go?.bool) {
			if (toTop) {
				await current.draw(2, "bottom");
			} else {
				await current.draw(2);
			}
			// 防止此体力变化
			trigger.cancel();
		}
	},
	group: ["xiaobai_linji_clear"],
	subSkill: {
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return Boolean(player.storage.xiaobai_linji_round);
			},
			content(event, trigger, player) {
				player.storage.xiaobai_linji_round = false;
			},
		},
	},
},
xiaobai_lvgu: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		return ui.cardPile.hasChildNodes();
	},
	async content(event, trigger, player) {
		// ① 选观看张数（看 1 配「调整至三」，看 3 配「调整至一」）
		const canView3 = ui.cardPile.childNodes.length >= 3;
		const viewOpts = ["观看牌堆底的一张牌"];
		if (canView3) viewOpts.push("观看牌堆底的三张牌");
		const viewPick = await player
			.chooseControl(viewOpts.concat("cancel2"))
			.set("prompt", "履骨：选择观看方式")
			.set("ai", () => (canView3 ? 1 : 0))
			.forResult();
		if (!viewPick?.control || viewPick.control == "cancel2") return;
		const view3 = viewPick.control == "观看牌堆底的三张牌";
		const n = view3 ? 3 : 1;
		// peek 牌堆底（不移动）
		const cards = get.bottomCards(n, true);
		await player.viewCards("履骨：观看牌堆底" + get.cnNumber(n) + "张牌", cards);
		const targetNum = view3 ? 1 : 3;
		const usedSkill = view3 ? "xiaobai_lvgu_used1" : "xiaobai_lvgu_used3";
		// ② 三选二（每项选后从剩余项中再选一项）
		const labels = {
			adjust: "将手牌数调整至" + get.cnNumber(targetNum),
			use: "使用其中一张不为【杀】的牌",
			losehp: "失去1点体力",
		};
		const usable = cards.filter((card) => get.name(card) != "sha" && player.hasUseTarget(card, false, false));
		const options = [];
		if (!player.hasSkill(usedSkill)) options.push("adjust");
		if (usable.length) options.push("use");
		options.push("losehp");
		const picks = [];
		for (let round = 0; round < 2 && options.length; round++) {
			const ctrl = await player
				.chooseControl(options.map((key) => labels[key]))
				.set("prompt", "履骨：请选择一项" + (round == 0 ? "（共需选择两项）" : "（还可选择一项）"))
				.set("ai", () => 0)
				.forResult();
			const idx = options.findIndex((key) => labels[key] == ctrl?.control);
			if (idx < 0) break;
			picks.push(options[idx]);
			options.splice(idx, 1);
		}
		// ③ 按选择顺序执行
		for (const pick of picks) {
			if (!player.isIn()) return;
			if (pick == "adjust") {
				player.addTempSkill(usedSkill, "phaseAfter");
				const diff = player.countCards("h") - targetNum;
				if (diff > 0) {
					await player.chooseToDiscard(diff, "h", true).forResult();
				} else if (diff < 0) {
					await player.draw(-diff);
				}
			} else if (pick == "use") {
				const pick2 = await player
					.chooseCardButton("履骨：选择使用其中一张牌", usable)
					.set("filterButton", (button) => get.name(button.link) != "sha" && get.player().hasUseTarget(button.link, false, false))
					.set("ai", (button) => get.player().getUseValue(button.link))
					.forResult();
				const card = pick2?.links?.[0];
				if (card) {
					// 不计次使用牌堆底的实体牌（extraUse 同义）
					await player.chooseUseTarget(card, "履骨：你可以使用" + get.translation(card), false).set("addCount", false).forResult();
				}
			} else if (pick == "losehp") {
				await player.loseHp(1);
			}
		}
	},
	subSkill: {
		used1: { charlotte: true, sub: true },
		used3: { charlotte: true, sub: true },
	},
	ai: {
		order: 4,
		result: {
			player: 1,
		},
	},
},

// === 毛皇后 ===
xiaobai_nianxing: {
	audio: 2,
	enable: ["chooseToUse"],
	filter(event, player) {
		if (event.name != "chooseToUse") return false;
		if (player.hasSkill("xiaobai_nianxing_used")) return false;
		if (!player.countCards("he", (card) => get.type(card) == "equip")) return false;
		if (event.skill == "xiaobai_nianxing" || event._skill == "xiaobai_nianxing") return true;
		const jinkUsed = player.storage.xiaobai_nianxing_jink;
		if (event.type == "wuxie") {
			return !jinkUsed && Boolean(event.filterCard?.(get.autoViewAs({ name: "wuxie" }, "unsure"), player, event));
		}
		if (event.type == "respondShan") {
			return Boolean(event.filterCard?.(get.autoViewAs({ name: "shan" }, "unsure"), player, event));
		}
		return false;
	},
	chooseButton: {
		dialog(event, player) {
			const self = String(event.skill || "").startsWith("xiaobai_nianxing");
			const list = [];
			const tryAdd = (name, type) => {
				// 自身选择流程时 event.filterCard 已被包装，跳过探测（知识库 #58）
				if (!self && !event.filterCard(get.autoViewAs({ name }, "unsure"), player, event)) return;
				list.push([type, "", name]);
			};
			if (!player.storage.xiaobai_nianxing_jink) {
				tryAdd("shan", "basic");
				tryAdd("wuxie", "trick");
			} else {
				tryAdd("shan", "basic");
			}
			return ui.create.dialog("辇幸：视为使用一张牌", [list, "vcard"]);
		},
		check(button) {
			if (_status.event.getParent().type != "phase") return 1;
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2] }, null, true));
		},
		backup(links, player) {
			const cardName = links[0][2];
			return {
				audio: "xiaobai_nianxing",
				filterCard: () => false,
				selectCard: 0,
				viewAs: { name: cardName, isCard: true },
				log: false,
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_nianxing");
					player.addTempSkill("xiaobai_nianxing_used", "phaseAfter");
					// ① 选代价动作（选过「弃置」后只能弃置）
					const actions = [];
					if (!player.storage.xiaobai_nianxing_discard) actions.push("使用一张装备牌");
					actions.push("弃置一张装备牌");
					const act = await player
						.chooseControl(actions)
						.set("prompt", "辇幸：选择代价动作")
						.set("ai", () => 0)
						.forResult();
					if (!act?.control) return;
					// ② 选装备牌并执行代价
					if (act.control == "使用一张装备牌") {
						const res = await player
							.chooseCard("h", true, 1, "辇幸：选择使用一张装备牌", (card) => get.type(card) == "equip")
							.forResult();
						const cards = res?.cards || [];
						if (cards.length) {
							await player.useCard(cards[0]);
						}
					} else {
						const res = await player
							.chooseCard("he", true, 1, "辇幸：选择弃置一张装备牌", (card) => get.type(card) == "equip")
							.forResult();
						const cards = res?.cards || [];
						if (cards.length) {
							await player.discard(cards);
							player.storage.xiaobai_nianxing_discard = true;
						}
					}
					// ③ 印出的是闪 → 删去「无懈可击」选项（整局）
					if (cardName == "shan") {
						player.storage.xiaobai_nianxing_jink = true;
					}
				},
			};
		},
		prompt(links) {
			return "辇幸：使用或弃置一张装备牌，视为使用" + (links[0][2] == "shan" ? "【闪】" : "【无懈可击】");
		},
	},
	ai: {
		order: 6,
		result: {
			player: 1,
		},
	},
	subSkill: {
		// ⚠️ 必须真实存在：主技能用 addTempSkill("xiaobai_nianxing_used", …) + hasSkill("xiaobai_nianxing_used") 做次数限制，
		//    缺这个空壳子技能时标记加不进去、限制形同虚设（同预诫的坑）。
		used: {
			charlotte: true,
			sub: true,
		},
	},
},
xiaobai_rongai: {
	audio: 2,
	trigger: { global: "phaseBeginStart" },
	filter(event, player) {
		if (event.player == player || !player.isIn()) return false;
		const hand = player.countCards("h");
		return (!player.hasSkill("xiaobai_rongai_used1") && hand != 1) || (!player.hasSkill("xiaobai_rongai_used4") && hand != 4);
	},
	async content(event, trigger, player) {
		const hand = player.countCards("h");
		const options = [];
		if (!player.hasSkill("xiaobai_rongai_used1") && hand != 1) options.push("调整至1张");
		if (!player.hasSkill("xiaobai_rongai_used4") && hand != 4) options.push("调整至4张");
		if (!options.length) return;
		const ctrl = await player
			.chooseControl(options.concat("cancel2"))
			.set("prompt", "荣哀：将手牌数调整为1或4")
			.set("ai", () => 0)
			.forResult();
		if (!ctrl?.control || ctrl.control == "cancel2") return;
		const target = ctrl.control == "调整至1张" ? 1 : 4;
		player.addTempSkill(target == 1 ? "xiaobai_rongai_used1" : "xiaobai_rongai_used4", "roundStart");
		player.storage.xiaobai_rongai_choice = target;
		const num = hand - target;
		if (num < 0) {
			await player.draw(-num);
		} else if (num > 0) {
			await player.chooseToDiscard(num, "h", true).forResult();
		}
	},
	group: ["xiaobai_rongai_end"],
	subSkill: {
		used1: { charlotte: true, sub: true },
		used4: { charlotte: true, sub: true },
		end: {
			audio: "xiaobai_rongai",
			charlotte: true,
			sub: true,
			name: "荣哀",
			forced: true,
			trigger: { global: "phaseAfter" },
			filter(event, player) {
				if (event.player == player || !player.isIn()) return false;
				if (!player.storage.xiaobai_rongai_choice) return false;
				return (player.getHistory("damage") || []).length > 0;
			},
			async content(event, trigger, player) {
				const other = player.storage.xiaobai_rongai_choice == 1 ? 4 : 1;
				player.storage.xiaobai_rongai_choice = other;
				const num = player.countCards("h") - other;
				if (num < 0) {
					await player.draw(-num);
				} else if (num > 0) {
					await player.chooseToDiscard(num, "h", true).forResult();
				}
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 王嗣 ===
xiaobai_fuqing: {
	audio: 2,
	trigger: { target: "useCardToTarget" },
	filter(event, player) {
		if (!player.isIn() || player.hasSkill("xiaobai_fuqing_used")) return false;
		if (get.name(event.card) != "sha" || !event.isFirstTarget) return false;
		const targets = event.targets || [];
		if (targets.includes(player)) return true;
		return targets.some((tid) => lib.skill.xiaobai_fuqing.passBy(event.player, tid, player));
	},
	// 从 from 沿座位链到 target 的较短弧是否经过 pass（怀烈同款弧线判定）
	passBy(from, target, pass) {
		if (target == from || !from.isIn() || !target.isIn() || !pass.isIn()) return false;
		let cur = from.getNext(), cw = false, cwSteps = 1;
		while (cur && cur != from) {
			if (cur == pass) cw = true;
			if (cur == target) break;
			cur = cur.getNext();
			cwSteps++;
		}
		cur = from.getPrevious();
		let ccw = false, ccwSteps = 1;
		while (cur && cur != from) {
			if (cur == pass) ccw = true;
			if (cur == target) break;
			cur = cur.getPrevious();
			ccwSteps++;
		}
		if (cwSteps < ccwSteps) return cw;
		if (cwSteps > ccwSteps) return ccw;
		return cw || ccw;
	},
	async cost(event, trigger, player) {
		const result = await player
			.chooseTarget("扶倾：令此【杀】无效，并视为使用一张【以逸待劳】", [1, 3], (card, player2, targetx) => targetx.isIn())
			.set("ai", (targetx) => get.attitude(player, targetx))
			.forResult();
		event.result = result?.bool && result.targets?.length ? result : { bool: false };
	},
	async content(event, trigger, player) {
		player.addTempSkill("xiaobai_fuqing_used", "roundStart");
		// 视为使用【以逸待劳】
		const useEvent = player.useCard(get.autoViewAs({ name: "yiyi" }, []), event.targets, "xiaobai_fuqing");
		await useEvent;
		// 收集因此弃置的牌（以逸待劳目标的 chooseToDiscard）
		const discards = [];
		(function find(evt) {
			for (const child of evt.childEvents || []) {
				if (child.name == "discard" && child.cards?.length) discards.addArray(child.cards);
				find(child);
			}
		})(useEvent);
		const pool = discards.filter((card) => get.position(card, true) == "d");
		// 此【杀】的使用者可使用至多 X 张因此弃置的牌（X = 以逸待劳的目标数）
		const user = trigger.player;
		const X = event.targets.length;
		if (user.isIn() && pool.length) {
			for (let i = 0; i < X && pool.length; i++) {
				if (!user.isIn()) break;
				const avail = pool.filter((card) => get.position(card, true) == "d" && user.hasUseTarget(card, true, false));
				if (!avail.length) break;
				const res = await user
					.chooseCardButton("扶倾：你可以使用其中一张因此弃置的牌（至多" + get.cnNumber(X - i) + "张）", avail)
					.set("ai", (button) => get.player().getUseValue(button.link))
					.forResult();
				const card = res?.links?.[0];
				if (!card) break;
				pool.remove(card);
				await user.chooseUseTarget(card, "扶倾：是否使用" + get.translation(card), false).forResult();
			}
		}
		// 此【杀】无效：全部目标排除（结算循环自动跳过）
		const shaEvent = trigger.getParent("useCard");
		if (shaEvent?.targets?.length) {
			shaEvent.excluded.addArray(shaEvent.targets);
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
	subSkill: {
		// ⚠️ 必须真实存在：主技能用 addTempSkill("xiaobai_fuqing_used", …) + hasSkill("xiaobai_fuqing_used") 做次数限制，
		//    缺这个空壳子技能时标记加不进去、限制形同虚设（同预诫的坑）。
		used: {
			charlotte: true,
			sub: true,
		},
	},
},
xiaobai_qinrong: {
	audio: 2,
	trigger: { player: "phaseDrawBegin1" },
	direct: true,
	filter(event, player) {
		return player.isIn();
	},
	async content(event, trigger, player) {
		// 选【远交近攻】的目标
		const result = await player
			.chooseTarget("亲戎：放弃摸牌，改为视为使用一张【远交近攻】", 1, (card, player2, targetx) => {
				return targetx != player && targetx.isIn() && lib.filter.targetEnabled(get.autoViewAs({ name: "yuanjiao" }, []), player, targetx);
			})
			.set("ai", (targetx) => get.attitude(player, targetx))
			.forResult();
		if (!result?.bool || !result.targets?.length) return;
		player.logSkill("xiaobai_qinrong");
		// 放弃摸牌
		trigger.num = 0;
		// 视为使用【远交近攻】
		const target = result.targets[0];
		await player.useCard(get.autoViewAs({ name: "yuanjiao" }, []), [target], "xiaobai_qinrong");
		if (!player.isIn() || !target.isIn()) return;
		// 与此牌的目标议事
		const debate = await player.chooseToDebate([player, target]).forResult();
		if (debate?.bool && debate.opinion && target.isIn() && player.isIn()) {
			// 若议事有结果，其变更势力至与你相同
			await target.changeGroup(player.group);
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 孙韶 ===
xiaobai_leicheng: {
	audio: 2,
	trigger: { player: "useCard" },
	filter(event, player) {
		return get.type(event.card) == "equip";
	},
	async cost(event, trigger, player) {
		const options = [];
		const last = player.storage.xiaobai_leicheng_last;
		if (last?.isIn() && last.countCards("he") > 0) options.push("将其一张牌当【以逸待劳】对你使用");
		options.push("摸至四张牌，然后有角色下次使用装备时，其弃置你一张手牌");
		const ctrl = await player
			.chooseControl(options.concat("cancel2"))
			.set("prompt", "垒城：请选择一项")
			.set("ai", () => 0)
			.forResult();
		if (!ctrl?.control || ctrl.control == "cancel2") return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { choice: ctrl.control } };
	},
	async content(event, trigger, player) {
		const choice = event.cost_data.choice;
		if (choice.startsWith("将其一张牌")) {
			// 选项1：将上一名使用装备牌的角色的一张牌当【以逸待劳】对你使用
			const last = player.storage.xiaobai_leicheng_last;
			if (!last?.isIn() || last.countCards("he") <= 0) return;
			const res = await player
				.choosePlayerCard(last, "he", true, 1, "垒城：选择" + get.translation(last) + "的一张牌")
				.forResult();
			const card = res?.cards?.[0] || res?.links?.[0];
			if (!card) return;
			// ⚠️ 实体牌要显式传第 2 参（同且佃的坑）
			await player.useCard(get.autoViewAs({ name: "yiyi" }, [card]), [card], [player], "xiaobai_leicheng");
		} else {
			// 选项2：摸至四张牌，并挂「下次使用装备」标记
			if (player.countCards("h") < 4) {
				await player.draw(4 - player.countCards("h"));
			}
			player.storage.xiaobai_leicheng_trigger = true;
		}
	},
	group: ["xiaobai_leicheng_next", "xiaobai_leicheng_record"],
	subSkill: {
		// 选项2入口（先跑）：设临时标记；下次装备使用时由 next 转正
		next: {
			charlotte: true,
			sub: true,
			trigger: { global: "useCard" },
			forced: true,
			_popup: false,
			silent: true,
			"_priority": -1,
			filter(event, player) {
				return get.type(event.card) == "equip"
					&& (Boolean(player.storage.xiaobai_leicheng_next) || Boolean(player.storage.xiaobai_leicheng_trigger));
			},
			async content(event, trigger, player) {
				// 先处理已生效的「下次」标记：装备使用者弃置孙韶一张手牌
				if (player.storage.xiaobai_leicheng_next) {
					player.storage.xiaobai_leicheng_next = false;
					const user = trigger.player;
					if (player.isIn() && user.isIn() && user != player && player.countCards("h") > 0) {
						const res = await user
							.choosePlayerCard(player, "h", true, 1, "垒城：弃置" + get.translation(player) + "的一张手牌")
							.forResult();
						const card = res?.cards?.[0];
						if (card) {
							await player.discard([card]);
						}
					}
				}
				// 再转正：本次选的选项2从下一次装备使用开始生效
				if (player.storage.xiaobai_leicheng_trigger) {
					player.storage.xiaobai_leicheng_trigger = false;
					player.storage.xiaobai_leicheng_next = true;
				}
			},
		},
		// 记录「上一名使用装备牌的角色」
		record: {
			charlotte: true,
			sub: true,
			trigger: { global: "useCardAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return get.type(event.card) == "equip" && event.player?.isIn();
			},
			content(event, trigger, player) {
				player.storage.xiaobai_leicheng_last = trigger.player;
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_liehe: {
	audio: 2,
	trigger: { global: "phaseAfter" },
	filter(event, player) {
		if (!player.isIn()) return false;
		// 你本回合失去过牌
		const lost = (player.getHistory("lose") || []).length + (player.getHistory("loseAsync") || []).length;
		return lost > 0;
	},
	async content(event, trigger, player) {
		const to = event.player || trigger.player; // 当前回合角色
		if (!to?.isIn() || to == player) return;
		const diff = player.countCards("e") - to.countCards("e");
		// 恰好拉平装备区数量的一项
		if (diff == 1) {
			const opts = ["令其使用一张装备牌"];
			if (player.countCards("e") > 0) opts.push("获得自己装备区一张牌");
			opts.push("将自己装备区一张牌移给其他角色");
			const ctrl = await player
				.chooseControl(opts.concat("cancel2"))
				.set("prompt", "列合：选择一项，使你们装备区牌数相等")
				.set("ai", () => 0)
				.forResult();
			if (!ctrl?.control || ctrl.control == "cancel2") return;
			if (ctrl.control == "令其使用一张装备牌") {
				const res = await to
					.chooseCard("h", true, 1, "列合：请使用一张装备牌", (card) => get.type(card) == "equip")
					.forResult();
				if (res?.cards?.length) {
					await to.chooseUseTarget(res.cards[0], true).forResult();
				}
			} else if (ctrl.control == "获得自己装备区一张牌") {
				const res = await player
					.chooseCard("e", true, 1, "列合：选择获得自己装备区的一张牌")
					.forResult();
				if (res?.cards?.length) {
					await player.gain(res.cards, "gain2");
				}
			} else {
				await player.moveCard("列合：将你装备区的一张牌移至其他角色装备区", "e");
			}
		} else if (diff == -1) {
			const opts = ["你使用一张装备牌"];
			if (to.countCards("e") > 0) opts.push("令其收回装备区一张牌或将装备移给其他角色");
			const ctrl = await player
				.chooseControl(opts.concat("cancel2"))
				.set("prompt", "列合：选择一项，使你们装备区牌数相等")
				.set("ai", () => 0)
				.forResult();
			if (!ctrl?.control || ctrl.control == "cancel2") return;
			if (ctrl.control == "你使用一张装备牌") {
				const res = await player
					.chooseCard("h", true, 1, "列合：请使用一张装备牌", (card) => get.type(card) == "equip")
					.forResult();
				if (res?.cards?.length) {
					await player.chooseUseTarget(res.cards[0], true).forResult();
				}
			} else {
				const sub = await to
					.chooseControl("获得自己装备区一张牌", "将装备牌移给其他角色")
					.set("prompt", "列合：选择一项")
					.set("ai", () => 0)
					.forResult();
				if (sub?.control == "获得自己装备区一张牌") {
					const res = await to.chooseCard("e", true, 1, "列合：选择收回自己装备区的一张牌").forResult();
					if (res?.cards?.length) {
						await to.gain(res.cards, "gain2");
					}
				} else {
					await to.moveCard("列合：将你装备区的一张牌移至其他角色装备区", "e");
				}
			}
		} else if (Math.abs(diff) == 2) {
			// 移动装备拉平两格差距
			if (diff == 2 && player.countCards("e") > 0) {
				await player.moveCard("列合：将你装备区的一张牌移至" + get.translation(to) + "的装备区");
			} else if (diff == -2 && to.countCards("e") > 0) {
				await to.moveCard("列合：将你装备区的一张牌移至" + get.translation(player) + "的装备区");
			}
		} else if (diff == 0) {
			// 双方相等：使用一张装备牌替换（数量不变）
			const who = await player
				.chooseTarget("列合：选择一名角色使用一张装备牌（替换装备）", 1, (card, player2, targetx) => targetx == player || targetx == to)
				.set("ai", (targetx) => get.attitude(player, targetx))
				.forResult();
			const executor = who?.targets?.[0];
			if (!executor?.isIn()) return;
			const res = await executor
				.chooseCard("h", true, 1, "列合：请使用一张装备牌（可替换已有装备）", (card) => get.type(card) == "equip")
				.forResult();
			if (res?.cards?.length) {
				await executor.chooseUseTarget(res.cards[0], true).forResult();
			}
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 鲍出 ===
xiaobai_ziren: {
	audio: 2,
	enable: "chooseToUse",
	hiddenCard(player, name) {
		return name == "sha" && player.countCards("hes") >= 3;
	},
	filter(event, player) {
		if (player.countCards("hes") < 3) return false;
		if (event.skill == "xiaobai_ziren" || event._skill == "xiaobai_ziren") return true;
		return Boolean(event.filterCard?.(get.autoViewAs({ name: "sha" }, "unsure"), player, event));
	},
	chooseButton: {
		dialog(event, player) {
			return ui.create.dialog("眦刃：将三张牌当不可响应的【杀】使用", [[["basic", "", "sha"]], "vcard"]);
		},
		check(button) {
			return 1;
		},
		backup(links, player) {
			return {
				audio: "xiaobai_ziren",
				filterCard: true,
				selectCard: 3,
				position: "hes",
				viewAs(cards, player) {
					// 函数式 viewAs：空材料时返回仅由状态决定的占位（知识库 #57）
					const same = cards.length == 3 && get.type(cards[0], false) == get.type(cards[1], false) && get.type(cards[1], false) == get.type(cards[2], false);
					return { name: "sha", isCard: true, storage: { xiaobai_ziren_same: same, xiaobai_ziren: true } };
				},
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_ziren");
					const same = event.result?.card?.storage?.xiaobai_ziren_same;
					// 眦刃的杀恒不可响应（directHit 在本次使用内生效）
					player.addTempSkill("xiaobai_ziren_direct", "useCardAfter");
					if (same) {
						// 三张类别相同：无距离限制 + 可额外指定任意名目标
						player.addTempSkill("xiaobai_ziren_same", "useCardAfter");
					}
				},
			};
		},
		prompt(links) {
			return "眦刃：将三张牌当不可响应的【杀】使用，若类别相同则可额外指定任意名目标（无距离限制）";
		},
	},
	subSkill: {
		// 眦刃的杀不可被响应（结算前对本次使用的目标全体 directHit）
		direct: {
			charlotte: true,
			sub: true,
			trigger: { player: "useCardBegin" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.card?.storage?.xiaobai_ziren;
			},
			content(event, trigger, player) {
				trigger.directHit.addArray(game.filterPlayer());
			},
		},
		same: {
			charlotte: true,
			sub: true,
			mod: {
				// 眦刃转化杀无距离限制
				targetInRange(card, player, target) {
					if (card?.storage?.xiaobai_ziren_same) return true;
				},
			},
			// 可额外指定任意名目标（攀弦 pxjiuyuan 同款范式）
			trigger: { player: "useCard2" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.card?.storage?.xiaobai_ziren_same
					&& game.hasPlayer((target) => target != player && !event.targets.includes(target) && lib.filter.targetEnabled2(event.card, player, target));
			},
			async content(event, trigger, player) {
				const targets = game.filterPlayer((target) => target != player && !trigger.targets.includes(target) && lib.filter.targetEnabled2(trigger.card, player, target));
				const res = await player
					.chooseTarget({
						prompt: "眦刃：为这张【杀】添加任意个目标",
						selectTarget: [1, Infinity],
						filterTarget(card, player2, target) {
							return get.event().targets.includes(target);
						},
						targets,
						ai(target) {
							return get.effect(target, _status.event.getTrigger().card, get.player());
						},
					})
					.forResult();
				if (res?.targets?.length) {
					trigger.targets.addArray(res.targets);
				}
			},
		},
	},
	ai: {
		order: 6,
		result: {
			player: 1,
		},
	},
},
xiaobai_renxie: {
	audio: 2,
	trigger: { target: "useCardToTarget" },
	direct: true,
	filter(event, player) {
		if (event.player != player || !player.isIn()) return false;
		if (!event.isFirstTarget) return false;
		if (!(event.targets || []).length) return false;
		return Boolean(get.tag(event.card, "damage"));
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_renxie");
		const shaEvent = trigger.getParent("useCard");
		// 依次令每个目标交给你至少一张牌（强制）
		for (const current of trigger.targets || []) {
			if (!current.isIn() || current.countCards("he") <= 0) continue;
			const res = await current
				.chooseCard("he", true, [1, current.countCards("he")], "衽挟：交给" + get.translation(player) + "至少一张牌")
				.set("ai", (card) => 5 - get.value(card))
				.forResult();
			if (res?.cards?.length) {
				current.give(res.cards, player);
			}
		}
		// 此牌的伤害值改为你手牌中缺少的类别数（3 - 现有类别数）
		const types = [];
		for (const card of player.getCards("h")) {
			const type = get.type(card, null, player);
			if (type && !types.includes(type)) types.push(type);
		}
		const hurt = 3 - types.length;
		if (shaEvent && typeof shaEvent.baseDamage == "number") {
			shaEvent.baseDamage = hurt;
		}
		if (shaEvent?.card) {
			shaEvent.card.storage ??= {};
			shaEvent.card.storage.xiaobai_renxie = true;
		}
	},
	group: ["xiaobai_renxie_recover"],
	subSkill: {
		// 目标因此受到伤害后，其可令你获得其一张牌，然后回复1点体力
		recover: {
			audio: "xiaobai_renxie",
			charlotte: true,
			sub: true,
			name: "衽挟",
			trigger: { global: "damageEnd" },
			filter(event, player) {
				if (event.source != player || !event.player?.isIn() || !player.isIn()) return false;
				if (!event.card?.storage?.xiaobai_renxie) return false;
				return event.player.isDamaged() && event.player.countCards("he") > 0;
			},
			async content(event, trigger, player) {
				const target = trigger.player;
				const go = await target
					.chooseBool("衽挟：是否令" + get.translation(player) + "获得你一张牌，然后你回复1点体力？")
					.set("ai", () => (get.attitude(target, player) > 0 ? 1 : 0))
					.forResult();
				if (!go?.bool) return;
				const res = await player
					.choosePlayerCard(target, "he", true, 1, "衽挟：选择获得" + get.translation(target) + "的一张牌")
					.forResult();
				const card = res?.cards?.[0] || res?.links?.[0];
				if (card) {
					await player.gain([card], target, "give");
				}
				if (target.isIn() && target.isDamaged()) {
					await target.recover(1);
				}
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 胡质 ===
xiaobai_qietian: {
	audio: 2,
	trigger: { global: "phaseJieshuBegin" },
	filter(event, player) {
		return player.isIn() && player.countCards("he", (card) => get.color(card, player) == "black") > 0;
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseCard("he", "且佃：你可以将一张黑色牌当【无中生有】使用", 1, (card) => get.color(card, player) == "black")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		event.result = res?.cards?.length ? { bool: true, cost_data: { cards: res.cards } } : { bool: false };
	},
	async content(event, trigger, player) {
		const target = trigger.player; // 结束阶段的角色
		const card = event.cost_data.cards[0];
		// ⚠️ 实体牌必须显式作为第 2 个参数传入。player.useCard 里 `if (next.cards == void 0) next.cards = [next.card]`
		// （player.js）—— 只传 vcard 的话 event.cards 会变成那张**虚拟牌本身**而不是底牌，
		// 引擎在 content.js:9097 按 event.cards 结算「失去实体牌」时就拿不到黑牌 → 牌不消耗。
		// 原生写法：useCard(get.autoViewAs({...}, cards), cards, targets)（见 character/jsrg.js:1028、yingbian.js:4583）
		await player.useCard(get.autoViewAs({ name: "wuzhong" }, [card]), [card], [player], "xiaobai_qietian");
		if (!player.isIn() || !target.isIn()) return;
		// 交给其一张牌
		const res = await player
			.chooseCard("he", true, 1, "且佃：交给" + get.translation(target) + "一张牌")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (res?.cards?.length) {
			player.give(res.cards, target);
		}
		// 接力：失去〖且佃〗并令其获得〖且守〗
		if (player.isIn() && target.isIn() && player.hasSkill("xiaobai_qietian") && !target.hasSkill("xiaobai_qieshou")) {
			const go = await player
				.chooseBool("且佃：是否失去〖且佃〗并令" + get.translation(target) + "获得〖且守〗？")
				.set("ai", () => 0)
				.forResult();
			if (go?.bool) {
				player.removeSkill("xiaobai_qietian");
				target.addSkill("xiaobai_qieshou");
			}
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_qieshou: {
	audio: 2,
	enable: ["chooseToUse", "chooseToRespond"],
	position: "he",
	filterCard(card) {
		return get.type(card) == "equip";
	},
	selectCard: 1,
	viewAs: { name: "shan", isCard: true, storage: { xiaobai_qieshou: true } },
	prompt: "且守：将一张装备牌当【闪】使用或打出",
	filter(event, player) {
		if (event.skill == "xiaobai_qieshou" || event._skill == "xiaobai_qieshou") return true;
		return Boolean(event.filterCard?.(get.autoViewAs({ name: "shan" }, "unsure"), player, event));
	},
	check(card) {
		return 6 - get.value(card);
	},
	group: ["xiaobai_qieshou_after"],
	subSkill: {
		after: {
			audio: "xiaobai_qieshou",
			charlotte: true,
			sub: true,
			name: "且守",
			trigger: { global: "useCardAfter" },
			filter(event, player) {
				return event.player == player && Boolean(event.card?.storage?.xiaobai_qieshou) && (event.cards || []).length > 0;
			},
			async content(event, trigger, player) {
				const card = trigger.cards[0];
				const res = await player
					.chooseTarget("且守：令一名其他角色获得" + get.translation(card), 1, lib.filter.notMe)
					.set("ai", (target) => get.attitude(player, target))
					.forResult();
				const to = res?.targets?.[0];
				if (!to?.isIn()) return;
				if (get.position(card, true) == "d") {
					await to.gain([card], "gain2");
				}
				// 接力：失去〖且守〗并令其获得〖且佃〗
				if (player.isIn() && player.hasSkill("xiaobai_qieshou") && !to.hasSkill("xiaobai_qietian")) {
					const go = await player
						.chooseBool("且守：是否失去〖且守〗并令" + get.translation(to) + "获得〖且佃〗？")
						.set("ai", () => 0)
						.forResult();
					if (go?.bool) {
						player.removeSkill("xiaobai_qieshou");
						to.addSkill("xiaobai_qietian");
					}
				}
			},
		},
	},
	ai: {
		respondShan: true,
		skillTagFilter(player, tag, arg) {
			return player.countCards("he", (card) => get.type(card) == "equip") > 0;
		},
		result: {
			player: 1,
		},
	},
},

// === 王必 ===
xiaobai_zhini: {
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		return player.isIn() && game.hasPlayer((current) => current != player && current.isIn());
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseTarget("指逆：选择一名其他角色", 1, lib.filter.notMe)
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
		event.result = res?.bool && res.targets?.length ? res : { bool: false };
	},
	async content(event, trigger, player) {
		const to = event.targets[0];
		let hurtNum = 0;
		let hurtTimes = 0;
		const steps = [
			{ num: 3, action: "show", label: "展示" },
			{ num: 2, action: "recast", label: "重铸" },
			{ num: 1, action: "discard", label: "弃置" },
		];
		for (const step of steps) {
			if (!player.isIn() || !to.isIn()) return;
			const n = Math.min(to.countCards("h"), step.num);
			if (n <= 0) continue;
			const res = await player
				.choosePlayerCard(to, "he", true, n, "指逆：选择" + get.translation(to) + "的" + get.cnNumber(n) + "张牌" + step.label)
				.forResult();
			const cards = res?.cards || res?.links || [];
			if (!cards.length) continue;
			// 统计伤害牌：累计三张 → 造成伤害；三步均有 → 翻面
			for (const card of cards) {
				if (get.tag(card, "damage")) hurtNum++;
			}
			if (cards.some((card) => get.tag(card, "damage"))) hurtTimes++;
			if (step.action == "show") {
				await to.showCards(cards);
			} else if (step.action == "recast") {
				await to.recast(cards);
			} else {
				await to.discard(cards);
			}
			if (hurtNum >= 3) {
				if (to.isIn() && player.isIn()) {
					await to.damage(player, 1, "nocard");
				}
				hurtNum = -1;
			}
		}
		if (hurtTimes >= 3 && to.isIn() && player.isIn()) {
			await to.turnOver();
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_yangying: {
	audio: 2,
	trigger: { player: "phaseJieshuBegin" },
	filter(event, player) {
		return player.isIn() && game.hasPlayer((current) => current.countCards("he") > 0);
	},
	async content(event, trigger, player) {
		const cards = [];
		const othersBasic = new Set(); // 被重铸了基本牌的其他角色
		for (let i = 0; i < 3; i++) {
			if (!player.isIn()) return;
			const cands = game.filterPlayer((current) => current.countCards("he") > 0);
			if (!cands.length) break;
			const res = await player
				.chooseTarget("炴营：选择一名角色，重铸其一张牌（共三张，可中断）", 1, (card, player2, targetx) => get.event().cands.includes(targetx))
				.set("cands", cands)
				.set("ai", (target) => -get.attitude(player, target))
				.forResult();
			const to = res?.targets?.[0];
			if (!to?.isIn()) return;
			const res2 = await player
				.choosePlayerCard(to, "he", true, 1, "炴营：选择重铸的一张牌")
				.forResult();
			const card = res2?.cards?.[0];
			if (!card) continue;
			cards.push(card);
			if (to != player && get.type(card) == "basic") othersBasic.add(to);
			await to.recast([card]);
		}
		if (!cards.length || !player.isIn()) return;
		if (othersBasic.size == 0) {
			// 均为你的牌：依次蓄谋之
			const go = await player
				.chooseBool("炴营：是否将重铸的牌依次蓄谋？")
				.set("ai", () => true)
				.forResult();
			if (go?.bool) {
				for (const card of cards) {
					if (get.position(card, true) == "d" && player.isIn()) {
						await player.addJudge({ name: "xumou_jsrg" }, [card]);
					}
				}
			}
		} else {
			// 失去基本牌的角色可以将一张牌当【火攻】或火【杀】对王必使用（无距离限制）
			for (const other of othersBasic) {
				if (!other.isIn() || !player.isIn()) continue;
				const res = await other
					.chooseCard("hes", "炴营：你可以将一张牌当【火攻】或火【杀】对" + get.translation(player) + "使用", 1)
					.set("ai", (card) => 5 - get.value(card))
					.forResult();
				const card = res?.cards?.[0];
				if (!card) continue;
				const namePick = await other
					.chooseControl("【火攻】", "火【杀】", "cancel2")
					.set("prompt", "炴营：视为使用哪张牌？")
					.set("ai", () => 0)
					.forResult();
				if (!namePick?.control || namePick.control == "cancel2") continue;
				const vcard = namePick.control == "【火攻】" ? { name: "huogong" } : { name: "sha", nature: "fire" };
				// ⚠️ 实体牌要显式传第 2 参（同且佃的坑），否则这张牌不消耗
				await other.useCard(get.autoViewAs(vcard, [card]), [card], [player], "xiaobai_yangying");
			}
			// 「你可以使用被重铸的牌进行响应」：受限于响应窗口的弃牌堆印牌 UI，此处暂不实现
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 徐母 ===
xiaobai_xiaohuang: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => lib.skill.xiaobai_xiaohuang.filterTarget(null, player, current));
	},
	filterTarget(card, player, target) {
		return target != player && target.countCards("h") > target.hp;
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		await lib.xiaobaiTiaoxinFlow(player, event.targets[0]);
	},
	group: ["xiaobai_xiaohuang_damage"],
	subSkill: {
		damage: {
			audio: "xiaobai_xiaohuang",
			charlotte: true,
			sub: true,
			name: "嚣獚",
			trigger: { source: "damageEnd" },
			filter(event, player) {
				if (!player.isIn()) return false;
				return game.hasPlayer((current) => lib.skill.xiaobai_xiaohuang.filterTarget(null, player, current));
			},
			async content(event, trigger, player) {
				const res = await player
					.chooseTarget("嚣獚：对一名手牌数大于体力值的其他角色发动「挑衅」", 1, (card, player2, targetx) => lib.skill.xiaobai_xiaohuang.filterTarget(null, player, targetx))
					.set("ai", (target) => -get.attitude(player, target))
					.forResult();
				if (res?.bool && res.targets?.length) {
					await lib.xiaobaiTiaoxinFlow(player, res.targets[0]);
				}
			},
		},
	},
	ai: {
		order: 6,
		result: {
			player: 1,
		},
	},
},
xiaobai_shegeng: {
	audio: 2,
	trigger: { player: "damageEnd" },
	filter(event, player) {
		if (!player.isIn()) return false;
		return game.hasPlayer((current) => current != player && current != event.source && current.isIn());
	},
	async content(event, trigger, player) {
		const res = await player
			.chooseTarget("舌耕：对一名除伤害来源外的其他角色发动「严教」", 1, (card, player2, targetx) => targetx != player && targetx != trigger.source && targetx.isIn())
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!res?.bool || !res.targets?.length) return;
		const result = await lib.xiaobaiYanjiaoFlow(player, res.targets[0], player.storage.xiaobai_yanjiao_extra || 0);
		// 若你因此获得的牌更多：下一次发动「挑衅」时额外弃置一张牌
		if (result.myNum > result.toNum) {
			player.storage.xiaobai_tiaoxin_extra = (player.storage.xiaobai_tiaoxin_extra || 0) + 1;
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// 严教的本回合手牌上限-1
xiaobai_yanjiao_minus: {
	charlotte: true,
	sub: true,
	mark: true,
	marktext: "教",
	intro: { content: "本回合手牌上限-1" },
	mod: {
		maxHandcard(current, num) {
			return num - 1;
		},
	},
},

// === 胡综 ===
xiaobai_mozhuan: {
	audio: 2,
	mark: true,
	marktext: "墨",
	intro: {
		content(storage, player) {
			const order = ["【杀】", "【酒】", "【闪】", "【桃】"];
			const cur = player.storage.xiaobai_mozhuan || 0;
			return "当前项：" + order[cur] + "。跨越到其他项需多出等量材料牌。";
		},
	},
	enable: ["chooseToUse", "chooseToRespond"],
	hiddenCard(player, name) {
		return ["sha", "analeptic", "shan", "peach"].includes(name) && player.countCards("hes", (card) => !(get.type(card, false) == "basic" && get.color(card, false) == "red")) >= 1;
	},
	filter(event, player) {
		if (event.skill == "xiaobai_mozhuan" || event._skill == "xiaobai_mozhuan") return true;
		const order = ["sha", "analeptic", "shan", "peach"];
		return order.some((name) => event.filterCard?.(get.autoViewAs({ name }, "unsure"), player, event));
	},
	chooseButton: {
		dialog(event, player) {
			const order = [
				["basic", "", "sha"],
				["basic", "", "analeptic"],
				["basic", "", "shan"],
				["basic", "", "peach"],
			];
			return ui.create.dialog("墨撰：视为使用或打出一张基本牌", [order, "vcard"]);
		},
		check(button) {
			if (_status.event.getParent().type != "phase") return 1;
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2] }, null, true));
		},
		backup(links, player) {
			const order = ["sha", "analeptic", "shan", "peach"];
			const idx = order.indexOf(links[0][2]);
			const cur = player.storage.xiaobai_mozhuan || 0;
			const X = Math.abs(idx - cur);
			return {
				audio: "xiaobai_mozhuan",
				filterCard(card) {
					// 材料为黑色牌或非基本牌（排除红色基本牌）
					return !(get.type(card, false) == "basic" && get.color(card, false) == "red");
				},
				selectCard: X + 1,
				position: "hes",
				viewAs: { name: links[0][2], isCard: true, storage: { xiaobai_mozhuan: true } },
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_mozhuan");
					// 转换至所选项
					player.storage.xiaobai_mozhuan = order.indexOf(links[0][2]);
					player.updateMarks("xiaobai_mozhuan");
					// 材料均为黑色非基本牌 → 结算后令一名角色获得一张【影】
					const mats = event.result.cards || [];
					if (mats.length && mats.every((card) => get.color(card, player) == "black" && get.type(card, null, player) != "basic")) {
						event.result.card.storage.xiaobai_mozhuan_ying = true;
					}
				},
			};
		},
		prompt(links) {
			const order = ["sha", "analeptic", "shan", "peach"];
			const cur = player.storage.xiaobai_mozhuan || 0;
			const X = Math.abs(order.indexOf(links[0][2]) - cur);
			return "墨撰：将" + get.cnNumber(X + 1) + "张黑色牌或非基本牌当【" + get.translation(links[0][2]) + "】使用或打出";
		},
	},
	group: ["xiaobai_mozhuan_ying"],
	subSkill: {
		ying: {
			audio: "xiaobai_mozhuan",
			charlotte: true,
			sub: true,
			name: "墨撰",
			trigger: { global: "useCardAfter" },
			direct: true,
			filter(event, player) {
				return event.player == player && Boolean(event.card?.storage?.xiaobai_mozhuan_ying) && player.isIn();
			},
			async content(event, trigger, player) {
				player.logSkill("xiaobai_mozhuan");
				const res = await player
					.chooseTarget("墨撰：令一名角色获得一张【影】", 1, (card, player2, targetx) => targetx.isIn())
					.set("ai", (target) => get.attitude(player, target))
					.forResult();
				const to = res?.targets?.[0];
				if (to?.isIn()) {
					await to.gain(lib.card.ying.getYing(1), "gain2");
				}
			},
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},
xiaobai_zuocui: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		// 目标：手牌数与装备区牌数之差恰好为本回合你造成的伤害量
		const dmg = (player.getHistory("sourceDamage") || []).reduce((sum, evt) => sum + (evt.num || 0), 0);
		return game.hasPlayer((current) => current != player && Math.abs(current.countCards("h") - current.countCards("e")) == dmg);
	},
	filterTarget(card, player, target) {
		const dmg = (player.getHistory("sourceDamage") || []).reduce((sum, evt) => sum + (evt.num || 0), 0);
		return target != player && Math.abs(target.countCards("h") - target.countCards("e")) == dmg;
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		await target.damage(player, 1, "nocard");
		if (!target.isIn() || !player.isIn()) return;
		// 其可弃置一张♠牌并回复1点体力，令你选择一项
		const hasSpade = target.countCards("he", (card) => get.suit(card, target) == "spade") > 0;
		if (hasSpade && target.isDamaged()) {
			const go = await target
				.chooseBool("佐榱：是否弃置一张♠牌并回复1点体力，令" + get.translation(player) + "选择一项？")
				.set("ai", () => (get.attitude(target, player) > 0 ? 1 : 0))
				.forResult();
			if (go?.bool) {
				const res = await target
					.chooseCard("he", true, 1, "佐榱：弃置一张♠牌", (card) => get.suit(card, target) == "spade")
					.forResult();
				if (res?.cards?.length) {
					await target.discard(res.cards);
					if (target.isDamaged()) {
						await target.recover(1);
					}
					const ctrl = await player
						.chooseControl("摸两张牌", "获得其场上一张牌并转换〖墨撰〗至下一项")
						.set("prompt", "佐榱：请选择一项")
						.set("ai", () => 1)
						.forResult();
					if (ctrl?.control == "摸两张牌") {
						await player.draw(2);
					} else if (ctrl?.control) {
						const res2 = await player
							.choosePlayerCard(target, "ej", true, 1, "佐榱：获得" + get.translation(target) + "场上一张牌")
							.forResult();
						const card = res2?.cards?.[0] || res2?.links?.[0];
						if (card) {
							await player.gain([card], target, "giveAuto");
						}
						player.storage.xiaobai_mozhuan = ((player.storage.xiaobai_mozhuan || 0) + 1) % 4;
						player.updateMarks("xiaobai_mozhuan");
					}
				}
			}
		}
	},
	ai: {
		order: 6,
		result: {
			player: 1,
			target: -1,
		},
	},
},

// === 赵咨 ===
xiaobai_fulun: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("h") > 0;
	},
	async content(event, trigger, player) {
		player.showHandcards("富论：展示所有手牌");
		let base = null; // 上一次使用的底牌点数
		while (player.isIn() && player.countCards("h")) {
			const hs = player.getCards("h");
			let minCard = hs[0];
			for (const card of hs) {
				if (get.number(card) < get.number(minCard)) minCard = card;
			}
			if (base !== null) {
				// 重复阶段：仅当手牌中存在比上次底牌点数更小的牌才询问
				if (get.number(minCard) >= base) break;
				const go = await player
					.chooseBool("富论：是否重复此流程？")
					.set("ai", () => true)
					.forResult();
				if (!go?.bool) break;
			}
			base = get.number(minCard);
			await player.useCard(get.autoViewAs({ name: "wuzhong" }, [minCard]), [player], "xiaobai_fulun");
		}
	},
	ai: {
		order: 7,
		result: {
			player: 1,
		},
	},
},
xiaobai_tongyan: {
	audio: 2,
	enable: ["chooseToUse"],
	filter(event, player) {
		if (player.hasSkill("xiaobai_tongyan_used")) return false;
		if (event.skill == "xiaobai_tongyan" || event._skill == "xiaobai_tongyan") return true;
		if (event.type != "wuxie") return false;
		if (!game.hasPlayer((current) => current.countCards("h") > 0)) return false;
		return Boolean(event.filterCard?.(get.autoViewAs({ name: "wuxie" }, "unsure"), player, event));
	},
	chooseButton: {
		dialog(event, player) {
			return ui.create.dialog("通言：将任意名角色共三张手牌当【无懈可击】使用", [[["trick", "", "wuxie"]], "vcard"]);
		},
		check(button) {
			return 1;
		},
		backup(links, player) {
			return {
				audio: "xiaobai_tongyan",
				filterCard: true,
				selectCard: [0, 3],
				position: "h",
				viewAs(cards, player) {
					// 空材料防御：占位 vcard（知识库 #57）
					return { name: "wuxie", isCard: true, storage: { nowuxie: true } };
				},
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_tongyan");
					const mats = (event.result.cards || []).slice(0);
					const owners = mats.map(() => player);
					// 从任意角色手牌补足三张
					while (mats.length < 3 && player.isIn()) {
						const res = await player
							.chooseTarget("通言：选择一名角色，从其手牌中选择转化牌（还差" + (3 - mats.length) + "张）", 1, (card, player2, targetx) => targetx.countCards("h") > 0)
							.set("ai", (target) => get.attitude(player, target))
							.forResult();
						const to = res?.targets?.[0];
						if (!to?.isIn()) break;
						const res2 = await player
							.choosePlayerCard(to, "h", true, 1, "通言：选择" + get.translation(to) + "的一张手牌")
							.forResult();
						const card = res2?.cards?.[0] || res2?.links?.[0];
						if (!card) break;
						mats.push(card);
						owners.push(to);
					}
					if (mats.length < 3) {
						// 凑不满三张：取消本次使用
						event.result.bool = false;
						return;
					}
					event.result.cards = mats;
					// 点数最大的牌不是你的 → 此技能本轮失效
					let maxCard = mats[0];
					let maxOwner = owners[0];
					for (let i = 1; i < mats.length; i++) {
						if (get.number(mats[i]) > get.number(maxCard)) {
							maxCard = mats[i];
							maxOwner = owners[i];
						}
					}
					if (maxOwner != player) {
						player.addTempSkill("xiaobai_tongyan_used", "roundStart");
					}
				},
			};
		},
		prompt(links) {
			return "通言：将任意名角色共三张手牌当不可响应的【无懈可击】使用";
		},
	},
	subSkill: {
		used: { charlotte: true, sub: true },
	},
	ai: {
		order: 6,
		result: {
			player: 1,
		},
	},
},

// === 黄琬 ===
xiaobai_weidang: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		const suits = player.storage.xiaobai_weidang_suits || [];
		return player.countCards("he", (card) => !suits.includes(get.suit(card, player))) >= 2;
	},
	filterTarget(card, player, target) {
		return target != player && target.isIn() && (target.isDamaged() || true);
	},
	selectTarget: 1,
	async cost(event, trigger, player) {
		const suits = player.storage.xiaobai_weidang_suits || [];
		const res = await player
			.chooseCard("he", "巍荡：选择两张牌重铸（花色不能是本回合进入过弃牌堆的花色）", 2, (card) => !suits.includes(get.suit(card, player)))
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.cards?.length) return void (event.result = { bool: false });
		const target = event.targets?.[0];
		const namePick = await player
			.chooseControl(["【桃】", "【决斗】"], "cancel2")
			.set("prompt", "巍荡：视为对" + (target ? get.translation(target) : "") + "使用哪张牌？")
			.set("ai", () => (target?.isDamaged() ? 0 : 1))
			.forResult();
		if (!namePick?.control || namePick.control == "cancel2") return void (event.result = { bool: false });
		event.result.cost_data = { cards: res.cards, name: namePick.control == "【桃】" ? "tao" : "juedou" };
	},
	async content(event, trigger, player) {
		const { cards, name } = event.cost_data;
		const target = event.targets[0];
		await player.recast(cards);
		if (!player.isIn()) return;
		// 视为对目标使用【桃】或【决斗】
		await player.useCard(get.autoViewAs({ name }, []), [target], "xiaobai_weidang");
		if (!target.isIn()) return;
		// 目标选择：摸至上限 或 视为对黄琬使用同样的牌
		const opts = [];
		if (target.countCards("h") < target.getHandcardLimit()) opts.push("将手牌摸至上限");
		if (name == "juedou" || target.isDamaged()) opts.push("视为对" + get.translation(player) + "使用【" + (name == "tao" ? "桃" : "决斗") + "】");
		if (!opts.length) return;
		const ctrl = await target
			.chooseControl(opts.concat("cancel2"))
			.set("prompt", "巍荡：请选择一项")
			.set("ai", () => (opts[0].startsWith("将手牌") ? 0 : 1))
			.forResult();
		if (!ctrl?.control || ctrl.control == "cancel2") return;
		if (ctrl.control.startsWith("将手牌")) {
			if (target.countCards("h") < target.getHandcardLimit()) {
				await target.draw(target.getHandcardLimit() - target.countCards("h"));
			}
		} else {
			await target.useCard(get.autoViewAs({ name }, []), [player], "xiaobai_weidang");
		}
	},
	group: ["xiaobai_weidang_record", "xiaobai_weidang_clear"],
	subSkill: {
		record: {
			charlotte: true,
			sub: true,
			trigger: { global: ["cardsDiscardAfter", "discardAfter", "loseAfter", "loseAsyncAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_weidang_suits || []).length < 4;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_weidang_suits ??= [];
				for (const card of trigger.cards || []) {
					const suit = get.suit(card);
					if (suit && !player.storage.xiaobai_weidang_suits.includes(suit)) {
						player.storage.xiaobai_weidang_suits.push(suit);
					}
				}
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_weidang_suits || []).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_weidang_suits = [];
			},
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},
xiaobai_zhenggu: {
	audio: 2,
	trigger: { source: "damageBegin2", player: "damageBegin2" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		if (!event.source || !event.player) return false;
		// 造成或受到伤害（且尚未翻倍过：防同一伤害双视角重复）
		return !event.storage?.xiaobai_zhenggu_done;
	},
	async content(event, trigger, player) {
		trigger.storage ??= {};
		if (trigger.storage.xiaobai_zhenggu_done) return;
		const go = await player
			.chooseBool("铮骨：是否翻倍此" + get.cnNumber(trigger.num) + "点伤害？")
			.set("ai", () => 0)
			.forResult();
		if (!go?.bool) return;
		trigger.storage.xiaobai_zhenggu_done = true;
		trigger.num *= 2;
		const source = trigger.source;
		// 锁定来源：其使用基本牌或普通锦囊牌只能指定黄琬
		source.addSkill("xiaobai_zhenggu_lock");
		source.storage.xiaobai_zhenggu_by = player.playerid;
		// 铮骨失效（直到来源体力值变化或你死亡）
		player.disableSkill("xiaobai_zhenggu_awake", "xiaobai_zhenggu");
	},
	group: ["xiaobai_zhenggu_recover", "xiaobai_zhenggu_lock"],
	subSkill: {
		lock: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "骨",
			intro: {
				content(storage, player) {
					const by = player.storage.xiaobai_zhenggu_by;
					return "你的基本牌与普通锦囊牌只能指定" + (by ? get.translation(lib.playerOL[by] || game.findPlayer((p) => p.playerid == by)) : "伤害来源") + "为目标";
				},
			},
			mod: {
				targetEnabled(card, player, target) {
					const by = player.storage.xiaobai_zhenggu_by;
					if (!by) return;
					const type = get.type(card, null, player);
					if ((type == "basic" || type == "trick") && target.playerid != by) return false;
				},
			},
			onremove(player) {
				delete player.storage.xiaobai_zhenggu_by;
			},
		},
		recover: {
			charlotte: true,
			sub: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { global: "changeHpAfter" },
			filter(event, player) {
				// 被锁定来源体力值变化 → 恢复铮骨
				return Boolean(event.player?.storage?.xiaobai_zhenggu_by && event.player.storage.xiaobai_zhenggu_by == player.playerid);
			},
			content(event, trigger, player) {
				const source = event.player;
				source.removeSkill("xiaobai_zhenggu_lock");
				player.enableSkill("xiaobai_zhenggu_awake");
			},
		},
	},
	onremove(player) {
		// 黄琬死亡：解锁所有被锁来源
		game.countPlayer((current) => {
			if (current.storage?.xiaobai_zhenggu_by == player.playerid) {
				current.removeSkill("xiaobai_zhenggu_lock");
			}
		});
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 盖勋 ===
xiaobai_zhenglie: {
	audio: 2,
	enable: ["chooseToUse", "phaseUse"],
	hiddenCard(player, name) {
		return (name == "wuxie" || name == "juedou") && player.countCards("h") >= 3;
	},
	filter(event, player) {
		if (player.hasSkill("xiaobai_zhenglie_used")) return false;
		if (player.countCards("h") < 3) return false;
		if (event.skill == "xiaobai_zhenglie" || event._skill == "xiaobai_zhenglie") return true;
		if (event.name == "chooseToUse" && event.type == "wuxie") {
			return Boolean(event.filterCard?.(get.autoViewAs({ name: "wuxie" }, "unsure"), player, event));
		}
		if (event.name == "chooseToUse" && event.type == "phase") {
			return Boolean(event.filterCard?.(get.autoViewAs({ name: "juedou" }, "unsure"), player, event));
		}
		return false;
	},
	chooseButton: {
		dialog(event, player) {
			const list = [];
			if (event.type == "wuxie") list.push(["trick", "", "wuxie"]);
			else list.push(["trick", "", "juedou"]);
			return ui.create.dialog("铮烈：将三张手牌当【" + (event.type == "wuxie" ? "无懈可击" : "决斗") + "】使用", [list, "vcard"]);
		},
		check(button) {
			return 1;
		},
		backup(links, player) {
			const name = links[0][2];
			return {
				audio: "xiaobai_zhenglie",
				filterCard: true,
				selectCard: 3,
				position: "h",
				viewAs: { name, isCard: true, storage: { xiaobai_zhenglie: true } },
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_zhenglie");
					player.addTempSkill("xiaobai_zhenglie_used", "roundStart");
				},
			};
		},
		prompt(links) {
			return "铮烈：将三张手牌当【" + (links[0][2] == "wuxie" ? "无懈可击" : "决斗") + "】使用";
		},
	},
	group: ["xiaobai_zhenglie_after"],
	subSkill: {
		used: { charlotte: true, sub: true },
		after: {
			audio: "xiaobai_zhenglie",
			charlotte: true,
			sub: true,
			name: "铮烈",
			trigger: { global: "useCardAfter" },
			direct: true,
			filter(event, player) {
				return event.player == player && Boolean(event.card?.storage?.xiaobai_zhenglie);
			},
			async content(event, trigger, player) {
				// 红色底牌（材料中的红牌，已在弃牌堆）
				let reds = (trigger.cards || []).filter((card) => get.color(card) == "red" && get.position(card, true) == "d");
				// 转化牌未被其他角色响应：子事件树中无 respond 事件
				let responded = false;
				(function find(evt) {
					for (const child of evt.childEvents || []) {
						if (child.name == "respond") responded = true;
						find(child);
					}
				})(trigger);
				while (reds.length && player.isIn()) {
					const res = await player
						.chooseCardButton("铮烈：你可以使用其中一张红色底牌", reds)
						.set("ai", (button) => get.player().getUseValue(button.link))
						.forResult();
					const card = res?.links?.[0];
					if (!card) break;
					reds.remove(card);
					const useEvent = player.chooseUseTarget(card, "铮烈：是否使用" + get.translation(card), false);
					if (!responded) {
						// 底牌不能被响应
						useEvent.set("directHit", game.filterPlayer());
					}
					await useEvent.forResult();
				}
			},
		},
	},
	ai: {
		order: 6,
		result: {
			player: 1,
		},
	},
},
xiaobai_suye: {
	audio: 2,
	trigger: { player: "useCardAfter", global: "respondAfter" },
	filter(event, player) {
		if (!player.isIn()) return false;
		// 使用或响应伤害牌
		const card = event.name == "useCard" ? event.card : event.result?.card;
		if (!card || !get.tag(card, "damage")) return false;
		// 存在众数（频次>1 的手牌数）且存在非众数角色
		const modes = lib.skill.xiaobai_suye.getModes();
		if (!modes.length) return false;
		return game.hasPlayer((current) => !modes.includes(current.countCards("h")));
	},
	getModes() {
		const counts = {};
		let max = 0;
		game.countPlayer((current) => {
			const n = current.countCards("h");
			if (n <= 0) return;
			counts[n] = (counts[n] || 0) + 1;
			if (counts[n] > max) max = counts[n];
		});
		if (max <= 1) return [];
		const modes = [];
		for (const n in counts) {
			if (counts[n] == max) modes.push(Number(n));
		}
		return modes.sort((a, b) => a - b);
	},
	async cost(event, trigger, player) {
		const modes = lib.skill.xiaobai_suye.getModes();
		const res = await player
			.chooseTarget("肃野：令一名手牌数不为众数（" + modes.join("/") + "）的角色将手牌数向众数摸或弃置一张", 1, (card, player2, targetx) => !modes.includes(targetx.countCards("h")))
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		event.result = res?.bool && res.targets?.length ? res : { bool: false };
	},
	async content(event, trigger, player) {
		const modes = lib.skill.xiaobai_suye.getModes();
		const target = event.targets[0];
		const num = target.countCards("h");
		if (num < modes[0]) {
			await target.draw(1);
		} else if (num > modes[modes.length - 1]) {
			const res = await target.chooseToDiscard(1, "he", true).forResult();
		} else {
			// 介于两众数之间：盖勋选择摸或弃
			const ctrl = await player
				.chooseControl("令其摸一张牌", "令其弃置一张牌")
				.set("prompt", "肃野：请选择一项")
				.set("ai", () => (get.attitude(player, target) > 0 ? 0 : 1))
				.forResult();
			if (ctrl?.control == "令其摸一张牌") {
				await target.draw(1);
			} else if (ctrl?.control) {
				await target.chooseToDiscard(1, "he", true).forResult();
			}
		}
		// 手牌数因此变为众数 → 你摸两张牌
		if (player.isIn() && modes.includes(target.countCards("h"))) {
			await player.draw(2);
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 傅玄 ===
xiaobai_shujian: {
	audio: 2,
	mark: true,
	marktext: "谏",
	intro: {
		content(storage, player) {
			return "上次发动〖疏谏〗满足的项数：" + (player.storage.xiaobai_shujian_num || 0);
		},
	},
	trigger: { target: "useCardToTarget" },
	filter(event, player) {
		if (!player.isIn() || !event.isFirstTarget) return false;
		// ♥牌、基本牌或自己使用的牌
		const card = event.card;
		return get.suit(card, event.player) == "heart" || get.type(card) == "basic" || event.player == player;
	},
	async cost(event, trigger, player) {
		const card = trigger.card;
		let num = 0;
		if (get.suit(card, trigger.player) == "heart") num++;
		if (get.type(card) == "basic") num++;
		if (trigger.player == player) num++;
		const count = num >= 2 ? [1, 2] : 1;
		const res = await player
			.chooseTarget("疏谏：令至多" + get.cnNumber(count[1] || 1) + "名不为当前回合的角色" + (num >= 3 ? "回复1点体力或" : "") + "摸一张牌", count, (card2, player2, targetx) => targetx != _status.currentPhase && targetx.isIn())
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		event.result = res?.bool && res.targets?.length ? { bool: true, cost_data: { num }, ...res } : { bool: false };
	},
	async content(event, trigger, player) {
		const num = event.cost_data.num;
		player.storage.xiaobai_shujian_num = num;
		player.updateMarks("xiaobai_shujian");
		for (const current of event.targets) {
			if (!current.isIn()) continue;
			if (num >= 3 && current.isDamaged()) {
				const go = await current
					.chooseBool("疏谏：回复1点体力，或摸一张牌？")
					.set("ai", () => (current.hp < 2 ? 1 : 0))
					.forResult();
				if (go?.bool) {
					await current.recover(1);
				} else {
					await current.draw(1);
				}
			} else {
				await current.draw(1);
			}
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_gangzao: {
	audio: 2,
	trigger: { player: ["useCardAfter", "respondAfter"] },
	filter(event, player) {
		if (!player.isIn()) return false;
		const x = player.storage.xiaobai_shujian_num || 0;
		return game.hasPlayer((current) => current.countCards("h") == x && current.countCards("he") > 0);
	},
	async cost(event, trigger, player) {
		const x = player.storage.xiaobai_shujian_num || 0;
		const res = await player
			.chooseTarget("刚躁：弃置一名手牌数为" + x + "的角色一张牌", 1, (card, player2, targetx) => targetx.countCards("h") == x && targetx.countCards("he") > 0)
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
		event.result = res?.bool && res.targets?.length ? res : { bool: false };
	},
	async content(event, trigger, player) {
		const to = event.targets[0];
		const res = await player
			.choosePlayerCard(to, "he", true, 1, "刚躁：弃置" + get.translation(to) + "的一张牌")
			.forResult();
		const card = res?.cards?.[0] || res?.links?.[0];
		if (card) {
			await player.discard([card]);
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 司马越 ===
xiaobai_zhuanfeng: {
	audio: 2,
	trigger: { player: "phaseUseBegin" },
	direct: true,
	filter(event, player) {
		return player.isIn() && game.hasPlayer((current) => current != player && player.inRange(current));
	},
	async cost(event, trigger, player) {
		const ctrl = await player
			.chooseControl("获得", "交给", "cancel2")
			.set("prompt", "转锋：你可以选择获得或交给攻击范围内所有角色各一张牌")
			.set("ai", () => 0)
			.forResult();
		if (!ctrl?.control || ctrl.control == "cancel2") return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { mode: ctrl.control == "获得" ? "obtain" : "give" } };
	},
	async content(event, trigger, player) {
		const mode = event.cost_data.mode;
		player.storage.xiaobai_zhuanfeng_mode = mode == "obtain" ? "give" : "obtain"; // 下次执行另一项
		player.addTempSkill("xiaobai_zhuanfeng_wait", "phaseAfter");
		await lib.xiaobaiZhuanfengFlow(player, mode);
	},
	group: ["xiaobai_zhuanfeng_damage"],
	subSkill: {
		wait: { charlotte: true, sub: true },
		damage: {
			audio: "xiaobai_zhuanfeng",
			charlotte: true,
			sub: true,
			name: "转锋",
			trigger: { source: "damageEnd" },
			direct: true,
			filter(event, player) {
				return player.isIn() && Boolean(player.storage.xiaobai_zhuanfeng_mode) && player.hasSkill("xiaobai_zhuanfeng_wait");
			},
			async content(event, trigger, player) {
				const mode = player.storage.xiaobai_zhuanfeng_mode;
				player.storage.xiaobai_zhuanfeng_mode = null;
				player.removeSkill("xiaobai_zhuanfeng_wait");
				await lib.xiaobaiZhuanfengFlow(player, mode);
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_huailan: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		return player.countCards("h") >= 2;
	},
	chooseButton: {
		dialog(event, player) {
			return ui.create.dialog("徊澜：将两张牌当【决斗】使用", [[["trick", "", "juedou"]], "vcard"]);
		},
		check(button) {
			return 1;
		},
		backup(links, player) {
			return {
				audio: "xiaobai_huailan",
				filterCard: true,
				selectCard: 2,
				position: "h",
				viewAs: { name: "juedou", isCard: true, storage: { xiaobai_huailan: true } },
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_huailan");
				},
			};
		},
		prompt(links) {
			return "徊澜：将两张牌当【决斗】使用（此牌额定目标数改为转化牌中【杀】的数量）";
		},
	},
	// 攻击范围调整（造成过徊澜伤害后锁定为与受伤者的距离）
	mod: {
		attackRange(current, num) {
			if (typeof current.storage.xiaobai_huailan_range == "number") {
				return current.storage.xiaobai_huailan_range;
			}
		},
	},
	group: ["xiaobai_huailan_damage", "xiaobai_huailan_extra"],
	subSkill: {
		damage: {
			audio: "xiaobai_huailan",
			charlotte: true,
			sub: true,
			name: "徊澜",
			trigger: { source: "damageEnd" },
			direct: true,
			filter(event, player) {
				return player.isIn() && Boolean(event.card?.storage?.xiaobai_huailan) && event.player?.isIn();
			},
			async content(event, trigger, player) {
				const victim = event.player;
				const current = player.getAttackRange();
				const dist = get.distance(player, victim);
				player.storage.xiaobai_huailan_range = dist;
				// 若因此减少，你摸一张牌
				if (dist < current) {
					player.logSkill("xiaobai_huailan");
					await player.draw(1);
				}
			},
		},
		// 额定目标数改为转化牌中【杀】的数量（攀弦范式追加目标）
		extra: {
			charlotte: true,
			sub: true,
			trigger: { player: "useCard2" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (!event.card?.storage?.xiaobai_huailan) return false;
				const slashCount = (event.cards || []).filter((card) => get.name(card) == "sha").length;
				return slashCount > 1 && game.hasPlayer((target) => target != player && !event.targets.includes(target) && lib.filter.targetEnabled2(event.card, player, target));
			},
			async content(event, trigger, player) {
				const slashCount = (trigger.cards || []).filter((card) => get.name(card) == "sha").length;
				const extra = slashCount - 1; // 额定 1 → 改为杀的数量
				const targets = game.filterPlayer((target) => target != player && !trigger.targets.includes(target) && lib.filter.targetEnabled2(trigger.card, player, target));
				const res = await player
					.chooseTarget({
						prompt: "徊澜：为这张【决斗】添加至多" + extra + "个目标",
						selectTarget: [1, extra],
						filterTarget(card, player2, target) {
							return get.event().targets.includes(target);
						},
						targets,
						ai(target) {
							return get.effect(target, _status.event.getTrigger().card, get.player());
						},
					})
					.forResult();
				if (res?.targets?.length) {
					trigger.targets.addArray(res.targets);
				}
			},
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},


// === 探虚 ===
xiaobai_tanxu: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.isIn());
	},
	async content(event, trigger, player) {
		const res = await player
			.chooseTarget("探虚：令一名其他角色视为对你使用【推心置腹】", (card, player2, target) => target != player2, true)
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
		const target = res?.targets?.[0];
		if (!target) return;
		// 获得一张【影】
		await player.gain(game.createCard("ying", "spade", 1), "gain2");
		if (!player.isIn() || !target.isIn()) return;
		// 其视为对你使用【推心置腹】
		await target.useCard({ name: "tuixinzhifu", isCard: true }, player, false, "xiaobai_tanxu");
		if (!player.isIn()) return;
		// 此牌结算后你展示所有手牌
		const hs = player.getCards("h");
		if (hs.length) await player.showCards(hs);
		if (!target.isIn()) return;
		// 若其中有【影】，你可以对其造成1点伤害
		if (!hs.some((card) => get.name(card) == "ying")) return;
		const want = await player.chooseBool("探虚：是否对" + get.translation(target) + "造成1点伤害？").set("ai", () => true).forResult();
		if (want.bool && target.isIn()) await target.damage(1, player);
	},
},

// === 王弼 ===
xiaobai_guajie: {
	audio: 2,
	mark: true,
	marktext: "易",
	intro: {
		content(storage, player) {
			const list = player.storage.xiaobai_piyi_list || [];
			if (!list.length) return "暂无“辟易”。";
			const counts = {};
			for (const name of list) counts[name] = (counts[name] || 0) + 1;
			return (
				"当前“辟易”（上限8）：" +
				Object.keys(counts)
					.map((name) => "【" + get.translation(name) + "】×" + counts[name])
					.join("、")
			);
		},
	},
	// 游戏开始时获得两个“辟易”
	trigger: { global: "gameStart" },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		return !(player.storage.xiaobai_piyi_list || []).length;
	},
	content(event, trigger, player) {
		player.storage.xiaobai_piyi_list = ["wuxie", "wuxie"];
		player.updateMarks("xiaobai_guajie");
	},
	group: ["xiaobai_guajie_gain"],
	subSkill: {
		// 抵消了其他角色使用的普通锦囊牌 → 获得一个新“辟易”（牌名改为被抵消牌名；每种牌名限一个；超出上限替换其一）
		gain: {
			audio: "xiaobai_guajie",
			charlotte: true,
			sub: true,
			name: "卦解",
			trigger: { global: "useCardAfter" },
			direct: true,
			filter(event, player) {
				if (!player.isIn() || !event._neutralized) return false;
				// 被抵消的是普通锦囊（非延时）
				if (get.type(event.card) != "trick") return false;
				// 子事件链中找到自己的辟易无懈
				let found = false;
				(function find(evt) {
					for (const child of evt.childEvents || []) {
						if (child.name == "useCard" && child.card?.storage?.xiaobai_piyi && child.player == player) found = true;
						find(child);
					}
				})(event);
				return found;
			},
			async content(event, trigger, player) {
				player.logSkill("xiaobai_guajie");
				const name = get.name(trigger.card);
				const list = (player.storage.xiaobai_piyi_list ??= []);
				if (list.includes(name)) return; // 每种牌名限获得一个
				if (list.length < 8) {
					list.push(name);
					player.updateMarks("xiaobai_guajie");
					game.log(player, "获得了一个", "#g【" + get.translation(name) + "】的“辟易”");
					return;
				}
				// 超出上限：替换原有之一
				const options = [...new Set(list)].map((n) => "【" + get.translation(n) + "】");
				const ctrl = await player
					.chooseControl(options)
					.set("prompt", "卦解：“辟易”已达上限，替换哪一个为【" + get.translation(name) + "】？")
					.set("ai", () => 0)
					.forResult();
				if (!ctrl?.control) return;
				const targetName = ctrl.control.slice(1, -1);
				const idx = list.indexOf(targetName);
				if (idx >= 0) {
					list.splice(idx, 1, name);
					player.updateMarks("xiaobai_guajie");
					game.log(player, "将一个", "#g【" + get.translation(targetName) + "】的“辟易”替换为了", "#g【" + get.translation(name) + "】");
				}
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// 辟易：以八卦阵的方式使用对应牌名的牌（每轮每个“辟易”限一次；判定为红色才生效）
xiaobai_piyi: {
	charlotte: true,
	enable: ["chooseToUse"],
	filter(event, player) {
		const remain = lib.skill.xiaobai_piyi.getRemain(player);
		if (!remain.length) return false;
		if (event.skill == "xiaobai_piyi" || event._skill == "xiaobai_piyi") return true;
		return remain.some((name) => event.filterCard?.(get.autoViewAs({ name }, "unsure"), player, event));
	},
	// 剩余可用（未在本轮用过）的辟易牌名
	getRemain(player) {
		const list = (player.storage.xiaobai_piyi_list || []).slice(0);
		for (const used of player.storage.xiaobai_piyi_used || []) {
			const idx = list.indexOf(used);
			if (idx >= 0) list.splice(idx, 1);
		}
		return [...new Set(list)];
	},
	chooseButton: {
		dialog(event, player) {
			const remain = lib.skill.xiaobai_piyi.getRemain(player);
			const list = remain.map((name) => [get.type(name), "", name]);
			return ui.create.dialog("辟易：以【八卦阵】的方式使用一张牌", [list, "vcard"]);
		},
		check(button) {
			if (_status.event.getParent().type != "phase") return 1;
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2] }, null, true));
		},
		backup(links, player) {
			const name = links[0][2];
			return {
				audio: "xiaobai_guajie",
				filterCard: () => false,
				selectCard: 0,
				viewAs: { name, isCard: true, storage: { xiaobai_piyi: true } },
				log: false,
				async precontent(event, trigger, player) {
					// 八卦阵判定：红色才视为使用（不消耗实体牌）
					const judgeResult = await player.judge("bagua", (card) => (get.color(card) === "red" ? 1.5 : -0.5)).forResult();
					if (!judgeResult || judgeResult.judge <= 0) {
						// 判定未生效：视为未发动（不消耗本轮次数）
						event.result.bool = false;
						return;
					}
					player.logSkill("xiaobai_guajie");
					(player.storage.xiaobai_piyi_used ??= []).push(name);
				},
			};
		},
		prompt(links) {
			return "辟易：以【八卦阵】的方式使用【" + get.translation(links[0][2]) + "】（判定为红色才生效）";
		},
	},
	group: ["xiaobai_piyi_clear"],
	subSkill: {
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_piyi_used || []).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_piyi_used = [];
			},
		},
	},
	ai: {
		order: 6,
		result: {
			player: 1,
		},
	},
},
xiaobai_yaozheng: {
	audio: 2,
	mark: true,
	marktext: "爻",
	intro: {
		content(storage, player) {
			const count = player.storage.xiaobai_yaozheng_count || 0;
			return count > 0 ? "本轮还可卜算" + count + "张牌（准备阶段/出牌阶段限一次/本轮结束时）。" : "";
		},
	},
	// 轮次开始时：将黑色牌和红色牌各一张置于牌堆顶
	trigger: { global: "roundStart" },
	filter(event, player) {
		return (
			player.isIn() &&
			player.countCards("he", (card) => get.color(card, player) == "black") > 0 &&
			player.countCards("he", (card) => get.color(card, player) == "red") > 0
		);
	},
	async cost(event, trigger, player) {
		const blackRes = await player
			.chooseCard("he", "爻证：选择一张黑色牌置于牌堆顶", 1, (card) => get.color(card, player) == "black")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!blackRes?.cards?.length) return void (event.result = { bool: false });
		const redRes = await player
			.chooseCard("he", "爻证：选择一张红色牌置于牌堆顶", 1, (card) => get.color(card, player) == "red")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!redRes?.cards?.length) return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { cards: blackRes.cards.concat(redRes.cards) } };
	},
	async content(event, trigger, player) {
		game.cardsGotoPile(event.cost_data.cards, "insert");
		player.storage.xiaobai_yaozheng_count = 6;
		player.updateMarks("xiaobai_yaozheng");
		game.log(player, "本轮可以卜算共计六张牌");
	},
	group: ["xiaobai_yaozheng_zhunbei", "xiaobai_yaozheng_active", "xiaobai_yaozheng_end", "xiaobai_yaozheng_clear"],
	subSkill: {
		// 准备阶段：可卜算至多剩余张数
		zhunbei: {
			audio: "xiaobai_yaozheng",
			charlotte: true,
			sub: true,
			name: "爻证",
			trigger: { player: "phaseZhunbeiBegin" },
			direct: true,
			filter(event, player) {
				return (player.storage.xiaobai_yaozheng_count || 0) > 0;
			},
			async content(event, trigger, player) {
				const count = player.storage.xiaobai_yaozheng_count;
				const opts = [];
				for (let i = 1; i <= count; i++) opts.push(get.cnNumber(i) + "张");
				const ctrl = await player
					.chooseControl(opts.concat("cancel2"))
					.set("prompt", "爻证：你可以卜算至多" + count + "张牌")
					.set("ai", () => 0)
					.forResult();
				if (!ctrl?.control || ctrl.control == "cancel2") return;
				const num = opts.indexOf(ctrl.control) + 1;
				player.storage.xiaobai_yaozheng_count -= num;
				player.updateMarks("xiaobai_yaozheng");
				player.logSkill("xiaobai_yaozheng");
				await player.chooseToGuanxing(num);
			},
		},
		// 出牌阶段限一次
		active: {
			audio: "xiaobai_yaozheng",
			charlotte: true,
			sub: true,
			name: "爻证",
			enable: "phaseUse",
			usable: 1,
			filter(event, player) {
				return (player.storage.xiaobai_yaozheng_count || 0) > 0;
			},
			async content(event, trigger, player) {
				const count = player.storage.xiaobai_yaozheng_count;
				const opts = [];
				for (let i = 1; i <= count; i++) opts.push(get.cnNumber(i) + "张");
				const ctrl = await player
					.chooseControl(opts)
					.set("prompt", "爻证：选择卜算张数（至多" + count + "张）")
					.set("ai", () => 0)
					.forResult();
				const num = opts.indexOf(ctrl?.control || "") + 1;
				if (num <= 0) return;
				player.storage.xiaobai_yaozheng_count -= num;
				player.updateMarks("xiaobai_yaozheng");
				await player.chooseToGuanxing(num);
			},
			ai: {
				order: 9,
				result: {
					player: 1,
				},
			},
		},
		// 本轮结束：卜算剩余全部
		end: {
			audio: "xiaobai_yaozheng",
			charlotte: true,
			sub: true,
			name: "爻证",
			forced: true,
			trigger: { global: "roundEnd" },
			filter(event, player) {
				return (player.storage.xiaobai_yaozheng_count || 0) > 0;
			},
			async content(event, trigger, player) {
				const num = player.storage.xiaobai_yaozheng_count;
				player.storage.xiaobai_yaozheng_count = 0;
				player.updateMarks("xiaobai_yaozheng");
				player.logSkill("xiaobai_yaozheng");
				await player.chooseToGuanxing(num);
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_yaozheng_count || 0) > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_yaozheng_count = 0;
				player.updateMarks("xiaobai_yaozheng");
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 卫觊 ===
xiaobai_dianyi: {
	audio: 2,
	trigger: { global: "damageEnd" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		// 体力值最大的角色受到伤害，且没有体力值唯一最大的角色
		let maxHp = -1;
		for (const current of game.filterPlayer()) {
			if (current.hp > maxHp) maxHp = current.hp;
		}
		const maxList = game.filterPlayer((current) => current.hp == maxHp);
		if (maxList.length < 2) return false;
		return maxList.includes(event.player);
	},
	async content(event, trigger, player) {
		// 令至少两名体力值相同且手牌数≠体力值的角色调整手牌至体力值数
		const cands = game.filterPlayer((current) => current.isIn() && current.countCards("h") != current.hp);
		if (cands.length < 2) return;
		const res = await player
			.chooseTarget("典仪：令至少两名体力值相同的角色将手牌调整至体力值数", [2, Infinity], (card, player2, targetx) => {
				const evt = get.event();
				if (!evt.selected.length) return evt.cands.includes(targetx);
				return targetx.hp == evt.selected[0].hp && evt.cands.includes(targetx);
			})
			.set("cands", cands)
			.set("selected", ui.selected.targets)
			.set("ai", (target) => {
				const me = get.player();
				const diff = target.countCards("h") - target.hp;
				return diff > 0 ? -get.attitude(me, target) * diff : get.attitude(me, target) * -diff;
			})
			.forResult();
		if (!res?.bool || !res.targets?.length) return;
		player.logSkill("xiaobai_dianyi");
		for (const current of res.targets.sortBySeat()) {
			if (!current.isIn()) continue;
			const num = current.countCards("h") - current.hp;
			if (num > 0) {
				await current.chooseToDiscard(num, "h", true).forResult();
			} else if (num < 0) {
				await current.draw(-num);
			}
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_yishi: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("h") > 0;
	},
	async content(event, trigger, player) {
		// ① 选一种类别，弃置手牌中该类别的所有牌
		const typeNames = { basic: "基本牌", trick: "锦囊牌", equip: "装备牌" };
		const avail = ["basic", "trick", "equip"].filter((type) => player.countCards("h", (card) => get.type(card, null, player) == type) > 0);
		const ctrl = await player
			.chooseControl(avail.map((t) => typeNames[t]))
			.set("prompt", "益市：选择弃置手牌中的一种类别")
			.set("ai", () => 0)
			.forResult();
		const chosenType = avail.find((t) => typeNames[t] == ctrl?.control);
		if (!chosenType) return;
		const throwCards = player.getCards("h").filter((card) => get.type(card, null, player) == chosenType);
		await player.discard(throwCards);
		if (!player.isIn()) return;
		// ② 展示牌堆底的等量张牌
		const shown = get.bottomCards(throwCards.length, true);
		await player.showCards(shown, "益市：展示牌堆底的" + get.cnNumber(shown.length) + "张牌");
		// 其他类别的牌进入分配池
		const rest = shown.filter((card) => get.type(card) != chosenType);
		// ③ 分配给任意名角色（取消则剩余留给自己）
		const assigned = [];
		while (rest.length && player.isIn()) {
			const res = await player
				.chooseTarget("益市：将牌分配给一名角色（点击取消，剩余留给自己）", 1, (card, player2, targetx) => targetx.isIn())
				.set("ai", (target) => get.attitude(player, target))
				.forResult();
			if (!res?.bool || !res.targets?.length) {
				await player.gain(rest, "gain2");
				assigned.push(player);
				break;
			}
			const to = res.targets[0];
			const pick = await player
				.chooseCardButton("益市：选择交给" + get.translation(to) + "的牌（可多选）", rest, [1, rest.length])
				.set("ai", (button) => get.value(button.link, to))
				.forResult();
			const cards = pick?.links || [];
			if (!cards.length) {
				await player.gain(rest, "gain2");
				assigned.push(player);
				break;
			}
			for (const card of cards) rest.remove(card);
			await to.gain(cards, "gain2");
			if (!assigned.includes(to)) assigned.push(to);
		}
		// ④ 因获得牌的角色中体力值最小者获得「耕积」
		if (!assigned.length || !player.isIn()) return;
		let minHp = Infinity;
		for (const current of assigned) {
			if (current.isIn() && current.hp < minHp) minHp = current.hp;
		}
		for (const current of assigned) {
			if (current.isIn() && current.hp == minHp && !current.hasSkill("xiaobai_gengji")) {
				current.addSkill("xiaobai_gengji");
				game.log(current, "获得了技能", "#g【耕积】");
			}
		}
	},
	ai: {
		order: 6,
		result: {
			player: 1,
		},
	},
},
// 耕积：衍生技（益市授予）
xiaobai_gengji: {
	audio: 2,
	mark: true,
	marktext: "积",
	intro: { content: "你可以将一张非基本牌置于牌堆底并跳过判定阶段；结束阶段，你视为使用仅指定有「耕积」角色的【五谷丰登】。" },
	// 判定阶段开始时：非基本牌置于牌堆底并跳过判定阶段
	trigger: { player: "phaseJudgeBegin" },
	direct: true,
	filter(event, player) {
		return player.isIn() && player.countCards("he", (card) => get.type(card, null, player) != "basic") > 0;
	},
	async content(event, trigger, player) {
		const res = await player
			.chooseCard("he", "耕积：将一张非基本牌置于牌堆底并跳过判定阶段", 1, (card) => get.type(card, null, player) != "basic")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.cards?.length) return;
		player.logSkill("xiaobai_gengji");
		game.cardsGotoPile(res.cards); // 无参 = 牌堆底
		player.addTempSkill("xiaobai_gengji_flag", "phaseAfter");
		player.skip("phaseJudge");
	},
	group: ["xiaobai_gengji_wugu"],
	subSkill: {
		flag: { charlotte: true, sub: true },
		// 结束阶段：视为使用仅指定有「耕积」角色的【五谷丰登】
		wugu: {
			audio: "xiaobai_gengji",
			charlotte: true,
			sub: true,
			name: "耕积",
			forced: true,
			trigger: { player: "phaseJieshuBegin" },
			filter(event, player) {
				return player.hasSkill("xiaobai_gengji_flag");
			},
			async content(event, trigger, player) {
				const targets = game.filterPlayer((current) => current.hasSkill("xiaobai_gengji") && current.isIn());
				if (!targets.length) return;
				await player.useCard(get.autoViewAs({ name: "wugu" }, []), targets, "xiaobai_gengji");
			},
		},
	},
},

// === 樊建 ===
xiaobai_qingjie: {
	audio: 2,
	trigger: { player: "loseAfter" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		// 不因使用或打出而失去手牌/装备区的牌（使用/打出的 lose type 同为 "use"，知识库九）
		if (event.type == "use") return false;
		return ((event.hs || []).length + (event.es || []).length) > 0;
	},
	async content(event, trigger, player) {
		const current = _status.currentPhase;
		if (!current?.isIn()) return;
		// 回合角色当前剩余使用【杀】次数：仅在其出牌阶段内且剩余>0 时令之-1；否则樊建摸一张牌
		const remain = current.getCardUsable({ name: "sha" });
		if (current.isPhaseUsing() && typeof remain == "number" && remain > 0) {
			player.logSkill("xiaobai_qingjie");
			current.addTempSkill("xiaobai_qingjie_debuff", "phaseAfter");
			current.storage.xiaobai_qingjie_num = (current.storage.xiaobai_qingjie_num || 0) - 1;
			game.log(player, "令", current, "使用【杀】的次数上限-1");
		} else {
			player.logSkill("xiaobai_qingjie");
			await player.draw(1);
		}
	},
	subSkill: {
		debuff: {
			charlotte: true,
			sub: true,
			mod: {
				cardUsable(current, card, num) {
					if (card?.name == "sha" || get.name(card) == "sha") {
						return num + (current.storage.xiaobai_qingjie_num || 0);
					}
				},
			},
			onremove(current, skill) {
				delete current.storage.xiaobai_qingjie_num;
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_weishi: {
	audio: 2,
	trigger: { global: "damageEnd" },
	filter(event, player) {
		if (!player.isIn() || !event.player?.isIn() || player.countCards("h") <= 0) return false;
		// 与你距离为1以内的角色受到伤害，且有存活来源
		if (get.distance(event.player, player) > 1) return false;
		return Boolean(event.source?.isIn());
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseCard("h", "慰释：交给" + get.translation(trigger.source) + "一张手牌", 1)
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		event.result = res?.cards?.length ? { bool: true, cost_data: { card: res.cards[0] } } : { bool: false };
	},
	async content(event, trigger, player) {
		const card = event.cost_data.card;
		const target = trigger.player;
		const source = trigger.source;
		// 伤害来源选择：拿走这张牌，或改为令受伤角色获得
		const go = await source
			.chooseBool("慰释：是否改为令" + get.translation(target) + "获得这张牌？")
			.set("ai", () => (get.attitude(source, target) > 0 && get.attitude(source, player) > 0 ? 1 : 0))
			.forResult();
		if (go?.bool) {
			await target.gain([card], player, "give");
			if (player.isIn()) await player.draw(1);
			if (source.isIn()) await source.draw(1);
			if (target.isIn()) await target.draw(1);
		} else {
			await source.gain([card], player, "give");
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 何祗 ===
// 神点流程（结束阶段自发动 / 恣逸阴态被触发共用）：重铸 X 次，一种花色的牌数翻倍时选择摸1或弃他人1
xiaobai_shendian: {
	audio: 2,
	trigger: { player: "phaseJieshuBegin" },
	direct: true,
	filter(event, player) {
		return player.isIn() && player.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_shendian");
		await lib.xiaobaiShendianFlow(player);
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_ziyi: {
	audio: 2,
	zhuanhuanji: true,
	mark: true,
	marktext: "☯",
	intro: {
		content(storage) {
			return storage ? "当前为阴：其他角色的出牌阶段，其可交给你至少一张牌，并令你发动〖神点〗；若你因〖神点〗摸牌数少于其交出牌数，你失去1点体力。" : "当前为阳：你可以视为使用【酒】。";
		},
	},
	init(player) {
		if (player.storage.xiaobai_ziyi == undefined) player.storage.xiaobai_ziyi = false;
	},
	// 阳：视为使用【酒】
	enable: ["chooseToUse"],
	filter(event, player) {
		if (player.storage.xiaobai_ziyi) return false;
		if (event.skill == "xiaobai_ziyi" || event._skill == "xiaobai_ziyi") return true;
		return Boolean(event.filterCard?.(get.autoViewAs({ name: "analeptic" }, "unsure"), player, event));
	},
	viewAs: { name: "analeptic", isCard: true },
	prompt: "恣逸：视为使用【酒】",
	check() {
		return 1;
	},
	group: ["xiaobai_ziyi_o"],
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},
// 恣逸阴态：全局挂载，其他角色交牌令何祗发动神点
xiaobai_ziyi_o: {
	charlotte: true,
	enable: "phaseUse",
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.storage?.xiaobai_ziyi && current.isIn());
	},
	filterTarget(card, player, target) {
		return target != player && target.storage?.xiaobai_ziyi && target.isIn();
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		const res = await player
			.chooseCard("he", true, [1, player.countCards("he")], "恣逸：交给" + get.translation(target) + "至少一张牌，令其发动〖神点〗")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.cards?.length) return;
		const giveNum = res.cards.length;
		await player.give(res.cards, target);
		if (!target.isIn()) return;
		target.logSkill("xiaobai_shendian");
		const drawCount = await lib.xiaobaiShendianFlow(target);
		// 若因〖神点〗摸牌数少于交出牌数 → 失去1点体力，并转换至阳
		if (drawCount < giveNum && target.isIn()) {
			await target.loseHp(1);
		}
		target.changeZhuanhuanji("xiaobai_ziyi");
	},
	ai: {
		order: 5,
		result: {
			player(player2) {
				return -1;
			},
		},
	},
},

// === 陆玑 ===
xiaobai_kanwu: {
	audio: 2,
	mark: true,
	marktext: "勘",
	intro: {
		content(storage, player) {
			const suits = player.storage.xiaobai_kanwu_suits || [];
			const types = player.storage.xiaobai_kanwu_types || [];
			const limit = player.storage.xiaobai_kanwu_limit || 0;
			const used = player.storage.xiaobai_kanwu_used || 0;
			if (!limit) return "";
			const typeNames = { basic: "基本牌", trick: "锦囊牌", equip: "装备牌", delay: "延时锦囊" };
			return (
				"本轮限" + limit + "次（还剩" + (limit - used) + "次）：花色为【" +
				suits.map((s) => get.translation(s)).join("/") + "】且类型为【" +
				types.map((t) => typeNames[t] || t).join("/") + "】的牌进入弃牌堆后，你可以获得之。"
			);
		},
	},
	// 每轮开始时：所有角色轮流弃一张牌，直到花色与类型均出现重复
	trigger: { global: "roundStart" },
	direct: true,
	filter(event, player) {
		return player.isIn() && game.hasPlayer((current) => current.countCards("he") > 0);
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_kanwu");
		// 从陆机上家开始轮流（座位链）
		let current = player.getPrevious() || player;
		const seenSuits = [];
		const seenTypes = [];
		const repSuits = [];
		const repTypes = [];
		let total = 0;
		while (player.isIn()) {
			// 找下一个有牌的角色
			let next = null;
			let probe = current;
			for (let i = 0; i < game.players.length; i++) {
				probe = probe.getNext();
				if (probe.countCards("he") > 0) {
					next = probe;
					break;
				}
			}
			if (!next) break;
			current = next;
			const res = await current
				.chooseCard("he", true, 1, "勘物：你须弃置一张牌")
				.set("ai", (card) => 5 - get.value(card))
				.forResult();
			if (!res?.cards?.length) break;
			const card = res.cards[0];
			await current.discard([card]);
			total++;
			const suit = get.suit(card);
			const type = get.type(card, false);
			if (!seenSuits.includes(suit)) seenSuits.push(suit);
			else if (!repSuits.includes(suit)) repSuits.push(suit);
			if (!seenTypes.includes(type)) seenTypes.push(type);
			else if (!repTypes.includes(type)) repTypes.push(type);
			// 花色与类型均出现重复 → 终止
			if (repSuits.length > 0 && repTypes.length > 0) break;
		}
		if (repSuits.length > 0 && repTypes.length > 0 && total > 0) {
			player.storage.xiaobai_kanwu_suits = repSuits;
			player.storage.xiaobai_kanwu_types = repTypes;
			player.storage.xiaobai_kanwu_limit = total;
			player.storage.xiaobai_kanwu_used = 0;
			player.updateMarks("xiaobai_kanwu");
		}
	},
	group: ["xiaobai_kanwu_gain", "xiaobai_kanwu_clear"],
	subSkill: {
		gain: {
			audio: "xiaobai_kanwu",
			charlotte: true,
			sub: true,
			name: "勘物",
			trigger: { global: ["cardsDiscardAfter", "discardAfter", "loseAfter", "loseAsyncAfter"] },
			direct: true,
			filter(event, player) {
				const limit = player.storage.xiaobai_kanwu_limit || 0;
				const used = player.storage.xiaobai_kanwu_used || 0;
				if (!player.isIn() || used >= limit) return false;
				const suits = player.storage.xiaobai_kanwu_suits || [];
				const types = player.storage.xiaobai_kanwu_types || [];
				return (event.cards || []).some((card) => get.position(card, true) == "d" && suits.includes(get.suit(card)) && types.includes(get.type(card, false)));
			},
			async content(event, trigger, player) {
				const suits = player.storage.xiaobai_kanwu_suits || [];
				const types = player.storage.xiaobai_kanwu_types || [];
				const matches = (trigger.cards || []).filter((card) => get.position(card, true) == "d" && suits.includes(get.suit(card)) && types.includes(get.type(card, false)));
				for (const card of matches) {
					if ((player.storage.xiaobai_kanwu_used || 0) >= (player.storage.xiaobai_kanwu_limit || 0)) break;
					const go = await player
						.chooseBool("勘物：是否获得" + get.translation(card) + "？")
						.set("ai", () => get.value(card) > 0)
						.forResult();
					if (!go?.bool) continue;
					player.logSkill("xiaobai_kanwu");
					player.storage.xiaobai_kanwu_used = (player.storage.xiaobai_kanwu_used || 0) + 1;
					if (get.position(card, true) == "d") {
						await player.gain([card], "gain2");
					}
				}
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_kanwu_limit || 0) > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_kanwu_suits = [];
				player.storage.xiaobai_kanwu_types = [];
				player.storage.xiaobai_kanwu_limit = 0;
				player.storage.xiaobai_kanwu_used = 0;
				player.updateMarks("xiaobai_kanwu");
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_zhuanshu: {
	audio: 2,
	enable: "phaseUse",
	hiddenCard(player, name) {
		return lib.inpile.includes(name) && get.type(name) == "basic" && player.countCards("h") >= 2;
	},
	filter(event, player) {
		if (event.skill == "xiaobai_zhuanshu" || event._skill == "xiaobai_zhuanshu") return true;
		if (player.storage.xiaobai_zhuanshu_ban) return false;
		return get.inpileVCardList((info) => info[0] == "basic").some((info) => event.filterCard?.(get.autoViewAs({ name: info[2], nature: info[3], isCard: true }, "unsure"), player, event));
	},
	chooseButton: {
		dialog(event, player) {
			const list = get.inpileVCardList((info) => info[0] == "basic");
			return ui.create.dialog("撰疏：摸两张牌或弃置两张牌并展示之，视为使用一张基本牌", [list, "vcard"]);
		},
		check(button) {
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2], nature: button.link[3], isCard: true }), null, true);
		},
		backup(links, player) {
			return {
				audio: "xiaobai_zhuanshu",
				filterCard: true,
				selectCard: [0, 2],
				position: "h",
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true, storage: { xiaobai_zhuanshu: true } },
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_zhuanshu");
					const mats = event.result.cards || [];
					let drawCards = [];
					if (mats.length == 0) {
						// 摸两张牌并展示
						const next = player.draw(2);
						await next;
						drawCards = (next.cards || []).slice(0);
						if (drawCards.length) await player.showCards(drawCards);
					} else if (mats.length == 2) {
						// 弃置两张牌并展示
						await player.showCards(mats.slice(0));
						await player.discard(mats.slice(0));
					} else {
						event.result.bool = false;
						return;
					}
					// 三者牌名均不同 → 技能失效至执行另一项（任意摸2或弃2恢复）
					const usedName = event.result.card.name;
					const pool = mats.length ? mats.slice(0) : drawCards;
					if (pool.length == 2) {
						const n1 = get.name(pool[0]);
						const n2 = get.name(pool[1]);
						if (n1 != n2 && n1 != usedName && n2 != usedName) {
							player.storage.xiaobai_zhuanshu_ban = mats.length == 0 ? "draw" : "discard";
							player.disableSkill("xiaobai_zhuanshu_ban", "xiaobai_zhuanshu");
						}
					}
				},
			};
		},
		prompt(links) {
			return "撰疏：视为使用【" + get.translation(links[0][2]) + "】（选0张=摸两张展示；选2张=弃置展示）";
		},
	},
	// 失效恢复监测：不进 group（disableSkill 级联陷阱，知识库 #59），init 动态挂载
	init(player) {
		player.addSkill("xiaobai_zhuanshu_recover");
	},
	onremove(player) {
		player.removeSkill("xiaobai_zhuanshu_recover");
	},
	subSkill: {
		recover: {
			charlotte: true,
			sub: true,
			trigger: { global: ["gainAfter", "loseAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const ban = player.storage.xiaobai_zhuanshu_ban;
				if (!ban) return false;
				if (ban == "draw") {
					// 需摸牌恢复：本次获得恰好两张
					return event.name == "gain" && event.player == player && (event.cards || []).length == 2;
				}
				// 需弃牌恢复：本次弃置恰好两张
				return event.name == "lose" && event.player == player && event.type == "discard" && ((event.hs || []).length + (event.es || []).length) == 2;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_zhuanshu_ban = null;
				player.enableSkill("xiaobai_zhuanshu_ban");
			},
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},

// === 窦妙 ===
// 彰重：衍生技（委纠授予）
xiaobai_zhangchong: {
	charlotte: true,
	mark: true,
	marktext: "彰",
	intro: { content: "你对另一名有「彰重」的角色造成伤害后，获得其一张牌。" },
	trigger: { source: "damageEnd" },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		return player.isIn() && event.player?.isIn() && event.player != player && event.player.hasSkill("xiaobai_zhangchong") && event.player.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		const res = await player
			.choosePlayerCard(trigger.player, "he", true, 1, "委纠：获得" + get.translation(trigger.player) + "的一张牌")
			.forResult();
		const card = res?.cards?.[0] || res?.links?.[0];
		if (card) {
			await player.gain([card], trigger.player, "giveAuto");
		}
	},
},
xiaobai_weijiu: {
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		return player.isIn() && game.hasPlayer((current) => current.isIn());
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseTarget("委纠：令至多三名角色获得「彰重」至你下回合开始", [1, 3], (card, player2, targetx) => targetx.isIn())
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		event.result = res?.bool && res.targets?.length ? res : { bool: false };
	},
	async content(event, trigger, player) {
		const list = [];
		for (const current of event.targets) {
			if (current.isIn() && !current.hasSkill("xiaobai_zhangchong")) {
				current.addSkill("xiaobai_zhangchong");
			}
			list.push(current);
		}
		player.storage.xiaobai_weijiu_list = list;
	},
	group: ["xiaobai_weijiu_recover"],
	subSkill: {
		// 窦妙下回合开始：移除所有「彰重」
		recover: {
			charlotte: true,
			sub: true,
			trigger: { global: "phaseBeginStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.player == player && (player.storage.xiaobai_weijiu_list || []).length > 0;
			},
			content(event, trigger, player) {
				for (const current of player.storage.xiaobai_weijiu_list) {
					if (current.isIn() && current.hasSkill("xiaobai_zhangchong")) {
						current.removeSkill("xiaobai_zhangchong");
					}
				}
				player.storage.xiaobai_weijiu_list = [];
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_duobi: {
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "water",
	enable: "phaseUse",
	filter(event, player) {
		if (player.awakenedSkills.includes("xiaobai_duobi")) return false;
		return !player.isKongcheng() && game.hasPlayer((current) => current != player && current.isDamaged() && current.isIn());
	},
	filterTarget(card, player, target) {
		return target != player && target.isDamaged() && target.isIn();
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		player.awakenSkill("xiaobai_duobi");
		const target = event.targets[0];
		// 所有手牌当【桃】对该目标使用
		const hs = player.getCards("h");
		if (!hs.length) return;
		await player.useCard(get.autoViewAs({ name: "tao" }, hs), [target], "xiaobai_duobi");
		if (!player.isIn() || !target.isIn()) return;
		// 与目标各摸两张牌
		await player.draw(2);
		await target.draw(2);
		player.storage.xiaobai_duobi_target = target;
	},
	group: ["xiaobai_duobi_save", "xiaobai_duobi_reset"],
	subSkill: {
		// 濒死时：所有手牌当【桃】（限定技共用次数）
		save: {
			audio: "xiaobai_duobi",
			charlotte: true,
			sub: true,
			name: "踱庇",
			enable: ["chooseToUse"],
			filter(event, player) {
				if (player.awakenedSkills.includes("xiaobai_duobi") || player.isKongcheng()) return false;
				if (event.skill == "xiaobai_duobi_save" || event._skill == "xiaobai_duobi_save") return true;
				if (event.type != "dying" || event.dying != player) return false;
				return Boolean(event.filterCard?.(get.autoViewAs({ name: "tao" }, "unsure"), player, event));
			},
			filterCard: () => false,
			selectCard: 0,
			viewAs: { name: "tao", isCard: true },
			prompt: "踱庇：将所有手牌当【桃】使用",
			async precontent(event, trigger, player) {
				player.logSkill("xiaobai_duobi");
				player.awakenSkill("xiaobai_duobi");
				event.result.cards = player.getCards("h");
				const hs = event.result.cards;
				if (!hs.length) {
					event.result.bool = false;
					return;
				}
				// 与目标各摸两张（目标 = 自己）
				event.result.card.storage ??= {};
				event.result.card.storage.xiaobai_duobi_self = true;
			},
			group: ["xiaobai_duobi_save_draw"],
			subSkill: {
				save_draw: {
					audio: "xiaobai_duobi",
					charlotte: true,
					sub: true,
					name: "踱庇",
					trigger: { global: "useCardAfter" },
					forced: true,
					popup: false,
					silent: true,
					filter(event2, player) {
						return event2.player == player && Boolean(event2.card?.storage?.xiaobai_duobi_self);
					},
					async content(event2, trigger, player) {
						if (player.isIn()) await player.draw(2);
						player.storage.xiaobai_duobi_target = player;
					},
				},
			},
			ai: {
				save: true,
				skillTagFilter(player, tag, arg) {
					if (tag != "save" || arg != player) return false;
					return !player.awakenedSkills.includes("xiaobai_duobi") && player.countCards("h") > 0;
				},
				result: {
					player: 1,
				},
			},
		},
		// 被踱庇目标造成伤害令其他角色进入濒死后：重置限定技
		reset: {
			audio: "xiaobai_duobi",
			charlotte: true,
			sub: true,
			name: "踱庇",
			forced: true,
			trigger: { global: "dyingAfter" },
			filter(event, player) {
				const target = player.storage.xiaobai_duobi_target;
				if (!target?.isIn() || event.player == target) return false;
				// 该目标的伤害令其他角色进入濒死（本阶段内）
				const damage = event.getParent("damage");
				if (!damage || damage.source != target) return false;
				return player.awakenedSkills.includes("xiaobai_duobi");
			},
			content(event, trigger, player) {
				player.restoreSkill("xiaobai_duobi");
				player.storage.xiaobai_duobi_target = null;
				game.log(player, "重置了", "#g【踱庇】");
			},
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
			target: 1,
		},
	},
},

// === 何休 ===
// 当前项条件：0=伤害牌，1=普通锦囊，2=K点牌
xiaobai_gushou: {
	audio: 2,
	mark: true,
	marktext: "守",
	intro: {
		content(storage, player) {
			const stage = player.storage.xiaobai_gushou_stage || 0;
			const used = player.storage.xiaobai_gushou_used || 0;
			const names = ["伤害牌", "锦囊牌", "K点牌"];
			if (stage >= 3) return "三项均已删去（已使用" + used + "张♠基本牌）。";
			return "当前首项：" + names[stage] + "（已使用" + used + "张♠基本牌）。你的♠基本牌仅能当该类牌使用。";
		},
	},
	// ♠基本牌仅能当首项牌使用（禁普通使用，转化除外）
	mod: {
		cardEnabled(card, player) {
			const stage = player.storage.xiaobai_gushou_stage || 0;
			if (stage >= 3) return;
			if (card.storage?.xiaobai_gushou) return; // 诂守转化放行
			const real = card.cards?.[0] || card;
			if (get.itemtype(card) != "card" && !card.cards) return;
			if (get.suit(real, player) == "spade" && get.type(real, null, player) == "basic" && get.position(real) == "h") {
				return false;
			}
		},
	},
	enable: ["chooseToUse"],
	hiddenCard(player, name) {
		const stage = player.storage.xiaobai_gushou_stage || 0;
		if (stage >= 3) return false;
		if (player.countCards("h", (card) => get.suit(card, player) == "spade" && get.type(card, null, player) == "basic") == 0) return false;
		if (stage == 0) return Boolean(get.tag({ name }, "damage"));
		if (stage == 1) return get.type({ name }) == "trick" && get.type2({ name }) == "trick";
		return false; // K点牌名无法静态判定，响应预检放空
	},
	filter(event, player) {
		const stage = player.storage.xiaobai_gushou_stage || 0;
		if (stage >= 3) return false;
		if (player.countCards("h", (card) => get.suit(card, player) == "spade" && get.type(card, null, player) == "basic") == 0) return false;
		if (event.skill == "xiaobai_gushou" || event._skill == "xiaobai_gushou") return true;
		return lib.skill.xiaobai_gushou.getCandidates(player, stage).some((info) => event.filterCard?.(get.autoViewAs({ name: info[2], nature: info[3], isCard: true }, "unsure"), player, event));
	},
	// 当前项的候选牌名 [type, "", name, nature]
	getCandidates(player, stage) {
		stage = stage == undefined ? player.storage.xiaobai_gushou_stage || 0 : stage;
		const all = get.inpileVCardList((info) => info[0] == "basic" || info[0] == "trick");
		if (stage == 0) {
			return all.filter((info) => Boolean(get.tag({ name: info[2] }, "damage")));
		}
		if (stage == 1) {
			return all.filter((info) => info[0] == "trick");
		}
		// stage 2：K点牌（运行时实扫存在13点的牌名）
		const kNames = new Set();
		const check = (card) => {
			if (get.number(card) == 13) kNames.add(get.name(card));
		};
		for (const card of ui.cardPile.childNodes || []) check(card);
		for (const card of ui.discardPile.childNodes || []) check(card);
		game.countPlayer((current) => current.getCards("hejsx").forEach(check));
		return all.filter((info) => kNames.has(info[2]));
	},
	chooseButton: {
		dialog(event, player) {
			const stage = player.storage.xiaobai_gushou_stage || 0;
			const names = ["伤害牌", "锦囊牌", "K点牌"];
			const list = lib.skill.xiaobai_gushou.getCandidates(player, stage);
			return ui.create.dialog("诂守：将♠基本牌当【" + (names[stage] || "") + "】使用", [list, "vcard"]);
		},
		check(button) {
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2], nature: button.link[3], isCard: true }), null, true);
		},
		backup(links, player) {
			return {
				audio: "xiaobai_gushou",
				filterCard(card, player2) {
					return get.suit(card, player2) == "spade" && get.type(card, null, player2) == "basic";
				},
				selectCard: 1,
				position: "h",
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true, storage: { xiaobai_gushou: true } },
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_gushou");
					player.storage.xiaobai_gushou_used = (player.storage.xiaobai_gushou_used || 0) + 1;
				},
			};
		},
		prompt(links) {
			const stage = player.storage.xiaobai_gushou_stage || 0;
			const names = ["伤害牌", "锦囊牌", "K点牌"];
			return "诂守：将一张♠基本牌当【" + get.translation(links[0][2]) + "】使用（首项：" + (names[stage] || "") + "）";
		},
	},
	group: ["xiaobai_gushou_advance"],
	subSkill: {
		// 首项牌进入弃牌堆时删去之（推进）
		advance: {
			charlotte: true,
			sub: true,
			trigger: { global: ["cardsDiscardAfter", "discardAfter", "loseAfter", "loseAsyncAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const stage = player.storage.xiaobai_gushou_stage || 0;
				if (stage >= 3 || !player.isIn()) return false;
				return (event.cards || []).some((card) => lib.skill.xiaobai_gushou.matchStage(card, stage));
			},
			async content(event, trigger, player) {
				const stage = player.storage.xiaobai_gushou_stage || 0;
				player.storage.xiaobai_gushou_stage = stage + 1;
				player.updateMarks("xiaobai_gushou");
				if (stage + 1 >= 3) {
					// 三项均删去：分配弃牌堆中的项牌
					const used = player.storage.xiaobai_gushou_used || 0;
					if (used <= 0) return;
					const pool = Array.from(ui.discardPile.childNodes || []).filter((card) => {
						if (get.position(card, true) != "d") return false;
						return Boolean(get.tag(card, "damage")) || (get.type(card) == "trick" && get.type(card, null) != "delay") || get.number(card) == 13;
					});
					if (!pool.length) return;
					let x = used;
					const remaining = pool.slice(0);
					while (x > 0 && remaining.length && player.isIn()) {
						const pick = await player
							.chooseCardButton("诂守：分配弃牌堆中的项牌（还可分" + x + "张，点击取消留给自己）", remaining, [1, Math.min(x, remaining.length)])
							.set("ai", (button) => get.value(button.link))
							.forResult();
						if (!pick?.links?.length) {
							await player.gain(remaining, "gain2");
							break;
						}
						const toRes = await player
							.chooseTarget("诂守：将这些牌交给一名其他角色", 1, lib.filter.notMe)
							.set("ai", (target) => get.attitude(player, target))
							.forResult();
						if (!toRes?.bool || !toRes.targets?.length) {
							await player.gain(pick.links, "gain2");
						} else {
							await toRes.targets[0].gain(pick.links, player, "give");
						}
						for (const card of pick.links) remaining.remove(card);
						x -= pick.links.length;
					}
				}
			},
		},
	},
	matchStage(card, stage) {
		if (stage == 0) return Boolean(get.tag(card, "damage"));
		if (stage == 1) return get.type(card) == "trick" && get.type(card, null) != "delay";
		if (stage == 2) return get.number(card) == 13;
		return false;
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_xuanbian: {
	audio: 2,
	trigger: { global: "useCardAfter" },
	direct: true,
	filter(event, player) {
		const stage = player.storage.xiaobai_gushou_stage || 0;
		if (stage <= 0 || !player.isIn() || !event.player?.isIn() || event.player == player) return false;
		if (player.isKongcheng() || event.player.isKongcheng()) return false;
		const card = event.card;
		// 该牌符合某个已删去项（按诂守判定顺序取第一个），且本轮该项未用过
		const used = player.storage.xiaobai_xuanbian_used || [];
		let key = null;
		if (stage > 0 && get.tag(card, "damage")) key = "damage";
		else if (stage > 1 && get.type(card) == "trick" && get.type(card, null) != "delay") key = "trick";
		else if (stage > 2 && get.number(card) == 13) key = "K";
		if (!key || used.includes(key)) return false;
		event.xiaobai_xuanbian_key = key;
		return true;
	},
	async content(event, trigger, player) {
		const key = trigger.xiaobai_xuanbian_key;
		const target = trigger.player;
		const res = await player
			.chooseCard("h", "玄辩：与" + get.translation(target) + "依次展示一张手牌（可取消）", 1)
			.set("ai", (card) => get.number(card) == 13 ? 10 : get.value(card))
			.forResult();
		if (!res?.cards?.length) return;
		player.logSkill("xiaobai_xuanbian");
		const myCard = res.cards[0];
		await player.showCards([myCard], "玄辩：" + get.translation(player) + "展示的牌");
		const toRes = await target
			.chooseCard("h", true, 1, "玄辩：请展示一张手牌")
			.set("ai", (card) => get.number(card) == 13 ? 10 : get.value(card))
			.forResult();
		const toCard = toRes?.cards?.[0];
		if (!toCard) return;
		await target.showCards([toCard], "玄辩：" + get.translation(target) + "展示的牌");
		const stage = player.storage.xiaobai_gushou_stage || 0;
		// 展示牌为「诂守」当前首项者获得一张【影】
		const stageNames = ["damage", "trick", "K"];
		const curKey = stage < 3 ? stageNames[stage] : null;
		const matchKey = (card) => {
			if (curKey == "damage") return Boolean(get.tag(card, "damage"));
			if (curKey == "trick") return get.type(card) == "trick" && get.type(card, null) != "delay";
			if (curKey == "K") return get.number(card) == 13;
			return false;
		};
		if (curKey && matchKey(myCard)) await player.gain(lib.card.ying.getYing(1), "gain2");
		if (curKey && target.isIn() && matchKey(toCard)) await target.gain(lib.card.ying.getYing(1), "gain2");
		// 展示牌与使用牌类型相同者摸一张牌
		const usedType = get.type(trigger.card);
		if (get.type(myCard) == usedType && player.isIn()) await player.draw(1);
		if (get.type(toCard) == usedType && target.isIn()) await target.draw(1);
		// K点的展示牌弃置并重置「诂守」
		if (get.number(myCard) == 13 || get.number(toCard) == 13) {
			const toDiscard = [];
			if (get.number(myCard) == 13 && get.position(myCard) == "h") toDiscard.push(myCard);
			if (get.number(toCard) == 13 && get.position(toCard) == "h" && target.isIn()) toDiscard.push(toCard);
			if (toDiscard.length) await game.cardsDiscard(toDiscard);
			player.storage.xiaobai_gushou_stage = 0;
			player.storage.xiaobai_gushou_used = 0;
			player.updateMarks("xiaobai_gushou");
			game.log(player, "重置了", "#g【诂守】");
		}
		// 每轮每项限一次
		player.storage.xiaobai_xuanbian_used ??= [];
		if (!player.storage.xiaobai_xuanbian_used.includes(key)) player.storage.xiaobai_xuanbian_used.push(key);
	},
	group: ["xiaobai_xuanbian_clear"],
	subSkill: {
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_xuanbian_used || []).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_xuanbian_used = [];
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 皇甫规 ===
// 斩威公共流程：executor 发动者，target 目标，cards 弃置的牌（cardOwner 为牌主）
xiaobai_zhanwei: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		return game.hasPlayer((current) => lib.skill.xiaobai_zhanwei.filterTarget(null, player, current));
	},
	filterTarget(card, player, target) {
		if (target == player || !target.isIn()) return false;
		// 需有足够的伤害牌（X = 目标已损失体力值+1）
		const need = target.maxHp - target.hp + 1;
		return player.countCards("he", (card) => Boolean(get.tag(card, "damage"))) >= need;
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		const X = target.maxHp - target.hp + 1;
		const res = await player
			.chooseCard("he", true, X, "斩威：弃置" + get.cnNumber(X) + "张伤害牌", (card) => Boolean(get.tag(card, "damage")))
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.cards?.length) return;
		await lib.xiaobaiZhanweiFlow(player, target, res.cards);
	},
	ai: {
		order: 6,
		result: {
			player: 1,
			target: -1,
		},
	},
},
xiaobai_shubian: {
	audio: 2,
	trigger: { player: "phaseJieshuEnd" },
	direct: true,
	filter(event, player) {
		return player.isIn() && game.hasPlayer((current) => current.hp <= player.hp && current.isIn());
	},
	async content(event, trigger, player) {
		const targets = game.filterPlayer((current) => current.hp <= player.hp && current.isIn());
		const res = await player
			.chooseTarget("纾边：令任意名体力值不大于你的角色同时选择是否展示手牌并弃置其中的伤害牌", [1, targets.length], (card, player2, targetx) => targets.includes(targetx))
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!res?.bool || !res.targets?.length) return;
		player.logSkill("xiaobai_shubian");
		const chosen = res.targets;
		const responders = [];
		// 依次询问是否展示并弃置伤害牌（同时选择的近似实现）
		for (const current of chosen) {
			const go = await current
				.chooseBool("纾边：是否展示手牌并弃置其中的伤害牌？")
				.set("ai", () => 0)
				.forResult();
			if (go?.bool) responders.push(current);
		}
		for (const current of responders) {
			if (!current.isIn()) continue;
			const hs = current.getCards("h");
			if (hs.length) await current.showCards(hs);
			const damageCards = current.getCards("h").filter((card) => Boolean(get.tag(card, "damage")));
			if (damageCards.length) {
				await current.discard(damageCards);
			}
		}
		// 展示者唯一 → 其摸（总人数-1）张
		if (responders.length == 1 && responders[0].isIn()) {
			await responders[0].draw(chosen.length - 1);
		}
		// 未展示者唯一 → 亮其手牌，皇甫规可用其手牌中的伤害牌对其发动「斩威」
		if (chosen.length - responders.length == 1) {
			const cp = chosen.find((current) => !responders.includes(current));
			if (!cp?.isIn() || !player.isIn()) return;
			const hs = cp.getCards("h");
			if (hs.length) await cp.showCards(hs);
			const damageCards = hs.filter((card) => Boolean(get.tag(card, "damage")));
			const X = cp.maxHp - cp.hp + 1;
			if (!damageCards.length || damageCards.length < X) return;
			const pick = await player
				.chooseCardButton("纾边：用" + get.translation(cp) + "的牌对其发动「斩威」（弃置" + X + "张）", damageCards, X)
				.set("ai", (button) => get.value(button.link, cp))
				.forResult();
			if (!pick?.links?.length) return;
			await lib.xiaobaiZhanweiFlow(player, cp, pick.links, cp);
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 羊续 ===
xiaobai_guanli: {
	audio: 2,
	// 自己回合开始时：牌堆底至多五张牌以任意顺序置于牌堆顶
	trigger: { player: "phaseBeginStart" },
	direct: true,
	filter(event, player) {
		return player.isIn() && ui.cardPile.childNodes.length > 0;
	},
	async content(event, trigger, player) {
		const maxN = Math.min(5, ui.cardPile.childNodes.length);
		const opts = [];
		for (let i = 1; i <= maxN; i++) opts.push(get.cnNumber(i) + "张");
		const ctrl = await player
			.chooseControl(opts.concat("cancel2"))
			.set("prompt", "观历：你可以将牌堆底的至多五张牌以任意顺序置于牌堆顶")
			.set("ai", () => 0)
			.forResult();
		if (!ctrl?.control || ctrl.control == "cancel2") return;
		player.logSkill("xiaobai_guanli");
		const num = opts.indexOf(ctrl.control) + 1;
		const cards = get.bottomCards(num, true); // peek 牌堆底
		// 任意顺序排列
		const moveRes = await player
			.chooseToMove("观历：将牌以任意顺序置于牌堆顶", true)
			.set("list", [["牌堆顶（从上到下）", cards], ["", []]])
			.set("filterOk", (moved) => moved[0].length == num)
			.forResult();
		const ordered = moveRes?.moved?.[0]?.length ? moveRes.moved[0] : cards;
		game.cardsGotoPile(ordered, "insert");
	},
	group: ["xiaobai_guanli_watch"],
	subSkill: {
		// 手牌数大于羊续的其他角色的回合结束时：观看牌堆顶五张并将其中一张置于牌堆底
		watch: {
			audio: "xiaobai_guanli",
			charlotte: true,
			sub: true,
			name: "观历",
			trigger: { global: "phaseAfter" },
			direct: true,
			filter(event, player) {
				return player.isIn() && event.player != player && event.player.countCards("h") > player.countCards("h") && ui.cardPile.childNodes.length > 0;
			},
			async content(event, trigger, player) {
				const n = Math.min(5, ui.cardPile.childNodes.length);
				const cards = get.cards(n, true); // peek 牌堆顶
				await player.viewCards("观历：观看牌堆顶的" + n + "张牌", cards);
				const pick = await player
					.chooseCardButton("观历：将其中一张置于牌堆底", cards)
					.set("ai", (button) => 6 - get.value(button.link))
					.forResult();
				const card = pick?.links?.[0];
				if (!card) return;
				player.logSkill("xiaobai_guanli");
				game.cardsGotoPile([card]); // 无参 = 牌堆底
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_xuanyu: {
	audio: 2,
	trigger: { global: "gainAfter" },
	direct: true,
	filter(event, player) {
		if (!player.isIn() || event.player != player) return false;
		// 本次获得进手牌的非装备牌
		return (event.cards || []).some((card) => get.position(card) == "h" && get.type(card, null, player) != "equip");
	},
	async content(event, trigger, player) {
		const gained = (trigger.cards || []).filter((card) => get.position(card) == "h" && get.type(card, null, player) != "equip");
		if (!gained.length) return;
		const hasTreasure = Boolean(player.getEquip(5));
		if (hasTreasure) {
			// 宝物栏有牌：可回复1点体力；不是自己回合则需将此次获得的牌置入弃牌堆
			if (!player.isDamaged()) return;
			const suffix = _status.currentPhase == player ? "" : "，然后须将此次获得的牌置入弃牌堆";
			const go = await player
				.chooseBool("悬鱼：是否回复1点体力" + suffix + "？")
				.set("ai", () => true)
				.forResult();
			if (!go?.bool) return;
			player.logSkill("xiaobai_xuanyu");
			await player.recover(1);
			if (_status.currentPhase != player && player.isIn()) {
				const toDiscard = gained.filter((card) => get.position(card) == "h");
				if (toDiscard.length) {
					await player.discard(toDiscard);
				}
			}
		} else {
			// 宝物栏没牌：可将其中一张非装备牌置入宝物栏（实体化为悬鱼宝物）
			const pick = await player
				.chooseCardButton("悬鱼：选择一张牌置入宝物栏", gained, 1)
				.set("ai", (button) => 6 - get.value(button.link))
				.forResult();
			const card = pick?.links?.[0];
			if (!card) return;
			player.logSkill("xiaobai_xuanyu");
			const treasure = game.createCard2("xiaobai_xuanyubao", get.suit(card), get.number(card));
			treasure.storage ??= {};
			treasure.storage.xiaobai_xuanyu_from = get.name(card);
			if (get.position(card) == "h") {
				await player.discard([card]);
			}
			if (player.canEquip(treasure, true)) {
				player.$gain2(treasure, false);
				await player.equip(treasure);
			}
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 石崇 ===
xiaobai_xuanfu: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.canCompare && game.hasPlayer((current) => current != player && current.countCards("h") > 0 && player.canCompare(current));
	},
	filterTarget(card, player, target) {
		return target != player && target.countCards("h") > 0 && player.canCompare(target);
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		const compareNext = player.chooseToCompare(target);
		const compare = await compareNext.forResult();
		if (!player.isIn()) return;
		// 三重胜负：①拼点本身 ②拼点牌花色在场上（ej区）更少者再赢一次 ③拼点牌牌名在整副牌库中更少者再赢一次
		const win = { [player.playerid]: 0, [target.playerid]: 0 };
		if (compare?.num1 > compare?.num2) win[player.playerid]++;
		else if (compare?.num2 > compare?.num1) win[target.playerid]++;
		const myCard = compareNext.card1;
		const toCard = compareNext.card2;
		if (myCard && toCard) {
			// 花色计数（场上所有角色的装备区+判定区）
			const suitCount = {};
			game.countPlayer((current) => {
				for (const card of current.getCards("ej")) {
					const s = get.suit(card);
					suitCount[s] = (suitCount[s] || 0) + 1;
				}
			});
			const mySuit = get.suit(myCard);
			const toSuit = get.suit(toCard);
			if ((suitCount[mySuit] || 0) < (suitCount[toSuit] || 0)) {
				win[player.playerid]++;
				game.log(player, "的拼点牌花色在场上更少，再赢一次");
			} else if ((suitCount[mySuit] || 0) > (suitCount[toSuit] || 0)) {
				win[target.playerid]++;
				game.log(target, "的拼点牌花色在场上更少，再赢一次");
			}
			// 牌名计数（整副牌库）
			const nameCount = {};
			const countName = (card) => {
				const n = get.name(card);
				nameCount[n] = (nameCount[n] || 0) + 1;
			};
			for (const card of ui.cardPile.childNodes || []) countName(card);
			for (const card of ui.discardPile.childNodes || []) countName(card);
			game.countPlayer((current) => current.getCards("hejsx").forEach(countName));
			const myName = get.name(myCard);
			const toName = get.name(toCard);
			if ((nameCount[myName] || 0) < (nameCount[toName] || 0)) {
				win[player.playerid]++;
				game.log(player, "的拼点牌牌名在牌库中更少，再赢一次");
			} else if ((nameCount[myName] || 0) > (nameCount[toName] || 0)) {
				win[target.playerid]++;
				game.log(target, "的拼点牌牌名在牌库中更少，再赢一次");
			}
		}
		game.log(player, "赢了", get.cnNumber(win[player.playerid]), "次，", target, "赢了", get.cnNumber(win[target.playerid]), "次");
		if (win[player.playerid] == win[target.playerid]) return;
		// 赢的更多者获得场上至多其赢的次数张牌（ej区）
		const winner = win[player.playerid] > win[target.playerid] ? player : target;
		const loser = winner == player ? target : player;
		for (let i = 0; i < win[winner.playerid]; i++) {
			if (!winner.isIn()) break;
			const cands = game.filterPlayer((current) => current.countCards("ej") > 0);
			if (!cands.length) break;
			const res = await winner
				.chooseTarget("喧富：选择一名角色，获得其场上一张牌", 1, (card, player2, targetx) => get.event().cands.includes(targetx))
				.set("cands", cands)
				.set("ai", (target) => -get.attitude(winner, target))
				.forResult();
			if (!res?.bool || !res.targets?.length) break;
			const to = res.targets[0];
			const pick = await winner
				.choosePlayerCard(to, "ej", true, 1, "喧富：获得" + get.translation(to) + "场上一张牌")
				.forResult();
			const card = pick?.cards?.[0] || pick?.links?.[0];
			if (!card) break;
			await winner.gain([card], to, "giveAuto");
		}
		// 更少者可对对方使用其没赢的次数张【杀】
		const slashNum = 3 - win[loser.playerid];
		if (loser.isIn() && slashNum > 0) {
			for (let i = 0; i < slashNum; i++) {
				if (!loser.isIn() || !winner.isIn()) break;
				const useRes = await loser
					.chooseToUse({
						prompt: "喧富：你可以对" + get.translation(winner) + "使用一张【杀】（还可使用至多" + (slashNum - i) + "张）",
						filterCard: (card, player2, event2) => {
							if (get.name(card) != "sha") return false;
							return lib.filter.cardEnabled(card, player2) && lib.filter.targetEnabledx(card, player2, winner);
						},
						filterTarget: (card, player2, targetx) => targetx == winner,
						nodistance: true,
						addCount: false,
					})
					.forResult();
				if (!useRes?.bool) break;
			}
		}
	},
	ai: {
		order: 5,
		result: {
			player: 1,
			target: -1,
		},
	},
},
xiaobai_jingu: {
	audio: 2,
	locked: true,
	forced: true,
	// 本回合进入弃牌堆的【杀】【闪】池维护
	trigger: { player: "phaseJieshuBegin" },
	group: ["xiaobai_jingu_record", "xiaobai_jingu_remove", "xiaobai_jingu_clear"],
	async content(event, trigger, player) {
		const suits = new Set(player.getCards("e").map((card) => get.suit(card)));
		const num = suits.size;
		if (num <= 0) return;
		const pool = (player.storage.xiaobai_jingu_pool || []).filter((card) => get.position(card, true) == "d");
		const gainCards = pool.slice(0, num);
		for (const card of gainCards) {
			player.storage.xiaobai_jingu_pool.remove(card);
		}
		if (gainCards.length) {
			await player.gain(gainCards, "gain2");
		}
		if (gainCards.length < num) {
			await player.gain(lib.card.ying.getYing(num - gainCards.length), "gain2");
		}
	},
	subSkill: {
		record: {
			charlotte: true,
			sub: true,
			trigger: { global: ["cardsDiscardAfter", "discardAfter", "loseAfter", "loseAsyncAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (event.cards || []).some((card) => get.position(card, true) == "d" && (get.name(card) == "sha" || get.name(card) == "jink"));
			},
			content(event, trigger, player) {
				player.storage.xiaobai_jingu_pool ??= [];
				for (const card of trigger.cards || []) {
					if (get.position(card, true) == "d" && (get.name(card) == "sha" || get.name(card) == "jink") && !player.storage.xiaobai_jingu_pool.includes(card)) {
						player.storage.xiaobai_jingu_pool.push(card);
					}
				}
			},
		},
		remove: {
			charlotte: true,
			sub: true,
			trigger: { global: ["gainAfter", "loseAsyncAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_jingu_pool || []).length > 0;
			},
			content(event, trigger, player) {
				// 从弃牌堆被拿走的牌移出池
				for (const card of player.storage.xiaobai_jingu_pool) {
					if (get.position(card, true) != "d") {
						player.storage.xiaobai_jingu_pool.remove(card);
					}
				}
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_jingu_pool || []).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_jingu_pool = [];
			},
		},
	},
},

// === 聂友 ===
xiaobai_zhuizhu: {
	audio: 2,
	mark: true,
	marktext: "舳",
	intro: { content(storage, player) { return player.storage.xiaobai_zhuizhu_invalid ? "失效中：直到你拒绝发动〖寻鹿〗。" : ""; } },
	// 使用【杀】指定目标后
	trigger: { player: "useCardToTarget" },
	filter(event, player) {
		if (player.storage.xiaobai_zhuizhu_invalid) return false;
		if (!event.isFirstTarget || get.name(event.card) != "sha") return false;
		return player.getAttackRange() != player.countCards("h");
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseBool("追舳：你可以将手牌数调整至你的攻击范围")
			.set("ai", () => player.getAttackRange() > player.countCards("h"))
			.forResult();
		if (!res?.bool) {
			// 拒绝发动追舳 → 恢复寻鹿
			if (player.storage.xiaobai_xunlu_invalid) {
				player.storage.xiaobai_xunlu_invalid = false;
				player.updateMarks("xiaobai_xunlu");
				game.log(player, "的〖寻鹿〗恢复");
			}
		}
		event.result = res?.bool ? { bool: true } : { bool: false };
	},
	async content(event, trigger, player) {
		// 发动后此技能失效，直到拒绝发动「寻鹿」（互锁）
		player.storage.xiaobai_zhuizhu_invalid = true;
		player.updateMarks("xiaobai_zhuizhu");
		const diff = player.getAttackRange() - player.countCards("h");
		const X = Math.abs(diff);
		if (diff > 0) {
			await player.draw(diff);
		} else if (diff < 0) {
			await player.chooseToDiscard(X, "h", true).forResult();
		}
		if (!player.isIn()) return;
		// 任一目标体力<X 或 手牌数==X → 不计次；两项均满足 → 移动场上一张牌
		const targets = trigger.targets || [];
		let bonus = false;
		let full = false;
		for (const to of targets) {
			if (!to.isIn()) continue;
			const hpOk = to.hp < X;
			const handOk = to.countCards("h") == X;
			if (hpOk || handOk) bonus = true;
			if (hpOk && handOk) full = true;
		}
		if (bonus) {
			const useEvent = trigger.getParent("useCard");
			if (useEvent) useEvent.addCount = false;
		}
		if (full) {
			await player.moveCard("追舳：移动场上一张牌");
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_xunlu: {
	audio: 2,
	mark: true,
	marktext: "鹿",
	intro: { content(storage, player) { return player.storage.xiaobai_xunlu_invalid ? "失效中：直到你拒绝发动〖追舳〗。" : ""; } },
	// 当前回合角色本回合第二次摸牌/弃牌时
	trigger: { global: ["drawEnd", "discardAfter"] },
	direct: true,
	filter(event, player) {
		if (player.storage.xiaobai_xunlu_invalid) return false;
		const current = _status.currentPhase;
		if (!current?.isIn()) return false;
		if (event.player != current) return false;
		const count = event.name == "draw"
			? (current.storage.xiaobai_xunlu_draw || 0) + 1
			: (current.storage.xiaobai_xunlu_discard || 0) + 1;
		return count == 2;
	},
	async cost(event, trigger, player) {
		const current = _status.currentPhase;
		const res = await player
			.chooseBool("寻鹿：你可以与" + get.translation(current) + "各摸一张牌，其本回合下次造成伤害时你失去1点体力令此伤害+1")
			.set("ai", () => (get.attitude(player, current) > 0 ? 1 : 0))
			.forResult();
		if (!res?.bool) {
			// 拒绝发动寻鹿 → 恢复追舳
			if (player.storage.xiaobai_zhuizhu_invalid) {
				player.storage.xiaobai_zhuizhu_invalid = false;
				player.updateMarks("xiaobai_zhuizhu");
				game.log(player, "的〖追舳〗恢复");
			}
			return void (event.result = { bool: false });
		}
		event.result = { bool: true, cost_data: { current } };
	},
	async content(event, trigger, player) {
		// 发动后寻鹿失效，直到拒绝发动「追舳」（互锁）
		player.storage.xiaobai_xunlu_invalid = true;
		player.updateMarks("xiaobai_xunlu");
		const current = event.cost_data.current;
		if (player.isIn()) await player.draw(1);
		if (current.isIn()) await current.draw(1);
		if (!current.isIn()) return;
		// 其本回合下次造成伤害时：聂友失去1点体力令此伤害+1
		current.storage.xiaobai_xunlu_source = player.playerid;
		current.storage.xiaobai_xunlu_count = (current.storage.xiaobai_xunlu_count || 0) + 1;
	},
	group: ["xiaobai_xunlu_damage", "xiaobai_xunlu_count", "xiaobai_xunlu_clear"],
	subSkill: {
		damage: {
			audio: "xiaobai_xunlu",
			charlotte: true,
			sub: true,
			name: "寻鹿",
			trigger: { global: "damageBegin2" },
			forced: true,
			filter(event, player) {
				return event.source?.storage?.xiaobai_xunlu_source == player.playerid && (event.source.storage.xiaobai_xunlu_count || 0) > 0;
			},
			async content(event, trigger, player) {
				const source = trigger.source;
				source.storage.xiaobai_xunlu_count--;
				if (source.storage.xiaobai_xunlu_count <= 0) {
					source.storage.xiaobai_xunlu_source = null;
				}
				if (player.isIn()) {
					await player.loseHp(1);
				}
				trigger.num++;
			},
		},
		count: {
			charlotte: true,
			sub: true,
			trigger: { global: ["drawEnd", "discardAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const current = _status.currentPhase;
				return Boolean(current?.isIn()) && event.player == current;
			},
			content(event, trigger, player) {
				const current = _status.currentPhase;
				if (trigger.name == "draw") {
					current.storage.xiaobai_xunlu_draw = (current.storage.xiaobai_xunlu_draw || 0) + 1;
				} else {
					current.storage.xiaobai_xunlu_discard = (current.storage.xiaobai_xunlu_discard || 0) + 1;
				}
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "phaseAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return Boolean(event.player?.storage?.xiaobai_xunlu_draw || event.player?.storage?.xiaobai_xunlu_discard || event.player?.storage?.xiaobai_xunlu_source || event.player?.storage?.xiaobai_xunlu_count);
			},
			content(event, trigger, player) {
				const current = event.player;
				current.storage.xiaobai_xunlu_draw = 0;
				current.storage.xiaobai_xunlu_discard = 0;
				current.storage.xiaobai_xunlu_source = null;
				current.storage.xiaobai_xunlu_count = 0;
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 薛莹 ===
// 撰域流程（fromBottom = 观承附赠时从牌堆底展示）
xiaobai_zhuanyu: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return ui.cardPile.childNodes.length >= 8;
	},
	async content(event, trigger, player) {
		await lib.xiaobaiZhuanyuFlow(player, false);
	},
	ai: {
		order: 9,
		result: {
			player: 1,
		},
	},
},
xiaobai_guancheng: {
	audio: 2,
	zhuanhuanji: true,
	mark: true,
	marktext: "☯",
	intro: {
		content(storage) {
			return storage
				? "当前为阴：每轮结束时，你可以用本轮最晚体力值变化角色的视角视为使用一张【万箭齐发】。"
				: "当前为阳：每轮结束时，你可以用本轮最晚体力值变化角色的视角视为使用一张【桃园结义】。";
		},
	},
	init(player) {
		if (player.storage.xiaobai_guancheng == undefined) player.storage.xiaobai_guancheng = false;
	},
	// 每轮结束时：用本轮最晚体力值变化角色的视角视为使用
	trigger: { global: "roundEnd" },
	direct: true,
	filter(event, player) {
		const list = player.storage.xiaobai_guancheng_list || [];
		if (!list.length) return false;
		const last = list[list.length - 1];
		if (!last?.isIn()) return false;
		const name = player.storage.xiaobai_guancheng ? "wanjian" : "taoyuan";
		return last.hasUseTarget({ name, isCard: true });
	},
	async content(event, trigger, player) {
		const list = player.storage.xiaobai_guancheng_list || [];
		const last = list[list.length - 1];
		const yang = !player.storage.xiaobai_guancheng;
		const name = yang ? "taoyuan" : "wanjian";
		const res = await player
			.chooseBool("观承：你可以用" + get.translation(last) + "的视角视为使用一张【" + get.translation(name) + "】")
			.set("ai", () => (get.attitude(player, last) > 0 ? 1 : 0))
			.forResult();
		if (!res?.bool) return;
		player.logSkill("xiaobai_guancheng");
		player.changeZhuanhuanji("xiaobai_guancheng");
		// 用该角色视角视为使用（from = last，无实体消耗）
		const targets = game.filterPlayer((current) => current.isIn());
		await last.useCard(get.autoViewAs({ name }, []), targets, "xiaobai_guancheng");
		// 若薛莹是此流程中最早体力值变化的角色 → 可发动一次撰域（从牌堆底）
		if (player.isIn() && list[0] == player) {
			const go = await player
				.chooseBool("观承：你可以发动一次〖撰域〗（从牌堆底展示）")
				.set("ai", () => 1)
				.forResult();
			if (go?.bool) {
				await lib.xiaobaiZhuanyuFlow(player, true);
			}
		}
	},
	group: ["xiaobai_guancheng_record", "xiaobai_guancheng_clear"],
	subSkill: {
		// 本轮体力值变化角色顺序记录
		record: {
			charlotte: true,
			sub: true,
			trigger: { global: "changeHpAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event2, player) {
				return Boolean(event2.player?.isIn());
			},
			content(event, trigger, player) {
				player.storage.xiaobai_guancheng_list ??= [];
				player.storage.xiaobai_guancheng_list.push(trigger.player);
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_guancheng_list || []).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_guancheng_list = [];
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 窦武 ===
xiaobai_zouchu: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("h") > 0 && game.hasPlayer((current) => current != player && current.isIn());
	},
	filterTarget(card, player, target) {
		return target != player && target.isIn();
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		const cardRes = await player
			.chooseCard("h", true, 1, "奏黜：选择一张牌从下家开始传递")
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		const card = cardRes?.cards?.[0];
		if (!card) return;
		let current = player.getNext();
		if (!current?.isIn()) return;
		let times = 1;
		let usedSlash = false;
		await current.gain([card], player, "give");
		while (player.isIn() && current?.isIn()) {
			// 该角色可展示 times 张【杀】并对窦武依次使用 → 终止流程
			const slashIds = current.getCards("h").filter((c) => get.name(c) == "sha" && current.canUse(c, player, true, false));
			if (slashIds.length >= times) {
				const shown = await current
					.chooseCard("h", `奏黜：展示${get.cnNumber(times)}张【杀】并对${get.translation(player)}依次使用，或取消将此牌交给下家`, times, (c) => get.name(c) == "sha", true)
					.forResult();
				if (shown?.cards?.length == times) {
					current.showCards(shown.cards);
					for (const c of shown.cards) {
						if (!current.isIn() || !player.isIn()) break;
						await current.useCard(get.autoViewAs({ name: "sha" }, [c]), [player], "xiaobai_zouchu").set("addCount", false);
					}
					usedSlash = true;
					break;
				}
			}
			// 放弃展示：到达终点则终止
			if (current == target) break;
			// 传给下家
			const next = current.getNext();
			if (!next?.isIn() || get.owner(card) != current) break;
			await current.give([card], next);
			current = next;
			times++;
		}
		if (usedSlash) return;
		// 未被展示终止：弃置此牌 + 弃置终点角色 times 张牌 + 视为对终点使用【杀】
		const owner = get.owner(card);
		if (owner?.isIn() && get.position(card) != "d") {
			await owner.discard([card]);
		}
		if (target.isIn() && target.countCards("hej") > 0 && player.isIn()) {
			const n = Math.min(times, target.countCards("hej"));
			for (let i = 0; i < n; i++) {
				if (!target.isIn() || target.countCards("hej") == 0) break;
				const pick = await player
					.choosePlayerCard(target, "hej", true, 1, "奏黜：弃置" + get.translation(target) + "的一张牌（还需" + (n - i) + "张）")
					.forResult();
				const c = pick?.cards?.[0] || pick?.links?.[0];
				if (!c) break;
				await player.discard([c]);
			}
		}
		if (player.isIn() && target.isIn()) {
			await player.useCard({ name: "sha", isCard: true }, [target], "xiaobai_zouchu").set("addCount", false);
		}
	},
	ai: {
		order: 6,
		result: {
			player: 1,
			target: -1,
		},
	},
},
xiaobai_fuguo: {
	audio: 2,
	// 使用基本牌时
	trigger: { player: "useCardBegin" },
	direct: true,
	filter(event, player) {
		return player.isIn() && get.type(event.card, null, player) == "basic";
	},
	async cost(event, trigger, player) {
		// 本回合弃牌堆中未出现的花色数
		const suits = new Set(player.storage.xiaobai_fuguo_suits || []);
		const lack = 4 - suits.size;
		const desc = lack > 0 ? "然后弃置" + lack + "张牌（补齐未出现花色）" : "（无需弃牌）";
		const res = await player
			.chooseBool("赴国：你可以摸一张牌，" + desc)
			.set("ai", () => 1)
			.forResult();
		event.result = res?.bool ? { bool: true } : { bool: false };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_fuguo");
		await player.draw(1);
		if (!player.isIn()) return;
		// 弃置与未出现花色数相同的牌
		const suits = new Set(player.storage.xiaobai_fuguo_suits || []);
		const lack = 4 - suits.size;
		if (lack > 0 && player.countCards("he") > 0) {
			const n = Math.min(lack, player.countCards("he"));
			await player.chooseToDiscard(n, "he", true).forResult();
		}
		// 集齐四种花色 → 本回合下次造成的伤害+1
		const after = new Set(player.storage.xiaobai_fuguo_suits || []);
		if (suits.size < 4 && after.size == 4) {
			player.storage.xiaobai_fuguo_damage = true;
			game.log(player, "本回合下次造成的伤害+1");
		}
	},
	group: ["xiaobai_fuguo_damage", "xiaobai_fuguo_record", "xiaobai_fuguo_remove", "xiaobai_fuguo_clear"],
	subSkill: {
		damage: {
			audio: "xiaobai_fuguo",
			charlotte: true,
			sub: true,
			name: "赴国",
			trigger: { source: "damageBegin2" },
			forced: true,
			filter(event, player) {
				return Boolean(player.storage.xiaobai_fuguo_damage) && event.num > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_fuguo_damage = false;
				trigger.num++;
				game.log(player, "的此次伤害+1");
			},
		},
		// 本回合弃牌堆花色集合维护
		record: {
			charlotte: true,
			sub: true,
			trigger: { global: ["cardsDiscardAfter", "discardAfter", "loseAfter", "loseAsyncAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (event.cards || []).some((card) => get.position(card, true) == "d" && get.suit(card));
			},
			content(event, trigger, player) {
				player.storage.xiaobai_fuguo_suits ??= [];
				for (const card of trigger.cards || []) {
					if (get.position(card, true) != "d") continue;
					const suit = get.suit(card);
					if (suit && !player.storage.xiaobai_fuguo_suits.includes(suit)) {
						player.storage.xiaobai_fuguo_suits.push(suit);
					}
				}
			},
		},
		remove: {
			charlotte: true,
			sub: true,
			trigger: { global: ["gainAfter", "loseAsyncAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_fuguo_suits || []).length > 0;
			},
			content(event, trigger, player) {
				// 从弃牌堆被拿走的牌：若该花色在弃牌堆已无，则移出集合
				for (const suit of (player.storage.xiaobai_fuguo_suits || []).slice(0)) {
					const stillThere = Array.from(ui.discardPile.childNodes || []).some((card) => get.suit(card) == suit);
					if (!stillThere) {
						player.storage.xiaobai_fuguo_suits.remove(suit);
					}
				}
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_fuguo_suits || []).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_fuguo_suits = [];
				player.storage.xiaobai_fuguo_damage = false;
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 李膺 ===
xiaobai_zhuwei: {
	audio: 2,
	// 使用牌指定其他角色为目标后
	trigger: { target: "useCardToTarget" },
	direct: true,
	filter(event, player) {
		return event.player == player && event.isFirstTarget && event.player == player && event.targets?.length > 0 && player.isIn();
	},
	async cost(event, trigger, player) {
		const target = trigger.targets[0];
		const res = await player
			.chooseBool("著威：你可以令" + get.translation(target) + "交给你任意张牌")
			.set("ai", () => (get.attitude(player, target) < 0 ? 1 : 0))
			.forResult();
		event.result = res?.bool ? { bool: true, cost_data: { target } } : { bool: false };
	},
	async content(event, trigger, player) {
		const target = event.cost_data.target;
		if (!target.isIn()) return;
		// 其交给你任意张牌（可取消）
		if (target.countCards("he") > 0) {
			const res = await target
				.chooseCard("he", `著威：交给${get.translation(player)}任意张牌（点击取消不给）`, [1, target.countCards("he")])
				.set("ai", (card) => 5 - get.value(card))
				.forResult();
			if (res?.cards?.length) {
				await target.give(res.cards, player);
			}
		}
		player.storage.xiaobai_zhuwei_list ??= [];
		if (!player.storage.xiaobai_zhuwei_list.includes(target)) player.storage.xiaobai_zhuwei_list.push(target);
		// 其手牌数小于你 → 此牌对其无效
		if (target.countCards("h") < player.countCards("h")) {
			const useEvent = trigger.getParent("useCard");
			if (useEvent) {
				useEvent.excluded.add(target);
				game.log(target, "对此牌无效");
			}
		}
	},
	group: ["xiaobai_zhuwei_limited", "xiaobai_zhuwei_clear"],
	subSkill: {
		// 本回合内：对名单中手牌数小于李膺的目标用牌无效；大于时该牌不计次
		limited: {
			charlotte: true,
			sub: true,
			trigger: { target: "useCardToTarget" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const list = player.storage.xiaobai_zhuwei_list || [];
				return event.player == player && list.includes(event.target);
			},
			content(event, trigger, player) {
				const target = trigger.target;
				if (target.countCards("h") < player.countCards("h")) {
					const useEvent = trigger.getParent("useCard");
					if (useEvent) {
						useEvent.excluded.add(target);
						game.log(target, "对此牌无效");
					}
				} else if (target.countCards("h") > player.countCards("h")) {
					const useEvent = trigger.getParent("useCard");
					if (useEvent) useEvent.addCount = false;
				}
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "phaseAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_zhuwei_list || []).length > 0 && event.player == player;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_zhuwei_list = [];
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// 振义：其他角色侧（全局挂载，弃至与李膺相同并视为使用【桃】）
xiaobai_zhenyi_o: {
	charlotte: true,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		const owner = game.findPlayer((current) => current != player && current.hasSkill("xiaobai_zhenyi"));
		if (!owner?.isIn()) return false;
		return player.countCards("h") > owner.countCards("h");
	},
	filterTarget(card, player, target) {
		const owner = game.findPlayer((current) => current.hasSkill("xiaobai_zhenyi"));
		return target == player && owner?.isIn();
	},
	selectTarget: -1,
	async content(event, trigger, player) {
		const owner = game.findPlayer((current) => current.hasSkill("xiaobai_zhenyi"));
		const diff = player.countCards("h") - owner.countCards("h");
		if (diff <= 0) return;
		const res = await player
			.chooseCard("h", true, diff, `振义：弃置${get.cnNumber(diff)}张手牌并视为使用【桃】`)
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.cards?.length) return;
		player.showCards(res.cards);
		await player.discard(res.cards);
		if (player.isIn() && player.isDamaged()) {
			await player.useCard({ name: "tao", isCard: true }, [player], "xiaobai_zhenyi_o");
		}
	},
	ai: {
		order: 4,
		result: {
			player: 1,
		},
	},
},
xiaobai_zhenyi: {
	audio: 2,
	// 李膺侧：弃至全场最少并视为使用不可响应且伤害+1的【杀】
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		if (!player.isIn()) return false;
		const minHand = Math.min(...game.filterPlayer().map((p) => p.countCards("h")));
		if (player.countCards("h") <= minHand) return false;
		return player.canUse({ name: "sha", isCard: true }, null, true, false) || game.hasPlayer((current) => current != player && lib.filter.targetEnabled({ name: "sha", isCard: true }, player, current));
	},
	async content(event, trigger, player) {
		const minHand = Math.min(...game.filterPlayer().map((p) => p.countCards("h")));
		const n = player.countCards("h") - minHand;
		const res = await player
			.chooseCard("h", true, n, `振义：弃置${get.cnNumber(n)}张手牌并视为使用不可响应且伤害+1的【杀】`)
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.cards?.length) return;
		player.showCards(res.cards);
		await player.discard(res.cards);
		if (!player.isIn()) return;
		const vcard = get.autoViewAs({ name: "sha" }, []);
		vcard.storage = { xiaobai_zhenyi: true };
		const useEvent = player.useCard(vcard, "xiaobai_zhenyi").set("addCount", false);
		// 不可响应
		useEvent.directHit.addArray(game.filterPlayer());
		await useEvent;
	},
	group: ["xiaobai_zhenyi_damage"],
	subSkill: {
		// 振义杀伤害+1
		damage: {
			audio: "xiaobai_zhenyi",
			charlotte: true,
			sub: true,
			name: "振义",
			trigger: { source: "damageBegin2" },
			forced: true,
			filter(event, player) {
				return event.card?.storage?.xiaobai_zhenyi && event.source == player;
			},
			content(event, trigger, player) {
				trigger.num++;
			},
		},
	},
	init(player) {
		// 挂载全局侧（其他角色的桃）
		game.countPlayer((current) => {
			if (current != player) current.addSkill("xiaobai_zhenyi_o");
		});
	},
	onremove(player) {
		game.countPlayer((current) => {
			if (current != player) current.removeSkill("xiaobai_zhenyi_o");
		});
	},
	ai: {
		order: 7,
		result: {
			player: 1,
		},
	},
},

// === 王脩 ===
xiaobai_wangxiu_ziyi: {
	audio: 2,
	// 王脩或攻击范围内角色成为伤害牌唯一目标时
	trigger: { target: "useCardToTarget" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		const card = event.card;
		if (!card || !get.tag(card, "damage")) return false;
		// 唯一目标
		const useEvent = event.getParent("useCard");
		if (!useEvent || !useEvent.targets || useEvent.targets.length != 1) return false;
		const target = event.target;
		if (target != player && !player.inRange(target)) return false;
		// 权重足够（杀=2，其他=1，总数≥3）
		let weight = 0;
		for (const c of player.getCards("he")) {
			weight += get.name(c, player) == "sha" ? 2 : 1;
		}
		return weight >= 3;
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseCardButton("滋义：选择牌置于牌堆顶取消此目标（杀计2张，总数≥3；闪改为重铸；桃改为交出）", player.getCards("he"), [1, player.countCards("he")])
			.set("ai", (button) => {
				const card = button.link;
				if (get.name(card) == "jink") return 3 + get.value(card);
				if (get.name(card) == "peach") return 1 + get.value(card);
				return 5 - get.value(card);
			})
			.forResult();
		if (!res?.links?.length) return void (event.result = { bool: false });
		// 权重校验
		let weight = 0;
		let hasPeach = false;
		for (const card of res.links) {
			weight += get.name(card) == "sha" ? 2 : 1;
			if (get.name(card) == "peach") hasPeach = true;
		}
		if (weight < 3) return void (event.result = { bool: false });
		let receiver = null;
		if (hasPeach) {
			const toRes = await player
				.chooseTarget("滋义：选择【桃】交给的角色", 1, lib.filter.notMe)
				.set("ai", (target) => get.attitude(player, target))
				.forResult();
			receiver = toRes?.targets?.[0] || null;
		}
		event.result = { bool: true, cost_data: { cards: res.links, receiver } };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_wangxiu_ziyi");
		const { cards, receiver } = event.cost_data;
		const tops = [];
		const jinks = [];
		const peaches = [];
		for (const card of cards) {
			const name = get.name(card);
			if (name == "jink") jinks.push(card);
			else if (name == "peach") peaches.push(card);
			else tops.push(card);
		}
		// 普通牌置于牌堆顶
		if (tops.length) {
			game.cardsGotoPile(tops, "insert");
		}
		// 【闪】改为重铸
		if (jinks.length) {
			await player.recast(jinks);
		}
		// 【桃】改为交出
		if (peaches.length && receiver?.isIn()) {
			await player.give(peaches.filter((card) => get.owner(card) == player), receiver);
		}
		// 取消此目标
		trigger.cancel();
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_daozhu: {
	audio: 2,
	// 每轮限一次，一名角色进入濒死状态时
	trigger: { global: "dyingAfter" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		return !player.hasSkill("xiaobai_daozhu_used");
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseBool("悼主：你可以摸牌与交给" + get.translation(trigger.player) + "手牌共计三张")
			.set("ai", () => (get.attitude(player, trigger.player) > 0 ? 1 : 0))
			.forResult();
		event.result = res?.bool ? { bool: true, cost_data: { target: trigger.player } } : { bool: false };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_daozhu");
		player.addTempSkill("xiaobai_daozhu_used", "roundStart");
		const target = event.cost_data.target;
		// 选择交给其的手牌（0~3张），未选的数量改为摸牌
		let given = [];
		if (player.countCards("h") > 0) {
			const res = await player
				.chooseCard("h", `悼主：选择交给${get.translation(target)}的手牌（未选数量改为摸牌，共3张）`, [0, Math.min(3, player.countCards("h"))])
				.set("ai", (card) => 5 - get.value(card, target))
				.forResult();
			given = res?.cards || [];
		}
		const drawNum = 3 - given.length;
		let drawn = 0;
		if (drawNum > 0) {
			const next = player.draw(drawNum);
			await next;
			drawn = (next.cards || []).length;
		}
		if (given.length && target.isIn()) {
			await player.give(given, target);
		}
		// 本回合下次受到的伤害改为本次摸牌数
		player.storage.xiaobai_daozhu_num = drawn;
		player.addTempSkill("xiaobai_daozhu_effect", "phaseAfter");
	},
	subSkill: {
		used: { charlotte: true, sub: true },
		effect: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "悼",
			intro: {
				content(storage, player) {
					return "本回合下次受到的伤害改为" + (player.storage.xiaobai_daozhu_num || 0) + "点";
				},
			},
			trigger: { player: "damageBegin2" },
			forced: true,
			filter(event, player) {
				return player.storage.xiaobai_daozhu_num != undefined;
			},
			content(event, trigger, player) {
				const num = player.storage.xiaobai_daozhu_num || 0;
				player.storage.xiaobai_daozhu_num = undefined;
				trigger.num = num;
				game.log(player, "受到的伤害改为", num, "点");
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 乐广 ===
// 披云：本回合弃置过牌的角色集合（弃置行为记录）
xiaobai_piyun: {
	audio: 2,
	trigger: { global: "phaseAfter" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		return (player.storage.xiaobai_piyun_discarders || []).length > 0;
	},
	async content(event, trigger, player) {
		// 本回合弃置过牌的所有角色各摸一张牌
		const discarders = (player.storage.xiaobai_piyun_discarders || []).filter((current) => current.isIn());
		const res = await player
			.chooseBool("披云：你可以令本回合弃置过牌的所有角色各摸一张牌")
			.set("ai", () => discarders.some((current) => get.attitude(player, current) > 0) || discarders.includes(player))
			.forResult();
		if (!res?.bool) return;
		player.logSkill("xiaobai_piyun");
		for (const current of discarders) {
			if (current.isIn()) await current.draw(1);
		}
		// 这些角色与乐广同时展示一张基本牌或普通锦囊牌
		const participants = discarders.slice(0);
		if (!participants.includes(player)) participants.push(player);
		const displays = new Map();
		for (const current of participants) {
			if (!current.isIn()) continue;
			const cands = current.getCards("h").filter((card) => get.type(card, null, current) == "basic" || (get.type(card, null, current) == "trick" && get.type2(card, current) == "trick"));
			if (!cands.length) continue;
			const pick = await current
				.chooseCard("h", true, 1, "披云：请展示一张基本牌或普通锦囊牌", (card) => cands.includes(card))
				.set("ai", (card) => get.value(card))
				.forResult();
			if (pick?.cards?.length) {
				displays.set(current, pick.cards[0]);
			}
		}
		for (const [current, card] of displays) {
			await current.showCards([card], "披云：展示的牌");
		}
		const myCard = displays.get(player);
		if (!myCard) return;
		// 有其他角色与乐广展示的牌名相同 → 可视为使用一张同名牌
		const sameName = [...displays.entries()].some(([current, card]) => current != player && get.name(card) == get.name(myCard));
		if (!sameName) return;
		const name = get.name(myCard);
		if (!player.hasUseTarget({ name, isCard: true }, true, false)) return;
		const useRes = await player
			.chooseUseTarget({ name, isCard: true }, "披云：你可以视为使用一张【" + get.translation(name) + "】", false).set("addCount", false).forResult();
	},
	group: ["xiaobai_piyun_record", "xiaobai_piyun_clear"],
	subSkill: {
		// 本回合弃置过牌的角色记录
		record: {
			charlotte: true,
			sub: true,
			trigger: { global: ["discardAfter", "loseAfter", "loseAsyncAfter", "cardsDiscardAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (event.name == "discard") return event.player?.isIn();
				if (event.name == "lose") return event.type == "discard" && event.player?.isIn();
				if (event.name == "loseAsync") return Boolean(event.getl);
				return true;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_piyun_discarders ??= [];
				const addDiscarder = (current) => {
					if (current?.isIn() && !player.storage.xiaobai_piyun_discarders.includes(current)) {
						player.storage.xiaobai_piyun_discarders.push(current);
					}
				};
				if (trigger.name == "discard" || trigger.name == "lose") {
					addDiscarder(trigger.player);
				} else if (trigger.name == "loseAsync") {
					game.countPlayer(addDiscarder);
				} else {
					addDiscarder(trigger.player);
				}
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "phaseAfter" },
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				player.storage.xiaobai_piyun_discarders = [];
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_xiaoxin: {
	audio: 2,
	trigger: { global: "damageEnd" },
	direct: true,
	filter(event, player) {
		if (!player.isIn() || event.player == player || !event.player?.isIn()) return false;
		if (player.hasSkill("xiaobai_xiaoxin_used")) return false;
		return player.countCards("he") > 0;
	},
	async cost(event, trigger, player) {
		const target = trigger.player;
		if (target.countCards("he") == 0) return void (event.result = { bool: false });
		const res = await player
			.chooseBool("消心：你可以与" + get.translation(target) + "同时各弃置一张牌，若点数相差不大于3则其回复1点体力")
			.set("ai", () => (get.attitude(player, target) > 0 && target.isDamaged() ? 1 : 0))
			.forResult();
		event.result = res?.bool ? { bool: true, cost_data: { target } } : { bool: false };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_xiaoxin");
		player.addTempSkill("xiaobai_xiaoxin_used", "phaseAfter");
		const target = event.cost_data.target;
		// 同时各弃置一张牌（依次模拟同时）
		const myRes = await player
			.chooseCard("he", true, 1, "消心：请弃置一张牌")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		const toRes = await target
			.chooseCard("he", true, 1, "消心：请弃置一张牌")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!myRes?.cards?.length || !toRes?.cards?.length) return;
		const myCard = myRes.cards[0];
		const toCard = toRes.cards[0];
		await player.discard([myCard]);
		if (target.isIn()) await target.discard([toCard]);
		// 点数相差不大于3（0除外）→ 其回复1点体力
		const diff = Math.abs(get.number(myCard) - get.number(toCard));
		if (diff > 0 && diff <= 3 && target.isIn() && target.isDamaged()) {
			await target.recover(1);
		}
	},
	subSkill: {
		used: { charlotte: true, sub: true },
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 裴楷 ===
xiaobai_liuyu: {
	audio: 2,
	// ⚠️ TODO：流玉依赖 FreeKill 的「中央区」公共区域机制（DIY.CenterArea），无名杀没有对应物。
	// 在确认「中央区」的替代方案前，此技能暂不可发动（filter 恒 false）。
	mark: true,
	marktext: "玉",
	intro: { content: "依赖「中央区」机制，暂未实装。" },
	filter(event, player) {
		return false;
	},
	async cost(event, trigger, player) {
		event.result = { bool: false };
	},
	async content(event, trigger, player) {},
},
xiaobai_supian: {
	audio: 2,
	enable: ["chooseToUse", "phaseUse"],
	filter(event, player) {
		if (player.hasSkill("xiaobai_supian_ban")) return false;
		if (event.skill == "xiaobai_supian" || event._skill == "xiaobai_supian") return true;
		const x = lib.skill.xiaobai_supian.getSuitNum(player);
		if (x == 0 || player.countCards("he") < x) return false;
		// he 中存在基本/普通锦囊，且其牌名能被当前窗口接受
		return player.getCards("he").some((card) => {
			const type = get.type(card, null, player);
			if (type != "basic" && !(type == "trick" && get.type2(card, player) == "trick")) return false;
			return event.filterCard?.(get.autoViewAs({ name: get.name(card, player) }, "unsure"), player, event);
		});
	},
	getSuitNum(player) {
		return new Set(player.getCards("ej").map((card) => get.suit(card))).size;
	},
	chooseButton: {
		dialog(event, player) {
			const x = lib.skill.xiaobai_supian.getSuitNum(player);
			const names = new Set();
			for (const card of player.getCards("he")) {
				const type = get.type(card, null, player);
				if (type == "basic" || (type == "trick" && get.type2(card, player) == "trick")) {
					names.add(get.name(card, player));
				}
			}
			const list = [...names].map((name) => [get.type(name), "", name]);
			return ui.create.dialog("素翩：重铸" + x + "张牌并使用其中一张牌", [list, "vcard"]);
		},
		check(button) {
			if (_status.event.getParent().type != "phase") return 1;
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2] }, null, true));
		},
		backup(links, player) {
			const name = links[0][2];
			const x = lib.skill.xiaobai_supian.getSuitNum(player);
			return {
				audio: "xiaobai_supian",
				filterCard(card, player2) {
					// 其中一张必须是所选牌名，其余任意
					return true;
				},
				selectCard: x,
				position: "he",
				complexCard: true,
				viewAs(cards, player) {
					// 最后一张（或任一）为所选牌名
					const main = cards.find((card) => get.name(card, player) == name);
					if (!main) return { name: "sha", isCard: true };
					return { name, isCard: true, storage: { xiaobai_supian: cards.slice(0) } };
				},
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_supian");
					const mats = event.result.cards.slice(0);
					// 重铸全部 X 张牌
					await player.recast(mats);
					// 此段失效至有 X 张牌被使用后
					player.storage.xiaobai_supian_ban_num = x;
					player.addTempSkill("xiaobai_supian_ban", "phaseAfter");
				},
			};
		},
		prompt(links) {
			return "素翩：重铸" + lib.skill.xiaobai_supian.getSuitNum(player) + "张牌并使用一张【" + get.translation(links[0][2]) + "】";
		},
	},
	group: ["xiaobai_supian_ban", "xiaobai_supian_recover"],
	subSkill: {
		// 失效计数：每有一张牌被使用则 -1，归 0 恢复
		ban: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "翩",
			intro: { content(storage, player) { return "此段失效：还需" + (player.storage.xiaobai_supian_ban_num || 0) + "张牌被使用。"; } },
			trigger: { global: "useCardAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_supian_ban_num || 0) > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_supian_ban_num--;
				if (player.storage.xiaobai_supian_ban_num <= 0) {
					player.storage.xiaobai_supian_ban_num = 0;
					player.removeSkill("xiaobai_supian_ban");
				}
				player.updateMarks("xiaobai_supian_ban");
			},
		},
		// 回复体力后：可令一名手牌数为X的角色摸X张
		recover: {
			audio: "xiaobai_supian",
			charlotte: true,
			sub: true,
			name: "素翩",
			trigger: { player: "recoverAfter" },
			direct: true,
			filter(event, player) {
				const x = lib.skill.xiaobai_supian.getSuitNum(player);
				if (x <= 0 || !player.isIn()) return false;
				return game.hasPlayer((current) => current.countCards("h") == x);
			},
			async content(event, trigger, player) {
				const x = lib.skill.xiaobai_supian.getSuitNum(player);
				const res = await player
					.chooseTarget("素翩：令一名手牌数为" + x + "的角色摸" + x + "张牌", 1, (card, player2, targetx) => targetx.countCards("h") == x)
					.set("ai", (target) => get.attitude(player, target))
					.forResult();
				if (!res?.bool || !res.targets?.length) return;
				player.logSkill("xiaobai_supian");
				await res.targets[0].draw(x);
			},
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},

// === 裴頠 ===
// 恳言匹配数：颜色相同/类型相同/同为伤害或非伤害
xiaobai_kenyan: {
	audio: 2,
	mark: true,
	marktext: "言",
	intro: {
		content(storage, player) {
			const info = player.storage.xiaobai_kenyan_source;
			if (!info?.name) return "本回合尚无可视为的基本牌或普通锦囊牌。";
			return "当前可视为【" + get.translation(info.name) + "】（本轮已发动" + (player.storage.xiaobai_kenyan_times || 0) + "次）。";
		},
	},
	enable: ["chooseToUse", "phaseUse"],
	filter(event, player) {
		const info = player.storage.xiaobai_kenyan_source;
		if (!info?.name || !player.isIn()) return false;
		const need = (player.storage.xiaobai_kenyan_times || 0) + 1;
		if (need > 3) return false;
		if (event.skill == "xiaobai_kenyan" || event._skill == "xiaobai_kenyan") return true;
		if (!event.filterCard?.(get.autoViewAs({ name: info.name }, "unsure"), player, event)) return false;
		return player.countCards("h", (card) => lib.xiaobaiKenyanMatch(card, player, info) >= need) > 0;
	},
	chooseButton: {
		dialog(event, player) {
			const info = player.storage.xiaobai_kenyan_source;
			const list = [[get.type(info.name), "", info.name]];
			return ui.create.dialog("恳言：展示一张手牌置于牌堆顶，视为使用【" + get.translation(info.name) + "】", [list, "vcard"]);
		},
		check(button) {
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2] }, null, true));
		},
		backup(links, player) {
			const info = player.storage.xiaobai_kenyan_source;
			const need = (player.storage.xiaobai_kenyan_times || 0) + 1;
			return {
				audio: "xiaobai_kenyan",
				filterCard(card, player2) {
					return lib.xiaobaiKenyanMatch(card, player2, info) >= need;
				},
				selectCard: 1,
				position: "h",
				viewAs: { name: info.name, isCard: true, storage: { xiaobai_kenyan: true } },
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_kenyan");
					player.storage.xiaobai_kenyan_times = (player.storage.xiaobai_kenyan_times || 0) + 1;
					const card = event.result.cards[0];
					await player.showCards([card], "恳言：展示并置于牌堆顶");
					game.cardsGotoPile([card], "insert");
					event.result.cards = [];
					// 无次数限制
					event.result.addCount = false;
				},
			};
		},
		prompt(links) {
			const info = player.storage.xiaobai_kenyan_source;
			return "恳言：展示一张手牌置于牌堆顶，视为使用【" + get.translation(info.name) + "】";
		},
	},
	group: ["xiaobai_kenyan_record", "xiaobai_kenyan_clear"],
	subSkill: {
		record: {
			charlotte: true,
			sub: true,
			trigger: { player: "useCardAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (event.card?.storage?.xiaobai_kenyan) return false;
				const type = get.type(event.card, null, player);
				return type == "basic" || (type == "trick" && get.type2(event.card, player) == "trick");
			},
			content(event, trigger, player) {
				player.storage.xiaobai_kenyan_source = {
					name: get.name(trigger.card, player),
					color: get.color(trigger.card, player),
					type: get.type(trigger.card, null, player),
					isDamage: Boolean(get.tag(trigger.card, "damage")) ? 1 : 0,
				};
				player.updateMarks("xiaobai_kenyan");
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { player: ["phaseBeginStart", "phaseAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.storage.xiaobai_kenyan_source || (player.storage.xiaobai_kenyan_times || 0) > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_kenyan_source = null;
				player.storage.xiaobai_kenyan_times = 0;
				player.updateMarks("xiaobai_kenyan");
			},
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},
xiaobai_liangzhong: {
	audio: 2,
	trigger: { source: "damageBegin2", player: "damageBegin2" },
	direct: true,
	filter(event, player) {
		if (player.hasSkill("xiaobai_liangzhong_used") || !player.isIn()) return false;
		const wounded = event.player;
		return wounded?.isIn() && event.num > 0;
	},
	async cost(event, trigger, player) {
		const wounded = trigger.player;
		const res = await player
			.chooseBool("量忠：你可以令" + get.translation(wounded) + "将手牌以任意顺序与牌堆顶的三张牌交换，若手牌变化数等于其体力值，防止此伤害")
			.set("ai", () => {
				// 手牌变化数 = |手牌数 - 3|；等于体力值才防
				return Math.abs(wounded.countCards("h") - 3) == wounded.hp ? 1 : 0;
			})
			.forResult();
		event.result = res?.bool ? { bool: true, cost_data: { wounded } } : { bool: false };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_liangzhong");
		player.addTempSkill("xiaobai_liangzhong_used", "phaseAfter");
		const wounded = event.cost_data.wounded;
		const handcards = wounded.getCards("h");
		const n = handcards.length;
		// 手牌以任意顺序与牌堆顶三张牌交换
		const topCards = get.cards(3);
		if (handcards.length) {
			game.cardsGotoPile(handcards, "insert");
		}
		await wounded.gain(topCards, "gain2");
		// 手牌变化数等于其体力值 → 防止此伤害
		if (Math.abs(n - 3) == wounded.hp) {
			trigger.cancel();
			game.log(wounded, "的手牌变化数等于体力值，此伤害被防止");
		}
	},
	subSkill: {
		used: { charlotte: true, sub: true },
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 张方 ===
xiaobai_luedu: {
	audio: 2,
	mark: true,
	marktext: "掠",
	intro: { content(storage, player) { return player.hasSkill("xiaobai_luedu_used") ? "本轮已发动。" : ""; } },
	// 每轮限一次，其他角色的结束阶段
	trigger: { global: "phaseJieshuEnd" },
	direct: true,
	filter(event, player) {
		if (player.hasSkill("xiaobai_luedu_used") || !player.isIn() || player.isNude() || event.player == player) return false;
		const target = event.player;
		return (
			player.canUse({ name: "huogong", isCard: true }, target, true, false) ||
			player.canUse({ name: "chenghuodajie", isCard: true }, target, true, false)
		);
	},
	async cost(event, trigger, player) {
		const target = event.player;
		const maxNum = Math.max(player.hp, 1);
		const res = await player
			.chooseCard("he", `掠都：重铸至多${get.cnNumber(maxNum)}张牌`, [1, maxNum])
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.cards?.length) return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { cards: res.cards, target } };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_luedu");
		player.addTempSkill("xiaobai_luedu_used", "roundStart");
		const { cards, target } = event.cost_data;
		// 记录重铸花色
		const suits = [...new Set(cards.map((card) => get.suit(card, player)))];
		player.storage.xiaobai_luedu_suits = suits;
		player.storage.xiaobai_luedu_matched = false;
		player.storage.xiaobai_luedu_tracking = true;
		await player.recast(cards);
		if (!player.isIn() || !target.isIn()) {
			player.storage.xiaobai_luedu_tracking = false;
			return;
		}
		// 视为对目标使用【火攻】或【趁火打劫】
		const options = [];
		if (player.canUse({ name: "huogong", isCard: true }, target, true, false)) options.push("huogong");
		if (player.canUse({ name: "chenghuodajie", isCard: true }, target, true, false)) options.push("chenghuodajie");
		if (!options.length) {
			player.storage.xiaobai_luedu_tracking = false;
			return;
		}
		let firstName;
		if (options.length == 1) {
			firstName = options[0];
		} else {
			const ctrl = await player
				.chooseControl(["【火攻】", "【趁火打劫】"])
				.set("prompt", "掠都：请选择视为使用的牌")
				.set("ai", () => 0)
				.forResult();
			firstName = ctrl?.control == "【趁火打劫】" ? "chenghuodajie" : "huogong";
		}
		await player.useCard(get.autoViewAs({ name: firstName }, []), [target], "xiaobai_luedu").set("addCount", false);
		player.storage.xiaobai_luedu_tracking = false;
		// 若结算中获得或弃置的牌为本次重铸过的花色 → 摸两张牌，再视为对目标使用另一者
		if (player.storage.xiaobai_luedu_matched && player.isIn()) {
			player.storage.xiaobai_luedu_matched = false;
			const go = await player
				.chooseBool("掠都：你可以摸两张牌，再视为对" + get.translation(target) + "使用另一者")
				.set("ai", () => 1)
				.forResult();
			if (go?.bool) {
				await player.draw(2);
				const otherName = firstName == "huogong" ? "chenghuodajie" : "huogong";
				if (target.isIn() && player.isIn() && player.canUse({ name: otherName, isCard: true }, target, true, false)) {
					await player.useCard(get.autoViewAs({ name: otherName }, []), [target], "xiaobai_luedu").set("addCount", false);
				}
			}
		}
		player.storage.xiaobai_luedu_suits = null;
	},
	group: ["xiaobai_luedu_track", "xiaobai_luedu_used_holder"],
	subSkill: {
		// 结算中：获得的牌或弃置的牌为重铸过的花色
		track: {
			charlotte: true,
			sub: true,
			trigger: { global: ["gainAfter", "loseAfter", "loseAsyncAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (!player.storage.xiaobai_luedu_tracking) return false;
				const suits = player.storage.xiaobai_luedu_suits || [];
				if (!suits.length) return false;
				const matchCard = (card) => suits.includes(get.suit(card));
				if (event.name == "gain" && event.player == player) {
					return (event.cards || []).some(matchCard);
				}
				if (event.name == "lose" && event.player == player && event.type == "discard") {
					return ((event.hs || []).concat(event.es || [])).some(matchCard);
				}
				if (event.name == "loseAsync") {
					const l = event.getl?.(player);
					if (l && (l.hs || []).concat(l.es || []).some(matchCard)) return true;
					const g = event.getg?.(player);
					return (g || []).some(matchCard);
				}
				return false;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_luedu_matched = true;
			},
		},
		used_holder: { charlotte: true, sub: true },
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// 枉恶：其他角色可将装备牌对张方使用（全局挂载）
xiaobai_wange_o: {
	charlotte: true,
	enable: "phaseUse",
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.hasSkill("xiaobai_wange") && current.isIn()) && player.countCards("h", (card) => get.type(card, null, player) == "equip") > 0;
	},
	filterTarget(card, player, target) {
		return target != player && target.hasSkill("xiaobai_wange") && target.isIn();
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		const res = await player
			.chooseCard("h", true, 1, "枉恶：将一张装备牌对" + get.translation(target) + "使用", (card) => get.type(card, null, player) == "equip")
			.forResult();
		const card = res?.cards?.[0];
		if (!card) return;
		player.logSkill("xiaobai_wange_o", target);
		// 将装备牌装到目标装备区（需目标对应栏位可用或可替换）
		if (target.canEquip(card, true)) {
			await player.give([card], target);
			const eq = target.getCards("he").find((c) => c == card || (c.name == card.name && get.position(c) == "e"));
			if (get.position(card) != "e") {
				// give 后由 target 手动装备
				const again = target.getCards("h").find((c) => c == card);
				if (again && target.canEquip(again, true)) {
					await target.equip(again);
				}
			}
		} else {
			// 无法装备：仍交给目标
			await player.give([card], target);
			return;
		}
		if (!target.isIn()) return;
		// 张方本轮发动过掠都 → 重置之
		if (target.hasSkill("xiaobai_luedu_used")) {
			target.removeSkill("xiaobai_luedu_used");
			game.log(target, "的〖掠都〗被重置");
		}
		// 张方本轮使用过伤害牌次数 > 装备区牌数 → 失去1点体力
		const usedDamage = (target.getHistory("useCard") || []).filter((evt) => get.tag(evt.card, "damage")).length;
		if (usedDamage > target.countCards("e")) {
			await target.loseHp(1);
		}
	},
	ai: {
		order: 5,
		result: {
			player: 1,
			target: -1,
		},
	},
},
xiaobai_wange: {
	audio: 2,
	mark: true,
	marktext: "恶",
	intro: { content: "其他角色可以将装备牌对你使用。" },
	init(player) {
		game.countPlayer((current) => {
			if (current != player) current.addSkill("xiaobai_wange_o");
		});
	},
	onremove(player) {
		game.countPlayer((current) => {
			if (current != player) current.removeSkill("xiaobai_wange_o");
		});
	},
},

// === 郭璞 ===
xiaobai_xunlong: {
	audio: 2,
	mark: true,
	marktext: "龙",
	intro: {
		content(storage, player) {
			const list = player.storage.xiaobai_xunlong_targets || [];
			if (!list.length) return "";
			return "本轮寻龙目标：" + list.map((current) => get.translation(current)).join("、");
		},
	},
	// 每轮开始时：选任意名座次相邻的角色
	trigger: { global: "roundStart" },
	direct: true,
	filter(event, player) {
		return player.isIn() && game.players.length > 1;
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseTarget("寻龙：选择任意名座次相邻的角色（每名需与已选相邻，点击取消结束）", [1, Infinity], (card, player2, targetx) => {
				// ui.selected.targets 为引擎维护的已选目标集合
				const sel = ui.selected.targets;
				if (!sel.length) return targetx.isIn();
				return sel.some((s) => s.getNext() == targetx || targetx.getNext() == s || s.getPrevious() == targetx || targetx.getPrevious() == s);
			})
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!res?.bool || !res.targets?.length) return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { targets: res.targets } };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_xunlong");
		player.storage.xiaobai_xunlong_targets = event.cost_data.targets;
		player.updateMarks("xiaobai_xunlong");
	},
	group: ["xiaobai_xunlong_damage", "xiaobai_xunlong_clear"],
	subSkill: {
		damage: {
			audio: "xiaobai_xunlong",
			charlotte: true,
			sub: true,
			name: "寻龙",
			trigger: { global: "damageEnd" },
			direct: true,
			filter(event, player) {
				if (!player.isIn()) return false;
				const targets = player.storage.xiaobai_xunlong_targets || [];
				const source = event.source;
				if (!source?.isIn() || !targets.includes(source)) return false;
				// 其本回合首次造成伤害
				const dmgCount = (source.getHistory("sourceDamage") || []).length;
				if (dmgCount != 1) return false;
				const alive = targets.filter((current) => current.isIn());
				if (!alive.length) return false;
				const counts = alive.map((current) => current.countCards("h"));
				const allDiff = new Set(counts).size == counts.length;
				const allSame = counts.every((c) => c == counts[0]);
				return allDiff || allSame;
			},
			async content(event, trigger, player) {
				const targets = player.storage.xiaobai_xunlong_targets || [];
				const source = event.source;
				const alive = targets.filter((current) => current.isIn());
				const counts = alive.map((current) => current.countCards("h"));
				const allDiff = new Set(counts).size == counts.length;
				const allSame = counts.every((c) => c == counts[0]);
				let choice;
				if (alive.length == 1 || (allDiff && allSame)) {
					// 唯一目标或全同全异（如全员1人）：自由选
					const ctrl = await player
						.chooseControl("令其摸两张牌", "令其弃置两张牌", "cancel2")
						.set("prompt", "寻龙：选择令" + get.translation(source) + "执行的效果")
						.set("ai", () => (get.attitude(player, source) > 0 ? 0 : 1))
						.forResult();
					choice = ctrl?.control;
				} else if (allDiff) {
					const go = await player
						.chooseBool("寻龙：所选角色手牌数各不相同，是否令" + get.translation(source) + "摸两张牌？")
						.set("ai", () => (get.attitude(player, source) > 0 ? 1 : 0))
						.forResult();
					choice = go?.bool ? "令其摸两张牌" : null;
				} else {
					const go = await player
						.chooseBool("寻龙：所选角色手牌数完全相同，是否令" + get.translation(source) + "弃置两张牌？")
						.set("ai", () => (get.attitude(player, source) < 0 ? 1 : 0))
						.forResult();
					choice = go?.bool ? "令其弃置两张牌" : null;
				}
				if (choice == "令其摸两张牌") {
					player.logSkill("xiaobai_xunlong");
					await source.draw(2);
				} else if (choice == "令其弃置两张牌") {
					player.logSkill("xiaobai_xunlong");
					await source.chooseToDiscard(2, "h", true).forResult();
				}
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_xunlong_targets || []).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_xunlong_targets = [];
				player.updateMarks("xiaobai_xunlong");
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_pingfeng: {
	audio: 2,
	trigger: { target: "useCardToTarget" },
	direct: true,
	filter(event, player) {
		if (player.hasSkill("xiaobai_pingfeng_used") || !player.isIn()) return false;
		if (!get.tag(event.card, "damage")) return false;
		const target = event.target;
		if (!target?.isIn()) return false;
		// 手牌数小于所有邻家
		const prev = target.getPrevious();
		const next = target.getNext();
		if (prev && prev != target && prev.countCards("h") <= target.countCards("h")) return false;
		if (next && next != target && next != prev && next.countCards("h") <= target.countCards("h")) return false;
		// 有手牌的邻家
		return (prev && prev != target && prev.countCards("h") > 0) || (next && next != target && next != prev && next.countCards("h") > 0);
	},
	async cost(event, trigger, player) {
		const target = trigger.target;
		const prev = target.getPrevious();
		const next = target.getNext();
		const neighbors = [prev, next].filter((n) => n && n != target && n.isIn() && n.countCards("h") > 0);
		const uniq = [...new Set(neighbors)];
		let neighbor;
		if (uniq.length == 1) {
			neighbor = uniq[0];
		} else {
			const res = await player
				.chooseTarget("屏风：选择" + get.translation(target) + "的一名有手牌的邻家", 1, (card, player2, targetx) => uniq.includes(targetx))
				.set("ai", (target2) => -get.attitude(player, target2))
				.forResult();
			if (!res?.bool || !res.targets?.length) return void (event.result = { bool: false });
			neighbor = res.targets[0];
		}
		event.result = { bool: true, cost_data: { neighbor, target } };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_pingfeng");
		player.addTempSkill("xiaobai_pingfeng_used", "phaseAfter");
		const { neighbor, target } = event.cost_data;
		const pick = await player
			.choosePlayerCard(neighbor, "h", true, 1, "屏风：弃置" + get.translation(neighbor) + "的一张手牌")
			.forResult();
		const card = pick?.cards?.[0] || pick?.links?.[0];
		if (!card) return;
		// 弃牌前记录寻龙角色手牌数是否已各不相同
		const targets = player.storage.xiaobai_xunlong_targets || [];
		const before = lib.skill.xiaobai_xunlong ? (() => {
			const alive = targets.filter((current) => current.isIn());
			const counts = alive.map((current) => current.countCards("h"));
			return alive.length > 1 && new Set(counts).size == counts.length;
		})() : false;
		await player.discard([card]);
		// 若因此使寻龙角色手牌数各不相同 → 此牌对其无效
		const alive = targets.filter((current) => current.isIn());
		const counts = alive.map((current) => current.countCards("h"));
		const after = alive.length > 1 && new Set(counts).size == counts.length;
		if (!before && after) {
			const useEvent = trigger.getParent("useCard");
			if (useEvent) {
				useEvent.excluded.add(target);
				game.log(target, "对此牌无效");
			}
		}
	},
	subSkill: {
		used: { charlotte: true, sub: true },
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 司马攸 ===
xiaobai_qianren: {
	audio: 2,
	mark: true,
	marktext: "谦",
	// 每阶段限一次（phaseChange 于子阶段之间清点）
	// 当你造成伤害时：防止之并摸至全场最大手牌数-1，摸到的牌带谦仁标记
	trigger: { source: "damageBegin2" },
	direct: true,
	filter(event, player) {
		if (!player.isIn() || player.storage.xiaobai_qianren_phaseUsed) return false;
		return event.num > 0;
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseBool("谦仁：是否防止此伤害，并将手牌数摸至恰比全场最大者少一？")
			.set("ai", () => 1)
			.forResult();
		event.result = res?.bool ? { bool: true } : { bool: false };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_qianren");
		player.storage.xiaobai_qianren_phaseUsed = true;
		trigger.cancel();
		if (!player.isIn()) return;
		const max = Math.max(...game.filterPlayer().map((current) => current.countCards("h")));
		const num = max - 1 - player.countCards("h");
		if (num > 0) {
			const next = player.draw(num);
			await next;
			player.addGaintag(next.cards || [], "xiaobai_qianren");
		}
	},
	group: ["xiaobai_qianren_wuxie", "xiaobai_qianren_clear"],
	subSkill: {
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "phaseChange" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.storage.xiaobai_qianren_phaseUsed;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_qianren_phaseUsed = false;
			},
		},
		// 以谦仁牌当【无懈可击】于你回合内使用
		wuxie: {
			audio: "xiaobai_qianren",
			charlotte: true,
			sub: true,
			name: "谦仁",
			enable: ["chooseToUse"],
			filter(event, player) {
				if (_status.currentPhase != player) return false;
				if (!player.countCards("h", (card) => card.hasGaintag?.("xiaobai_qianren"))) return false;
				if (event.skill == "xiaobai_qianren_wuxie" || event._skill == "xiaobai_qianren_wuxie") return true;
				return Boolean(event.filterCard?.(get.autoViewAs({ name: "wuxie" }, "unsure"), player, event));
			},
			filterCard(card) {
				return card.hasGaintag?.("xiaobai_qianren");
			},
			selectCard: 1,
			position: "h",
			viewAs: { name: "wuxie", isCard: true },
			prompt: "谦仁：将「谦仁」牌当【无懈可击】使用",
			check(card) {
				return 8;
			},
			ai: {
				result: {
					player: 1,
				},
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_xincheng: {
	audio: 2,
	locked: true,
	forced: true,
	// 结束阶段：视为对自己使用至少一张（至多五张）【火攻】
	trigger: { player: "phaseJieshuBegin" },
	filter(event, player) {
		return player.isIn() && !player.isKongcheng();
	},
	async content(event, trigger, player) {
		const hadBlack = player.countCards("h", (card) => get.color(card, player) == "black") > 0;
		let discardedBlack = false;
		for (let i = 0; i < 5; i++) {
			if (player.isDead() || player.isKongcheng()) break;
			if (!player.canUse({ name: "huogong", isCard: true }, player, true, false)) break;
			const before = player.countCards("h", (card) => get.color(card, player) == "black");
			await player.useCard(get.autoViewAs({ name: "huogong" }, []), [player], "xiaobai_xincheng").set("addCount", false);
			if (player.countCards("h", (card) => get.color(card, player) == "black") < before) discardedBlack = true;
			if (player.isDead() || player.isKongcheng() || i >= 4) break;
			if (!player.canUse({ name: "huogong", isCard: true }, player, true, false)) break;
			const go = await player
				.chooseBool("心逞：是否继续视为对自己使用一张【火攻】？")
				.set("ai", () => (player.countCards("h", (card) => get.color(card, player) == "black") > 0 ? 1 : 0))
				.forResult();
			if (!go?.bool) break;
		}
		// 因此失去手牌中所有黑色牌后：展示手牌并摸四张牌
		if (hadBlack && discardedBlack && player.isIn() && player.countCards("h", (card) => get.color(card, player) == "black") == 0) {
			const hs = player.getCards("h");
			if (hs.length) await player.showCards(hs);
			await player.draw(4);
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 司马骏 ===
// 迭锋单项执行：逐张选互异牌并选杀目标使用，返回是否成功（false=被跳过/失血）
xiaobai_diefeng: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return ui.cardPile.childNodes.length > 0;
	},
	async content(event, trigger, player) {
		const cards = get.bottomCards(10);
		await player.showCards(cards, "迭锋：亮出牌堆底十张牌");
		let pool = cards.slice(0);
		for (let num = 1; num <= 4; num++) {
			if (player.isDead()) break;
			pool = pool.filter((card) => get.position(card, true) == "o");
			const can = lib.xiaobaiDiefengCan(pool, num);
			// 有无杀目标
			let canUse = false;
			if (can) {
				const vcard = get.autoViewAs({ name: "sha" }, pool.slice(0, num));
				canUse = game.hasPlayer((current) => current.isIn() && player.canUse(vcard, current, true, false));
			}
			if (!can || !canUse) {
				// 遇不可执行项失去1点体力跳过之
				await player.loseHp(1);
				continue;
			}
			// 逐张选互异牌
			const picked = [];
			for (let k = 0; k < num; k++) {
				let avail = pool.filter((card) => {
					if (picked.includes(card)) return false;
					if (num == 1) return get.number(card) == 13;
					if (num == 2) return !picked.some((p) => get.color(p) == get.color(card));
					if (num == 3) return !picked.some((p) => get.type(p, false) == get.type(card, false));
					return !picked.some((p) => get.suit(p) == get.suit(card));
				});
				if (num == 1) avail = pool.filter((card) => get.number(card) == 13);
				const pick = await player
					.chooseCardButton(`迭锋（第${num}项）：选择第${k + 1}张牌`, avail, 1)
					.set("ai", (button) => get.value(button.link))
					.forResult();
				if (!pick?.links?.length) {
					// 选不满 → 视为放弃该项，失血跳过
					break;
				}
				picked.push(pick.links[0]);
			}
			if (picked.length < num) {
				await player.loseHp(1);
				continue;
			}
			// 选杀目标
			const vcard = get.autoViewAs({ name: "sha" }, picked);
			vcard.storage = { xiaobai_diefeng_num: num };
			const res = await player
				.chooseTarget(`迭锋：选择【杀】的目标`, 1, (card, player2, targetx) => {
					const vc = get.event().vcard;
					return player2.canUse(vc, targetx, true, false);
				})
				.set("vcard", vcard)
				.set("ai", (target) => get.damageEffect(target, player, player, get.nature(vcard)))
				.forResult();
			if (!res?.bool || !res.targets?.length) {
				await player.loseHp(1);
				continue;
			}
			await player.useCard(vcard, res.targets, "xiaobai_diefeng").set("addCount", false);
			for (const card of picked) pool.remove(card);
		}
		// 亮出未用的牌进入弃牌堆
		const rest = pool.filter((card) => get.position(card, true) == "o");
		if (rest.length) {
			game.cardsDiscard(rest);
		}
	},
	subSkill: {},
	// 迭锋杀：目标手牌数与底牌数（材料张数）相等 → 伤害+1
	group: ["xiaobai_diefeng_damage"],
	ai: {
		order: 6,
		result: {
			player: 1,
		},
	},
},
xiaobai_diefeng_damage: {
	audio: "xiaobai_diefeng",
	charlotte: true,
	sub: true,
	name: "迭锋",
	trigger: { source: "damageBegin2" },
	forced: true,
	filter(event, player) {
		const num = event.card?.storage?.xiaobai_diefeng_num;
		return num != undefined && event.to?.isIn() && event.to.countCards("h") == num;
	},
	content(event, trigger, player) {
		trigger.num++;
		game.log(trigger.to, "的手牌数与底牌数相等，伤害+1");
	},
},
xiaobai_tianfa: {
	audio: 2,
	mark: true,
	marktext: "田",
	intro: {
		content(storage, player) {
			const list = player.storage.xiaobai_tianfa_targets || [];
			if (!list.length) return "";
			return "本轮耕战角色：" + list.map((current) => get.translation(current)).join("、");
		},
	},
	// 每轮开始时：令至多三名角色于本轮获得「耕战」
	trigger: { global: "roundStart" },
	direct: true,
	filter(event, player) {
		return player.isIn() && game.hasPlayer((current) => current.isIn());
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseTarget("田法：令至多三名角色于本轮获得「耕战」", [1, 3], (card, player2, targetx) => targetx.isIn())
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		event.result = res?.bool && res.targets?.length ? res : { bool: false };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_tianfa");
		player.storage.xiaobai_tianfa_targets = event.targets.slice(0);
		player.storage.xiaobai_tianfa_count = [];
		for (const current of event.targets) {
			if (!current.isIn() || current.hasSkill("xiaobai_gengzhan")) continue;
			current.addSkill("xiaobai_gengzhan");
			player.storage.xiaobai_tianfa_count.push([current, 0]);
		}
	},
	group: ["xiaobai_tianfa_bottom", "xiaobai_tianfa_end"],
	subSkill: {
		// 耕战弃置的牌可置于牌堆底
		bottom: {
			audio: "xiaobai_tianfa",
			charlotte: true,
			sub: true,
			name: "田法",
			trigger: { global: "loseAfter" },
			direct: true,
			filter(event, player) {
				const targets = player.storage.xiaobai_tianfa_targets || [];
				if (!targets.length) return false;
				return event.type == "discard" && targets.includes(event.player) && ((event.hs || []).length > 0);
			},
			async content(event, trigger, player) {
				const go = await player
					.chooseBool("田法：你可以将" + get.translation(trigger.player) + "因「耕战」弃置的牌置于牌堆底")
					.set("ai", () => (get.attitude(player, trigger.player) > 0 ? 1 : 0))
					.forResult();
				if (!go?.bool) return;
				const cards = (trigger.hs || []).filter((card) => get.position(card, true) == "d");
				if (cards.length) {
					game.cardsGotoPile(cards); // 无参 = 牌堆底
				}
			},
		},
		// 本轮结束：因耕战弃牌最多的角色回复1点体力，移除所有耕战
		end: {
			audio: "xiaobai_tianfa",
			charlotte: true,
			sub: true,
			name: "田法",
			forced: true,
			trigger: { global: "roundEnd" },
			filter(event, player) {
				return (player.storage.xiaobai_tianfa_targets || []).length > 0;
			},
			async content(event, trigger, player) {
				const records = player.storage.xiaobai_tianfa_count || [];
				let max = 0;
				for (const [current, n] of records) {
					if (current.isIn() && n > max) max = n;
				}
				if (max > 0) {
					for (const [current, n] of records) {
						if (current.isIn() && n == max && current.isDamaged()) {
							await current.recover(1);
						}
					}
				}
				for (const current of player.storage.xiaobai_tianfa_targets || []) {
					if (current.isIn() && current.hasSkill("xiaobai_gengzhan")) {
						current.removeSkill("xiaobai_gengzhan");
					}
				}
				player.storage.xiaobai_tianfa_targets = [];
				player.storage.xiaobai_tianfa_count = [];
				player.updateMarks("xiaobai_tianfa");
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// 耕战：衍生技（田法授予）
xiaobai_gengzhan: {
	audio: 2,
	mark: true,
	marktext: "耕",
	intro: { content: "摸牌阶段，你可以改为弃置任意张颜色不同的牌并摸两倍数量的牌。" },
	// 摸牌阶段：改为弃置任意张颜色不同的牌并摸两倍数量的牌
	trigger: { player: "phaseDrawBegin1" },
	direct: true,
	filter(event, player) {
		return player.isIn() && player.countCards("he") > 0;
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseCard("he", "耕战：弃置任意张颜色不同的牌并摸两倍数量的牌（点击取消正常摸牌）", [0, 2], (card, player2) => {
				return !ui.selected.cards.some((p) => get.color(p, player2) == get.color(card, player2));
			})
			.set("ai", (card) => 3 - get.value(card))
			.forResult();
		if (!res?.cards?.length) return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { cards: res.cards } };
	},
	async content(event, trigger, player) {
		const cards = event.cost_data.cards;
		const n = cards.length;
		if (n == 0) return;
		trigger.num = 0; // 放弃原摸牌
		await player.discard(cards);
		if (!player.isIn()) return;
		await player.draw(2 * n);
		// 通知田法记录
		const owner = game.findPlayer((current) => current.hasSkill("xiaobai_tianfa"));
		if (owner) {
			const records = owner.storage.xiaobai_tianfa_count || [];
			const record = records.find(([current]) => current == player);
			if (record) record[1] += n;
			else records.push([player, n]);
			owner.storage.xiaobai_tianfa_count = records;
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 王浚 ===
xiaobai_jiuzheng: {
	audio: 2,
	// 每回合限一次：将至少一张牌置于牌堆顶，视为使用目标数上限为X的【杀】（无距离限制）
	enable: ["chooseToUse", "phaseUse"],
	usable: 1,
	hiddenCard(player, name) {
		return name == "sha" && player.countCards("he") > 0;
	},
	filter(event, player) {
		if (player.hasSkill("xiaobai_jiuzheng_used")) return false;
		if (player.countCards("he") == 0) return false;
		if (event.skill == "xiaobai_jiuzheng" || event._skill == "xiaobai_jiuzheng") return true;
		if (event.type == "phase") {
			return Boolean(event.filterCard?.(get.autoViewAs({ name: "sha" }, "unsure"), player, event));
		}
		return false;
	},
	chooseButton: {
		dialog(event, player) {
			return ui.create.dialog("咎征：将至少一张牌置于牌堆顶，视为使用目标数上限为X的【杀】", [[["basic", "", "sha"]], "vcard"]);
		},
		check(button) {
			return 1;
		},
		backup(links, player) {
			return {
				audio: "xiaobai_jiuzheng",
				filterCard: true,
				selectCard: [1, Infinity],
				position: "he",
				complexCard: true,
				viewAs: { name: "sha", isCard: true, storage: { xiaobai_jiuzheng: true } },
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_jiuzheng");
					player.addTempSkill("xiaobai_jiuzheng_used", "phaseAfter");
					const mats = event.result.cards.slice(0);
					// 置于牌堆顶（不可见，保持所选顺序：reverse 后 insert 使第一张在最上）
					game.cardsGotoPile(mats.slice().reverse(), "insert");
					event.result.cards = [];
					event.result.card.storage.xiaobai_jiuzheng_num = mats.length;
				},
			};
		},
		prompt(links) {
			return "咎征：将至少一张牌置于牌堆顶，视为使用目标数上限为等量的【杀】（无距离限制）";
		},
	},
	// 目标数上限 = 置于牌堆顶的牌数（useCard2 追加目标，攀弦模式）
	group: ["xiaobai_jiuzheng_extra", "xiaobai_jiuzheng_end", "xiaobai_jiuzheng_used_holder"],
	subSkill: {
		extra: {
			charlotte: true,
			sub: true,
			trigger: { player: "useCard2" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (!event.card?.storage?.xiaobai_jiuzheng_num) return false;
				return game.hasPlayer((target) => target != player && !event.targets.includes(target) && lib.filter.targetEnabled2(event.card, player, target));
			},
			async content(event, trigger, player) {
				const maxExtra = trigger.card.storage.xiaobai_jiuzheng_num - 1;
				const targets = game.filterPlayer((target) => target != player && !trigger.targets.includes(target) && lib.filter.targetEnabled2(trigger.card, player, target));
				const res = await player
					.chooseTarget({
						prompt: "咎征：为此【杀】添加至多" + maxExtra + "个目标",
						selectTarget: [0, maxExtra],
						filterTarget(card, player2, target) {
							return get.event().targets.includes(target);
						},
						targets,
						ai(target) {
							return get.effect(target, _status.event.getTrigger().card, get.player());
						},
					})
					.forResult();
				if (res?.targets?.length) {
					trigger.targets.addArray(res.targets);
				}
			},
		},
		// 回合结束：亮出牌堆顶 X 张依次使用，每有一张不能使用失去1点体力
		end: {
			audio: "xiaobai_jiuzheng",
			charlotte: true,
			sub: true,
			name: "咎征",
			forced: true,
			trigger: { global: "phaseAfter" },
			filter(event, player) {
				return (player.storage.xiaobai_jiuzheng_num || 0) > 0 && player.isIn();
			},
			async content(event, trigger, player) {
				const x = player.storage.xiaobai_jiuzheng_num;
				player.storage.xiaobai_jiuzheng_num = 0;
				const cards = get.cards(x);
				await player.showCards(cards, "咎征：亮出牌堆顶的" + x + "张牌");
				let failed = 0;
				for (const card of cards) {
					if (player.isDead()) {
						failed++;
						continue;
					}
					if (!player.canUse(card, null, true, false) || !player.hasUseTarget(card, true, false)) {
						failed++;
						continue;
					}
					const useRes = await player.chooseUseTarget(card, "咎征：请使用亮出的【" + get.translation(card) + "】", false).forResult();
					if (!useRes?.bool) failed++;
				}
				if (failed > 0 && player.isIn()) {
					await player.loseHp(failed);
				}
			},
		},
		used_holder: { charlotte: true, sub: true },
	},
	ai: {
		order: 6,
		result: {
			player: 1,
		},
	},
},
xiaobai_liguang: {
	audio: 2,
	locked: true,
	forced: true,
	// 造成或受到伤害后（统一取受伤角色）
	trigger: { source: "damageEnd", player: "damageEnd" },
	filter(event, player) {
		return player.isIn() && event.player?.isIn() && event.num > 0;
	},
	async content(event, trigger, player) {
		const wounded = trigger.player;
		const source = trigger.source;
		// 受伤角色非空城：可选择以一张手牌交换牌堆顶的牌
		if (wounded.countCards("h") > 0) {
			const res = await wounded
				.chooseCard("h", "离光：用一张手牌交换牌堆顶的牌（点击取消则" + (source?.isIn() ? get.translation(source) : "伤害来源") + "视为使用【洞烛先机】）", 1)
				.set("ai", (card) => 4 - get.value(card))
				.forResult();
			if (res?.cards?.length && wounded.isIn()) {
				const card = res.cards[0];
				const top = get.cards(1);
				game.cardsGotoPile([card], "insert");
				await wounded.gain(top, "gain2");
				return;
			}
		}
		// 未交换：伤害来源视为使用【洞烛先机】（对自己：观2+摸2）
		if (source?.isIn()) {
			await source.useCard(get.autoViewAs({ name: "dongzhuxianji" }, []), [source], "xiaobai_liguang").set("addCount", false);
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 和峤 ===
// 可声明的锦囊牌名池：延时锦囊也算（get.type2 归并），且必须是【无懈可击】可响应的锦囊
xiaobai_yushi: {
	audio: 2,
	mark: true,
	marktext: "识",
	intro: {
		content(storage, player) {
			const declared = player.storage.xiaobai_yushi_declared || [];
			if (!declared.length) return "尚未声明。";
			return "本轮声明：" + declared.map((n) => "【" + get.translation(n) + "】").join("、") + "（抵消数：" + (player.storage.xiaobai_yushi_count || 0) + "）";
		},
	},
	// 每轮开始时：声明三张不同的锦囊牌名（上轮声明过的本轮不能重复）
	trigger: { global: "roundStart" },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		return player.isIn();
	},
	async content(event, trigger, player) {
		// 锦囊牌名池（含延时）
		const pool = get.inpileVCardList((info) => info[0] == "trick" || info[0] == "delay").map((info) => info[2]);
		const previous = player.storage.xiaobai_yushi_previous || [];
		const choices = [...new Set(pool)].filter((name) => !previous.includes(name));
		if (choices.length < 3) {
			player.storage.xiaobai_yushi_declared = [];
			player.storage.xiaobai_yushi_count = 0;
			return;
		}
		const res = await player
			.chooseButton(["预识：请选择三张不同的锦囊牌名", [choices.map((n) => [get.type2(n), "", n]), "vcard"]], true, [3, 3])
			.set("complexSelect", true)
			.set("ai", (button) => 1)
			.forResult();
		if (!res?.links?.length) {
			player.storage.xiaobai_yushi_declared = [];
			player.storage.xiaobai_yushi_count = 0;
			return;
		}
		player.storage.xiaobai_yushi_declared = res.links.map((link) => link[2]);
		player.storage.xiaobai_yushi_count = 0;
		player.updateMarks("xiaobai_yushi");
		game.log(player, "声明了", "#g" + player.storage.xiaobai_yushi_declared.map((n) => "【" + get.translation(n) + "】").join("、"));
	},
	group: ["xiaobai_yushi_wuxie", "xiaobai_yushi_end", "xiaobai_yushi_clear"],
	subSkill: {
		// 本轮内：一张牌当【无懈可击】用于抵消声明的锦囊牌
		wuxie: {
			audio: "xiaobai_yushi",
			charlotte: true,
			sub: true,
			name: "预识",
			enable: ["chooseToUse"],
			filter(event, player) {
				const declared = player.storage.xiaobai_yushi_declared || [];
				if (!declared.length || player.countCards("he") == 0) return false;
				if (event.type != "wuxie") return false;
				// 被响应的锦囊在声明名单中
				const target = event.respondTo?.[1];
				const card = target || event.card;
				const name = card ? get.name(card, event.getParent()?.player || player) : null;
				if (!name || !declared.includes(name)) return false;
				return Boolean(event.filterCard?.(get.autoViewAs({ name: "wuxie" }, "unsure"), player, event));
			},
			filterCard: true,
			selectCard: 1,
			position: "he",
			viewAs: { name: "wuxie", isCard: true, storage: { xiaobai_yushi: true } },
			prompt: "预识：将一张牌当【无懈可击】抵消声明的锦囊牌",
			check(card) {
				return 8 - get.value(card);
			},
			async precontent(event, trigger, player) {
				player.logSkill("xiaobai_yushi");
				player.storage.xiaobai_yushi_count = (player.storage.xiaobai_yushi_count || 0) + 1;
				player.updateMarks("xiaobai_yushi");
			},
			ai: {
				result: {
					player: 1,
				},
			},
		},
		// 本轮结束时：可摸 X 张（X=抵消数），然后下次发动不能声明这三张牌
		end: {
			audio: "xiaobai_yushi",
			charlotte: true,
			sub: true,
			name: "预识",
			forced: true,
			trigger: { global: "roundEnd" },
			filter(event, player) {
				return (player.storage.xiaobai_yushi_declared || []).length > 0;
			},
			async content(event, trigger, player) {
				const declared = player.storage.xiaobai_yushi_declared || [];
				const count = player.storage.xiaobai_yushi_count || 0;
				if (count > 0) {
					const go = await player
						.chooseBool("预识：是否摸" + get.cnNumber(count) + "张牌？")
						.set("ai", () => 1)
						.forResult();
					if (go?.bool) {
						player.logSkill("xiaobai_yushi");
						await player.draw(count);
					}
				}
				player.storage.xiaobai_yushi_previous = declared;
				player.storage.xiaobai_yushi_declared = [];
				player.storage.xiaobai_yushi_count = 0;
				player.updateMarks("xiaobai_yushi");
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_yushi_previous || []).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_yushi_previous = [];
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_gangjiao: {
	audio: 2,
	mark: true,
	marktext: "矫",
	intro: {
		content(storage, player) {
			const fixed = player.storage.xiaobai_gangjiao_target;
			return fixed ? "下次仅能对" + get.translation(fixed) + "发动。" : "";
		},
	},
	// 使用黑色锦囊牌后
	trigger: { player: "useCardAfter" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		if (get.color(event.card, player) != "black" || get.type2(event.card, player) != "trick") return false;
		// 限定目标检查：已限定且仍有效 → 仅能对其发动
		const fixed = player.storage.xiaobai_gangjiao_target;
		if (fixed) return fixed.isIn() && fixed.countCards("h") != player.countCards("h");
		return game.hasPlayer((current) => current != player && current.isIn() && current.countCards("h") != player.countCards("h"));
	},
	async cost(event, trigger, player) {
		const fixed = player.storage.xiaobai_gangjiao_target;
		let candidates;
		if (fixed) {
			candidates = [fixed];
		} else {
			candidates = game.filterPlayer((current) => current != player && current.isIn() && current.countCards("h") != player.countCards("h"));
		}
		const res = await player
			.chooseTarget("刚矫：令一名手牌数与你不同的角色将手牌数向你调整1", 1, (card, player2, targetx) => candidates.includes(targetx))
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		event.result = res?.bool && res.targets?.length ? { bool: true, cost_data: { target: res.targets[0] } } : { bool: false };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_gangjiao");
		const to = event.cost_data.target;
		if (to.countCards("h") > player.countCards("h")) {
			await to.chooseToDiscard(1, "h", true).forResult();
		} else if (to.countCards("h") < player.countCards("h")) {
			await to.draw(1);
		}
		if (!to.isIn() || !player.isIn()) return;
		if (to.countCards("h") == player.countCards("h")) {
			// 手牌数相同：其回复1点体力，解除限定
			player.storage.xiaobai_gangjiao_target = null;
			if (to.isDamaged()) {
				await to.recover(1);
			}
		} else {
			// 不同：下次仅能对其发动
			player.storage.xiaobai_gangjiao_target = to;
		}
		player.updateMarks("xiaobai_gangjiao");
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 荀恺 ===
// 倚阀状态：荀恺手牌数为全场唯一众数
xiaobai_huqu: {
	audio: 2,
	mark: true,
	marktext: "狐",
	intro: {
		content(storage, player) {
			const suit = player.storage.xiaobai_huqu_suit;
			const count = player.storage.xiaobai_huqu_count || 0;
			if (!suit) return "暂无连续花色记录。";
			return "当前连续花色：【" + get.translation(suit) + "】×" + count + "（使用者：" + (player.storage.xiaobai_huqu_from ? get.translation(player.storage.xiaobai_huqu_from) : "无") + "）";
		},
	},
	// 每轮限一次：与上张牌同花色的牌当任意基本牌使用（记录逻辑拆至 subSkill.record）
	enable: ["chooseToUse", "phaseUse"],
	usable: 1,
	hiddenCard(player, name) {
		if (!get.type({ name }) || get.type({ name }) != "basic") return false;
		const suit = player.storage.xiaobai_huqu_suit;
		return Boolean(suit) && player.countCards("h", (card) => get.suit(card, player) == suit) > 0;
	},
	filter(event, player) {
		if (player.hasSkill("xiaobai_huqu_used")) return false;
		const suit = player.storage.xiaobai_huqu_suit;
		if (!suit) return false;
		if (player.countCards("h", (card) => get.suit(card, player) == suit) == 0) return false;
		if (event.skill == "xiaobai_huqu" || event._skill == "xiaobai_huqu") return true;
		return get.inpileVCardList((info) => info[0] == "basic").some((info) => event.filterCard?.(get.autoViewAs({ name: info[2], nature: info[3], isCard: true }, "unsure"), player, event));
	},
	chooseButton: {
		dialog(event, player) {
			const list = get.inpileVCardList((info) => info[0] == "basic");
			const suit = player.storage.xiaobai_huqu_suit;
			return ui.create.dialog("狐趋：将一张【" + get.translation(suit) + "】手牌当基本牌使用", [list, "vcard"]);
		},
		check(button) {
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2], nature: button.link[3], isCard: true }), null, true);
		},
		backup(links, player) {
			const suit = player.storage.xiaobai_huqu_suit;
			return {
				audio: "xiaobai_huqu",
				filterCard(card, player2) {
					return get.suit(card, player2) == suit && get.position(card) == "h";
				},
				selectCard: 1,
				position: "h",
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true, storage: { xiaobai_huqu: true } },
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_huqu");
					player.addTempSkill("xiaobai_huqu_used", "roundStart");
					const x = (player.storage.xiaobai_huqu_count || 0) + 1;
					const from = player.storage.xiaobai_huqu_from;
					// 使用后：手牌数调整至X 或 令上张牌的使用者摸X张
					const opts = ["调整手牌数至" + x];
					if (from?.isIn() && from != player) opts.push("令其摸" + x + "张牌");
					const ctrl = await player
						.chooseControl(opts)
						.set("prompt", "狐趋：请选择一项")
						.set("ai", () => (from?.isIn() && get.attitude(player, from) > 0 ? 1 : 0))
						.forResult();
					if (!ctrl?.control) return;
					if (ctrl.control.startsWith("调整手牌数")) {
						const now = player.countCards("h");
						if (now > x) {
							await player.chooseToDiscard(now - x, "h", true).forResult();
						} else if (now < x) {
							await player.draw(x - now);
						}
					} else if (from?.isIn()) {
						await from.draw(x);
					}
				},
			};
		},
		prompt(links) {
			const suit = player.storage.xiaobai_huqu_suit;
			return "狐趋：将一张与上张牌同花色（" + get.translation(suit) + "）的牌当【" + get.translation(links[0][2]) + "】使用";
		},
	},
	group: ["xiaobai_huqu_record"],
	subSkill: {
		record: {
			charlotte: true,
			sub: true,
			trigger: { global: "useCardAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.isIn() && Boolean(event.card);
			},
			content(event, trigger, player) {
				const suit = get.suit(trigger.card);
				const from = trigger.player;
				if (player.storage.xiaobai_huqu_suit == suit) {
					player.storage.xiaobai_huqu_count = (player.storage.xiaobai_huqu_count || 0) + 1;
				} else {
					player.storage.xiaobai_huqu_suit = suit;
					player.storage.xiaobai_huqu_count = 1;
				}
				player.storage.xiaobai_huqu_from = from;
				player.updateMarks("xiaobai_huqu");
			},
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},
// 倚阀
xiaobai_yifa: {
	audio: 2,
	locked: true,
	// 荀恺手牌数为全场唯一众数
	mod: {
		// 相同分支：荀恺用【桃】/装备牌时可指定手牌数相同的其他角色（桃无视"仅受伤"限制的近似：保留 isDamaged 判定）
		targetEnabledx(card, player, target) {
			if (!lib.skill.xiaobai_yifa.uniqueMode(player)) return;
			if (target == player || target.countCards('h') != player.countCards('h')) return;
			const name = get.name(card, player);
			if (name == 'tao' && target.isDamaged()) return true;
			if (get.type(card, player) == 'equip' && target.canEquip(card, true)) return true;
		},
	},
	trigger: { global: "damageBegin2" },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		if (!player.isIn() || event.num <= 0) return false;
		if (!lib.skill.xiaobai_yifa.uniqueMode(player)) return false;
		// 你们彼此之间：source/to 一方是荀恺，另一方手牌数与荀恺不同
		const source = event.source;
		const to = event.player;
		if (!source?.isIn() || !to?.isIn()) return false;
		if (source == player && to != player && to.countCards("h") != player.countCards("h")) return true;
		if (to == player && source != player && source.countCards("h") != player.countCards("h")) return true;
		return false;
	},
	content(event, trigger, player) {
		trigger.num++;
		game.log("倚阀：此伤害+1");
	},
	group: ["xiaobai_yifa_draw"],
	subSkill: {
		draw: {
			// 相同分支：手牌数与荀恺相同的其他角色用【桃】或装备牌指定荀恺（或荀恺用其指定对方）后，各摸一张牌
			charlotte: true,
			sub: true,
			name: "倚阀",
			trigger: { global: "useCardToTargeted" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (!lib.skill.xiaobai_yifa.uniqueMode(player)) return false;
				const card = event.card;
				const name = get.name(card, event.player);
				if (name != "tao" && get.type(card, event.player) != "equip") return false;
				// 使用者与目标之一为荀恺，另一者手牌数与荀恺相同
				const user = event.player;
				const to = event.target;
				if (user == to) return false;
				if (user == player && to != player && to.countCards("h") == player.countCards("h")) return true;
				if (to == player && user != player && user.countCards("h") == player.countCards("h")) return true;
				return false;
			},
			content(event, trigger, player) {
				const user = trigger.player;
				const to = trigger.target;
				if (user.isIn()) user.draw(1);
				if (to.isIn()) to.draw(1);
			},
		},
	},
	uniqueMode(player) {
		// 荀恺手牌数是否为全场唯一众数
		const counts = {};
		game.countPlayer((current) => {
			const n = current.countCards("h");
			counts[n] = (counts[n] || 0) + 1;
		});
		let max = 0;
		for (const n in counts) max = Math.max(max, counts[n]);
		if (max < 2) return false;
		const myCount = counts[player.countCards("h")] || 0;
		return myCount == max;
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 罗尚 ===
xiaobai_xuancheng: {
	audio: 2,
	mark: true,
	marktext: "尘",
	intro: {
		content(storage, player) {
			const mode = player.storage.xiaobai_xuancheng_mode || 0;
			if (mode == 1) return "当前模式1：你的【杀】视为任意单目标普通锦囊牌，其他角色的【闪】视为【无懈可击】。";
			if (mode == 2) return "当前模式2：你的非基本手牌视为无次数限制的【杀】，其他角色的非基本手牌视为【闪】。";
			return "";
		},
	},
	// 出牌阶段开始时：选择模式（可取消）；获得牌或造成伤害时切换
	trigger: { player: "phaseUseBegin" },
	direct: true,
	filter(event, player) {
		return player.isIn();
	},
	async cost(event, trigger, player) {
		const ctrl = await player
			.chooseControl(["模式一", "模式二", "cancel2"])
			.set("choiceList", ["你的【杀】视为任意单目标普通锦囊牌，其他角色的【闪】视为【无懈可击】", "你的非基本手牌视为无次数限制的【杀】，其他角色的非基本手牌视为【闪】"])
			.set("prompt", "旋尘：请选择本回合的效果")
			.set("ai", () => 0)
			.forResult();
		if (!ctrl?.control || ctrl.control == "cancel2") return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { mode: ctrl.control == "模式一" ? 1 : 2 } };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_xuancheng");
		player.storage.xiaobai_xuancheng_mode = event.cost_data.mode;
		player.addTempSkill("xiaobai_xuancheng_mode", "phaseAfter");
		player.addTempSkill("xiaobai_xuancheng_o", "phaseAfter");
		game.countPlayer((current) => {
			if (current != player) current.addTempSkill("xiaobai_xuancheng_o", "phaseAfter");
		});
	},
	group: ["xiaobai_xuancheng_switch", "xiaobai_xuancheng_mode_holder"],
	subSkill: {
		mode_holder: { charlotte: true, sub: true },
		mode: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "旋",
			intro: { content(storage, player) { return (player.storage.xiaobai_xuancheng_mode || 0) == 1 ? "模式一生效中" : "模式二生效中"; } },
		},
		// 获得牌或造成伤害时改为另一项
		switch: {
			charlotte: true,
			sub: true,
			trigger: { global: ["gainAfter", "loseAsyncAfter"], source: "damageEnd" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const mode = player.storage.xiaobai_xuancheng_mode || 0;
				if (mode == 0) return false;
				if (event.name == "gain") return event.player == player;
				if (event.name == "damage") return true;
				// loseAsync：从他人处获得牌
				const l = event.getl?.(player);
				return Boolean(l && (l.hs || []).length && event.getg?.(player)?.length);
			},
			content(event, trigger, player) {
				player.storage.xiaobai_xuancheng_mode = player.storage.xiaobai_xuancheng_mode == 1 ? 2 : 1;
				player.updateMarks("xiaobai_xuancheng_mode");
				game.log(player, "的〖旋尘〗切换为模式" + player.storage.xiaobai_xuancheng_mode);
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// 旋尘转化（罗尚侧，模式1：杀当单目标普通锦囊用；模式2：非基本手牌当无次数限制的杀用）
xiaobai_xuancheng_o: {
	charlotte: true,
	enable: ["chooseToUse", "phaseUse"],
	filter(event, player) {
		const mode = player.storage.xiaobai_xuancheng_mode || 0;
		if (mode == 0 || !player.isIn()) return false;
		if (event.skill == "xiaobai_xuancheng_o" || event._skill == "xiaobai_xuancheng_o") return true;
		if (mode == 1) {
			// 出牌阶段：杀当普通锦囊用
			if (event.type != "phase") return false;
			return player.countCards("h", (card) => get.name(card, player) == "sha") > 0 && get.inpileVCardList((info) => info[0] == "trick").length > 0;
		}
		// 模式2：非基本手牌当杀用
		return player.countCards("h", (card) => get.type(card, player) != "basic") > 0 && Boolean(event.filterCard?.(get.autoViewAs({ name: "sha" }, "unsure"), player, event));
	},
	chooseButton: {
		dialog(event, player) {
			const mode = player.storage.xiaobai_xuancheng_mode;
			if (mode == 1) {
				const list = get.inpileVCardList((info) => info[0] == "trick");
				return ui.create.dialog("旋尘：将一张【杀】当单目标普通锦囊牌使用", [list, "vcard"]);
			}
			return ui.create.dialog("旋尘：将一张非基本手牌当【杀】使用", [[["basic", "", "sha"]], "vcard"]);
		},
		check(button) {
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2] }, null, true));
		},
		backup(links, player) {
			const mode = player.storage.xiaobai_xuancheng_mode;
			const name = mode == 1 ? links[0][2] : "sha";
			return {
				audio: "xiaobai_xuancheng",
				filterCard(card, player2) {
					if (mode == 1) return get.name(card, player2) == "sha" && get.position(card) == "h";
					return get.type(card, player2) != "basic" && get.position(card) == "h";
				},
				selectCard: 1,
				position: "h",
				viewAs: { name, isCard: true, storage: { xiaobai_xuancheng: true } },
				precontent(event, trigger, player) {
					player.logSkill("xiaobai_xuancheng");
					if (mode == 2) {
						// 无次数限制
						player.addTempSkill("xiaobai_xuancheng_free", "phaseAfter");
					}
				},
			};
		},
		prompt(links) {
			const mode = player.storage.xiaobai_xuancheng_mode;
			return mode == 1
				? "旋尘：将一张【杀】当【" + get.translation(links[0][2]) + "】使用"
				: "旋尘：将一张非基本手牌当【杀】使用";
		},
	},
	subSkill: {
		free: {
			charlotte: true,
			popup: false,
			mod: {
				cardUsable() {
					return Infinity;
				},
			},
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},
// 旋尘全场侧：其他角色的【闪】→【无懈】（模式1）或非基本手牌→【闪】（模式2）
xiaobai_xuancheng_o: {
	charlotte: true,
	enable: ["chooseToUse"],
	filter(event, player) {
		const owner = game.findPlayer((current) => current.hasSkill("xiaobai_xuancheng"));
		if (!owner?.isIn()) return false;
		const mode = owner.storage.xiaobai_xuancheng_mode || 0;
		if (mode == 0) return false;
		if (event.skill == "xiaobai_xuancheng_o" || event._skill == "xiaobai_xuancheng_o") return true;
		if (mode == 1) {
			if (event.type != "wuxie") return false;
			return player.countCards("h", (card) => get.name(card, player) == "shan") > 0 && Boolean(event.filterCard?.(get.autoViewAs({ name: "wuxie" }, "unsure"), player, event));
		}
		if (event.type == "respondShan") {
			return player.countCards("h", (card) => get.type(card, player) != "basic") > 0 && Boolean(event.filterCard?.(get.autoViewAs({ name: "shan" }, "unsure"), player, event));
		}
		return false;
	},
	chooseButton: {
		dialog(event, player) {
			const owner = game.findPlayer((current) => current.hasSkill("xiaobai_xuancheng"));
			const mode = owner?.storage.xiaobai_xuancheng_mode;
			const name = mode == 1 ? "wuxie" : "shan";
			return ui.create.dialog(mode == 1 ? "旋尘：将一张【闪】当【无懈可击】使用" : "旋尘：将一张非基本手牌当【闪】使用", [[["basic", "", name]], "vcard"]);
		},
		check(button) {
			return 1;
		},
		backup(links, player) {
			const owner = game.findPlayer((current) => current.hasSkill("xiaobai_xuancheng"));
			const mode = owner?.storage.xiaobai_xuancheng_mode;
			const name = mode == 1 ? "wuxie" : "shan";
			return {
				audio: "xiaobai_xuancheng",
				filterCard(card, player2) {
					if (mode == 1) return get.name(card, player2) == "shan" && get.position(card) == "h";
					return get.type(card, player2) != "basic" && get.position(card) == "h";
				},
				selectCard: 1,
				position: "h",
				viewAs: { name, isCard: true, storage: { xiaobai_xuancheng_o: true } },
				precontent(event, trigger, player) {
					player.logSkill("xiaobai_xuancheng", null, false);
				},
			};
		},
		prompt(links) {
			const owner = game.findPlayer((current) => current.hasSkill("xiaobai_xuancheng"));
			const mode = owner?.storage.xiaobai_xuancheng_mode;
			return mode == 1 ? "旋尘：将一张【闪】当【无懈可击】使用" : "旋尘：将一张非基本手牌当【闪】使用";
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},
// 杀噬：连招技（牌+牌+牌）
xiaobai_shashi: {
	audio: 2,
	mark: true,
	marktext: "噬",
	intro: {
		content(storage, player) {
			const conditions = player.storage.xiaobai_shashi_conditions || ["all", "all", "all"];
			const names = { basic: "基本", trick: "锦囊", equip: "装备", all: "任意" };
			return "当前连招条件：" + conditions.map((t) => names[t] || t).join("+") + "+（进度：" + (player.storage.xiaobai_shashi_progress || 0) + "/3）";
		},
	},
	group: ["xiaobai_shashi_record", "xiaobai_shashi_draw", "xiaobai_shashi_reset"],
	ai: {
		result: {
			player: 1,
		},
	},
	subSkill: {
		// 连招进度跟踪
		record: {
			charlotte: true,
			sub: true,
			trigger: { player: "useCardAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.isIn() && Boolean(event.card);
			},
			content(event, trigger, player) {
				const kind = get.type(trigger.card, player);
				let conditions = player.storage.xiaobai_shashi_conditions || ["all", "all", "all"];
				let progress = player.storage.xiaobai_shashi_progress || 0;
				let cards = player.storage.xiaobai_shashi_cards || [];
				const expected = conditions[progress];
				if (progress >= 3 || (expected != "all" && expected != kind)) {
					progress = 0;
					cards = [];
				}
				progress++;
				cards.push(kind);
				player.storage.xiaobai_shashi_progress = progress;
				player.storage.xiaobai_shashi_cards = cards;
				if (progress == 1) player.storage.xiaobai_shashi_responded = 0;
				player.updateMarks("xiaobai_shashi");
			},
		},
		// 三张用完：摸X张（X=被响应数）并将条件改为这三张牌的类别
		draw: {
			audio: "xiaobai_shashi",
			charlotte: true,
			sub: true,
			name: "杀噬",
			trigger: { player: "useCardAfter" },
			direct: true,
			filter(event, player) {
				return (player.storage.xiaobai_shashi_progress || 0) >= 3 && player.isIn();
			},
			async content(event, trigger, player) {
				const responded = player.storage.xiaobai_shashi_responded || 0;
				if (responded > 0) {
					const go = await player
						.chooseBool("杀噬：是否摸" + get.cnNumber(responded) + "张牌？")
						.set("ai", () => 1)
						.forResult();
					if (go?.bool) {
						player.logSkill("xiaobai_shashi");
						await player.draw(responded);
					}
				}
				const cards = player.storage.xiaobai_shashi_cards || [];
				if (cards.length == 3) {
					player.storage.xiaobai_shashi_conditions = cards.slice(0);
					player.updateMarks("xiaobai_shashi");
					game.log(player, "将〖杀噬〗的连招条件依次改为这三张牌的类别");
				}
				player.storage.xiaobai_shashi_progress = 0;
				player.storage.xiaobai_shashi_cards = [];
				player.storage.xiaobai_shashi_responded = 0;
			},
		},
		// 造成伤害令其他角色进入濒死后：重置
		reset: {
			charlotte: true,
			sub: true,
			trigger: { global: "dyingAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (event.player == player) return false;
				const damage = event.getParent("damage");
				return damage && damage.source == player && player.isIn();
			},
			content(event, trigger, player) {
				player.storage.xiaobai_shashi_conditions = ["all", "all", "all"];
				player.storage.xiaobai_shashi_progress = 0;
				player.storage.xiaobai_shashi_cards = [];
				player.storage.xiaobai_shashi_responded = 0;
				player.updateMarks("xiaobai_shashi");
				game.log(player, "重置了", "#g【杀噬】");
			},
		},
	},
},

// === 嵇绍 ===
xiaobai_xuehan: {
	audio: 2,
	// 一名没有「血扞」牌的角色受到伤害时：置任意张其装备区已有花色的牌于其武将牌旁，伤害-1
	trigger: { global: "damageBegin2" },
	direct: true,
	filter(event, player) {
		if (!player.isIn() || event.num < 1) return false;
		const target = event.player;
		if (!target?.isIn()) return false;
		// 没有「血扞」牌
		if (target.getExpansions("xiaobai_xuehan").length > 0) return false;
		// 其装备区有花色，且嵇绍 he 区有同花色牌
		const suits = new Set(target.getCards("e").map((card) => get.suit(card)));
		if (!suits.size) return false;
		return player.countCards("he", (card) => suits.has(get.suit(card, player))) > 0;
	},
	async cost(event, trigger, player) {
		const target = trigger.player;
		const suits = new Set(target.getCards("e").map((card) => get.suit(card)));
		const res = await player
			.chooseCard("he", `血扞：将任意张与${get.translation(target)}装备区花色相同的牌置于其武将牌旁，令此伤害-1`, [1, player.countCards("he")], (card) => suits.has(get.suit(card, player)))
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.cards?.length) return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { cards: res.cards, target } };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_xuehan");
		const { cards, target } = event.cost_data;
		// 置于其武将牌旁（扩展区 + 血扞 gaintag）
		target.addToExpansion(cards, player, "xiaobai_xuehan");
		player.storage.xiaobai_xuehan_used = true;
		trigger.num--;
	},
	group: ["xiaobai_xuehan_remove"],
	subSkill: {
		// 一名角色使用一种花色的牌后：其可移去所有该花色的血扞牌并摸等量张牌
		remove: {
			audio: "xiaobai_xuehan",
			charlotte: true,
			sub: true,
			name: "血扞",
			trigger: { global: "useCardAfter" },
			direct: true,
			filter(event, player) {
				const target = event.player;
				if (!target?.isIn()) return false;
				const pile = target.getExpansions("xiaobai_xuehan");
				if (!pile.length) return false;
				const suit = get.suit(event.card, target);
				return Boolean(suit) && pile.some((card) => get.suit(card) == suit);
			},
			async content(event, trigger, player) {
				const target = trigger.player;
				const suit = get.suit(trigger.card, target);
				const pile = target.getExpansions("xiaobai_xuehan");
				const remove = pile.filter((card) => get.suit(card) == suit);
				if (!remove.length) return;
				const go = await target
					.chooseBool(`血扞：移去武将牌旁所有【${get.translation(suit)}】血扞牌并摸${get.cnNumber(remove.length)}张牌`)
					.set("ai", () => 1)
					.forResult();
				if (!go?.bool) return;
				player.logSkill("xiaobai_xuehan");
				for (const card of remove) {
					if (target.getExpansions("xiaobai_xuehan").includes(card)) {
						await target.loseToDiscardpile({ cards: [card] });
					}
				}
				await target.draw(remove.length);
			},
		},
	},
},
// 昂然：抵消牌后或失去多张手牌后，手牌仅有/仅缺一种花色 → 展示并摸至全场最大众数多1（至多5），♣再摸1
xiaobai_angran: {
	audio: 2,
	trigger: { global: "eventNeutralizedAfter", player: "loseAfter" },
	direct: true,
	filter(event, player) {
		if (!player.isIn() || player.isKongcheng()) return false;
		// 手牌仅有/仅缺一种花色
		const suits = new Set(player.getCards("h").map((card) => get.suit(card, player)));
		if (suits.size != 1 && suits.size != 3) return false;
		if (event.name == "eventNeutralized") {
			// 你抵消牌后（响应者==player）
			let fromMe = false;
			(function find(evt) {
				for (const child of evt.childEvents || []) {
					if (child.name == "useCard" && child.respondTo && child.from == player) fromMe = true;
					find(child);
				}
			})(event);
			return fromMe;
		}
		// 失去多张手牌后
		return event.player == player && (event.hs || []).length > 1;
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseBool("昂然：你可以展示手牌并摸牌至较场上最大的众数多1")
			.set("ai", () => 1)
			.forResult();
		event.result = res?.bool ? { bool: true } : { bool: false };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_angran");
		const hs = player.getCards("h");
		if (hs.length) await player.showCards(hs);
		// 场上手牌数频率最高的最大众数
		const counts = {};
		game.countPlayer((current) => {
			const n = current.countCards("h");
			counts[n] = (counts[n] || 0) + 1;
		});
		let maxFreq = 0;
		for (const n in counts) maxFreq = Math.max(maxFreq, counts[n]);
		let maxMode = 0;
		for (const n in counts) {
			if (counts[n] == maxFreq) maxMode = Math.max(maxMode, Number(n));
		}
		const num = Math.min(5, Math.max(0, maxMode + 1 - player.countCards("h")));
		if (num > 0) await player.draw(num);
		// 该花色为♣（缺的花色为♣，即手牌有3种且缺梅花）
		const suits = new Set(player.getCards("h").map((card) => get.suit(card, player)));
		const allSuits = ["spade", "heart", "club", "diamond"];
		const missing = allSuits.find((s) => !suits.has(s));
		if (player.isIn() && suits.size == 3 && missing == "club") {
			await player.draw(1);
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},

// === 左思 ===
// 咏史持有：衍生技（左思授予，层数用 countMark）
xiaobai_yongshi_holder: {
	charlotte: true,
	mark: true,
	marktext: "史",
	intro: {
		content(storage, player) {
			const n = player.countMark("xiaobai_yongshi_holder");
			return "持有〖咏史〗×" + n + "：出牌阶段限一次（每层），将一张牌交给不持有〖咏史〗的角色并令其获得一层〖咏史〗，其选择使用（额外结算一次，失去一层）或弃置（再加一层）。每层每阶段限一次。";
		},
	},
	// 咏史传染：出牌阶段，每层限一次
	enable: "phaseUse",
	filter(event, player) {
		return player.countMark("xiaobai_yongshi_holder") > 0 && player.countCards("he") > 0 && game.hasPlayer((current) => current != player && !current.hasSkill("xiaobai_yongshi_holder") && current.isIn());
	},
	filterTarget(card, player, target) {
		return target != player && !target.hasSkill("xiaobai_yongshi_holder") && target.isIn();
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		player.removeMark("xiaobai_yongshi_holder", 1);
		const target = event.targets[0];
		const cardRes = await player
			.chooseCard("he", true, 1, "咏史：选择交给" + get.translation(target) + "的牌")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		const card = cardRes?.cards?.[0];
		if (!card) return;
		await player.give([card], target);
		if (!target.isIn() || get.owner(card) != target) return;
		// 其选择：1.使用此牌且额外结算一次，失去一层；2.弃置此牌，再加一层
		const ctrl = await target
			.chooseControl(["使用此牌（额外结算一次）", "弃置此牌（保留咏史）"])
			.set("prompt", "咏史：选择对" + get.translation(card) + "的处理")
			.set("ai", () => (target.canUse(card, null, true, false) && get.name(card) != "tao" ? 0 : 1))
			.forResult();
		if (ctrl?.control == "使用此牌（额外结算一次）") {
			target.removeMark("xiaobai_yongshi_holder", 1);
			const useRes = await target.chooseUseTarget(card, "咏史：请使用此牌（将额外结算一次）", false).set("addCount", false).forResult();
			if (useRes?.bool && target.isIn()) {
				// 额外结算一次：同一虚拟牌再结算一次
				await target.useCard(get.autoViewAs({ name: get.name(card), nature: get.nature(card) }, []), useRes.targets || [target], "xiaobai_yongshi_holder").set("addCount", false);
			}
		} else if (ctrl?.control) {
			if (get.owner(card) == target) {
				await target.discard([card]);
			}
			target.addMark("xiaobai_yongshi_holder", 1);
		}
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},
// 咏史主技：出牌阶段限一次，将一张牌交给其他角色并令其获得一层咏史
xiaobai_yongshi1: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("he") > 0 && game.hasPlayer((current) => current != player && !current.hasSkill("xiaobai_yongshi_holder") && current.isIn());
	},
	filterTarget(card, player, target) {
		return target != player && !target.hasSkill("xiaobai_yongshi_holder") && target.isIn();
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		const cardRes = await player
			.chooseCard("he", true, 1, "咏史：选择交给" + get.translation(target) + "的牌")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		const card = cardRes?.cards?.[0];
		if (!card) return;
		await player.give([card], target);
		if (!target.isIn() || get.owner(card) != target) return;
		target.addMark("xiaobai_yongshi_holder", 1);
		const ctrl = await target
			.chooseControl(["使用此牌（额外结算一次）", "弃置此牌（保留咏史）"])
			.set("prompt", "咏史：选择对" + get.translation(card) + "的处理")
			.set("ai", () => (target.canUse(card, null, true, false) ? 0 : 1))
			.forResult();
		if (ctrl?.control == "使用此牌（额外结算一次）") {
			target.removeMark("xiaobai_yongshi_holder", 1);
			const useRes = await target.chooseUseTarget(card, "咏史：请使用此牌（将额外结算一次）", false).set("addCount", false).forResult();
			if (useRes?.bool && target.isIn()) {
				await target.useCard(get.autoViewAs({ name: get.name(card), nature: get.nature(card) }, []), useRes.targets || [target], "xiaobai_yongshi1").set("addCount", false);
			}
		} else if (ctrl?.control) {
			if (get.owner(card) == target) {
				await target.discard([card]);
			}
			target.addMark("xiaobai_yongshi_holder", 1);
		}
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},
// 览赋
xiaobai_lanfu: {
	audio: 2,
	// 手牌数不为全场最多：有锦囊牌被弃置后，置牌堆底并摸一张
	trigger: { global: "cardsDiscardAfter" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		// 手牌数不为全场最多（存在手牌数严格更多的角色）
		const my = player.countCards("h");
		if (!game.hasPlayer((current) => current.countCards("h") > my)) return false;
		return (event.cards || []).some((card) => {
			const type = get.type(card, null);
			return (type == "trick" || type == "delay") && get.position(card, true) == "d";
		});
	},
	async cost(event, trigger, player) {
		const cards = (trigger.cards || []).filter((card) => {
			const type = get.type(card, null);
			return (type == "trick" || type == "delay") && get.position(card, true) == "d";
		});
		const res = await player
			.chooseBool("览赋：你可以将" + cards.length + "张被弃置的锦囊置于牌堆底，然后摸一张牌")
			.set("ai", () => 1)
			.forResult();
		event.result = res?.bool ? { bool: true, cost_data: { cards } } : { bool: false };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_lanfu");
		const cards = event.cost_data.cards.filter((card) => get.position(card, true) == "d");
		if (cards.length) {
			game.cardsGotoPile(cards); // 无参 = 牌堆底
		}
		if (player.isIn()) await player.draw(1);
	},
	group: ["xiaobai_lanfu_bottom"],
	subSkill: {
		// 手牌数为全场最多：摸牌改为从牌堆底摸
		bottom: {
			audio: "xiaobai_lanfu",
			charlotte: true,
			sub: true,
			name: "览赋",
			trigger: { player: "drawBegin" },
			forced: true,
			filter(event, player) {
				if ((event.num || 0) <= 0) return false;
				if (event.bottom) return false;
				// 手牌数为全场最多（>= 所有存活角色）
				return game.filterPlayer().every((current) => current.countCards("h") <= player.countCards("h"));
			},
			content(event, trigger, player) {
				trigger.bottom = true;
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// === 赵妪 ===
xiaobai_huihao: {
	audio: 2,
	// 准备阶段：摸1、用1，令其他角色纳降或火杀
	trigger: { player: "phaseZhunbeiBegin" },
	direct: true,
	filter(event, player) {
		return player.isIn();
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseBool("麾号：你可以摸一张牌并使用一张牌，然后令所有其他角色依次纳降或对你使用火【杀】")
			.set("ai", () => 1)
			.forResult();
		event.result = res?.bool ? { bool: true } : { bool: false };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_huihao");
		await player.draw(1);
		if (!player.isIn()) return;
		// 使用一张牌（任意，不计次）
		const useRes = await player
			.chooseToUse({
				prompt: "麾号：你可以使用一张牌",
				filterCard: (card, player2) => lib.filter.cardEnabled(card, player2),
			})
			.set("addCount", false)
			.forResult();
		if (!useRes?.bool) return;
		const usedCard = useRes.card;
		const suit = usedCard ? get.suit(usedCard, player) : null;
		if (!suit) return;
		// 询问是否发动纳降/火杀
		const go = await player
			.chooseBool("麾号：是否令所有其他角色依次选择交给你一张【" + get.translation(suit) + "】牌或对你使用火【杀】？")
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		player.addTempSkill("xiaobai_huihao_effect", "phaseAfter");
		for (const current of game.filterPlayer((current2) => current2 != player)) {
			if (player.isDead()) return;
			if (!current.isIn() || current.isNude()) continue;
			const hasSuit = current.countCards("he", (card) => get.suit(card, current) == suit) > 0;
			const canDiscard = current.countCards("he") >= 2;
			const opts = [];
			if (hasSuit) opts.push("交给" + get.translation(player) + "一张" + get.translation(suit) + "牌");
			if (canDiscard) opts.push("弃置两张花色不同的牌");
			if (!opts.length) continue;
			const ctrl = await current
				.chooseControl(opts)
				.set("prompt", "麾号：请选择一项")
				.set("ai", () => (hasSuit ? 0 : 1))
				.forResult();
			if (!ctrl?.control) continue;
			if (ctrl.control.startsWith("交给")) {
				const give = await current
					.chooseCard("he", true, 1, "麾号：交给" + get.translation(player) + "一张" + get.translation(suit) + "牌", (card) => get.suit(card, current) == suit)
					.forResult();
				if (give?.cards?.length) {
					await current.give(give.cards, player);
					player.addGaintag(give.cards, "xiaobai_huihao");
				}
			} else {
				const dis = await current.chooseToDiscard(2, "he", true).forResult();
				if (dis?.bool && player.isIn()) {
					await current.useCard(get.autoViewAs({ name: "sha", nature: "fire" }, []), [player], "xiaobai_huihao").set("addCount", false);
				}
			}
		}
	},
	group: ["xiaobai_huihao_slash", "xiaobai_huihao_used_holder"],
	subSkill: {
		// 麾号牌当无距离次数限制的【杀】使用（本回合）
		slash: {
			audio: "xiaobai_huihao",
			charlotte: true,
			sub: true,
			name: "麾号",
			enable: ["chooseToUse", "phaseUse"],
			filter(event, player) {
				if (!player.hasSkill("xiaobai_huihao_effect")) return false;
				if (player.countCards("h", (card) => card.hasGaintag?.("xiaobai_huihao")) == 0) return false;
				if (event.skill == "xiaobai_huihao_slash" || event._skill == "xiaobai_huihao_slash") return true;
				return Boolean(event.filterCard?.(get.autoViewAs({ name: "sha" }, "unsure"), player, event));
			},
			filterCard(card) {
				return card.hasGaintag?.("xiaobai_huihao");
			},
			selectCard: 1,
			position: "h",
			viewAs: { name: "sha", isCard: true, storage: { xiaobai_huihao: true } },
			prompt: "麾号：将「麾号」牌当无距离次数限制的【杀】使用",
			check(card) {
				return 6;
			},
			precontent(event, trigger, player) {
				player.logSkill("xiaobai_huihao");
				event.result.addCount = false;
			},
			ai: {
				order: 6,
				result: {
					player: 1,
				},
			},
		},
		used_holder: { charlotte: true, sub: true },
	},
	mod: {
		// 麾号杀无距离限制
		targetInRange(card, player, target) {
			if (card?.storage?.xiaobai_huihao) return true;
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// 威旅：出牌阶段各限一次，三段自封
xiaobai_weilv: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		return !player.hasSkill("xiaobai_weilv1") || !player.hasSkill("xiaobai_weilv2") || !player.hasSkill("xiaobai_weilv3");
	},
	chooseButton: {
		dialog(event, player) {
			const opts = [];
			if (!player.hasSkill("xiaobai_weilv1")) opts.push("弃置一张【杀】，令下一张被使用的【闪】无效");
			if (!player.hasSkill("xiaobai_weilv2")) opts.push("弃置一张【闪】，令下一张被使用的【杀】无效");
			if (!player.hasSkill("xiaobai_weilv3")) opts.push("弃置两张基本牌，令下一张被使用的基本牌或普通锦囊牌无效且本回合结束");
			return ui.create.dialog("威旅：请选择一项", opts.map((text, i) => [text, i + 1]));
		},
		check(button) {
			return 1;
		},
		backup(links, player) {
			const choice = links[0][1];
			return {
				audio: "xiaobai_weilv",
				filterCard(card, player2) {
					if (choice == 1) return get.name(card, player2) == "sha";
					if (choice == 2) return get.name(card, player2) == "jink";
					return get.type(card, player2) == "basic";
				},
				selectCard: choice == 3 ? 2 : 1,
				position: "he",
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_weilv");
					player.addTempSkill("xiaobai_weilv_mark" + choice, "phaseAfter");
					const cards = event.result.cards.slice(0);
					await player.discard(cards);
					await player.draw(cards.length);
					if (choice == 3 && player.isIn()) {
						const phaseEvent = event.getParent("phase");
						if (phaseEvent) {
							phaseEvent.finish();
						}
					}
				},
			};
		},
		prompt(links) {
			const choice = links[0][1];
			if (choice == 1) return "威旅：弃置一张【杀】，令下一张被使用的【闪】无效";
			if (choice == 2) return "威旅：弃置一张【闪】，令下一张被使用的【杀】无效";
			return "威旅：弃置两张基本牌，令下一张被使用的基本牌或普通锦囊牌无效且本回合结束";
		},
	},
	group: ["xiaobai_weilv_block1", "xiaobai_weilv_block2", "xiaobai_weilv_block3"],
	subSkill: {
		block1: {
			charlotte: true,
			sub: true,
			trigger: { player: "useCardBegin" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.hasSkill("xiaobai_weilv_mark1") && get.name(event.card, player) == "jink";
			},
			content(event, trigger, player) {
				player.removeSkill("xiaobai_weilv_mark1");
				trigger.cancel();
				game.log(player, "使用的【闪】无效");
			},
		},
		block2: {
			charlotte: true,
			sub: true,
			trigger: { player: "useCardBegin" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.hasSkill("xiaobai_weilv_mark2") && get.name(event.card, player) == "sha";
			},
			content(event, trigger, player) {
				player.removeSkill("xiaobai_weilv_mark2");
				trigger.cancel();
				game.log(player, "使用的【杀】无效");
			},
		},
		block3: {
			charlotte: true,
			sub: true,
			trigger: { player: "useCardBegin" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (!player.hasSkill("xiaobai_weilv_mark3")) return false;
				const type = get.type(event.card, player);
				return type == "basic" || (type == "trick" && get.type2(event.card, player) == "trick");
			},
			content(event, trigger, player) {
				player.removeSkill("xiaobai_weilv_mark3");
				player.removeSkill("xiaobai_weilv_mark1");
				player.removeSkill("xiaobai_weilv_mark2");
				trigger.cancel();
				game.log(player, "使用的牌无效");
				const phaseEvent = trigger.getParent("phase");
				if (phaseEvent) {
					phaseEvent.finish();
				}
			},
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},






// === 张裕 ===
xiaobai_xiongchen: {
	audio: 2,
	locked: true,
	forced: true,
	// 判定流程改为：依次亮出牌堆顶直到出现【杀】，该杀作为判定牌，获得其余牌；洗牌则分配3点雷电伤害并终止判定
	trigger: { player: "judgeBefore" },
	async content(event, trigger, player) {
		trigger.cancel();
		const collected = [];
		let shuffled = false;
		for (let i = 0; i < 40; i++) {
			if (player.isDead()) return;
			if (ui.cardPile.childNodes.length == 0) {
				shuffled = true;
				break;
			}
			const card = get.cards(1)[0];
			if (get.name(card) == "sha") {
				await player.showCards([card], "凶谶：判定牌");
				game.cardsGotoOrdering([card]);
				break;
			}
			collected.push(card);
		}
		if (collected.length) {
			await player.gain(collected, "gain2");
		}
		if (!shuffled) return;
		player.logSkill("xiaobai_xiongchen");
		let total = 3;
		while (total > 0 && player.isIn()) {
			const num = Math.min(total, 3);
			const res = await player
				.chooseTarget("凶谶：分配" + num + "点雷电伤害给一名角色（还剩" + total + "点）", 1, (card2, player2, targetx) => targetx.isIn())
				.set("ai", (target) => -get.attitude(player, target))
				.forResult();
			const to = res?.targets?.[0];
			if (!to?.isIn()) break;
			const opts = [];
			for (let k = 1; k <= num; k++) opts.push(get.cnNumber(k) + "点");
			const ctrl = await player
				.chooseControl(opts)
				.set("prompt", "凶谶：分配几点雷电伤害")
				.set("ai", () => 0)
				.forResult();
			const n = opts.indexOf(ctrl?.control || "") + 1;
			if (n <= 0) break;
			await to.damage(player, n, "thunder");
			total -= n;
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
xiaobai_yanhuo: {
	audio: 2,
	zhuanhuanji: true,
	mark: true,
	marktext: "☯",
	init(player) {
		if (player.storage.xiaobai_yanhuo == undefined) player.storage.xiaobai_yanhuo = false;
	},
	trigger: { player: "phaseZhunbeiBegin", global: "phaseJieshuBegin" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		const yang = !player.storage.xiaobai_yanhuo;
		if (event.player == player) return yang;
		return !yang;
	},
	async cost(event, trigger, player) {
		if (event.player == player) {
			const res = await player
				.chooseBool("言祸：是否进行一次【闪电】判定？")
				.set("ai", () => 1)
				.forResult();
			event.result = res?.bool ? { bool: true } : { bool: false };
		} else {
			const res = await event.player
				.chooseBool("言祸：是否令" + get.translation(player) + "进行一次【闪电】判定？")
				.set("ai", () => (get.attitude(event.player, player) < 0 ? 1 : 0))
				.forResult();
			event.result = res?.bool ? { bool: true, cost_data: { target: event.player } } : { bool: false };
		}
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_yanhuo");
		const askedBy = event.cost_data?.target;
		const judge = player.judge("shandian", (card) => (get.suit(card) == "spade" && get.number(card) >= 2 && get.number(card) <= 9 ? 3 : -3));
		const result = await judge.forResult();
		if (result.judge > 0) {
			player.storage.xiaobai_yanhuo_dying = false;
			if (askedBy && askedBy.isIn()) {
				const dmgEvent = player.damage(3, "thunder", askedBy);
				await dmgEvent;
			} else {
				await player.damage(3, "thunder");
			}
		}
		// 濒死检测简化：闪电判定命中后下次言祸保留阴阳转换
		if (askedBy && event.cost_data?.target) {
			player.changeZhuanhuanji("xiaobai_yanhuo");
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},



// === 习英习 ===
xiaobai_duanhuo: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => current != player && !current.isKongcheng() && current.isIn());
	},
	filterTarget(card, player, target) {
		return target != player && !target.isKongcheng() && target.isIn();
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		const n = target.countCards("h");
		if (n > 0) {
			const theirCards = target.getCards("h");
			await player.gain(theirCards, target, "giveAuto");
		}
		if (player.isDead() || player.countCards("h") < n) return;
		const giveRes = await player
			.chooseCard("h", true, n, "断祸：请交给" + get.translation(target) + get.cnNumber(n) + "张手牌")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (giveRes?.cards?.length) {
			await player.give(giveRes.cards, target);
		}
		if (!target.isIn() || target.isLinked()) return;
		const go = await target
			.chooseBool("断祸：是否横置你的武将牌？")
			.set("ai", () => 0)
			.forResult();
		if (go?.bool) {
			target.link(true);
		}
	},
	ai: {
		order: 5,
		result: {
			player: 1,
			target: 1,
		},
	},
},
xiaobai_nirao: {
	audio: 2,
	// 每名角色的回合限一次（简化：本回合未发动过）
	trigger: { global: ["loseAfter", "loseAsyncAfter"] },
	direct: true,
	filter(event, player) {
		if (!player.isIn() || player.hasSkill("xiaobai_nirao_used")) return false;
		return lib.skill.xiaobai_nirao.getTargets(event).length > 0;
	},
	getTargets(event) {
		const targets = new Set();
		const check = (from) => {
			if (from?.isIn() && from.isLinked()) targets.add(from);
		};
		if (event.name == "lose") {
			if (event.type != "use" && event.type != "respond") check(event.player);
		} else if (event.name == "loseAsync") {
			game.countPlayer((current) => {
				const l = event.getl?.(current);
				if (l && ((l.hs || []).length + (l.es || []).length) > 0) check(current);
			});
		}
		return [...targets];
	},
	async cost(event, trigger, player) {
		const cands = lib.skill.xiaobai_nirao.getTargets(trigger);
		const res = await player
			.chooseTarget("逆饶：令一名已横置的角色摸两张牌", 1, (card, player2, targetx) => cands.includes(targetx))
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!res?.bool || !res.targets?.length) return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { target: res.targets[0] } };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_nirao");
		player.addTempSkill("xiaobai_nirao_used", "phaseAfter");
		const target = event.cost_data.target;
		await target.draw(2);
		if (target.isIn() && target.countCards("h") > target.maxHp && target.isLinked()) {
			target.link(false);
		}
	},
	subSkill: {
		used: { charlotte: true, sub: true },
	},
	ai: {
		result: {
			player: 1,
		},
	},
},


};