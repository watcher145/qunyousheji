import { lib, game, get, ui, _status } from "noname";

/**
 * 技能本体：export const skills = { skill_id: { ... }, ... }
 * 与奇臣传相同，在此集中编写；译名与 *_info 写在 ../translate/skill.js
 */

export async function qunyou_gouxian_useDamageCards(player, target, cards) {
	for (const card of cards) {
		if (get.itemtype(card) !== "card") continue;
		await player.gain([card]);
		const next = player.useCard(card, target);
		if (next) await next;
	}
}

export function qunyou_validNumber(card, player) {
	const num = get.number(card, player);
	return Number.isInteger(num) && num >= 1 && num <= 13 ? num : null;
}

export function qunyou_numberText(num) {
	if (num === 1) return "A";
	if (num === 11) return "J";
	if (num === 12) return "Q";
	if (num === 13) return "K";
	return String(num);
}

export async function qunyou_adjustHpTo(player, target) {
	target = Math.max(0, target);
	if (player.hp < target) return player.recover(target - player.hp);
	if (player.hp > target) return player.loseHp(player.hp - target);
}

export async function qunyou_adjustHandTo(player, target) {
	target = Math.max(0, target);
	const current = player.countCards("h");
	if (current < target) {
		await player.draw(target - current);
		return;
	}
	if (current > target) {
		await player.chooseToDiscard("h", true, current - target).forResult();
	}
}

export function qunyou_cycleState(player, skill) {
	const key = `${skill}_state`;
	const current = Number.isInteger(player.storage[key]) ? player.storage[key] : 0;
	player.storage[key] = (current + 1) % 3;
	player.updateMarks(skill);
}

export function qunyou_getState(player, skill) {
	const key = `${skill}_state`;
	if (!Number.isInteger(player.storage[key])) player.storage[key] = 0;
	return player.storage[key];
}

export function qunyou_getLastNumber(player, skill) {
	const key = `${skill}_lastNumber`;
	return Number.isInteger(player.storage[key]) ? player.storage[key] : null;
}

export function qunyou_setLastNumber(player, skill, number) {
	const key = `${skill}_lastNumber`;
	if (Number.isInteger(number)) player.storage[key] = number;
}

export function qunyou_getPreviousUseNumber(player, event) {
	const history = player.getHistory("useCard");
	if (!history?.length) return null;
	let index = history.indexOf(event);
	if (index < 0) index = history.length;
	for (let i = index - 1; i >= 0; i--) {
		const number = qunyou_validNumber(history[i].card, player);
		if (number !== null) return number;
	}
	return null;
}

export function qunyou_jingce_storage(player) {
	const key = "qunyou_jingce_data";
	if (!player.storage[key] || typeof player.storage[key] !== "object") {
		player.storage[key] = {
			suits: [],
			types: [],
			drawn: [],
		};
	}
	const storage = player.storage[key];
	if (!Array.isArray(storage.suits)) storage.suits = [];
	if (!Array.isArray(storage.types)) storage.types = [];
	if (!Array.isArray(storage.drawn)) storage.drawn = [];
	return storage;
}

export function qunyou_jingce_peek(player) {
	const storage = player.storage.qunyou_jingce_data;
	if (!storage || typeof storage !== "object") {
		return {
			suits: [],
			types: [],
			drawn: [],
		};
	}
	return {
		suits: Array.isArray(storage.suits) ? storage.suits : [],
		types: Array.isArray(storage.types) ? storage.types : [],
		drawn: Array.isArray(storage.drawn) ? storage.drawn : [],
	};
}

export function qunyou_jingce_clear(player) {
	const key = "qunyou_jingce_data";
	player.storage[key] = {
		suits: [],
		types: [],
		drawn: [],
	};
	player.syncStorage(key);
	player.updateMarks("qunyou_jingce_mark");
}

export function qunyou_jingce_recordUse(player, card) {
	if (!card) return;
	const storage = qunyou_jingce_storage(player);
	const suit = get.suit(card, player);
	if (lib.suit.includes(suit) && !storage.suits.includes(suit)) {
		storage.suits.push(suit);
	}
	const type = get.type2(card, player);
	if (["basic", "trick", "equip"].includes(type) && !storage.types.includes(type)) {
		storage.types.push(type);
	}
	player.updateMarks("qunyou_jingce_mark");
}

export function qunyou_jingce_targetCount(player) {
	const storage = qunyou_jingce_storage(player);
	return player.storage.qunyou_jingce ? storage.types.length : storage.suits.length;
}

export function qunyou_jingce_modeText(player) {
	return player.storage.qunyou_jingce ? "阴：类别数" : "阳：花色数";
}

export function qunyou_jingce_usedSuitsText(player) {
	const suits = qunyou_jingce_peek(player).suits;
	return suits.length ? suits.map((suit) => get.translation(suit)).join("、") : "无";
}

export function qunyou_jingce_usedTypesText(player) {
	const types = qunyou_jingce_peek(player).types;
	return types.length ? types.map((type) => get.translation(type)).join("、") : "无";
}

export function qunyou_zhuoqu_numbers(player) {
	const key = "qunyou_zhuoqu_numbers";
	if (!Array.isArray(player.storage[key])) player.storage[key] = [];
	return player.storage[key];
}

export function qunyou_zhuoqu_addNumber(player, number) {
	const before = Array.isArray(player.storage.qunyou_zhuoqu_numbers) ? player.storage.qunyou_zhuoqu_numbers.slice() : [];
	game.log(player, "【灼躯日志-加点前】", number ?? "无点数", before.length ? before.map(num => get.strNumber(num)).join("、") : "无");
	if (!Number.isInteger(number)) return;
	if (!Array.isArray(player.storage.qunyou_zhuoqu_numbers)) player.storage.qunyou_zhuoqu_numbers = [];
	const list = player.storage.qunyou_zhuoqu_numbers;
	if (!list.includes(number)) {
		list.push(number);
		list.sort((a, b) => a - b);
	}
	player.markSkill("qunyou_zhuoqu");
	game.log(player, "【灼躯日志-加点后】", list.length ? list.map(num => get.strNumber(num)).join("、") : "无");
}

