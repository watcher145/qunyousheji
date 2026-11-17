import { lib, game, get, ui, _status } from "noname";
import { getTurnDiscardCards, qunyou_adjustHandTo } from "./helpers.js";


// 预诫：可移出的角色（其他角色；排除当前回合角色；排除「上轮」以此法移出过的）
function xiaobaiYujieTargets(player) {
	const last = player.storage.xiaobai_yujie_last;
	return game.filterPlayer((current) => {
		if (current == player) return false;
		if (current == _status.currentPhase) return false; // 不能把当前回合角色移出
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

// ===== 列合 =====
// 描述（原型 xiaobai/pkg/xiaobai_twelve/skills/liehe.lua:7）：
//   「你失去过牌的回合结束时，可令**你或当前回合角色**执行恰好能使装备区牌数等于对方的一项：
//     1.可以使用一张装备牌；2.收回或移动自己场上一张装备牌。」
// ⇒ 执行者 X 每人各交三项，Y 恒为「对方」：
//     ① 使用一张装备牌（X 装备区 +1）
//     ② 收回自己装备区一张装备牌（X 装备区 -1）
//     ③ 将自己装备区一张装备牌移给对方（X -1、Y +1）
//   只有在执行后 |X装备 - Y装备| == 0 时才成立；原型的 A=B 分支（差 0 时用「替换装备」，
//   装备区张数不变）按描述「恰好能使装备区牌数等于对方」恒成立，但对局面没有意义，故不实现。
//
// 装备区"牌数"按原型 `#player:getCardIds("e")` 计 = 实体装备牌张数（不看栏位上限）。
// 装备区满 ≠ 不能使用：player.canEquip(card, false)（player.js:2095-2125）只要求
// `countEquipableSlot(副类别)` 未被"不可被替换"的装备占满 ⇒ 满装备时照样能换装，+1 张成立。

// X 的装备区可 -1（③ 要求有别人可接收）
function xiaobaiLieheCanLose(X, Y) {
	if (X.countCards("e") < 1) return false;
	return game.hasPlayer((current) => current != X && current != Y && current.isIn());
}

// X 执行 op 之后，装备区张数是否恰好等于 Y
function xiaobaiLieheBalances(op, X, Y) {
	const diff = X.countCards("e") - Y.countCards("e");
	if (op == 1) return diff + 1 == 0;
	if (op == 2) return diff - 1 == 0;
	if (op == 3) return diff - 2 == 0;
	return false;
}

const XIAOBAI_LIEHE_OPS = [1, 2, 3];

// 某个执行者当前可执行、且执行后恰好拉平的项（升序）。空数组 = 此人不能当执行者。
function xiaobaiLieheOps(self, X, Y) {
	const ops = [];
	for (const op of XIAOBAI_LIEHE_OPS) {
		if (op == 1) {
			if (!X.countCards("h", (card) => X.canEquip(card, false))) continue;
		} else if (!xiaobaiLieheCanLose(X, Y)) continue;
		if (xiaobaiLieheBalances(op, X, Y)) ops.push(op);
	}
	return ops;
}

// 合法执行者列表：你（X=self、Y=当前回合角色）与当前回合角色（X=当前回合角色、Y=你），去重。
function xiaobaiLieheExecutors(player, to) {
	const list = [];
	for (const X of [player, to]) {
		if (!X?.isIn() || !X.hasSkill("xiaobai_liehe")) continue;
		if (list.includes(X)) continue;
		if (!lib.xiaobaiLieheOps(player, X, X == player ? to : player).length) continue;
		list.push(X);
	}
	return list;
}

// 执行者 → 可选项（已过滤"做不到"与"做了不拉平"）
function xiaobaiLiehePlan(player, to) {
	const plan = [];
	for (const X of lib.xiaobaiLieheExecutors(player, to)) {
		const ops = lib.xiaobaiLieheOps(player, X, X == player ? to : player);
		if (ops.length) plan.push({ player: X, ops });
	}
	return plan;
}

const XIAOBAI_LIEHE_TEXT = {
	1: (X) => `令${get.translation(X)}使用一张装备牌`,
	2: (X) => `令${get.translation(X)}收回装备区的一张装备牌`,
	3: (X) => `令${get.translation(X)}将装备区的一张装备牌移给对方`,
};

// 选项键与文案互转（chooseButton 的 link 用键，显示用文案）
function xiaobaiLieheKey(X, op) {
	return `${X.playerid}_${op}`;
}
function xiaobaiLieheText(X, op) {
	return XIAOBAI_LIEHE_TEXT[op](X);
}

// 通言：依次收集"包含你在内的任意名角色共三张手牌"——第一张必须出自你的手牌
//（保证"包含你在内"），其余从任意角色（含自己）手牌补足；任一步取消返回 null（整体放弃）。
// 取消判断全部显式用 result.bool（龙智范本同款），choosePlayerCard 不传 forced（可取消）
async function xiaobaiTongyanCollect(player) {
	const mats = [];
	const owners = [];
	const selfRes = await player
		.chooseCard("h", "通言：选择你的一张手牌（三张中的第一张必须出自你）")
		.set("ai", (card) => get.number(card))
		.forResult();
	if (!selfRes?.bool) return null;
	const first = selfRes.cards?.[0];
	if (!first) return null;
	mats.push(first);
	owners.push(player);
	while (mats.length < 3 && player.isIn()) {
		const res = await player
			.chooseTarget("通言：选择一名角色，从其手牌中选择转化牌（还差" + (3 - mats.length) + "张）", 1, (card, player2, targetx) => targetx.countCards("h") > 0)
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
		if (!res?.bool) return null;
		const to = res.targets?.[0];
		if (!to?.isIn()) return null;
		const res2 = await player
			.choosePlayerCard({
				target: to,
				position: "h",
				selectButton: [1, 1],
				prompt: "通言：选择" + get.translation(to) + "的一张手牌",
			})
			.set("ai", (button) => get.value(button.link))
			.forResult();
		if (!res2?.bool) return null;
		const card = res2.cards?.[0] || res2.links?.[0];
		if (!card) return null;
		mats.push(card);
		owners.push(to);
	}
	let maxCard = mats[0];
	let maxOwner = owners[0];
	for (let i = 1; i < mats.length; i++) {
		if (get.number(mats[i]) > get.number(maxCard)) {
			maxCard = mats[i];
			maxOwner = owners[i];
		}
	}
	return { mats, owners, maxOwner };
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

// 挑衅流程（嚣獚版：无攻击范围限制；使用杀、或被弃置的牌里有装备牌，都记「严教」额外数；
//          否则弃置 1+「挑衅」额外数 张）
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
	// 相邻性：每个花色的牌须构成一段连续区间（判定按一行八张的序列进行）
	// done = 已达成相邻的花色（≥2 张才提示；单张花色天然相邻）；all = 是否全部相邻
	const suitInfo = (list) => {
		const bySuit = new Map();
		list.forEach((card, i) => {
			const s = get.suit(card);
			if (!s) return;
			if (!bySuit.has(s)) bySuit.set(s, []);
			bySuit.get(s).push(i);
		});
		const done = [];
		let all = true;
		for (const [suit, idxs] of bySuit) {
			let ok = true;
			for (let k = 1; k < idxs.length; k++) {
				if (idxs[k] != idxs[k - 1] + 1) {
					ok = false;
					break;
				}
			}
			if (ok) {
				if (idxs.length > 1) done.push(suit);
			} else {
				all = false;
			}
		}
		return { done, all };
	};
	const hintText = (list) => {
		const { done } = suitInfo(list);
		return done.length ? done.map((s) => "【" + get.translation(s) + "】").join("") + "已相邻" : "";
	};
	let remain = 4;
	// 交换其中两张：同一对话框内先点一张再点另一张（原生 chooseButton 机制），
	// 自建 fullwidth 对话框 = 一行八张（与相邻判定口径一致）+ 对话内实时相邻提示
	while (remain > 0 && arranged.length > 1 && player.isIn()) {
		const dialog = ui.create.dialog("hidden");
		dialog.classList.add("fullwidth");
		dialog.add("撰域：选择两张牌交换位置（剩余" + remain + "次，取消即结束）");
		const hint = hintText(arranged);
		if (hint) dialog.addText(hint);
		dialog.add([arranged, "card"]);
		const pick = await player
			.chooseButton(dialog, false, [2, 2])
			.set("ai", (button) => get.value(button.link))
			.forResult();
		if (!pick?.bool || !pick.links || pick.links.length < 2) break;
		const i = arranged.indexOf(pick.links[0]);
		const j = arranged.indexOf(pick.links[1]);
		if (i < 0 || j < 0) break;
		[arranged[i], arranged[j]] = [arranged[j], arranged[i]];
		remain--;
	}
	// 相同花色均相邻判定
	const { all: adjacentAll } = suitInfo(arranged);
	if (remain > 0 && adjacentAll) {
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
		// "类别"按基本/锦囊/装备三类：延时锦囊与普通锦囊同属锦囊（get.type2 把 delay 归并为 trick）
		const types = new Set(cards.map((card) => get.type2(card)));
		return types.size >= 3;
	}
	if (num == 4) {
		const suits = new Set(cards.map((card) => get.suit(card)));
		return suits.size >= 4;
	}
	return false;
}

/**
 * 旋尘模式一的可用牌名：**普通锦囊**且**单目标**。
 *
 * Lua（xuancheng.lua:39-46）用 FreeKill 的 `isCommonTrick()` +
 * `getMinTargetNum(player) == 1` + `getMaxTargetNum(player, card) == 1` 判定。
 * 无名杀没有这两个接口，等价判据是 `lib.card[name].selectTarget` 经 `get.select` 归一后的 [min, max]：
 *   · 未写 / 数字 1 / [1,1]  → 单目标，收
 *   · [1,2]（如【铁索连环】）→ 多目标，排除
 *   · -1（全部合法目标）     → 看 filterTarget 允不允许「自己以外」：
 *                             只允许自己（【无中生有】）才算单目标；允许他人（南蛮/万箭/桃园/五谷）排除
 *   · notarget（【无懈可击】）→ 无目标，排除
 * `type` 取 "trick" 是为了把延时锦囊（type "delay"）排除在「普通锦囊」之外。
 *
 * @param {Player} player 施法者（filterTarget 需要它判断「自己以外」是否合法）
 * @returns {string[]} 牌名数组
 */
function xiaobaiXuanchengTrickNames(player) {
	return lib.inpile.filter((name) => {
		const info = lib.card[name];
		if (!info || info.type != "trick" || info.notarget) return false;
		const select = get.select(info.selectTarget);
		if (select[0] == 1 && select[1] == 1) return true;
		if (select[1] != -1 || typeof info.filterTarget != "function") return false;
		// selectTarget 为 -1：只要 filterTarget 还允许「自己以外」的人，就是多目标牌
		const vcard = new lib.element.VCard({ name, isCard: true });
		return !game.hasPlayer((current) => current != player && info.filterTarget(vcard, player, current));
	});
}

async function xiaobaiTiaoxinFlow(player, target) {
	const next = target.chooseToUse("挑衅：对" + get.translation(player) + "使用一张【杀】，否则其弃置你一张牌");
	next.set("filterCard", function (card, player2, event2) {
		if (get.name(card) != "sha") return false;
		return lib.filter.filterCard.apply(this, arguments);
	});
	next.set("filterTarget", (card, player2, target2) => target2 == player);
	// 嚣獚版不受“攻击范围含有你”限制，杀也无距离限制
	next.set("nodistance", true);
	const useRes = await next.forResult();
	if (useRes?.bool) {
		// 其因此使用【杀】：下一次发动「严教」时额外亮出一张牌
		player.storage.xiaobai_xiaohuang_yj = (player.storage.xiaobai_xiaohuang_yj || 0) + 1;
		player.markSkill("xiaobai_xiaohuang_yj");
		return "used";
	}
	// 未使用：弃置其 1 + 「挑衅」额外数 张牌
	// ⚠️ 弃置别人的牌必须用原生 discardPlayerCard（结算= target.discard + discarder 归因挑衅者）；
	//    旧写法 player.discard(cards) 把弃牌事件记成自己、无归因（同神点流程已修的坑）
	const num = 1 + (player.storage.xiaobai_shegeng_tx || 0);
	let equipDiscarded = false;
	if (target.isIn()) {
		const n = Math.min(num, target.countDiscardableCards(player, "he"));
		if (n > 0) {
			const discarded = await player.discardPlayerCard(target, "he", true, n, "挑衅：弃置" + get.translation(target) + get.cnNumber(n) + "张牌").forResult();
			// 其因此**被弃置了装备牌** → 与"使用【杀】"同效（嚣獚：下一次「严教」额外亮一张）
			if (discarded?.cards?.some((card) => get.type(card) == "equip")) equipDiscarded = true;
		}
	}
	if (equipDiscarded) {
		player.storage.xiaobai_xiaohuang_yj = (player.storage.xiaobai_xiaohuang_yj || 0) + 1;
		player.markSkill("xiaobai_xiaohuang_yj");
	}
	player.storage.xiaobai_shegeng_tx = 0;
	player.unmarkSkill("xiaobai_shegeng_tx");
	return "discarded";
}

// 严教流程（复用原生界徐庶分牌逻辑 lib.skill.yanjiao.getResult；亮牌数 = 4 + 「严教」额外数）
async function xiaobaiYanjiaoFlow(player, target) {
	// 消费「严教」额外亮牌数（嚣獚挑衅用杀积累）
	const extra = player.storage.xiaobai_xiaohuang_yj || 0;
	player.storage.xiaobai_xiaohuang_yj = 0;
	player.unmarkSkill("xiaobai_xiaohuang_yj");
	const n = Math.min(4 + extra, 10);
	const cards = get.cards(n);
	await game.cardsGotoOrdering(cards);
	await player.showCards(cards);
	// 原生分牌方案
	const got = lib.skill.yanjiao.getResult(cards.slice(0));
	if (!got.length) {
		// 分不出点数相等的两组：无人获得牌，且本回合手牌上限-1（对齐原生 yanjiao2）
		if (player.isIn()) {
			player.addTempSkill("xiaobai_yanjiao_minus", "phaseAfter");
		}
		return { myNum: 0, toNum: 0 };
	}
	const plan = got[0]; // [组1, 组2, 剩余]
	// 目标选择自己拿哪组（另一组给徐母）
	let index = 0;
	if (plan[0].length && plan[1].length) {
		const ctrl = await target
			.chooseControl()
			.set("choiceList", ["获得" + get.translation(plan[0]), "获得" + get.translation(plan[1])])
			.set("ai", () => (get.value(plan[0], target) >= get.value(plan[1], target) ? 0 : 1))
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

// 舌耕流程（出牌阶段主动发动 / 受到伤害后触发 共用）：
// 选一名目标发动「严教」，若因此获得的牌数**不为较少**（>= 目标获得的张数），
// 记一次「挑衅」额外弃置数（挑衅流程消费）。
async function xiaobaiShegengFlow(player, source) {
	const res = await player
		.chooseTarget("舌耕：对一名" + (source ? "除伤害来源外的" : "") + "其他角色发动「严教」", 1, (card, player2, targetx) => targetx != player && targetx != source && targetx.isIn())
		.set("ai", (target) => get.attitude(player, target))
		.forResult();
	if (!res?.bool || !res.targets?.length) return;
	const result = await lib.xiaobaiYanjiaoFlow(player, res.targets[0]);
	// 若你因此获得的牌数不为较少：下一次发动「挑衅」时额外弃置一张牌
	if (result.myNum >= result.toNum) {
		player.storage.xiaobai_shegeng_tx = (player.storage.xiaobai_shegeng_tx || 0) + 1;
		player.markSkill("xiaobai_shegeng_tx");
	}
}

// minDraw：「本次神点至少要摸几张牌」的约定（来自〖恣逸〗阴态的交牌数）。
//   摸不够就会让目标失去体力，所以 AI 在两处配合：
//   ①翻倍选择：drawCount < minDraw 时优先「摸一张牌」；
//   ②重铸选牌：优先重铸「还差几张才凑够翻倍」的花色，把摸牌数补上去。
// 神点重铸面板：把「第几次 / 弃牌堆各花色张数 / 还差几张翻倍」画成一块带框的信息板。
//
// 为什么能这么写（引擎取证）：
//   · chooseCard 的对话框由 content 自己搭：`event.dialog = ui.create.dialog(prompt)`
//     → `if (Array.isArray(event.promptx)) for (const p of event.promptx) event.dialog.add(p)`
//     （noname/library/element/content.js:7153-7161），promptx 是官方留的「往选牌框里追加内容」的钩子。
//   · dialog.add(字符串) → ui.create.caption(str, content) → `caption.innerHTML = str`
//     （noname/library/element/dialog.js:266-277 + noname/ui/create/index.js:1956-1960）
//     ⇒ 传 HTML 字符串会被当 HTML 渲染，内联样式有效。
//   · 原生同款用法：get.addNewRowList 就是用 innerHTML 拼 `<span style="color: red">`
//     （noname/get/index.js:73-93），说明这是引擎认可的写法。
// 为什么全用内联样式、不注入全局 CSS：这个框是「弹一次就扔」的临时 DOM，
//   内联样式随 dialog 关闭一起消失，不污染别的技能，也不用管扩展卸载/热重载的清理。
//   纯字符串拼接，没有额外 DOM 查询，20 次循环也就 20 次拼串，不会卡。
// ⚠️⚠️ 只能用 <table>/<td>/<span>，绝对不要写 <div>——这是「面板叠在一起」的根因：
//   全局 `div { display: inline-block; position: absolute; transition: all .5s }`
//   （layout/default/layout.css:31-35）。引擎只把这三层救回正常流：
//     `.content > div { position: relative; width: calc(100% - 8px) }`（:1846-1858）
//     `.caption > div { position: relative }`（:1990-1992）
//     `.caption > div > div { position: relative; width: calc(100% - 70px); font-size: 16px }`（:2015-2022）
//   ⇒ 第三层以下的 div 全是 position:absolute，会全部叠在同一个点上；
//     而且绝对定位子元素不参与 flex/grid 布局，写 display:grid 也救不回来。
//     td / span 不受这条全局规则影响，所以排版一律用 table。
// ⚠️ 字号必须写死绝对 px，不能用 em：内容落进 `.caption`，而全局
//   `.caption { font-size: 20px }`（layout/default/layout.css:1973-1977）会把它放大。
//   面板正文 13px / 提示行 12px 是量出来的稳定值。
const SHENDIAN_SUITS = ["heart", "diamond", "club", "spade"];
// 翻倍门槛（实现与面板必须同源，见 AGENTS.md §6 同源原则）：
//   某花色的「本回合弃牌堆总张数」达到 max(2 × 上次翻倍时的张数, 2) 就算一次翻倍，
//   然后门槛继续翻倍：0 张 → 2 张（第 1 次）→ 4 张（第 2 次）→ 8 张（第 3 次）……
//   ⇒ 翻倍**没有**「每种花色只能一次」的限制（用户 2026-11-01 明确：
//     弃牌堆 1 张方片时重铸 1 张触发（1→2），再重铸 2 张仍触发（2→4））。
//   为什么要有 max(…, 2)：原型 Lua（shendian.lua:108/132）的判据是
//   `additional_suit[suit] == origin_suit[suit]`，即总张数正好翻倍；
//   但 0 张的 2 倍仍是 0，那样「发动前没有该花色」就永远不可能触发。
//   用户 2026-11-01 要求「发动前没有该花色、之后重铸了 2 张该花色的牌」要算翻倍，所以 0 张按 2 张兜底。
function xiaobaiShendianNext(count) {
	return Math.max(2 * count, 2);
}
function xiaobaiShendianPanel({ index, total, origin, additional, nextAt, drawCount }) {
	const box = (suit) => {
		const base = origin[suit] || 0;
		const extra = additional[suit] || 0;
		const now = base + extra;
		// 距离下一次翻倍还差几张：门槛逐档翻倍，触发后由 checkDouble 推进 nextAt 重算
		const left = Math.max(1, (nextAt[suit] || xiaobaiShendianNext(base)) - now);
		const isRed = suit == "heart" || suit == "diamond";
		let hint, hintColor, border, emphasize = "";
		if (left == 1) {
			// 只差一张：最值得优先重铸的花色，高亮
			hint = "再重铸 1 张即翻倍";
			hintColor = "#ffd166";
			border = "#ffd16688";
			emphasize = "font-weight:bold;box-shadow:inset 0 0 0 1px #ffd16633;";
		} else {
			hint = `再重铸 ${left} 张即翻倍`;
			hintColor = "#c9c2b6";
			border = "#ffffff1a";
		}
		// 用 <td>/<span> 而不是 <div>：全局 div 规则会让嵌套 div 全部绝对定位并重叠
		return `<td style="border:1px solid ${border};border-radius:5px;padding:3px 7px 4px;background:rgba(255,255,255,.045);vertical-align:top;overflow:hidden;${emphasize}">
			<span style="display:block;white-space:nowrap;overflow:hidden;"><span style="color:${isRed ? "#ff6b6b" : "#dfe6f3"};">${get.translation(suit)} ${get.translation(suit + "2")}</span><span style="color:#efe6d5;"> · 弃牌堆 ${now} 张</span></span>
			<span style="display:block;color:${hintColor};margin-top:1px;font-size:12px;white-space:nowrap;overflow:hidden;">${hint}</span>
		</td>`;
	};
	return `<table style="width:100%;table-layout:fixed;border-collapse:separate;border-spacing:4px;margin:2px auto;background:rgba(0,0,0,.32);border:1px solid #c6b3b355;border-radius:7px;font-size:13px;line-height:1.45;text-align:left;">
		<tr><td colspan="2" style="padding:1px 3px 4px;border-bottom:1px dashed #ffffff26;">
			<span style="color:#e8d7a8;white-space:nowrap;">第 ${index + 1} / 共 ${total} 次</span>
			<span style="float:right;color:#8fd6a0;white-space:nowrap;">已摸 ${drawCount} 张（含重铸）</span>
		</td></tr>
		${[0, 1].map((row) => `<tr>${SHENDIAN_SUITS.slice(row * 2, row * 2 + 2).map(box).join("")}</tr>`).join("")}
	</table>`;
}
async function xiaobaiShendianFlow(player, minDraw = 0) {
	// 「一张牌」的区域口径 = hes（h 手牌区 / e 装备区 / s 特殊区），不是 he。
	// getCards 的 s 分支见 noname/library/element/player.js:5260（特殊区 = 木牛流马那类牌的落点）。
	// 重铸与弃置都由引擎的 lose 处理，对 s 区的牌同样有效（player.recast 不校验区域，player.js:1579-1619）。
	// X 与翻倍基线：发动前【本回合】进入弃牌堆的牌（一次性冻结快照，循环期间不再更新）。
	// ⚠️ 旧实现取 ui.discardPile 全量节点 → X 跟着整局弃牌堆实时走（跨回合累积、越打越大），
	//    与描述「X为发动前本回合弃牌堆的牌数」不符。FreeKill 口径 = HistoryTurn 内 toArea==DiscardPile，
	//    本扩展已有同口径 helper（激昂 qunyou_jiang 同款），直接复用。
	const originCards = getTurnDiscardCards();
	const origin = {};
	for (const card of originCards) {
		const suit = get.suit(card);
		if (suit) origin[suit] = (origin[suit] || 0) + 1;
	}
	const X = Math.min(originCards.length, 20);
	const additional = {}; // 发动期间技能造成的进弃牌堆（重铸牌 + 选项二弃掉的牌），对照 FreeKill additional-turn
	// 每种花色的下一次翻倍门槛（总张数）：从发动时的基线翻倍起算，每触发一次再翻一倍
	const nextAt = {};
	for (const suit of SHENDIAN_SUITS) nextAt[suit] = xiaobaiShendianNext(origin[suit] || 0);
	let drawCount = 0;
	// 翻倍判定：某花色的「本回合弃牌堆总张数」达到 nextAt[suit] → 选择一次，然后把门槛翻倍（可以反复触发）。
	// 用 >= 而不是原型 Lua 的 ==，因为选项二弃牌/一次重铸多张时可能一步跨过门槛（Lua 的 == 会漏判）。
	// 选项二弃掉的牌同样进弃牌堆、同样参与计数（FreeKill 的 AfterCardsMove 监听口径），弃完后需再判定（可能连环翻倍）。
	const checkDouble = async () => {
		let again = true;
		while (again) {
			again = false;
			for (const suit of SHENDIAN_SUITS) {
				const now = (origin[suit] || 0) + (additional[suit] || 0);
				if (now >= nextAt[suit]) {
					// 先推进门槛再结算，避免同一档重复触发
					nextAt[suit] = xiaobaiShendianNext(now);
					if (!player.isIn()) return;
					const opts = ["摸一张牌"];
					if (game.hasPlayer((cur) => cur != player && cur.countCards("hes") > 0)) opts.push("弃置一名角色一张牌");
					const ctrl = await player
						.chooseControl(opts)
						.set("prompt", "神点：" + get.translation(suit) + "花色的牌数翻倍，请选择")
						.set("ai", () => {
							// chooseControl 的 ai 须返回选项文本（非下标）
							// 被〖恣逸〗阴态点名时（minDraw > 0），摸牌数不足目标就要失去体力 ⇒ 先补摸牌
							if (drawCount < minDraw) return "摸一张牌";
							const enemy = game.hasPlayer((cur) => cur != player && get.attitude(player, cur) < 0 && cur.countCards("hes") > 0);
							return opts.includes("弃置一名角色一张牌") && enemy ? "弃置一名角色一张牌" : "摸一张牌";
						})
						.forResult();
					if (ctrl?.control == "摸一张牌") {
						await player.draw(1);
						drawCount++;
					} else if (ctrl?.control) {
						const t = await player
							.chooseTarget("神点：选择弃置其一张牌的角色", 1, (card2, player2, targetx) => targetx != player && targetx.countCards("hes") > 0)
							.set("ai", (target) => -get.attitude(player, target))
							.forResult();
						if (t?.targets?.length) {
							const target = t.targets[0];
							const c = await player
								.choosePlayerCard(target, "hes", true, 1, "神点：弃置" + get.translation(target) + "的一张牌")
								.set("ai", (button) => get.value(button.link))
								.forResult();
							const card = c?.cards?.[0] || c?.links?.[0];
							if (card) {
								// ⚠️ 弃置别人的牌：由【牌主】执行 discard、第二参归因于神点使用者。
								//    旧写法 player.discard([card]) 把弃牌事件的 player 记成自己、无 discarder 归因，
								//    所有依赖 discardAfter 事件归属（event.player=牌主 / event.discarder=弃牌者）的效果全部错乱。
								await target.discard([card], player);
								const suit2 = get.suit(card);
								if (suit2) {
									additional[suit2] = (additional[suit2] || 0) + 1;
									again = true; // 弃掉的牌也进弃牌堆 → 可能触发新的翻倍
								}
							}
						}
					}
				}
			}
		}
	};
	for (let i = 0; i < X; i++) {
		if (!player.isIn() || player.countCards("hes") == 0) break;
		const res = await player
			.chooseCard("hes", true, 1, "神点：请重铸一张牌")
			.set("promptx", [lib.xiaobaiShendianPanel({ index: i, total: X, origin, additional, nextAt, drawCount })])
			.set("ai", (card) => {
				// 被〖恣逸〗阴态点名时，优先重铸「最接近下一次翻倍」的花色：凑够摸牌数才不会掉体力
				const suit = get.suit(card);
				const left = suit ? nextAt[suit] - ((origin[suit] || 0) + (additional[suit] || 0)) : 99;
				const bonus = minDraw > 0 && suit ? Math.max(0, 30 - 10 * left) : 0;
				return bonus + 5 - get.value(card);
			})
			.forResult();
		if (!res?.cards?.length) break;
		await player.recast(res.cards);
		// ★「因〖神点〗摸牌数」包含重铸摸的牌，不只是选项一的摸牌：
		//   原型 shendian.lua:52-54 每次重铸都 `room:recastCard(cards, player, shendian.name)` 之后
		//   紧跟 `room:addPlayerMark(player, "xiaobai__shendian_draw")`；选项一摸牌在 :160-162 同样 +1。
		//   〖恣逸〗ziyi.lua:108 就是拿这个 mark 和「交出牌数」比（`if player:getMark("xiaobai__shendian_draw") < #effect.cards`）。
		//   ⇒ 旧实现只数选项一（最多 4 张），重铸 17 次也只算 0~4，导致交了 4 张就白掉 1 点体力。
		//   引擎侧 `player.recast` 的默认 recastingGain 就是 `player.draw(cards2.length)`（player.js:1608-1612）。
		drawCount += res.cards.length;
		for (const card of res.cards) {
			const suit = get.suit(card);
			if (!suit) continue;
			additional[suit] = (additional[suit] || 0) + 1;
		}
		await checkDouble();
	}
	return drawCount;
}

// 凶谶：亮出一张牌堆顶牌并播放"抛出展示"动画。
// 照原生「高视 clangaoshi」（clan.js:2884-2933，同为"依次亮出牌堆顶的牌直到…"）的逐张亮出写法：
//   get.cards 取牌 → cardsGotoOrdering 进处理区 → $throwordered 抛出 → thrownhighlight 高亮
//   → 中央弹窗提示 + game.delay 停顿 → 关弹窗。
// ⚠️ 原实现只对最后那张【杀】调了 showCards，**其余亮出的牌完全没有展示**，
//    所以玩家看不到"依次亮出"的过程 = 表现为"亮出牌没有动画"。
async function xiaobaiXiongchenReveal(player, card, index) {
	const str = "凶谶：亮出的第" + get.cnNumber(index, true) + "张牌";
	const videoId = lib.status.videoId++;
	await game.cardsGotoOrdering(card);
	game.addVideo("judge1", player, [get.cardInfo(card), str, videoId]);
	game.broadcastAll(
		function (player2, card2, str2, id, cardid) {
			let event2;
			if (game.online) {
				event2 = {};
			} else {
				event2 = _status.event;
			}
			if (game.chess) {
				event2.node = card2.copy("thrown", "center", ui.arena).addTempClass("start");
			} else {
				event2.node = player2.$throwordered(card2.copy(), true);
			}
			if (lib.cardOL) {
				lib.cardOL[cardid] = event2.node;
			}
			event2.node.cardid = cardid;
			event2.node.classList.add("thrownhighlight");
			ui.arena.classList.add("thrownhighlight");
			event2.dialog = ui.create.dialog(str2);
			event2.dialog.classList.add("center");
			event2.dialog.videoId = id;
		},
		player,
		card,
		str,
		videoId,
		get.id()
	);
	game.log(player, "亮出了牌堆顶的", card);
	await game.delay(2);
	game.broadcastAll(function (id) {
		const dialog = get.idDialog(id);
		if (dialog) {
			dialog.close();
		}
		ui.arena.classList.remove("thrownhighlight");
	}, videoId);
	game.addVideo("judge2", null, videoId);
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
	if (!lib.xiaobaiBoyiCan(player, "peach")) return;
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
	if (!lib.xiaobaiBoyiCan(player, "recast")) return;
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
	if (!lib.xiaobaiBoyiCan(player, "put")) return;
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
	/** @type {number | string} */
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
	if (!lib.xiaobaiBoyiCan(player, item)) return;
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

// 长河：取「本次事件中真正落入弃牌堆的牌」。
// ⚠️ 不能写成 `(event.getd ? event.getd() : null) || event.cards || []` —— `getd()` 在
// getlx===false（使用牌走 ui.ordering、装备/移出走的 lose）或 position≠弃牌堆时会返回**空数组**，
// 而空数组是 truthy，`||` 回退**永远不会生效**，于是那批牌被静默漏掉。
function xiaobaiChangheDiscarded(event) {
	const cards = event.getd ? event.getd() : null;
	if (cards && cards.length) return cards;
	return event.cards || [];
}

// 长河：该牌此刻是否应被销毁（已落入弃牌堆、是「白」、且尚未销毁）
function xiaobaiChangheDestroyable(card) {
	return !!(card && card.name == "xiaobai_dabai" && card.storage?.xiaobai_changhe && get.position(card, true) == "d" && !card._selfDestroyed);
}

// ===== 「白」的不变量兜底 =====
// 不变量：**已销毁**（`_selfDestroyed`）的「白」绝不允许再出现在任何区域。
// 为什么需要它：引擎的 gain/lose/cardsDiscard… 都有 `willBeDestroyed` 守卫（已由
// `card.destroyed = (c) => !!c._selfDestroyed` 接住），但「直接落手牌」的路径
// `directgain` / `directgains`（player.js:8126/8175）**完全没有销毁守卫**：
// 只要还有代码攥着这张已销毁牌的引用再 gain 它，牌就会被 `handcards1.prepend` 塞回手牌区；
// 而 `goto`（polyfill.js:78）/`discard`（card.js:927）对 `_selfDestroyed` 一律拒绝移动、
// `selfDestroy` 又是空操作 ⇒ **这张牌永久卡在手牌区**（用户报的 bug）。
// 下面两层兜底把这条不变量钉死：
//   ① 安装 DOM 边界守卫 —— 任何把「已销毁的白」插进 DOM 的尝试一律拦下（并打日志指出调用栈）；
//   ② 扫描摘除 —— 把已经卡在区域里的僵尸牌摘掉（兼容旧局残留 / 兜住守卫装好之前的窗口）。

// ① 安装 DOM 边界守卫（全局装一次）
function xiaobaiInstallDabaiGuard() {
	if (lib.__xiaobaiDabaiGuard) return;
	lib.__xiaobaiDabaiGuard = true;
	const isZombie = (node) => !!node && node.name == "xiaobai_dabai" && node._selfDestroyed;
	// ⚠️ 关键：被插入的可能是**文档片段**！`gain` content 第 3 步就是这么干的
	//   （content.js:10365/10399/10423）：
	//     const frag1 = document.createDocumentFragment();
	//     frag1.appendChild(card);                                  // 牌只是 frag1 的子节点
	//     player.node.handcards1.insertBefore(frag1, firstChild);   // 被插入的节点是 frag1 本身
	//   —— 只检查"被插入的节点"会**完全漏掉**片段里的牌（实测就是这个洞：
	//   牌在 gain 第 2 步的 willBeDestroyed 检查之后、第 3 步插入之前被销毁，于是顺利跟着片段回到手牌）。
	//   所以这里必须递归查片段的子节点，命中就从片段里摘掉。
	const scrub = (node) => {
		if (isZombie(node)) return false;
		if (node && node.nodeType === 11) {
			// 11 = DOCUMENT_FRAGMENT_NODE
			for (const child of Array.from(node.childNodes)) {
				if (!scrub(child)) node.removeChild(child);
			}
		}
		return true;
	};
	// prepend/append 是变参
	for (const method of ["prepend", "append"]) {
		const orig = HTMLDivElement.prototype[method];
		if (typeof orig != "function" || orig.__xiaobaiGuard) continue;
		const wrapped = function (...nodes) {
			const keep = nodes.filter((node) => scrub(node));
			if (!keep.length) return undefined;
			return orig.apply(this, keep);
		};
		wrapped.__xiaobaiGuard = true;
		HTMLDivElement.prototype[method] = wrapped;
	}
	// appendChild/insertBefore 是单节点（首参）
	for (const method of ["appendChild", "insertBefore"]) {
		const orig = HTMLDivElement.prototype[method];
		if (typeof orig != "function" || orig.__xiaobaiGuard) continue;
		const wrapped = function (node) {
			if (!scrub(node)) return node;
			return orig.apply(this, arguments);
		};
		wrapped.__xiaobaiGuard = true;
		HTMLDivElement.prototype[method] = wrapped;
	}
}

// ② 扫描并摘除「已销毁却还待在某个区域」的僵尸「白」，返回摘除数量
// ⚠️ 不能用 `player.getCards()`：它会跳过带 `removing` 类的牌（player.js:5166/5178），
// 而僵尸牌恰好带该类；必须直接扫 DOM。
function xiaobaiSweepDestroyedDabai() {
	const list = [];
	const collect = (node) => {
		for (const card of Array.from(node?.childNodes || [])) {
			if (card.name == "xiaobai_dabai" && card._selfDestroyed) list.push(card);
		}
	};
	collect(ui.discardPile);
	collect(ui.cardPile);
	collect(ui.ordering);
	collect(ui.special);
	for (const current of game.players.concat(game.dead)) {
		const node = current.node;
		if (!node) continue;
		collect(node.handcards1);
		collect(node.handcards2);
		collect(node.equips);
		collect(node.judges);
		collect(node.expansions);
	}
	for (const card of list) {
		if (_status.discarded) _status.discarded.remove(card);
		card.remove();
	}
	return list.length;
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
// ⚠️ 照原生戾断 olsbliduan（onlyOL.js:3553）用 **targetEnabled2**（红线 4.3：加目标统一用它）：
// toself 牌（桃 modTarget=受伤角色 / 酒·无中 modTarget=true）靠 modTarget 放行“追加目标”；
// 闪·无懈（无 filterTarget 也无 modTarget）恒 false 天然被屏蔽。
// 门槛同戾断：allowMultiple!==false、非 multitarget、此牌当前有目标。
function xiaobaiJunjinExtraTargets(event, player) {
	const card = event.card;
	if (!card) return [];
	const info = get.info(card);
	if (!info || info.multitarget || info.allowMultiple === false) return [];
	const targets = event.targets || [];
	if (!targets.length) return [];
	return game.filterPlayer((current) => !targets.includes(current) && lib.filter.targetEnabled2(card, player, current) && lib.filter.targetInRange(card, player, current));
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

// ===== 施贫 AI 辅助 =====
// 拼点规则（content.js:6607）：`num1 > num2` → 发起者(cmpEvt.player)赢；
// num1 = card1(发起者侧)，num2 = card2(对方侧)。
// 「让对我方有利的那一方拿到更大点数」即为正解。

// 枚举一名角色所有「可用来替换」的手牌点数（用于判断他手里有没有足够极端的牌）。
function xiaobaiShipinHandNums(who) {
	if (!who?.isIn?.()) return [];
	return who
		.getCards("h")
		.map((card) => get.number(card, who))
		.filter((num) => typeof num == "number" && !isNaN(num));
}

// target 视角：能否通过换一张手牌，让延时拼点的结果变得「对我方更有利」？
// 两种操作（取收益更大者）：
//   · 替换**队友**的拼点牌 → 用自己点数**最大**的牌，让队友赢（reqNum 要 > 对手牌）
//   · 替换**敌人**的拼点牌 → 用自己点数**最小**的牌，让敌人输（reqNum 要 < 对家牌）
// 返回 { evt, participant, wantBig }（wantBig = 该用最大牌）；无可获益操作时返回 null。
function xiaobaiShipinBestReplace(target, usable) {
	const me = target;
	const nums = xiaobaiShipinHandNums(me);
	if (!nums.length) return null;
	const myMax = Math.max(...nums);
	const myMin = Math.min(...nums);
	let best = null;
	let bestGain = 0;
	for (const evt of usable) {
		const initiator = get.itemtype(evt.player) == "player" ? evt.player : null;
		const other = get.itemtype(evt.target) == "player" ? evt.target : null;
		// 逐一评估「替换这一组的某一方」的收益
		for (const who of [initiator, other]) {
			if (!who || !who.isIn()) continue;
			const att = get.attitude(me, who);
			if (att == 0) continue; // 中立不为他出手
			const isInitiator = who == initiator;
			// 被替换方自己原本的拼点牌点数、以及它对家的拼点牌点数
			const oldNum = get.number(isInitiator ? evt.card1 : evt.card2, who);
			const rivalNum = get.number(isInitiator ? evt.card2 : evt.card1, false);
			const wantBig = att > 0;
			const newNum = wantBig ? myMax : myMin;
			// 收益 = 换牌后相对于「对家」的净优势，减去换牌前原有的净优势（即本次操作带来的增量）
			const afterEdge = wantBig ? newNum - rivalNum : rivalNum - newNum;
			const beforeEdge = wantBig ? oldNum - rivalNum : rivalNum - oldNum;
			const gain = afterEdge - beforeEdge;
			if (gain > bestGain) {
				bestGain = gain;
				best = { evt, participant: who, wantBig };
			}
		}
	}
	return best;
}

// player 视角（技能拥有者）：令 target 选择一项是否有正收益？
// 规则：target 是队友，且他手里存在能真正改变某个「敌我拼点」结果的极端点数牌（增益 > 0）才放行；
// 手牌极少 / 没极端牌 → 不让他选。target 是敌人/中立 → 不主动给选择权。
function xiaobaiShipinCanHelp(target, usable) {
	if (!target?.isIn?.()) return false;
	const nums = xiaobaiShipinHandNums(target);
	// 手牌 ≤ 2 张视为「非常少」：换掉一张往往得不偿失，直接不让选
	if (nums.length <= 2) return false;
	return Boolean(xiaobaiShipinBestReplace(target, usable));
}


// ===== 崔芣 =====
// 霓裳：花色 → 显示符号（info/提示/prompt 共用）
function xiaobaiNichangSuitChar(suit) {
	return { heart: "♥", spade: "♠", club: "♣", diamond: "♦" }[suit] || suit || "";
}

// 霓裳：手牌中的花色列表（去重、按出现顺序），其 length = X = 需要重铸的张数。
// ★ 发动时算一次就定死（重铸过程中手牌增减都不改已定的次数）；
//   mark 角标也用这个口径，保证「角标显示的数」与「实际要重铸的次数」永远同源。
function xiaobaiNichangHandSuits(player) {
	const suits = [];
	for (const card of player.getCards("h")) {
		const suit = get.suit(card, player);
		if (lib.suit.includes(suit) && !suits.includes(suit)) suits.push(suit);
	}
	return suits;
}

// 霓裳：把花色队列 mark 的角标改写为「当前转换项」的花色符号（骤笔同款 broadcastAll 改 innerHTML）
function xiaobaiNichangSyncMark(player) {
	const queue = player.storage.xiaobai_nichang;
	const text = Array.isArray(queue) && queue.length ? xiaobaiNichangSuitChar(queue[0]) : "☯";
	game.broadcastAll((player2, text2) => {
		const mark = player2.marks?.xiaobai_nichang;
		if (mark?.firstChild) mark.firstChild.innerHTML = text2;
	}, player, text);
}

// 霓裳：声明后按花色队列逐张重铸。X = 声明时手牌花色数（只算一次，不随重铸变化——对齐 FreeKill）。
// 每轮：取队列头花色 → 从 hej 选一张该花色牌（可取消）→ 队头移到队尾 → 重铸。
// 返回 false = 玩家取消重铸 / 死亡 / 区域内无牌 / 队列空 → 整个使用作废。
// 注意：调用方收到 false 后置 `result.cancel = true`（保持 bool=true），
// 让引擎 goto(0) 回到用牌询问；若误写 `result.bool = false`，出牌阶段会被直接结束。
async function xiaobaiNichangRecast(player) {
	const suits = xiaobaiNichangHandSuits(player);
	for (let i = 0; i < suits.length; i++) {
		if (player.isDead() || !player.getCards("hej").length) return false;
		const queue = player.storage.xiaobai_nichang;
		if (!Array.isArray(queue) || !queue.length) return false;
		const suit = queue[0];
		const res = await player
			.chooseCard(
				"hej",
				1,
				`霓裳：请重铸一张${xiaobaiNichangSuitChar(suit)}牌（再重铸${suits.length - i}张则视为使用！）`,
				(card, player2) => get.suit(card, player2) == suit
			)
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!res?.cards?.length) return false;
		// 先轮转队列再重铸——对齐 FreeKill（rotate → recastCard）
		queue.push(queue.shift());
		player.updateMarks("xiaobai_nichang");
		xiaobaiNichangSyncMark(player);
		await player.recast(res.cards);
	}
	return true;
}

// ===== 胡氏 =====
// 火宴：from 场上是否有可移至 to 场上的牌（装备→to 对应槽位为空；判定→to 可加该判定牌）
function xiaobaiHuoyanCanMove(from, to) {
	if (from == to || !from.isIn() || !to.isIn()) return false;
	if (from.getCards("e").some((card) => to.canEquip(card))) return true;
	return from.getCards("j").some((card) => to.canAddJudge(card));
}

// 火宴执行体：支付素材——选来源 → 选牌 → 移至你的场上（移动装备牌则本技能失效）。
// 返回 true/false（false = 未支付，调用方应放弃本次发动）。
async function xiaobaiHuoyanPay(player) {
	// 移动评分：装备看「我获得的价值 − 来源损失的价值×态度」；判定牌移到自己身上按其效果（多为负）
	const score = (source, card) => {
		if (get.position(card) == "e") {
			return get.value(card, player) - get.sgn(get.attitude(player, source)) * get.value(card, source) * 0.5;
		}
		return get.effect(player, card, source, player);
	};
	const cands = game.filterPlayer((current) => lib.xiaobaiHuoyanCanMove(current, player));
	if (!cands.length) return false;
	const res = await player
		.chooseTarget(true, "火宴：选择一名角色，将其场上一张牌移至你的场上", (card, me, target) => cands.includes(target))
		.set("ai", (target) => {
			const cards = [...target.getCards("e").filter((c) => player.canEquip(c)), ...target.getCards("j").filter((c) => player.canAddJudge(c))];
			if (!cards.length) return -Infinity;
			return Math.max(...cards.map((c) => score(target, c)));
		})
		.forResult();
	if (!res?.bool || !res.targets?.length) return false;
	const source = res.targets[0];
	const es = source.getCards("e", (c) => player.canEquip(c));
	const js = source.getCards("j", (c) => player.canAddJudge(c));
	// 兜底：来源身上「此刻」已无可移的牌（判定区刚被废除/判定槽被占等），放弃发动而不是崩在 card[0]
	if (es.length + js.length == 0) return false;
	let card;
	if (es.length + js.length == 1) {
		card = es[0] || js[0];
	} else {
		/** @type {any[]} */
		const args = ["火宴：选择要移动的牌"];
		if (es.length) args.push(`<div class="text center">装备区</div>`, [es, "vcard"]);
		if (js.length) args.push(`<div class="text center">判定区</div>`, [js, "vcard"]);
		const res2 = await player
			.chooseButton(args, true)
			.set("ai", (button) => score(source, button.link))
			.forResult();
		if (!res2?.bool || !res2.links?.length) return false;
		card = res2.links[0];
	}
	// 移动（装备→装备区，判定→判定区；与引擎 moveCard 的执行一致）
	const isEquip = get.position(card) == "e";
	if (isEquip) await player.equip(card);
	else await player.addJudge(card, card?.cards);
	game.log(source, "的", card, "被移动给了", player);
	if (isEquip) {
		player.addSkill("xiaobai_huoyan_invalid");
		// 让主技能在技能栏里变灰（disableSkill 的键是禁用方，即载体技能 id）
		player.disableSkill("xiaobai_huoyan_invalid", "xiaobai_huoyan");
		game.log(player, "的", "#g【火宴】", "失效直到失去装备牌");
	}
	return true;
}

// ===== 暨艳 =====
// 改矩：取角色武将牌上的所有"矩"牌（addToExpansion + gaintag 标记）
function xiaobaiGaijuCards(player) {
	return player.getCards("x").filter((card) => card.hasGaintag("xiaobai_gaiju_ju"));
}

// 改矩：点数是否在"矩"之间（严格介于两张矩牌点数之间；矩不足两张视为不在）
function xiaobaiGaijuBetween(player, number) {
	const ju = xiaobaiGaijuCards(player);
	if (ju.length < 2 || typeof number != "number" || number <= 0) return false;
	const nums = ju.map((card) => get.number(card)).sort((a, b) => a - b);
	return number > nums[0] && number < nums[1];
}

// ===== 羊献容 / 蒋子文（本体隐匿机制）=====
// 图存：可废除的装备栏（未被废除的 equip1-5）
function xiaobaiTucunSlots(player) {
	return ["equip1", "equip2", "equip3", "equip4", "equip5"].filter((s) => !player.hasDisabledSlot(s));
}

// 再次隐匿：镜像引擎 init 的暗置变换（文德武备式隐匿，player.js:3417）——
// 角色技能移回 hiddenSkills（引擎 createTrigger/技能栏照常识别）、名字置 unknown、
// 加 unseen/unseen_show 暗置视觉、隐匿体 1/1（rawHp/rawMaxHp 记录真实体力，亮将时由 $showCharacter 还原）。
// 亮将后引擎会自动 removeSkill("g_hidden_ai")，此处对称补回。
//
// ⚠️ 顺序必须是「先 removeSkill，再 hiddenSkills.addArray」：
//    removeSkill 内部会 `player.hiddenSkills.remove(skill2)`（player.js:11469），
//    先 addArray 再 removeSkill 会把刚登记进去的技能立刻摘掉 →
//    下次亮将时 $showCharacter 的 `if (this.hiddenSkills.includes(skills[i]))`（player.js:2715）不成立
//    → **一个技能都不会还原**（羊献容/蒋子文"第二次隐匿解除后失去所有技能"的根因）。
//    扩展内的正确范本：欧陆风云 Europa_suodi.yinni(skill.js:37945) / Europa_yinsi.yinni(:50175) /
//    makeHidden(:56156)，三处都是先 for(...) removeSkill 再 hiddenSkills.addArray。
function xiaobaiEnterHidden(player) {
	const info = lib.character[player.name1];
	if (!info || !Array.isArray(info.skills)) return;
	const skills = info.skills.slice();
	// ① 先摘掉当前身上的技能（removeSkill 会顺带把同名项从 hiddenSkills 里删掉）
	for (const s of skills) player.removeSkill(s);
	// ② 再登记进 hiddenSkills —— 亮将时引擎据此把它们 addSkill 回来
	if (!player.hiddenSkills) player.hiddenSkills = [];
	player.hiddenSkills.addArray(skills);
	player.addSkill("g_hidden_ai");
	game.broadcastAll((p) => {
		p.name = "unknown";
		p.sex = "male";
		p.classList.add("unseen");
		if (get.mode() != "guozhan") p.classList.add("unseen_show");
		// 隐匿体：隐藏体力条（player.isDamaged 也会因 nohp 判为未受伤），对齐引擎 init 与欧陆风云写法
		p.storage.nohp = true;
		p.storage.rawHp = p.hp;
		p.storage.rawMaxHp = p.maxHp;
		p.hp = 1;
		p.maxHp = 1;
		if (p.node?.hp) p.node.hp.hide();
		// "unknown" 的竖排座位名（引擎 $init player.js:3555 同款）
		if (!p.node.name_seat && !_status.video) {
			p.node.name_seat = ui.create.div(".name.name_seat", get.verticalStr(get.translation(p.name)), p);
			p.node.name_seat.dataset.nature = get.groupnature(p.group);
		}
		p.update();
	}, player);
}

// 图存：废除一个装备栏并再次隐匿（含"无法被响应"状态的清空）
async function xiaobaiTucunHide(player) {
	player.storage.xiaobai_tucun_working = true;
	try {
		const slots = lib.xiaobaiTucunSlots(player);
		if (slots.length) {
			const texts = slots.map((s) => get.translation(s));
			const res = await player
				.chooseControl(texts)
				.set("prompt", "图存：废除一个装备栏")
				.set("slotList", slots)
				.set("ai", () => {
					const evt = get.event();
					const me = evt.player;
					let best = evt.slotList[0];
					let bestScore = -Infinity;
					for (const s of evt.slotList) {
						// 优先废除没有装备牌的栏位
						const hasCard = me.getCards("e").some((c) => get.subtypes(c).includes(s));
						const score = hasCard ? -5 : 5;
						if (score > bestScore) {
							bestScore = score;
							best = s;
						}
					}
					return get.translation(best);
				})
				.forResult();
			const idx = texts.indexOf(res?.control);
			if (idx >= 0) await player.disableEquip(slots[idx]);
		}
		// 隐匿即清空"无法被响应"状态（对齐 FreeKill 隐匿时清 @@ 标记）
		player.storage.xiaobai_tucun_unresponsive = false;
		lib.xiaobaiEnterHidden(player);
		game.log(player, "进入了隐匿状态");
	} finally {
		player.storage.xiaobai_tucun_working = false;
	}
}

// 幸乱：与 target 依次执行一项（幸乱自身触发与图存登场共用）
async function xiaobaiXingluanFlow(player, target) {
	const choice = await player
		.chooseControl("选项一", "选项二")
		.set("choiceList", ["视为对对方使用【杀】或【过河拆桥】", "各重铸两张牌，你获得其重铸的非装备牌，其获得你的装备牌"])
		.set("prompt", `幸乱：选择与${get.translation(target)}依次执行的一项`)
		.set("targetx", target)
		.set("ai", () => {
			const evt = get.event();
			return get.attitude(evt.player, evt.targetx) < 0 ? "选项一" : "选项二";
		})
		.forResult();
	if (!choice?.control) return;
	if (choice.control == "选项一") {
		// 依次（我先、其後）视为对对方使用【杀】或【过河拆桥】
		for (const pair of [
			[player, target],
			[target, player],
		]) {
			const from = pair[0];
			const dest = pair[1];
			if (from.dead || dest.dead || !from.isIn() || !dest.isIn()) break;
			const names = [];
			for (const name of ["sha", "guohe"]) {
				// 幸乱的【杀】不受距离限制：canUse 第 3 参传 false 跳过 targetInRange
				// （引擎自己的 chooseUseTarget 处理 nodistance 时也是这么传的，content.js:2190）
				if (from.canUse(get.autoViewAs({ name: name, isCard: true }, []), dest, false)) names.push(name);
			}
			if (!names.length) continue;
			const picks = names.map((name) => ({ name: name, text: "【" + get.translation(name) + "】" }));
			const res = await from
				.chooseControl(picks.map((p) => p.text))
				.set("prompt", `幸乱：选择视为对${get.translation(dest)}使用的牌`)
				.set("pickList", picks)
				.set("ai", () => {
					const evt = get.event();
					let best = evt.pickList[0];
					let bestEff = -Infinity;
					for (const p of evt.pickList) {
						const eff = get.effect(evt.targetx2, { name: p.name, isCard: true }, evt.player, evt.player);
						if (eff > bestEff) {
							bestEff = eff;
							best = p;
						}
					}
					return best.text;
				})
				.set("targetx2", dest)
				.forResult();
			const chosen = picks.find((p) => p.text == res?.control);
			if (chosen) await from.useCard(get.autoViewAs({ name: chosen.name, isCard: true }, []), [dest]);
		}
	} else {
		// 各重铸两张牌，然后交叉换取对方的重铸牌
		let mine = [];
		let theirs = [];
		if (player.isIn() && player.countCards("he") >= 2) {
			const res = await player
				.chooseCard("he", 2, true, "幸乱：重铸两张牌")
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (res?.cards?.length == 2) mine = res.cards.slice();
			if (mine.length) await player.recast(mine);
		}
		if (target.isIn() && target.countCards("he") >= 2) {
			const res = await target
				.chooseCard("he", 2, true, "幸乱：重铸两张牌")
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (res?.cards?.length == 2) theirs = res.cards.slice();
			if (theirs.length) await target.recast(theirs);
		}
		// ⚠️ 局部变量不能叫 get —— 会遮蔽引擎全局 get，初始值表达式里再引用它就直接
		//    ReferenceError: Cannot access 'get' before initialization（TDZ），
		//    又被引擎的 ignore_error 静默吞掉 → 表现为「重铸完了但交换没发生」
		if (player.isIn()) {
			const gainList = theirs.filter((card) => get.type(card) != "equip" && get.position(card) == "d");
			if (gainList.length) await player.gain(gainList, "gain2");
		}
		if (target.isIn()) {
			const gainList = mine.filter((card) => get.type(card) == "equip" && get.position(card) == "d");
			if (gainList.length) await target.gain(gainList, "gain2");
		}
	}
}

// ===== 蒋子文 =====
// 司酆的「一号位」：座位号机制下即座位 1。座位号由引擎在 **phaseLoop 开头**给全员补（1..N，
// content.js:3255-3257：`while (current.getSeatNum() === 0) current.setSeatNum(num)`），
// 所以回合内的时机（roundStart / phaseBefore 等）一定查得到；补号之前（开局极早期）才需要退化。
function xiaobaiFirstSeatPlayer() {
	const seated = game.findPlayer((c) => c.getSeatNum() == 1 && c.isIn());
	if (seated) return seated;
	return game.players.find((c) => c.isIn()) || null;
}
// 额定回合记录：[[归属角色, 第几次登场的显灾效果], ...]
// 归属存**角色对象**而不是座位号：座位号会被换座（game/index.js:7099-7102）和中途加入
// （game/index.js:10118-10127 起算）改动，角色对象引用不受影响，也不依赖"补号是否已发生"。
function xiaobaiXianzaiRecord(player) {
	if (!Array.isArray(player.storage.xiaobai_xianzai_records)) player.storage.xiaobai_xianzai_records = [];
	return player.storage.xiaobai_xianzai_records;
}
// 司酆「额定回合」的座次判定（照原生 封土 lib.skill.jdfengtu.check，
// character/offline/skill/offline_jiudin.js:2535-2543）：把**存活 + 已死亡**全员按 dataset.position
// 排序，player 恰好排在 source 的下一个（含最后一位 → 第一位 的环回）即为命中。
// ⚠️ 必须并入 game.dead：额定回合属于「座次」而不是「人」，归属者死后该座次依然每轮轮转一次
// （phaseLoop 的 findNext 也是 players.concat(dead) 排序推进，content.js:3290-3299）。
function xiaobaiSifengSeatList() {
	return game.players
		.slice()
		.concat(game.dead)
		.sort((a, b) => parseInt(a.dataset.position) - parseInt(b.dataset.position));
}
function xiaobaiSifengCheck(source, player) {
	if (!source || !player) return false;
	const players = xiaobaiSifengSeatList();
	const num = players.indexOf(source);
	const num2 = players.indexOf(player);
	if (num < 0 || num2 < 0) return false;
	return num2 - num == 1 || (num == players.length - 1 && num2 == 0);
}
// 司酆：额定回合记录里「归属者活着、且这个回合就是他本人的回合」的那一条 [归属角色, count]。
// 归属者已死时这里恒为 null —— 那种情形不在 hijack 里按座次兜底，而是由 assign 分配（见下）。
function xiaobaiSifengRecord(holder, actor) {
	const records = holder?.storage?.xiaobai_xianzai_records;
	if (!Array.isArray(records) || !actor) return null;
	return records.find((rec) => rec[0] && rec[0].isIn() && rec[0] === actor) || null;
}
// 司酆：当前这个回合的**活着**的额定回合归属者（无命中时 null）。
// ⚠️ 绝不能再按座次兜底：那样死者座次的上一位（比如二号位死了，那一号位）自己回合开始前也会被弹面板。
function xiaobaiSifengOwner(holder, actor) {
	return xiaobaiSifengRecord(holder, actor)?.[0] || null;
}
// 司酆：source（刚结束回合的那位）**之后那个座次**上「已真正死亡」的额定回合归属者（无命中时 null）。
// ⚠️ 「真正死亡」= 不在 game.players 里；只判 isIn() === false 不够：只是离场/被移除的人，
//    phaseLoop 的座位顺序里依然会排他的常规回合，按座次分配会无限自我复制。
function xiaobaiSifengDeadOwner(holder, source) {
	const records = holder?.storage?.xiaobai_xianzai_records;
	if (!Array.isArray(records) || !source) return null;
	const rec = records.find((rec2) => {
		const owner = rec2[0];
		if (!owner || owner.isIn() || game.players.includes(owner)) return false;
		return xiaobaiSifengCheck(source, owner);
	});
	return rec?.[0] || null;
}
// 司酆：某条记录的**第几次显灾效果**（按归属角色直接取，不经过「当前是不是他的回合」判定）
function xiaobaiSifengCount(holder, owner) {
	const records = holder?.storage?.xiaobai_xianzai_records;
	if (!Array.isArray(records)) return 0;
	return records.find((rec) => rec[0] === owner)?.[1] || 0;
}
// 司酆：把「归属 owner 的那条额定回合」的〖显灾〗询问与效果**逐条**结算给 `to`。
//   · holder = 存着额定回合记录的人（蒋子文本人，〖显灾〗就挂在他身上）；
//   · actor  = 发动〖显灾〗的一方（蒋子文活着时是他本人，他已死亡时是一号位）；
//   · to     = 这条额定回合**由谁执行**（归属者活着时就是他本人；归属者已死时是 assign 选中的角色）。
// ⚠️ 必须 `.filter` 逐条（不能 `.find` 只取第一条）：同一个回合里可能登场过多次（第 1 次 + 第 3 次），
//    每条各自对应不同效果（原来用 find 只跑第一条，用户实测「第三次的效果没执行」）。
async function xiaobaiSifengResolveRecords(holder, actor, to, owner) {
	if (!to?.isIn() || !owner) return false;
	const recs = (holder?.storage?.xiaobai_xianzai_records || []).filter((r) => r[0] === owner);
	if (!recs.length) return false;
	// 面板是给"执行这个回合的人"看的：用持有者的实际名字，别用「你」（对他而言「你」＝自己）
	const actorName = get.translation(actor);
	for (const [i, rec] of recs.entries()) {
		if (!to.isIn()) break; // 前一条效果可能已令其离场，剩下的不再执行
		const num = rec[1];
		// 描述「令当前回合角色选择一项」——字面两项（交给一张牌／由「你」发动对应〖显灾〗效果）。
		// chooseControl 用数组参数（小按钮）时引擎不会自动补取消 → 天然强制选择 ✓
		// 效果名直接读该额定回合标记的标题（与标记浮窗同源，不依赖 lib.translate 的合并顺序）
		const effectName = lib.skill["xiaobai_xianzai_effect" + num]?.intro?.name || "对应效果";
		const canGive = to != actor && to.countCards("he") > 0;
		if (canGive) {
			const controls = [`交给${actorName}一张牌`, `${actorName}对你发动〖显灾〗的「${effectName}」`];
			const res = await to
				.chooseControl(controls)
				.set("prompt", `司酆：请选择一项（${actorName}的额定回合${recs.length > 1 ? ` ${i + 1}/${recs.length}` : ""}）`)
				// 交一张牌 = 固定亏 1 张（可自选最差的）；接受效果 = 按该效果对「to」的实际好坏判断：
				//   num1 摸两张牌+一张视为【毒】 → 净赚牌，接受
				//   num2 被重复横置并视为【火攻】 → 等于挨伤害，交牌规避
				//   num3 手牌摸至四张并与当前回合角色交换 → 手牌不足四张赚；对敌方还可能被换走好牌
				.set("ai", () => {
					const me = get.player();
					if (num == 1) return 1;
					if (num == 2) return 0;
					if (num == 3) {
						if (get.attitude(me, actor) < 0) return 0;
						return me.countCards("h") < 4 ? 1 : 0;
					}
					return 0;
				})
				.forResult();
			if (res?.control == controls[0]) {
				const give = await to
					.chooseCard("he", 1, true, `司酆：交给${get.translation(actor)}一张牌`)
					.set("ai", (card) => 6 - get.value(card))
					.forResult();
				if (give?.bool && give.cards?.length) {
					await to.give(give.cards, actor);
					continue; // 交了牌只免掉「这一条」额定回合的效果，继续处理下一条
				}
			}
		}
		if (num == 1) await lib.xiaobaiXianzaiEffect1(to);
		else if (num == 2) await lib.xiaobaiXianzaiEffect2(actor, to);
		else await lib.xiaobaiXianzaiEffect3(actor, to);
	}
	return true;
}
// 司酆：把**额外回合**插进队列 —— 接收者 `to` 就是执行这个回合的人
// （insertPhase 里 `next.player = this`，player.js:5547-5570：与"谁在调用"无关，`this` 就是回合角色，
//  所以蒋子文/当前回合者可以在**死者的座次**上直接把回合交给别人）。
// 照原生 封土 jdfengtu_phase（offline_jiudin.js:2555-2558）删掉 skill 标记，让 lib.onround 的
// 幂等写法认出「这是插入的回合，不算新一轮」。
function xiaobaiSifengInsertPhase(to) {
	const next = to.insertPhase();
	delete next.skill;
	return next;
}

// ===== 蒋子文·死亡形态（〖司酆〗deadform，真死幽灵）的两个显示常量 =====
// 死亡形态的显示名（用户后续定稿，改这里即可）：
//   · 死亡照常结算（原生死亡特性全包：灰化头像、藏血条、不参与游戏），deadform 只在死亡链上换皮；
//   · 只覆盖**显示层** —— `player.name` + `player.node.name`，**绝不动 name1/name2/player.skin.name**
//     （历史上改写 name1 引发过连锁问题）；
//   · 空字符串 = 不改名字（血条由原生死亡结算隐藏，无需手动处理）。
const XIAOBAI_JIANGZIWEN_DEAD_NAME = "秦广王";
// 死亡形态的立绘 id：留空 = 不换立绘；填入 id 后把图片放到
// extension/群友设计/image/character/<id>.jpg 即可生效（路径写法与 character/patchAssets.js 完全一致）。
const XIAOBAI_JIANGZIWEN_DEAD_IMG = "xiaobai_jiangziwen_dead";

// 显灾效果一：to 摸两张牌，然后明置一张未明置的手牌（视为【毒】，毒化由全局技 xiaobai_xianzai_du 的 mod 生效）
async function xiaobaiXianzaiEffect1(to) {
	await to.draw(2);
	if (!to.isIn()) return;
	const hidden = to.getCards("h", (card) => !get.is.shownCard(card));
	if (!hidden.length) return;
	const res = await to
		.chooseCard("h", 1, true, "显灾：你须明置一张手牌，视为【毒】", (card) => !get.is.shownCard(card))
		.set("ai", (card) => -get.value(card))
		.forResult();
	if (!res?.cards?.length) return;
	const card = res.cards[0];
	card.storage.xiaobai_xianzai_du = true;
	await to.addShownCards([card], "visible_xiaobai_xianzai");
	game.log(card, "被明置，视为", "#g【毒】");
}

// 显灾效果二：横置并视为对 to 使用【火攻】，直到未造成伤害。
// fixedTo 为空 = 每轮由 actor 自行选择目标（显灾登场）；否则固定目标（司酆劫持）
async function xiaobaiXianzaiEffect2(actor, fixedTo) {
	while (actor.isIn()) {
		let to = fixedTo;
		if (!to) {
			const res = await actor
				.chooseTarget(true, "显灾：横置一名角色，视为对其使用【火攻】", (card, me, target) => target.isIn())
				.set("ai", (target) => -get.attitude(get.player(), target))
				.forResult();
			if (!res?.bool || !res.targets?.length) break;
			to = res.targets[0];
		}
		if (!to.isIn()) break;
		if (!to.isLinked()) await to.link();
		const hpBefore = to.hp;
		await actor.useCard(get.autoViewAs({ name: "huogong", isCard: true }, []), [to]);
		if (to.hp >= hpBefore || to.dead || actor.dead) break;
	}
}

// 显灾效果三：actor 将手牌摸至四张，然后与 to 交换手牌
async function xiaobaiXianzaiEffect3(actor, to) {
	const num = 4 - actor.countCards("h");
	if (num > 0) await actor.draw(num);
	if (actor.isIn() && to.isIn() && actor != to) await actor.swapHandcards(to);
}

// content 在“全局化”编译环境下只能访问 lib/game/get/ui/_status，故把 content 内用到的 helper 挂到 lib 上
lib.xiaobaiDelayCompares = xiaobaiDelayCompares;
lib.xiaobaiShipinSyncMark = xiaobaiShipinSyncMark;
lib.xiaobaiShipinHandNums = xiaobaiShipinHandNums;
lib.xiaobaiShipinBestReplace = xiaobaiShipinBestReplace;
lib.xiaobaiShipinCanHelp = xiaobaiShipinCanHelp;
lib.xiaobaiChangheNames = xiaobaiChangheNames;
lib.xiaobaiChangheGeneralName = xiaobaiChangheGeneralName;
lib.xiaobaiCetuPlay = xiaobaiCetuPlay;
lib.xiaobaiTiaoxinFlow = xiaobaiTiaoxinFlow;
lib.xiaobaiYanjiaoFlow = xiaobaiYanjiaoFlow;
lib.xiaobaiShegengFlow = xiaobaiShegengFlow;
lib.xiaobaiZhuanfengFlow = xiaobaiZhuanfengFlow;
lib.xiaobaiShendianFlow = xiaobaiShendianFlow;
lib.xiaobaiShendianPanel = xiaobaiShendianPanel;
lib.xiaobaiXiongchenReveal = xiaobaiXiongchenReveal;

// 言祸：转换技的**动态描述** —— 把当前态那一项标蓝（`<span class='bluetext'>`）。
// 这是普通转换技的常用做法，与 mark 的 ☯ 旋转互补：一眼看出当前处在阳还是阴。
// 引擎读取点（签名统一为 `(player, skill) => string`）：
//   · `get/index.js:3852-3853` —— 取技能描述时优先用 dynamicTranslate
//   · `content.js:3610-3611`   —— 询问面板的 prompt2
//   · `ui/click/index.js:2968-2969` —— 技能浮窗
// 原生范例：`clandongxu` 等（clan.js:7940-7985，用 `<span class='bluetext'>` / `firetext` 高亮当前项）。
// ★ 因为 storage 在"删去转换技标签"（封印）后**不再变化**，所以封印后当前项**依然标蓝** ✓
//   （且描述里"转换技，"前缀照旧保留 —— 与"保留转换技显示形式"的要求一致）
lib.dynamicTranslate ??= {};
// 恣逸（同样是转换技，一视同仁 —— 描述里当前态那一项也标蓝）
lib.dynamicTranslate.xiaobai_ziyi = function (player, skill) {
	const bool = player.storage[skill]; // true = 阴
	let yang = "你可以视为使用【酒】",
		yin = "其他角色的出牌阶段，其可交给你至少一张牌，并令你发动〖神点〗，然后若你因〖神点〗摸牌数少于其交出牌数，你失去1点体力";
	if (bool) {
		yin = `<span class='bluetext'>${yin}</span>`;
	} else {
		yang = `<span class='bluetext'>${yang}</span>`;
	}
	return `转换技，阳：${yang}；阴：${yin}。`;
};
lib.dynamicTranslate.xiaobai_yanhuo = function (player, skill) {
	const bool = player.storage[skill]; // true = 阴
	let yang = "准备阶段，你可以进行一次【闪电】判定",
		yin = "其他角色的结束阶段，其可以令你执行阳项，若你因此进入濒死状态，删去〖言祸〗转换技标签";
	if (bool) {
		yin = `<span class='bluetext'>${yin}</span>`;
	} else {
		yang = `<span class='bluetext'>${yang}</span>`;
	}
	return `转换技，阳：${yang}；阴：${yin}。`;
};
lib.xiaobaiZhanweiFlow = xiaobaiZhanweiFlow;
lib.xiaobaiZhuanyuFlow = xiaobaiZhuanyuFlow;
lib.xiaobaiKenyanMatch = xiaobaiKenyanMatch;
lib.xiaobaiDiefengCan = xiaobaiDiefengCan;
lib.xiaobaiXuanchengTrickNames = xiaobaiXuanchengTrickNames;
lib.xiaobaiBoyiDo = xiaobaiBoyiDo;
lib.xiaobaiJiudianUsedNames = xiaobaiJiudianUsedNames;
lib.xiaobaiShilangDestroyed = xiaobaiShilangDestroyed;
lib.xiaobaiChangheDiscarded = xiaobaiChangheDiscarded;
lib.xiaobaiChangheDestroyable = xiaobaiChangheDestroyable;
// 「白」的不变量兜底（常驻）：DOM 边界守卫 + 扫描摘除
lib.xiaobaiInstallDabaiGuard = xiaobaiInstallDabaiGuard;
lib.xiaobaiSweepDestroyedDabai = xiaobaiSweepDestroyedDabai;
xiaobaiInstallDabaiGuard();
lib.xiaobaiShilangGroups = xiaobaiShilangGroups;
lib.xiaobaiShilangVanished = xiaobaiShilangVanished;
lib.xiaobaiShilangUpdate = xiaobaiShilangUpdate;
lib.xiaobaiShilangRefresh = xiaobaiShilangRefresh;
lib.xiaobaiYujieTargets = xiaobaiYujieTargets;
lib.xiaobaiYujieSuits = xiaobaiYujieSuits;
lib.xiaobaiLieheOps = xiaobaiLieheOps;
lib.xiaobaiLieheExecutors = xiaobaiLieheExecutors;
lib.xiaobaiLiehePlan = xiaobaiLiehePlan;
lib.xiaobaiLieheKey = xiaobaiLieheKey;
lib.xiaobaiLieheText = xiaobaiLieheText;
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
lib.xiaobaiNichangSuitChar = xiaobaiNichangSuitChar;
lib.xiaobaiNichangHandSuits = xiaobaiNichangHandSuits;
lib.xiaobaiNichangSyncMark = xiaobaiNichangSyncMark;
lib.xiaobaiNichangRecast = xiaobaiNichangRecast;
lib.xiaobaiHuoyanCanMove = xiaobaiHuoyanCanMove;
lib.xiaobaiHuoyanPay = xiaobaiHuoyanPay;
lib.xiaobaiGaijuCards = xiaobaiGaijuCards;
lib.xiaobaiGaijuBetween = xiaobaiGaijuBetween;
lib.xiaobaiTucunSlots = xiaobaiTucunSlots;
lib.xiaobaiEnterHidden = xiaobaiEnterHidden;
lib.xiaobaiTucunHide = xiaobaiTucunHide;
lib.xiaobaiXingluanFlow = xiaobaiXingluanFlow;
lib.xiaobaiXianzaiEffect1 = xiaobaiXianzaiEffect1;
lib.xiaobaiXianzaiEffect2 = xiaobaiXianzaiEffect2;
lib.xiaobaiXianzaiEffect3 = xiaobaiXianzaiEffect3;
lib.xiaobaiFirstSeatPlayer = xiaobaiFirstSeatPlayer;
lib.xiaobaiXianzaiRecord = xiaobaiXianzaiRecord;
lib.xiaobaiSifengSeatList = xiaobaiSifengSeatList;
lib.xiaobaiSifengCheck = xiaobaiSifengCheck;
lib.xiaobaiSifengRecord = xiaobaiSifengRecord;
lib.xiaobaiSifengOwner = xiaobaiSifengOwner;
lib.xiaobaiSifengCount = xiaobaiSifengCount;
lib.xiaobaiSifengDeadOwner = xiaobaiSifengDeadOwner;
lib.xiaobaiSifengResolveRecords = xiaobaiSifengResolveRecords;
lib.xiaobaiSifengInsertPhase = xiaobaiSifengInsertPhase;

// ===== 墨撰：4 项多态转换技 + 印牌 =====
// 状态：player.storage.xiaobai_mozhuan（0-3，依次对应①②③④），标记用 intro.markcount 显示「当前第几项」；
// 每次发动（使用或打出）后前进至下一项（④后回到①）。写法对齐同项目 4 态转换技「挑龙」qunyou_tiaolong（sanshe.js:10560）。
// 材料：黑色牌或非基本牌（等价于排除红色基本牌）；材料数 = 跨越的项数 X + 1，X = |目标项 - 当前项|（绝对差，不环绕）。
// ⚠️ 牌名必须是引擎里的真实 id：②【酒】= "jiu"（不是 analeptic）、④【桃】= "tao"（不是 peach）。
// 写错名会在 lib.filter.cardEnabled 里抛 TypeError（get.info(card).enable），
// 而 filter 抛异常会炸穿 filterEnable → Check.skill → game.check()，表现为「出牌阶段被立刻结束」。
const xiaobaiMozhuanNames = ["sha", "jiu", "shan", "tao"];
const xiaobaiMozhuanLabels = ["杀", "酒", "闪", "桃"];
function xiaobaiMozhuanMaterial(card) {
	return !(get.type(card) == "basic" && get.color(card) == "red");
}
function xiaobaiMozhuanState(player) {
	const cur = player?.storage?.xiaobai_mozhuan || 0;
	return ((cur % 4) + 4) % 4;
}
function xiaobaiMozhuanCost(player, idx) {
	return Math.abs(idx - lib.xiaobaiMozhuanState(player)) + 1;
}
function xiaobaiMozhuanCount(player) {
	return player.countCards("hes", xiaobaiMozhuanMaterial);
}
// 墨撰候选牌面：材料够（转化技要按项数备料）+ 当前事件里 filterCard 通过
// （#63「filter/dialog 同源」；探测用 autoViewAs 虚拟牌，对齐模板 2.11 转化版）
function xiaobaiMozhuanCandidates(event, player) {
	const list = [];
	const count = xiaobaiMozhuanCount(player);
	if (!event?.filterCard) {
		return list;
	}
	for (let i = 0; i < 4; i++) {
		// ⚠️ 防御：牌名必须真实存在。传无效牌名时 lib.filter.cardEnabled 里
		// `get.info(card).enable` 会抛 TypeError（index.js:10996），而 filter 里抛异常会一路炸穿
		// filterEnable → Check.skill → game.check()，表现为「一进回合出牌阶段立刻结束」。
		// （2026-09-26 实测：原写法把【酒】写成 "analeptic" 正是这个坑；【酒】= "jiu"）
		if (!lib.card[xiaobaiMozhuanNames[i]]) {
			continue;
		}
		if (count < xiaobaiMozhuanCost(player, i)) {
			continue;
		}
		const card = get.autoViewAs({ name: xiaobaiMozhuanNames[i], isCard: true }, "unsure");
		if (event.filterCard(card, player, event)) {
			list.push(["基本", "", xiaobaiMozhuanNames[i]]);
		}
	}
	return list;
}
lib.xiaobaiMozhuanMaterial = xiaobaiMozhuanMaterial;
lib.xiaobaiMozhuanState = xiaobaiMozhuanState;
lib.xiaobaiMozhuanCost = xiaobaiMozhuanCost;
lib.xiaobaiMozhuanCount = xiaobaiMozhuanCount;
lib.xiaobaiMozhuanCandidates = xiaobaiMozhuanCandidates;
// 墨撰动态描述：把「当前项」标蓝（同 xiaobai_ziyi / xiaobai_yanhuo 的转换技做法）
lib.dynamicTranslate.xiaobai_mozhuan = function (player) {
	const base = lib.translate.xiaobai_mozhuan_info || "";
	const state = lib.xiaobaiMozhuanState(player);
	const token = `${["①", "②", "③", "④"][state]}【${xiaobaiMozhuanLabels[state]}】`;
	return base.replace(token, `<span class='bluetext'>${token}</span>`);
};

// 小白杯（xiaobai_ 前缀）技能
export const skills = {
// === 昂然 ===
// 昂然：抵消牌后或失去多张手牌后，手牌仅有/仅缺一种花色 → 展示并摸至全场最大众数多1（至多5），♣再摸1
xiaobai_angran: {
	audio: 2,
	// 抵消牌：shaMiss 用 target 角色（被【杀】者即抵消者），eventNeutralized 用 global + _neutralize_event 判定
	// （参考 character/sixiang.js 的 stdfunan「其他角色使用的牌被抵消时」——"eventNeutralizedAfter" 是死键，引擎从不派发）
	trigger: { target: "shaMiss", global: "eventNeutralized", player: "loseAfter" },
	filter(event, player, name) {
		if (!player.isIn() || player.countCards("h") == 0) return false;
		// 手牌仅有/仅缺一种花色（无花色的牌不计入）
		const suits = new Set(player.getCards("h").map((card) => get.suit(card, player)).filter((suit) => suit && suit != "none"));
		if (suits.size != 1 && suits.size != 3) return false;
		if (name == "shaMiss") return true;
		if (name == "eventNeutralized") return event.type == "card" && event._neutralize_event?.player == player;
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
		// "该花色"须在摸牌前判定：摸完花色就变了
		const suits = new Set(player.getCards("h").map((card) => get.suit(card, player)).filter((suit) => suit && suit != "none"));
		// 仅有♣ 或 缺♣（手牌三种花色且不含♣）
		const isClub = suits.size == 1 ? suits.has("club") : suits.size == 3 && !suits.has("club");
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
		// 若该花色为♣，你再摸一张牌
		if (isClub && player.isIn()) {
			await player.draw(1);
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// === 安氓 ===
// “每轮各限一次”：造成/受到各一个计数器（addTempSkill 至 roundStart）。
// 定版（2026-10-24）：无来源伤害（闪电）走“受到”方向；自伤两个方向**各询问一次、各+1**（最多+2），
// 每次发动后各自做“伤害值==上次摸牌数”的组合检查。
// direct + content 开头 chooseBool（R10：询问需交代方向），两次选择互相独立。
xiaobai_anmang: {
	audio: 2,
	mark: true,
	marktext: "氓",
	intro: {
		content(storage, player) {
			const last = player.storage.xiaobai_anmang_lastDraw;
			if (typeof last != "number" || last <= 0) return "本回合尚未摸过牌。";
			return "本回合你上次摸了" + last + "张牌。";
		},
		// 角标 = 上一次摸牌数（0 时引擎自动隐藏角标，player.js:4717）
		markcount(storage, player) {
			const last = player.storage.xiaobai_anmang_lastDraw;
			return typeof last == "number" && last > 0 ? last : 0;
		},
	},
	trigger: { global: "damageBegin1" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		// 造成方向：有来源且来源是自己；受到方向：自己是目标（含无来源伤害与自伤）
		const canDeal = event.source === player && !player.hasSkill("xiaobai_anmang_deal");
		const canTake = event.player === player && !player.hasSkill("xiaobai_anmang_take");
		return canDeal || canTake;
	},
	async content(event, trigger, player) {
		const canDeal = trigger.source === player && !player.hasSkill("xiaobai_anmang_deal");
		const canTake = trigger.player === player && !player.hasSkill("xiaobai_anmang_take");
		// 造成方向
		if (canDeal) {
			const go = await player
				.chooseBool("安氓：是否令此伤害+1？（你造成伤害，每轮限一次）")
				.set("ai", () => {
					// 自伤的+1纯亏，只为“受到方向再+1凑组合”服务；打别人的+1纯收益
					if (trigger.source === trigger.player) {
						const last = player.storage.xiaobai_anmang_lastDraw;
						return typeof last == "number" && last > 0 && trigger.num + 2 == last && player.hp > trigger.num + 2;
					}
					return true;
				})
				.forResult();
			if (go?.bool) {
				player.logSkill("xiaobai_anmang");
				player.addTempSkill("xiaobai_anmang_deal", "roundStart");
				trigger.num++;
				await lib.skill.xiaobai_anmang.checkGain(trigger, player);
			}
		}
		// 受到方向（自伤时是第二问）
		if (canTake) {
			const go = await player
				.chooseBool("安氓：是否令此伤害+1？（你受到伤害，每轮限一次）")
				.set("ai", () => {
					const last = player.storage.xiaobai_anmang_lastDraw;
					return typeof last == "number" && last > 0 && trigger.num + 1 == last && player.hp > trigger.num + 1;
				})
				.forResult();
			if (go?.bool) {
				player.logSkill("xiaobai_anmang");
				player.addTempSkill("xiaobai_anmang_take", "roundStart");
				trigger.num++;
				await lib.skill.xiaobai_anmang.checkGain(trigger, player);
			}
		}
	},
	// “若此伤害值与本回合你上次摸牌的牌数相同”→ 询问获得本回合弃牌堆两张牌并回复1点体力
	async checkGain(trigger, player) {
		const last = player.storage.xiaobai_anmang_lastDraw;
		if (typeof last != "number" || last <= 0 || trigger.num != last) return;
		const pile = getTurnDiscardCards().slice(0);
		if (!pile.length) return;
		const want = await player
			.chooseBool("安氓：是否获得本回合弃牌堆的两张牌并回复1点体力？")
			.set("ai", () => true)
			.forResult();
		if (!want?.bool) return;
		const num = Math.min(2, pile.length);
		const res = await player
			.chooseButton([`安氓：选择${get.cnNumber(num)}张牌获得`, [pile, "card"]], true)
			.set("selectButton", [num, num])
			.set("ai", (button) => 6 - get.value(button.link))
			.forResult();
		if (res?.bool && res.links?.length) await player.gain(res.links, "gain2");
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
				// ⚠️ draw 的牌在 result.cards（R14），记录实际张数而非请求数
				return (event.result?.cards?.length || 0) > 0;
			},
			content(event, trigger, player) {
				// draw 的牌在**宿主 trigger** 的 result.cards（R14）；content 的 event 是技能事件，没有 result.cards
				player.storage.xiaobai_anmang_lastDraw = trigger.result?.cards?.length || 0;
				player.updateMarks("xiaobai_anmang");
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
				player.updateMarks("xiaobai_anmang");
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
	ai: {
		order: 5,
		result: { player: 1 },
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
// === 按祚 ===
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
	ai: {
		order: 4,
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
	check(event, player) {
		// 只为队友或自己的防护亮牌；给敌人当保镖=资敌还耗每轮次数
		return get.attitude(player, event.player) > 0;
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
// === 秉严 ===
xiaobai_bingyan: {
	audio: 2,
	trigger: { global: "useCard" },
	filter(event, player) {
		if (player.hasSkill("xiaobai_bingyan_disabled")) return false;
		if (!get.tag(event.card, "damage")) return false;
		return get.color(event.card) === "black";
	},
	check(event, player) {
		// 仅对敌人的黑色伤害牌发动，且此牌目标不含己方（directHit 全场会连队友的响应一起封掉）
		if (get.attitude(player, event.player) >= 0) return false;
		return !(event.targets || []).some((t) => t == player || get.attitude(player, t) > 0);
	},
	async content(event, trigger, player) {
		// 令此牌无法被响应
		trigger.directHit.addArray(game.players);
		// 本技能失效（描述变灰）至下一次失去黑色牌后；此期间内无法响应基本牌或普通锦囊牌
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
// 秉严·失效（描述变灰；失去黑色牌后恢复）
xiaobai_bingyan_disabled: {
	audio: 2,
	charlotte: true,
	name: "秉严",
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
	onremove(player) {
		player.enableSkill("xiaobai_bingyan_disabled");
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
		return lib.xiaobaiBowenX(player);
	},
	filter(event, player) {
		return lib.xiaobaiBowenX(player) > 0;
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
	async content(event, trigger, player) {
		const x = lib.xiaobaiBowenX(player);
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
				// 选项二会**直接结束出牌阶段**，所以只有能印出关键牌时才值得（用户定：桃/无中/关键锦囊）。
				// 选项一的收益约等于「看X张、按字数换回若干张」，属常规补牌；不划算就用它。
				.set("ai", () => {
					const me = get.player();
					const key = candidates.some((name) => {
						if (name == "tao" && me.isDamaged()) return true; // 桃：受伤时是关键牌
						if (name == "wuzhong") return true; // 无中生有：直接换两张
						// 其他牌按牌面价值：明显偏高（≥9）才算关键锦囊/基本牌
						return get.value(new lib.element.VCard({ name, isCard: true }), me) >= 9;
					});
					return key ? 1 : 0;
				})
				.forResult()).control;
		}
		if (choice == viewOption) {
			const viewed = get.cards(x);
			if (!viewed.length) return;
			await player.viewCards("博文：牌堆顶的牌", viewed);
			const res1 = await player
				.chooseCard("博文：可以弃置任意张牌", [0, Infinity], () => true, "he")
				.set("ai", (card) => 5 - get.value(card))
				.forResult();
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
					// filterButton 读 ui.selected.buttons ⇒ 关掉按钮缓存
					// （game/index.js:6916 filterCache 把 button 映射成 select，读 !event.complexSelect）
					.set("complexSelect", true)
					// 预算以「牌名字数和」计，所以要按**单位字数价值**贪心，而不是绝对价值：
					// 否则 AI 会先挑走一张长名字高价值的牌，把预算占满、少拿一张。
					// （不写 ai 时引擎默认 `()=>1`（player.js:6276-6278），等于按列表顺序乱抓。）
					.set("ai", (button) => {
						const len = get.translation(button.link.name).length || 1;
						return get.value(button.link, player) / len;
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
// === 博议 ===
xiaobai_boyi: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return ["peach", "recast", "put", "draw"].some((item) => lib.xiaobaiBoyiCan(player, item));
	},
	ai: {
		order: 5,
		result: { player: 1 },
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
		const choices = all.filter((item) => lib.xiaobaiBoyiCan(player, item));
		if (!choices.length) return;
		const control = await player
			.chooseControl(choices.map((item) => names[item]))
			.set("prompt", "博议：执行一项")
			.set("choiceList", choices.map((item) => labels[item]))
			.set("ai", () => {
				// 优先“摸牌”；不可用时 indexOf 会返回 -1 使选项落空，退回第一个可用项
				const i = choices.indexOf("draw");
				return i >= 0 ? i : 0;
			})
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
			control = (await player.chooseControl(choices).set("prompt", "拨珠：选择一项").set("ai", () => choices[choices.length - 1]).forResult()).control;
		}
		if (control == "将三张牌置于武将牌上") {
			const res = await player
				.chooseCard("he", [3, 3], () => true)
				.set("prompt", "拨珠：选择三张牌置于武将牌上")
				.set("ai", (card) => 5 - get.value(card))
				.forResult();
			if (!res.bool || !res.cards || res.cards.length != 3) return;
			await player.addToExpansion(res.cards, player, "give").set("gaintag", ["xiaobai_bozhu"]);
		} else {
			const expansion = player.getExpansions("xiaobai_bozhu");
			const res = await player
				.chooseButton(["拨珠：选择获得武将牌上的两张牌", expansion], 2)
				.set("ai", (button) => get.value(button.link))
				.forResult();
			if (!res.bool || !res.links || res.links.length != 2) return;
			await player.gain(res.links, "gain2");
		}
		if (!player.isIn()) return;
		if (player.countCards("h") != player.countExpansions("xiaobai_bozhu")) return;
		const choice = await player
			.chooseControl(["令此牌额外结算一次", "令此牌无效"])
			.set("prompt", "拨珠：选择一项")
			.set("ai", () => (trigger.player == player ? 0 : 1))
			.forResult();
		const use = trigger.getParent("useCard", true);
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
// === 补隙 ===
xiaobai_buxi: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("he") >= 2 && game.hasPlayer((current) => current.countCards("he") > 0);
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
	async content(event, trigger, player) {
		const discard = await player
			.chooseToDiscard(2, "he", true, "补隙：弃置两张牌")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
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
// === 长河 ===
xiaobai_changhe: {
	audio: 2,
	trigger: { global: "phaseBefore", player: "enterGame" },
	forced: true,
	group: ["xiaobai_changhe_remove", "xiaobai_changhe_destroy"],
	// 「白」是全场通用的印牌入口（牌洗进公共牌堆，谁摸到谁用），用 global 注册为全局技能：
	// 所有角色都能在需要/响应时使用，但不进入任何角色的 player.skills ⇒ 不渲染进技能栏/技能描述。
	// 对齐原生〖问卦〗wengua → global: "wengua2"（character/yijiang.js:3966）。
	global: "xiaobai_dabai",
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
			const names = lib.xiaobaiChangheNames(skills);
			const card = game.createCard2("xiaobai_dabai", "spade", 9);
			card.storage.xiaobai_changhe = { general: name, names };
			// 「白」的销毁语义（分两段，别写死成 false！）：
			// ① 未销毁时 willBeDestroyed 恒假 —— 卡牌 init 时因 lib.card.xiaobai_dabai.destroy="discardPile"
			//    已被置为 "discardPile"（card.js:312）。若不改，lose 会走 content.js:10843 的
			//    `"destroyed" in card` 分支 → willBeDestroyed("discardPile") 为真 → 当场 selfDestroy 且
			//    **不移动**（牌留在原区域，只等 delete() 的 500ms 延迟摘除）。恒假后牌才能正常进入弃牌堆，
			//    再由〖长河〗的 destroy 兜底子技能统一补销毁。
			// ② 一旦被销毁（_selfDestroyed），对**任何**目标区域都判定为"会被销毁"（走 card.js:136 的
			//    function 分支）⇒ 引擎自己的守卫就会把它从各自的操作里剔除：
			//    gain content.js:10316 / lose 10843 / cardsDiscard 2499 / cardsGotoOrdering 2536 /
			//    cardsGotoSpecial 2585 / $cardsGotoPile 1429 / equip 961 / addJudge 11852 / gainToExpansion 10537。
			//    ⚠️ 缺了这一段，一张"已销毁但还活着"的牌会被 gain 的 postAnimate 重新
			//    `insertBefore` 进 handcards1（content.js:10423 —— 实测僵尸复活点），
			//    而 goto/discard 对 _selfDestroyed 又拒绝移动 ⇒ 永久卡在手牌区（用户报的 bug）。
			card.destroyed = (card2) => !!card2._selfDestroyed;
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
			// 兜底销毁：「白」的两段式 destroyed（见建牌处注释）让牌能正常进入弃牌堆，
			// 经 recast/使用/弃置落进弃牌堆后，在此统一补销毁（对齐描述“进入弃牌堆后销毁”）。
			destroy: {
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				name: "长河",
				trigger: { global: ["loseAfter", "cardsDiscardAfter"] },
				filter(event, player) {
					// ⚠️ 只有「真的往弃牌堆送牌」的事件才该触发销毁，否则会误杀「转移」路径：
					//   · lose         → 必须 event.position === ui.discardPile（重铸/弃置走这里）
					//   · cardsDiscard → 事件本身就是"置入弃牌堆"
					// 反例（都带 getlx=false，且牌并不进弃牌堆）：
					//   · 赠予：player.give → target.gain → 内部 owner.lose(cards, ui.special)（content.js:10301）
					//   · 使用牌：useCard 的 lose(cards, ui.ordering)（content.js:9120/10181）
					//   · 交换手牌：swapHandcardsx 的 lose(cards, ui.ordering)（content.js:10226/10236）
					// 只靠 get.position(card, true) == "d" 挡不住这些（牌在转移途中会被卷进来），
					// 所以必须从事件源头判。使用牌的销毁由后续 orderingDiscard → game.cardsDiscard 兜到 ✓
					if (event.name == "lose" && event.position !== ui.discardPile) return false;
					return lib.xiaobaiChangheDiscarded(event).some((card) => lib.xiaobaiChangheDestroyable(card));
				},
				async content(event, trigger, player) {
					for (const card of lib.xiaobaiChangheDiscarded(trigger)) {
						if (!lib.xiaobaiChangheDestroyable(card)) continue;
						card.selfDestroy(event);
						// ★ 立刻脱离所有区域，堵死 selfDestroy 的 500ms 空窗：
						//   selfDestroy 只做「置 _selfDestroyed=true + delete()」两件事，而 delete() 是
						//   **500ms 延迟**摘除 DOM（polyfill.js:47-68）——它既不立刻把牌移出弃牌堆，
						//   也不从 _status.discarded 里摘掉。于是这 500ms 内「白」仍是一张弃牌堆里的活牌，
						//   而本扩展/引擎有大量效果直接读 `ui.discardPile.childNodes`、`_status.discarded`、
						//   `game.getGlobalHistory("cardMove")` 取牌；一旦把它 gain 走，gain 落位时的
						//   `card.fix()` 会**清掉那个延迟删除的定时器**，牌就此复活成一张「已销毁的活牌」。
						//   而 `goto`/`discard` 对 `_selfDestroyed` 一律拒绝移动（polyfill.js:78 /
						//   card.js:927），`selfDestroy` 又被 `_selfDestroyed` 挡成空操作 ⇒ 这张牌再也挪不动，
						//   再重铸它就会原地留在手牌区（正是用户报的「有些白牌重铸后回到手牌区」）。
						if (_status.discarded) _status.discarded.remove(card);
						card.remove();
					}
					// 兜底：把任何「已销毁却还待在区域里」的僵尸「白」一并摘掉（兼容旧局残留）
					lib.xiaobaiSweepDestroyedDabai();
				},
			},
		},
	},
// === 诚谟 ===
xiaobai_chengmo: {
	audio: 2,
	round: 1,
	trigger: { global: "useCardToPlayer" },
	filter(event, player) {
		if (!player.isIn() || !event.isFirstTarget || !event.card || !event.targets?.length) return false;
		if (get.name(event.card) != "sha") return false;
		if (event.player == player || _status.currentPhase != event.player) return false;
		return player.countCards("h") > 0 && game.hasPlayer((current) => current != player && current.isIn());
	},
	async cost(event, trigger, player) {
		const user = trigger.player;
		const bestCard = player.getCards("h").sort((a, b) => get.value(a) - get.value(b))[0];
		const others = game.filterPlayer((cur) => cur != player);
		const prefer = others.filter((cur) => cur != user);
		const bestTarget = (prefer.length ? prefer : others).sort((a, b) => {
			const score = (target) => get.attitude(player, target) - get.attitude(target, user);
			return score(b) - score(a);
		})[0];
		const result = await player
			.chooseCardTarget({
				prompt: "诚谟：你可以选择任意张手牌和等量名其他角色，按选择顺序依次分配",
				position: "h",
				selectCard: [1, player.countCards("h")],
				selectTarget: [1, game.countPlayer((current) => current != player && current.isIn())],
				filterCard: () => true,
				filterTarget: (card, player2, target) => target != player2 && target.isIn(),
				// 描述要求“任意名角色各一张手牌”：牌数与角色数必须相等，多余的牌/目标不能选
				filterOk() {
					return ui.selected.cards.length == ui.selected.targets.length;
				},
				ai1: (card) => (card === bestCard ? 1 : -1),
				ai2: (target) => (target === bestTarget ? 1 : -1),
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
		const use = trigger.getParent("useCard", true);
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
					// 只保留对使用者真正可用的牌名：
					// 使用者 hej 无牌 → 过河拆桥不可用；距离/目标规则不允许 → 杀也不可用。
					const shaCard = get.autoViewAs({ name: "sha", isCard: true }, []);
					const guoheCard = get.autoViewAs({ name: "guohe", isCard: true }, []);
					const names = [];
					if (target.canUse(shaCard, user)) names.push("sha");
					if (target.canUse(guoheCard, user)) names.push("guohe");
					if (!names.length) continue;
					let name = names[0];
					// 只有一种可用时跳过“杀/过河拆桥”选择，直接进入选牌（选牌本身仍可取消）
					if (names.length > 1) {
						const res = await target
							.chooseControl(names.concat("cancel2"))
							.set("prompt", `诚谟：你可以将一张手牌当【杀】或【过河拆桥】对${get.translation(user)}使用`)
							.set("choiceList", ["将一张手牌当【杀】对其使用", "将一张手牌当【过河拆桥】对其使用", "取消"])
							.set("ai", () => {
								const me = get.player();
								const effect = (n) => get.effect(user, get.autoViewAs({ name: n, isCard: true }, []), me, me);
								return effect("sha") >= effect("guohe") ? "sha" : "guohe";
							})
							.forResult();
						if (res.control == "cancel2") continue;
						name = res.control;
					}
					const cardResult = await target
						.chooseCard("h", 1, (card) => true)
						.set("prompt", `诚谟：你可以将一张手牌当【${get.translation(name)}】对${get.translation(user)}使用`)
						.set("ai", (card) => 6 - get.value(card))
						.forResult();
					if (!cardResult.bool || !cardResult.cards?.length) continue;
					const vcard = get.autoViewAs({ name, isCard: true }, cardResult.cards);
					// 选牌后再核一次：避免中途目标状态变化导致非法使用
					if (!target.canUse(vcard, user)) continue;
					await target.useCard(vcard, cardResult.cards, user);
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
				if (player.hasMark("xiaobai_chenguang")) {
					// 修改后：需有手牌可弃才能防止伤害
					return gained && player.hasCard((card) => lib.filter.cardDiscardable(card, player), "he");
				}
				return !gained;
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
					if (event.cards?.length) {
						await player.discard(event.cards);
						trigger.cancel();
					}
				} else {
					await player.draw();
					trigger.cancel();
				}
			},
		},
		recover: {
			audio: "xiaobai_chenguang",
			trigger: { player: "recoverBegin" },
			filter(event, player) {
				if (!event.num) return false;
				const lost = player.getRoundHistory("lose", (evt) => evt.cards?.length > 0).length > 0;
				if (!player.hasMark("xiaobai_chenguang")) {
					// 修改前：需有手牌可弃才能额外回复
					return lost && player.hasCard((card) => lib.filter.cardDiscardable(card, player), "he");
				}
				return !lost;
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
					trigger.num *= 2;
				} else if (event.cards?.length) {
					await player.discard(event.cards);
					trigger.num *= 2;
				}
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
	ai: {
		order: 5,
		result: { player: 1 },
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
// === 传经 ===
xiaobai_chuanjing: {
	audio: 2,
	trigger: { player: "damageBegin1", source: "damageBegin1" },
	filter(event, player) {
		return event.num > 0;
	},
	async cost(event, trigger, player) {
		event.result = await player
			.chooseBool("传经：是否将牌堆底的三张牌置于牌堆顶？")
			.set("ai", () => {
				// 交换收益：自己手牌少则换入净赚；或当前回合角色是手牌多的敌人则削其手牌
				const current = _status.currentPhase;
				if (current?.isIn() && current != player && get.attitude(player, current) < 0 && current.countCards("h") > 3) return true;
				return player.countCards("h") < 3;
			})
			.forResult();
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
			.set("ai", (target) => {
				const me = get.player();
				if (target != me) return get.attitude(me, target) < 0 && target.countCards("h") > 3 ? 2 : 0;
				return me.countCards("h") < 3 ? 1 : 0;
			})
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
							.set("ai", (target) => {
								// 换到更多牌为正收益；对敌人优换、尽量不损队友
								const me = get.player();
								const delta = target.countCards("h") - me.countCards("h");
								if (delta > 0) return get.attitude(me, target) < 0 ? 3 : 1;
								if (delta < 0) return get.attitude(me, target) < 0 ? 1 : -2;
								return 0;
							})
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
		// 失效状态：技能描述变灰，本轮结束时（roundStart）自动解除
		disabled: {
			charlotte: true,
			onremove(player) {
				// enableSkill 的参数是「禁用者键」（即 disableSkill 的第一个参数），不是被禁用的技能名
				player.enableSkill("xiaobai_cuanhe_disabled");
			},
		},
	},
},
// === 长河 ===
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
// === 耽名 ===
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
	check(event, player) {
		// 仅在「手牌低于阈值、摸牌补足」方向发动；手牌超出时发动只会被迫弃自己的牌
		return player.countCards("h") < 4 - (player.storage.xiaobai_danming_reduce || 0);
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
				.set("ai", () => 1)
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
// === 悼主 ===
xiaobai_daozhu: {
	audio: 2,
	// 每轮限一次，一名角色进入濒死状态时
	trigger: { global: "dyingAfter" },
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
		// 定版流程：先选摸牌数量 → 摸牌 → 再交牌（手牌含刚摸的），合计三张
		const ctrl = await player
			.chooseControl(["摸0张", "摸1张", "摸2张", "摸3张"])
			.set("prompt", "悼主：选择摸牌数量（与交给其的手牌合计三张）")
			.set("ai", () => {
				// 手牌够三张就全交给濒死者、不摸（自己白得 0 伤保护）；不够则摸差额
				const hs = player.countCards("h");
				return hs >= 3 ? "摸0张" : "摸" + (3 - hs) + "张";
			})
			.forResult();
		const n = parseInt((ctrl?.control || "0").slice(1)) || 0;
		// 摸牌（⚠️ R14：draw 的牌在 result.cards，event.cards 不存在——旧实现 next.cards 恒 undefined、摸牌数恒取 0）
		let drawn = 0;
		if (n > 0) {
			const drawEvent = player.draw(n);
			await drawEvent;
			drawn = (drawEvent.result?.cards || []).length;
		}
		// 再交牌：交 3-n 张（不足则交现有全部）
		const giveNum = Math.min(3 - n, player.countCards("h"));
		if (giveNum > 0 && target.isIn()) {
			const res = await player
				.chooseCard("h", true, giveNum, `悼主：交给${get.translation(target)}${get.cnNumber(giveNum)}张手牌`)
				.set("ai", (card) => get.value(card, target))
				.forResult();
			if (res?.cards?.length) await player.give(res.cards, target);
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
// === 点赤 ===
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
// === 典仪 ===
xiaobai_dianyi: {
	audio: 2,
	trigger: { global: "damageEnd" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		// ① 伤害前：受害者是体力值最大（可并列）的角色之一（快照由 premax 子技能在扣血前写入）
		if (!event.xiaobai_dianyi_premax?.includes(event.player)) return false;
		// ② 伤害后：没有体力值唯一最大的角色（最大值并列 ≥2）
		// ⚠️ 两个条件独立评估：三方并列时一人掉血、剩余两家并列，也满足发动条件
		let maxHp = -1;
		for (const current of game.filterPlayer()) {
			if (current.hp > maxHp) maxHp = current.hp;
		}
		return game.filterPlayer((current) => current.hp == maxHp).length >= 2;
	},
	async content(event, trigger, player) {
		// 令至少两名体力值相同且手牌数≠体力值的角色调整手牌至体力值数
		const cands = game.filterPlayer((current) => current.isIn() && current.countCards("h") != current.hp);
		if (cands.length < 2) return;
		const res = await player
			.chooseTarget(
				"典仪：令至少两名体力值相同的角色将手牌调整至体力值数",
				(card, player2, targetx) => {
					const { cands } = get.event();
					if (!cands.includes(targetx)) return false;
					// 原生写法：多目标相互约束时实时读 ui.selected.targets（set 快照在选目标开始后失效），并配 complexTarget
					if (ui.selected.targets.length) {
						return targetx.hp == ui.selected.targets[0].hp;
					}
					return true;
				},
				[2, Infinity]
			)
			.set("cands", cands)
			.set("complexTarget", true)
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
	group: ["xiaobai_dianyi_premax"],
	subSkill: {
		// 扣血前快照当时体力值最大集合（挂到 damage 事件上供主技能 filter 读取）：
		// 伤害途中可能被回血类技能改体力，不能在 damageEnd 用 hp+num 反推伤害前体力
		premax: {
			charlotte: true,
			sub: true,
			trigger: { global: "damageBegin1" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.isIn() && Boolean(event.player?.isIn?.());
			},
			content(event, trigger, player) {
				let maxHp = -1;
				for (const current of game.filterPlayer()) {
					if (current.hp > maxHp) maxHp = current.hp;
				}
				trigger.xiaobai_dianyi_premax = game.filterPlayer((current) => current.hp == maxHp);
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// === 凋蝶 ===
xiaobai_diaodie: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { target: "useCardToTarget" },
	filter(event, player) {
		if (event.target != player) return false;
		if (!event.player?.isIn() || event.player == player) return false;
		if (!get.tag(event.card, "damage")) return false;
		const queue = player.storage.xiaobai_nichang;
		if (!Array.isArray(queue) || !queue.length) return false;
		return get.suit(event.card) == queue[0];
	},
	async content(event, trigger, player) {
		const queue = player.storage.xiaobai_nichang;
		const suit = queue[0];
		// 生效前拦截：把本目标加入结算排除表（useCardToTarget 与 useCard 共享同一 excluded 数组）
		trigger.excluded.add(player);
		game.log(trigger.card, "对", player, "无效");
		const suitChar = lib.xiaobaiNichangSuitChar(suit);
		const result = await player
			.chooseControl("选项一", "选项二")
			.set("choiceList", [
				`删去${suitChar}项并重置${get.poptip("xiaobai_nichang")}花色顺序`,
				`失去1点体力，从牌堆中获得${get.poptip("xiaobai_nichang")}中被删去的花色牌各一张`,
			])
			.set("prompt", `凋蝶：${get.translation(trigger.card)}（${suitChar}）与当前转换项同花色，请选择一项`)
			.set("deleted", ["heart", "spade", "club", "diamond"].filter((s) => !queue.includes(s)))
			.set("ai", () => {
				const evt = get.event();
				if (!evt.deleted.length || evt.player.hp <= 1) return "选项一";
				let pileCount = 0;
				for (const s of evt.deleted) {
					for (const card of Array.from(ui.cardPile.childNodes)) {
						if (get.suit(card) == s) pileCount++;
					}
				}
				return pileCount >= evt.deleted.length ? "选项二" : "选项一";
			})
			.forResult();
		if (result.control == "选项二") {
			await player.loseHp(1);
			if (player.isIn() && queue.length < 4) {
				const cards = [];
				for (const s of ["heart", "spade", "club", "diamond"]) {
					if (queue.includes(s)) continue;
					const card = get.cardPile2((c) => get.suit(c) == s);
					if (card) cards.push(card);
				}
				if (cards.length) await player.gain(cards, "gain2");
			}
			return;
		}
		// 选项一：删去当前转换项，剩余花色按标准顺序重排（队列空则霓裳不可再用）
		const idx = queue.indexOf(suit);
		if (idx >= 0) queue.splice(idx, 1);
		player.storage.xiaobai_nichang = ["heart", "spade", "club", "diamond"].filter((s) => queue.includes(s));
		player.updateMarks("xiaobai_nichang");
		lib.xiaobaiNichangSyncMark(player);
		if (player.storage.xiaobai_nichang.length) {
			game.log(player, "重置了", "#g【霓裳】", "的花色顺序");
		} else {
			game.log(player, "的", "#g【霓裳】", "花色顺序已删空");
		}
	},
},
// === 迭锋 ===
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
		// 亮出的牌已被 get.bottomCards 从牌堆取出，不在任何区域（get.position 返回 undefined）。
		// 用 "o"（整理区）判断会把池子清空 → 四项全被判"不可执行"，与描述不符。
		const floating = (card) => {
			const pos = get.position(card, true);
			return pos == null || pos == "o";
		};
		let pool = cards.slice(0);
		for (let num = 1; num <= 4; num++) {
			if (player.isDead()) break;
			pool = pool.filter(floating);
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
			// 同屏一次选完（不再逐张弹窗）：亮出的所有剩余牌一起列出，用 filterButton 保证互异约束
			const desc = num == 1 ? "点数为K" : num == 2 ? "颜色不同" : num == 3 ? "类别不同" : "花色不同";
			const conflict = (a, b) => {
				if (num == 2) return get.color(a) == get.color(b);
				// 与 xiaobaiDiefengCan 同口径：延时锦囊算锦囊
				if (num == 3) return get.type2(a) == get.type2(b);
				if (num == 4) return get.suit(a) == get.suit(b);
				return false;
			};
			const pick = await player
				// 与第1项"没有K直接失血跳过"一致：任何一项都允许取消，取消即失1点体力跳过
				.chooseButton([`迭锋（第${get.cnNumber(num)}项）：选择${get.cnNumber(num)}张${desc}的牌（取消则失去1点体力跳过）`, [pool.slice(0), "card"]], false, [num, num])
				// 过滤依赖已选按钮 → 必须关掉可选中缓存（game.check 的 button 缓存看 complexSelect）
				.set("complexSelect", true)
				.set("filterButton", (button) => {
					const card = button.link;
					if (num == 1) return get.number(card) == 13;
					return !ui.selected.buttons.some((current) => current !== button && conflict(current.link, card));
				})
				.set("ai", (button) => get.value(button.link))
				.forResult();
			if (!pick?.bool || (pick.links?.length || 0) < num) {
				// 取消/选不满 → 视为放弃该项，失血跳过
				await player.loseHp(1);
				continue;
			}
			const picked = pick.links.slice(0);
			// 选杀目标
			const vcard = get.autoViewAs({ name: "sha" }, picked);
			vcard.storage = { xiaobai_diefeng_num: num };
			const res = await player
				.chooseTarget(`迭锋（第${get.cnNumber(num)}项）：选择【杀】的目标`, 1, (card, player2, targetx) => {
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
			// ⚠️ 这是**转化杀**，不是凭空印牌：选中的牌必须作为这【杀】的底牌真正参与使用。
			//    旧写法 useCard(vcard, res.targets, ...) 只给了 vcard 与目标：
			//    useCard 里 `get.itemtype(next.card) == "card"` 才把牌塞进 next.cards，
			//    而 vcard 的 itemtype 是 "vcard"（get/index.js:3124）→ next.cards 落到 []，
			//    底牌从未进入本次用牌 → 引擎视角这是一张无底牌的虚拟【杀】。
			//    显式把 picked 作为 cards 实参传入，底牌才会进 event.cards（被使用/进入弃牌堆）。
			// 另外：亮出的牌已被 get.bottomCards 从牌堆 removeChild 出来，parentNode 为 null
			// ⇒ get.position 返回 undefined（get/index.js:3777-3779），引擎移动/弃置时找不到来源。
			// 对应 Lua 里这些牌位于 Card.Processing（diefeng.lua:32/39 的 expand_pile），
			// 无名杀的处理区就是 ui.special，先转移过去再当底牌使用。
			await game.cardsGotoSpecial(picked);
			await player.useCard(vcard, picked, res.targets, "xiaobai_diefeng").set("addCount", false);
			for (const card of picked) pool.remove(card);
		}
		// 亮出未用的牌进入弃牌堆
		const rest = pool.filter(floating);
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
// === 迭锋 ===
xiaobai_diefeng_damage: {
	audio: "xiaobai_diefeng",
	charlotte: true,
	sub: true,
	name: "迭锋",
	trigger: { source: "damageBegin2" },
	forced: true,
	filter(event, player) {
		const num = event.card?.storage?.xiaobai_diefeng_num;
		return num != undefined && event.player?.isIn() && event.player.countCards("h") == num;
	},
	content(event, trigger, player) {
		trigger.num++;
		game.log(trigger.player, "的手牌数与底牌数相等，伤害+1");
	},
},
// === 断祸 ===
xiaobai_duanhuo: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.countCards("h") > 0 && current.isIn());
	},
	filterTarget(card, player, target) {
		return target != player && target.countCards("h") > 0 && target.isIn();
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
// === 踱庇 ===
xiaobai_duobi: {
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "water",
	enable: "phaseUse",
	filter(event, player) {
		if (player.awakenedSkills.includes("xiaobai_duobi")) return false;
		return player.countCards("h") > 0 && game.hasPlayer((current) => current != player && current.isDamaged() && current.isIn());
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
		// 濒死时：所有手牌当【桃】救其他角色（限定技共用次数；虚拟桃“可对其他角色使用”，不能自救）
		save: {
			audio: "xiaobai_duobi",
			charlotte: true,
			sub: true,
			name: "踱庇",
			enable: ["chooseToUse"],
			hiddenCard(player, name) {
				return name == "tao" && !player.awakenedSkills.includes("xiaobai_duobi") && player.countCards("h") > 0;
			},
			filter(event, player) {
				if (player.awakenedSkills.includes("xiaobai_duobi") || player.countCards("h") == 0) return false;
				if (event.skill == "xiaobai_duobi_save" || event._skill == "xiaobai_duobi_save") return true;
				if (event.type != "dying") return false;
				if (event.dying == player) return false;
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
				// 与目标各摸两张（目标 = 濒死角色，由 save_draw 在使用后结算）
				event.result.card.storage ??= {};
				event.result.card.storage.xiaobai_duobi_mark = true;
			},
			group: ["xiaobai_duobi_save_draw"],
			ai: {
				save: true,
				skillTagFilter(player, tag, arg) {
					if (tag != "save" || arg == player) return false;
					return !player.awakenedSkills.includes("xiaobai_duobi") && player.countCards("h") > 0;
				},
				result: {
					player: 1,
				},
			},
		},
		// 濒死时用带标记的桃救起目标后：与目标各摸两张
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
				return event2.player == player && Boolean(event2.card?.storage?.xiaobai_duobi_mark);
			},
			async content(event2, trigger, player) {
				const target = event2.targets?.[0] || player;
				if (player.isIn()) await player.draw(2);
				if (target != player && target.isIn()) await target.draw(2);
				player.storage.xiaobai_duobi_target = target;
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
			// 全手牌当桃：手牌达到一定规模才划算；目标只选能吃到回复的友方
			player(player) {
				return player.countCards("h") >= 3 ? 1 : 0;
			},
			target(player, target) {
				return get.attitude(player, target) > 0 ? get.recoverEffect(target, player, player) : -1;
			},
		},
	},
},
// === 赴国 ===
xiaobai_fuguo: {
	audio: 2,
	// 使用基本牌时
	trigger: { player: "useCardBegin" },
	// ⚠️ 不能写 direct —— content.js:3613 `if (info.direct) { result = { bool: true }; }` 会**直接跳过 cost**
	//    （等价于强制发动）。「你可以」的询问由 cost 承载，所以此处不写 direct；技能名由引擎自动弹（不必手动 logSkill）。
	filter(event, player) {
		return player.isIn() && get.type(event.card, null, player) == "basic";
	},
	async cost(event, trigger, player) {
		// 本回合弃牌堆中未出现的花色数（与神点/激昂同口径：本回合进入弃牌堆的牌）
		const suits = new Set(lib.getTurnDiscardCards().map((card) => get.suit(card)).filter((suit) => suit));
		const lack = 4 - suits.size;
		const suitText = suits.size ? [...suits].map((suit) => get.translation(suit)).join("、") : "无";
		const desc = lack > 0 ? "然后弃置" + lack + "张牌（补齐未出现花色）" : "（无需弃牌）";
		const res = await player
			.chooseBool(`赴国：本回合弃牌堆的花色已有：${suitText}。你可以摸一张牌，${desc}`)
			.set("ai", () => (lack <= 1 ? 10 : 0))
			.forResult();
		event.result = res?.bool ? { bool: true } : { bool: false };
	},
	async content(event, trigger, player) {
		await player.draw(1);
		if (!player.isIn()) return;
		// 弃置本回合弃牌堆中缺失花色数张牌
		const preSuits = new Set(lib.getTurnDiscardCards().map((card) => get.suit(card)).filter((suit) => suit));
		const lack = 4 - preSuits.size;
		if (lack > 0 && player.countCards("he") > 0) {
			const n = Math.min(lack, player.countCards("he"));
			await player.chooseToDiscard(n, "he", true).forResult();
		}
		// 若你因此令本回合弃牌堆中出现四种花色 → 本回合下次造成的伤害+1（挂 mark 显示）
		const afterSuits = new Set(lib.getTurnDiscardCards().map((card) => get.suit(card)).filter((suit) => suit));
		if (preSuits.size < 4 && afterSuits.size == 4) {
			player.storage.xiaobai_fuguo_damage = 1;
			player.addSkill("xiaobai_fuguo_damage_mark");
			game.log(player, "本回合下次造成的伤害+1");
		}
	},
	// 主技能被移除时级联清理独立挂载的 mark 子技能
	onremove(player) {
		player.removeSkill("xiaobai_fuguo_damage_mark");
	},
	group: ["xiaobai_fuguo_damage", "xiaobai_fuguo_clear"],
	subSkill: {
		// 「下一次造成的伤害+1」的显示标记（挂在技能拥有者身上）。
		// ⚠️ **不进 group**：mark:true 的子技能一旦进 group，主技能一挂载就会渲染（开局显示空标记）；
		//     改为状态生效时 addSkill 挂载、消耗/回合结束时 removeSkill 卸下（docs/呈现与可视化标准.md 第二节 2）。
		damage_mark: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "赴",
			intro: {
				name: "赴国",
				content: "下一次造成的伤害+1",
				markcount: () => 1,
			},
		},
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
				player.storage.xiaobai_fuguo_damage = 0;
				player.removeSkill("xiaobai_fuguo_damage_mark");
				trigger.num++;
				game.log(player, "的此次伤害+1");
			},
		},
		// “本回合下次造成的伤害+1”：本回合结束即作废
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "phaseAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return Boolean(player.storage.xiaobai_fuguo_damage);
			},
			content(event, trigger, player) {
				player.storage.xiaobai_fuguo_damage = 0;
				player.removeSkill("xiaobai_fuguo_damage_mark");
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// === 富论 ===
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
// === 扶倾 ===
// 攻击路径（概念）：以牌使用者为起点、目标为终点，沿座位环单向遍历其间角色的路线；
// 攻击路径=最短路线，最短不唯一时由使用者自选其一（确定时机=指定目标后）；
// 使用者和目标不在路径上（途经角色=两端之间被遍历的角色）
xiaobai_fuqing: {
	audio: 2,
	// ⚠️ 必须是 global 槽：target 槽要求 player===event.target，那样只会实现“目标为你”，
	//    “途经你”（本人不是目标、座位弧路过）的情形永远进不了 filter
	trigger: { global: "useCardToTarget" },
	filter(event, player) {
		if (!player.isIn() || player.hasSkill("xiaobai_fuqing_used")) return false;
		// 只对【杀】做一次路径确定与判定（isFirstTarget：多目标只随首个目标派发一次）
		if (get.name(event.card) != "sha" || !event.isFirstTarget) return false;
		return true;
	},
	// 攻击路径的单向遍历：沿座位链从 from 走到 target，收集两端之间的途经角色
	//（走 getNext/getPrevious 存活链——已阵亡座次不算途经、不计弧长，与怀烈 relevant 同口径）
	arc(from, target, forward) {
		const path = [];
		if (target == from || !from.isIn() || !target.isIn()) return path;
		let cur = forward ? from.getNext() : from.getPrevious();
		while (cur && cur != from && cur != target) {
			path.push(cur);
			cur = forward ? cur.getNext() : cur.getPrevious();
		}
		return path;
	},
	async cost(event, trigger, player) {
		const use = trigger.getParent("useCard");
		const user = use.player;
		// 逐目标确定攻击路径（确定时机=指定目标后），并判定“途经你”
		const paths = [];
		let onPath = false;
		for (const target of (use.targets || []).slice()) {
			if (target == user || !target.isIn() || !user.isIn()) continue; // 自我使用等情形不存在攻击路径
			const cw = lib.skill.xiaobai_fuqing.arc(user, target, true);
			const ccw = lib.skill.xiaobai_fuqing.arc(user, target, false);
			if (cw.length == ccw.length) {
				// 最短路线不唯一：两条都是最短路，技能拥有者必在其中一条上 → 途经成立（无需自选）
				onPath = true;
				paths.push({ target, path: cw });
			} else {
				const path = cw.length < ccw.length ? cw : ccw;
				paths.push({ target, path });
				if (path.includes(player)) onPath = true;
			}
		}
		use.qunyouFuqingPaths = paths;
		// 途经你 或 目标为你
		const isTarget = (use.targets || []).includes(player);
		if (!onPath && !isTarget) return void (event.result = { bool: false });
		// 【以逸待劳】的目标由牌自身规则决定（与你势力相同的**所有**角色，见 card/guozhan.js:1321-1340），
		// 不再让玩家选目标；这里只问"是否发动"
		const result = await player
			.chooseBool(get.prompt("xiaobai_fuqing"), "令此【杀】无效，并视为使用一张【以逸待劳】？")
			.set("ai", () => {
				// 「令此【杀】无效」= 保护该【杀】的目标；随后【以逸待劳】让同势力角色
				// 各摸2弃2（card/guozhan.js:1341-1344，属轻度过滤，不构成主要收益）。
				// 因此判据就是：这张【杀】的目标里有没有己方角色（含自己）→ 有则无效化。
				const targets = use.targets || [];
				if (targets.some((target) => get.attitude(player, target) > 0)) return true;
				return false;
			})
			.forResult();
		event.result = { bool: !!result?.bool };
	},
	async content(event, trigger, player) {
		player.addTempSkill("xiaobai_fuqing_used", "roundStart");
		// 视为使用【以逸待劳】：目标 = 与你势力相同的所有角色（含自己），同该牌自身规则
		const targets = game.filterPlayer((target) => target.isIn() && target.group === player.group);
		const useEvent = player.useCard(get.autoViewAs({ name: "yiyi" }, []), targets, "xiaobai_fuqing");
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
		const X = targets.length;
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
// === 改矩 ===
xiaobai_gaiju: {
	audio: 2,
	mark: true,
	marktext: "矩",
	intro: {
		content(storage, player) {
			const ju = lib.xiaobaiGaijuCards(player);
			if (ju.length < 2) return "暂无“矩”。";
			const nums = ju.map((card) => get.number(card)).sort((a, b) => a - b);
			return `“矩”为武将牌上的两张牌（点数${nums[0]}、${nums[1]}）。点数在${nums[0]}与${nums[1]}之间的牌视为“矩”之间的牌。`;
		},
	},
	group: ["xiaobai_gaiju_round", "xiaobai_gaiju_use", "xiaobai_gaiju_discard"],
	subSkill: {
		round: {
			// 每轮开始：没有"矩" → 摸三张牌，将两张手牌置为"矩"（描述为"可以"，保留发动询问）
			name: "改矩",
			charlotte: true,
			trigger: { global: "roundStart" },
			filter(event, player) {
				return player.isIn() && lib.xiaobaiGaijuCards(player).length == 0;
			},
			async content(event, trigger, player) {
				player.logSkill("xiaobai_gaiju");
				await player.draw(3);
				if (player.isDead() || player.countCards("h") < 2) return;
				const res = await player
					.chooseCard("h", 2, true, "改矩：请将两张手牌置于武将牌上，称为“矩”")
					.set("ai", (card) => 6 - get.value(card))
					.forResult();
				if (!res?.cards?.length) return;
				const cards = res.cards.slice();
				await player.addToExpansion(cards, player, "give").set("gaintag", ["xiaobai_gaiju_ju"]);
				game.log(player, "将", cards, "置于武将牌上，称为", "#g“矩”");
			},
		},
		use: {
			// 你使用点数不在"矩"之间的牌时：弃置一张牌
			name: "改矩",
			charlotte: true,
			trigger: { player: "useCard" },
			forced: true,
			filter(event, player) {
				if (lib.xiaobaiGaijuCards(player).length != 2) return false;
				if ((event.cards?.length || 0) > 1) return false;
				const num = get.number(event.card);
				if (!num) return false;
				return !lib.xiaobaiGaijuBetween(player, num) && player.countCards("he") > 0;
			},
			async content(event, trigger, player) {
				await player
					.chooseToDiscard("he", true, 1, "改矩：你使用的牌点数不在“矩”之间，请弃置一张牌")
					.set("ai", (card) => 6 - get.value(card))
					.forResult();
			},
		},
		discard: {
			// 其他角色弃置点数不在"矩"之间的牌后：你摸一张牌
			name: "改矩",
			charlotte: true,
			trigger: { global: "discardAfter" },
			forced: true,
			filter(event, player) {
				if (event.player == player) return false;
				if (lib.xiaobaiGaijuCards(player).length != 2) return false;
				return (event.cards || []).some((card) => !lib.xiaobaiGaijuBetween(player, get.number(card)));
			},
			async content(event, trigger, player) {
				player.logSkill("xiaobai_gaiju");
				await player.draw(1);
			},
		},
	},
},
// === 刚矫 ===
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
			.set("ai", (target) => {
				// 目标手牌多于你 → 其弃1（对敌有利）；少于你 → 其摸1（对友有利），不能只按好感选
				const att = get.attitude(player, target);
				return target.countCards("h") > player.countCards("h") ? -att : att;
			})
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
	group: ["xiaobai_gangjiao_release"],
	subSkill: {
		// 被限定的角色死亡 → 解除"下次仅能对其发动"（否则 filter 恒假，技能永久锁死）
		release: {
			charlotte: true,
			sub: true,
			name: "刚矫",
			trigger: { global: "dieAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.storage.xiaobai_gangjiao_target === event.player;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_gangjiao_target = null;
				player.updateMarks("xiaobai_gangjiao");
			},
		},
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// === 刚躁 ===
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
// === 耕积 ===
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
		// 失效状态：技能描述变灰；下一次受到伤害后解除并摸至四张
		disabled: {
			charlotte: true,
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
			onremove(player) {
				player.enableSkill("xiaobai_gengjian_disabled");
			},
		},
	},
	onremove(player, skill) {
		player.removeSkill("xiaobai_gengjian_disabled");
		player.enableSkill("xiaobai_gengjian_disabled");
	},
},
// === 耕战 ===
// 耕战：衍生技（田法授予）
xiaobai_gengzhan: {
	audio: 2,
	mark: true,
	marktext: "耕",
	intro: {
		// 角标 = 本轮因耕战弃置的牌数
		markcount(storage, player) {
			return player.storage.xiaobai_gengzhan || 0;
		},
		content(storage, player) {
			return "你因为耕战弃置的牌：" + get.cnNumber(player.storage.xiaobai_gengzhan || 0) + "张";
		},
	},
	// 田法于本轮结束时移除本技能，顺带清空本轮计数
	onremove(player, skill) {
		delete player.storage[skill];
	},
	// 摸牌阶段：改为弃置任意张花色不同的牌并摸两倍数量的牌
	trigger: { player: "phaseDrawBegin1" },
	filter(event, player) {
		return player.isIn() && player.countCards("he") > 0;
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseCard("he", "耕战：弃置任意张花色不同的牌并摸两倍数量的牌（点击取消正常摸牌）", [0, 4], (card, player2) => {
				return !ui.selected.cards.some((p) => get.suit(p, player2) == get.suit(card, player2));
			})
			// 选牌过滤依赖 ui.selected.cards：必须关掉可选中缓存（game.check 的 useCache），
			// 否则按首次检查结果缓存，同花色牌永远可选（原生业炎同款）
			.set("complexCard", true)
			// ⚠️ 旧写法 `.set("ai", (card) => 3 - get.value(card))` 让 AI **永远不发动**：
			//    get.value 对正常牌约 4~7，`3 - value` 恒 ≤ 0；而 selectCard 下限是 0，
			//    ai.basic.chooseCard 里 `ui.selected.cards.length >= range[0]` 立刻把 ok 置 true
			//    （basic.js:89-91），接着 `if (check(cards[ix]) <= 0) { if (!forced || ok) return ok; }`
			//    （basic.js:130-136）→ 直接返回「选了 0 张」→ cost 拿到空数组 → 判为不发动。
			//
			// 正确判据：耕战把「摸 2 张」换成「弃 n 张、摸 2n 张」（content 里 trigger.num = 0 放弃原摸牌）。
			//   正常摸牌收益 ≈ 2V
			//   耕战收益     ≈ 2nV - S      （S = 弃掉的 n 张价值之和，V = 一张未知牌的平均价值）
			//   耕战更优 ⇔ S < 2V(n-1)
			//   ⇒ n=1 恒亏（要求 S<0），必须凑到 2 张以上；n 越大越划算（n=2 已持平张数且能主动丢烂牌）。
			// 另外本扩〖田法〗按「因耕战弃置的牌」记数，弃得越多额外收益越高，方向一致。
			.set("ai", (card) => {
				const me = get.player();
				// 每个花色只留价值最低的一张作候选（与 filterCard 的「花色不同」对齐）
				const bySuit = {};
				for (const current of me.getCards("he")) {
					const suit = get.suit(current, me);
					if (!bySuit[suit] || get.value(current, me) < get.value(bySuit[suit], me)) bySuit[suit] = current;
				}
				const cheapest = Object.values(bySuit).sort((a, b) => get.value(a, me) - get.value(b, me));
				// 只有一种花色 ⇒ 最多弃 1 张 ⇒ 净少摸一张，不如正常摸牌
				if (cheapest.length < 2) return 0;
				const avgDraw = 5; // 一张未知牌的平均价值（杀/闪约 5~6，桃/无中约 7）
				const maxN = Math.min(4, cheapest.length);
				// 逐 n 比较：耕战收益 2nV - S(n) vs 正常摸牌 2V，取最优的 n。
				// 不能直接用「最多能弃几张」——弃得多时 S 也涨，最优 n 常常更小
				// （例：候选 3/5/11/12 → 弃2张收益12、弃3张11、弃4张9，最优是 n=2）。
				let bestN = 0;
				let bestProfit = 2 * avgDraw; // 正常摸牌的基准收益
				let sum = 0;
				for (let i = 0; i < maxN; i++) {
					sum += get.value(cheapest[i], me);
					const n = i + 1;
					if (n < 2) continue; // n=1 恒亏（要求 S<0）
					const profit = 2 * n * avgDraw - sum;
					if (profit > bestProfit) {
						bestProfit = profit;
						bestN = n;
					}
				}
				if (!bestN) return 0;
				const picked = cheapest.slice(0, bestN);
				// 只在候选集内给分，且价值越低分越高（ai.basic.chooseCard 每轮取最高分 → 自动先丢最烂的）。
				// 候选集之外的牌一律 0 分，贪心到此即停 → 实际弃置张数恰好等于 bestN。
				if (!picked.includes(card)) return 0;
				return 10 - get.value(card, me);
			})
			.forResult();
		if (!res?.cards?.length) return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { cards: res.cards } };
	},
	async content(event, trigger, player) {
		const cards = event.cost_data.cards;
		const n = cards.length;
		if (n == 0) return;
		trigger.num = 0; // 放弃原摸牌
		const owner = game.findPlayer((current) => current.hasSkill("xiaobai_tianfa"));
		// 先登记"这批牌是耕战弃置的"：田法的置底子技只认登记的牌，
		// 不能把该角色这之后任何弃置都算作"因此弃置"（必须先于 discard 登记，loseAfter 在弃置内触发）
		if (owner) owner.storage.xiaobai_tianfa_discard = cards.slice(0);
		await player.discard(cards);
		// 登记只服务这一次弃置：discard 内部的 loseAfter 已经把田法的置底询问跑完，这里立刻清空，
		// 避免登记残留到该角色之后任何一次弃置里被误判成"因耕战弃置"。
		if (owner) owner.storage.xiaobai_tianfa_discard = null;
		player.storage.xiaobai_gengzhan = (player.storage.xiaobai_gengzhan || 0) + n;
		player.updateMarks("xiaobai_gengzhan");
		if (!player.isIn()) return;
		await player.draw(2 * n);
		// 通知田法记录
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
// === 卦解 ===
xiaobai_guajie: {
	audio: 2,
	mark: true,
	marktext: "易",
	intro: {
		// 角标 = 辟易数量（storage.xiaobai_guajie 本身是 undefined，必须用 markcount 供数）
		markcount(storage, player) {
			return (player.storage.xiaobai_piyi_slots || []).length;
		},
		// 悬浮：直接渲染牌面（intro.mark 拿到 uiintro 对话框本体，get/index.js:5403），
		// 分“本轮未发动 / 本轮已发动”两段，每个实例一张牌面按钮（初始两枚同名 = 两张，体现“各限一次”）
		mark(uiintro, storage, player) {
			const slots = player.storage.xiaobai_piyi_slots || [];
			if (!slots.length) {
				uiintro.addText("暂无“辟易”。");
				return;
			}
			const toVcard = (list) => list.map((slot) => [get.type(slot.name), "", slot.name]);
			const unused = slots.filter((slot) => !slot.used);
			const used = slots.filter((slot) => slot.used);
			// noclick=true：悬浮里的牌面只看不点（dialog.add 第二参透传按钮 noclick，dialog.js:261）
			if (unused.length) {
				uiintro.addText("本轮未发动");
				uiintro.add([toVcard(unused), "vcard"], true);
			}
			if (used.length) {
				uiintro.addText("本轮已发动（每轮各一次，轮首重置）");
				uiintro.add([toVcard(used), "vcard"], true);
			}
		},
	},
	// 锁定技（trigger + forced ⇒ get.is.locked 判为锁定技，面板自动加“锁定技”标签）
	trigger: { global: "gameStart" },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		return !(player.storage.xiaobai_piyi_slots || []).length;
	},
	content(event, trigger, player) {
		// 两个“初始状态”的辟易：各自的「」都是【无懈可击】
		player.storage.xiaobai_piyi_slots = [{ name: "wuxie" }, { name: "wuxie" }];
		player.updateMarks("xiaobai_guajie");
	},
	// 获得一个“辟易”——由〖辟易〗调用（“上限8 / 超出替换”规则只此一处）。
	// 每个辟易是**独立实例** { name }，name 就是它的「」内容；不叠数值，所以能表达“我有哪些牌名”
	async gain(player, name) {
		const slots = (player.storage.xiaobai_piyi_slots ??= []);
		if (slots.some((slot) => slot.name === name)) return; // 已有此牌名的辟易 → 不再获得
		if (slots.length < 8) {
			slots.push({ name });
			player.updateMarks("xiaobai_guajie");
			game.log(player, "获得了一个", "#g【" + get.translation(name) + "】的“辟易”");
			return;
		}
		// 超出上限：玩家选一个牌名替换
		const names = [...new Set(slots.map((slot) => slot.name))];
		const ctrl = await player
			.chooseControl(names.map((n) => "【" + get.translation(n) + "】"))
			.set("prompt", "卦解：“辟易”已达上限，替换哪一个为【" + get.translation(name) + "】？")
			// 替换掉价值最低的那个牌名，而不是恒定替换第一项（列表按获得顺序，与强弱无关）。
			.set("ai", () => {
				let worst = names[0];
				let worstValue = Infinity;
				for (const current of names) {
					const value = get.value({ name: current }, player);
					if (value < worstValue) {
						worstValue = value;
						worst = current;
					}
				}
				return "【" + get.translation(worst) + "】";
			})
			.forResult();
		if (!ctrl?.control) return;
		const old = ctrl.control.slice(1, -1);
		const slot = slots.find((s) => s.name === old);
		if (!slot) return;
		slot.name = name;
		delete slot.used; // 换进来的是一枚新辟易，本轮可再用
		player.updateMarks("xiaobai_guajie");
		game.log(player, "将一个", "#g【" + get.translation(old) + "】的“辟易”替换为了", "#g【" + get.translation(name) + "】");
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// === 观承 ===
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
		// “以 last 的视角视为使用”：使用者仍是薛莹，视角只改目标集合与结算锚点——
		// 桃园=所有人、从 last 开始；万箭=除 last 外、从 last 的下家开始。
		// ⚠️ useCard 的 step1 日志步骤会无条件 targets.sortBySeat()（锚点=使用者，content.js:9273），
		// fixedSeat 拦不住它——由下方 view 子技能在 useCard1（step1 末尾）按视角重排；
		// fixedSeat 继续保留，拦的是其后 sortTarget 的 currentPhase||薛莹 重排。
		let targets = game.filterPlayer((current) => current.isIn() && (yang || current != last));
		const next = player.useCard(get.autoViewAs({ name }, []), targets, "xiaobai_guancheng");
		next.fixedSeat = true;
		next.xiaobai_guancheng_view = last;
		await next;
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
	group: ["xiaobai_guancheng_view", "xiaobai_guancheng_record", "xiaobai_guancheng_clear"],
	subSkill: {
		// 视角结算锚点：useCard 的 step1 日志步骤按“使用者”原地重排 targets（content.js:9273），
		// 本触发器在其后的 useCard1 时点把本次视为使用的目标重排为“从视角角色开始的座位环序”
		// （万箭：视角角色不在目标里 → 其下家居首）。fixedSeat 已拦掉更后面的 sortTarget 重排。
		view: {
			charlotte: true,
			sub: true,
			trigger: { global: "useCard1" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return Boolean(event.xiaobai_guancheng_view);
			},
			content(event, trigger, player) {
				trigger.targets.sortBySeat(trigger.xiaobai_guancheng_view);
			},
		},
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
// === 观历 ===
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
			// 张数是**盲选**（选完才看牌），所以取最大：摆牌权在手上，取5张 = 从5张里挑最好的一张先摸；
			// 取1张只是把一张未知牌翻到顶上，没有挑选余地。观星式技能一律「多看多控」。
			.set("ai", () => opts[opts.length - 1])
			.forResult();
		if (!ctrl?.control || ctrl.control == "cancel2") return;
		player.logSkill("xiaobai_guanli");
		const num = opts.indexOf(ctrl.control) + 1;
		const cards = get.bottomCards(num, true); // peek 牌堆底
		const displayCards = cards.slice().reverse(); // 左=顶显示
		// 任意顺序排列
		const moveRes = await player
			.chooseToMove("观历：将牌以任意顺序置于牌堆顶", true)
			.set("list", [["牌堆顶（左→右）", displayCards], ["", []]])
			.set("filterOk", (moved) => moved[0].length == num)
			// 排法照原生观星的 AI（chooseToGuanxing 的 processAI，content.js:12192-12258）：
			// 价值高的排前面（越靠左越先摸到）。区别是观历**没有**「放牌堆底」这一栏——
			// 这 N 张必须全部上顶，所以只能排序、不能埋牌。
			.set("processAI", (list) => {
				const me = get.player();
				const sorted = (list?.[0]?.[1] || []).slice();
				sorted.sort((a, b) => get.value(b, me) - get.value(a, me));
				return [sorted, []];
			})
			.forResult();
		const ordered = (moveRes?.moved?.[0]?.length ? moveRes.moved[0] : displayCards).reverse();
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
// === 诂守 ===
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
			return ui.create.dialog("诂守：将♠基本牌当【" + (names[stage] || "") + "】使用", [list, "vcard"], "hidden");
		},
		// 逐按钮探测（武圣同款）：当前窗口里用不了的候选不显示
		filter(button, player) {
			const evt = _status.event.getParent();
			return evt.filterCard?.(
				get.autoViewAs({ name: button.link[2], nature: button.link[3], isCard: true }, "unsure"),
				player,
				evt
			);
		},
		check(button) {
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2], nature: button.link[3], isCard: true }), null, true);
		},
		// ⚠️ 转化版 backup（selectCard:1 消耗素材）**不能带 precontent**——那是无素材印牌（selectCard:0）
		//    专用流程字段，混用会把结果路由进 useSkill，而 backup 没有 content → this.content is not a function
		//    （gameEvent.js:232，本次实测崩溃）。纯 viewAs 结构照 武圣 qunyou_wusheng。
		backup(links, player) {
			// 暂存选中的候选（vcard 名/属性），供 useSkill 兜底路由（content）使用
			player.storage.xiaobai_gushou_picked = links[0].slice();
			return {
				audio: "xiaobai_gushou",
				filterCard(card, player2) {
					return get.suit(card, player2) == "spade" && get.type(card, null, player2) == "basic";
				},
				selectCard: 1,
				position: "h",
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true, storage: { xiaobai_gushou: true } },
				popname: true,
			};
		},
		prompt(links, player) {
			const stage = player?.storage?.xiaobai_gushou_stage || 0;
			const names = ["伤害牌", "锦囊牌", "K点牌"];
			return "诂守：将一张♠基本牌当【" + get.translation(links[0][2]) + "】使用（首项：" + (names[stage] || "") + "）";
		},
	},
	group: ["xiaobai_gushou_advance", "xiaobai_gushou_count"],
	// useSkill 兜底路由：AI/托管等路径直接拼 { skill, cards }（无 result.card）时会走 useSkill——
	// 没有这个 content 就崩（this.content is not a function）。正常对话框路径不会执行到这里。
	async content(event, trigger, player) {
		const cards = (event.cards || []).filter((card) => player.getCards("h").includes(card));
		const stage = player.storage.xiaobai_gushou_stage || 0;
		const picked = player.storage.xiaobai_gushou_picked;
		const candidates = lib.skill.xiaobai_gushou.getCandidates(player, stage);
		const pick = picked || candidates[0];
		if (!pick || !cards.length) return;
		const vcard = get.autoViewAs({ name: pick[2], nature: pick[3], isCard: true, storage: { xiaobai_gushou: true } }, cards);
		delete player.storage.xiaobai_gushou_picked;
		await player.useCard(vcard, cards, "xiaobai_gushou");
	},
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
				// “进入弃牌堆”：只认当下确实在弃牌堆的牌——lose/loseAsync 的 event.cards 不分去向，
				// 被获得/交给等前置失去的牌（现已在别人手里）不算进入弃牌堆
				return (event.cards || []).some(
					(card) => get.position(card, true) == "d" && lib.skill.xiaobai_gushou.matchStage(card, stage)
				);
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
		// 「X为你以此法使用牌数」计数：从转化牌（vcard storage.xiaobai_gushou）的 useCard 结算统计
		//（原 precontent 方案会把转化版 backup 路由进 useSkill 而崩溃，故移到这里）
		count: {
			charlotte: true,
			sub: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { player: "useCardAfter" },
			filter(event, player) {
				return Boolean(event.card?.storage?.xiaobai_gushou);
			},
			content(event, trigger, player) {
				player.storage.xiaobai_gushou_used = (player.storage.xiaobai_gushou_used || 0) + 1;
				player.updateMarks("xiaobai_gushou");
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
		// 响应窗口预检三件套（照 击楫 xuandie_jiji / 卫境 weijing 范式）：印牌源是♠基本牌，
		// 引擎的手牌预检（hasShan/canSave/hasWuxie）扫不到转化牌 → 缺接口则对应询问被整个跳过。
		// 可印牌名全部由运行时候选（getCandidates）实扫决定：①伤害牌（含杀）②普通锦囊（含无懈）
		// ③K点牌（当局存在13点的闪/桃/无懈等即解锁对应窗口）
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag, arg) {
			const stage = player.storage.xiaobai_gushou_stage || 0;
			if (stage >= 3) return false;
			if (player.countCards("h", (card) => get.suit(card, player) == "spade" && get.type(card, null, player) == "basic") == 0) return false;
			if (arg === "respond") return false; // 仅使用，不可打出
			const names = lib.skill.xiaobai_gushou.getCandidates(player, stage).map((info) => info[2]);
			if (tag == "respondSha") return names.includes("sha");
			if (tag == "respondShan") return names.includes("shan");
			if (tag == "save") return names.includes("tao");
			return false;
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
	check(event, player) {
		// AI：手牌少于 4 时调整为 4 是净赚；多于 4 时会先弃自己的牌，不值得发动
		return player.countCards("h") <= 4;
	},
	async content(event, trigger, player) {
		// 将手牌数调整为4
		await lib.qunyou_adjustHandTo(player, 4);
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
// === 徊澜 ===
xiaobai_huailan: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		// 描述是「两张牌」，不是「两张手牌」→ 手牌 + 装备区（与武圣的 position:"hes" 同类；
		// 判定区的牌不属于「你可以使用的牌」，故不含 j）
		return player.countCards("he") >= 2;
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
				// 「两张牌」= 手牌 + 装备区；引擎默认（不写 position）只给手牌
				//（player.iterableGetCards 里 typeof position != "string" → "h"）
				position: "he",
				viewAs: { name: "juedou", isCard: true, storage: { xiaobai_huailan: true } },
				check(card) {
					return 6 - get.value(card);
				},
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
		// 用 attackRangeFinal 而不是 attackRange：原型的 atkrange 是 final_func（最后生效、覆盖武器范围），
		// 无名杀对应 attackRangeFinal（player.js:12274-12302：base → attackRange → attackRangeFinal）；
		// 原生同款「调整至某值」= 立仁 liren（character/xianding.js:12991-12997）
		attackRangeFinal(current, num) {
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
				// 受伤者必须不是自己：徊澜决斗被对方用杀顶回、自己没出杀时会自伤
				//（damage 的 source 与 player 都是自己，槽位照样匹配）——"你与自己的距离"
				// 为 0，会把范围锁成 1（用户实测"不管哪个角色都是 1"的真凶）
				return player.isIn() && event.player != player && Boolean(event.card?.storage?.xiaobai_huailan) && event.player?.isIn();
			},
			async content(event, trigger, player) {
				// ⚠️ 受伤者必须取 trigger.player：content 的 event 是技能自身事件，
				// event.player = 技能拥有者自己（此前取错 → 距离恒为"与自己的距离"0 → 范围恒 1）
				const victim = trigger.player;
				const current = player.getAttackRange();
				// "你与受伤角色的距离" = 界面/结算用的正常距离（含 ±1 马与距离类技能）。
				// 依据 FreeKill 原型：`player:distanceTo(victim)` 走 DistanceSkill 的 correct/fixed
				// （packages/freekill-core/ltk/core/player.lua:539-604，马匹即 DistanceSkill），
				// 与无名杀 get.distance 默认行为一致（不带 method 才叠加 globalFrom/globalTo 与马匹，
				// noname/get/index.js:3575-3615）；传 "raw" 得到的是裸座位距离，会让「范围=距离」
				// 在对方挂 +1 马时失效。
				const dist = get.distance(player, victim);
				player.storage.xiaobai_huailan_range = dist;
				// 呈现：挂"澜"标记，角标数字=当前攻击范围（updateMark 读 storage 数字）
				player.markSkill("xiaobai_huailan_range");
				// 若因此减少，你摸一张牌
				if (dist < current) {
					player.logSkill("xiaobai_huailan");
					await player.draw(1);
				}
			},
		},
		range: {
			// 攻击范围锁定标记（damage 子技能 markSkill 挂载，角标数字=当前范围）
			charlotte: true,
			sub: true,
			mark: true,
			// 改攻击范围必须挂 attackRange.png（R18）；图标由 markimage 决定，marktext 仅在没有 markimage 时兜底
			markimage: "image/card/attackRange.png",
			intro: {
				name: "徊澜",
				content(storage, player) {
					return `<li>攻击范围已调整至你与受伤角色的距离（当前：${storage}）<br><li>当前攻击范围：${player.getAttackRange(false)}`;
				},
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
		const shaCards = (trigger.cards || []).filter((card) => get.position(card, true) == "d");
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
				.set("ai", () => {
					// 代价项排序：摸牌是净赚，得场上牌次之，重铸只是无差换牌
					for (const key of ["draw", "obtain", "recast"]) {
						if (options.includes(key)) return options.indexOf(key);
					}
					return 0;
				})
				.forResult();
			if (!ctrl?.control || ctrl.control == "cancel2") {
				event.result = { bool: false };
				return;
			}
			choice = options[ctrl.index];
		}
		event.result = { bool: true, cost_data: { useEvent, shaCards, heart, choice } };
	},
	async content(event, trigger, player) {
		const { useEvent, shaCards, heart, choice } = event.cost_data;
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
					// 这是「获得一名角色场上一张牌」的代价项：应当从**敌方**拿、且对方场上牌越多越好。
					// 不写 ai 时默认 get.attitude2（player.js 的 chooseTarget 默认），会偏向自家人 → 拿队友的牌。
					.set("ai", (target) => -get.attitude(player, target) * (1 + target.countCards("ej")))
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
// === 麾号 ===
xiaobai_huihao: {
	audio: 2,
	// 准备阶段：摸1、用1，然后令其他角色依次选择「交给同花色牌」或「弃两张花色不同的牌并火杀」
	trigger: { player: "phaseZhunbeiBegin" },
	// 不能写 direct: true —— 引擎在 direct 分支直接 result = { bool: true } 跳进 content，
	// cost 永远不会执行（content.js:3544），「你可以」会变成强制执行且没有任何取消入口
	filter(event, player) {
		return player.isIn();
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseBool("是否发动【麾号】？")
			.set("ai", () => 1)
			.forResult();
		event.result = res?.bool ? { bool: true } : { bool: false };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_huihao");
		await player.draw(1);
		if (!player.isIn()) return;
		// 「摸一用一」：只有发动技能那一步有取消，「用一」本身没有取消按钮；
		// 但摸完一张牌都用不出来时（连木牛里的也没有），「一」自然结束，不弹空面板
		if (!player.hasCard((card) => player.hasUseTarget(card), "hs")) return;
		const useRes = await player
			.chooseToUse({
				prompt: "麾号：请使用一张牌",
				forced: true,
				filterCard: (card, player2) => player2.hasUseTarget(card),
			})
			.forResult();
		if (!useRes?.bool) return;
		const usedCard = useRes.card;
		const suit = usedCard ? get.suit(usedCard, player) : null;
		if (!suit) return;
		// 「这些牌本回合可以当无次数限制的【杀】使用」的时限标记
		// （xiaobai_huihao_effect 必须定义在 subSkill 里，否则 addTempSkill 会被
		//  addSkill 的 `if (!info) return` 静默吃掉，slash 永不出现）
		player.addTempSkill("xiaobai_huihao_effect", "phaseAfter");
		// 「然后你令…」是强制的，没有第二次询问
		for (const current of game.filterPlayer((current2) => current2 != player)) {
			if (player.isDead()) return;
			if (!current.isIn()) continue;
			const hasSuit = current.countCards("he", (card) => get.suit(card, current) == suit) > 0;
			// 「两张花色不同的牌」要求区域内至少存在两个花色
			const hasTwoSuits = current.getCards("he").map((card) => get.suit(card, current)).unique().length >= 2;
			// 两项均不能执行：你摸两张牌（每名这样的角色各摸一次）
			if (!hasSuit && !hasTwoSuits) {
				await player.draw(2);
				continue;
			}
			const opts = [];
			if (hasSuit) opts.push("交给" + get.translation(player) + "一张" + get.translation(suit) + "牌");
			if (hasTwoSuits) opts.push("弃置两张花色不同的牌");
			// 「选择一项」是强制的：不加 cancel2（chooseControl 用数组参数时本来也不会自动补取消）
			const ctrl = await current
				.chooseControl(opts)
				.set("prompt", "麾号：请选择一项")
				.set("ai", () => (hasSuit ? 0 : 1))
				.forResult();
			if (!ctrl?.control) continue;
			if (ctrl.control.startsWith("交给")) {
				// 原生「交给」写法：chooseToGive 自己完成给予。
				// ⚠ gaintag 不能写在对象参数里：chooseToGive 在 Object.assign 之后还会执行 `next.gaintag = []`
				// （noname/library/element/player.js 的 chooseToGive 末尾），会把参数里的 gaintag 冲掉；
				// 但 content 会读 event.gaintag（content.js:5268 `event.done.gaintag.addArray(event.gaintag)`），所以用 .set 补上。
				await current
					.chooseToGive({
						target: player,
						position: "he",
						forced: true,
						selectCard: 1,
						prompt: "麾号：交给" + get.translation(player) + "一张" + get.translation(suit) + "牌",
						filterCard: (card) => get.suit(card, current) == suit,
					})
					.set("gaintag", ["xiaobai_huihao"]);
			} else {
				// 「弃置两张花色不同的牌」：complexCard + 与已选牌比花色（原生 umi_chaofan key.js:11715）
				const dis = await current
					.chooseToDiscard({
						position: "he",
						forced: true,
						selectCard: 2,
						complexCard: true,
						prompt: "麾号：弃置两张花色不同的牌，视为对" + get.translation(player) + "使用火【杀】",
						filterCard(card) {
							if (ui.selected.cards.length) return get.suit(card, current) != get.suit(ui.selected.cards[0]);
							return true;
						},
					})
					.forResult();
				if (dis?.bool && player.isIn()) {
					// 视为对你使用火【杀】（视为使用，不判距离）
					await current.useCard(get.autoViewAs({ name: "sha", nature: "fire", isCard: true }), player, "xiaobai_huihao");
				}
			}
		}
	},
	group: ["xiaobai_huihao_slash"],
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
				// 不计入次数限制：引擎只读 chooseToUse 事件上的 addCount（player.js:7356），
				// 写 event.result.addCount 是无效字段（原生范本 olxianzhu onlyOL/skill.js:2220）
				event.getParent().set("addCount", false);
			},
			ai: {
				order: 6,
				result: {
					player: 1,
				},
			},
		},
		// 「这些牌本回合可以当无次数限制的【杀】使用」的时限标记（必须真正定义）
		effect: {
			charlotte: true,
			sub: true,
		},
	},
	mod: {
		// 麾号杀无距离限制
		targetInRange(card, player, target) {
			if (card?.storage?.xiaobai_huihao) return true;
		},
		// 麾号杀无次数限制（原生 olxianzhu onlyOL/skill.js:2222）
		cardUsable(card, player, num) {
			if (card?.storage?.xiaobai_huihao) return Infinity;
		},
	},
	ai: {
		result: {
			player: 1,
		},
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
				.set("ai", (card) => 5 - get.value(card))
				.forResult();
			if (recast?.bool && recast.cards?.length) await player.recast(recast.cards);
		}
	},
	ai: {
		order: 5,
		result: { player: 1, target: -1 },
	},
},
// === 火宴 ===
// 牌面运行时才定（杀/桃/酒…）→ 走原生 chooseButton + backup 路线。
// 最贴近的先例是〖道转〗potdaozhuan（character/bingshi.js）：声明基本牌面 → 无素材 backup
// （filterCard:()=>false + selectCard:-1 + viewAs）→ precontent 里支付素材 → 引擎用牌。
// 三条别走的路：
// ① 顶层静态 viewAs：filterEnable 会拿它对当前窗口做合法性校验（濒死求桃窗只收桃 → 整个技能不显示）
// ② chooseButton 里 selectCard:0：0 是 falsy，precontent 永远进不去
// ③ 主 filter 里依赖 event.filterCard：backup 挂载后 event.filterCard 已被换成 backup 自己的
//    （本技能靠 filter 首行的"已选中技能则直接放行"绕过，同道转 filter 首行的 event.potdaozhuan）
xiaobai_huoyan: {
	audio: 2,
	// 印"使用"基本牌（无素材，牌面运行时才定）：出牌阶段使用窗 + 【杀】的闪响应窗 + 濒死求桃窗
	// 都可发动，目标（【杀】）/濒死者一律交给引擎的 filterTarget 处理，不再自己 chooseUseTarget
	enable: "chooseToUse",
	// hiddenCard：四个"开窗预检"的通行证（缺了它，杀/闪/桃窗口会在开窗前就把你当"没牌"跳过）。
	// 引擎链路（noname/library/element/player.js）：
	//   hasSha/hasShan → hasUsableCard(牌名, "use")      ← 2949 起
	//   canSave       → hasUsableCard(牌名, "all")       ← 2496 起
	//   hasWuxie      → 直接调 hiddenCard(player,"wuxie") ← 13470 起
	// hasUsableCard 的 hiddenCard 分支还额外要求「info.enable 命中当前窗口 + info.filter 通过」，
	// 本技能 enable 只有 chooseToUse ⇒ 打出窗（chooseToRespond）天然不算数，与描述"视为使用"一致
	hiddenCard(player, name) {
		// 只放行基本牌：【无懈可击】这类锦囊不放行（本技能只印基本牌，enable 也不含 chooseToRespond）
		if (get.type(name) != "basic") return false;
		if (player.hasSkill("xiaobai_huoyan_invalid")) return false;
		return game.hasPlayer((current) => lib.xiaobaiHuoyanCanMove(current, player));
	},
	// 候选牌面缓存到事件上（同〖拾昔〗clanshixi 的 event.clanshixi），
	// onChooseToUse 在 game.check() 之前跑，filter 与 dialog 共用同一份
	onChooseToUse(event) {
		if (event.xiaobai_huoyan || !event.player) return;
		const player = event.player;
		if (player.hasSkill("xiaobai_huoyan_invalid")) return;
		if (!game.hasPlayer((current) => lib.xiaobaiHuoyanCanMove(current, player))) return;
		// 当前使用窗能印哪些基本牌交给引擎判：event.filterCard 决定可印牌名
		// （出牌窗：闪/无懈这类非使用牌被拒；濒死求桃窗：只桃）
		const list = get.inpileVCardList((info) => {
			if (info[0] != "basic") return false;
			return event.filterCard(new lib.element.VCard({ name: info[2], nature: info[3], isCard: true }), player, event);
		});
		if (list.length) event.set("xiaobai_huoyan", list);
	},
	filter(event, player) {
		// 技能已点选后 backup 会接管 event.filterCard，这里不能再用它判
		if (event.skill == "xiaobai_huoyan" || event._skill == "xiaobai_huoyan") return true;
		return (event.xiaobai_huoyan || []).length > 0;
	},
	chooseButton: {
		// 形如原生〖道转〗potdaozhuan：inpileVCardList 的 [type,"",name,nature] 直接喂 vcard 按钮
		// （vcard 按钮只认 link[2]/link[3] 牌名与属性，card.init 把 link[0] 当花色，不影响）
		dialog(event, player) {
			return ui.create.dialog("火宴", [event.xiaobai_huoyan || [], "vcard"]);
		},
		filter(button, player) {
			const evt = get.event().getParent();
			return evt.filterCard(new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true }), player, evt);
		},
		check(button) {
			const evt = get.event().getParent();
			if (evt.type != "phase") return 1;
			return get.player().getUseValue(new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true }));
		},
		backup(links, player) {
			return {
				audio: "xiaobai_huoyan",
				// 无素材印牌三件套（filterCard + selectCard:-1 + viewAs，红线 21），同〖道转〗：
				// 选完牌面直接进引擎的目标步骤（杀弹目标、桃酒自用、濒死对濒死者），无需自己选目标
				filterCard: () => false,
				selectCard: -1,
				viewAs: {
					name: links[0][2],
					nature: links[0][3],
					isCard: true,
				},
				// 支付素材：把其他角色场上的一张牌移至你的场上（移动装备牌则本技能失效）
				async precontent(event, trigger, player2) {
					if (!(await lib.xiaobaiHuoyanPay(player2))) {
						event.result.bool = false;
					}
				},
			};
		},
		prompt(links) {
			return `###火宴###<div class="text center">将其他角色场上的一张牌移至你的场上，视为使用${get.translation(links[0][3]) || ""}【${get.translation(links[0][2])}】</div>`;
		},
	},
	// ⚠️ clear 不能放 group：disableSkill 会沿 group 级联禁用，恢复触发器会被一起禁死。
	// 改为 init 动态独立挂载。
	init(player) {
		player.addSkill("xiaobai_huoyan_clear");
	},
	onremove(player) {
		player.removeSkill("xiaobai_huoyan_clear");
	},
	subSkill: {
		clear: {
			// 失去装备牌（任意区域）→ 解除失效
			name: "火宴",
			charlotte: true,
			trigger: {
				player: ["loseAfter", "discardAfter"],
				global: ["loseAsyncAfter", "equipAfter", "addToExpansionAfter", "addJudgeAfter"],
			},
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (!player.hasSkill("xiaobai_huoyan_invalid")) return false;
				const cards = [];
				if (event.name == "lose") {
					// 直读 lose 事件分类字段（getlx=false 的附属失去 getl() 为空）
					cards.push(...(event.hs || []), ...(event.es || []), ...(event.js || []));
				} else if (event.name == "discard") {
					cards.push(...(event.cards || []));
				} else {
					const l = event.getl?.(player);
					if (l) cards.push(...(l.hs || []), ...(l.es || []), ...(l.js || []));
				}
				return cards.some((c) => get.type(c) == "equip");
			},
			content(event, trigger, player) {
				player.removeSkill("xiaobai_huoyan_invalid");
				game.log(player, "失去了装备牌，", "#g【火宴】", "恢复有效");
			},
		},
		invalid: {
			name: "火宴失效",
			charlotte: true,
			sub: true,
			onremove(player) {
				player.enableSkill("xiaobai_huoyan_invalid");
			},
		},
	},
	ai: {
		order: 6,
		// 开窗预检的第二道门：hasSha/hasShan 先查 hasSkillTag("respondSha"/"respondShan")、
		// canSave 先查 hasSkillTag("save")（player.js:13503/13525/2496），命中就直接放行，
		// 不必再走 hasUsableCard。这三个标签是"使用/打出"双用开关：
		//   respondSha/respondShan 的 arg 为 "use"/"respond"/"all"；save 的 arg 是濒死者 Player。
		// 本技能 enable 只挂 chooseToUse（覆盖闪响应窗 respondShan 与濒死窗 dying，但不覆盖
		// chooseToRespond 的"打出"窗）⇒ arg==="respond" 时拒掉。
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag, arg) {
			if (player.hasSkill("xiaobai_huoyan_invalid")) return false;
			if (!game.hasPlayer((current) => lib.xiaobaiHuoyanCanMove(current, player))) return false;
			// save 的 arg 是濒死者对象，只有 respondSha/respondShan 会传 "respond"
			if (arg === "respond") return false;
			return true;
		},
		result: { player: 1 },
	},
},
// === 狐趋 ===
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
		prompt(links, player) {
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
// === 鉴戒 ===
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
// === 金谷 ===
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
				return (event.cards || []).some((card) => get.position(card, true) == "d" && (get.name(card) == "sha" || get.name(card) == "shan"));
			},
			content(event, trigger, player) {
				player.storage.xiaobai_jingu_pool ??= [];
				for (const card of trigger.cards || []) {
					if (get.position(card, true) == "d" && (get.name(card) == "sha" || get.name(card) == "shan") && !player.storage.xiaobai_jingu_pool.includes(card)) {
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
				// 0 点伤害/被防止的伤害不算“受到过伤害”
				if (event.name == "damage") return !event.cancelled && event.num > 0;
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
// === 浸墨 ===
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
// === 进替 ===
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
// === 金围 ===
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
	check(trigger, player) {
		if (!trigger?.card) return false;
		if (get.name(trigger.card) == "shan") {
			// 无效敌人的闪（其将承受杀/万箭的伤害）
			return get.attitude(player, trigger.player) < 0;
		}
		// 该牌对使用者收益越高，无效它越划算；翻回正面（背面→正面）几乎白赚
		const target = trigger.targets?.[0] || trigger.player;
		const eff = -get.effect(target, trigger.card, trigger.player, player);
		return player.isTurnedOver() ? eff : eff - 2;
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
	// 「究典·赠予」是其他角色获得的入口，用 global 注册为全局技能：所有角色都能在出牌阶段赠予，
	// 但不进入任何角色的 player.skills ⇒ 不渲染进技能栏/技能描述（对齐原生〖问卦〗wengua → global: "wengua2"）
	global: "xiaobai_jiudian_gift",
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
// === 究典 ===
xiaobai_jiudian_gift: {
	audio: "xiaobai_jiudian",
	enable: "phaseUse",
	usable: 1,
	// ★ 必须声明「牌由技能自己处理」：useSkill 默认会把技能选中的牌
	//   `player.discard(cards)` 弃置（content.js:9565-9566 `if (info.discard != false && info.lose != false && !info.viewAs)`）。
	//   赠予的 content 已经 `player.give` 把牌送给目标了，若不声明，引擎会**再弃置一次** →
	//   牌进弃牌堆 → 被〖长河〗的 destroy 子技能销毁（用户报的「赠予也被销毁」）。
	//   原生 `_recasting`（重铸）就是同款写法：`discard: false, lose: false, delay: false`。
	discard: false,
	lose: false,
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
// === 咎征 ===
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
				check(card) {
					// AI 素材按价值差选：价值低于 4 的牌才值得垫进牌堆顶（自然控制张数）
					return 4 - get.value(card);
				},
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
			check(card) {
				// AI 转化材料按价值差选（优先消耗最不值钱的牌）
				return 6 - get.value(card);
			},
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
		// ⚠️ cost 是唯一的“是否发动”入口（带 cost 的触发技不再另发询问）——选牌**不能 forced**，
		// 取消按钮 = 拒绝发动（“你可以重铸一张牌”）；forced 会把「可以」变成「必须」
		const res = await player
			.chooseCard("he", "浚金：重铸一张牌")
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
	group: ["xiaobai_junjin_damage", "xiaobai_junjin_draw", "xiaobai_junjin_clear"],
	subSkill: {
		clear: {
			charlotte: true,
			sub: true,
			// “你本回合下次摸牌数+1”：限本回合——回合结束未消费即失效（旧实现会滚进下回合的首次摸牌）
			trigger: { global: "phaseAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.countMark("xiaobai_junjin") > 0;
			},
			content(event, trigger, player) {
				const n = player.countMark("xiaobai_junjin");
				player.removeMark("xiaobai_junjin", n, false);
			},
		},
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
// === 勘物 ===
xiaobai_kanwu: {
	audio: 2,
	mark: true,
	marktext: "勘",
	intro: {
		// 角标 = 本轮剩余可获得次数（0 时引擎不渲染角标，player.js:4717）
		markcount(storage, player) {
			return Math.max(0, (player.storage.xiaobai_kanwu_limit || 0) - (player.storage.xiaobai_kanwu_used || 0));
		},
		content(storage, player) {
			const suit = player.storage.xiaobai_kanwu_suit;
			const type = player.storage.xiaobai_kanwu_type;
			const limit = player.storage.xiaobai_kanwu_limit || 0;
			const used = player.storage.xiaobai_kanwu_used || 0;
			if (!limit || !suit || !type) return "本轮尚未勘出组合。";
			const typeNames = { basic: "基本牌", trick: "锦囊牌", equip: "装备牌", delay: "延时锦囊" };
			return (
				"本轮还剩" + (limit - used) + "次：花色为【" + get.translation(suit) +
				"】且类型为【" + (typeNames[type] || type) + "】的牌进入弃牌堆后，你可以获得之。"
			);
		},
	},
	// 每轮开始时：所有角色各弃一张（单循环一圈，无牌跳过），直到出现与此前弃牌“花色+类型”均相同的牌
	trigger: { global: "roundStart" },
	direct: true,
	filter(event, player) {
		return player.isIn() && game.hasPlayer((current) => current.countCards("he") > 0);
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_kanwu");
		// 从陆机上家开始轮流（座位链）；visited 保证每人至多弃一张
		let current = player.getPrevious() || player;
		const seenPairs = [];
		const visited = new Set();
		let total = 0;
		let stopCard = null;
		while (visited.size < game.players.length) {
			// 找下一个有牌且未弃过的角色
			let next = null;
			let probe = current;
			for (let i = 0; i < game.players.length; i++) {
				probe = probe.getNext();
				if (!visited.has(probe) && probe.countCards("he") > 0) {
					next = probe;
					break;
				}
			}
			if (!next) break;
			visited.add(next);
			current = next;
			const res = await current
				.chooseCard("he", true, 1, "勘物：你须弃置一张牌")
				.set("ai", (card) => 5 - get.value(card))
				.forResult();
			if (!res?.cards?.length) break;
			const card = res.cards[0];
			await current.discard([card]);
			total++;
			// “类型和花色相同的牌”= 花色+类型组合与此前某张弃牌完全一致 → 停止流程，该组合即本轮勘出的组合
			const pair = get.suit(card) + "|" + get.type(card, false);
			if (seenPairs.includes(pair)) {
				stopCard = card;
				break;
			}
			seenPairs.push(pair);
		}
		if (!stopCard) return;
		const suit = get.suit(stopCard);
		const type = get.type(stopCard, false);
		player.storage.xiaobai_kanwu_suit = suit;
		player.storage.xiaobai_kanwu_type = type;
		player.storage.xiaobai_kanwu_limit = total;
		player.storage.xiaobai_kanwu_used = 0;
		player.updateMarks("xiaobai_kanwu");
		// 终止牌本身就是第一张“符合这一组合”的牌且已进弃牌堆 → 按描述立即询问获得
		if (stopCard && get.position(stopCard, true) == "d" && player.isIn()) {
			const go = await player
				.chooseBool("勘物：是否获得" + get.translation(stopCard) + "？")
				.set("ai", () => get.value(stopCard) > 0)
				.forResult();
			if (go?.bool) {
				player.logSkill("xiaobai_kanwu");
				player.storage.xiaobai_kanwu_used = 1;
				player.updateMarks("xiaobai_kanwu");
				await player.gain([stopCard], "gain2");
			}
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
				const suit = player.storage.xiaobai_kanwu_suit;
				const type = player.storage.xiaobai_kanwu_type;
				if (!suit || !type) return false;
				return (event.cards || []).some((card) => get.position(card, true) == "d" && get.suit(card) == suit && get.type(card, false) == type);
			},
			async content(event, trigger, player) {
				const suit = player.storage.xiaobai_kanwu_suit;
				const type = player.storage.xiaobai_kanwu_type;
				const matches = (trigger.cards || []).filter((card) => get.position(card, true) == "d" && get.suit(card) == suit && get.type(card, false) == type);
				for (const card of matches) {
					if ((player.storage.xiaobai_kanwu_used || 0) >= (player.storage.xiaobai_kanwu_limit || 0)) break;
					const go = await player
						.chooseBool("勘物：是否获得" + get.translation(card) + "？")
						.set("ai", () => get.value(card) > 0)
						.forResult();
					if (!go?.bool) continue;
					player.logSkill("xiaobai_kanwu");
					player.storage.xiaobai_kanwu_used = (player.storage.xiaobai_kanwu_used || 0) + 1;
					player.updateMarks("xiaobai_kanwu");
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
				player.storage.xiaobai_kanwu_suit = null;
				player.storage.xiaobai_kanwu_type = null;
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
// === 恳言 ===
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
	enable: "chooseToUse",
	// hiddenCard：恳言印的是"本回合上一张用过的基本牌/普通锦囊"（运行时才定，可能是【闪】/【桃】/【酒】/【无懈】）
	// ⇒ 必须按当前 source.name 喂预检，否则闪窗(hasShan)/濒死窗(canSave)/无懈窗(hasWuxie)都会在开窗前跳过
	hiddenCard(player, name) {
		const info = player.storage.xiaobai_kenyan_source;
		if (!info?.name || info.name !== name || !player.isIn()) return false;
		const need = (player.storage.xiaobai_kenyan_times || 0) + 1;
		if (need > 3) return false;
		return player.countCards("h", (card) => lib.xiaobaiKenyanMatch(card, player, info) >= need) > 0;
	},
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
					const card = event.result.cards?.[0];
					if (!card) return;
					player.logSkill("xiaobai_kenyan");
					player.storage.xiaobai_kenyan_times = (player.storage.xiaobai_kenyan_times || 0) + 1;
					await player.showCards([card], "恳言：展示并置于牌堆顶");
					await game.cardsGotoPile([card], "insert");
					event.result.cards = [];
					// 无次数限制：addCount 挂在选择事件（chooseToUse）上，useResult 只读 event.addCount
					const useEvent = event.getParent("chooseToUse");
					if (useEvent?.name == "chooseToUse") useEvent.addCount = false;
				},
			};
		},
		prompt(links, player) {
			const info = player.storage.xiaobai_kenyan_source;
			return "恳言：展示一张手牌置于牌堆顶，视为使用【" + get.translation(info.name) + "】";
		},
	},
	// useSkill 兜底：chooseToUse 收尾时若结果缺 card，会走 useResult→player.useSkill（content.js:7373），
	// 而 useSkill **无条件**读取 info.content 建技能事件（content.js:9924）；没有 content 时子事件已入队但
	// 未挂 content → 运行到 gameEvent.js:232 报 this.content is not a function（父事件正是 useSkill）。
	// 本技能正常走 chooseButton.backup 的 precontent，不会到这里；这里只补一条等价结算路径。
	async content(event, trigger, player) {
		const info = player.storage.xiaobai_kenyan_source;
		if (!info?.name) return;
		// useSkill 已先把选中的素材移出手牌（本技能顶层无 viewAs → 弃置），按仍在场上的牌兜底
		const cards = (event.cards || []).filter((card) => ["h", "d", "s"].includes(get.position(card, true)));
		if (!cards.length) return;
		player.storage.xiaobai_kenyan_times = (player.storage.xiaobai_kenyan_times || 0) + 1;
		await player.showCards(cards, "恳言：展示并置于牌堆顶");
		await game.cardsGotoPile(cards, "insert");
		// 素材已离开手牌，虚拟牌不带底牌（与正常路径 precontent 清空 result.cards 一致）
		await player.useCard(get.autoViewAs({ name: info.name, isCard: true, storage: { xiaobai_kenyan: true } }), [], event.targets || []);
	},
	group: ["xiaobai_kenyan_record", "xiaobai_kenyan_clear"],
	onremove(player) {
		delete player.storage.xiaobai_kenyan_source;
		delete player.storage.xiaobai_kenyan_times;
	},
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
			// source = "本回合上一张" → 随回合清；times = "本轮发动次数" → 随轮清
			trigger: {
				player: ["phaseBeginStart", "phaseAfter"],
				global: "roundStart",
			},
			forced: true,
			popup: false,
			silent: true,
			filter(event, player, name) {
				if (name == "roundStart") return (player.storage.xiaobai_kenyan_times || 0) > 0;
				return !!player.storage.xiaobai_kenyan_source;
			},
			content(event, trigger, player) {
				if (event.triggername == "roundStart") {
					player.storage.xiaobai_kenyan_times = 0;
				} else {
					player.storage.xiaobai_kenyan_source = null;
				}
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
// === 览赋 ===
// 览赋
xiaobai_lanfu: {
	audio: 2,
	// 手牌数不为全场最多：有锦囊牌被弃置后，置牌堆底并摸一张
	// 只认"被弃置"（discard 事件），不含锦囊使用结算后自行进入弃牌堆
	trigger: { global: "discardAfter" },
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
			await game.cardsGotoPile(cards); // 无参 = 牌堆底
			game.log(player, "将", cards, "置于牌堆底");
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
// === 垒城 ===
xiaobai_leicheng: {
	audio: 2,
	trigger: { player: "useCard" },
	filter(event, player) {
		if (get.type(event.card) != "equip") return false;
		// 两项都不可行则不发动，不弹询问：选项1需有"上一名使用装备牌的角色"且其场上有牌；
		// 选项2"摸至四张"仅手牌<4时有意义（手牌≥4摸0张还白挂弃牌标记）
		const last = player.storage.xiaobai_leicheng_last;
		const canYiyi = last?.isIn() && last.countCards("he") > 0;
		const canDraw = player.countCards("h") < 4;
		return canYiyi || canDraw;
	},
	async cost(event, trigger, player) {
		const options = [];
		const last = player.storage.xiaobai_leicheng_last;
		if (last?.isIn() && last.countCards("he") > 0) options.push("将其一张牌当【以逸待劳】对你使用");
		if (player.countCards("h") < 4) options.push("摸至四张牌，然后有角色下次使用装备时，其弃置你一张手牌");
		if (!options.length) return void (event.result = { bool: false }); // filter 已挡，双保险
		// 选择框（chooseButton+textbutton），而不是底部一排按钮
		const ctrl = await player
			.chooseButton(["垒城：请选择一项", [options.map((item, i) => [i, item]), "textbutton"]])
			.set("ai", (button) => {
				// 按文案判项（两项不同时在场，用下标算会错位）：摸至四张=净赚恒选；
				// 【以逸待劳】是拿对方牌换自己吃锦囊，手牌充足才值得
				const text = options[button.link];
				if (text.startsWith("摸至")) return 10;
				return player.countCards("h") < 4 ? 0 : 10;
			})
			.forResult();
		const index = ctrl?.links?.[0];
		if (!ctrl?.bool || typeof index != "number") return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { choice: options[index] } };
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
// === 量忠 ===
xiaobai_liangzhong: {
	audio: 2,
	trigger: { source: "damageBegin2", player: "damageBegin2" },
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
// === 连帜 ===
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
// === 列合 ===
xiaobai_liehe: {
	audio: 2,
	trigger: { global: "phaseAfter" },
	filter(event, player) {
		if (!player.isIn()) return false;
		// 你本回合失去过牌，且你或当前回合角色至少有一项"能做到又能拉平"的事——
		// 两个都做不到就不弹"是否发动"的空询问
		return player.getHistory("lose").length > 0 && lib.xiaobaiLiehePlan(player, event.player).length > 0;
	},
	async content(event, trigger, player) {
		// 技能事件的 event.player 恒为技能拥有者（game/index.js:5593 createTrigger 的
		// next.player=player），取"当前回合角色"必须读 trigger.player
		const to = trigger.player;
		const plan = lib.xiaobaiLiehePlan(player, to);
		if (!plan.length) return; // filter 已判过，双保险
		// 候选来自 1~2 个执行者，每个执行者最多 3 项 ⇒ 合并成一个按钮框，一次选中即止；
		// 文案已写明是谁做哪一项，不必再分两步问"谁执行"再问"哪一项"。
		const buttons = [];
		for (const info of plan) {
			for (const op of info.ops) {
				buttons.push([lib.xiaobaiLieheKey(info.player, op), lib.xiaobaiLieheText(info.player, op)]);
			}
		}
		const result = await player
			.chooseButton(["列合：选择一项执行，使双方装备区牌数相等", [buttons, "textbutton"]])
			.set("selectButton", [1, 1])
			.set("ai", (button) => {
				// 只有一项时不必犹豫；多项时让"自己得利"优先
				const [pid, op] = String(button.link).split("_");
				const X = game.players.find((current) => String(current.playerid) == pid);
				if (!X) return 0;
				if (Number(op) == 1) return X == player ? 3.2 : 1.2;
				if (Number(op) == 2) return X == player ? -1 : 1.4;
				return X == player ? -0.6 : 1.8;
			})
			.forResult();
		const link = result?.links?.[0];
		if (!link) return;
		player.logSkill("xiaobai_liehe");
		const [pid, opText] = String(link).split("_");
		const X = game.players.find((current) => String(current.playerid) == pid);
		const Y = X == player ? to : player;
		const op = Number(opText);
		if (!X?.isIn()) return;
		if (op == 1) {
			// 使用一张装备牌
			const res = await X.chooseCard("h", true, 1, "列合：请使用一张装备牌", (card) => X.canEquip(card, false)).forResult();
			if (res?.cards?.length) {
				const card = res.cards[0];
				if (X.canUse(card, X, false)) await X.useCard(card, [card], X, "xiaobai_liehe");
				else await X.chooseUseTarget(card, true).forResult();
			}
		} else if (op == 2) {
			// 收回自己装备区的一张装备牌
			const res = await X.chooseCard("e", true, 1, "列合：选择收回自己装备区的一张牌").forResult();
			if (res?.cards?.length) await X.gain(res.cards, "gain2");
		} else if (op == 3) {
			// 将自己装备区的一张装备牌移给对方
			await X.moveCard({
				prompt: `列合：将你装备区的一张牌移至${get.translation(Y)}的装备区`,
				nojudge: true,
				sourceTargets: [X],
				aimTargets: [Y],
			});
		}
	},
	ai: {
		result: {
			player: 1,
		},
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
// === 离光 ===
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
// === 遴才 ===
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
// === 凛脊 ===
xiaobai_linji: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { player: "changeHpBefore" },
	filter(event, player) {
		// 每回合只触发一次（被"防止"掉也算触发过）：标记在 content 里打，回合开始时清
		if (player.storage.xiaobai_linji_used || !player.isIn()) return false;
		// 护甲全挡 / 零变化时体力其实不会变，不该触发（否则对方白丢两张牌）。
		// 护甲抵扣是 changeHp 的 content 里做的（content.js:11327），Before 时机要自己预判。
		let num = event.num || 0;
		const parent = event.getParent?.();
		if (num < 0 && player.hujia > 0 && parent?.name == "damage" && !player.hasSkillTag("nohujia") && !parent.nohujia) {
			num += Math.min(-num, player.hujia);
		}
		if (!num) return false;
		const current = _status.currentPhase;
		return Boolean(current?.isIn() && current.countCards("he") >= 2);
	},
	async content(event, trigger, player) {
		player.storage.xiaobai_linji_used = true;
		const current = _status.currentPhase;
		if (!current?.isIn()) return;
		const res = await current.chooseCard("he", true, 2, "凛脊：将两张牌置于牌堆顶或牌堆底").forResult();
		const cards = res?.cards || [];
		if (cards.length < 2) return;
		const pos = await current
			.chooseControl("置于牌堆顶", "置于牌堆底")
			.set("prompt", "凛脊：选择置入端")
			// 放牌堆底 = 近期摸不到（适合处理烂牌）；放牌堆顶 = 马上会再摸到（适合留好牌）。
			// 所以按这两张牌的实际价值决定，而不是恒定选第一项。
			.set("ai", () => {
				const good = cards.filter((card) => get.value(card, current) >= 5).length;
				return good * 2 >= cards.length ? 0 : 1;
			})
			.forResult();
		const toTop = pos?.control != "置于牌堆底";
		// 置入牌堆要走 lose 才会派发「失去牌」事件（原生范本：问卦 yijiang.js:4053）
		if (toTop) {
			await current.lose(cards, ui.cardPile, "insert");
		} else {
			await current.lose(cards, ui.cardPile);
		}
		game.log(current, "将两张牌置于了牌堆" + (toTop ? "顶" : "底"));
		if (!current.isIn()) return;
		// 「可以从另一端摸两张牌，防止此体力变化」是一个整体的「可以」
		const go = await current
			.chooseBool("凛脊：是否从牌堆" + (toTop ? "底" : "顶") + "摸两张牌，防止" + get.translation(player) + "本次体力变化？")
			.set("ai", () => true)
			.forResult();
		if (!go?.bool) return;
		if (toTop) {
			await current.draw(2, "bottom");
		} else {
			await current.draw(2);
		}
		// 只防止"体力变化"本身：cancel 掉 changeHp 事件（其 content 才会改 hp）
		trigger.cancel();
		game.log(player, "本次体力变化被防止了");
	},
	group: ["xiaobai_linji_clear"],
	subSkill: {
		// 每回合开始时清掉「本回合已触发」标记（描述是每回合首次，不是每轮）
		clear: {
			charlotte: true,
			sub: true,
			trigger: { global: "phaseBefore" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return Boolean(player.storage.xiaobai_linji_used);
			},
			content(event, trigger, player) {
				player.storage.xiaobai_linji_used = false;
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
// === 流玉 ===
// 「中央区」替代口径：本回合弃牌堆 = 本回合内进入弃牌堆、当前仍在弃牌堆的牌（helpers.getTurnDiscardCards，坑清单 #51）。
// 「变为相等」判定：检查器子技能以 lastDo 在每次牌移动派发末尾记账上一次状态（原生 collab.js 烈身同款），
// 主技能 filter 比较「当前相等 && 上次不相等」→ 只在跳变瞬间询问，两者持续相等不重复弹窗。
xiaobai_liuyu: {
	audio: 2,
	round: 1,
	mark: true,
	marktext: "玉",
	intro: {
		name: "流玉",
		// 角标数字 = 本回合弃牌堆张数（storage 即牌面数组；变化后由检查器 updateMarks 刷新，0 自动隐藏）
		markcount(storage) {
			return storage?.length || 0;
		},
		// 悬浮 = 本回合弃牌堆全部牌面 + 状态行（原生 intro.mark 函数钩子，计霖 extra.js:321「志」同款；
		// 悬浮内容悬停时实时求值，无需手动刷新）
		mark(dialog, storage, player) {
			const cards = Array.isArray(storage) ? storage : [];
			const num = player.countCards("h");
			if (cards.length) {
				dialog.addAuto(cards);
			} else {
				dialog.addText("本回合暂无牌进入弃牌堆。");
			}
			let str = `本回合弃牌堆${cards.length}张；你的手牌${num}张。`;
			if (player.storage.xiaobai_liuyu_roundcount == game.roundNumber) {
				str += "<br>本轮已发动。";
			} else if (cards.length > 0 && num == cards.length) {
				str += "<br>两者相等，可以发动。";
			}
			return str;
		},
	},
	trigger: {
		player: ["loseAfter", "discardAfter", "gainAfter", "drawEnd"],
		global: [
			"loseAfter",
			"discardAfter",
			"gainAfter",
			"drawEnd",
			"cardsDiscardAfter",
			"loseAsyncAfter",
			"loseToDiscardpileAfter",
			"equipAfter",
			"addJudgeAfter",
			"addToExpansionAfter",
		],
	},
	filter(event, player) {
		if (!player.isIn()) return false;
		const count = getTurnDiscardCards().length;
		if (!(count > 0) || player.countCards("h") != count) return false;
		// 检查器是 lastDo（同一次派发里在主技能之后才跑），这里读到的 storage 是上一次派发末尾的状态
		return player.storage.xiaobai_liuyu_equal !== true;
	},
	async cost(event, trigger, player) {
		const pool = lib.getTurnDiscardCards();
		const hand = player.getCards("h");
		if (!pool.length || pool.length != hand.length) {
			event.result = { bool: false };
			return;
		}
		const gain = pool.reduce((sum, card) => sum + get.value(card, player), 0);
		const loss = hand.reduce((sum, card) => sum + get.value(card, player), 0);
		const current = _status.currentPhase;
		// 视为使用【桃】/【无中生有】是强制的：目标为敌对当前回合角色时这是本技能的代价，AI 按态度折价
		let gift = 3; // 当前回合角色是自己 → 纯收益
		if (current && current != player && current.isIn()) {
			gift = get.attitude(player, current) > 0 ? 2 : -3;
		}
		const res = await player
			.chooseBool(
				`流玉：是否交换你的手牌（${hand.length}张）与本回合弃牌堆（${pool.length}张）？交换后视为对当前回合角色使用【桃】或【无中生有】`
			)
			.set("ai", () => gain + gift > loss)
			.forResult();
		event.result = { bool: Boolean(res?.bool) };
	},
	async content(event, trigger, player) {
		// 必须先取池再弃手牌：弃掉的手牌同样计入本回合弃牌堆，顺序反了会把自己刚弃的牌摸回来
		const pool = lib.getTurnDiscardCards();
		const hand = player.getCards("h");
		if (!pool.length || !hand.length || pool.length != hand.length) return;
		await player.gain(pool, "gain2");
		await player.discard(hand);
		const current = _status.currentPhase;
		if (!current?.isIn()) return;
		// 桃的可用性判定：目标（当前回合角色）受伤（体力<上限，濒死亦满足）时才有回复效果；
		// 满血时该选项不提供，只剩无中生有则无需询问直接使用
		const list = [];
		if (current.isDamaged()) list.push(["basic", "", "tao"]);
		list.push(["trick", "", "wuzhong"]);
		let name = "wuzhong";
		if (list.length > 1) {
			const res = await player
				.chooseButton([`流玉：视为对${get.translation(current)}使用一张牌`, [list, "vcard"]], true)
				.set("ai", (button) => {
					const isTao = button.link[2] == "tao";
					// 友方/自己：受伤给桃回血、满血给无中生有；敌方：给桃（回1血优于摸两张）
					if (current == player || get.attitude(player, current) > 0) {
						return isTao ? (current.isDamaged() ? 6 : 0) : (current.isDamaged() ? 4 : 6);
					}
					return isTao ? 6 : 1;
				})
				.forResult();
			name = res?.links?.[0]?.[2] || "wuzhong";
		}
		// 纯虚拟印牌，底牌显式给空数组（硬红线 20）
		await player.useCard(get.autoViewAs({ name }, []), [], [current], "xiaobai_liuyu");
		// 其（当前回合角色）不为你，你可以移动场上一张牌至你的区域（引擎 moveCard：目标限定为自己）
		if (current != player) {
			await player.moveCard(false, game.filterPlayer(), player, "流玉：是否移动场上一张牌至你的区域？");
		}
	},
	group: ["xiaobai_liuyu_check"],
	subSkill: {
		// 状态检查器：lastDo = 在每次牌移动派发的所有技能结算完后运行，把「手牌数==本回合弃牌堆数」
		// 记进 storage 供主技能下一次 filter 做「变为相等」跳变判定；死亡也继续记账（派发含 dead 玩家）。
		check: {
			charlotte: true,
			sub: true,
			forced: true,
			silent: true,
			popup: false,
			lastDo: true,
			trigger: {
				player: ["loseAfter", "discardAfter", "gainAfter", "drawEnd"],
				global: [
					"loseAfter",
					"discardAfter",
					"gainAfter",
					"drawEnd",
					"cardsDiscardAfter",
					"loseAsyncAfter",
					"loseToDiscardpileAfter",
					"equipAfter",
					"addJudgeAfter",
					"addToExpansionAfter",
				],
			},
			async content(event, trigger, player) {
				const cards = lib.getTurnDiscardCards();
				// storage.xiaobai_liuyu = 本回合弃牌堆牌面数组（markcount 数字 + mark 悬浮牌面的数据源）
				player.storage.xiaobai_liuyu = cards;
				player.storage.xiaobai_liuyu_equal = cards.length > 0 && player.countCards("h") == cards.length;
				// 角标数字随 storage 重算（悬浮文案是悬停时实时求值的，不用刷）
				player.updateMarks();
			},
		},
	},
},
// === 掠都 ===
xiaobai_luedu: {
	audio: 2,
	mark: true,
	marktext: "掠",
	intro: {
		content(storage, player) {
			// 引擎 round 机制：发动时记录 _roundcount=当前轮号，本轮内 roundcount==roundNumber；枉恶 refreshSkill 后回落未发动
			return player.storage.xiaobai_luedu_roundcount == game.roundNumber ? "本轮已发动。" : "本轮未发动。";
		},
	},
	// 每轮限一次，其他角色的结束阶段
	round: 1,
	trigger: { global: "phaseJieshuEnd" },
	filter(event, player) {
		if (!player.isIn() || player.countCards("he") == 0 || event.player == player) return false;
		const target = event.player;
		// 【火攻】与【趁火打劫】的目标都须有手牌——目标没手牌时不可发动
		if (target.countCards("h") == 0) return false;
		return (
			player.canUse({ name: "huogong", isCard: true }, target, true, false) ||
			player.canUse({ name: "chenghuodajie", isCard: true }, target, true, false)
		);
	},
	async cost(event, trigger, player) {
		const target = trigger.player; // 当前回合角色（cost 事件的 event.player 是张方自己）
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
		const { cards, target } = event.cost_data;
		await player.recast(cards);
		if (!player.isIn() || !target.isIn()) {
			return;
		}
		// 记录重铸花色；跟踪窗口从重铸后开启（重铸本身的弃置/摸牌不算"因此获得或弃置"）
		const suits = [...new Set(cards.map((card) => get.suit(card, player)))];
		player.storage.xiaobai_luedu_suits = suits;
		player.storage.xiaobai_luedu_matched = false;
		player.storage.xiaobai_luedu_tracking = true;
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
			// 选牌面而非文字选项（矫诏 refresh.js:5624 同款 vcard 按钮，第二参 true=必选）
			const list = options.map((name) => ["锦囊", "", name]);
			const ctrl = await player
				.chooseButton(["掠都：请选择视为使用的牌", [list, "vcard"]], true)
				.set("ai", (button) => get.effect(target, { name: button.link[2], isCard: true }, player, player))
				.forResult();
			firstName = ctrl?.links?.[0]?.[2];
		}
		// 目标与底牌都要显式传：useCard(vcard, 底牌, 目标, 技能id)
		await player.useCard(get.autoViewAs({ name: firstName }, []), [], [target], "xiaobai_luedu").set("addCount", false);
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
					await player.useCard(get.autoViewAs({ name: otherName }, []), [], [target], "xiaobai_luedu").set("addCount", false);
				}
			}
		}
		player.storage.xiaobai_luedu_suits = null;
	},
	group: ["xiaobai_luedu_track"],
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
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// === 履骨 ===
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
			.set("ai", () => {
				// AI：两项都可行优先背水；单可行按对应项执行，而非恒取消
				if (canDamage && canDraw) return "背水";
				if (canDamage) return "选项一";
				if (canDraw) return "选项二";
				return "cancel2";
			})
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
// === 美谏 ===
xiaobai_meijian: {
	audio: 2,
	trigger: { global: ["loseAfter", "gainAfter", "loseAsyncAfter"] },
	filter(event, player) {
		if (!player.isIn()) return false;
		if (player.hasSkill("xiaobai_meijian_used")) return false;
		const moved = lib.skill.xiaobai_meijian.getMoved(event, player);
		return moved.some((current) => current.isIn() && lib.skill.xiaobai_meijian.isExtreme(current) > 0);
	},
	check(event, player) {
		// AI：自己要弃牌且目标是敌人=白弃甚至资敌，不发动；其余（自己摸牌/目标弃牌/友方）可发动
		const target = lib.skill.xiaobai_meijian.getMoved(event, player).find(
			(current) => current.isIn() && lib.skill.xiaobai_meijian.isExtreme(current) > 0
		);
		if (!target) return false;
		const targetNum = lib.skill.xiaobai_meijian.countAt(lib.skill.xiaobai_meijian.isExtreme(target) == 2 ? "max" : "min");
		const myDiff = player.countCards("h") - targetNum;
		if (myDiff < 0) return true;
		if (myDiff > 0) return get.attitude(player, target) >= 0;
		const toDiff = target.countCards("h") - targetNum;
		return toDiff > 0 ? get.attitude(player, target) < 0 : get.attitude(player, target) > 0;
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
// === 墨撰 ===
xiaobai_mozhuan: {
	audio: 2,
	mark: true,
	marktext: "墨",
	intro: {
		// 标记数字 = 当前处于第几项（①~④）
		markcount(storage) {
			return ((((storage || 0) % 4) + 4) % 4) + 1;
		},
		content(storage) {
			const state = ((((storage || 0) % 4) + 4) % 4);
			return "当前第" + get.cnNumber(state + 1) + "项：【" + xiaobaiMozhuanLabels[state] + "】。发动后前进至下一项；本次所需材料数 = 跨越的项数 + 1。";
		},
	},
	init(player) {
		if (!Number.isInteger(player.storage.xiaobai_mozhuan)) {
			player.storage.xiaobai_mozhuan = 0;
		}
	},
	enable: ["chooseToUse", "chooseToRespond"],
	hiddenCard(player, name) {
		const idx = xiaobaiMozhuanNames.indexOf(name);
		return idx >= 0 && xiaobaiMozhuanCount(player) >= xiaobaiMozhuanCost(player, idx);
	},
	filter(event, player) {
		if (event.type == "wuxie") {
			return false;
		}
		// 点技能按钮后引擎会以 event.skill=本技能 复检可用性（此时 filterCard 已被 backup 清空），
		// 只做基础材料判定；具体牌面交给 chooseButton.dialog（与 filter 同源）
		if (event.skill == "xiaobai_mozhuan" || event._skill == "xiaobai_mozhuan") {
			return xiaobaiMozhuanCount(player) > 0;
		}
		return xiaobaiMozhuanCandidates(event, player).length > 0;
	},
	chooseButton: {
		// 牌面列表与 filter 同源（#63）：只列「材料够 + 当前请求窗口下 filterCard 通过」的项
		dialog(event, player) {
			const list = xiaobaiMozhuanCandidates(event, player);
			return ui.create.dialog("墨撰：视为使用或打出一张基本牌", [list, "vcard"], "hidden");
		},
		check(button) {
			if (_status.event.getParent().type != "phase") {
				return 1;
			}
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2], isCard: true }), null, true);
		},
		// 转化版：消耗 X+1 张实体材料牌（黑色牌或非基本牌），viewAs 产出虚拟基本牌
		backup(links, player) {
			const idx = xiaobaiMozhuanNames.indexOf(links[0][2]);
			return {
				audio: "xiaobai_mozhuan",
				filterCard: xiaobaiMozhuanMaterial,
				selectCard: xiaobaiMozhuanCost(player, idx),
				position: "hes",
				viewAs: { name: links[0][2], isCard: true },
				popname: true,
				async precontent(event, trigger, player2) {
					if (!event.result?.bool || !event.result.card || !event.result.cards?.length) {
						return;
					}
					player2.logSkill("xiaobai_mozhuan");
					// 材料均为黑色非基本牌 → 结算后令一名角色获得一张【影】
					// （标记打在转化出的虚拟牌上，useCardAfter / respondAfter 时从 event.card 读回）
					const mats = event.result.cards;
					if (mats.every((card) => get.color(card) == "black" && get.type(card) != "basic")) {
						if (!event.result.card.storage) {
							event.result.card.storage = {};
						}
						event.result.card.storage.xiaobai_mozhuan_ying = true;
					}
				},
			};
		},
		prompt(links, player) {
			const idx = xiaobaiMozhuanNames.indexOf(links[0][2]);
			return "墨撰：将" + get.cnNumber(xiaobaiMozhuanCost(player, idx)) + "张黑色牌或非基本牌当【" + get.translation(links[0][2]) + "】使用或打出";
		},
	},
	group: ["xiaobai_mozhuan_after"],
	subSkill: {
		after: {
			audio: "xiaobai_mozhuan",
			charlotte: true,
			sub: true,
			name: "墨撰",
			direct: true,
			trigger: { player: ["useCardAfter", "respondAfter"] },
			filter(event, player) {
				return event.skill == "xiaobai_mozhuan_backup" && player.isIn();
			},
			async content(event, trigger, player) {
				// 转换技：使用或打出后前进至下一项（④后回到①）
				player.storage.xiaobai_mozhuan = (lib.xiaobaiMozhuanState(player) + 1) % 4;
				player.updateMarks("xiaobai_mozhuan");
				// 材料均为黑色非基本牌 → 令一名角色获得一张【影】
				if (!trigger.card?.storage?.xiaobai_mozhuan_ying) {
					return;
				}
				const res = await player
					.chooseTarget("墨撰：令一名角色获得一张【影】", 1, (card, player2, targetx) => targetx.isIn())
					.set("forced", true)
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
		// #61/#62：印牌源是「任意黑色牌或非基本牌」而不是手牌里的同名实体牌，
		// 引擎开询问前的预检（杀结算 hasShan()、濒死循环 canSave()、hasSha()）只扫手牌同名实体牌，
		// 不补这三个标签 → 闪响应 / 濒死求桃 / 决斗南蛮的打出窗口会被整体跳过（连询问都不弹）
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag) {
			if (tag === "respondSha") {
				return lib.skill.xiaobai_mozhuan.hiddenCard(player, "sha");
			}
			if (tag === "respondShan") {
				return lib.skill.xiaobai_mozhuan.hiddenCard(player, "shan");
			}
			if (tag === "save") {
				return lib.skill.xiaobai_mozhuan.hiddenCard(player, "tao");
			}
			return false;
		},
	},
},
// === 辇幸 ===
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
	// 喂杀结算 hasShan/hasWuxie 预检（引擎只读技能顶层 hiddenCard）
	hiddenCard(player, name) {
		if (name != "shan" && name != "wuxie") return false;
		if (player.hasSkill("xiaobai_nianxing_used")) return false;
		if (name == "wuxie" && player.storage.xiaobai_nianxing_jink) return false;
		return player.countCards("he", (card) => get.type(card) == "equip") > 0;
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
		respondShan: true,
		skillTagFilter(player, tag) {
			if (tag != "respondShan") return false;
			return player.countCards("he", (card) => get.type(card) == "equip") > 0 && !player.hasSkill("xiaobai_nianxing_used");
		},
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
// === 霓裳 ===
xiaobai_nichang: {
	audio: 2,
	enable: "chooseToUse",
	mark: true,
	marktext: "♥",
	init(player, skill) {
		// 花色轮转队列（队头 = 当前转换项）；获得技能时重置为初始顺序——对齐 FreeKill addAcquireEffect
		if (!Array.isArray(player.storage[skill])) {
			player.storage[skill] = ["heart", "spade", "club", "diamond"];
		}
	},
	onremove(player, skill) {
		delete player.storage[skill];
		delete player.storage.xiaobai_nichang_used;
	},
	intro: {
		content(storage) {
			if (!Array.isArray(storage) || !storage.length) return "花色顺序已删空。";
			return `花色顺序：${storage.map((s) => lib.xiaobaiNichangSuitChar(s)).join(" ")}。当前转换项：${lib.xiaobaiNichangSuitChar(storage[0])}`;
		},
		// 角标显示 X = 当前手牌的花色数（**不是** storage 数组长度＝剩余花色数）。
		// ⚠️ 不写 markcount 时，mark:true 且 storage 为数组 ⇒ 引擎默认角标取 storage.length（player.js:4710-4711）。
		// 手牌变化时引擎会走 player.update() → updateMarks() 重算，所以角标实时刷新。
		markcount(storage, player) {
			return lib.xiaobaiNichangHandSuits(player).length;
		},
	},
	filter(event, player) {
		// 「当你需使用基本牌时」——出牌阶段 + 闪响应（type=respondShan）+ 濒死求桃（type=dying）三者都走 chooseToUse，
		// 所以这里不写任何 type 拦截（旧版按 FreeKill enabled_at_response = not response 只放行出牌阶段，
		// 会把上面两个响应/濒死窗口一起拦掉）。「打出」走 chooseToRespond，由 enable 只写 chooseToUse 天然排除。
		const queue = player.storage.xiaobai_nichang;
		if (!Array.isArray(queue) || !queue.length) return false;
		return (
			get.inpileVCardList((info) => {
				if (info[0] != "basic") return false;
				return event.filterCard(new lib.element.VCard({ name: info[2], nature: info[3], isCard: true }), player, event);
			}).length > 0
		);
	},
	hiddenCard(player, name) {
		if (get.type(name) != "basic") return false;
		const queue = player.storage.xiaobai_nichang;
		return Array.isArray(queue) && queue.length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			const list = get.inpileVCardList((info) => {
				if (info[0] != "basic") return false;
				return event.filterCard(new lib.element.VCard({ name: info[2], nature: info[3], isCard: true }), player, event);
			});
			return ui.create.dialog("霓裳：声明你要使用的牌和目标，然后重铸对应花色的牌以视为使用之", [list, "vcard"], "hidden");
		},
		check(button) {
			const player = get.player();
			return player.getUseValue(new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true }));
		},
		backup(links, player) {
			return {
				audio: "xiaobai_nichang",
				filterCard: () => false,
				selectCard: 0,
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true },
				async precontent(event, trigger, player) {
					// 取消重铸 → 本次使用作废，但必须保持 bool=true + cancel，让引擎 goto(0) 回到用牌询问；
					// 不能写 bool=false——那会让 chooseToUse 以"取消"收场，出牌阶段循环会直接结束出牌阶段
					if (!(await lib.xiaobaiNichangRecast(player))) event.result.cancel = true;
				},
			};
		},
		prompt(links) {
			return "霓裳：声明" + (links[0][3] ? get.translation(links[0][3]) : "") + "【" + get.translation(links[0][2]) + "】并重铸对应花色的牌以视为使用之";
		},
	},
	group: ["xiaobai_nichang_round", "xiaobai_nichang_use"],
	subSkill: {
		round: {
			// 每轮开始：清空「以此法使用」的计数（第四次翻面的判定用）
			name: "霓裳",
			charlotte: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.storage.xiaobai_nichang_used != void 0;
			},
			content(event, trigger, player) {
				delete player.storage.xiaobai_nichang_used;
			},
		},
		use: {
			// 本轮第四次以此法使用牌：令所有其他角色翻面
			name: "霓裳",
			charlotte: true,
			trigger: { player: "useCard" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.skill == "xiaobai_nichang_backup" && player.isIn();
			},
			async content(event, trigger, player) {
				player.storage.xiaobai_nichang_used = (player.storage.xiaobai_nichang_used || 0) + 1;
				if (player.storage.xiaobai_nichang_used != 4) return;
				player.logSkill("xiaobai_nichang");
				const others = game.filterPlayer((current) => current != player);
				if (others.length) player.line(others);
				for (const target of others) {
					if (target.isIn()) await target.turnOver();
				}
			},
		},
	},
	ai: {
		order: 6,
		result: { player: 1 },
		// 印牌源在「区域内」而非手牌 ⇒ 必须补齐三个询问预检接口（知识库 E 表 #36/#61/#62），
		// 否则对应窗口会把玩家当"没牌"直接跳过，按钮根本不出：
		//   ① 闪响应 —— 杀结算预检 target.hasShan() 回退 hasSkillTag("respondShan")（card/standard.js:155 / player.js:13512）
		//   ② 濒死求桃 —— canSave() 回退 hasSkillTag("save")（player.js:2490 / content.js:22）
		//   ③ 杀的使用窗口 —— hasSha() 回退 hasSkillTag("respondSha")（player.js:13490）
		// 范本：卫境 weijing（character/sp/skill.js:33545）
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag, arg) {
			// 标签是「使用/打出」双用开关：本技能仅"使用"，排除"打出"（决斗/南蛮的【杀】）
			if (arg === "respond") return false;
			// 库存门：花色队列已删空则不可用（与 filter 同源，防"询问弹了但按钮点不了"）
			const queue = player.storage.xiaobai_nichang;
			return Array.isArray(queue) && queue.length > 0;
		},
	},
},
// === 逆饶 ===
xiaobai_nirao: {
	audio: 2,
	// 每名角色的回合限一次（简化：本回合未发动过）
	trigger: { global: ["loseAfter", "loseAsyncAfter"] },
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
		let target;
		if (cands.length == 1) {
			// 目标已由触发事件确定：问“是否令其摸两张牌”，而不是弹选人
			target = cands[0];
			const go = await player
				.chooseBool("逆饶：是否令" + get.translation(target) + "摸两张牌？")
				.set("ai", () => get.attitude(player, target) > 0)
				.forResult();
			if (!go?.bool) return void (event.result = { bool: false });
		} else {
			// 罕见：同一事件中多名横置角色失去牌（loseAsync），才需要选人
			const res = await player
				.chooseTarget("逆饶：令其中一名角色摸两张牌", 1, (card, player2, targetx) => get.event().cands.includes(targetx))
				.set("cands", cands)
				.set("ai", (target) => get.attitude(player, target))
				.forResult();
			if (!res?.bool || !res.targets?.length) return void (event.result = { bool: false });
			target = res.targets[0];
		}
		event.result = { bool: true, cost_data: { target } };
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
// === 屏风 ===
xiaobai_pingfeng: {
	audio: 2,
	trigger: { target: "useCardToTarget" },
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
		// ⚠️ 弃别人的牌必须用 discardPlayerCard：player.discard(别人的牌) 会在 lose 步骤按
		// 弃牌者自己的 hejsx 校验，邻家的牌不在其中被整体剔空 → “弃置不了牌”
		const res = await player
			.discardPlayerCard(neighbor, "h", true, 1, "屏风：弃置" + get.translation(neighbor) + "的一张手牌")
			.forResult();
		if (!res?.cards?.length) return;
		// 弃牌前记录寻龙角色手牌数是否已各不相同
		const targets = player.storage.xiaobai_xunlong_targets || [];
		const before = lib.skill.xiaobai_xunlong ? (() => {
			const alive = targets.filter((current) => current.isIn());
			const counts = alive.map((current) => current.countCards("h"));
			return alive.length > 1 && new Set(counts).size == counts.length;
		})() : false;
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
// === 辟易 ===
// 辟易：以八卦阵的方式使用对应牌名的牌（每轮每个“辟易”限一次；判定为红色才生效）
// —— 按钮式印牌（enable + chooseButton + backup；范本：原生 potqingyan character/bingshi.js:2978、本扩火宴）：
//    出牌阶段窗口与无懈窗里出现「辟易」按钮（不再弹“是否发动”询问），点按钮选“本轮未发动”实例的牌面；
//    确认后 precontent 里做八卦阵判定：红 → 消耗该枚、照常使用；黑 → **不消耗**，
//    event.result.cancel = true 重开窗口（phaseUse 窗 content.js:4810 goto(0)；无懈窗 _wuxie standard.js:4362
//    goto(0) 重开本轮无懈询问）——即“判定不过、窗口照常继续”的八卦语义；
//    并在宿主事件上记 xiaobai_piyi_tried（Set），本窗口 / 本次无懈机会内不能重试（filter 拦截）。
//    precontent 执行点：phaseUse 窗 content.js:4759 await（goto(0) 后确认牌时 result.skill 已是 backup id）；
//    无懈窗 nouse=true 跳过 4759，由 _wuxie 补建 pre_ 事件（standard.js:4346），且 gameEvent.js:224 waitNext
//    会先跑完 next 队列再做 cancel 检查 ⇒ 判定必然先于无懈消费发生。
//    （旧触发式照抄 bagua_skill 钩 chooseToUseBegin 改写 trigger.result 的写法已废弃：每窗都弹询问，非按钮 UX。）
xiaobai_piyi: {
	audio: "xiaobai_guajie",
	enable: ["chooseToUse", "phaseUse"],
	// 真技能：有独立 _info + 动态描述（lib.dynamicTranslate.xiaobai_piyi）。
	// 数据：storage.xiaobai_piyi_slots = [{name, used?}, …] —— 每个元素 = 一个“辟易”实例，name 就是它的「」。
	// “每轮每个辟易各一次”按**实例**记（slot.used），轮首由 clear 子技能清掉：
	// ⚠️ 不能按牌名记——初始两枚辟易同名（都是【无懈可击】），按牌名会“用一个锁两个”。
	// 判定失败不写 slot.used（不消耗），只在宿主事件上记 tried（见 precontent）。
	// hiddenCard：辟易的牌名全是锦囊（初始两枚【无懈可击】，之后是被抵消过的普通锦囊牌名）⇒
	// 必须喂 hasWuxie 预检。无懈窗的候选列表就是 game.filterPlayer(current => ... && current.hasWuxie(map))
	// （card/standard.js:4200），不写则持有辟易的角色被直接跳过、永远无法用辟易抵消锦囊
	hiddenCard(player, name) {
		return lib.skill.xiaobai_piyi.getRemain(player).some((slot) => slot.name === name);
	},
	// 本轮还可用的辟易实例。
	// ⚠️ 必须按**实例**记（slot.used），不能按牌名：初始两个辟易同名（都是【无懈可击】），
	// 按牌名记会“用一个锁两个”。
	getRemain(player) {
		return (player.storage.xiaobai_piyi_slots || []).filter((slot) => !slot.used);
	},
	// 当前窗口真的能用的辟易实例：
	// ① 窗口的 filterCard 放行（无懈窗只认 wuxie；出牌阶段按牌自身规则）；
	// ② 有目标的牌至少有一个合法目标——lib.filter.filterCard 对 range [1,1] 不查目标，
	//    只靠 ① 会出现"能选却选不到目标"的牌（顺手没距离、桃满血等）。
	getUsable(player, event) {
		return lib.skill.xiaobai_piyi.getRemain(player).filter((slot) => {
			const vcard = { name: slot.name, isCard: true };
			if (!event.filterCard?.(vcard, player, event)) return false;
			return get.info(vcard).notarget || player.hasUseTarget(vcard);
		});
	},
	filter(event, player) {
		// 判定失败后本机会不能重试：tried 记在宿主上（phaseUse = chooseToUse 窗；无懈 = _wuxie 事件）。
		// 用 Set 记玩家：_wuxie 是全体共用的，多个辟易持有者互不误锁（无懈被无懈时内外两层 _wuxie 各自独立）
		if (event.xiaobai_piyi_tried?.has?.(player)) return false;
		const wx = event.getParent("_wuxie");
		if (wx && wx.name == "_wuxie" && wx.xiaobai_piyi_tried?.has?.(player)) return false;
		// backup 重渲染态不用特判：event.filterCard 已换成 backup 的 ()=>false，getUsable 自然为空、按钮隐藏
		if (!event.filterCard) return false;
		return lib.skill.xiaobai_piyi.getUsable(player, event).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			// 只列“本轮未发动”且当前窗口真能用的实例（按牌名去重展示；消耗按实例记）
			const usable = lib.skill.xiaobai_piyi.getUsable(player, event);
			const names = [...new Set(usable.map((slot) => slot.name))];
			return ui.create.dialog("辟易：选择一枚“辟易”", [names.map((n) => [get.type(n), "", n]), "vcard"]);
		},
		check(button) {
			return get.player().getUseValue({ name: button.link[2], isCard: true }, null, true);
		},
		backup(links) {
			const name = links[0][2];
			return {
				// useCard 会自动 logSkill backup id（content.js:9153）；log:false + precontent 手动 log 主技能，
				// 避免日志里出现"xiaobai_piyi_backup"（原生 potqingyan 同款）
				log: false,
				// 无素材印牌三件套（filterCard + selectCard:-1 + viewAs，同火宴/道转）：
				// 选完牌面直接进引擎的目标步骤，无需自己选目标
				filterCard: () => false,
				selectCard: -1,
				viewAs: { name, isCard: true, storage: { xiaobai_piyi: true } },
				async precontent(event, trigger, player) {
					// event 是 pre_xiaobai_piyi_backup，getParent() = 宿主：
					// phaseUse 路径 = chooseToUse 窗（content.js:4760），无懈路径 = _wuxie（standard.js:4346）
					player.logSkill("xiaobai_piyi");
					// 八卦阵判定（照抄 bagua_skill 的写法）
					const judgeEvent = player.judge("bagua", (card) => (get.color(card) === "red" ? 1.5 : -0.5));
					judgeEvent.judge2 = (result) => result.bool;
					const judgeResult = await judgeEvent.forResult();
					if (!judgeResult || judgeResult.judge <= 0) {
						// 判定为黑：**不消耗**实例；本机会内不能再重试；
						// cancel=true 的语义是"重开窗口"（content.js:4810 / standard.js:4362 的 goto(0)），
						// 不是 bool=false 的"结束出牌阶段"——这正是"判定不过、窗口照常继续"
						event.result.cancel = true;
						const host = event.getParent();
						if (host) (host.xiaobai_piyi_tried ??= new Set()).add(player);
						return;
					}
					// 判定为红：消耗这一枚（按实例记）
					const slot = (player.storage.xiaobai_piyi_slots || []).find((s) => s.name === name && !s.used);
					if (slot) {
						slot.used = true;
						player.updateMarks("xiaobai_guajie");
					}
				},
			};
		},
		prompt(links, player) {
			return `###辟易###<div class="text center">以【八卦阵】的方式使用一张【${get.translation(links[0][2])}】（判定为红色才生效）</div>`;
		},
	},
	group: ["xiaobai_piyi_gain", "xiaobai_piyi_clear"],
	subSkill: {
		// 抵消了**其他角色**使用的普通锦囊牌 → 获得一个单独的“辟易”，其「」改为该牌名
		// （挂在子技能上而非主技能：主技能已有 filter/chooseButton，同对象再写一套 filter 会被后键吃掉）
		gain: {
			audio: "xiaobai_guajie",
			charlotte: true,
			sub: true,
			name: "辟易",
			// eventNeutralized 在“被抵消的那个事件”上派发（gameEvent.js 的 neutralize()），
			// 该事件的 _neutralize_event 才是无懈的 content 事件（type == "card"、player 是无懈使用者）。
			// 旧写法监听 useCardAfter 并读 event._neutralized：_neutralized 挂在被抵消的 content 事件上，
			// useCardAfter 永远读不到 → 整段效果完全失效。
			trigger: { global: "eventNeutralized" },
			direct: true,
			filter(event, player) {
				if (!player.isIn()) return false;
				// 只处理“牌”被抵消（type == "card"）；普通锦囊（get.type 对延时锦囊返回 "delay"）
				if (event.type != "card" || !event.card) return false;
				if (get.type(event.card) != "trick") return false;
				// 必须是“其他角色”使用的：否则自己用锦囊、自己辟易无懈，会自己刷辟易
				if (!event.player || event.player == player) return false;
				// 必须是“我”用辟易印出的那张【无懈可击】抵消的：
				// 走 backup 后 useCard.skill = "xiaobai_piyi_backup"，startsWith 命中；card.storage 双标记兜底
				const wuxie = event._neutralize_event;
				if (!wuxie || wuxie.player != player) return false;
				return wuxie.skill?.startsWith("xiaobai_piyi") || !!wuxie.card?.storage?.xiaobai_piyi;
			},
			async content(event, trigger, player) {
				// “已有此牌名的辟易就不获得 / 上限8 / 超出替换”都在卦解的 gain 里，只有一处规则
				await lib.skill.xiaobai_guajie.gain(player, get.name(trigger.card));
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
				return (player.storage.xiaobai_piyi_slots || []).some((slot) => slot.used);
			},
			content(event, trigger, player) {
				// 每轮每个辟易各一次 ⇒ 轮首清掉全部“本轮已用”标记
				for (const slot of player.storage.xiaobai_piyi_slots || []) delete slot.used;
			},
		},
	},
	ai: {
		// 无静态 order：按钮技的 AI 序随窗口而变——无懈窗看态度，出牌阶段取最优实例
		order(item, player) {
			player ??= get.player();
			const evt = get.event();
			// 无懈窗：只无懈**敌方**用的牌（respondTo = [使用者, 被响应的牌]，card/standard.js:4163）；
			// 自己用的牌不必自己无懈，友方/中立（态度≥0）也不值得
			if (evt.type == "wuxie" && evt.respondTo) {
				const source = evt.respondTo[0];
				if (!source || source == player || get.attitude(player, source) >= 0) return 0;
				return Math.max(get.order({ name: "wuxie", isCard: true }, player), 4) + 0.1;
			}
			// 出牌阶段等：当前窗口可用的最优实例（避免 AI 每回合开局乱烧辟易：无正序牌则不出）
			let max = 0;
			for (const slot of lib.skill.xiaobai_piyi.getUsable(player, evt)) {
				const v = get.order({ name: slot.name, isCard: true }, player);
				if (v > max) max = v;
			}
			return max > 0 ? max + 0.1 : 0;
		},
		result: {
			player: 1,
		},
	},
},
// === 披云 ===
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
		// 这些角色与乐广同时展示一张基本牌或普通锦囊牌：自己先展示，队友（AI）随后尽量展示同名牌
		const others = discarders.filter((current) => current != player);
		const displays = new Map();
		const pickDisplay = async (current, matchName) => {
			if (!current.isIn()) return;
			const cands = current.getCards("h").filter((card) => get.type(card, null, current) == "basic" || (get.type(card, null, current) == "trick" && get.type2(card, current) == "trick"));
			if (!cands.length) return;
			const pick = await current
				.chooseCard("h", true, 1, "披云：请展示一张基本牌或普通锦囊牌", (card) => cands.includes(card))
				.set("ai", (card) => {
					let val = get.value(card);
					if (matchName) {
						// 队友：优先与薛莹展示的牌同名（友方促成同名、敌方回避送机会）
						if (get.name(card) == matchName) val += get.attitude(current, player) > 0 ? 10 : -10;
					} else {
						// 自己：优先展示“自己能视为使用”且价值高的牌
						if (player.hasUseTarget({ name: get.name(card), isCard: true }, true, false)) val += 3;
					}
					return val;
				})
				.forResult();
			if (pick?.cards?.length) {
				displays.set(current, pick.cards[0]);
			}
		};
		await pickDisplay(player, null);
		const myCard = displays.get(player);
		for (const current of others) {
			await pickDisplay(current, myCard ? get.name(myCard) : null);
		}
		for (const [current, card] of displays) {
			await current.showCards([card], "披云：展示的牌");
		}
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
					// ⚠️ 只记“实际有牌进弃牌堆”的角色：loseAsync 也承载交换手牌/装备变动等无弃牌的
					// 批量移动（旧实现 game.countPlayer(addDiscarder) 把全场记入，名单被污染）
					for (const current of game.filterPlayer()) {
						const lost = current.getHistory("lose", (evt) => evt.parent == trigger && evt.position == ui.discardPile);
						if (lost.length) addDiscarder(current);
					}
				} else {
					addDiscarder(trigger.player);
				}
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			// ⚠️ 显式 priority：clear 与主技能同挂 phaseAfter——主技能要先读名单再询问，
			// clear 必须最后清空（同优先级触发顺序仅靠稳定排序兜底，不可依赖）
			priority: -1,
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
// === 谦仁 ===
xiaobai_qianren: {
	audio: 2,
	mark: true,
	marktext: "谦",
	// mark: true 必须配 intro（AGENTS.md §3），否则浮窗空白
	intro: {
		name: "谦仁",
		content: "你手牌中带有「谦仁」标记的牌可以当【无懈可击】于你回合内使用。",
	},
	// 每阶段限一次（phaseChange 于子阶段之间清点）
	// 当你造成伤害时：防止之并摸至全场最大手牌数-1，摸到的牌带谦仁标记
	trigger: { source: "damageBegin2" },
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
			// 摸到的牌全部带「谦仁」gaintag（标签同 xiaobai_qianren 翻译，角标显示"谦仁"）
			await player.draw({ num, gaintag: ["xiaobai_qianren"] });
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
			// 无懈窗开窗前会走 hasWuxie（player.js:13485）：静态 viewAs.name=="wuxie" 直接算"有可用无懈"，
			// 只有 viewAsFilter 能拦。这里与 filter 同口径收窄：仅自己回合内、且有「谦仁」牌才算，
			// 否则回合外/没有谦仁牌时也会被拉进无懈询问列表。
			viewAsFilter(player) {
				if (_status.currentPhase != player) return false;
				return player.countCards("h", (card) => card.hasGaintag?.("xiaobai_qianren")) > 0;
			},
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
// === 乾象 ===
xiaobai_qianxiang: {
	audio: 2,
	// 一名角色回合结束时（Lua 的 fk.TurnEnd；on_cost = Util.TrueFunc → 不询问是否发动，
	// 用 direct: true 跳过询问又不误判成锁定技）
	trigger: { global: "phaseAfter" },
	direct: true,
	// 常驻标记：实时显示本回合「失去 / 获得」牌数，角标显示 X
	mark: true,
	marktext: "乾",
	intro: {
		name: "乾象",
		// 角标 = X（|失去 − 获得|，至多 5）；markcount 传的是 (storage, player, skill)
		markcount(storage, player) {
			return lib.skill.xiaobai_qianxiang.countX(player);
		},
		// 浮窗每次打开都重新求值（get.storageintro 的函数分支，noname/get/index.js:4897-4899）
		// 注意这里的 player 是**标记的主人**（node.parentNode.parentNode，get/index.js:5378），不是看浮窗的人
		content(storage, player) {
			const { lost, gained } = lib.skill.xiaobai_qianxiang.count(player);
			const diff = Math.abs(lost - gained);
			return `本回合你已失去${get.cnNumber(lost)}张牌、获得${get.cnNumber(gained)}张牌，X为${get.cnNumber(diff)}${diff > 5 ? "（至多按5计算）" : ""}。`;
		},
	},
	// 子技能只负责刷新角标：牌数变化时（loseAfter / gainAfter）与每回合开始时（phaseBeforeStart）
	group: ["xiaobai_qianxiang_mark"],
	filter(event, player) {
		if (!player.isIn()) return false;
		const { lost, gained } = lib.skill.xiaobai_qianxiang.count(player);
		return lost > 0 && gained > 0;
	},
	async content(event, trigger, player) {
		const X = lib.skill.xiaobai_qianxiang.countX(player);
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
	subSkill: {
		mark: {
			charlotte: true,
			sub: true,
			silent: true,
			popup: false,
			forced: true,
			// 牌进出（手牌/装备区）与每回合开始都重算一次角标；
			// 回合开始时引擎在 phase content 第 2 段重建 actionHistory（content.js:4124-4142），
			// phaseBeforeStart 在其后派发（content.js:4148-4150），所以此时读到的计数已是 0
			trigger: { player: ["loseAfter", "gainAfter"], global: "phaseBeforeStart" },
			filter(event, player) {
				return player.isIn();
			},
			content(event, trigger, player) {
				player.updateMarks();
			},
		},
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
	// X = |本回合失去 − 本回合获得|，至多 5；mark 角标与 content 共用同一份计算（同源）
	countX(player) {
		const { lost, gained } = lib.skill.xiaobai_qianxiang.count(player);
		return Math.min(Math.abs(lost - gained), 5);
	},
	ai: { result: { player: 1 } },
},
// === 且守 ===
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
						// 用户定：目标是队友才转交（把技能交给自己人，等于把接力棒传给能用的队友）
						.set("ai", () => get.attitude(player, to) > 0)
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
		order: 4,
		respondShan: true,
		skillTagFilter(player, tag, arg) {
			return player.countCards("he", (card) => get.type(card) == "equip") > 0;
		},
		result: {
			player: 1,
		},
	},
},
// === 且佃 ===
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
				// 用户定：目标是队友才转交
				.set("ai", () => get.attitude(player, target) > 0)
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
// === 清节 ===
xiaobai_qingjie: {
	audio: 2,
	trigger: { player: "loseAfter" },
	direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		// 不因使用或打出而失去牌（使用/打出的 lose type 同为 "use"，知识库九）
		// hs=普通手牌、ss=明置手牌（content.js:10936 按 glows 类分流，明置牌不进 hs）、es=装备区
		if (event.type == "use") return false;
		return ((event.hs || []).length + (event.ss || []).length + (event.es || []).length) > 0;
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
				// ⚠️ 签名是 (card, player, num)：game.checkMod 原序传参（game/index.js:8500，getCardUsable player.js:12260 同）。
				// 旧写法 (current, card, num) 用第二参判牌名——那其实是玩家，恒 false → -1 从未生效；
				// 连带症状：日志打了"上限-1"但剩余次数不变，下次失牌又走削次数支 → 表现为"次数明明为0也不摸牌"
				cardUsable(card, player, num) {
					if (card?.name == "sha" || get.name(card) == "sha") {
						return num + (player.storage.xiaobai_qingjie_num || 0);
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
// === 亲戎 ===
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
// === 绻膝 ===
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
			// 净收益只有「这 1 点自伤值不值」：
			// 【树上开花】的收益（目标弃1~2张、摸等量，card/zhulu.js:191-217）**全部落在目标身上**，
			// 使用者自己只白掉 1 点体力 → 只有这 1 点伤害对自己有收益时才发动。
			player(player) {
				// 〖点赤〗阳态：体力变为 1 后摸至四张 → 2 血挨这 1 点正好触发（阳态 storage 为假）
				if (!player.isIn() || player.hp != 2 || player.storage.xiaobai_dianchi) return -1;
				const need = 4 - player.countCards("h");
				if (need <= 0) return -1; // 手牌已 ≥4：摸至四张没有收益
				return 1 + need / 5;
			},
			target(player, target) {
				// 只对队友发动：树上开花送的是「弃一张摸等量」，给敌人等于资敌
				if (!target?.isIn() || target == player || target.countCards("he") <= 0) return -1;
				return get.attitude(player, target) > 0 ? 1 : -1;
			},
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
// === 衽挟 ===
xiaobai_renxie: {
	audio: 2,
	trigger: { player: "useCardToTarget" },
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
			direct: true,
			filter(event, player) {
				if (event.source != player || !event.player?.isIn() || !player.isIn()) return false;
				if (!event.card?.storage?.xiaobai_renxie) return false;
				return event.player.isDamaged() && event.player.countCards("he") > 0;
			},
			async content(event, trigger, player) {
				const target = trigger.player;
				// direct 技能不问技能拥有者，直接由受伤角色决定
				const go = await target
					.chooseBool("衽挟：是否令" + get.translation(player) + "获得你一张牌，然后你回复1点体力？")
					.set("ai", () => (get.attitude(target, player) > 0 ? 1 : 0))
					.forResult();
				if (!go?.bool) return;
				player.logSkill("xiaobai_renxie", target);
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
// === 荣哀 ===
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
			.set("ai", () => {
				const hand = player.countCards("h");
				const risky = get.attitude(player, _status.currentPhase) < 0; // 敌方阶段：本阶段内挨打会被翻到另一值
				const can1 = options.includes("调整至1张");
				const can4 = options.includes("调整至4张");
				// 敌方阶段：主动调1赌“挨打→阶段结束翻回4”的过牌引擎
				if (risky && can1) return "调整至1张";
				// 友方阶段：调4是纯收益；没有4时仅手牌超限才调1卸牌
				if (can4) return "调整至4张";
				if (can1 && player.needsToDiscard()) return "调整至1张";
				return "cancel2";
			})
			.forResult();
		if (!ctrl?.control || ctrl.control == "cancel2") return;
		const target = ctrl.control == "调整至1张" ? 1 : 4;
		player.addTempSkill(target == 1 ? "xiaobai_rongai_used1" : "xiaobai_rongai_used4", "roundStart");
		player.storage.xiaobai_rongai_choice = target;
		const num = hand - target;
		if (num < 0) {
			await player.draw(-num);
		} else if (num > 0) {
			await player.chooseToDiscard(num, "h", true).set("ai", (card) => 6 - get.value(card)).forResult();
		}
	},
	group: ["xiaobai_rongai_end", "xiaobai_rongai_reset"],
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
					await player.chooseToDiscard(num, "h", true).set("ai", (card) => 6 - get.value(card)).forResult();
				}
				delete player.storage.xiaobai_rongai_choice;
			},
		},
		reset: {
			charlotte: true,
			sub: true,
			forced: true,
			popup: false,
			silent: true,
			// roundStart 挂在 phase 事件上（content.js:4145），event.player 是回合角色；
			// 写 player: 只会在荣爱自己回合开新一轮时清理，其余轮次漏掉。
			trigger: { global: "roundStart" },
			content(event, trigger, player) {
				delete player.storage.xiaobai_rongai_choice;
			},
		},
	},
	ai: {
		result: {
			player: 1,
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
				check(card) {
					// AI 转化材料按价值差选（优先消耗最不值钱的牌）
					return 6 - get.value(card);
				},
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
	// 喂 hasWuxie/hasShan/canSave 预检（引擎只读技能顶层 hiddenCard，不能放进 ai）
	hiddenCard(player, name) {
		if (!player.storage.xiaobai_dengxian) return false;
		return get.type(name) == "basic";
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
	},
},
// === 擅恣 ===
xiaobai_shanzi: {
	audio: 2,
	// 每轮开始时（roundStart 在 phaseLoop 给全员补好 seatNum 之后才派发，所以一号位一定查得到）
	// 依据：content.js:3255-3257 `while (current.getSeatNum() === 0) current.setSeatNum(num)`；
	// 与《技能开发知识库.md》§十六「一号位 / seatNum 的可用时机」一致
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
// === 杀噬 ===
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
// === 舌耕 ===
xiaobai_shegeng: {
	audio: 2,
	// 「出牌阶段限一次 或 当你受到伤害后」：主动部分走 enable+usable，受伤部分走 damage 子技能
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.isIn());
	},
	async content(event, trigger, player) {
		await lib.xiaobaiShegengFlow(player, null);
	},
	group: ["xiaobai_shegeng_damage"],
	subSkill: {
		// 「当你受到伤害后」分支（触发不受 usable 限制）
		damage: {
			charlotte: true,
			sub: true,
			name: "舌耕",
			trigger: { player: "damageEnd" },
			filter(event, player) {
				if (!player.isIn()) return false;
				return game.hasPlayer((current) => current != player && current != event.source && current.isIn());
			},
			async content(event, trigger, player) {
				await lib.xiaobaiShegengFlow(player, trigger.source);
			},
		},
		// 「挑衅」额外弃置数标记（舌耕获得不为较少后 markSkill，挑衅流程消费）
		tx: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "弃",
			intro: { name: "挑衅", content: (storage) => "下次发动「挑衅」时额外弃置" + (storage || 0) + "张牌" },
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},
// === 神点 ===
// 神点流程（结束阶段自发动 / 恣逸阴态被触发共用）：重铸 X 次，一种花色的牌数翻倍时选择摸1或弃他人1
xiaobai_shendian: {
	audio: 2,
	trigger: { player: "phaseJieshuBegin" },
	//direct: true,
	filter(event, player) {
		return player.isIn() && player.countCards("hes") > 0;
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
					// 用户定：按实际收益选——火可能被藤甲加成、雷能穿透火免、冰另有用途。
					// 属性在**选目标之前**定，所以逐个属性算「全场最优目标的伤害收益」，取最高者：
					// get.damageEffect 已经把藤甲(+1)、属性免疫、卖血收益等都算进去了。
					.set("ai", () => {
						const me = get.player();
						const best = attrs
							.map((nature) => {
								const eff = game
									.filterPlayer((target) => target != me && target.isIn())
									.reduce((max, target) => Math.max(max, get.damageEffect(target, me, me, nature)), -Infinity);
								return { nature, eff };
							})
							.sort((a, b) => b.eff - a.eff)[0];
						return get.translation((best || { nature: attrs[0] }).nature) + "属性";
					})
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
		// 「然后**可以**令其选择一项」——是否令其选择由技能拥有者(player)决定（描述里的第二个"可以"）。
		// 不令其选择 → 只摸了那张牌，不做任何后续。
		const ask = await player
			.chooseBool(`施贫：是否令${get.translation(target)}选择一项？`)
			.set("ai", () => {
				// player 视角：判断「令其选择」对自己是否有利。
				const me = get.player();
				const att = get.attitude(me, target);
				// 敌人 → 给他一个「替换/移出游戏」的两难选择（移出游戏对他不利，
				//   替换也只能改别人的拼点、还可能白送一张手牌）→ 主动给。
				if (att < 0) return true;
				// 中立 → 不主动给（避免无谓互动）。
				if (att == 0) return false;
				// 队友 → 只有真能帮上忙（有可替换的组，且手里有能改变拼点结果的极端点数牌）才给；
				//   手牌极少或无极端牌 → 不让他选（换掉一张往往得不偿失）。
				return lib.xiaobaiShipinCanHelp(target, usable);
			})
			.forResult();
		if (!ask?.bool) return;
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
				.set("ai", () => {
					// target 视角（被令选择的角色）：
					// 若能通过替换让「对我方有利」的一方赢下拼点 → 选替换；否则选移出游戏自保/避战。
					const me = get.player();
					return lib.xiaobaiShipinBestReplace(me, usable) ? "替换延时拼点牌" : "本回合移出游戏";
				})
				.forResult();
			choice = ctrl?.control;
		} else {
			// 没有可替换的组 → 只有「移出游戏」一条路，且描述是「必须」二选一。
			// ⚠️ 原来写 chooseBool(...).set("direct", true) 有两个问题：
			//    ① direct 对 chooseBool 不是有效参数（它只对技能的 cost 询问生效），弹窗照弹；
			//    ② 更严重：chooseBool 没配 ai 时 event.choice 为 undefined → result.bool 恒 false
			//       （content.js:7710-7714），AI 目标会走进下面的 `if (!choice) return`，
			//       直接逃过「必须移出游戏」——与本处注释「不选也要移出」自相矛盾。
			// 既然是强制结果、没有选择余地，就不该发起询问。
			choice = "本回合移出游戏";
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
		// AI 偏好：先算一次「最优组」（不依赖闭包赋值，AI 里直接用这个变量）
		const bestPlan = lib.xiaobaiShipinBestReplace(target, usable);
		const groupRes = await target
			.chooseControl(groupControls)
			.set("forced", true)
			.set("prompt", "施贫：选择要替换的延时拼点组")
			.set("ai", () => {
				if (!bestPlan) return groupControls[0];
				const idx = usable.indexOf(bestPlan.evt);
				return groupControls[idx >= 0 ? idx : 0];
			})
			.forResult();
		const cmpEvt = usable[groupControls.indexOf(groupRes.control)];
		if (!cmpEvt) return;
		// 以「实际选中的这一组」为准，重算该组的替换计划（AI 遵循计划的组时结果与 bestPlan 一致；
		// 真人玩家另选了别的组时，也能给出该组的正确建议）
		const plan = lib.xiaobaiShipinBestReplace(target, [cmpEvt]);
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
				// 计划指向的那一侧优先（队友→帮其赢；敌人→压低其点数）
				if (plan && sides.includes(plan.participant)) {
					return sideControls[sides.indexOf(plan.participant)];
				}
				// 兜底：挑关系最好的那一方
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
		// ③ 选牌：队友的拼点牌 → 换自己点数**最大**的；敌人的拼点牌 → 换自己点数**最小**的
		const cardPick = await target
			.chooseCard("h", "施贫：选择用于替换的一张手牌", true)
			.set("ai", (card) => {
				const me = get.player();
				// 以「这一步实际替换的是谁」为准判断要最大还是最小
				const wantBig = get.attitude(me, participant) > 0;
				const num = get.number(card, me);
				return wantBig ? num : -num;
			})
			.forResult();
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
			// 描述是"与使用者各摸一张"：使用者就是自己时也要摸两份
			const user = trigger.player;
			await player.draw(num);
			if (user?.isIn()) await user.draw(num);
		} else {
			await player.loseHp(1);
		}
	},
},
// === 纾边 ===
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
			.set("ai", (target) => -get.attitude(player, target))
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
// === 疏谏 ===
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
// === 司酆 ===
xiaobai_sifeng: {
	audio: 2,
	forceDie: true,
	group: ["xiaobai_sifeng_hijack", "xiaobai_sifeng_assign", "xiaobai_sifeng_deadform"],
	subSkill: {
			// ⚠️ 本技能组（含 hijack/assign）的 forceDie 是「蒋子文死亡后」的**正规工作路径**：
			//    死亡照常结算（deadform 只负责死亡换皮，见下），真死后这两条靠 forceDie 继续发动
			//    （game/index.js:5588 只看 info.forceDie；arrangeTrigger 沿 nextSeat 整圈走，死者仍在环上）。
		hijack: {
			// 额定回合开始前：令当前回合角色选择交给一张牌，否则执行对应显灾效果；自己死亡后由一号位执行。
			// ⚠️ 这里**只认**「当前回合角色就是活着的那位额定回合归属者」。
			//    归属者已死的情形由 assign 在「死者座次」当场分配并结算（那种座次上根本没有 phase 事件），
			//    绝不能再按座次兜底判归属 —— 否则死者座次的上一位（二号位死了，那一号位）自己回合
			//    开始前也会被弹面板（用户实测的 bug 2）。
			name: "司酆",
			charlotte: true,
			forceDie: true,
			trigger: { global: "phaseBefore" },
			filter(event, player) {
				const to = event.player;
				if (!to?.isIn()) return false;
				// assign 分配出来的额外回合：这条额定回合的〖显灾〗已经在分配当场结算过了，别弹第二次。
				// 额外回合的 phase 事件挂在 assign 的 **trigger 事件**上（insertPhase 的
				// `_status.event.parent` 分支，player.js:5553-5555），那个 trigger 事件带着 skill 标记。
				// 有了这条，被选中者若自己也有一条额定回合，他的额外回合不会把那条效果提前吃掉。
				if (event.getParent()?.skill == "xiaobai_sifeng_assign") return false;
				// 只认活着且**本人就是这个回合角色**的归属者（与 content 同源）
				return lib.xiaobaiSifengOwner(player, to) === to;
			},
			async cost(event, trigger, player) {
				const to = trigger.player;
				// 蒋子文活着 ⇒ 走「你」；死亡后（真死幽灵，见 deadform）⇒ isIn() 为假 ⇒ 走「一号位」。
				// ⚠️ 判据用 `!player.isIn()`：`player.dead` 不是 Player 的属性（恒 undefined），别用。
				const prompt = !player.isIn()
					? `司酆：是否令${get.translation(to)}选择交给「一号位」一张牌，或「一号位」对其发动对应的〖显灾〗效果？`
					: `司酆：是否令${get.translation(to)}选择交给「你」一张牌，或「你」对其发动对应的〖显灾〗效果？`;
				const res = await player
					.chooseBool(prompt)
					.set("targetx", to)
					.set("ai", () => {
						const evt = get.event();
						return get.attitude(evt.player, evt.targetx) < 0;
					})
					.forResult();
				if (!res?.bool) return void (event.result = { bool: false });
				event.result = { bool: true };
			},
			async content(event, trigger, player) {
				player.logSkill("xiaobai_sifeng", trigger.player);
				const to = trigger.player;
				// 归属者活着：这条额定回合就是他自己的回合（filter 已经保证了这一点）
				const owner = lib.xiaobaiSifengOwner(player, to) || to;
					// 「你」的承担者：他活着就是本人；他已死亡（真死幽灵）才交给一号位。
				let actor = player.isIn() ? player : lib.xiaobaiFirstSeatPlayer();
				if (!actor) actor = player;
				// ⚠️ 同一名角色可能有多条额定回合记录（同一个回合里登场过多次：如第 1 次和第 3 次）
				//    → 由 lib.xiaobaiSifengResolveRecords 用 `.filter` **逐条**执行各自对应的效果。
				await lib.xiaobaiSifengResolveRecords(player, actor, to, owner);
			},
		},
		assign: {
			// 额定回合的归属者已死亡：**每轮轮到那个座次**时，蒋子文选一名存活角色执行该额定回合。
			// ⚠️ 不是「死亡那一刻一次性转移」——因此不需要把记录/标记搬给别人，每轮都可以换人。
			//
			// 时机与座次的关系（必需，别改成「任意角色」）：
			//   phaseLoop 在 `await event.trigger("phaseOver")`（content.js:3289）之后才执行
			//   `event.player = findNext(event.player)`（:3300），而 findNext 是在
			//   `game.players.concat(game.dead)` 里按 dataset.position 找**下一个**（:3290-3299）。
			//   因此「死者额定回合该到的那个位置」= 死者座次的**上一位**（可能也已阵亡）走到自己的
			//   phaseOver 时 —— 数据来源正是那个座次的 phaseOver，不用另找「死者座次」。
			name: "司酆",
			charlotte: true,
			forceDie: true,
			trigger: { global: "phaseOver" },
			filter(event, player) {
				// 只处理「归属者已真正死亡 + 正好轮到他的座次」那一类（活着的归属者走 hijack 的常规流程）
				// 判据（含"必须不在 game.players 里"的防复制）统一收在 lib.xiaobaiSifengDeadOwner 里。
				return !!lib.xiaobaiSifengDeadOwner(player, event.player);
			},
			async cost(event, trigger, player) {
				// ⚠️ 归属角色要从**记录**里取（与 filter 同一个 helper），不能用 trigger.player：
				//    phaseOver 的 event.player 是「刚刚结束回合的那个人」（即死者座次的上一位）。
				const owner = lib.xiaobaiSifengDeadOwner(player, trigger.player);
				if (!owner) return void (event.result = { bool: false });
				// 蒋子文本人（死不死都一样）选人：chooseTarget 自带 forceDie（player.js:6544）→ 他已死亡也照样能选
				if (!game.hasPlayer((current) => current.isIn())) return void (event.result = { bool: false });
				const res = await player
					.chooseTarget(`司酆：令一名存活角色执行属于${get.translation(owner)}的额定回合`, (card, me, target) => target.isIn())
					.set("ai", (target) => -get.attitude(get.player(), target))
					.forResult();
				// 取消 = 本轮不分配（下一轮轮到这个座次时再问）
				if (!res?.bool || !res.targets?.length) return void (event.result = { bool: false });
				event.result = { bool: true, cost_data: { target: res.targets[0], owner } };
			},
			async content(event, trigger, player) {
				const to = event.cost_data?.target;
				const owner = event.cost_data?.owner || lib.xiaobaiSifengDeadOwner(player, trigger.player);
				if (!to?.isIn() || !owner) return;
				game.log(player, "令", to, "执行属于", owner, "的额定回合");
				// ① 当场把这条额定回合的〖显灾〗询问结算给被选中者
				//    （to = 被选中者；actor = 蒋子文本人，他已死亡时是一号位）
				let actor = player.isIn() ? player : lib.xiaobaiFirstSeatPlayer();
				if (!actor) actor = player;
				await lib.xiaobaiSifengResolveRecords(player, actor, to, owner);
				if (!to.isIn()) return; // 结算里（如【火攻】）把他打死了就不再插回合
				// ② 额外回合落在**死者的座次**上：insertPhase 的接收者是谁、这个回合就归谁
				//    （player.js:5547-5570 `next.player = this`，与调用者无关）。插入位置由 `_status.event` 决定：
				//    本 content 处在 phaseOver 的触发链里（祖先链上没有 phase 事件）→ 回合事件被挂到这个
				//    trigger 事件的 next 上，由它的 #waitNext 立刻消费（gameEvent.js:271-299）
				//    ⇒ 执行时机 = phaseLoop 的 findNext 推进**之前** = 死者座次那一刻；
				//      被选中者自己的回合完全不受影响（照原生 封土 jdfengtu_phase，offline_jiudin.js:2544-2560）。
				lib.xiaobaiSifengInsertPhase(to);
			},
		},
		deadform: {
			// 蒋子文「真死幽灵」：死亡**照常结算**——原生死亡自带全部死亡特性（灰化头像、藏血条、
			// 区域内牌全弃、移出 game.players 入 game.dead、不参与回合与结算、不可被指定，
			// 且座次 nextSeat 环保留、额定回合记录在 storage 里不动）。本技能在死亡链上只做两件事：
			//   ① dieBefore（firstDo）：死于隐匿态的保险——直接 die() 类效果不经过 changeHp，
			//      _showHiddenCharacter（library/skill.js:1365-1378）只挂 changeHp/phaseBeginStart/
			//      loseMaxHpBegin/gainMaxHpBegin 接不住；而 filterTrigger 第二道闸门用
			//      getSkills(false)（library/index.js:10723-10725），**不含 hiddenSkills**
			//      （player.js:5448-5489）→ 隐匿态下连第四道的 forceDie（:10731）都轮不到，
			//      死于隐匿 = 永久静默。故在 dieBefore 外科式脱离隐匿（只搬技能与显示，不动体力）。
			//   ② die（原生武魂 wuhun 同款时机，此时已入 game.dead、已灰化）：化为「秦广王」——
			//      势力改神 + 改显示名 + 换立绘（常量留空则只改名）+ 播报。
			// 死后〖司酆〗靠 hijack/assign 自身的 forceDie 继续发动：createTrigger 只看 info.forceDie
			//   （game/index.js:5588），arrangeTrigger 沿 nextSeat 整圈走、死者仍在环上（die 只重连
			//   next/previous，content.js:11477-11480 + gameEvent.js:583），chooseBool/chooseTarget
			//   自带 forceDie（player.js:6710/6544）；显灾效果的执行者由 hijack/assign 的现有 actor
			//   逻辑换成一号位（死者自己的 draw/useCard 会被 ContentCompilerBase.isPrevented 拦掉）。
			// ⚠️ 旧版「假死」（dieBefore 取消死亡 + hp 抬回 1）已废弃：假死后他仍以 1 体力参与游戏
			//    （有自己的回合、可被指定、可再被击杀），不符合「死亡后不参与游戏」的需求。
			// ⚠️ 改名只动**显示层**（player.name + node.name），绝不动 name1/name2 —— 扩展对他的识别
			//    一律走 name1/name2（本 filter 也是三个字段一起判）。主公局面同样真死：胜负结算照常。
			name: "司酆",
			charlotte: true,
			forceDie: true,
			trigger: { player: ["dieBefore", "die"] },
			forced: true,
			// firstDo：保险与换皮都要最先跑（原生 nspinmin / subplayer 同族写法），
			// 否则别人可能在同一条死亡链里先把事件处理掉。
			firstDo: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return [player.name, player.name1, player.name2].includes("xiaobai_jiangziwen");
			},
			async content(event, trigger, player) {
				if (event.triggername == "dieBefore") {
					// ① 死于隐匿态的保险（正常亮将死亡不会进来）：外科式脱离隐匿——技能挪回
					//    node.skills（否则 filterTrigger 第二道闸门查不到，forceDie 也轮不到）、
					//    还原名字/暗置视觉；不动体力，死亡结算随后照常走。
					if (!player.isUnseen(2)) return;
					const skills = (player.hiddenSkills || []).slice();
					for (const s of skills) {
						player.hiddenSkills.remove(s);
						player.addSkill(s);
					}
					player.removeSkill("g_hidden_ai");
					game.broadcastAll((p) => {
						p.name = p.name1 || p.name;
						p.sex = lib.character[p.name1]?.[0] ?? "male";
						p.classList.remove("unseen", "unseen_show");
						p.update();
					}, player);
					return;
				}
				// ② 化为秦广王（此时已入 game.dead、已灰化；血条由原生 die 结算隐藏，不再手动 nohp）
				await player.changeGroup("shen").set("forceDie", true);
				game.log(player, "化为了", "#g秦广王");
				// 视觉换皮：全部走 broadcastAll，联机下所有客户端表现一致
				// （照原生十常侍·魔王：character/mobile/skill.js:17362-17376）
				game.broadcastAll(
					(p, name, img) => {
						// 换名字：只改**显示层**，绝不动 name1/name2（历史上改写 name1 引发过连锁问题）
						if (name) {
							p.name = name;
							if (p.node?.name) p.node.name.innerHTML = get.slimName(name);
						}
						// 换立绘（接口）：常量留空 = 不换，所以这里连 smoothAvatar 都不调
						if (img) {
							p.smoothAvatar(false);
							// 直接给立绘 URL：引擎的 setBackground(name,"character") 会把相对路径拼成
							// `image/character/<name>.jpg`（init/polyfill.js:161-176），而本扩展的图在
							// `extension/群友设计/image/character/` 下，所以整条路径要自己带上 lib.assetURL
							// （与 character/patchAssets.js:9 的写法一致）。
							p.node.avatar.setBackgroundImage(lib.assetURL + `extension/群友设计/image/character/${img}.jpg`);
						}
					},
					player,
					XIAOBAI_JIANGZIWEN_DEAD_NAME,
					XIAOBAI_JIANGZIWEN_DEAD_IMG
				);
			},
		},
	},
	// 幂等注册（照原生 封土 jdfengtu，offline_jiudin.js:2524-2526 / 2532-2534）：让 assign 插入的
	// **额定回合**不被当成新一轮 —— lib.onround.every(...) 全真才推进轮次（content.js:4018-4047 与 3267-3285）。
	// 这个回调在「回合开始」时被调用（content.js:4018 传 (event, player)，即那个 phase 事件 + 该回合角色）。
	// 判据：额外回合是 assign 的 **trigger 事件**的子事件（insertPhase 的 `_status.event.parent` 分支，
	//   player.js:5553-5555），所以 `event.getParent()` 就是那个 trigger 事件、带着 skill 标记；
	//   event.skill 是第二道保险（lib.xiaobaiSifengInsertPhase 会 delete 掉它，双保险不嫌多）。
	//   ⚠️ 少了它，恰好排在「比上次行动者座位号小」的被选中者会把插入的回合误判成新一轮（roundStart 多触发一次）。
	onRound(event) {
		return event.getParent()?.skill != "xiaobai_sifeng_assign" && event.skill != "xiaobai_sifeng_assign";
	},
	// 照 封土 的写法：技能一挂上就注册（filterTrigger 需要本技能 forceDie，见 lib/index.js:10731）
	init(player) {
		if (!lib.onround.includes(lib.skill.xiaobai_sifeng.onRound)) lib.onround.push(lib.skill.xiaobai_sifeng.onRound);
	},
},
// === 肃吏 ===
xiaobai_suli: {
	audio: 2,
	trigger: { global: "useCard" },
	filter(event, player) {
		if (event.player == player || !event.player?.isIn()) return false;
		if (lib.xiaobaiGaijuCards(player).length != 2) return false;
		if ((event.cards?.length || 0) > 1) return false;
		const num = get.number(event.card);
		if (!num) return false;
		// 于其回合内
		if (_status.currentPhase != event.player) return false;
		if (lib.xiaobaiGaijuBetween(player, num)) return false;
		// 其本回合首次使用点数不在"矩"之间的牌（排除当前这张后计数为 0）
		const user = event.player;
		return !user.getHistory("useCard").some((evt) => evt != event && !lib.xiaobaiGaijuBetween(player, get.number(evt.card)));
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseBool(`肃吏：是否对${get.translation(trigger.player)}造成1点伤害，然后选择一项？`)
			.set("targetx", trigger.player)
			.set("ai", () => {
				const evt = get.event();
				const me = evt.player;
				if (get.attitude(me, evt.targetx) >= 0) return false;
				const hasBetween = me.getCards("he").some((card) => lib.xiaobaiGaijuBetween(me, get.number(card)));
				return hasBetween || me.hp > 1;
			})
			.forResult();
		if (!res?.bool) return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { target: trigger.player } };
	},
	async content(event, trigger, player) {
		const target = event.cost_data.target;
		player.logSkill("xiaobai_suli", target);
		await target.damage(player, 1);
		if (player.isDead() || !player.isIn()) return;
		// 选项一需有"矩之间"点数的牌（he 区），否则只有选项二
		const between = player.getCards("he").filter((card) => lib.xiaobaiGaijuBetween(player, get.number(card)));
		if (!between.length) {
			await player.loseHp(1);
			if (player.isIn()) {
				const ju = lib.xiaobaiGaijuCards(player);
				if (ju.length) await player.recast(ju);
			}
			return;
		}
		const choice = await player
			.chooseControl("选项一", "选项二")
			.set("choiceList", ["用一张点数为“矩”之间的牌替换一张“矩”", "失去1点体力，然后重铸所有“矩”"])
			.set("prompt", "肃吏：请选择一项")
			// 前面「对敌人造成1点伤害」已经由 cost 的 ai 判过（对敌方 + 有矩/体力撑得住）。
			// 这里两项的差别：
			//   选项一 = 拿一张「矩之间」的牌换回一张「矩」：**不花体力**，还能挑走最有价值的那张矩；
			//   选项二 = 失去1点体力 + 重铸所有「矩」：花体力换一轮全新矩（只有矩全是废牌时才划算）。
			.set("ai", () => {
				const me = get.player();
				const ju = lib.xiaobaiGaijuCards(me);
				const bestJu = ju.length ? Math.max(...ju.map((card) => get.value(card, me))) : 0;
				if (bestJu >= 5) return "选项一"; // 矩里有像样的牌 → 白拿一张
				return me.hp > 1 ? "选项二" : "选项一"; // 全是废牌且体力够 → 花1点重开一轮
			})
			.forResult();
		if (choice.control != "选项一") {
			await player.loseHp(1);
			if (player.isIn()) {
				const ju = lib.xiaobaiGaijuCards(player);
				if (ju.length) await player.recast(ju);
			}
			return;
		}
		// 选项一：选一张"矩之间"的牌与一张"矩"交换
		const res2 = await player
			.chooseCard("he", 1, true, "肃吏：请选择一张点数为“矩”之间的牌", (card) => lib.xiaobaiGaijuBetween(player, get.number(card)))
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!res2?.cards?.length) return;
		const newJu = res2.cards[0];
		const res3 = await player
			.chooseButton(["肃吏：请选择收回手牌的“矩”", [lib.xiaobaiGaijuCards(player), "vcard"]], true)
			.set("ai", (button) => get.value(button.link))
			.forResult();
		if (!res3?.links?.length) return;
		const oldJu = res3.links[0];
		await player.addToExpansion([newJu], player, "give").set("gaintag", ["xiaobai_gaiju_ju"]);
		player.removeGaintag("xiaobai_gaiju_ju", [oldJu]);
		await player.gain([oldJu], "gain2");
		game.log(player, "用", newJu, "替换了武将牌上的", oldJu);
	},
},
// === 素翩 ===
// 第一段 = 使用牌方式（enable 双键，出牌/响应窗口都可用）：牌名盒（响应窗口只剩匹配名 → “自动选闪/桃”）
// → 选X张重铸（须含该名的实体牌）→ 先重铸（弃X摸X）→ 从弃牌堆把该名实体牌按正常流程使用
//（result.card 直写实体，印牌标准 B3 实体直用，花色点数随实体走）。然后此段失效至有X张牌被使用后（mark「翩」计数）。
xiaobai_supian: {
	audio: 2,
	enable: ["chooseToUse", "chooseToRespond"],
	filter(event, player) {
		// ⚠️ 失效门必须读计数 storage 而非 hasSkill("xiaobai_supian_ban")——ban 技能在 group 里，
		// hasSkill 会展开 group 恒为 true（实测日志定位），技能因此从未亮过
		if ((player.storage.xiaobai_supian_ban_num || 0) > 0) return false;
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
		return new Set(player.getCards("ej").map((card) => get.suit(card)).filter((suit) => suit != "nosuit")).size;
	},
	hiddenCard(player, name) {
		// AI 响应预检：失效门读计数 storage（同 filter，hasSkill 会被 group 展开污染）、X 达标，且场上有该名基本牌（它要作为实体重铸后再使用）
		if ((player.storage.xiaobai_supian_ban_num || 0) > 0) return false;
		const x = lib.skill.xiaobai_supian.getSuitNum(player);
		if (x == 0 || player.countCards("he") < x) return false;
		return get.type({ name, isCard: true }) == "basic" && player.getCards("he").some((card) => get.name(card, player) == name);
	},
	chooseButton: {
		dialog(event, player) {
			const x = lib.skill.xiaobai_supian.getSuitNum(player);
			const names = new Set();
			for (const card of player.getCards("he")) {
				const type = get.type(card, null, player);
				if (type != "basic" && !(type == "trick" && get.type2(card, player) == "trick")) continue;
				const name = get.name(card, player);
				// 当前窗口接受该名才进选项：响应窗口只剩所需牌名
				if (event.filterCard?.(get.autoViewAs({ name }, "unsure"), player, event)) names.add(name);
			}
			const list = [...names].map((name) => [get.type(name), "", name]);
			const dialog = ui.create.dialog("素翩：重铸" + x + "张牌并使用其中一张牌", [list, "vcard"], "hidden");
			dialog.direct = true;
			return dialog;
		},
		check(button) {
			if (_status.event.getParent().type != "phase") return 1;
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2] }, null, true));
		},
		backup(links, player) {
			const name = links[0][2];
			return {
				audio: "xiaobai_supian",
				log: false,
				// ⚠️ 无素材三件套必须 selectCard: -1：0 会被引擎路径当成未选择/取消（印牌标准红线，火宴实测踩过）
				//——旧写法 selectCard:0 正是“用不了”的主因
				filterCard: () => false,
				selectCard: -1,
				// 壳：真正使用的牌是 precontent 里重铸后捞回的实体牌（result.card 被改写）
				viewAs: { name, isCard: true },
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_supian");
					const x = lib.skill.xiaobai_supian.getSuitNum(player);
					// 响应窗口（自动选牌）与出牌窗口（手动选实体牌）区分
					let host = event.parent, isRespond = false;
					while (host) {
						if (host.name == "chooseToRespond") {
							isRespond = true;
							break;
						}
						if (host.name == "chooseToUse") break;
						host = host.parent;
					}
					// 1. 要使用的实体牌：响应窗口自动取该名第一张，出牌阶段自选
					let entity;
					if (isRespond) {
						entity = player.getCards("he").find((card) => get.name(card, player) == name);
					} else {
						const res = await player
							.chooseCard("he", true, "素翩：选择要使用的【" + get.translation(name) + "】", (card) => get.name(card, player) == name)
							.set("ai", (card) => get.value(card))
							.forResult();
						entity = res?.cards?.[0];
					}
					if (!entity) {
						event.result.cancel = true;
						return;
					}
					// 2. 其余 X-1 张重铸牌（任意，实体牌除外）
					let mats = [];
					if (x > 1) {
						const res2 = await player
							.chooseCard("he", x - 1, true, "素翩：选择另外" + get.cnNumber(x - 1) + "张牌重铸", (card) => card != entity)
							.set("ai", (card) => 5 - get.value(card))
							.forResult();
						mats = res2?.cards?.slice(0) || [];
						if (mats.length < x - 1) {
							event.result.cancel = true;
							return;
						}
					}
					// 3. 先重铸：X 张（含实体牌）全部置入弃牌堆并摸等量牌
					await player.recast([entity].addArray(mats));
					// ⚠️ 重铸的弃/摸可能当场触发〖流玉〗（手牌数==弃牌堆数）把实体牌换进自己手牌——
					// 实体在弃牌堆或自己手牌都照常使用（同一张牌）；落到其他区域（理论外）才放弃本次
					if (get.position(entity, true) != "d" && !player.getCards("h").includes(entity)) {
						event.result.cancel = true;
						return;
					}
					// 4. 使用其中一张：实体直用——从弃牌堆捞回该实体牌，按正常流程使用/响应
					event.result.card = entity;
					event.result.cards = [entity];
					// 5. 此段失效至有X张牌被使用后：先挂起，实体牌使用结算完转正（本次计入）
					player.storage.xiaobai_supian_pending = x;
					player.storage.xiaobai_supian_entity = entity;
				},
			};
		},
		prompt(links, player) {
			return "素翩：重铸" + lib.skill.xiaobai_supian.getSuitNum(player) + "张牌并使用一张【" + get.translation(links[0][2]) + "】";
		},
	},
	// ⚠️ useSkill 兜底路由（诂守同款，AI/托管路径必经）：useResult 在 result.card 缺失时
	// 直接拼 { skill: 本体id, cards } 走 useSkill——对话框路径 result.card 已设，不会进本 content。
	// AI 路径自行完成“选名→选实体→重铸X张→使用实体牌”全流程。
	async content(event, trigger, player) {
		if ((player.storage.xiaobai_supian_ban_num || 0) > 0) return;
		const x = lib.skill.xiaobai_supian.getSuitNum(player);
		if (x == 0 || player.countCards("he") < x) return;
		// 候选名：he 中基本/普通锦囊，只认“当前可使用”的，AI 取使用价值最高者
		let name = null;
		let best = -Infinity;
		for (const card of player.getCards("he")) {
			const type = get.type(card, null, player);
			if (type != "basic" && !(type == "trick" && get.type2(card, player) == "trick")) continue;
			const n = get.name(card, player);
			if (!player.hasUseTarget({ name: n, isCard: true }, true, false)) continue;
			const v = player.getUseValue(get.autoViewAs({ name: n }, null, true));
			if (v > best) {
				best = v;
				name = n;
			}
		}
		if (!name) return;
		const entity = player.getCards("he").find((card) => get.name(card, player) == name);
		if (!entity) return;
		// 重铸牌：实体外的最便宜 X-1 张
		const mats = player
			.getCards("he")
			.filter((card) => card != entity)
			.sort((a, b) => get.value(a, player) - get.value(b, player))
			.slice(0, Math.max(0, x - 1));
		await player.recast([entity].addArray(mats));
		// 实体被〖流玉〗换进自己手牌也照常使用（同 precontent 守卫）；其他区域才放弃
		if (get.position(entity, true) != "d" && !player.getCards("h").includes(entity)) return;
		player.storage.xiaobai_supian_pending = x;
		player.storage.xiaobai_supian_entity = entity;
		// 响应上下文（chooseToRespond 父链）：AI 的响应 result 已提交，重铸照走、不再重复使用
		if (event.getParent("chooseToRespond")) return;
		// 使用上下文：实体牌按牌自身规则选目标使用（chooseUseTarget 的 AI 自动选目标）
		await player.chooseUseTarget(entity, "素翩：使用重铸捞回的【" + get.translation(name) + "】", false);
	},
	group: ["xiaobai_supian_ban", "xiaobai_supian_recover"],
	onremove(player) {
		player.removeSkill("xiaobai_supian_ban");
		delete player.storage.xiaobai_supian_ban_num;
		delete player.storage.xiaobai_supian_pending;
		delete player.storage.xiaobai_supian_entity;
	},
	subSkill: {
		// 失效计数（兼转正）：重铸的实体牌使用结算完把 pending 转为计数（本次使用计入 → 首帧 X-1）；
		// 之后每有一张牌被使用 -1，归 0 恢复。结算期间的嵌套用牌不提前计数。
		ban: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "翩",
			intro: {
				name: "素翩",
				markcount(storage, player) {
					return player.storage.xiaobai_supian_ban_num || 0;
				},
				content(storage, player) {
					return "第一段失效：还需" + (player.storage.xiaobai_supian_ban_num || 0) + "张牌被使用。";
				},
			},
			trigger: { global: "useCardAfter" },
			forced: true,
			silent: true,
			popup: false,
			filter(event, player) {
				if (player.storage.xiaobai_supian_pending) {
					// 重铸的实体牌使用结算完 → 转正
					return event.card === player.storage.xiaobai_supian_entity;
				}
				return (player.storage.xiaobai_supian_ban_num || 0) > 0;
			},
			content(event, trigger, player) {
				if (player.storage.xiaobai_supian_pending) {
					player.storage.xiaobai_supian_ban_num = player.storage.xiaobai_supian_pending - 1;
					delete player.storage.xiaobai_supian_pending;
					delete player.storage.xiaobai_supian_entity;
					if (player.storage.xiaobai_supian_ban_num > 0) {
						player.addSkill("xiaobai_supian_ban");
					}
				} else {
					player.storage.xiaobai_supian_ban_num--;
					if (player.storage.xiaobai_supian_ban_num <= 0) {
						player.storage.xiaobai_supian_ban_num = 0;
						player.removeSkill("xiaobai_supian_ban");
					}
				}
				player.updateMarks("xiaobai_supian_ban");
			},
		},
		// 回复体力后：可令任意名手牌数为X的角色翻倍手牌数（各摸X张）
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
					.chooseTarget("素翩：可令任意名手牌数为" + x + "的角色翻倍手牌数（各摸" + x + "张牌，可全不选）", [1, Infinity], (card, player2, targetx) => targetx.countCards("h") == x)
					.set("ai", (target) => get.attitude(player, target))
					.forResult();
				if (!res?.bool || !res.targets?.length) return;
				player.logSkill("xiaobai_supian");
				for (const current of res.targets.sortBySeat()) {
					if (current.isIn() && current.countCards("h") == x) await current.draw(x);
				}
			},
		},
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag) {
			if ((player.storage.xiaobai_supian_ban_num || 0) > 0) return false;
			const x = lib.skill.xiaobai_supian.getSuitNum(player);
			if (x == 0 || player.countCards("he") < x) return false;
			const need = tag == "respondSha" ? "sha" : tag == "respondShan" ? "shan" : "tao";
			return player.getCards("he").some((card) => get.name(card, player) == need);
		},
	},
},
// === 肃野 ===
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
// === 探虚 ===
xiaobai_tanxu: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.isIn());
	},
	ai: {
		order: 4,
		result: { player: 1 },
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
// === 田法 ===
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
		player.storage.xiaobai_tianfa_discard = null;
		for (const current of event.targets) {
			if (!current.isIn() || current.hasSkill("xiaobai_gengzhan")) continue;
			// 本轮临时获得：用 addTempSkill（不进 player.skills）。原生技能浮窗据此把该技能当"临时技"，
			// 用 thundertext（蓝色）显示（get/index.js:5084）；addSkill 会进 player.skills → 不蓝。
			// expire 交给 roundEnd 兜底：田法拥有者死亡时也能自动移除。
			current.addTempSkill("xiaobai_gengzhan", "roundEnd");
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
				// 只认「耕战」那一批：耕战 content 在 discard **之前**登记、**之后**立刻清空，
				// 所以「登记批次 ∩ 本次失去的牌」非空 ⇔ 本次失去就是耕战造成的。
				const recorded = player.storage.xiaobai_tianfa_discard;
				if (!recorded?.length) return false;
				// ⚠️ 必须查**全部区域**，不能只查 event.hs：
				//    耕战的选牌范围是 "he"，弃装备时那批牌落在 event.es，
				//    只查 hs 时 filter 恒 false → 询问根本不出现（拥有者弃装备时就是这样静默失效）。
				return ["hs", "es", "js", "ss", "xs"].some((key) => (event[key] || []).some((card) => recorded.includes(card)));
			},
			async content(event, trigger, player) {
				// 先取出登记并清空，避免同一次弃置重复询问/后续误判
				const recorded = player.storage.xiaobai_tianfa_discard || [];
				player.storage.xiaobai_tianfa_discard = null;
				const go = await player
					.chooseBool("田法：你可以将" + get.translation(trigger.player) + "因「耕战」弃置的牌置于牌堆底")
					// 置底没有代价（牌已经在弃牌堆里），且能让牌堆底回到自己控制下 → 一律发动。
					// 旧写法按 `get.attitude(player, trigger.player) > 0` 判：拥有者**自己**弃牌时
					// 判的是「对自己的态度」，一旦落成 0/负就直接答「否」而不发动。
					.set("ai", () => 1)
					.forResult();
				if (!go?.bool) return;
				const cards = [];
				for (const key of ["hs", "es", "js", "ss", "xs"]) {
					for (const card of trigger[key] || []) {
						if (recorded.includes(card) && get.position(card, true) == "d") cards.push(card);
					}
				}
				if (cards.length) {
					await game.cardsGotoPile(cards); // 无参 = 牌堆底
					game.log(player, "将", cards, "置于牌堆底");
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
				player.storage.xiaobai_tianfa_discard = null;
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
// === 通言 ===
// 结构照抄客户订单〖龙智〗longzhi_wuxie（线上实测可用的"选别人手牌当无懈"范本）：
// enable 技能直挂 viewAs + precontent 收集素材并改写 result.card/cards，取消 = bool=false。
// 不用 chooseButton/backup：其重入链会把 event.filterCard 换成 backup 自己的，
// 依赖 event.filterCard 的主 filter 在重入窗口恒 false——此前两次失效的根因
xiaobai_tongyan: {
	audio: 2,
	enable: ["chooseToUse"],
	prompt: "通言：将包含你在内的任意名角色共三张手牌当不可响应的【无懈可击】使用",
	viewAs: { name: "wuxie", storage: { nowuxie: true } },
	selectCard: -1,
	filterCard: () => false,
	viewAsFilter(player) {
		if (player.hasSkill("xiaobai_tongyan_disabled")) return false;
		return game.hasPlayer((current) => current.countCards("h") > 0);
	},
	hiddenCard(player, name) {
		if (name !== "wuxie") return false;
		if (player.hasSkill("xiaobai_tongyan_disabled")) return false;
		return game.hasPlayer((current) => current.countCards("h") > 0);
	},
	async precontent(event, trigger, player) {
		const evt = event.getParent("chooseToRespond") || event.getParent("chooseToUse");
		if (!evt) return;
		const collected = await lib.xiaobaiTongyanCollect(player);
		if (!collected) {
			// 凑不满/中途取消：绝不发出。双保险——bool=true + cancel=true 走引擎的
			// goto(0) 回技能候选窗（该分支先于 useResult 判断，cancel=true 时不 possibly
			// 消费 result.card）；即便 bool 判定异常也到不了使用
			delete event.result.card;
			delete event.result.cards;
			event.result.cancel = true;
			return;
		}
		event.result.card = get.autoViewAs({ name: "wuxie", isCard: true, storage: { nowuxie: true } }, collected.mats);
		event.result.cards = collected.mats;
		// 若其中点数最大的不为你的牌 → 此技能本轮失效。
		// 呈现走标准写法 A（坑-技能失效与标记显示.md）：disableSkill 让描述变灰 +
		// disabled 标记子技能（addTempSkill 到 roundStart，onremove 里 enableSkill 恢复）
		if (collected.maxOwner != player) {
			player.disableSkill("xiaobai_tongyan_disabled", "xiaobai_tongyan");
			player.addTempSkill("xiaobai_tongyan_disabled", "roundStart");
			game.log(player, "的〖通言〗本轮失效");
		}
	},
	subSkill: {
		disabled: {
			charlotte: true,
			sub: true,
			onremove(player) {
				player.enableSkill("xiaobai_tongyan_disabled");
			},
		},
	},
	ai: {
		skillTagFilter(player) {
			if (player.hasSkill("xiaobai_tongyan_disabled")) return false;
			return game.hasPlayer((current) => current.countCards("h") > 0);
		},
		order: 6,
		result: {
			player: 1,
		},
	},
},
// === 图存 ===
// 隐匿机制走本体文德武备式：角色数据带 hasHiddenSkill → 开局暗置；
// 引擎全局技 _showHiddenCharacter 在体力变化/回合开始前自动亮将（= 登场）。
xiaobai_tucun: {
	audio: 2,
	hiddenSkill: true,
	locked: true,
	forced: true,
	group: ["xiaobai_tucun_show", "xiaobai_tucun_hide", "xiaobai_tucun_unres"],
	subSkill: {
		show: {
			// 登场（亮将后）：自己的回合 → 获得牌无法被响应；他人的回合 → 对当前回合角色发动一次"幸乱"
			name: "图存",
			charlotte: true,
			trigger: { player: "showCharacterAfter" },
			forced: true,
			filter(event, player) {
				return event.toShow?.some((name) => (get.character(name, 3) || []).includes("xiaobai_tucun"));
			},
			async content(event, trigger, player) {
				const current = _status.currentPhase;
				if (current == player) {
					player.storage.xiaobai_tucun_unresponsive = true;
					game.log(player, "直到下次进入隐匿状态，使用的牌无法被响应");
				} else if (current?.isIn()) {
					player.logSkill("xiaobai_tucun", current);
					await lib.xiaobaiXingluanFlow(player, current);
				}
			},
		},
		hide: {
			// 受到伤害或因弃置而失去牌后：废除一个装备栏，然后再次隐匿
			name: "图存",
			charlotte: true,
			trigger: { player: ["damage", "discardAfter"] },
			forced: true,
			filter(event, player) {
				if (!player.isIn() || player.hp <= 0) return false; // 致命伤害不隐匿（避免隐匿体恢复出 0 体力）
				if (player.isUnseen(2)) return false; // 已处于隐匿状态
				if (player.storage.xiaobai_tucun_working) return false; // 隐匿流程中的弃牌不再递归
				return event.name == "damage" || (event.cards || []).length > 0;
			},
			async content(event, trigger, player) {
				await lib.xiaobaiTucunHide(player);
			},
		},
		unres: {
			// 登场于自己的回合后：使用的牌无法被响应（直到下次隐匿）
			name: "图存",
			charlotte: true,
			trigger: { player: "useCard1" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.storage.xiaobai_tucun_unresponsive == true;
			},
			content(event, trigger, player) {
				// useCard1 时 content.useCard 第 0 步已把 directHit 初始化成数组（content.js:9158-9163），
				// 直接 push 安全；若改到 useCardBegin/useCard 时机则必须先判 Array.isArray。
				trigger.directHit.addArray(game.filterPlayer());
			},
		},
	},
},
// === 枉恶 ===
// 枉恶：其他角色可将装备牌对张方使用。两道门缺一不可：
//   ① 放行：lib.filter.targetEnabled → checkMod(…, "targetEnabled", target)（视角=被指定者）
//      张方此 mod 返回 true，使「张方」成为装备牌的合法目标（原生 filterTarget 只认 player==target）。
//   ② 选择：装备牌原生 selectTarget = -1（自动选中全部合法目标），只做 ① 会导致使用者与张方
//      同时中选、再按座位先装给使用者 → 必须由全局子技能 g 把范围压成 [1,1]，逼出一次真实二选一。
// 结算：equipCard content 对 target 执行 target.equip(card)，所以选中张方即装到张方。
xiaobai_wange: {
	audio: 2,
	mark: true,
	marktext: "恶",
	intro: {
		name: "枉恶",
		content(storage, player) {
			// 与 content 的失去体力判定同口径：本轮 round 历史里自己使用过的伤害牌次数
			const num = player.getRoundHistory("useCard", (evt) => get.tag(evt.card, "damage")).length;
			return "其他角色可以将装备牌对你使用。<br>本轮已使用" + num + "张伤害牌。";
		},
		markcount(storage, player) {
			return player.getRoundHistory("useCard", (evt) => get.tag(evt.card, "damage")).length;
		},
	},
	mod: {
		targetEnabled(card, player, target) {
			if (get.type(card) == "equip") return target.canEquip(card, true);
		},
	},
	// 装备牌原生 selectTarget = -1（「自动选中全部合法目标」，不弹选择框），
	// 只靠 targetEnabled 放行会让使用者与张方一起被自动选中，结算再按座位先装给使用者，
	// 于是「其他角色可以对你使用装备牌」永远选不中张方 → 必须用全局技能把目标范围压成真正的二选一。
	// 详见 subSkill.g（由本字段注册为全局技能，仅在张方于场上时生效）。
	global: "xiaobai_wange_g",
	trigger: { target: "useCardToTargeted" },
	forced: true,
	filter(event, player) {
		// 只有别人对你使用装备牌才触发；自己用装备牌目标是自己，不算。
		// 一张装备牌不允许有两个目标：若本次 useCard 恰好违反（一张装备有两个目标——全局 mod 已压成[1,1]，
		// 正常不会发生；这里是兜底，避免「装备牌未真正进入张方区域，仍结算失去体力」的情况）
		if (get.type(event.card) != "equip" || !player.isIn() || event.player == player) return false;
		if (Array.isArray(event.targets) && event.targets.length != 1) return false;
		return true;
	},
	async content(event, trigger, player) {
		// 张方本轮发动过掠都 → 重置之（原生 refreshSkill：清使用计数与 _roundcount，孤脉同款）
		if (player.storage.xiaobai_luedu_roundcount == game.roundNumber) {
			player.refreshSkill("xiaobai_luedu");
			game.log(player, "的〖掠都〗被重置");
		}
		// 本轮使用过伤害牌次数 > 装备区牌数 → 失去1点体力
		const usedDamage = player.getRoundHistory("useCard", (evt) => get.tag(evt.card, "damage")).length;
		if (usedDamage > player.countCards("e")) {
			await player.loseHp(1);
		}
	},
	group: ["xiaobai_wange_count"],
	subSkill: {
		// 装备牌目标选择修正。由主技能的 global 字段注册为全局技能（张方获得枉恶时 game.addGlobalSkill）。
		// 原生装备牌：filterTarget = 只能指定自己、selectTarget = -1（自动选中全部合法目标）。
		// 枉恶的 targetEnabled 让张方也成为合法目标 → 会与使用者一起被自动选中，结算按座位先装给使用者，
		// 结果「其他角色对你使用装备牌」实际永远落不到张方身上。
		// 修法：使用者本人不是枉恶持有者、且张方确实能装备此牌时，把范围压成 [1,1]，逼出一次真实的目标选择。
		g: {
			charlotte: true,
			sub: true,
			mod: {
				selectTarget(card, player, range) {
					if (!card || get.type(card) != "equip") return;
					// 只在正常「使用牌」流程里改（出牌阶段选牌/选目标）；不干扰技能强制用牌的 chooseUseTarget
					const evt = get.event();
					if (!evt || (evt.name != "chooseToUse" && evt.name != "chooseToRespond" && evt.name != "useCard" && evt.name != "chooseUseTarget")) return;
					// 仅处理装备牌默认值 -1（自动全选）；被转化技等改成正常范围的不动
					if (range[1] != -1) return;
					// 使用者本人就是枉恶持有者 → 保持原生「装备给自己」
					if (player.hasSkill("xiaobai_wange")) return;
					// 场上须有其他能装备此牌的枉恶持有者，否则不必强制选目标
					if (!game.hasPlayer((current) => current != player && current.hasSkill("xiaobai_wange") && current.canEquip(card, true))) return;
					range[0] = 1;
					range[1] = 1;
				},
			},
			// AI：使用者权衡「把这张装备牌给张方还是留给自己」。
			// 引擎链路：出牌选目标 → ai.basic.chooseTarget(get.cacheEffectUse) → get.effect_use(target, card, player)
			//   → 遍历 player.getSkills()+lib.skill.global 的 ai.effect.player_use
			//   → 返回值 [a,b,c,d] ⇒ result1*=a; temp01+=b; result2*=c; temp02+=d
			//   → final = result1*attitude(player,player) + result2*attitude(player,target)
			// 装备牌 result1 恒为 0、result2 = get.equipResult(player,target,card)
			//   （已内置「栏内是正面装备→0、空栏/负面装备→正数」），所以只往 result2 上加 Δ，
			//   得到 final(张方) ≈ att*(装备增量 + 枉恶净收益) - 盟友机会成本 - 平局偏向自己。
			// 对照 final(self) = get.equipResult(player,player,card)，AI 取较大者（ai.basic.chooseTarget 取 max）。
			ai: {
				effect: {
					player_use(card, player, target) {
						if (!target || target === player || !target.hasSkill("xiaobai_wange")) return;
						if (get.type(card) != "equip") return;
						const att = get.attitude(player, target);
						if (!att) return;
						// 枉恶结算对张方的净收益
						let zhangGain = 0;
						// 会重置〖掠都〗（张方本轮已发动过）→ 对张方有利
						if (target.storage.xiaobai_luedu_roundcount == game.roundNumber) zhangGain += 3;
						// 会失去1点体力（本轮使用伤害牌次数 > 装备区牌数，取装备前的值）→ 对张方不利，血线越低越致命
						const usedDamage = target.getRoundHistory("useCard", (evt) => get.tag(evt.card, "damage")).length;
						if (usedDamage > target.countCards("e")) {
							const hp = target.hp;
							zhangGain -= hp <= 1 ? 9 : hp == 2 ? 6 : hp == 3 ? 5 : 4.5;
						}
						// 盟友额外扣「放弃自己装备」的机会成本（与装备增量同尺度，约等于一件普通装备的价值/5）；
						// 敌人不必扣——引擎侧的 final(self) 已含其自身装备收益，且「不白送装备给敌人」由 att<0 自动体现。
						// 平局一律偏向自己：Δ 减 0.2*sign(att)，等价于 final 减 0.2。
						return [1, 0, 1, zhangGain - (att > 0 ? 1.5 : 0) - 0.2 * get.sgn(att)];
					},
				},
			},
		},
		// 伤害牌计数变化后刷新 mark 角标（悬浮文案悬停时实时求值无需刷，角标必须手动 updateMarks）
		count: {
			charlotte: true,
			sub: true,
			trigger: { player: "useCardAfter", global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (event.name == "roundStart") return true;
				return Boolean(get.tag(event.card, "damage"));
			},
			content(event, trigger, player) {
				player.updateMarks();
			},
		},
	},
},
// === 滋义 ===
xiaobai_wangxiu_ziyi: {
	audio: 2,
	// 王脩或攻击范围内角色成为伤害牌唯一目标时
	trigger: { target: "useCardToTarget" },
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
				if (get.name(card) == "shan") return 3 + get.value(card);
				if (get.name(card) == "tao") return 1 + get.value(card);
				return 5 - get.value(card);
			})
			.forResult();
		if (!res?.links?.length) return void (event.result = { bool: false });
		// 权重校验
		let weight = 0;
		let hasPeach = false;
		for (const card of res.links) {
			weight += get.name(card) == "sha" ? 2 : 1;
			if (get.name(card) == "tao") hasPeach = true;
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
			if (name == "shan") jinks.push(card);
			else if (name == "tao") peaches.push(card);
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
// === 巍荡 ===
xiaobai_weidang: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		const suits = player.storage.xiaobai_weidang_suits || [];
		return player.countCards("he", (card) => !suits.includes(get.suit(card, player))) >= 2;
	},
	filterTarget(card, player, target) {
		return target != player && target.isIn();
	},
	selectTarget: 1,
	// ⚠️ 本引擎 enable:"phaseUse" 的链上没有 cost 执行点：确认（选目标→确定）直接
	// useResult→useSkill→content（content.js:9904 起），cost 函数被整个跳过、cost_data
	// 不透传（info.cost 的消费只有触发技 createTrigger 路径 content.js:3619）——
	// 写 cost 会静默不执行，content 读 cost_data 直接崩。发动前选择必须写在 content 里
	async content(event, trigger, player) {
		const target = event.targets[0];
		const suits = player.storage.xiaobai_weidang_suits || [];
		const res = await player
			.chooseCard("he", "巍荡：选择两张牌重铸（花色不能是本回合进入过弃牌堆的花色）", 2, (card) => !suits.includes(get.suit(card, player)))
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.bool || !res.cards || res.cards.length < 2) return;
		const cards = res.cards;
		// 视为使用的可用性判定：巍荡的【桃】是"给目标回血"的特例，绕过桃"只能自用"的
		// 常规限制——不能用 canUse（tao 的 filterTarget 对别人恒 false，会把桃全筛掉），
		// 核心条件就是目标受伤；【决斗】无此特例，走常规 canUse 尊重其他 mod
		const names = [];
		if (target.isDamaged()) names.push("tao");
		if (player.canUse(get.autoViewAs({ name: "juedou", isCard: true }, []), target)) names.push("juedou");
		if (!names.length) return;
		let name;
		if (names.length == 1) {
			name = names[0];
		} else {
			const pick = await player
				.chooseButton(
					[
						"巍荡：视为对" + get.translation(target) + "使用哪张牌？",
						[names.map((name) => [name == "tao" ? "basic" : "trick", "", name]), "vcard"],
					],
					true
				)
				.set("ai", (button) => {
					if (button.link[2] == "tao") return get.attitude(player, target) > 0 ? 10 : 0;
					return get.attitude(player, target) < 0 ? 10 : 1;
				})
				.forResult();
			if (!pick?.bool || !pick.links?.length) return;
			name = pick.links[0][2];
		}
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
					// 描述限定"进入过弃牌堆"：全家桶的 event.cards 不分去向（被获得/交给/使用的
					// 前置失去都混在里面，何休诂守同坑），必须过滤已真正落入弃牌堆的牌
					if (get.position(card, true) != "d") continue;
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
			trigger: { global: "phaseBegin" },
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
			// 友方受伤目标=喂桃收益；否则按对目标用【决斗】的期望（敌正友负）
			target(player, target) {
				if (get.attitude(player, target) > 0 && target.isDamaged()) return get.recoverEffect(target, player, player);
				return get.effect(target, { name: "juedou", isCard: true }, player, player);
			},
		},
	},
},
// === 委纠 ===
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
// === 威旅 ===
// 威旅：出牌阶段各限一次，三段自封
xiaobai_weilv: {
	audio: 2,
	enable: "phaseUse",
	// 三段代价的可得性判定（主 filter 与 chooseButton.filter 共用）
	canPay(link, player) {
		if (link == "sha") return player.countCards("he", (card) => get.name(card, player) == "sha") > 0;
		if (link == "shan") return player.countCards("he", (card) => get.name(card, player) == "shan") > 0;
		return player.countCards("he", (card) => get.type(card, player) == "basic") >= 2;
	},
	filter(event, player) {
		const used = player.getStorage("xiaobai_weilv_used");
		return ["sha", "shan", "basic"].some((link) => !used.includes(link) && lib.skill.xiaobai_weilv.canPay(link, player));
	},
	chooseButton: {
		dialog(event, player) {
			const used = player.getStorage("xiaobai_weilv_used");
			const list = [];
			if (!used.includes("sha")) list.push(["sha", "弃置一张【杀】，令下一张被使用的【闪】无效"]);
			if (!used.includes("shan")) list.push(["shan", "弃置一张【闪】，令下一张被使用的【杀】无效"]);
			if (!used.includes("basic")) list.push(["basic", "弃置两张基本牌，令下一张被使用的基本牌或普通锦囊牌无效"]);
			// 注意：必须是 [[[link, 文本], ...], "textbutton"] 这种形式；
			// 写成 [文本, link] 会让 Dialog.add 落到 ui.create.buttons(文本, link) 分支，
			// 逐字符建按钮后 lib.element.Button 直接 throw "button不合法"
			return ui.create.dialog("威旅：请选择一项", [list, "textbutton"], "hidden");
		},
		filter(button, player) {
			if (player.getStorage("xiaobai_weilv_used").includes(button.link)) return false;
			return lib.skill.xiaobai_weilv.canPay(button.link, player);
		},
		check(button) {
			return 1;
		},
		backup(links, player) {
			// links[0] 就是选项键本身（原生 muzhen shiji/skill.js:8476、dczangmao huicui.js:1511 同款），
			// 不是 [文本, 键] 数组
			const link = links[0];
			return {
				audio: "xiaobai_weilv",
				position: "he",
				selectCard: link == "basic" ? 2 : 1,
				filterCard(card, player2) {
					// 【闪】的牌名是 "shan"，不是 "jink"（本引擎全库无 jink）
					if (link == "sha") return get.name(card, player2) == "sha";
					if (link == "shan") return get.name(card, player2) == "shan";
					return get.type(card, player2) == "basic";
				},
				discard: false,
				lose: false,
				delay: false,
				// 供 content 读回本次选项（原生 muzhen 用 get.info(event.name).link 读回）
				link,
				// 注意：backup 返回的是「技能 info 对象」，实际发动走 useSkill 事件，
				// 引擎在 content.js 里取的是 info.content —— 必须写 content，不能写 precontent！
				async content(event, trigger, player) {
					const choice = get.info(event.name).link;
					player.logSkill("xiaobai_weilv");
					// 「出牌阶段各限一次」：本阶段已选项记进 xiaobai_weilv_used（phaseUseEnd 过期）
					player.addTempSkill("xiaobai_weilv_used", "phaseUseEnd");
					player.markAuto("xiaobai_weilv_used", choice);
					const cards = event.cards.slice(0);
					await player.discard(cards);
					// 选择完成后，你摸X张牌（X为你弃置牌的数量）
					await player.draw(cards.length);
					// 待触发标记：保留到对应的牌被使用为止（可跨回合）
					if (choice == "sha") player.addSkill("xiaobai_weilv_mark1");
					else if (choice == "shan") player.addSkill("xiaobai_weilv_mark2");
					else player.addSkill("xiaobai_weilv_mark3");
				},
			};
		},
		prompt(links) {
			const link = links[0];
			if (link == "sha") return "威旅：弃置一张【杀】，令下一张被使用的【闪】无效";
			if (link == "shan") return "威旅：弃置一张【闪】，令下一张被使用的【杀】无效";
			return "威旅：弃置两张基本牌，令下一张被使用的基本牌或普通锦囊牌无效";
		},
	},
	group: ["xiaobai_weilv_block1", "xiaobai_weilv_block2", "xiaobai_weilv_block3"],
	subSkill: {
		// 本出牌阶段已选择过的项（markAuto 记录，随 phaseUseEnd 一起清空）
		used: {
			charlotte: true,
			onremove: true,
		},
		// 待触发：下一张被使用的【闪】无效
		mark1: {
			charlotte: true,
			mark: true,
			marktext: "闪",
			intro: {
				name: "威旅",
				content: "下一张被使用的【闪】无效",
			},
		},
		// 待触发：下一张被使用的【杀】无效
		mark2: {
			charlotte: true,
			mark: true,
			marktext: "杀",
			intro: {
				name: "威旅",
				content: "下一张被使用的【杀】无效",
			},
		},
		// 待触发：下一张被使用的基本牌或普通锦囊牌无效
		mark3: {
			charlotte: true,
			mark: true,
			marktext: "旅",
			intro: {
				name: "威旅",
				content: "下一张被使用的基本牌或普通锦囊牌无效",
			},
		},
		// 「令此牌无效」= 在 useCard 事件上 all_excluded（原生范本：
		// 闪现 shanxie_exclude character/shiji/skill.js:4218 = 令【闪】无效；
		// 设伏 stdshefu_effect character/sixiang.js:6775 = 令任意牌无效）。
		// 触发槽必须是 global（"被使用"= 任意角色使用），player 槽只会在自己用牌时触发。
		block1: {
			charlotte: true,
			sub: true,
			trigger: { global: "useCard" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (!player.hasSkill("xiaobai_weilv_mark1")) return false;
				return get.name(event.card, event.player) == "shan";
			},
			async content(event, trigger, player) {
				player.removeSkill("xiaobai_weilv_mark1");
				trigger.all_excluded = true;
				game.log(player, "发动【威旅】令", trigger.card, "无效");
			},
		},
		block2: {
			charlotte: true,
			sub: true,
			trigger: { global: "useCard" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (!player.hasSkill("xiaobai_weilv_mark2")) return false;
				return get.name(event.card, event.player) == "sha";
			},
			async content(event, trigger, player) {
				player.removeSkill("xiaobai_weilv_mark2");
				trigger.all_excluded = true;
				game.log(player, "发动【威旅】令", trigger.card, "无效");
			},
		},
		block3: {
			charlotte: true,
			sub: true,
			trigger: { global: "useCard" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (!player.hasSkill("xiaobai_weilv_mark3")) return false;
				const { card, player: owner } = event;
				const name = get.name(card, owner);
				// 同时挂着更贴切的标记时让位：一次用牌只消耗一个标记
				if (name == "shan" && player.hasSkill("xiaobai_weilv_mark1")) return false;
				if (name == "sha" && player.hasSkill("xiaobai_weilv_mark2")) return false;
				// 延时锦囊 get.type 返回 "delay"，天然被排除在「普通锦囊牌」之外
				const type = get.type(card, owner);
				return type == "basic" || type == "trick";
			},
			async content(event, trigger, player) {
				player.removeSkill("xiaobai_weilv_mark3");
				trigger.all_excluded = true;
				game.log(player, "发动【威旅】令", trigger.card, "无效");
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
// === 慰释 ===
xiaobai_weishi: {
	audio: 2,
	trigger: { global: "damageEnd" },
	filter(event, player) {
		if (!player.isIn() || !event.player?.isIn() || player.countCards("h") <= 0) return false;
		// 与你距离为1以内的角色受到伤害，且有存活来源
		if (get.distance(event.player, player) > 1) return false;
		return Boolean(event.source?.isIn());
	},
	check(trigger, player) {
		// 来源是友方才值得递牌（对方大概率改为让受伤者获得，全场摸牌）；递给敌人=白送
		return get.attitude(player, trigger.source) > 0;
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
// === 羡簇 ===
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
	onremove(player) {
		// 场上还有人持有羡簇时不要拆（羡簇可能被复制/转移给其他角色）
		if (!game.hasPlayer((current) => current.hasSkill("xiaobai_xiancu"))) {
			game.countPlayer((current) => {
				current.removeSkill("xiaobai_xiancu_o");
			});
		}
		delete player.storage.xiaobai_xiancu_suits;
	},
	group: ["xiaobai_xiancu_record", "xiaobai_xiancu_clear", "xiaobai_xiancu_mount"],
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
				// 联机同步键要写真正存放数据的 storage 键（updateMarks 用 this.storage[connect] 广播，
				// player.js:4742-4758），写成技能 id 会广播 undefined
				player.updateMarks("xiaobai_xiancu_suits");
			},
		},
		clear: {
			charlotte: true,
			sub: true,
			// 描述与原型（FreeKill xiancu.lua 用 Player.HistoryTurn 初始化 @xiaobai__xiancu-turn）都是「本回合」，
			// 不是「本轮」：roundStart 是每轮一次，phaseBeforeStart 才是每回合开始
			// （引擎在 phase 事件第 2 段重建 actionHistory，content.js:4124-4142；第 3 段派发 phaseBeforeStart，:4148-4150）
			trigger: { global: "phaseBeforeStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (player.storage.xiaobai_xiancu_suits || []).length > 0;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_xiancu_suits = [];
				player.updateMarks("xiaobai_xiancu_suits");
			},
		},
		// 全局转化：所有角色（含自己）获得羡簇的发动能力（帐灯 others 同款模式）
		// ⚠️ 不能在 init 里挂：开局 `for (i) game.players[i].init(...)` 按座次逐个初始化
		//   （noname/game/index.js:3294-3308），而 player.init 开头就 clearSkills(true)
		//   （noname/library/element/player.js:3400）⇒ 座次排在羡簇拥有者**之后**的角色，
		//   其 init 会把刚挂上的 _o 又清掉（clearSkills 只保 superCharlotte，player.js:11670-11682）。
		//   改为 gameStart / changeSkillsAfter 挂载：此时全员 init 已完成，换将/中途获得也能补挂。
		mount: {
			charlotte: true,
			sub: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: { global: ["gameStart", "changeSkillsAfter"] },
			filter(event, player) {
				return player.hasSkill("xiaobai_xiancu");
			},
			content(event, trigger, player) {
				game.countPlayer((current) => {
					current.addSkill("xiaobai_xiancu_o");
				});
			},
		},
	},
},
// 挂载到全员的羡簇转化技（charlotte：不显示在技能栏但可用）
xiaobai_xiancu_o: {
	charlotte: true,
	enable: ["chooseToUse", "phaseUse"],
	// 羡簇拥有者 = 受益者（场上第一个持有羡簇的角色）
	beneficiary() {
		return game.findPlayer((current) => current.hasSkill("xiaobai_xiancu"));
	},
	filter(event, player) {
		const beneficiary = lib.skill.xiaobai_xiancu_o.beneficiary();
		if (!beneficiary?.isIn() || !beneficiary.isDamaged()) return false;
		if (!lib.skill.xiaobai_xiancu_o.checkCards(player)) return false;
		if (event.skill == "xiaobai_xiancu_o" || event._skill == "xiaobai_xiancu_o") return true;
		if (event.name == "chooseToUse" && event.type == "dying") {
			// 濒死求桃窗口：只有「羡簇拥有者本人濒死」才成立（描述里的「你濒死」）
			if (event.dying != beneficiary) return false;
			return Boolean(event.filterCard?.(get.autoViewAs({ name: "tao" }, "unsure"), player, event));
		}
		if (event.name == "chooseToUse" && event.type == "phase") {
			// 出牌阶段窗口：受益者已受伤（上面已判），桃对其可用；目标由本技能的 filterTarget 放行
			return true;
		}
		return false;
	},
	// 两张与本回合进入弃牌堆花色均不同的手牌（花色口径与 record 一致：get.suit(card)）
	checkCards(player) {
		const beneficiary = lib.skill.xiaobai_xiancu_o.beneficiary();
		if (!beneficiary) return false;
		const suits = beneficiary.storage.xiaobai_xiancu_suits || [];
		return player.countCards("h", (card) => !suits.includes(get.suit(card))) >= 2;
	},
	filterCard(card) {
		const beneficiary = lib.skill.xiaobai_xiancu_o.beneficiary();
		const suits = beneficiary?.storage.xiaobai_xiancu_suits || [];
		return !suits.includes(get.suit(card));
	},
	// 【桃】自带的 filterTarget 只允许「使用者自己且自己已受伤」（card/standard.js:530-544），
	// 而本技能的目标是羡簇拥有者（常常不是使用者本人），必须在技能层覆盖。
	// 覆盖点：ui.click.skill 点技能按钮 → event.backup(skill)（noname/library/element/gameEvent.js:710-841）
	//   里 `if (info.viewAs) { ... if (info.filterTarget != void 0) this.filterTarget = get.filter(info.filterTarget); }`
	//   ⇒ 转化技的技能级 filterTarget 会被写进 chooseToUse 事件，game.Check.target（noname/game/check.js:123-138）随之生效。
	// 原来靠 precontent 事后改 event.result.targets 是错的：目标在选择环节就被桃的 filterTarget 卡死，改结果没用。
	filterTarget(card, player, target) {
		if (target !== lib.skill.xiaobai_xiancu_o.beneficiary()) return false;
		// 濒死窗口沿用引擎原本的目标校验（_save 里对 dying 的 playerEnabled / targetEnabled 检查，content.js:26-46）；
		// 出牌阶段必须完全替换——桃自己的 filterTarget 只放行「使用者自己且自己已受伤」。
		const evt = get.event();
		if (evt?.type === "dying" && typeof evt._backup?.filterTarget === "function") {
			return Boolean(evt._backup.filterTarget(card, player, target));
		}
		return true;
	},
	selectCard: 2,
	selectTarget: 1,
	position: "h",
	viewAs: { name: "tao", isCard: true },
	prompt: "羡簇：将两张与本回合进入弃牌堆花色均不同的牌当【桃】对其使用",
	check(card) {
		return 6 - get.value(card);
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
// === 显灾 ===
xiaobai_xianzai: {
	audio: 2,
	hiddenSkill: true,
	locked: true,
	forced: true,
	mark: true,
	marktext: "灾",
	init(player, skill) {
		if (typeof player.storage[skill] != "number") player.storage[skill] = 0;
		// 「灾显」全局毒化（yjdumou 同款：全局 mod；g_du 一并全局化保证毒的失去体力结算可用）
		// 隐匿/亮将会反复 addSkill → init 重复执行，addGlobalSkill 需幂等保护
		if (!lib.skill.global.includes("xiaobai_xianzai_du")) game.addGlobalSkill("xiaobai_xianzai_du");
		if (lib.skill.g_du && !lib.skill.global.includes("g_du")) game.addGlobalSkill("g_du");
	},
	onremove(player, skill) {
		if (!game.hasPlayer((i) => i.hasSkill("xiaobai_xianzai", null, null, false), true)) {
			game.removeGlobalSkill("xiaobai_xianzai_du");
			if (lib.skill.g_du) game.removeGlobalSkill("g_du");
		}
	},
	intro: {
		content(storage) {
			const count = typeof storage == "number" ? storage : 0;
			const list = [
				"令一名角色摸两张牌，然后其明置一张手牌，令该牌视为【毒】",
				"你重复横置一名角色，视为对其使用【火攻】直到你未造成伤害",
				"你将手牌摸至四张并与当前回合角色交换手牌",
			];
			let str = `已登场${get.cnNumber(count)}次（至多三次）。`;
			if (count < 3) str += `<br>下次登场：${list[count]}`;
			return str;
		},
	},
	group: ["xiaobai_xianzai_show", "xiaobai_xianzai_rehide"],
	subSkill: {
		show: {
			// 登场（引擎自动亮将后），按登场次数递进执行效果
			name: "显灾",
			charlotte: true,
			trigger: { player: "showCharacterAfter" },
			forced: true,
			filter(event, player) {
				return event.toShow?.some((name) => (get.character(name, 3) || []).includes("xiaobai_xianzai"));
			},
			async content(event, trigger, player) {
				const count = (player.storage.xiaobai_xianzai || 0) + 1;
				player.storage.xiaobai_xianzai = count;
				player.updateMarks("xiaobai_xianzai");
				if (count < 3) player.storage.xiaobai_xianzai_rehide = true;
				const current = _status.currentPhase;
				// 记录额定回合（每次登场都记录，含自己的回合；对齐 FreeKill）
				// 归属存角色对象而非座位号（换座/中途加入会改座位号，见 xiaobaiXianzaiRecord 注释）
				if (current?.isIn()) {
					lib.xiaobaiXianzaiRecord(player).push([current, count]);
					current.addSkill("xiaobai_xianzai_effect" + count);
					game.log(current, "的回合成为了", "#g【显灾】", "的额定回合");
				}
				if (count == 1) {
					const res = await player
						.chooseTarget(true, "显灾：令一名角色摸两张牌并明置一张牌为【毒】", (card, me, target) => target.isIn())
						.set("ai", (target) => get.attitude(get.player(), target))
						.forResult();
					if (res?.targets?.length) await lib.xiaobaiXianzaiEffect1(res.targets[0]);
				} else if (count == 2) {
					await lib.xiaobaiXianzaiEffect2(player);
				} else {
					await lib.xiaobaiXianzaiEffect3(player, current);
				}
			},
		},
		rehide: {
			// 前两次登场的回合结束后：再次隐匿
			name: "显灾",
			charlotte: true,
			trigger: { global: "phaseAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.storage.xiaobai_xianzai_rehide == true;
			},
			async content(event, trigger, player) {
				delete player.storage.xiaobai_xianzai_rehide;
				if (player.isIn() && !player.isUnseen(2)) {
					lib.xiaobaiEnterHidden(player);
					game.log(player, "再次进入了隐匿状态");
				}
			},
		},
		// 「灾显」全局毒化：被明置的【毒】牌（xiaobai_xianzai_du 标记）按【毒】名称结算（yjdumou 同款）
		du: {
			charlotte: true,
			mod: {
				cardname(card) {
					if (card?.storage?.xiaobai_xianzai_du && get.name(card, false) != "du") {
						return "du";
					}
				},
				aiValue(player, card, num) {
					if (get.name(card, false) == "du" && card.name != "du") {
						return get.value({ name: card.name });
					}
				},
			},
			trigger: { player: "dieAfter" },
			forceDie: true,
			silent: true,
			filter() {
				return !game.hasPlayer((i) => i.hasSkill("xiaobai_xianzai", null, null, false), true);
			},
			content() {
				game.removeGlobalSkill("xiaobai_xianzai_du");
				if (lib.skill.g_du) game.removeGlobalSkill("g_du");
			},
		},
		// 额定回合的可见标记（虫入人耳/大火及宫/置腹相谈）
		// 文本各自写明「这次登场对应的具体效果」，别再写同一句泛泛的说明
		effect1: {
			charlotte: true,
			mark: true,
			marktext: "虫",
			intro: {
				name: "虫入人耳",
				content: "〖显灾〗首次登场的额定回合。<br>〖司酆〗可于此回合开始前发动：令你摸两张牌，然后你明置一张手牌，该牌视为【毒】。",
			},
		},
		effect2: {
			charlotte: true,
			mark: true,
			marktext: "火",
			intro: {
				name: "大火及宫",
				content: "〖显灾〗第二次登场的额定回合。<br>〖司酆〗可于此回合开始前发动：重复横置你，并视为对你使用【火攻】，直到未造成伤害。",
			},
		},
		effect3: {
			charlotte: true,
			mark: true,
			marktext: "谈",
			intro: {
				name: "置腹相谈",
				content: "〖显灾〗第三次登场的额定回合。<br>〖司酆〗可于此回合开始前发动：〖司酆〗持有者将手牌摸至四张，然后与你交换手牌。",
			},
		},
	},
},
// === 嚣獚 ===
xiaobai_xiaohuang: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => lib.skill.xiaobai_xiaohuang.filterTarget(null, player, current));
	},
	filterTarget(card, player, target) {
		return target != player && target.countCards("h") >= target.hp;
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
					.chooseTarget("嚣獚：对一名手牌数不小于体力值的其他角色发动「挑衅」", 1, (card, player2, targetx) => lib.skill.xiaobai_xiaohuang.filterTarget(null, player, targetx))
					.set("ai", (target) => -get.attitude(player, target))
					.forResult();
				if (res?.bool && res.targets?.length) {
					await lib.xiaobaiTiaoxinFlow(player, res.targets[0]);
				}
			},
		},
		// 「严教」额外亮牌数标记（挑衅用杀后 markSkill，严教流程消费）
		yj: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "亮",
			intro: { name: "严教", content: (storage) => "下次发动「严教」时额外亮出" + (storage || 0) + "张牌" },
		},
	},
	ai: {
		order: 6,
		result: {
			player: 1,
		},
	},
},
// === 消心 ===
xiaobai_xiaoxin: {
	audio: 2,
	trigger: { global: "damageEnd" },
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
			.set("ai", () => {
				// 友方且确实能回血才发动：收益=回复效果，成本=自己最便宜的一张牌
				if (get.attitude(player, target) <= 0 || !target.isDamaged()) return 0;
				const heal = get.recoverEffect(target, player, player);
				if (heal <= 0) return 0;
				const cheapest = player.getCards("he").reduce((min, card) => Math.min(min, get.value(card, player)), 6);
				return heal - cheapest;
			})
			.forResult();
		event.result = res?.bool ? { bool: true, cost_data: { target } } : { bool: false };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_xiaoxin");
		player.addTempSkill("xiaobai_xiaoxin_used", "phaseAfter");
		const target = event.cost_data.target;
		// 同时各弃置一张牌（依次模拟同时）；自己弃便宜牌，点数居中（4~10）的“±3 命中窗”最宽，同价值下优先
		const myRes = await player
			.chooseCard("he", true, 1, "消心：请弃置一张牌")
			.set("ai", (card) => 5 - get.value(card) + (get.number(card) >= 4 && get.number(card) <= 10 ? 0.5 : 0))
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
		// 点数相差不大于3 → 其回复1点体力（相同点数也满足，"0除外"已取消）
		const diff = Math.abs(get.number(myCard) - get.number(toCard));
		if (diff <= 3 && target.isIn() && target.isDamaged()) {
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
// === 心逞 ===
xiaobai_xincheng: {
	audio: 2,
	locked: true,
	forced: true,
	// 结束阶段：视为对自己使用至少一张（至多五张）【火攻】
	trigger: { player: "phaseJieshuBegin" },
	filter(event, player) {
		return player.isIn() && player.countCards("h") > 0;
	},
	async content(event, trigger, player) {
		const isBlack = (card) => get.color(card, player) == "black";
		const hadBlack = player.countCards("h", isBlack) > 0;
		for (let i = 0; i < 5; i++) {
			if (player.isDead() || player.countCards("h") == 0) break;
			if (!player.canUse({ name: "huogong", isCard: true }, player, true, false)) break;
			await player.useCard(get.autoViewAs({ name: "huogong" }, []), [player], "xiaobai_xincheng").set("addCount", false);
			if (player.isDead() || player.countCards("h") == 0 || i >= 4) break;
			if (!player.canUse({ name: "huogong", isCard: true }, player, true, false)) break;
			const go = await player
				.chooseBool("心逞：是否继续视为对自己使用一张【火攻】？")
				.set("ai", () => (player.countCards("h", isBlack) > 0 ? 1 : 0))
				.forResult();
			if (!go?.bool) break;
		}
		// 因此失去手牌中所有黑色牌后：展示手牌并摸四张牌
		// 不论黑色牌是在火攻弃牌里失去，还是在火攻的无懈窗口里被谦仁转化消耗，只要结算后手牌已无黑色牌就成立
		if (hadBlack && player.isIn() && player.countCards("h", isBlack) == 0) {
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
// === 幸乱 ===
xiaobai_xingluan: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { player: "phaseJieshuBegin" },
	filter(event, player) {
		return player.isIn() && game.hasPlayer((current) => current != player && current.isIn());
	},
	async content(event, trigger, player) {
		const res = await player
			.chooseTarget(true, "幸乱：选择一名其他角色，与其依次执行一项", (card, me, target) => target != me && target.isIn())
			.set("ai", (target) => -get.attitude(get.player(), target))
			.forResult();
		if (!res?.bool || !res.targets?.length) return;
		await lib.xiaobaiXingluanFlow(player, res.targets[0]);
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
			.set("ai", (target) => {
				// 绑定队友即可（死亡联动）：非队友一票否决；队友里偏向体量大的（更不容易先死拖累自己）
				const base = get.attitude(player, target);
				if (base <= 0) return base - 5;
				return base + target.hp + target.maxHp * 0.5;
			})
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
	// 改手牌上限必须挂 handcard.png（R18）；数值由其他角色的 xingzu_target 推得、无自身 storage，
	// 用 mark: true 让 addSkill 自动挂标记（player.js:10954）
	mark: true,
	markimage: "image/card/handcard.png",
	intro: {
		name: "兴族",
		content(storage, player) {
			const count = game.countPlayer((current) => current.hasSkill("xiaobai_xingzu") && current.storage.xiaobai_xingzu_target == player.playerid);
			return `<li>手牌上限+${count}（选中你的兴族持有者数）<br><li>当前手牌上限：${player.getHandcardLimit()}`;
		},
	},
	mod: {
		maxHandcard(player, num) {
			if (!game.players || !game.players.length) return;
			const count = game.countPlayer((current) => current.hasSkill("xiaobai_xingzu") && current.storage.xiaobai_xingzu_target == player.playerid);
			if (count > 0) return num + count;
		},
	},
},
// === 凶谶 ===
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
		let revealed = 0;
		let judgeCard = null; // ★ 作为判定牌的那张【杀】
		for (let i = 0; i < 40; i++) {
			if (player.isDead()) return;
			if (ui.cardPile.childNodes.length == 0) {
				shuffled = true;
				break;
			}
			const card = get.cards(1)[0];
			// ★ 每张亮出的牌都播放"抛出展示"动画（原先只有【杀】调了 showCards，
			//   其余牌直接进 collected → 玩家看不到亮出过程）。
			//   helper 内部已 cardsGotoOrdering 进处理区，故原【杀】分支的那句
			//   `game.cardsGotoOrdering([card])` 不再需要（结果一致）。
			await lib.xiaobaiXiongchenReveal(player, card, ++revealed);
			if (get.name(card) == "sha") {
				judgeCard = card; // ★ 该【杀】即判定牌
				break;
			}
			collected.push(card);
		}
		// 清空展示舞台（牌仍在处理区，可正常 gain）
		game.broadcastAll(function () {
			ui.clear();
		});
		if (collected.length) {
			await player.gain(collected, "gain2");
		}
		// ★★「你令此【杀】作为你的判定牌」—— 必须**产出判定结果**。
		//   本技能 `trigger.cancel()` 取消了原判定（判定事件的 content 不再执行、`result` 不设置），
		//   若这里也不补，被接管的判定（如〖言祸〗的闪电判定）就永远拿不到结果：
		//   `await judgeEvent.forResult()` 返回 undefined（`forResult` 就是 `return this.result`，
		//   gameEvent.js:115-118）→ 下游写 `result.judge` 抛 TypeError → **中断其整个 content**
		//   （引擎 ignore_error 静默吞掉）—— 这正是"言祸阳项发动后没转成阴"的真根因。
		//   result 结构逐字段对齐引擎 judge 的 content（content.js:11969-11989）。
		if (judgeCard) {
			player.judging.unshift(judgeCard); // 判定牌进判定区（对齐引擎 judge content）
			trigger.result = {
				card: judgeCard,
				name: judgeCard.name,
				number: get.number(judgeCard),
				suit: get.suit(judgeCard),
				color: get.color(judgeCard),
			};
			if (trigger.fixedResult) {
				for (const i in trigger.fixedResult) {
					trigger.result[i] = trigger.fixedResult[i];
				}
			}
			// 判定值由**调用方传入的判定函数**决定（如〖言祸〗的"闪电判定"规则：
			// 黑桃2~9 记 3、其余记 -3），与本技能的"换判定牌"职责正交。
			const judgeFn = trigger.judge || (() => 0);
			trigger.result.judge = judgeFn(trigger.result);
			if (trigger.result.judge > 0) {
				trigger.result.bool = true;
			} else if (trigger.result.judge < 0) {
				trigger.result.bool = false;
			} else {
				trigger.result.bool = null;
			}
			player.judging.shift();
			game.log(player, "的判定结果为", trigger.result.card);
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
				// 用户定：集中打同一人。目标选择已经偏向敌方（-get.attitude），
				// 所以这里直接给满（num = min(剩余, 3)），一次打完，不再拆成多次1点。
				.set("ai", () => opts[opts.length - 1])
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
// === 玄辩 ===
xiaobai_xuanbian: {
	audio: 2,
	trigger: { global: "useCardAfter" },
	direct: true,
	filter(event, player) {
		const stage = player.storage.xiaobai_gushou_stage || 0;
		if (stage <= 0 || !player.isIn() || !event.player?.isIn() || event.player == player) return false;
		if (player.countCards("h") == 0 || event.player.countCards("h") == 0) return false;
			const card = event.card;
			// 该牌匹配的已删去项可能有多个（如13点决斗=伤害+锦囊+K）：
			// 优先级 K点>锦囊>伤害（越宽泛越靠后），本轮已用的项顺延到下一个匹配项；全部用尽则不触发
			const used = player.storage.xiaobai_xuanbian_used || [];
			const matches = [];
			if (stage > 2 && get.number(card) == 13) matches.push("K");
			if (stage > 1 && get.type(card) == "trick" && get.type(card, null) != "delay") matches.push("trick");
			if (stage > 0 && get.tag(card, "damage")) matches.push("damage");
			const key = matches.find((k) => !used.includes(k)) || null;
			if (!key) return false;
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
// === 旋尘 ===
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
	filter(event, player) {
		return player.isIn();
	},
	async cost(event, trigger, player) {
		const ctrl = await player
			.chooseControl(["模式一", "模式二", "cancel2"])
			.set("choiceList", ["你的【杀】视为任意单目标普通锦囊牌，其他角色的【闪】视为【无懈可击】", "你的非基本手牌视为无次数限制的【杀】，其他角色的非基本手牌视为【闪】"])
			.set("prompt", "旋尘：请选择本回合的效果")
			// 用户定的思路：**先模式一**，用单目标锦囊（无中/顺手/拆）把牌养起来；
			// 养不动了（没杀、或补牌锦囊都用不了）才切模式二直接输出。
			// 注意模式不是锁死的——获得牌或造成伤害时会自动翻面（xiaobai_xuancheng_switch），
			// 所以这里只决定「本阶段起手用哪一面」。
			.set("ai", () => {
				const me = get.player();
				const hasSha = me.countCards("h", (card) => card.name == "sha") > 0;
				// 模式一的补牌/拆牌素材：把【杀】当成这些锦囊用
				const buildUp = ["wuzhong", "shunshou", "guohe"].filter((name) => me.hasUseTarget({ name, isCard: true }, null, false));
				// 模式二的输出条件：手里有非基本牌，且攻击范围内有敌人
				const nonBasic = me.countCards("h", (card) => lib.card[card.name]?.type != "basic");
				const canHit = game.hasPlayer((current) => current != me && current.isIn() && get.attitude(me, current) < 0 && me.inRange(current));
				if (hasSha && buildUp.length) return "模式一"; // 有杀 + 有补牌锦囊 → 先养
				if (nonBasic > 0 && canHit) return "模式二"; // 养不动 → 直接输出
				return hasSha ? "模式一" : "模式二";
			})
			.forResult();
		if (!ctrl?.control || ctrl.control == "cancel2") return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { mode: ctrl.control == "模式一" ? 1 : 2 } };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_xuancheng");
		player.storage.xiaobai_xuancheng_mode = event.cost_data.mode;
		player.addTempSkill("xiaobai_xuancheng_mode", "phaseAfter");
		// 自己侧：模式1 把【杀】当单目标普通锦囊 / 模式2 把非基本手牌当无次数限制的【杀】
		player.addTempSkill("xiaobai_xuancheng_self", "phaseAfter");
		// 全场侧：其他角色把【闪】当【无懈可击】/ 把非基本手牌当【闪】
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
		// 「使用牌不受次数限制」的旧模板（同 xiaobai_cetu_free / xiaobai_jinti_free）。
		// 模式二改成 mod.cardname 强制视为后，无次数限制直接在 xiaobai_xuancheng_self.mod.cardUsable
		// 里按「底牌非基本」判定（只放开被转化的那张，真【杀】仍受次数限制），
		// 不再需要 addTempSkill 挂这个全局放开次数的子技能 → 保留定义仅为兼容旧存档/回放，勿再挂载。
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
	ai: {
		result: {
			player: 1,
		},
	},
},
// === 旋尘 ===
// 旋尘全场侧：其他角色的【闪】→【无懈可击】（模式1）/ 非基本手牌→【闪】（模式2）
//
// 「强制视为」= 争绝式 mod.cardname（sanshe.js:14343-14347、onlyOL.js:14252-14258）：
// 牌名直接被改掉，没有「要不要转」的选择，也没有 chooseButton 转化流程。
// 代价同样成立：这张牌不能再当它原来的牌名使用（模式1的【闪】不再能当【闪】）。
// 之前这里是 chooseToUse + chooseButton 的转化写法（可选、且原牌仍可用），与描述的「视为」不符。
xiaobai_xuancheng_o: {
	charlotte: true,
	mod: {
		cardname(card, player) {
			const owner = game.findPlayer((current) => current.hasSkill("xiaobai_xuancheng"));
			if (!owner?.isIn()) return;
			const mode = owner.storage.xiaobai_xuancheng_mode || 0;
			if (!mode) return;
			// 只改实体手牌的牌名；vcard 的牌名由引擎给出，再改会打架
			if (get.itemtype(card) != "card") return;
			if (get.position(card) != "h") return;
			if (mode == 1) {
				if (card.name == "shan") return "wuxie";
				return;
			}
			// 模式2：非基本手牌 → 【闪】
			if (lib.card[card.name]?.type == "basic") return;
			return "shan";
		},
	},
},
// === 旋尘 ===
// 旋尘转化·自己侧（模式1：杀当单目标普通锦囊用；模式2：非基本手牌当无次数限制的杀用）
// ⚠️ 不能叫 xiaobai_xuancheng_o：本扩展里 `_o` 专指「其他角色侧/全局挂载」
//    （见 xiaobai_xiancu_o / xiaobai_ziyi_o / xiaobai_zhenyi_o），
//    而全场侧那套（本文件下方 xiaobai_xuancheng_o）才是 `_o`。
//    历史上两处都叫 xiaobai_xuancheng_o → 后定义覆盖前定义 → 自己侧整段失效。
xiaobai_xuancheng_self: {
	charlotte: true,
	// ============ 模式二：非基本手牌「强制视为」无次数限制的【杀】 ============
	// 争绝式 mod.cardname（sanshe.js:14343-14347 / onlyOL.js:14252-14258）：
	// 直接改牌名，不走 chooseButton 转化 —— 玩家没有「要不要转」的选择，牌名就是【杀】。
	// 代价也随之成立：这张牌不能再当它原来的牌名使用。
	mod: {
		cardname(card, player) {
			if ((player.storage.xiaobai_xuancheng_mode || 0) != 2) return;
			// 只对**实体手牌**生效：vcard 的牌名已由引擎给出，再改会打架
			if (get.itemtype(card) != "card") return;
			if (get.position(card) != "h") return;
			if (lib.card[card.name]?.type == "basic") return;
			return "sha";
		},
		// 「无次数限制」：只对**被转化的那张**（底牌非基本）放开，真【杀】仍按正常次数
		cardUsable(card, player) {
			if ((player.storage.xiaobai_xuancheng_mode || 0) != 2) return;
			const real = (get.itemtype(card) == "vcard" && card.cards?.[0]) || card;
			if (get.itemtype(real) != "card") return;
			if (lib.card[real.name]?.type == "basic") return;
			if (get.position(real) != "h") return;
			return Infinity;
		},
		// ============ 模式一：【杀】强制视为单目标普通锦囊 ============
		// 「强制」= 模式一里【杀】不能再当【杀】正常使用（连响应窗口也不行）。
		// 挑龙同款手法（sanshe.js:10361-10370 用 cardEnabled 封锁被转化的牌名）。
		cardEnabled(card, player) {
			if ((player.storage.xiaobai_xuancheng_mode || 0) != 1) return;
			const real = (get.itemtype(card) == "vcard" && card.cards?.[0]) || card;
			if (get.itemtype(real) != "card") return;
			if (real.name != "sha") return;
			if (get.position(real) != "h") return;
			return false;
		},
	},
	// ============ 模式一的多牌名部分：只能走挑龙式「仅可当作…使用」 ============
	// 「视为任意单目标普通锦囊牌」的牌名不唯一，mod.cardname 只能返回单个名字，
	// 所以这里保留 chooseButton 转化：先选牌名，再把【杀】当该牌使用。
	enable: ["chooseToUse", "phaseUse"],
	// 预检：模式一下「杀可当锦囊」引擎扫不到（杀被 cardEnabled 封了），
	// 用 hiddenCard 声明这些锦囊名可被印出，无懈/借刀等窗口才评估得到。
	hiddenCard(player, name) {
		if ((player.storage.xiaobai_xuancheng_mode || 0) != 1) return false;
		if (!lib.xiaobaiXuanchengTrickNames(player).includes(name)) return false;
		return player.countCards("h", (card) => card.name == "sha") > 0;
	},
	filter(event, player) {
		if ((player.storage.xiaobai_xuancheng_mode || 0) != 1) return false;
		if (!player.isIn()) return false;
		if (event.skill == "xiaobai_xuancheng_self" || event._skill == "xiaobai_xuancheng_self") return true;
		if (player.countCards("h", (card) => card.name == "sha") == 0) return false;
		// 至少有一个「单目标普通锦囊」在当前窗口可用，否则不亮技能（避免空按钮）
		return lib.xiaobaiXuanchengTrickNames(player).some((name) =>
			Boolean(event.filterCard?.(get.autoViewAs({ name, isCard: true }, "unsure"), player, event)),
		);
	},
	chooseButton: {
		dialog(event, player) {
			const names = lib.xiaobaiXuanchengTrickNames(player);
			const list = names.map((name) => [get.type(name), "", name]);
			return ui.create.dialog("旋尘：将一张【杀】当作单目标普通锦囊牌使用", [list, "vcard"]);
		},
		// 只列当前窗口真能用的锦囊（同挑龙 sanshe.js:10382-10398）：
		// 否则会出现「点了某锦囊却没有合法目标」的空按钮。
		filter(button, player) {
			const evt = _status.event.getParent();
			const name = button.link[2];
			if (!evt || typeof evt.filterCard != "function") return true;
			return Boolean(evt.filterCard(get.autoViewAs({ name, isCard: true }, "unsure"), player, evt));
		},
		check(button) {
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2] }, null, true));
		},
		backup(links, player) {
			const name = links[0][2];
			// useSkill 兜底（见下方 content）要靠它还原选中的牌面
			player.storage.xiaobai_xuancheng_picked = name;
			return {
				audio: "xiaobai_xuancheng",
				filterCard(card, player2) {
					return card.name == "sha" && get.position(card) == "h";
				},
				selectCard: 1,
				position: "h",
				viewAs: { name, isCard: true, storage: { xiaobai_xuancheng: true } },
				precontent(event, trigger, player) {
					delete player.storage.xiaobai_xuancheng_picked;
					player.logSkill("xiaobai_xuancheng");
				},
			};
		},
		prompt(links) {
			return "旋尘：将一张【杀】当作【" + get.translation(links[0][2]) + "】使用";
		},
	},
	// useSkill 兜底：chooseToUse 收尾若结果缺 card 会改走 useResult→player.useSkill（content.js:7373），
	// 而 useSkill 无条件读取 info.content 建技能事件（content.js:9924）；缺 content 会留下无 content 的事件，
	// 运行到 gameEvent.js:232 报 this.content is not a function（父事件正是 useSkill）。
	// 正常走 chooseButton.backup 的 precontent，不会到这里；这里只补一条等价结算路径。
	async content(event, trigger, player) {
		const picked = player.storage.xiaobai_xuancheng_picked;
		delete player.storage.xiaobai_xuancheng_picked;
		if (!picked) return;
		const cards = (event.cards || []).filter((card) => ["h", "d", "s"].includes(get.position(card, true)));
		if (!cards.length) return;
		// 转化：底牌要真正作为这【杀】的牌参与使用（同迭锋的坑）
		await player.useCard(get.autoViewAs({ name: picked, isCard: true, storage: { xiaobai_xuancheng: true } }, cards), cards, event.targets || []);
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},
// === 喧富 ===
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
// === 悬鱼 ===
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
				.set("ai", () => {
					// 非自己回合要用刚获得的牌抵账：回复收益须大于牌值损失
					const heal = get.recoverEffect(player, player, player);
					if (_status.currentPhase == player) return heal > 0;
					const cost = gained.reduce((sum, card) => sum + get.value(card, player), 0);
					return heal - cost / 2 > 0;
				})
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
// === 悬鱼宝物 ===
// 悬鱼宝物装备技能：失去牌后可判定，颜色相符则获得判定牌
xiaobai_xuanyubao_skill: {
	equipSkill: true,
	trigger: { player: "loseAfter" },
	direct: true,
	filter(event, player) {
		return player.hasCard(card => get.name(card) === "xiaobai_xuanyubao", "e");
	},
	async content(event, trigger, player) {
		const treasure = player.getCards("e", card => get.name(card) === "xiaobai_xuanyubao")[0];
		if (!treasure) return;
		const ctrl = await player
			.chooseControl("牌堆顶", "牌堆底")
			.set("prompt", "悬鱼宝物：选择从哪侧判定")
			// 判定成功条件 = 判定牌颜色与宝物颜色相同；宝物颜色是玩家自己放进去的，已知。
			// 顶/底本身对 AI 是对称的，差别只在「知不知道那一侧是什么」：
			//   · 持有者（羊续/悬鱼）的另一技能是〖观历〗——把**牌堆底**若干张搬到**牌堆顶**、
			//     并在他人回合结束时看**牌堆顶**五张再把一张放**牌堆底**。
			//     也就是说他能安排/知道的是「顶」（以及他刚放到顶上的那批），底只有被放下去的那一张。
			//   · 所以默认选「牌堆顶」：这是唯一被他操作过、且被 观星式 AI 按价值排过序的一侧。
			// 没有可靠的「已知底牌颜色」状态可用（观历的 watch 只记录被放下去的单张，且不落 storage），
			// 因此不做底侧特判。
			.set("ai", () => 0)
			.forResult();
		if (!ctrl?.control) return;
		const fromBottom = ctrl.control == "牌堆底";
		const judgeResult = await player
			.judge(card => get.color(card) === get.color(treasure) ? 1 : -1)
			.set("bottom", fromBottom)
			.forResult();
		if (judgeResult?.judge > 0 && judgeResult?.card) {
			await player.gain(judgeResult.card, "gain2");
		}
	},
},
// === 血扞 ===
xiaobai_xuehan: {
	audio: 2,
	// 一名没有「血扞」牌的角色受到伤害时：将若干张其装备区内的牌置于其武将牌上，此伤害-1
	trigger: { global: "damageBegin2" },
	filter(event, player) {
		if (!player.isIn() || event.num < 1) return false;
		const target = event.player;
		if (!target?.isIn()) return false;
		// 武将牌上已有「血扞」牌的角色不再触发（gaintag 必须与标记技能名一致）
		if (target.getExpansions("xiaobai_xuehan_mark").length > 0) return false;
		// 其装备区里有牌才有着落
		return target.countCards("e") > 0;
	},
	async cost(event, trigger, player) {
		const target = trigger.player;
		// 素材是其装备区内的牌，故用 choosePlayerCard 从对方装备区选
		const res = await player
			.choosePlayerCard("e", target, [1, target.countCards("e")], `血扞：将${get.translation(target)}装备区内的若干张牌置于其武将牌上，令此伤害-1`)
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.cards?.length) return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { cards: res.cards, target } };
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_xuehan");
		const { cards, target } = event.cost_data;
		// 置于其武将牌上；gaintag 与标记技能名一致，引擎 addToExpansion 会自动 markSkill(gaintag)，
		// 标记简介用 "expansion" 才能在浮窗里列出这些牌
		await target.addToExpansion({ cards, source: player, animate: "give", gaintag: ["xiaobai_xuehan_mark"] });
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
				// ⚠ filter 里没有 trigger 参数，用牌者是 event.player（旧代码写 trigger.player 会 ReferenceError → 整段被吞）
				const target = event.player;
				if (!target?.isIn()) return false;
				const pile = target.getExpansions("xiaobai_xuehan_mark");
				if (!pile.length) return false;
				const suit = get.suit(event.card, target);
				return Boolean(suit) && pile.some((card) => get.suit(card) == suit);
			},
			async content(event, trigger, player) {
				const target = trigger.player;
				const suit = get.suit(trigger.card, target);
				const pile = target.getExpansions("xiaobai_xuehan_mark");
				const remove = pile.filter((card) => get.suit(card) == suit);
				if (!remove.length) return;
				const go = await target
					.chooseBool(`血扞：移去武将牌上所有【${get.translation(suit)}】血扞牌并摸${get.cnNumber(remove.length)}张牌`)
					.set("ai", () => 1)
					.forResult();
				if (!go?.bool) return;
				player.logSkill("xiaobai_xuehan");
				for (const card of remove) {
					if (target.getExpansions("xiaobai_xuehan_mark").includes(card)) {
						await target.loseToDiscardpile({ cards: [card] });
					}
				}
				await target.draw(remove.length);
				// 武将牌上不再有「血扞」牌则收掉标记
				if (target.isIn() && !target.getExpansions("xiaobai_xuehan_mark").length) {
					target.unmarkSkill("xiaobai_xuehan_mark");
				}
			},
		},
	},
},
// 「血扞」呈现：武将牌上的牌在本版本不显示（node.expansions 是 display:none），
// 故用标记 + intro.content/markcount = "expansion"，在标记浮窗里列出牌并显示张数
xiaobai_xuehan_mark: {
	charlotte: true,
	mark: true,
	marktext: "扞",
	intro: { name: "血扞", content: "expansion", markcount: "expansion" },
},
// === 寻龙 ===
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
			// filterTarget 读 ui.selected.targets ⇒ 关掉目标缓存（game/index.js:6916 filterCache）
			.set("complexTarget", true)
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
			// ⚠️ 显式 priority：clear 必须先于主技能的 roundStart 询问执行（先清上一轮名单、
			// 主技能再选新的）——同优先级下主技能整条 cost+content 先跑完，clear 会把刚选的名单抹掉
			priority: 1,
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
// === 寻鹿 ===
// 失效呈现走文档标准（坑-技能失效与标记显示.md）：disableSkill → 描述自动变灰，不用 mark。
// ⚠️ damage/count/clear 三个子技能不进 group——disableSkill 会沿 group 级联禁用，
// 把「已承诺的本回合下次伤害+1」一起禁掉（知识库 #59 / 妙喻实测）——改为 init 动态独立挂载。
xiaobai_xunlu: {
	audio: 2,
	// 当前回合角色本回合第二次摸牌/弃牌时
	trigger: { global: ["drawEnd", "discardAfter"] },
	filter(event, player) {
		if (!player.isIn()) return false;
		// 失效期间主技能被 game.filterSkills 摘除、触发器不会进来，无需再判失效标记。
		// “第二次摸牌/弃牌”：count 子技能按显式优先级先记账（含本次），读到 2 即第二次
		const current = _status.currentPhase;
		if (!current?.isIn()) return false;
		if (event.player != current) return false;
		return event.name == "draw"
			? (current.storage.xiaobai_xunlu_draw || 0) == 2
			: (current.storage.xiaobai_xunlu_discard || 0) == 2;
	},
	async cost(event, trigger, player) {
		const current = _status.currentPhase;
		const res = await player
			.chooseBool("寻鹿：你可以与" + get.translation(current) + "各摸一张牌，其本回合下次造成伤害时你失去1点体力令此伤害+1")
			.set("ai", () => (get.attitude(player, current) > 0 ? 1 : 0))
			.forResult();
		if (!res?.bool) {
			// 拒绝发动寻鹿 → 恢复追舳（enableSkill 传禁用方键，坑-技能失效文档④）
			if (player.hasSkill("xiaobai_zhuizhu_disabled")) {
				player.enableSkill("xiaobai_zhuizhu_disabled");
				player.removeSkill("xiaobai_zhuizhu_disabled");
				game.log(player, "的〖追舳〗恢复");
			}
			return void (event.result = { bool: false });
		}
		event.result = { bool: true, cost_data: { current } };
	},
	async content(event, trigger, player) {
		// 发动后寻鹿失效，直到拒绝发动「追舳」（互锁）——描述变灰
		player.disableSkill("xiaobai_xunlu_disabled", "xiaobai_xunlu");
		player.addSkill("xiaobai_xunlu_disabled");
		game.log(player, "的〖寻鹿〗失效");
		const current = event.cost_data.current;
		if (player.isIn()) await player.draw(1);
		if (current.isIn()) await current.draw(1);
		if (!current.isIn()) return;
		// 其本回合下次造成伤害时：聂友失去1点体力令此伤害+1
		current.storage.xiaobai_xunlu_source = player.playerid;
		current.storage.xiaobai_xunlu_count = (current.storage.xiaobai_xunlu_count || 0) + 1;
	},
	// ⚠️ 不写 group：init 动态挂载，避开 disableSkill 的 group 级联（见上）
	init(player) {
		player.addSkill("xiaobai_xunlu_damage");
		player.addSkill("xiaobai_xunlu_count");
		player.addSkill("xiaobai_xunlu_clear");
	},
	onremove(player) {
		player.removeSkill("xiaobai_xunlu_damage");
		player.removeSkill("xiaobai_xunlu_count");
		player.removeSkill("xiaobai_xunlu_clear");
		player.removeSkill("xiaobai_xunlu_disabled");
	},
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
			// ⚠️ 显式 priority：必须先于主技能 filter 执行（先记账、主技能读账）。
			// 同优先级触发仅靠稳定排序+技能表顺序兜底——主技能被移除后重新获得时 addSkill 去重
			// 会让主技能排到本子技能之后，顺序翻转 → 第一次摸牌就会误触发
			priority: 1,
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
// 寻鹿的失效载体（文档写法 A+）：独立挂载、不进 group、不带 mark——失效视觉就是主技能描述变灰。
// onremove = 死亡清理：把 disableSkill 的禁用表项撤掉，避免复活后寻鹿仍是灰的。
xiaobai_xunlu_disabled: {
	charlotte: true,
	sub: true,
	onremove(player) {
		player.enableSkill("xiaobai_xunlu_disabled");
	},
},
// === 炴营 ===
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
				.set("ai", (target) => {
					// 奇制同款：自己(喂蓄谋)2 > 敌人(拆牌)1 > 队友0.5；不要像"恒重铸敌方"那样把自肥路径放掉
					if (target == player) return 2;
					if (get.attitude(player, target) <= 0) return 1;
					return 0.5;
				})
				.forResult();
			const to = res?.targets?.[0];
			if (!to?.isIn()) return;
			const res2 = await player
				.choosePlayerCard(to, "he", true, 1, "炴营：选择重铸的一张牌")
				.set("ai", (card) => {
					// 重铸他人基本牌会授予其火攻/火杀反制权：拆别人时避开基本牌；自己的牌无此顾虑
					const penalty = to != player && get.type(card) == "basic" ? -5 : 0;
					return penalty + get.value(card);
				})
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
					// 用户定：对队友选【火攻】（伤害路径更弱、可控），对敌人偏向火【杀】，
					// 但火攻的实际收益更高时也选火攻（例如目标没有【闪】而手里有牌）。
					// 直接用 get.effect 比较两张牌对 `player`（技能拥有者）的收益，方向按态度取反：
					//   敌方 → 取更大收益（更疼的那个）；队友 → 取更小伤害（更不疼的那个）。
					.set("ai", () => {
						const me = get.player();
						const target = player; // 被使用牌的人（炴营的拥有者）
						const effHuogong = get.effect(target, { name: "huogong" }, me, me);
						const effSha = get.effect(target, { name: "sha", nature: "fire" }, me, me);
						const ally = get.attitude(me, target) > 0;
						// ally: 选「更不疼」的（数值更大）；enemy: 选「更疼」的
						return ally ? (effHuogong >= effSha ? 0 : 1) : (effSha >= effHuogong ? 1 : 0);
					})
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
// === 言祸 ===
xiaobai_yanhuo: {
	audio: 2,
	zhuanhuanji: true,
	mark: true,
	marktext: "☯",
	// ★★ `intro` 是 mark 能否被创建的**硬前提**（本次修复的显示 bug）：
	//   `player.markSkill`（player.js:10174-10199）在没显式传 info 时（`mark: true` 的自动调用即如此）
	//   会去取 `lib.skill[name].intro`；取不到就 `if (!info2) return;` —— **直接返回、根本不创建 mark**。
	//   原先言祸只有 `mark: true` + `marktext: "☯"` 而没有 `intro`，所以 ☯ 标记完全不显示；
	//   恣逸有 `intro` 才正常。（`marktext` 只负责标记里的**字**，`intro` 才决定标记**是否存在**。）
	intro: {
		content(storage, player) {
			const sealed = player?.storage?.xiaobai_yanhuo_sealed;
			const base = storage ? "当前为阴：其他角色的结束阶段，其可以令你执行阳项。" : "当前为阳：准备阶段，你可以进行一次【闪电】判定。";
			return sealed ? base + "（转换技标签已删去）" : base;
		},
	},
	init(player) {
		if (player.storage.xiaobai_yanhuo == undefined) player.storage.xiaobai_yanhuo = false;
		if (player.storage.xiaobai_yanhuo_sealed == undefined) player.storage.xiaobai_yanhuo_sealed = false;
	},
	trigger: { player: "phaseZhunbeiBegin", global: "phaseJieshuBegin" },
	//direct: true,
	filter(event, player) {
		if (!player.isIn()) return false;
		const yang = !player.storage.xiaobai_yanhuo;
		if (event.player == player) return yang;
		return !yang;
	},
	async cost(event, trigger, player) {
		// ★★ 必须用 `trigger.player`（**阶段事件**的当前回合角色），**不是** `event.player`！
		//   `cost(event, trigger, player)` 里 `event` 是**引擎创建的 cost 事件**
		//   （`content.js:3557` `game.createEvent(\`${event.skill}_cost\`)` + `next2.player = player`），
		//   所以 `event.player` **恒等于技能拥有者 player** → `event.player == player` 永远为真
		//   → 阴态分支永远进不去，永远是"问拥有者自己"（他一取消就拒绝了，
		//   而描述是"**其他角色**的结束阶段，**其**可以令你执行阳项"——决定权在**对方**，你无权拒绝）。
		//   `trigger` 才是真正被触发的事件（阶段事件），`trigger.player` 才是当前回合角色。
		//   （对照 `filter(event, player, name)`：filter 的 `event` 就是触发事件，所以那边 `event.player` 是对的。）
		if (trigger.player == player) {
			const res = await player
				.chooseBool("言祸：是否进行一次【闪电】判定？")
				.set("ai", () => 1)
				.forResult();
			event.result = res?.bool ? { bool: true } : { bool: false };
		} else {
			const res = await trigger.player
				.chooseBool("言祸：是否令" + get.translation(player) + "进行一次【闪电】判定？")
				.set("ai", () => (get.attitude(trigger.player, player) < 0 ? 1 : 0))
				.forResult();
			event.result = res?.bool ? { bool: true, cost_data: { target: trigger.player } } : { bool: false };
		}
	},
	async content(event, trigger, player) {
		// ⚠️ 不再手动 logSkill：`direct` 已注释掉，引擎会在 content 前**自动**记一次
		//   「发动了【言祸】」（content.js:3662-3665，条件是 `!info.direct`），
		//   这里再记一次会变成重复日志（真引擎日志里确实连续出现两行）。
		const askedBy = event.cost_data?.target;
		const judge = player.judge("shandian", (card) => (get.suit(card) == "spade" && get.number(card) >= 2 && get.number(card) <= 9 ? 3 : -3));
		const result = await judge.forResult();
		// ⚠️⚠️ `result` 可能为 **undefined**：张裕**同时拥有〖凶谶〗**（锁定技，
		//   `trigger: { player: "judgeBefore" }` 里 `trigger.cancel()` 取消原判定、
		//   改为"亮出牌堆顶直到【杀】"），判定被取消后本技能**拿不到 judge 事件的结果**
		//   → 写 `result.judge` 会抛 TypeError 并**中断整个 content**
		//   （引擎 ignore_error 下被静默吞掉，界面无提示）→ 末尾"转换技发动后转换"
		//   永远执行不到，表现正是"**言祸阳项发动后没有转成阴**"。
		//   （用 skill-simulator 真跑复现，报错位置 xiaobai.js content 内。）
		if (result?.judge > 0) {
			player.storage.xiaobai_yanhuo_dying = false;
			let dmgEvent;
			if (askedBy && askedBy.isIn()) {
				dmgEvent = player.damage(3, "thunder", askedBy);
			} else {
				dmgEvent = player.damage(3, "thunder");
			}
			await dmgEvent;
			// ★「若你因此进入濒死状态，删去〖言祸〗转换技标签」
			//   判据用引擎自动打的 `damageEvent._dyinged`（content.js:11162-11166：
			//   `if (player.hp <= 0 && player.isAlive() && !event.nodying) { event._dyinged = true; player.dying(event); }`）
			//   —— 它精确表示"**该次伤害**导致进入濒死"，比事后判 `hp <= 0` 可靠
			//   （濒死被桃救回后 hp 已 > 0，事后判会漏）。
			//   实现方式按用户要求：**不真的删技能**（真删会让 ☯ 标记与"当前项标蓝"一起消失），
			//   而是打一个"封印"标记 —— 保留转换技的**显示形式**，只是从此**不再转换**（停留在当前状态）。
			if (dmgEvent?._dyinged) {
				player.storage.xiaobai_yanhuo_sealed = true;
				game.log(player, "的〖言祸〗转换技标签被删去");
			}
		}
		// ★★ 转换技标准行为：**发动后即转换**（阳项发动 → 阴；阴态被令执行阳项 → 阳）。
		//   原先多写了 `askedBy && event.cost_data?.target` 这个条件
		//   （= 只有**阴态被其他角色触发**时才转换），导致**阳项自己发动后不转换**
		//   → 表现为"发动阳后没看到技能转换"。
		//   而 mark 浮窗正文是基于 `storage` **动态渲染**的（get/index.js:4897-4899：
		//   `default: { ... } else if (typeof type == "function") { return type(content, player, skill); }`
		//   —— 这里传入的 content 就是当前的 `player.storage[skill]`，见 get/index.js:5420），
		//   所以 storage 不变 → 浮窗文本也不会变。**这两个现象是同一个根因。**
		//   对照原生转换技：`clandongxu`（clan.js:1067-1071 `player.changeZhuanhuanji(name)` 无条件）、
		//   `xiaobai_dianchi`（本文件）都是**无条件**转换。
		//   已"删去转换技标签"（封印）则跳过 → 停留在当前状态（☯ 与当前项标蓝照旧，只是不再转）。
		if (!player.storage.xiaobai_yanhuo_sealed) {
			player.changeZhuanhuanji("xiaobai_yanhuo");
		}
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// === 严教 ===
// 严教的本回合手牌上限-1
xiaobai_yanjiao_minus: {
	charlotte: true,
	sub: true,
	mark: true,
	markimage: "image/card/handcard.png",
	intro: {
		name: "严教",
		content(storage, player) {
			return `<li>本回合手牌上限-1<br><li>当前手牌上限：${player.getHandcardLimit()}`;
		},
	},
	mod: {
		maxHandcard(current, num) {
			return num - 1;
		},
	},
},
// === 妟灾 ===
xiaobai_yanzai: {
	audio: 2,
	zhuanhuanji: true,
	mark: true,
	marktext: "☯",
	intro: {
		content(storage) {
			return (
				"转换技。其他角色使用装备牌后，其可以视为对你使用" +
				(storage ? "【借刀杀人】" : "【过河拆桥】") +
				"；本回合下次有牌离开你区域时，你可以将之交给一名其他角色。（当前处于" +
				(storage ? "阴" : "阳") +
				"状态）"
			);
		},
	},
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		if (event.player == player || !event.player?.isIn()) return false;
		if (get.type(event.card) != "equip") return false;
		if (game.hasPlayer((current) => current.isDying())) return false;
		const user = event.player;
		if (!player.storage.xiaobai_yanzai) {
			// 阳：过河拆桥
			return user.canUse(get.autoViewAs({ name: "guohe", isCard: true }, []), player);
		}
		// 阴：借刀杀人——我是武器持有者，且我攻击范围内有可用杀的目标
		return (
			player.getEquips(1).length > 0 &&
			user.canUse(get.autoViewAs({ name: "jiedao", isCard: true }, []), player) &&
			game.hasPlayer((current) => current != player && player.inRange(current) && lib.filter.targetEnabled({ name: "sha", isCard: true }, player, current))
		);
	},
	async cost(event, trigger, player) {
		const user = trigger.player;
		const yang = !player.storage.xiaobai_yanzai;
		if (yang) {
			const res = await user
				.chooseBool(`妟灾：你可以视为对${get.translation(player)}使用一张【过河拆桥】`)
				.set("owner", player)
				.set("user", user)
				.set("ai", () => {
					const evt = get.event();
					return get.effect(evt.owner, { name: "guohe", isCard: true }, evt.user, evt.user) > 0;
				})
				.forResult();
			if (!res?.bool) return void (event.result = { bool: false });
			event.result = { bool: true, cost_data: { targets: [player], vname: "guohe" } };
		} else {
			const res = await user
				.chooseTarget(`妟灾：选择${get.translation(player)}攻击范围内的一名角色，视为对其使用【借刀杀人】`, (card, chooser, current) => {
					const owner = get.event().owner;
					return current != owner && owner.inRange(current) && lib.filter.targetEnabled({ name: "sha", isCard: true }, owner, current);
				})
				.set("owner", player)
				.set("user", user)
				.set("ai", (current) => {
					const evt = get.event();
					// 使用者视角：目标越敌对越想借刀
					return -get.attitude(evt.user, current);
				})
				.forResult();
			if (!res?.bool || !res.targets?.length) return void (event.result = { bool: false });
			event.result = { bool: true, cost_data: { targets: [player, res.targets[0]], vname: "jiedao" } };
		}
	},
	async content(event, trigger, player) {
		player.logSkill("xiaobai_yanzai");
		const user = trigger.player;
		const vcard = get.autoViewAs({ name: event.cost_data.vname, isCard: true }, []);
		await user.useCard(vcard, [], event.cost_data.targets);
		player.changeZhuanhuanji("xiaobai_yanzai");
		// 本回合下次有牌离开你区域时，可改为交给一名其他角色（随本回合结束过期）
		player.addTempSkill("xiaobai_yanzai_pending", { global: "phaseAfter" });
	},
	subSkill: {
		pending: {
			name: "妟灾",
			charlotte: true,
			trigger: { player: "loseBefore" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return (event.cards || []).some((card) => ["h", "e", "j"].includes(get.position(card)));
			},
			async content(event, trigger, player) {
				// 一次性：无论是否交出都消耗（对齐 FreeKill 先清标记再询问）
				player.removeSkill("xiaobai_yanzai_pending");
				const cards = trigger.cards.filter((card) => ["h", "e", "j"].includes(get.position(card)));
				if (!cards.length) return;
				await player.viewCards("妟灾：你即将失去这些牌", cards);
				const res = await player
					.chooseBool("妟灾：是否将你即将失去的这些牌交给一名其他角色？")
					.set("ai", () => game.hasPlayer((cur) => cur != player && get.attitude(player, cur) > 0))
					.forResult();
				if (!res?.bool) return;
				const res2 = await player
					.chooseTarget("妟灾：选择获得这些牌的角色", true, (card, me, target) => target != me && target.isIn())
					.set("ai", (target) => get.attitude(get.player(), target) / (1 + target.countCards("h")))
					.forResult();
				if (!res2?.bool || !res2.targets?.length) return;
				const receiver = res2.targets[0];
				// 从本次失去中摘除（lose content 每步重新解构 event.cards，改引用安全；勿用 removeArray 改共享数组）
				trigger.cards = trigger.cards.filter((c) => !cards.includes(c));
				await player.give(cards, receiver);
			},
		},
	},
},
// === 爻证 ===
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
					// 卜算 = 观星式摆牌，纯收益；未用完的额度本轮结束会自动清空
					// （xiaobai_yaozheng_end 会 `chooseToGuanxing(剩余)`），所以留着不攒。
					// 准备阶段是**摸牌前**，此刻卜算能直接决定接下来摸什么 → 取最大张数。
					.set("ai", () => opts[opts.length - 1])
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
					// 同上：额度不留到本轮结束，取最大张数（出牌阶段卜算也能安排自己下一轮的起手）。
					.set("ai", () => opts[opts.length - 1])
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
// === 倚阀 ===
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
// === 引瀚 ===
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
// === 益市 ===
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
			.set("ai", () => {
				// 弃一整类：AI 选总价值最低的类别，而非恒弃基本牌
				let best = avail[0];
				let bestScore = Infinity;
				for (const t of avail) {
					const score = player
						.getCards("h")
						.filter((card) => get.type(card, null, player) == t)
						.reduce((sum, card) => sum + get.value(card, player), 0);
					if (score < bestScore) {
						bestScore = score;
						best = t;
					}
				}
				return typeNames[best];
			})
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
// === 翼佐 ===
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
// === 用宠 ===
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
// === 咏史 ===
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
		// addMark 只写标记、不授予技能，必须显式 addSkill，否则目标无法发动〖咏史〗衍生技
		if (!target.hasSkill("xiaobai_yongshi_holder")) target.addSkill("xiaobai_yongshi_holder");
		target.addMark("xiaobai_yongshi_holder", 1);
		const ctrl = await target
			.chooseControl(["使用此牌（额外结算一次）", "弃置此牌（保留咏史）"])
			.set("prompt", "咏史：选择对" + get.translation(card) + "的处理")
			.set("ai", () => (target.canUse(card, null, true, false) ? 0 : 1))
			.forResult();
		if (ctrl?.control == "使用此牌（额外结算一次）") {
			const useRes = await target.chooseUseTarget(card, "咏史：请使用此牌（将额外结算一次）", false).set("addCount", false).forResult();
			// 取消使用不失去层数
			if (useRes?.bool) {
				target.removeMark("xiaobai_yongshi_holder", 1);
				if (target.countMark("xiaobai_yongshi_holder") <= 0) target.removeSkill("xiaobai_yongshi_holder");
				// "可以额外结算一次"：由使用此牌的角色选择
				const extra = await target.chooseBool("咏史：是否额外结算一次？").set("ai", () => 1).forResult();
				if (extra?.bool && target.isIn()) {
					await target.useCard(get.autoViewAs({ name: get.name(card), nature: get.nature(card) }, []), useRes.targets || [target], "xiaobai_yongshi1").set("addCount", false);
				}
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
			// 送牌+赠技能层只应给友方
			target(player, target) {
				return get.attitude(player, target) > 0 ? 1 : -1;
			},
		},
	},
},
// === 咏史 ===
// 咏史持有：衍生技（左思授予，层数用 countMark）
xiaobai_yongshi_holder: {
	charlotte: true,
	mark: true,
	marktext: "史",
	intro: {
		content(storage, player) {
			const n = player.countMark("xiaobai_yongshi_holder");
			return "持有〖咏史〗×" + n + "：出牌阶段限一次，将一张牌交给不持有〖咏史〗的角色并令其获得一层〖咏史〗，其选择使用（可以额外结算一次，失去一层）或弃置（再加一层）；每次发动消耗你一层〖咏史〗。";
		},
	},
	onremove(player, skill) {
		delete player.storage[skill];
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
		const target = event.targets[0];
		const cardRes = await player
			.chooseCard("he", true, 1, "咏史：选择交给" + get.translation(target) + "的牌")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		const card = cardRes?.cards?.[0];
		if (!card) return;
		await player.give([card], target);
		if (!target.isIn() || get.owner(card) != target) return;
		// 本次发动消耗自己一层（每层限一次）
		player.removeMark("xiaobai_yongshi_holder", 1);
		if (player.countMark("xiaobai_yongshi_holder") <= 0) player.removeSkill("xiaobai_yongshi_holder");
		// 获得一层〖咏史〗（addMark 不授予技能，需显式 addSkill）
		if (!target.hasSkill("xiaobai_yongshi_holder")) target.addSkill("xiaobai_yongshi_holder");
		target.addMark("xiaobai_yongshi_holder", 1);
		// 其选择：1.使用此牌且额外结算一次，失去一层；2.弃置此牌，再加一层
		const ctrl = await target
			.chooseControl(["使用此牌（额外结算一次）", "弃置此牌（保留咏史）"])
			.set("prompt", "咏史：选择对" + get.translation(card) + "的处理")
			.set("ai", () => (target.canUse(card, null, true, false) && get.name(card) != "tao" ? 0 : 1))
			.forResult();
		if (ctrl?.control == "使用此牌（额外结算一次）") {
			const useRes = await target.chooseUseTarget(card, "咏史：请使用此牌（将额外结算一次）", false).set("addCount", false).forResult();
			// 取消使用不失去层数
			if (useRes?.bool) {
				target.removeMark("xiaobai_yongshi_holder", 1);
				if (target.countMark("xiaobai_yongshi_holder") <= 0) target.removeSkill("xiaobai_yongshi_holder");
				// "可以额外结算一次"：由使用此牌的角色选择
				const extra = await target.chooseBool("咏史：是否额外结算一次？").set("ai", () => 1).forResult();
				if (extra?.bool && target.isIn()) {
					// 额外结算一次：同一虚拟牌再结算一次
					await target.useCard(get.autoViewAs({ name: get.name(card), nature: get.nature(card) }, []), useRes.targets || [target], "xiaobai_yongshi_holder").set("addCount", false);
				}
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
			// 送牌+赠技能层只应给友方
			target(player, target) {
				return get.attitude(player, target) > 0 ? 1 : -1;
			},
		},
	},
},
// === 游摆 ===
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
// === 忧谏 ===
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
		// 记录"上次忧谏交换牌的目标"（忠惜读取），并用角色 mark 呈现（引擎原生写法，参考〖相谶〗
		// xianding.js:13968 / 〖怨语〗yuanyu_mark；载体 subSkill.target 保证 lib.skill 条目存在）
		player.setStorage("xiaobai_youjian_target", target);
		player.markSkillCharacter("xiaobai_youjian_target", target, "忧谏", "上次〖忧谏〗交换牌的目标");
		// "观看其所有手牌"由选牌界面承载：把双方手牌一起列进对话框里点选（原生〖尚义〗character/tw.js 同款），
		// 而不是 choosePlayerCard 盲选——描述是"观看…并交换"，选牌时就得看得见。
		// 不再单独走 viewHandcards：那会先弹一个"确定"窗（viewCards content 对本地玩家挂起等确认），
		// 与下一步的选牌窗内容完全重复，凭空多一步等待
		const res = await player
			.chooseButton(
				[2, 4],
				[
					`###忧谏###<div class="text center">用至多两张手牌与${get.translation(target)}交换等量的手牌</div>`,
					`<div class="text center">${get.translation(target)}的手牌</div>`,
					target.getCards("h"),
					'<div class="text center">你的手牌</div>',
					player.getCards("h"),
				],
				true
			)
			.set("filterButton", (button) => {
				// 原生〖尚义〗写法：必须"换边"选，且 selectButton=[2,4] 保证只能选成 1v1 或 2v2
				if (get.itemtype(button.link) != "card") return false;
				if (!ui.selected.buttons.length) return true;
				const last = get.owner(ui.selected.buttons[ui.selected.buttons.length - 1].link);
				return get.owner(button.link) != last;
			})
			// filterButton 读 ui.selected.buttons ⇒ 关掉按钮缓存（game/index.js:6916 filterCache 读 !event.complexSelect）
			.set("complexSelect", true)
			.set("ai", (button) => get.value(button.link))
			.forResult();
		if (!res?.bool || !res.links?.length) return;
		const mine = res.links.filter((card) => get.owner(card) == player);
		const theirs = res.links.filter((card) => get.owner(card) == target);
		if (!mine.length || mine.length != theirs.length) return;
		// 交换（引擎原生 swapHandcards）
		await player.swapHandcards(target, mine, theirs);
		// 给"以此获得的伤害牌"打永久 tag。两个要点：
		// ① 必须用 eternal_ 前缀——引擎 lose content 收尾会清掉所有非 eternal_ 的 gaintag
		//   （content.js lose 段：card.gaintag.filter 非 eternal 后逐个 removeGaintag），
		//   而使用手牌必经 lose 到处理区（useCard step0 的 owner.lose），普通 tag 到
		//   useCardAfter 时已被洗掉，filter 永远不命中（此前的失效根因）
		// ② 交换完再打：card.copy() 会把新节点的 .gaintag 清空（card.js:853），交换前打角标会丢
		const damageCards = theirs.filter((card) => get.tag(card, "damage"));
		damageCards.forEach((card) => card.addGaintag("eternal_xiaobai_youjian"));
		// 换来了伤害牌才需要监听：监听器只在本回合存在，回合结束自动卸下
		if (damageCards.length && player.isIn()) {
			player.addTempSkill("xiaobai_youjian_draw", "phaseEnd");
		}
	},
	subSkill: {
		// mark 载体：markSkillCharacter 用的 id 必须在 lib.skill 里真实存在（展开 id =
		// 主键_子键 = xiaobai_youjian_target），否则 updateMark 遍历 marks 时
		// lib.skill[i].mark 直接 TypeError（player.js:4736）——且炸在 gain 的 postAnimate
		// 里会让 ui.updatehl 不执行，表现为"交换的牌过一会儿才出现"。
		// 写法照抄原生 yuanyu_mark（huicui.js:15093）：mark:"character" + charlotte + intro
		target: {
			mark: "character",
			charlotte: true,
			intro: {
				content: "上次〖忧谏〗交换牌的目标",
				onunmark: true,
			},
		},
		draw: {
			audio: "xiaobai_youjian",
			charlotte: true,
			direct: true,
			sub: true,
			name: "忧谏",
			trigger: { player: "useCardAfter" },
			filter(event, player) {
				if (!get.tag(event.card, "damage")) return false;
				const cards = event.cards || [];
				return cards.some((card) => card.hasGaintag("eternal_xiaobai_youjian")) || !!event.card?.hasGaintag?.("eternal_xiaobai_youjian");
			},
			async content(event, trigger, player) {
				const target = player.storage.xiaobai_youjian_target;
				if (!target?.isIn() || !player.isIn()) return;
				const go = await player
					.chooseBool("忧谏：是否与" + get.translation(target) + "各摸一张牌？")
					.set("ai", () => true)
					.forResult();
				if (!go?.bool) return;
				await player.draw(1);
				await target.draw(1);
			},
		},
	},
	ai: {
		order: 6,
		result: {
			player: 1,
			// 换牌对目标是中性的，敌我取舍按态度：敌人才值得换（我方拿其手牌、送出最差的牌）
			target(player, target) {
				return get.attitude(player, target) < 0 ? 1 : -1;
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
// === 预识 ===
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
		// "下一次发动不能声明这三张牌"只作用于本次声明：用掉即清，
		// 不能在 roundStart 用独立子技清（会和本声明触发抢跑，导致限制失效）
		player.storage.xiaobai_yushi_previous = [];
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
	group: ["xiaobai_yushi_wuxie", "xiaobai_yushi_end"],
	subSkill: {
		// 本轮内：一张牌当【无懈可击】用于抵消声明的锦囊牌
		wuxie: {
			audio: "xiaobai_yushi",
			charlotte: true,
			sub: true,
			name: "预识",
			enable: ["chooseToUse"],
			// 无懈窗开窗预检：静态 viewAs.name=="wuxie" 会让 hasWuxie 无条件放行，
			// 这里按"被抵消的牌名"精确放行（player.js:13481 优先认 hiddenWuxie），
			// 声明名单外的锦囊不会再把你拉进无懈询问。
			hiddenWuxie(player, info) {
				const declared = player.storage.xiaobai_yushi_declared || [];
				if (!declared.length || player.countCards("he") == 0) return false;
				const card = info?.card || info?.info_map?.card;
				const name = card ? get.name(card, info?.player || player) : null;
				return Boolean(name && declared.includes(name));
			},
			// hasWuxie() 不带 info 调用时走静态 viewAs 分支，用 viewAsFilter 兜住"没有声明/没有牌"
			viewAsFilter(player) {
				const declared = player.storage.xiaobai_yushi_declared || [];
				return declared.length > 0 && player.countCards("he") > 0;
			},
			filter(event, player) {
				const declared = player.storage.xiaobai_yushi_declared || [];
				if (!declared.length || player.countCards("he") == 0) return false;
				if (event.type != "wuxie") return false;
				// 被抵消的锦囊以 info_map.card 为准：延时锦囊的判定窗没有 respondTo，
				// 只认 respondTo 会导致声明了延时锦囊却永远不弹按钮。
				const map = event.info_map || {};
				const card = map.card || event.respondTo?.[1] || event.card;
				const name = card ? get.name(card, map.player || player) : null;
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
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// === 彰重 ===
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
// === 斩威 ===
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
// === 铮骨 ===
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
			.set("ai", () => {
				// 仅“我是受害者”分支有翻倍价值：体力够扛翻倍伤害时嘲讽来源（其基本/锦囊只能指我），掩护队友
				if (trigger.player != player || !trigger.source) return 0;
				if (get.attitude(player, trigger.source) >= 0) return 0;
				if (player.hp - trigger.num * 2 < 2) return 0;
				return game.hasPlayer((current) => current != player && get.attitude(player, current) > 0) ? 1 : 0;
			})
			.forResult();
		if (!go?.bool) return;
		trigger.storage.xiaobai_zhenggu_done = true;
		trigger.num *= 2;
		const source = trigger.source;
		// 锁定来源：其使用基本牌或普通锦囊牌只能指定黄琬
		source.addSkill("xiaobai_zhenggu_lock");
		source.storage.xiaobai_zhenggu_by = player.playerid;
		// 恢复监听动态挂载（坑-技能失效与标记显示.md 妙喻教训）：recover 绝不能进
		// group——下一行 disableSkill 会沿 group 级联禁用子技能，recover 的
		// changeHpAfter 监听会被一起禁死，永远无法恢复；addSkill 直添的独立技能不受级联
		player.addSkill("xiaobai_zhenggu_recover");
		// 铮骨失效（直到来源体力值变化或你死亡）
		player.disableSkill("xiaobai_zhenggu_awake", "xiaobai_zhenggu");
	},
	subSkill: {
		lock: {
			charlotte: true,
			sub: true,
			mark: true,
			marktext: "骨",
			intro: {
				content(storage, player) {
					const by = player.storage.xiaobai_zhenggu_by;
					if (!by) return "你的基本牌与普通锦囊牌只能指定伤害来源为目标";
					// 玩家映射：单机是 game.playerMap、联机才是 lib.playerOL（引擎惯例，
					// content.js:9210 等）——直接读 lib.playerOL 在单机为 undefined，悬浮即炸
					const target = game.findPlayer((p) => p.playerid == by) || (_status.connectMode ? lib.playerOL : game.playerMap)[by];
					return "你的基本牌与普通锦囊牌只能指定" + (target ? get.translation(target) : "伤害来源") + "为目标";
				},
			},
			mod: {
				// ⚠️ 必须用 playerEnabled（使用者视角）：targetEnabled 的 checkMod 收集的是
				// 被指定者（target）身上的 mod，挂在来源身上的 lock 根本不被读（index.js:11397）
				playerEnabled(card, player, target) {
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
			// 黄琬死亡时死体也要执行解锁（die content 只清 temp 技能和死者自己的 marks，
			// 主技能 onremove 不会跑，非 forceDie 的死体 content 被 isPrevented 拦）
			forceDie: true,
			trigger: { global: "changeHpAfter", player: "dieAfter" },
			filter(event, player) {
				if (event.name == "die") {
					// 黄琬死亡：只要存在被锁来源就走解锁（onremove 在死亡时无执行入口，这里补）
					return game.hasPlayer((current) => current.storage?.xiaobai_zhenggu_by == player.playerid);
				}
				// 本次翻倍伤害自身的扣血不算"来源体力值发生变化"（否则锁定在结算瞬间
				// 就被 changeHpAfter 解除，秒失效）；只有本次伤害结算完之后的独立体力变化才恢复
				const damage = event.getParent("damage");
				if (damage?.storage?.xiaobai_zhenggu_done) return false;
				// 被锁定来源体力值变化 → 恢复铮骨
				return Boolean(event.player?.storage?.xiaobai_zhenggu_by && event.player.storage.xiaobai_zhenggu_by == player.playerid);
			},
			content(event, trigger, player) {
				// content 的 event.name 是技能 id（content.js:3745 createEvent(event.skill)）；
				// 时机名要看宿主事件 trigger，扣血/死亡的角色也在 trigger.player
				if (trigger.name === "die") {
					// 解锁所有被锁来源（与主技能 onremove 相同），并卸下监听自身
					game.countPlayer((current) => {
						if (current.storage?.xiaobai_zhenggu_by == player.playerid) {
							current.removeSkill("xiaobai_zhenggu_lock");
						}
					});
					player.removeSkill("xiaobai_zhenggu_recover");
					return;
				}
				const source = trigger.player;
				source.removeSkill("xiaobai_zhenggu_lock");
				player.enableSkill("xiaobai_zhenggu_awake");
				// 一次性恢复：卸下监听，下次发动铮骨时再挂
				player.removeSkill("xiaobai_zhenggu_recover");
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
		player.removeSkill("xiaobai_zhenggu_recover");
	},
	ai: {
		result: {
			player: 1,
		},
	},
},
// === 铮烈 ===
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
				check(card) {
					return 6 - get.value(card);
				},
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_zhenglie");
					// "每回合限一次"：回合结束（phaseEnd=整回合结束后派发）恢复，而非
					// roundStart（那是"每轮限一次"的粒度，跨了所有玩家的回合）
					player.addTempSkill("xiaobai_zhenglie_used", "phaseEnd");
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
			// 排到同事件默认技能之后：肃野（使用伤害牌后）先询问，铮烈的红色底牌最后结算
			"_priority": -1,
			trigger: { global: "useCardAfter" },
			direct: true,
			filter(event, player) {
				return event.player == player && Boolean(event.card?.storage?.xiaobai_zhenglie);
			},
			async content(event, trigger, player) {
				// 红色底牌（材料中的红牌）：useCardAfter 时底牌可能仍在处理区（flush 未必
				// 已落堆），判 "d"/"o" 两处（诂守 responseAfter 收牌同款先例）。
				// 可用性：hasUseTarget(card, true, true)（异存实测：查距离+查次数）——
				// 闪/无懈无合法目标、满血时的桃都会被如实滤掉
				let reds = (trigger.cards || []).filter(
					(card) => get.color(card) == "red" && ["d", "o"].includes(get.position(card, true)) && player.hasUseTarget(card, true, true)
				);
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
						// 底牌不能被响应。必须写在 .set() 里：chooseUseTarget 内部走 useResult → useCard，
						// 时机一到就直接派发 useCardToPlayered 了，外层拿不到中间态；
						// 而 content.useCard 第 0 步的 `if (!Array.isArray(event.directHit)) event.directHit = []`
						// （content.js:9161-9163）会保留已写入的数组。
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
// === 贞律 ===
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
	check(card) {
		// AI：收回当无懈的材料优先选最不值钱的装备
		return 6 - get.value(card);
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
// === 振义 ===
xiaobai_zhenyi: {
	audio: 2,
	// 李膺侧：弃至全场最少并视为使用不可响应且伤害+1的【杀】
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		if (!player.isIn()) return false;
		const minHand = Math.min(...game.filterPlayer().map((p) => p.countCards("h")));
		if (player.countCards("h") <= minHand) return false;
		// 视为使用【杀】的真实门槛：有距离内的合法目标（addCount=false，杀的次数上限不参与判定）
		return game.hasPlayer((current) => lib.filter.targetEnabled({ name: "sha", isCard: true }, player, current) && lib.filter.targetInRange({ name: "sha", isCard: true }, player, current));
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
		// ⚠️ 视为使用必须带目标：旧实现 useCard 不传 targets → 派发时 targets.length==0 直接
		// return（content.js:9527），杀完全没效果、白弃。按杀的规则选目标（距离+合法性）。
		const vcard = get.autoViewAs({ name: "sha" }, []);
		vcard.storage = { xiaobai_zhenyi: true };
		if (!game.hasPlayer((current) => lib.filter.targetEnabled(vcard, player, current) && lib.filter.targetInRange(vcard, player, current))) return;
		const targetRes = await player
			.chooseTarget("振义：视为使用不可响应且伤害+1的【杀】，请选择目标", true, (card, player2, target) => lib.filter.targetEnabled(vcard, player2, target) && lib.filter.targetInRange(vcard, player2, target))
			.set("ai", (target) => get.effect(target, vcard, player, player))
			.forResult();
		if (!targetRes?.bool || !targetRes.targets?.length) return;
		// directHit 必须走 .set()：useCard 返回的 GameEvent 此时还没有 directHit 字段——
		// 它要到 useCard 的 content 第 0 步才被初始化（content.js:9158-9163
		// `if (!Array.isArray(event.directHit)) event.directHit = [];`），
		// 且该步排在 step-arrangeTrigger 派发之后，而 Map/await 都碰不到它。
		// 在 content 里直接 `.directHit.addArray(...)` 会抛
		// `Cannot read properties of undefined (reading 'addArray')`。
		// 先 .set() 写入数组，content 那步的 Array.isArray 守卫会原样保留。
		const useEvent = player
			.useCard(vcard, targetRes.targets, "xiaobai_zhenyi")
			.set("addCount", false)
			.set("directHit", game.filterPlayer());
		await useEvent;
	},
	group: ["xiaobai_zhenyi_damage", "xiaobai_zhenyi_mount"],
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
		// 挂载全局侧（其他角色的桃）
		// ⚠️ 不能在 init 里挂：开局 `for (i) game.players[i].init(...)` 按座次逐个初始化
		//   （noname/game/index.js:3294-3308），而 player.init 开头就 clearSkills(true)
		//   （noname/library/element/player.js:3400）⇒ 座次排在振义拥有者**之后**的角色，
		//   其 init 会把刚挂上的 _o 又清掉（clearSkills 只保 superCharlotte，player.js:11670-11682）。
		//   改为 gameStart / changeSkillsAfter 挂载：此时全员 init 已完成，换将/中途获得也能补挂。
		mount: {
			charlotte: true,
			sub: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: { global: ["gameStart", "changeSkillsAfter"] },
			filter(event, player) {
				return player.hasSkill("xiaobai_zhenyi");
			},
			content(event, trigger, player) {
				game.countPlayer((current) => {
					if (current != player) current.addSkill("xiaobai_zhenyi_o");
				});
			},
		},
	},
	onremove(player) {
		// 场上还有人持有振义时不要拆（振义可能被复制/转移给其他角色）
		if (game.hasPlayer((current) => current.hasSkill("xiaobai_zhenyi"))) return;
		game.countPlayer((current) => current.removeSkill("xiaobai_zhenyi_o"));
	},
	ai: {
		order: 7,
		result: {
			player: 1,
		},
	},
},
// === 振义 ===
// 振义：其他角色侧（全局挂载，弃至与李膺相同并视为使用【桃】）
xiaobai_zhenyi_o: {
	charlotte: true,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		const owner = game.findPlayer((current) => current != player && current.hasSkill("xiaobai_zhenyi"));
		if (!owner?.isIn()) return false;
		if (player.countCards("h") <= owner.countCards("h")) return false;
		// ⚠️ 还必须校验【桃】本身可用（受伤其一，另含 cardEnabled 等），
		// 否则按钮亮起、玩家弃完牌却用不出桃 → 白亏。对齐李膺侧的 canUse 校验。
		return player.canUse({ name: "tao", isCard: true }, player);
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
		// 弃牌前再确认一次桃仍可用（避免弃牌过程中状态变化导致白弃）
		if (!player.canUse({ name: "tao", isCard: true }, player)) return;
		const res = await player
			.chooseCard("h", true, diff, `振义：弃置${get.cnNumber(diff)}张手牌并视为使用【桃】`)
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!res?.cards?.length) return;
		player.showCards(res.cards);
		await player.discard(res.cards);
		if (player.isIn() && player.isDamaged() && player.canUse({ name: "tao", isCard: true }, player)) {
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
// === 指逆 ===
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
		var chooseResult = await player
			.chooseButton(dialog, true)
			// 按钮 = [type, "", 牌名, 转化方式]，候选是 杀/决斗 × 三张/最后一张。
			// 不写 ai 时引擎默认 `()=>1`（player.js:6276-6278）→ 恒选列表第一个按钮，
			// 而列表顺序固定是「杀·三张」打头，等于 AI 永远只会用【杀】三张转化。
			// 按该牌名对最优目标的实际收益来选，兼顾杀与决斗的差别。
			.set("ai", (button) => {
				const name = button.link[2];
				const vcard = { name, isCard: true };
				const targets = game.filterPlayer((target) => player.canUse(vcard, target, true, false));
				if (!targets.length) return 0;
				return Math.max(...targets.map((target) => get.effect(target, vcard, player, player)));
			})
			.forResult();
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
			// AI 必须返回实际选项：恒返回 "cancel2" 会在选牌/转化前 return，
			// 玩家侧毫无消耗，而出牌阶段每轮都会重新选中本技能 → 无限发动。
			.set("ai", function() { return "选项一" })
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
// === 忠惜 ===
xiaobai_zhongxi: {
	audio: 2,
	trigger: { global: "phaseDiscardBegin" },
	filter(event, player) {
		const target = player.storage.xiaobai_youjian_target;
		if (!target?.isIn()) return false;
		const current = event.player;
		if (current != player && current != target) return false;
		// X = 本回合角色需弃置的牌数，须为正。口径必须与引擎弃牌判定同源：
		// phaseDiscard content 的弃牌数就是 needsToDiscard()（content.js:4498），
		// 它会排除"不计入手牌数"的牌（canIgnoreHandcard mod）；直接比
		// countCards("h") > getHandcardLimit() 会在"名义手牌数超限、实际不用弃"时误弹询问
		return current.needsToDiscard() > 0;
	},
	async content(event, trigger, player) {
		const target = player.storage.xiaobai_youjian_target;
		const from = trigger.player; // 弃牌阶段所属者 = 手牌上限被增加者（你 / 上次忧谏的目标）
		const to = from == player ? target : player; // 实际弃牌者：斜杠配对是"错开"的——你的弃牌阶段由目标弃、目标的弃牌阶段由你弃
		const num = from.needsToDiscard(); // 与 phaseDiscard 实际弃牌数同源
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
			// 改手牌上限必须挂 handcard.png（R18）；storage 在给予方身上累加，用 mark: true 自动挂标记
			mark: true,
			markimage: "image/card/handcard.png",
			intro: {
				name: "忠惜",
				content(storage, player) {
					return `<li>手牌上限+${player.storage.xiaobai_zhongxi_up_num || 0}<br><li>当前手牌上限：${player.getHandcardLimit()}`;
				},
			},
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
		// 人类玩家不限次数：只要技能没失效、本回合角色还有可弃置的牌，按钮就一直可用
		// （用户 2026-11-03 要求去掉「同一提示内只能选一次」的限制）。
		// AI/托管仍限制同一提示内只尝试一次，否则 AI 会把本回合角色的牌一路弃光。
		// 注意：`isUnderControl()` 无参时对本地玩家返回 false（那是「是否被旁人接管」的语义），
		// 要判「是否本地人类」必须传 true。
		if (event.xiaobai_zhoubi_used && (!player.isUnderControl(true) || _status.auto)) return false;
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
						// 失效后重开窗口：清掉技能候选缓存，否则旧按钮仍在
						const useEvent = event.getParent("chooseToUse");
						if (useEvent?.name == "chooseToUse") delete useEvent._skillChoice;
						event.result.cancel = true;
						return;
					}
					// 两个条件都不满足：取消本次使用会重开同一个 chooseToUse 事件，
					// 人类玩家不设次数限制（可以一直弃牌直到生效或本回合角色没牌）；
					// AI/托管打上标记，避免它在同一提示内反复刷窗口把牌弃光。
					// 技能候选列表缓存在 event._skillChoice 上，必须一并清掉，否则重开时技能按钮仍在。
					const useEvent = event.getParent("chooseToUse");
					if (useEvent?.name == "chooseToUse") {
						if (!player.isUnderControl(true) || _status.auto) useEvent.set("xiaobai_zhoubi_used", true);
						delete useEvent._skillChoice;
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
				return lost + gained > 0 && player.countCards("h") == 1;
			},
			content(event, trigger, player) {
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
// === 转锋 ===
xiaobai_zhuanfeng: {
	audio: 2,
	trigger: { player: "phaseUseBegin" },
	filter(event, player) {
		return player.isIn() && game.hasPlayer((current) => current != player && player.inRange(current));
	},
	async cost(event, trigger, player) {
		const ctrl = await player
			.chooseControl("获得", "交给", "cancel2")
			.set("prompt", "转锋：你可以选择获得或交给攻击范围内所有角色各一张牌")
			// 用户定的公式：**本阶段打得成伤害就选「交给」**——先付牌，造成伤害后自动补做「获得」
			// （content 里把另一项存进 xiaobai_zhuanfeng_mode，damageEnd 子技能执行）。
			// 打不成伤害就选「获得」：白拿一圈牌，且后续不会触发「交给」白送回去。
			.set("ai", () => {
				const me = get.player();
				const canDamage = me.getCards("h").some((card) => get.tag(card, "damage") > 0 && me.hasUseTarget(card, null, false));
				return canDamage ? 1 : 0; // 0=获得 1=交给
			})
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
// === 撰疏 ===
// 印牌标准形态：chooseButton 选牌面 + backup 无素材三件套（filterCard:()=>false + selectCard:-1，
// ⚠️ 旧写法 selectCard:[0,2] 用“选0张”当摸牌哨兵是标准明令禁止的——0 会被引擎当未选择/取消）。
// 摸两张/弃置两张两项都在 precontent 里选择与支付；失效方向：摸过失效至弃两张、弃过失效至摸两张。
xiaobai_zhuanshu: {
	audio: 2,
	enable: "phaseUse",
	hiddenCard(player, name) {
		return lib.inpile.includes(name) && get.type(name) == "basic";
	},
	filter(event, player) {
		// 整技能失效（用户定版回退）：发动后 disableSkill 灰按钮，摸二/弃二动作复原（recover 子技能监听）
		if (player.storage.xiaobai_zhuanshu_ban) return false;
		if (event.skill?.startsWith("xiaobai_zhuanshu") || event._skill?.startsWith("xiaobai_zhuanshu")) return true;
		return get.inpileVCardList((info) => info[0] == "basic").some((info) => event.filterCard?.(get.autoViewAs({ name: info[2], nature: info[3], isCard: true }, "unsure"), player, event));
	},
	chooseButton: {
		dialog(event, player) {
			// ⚠️ 卫境式窗口过滤（sp/skill.js:33545 原生印基本牌范本）：只列当前窗口真正接受的基本牌名——
			// 无过滤时「闪」（不可使用）、「桃」（满血无合法目标）是死选项：分支照常执行、视为使用却是空操作
			const vcards = [];
			for (const info of get.inpileVCardList((info2) => info2[0] == "basic")) {
				const card = { name: info[2], nature: info[3], isCard: true };
				if (event.filterCard?.(card, player, event)) vcards.push([info[0], "", info[2], info[3]]);
			}
			return ui.create.dialog("撰疏：请选择视为使用的基本牌", [vcards, "vcard"], "hidden");
		},
		check(button) {
			return get.player().getUseValue(get.autoViewAs({ name: button.link[2], nature: button.link[3], isCard: true }), null, true);
		},
		backup(links) {
			const name = links[0][2];
			const nature = links[0][3];
			return {
				audio: "xiaobai_zhuanshu",
				// 无素材印牌三件套（同火宴/辟易）：选完牌面直接进引擎的目标步骤
				filterCard: () => false,
				selectCard: -1,
				viewAs: { name, nature, isCard: true, storage: { xiaobai_zhuanshu: true } },
				async precontent(event, trigger, player) {
					// 选执行项；取消 → cancel=true 重开窗口（不支付，与辟易判定黑的取消语义一致）
					const ctrl = await player
						.chooseControl(["摸两张牌", "弃置两张牌", "cancel2"])
						.set("prompt", "撰疏：选择执行一项")
						.set("choiceList", ["摸两张牌并展示之", "弃置两张手牌并展示之"])
						.set("ai", () => {
							const hs = player.getCards("h");
							if (hs.length < 2) return "摸两张牌";
							// 弃掉最便宜的两张若不亏（合计价值低于摸牌收益）则弃，否则摸
							const vals = hs.map((card) => get.value(card, player)).sort((a, b) => a - b);
							return vals[0] + vals[1] < 8 ? "弃置两张牌" : "摸两张牌";
						})
						.forResult();
					if (!ctrl?.control || ctrl.control == "cancel2") {
						event.result.cancel = true;
						return;
					}
					player.logSkill("xiaobai_zhuanshu");
					let pool = [];
					if (ctrl.control == "摸两张牌") {
						// ⚠️ draw 的牌在 event.result.cards（知识库 R14：draw 的牌在 result.cards，event.cards 不存在）
						const drawEvent = player.draw(2);
						await drawEvent;
						pool = (drawEvent.result?.cards || []).slice(0);
						if (pool.length) await player.showCards(pool, "撰疏：展示摸到的牌");
					} else {
						const res = await player
							.chooseCard("h", true, 2, "撰疏：弃置两张牌并展示")
							.set("ai", (card) => get.value(card, player))
							.forResult();
						pool = (res?.cards || []).slice(0);
						if (pool.length < 2) {
							event.result.cancel = true;
							return;
						}
						await player.showCards(pool, "撰疏：展示弃置的牌");
						await player.discard(pool);
					}
					// 三者（展示两张 + 视为的基本牌）牌名均不同 → 整技能失效，摸二/弃二动作复原
					if (pool.length == 2) {
						const n1 = get.name(pool[0]);
						const n2 = get.name(pool[1]);
						if (n1 != n2 && n1 != name && n2 != name) {
							player.storage.xiaobai_zhuanshu_ban = ctrl.control == "摸两张牌" ? "needDiscard" : "needDraw";
							player.disableSkill("xiaobai_zhuanshu_ban", "xiaobai_zhuanshu");
							game.log(player, "的", "#g【撰疏】", "失效至执行另一项");
						}
					}
				},
			};
		},
		prompt(links) {
			return `###撰疏###<div class="text center">摸两张牌或弃置两张牌并展示之，视为使用一张【${get.translation(links[0][2])}】</div>`;
		},
	},
	// ⚠️ useSkill 兜底路由（诂守/素翩同款，AI/托管路径必经）：useResult 在 result.card 缺失时
	// 直接拼 { skill: 本体id, cards } 走 useSkill——对话框路径 result.card 已设，不会进本 content。
	// AI 路径自行完成“选分支 → 摸/弃+展示 → 三者判定（失效）→ 视为使用基本牌”全流程。
	async content(event, trigger, player) {
		if (player.storage.xiaobai_zhuanshu_ban) return;
		const hs = player.getCards("h");
		const isDraw = hs.length < 2 || (() => {
			const vals = hs.map((card) => get.value(card, player)).sort((a, b) => a - b);
			return !(vals[0] + vals[1] < 8);
		})();
		player.logSkill("xiaobai_zhuanshu");
		let pool = [];
		if (isDraw) {
			const drawEvent = player.draw(2);
			await drawEvent;
			pool = (drawEvent.result?.cards || []).slice(0);
			if (pool.length) await player.showCards(pool, "撰疏：展示摸到的牌");
		} else {
			if (hs.length < 2) return;
			const res = await player
				.chooseCard("h", true, 2, "撰疏：弃置两张牌并展示")
				.set("ai", (card) => get.value(card, player))
				.forResult();
			pool = (res?.cards || []).slice(0);
			if (pool.length < 2) return;
			await player.showCards(pool, "撰疏：展示弃置的牌");
			await player.discard(pool);
		}
		// 视为使用基本牌：候选=全部基本牌中“当前可使用”的，AI 取使用价值最高者
		let name = null;
		let best = -Infinity;
		for (const info of get.inpileVCardList((info2) => info2[0] == "basic")) {
			const n = info[2];
			if (!player.hasUseTarget({ name: n, isCard: true }, true, false)) continue;
			const v = player.getUseValue({ name: n, isCard: true }, null, true);
			if (v > best) {
				best = v;
				name = n;
			}
		}
		// 三者牌名均不同 → 整技能失效至摸二/弃二动作复原
		if (pool.length == 2 && name) {
			const n1 = get.name(pool[0]);
			const n2 = get.name(pool[1]);
			if (n1 != n2 && n1 != name && n2 != name) {
				player.storage.xiaobai_zhuanshu_ban = isDraw ? "needDiscard" : "needDraw";
				player.disableSkill("xiaobai_zhuanshu_ban", "xiaobai_zhuanshu");
				game.log(player, "的", "#g【撰疏】", "失效至执行另一项");
			}
		}
		if (!name) return;
		await player.chooseUseTarget({ name, isCard: true }, "撰疏：视为使用一张【" + get.translation(name) + "】", false);
	},
	// 失效恢复监测：不进 group（disableSkill 级联陷阱，知识库 #59），init 动态挂载
	init(player) {
		player.addSkill("xiaobai_zhuanshu_recover");
	},
	onremove(player) {
		player.removeSkill("xiaobai_zhuanshu_recover");
		player.enableSkill("xiaobai_zhuanshu_ban");
		delete player.storage.xiaobai_zhuanshu_ban;
	},
	subSkill: {
		recover: {
			charlotte: true,
			sub: true,
			trigger: { player: ["drawAfter", "loseAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const ban = player.storage.xiaobai_zhuanshu_ban;
				if (!ban) return false;
				// 复原动作 = 摸两张牌 或 弃置两张牌（任意来源的动作均计，不限本技能执行）
				if (event.name == "draw") {
					// ⚠️ draw 的牌在 result.cards（R14）
					return ban == "needDraw" && (event.result?.cards || []).length == 2;
				}
				return ban == "needDiscard" && event.type == "discard" && ((event.hs || []).length + (event.ss || []).length + (event.es || []).length) == 2;
			},
			content(event, trigger, player) {
				player.storage.xiaobai_zhuanshu_ban = null;
				player.enableSkill("xiaobai_zhuanshu_ban");
				game.log(player, "的", "#g【撰疏】", "恢复了");
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
// === 撰域 ===
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
// === 追舳 ===
// 失效呈现走文档标准（坑-技能失效与标记显示.md）：disableSkill → 描述自动变灰，不用 mark
xiaobai_zhuizhu: {
	audio: 2,
	// 使用【杀】指定目标后
	trigger: { player: "useCardToTarget" },
	filter(event, player) {
		// 失效期间主技能被 game.filterSkills 摘除、触发器不会进来，无需再判失效标记
		if (!event.isFirstTarget || get.name(event.card) != "sha") return false;
		return player.getAttackRange() != player.countCards("h");
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseBool("追舳：你可以将手牌数调整至你的攻击范围")
			.set("ai", () => player.getAttackRange() > player.countCards("h"))
			.forResult();
		if (!res?.bool) {
			// 拒绝发动追舳 → 恢复寻鹿（enableSkill 传禁用方键，坑-技能失效文档④）
			if (player.hasSkill("xiaobai_xunlu_disabled")) {
				player.enableSkill("xiaobai_xunlu_disabled");
				player.removeSkill("xiaobai_xunlu_disabled");
				game.log(player, "的〖寻鹿〗恢复");
			}
		}
		event.result = res?.bool ? { bool: true } : { bool: false };
	},
	async content(event, trigger, player) {
		// 发动后此技能失效，直到拒绝发动「寻鹿」（互锁）——描述变灰
		player.disableSkill("xiaobai_zhuizhu_disabled", "xiaobai_zhuizhu");
		player.addSkill("xiaobai_zhuizhu_disabled");
		game.log(player, "的〖追舳〗失效");
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
// 追舳的失效载体（文档写法 A+）：独立挂载、不带 mark，onremove 负责死亡清理
xiaobai_zhuizhu_disabled: {
	charlotte: true,
	sub: true,
	onremove(player) {
		player.enableSkill("xiaobai_zhuizhu_disabled");
	},
},
// === 著威 ===
// ⚠️ 旧实现 trigger 角色写成 target 且 filter 又要求 event.player==player——两条件只有
// "以自己为目标"时同时成立，"指定其他角色为目标"（描述的正主）永远不触发。
// 正确角色是 player（useCardToTarget 子事件的 player=用牌者，content.js:9376）。
// 无次数限制走表诏同款 mod.cardUsableTarget（按目标豁免次数，jsrg.js:13685）。
xiaobai_zhuwei: {
	audio: 2,
	trigger: { player: "useCardToTarget" },
	filter(event, player) {
		return player.isIn() && event.target != player;
	},
	// 本回合内：其手牌数大于你 → 你对其使用的牌无次数限制（目标可继续指定，次数耗尽也放行）
	mod: {
		cardUsableTarget(card, player, target) {
			const list = player.getStorage("xiaobai_zhuwei_list") || [];
			if (list.includes(target) && target.countCards("h") > player.countCards("h")) {
				return true;
			}
		},
	},
	async cost(event, trigger, player) {
		const target = trigger.target;
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
		// 其手牌数小于你 → 此牌对其无效（“本回合内”规则同样覆盖本次使用）
		if (target.countCards("h") < player.countCards("h")) {
			const useEvent = trigger.getParent("useCard");
			if (useEvent) {
				useEvent.excluded.add(target);
				game.log(target, "对此牌无效");
			}
		}
	},
	group: ["xiaobai_zhuwei_invalid", "xiaobai_zhuwei_clear"],
	subSkill: {
		// 无效分支：对名单中手牌数小于你的目标用牌时，逐次实时比较手牌数，小于则此牌对该目标无效
		invalid: {
			charlotte: true,
			sub: true,
			trigger: { player: "useCardToTarget" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const list = player.storage.xiaobai_zhuwei_list || [];
				return list.includes(event.target);
			},
			content(event, trigger, player) {
				const target = trigger.target;
				if (target.countCards("h") < player.countCards("h")) {
					const useEvent = trigger.getParent("useCard");
					if (useEvent) {
						useEvent.excluded.add(target);
						game.log(target, "对此牌无效");
					}
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
				await lib.qunyou_adjustHandTo(player, 4);
			},
			onremove(player) {
				// 状态结束：切回"圆"标记
				player.markSkill("xiaobai_zhuyuan");
			},
		},
	},
},
// === 眦刃 ===
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
				check(card) {
					return 6 - get.value(card);
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
				// ⚠️ useCardBegin 只填「用户通过 .set() 写进去的值」，不可能是引擎初始化出来的数组
				// （初始化在 content.useCard 第 0 步，content.js:9161-9163）⇒ 这里只能赋值，不能 .addArray。
				// directHit 在 content.js 里有两处消费：`:9575` 的 playered 循环（`includes`，要数组）
				// 与 `:670` 的 `this.directHit = true`（无懈取消后整张牌不可响应，布尔也认）。
				// 这里传数组，两条消费都能正确命中。
				trigger.directHit = game.filterPlayer();
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
// === 恣逸 ===
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
	onremove(player) {
		// 场上还有人持有恣逸时不要拆（恣逸可能被复制/转移给其他角色）
		if (game.hasPlayer((current) => current.hasSkill("xiaobai_ziyi"))) return;
		game.countPlayer((current) => current.removeSkill("xiaobai_ziyi_o"));
	},
	group: ["xiaobai_ziyi_mount"],
	subSkill: {
		// 阴态全局挂载：**其他角色**在各自出牌阶段要用〖恣逸〗阴态，
		// 所以必须把 xiaobai_ziyi_o 主动 addSkill 给其他角色。
		// ⚠️ 只写 group: ["xiaobai_ziyi_o"] 只会把它挂成**自己**的子技能，其他角色永远看不到 → 阴态完全无法触发。
		// ⚠️ 也不能在 init 里挂：开局是 `for (i) game.players[i].init(...)` 按座次逐个初始化
		//   （noname/game/index.js:3294-3308），而 player.init 开头就 clearSkills(true)
		//   （noname/library/element/player.js:3400）⇒ 座次排在何祗**之后**的角色，
		//   其 init 会把刚挂上的 _o 又清掉（clearSkills 只保 superCharlotte，player.js:11670-11682）。
		//   改为 gameStart / changeSkillsAfter 挂载：此时全员 init 已完成，换将/中途获得也能补挂。
		mount: {
			charlotte: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: { global: ["gameStart", "changeSkillsAfter"] },
			filter(event, player) {
				return player.hasSkill("xiaobai_ziyi");
			},
			content(event, trigger, player) {
				game.countPlayer((current) => {
					if (current != player) current.addSkill("xiaobai_ziyi_o");
				});
			},
		},
	},
	// ============ 阳：你可以视为使用【酒】 ============
	// ★ 标准形态照原生「醇醪 decadechunlao」（refresh.js:9544）：
	//   `enable:"chooseToUse"` + `viewAs:{name:"jiu",isCard:true}` + **`filterCard:()=>false` + `selectCard:-1`**
	//   —— 后两者是关键：「视为使用」= **凭空印牌、不消耗任何牌**；不写它们引擎会要求玩家先选一张底牌
	//   （把阳态变成"将一张牌当【酒】使用"，与描述不符）。
	// ★ 合法性校验**不用自己写**：引擎在 `lib/index.js:10844-10851` 里对 `viewAs` 类技能
	//   **自动**执行 `event.filterCard(get.autoViewAs(info.viewAs, "unsure"), player, event)`
	//   （含"当前是否真的需要【酒】/次数限制/濒死求酒"等），所以 filter 只需判"是否阳态"。
	enable: "chooseToUse",
	viewAs: { name: "jiu", isCard: true },
	filter(event, player) {
		// 阴态不可用（storage 为 false / undefined 即阳态）
		return !player.storage.xiaobai_ziyi;
	},
	viewAsFilter(player) {
		return !player.storage.xiaobai_ziyi;
	},
	filterCard: () => false,
	selectCard: -1,
	// ★ 转换技：**发动后必须转换**（阳 → 阴）。原先漏了这一步，导致"转换技"名不副实、
	//   阳态可以无限次视为使用【酒】。时机放 `precontent`（印牌类技能的标准副作用位置，
	//   范例 clandongxu clan.js:1067、decadechunlao refresh.js:9558）。
	//   `log:false` + 手动 logSkill：防止引擎自动记一次、这里再记一次变成重复日志。
	log: false,
	async precontent(event, trigger, player) {
		player.logSkill("xiaobai_ziyi");
		player.changeZhuanhuanji("xiaobai_ziyi");
	},
	prompt: "恣逸：视为使用【酒】",
	check() {
		return 1;
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
},
// === 恣逸 ===
// 恣逸阴态：全局挂载，其他角色交牌令何祗发动神点
xiaobai_ziyi_o: {
	charlotte: true,
	enable: "phaseUse",
	filter(event, player) {
		// 自己必须至少有一张牌可交（否则 chooseCard 的 [1, countCards("he")] 会变成 [1,0] 非法范围）
		if (player.countCards("he") <= 0) return false;
		// 场上有处于**阴态**的恣逸拥有者才提供按钮
		return game.hasPlayer((current) => current != player && current.isIn() && current.hasSkill("xiaobai_ziyi") && current.storage?.xiaobai_ziyi);
	},
	filterTarget(card, player, target) {
		return target != player && target.isIn() && target.hasSkill("xiaobai_ziyi") && target.storage?.xiaobai_ziyi;
	},
	selectTarget: 1,
	prompt: "恣逸：交给一名恣逸角色至少一张牌，令其发动〖神点〗",
	// ===== 神点翻倍预判（阴态是否掉体力完全由它决定） =====
	// 「因〖神点〗摸牌数」= 神点期间摸到的所有牌 = 每次重铸摸的那张 + 每次「翻倍」选摸牌摸的那张
	// （原型 shendian.lua:52-54 重铸后立刻 addPlayerMark("xiaobai__shendian_draw")，:160-162 选项一同样 +1）。
	// 所以只要重铸次数 budget ≥ 交出牌数，就不会掉体力——这也是下面队友分支的直接依据。
	analyze(target, extraCards) {
		const turnCards = getTurnDiscardCards();
		const X = Math.min(turnCards.length, 20);
		const origin = {};
		for (const card of turnCards) {
			const suit = get.suit(card);
			if (suit) origin[suit] = (origin[suit] || 0) + 1;
		}
		const all = target.getCards("hes").concat(extraCards || []);
		const have = {};
		for (const card of all) {
			const suit = get.suit(card);
			if (suit) have[suit] = (have[suit] || 0) + 1;
		}
		// 重铸会立刻补牌，所以能重铸的次数 = min(重铸上限 X, 起手牌数)
		const budget = Math.min(X, all.length);
		return { X, origin, have, budget };
	},
	// 交牌者视角的完整决策：用不用、交哪几张、对目标的价值（供 ai.result.target）
	evaluate(player, target) {
		const self = lib.skill.xiaobai_ziyi_o;
		const own = player.getCards("he");
		if (!own.length) return { use: false, cards: [], value: 0 };
		// 交出去的代价越小越好：按价值升序
		const byValue = own.slice().sort((a, b) => get.value(a) - get.value(b));
		const info = self.analyze(target, []);
		if (get.attitude(player, target) > 0) {
			// 队友：神点能重铸至少 1 次 ⇒ 光重铸就摸回 ≥1 张，交 1 张最便宜的牌绝不会让队友掉体力。
			// （旧写法只在「目标自己够翻倍」时才敢交，是因为当时只数选项一摸牌——那个口径已修，见 xiaobaiShendianFlow）
			if (info.budget >= 1) return { use: true, cards: [byValue[0]], value: 1 };
			// 神点一次都重铸不了（本回合弃牌堆为空）⇒ 队友白掉 1 点体力，绝不做
			return { use: false, cards: [], value: 0 };
		}
		// 敌人：本回合弃牌堆为空 ⇒ 神点一次都重铸不了、也不可能翻倍 ⇒ 交 1 张牌必然让对手掉 1 点体力
		if (info.X <= 0) return { use: true, cards: [byValue[0]], value: -2 };
		// 敌人：只要神点能重铸，摸牌数就 ≥ 重铸次数，而重铸次数通常远大于能交出的牌数 ⇒ 不再强行喂牌
		return { use: false, cards: [], value: 0 };
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		const plan = lib.skill.xiaobai_ziyi_o.evaluate(player, target);
		const res = await player
			.chooseCard("he", true, [1, player.countCards("he")], "恣逸：交给" + get.translation(target) + "至少一张牌，令其发动〖神点〗")
			// 只给计划内的牌打正分：ai.basic.chooseCard 会一直选到「最高分 ≤ 0」为止，
			// 所以正分牌的张数 = 实际交出的张数（旧写法 5 - get.value(card) 会把手里所有便宜牌一次性全交出去）
			.set("ai", (card) => (plan.cards.includes(card) ? 100 - get.value(card) : -1))
			.forResult();
		if (!res?.cards?.length) return;
		const giveNum = res.cards.length;
		await player.give(res.cards, target);
		if (!target.isIn()) return;
		target.logSkill("xiaobai_shendian");
		// 把交牌数作为「至少摸几张」的约定传进去，让神点的 AI 优先凑够摸牌数
		const drawCount = await lib.xiaobaiShendianFlow(target, giveNum);
		// 「然后若你因〖神点〗摸牌数少于其交出牌数，你失去1点体力」
		if (drawCount < giveNum && target.isIn()) {
			await target.loseHp(1);
		}
		// ★ 转换技：发动后转换（阴 → 阳）。失血可能致死，故判 isIn。
		if (target.isIn()) {
			target.changeZhuanhuanji("xiaobai_ziyi");
		}
	},
	ai: {
		order: 5,
		result: {
			// result.target 是「对目标的价值」，引擎再乘 get.attitude(player, target) 得到最终收益
			// （noname/get/index.js:6775 `final = result1 * attitude(player,player) + result2 * attitude(player,target)`）。
			// ⇒ 对队友返回正数、对敌人返回负数才是「愿意用」；返回 0 则 ai.basic.chooseTarget 直接取消，
			//    AI 就不会发动这个技能（content.js:4650 `ai.basic.chooseTarget(event.ai2)` 为假 → 取消并排除技能）。
			// 旧写法 `attitude > 0 ? 1 : -1` 让 AI 对**任何**敌人都无脑交牌（哪怕神点必摸到牌、白送牌给对手），
			// 这里改成只在「必定让对手掉体力」时才对敌人出手。
			target(player, target) {
				return lib.skill.xiaobai_ziyi_o.evaluate(player, target).value;
			},
		},
	},
},
// === 奏黜 ===
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
			// 有足够的【杀】才询问；否则（没有/不够）不询问，直接传给下家
			if (slashIds.length >= times) {
				// ⚠️ 不传 forced（第 5 参）：有【杀】可展示时也要给「取消」按钮 ——
				//    取消 = 不展示、继续把牌传给下家（chooseCard 的 boolean 位置参数 = forced，会吞掉取消按钮）
				const shown = await current
					.chooseCard("h", `奏黜：展示${get.cnNumber(times)}张【杀】并对${get.translation(player)}依次使用，或取消将此牌交给下家`, times, (c) => get.name(c) == "sha")
					.forResult();
				if (shown?.cards?.length == times) {
					await current.showCards(shown.cards);
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
		// 未被展示终止：弃置此牌 + 弃置终点角色 X（X=传递次数+1）张牌 + 视为对终点使用【杀】
		const owner = get.owner(card);
		if (owner?.isIn() && get.position(card) != "d") {
			await owner.discard([card], player);
		}
		if (target.isIn() && player.isIn()) {
			const n = Math.min(times + 1, target.countDiscardableCards(player, "hej"));
			if (n > 0) {
				// 原生 discardPlayerCard：由牌主执行弃置、discarder 归因窦武
				await player.discardPlayerCard(target, "hej", true, n, "奏黜：弃置" + get.translation(target) + get.cnNumber(n) + "张牌");
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
// === 佐榱 ===
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

};

// ===== StepCompiler 可见性：编译后的回调（content/cost/precontent/onuse）里只能用引擎注入的名字，
// 模块作用域的函数/import 全部丢失，所以这里统一挂到 lib 上，回调里写 lib.xxx。
lib.xiaobaiBowenX = xiaobaiBowenX;
lib.xiaobaiBoyiCan = xiaobaiBoyiCan;
lib.xiaobaiChangheNames = xiaobaiChangheNames;
lib.xiaobaiMozhuanState = xiaobaiMozhuanState;
lib.xiaobaiTongyanCollect = xiaobaiTongyanCollect;
