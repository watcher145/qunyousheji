import { lib, game, get, ui, _status } from "noname";
import { qunyou_gumingMove } from "./helpers.js";

// 星孤 —— 天水姜氏共享的"同一张【浮雷】"：黑桃命中计数与递增雷伤记录在这一个虚拟牌对象上，全族共用
function clanXingguSharedCard(player) {
	let card = player.storage.clan_xinggu_card;
	if (!card) {
		for (const current of game.players.concat(game.dead)) {
			if (current != player && current.storage.clan_xinggu_card) {
				card = current.storage.clan_xinggu_card;
				break;
			}
		}
	}
	if (!card) {
		card = { name: "fulei", isCard: true, storage: { fulei: 0 } };
	}
	player.storage.clan_xinggu_card = card;
	for (const current of game.players) {
		if (current.hasClan && current.hasClan("天水姜氏")) {
			current.storage.clan_xinggu_card = card;
		}
	}
	return card;
}

/** 树泽：桃/五谷选择并执行 */
async function clanshuze_effect(player) {
	const clanName = "陈郡谢氏";
	const mates = game.filterPlayer((p) => p.isIn() && p.hasClan(clanName));
	if (!mates.length) {
		return;
	}
	player.logSkill("clanshuze");
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

// 柱鼎：各持有者的技能"能通过武将牌上的技能使用什么类别的牌"。
// 注意：柱鼎 filter 里用的是 player.hasSkill(event.skill)，只认**持有者自己**的技能
// （已用模拟器验证：别人用技能打出牌时，只有那个人自己的柱鼎发动），所以只需统计持有者本人。
// 若之后改动/新增琅琊诸葛氏的技能，需同步维护此表。
const clanZhudingSkillTypes = {
	yachai_jiangming: ["basic", "trick"], // 将明：使用牌堆翻出的非装备牌
	yachai_yanling: ["trick"], // 崖灵：接管一张锦囊的使用权
	yachai_xiaoqiang: ["trick"], // 效戕：视为使用【决斗】
	yachai_xiumu: ["basic"], // 修睦：转化为【桃】/【酒】使用
	yachai_qiyi: ["basic", "trick"], // 岐嶷：以对方手牌转化响应（杀/闪/桃/酒/无懈）
	yachai_chengshi: ["basic"], // 逞师：使用【杀】
	yachai_jinshi: ["equip"], // 浸势：使用获得的装备牌
	yachai_liuliu: ["basic", "equip"], // 流罹：视为使用基本牌 / 使用坐骑牌
};

/**
 * 柱鼎：按"自己各技能能使用的牌类别"计分取最高；平手按 basic > trick > equip
 * @param {import("noname").Player} player 柱鼎持有者
 * @returns {"basic"|"trick"|"equip"}
 */
function clanZhudingBestType(player) {
	const order = ["basic", "trick", "equip"];
	const score = { basic: 0, trick: 0, equip: 0 };
	for (const skill of player.getSkills(null, false, false)) {
		const types = clanZhudingSkillTypes[skill];
		if (types) {
			for (const type of types) score[type]++;
		}
	}
	let best = order[0];
	for (const type of order) {
		if (score[type] > score[best]) best = type;
	}
	return best;
}

// 族冠：诸葛均一次性失去多张牌后，可令一名同族角色（含自己）使用其中一张。
// 那几张牌已经在弃牌堆里，"令其使用"等于白嫖一次用牌、本身没有额外代价，
// 所以 AI 的判据是"存在某个同族角色用其中某张牌能带来正收益"，而不是"有没有队友"。
/** 族冠：本次失去的、且已进入弃牌堆的牌 */
function clanZuguanCards(event, player) {
	return (event.getl(player)?.cards2 || []).filter((card) => get.position(card, true) === "d");
}

/**
 * 族冠：把 card 交给 target 使用，对 player 一方的收益
 * （target 自己用出去的价值 × player 对 target 的态度符号；自己用则直接取正）
 */
function clanZuguanCardValue(player, target, card) {
	// 引擎在 chooseUseTarget 里先校验 cardEnabled，这里提前对齐，
	// 避免 AI 选中一张根本用不出的牌、随后静默失败（表现为"发动了却没出牌"）
	if (!lib.filter.cardEnabled(card, target)) return 0;
	const value = target.getUseValue(card);
	if (value <= 0) return 0;
	if (target === player) return value;
	const attitude = get.attitude(player, target);
	if (attitude > 0) return value;
	if (attitude < 0) return -value;
	return 0;
}

/** 族冠：target 使用其中最优一张牌能拿到的收益 */
function clanZuguanBestGain(player, target, cards) {
	let best = 0;
	for (const card of cards) {
		const value = clanZuguanCardValue(player, target, card);
		if (value > best) best = value;
	}
	return best;
}

// 宗族技 — clan*
export const skills = {
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
	direct: true,
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
		const go = await player
			.chooseBool(get.prompt("clanxunli"), "令" + get.translation(target) + "摸一张牌")
			.forResult();
		if (!go?.bool) return;
		player.logSkill("clanxunli", target);
		await target.draw();
	},
},

