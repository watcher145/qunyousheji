import { lib, game, get, ui, _status } from "noname";

// 崖柴系技能 — yachai_*
export const skills = {
// === 尚文 ===
	yachai_shangwen: {
		audio: 2,
		trigger: { global: "phaseJieshuBegin" },
		direct: true,
		filter(event, player) {
			const target = event.player;
			if (target === player) return false;
			if (player.countCards("he") === 0) return false;
			return target.getHistory("sourceDamage").length === 0;
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			const X = player.hp;
			const result = await player
				.chooseCard(get.prompt("yachai_shangwen", target), [1, X], "he", card => true)
				.set("ai", card => -get.value(card))
				.forResult();
			if (!result.bool) return;
			player.logSkill("yachai_shangwen", target);
			await player.give(result.cards, target);
		},
	},

// === 该览 ===
	yachai_gailan: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return player.countCards("h") >= player.hp;
		},
		async content(event, trigger, player) {
			const X = player.hp;
			const discardResult = await player
				.chooseCard("该览：弃置" + get.cnNumber(X) + "张牌", X, "h", card => true)
				.set("ai", card => -get.value(card))
				.forResult();
			if (!discardResult.bool) return;
			await player.discard(discardResult.cards);
			const targetResult = await player
				.chooseTarget("该览：观看一名角色的手牌", (card, p, target) => target !== p)
				.set("ai", target => {
					if (get.attitude(player, target) > 0) {
						return -target.countCards("h") * 0.5;
					}
					const cards = target.getCards("h");
					return cards.reduce((s, c) => s + get.value(c, player), 0);
				})
				.forResult();
			if (!targetResult.bool || !targetResult.targets?.length) return;
			const target = targetResult.targets[0];
			const isFriend = get.attitude(player, target) > 0;
			await player.viewHandcards(target);
			const ownResult = await player
				.chooseCard("该览：选择至多" + get.cnNumber(X) + "张手牌用于交换", [0, X], "h", card => true)
				.set("ai", card => (isFriend ? 1 : -1) * get.value(card, player))
				.forResult();
			if (!ownResult.bool || !ownResult.cards?.length) return;
			const ownCards = ownResult.cards;
			const targetCards = target.getCards("h");
			if (targetCards.length < ownCards.length) return;
			const targetResult2 = await player
				.chooseCardButton("该览：选择" + get.cnNumber(ownCards.length) + "张手牌交换", targetCards, [ownCards.length, ownCards.length], true)
				.set("ai", button => (isFriend ? -1 : 1) * get.value(button.link, player))
				.forResult();
			if (!targetResult2.bool) return;
			await player.swapHandcards(target, ownCards, targetResult2.links);
		},
		ai: {
			order: 6,
			result: { player: 1 },
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
	ai: {
		order: 6,
		result: { player: 1 },
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
	check: () => 1,
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

// === 驳罪 ===
yachai_bozui: {
	audio: 2,
	trigger: { target: "useCardToTarget" },
	filter(event, player) {
		return event.card.name == "sha" && event.player !== player && (player.countCards("e") > 0 || event.player.countCards("e") > 0);
	},
	check(event, player) {
		const myVal = player.getCards("e").reduce((s, c) => s + get.value(c, player), 0);
		const atkVal = event.player.getCards("e").reduce((s, c) => s + get.value(c, event.player), 0);
		return myVal < atkVal ? 1 : (myVal === atkVal ? 0.5 : 0);
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
				const drawChoice = await target.chooseBool("和戍：是否与" + get.translation(player) + "各摸一张牌？")
					.set("ai", function() {
						const asker = _status.event.player;
						const discarder = _status.event.getParent().player;
						if (get.attitude(asker, discarder) > 0) return 1;
						if (asker.countCards("h") <= 2) return 1;
						return 0;
					})
					.forResult();
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
						if (player.countCards("e") >= 2 && player.hp >= player.maxHp - 1) return 0;
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
			await player.gain(jCards, "gain2");
		}
		const sameNames = Object.keys(data.names).filter(name => data.names[name] >= 2);
		const cardsToGive = data.cards.filter(card => card.name && sameNames.includes(card.name));
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
					cards: [],
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
					if (!data.cards.some(c => c.cardid === card.cardid)) {
						data.cards.push(card);
					}
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
		check: () => 1,
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

// === 移霜 ===
yachai_yishuang: {
	trigger: { global: "damageSource" },
	filter(event, player) {
		const card = event.card;
		if (!card) return false;
		const number = get.number(card, player);
		if (typeof number !== "number") return false;
		return !player.getStorage("yachai_yishuang").includes(number);
	},
	check: () => 1,
	async content(event, trigger, player) {
		const card = trigger.card;
		const number = get.number(card, player);
		player.markAuto("yachai_yishuang", [number]);
		player.storage.yachai_yishuang.sort((a, b) => a - b);
		player.markSkill("yachai_yishuang");
		const target = await player.chooseTarget("移霜：令一名角色重铸至多三张牌", (card, p, target) => true)
			.set("ai", target => get.attitude(player, target) > 0 ? 1 : 0)
			.forResult();
		if (target.bool) {
			const t = target.targets[0];
			const cards = await t.chooseCard([1, 3], "he", lib.filter.cardRecastable, "重铸至多三张牌")
				.set("ai", card => 6 - get.value(card))
				.forResult();
			if (cards.bool && cards.cards.length) {
				await t.recast(cards.cards);
			}
		}
	},
	onremove: true,
	intro: { content: "已记录点数：$" },
},

// === 柏舟 ===
yachai_baizhou: {
	trigger: {
		player: "damageBegin1",
		source: "damageBegin1",
	},
	filter(event, player) {
		return event.card && typeof get.number(event.card) === "number";
	},
	check(event, player) {
		const card = event.card;
		const n = get.number(card);
		if (typeof n !== "number") return 0;
		const recorded = player.getStorage("yachai_yishuang");
		const plus = Math.max(1, Math.min(13, n + 3));
		const minus = Math.max(1, Math.min(13, n - 3));
		return (!recorded.includes(plus) || !recorded.includes(minus)) ? 1 : 0;
	},
	async content(event, trigger, player) {
		const card = trigger.card;
		const curNum = get.number(card);
		const recorded = player.getStorage("yachai_yishuang");
		const result = await player.chooseControl("+3", "-3")
			.set("prompt", "柏舟：令此牌点数+3或-3（最小为A，最大为K）")
			.set("ai", () => {
				if (!curNum || typeof curNum !== "number") return 0;
				const plus = Math.max(1, Math.min(13, curNum + 3));
				const minus = Math.max(1, Math.min(13, curNum - 3));
				const pOk = !recorded.includes(plus);
				const mOk = !recorded.includes(minus);
				if (pOk && !mOk) return 0;
				if (!pOk && mOk) return 1;
				const att = get.attitude(player, trigger.source || trigger.player);
				if (trigger.name === "damageBegin1") {
					if (att > 0) return curNum <= 6 ? 0 : 1;
					return curNum >= 8 ? 0 : 1;
				}
				return curNum <= 6 ? 0 : 1;
			})
			.forResult();
		const delta = result.control === "+3" ? 3 : -3;
		const num = Math.max(1, Math.min(13, get.number(card) + delta));
		const owner = get.owner(card) || player;
		owner.addTempSkill("yachai_baizhou_mod", "damageAfter");
		owner.storage.yachai_baizhou_mod = { card, num };
	},
	ai: {
		result: {
			player: () => 1,
		},
	},
},

yachai_baizhou_mod: {
	mod: {
		cardnumber(card, player, num) {
			const storage = player.storage.yachai_baizhou_mod;
			if (storage && storage.card === card) {
				return storage.num;
			}
		},
	},
},

// === 尽规 ===
yachai_jingui: {
	audio: 2,
	trigger: { global: ["loseAfter", "cardsDiscardAfter", "loseAsyncAfter", "equipAfter", "addJudgeAfter", "addToExpansionAfter"] },
	direct: true,
	filter(event, player) {
		const cards = event.getd();
		if (!cards || !cards.length) return false;
		let target = event.player;
		if ((!target || target.isDead()) && event.name === "cardsDiscard") {
			const parent = event.getParent();
			target = parent?.relatedEvent?.player || parent?.player;
		}
		if (!target || target.isDead()) return false;
		if (target !== _status.currentPhase) return false;
		if (player.storage.yachai_jingui_used?.includes(target.playerid)) return false;
		return true;
	},
	check(event, player) {
		const cards = event.getd().filter(c => c && get.itemtype(c) === "card");
		return cards.some(c => get.value(c) > 5) ? 1 : 0;
	},
	async content(event, trigger, player) {
		const cards = trigger.getd().filter(c => c && get.itemtype(c) === "card");
		if (!cards.length) return;
		let target = trigger.player;
		if ((!target || !target.isIn()) && trigger.name === "cardsDiscard") {
			const parent = trigger.getParent();
			target = parent?.relatedEvent?.player || parent?.player;
		}
		if (!target || !target.isIn()) return;
		if (!player.storage.yachai_jingui_used) player.storage.yachai_jingui_used = [];
		player.storage.yachai_jingui_used.push(target.playerid);

		const go = await player.chooseBool(get.prompt("yachai_jingui"), "选择一张牌交给" + get.translation(target)).forResult();
		if (!go.bool) return;

		const result = await player.chooseButton(["尽规：选择一张牌交给" + get.translation(target), cards])
			.set("ai", button => 6 - get.value(button.link))
			.forResult();
		if (!result.bool || !result.links || !result.links.length) return;
		const card = result.links[0];
		card.storage.yachai_jingui = true;
		await target.gain(card, "gain2");
		target.addGaintag([card], "yachai_jingui_mark");
		target.addTempSkill("yachai_jingui_effect", "phaseAfter");
		if (!target.hasSkill("yachai_jingui_cleanup")) {
			target.addSkill("yachai_jingui_cleanup");
		}
	},
	group: ["yachai_jingui_reset"],
	subSkill: {
		reset: {
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			filter(event, player) { return !!player.storage.yachai_jingui_used?.length; },
			async content(event, trigger, player) { delete player.storage.yachai_jingui_used; },
		},
	},
},

yachai_jingui_effect: {
	onremove(player, skill) {
		const cards = player.getCards("hs");
		for (const card of cards) {
			if (card.storage?.yachai_jingui) {
				card.removeGaintag("yachai_jingui_mark");
				delete card.storage.yachai_jingui;
			}
		}
	},
	mod: {
		targetInRange(card, player, target, current) {
			if (card.storage?.yachai_jingui) return true;
		},
		cardUsable(card, player, num) {
			if (card.storage?.yachai_jingui) return num + 999;
		},
	},
},

yachai_jingui_cleanup: {
	charlotte: true,
	trigger: { global: "loseAsyncAfter" },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		const cards = event.getl(player)?.cards2 || [];
		return cards.some(c => get.itemtype(c) == "card" && c.storage?.yachai_jingui);
	},
	content(event, trigger, player) {
		const cards = trigger.getl(player).cards2;
		for (const card of cards) {
			if (get.itemtype(card) == "card" && card.storage?.yachai_jingui) {
				delete card.storage.yachai_jingui;
				card.removeGaintag("yachai_jingui_mark");
			}
		}
	},
},

// === 节概 ===
yachai_jiegai: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { target: "useCardToTarget" },
	filter(event, player) {
		if (event.player === player) return false;
		if (player.hasSkill("yachai_jiegai_mark")) return false;
		if (event.player.inRange(player)) return false;
		return true;
	},
	async content(event, trigger, player) {
		player.addTempSkill("yachai_jiegai_mark", "phaseAfter");
		const targets = trigger.getParent().targets;
		targets.remove(player);
	},
	subSkill: {
		mark: { charlotte: true },
	},
},

// === 势策 ===
yachai_shice: {
	audio: 2,
	trigger: { target: "useCardToTarget" },
	filter(event, player) {
		if (player.hasSkill("yachai_shice_mark")) return false;
		if (!get.tag(event.card, "damage")) return false;
		return true;
	},
	check(event, player) { return 1; },
	async content(event, trigger, player) {
		player.addTempSkill("yachai_shice_mark", { global: "phaseAfter" });
		const useCard = trigger.getParent();
		const user = trigger.player;
		const targets = useCard.targets.filter(t => t.isIn());
		if (!targets.length) return;
		const result = await player.chooseTarget("势策：令此牌的一个目标摸一张牌", true,
			(card, p, t) => targets.includes(t))
			.set("ai", target => get.attitude(player, target) > 0 ? 1 : -1)
			.forResult();
		if (!result.bool) return;
		const t = result.targets[0];
		await t.draw();
		if (t !== player) {
			player.addTempSkill("yachai_shice_check");
			player.storage.yachai_shice_check_info = { user, t, useCard };
		}
	},
	subSkill: {
		mark: { charlotte: true },
		check: {
			trigger: { global: "useCardAfter" },
			forced: true,
			silent: true,
			filter(event, player) {
				const info = player.storage.yachai_shice_check_info;
				return info && event === info.useCard;
			},
			content: async function (event, trigger, player) {
				const info = player.storage.yachai_shice_check_info;
				delete player.storage.yachai_shice_check_info;
				player.removeSkill("yachai_shice_check");
				const damages = game.getGlobalHistory("everything", evt =>
					evt.name === "damage" && evt.getParent("useCard") === info.useCard);
				const dmgPlayer = damages.some(e => e.player === player);
				const dmgTarget = damages.some(e => e.player === info.t);
				if (!dmgPlayer || !dmgTarget) {
					await player.discardPlayerCard(info.user, "he", true);
				}
			},
		},
	},
},

// === 将明 ===
yachai_jiangming: {
	audio: 2,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		if (!event.cards || !event.cards.length) return false;
		const cardNum = get.number(event.card);
		if (typeof cardNum !== "number") return false;
		if (!player.hasHistory("lose", evt => {
			const parent = evt.relatedEvent || evt.getParent();
			return evt.hs && evt.hs.length > 0 && parent == event;
		})) return false;
		const count = player.getStorage("yachai_jiangming_used").length;
		if (count >= player.maxHp) return false;
		const maxBefore = player.storage.yachai_jiangming_maxBefore;
		if (count > 0 && typeof maxBefore === "number" && cardNum <= maxBefore) return false;
		return true;
	},
	check(event, player) { return 1; },
	async content(event, trigger, player) {
		const cardNum = get.number(trigger.card);
		player.markAuto("yachai_jiangming_used", [trigger.card.cardid]);
		const X = player.maxHp;
		const revealed = get.cards(X);
		await player.showCards(revealed, get.translation(player) + "发动了【将明】");
		const candidates = revealed.filter(c =>
			get.type2(c) !== "equip" && get.type2(c) !== "equip6" && get.number(c) > cardNum &&
			lib.filter.cardEnabled(c, player) && game.hasPlayer(target => lib.filter.targetEnabled(c, player, target)));
		if (!candidates.length) return;
		const result = await player.chooseButton(["将明：选择要使用的牌（可多选）", candidates], [0, candidates.length])
			.set("ai", button => {
				const card = button.link;
				return player.getUseValue(card);
			})
			.forResult();
		if (!result.bool || !result.links || !result.links.length) return;
		for (const card of result.links) {
			await player.chooseUseTarget(card, true, false)
				.set("prompt", "将明：使用" + get.translation(card))
				.forResult();
		}
	},
	group: ["yachai_jiangming_tracker", "yachai_jiangming_clear"],
	subSkill: {
		tracker: {
			trigger: { player: "useCardAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (!event.cards || !event.cards.length) return false;
				if (typeof get.number(event.card) !== "number") return false;
				if (!player.hasHistory("lose", evt => {
					const parent = evt.relatedEvent || evt.getParent();
					return evt.hs && evt.hs.length > 0 && parent == event;
				})) return false;
				return true;
			},
			async content(event, trigger, player) {
				const cardNum = get.number(trigger.card);
				const oldMax = player.storage.yachai_jiangming_maxNum || 0;
				player.storage.yachai_jiangming_maxBefore = oldMax;
				player.storage.yachai_jiangming_maxNum = Math.max(cardNum, oldMax);
			},
		},
		clear: {
			trigger: { global: "phaseAfter" },
			forced: true,
			popup: false,
			async content(event, trigger, player) {
				player.storage.yachai_jiangming_used = [];
				delete player.storage.yachai_jiangming_maxNum;
				delete player.storage.yachai_jiangming_maxBefore;
			},
		},
	},
},

