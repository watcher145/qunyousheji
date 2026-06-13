/**
 * 技能本体：export const skills = { skill_id: { ... }, ... }
 * 与奇臣传相同，在此集中编写；译名与 *_info 写在 ../translate/skill.js
 */
import { lib, game, get, ui, _status } from "noname";

/** 愁辞：普通锦囊（非延时） */
function qunyou_chouci_isNormalTrick(card) {
	return !!card && get.type(card, false) === "trick";
}

/** 愁辞：已记录的牌名列表 */
function qunyou_chouci_records(player) {
	const storage = player.storage.qunyou_chouci;
	if (Array.isArray(storage)) {
		return storage;
	}
	if (typeof storage === "string" && storage.length) {
		player.storage.qunyou_chouci = [storage];
		return player.storage.qunyou_chouci;
	}
	player.storage.qunyou_chouci = [];
	return player.storage.qunyou_chouci;
}

/** 愁辞：弃牌堆中指定牌名的牌 */
function qunyou_chouci_discardByName(name) {
	return Array.from(ui.discardPile.childNodes).filter((card) => get.name(card, false) === name);
}

/** 愁辞：实体牌名 */
function qunyou_chouci_cardName(card) {
	return get.itemtype(card) === "card" && typeof card.name === "string" && card.name.length ? card.name : null;
}

function qunyou_chouci_eventDiscardCards(event) {
	const cards = [];
	const addCard = (card) => {
		const name = qunyou_chouci_cardName(card);
		if (name && get.position(card, true) === "d" && qunyou_chouci_isNormalTrick(card) && !cards.includes(card)) {
			cards.push(card);
		}
	};
	if (typeof event.getd === "function") {
		const dCards = event.getd();
		if (Array.isArray(dCards)) {
			dCards.forEach(addCard);
		}
	}
	if (cards.length) {
		return cards;
	}
	if (typeof event.getl === "function") {
		for (const player of game.filterPlayer()) {
			const lost = event.getl(player);
			for (const key of ["cards2", "cards"]) {
				if (Array.isArray(lost?.[key])) {
					lost[key].forEach(addCard);
				}
			}
		}
	}
	for (const key of ["cards2", "cards"]) {
		if (Array.isArray(event[key])) {
			event[key].forEach(addCard);
		}
	}
	return cards;
}

function qunyou_chouci_eventOrderingCards(event) {
	if (!event || !["cardsDiscard", "cardsDiscardAfter"].includes(event.name)) {
		return [];
	}
	const orderingEvt = event.getParent();
	if (!orderingEvt || orderingEvt.name !== "orderingDiscard") {
		return [];
	}
	return (event.cards || []).filter((card) => qunyou_chouci_cardName(card) && get.position(card, true) === "d" && qunyou_chouci_isNormalTrick(card));
}

/** 愁辞：本次应记录的牌名 */
function qunyou_chouci_namesToRecord(event, player) {
	const orderingCards = qunyou_chouci_eventOrderingCards(event);
	const entering = orderingCards.length ? orderingCards : qunyou_chouci_eventDiscardCards(event);
	if (!entering.length) {
		return [];
	}
	const names = [];
	for (const card of entering) {
		const name = qunyou_chouci_cardName(card);
		if (!name || names.includes(name) || qunyou_chouci_records(player).includes(name)) {
			continue;
		}
		const inEvent = entering.filter((current) => qunyou_chouci_cardName(current) === name).length;
		const inDiscard = qunyou_chouci_discardByName(name).length;
		if (inEvent > 0 && inEvent === inDiscard) {
			names.push(name);
		}
	}
	return names;
}

/** 愁辞：写入新的记录牌名 */
function qunyou_chouci_addRecords(player, names) {
	game.log(player, "【愁辞调试H】进入addRecords");
	const records = qunyou_chouci_records(player);
	game.log(player, `【愁辞调试I】storage类型=${Array.isArray(records) ? "array" : typeof records}；长度=${typeof records?.length === "number" ? records.length : "无"}`);
	const validNames = names.filter((name) => typeof name === "string" && name.length && !records.includes(name));
	game.log(player, `【愁辞调试J】待写入数=${validNames.length}`);
	if (validNames.length) {
		for (const name of validNames) {
			if (!records.includes(name)) {
				records.push(name);
			}
		}
		game.log(player, "【愁辞调试K】push完成");
		player.markSkill("qunyou_chouci");
		game.log(player, "【愁辞调试L】markSkill完成");
	}
	return records;
}


/** 琼赋：可视为使用的基本牌 vcard 列表 */
function qunyou_qionfu_basicVcards(player) {
	const list = [];
	for (const name of lib.inpile) {
		if (get.type(name) !== "basic") {
			continue;
		}
		const card = { name, isCard: true };
		if (player.hasUseTarget(card, true, false)) {
			list.push(["基本", "", name]);
		}
	}
	return list;
}

/** 手牌 + 装备 + 判定区牌数 */
function qunyou_fuzhen_zoneCount(player) {
	return player.countCards("h") + player.countCards("e") + player.countCards("j");
}

/** 连招：本次获得牌（含摸牌阶段、技能摸牌等） */
function qunyou_combo_isDraw(event, player) {
	return (event.getg?.(player) || []).length > 0;
}

/** 连招：本次弃置的手牌/装备（含 lose / loseAsync / discard） */
function qunyou_combo_isDiscard(event, player) {
	if (event.getlx === false) {
		return false;
	}
	if (event.name === "discard" && event.player === player && event.cards?.length) {
		return true;
	}
	const lost = event.getl?.(player);
	const cards2 = lost?.cards2?.length ? lost.cards2 : event.player === player ? event.cards2 : null;
	if (!cards2?.length) {
		return false;
	}
	if (event.type === "discard") {
		return true;
	}
	if (event.name === "loseAsync") {
		let discarding = false;
		event.checkHistory?.("lose", (evt) => {
			if (evt.type === "discard" && evt.player === player) {
				discarding = true;
			}
		});
		return discarding;
	}
	return false;
}

/** 连招：取本次弃置进入弃牌堆的牌 */
function qunyou_combo_getDiscardCards(event, player) {
	if (event.name === "discard" && event.player === player && event.cards?.length) {
		return event.cards.slice();
	}
	const lost = event.getl?.(player);
	if (lost?.cards2?.length && (event.type === "discard" || event.name === "loseAsync")) {
		return lost.cards2.slice();
	}
	if (event.player === player && event.cards2?.length && event.type === "discard") {
		return event.cards2.slice();
	}
	return [];
}

/** 连招：清除 pending 与「可连击」提示 */
function qunyou_combo_break(player, skill) {
	delete player.storage[`${skill}_pending`];
	player.removeTip(`${skill}_mark`);
}

/** 咏絮：递归展开本次响应所用牌的实体底牌（兼容嵌套虚拟牌） */
function qunyou_yongxu_flatPhysical(card, list = []) {
	if (!card) {
		return list;
	}
	if (Array.isArray(card)) {
		for (const item of card) {
			qunyou_yongxu_flatPhysical(item, list);
		}
		return list;
	}
	if (card.cards?.length) {
		qunyou_yongxu_flatPhysical(card.cards, list);
	} else if (get.itemtype(card) === "card") {
		list.add(card);
	}
	return list;
}

/** 咏絮：本次响应所用牌的实体底牌（闪/无懈等 event.cards 或 event.card.cards） */
function qunyou_yongxu_baseCards(event) {
	const cards = qunyou_yongxu_flatPhysical(event.cards);
	if (cards.length) {
		return cards;
	}
	return qunyou_yongxu_flatPhysical(event.card);
}

function qunyou_yongxu_isTrick(card, player) {
	return get.type2(card, player) === "trick";
}

/** 妙喻：当前可选的 ±1 项（牌数须 ≥ 调整后 X；L-1<1 时不能选 -1） */
function qunyou_miaoyu_controls(player, cur) {
	if (!cur?.isIn()) {
		return [];
	}
	const L = cur.getHandcardLimit();
	const n = player.countCards("hes");
	const list = [];
	if (L + 1 >= 1 && n >= L + 1) {
		list.push("手牌上限+1");
	}
	if (L - 1 >= 1 && n >= L - 1) {
		list.push("手牌上限-1");
	}
	return list;
}

function qunyou_miaoyu_canUse(player, cur) {
	return qunyou_miaoyu_controls(player, cur).length > 0;
}

function qunyou_miaoyu_modAiValue(player, card, num) {
	const ev = get.event();
	if (ev.type !== "wuxie" && ev.getParent?.()?.type !== "wuxie") {
		return;
	}
	const cur = _status.currentPhase;
	if (!cur?.isIn() || !qunyou_miaoyu_canUse(player, cur)) {
		return;
	}
	const cards2 = player.getCards("hes");
	cards2.sort((a, b) => {
		return (get.name(b) === "wuxie" ? 1 : 2) - (get.name(a) === "wuxie" ? 1 : 2);
	});
	const geti = () => (cards2.includes(card) ? cards2.indexOf(card) : cards2.length);
	if (get.name(card) === "wuxie") {
		return Math.min(num, [6, 4, 3][Math.min(geti(), 2)]) * 0.6;
	}
	return Math.max(num, [6, 4, 3][Math.min(geti(), 2)]);
}

function qunyou_zhitian_getExecutor(event, player) {
	if (event.triggername === "useCardToPlayered") {
		return event.target;
	}
	return player;
}

function qunyou_zhitian_isDamageUnique(event, player) {
	const executor = qunyou_zhitian_getExecutor(event, player);
	if (!executor?.isIn() || !executor.countCards("he")) {
		return false;
	}
	if (!event.card || !get.tag(event.card, "damage")) {
		return false;
	}
	if (event.isFirstTarget === false) {
		return false;
	}
	return Array.isArray(event.targets) && event.targets.length === 1;
}

function qunyou_zhitian_uniqueMinHandOther(player) {
	const others = game.filterPlayer((current) => current !== player);
	if (!others.length) {
		return null;
	}
	others.sort((a, b) => a.countCards("h") - b.countCards("h"));
	if (others.length > 1 && others[0].countCards("h") === others[1].countCards("h")) {
		return null;
	}
	return others[0];
}

async function qunyou_zhitian_execute(executor, skill) {
	if (!executor?.isIn() || !executor.countCards("he")) {
		return;
	}
	await executor.chooseToDiscard(2, true, "he").forResult();
	await executor.draw(2);
	const other = qunyou_zhitian_uniqueMinHandOther(executor);
	if (!other?.isIn() || !other.countCards("he")) {
		return;
	}
	const result = await other
		.chooseBool(get.prompt2(skill))
		.set("choice", other.countCards("he") <= 3)
		.forResult();
	if (!result?.bool || !other.isIn() || !other.countCards("he")) {
		return;
	}
	await other.chooseToDiscard(2, true, "he").forResult();
	await other.draw(2);
}

const qunyou_zhijue_suits = ["spade", "heart", "club", "diamond"];

function qunyou_zhijue_storage(player) {
	let storage = player.storage.qunyou_zhijue;
	if (!storage || typeof storage !== "object") {
		storage = {};
		player.storage.qunyou_zhijue = storage;
	}
	for (const key of ["wuxieUsedSuits", "huogongUsedSuits"]) {
		if (!Array.isArray(storage[key])) {
			storage[key] = [];
		}
	}
	return storage;
}

function qunyou_zhijue_getUsed(player, name) {
	const storage = qunyou_zhijue_storage(player);
	return name === "wuxie" ? storage.wuxieUsedSuits : storage.huogongUsedSuits;
}

function qunyou_zhijue_getCrossUsed(player, name) {
	return qunyou_zhijue_getUsed(player, name === "wuxie" ? "huogong" : "wuxie");
}

function qunyou_zhijue_getSuit(card, player) {
	const suit = get.suit(card, player);
	return qunyou_zhijue_suits.includes(suit) ? suit : null;
}

function qunyou_zhijue_canTransform(player, name, card) {
	const suit = qunyou_zhijue_getSuit(card, player);
	if (!suit) {
		return false;
	}
	return !qunyou_zhijue_getCrossUsed(player, name).includes(suit);
}

function qunyou_zhijue_markTransform(player, name, card) {
	const suit = qunyou_zhijue_getSuit(card, player);
	if (!suit) {
		return;
	}
	const used = qunyou_zhijue_getUsed(player, name);
	if (!used.includes(suit)) {
		used.push(suit);
	}
}

function qunyou_zhijue_remainingSharedSuits(player) {
	const storage = qunyou_zhijue_storage(player);
	return qunyou_zhijue_suits.filter((suit) => !storage.wuxieUsedSuits.includes(suit) && !storage.huogongUsedSuits.includes(suit));
}

function qunyou_zhijue_bothUsedSuits(player) {
	const storage = qunyou_zhijue_storage(player);
	return qunyou_zhijue_suits.filter((suit) => storage.wuxieUsedSuits.includes(suit) && storage.huogongUsedSuits.includes(suit));
}

function qunyou_zhijue_suitText(list) {
	return list.length ? list.map((suit) => get.translation(suit)).join("、") : "无";
}

function qunyou_zhijue_availableNames(event, player) {
	if (!event?.filterCard) {
		return player.isPhaseUsing?.() ? ["huogong"] : [];
	}
	if (_status.currentPhase === player && event.type === "phase") {
		return event.filterCard({ name: "huogong", isCard: true }, player, event) ? ["huogong"] : [];
	}
	return ["wuxie", "huogong"].filter((name) => event.filterCard({ name, isCard: true }, player, event));
}

function qunyou_zhijue_hasTransformCard(player, names) {
	return names.some((name) => player.countCards("hes", (card) => qunyou_zhijue_canTransform(player, name, card)) > 0);
}

function qunyou_zhijue_canBusuan(event, player) {
	if (!qunyou_zhijue_remainingSharedSuits(player).length) {
		return false;
	}
	const names = qunyou_zhijue_availableNames(event, player);
	if (!names.length) {
		return false;
	}
	return qunyou_zhijue_hasTransformCard(player, names);
}

function qunyou_zhijue_fillSuit(player, suit) {
	if (!qunyou_zhijue_suits.includes(suit)) {
		return;
	}
	for (const name of ["wuxie", "huogong"]) {
		const used = qunyou_zhijue_getUsed(player, name);
		if (!used.includes(suit)) {
			used.push(suit);
		}
	}
}

async function qunyou_zhijue_busuan(player, event) {
	const remain = qunyou_zhijue_remainingSharedSuits(player);
	if (!remain.length) {
		return false;
	}
	await player.chooseToGuanxing(remain.length).set("prompt", `智绝：卜算${get.cnNumber(remain.length)}`).forResult();
	const controls = remain.map((suit) => get.translation(suit));
	const result = await player
		.chooseControl(controls)
		.set("prompt", "智绝：令其中一种花色视为均已转化过")
		.set("choice", controls[0])
		.forResult();
	const index = controls.indexOf(result?.control);
	qunyou_zhijue_fillSuit(player, remain[index >= 0 ? index : 0]);
	return true;
}

function qunyou_longjue_isFull(player) {
	return player.getMaxCharge() > 0 && player.countCharge(true) === 0;
}

function qunyou_longjue_remaining(player) {
	const used = player.getStat("skill")?.qunyou_longjue || 0;
	return Math.max(0, player.maxHp - 1 - used);
}

function qunyou_longjue_vcards(event, player) {
	const list = [];
	for (const name of lib.inpile) {
		if (get.type(name) !== "basic") {
			continue;
		}
		const card = get.autoViewAs({ name, isCard: true }, "unsure");
		if (event.filterCard(card, player, event)) {
			list.push(["基本", "", name]);
		}
		if (name === "sha") {
			for (const nature of lib.inpile_nature) {
				const natureCard = get.autoViewAs({ name, nature, isCard: true }, "unsure");
				if (event.filterCard(natureCard, player, event)) {
					list.push(["基本", "", name, nature]);
				}
			}
		}
	}
	return list;
}

function qunyou_dingyi_targets(player, yin) {
	return game.filterPlayer((target) => {
		if (!target.isIn() || player.getStorage("qunyou_dingyi_blocked").includes(target)) {
			return false;
		}
		if (!yin) {
			return true;
		}
		const cards = target.getCards("he", (card) => target.canRecast(card, player));
		if (target === player) {
			return cards.length >= 2;
		}
		return cards.length > 0 && player.getCards("he", (card) => player.canRecast(card, player)).length > 0;
	});
}

function qunyou_zhichao_lostEquips(event, player) {
	if (event.name === "loseAsyncAfter" && typeof event.getl === "function") {
		return event.getl(player)?.es || [];
	}
	if (event.name === "lose") {
		return event.es || [];
	}
	return [];
}

function qunyou_cangxiao_notBySkill(event) {
	return !event.getParent((evt) => evt.skill, true);
}

function qunyou_yanghui_phaseDiscardCards(event, player) {
	if (event.type !== "discard" || !event.getParent("phaseDiscard", true)) {
		return [];
	}
	const loss = event.getl?.(player);
	if (loss?.cards2?.length) {
		return loss.cards2;
	}
	if (event.player === player && event.cards2?.length) {
		return event.cards2;
	}
	return [];
}

function qunyou_yaliang_delayed(player, type) {
	return player.storage[`qunyou_yaliang_${type}`] || 0;
}

function qunyou_yaliang_updateMark(player) {
	if (qunyou_yaliang_delayed(player, "draw") || qunyou_yaliang_delayed(player, "discard")) {
		player.markSkill("qunyou_yaliang");
	} else {
		player.unmarkSkill("qunyou_yaliang");
	}
}

function qunyou_yaliang_addDelayed(player, type, num) {
	if (num <= 0) {
		return;
	}
	const key = `qunyou_yaliang_${type}`;
	player.storage[key] = (player.storage[key] || 0) + num;
	qunyou_yaliang_updateMark(player);
}

function qunyou_yaliang_clearDelayed(player, type) {
	delete player.storage[`qunyou_yaliang_${type}`];
	qunyou_yaliang_updateMark(player);
}

function qunyou_yaliang_damageCards(event) {
	const cards = [];
	qunyou_yongxu_flatPhysical(event.cards, cards);
	qunyou_yongxu_flatPhysical(event.card, cards);
	return cards.filter((card) => ["o", "d"].includes(get.position(card, true)));
}

/** 树泽：桃/五谷选择并执行 */
async function qunyou_shuze_effect(player) {
	const clanName = "陈郡谢氏";
	const mates = game.filterPlayer((p) => p.isIn() && p.hasClan(clanName));
	if (!mates.length) {
		return;
	}
	player.logSkill("qunyou_shuze");
	const choices = [];
	if (mates.some((target) => target.isDamaged())) {
		choices.push("【桃】（一名同族）");
	}
	const viewAs = get.autoViewAs({ name: "wugu", isCard: true });
	const wuguTargets = mates.filter((target) => player.canUse(viewAs, target, false));
	if (wuguTargets.length) {
		choices.push("【五谷丰登】（所有同族）");
	}
	if (!choices.length) {
		return;
	}
	const ctrl = await player
		.chooseControl(choices)
		.set("prompt", "树泽：视为使用其中一种牌")
		.set("ai", () => {
			const need = mates.some((t) => t.hp < t.maxHp);
			return need && choices.includes("【桃】（一名同族）") ? "【桃】（一名同族）" : choices[0];
		})
		.forResult();
	if (ctrl.control === "【桃】（一名同族）") {
		const r = await player
			.chooseTarget("树泽：请选择一名同族角色", true, (card, p, target) => {
				return mates.includes(target) && target.isDamaged();
			})
			.set("ai", (target) => get.recoverEffect(target, player, player))
			.forResult();
		if (!r?.bool || !r.targets?.length) {
			return;
		}
		await player.useCard({ name: "tao", isCard: true }, r.targets, false);
	} else if (ctrl.control === "【五谷丰登】（所有同族）") {
		await player.useCard(viewAs, wuguTargets, false);
	}
}

function qunyou_jidu_isCard(card) {
	return card?.name === "wanjian" && card.storage?.qunyou_jidu;
}

function qunyou_jidu_discardedShan(event) {
	const cards = [];
	if (event.name === "loseAsyncAfter" && typeof event.getl === "function") {
		for (const cur of game.filterPlayer()) {
			const lost = event.getl(cur)?.cards2;
			if (lost?.length) {
				cards.addArray(lost);
			}
		}
	} else if (event.cards2?.length) {
		cards.addArray(event.cards2);
	} else if (event.player && typeof event.getl === "function") {
		const lost = event.getl(event.player)?.cards2;
		if (lost?.length) {
			cards.addArray(lost);
		}
	}
	return cards.filter((card) => get.name(card) === "shan" && get.position(card, true) === "d");
}

function qunyou_bingzhu_cardOptions(event, player, count) {
	const list = [];
	if (typeof event.filterCard !== "function" || typeof event.filterTarget !== "function") {
		return list;
	}
	for (const name of ["sha", "tao"]) {
		const card = get.autoViewAs({ name, isCard: true }, "unsure");
		if (!event.filterCard(card, player, event)) {
			continue;
		}
		if (!game.hasPlayer((target) => target.countCards("h") === count && event.filterTarget(card, player, target))) {
			continue;
		}
		list.push(["基本", "", name]);
	}
	return list;
}

function qunyou_bingzhu_counts(event, player) {
	const linked = game.filterPlayer((target) => target.isLinked()).length;
	const list = [];
	for (let count = 2; count <= linked; count++) {
		if (qunyou_bingzhu_cardOptions(event, player, count).length) {
			list.push(count);
		}
	}
	return list;
}

function qunyou_beixuan_cancelEvent(event) {
	if (event.forced) {
		return false;
	}
	if (event.name === "chooseControl" && !event.controls?.includes("cancel2")) {
		return false;
	}
	if (event.name === "chooseControl") {
		event.result = { bool: true, control: "cancel2", index: event.controls.indexOf("cancel2") };
	} else {
		event.result = { bool: false };
	}
	if (event.name === "chooseToUse" || event.name === "chooseToRespond") {
		event.responded = true;
	}
	event.cancel();
	return true;
}

function qunyou_guiwu_isInstant(event) {
	if (!event?.card || !event.targets?.length) {
		return false;
	}
	const info = get.info(event.card, false);
	if (!info || info.notarget) {
		return false;
	}
	const type = get.type(event.card, null, false);
	return type !== "equip" && type !== "delay";
}

function qunyou_guiwu_targetKind(event) {
	if (!qunyou_guiwu_isInstant(event)) {
		return null;
	}
	return event.targets.length === 1 ? "single" : "multi";
}

function qunyou_guiwu_targets() {
	const counts = new Map();
	for (const target of game.filterPlayer()) {
		const num = target.countCards("h");
		counts.set(num, (counts.get(num) || 0) + 1);
	}
	return game.filterPlayer((target) => counts.get(target.countCards("h")) === 1);
}

const qunyou_suijian_names = ["tiesuo", "suijiyingbian", "jiu", "sha"];

function qunyou_suijian_vcard(name, storage) {
	return { name, isCard: true, storage: { qunyou_suijian: true, ...(storage || {}) } };
}

function qunyou_suijian_canUse(player, card) {
	if (!player?.isIn() || !card || !lib.filter.cardEnabled(card, player)) {
		return false;
	}
	const info = get.info(card, player);
	if (info?.notarget) {
		return true;
	}
	return player.hasUseTarget(card, true, false);
}