// === 柱鼎 ===
clanzhuding: {
	audio: 2,
	clanSkill: true,
	locked: true,
	forced: true,
	usable: 1,
	mark: true,
	intro: {
		content(storage, player) {
			const t = player.storage.clanzhuding_type;
			if (t === "basic") return "基本牌";
			if (t === "trick") return "锦囊牌";
			if (t === "equip") return "装备牌";
			return "未选择";
		},
	},
	trigger: { global: "useCard" },
	filter(event, player) {
		if (!player.hasClan("琅琊诸葛氏")) return false;
		const chosenType = player.storage.clanzhuding_type;
		if (!chosenType) return false;
		if (get.type2(event.card) !== chosenType) return false;
		if (event.skill && player.hasSkill(event.skill)) return true;
		let parent = event.parent;
		while (parent) {
			if (parent.name && lib.skill[parent.name] && player.hasSkill(parent.name)) return true;
			if (parent.skill && player.hasSkill(parent.skill)) return true;
			parent = parent.parent;
		}
		return false;
	},
	async content(event, trigger, player) {
		const toDraw = player.maxHp - player.countCards("h");
		if (toDraw > 0) {
			await player.draw(toDraw);
		}
	},
	group: ["clanzhuding_init"],
	subSkill: {
		init: {
			trigger: { global: "gameStart" },
			forced: true,
			popup: false,
			filter(event, player) {
				if (!player.hasClan("琅琊诸葛氏")) return false;
				return !player.storage.clanzhuding_type;
			},
			async content(event, trigger, player) {
				const result = await player.chooseControl("basic", "trick", "equip")
					.set("prompt", "柱鼎：选择一种牌的类别")
					.set("ai", (trigger2, chooser) => clanZhudingBestType(chooser))
					.forResult();
				player.storage.clanzhuding_type = result.control;
			},
		},
	},
},

// === 族冠 ===
	clanzuguan: {
		audio: 2,
		clanSkill: true,
		trigger: { player: "loseAfter" },
		filter(event, player) {
			if (!player.hasClan("琅琊诸葛氏")) return false;
			if (game.hasPlayer(i => i.isDying())) return false;
			const cards = event.getl(player)?.cards2;
			if (!cards || cards.length < 2) return false;
			const ind = cards.filter(c => get.position(c, true) === "d");
			if (!ind.length) return false;
			return game.hasPlayer(t =>
				t.hasClan("琅琊诸葛氏") && ind.some(c => t.hasUseTarget(c))
			);
		},
		check(event, player) {
			const cards = clanZuguanCards(event, player);
			if (!cards.length) return false;
			return game.hasPlayer(
				(target) => target.hasClan("琅琊诸葛氏") && clanZuguanBestGain(player, target, cards) > 0
			);
		},
		async content(event, trigger, player) {
			const cards = clanZuguanCards(trigger, player);
			if (!cards.length) return;
			const tr = await player
				.chooseTarget(get.prompt("clanzuguan"), (c, f, t) => t.hasClan("琅琊诸葛氏"))
				.set("ai", (target) => clanZuguanBestGain(player, target, cards))
				.forResult();
			if (!tr.bool) return;
			const target = tr.targets[0];
			const usable = cards.filter((card) => clanZuguanCardValue(player, target, card) > 0);
			if (!usable.length) return;
			const cr = await target
				.chooseButton(["族冠：选择使用其中一张牌", usable])
				.set("filterButton", (button) => clanZuguanCardValue(player, target, button.link) > 0)
				.set("ai", (button) => clanZuguanCardValue(player, target, button.link))
				.forResult();
			if (!cr.bool) return;
			target.$gain2(cr.links[0], false);
			await game.delayx();
			await target.chooseUseTarget(true, cr.links[0], false);
		},
		ai: {
			threaten: 2,
		},
	},

// === 过庭 ===
clan_guoting: {
	audio: 2,
	clanSkill: true,
	locked: true,
	forced: true,
	trigger: { player: "phaseUseEnd" },
	filter(event, player) {
		if (!player.hasClan("鲁国孔氏")) return false;
		// 有同族角色（含自己）已受伤
		if (!game.hasPlayer((cur) => cur.hasClan("鲁国孔氏") && cur.isDamaged())) return false;
		// 手牌中存在“唯一最多”的花色
		const suits = {};
		player.getCards("h").forEach((card) => {
			const suit = get.suit(card, player);
			suits[suit] = (suits[suit] || 0) + 1;
		});
		const entries = Object.entries(suits).sort((a, b) => b[1] - a[1]);
		if (!entries.length) return false;
		return entries.length == 1 || entries[0][1] > entries[1][1];
	},
	async content(event, trigger, player) {
		const suits = {};
		player.getCards("h").forEach((card) => {
			const suit = get.suit(card, player);
			suits[suit] = (suits[suit] || 0) + 1;
		});
		const entries = Object.entries(suits).sort((a, b) => b[1] - a[1]);
		if (!entries.length || (entries.length > 1 && entries[0][1] <= entries[1][1])) return;
		const suit = entries[0][0];
		const cards = player.getCards("h", (card) => get.suit(card, player) == suit);
		if (!cards.length) return;
		await player.recast(cards);
		// 横置或重置等量名角色（超过场上人数则截断；含自己）
		const num = Math.min(cards.length, game.players.length);
		if (num <= 0) return;
		const result = await player
			.chooseTarget(num, true, "过庭：横置或重置" + get.cnNumber(num) + "名角色")
			.set("ai", (target) => {
				const player2 = get.player();
				// 无法被横置的角色选了也白选（原生【铁索连环】的 ai 同款规避）
				if (target.hasSkillTag("noLink")) return 0;
				let value = -get.attitude(player2, target);
				// 反转语义：已横置的目标会被"重置"（等于放他一马）→ 大幅降权，优先未横置的敌人
				if (target.isLinked()) value *= 0.2;
				return value;
			})
			.forResult();
		if (!result?.targets?.length) return;
		// 与【铁索连环】一致：content 是 `await event.target.link()`（无参）。
		// link(bool) 传 true 时若已横置会直接移除事件、什么都不发生（player.js:9594-9606）；
		// 无参才走 link content（content.js:12039）按当前状态反转——已横置者被重置。
		for (const target of result.targets) {
			await target.link();
		}
	},
},