// === 赝令 ===
yachai_yanling: {
	audio: 2,
	trigger: { global: "useCardToPlayer" },
	filter(event, player) {
		if (!event.isFirstTarget) return false;
		if (event.player === player) return false;
		const card = event.card;
		if (get.type2(card) !== "trick") return false;
		if (get.type(card) !== "trick") return false;
		if (!event.targets?.length) return false;
		if (event.targets.length === 1 && event.targets[0] === player) return false;
		return !player.hasSkill("yachai_yanling_used");
	},
	check(event, player) {
		return event.targets?.length > 1 ? 0 : 1;
	},
	async cost(event, trigger, player) {
		event.result = await player
			.chooseBool(get.prompt(event.skill), "代替" + get.translation(trigger.player) + "成为此牌的使用者")
			.forResult();
	},
	async content(event, trigger, player) {
		trigger.getParent().player = player;
		trigger.getParent().skill = "yachai_yanling";
		game.log(player, "成为了", trigger.card, "的使用者");
		player.addSkillLog("yachai_yuxu");
		player.addTempSkill("yachai_yanling_used", "phaseAfter");
	},
	subSkill: {
		used: { charlotte: true },
	},
},

// === 非矫 ===
yachai_feijiao: {
	audio: 2,
	locked: true,
	trigger: { global: "shaMiss" },
	filter(event, player) {
		if (event.player === player) return false;
		if (!event.target || event.target === player) return false;
		return true;
	},
	async content(event, trigger, player) {
		const attacker = trigger.player;
		const defender = trigger.target;
		const seat1 = game.findPlayer(current => current.getSeatNum() == 1);
		if (!seat1) return;
		const distA = get.distance(attacker, seat1, "absolute");
		const distD = get.distance(defender, seat1, "absolute");
		if (distA <= distD) {
			await attacker.chooseToDiscard("he", true);
		} else if (player.hasSkill("yachai_yuxu")) {
			player.removeSkill("yachai_yuxu");
			game.log(player, "失去了【誉虚】");
		}
	},
},

