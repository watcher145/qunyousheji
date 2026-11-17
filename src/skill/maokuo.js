import { lib, game, get, ui, _status } from "noname";
import { qunyou_clearVisiblePile, qunyou_getVisiblePileTop, qunyou_hasVisiblePile, qunyou_markPileVisible, qunyou_pruneVisiblePile, qunyou_visiblePileSet } from "./visiblePile.js";
import { qunyou_turnDiscards } from "./helpers.js";

// ==================== 一蛋展示（猫咪大院包）：11 名武将 ====================
// 来源：《一蛋展示》提取结果（李春香/卫温&诸葛直/王蕃/刘伶/黄崇/曹衮/夏侯徽/杨戏/臧洪/何晏/笮融）。
// 规则口径已由用户拍板：歃盟（出牌阶段内主动声明 + 连击计数）、残猎（按笮融每回合首次发动回血）、
// 会佛（同色只分存量、空堆也结束回合；换新目标结束回合）。

export const skills = {
// === 博览 ===
maokuo_bolan: {
	audio: 2,
	group: ["maokuo_bolan_jieshu"],
	subSkill: {
		flag: {
			charlotte: true,
			onremove: true,
			mark: true,
			marktext: "览",
			intro: {
				name: "博览",
				content(storage, player) {
					const card = player.storage.maokuo_bolan_card;
					return card ? `本回合亮出：${get.translation(card.suit)}${get.translation(card.name)}（点数${card.num}）` : "尚未亮出牌";
				},
			},
		},
	},
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		return player.isIn() && ui.cardPile.childNodes.length > 0;
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool("博览：是否亮出牌堆顶的一张牌？")
			.set("ai", () => true)
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		// 「亮出」而非「展示」：先把牌堆顶的牌移入处理区（ordering），再展示；
		// 直接 get.cards(1, true) + showCards 只是展示牌堆顶，牌仍留在牌堆
		const card = get.cards(1)[0];
		if (!card) {
			return;
		}
		await game.cardsGotoOrdering(card);
		await player.showCards([card], get.translation(player) + "亮出了牌堆顶的牌");
		player.storage.maokuo_bolan_card = { num: get.number(card), name: get.name(card), suit: get.suit(card) };
		player.addTempSkill("maokuo_bolan_flag", "phaseAfter");
	},
},
// === 博览 ===
maokuo_bolan_jieshu: {
	audio: "maokuo_bolan",
	trigger: { player: "phaseJieshuBegin" },
	filter(event, player) {
		return (player.storage.maokuo_bolan_card?.num || 0) > 0 && player.countCards("hejsx") > 0;
	},
	// 点数和恰为 num 的可行子集：非手牌优先（展示手牌有信息代价），手牌负责补齐
	findSubset(player, num) {
		if (!num) return null;
		const all = player.getCards("hejsx");
		const sorted = all.filter((card) => get.position(card) != "h").concat(all.filter((card) => get.position(card) == "h"));
		const dp = new Map([[0, []]]);
		for (const card of sorted) {
			const value = get.number(card) || 0;
			if (!value) continue;
			for (const [sum, list] of [...dp.entries()]) {
				const next = sum + value;
				if (next > num || dp.has(next)) continue;
				dp.set(next, list.concat([card]));
			}
		}
		return dp.get(num) || null;
	},
	async cost(event, trigger, player) {
		const num = player.storage.maokuo_bolan_card?.num || 0;
		const can = !!lib.skill.maokuo_bolan_jieshu.findSubset(player, num);
		const res = await player.chooseBool(`博览：是否选择你区域内的至少一张牌（点数之和为${num}时摸等量的牌）？`)
			.set("ai", () => can)
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		const num = player.storage.maokuo_bolan_card?.num;
		if (!num) {
			return;
		}
		const pick = lib.skill.maokuo_bolan_jieshu.findSubset(player, num);
		const res = await player.chooseCard("hejsx", [1, player.countCards("hejsx")], `博览：选择你区域内的至少一张牌（若为手牌则展示之，点数之和为${num}时摸等量的牌）`, "allowChooseAll")
			.set("ai", card => (pick ? (pick.includes(card) ? 10 : -1) : 0))
			.forResult();
		if (!res?.bool || !res.cards?.length) {
			return;
		}
		const hand = res.cards.filter(c => get.position(c) == "h");
		if (hand.length) {
			await player.showCards(hand, get.translation(player) + "展示了选择的牌");
		}
		delete player.storage.maokuo_bolan_card;
		const sum = res.cards.reduce((s, c) => s + (get.number(c) || 0), 0);
		if (sum == num) {
			await player.draw(res.cards.length);
		} else {
			game.log(player, "选择的牌点数之和（", sum, "）与亮出的牌点数不符");
		}
	},
	ai: {
		threaten: 1.2,
	},
},
// === 残猎 ===
maokuo_canlie: {
	audio: 2,
	forced: true,
	trigger: { global: "gainAfter" },
	filter(event, player) {
		return _status.currentPhase == player && event.player && event.player != player && event.player.isIn();
	},
	async content(event, trigger, player) {
		await trigger.player.damage(player, 1);
		const count = (player.getStorage("maokuo_canlie_count") || 0) + 1;
		player.storage.maokuo_canlie_count = count;
		if (count == 1) {
			await player.recover(1);
			game.log(player, "于此回合内首次发动【残猎】，回复了1点体力");
		}
	},
	group: ["maokuo_canlie_reset"],
},
// === 残猎 ===
maokuo_canlie_reset: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "phaseBegin" },
	async content(event, trigger, player) {
		delete player.storage.maokuo_canlie_count;
	},
},
// === 赤宴 ===
maokuo_chiyan: {
	audio: 2,
	juexingji: true,
	skillAnimation: true,
	animationColor: "fire",
	forced: true,
	trigger: { player: "phaseEnd" },
	filter(event, player) {
		return player.isIn() && (player.hp == 1 || !player.countCards("h"));
	},
	async content(event, trigger, player) {
		player.awakenSkill(event.name);
		// 额外回合先入队：此刻仍在 phase 事件链内，insertPhase 才会把它挂到本回合之后
		player.insertPhase("maokuo_chiyan");
		if (player.hp == 1 && player.countCards("h")) {
			await player.discard(player.getCards("h"));
			game.log(player, "弃置了所有手牌");
		} else if (!player.countCards("h") && player.hp > 1) {
			await player.loseHp(player.hp - 1);
			game.log(player, "将体力值减至1");
		}
		if (!player.hasSkill("maokuo_canlie")) {
			player.addSkill("maokuo_canlie");
			game.log(player, "获得了技能“残猎”");
		}
		game.log(player, "执行一个额外的回合");
	},
},
// === 浮饰 ===
// 参照奇臣传〖倚树〗：把满足条件的牌堆可见牌做成「假手牌」（glows + gaintag），
// 可以像手牌一样正常使用/打出；实际用牌时展示所有手牌，再把假牌换回牌堆里的实体牌。
// 条件：对每种花色，X=该花色手牌数（≥1），牌堆顶第 X 张可见。
maokuo_fushi: {
	audio: 2,
	group: ["maokuo_fushi_view", "maokuo_fushi_sync", "maokuo_fushi_clear"],
	init(player) {
		lib.translate.maokuo_fushi_tag = "invisible";
		if (!Array.isArray(player.storage.maokuo_fushi_cards)) {
			player.storage.maokuo_fushi_cards = [];
		}
		lib.skill.maokuo_fushi.syncFushi(player);
	},
	onremove(player) {
		lib.skill.maokuo_fushi.clearFushi(player);
		delete player.storage.maokuo_fushi_cards;
	},
	getFakes(player) {
		return player.getCards("s", card => card.hasGaintag("maokuo_fushi_tag"));
	},
	// 当前应以假手牌形式存在的实体牌（同一张牌可能被不同花色同时命中，按 cardid 去重）
	getFushiCards(player) {
		const set = qunyou_pruneVisiblePile();
		const result = [];
		for (const suit of ["spade", "heart", "club", "diamond"]) {
			const x = player.countCards("h", card => get.suit(card) == suit);
			if (x <= 0) {
				continue;
			}
			const card = ui.cardPile.childNodes[x - 1];
			if (!card || !set.has(card)) {
				continue;
			}
			if (!result.some(cardx => cardx.cardid == card.cardid)) {
				result.push(card);
			}
		}
		return result;
	},
	syncFushi(player) {
		const desired = lib.skill.maokuo_fushi.getFushiCards(player);
		const desiredIds = desired.map(card => card.cardid);
		const current = player.storage.maokuo_fushi_cards || [];
		const staleIds = current.filter(card => !desiredIds.includes(card.cardid)).map(card => card.cardid);
		if (staleIds.length) {
			game.deleteFakeCards(lib.skill.maokuo_fushi.getFakes(player).filter(card => staleIds.includes(card._cardid)));
		}
		const add = desired.filter(card => !current.some(cardx => cardx.cardid == card.cardid));
		if (add.length) {
			game.addCardKnower(add, player);
			player.directgains(game.createFakeCards(add), null, "maokuo_fushi_tag");
		}
		player.storage.maokuo_fushi_cards = desired;
	},
	clearFushi(player) {
		game.deleteFakeCards(lib.skill.maokuo_fushi.getFakes(player));
		player.storage.maokuo_fushi_cards = [];
	},
	subSkill: {
		view: {
			charlotte: true,
			forced: true,
			popup: false,
			firstDo: true,
			trigger: { player: ["useCardBefore", "respondBefore"] },
			filter(event, player) {
				const fakes = lib.skill.maokuo_fushi.getFakes(player);
				return !!event.cards?.some(card => fakes.includes(card));
			},
			async content(event, trigger, player) {
				const fakes = lib.skill.maokuo_fushi.getFakes(player);
				const storage = player.storage.maokuo_fushi_cards || [];
				const usedFakes = [];
				const usedIds = [];
				trigger.cards = trigger.cards.map(card => {
					if (!fakes.includes(card)) {
						return card;
					}
					const real = storage.find(cardx => cardx.cardid == card._cardid);
					if (!real) {
						return card;
					}
					usedFakes.push(card);
					usedIds.push(real.cardid);
					return real;
				});
				if (trigger.card?.cards) {
					trigger.card.cards = trigger.cards;
				}
				if (!usedIds.length) {
					return;
				}
				player.storage.maokuo_fushi_cards = storage.filter(card => !usedIds.includes(card.cardid));
				game.deleteFakeCards(usedFakes);
				const hand = player.getCards("h");
				if (hand.length) {
					await player.showCards(hand, get.translation(player) + "发动了【浮饰】");
				}
				await game.cardsGotoOrdering(trigger.cards.filter(card => usedIds.includes(card.cardid) && get.position(card, true) == "c"));
				lib.skill.maokuo_fushi.syncFushi(player);
			},
		},
		sync: {
			charlotte: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: {
				player: ["drawAfter", "gainAfter", "loseAfter", "loseAsyncAfter"],
				global: ["drawAfter", "gainAfter", "loseAfter", "loseAsyncAfter", "cardsGotoPileAfter", "cardsGotoOrderingAfter", "cardsDiscardAfter", "loseToDiscardpile"],
			},
			filter(event, player, name) {
				// 自己的手牌变化会改变 X；摸牌/往牌堆放牌/把牌移出牌堆会改变第 X 张是哪张。
				// loseAsync 的宿主没有 player 字段，直接放行（代价只是一次廉价重算）
				if (name == "loseAfter") {
					return event.player == player;
				}
				return true;
			},
			content(event, trigger, player) {
				lib.skill.maokuo_fushi.syncFushi(player);
			},
		},
		clear: {
			charlotte: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: { player: "dieBefore" },
			content(event, trigger, player) {
				lib.skill.maokuo_fushi.clearFushi(player);
			},
		},
	},
},
// === 会佛 ===
// 会佛：出牌阶段，你可以与一名其他角色同时展示一张手牌。若这两张牌的颜色：
//       不同，将你与其展示的牌按序扣置于你的武将牌上；
//       相同，你与其轮流获得一张"会佛"牌（从武将牌存量中打乱随机摸），直到没有"会佛"牌为止，然后你结束此回合；
//       当你于此阶段内对另一名角色发动"会佛"后，你结束此回合。
// 赤宴：觉醒技，回合结束时，若你的体力值为1/没有手牌，你弃置所有手牌/将体力值减至1，
//       获得"残猎"，然后再执行一个额外的回合。
// 残猎：锁定技，当其他角色于你的回合内获得牌后，你对其造成1点伤害，
//       然后若此次是你于此回合内首次发动此技能，你回复1点体力。
maokuo_huifo: {
	audio: 2,
	enable: "phaseUse",
	mark: true,
	marktext: "佛",
	intro: {
		name: "会佛",
		content: "expansion",
		markcount: "expansion",
	},
	filterCard() {
		return false;
	},
	selectCard: -1,
	filter(event, player) {
		return player.countCards("h") > 0 &&
			game.hasPlayer(cur => cur != player && cur.isIn() && cur.countCards("h") > 0);
	},
	async content(event, trigger, player) {
		const res = await player.chooseTarget("会佛：与一名其他角色同时展示一张手牌", (card, p, t) => t != p && t.isIn() && t.countCards("h") > 0)
			.set("ai", target => {
				// 只对敌人发动；优先沿用上一次的目标（换目标会直接结束回合，攒不了牌）
				const prev = player.getStorage("maokuo_huifo_targets") || [];
				const last = prev[prev.length - 1];
				if (last?.isIn() && last != player && last.countCards("h") > 0) {
					return target == last ? 20 : get.attitude(player, target) < 0 ? 5 : -1;
				}
				if (get.attitude(player, target) >= 0) return -1;
				return 10 + Math.min(2, target.countCards("h")) * 0.1 - target.hp * 0.2;
			})
			.forResult();
		if (!res?.bool || !res.targets?.length) {
			return;
		}
		const target = res.targets[0];
		// 双方私下各选一张，选完同时亮出（保持"同时展示"语义）
		const res1 = await player.chooseCard("h", true, `会佛：请选择你展示的一张手牌`)
			.set("ai", card => 6 - get.value(card))
			.forResult();
		if (!res1?.bool || !res1.cards?.length) {
			return;
		}
		const myCard = res1.cards[0];
		const res2 = await target.chooseCard("h", true, `会佛：请${get.translation(target)}选择展示的一张手牌`)
			// 同时展示：目标不该知道对方选了什么，按自己损失最小（低价值）来选
			.set("ai", card => 6 - get.value(card, target))
			.forResult();
		if (!res2?.bool || !res2.cards?.length) {
			return;
		}
		const tCard = res2.cards[0];
		await player.showCards([myCard, tCard], get.translation(player) + "发动了【会佛】");
		const sameColor = get.color(myCard) == get.color(tCard);
		// 「对另一名角色发动」＝本次目标与上一次不同（首次发动没有"上一次"，不算）
		const prevTargets = player.getStorage("maokuo_huifo_targets") || [];
		const isNewTarget = prevTargets.length > 0 && !prevTargets.includes(target);
		player.storage.maokuo_huifo_targets = prevTargets.concat([target]);
		let endTurn = false;
		if (sameColor) {
			// 颜色相同：你与其轮流获得一张"会佛"牌，直到没有"会佛"牌为止
			const pile = player.getExpansions("maokuo_huifo").slice().randomSort();
			let i = 0;
			for (const c of pile) {
				const gainer = i % 2 == 0 ? player : target;
				c.gaintag.remove("maokuo_huifo");
				await gainer.gain([c], "gain2");
				i++;
			}
			player.markSkill("maokuo_huifo");
			game.log(player, "与", target, "分完了所有“会佛”牌");
			// 「……然后你结束此回合」
			endTurn = true;
		} else {
			// 颜色不同：将你与其展示的牌按序扣置于你的武将牌上
			await player.addToExpansion([myCard, tCard], "giveAuto").set("gaintag", ["maokuo_huifo"]);
			player.markSkill("maokuo_huifo");
			game.log(player, "将两张牌扣置于武将牌上");
		}
		// 「当你于此阶段内对另一名角色发动"会佛"后，你结束此回合」
		if (isNewTarget) {
			endTurn = true;
		}
		if (endTurn) {
			// 结束此回合：照原生写法（jsrgdailao/oldmingjian/pszhonghu）——把本回合的 phase 事件
			// 直接跳到收尾步（num 置满 + goto(11)），并停掉出牌阶段的用牌循环。
			// ⚠ 只调 phase.finish() 不够：phaseUse 的循环会继续询问用牌，回合不会结束。
			const phaseUseEvt = event.getParent("phaseUse", true);
			if (phaseUseEvt) {
				phaseUseEvt.skipped = true;
			}
			const phaseEvt = event.getParent("phase", true);
			if (phaseEvt) {
				game.log(player, "结束了回合");
				phaseEvt.num = phaseEvt.phaseList.length;
				phaseEvt.goto(11);
			}
		}
	},
	group: ["maokuo_huifo_reset"],
	ai: {
		order: 3,
		result: {
			player: 1,
		},
	},
},
// === 会佛 ===
maokuo_huifo_reset: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "phaseUseAfter" },
	async content(event, trigger, player) {
		delete player.storage.maokuo_huifo_targets;
	},
},
// === 绝志 ===
maokuo_juezhi: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { player: ["dying", "phaseBeginStart"] },
	filter(event, player, name) {
		if (name == "dying") {
			return player.hp < 1;
		}
		// 变身段：必须先经濒死段标记，且仍在基础形态
		if (!player.storage.maokuo_juezhi_dying) {
			return false;
		}
		return player.name1 == "maokuo_jiangwei" || player.name == "maokuo_jiangwei";
	},
	async content(event, trigger, player) {
		if (event.triggername == "dying") {
			player.storage.maokuo_juezhi_dying = true;
			if (player.hp < 1) {
				await player.recover(1 - player.hp);
			}
			player.addTempSkill("maokuo_juezhi_protect", { player: "phaseBeginStart" });
		} else {
			delete player.storage.maokuo_juezhi_dying;
			await player.reinitCharacter("maokuo_jiangwei", "maokuo_nuqi_jiangwei");
		}
	},
	subSkill: {
		protect: {
			name: "绝志",
			charlotte: true,
			mark: true,
			marktext: "志",
			intro: { content: "防止你受到的所有伤害，直到你的下回合开始" },
			trigger: { player: "damageBegin1" },
			forced: true,
			popup: false,
			silent: true,
			async content(event, trigger, player) {
				trigger.cancel();
			},
		},
	},
},
// === 考度 ===
// 考度：出牌阶段限一次，你可以重铸一张牌，然后你可以弃置一张牌。若如此做，你可以获得场上的一张牌。
// 博览：准备阶段，你可以亮出牌堆顶的一张牌。此回合的结束阶段，你可以选择你区域内的至少一张牌
//       （若为手牌则展示之），若这些牌的点数之和等于亮出的牌，你摸X张牌（X为选择牌的数量）。
maokuo_kaodu: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filterCard() {
		return false;
	},
	selectCard: -1,
	filter(event, player) {
		return player.countCards("hes") > 0;
	},
	async content(event, trigger, player) {
		// 重铸/弃置都看自己的 hes 区域；只有「获得场上的一张牌」才限定 ej
		const res1 = await player.chooseCard("hes", "考度：你可以重铸一张牌")
			.set("filterCard", lib.filter.cardRecastable)
			.set("ai", card => 6 - get.value(card))
			.forResult();
		// 重铸是「可以」，不重铸也可以继续弃置
		if (res1?.bool && res1.cards?.length) {
			await player.recast(res1.cards);
		}
		const res2 = await player.chooseCard("hes", "考度：是否弃置一张牌？")
			.set("filterCard", card => lib.filter.cardDiscardable(card, player))
			.set("ai", card => 5 - get.value(card))
			.forResult();
		if (!res2?.bool || !res2.cards?.length) {
			return;
		}
		await player.discard(res2.cards);
		const res3 = await player.chooseTarget("考度：获得场上的一张牌", (card, p, t) => t.getCards("ej").length > 0)
			.set("ai", target => {
				let att = get.attitude(player, target) * -1;
				if (target.getCards("j").length) {
					att += 3; // 判定区有牌优先拆
				}
				return att;
			})
			.forResult();
		if (!res3?.bool || !res3.targets?.length) {
			return;
		}
		await player.gainPlayerCard(res3.targets[0], "ej", true)
			.set("ai", button => get.value(button.link))
			.forResult();
	},
	ai: {
		order: 5.5,
		result: {
			player: 1,
		},
	},
},
// === 髡冠 ===
maokuo_kunguan: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: {
		source: "damageBegin1",
		player: "damageBegin1",
	},
	filter(event, player) {
		// 同一伤害事件只结算一次（source/player 双角色挂同事件，自伤场景防双触发）
		if (event._maokuo_kunguan_done) {
			return false;
		}
		return lib.skill.maokuo_kunguan.getVisibleBlack(player).length > 0;
	},
	// 自己区域内的可见牌（按"公开可见"口径：装备/判定区全部 + 手牌区明置牌），取其中黑色
	getVisibleBlack(player) {
		return player.getCards("hej").filter((card) => {
			if (get.position(card) == "h" && !get.is.shownCard(card)) {
				return false;
			}
			return get.color(card) == "black";
		});
	},
	async content(event, trigger, player) {
		trigger._maokuo_kunguan_done = true;
		const cards = lib.skill.maokuo_kunguan.getVisibleBlack(player);
		// 当前回合角色选牌；不存在或已死亡则不结算
		const chooser = _status.currentPhase;
		if (!chooser || !chooser.isIn() || !cards.length) {
			return;
		}
		const result = await chooser
			.chooseButton(
				[
					`髡冠：选择${get.translation(player)}区域内的一张可见黑色牌，${player == chooser ? "你" : "其"}将之当【无中生有】使用`,
					[cards, "card"],
				],
				true
			)
			.set("ai", (button) => {
				// 消耗对拥有者的代价：敌方挑高价值牌，友方挑低价值牌
				const chooser2 = get.player();
				const val = get.value(button.link);
				return get.attitude(chooser2, player) > 0 ? 1 - val : val;
			})
			.forResult();
		if (!result?.bool || !result.links?.length) {
			return;
		}
		const chosen = result.links[0];
		// 将选中的实体牌当【无中生有】使用：材料必须显式传入（vcard 不会被 chooseUseTarget 自动展开为 cards，
		// 不传则 event.cards 为空，实体牌不进入结算、不被消耗）；无中生有无需选目标
		await player.chooseUseTarget(get.autoViewAs({ name: "wuzhong", isCard: true }, [chosen]), [chosen], true, false);
	},
},
// === 阔略 ===
// 阔略：一名角色的结束阶段，若你于此回合内未成为过黑色牌的目标，你可以明置一张手牌：
//       当你的手牌均明置时，你令你的手牌均暗置，摸一张牌。
// 著贊：当一名角色使用【杀】时，你可以将一张牌置于武将牌上。当此【杀】结算后，若此【杀】没造成过伤害，
//       你可以将至少一张"著贊"牌置入弃牌堆，其摸等量的牌。
maokuo_kuolue: {
	audio: 2,
	group: ["maokuo_kuolue_hit", "maokuo_kuolue_show"],
	subSkill: {
		hitmark: {
			charlotte: true,
			onremove: true,
		},
	},
	trigger: { global: "phaseJieshuBegin" },
	filter(event, player) {
		// 要有「未明置的手牌」可明置（已明置的牌不能再明置，按文档口径用 get.is.shownCard 排除）
		return player.isIn() && player.countCards("h", card => !get.is.shownCard(card)) > 0 && !(player.getStorage("maokuo_kuolue_hitmark") || []).length;
	},
	async cost(event, trigger, player) {
		const res = await player.chooseCard("h", "阔略：明置一张手牌")
			.set("filterCard", card => !get.is.shownCard(card))
			.set("ai", card => 6 - get.value(card))
			.forResult();
		if (!res?.bool || !res.cards?.length) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { card: res.cards[0] } };
	},
	async content(event, trigger, player) {
		// 明置：第二个参数就是牌 tag。引擎 addShownCards 内部执行 player.addGaintag(cards, tag)（content.js:453-455），
		// 牌留在手牌里不移动，牌面渲染 get.translation("visible_maokuo_kuolue") → 「阔略」（translate/maokuo.js:35）
		await player.addShownCards([event.cost_data.card], "visible_maokuo_kuolue");
		// 「手牌均明置」是持续状态条件，兑现交给 maokuo_kuolue_show 持续监听：
		// 明置变化、手牌数变化（如著贊把牌移上武将牌）都会重新判定，不能在这里做一次性判断。
	},
	ai: {
		threaten: 1.1,
	},
},
// === 阔略 ===
// 「当你的手牌均明置时」是持续状态条件：明置状态变化、手牌数变化都可能让它成立，
// 因此必须常驻监听，而不是只在阔略自己明置完那一刻判一次。
maokuo_kuolue_show: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: {
		player: ["addShownCardsAfter", "loseAfter", "gainAfter", "addToExpansionAfter"],
		global: ["loseAsyncAfter"],
	},
	filter(event, player) {
		if (!player.isIn()) {
			return false;
		}
		const num = player.countCards("h");
		return num > 0 && player.countShownCards() >= num;
	},
	async content(event, trigger, player) {
		// 暗置：这里「不传 gaintag」是刻意的，不是漏加——引擎 hideShownCards 在不传 tag 时走默认分支，
		// 会摘掉这批牌上所有 visible_ 标签（含其他技能明置的），并保留 eternal_visible_，正好对应「手牌均暗置」
		await player.hideShownCards(player.getShownCards());
		await player.draw(1);
		game.log(player, "的手牌均已明置，将手牌均暗置并摸了一张牌");
	},
},
// === 阔略 ===
maokuo_kuolue_hit: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: "useCardToTargeted" },
	filter(event, player) {
		return event.targets?.includes(player) && get.color(event.card) == "black";
	},
	async content(event, trigger, player) {
		player.addTempSkill("maokuo_kuolue_hitmark", "phaseAfter");
		player.markAuto("maokuo_kuolue_hitmark", [1]);
	},
},
// === 落墨 ===
maokuo_luomo: {
	audio: 2,
	trigger: { global: "phaseDiscardAfter" },
	direct: true,
	filter(event, player) {
		if (!player.isIn() || !event.player?.isIn()) {
			return false;
		}
		const used = player.getStorage("maokuo_luomo_used") || [];
		const cards = get.info("maokuo_luomo").getCards(event);
		return ["spade", "club"].some(
			(suit) => !used.includes(suit) && cards.some((card) => get.suit(card) == suit)
		);
	},
	getCards(event) {
		// 固政（guzheng）同款：弃牌阶段角色于此阶段内弃置、且仍在弃牌堆中的牌
		const cards = [];
		event.player.getHistory("lose", (evt) => {
			if (evt.type != "discard" || evt.getParent("phaseDiscard") != event) {
				return;
			}
			cards.addArray(evt.cards.filterInD("d"));
		});
		return cards;
	},
	async content(event, trigger, player) {
		const used = player.getStorage("maokuo_luomo_used") || [];
		const allCards = get.info("maokuo_luomo").getCards(trigger);
		const spadeCards = allCards.filter((card) => get.suit(card) == "spade");
		const clubCards = allCards.filter((card) => get.suit(card) == "club");
		const mats = (used.includes("spade") ? [] : spadeCards).concat(used.includes("club") ? [] : clubCards);
		if (!mats.length) {
			return;
		}
		// ♠对应普通锦囊、♣对应基本牌（一一对应）
		const vcards = get.inpileVCardList((info) => {
			const type = get.type(info[2]);
			const candidates = type == "trick" ? spadeCards : type == "basic" ? clubCards : [];
			return candidates.some((card) => player.hasUseTarget(get.autoViewAs({ name: info[2], nature: info[3] }, [card]), true, true));
		});
		if (!vcards.length) {
			return;
		}
		// 圆融（dcyuanrong）同款：材料牌＋虚拟牌双按钮配对选择
		const result = await player
			.chooseButton(
				[
					`###落墨：你可以将${get.translation(trigger.player)}于此阶段内弃置过的一张♠/♣牌当普通锦囊牌/基本牌使用###弃牌堆`,
					mats,
					"###可转化的牌###",
					[vcards, "vcard"],
				],
				2
			)
			.set("filterButton", (button) => {
				if (!Array.isArray(button.link)) {
					return ui.selected.buttons.length == 0;
				}
				if (ui.selected.buttons.length != 1) {
					return false;
				}
				const suit = get.suit(ui.selected.buttons[0].link);
				if (suit == "spade") {
					return get.type(button.link[2]) == "trick";
				}
				if (suit == "club") {
					return get.type(button.link[2]) == "basic";
				}
				return false;
			})
			.set("complexSelect", true)
			.set("ai", (button) => {
				// 先选材料：♠只能变锦囊、♣只能变基本牌，取该类别里可用价值最高的一种来比较
				if (ui.selected.buttons.length == 0) {
					const suit = get.suit(button.link);
					let best = 0;
					for (const info of vcards) {
						const type = get.type(info[2]);
						if (suit == "spade" ? type != "trick" : type != "basic") continue;
						best = Math.max(best, player.getUseValue(get.autoViewAs({ name: info[2], nature: info[3] }, []), true, true));
					}
					return best;
				}
				const cardx = get.autoViewAs({ name: button.link[2], nature: button.link[3] });
				return player.getUseValue(cardx, true, true);
			})
			.forResult();
		if (!result?.bool) {
			return;
		}
		const card = result.links[0];
		const suit = get.suit(card);
		if (!mats.includes(card) || (suit != "spade" && suit != "club")) {
			return;
		}
		if ((player.getStorage("maokuo_luomo_used") || []).includes(suit)) {
			return;
		}
		const vcard = get.autoViewAs({ name: result.links[1][2], nature: result.links[1][3] }, [card]);
		const next = player.chooseUseTarget(vcard, true, [card]);
		next.set("logSkill", event.name);
		await next;
		player.addTempSkill("maokuo_luomo_used", "roundStart");
		player.markAuto("maokuo_luomo_used", [suit]);
	},
	subSkill: {
		used: {
			name: "落墨",
			charlotte: true,
			onremove: true,
			mark: true,
			intro: {
				content(storage) {
					if (!storage?.length) {
						return "本轮尚未以此法使用过牌";
					}
					return "本轮已以此法使用过" + storage.map((suit) => ({ spade: "♠", club: "♣" })[suit]).join("、") + "的牌";
				},
			},
		},
	},
},
// === 逆水 ===
// 逆水：你可以视为使用一张基本牌；此牌名称你本局游戏不能再使用或打出。
//       你的牌被其他角色获得后，你摸「逆水」的发动次数张牌。
// 状态：player.storage.maokuo_nishui_ban（已禁用的基本牌名）+ player.storage.maokuo_nishui_times（发动次数）。
//       标记挂在 maokuo_nishui 上：markcount 读 times，intro.mark 读 ban 的补集＝本次还能使用的基本牌。
// ⚠ 发动技在下方 maokuo_nishui_use（印牌技写法，原生〖烈志〗pot_liezhi 同款）。
maokuo_nishui: {
	audio: 2,
	mark: true,
	marktext: "逆",
	init(player, skill) {
		// 主动挂标记：markcount / intro.mark 要有挂载点才会显示（光有 mark:true 不会自己出现）
		player.markSkill(skill);
	},
	intro: {
		name: "逆水",
		markcount(storage, player) {
			return player.storage.maokuo_nishui_times || 0;
		},
		// 标记文本＝本次还能使用的基本牌
		mark(dialog, storage, player) {
			return lib.skill.maokuo_nishui.leftText(player);
		},
		content(storage, player) {
			const times = player.storage.maokuo_nishui_times || 0;
			return `${lib.skill.maokuo_nishui.leftText(player)}<br>逆水已发动 ${times} 次；你的牌被其他角色获得后，你摸 ${times} 张牌。`;
		},
	},
	// 本局不能再使用/打出已用过的名称（使用、打出、濒死求桃三条链都要拦）
	mod: {
		cardEnabled(card, player) {
			if (lib.skill.maokuo_nishui.isBanned(card, player)) {
				return false;
			}
		},
		cardRespondable(card, player) {
			if (lib.skill.maokuo_nishui.isBanned(card, player)) {
				return false;
			}
		},
		cardSavable(card, player) {
			if (lib.skill.maokuo_nishui.isBanned(card, player)) {
				return false;
			}
		},
	},
	isBanned(card, player) {
		// 取实体牌名：vcard 本身不带牌名，要从 cards[0] 上取
		return lib.skill.maokuo_nishui.banList(player).includes(get.name(card.cards && card.cards[0] || card));
	},
	banList(player) {
		return player.getStorage("maokuo_nishui_ban") || [];
	},
	// 本次还能使用/打出的基本牌名（全部基本牌 − 已禁用的）
	leftNames(player) {
		const ban = lib.skill.maokuo_nishui.banList(player);
		return ["sha", "tao", "shan", "jiu"].filter(name => !ban.includes(name));
	},
	// 某个牌名现在还能不能作为逆水的"视为使用"对象
	canPrint(player, name) {
		return lib.skill.maokuo_nishui.leftNames(player).includes(name);
	},
	// 当前这个询问框里能印的牌面：候选 ∩ event.filterCard。
	// 引擎是唯一权威：出牌阶段放行杀/桃/酒，濒死求桃框只放行桃，
	// 【杀】的闪应答框（chooseToUse，type:"respondShan"）只放行闪，无懈框只放行无懈——
	// 所以【闪】不需要任何特判，该出现的时候引擎自己会放行。
	// docs/印牌类技能标准 §二 B1 要点③
	printList(player, event) {
		return lib.skill.maokuo_nishui.leftNames(player)
			.filter(name => event.filterCard(new lib.element.VCard({ name: name, isCard: true }), player, event))
			.map(name => [get.type2(name, false), "", name]);
	},
	// 代价：本次使用/打出的基本牌名本局不能再使用或打出 + 发动次数 +1（各子技能的 precontent 调用）
	banOnce(player, name) {
		if (!player.storage.maokuo_nishui_ban) {
			player.storage.maokuo_nishui_ban = [];
		}
		player.storage.maokuo_nishui_ban.push(name);
		player.storage.maokuo_nishui_times = (player.storage.maokuo_nishui_times || 0) + 1;
		player.updateMarks(); // 刷新「逆」标记的 markcount（发动次数）与标记文本
		game.log(player, "发动了", "#g【逆水】", "，本局不能再使用或打出", get.translation(name));
	},
	leftText(player) {
		const left = lib.skill.maokuo_nishui.leftNames(player);
		return `本次还能使用的基本牌：${left.length ? left.map(name => `【${get.translation(name)}】`).join("、") : "无"}`;
	},
	group: ["maokuo_nishui_use", "maokuo_nishui_gain"],
},
// === 逆水（发动技：印牌技） ===
// 结构同原生〖烈志〗pot_liezhi / 〖清严〗potqingyan / 〖道转〗potdaozhuan：enable 式 chooseButton + backup，
//   牌面运行时才定 → 顶层**不能**挂静态 viewAs；目标选择与次数一律交给引擎（filterTarget / addCount），
//   自己既不写 useCard 也不写 chooseUseTarget。代价放在 backup.precontent（无素材印牌可用 precontent，红线 23②）。
//
// ⚠ 只需要 enable: "chooseToUse"，**不要**加 chooseToRespond —— 描述只写「视为使用」。
//   【闪】也不需要任何特例：【杀】的闪应答框本身就是 chooseToUse 事件（type:"respondShan"，
//   card/standard.js:157-168），它的 filterCard 用 cardEnabled(card, player, "forceEnable") 绕过了
//   闪缺失的 enable 字段，所以 event.filterCard(闪) 在那个框里天然为真、在普通出牌阶段天然为假。
//   文档 §二 B1 要点③「询问时机过滤不用写，引擎按 event.filterCard 自动筛」说的就是这个。
maokuo_nishui_use: {
	audio: "maokuo_nishui",
	enable: "chooseToUse",
	filter(event, player) {
		return lib.skill.maokuo_nishui.printList(player, event).length > 0;
	},
	// 响应预检三件套之一：告诉引擎本技能还能提供哪些牌名（同〖烈志〗pot_liezhi.hiddenCard）
	hiddenCard(player, name) {
		return ["sha", "tao", "shan", "jiu"].includes(name) && lib.skill.maokuo_nishui.canPrint(player, name);
	},
	chooseButton: {
		dialog(event, player) {
			return ui.create.dialog("逆水", [lib.skill.maokuo_nishui.printList(player, event), "vcard"]);
		},
		check(button) {
			const evt = get.event().getParent();
			if (evt.type != "phase") return 1; // 濒死求桃 / 闪应答等框一律值得发动
			return get.player().getUseValue(new lib.element.VCard({ name: button.link[2], isCard: true }));
		},
		backup(links, player) {
			return {
				audio: "maokuo_nishui",
				cardname: links[0][2], // precontent 从 lib.skill.maokuo_nishui_use_backup 上取（同〖逼入〗potnizun）
				// 凭空印牌三件套（红线 21）：filterCard + selectCard:-1 + viewAs
				filterCard: () => false,
				selectCard: -1,
				viewAs: { name: links[0][2], isCard: true },
				async precontent(event, trigger, player2) {
					event.getParent().addCount = false; // 描述没写次数限制 → 不消耗出牌次数（〖烈志〗同款）
					lib.skill.maokuo_nishui.banOnce(player2, lib.skill.maokuo_nishui_use_backup.cardname);
				},
			};
		},
		prompt(links) {
			return `###逆水###<div class="text center">视为使用一张【${get.translation(links[0][2])}】，此后你本局不能再使用或打出此基本牌</div>`;
		},
	},
	ai: {
		order: 5,
		respondShan: true, // 响应预检三件套之二：AI 在闪应答框里会考虑用本技能
		skillTagFilter(player, tag) {
			return lib.skill.maokuo_nishui.canPrint(player, tag);
		},
		result: {
			player: 1,
		},
	},
},
// === 逆水（被动：牌被别人获得后摸牌） ===
maokuo_nishui_gain: {
	name: "逆水",
	charlotte: true,
	trigger: { global: "gainEnd" },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		if (player == event.player) return false; // 自己获得自己的牌不算
		if (!player.storage.maokuo_nishui_times) return false; // 一次都没发动过就没有次数可摸
		// getl(player).cards2 = 本事件中我失去的手牌/装备牌（自己获得时 cards2 为空）
		const evt = event.getl(player);
		return evt?.cards2?.length > 0;
	},
	async content(event, trigger, player) {
		await player.draw(player.storage.maokuo_nishui_times);
	},
},
// === 迁阵 ===
// 迁阵：自己的回合开始时（额定回合开始前）询问是否将本轮额定回合迁至「地势」标记处执行：
//   · 标记间隙在本轮尚未被轮序跨过（标记在座位之后）→ 推迟：跳过本次额定回合（取消 phase 事件），
//     轮序跨过间隙时（间隙侧邻的 phaseOver）与另一侧邻换座——轮序 findNext 自然落到陆抗新座位，
//     额定回合于标记处执行；
//   · 间隙已被跨过（标记在座位之前）→ 移动座位到标记处，本回合于该处执行（提前的等价形式）。
maokuo_qianzhen: {
	audio: 2,
	lastDo: true, // 天堑（同在回合开始重摆标记）先结算，迁阵再按新落点询问
	trigger: {
		player: "phaseBegin",
		global: "phaseOver",
	},
	filter(event, player) {
		if (!player.isIn()) return false;
		const gap = player.storage.maokuo_tianqian_gap;
		if (!gap || !player.storage.maokuo_tianqian_face) return false;
		if (event.name == "phaseOver") {
			// 已推迟：刚结束回合的是间隙侧邻，且轮序下一步正跨向另一侧邻（到达标记位置）
			if (player.storage.maokuo_qianzhen_pending !== true) return false;
			const pair = lib.skill.maokuo_qianzhen.gapAlivePair(gap);
			if (!pair || !pair.includes(event.player)) return false;
			return lib.skill.maokuo_qianzhen.findNext(event.player) == (pair[0] == event.player ? pair[1] : pair[0]);
		}
		// phaseBegin：标记已落位、未处于推迟待执行、未就位在间隙上
		if (player.storage.maokuo_qianzhen_pending) return false;
		const pair = lib.skill.maokuo_qianzhen.gapAlivePair(gap);
		if (!pair || pair.includes(player)) return false;
		return true;
	},
	async cost(event, trigger, player) {
		const pair = lib.skill.maokuo_qianzhen.gapAlivePair(player.storage.maokuo_tianqian_gap);
		if (event.triggername == "phaseOver") {
			// 推迟落地：与轮序前方一侧邻换座（座位移动到此位置），换座后轮序 findNext 自然落在陆抗
			const other = pair[0] == trigger.player ? pair[1] : pair[0];
			event.result = { bool: true, cost_data: { move: true, swapWith: other } };
			return;
		}
		const crossedThisRound = player.storage.maokuo_qianzhen_crossed == game.roundNumber;
		if (crossedThisRound) {
			// 间隙已被跨过（标记在座位之前）：移动座位到标记处，本回合于该处执行
			let nearer = pair[0];
			if (lib.skill.maokuo_zhidi.dist(player, pair[1]) < lib.skill.maokuo_zhidi.dist(player, pair[0])) nearer = pair[1];
			const res = await player
				.chooseBool(get.prompt("maokuo_qianzhen"), "将你的座位移动至「地势」标记处（与" + get.translation(nearer) + "交换座位），本回合于该处执行")
				.set("ai", () => true)
				.forResult();
			event.result = { bool: res?.bool === true, cost_data: { move: true, swapWith: nearer } };
			return;
		}
		// 推迟：跳过本次额定回合，待轮序跨过间隙时再执行
		const res = await player
			.chooseBool(get.prompt("maokuo_qianzhen"), "将本回合的额定回合推迟至「地势」标记所在的位置执行")
			.set("ai", () => true)
			.forResult();
		event.result = { bool: res?.bool === true, cost_data: { defer: true } };
	},
	async content(event, trigger, player) {
		if (event.cost_data.defer) {
			player.storage.maokuo_qianzhen_pending = true;
			game.log(player, "将本回合的额定回合推迟至", "#g「地势」标记", "处执行");
			trigger.cancel(); // 跳过本次额定回合（trigger = 当前的 phase 事件，取消后剩余阶段不再执行）
			return;
		}
		const other = event.cost_data.swapWith;
		if (!other?.isIn() || !player.isIn()) return;
		game.broadcastAll((t1, t2) => game.swapSeat(t1, t2), player, other);
		// 标记侧邻重绑：间隙另一侧座位现在是陆抗
		const gap = player.storage.maokuo_tianqian_gap;
		if (gap) {
			if (gap.a == other) gap.a = player;
			if (gap.b == other) gap.b = player;
		}
		const face = player.storage.maokuo_tianqian_face;
		const alivePair = lib.skill.maokuo_qianzhen.gapAlivePair(gap);
		if (alivePair) lib.skill.maokuo_tianqian.placeMarks({ a: alivePair[0], b: alivePair[1] }, face, player);
		game.log(player, "将自己的座位移动到了", "#g「地势」标记", "所在的位置");
	},
	gapAlivePair(gap) {
		return lib.skill.maokuo_zhidi.gapPair(gap);
	},
	// 照 phaseLoop 的 findNext（position 升序，找不到则回绕到首位）
	findNext(current) {
		const players = game.players.slice(0).concat(game.dead).sort((a, b) => parseInt(a.dataset.position) - parseInt(b.dataset.position));
		const position = parseInt(current.dataset.position);
		for (const p of players) {
			if (parseInt(p.dataset.position) > position) return p;
		}
		return players[0] || null;
	},
	subSkill: {
		round: {
			charlotte: true,
			sub: true,
		},
		// 轮序跨过标记间隙的时点（间隙侧邻的 phaseOver，且 findNext 指向另一侧邻）：
		// 记录「本轮已跨过」（记轮数，跨轮自动失效），供迁阵区分推迟/移动两条路径
		cross: {
			charlotte: true,
			sub: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { global: "phaseOver" },
			filter(event, player) {
				const gap = player.storage.maokuo_tianqian_gap;
				if (!gap) return false;
				const pair = lib.skill.maokuo_qianzhen.gapAlivePair(gap);
				if (!pair || !pair.includes(event.player)) return false;
				return lib.skill.maokuo_qianzhen.findNext(event.player) == (pair[0] == event.player ? pair[1] : pair[0]);
			},
			content(event, trigger, player) {
				player.storage.maokuo_qianzhen_crossed = game.roundNumber;
			},
		},
	},
	group: ["maokuo_qianzhen_cross", "maokuo_qianzhen_round"],
	},