export function qunyou_zhuoqu_removeNumbers(player, numbers) {
	const before = Array.isArray(player.storage.qunyou_zhuoqu_numbers) ? player.storage.qunyou_zhuoqu_numbers.slice() : [];
	game.log(player, "【灼躯日志-解封前】", Array.isArray(numbers) ? numbers.map(num => get.strNumber(num)).join("、") || "无" : "无", before.length ? before.map(num => get.strNumber(num)).join("、") : "无");
	if (!Array.isArray(numbers) || !numbers.length) return;
	if (!Array.isArray(player.storage.qunyou_zhuoqu_numbers)) player.storage.qunyou_zhuoqu_numbers = [];
	const list = player.storage.qunyou_zhuoqu_numbers;
	player.storage.qunyou_zhuoqu_numbers = list.filter((num) => !numbers.includes(num));
	if (player.storage.qunyou_zhuoqu_numbers.length) player.markSkill("qunyou_zhuoqu");
	else player.unmarkSkill("qunyou_zhuoqu");
	player.updateMarks("qunyou_zhuoqu");
	game.log(player, "【灼躯日志-解封后】", player.storage.qunyou_zhuoqu_numbers.length ? player.storage.qunyou_zhuoqu_numbers.map(num => get.strNumber(num)).join("、") : "无");
}

export function qunyou_zhuoqu_numberText(player) {
	const list = Array.isArray(player.storage.qunyou_zhuoqu_numbers) ? player.storage.qunyou_zhuoqu_numbers : [];
	return list.length ? list.map(num => get.strNumber(num)).join("、") : "无";
}

export function qunyou_zhuoqu_cardNumbers(card, player) {
	const list = [];
	const add = (item) => {
		const num = qunyou_validNumber(item, player);
		if (num !== null && !list.includes(num)) list.push(num);
	};
	if (!card) return list;
	if (Number.isInteger(card.storage?.qunyou_zhuoqu_number)) list.push(card.storage.qunyou_zhuoqu_number);
	add(card);
	if (Array.isArray(card.cards)) card.cards.forEach(add);
	return list;
}

export function qunyou_zhuoqu_isCurrentUse() {
	const evt = get.event();
	if (!evt) return false;
	if (evt.skill === "qunyou_zhuoqu" || evt.skill === "qunyou_zhuoqu_backup") return true;
	const parent = evt.getParent?.();
	return parent?.skill === "qunyou_zhuoqu" || parent?.skill === "qunyou_zhuoqu_backup";
}

export function qunyou_zhuoqu_isBlocked(player, card) {
	const blocked = Array.isArray(player.storage.qunyou_zhuoqu_numbers) ? player.storage.qunyou_zhuoqu_numbers : [];
	return qunyou_zhuoqu_cardNumbers(card, player).some((num) => blocked.includes(num));
}

export function qunyou_zhuoqu_getUsedNumber(event, player) {
	if (!event) return null;
	if (Number.isInteger(event.card?.storage?.qunyou_zhuoqu_number)) {
		return event.card.storage.qunyou_zhuoqu_number;
	}
	const skill = event.skill || event.getParent?.()?.skill || "";
	if (skill !== "qunyou_zhuoqu" && skill !== "qunyou_zhuoqu_backup") return null;
	const cards = Array.isArray(event.cards) && event.cards.length ? event.cards : Array.isArray(event.card?.cards) ? event.card.cards : [];
	for (const card of cards) {
		const number = qunyou_validNumber(card, player);
		if (number !== null) return number;
	}
	return null;
}

export function qunyou_zhuoqu_isOutsideDiscardPhase(event) {
	if (!event?.getParent) return true;
	for (let i = 1; i <= 6; i++) {
		const parent = event.getParent(i);
		if (!parent) break;
		if (parent.name === "phaseDiscard") return false;
		if (["phaseUse", "phaseDraw", "phaseJudge", "phaseZhunbei", "phaseJieshu"].includes(parent.name)) return true;
	}
	return true;
}

export function qunyou_zhuoqu_discardedNumbers(event, player) {
	if (!event || !qunyou_zhuoqu_isOutsideDiscardPhase(event)) return [];
	if (event.type !== "discard" || event.getlx === false) return [];
	let cards = [];
	if (Array.isArray(event.cards) && event.cards.length) cards = event.cards;
	else if (Array.isArray(event.cards2) && event.cards2.length) cards = event.cards2;
	else if (Array.isArray(event.getl?.(player)?.cards2) && event.getl(player).cards2.length) cards = event.getl(player).cards2;
	cards = cards.filter(card => get.position(card, true) === "d");
	if (!cards.length) return [];
	const blocked = Array.isArray(player.storage.qunyou_zhuoqu_numbers) ? player.storage.qunyou_zhuoqu_numbers : [];
	return [...new Set(cards.map((card) => qunyou_validNumber(card, player)).filter((num) => blocked.includes(num)))];
}

export function qunyou_isPositiveMultiple(number, base) {
	return Number.isInteger(number) && Number.isInteger(base) && base > 0 && number % base === 0;
}

export function qunyou_gainCount(event, player) {
	return (event.getg?.(player) || []).length;
}

export function qunyou_haoxianFieldCandidates(player, number) {
	const list = [];
	for (const target of game.filterPlayer((current) => current !== player)) {
		for (const card of target.getCards("ej", (card) => qunyou_validNumber(card, target) === number)) {
			list.push({ card, owner: target });
		}
	}
	return list;
}

export function qunyou_haoxianHandCandidates(player, number) {
	const list = [];
	for (const target of game.filterPlayer((current) => current !== player)) {
		for (const card of target.getCards("h", (card) => qunyou_validNumber(card, target) === number)) {
			list.push({ card, owner: target });
		}
	}
	return list;
}

export function qunyou_haoxianPileCandidates(pile, number) {
	if (!pile?.childNodes?.length) {
		return [];
	}
	return Array.from(pile.childNodes).filter((card) => qunyou_validNumber(card, false) === number);
}

export function qunyou_haoxianCanGain(player, number) {
	if (!Number.isInteger(number) || number <= 0) {
		return false;
	}
	if (qunyou_haoxianFieldCandidates(player, number).length) {
		return true;
	}
	if (qunyou_haoxianHandCandidates(player, number).length) {
		return true;
	}
	if (qunyou_haoxianPileCandidates(ui.cardPile, number).length) {
		return true;
	}
	if (qunyou_haoxianPileCandidates(ui.discardPile, number).length) {
		return true;
	}
	return false;
}