// === 誉虚 ===
yachai_yuxu: {
	audio: 2,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		const evt = event.getParent("phaseUse");
		return evt && evt.name === "phaseUse";
	},
	check(event, player) { return 1; },
	direct: true,
	async content(event, trigger, player) {
		if (player.storage.yachai_yuxu_next) {
			player.storage.yachai_yuxu_next = false;
			await player.chooseToDiscard("he", true);
		} else {
			const go = await player
				.chooseBool("是否发动【誉虚】摸一张牌？")
				.forResult();
			if (go.bool) {
				await player.draw();
				player.storage.yachai_yuxu_next = true;
			}
		}
	},
	group: "yachai_yuxu_reset",
	subSkill: {
		reset: {
			trigger: { global: "phaseUseBegin" },
			forced: true,
			popup: false,
			silent: true,
			async content(event, trigger, player) {
				delete player.storage.yachai_yuxu_next;
			},
		},
	},
	onremove(player) {
		delete player.storage.yachai_yuxu_next;
	},
},

// === 效戕 ===
	yachai_xiaoqiang: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		let count = 0;

		await player.chooseToDiscard(true, "he", player.countCards("he"));
		count++;

		if (player.hp > 1) {
			const r2 = await player.chooseBool("是否执行第②项“失去体力至1点”？")
				.set("ai", () => player.hp > 3 ? 1 : 0)
				.forResult();
			if (r2.bool) {
				await player.loseHp(player.hp - 1);
				count++;
			}
		}

		if (!player.isTurnedOver()) {
			const r3 = await player.chooseBool("是否执行第③项“翻至背面”？")
				.set("ai", () => player.isTurnedOver() ? 0 : 1)
				.forResult();
			if (r3.bool) {
				await player.turnOver();
				count++;
			}
		}

		const { targets, bool } = await player
			.chooseTarget("选择【决斗】的目标", lib.filter.notMe)
			.set("ai", target => get.attitude(player, target) <= 0 ? 1 : -1)
			.forResult();
		if (!bool) return;
		const target = targets[0];

		for (let i = 0; i < count; i++) {
			await player.useCard(new lib.element.VCard({ name: "juedou" }), target, "yachai_xiaoqiang");
		}
	},
	ai: {
		order: 1,
		result: { player: 1 },
	},
},

