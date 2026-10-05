import { lib, game, get, ui, _status } from "noname";

// ==================== 一蛋展示（猫咪大院包）：11 名武将 ====================
// 来源：《一蛋展示》提取结果（李春香/卫温&诸葛直/王蕃/刘伶/黄崇/曹衮/夏侯徽/杨戏/臧洪/何晏/笮融）。
// 规则口径已由用户拍板：歃盟（出牌阶段内主动声明 + 连击计数）、残猎（按笮融每回合首次发动回血）、
// 会佛（同色只分存量、空堆也结束回合；换新目标结束回合）。

// ==================== 【2】李春香（群·香枕云梦·RP&辰木） ====================
// 娆掠：每回合限一次，当你需要使用或打出【杀】/【闪】时，你可以展示一张【杀】/【闪】，
//       然后若其他男性角色展示一张【杀】/【闪】，视为你使用或打出之。
// 婺辞：其他角色的弃牌阶段开始时，若其手牌数大于手牌上限，你可以获得其一张手牌并展示之。
//       若此牌为基本牌或普通锦囊牌，你视为使用之并将此牌的使用目标改为其。
export const skills = {
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

// ==================== 【5】卫温&诸葛直（吴·沧海沉浮·龙哥头肩） ====================
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

// ==================== 【6】王蕃（吴·知天知物·陈木） ====================
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

// ==================== 【10】刘伶（群·荷锸任埋·怀默） ====================
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

// ==================== 【11】黄崇（蜀·悬门抉目·RP） ====================
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

// ==================== 【12】曹衮（魏·寓清於濁·陈木） ====================
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
maokuo_siqian_ban: {
	charlotte: true,
	onremove: true,
},
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

// ==================== 【14】夏侯徽（魏·凋此红芳年·陈木） ====================
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

// ==================== 【15】杨戏（蜀·文心雕龙·辰木） ====================
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

// ==================== 【16】臧洪（群·烈志难立·怀默） ====================
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
maokuo_shameng_used: {
	charlotte: true,
},
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

// ==================== 【17】何晏（魏·浊世太初·七哀凌虚） ====================
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

// ==================== 【19】笮融（群·或坠阿鼻·Geniova） ====================
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
};
