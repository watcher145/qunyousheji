import { lib, game, get, ui, _status } from "noname";
import { qunyou_gumingMove } from "./helpers.js";

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
					.set("ai", () => "basic")
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
			return game.hasPlayer(t => t.hasClan("琅琊诸葛氏") && t !== player && get.attitude(player, t) > 0);
		},
		async content(event, trigger, player) {
			const cards = trigger.getl(player).cards2
				.filter(c => get.position(c, true) === "d");
			const tr = await player.chooseTarget(
				get.prompt("clanzuguan"), (c, f, t) => t.hasClan("琅琊诸葛氏")
			).set("ai", (target) => get.attitude(player, target) > 0 ? 1 : 0).forResult();
			if (!tr.bool) return;
			const target = tr.targets[0];
			const usable = cards.filter(c => target.hasUseTarget(c));
			if (!usable.length) return;
			const cr = await target.chooseButton(
				["族冠：选择使用其中一张牌", usable]
			).set("filterButton", b => _status.event.player.hasUseTarget(b.link))
			.set("ai", (button) => target.getUseValue(button.link))
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
		// 横置等量名角色（超过场上人数则截断；含自己；已横置者保持横置）
		const num = Math.min(cards.length, game.players.length);
		if (num <= 0) return;
		const result = await player
			.chooseTarget(num, true, "过庭：横置" + get.cnNumber(num) + "名角色")
			.set("ai", (target) => -get.attitude(get.player(), target))
			.forResult();
		if (!result?.targets?.length) return;
		for (const target of result.targets) {
			if (!target.isLinked()) await target.link(true);
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
};