// === 长殇 ===
yachai_changshang: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { player: "damageAfter" },
	async content(event, trigger, player) {
		if (trigger._dyinged) {
			await player.draw(2);
		} else {
			const cards = Array.from(ui.discardPile.childNodes).slice(-2);
			await player.gain(cards, "gain2");
		}
	},
	group: ["yachai_changshang_die"],
	subSkill: {
		die: {
			trigger: { player: "die" },
			forceDie: true,
			forced: true,
			async content(event, trigger, player) {
				const { targets, bool } = await player
					.chooseTarget("选择获得【长殇】的角色", lib.filter.notMe)
					.set("forceDie", true)
					.set("ai", target => get.attitude(player, target) > 0 ? 1 : 0)
					.forResult();
				if (bool) {
					targets[0].addSkill("yachai_changshang");
					game.log(targets[0], "获得了【长殇】");
				}
			},
		},
	},
},

// === 修睦 ===
yachai_xiumu: {
	audio: 2,
	direct: true,
	trigger: { global: "phaseZhunbei" },
	check(event, player) {
		const target = event.player;
		if (get.attitude(player, target) <= 0) return 0;
		if (target.isDamaged() && target.hp >= 3) return 0;
		if (target.countCards("h") < 3) return 0;
		return 1;
	},
	async content(event, trigger, player) {
		const current = trigger.player;
		const countKey = "yachai_xiumu_count";

		async function ask(user, target) {
			if (!user.isAlive() || user === target) return;
			const X = (lib.skill[countKey] || 0) + 1;
			if (user.countCards("h") < X) return;
			const go = await user
				.chooseBool("是否对" + get.translation(target) + "发动【修睦】？")
				.set("ai", () => get.attitude(user, target) > 0 ? 1 : 0)
				.forResult();
			if (!go.bool) return;

			let cardName = "jiu";
			if (target.isDamaged()) {
				const c = await user
					.chooseControl("桃", "酒")
					.set("prompt", "修睦：选择转化的牌")
					.set("ai", () => 0)
					.forResult();
				cardName = c.control === "桃" ? "tao" : "jiu";
			}

			const { cards, bool } = await user
				.chooseCard(X, "h", true, "修睦：选择" + X + "张手牌")
				.set("ai", card => -get.value(card, user))
				.forResult();
			if (!bool) return;

			const vcard = get.autoViewAs({ name: cardName }, cards);
			if (!lib.filter.cardEnabled(vcard, user, "forceEnable")) return;
			if (!lib.filter.targetEnabled2(vcard, user, target)) return;
			await user.useCard(vcard, cards, [target], "yachai_xiumu");

			lib.skill[countKey] = (lib.skill[countKey] || 0) + 1;
		}

		if (current === player) {
			const up = player.previousSeat;
			const down = player.nextSeat;
			if (up && up !== player && up.isAlive()) await ask(up, player);
			if (down && down !== player && down.isAlive() && down !== up) await ask(down, player);
		} else if (current === player.previousSeat || current === player.nextSeat) {
			await ask(player, current);
		}
	},
},

