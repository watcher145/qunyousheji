import { lib, game, get, ui, _status } from "noname";

// 宗族技 — clan*
export const skills = {
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
	trigger: { global: "useCardAfter" },
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
};