// === 清玄 ===
// 清玄：一名角色的回合开始时，若牌堆里没有可见牌，你可以弃置一张牌，观看牌堆顶与该牌点数等量的牌，
//       选择一项：获得其中一张点数大于该牌的牌；或令这些牌可见。
// 浮饰：若牌堆顶的第X张牌可见（X为你某一种花色手牌的数量），你可以展示所有手牌，将其如手牌般使用或打出。
// “牌堆可见牌”为全局共享系统（visiblePile.js，数据在 _status.qunyou_visiblePile），
// 念嗣/清玄都可写入，浮饰读取；可见性按位置动态判定（牌被摸走/埋深/洗走自动失效）。
maokuo_qingxuan: {
	audio: 2,
	mark: true,
	marktext: "明",
	intro: {
		name: "清玄·明牌",
		content(storage, player) {
			const list = get.info("maokuo_qingxuan").getVisibleTop();
			if (!list.length) {
				return "牌堆里没有可见牌";
			}
			return "牌堆可见牌：<br>" + list.map(item => `第${item.pos}张：${get.translation(item.card)}`).join("<br>");
		},
	},
	trigger: { global: "phaseBegin" },
	filter(event, player) {
		return player.isIn() && !get.info("maokuo_qingxuan").hasAnyVisible() && player.countCards("he") > 0;
	},
	group: ["maokuo_qingxuan_reset"],
	// ---- “牌堆可见牌”系统（全局共享） ----
	getPileCards() {
		return Array.from(ui.cardPile.childNodes);
	},
	getTopCards(k) {
		return this.getPileCards().slice(0, k);
	},
	getVisibleSet() {
		return qunyou_visiblePileSet();
	},
	hasAnyVisible() {
		return qunyou_hasVisiblePile();
	},
	getVisibleTop() {
		return qunyou_getVisiblePileTop();
	},
	markVisible(cards) {
		qunyou_markPileVisible(cards);
	},
	// ---- 技能本体 ----
	async cost(event, trigger, player) {
		const res = await player.chooseCard("he", "清玄：弃置一张牌，观看牌堆顶与其点数等量的牌")
			.set("ai", card => 5 - get.value(card) - get.number(card) * 0.1)
			.forResult();
		if (!res?.bool || !res.cards?.length) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { card: res.cards[0] } };
	},
	async content(event, trigger, player) {
		const info = get.info("maokuo_qingxuan");
		const card = event.cost_data.card;
		await player.discard([card]);
		const k = Math.min(Math.max(1, get.number(card)), ui.cardPile.childNodes.length);
		if (!k) {
			return;
		}
		const top = info.getTopCards(k);
		await player.viewCards(`清玄：观看牌堆顶${k}张牌`, top);
		const gainable = top.filter(c => get.number(c) > get.number(card));
		const options = [];
		if (gainable.length) {
			options.push("获得其中一张点数大于该牌的牌");
		}
		options.push("令这些牌可见");
		const res2 = await player.chooseButton(["清玄：请选择", [options.map((item, i) => [i, item]), "textbutton"]], true)
			.set("ai", button => {
				if (options[button.link].startsWith("获得")) {
					return Math.max(...gainable.map(c => get.value(c))) - 1;
				}
				return 1; // 明牌体系喂给浮饰，默认倾向令其可见
			})
			.forResult();
		if (!res2?.bool) {
			return;
		}
		const idx = res2.links[0];
		if (options[idx].startsWith("获得")) {
			const res3 = await player.chooseButton(["清玄：获得其中一张牌", gainable], true)
				.set("ai", button => get.value(button.link))
				.forResult();
			if (res3?.bool && res3.links?.length) {
				await player.gain([res3.links[0]], "draw");
				game.log(player, "获得了牌堆中的一张牌");
			}
		} else {
			info.markVisible(top);
			player.markSkill("maokuo_qingxuan");
		}
	},
	ai: {
		threaten: 1.3,
	},
},
// === 清玄 ===
maokuo_qingxuan_reset: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: "gameStart" },
	async content(event, trigger, player) {
		lib.qunyou_clearVisiblePile();
	},
},
// === 穷守 ===
maokuo_qiongshou: {
	audio: 2,
	forced: true,
	trigger: { player: ["damageBegin3", "loseHpBegin"] },
	filter(event, player) {
		return player.hp == 1 && player.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		const res = await player.chooseCard("he", true, "穷守：弃置一张牌，防止此次体力扣减")
			.set("ai", card => 1 / (1 + get.value(card)))
			.forResult();
		await player.discard(res.cards);
		trigger.cancel();
		game.log(player, "弃置了一张牌，防止了此次体力扣减");
	},
},
// === 驱速 ===
// 驱速：一名角色的弃牌阶段结束时，若其于此阶段内弃置过【杀】、武器牌或伤害类锦囊牌，
//       你可以对其造成1点伤害，然后其获得弃牌堆里其于此阶段内弃置的这些牌，执行一个额外的出牌阶段。
maokuo_qusu: {
	audio: 2,
	trigger: { global: "phaseDiscardAfter" },
	filter(event, player) {
		return player.isIn() && event.player && event.player.isIn() &&
			get.info("maokuo_qusu").getCards(event).length > 0;
	},
	getCards(event) {
		// 固政/落墨同款：该角色于此弃牌阶段内弃置、且仍在弃牌堆中的牌
		const cards = [];
		event.player.getHistory("lose", evt => {
			if (evt.type != "discard" || evt.getParent("phaseDiscard") != event) {
				return;
			}
			cards.addArray(evt.cards.filterInD("d"));
		});
		return cards.filter(card => {
			if (get.name(card) == "sha" || get.subtype(card) == "equip1") {
				return true;
			}
			return get.type(card) == "trick" && get.tag(card, "damage");
		});
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool(`驱速：是否对${get.translation(trigger.player)}造成1点伤害，令其获得弃置的这些牌并执行一个额外的出牌阶段？`)
			.set("ai", () => get.attitude(player, trigger.player) < 0)
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		await trigger.player.damage(player, 1);
		if (!trigger.player.isIn()) {
			return; // 伤害致死则后续不结算
		}
		const cards = get.info("maokuo_qusu").getCards(trigger).filterInD("d");
		if (cards.length) {
			await trigger.player.gain(cards, "gain2");
		}
		trigger.player.insertPhase().set("phaseList", ["phaseUse"]);
		game.log(trigger.player, "执行一个额外的出牌阶段");
	},
	ai: {
		threaten: 1.3,
	},
},
// === 娆掠 ===
// 结构（docs/印牌类技能标准.md §0.3 决策树）：
//   轴① 素材 = 无 → 虚拟印三件套（backup 里 viewAs + filterCard:()=>false + selectCard:-1）
//   轴② 入口 = enable 式（玩家在技能按钮上自己选时机）
//   轴③ 牌面 = 运行时（杀/闪由玩家选）→ chooseButton + backup
//   轴④ 牌型 = 基本牌，零特例
//   轴⑤ 用途 = 使用或打出 → 两个 enable 窗口
// 范本：原生 dcdanying（character/huicui.js:18113，运行时选杀/闪）、zhenshan（character/tw.js:23438，
//       每回合限一次 + precontent 付费/取消）。展示与"视为使用"在**同一个窗口内**一次完成。
maokuo_raolue: {
	audio: 2,
	enable: ["chooseToUse", "chooseToRespond"],
	// 每回合限一次由引擎托管：filterEnable（library/index.js:10924）与
	// hasUsableCard（player.js:2995）都会查 get.skillCount，不要再自造 used 子技能
	// （docs/呈现与可视化标准.md §0.2）。
	usable: 1,
	// 开窗预检（F2）：轴③=运行时形态**必须**写 hiddenCard，否则杀/闪窗口静默不开。
	// 按牌名收窄，避免为出不了的【无懈】开窗（§6 / §7.7）。
	hiddenCard(player, name) {
		if (name != "sha" && name != "shan") return false;
		if (!player.countCards("h", (card) => get.name(card) == name)) return false;
		return game.hasPlayer((cur) => cur != player && cur.isIn() && cur.sex == "male" && cur.countCards("h", (card) => get.name(card) == name));
	},
	filter(event, player) {
		// 技能已点选后 event.filterCard 已被 backup 接管，不能再拿它判（§0.4 首行放行）
		if (event.skill == "maokuo_raolue" || event._skill == "maokuo_raolue") return true;
		// 无懈窗不是本技能覆盖的窗口
		if (event.type == "wuxie") return false;
		for (const name of ["sha", "shan"]) {
			if (!event.filterCard({ name, isCard: true }, player, event)) continue;
			if (!player.countCards("h", (card) => get.name(card) == name)) continue;
			if (game.hasPlayer((cur) => cur != player && cur.isIn() && cur.sex == "male" && cur.countCards("h", (card) => get.name(card) == name))) {
				return true;
			}
		}
		return false;
	},
	chooseButton: {
		dialog(event, player) {
			// 只列本次窗口真正能印、且自己手里有同名牌可展示的牌名
			const list = [];
			for (const name of ["sha", "shan"]) {
				if (!event.filterCard({ name, isCard: true }, player, event)) continue;
				if (!player.countCards("h", (card) => get.name(card) == name)) continue;
				list.push(["基本", "", name]);
			}
			const dialog = ui.create.dialog("娆掠", [list, "vcard"], "hidden");
			dialog.direct = true;
			return dialog;
		},
		check(button) {
			// 候选框已按窗口过滤，多数窗口只有一个牌名；出牌阶段两个都在时优先【杀】
			return button.link[2] == "sha" ? 2 : 1;
		},
		backup(links) {
			const name = links[0][2];
			return {
				filterCard: () => false,
				selectCard: -1,
				viewAs: { name, isCard: true },
				popname: true,
				async precontent(event, trigger, player) {
					// ⚠️ 中止一律用 event.result.cancel = true（= 重开窗口）；
					//    event.result.bool = false 的语义是"结束出牌阶段"（§7.0），不能用。
					// ① 展示一张同名牌；取消即放弃本次印牌（不消耗每回合次数）
					const self = await player
						.chooseCard("h", `娆掠：展示一张【${get.translation(name)}】`, (card) => get.name(card) == name)
						.set("ai", (card) => 6 - get.value(card))
						.forResult();
					if (!self?.bool || !self.cards?.length) {
						event.result.cancel = true;
						return;
					}
					player.logSkill("maokuo_raolue");
					await player.showCards(self.cards, `${get.translation(player)}发动了【娆掠】`);
					// ② 依次询问其他男性角色；第一个展示同名牌者即响应成功，视为你使用或打出
					for (const male of game.filterPlayer((cur) => cur != player && cur.isIn() && cur.sex == "male" && cur.countCards("h", (card) => get.name(card) == name))) {
						const go = await male
							.chooseBool(`娆掠：是否展示一张【${get.translation(name)}】响应${get.translation(player)}？`)
							.set("ai", () => get.attitude(male, player) > 0)
							.forResult();
						if (!go?.bool) continue;
						const res = await male
							.chooseCard("h", true, `娆掠：请展示一张【${get.translation(name)}】`, (card) => get.name(card) == name)
							.set("ai", (card) => 6 - get.value(card))
							.forResult();
						if (res?.bool && res.cards?.length) {
							await male.showCards(res.cards, `${get.translation(male)}展示了牌`);
							return;
						}
					}
					game.log("没有男性角色响应【娆掠】");
					event.result.cancel = true;
				},
			};
		},
		prompt(links) {
			return `娆掠：展示一张【${get.translation(links[0][2])}】，视为使用或打出之`;
		},
	},
	ai: {
		order() {
			const evt = _status.event;
			// 打出窗（chooseToRespond）的 event.type 是 undefined，必须认 event.name（§4）
			if (evt?.name === "chooseToRespond" || (typeof evt?.type == "string" && evt.type.startsWith("respond"))) return 9;
			return 3;
		},
		respondSha: true,
		respondShan: true,
		// 使用与打出都覆盖 ⇒ 不拒 arg（§4）；只用次数门 + "有可展示的牌且有男性可响应" 收窄
		skillTagFilter(player, tag) {
			if (get.skillCount("maokuo_raolue", player) >= 1) return false;
			const name = tag == "respondSha" ? "sha" : "shan";
			if (!player.countCards("h", (card) => get.name(card) == name)) return false;
			return game.hasPlayer((cur) => cur != player && cur.isIn() && cur.sex == "male" && cur.countCards("h", (card) => get.name(card) == name));
		},
		result: {
			player: 1,
		},
	},
},
// === 歃盟 ===
// 歃盟：每阶段限一次。包括臧洪在内的任意角色于自己的出牌阶段内需要使用【杀】时，可以声明一项：
//       弃置自己的所有手牌，或令臧洪失去1点体力。若臧洪同意，则执行此项，视为其使用【杀】；
//       此【杀】结算后，其摸X张牌（X为该目标本轮内最近连续被"歃盟"生成的【杀】攻击的次数，轮末重置）。
// 穷守：锁定技，当你扣减体力时，若你的体力为1且有牌，你弃置一张牌，防止之。
maokuo_shameng: {
	audio: 2,
	direct: true,
	mark: true,
	marktext: "盟",
	intro: {
		name: "歃盟",
		content(storage, player) {
			const st = player.storage.maokuo_shameng_streak;
			if (!st || !st.target) {
				return "尚未以此法使用过【杀】";
			}
			return `本轮内${get.translation(st.target)}已被连续指定${st.count}次`;
		},
	},
	trigger: { global: "phaseUseBegin" },
	filter(event, player) {
		return player.isIn() && event.player && event.player.isIn();
	},
	async content(event, trigger, player) {
		// 给当前回合角色（含臧洪自己）注入临时的出牌阶段按钮
		trigger.player.addTempSkill("maokuo_shameng_btn", "phaseUseAfter");
	},
	group: ["maokuo_shameng_reset"],
},
// === 歃盟 ===
maokuo_shameng_btn: {
	charlotte: true,
	enable: "phaseUse",
	filterCard() {
		return false;
	},
	selectCard: -1,
	filter(event, player) {
		if (player.hasSkill("maokuo_shameng_used")) {
			return false;
		}
		if (!game.hasPlayer(cur => cur.isIn() && cur.hasSkill("maokuo_shameng"))) {
			return false;
		}
		const vcard = get.autoViewAs({ name: "sha", isCard: true }, []);
		// 视为使用的【杀】同样受出牌阶段的次数限制（useCard 自身走 updateUsable: "phaseUse"）
		if (!lib.filter.cardUsable(vcard, player, event)) {
			return false;
		}
		return player.hasUseTarget(vcard);
	},
	prompt: "歃盟：声明一项，视为使用一张【杀】",
	async content(event, trigger, player) {
		const zang = game.findPlayer(cur => cur.isIn() && cur.hasSkill("maokuo_shameng"));
		if (!zang) {
			return;
		}
		const options = ["弃置你的所有手牌", `令${get.translation(zang)}失去1点体力`];
		const res = await player.chooseButton([
			"歃盟：请声明一项（若臧洪同意则执行并视为你使用【杀】）",
			[options.map((item, i) => [i, item]), "textbutton"],
		], true)
			.set("ai", button => {
				if (button.link == 0) {
					return player.countCards("h") >= 3 ? 0.5 : 2;
				}
				// 选项二只有在臧洪会同意时才选：敌方/残血臧洪必拒绝，改选选项一
				return get.attitude(zang, player) > 1 && zang.hp > 1 ? 1 : 0.4;
			})
			.forResult();
		if (!res?.bool) {
			return;
		}
		const choice = res.links[0];
		// 每阶段限一次：声明即消耗，被拒绝也不能在同一阶段再次发动
		//（否则 phaseUse 会反复选中本技能，臧洪每拒绝一次就多一次询问）
		player.addTempSkill("maokuo_shameng_used", "phaseUseAfter");
		const consent = await zang.chooseBool(`歃盟：是否同意${get.translation(player)}的声明（${choice == 0 ? "其弃置所有手牌" : "你失去1点体力"}）？`)
			.set("ai", () => {
				if (choice == 0) {
					return true; // 对方弃光手牌，臧洪基本不亏
				}
				return get.attitude(zang, player) > 1 && zang.hp > 1;
			})
			.forResult();
		if (!consent?.bool) {
			game.log(zang, "拒绝了声明");
			return;
		}
		if (choice == 0) {
			const cards = player.getCards("h");
			if (cards.length) {
				await player.discard(cards);
			}
		} else {
			await zang.loseHp(1);
		}
		const vcard = get.autoViewAs({ name: "sha", isCard: true }, []);
		const tres = await player.chooseTarget("歃盟：选择【杀】的目标", true, (card, p, t) => p.canUse(vcard, t))
			.set("ai", target => get.attitude(player, target) * -1)
			.forResult();
		if (!tres?.bool || !tres.targets?.length) {
			return;
		}
		const targets = tres.targets;
		await player.useCard(vcard, [], targets, "maokuo_shameng_btn");
		// 连击计数：本轮内同一目标被连续指定的次数（换目标重新从1计，轮末重置）
		const first = targets[0];
		const prev = zang.storage.maokuo_shameng_streak;
		const count = prev && prev.target == first ? prev.count + 1 : 1;
		zang.storage.maokuo_shameng_streak = { target: first, count: count };
		zang.markSkill("maokuo_shameng");
		if (player.isIn()) {
			await player.draw(count);
			game.log(player, "摸了", count, "张牌");
		}
	},
	ai: {
		order: 8.5,
		result: {
			player: 1,
		},
	},
},
// === 歃盟 ===
maokuo_shameng_reset: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: "roundStart" },
	async content(event, trigger, player) {
		delete player.storage.maokuo_shameng_streak;
	},
},
maokuo_shameng_used: {
	charlotte: true,
},
// === 示敌 ===
maokuo_shidi: {
	audio: 2,
	trigger: { player: "phaseJieshuBegin" },
	filter(event, player) {
		return player.hasCard(card => !get.is.shownCard(card), "h");
	},
	async content(event, trigger, player) {
		const result = await player
			.chooseCard("h", [1, Infinity], true, "示敌：明置至少一张手牌")
			.set("filterCard", card => !get.is.shownCard(card))
			.set("ai", card => 6 - get.value(card))
			.forResult();
		if (!result?.bool || !result.cards?.length) return;
		await player.addShownCards(result.cards, "visible_maokuo_shidi");
		const suits = new Set();
		for (const card of result.cards) {
			suits.add(get.suit(card));
		}
		const X = suits.size;
		if (X > 0) await player.draw(X);
		player.updateMark("maokuo_shidi");
	},
	group: ["maokuo_shidi_track"],
	subSkill: {
		track: {
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { player: ["gainAfter", "loseAfter", "loseAsyncAfter", "discardAfter"] },
			content(event, trigger, player) {
				player.updateMark("maokuo_shidi");
			},
		},
	},
	mark: true,
	markimage: "image/card/handcard.png",
	intro: {
		name: "示敌",
		content(storage, player) {
			const suits = new Set();
			for (const card of player.getCards("h")) {
				if (get.is.shownCard(card)) suits.add(get.suit(card));
			}
			const left = suits.size;
			return `<li>手牌上限+${left}<br><li>当前手牌上限：${player.getHandcardLimit()}`;
		},
		markcount(storage, player) {
			const suits = new Set();
			for (const card of player.getCards("h")) {
				if (get.is.shownCard(card)) suits.add(get.suit(card));
			}
			return suits.size;
		},
	},
	onremove(player) {
		const shown = player.getCards("h").filter(c => get.is.shownCard(c));
		if (shown.length) player.hideShownCards(shown, "visible_maokuo_shidi");
	},
	mod: {
		maxHandcard(player, num) {
			const suits = new Set();
			for (const card of player.getCards("h")) {
				if (get.is.shownCard(card)) {
					suits.add(get.suit(card));
				}
			}
			return num + suits.size;
		},
		cardEnabled(card, player) {
			if (!player.getShownCards().length) return;
			if (get.position(card) != "h") return;
			const isMyTurn = player.isPhaseUsing();
			const isShown = get.is.shownCard(card);
			if (isMyTurn && isShown) return false;
			if (!isMyTurn && !isShown) return false;
		},
	},
},
// === 衰荣 ===
maokuo_shuirong: {
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		return player.isIn() && player.countCards("h") < player.getHandcardLimit();
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool(`衰荣：是否将手牌补至手牌上限（当前${player.getHandcardLimit()}），然后令手牌上限-1？`)
			.set("ai", () => player.countCards("h") + 2 < player.getHandcardLimit())
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		await player.drawTo(player.getHandcardLimit());
		// 首次发动才 addSkill 挂 mark（避免开局渲染 -0 角标）
		if (!player.hasSkill("maokuo_shuirong_down")) {
			player.addSkill("maokuo_shuirong_down");
		}
		player.storage.maokuo_shuirong_down = (player.storage.maokuo_shuirong_down || 0) + 1;
		player.markSkill("maokuo_shuirong_down");
		game.log(player, "的手牌上限-1");
	},
},
// === 衰荣 ===
maokuo_shuirong_down: {
	charlotte: true,
	onremove: true,
	mark: true,
	markimage: "image/card/handcard.png",
	intro: {
		name: "衰荣",
		content(storage, player) {
			return `<li>手牌上限-${storage || 0}<br><li>当前手牌上限：${player.getHandcardLimit()}`;
		},
	},
	mod: {
		maxHandcard(player, num) {
			return num - (player.storage.maokuo_shuirong_down || 0);
		},
	},
},
// === 死门 ===
maokuo_simen: {
	audio: 2,
	locked: true,
	mod: {
		cardname(card, player) {
			const info = lib.card[card.name];
			if (get.position(card) == "h" && info && ["trick", "delay"].includes(info.type)) {
				return "juedou";
			}
		},
	},
	group: ["maokuo_simen_recover", "maokuo_simen_prevent", "maokuo_simen_noreward"],
	subSkill: {
		recover: {
			name: "死门",
			audio: "maokuo_simen",
			trigger: { source: "damage" },
			forced: true,
			filter(event, player) {
				return event.num > 0;
			},
			async content(event, trigger, player) {
				const next = player.recover(trigger.num);
				next.maokuo_simen = true;
				await next;
			},
		},
		prevent: {
			name: "死门",
			charlotte: true,
			trigger: { player: "recoverBegin" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return !event.maokuo_simen;
			},
			async content(event, trigger, player) {
				trigger.cancel();
			},
		},
		noreward: {
			name: "死门",
			charlotte: true,
			trigger: { global: ["drawBegin", "discardBegin"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const evt = event.getParent();
				return evt?.name == "die" && evt.source == player;
			},
			async content(event, trigger, player) {
				trigger.cancel();
			},
		},
	},
},
// === 思虔 ===
// 思虔：当你成为牌的目标后，你可以摸一张牌并展示之，若你的武将牌上：
//       没有此花色的牌，你须将之置于武将牌上；有此花色的牌，你于此回合内再次成为此花色牌的目标时，你不能发动"思虔"。
//       "此花色"取展示牌的花色：没有同花色 → 置牌；已有同花色 → 本回合该花色失效。
// 遂志：当你受到伤害后，你可以获得装备区里、判定区里和武将牌上的所有牌，然后翻面；
//       若你的武将牌背面朝上，防止你受到的伤害。
maokuo_siqian: {
	audio: 2,
	mark: true,
	marktext: "虔",
	// 武将牌上的牌用引擎标准 expansion mark 展示：悬浮直接给出具体牌面（get.storageintro "expansion"）
	intro: {
		name: "思虔",
		content: "expansion",
		markcount: "expansion",
	},
	trigger: { target: "useCardToTargeted" },
	filter(event, player) {
		if (!player.isIn() || !event.card) {
			return false;
		}
		const suit = get.suit(event.card);
		return !(player.getStorage("maokuo_siqian_ban") || []).some(card => get.suit(card) == suit);
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool("思虔：是否摸一张牌并展示之？")
			.set("ai", () => true)
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		const draw = await player.draw(1).forResult();
		const card = draw?.cards?.[0];
		if (!card) {
			return;
		}
		await player.showCards([card], get.translation(player) + "发动了【思虔】");
		// 以展示牌的花色为准判断武将牌上是否已有同花色
		const suit = get.suit(card);
		const same = player.getExpansions("maokuo_siqian").find(c => get.suit(c) == suit);
		if (same) {
			// 武将牌上已有此花色：本回合内再次成为此花色牌的目标时不能发动
			player.addTempSkill("maokuo_siqian_ban", "phaseEnd");
			player.markAuto("maokuo_siqian_ban", [same]);
			game.log(player, "于此回合内不能再对", `#${get.translation(suit)}`, "色牌发动【思虔】");
		} else {
			await player.addToExpansion([card], "giveAuto").set("gaintag", ["maokuo_siqian"]);
		}
	},
},
// === 思虔 ===
// 本回合失效的花色（storage 存对应的“思虔”牌）；mark 悬浮直接显示该牌牌面 + 失效说明
maokuo_siqian_ban: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "禁",
	intro: {
		name: "思虔",
		mark(dialog, storage, player) {
			const cards = storage || [];
			if (!cards.length) {
				return "本回合没有失效的花色";
			}
			const suits = [...new Set(cards.map(card => get.suit(card)))];
			dialog.addText(`本回合内成为${suits.map(suit => get.translation(suit)).join("、")}色牌的目标时，不能发动【思虔】`);
			dialog.addAuto(cards);
		},
	},
},
// === 颂酒 ===
// 颂酒：一名角色的出牌阶段开始时，你可以展示任一角色的一张手牌（死亡后改为观看一名角色的手牌并展示其中一张），
//       令该牌视为【酒】直到本轮结束，且"颂酒"失效直到本轮结束或当【酒】被使用时。
// 醉世：锁定技，你使用【酒】后，摸一张牌；你死亡后，你依然能以发动"颂酒"的形式参与游戏。
maokuo_songjiu: {
	audio: 2,
	forceDie: true,
	trigger: { global: "phaseUseBegin" },
	// ⚠️ 恢复触发器绝不能进 group：失效改用 disableSkill 实现（描述变灰，写法 A），
	//    而 disableSkill 会沿 group 级联禁用子技能（player.js:11262-11265）→ 连恢复触发器
	//    一起被禁掉、本轮永远不恢复（wending_miaoyu / xiaobai_zhuanshu 踩过同款坑）。
	//    改由 init 动态挂载，主技能移除时 onremove 级联清理。
	init(player) {
		player.addSkill("maokuo_songjiu_restore_jiu");
		player.addSkill("maokuo_songjiu_restore_round");
	},
	onremove(player) {
		player.removeSkill("maokuo_songjiu_restore_jiu");
		player.removeSkill("maokuo_songjiu_restore_round");
	},
	subSkill: {
		// 失效载体：不挂 mark（失效已由「技能描述变灰」表达，再挂 mark 属多余呈现），
		// 只承载 onremove → enableSkill 的统一恢复入口。
		jin: {
			charlotte: true,
			onremove(player) {
				player.enableSkill("maokuo_songjiu_jin");
			},
		},
	},
	filter(event, player) {
		return !player.hasSkill("maokuo_songjiu_jin") && game.hasPlayer(cur => cur.isIn() && cur.countCards("h") > 0);
	},
	async cost(event, trigger, player) {
		const dead = player.isDead();
		const prompt = dead ? "颂酒：观看一名角色的手牌并展示其中一张（该牌视为【酒】）" : "颂酒：展示一名角色的一张手牌（该牌视为【酒】）";
		const res = await player.chooseTarget(prompt, (card, p, t) => t.isIn() && t.countCards("h") > 0)
			.set("ai", target => {
				if (dead) {
					return get.attitude(player, target) > 0 ? 10 : 1; // 死后把酒送给队友
				}
				return get.attitude(player, target) < 0 ? 10 : 1; // 活着时干扰敌人的手牌预期
			})
			// 醉世：死亡后仍要能发起选择（死亡角色的子事件需显式 forceDie）
			.set("forceDie", true)
			.forResult();
		if (!res?.bool || !res.targets?.length) {
			event.result = { bool: false };
			return;
		}
		const target = res.targets[0];
		let card;
		if (dead) {
			// 醉世死亡形态：观看其手牌并自选其中一张（死亡角色需显式 forceDie）
			await player.viewCards(`颂酒：${get.translation(target)}的手牌`, target.getCards("h")).set("forceDie", true);
			const res2 = await player.chooseButton([`颂酒：展示其中一张牌（视为【酒】）`, target.getCards("h")], true)
				.set("ai", button => get.value(button.link))
				.set("forceDie", true)
				.forResult();
			if (!res2?.bool || !res2.links?.length) {
				event.result = { bool: false };
				return;
			}
			card = res2.links[0];
		} else if (target == player) {
			// 目标是自己：手牌本来就可见，自选一张展示（其余角色仍是随机摸一张，不可看）
			const res2 = await player
				.chooseCard("h", true, 1, "颂酒：选择你的一张手牌（该牌视为【酒】）")
				.set("ai", (card) => 10 - get.value(card))
				.forResult();
			if (!res2?.cards?.length) {
				event.result = { bool: false };
				return;
			}
			card = res2.cards[0];
		} else {
			card = target.getCards("h").randomGet();
		}
		event.result = { bool: true, cost_data: { target: target, card: card } };
	},
	async content(event, trigger, player) {
		const target = event.cost_data.target;
		const card = event.cost_data.card;
		await target.showCards([card], get.translation(player) + "发动了【颂酒】");
		card.addGaintag("maokuo_songjiu_tag");
		// 「该牌视为酒」跟随牌本身：给所有角色挂转化技，牌被交给谁都能当【酒】使用
		game.countPlayer((cur) => cur.addTempSkill("maokuo_songjiu_v", "roundEnd"));
		// 失效呈现：disableSkill 让「颂酒」描述变灰（引擎自动渲染，见 docs/坑-技能失效与标记显示.md）。
		// jin 子技能承载恢复（addTempSkill 到 roundEnd，过期 removeSkill → onremove 里 enableSkill）。
		player.disableSkill("maokuo_songjiu_jin", "maokuo_songjiu");
		player.addTempSkill("maokuo_songjiu_jin", "roundEnd");
		game.log("“颂酒”失效直到本轮结束或【酒】被使用");
	},
	ai: {
		threaten: 1.2,
	},
},
// === 颂酒 ===
maokuo_songjiu_restore_jiu: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	// 醉世：死后仍能发动「颂酒」→ 恢复触发器也必须能在死亡状态下结算（红线 22）
	forceDie: true,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		// 任意角色使用【酒】都恢复颂酒（用户确认口径）
		return event.card?.name == "jiu" && player.hasSkill("maokuo_songjiu_jin");
	},
	async content(event, trigger, player) {
		// 用掉的转化牌清掉标签，避免弃牌堆/后续颂酒残留
		for (const card of trigger.cards || []) {
			if (card.hasGaintag?.("maokuo_songjiu_tag")) card.removeGaintag("maokuo_songjiu_tag");
		}
		player.removeSkill("maokuo_songjiu_jin");
		game.log(player, "的“颂酒”恢复了");
	},
},
// === 颂酒 ===
maokuo_songjiu_restore_round: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	// 同上：死亡状态也要能到本轮结束恢复
	forceDie: true,
	trigger: { global: "roundEnd" },
	async content(event, trigger, player) {
		player.removeSkill("maokuo_songjiu_jin");
	},
},
// === 颂酒 ===
// 给所有角色临时挂的"强制视为"：带"颂酒"标签的手牌，牌名直接视为【酒】
// （同〖武神〗heart→杀、本扩〖争绝〗mod.cardname 的写法；不是 chooseToUse 转化，
//   牌本身就是酒，正常用牌即可，不出现"将X当酒使用"的转化按钮）
maokuo_songjiu_v: {
	charlotte: true,
	mod: {
		cardname(card) {
			if (card.hasGaintag?.("maokuo_songjiu_tag")) return "jiu";
		},
	},
	// 本轮结束技能过期时清掉所有残留的「酒」tag（牌可能已被交给别人/弃置）
	onremove() {
		const cards = [];
		game.countPlayer((cur) => cards.push(...cur.getCards("hejsx")));
		cards.push(...Array.from(ui.discardPile.childNodes));
		for (const card of cards) {
			if (card.hasGaintag?.("maokuo_songjiu_tag")) card.removeGaintag("maokuo_songjiu_tag");
		}
	},
},
// === 遂志 ===
maokuo_suizhi: {
	audio: 2,
	group: ["maokuo_suizhi_protect"],
	trigger: { player: "damage" },
	filter(event, player) {
		return player.isIn();
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool("遂志：是否获得你装备区、判定区和武将牌上的所有牌，然后翻面？")
			.set("ai", () => {
				// 翻面=下回合整回合跳过；武将牌上的“思虔”牌要攒到 3-4 张再收才不亏
				const mats = player.getExpansions("maokuo_siqian").length;
				const ej = player.getCards("ej").length;
				return mats >= 3 || (mats == 2 && ej >= 2) || (player.hp <= 1 && mats + ej >= 2);
			})
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		const cards = player.getCards("ej").concat(player.getExpansions("maokuo_siqian"));
		if (cards.length) {
			await player.gain(cards, "gain2");
			cards.forEach(c => c.gaintag.remove("maokuo_siqian"));
		}
		await player.turnOver();
	},
},
// === 遂志 ===
maokuo_suizhi_protect: {
	audio: "maokuo_suizhi",
	forced: true,
	trigger: { player: "damageBegin3" },
	filter(event, player) {
		return player.isTurnedOver();
	},
	async content(event, trigger, player) {
		trigger.cancel();
		game.log(player, "武将牌背面朝上，防止了此伤害");
	},
},
// === 天堑 ===
// ==================== 陆抗（猫咪大院·怀默）：桌面“地势”标记 + 最短路径越过判定 ====================
// “地势”标记：一枚置于两名相邻角色座位之间的桌面标记，有“山/泽”两面，可反复重摆。
// 状态存于陆抗：storage.maokuo_tianqian_gap = { a, b }（标记两侧邻座）+ storage.maokuo_tianqian_face = "shan"|"ze"；
// 落位后在两侧邻座各挂一枚对应面的可视 mark（storage.maokuo_tianqian_mark 记录另一侧邻与面）。
maokuo_tianqian: {
	audio: 2,
	init(player, skill) {
		player.storage.maokuo_tianqian_gap = null; // 持有未落位
		player.storage.maokuo_tianqian_face = null;
	},
	// ⚠️ 不能写 forced：forced 会在引擎里短路 cost（content.js:3526），而“选落点+选面”全在 cost 里；
	//    去掉 forced 后由 cost 的两个无取消项 chooseControl 保证放置强制执行
	trigger: { player: ["phaseBegin", "damage"] },
	filter(event, player) {
		return player.isIn();
	},
	// 所有相邻且存活的座位对
	aiPairs() {
		const seen = new Set();
		const pairs = [];
		for (const p of game.filterPlayer()) {
			const q = p.getNext();
			if (!q || q == p || !q.isIn()) continue;
			const key = [p.playerid, q.playerid].sort((a, b) => a - b).join("_");
			if (seen.has(key)) continue;
			seen.add(key);
			pairs.push({ a: p, b: q });
		}
		return pairs;
	},
	// 山=目标摸牌（帮目标），泽=使用者拆目标牌（帮使用者）
	aiScore(owner, pair, face) {
		const fake = { storage: { maokuo_tianqian_gap: { a: pair.a, b: pair.b } } };
		let score = 0;
		for (const user of game.filterPlayer()) {
			const weight = 1 + user.countCards("he") * 0.1;
			for (const target of game.filterPlayer()) {
				if (user == target) continue;
				if (!lib.skill.maokuo_zhidi.crossed(user, target, fake)) continue;
				if (face == "shan") {
					score += weight * get.sgn(get.attitude(owner, target));
				} else {
					score += weight * (get.sgn(get.attitude(owner, user)) - get.sgn(get.attitude(owner, target)));
				}
			}
		}
		return score;
	},
	aiBest(owner) {
		let best = null;
		for (const pair of lib.skill.maokuo_tianqian.aiPairs()) {
			for (const face of ["shan", "ze"]) {
				const score = lib.skill.maokuo_tianqian.aiScore(owner, pair, face);
				if (!best || score > best.score) best = { pair, face, score };
			}
		}
		return best;
	},
	async cost(event, trigger, player) {
		const curFace = player.storage.maokuo_tianqian_face;
		const first = !player.storage.maokuo_tianqian_gap;
		const best = lib.skill.maokuo_tianqian.aiBest(player);
		// 首次必须落位；已有标记时只有正收益才重摆，否则取消保持原间隙
		const useBest = best && (first || best.score > 0);
		// 选落点：先选一名角色，再选其相邻角色之一；第一步可取消 = 保持原间隙不变
		const anchorRes = await player
			.chooseTarget("天堑：选择一名角色（“地势”标记将置于其与相邻角色的座位之间）；取消则间隙保持不变", (card, p, t) => t.isIn())
			.set("ai", (target) => {
				if (!useBest) return 0;
				if (target == best.pair.a) return 10;
				if (target == best.pair.b) return 9;
				return -1;
			})
			.forResult();
		const anchor = anchorRes?.targets?.[0];
		let newPair = null;
		if (anchor?.isIn()) {
			const neighbors = [anchor.getNext(), anchor.getPrevious()].filter((t) => t && t.isIn());
			if (neighbors.length) {
				const nbRes = await player
					.chooseTarget(`天堑：选择${get.translation(anchor)}的相邻角色（标记置于两者座位之间）`, true, (card, p, t) => neighbors.includes(t))
					.set("ai", (target) => {
						if (!useBest) return -1;
						const other = anchor == best.pair.a ? best.pair.b : best.pair.a;
						return target == other ? 10 : -1;
					})
					.forResult();
				const neighbor = nbRes?.targets?.[0];
				if (neighbor?.isIn()) newPair = { a: anchor, b: neighbor };
			}
		}
		// 选面：已有面时可“保持现状”
		const faceOptions = (curFace ? ["保持现状"] : []).concat(["山", "泽"]);
		const faceRes = await player
			.chooseControl(faceOptions)
			.set("prompt", "天堑：以哪种形式放置“地势”标记？")
			.set("ai", () => {
				if (!useBest) return curFace ? "保持现状" : best?.face == "ze" ? "泽" : "山";
				return best.face == "shan" ? "山" : "泽";
			})
			.forResult();
		let face = curFace;
		if (faceRes?.control == "山") face = "shan";
		else if (faceRes?.control == "泽") face = "ze";
		if (!newPair && face == curFace) return void (event.result = { bool: false }); // 位置与形态都保持 → 无事发生
		const gap = newPair || player.storage.maokuo_tianqian_gap;
		if (!gap) return void (event.result = { bool: false }); // 首次落位却取消了选点
		event.result = { bool: true, cost_data: { pair: gap, face } };
	},
	async content(event, trigger, player) {
		lib.skill.maokuo_tianqian.placeMarks(event.cost_data.pair, event.cost_data.face, player);
	},
	placeMarks(pair, face, owner) {
		// 清除旧落位的可视标记（⚠️ markSkill 只创建 marks 节点、不进 player.skills → 判据用 p.marks 而非 hasSkill）
		for (const p of game.players) {
			if (p.marks.maokuo_tianqian_shan || p.marks.maokuo_tianqian_ze) {
				p.unmarkSkill("maokuo_tianqian_shan");
				p.unmarkSkill("maokuo_tianqian_ze");
				delete p.storage.maokuo_tianqian_mark;
			}
		}
		owner.storage.maokuo_tianqian_gap = { a: pair.a, b: pair.b };
		owner.storage.maokuo_tianqian_face = face;
		const markId = face == "shan" ? "maokuo_tianqian_shan" : "maokuo_tianqian_ze";
		for (const f of [pair.a, pair.b]) {
			f.markSkill(markId);
			f.storage.maokuo_tianqian_mark = { face, other: f == pair.a ? pair.b : pair.a };
		}
		game.log(owner, "将", "#g“地势”标记", "以", "#g" + (face == "shan" ? "山" : "泽"), "的形式置于", pair.a, "与", pair.b, "的座位之间");
	},
	subSkill: {
		shan: {
			charlotte: true,
			mark: true,
			marktext: "山",
			intro: {
				content(storage, player) {
					const g = storage || {};
					return `地势标记（山）：位于${get.translation(player)}与${get.translation(g.other)}的座位之间。`;
				},
			},
		},
		ze: {
			charlotte: true,
			mark: true,
			marktext: "泽",
			intro: {
				content(storage, player) {
					const g = storage || {};
					return `地势标记（泽）：位于${get.translation(player)}与${get.translation(g.other)}的座位之间。`;
				},
			},
		},
	},
},
// === 婺辞 ===
// 婺辞：其他角色的弃牌阶段开始时，若其手牌数大于手牌上限，你可以获得其一张手牌并展示之。
//       若此牌为基本牌或普通锦囊牌，你视为使用之并将此牌的使用目标改为其。
maokuo_wuci: {
	audio: 2,
	trigger: { global: "phaseDiscardBefore" },
	filter(event, player) {
		return player.isIn() && event.player && event.player != player && event.player.isIn() &&
			event.player.countCards("h") > event.player.getHandcardLimit();
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool(`婺辞：是否获得${get.translation(trigger.player)}的一张手牌？`)
			.set("ai", () => get.attitude(player, trigger.player) < 0)
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const card = target.getCards("h").randomGet();
		if (!card) {
			return;
		}
		await target.give([card], player);
		await player.showCards([card], get.translation(player) + "发动了【婺辞】");
		const type = get.type(card);
		const info = get.info(card);
		const usableType = type == "basic" || (type == "trick" && get.type(card, "trick") != "delay");
		// 描述是「视为使用之并将此牌的使用目标改为其」：强制把目标改成该角色。
		// 因此多目标牌（南蛮/万箭）只对其结算，自身目标牌（酒/无中/桃）也改为对其使用。
		// 只有闪/无懈这类 notarget、本来就不能主动使用的牌才直接保留。
		if (usableType && !info.notarget) {
			await player.useCard(card, [card], [target], "maokuo_wuci");
		} else {
			game.log(player, "获得的", card, "无法主动使用，只获得而不使用");
		}
	},
	ai: {
		threaten: 1.3,
	},
},
// === 相携 ===
maokuo_xiangxie: {
	audio: 2,
	mark: true,
	marktext: "携",
	intro: { content: "expansion", markcount: "expansion" },
	group: ["maokuo_xiangxie_shan", "maokuo_xiangxie_tao", "maokuo_xiangxie_wuxie", "maokuo_xiangxie_get"],
	// 回合外判定：当前回合角色不是自己
	isWai(player) {
		return _status.currentPhase != player;
	},
	// he 区域内存在至少 num 张同花色的牌
	hasSameSuit(player, num) {
		const suits = {};
		for (const card of player.getCards("he")) {
			suits[get.suit(card)] = (suits[get.suit(card)] || 0) + 1;
			if (suits[get.suit(card)] >= num) {
				return true;
			}
		}
		return false;
	},
	getXiangxieCards(player) {
		return player.getCards("x").filter((card) => card.hasGaintag("maokuo_xiangxie"));
	},
},
// === 相携 ===
maokuo_xiangxie_get: {
	audio: "maokuo_xiangxie",
	name: "相携",
	trigger: { player: "phaseZhunbeiBegin" },
	forced: true,
	filter(event, player) {
		return lib.skill.maokuo_xiangxie.getXiangxieCards(player).length > 0;
	},
	async content(event, trigger, player) {
		const cards = lib.skill.maokuo_xiangxie.getXiangxieCards(player);
		if (!cards.length) {
			return;
		}
		const result = await player
			.chooseTarget(true, `相携：令一名角色获得${get.cnNumber(cards.length)}张“相携”牌`, () => true)
			.set("ai", (target) => {
				const owner = get.player();
				const value = cards.reduce((sum, card) => sum + get.value(card), 0) / cards.length;
				return get.attitude(owner, target) * value;
			})
			.forResult();
		if (!result?.bool || !result.targets?.length) {
			return;
		}
		const target = result.targets[0];
		await target.gain(cards, player, "give");
		for (const card of cards) {
			card.removeGaintag("maokuo_xiangxie");
		}
            game.log(target, "获得了", cards);
		},
	},