// === 神交 ===
yachai_shenjiao: {
	audio: 2,
	limited: true,
	trigger: { player: "dying" },
	check: () => 1,
	async cost(event, trigger, player) {
		event.result = await player
			.chooseTarget(get.prompt2(event.skill), lib.filter.notMe)
			.set("ai", target => get.attitude(player, target) > 0 ? 1 : 0)
			.set("logSkill", event.skill)
			.forResult();
	},
	async content(event, trigger, player) {
		player.awakenSkill(event.name);
		const target = event.targets[0];
		if (!target || !target.isIn()) return;

		const r = await target
			.chooseBool("是否令" + get.translation(player) + "回复所有体力？")
			.set("prompt", "若执行，你摸等量张牌且【修睦】视为未发动过。")
			.forResult();

		if (r.bool) {
			const recovered = player.maxHp - player.hp;
			await player.recover(recovered);
			await target.draw(recovered);
			lib.skill.yachai_xiumu_count = 0;
		}
	},
},

// === 岐嶷 ===
yachai_qiyi: {
	enable: ["chooseToUse", "chooseToRespond"],
	filter(event, player) {
		if (!Array.isArray(event.respondTo)) return false;
		const source = event.respondTo[0];
		if (!source || source === player || !source.isAlive()) return false;
		if (!source.countCards("h")) return false;
		if (player.getStorage("yachai_qiyi_used").includes(source)) return false;
		if (event.type === "wuxie" && event.info_map) {
			const map = event.info_map;
			if (map.isJudge) return false;
			const targets = map.targets || (map.target ? [map.target] : []);
			if (!targets.includes(player)) return false;
		}
		return true;
	},
	hiddenCard(player, name) {
		const evt = _status.event;
		if (Array.isArray(evt.respondTo)) {
			const source = evt.respondTo[0];
			if (!source || source === player || !source.countCards("h")) return false;
			if (player.getStorage("yachai_qiyi_used").includes(source)) return false;
			return source.countCards("h", { name }) > 0;
		}
		if (evt._info_map) {
			const map = evt._info_map;
			if (map.isJudge || !map.player) return false;
			const source = map.player;
			if (!source || source === player || !source.countCards("h")) return false;
			if (player.getStorage("yachai_qiyi_used").includes(source)) return false;
			const targets = map.targets || (map.target ? [map.target] : []);
			if (!targets.includes(player)) return false;
			return source.countCards("h", { name }) > 0;
		}
		return false;
	},
	hiddenWuxie(player, info) {
		if (!info || !info.player || info.isJudge) return false;
		const source = info.player;
		if (!source || source === player || !source.isAlive()) return false;
		if (!source.countCards("h")) return false;
		if (player.getStorage("yachai_qiyi_used").includes(source)) return false;
		const targets = info.targets || (info.target ? [info.target] : []);
		if (!targets.includes(player)) return false;
		return true;
	},
	chooseButton: {
		dialog(event, player) {
			const source = event.respondTo[0];
			if (!source.countCards("h")) return;
			player.logSkill("yachai_qiyi", source);
			player.markAuto("yachai_qiyi_used", [source]);
			return ui.create.dialog("岐嶷：选择" + get.translation(source) + "的手牌", source.getCards("h"));
		},
		filter(button, player) {
			const evt = _status.event.getParent();
			console.log("[岐嶷filter] _status.event:", _status.event?.name);
			console.log("[岐嶷filter] evt.name:", evt?.name, "evt.respondTo:", evt?.respondTo?.[0]?.name, evt?.respondTo?.[1]?.name);
			console.log("[岐嶷filter] evt.filterCard类型:", typeof evt?.filterCard, "是否函数:", typeof evt?.filterCard === "function");
			const source = evt.respondTo[0];
			const cardName = get.name(button.link, source);
			console.log("[岐嶷filter] button.link卡名:", cardName, "原始名:", button.link.name, "nature:", get.nature(button.link, source));
			const virtualCard = { name: cardName, nature: get.nature(button.link, source), isCard: true };
			let result;
			try {
				result = evt.filterCard(virtualCard, player, evt);
				console.log("[岐嶷filter] filterCard结果:", result);
			} catch (e) {
				console.log("[岐嶷filter] filterCard报错:", e.message);
				result = false;
			}
			return result;
		},
		check(button) {
			const evt = _status.event.getParent();
			const source = evt.respondTo[0];
			return -get.value(button.link, source);
		},
		backup(links, player) {
			const card = links[0];
			const source = _status.event.respondTo[0];
			return {
				viewAs: {
					name: get.name(card, source),
					nature: get.nature(card, source),
					isCard: true,
				},
				card: card,
				source: source,
				filterCard: () => false,
				selectCard: -1,
				log: false,
				async precontent(event, trigger, player) {
					const backup = lib.skill.yachai_qiyi_backup;
					event.result.card = backup.card;
					event.result.cards = [backup.card];
				}
			};
		},
		ai: {
			respondSha: true,
			respondShan: true,
			skillTagFilter(player, tag) {
				const name = "s" + tag.slice("respondS".length);
				return lib.skill.yachai_qiyi.hiddenCard(player, name);
			}
		}
	},
	content() {},
	subSkill: {
		used: {
			charlotte: true,
			onremove: true,
			mark: true,
			marktext: "嶷",
			intro: {
				content: (storage = []) => `已触发岐嶷的角色：${get.translation(storage.toUniqued())}`,
			},
		},
	},
},

