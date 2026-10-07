import { lib, game, get, ui, _status } from "noname";

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
		const card = get.cards(1, true)[0];
		if (!card) {
			return;
		}
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
	async cost(event, trigger, player) {
		const num = player.storage.maokuo_bolan_card?.num || 0;
		const res = await player.chooseBool(`博览：是否选择你区域内的至少一张牌（点数之和为${num}时摸等量的牌）？`)
			.set("ai", () => Math.random() < 0.8)
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		const num = player.storage.maokuo_bolan_card?.num;
		if (!num) {
			return;
		}
		const res = await player.chooseCard("hejsx", [1, player.countCards("hejsx")], `博览：选择你区域内的至少一张牌（若为手牌则展示之，点数之和为${num}时摸等量的牌）`, "allowChooseAll")
			.set("ai", card => Math.random())
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
	mark: true,
	marktext: "猎",
	intro: {
		name: "残猎",
		content(storage, player) {
			const n = player.getStorage("maokuo_canlie_count") || 0;
			return n ? `本回合已发动${n}次` : "本回合尚未发动（首次发动时回复1点体力）";
		},
	},
	trigger: { global: "gainAfter" },
	filter(event, player) {
		return _status.currentPhase == player && event.player && event.player != player && event.player.isIn();
	},
	async content(event, trigger, player) {
		await trigger.player.damage(player, 1);
		const count = (player.getStorage("maokuo_canlie_count") || 0) + 1;
		player.storage.maokuo_canlie_count = count;
		player.markSkill("maokuo_canlie");
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
		if (player.hp == 1 && player.countCards("h")) {
			await player.discard(player.getCards("h"));
		} else if (!player.countCards("h") && player.hp > 1) {
			await player.loseHp(player.hp - 1);
		}
		player.addSkill("maokuo_canlie");
		game.log(player, "获得了技能“残猎”");
		player.insertPhase("maokuo_chiyan");
		game.log(player, "执行一个额外的回合");
	},
},
// === 浮饰 ===
maokuo_fushi: {
	audio: 2,
	enable: ["chooseToUse", "chooseToRespond"],
	filter(event, player) {
		return !!get.info("maokuo_qingxuan").findFushi(event, player);
	},
	viewAs(cards, player) {
		const card = get.info("maokuo_qingxuan").findFushi(get.event(), player);
		if (card) {
			return { name: get.name(card), isCard: true };
		}
		return { name: "sha", isCard: true };
	},
	filterCard() {
		return false;
	},
	selectCard: -1,
	prompt: "浮饰：展示所有手牌，使用牌堆顶的可见牌",
	async precontent(event, trigger, player) {
		const info = get.info("maokuo_qingxuan");
		const card = info.findFushi(event.getParent(), player);
		if (!card) {
			return;
		}
		await player.showCards(player.getCards("h"), get.translation(player) + "发动了【浮饰】");
		await game.cardsGotoOrdering([card]);
		// 把结算的牌换成牌堆顶那张实体牌
		event.result.card = card;
		event.result.cards = [card];
	},
	async content(event, trigger, player) {
		// AI/托管路径兜底：自行完成展示与使用（正常对话框路径已由 precontent 换牌，不会走到这里）
		const info = get.info("maokuo_qingxuan");
		const card = info.findFushi(null, player);
		if (!card) {
			return;
		}
		await player.showCards(player.getCards("h"), get.translation(player) + "发动了【浮饰】");
		await game.cardsGotoOrdering([card]);
		const name = get.name(card);
		const vcard = get.autoViewAs({ name: name, isCard: true }, [card]);
		if (name == "sha") {
			await player.chooseUseTarget(vcard, true);
		} else {
			await player.useCard(vcard, [card], "maokuo_fushi");
		}
	},
	hiddenCard(player, name) {
		const card = get.info("maokuo_qingxuan").findFushi(null, player);
		return !!card && get.name(card) == name;
	},
	ai: {
		order: 4,
		respondSha: true,
		respondShan: true,
		skillTagFilter(player, tag) {
			const card = get.info("maokuo_qingxuan").findFushi(null, player);
			if (!card) {
				return false;
			}
			if (tag == "respondSha") {
				return get.name(card) == "sha";
			}
			if (tag == "respondShan") {
				return get.name(card) == "shan";
			}
			return false;
		},
		result: {
			player: 1,
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
		content(storage, player) {
			return `扣置着${player.getExpansions("maokuo_huifo").length}张“会佛”牌`;
		},
		markcount(storage, player) {
			return player.getExpansions("maokuo_huifo").length;
		},
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
			.set("ai", target => Math.random())
			.forResult();
		if (!res?.bool || !res.targets?.length) {
			return;
		}
		const target = res.targets[0];
		// 双方私下各选一张，选完同时亮出（保持"同时展示"语义）
		const res1 = await player.chooseCard("h", true, `会佛：请选择你展示的一张手牌`)
			.set("ai", card => Math.random())
			.forResult();
		if (!res1?.bool || !res1.cards?.length) {
			return;
		}
		const myCard = res1.cards[0];
		const res2 = await target.chooseCard("h", true, `会佛：请${get.translation(target)}选择展示的一张手牌`)
			.set("ai", card => Math.random())
			.forResult();
		if (!res2?.bool || !res2.cards?.length) {
			return;
		}
		const tCard = res2.cards[0];
		await player.showCards([myCard, tCard], get.translation(player) + "发动了【会佛】");
		const prevTargets = player.getStorage("maokuo_huifo_targets") || [];
		const isNewTarget = !prevTargets.includes(target);
		player.storage.maokuo_huifo_targets = prevTargets.concat([target]);
		if (get.color(myCard) != get.color(tCard)) {
			// 颜色不同：按序（己先彼后）扣置于武将牌上，不结束回合
			await player.addToExpansion([myCard, tCard], "giveAuto").set("gaintag", ["maokuo_huifo"]);
			player.markSkill("maokuo_huifo");
			game.log(player, "将两张牌扣置于武将牌上");
		} else {
			// 颜色相同：展示牌留在手里，轮流从存量“会佛”牌中随机获得，直到没有为止
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
		}
		// 结束回合的两个条件：①同色分支结束；②对另一名角色发动过
		if (get.color(myCard) == get.color(tCard) || isNewTarget) {
			event.getParent("phase").finish();
			game.log(player, "的回合结束了");
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
		return player.countCards("h") > 0;
	},
	async content(event, trigger, player) {
		const res1 = await player.chooseCard("h", "考度：你可以重铸一张牌")
			.set("ai", card => 6 - get.value(card))
			.forResult();
		if (!res1?.bool || !res1.cards?.length) {
			return;
		}
		await player.recast(res1.cards);
		const res2 = await player.chooseCard("he", "考度：是否弃置一张牌？")
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
// 阔略：一名角色的结束阶段，若你于此回合内未成为过黑色牌的目标，你可以亮出一张手牌：
//       当你的手牌均可见时，你令手牌均不可见，摸一张牌。
// 著贊：当一名角色使用【杀】时，你可以将一张牌置于武将牌上。当此【杀】结算后，若此【杀】没造成过伤害，
//       你可以将至少一张"著贊"牌置入弃牌堆，其摸等量的牌。
maokuo_kuolue: {
	audio: 2,
	group: ["maokuo_kuolue_hit"],
	subSkill: {
		hitmark: {
			charlotte: true,
			onremove: true,
		},
	},
	trigger: { global: "phaseJieshuBegin" },
	filter(event, player) {
		return player.isIn() && player.countCards("h") > 0 && !(player.getStorage("maokuo_kuolue_hitmark") || []).length;
	},
	async cost(event, trigger, player) {
		const res = await player.chooseCard("h", "阔略：亮出一张手牌")
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
		await player.addShownCards([card], "visible_maokuo_kuolue");
		if (player.getShownCards().length >= player.countCards("h")) {
			// 手牌均可见：全部暗置并摸一张牌（清掉所有来源的明置标签）
			const shown = player.getShownCards();
			const tags = [];
			shown.forEach(c => c.gaintag.forEach(t => {
				if (t.startsWith("visible_") && !tags.includes(t)) {
					tags.push(t);
				}
			}));
			await player.hideShownCards(shown, ...tags);
			await player.draw(1);
			game.log(player, "的手牌均已可见，全部暗置并摸了一张牌");
		}
	},
	ai: {
		threaten: 1.1,
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
				if (ui.selected.buttons.length == 0) {
					return Math.random();
				}
				const cardx = get.autoViewAs({ name: button.link[2], nature: button.link[3] });
				return get.player().getUseValue(cardx, true, true);
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
maokuo_nishui: {
	audio: 2,
	forced: true,
	mark: true,
	marktext: "逆",
	intro: {
		name: "逆水",
		content(storage, player) {
			const cards = player.getExpansions("maokuo_nishui");
			const ban = player.getStorage("maokuo_nishui_ban") || [];
			let str = cards.length ? "武将牌上有“逆水”牌：" + cards.map(c => `【${get.translation(c.name)}】`).join("、") : "武将牌上没有“逆水”牌";
			if (ban.length) {
				str += "<br>不能再使用或打出：" + ban.map(n => `【${get.translation(n)}】`).join("、");
			}
			return str;
		},
	},
	trigger: { player: "enterGame" },
	filter(event, player) {
		return player.getExpansions("maokuo_nishui").length == 0;
	},
	async content(event, trigger, player) {
		const cards = [];
		for (const name of ["sha", "shan", "tao", "jiu"]) {
			const card = get.cardPile(c => c.name == name);
			cards.push(card || game.createCard(name));
		}
		await player.addToExpansion(cards, "giveAuto").set("gaintag", ["maokuo_nishui"]);
		game.log(player, "将【杀】【闪】【桃】【酒】各一张置于武将牌上");
	},
	// 直到游戏结束不能使用或打出已用过的名称（使用/打出/濒死求桃三条链都要拦）
	mod: {
		cardEnabled(card, player) {
			if (get.info("maokuo_nishui").isBanned(card, player)) {
				return false;
			}
		},
		cardRespondable(card, player) {
			if (get.info("maokuo_nishui").isBanned(card, player)) {
				return false;
			}
		},
		cardSavable(card, player) {
			if (get.info("maokuo_nishui").isBanned(card, player)) {
				return false;
			}
		},
	},
	isBanned(card, player) {
		return (player.getStorage("maokuo_nishui_ban") || []).includes(get.name(card.cards && card.cards[0] || card));
	},
	group: ["maokuo_nishui_use"],
},
// === 逆水 ===
maokuo_nishui_use: {
	audio: "maokuo_nishui",
	enable: "phaseUse",
	filterCard() {
		return false;
	},
	selectCard: -1,
	filter(event, player) {
		return player.getExpansions("maokuo_nishui").length > 0;
	},
	async content(event, trigger, player) {
		const cards = player.getExpansions("maokuo_nishui");
		const res = await player.chooseButton(["逆水：移出一张“逆水”牌，视为使用之", cards], true)
			.set("ai", button => player.getUseValue({ name: get.name(button.link) }))
			.forResult();
		if (!res?.bool || !res.links?.length) {
			return;
		}
		const card = res.links[0];
		if (!player.storage.maokuo_nishui_ban) {
			player.storage.maokuo_nishui_ban = [];
		}
		player.storage.maokuo_nishui_ban.push(get.name(card));
		player.markSkill("maokuo_nishui");
		await game.cardsGotoSpecial([card]);
		game.log(player, "将", card, "移出了游戏");
		const name = get.name(card);
		const vcard = get.autoViewAs({ name: name, isCard: true }, [card]);
		if (name == "shan") {
			// 闪没有常规使用目标，直接结算（无目标使用）
			await player.useCard(vcard, [card], "maokuo_nishui_use");
		} else {
			const next = player.chooseUseTarget(vcard, true);
			next.set("logSkill", "maokuo_nishui_use");
			await next;
		}
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
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
// 浮饰：若牌堆顶的第X张牌可见（X为你某一种花色手牌的数量），当你需要使用该牌时，你可以展示所有手牌，使用之。
// “牌堆可见牌”为自建系统：数据在 _status.maokuo_visiblePile（card 集合），
// 可见性按位置动态判定（牌被摸走/埋深/洗走自动失效），无需监听清理。
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
	// ---- “牌堆可见牌”系统 ----
	getPileCards() {
		return Array.from(ui.cardPile.childNodes);
	},
	getTopCards(k) {
		return this.getPileCards().slice(0, k);
	},
	getVisibleSet() {
		if (!_status.maokuo_visiblePile) {
			_status.maokuo_visiblePile = new Set();
		}
		return _status.maokuo_visiblePile;
	},
	hasAnyVisible() {
		const set = _status.maokuo_visiblePile;
		if (!set) {
			return false;
		}
		for (const card of set) {
			if (card.parentNode == ui.cardPile) {
				return true;
			}
		}
		return false;
	},
	getVisibleTop() {
		const pile = this.getPileCards();
		const set = _status.maokuo_visiblePile;
		const list = [];
		if (set) {
			pile.forEach((card, i) => {
				if (set.has(card)) {
					list.push({ pos: i + 1, card: card });
				}
			});
		}
		return list;
	},
	isTopVisible(k) {
		const card = this.getPileCards()[k - 1];
		return !!(card && _status.maokuo_visiblePile && _status.maokuo_visiblePile.has(card));
	},
	markVisible(cards) {
		const set = this.getVisibleSet();
		// 只进 Set 不打 gaintag：牌被摸走后标签会残留在手牌上，明牌逻辑按位置动态判定已足够
		cards.forEach(card => set.add(card));
		game.log(`牌堆顶的${cards.length}张牌被置为可见`);
	},
	// 浮饰判定：存在某花色 s，其手牌数 X≥1 且牌堆顶第 X 张可见，返回那张牌（event 用于校验"需要使用"的牌名）
	findFushi(event, player) {
		for (const suit of ["spade", "heart", "club", "diamond"]) {
			const x = player.countCards("h", c => get.suit(c) == suit);
			if (x > 0 && this.isTopVisible(x)) {
				const card = this.getPileCards()[x - 1];
				if (!event || event.filterCard({ name: get.name(card), isCard: true }, player, event)) {
					return card;
				}
			}
		}
		return null;
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
		_status.maokuo_visiblePile = new Set();
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
maokuo_raolue: {
	audio: 2,
	group: ["maokuo_raolue_sha", "maokuo_raolue_shan", "maokuo_raolue_flow"],
	subSkill: {
		// 就绪标记：flow 成功（她与一名男性都已展示）后挂上，enable 子技能凭此在询问框出现
		ready: {
			charlotte: true,
			onremove: true,
			mark: true,
			marktext: "掠",
			intro: {
				name: "娆掠",
				content(storage, player) {
					const name = player.storage.maokuo_raolue_ready;
					return name ? `已就绪：可视为使用或打出【${get.translation(name)}】` : "就绪标记";
				},
			},
		},
		used: {
			charlotte: true,
		},
	},
	// 判断本次询问需要【杀】还是【闪】：两种都合法时按【杀】处理
	getNeedName(event) {
		const ok = [];
		for (const name of ["sha", "shan"]) {
			if (event.filterCard({ name: name, isCard: true }, event.player, event)) {
				ok.push(name);
			}
		}
		if (!ok.length) {
			return null;
		}
		return ok[0];
	},
},
// === 娆掠 ===
maokuo_raolue_flow: {
	audio: "maokuo_raolue",
	direct: true,
	trigger: { global: ["chooseToUseBefore", "chooseToRespondBefore"] },
	filter(event, player) {
		if (event.player != player || !player.isIn()) {
			return false;
		}
		if (player.hasSkill("maokuo_raolue_used") || player.storage.maokuo_raolue_ready) {
			return false;
		}
		const name = get.info("maokuo_raolue").getNeedName(event);
		if (!name) {
			return false;
		}
		// 自己有同名牌 + 存在其他男性角色有同名牌，才值得发起询问
		return player.countCards("h", card => get.name(card) == name) > 0 &&
			game.hasPlayer(cur => cur != player && cur.isIn() && cur.sex == "male" && cur.countCards("h", card => get.name(card) == name) > 0);
	},
	async content(event, trigger, player) {
		const name = get.info("maokuo_raolue").getNeedName(trigger);
		if (!name) {
			return;
		}
		const males = game.filterPlayer(cur => cur != player && cur.isIn() && cur.sex == "male" && cur.countCards("h", card => get.name(card) == name) > 0);
		if (!males.length) {
			return;
		}
		const res1 = await player.chooseCard("h", `娆掠：你可以展示一张【${get.translation(name)}】`, card => get.name(card) == name)
			.set("ai", card => 6 - get.value(card))
			.forResult();
		if (!res1?.bool || !res1.cards?.length) {
			return;
		}
		await player.showCards(res1.cards, get.translation(player) + "发动了【娆掠】");
		for (const male of males) {
			const res2 = await male.chooseBool(`娆掠：是否展示一张【${get.translation(name)}】（响应${get.translation(player)}）`)
				.set("ai", () => Math.random() < 0.7)
				.forResult();
			if (!res2?.bool) {
				continue;
			}
			const res3 = await male.chooseCard("h", true, `娆掠：请展示一张【${get.translation(name)}】`, card => get.name(card) == name)
				.set("ai", card => Math.random())
				.forResult();
			if (res3?.bool && res3.cards?.length) {
				await male.showCards(res3.cards, get.translation(male) + "展示了牌");
				player.storage.maokuo_raolue_ready = name;
				player.addTempSkill("maokuo_raolue_ready", "phaseAfter");
				return;
			}
		}
		game.log("没有男性角色响应【娆掠】");
	},
},
// === 娆掠 ===
maokuo_raolue_sha: {
	audio: "maokuo_raolue",
	enable: ["chooseToUse", "chooseToRespond"],
	filter(event, player) {
		if (player.hasSkill("maokuo_raolue_used") || player.storage.maokuo_raolue_ready != "sha") {
			return false;
		}
		return event.filterCard({ name: "sha", isCard: true }, player, event);
	},
	viewAs: { name: "sha", isCard: true },
	filterCard() {
		return false;
	},
	selectCard: -1,
	prompt: "娆掠：视为使用或打出一张【杀】",
	async precontent(event, trigger, player) {
		// 展示流程已在 flow 中完成，这里只消耗就绪标记并记录每回合限一次
		player.removeSkill("maokuo_raolue_ready");
		player.addTempSkill("maokuo_raolue_used", "phaseAfter");
	},
	hiddenCard(player, name) {
		return name == "sha" && !player.hasSkill("maokuo_raolue_used") && player.storage.maokuo_raolue_ready == "sha";
	},
	ai: {
		order() {
			return get.order({ name: "sha" }) + 0.5;
		},
		respondSha: true,
		skillTagFilter(player, tag) {
			if (tag != "respondSha") {
				return false;
			}
			return !player.hasSkill("maokuo_raolue_used") && player.storage.maokuo_raolue_ready == "sha";
		},
		result: {
			player: 1,
		},
	},
},
// === 娆掠 ===
maokuo_raolue_shan: {
	audio: "maokuo_raolue",
	enable: ["chooseToUse", "chooseToRespond"],
	filter(event, player) {
		if (player.hasSkill("maokuo_raolue_used") || player.storage.maokuo_raolue_ready != "shan") {
			return false;
		}
		return event.filterCard({ name: "shan", isCard: true }, player, event);
	},
	viewAs: { name: "shan", isCard: true },
	filterCard() {
		return false;
	},
	selectCard: -1,
	prompt: "娆掠：视为使用或打出一张【闪】",
	async precontent(event, trigger, player) {
		player.removeSkill("maokuo_raolue_ready");
		player.addTempSkill("maokuo_raolue_used", "phaseAfter");
	},
	hiddenCard(player, name) {
		return name == "shan" && !player.hasSkill("maokuo_raolue_used") && player.storage.maokuo_raolue_ready == "shan";
	},
	ai: {
		order: 5,
		respondShan: true,
		skillTagFilter(player, tag) {
			if (tag != "respondShan") {
				return false;
			}
			return !player.hasSkill("maokuo_raolue_used") && player.storage.maokuo_raolue_ready == "shan";
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
		return player.hasUseTarget(get.autoViewAs({ name: "sha", isCard: true }, []));
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
				return 1;
			})
			.forResult();
		if (!res?.bool) {
			return;
		}
		const choice = res.links[0];
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
		// 同意才消耗每阶段限一次
		player.addTempSkill("maokuo_shameng_used", "phaseUseAfter");
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
// 思虔：当你成为【杀】的目标后，你可以摸一张牌并展示之，若你的武将牌上：没有此花色的牌，你须将之置于武将牌上；
//       有此花色的牌，你于此回合内再次成为此花色牌的目标时，你不能发动"思虔"。
// 遂志：当你受到伤害后，你可以获得装备区里、判定区里和武将牌上的所有牌，然后翻面；
//       若你的武将牌背面朝上，防止你受到的伤害。
maokuo_siqian: {
	audio: 2,
	mark: true,
	marktext: "虔",
	intro: {
		name: "思虔",
		content(storage, player) {
			const cards = player.getExpansions("maokuo_siqian");
			const ban = player.getStorage("maokuo_siqian_ban") || [];
			let str = cards.length
				? "武将牌上有“思虔”牌（" + cards.length + "张）：" +
					cards.map(c => `${get.translation(get.suit(c))}${get.translation(c.name)}`).join("、")
				: "武将牌上没有“思虔”牌";
			if (ban.length) {
				str += `<br>本回合不能再对${ban.map(s => get.translation(s)).join("、")}色牌发动`;
			}
			return str;
		},
	},
	trigger: { target: "useCardToTarget" },
	filter(event, player) {
		return event.card?.name == "sha" && player.isIn() &&
			!(player.getStorage("maokuo_siqian_ban") || []).includes(get.suit(event.card));
	},
	async cost(event, trigger, player) {
		const res = await player.chooseBool("思虔：是否摸一张牌并展示之？")
			.set("ai", () => true)
			.forResult();
		event.result = { bool: !!res?.bool };
	},
	async content(event, trigger, player) {
		const suit = get.suit(trigger.card);
		const drawEvt = await player.draw(1);
		const card = drawEvt?.result?.cards?.[0] || drawEvt?.cards?.[0];
		if (!card) {
			return;
		}
		await player.showCards([card], get.translation(player) + "发动了【思虔】");
		if (player.getExpansions("maokuo_siqian").some(c => get.suit(c) == suit)) {
			// 武将牌上已有此花色：本回合内不能再对同花色的杀发动
			player.addTempSkill("maokuo_siqian_ban", "phaseAfter");
			player.markAuto("maokuo_siqian_ban", [suit]);
			game.log(player, "于此回合内不能再对", `#${get.translation(suit)}`, "色牌发动【思虔】");
		} else {
			await player.addToExpansion([card], "giveAuto").set("gaintag", ["maokuo_siqian"]);
		}
	},
},
// === 思虔 ===
maokuo_siqian_ban: {
	charlotte: true,
	onremove: true,
},
// === 颂酒 ===
// 颂酒：一名角色的出牌阶段开始时，你可以展示任一角色的一张手牌（死亡后改为观看一名角色的手牌并展示其中一张），
//       令该牌视为【酒】直到本轮结束，且"颂酒"失效直到本轮结束或当【酒】被使用时。
// 醉世：锁定技，你使用【酒】后，摸一张牌；你死亡后，你依然能以发动"颂酒"的形式参与游戏。
maokuo_songjiu: {
	audio: 2,
	forceDie: true,
	trigger: { global: "phaseUseBegin" },
	group: ["maokuo_songjiu_restore_jiu", "maokuo_songjiu_restore_round"],
	subSkill: {
		jin: {
			charlotte: true,
			mark: true,
			marktext: "眠",
			intro: {
				name: "颂酒",
				content: "“颂酒”失效：本轮结束或【酒】被使用时恢复",
			},
		},
	},
	filter(event, player) {
		return !player.hasSkill("maokuo_songjiu_jin") && game.hasPlayer(cur => cur.isIn() && cur.countCards("h") > 0);
	},
	async cost(event, trigger, player) {
		const dead = player.isDead();
		const prompt = dead ? "颂酒：观看一名角色的手牌并展示其中一张（该牌视为【酒】）" : "颂酒：展示一名角色的一张手牌（该牌视为【酒】）";
		const res = await player.chooseTarget(prompt, true, (card, p, t) => t.isIn() && t.countCards("h") > 0)
			.set("ai", target => {
				if (dead) {
					return get.attitude(player, target) > 0 ? 10 : 1; // 死后把酒送给队友
				}
				return get.attitude(player, target) < 0 ? 10 : 1; // 活着时干扰敌人的手牌预期
			})
			.forResult();
		if (!res?.bool || !res.targets?.length) {
			event.result = { bool: false };
			return;
		}
		const target = res.targets[0];
		let card;
		if (dead) {
			// 醉世死亡形态：观看其手牌并自选其中一张
			await player.viewCards(`颂酒：${get.translation(target)}的手牌`, target.getCards("h"));
			const res2 = await player.chooseButton([`颂酒：展示其中一张牌（视为【酒】）`, target.getCards("h")], true)
				.set("ai", button => get.value(button.link))
				.forResult();
			if (!res2?.bool || !res2.links?.length) {
				event.result = { bool: false };
				return;
			}
			card = res2.links[0];
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
		target.addTempSkill("maokuo_songjiu_v", "roundEnd");
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
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		return event.card?.name == "jiu" && player.hasSkill("maokuo_songjiu_jin");
	},
	async content(event, trigger, player) {
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
	trigger: { global: "roundEnd" },
	async content(event, trigger, player) {
		player.removeSkill("maokuo_songjiu_jin");
	},
},
// === 颂酒 ===
// 给牌的主人临时挂的转化技：带"颂酒"标签的手牌可以当【酒】使用
maokuo_songjiu_v: {
	charlotte: true,
	enable: "chooseToUse",
	filter(event, player) {
		return player.hasCard(card => card.hasGaintag("maokuo_songjiu_tag"), "h") &&
			event.filterCard({ name: "jiu", isCard: true }, player, event);
	},
	viewAs: { name: "jiu", isCard: true },
	filterCard(card) {
		return card.hasGaintag("maokuo_songjiu_tag");
	},
	position: "h",
	selectCard: 1,
	prompt: "颂酒：将展示的牌当【酒】使用",
	ai: {
		order: 6,
		result: {
			player: 1,
		},
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
			.set("ai", () => player.getExpansions("maokuo_siqian").length > 0 || player.getCards("e").length > 0)
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
	async cost(event, trigger, player) {
		const curFace = player.storage.maokuo_tianqian_face;
		// 选落点：先选一名角色，再选其相邻角色之一；第一步可取消 = 保持原间隙不变
		const anchorRes = await player
			.chooseTarget("天堑：选择一名角色（“地势”标记将置于其与相邻角色的座位之间）；取消则间隙保持不变", (card, p, t) => t.isIn())
			.set("ai", (target) => Math.random())
			.forResult();
		const anchor = anchorRes?.targets?.[0];
		let newPair = null;
		if (anchor?.isIn()) {
			const neighbors = [anchor.getNext(), anchor.getPrevious()].filter((t) => t && t.isIn());
			if (neighbors.length) {
				const nbRes = await player
					.chooseTarget(`天堑：选择${get.translation(anchor)}的相邻角色（标记置于两者座位之间）`, true, (card, p, t) => neighbors.includes(t))
					.set("ai", (target) => Math.random())
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
			.set("ai", () => (Math.random() < 0.5 ? (curFace ? "保持现状" : "山") : "泽"))
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
		// 基本牌或普通锦囊牌：视为使用之，目标强制改为该角色
		if (type == "basic" || (type == "trick" && get.type(card, "trick") != "delay")) {
			await player.useCard(card, [card], [target], "maokuo_wuci");
		} else {
			game.log("婺辞获得的牌不是基本牌或普通锦囊牌，不结算使用");
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
			mark: true,
			marktext: "肖",
			intro: {
				content(storage) {
					if (!storage?.length) {
						return "未视为装备任何牌";
					}
					return "视为装备着【" + storage.map((name) => get.translation(name)).join("】【") + "】";
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
		return true;
	},
	async content(event, trigger, player) {
		const result = await player
			.chooseTarget(true, "血征：令一名角色展示所有手牌，该角色须依次使用其中可使用的牌", (card, player2, target) => {
				return target.countCards("h") > 0;
			})
			.set("ai", (target) => {
				const current = get.player();
				if (target == current) {
					return 10 + target.countCards("h");
				}
				return get.attitude(current, target) > 0 ? 5 : 1;
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
		player.storage.maokuo_xunyi_up = (player.storage.maokuo_xunyi_up || 0) + 1;
		player.markSkill("maokuo_xunyi_up");
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
			return `<li>手牌上限和攻击范围+${storage || 0}<br><li>当前攻击范围：${player.getAttackRange()}`;
		},
	},
	mod: {
		maxHandcard(player, num) {
			return num + (player.storage.maokuo_xunyi_up || 0);
		},
		attackRange(player, num) {
			return num + (player.storage.maokuo_xunyi_up || 0);
		},
	},
},
// === 预谋 ===
// 预谋：其他角色的出牌阶段开始时，你可以展示两张不同颜色的手牌，然后其选择一项：
//       1.获得黑色牌，其摸一张牌；2.获得红色牌，你摸一张牌。
// 逆水：游戏开始时，你将【杀】、【闪】、【桃】、【酒】各一张置于武将牌上。
//       你可以将一张"逆水"牌移出游戏，视为使用之，然后直到游戏结束，你不能使用或打出相同名称的牌。
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
			.set("ai", card => 6 - get.value(card))
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
		const res2 = await trigger.player.chooseButton([`预谋：请${get.translation(trigger.player)}选择一项`, [options.map((item, i) => [i, item]), "textbutton"]], true)
			.set("ai", button => {
				if (button.link == 0) {
					return get.value(black) + get.attitude(trigger.player, trigger.player) * 0.5;
				}
				return get.value(red) + get.attitude(trigger.player, player) * 0.5;
			})
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
	forced: true,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		return (event._maokuo_zhuzan || []).includes(player) &&
			player.isIn() && player.getExpansions("maokuo_zhuzan").length > 0 &&
			!game.hasPlayer(cur => cur.getHistory("sourceDamage", ev => ev.card == event.card).length);
	},
	async cost(event, trigger, player) {
		const cards = player.getExpansions("maokuo_zhuzan");
		const res = await player.chooseButton([`著贊：将至少一张“著贊”牌置入弃牌堆，${get.translation(trigger.player)}摸等量的牌`, cards], [1, cards.length])
			.set("ai", button => get.value(button.link))
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
};