function qunyou_suijian_historyOptions(player) {
	const history = game.getGlobalHistory("everything", (evt) => {
		if (evt.player !== player || !evt.card) {
			return false;
		}
		const type = get.type(evt.card, player, false);
		if (evt.name === "useCard") {
			return ["basic", "trick"].includes(type);
		}
		return evt.name === "respond" && type === "basic";
	});
	let basic = null;
	let trick = null;
	for (const evt of history) {
		const type = get.type(evt.card, player, false);
		const name = get.name(evt.card, player);
		if (!name) {
			continue;
		}
		const card = qunyou_suijian_vcard(name, {
			qunyou_suijian_option: "suijiyingbian",
			qunyou_suijian_origin: evt.card.name,
		});
		const nature = get.nature(evt.card, player);
		if (nature) {
			card.nature = nature;
		}
		if (type === "basic") {
			basic = card;
		} else if (evt.name === "useCard" && type === "trick") {
			trick = card;
		}
	}
	const list = [];
	if (basic) {
		list.push({
			key: `suijiyingbian_basic_${get.name(basic)}_${get.nature(basic) || ""}`,
			usedKey: "suijiyingbian",
			card: basic,
			label: `【随机应变·基本】（${get.translation(basic)}）`,
		});
	}
	if (trick) {
		list.push({
			key: `suijiyingbian_trick_${get.name(trick)}_${get.nature(trick) || ""}`,
			usedKey: "suijiyingbian",
			card: trick,
			label: `【随机应变·锦囊】（${get.translation(trick)}）`,
		});
	}
	return list;
}

function qunyou_suijian_options(player, used) {
	if (!player?.isIn()) {
		return [];
	}
	const list = [];
	for (const name of qunyou_suijian_names) {
		if (used.includes(name)) {
			continue;
		}
		if (name === "suijiyingbian") {
			for (const option of qunyou_suijian_historyOptions(player)) {
				if (qunyou_suijian_canUse(player, option.card)) {
					list.push(option);
				}
			}
			continue;
		}
		const card = qunyou_suijian_vcard(name);
		if (qunyou_suijian_canUse(player, card)) {
			list.push({
				key: name,
				usedKey: name,
				card,
				label: `【${get.translation(card)}】`,
			});
		}
	}
	return list;
}

function qunyou_suijian_queueTargets(targets, player) {
	if (!targets?.length) {
		return [];
	}
	return targets
		.filter((target) => target?.isIn())
		.sortBySeat(_status.currentPhase || player);
}

function qunyou_suijian_prompt(player, options) {
	return `${get.translation(player)}：选择视为使用的牌（剩余：${options.map((option) => option.label).join("、")}）`;
}

function qunyou_cardNameLength(card, player) {
	const name = get.name(card, player) || card?.name || card;
	const text = String(get.translation(name) || "")
		.replace(/<[^>]+>/g, "")
		.replace(/[【】\s]/g, "");
	return text.length;
}

function qunyou_turnUseCount(player, event) {
	const phase = event?.getParent?.("phase", true) || _status.event?.getParent?.("phase", true);
	return game.getGlobalHistory("everything", (evt) => {
		return evt.name === "useCard" && evt.player === player && (!phase || evt.getParent("phase") === phase);
	}).length;
}

function qunyou_gudan_gainCard(name) {
	const card = game.createCard(name);
	card.storage ??= {};
	card.storage.qunyou_gudan_destroy = true;
	return card;
}

function qunyou_gudan_track(player, cards) {
	player.storage.qunyou_gudan_cards ??= [];
	for (const card of cards) {
		if (card && !player.storage.qunyou_gudan_cards.includes(card)) {
			player.storage.qunyou_gudan_cards.push(card);
		}
	}
}

function qunyou_gudan_discardCards(player) {
	const cards = player.getStorage("qunyou_gudan_cards") || [];
	return cards.filter((card) => {
		if (!card?.storage?.qunyou_gudan_destroy) {
			return false;
		}
		return get.position(card, true) === "d";
	});
}

function qunyou_gudan_cleanup(player, destroyed = []) {
	const cards = player.getStorage("qunyou_gudan_cards") || [];
	player.storage.qunyou_gudan_cards = cards.filter((card) => card && !destroyed.includes(card));
}

/** 摧升：按使用的实体牌类型返回视为使用的牌；否则 null（evt 须为触发的 useCard 事件） */
function qunyou_cuisheng_viewAs(evt, player) {
	const card = evt.card;
	if (!card || !evt.cards?.length || get.is.virtualCard(card)) {
		return null;
	}
	const t = get.type(card, player, false);
	if (t === "basic") {
		return get.autoViewAs({ name: "sha", nature: "fire", isCard: true });
	}
	if (t === "trick") {
		return get.autoViewAs({ name: "lulitongxin", isCard: true });
	}
	if (t === "equip") {
		return get.autoViewAs({ name: "tiesuo", isCard: true });
	}
	return null;
}

function qunyou_rongguo_targets(player) {
	return game.filterPlayer((target) => target !== player && target.isIn() && player.canCompare(target));
}

function qunyou_rongguo_compareCards(result) {
	return [result?.player, result?.target].filter((card) => card && ["o", "d"].includes(get.position(card, true)));
}

function qunyou_zhaduo_compareCards(result) {
	return [result?.player, result?.target].filter((card) => card && ["o", "d"].includes(get.position(card, true)));
}

function qunyou_zhaduo_nonWinners(result, source, target) {
	if (result?.tie) {
		return [source, target].filter((current) => current?.isIn());
	}
	return [result?.bool ? target : source].filter((current) => current?.isIn());
}

function qunyou_gushe_targets(player) {
	return game.filterPlayer((target) => target !== player && target.isIn() && player.canCompare(target));
}

function qunyou_gushe_getTopCard() {
	const card = ui.cardPile.firstChild;
	return get.itemtype(card) === "card" ? card : null;
}

function qunyou_gushe_getLastDiscardCard(player) {
	const phaseId = _status.currentPhase?.playerid;
	const stored = player.storage.qunyou_gushe_lastDiscard;
	if (phaseId && stored?.phaseId === phaseId && stored.card && get.position(stored.card, true) === "d") {
		return stored.card;
	}
	const phaseEvent = _status.event?.getParent?.("phase");
	if (!phaseEvent) {
		return null;
	}
	const cards = [];
	const history = game.getGlobalHistory("cardMove", (evt) => {
		if (evt.name !== "cardsDiscard" && (evt.name !== "lose" || evt.position !== ui.discardPile)) {
			return false;
		}
		return evt.getParent("phase") === phaseEvent;
	});
	for (const evt of history) {
		const moved = Array.isArray(evt.cards2) ? evt.cards2 : evt.cards;
		if (!Array.isArray(moved)) {
			continue;
		}
		cards.addArray(moved.filter((card) => card && get.position(card, true) === "d"));
	}
	return cards[cards.length - 1] || null;
}

function qunyou_xiongbo_debaters(player) {
	return game.filterPlayer((current) => current !== player && current.isIn() && current.getSeatNum() !== 1 && current.countCards("h"));
}

function qunyou_xiongbo_majorityTargets(result, player) {
	if (!result?.opinion || !Array.isArray(result[result.opinion])) {
		return [];
	}
	return result[result.opinion]
		.map((pair) => pair[0])
		.filter((current) => current && current !== player && current.isIn() && player.canCompare(current));
}

function qunyou_jinfa_getEventStorage(event, player, create = false) {
	if (!event || !player) {
		return null;
	}
	if (!event.qunyou_jinfa && create) {
		event.qunyou_jinfa = {};
	}
	if (!event.qunyou_jinfa) {
		return null;
	}
	if (!event.qunyou_jinfa[player.playerid] && create) {
		event.qunyou_jinfa[player.playerid] = {
			cards: [],
			number: 0,
			modify: false,
		};
	}
	return event.qunyou_jinfa[player.playerid] || null;
}

function qunyou_jinfa_getCompareEvent(event) {
	if (!event) {
		return null;
	}
	if (event.name === "chooseToCompare") {
		return event;
	}
	return event.getParent?.("chooseToCompare", true) || null;
}

function qunyou_jinfa_sameSuitAndType(cards, player) {
	if (!cards?.length) {
		return false;
	}
	const suit = get.suit(cards[0], player);
	const type = get.type(cards[0], player);
	return cards.every((card) => get.suit(card, player) === suit && get.type(card, player) === type);
}

function qunyou_jinfa_sum(cards, player) {
	return cards.reduce((sum, card) => sum + get.number(card, player), 0);
}

function qunyou_xiongbo_compareCards(result) {
	if (!result) {
		return [];
	}
	const list = [];
	if (result.player && ["o", "d"].includes(get.position(result.player, true))) {
		list.push(result.player);
	}
	for (const card of result.targets || []) {
		if (card && ["o", "d"].includes(get.position(card, true)) && !list.includes(card)) {
			list.push(card);
		}
	}
	return list;
}

function qunyou_xiongbo_selfCards(compareEvent, player) {
	const list = [];
	const compareCard = compareEvent?.result?.player;
	if (compareCard && ["o", "d"].includes(get.position(compareCard, true))) {
		list.push(compareCard);
	}
	const storage = qunyou_jinfa_getEventStorage(compareEvent, player);
	for (const card of storage?.cards || []) {
		if (card && ["o", "d"].includes(get.position(card, true)) && !list.includes(card)) {
			list.push(card);
		}
	}
	return list;
}

function qunyou_gushe_getDiscardFromEvent(trigger) {
	const cards = [];
	const addCard = (card) => {
		if (card && get.position(card, true) === "d" && !cards.includes(card)) {
			cards.push(card);
		}
	};
	for (const key of ["cards2", "cards"]) {
		if (!Array.isArray(trigger[key])) {
			continue;
		}
		for (const card of trigger[key]) {
			addCard(card);
		}
	}
	if (typeof trigger.getl === "function") {
		for (const current of game.filterPlayer()) {
			const lost = trigger.getl(current);
			for (const key of ["cards2", "cards"]) {
				if (!Array.isArray(lost?.[key])) {
					continue;
				}
				for (const card of lost[key]) {
					addCard(card);
				}
			}
		}
	}
	return cards[cards.length - 1] || null;
}

function qunyou_gushe_cards(compare, player, extra = {}) {
	const cards = [];
	if (compare?.player && ["o", "d"].includes(get.position(compare.player, true))) {
		cards.push({ key: "player", label: "你的拼点牌", card: compare.player, owner: player });
	}
	if (compare?.target && ["o", "d"].includes(get.position(compare.target, true))) {
		cards.push({ key: "target", label: "其拼点牌", card: compare.target, owner: compare.target?.owner || null });
	}
	const topCard = extra.topCard || qunyou_gushe_getTopCard();
	if (topCard && ["c", "d", "o"].includes(get.position(topCard, true))) {
		cards.push({ key: "top", label: "牌堆顶的牌", card: topCard, owner: null });
	}
	const discardCard = extra.discardCard || qunyou_gushe_getLastDiscardCard(player);
	if (discardCard && discardCard !== topCard && ["d", "o"].includes(get.position(discardCard, true))) {
		cards.push({ key: "discard", label: "本回合最后进入弃牌堆的牌", card: discardCard, owner: get.owner(discardCard) || null });
	}
	return cards;
}

async function qunyou_gushe_showCards(player, cards) {
	if (!cards.length) {
		return;
	}
	try {
		const dialog = ui.create.dialog("鼓舌：本次参与牌", "hidden");
		for (const entry of cards) {
			dialog.addText(entry.label);
			dialog.addSmall([entry.card]);
		}
		await player.chooseControl("确定").set("prompt", "查看本次参与排名的牌").set("dialog", dialog).forResult();
		dialog.close();
	} catch (e) {
		await player
			.chooseControl("确定")
			.set("prompt", `鼓舌：${cards.map((entry) => entry.label).join("、")}`)
			.forResult();
	}
}

function qunyou_gushe_rank(cards, playerCard) {
	const number = get.number(playerCard, false);
	return 1 + cards.filter((entry) => get.number(entry.card, false) > number).length;
}

function qunyou_gushe_canUse(player, card) {
	if (!player?.isIn() || !card || !lib.filter.cardEnabled(card, player)) {
		return false;
	}
	const info = get.info(card, player);
	if (info?.notarget) {
		return true;
	}
	return player.hasUseTarget(card, true, false);
}

function qunyou_tongxian_type(card, player) {
	return get.type2(card, player);
}

function qunyou_tongxian_canUse(player, card, type) {
	if (!player?.isIn() || !card || qunyou_tongxian_type(card, player) !== type || !lib.filter.cardEnabled(card, player)) {
		return false;
	}
	const info = get.info(card, player);
	if (info?.notarget) {
		return true;
	}
	return player.hasUseTarget(card, true, false);
}

async function qunyou_gushe_useRemaining(player, cards) {
	const usable = cards.filter((entry) => qunyou_gushe_canUse(player, entry.card));
	if (!usable.length) {
		return;
	}
	const result = await player
		.chooseCardButton("鼓舌：使用剩余一张拼点牌", usable.map((entry) => entry.card), true)
		.set("ai", (button) => get.player().getUseValue(button.link, true, false))
		.forResult();
	if (!result?.bool || !result.links?.length) {
		return;
	}
	const card = result.links[0];
		player.$gain2(card, false);
	await player.chooseUseTarget(card, true, false);
}

async function qunyou_gushe_assignCards(player, target, cards) {
	for (const entry of cards) {
		const result = await player
			.chooseControl("交给自己", "交给拼点目标", "置于牌堆顶", "置入弃牌堆")
			.set("prompt", `鼓舌：分配${entry.label}`)
			.set("ai", () => {
				const player = get.player();
				if (get.value(entry.card, player) >= 0) {
					return get.attitude(player, target) > 0 ? "交给拼点目标" : "交给自己";
				}
				return "置入弃牌堆";
			})
			.forResult();
		const control = result?.control;
		if (control === "交给自己") {
			await player.gain(entry.card, "gain2");
			continue;
		}
		if (control === "交给拼点目标") {
			await target.gain(entry.card, "gain2");
			continue;
		}
		if (control === "置于牌堆顶") {
			if (ui.cardPile.firstChild !== entry.card) {
				entry.card.fix();
				ui.cardPile.insertBefore(entry.card, ui.cardPile.firstChild);
			}
			game.log(entry.card, "被置于了牌堆顶");
			continue;
		}
		entry.card.fix();
		ui.discardPile.appendChild(entry.card);
		game.log(entry.card, "被置入了弃牌堆");
	}
	await game.delayx();
}

function qunyou_danpo_responseMap(card, player) {
	const list = [];
	const name = get.name(card, player);
	const type = get.type(card, player, false);
	if (["sha", "wanjian"].includes(name)) {
		list.push("shan");
	}
	if (["juedou", "nanman"].includes(name)) {
		list.push("sha");
	}
	if (["trick", "delay"].includes(type)) {
		list.push("wuxie");
	}
	return list.unique();
}

function qunyou_danpo_useMap(card, player) {
	const list = [];
	const name = get.name(card, player);
	if (name === "shan") {
		list.push("sha", "wanjian");
	}
	if (name === "sha") {
		list.push("juedou", "nanman");
	}
	if (name === "wuxie") {
		list.push("trick");
	}
	return list.unique();
}

function qunyou_danpo_isPhaseUsing(player) {
	return game.online ? _status.currentPhase === player : player.isPhaseUsing();
}

function qunyou_danpo_matches(card, name, _nature, mode, player) {
	const list = mode === "use" ? qunyou_danpo_useMap(card, player) : qunyou_danpo_responseMap(card, player);
	if (name === "sha") {
		return list.includes("sha");
	}
	if ((get.type(name) === "trick" || get.type(name) === "delay") && list.includes("trick")) {
		return true;
	}
	return list.includes(name);
}

function qunyou_danpo_list(event, player, mode) {
	if (typeof event?.filterCard !== "function") {
		return [];
	}
	const used = mode === "use" ? player.getStorage("qunyou_danpo_phase_used") : [];
	const map = new Map();
	for (const source of player.getCards("hes")) {
		const names = mode === "use" ? qunyou_danpo_useMap(source, player) : qunyou_danpo_responseMap(source, player);
		if (!names.length) {
			continue;
		}
		for (const targetName of names) {
			if (targetName === "sha") {
				const card = { name: "sha", isCard: true };
				if (event.filterCard(card, player, event) && !used.includes("sha")) {
					map.set("sha", ["基本", "", "sha"]);
				}
				for (const nature of lib.inpile_nature) {
					const natureCard = { name: "sha", nature, isCard: true };
					if (event.filterCard(natureCard, player, event) && !used.includes("sha")) {
						map.set(`sha_${nature}`, ["基本", "", "sha", nature]);
					}
				}
				continue;
			}
			if (targetName === "trick") {
				for (const info of get.inpileVCardList((item) => {
					if (!["trick", "delay"].includes(item[0])) {
						return false;
					}
					if (used.includes(item[2])) {
						return false;
					}
					return event.filterCard(get.autoViewAs({ name: item[2], nature: item[3], isCard: true }, "unsure"), player, event);
				})) {
					map.set(`trick_${info[2]}_${info[3] || ""}`, info);
				}
				continue;
			}
			if (used.includes(targetName)) {
				continue;
			}
			const card = { name: targetName, isCard: true };
			if (event.filterCard(card, player, event)) {
				map.set(targetName, [get.type(targetName), "", targetName]);
			}
		}
	}
	return [...map.values()];
}

function qunyou_zhaduo_targets(player) {
	return game.filterPlayer((target) => target.isIn() && target.countCards("h") > 0);
}

function qunyou_jicheng_targets(player) {
	return game.filterPlayer((target) => target !== player && target.isIn() && player.canCompare(target));
}

function qunyou_jicheng_redCompareCount(result, player) {
	return [result?.player, result?.target].filter((card) => card && get.color(card, player) === "red").length;
}

function qunyou_jicheng_addLimitLoss(player, num) {
	if (num <= 0) {
		return;
	}
	player.storage.qunyou_jicheng_effect = (player.storage.qunyou_jicheng_effect || 0) + num;
	player.addTempSkill("qunyou_jicheng_effect", "phaseAfter");
	player.markSkill("qunyou_jicheng_effect");
}

function qunyou_jicheng_canUseDuel(player) {
	return player.countCards("h") > 0 && game.hasPlayer((target) => target !== player && player.canUse({ name: "juedou" }, target, false));
}

function qunyou_jicheng_options(player) {
	const count = player.countCards("h");
	const limit = player.getHandcardLimit();
	const options = [];
	if (count + 2 === limit) {
		options.push("摸两张牌");
	}
	if (count - 1 === limit && qunyou_jicheng_canUseDuel(player)) {
		options.push("将一张牌当【决斗】使用");
	}
	if (count !== limit) {
		options.push("将手牌数调整至手牌上限，结束回合");
	}
	return options;
}

async function qunyou_jicheng_adjustHand(player) {
	const diff = player.countCards("h") - player.getHandcardLimit();
	if (diff > 0) {
		await player.chooseToDiscard("h", diff, true);
	} else if (diff < 0) {
		await player.draw(-diff);
	}
}

function qunyou_jicheng_finishTurn(event, player) {
	const phaseUse = event.getParent("phaseUse", true);
	if (phaseUse) {
		phaseUse.skipped = true;
	}
	const phase = event.getParent("phase", true);
	if (!phase) {
		return;
	}
	game.log(player, "结束了回合");
	if (phase.phaseList) {
		phase.num = phase.phaseList.length;
		phase.goto(11);
	} else {
		phase.finish();
	}
}

function qunyou_lingzhen_limit(player, skill) {
	return Math.max(1, player.countSkill(skill));
}

function qunyou_dusheng_getUnusedSuits(player) {
	const used = player.storage.qunyou_dusheng_used || [];
	return lib.suit.filter((suit) => !used.includes(suit));
}

async function qunyou_dusheng_tryBinglin(actor, suit) {
	if (!actor?.isIn()) {
		return;
	}
	const list = actor.getCards("hes", (card) => get.suit(card, actor) === suit);
	if (!list.length) {
		return;
	}
	let card = list[0];
	if (list.length > 1) {
		const result = await actor
			.chooseCard(`独胜：选择一张${get.translation(suit)}牌当【兵临城下】使用`, true, "hes", (c) => get.suit(c, actor) === suit)
			.set("ai", (c) => 6 - get.value(c))
			.forResult();
		if (!result?.bool || !result.cards?.length) {
			return;
		}
		card = result.cards[0];
	}
	const viewAs = get.autoViewAs({ name: "binglinchengxiax", isCard: true }, [card]);
	if (!game.hasPlayer((current) => actor.canUse(viewAs, current, false))) {
		return;
	}
	await actor.chooseUseTarget(viewAs, [card], true, false).set("logSkill", "qunyou_dusheng");
}

function qunyou_fenzi_maxHandPlayers() {
	let max = 0;
	game.filterPlayer((target) => {
		if (target.isIn()) {
			max = Math.max(max, target.countCards("h"));
		}
	});
	return game.filterPlayer((target) => target.isIn() && target.countCards("h") === max);
}

async function qunyou_lingzhen_useLoop(player, skill, limit) {
	let used = 0;
	while (used < limit && player.isIn()) {
		const result = await player
			.chooseToUse(`${get.translation(skill)}：请使用第${get.cnNumber(used + 1)}张牌（至多${get.cnNumber(limit)}张，点取消结束）`)
			.set("ai1", (card) => {
				return get.player().getUseValue(card);
			})
			.forResult();
		if (!result?.bool) {
			break;
		}
		used++;
	}
	return used;
}

function qunyou_shenshi_getTurnDiscardCards(phase) {
	if (!phase) {
		return [];
	}
	const cards = [];
	const addCard = (card) => {
		if (card && get.position(card, true) == "d" && !cards.includes(card)) {
			cards.push(card);
		}
	};
	for (const target of game.filterPlayer()) {
		target.getHistory("lose", (evt) => {
			if (evt.getParent("phase") != phase) {
				return false;
			}
			if (evt.position != ui.discardPile) {
				return false;
			}
			(evt.cards2 || evt.cards || []).forEach(addCard);
			return false;
		});
	}
	game.getGlobalHistory("cardMove", (evt) => {
		if (evt.name != "cardsDiscard") {
			return false;
		}
		if (evt.getParent("phase") != phase) {
			return false;
		}
		(evt.cards || []).forEach(addCard);
		return false;
	});
	return cards;
}

function qunyou_shenshi_areaTargets(card, player, source) {
	if (!card || !source?.isIn()) {
		return [];
	}
	const targets = [];
	for (const target of game.filterPlayer()) {
		if (target.countGainableCards(player, "hej")) {
			targets.push(target);
		}
	}
	return targets;
}

function qunyou_shenshi_canAddTarget(trigger, source, target) {
	if (!trigger?.card || !source?.isIn() || !target?.isIn()) {
		return false;
	}
	const info = get.info(trigger.card) || {};
	if (info.allowMultiple === false) {
		return false;
	}
	if (info.multitarget) {
		return false;
	}
	const targets = trigger.targets || [];
	if (targets.includes(target)) {
		return false;
	}
	return lib.filter.targetEnabled2(trigger.card, source, target) && lib.filter.targetInRange(trigger.card, source, target);
}

function qunyou_shenshi_canRemoveTarget(trigger, target) {
	if (!trigger?.targets || !target?.isIn()) {
		return false;
	}
	return trigger.targets.includes(target) && trigger.targets.length > 1;
}

function qunyou_jianjiang_isMinHand(target) {
	if (!target?.isIn()) {
		return false;
	}
	const num = target.countCards("h");
	return !game.hasPlayer((current) => current.isIn() && current.countCards("h") < num);
}

function qunyou_jianjiang_getShownCards(target) {
	if (!target?.isIn()) {
		return [];
	}
	return target.getCards("h", (card) => get.is.shownCard(card));
}

function qunyou_jianjiang_hasTaggedCard(player, tag) {
	return player.hasCard((card) => card.hasGaintag(tag), "h");
}