// === 逞师 ===
yachai_chengshi: {
	enable: "phaseUse",
	usable: 1,
	group: "yachai_chengshi_damageCheck",
	filter(event, player) {
		return game.hasPlayer(target => target !== player);
	},
	async content(event, trigger, player) {
		const r1 = await player
			.chooseTarget("逞师：选择一名其他角色作为目标", lib.filter.notMe)
			.set("ai", target => {
				const atk = get.attitude(player, target);
				if (atk <= 0) return 2;
				return 0.5;
			})
			.forResult();
		if (!r1.bool) return;
		const targetA = r1.targets[0];

		const r2 = await player
			.chooseTarget("逞师：选择弃牌来源角色", (card, player, target) => {
				return target !== targetA && target.countCards("he") > 0;
			})
			.set("ai", target => {
				const atk = get.attitude(player, target);
				if (atk <= 0) return 3;
				if (target === player) return 2;
				return 1;
			})
			.forResult();
		if (!r2.bool) return;
		const discardFrom = r2.targets[0];

		await player.discardPlayerCard(discardFrom, "he", true);

		const sha = { name: "sha", isCard: true };
		if (!player.canUse(sha, targetA, false, false)) return;
		player.storage.yachai_chengshi_tracker = { damaged: false };
		await player.useCard(sha, targetA, false, "yachai_chengshi");
		const { damaged } = player.storage.yachai_chengshi_tracker;
		delete player.storage.yachai_chengshi_tracker;

		if (damaged) {
			player.storage.yachai_qiyi_used = [];
			player.unmarkSkill("yachai_qiyi_used");
		} else if (discardFrom !== player) {
			const sha2 = { name: "sha", isCard: true };
			if (discardFrom.canUse(sha2, player, false, false)) {
				await discardFrom.useCard(sha2, player, false);
			}
		}
	},
	subSkill: {
		damageCheck: {
			trigger: { source: "damage" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (!player.storage.yachai_chengshi_tracker) return false;
				return event.getParent("useCard")?.skill === "yachai_chengshi";
			},
			content() {
				player.storage.yachai_chengshi_tracker.damaged = true;
			},
		},
	},
	ai: {
		order: 3,
		result: { player: 1 },
	},
},

// === 迫 ===
yachai_po: {
	marktext: "迫",
	intro: { content: "mark" },
},

// === 浸势 ===
yachai_jinshi: {
	trigger: { global: "damageAfter" },
	filter(event, player) {
		const damaged = event.player;
		const source = event.source;
		if (damaged !== player && damaged.countGainableCards(player, "e") > 0) return true;
		if (source && source !== player && source.countGainableCards(player, "e") > 0) return true;
		return false;
	},
	check: () => 1,
	async content(event, trigger, player) {
		const damaged = trigger.player;
		const source = trigger.source;
		const targets = [];
		if (damaged !== player && damaged.countGainableCards(player, "e") > 0) targets.push(damaged);
		if (source && source !== player && source.countGainableCards(player, "e") > 0) targets.push(source);
		if (!targets.length) return;
		let target;
		if (targets.length === 1) target = targets[0];
		else {
			const r = await player.chooseTarget("浸势：选择获得装备的角色", (card, p, t) => targets.includes(t))
				.set("ai", target => {
					const cards = target.getCards("e", c => lib.filter.canBeGained(c, player, target));
					const val = cards.reduce((s, c) => s + get.value(c, player), 0);
					return get.attitude(player, target) <= 0 ? val : 0;
				})
				.forResult();
			if (!r.bool) return;
			target = r.targets[0];
		}
		const result = await player.gainPlayerCard(target, "e", true).forResult();
		if (result?.bool && result.cards?.length) {
			const card = result.cards[0];
			if (player.getCards("h").includes(card) && get.type(card) === "equip") {
				await player.chooseUseTarget(card, true, "nopopup");
			}
		}
		player.addMark("yachai_po", 1);
		if (player.countMark("yachai_po") >= 3 && !player.hasSkill("yachai_nilv")) {
			await game.delayx();
			player.logSkill("yachai_faji");
			player.awakenSkill("yachai_faji");
			player.removeSkill("yachai_jinshi");
			player.addSkill("yachai_nilv");
			const r2 = await player.chooseTarget("发机：选择一名其他角色", (card, p, t) => t !== p).forResult();
			if (r2.bool && r2.targets?.length) {
				const t = r2.targets[0];
				player.storage.yachai_faji_target = t;
				t.addSkill("yachai_faji_mark");
				player.addSkill("yachai_faji_damage");
				player.addSkill("yachai_faji_remove");
				player.addSkill("yachai_faji_clear");
			}
		}
	},
},