// === 相携 ===
maokuo_xiangxie_shan: {
	audio: "maokuo_xiangxie",
	name: "相携",
	enable: "chooseToUse",
	position: "he",
	filter(event, player) {
		// 仅【闪】响应窗口（本引擎闪响应=使用闪，standard.js:161）+ 回合外
		if (event.type != "respondShan") {
			return false;
		}
		if (!lib.skill.maokuo_xiangxie.isWai(player)) {
			return false;
		}
		if (!player.countCards("he")) {
			return false;
		}
		// 防自递归：本技能自身选择流程事件里 filterCard 已被包装，不能再调
		if (event.skill == "maokuo_xiangxie_shan" || event._skill == "maokuo_xiangxie_shan") {
			return true;
		}
		return event.filterCard(get.autoViewAs({ name: "shan", isCard: true }, "unsure"), player, event);
	},
	filterCard() {
		// 1 张：he 区域任意一张牌
		return true;
	},
	selectCard: 1,
	viewAs(cards) {
		const card = cards && cards[0];
		if (!card) {
			return { name: "shan", isCard: true };
		}
		return { name: "shan", suit: get.suit(card), number: get.number(card), isCard: true };
	},
	async precontent(event, trigger, player) {
		// 置于武将牌上（逾围同款）：闪为基本牌，以无实体虚拟牌结算，实体牌留在武将牌上
		const cards = event.result?.cards || [];
		if (!cards.length) {
			return;
		}
		const card = cards[0];
		// 官方惯例（笔伐/极蕴同款）：gaintag 挂在 addToExpansion 事件上，事件执行时贴标签并 markSkill 刷新标记
		await player.addToExpansion(cards).set("gaintag", ["maokuo_xiangxie"]);
		event.result.card = get.autoViewAs({ name: "shan", suit: get.suit(card), number: get.number(card), isCard: true });
		event.result.cards = [];
	},
	check() {
		return 1;
	},
	prompt: "相携：将一张牌置于武将牌上，视为使用一张【闪】",
	// 喂杀结算 hasShan 预检（引擎只读技能顶层 hiddenCard，不能放进 ai）
	hiddenCard(player, name) {
		if (name != "shan") {
			return false;
		}
		return player.countCards("he") > 0 && lib.skill.maokuo_xiangxie.isWai(player);
	},
	ai: {
		order: 4,
		respondShan: true,
		skillTagFilter(player, tag, arg) {
			if (tag != "respondShan") {
				return false;
			}
			if (arg === "respond") {
				return false; // 仅使用不可打出（卫境同款）
			}
			return player.countCards("he") > 0 && lib.skill.maokuo_xiangxie.isWai(player);
		},
	},
},
// === 相携 ===
maokuo_xiangxie_tao: {
	audio: "maokuo_xiangxie",
	name: "相携",
	enable: "chooseToUse",
	position: "he",
	filter(event, player) {
		// 仅濒死求桃窗口 + 回合外
		if (event.type != "dying") {
			return false;
		}
		if (!lib.skill.maokuo_xiangxie.isWai(player)) {
			return false;
		}
		if (!lib.skill.maokuo_xiangxie.hasSameSuit(player, 2)) {
			return false;
		}
		if (event.skill == "maokuo_xiangxie_tao" || event._skill == "maokuo_xiangxie_tao") {
			return true;
		}
		return event.filterCard(get.autoViewAs({ name: "tao", isCard: true }, "unsure"), player, event);
	},
	filterCard(card) {
		// 两张同花色：第一张定花色
		if (ui.selected.cards.length) {
			return get.suit(card) == get.suit(ui.selected.cards[0]);
		}
		return true;
	},
	selectCard: 2,
	viewAs(cards) {
		const card = cards && cards[0];
		if (!card) {
			return { name: "tao", isCard: true };
		}
		return { name: "tao", suit: get.suit(card), number: get.number(card), isCard: true };
	},
	async precontent(event, trigger, player) {
		const cards = event.result?.cards || [];
		if (!cards.length) {
			return;
		}
		const card = cards[0];
		// 官方惯例（笔伐/极蕴同款）：gaintag 挂在 addToExpansion 事件上，事件执行时贴标签并 markSkill 刷新标记
		await player.addToExpansion(cards).set("gaintag", ["maokuo_xiangxie"]);
		event.result.card = get.autoViewAs({ name: "tao", suit: get.suit(card), number: get.number(card), isCard: true });
		event.result.cards = [];
	},
	check() {
		return 1;
	},
	prompt: "相携：将两张同花色的牌置于武将牌上，视为使用一张【桃】",
	// 喂濒死求桃预检（引擎只读技能顶层 hiddenCard）
	hiddenCard(player, name) {
		if (name != "tao") {
			return false;
		}
		return lib.skill.maokuo_xiangxie.hasSameSuit(player, 2) && lib.skill.maokuo_xiangxie.isWai(player);
	},
	ai: {
		order: 4,
		save: true,
		skillTagFilter(player, tag, arg) {
			if (tag != "save") {
				return false;
			}
			return lib.skill.maokuo_xiangxie.hasSameSuit(player, 2) && lib.skill.maokuo_xiangxie.isWai(player);
		},
	},
},
// === 相携 ===
maokuo_xiangxie_wuxie: {
	audio: "maokuo_xiangxie",
	name: "相携",
	enable: "chooseToUse",
	position: "he",
	filter(event, player) {
		// 仅无懈窗口 + 回合外
		if (event.type != "wuxie") {
			return false;
		}
		if (!lib.skill.maokuo_xiangxie.isWai(player)) {
			return false;
		}
		if (!lib.skill.maokuo_xiangxie.hasSameSuit(player, 3)) {
			return false;
		}
		if (event.skill == "maokuo_xiangxie_wuxie" || event._skill == "maokuo_xiangxie_wuxie") {
			return true;
		}
		return event.filterCard(get.autoViewAs({ name: "wuxie", isCard: true }, "unsure"), player, event);
	},
	filterCard(card) {
		// 三张同花色：第一张定花色
		if (ui.selected.cards.length) {
			return get.suit(card) == get.suit(ui.selected.cards[0]);
		}
		return true;
	},
	selectCard: 3,
	viewAs(cards) {
		const card = cards && cards[0];
		if (!card) {
			return { name: "wuxie", isCard: true };
		}
		return { name: "wuxie", suit: get.suit(card), number: get.number(card), isCard: true };
	},
	async precontent(event, trigger, player) {
		const cards = event.result?.cards || [];
		if (!cards.length) {
			return;
		}
		const card = cards[0];
		// 官方惯例（笔伐/极蕴同款）：gaintag 挂在 addToExpansion 事件上，事件执行时贴标签并 markSkill 刷新标记
		await player.addToExpansion(cards).set("gaintag", ["maokuo_xiangxie"]);
		event.result.card = get.autoViewAs({ name: "wuxie", suit: get.suit(card), number: get.number(card), isCard: true });
		event.result.cards = [];
	},
	check() {
		return 1;
	},
	prompt: "相携：将三张同花色的牌置于武将牌上，视为使用一张【无懈可击】",
	// 喂 hasWuxie 预检（引擎只读技能顶层 hiddenCard）
	hiddenCard(player, name) {
		if (name != "wuxie") {
			return false;
		}
		return lib.skill.maokuo_xiangxie.hasSameSuit(player, 3) && lib.skill.maokuo_xiangxie.isWai(player);
	},
	ai: {
		order: 4,
	},
},
// === 肖形 ===
maokuo_xiaoxing: {
	audio: 2,
	trigger: { player: ["phaseBegin", "phaseEnd"] },
	filter(event, player, name) {
		// 回合开始对应♥、回合结束对应♦（一一对应）
		const suit = name == "phaseBegin" ? "heart" : "diamond";
		if (!player.countCards("h", (card) => get.suit(card) == suit)) {
			return false;
		}
		return game.players.some((current) => current.countCards("e") > 0);
	},
	check(event, player) {
		return true;
	},
	async content(event, trigger, player) {
		const isBegin = event.triggername == "phaseBegin";
		const result = await player
			.chooseCard("h", true, `肖形：重铸一张${isBegin ? "♥" : "♦"}手牌`, (card) => get.suit(card) == (isBegin ? "heart" : "diamond"))
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!result?.bool) {
			return;
		}
		await player.recast(result.cards);
		if (!player.isIn()) {
			return;
		}
		const owners = game.players.filter((current) => current.countCards("e") > 0);
		if (!owners.length) {
			return;
		}
		/** @type {any[]} */
	const chooseList = ["肖形：视为装备场上的一张装备牌"];
		owners.forEach((current) => {
			chooseList.push(get.translation(current));
			chooseList.push([current.getCards("e"), "card"]);
		});
		const result2 = await player
			.chooseButton(chooseList, true)
			.set("ai", (button) => get.equipValue(button.link, player))
			.forResult();
		if (!result2?.bool || !result2.links?.length) {
			return;
		}
		const name = get.name(result2.links[0]);
		const skill = "maokuo_xiaoxing_equip";
		const prev = player.getStorage(skill);
		if (prev?.length) {
			player.unmarkAuto(skill, prev);
		}
		// 回合开始发动→你此回合结束时失效；回合结束发动→你下回合开始时失效
		player.addTempSkill(skill, isBegin ? { player: "phaseEnd" } : { player: "phaseBegin" });
		player.markAuto(skill, [name]);
		player.addAdditionalSkill(skill, (lib.card[name]?.skills || []).slice());
		player.addExtraEquip(skill, [name], true);
	},
	subSkill: {
		equip: {
			name: "肖形",
			charlotte: true,
			// 改攻击范围必须挂 attackRange.png（R18）；mark: true 是引擎的「自动挂标记」开关（player.js:10954），
			// 图标由 markimage 决定，marktext 只在没有 markimage 时才兜底成字符（player.js:10358-10371）。
			mark: true,
			markimage: "image/card/attackRange.png",
			intro: {
				name: "肖形",
				content(storage, player) {
					const equip = storage?.length ? "视为装备着【" + storage.map((name) => get.translation(name)).join("】【") + "】" : "未视为装备任何牌";
					return `<li>${equip}<br><li>当前攻击范围：${player.getAttackRange(false)}`;
				},
			},
			// 煌烛（twhuangzhu）同款：视为装备的距离修正
			mod: {
				globalFrom(from, to, distance) {
					return distance + (lib.card[from.getStorage("maokuo_xiaoxing_equip")?.[0]]?.distance?.globalFrom || 0);
				},
				globalTo(from, to, distance) {
					return distance + (lib.card[to.getStorage("maokuo_xiaoxing_equip")?.[0]]?.distance?.globalTo || 0);
				},
				attackRange(from, distance) {
					return distance - (lib.card[from.getStorage("maokuo_xiaoxing_equip")?.[0]]?.distance?.attackFrom || 0);
				},
				attackTo(from, to, distance) {
					return distance + (lib.card[to.getStorage("maokuo_xiaoxing_equip")?.[0]]?.distance?.attackTo || 0);
				},
			},
			onremove(player, skill) {
				player.removeExtraEquip(skill);
				player.removeAdditionalSkill(skill);
				delete player.storage[skill];
			},
		},
	},
},
// === 心往 ===
maokuo_xinwang: {
	audio: 2,
	trigger: { player: "phaseJieshuBegin" },
	direct: true,
	async content(event, trigger, player) {
		const bool = await player
			.chooseBool("心往：是否将你的手牌数调整为两张？")
			.set("ai", () => {
				const owner = get.player();
				const hs = owner.getCards("h");
				if (!hs.length) {
					return false;
				}
				if (hs.length == 2) {
					// 已是两张：全红桃才有后续
					return hs.every((card) => get.suit(card) == "heart");
				}
				return true;
			})
			.forResult();
		if (!bool?.bool) {
			return;
		}
		// 将手牌数调整为两张：多弃少补
		const num = player.countCards("h");
		if (num > 2) {
			await player
				.chooseToDiscard(num - 2, "h", true)
				.set("prompt", `心往：弃置${get.cnNumber(num - 2)}张手牌（保留红桃有利于触发后续）`)
				.set("ai", (card) => (get.suit(card) == "heart" ? -5 : 0) + 6 - get.value(card));
		} else if (num < 2) {
			await player.draw(2 - num);
		}
		// 手牌均为红桃才必然进入循环；循环内不再检查，直到亮出红桃或牌堆空
		if (!player.countCards("h") || !player.getCards("h").every((card) => get.suit(card) == "heart")) {
			return;
		}
		while (player.countCards("h")) {
			await player.showHandcards();
			if (!ui.cardPile || !ui.cardPile.childNodes.length) {
				break;
			}
			const card = get.cards()[0];
			if (!card) {
				break;
			}
			// 亮出牌堆顶的一张牌并获得之（米券 peiquan 同款：进处理区+展示+获得）
			game.cardsGotoOrdering(card);
			player.showCards(card);
			await player.gain(card);
			if (get.suit(card) == "heart") {
				break;
			}
		}
	},
},
// === 信意 ===
maokuo_xinyi: {
	audio: 2,
	group: ["maokuo_xinyi_skip", "maokuo_xinyi_source"],
	subSkill: {
		skip: {
			audio: "maokuo_xinyi",
			name: "信意",
			// silent：与髡冠同时机命中时不弹"选择下一个触发的技能"，且引擎自动先执行 silent 技能（信意先于髡冠）
			silent: true,
			trigger: { global: "phaseDiscardBefore" },
			direct: true,
			filter(event, player) {
				const target = event.player;
				if (!target || !target.isIn()) {
					return false;
				}
				const num = target.countCards("h") - target.getHandcardLimit();
				if (num <= 0) {
					return false;
				}
				// 你的暗置手牌不够 X 张时不能发动
				return player.countCards("h") - player.countShownCards() >= num;
			},
			async content(event, trigger, player) {
				const target = trigger.player;
				const num = target.countCards("h") - target.getHandcardLimit();
				const hidden = player.getCards("h").filter((card) => !get.is.shownCard(card));
				if (num <= 0 || hidden.length < num) {
					return;
				}
				const bool = await player
					.chooseBool(`信意：是否明置${get.cnNumber(num)}张暗置手牌（你共有${get.cnNumber(hidden.length)}张），令${target == player ? "你" : get.translation(target)}跳过弃牌阶段？`)
					.set("ai", () => {
						const owner = get.player();
						return target == owner || get.attitude(owner, target) > 0;
					})
					.forResult();
				if (!bool?.bool) {
					return;
				}
				const result = await player
					.chooseCard(num, true)
					.set("prompt", `信意：选择${get.cnNumber(num)}张暗置手牌明置`)
					.set("filterCard", (card) => !get.is.shownCard(card))
					.set("ai", (card) => {
						// 明置不消耗牌，代价是信息公开：优先明置价值低的
						return num - get.value(card);
					})
					.forResult();
				if (!result?.bool || !result.cards?.length) {
					return;
				}
				// 因信意明置的牌打上信意的 tag
				await player.addShownCards(result.cards, "visible_maokuo_xinyi");
				// 弃牌阶段开始前跳过当前阶段：skip() 在事件启动时已判定完毕、对本阶段无效，
				// 必须取消阶段事件本身（神速 jojiro_shensu 同款写法）
				trigger.cancel();
				game.log(target, "跳过了弃牌阶段");
			},
		},
		source: {
			audio: "maokuo_xinyi",
			name: "信意",
			// silent：拥有者受伤害时由伤害来源（而非拥有者）应答，且先于髡冠执行
			silent: true,
			trigger: { global: "damageBegin1" },
			direct: true,
			filter(event, player) {
				const source = event.source;
				return source && source != player && source.isIn() && player.isIn();
			},
			async content(event, trigger, player) {
				const source = trigger.source;
				const bool = await source
					.chooseBool(`信意：是否令${get.translation(player)}成为此次伤害的来源？`)
					.set("ai", () => {
						const chooser = get.player();
						return get.attitude(chooser, player) > 0;
					})
					.forResult();
				if (!bool?.bool) {
					return;
				}
				game.log(source, "令", player, "成为了此次伤害的来源");
				trigger.source = player;
			},
		},
	},
},
// === 血溅 ===
maokuo_xuejian: {
	audio: 2,
	enable: "phaseUse",
	limited: true,
	skillAnimation: true,
	animationColor: "fire",
	mark: true,
	marktext: "溅",
	intro: { content: "限定技，出牌阶段，若你未受伤，你可以杀死一名角色" },
	filter(event, player) {
		return !player.isDamaged();
	},
	filterTarget(card, player, target) {
		return target != player && target.isIn();
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		player.awakenSkill(event.name);
		await event.target.die({ source: player });
	},
	ai: {
		order: 12,
		result: {
			target(player, target) {
				return get.attitude(player, target) < 0 ? 15 : -999;
			},
		},
	},
},
// === 血征 ===
maokuo_xuezheng: {
	audio: 2,
	trigger: { player: "phaseUseBegin" },
	filter(event, player) {
		return game.hasPlayer((current) => current.countCards("h") > 0);
	},
	check(event, player) {
		// 只给自己或手牌很多的队友用；场上只有敌人有牌时放弃发动
		if (player.countCards("h") >= 2) return true;
		return game.hasPlayer((cur) => cur != player && cur.isIn() && get.attitude(player, cur) > 0 && cur.countCards("h") >= 3);
	},
	async content(event, trigger, player) {
		const result = await player
			.chooseTarget(true, "血征：令一名角色展示所有手牌，该角色须依次使用其中可使用的牌", (card, player2, target) => {
				return target.countCards("h") > 0;
			})
			.set("ai", (target) => {
				const current = get.player();
				if (target == current) return 6 + Math.min(6, target.countCards("h") * 0.5);
				// 完全不对敌使用；队友手牌越多越值得
				if (get.attitude(current, target) <= 0) return -999;
				return 1 + target.countCards("h");
			})
			.forResult();
		if (!result?.bool || !result.targets?.length) {
			return;
		}
		const target = result.targets[0];
		player.line(target);
		await target.showHandcards();
		if (!target.isIn()) {
			return;
		}
		if (target == player) {
			// 先重铸其中所有不能使用的牌
			const unusable = player.getCards("h", (card) => !lib.filter.cardEnabled(card, player, trigger));
			if (unusable.length) {
				await player.recast(unusable);
			}
			player.addTempSkill("maokuo_xuezheng_unlimited", "phaseAfter");
			if (!player.isIn()) {
				return;
			}
		}
		// 依次使用其中可使用的牌（循环写法对标掠城 dclvecheng：每轮先确认仍有可用牌。
		// 注意：绝不能对 forced 的 chooseToUse 发起空选择——引擎 AI 路径会空确认，
		// 产生 card=undefined 的 useCard 并在 get.info(next.card).noai 处抛错，事件成孤儿后报
		// "this.content is not a function"）
		let shown = target.getCards("h");
		while (target.isIn()) {
			shown = target.getCards("h").filter((card) => shown.includes(card));
			if (!shown.some((card) => lib.filter.filterCard(card, target, trigger))) {
				break;
			}
			const result2 = await target
				.chooseToUse(true, function (card, player2) {
					if (get.itemtype(card) != "card" || !shown.includes(card)) {
						return false;
					}
					return lib.filter.filterCard.apply(this, arguments);
				}, "血征：须依次使用其中可使用的牌")
				.forResult();
			if (!result2?.bool || !result2.card) {
				break;
			}
		}
	},
	subSkill: {
		unlimited: {
			name: "血征",
			charlotte: true,
			mark: true,
			marktext: "征",
			intro: { content: "本回合你使用牌无距离和次数限制" },
			mod: {
				cardUsable(card, player, num) {
					return Infinity;
				},
				targetInRange(card, player, target) {
					return true;
				},
			},
		},
	},
},
// === 寻夷 ===
// 寻夷：回合开始时，你可以令你的手牌上限和攻击范围+1，然后若你的攻击范围不小于存活角色数，你失去"寻夷"。
// 衰荣：准备阶段，你可以将手牌补至手牌上限，然后令你的手牌上限-1。
maokuo_xunyi: {
	audio: 2,
	// 失去寻夷时连 mark 子技能一起清（removeSkill→unmarkSkill）
	onremove(player) {
		player.removeSkill("maokuo_xunyi_up");
		player.removeSkill("maokuo_xunyi_range");
	},
	trigger: { player: "phaseBegin" },
	filter(event, player) {
		return player.isIn();
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool("寻夷：是否令你的手牌上限和攻击范围+1？")
			.set("ai", () => true)
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		// 首次发动才 addSkill 挂 mark（不放 group，避免开局就渲染 +0 角标）
		if (!player.hasSkill("maokuo_xunyi_up")) {
			player.addSkill("maokuo_xunyi_up");
		}
		if (!player.hasSkill("maokuo_xunyi_range")) {
			player.addSkill("maokuo_xunyi_range");
		}
		player.storage.maokuo_xunyi_up = (player.storage.maokuo_xunyi_up || 0) + 1;
		player.markSkill("maokuo_xunyi_up");
		player.markSkill("maokuo_xunyi_range");
		game.log(player, "的手牌上限和攻击范围+1");
		if (player.getAttackRange() >= game.players.filter(p => p.isIn()).length) {
			game.log(player, "的攻击范围不小于存活角色数，失去了“寻夷”");
			player.removeSkill("maokuo_xunyi");
		}
	},
},
// === 寻夷 ===
maokuo_xunyi_up: {
	charlotte: true,
	onremove: true,
	mark: true,
	markimage: "image/card/handcard.png",
	intro: {
		name: "寻夷",
		content(storage, player) {
			return `<li>手牌上限+${storage || 0}<br><li>当前手牌上限：${player.getHandcardLimit()}`;
		},
	},
	mod: {
		maxHandcard(player, num) {
			return num + (player.storage.maokuo_xunyi_up || 0);
		},
	},
},
// 寻夷的攻击范围部分单独一个 mark：一个技能只能挂一个图标，
// 手牌上限用 handcard.png、攻击范围用 attackRange.png（R18），拆成两个 mark 才能都显示。
maokuo_xunyi_range: {
	charlotte: true,
	onremove: true,
	mark: true,
	markimage: "image/card/attackRange.png",
	intro: {
		name: "寻夷",
		content(storage, player) {
			return `<li>攻击范围+${player.storage.maokuo_xunyi_up || 0}<br><li>当前攻击范围：${player.getAttackRange(false)}`;
		},
	},
	mod: {
		attackRange(player, num) {
			return num + (player.storage.maokuo_xunyi_up || 0);
		},
	},
},
// === 预谋 ===
// 预谋：其他角色的出牌阶段开始时，你可以展示两张不同颜色的手牌，然后其选择一项：
//       1.获得黑色牌，其摸一张牌；2.获得红色牌，你摸一张牌。
// 逆水：你可以视为使用一张基本牌，然后你本局游戏不能再使用或打出此基本牌；
//       你的牌被其他角色获得后，你摸此技能的发动次数张牌。（实现见文件前面的 逆水 段）
maokuo_yumou: {
	audio: 2,
	trigger: { global: "phaseUseBegin" },
	filter(event, player) {
		return player.isIn() && event.player && event.player != player && event.player.isIn() &&
			player.countCards("h", c => get.color(c) == "black") > 0 &&
			player.countCards("h", c => get.color(c) == "red") > 0;
	},
	async cost(event, trigger, player) {
		const res = await player.chooseCard("h", 2, "预谋：展示两张不同颜色的手牌", card => {
			if (ui.selected.cards.length) {
				return get.color(card) != get.color(ui.selected.cards[0]);
			}
			return true;
		})
			// 过滤依赖已选牌，必须关缓存，否则同色牌永远可选
			.set("complexCard", true)
			// 展示出去的牌会被对方拿走，所以挑自己最不值钱的（带 player 上下文：自己缺桃时【桃】就不该展示）
			.set("ai", card => 6 - get.value(card, player))
			.forResult();
		if (!res?.bool || !res.cards?.length) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { cards: res.cards } };
	},
	async content(event, trigger, player) {
		const cards = event.cost_data.cards;
		await player.showCards(cards, get.translation(player) + "发动了【预谋】");
		const black = cards.find(c => get.color(c) == "black");
		const red = cards.find(c => get.color(c) == "red");
		const options = [
			`获得黑色牌（${get.translation(black)}），然后你摸一张牌`,
			`获得红色牌（${get.translation(red)}），然后${get.translation(player)}摸一张牌`,
		];
		// 选择的一方（trigger.player）按「收益最大化」挑：
		//   选项0 拿黑牌 + 自己摸一张；选项1 拿红牌 + 技能持有者摸一张。
		// 牌本身取 max(牌值, 现在用掉它的价值) —— 后者能识别「关键牌」（该救的桃、该挡的闪、该用的无中生有），
		// 关键牌估值明显高于对方那手，才会去选黑。
		// 两边摸牌的估值不同：自己摸（DRAW_VALUE）低于让队友摸（ALLY_DRAW_BONUS），
		// 所以队友一般选红（把补牌让给持有者、留住更好的牌），敌对则反过来（不让对方补牌 → 选黑）。
		const me = trigger.player;
		const cardScore = card => Math.max(get.value(card, me), me.getUseValue(card));
		const DRAW_VALUE = 1.5; // 自己摸一张牌的估值
		const ALLY_DRAW_BONUS = 2.4; // 让同伴摸一张牌（含正态度）或让敌对摸一张牌（含负态度）的估值
		const scores = [cardScore(black) + DRAW_VALUE, cardScore(red) + get.sgn(get.attitude(me, player)) * ALLY_DRAW_BONUS];
		const res2 = await trigger.player.chooseButton([`预谋：请${get.translation(trigger.player)}选择一项`, [options.map((item, i) => [i, item]), "textbutton"]], true)
			.set("ai", button => scores[button.link] || 0)
			.forResult();
		if (!res2?.bool) {
			return;
		}
		const idx = res2.links[0];
		const card = idx == 0 ? black : red;
		await player.give([card], trigger.player);
		if (idx == 0) {
			await trigger.player.draw(1);
		} else {
			await player.draw(1);
		}
	},
	ai: {
		threaten: 1.2,
	},
},
// === 战嚎 ===
maokuo_zhanhao: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { player: "phaseBegin" },
	filter(event, player) {
		// 注意：getStorage 默认返回 []（真值），不能直接取反；用 hasStorage 判断是否已发动过
		return !player.hasStorage("maokuo_zhanhao_used");
	},
	async content(event, trigger, player) {
		player.storage.maokuo_zhanhao_used = true;
		for (const current of game.players) {
			const cards = current.getCards("hej");
			if (cards.length) {
				await current.discard(cards);
			}
		}
		player.addSkill("maokuo_zhanhao_active");
		player.addSkill("maokuo_zhanhao_clear");
	},
	global: "maokuo_zhanhao_buff",
	subSkill: {
		active: {
			name: "战嚎",
			charlotte: true,
			mark: true,
			marktext: "嚎",
			intro: { content: "所有角色的【闪】均视为【杀】、【桃】均视为【酒】，直到战嚎使用者的下回合结束" },
		},
		buff: {
			charlotte: true,
			mod: {
				cardname(card, player) {
					if (!game.hasPlayer((current) => current.hasSkill("maokuo_zhanhao_active"))) {
						return;
					}
					if (card.name == "shan") {
						return "sha";
					}
					if (card.name == "tao") {
						return "jiu";
					}
				},
			},
		},
		clear: {
			name: "战嚎",
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { player: ["phaseEnd", "dieAfter"] },
			async content(event, trigger, player) {
				if (event.triggername != "dieAfter") {
					player.storage.maokuo_zhanhao_count = (player.storage.maokuo_zhanhao_count || 0) + 1;
					if (player.storage.maokuo_zhanhao_count < 2) {
						return;
					}
				}
				player.removeSkill("maokuo_zhanhao_active");
				player.removeSkill("maokuo_zhanhao_clear");
				delete player.storage.maokuo_zhanhao_count;
			},
		},
	},
},
// === 制地 ===
// 制地：锁定技，唯一目标的使用牌其攻击路径经过标记间隙时结算
//（越过判定与“途经你”同款弧线口径：较短弧经过标记即成立，等长时任一弧经过即成立，见 crossed）
maokuo_zhidi: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { global: "useCardToTarget" },
	filter(event, player) {
		if (!player.isIn()) return false;
		if (!event.isFirstTarget) return false;
		const use = event.getParent("useCard", true);
		const targets = use?.targets || [];
		if (targets.length != 1) return false; // 指定唯一目标
		const gap = player.storage.maokuo_tianqian_gap;
		if (!gap || !player.storage.maokuo_tianqian_face) return false; // 标记未落位
		const user = use.player;
		const target = targets[0];
		if (user == target || !user.isIn() || !target.isIn()) return false;
		return lib.skill.maokuo_zhidi.crossed(user, target, player);
	},
	async content(event, trigger, player) {
		const use = trigger.getParent("useCard", true);
		const user = use.player;
		const target = use.targets[0];
		const face = player.storage.maokuo_tianqian_face;
		if (face == "shan") {
			await target.draw(1);
		} else {
			// 泽：使用者自选弃置目标角色的一张牌（手牌+装备区）
			if (!target.countCards("he")) return;
			const res = await user
				.choosePlayerCard(target, "he", true)
				.set("prompt", "制地：弃置" + get.translation(target) + "的一张牌")
				.set("ai", (button) => get.value(button.link))
				.forResult();
			if (res?.cards?.length) await target.discard(res.cards, user);
		}
	},
	// 越过判定：与“途经你”（怀烈 relevant）同款弧线口径——标记间隙视为路径上的一个点，
	// 沿两条弧走向目标：较短弧经过间隙即越过；等长（双最短路）时任一弧越过即越过。
	// ⚠️ 不用距离等式判定——坐骑等距离修正会让等式产生假阳性（实测“没经过标记却发动”）
	crossed(user, target, owner) {
		const gap = owner.storage.maokuo_tianqian_gap;
		if (!gap || user == target) return false;
		const pass = (forward) => {
			let steps = 0;
			let prev = user;
			let cur = forward ? user.getNext() : user.getPrevious();
			while (cur && cur != user) {
				steps++;
				// 跨过标记间隙（a→b 或 b→a 的相邻步）→ 这条弧经过标记
				if ((prev == gap.a && cur == gap.b) || (prev == gap.b && cur == gap.a)) {
					return { cross: true, steps };
				}
				if (cur == target) return { cross: false, steps };
				prev = cur;
				cur = forward ? cur.getNext() : cur.getPrevious();
			}
			return { cross: false, steps: Infinity };
		};
		const cw = pass(true);
		const ccw = pass(false);
		if (cw.steps < ccw.steps) return cw.cross;
		if (ccw.steps < cw.steps) return ccw.cross;
		return cw.cross || ccw.cross;
	},
	// 标记间隙 → 当前存活环侧邻 [P, Q]：沿座位环把 a/b 归位到最近的存活角色（含 a/b 自身）
	gapPair(gap) {
		const fix = (seat, step) => {
			let cur = seat;
			let guard = 0;
			while (cur && !cur.isIn() && guard++ <= game.players.length + game.dead.length) cur = step(cur);
			return cur && cur.isIn() ? cur : null;
		};
		const P = fix(gap.a, (x) => x.previousSeat);
		const Q = fix(gap.b, (x) => x.nextSeat);
		if (!P || !Q || P == Q) return null;
		return [P, Q];
	},
	// 存活环最短步数（顺/逆取短；沿 getNext/getPrevious 存活链）
	dist(a, b) {
		if (a == b) return 0;
		let cur = a.getNext();
		let n = 1;
		while (cur && cur != a) {
			if (cur == b) return n;
			cur = cur.getNext();
			n++;
		}
		cur = a.getPrevious();
		n = 1;
		while (cur && cur != a) {
			if (cur == b) return n;
			cur = cur.getPrevious();
			n++;
		}
		return Infinity;
	},
},
// === 著贊 ===
maokuo_zhuzan: {
	audio: 2,
	mark: true,
	marktext: "贊",
	intro: { name: "著贊", content: "expansion", markcount: "expansion" },
	group: ["maokuo_zhuzan_after"],
	trigger: { global: "useCardBegin" },
	filter(event, player) {
		return event.card?.name == "sha" && player.isIn() && player.countCards("he") > 0;
	},
	async cost(event, trigger, player) {
		const res = await player.chooseCard("he", "著贊：将一张牌置于武将牌上")
			.set("ai", card => 6 - get.value(card))
			.forResult();
		if (!res?.bool || !res.cards?.length) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { card: res.cards[0] } };
	},
	async content(event, trigger, player) {
		const card = event.cost_data.card;
		await player.addToExpansion([card], "giveAuto").set("gaintag", ["maokuo_zhuzan"]);
		// 在该【杀】的 useCard 事件上记录挂牌人（useCardBegin 的 trigger 即 useCard 事件本体）
		trigger._maokuo_zhuzan = (trigger._maokuo_zhuzan || []).concat([player]);
	},
},
// === 著贊 ===
maokuo_zhuzan_after: {
	charlotte: true,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		return (event._maokuo_zhuzan || []).includes(player) &&
			player.isIn() && player.getExpansions("maokuo_zhuzan").length > 0 &&
			!game.hasPlayer(cur => cur.getHistory("sourceDamage", ev => ev.card == event.card).length);
	},
	async cost(event, trigger, player) {
		const cards = player.getExpansions("maokuo_zhuzan");
		// 让使用者摸牌：只帮自己/队友；牌选价值最低的
		const friendly = trigger.player == player || get.attitude(player, trigger.player) > 0;
		const res = await player.chooseButton([`著贊：将至少一张“著贊”牌置入弃牌堆，${get.translation(trigger.player)}摸等量的牌`, cards], [1, cards.length])
			.set("ai", button => (friendly ? 6 - get.value(button.link) : -1))
			.forResult();
		if (!res?.bool || !res.links?.length) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { cards: res.links } };
	},
	async content(event, trigger, player) {
		const cards = event.cost_data.cards;
		await player.lose(cards, ui.discardPile);
		cards.forEach(c => c.gaintag.remove("maokuo_zhuzan"));
		await trigger.player.draw(cards.length);
	},
	ai: {
		skillTagFilter: () => true,
	},
},
// === 醉世 ===
maokuo_zuishi: {
	audio: 2,
	forced: true,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		return event.card?.name == "jiu";
	},
	async content(event, trigger, player) {
		await player.draw(1);
	},
},
// ==================== 二蛋展示（猫咪大院包）：15 名武将 ====================
// 来源：《二蛋武将信息_核对版》（B站官方发布贴逐字核对）。
// 方案、引擎锚点与歧义裁定见 app 根目录《二蛋武将实现方案.md》。