function qunyou_jianjiang_syncHolder(target) {
	if (!target?.isIn()) {
		return;
	}
	const hasTagged = qunyou_jianjiang_hasTaggedCard(target, "qunyou_jianjiang_tag");
	if (hasTagged) {
		target.addSkill("qunyou_jianjiang_effect");
	} else if (target.hasSkill("qunyou_jianjiang_effect")) {
		target.removeSkill("qunyou_jianjiang_effect");
	}
}

export const skills = {
	qunyou_shenshi: {
		audio: 2,
		trigger: { target: "useCardToTargeted" },
		direct: true,
		filter(event, player) {
			if (player.countCards("he") < 3) {
				return false;
			}
			if (!(get.type2(event.card, false) == "basic" || qunyou_chouci_isNormalTrick(event.card))) {
				return false;
			}
			const phase = event.getParent("phase");
			return qunyou_shenshi_areaTargets(event.card, player, event.player).length > 0 || qunyou_shenshi_getTurnDiscardCards(phase).length > 0;
		},
		async content(event, trigger, player) {
			const phase = trigger.getParent("phase");
			const discardCards = qunyou_shenshi_getTurnDiscardCards(phase);
			const areaTargets = qunyou_shenshi_areaTargets(trigger.card, player, trigger.player);
			if (!discardCards.length && !areaTargets.length) {
				return;
			}
			const boolResult = await player
				.chooseBool(get.prompt("qunyou_shenshi"), "你可以用三张牌交换一名角色区域或本回合弃牌堆的一张牌")
				.set("choice", true)
				.forResult();
			if (!boolResult?.bool) {
				return;
			}
			const cardResult = await player
				.chooseCard("he", 3, true, "审时：选择三张用于交换的牌")
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (!cardResult?.bool || cardResult.cards?.length != 3) {
				return;
			}
			const costCards = cardResult.cards.slice();
			let mode = null;
			if (areaTargets.length && discardCards.length) {
				const control = await player
					.chooseControl(["交换角色区域里的牌", "交换本回合弃牌堆的牌"])
					.set("prompt", "审时：选择交换来源")
					.set("choice", "交换角色区域里的牌")
					.forResult();
				mode = control.control == "交换本回合弃牌堆的牌" ? "discard" : "area";
			} else {
				mode = areaTargets.length ? "area" : "discard";
			}
			let exchangeTarget = null;
			let gainedCard = null;
			if (mode == "area") {
				const targetResult = await player
					.chooseTarget("审时：选择一名角色，交换其区域里的一张牌", true, (card, player, target) => {
						return qunyou_shenshi_areaTargets(trigger.card, player, trigger.player).includes(target);
					})
					.set("ai", (target) => -get.attitude(get.player(), target) + target.countCards("j") + target.countCards("e") * 0.5)
					.forResult();
				if (!targetResult?.bool || !targetResult.targets?.length) {
					return;
				}
				exchangeTarget = targetResult.targets[0];
				const zoneResult = await player.choosePlayerCard(exchangeTarget, "hej", true).set("visible", true).forResult();
				gainedCard = zoneResult?.cards?.[0] || zoneResult?.links?.[0];
				if (!gainedCard) {
					return;
				}
				await player.gain(gainedCard, exchangeTarget, "giveAuto", "bySelf");
				if (exchangeTarget.isIn()) {
					await exchangeTarget.gain(costCards, player, "giveAuto");
				} else {
					await player.loseToDiscardpile(costCards);
				}
				const fewer = player.countCards("h") < exchangeTarget.countCards("h") ? player : player.countCards("h") > exchangeTarget.countCards("h") ? exchangeTarget : null;
				const canAdjust = qunyou_shenshi_canAddTarget(trigger.getParent(), trigger.player, exchangeTarget) || qunyou_shenshi_canRemoveTarget(trigger.getParent(), exchangeTarget);
				let choice = null;
				if (fewer && canAdjust) {
					const control = await player
						.chooseControl(["令手牌较少者摸一张牌并明置", "添加或减少其为此牌目标"])
						.set("prompt", "审时：请选择后续效果")
						.set("choice", "添加或减少其为此牌目标")
						.forResult();
					choice = control.control;
				} else if (fewer) {
					choice = "令手牌较少者摸一张牌并明置";
				} else if (canAdjust) {
					choice = "添加或减少其为此牌目标";
				}
				if (choice == "令手牌较少者摸一张牌并明置" && fewer?.isIn()) {
					const draw = fewer.draw();
					await draw;
					const drawn = draw.result?.cards || [];
					if (drawn.length) {
						await fewer.showCards(drawn, `${get.translation(fewer)}因【审时】明置了`);
					} else {
						await fewer.showHandcards();
					}
				} else if (choice == "添加或减少其为此牌目标") {
					const parent = trigger.getParent();
					const canAdd = qunyou_shenshi_canAddTarget(parent, trigger.player, exchangeTarget);
					const canRemove = qunyou_shenshi_canRemoveTarget(parent, exchangeTarget);
					if (canAdd && canRemove) {
						const control = await player
							.chooseControl(["增加其为目标", "减少其为目标"])
							.set("prompt", `审时：调整${get.translation(exchangeTarget)}为${get.translation(trigger.card)}的目标状态`)
							.set("choice", trigger.targets?.includes(exchangeTarget) ? "减少其为目标" : "增加其为目标")
							.forResult();
						if (control.control == "增加其为目标") {
							parent.targets.add(exchangeTarget);
							game.log(exchangeTarget, "成为了", trigger.card, "的额外目标");
						} else {
							parent.targets.remove(exchangeTarget);
							parent.triggeredTargets1?.remove?.(exchangeTarget);
							parent.triggeredTargets2?.remove?.(exchangeTarget);
							parent.triggeredTargets3?.remove?.(exchangeTarget);
							parent.triggeredTargets4?.remove?.(exchangeTarget);
							if (trigger.targets?.includes(exchangeTarget)) {
								trigger.targets.remove(exchangeTarget);
								if (exchangeTarget == player) {
									trigger.untrigger();
								}
							}
							game.log(exchangeTarget, "从", trigger.card, "的目标中移除");
						}
					} else if (canAdd) {
						parent.targets.add(exchangeTarget);
						game.log(exchangeTarget, "成为了", trigger.card, "的额外目标");
					} else if (canRemove) {
						parent.targets.remove(exchangeTarget);
						parent.triggeredTargets1?.remove?.(exchangeTarget);
						parent.triggeredTargets2?.remove?.(exchangeTarget);
						parent.triggeredTargets3?.remove?.(exchangeTarget);
						parent.triggeredTargets4?.remove?.(exchangeTarget);
						if (trigger.targets?.includes(exchangeTarget)) {
							trigger.targets.remove(exchangeTarget);
							if (exchangeTarget == player) {
								trigger.untrigger();
							}
						}
						game.log(exchangeTarget, "从", trigger.card, "的目标中移除");
					}
				}
			} else {
				const discardResult = await player
					.chooseButton(["审时：选择本回合弃牌堆中的一张牌", discardCards], true)
					.set("ai", (button) => get.value(button.link, get.player(), "raw"))
					.forResult();
				gainedCard = discardResult?.links?.[0];
				if (!gainedCard) {
					return;
				}
				await player.gain(gainedCard, "gain2");
				await player.loseToDiscardpile(costCards);
			}
		},
		ai: {
			effect: {
				target(card, player, target) {
					if (target.countCards("he") < 3) {
						return;
					}
					if (get.type2(card, false) == "basic" || qunyou_chouci_isNormalTrick(card)) {
						return 0.8;
					}
				},
			},
		},
	},
	qunyou_jianjiang: {
		audio: 2,
		trigger: { global: "phaseJieshuBegin" },
		direct: true,
		filter(event, player) {
			if (!event.player?.isIn() || !event.player.countCards("h")) {
				return false;
			}
			if (!qunyou_jianjiang_isMinHand(event.player)) {
				return false;
			}
			if (!qunyou_jianjiang_getShownCards(event.player).length) {
				return false;
			}
			const phase = event.getParent();
			return player.hasHistory("gain", (evt) => evt.getParent("phase") == phase && evt.cards?.length);
		},
		async content(event, trigger, player) {
			const current = trigger.player;
			const shownCards = qunyou_jianjiang_getShownCards(current);
			const boolResult = await player
				.chooseBool(get.prompt("qunyou_jianjiang"), `分配${get.translation(current)}的一张明置手牌`)
				.set("choice", true)
				.forResult();
			if (!boolResult?.bool || !current.isIn() || !shownCards.length) {
				return;
			}
			const cardResult = await player
				.chooseButton([`荐降：选择${get.translation(current)}的一张明置手牌`, shownCards], true)
				.set("ai", (button) => get.value(button.link, get.player(), "raw"))
				.forResult();
			const card = cardResult?.links?.[0];
			if (!card || !current.getCards("h").includes(card) || !get.is.shownCard(card)) {
				return;
			}
			const targetResult = await player
				.chooseTarget("荐降：选择获得此牌的角色", true)
				.set("ai", (target) => {
					const player = get.player();
					const source = _status.event.getTrigger().player;
					let att = get.attitude(player, target);
					if (target == source) {
						att += 1;
					}
					return att;
				})
				.forResult();
			if (!targetResult?.bool || !targetResult.targets?.length) {
				return;
			}
			const target = targetResult.targets[0];
			current.addGaintag([card], "qunyou_jianjiang_tag");
			await target.gain(card, current, "giveAuto", "bySelf");
			qunyou_jianjiang_syncHolder(current);
			qunyou_jianjiang_syncHolder(target);
		},
		group: ["qunyou_jianjiang_clear", "qunyou_jianjiang_transfer"],
		subSkill: {
			effect: {
				charlotte: true,
				onremove(player) {
					delete player.storage.qunyou_jianjiang_effect;
				},
				mark: true,
				intro: {
					content() {
						return "你持有因【荐降】被分配的牌；你使用牌不能指定手牌数全场最少的角色为目标";
					},
				},
				mod: {
					playerEnabled(card, player, target) {
						if (!qunyou_jianjiang_hasTaggedCard(player, "qunyou_jianjiang_tag")) {
							return;
						}
						if (qunyou_jianjiang_isMinHand(target)) {
							return false;
						}
					},
				},
				sub: true,
			},
			clear: {
				charlotte: true,
				trigger: {
					player: ["loseAfter", "equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
					global: ["loseAfter", "equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter", "cardsDiscardAfter"],
				},
				forced: true,
				popup: false,
				filter(event, player) {
					return player.hasSkill("qunyou_jianjiang_effect") && !qunyou_jianjiang_hasTaggedCard(player, "qunyou_jianjiang_tag");
				},
				content(event, trigger, player) {
					player.removeSkill("qunyou_jianjiang_effect");
				},
				sub: true,
				sourceSkill: "qunyou_jianjiang",
			},
			transfer: {
				charlotte: true,
				trigger: {
					player: ["loseAfter", "equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
					global: ["loseAfter", "equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter", "cardsDiscardAfter"],
				},
				forced: true,
				popup: false,
				filter(event, player) {
					return game.hasPlayer((current) => current.isIn() && (current.hasSkill("qunyou_jianjiang_effect") || qunyou_jianjiang_hasTaggedCard(current, "qunyou_jianjiang_tag")));
				},
				content() {
					for (const current of game.filterPlayer()) {
						qunyou_jianjiang_syncHolder(current);
					}
				},
				sub: true,
				sourceSkill: "qunyou_jianjiang",
			},
		},
	},
	qunyou_handcard_delta: {
		charlotte: true,
		onremove(player) {
			delete player.storage.qunyou_handcard_delta;
		},
		/** 偏移量下限为 -当前体力，超出则写回 storage */
		clampOffset(player) {
			let offset = player.storage.qunyou_handcard_delta;
			if (typeof offset !== "number") {
				return false;
			}
			const base = Math.max(player.hp, 0);
			const minOffset = -base;
			if (offset >= minOffset) {
				return false;
			}
			if (minOffset === 0) {
				delete player.storage.qunyou_handcard_delta;
				if (player.hasSkill("qunyou_handcard_delta")) {
					player.removeSkill("qunyou_handcard_delta");
				}
			} else {
				player.storage.qunyou_handcard_delta = minOffset;
			}
			if (player.hasSkill("qunyou_cairuo")) {
				player.markSkill("qunyou_cairuo");
			}
			return true;
		},
		mod: {
			maxHandcard(player, num) {
				const skill = lib.skill.qunyou_handcard_delta;
				if (player.storage.qunyou_handcard_delta) {
					skill.clampOffset(player);
				}
				const offset = player.storage.qunyou_handcard_delta || 0;
				const minOffset = -num;
				return num + Math.max(minOffset, offset);
			},
		},
		getBaseLimit(player) {
			const offset = player.storage.qunyou_handcard_delta || 0;
			if (!offset) {
				return Math.max(player.hp, 0);
			}
			const saved = offset;
			delete player.storage.qunyou_handcard_delta;
			const had = player.hasSkill("qunyou_handcard_delta");
			if (had) {
				player.removeSkill("qunyou_handcard_delta");
			}
			const base = player.getHandcardLimit();
			player.storage.qunyou_handcard_delta = saved;
			if (had) {
				player.addSkill("qunyou_handcard_delta");
			}
			return base;
		},
		/** 给定体力与偏移，计算手牌上限（不读当前 getHandcardLimit） */
		getLimitAt(hp, offset) {
			const base = Math.max(hp, 0);
			const off = typeof offset === "number" ? offset : 0;
			const minOffset = -base;
			return Math.max(0, base + Math.max(minOffset, off));
		},
		getLimitBeforeHpChange(player, hpDelta) {
			const oldHp = player.hp - hpDelta;
			return lib.skill.qunyou_handcard_delta.getLimitAt(
				oldHp,
				player.storage.qunyou_handcard_delta,
			);
		},
		/** 按 体力+偏移 公式计算当前手牌上限（与 mod 一致） */
		computeLimit(player) {
			const skill = lib.skill.qunyou_handcard_delta;
			skill.clampOffset(player);
			return skill.getLimitAt(player.hp, player.storage.qunyou_handcard_delta);
		},
		/**
		 * 挂在才若 maxHandcardFinal：每次引擎结算完手牌上限后对比缓存，有变化则排队通知扶风/浑随
		 */
		trackLimitFinal(player, num) {
			const skill = lib.skill.qunyou_handcard_delta;
			const newLimit = Math.max(0, num);
			const oldLimit = player.storage.qunyou_handcard_last;
			if (typeof oldLimit !== "number") {
				player.storage.qunyou_handcard_last = newLimit;
				return newLimit;
			}
			if (oldLimit === newLimit) {
				return newLimit;
			}
			player.storage.qunyou_handcard_last = newLimit;
			skill.enqueueLimitChange(player, oldLimit, newLimit);
			return newLimit;
		},
		enqueueLimitChange(player, oldLimit, newLimit) {
			if (oldLimit === newLimit) {
				return;
			}
			const id = player.playerid;
			_status.qunyou_handcard_limit_queue ??= {};
			const q = _status.qunyou_handcard_limit_queue[id];
			if (q) {
				q.newLimit = newLimit;
			} else {
				_status.qunyou_handcard_limit_queue[id] = { player, oldLimit, newLimit };
			}
			if (_status.qunyou_handcard_limit_flush) {
				return;
			}
			_status.qunyou_handcard_limit_flush = true;
			const parent = get.event();
			game
				.createEvent("qunyou_handcardLimitFlush", false, parent)
				.setContent(async () => {
					_status.qunyou_handcard_limit_flush = false;
					const queue = _status.qunyou_handcard_limit_queue || {};
					_status.qunyou_handcard_limit_queue = {};
					for (const key of Object.keys(queue)) {
						const item = queue[key];
						if (!item?.player?.isIn()) {
							continue;
						}
						await lib.skill.qunyou_handcard_delta.flushLimitChange(
							item.player,
							item.oldLimit,
							item.newLimit,
						);
					}
				});
		},
		async flushLimitChange(player, oldLimit, newLimit) {
			if (player.hasSkill("qunyou_cairuo")) {
				player.markSkill("qunyou_cairuo");
			}
			await lib.skill.qunyou_handcard_delta.notifyLimitChange(player, oldLimit, newLimit);
		},
		async notifyLimitChange(player, oldLimit, newLimit) {
			if (player.hasSkill("qunyou_fufeng")) {
				await lib.skill.qunyou_fufeng.onLimitChange(player, oldLimit, newLimit);
			}
			if (player.hasSkill("qunyou_hunsui") && newLimit === 0) {
				await lib.skill.qunyou_hunsui.missionSuccess(player);
			}
		},
		async applyDelta(player, delta, log) {
			const skill = lib.skill.qunyou_handcard_delta;
			skill.clampOffset(player);
			const oldLimit = skill.computeLimit(player);
			const baseLimit = skill.getBaseLimit(player);
			const minOffset = -baseLimit;
			let oldOffset = player.storage.qunyou_handcard_delta || 0;
			oldOffset = Math.max(minOffset, oldOffset);
			let newOffset = oldOffset + delta;
			if (delta < 0) {
				newOffset = Math.max(minOffset, newOffset);
			}
			const newLimit = Math.max(0, baseLimit + newOffset);
			if (newOffset === 0) {
				delete player.storage.qunyou_handcard_delta;
				if (player.hasSkill("qunyou_handcard_delta")) {
					player.removeSkill("qunyou_handcard_delta");
				}
			} else {
				player.storage.qunyou_handcard_delta = newOffset;
				if (!player.hasSkill("qunyou_handcard_delta")) {
					player.addSkill("qunyou_handcard_delta");
				}
			}
			if (log?.skill === "qunyou_cairuo" && log.reason) {
				lib.skill.qunyou_cairuo.logChange(player, log.reason, oldLimit, newLimit);
			} else if (log?.reason) {
				const tag = log.skill ? `〖${get.translation(log.skill)}〗` : "";
				game.log(player, tag ? tag + "：" + log.reason : log.reason);
			}
			if (player.hasSkill("qunyou_cairuo")) {
				player.markSkill("qunyou_cairuo");
			}
			// 写入变化前上限，再让 getHandcardLimit 走 maxHandcardFinal 统一检测
			player.storage.qunyou_handcard_last = oldLimit;
			player.getHandcardLimit();
			return { oldLimit, newLimit: player.storage.qunyou_handcard_last };
		},
	},
	qunyou_hunsui: {
		audio: 2,
		dutySkill: true,
		derivation: "qunyou_fufeng",
		initDiscards(player) {
			if (!Array.isArray(player.storage.qunyou_hunsui_discards)) {
				player.storage.qunyou_hunsui_discards = [];
			}
		},
		turnDiscards(player) {
			const list = [];
			const seen = new Set();
			const push = (card) => {
				if (get.position(card, true) != "d") {
					return;
				}
				for (const id of [card.cardid, card._cardid, card]) {
					if (id != null && id !== false && id !== -1 && !seen.has(id)) {
						seen.add(id);
						list.push(card);
						return;
					}
				}
			};
			for (const card of player.storage.qunyou_hunsui_discards || []) {
				push(card);
			}
			return list;
		},
		turnNames(player) {
			const names = [];
			for (const card of lib.skill.qunyou_hunsui.turnDiscards(player)) {
				const name = get.name(card);
				if (!names.includes(name)) {
					names.push(name);
				}
			}
			return names;
		},
		usableDiscards(player) {
			return lib.skill.qunyou_hunsui.turnDiscards(player).filter((card) => player.hasUseTarget(card, true, false));
		},
		async missionSuccess(player) {
			if (!player.hasSkill("qunyou_hunsui")) {
				return;
			}
			player.awakenSkill("qunyou_hunsui");
			game.log(player, "成功完成使命");
			await game.delayx();
			player.removeSkill("qunyou_hunsui");
			await player.addSkills("qunyou_fufeng");
		},
		init(player) {
			lib.skill.qunyou_hunsui.initDiscards(player);
		},
		group: ["qunyou_hunsui_record", "qunyou_hunsui_reset", "qunyou_hunsui_end"],
		mod: {
			targetEnabled(card, player, target) {
				if (!target.hasSkill("qunyou_hunsui")) {
					return;
				}
				if (lib.skill.qunyou_hunsui.turnNames(target).includes(get.name(card, player))) {
					return false;
				}
			},
			targetEnabled2(card, player, target) {
				if (!target.hasSkill("qunyou_hunsui")) {
					return;
				}
				if (lib.skill.qunyou_hunsui.turnNames(target).includes(get.name(card, player))) {
					return false;
				}
			},
		},
		subSkill: {
			record: {
				trigger: { global: ["loseAfter", "loseAsyncAfter", "cardsDiscardAfter"] },
				forced: true,
				popup: false,
				filter(event) {
					if (!_status.currentPhase) {
						return false;
					}
					if (event.name == "cardsDiscard") {
						return event.getParent().name == "orderingDiscard" && event.cards.filterInD("d").length > 0;
					}
					return event.position == ui.discardPile && event.cards?.filterInD("d").length > 0;
				},
				content(event, trigger, player) {
					lib.skill.qunyou_hunsui.initDiscards(player);
					const cards = trigger.cards.filterInD("d");
					player.storage.qunyou_hunsui_discards.addArray(cards);
				},
			},
			reset: {
				trigger: { global: "phaseBegin" },
				forced: true,
				popup: false,
				content(event, trigger, player) {
					if (event.triggername == "phaseBegin") {
						player.storage.qunyou_hunsui_discards = [];
					}
				},
			},
			end: {
				audio: "qunyou_hunsui",
				trigger: { global: "phaseJieshuBegin" },
				forced: true,
				popup: false,
				filter(event, player) {
					if (!player.hasSkill("qunyou_hunsui")) {
						return false;
					}
					if (player.getHandcardLimit() === 0) {
						return true;
					}
					return lib.skill.qunyou_hunsui.usableDiscards(player).length > 0;
				},
				async content(event, trigger, player) {
					const skill = lib.skill.qunyou_hunsui;
					if (player.getHandcardLimit() === 0) {
						await skill.missionSuccess(player);
						return;
					}
					const cards = skill.usableDiscards(player);
					if (!cards.length) {
						return;
					}
					const result = await player
						.chooseCardButton("浑随：选择一张本回合弃牌堆的牌并使用", cards, true)
						.set("ai", (button) => {
							const card = button.link;
							if (get.position(card, true) != "d") {
								return 0;
							}
							if (player.hasUseTarget(card, true, false)) {
								return player.getUseValue(card) + 2;
							}
							return 0;
						})
						.forResult();
					if (!result?.bool || !result.links?.length) {
						return;
					}
					const card = result.links[0];
					if (get.position(card, true) != "d" || !player.hasUseTarget(card, true, false)) {
						return;
					}
					player.logSkill("qunyou_hunsui");
					const useResult = await player.chooseUseTarget(card, true, false).forResult();
					if (!useResult?.bool) {
						return;
					}
					await lib.skill.qunyou_handcard_delta.applyDelta(player, -1, {
						skill: "qunyou_hunsui",
						reason: "使用弃牌堆的牌，手牌上限-1",
					});
				},
			},
		},
	},
	qunyou_cairuo: {
		audio: 2,
		locked: true,
		forced: true,
		popup: false,
		mark: true,
		marktext: "才",
		mod: {
			maxHandcardFinal(player, num) {
				return lib.skill.qunyou_handcard_delta.trackLimitFinal(player, num);
			},
		},
		init(player) {
			if (!Array.isArray(player.storage.qunyou_cairuo_logs)) {
				player.storage.qunyou_cairuo_logs = [];
			}
			player.storage.qunyou_handcard_last = lib.skill.qunyou_handcard_delta.computeLimit(player);
			player.markSkill("qunyou_cairuo");
		},
		clearPending(player) {
			delete player.storage.qunyou_cairuo_pending;
			delete player.storage.qunyou_cairuo_pending_at;
			delete player.storage.qunyou_cairuo_pending_label;
			delete player.storage.qunyou_cairuo_pending_card;
			delete player.storage.qunyou_cairuo_pending_category;
		},
		isTrickCard(card, player) {
			const t = get.type(card, player);
			const t2 = get.type2(card, player);
			return t === "trick" || t2 === "trick" || t === "delay" || t2 === "delay";
		},
		/** 牌大类：basic / trick / equip / delay 等 */
		getCardCategory(card, player) {
			if (!card) {
				return;
			}
			return get.type(card, player) || get.type(card, null, false);
		},
		isSameCardType(cardA, cardB, player) {
			const skill = lib.skill.qunyou_cairuo;
			const ca = skill.getCardCategory(cardA, player);
			const cb = skill.getCardCategory(cardB, player);
			return ca && cb && ca === cb;
		},
		isNextSameTypeOrTrick(pendingCategory, pendingCard, nextCard, player) {
			const skill = lib.skill.qunyou_cairuo;
			if (skill.isTrickCard(nextCard, player)) {
				return "trick";
			}
			const nextCategory = skill.getCardCategory(nextCard, player);
			const prevCategory = pendingCategory || skill.getCardCategory(pendingCard, player);
			if (prevCategory && nextCategory && prevCategory === nextCategory) {
				return "sameType";
			}
			return false;
		},
		/** 本轮内是否已有人（含自己、此前）使用过该牌名的锦囊/延时锦囊 */
		isTrickNameUsedThisRound(card, player, event) {
			const name = get.name(card, player);
			const skill = lib.skill.qunyou_cairuo;
			return (
				game.getRoundHistory("useCard", (evt) => {
					if (evt === event) {
						return false;
					}
					const p = evt.player;
					if (!p || !evt.card) {
						return false;
					}
					if (!skill.isTrickCard(evt.card, p)) {
						return false;
					}
					return get.name(evt.card, p) === name;
				}).length > 0
			);
		},
		logChange(player, reason, oldLimit, newLimit) {
			if (!Array.isArray(player.storage.qunyou_cairuo_logs)) {
				player.storage.qunyou_cairuo_logs = [];
			}
			let line = reason;
			if (newLimit !== oldLimit) {
				line += `（${get.cnNumber(oldLimit)}→${get.cnNumber(newLimit)}）`;
			} else if (newLimit === 0) {
				line += "（手牌上限已为0，不再减少）";
			}
			player.storage.qunyou_cairuo_logs.push(line);
			game.log(player, "〖才若〗：" + line);
			player.markSkill("qunyou_cairuo");
		},
		intro: {
			markcount(storage, player) {
				return player.getHandcardLimit();
			},
			content(storage, player) {
				const base = Math.max(player.hp, 0);
				const raw = player.storage.qunyou_handcard_delta || 0;
				const offset = Math.max(-base, raw);
				let text = `手牌上限${get.cnNumber(player.getHandcardLimit())}（体力${get.cnNumber(base)}`;
				if (offset) {
					text += offset > 0 ? `+${offset}` : offset;
				}
				text += "）";
				const logs = player.storage.qunyou_cairuo_logs || [];
				if (logs.length) {
					text += "<br>最近记录：<br>" + logs.slice(-6).join("<br>");
				}
				return text;
			},
		},
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			return event.player === player;
		},
		async content(event, trigger, player) {
			const skill = lib.skill.qunyou_cairuo;
			const card = trigger.card;
			const isTrick = skill.isTrickCard(card, player);
			const cardLabel = get.translation(card);
			const useIndex = player.getHistory("useCard").length;
			if (
				player.storage.qunyou_cairuo_pending &&
				typeof player.storage.qunyou_cairuo_pending_at === "number" &&
				useIndex > player.storage.qunyou_cairuo_pending_at
			) {
				const prevLabel = player.storage.qunyou_cairuo_pending_label || "牌";
				const pendingCard = player.storage.qunyou_cairuo_pending_card;
				const pendingCategory = player.storage.qunyou_cairuo_pending_category;
				const match = skill.isNextSameTypeOrTrick(pendingCategory, pendingCard, card, player);
				let reason;
				if (match === "trick") {
					reason = `使用${prevLabel}后下一张${cardLabel}为锦囊牌，手牌上限+1`;
				} else if (match === "sameType") {
					const typeName = get.translation(pendingCategory || skill.getCardCategory(pendingCard, player));
					reason = `使用${prevLabel}后下一张${cardLabel}与其同为${typeName}，手牌上限+1`;
				} else {
					reason = `使用${prevLabel}后下一张${cardLabel}既非锦囊也不与其同类型，手牌上限-1`;
				}
				await lib.skill.qunyou_handcard_delta.applyDelta(player, match ? 1 : -1, {
					skill: "qunyou_cairuo",
					reason,
				});
				skill.clearPending(player);
			}
			if (isTrick) {
				const isRepeat = skill.isTrickNameUsedThisRound(card, player, trigger);
				const reason = isRepeat
					? `本轮场内已使用过${cardLabel}，手牌上限-1`
					: `本轮场内首次使用${cardLabel}，手牌上限+1`;
				await lib.skill.qunyou_handcard_delta.applyDelta(player, isRepeat ? -1 : 1, {
					skill: "qunyou_cairuo",
					reason,
				});
			} else {
				player.storage.qunyou_cairuo_pending = true;
				player.storage.qunyou_cairuo_pending_at = useIndex;
				player.storage.qunyou_cairuo_pending_label = cardLabel;
				player.storage.qunyou_cairuo_pending_card = card;
				player.storage.qunyou_cairuo_pending_category = skill.getCardCategory(card, player);
			}
			player.logSkill("qunyou_cairuo");
		},
		group: ["qunyou_cairuo_clear", "qunyou_cairuo_sync"],
		subSkill: {
			sync: {
				charlotte: true,
				trigger: { player: "changeHpAfter" },
				forced: true,
				popup: false,
				content(event, trigger, player) {
					const skill = lib.skill.qunyou_handcard_delta;
					player.storage.qunyou_handcard_last = skill.getLimitBeforeHpChange(player, trigger.num);
					skill.clampOffset(player);
					player.getHandcardLimit();
				},
			},
			clear: {
				charlotte: true,
				trigger: { global: "roundStart" },
				forced: true,
				popup: false,
				async content(event, trigger, player) {
					lib.skill.qunyou_cairuo.clearPending(player);
					delete player.storage.qunyou_cairuo_logs;
				},
			},
		},
	},
	qunyou_fufeng: {
		audio: 2,
		locked: true,
		group: ["qunyou_fufeng_fu"],
		onremove(player) {
			delete player.storage.qunyou_fufeng_buff;
			delete player.storage.qunyou_fufeng_gained;
			player.removeSkill("qunyou_fufeng_fu");
			player.unmarkSkill("qunyou_fufeng_fu");
		},
		/** 手牌上限经过 target（含升高越过、降低落到） */
		crossedLimit(old, neu, target) {
			if (old === neu) {
				return false;
			}
			return (old < target && neu >= target) || (old > target && neu === target);
		},
		getIntroContent(player) {
			const buffs = player.getStorage("qunyou_fufeng_buff") || [];
			const lines = [];
			if (buffs.includes(1)) {
				lines.push("下一张使用的牌无距离无次数限制");
			}
			if (buffs.includes(2)) {
				lines.push("下一次造成伤害后，摸两张牌");
			}
			return lines.join("<br>");
		},
		syncFuMark(player) {
			const buffs = player.getStorage("qunyou_fufeng_buff") || [];
			if (!buffs.length) {
				player.removeSkill("qunyou_fufeng_fu");
				player.unmarkSkill("qunyou_fufeng_fu");
				return;
			}
			if (!player.hasSkill("qunyou_fufeng_fu")) {
				player.addSkill("qunyou_fufeng_fu");
			}
			player.markSkill("qunyou_fufeng_fu");
			player.updateMarks("qunyou_fufeng_fu");
		},
		addBuff(player, id) {
			const buffs = player.getStorage("qunyou_fufeng_buff") || [];
			if (buffs.includes(id)) {
				return;
			}
			player.storage.qunyou_fufeng_buff = buffs.concat([id]);
			lib.skill.qunyou_fufeng.syncFuMark(player);
		},
		removeBuff(player, id) {
			const buffs = player.getStorage("qunyou_fufeng_buff");
			if (!Array.isArray(buffs) || !buffs.includes(id)) {
				return;
			}
			player.storage.qunyou_fufeng_buff = buffs.filter((b) => b !== id);
			lib.skill.qunyou_fufeng.syncFuMark(player);
		},
		async gain3(player) {
			const gained = player.getStorage("qunyou_fufeng_gained") || [];
			const cards = lib.skill.qunyou_hunsui.turnDiscards(player).filter((card) => !gained.includes(card));
			if (!cards.length) {
				return;
			}
			player.logSkill("qunyou_fufeng");
			const result = await player
				.chooseCardButton("扶风：获得一张未以此法获得过的本回合弃牌堆的牌", cards, true)
				.set("ai", (button) => get.value(button.link, player))
				.forResult();
			if (result?.bool && result.links?.length) {
				const list = player.getStorage("qunyou_fufeng_gained") || [];
				player.storage.qunyou_fufeng_gained = list.concat([result.links[0]]);
				await player.gain(result.links, "gain2");
			}
		},
		async onLimitChange(player, oldLimit, newLimit) {
			const skill = lib.skill.qunyou_fufeng;
			const actualNew = typeof newLimit === "number" ? newLimit : player.getHandcardLimit();
			if (actualNew === oldLimit) {
				return;
			}
			if (actualNew > oldLimit) {
				player.logSkill("qunyou_fufeng");
				await player.draw();
			}
			if (skill.crossedLimit(oldLimit, actualNew, 1)) {
				skill.grantUse1(player);
			}
			if (skill.crossedLimit(oldLimit, actualNew, 2)) {
				skill.grantDamage2(player);
			}
			if (skill.crossedLimit(oldLimit, actualNew, 3)) {
				await skill.gain3(player);
			}
		},
		grantUse1(player) {
			const skill = lib.skill.qunyou_fufeng;
			skill.addBuff(player, 1);
			player
				.when({ player: "useCard1" })
				.step((event, trigger, player) => {
					if (trigger.addCount !== false) {
						trigger.addCount = false;
						const stat = player.getStat().card;
						const name = trigger.card.name;
						if (typeof stat[name] === "number" && stat[name] > 0) {
							stat[name]--;
						}
					}
					skill.removeBuff(player, 1);
				})
				.assign({
					mod: {
						cardUsable: () => Infinity,
						targetInRange: () => true,
					},
				});
		},
		grantDamage2(player) {
			const skill = lib.skill.qunyou_fufeng;
			skill.addBuff(player, 2);
			player
				.when({ source: "damageSource" })
				.filter((evt, p) => evt.source === p && evt.num > 0)
				.step(async (event, trigger, player) => {
					player.logSkill("qunyou_fufeng");
					skill.removeBuff(player, 2);
					await player.draw(2);
				});
		},
		subSkill: {
			fu: {
				charlotte: true,
				mark: true,
				marktext: "扶",
				intro: {
					markcount() {
						return 1;
					},
					content(storage, player) {
						return lib.skill.qunyou_fufeng.getIntroContent(player);
					},
				},
			},
		},
	},
	qunyou_youlong: {
		audio: 2,
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			if (event.player !== player) {
				return false;
			}
			const n = event.targets?.length ?? 0;
			if (n % 2 === 1) {
				return false;
			}
			return player.canMoveCard();
		},
		check(event, player) {
			return player.canMoveCard(true);
		},
		async content(event, trigger, player) {
			const result = await player.moveCard(true).forResult();
			if (!result?.card) {
				return;
			}
			const endpoint = result.targets?.[1];
			if (!endpoint?.isIn()) {
				return;
			}
			player.logSkill("qunyou_youlong", endpoint);
			await endpoint
				.chooseUseTarget({ name: "sha", isCard: true }, true, false)
				.set("prompt", "游龙：视为使用一张【杀】")
				.set("logSkill", "qunyou_youlong")
				.forResult();
		},
		ai: {
			effect: {
				player_use: (player, card) => {
					if (!player.canMoveCard(true)) {
						return;
					}
					const ev = get.event();
					const ts = ev?.targets;
					const n = ts?.length ?? 0;
					if (n % 2 === 1) {
						return;
					}
					return 0.25;
				},
			},
		},
	},
	qunyou_fuzhen: {
		audio: 2,
		// 每回合限一次（同胆持 olsbdanchi：usable 1；选「否」不消耗次数）
		usable: 1,
		// 时机参考 character/onlyOL/skill.js old_olsbdanchi、character/xianding/skill.js xinlvli
		trigger: {
			source: "damageSource",
			player: "damageEnd",
		},
		forceDie: true,
		filter(event, player, name) {
			if (!event.num || event.num <= 0) {
				return false;
			}
			// 自伤：damageEnd / damageSource 都会挂到同一角色，只保留 damageEnd
			if (event.player === event.source) {
				return name === "damageEnd" && event.player === player;
			}
			if (name === "damageSource") {
				return event.source === player;
			}
			if (name === "damageEnd") {
				return event.player === player;
			}
			return false;
		},
		check(event, player) {
			return qunyou_fuzhen_zoneCount(player) !== player.hp;
		},
		async content(event, trigger, player) {
			const go = await player
				.chooseBool(get.prompt2("qunyou_fuzhen"))
				.set("ai", () => {
					const z = qunyou_fuzhen_zoneCount(player);
					const hp = player.hp;
					if (z === hp) {
						return 0;
					}
					if (z > hp + 2 && game.hasPlayer((cur) => cur !== player && get.attitude(player, cur) < 0)) {
						return 1;
					}
					if (z < hp) {
						return 1;
					}
					return 0.35;
				})
				.forResult();
			if (!go?.bool) {
				return;
			}
			const ctrl = await player
				.chooseControl("将体力调整至区域内牌数", "将区域内牌数调整至体力")
				.set("prompt", get.prompt2("qunyou_fuzhen"))
				.set("ai", () => {
					const z = qunyou_fuzhen_zoneCount(player);
					const hp = player.hp;
					const maxHp = player.maxHp;
					const capped = Math.max(0, Math.min(z, maxHp));
					const harmA = Math.max(0, hp - capped) + Math.max(0, z - maxHp);
					if (harmA >= 2 && game.hasPlayer((cur) => cur !== player && get.attitude(player, cur) < 0)) {
						return 0;
					}
					if (z > hp + 1) {
						return 1;
					}
					if (z < hp) {
						return 1;
					}
					return Math.random() > 0.45 ? 0 : 1;
				})
				.forResult();
			if (ctrl.index !== 0 && ctrl.index !== 1) {
				return;
			}
			player.logSkill("qunyou_fuzhen");
			let nHarm = 0;
			if (ctrl.index === 0) {
				const z = qunyou_fuzhen_zoneCount(player);
				const newHp = Math.max(0, Math.min(z, player.maxHp));
				const overflow = Math.max(0, z - player.maxHp);
				const oldHp = player.hp;
				const lostHp = Math.max(0, oldHp - newHp);
				const delta = newHp - oldHp;
				if (delta !== 0) {
					await player.changeHp(delta);
				}
				nHarm = lostHp + overflow;
			} else if (ctrl.index === 1) {
				const hp = player.hp;
				let guard = 0;
				while (guard++ < 80) {
					if (qunyou_fuzhen_zoneCount(player) <= hp) {
						break;
					}
					if (!player.countCards("hej")) {
						break;
					}
					const r = await player
						.discardPlayerCard({
							target: player,
							selectButton: 1,
							position: "hej",
							forced: true,
							prompt: "覆阵：弃置区域内的一张牌",
						})
						.forResult();
					if (!r?.bool || !r.cards?.length) {
						break;
					}
				}
				guard = 0;
				while (guard++ < 80) {
					if (qunyou_fuzhen_zoneCount(player) >= hp) {
						break;
					}
					await player.draw();
				}
			} else {
				return;
			}
			if (nHarm <= 0) {
				return;
			}
			const pick = await player
				.chooseTarget(
					`覆阵：依次对至多${get.cnNumber(nHarm)}名其他角色各造成1点伤害`,
					[1, nHarm],
					lib.filter.notMe
				)
				.set("ai", (target) => {
					if (get.attitude(player, target) >= 0) {
						return -1;
					}
					return get.damageEffect(target, player, player);
				})
				.forResult();
			if (!pick?.bool || !pick.targets?.length) {
				return;
			}
			const ordered = pick.targets.sortBySeat?.(player) ?? pick.targets;
			for (const t of ordered) {
				if (!t?.isIn() || !player.isIn()) {
					break;
				}
				await t.damage(1, player);
			}
		},
	},
	qunyou_cuisheng: {
		audio: 2,
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			if (event.player !== player || !event.card) {
				return false;
			}
			// 非虚拟：与 olliubing 一致需有实体牌；另用 get.is.virtualCard 排除纯虚拟牌
			if (!event.cards?.length || get.is.virtualCard(event.card)) {
				return false;
			}
			return !!qunyou_cuisheng_viewAs(event, player);
		},
		check(event, player) {
			const viewAs = qunyou_cuisheng_viewAs(event, player);
			if (!viewAs) {
				return false;
			}
			return player.hasUseTarget(viewAs, true, false);
		},
		async content(event, trigger, player) {
			// content 第一参为技能事件，第二参 trigger 才是 useCard（见 ArrayCompiler.js）
			const viewAs = qunyou_cuisheng_viewAs(trigger, player);
			if (!viewAs || !player.hasUseTarget(viewAs, true, false)) {
				return;
			}
			const t = get.type(trigger.card, player, false);
			const prompt =
				t === "basic"
					? "摧升：视为使用一张火【杀】"
					: t === "trick"
						? "摧升：视为使用一张【戮力同心】"
						: "摧升：视为使用一张【铁索连环】";
			player.logSkill("qunyou_cuisheng");
			await player
				.chooseUseTarget(viewAs, true, false)
				.set("prompt", prompt)
				.set("logSkill", "qunyou_cuisheng")
				.forResult();
		},
		ai: {
			effect: {
				player_use(player, card) {
					if (!card || get.is.virtualCard(card)) {
						return;
					}
					const t = get.type(card, player, false);
					let viewAs;
					if (t === "basic") {
						viewAs = get.autoViewAs({ name: "sha", nature: "fire", isCard: true });
					} else if (t === "trick") {
						viewAs = get.autoViewAs({ name: "lulitongxin", isCard: true });
					} else if (t === "equip") {
						viewAs = get.autoViewAs({ name: "tiesuo", isCard: true });
					}
					if (!viewAs || !player.hasUseTarget(viewAs, true, false)) {
						return;
					}
					return 0.2;
				},
			},
		},
	},
	qunyou_lingzhen: {
		audio: 2,
		enable: "phaseUse",
		filter(event, player) {
			return !player.hasSkill("qunyou_lingzhen_disabled");
		},
		async content(event, trigger, player) {
			const limit = qunyou_lingzhen_limit(player, "qunyou_lingzhen");
			const used = await qunyou_lingzhen_useLoop(player, "qunyou_lingzhen", limit);
			if (player.isIn()) {
				await player.draw();
			}
			if (used < limit && player.isIn()) {
				player.addTempSkill("qunyou_lingzhen_disabled", "phaseAfter");
			}
		},
		subSkill: {
			disabled: {
				charlotte: true,
				sub: true,
			},
		},
		ai: {
			order: 7,
			result: {
				player: 1,
			},
		},
	},
	qunyou_lingzhen2: {
		audio: 2,
		enable: "phaseUse",
		filter(event, player) {
			return !player.hasSkill("qunyou_lingzhen2_disabled");
		},
		async content(event, trigger, player) {
			const limit = qunyou_lingzhen_limit(player, "qunyou_lingzhen2");
			await player.draw();
			const used = await qunyou_lingzhen_useLoop(player, "qunyou_lingzhen2", limit);
			if (used < limit && player.isIn()) {
				player.addTempSkill("qunyou_lingzhen2_disabled", "phaseAfter");
			}
		},
		subSkill: {
			disabled: {
				charlotte: true,
				sub: true,
			},
		},
		ai: {
			order: 7.1,
			result: {
				player: 1,
			},
		},
	},
	qunyou_rongguo: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return qunyou_rongguo_targets(player).length > 0;
		},
		async content(event, trigger, player) {
			let stoppedByFailure = false;
			const nonWinners = [];
			while (player.isIn()) {
				const targets = qunyou_rongguo_targets(player);
				if (!targets.length) {
					break;
				}
				const targetResult = await player
					.chooseTarget(get.prompt("qunyou_rongguo"), "与一名其他角色拼点", true, (card, p, target) => {
						return qunyou_rongguo_targets(p).includes(target);
					})
					.set("ai", (target) => {
						const player = get.player();
						return -get.attitude(player, target) / Math.max(1, target.countCards("h"));
					})
					.forResult();
				if (!targetResult?.bool || !targetResult.targets?.length) {
					break;
				}
				const target = targetResult.targets[0];
				player.logSkill("qunyou_rongguo", target);
				const compare = await player.chooseToCompare(target).forResult();
				if (!compare) {
					break;
				}
				const losers = compare.tie ? [player, target] : compare.bool ? [target] : [player];
				for (const current of losers) {
					if (current && !nonWinners.includes(current)) {
						nonWinners.push(current);
					}
				}
				if (!compare.bool) {
					stoppedByFailure = true;
					for (const current of nonWinners) {
						if (!current?.isIn()) {
							continue;
						}
						if (!game.hasPlayer((dest) => dest !== current && current.canUse({ name: "sha", isCard: true }, dest, false))) {
							continue;
						}
						await current
							.chooseUseTarget({ name: "sha", isCard: true }, true, false)
							.set("prompt", "荣国：视为使用一张【杀】")
							.forResult();
					}
					break;
				}
				const compareCards = qunyou_rongguo_compareCards(compare);
				if (compareCards.length) {
					const put = await player
						.chooseCardButton("荣国：是否将一张拼点牌置于牌堆顶？", compareCards, false)
						.set("ai", (button) => {
							return get.value(button.link, get.player()) - 4;
						})
						.forResult();
					if (put?.bool && put.links?.length) {
						const [card] = put.links;
						if (["o", "d"].includes(get.position(card, true))) {
							game.log(player, "将", card, "置于牌堆顶");
							await game.cardsGotoPile([card], "insert");
						}
					}
				}
				const continueTargets = qunyou_rongguo_targets(player);
				if (!continueTargets.length) {
					break;
				}
				const goon = await player
					.chooseBool("荣国：是否继续拼点？")
					.set("ai", () => true)
					.forResult();
				if (!goon?.bool) {
					break;
				}
			}
			if (!stoppedByFailure && player.isIn()) {
				const num = player.maxHp - player.countCards("h");
				if (num > 0) {
					await player.draw(num);
				}
			}
		},
		ai: {
			order: 7,
			result: {
				player: 1,
			},
		},
	},
	qunyou_yongxu: {
		audio: 2,
		trigger: { player: ["useCard", "respond"] },
		filter(event, player) {
			if (!Array.isArray(event.respondTo)) {
				return false;
			}
			return qunyou_yongxu_baseCards(event).length > 0;
		},
		check() {
			return true;
		},
		async content(event, trigger, player) {
			const base = qunyou_yongxu_baseCards(trigger);
			if (!base.length) {
				return;
			}
			const hasClub = base.some((c) => get.suit(c, player) === "club");
			const hasTrick = base.some((c) => qunyou_yongxu_isTrick(c, player));
			player.logSkill("qunyou_yongxu");
			if (hasClub && hasTrick) {
				const go = await player
					.chooseBool("咏絮：是否翻面并摸三张牌？")
					.set("ai", () => (player.needsToDiscard() > 0 ? 0 : 1))
					.forResult();
				if (go?.bool) {
					await player.turnOver();
					await player.draw(3);
				}
				return;
			}
			const needClub = !hasClub;
			const needTrick = !hasTrick;
			const filterCard = (card) => {
				if (!["h", "e"].includes(get.position(card))) {
					return false;
				}
				const satisfied = (needClub && get.suit(card, player) === "club") || (needTrick && qunyou_yongxu_isTrick(card, player));
				return satisfied && player.hasUseTarget(card, true, false);
			};
			if (!player.countCards("he", filterCard)) {
				return;
			}
			const go2 = await player
				.chooseBool("咏絮：是否使用一张牌（梅花或锦囊：满足一项尚未满足的）并摸一张？")
				.set("ai", () => 0.35)
				.forResult();
			if (!go2?.bool) {
				return;
			}
			const pick = await player
				.chooseCard({
					prompt: "咏絮：选择一张手牌或装备区里的牌",
					selectCard: 1,
					position: "he",
					forced: true,
					filterCard,
				})
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (!pick?.bool || !pick.cards?.length) {
				return;
			}
			const useResult = await player.chooseUseTarget(pick.cards[0], false, false).forResult();
			if (useResult?.bool) {
				await player.draw();
			}
		},
	},
	qunyou_miaoyu: {
		audio: 2,
		locked: false,
		enable: "chooseToUse",
		/** 无顶层 viewAs 时，须靠 hiddenCard 才能进入 hasWuxie / hasUsableCard 的无懈检测（见 player.js hasWuxie） */
		hiddenCard(player, name) {
			if (name !== "wuxie") {
				return false;
			}
			const cur = _status.currentPhase;
			return qunyou_miaoyu_canUse(player, cur);
		},
		filter(event, player) {
			if (event.type !== "wuxie") {
				return false;
			}
			return qunyou_miaoyu_canUse(player, _status.currentPhase);
		},
		viewAsFilter(player) {
			return qunyou_miaoyu_canUse(player, _status.currentPhase);
		},
		mod: {
			aiValue: qunyou_miaoyu_modAiValue,
			aiUseful() {
				return qunyou_miaoyu_modAiValue.apply(this, arguments);
			},
		},
		threaten: 1.2,
		chooseButton: {
			dialog() {
				return ui.create.dialog("妙喻：请选择当前回合角色本回合手牌上限", "hidden");
			},
			chooseControl(event, player) {
				return qunyou_miaoyu_controls(player, _status.currentPhase);
			},
			check(event, player) {
				const opts = qunyou_miaoyu_controls(player, _status.currentPhase);
				if (opts.length === 1) {
					return opts[0];
				}
				const cur = _status.currentPhase;
				const L = cur?.getHandcardLimit() ?? 0;
				const n = player.countCards("hes");
				return n >= L + 1 ? "手牌上限+1" : "手牌上限-1";
			},
			prompt(result, player) {
				return `###妙喻###${get.skillInfoTranslation("qunyou_miaoyu", player)}`;
			},
			backup(result, player) {
				delete player.storage.qunyou_miaoyu_pending;
				const cur = _status.currentPhase;
				if (!cur?.isIn()) {
					return { filterCard: () => false, selectCard: [0, 0] };
				}
				const up = result.control === "手牌上限+1";
				const skName = up ? "qunyou_miaoyu_up" : "qunyou_miaoyu_down";
				/** 须用「调整前上限 L」显式算出 X；addTempSkill 后 getHandcardLimit 未必已变，会误用旧值（如 L=3 选 -1 仍当 3 张） */
				const L = cur.getHandcardLimit();
				const X = up ? L + 1 : L - 1;
				const n = player.countCards("hes");
				if (X < 1 || n < X) {
					return { filterCard: () => false, selectCard: [0, 0] };
				}
				const pid = player.name1 || player.name;
				const skillOrder = lib.character[pid]?.skills || [];
				const a = skillOrder.length;
				/** precontent 会被 StepCompiler 单独抽出执行，不能引用 backup 闭包里的 X/a/skillOrder */
				player.storage.qunyou_miaoyu_pending = {
					banX: X,
					banA: a,
					banOrder: skillOrder.slice(),
					limitSkill: skName,
				};
				return {
					audio: "qunyou_miaoyu",
					sourceSkill: "qunyou_miaoyu",
					viewAs: { name: "wuxie", isCard: true },
					filterCard: true,
					position: "hes",
					selectCard: [X, X],
					prompt: `妙喻：将${get.cnNumber(X)}张牌当【无懈可击】使用`,
					check(card) {
						const tri = _status.event.getTrigger?.();
						if (tri?.card?.name === "chiling") {
							return -1;
						}
						return 8 - get.value(card);
					},
					precontent(event, trigger, player) {
						const d = player.storage.qunyou_miaoyu_pending;
						delete player.storage.qunyou_miaoyu_pending;
						if (d && typeof d.banX === "number") {
							const cur = _status.currentPhase;
							if (cur?.isIn() && d.limitSkill) {
								cur.addTempSkill(d.limitSkill, { player: "phaseAfter" });
							}
							player.storage.qunyou_miaoyu_ban_x = d.banX;
							player.storage.qunyou_miaoyu_ban_a = d.banA;
							player.storage.qunyou_miaoyu_ban_order = d.banOrder;
						}
						player.logSkill("qunyou_miaoyu");
					},
					async contentAfter(event, trigger, player) {
						const banX = player.storage.qunyou_miaoyu_ban_x;
						const banA = player.storage.qunyou_miaoyu_ban_a;
						const order = player.storage.qunyou_miaoyu_ban_order;
						delete player.storage.qunyou_miaoyu_ban_x;
						delete player.storage.qunyou_miaoyu_ban_a;
						delete player.storage.qunyou_miaoyu_ban_order;
						if (typeof banX !== "number" || banX < 1 || banX > banA || !Array.isArray(order)) {
							return;
						}
						const sid = order[banX - 1];
						if (sid && player.hasSkill(sid)) {
							await player.tempBanSkill(sid, { global: "phaseAnyAfter" });
						}
					},
				};
			},
		},
		ai: {
			basic: {
				useful: [6, 4, 3],
				value: [6, 4, 3],
			},
			result: {
				player: 1,
			},
			expose: 0.2,
		},
		subSkill: {
			up: {
				charlotte: true,
				onremove: true,
				mod: {
					maxHand(player, num) {
						return num + 1;
					},
				},
			},
			down: {
				charlotte: true,
				onremove: true,
				mod: {
					maxHand(player, num) {
						return num - 1;
					},
				},
			},
		},
	},
	qunyou_longjue: {
		audio: 2,
		chargeSkill: 7,
		enable: ["chooseToUse", "chooseToRespond"],
		usable(skill, player) {
			return Math.max(0, player.maxHp - 1);
		},
		init(player) {
			if (!player.countMark("charge")) {
				player.addMark("charge", 1, false);
			}
		},
		filter(event, player) {
			if (!player.countCharge() || !qunyou_longjue_remaining(player)) {
				return false;
			}
			return qunyou_longjue_vcards(event, player).length > 0;
		},
		chooseButton: {
			dialog(event, player) {
				return ui.create.dialog("龙绝：视为使用或打出一张基本牌", [qunyou_longjue_vcards(event, player), "vcard"], "hidden");
			},
			check(button) {
				const player = _status.event.player;
				const card = { name: button.link[2], nature: button.link[3], isCard: true };
				if (_status.event.getParent()?.type !== "phase") {
					return 1;
				}
				return player.getUseValue(card, null, true);
			},
			backup(links) {
				return {
					audio: "qunyou_longjue",
					sourceSkill: "qunyou_longjue",
					viewAs: {
						name: links[0][2],
						nature: links[0][3],
						isCard: true,
					},
					filterCard: () => false,
					selectCard: -1,
					popname: true,
					precontent(event, trigger, player) {
						player.removeCharge();
					},
				};
			},
			prompt(links) {
				return `龙绝：消耗1点蓄力点，视为使用或打出【${get.translation({ name: links[0][2], nature: links[0][3] })}】`;
			},
		},
		hiddenCard(player, name) {
			if (get.type(name) !== "basic" || !player.countCharge() || !qunyou_longjue_remaining(player)) {
				return false;
			}
			return true;
		},
		group: ["qunyou_longjue_charge", "qunyou_longjue_bonus"],
		ai: {
			respondSha: true,
			respondShan: true,
			save: true,
			skillTagFilter(player, tag) {
				if (tag === "respondSha") {
					return lib.skill.qunyou_longjue.hiddenCard(player, "sha");
				}
				if (tag === "respondShan") {
					return lib.skill.qunyou_longjue.hiddenCard(player, "shan");
				}
				if (tag === "save") {
					return lib.skill.qunyou_longjue.hiddenCard(player, "tao");
				}
				return false;
			},
			order: 9,
			result: {
				player(player) {
					if (_status.event.dying) {
						return get.attitude(player, _status.event.dying);
					}
					return 1;
				},
			},
		},
		subSkill: {
			backup: {},
			charge: {
				audio: "qunyou_longjue",
				trigger: { player: "changeHp" },
				forced: true,
				filter(event, player) {
					return player.countCharge(true) > 0;
				},
				content(event, trigger, player) {
					player.addCharge();
				},
			},
			bonus: {
				audio: "qunyou_longjue",
				trigger: { player: "useCard" },
				forced: true,
				filter(event, player) {
					return (
						qunyou_longjue_isFull(player) &&
						get.type(event.card, player, false) === "basic" &&
						(get.tag(event.card, "damage") > 0 || get.tag(event.card, "recover") > 0)
					);
				},
				content(event, trigger, player) {
					trigger.baseDamage ??= 1;
					trigger.baseDamage++;
				},
			},
		},
	},
	qunyou_yiyong: {
		audio: 2,
		trigger: { player: "useCard" },
		direct: true,
		filter(event, player) {
			return player.getHp() > 0 && (event.card?.name === "sha" || get.tag(event.card, "damage") > 0);
		},
		async content(event, trigger, player) {
			const max = Math.min(player.getHp(), 3);
			if (max < 1) {
				return;
			}
			const goon = await player
				.chooseBool(get.prompt("qunyou_yiyong"), "是否失去任意点体力，为此牌依次选择等量项？")
				.set("ai", () => {
					return player.hp > 2 && get.tag(trigger.card, "damage") > 0;
				})
				.forResult();
			if (!goon?.bool) {
				return;
			}
			const numResult = await player
				.chooseNumbers(get.prompt("qunyou_yiyong"), [{ prompt: "请选择要失去的体力值", min: 1, max }], true)
				.set("processAI", () => [Math.min(1, max)])
				.forResult();
			const num = numResult?.numbers?.[0];
			if (!num) {
				return;
			}
			player.logSkill("qunyou_yiyong");
			await player.loseHp(num);
			const controls = ["伤害+1", "不可响应", "结算后摸三张牌"];
			for (let i = 0; i < num && controls.length; i++) {
				const result = await player
					.chooseControl(controls)
					.set("prompt", `毅勇：为${get.translation(trigger.card)}选择第${get.cnNumber(i + 1)}项效果`)
					.set("ai", () => controls[0])
					.forResult();
				const control = result.control || controls[0];
				controls.remove(control);
				if (control === "伤害+1") {
					trigger.baseDamage ??= 1;
					trigger.baseDamage++;
					game.log(trigger.card, "造成的伤害", "#y+1");
				} else if (control === "不可响应") {
					trigger.directHit.addArray(game.players);
					game.log(trigger.card, "不可被响应");
				} else if (control === "结算后摸三张牌") {
					player.storage.qunyou_yiyong_draw_event = trigger;
					player.addTempSkill("qunyou_yiyong_draw");
				}
			}
		},
		subSkill: {
			draw: {
				charlotte: true,
				trigger: { player: "useCardAfter" },
				forced: true,
				popup: false,
				filter(event, player) {
					return player.storage.qunyou_yiyong_draw_event === event;
				},
				async content(event, trigger, player) {
					delete player.storage.qunyou_yiyong_draw_event;
					player.removeSkill("qunyou_yiyong_draw");
					await player.draw(3);
				},
				onremove(player) {
					delete player.storage.qunyou_yiyong_draw_event;
				},
			},
		},
	},
	qunyou_dingyi: {
		audio: 2,
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		intro: {
			content(storage) {
				return storage
					? "阴：重铸你与一名角色各一张牌。"
					: "阳：你与一名角色各摸一张牌。";
			},
		},
		trigger: { global: "useCardAfter" },
		direct: true,
		filter(event, player) {
			if (!event.targets || event.targets.length !== 1) {
				return false;
			}
			if (event.player !== player && event.targets[0] !== player) {
				return false;
			}
			return qunyou_dingyi_targets(player, !!player.storage.qunyou_dingyi).length > 0;
		},
		async content(event, trigger, player) {
			const yin = !!player.storage.qunyou_dingyi;
			const targets = qunyou_dingyi_targets(player, yin);
			if (!targets.length) {
				return;
			}
			const result = await player
				.chooseTarget(
					get.prompt("qunyou_dingyi"),
					yin ? "重铸你与一名角色各一张牌" : "你与一名角色各摸一张牌",
					(card, p, target) => targets.includes(target)
				)
				.set("ai", (target) => {
					return yin ? 1 - get.attitude(get.player(), target) : get.attitude(get.player(), target);
				})
				.forResult();
			if (!result?.bool || !result.targets?.length) {
				return;
			}
			const target = result.targets[0];
			player.logSkill("qunyou_dingyi", target);
			if (!yin) {
				await player.draw();
				if (target.isIn()) {
					await target.draw();
				}
			} else if (target === player) {
				const recast = await player
					.chooseCard("定仪：重铸两张牌", 2, "he", true, (card, p) => p.canRecast(card, p))
					.set("ai", (card) => 6 - get.value(card))
					.forResult();
				if (recast?.bool && recast.cards?.length) {
					await player.recast(recast.cards);
				}
			} else {
				const recast1 = await player
					.chooseCard("定仪：重铸一张牌", "he", true, (card, p) => p.canRecast(card, p))
					.set("ai", (card) => 6 - get.value(card))
					.forResult();
				if (recast1?.bool && recast1.cards?.length) {
					await player.recast(recast1.cards);
				}
				if (target.isIn()) {
					const recast2 = await target
						.chooseCard("定仪：重铸一张牌", "he", true, (card, p) => p.canRecast(card, player))
						.set("ai", (card) => 6 - get.value(card))
						.forResult();
					if (recast2?.bool && recast2.cards?.length) {
						await target.recast(recast2.cards);
					}
				}
			}
			if (target.isIn()) {
				const fieldCards = player.getCards("ej").concat(target === player ? [] : target.getCards("ej"));
				const choices = ["本轮不能成为〖定仪〗目标"];
				if (fieldCards.length) {
					choices.push("弃置场上的一张牌");
				}
				const choice = await target
					.chooseControl(choices)
					.set("prompt", "定仪：请选择一项")
					.set("ai", () => (fieldCards.length ? "弃置场上的一张牌" : "本轮不能成为〖定仪〗目标"))
					.forResult();
				if (choice.control === "弃置场上的一张牌") {
					const discard = await target
						.chooseButton(["定仪：弃置你或其场上的一张牌", fieldCards], true)
						.set("ai", (button) => {
							const owner = get.owner(button.link);
							return get.attitude(target, owner) <= 0 ? get.value(button.link, owner) : -get.value(button.link, owner);
						})
						.forResult();
					if (discard?.bool && discard.links?.length) {
						const card = discard.links[0];
						const owner = get.owner(card);
						if (owner) {
							await owner.discard(card);
						}
					}
				} else {
					player.storage.qunyou_dingyi_blocked ??= [];
					player.storage.qunyou_dingyi_blocked.add(target);
				}
			}
			player.changeZhuanhuanji("qunyou_dingyi");
		},
		group: "qunyou_dingyi_reset",
		subSkill: {
			reset: {
				charlotte: true,
				trigger: { global: "roundStart" },
				forced: true,
				popup: false,
				content(event, trigger, player) {
					player.storage.qunyou_dingyi_blocked = [];
				},
			},
		},
	},
	qunyou_zhitian: {
		audio: 2,
		trigger: {
			player: "useCardToPlayered",
			target: "useCardToTargeted",
		},
		direct: true,
		filter(event, player) {
			return qunyou_zhitian_isDamageUnique(event, player);
		},
		async content(event, trigger, player) {
			const executor = qunyou_zhitian_getExecutor(trigger, player);
			if (!executor?.isIn() || !executor.countCards("he")) {
				return;
			}
			const promptTarget = executor === player ? "你" : get.translation(executor);
			const result = await player
				.chooseBool(get.prompt("qunyou_zhitian"), `令${promptTarget}发动“天命”（改为手牌数唯一最小的其他角色也可如此做）`)
				.set("ai", () => get.attitude(get.player(), executor) > 0)
				.forResult();
			if (!result?.bool) {
				return;
			}
			player.logSkill("qunyou_zhitian", executor);
			await qunyou_zhitian_execute(executor, "qunyou_zhitian");
		},
	},
	qunyou_zhijue: {
		audio: 2,
		enable: ["chooseToUse", "chooseToRespond"],
		mark: true,
		marktext: "绝",
		intro: {
			content(storage, player) {
				const wuxie = qunyou_zhijue_getUsed(player, "wuxie");
				const huogong = qunyou_zhijue_getUsed(player, "huogong");
				const both = qunyou_zhijue_bothUsedSuits(player);
				return [
					`本轮已转化过【无懈】的花色：${qunyou_zhijue_suitText(wuxie)}`,
					`本轮已转化过【火攻】的花色：${qunyou_zhijue_suitText(huogong)}`,
					`均已转化过的花色：${qunyou_zhijue_suitText(both)}`,
				].join("<br>");
			},
		},
		group: ["qunyou_zhijue_phase", "qunyou_zhijue_busuan", "qunyou_zhijue_reset"],
		init(player) {
			qunyou_zhijue_storage(player);
			player.markSkill("qunyou_zhijue");
		},
		onremove(player) {
			delete player.storage.qunyou_zhijue;
			delete player.storage.qunyou_zhijue_backup;
		},
		hiddenCard(player, name) {
			if (name !== "wuxie") {
				return false;
			}
			return player.countCards("hes", (card) => qunyou_zhijue_canTransform(player, name, card)) > 0;
		},
		filter(event, player) {
			if (!event.filterCard) {
				return false;
			}
			const names = qunyou_zhijue_availableNames(event, player);
			return names.length > 0 && qunyou_zhijue_hasTransformCard(player, names);
		},
		chooseButton: {
			dialog(event, player) {
				const list = [];
				for (const name of qunyou_zhijue_availableNames(event, player)) {
					if (player.countCards("hes", (card) => qunyou_zhijue_canTransform(player, name, card))) {
						list.push(["锦囊", "", name]);
					}
				}
				return ui.create.dialog("智绝：选择视为使用的牌", [list, "vcard"], "hidden");
			},
			check(button) {
				const player = get.player();
				const name = button.link[2];
				if (_status.event.getParent()?.type !== "phase") {
					return 1;
				}
				return player.getUseValue({ name, isCard: true }, null, true);
			},
			backup(links, player) {
				const choice = links[0][2];
				player.storage.qunyou_zhijue_backup = { name: choice };
				return {
					audio: "qunyou_zhijue",
					sourceSkill: "qunyou_zhijue",
					position: "hes",
					selectCard: 1,
					filterCard(card, player) {
						const name = player.storage.qunyou_zhijue_backup?.name;
						return !!name && qunyou_zhijue_canTransform(player, name, card);
					},
					check(card) {
						return 6 - get.value(card);
					},
					viewAs() {
						return { name: player.storage.qunyou_zhijue_backup?.name, isCard: true };
					},
					popname: true,
					async precontent(event, trigger, player) {
						const data = player.storage.qunyou_zhijue_backup;
						delete player.storage.qunyou_zhijue_backup;
						const card = event.result.cards?.[0];
						if (!data?.name || !card) {
							return;
						}
						qunyou_zhijue_markTransform(player, data.name, card);
					},
				};
			},
			prompt(links) {
				const name = links[0][2];
				return `智绝：将一张本轮未转化过对应花色的牌当【${get.translation(name)}】使用`;
			},
		},
		ai: {
			order: 8,
			result: {
				player: 1,
			},
		},
		subSkill: {
			busuan: {
				audio: "qunyou_zhijue",
				trigger: { player: ["chooseToUseBegin", "chooseToRespondBegin"] },
				direct: true,
				filter(event, player) {
					return qunyou_zhijue_canBusuan(event, player);
				},
				async content(event, trigger, player) {
					const num = qunyou_zhijue_remainingSharedSuits(player).length;
					const result = await player
						.chooseBool(get.prompt("qunyou_zhijue"), `是否卜算${get.cnNumber(num)}，然后令一种花色视为【无懈可击】与【火攻】均已转化过？`)
						.set("ai", () => 0.6)
						.forResult();
					if (!result?.bool) {
						return;
					}
					player.logSkill("qunyou_zhijue");
					await qunyou_zhijue_busuan(player, trigger);
				},
			},
			phase: {
				audio: "qunyou_zhijue",
				enable: "phaseUse",
				filter(event, player) {
					return qunyou_zhijue_remainingSharedSuits(player).length > 0 && qunyou_zhijue_hasTransformCard(player, ["huogong"]);
				},
				async content(event, trigger, player) {
					player.logSkill("qunyou_zhijue");
					await qunyou_zhijue_busuan(player, event);
				},
				ai: {
					order: 7.5,
					result: {
						player: 1,
					},
				},
			},
			reset: {
				charlotte: true,
				trigger: { global: "roundStart" },
				forced: true,
				popup: false,
				content(event, trigger, player) {
					player.storage.qunyou_zhijue = {
						wuxieUsedSuits: [],
						huogongUsedSuits: [],
					};
					delete player.storage.qunyou_zhijue_backup;
					player.markSkill("qunyou_zhijue");
				},
			},
		},
	},
	qunyou_zhichao: {
		audio: 2,
		trigger: { player: "loseAfter", global: "loseAsyncAfter" },
		forced: true,
		filter(event, player) {
			return qunyou_zhichao_lostEquips(event, player).length > 0;
		},
		async content(event, trigger, player) {
			const tao = { name: "tao", isCard: true };
			const canTao = game.hasPlayer((target) => target.isDamaged());
			const choices = [];
			if (canTao) {
				choices.push("使用【桃】");
			}
			if (_status.currentPhase?.isIn()) {
				choices.push("下个阶段交换装备");
			}
			if (!choices.length) {
				return;
			}
			const result = await player
				.chooseControl(choices)
				.set("prompt", "制朝：请选择一项")
				.set("ai", () => (canTao ? "使用【桃】" : "下个阶段交换装备"))
				.forResult();
			if (result.control === "使用【桃】") {
				const targetResult = await player
					.chooseTarget("制朝：选择【桃】的目标", true, (card, p, target) => target.isDamaged())
					.set("ai", (target) => get.recoverEffect(target, player, player))
					.forResult();
				if (targetResult?.bool && targetResult.targets?.length) {
					await player.useCard(tao, targetResult.targets, false);
				}
			} else {
				player.storage.qunyou_zhichao_pending = true;
				player.storage.qunyou_zhichao_skip = trigger;
				player.addTempSkill("qunyou_zhichao_swap", { global: "phaseAfter" });
			}
		},
		subSkill: {
			swap: {
				charlotte: true,
				trigger: {
					global: [
						"phaseZhunbeiBegin",
						"phaseJudgeBegin",
						"phaseDrawBegin",
						"phaseUseBegin",
						"phaseDiscardBegin",
						"phaseJieshuBegin",
					],
				},
				forced: true,
				popup: false,
				filter(event, player) {
					return (
						!!player.storage.qunyou_zhichao_pending &&
						player.storage.qunyou_zhichao_skip !== event &&
						game.hasPlayer((target) => target !== player)
					);
				},
				async content(event, trigger, player) {
					delete player.storage.qunyou_zhichao_pending;
					delete player.storage.qunyou_zhichao_skip;
					player.removeSkill("qunyou_zhichao_swap");
					const result = await player
						.chooseTarget("制朝：与一名角色交换装备区的所有牌", true, (card, p, target) => target !== p)
						.set("ai", (target) => {
							return target.countCards("e") - player.countCards("e");
						})
						.forResult();
					if (result?.bool && result.targets?.length) {
						await player.swapEquip(result.targets[0]);
					}
				},
				onremove(player) {
					delete player.storage.qunyou_zhichao_pending;
					delete player.storage.qunyou_zhichao_skip;
				},
			},
		},
	},
	qunyou_muxin: {
		audio: 2,
		enable: "phaseUse",
		filter(event, player) {
			return player.getHp() > 0 && player.countCards("h") > 0 && !player.hasSkill("qunyou_muxin_disabled");
		},
		filterTarget(card, player, target) {
			return target !== player && target.countCards("h") > 0;
		},
		selectTarget() {
			const player = get.player();
			return [1, Math.max(1, player.getHp())];
		},
		multitarget: true,
		multiline: true,
		async content(event, trigger, player) {
			const targets = event.targets?.filter((target) => target.isIn() && target.countCards("h")) || [];
			if (!targets.length || !player.countCards("h")) {
				return;
			}
			const selfResult = await player
				.chooseCard("暮心：展示一张手牌", "h", true)
				.set("ai", (card) => get.number(card, get.player()))
				.forResult();
			if (!selfResult?.bool || !selfResult.cards?.length) {
				return;
			}
			const selfCard = selfResult.cards[0];
			await player.showCards([selfCard], `${get.translation(player)}发动了【暮心】`);
			const shown = [];
			for (const target of targets) {
				if (!target.isIn() || !target.countCards("h")) {
					continue;
				}
				const result = await target
					.chooseCard("暮心：展示一张手牌", "h", true)
					.set("ai", (card) => {
						const num = get.number(card, target);
						return get.attitude(target, player) > 0 ? Math.abs(num - get.number(selfCard, player)) : 13 - Math.abs(num - get.number(selfCard, player));
					})
					.forResult();
				if (result?.bool && result.cards?.length) {
					await target.showCards(result.cards, `${get.translation(target)}因【暮心】展示了手牌`);
					shown.push({ target, card: result.cards[0] });
				}
			}
			if (!shown.length) {
				return;
			}
			const selfNum = get.number(selfCard, player);
			const nums = shown.map((info) => get.number(info.card, info.target));
			if (nums.every((num) => selfNum > num)) {
				const before = player.getHistory("sourceDamage").length;
				for (const info of shown) {
					if (info.target.isIn()) {
						await info.target.damage(player);
					}
				}
				if (player.getHistory("sourceDamage").length > before) {
					player.addTempSkill("qunyou_muxin_disabled", "phaseAfter");
				}
			} else if (nums.every((num) => selfNum < num)) {
				const gainCards = [selfCard].concat(shown.map((info) => info.card)).filter((card) => get.owner(card) !== player);
				if (gainCards.length) {
					await player.gain(gainCards, "gain2");
				}
				const before = player.getHistory("damage").length;
				await player.damage("nosource");
				if (player.getHistory("damage").length > before) {
					player.addTempSkill("qunyou_muxin_disabled", "phaseAfter");
				}
			} else if (nums.every((num) => selfNum === num)) {
				await player.recover();
			}
		},
		ai: {
			order: 7,
			result: {
				player: 1,
			},
		},
		subSkill: {
			disabled: {
				charlotte: true,
			},
		},
	},
	qunyou_cangxiao: {
		audio: 2,
		trigger: { player: "gainAfter" },
		direct: true,
		filter(event, player) {
			return event.getg?.(player)?.length > 0 && qunyou_cangxiao_notBySkill(event) && player.countCards("he") > 0;
		},
		async content(event, trigger, player) {
			const discard = await player
				.chooseToDiscard(get.prompt("qunyou_cangxiao"), "弃置任意张牌，然后令一名角色选择一项", "he", [1, Infinity])
				.set("ai", (card) => {
					return 6 - get.value(card);
				})
				.forResult();
			if (!discard?.bool || !discard.cards?.length) {
				return;
			}
			const num = discard.cards.length;
			const targetResult = await player
				.chooseTarget("苍霄：令一名角色选择一项", true)
				.set("ai", (target) => {
					const att = get.attitude(get.player(), target);
					return target.countDiscardableCards(get.player(), "he") >= num ? -att : att;
				})
				.forResult();
			if (!targetResult?.bool || !targetResult.targets?.length) {
				return;
			}
			const target = targetResult.targets[0];
			player.logSkill("qunyou_cangxiao", target);
			const choices = [];
			if (target.countDiscardableCards(target, "he") >= num) {
				choices.push(`弃置${get.cnNumber(num)}张牌`);
			}
			choices.push("令其加1点体力上限");
			const choice = await target
				.chooseControl(choices)
				.set("prompt", `苍霄：请选择一项（${get.translation(player)}弃置了${get.cnNumber(num)}张牌）`)
				.set("ai", () => {
					return choices[0];
				})
				.forResult();
			if (choice.control?.startsWith("弃置")) {
				await target.chooseToDiscard(num, "he", true);
			} else {
				await player.gainMaxHp();
			}
		},
	},
	qunyou_yanghui: {
		audio: 2,
		trigger: {
			player: ["damageEnd", "loseAfter"],
			global: "loseAsyncAfter",
		},
		filter(event, player) {
			if (event.name === "damage") {
				return true;
			}
			return qunyou_yanghui_phaseDiscardCards(event, player).length >= 2;
		},
		async cost(event, trigger, player) {
			event.result = await player.chooseBool(get.prompt2(event.skill)).set("ai", () => true).forResult();
		},
		async content(event, trigger, player) {
			await player.turnOver();
			await player.draw(3);
		},
	},
	qunyou_yaliang: {
		audio: 2,
		mark: true,
		onremove(player) {
			delete player.storage.qunyou_yaliang_draw;
			delete player.storage.qunyou_yaliang_discard;
		},
		intro: {
			content(storage, player) {
				const draw = qunyou_yaliang_delayed(player, "draw");
				const discard = qunyou_yaliang_delayed(player, "discard");
				const list = [];
				if (draw) {
					list.push(`延后摸牌：${draw}`);
				}
				if (discard) {
					list.push(`延后弃牌：${discard}`);
				}
				return list.length ? list.join("<br>") : "没有延后牌数";
			},
		},
		group: ["qunyou_yaliang_draw", "qunyou_yaliang_applyDraw", "qunyou_yaliang_discard", "qunyou_yaliang_damage"],
		subSkill: {
			draw: {
				audio: "qunyou_yaliang",
				trigger: { player: "drawBegin" },
				filter(event, player) {
					return player.isTurnedOver() && !event.qunyou_yaliang && event.num > 0;
				},
				async cost(event, trigger, player) {
					event.result = await player
						.chooseBool(`雅量：是否延后摸${get.cnNumber(trigger.num)}张牌？`)
						.set("ai", () => true)
						.forResult();
				},
				async content(event, trigger, player) {
					qunyou_yaliang_addDelayed(player, "draw", trigger.num);
					trigger.num = 0;
				},
			},
			applyDraw: {
				audio: "qunyou_yaliang",
				trigger: { player: "chooseToDiscardBegin" },
				forced: true,
				priority: 10,
				filter(event, player) {
					return qunyou_yaliang_delayed(player, "draw") > 0;
				},
				async content(event, trigger, player) {
					const num = qunyou_yaliang_delayed(player, "draw");
					await player.draw({ num, qunyou_yaliang: true });
					trigger.selectCard = [num, num];
					trigger.forced = true;
					trigger.prompt = `雅量：弃牌数改为${get.cnNumber(num)}张`;
					qunyou_yaliang_clearDelayed(player, "draw");
				},
			},
			discard: {
				audio: "qunyou_yaliang",
				trigger: { player: "chooseToDiscardBegin" },
				priority: 1,
				filter(event, player) {
					return player.isTurnedOver() && !event.chooseonly && event.selectCard;
				},
				async cost(event, trigger, player) {
					const range = get.select(trigger.selectCard);
					let str;
					if (range[0] === range[1]) {
						str = get.cnNumber(range[0]);
					} else if (range[1] === Infinity) {
						str = `至少${get.cnNumber(range[0])}`;
					} else {
						str = `${get.cnNumber(range[0])}至${get.cnNumber(range[1])}`;
					}
					event.result = await player
						.chooseBool(`雅量：是否延后弃置${str}张牌？`)
						.set("ai", () => true)
						.forResult();
				},
				async content(event, trigger, player) {
					trigger.chooseonly = true;
					trigger.set("logSkill", "qunyou_yaliang");
					player
						.when("chooseToDiscardAfter")
						.filter((evt) => evt === trigger && evt.result?.bool && evt.result.cards?.length)
						.step(async (event, trigger, player) => {
							qunyou_yaliang_addDelayed(player, "discard", trigger.result.cards.length);
						});
				},
			},
			damage: {
				audio: "qunyou_yaliang",
				trigger: { source: "damageBegin1" },
				forced: true,
				filter(event, player) {
					return qunyou_yaliang_delayed(player, "discard") > 0;
				},
				async content(event, trigger, player) {
					const cards = qunyou_yaliang_damageCards(trigger);
					const num = qunyou_yaliang_delayed(player, "discard");
					qunyou_yaliang_clearDelayed(player, "discard");
					const discardNum = Math.min(num, player.countCards("he"));
					if (discardNum > 0) {
						await player.chooseToDiscard(`雅量：弃置${get.cnNumber(discardNum)}张牌`, "he", discardNum, true);
					}
					if (cards.length) {
						await player.gain(cards, "gain2");
					}
				},
			},
		},
	},
	qunyou_shuze: {
		audio: 2,
		clanSkill: true,
		trigger: { player: ["turnOverEnd", "linkEnd", "removeJiu", "useCard1"], global: "phaseAfter" },
		filter(event, player, name) {
			if (event.name === "turnOver") {
				return !player.isTurnedOver();
			}
			if (event.name === "link") {
				return !player.isLinked();
			}
			if (event.name === "removeJiu") {
				return true;
			}
			if (name === "useCard1") {
				if (player.hasSkill("xu_jiu", true) && event.card?.name === "sha" && lib.skill.jiu2?.filter?.(event, player)) {
					return true;
				}
				if (
					player.hasSkill("xu_zuijiu", true) &&
					!event.card?.xu_huangzui &&
					["basic", "trick"].includes(get.type(event.card)) &&
					!get.tag(event.card, "damage") &&
					lib.skill.xu_zuijiu2?.filter?.(event, player)
				) {
					return true;
				}
				return false;
			}
			if (name === "phaseAfter") {
				return player.hasSkill("xu_zuijiu", true) && !player.hasSkillTag("jiuSustain", null, name);
			}
			return false;
		},
		check() {
			return true;
		},
		async content(event, trigger, player) {
			await qunyou_shuze_effect(player);
		},
	},
	qunyou_jidu: {
		audio: 2,
		trigger: { player: "phaseZhunbeiBegin" },
		direct: true,
		async content(event, trigger, player) {
			const card = { name: "wanjian", isCard: true, storage: { qunyou_jidu: true } };
			if (!player.hasUseTarget(card, true, false)) {
				return;
			}
			const go = await player
				.chooseBool(get.prompt("qunyou_jidu"), "视为使用一张伤害为0的【万箭齐发】？响应此牌的角色摸一张牌。")
				.set("ai", () => player.getUseValue(card, null, true) > 0)
				.forResult();
			if (!go?.bool) {
				return;
			}
			player.logSkill("qunyou_jidu");
			await player.chooseUseTarget(card, true, false).forResult();
		},
		group: ["qunyou_jidu_draw", "qunyou_jidu_zero", "qunyou_jidu_shan", "qunyou_jidu_clear"],
		subSkill: {
			draw: {
				audio: "qunyou_jidu",
				trigger: { global: "respond" },
				forced: true,
				filter(event) {
					return get.name(event.card) === "shan" && qunyou_jidu_isCard(event.respondTo?.[1]);
				},
				async content(event, trigger, player) {
					player.logSkill("qunyou_jidu", trigger.player);
					await trigger.player.draw();
				},
			},
			zero: {
				audio: "qunyou_jidu",
				trigger: { source: "damageBegin1" },
				forced: true,
				filter(event) {
					return qunyou_jidu_isCard(event.card);
				},
				content(event, trigger) {
					trigger.num = 0;
				},
			},
			shan: {
				audio: "qunyou_jidu",
				trigger: { player: "loseAfter", global: "loseAsyncAfter" },
				direct: true,
				filter(event, player) {
					return _status.currentPhase === player && qunyou_jidu_discardedShan(event).length > 0;
				},
				async content(event, trigger, player) {
					const num = qunyou_jidu_discardedShan(trigger).length;
					let count = (player.storage.qunyou_jidu_shan || 0) + num;
					while (count >= 2) {
						const result = await player
							.chooseTarget(get.prompt("qunyou_jidu"), "令一名角色下次受到的伤害改为2点", (card, p, target) => target.isIn())
							.set("ai", (target) => {
								const att = get.attitude(player, target);
								if (att >= 0) {
									return target.hp > 2 ? 0.2 : -1;
								}
								return 2 - target.hp;
							})
							.forResult();
						if (!result?.bool || !result.targets?.length) {
							count %= 2;
							break;
						}
						count -= 2;
						const target = result.targets[0];
						player.logSkill("qunyou_jidu", target);
						target.addTempSkill("qunyou_jidu_effect", { player: ["damageAfter", "damageCancelled", "damageZero", "dieAfter"] });
					}
					if (count > 0) {
						player.storage.qunyou_jidu_shan = count;
					} else {
						delete player.storage.qunyou_jidu_shan;
					}
				},
			},
			effect: {
				charlotte: true,
				mark: true,
				intro: { content: "下次受到的伤害改为2点" },
				trigger: { player: "damageBegin4" },
				forced: true,
				content(event, trigger, player) {
					trigger.num = 2;
					player.removeSkill("qunyou_jidu_effect");
				},
			},
			clear: {
				charlotte: true,
				trigger: { player: "phaseAfter" },
				forced: true,
				popup: false,
				content(event, trigger, player) {
					delete player.storage.qunyou_jidu_shan;
				},
			},
		},
	},
	qunyou_bingzhu: {
		audio: 2,
		enable: "chooseToUse",
		trigger: { global: ["chooseToUseBegin", "chooseToRespondBegin"] },
		direct: true,
		filter(event, player, triggername) {
			if (player.hasSkill("qunyou_bingzhu_used")) {
				return false;
			}
			if (triggername) {
				if (event.responded || event.player.isLinked()) {
					return false;
				}
				const shan = { name: "shan", isCard: true };
				if (!event.filterCard?.(shan, event.player, event)) {
					return false;
				}
				return event.player.getCards("he", (card) => event.player.canRecast(card, event.player)).length > 0;
			}
			return qunyou_bingzhu_counts(event, player).length > 0;
		},
		hiddenCard(player, name) {
			if (!["sha", "tao"].includes(name) || player.hasSkill("qunyou_bingzhu_used")) {
				return false;
			}
			const linked = game.filterPlayer((target) => target.isLinked()).length;
			return linked >= 2 && game.hasPlayer((target) => target.countCards("h") >= 2 && target.countCards("h") <= linked);
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			const go = await player
				.chooseBool(get.prompt("qunyou_bingzhu", target), `令${get.translation(target)}横置并重铸一张牌？`)
				.set("ai", () => {
					if (get.attitude(player, target) <= 0) {
						return true;
					}
					return target.isLinked() ? true : 0.2;
				})
				.forResult();
			if (!go?.bool) {
				return;
			}
			player.logSkill("qunyou_bingzhu", target);
			player.addTempSkill("qunyou_bingzhu_used", { global: "phaseAfter" });
			await target.link(true);
			const result = await target
				.chooseCard("兵主：重铸一张牌", "he", true, (card, p) => p.canRecast(card, p))
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (result?.bool && result.cards?.length) {
				await target.recast(result.cards);
			}
		},
		chooseButton: {
			dialog(event, player) {
				const buttons = [];
				for (const count of qunyou_bingzhu_counts(event, player)) {
					for (const info of qunyou_bingzhu_cardOptions(event, player, count)) {
						const name = info[2];
						buttons.push([`${count}:${name}`, `重置${get.cnNumber(count)}名角色，视为使用【${get.translation(name)}】`]);
					}
				}
				return ui.create.dialog("兵主：请选择重置数量和视为使用的牌", [buttons, "textbutton"], "hidden");
			},
			check(button) {
				const player = _status.event.player;
				const [countText, name] = button.link.split(":");
				const count = Number(countText);
				const card = { name, isCard: true };
				if (name === "tao") {
					return game.hasPlayer((target) => target.countCards("h") === count && get.recoverEffect(target, player, player) > 0) ? 5 : 0.5;
				}
				return Math.max(
					0.1,
					...game.filterPlayer((target) => {
						return target.countCards("h") === count;
					}).map((target) => get.effect(target, card, player, player))
				);
			},
			backup(links, player) {
				const [countText, name] = links[0].split(":");
				const count = Number(countText);
				player.storage.qunyou_bingzhu_pending = { count, name };
				return {
					audio: "qunyou_bingzhu",
					sourceSkill: "qunyou_bingzhu",
					viewAs: { name, isCard: true },
					filterCard: () => false,
					selectCard: -1,
					selectTarget: 1,
					filterTarget(card, player, target) {
						const data = player.storage.qunyou_bingzhu_pending;
						return data?.count === target.countCards("h") && lib.filter.targetEnabled2(card, player, target);
					},
					popname: true,
					async precontent(event, trigger, player) {
						const data = player.storage.qunyou_bingzhu_pending;
						delete player.storage.qunyou_bingzhu_pending;
						if (!data || typeof data.count !== "number") {
							return;
						}
						const result = await player
							.chooseTarget(`兵主：重置${get.cnNumber(data.count)}名角色`, data.count, true, (card, p, target) => target.isLinked())
							.set("ai", (target) => {
								const att = get.attitude(player, target);
								return att > 0 ? 2 : -1;
							})
							.forResult();
						if (!result?.bool || result.targets?.length !== data.count) {
							return;
						}
						player.logSkill("qunyou_bingzhu", result.targets);
						player.addTempSkill("qunyou_bingzhu_used", { global: "phaseAfter" });
						const targets = result.targets.sortBySeat?.(player) ?? result.targets;
						for (const target of targets) {
							if (target.isLinked()) {
								await target.link(false);
							}
						}
					},
				};
			},
			prompt(links) {
				const [countText, name] = links[0].split(":");
				return `兵主：重置${get.cnNumber(Number(countText))}名角色，视为使用【${get.translation(name)}】`;
			},
		},
		ai: {
			respondSha: true,
			save: true,
			skillTagFilter(player, tag) {
				if (player.hasSkill("qunyou_bingzhu_used")) {
					return false;
				}
				if (tag === "respondSha") {
					return lib.skill.qunyou_bingzhu.hiddenCard(player, "sha");
				}
				if (tag === "save") {
					return lib.skill.qunyou_bingzhu.hiddenCard(player, "tao");
				}
				return false;
			},
			order: 8,
			result: {
				player: 1,
			},
		},
		subSkill: {
			backup: {},
			used: {
				charlotte: true,
				mark: true,
				marktext: "兵",
				intro: { content: "本回合已发动过兵主" },
			},
		},
	},
	qunyou_beixuan: {
		audio: 2,
		enable: "phaseUse",
		filter(event, player) {
			return game.hasPlayer((target) => target !== player && player.canCompare(target));
		},
		filterTarget(card, player, target) {
			return target !== player && player.canCompare(target);
		},
		async content(event, trigger, player) {
			const target = event.target;
			const go = await target
				.chooseBool(`悖玄：是否与${get.translation(player)}拼点？`)
				.set("ai", () => get.attitude(target, player) < 0)
				.forResult();
			if (!go?.bool) {
				player.logSkill("qunyou_beixuan", target);
				target.addTempSkill("qunyou_beixuan_ban", { global: "phaseAfter" });
				return;
			}
			const result = await player.chooseToCompare(target).forResult();
			if (result?.tie) {
				return;
			}
			const winner = result?.bool ? player : target;
			const loser = result?.bool ? target : player;
			if (!winner?.isIn() || !loser?.isIn() || !loser.countCards("he")) {
				return;
			}
			const gain = await winner
				.chooseBool(`悖玄：是否获得${get.translation(loser)}一张牌？`)
				.set("ai", () => get.attitude(winner, loser) <= 0)
				.forResult();
			if (gain?.bool) {
				await winner.gainPlayerCard(loser, "he", true);
			}
		},
		ai: {
			order: 7,
			result: {
				target(player, target) {
					return -get.attitude(player, target);
				},
			},
		},
		subSkill: {
			ban: {
				charlotte: true,
				mark: true,
				intro: { content: "本回合不能再选择确定" },
				trigger: {
					player: [
						"chooseBoolBegin",
						"chooseControlBegin",
						"chooseButtonBegin",
						"chooseTargetBegin",
						"chooseCardBegin",
						"chooseToUseBegin",
						"chooseToRespondBegin",
					],
				},
				forced: true,
				popup: false,
				firstDo: true,
				filter(event) {
					if (event.name === "chooseControl") {
						return !event.forced && event.controls?.includes("cancel2");
					}
					return !event.forced;
				},
				content(event, trigger) {
					qunyou_beixuan_cancelEvent(trigger);
				},
			},
		},
	},
	qunyou_guiwu: {
		audio: 2,
		trigger: { player: "useCard1" },
		direct: true,
		filter(event, player) {
			const kind = qunyou_guiwu_targetKind(event);
			if (!kind) {
				return false;
			}
			if (player.getHistory("useCard", (evt) => qunyou_guiwu_targetKind(evt) === kind).indexOf(event) !== 0) {
				return false;
			}
			const targets = qunyou_guiwu_targets();
			return targets.length > 0 && targets.some((target) => lib.filter.targetEnabled2(event.card, player, target));
		},
		async content(event, trigger, player) {
			const targets = qunyou_guiwu_targets().filter((target) => lib.filter.targetEnabled2(trigger.card, player, target));
			if (!targets.length) {
				return;
			}
			const go = await player
				.chooseBool(get.prompt("qunyou_guiwu"), `将${get.translation(trigger.card)}的目标改为${get.translation(targets)}？`)
				.set("ai", () => {
					let oldEffect = 0;
					for (const target of trigger.targets || []) {
						oldEffect += get.effect(target, trigger.card, player, player);
					}
					let newEffect = 0;
					for (const target of targets) {
						newEffect += get.effect(target, trigger.card, player, player);
					}
					return newEffect > oldEffect;
				})
				.forResult();
			if (!go?.bool) {
				return;
			}
			player.logSkill("qunyou_guiwu", targets);
			trigger.targets.length = 0;
			trigger.targets.addArray(targets);
			if (targets.includes(player) && !player.hasSkill("jiu")) {
				await player.useCard({ name: "jiu", isCard: true }, player, false);
			} else {
				await player.turnOver();
			}
		},
	},
	qunyou_suijian: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return qunyou_suijian_options(player, []).length > 0;
		},
		async content(event, trigger, player) {
			const used = [];
			let actor = player;
			let queue = [];
			while (used.length < qunyou_suijian_names.length) {
				if (!actor?.isIn()) {
					actor = null;
				}
				while (!actor && queue.length) {
					const next = queue.shift();
					if (next?.isIn() && qunyou_suijian_options(next, used).length) {
						actor = next;
					}
				}
				if (!actor) {
					break;
				}
				const options = qunyou_suijian_options(actor, used);
				if (!options.length) {
					actor = null;
					continue;
				}
				const result = await actor
					.chooseButton([qunyou_suijian_prompt(actor, options), [options.map((option) => [option.key, option.label]), "textbutton"]], true)
					.set("options", options)
					.set("ai", (button) => {
						const option = get.event().options.find((item) => item.key === button.link);
						if (!option) {
							return 0;
						}
						return actor.getUseValue(option.card, true, false);
					})
					.forResult();
				if (!result?.bool || !result.links?.length) {
					break;
				}
				const option = options.find((item) => item.key === result.links[0]);
				if (!option) {
					actor = null;
					continue;
				}
				if (actor === player) {
					player.logSkill("qunyou_suijian");
				} else {
					player.logSkill("qunyou_suijian", actor);
				}
				const useResult = await actor
					.chooseUseTarget(option.card, true, false)
					.set("prompt", `碎坚：视为使用${option.label}`)
					.set("logSkill", "qunyou_suijian")
					.forResult();
				if (!useResult?.bool) {
					break;
				}
				used.add(option.usedKey);
				const newTargets = qunyou_suijian_queueTargets(useResult.targets, actor);
				queue = newTargets.concat(queue);
				actor = null;
			}
		},
		ai: {
			order: 8,
			result: {
				player: 1,
			},
		},
	},
	qunyou_fenzi: {
		audio: 2,
		enable: "phaseUse",
		init(player) {
			if (typeof player.storage.qunyou_fenzi_count !== "number") {
				player.storage.qunyou_fenzi_count = 0;
			}
		},
		filter(event, player) {
			if (player.hasSkill("qunyou_fenzi_disabled")) {
				return false;
			}
			return qunyou_fenzi_maxHandPlayers().length > 0;
		},
		async content(event, trigger, player) {
			const x = player.storage.qunyou_fenzi_count || 0;
			player.storage.qunyou_fenzi_count = x + 1;
			if (x > 0) {
				await player.draw(x);
			}
			const targets = qunyou_fenzi_maxHandPlayers();
			if (!targets.length) {
				return;
			}
			let target = targets[0];
			if (targets.length > 1) {
				const result = await player
					.chooseTarget(
						get.prompt("qunyou_fenzi"),
						"对一名手牌数最多的角色造成1点火焰伤害",
						true,
						(card, p, t) => targets.includes(t)
					)
					.set("ai", (t) => get.damageEffect(t, player, player, "fire"))
					.forResult();
				if (!result?.bool || !result.targets?.length) {
					return;
				}
				target = result.targets[0];
			}
			if (!target?.isIn()) {
				return;
			}
			player.logSkill("qunyou_fenzi", target);
			await target.damage("fire", player);
		},
		group: ["qunyou_fenzi_disable"],
		subSkill: {
			disable: {
				trigger: { player: "changeHp" },
				forced: true,
				popup: false,
				charlotte: true,
				filter(event, player) {
					return event.num < 0;
				},
				content(event, trigger, player) {
					player.addTempSkill("qunyou_fenzi_disabled", "phaseAfter");
				},
			},
			disabled: {
				charlotte: true,
				mark: true,
				marktext: "焚",
				intro: { content: "本回合「焚辎」失效" },
			},
		},
		ai: {
			order: 7,
			result: {
				player(player) {
					if (player.hasSkill("qunyou_fenzi_disabled")) {
						return 0;
					}
					const x = player.storage.qunyou_fenzi_count || 0;
					const targets = qunyou_fenzi_maxHandPlayers();
					if (!targets.length) {
						return 0;
					}
					let best = 0;
					for (const target of targets) {
						best = Math.max(best, get.damageEffect(target, player, player, "fire"));
					}
					return best + x * 0.35;
				},
			},
		},
	},
	qunyou_dusheng: {
		audio: 2,
		enable: "phaseUse",
		init(player) {
			player.storage.qunyou_dusheng_used ??= [];
		},
		filter(event, player) {
			if (!get.info("binglinchengxiax")) {
				return false;
			}
			if (!qunyou_dusheng_getUnusedSuits(player).length) {
				return false;
			}
			return game.hasPlayer((current) => current !== player && current.isIn());
		},
		async content(event, trigger, player) {
			const unused = qunyou_dusheng_getUnusedSuits(player);
			const suitResult = await player
				.chooseControl(...unused, "cancel2")
				.set("prompt", get.prompt("qunyou_dusheng"))
				.set("ai", () => {
					const { unused: suits } = get.event();
					return suits[0] || "cancel2";
				})
				.set("unused", unused)
				.forResult();
			if (!suitResult?.control || suitResult.control === "cancel2") {
				return;
			}
			const suit = suitResult.control;
			const targetResult = await player
				.chooseTarget(get.prompt("qunyou_dusheng"), "选择一名其他角色", true, (card, p, t) => p !== t && t.isIn())
				.set("ai", (t) => get.attitude(player, t))
				.forResult();
			if (!targetResult?.bool || !targetResult.targets?.length) {
				return;
			}
			const target = targetResult.targets[0];
			player.storage.qunyou_dusheng_used ??= [];
			if (!player.storage.qunyou_dusheng_used.includes(suit)) {
				player.storage.qunyou_dusheng_used.push(suit);
			}
			player.logSkill("qunyou_dusheng", target);
			await qunyou_dusheng_tryBinglin(player, suit);
			await qunyou_dusheng_tryBinglin(target, suit);
			const remaining = lib.suit.length - player.storage.qunyou_dusheng_used.length;
			if (remaining > 0 && player.countCards("hes")) {
				const max = Math.min(remaining, player.countCards("hes"));
				const recastResult = await player
					.chooseCard(`独胜：是否重铸至多${remaining}张牌？`, [1, max], "hes")
					.set("ai", (card) => 6 - get.value(card))
					.forResult();
				if (recastResult?.bool && recastResult.cards?.length) {
					await player.recast(recastResult.cards);
				}
			}
		},
		group: ["qunyou_dusheng_used"],
		subSkill: {
			used: {
				charlotte: true,
				trigger: { player: "phaseAfter" },
				silent: true,
				content(event, trigger, player) {
					delete player.storage.qunyou_dusheng_used;
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
	qunyou_yiling: {
		audio: 2,
		comboSkill: true,
		locked: false,
		_priority: 20,
		init(player) {
			player.addSkill("qunyou_yiling_mark");
		},
		onremove(player, skill) {
			player.removeSkill("qunyou_yiling_mark");
			qunyou_combo_break(player, skill);
		},
		group: ["qunyou_yiling_mark"],
		trigger: {
			player: ["loseAfter", "discardAfter"],
			global: "loseAsyncAfter",
		},
		filter(event, player) {
			if (event.qunyou_yiling) {
				return false;
			}
			if (!player.storage.qunyou_yiling_pending) {
				return false;
			}
			return qunyou_combo_isDiscard(event, player);
		},
		async cost(event, trigger, player) {
			const cards = qunyou_combo_getDiscardCards(trigger, player).filter((card) => get.itemtype(card) === "card");
			if (!cards.length) {
				return;
			}
			event.result = await player
				.chooseBool(get.prompt2(event.skill))
				.set("ai", () => cards.some((card) => get.value(card, player) < 6))
				.forResult();
		},
		oncancel(trigger, player) {
			qunyou_combo_break(player, "qunyou_yiling");
		},
		async content(event, trigger, player) {
			trigger.set("qunyou_yiling", true);
			qunyou_combo_break(player, "qunyou_yiling");
			const cards = qunyou_combo_getDiscardCards(trigger, player).filter((card) => get.itemtype(card) === "card");
			if (!cards.length) {
				return;
			}
			const result = await player
				.chooseCardButton("移陵：选择一张本次弃置的牌", cards, true)
				.set("ai", (button) => get.value(button.link, player))
				.forResult();
			if (!result?.bool || !result.links?.length) {
				return;
			}
			const card = result.links[0];
			player.logSkill("qunyou_yiling");
			if (get.position(card, true) === "d" && player.hasUseTarget(card, true, false)) {
				await player.chooseUseTarget(card, true, false).set("prompt", "移陵：使用该牌").forResult();
			}
			if (get.position(card, true) === "d") {
				game.log(player, "将", card, "置于牌堆顶");
				await game.cardsGotoPile([card], "insert");
			}
		},
		subSkill: {
			mark: {
				charlotte: true,
				trigger: {
					player: ["gainAfter", "loseAfter", "discardAfter"],
					global: "loseAsyncAfter",
				},
				forced: true,
				popup: false,
				silent: true,
				firstDo: true,
				filter(event, player, name) {
					if (name === "gainAfter") {
						if (player.storage.qunyou_yiye_pending) {
							return false;
						}
						return qunyou_combo_isDraw(event, player);
					}
					if (!player.storage.qunyou_yiling_pending) {
						return false;
					}
					if (qunyou_combo_isDiscard(event, player)) {
						return false;
					}
					return true;
				},
				content(event, trigger, player) {
					if (event.triggername === "gainAfter") {
						player.storage.qunyou_yiling_pending = true;
						player.addTip("qunyou_yiling_mark", "移陵 可连击");
						return;
					}
					qunyou_combo_break(player, "qunyou_yiling");
				},
				"skill_id": "qunyou_yiling_mark",
				sub: true,
				sourceSkill: "qunyou_yiling",
			},
		},
		ai: {
			order: 6,
			result: {
				player: 1,
			},
		},
	},
	qunyou_yiye: {
		audio: 2,
		comboSkill: true,
		locked: false,
		_priority: 20,
		init(player) {
			player.addSkill("qunyou_yiye_mark");
		},
		onremove(player, skill) {
			player.removeSkill("qunyou_yiye_mark");
			qunyou_combo_break(player, skill);
		},
		group: ["qunyou_yiye_mark"],
		trigger: {
			player: "gainAfter",
		},
		filter(event, player) {
			if (event.qunyou_yiye) {
				return false;
			}
			if (!player.storage.qunyou_yiye_pending) {
				return false;
			}
			return qunyou_combo_isDraw(event, player);
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseBool(get.prompt2(event.skill))
				.set("ai", () => {
					const cards = trigger.getg?.(player) || [];
					return (
						cards.some((card) => get.value(card, player) <= 5) ||
						player.hasUseTarget({ name: "huogong", isCard: true }, true, false)
					);
				})
				.forResult();
		},
		oncancel(trigger, player) {
			qunyou_combo_break(player, "qunyou_yiye");
		},
		async content(event, trigger, player) {
			trigger.set("qunyou_yiye", true);
			qunyou_combo_break(player, "qunyou_yiye");
			const cards = (trigger.getg?.(player) || []).filter((card) => get.itemtype(card) === "card");
			player.logSkill("qunyou_yiye");
			if (cards.length) {
				const recast = await player
					.chooseBool("夷业：是否重铸本次摸到的牌？")
					.set("ai", () => cards.some((card) => get.value(card, player) <= 5))
					.forResult();
				if (recast?.bool) {
					await player.recast(cards);
				}
			}
			const huogong = { name: "huogong", isCard: true };
			if (player.hasUseTarget(huogong, true, false)) {
				await player.chooseUseTarget(huogong, true, false).set("prompt", "夷业：视为使用一张【火攻】").forResult();
			}
		},
		subSkill: {
			mark: {
				charlotte: true,
				trigger: {
					player: ["loseAfter", "discardAfter"],
					global: "loseAsyncAfter",
				},
				forced: true,
				popup: false,
				silent: true,
				firstDo: true,
				filter(event, player) {
					return qunyou_combo_isDiscard(event, player);
				},
				content(event, trigger, player) {
					player.storage.qunyou_yiye_pending = true;
					player.addTip("qunyou_yiye_mark", "夷业 可连击");
				},
				"skill_id": "qunyou_yiye_mark",
				sub: true,
				sourceSkill: "qunyou_yiye",
			},
		},
		ai: {
			order: 6,
			result: {
				player: 1,
			},
		},
	},
	qunyou_bingde: {
		audio: 2,
		enable: "phaseUse",
		filter(event, player) {
			return player.countDiscardableCards(player, "he") >= 3;
		},
		async content(event, trigger, player) {
			const result = await player.chooseToDiscard("秉德：弃置三张牌", 3, "he", true).forResult();
			if (!result?.bool) {
				return;
			}
			player.logSkill("qunyou_bingde");
			await player.draw(2);
		},
		ai: {
			order: 6,
			result: {
				player: 1,
			},
		},
	},
	qunyou_jiusi: {
		audio: 2,
		enable: "chooseToUse",
		hiddenCard(player, name) {
			if (name === "jiu") {
				return !player.isTurnedOver();
			}
			return false;
		},
		filter(event, player) {
			if (player.isTurnedOver()) {
				return false;
			}
			return event.filterCard({ name: "jiu", isCard: true }, player, event);
		},
		async content(event, trigger, player) {
			if (_status.event.getParent(2)?.type === "dying") {
				event.dying = player;
				event.type = "dying";
			}
			player.logSkill("qunyou_jiusi");
			await player.turnOver();
			await player.useCard({ name: "jiu", isCard: true }, player);
			const result = await player.judge().forResult();
			if (!result?.card) {
				return;
			}
			const card = result.card;
			if (get.name(card) === "jiu") {
				if (player.isTurnedOver()) {
					await player.turnOver();
				}
				return;
			}
			if (get.position(card, true) === "d") {
				await player.gain(card, "gain2");
			}
		},
		ai: {
			save: true,
			skillTagFilter(player) {
				return !player.isTurnedOver() && _status.event?.dying === player;
			},
			order: 5,
			result: {
				player(player) {
					if (_status.event?.dying === player || player.isTurnedOver()) {
						return 2;
					}
					if (_status.event.getParent()?.name === "phaseUse") {
						if (player.countCards("h", "jiu") > 0) {
							return 0;
						}
						if (!player.countCards("h", "sha")) {
							return 0;
						}
					}
					return 1;
				},
			},
		},
	},
	qunyou_shicai: {
		audio: 2,
		locked: true,
		forced: true,
		popup: false,
		trigger: {
			player: ["useCardAfter", "damageEnd"],
		},
		filter(event, player, name) {
			if (player.hasSkill("qunyou_shicai_disabled")) {
				return false;
			}
			if (name === "useCardAfter") {
				return event.card?.name === "jiu";
			}
			return player.isTurnedOver();
		},
		async content(event, trigger, player) {
			if (event.triggername === "useCardAfter") {
				player.addSkill("qunyou_shicai_effect");
				return;
			}
			player.logSkill("qunyou_shicai");
			await player.turnOver();
			await player.draw(2);
			player.removeSkill("qunyou_shicai_effect");
			player.addTempSkill("qunyou_shicai_disabled", { global: "roundEnd" });
		},
		subSkill: {
			effect: {
				charlotte: true,
				forced: true,
				popup: false,
				mark: true,
				intro: {
					content: "下一张牌无距离和次数限制",
				},
				mod: {
					cardUsable() {
						return Infinity;
					},
					targetInRange() {
						return true;
					},
				},
				trigger: {
					player: "useCard1",
				},
				firstDo: true,
				filter(event, player) {
					return player.hasSkill("qunyou_shicai_effect");
				},
				content(event, trigger, player) {
					player.removeSkill("qunyou_shicai_effect");
					if (trigger.addCount !== false) {
						trigger.addCount = false;
						const stat = player.getStat().card;
						const name = trigger.card.name;
						if (typeof stat[name] === "number" && stat[name] > 0) {
							stat[name]--;
						}
					}
				},
			},
			disabled: {
				charlotte: true,
				mark: true,
				marktext: "酾",
				intro: {
					content: "酾才于本轮失效",
				},
			},
		},
	},
	qunyou_chouci: {
		audio: 2,
		mark: true,
		marktext: "辞",
		init(player) {
			qunyou_chouci_records(player);
		},
		onremove(player) {
			delete player.storage.qunyou_chouci;
		},
		intro: { content: "已记录牌名：$" },
		group: ["qunyou_chouci_record_use"],
		trigger: {
			global: "phaseJieshuBegin",
		},
		filter(event, player) {
			return qunyou_chouci_records(player).length > 0;
		},
		async content(event, trigger, player) {
			const records = qunyou_chouci_records(player);
			const list = records.map((name) => ["锦囊", "", name]);
			const chosen = await player
				.chooseButton(["愁辞：请选择要移除的牌名", [list, "vcard"]], true)
				.set("ai", (button) => {
					const name = button.link[2];
					const cardLike = { name, isCard: true };
					if (player.hasUseTarget(cardLike, true, false)) {
						return 2 + player.getUseValue(cardLike, null, true);
					}
					return qunyou_chouci_discardByName(name).reduce((sum, card) => sum + get.value(card, player), 0);
				})
				.forResult();
			if (!chosen?.bool || !chosen.links?.length) {
				return;
			}
			const name = chosen.links[0][2];
			player.unmarkAuto("qunyou_chouci", [name]);
			game.log(player, "移除了", `#y${get.translation(name)}`, "并发动了", "#g【愁辞】");
			const cardLike = { name, isCard: true };
			const choices = [];
			if (player.hasUseTarget(cardLike, true, false)) {
				choices.push("视为使用此牌");
			}
			const discardCards = qunyou_chouci_discardByName(name);
			if (discardCards.length) {
				choices.push("从弃牌堆中获得与此牌名相同的牌");
			}
			if (!choices.length) {
				return;
			}
			const result = await player
				.chooseControl(choices)
				.set("prompt", `愁辞：已移除【${get.translation(name)}】，请选择一项`)
				.set("ai", () => {
					if (choices.includes("视为使用此牌")) {
						return "视为使用此牌";
					}
					return choices[0];
				})
				.forResult();
			player.logSkill("qunyou_chouci");
			if (result.control === "视为使用此牌") {
				await player.chooseUseTarget(cardLike, true, false).set("prompt", `愁辞：视为使用【${get.translation(name)}】`).forResult();
				return;
			}
			await player.gain(discardCards, "gain2");
		},
		subSkill: {
			record_use: {
				charlotte: true,
				trigger: {
					global: ["loseAfter", "loseAsyncAfter", "cardsDiscardAfter"],
				},
				forced: true,
				filter(event, player, name) {
					if (name === "cardsDiscardAfter") {
						if (event.getParent()?.name !== "orderingDiscard" || !event.cards?.filterInD("d").length) {
							return false;
						}
					}
					const names = qunyou_chouci_namesToRecord(event, player);
					if (!names.length) {
						return false;
					}
					event.qunyou_chouci_names = names;
					return true;
				},
				content(event, trigger, player) {
					game.log(player, "【愁辞调试E】进入record_use.content");
					try {
						const names = trigger.qunyou_chouci_names || qunyou_chouci_namesToRecord(trigger, player);
						game.log(player, `【愁辞调试F】本次牌名=${names.length ? names.map((name) => get.translation(name)).join("、") : "（空）"}`);
						let records = player.storage.qunyou_chouci;
						game.log(player, `【愁辞调试G1】原始storage类型=${Array.isArray(records) ? "array" : typeof records}`);
						if (Array.isArray(records)) {
							// do nothing
						} else if (typeof records === "string" && records.length) {
							records = [records];
							player.storage.qunyou_chouci = records;
						} else {
							records = [];
							player.storage.qunyou_chouci = records;
						}
						game.log(player, `【愁辞调试G2】现有记录=${records.length ? records.map((name) => get.translation(name)).join("、") : "（空）"}`);
						const added = [];
						for (const name of names) {
							game.log(player, `【愁辞调试H】检查牌名=${get.translation(name)}`);
							if (typeof name === "string" && name.length && !records.includes(name)) {
								records.push(name);
								added.push(name);
								game.log(player, `【愁辞调试I】已写入=${get.translation(name)}`);
							}
						}
						game.log(player, `【愁辞调试J】新增数=${added.length}`);
						if (!added.length) {
							game.log(player, "【愁辞调试K】没有新增记录，直接返回");
							return;
						}
						player.markSkill("qunyou_chouci");
						game.log(player, "【愁辞调试L】markSkill完成");
						game.log(player, "记录了", `#y${added.map((name) => get.translation(name)).join("、")}`, "到", "#g【愁辞】");
						game.log(player, "当前【愁辞】记录为", `#y${records.length ? records.map((name) => get.translation(name)).join("、") : "（空）"}`);
					} catch (error) {
						game.log(player, `【愁辞报错】${error?.message || error}`);
					}
				},
				"skill_id": "qunyou_chouci_record_use",
				sub: true,
				sourceSkill: "qunyou_chouci",
			},
		},
	},
	qunyou_qionfu: {
		audio: 2,
		usable: 1,
		trigger: {
			global: "useCardAfter",
		},
		filter(event, player) {
			const records = qunyou_chouci_records(player);
			if (!records?.length) {
				return false;
			}
			if (!qunyou_qionfu_basicVcards(player).length) {
				return false;
			}
			if (!qunyou_chouci_isNormalTrick(event.card)) {
				return false;
			}
			return records.includes(get.name(event.card, false));
		},
		async cost(event, trigger, player) {
			event.result = await player.chooseBool(get.prompt2(event.skill)).set("ai", () => qunyou_qionfu_basicVcards(player).length > 0).forResult();
		},
		async content(event, trigger, player) {
			const list = qunyou_qionfu_basicVcards(player);
			if (!list.length) {
				return;
			}
			const result = await player
				.chooseButton([get.prompt("qunyou_qionfu"), [list, "vcard"]], true)
				.set("filterButton", (button) => {
					const card = { name: button.link[2], isCard: true };
					return get.player().hasUseTarget(card, true, false);
				})
				.set("ai", (button) => get.player().getUseValue({ name: button.link[2], isCard: true }, null, true))
				.forResult();
			if (!result?.bool || !result.links?.length) {
				return;
			}
			const name = result.links[0][2];
			player.logSkill("qunyou_qionfu");
			await player.chooseUseTarget({ name, isCard: true }, true, false).set("prompt", `琼赋：视为使用【${get.translation(name)}】`).forResult();
		},
	},
	qunyou_zhaduo: {
		audio: 2,
		trigger: { player: "phaseZhunbeiBegin" },
		direct: true,
		filter(event, player) {
			return qunyou_zhaduo_targets(player).some((source) => {
				return qunyou_zhaduo_targets(player).some((target) => target !== source && source.canCompare(target));
			});
		},
		async content(event, trigger, player) {
			const result = await player
				.chooseTarget(get.prompt("qunyou_zhaduo"), "令两名角色拼点", 2, (card, p, target) => {
					if (!qunyou_zhaduo_targets(p).includes(target)) {
						return false;
					}
					if (!ui.selected.targets.length) {
						return qunyou_zhaduo_targets(p).some((current) => current !== target && target.canCompare(current));
					}
					return ui.selected.targets[0].canCompare(target);
				})
				.set("ai", (target) => {
					const player = get.player();
					return -get.attitude(player, target) + target.countCards("he") / 10;
				})
				.forResult();
			if (!result?.bool || result.targets?.length !== 2) {
				return;
			}
			const [source, target] = result.targets;
			player.logSkill("qunyou_zhaduo", [source, target]);
			const compare = await source.chooseToCompare(target).forResult();
			if (!compare) {
				return;
			}
			const compareCards = qunyou_zhaduo_compareCards(compare);
			if (compareCards.length === 1) {
				await player.gain(compareCards, "gain2");
			} else if (compareCards.length > 1) {
				const compareResult = await player
					.chooseButton(["诈夺：获得一张拼点牌", compareCards], true)
					.set("ai", (button) => get.value(button.link))
					.forResult();
				if (compareResult?.bool && compareResult.links?.length) {
					await player.gain(compareResult.links, "gain2");
				}
			}
			for (const current of qunyou_zhaduo_nonWinners(compare, source, target)) {
				if (current.countCards("he")) {
					await player.gainPlayerCard(current, "he", true);
				}
			}
			if (compare.tie) {
				return;
			}
			const winner = compare.bool ? source : target;
			if (!winner?.isIn() || !winner.canUse({ name: "juedou", isCard: true }, player, false)) {
				return;
			}
			const duel = await winner
				.chooseBool(`诈夺：是否视为对${get.translation(player)}使用一张【决斗】？`)
				.set("ai", () => get.effect(player, { name: "juedou" }, winner, winner) > 0)
				.forResult();
			if (duel?.bool) {
				await winner.useCard({ name: "juedou", isCard: true }, player, false);
			}
		},
	},
	qunyou_gushe: {
		audio: 2,
		enable: "phaseUse",
		filter(event, player) {
			return qunyou_gushe_targets(player).length > 0 && !!qunyou_gushe_getTopCard();
		},
		filterTarget(_card, player, target) {
			return qunyou_gushe_targets(player).includes(target);
		},
		selectTarget: 1,
		check(_card, player, target) {
			return -get.attitude(player, target) / Math.max(1, target.countCards("h"));
		},
		async content(event, trigger, player) {
			const target = event.targets[0];
			const extraCards = {
				topCard: qunyou_gushe_getTopCard(),
				discardCard: qunyou_gushe_getLastDiscardCard(player),
			};
			const compare = await player.chooseToCompare(target).forResult();
			if (!compare?.player) {
				return;
			}
			const compareCards = qunyou_gushe_cards(compare, player, extraCards);
			await qunyou_gushe_showCards(player, compareCards);
			const rank = qunyou_gushe_rank(compareCards, compare.player);
			if (rank === 1) {
				const gainResult = await player
					.chooseButton(["鼓舌：获得一张拼点牌", compareCards.map((entry) => entry.card)], true)
					.set("ai", (button) => get.value(button.link))
					.forResult();
				if (gainResult?.bool && gainResult.links?.length) {
					await player.gain(gainResult.links[0], "gain2");
					const remaining = compareCards.filter((entry) => entry.card !== gainResult.links[0]);
					await qunyou_gushe_useRemaining(player, remaining);
				}
				return;
			}
			if (rank === 2) {
				const handcards = player.getCards("h");
				if (handcards.length) {
					await player.discard(handcards);
				}
				await player.draw(2);
				return;
			}
			if (rank === 3) {
				await player.damage(2);
				return;
			}
			await qunyou_gushe_assignCards(player, target, compareCards);
		},
		group: "qunyou_gushe_record",
		subSkill: {
			record: {
				charlotte: true,
				trigger: { global: ["loseAfter", "cardsDiscardAfter", "loseAsyncAfter"] },
				forced: true,
				popup: false,
				content(event, trigger, player) {
					const phaseId = _status.currentPhase?.playerid;
					if (!phaseId) {
						delete player.storage.qunyou_gushe_lastDiscard;
						return;
					}
					const card = qunyou_gushe_getDiscardFromEvent(trigger);
					if (card) {
						player.storage.qunyou_gushe_lastDiscard = { phaseId, card };
					}
				},
				sub: true,
			},
		},
		ai: {
			order: 8,
			result: {
				player: 1,
			},
		},
	},
	qunyou_zuobao: {
		audio: 2,
		trigger: { player: "damageBegin4" },
		usable: 1,
		direct: true,
		filter(event, player) {
			return event.num > 0 && player.countCards("h") === player.hp;
		},
		async content(event, trigger, player) {
			const result = await player
				.chooseBool(get.prompt("qunyou_zuobao"), "摸一张牌并防止此伤害")
				.set("ai", () => true)
				.forResult();
			if (!result?.bool) {
				return;
			}
			player.logSkill("qunyou_zuobao");
			await player.draw();
			trigger.cancel();
		},
		ai: {
			nomulti: true,
			maixie: true,
			maixie_hp: true,
		},
	},
	qunyou_xianzhan: {
		audio: 2,
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		intro: {
			content(storage) {
				return storage ? "阴：使用牌结算后，若本回合用牌数为奇数，失去X点体力。" : "阳：使用牌结算后，若本回合用牌数为奇数，回复X点体力。";
			},
		},
		trigger: { player: "useCardAfter" },
		forced: true,
		filter(event, player) {
			return qunyou_turnUseCount(player, event) % 2 === 1;
		},
		async content(event, trigger, player) {
			const num = qunyou_cardNameLength(trigger.card, player);
			if (num <= 0) {
				return;
			}
			if (player.storage.qunyou_xianzhan) {
				await player.loseHp(num);
			} else {
				await player.recover(num);
			}
			player.changeZhuanhuanji("qunyou_xianzhan");
		},
		ai: {
			threaten: 1.2,
		},
	},
	qunyou_zhouxuan: {
		audio: 2,
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		intro: {
			content(storage) {
				return storage ? "阴：使用牌后，若此牌牌名字数为偶数，摸X张牌。" : "阳：使用牌后，若此牌牌名字数为偶数，弃X张牌。";
			},
		},
		trigger: { player: "useCard" },
		forced: true,
		filter(event, player) {
			return qunyou_cardNameLength(event.card, player) % 2 === 0;
		},
		async content(event, trigger, player) {
			const num = qunyou_cardNameLength(trigger.card, player);
			if (player.storage.qunyou_zhouxuan) {
				await player.draw(num);
			} else {
				const discardNum = Math.min(num, player.countCards("he"));
				if (discardNum > 0) {
					await player.chooseToDiscard("he", true, discardNum);
				}
			}
			player.changeZhuanhuanji("qunyou_zhouxuan");
		},
	},
	qunyou_gudan: {
		audio: 2,
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		intro: {
			content(storage) {
				return storage
					? "阴：出牌阶段结束时，若手牌数等于体力上限，你的下个阶段改为摸牌阶段，否则你从游戏外获得一张【随机应变】，进入弃牌堆后销毁之。"
					: "阳：出牌阶段结束时，若手牌数等于体力上限，你的下个阶段改为出牌阶段，否则你从游戏外获得一张【涯角枪】，进入弃牌堆后销毁之。";
			},
		},
		trigger: { player: "phaseUseEnd" },
		forced: true,
		async content(event, trigger, player) {
			if (player.countCards("h") === player.maxHp) {
				const phase = trigger.getParent("phase", true);
				if (phase?.phaseList && typeof phase.num === "number" && phase.num + 1 < phase.phaseList.length) {
					phase.phaseList[phase.num + 1] = `${player.storage.qunyou_gudan ? "phaseDraw" : "phaseUse"}|qunyou_gudan`;
				}
			} else {
				const card = qunyou_gudan_gainCard(player.storage.qunyou_gudan ? "suijiyingbian" : "yajiaoqiang");
				await player.gain(card, "gain2");
				qunyou_gudan_track(player, [card]);
			}
			player.changeZhuanhuanji("qunyou_gudan");
		},
		group: "qunyou_gudan_destroy",
		subSkill: {
			destroy: {
				charlotte: true,
				trigger: {
					player: "loseAfter",
					global: ["loseAsyncAfter", "gainAfter", "equipAfter", "addJudgeAfter", "addToExpansionAfter"],
				},
				forced: true,
				popup: false,
				filter(event, player) {
					return (player.getStorage("qunyou_gudan_cards") || []).length > 0;
				},
				content(event, trigger, player) {
					const cards = qunyou_gudan_discardCards(player);
					if (cards.length) {
						qunyou_gudan_cleanup(player, cards);
						game.cardsGotoSpecial(cards);
						game.log(cards, "被销毁了");
					} else {
						qunyou_gudan_cleanup(player);
					}
				},
				sub: true,
			},
		},
	},
	qunyou_danpo: {
		audio: 2,
		enable: ["chooseToUse", "chooseToRespond"],
		filter(event, player) {
			return qunyou_danpo_list(event, player, "response").length > 0;
		},
		hiddenCard(player, name) {
			if (!lib.inpile.includes(name)) {
				return false;
			}
			return qunyou_danpo_list(_status.event, player, "response").some((info) => info[2] === name);
		},
		chooseButton: {
			dialog(event, player) {
				return ui.create.dialog("胆破：选择响应牌", [qunyou_danpo_list(event, player, "response"), "vcard"], "hidden");
			},
			check(button) {
				const player = get.player();
				const card = { name: button.link[2], nature: button.link[3], isCard: true };
				if (_status.event.getParent()?.type !== "phase") {
					return 1;
				}
				return player.getUseValue(card, null, true);
			},
			backup(links) {
				return {
					audio: "qunyou_danpo",
					sourceSkill: "qunyou_danpo",
					position: "hes",
					filterCard(card, player) {
						return qunyou_danpo_matches(card, links[0][2], links[0][3], "response", player);
					},
					selectCard: 1,
					viewAs: {
						name: links[0][2],
						nature: links[0][3],
						isCard: true,
					},
					popname: true,
				};
			},
			prompt(links) {
				return `胆破：将一张牌当${get.translation(links[0][3]) || ""}【${get.translation(links[0][2])}】${_status.event?.name === "chooseToRespond" ? "打出" : "使用"}`;
			},
		},
		group: ["qunyou_danpo_phase", "qunyou_danpo_reset"],
		subSkill: {
			phase: {
				audio: "qunyou_danpo",
				enable: ["phaseUse", "chooseToUse", "chooseToRespond"],
				filter(event, player) {
					return qunyou_danpo_isPhaseUsing(player) && qunyou_danpo_list(event, player, "use").length > 0;
				},
				hiddenCard(player, name) {
					if (!qunyou_danpo_isPhaseUsing(player) || !lib.inpile.includes(name)) {
						return false;
					}
					return qunyou_danpo_list(_status.event, player, "use").some((info) => info[2] === name);
				},
				chooseButton: {
					dialog(event, player) {
						return ui.create.dialog("胆破：选择可使用或打出的牌", [qunyou_danpo_list(event, player, "use"), "vcard"], "hidden");
					},
					check(button) {
						const player = get.player();
						if (_status.event?.name === "chooseToRespond") {
							return 1;
						}
						return player.getUseValue({ name: button.link[2], nature: button.link[3], isCard: true }, null, true);
					},
					backup(links) {
						return {
							audio: "qunyou_danpo",
							sourceSkill: "qunyou_danpo",
							position: "hes",
							filterCard(card, player) {
								return qunyou_danpo_matches(card, links[0][2], links[0][3], "use", player);
							},
							selectCard: 1,
							viewAs: {
								name: links[0][2],
								nature: links[0][3],
								isCard: true,
							},
							popname: true,
							precontent(event, trigger, player) {
								const name = event.result.card?.name || links[0][2];
								player.addTempSkill("qunyou_danpo_phase_used", "phaseUseAfter");
								player.markAuto("qunyou_danpo_phase_used", [name]);
							},
						};
					},
					prompt(links) {
						return `胆破：将一张牌当${get.translation(links[0][3]) || ""}【${get.translation(links[0][2])}】${_status.event?.name === "chooseToRespond" ? "打出" : "使用"}`;
					},
				},
				ai: {
					order: 7,
					result: {
						player: 1,
					},
				},
			},
			reset: {
				charlotte: true,
				trigger: { player: "changeHp" },
				forced: true,
				popup: false,
				content(event, trigger, player) {
					player.removeSkill("qunyou_danpo_phase_used");
				},
			},
			phase_used: {
				charlotte: true,
				onremove: true,
				mark: true,
				intro: {
					content: "本出牌阶段已以此法使用或打出过$",
				},
				sub: true,
			},
		},
		ai: {
			respondSha: true,
			respondShan: true,
			skillTagFilter(player, tag) {
				if (tag === "respondSha") {
					return qunyou_danpo_list(_status.event, player, "response").some((info) => info[2] === "sha") || (qunyou_danpo_isPhaseUsing(player) && qunyou_danpo_list(_status.event, player, "use").some((info) => info[2] === "sha"));
				}
				if (tag === "respondShan") {
					return qunyou_danpo_list(_status.event, player, "response").some((info) => info[2] === "shan");
				}
				return false;
			},
		},
	},
	qunyou_jicheng: {
		audio: 2,
		enable: "phaseUse",
		filter(_event, player) {
			return qunyou_jicheng_targets(player).length > 0;
		},
		async content(event, _trigger, player) {
			const targetResult = await player
				.chooseTarget(get.prompt("qunyou_jicheng"), "与一名其他角色拼点", true, (_card, p, target) => {
					return qunyou_jicheng_targets(p).includes(target);
				})
				.set("ai", (target) => {
					const player = get.player();
					return -get.attitude(player, target) / Math.max(1, target.countCards("h"));
				})
				.forResult();
			if (!targetResult?.bool || !targetResult.targets?.length) {
				return;
			}
			const target = targetResult.targets[0];
			player.logSkill("qunyou_jicheng", target);
			const compare = await player.chooseToCompare(target).forResult();
			if (!compare || compare.bool) {
				return;
			}
			const redCount = qunyou_jicheng_redCompareCount(compare, player);
			qunyou_jicheng_addLimitLoss(player, redCount);
			const options = qunyou_jicheng_options(player);
			if (!options.length) {
				return;
			}
			const controlResult = await player
				.chooseControl(...options)
				.set("prompt", "岌城：选择一项令手牌数等于手牌上限")
				.set("ai", () => {
					const player = get.player();
					const options = get.event().controls;
					if (options.includes("将一张牌当【决斗】使用")) {
						return "将一张牌当【决斗】使用";
					}
					if (options.includes("摸两张牌") && player.countCards("h") < player.getHandcardLimit()) {
						return "摸两张牌";
					}
					return options[0];
				})
				.forResult();
			const choice = controlResult?.control;
			if (choice === "摸两张牌") {
				await player.draw(2);
			} else if (choice === "将一张牌当【决斗】使用") {
				const duel = await player
					.chooseCardTarget({
						prompt: "岌城：将一张手牌当【决斗】使用",
						position: "h",
						selectCard: 1,
						filterCard(card, player) {
							return player.hasUseTarget({ name: "juedou", cards: [card] }, false);
						},
						filterTarget(_card, player, target) {
							return target !== player && player.canUse({ name: "juedou", cards: ui.selected.cards }, target, false);
						},
						ai1(card) {
							return 6 - get.value(card);
						},
						ai2(target) {
							const player = get.player();
							return get.effect(target, { name: "juedou" }, player, player);
						},
					})
					.forResult();
				if (duel?.bool && duel.cards?.length && duel.targets?.length) {
					await player.useCard({ name: "juedou" }, duel.cards, duel.targets[0], false);
				}
			} else if (choice === "将手牌数调整至手牌上限，结束回合") {
				await qunyou_jicheng_adjustHand(player);
				qunyou_jicheng_finishTurn(event, player);
			}
		},
		mod: {
			maxHandcard(player, num) {
				return num - (player.storage.qunyou_jicheng_effect || 0);
			},
		},
		subSkill: {
			effect: {
				charlotte: true,
				mark: true,
				marktext: "岌",
				intro: {
					content(_storage, player) {
						return `本回合手牌上限-${player.storage.qunyou_jicheng_effect || 0}`;
					},
				},
				onremove(player) {
					delete player.storage.qunyou_jicheng_effect;
				},
				sub: true,
			},
		},
		ai: {
			order: 7,
			result: {
				player: 1,
			},
		},
	},
	qunyou_xiongbo: {
		audio: 2,
		trigger: { player: "phaseZhunbeiBegin" },
		filter(event, player) {
			return player.countCards("h") && qunyou_xiongbo_debaters(player).length > 0;
		},
		direct: true,
		async content(event, trigger, player) {
			const debaters = qunyou_xiongbo_debaters(player);
			if (!debaters.length) {
				return;
			}
			const boolResult = await player
				.chooseBool(get.prompt2("qunyou_xiongbo"))
				.set("ai", () => qunyou_xiongbo_debaters(get.player()).length > 1)
				.forResult();
			if (!boolResult?.bool) {
				return;
			}
			const debate = await player
				.chooseToDebate(debaters)
				.set("prompt", get.prompt("qunyou_xiongbo"))
				.set("prompt2", "令除一号位外的所有其他角色议事，然后与其他多数派共同拼点")
				.set("ai", (card) => get.color(card) === "black" ? 1 : 0)
				.forResult();
			const majority = qunyou_xiongbo_majorityTargets(debate, player);
			if (!majority.length) {
				return;
			}
			player.logSkill("qunyou_xiongbo", majority);
			const next = player.chooseToCompare(majority, (card) => get.number(card)).setContent("chooseToCompareMeanwhile");
			const result = await next.forResult();
			if (!result) {
				return;
			}
			const nums = [next.num1].concat(result.num2 || []);
			const players = [player].concat(next.targets || []);
			let max = 0;
			let winner = null;
			for (let i = 0; i < nums.length; i++) {
				const num = nums[i];
				if (num > max) {
					max = num;
					winner = players[i];
				} else if (num === max) {
					winner = null;
				}
			}
			const compareCards = qunyou_xiongbo_compareCards(result);
			const extraCards = qunyou_jinfa_getEventStorage(next, player)?.cards || [];
			if (winner === player) {
				const gainCards = compareCards.slice();
				for (const card of extraCards) {
					if (card && ["o", "d"].includes(get.position(card, true)) && !gainCards.includes(card)) {
						gainCards.push(card);
					}
				}
				if (gainCards.length) {
					await player.gain(gainCards, "gain2");
				}
				return;
			}
			const cards = qunyou_xiongbo_selfCards(next, player);
			while (true) {
				const cardsx = cards.filter((card) => ["o", "d"].includes(get.position(card, true)) && player.hasUseTarget(card));
				if (!cardsx.length) {
					break;
				}
				const useResult = await player
					.chooseButton(["凶搏：是否依次使用你的拼点相关牌？", cardsx], false)
					.set("filterButton", (button) => _status.event.player.hasUseTarget(button.link))
					.set("ai", (button) => _status.event.player.getUseValue(button.link) + 0.1)
					.forResult();
				if (!useResult?.bool || !useResult.links?.length) {
					break;
				}
				const card = useResult.links[0];
				cards.remove(card);
				player.$gain2(card, false);
				await game.delayx();
				await player.chooseUseTarget(true, card, false);
			}
		},
	},
	qunyou_jinfa: {
		audio: 2,
		group: ["qunyou_jinfa_begin", "qunyou_jinfa_effect"],
		subSkill: {
			begin: {
				audio: "qunyou_jinfa",
				trigger: { global: "chooseToCompareBegin" },
				filter(event, player) {
					if (!player.countCards("he")) {
						return false;
					}
					if (event.player === player) {
						return true;
					}
					if (event.target === player) {
						return true;
					}
					return Array.isArray(event.targets) && event.targets.includes(player);
				},
				direct: true,
				async content(event, trigger, player) {
					const compareEvent = qunyou_jinfa_getCompareEvent(trigger);
					if (!compareEvent || qunyou_jinfa_getEventStorage(compareEvent, player)) {
						return;
					}
					const chooseResult = await player
						.chooseCard("he", [1, Infinity], get.prompt("qunyou_jinfa"), "你可以弃置任意张牌作为本次拼点的额外牌，然后可选择是否改点", "allowChooseAll")
						.set("ai", (card) => 6 - get.value(card))
						.forResult();
					if (!chooseResult?.bool || !chooseResult.cards?.length) {
						return;
					}
					player.logSkill("qunyou_jinfa");
					const cards = chooseResult.cards.slice();
					const storage = qunyou_jinfa_getEventStorage(compareEvent, player, true);
					storage.cards = cards;
					storage.number = qunyou_jinfa_sum(cards, player);
					const canRecast = qunyou_jinfa_sameSuitAndType(cards, player) && cards.every((card) => player.canRecast(card));
					if (canRecast) {
						await player.recast(cards);
					} else {
						await player.discard(cards);
					}
					const boolResult = await player
						.chooseBool(`是否发动【${get.translation("qunyou_jinfa")}】改为本次拼点点数？`, `将本次拼点点数改为至多13的${get.strNumber(storage.number, true)}点加原拼点牌点数`)
						.set("choice", storage.number >= 6)
						.forResult();
					if (boolResult?.bool) {
						storage.modify = true;
					}
				},
			},
			effect: {
				audio: "qunyou_jinfa",
				trigger: { player: "compareFixing", target: "compareFixing" },
				forced: true,
				locked: false,
				popup: false,
				filter(event, player) {
					const compareEvent = qunyou_jinfa_getCompareEvent(event);
					const storage = qunyou_jinfa_getEventStorage(compareEvent, player);
					return !!storage?.modify && storage.number > 0;
				},
				content(event, trigger, player) {
					const compareEvent = qunyou_jinfa_getCompareEvent(trigger);
					const storage = qunyou_jinfa_getEventStorage(compareEvent, player);
					if (!storage?.modify) {
						return;
					}
					if (trigger.player === player) {
						trigger.num1 = Math.min(13, get.number(trigger.card1, player) + storage.number);
					} else {
						trigger.num2 = Math.min(13, get.number(trigger.card2, player) + storage.number);
					}
					game.log(player, "的拼点牌点数改为", `#y${get.strNumber(trigger.player === player ? trigger.num1 : trigger.num2, true)}`);
				},
			},
		},
	},
	qunyou_tongxian: {
		audio: 2,
		trigger: { global: "useCardAfter" },
		forced: true,
		filter(event, player) {
			if (!event.player?.isIn() || !event.card || !player.isIn()) {
				return false;
			}
			const type = qunyou_tongxian_type(event.card, event.player);
			if (!["basic", "trick", "equip"].includes(type)) {
				return false;
			}
			const history = event.player.getHistory("useCard", (evt) => evt !== event && qunyou_tongxian_type(evt.card, event.player) === type);
			if (history.length) {
				return false;
			}
			return player.hasCard((card) => qunyou_tongxian_canUse(player, card, type), "hs");
		},
		async content(event, trigger, player) {
			const type = qunyou_tongxian_type(trigger.card, trigger.player);
			if (!player.hasCard((card) => qunyou_tongxian_canUse(player, card, type), "hs")) {
				return;
			}
			player.addTempSkill("qunyou_tongxian_effect");
			const useResult = await player
				.chooseToUse({
					prompt: `同弦：使用一张${get.translation(type)}牌`,
					position: "hs",
					forced: true,
					filterCard(card, player) {
						return qunyou_tongxian_canUse(player, card, get.event().qunyou_tongxian_type);
					},
				})
				.set("qunyou_tongxian_type", type)
				.set("addCount", false)
				.forResult();
			if (useResult?.bool) {
				await player.draw();
			} else {
				player.removeSkill("qunyou_tongxian_effect");
			}
		},
		subSkill: {
			effect: {
				charlotte: true,
				trigger: { player: "useCard" },
				forced: true,
				popup: false,
				filter(event) {
					return !!event.card;
				},
				content(event, trigger, player) {
					if (trigger.addCount !== false) {
						trigger.addCount = false;
						const stat = player.getStat().card;
						const name = trigger.card.name;
						if (typeof stat[name] === "number") {
							stat[name]--;
						}
						game.log(trigger.card, "不计入次数限制");
					}
					trigger.directHit.addArray(game.players);
					game.log(trigger.card, "不可被响应");
					player.removeSkill(event.name);
				},
			},
		},
	},
};