// === 沽名 ===
clanguming: {
	audio: 2,
	clanSkill: true,
	locked: true,
	forced: true,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		// 至少存在一名沽名未升至首位的同族角色，否则整个技能不发动
		return game.hasPlayer(cur => cur.hasClan("汝南袁氏") && cur.skills.indexOf("clanguming") > 0);
	},
	async content(event, trigger, player) {
		const result = await player
			.chooseTarget(true, "沽名：请选择一名同族角色，令其〖沽名〗上升一格", (card, player2, target) => {
				return target.hasClan("汝南袁氏") && target.skills.indexOf("clanguming") > 0;
			})
			.set("ai", target => {
				const player2 = get.player();
				return get.attitude(player2, target) + (target == player2 ? 1 : 0);
			})
			.forResult();
		if (!result?.targets?.length) return;
		const target = result.targets[0];
		// 沽名前移一格（helper 内含缓存清理、联机同步与鬩墙失效位置同步）
		qunyou_gumingMove(target, 1);
		// 持有者视为使用【无中生有】或【桃】（桃仅在可用时进入选项；仅剩一个选项直接跳过选择）
		// ⚠️ chooseButton 的按钮数组必须与 "vcard" 类型标记配对成 [按钮数组, "vcard"]，否则按钮按无类型创建会抛“button不合法”
		const cardList = [["锦囊", "", "wuzhong"]];
		if (lib.filter.cardEnabled(get.autoViewAs({ name: "tao", isCard: true }), player)) {
			cardList.push(["基本", "", "tao"]);
		}
		let name = "wuzhong";
		if (cardList.length > 1) {
			const choice = await player
				.chooseButton(["沽名：视为使用一张牌", [cardList, "vcard"]], true)
				.set("ai", button => {
					const player2 = get.player();
					if (button.link[2] == "tao") return player2.hp <= 2 ? 3 : 1;
					return 2;
				})
				.forResult();
			if (!choice?.links?.length) return;
			name = choice.links[0][2];
		}
		// 无中生有与桃均为对己使用的牌（wuzhong: filterTarget target === player），目标须传自己，否则结算取不到 event.target
		await player.useCard(get.autoViewAs({ name, isCard: true }), [player]);
	},
},

// === 星孤 ===
clan_xinggu: {
	audio: 2,
	clanSkill: true,
	trigger: { player: "phaseUseBegin" },
	direct: true,
	filter(event, player) {
		return player.isIn();
	},
	async content(event, trigger, player) {
		while (player.isIn()) {
			const card = clanXingguSharedCard(player);
			const hits = typeof card.storage.fulei == "number" ? card.storage.fulei : 0;
			// 交待天水姜氏共同的浮雷判定黑桃命中次数，每次判定后重新询问，取消即停
			const go = await player
				.chooseBool(`星孤：是否进行一次【浮雷】判定？（天水姜氏共同的浮雷判定已命中黑桃${hits}次，本次若命中将受到${hits + 1}点雷电伤害）`)
				.set("choice", player.hp > hits + 1)
				.forResult();
			if (!go.bool) {
				break;
			}
			const judgeEvent = player.judge(card);
			judgeEvent.set("callback", async (event2) => {
				// 获得判定牌（趁判定牌仍在处理区时收集，洛神同款）
				if (get.position(event2.card, true) === "o") {
					await player.gain({ cards: [event2.card], animate: "gain2" });
				}
			});
			const result = await judgeEvent.forResult();
			// 视为同一张【浮雷】：黑桃命中时计数记在全族共享的这张牌上，伤害随累计次数递增（浮雷同公式：X=已命中次数）
			if (result.bool === false) {
				card.storage.fulei = (typeof card.storage.fulei == "number" ? card.storage.fulei : 0) + 1;
				if (player.isIn()) {
					await player.damage(card.storage.fulei, "thunder", "nosource");
				}
			}
		}
	},
},

// === 树泽 ===
clanshuze: {
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
		await clanshuze_effect(player);
	},
},
};
