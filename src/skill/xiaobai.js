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
			return evt.getParent("recast") ? "recast" : "discard";
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

// content 在“全局化”编译环境下只能访问 lib/game/get/ui/_status，故把 content 内用到的 helper 挂到 lib 上
lib.xiaobaiChangheNames = xiaobaiChangheNames;
lib.xiaobaiChangheGeneralName = xiaobaiChangheGeneralName;
lib.xiaobaiCetuPlay = xiaobaiCetuPlay;
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
	group: ["xiaobai_yujie_draw"],
	trigger: { global: "phaseBegin" },
	filter(event, player) {
		if (player.hasSkill("xiaobai_yujie_used")) return false;
		return lib.xiaobaiYujieTargets(player).length > 0;
	},
	async cost(event, trigger, player) {
		const list = lib.xiaobaiYujieTargets(player);
		const res = await player
			.chooseTarget("预诫：将一名角色于本回合移出游戏", (card, player2, target) => list.includes(target), true)
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
		out: {
			charlotte: true,
			group: "undist",
			mark: true,
			marktext: "诫",
			// markcount 实时刷新：intro.markcount 只在 updateMarks 被调用时求值（player.js:4700），
			// 标记创建于回合开始时花色数为 0，必须随牌被使用/打出主动刷新，否则数字永远不出现
			trigger: { global: ["useCardAfter", "respondAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.hasSkill("xiaobai_yujie_out");
			},
			content(event, trigger, player) {
				player.updateMarks("xiaobai_yujie_out");
			},
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


// === 探虚 ===
xiaobai_tanxu: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => current != player);
	},
	filterTarget(card, player, target) {
		return target != player;
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		// ① 凭空获得一张【影】（不是从牌堆摸）：影=黑桃1基本牌，enable:false、destroy:"discardPile"
		await player.gain(lib.card.ying.getYing(1), "gain2");
		if (!player.isIn()) return;
		const target = event.targets[0];
		if (!target?.isIn()) return;
		// ② 由目标「视为对你使用【推心置腹】」：直接 useCard 不查距离（对齐 FreeKill 的 useVirtualCard 语义），
		//    从而绕过【推心置腹】自带的 range.global:1；可被无懈，且无论是否被无懈都继续后续步骤
		await target.useCard({ name: "tuixinzhifu", isCard: true }, player, false, "xiaobai_tanxu");
		if (!player.isIn()) return;
		// ③ 展示所有手牌
		let shown = [];
		if (player.countCards("h")) {
			const show = player.showHandcards("探虚：展示所有手牌");
			await show;
			shown = show.cards || [];
		}
		// ④ 展示的牌里还有【影】→ 可对其造成1点伤害（影被对方换走则不触发）
		if (shown.some((cardx) => get.name(cardx) == "ying")) {
			const go = await player
				.chooseBool(`探虚：是否对${get.translation(target)}造成1点伤害？`)
				.set("ai", () => (get.attitude(player, target) < 0 ? 1 : 0))
				.forResult();
			if (go?.bool && target.isIn()) {
				await target.damage(player);
			}
		}
	},
	ai: {
		order: 6,
		result: {
			player: 1,
			target: -0.5,
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
	direct: true,
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
		// chooseControl 的结果没有 bool，只有 control/index（阵行 xinfu_zhenxing 同款）
		const result = await player
			.chooseControl("一张", "两张", "三张", "四张", "五张", "cancel2")
			.set("prompt", "求道：你可以观看牌堆顶至多五张牌，使用最后一张牌")
			.set("ai", () => 0)
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
		// 枚举本回合**未公开**的延时拼点：chooseToCompare 事件带 isDelay，
		// 且两张拼点牌都还停在移出区（get.position(card, true) == "s"）。
		// 已公开的会被 cardsGotoOrdering 搬走（position 变 "o"），已作废的 isDestroyed 为真。
		// ⚠️ globalHistory 里没有 chooseToCompare 这个键（只有 cardMove/custom/useCard/changeHp/everything），
		// 必须从 everything 里筛（everything 就是本回合全事件；globalHistory 每回合开始时压栈重建）
		const pendings = (game.getGlobalHistory("everything") || []).filter(
			(evt) =>
				evt.name == "chooseToCompare" &&
				evt.isDelay &&
				!evt.isDestroyed &&
				evt.card1 &&
				evt.card2 &&
				get.position(evt.card1, true) == "s" &&
				get.position(evt.card2, true) == "s"
		);
		// 「其未参与」= 目标既不是该拼点的发起者、也不是对方
		const usable = pendings.filter((evt) => evt.player != target && evt.target != target);
		const participants = [];
		for (const evt of usable) {
			for (const current of [evt.player, evt.target]) {
				if (current?.isIn() && !participants.includes(current)) participants.push(current);
			}
		}
		// 目标选择：替换延时拼点牌 / 本回合移出游戏 / 放弃（Lua 的 UI.ComboBox，cancelable = true）
		let choice;
		if (participants.length) {
			const ctrl = await target
				.chooseControl("替换延时拼点牌", "本回合移出游戏", "cancel2")
				.set("prompt", "施贫：请选择一项")
				.set("ai", () => "本回合移出游戏")
				.forResult();
			choice = ctrl?.control;
		} else {
			const go = await target.chooseBool("施贫：是否本回合移出游戏？").set("ai", () => true).forResult();
			choice = go?.bool ? "本回合移出游戏" : "cancel2";
		}
		if (!choice || choice == "cancel2") return;
		if (choice == "本回合移出游戏") {
			// 调虎离山同款：不传 expire → 引擎默认本回合结束（phaseAfter / phaseBeforeStart）自动过期
			target.addTempSkill("xiaobai_shipin_out");
			return;
		}
		// 替换：选参与者 → 选自己一张手牌 → 顶替其拼点牌，旧牌回目标手牌
		const pick = await target
			.chooseTarget("施贫：选择要替换其拼点牌的一名角色", (card, player2, targetx) => participants.includes(targetx))
			.forResult();
		const participant = pick?.targets?.[0];
		if (!participant) return;
		const cmpEvt = usable.find((evt) => evt.player == participant || evt.target == participant);
		if (!cmpEvt) return;
		const isInitiator = cmpEvt.player == participant;
		const oldCard = isInitiator ? cmpEvt.card1 : cmpEvt.card2;
		const cardPick = await target.chooseCard("h", "施贫：选择用于替换的一张手牌", true).forResult();
		const newCard = cardPick?.cards?.[0];
		if (!newCard) return;
		// 新牌进移出区（与延时拼点牌同区，position "s"）
		await target.lose([newCard], ui.special);
		// ⚠️ chooseToCompareEffect 是**运行时**才从 parentEvent 拷贝 card1/card2 并重算点数
		// （content.js:6553 的 for (const key of [...]) event[key] = evt[key]）→ 改字段即完成替换
		if (isInitiator) cmpEvt.card1 = newCard;
		else cmpEvt.card2 = newCard;
		// 旧牌回目标手牌（Lua: room:obtainCard(to, cid, ...)）
		await target.gain([oldCard], "gain2");
	},
	subSkill: {
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


};