export async function qunyou_haoxianGainSequential(player, number, count) {
	const gained = [];
	const lostTargets = [];
	let remain = count;
	const takeFromOwners = async (pool) => {
		if (remain <= 0 || !pool.length) {
			return;
		}
		const picks = pool.randomGets(Math.min(remain, pool.length));
		for (const item of picks) {
			if (remain <= 0) {
				break;
			}
			const { card, owner } = item;
			if (get.owner(card) !== owner) {
				continue;
			}
			await player.gain(card, owner, "giveAuto");
			if (get.owner(card) === player) {
				gained.push(card);
				remain--;
				if (owner?.isIn?.() && !lostTargets.includes(owner)) {
					lostTargets.push(owner);
				}
			}
		}
	};
	const takeFromPile = async (pile) => {
		if (remain <= 0) {
			return;
		}
		const pool = qunyou_haoxianPileCandidates(pile, number);
		if (!pool.length) {
			return;
		}
		const picks = pool.randomGets(Math.min(remain, pool.length));
		await player.gain(picks, "gain2");
		for (const card of picks) {
			if (get.owner(card) === player) {
				gained.push(card);
				remain--;
			}
		}
	};
	await takeFromOwners(qunyou_haoxianFieldCandidates(player, number));
	await takeFromOwners(qunyou_haoxianHandCandidates(player, number));
	await takeFromPile(ui.cardPile);
	await takeFromPile(ui.discardPile);
	return { gained, lostTargets };
}


/** 愁辞：普通锦囊（非延时） */
export function qunyou_chouci_isNormalTrick(card) {
	return !!card && get.type(card, false) === "trick";
}