// === 发机 ===
yachai_faji: {
	awaken: true,
},

yachai_faji_damage: {
	trigger: { source: "damageBegin1" },
	filter(event, player) {
		const target = player.storage.yachai_faji_target;
		return target && event.player === target;
	},
	forced: true,
	charlotte: true,
	async content(event, trigger, player) {
		trigger.num++;
	},
},

yachai_faji_remove: {
	trigger: { player: "damageBegin3" },
	filter(event, player) {
		const target = player.storage.yachai_faji_target;
		return target && event.source === target;
	},
	forced: true,
	charlotte: true,
	async content(event, trigger, player) {
		player.removeMark("yachai_po", 1);
	},
},

yachai_faji_clear: {
	trigger: { global: "damageAfter" },
	filter(event, player) {
		const target = player.storage.yachai_faji_target;
		if (!target) return false;
		return event.hasNature("thunder") && (event.player === player || event.player === target);
	},
	forced: true,
	charlotte: true,
	forceDie: true,
	async content(event, trigger, player) {
		const target = player.storage.yachai_faji_target;
		if (target) target.removeSkill("yachai_faji_mark");
		player.removeSkill("yachai_faji_damage");
		player.removeSkill("yachai_faji_remove");
		player.removeSkill("yachai_faji_clear");
		delete player.storage.yachai_faji_target;
	},
},

yachai_faji_mark: {
	mark: true,
	intro: { content: "诞神与你塔塔开" },
},

// === 逆旅 ===
yachai_nilv: {
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countMark("yachai_po") > 0;
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
	async content(event, trigger, player) {
		player.removeMark("yachai_po", 1);
		const choice = await player.chooseControl("视为使用基本牌", "造成伤害")
			.set("ai", () => {
				const player = _status.event.player;
				const X = player.storage.yachai_nilv_lastSeat || game.players.length;
				const valid = game.filterPlayer(t => t !== player && t.getSeatNum() < X);
				const canDmg = valid.some(t => get.damageEffect(t, player, player) > 0);
				if (!canDmg) return 0;
				const X2 = player.storage.yachai_nilv_lastSeat || game.players.length;
				const seatSize = game.players.length;
				if (!player.countCards("h") && X2 > seatSize * 0.6) return 1;
				const basicNames = lib.inpile.filter(n => get.type(n) === "basic" && player.hasUseTarget({ name: n, isCard: true }, true, false));
				return basicNames.length > 0 ? 0 : 1;
			})
			.forResult();
		if (choice.control === "视为使用基本牌") {
			const list = [];
			for (const name of lib.inpile) {
				if (get.type(name) !== "basic") continue;
				if (player.hasUseTarget({ name, isCard: true }, true, false)) list.push(["基本", "", name]);
			}
			if (!list.length) return;
			const btn = await player.chooseButton(["逆旅：视为使用一张基本牌", [list, "vcard"]], true)
				.set("filterButton", b => get.player().hasUseTarget({ name: b.link[2], isCard: true }, true, false))
				.set("ai", button => {
					const p = _status.event.player;
					return p.getUseValue({ name: button.link[2] });
				})
				.forResult();
			if (!btn?.bool || !btn.links?.length) return;
			await player.chooseUseTarget({ name: btn.links[0][2], isCard: true }, true, false)
				.set("prompt", "逆旅：视为使用【" + get.translation(btn.links[0][2]) + "】")
				.forResult();
		} else {
			const X = player.storage.yachai_nilv_lastSeat || game.players.length;
			const valid = game.filterPlayer(t => t !== player && t.getSeatNum() < X);
			if (!valid.length) return;
			const r = await player.chooseTarget(valid, "逆旅：对一名角色造成1点伤害（座位号需小于" + X + "）")
				.set("ai", target => get.damageEffect(target, player, player))
				.forResult();
			if (!r?.bool || !r.targets?.length) return;
			const t = r.targets[0];
			player.storage.yachai_nilv_lastSeat = t.getSeatNum();
			await t.damage();
		}
	},
},

