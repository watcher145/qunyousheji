/**
 * 技能本体：export const skills = { skill_id: { ... }, ... }
 * 与奇臣传相同，在此集中编写；译名与 *_info 写在 ../translate/skill.js
 */
import { lib, game, get, ui, _status } from "noname";

async function qunyou_gouxian_useDamageCards(player, target, cards) {
	for (const card of cards) {
		if (get.itemtype(card) !== "card") continue;
		await player.gain([card]);
		const next = player.useCard(card, target);
		if (next) await next;
	}
}

function qunyou_validNumber(card, player) {
	const num = get.number(card, player);
	return Number.isInteger(num) && num >= 1 && num <= 13 ? num : null;
}

function qunyou_numberText(num) {
	if (num === 1) return "A";
	if (num === 11) return "J";
	if (num === 12) return "Q";
	if (num === 13) return "K";
	return String(num);
}

async function qunyou_adjustHpTo(player, target) {
	target = Math.max(0, target);
	if (player.hp < target) return player.recover(target - player.hp);
	if (player.hp > target) return player.loseHp(player.hp - target);
}

async function qunyou_adjustHandTo(player, target) {
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

function qunyou_cycleState(player, skill) {
	const key = `${skill}_state`;
	const current = Number.isInteger(player.storage[key]) ? player.storage[key] : 0;
	player.storage[key] = (current + 1) % 3;
	player.updateMarks(skill);
}

function qunyou_getState(player, skill) {
	const key = `${skill}_state`;
	if (!Number.isInteger(player.storage[key])) player.storage[key] = 0;
	return player.storage[key];
}

function qunyou_getLastNumber(player, skill) {
	const key = `${skill}_lastNumber`;
	return Number.isInteger(player.storage[key]) ? player.storage[key] : null;
}

function qunyou_setLastNumber(player, skill, number) {
	const key = `${skill}_lastNumber`;
	if (Number.isInteger(number)) player.storage[key] = number;
}

function qunyou_getPreviousUseNumber(player, event) {
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

function qunyou_jingce_storage(player) {
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

function qunyou_jingce_peek(player) {
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

function qunyou_jingce_clear(player) {
	const key = "qunyou_jingce_data";
	player.storage[key] = {
		suits: [],
		types: [],
		drawn: [],
	};
	player.syncStorage(key);
	player.updateMarks("qunyou_jingce_mark");
}

function qunyou_jingce_recordUse(player, card) {
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

function qunyou_jingce_targetCount(player) {
	const storage = qunyou_jingce_storage(player);
	return player.storage.qunyou_jingce ? storage.types.length : storage.suits.length;
}

function qunyou_jingce_modeText(player) {
	return player.storage.qunyou_jingce ? "阴：类别数" : "阳：花色数";
}

function qunyou_jingce_usedSuitsText(player) {
	const suits = qunyou_jingce_peek(player).suits;
	return suits.length ? suits.map((suit) => get.translation(suit)).join("、") : "无";
}

function qunyou_jingce_usedTypesText(player) {
	const types = qunyou_jingce_peek(player).types;
	return types.length ? types.map((type) => get.translation(type)).join("、") : "无";
}

function qunyou_zhuoqu_numbers(player) {
	const key = "qunyou_zhuoqu_numbers";
	if (!Array.isArray(player.storage[key])) player.storage[key] = [];
	return player.storage[key];
}

function qunyou_zhuoqu_addNumber(player, number) {
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

function qunyou_zhuoqu_removeNumbers(player, numbers) {
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

function qunyou_zhuoqu_numberText(player) {
	const list = Array.isArray(player.storage.qunyou_zhuoqu_numbers) ? player.storage.qunyou_zhuoqu_numbers : [];
	return list.length ? list.map(num => get.strNumber(num)).join("、") : "无";
}

function qunyou_zhuoqu_cardNumbers(card, player) {
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

function qunyou_zhuoqu_isCurrentUse() {
	const evt = get.event();
	if (!evt) return false;
	if (evt.skill === "qunyou_zhuoqu" || evt.skill === "qunyou_zhuoqu_backup") return true;
	const parent = evt.getParent?.();
	return parent?.skill === "qunyou_zhuoqu" || parent?.skill === "qunyou_zhuoqu_backup";
}

function qunyou_zhuoqu_isBlocked(player, card) {
	const blocked = Array.isArray(player.storage.qunyou_zhuoqu_numbers) ? player.storage.qunyou_zhuoqu_numbers : [];
	return qunyou_zhuoqu_cardNumbers(card, player).some((num) => blocked.includes(num));
}

function qunyou_zhuoqu_getUsedNumber(event, player) {
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

function qunyou_zhuoqu_isOutsideDiscardPhase(event) {
	if (!event?.getParent) return true;
	for (let i = 1; i <= 6; i++) {
		const parent = event.getParent(i);
		if (!parent) break;
		if (parent.name === "phaseDiscard") return false;
		if (["phaseUse", "phaseDraw", "phaseJudge", "phaseZhunbei", "phaseJieshu"].includes(parent.name)) return true;
	}
	return true;
}

function qunyou_zhuoqu_discardedNumbers(event, player) {
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

function qunyou_isPositiveMultiple(number, base) {
	return Number.isInteger(number) && Number.isInteger(base) && base > 0 && number % base === 0;
}

function qunyou_gainCount(event, player) {
	return (event.getg?.(player) || []).length;
}

function qunyou_haoxianFieldCandidates(player, number) {
	const list = [];
	for (const target of game.filterPlayer((current) => current !== player)) {
		for (const card of target.getCards("ej", (card) => qunyou_validNumber(card, target) === number)) {
			list.push({ card, owner: target });
		}
	}
	return list;
}

function qunyou_haoxianHandCandidates(player, number) {
	const list = [];
	for (const target of game.filterPlayer((current) => current !== player)) {
		for (const card of target.getCards("h", (card) => qunyou_validNumber(card, target) === number)) {
			list.push({ card, owner: target });
		}
	}
	return list;
}

function qunyou_haoxianPileCandidates(pile, number) {
	if (!pile?.childNodes?.length) {
		return [];
	}
	return Array.from(pile.childNodes).filter((card) => qunyou_validNumber(card, false) === number);
}

function qunyou_haoxianCanGain(player, number) {
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

async function qunyou_haoxianGainSequential(player, number, count) {
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

function qunyou_taowei_useCards(player, event) {
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

function qunyou_taowei_handCardsBeforeUse(event, player) {
	if (Array.isArray(event?.hs) && event.hs.length) {
		return event.hs.filter(card => get.itemtype(card) === "card");
	}
	const cards = player.getCards("h").slice();
	for (const card of qunyou_taowei_useCards(player, event)) {
		if (!cards.includes(card)) cards.push(card);
	}
	return cards;
}

function qunyou_taowei_currentMaxNumber(event, player) {
	const numbers = qunyou_taowei_handCardsBeforeUse(event, player)
		.map(card => qunyou_validNumber(card, player))
		.filter(num => Number.isInteger(num));
	if (!numbers.length) return null;
	return Math.max(...numbers);
}

function qunyou_taowei_matchStage(player, event, stage) {
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

function qunyou_taowei_reuseCard(player, event) {
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

async function qunyou_taowei_compare(player, target, card) {
	return await player
		.chooseToCompare(target)
		.set("fixedResult", { [player.playerid]: card })
		.forResult();
}

function qunyou_hanguo_visibleTag() {
	return "visible_qunyou_hanguo";
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
	return cards.filter((card) => get.name(card) === "shan");
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

function qunyou_zhouli_topCards(count = 1) {
	return Array.from(ui.cardPile.childNodes).slice(0, count);
}

function qunyou_zhouli_bottomCards(count = 1) {
	const cards = Array.from(ui.cardPile.childNodes);
	return count > 0 ? cards.slice(-count) : [];
}

async function qunyou_zhouli_reveal(player, cards, skill) {
	if (!cards?.length) {
		return;
	}
	await player.showCards(cards, `${get.translation(player)}发动了【${get.translation(skill)}】`);
}

async function qunyou_zhouli_activate(player, skill = "qunyou_zhouli") {
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

async function qunyou_yunxian_sameColorActivate(player, cards) {
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

function qunyou_aoyue_vcards(player) {
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

async function qunyou_aoyue_execute(player, skill) {
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

function qunyou_junming_usedBranches(player) {
	let storage = player.storage.qunyou_junming_used;
	if (!Array.isArray(storage)) {
		storage = [];
		player.storage.qunyou_junming_used = storage;
	}
	return storage;
}

function qunyou_junming_hasUsed(player, branch) {
	return qunyou_junming_usedBranches(player).includes(branch);
}

function qunyou_junming_markUsed(player, branch) {
	const storage = qunyou_junming_usedBranches(player);
	if (!storage.includes(branch)) {
		storage.push(branch);
	}
	player.addTempSkill("qunyou_junming_used", { global: "phaseAfter" });
	player.markSkill("qunyou_junming_used");
}

function qunyou_zhihu_storage(player) {
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

function qunyou_zhihu_handCounts() {
	return game
		.filterPlayer((current) => current.isIn())
		.map((current) => current.countCards("h"))
		.sort((a, b) => b - a);
}

function qunyou_zhihu_handCountsText() {
	const list = qunyou_zhihu_handCounts();
	return list.length ? list.join("、") : "0";
}

function qunyou_zhihu_target(player) {
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

function qunyou_zhihu_modeText(player) {
	const storage = qunyou_zhihu_storage(player);
	if (storage.mode === "one") {
		return "已恒为1张";
	}
	if (storage.mode === "rank") {
		return `已恒为第${get.cnNumber(storage.index || 1)}大（当前为${qunyou_zhihu_target(player)}张）`;
	}
	return "未固定";
}

function qunyou_zhihu_noDamage(player, event) {
	return !player.hasHistory("sourceDamage", (evt) => evt.getParent("useCard") === event);
}

async function qunyou_zhihu_sync(player) {
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

function qunyou_weitai_storage(player) {
	if (typeof player.storage.qunyou_weitai !== "boolean") {
		player.storage.qunyou_weitai = false;
	}
	return player.storage.qunyou_weitai;
}

function qunyou_weitai_isSingleTarget(event) {
	return !!event.card && Array.isArray(event.targets) && event.targets.length === 1;
}

function qunyou_weitai_viewAs(name, trigger) {
	const card = game.createCard({
		name,
		suit: get.suit(trigger.card, false) || lib.suit.randomGet(),
		number: get.number(trigger.card, false) || Math.ceil(Math.random() * 13),
	});
	return get.autoViewAs(card);
}

function qunyou_huameng_skillList(target, player) {
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

function qunyou_huameng_clear(player) {
	const skills = player.storage.qunyou_huameng_skills || [];
	if (skills.length) {
		player.removeAdditionalSkill("qunyou_huameng");
	}
	delete player.storage.qunyou_huameng_skills;
	player.unmarkSkill?.("qunyou_huameng");
	player.markSkill("qunyou_huameng");
}

function qunyou_zhashu_storage(player) {
	const storage = player.storage.qunyou_zhashu;
	if (storage && typeof storage === "object" && !Array.isArray(storage)) {
		return storage;
	}
	player.storage.qunyou_zhashu = { target: null };
	return player.storage.qunyou_zhashu;
}

function qunyou_zhashu_cards(player) {
	return player.getCards("h", (card) => card.hasGaintag("qunyou_zhashu"));
}

function qunyou_zhashu_clear(player) {
	const cards = qunyou_zhashu_cards(player);
	if (cards.length) {
		player.removeGaintag("qunyou_zhashu", cards);
	}
	delete player.storage.qunyou_zhashu;
	player.unmarkSkill?.("qunyou_zhashu");
	player.markSkill("qunyou_zhashu");
}

function getTurnDiscardCards() {
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

export const skills = {
	qunyou_shenshi: {
		audio: 2,
		trigger: { target: "useCardToTargeted" },
		direct: true,
		ai: {
			order: 5,
			result: { player: 1 },
		},
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
				.set("ai", () => player.countCards("he") >= 5 ? 1 : 0)
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
					.set("ai", () => player.countCards("he") >= 5 ? "交换角色区域里的牌" : "交换本回合弃牌堆的牌")
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
						.set("ai", () => "添加或减少其为此牌目标")
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
	trigger: { global: "roundStart" },
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
		direct: true,
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
		ai: {
			order: 5,
			result: { player: 1 },
		},
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
			const controls = ["不可响应", "结算后摸三张牌", "伤害+1"];
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
		ai: {
			order: 5,
			result: { player: 1 },
		},
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
			if (!player.hasSkill("qunyou_muxin_turn")) {
				player.addTempSkill("qunyou_muxin_turn", "phaseAfter");
				player.storage.qunyou_muxin_turn_cards = [];
			}
			player.storage.qunyou_muxin_turn_cards.push(selfCard, ...shown.map(i => i.card));
			player.storage.qunyou_muxin_turn_count = (player.storage.qunyou_muxin_turn_count || 0) + 1;
			if (player.storage.qunyou_muxin_turn_count >= 3) {
				const gainCards = player.storage.qunyou_muxin_turn_cards.filter(c => {
					const owner = get.owner(c);
					return owner && owner !== player && get.itemtype(c) === "card";
				});
				if (gainCards.length) {
					await player.gain(gainCards, "gain2");
				}
				player.addTempSkill("qunyou_muxin_disabled", "phaseAfter");
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
			turn: {
				charlotte: true,
				onremove(player) {
					delete player.storage.qunyou_muxin_turn_count;
					delete player.storage.qunyou_muxin_turn_cards;
				},
			},
		},
	},
	qunyou_cangxiao: {
		audio: 2,
		trigger: { player: "gainAfter" },
		direct: true,
		ai: {
			order: 5,
			result: { player: 1 },
		},
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
					if (choices.length > 1) {
						const att = get.attitude(get.player(), player);
						if (att > 0) return "令其加1点体力上限";
					}
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
						.set("ai", () => qunyou_yaliang_delayed(player, "draw") === 0 ? 1 : 0)
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
		ai: {
			order: 5,
			result: { player: 1 },
		},
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
				trigger: { global: ["loseAfter", "loseAsyncAfter"] },
				direct: true,
				filter(event, player) {
					if (_status.currentPhase !== player) return false;
					if (event.name === "loseAfter" && event.getParent("loseAsync")) return false;
					return qunyou_jidu_discardedShan(event).length > 0;
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
							count -= 2;
							break;
						}
						count -= 2;
						const target = result.targets[0];
						player.logSkill("qunyou_jidu", target);
						target.addTempSkill("qunyou_jidu_effect", { player: ["damageAfter", "damageZero", "dieAfter"] });
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
		ai: {
			order: 5,
			result: { player: 1 },
		},
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
		ai: {
			order: 5,
			result: { player: 1 },
		},
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
		ai: {
			order: 5,
			result: { player: 1 },
		},
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
trigger: { global: ["loseAfter", "cardsDiscardAfter"] },
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
				return storage
					? "阴：每轮你使用第奇数张牌结算后，失去本回合你已使用牌的花色数点体力。你回复体力溢出时，摸溢出值张牌；因失去体力进入濒死状态时，摸场上已受伤角色数张牌。"
					: "阳：每轮你使用第奇数张牌结算后，回复本回合你已使用牌的花色数点体力。你回复体力溢出时，摸溢出值张牌；因失去体力进入濒死状态时，摸场上已受伤角色数张牌。";
			},
		},
		trigger: { player: "useCardAfter" },
		forced: true,
		filter(event, player) {
			return player.getRoundHistory("useCard").length % 2 === 1;
		},
		async content(event, trigger, player) {
			const suits = player.getHistory("useCard").reduce((list, evt) => {
				const suit = get.suit(evt.card);
				if (lib.suit.includes(suit) && !list.includes(suit)) list.push(suit);
				return list;
			}, []);
			const num = suits.length;
			if (num <= 0) return;
			if (player.storage.qunyou_xianzhan) {
				await player.loseHp(num);
			} else {
				const beforeHp = player.hp;
				await player.recover(num);
				const overflow = num - (player.hp - beforeHp);
				if (overflow > 0) {
					await player.draw(overflow);
				}
			}
			player.changeZhuanhuanji("qunyou_xianzhan");
		},
		group: "qunyou_xianzhan_dying",
		subSkill: {
			dying: {
				trigger: { player: "dying" },
				forced: true,
				popup: false,
				filter(event, player) {
					const loseHp = event.getParent("loseHp");
					if (!loseHp) return false;
					const trigger = loseHp.getParent("trigger");
					return trigger && trigger.skill === "qunyou_xianzhan";
				},
				async content(event, trigger, player) {
					const injured = game.players.filter(p => p.isDamaged()).length;
					if (injured > 0) await player.draw(injured);
				},
			},
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
				return storage
					? "阴：你使用装备牌或牌名字数不小于体力值的牌后，摸一半的手牌。"
					: "阳：你使用装备牌或牌名字数不小于体力值的牌后，弃一半的手牌。";
			},
		},
		trigger: { player: "useCardAfter" },
		forced: true,
		filter(event, player) {
			if (get.type2(event.card) === "equip") return true;
			return qunyou_cardNameLength(event.card, player) >= player.hp;
		},
		async content(event, trigger, player) {
			if (player.storage.qunyou_zhouxuan) {
				const half = Math.ceil(player.countCards("h") / 2);
				if (half <= 0) return;
				await player.draw(half);
			} else {
				const half = Math.floor(player.countCards("h") / 2);
				if (half <= 0) return;
				await player.chooseToDiscard("h", true, half);
			}
			const myCount = player.countCards("h");
			const allCounts = game.players.map(p => p.countCards("h"));
			const isMax = allCounts.every(c => myCount >= c);
			const isMin = allCounts.every(c => myCount <= c);
			if (isMax || isMin) {
				const result = await player.chooseTarget("周旋：对一名角色造成1点伤害", true).forResult();
				if (result.bool) {
					await result.targets[0].damage(1, player);
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
					? "阴：出牌阶段结束时，若手牌数不大于体力值，你的下个阶段改为摸牌阶段，否则你从游戏外获得一张【随机应变】，进入弃牌堆后销毁之。"
					: "阳：出牌阶段结束时，若手牌数不大于体力值，你的下个阶段改为出牌阶段，否则你从游戏外获得一张【涯角枪】，进入弃牌堆后销毁之。";
			},
		},
		trigger: { player: "phaseUseEnd" },
		forced: true,
		async content(event, trigger, player) {
			if (player.countCards("h") <= player.hp) {
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
		ai: {
			order: 5,
			result: { player: 1 },
		},
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
		ai: {
			order: 5,
			result: { player: 1 },
		},
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
	qunyou_aoyue: {
		audio: 2,
		limited: true,
		skillAnimation: true,
		animationColor: "water",
		enable: "phaseUse",
		filter(event, player) {
			return !player.awakenedSkills.includes("qunyou_aoyue") && player.maxHp > 1;
		},
		async content(event, trigger, player) {
			await qunyou_aoyue_execute(player, event.name);
		},
		subSkill: {
			dying: {
				audio: "qunyou_aoyue",
				trigger: { player: "dying" },
				direct: true,
				filter(event, player) {
					return !player.awakenedSkills.includes("qunyou_aoyue") && player.maxHp > 1;
				},
				async content(event, trigger, player) {
					const result = await player.chooseBool(get.prompt2("qunyou_aoyue")).set("choice", true).forResult();
					if (!result?.bool) {
						return;
					}
					player.logSkill("qunyou_aoyue");
					await qunyou_aoyue_execute(player, "qunyou_aoyue");
				},
				sub: true,
			},
			backup: {
				filterCard(card) {
					return get.itemtype(card) === "card";
				},
				position: "hes",
				selectCard: 1,
				popname: true,
				log: false,
				check(card) {
					return 8 - get.value(card);
				},
				precontent(event, trigger, player) {
					player.storage.qunyou_aoyue_count = Math.max(0, (player.storage.qunyou_aoyue_count || 0) - 1);
					player.markSkill("qunyou_aoyue_count");
				},
				sub: true,
			},
			count: {
				charlotte: true,
				mark: true,
				marktext: "月",
				intro: {
					content(_storage, player) {
						return `本次“翱月”还可将${player.storage.qunyou_aoyue_count || 0}张牌当【杀】或【决斗】使用`;
					},
				},
				onremove(player) {
					delete player.storage.qunyou_aoyue_count;
				},
				sub: true,
			},
			reset: {
				charlotte: true,
				trigger: { source: "damageSource" },
				forced: true,
				locked: false,
				popup: false,
				filter(event, player) {
					return !!event.getParent("qunyou_aoyue_backup") && player.awakenedSkills.includes("qunyou_aoyue");
				},
				content(event, trigger, player) {
					player.restoreSkill("qunyou_aoyue");
					game.log(player, "重置了〖翱月〗");
					player.removeSkill(event.name);
				},
				sub: true,
			},
		},
		ai: {
			order: 7.5,
			result: {
				player(player) {
					return player.hp <= 2 ? 2 : 1;
				},
			},
		},
	},
	qunyou_junming: {
		audio: 2,
		ai: {
			order: 5,
			result: { player: 1 },
		},
		group: ["qunyou_junming_gain", "qunyou_junming_recover"],
		subSkill: {
			gain: {
				audio: "qunyou_junming",
				trigger: { player: "gainAfter" },
				direct: true,
				filter(event, player) {
					if (qunyou_junming_hasUsed(player, "gain")) {
						return false;
					}
					if (!(event.getg?.(player) || []).length) {
						return false;
					}
					if (_status.currentPhase === player && event.getParent("phaseDraw")) {
						return false;
					}
					return game.hasPlayer((target) => target.hp <= player.hp && target.isDamaged());
				},
				async content(event, trigger, player) {
					const result = await player
						.chooseTarget("隽鸣：你可令一名体力值不大于你的角色回复1点体力", (card, player, target) => {
							return target.hp <= player.hp && target.isDamaged();
						})
						.set("ai", (target) => {
							const player = get.player();
							return get.recoverEffect(target, player, player);
						})
						.forResult();
					if (!result?.bool || !result.targets?.length) {
						return;
					}
					qunyou_junming_markUsed(player, "gain");
					player.logSkill("qunyou_junming", result.targets);
					await result.targets[0].recover();
				},
				sub: true,
			},
			recover: {
				audio: "qunyou_junming",
				trigger: { player: "recoverAfter" },
				direct: true,
				filter(event, player) {
					if (qunyou_junming_hasUsed(player, "recover") || _status.currentPhase === player || !event.num) {
						return false;
					}
					return game.hasPlayer((target) => target.hp <= player.hp);
				},
				async content(event, trigger, player) {
					const result = await player
						.chooseTarget("隽鸣：你可令一名体力值不大于你的角色摸一张牌", (card, player, target) => {
							return target.hp <= player.hp;
						})
						.set("ai", (target) => {
							const player = get.player();
							return get.attitude(player, target);
						})
						.forResult();
					if (!result?.bool || !result.targets?.length) {
						return;
					}
					qunyou_junming_markUsed(player, "recover");
					player.logSkill("qunyou_junming", result.targets);
					await result.targets[0].draw();
				},
				sub: true,
			},
			used: {
				charlotte: true,
				mark: true,
				marktext: "鸣",
				intro: {
					content(storage) {
						const list = Array.isArray(storage) ? storage.slice() : [];
						if (!list.length) {
							return "本回合未发动过“隽鸣”";
						}
						const text = [];
						if (list.includes("gain")) {
							text.push("已发动过得牌分支");
						}
						if (list.includes("recover")) {
							text.push("已发动过回复分支");
						}
						return text.join("；");
					},
				},
				onremove(player) {
					delete player.storage.qunyou_junming_used;
				},
				sub: true,
			},
		},
	},
	qunyou_zhihu: {
		audio: 2,
		forced: true,
		locked: true,
		mark: true,
		marktext: "虎",
		intro: {
			content(storage, player) {
				return [
					`固定状态：${qunyou_zhihu_modeText(player)}`,
					`全场手牌排序：${qunyou_zhihu_handCountsText()}`,
					`本轮未造成伤害牌数：${qunyou_zhihu_storage(player).count || 0}`,
				].join("<br>");
			},
		},
		init(player) {
			qunyou_zhihu_storage(player);
		},
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			return !!event.card && qunyou_zhihu_noDamage(player, event);
		},
		async content(event, trigger, player) {
			const storage = qunyou_zhihu_storage(player);
			storage.count = (storage.count || 0) + 1;
			player.markSkill("qunyou_zhihu");
			const index = storage.count;
			const list = qunyou_zhihu_handCounts();
			const rankValue = list[Math.max(0, Math.min(list.length - 1, index - 1))] ?? 0;
			const rankChoice = `恒为第${get.cnNumber(index)}大（${rankValue}张）`;
			const choices = ["恒为1张", rankChoice];
			const result = await player
				.chooseControl(choices)
				.set("prompt", `纸虎：请选择令手牌数永久恒为的一项`)
				.set("ai", () => {
					const player = get.player();
					const current = player.countCards("h");
					const rankValue = get.event().rankValue;
					const rankChoice = get.event().rankChoice;
					if (rankValue > current && rankValue >= 2) {
						return rankChoice;
					}
					return "恒为1张";
				})
				.set("rankChoice", rankChoice)
				.set("rankValue", rankValue)
				.forResult();
			if (!result?.control) {
				return;
			}
			if (result.control === "恒为1张") {
				storage.mode = "one";
				storage.index = 1;
			} else {
				storage.mode = "rank";
				storage.index = index;
			}
			player.markSkill("qunyou_zhihu");
			await qunyou_zhihu_sync(player);
		},
		group: ["qunyou_zhihu_round", "qunyou_zhihu_sync"],
		subSkill: {
			round: {
				charlotte: true,
				trigger: { global: "roundStart" },
				forced: true,
				popup: false,
				content(event, trigger, player) {
					qunyou_zhihu_storage(player).count = 0;
					player.markSkill("qunyou_zhihu");
				},
				sub: true,
			},
			sync: {
				charlotte: true,
				trigger: {
					player: ["gainAfter", "loseAfter"],
					global: [
						"equipAfter",
						"addJudgeAfter",
						"gainAfter",
						"loseAsyncAfter",
						"addToExpansionAfter",
						"cardsDiscardAfter",
						"dieAfter",
						"changeHpAfter",
					],
				},
				forced: true,
				popup: false,
				filter(event, player) {
					const storage = qunyou_zhihu_storage(player);
					return !!storage.mode && !storage.syncing;
				},
				async content(event, trigger, player) {
					await qunyou_zhihu_sync(player);
				},
				sub: true,
			},
		},
		onremove(player) {
			delete player.storage.qunyou_zhihu;
		},
	},
	qunyou_weitai: {
		audio: 2,
		forced: true,
		locked: true,
		mark: true,
		marktext: "危",
		intro: {
			content(storage, player) {
				return qunyou_weitai_storage(player) ? "本阶段已获得牌：单目标牌将改按对应牌结算" : "本阶段未获得牌";
			},
		},
		init(player) {
			qunyou_weitai_storage(player);
		},
		group: ["qunyou_weitai_gain", "qunyou_weitai_clear", "qunyou_weitai_use", "qunyou_weitai_target"],
		subSkill: {
			gain: {
				charlotte: true,
				trigger: { player: "gainAfter" },
				forced: true,
				popup: false,
				filter(event, player) {
					return (event.getg?.(player) || []).length > 0;
				},
				content(event, trigger, player) {
					player.storage.qunyou_weitai = true;
					player.markSkill("qunyou_weitai");
				},
				sub: true,
			},
			clear: {
				charlotte: true,
				trigger: { global: ["phaseZhunbeiBegin", "phaseJudgeBegin", "phaseDrawBegin", "phaseUseBegin", "phaseDiscardBegin", "phaseJieshuBegin", "phaseAfter"] },
				forced: true,
				popup: false,
				content(event, trigger, player) {
					player.storage.qunyou_weitai = false;
					player.markSkill("qunyou_weitai");
				},
				sub: true,
			},
			use: {
				audio: "qunyou_weitai",
				trigger: { player: "useCard2" },
				forced: true,
				filter(event, player) {
					return qunyou_weitai_storage(player) && qunyou_weitai_isSingleTarget(event) && get.name(event.card, player) !== "juedou";
				},
				content(event, trigger, player) {
					trigger.card = qunyou_weitai_viewAs("juedou", trigger);
					game.log(player, "使用的单目标牌按", "#y决斗", "结算");
				},
				sub: true,
			},
			target: {
				audio: "qunyou_weitai",
				trigger: { target: "useCardToTargeted" },
				forced: true,
				filter(event, player) {
					return qunyou_weitai_storage(player) && qunyou_weitai_isSingleTarget(event.getParent?.() || event) && get.name(event.card, event.player) !== "chenhuodajie";
				},
				content(event, trigger, player) {
					const useEvent = trigger.getParent();
					if (useEvent?.card) {
						useEvent.card = qunyou_weitai_viewAs("chenhuodajie", useEvent);
						trigger.card = useEvent.card;
						game.log(useEvent.player, "对", player, "使用的单目标牌按", "#y趁火打劫", "结算");
					}
				},
				sub: true,
			},
		},
		onremove(player) {
			delete player.storage.qunyou_weitai;
		},
	},
	qunyou_luzhan: {
		audio: 2,
		ai: {
			order: 7,
			result: { player: 1 },
		},
		enable: "chooseToUse",
		hiddenCard(player, name) {
			if (name === "juedou") {
				return player.countCards("hs", card => get.type(card, null, false) === "trick") > 0;
			}
			if (name === "jiu") {
				return player.countCards("hs", card => card.name === "sha") > 0;
			}
			return false;
		},
		filter(event, player) {
			const list = [];
			if (player.countCards("hs", card => get.type(card, null, false) === "trick")) {
				list.push({ name: "juedou", isCard: true, storage: { qunyou_luzhan: true, qunyou_luzhan_as: "juedou" } });
			}
			if (player.countCards("hs", card => card.name === "sha")) {
				list.push({ name: "jiu", isCard: true, storage: { qunyou_luzhan: true, qunyou_luzhan_as: "jiu" } });
			}
			return list.some(card => event.filterCard(card, player, event));
		},
		chooseButton: {
			dialog(event, player) {
				const list = [];
				if (player.countCards("hs", card => get.type(card, null, false) === "trick") > 0) {
					list.push(["锦囊", "", "juedou"]);
				}
				if (player.countCards("hs", card => card.name === "sha") > 0) {
					list.push(["基本", "", "jiu"]);
				}
				return ui.create.dialog("屡战", [list, "vcard"], "hidden");
			},
			filter(button, player) {
				const evt = get.event().getParent();
				const link = button.link;
				return evt.filterCard(get.autoViewAs({ name: link[2], nature: link[3], storage: { qunyou_luzhan: true, qunyou_luzhan_as: link[2] } }, "unsure"), player, evt);
			},
			check(button) {
				const link = button.link;
				return get.player().getUseValue(get.autoViewAs({ name: link[2], nature: link[3] }, "unsure"));
			},
			backup(links) {
				const name = links[0][2];
				const nature = links[0][3];
				return {
					audio: "qunyou_luzhan",
					popname: true,
					position: "hs",
					filterCard(card) {
						if (name === "juedou") {
							return get.type(card, null, false) === "trick";
						}
						return card.name === "sha";
					},
					check(card) {
						return 7 - get.value(card);
					},
					viewAs: {
						name,
						nature,
						isCard: true,
						storage: { qunyou_luzhan: true, qunyou_luzhan_as: name },
					},
				};
			},
			prompt(links) {
				return "将一张手牌当做" + (get.translation(links[0][3]) || "") + get.translation(links[0][2]) + "使用";
			},
		},
		group: ["qunyou_luzhan_duel_window", "qunyou_luzhan_jiu_window"],
		subSkill: {
			duel_window: {
				charlotte: true,
				trigger: { player: "useCard1" },
				forced: true,
				popup: false,
				filter(event, player) {
					return event.card?.storage?.qunyou_luzhan_as === "juedou";
				},
				content(event, trigger, player) {
					player.storage.qunyou_luzhan_duel_card = trigger.card;
					player.addSkill("qunyou_luzhan_duel_state");
				},
				sub: true,
			},
			duel_state: {
				charlotte: true,
				mark: true,
				marktext: "战",
				intro: {
					content: "当前这张【决斗】结算结束前，手牌中的【杀】视为【酒】",
				},
				mod: {
					cardname(card) {
						if (get.position(card) !== "h") {
							return;
						}
						if (card.name === "sha") {
							return "jiu";
						}
					},
					cardnature(card) {
						if (get.position(card) !== "h") {
							return;
						}
						if (card.name === "sha") {
							return false;
						}
					},
				},
				trigger: { player: "useCardAfter" },
				forced: true,
				popup: false,
				filter(event, player) {
					return player.storage.qunyou_luzhan_duel_card === event.card;
				},
				content(event, trigger, player) {
					delete player.storage.qunyou_luzhan_duel_card;
					player.removeSkill("qunyou_luzhan_duel_state");
				},
				onremove(player) {
					delete player.storage.qunyou_luzhan_duel_card;
				},
				sub: true,
			},
			jiu_window: {
				charlotte: true,
				trigger: { player: "useCardAfter" },
				forced: true,
				popup: false,
				filter(event, player) {
					return event.card?.storage?.qunyou_luzhan_as === "jiu" && player.hasSkill("jiu");
				},
				content(event, trigger, player) {
					player.addSkill("qunyou_luzhan_jiu_state");
				},
				sub: true,
			},
			jiu_state: {
				charlotte: true,
				mark: true,
				marktext: "战",
				intro: {
					content: "酒状态结束前，手牌中的锦囊牌视为【决斗】",
				},
				mod: {
					cardname(card) {
						if (get.position(card) !== "h") {
							return;
						}
						if (get.type(card, null, false) === "trick") {
							return "juedou";
						}
					},
					cardnature(card) {
						if (get.position(card) !== "h") {
							return;
						}
						if (get.type(card, null, false) === "trick") {
							return false;
						}
					},
				},
				trigger: { player: "useCardAfter", global: "phaseAfter" },
				forced: true,
				popup: false,
				filter(event, player) {
					return !player.hasSkill("jiu");
				},
				content(event, trigger, player) {
					player.removeSkill("qunyou_luzhan_jiu_state");
				},
				sub: true,
			},
		},
	},
	qunyou_xingshi: {
		audio: 2,
		ai: {
			order: 5,
			result: { player: 1 },
		},
		zhuSkill: true,
		trigger: { global: "damageSource" },
		direct: true,
		filter(event, player) {
			const source = event.source;
			if (player.hasSkill("qunyou_xingshi_used") || !source?.isIn() || source === player || source.group !== "shu") {
				return false;
			}
			if (!event.card || !["sha", "juedou"].includes(get.name(event.card, source))) {
				return false;
			}
			return player.countCards("hes") && game.hasPlayer((target) => target.group === "shu");
		},
		async content(event, trigger, player) {
			const result = await player
				.chooseBool(get.prompt("qunyou_xingshi", trigger.source), "将一张牌当做仅指定蜀势力角色为目标的【桃园结义】使用")
				.set("choice", game.hasPlayer((target) => target.group === "shu" && get.attitude(player, target) > 0 && target.isDamaged()))
				.forResult();
			if (!result?.bool) {
				return;
			}
			player.logSkill("qunyou_xingshi", trigger.source);
			const backupName = "qunyou_xingshi_backup";
			const next = player.chooseToUse();
			next.set("openskilldialog", "兴世：将一张牌当做仅指定蜀势力角色为目标的【桃园结义】使用");
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
			if (useResult?.bool) {
				player.addTempSkill("qunyou_xingshi_used", { global: "phaseAfter" });
			}
		},
		subSkill: {
			backup: {
				viewAs: { name: "taoyuan", isCard: true },
				filterCard(card) {
					return get.itemtype(card) === "card";
				},
				position: "hes",
				selectCard: 1,
				filterTarget(card, player, target) {
					return target.group === "shu";
				},
				selectTarget: -1,
				popname: true,
				log: false,
				check(card) {
					return 8 - get.value(card);
				},
				sub: true,
			},
			used: {
				charlotte: true,
				onremove: true,
				sub: true,
			},
		},
	},
	qunyou_quanmou: {
		audio: 2,
		trigger: { player: "gainAfter", global: "loseAsyncAfter" },
		direct: true,
		mark: true,
		marktext: "谋",
		intro: {
			content(storage, player) {
				return `永久手牌上限+${player.countMark("qunyou_quanmou") || 0}`;
			},
		},
		filter(event, player) {
			if (event.name === "gain") {
				return (event.getg?.(player) || []).length > 0;
			}
			const lost = event.getl?.(player)?.cards2 || [];
			if (!lost.length || !event.getg) {
				return false;
			}
			return game.hasPlayer((target) => target !== player && (event.getg(target) || []).some((card) => lost.includes(card)));
		},
		async content(event, trigger, player) {
			const cards = (trigger.getg?.(player) || []).slice();
			let target = player;
			if (trigger.name !== "gain") {
				const lost = trigger.getl?.(player)?.cards2 || [];
				target = game.filterPlayer((current) => current !== player && (trigger.getg?.(current) || []).some((card) => lost.includes(card)))[0] || null;
			}
			if (!target?.isIn?.()) {
				return;
			}
			const result = await player.chooseBool(get.prompt("qunyou_quanmou"), `你可以对${get.translation(target)}造成1点伤害，然后令这些牌获得“权谋”标记且无次数限制，并令你的手牌上限永久+1`).set("ai", () => true).forResult();
			if (!result?.bool) {
				return;
			}
			const before = target.getHistory("damage").length;
			await target.damage(player);
			if (target.getHistory("damage").length <= before) {
				return;
			}
			const tagged = cards.filter((card) => get.owner(card) === player && get.position(card) === "h");
			if (tagged.length) {
				player.addGaintag(tagged, "qunyou_quanmou");
			}
			player.addMark("qunyou_quanmou", 1, false);
			player.markSkill("qunyou_quanmou");
		},
		mod: {
			cardUsable(card, player) {
				return get.position(card) === "h" && card.hasGaintag("qunyou_quanmou") ? Infinity : undefined;
			},
			maxHandcard(player, num) {
				return num + player.countMark("qunyou_quanmou");
			},
		},
	},
	qunyou_huameng: {
		audio: 2,
		trigger: { source: "damageBegin4" },
		direct: true,
		ai: {
			order: 5,
			result: { player: 1 },
		},
		mark: true,
		marktext: "盟",
		intro: {
			content(storage, player) {
				const list = player.storage.qunyou_huameng_skills || [];
				return list.length ? `当前因【化盟】获得技能：${list.map((skill) => get.translation(skill)).join("、")}` : "当前未因【化盟】获得技能";
			},
		},
		filter(event, player) {
			const usedTargets = player.storage.qunyou_huameng_usedTargets || [];
			return event.player && event.num > 0 && !usedTargets.includes(event.player.playerid);
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			const boolResult = await player.chooseBool(get.prompt("qunyou_huameng"), `防止对${get.translation(target)}造成的伤害并与其议事`).set("ai", () => {
				if (player.hp < player.maxHp) return 1;
				const list = qunyou_huameng_skillList(target, player);
				if (list.length) return 1;
				return 0;
			}).forResult();
			if (!boolResult?.bool || !target?.isIn?.()) {
				return;
			}
			if (!Array.isArray(player.storage.qunyou_huameng_usedTargets)) {
				player.storage.qunyou_huameng_usedTargets = [];
			}
			if (!player.storage.qunyou_huameng_usedTargets.includes(target.playerid)) {
				player.storage.qunyou_huameng_usedTargets.push(target.playerid);
			}
			player.addTempSkill("qunyou_huameng_round", "roundStart");
			trigger.cancel();
			player.logSkill("qunyou_huameng", target);
			const debate = await player.chooseToDebate([player, target]).set("prompt", get.prompt("qunyou_huameng")).set("prompt2", `与${get.translation(target)}议事`).set("ai", (card) => get.color(card) === "red" ? 1 : 0).forResult();
			const opinion = debate?.opinion;
			if (opinion === "red") {
				await player.recover();
				const thirdTargets = game.filterPlayer((current) => current !== player && current !== target && (player.canUse({ name: "sha", isCard: true }, current, false) || target.canUse({ name: "sha", isCard: true }, current, false)));
				if (thirdTargets.length) {
					const targetResult = await player
						.chooseTarget("化盟：先选择一名第三人，再由你与其依次对该角色使用【杀】", true, (card, player, current) => {
							return get.event().thirdTargets.includes(current);
						})
						.set("thirdTargets", thirdTargets)
						.forResult();
					const third = targetResult?.targets?.[0];
					if (third?.isIn?.()) {
						for (const source of [player, target]) {
							if (!source.isIn() || !third.isIn() || !source.countCards("h", { name: "sha" }) || !source.canUse({ name: "sha", isCard: true }, third, false)) {
								continue;
							}
							await source
								.chooseToUse({
									prompt: `化盟：对${get.translation(third)}使用一张【杀】`,
									position: "h",
									filterCard(card, player) {
										return get.name(card, player) === "sha";
									},
									filterTarget(card, player, current) {
										return current === get.event().qunyou_huameng_third;
									},
									selectTarget: 1,
									forced: true,
								})
								.set("qunyou_huameng_third", third)
								.set("addCount", false)
								.forResult();
						}
					}
				}
			} else if (opinion === "black" && target.isIn()) {
				const list = qunyou_huameng_skillList(target, player);
				if (list.length) {
					const result = await player.chooseControl(list).set("prompt", `化盟：获得${get.translation(target)}武将牌上的一个技能，直到你下次受到其他角色造成的伤害`).set("choiceList", list.map((skill) => get.translation(skill))).set("ai", () => list[0]).forResult();
					const skill = result?.control;
					if (skill) {
						const storage = player.storage.qunyou_huameng_skills || [];
						if (!storage.includes(skill)) {
							storage.push(skill);
						}
						player.storage.qunyou_huameng_skills = storage;
						player.addAdditionalSkill("qunyou_huameng", storage.slice());
						player.addTempSkill("qunyou_huameng_clear", { player: "damageAfter" });
						player.markSkill("qunyou_huameng");
					}
				}
			}
		},
		subSkill: {
			clear: {
				charlotte: true,
				trigger: { player: "damageAfter" },
				forced: true,
				popup: false,
				filter(event) {
					return !!event.source && event.source !== event.player;
				},
				onremove(player) {
					if (!(player.storage.qunyou_huameng_skills || []).length) {
						return;
					}
					qunyou_huameng_clear(player);
				},
				sub: true,
			},
			round: {
				charlotte: true,
				onremove(player) {
					delete player.storage.qunyou_huameng_usedTargets;
				},
				sub: true,
			},
		},
	},
	qunyou_zhashu: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		mark: true,
		marktext: "书",
		intro: {
			content(storage, player) {
				const info = qunyou_zhashu_storage(player);
				const target = info.target ? game.filterPlayer((current) => current.playerid === info.target)[0] : null;
				const count = qunyou_zhashu_cards(player).length;
				return target ? `回合结束时需交还给${get.translation(target)}的牌数：${count}` : "当前没有待交还的牌";
			},
		},
		filter(event, player) {
			return player.countCards("h") > 0 && game.hasPlayer((target) => target.isDamaged() && player.canCompare(target));
		},
		filterTarget(card, player, target) {
			return target.isDamaged() && player.canCompare(target);
		},
		selectTarget: 1,
		async content(event, trigger, player) {
			const target = event.target;
			const compare = await player.chooseToCompare(target).forResult();
			if (!compare?.bool || !target.isIn()) {
				return;
			}
			const giveResult = await player.chooseCard("h", true, `诈书：交给${get.translation(target)}一张手牌`).set("ai", (card) => 6 - get.value(card)).forResult();
			const giveCard = giveResult?.cards?.[0];
			if (!giveCard) {
				return;
			}
			const color = get.color(giveCard, false);
			await target.gain(giveCard, player, "giveAuto", "bySelf");
			if (!target.isIn()) {
				return;
			}
			const gainCards = target.getCards("h", (card) => get.color(card, false) === color);
			if (!gainCards.length) {
				qunyou_zhashu_clear(player);
				return;
			}
			await player.gain(gainCards, target, "giveAuto", "bySelf");
			player.addGaintag(gainCards, "qunyou_zhashu");
			const storage = qunyou_zhashu_storage(player);
			storage.target = target.playerid;
			player.markSkill("qunyou_zhashu");
		},
		group: "qunyou_zhashu_return",
		subSkill: {
			return: {
				charlotte: true,
				trigger: { player: "phaseJieshuBegin" },
				forced: true,
				popup: false,
				filter(event, player) {
					const storage = qunyou_zhashu_storage(player);
					return !!storage.target;
				},
				async content(event, trigger, player) {
					const storage = qunyou_zhashu_storage(player);
					const target = game.filterPlayer((current) => current.playerid === storage.target)[0];
					const cards = qunyou_zhashu_cards(player);
					if (cards.length) {
						player.removeGaintag("qunyou_zhashu", cards);
					}
					if (target?.isIn?.() && cards.length) {
						await target.gain(cards, player, "giveAuto", "bySelf");
					}
					qunyou_zhashu_clear(player);
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
	qunyou_zhouli: {
		audio: 2,
		ai: {
			order: 5,
			result: { player: 1 },
		},
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		intro: {
			content(storage) {
				return storage ? "当前为阴状态：结束阶段，你可亮出牌堆底的一张牌并获得之。" : "当前为阳状态：准备阶段，你可亮出牌堆顶的一张牌并使用之。";
			},
		},
		trigger: {
			player: ["phaseZhunbeiBegin", "phaseJieshuBegin"],
		},
		direct: true,
		filter(event, player) {
			if (event.name === "phaseZhunbei" || event.triggername === "phaseZhunbeiBegin") {
				return !player.storage.qunyou_zhouli && ui.cardPile.childElementCount > 0;
			}
			return !!player.storage.qunyou_zhouli && ui.cardPile.childElementCount > 0;
		},
		async content(event, trigger, player) {
			const yin = !!player.storage.qunyou_zhouli;
			const prompt = yin ? "亮出牌堆底的一张牌并获得之" : "亮出牌堆顶的一张牌并使用之";
			const result = await player.chooseBool(get.prompt("qunyou_zhouli"), prompt).set("ai", () => true).forResult();
			if (!result?.bool) {
				return;
			}
			player.logSkill("qunyou_zhouli");
			await qunyou_zhouli_activate(player, "qunyou_zhouli");
		},
	},
	qunyou_yunxian: {
		audio: 2,
		ai: {
			order: 5,
			result: { player: 1 },
		},
		trigger: {
			player: "loseAfter",
			global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
		},
		direct: true,
		filter(event, player) {
			const lost = event.getl?.(player);
			const hs = lost?.hs || [];
			if (hs.length !== 1) {
				return false;
			}
			return ["red", "black"].includes(get.color(hs[0], player));
		},
		async content(event, trigger, player) {
			const hs = trigger.getl(player).hs;
			const card = hs[0];
			const color = get.color(card, player);
			const cards = color === "red" ? qunyou_zhouli_topCards(2) : qunyou_zhouli_bottomCards(2);
			if (!cards.length) {
				return;
			}
			const result = await player
				.chooseButton([
					`蕴贤：选择一张牌${color === "red" ? "置于牌堆底" : "置于牌堆顶"}`,
					cards,
				], true)
				.set("ai", (button) => {
					const current = button.link;
					return color === "red" ? -get.value(current, get.player()) : get.value(current, get.player());
				})
				.forResult();
			if (!result?.bool || !result.links?.length) {
				return;
			}
			const chosen = result.links[0];
			if (get.position(chosen, true) === "c") {
				chosen.fix();
				if (color === "red") {
					ui.cardPile.appendChild(chosen);
					game.log(player, "将", chosen, "置于了牌堆底");
				} else {
					ui.cardPile.insertBefore(chosen, ui.cardPile.firstChild);
					game.log(player, "将", chosen, "置于了牌堆顶");
				}
				await game.delayx();
			}
			await qunyou_yunxian_sameColorActivate(player, cards);
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
	qunyou_lingyu: {
		audio: 2,
		trigger: { player: "useCard" },
		direct: true,
		ai: {
			order: 5,
			result: { player: 1 },
		},
		filter(event, player) {
			return true
		},
		async content(event, trigger, player) {
			const result = await player
				.chooseBool(get.prompt("qunyou_lingyu"), "是否弃置一张牌发动灵玉？")
				.set("ai", () => {
                if (player.countCards("h") > 2) return true;
                if (trigger.card.isCard("sha") && trigger.targets && trigger.targets.some(t => !t.hp受傷)) return true;
                return false;
            })
				.forResult();
			if (!result?.bool) {
				return;
			}
			const discardResult = await player
				.chooseToDiscard("灵玉：请选择要弃置的牌", 1, "he", true)
				.set("ai", (card) => {
					const player = _status.event.player;
					const blacks = player.getCards("h").filter(c => get.color(c, player) === "black").length;
					const reds = player.getCards("h").filter(c => get.color(c, player) === "red").length;
					const col = get.color(card, player);
					const bonus = col === "black" ? Math.max(0, blacks - reds) : Math.max(0, reds - blacks);
					return bonus + 6 - get.value(card);
				})
				.forResult();
			if (!discardResult?.bool || !discardResult.cards?.length) {
				return;
			}
			player.logSkill("qunyou_lingyu");
			const discardedCard = discardResult.cards[0];
        const color = get.color(discardedCard, player);
        
        const handCards = player.getCards("h");
        const usingCard = trigger.card;
        const otherHands = handCards.filter(c => c !== usingCard);
        let blackCount = 0, redCount = 0;
        for (let card of otherHands) {
            const c = get.color(card, player);
            if (c === "black") blackCount++;
            else if (c === "red") redCount++;
        }
        const isEqual = (blackCount === redCount);
        const extra = isEqual ? 1 : 0;

        if (color === "black") {
            trigger.baseDamage ??= 1;
            trigger.baseDamage += (1 + extra);
            game.log(trigger.card, "此牌效果", `#y+${1 + extra}`);
        } else if (color === "red") {
            await player.draw(1 + extra);
        }
    },
	},
	qunyou_qingmeng: {
    audio: 2,
    trigger: { player: "damageBegin" },
    direct: true,
    ai: {
        order: 1,
        result: { player: 1 },
    },
    filter(event, player) {
        return true;
    },
    async content(event, trigger, player) {
        const hand = player.getCards("h");
        let hasBlack = false, hasRed = false;
        for (let card of hand) {
            const col = get.color(card, player);
            if (col === "black") hasBlack = true;
            if (col === "red") hasRed = true;
            if (hasBlack && hasRed) break;
        }
        
        const noBlack = !hasBlack;
        const noRed = !hasRed;
        
        if (!noBlack && !noRed) return;
        
        player.logSkill("qunyou_qingmeng");
        let damageMinus = 0;
        let drawCount = 0;
        
        if (noBlack && noRed) {
            const choice = await player.chooseControl(["此次伤害-1", "额外摸一张牌"]).set("prompt", "青盟：你既无黑色也无红色手牌，请选择额外效果").set("ai", () => player.hp <= 1 ? "此次伤害-1" : "额外摸一张牌").forResult();
            if (choice && choice.control === "此次伤害-1") {
                damageMinus += 1;
            } else if (choice && choice.control === "额外摸一张牌") {
                drawCount += 1;
            }
        }
		    if (noBlack || noRed) {
            drawCount += 2;
        }
        if (damageMinus > 0) {
            trigger.num = Math.max(0, (trigger.num ?? 1) - damageMinus);
            game.log(`伤害 #y-${damageMinus}`);
        }
        if (drawCount > 0) {
            await player.draw(drawCount);
            game.log(`摸 #y${drawCount} 张牌`);
        }
        }
    },
	qunyou_zhuoqu: {
		audio: 2,
		enable: "chooseToUse",
		mark: true,
		ai: {
			order: 7,
			result: { player: 1 },
		},
		marktext: "灼",
		intro: {
			markcount(storage, player) {
				return Array.isArray(player.storage.qunyou_zhuoqu_numbers) ? player.storage.qunyou_zhuoqu_numbers.length : 0;
			},
			content(storage, player) {
				const list = Array.isArray(player.storage.qunyou_zhuoqu_numbers) ? player.storage.qunyou_zhuoqu_numbers : [];
				return `不能使用或打出的点数：${list.length ? list.map(num => get.strNumber(num)).join("、") : "无"}`;
			},
		},
		init(player) {
			if (!Array.isArray(player.storage.qunyou_zhuoqu_numbers)) player.storage.qunyou_zhuoqu_numbers = [];
		},
		onremove(player) {
			delete player.storage.qunyou_zhuoqu_numbers;
		},
		filter(event, player) {
			return player.countCards("hes") > 0 && event.filterCard({ name: "wuzhong", isCard: true }, player, event);
		},
		chooseButton: {
			dialog() {
				return ui.create.dialog("灼躯", [[["锦囊", "", "wuzhong"]], "vcard"]);
			},
			check(button) {
				return get.player().getUseValue({ name: "wuzhong", isCard: true }, null, true);
			},
			backup(links, player) {
				game.log(player, "【灼躯日志-生成backup】");
				return {
					audio: "qunyou_zhuoqu",
					sourceSkill: "qunyou_zhuoqu",
					selectCard: 1,
					filterCard(card, player2) {
						return !qunyou_zhuoqu_isBlocked(player2, card);
					},
					popname: true,
					viewAs: {
						name: "wuzhong",
						isCard: true,
						storage: { qunyou_zhuoqu: true },
					},
					check(card) {
						return 7 - get.value(card);
					},
					position: "hes",
					onuse(result, player2) {
						const card = result.cards?.[0];
						const number = qunyou_validNumber(card, player2);
						game.log(
							player2,
							"【灼躯日志-onuse】",
							card ? get.translation(card) : "无底牌",
							number ?? "无点数",
							result.card?.name || "无虚拟牌"
						);
						if (number !== null) {
							qunyou_zhuoqu_addNumber(player2, number);
						}
					},
					precontent(event, trigger, player2) {
						const card = event.result?.cards?.[0];
						const number = qunyou_validNumber(card, player2);
						game.log(
							player2,
							"【灼躯日志-precontent】",
							card ? get.translation(card) : "无底牌",
							number ?? "无点数",
							event.result?.card?.name || "无虚拟牌"
						);
						if (number !== null) {
							qunyou_zhuoqu_addNumber(player2, number);
						}
					},
				};
			},
			prompt() {
				return "将一张牌当【无中生有】使用";
			},
		},
		mod: {
			cardEnabled(card, player) {
				if (qunyou_zhuoqu_isCurrentUse()) return;
				if (qunyou_zhuoqu_isBlocked(player, card)) return false;
			},
			cardRespondable(card, player) {
				if (qunyou_zhuoqu_isCurrentUse()) return;
				if (qunyou_zhuoqu_isBlocked(player, card)) return false;
			},
			cardSavable(card, player) {
				if (qunyou_zhuoqu_isCurrentUse()) return;
				if (qunyou_zhuoqu_isBlocked(player, card)) return false;
			},
		},
		group: ["qunyou_zhuoqu_probe", "qunyou_zhuoqu_unlock"],
		subSkill: {
			probe: {
				charlotte: true,
				trigger: {
					player: ["useCard1", "useCardAfter"],
				},
				forced: true,
				popup: false,
				filter(event) {
					return !!event.card?.storage?.qunyou_zhuoqu;
				},
				content(event, trigger, player) {
					game.log(
						player,
						"【灼躯日志-用牌链】",
						event.triggername || "无triggername",
						trigger.card?.name || "无牌名",
						Array.isArray(trigger.cards) ? `cards:${trigger.cards.map(card => get.translation(card)).join("、")}` : "cards:无",
						Array.isArray(trigger.card?.cards) ? `card.cards:${trigger.card.cards.map(card => get.translation(card)).join("、")}` : "card.cards:无",
						`当前封点:${Array.isArray(player.storage.qunyou_zhuoqu_numbers) && player.storage.qunyou_zhuoqu_numbers.length ? player.storage.qunyou_zhuoqu_numbers.map(num => get.strNumber(num)).join("、") : "无"}`
					);
				},
				sub: true,
			},
			unlock: {
				charlotte: true,
				trigger: {
					player: "loseAfter",
					global: "loseAsyncAfter",
				},
				forced: true,
				popup: false,
				filter(event, player) {
					game.log(player, "【灼躯日志-解封入口】", event.name || "无事件名", event.triggername || "无triggername", event.type || "无type");
					const outside = qunyou_zhuoqu_isOutsideDiscardPhase(event);
					const lost = event.getl?.(player);
					const cards0 = Array.isArray(event.cards) ? event.cards : [];
					const cards1 = Array.isArray(event.cards2) ? event.cards2 : [];
					const cards2 = Array.isArray(lost?.cards2) ? lost.cards2 : [];
					game.log(
						player,
						"【灼躯日志-解封细节】",
						`outside:${outside}`,
						`getlx:${event.getlx === false ? "false" : "ok"}`,
						`cards:${cards0.length}`,
						`cards2:${cards1.length}`,
						`lost.cards2:${cards2.length}`
					);
					if (!outside || event.type !== "discard" || event.getlx === false) return false;
					let cards = [];
					if (cards0.length) cards = cards0;
					else if (cards1.length) cards = cards1;
					else if (cards2.length) cards = cards2;
					cards = cards.filter(card => get.position(card, true) === "d");
					game.log(player, "【灼躯日志-解封入堆】", cards.length ? cards.map(card => `${get.translation(card)}:${qunyou_validNumber(card, player) ?? "无点数"}`).join("、") : "无");
					if (!cards.length) return false;
					const blocked = Array.isArray(player.storage.qunyou_zhuoqu_numbers) ? player.storage.qunyou_zhuoqu_numbers.slice() : [];
					const hits = [...new Set(cards.map(card => qunyou_validNumber(card, player)).filter(num => Number.isInteger(num) && blocked.includes(num)))];
					game.log(
						player,
						"【灼躯日志-解封候选】",
						event.name || "无事件名",
						event.type || "无type",
						cards.map(card => `${get.translation(card)}:${qunyou_validNumber(card, player) ?? "无点数"}`).join("、"),
						`当前封点:${blocked.length ? blocked.map(num => get.strNumber(num)).join("、") : "无"}`,
						`命中点数:${hits.length ? hits.map(num => get.strNumber(num)).join("、") : "无"}`
					);
					if (hits.length) {
						player.storage.qunyou_zhuoqu_pending_remove = hits.slice();
						game.log(player, "【灼躯日志-解封判定】", hits.map(num => get.strNumber(num)).join("、"));
					}
					return hits.length > 0;
				},
				content() {
					game.log(player, "【灼躯日志-解封content】");
					try {
						const hits = Array.isArray(player.storage.qunyou_zhuoqu_pending_remove) ? player.storage.qunyou_zhuoqu_pending_remove.slice() : [];
						delete player.storage.qunyou_zhuoqu_pending_remove;
						const current = Array.isArray(player.storage.qunyou_zhuoqu_numbers) ? player.storage.qunyou_zhuoqu_numbers.slice() : [];
						game.log(player, "【灼躯日志-解封前】", hits.length ? hits.map(num => get.strNumber(num)).join("、") : "无", current.length ? current.map(num => get.strNumber(num)).join("、") : "无");
						if (!hits.length) return;
						player.storage.qunyou_zhuoqu_numbers = current.filter(num => !hits.includes(num));
						if (player.storage.qunyou_zhuoqu_numbers.length) player.markSkill("qunyou_zhuoqu");
						else player.unmarkSkill("qunyou_zhuoqu");
						player.updateMarks("qunyou_zhuoqu");
						game.log(player, "【灼躯日志-解封后】", player.storage.qunyou_zhuoqu_numbers.length ? player.storage.qunyou_zhuoqu_numbers.map(num => get.strNumber(num)).join("、") : "无");
					} catch (e) {
						game.log(player, "【灼躯日志-解封报错】", String(e));
					}
				},
				sub: true,
			},
			backup: {
				audio: "qunyou_zhuoqu",
				sub: true,
				sourceSkill: "qunyou_zhuoqu",
			},
		},
	},
	qunyou_guwo: {
		audio: 2,
		forced: true,
		locked: true,
		popup: false,
		silent: true,
		firstDo: true,
		mark: true,
		marktext: "孤",
		init(player) {
			if (!Number.isInteger(player.storage.qunyou_guwo_state)) {
				player.storage.qunyou_guwo_state = 0;
			}
		},
		intro: {
			markcount(storage, player) {
				return qunyou_getState(player, "qunyou_guwo") + 1;
			},
			content(storage, player) {
				const state = qunyou_getState(player, "qunyou_guwo");
				if (state === 0) return "①若与你上使用牌点数递增";
				if (state === 1) return "②若与你上使用牌点数递增，②则将体力调整至手牌数";
				return "③若与你上使用牌点数递增，③则将体力调整至手牌数，③手牌调整至已损失体力数";
			},
		},
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			const current = qunyou_validNumber(event.card, player);
			const last = qunyou_getPreviousUseNumber(player, event);
			return current !== null && last !== null && current > last;
		},
		async content(event, trigger, player) {
			const state = qunyou_getState(player, "qunyou_guwo");
			if (state >= 1) {
				await qunyou_adjustHpTo(player, player.countCards("h"));
			}
			if (state >= 2) {
				await qunyou_adjustHandTo(player, player.getDamagedHp());
			}
			qunyou_cycleState(player, "qunyou_guwo");
		},
	},
	qunyou_chubu: {
		audio: 2,
		forced: true,
		locked: true,
		popup: false,
		silent: true,
		firstDo: true,
		mark: true,
		marktext: "躇",
		init(player) {
			if (!Number.isInteger(player.storage.qunyou_chubu_state)) {
				player.storage.qunyou_chubu_state = 0;
			}
		},
		intro: {
			markcount(storage, player) {
				return qunyou_getState(player, "qunyou_chubu") + 1;
			},
			content(storage, player) {
				const state = qunyou_getState(player, "qunyou_chubu");
				if (state === 0) return "①若与你上使用牌点数递减";
				if (state === 1) return "②若与你上使用牌点数递减，②则弃置所有手牌摸1张牌";
				return "③若与你上使用牌点数递减，③则弃置所有手牌摸1张牌，③并减1点体力上限";
			},
		},
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			const current = qunyou_validNumber(event.card, player);
			const last = qunyou_getPreviousUseNumber(player, event);
			return current !== null && last !== null && current < last;
		},
		async content(event, trigger, player) {
			const state = qunyou_getState(player, "qunyou_chubu");
			if (state >= 1) {
				const handCount = player.countCards("h");
				if (handCount > 0) {
					await player.chooseToDiscard("h", true, handCount, "allowChooseAll").forResult();
				}
				await player.draw();
			}
			if (state >= 2) {
				await player.loseMaxHp();
			}
			qunyou_cycleState(player, "qunyou_chubu");
		},
	},
	qunyou_jingce: {
		audio: 2,
		ai: {
			order: 5,
			result: { player: 1 },
		},
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		intro: {
			content(storage) {
				return storage ? "阴：将手牌数调整至你本回合使用牌的类别数。" : "阳：将手牌数调整至你本回合使用牌的花色数。";
			},
		},
		trigger: { player: "useCardAfter" },
		direct: true,
		init(player, skill) {
			qunyou_jingce_storage(player);
			player.addSkill(skill + "_mark");
		},
		onremove(player, skill) {
			player.removeSkill(skill + "_mark");
			player.removeSkill(skill + "_reset");
			qunyou_jingce_clear(player);
		},
		filter(event, player) {
			return event.player === player;
		},
		async content(event, trigger, player) {
			qunyou_jingce_recordUse(player, trigger.card);
			player.addTempSkill("qunyou_jingce_reset", { global: "phaseAfter" });
			const target = qunyou_jingce_targetCount(player);
			const prompt = player.storage.qunyou_jingce
				? `你可以将手牌数调整至你本回合使用牌的类别数（${target}）`
				: `你可以将手牌数调整至你本回合使用牌的花色数（${target}）`;
			const result = await player.chooseBool(get.prompt("qunyou_jingce"), prompt).set("choice", true).forResult();
			if (!result?.bool) {
				return;
			}
			player.logSkill("qunyou_jingce");
			await qunyou_adjustHandTo(player, target);
			player.changeZhuanhuanji("qunyou_jingce");
			player.updateMarks("qunyou_jingce_mark");
		},
		subSkill: {
			reset: {
				charlotte: true,
				onremove(player) {
					qunyou_jingce_clear(player);
				},
				sub: true,
			},
			mark: {
				charlotte: true,
				mark: true,
				marktext: "策",
				intro: {
					content(storage, player) {
						return [
							`当前模式：${qunyou_jingce_modeText(player)}`,
							`本回合已使用花色：${qunyou_jingce_usedSuitsText(player)}`,
							`本回合已使用类型：${qunyou_jingce_usedTypesText(player)}`,
						].join("<br>");
					},
				},
				sub: true,
			},
		},
	},
	qunyou_pianyi: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return game.hasPlayer(
				(target) =>
					target.isIn() &&
					target.countCards("h") > 0 &&
					!player.getStorage("qunyou_pianyi_targets").includes(target),
			);
		},
		filterTarget(card, player, target) {
			return (
				target.isIn() &&
				target.countCards("h") > 0 &&
				!player.getStorage("qunyou_pianyi_targets").includes(target)
			);
		},
		async content(event, trigger, player) {
			const target = event.target;
			player.markAuto("qunyou_pianyi_targets", [target]);
			player.addTempSkill("qunyou_pianyi_clear", "phaseAfter");
			player.logSkill("qunyou_pianyi", target);

			const handCards = target.getCards("h");
			if (!handCards.length) return;

			const spades = handCards.filter((c) => get.suit(c, target) === "spade");
			const nonSpades = handCards.filter((c) => get.suit(c, target) !== "spade");

			// 将所有手牌当一张【酒】使用（转化牌）
			const vcard = get.autoViewAs({ name: "jiu" }, handCards);
			await target.useCard(vcard, handCards, target);

			// 两项选择
			const drawOption = `摸${nonSpades.length}张牌`;
			const spadeOption = `依次使用${spades.length}张♠牌`;

			let targetChoice;
			if (!spades.length) {
				targetChoice = 0;
			} else if (!nonSpades.length) {
				targetChoice = 1;
			} else {
				const result = await target
					.chooseControl([drawOption, spadeOption])
					.set("prompt", "翩仪：抉择")
					.set("ai", () => 0)
					.forResult();
				targetChoice = result?.index ?? 0;
			}

			const execDraw = async (who) => {
				if (nonSpades.length > 0) await who.draw(nonSpades.length);
			};
			const execSpades = async (who) => {
				for (const spade of spades) {
					if (!who.isIn()) break;
					// 直接以该♠牌为素材使用，不经过 gain
					await who.chooseUseTarget(spade, [spade], true, false);
				}
			};

			if (targetChoice === 0) {
				await execDraw(target);
				await execSpades(player);
			} else {
				await execSpades(target);
				await execDraw(player);
			}
		},
		subSkill: {
			clear: {
				charlotte: true,
				onremove(player) {
					player.unmarkAuto("qunyou_pianyi_targets", player.getStorage("qunyou_pianyi_targets").slice());
				},
			},
		},
	ai: {
		order: 5,
		result: { player: 1 },
		check(event, player) {
			const handCards = player.getCards("h");
			if (!handCards.length) return 0;
			const totalValue = handCards.reduce((sum, c) => sum + get.value(c, player), 0);
			const avgValue = totalValue / handCards.length;
			const lostHp = player.maxHp - player.hp;
			if (avgValue < 5 && lostHp > handCards.length) return 1;
			return 0;
		},
	},
	},
	qunyou_zisheng: {
		audio: 2,
		locked: true,
		trigger: { player: "useCardAfter" },
		forced: true,
		filter(event, player) {
			return !!event.card;
		},
		async content(event, trigger, player) {
			player.storage.qunyou_zisheng_used_count = (player.storage.qunyou_zisheng_used_count || 0) + 1;
			const count = player.storage.qunyou_zisheng_used_count;
			if (count % 3 !== 0) {
				return;
			}
			await player.draw(3);
			player.addSkill("qunyou_zisheng_effect");
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
				trigger: { player: "useCard1" },
				firstDo: true,
				filter(event, player) {
					return player.hasSkill("qunyou_zisheng_effect");
				},
				content(event, trigger, player) {
					player.removeSkill("qunyou_zisheng_effect");
					if (trigger.addCount !== false) {
						trigger.addCount = false;
						const stat = player.getStat().card;
						const name = trigger.card.name;
						if (typeof stat[name] === "number" && stat[name] > 0) {
							stat[name]--;
						}
					}
				},
				sub: true,
			},
			clear: {
				charlotte: true,
				trigger: { global: "phaseAfter" },
				forced: true,
				popup: false,
				filter(event, player) {
					return !!player.storage.qunyou_zisheng_used_count || player.hasSkill("qunyou_zisheng_effect");
				},
				content(event, trigger, player) {
					delete player.storage.qunyou_zisheng_used_count;
					if (player.hasSkill("qunyou_zisheng_effect")) {
						player.removeSkill("qunyou_zisheng_effect");
					}
				},
				sub: true,
			},
		},
	},
	qunyou_xianlue: {
		audio: 2,
		locked: true,
		trigger: { player: "useCard" },
		forced: true,
		filter(event, player) {
			const card = event.card;
			const number = qunyou_validNumber(card, player);
			if (!Number.isInteger(number)) {
				return false;
			}
			const gains = player.getHistory("gain");
			for (let i = gains.length - 1; i >= 0; i--) {
				const evt = gains[i];
				if (!evt?.cards?.length) {
					continue;
				}
				const phase = evt.getParent("phase", true);
				if (phase?.player !== player) {
					continue;
				}
				return qunyou_isPositiveMultiple(number, evt.cards.length);
			}
			return false;
		},
		content(event, trigger, player) {
			if (get.tag(trigger.card, "damage") > 0 || get.tag(trigger.card, "recover") > 0) {
				trigger.baseDamage++;
			}
			if (player.awakenedSkills.includes("qunyou_haoxian")) {
				player.restoreSkill("qunyou_haoxian");
			}
		},
	},
	qunyou_haoxian: {
		audio: 2,
		limited: true,
		skillAnimation: true,
		animationColor: "metal",
		mark: true,
		marktext: "贤",
		intro: {
			content(storage, player) {
				return player.awakenedSkills.includes("qunyou_haoxian") ? "限定技已发动" : "限定技未发动";
			},
		},
		trigger: {
			player: "gainAfter",
			global: "loseAsyncAfter",
		},
		direct: true,
		ai: {
			order: 5,
			result: { player: 1 },
		},
		filter(event, player) {
			const count = qunyou_gainCount(event, player);
			return count > 0 && !player.awakenedSkills.includes("qunyou_haoxian") && player.countCards("he") >= count && qunyou_haoxianCanGain(player, count);
		},
		async content(event, trigger, player) {
			const count = qunyou_gainCount(trigger, player);
			const result = await player
				.chooseBool(get.prompt2("qunyou_haoxian"))
				.set("choice", player.countCards("h") >= count)
				.forResult();
			if (!result?.bool) {
				return;
			}
			player.logSkill("qunyou_haoxian");
			player.awakenSkill("qunyou_haoxian");
			const discard = await player.chooseToDiscard("he", true, count).set("prompt", `豪贤：请弃置${count}张牌`).forResult();
			const number = discard?.cards?.length || 0;
			if (!number) {
				return;
			}
			const { lostTargets } = await qunyou_haoxianGainSequential(player, number, number);
			const targets = lostTargets.filter(target => target?.isIn?.());
			if (!targets.length) {
				return;
			}
			const choose = await player
				.chooseTarget([1, targets.length], "豪贤：对任意名因此失去牌的角色各造成1点伤害", (card, player, target) => {
					return _status.event.targets.includes(target);
				})
				.set("targets", targets)
				.set("ai", target => get.damageEffect(target, player, player))
				.forResult();
			if (!choose?.bool || !choose.targets?.length) {
				return;
			}
			for (const target of choose.targets) {
				if (target.isIn()) {
					await target.damage(player);
				}
			}
		},
	},
	qunyou_cuiping: {
		audio: 2,
		locked: true,
		mod: {
			targetEnabled(card, player, target) {
				if (
					target !== _status.currentPhase ||
					!target.hasSkill("qunyou_cuiping") ||
					player === target
				)
					return;
				if (!target.getHistory("useCard", (evt) => get.color(evt.card) === "black").length)
					return false;
			},
		},
		group: "qunyou_cuiping_respond",
		subSkill: {
			respond: {
				charlotte: true,
				popup: false,
				locked: true,
				trigger: { global: "useCardBefore" },
				forced: true,
				filter(event, player) {
					if (_status.currentPhase !== player || event.player === player) return false;
					return !!player.getHistory("useCard", (evt) => get.color(evt.card) === "red").length;
				},
				content(event, trigger) {
					trigger.nowuxie = true;
					trigger.directHit.addArray(game.players);
				},
			},
		},
	},
	qunyou_taowei: {
		audio: 2,
		comboSkill: true,
		mark: true,
		marktext: "威",
		intro: {
			content(storage, player) {
				const data = player.storage.qunyou_taowei_data;
				if (!data) return "连招未开始";
				const list = data.cards || [];
				const text = list.map(c => get.translation(c)).join("、");
				return `进度 ${data.stage ?? 0}/3 · ${text ? "已参与：" + text : "无"}${data.used ? " · 已完成" : ""}`;
			},
		},
		trigger: { player: "useCardAfter" },
		forced: true,
		popup: false,
		priority: 20,
		filter(event, player) {
			if (_status.currentPhase !== player) return false;
			const data = player.storage.qunyou_taowei_data;
			if (data?.used) return false;
			return qunyou_taowei_useCards(player, event).length > 0;
		},
		async content(event, trigger, player) {
			if (!player.storage.qunyou_taowei_data) {
				player.storage.qunyou_taowei_data = { stage: 0, cards: [] };
			}
			const data = player.storage.qunyou_taowei_data;
			let matched = qunyou_taowei_matchStage(player, trigger, data.stage);
			let wasReset = false;
			if (!matched) {
				data.stage = 0;
				data.cards = [];
				wasReset = true;
				matched = qunyou_taowei_matchStage(player, trigger, 0);
				if (!matched) return;
			}
			data.cards.push(matched);
			data.stage++;
			if (!wasReset) {
				trigger.qunyou_taowei_participated = true;
			}
			trigger.qunyou_taowei_matchCard = matched;
			trigger.qunyou_taowei_reuseCard = qunyou_taowei_reuseCard(player, trigger);
			if (data.stage >= 3) {
				data.used = true;
				trigger.qunyou_taowei_finish = true;
			}
		},
		group: ["qunyou_taowei_resolve", "qunyou_taowei_clear"],
	},
	qunyou_taowei_resolve: {
		charlotte: true,
		trigger: { player: "useCardAfter" },
		forced: true,
		popup: false,
		priority: 10,
		filter(event) {
			return !!event.qunyou_taowei_finish;
		},
		async content(event, trigger, player) {
			const data = player.storage.qunyou_taowei_data;
			if (!data) return;
			const cards = data.cards.slice(0, 3);
			const notWins = {};
			let selfNotWin = 0;
			const order = [];
			for (let i = 0; i < cards.length; i++) {
				if (!game.hasPlayer(target => target !== player && target.countCards("h") > 0)) break;
				const result = await player
					.chooseTarget(`滔威：第${get.cnNumber(i + 1)}次拼点`, true, (card, p, target) => {
						return target !== p && target.countCards("h") > 0;
					})
					.set("ai", target => -get.attitude(player, target))
					.forResult();
				if (!result?.bool || !result.targets?.length) break;
				const target = result.targets[0];
				const compare = await qunyou_taowei_compare(player, target, cards[i]);
				const id = target.playerid;
				notWins[id] ??= 0;
				if (!order.includes(target)) order.push(target);
				if (compare?.tie || compare?.bool) notWins[id]++;
				else selfNotWin++;
			}
			for (const target of order) {
				if (target?.isIn?.() && (notWins[target.playerid] || 0) > selfNotWin) {
					await target.damage(player);
				}
			}
		},
	},
	qunyou_taowei_clear: {
		charlotte: true,
		trigger: { player: "phaseUseAfter" },
		forced: true,
		popup: false,
		filter(event, player) {
			return !!player.storage.qunyou_taowei_data;
		},
		content(event, trigger, player) {
			delete player.storage.qunyou_taowei_data;
		},
	},
	qunyou_hanguo: {
		audio: 2,
		locked: true,
		forced: true,
		group: ["qunyou_hanguo_show", "qunyou_hanguo_reuse"],
	},
	qunyou_hanguo_show: {
		charlotte: true,
		trigger: {
			player: ["enterGame", "gainAfter", "loseAfter", "hideShownCardsAfter"],
			global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
		},
		forced: true,
		popup: false,
		filter(event, player) {
			return player.countCards("h") > player.getShownCards().length;
		},
		async content(event, trigger, player) {
			const cards = player.getCards("h").filter(card => !player.getShownCards().includes(card));
			if (cards.length) {
				await player.addShownCards({
					cards,
					gaintag: [qunyou_hanguo_visibleTag()],
				});
			}
		},
	},
	qunyou_hanguo_reuse: {
		charlotte: true,
		trigger: { player: "useCardAfter" },
		prompt2: "撼国：你可再次使用此牌",
		popup: false,
		priority: 1,
		filter(event, player) {
			const card = event.qunyou_taowei_reuseCard;
			if (!card || !event.qunyou_taowei_participated) return false;
			const type = get.type(card);
			if (type !== "basic" && type !== "trick") return false;
			return player.hasUseTarget(card);
		},
		async content(event, trigger, player) {
			await player
				.chooseUseTarget(trigger.qunyou_taowei_reuseCard, qunyou_taowei_useCards(player, trigger), true, false)
				.set("prompt", `撼国：你可再次使用${get.translation(trigger.card)}`)
				.forResult();
		},
	},
qunyou_sc1_guanyong: {
    audio: "ext:群友设计/audio:2", // 直接使用音频文件名
    trigger: { global: "damageEnd" }, // 一名角色受到伤害后
    forced: true, // 锁定技
    filter(event, player) {
        const target = event.player;

        if (!target || !target.isIn()) return false;
        if (player.storage.qunyou_sc1_guanyong_marked?.includes(target)) return false;
        if (target !== player) {
            return target.countCards("h") > 0;
        } else {
            return player.countCards("h") > 0;
        }
    },
    async content(event, trigger, player) {
        if (!player.storage.qunyou_sc1_guanyong_marked) player.storage.qunyou_sc1_guanyong_marked = [];

		var num = Math.random() < 0.5 ? 1 : 2;
        
        // 2. 拼接出完整的文件名：qunyou_sc1_guanyong1 或 qunyou_sc1_guanyong2
        // game.playSkillAudio(文件名, false, 'ext:扩展名')

        const target = trigger.player;
        let card = null;

        // 1. 获得或展示手牌
        if (target !== player) {
            // 你获得其一张手牌（通过 gainPlayerCard 自动亮出或直接获取并触发 log）
            const result = await player.gainPlayerCard(target, "h", true).forResult();
            if (result && result.cards && result.cards.length) {
                card = result.cards[0];
            }
        } else {
            // 若其为你则改为你展示一张手牌
            const result = await player.chooseCard("冠勇：展示一张手牌", "h", true).forResult();
            if (result && result.cards && result.cards.length) {
                card = result.cards[0];
                await player.showCards([card], `${get.translation(player)}因【冠勇】展示了手牌`);
            }
        }

        if (!card) return; // 如果未能成功获取或展示牌则中止

        player.storage.qunyou_sc1_guanyong_marked.add(target);
        if (!player.hasSkill("qunyou_sc1_guanyong_clear")) {
            player.addTempSkill("qunyou_sc1_guanyong_clear", { global: "roundStart" });
        }

        // 2. 检测牌的属性与类型
        const isRed = get.color(card, player) === "red";
        const isBasic = get.type(card, player) === "basic";

        // 红色牌：你摸一张牌
        if (isRed) {
            await player.draw(1);
        }

        // 基本牌：令此牌造成的伤害或回复的体力+1
        if (isBasic) {
            // 在卡牌本体上做个标记，以供伤害/回复事件检测
            card.storage.qunyou_sc1_guanyong_plus = true;
            player.addGaintag([card], "qunyou_sc1_guanyong_mark");
            
            player.addSkill("qunyou_sc1_guanyong_modifier");
            if (!player.hasSkill("qunyou_sc1_guanyong_cleanup")) {
                player.addSkill("qunyou_sc1_guanyong_cleanup");
            }
        }

		if(isRed && isBasic) {
        player.popup("乘势", "fire");
        if (get.owner(card) === player && ["h", "e"].includes(get.position(card))) {
            // 检查无距离和次数限制下是否可以使用
            // 临时添加无视距离和次数的技能效果，以使 chooseToUse 能够正确检测该牌可用
            player.addTempSkill("qunyou_sc1_guanyong_infinite");
            
            const useResult = await player.chooseToUse({
                prompt: `冠勇：使用【${get.translation(card)}】（无距离和次数限制），若无法使用则取消以将其弃置`,
                filterCard: (c) => c === card,
                forced: false // 这里给玩家选择使用的机会，如果卡牌符合规则能用就用，点取消或者不能用就自动弃置
            }).forResult();

            player.removeSkill("qunyou_sc1_guanyong_infinite");

            if (!useResult || !useResult.bool) {
                // 无法使用或取消使用，则直接弃置
                await player.discard(card);
            }
            // 无论使用成功还是弃置成功，回复一点体力
            await player.recover(1);
        	}
		}
	},
},

qunyou_sc1_guanyong_infinite: {
    charlotte: true,
    mod: {
        cardUsable(player, card) {
            return Infinity; // 无次数限制
        },
        targetInRange(player, card, target) {
            return true; // 无距离限制
        }
    }
},

qunyou_sc1_guanyong_modifier: {
    charlotte: true,
    trigger: {
        source: "damageBegin1",   // 伤害造成前
        player: "recoverBegin1"   // 回复进行前
    },
    forced: true,
    popup: false,
    filter(event, player) {
        // 检查造成伤害或回复的牌是否带有刚刚被标记的属性
        return event.card && event.card.storage && event.card.storage.qunyou_sc1_guanyong_plus === true;
    },
    content(event, trigger, player) {
        trigger.num++; // 伤害值或回复量 +1
        trigger.card.removeGaintag("qunyou_sc1_guanyong_mark");
        delete trigger.card.storage.qunyou_sc1_guanyong_plus;
        game.log(trigger.card, "受到【冠勇】加成，效果+1");
    },
},
qunyou_sc1_guanyong_cleanup: {
    charlotte: true,
    trigger: { global: "loseAsyncAfter" },
    forced: true,
    popup: false,
    silent: true,
    filter(event, player) {
        const cards = event.getl(player)?.cards2 || [];
        if (!cards.some(c => get.itemtype(c) == "card" && c.storage?.qunyou_sc1_guanyong_plus)) return false;
        // 正在使用中不清理（+1 效果仍需 storage），等 modifier 的 content 负责清理
        if (event.getParent(evt => evt.name === "useCard", false, true)) return false;
        return true;
    },
    content(event, trigger, player) {
        const cards = trigger.getl(player).cards2;
        for (const card of cards) {
            if (get.itemtype(card) == "card" && card.storage?.qunyou_sc1_guanyong_plus) {
                delete card.storage.qunyou_sc1_guanyong_plus;
                card.removeGaintag("qunyou_sc1_guanyong_mark");
            }
        }
    },
},
qunyou_sc1_guanyong_clear: {
    charlotte: true,
    onremove: (player) => {
        delete player.storage.qunyou_sc1_guanyong_marked;
    },
},
qunyou_sc1_pingzheng: {
    audio: 2,
    ai: {
        order: 5,
        result: { player: 1 },
    },
    trigger: { player: "phaseUseBegin" },
    // 出牌阶段开始时即可发动
    filter(event, player) {
        return game.hasPlayer(current => current !== player);
    },
    // 使用 check / cost 询问，把失去体力改为玩家可以选择的项
    async cost(event, trigger, player) {
        event.result = await player.chooseBool(
            get.prompt2("qunyou_sc1_pingzheng"),
            "是否失去1点体力，令至多两名其他角色各选择一项？"
        ).set("ai", () => {
            // AI 判断：若体力大于1且场上有敌人，则倾向于发动
            return player.hp > 1 && game.hasPlayer(current => current !== player && get.attitude(player, current) < 0);
        }).forResult();
    },
    async content(event, trigger, player) {
        // 此时玩家点击了确定，尝试失去1点体力，如果失去了才执行后续
        const loseResult = await player.loseHp(1);
        
        // 确保失去体力成功，且自己依然在场，再选择目标
        if (!player.isIn()) return;

        // 令你选择至多两名其他角色
        const targetResult = await player.chooseTarget(
            "平征：请选择至多两名其他角色",
            [1, 2], // 至多两名
            (card, player, target) => target !== player
        ).set("ai", (target) => {
            // AI 优先选敌人
            return -get.attitude(_status.event.player, target);
        }).forResult();

        if (targetResult && targetResult.bool && targetResult.targets?.length) {
            const targets = targetResult.targets.slice();
            
            // 依次执行
            for (const target of targets) {
                if (!target.isIn() || !player.isIn()) continue;

                // 检查目标是否有两张相同颜色的手牌
                const handcards = target.getCards("h");
                const redCount = handcards.filter(c => get.color(c, target) === "red").length;
                const blackCount = handcards.filter(c => get.color(c, target) === "black").length;
                const canChooseOption2 = (redCount >= 2 || blackCount >= 2);

                const controls = ["选项一：令其摸一张牌并视为对其决斗"];
                if (canChooseOption2) {
                    controls.push("选项二：交给他两张相同颜色的手牌");
                }

                const choiceResult = await target.chooseControl(controls)
                    .set("prompt", `平征：请对 ${get.translation(player)} 选择一项执行`)
                    .set("ai", () => {
                        if (get.attitude(target, player) > 0 && canChooseOption2) {
                            return "选项二：交给他两张相同颜色的手牌";
                        }
                        return "选项一：令其摸一张牌并视为对其决斗";
                    }).forResult();

                if (choiceResult && choiceResult.control) {
                    if (choiceResult.control.includes("选项一")) {
                        await player.draw(1);
                        if (player.isIn() && target.isIn()) {
                            await player.useCard({ name: "juedou", isCard: true }, target, false);
                        }
                    } else if (choiceResult.control.includes("选项二")) {
                        const giveResult = await target.chooseCard(
                            "平征：请选择两张相同颜色的手牌交给 " + get.translation(player),
                            2, true,
                            (card, target) => {
                                const chosen = _status.event.cards || [];
                                if (chosen.length === 0) return true;
                                return get.color(card, target) === get.color(chosen[0], target);
                            }
                        ).set("ai", (card) => {
                            return 6 - get.value(card);
                        }).forResult();

                        if (giveResult && giveResult.bool && giveResult.cards?.length === 2) {
                            await target.give(giveResult.cards, player);
                        }
                    }
                }
            }
        }
    }
},
qunyou_qingjie: {
    audio: 2,
    trigger: { player: "useCardAfter" },
    filter(event, player) {
        const type = get.type2(event.card);
        return type === "basic" || type === "trick" || type === "equip";
    },
    ai: {
        order: 6,
        result: { player: 1 },
    },
    async content(event, trigger, player) {
        const type = get.type2(trigger.card);
        if (type === "basic") {
            const cardsResult = await player.chooseCard({
                position: "h",
                selectCard: [0, Infinity],
                prompt: "轻捷：重铸任意张手牌",
                check: lib.skill.zhiheng.check,
            }).forResult();
            if (cardsResult.cards?.length) {
                await player.recast(cardsResult.cards);
            }
        } else if (type === "trick") {
            const targetResult = await player.chooseTarget(
                "轻捷：弃置一名其他角色一张牌", true,
                (card, p, t) => t !== p && t.countDiscardableCards(p, "he") > 0
            ).set("ai", target => {
                const player = _status.event.player;
                return get.effect(target, { name: "guohe_copy2" }, player, player);
            }).forResult();
            if (targetResult.targets?.length) {
                await player.discardPlayerCard(targetResult.targets[0], "he", true);
            }
        } else if (type === "equip") {
            await player.chooseUseTarget(
                { name: "sha", isCard: true },
                "轻捷：视为使用一张【杀】", false
            );
        }
    },
},
qunyou_zhoujie: {
    audio: 2,
    enable: "phaseUse",
    limited: true,
	ai: {
		order: 5,
		result: { player: 1 },
	},
    filter(event, player) {
        const range = player.getAttackRange();
        if (range <= 0) return false;
        return game.hasPlayer(current =>
            current !== player && current.isIn() &&
            player.inRange(current) &&
            current.countGainableCards(player, "hej") > 0
        );
    },
    async content(event, trigger, player) {
        player.awakenSkill(event.name);
        const range = player.getAttackRange();
        let remaining = range;
        while (remaining > 0) {
            const available = game.filterPlayer(current =>
                current !== player && current.isIn() &&
                player.inRange(current) &&
                current.countGainableCards(player, "hej") > 0
            );
            if (!available.length) break;
            const targetResult = await player.chooseTarget(
                `骤劫：选择要获得牌的角色（剩余${remaining}张）`,
                true,
                (card, p, t) => t !== player && available.includes(t)
            ).set("ai", target => get.attitude(player, target) <= 0 ? 1 : 0).forResult();
            if (!targetResult.bool) break;
            const target = targetResult.targets[0];
            const maxCards = Math.min(remaining, target.countGainableCards(player, "hej"));
            const gainResult = await player.choosePlayerCard(
                target, "hej", true, [1, maxCards]
            ).set("prompt", `骤劫：选择要获得的牌（至多${maxCards}张）`)
             .forResult();
            if (!gainResult.bool || !gainResult.cards?.length) break;
            await player.gain(gainResult.cards, target, "give");
            remaining -= gainResult.cards.length;
        }
    },
},
qunyou_chuandao: {
    audio: 2,
    enable: "phaseUse",
    filter(event, player) {
        return player.countCards("h") > 0;
    },
    async content(event, trigger, player) {
        const cardResult = await player.chooseCard({
            position: "h",
            selectCard: [1, Infinity],
            prompt: "传道：选择要分配的手牌",
        }).set("ai", (card) => {
            const hs = player.getCards("h");
            if (hs.length <= 1) return -1;
            const hasFriend = game.filterPlayer(p => p !== player && get.attitude(player, p) > 0).length > 0;
            const sorted = hs.slice().sort((a, b) => {
                return hasFriend ? get.value(b) - get.value(a) : (6 - get.value(b)) - (6 - get.value(a));
            });
            const giveCount = Math.min(2, hs.length - 1);
            const giveCards = sorted.slice(0, giveCount);
            if (giveCards.includes(card)) return hasFriend ? get.value(card) : 6 - get.value(card);
            return -1;
        }).forResult();
        if (!cardResult.bool || !cardResult.cards?.length) return;
        const cards = cardResult.cards;
        const targetResult = await player.chooseTarget("传道：选择分配目标", true, (card, p, t) => t !== p).set("ai", (target) => {
            const att = get.attitude(player, target);
            if (att > 0) return 1;
            const muzhongOk = !player.storage.qunyou_muzhong;
            const hasShifu = player.hasSkill("qunyou_shifu");
            return (muzhongOk || hasShifu) ? -att : 0;
        }).forResult();
        if (!targetResult.bool || !targetResult.targets?.length) return;
        const target = targetResult.targets[0];
        await player.give(cards, target);
        player.storage.qunyou_chuandao_suits ??= [];
        player.storage.qunyou_chuandao_targets ??= [];
        player.storage.qunyou_chuandao_turnTargets ??= [];
        for (const card of cards) {
            const suit = get.suit(card, player);
            if (lib.suit.includes(suit) && !player.storage.qunyou_chuandao_suits.includes(suit)) {
                player.storage.qunyou_chuandao_suits.push(suit);
            }
        }
        if (!player.storage.qunyou_chuandao_targets.includes(target.playerid)) {
            player.storage.qunyou_chuandao_targets.push(target.playerid);
        }
        if (!player.storage.qunyou_chuandao_turnTargets.includes(target.playerid)) {
            player.storage.qunyou_chuandao_turnTargets.push(target.playerid);
        }
        player.markSkill("qunyou_chuandao");
        if (player.storage.qunyou_chuandao_suits.length >= 4 && !player.storage.qunyou_chuandao_drew) {
            const X = Math.min(player.storage.qunyou_chuandao_turnTargets.length, 3);
            await player.draw(X);
            player.storage.qunyou_chuandao_drew = true;
            player.storage.qunyou_chuandao_suits = [];
            player.storage.qunyou_chuandao_turnTargets = [];
            player.unmarkSkill("qunyou_chuandao");
        }
    },
    ai: {
        order: 6,
        result: { player: 1 },
    },
    mark: true,
    intro: {
        content(storage, player) {
            const suits = player.storage.qunyou_chuandao_suits || [];
            const turnTargets = player.storage.qunyou_chuandao_turnTargets || [];
            const parts = [];
            if (suits.length) parts.push(`花色：${suits.map(s => get.translation(s)).join("、")}`);
            if (turnTargets.length) parts.push(`本回合：${turnTargets.length}人`);
            return parts.length ? parts.join(" | ") : "无记录";
        },
    },
},
qunyou_muzhong: {
    audio: 2,
    enable: "phaseUse",
    limited: true,
    filter(event, player) {
        const targets = player.storage.qunyou_chuandao_targets;
        if (!Array.isArray(targets) || !targets.length) return false;
        return targets.some(id => {
            const p = game.findPlayer(pp => pp.playerid === id);
            return p?.isIn() && p.countCards("h") > 0;
        });
    },
    async content(event, trigger, player) {
        player.awakenSkill(event.name);
        const targetIds = player.storage.qunyou_chuandao_targets || [];
        const available = targetIds.map(id => game.findPlayer(p => p.playerid === id)).filter(p => p?.isIn() && p.countCards("h") > 0);
        if (!available.length) return;
        const targetResult = await player.chooseTarget(
            "募众：选择要令其展示牌的角色（曾对其发动过传道）",
            [1, available.length],
            (card, p, t) => available.includes(t)
        ).set("ai", (target) => {
            return 1;
        }).forResult();
        const targets = targetResult.targets || [];
        if (!targets.length) return;
        const typeSet = new Set();
        for (const target of targets) {
            if (!target.isIn() || !target.countCards("h")) continue;
            const result = await target.chooseCard("h", true, `募众：展示并交给${get.translation(player)}一张牌`).set("ai", (card) => {
                const att = get.attitude(target, player);
                if (att > 0) {
                    const curTypes = new Set(typeSet);
                    player.getCards("he").forEach(c => curTypes.add(get.type2(c)));
                    const cardType = get.type2(card, target);
                    if (!curTypes.has(cardType)) return 20 + get.value(card, target);
                    return 10 - get.value(card, target);
                }
                return 6 - get.value(card, target);
            }).forResult();
            if (result.bool && result.cards?.length) {
                const card = result.cards[0];
                await target.give(card, player);
                typeSet.add(get.type2(card, player));
            }
        }
        if (typeSet.has("basic") && typeSet.has("trick") && typeSet.has("equip")) {
            await player.addSkill("qunyou_qiyi");
            player.popup("起义");
        } else {
            await player.addSkill("qunyou_shifu");
            player.popup("施符");
        }
    },
    ai: {
        order: 1,
        result: { player: 1 },
    },
},
qunyou_qiyi: {
    audio: 2,
    group: ["qunyou_qiyi_gain", "qunyou_qiyi_loss"],
    ai: {
        order: 5,
        result: { player: 1 },
    },
    subSkill: {
        gain: {
            name: "起义",
            trigger: { player: "gainAfter" },
            usable: 1,
            filter(event, player) {
                return event.getParent("phaseDraw")?.player != player;
            },
            async content(event, trigger, player) {
                await player.draw(2);
                const targets = game.filterPlayer(p => p !== player && p.isIn());
                if (!targets.length) return;
                const result = await player.chooseTarget(
                    "起义：分配给至多两名其他角色各一张牌",
                    [1, Math.min(2, targets.length)],
                    (card, p, t) => t !== player
                ).set("ai", (target) => {
                    const player = _status.event.player;
                    const att = get.attitude(player, target);
                    if (att > 0) return att + 5;
                    return 0;
                }).forResult();
                if (result.targets?.length) {
                    for (const target of result.targets) {
                        if (player.countCards("h") > 0) {
                            const giveResult = await player.chooseCard("h", true, `起义：给${get.translation(target)}一张牌`).set("ai", (card) => {
                                const player = _status.event.player;
                                const att = get.attitude(player, target);
                                if (att > 0) return get.value(card, player);
                                return -get.value(card, player);
                            }).forResult();
                            if (giveResult.cards?.length) {
                                await player.give(giveResult.cards, target);
                            }
                        }
                    }
                }
            },
        },
        loss: {
            name: "起义",
            trigger: { player: "loseAfter" },
            usable: 1,
            filter(event, player) {
                const parent = event.getParent();
                return parent?.name !== "phaseDiscard" && parent?.name !== "useCard";
            },
            async content(event, trigger, player) {
                const targets = game.filterPlayer(p => p !== player && p.isIn());
                if (!targets.length) return;
                const result = await player.chooseTarget(
                    "起义：对至多两名其他角色各造成1点雷电伤害",
                    [1, Math.min(2, targets.length)],
                    (card, p, t) => t !== player
                ).set("ai", (target) => {
                    const player = _status.event.player;
                    const damage = get.damageEffect(target, player, player, "thunder");
                    if (damage > 0) return damage + 2;
                    return 0;
                }).forResult();
                if (result.targets?.length) {
                    for (const target of result.targets) {
                        await target.damage(1, "thunder");
                    }
                }
            },
        },
    },
},
qunyou_shifu: {
    audio: 2,
    trigger: { global: "gainAfter" },
    forced: true,
    filter(event, player) {
        if (event.player === player) return false;
        if (_status.currentPhase === event.player) return false;
        if (event.giver !== player) return false;
        const cards = event.getg?.(event.player) || event.cards || [];
        if (cards.some(c => c.hasGaintag?.("qunyou_shifu_return"))) return false;
        return true;
    },
    async content(event, trigger, player) {
        const target = trigger.player;
        if (!target?.isIn()) return;
        const cards = trigger.getg?.(target) || trigger.cards || [];
        if (!cards.length) return;
        await target.addToExpansion(cards, player, "give").forResult();
        for (const card of cards) {
            card.addGaintag("qunyou_shifu_return");
        }
        await target.recover(1);
        if (!target.hasSkill("qunyou_shifu_return")) {
            target.storage.qunyou_shifu_owner = player;
            target.addTempSkill("qunyou_shifu_return", { player: "phaseBeginStartAfter" });
        }
    },
    subSkill: {
        "return": {
            trigger: { player: "phaseBeginStart" },
            forced: true,
            mark: true,
            intro: { content: "expansion", markcount: "expansion" },
            onremove(player, skill) {
                const cards = player.getExpansions(skill);
                if (cards.length) {
                    player.loseToDiscardpile({ cards });
                }
            },
            async content(event, trigger, player) {
                const skillOwner = player.storage.qunyou_shifu_owner;
                if (!skillOwner?.isIn()) {
                    player.removeSkill("qunyou_shifu_return");
                    return;
                }
                const fuCards = player.getExpansions("qunyou_shifu_return");
                if (!fuCards.length) {
                    player.removeSkill("qunyou_shifu_return");
                    return;
                }
                const num = fuCards.length;
                const handCount = player.countCards("h");
                const toGive = Math.min(num, handCount);
                if (toGive > 0) {
                    const result = await player.chooseCard("h", true, toGive, `施符：交给${get.translation(skillOwner)}${toGive}张牌`).forResult();
                    if (result.cards?.length) {
                        await player.give(result.cards, skillOwner);
                    }
                }
                await player.gain(fuCards, player, "give");
                await player.loseHp(1);
                for (const card of fuCards) {
                    card.removeGaintag("qunyou_shifu_return");
                }
                player.removeSkill("qunyou_shifu_return");
            },
        },
    },
},
qunyou_zhenpan: {
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	async content(event, trigger, player) {
		const Y = player.hp - 1;
		if (player.countCards("he") < 1 || player.countCards("he") < Y) return;
        await player.loseHp();
        const X = player.hp;
		const toDiscard = await player.chooseToDiscard("he", true, X).set("prompt", `镇叛：弃置${X}张牌`).forResult();
		if (!toDiscard.bool || !toDiscard.cards.length) return;
		const suits = [...new Set(toDiscard.cards.map(c => get.suit(c, player)).filter(s => lib.suit.includes(s)))];
		if (!suits.length) return;
		const targetResult = await player.chooseTarget("镇叛：选择一名其他角色观看其手牌", true, (card, p, t) => t !== p).set("ai", (target) => {
			const player = _status.event.player;
			if (get.attitude(player, target) > 0) return 0;
			return target.countCards("h");
		}).forResult();
		if (!targetResult.bool || !targetResult.targets.length) return;
		const target = targetResult.targets[0];
		await player.viewHandcards(target);
		target.addTempSkill("qunyou_zhenpan_ban", { global: "phaseJieshuAfter" });
		target.storage.qunyou_zhenpan_ban = suits;
	},
	ai: {
		order: 5,
		result: { player: 1 },
		check(event, player) {
			if (player.hp < 1) return 0;
			if (player.hp === 1) {
				const hasPeach = player.getCards("h").some(c => get.name(c) === "tao");
				const hasJiu = player.getCards("h").some(c => get.name(c) === "jiu");
				if (!hasPeach && !hasJiu) return 0;
			}
			if (player.countCards("he") > player.hp - 1) return 1;
			return 0;
		},
	},
},
qunyou_zhenpan_ban: {
	charlotte: true,
	onremove: true,
	mod: {
		cardEnabled(card, player) {
			const suits = player.storage.qunyou_zhenpan_ban;
			if (suits?.length && suits.includes(get.suit(card))) return false;
		},
		cardRespondable(card, player) {
			const suits = player.storage.qunyou_zhenpan_ban;
			if (suits?.length && suits.includes(get.suit(card))) return false;
		},
		cardSavable(card, player) {
			const suits = player.storage.qunyou_zhenpan_ban;
			if (suits?.length && suits.includes(get.suit(card))) return false;
		},
	},
	mark: true,
	marktext: "镇",
	intro: { content: (storage) => "本回合不能使用或打出" + (storage || []).map(s => get.translation(s)).join("、") + "的牌" },
},
qunyou_kangbian: {
	audio: 2,
	trigger: { player: "useCardToPlayer", global: "useCardToPlayer" },
	usable: 1,
	filter(event, player) {
		if (event.targets.length !== 1) return false;
		if (event.player === player && event.target !== player) return true;
		if (event.target === player && event.player !== player && get.name(event.card) === "sha") return true;
		return false;
	},
	async content(event, trigger, player) {
		const target = trigger.player === player ? trigger.target : trigger.player;
		if (!target.countCards("h")) return;
		const handCards = player.getCards("h");
		const turnDiscards = getTurnDiscardCards();
		const dialogSections = ["抗辩：选择拼点牌"];
		if (handCards.length) dialogSections.push("手牌", handCards);
		if (turnDiscards.length) dialogSections.push("本回合弃牌堆", turnDiscards);
		const chooseResult = await player.chooseButton(dialogSections, true).set("ai", (button) => {
			return 6 - get.value(button.link, player);
		}).forResult();
		if (!chooseResult.bool || !chooseResult.links.length) return;
		const selectedCard = chooseResult.links[0];
		const compare = player.chooseToCompare(target);
		compare.set("fixedResult", { [player.playerid]: selectedCard });
		const { bool: win } = await compare.forResult();
		if (win) {
			const gainTargets = await player.chooseTarget(
				"抗辩：选择至多三名其他角色，获得其各一张手牌",
				[1, 3],
				(card, p, t) => t !== player && t.countCards("h") > 0
			).set("ai", (target) => {
				const player = _status.event.player;
				if (get.attitude(player, target) < 0) return target.countCards("h");
				return 0;
			}).forResult();
			if (gainTargets.bool && gainTargets.targets.length) {
				const gainedCards = [];
				for (const t of gainTargets.targets) {
					const cardResult = await player.gainPlayerCard(t, "h", true).forResult();
					if (cardResult.bool && cardResult.cards.length) {
						gainedCards.push({ target: t, card: cardResult.cards[0] });
					}
				}
				for (const { target: t } of gainedCards) {
					if (player.countCards("h") > 0) {
						const giveResult = await player.chooseCard("h", true, `抗辩：交给${get.translation(t)}一张牌`).set("ai", (card) => {
							return -get.value(card);
						}).forResult();
						if (giveResult.bool && giveResult.cards.length) {
							await player.give(giveResult.cards, t);
						}
					}
				}
			}
		} else {
			await player.loseHp();
		}
	},
	group: "qunyou_kangbian_pindian",
	ai: {
		order: 5,
		result: { player: 1 },
		check(event, player) {
			const target = event.player === player ? event.target : event.player;
			if (get.attitude(player, target) >= 0) return 0;
			const hasBig = player.getCards("h").some(c => get.number(c) >= 10);
			return hasBig ? 1 : 0;
		},
	},
},
qunyou_kangbian_pindian: {
	name: "抗辩·拼点",
	direct: true,
	trigger: { global: "chooseToCompareBegin" },
	filter(event, player) {
		if (event.player !== player && !event.targets?.includes(player) && event.target !== player) return false;
		if (event.fixedResult?.[player.playerid]) return false;
		return getTurnDiscardCards().length > 0;
	},
	async content(event, trigger, player) {
		const handCards = player.getCards("h");
		const turnDiscards = getTurnDiscardCards();
		const dialogSections = ["抗辩·拼点：选择拼点牌"];
		if (handCards.length) dialogSections.push("手牌", handCards);
		if (turnDiscards.length) dialogSections.push("本回合弃牌堆", turnDiscards);
		const result = await player.chooseButton(dialogSections, true).set("ai", (button) => {
			return 6 - get.value(button.link, player);
		}).forResult();
		if (result.bool && result.links.length) {
			trigger.fixedResult = trigger.fixedResult || {};
			trigger.fixedResult[player.playerid] = result.links[0];
		}
	},
},
qunyou_yinshan: {
	audio: 2,
	trigger: { player: "phaseJieshuBegin" },
	async content(event, trigger, player) {
		const handCards = player.getCards("h");
		if (handCards.length) {
			await player.discard(handCards);
		}
		const lostHp = player.maxHp - player.hp;
		if (lostHp > 0) {
			await player.draw(lostHp);
		}
	},
	ai: {
		order: 5,
		result: { player: 1 },
		check(event, player) {
			const handCards = player.getCards("h");
			if (!handCards.length) return 0;
			const totalValue = handCards.reduce((sum, c) => sum + get.value(c, player), 0);
			const avgValue = totalValue / handCards.length;
			const lostHp = player.maxHp - player.hp;
			if (avgValue < 5 && lostHp > handCards.length) return 1;
			return 0;
		},
	},
},// 绮武
qunyou_qiwu: {
    audio: 2,
    trigger: { player: "useCardToPlayered" },
    forced: true,
	mark: true,
	marktext: "绮",
	intro: {
			content(storage,player) {
				const x = player.storage.qunyou_qiwu_X ?? 1;
				const y = player.storage.qunyou_qiwu_Y ?? 1;
				return `弃置${x}张基本牌，造成的伤害 +${y}`;
			},
		},
    // 过滤：你使用的伤害牌指定其他角色为目标
    filter(event, player) {
        if (event.target === player || !event.target.isIn()) return false;
        return get.tag(event.card, "damage") > 0;
    },
    async content(event, trigger, player) {
        const target = trigger.target;
        
				if(player.storage.qunyou_qiwu_X === undefined)
				{
					player.storage.qunyou_qiwu_X = 1;
				}
				if(player.storage.qunyou_qiwu_Y === undefined)
				{
					player.storage.qunyou_qiwu_Y = 1;
				}

        // 动态读取当前的数字，若未被“勤战”加过点，默认值为 1
        const numX = player.storage.qunyou_qiwu_X;
        const numY = player.storage.qunyou_qiwu_Y;

        player.logSkill("qunyou_qiwu", target);

        // 其须弃置 X 张基本牌
        const result = await target.chooseToDiscard(
            `绮武：请弃置 ${numX} 张基本牌，否则此牌不能响应且对其造成的伤害 +${numY}`,
            numX, "he", 
            (card, target) => get.type(card, target) === "basic"
        ).set("ai", (card) => 6 - get.value(card)).forResult();

        // 检查是否足额弃置了基本牌
        if (result?.bool && result.cards?.length === numX) {
            // 找出其中是【杀】的牌
            const shas = result.cards.filter(card => get.name(card, false) === "sha" && get.position(card, true) === "d");
            if (shas.length > 0) {
                await player.gain(shas, "gain2");
            }
        } else {
            // 否则：不能响应此牌
            trigger.directHit.add(target);
            // 且对其造成的伤害 + Y
            // 利用 useCardToPlayered 时机，将增伤逻辑挂载到对应的伤害事件前置或此牌结算中
            target.addTempSkill("qunyou_qiwu_buff");
            target.storage.qunyou_qiwu_buff = (target.storage.qunyou_qiwu_buff || 0) + numY;
        }
    },
    subSkill: {
        buff: {
            charlotte: true,
            trigger: { player: "damageBegin4" },
            forced: true,
            popup: false,
            filter(event, player) {
                return event.getParent().target === player && player.storage.qunyou_qiwu_buff > 0;
            },
            content(event, trigger, player) {
                trigger.num += player.storage.qunyou_qiwu_buff;
                delete player.storage.qunyou_qiwu_buff;
                player.removeSkill("qunyou_qiwu_buff");
            }
        }
    }
},

// 勤战
qunyou_qinzhan: {
	audio: 2,
	group: ["qunyou_qinzhan_attack"],
	trigger: {
		global: ["damageAfter"]
	},
	filter: function(event, player, name) {

		if (name === "damageAfter") {
			return event.player !== player && event.num >= 2;
		}
		return false;
	},
	direct: true,
	content: async function(event, trigger, player) {
		const name = event.triggername;

		if (name === "damageAfter") {
			const result = await player.chooseBool(
				get.prompt("qunyou_qinzhan"),
				"是否减少1点体力上限，并令“绮武”的一个数字+1？"
			).set("ai", () => {
				return player.maxHp > 2;
			}).forResult();
			
			if (result && result.bool) {
				player.logSkill("qunyou_qinzhan", trigger.player);
				await player.loseMaxHp(1);
				
				if(player.storage.qunyou_qiwu_X === undefined)
				{
					player.storage.qunyou_qiwu_X = 1;
				}
				if(player.storage.qunyou_qiwu_Y === undefined)
				{
					player.storage.qunyou_qiwu_Y = 1;
				}
				
				const choice = await player.chooseControl("弃置基本牌数", "对其造成伤害值").set("prompt", "勤战：请选择令〖绮武〗的哪一个数字+1？").forResult();
				
				if (choice.control === "弃置基本牌数") {
					player.storage.qunyou_qiwu_X++;
					game.log(player, "使〖绮武〗的数字", "#y弃置基本牌数", "+1");
				} else {
					player.storage.qunyou_qiwu_Y++;
					game.log(player, "使〖绮武〗的数字", "#y对其造成伤害值", "+1");
				}
				
				// 3. 更新技能标记（如果有标记显示的话）
				//player.updateMarks("qunyou_qiwu");
			}
		}
	}
},
qunyou_qinzhan_attack: {
	name: "勤战",
	audio: 2, // 技能语音数量，可根据实际调整
	charlotte: true,
    trigger: {
        global: "phaseJieshuBegin", // 触发时机：任意角色的结束阶段开始时
    },
	filter: function(event, player) {
        if (!player.hasCard(card => player.canUse(card, player), "hs") && !player.hasCard({name: "sha", isCard: true}, "hs")) {
        }
        
        // 2. 核心逻辑：过滤本回合所有角色的伤害历史记录
        return game.hasPlayer(function(current) {
            // 获取该角色本回合受到的伤害历史
            const history = current.getHistory("damage");
            return history.some(evt => {
                // 判断条件：伤害是由【杀】（sha）造成的
                return evt.card && evt.card.name === "sha";
            });
        });
    },
    check: function(event, player) {
        // AI 检查：判断当前是否有值得使用【杀】的目标
        return player.hasUseTarget({ name: "sha", isCard: true });
    },
    content: async function(event, trigger, player) {
        // 提示发动技能，并引导使用一张【杀】
        await player.chooseToUse({
            prompt: "是否发动【勤战】，使用一张【杀】？",
            filterCard: { name: "sha" }, // 只能选名字为【杀】的牌
            position: "hs" // 从手牌或装备区选择
        }).forResult();
    }
},
qunyou_yongli: {
	audio: 2,
	trigger: { global: "roundStart" },
	forced: true,
	init(player, skill) {
		player.addSkill(skill + "_die");
	},
	onremove(player, skill) {
		player.removeSkill(skill + "_die");
	},
	async content(event, trigger, player) {
		if (player.hasSkill("qunyou_yunmo")) player.removeSkill("qunyou_yunmo");
		if (!player.hasSkill("qunyou_fuzhu")) player.addSkill("qunyou_fuzhu");
		const { result } = await player.chooseTarget(
			"拥立",
			"选择一名其他角色",
			(card, player, target) => target != player
		);
		if (!result?.targets?.length) return;
		const target = result.targets[0];
		if (target.hasSkill("tianming")) {	
			target.addTempSkill("twzhuiting", "roundEnd");
		} else {
			target.addTempSkill("tianming", "roundEnd");
		}
		player.storage.qunyou_yongli_target = target;
		target.addTempSkill("qunyou_yongli_mark", "roundEnd");
	},
	subSkill: {
		die: {
			trigger: { global: "dieAfter" },
			forced: true,
			filter(event, player) {
				return player.storage.qunyou_yongli_target?.playerid == event.player.playerid;
			},
			async content(event, trigger, player) {
				delete player.storage.qunyou_yongli_target;
				player.addSkill("qunyou_yunmo");
				player.removeSkill("qunyou_fuzhu");
			},
		},
		mark: {
			mark: true,
			intro: { content: "被董相国拥立了" },
		},
	},
},
qunyou_taoning: {
	audio: 2,
	trigger: { player: "useCardToPlayer" },
	usable: 1,
	filter(event, player) {
		if (event.targets.length != 1) return false;
		if (event.player == player && get.type(event.card) == "basic") return true;
		return event.target == player && get.suit(event.card) == "none";
	},
	async content(event, trigger, player) {
		const { result } = await player.chooseControl("摸两张牌", "造成1点伤害")
			.set("prompt", get.prompt("qunyou_taoning"))
			.set("ai", () => Math.random() < 0.5 ? "摸两张牌" : "造成1点伤害");
		if (result.control == "摸两张牌") await player.draw(2);
		else await _status.currentPhase.damage(1, player);
	},
},
qunyou_fuzhu: {
	audio: 2,
	trigger: { source: "damageAfter" },
	usable: 1,
	filter(event, player) {
		return player.storage.qunyou_yongli_target?.isIn();
	},
	async content(event, trigger, player) {
		await player.draw(2);
		const target = player.storage.qunyou_yongli_target;
		const result = await player.chooseCard({
			position: "h",
			selectCard: [2, 2],
			forced: true,
			prompt: "选择两张牌交给" + get.translation(target),
		}).set("ai", card => get.value(card)).forResult();
		if (result.cards?.length) {
			await player.give(result.cards, target);
		}
		const current = _status.currentPhase;
		const allSkills = current.getSkills(null, false, false);
		const skills = allSkills.filter(id => {
			const info = lib.translate[id + "_info"];
			const count = get.skillCount(id, current);
			const triggerCount = current.getStat("triggerSkill")[id];
			return info && info.match(/"?出牌阶段限一次/g) &&
				(get.skillCount(id, current) > 0 || current.getStat("triggerSkill")[id] > 0);
		});
		if (skills.length) {
		const controlResult = await player.chooseControl(skills, "cancel2")
			.set("prompt", "为" + get.translation(current) + "选择一个技能重置为未发动")
			.set("ai", () => skills[0])
			.forResult();
			if (controlResult.control != "cancel2") {
				delete current.getStat("skill")[controlResult.control];
				delete current.getStat("triggerSkill")[controlResult.control];
			}
		}
	},
},
qunyou_yunmo: {
	audio: 2,
	trigger: { player: "damageBegin2" },
	forced: true,
	filter(event, player) {
		return get.type(event.card) == "trick";
	},
	async content(event, trigger, player) {
		trigger.num++;
	},
},
qunyou_gouxian: {
	audio: 2,
	trigger: { player: "useCard2" },
	filter(event, player) {
		player.storage.qunyou_gouxian_used = player.storage.qunyou_gouxian_used || [];
		if (player.storage.qunyou_gouxian_used.includes(event.card.name)) return false;
		const type = get.type(event.card);
		if (type !== "basic" && type !== "trick") return false;
		if (get.tag(event.card, "damage")) return true;
		return event.targets && event.targets.some(t => get.itemtype(t) === "player" && t !== player);
	},
	check(event, player) {
		if (get.tag(event.card, "damage")) return true;
		return event.targets && event.targets.length > 1;
	},
	async content(event, trigger, player) {
		player.storage.qunyou_gouxian_used = player.storage.qunyou_gouxian_used || [];
		player.storage.qunyou_gouxian_used.push(trigger.card.name);
		player.addTempSkill("qunyou_gouxian_clear", { player: "phaseBefore" });
		if (get.tag(trigger.card, "damage")) {
			
			const targetResult = await player.chooseTarget(
				"将" + get.translation(trigger.card) + "交给一名其他角色",
				lib.filter.notMe
			).set("ai", target => -1).forResult();
			if (targetResult.targets && targetResult.targets.length) {
				player.storage.qunyou_gouxian_giveTarget = targetResult.targets[0];
				player.storage.qunyou_gouxian_giveCard = trigger.card;
				player.addTempSkill("qunyou_gouxian_give", "roundEnd");
			}
		} else {
			
			player.storage.qunyou_gouxian_effect = {
				card: trigger.card,
				targets: trigger.targets.slice(),
			};
			trigger.targets = [];
			player.addTempSkill("qunyou_gouxian_effect", "roundEnd");
		}
	},
	subSkill: {
		clear: {
			onremove(player) {
				player.storage.qunyou_gouxian_used = [];
			},
			charlotte: true,
		},
		give: {
			trigger: { player: "useCardAfter" },
			forced: true,
			popup: false,
			charlotte: true,
			filter(event, player) {
				return !!player.storage.qunyou_gouxian_giveTarget;
			},
			async content(event, trigger, player) {
				const target = player.storage.qunyou_gouxian_giveTarget;
				const card = player.storage.qunyou_gouxian_giveCard;
				delete player.storage.qunyou_gouxian_giveTarget;
				delete player.storage.qunyou_gouxian_giveCard;
				const giveCards = card.cards || [card];
				await player.give(giveCards, target);
			},
			onremove(player) {
				delete player.storage.qunyou_gouxian_giveTarget;
				delete player.storage.qunyou_gouxian_giveCard;
			},
		},
		effect: {
			trigger: { player: "useCardAfter" },
			forced: true,
			popup: false,
			charlotte: true,
			filter(event, player) {
				return !!player.storage.qunyou_gouxian_effect;
			},
			async content(event, trigger, player) {
				const info = player.storage.qunyou_gouxian_effect;
				delete player.storage.qunyou_gouxian_effect;
				const targetResult = await player.chooseTarget(
					"选择" + get.translation(info.card) + "的一名目标角色",
					(card, player, target) => target !== player && info.targets.includes(target)
				).set("ai", target => -1).forResult();
				if (!targetResult.targets || !targetResult.targets.length) return;
				const target = targetResult.targets[0];
				const handCards = target.getCards("h");
				if (!handCards.length) return;
				await target.showCards(handCards, get.translation(player) + "发动了【构陷】");
				const damageCards = handCards.filter(c => get.tag(c, "damage"));
				const nonDamageCards = handCards.filter(c => !get.tag(c, "damage"));
				if (damageCards.length && nonDamageCards.length) {
					const choice = await player.chooseControl("使用伤害牌", "弃置非伤害牌")
						.set("prompt", "构陷：选择对" + get.translation(target) + "的处理方式")
						.set("ai", () => "使用伤害牌")
						.forResult();
					if (choice.control === "使用伤害牌") {
						await qunyou_gouxian_useDamageCards(player, target, damageCards);
					} else {
						await target.discard(nonDamageCards);
					}
				} else if (damageCards.length) {
					await qunyou_gouxian_useDamageCards(player, target, damageCards);
				} else {
					await target.discard(nonDamageCards);
				}
			},
			onremove(player) {
				delete player.storage.qunyou_gouxian_effect;
			},
		},
	},
},

// === 清界 ===
yachai_qingjie: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		const used = player.storage.yachai_qingjie_used || [];
		return used.length < 2;
	},
	chooseButton: {
		dialog(event, player) {
			const dialog = ui.create.dialog("清界", "hidden");
			dialog.add([
				[
					["draw", "摸牌至体力上限"],
					["discard", "弃置至少一张手牌"],
				],
				"textbutton",
			]);
			return dialog;
		},
		filter(button, player) {
			const used = player.storage.yachai_qingjie_used || [];
			return !used.includes(button.link);
		},
		check(button) {
			const player = _status.event.player;
			if (button.link === "draw") return player.countCards("h") < player.maxHp ? 5 : 1;
			return player.countCards("h") > 0 ? 5 : 1;
		},
		backup(links) {
			return get.copy(lib.skill["yachai_qingjie_" + links[0]]);
		},
		prompt(links) {
			if (links[0] === "draw") return "摸牌至体力上限";
			return "弃置至少一张手牌";
		},
	},
	group: ["yachai_qingjie_end", "yachai_qingjie_clear"],
	subSkill: {
		backup: { audio: "yachai_qingjie" },
		draw: {
			audio: "yachai_qingjie",
			filterCard: () => false,
			selectCard: -1,
			async content(event, trigger, player) {
				const toDraw = player.maxHp - player.countCards("h");
				if (toDraw > 0) await player.draw(toDraw);
				if (!player.storage.yachai_qingjie_used) player.storage.yachai_qingjie_used = [];
				player.storage.yachai_qingjie_used.push("draw");
			},
		},
		discard: {
			audio: "yachai_qingjie",
			filterCard: true,
			selectCard: [1, Infinity],
			async content(event, trigger, player) {
				await player.discard(event.cards);
				if (!player.storage.yachai_qingjie_used) player.storage.yachai_qingjie_used = [];
				player.storage.yachai_qingjie_used.push("discard");
			},
		},
		end: {
			trigger: { player: "phaseUseEnd" },
			direct: true,
			filter(event, player) {
				const used = player.storage.yachai_qingjie_used || [];
				return used.length < 2;
			},
			async content(event, trigger, player) {
				const used = player.storage.yachai_qingjie_used || [];
				const available = ["draw", "discard"].filter(item => !used.includes(item));
				if (!available.length) return;
				let choice;
				if (available.length === 2) {
					const buttonResult = await player.chooseButton(["清界：选择一项令一名其他角色执行", [
						[["draw", "摸牌至体力上限"], ["discard", "弃置至少一张手牌"]],
						"textbutton",
					]]).set("ai", button => {
						const player = _status.event.player;
						const hasAllyNeedingCards = game.filterPlayer(t =>
							t !== player && get.attitude(player, t) > 0 && t.countCards("h") < t.maxHp
						).length > 0;
						const hasEnemyWithCards = game.filterPlayer(t =>
							t !== player && get.attitude(player, t) < 0 && t.countCards("h") > 0
						).length > 0;
						if (button.link === "draw" && hasAllyNeedingCards) return 5;
						if (button.link === "discard" && hasEnemyWithCards) return 5;
						return 1;
					}).forResult();
					if (!buttonResult.bool || !buttonResult.links?.length) return;
					choice = buttonResult.links[0];
				} else {
					choice = available[0];
				}
				const targetResult = await player.chooseTarget("清界：令一名其他角色" + (choice === "draw" ? "摸牌至体力上限" : "弃置至少一张手牌"), true, (card, p, t) => t !== p)
					.set("ai", target => {
						const player = _status.event.player;
						if (choice === "draw") {
							const toDraw = target.maxHp - target.countCards("h");
							if (toDraw <= 0) return 0;
							return get.attitude(player, target) > 0 ? toDraw : 0;
						} else {
							if (target.countCards("h") <= 0) return 0;
							return get.attitude(player, target) < 0 ? 1 : 0;
						}
					})
					.forResult();
				if (!targetResult.bool || !targetResult.targets?.length) return;
				const target = targetResult.targets[0];
				if (choice === "draw") {
					const toDraw = target.maxHp - target.countCards("h");
					if (toDraw > 0) await target.draw(toDraw);
				} else {
					await target.chooseToDiscard("清界：弃置至少一张手牌", "h", [1, Infinity], true)
						.set("ai", card => -get.value(card))
						.forResult();
				}
			},
		},
		clear: {
			trigger: { player: "phaseUseAfter" },
			forced: true,
			popup: false,
			async content(event, trigger, player) {
				delete player.storage.yachai_qingjie_used;
			},
		},
	},
},

// === 鉴识 ===
yachai_jianshi: {
	enable: "phaseUse",
	usable: 1,
	audio: 2,
	filter(event, player) {
		return player.countCards("hse") > 0;
	},
	filterTarget(card, player, target) {
		return target != player;
	},
	ai: {
		order: 5,
		result: { target: 1 },
	},
	async content(event, trigger, player) {
		const result = await player.chooseCard("hse", "展示一张牌").set("ai", card => -get.value(card)).forResult();
		if (!result.bool || !result.cards || !result.cards.length) return;
		const card = result.cards[0];
		await player.showCards(card);
		const target = event.targets[0];
		await player.give(card, target);
		const color = get.color(card);
		target.storage.yachai_jianshi_effect = color;
		target.addTempSkill("yachai_jianshi_watcher", { player: "phaseBegin" });
	},
	subSkill: {
		watcher: {
			mark: true,
			intro: {
				content: (storage, player) => {
					const color = player.storage.yachai_jianshi_effect;
					if (!color) return "";
					return "鉴识等待：" + (color === "red" ? "红" : "黑");
				},
			},
			onremove(player) {
				if (player.storage.yachai_jianshi_effect) {
					player.addTempSkill("yachai_jianshi_effect", { player: "phaseEnd" });
				}
			},
		},
		effect: {
			trigger: { player: "useCard" },
			forced: true,
			popup: false,
			mark: true,
			intro: {
				content: (storage, player) => {
					const color = player.storage.yachai_jianshi_effect;
					if (!color) return "";
					return "鉴识生效：" + (color === "red" ? "红" : "黑");
				},
			},
			filter(event, player) {
				return player.storage.yachai_jianshi_effect &&
					get.color(event.card) === player.storage.yachai_jianshi_effect;
			},
			async content(event, trigger, player) {
				await player.gain(get.bottomCards(1));
			},
			onremove(player) {
				delete player.storage.yachai_jianshi_effect;
			},
		},
	},
},

// === 时变 ===
yachai_shibian: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: {
		global: ["drawAfter", "gainAfter", "cardsGotoPileAfter"],
	},
	filter(event, player) {
		if (player.storage.yachai_shibian_disabled) return false;
		const bottom = ui.cardPile.lastChild;
		const last = player.storage.yachai_shibian_lastBottom;
		if (bottom !== last) {
			player.storage.yachai_shibian_lastBottom = bottom;
			return true;
		}
		return false;
	},
	async content(event, trigger, player) {
		await player.draw();
		player.storage.yachai_shibian_count = (player.storage.yachai_shibian_count || 0) + 1;
		if (player.storage.yachai_shibian_count > player.maxHp && _status.currentPhase) {
			player.storage.yachai_shibian_disabled = true;
			await player.loseHp(1);
		}
	},
	group: "yachai_shibian_reset",
	subSkill: {
		reset: {
			trigger: { global: "phaseBegin" },
			forced: true,
			popup: false,
			async content(event, trigger, player) {
				player.storage.yachai_shibian_lastBottom = ui.cardPile.lastChild;
				player.storage.yachai_shibian_count = 0;
				delete player.storage.yachai_shibian_disabled;
			},
		},
	},
},

// === 陈训 ===
yachai_chenxun: {
	audio: 2,
	usable: 1,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		if (event.player !== _status.currentPhase) return false;
		if (get.tag(event.card, "damage") > 0 !== true) return false;
		const top = ui.discardPile.lastChild;
		return top && top.previousSibling;
	},
	async content(event, trigger, player) {
		const cards = [ui.discardPile.lastChild, ui.discardPile.lastChild.previousSibling];
		const next = player.chooseToMove("陈训：点击或拖动将牌置于牌堆顶或牌堆底", true);
		next.set("list", [["牌堆顶", cards], ["牌堆底"]]);
		next.set("processAI", function (list) {
			const cards = list[0][1].slice(0);
			cards.sort((a, b) => get.value(b) - get.value(a));
			return [cards, []];
		});
		const result = await next.forResult();
		if (result?.bool) {
			const toTop = result.moved[0] || [];
			const toBottom = result.moved[1] || [];
			toTop.reverse();
			await game.cardsGotoPile(toTop.concat(toBottom), ["top_cards", toTop], (evt, card) => {
				if (evt.top_cards.includes(card)) return ui.cardPile.firstChild;
				return null;
			});
		}

		if (trigger.player === player) {
			trigger.addCount = false;
			const stat = player.getStat("card");
			const card = trigger.card;
			if (typeof stat[card.name] === "number" && stat[card.name] > 0) {
				stat[card.name]--;
			}
		}
	},
},

// === 沦佚 ===
clanlunyi: {
	audio: 2,
	clanSkill: true,
	locked: true,
	forced: true,
	trigger: {
		global: ["loseAfter", "cardsDiscardAfter", "loseAsyncAfter","equipAfter","addJudgeAfter","addToExpansionAfter"],
	},
	filter(event, player) {
		const cards = event.getd();
		if (!cards || !cards.length) return false;
		let clanPlayer = event.player;
		if (!clanPlayer || !clanPlayer.hasClan("清河崔氏")) {
			clanPlayer = null;
			if (event.name === "cardsDiscard") {
				const parent = event.getParent();
				const src = parent?.relatedEvent?.player || parent?.player;
				if (src && src.hasClan("清河崔氏")) clanPlayer = src;
			}
			if (!clanPlayer) return false;
		}
		event._clanlunyi_target = clanPlayer;
		return true;
	},
	async content(event, trigger, player) {
		const cards = trigger.getd().filter(c => c && get.itemtype(c) === "card");
		if (!cards.length) return;
		let card;
		if (cards.length === 1) {
			card = cards[0];
		} else {
			const result = await player.chooseButton(["选择一张牌置于牌堆底", cards]).set("ai", () => -1).forResult();
			if (!result.bool || !result.links || !result.links.length) return;
			card = result.links[0];
		}
		await game.cardsGotoPile(card);
	},
},

// === 潜章 ===
clanqianzhang: {
	audio: 2,
	clanSkill: true,
	locked: true,
	trigger: { player: "phaseEnd" },
	filter(event, player) {
		const first = player.storage.clanqianzhang_first;
		const last = player.storage.clanqianzhang_last;
		return first && last && first === last;
	},
	async content(event, trigger, player) {
		const evt = trigger.getParent("phase", true, true);
		if (evt?.phaseList) {
			evt.phaseList.splice(evt.num + 1, 0, "phaseUse|clanqianzhang");
		}
	},
	group: ["clanqianzhang_track", "clanqianzhang_reset"],
	subSkill: {
		track: {
			trigger: { global: "useCard" },
			forced: true,
			popup: false,
			filter(event, player) {
				return event.player && event.player.hasClan("琅琊王氏");
			},
			async content(event, trigger, player) {
				if (!player.storage.clanqianzhang_first) {
					player.storage.clanqianzhang_first = trigger.card.name;
				}
				player.storage.clanqianzhang_last = trigger.card.name;
			},
		},
		reset: {
			trigger: { global: "phaseAfter" },
			forced: true,
			popup: false,
			async content(event, trigger, player) {
				delete player.storage.clanqianzhang_first;
				delete player.storage.clanqianzhang_last;
			},
		},
	},
},

// === 训礼 ===
clanxunli: {
	audio: 2,
	clanSkill: true,
	trigger: {
		global: ["loseAfter", "equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
	},
	usable: 1,
	check(event, player) {
		const target = event._clanxunli_target;
		if (!target) return false;
		return target === player || get.attitude(player, target) > 0;
	},
	filter(event, player) {
		const targets = game.filterPlayer(current => {
			if (!current.hasClan("吴郡陆氏") || !current.isIn()) return false;
			const evt = event.getl(current);
			if (!evt) return false;
			return ["h", "e", "j"].some(pos =>
				Array.isArray(evt[pos + "s"]) && evt[pos + "s"].length && !current.countCards(pos)
			);
		});
		if (targets.length) {
			event._clanxunli_target = targets[0];
			return true;
		}
		return false;
	},
	async content(event, trigger, player) {
		const target = trigger._clanxunli_target || trigger.player;
		player.logSkill("clanxunli", target);
		await target.draw();
	},
},

// === 砺剑 ===
yachai_lijian: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("h") > 0;
	},
	ai: {
		order: 2,
		result: {
			player(player) {
				const types = new Set(player.getCards("h").map(c => get.type2(c)));
				return types.size <= 2 ? 1 : -1;
			},
		},
	},
	async content(event, trigger, player) {
		while (true) {
			const before = player.getCards("h");
			if (!before.length) break;
			player.storage.yachai_lijian_beforeVal = before.reduce((sum, c) => sum + get.value(c, player), 0);
			const beforeTypes = new Set(before.map(c => get.type2(c)));
			await player.discard(before);
			await player.draw(before.length);
			await player.showHandcards(get.translation(player) + "发动了【砺剑】");
			const after = player.getCards("h");
			const afterTypes = new Set(after.map(c => get.type2(c)));
			if (afterTypes.size <= beforeTypes.size) break;
			player.logSkill("yachai_lijian");
			const targetResult = await player.chooseTarget("砺剑：选择火【杀】的目标", function(card, player, target) {
				return player.canUse({ name: "sha", nature: "fire", isCard: true }, target);
			}).set("ai", function(target) {
				return get.effect(target, { name: "sha", nature: "fire", isCard: true }, get.player());
			}).forResult();
			if (targetResult.bool && targetResult.targets.length) {
				await player.useCard({ name: "sha", nature: "fire", isCard: true }, targetResult.targets[0]);
			}
			const again = await player.chooseBool("是否重复【砺剑】流程？")
				.set("ai", () => {
					const p = _status.event.player;
					const beforeVal = p.storage.yachai_lijian_beforeVal || 0;
					const afterVal = p.getCards("h").reduce((sum, c) => sum + get.value(c, p), 0);
					delete p.storage.yachai_lijian_beforeVal;
					return afterVal > beforeVal ? 1 : 0;
				})
				.forResult();
			if (!again.bool) break;
		}
	},
},

// === 蹚祸 ===
yachai_tanghuo: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { target: "useCardToTarget" },
	filter(event, player) {
		if (event.player === player) return false;
		if (player.storage.yachai_tanghuo_used) return false;
		return true;
	},
	async content(event, trigger, player) {
		player.storage.yachai_tanghuo_used = true;
		player.addTempSkill("yachai_tanghuo_used", { global: "phaseBefore" });
		const source = trigger.player;
		const skillCount = source.getSkills().length;
		if (skillCount > source.hp) {
			await player.discard(player.getCards("h"));
		} else {
			await player.draw();
		}
	},
	subSkill: {
		used: {
			charlotte: true,
			onremove: true,
		},
	},
},

// === 潜礁 ===
yachai_qianjiao: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return !player.getExpansions("yachai_qianjiao").length;
	},
	async content(event, trigger, player) {
		const hps = game.filterPlayer(p => p.isAlive()).map(p => p.hp);
		const x = Math.max(1, Math.max(...hps) - Math.min(...hps));
		await player.addToExpansion(get.cards(x), "gain2").gaintag.add("yachai_qianjiao");
	},
	mark: true,
	intro: { content: "expansion", markcount: "expansion" },
	onremove(player, skill) {
		const cards = player.getExpansions(skill);
		if (cards.length) player.loseToDiscardpile(cards);
	},
	ai: {
		order: 1,
		result: { player: 1 },
	},
},

// === 暗潮 ===
yachai_anchao: {
	audio: 2,
	global: "yachai_anchao_global",
	subSkill: {
		global: {
			enable: "phaseUse",
			filter(event, player) {
				if (!player.countCards("h")) return false;
				return game.hasPlayer(current => current.hasSkill("yachai_anchao") && !current.hasSkill("yachai_anchao_used"));
			},
			selectTarget: 1,
			filterTarget(card, player, target) {
				return target.hasSkill("yachai_anchao") && !target.hasSkill("yachai_anchao_used");
			},
			async content(event, trigger, player) {
				const target = event.targets[0];
				target.addTempSkill("yachai_anchao_used", "phaseUseEnd");
				if (player !== target) {
					const hs = player.getCards("h");
					if (!hs.length) return;
					const result = await target.chooseButton(["暗潮：观看" + get.translation(player) + "的手牌并获得其中一张", hs])
						.set("ai", button => -get.value(button.link))
						.forResult();
					if (!result.bool || !result.links?.length) return;
					await target.gain(result.links[0], player, "give");
				}

				const jiao = target.getExpansions("yachai_qianjiao");
				if (!jiao.length) return;
				if (player !== target) {
					const choice = await target.chooseControl("令其使用或获得一张礁", "取消")
						.set("prompt", "暗潮：是否令" + get.translation(player) + "观看你的礁？")
						.set("ai", () => {
							if (get.attitude(target, player) > 0) return "令其使用或获得一张礁";
							const jiao = target.getExpansions("yachai_qianjiao");
							if (jiao.length && jiao.every(c => !player.hasUseTarget(c, true, false))) return "令其使用或获得一张礁";
							return "取消";
						})
						.forResult();
					if (choice.control === "取消") return;
				}

				const pick = await player.chooseButton(["暗潮：选择一张礁", jiao])
					.set("ai", button => {
						const p = _status.event.player;
						const card = button.link;
						if (p.hasClan("太原王氏")) {
							if (p.hasUseTarget(card, true, false)) return p.getUseValue(card) + 4;
							return get.value(card, p);
						} else {
							if (!p.hasUseTarget(card, true, false)) return get.value(card, p) + 5;
							return p.getUseValue(card);
						}
					})
					.forResult();
				if (!pick.bool || !pick.links?.length) return;
				const card = pick.links[0];

				if (player.hasUseTarget(card, true, false)) {
					const action = await player.chooseControl("使用此牌", "获得此牌")
						.set("prompt", "暗潮：选择对" + get.translation(card) + "执行的操作")
						.set("ai", () => {
							const p = _status.event.player;
							return p.getUseValue(card) > get.value(card, p) ? "使用此牌" : "获得此牌";
						})
						.forResult();
					if (action.control === "使用此牌") {
						await player.chooseUseTarget(card, true, false);
					} else {
						await player.gain(card, "gain2");
					}
				} else {
					await player.gain(card, "gain2");
				}


			},
			ai: {
				order: 5,
				result: {
					player(player, target) {
						if (!target) {
							const owners = game.filterPlayer(p => p.hasSkill("yachai_anchao") && !p.hasSkill("yachai_anchao_used"));
							if (!owners.length) return 0;
							target = owners[0];
						}
						if (get.attitude(player, target) > 0) {
							const jiao = target.getExpansions("yachai_qianjiao");
							if (jiao.length) return 3;
							const hand = player.countCards("h");
							if (hand >= player.hp) return 2;
							if (hand >= 3) return 1;
							if (hand === 2) return 0.5;
							return -1;
						}
						const jiao = target.getExpansions("yachai_qianjiao");
						if (jiao.length && jiao.every(c => !player.hasUseTarget(c, true, false))) return 0.3;
						return -2;
					},
				},
			},
		},
		used: { charlotte: true },
	},
},

// === 诣降 ===
yachai_yijiang: {
	audio: 2,
	trigger: { global: "phaseUseBegin" },
	round: 1,
	filter(event, player) {
		const target = event.player;
		if (target === player) return false;
		return target.getHandcardLimit() > player.getHandcardLimit();
	},
	check(event, player) {
		const target = event.player;
		if (get.attitude(player, target) <= 0) return false;
		return game.filterPlayer(p => p.isAlive() && get.attitude(player, p) > 0 && p !== player)
			.every(p => target.getHandcardLimit() >= p.getHandcardLimit());
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const myLimit = player.getHandcardLimit();
		const targetLimit = target.getHandcardLimit();
		const X = targetLimit - myLimit;

		if (player.hasSkill("yachai_yijiang_dist")) {
			player.removeSkill("yachai_yijiang_dist");
		}

		lib.skill.chenliuwushi.change(player, X);
		player.addSkill("yachai_yijiang_dist");
		player.addMark("yachai_yijiang_dist", X, false);

		await player.draw(X);
		await target.draw(X);
	},
	subSkill: {
		dist: {
			charlotte: true,
			onremove: true,
			mod: {
				globalFrom(from, to, distance) {
					return distance - from.countMark("yachai_yijiang_dist");
				},
			},
			intro: { content: "距离与其他角色的距离-#" },
		},
	},
},

// === 解任 ===
yachai_jieren: {
	audio: 2,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		return player === _status.currentPhase && player.getHandcardLimit() > 0;
	},
	check(event, player) {
		if (player.getHandcardLimit() <= 1) return false;
		const hasEnemy = event.targets && event.targets.some(t => get.attitude(player, t) < 0);
		if (hasEnemy) return true;
		if (player.countCards("h") >= player.getHandcardLimit()) return false;
		const defense = player.countCards("h", c => c.name === "jink" || c.name === "tao" || get.subtype(c) === "armor");
		return player.getHandcardLimit() >= 3 || (player.getHandcardLimit() === 2 && defense === 0);
	},
	async content(event, trigger, player) {
		lib.skill.chenliuwushi.change(player, -1);

		const controls = ["摸一张牌"];
		if (trigger.targets && trigger.targets.length) {
			controls.push("令目标弃牌");
		}

		const choice = await player.chooseControl(...controls)
			.set("prompt", "解任：摸一张牌或令其中一个目标弃置一张牌")
			.set("ai", () => {
				const p = _status.event.player;
				const hasEnemy = _status.event.getTrigger().targets && _status.event.getTrigger().targets.some(t => get.attitude(p, t) < 0);
				if (hasEnemy) return "令目标弃牌";
				return "摸一张牌";
			})
			.forResult();
		if (choice.control === "摸一张牌") {
			await player.draw();
		} else if (trigger.targets && trigger.targets.length) {
			const tResult = await player.chooseTarget("解任：选择弃牌目标", true, (card, player, target) => trigger.targets.includes(target))
				.set("ai", target => -get.attitude(player, target))
				.forResult();
			if (tResult.bool && tResult.targets.length) {
				await tResult.targets[0].chooseToDiscard("he", true);
			}
		}
	},
},

// === 赍志 ===
yachai_jizi: {
	audio: 2,
	forced: true,
	trigger: { global: "roundStart" },
	async content(event, trigger, player) {
		const result = await player.chooseTarget({
			prompt: "赍志：选择一名其他角色",
			forced: true,
			filterTarget: lib.filter.notMe,
			ai(target) {
				return -get.attitude(get.player(), target);
			},
		}).forResult();
		if (!result.bool) return;
		const target = result.targets[0];
		player.line(target, "green");
		await target.damage(1);
		player.storage.yachai_jizi_target = target;
		player.addTempSkill("yachai_jizi_effect", { global: "roundStart" });
	},
	subSkill: {
		effect: {
			forced: true,
			trigger: { global: "roundEnd" },
			async content(event, trigger, player) {
				const target = player.storage.yachai_jizi_target;
				delete player.storage.yachai_jizi_target;
				if (!target || !target.isAlive()) return;
				const card = { name: "sha", nature: "ice", isCard: true };
				if (target.canUse(card, player, false)) {
					await target.useCard(card, player, false);
				}
			},
		},
	},
},

// === 推诚 ===
yachai_tuicheng: {
	audio: 2,
	forced: true,
	trigger: { player: "phaseZhunbeiBegin" },
	async content(event, trigger, player) {
		const result = await player.chooseCardTarget({
			prompt: "推诚：选择一张牌和目标角色",
			filterCard: true,
			selectCard: 1,
			position: "he",
			filterTarget: lib.filter.notMe,
			selectTarget: 1,
			forced: true,
			ai1(card) {
				return -get.value(card);
			},
			ai2(target) {
				return -get.attitude(get.player(), target);
			},
		}).forResult();
		if (!result.bool) return;
		const card = result.cards[0];
		const target = result.targets[0];
		player.line(target);
		const vcard = get.autoViewAs({ name: "tiesuo" }, [card]);
		await player.useCard({ card: vcard, cards: [card], targets: [player, target] });
		player.storage.yachai_tuicheng_target = target;
		player.addTempSkill("yachai_tuicheng_effect", "phaseAfter");
	},
	subSkill: {
		effect: {
			forced: true,
			trigger: { player: "phaseJieshuBegin" },
			async content(event, trigger, player) {
				const target = player.storage.yachai_tuicheng_target;
				delete player.storage.yachai_tuicheng_target;
				if (!target || !target.isAlive()) return;
				const cards = target.getCards("he");
				if (!cards.length) return;
				const card = cards.sort((a, b) => get.value(a) - get.value(b))[0];
				const vcard = get.autoViewAs({ name: "huogong" }, [card]);
				if (target.canUse(vcard, player, false)) {
					await target.useCard({ card: vcard, cards: [card], targets: [player] });
				}
			},
		},
	},
},

// === 萦香 ===
yachai_yingxiang: {
	audio: 2,
	forced: true,
	trigger: {
		global: ["loseAfter", "cardsDiscardAfter", "loseAsyncAfter", "equipAfter", "addJudgeAfter", "addToExpansionAfter"],
	},
	filter(event, player) {
		if (player === _status.currentPhase) return false;
		if (!player.storage.yachai_yingxiang_firstLost) return false;
		if (!event.getd() || !event.getd().length) return false;
		let src = event.player;
		if (!src || src !== player) {
			src = null;
			if (event.name === "cardsDiscard") {
				const parent = event.getParent();
				src = parent?.relatedEvent?.player || parent?.player;
			}
			if (src !== player) return false;
		}
		return true;
	},
	async content(event, trigger, player) {
		const skill = player.storage.yachai_yingxiang_firstLost;
		game.log(`萦香 content: 准备恢复技能 firstLost=${skill}`);
		delete player.storage.yachai_yingxiang_firstLost;
		if (!lib.skill[skill] || player.hasSkill(skill)) return;
		player.addSkill(skill);
		game.log(`萦香 content: 已恢复技能 ${skill}`);
	},
	init(player, skill) {
		if (!lib.skill.yachai_yingxiang._hook) {
			lib.skill.yachai_yingxiang._hook = true;
			lib.hooks.removeSkillCheck.push(function(removedSkill, p) {
				if (p.hasSkill("yachai_yingxiang") && !p.storage.yachai_yingxiang_firstLost) {
					p.storage.yachai_yingxiang_firstLost = removedSkill;
					game.log(`萦香 hook: 记录 firstLost = ${removedSkill}`);
				}
			});
		}
		game.log(`萦香 init: 已注册钩子`);
	},
	subSkill: {
		clear: {
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			async content(event, trigger, player) {
				delete player.storage.yachai_yingxiang_firstLost;
			},
		},
	},
},

// === 雄姿 ===
qunyou_xiongzi: {
	audio: 2,
	trigger: { player: "phaseBegin" },
	forced: true,
	mark: true,
	marktext: "雄",
	intro: {
		content: function(storage, player) {
			var ids = player.storage.qunyou_xiongzi_discardIds || [];
			var suits = { spade: 0, heart: 0, club: 0, diamond: 0 };
			for (var i = 0; i < ui.discardPile.childNodes.length; i++) {
				var card = ui.discardPile.childNodes[i];
				if (get.itemtype(card) != "card") continue;
				if (ids.includes(card.cardid)) continue;
				var s = get.suit(card);
				if (suits[s] !== undefined) suits[s]++;
			}
			return "♠" + suits.spade + " ♥" + suits.heart + " ♣" + suits.club + " ♦" + suits.diamond;
		},
	},
	async content(event, trigger, player) {
		player.storage.qunyou_xiongzi_discardIds = [];
		for (var i = 0; i < ui.discardPile.childNodes.length; i++) {
			var card = ui.discardPile.childNodes[i];
			if (get.itemtype(card) == "card")
				player.storage.qunyou_xiongzi_discardIds.push(card.cardid);
		}
		player.markSkill("qunyou_xiongzi");
	},
	group: ["qunyou_xiongzi_replace", "qunyou_xiongzi_effect", "qunyou_xiongzi_update", "qunyou_xiongzi_hide"],
	subSkill: {
		replace: {
			trigger: { player: "phaseChange" },
			forced: true,
			popup: false,
			filter(event, player) {
				var phase = event.phaseList[event.num];
				if (!phase || phase.includes("|")) return false;
				return ["phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard"].some(p => phase.startsWith(p));
			},
			async content(event, trigger, player) {
				trigger.phaseList[trigger.num] = "phaseUse|qunyou_xiongzi";
			},
		},
		effect: {
			trigger: { player: "phaseUseAfter" },
			forced: true,
			filter(event, player) {
				return event._extraPhaseReason === "qunyou_xiongzi";
			},
			async content(event, trigger, player) {
				var targetResult = await player.chooseTarget("雄姿：选择一名角色", true, () => true)
					.set("ai", target => -get.attitude(player, target)).forResult();
				if (!targetResult.bool) return;
				var target = targetResult.targets[0];
				event._xiongzi_target = target;
				var suitResult = await player.chooseControl("spade", "heart", "club", "diamond")
					.set("prompt", "雄姿：选择一种花色")
					.set("ai", function() {
						var evt = _status.event;
						var p = evt.player;
						var t = evt.getParent()._xiongzi_target;
						if (!t) return "spade";
						var controls = evt.controls;
						var bestSuit = controls[0];
						var bestScore = -Infinity;
						for (var i = 0; i < controls.length; i++) {
							var count = t.getCards("hse").filter(c => get.suit(c) == controls[i]).length;
							var score = get.attitude(p, t) > 0 ? count : -count;
							if (score > bestScore) { bestScore = score; bestSuit = controls[i]; }
						}
						return bestSuit;
					})
					.forResult();
				var suit = suitResult.control;
				var discardCount = 0;
				for (var i = 0; i < ui.discardPile.childNodes.length; i++) {
					var card = ui.discardPile.childNodes[i];
					if (get.itemtype(card) == "card" && get.suit(card) == suit
						&& !player.storage.qunyou_xiongzi_discardIds.includes(card.cardid))
						discardCount++;
				}
				var X = discardCount + 1;
				var suitCards = target.getCards("hse").filter(c => get.suit(c) == suit);
				if (suitCards.length >= X) {
					game.broadcastAll(function(num, s) {
						lib.skill.qunyou_xiongzi_backup.selectCard = num;
						lib.skill.qunyou_xiongzi_backup.filterCard = function(card) {
							return get.suit(card) == s;
						};
					}, X, suit);
					var next = target.chooseToUse();
					next.set("openskilldialog", "雄姿：将" + get.cnNumber(X) + "张" + get.translation(suit) + "牌当【无中生有】使用");
					next.set("norestore", true);
					next.set("addCount", false);
					next.set("_backupevent", "qunyou_xiongzi_backup");
					next.set("custom", { add: {}, replace: { window() {} } });
					next.backup("qunyou_xiongzi_backup");
					await next;
				} else {
					await target.damage(1, "fire");
				}
			},
		},
		update: {
			trigger: { global: "cardsDiscardAfter" },
			filter(event, player) {
				return player === game.phasePlayer;
			},
			async content(event, trigger, player) {
				player.markSkill("qunyou_xiongzi");
			},
		},
		hide: {
			trigger: { player: "phaseAfter" },
			forced: true,
			popup: false,
			async content(event, trigger, player) {
				player.unmarkSkill("qunyou_xiongzi");
			},
		},
		backup: {
			filterCard(card) { return get.itemtype(card) == "card"; },
			position: "hse",
			viewAs: { name: "wuzhong", isCard: true },
			selectCard: 1,
			popname: true,
			log: false,
			check(card) { return 8 - get.value(card); },
			sub: true,
		},
	},
	ai: {
		order: 1,
		result: { player: 1 },
	},
},

// === 众矢 ===
qunyou_zhongshi: {
	audio: 2,
	shiwuSkill: true,
	categories: () => ["奋武技"],
	trigger: { global: "discardAfter" },
	forced: true,
	filter(event, player) {
		if (event.player === player) return false;
		if (!event.cards || event.cards.length < 2) return false;
		const used = player.countMark("qunyou_zhongshi_used") || 0;
		const allowed = Math.min(5,
			player.getRoundHistory("damage")
				.concat(player.getRoundHistory("sourceDamage"))
				.reduce((sum, evt) => sum + evt.num, 0) + 1
		);
		return used < allowed;
	},
	async content(event, trigger, player) {
		player.addTempSkill("qunyou_zhongshi_used", "roundStart");
		player.addMark("qunyou_zhongshi_used", 1, false);
		var count = trigger.cards.length;
		var target = trigger.player;
		await player.draw(count);
		await target.draw(count);
		var targetName = get.translation(player);
		var choice = await target.chooseControl(
			"令攻击范围内含有" + targetName + "的角色依次可以对" + targetName + "使用一张伤害牌",
			"令" + targetName + "失去一点体力"
		).set("prompt", "众矢：请选择对" + targetName + "的处理方式").forResult();
		if (choice.control.indexOf("使用一张伤害牌") !== -1) {
			var inRange = game.filterPlayer(function(p) {
				return p !== player && p.inRange(player);
			}).sortBySeat();
			for (var i = 0; i < inRange.length; i++) {
				var chara = inRange[i];
				if (!chara.isIn()) continue;
				var hasCard = chara.getCards("h").some(function(c) {
					return get.tag(c, "damage") >= 1 && chara.canUse(c, player);
				});
				if (!hasCard) continue;
				await chara.chooseToUse(
					"众矢：是否对" + get.translation(player) + "使用一张伤害牌？"
				).set("filterCard", (function(_chara, _player) {
					return function(card) {
						return get.tag(card, "damage") >= 1 && _chara.canUse(card, _player);
					};
				})(chara, player));
			}
		} else {
			await player.loseHp(1);
		}
	},
	subSkill: {
		used: {
			charlotte: true,
			onremove: true,
			intro: { content: "本轮已发动#次【众矢】" },
		},
	},
},

// === 驳罪 ===
yachai_bozui: {
	audio: 2,
	trigger: { target: "useCardToTarget" },
	filter(event, player) {
		return event.card.name == "sha" && event.player !== player;
	},
	async content(event, trigger, player) {
		await player.swapEquip(trigger.player);
		trigger.targets.remove(player);
		trigger.getParent().triggeredTargets2.remove(player);
		trigger.untrigger();
	},
},

// === 和戍 ===
yachai_heshu: {
	audio: 2,
	global: "yachai_heshu_global",
	subSkill: {
		global: {
			enable: "phaseUse",
			filter(event, player) {
				if (player.hasSkill("yachai_heshu_mark")) return false;
				if (!player.countCards("e")) return false;
				return game.hasPlayer(current => current.hasSkill("yachai_heshu"));
			},
			selectTarget: 1,
			filterTarget(card, player, target) {
				return target.hasSkill("yachai_heshu");
			},
			async content(event, trigger, player) {
				const target = event.targets[0];
				player.addTempSkill("yachai_heshu_mark", "phaseUseEnd");
				await player.discard(player.getCards("e"));
				const drawChoice = await target.chooseBool("和戍：是否与" + get.translation(player) + "各摸一张牌？").forResult();
				if (drawChoice.bool) {
					await target.draw(1);
					await player.draw(1);
				}
				const controls = ["tao", "jiu"].filter(name => {
					if (name === "tao") return player.isDamaged();
					return true;
				});
				if (!controls.length) return;
				const control = controls.length === 1
					? { control: controls[0] }
					: await player.chooseControl(...controls)
						.set("prompt", "和戍：视为使用一张")
						.set("ai", () => controls.includes("tao") ? "tao" : "jiu")
						.forResult();
				await player.useCard({ name: control.control, isCard: true }, player, false);
			},
			ai: {
				order: 5,
				result: {
					player(player, target) {
						if (!player.countCards("e")) return 0;
						if (player.isDamaged()) return 6;
						return 3;
					},
				},
				target: {
					player(player, target) {
						return get.attitude(player, target);
					},
				},
			},
		},
		mark: { charlotte: true },
	},
},

// === 辨亡 ===
yachai_bianwang: {
	audio: 2,
	trigger: { global: "damageSource" },
	direct: true,
	filter(event, player) {
		if (!player.isIn() || event.unreal || !event.num) return false;
		const card = event.card;
		if (!card) return false;
		if (get.is.virtualCard(card) || get.is.convertedCard(card)) return false;
		if (!get.is.damageCard(card)) return false;
		const cards = card.cards || event.cards;
		if (!cards?.length) return false;
		const color = get.color(card);
		if (color !== "red" && color !== "black") return false;
		const cardName = color === "red" ? "lebu" : "bingliang";
		return player.canAddJudge(cardName);
	},
	async content(event, trigger, player) {
		const card = trigger.card;
		const color = get.color(card);
		const cardName = color === "red" ? "lebu" : "bingliang";
		const cards = card.cards || trigger.cards;
		const result = await player
			.chooseBool(get.prompt("yachai_bianwang"), "将" + get.translation(cards) + "当【" + get.translation(cardName) + "】对自己使用")
			.set("ai", () => {
				const player = get.player();
				return get.effect(player, { name: cardName, isCard: true }, player, player);
			})
			.forResult();
		if (!result?.bool) return;
		player.logSkill("yachai_bianwang");
		await player.useCard({ name: cardName, isCard: true }, player, cards);
	},
},

// === 纳剑 ===
yachai_najian: {
	audio: 2,
	check: () => true,
	trigger: { global: "phaseUseEnd" },
	filter(event, player) {
		const data = player.storage.yachai_najian_data;
		if (!data || data.phaseId !== event.player.playerid) return false;
		if (!Object.values(data.categoryCounts).some(c => c >= 2)) return false;
		if (!player.getCards("j").length) return false;
		return true;
	},
	async content(event, trigger, player) {
		const data = player.storage.yachai_najian_data;
		const jCards = player.getCards("j");
		if (jCards.length) {
			const gainChoice = await player.chooseBool("纳剑：获得判定区内的牌？")
				.set("ai", () => 1)
				.forResult();
			if (gainChoice.bool) {
				await player.gain(jCards, "gain2");
			}
		}
		const sameNames = Object.keys(data.names).filter(name => data.names[name] >= 2);
		const cardsToGive = [];
		const nodes = ui.discardPile.childNodes;
		for (let i = 0; i < nodes.length; i++) {
			const card = nodes[i];
			if (card.name && sameNames.includes(card.name)) {
				cardsToGive.push(card);
			}
		}
		if (cardsToGive.length) {
			const targetResult = await player.chooseTarget("纳剑：交给一名其他角色", (card, p, target) => target.playerid !== player.playerid)
				.set("ai", target => get.attitude(player, target) > 0 ? 1 : -1)
				.forResult();
			if (targetResult.bool) {
				await targetResult.targets[0].gain(cardsToGive, "gain2");
			}
		}
	},
	group: ["yachai_najian_init", "yachai_najian_record", "yachai_najian_clear"],
	subSkill: {
		init: {
			trigger: { global: "phaseUseBegin" },
			forced: true,
			popup: false,
			async content(event, trigger, player) {
				player.storage.yachai_najian_data = {
					phaseId: trigger.player.playerid,
					categoryCounts: { basic: 0, trick: 0, equip: 0 },
					names: {},
				};
			},
		},
		record: {
			trigger: { global: ["loseAfter", "cardsDiscardAfter"] },
			forced: true,
			popup: false,
			filter(event, player) {
				const data = player.storage.yachai_najian_data;
				if (!data) return false;
				return _status.currentPhase && _status.currentPhase.playerid === data.phaseId;
			},
			async content(event, trigger, player) {
				const data = player.storage.yachai_najian_data;
				const cards = trigger.getd().filter(c => c && get.itemtype(c) === "card");
				if (!cards.length) return;
				for (const card of cards) {
					const type = get.type2(card);
					if (["basic", "trick", "equip"].includes(type)) {
						data.categoryCounts[type] = (data.categoryCounts[type] || 0) + 1;
					}
					const name = get.name(card);
					data.names[name] = (data.names[name] || 0) + 1;
				}
			},
		},
		clear: {
			trigger: { global: "phaseUseAfter" },
			forced: true,
			popup: false,
			async content(event, trigger, player) {
				delete player.storage.yachai_najian_data;
			},
		},
		},
	},
// === 忤言 ===
	yachai_wuyan: {
		trigger: { global: "gainAfter" },
		check(event, player) {
			const target = event.player;
			if (get.attitude(player, target) > 0) {
				if (target.hp <= 1 || target.countCards("h") <= 2) return false;
			}
			return true;
		},
		filter(event, player) {
			if (event.getParent("phaseDraw")?.player === event.player) return false;
			const map = player.storage.yachai_wuyan_used;
			if (!map) return true;
			return map[event.player.playerid] !== game.roundNumber;
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			if (!player.storage.yachai_wuyan_used) player.storage.yachai_wuyan_used = {};
			player.storage.yachai_wuyan_used[target.playerid] = game.roundNumber;
			const cards = trigger.cards.filter(card => get.position(card) === "h");
			if (!cards.length) return;
			const blackCards = cards.filter(card => get.color(card) === "black");
			const hasBingliang = player.getCards("j").some(card => card.name === "bingliang");
			const controls = ["将其中一张牌置于其武将牌上"];
			if (blackCards.length && !hasBingliang) controls.push("将一张黑色牌当【兵粮寸断】对自己使用");
			let choice;
			if (controls.length === 1) {
				choice = { control: controls[0] };
			} else {
				choice = await player.chooseControl(controls)
				.set("prompt", "忤言：选择一项")
				.set("ai", () => {
					const controls = _status.event.controls;
					const p = _status.event.player;
					const myIdx = game.players.indexOf(p);
					const preSeatWu = game.players.some((pl, idx) => {
						if (idx >= myIdx) return false;
						if (pl.getHistory("phaseBegin").length > 0) return false;
						return pl.getExpansions("yachai_wuyan_return").length > 0;
					});
					if (preSeatWu) {
						const bi = controls.findIndex(c => c.indexOf("兵粮") !== -1);
						if (bi !== -1) return bi;
					}
					return 0;
				})
				.forResult();
			}
			if (choice.control === "将其中一张牌置于其武将牌上") {
				let card;
				if (cards.length === 1) {
					card = cards[0];
				} else {
					const result = await player.chooseCardButton("选择一张牌置于" + get.translation(target) + "的武将牌上", cards, [1, 1], true)
						.set("ai", button => {
							const att = get.attitude(player, target);
							return att > 0 ? -get.value(button.link) : get.value(button.link);
						})
						.forResult();
					if (result.bool) card = result.links[0];
				}
				if (!card) return;
				target.addToExpansion(card, "gain2").set("gaintag", ["yachai_wuyan_return"]);
				target.addTempSkill("yachai_wuyan_return", { player: "phaseDrawBegin1After" });
			} else {
				const result = await player.chooseCardButton("选择一张黑色牌当【兵粮寸断】对自己使用", blackCards, [1, 1], true)
					.set("ai", button => get.value(button.link))
					.forResult();
				if (result.bool) {
					await player.useCard({ name: "bingliang", isCard: true }, player, [result.links[0]]);
				}
			}
		},
		group: ["yachai_wuyan_reset"],
		subSkill: {
			reset: {
				trigger: { global: "roundStart" },
				forced: true,
				popup: false,
				silent: true,
				async content(event, trigger, player) {
					delete player.storage.yachai_wuyan_used;
				},
			},
			return: {
				trigger: { player: "phaseDrawBegin1" },
				forced: true,
				popup: false,
				silent: true,
				mark: true,
				intro: { content: "expansion", markcount: "expansion" },
				async content(event, trigger, player) {
					const cards = player.getExpansions("yachai_wuyan_return");
					if (cards.length) {
						await player.gain(cards, "gain2");
					}
					player.removeSkill("yachai_wuyan_return");
				},
			},
		},
	},
// === 励诲 ===
	yachai_lihui: {
		trigger: { global: "phaseDrawAfter" },
		filter(event, player) {
			if (event.player === player) return false;
			let count = 0;
			event.player.checkAllHistory("gain", evt => {
				if (evt.getParent("phaseDraw") === event) {
					count += evt.cards.length;
				}
			});
			if (count === 2) return false;
			if (!player.getCards("j").length) return false;
			return true;
		},
		async content(event, trigger, player) {
			const judges = player.getCards("j").slice();
			if (!judges.length) return;
			const cards = [];
			for (const card of judges) {
				await player.lose(card, ui.ordering);
				const judgeResult = await player.judge(card).forResult();
				cards.push(card);
				if (judgeResult?.card && get.position(judgeResult.card) === "d") {
					cards.push(judgeResult.card);
				}
			}
			const target = await player.chooseTarget("励诲：将判定牌与判定结果牌交给一名角色", (card, p, target) => true)
				.set("ai", target => get.attitude(player, target) > 0 ? 1 : -1)
				.forResult();
			if (target.bool) {
				await target.targets[0].gain(cards, "gain2");
			}
		},
	},
	qunyou_guanwei: {
	audio: 2,
	trigger: {
		global: "phaseUseEnd", // 触发时机：一名角色的出牌阶段结束后
	},
	filter: function(event, player) {
		// 1. 检查技能拥有者潘濬自己是否有牌可弃置
		if (!player.countCards("hes")) return false;
		
		const target = event.player;
		if (!target || !target.isIn()) return false;
		
		// 2. 核心逻辑：获取目标在该出牌阶段使用的所有牌
		const history = target.getHistory("useCard", function(evt) {
			return evt.getParent("phaseUse") === event;
		});
		
		if (history.length < 2) return false; // 必须至少使用过两张牌
		
		// 检查这些牌的花色是否均相同且合法
		const firstSuit = get.suit(history[0].card, target);
		if (!lib.suit.includes(firstSuit)) return false;
		
		const allSameSuit = history.every(evt => get.suit(evt.card, target) === firstSuit);
		if (!allSameSuit) return false;
		
		// 3. 每回合各花色限一次
		player.storage.qunyou_guanwei_suits ??= [];
		if (player.storage.qunyou_guanwei_suits.includes(firstSuit)) return false;
		
		return true;
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const history = target.getHistory("useCard", function(evt) {
			return evt.getParent("phaseUse") === trigger;
		});
		const suit = get.suit(history[0].card, target);
		
		// 记录该花色本回合已被发动过
		player.storage.qunyou_guanwei_suits.push(suit);
		
		// 4. 弃置一张牌并执行效果
		const discardResult = await player.chooseToDiscard("hes", true, "观微：请弃置一张牌").forResult();
		if (discardResult.bool) {
			// 目标摸两张牌
			await target.draw(2);
			
			if (target.isIn()) {
				// 成功插入并执行额外阶段，计数器 +1 
				player.storage.qunyou_guanwei_count = (player.storage.qunyou_guanwei_count || 0) + 1;
				
				// 令其立即执行一个额外的出牌阶段
				await target.phaseUse();
			}
		}
	},
	ai: {
		result: {
			player: function(player, target) {
				return { target: 2 }; // 告诉潘濬AI，这个技能对队友收益极大，积极发动
			}
		},
		threat: 3
	},
	group: ["qunyou_guanwei_draw", "qunyou_guanwei_reset", "qunyou_guanwei_ai_core"],
	subSkill: {
		// 结算回合结束摸牌效果：X为本回合执行出牌阶段数-1
		draw: {
			trigger: {
				global: "phaseEnd", // 当该角色回合结束时
			},
			forced: true,
			filter: function(event, player) {
				// 只要计数器大于0，说明成功触发过额外阶段，符合摸牌条件
				return player.storage.qunyou_guanwei_count > 0;
			},
			async content(event, trigger, player) {
				const x = player.storage.qunyou_guanwei_count;
				if (x > 0) {
					player.logSkill("qunyou_guanwei");
					await player.draw(x);
				}
				player.storage.qunyou_guanwei_count = 0; // 及时销毁数据
			}
		},
		// 清空每回合各花色限一次的标记
		reset: {
			trigger: {
				global: "phaseAfter", // 回合彻底完全结束后重置，最为安全
			},
			forced: true,
			popup: false,
			content: function(event, trigger, player) {
				player.storage.qunyou_guanwei_suits = [];
				player.storage.qunyou_guanwei_count = 0;
			}
		},
		// AI配合逻辑
		ai_core: {
			ai: {
				// 1. 出牌顺序提升：发现手牌满足观微条件时，AI会极度优先将该花色的前两张牌连续打出
				order: function(item, player) {
					if (!player.isAI() || _status.currentPhase !== player) return;
					const card = item.card;
					if (!card || !player.canUse(card, player)) return;
					
					const guanweiMaster = player.getFriends().find(current => current.hasSkill("qunyou_guanwei"));
					if (!guanweiMaster || !guanweiMaster.countCards("hes")) return;
					
					const suit = get.suit(card, player);
					const usedSuits = guanweiMaster.storage.qunyou_guanwei_suits || [];
					if (usedSuits.includes(suit)) return;
					
					const history = player.getHistory("useCard", function(evt) {
						return evt.getParent("phaseUse") !== null;
					});
					
					const allCards = player.getCards("h");
					const usedCount = history.filter(evt => get.suit(evt.card, player) === suit).length;
					const handCount = allCards.filter(c => get.suit(c, player) === suit && player.canUse(c, player)).length;
					
					// 如果（该阶段已出该花色 + 手牌还能出该花色）的总数 >= 2，说明这条路线可以配合观微，大幅提前优先级
					if (usedCount + handCount >= 2) {
						return 35; 
					}
				},
				// 2. 强行终止出牌：打完两张同花色之后，若AI再试图出杂色牌，底层核心会强制灌入“空过/取消”判定
				chooseToUse: function(current, player) {
					if (!player.isAI() || _status.currentPhase !== player) return;
					
					const guanweiMaster = player.getFriends().find(current => current.hasSkill("qunyou_guanwei"));
					if (!guanweiMaster || !guanweiMaster.countCards("hes")) return;
					
					const history = player.getHistory("useCard", function(evt) {
						return evt.getParent("phaseUse") !== null;
					});
					const usedSuits = guanweiMaster.storage.qunyou_guanwei_suits || [];
					
					// 扫描目前所有仍能用来配合观微的候选纯净路线
					const allCards = player.getCards("h");
					const validSuitMap = {};
					lib.suit.forEach(suit => {
						if (usedSuits.includes(suit)) return;
						const usedCount = history.filter(evt => get.suit(evt.card, player) === suit).length;
						const handCount = allCards.filter(c => get.suit(c, player) === suit && player.canUse(c, player)).length;
						if (usedCount + handCount >= 2) {
							validSuitMap[suit] = { used: usedCount, total: usedCount + handCount };
						}
					});

					// 执行硬核拦截与否则放行：
					if (history.length > 0) {
						// 如果已经开始出牌，并且之前出的牌保持纯净
						const firstSuit = get.suit(history[0].card, player);
						const allSameSuit = history.every(evt => get.suit(evt.card, player) === firstSuit);
						
						if (allSameSuit && validSuitMap[firstSuit]) {
							// 状态 A：如果在这个出牌阶段内，同花色已经【成功使用了至少2张】
							if (history.length >= 2) {
								// 此时如果AI想要打出杂色牌，立刻封死它的出牌可能，让它只能选择“结束阶段”
								if (current && current.card && get.suit(current.card, player) !== firstSuit) {
									if (_status.event && _status.event.name === 'chooseToUse') {
										_status.event.result = { bool: false }; // 向底层主循环注入 取消 信号
									}
									return false;
								}
							} else {
								// 状态 B：才出了1张，还没满2张。如果AI想混入别的花色，也予以驳回，逼它去用下一张同花色
								if (current && current.card && get.suit(current.card, player) !== firstSuit) {
									if (_status.event && _status.event.name === 'chooseToUse') {
										_status.event.result = { bool: false };
									}
									return false;
								}
							}
						}
					} else {
						// 如果阶段开局一张手牌都没打过，判断有没有能够做观微的计划
						const hasValidPlan = Object.keys(validSuitMap).length > 0;
						if (hasValidPlan) {
							const bestSuit = Object.keys(validSuitMap)[0];
							// 第一张牌如果想打别的杂色，拒绝，直到AI对准最优花色的牌开始打为止
							if (current && current.card && get.suit(current.card, player) !== bestSuit) {
								if (_status.event && _status.event.name === 'chooseToUse') {
									_status.event.result = { bool: false };
								}
								return false;
							}
						}
						// 【否则放行】：如果开局扫描后发现无法凑出任何2张同花色的牌，此段完全放行，AI可以按原生逻辑正常打光所有爆发。
					}
				}
			}
		}
	}
},

qunyou_gongqing: {
	audio: 2,
	forced: true, // 锁定技
	trigger: {
		player: "damageBegin", // 触发时机：当你受到伤害时
	},
	filter: function(event, player) {
		// 必须存在合法的伤害来源
		return event.source && event.source.isIn();
	},
	async content(event, trigger, player) {
		const source = trigger.source;
		const range = source.getAttackRange(); // 动态获取伤害来源当前的攻击范围
		
		if (range < 3) {
			// 判断是否不是本回合首次受到伤害
			const history = player.getHistory("damage");
			// 过滤并排除掉当前正在触发、还未真正扣血结算的这笔伤害事件本身
			const prevDamageCount = history.filter(evt => evt !== trigger).length;
			
			if (prevDamageCount > 0) {
				trigger.cancel(); // 满足条件：防止此伤害
				game.log(player, "触发锁定技【公清】，防止了来自", source, "的本次伤害");
			}
		} else if (range > 3) {
			trigger.num++; // 满足条件：此伤害+1
			game.log(player, "触发锁定技【公清】，使其受到的伤害值 +1");
		}
	}
}
}