/** 愁辞：已记录的牌名列表 */
export function qunyou_chouci_records(player) {
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
export function qunyou_chouci_discardByName(name) {
	return Array.from(ui.discardPile.childNodes).filter((card) => get.name(card, false) === name);
}

/** 愁辞：实体牌名 */
export function qunyou_chouci_cardName(card) {
	return get.itemtype(card) === "card" && typeof card.name === "string" && card.name.length ? card.name : null;
}

export function qunyou_chouci_eventDiscardCards(event) {
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

export function qunyou_chouci_eventOrderingCards(event) {
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
export function qunyou_chouci_namesToRecord(event, player) {
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
export function qunyou_chouci_addRecords(player, names) {
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
export function qunyou_qionfu_basicVcards(player) {
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
export function qunyou_fuzhen_zoneCount(player) {
	return player.countCards("h") + player.countCards("e") + player.countCards("j");
}

/** 连招：本次获得牌（含摸牌阶段、技能摸牌等） */
export function qunyou_combo_isDraw(event, player) {
	return (event.getg?.(player) || []).length > 0;
}

/** 连招：本次弃置的手牌/装备（含 lose / loseAsync / discard） */
export function qunyou_combo_isDiscard(event, player) {
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
export function qunyou_combo_getDiscardCards(event, player) {
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
export function qunyou_combo_break(player, skill) {
	delete player.storage[`${skill}_pending`];
	player.removeTip(`${skill}_mark`);
}

export function qunyou_taowei_useCards(player, event) {
	const cards = [];
	const add = card => {
		if (get.itemtype(card) === "card" && !cards.includes(card)) {
			cards.push(card);
		}
	};
	for (const evt of player.getHistory("lose")) {
		const related = evt.relatedEvent || evt.getParent();
		if (related !== event) continue;
		if (Array.isArray(evt.hs)) evt.hs.forEach(add);
	}
	if (Array.isArray(event?.cards)) event.cards.forEach(add);
	if (!cards.length && Array.isArray(event?.card?.cards)) event.card.cards.forEach(add);
	if (!cards.length && get.itemtype(event?.card) === "card") cards.push(event.card);
	return cards;
}

export function qunyou_taowei_handCardsBeforeUse(event, player) {
	if (Array.isArray(event?.hs) && event.hs.length) {
		return event.hs.filter(card => get.itemtype(card) === "card");
	}
	const cards = player.getCards("h").slice();
	for (const card of qunyou_taowei_useCards(player, event)) {
		if (!cards.includes(card)) cards.push(card);
	}
	return cards;
}

export function qunyou_taowei_currentMaxNumber(event, player) {
	const numbers = qunyou_taowei_handCardsBeforeUse(event, player)
		.map(card => qunyou_validNumber(card, player))
		.filter(num => Number.isInteger(num));
	if (!numbers.length) return null;
	return Math.max(...numbers);
}

export function qunyou_taowei_matchStage(player, event, stage) {
	const cards = qunyou_taowei_useCards(player, event);
	if (!cards.length) return null;
	if (stage === 0) {
		const max = qunyou_taowei_currentMaxNumber(event, player);
		if (!Number.isInteger(max)) return null;
		return cards.find(card => qunyou_validNumber(card, player) === max) || null;
	}
	if (stage === 1) {
		return cards.find(card => get.color(card, player) === "red") || null;
	}
	if (stage === 2) {
		return cards.find(card => get.name(card, player) === "sha") || (get.name(event.card, player) === "sha" ? cards[0] : null);
	}
	return null;
}

export function qunyou_taowei_reuseCard(player, event) {
	const cards = qunyou_taowei_useCards(player, event);
	if (!cards.length || !event?.card) return null;
	return get.autoViewAs(
		{
			name: get.name(event.card, false),
			nature: get.nature(event.card, false),
			isCard: true,
		},
		cards
	);
}

export async function qunyou_taowei_compare(player, target, card) {
	return await player
		.chooseToCompare(target)
		.set("fixedResult", { [player.playerid]: card })
		.forResult();
}

export function qunyou_hanguo_visibleTag() {
	return "visible_qunyou_hanguo";
}

/** 咏絮：递归展开本次响应所用牌的实体底牌（兼容嵌套虚拟牌） */
export function qunyou_yongxu_flatPhysical(card, list = []) {
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
export function qunyou_yongxu_baseCards(event) {
	const cards = qunyou_yongxu_flatPhysical(event.cards);
	if (cards.length) {
		return cards;
	}
	return qunyou_yongxu_flatPhysical(event.card);
}

export function qunyou_yongxu_isTrick(card, player) {
	return get.type2(card, player) === "trick";
}

/** 妙喻：当前可选的 ±1 项（牌数须 ≥ 调整后 X；L-1<1 时不能选 -1） */
export function qunyou_miaoyu_controls(player, cur) {
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

export function qunyou_miaoyu_canUse(player, cur) {
	return qunyou_miaoyu_controls(player, cur).length > 0;
}

export function qunyou_miaoyu_modAiValue(player, card, num) {
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

export function qunyou_zhitian_getExecutor(event, player) {
	if (event.triggername === "useCardToPlayered") {
		return event.target;
	}
	return player;
}

export function qunyou_zhitian_isDamageUnique(event, player) {
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

export function qunyou_zhitian_uniqueMinHandOther(player) {
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

export async function qunyou_zhitian_execute(executor, skill) {
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

export function qunyou_zhijue_storage(player) {
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

export function qunyou_zhijue_getUsed(player, name) {
	const storage = qunyou_zhijue_storage(player);
	return name === "wuxie" ? storage.wuxieUsedSuits : storage.huogongUsedSuits;
}

export function qunyou_zhijue_getCrossUsed(player, name) {
	return qunyou_zhijue_getUsed(player, name === "wuxie" ? "huogong" : "wuxie");
}

export function qunyou_zhijue_getSuit(card, player) {
	const suit = get.suit(card, player);
	return qunyou_zhijue_suits.includes(suit) ? suit : null;
}

export function qunyou_zhijue_canTransform(player, name, card) {
	const suit = qunyou_zhijue_getSuit(card, player);
	if (!suit) {
		return false;
	}
	return !qunyou_zhijue_getCrossUsed(player, name).includes(suit);
}

export function qunyou_zhijue_markTransform(player, name, card) {
	const suit = qunyou_zhijue_getSuit(card, player);
	if (!suit) {
		return;
	}
	const used = qunyou_zhijue_getUsed(player, name);
	if (!used.includes(suit)) {
		used.push(suit);
	}
}

export function qunyou_zhijue_remainingSharedSuits(player) {
	const storage = qunyou_zhijue_storage(player);
	return qunyou_zhijue_suits.filter((suit) => !storage.wuxieUsedSuits.includes(suit) && !storage.huogongUsedSuits.includes(suit));
}

export function qunyou_zhijue_bothUsedSuits(player) {
	const storage = qunyou_zhijue_storage(player);
	return qunyou_zhijue_suits.filter((suit) => storage.wuxieUsedSuits.includes(suit) && storage.huogongUsedSuits.includes(suit));
}

export function qunyou_zhijue_suitText(list) {
	return list.length ? list.map((suit) => get.translation(suit)).join("、") : "无";
}

export function qunyou_zhijue_availableNames(event, player) {
	if (!event?.filterCard) {
		return player.isPhaseUsing?.() ? ["huogong"] : [];
	}
	if (_status.currentPhase === player && event.type === "phase") {
		return event.filterCard({ name: "huogong", isCard: true }, player, event) ? ["huogong"] : [];
	}
	return ["wuxie", "huogong"].filter((name) => event.filterCard({ name, isCard: true }, player, event));
}

export function qunyou_zhijue_hasTransformCard(player, names) {
	return names.some((name) => player.countCards("hes", (card) => qunyou_zhijue_canTransform(player, name, card)) > 0);
}

export function qunyou_zhijue_canBusuan(event, player) {
	if (!qunyou_zhijue_remainingSharedSuits(player).length) {
		return false;
	}
	const names = qunyou_zhijue_availableNames(event, player);
	if (!names.length) {
		return false;
	}
	return qunyou_zhijue_hasTransformCard(player, names);
}

export function qunyou_zhijue_fillSuit(player, suit) {
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

export async function qunyou_zhijue_busuan(player, event) {
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

export function qunyou_longjue_isFull(player) {
	return player.getMaxCharge() > 0 && player.countCharge(true) === 0;
}

export function qunyou_longjue_remaining(player) {
	const used = player.getStat("skill")?.qunyou_longjue || 0;
	return Math.max(0, player.maxHp - 1 - used);
}

export function qunyou_longjue_vcards(event, player) {
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

export function qunyou_dingyi_targets(player, yin) {
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

export function qunyou_zhichao_lostEquips(event, player) {
	if (event.name === "loseAsyncAfter" && typeof event.getl === "function") {
		return event.getl(player)?.es || [];
	}
	if (event.name === "lose") {
		return event.es || [];
	}
	return [];
}

export function qunyou_cangxiao_notBySkill(event) {
	return !event.getParent((evt) => evt.skill, true);
}

export function qunyou_yanghui_phaseDiscardCards(event, player) {
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

export function qunyou_yaliang_delayed(player, type) {
	return player.storage[`qunyou_yaliang_${type}`] || 0;
}

export function qunyou_yaliang_updateMark(player) {
	if (qunyou_yaliang_delayed(player, "draw") || qunyou_yaliang_delayed(player, "discard")) {
		player.markSkill("qunyou_yaliang");
	} else {
		player.unmarkSkill("qunyou_yaliang");
	}
}

export function qunyou_yaliang_addDelayed(player, type, num) {
	if (num <= 0) {
		return;
	}
	const key = `qunyou_yaliang_${type}`;
	player.storage[key] = (player.storage[key] || 0) + num;
	qunyou_yaliang_updateMark(player);
}

export function qunyou_yaliang_clearDelayed(player, type) {
	delete player.storage[`qunyou_yaliang_${type}`];
	qunyou_yaliang_updateMark(player);
}

export function qunyou_yaliang_damageCards(event) {
	const cards = [];
	qunyou_yongxu_flatPhysical(event.cards, cards);
	qunyou_yongxu_flatPhysical(event.card, cards);
	return cards.filter((card) => ["o", "d"].includes(get.position(card, true)));
}

/** 树泽：桃/五谷选择并执行 */
export async function qunyou_shuze_effect(player) {
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

export function qunyou_jidu_isCard(card) {
	return card?.name === "wanjian" && card.storage?.qunyou_jidu;
}

export function qunyou_jidu_discardedShan(event) {
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
	return cards.filter((card) => get.name(card) === "shan");
}

export function qunyou_bingzhu_cardOptions(event, player, count) {
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

export function qunyou_bingzhu_counts(event, player) {
	const linked = game.filterPlayer((target) => target.isLinked()).length;
	const list = [];
	for (let count = 2; count <= linked; count++) {
		if (qunyou_bingzhu_cardOptions(event, player, count).length) {
			list.push(count);
		}
	}
	return list;
}

export function qunyou_beixuan_cancelEvent(event) {
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

export function qunyou_guiwu_isInstant(event) {
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

export function qunyou_guiwu_targetKind(event) {
	if (!qunyou_guiwu_isInstant(event)) {
		return null;
	}
	return event.targets.length === 1 ? "single" : "multi";
}

export function qunyou_guiwu_targets() {
	const counts = new Map();
	for (const target of game.filterPlayer()) {
		const num = target.countCards("h");
		counts.set(num, (counts.get(num) || 0) + 1);
	}
	return game.filterPlayer((target) => counts.get(target.countCards("h")) === 1);
}

const qunyou_suijian_names = ["tiesuo", "suijiyingbian", "jiu", "sha"];

export function qunyou_suijian_vcard(name, storage) {
	return { name, isCard: true, storage: { qunyou_suijian: true, ...(storage || {}) } };
}

export function qunyou_suijian_canUse(player, card) {
	if (!player?.isIn() || !card || !lib.filter.cardEnabled(card, player)) {
		return false;
	}
	const info = get.info(card, player);
	if (info?.notarget) {
		return true;
	}
	return player.hasUseTarget(card, true, false);
}

export function qunyou_suijian_historyOptions(player) {
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

export function qunyou_suijian_options(player, used) {
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

export function qunyou_suijian_queueTargets(targets, player) {
	if (!targets?.length) {
		return [];
	}
	return targets
		.filter((target) => target?.isIn())
		.sortBySeat(_status.currentPhase || player);
}

export function qunyou_suijian_prompt(player, options) {
	return `${get.translation(player)}：选择视为使用的牌（剩余：${options.map((option) => option.label).join("、")}）`;
}

export function qunyou_cardNameLength(card, player) {
	const name = get.name(card, player) || card?.name || card;
	const text = String(get.translation(name) || "")
		.replace(/<[^>]+>/g, "")
		.replace(/[【】\s]/g, "");
	return text.length;
}

export function qunyou_turnUseCount(player, event) {
	const phase = event?.getParent?.("phase", true) || _status.event?.getParent?.("phase", true);
	return game.getGlobalHistory("everything", (evt) => {
		return evt.name === "useCard" && evt.player === player && (!phase || evt.getParent("phase") === phase);
	}).length;
}

export function qunyou_gudan_gainCard(name) {
	const card = game.createCard(name);
	card.storage ??= {};
	card.storage.qunyou_gudan_destroy = true;
	return card;
}

export function qunyou_gudan_track(player, cards) {
	player.storage.qunyou_gudan_cards ??= [];
	for (const card of cards) {
		if (card && !player.storage.qunyou_gudan_cards.includes(card)) {
			player.storage.qunyou_gudan_cards.push(card);
		}
	}
}

export function qunyou_gudan_discardCards(player) {
	const cards = player.getStorage("qunyou_gudan_cards") || [];
	return cards.filter((card) => {
		if (!card?.storage?.qunyou_gudan_destroy) {
			return false;
		}
		return get.position(card, true) === "d";
	});
}

export function qunyou_gudan_cleanup(player, destroyed = []) {
	const cards = player.getStorage("qunyou_gudan_cards") || [];
	player.storage.qunyou_gudan_cards = cards.filter((card) => card && !destroyed.includes(card));
}

/** 摧升：按使用的实体牌类型返回视为使用的牌；否则 null（evt 须为触发的 useCard 事件） */
export function qunyou_cuisheng_viewAs(evt, player) {
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

export function qunyou_rongguo_targets(player) {
	return game.filterPlayer((target) => target !== player && target.isIn() && player.canCompare(target));
}

export function qunyou_rongguo_compareCards(result) {
	return [result?.player, result?.target].filter((card) => card && ["o", "d"].includes(get.position(card, true)));
}

export function qunyou_zhaduo_compareCards(result) {
	return [result?.player, result?.target].filter((card) => card && ["o", "d"].includes(get.position(card, true)));
}

export function qunyou_zhaduo_nonWinners(result, source, target) {
	if (result?.tie) {
		return [source, target].filter((current) => current?.isIn());
	}
	return [result?.bool ? target : source].filter((current) => current?.isIn());
}

export function qunyou_gushe_targets(player) {
	return game.filterPlayer((target) => target !== player && target.isIn() && player.canCompare(target));
}

export function qunyou_gushe_getTopCard() {
	const card = ui.cardPile.firstChild;
	return get.itemtype(card) === "card" ? card : null;
}

export function qunyou_gushe_getLastDiscardCard(player) {
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

export function qunyou_xiongbo_debaters(player) {
	return game.filterPlayer((current) => current !== player && current.isIn() && current.getSeatNum() !== 1 && current.countCards("h"));
}

export function qunyou_xiongbo_majorityTargets(result, player) {
	if (!result?.opinion || !Array.isArray(result[result.opinion])) {
		return [];
	}
	return result[result.opinion]
		.map((pair) => pair[0])
		.filter((current) => current && current !== player && current.isIn() && player.canCompare(current));
}

export function qunyou_jinfa_getEventStorage(event, player, create = false) {
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

export function qunyou_jinfa_getCompareEvent(event) {
	if (!event) {
		return null;
	}
	if (event.name === "chooseToCompare") {
		return event;
	}
	return event.getParent?.("chooseToCompare", true) || null;
}

export function qunyou_jinfa_sameSuitAndType(cards, player) {
	if (!cards?.length) {
		return false;
	}
	const suit = get.suit(cards[0], player);
	const type = get.type(cards[0], player);
	return cards.every((card) => get.suit(card, player) === suit && get.type(card, player) === type);
}

export function qunyou_jinfa_sum(cards, player) {
	return cards.reduce((sum, card) => sum + get.number(card, player), 0);
}

export function qunyou_xiongbo_compareCards(result) {
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

export function qunyou_xiongbo_selfCards(compareEvent, player) {
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

export function qunyou_gushe_getDiscardFromEvent(trigger) {
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

export function qunyou_gushe_cards(compare, player, extra = {}) {
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

export async function qunyou_gushe_showCards(player, cards) {
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

export function qunyou_gushe_rank(cards, playerCard) {
	const number = get.number(playerCard, false);
	return 1 + cards.filter((entry) => get.number(entry.card, false) > number).length;
}

export function qunyou_gushe_canUse(player, card) {
	if (!player?.isIn() || !card || !lib.filter.cardEnabled(card, player)) {
		return false;
	}
	const info = get.info(card, player);
	if (info?.notarget) {
		return true;
	}
	return player.hasUseTarget(card, true, false);
}

export function qunyou_zhouli_topCards(count = 1) {
	return Array.from(ui.cardPile.childNodes).slice(0, count);
}

export function qunyou_zhouli_bottomCards(count = 1) {
	const cards = Array.from(ui.cardPile.childNodes);
	return count > 0 ? cards.slice(-count) : [];
}

export async function qunyou_zhouli_reveal(player, cards, skill) {
	if (!cards?.length) {
		return;
	}
	await player.showCards(cards, `${get.translation(player)}发动了【${get.translation(skill)}】`);
}

export async function qunyou_zhouli_activate(player, skill = "qunyou_zhouli") {
	const yin = !!player.storage[skill];
	const cards = yin ? qunyou_zhouli_bottomCards(1) : qunyou_zhouli_topCards(1);
	const card = cards[0];
	if (!card) {
		player.changeZhuanhuanji(skill);
		return;
	}
	await qunyou_zhouli_reveal(player, [card], skill);
	if (!yin) {
		if (player.hasUseTarget(card)) {
			await player.chooseUseTarget(card, true, false);
		} else if (get.position(card, true) === "c") {
			card.fix();
			ui.discardPile.appendChild(card);
			game.log(card, "进入了弃牌堆");
			await game.delayx();
		}
	} else if (get.position(card, true) === "c") {
		await player.gain(card, "gain2");
	}
	player.changeZhuanhuanji(skill);
}

export async function qunyou_yunxian_sameColorActivate(player, cards) {
	if (!player.hasSkill("qunyou_zhouli") || cards.length !== 2) {
		return;
	}
	const colors = cards.map((card) => get.color(card, false));
	if (colors.includes("none") || colors[0] !== colors[1]) {
		return;
	}
	const result = await player
		.chooseBool("蕴贤：是否发动“妯娌”？")
		.set("ai", () => true)
		.forResult();
	if (result?.bool) {
		await qunyou_zhouli_activate(player, "qunyou_zhouli");
	}
}

export function qunyou_tongxian_type(card, player) {
	return get.type2(card, player);
}

export function qunyou_tongxian_canUse(player, card, type) {
	if (!player?.isIn() || !card || qunyou_tongxian_type(card, player) !== type || !lib.filter.cardEnabled(card, player)) {
		return false;
	}
	const info = get.info(card, player);
	if (info?.notarget) {
		return true;
	}
	return player.hasUseTarget(card, true, false);
}

export async function qunyou_gushe_useRemaining(player, cards) {
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

export async function qunyou_gushe_assignCards(player, target, cards) {
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

export function qunyou_danpo_responseMap(card, player) {
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

export function qunyou_danpo_useMap(card, player) {
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

export function qunyou_danpo_isPhaseUsing(player) {
	return game.online ? _status.currentPhase === player : player.isPhaseUsing();
}

export function qunyou_danpo_matches(card, name, _nature, mode, player) {
	const list = mode === "use" ? qunyou_danpo_useMap(card, player) : qunyou_danpo_responseMap(card, player);
	if (name === "sha") {
		return list.includes("sha");
	}
	if ((get.type(name) === "trick" || get.type(name) === "delay") && list.includes("trick")) {
		return true;
	}
	return list.includes(name);
}

export function qunyou_danpo_list(event, player, mode) {
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

export function qunyou_zhaduo_targets(player) {
	return game.filterPlayer((target) => target.isIn() && target.countCards("h") > 0);
}

export function qunyou_jicheng_targets(player) {
	return game.filterPlayer((target) => target !== player && target.isIn() && player.canCompare(target));
}

export function qunyou_jicheng_redCompareCount(result, player) {
	return [result?.player, result?.target].filter((card) => card && get.color(card, player) === "red").length;
}

export function qunyou_jicheng_addLimitLoss(player, num) {
	if (num <= 0) {
		return;
	}
	player.storage.qunyou_jicheng_effect = (player.storage.qunyou_jicheng_effect || 0) + num;
	player.addTempSkill("qunyou_jicheng_effect", "phaseAfter");
	player.markSkill("qunyou_jicheng_effect");
}

export function qunyou_jicheng_canUseDuel(player) {
	return player.countCards("h") > 0 && game.hasPlayer((target) => target !== player && player.canUse({ name: "juedou" }, target, false));
}

export function qunyou_jicheng_options(player) {
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

export async function qunyou_jicheng_adjustHand(player) {
	const diff = player.countCards("h") - player.getHandcardLimit();
	if (diff > 0) {
		await player.chooseToDiscard("h", diff, true);
	} else if (diff < 0) {
		await player.draw(-diff);
	}
}

export function qunyou_jicheng_finishTurn(event, player) {
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

export function qunyou_lingzhen_limit(player, skill) {
	return Math.max(1, player.countSkill(skill));
}

export function qunyou_dusheng_getUnusedSuits(player) {
	const used = player.storage.qunyou_dusheng_used || [];
	return lib.suit.filter((suit) => !used.includes(suit));
}

export async function qunyou_dusheng_tryBinglin(actor, suit) {
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

export function qunyou_fenzi_maxHandPlayers() {
	let max = 0;
	game.filterPlayer((target) => {
		if (target.isIn()) {
			max = Math.max(max, target.countCards("h"));
		}
	});
	return game.filterPlayer((target) => target.isIn() && target.countCards("h") === max);
}

export async function qunyou_lingzhen_useLoop(player, skill, limit) {
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

export function qunyou_shenshi_getTurnDiscardCards(phase) {
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

export function qunyou_shenshi_areaTargets(card, player, source) {
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

export function qunyou_shenshi_canAddTarget(trigger, source, target) {
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

export function qunyou_shenshi_canRemoveTarget(trigger, target) {
	if (!trigger?.targets || !target?.isIn()) {
		return false;
	}
	return trigger.targets.includes(target) && trigger.targets.length > 1;
}

export function qunyou_jianjiang_isMinHand(target) {
	if (!target?.isIn()) {
		return false;
	}
	const num = target.countCards("h");
	return !game.hasPlayer((current) => current.isIn() && current.countCards("h") < num);
}

export function qunyou_jianjiang_getShownCards(target) {
	if (!target?.isIn()) {
		return [];
	}
	return target.getCards("h", (card) => get.is.shownCard(card));
}

export function qunyou_jianjiang_hasTaggedCard(player, tag) {
	return player.hasCard((card) => card.hasGaintag(tag), "h");
}

export function qunyou_jianjiang_syncHolder(target) {
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

export function qunyou_aoyue_vcards(player) {
	const list = [];
	const push = (name, nature) => {
		const card = get.autoViewAs({ name, nature, isCard: true }, "unsure");
		if (player.hasUseTarget(card, true, false)) {
			list.push([get.type(name) === "trick" ? "锦囊" : "基本", "", name, nature]);
		}
	};
	push("juedou");
	push("sha");
	for (const nature of lib.inpile_nature) {
		push("sha", nature);
	}
	return list;
}

export async function qunyou_aoyue_execute(player, skill) {
	player.awakenSkill(skill);
	await player.loseMaxHp();
	if (!player.isIn()) {
		return;
	}
	await player.recoverTo(player.maxHp);
	if (!player.isIn()) {
		return;
	}
	const result = await player
		.chooseTarget("翱月：你可获得至多两名角色各一张牌", [1, 2], (card, player, target) => {
			return target !== player && target.countCards("he");
		})
		.set("ai", (target) => {
			const player = get.player();
			return -get.attitude(player, target) / Math.max(1, target.countCards("he"));
		})
		.forResult();
	let gained = 0;
	if (result?.bool && result.targets?.length) {
		const targets = result.targets.slice().sortBySeat(player);
		for (const target of targets) {
			if (!player.isIn() || !target?.isIn() || !target.countCards("he")) {
				continue;
			}
			await player.gainPlayerCard(target, "he", true);
			gained++;
		}
	}
	if (!gained || !player.isIn() || !player.countCards("hes") || !qunyou_aoyue_vcards(player).length) {
		return;
	}
	player.storage.qunyou_aoyue_count = gained;
	player.addSkill("qunyou_aoyue_count");
	player.markSkill("qunyou_aoyue_count");
	player.addSkill("qunyou_aoyue_reset");
	while (player.isIn() && (player.storage.qunyou_aoyue_count || 0) > 0 && player.countCards("hes")) {
		const vcards = qunyou_aoyue_vcards(player);
		if (!vcards.length) {
			break;
		}
		const buttonResult = await player
			.chooseButton([`翱月：选择要视为使用的牌（剩余${player.storage.qunyou_aoyue_count}次）`, [vcards, "vcard"]])
			.set("ai", (button) => {
				const player = get.player();
				const card = { name: button.link[2], nature: button.link[3], isCard: true };
				return player.getUseValue(card, null, true);
			})
			.forResult();
		if (!buttonResult?.bool || !buttonResult.links?.length) {
			break;
		}
		const viewAs = get.autoViewAs({ name: buttonResult.links[0][2], nature: buttonResult.links[0][3], isCard: true }, "unsure");
		const backupName = "qunyou_aoyue_backup";
		game.broadcastAll(
			(name, card) => {
				lib.skill[name].viewAs = card;
			},
			backupName,
			viewAs
		);
		const next = player.chooseToUse();
		next.set("openskilldialog", `翱月：将一张牌当做【${get.translation(viewAs)}】使用`);
		next.set("norestore", true);
		next.set("_backupevent", backupName);
		next.set("custom", {
			add: {},
			replace: {
				window() {},
			},
		});
		next.backup(backupName);
		const useResult = await next.forResult();
		if (!useResult?.bool) {
			break;
		}
	}
	if (player.hasSkill("qunyou_aoyue_reset")) {
		player.removeSkill("qunyou_aoyue_reset");
	}
	if (player.hasSkill("qunyou_aoyue_count")) {
		player.removeSkill("qunyou_aoyue_count");
	}
}

export function qunyou_junming_usedBranches(player) {
	let storage = player.storage.qunyou_junming_used;
	if (!Array.isArray(storage)) {
		storage = [];
		player.storage.qunyou_junming_used = storage;
	}
	return storage;
}

export function qunyou_junming_hasUsed(player, branch) {
	return qunyou_junming_usedBranches(player).includes(branch);
}

export function qunyou_junming_markUsed(player, branch) {
	const storage = qunyou_junming_usedBranches(player);
	if (!storage.includes(branch)) {
		storage.push(branch);
	}
	player.addTempSkill("qunyou_junming_used", { global: "phaseAfter" });
	player.markSkill("qunyou_junming_used");
}

export function qunyou_zhihu_storage(player) {
	let storage = player.storage.qunyou_zhihu;
	if (!storage || typeof storage !== "object" || Array.isArray(storage)) {
		storage = {
			count: 0,
			mode: null,
			index: 0,
			syncing: false,
		};
		player.storage.qunyou_zhihu = storage;
	}
	return storage;
}

export function qunyou_zhihu_handCounts() {
	return game
		.filterPlayer((current) => current.isIn())
		.map((current) => current.countCards("h"))
		.sort((a, b) => b - a);
}

export function qunyou_zhihu_handCountsText() {
	const list = qunyou_zhihu_handCounts();
	return list.length ? list.join("、") : "0";
}

export function qunyou_zhihu_target(player) {
	const storage = qunyou_zhihu_storage(player);
	if (storage.mode === "one") {
		return 1;
	}
	if (storage.mode === "rank") {
		const list = qunyou_zhihu_handCounts();
		if (!list.length) {
			return 0;
		}
		const index = Math.max(0, Math.min(list.length - 1, (storage.index || 1) - 1));
		return list[index];
	}
	return null;
}

export function qunyou_zhihu_modeText(player) {
	const storage = qunyou_zhihu_storage(player);
	if (storage.mode === "one") {
		return "已恒为1张";
	}
	if (storage.mode === "rank") {
		return `已恒为第${get.cnNumber(storage.index || 1)}大（当前为${qunyou_zhihu_target(player)}张）`;
	}
	return "未固定";
}

export function qunyou_zhihu_noDamage(player, event) {
	return !player.hasHistory("sourceDamage", (evt) => evt.getParent("useCard") === event);
}

export async function qunyou_zhihu_sync(player) {
	const storage = qunyou_zhihu_storage(player);
	const target = qunyou_zhihu_target(player);
	if (storage.syncing || typeof target !== "number" || !player.isIn()) {
		return;
	}
	const current = player.countCards("h");
	if (current === target) {
		return;
	}
	storage.syncing = true;
	try {
		if (current < target) {
			await player.drawTo(target);
		} else {
			await player.chooseToDiscard(current - target, true, "h");
		}
	} finally {
		storage.syncing = false;
		if (player.hasSkill("qunyou_zhihu")) {
			player.markSkill("qunyou_zhihu");
		}
	}
}

export function qunyou_weitai_storage(player) {
	if (typeof player.storage.qunyou_weitai !== "boolean") {
		player.storage.qunyou_weitai = false;
	}
	return player.storage.qunyou_weitai;
}

export function qunyou_weitai_isSingleTarget(event) {
	return !!event.card && Array.isArray(event.targets) && event.targets.length === 1;
}

export function qunyou_weitai_viewAs(name, trigger) {
	const card = game.createCard({
		name,
		suit: get.suit(trigger.card, false) || lib.suit.randomGet(),
		number: get.number(trigger.card, false) || Math.ceil(Math.random() * 13),
	});
	return get.autoViewAs(card);
}

export function qunyou_huameng_skillList(target, player) {
	const list = (target.getStockSkills?.(true, true) || target.getSkills(null, false, false) || []).filter((skill) => {
		const info = get.info(skill);
		if (!info || !target.hasSkill(skill, null, null, false) || player.hasSkill(skill, null, null, false)) {
			return false;
		}
		if (info.charlotte || info.zhuSkill || info.juexingji || info.limited || info.hiddenSkill || info.dutySkill || info.persevereSkill) {
			return false;
		}
		return get.skillInfoTranslation(skill, player).length > 0;
	});
	return list.toUniqued();
}

export function qunyou_huameng_clear(player) {
	const skills = player.storage.qunyou_huameng_skills || [];
	if (skills.length) {
		player.removeAdditionalSkill("qunyou_huameng");
	}
	delete player.storage.qunyou_huameng_skills;
	player.unmarkSkill?.("qunyou_huameng");
	player.markSkill("qunyou_huameng");
}

export function qunyou_zhashu_storage(player) {
	const storage = player.storage.qunyou_zhashu;
	if (storage && typeof storage === "object" && !Array.isArray(storage)) {
		return storage;
	}
	player.storage.qunyou_zhashu = { target: null };
	return player.storage.qunyou_zhashu;
}

export function qunyou_zhashu_cards(player) {
	return player.getCards("h", (card) => card.hasGaintag("qunyou_zhashu"));
}

export function qunyou_zhashu_clear(player) {
	const cards = qunyou_zhashu_cards(player);
	if (cards.length) {
		player.removeGaintag("qunyou_zhashu", cards);
	}
	delete player.storage.qunyou_zhashu;
	player.unmarkSkill?.("qunyou_zhashu");
	player.markSkill("qunyou_zhashu");
}

export function getTurnDiscardCards() {
	const cards = [];
	const addCard = (card) => {
		if (cards.includes(card)) return;
		if (get.position(card, true) !== "d") return;
		cards.push(card);
	};
	const currentPhase = _status.event?.getParent("phase");
	const currentPlayer = currentPhase?.player;
	if (!currentPlayer) return cards;
	for (const target of game.filterPlayer()) {
		target.getHistory("lose", (evt) => {
			if (evt.position != ui.discardPile) return false;
			const p = evt.getParent("phase");
			if (!p || p.player !== currentPlayer) return false;
			(evt.cards2 || evt.cards || []).forEach(addCard);
		});
	}
	game.getGlobalHistory("cardMove", (evt) => {
		if (evt.name != "cardsDiscard") return false;
		const p = evt.getParent("phase");
		if (!p || p.player !== currentPlayer) return false;
		(evt.cards || []).forEach(addCard);
	});
	return cards;
}

export function qunyou_getDiscardSuits() {
	const suits = new Set();
	if (_status.discarded) {
		_status.discarded.forEach(c => suits.add(get.suit(c, false)));
	}
	return suits;
}

// ====== 燼路 交换UI ======
export async function jinluSwapUI(player) {
	return new Promise(resolve => {
		const left = player.storage.qunyou_mitu_left;
		const right = player.storage.qunyou_mitu_right;
		const originalLeft = left.slice();
		const originalRight = right.slice();
		let selected = { index: -1, side: "" };
		let phase = "select";
		let controls = null;
		const dialog = ui.create.dialog("hidden");
		dialog.add('<div class="text center" style="padding:8px 0;font-size:16px;font-weight:bold;">燼路：点击两个阶段块进行对调</div>');
		const grid = ui.create.div();
		grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;";
		dialog.content.appendChild(grid);
		function makeBlock(index, side, phaseId) {
			const div = ui.create.div(".shadowed.reduce_radius.pointerdiv.tdnode");
			const name = get.translation(phaseId).replace("阶段", "");
			div.style.cssText = "padding:16px;text-align:center;font-size:15px;border-radius:8px;cursor:pointer;background:#2196F3;color:white;font-weight:bold;transition:all .2s;user-select:none;";
			div.textContent = name;
			div.dataset.index = index;
			div.dataset.side = side;
			div.addEventListener(lib.config.touchscreen ? "touchend" : "click", e => {
				e.stopPropagation();
				if (phase === "swapped") return;
				const idx = parseInt(div.dataset.index);
				const sd = div.dataset.side;
				if (selected.index === -1) {
					selected = { index: idx, side: sd };
					div.style.background = "#F44336";
				} else if (selected.index === idx && selected.side === sd) {
					div.style.background = "#2196F3";
					selected = { index: -1, side: "" };
				} else {
					const a1 = selected.side === "left" ? left : right;
					const a2 = sd === "left" ? left : right;
					const tmp = a1[selected.index];
					a1[selected.index] = a2[idx];
					a2[idx] = tmp;
					phase = "swapped";
					selected = { index: -1, side: "" };
					render();
					updateControls(true);
				}
			});
			return div;
		}
		function render() {
			grid.innerHTML = "";
			for (let i = 0; i < 3; i++) {
				grid.appendChild(makeBlock(i, "left", left[i]));
				grid.appendChild(makeBlock(i, "right", right[i]));
			}
		}
		function updateControls(hasSwapped) {
			if (controls) controls.close();
			const labels = hasSwapped ? ["取消", "确定", "撤销"] : ["取消"];
			controls = ui.create.control(...labels, link => {
				if (link === "撤销") {
					left.length = 0; left.push(...originalLeft);
					right.length = 0; right.push(...originalRight);
					phase = "select";
					selected = { index: -1, side: "" };
					render();
					updateControls(false);
					return;
				}
				if (link === "取消") {
					left.length = 0; left.push(...originalLeft);
					right.length = 0; right.push(...originalRight);
					resolve({ bool: false });
				} else if (link === "确定") {
					resolve({ bool: true, swapped: true });
				}
				dialog.close();
				if (controls) controls.close();
				_status.imchoosing = false;
			});
		}
		render();
		updateControls(false);
		dialog.open();
		_status.imchoosing = true;
	});
}