// === 流罹 ===
yachai_liuliu: {
	forced: true,
	trigger: { target: "useCardToTarget" },
	init(player, skill) {
		if (!player.storage.yachai_liuliu_groups) {
			player.storage.yachai_liuliu_groups = [player.group];
		}
	},
	content(event, trigger, player) {
		const turn = _status.currentPhase;
		if (!turn) return;
		if (!player.storage.yachai_liuliu_targeted || player.storage.yachai_liuliu_turn !== turn) {
			player.storage.yachai_liuliu_targeted = true;
			player.storage.yachai_liuliu_turn = turn;
			player.addTempSkill("yachai_liuliu_end", "phaseBeginStartAfter");
		}
	},
	subSkill: {
		end: {
			trigger: { global: "phaseEnd" },
			forced: true,
			filter(event, player) {
				return player.storage.yachai_liuliu_targeted
					&& event.player === _status.currentPhase
					&& event.player === player.storage.yachai_liuliu_turn;
			},
			onremove: true,
			async content(event, trigger, player) {
				delete player.storage.yachai_liuliu_targeted;
				delete player.storage.yachai_liuliu_turn;
				player.storage.yachai_liuliu_groups = player.storage.yachai_liuliu_groups || [];
				const groups = lib.group.filter(g => g !== "shen" && !player.storage.yachai_liuliu_groups.includes(g));
				if (!groups.length) {
					const toRemove = player.getSkills(null, false, false).filter(sk => {
						const info = get.info(sk);
						return !info || !info.charlotte;
					});
					await player.removeSkills(toRemove);
					player.addSkill("yachai_beixuan");
					return;
				}
				const result = await player.chooseControl(groups)
					.set("prompt", "流罹：选择要变更的势力")
					.set("ai", () => 0)
					.forResult();
				const newGroup = result.control;
				player.storage.yachai_liuliu_groups.push(newGroup);
				await player.changeGroup(newGroup);
				const choice = await player.chooseControl("视为使用基本牌", "从牌堆或弃牌堆中选择一张坐骑牌使用")
					.set("prompt", "流罹：选择一项")
					.set("ai", () => {
						const player = _status.event.player;
						const basicCount = lib.inpile.filter(n => get.type(n) === "basic" && player.hasUseTarget({ name: n, isCard: true }, true, false)).length;
						const hasMinus1 = player.countCards("e", c => get.subtype(c) === "equip3") > 0;
						if (basicCount > 0 && !hasMinus1) {
							const avg = lib.inpile.filter(n => get.type(n) === "basic").reduce((s, n) => s + player.getUseValue({ name: n }, null, true), 0) / 4;
							if (avg > 1.5) return 0;
						}
						const mountAvailable = Array.from(ui.cardPile.childNodes).concat(Array.from(ui.discardPile.childNodes)).some(c => ["equip3", "equip4"].includes(get.subtype(c)));
						if (mountAvailable && hasMinus1) return 1;
						if (!mountAvailable && basicCount > 0) return 0;
						if (basicCount > 0 && mountAvailable && hasMinus1) return get.attitude(player, player) > 0 ? 0 : 1;
						return mountAvailable ? 1 : 0;
					})
					.forResult();
				if (choice.control === "视为使用基本牌") {
					const list = [];
					for (const name of lib.inpile) {
						if (get.type(name) !== "basic") continue;
						if (player.hasUseTarget({ name, isCard: true }, true, false)) {
							list.push(["基本", "", name]);
						}
					}
					if (list.length) {
						if (list.length === 1) {
							await player.chooseUseTarget({ name: list[0][2], isCard: true }, true, false)
								.set("prompt", "流罹：视为使用【" + get.translation(list[0][2]) + "】")
								.forResult();
						} else {
							const btn = await player.chooseButton(["流罹：视为使用一张基本牌", [list, "vcard"]], true)
								.set("filterButton", b => get.player().hasUseTarget({ name: b.link[2], isCard: true }, true, false))
								.set("ai", button => {
									const p = _status.event.player;
									return p.getUseValue({ name: button.link[2] });
								})
								.forResult();
							if (btn?.bool && btn.links?.length) {
								await player.chooseUseTarget({ name: btn.links[0][2], isCard: true }, true, false)
									.set("prompt", "流罹：视为使用【" + get.translation(btn.links[0][2]) + "】")
									.forResult();
							}
						}
					}
				} else {
					const mounts = [];
					for (const card of ui.cardPile.childNodes) {
						if (["equip3", "equip4"].includes(get.subtype(card))) mounts.push(card);
					}
					for (const card of ui.discardPile.childNodes) {
						if (["equip3", "equip4"].includes(get.subtype(card))) mounts.push(card);
					}
					if (mounts.length) {
						let chosen;
						if (mounts.length === 1) chosen = mounts[0];
						else {
							const r = await player.chooseButton(["流罹：选择一张坐骑牌", [mounts, "card"]], true).forResult();
							if (r?.bool && r.links?.length) chosen = r.links[0];
						}
						if (chosen) {
							await player.chooseUseTarget(chosen, true, "nopopup").forResult();
						}
					}
				}
			},
		},
	},
},

// === 背玄 ===
yachai_beixuan: {
	enable: "phaseUse",
	usable: 1,
	ai: {
		order: 8,
		result: { player: 1 },
	},
	async content(event, trigger, player) {
		const present = new Set();
		game.countPlayer(p => {
			if (p.group) present.add(p.group);
		});
		const allGroups = lib.group.filter(g => g !== "shen");
		const missing = allGroups.filter(g => !present.has(g));
		const X = Math.max(1, missing.length);
		await player.draw(X);
		player.addSkill("yachai_beixuan_block");
		player.addSkill("yachai_beixuan_clear");
	},
	subSkill: {
		block: {
			trigger: { player: "gainBegin" },
			forced: true,
			popup: false,
			filter(event, player) {
				return event.getParent("draw")?.player === player;
			},
			async content(event, trigger, player) {
				trigger.cancel();
			},
			charlotte: true,
			mark: true,
			intro: {
				content: "背玄：不能再摸牌",
			},
		},
		clear: {
			trigger: {
				player: "loseAfter",
				global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
			},
			forced: true,
			popup: false,
			filter(event, player) {
				if (player.countCards("h")) return false;
				const evt = event.getl(player);
				return evt && evt.hs && evt.hs.length;
			},
			async content(event, trigger, player) {
				player.removeSkill("yachai_beixuan_block");
				player.removeSkill("yachai_beixuan_clear");
			},
			charlotte: true,
		},
	},
},
};