// === 讨护（秦朗） ===
// ①使用黑色基本牌/普通锦囊选择目标后，可令一名体力／手牌最多的角色也成为目标；
// ②此牌结算后，若生效过，可令体力最少的一名角色回复1点体力／手牌最少的一名角色摸一张牌。
maokuo_taohu: {
	audio: 2,
	group: ["maokuo_taohu_after"],
	trigger: { player: "useCard2" },
	filter(event, player) {
		if (!player.isIn() || !event.targets?.length) {
			return false;
		}
		// 普通锦囊用 get.type=="trick"（延时锦囊返回 "delay"，天然排除——docs/坑-清单 get.type/get.type2 差异条）
		if (get.color(event.card) != "black" || !["basic", "trick"].includes(get.type(event.card))) {
			return false;
		}
		return lib.skill.maokuo_taohu.getCandidates(event).length > 0;
	},
	// 候选：体力最多 ∪ 手牌最多，且尚未是此牌目标
	getCandidates(event) {
		const alive = game.filterPlayer(cur => cur.isIn()).filter(cur => !event.targets.includes(cur));
		if (!alive.length) {
			return [];
		}
		const maxHp = Math.max(...alive.map(cur => cur.hp));
		const maxHand = Math.max(...alive.map(cur => cur.countCards("h")));
		return alive.filter(cur => cur.hp == maxHp || cur.countCards("h") == maxHand);
	},
	async cost(event, trigger, player) {
		const candidates = lib.skill.maokuo_taohu.getCandidates(trigger);
		const res = await player.chooseTarget(get.prompt("maokuo_taohu"), (card, me, target) => candidates.includes(target))
			.set("prompt2", "令一名体力或手牌最多的角色也成为此牌的目标")
			.set("ai", target => get.effect(target, trigger.card, player, player))
			.forResult();
		if (!res?.bool || !res.targets?.length) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { target: res.targets[0] } };
	},
	async content(event, trigger, player) {
		const target = event.cost_data.target;
		// 追加目标只写 targets（原生 congjian 范本 character/yingbian.js:1488；取证报告：_triggerTo 循环
		// 从 targets − triggeredTargetsN 实时选人，预写 triggeredTargets2 反而会让补问循环跳过它）
		trigger.targets.push(target);
		trigger._maokuo_taohu_effected = true;
		game.log(target, "成为了此牌的目标");
	},
},
// === 讨护 ===
maokuo_taohu_after: {
	audio: "maokuo_taohu",
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		return event._maokuo_taohu_effected && player.isIn();
	},
	async cost(event, trigger, player) {
		const alive = game.filterPlayer(cur => cur.isIn());
		const minHp = Math.min(...alive.map(cur => cur.hp));
		const minHand = Math.min(...alive.map(cur => cur.countCards("h")));
		const healable = alive.filter(cur => cur.isDamaged() && cur.hp == minHp);
		const drawable = alive.filter(cur => cur.countCards("h") == minHand);
		const controls = [];
		if (healable.length) {
			controls.push("回复体力");
		}
		if (drawable.length) {
			controls.push("摸牌");
		}
		if (!controls.length) {
			event.result = { bool: false };
			return;
		}
		controls.push("cancel2");
		const res = await player.chooseControl(controls)
			.set("prompt", "讨护：令体力最少的一名角色回复1点体力，或手牌最少的一名角色摸一张牌")
			.set("ai", () => (healable.some(cur => get.attitude(player, cur) > 0) ? "回复体力" : "摸牌"))
			.forResult();
		if (res?.control == "cancel2") {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { branch: res.control, healable, drawable } };
	},
	async content(event, trigger, player) {
		const { branch, healable, drawable } = event.cost_data;
		const pool = branch == "回复体力" ? healable : drawable;
		const res = await player.chooseTarget(`讨护：选择体力最少的一名角色${branch == "回复体力" ? "回复1点体力" : "摸一张牌"}`, (card, me, target) => pool.includes(target))
			.set("ai", target => get.attitude(player, target))
			.forResult();
		if (!res?.bool || !res.targets?.length) {
			return;
		}
		const target = res.targets[0];
		if (branch == "回复体力") {
			await target.recover();
		} else {
			await target.draw();
		}
	},
},
// === 袅袅（绛树） ===
// 每轮开始时咏唱“柔音”或“烈音”，决定本轮婆娑哪一分支生效；体力值等于手牌数则两者均生效。
maokuo_niaoniao: {
	audio: 2,
	trigger: { global: "roundStart" },
	filter(event, player) {
		return player.isIn();
	},
	async cost(event, trigger, player) {
		const res = await player.chooseControl(["柔音", "烈音", "cancel2"])
			.set("prompt", "袅袅：是否咏唱？（若你的体力值等于手牌数，本轮内两者均生效）")
			.set("ai", () => (player.hp == player.countCards("h") ? (player.hp > 1 ? "烈音" : "柔音") : (player.hp <= 2 ? "柔音" : "烈音")))
			.forResult();
		if (res?.control == "cancel2") {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { mode: res.control } };
	},
	async content(event, trigger, player) {
		const both = player.hp == player.countCards("h");
		player.storage.maokuo_niaoniao_mode = both ? "both" : (event.cost_data.mode == "柔音" ? "rou" : "lie");
		player.addTempSkill("maokuo_niaoniao_flag", "roundEnd");
		game.log(player, both ? "咏唱了“柔音”与“烈音”（体力值等于手牌数，本轮内两者均生效）" : "咏唱了“" + event.cost_data.mode + "”");
	},
},
// === 袅袅 ===
// 本轮咏唱状态：mark 悬浮 + dynamicTranslate 高亮（translate/dynamicTranslate.js maokuo_niaoniao 条）
maokuo_niaoniao_flag: {
	charlotte: true,
	mark: true,
	marktext: "咏",
	intro: {
		name: "袅袅",
		content(storage, player) {
			const mode = player.storage.maokuo_niaoniao_mode;
			if (mode == "both") {
				return "本轮咏唱：柔音与烈音均生效（体力值等于手牌数）";
			}
			if (mode == "rou") {
				return "本轮咏唱：柔音（婆娑红色部分生效）";
			}
			if (mode == "lie") {
				return "本轮咏唱：烈音（婆娑蓝色部分生效）";
			}
			return "本轮未咏唱";
		},
	},
	onremove(player) {
		delete player.storage.maokuo_niaoniao_mode;
	},
},
// === 梦启（赵直）——仅身份模式生效 ===
// 每轮结束时声明一种未声明过且有对应存活角色的身份，该身份玩家共同选目标并结算效果。
maokuo_mengqi: {
	audio: 2,
	mark: true,
	marktext: "梦",
	intro: {
		name: "梦启",
		content(storage, player) {
			const list = player.storage.maokuo_mengqi_declared || [];
			if (!list.length) {
				return "尚未声明过身份";
			}
			return "已声明：" + list.map(id => lib.skill.maokuo_mengqi.idText[id] || id).join("、");
		},
	},
	idText: { zhong: "忠臣", fan: "反贼", nei: "内奸" },
	trigger: { global: "roundEnd" },
	filter(event, player) {
		if (_status.mode != "identity" || !player.isIn()) {
			return false;
		}
		return lib.skill.maokuo_mengqi.getCandidates(player).length > 0;
	},
	// 可声明：未声明过且场上有对应存活角色（主公身份公开、无对应效果条款，不列入）
	getCandidates(player) {
		const declared = player.storage.maokuo_mengqi_declared || [];
		return ["zhong", "fan", "nei"].filter(id => !declared.includes(id) && game.hasPlayer(cur => cur.isIn() && cur.identity == id));
	},
	async cost(event, trigger, player) {
		const ids = lib.skill.maokuo_mengqi.getCandidates(player);
		const controls = ids.map(id => lib.skill.maokuo_mengqi.idText[id]);
		controls.push("cancel2");
		const res = await player.chooseControl(controls)
			.set("prompt", "梦启：是否声明一种身份？（该身份的存活玩家将共同选择一名角色）")
			.set("ai", () => (ids.includes("zhong") ? "忠臣" : (ids.includes("nei") ? "内奸" : "反贼")))
			.forResult();
		if (res?.control == "cancel2") {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { id: ids[controls.indexOf(res.control)] } };
	},
	async content(event, trigger, player) {
		const id = event.cost_data.id;
		const idText = lib.skill.maokuo_mengqi.idText[id];
		if (!Array.isArray(player.storage.maokuo_mengqi_declared)) {
			player.storage.maokuo_mengqi_declared = [];
		}
		player.storage.maokuo_mengqi_declared.push(id);
		player.markSkill("maokuo_mengqi");
		game.log(player, "声明了", idText);
		// 该身份的全部存活玩家（含赵直自己身份相同时）依次暗选；内奸 0~2 名，其余恰 1 名
		const collectors = game.filterPlayer(cur => cur.isIn() && cur.identity == id);
		const doChoose = async () => {
			const chosen = [];
			for (const cur of collectors) {
				if (!cur.isIn()) {
					continue;
				}
				const range = id == "nei" ? [0, 2] : [1, 1];
				const res = await cur.chooseTarget(range, `梦启：${id == "nei" ? "选择零至两名" : "选择一名"}角色`, (card, me, target) => target.isIn())
					.set("ai", target => (id == "nei" ? -get.attitude(cur, target) : get.attitude(cur, target)))
					.set("_maokuo_mengqi_id", id)
					.forResult();
				if (res?.bool && res.targets?.length) {
					chosen.push(...res.targets);
				}
			}
			// 多人各选：去重后逐个结算（同一人被多名身份玩家选中只结算一次）
			return [...new Set(chosen)];
		};
		let chosen = await doChoose();
		// 揭命：公布前可暗中重选（旧选择作废、不公布）
		if (player.hasSkill("maokuo_jueming") && chosen.length) {
			const bool = await player.chooseBool(`揭命：是否暗中发动，令${idText}重新选择被选角色？`)
				.set("ai", () => false)
				.forResult();
			if (bool?.bool) {
				await player.awakenSkill("maokuo_jueming");
				chosen = await doChoose();
			}
		}
		if (chosen.length) {
			game.log(player, "公布被选择的角色：", ...chosen);
		}
		for (const t of chosen) {
			if (!t.isIn()) {
				continue;
			}
			if (id == "zhong") {
				await t.draw(3);
				// “可使用一张牌”原生范本：clanyangji（character/clan.js:3142）裸 chooseToUse
				await t.chooseToUse("梦启：是否使用一张牌？");
			} else if (id == "fan") {
				// 其（被选角色）弃置一至三名角色区域里共计至多三张牌（方案默认裁定 A）
				const res1 = await t.chooseTarget([1, 3], "梦启：选择一至三名角色，你将弃置其区域里共计至多三张牌", (card, me, target) => target.isIn() && target.countCards("hej") > 0)
					.set("ai", target => -get.attitude(t, target) + (target.countCards("hej") > 2 ? 1 : 0))
					.forResult();
				if (!res1?.bool || !res1.targets?.length) {
					continue;
				}
				let remaining = 3;
				for (const area of res1.targets) {
					if (remaining <= 0) {
						break;
					}
					if (!area.isIn() || area.countCards("hej") == 0) {
						continue;
					}
					const res2 = await t.choosePlayerCard(area, "hej", [1, remaining], `梦启：弃置${get.translation(area)}区域里的一张牌（共计至多三张，还可选${remaining}张）`)
						.set("ai", button => (get.attitude(t, area) > 0 ? -get.value(button.link) : get.value(button.link)))
						.forResult();
					if (res2?.cards?.length) {
						// 弃置别人的牌：由牌主执行、第二参归因（坑-清单「弃置别人的牌」条）
						await area.discard(res2.cards, t);
						remaining -= res2.cards.length;
					}
				}
			} else {
				await t.damage("nosource", 1);
			}
		}
		// 重置判定：除主公外的存活角色身份均被声明过 → 清空声明集合并公布“揭命”状态
		const nonzhu = game.filterPlayer(cur => cur.isIn() && cur.identity != "zhu");
		const declared = player.storage.maokuo_mengqi_declared;
		if (nonzhu.length && nonzhu.every(cur => declared.includes(cur.identity))) {
			player.storage.maokuo_mengqi_declared = [];
			player.markSkill("maokuo_mengqi");
			game.log(player, "令除主公外的存活角色均被声明过身份，重置了【梦启】；【揭命】" + (player.hasSkill("maokuo_jueming") ? "未发动" : "已发动"));
		}
	},
},
// === 揭命（赵直）——限定技，由【梦启】流程内调用 ===
maokuo_jueming: {
	audio: 2,
	limited: true,
},
// === 截径（孙桓） ===
// 出牌阶段开始时令一名有手牌的其他角色交出至少一张手牌给另一名角色，随后获得阶段级两段收益。
maokuo_jiejing: {
	audio: 2,
	trigger: { player: "phaseUseBegin" },
	filter(event, player) {
		return player.isIn() && game.hasPlayer(cur => cur != player && cur.isIn() && cur.countCards("h") > 0);
	},
	async cost(event, trigger, player) {
		const res = await player.chooseTarget(get.prompt("maokuo_jiejing"), (card, me, target) => target != me && target.isIn() && target.countCards("h") > 0)
			.set("prompt2", "令其将至少一张手牌交给另一名其他角色，你于此阶段内获得截径的两段收益")
			.set("ai", target => -get.attitude(player, target) + target.countCards("h") * 0.1)
			.forResult();
		if (!res?.bool || !res.targets?.length) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { giver: res.targets[0] } };
	},
	async content(event, trigger, player) {
		const giver = event.cost_data.giver;
		// 交牌者可取消（点取消=视为未发动，不产生任何效果）
		const res1 = await giver.chooseCard("h", [1, giver.countCards("h")], "截径：将至少一张手牌交给另一名其他角色（点取消则不发动）")
			.set("ai", card => 6 - get.value(card))
			.forResult();
		if (!res1?.bool || !res1.cards?.length) {
			return;
		}
		const cards = res1.cards;
		const res2 = await giver.chooseTarget("截径：选择一名角色，将手牌交给其", (card, me, target) => target != me && target.isIn())
			.set("ai", target => get.attitude(giver, target))
			.forResult();
		if (!res2?.bool || !res2.targets?.length) {
			return;
		}
		const receiver = res2.targets[0];
		await giver.give(cards, receiver);
		const num = cards.length;
		// (a) 于此阶段内可多使用等量张【杀】
		player.storage.maokuo_jiejing_extra = (player.storage.maokuo_jiejing_extra || 0) + num;
		player.addTempSkill("maokuo_jiejing_extra", "phaseUseAfter");
		// (b) 于此阶段内可将等量的牌当【杀】对失去牌的角色使用、得到牌的角色也成为目标（一次性）
		player.storage.maokuo_jiejing_vcard = { num: num, loser: giver, receiver: receiver };
		player.addTempSkill("maokuo_jiejing_sha", "phaseUseAfter");
		game.log(player, "于此阶段内可以多使用", num, "张【杀】，并可将", num, "张牌当【杀】对", giver, "使用");
	},
},
// === 截径 ===
// (a) 本阶段可多使用 X 张【杀】
maokuo_jiejing_extra: {
	charlotte: true,
	mark: true,
	marktext: "截",
	intro: {
		name: "截径",
		content(storage, player) {
			return "本阶段可以多使用" + (player.storage.maokuo_jiejing_extra || 0) + "张【杀】";
		},
	},
	mod: {
		cardUsable(card, player, num) {
			if (card.name == "sha") {
				return num + (player.storage.maokuo_jiejing_extra || 0);
			}
		},
	},
	onremove(player) {
		delete player.storage.maokuo_jiejing_extra;
	},
},
// === 截径 ===
// (b) 将恰好 X 张牌当一张【杀】对「失去牌的角色」使用，再令「得到牌的角色」也成为此牌的目标。
//     语义：主目标只有 loser（距离/合法性按【杀】自身规则校验）；receiver 是**额外目标**，
//     在 useCardToTarget 时点追加到 useCard.targets（标准追加目标时机），不校验距离。
maokuo_jiejing_sha: {
	charlotte: true,
	enable: "phaseUse",
	usable: 1,
	viewAs: { name: "sha", isCard: true },
	group: ["maokuo_jiejing_sha_extra"],
	filter(event, player) {
		if (event.skill == "maokuo_jiejing_sha" || event._skill == "maokuo_jiejing_sha") {
			return true;
		}
		const d = player.storage.maokuo_jiejing_vcard;
		if (!d || !d.loser || !d.loser.isIn()) return false;
		if (player.countCards("h") < d.num) return false;
		// 只校验主目标（失去牌的角色）能否被杀指定
		return player.canUse({ name: "sha", isCard: true }, d.loser);
	},
	filterCard: () => true,
	selectCard() {
		const d = get.player()?.storage?.maokuo_jiejing_vcard;
		return d ? d.num : 1;
	},
	// 主目标：只能是失去牌的角色
	filterTarget(card, player, target) {
		const d = player.storage.maokuo_jiejing_vcard;
		return !!d && target == d.loser && target.isIn();
	},
	selectTarget: 1,
	onremove(player) {
		delete player.storage.maokuo_jiejing_vcard;
	},
	ai: {
		order: 5,
	},
},
// === 截径 ===
// 追加额外目标：本次【杀】的目标确定时，令「得到牌的角色」也成为目标（不校验距离）
maokuo_jiejing_sha_extra: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "useCardToTarget" },
	filter(event, player) {
		if (event.skill != "maokuo_jiejing_sha" && event._skill != "maokuo_jiejing_sha") return false;
		const d = player.storage.maokuo_jiejing_vcard;
		if (!d || !d.receiver || !d.receiver.isIn()) return false;
		if (event.targets?.includes(d.receiver)) return false;
		return get.name(event.card) == "sha";
	},
	async content(event, trigger, player) {
		const d = player.storage.maokuo_jiejing_vcard;
		const use = trigger.getParent("useCard");
		if (!use || !d?.receiver?.isIn()) return;
		if (use.targets.includes(d.receiver)) return;
		use.targets.push(d.receiver);
		game.log(d.receiver, "成为", trigger.card, "的额外目标");
	},
},
// === 戒急（赵姬） ===
// 每轮限一次：其他角色使用牌且（含本张）本回合未对另一名角色使用过牌，令其摸等量牌。
maokuo_jieji: {
	audio: 2,
	round: 1,
	group: ["maokuo_jieji_record"],
	trigger: { global: "useCard" },
	filter(event, player) {
		const user = event.player;
		if (!user || user == player || !user.isIn() || !player.isIn()) {
			return false;
		}
		// 含本张：本张即指向他人 → 不符（方案默认裁定：含本张）
		if (event.targets?.some(t => t != user)) {
			return false;
		}
		const flag = user.storage.maokuo_jieji_flag;
		return !flag || flag.turn != game.phaseNumber;
	},
	async cost(event, trigger, player) {
		const user = trigger.player;
		const res = await player.chooseBool(`戒急：是否令${user == player ? "你" : get.translation(user)}摸与其本回合使用牌数等量的牌？`)
			.set("ai", () => get.attitude(player, user) > 0)
			.forResult();
		event.result = { bool: !!res?.bool, cost_data: { user: user } };
	},
	async content(event, trigger, player) {
		const user = event.cost_data.user;
		// 使用牌数含本张：历史里若已计入本张则排除（evt !== trigger），再补 1
		const count = user.getHistory("useCard", evt => evt !== trigger).length + 1;
		await user.draw(count);
		game.log(user, "摸了", count, "张牌");
	},
},
// === 戒急 ===
// 记录器：某角色本回合对另一名角色使用过牌（含本张口径的判定依据，独立于主触发时序）
maokuo_jieji_record: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: "useCardToTargeted" },
	filter(event) {
		return !!event.player?.isIn?.();
	},
	content(event, trigger, player) {
		const user = trigger.player;
		if (!trigger.targets?.some(t => t != user)) {
			return;
		}
		if (!user.storage.maokuo_jieji_flag || user.storage.maokuo_jieji_flag.turn != game.phaseNumber) {
			user.storage.maokuo_jieji_flag = { turn: game.phaseNumber };
		}
	},
},
// === 慎好（赵姬） ===
// 每回合第一次使用红色牌时，可选弃牌堆里本回合置入的每种花色各一张，交给至少一名角色。
maokuo_shenhao: {
	audio: 2,
	usable: 1,
	trigger: { player: "useCard" },
	filter(event, player) {
		if (get.color(event.card) != "red" || !player.isIn()) {
			return false;
		}
		return Object.keys(lib.skill.maokuo_shenhao.turnSuitGroups()).length > 0;
	},
	// 本回合置入弃牌堆的牌按花色分组（口径同 helpers.qunyou_turnDiscards）
	turnSuitGroups() {
		const groups = {};
		for (const card of qunyou_turnDiscards()) {
			const suit = get.suit(card);
			if (suit) {
				(groups[suit] ??= []).push(card);
			}
		}
		return groups;
	},
	async cost(event, trigger, player) {
		const suits = Object.keys(lib.skill.maokuo_shenhao.turnSuitGroups());
		const res = await player.chooseBool(`慎好：是否选择弃牌堆里本回合置入的每种花色牌各一张（${suits.map(s => get.translation(s)).join("、")}），将这些牌交给至少一名角色？`)
			.set("ai", () => true)
			.forResult();
		event.result = { bool: !!res?.bool, cost_data: { suits: suits } };
	},
	async content(event, trigger, player) {
		const groups = lib.skill.maokuo_shenhao.turnSuitGroups();
		const picked = [];
		for (const suit of event.cost_data.suits) {
			const list = groups[suit];
			if (!list?.length) {
				continue;
			}
			const res = await player.chooseButton([`慎好：选择一张本回合置入弃牌堆的${get.translation(suit)}牌`, [list, "card"]], true)
				.set("ai", button => 6 - get.value(button.link))
				.forResult();
			if (res?.links?.length) {
				picked.push(res.links[0]);
			}
		}
		if (!picked.length) {
			return;
		}
		for (const card of picked) {
			const res = await player.chooseTarget(`慎好：将${get.translation(card)}交给一名角色`, (c, me, target) => target.isIn())
				.set("ai", target => get.attitude(player, target) * get.value(card))
				.forResult();
			if (res?.bool && res.targets?.length) {
				await player.give(card, res.targets[0]);
			}
		}
	},
},
// === 啸怀（阮籍） ===
// 每回合限一次，将一张“你不是合法目标”的牌当基本牌或普通锦囊牌使用；若未对其他角色使用，可于当前阶段结束时再次发动。
maokuo_xiaohuai: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	group: ["maokuo_xiaohuai_again"],
	// 印牌标准骨架②：运行时牌面，顶层无静态 viewAs → hiddenCard 按牌名收窄到基本牌+普通锦囊
	hiddenCard(player, name) {
		return get.type(name) == "basic" || get.type(name) == "trick";
	},
	filter(event, player) {
		if (event.skill == "maokuo_xiaohuai" || event._skill == "maokuo_xiaohuai") {
			return true;
		}
		return player.countCards("h", card => lib.skill.maokuo_xiaohuai.filterCard(card, player)) > 0;
	},
	filterCard(card, player) {
		// “你不是合法目标的牌”：你不能以自己为合法目标使用它（闪/无懈恒真，桃须满血，装备恒假）
		return !player.canUse(card, player);
	},
	selectCard: 1,
	chooseButton: {
		dialog(event, player) {
			const list = get.inpileVCardList(info => info[0] == "basic" || info[0] == "trick");
			if (!list.length) {
				return ui.create.dialog("啸怀：没有可视为使用的基本牌或普通锦囊牌");
			}
			return ui.create.dialog("啸怀：视为使用一张基本牌或普通锦囊牌", [list, "vcard"]);
		},
		filter(button, player) {
			// 按钮只按牌名名单+可用性过滤（复核 P1-5：不能复用技能的素材 filterCard——那是“你不是合法目标”
			// 的素材约束，作用在牌名上会把无目标锦囊/残血桃全部误杀）
			if (!(button.link[0] == "basic" || button.link[0] == "trick")) {
				return false;
			}
			const card = new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true });
			return player.hasUseTarget(card);
		},
		check(button) {
			return get.player().getUseValue(new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true }), null, true);
		},
		backup(links) {
			return {
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true },
				filterCard(card, player) {
					return !player.canUse(card, player);
				},
				selectCard: 1,
				async precontent(event, trigger, player) {
					// 记录本次是否对其他角色使用（阶段末补发动的判定依据）
					const targets = event.result?.targets || [];
					player.storage.maokuo_xiaohuai_last = { turn: game.phaseNumber, targeted: targets.some(t => t != player) };
				},
			};
		},
		prompt(links) {
			return `啸怀：将一张你不是合法目标的牌当【${get.translation(links[0][2])}】使用`;
		},
	},
	ai: {
		order: 4,
	},
},
// === 啸怀 ===
// 阶段末补发动：本回合的啸怀使用未对其他角色 → 可再次发动（触发式：选牌名→选素材→chooseUseTarget）
maokuo_xiaohuai_again: {
	audio: "maokuo_xiaohuai",
	trigger: { player: "phaseUseEnd" },
	filter(event, player) {
		const last = player.storage.maokuo_xiaohuai_last;
		return player.isIn() && last && last.turn == game.phaseNumber && !last.targeted;
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool("啸怀：你未对其他角色使用此牌，是否于当前阶段结束时再次发动？")
			.set("ai", () => player.countCards("h", card => !player.canUse(card, player)) > 0)
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		const list = get.inpileVCardList(info => info[0] == "basic" || info[0] == "trick");
		if (!list.length) {
			return;
		}
		const res = await player.chooseButton(["啸怀：视为使用一张基本牌或普通锦囊牌", [list, "vcard"]], true)
			.set("ai", button => player.getUseValue(new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true }), null, true))
			.forResult();
		if (!res?.bool || !res.links?.length) {
			return;
		}
		const name = res.links[0][2];
		const nature = res.links[0][3];
		const res2 = await player.chooseCard("h", true, 1, `啸怀：选择一张你不是合法目标的牌当【${get.translation(name)}】使用`, card => !player.canUse(card, player))
			.set("ai", card => 6 - get.value(card))
			.forResult();
		if (!res2?.cards?.length) {
			return;
		}
		await player.chooseUseTarget(get.autoViewAs({ name: name, nature: nature, isCard: true }, res2.cards), res2.cards, true);
		delete player.storage.maokuo_xiaohuai_last;
	},
},
// === 阶音（阮咸） ===
// 你的一个阶段开始时，可将手牌摸或弃置至1/2/3/5/6张（每回合每个值限一次）；
// 此阶段结束时若手牌数不为该值，【阶音】失效直到回合结束。
maokuo_jieyin: {
	audio: 2,
	mark: true,
	marktext: "音",
	intro: {
		name: "阶音",
		content(storage, player) {
			const st = player.storage.maokuo_jieyin_state;
			const used = st && st.turn == game.phaseNumber ? st.used : [];
			if (!used.length) {
				return "本回合尚未调整手牌";
			}
			return "本回合已调整至：" + used.join("、") + "张";
		},
	},
	values: [1, 2, 3, 5, 6],
	// phaseAnyBegin 自动展开为六个阶段 Begin（取证题20：lib.relatedTrigger）
	trigger: { player: "phaseAnyBegin" },
	filter(event, player) {
		if (player.hasSkill("maokuo_jieyin_ban")) {
			return false;
		}
		const st = player.storage.maokuo_jieyin_state;
		const used = st && st.turn == game.phaseNumber ? st.used : [];
		return lib.skill.maokuo_jieyin.values.some(v => !used.includes(v));
	},
	async cost(event, trigger, player) {
		const st = player.storage.maokuo_jieyin_state;
		const used = st && st.turn == game.phaseNumber ? st.used : [];
		const opts = lib.skill.maokuo_jieyin.values.filter(v => !used.includes(v)).map(v => String(v));
		opts.push("cancel2");
		const hand = player.countCards("h");
		const res = await player.chooseControl(opts)
			.set("prompt", "阶音：将手牌摸或弃置至多少张？（此阶段结束时若手牌数不为该值，【阶音】失效直到回合结束）")
			.set("ai", () => {
				// 取与当前手牌数差值最小的目标值（少动牌）
				const avail = lib.skill.maokuo_jieyin.values.filter(v => !used.includes(v));
				avail.sort((a, b) => Math.abs(a - hand) - Math.abs(b - hand));
				return String(avail[0]);
			})
			.forResult();
		if (res?.control == "cancel2") {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { value: parseInt(res.control) } };
	},
	async content(event, trigger, player) {
		const v = event.cost_data.value;
		const old = player.storage.maokuo_jieyin_state;
		const st = old && old.turn == game.phaseNumber ? old : { turn: game.phaseNumber, used: [] };
		st.used.push(v);
		player.storage.maokuo_jieyin_state = st;
		const hand = player.countCards("h");
		if (hand > v) {
			await player.chooseToDiscard(hand - v, "h", true, `阶音：弃置${hand - v}张手牌（将手牌调整至${v}张）`);
		} else if (hand < v) {
			await player.draw(v - hand);
		}
		// 记录本阶段目标值，阶段结束时核验
		const phaseBase = (event.triggername || "phaseZhunbeiBegin").replace(/Begin$/, "");
		player.storage.maokuo_jieyin_cur = { turn: game.phaseNumber, phase: phaseBase, value: v };
		player.addTempSkill("maokuo_jieyin_check", "phaseAfter");
		player.markSkill("maokuo_jieyin");
		game.log(player, "将手牌调整至", v, "张");
	},
},
// === 阶音 ===
// 阶段末核验：手牌数不为该值 → 失效直到回合结束
maokuo_jieyin_check: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "phaseAnyEnd" },
	filter(event, player, name) {
		const cur = player.storage.maokuo_jieyin_cur;
		return cur && cur.turn == game.phaseNumber && name == cur.phase + "End";
	},
	async content(event, trigger, player) {
		const cur = player.storage.maokuo_jieyin_cur;
		delete player.storage.maokuo_jieyin_cur;
		if (player.countCards("h") != cur.value) {
			player.disableSkill("maokuo_jieyin_ban", "maokuo_jieyin");
			player.addTempSkill("maokuo_jieyin_ban", "phaseAfter");
			game.log(player, "的手牌数不为", cur.value, "张，【阶音】失效直到回合结束");
		}
	},
},
// === 阶音 ===
// 失效载体：过期/移除时恢复技能
maokuo_jieyin_ban: {
	charlotte: true,
	silent: true,
	popup: false,
	onremove(player) {
		player.enableSkill("maokuo_jieyin_ban");
	},
},
// === 登阶（山涛）——锁定技 ===
// 手牌上限为0；受到伤害时若你是手牌上限最小的角色，改为令手牌上限+1。
maokuo_dengjie: {
	audio: 2,
	forced: true,
	charlotte: true,
	init(player) {
		if (typeof player.storage.maokuo_dengjie_add != "number") {
			player.storage.maokuo_dengjie_add = 0;
		}
	},
	mark: true,
	markimage: "image/card/handcard.png",
	intro: {
		name: "登阶",
		markcount(storage, player) {
			return player.storage.maokuo_dengjie_add || 0;
		},
		content(storage, player) {
			return `<li>你的手牌上限为0<br><li>当前手牌上限：${player.getHandcardLimit()}`;
		},
	},
	mod: {
		// 绝对值：手牌上限为 0 + 登阶层数（覆盖其他上限修正）
		maxHandcard(player) {
			return typeof player.storage.maokuo_dengjie_add == "number" ? player.storage.maokuo_dengjie_add : 0;
		},
	},
	trigger: { player: "damageBegin3" },
	filter(event, player) {
		if (!player.isIn()) {
			return false;
		}
		const limits = game.filterPlayer(cur => cur.isIn()).map(cur => cur.getHandcardLimit());
		return limits.length > 0 && player.getHandcardLimit() <= Math.min(...limits);
	},
	async content(event, trigger, player) {
		trigger.cancel();
		player.storage.maokuo_dengjie_add++;
		player.markSkill("maokuo_dengjie");
		game.log(player, "是手牌上限最小的角色，防止了此伤害，且手牌上限+1（当前", player.getHandcardLimit(), "）");
	},
},
// === 存思（魏华存）——配对牌数据机 ===
// 得到手牌（含起始手牌）后，从牌堆顶贴附等量牌背对背配对，逐对选一面朝上作为手牌。
// up 牌=手牌明面；down 牌=扣置于武将牌上（gaintag maokuo_cunsi，intro 只显示张数——牌面仅魏华存自己在选面时见过）。
// 配对记录：player.storage.maokuo_cunsi_pairs = [{ cards:[A,B], upIdx:0|1 }]。
// up 牌离开手牌区 → 自动拆分（拆分机 maokuo_cunsi_split）：down 牌进弃牌堆，up 牌按原流程继续。
maokuo_cunsi: {
	audio: 2,
	mark: true,
	marktext: "存",
	intro: {
		name: "存思",
		content(storage, player) {
			const pairs = player.storage.maokuo_cunsi_pairs || [];
			if (!pairs.length) {
				return "暂无背对背贴附的牌。";
			}
			const lines = pairs.map((p, i) => {
				const up = p.cards[p.upIdx];
				const down = p.cards[1 - p.upIdx];
				if (!up || !down) return null;
				const same = get.color(up) == get.color(down) ? "同色" : "异色";
				return `第${i + 1}对：正面【${get.translation(up)}】／背面【${get.translation(down)}】——${same}`;
			}).filter(Boolean);
			return `背对背贴附的牌：${pairs.length}对（有牌离开手牌区时拆分，朝下的牌进入弃牌堆）<br>${lines.join("<br>")}`;
		},
	},
	group: ["maokuo_cunsi_split", "maokuo_cunsi_init"],
	trigger: { player: "gainAfter" },
	filter(event, player) {
		if (!player.isIn() || lib.skill.maokuo_cunsi.suspended()) {
			return false;
		}
		return lib.skill.maokuo_cunsi.newHandCards(event, player).length > 0;
	},
	// 流程挂起标记：贴附/翻转过程中暂停拆分机与再入
	suspended() {
		return (lib.maokuo_cunsi_suspend || 0) > 0;
	},
	// 本次获得且尚未配对、落点为手牌的牌
	newHandCards(event, player) {
		return (event.cards || []).filter(card => get.position(card) == "h" && get.owner(card) == player && !lib.skill.maokuo_cunsi.findPair(player, card));
	},
	// 查牌所在配对（按对象同一性）
	findPair(player, card) {
		return (player.storage.maokuo_cunsi_pairs || []).find(p => p.cards.includes(card)) || null;
	},
	// 配对流程主体（gainAfter 与起始手牌两条入口共用）
	async pairFlow(player, cards) {
		if (!cards.length || !ui.cardPile.childNodes.length) {
			return;
		}
		lib.maokuo_cunsi_suspend = (lib.maokuo_cunsi_suspend || 0) + 1;
		try {
			const n = Math.min(cards.length, ui.cardPile.childNodes.length);
			const attach = get.cards(n);
			// 逐对选面：选中的朝上成为手牌，另一张扣置武将牌上（背对背）
			for (let i = 0; i < n; i++) {
				const host = cards[i];
				const mate = attach[i];
				if (!host || !mate) {
					break;
				}
				const res = await player.chooseButton([`存思：选择一面朝上作为你的手牌（另一张将背对背扣置）`, [[host, mate], "card"]], true)
					.set("ai", button => get.value(button.link))
					.forResult();
				const up = res?.links?.[0] || host;
				const down = up == host ? mate : host;
				const pair = { cards: [host, mate], upIdx: host == up ? 0 : 1 };
				player.storage.maokuo_cunsi_pairs ??= [];
				player.storage.maokuo_cunsi_pairs.push(pair);
				// 呈现：正面牌打「存思」tag，标签文本带对面牌名与同色/异色
				lib.skill.maokuo_cunsi.markPairTags(player, up, down);
				if (down == mate) {
					// 朝下的是新贴附牌：置于武将牌上（扣置）
					await player.addToExpansion(mate, "gain2").set("gaintag", ["maokuo_cunsi"]);
				} else {
					// 朝下的是原获得牌：换面——原牌扣置、新贴附牌入手牌
					await player.addToExpansion(host, "gain2").set("gaintag", ["maokuo_cunsi"]);
					await player.gain(mate, "gain2");
				}
			}
			player.markSkill("maokuo_cunsi");
			game.log(player, "将牌堆顶的", n, "张牌背对背贴附于手牌背面");
		} finally {
			lib.maokuo_cunsi_suspend = (lib.maokuo_cunsi_suspend || 1) - 1;
		}
	},
	// 给一对牌打呈现 tag：正面/背面都只标「存思·<对面牌名>」（同色/异色放在 mark 悬浮里，tag 不宜过长）
	markPairTags(player, up, down) {
		if (!up || !down) return;
		const upTag = `maokuo_cunsi_up_${up.cardid}`;
		game.addTempTag(upTag, `存思·${get.translation(down)}`);
		up.addGaintag(upTag);
		// 背面（武将牌上扣置的牌）同样标注，便于辨认它属于存思
		const downTag = `maokuo_cunsi_down_${down.cardid}`;
		game.addTempTag(downTag, `存思·${get.translation(up)}`);
		down.addGaintag(downTag);
	},
	async content(event, trigger, player) {
		const newCards = lib.skill.maokuo_cunsi.newHandCards(trigger, player);
		await lib.skill.maokuo_cunsi.pairFlow(player, newCards);
	},
	onremove(player) {
		delete player.storage.maokuo_cunsi_pairs;
	},
},
// === 存思 ===
// 起始手牌入口：gameDrawEnd 引擎从不派发（只在 gameEvent.js:427 判名），改用原生口径
// global:"phaseBefore" + game.phaseNumber==0（character/onlyOL.js:7362-7374 同款）。
maokuo_cunsi_init: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: "phaseBefore" },
	filter(event, player) {
		if (game.phaseNumber != 0) return false;
		if (!player.isIn() || lib.skill.maokuo_cunsi.suspended()) return false;
		return player.getCards("h").some(card => !lib.skill.maokuo_cunsi.findPair(player, card));
	},
	async content(event, trigger, player) {
		const unpaired = player.getCards("h").filter(card => !lib.skill.maokuo_cunsi.findPair(player, card));
		await lib.skill.maokuo_cunsi.pairFlow(player, unpaired);
	},
},
// === 存思 ===
// 拆分机：up 牌离开手牌区时，其 down 牌置入弃牌堆（自动拆分），并解除配对记录。
maokuo_cunsi_split: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: {
		player: ["loseAfter", "discardAfter"],
		global: ["equipAfter", "addJudgeAfter", "loseAsyncAfter", "addToExpansionAfter"],
	},
	filter(event, player) {
		if (!player.isIn() || lib.skill.maokuo_cunsi.suspended()) {
			return false;
		}
		// 失去牌监听直读 event.hs（R13：getlx:false 时 getl 为空，lose 事件无条件带 hs/es/js/ss）
		return (event.hs || []).some(card => {
			const pair = lib.skill.maokuo_cunsi.findPair(player, card);
			return pair && pair.cards[pair.upIdx] == card;
		});
	},
	async content(event, trigger, player) {
		const lost = (trigger.hs || []).filter(card => {
			const pair = lib.skill.maokuo_cunsi.findPair(player, card);
			return pair && pair.cards[pair.upIdx] == card;
		});
		for (const card of lost) {
			const pair = lib.skill.maokuo_cunsi.findPair(player, card);
			if (!pair) {
				continue;
			}
			const down = pair.cards[1 - pair.upIdx];
			player.storage.maokuo_cunsi_pairs = (player.storage.maokuo_cunsi_pairs || []).filter(p => p != pair);
			// 拆分后清掉两面的「存思」呈现 tag
			[card, down].forEach(c2 => {
				if (!c2) return;
				(c2.gaintag || []).filter(t => typeof t == "string" && t.startsWith("maokuo_cunsi_")).forEach(t => c2.removeGaintag(t));
			});
			if (down && player.getExpansions("maokuo_cunsi").includes(down)) {
				// 朝下的牌进入弃牌堆（中性移出，不产生“弃置”归属）
				await player.lose([down], ui.discardPile);
			}
			player.markSkill("maokuo_cunsi");
		}
	},
},
// === 化道（魏华存） ===
// 出牌阶段限一次，翻转至少一对存思配对（交换朝上/朝下两面）。
// 翻转的对中：两面颜色不同（改变颜色）≥3 → 可令一名角色回复1点体力；两面同色（没有改变颜色）≥3 → 可令一名角色摸两张牌。
maokuo_huadao: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.isIn() && (player.storage.maokuo_cunsi_pairs || []).length > 0;
	},
	filterCard(card, player) {
		// 选择翻转哪“一张”手牌=选它所在的配对（手牌明面必为某对 up 牌）
		const pair = lib.skill.maokuo_cunsi.findPair(player, card);
		return !!pair && pair.cards[pair.upIdx] == card;
	},
	selectCard: [1, Infinity],
	async content(event, trigger, player) {
		// 主动技（enable）不消费 cost 的 cost_data，选择必须写在 content 里
		const res = await player.chooseCard("h", [1, (player.storage.maokuo_cunsi_pairs || []).length], get.prompt2("maokuo_huadao"), "allowChooseAll")
			.set("filterCard", card => lib.skill.maokuo_huadao.filterCard(card, player))
			.set("ai", card => {
				const pair = lib.skill.maokuo_cunsi.findPair(player, card);
				if (!pair) {
					return 0;
				}
				const down = pair.cards[1 - pair.upIdx];
				// 换来的暗面价值更高则翻（换取更好的手牌），并统计颜色差
				return get.value(down) - get.value(card) + (get.color(down) != get.color(card) ? 0.5 : 0);
			})
			.forResult();
		if (!res?.bool || !res.cards?.length) {
			return;
		}
		const cards = res.cards;
		let changed = 0;
		let unchanged = 0;
		lib.maokuo_cunsi_suspend = (lib.maokuo_cunsi_suspend || 0) + 1;
		try {
			for (const card of cards) {
				const pair = lib.skill.maokuo_cunsi.findPair(player, card);
				if (!pair || pair.cards[pair.upIdx] != card) {
					continue;
				}
				const down = pair.cards[1 - pair.upIdx];
				const colorChanged = get.color(down) != get.color(card);
				// 交换两面：旧 up 扣置、旧 down 明置入手牌
				pair.upIdx = 1 - pair.upIdx;
				// 清两面旧 tag，翻转后按新朝面重标（对面牌名/同色异色随之变化）
				[card, down].forEach(c2 => {
					(c2.gaintag || []).filter(t => typeof t == "string" && t.startsWith("maokuo_cunsi_")).forEach(t => c2.removeGaintag(t));
				});
				await player.addToExpansion(card, "gain2").set("gaintag", ["maokuo_cunsi"]);
				await player.gain(down, "gain2");
				lib.skill.maokuo_cunsi.markPairTags(player, down, card);
				if (colorChanged) {
					changed++;
				} else {
					unchanged++;
				}
			}
			player.markSkill("maokuo_cunsi");
			game.log(player, "翻转了", cards.length, "张手牌的存思配对");
		} finally {
			lib.maokuo_cunsi_suspend = (lib.maokuo_cunsi_suspend || 1) - 1;
		}
		if (changed >= 3) {
			const res1 = await player.chooseTarget(`化道：有${changed}张牌改变了颜色，是否令一名角色回复1点体力？`, (c, me, target) => target.isIn() && target.isDamaged())
				.set("ai", target => get.attitude(player, target) * (target.hp < target.maxHp / 2 ? 2 : 1))
				.forResult();
			if (res1?.bool && res1.targets?.length) {
				await res1.targets[0].recover();
			}
		}
		if (unchanged >= 3) {
			const res2 = await player.chooseTarget(`化道：有${unchanged}张牌没有改变颜色，是否令一名角色摸两张牌？`, (c, me, target) => target.isIn())
				.set("ai", target => get.attitude(player, target) * 2)
				.forResult();
			if (res2?.bool && res2.targets?.length) {
				await res2.targets[0].draw(2);
			}
		}
	},
	ai: {
		order: 6,
	},
},
// === 维谷（郝普）——锁定技 ===
// 使用【杀】指定目标后或成为【杀】目标后，双方依次（手牌多者先）各选一个未被选过的项：
// ①将一半（向下取整）手牌移出游戏；②将装备区武器或防具移出游戏。
// 此【杀】结算后：按核对版建议口径——对该目标造成过伤害→目标获得这些牌，否则→使用者获得。
maokuo_weigu: {
	audio: 2,
	forced: true,
	group: ["maokuo_weigu_after"],
	trigger: { global: "useCardToTargeted" },
	filter(event, player) {
		if (event.card?.name != "sha" || !player.isIn()) {
			return false;
		}
		const user = event.player;
		if (!user?.isIn() || user == player) {
			// 自己使用【杀】指定目标
			return user == player && event.targets?.some(t => t != player && t.isIn());
		}
		// 成为其他角色【杀】的目标
		return event.targets?.includes(player);
	},
	async content(event, trigger, player) {
		const user = trigger.player;
		const target = user == player ? trigger.targets.find(t => t != player) : player;
		if (!target?.isIn() || !user.isIn() || user == target) {
			return;
		}
		// 顺序：手牌多者先；相等从使用者开始
		const order = user.countCards("h") >= target.countCards("h") ? [user, target] : [target, user];
		const chosen = [];
		const removed = [];
		for (const cur of order) {
			const half = Math.floor(cur.countCards("h") / 2);
			const eq = cur.getCards("e", card => ["equip1", "equip2"].includes(get.subtype(card)));
			const opts = [];
			if (!chosen.includes(1)) {
				opts.push("1");
			}
			if (!chosen.includes(2) && eq.length) {
				opts.push("2");
			}
			if (!opts.length) {
				continue;
			}
			const res = await cur.chooseControl(opts)
				.set("prompt", `维谷：${cur == player ? "你" : get.translation(cur)}须选择一项（此次未被选择过的）`)
				.set("choiceList", [
					`再将一半（向下取整）的手牌移出游戏（现移出${half}张）`,
					"将装备区里的武器或防具牌移出游戏",
				])
				.set("ai", () => {
					if (half == 0 && opts.includes("1")) {
						return "1";
					}
					return opts.includes("2") ? "2" : "1";
				})
				.forResult();
			const opt = parseInt(res.control);
			chosen.push(opt);
			if (opt == 1) {
				if (half > 0) {
					const res2 = await cur.chooseCard("h", half, true, `维谷：将${half}张手牌移出游戏`)
						.set("ai", card => 6 - get.value(card))
						.forResult();
					if (res2?.cards?.length) {
						await cur.lose(res2.cards, ui.special);
						removed.push(...res2.cards);
					}
				} else {
					game.log(cur, "选择了移出一半手牌（向下取整为0张）");
				}
			} else {
				const res2 = await cur.chooseButton(["维谷：将装备区里的武器或防具牌移出游戏", [eq, "card"]], true)
					.set("ai", button => -get.value(button.link))
					.forResult();
				if (res2?.links?.length) {
					await cur.lose(res2.links, ui.special);
					removed.push(...res2.links);
				}
			}
		}
		if (removed.length) {
			// ⚠️ 旗标必须写进宿主 useCard 事件（trigger 是 useCardToTargeted 子事件，跨事件对象读不到——复核 P0）
			const useEvt = trigger.getParent("useCard") || trigger;
			useEvt._maokuo_weigu_list ??= [];
			useEvt._maokuo_weigu_list.push({ user: user, target: target, cards: removed });
			game.log(removed.length, "张牌被移出游戏");
		}
	},
},
// === 维谷 ===
// 【杀】结算后分配被移出的牌（核对版建议口径：造成过伤害→目标获得，否则→使用者获得）
maokuo_weigu_after: {
	audio: "maokuo_weigu",
	forced: true,
	forceDie: true,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		return (event._maokuo_weigu_list || []).length > 0;
	},
	async content(event, trigger, player) {
		const list = trigger._maokuo_weigu_list || [];
		trigger._maokuo_weigu_list = [];
		for (const entry of list) {
			const { user, target } = entry;
			const cards = entry.cards.filter(card => get.position(card, true) == "s" || ui.special.includes(card));
			if (!cards.length || !user || !target) {
				continue;
			}
			// 造成过伤害：sourceDamage 历史比对牌对象（坑-清单「该次伤害是否造成」条）
			const dealt = user.getHistory("sourceDamage", evt => evt.card === trigger.card && evt.player === target && evt.num > 0).length > 0;
			const winner = dealt ? target : user;
			if (!winner.isIn()) {
				continue;
			}
			await winner.gain(cards, "gain2");
			game.log(winner, "获得了被移出游戏的", cards.length, "张牌");
		}
	},
},
// === 蚩蚩（秦宜禄） ===
// 准备阶段拆分 X+Y+Z（=体力多于你的角色数）：摸牌阶段额定摸牌数+X / 可多使用Y张【杀】 / 手牌上限为Z。
maokuo_chichi: {
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		return player.isIn() && game.countPlayer(cur => cur.isIn() && cur.hp > player.hp) > 0;
	},
	async cost(event, trigger, player) {
		const n = game.countPlayer(cur => cur.isIn() && cur.hp > player.hp);
		const res = await player.chooseBool(`蚩蚩：是否分配 X+Y+Z=${n}（此回合摸牌阶段额定摸牌数+X、可多使用Y张【杀】、手牌上限为Z）？`)
			.set("ai", () => true)
			.forResult();
		event.result = { bool: !!res?.bool, cost_data: { n: n } };
	},
	async content(event, trigger, player) {
		const n = event.cost_data.n;
		const res = await player.chooseNumbers({
			prompt: `蚩蚩：请分配 X、Y、Z（三项之和为${n}）`,
			forced: true,
			optionSum: n,
			list: [
				{ prompt: "此回合摸牌阶段额定摸牌数+（X）", min: 0, max: n },
				{ prompt: "此回合出牌阶段可以多使用（Y）张【杀】", min: 0, max: n },
				{ prompt: "此回合手牌上限为（Z）", min: 0, max: n },
			],
			processAI() {
				const total = get.event().optionSum || 0;
				const x = Math.min(2, total);
				const y = Math.min(1, total - x);
				return [x, y, total - x - y];
			},
		}).forResult();
		const nums = res?.numbers || [0, 0, n];
		const [x, y, z] = nums;
		game.log(player, "分配了蚩蚩：摸牌阶段+", x, "、多使用", y, "张【杀】、手牌上限为", z);
		if (x > 0) {
			player.storage.maokuo_chichi_draw = x;
			player.addTempSkill("maokuo_chichi_draw", "phaseAfter");
		}
		if (y > 0) {
			player.storage.maokuo_chichi_sha = y;
			player.addTempSkill("maokuo_chichi_sha", "phaseAfter");
		}
		// Z 允许为 0：手牌上限“为 Z”是绝对值，0 也要覆盖基础上限
		player.storage.maokuo_chichi_limit = z;
		player.addTempSkill("maokuo_chichi_limit", "phaseAfter");
	},
},
// === 蚩蚩 ===
maokuo_chichi_draw: {
	charlotte: true,
	silent: true,
	popup: false,
	trigger: { player: "phaseDrawBegin2" },
	content(event, trigger, player) {
		trigger.num += player.storage.maokuo_chichi_draw || 0;
	},
	onremove(player) {
		delete player.storage.maokuo_chichi_draw;
	},
},
// === 蚩蚩 ===
maokuo_chichi_sha: {
	charlotte: true,
	silent: true,
	popup: false,
	mod: {
		cardUsable(card, player, num) {
			if (card.name == "sha") {
				return num + (player.storage.maokuo_chichi_sha || 0);
			}
		},
	},
	onremove(player) {
		delete player.storage.maokuo_chichi_sha;
	},
},
// === 蚩蚩 ===
maokuo_chichi_limit: {
	charlotte: true,
	mark: true,
	markimage: "image/card/handcard.png",
	intro: {
		name: "蚩蚩",
		markcount(storage, player) {
			return typeof player.storage.maokuo_chichi_limit == "number" ? player.storage.maokuo_chichi_limit : 0;
		},
		content(storage, player) {
			return `本回合手牌上限为${player.getHandcardLimit()}`;
		},
	},
	mod: {
		maxHandcard(player) {
			return typeof player.storage.maokuo_chichi_limit == "number" ? player.storage.maokuo_chichi_limit : undefined;
		},
	},
	onremove(player) {
		delete player.storage.maokuo_chichi_limit;
	},
},
// === 婆娑（绛树） ===
// 柔音（受伤害分支）与烈音（弃牌分支）由袅袅咏唱开关；X=本回合发动次数（自记账）。
maokuo_posuo: {
	audio: 2,
	group: ["maokuo_posuo_damage", "maokuo_posuo_discard", "maokuo_posuo_end"],
	// 发动计数（本回合内，跨子技能共享）
	countBump(player) {
		const st = player.storage.maokuo_posuo_count;
		if (st && st.turn == game.phaseNumber) {
			st.count++;
		} else {
			player.storage.maokuo_posuo_count = { turn: game.phaseNumber, count: 1 };
		}
	},
	countOf(player) {
		const st = player.storage.maokuo_posuo_count;
		return st && st.turn == game.phaseNumber ? st.count : 0;
	},
	ai: {
		threaten: 1.1,
	},
},
// === 婆娑 ===
// 柔音分支：受到伤害时判定——不为【杀】伤害-1；不为红桃弃置一张牌。
maokuo_posuo_damage: {
	audio: "maokuo_posuo",
	trigger: { player: "damageBegin4" },
	filter(event, player) {
		if (!player.isIn()) {
			return false;
		}
		const mode = player.storage.maokuo_niaoniao_mode;
		return mode == "rou" || mode == "both";
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool("婆娑：是否判定？")
			.set("prompt2", "若结果不为【杀】，此伤害-1；若结果不为红桃，你弃置一张牌")
			.set("ai", () => trigger.num >= 2 || player.hp > 2)
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		lib.skill.maokuo_posuo.countBump(player);
		const result = await player.judge(() => 0).forResult();
		if (result?.name != "sha") {
			trigger.num--;
			game.log(player, "的判定结果不为【杀】，此伤害-1");
		}
		if (result?.suit != "heart") {
			if (player.countCards("he") > 0) {
				await player.chooseToDiscard("he", 1, true, "婆娑：判定结果不为红桃，弃置一张牌");
			}
		}
	},
},
// === 婆娑 ===
// 烈音分支：弃置牌时判定——不为【杀】获得此次弃置的一张牌；不为红桃受到1点伤害。
maokuo_posuo_discard: {
	audio: "maokuo_posuo",
	trigger: { player: "discardAfter" },
	filter(event, player) {
		if (!player.isIn() || !(event.cards || []).length) {
			return false;
		}
		const mode = player.storage.maokuo_niaoniao_mode;
		return mode == "lie" || mode == "both";
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool("婆娑：是否判定？")
			.set("prompt2", "若结果不为【杀】，你获得此次弃置的一张牌；若结果不为红桃，你受到1点伤害")
			.set("ai", () => trigger.cards.length >= 2)
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		lib.skill.maokuo_posuo.countBump(player);
		const result = await player.judge(() => 0).forResult();
		if (result?.name != "sha") {
			// 获得此次弃置的一张牌（仍在弃牌堆里的）
			const available = (trigger.cards || []).filter(card => Array.from(ui.discardPile.childNodes).includes(card));
			if (available.length) {
				const res = await player.chooseButton(["婆娑：获得此次弃置的一张牌", [available, "card"]], true)
					.set("ai", button => get.value(button.link))
					.forResult();
				if (res?.links?.length) {
					await player.gain(res.links, "gain2");
				}
			}
		}
		if (result?.suit != "heart") {
			await player.damage("nosource", 1);
			game.log(player, "的判定结果不为红桃，受到了1点无来源伤害");
		}
	},
},
// === 婆娑 ===
// 此回合结束时兑现：柔音摸X张；烈音令至多X名已受伤角色各回复1点体力。
maokuo_posuo_end: {
	audio: "maokuo_posuo",
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: "phaseEnd" },
	filter(event, player) {
		if (!player.isIn()) {
			return false;
		}
		const mode = player.storage.maokuo_niaoniao_mode;
		return (mode == "rou" || mode == "both" || mode == "lie") && lib.skill.maokuo_posuo.countOf(player) > 0;
	},
	async content(event, trigger, player) {
		const mode = player.storage.maokuo_niaoniao_mode;
		const x = lib.skill.maokuo_posuo.countOf(player);
		// 〔柔音〕：你可以摸X张牌
		if (mode == "rou" || mode == "both") {
			const res = await player.chooseBool(`婆娑：你是否摸${x}张牌？（你此回合发动了${x}次）`)
				.set("ai", () => x >= 2 || player.countCards("h") < 2)
				.forResult();
			if (res?.bool) {
				await player.draw(x);
			}
		}
		// 〔烈音〕：你可以令至多X名已受伤的角色各回复1点体力
		if ((mode == "lie" || mode == "both") && game.hasPlayer(cur => cur.isIn() && cur.isDamaged())) {
			const res = await player.chooseTarget([0, x], `婆娑：令至多${x}名已受伤的角色各回复1点体力`, (card, me, target) => target.isIn() && target.isDamaged())
				.set("ai", target => get.attitude(player, target) * (target.hp < 2 ? 2 : 1))
				.forResult();
			if (res?.bool && res.targets?.length) {
				for (const t of res.targets) {
					if (t.isIn() && t.isDamaged()) {
						await t.recover();
					}
				}
			}
		}
	},
},
// === 草草（秦宜禄） ===
// 每回合限一次，造成或受到伤害时可展示所有手牌：黑多伤害+1，红多伤害-1，相等无效果。
maokuo_caocao: {
	audio: 2,
	usable: 1,
	trigger: {
		source: "damageBegin4",
		player: "damageBegin4",
	},
	filter(event, player) {
		// 同一伤害事件只结算一次（source/player 双角色挂同事件，髡冠同款）；每回合限一次由 usable:1 托管（取证题11）
		return !event._maokuo_caocao_done && player.isIn();
	},
	async cost(event, trigger, player) {
		const hand = player.getCards("h");
		const black = hand.filter(card => get.color(card) == "black").length;
		const red = hand.filter(card => get.color(card) == "red").length;
		const res = await player.chooseBool("草草：是否展示所有手牌？")
			.set("prompt2", `若黑色牌多，此伤害+1；若红色牌多，此伤害-1（你的手牌：黑${black}红${red}）`)
			.set("ai", () => (trigger.source == player ? (black > red ? 1 : 0) : (red > black ? 1 : 0)))
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		// 去重旗标写进宿主伤害事件（content 的 event 是技能事件、trigger 才是伤害事件——复核 P2）
		trigger._maokuo_caocao_done = true;
		await player.showHandcards();
		const hand = player.getCards("h");
		const black = hand.filter(card => get.color(card) == "black").length;
		const red = hand.filter(card => get.color(card) == "red").length;
		if (black > red) {
			trigger.num++;
			game.log(player, "展示的手牌黑色牌多，此伤害+1");
		} else if (red > black) {
			trigger.num--;
			game.log(player, "展示的手牌红色牌多，此伤害-1");
		} else {
			game.log(player, "展示的手牌颜色数量相等，无效果");
		}
	},
},
// === 守一（魏华存） ===
// 结束阶段或受到1点伤害时，可弃置一张手牌，从弃牌堆获得此次拆分置入的两张牌（再次触发存思）。
maokuo_shouyi: {
	audio: 2,
	trigger: { player: ["phaseJieshuBegin", "damage"] },
	filter(event, player, name) {
		if (!player.isIn() || player.countCards("h") == 0) {
			return false;
		}
		if (name == "damage") {
			return event.num == 1;
		}
		return true;
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool(get.prompt("maokuo_shouyi"))
			.set("prompt2", "弃置一张手牌，从弃牌堆获得此次置入的两张牌")
			.set("ai", () => player.countCards("h") >= 1 && trigger.name != "damage")
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		const res = await player.chooseCard("h", get.prompt2("maokuo_shouyi"), "allowChooseAll")
			.set("filterCard", card => true)
			.set("ai", card => 5 - get.value(card))
			.forResult();
		if (!res?.bool || !res.cards?.length) {
			return;
		}
		const card = res.cards[0];
		// 先记下配对（拆分机会在弃置时解除记录并把朝下的牌送进弃牌堆）
		const pair = lib.skill.maokuo_cunsi.findPair(player, card);
		const mate = pair ? pair.cards[1 - pair.upIdx] : null;
		await player.discard([card]);
		const inDiscard = Array.from(ui.discardPile.childNodes);
		const cards = [card, mate].filter(c => c && inDiscard.includes(c));
		if (cards.length) {
			await player.gain(cards, "gain2");
			game.log(player, "从弃牌堆获得了", cards.length, "张牌");
		}
	},
},
// === 穷途（阮籍）——锁定技 ===
// 弃牌阶段结束时：未弃置过牌或弃置多于两张 → 下次受到伤害值改为2；否则（弃1~2张）改为0。
maokuo_qiongtu: {
	audio: 2,
	forced: true,
	mark: true,
	marktext: "途",
	intro: {
		name: "穷途",
		content(storage, player) {
			const v = player.storage.maokuo_qiongtu_next;
			if (typeof v == "number") {
				return `下次受到伤害时，伤害值改为${v}`;
			}
			return "尚未记录下次伤害值";
		},
	},
	group: ["maokuo_qiongtu_effect"],
	trigger: { player: "phaseDiscardEnd" },
	filter(event, player) {
		return player.isIn();
	},
	async content(event, trigger, player) {
		// 本弃牌阶段弃置的牌数：lose 历史里 type=="discard"（取证题17：discard→lose 子事件 type=discard）。
		// trigger 即 phaseDiscard 事件本体（裸名派发宿主，event.name=="phaseDiscard"——R96：向上 getParent 反而落空）
		const phaseEvt = trigger;
		let n = 0;
		player.getHistory("lose", evt => {
			if (evt.type != "discard") {
				return false;
			}
			const ph = evt.getParent("phaseDiscard");
			if (!ph || ph.name != "phaseDiscard" || ph !== phaseEvt) {
				return false;
			}
			n += (evt.cards || []).length;
			return false;
		});
		const value = (n == 0 || n > 2) ? 2 : 0;
		player.storage.maokuo_qiongtu_next = value;
		player.markSkill("maokuo_qiongtu");
		game.log(player, "于此弃牌阶段弃置了", n, "张牌，下次受到伤害时伤害值改为", value);
	},
},
// === 穷途 ===
maokuo_qiongtu_effect: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "damageBegin4" },
	filter(event, player) {
		return typeof player.storage.maokuo_qiongtu_next == "number" && player.isIn();
	},
	content(event, trigger, player) {
		// 绝对改值：原生范本 sasami_gongqing（character/key.js:10023）damageBegin4 trigger.num = 1
		trigger.num = player.storage.maokuo_qiongtu_next;
		game.log(player, "下次受到伤害的伤害值改为", trigger.num);
		delete player.storage.maokuo_qiongtu_next;
		player.unmarkSkill("maokuo_qiongtu");
		player.markSkill("maokuo_qiongtu");
	},
},
// === 闻风（郝普） ===
// 一名角色使用【诸葛连弩】时，其可观看你的手牌，令你与一名其他角色交换手牌。
maokuo_wenfeng: {
	audio: 2,
	trigger: { global: "useCard" },
	filter(event, player) {
		if (get.name(event.card) != "zglx" || !player.isIn()) {
			return false;
		}
		return !!event.player?.isIn?.() && player.countCards("h") > 0;
	},
	async cost(event, trigger, player) {
		const user = trigger.player;
		const res = await user.chooseBool(`闻风：是否观看${player == user ? "你" : get.translation(player)}的手牌？`)
			.set("prompt2", "然后你可以令其与一名其他角色交换手牌")
			.set("ai", () => get.attitude(user, player) < 0 || user == player)
			.forResult();
		event.result = { bool: !!res?.bool, cost_data: { user: user } };
	},
	async content(event, trigger, player) {
		const user = event.cost_data.user;
		// 观看（颂酒同款 viewCards）
		await user.viewCards(`闻风：${get.translation(player)}的手牌`, player.getCards("h"));
		const res = await user.chooseBool(`闻风：是否令${player == user ? "你" : get.translation(player)}与一名其他角色交换手牌？`)
			.set("ai", () => get.attitude(user, player) < 0)
			.forResult();
		if (!res?.bool) {
			return;
		}
		const res2 = await user.chooseTarget(`闻风：选择一名角色与${get.translation(player)}交换手牌`, (card, me, target) => target != player && target.isIn())
			.set("ai", target => (get.attitude(user, player) > 0 ? get.attitude(user, target) : -get.attitude(user, target)))
			.forResult();
		if (res2?.bool && res2.targets?.length) {
			await player.swapHandcards(res2.targets[0]);
			game.log(player, "与", res2.targets[0], "交换了手牌");
		}
	},
},
// === 启事（山涛） ===
// 出牌阶段限一次，令至少一名角色各选择：①将其区域里的一张牌交给你；②与你交换手牌。
maokuo_qishi: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.isIn() && game.hasPlayer(cur => cur != player && cur.isIn());
	},
	async content(event, trigger, player) {
		// 主动技无 viewAs，目标由 content 里 chooseTarget 一次性选清（顶层 filterTarget/selectTarget 不适用于无牌主动技，
		// 否则会出现“选完目标又重开选择”的问题）
		const res = await player.chooseTarget("启事：令至少一名角色各选择一项", [1, Infinity], (c, me, target) => target != me && target.isIn())
			.set("ai", target => (get.attitude(player, target) < 0 ? 1 : -1))
			.forResult();
		if (!res?.bool || !res.targets?.length) return;
		for (const target of res.targets) {
			if (!target.isIn() || !player.isIn()) {
				continue;
			}
			const canGive = target.countCards("he") > 0;
			const opts = [];
			const texts = {};
			if (canGive) {
				opts.push("give");
				texts.give = "将其区域里的一张牌交给" + (target == player ? "你" : get.translation(player));
			}
			opts.push("swap");
			texts.swap = "与" + (target == player ? "你" : get.translation(player)) + "交换手牌";
			const res2 = await target.chooseControl(opts)
				.set("prompt", `启事：${target == player ? "你" : get.translation(player)}令你选择一项`)
				.set("choiceList", opts.map(o => texts[o]))
				.set("ai", () => {
					// 比较两项对“被选目标”的得失：give=失去一张最便宜的牌；swap=失去自己手牌、得到山涛手牌
					if (!canGive) return "swap";
					const myCards = target.getCards("h");
					const mineVal = myCards.reduce((a, c) => a + get.value(c), 0);
					const hisVal = player.getCards("h").reduce((a, c) => a + get.value(c), 0);
					const swapGain = hisVal - mineVal; // >0 交换对自己有利
					const cheapest = myCards.length ? Math.min(...myCards.map(c => get.value(c))) : 0;
					return swapGain > -cheapest ? "swap" : "give";
				})
				.forResult();
			if (res2?.control == "give") {
				const res3 = await target.chooseCard("he", true, 1, `启事：将你区域里的一张牌交给${get.translation(player)}`)
					.set("ai", card => -get.value(card))
					.forResult();
				if (res3?.cards?.length) {
					await target.give(res3.cards, player);
				}
			} else if (res2?.control == "swap") {
				await target.swapHandcards(player);
				game.log(target, "与", player, "交换了手牌");
			}
		}
	},
	ai: {
		order: 7,
		result: {
			player(player, target) {
				// 让手牌多的敌人交牌/换牌
				return target.countCards("h") > player.countCards("h") ? 1 : 0;
			},
		},
	},
},
// === 澈境（向秀） ===
// 判定或弃牌阶段开始前，可展示所有手牌：两色数量相等可跳过此阶段；否则可重铸一或两张牌。
maokuo_chejing: {
	audio: 2,
	trigger: { player: ["phaseJudgeBefore", "phaseDiscardBefore"] },
	filter(event, player) {
		return player.isIn() && player.countCards("h") > 0;
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool("澈境：是否展示所有手牌？")
			.set("prompt2", "若其中两种颜色的牌数量相等，你可跳过此阶段；否则你可重铸一或两张牌")
			.set("ai", () => {
				const hand = player.getCards("h");
				const red = hand.filter(card => get.color(card) == "red").length;
				return red * 2 == hand.length;
			})
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		await player.showHandcards();
		const hand = player.getCards("h");
		const red = hand.filter(card => get.color(card) == "red").length;
		const black = hand.filter(card => get.color(card) == "black").length;
		if (red == black) {
			const judgePhase = event.triggername == "phaseJudgeBefore";
			const res = await player.chooseBool(`澈境：两种颜色的牌数量相等（红${red}黑${black}），是否跳过${judgePhase ? "判定" : "弃牌"}阶段？`)
				.set("ai", () => (judgePhase ? player.countCards("j") == 0 : true))
				.forResult();
			if (res?.bool) {
				trigger.cancel();
				game.log(player, "跳过了此阶段");
			}
		} else {
			const n = Math.min(2, player.countCards("h", lib.filter.cardRecastable));
			if (n <= 0) {
				return;
			}
			const res = await player.chooseCard("h", [1, n], `澈境：你可以重铸一或两张牌（红${red}黑${black}，数量不等）`, lib.filter.cardRecastable)
				.set("ai", card => 4 - get.value(card))
				.forResult();
			if (res?.bool && res.cards?.length) {
				await player.recast(res.cards);
			}
		}
	},
},
// === 妒害（郭槐） ===
// 一名角色的结束阶段，对使用、打出、展示或弃置过与你本回合同四类动作牌名相同的牌的其他角色各造成1点伤害。
maokuo_duhai: {
	audio: 2,
	trigger: { global: "phaseJieshuBegin" },
	filter(event, player) {
		if (!player.isIn()) {
			return false;
		}
		return game.hasPlayer(cur => cur != player && cur.isIn() && lib.skill.maokuo_duhai.matchNames(player, cur));
	},
	// 某角色本回合的「失去或展示过的牌名」集合。
	// 「失去」：只用 actionHistory 里真实存在的 "lose" 分类（useCard/respond/skipped/lose/gain/...
	// 里没有 loseAsync，取 "loseAsync" 会 undefined → 崩）。lose 覆盖所有 type 的失去
	// （使用/打出后离手、弃置、给他人、装备、判定等都会产生 lose）。批量失去(loseToSpecial/木马)
	// 的牌也会以子 lose 归入该玩家的 lose 历史，故 lose 一类足够。
	// 「展示」：showCards 走 everything 全局历史。
	nameSet(target) {
		const names = new Set();
		const addCards = list => (list || []).forEach(card => card && names.add(get.name(card)));
		target.getHistory("lose", evt => {
			addCards(evt.cards);
			addCards(evt.hs);
			addCards(evt.es);
			addCards(evt.js);
			return false;
		});
		game.getGlobalHistory("everything", evt => {
			if (evt.name == "showCards" && evt.player == target) {
				addCards(evt.cards);
			}
			return false;
		});
		names.delete(undefined);
		return names;
	},
	matchNames(player, target) {
		const mine = lib.skill.maokuo_duhai.nameSet(player);
		if (!mine.size) {
			return false;
		}
		for (const name of lib.skill.maokuo_duhai.nameSet(target)) {
			if (mine.has(name)) {
				return true;
			}
		}
		return false;
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool("妒害：是否对失去或展示过与你本回合失去或展示过的牌牌名相同的牌的其他角色各造成1点伤害？")
			.set("ai", () => game.hasPlayer(cur => cur != player && cur.isIn() && get.attitude(player, cur) < 0 && lib.skill.maokuo_duhai.matchNames(player, cur)))
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		const targets = game.filterPlayer(cur => cur != player && cur.isIn() && lib.skill.maokuo_duhai.matchNames(player, cur));
		for (const target of targets) {
			if (target.isIn()) {
				await target.damage(player, 1);
			}
		}
	},
},
// === 遗祸（郭槐） ===
// 出牌阶段展示一张红桃牌置入一名角色判定区，视为【闪电】；有该牌角色的准备阶段，其相邻角色须弃置一张牌或令郭槐摸一张牌。
// 用自定义 special_delay 牌（noEffect）：占【闪电】判定槽却跳过 phaseJudge 自动结算 → 判定后一直留在判定区；
// 真正的闪电判定由 maokuo_yihuo_judge 在判定阶段手动执行（黑桃2-9 → 3 点雷电伤害）。
maokuo_yihuo: {
	audio: 2,
	group: ["maokuo_yihuo_ready", "maokuo_yihuo_judge"],
	enable: "phaseUse",
	filter(event, player) {
		return player.isIn() && player.countCards("h", card => get.suit(card) == "heart") > 0 && game.hasPlayer(cur => cur.isIn() && cur.canAddJudge({ name: "maokuo_yihuo_card", isCard: true }));
	},
	filterCard(card) {
		return get.suit(card) == "heart";
	},
	selectCard: 1,
	filterTarget(card, player, target) {
		// card 参数是 viewAs 虚拟牌；实体素材从 ui.selected.cards 取（complexSelect 会整体重查）
		const material = ui.selected.cards?.[0];
		const vcard = get.autoViewAs({ name: "maokuo_yihuo_card", isCard: true }, material ? [material] : []);
		return target.isIn() && player.canAddJudge(vcard);
	},
	check(card) {
		return 6 - get.value(card);
	},
	async content(event, trigger, player) {
		const card = event.cards[0];
		const target = event.targets[0];
		// 二次校验：目标判定区已有【闪电】或遗祸牌（同占 shandian 判定槽）则不可放
		if (!target.isIn() || !target.canAddJudge({ name: "maokuo_yihuo_card", isCard: true })) return;
		await player.showCards([card], get.translation(player) + "发动了【遗祸】");
		// eternal_ 前缀：手牌→判定区的 lose 会剥非 eternal gaintag（取证题15/记忆）
		card.addGaintag("eternal_maokuo_yihuo_tag");
		// 作为一张特殊【闪电】置入目标判定区（judgeSlots=shandian；noEffect 不自动结算，判定后留判定区）
		await target.addJudge({ name: "maokuo_yihuo_card", isCard: true }, [card]);
		game.log(player, "将一张红桃牌作为【遗祸】（闪电）置入", target, "的判定区");
	},
	ai: {
		order: 6,
	},
},
// === 遗祸 ===
maokuo_yihuo_ready: {
	audio: "maokuo_yihuo",
	forced: true,
	trigger: { global: "phaseZhunbeiBegin" },
	filter(event, player) {
		if (!player.isIn()) {
			return false;
		}
		const target = event.player;
		if (!target?.isIn()) {
			return false;
		}
		return target.getCards("j").some(card => card.hasGaintag?.("eternal_maokuo_yihuo_tag") || (card.cards || []).some(base => base?.hasGaintag?.("eternal_maokuo_yihuo_tag")));
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		// 相邻座位对（天堑 aiPairs 同款口径：getNext/getPrevious 存活链）；按字面含郭槐自己（复核 P2：他自然选“令你摸一张牌”）
		const neighbors = [target.getNext(), target.getPrevious()].filter(cur => cur && cur != target && cur.isIn());
		const list = [...new Set(neighbors)];
		for (const cur of list) {
			if (!cur.isIn()) {
				continue;
			}
			const canDiscard = cur.countCards("he") > 0;
			const opts = [];
			if (canDiscard) {
				opts.push("弃置一张牌");
			}
			opts.push("令郭槐摸一张牌");
			const res = await cur.chooseControl(opts)
				.set("prompt", `遗祸：${get.translation(target)}的判定区里有“遗祸”牌，${cur == player ? "你" : get.translation(cur)}须选择一项`)
				.set("ai", () => {
					// 对郭槐（技能拥有者）友好则让他摸牌（含郭槐自己）；敌对则弃自己一张牌，不给其摸牌
					const friendly = cur == player || get.attitude(cur, player) > 0;
					if (friendly) return "令郭槐摸一张牌";
					return canDiscard ? "弃置一张牌" : "令郭槐摸一张牌";
				})
				.forResult();
			if (res?.control == "弃置一张牌") {
				await cur.chooseToDiscard("he", 1, true, "遗祸：弃置一张牌");
			} else {
				await player.draw();
				game.log(cur, "令", player, "摸了一张牌");
			}
		}
	},
},
// === 遗祸 ===
// 判定阶段：对判定区里的「遗祸」牌按【闪电】规则手动判定（黑桃2-9 → 3 点雷电伤害），
// 判完牌仍留在判定区（noEffect 牌不被 phaseJudge 自动结算/弃置/下移）。
maokuo_yihuo_judge: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: "phaseJudgeBegin" },
	filter(event, player) {
		const target = event.player;
		if (!target || !target.isIn()) return false;
		return target.getCards("j").some(card => card.hasGaintag?.("eternal_maokuo_yihuo_tag") || (card.cards || []).some(base => base?.hasGaintag?.("eternal_maokuo_yihuo_tag")));
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const list = target.getCards("j").filter(card => card.hasGaintag?.("eternal_maokuo_yihuo_tag") || (card.cards || []).some(base => base?.hasGaintag?.("eternal_maokuo_yihuo_tag")));
		for (const card of list) {
			if (!target.isIn()) break;
			if (get.position(card, true) != "j") continue;
			// 按【闪电】判定（card.judge 已定义黑桃2-9 命中）；result.bool===false = 命中（原生闪电 effect 口径）
			const result = await target.judge(card).forResult();
			if (result && result.bool === false) {
				await target.damage(3, "thunder", "nosource");
			}
		}
	},
},
// === 何来（嵇康） ===
// 以你为目标的牌被使用时（处理区没有“何来”牌），可中止该牌的结算（牌留处理区）；
// 出牌阶段，可继续结算之。
maokuo_helai: {
	audio: 2,
	group: ["maokuo_helai_resume"],
	mark: true,
	marktext: "何",
	intro: {
		name: "何来",
		content(storage, player) {
			const d = player.storage.maokuo_helai_data;
			return d?.card ? `已中止【${get.translation(d.card.name)}】的结算，出牌阶段可继续结算之` : "没有挂起的牌";
		},
	},
	trigger: { global: "useCard0" },
	filter(event, player) {
		if (event._maokuo_helai_resume || !player.isIn()) {
			return false;
		}
		if (player.storage.maokuo_helai_data) {
			return false;
		}
		return event.targets?.includes(player) && (event.cards || []).length > 0;
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool(`何来：是否中止【${get.translation(trigger.card)}】的结算？`)
			.set("prompt2", "此牌置于处理区，你于出牌阶段可以继续结算之")
			.set("ai", () => {
				// 敌方指向自己的关键牌（杀/伤害锦囊）倾向中止
				return ["sha", "juedou", "nanman", "wanjian", "huogong"].includes(trigger.card.name);
			})
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		// noOrdering：牌无限期停在处理区，不被 orderingDiscard 收走（取证题1，content.js:2634 守卫）
		trigger.noOrdering = true;
		player.storage.maokuo_helai_data = {
			card: trigger.card,
			cards: (trigger.cards || []).slice(0),
			targets: (trigger.targets || []).slice(0),
			user: trigger.player,
		};
		trigger.cancel();
		player.markSkill("maokuo_helai");
		game.log(player, "中止了", trigger.card, "的结算，此牌置于处理区");
	},
	onremove(player) {
		const d = player.storage.maokuo_helai_data;
		if (d) {
			const cards = (d.cards || []).filter(card => get.position(card, true) == "o");
			if (cards.length) {
				game.cardsDiscard(cards);
			}
			delete player.storage.maokuo_helai_data;
		}
	},
},
// === 何来 ===
maokuo_helai_resume: {
	audio: "maokuo_helai",
	// 描述「出牌阶段，你可以继续结算之」→ 出牌阶段主动技（按钮栏出现，点一下即继续结算）
	enable: "phaseUse",
	filter(event, player) {
		const d = player.storage.maokuo_helai_data;
		if (!d || !player.isIn()) {
			return false;
		}
		// 守卫：牌仍在处理区（取证：player.js:9457 addJudgeNext 同款）
		return (d.cards || []).some(card => get.position(card, true) == "o");
	},
	prompt() {
		const d = get.player()?.storage?.maokuo_helai_data;
		return d?.card ? `何来：继续结算【${get.translation(d.card.name)}】` : "何来：继续结算挂起的牌";
	},
	async content(event, trigger, player) {
		const d = player.storage.maokuo_helai_data;
		if (!d) return;
		const cards = (d.cards || []).filter(card => get.position(card, true) == "o");
		const targets = (d.targets || []).filter(t => t.isIn());
		delete player.storage.maokuo_helai_data;
		player.unmarkSkill("maokuo_helai");
		if (!cards.length) {
			return;
		}
		game.log(player, "继续结算", d.card);
		// 重演：以原使用者名义完整 useCard（伤害来源/奖惩归属不变——复核 P1-4；不重复记次/记日志；目标死亡由引擎逐目标检查跳过）
		await d.user.useCard(d.card, cards, targets, "maokuo_helai").set("addCount", false).set("log", false).set("_maokuo_helai_resume", true);
	},
	ai: {
		// 出牌阶段按钮排序；只有在挂着牌时有意义（filter 保证）
		result: { player: 1 },
	},
},
// === 吾往（嵇康） ===
// 你的回合内，开始处理基本牌或普通锦囊牌的使用结算之前，可令之改为对除所有目标角色外的角色结算。
maokuo_wuwang: {
	audio: 2,
	trigger: { player: "useCard2" },
	filter(event, player) {
		if (!player.isIn() || !event.targets || event.targets.length == 0) {
			return false;
		}
		// 你的回合内
		const phase = event.getParent("phase");
		if (!phase || phase.player != player) {
			return false;
		}
		if (!["basic", "trick"].includes(get.type(event.card))) {
			return false;
		}
		// 候选：除原目标与自己外的存活角色
		return lib.skill.maokuo_wuwang.getCandidates(event, player).length > 0;
	},
	getCandidates(event, player) {
		return game.filterPlayer(cur => cur.isIn() && cur != player && !event.targets.includes(cur));
	},
	async cost(event, trigger, player) {
		const candidates = lib.skill.maokuo_wuwang.getCandidates(trigger, player);
		const res = await player.chooseBool(`吾往：是否令【${get.translation(trigger.card)}】改为对除所有目标角色外的角色结算？`)
			.set("prompt2", `将改为对${candidates.map(cur => get.translation(cur)).join("、")}结算`)
			.set("ai", () => {
				if (!["sha", "juedou", "nanman", "wanjian", "huogong"].includes(trigger.card.name)) {
					return false;
				}
				const enemy = candidates.filter(cur => get.attitude(player, cur) < 0).length;
				const friend = candidates.filter(cur => get.attitude(player, cur) > 0).length;
				return enemy > friend;
			})
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		const candidates = lib.skill.maokuo_wuwang.getCandidates(trigger, player);
		trigger.targets.length = 0;
		trigger.targets.push(...candidates);
		game.log(trigger.card, "改为对", ...candidates, "结算");
	},
},
// === 注玄（向秀） ===
// 每回合限一次，当黑色基本牌或黑色普通锦囊牌指定除你外的角色时，你可成为此牌的第一个目标；
// 对你的结算过程之后，你可令一名其他角色获得此牌和此期间内你置入弃牌堆的牌。
maokuo_zhuxuan: {
	audio: 2,
	usable: 1,
	group: ["maokuo_zhuxuan_after"],
	trigger: { global: "useCardToTarget" },
	filter(event, player) {
		if (!player.isIn() || event._maokuo_zhuxuan) {
			return false;
		}
		const useEvt = event.getParent("useCard");
		if (!useEvt || useEvt.targets?.includes(player)) {
			return false;
		}
		return get.color(useEvt.card) == "black" && ["basic", "trick"].includes(get.type(useEvt.card));
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool(get.prompt("maokuo_zhuxuan"))
			.set("prompt2", "你成为此牌的第一个目标；对你的结算过程之后，你可令一名其他角色获得此牌和你此期间置入弃牌堆的牌")
			.set("ai", () => trigger.cards.length > 0)
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		const useEvt = trigger.getParent("useCard");
		// 插入为第一个目标并冻结座位序（取证题2：unshift + fixedSeat，原生 congjian/浮掠同链）
		useEvt.targets.unshift(player);
		useEvt.fixedSeat = true;
		useEvt._maokuo_zhuxuan = player;
		useEvt._maokuo_zhuxuan_mark = player.getHistory("lose").length;
		game.log(player, "成为了此牌的第一个目标");
	},
},
// === 注玄 ===
maokuo_zhuxuan_after: {
	audio: "maokuo_zhuxuan",
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		if (event._maokuo_zhuxuan != player || !player.isIn()) {
			return false;
		}
		return lib.skill.maokuo_zhuxuan_after.collectCards(event, player).length > 0;
	},
	collectCards(event, player) {
		const inDiscard = Array.from(ui.discardPile.childNodes);
		const cards = (event.cards || []).filter(card => inDiscard.includes(card));
		const mark = event._maokuo_zhuxuan_mark || 0;
		const history = player.getHistory("lose");
		for (let i = mark; i < history.length; i++) {
			(history[i].cards || []).forEach(card => {
				if (inDiscard.includes(card) && !cards.includes(card)) {
					cards.push(card);
				}
			});
		}
		return cards;
	},
	async cost(event, trigger, player) {
		const cards = lib.skill.maokuo_zhuxuan_after.collectCards(trigger, player);
		const res = await player.chooseBool(`注玄：是否令一名其他角色获得${cards.length}张牌（此牌与你此期间置入弃牌堆的牌）？`)
			.set("ai", () => game.hasPlayer(cur => cur != player && cur.isIn() && get.attitude(player, cur) > 0))
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		const cards = lib.skill.maokuo_zhuxuan_after.collectCards(trigger, player);
		if (!cards.length) {
			return;
		}
		const res = await player.chooseTarget("注玄：选择一名其他角色获得这些牌", (card, me, target) => target != me && target.isIn())
			.set("ai", target => get.attitude(player, target) * (cards.length + 1))
			.forResult();
		if (res?.bool && res.targets?.length) {
			await res.targets[0].gain(cards, "gain2");
			game.log(res.targets[0], "获得了", cards.length, "张牌");
		}
	},
},
// === 瞻明（王戎） ===
// 当其他角色对你／你对其他角色使用牌时，可令该目标角色亮出至少一张不能响应此牌的手牌；
// 除非使用者亮出等量的手牌，否则此牌对其无效。
maokuo_zhanming: {
	audio: 2,
	trigger: {
		target: "useCardToTargeted",
		player: "useCardToTargeted",
	},
	filter(event, player) {
		if (event._maokuo_zhanming) {
			return false;
		}
		const user = event.player;
		const target = event.target;
		if (!user?.isIn() || !target?.isIn() || user == target) {
			return false;
		}
		return (user == player && target != player) || (target == player && user != player);
	},
	async cost(event, trigger, player) {
		const target = trigger.target;
		const res = await player.chooseBool(get.prompt("maokuo_zhanming"))
			.set("prompt2", `令${target == player ? "你" : get.translation(target)}亮出至少一张不能响应此牌的手牌；除非使用者亮出等量的手牌，否则此牌对其无效`)
			.set("ai", () => {
				// 指向敌人的牌愿意付出亮牌代价维持生效；指向自己的牌乐于让它失效
				return trigger.player == player;
			})
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		trigger._maokuo_zhanming = true;
		const user = trigger.player;
		const target = trigger.target;
		const useEvt = trigger.getParent("useCard") || trigger;
		// "不能响应此牌的手牌"：canRespond 权威判定（取证题10）
		const unable = target.getCards("h").filter(card => !target.canRespond(useEvt, card));
		if (!unable.length) {
			game.log(target, "没有不能响应此牌的手牌");
			return;
		}
		const revealRes = await target.chooseButton([`瞻明：明置至少一张不能响应此牌的手牌`, [unable, "card"]], true, [1, unable.length])
			.set("ai", button => (target == player ? get.value(button.link) : 6 - get.value(button.link)))
			.forResult();
		if (!revealRes?.bool || !revealRes.links?.length) {
			return;
		}
		const revealed = revealRes.links;
		// 明置（牌留手牌区、对所有人持续可见），而非一次性“亮出”
		await target.addShownCards(revealed, "visible_maokuo_zhanming");
		// 使用者选择：明置等量手牌维持生效，或放任此牌对该目标无效
		const equalRes = await user.chooseBool(`瞻明：是否明置${revealed.length}张手牌？`)
			.set("prompt2", `否则【${get.translation(trigger.card)}】对${target == player ? "你" : get.translation(target)}无效`)
			.set("ai", () => {
				const val = revealed.reduce((s, c) => s + get.value(c), 0);
				return user == player ? get.effect(target, trigger.card, user, user) > val : get.effect(target, trigger.card, user, user) < -val;
			})
			.forResult();
		if (equalRes?.bool) {
			const handRes = await user.chooseCard("h", revealed.length, true, `瞻明：明置${revealed.length}张手牌`)
				.set("ai", card => 6 - get.value(card))
				.forResult();
			if (handRes?.cards?.length) {
				await user.addShownCards(handRes.cards, "visible_maokuo_zhanming");
				game.log(user, "明置了等量的手牌，此牌维持生效");
				return;
			}
		}
		// 单目标无效：excluded 数组（取证：content.js:9530 消费点，国战无懈同款）
		if (!Array.isArray(useEvt.excluded)) {
			useEvt.excluded = [];
		}
		useEvt.excluded.push(target);
		game.log(`【${get.translation(trigger.card)}】对${get.translation(target)}无效`);
	},
},
// === 浮沈（王戎） ===
// 其他角色的回合结束时，比较可见手牌数：其多→选其中一张令其使用；其少→重铸至少一张你的可见手牌；相等→交换你与其的可见手牌。
maokuo_fushen: {
	audio: 2,
	trigger: { global: "phaseEnd" },
	filter(event, player) {
		if (!player.isIn() || event.player == player || !event.player?.isIn?.()) {
			return false;
		}
		const them = event.player;
		const theirShown = them.countShownCards();
		const myShown = player.countShownCards();
		if (theirShown > myShown) {
			// 其多：需有一张其可使用的可见手牌
			return them.getShownCards().some(card => them.canUse(card, them));
		}
		if (theirShown < myShown) {
			// 其少：需有至少一张可重铸的可见手牌
			return player.getShownCards().some(card => player.canRecast(card));
		}
		return myShown + theirShown > 0;
	},
	async cost(event, trigger, player) {
		const them = trigger.player;
		const theirShown = them.countShownCards();
		const myShown = player.countShownCards();
		const text = theirShown > myShown ? "选择其中一张令其使用" : (theirShown < myShown ? "重铸至少一张你的明置牌" : "交换你与其的明置牌");
		const res = await player.chooseBool(`浮沈：其明置牌${theirShown > myShown ? "多" : (theirShown < myShown ? "少" : "数与你相等")}，是否${text}？`)
			.set("ai", () => {
				if (theirShown > myShown) {
					return get.attitude(player, them) < 0;
				}
				return true;
			})
			.forResult();
		event.result = { bool: !!res?.bool, cost_data: { them: them, theirShown: theirShown, myShown: myShown } };
	},
	async content(event, trigger, player) {
		const { them, theirShown, myShown } = event.cost_data;
		if (theirShown > them.countShownCards() || myShown != player.countShownCards()) {
			return;
		}
		if (theirShown > myShown) {
			const usable = them.getShownCards().filter(card => them.canUse(card, them));
			const res = await player.chooseButton(["浮沈：选择其中一张令其使用", [usable, "card"]], true)
				.set("ai", button => -get.value(button.link) * (get.attitude(player, them) < 0 ? 1 : -1))
				.forResult();
			if (res?.links?.length) {
				const card = res.links[0];
				game.log(them, "使用了", card);
				await them.chooseUseTarget(card, true);
			}
		} else if (theirShown < myShown) {
			const recastable = player.getShownCards().filter(card => player.canRecast(card));
			const res = await player.chooseCard("h", [1, recastable.length], "浮沈：重铸至少一张你的明置牌", card => recastable.includes(card))
				.set("ai", card => 4 - get.value(card))
				.forResult();
			if (res?.bool && res.cards?.length) {
				await player.recast(res.cards);
			}
		} else {
			// 相等：交换可见手牌（lose 会剥非 eternal gaintag，换主后逐牌重打 visible_ 标签——取证题15）
			const myShownCards = player.getShownCards();
			const theirShownCards = them.getShownCards();
			const myTags = myShownCards.map(card => card.gaintag.filter(tag => tag.startsWith("visible_")));
			const theirTags = theirShownCards.map(card => card.gaintag.filter(tag => tag.startsWith("visible_")));
			if (myShownCards.length) {
				await player.give(myShownCards, them);
			}
			if (theirShownCards.length) {
				await them.give(theirShownCards, player);
			}
			myShownCards.forEach((card, i) => myTags[i].forEach(tag => card.addGaintag(tag)));
			theirShownCards.forEach((card, i) => theirTags[i].forEach(tag => card.addGaintag(tag)));
			game.log(player, "与", them, "交换了明置牌");
		}
	},
},
// === 放饮（阮咸） ===
// 你摸两张牌后，须亮出这些牌并视为【酒】；在你的回合内或你的可见手牌数为2时，所有角色可如手牌般使用这些酒。
maokuo_fangyin: {
	audio: 2,
	group: ["maokuo_fangyin_mark"],
	init(player) {
		// 给所有角色挂“如手牌般使用”载体与“视为酒”mod（坑-清单「其他角色可用」条：init 挂载 + onremove 对称摘除）
		game.countPlayer(cur => {
			if (!cur.hasSkill("maokuo_fangyin_use")) {
				cur.addSkill("maokuo_fangyin_use");
			}
			if (!cur.hasSkill("maokuo_fangyin_v")) {
				cur.addSkill("maokuo_fangyin_v");
			}
		});
	},
	onremove(player) {
		game.countPlayer(cur => {
			cur.removeSkill("maokuo_fangyin_use");
			cur.removeSkill("maokuo_fangyin_v");
		});
	},
	trigger: { player: "drawAfter" },
	forced: true,
	filter(event, player) {
		return player.isIn() && event.num == 2 && (event.result?.cards || []).length > 0;
	},
	async content(event, trigger, player) {
		const cards = trigger.result.cards;
		// 明置这些牌（放饮的明置牌 = 视为【酒】的牌，不再额外打“酒”tag，强制视为走 mod.cardname 读明置 tag）
		await player.addShownCards(cards, "visible_maokuo_fangyin");
		game.log(player, "明置了摸到的两张牌，这些牌视为【酒】");
		lib.skill.maokuo_fangyin.syncMark(player);
	},
	// 条件「在你的回合内 或 你的明置牌数为2」且场上有放饮明置【酒」时显示「饮」mark，否则立即消失
	syncMark(player) {
		if (!player || !player.isIn() || !player.hasSkill("maokuo_fangyin")) return;
		const hasWine = player.getShownCards().some(card => card.hasGaintag("visible_maokuo_fangyin"));
		const active = hasWine && (_status.currentPhase == player || player.countShownCards() == 2);
		if (active) player.markSkill("maokuo_fangyin_mark");
		else player.unmarkSkill("maokuo_fangyin_mark");
	},
},
// === 放饮 ===
// 「饮」呈现 mark：满足「在你的回合内 或 你的明置牌数为2」且场上有放饮明置【酒】时显示，条件变化即时消失。
// 用 firetext 标红；文本交代“所有角色可以如手牌般使用你的明置【酒】”。
maokuo_fangyin_mark: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	mark: true,
	marktext: '<span class="firetext">饮</span>',
	intro: {
		name: "放饮",
		content: "所有角色可以如手牌般使用你的明置【酒】",
	},
	// 条件相关时机全集：回合切换/新轮/开局 + 明置牌增减（摸牌、失去、弃置、装备区变化）
	trigger: {
		global: ["phaseChange", "roundStart", "gameStart", "equipAfter", "addToExpansionAfter", "loseAsyncAfter"],
		player: ["gainAfter", "loseAfter", "discardAfter"],
	},
	filter(event, player) {
		return !!(player && player.isIn() && player.hasSkill("maokuo_fangyin"));
	},
	async content(event, trigger, player) {
		lib.skill.maokuo_fangyin.syncMark(player);
	},
	onremove(player) {
		player.unmarkSkill("maokuo_fangyin_mark");
	},
},
// === 放饮 ===
// 放饮明置的牌强制视为【酒】（mod.cardname 按明置 tag visible_maokuo_fangyin 判定；牌离手时非 eternal 明置 tag 由引擎剥离）
maokuo_fangyin_v: {
	charlotte: true,
	silent: true,
	popup: false,
	mod: {
		cardname(card) {
			if (card.hasGaintag?.("visible_maokuo_fangyin")) {
				return "jiu";
			}
		},
	},
},
// === 放饮 ===
// 所有角色如手牌般使用阮咸明置的【酒】（龙智骨架：静态 viewAs + selectCard:-1 + precontent 换实体牌）
maokuo_fangyin_use: {
	charlotte: true,
	enable: "chooseToUse",
	viewAs: { name: "jiu", isCard: true },
	filterCard: () => false,
	selectCard: -1,
	filter(event, player) {
		if (event.skill == "maokuo_fangyin_use" || event._skill == "maokuo_fangyin_use") {
			return true;
		}
		const rx = game.findPlayer(cur => cur.isIn() && cur.hasSkill("maokuo_fangyin"));
		if (!rx) {
			return false;
		}
		// 在阮咸的回合内或其明置牌数为2
		if (_status.currentPhase != rx && rx.countShownCards() != 2) {
			return false;
		}
		return rx.getShownCards().some(card => card.hasGaintag("visible_maokuo_fangyin"));
	},
	hiddenCard(player, name) {
		// 濒死求酒窗：按牌名收窄（取证 F2）
		if (name != "jiu") {
			return false;
		}
		const rx = game.findPlayer(cur => cur.isIn() && cur.hasSkill("maokuo_fangyin"));
		if (!rx) {
			return false;
		}
		return (_status.currentPhase == rx || rx.countShownCards() == 2) && rx.getShownCards().some(card => card.hasGaintag("visible_maokuo_fangyin"));
	},
	async precontent(event, trigger, player) {
		const rx = game.findPlayer(cur => cur.isIn() && cur.hasSkill("maokuo_fangyin"));
		const cards = rx ? rx.getShownCards().filter(card => card.hasGaintag("visible_maokuo_fangyin")) : [];
		if (!cards.length || !rx) {
			event.result.cancel = true;
			return;
		}
		const res = await player.choosePlayerCard({
			target: rx,
			position: "h",
			selectButton: [1, 1],
			prompt: `放饮：选择${rx == player ? "你" : get.translation(rx)}的一张明置的【酒】使用`,
		})
			.set("filterButton", button => cards.includes(button.link))
			.set("ai", button => 1)
			.forResult();
		const card = res?.cards?.[0] ?? res?.links?.[0];
		if (!card) {
			event.result.cancel = true;
			return;
		}
		// 龙智同款：把别人的实体牌写成 result.card/cards（取证题5，xiaobai_tongyan 同款）
		event.result.card = get.autoViewAs({ name: "jiu", isCard: true }, [card]);
		event.result.cards = [card];
	},
	ai: {
		order: 4,
		save: true,
		skillTagFilter(player, tag) {
			return tag == "save";
		},
	},
},
};

// ===== StepCompiler 可见性：编译后的回调（content/cost/precontent/onuse）里只能用引擎注入的名字，
// 模块作用域的函数/import 全部丢失，所以这里统一挂到 lib 上，回调里写 lib.xxx。
lib.qunyou_clearVisiblePile = qunyou_clearVisiblePile;
