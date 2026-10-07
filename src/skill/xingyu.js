import { lib, game, get, ui, _status } from "noname";

// ============================================================
// 星玉扩展技能（来源：实体民间扩展「星玉」将牌，2023，主创：翔叔）
// 技能文本 OCR 重构与存疑点见：
//   .workbuddy-ai/tmp/xingyu_zip/重构表.md
// ============================================================
export const skills = {
// === 好武 ===
xingyu_haowu: {
	audio: 2,
	direct:true,
	trigger: { player: "gainAfter" },
	filter(event, player) {
		return !!event.cards && event.cards.some((card) => get.subtype(card, false) == "equip1");
	},
	async content(event, trigger, player) {
		const weapons = trigger.cards.filter((card) => get.subtype(card, false) == "equip1");
		for (const card of weapons) {
			if (!player.isIn() || !player.getCards("hejsx").includes(card)) continue;
			const go = await player
				.chooseBool(`好武：是否展示【${get.translation(card)}】并视为使用一张【杀】？`)
				.set("ai", () => (player.getUseValue({ name: "sha", isCard: true }) > 0 ? 1 : 0))
				.forResult();
			if (!go?.bool) continue;
			await player.showCards([card], "好武");
			// 此【杀】结算中临时挂上该武器牌的技能（贯石斧/青龙刀等的询问由此出现）
			const skillIds = get.info(card).skills;
			const list = Array.isArray(skillIds) ? skillIds.slice() : [skillIds];
			const added = [];
			for (const id of list) {
				if (lib.skill[id] && !player.hasSkill(id)) {
					// expire = { player: "useCardAfter" }：这次【杀】结算完自动卸下
					player.addTempSkill(id, { player: "useCardAfter" });
					added.push(id);
				}
			}
			const used = await player
				.chooseUseTarget({ name: "sha", isCard: true })
				.set("addCount", false)
				.forResult();
			if (!used?.bool) {
				// 未实际使用则手动撤回，防止武器技能泄漏到之后无关的杀
				for (const id of added) player.removeSkill(id);
			}
		}
	},
},
// === 英風 ===
xingyu_yingfeng: {
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		return player.hasCard((card) => lib.filter.cardRecastable(card, player) && !get.tag(card, "damage"), "h");
	},
	// ⚠️ range 子技能不能进 group：group 子技能随主技能永久挂载，hasSkill 恒真，
	// addTempSkill 会被早退分支跳过（hasSkill 且无 tempSkills 记录时直接 return），
	// 过期机制失效 → 攻击范围变成永久而非"本回合"。只能由 content 里 addTempSkill 动态挂载。
	subSkill: {
		range: {
			charlotte: true,
			onremove: true,
			name: "英風",
			intro: { content: "攻击范围+#" },
			mod: {
				attackRange(player, num) {
					return num + player.countMark("xingyu_yingfeng_range");
				},
			},
		},
	},
	async content(event, trigger, player) {
		const recastCards = [];
		// 依次重铸任意张不能造成伤害的牌，每重铸一张，本回合攻击范围+1（先加范围，后面的顺手牵羊才够得着远处目标）
		while (player.isIn()) {
			const result = await player
				.chooseCard("h", 1, `英風：你可重铸一张不能造成伤害的牌（已重铸${get.cnNumber(recastCards.length)}张，每张令你本回合攻击范围+1，点取消结束）`)
				.set("filterCard", (card) => lib.filter.cardRecastable(card, player) && !get.tag(card, "damage"))
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (!result?.bool || !result.cards?.length) break;
			const card = result.cards[0];
			recastCards.push(card);
			if (!player.hasSkill("xingyu_yingfeng_range")) {
				// 缺省 expire = { global: ["phaseAfter", "phaseBeforeStart"] }，本回合结束自动消失
				player.addTempSkill("xingyu_yingfeng_range");
			}
			player.addMark("xingyu_yingfeng_range", 1, false);
			await player.recast([card]);
		}
		if (!recastCards.length) return;
		// 然后你可以从重铸的牌里反复选一张使用——用的就是被重铸的那张实体牌（横驰同款），直到没有能使用的牌或你点取消
		const pool = recastCards.slice();
		while (player.isIn() && pool.length) {
			// 可用性走 hasUseTarget（canUse 全链：cardEnabled 的 enable 函数判定 + targetInRange +
			// 严格 targetEnabled），每次使用后重新评估：桃满血、闪无 enable、顺手够不着都正确排除。
			// 别用 targetEnabled2 当"可用目标"判定——它是"允许或 modTarget 涉及"，
			// 桃的 modTarget = isDamaged 会让场上任何受伤角色都误报可用（见知识库"牌的可用性判定全表"）
			const usable = pool.filter((card) => get.position(card, true) == "d" && player.hasUseTarget(card));
			if (!usable.length) break;
			const choose = await player
				.chooseButton([`英風：选择使用一张重铸的牌（还可使用${get.cnNumber(usable.length)}张，点取消结束）`, [usable, "card"]])
				.set("ai", (button) => player.getUseValue(button.link))
				.forResult();
			if (!choose?.bool || !choose.links?.length) break;
			const card = choose.links[0];
			pool.remove(card);
			await player.chooseUseTarget(card, true, "nopopup");
		}
	},
},
// === 逆战 ===
xingyu_nizhan: {
	audio: 2,
	enable: "phaseUse",
	// 出牌阶段限×次，×为体力值
	usable(skill, player) {
		return player.hp;
	},
	filter(event, player) {
		return player.hp > 0 && game.hasPlayer((cur) => cur != player && cur.countCards("h") > player.countCards("h"));
	},
	filterTarget(card, player, target) {
		return target != player && target.countCards("h") > player.countCards("h");
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		const result = await player
			.choosePlayerCard(target, true, "h", `逆战：弃置${get.translation(target)}的一张手牌`)
			.forResult();
		const card = result?.cards?.[0];
		if (!card) return;
		const isSha = get.name(card) == "sha";
		await player.discard([card]);
		if (!isSha || !player.isIn() || !target.isIn()) return;
		// 视为其对你使用一张【决斗】，此【决斗】双方打出【杀】的总数不能超过×（×=你的体力值）
		// 限制由 _cap 子技能在决斗的 "juedou" 触发时机实现：总数达标后把当前应答方的 shaReq 归零
		player.addTempSkill("xingyu_nizhan_cap");
		const vcard = get.autoViewAs({ name: "juedou" }, []);
		await target.useCard(vcard, [], player, "xingyu_nizhan");
	},
},
xingyu_nizhan_cap: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: "juedou" },
	filter(event, player) {
		// 只对逆战派生的决斗生效（useCard 第4参字符串 = event.skill）
		return event.skill == "xingyu_nizhan" && event.playerCards && event.targetCards;
	},
	async content(event, trigger, player) {
		const total = trigger.playerCards.length + trigger.targetCards.length;
		if (total >= player.hp) {
			// 已达上限：即将应答的一方视为打不出杀（shaReq 归零 → 直接受伤，决斗结束）
			trigger.shaReq[trigger.turn.playerid] = 0;
		}
	},
},
// === 赤胆 ===
xingyu_chidan: {
	audio: 2,
	forced: true,
	trigger: { player: "phaseJieshuBegin" },
	async content(event, trigger, player) {
		const nizhan = player.getHistory("useSkill", (evt) => evt.skill == "xingyu_nizhan").length;
		const shas = player.getHistory("useCard", (evt) => evt.card && get.name(evt.card) == "sha").length;
		const num = nizhan + shas;
		const cur = player.countCards("h");
		if (cur < num) {
			await player.draw(num - cur);
		} else if (cur > num) {
			const result = await player
				.chooseCard("h", true, cur - num, `赤胆：弃置${get.cnNumber(cur - num)}张手牌`)
				.forResult();
			if (result?.cards?.length) await player.discard(result.cards);
		}
	},
},
// === 烈锋 ===
xingyu_liefeng: {
	audio: 2,
	// 双时机共用一个 filter/content（避免 dupkey）：伤害增伤 + 杀死角色成长
	trigger: {
		source: "damageBegin1",
		global: ["dieAfter", "die"],
	},
	filter(event, player, name) {
		if (event.name == "die") return event.source == player && player.isIn();
		return event.player != player && event.num > 0;
	},
	async content(event, trigger, player) {
		if (trigger.name == "die") {
			await player.gainMaxHp(1);
			await player.recover(1);
			player.removeSkill("xingyu_liefeng");
			// 当你失去"烈锋"时，重置"肃靖"（enableSkill 传 awakenSkill 的禁用键，见 AGENTS 红线4）
			if (player.storage.xingyu_sujing) {
				player.restoreSkill("xingyu_sujing");
				player.enableSkill("xingyu_sujing_awake");
			}
		} else {
			const go = await player
				.chooseBool("烈锋：是否失去1点体力，令此伤害+1？")
				.set("ai", () => (trigger.num >= 1 && player.hp > 1 ? 1 : 0))
				.forResult();
			if (!go?.bool) return;
			await player.loseHp(1);
			trigger.num++;
		}
	},
},
// === 怒芒 ===
xingyu_numang: {
	audio: 2,
	trigger: {
		player: ["damageAfter", "dying"],
	},
	filter(event, player, name) {
		if (event.name == "dying") return event.player == player;
		return event.num > 0 && event.source && event.source != player && event.source.isIn();
	},
	async content(event, trigger, player) {
		if (trigger.name == "dying") {
			await player.gainMaxHp(1);
			if (player.hp < 1) await player.recover(1 - player.hp);
			player.removeSkill("xingyu_numang");
			// 当你失去"怒芒"时，重置"盛威"
			if (player.storage.xingyu_shengwei) {
				player.restoreSkill("xingyu_shengwei");
				player.enableSkill("xingyu_shengwei_awake");
			}
		} else {
			const go = await player
				.chooseBool(`怒芒：是否弃置两张牌，对${get.translation(trigger.source)}造成1点伤害？`)
				.set("ai", () => (player.countCards("he") >= 2 ? 1 : 0))
				.forResult();
			if (!go?.bool) return;
			const result = await player
				.chooseCard("he", 2, true, "怒芒：弃置两张牌")
				.set("ai", (card) => 5 - get.value(card))
				.forResult();
			if (!result?.cards || result.cards.length < 2) return;
			await player.discard(result.cards);
			await trigger.source.damage(player, 1);
		}
	},
},
// === 肃靖 ===
xingyu_sujing: {
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "metal",
	enable: "phaseUse",
	filter(event, player) {
		return !player.storage.xingyu_sujing && game.hasPlayer((cur) => cur.countCards("h") > cur.hp);
	},
	filterTarget(card, player, target) {
		return target.countCards("h") > target.hp;
	},
	selectTarget: () => [1, game.countPlayer()],
	async content(event, trigger, player) {
		player.awakenSkill(event.name);
		for (const target of event.targets) {
			if (!target.isIn()) continue;
			const num = target.countCards("h") - target.hp;
			if (num <= 0) continue;
			// 被令角色自己选择弃置哪些牌（弃置至体力值）
			const result = await target
				.chooseCard("h", true, num, `肃靖：将手牌弃置至体力值（还须弃置${get.cnNumber(num)}张）`)
				.set("ai", (card) => 5 - get.value(card))
				.forResult();
			if (result?.cards?.length) await target.discard(result.cards);
		}
	},
},
// === 盛威 ===
xingyu_shengwei: {
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "metal",
	enable: "phaseUse",
	filter(event, player) {
		return !player.storage.xingyu_shengwei && game.hasPlayer((cur) => cur.countCards("h") < cur.maxHp);
	},
	filterTarget(card, player, target) {
		return target.countCards("h") < target.maxHp;
	},
	selectTarget: () => [1, game.countPlayer()],
	async content(event, trigger, player) {
		player.awakenSkill(event.name);
		for (const target of event.targets) {
			if (!target.isIn()) continue;
			const num = target.maxHp - target.countCards("h");
			if (num > 0) await target.draw(num);
		}
	},
},
xingyu_dubu: {
	audio: 2,
	group: ["xingyu_dubu_use", "xingyu_dubu_damage"],
	// 每回合限一次；体力上限≤2 或 装备栏数≤2 时改为每回合限两次
	getLimit(player) {
		return player.maxHp <= 2 || player.countEnabledSlot() <= 2 ? 2 : 1;
	},
	usedCount(player) {
		return player.getHistory("useSkill", (evt) => typeof evt.skill == "string" && evt.skill.startsWith("xingyu_dubu")).length;
	},
	// 共享结算：doDubu(event, player, target)
	async doDubu(event, player, target) {
		// 代价：减1点体力上限 或 废除一个装备栏
		const slots = [1, 2, 3, 4, 5].filter((i) => player.countEnabledSlot(i) > 0);
		const slotNames = { 1: "武器栏", 2: "防具栏", 3: "+1坐骑栏", 4: "-1坐骑栏", 5: "宝物栏" };
		const controls = ["减1点体力上限"];
		const ctrlSlots = [];
		for (const i of slots) {
			controls.push(slotNames[i]);
			ctrlSlots.push(i);
		}
		const cost = await player
			.chooseControl(controls)
			.set("prompt", "独步：选择代价")
			.set("ai", () => (player.maxHp > 2 ? 0 : 1))
			.forResult();
		if (cost?.index == 0) {
			await player.loseMaxHp(1);
		} else if (cost?.index != null && cost.index > 0) {
			await player.disableEquip(ctrlSlots[cost.index - 1]);
		}
		if (!player.isIn() || !target.isIn()) return;
		await target.damage(player, 1);
		// 额外效果（按发动时机状态判定；减体力上限的代价本身可能使条件成立）
		if (player.maxHp <= 2) {
			const extra1 = await player
				.chooseTarget(`独步：是否扣减一名你距离1以内的角色1点体力上限？`, (card, me, t) => t != me && me.distanceTo(t) <= 1 && t.maxHp > 1)
				.set("ai", (button) => {
					const t = button.link;
					const me = get.event().player;
					return -get.attitude(me, t) * (t.maxHp > 2 ? 2 : 1);
				})
				.forResult();
			if (extra1?.bool && extra1.targets?.length) {
				player.line(extra1.targets, "metal");
				await extra1.targets[0].loseMaxHp(1);
			}
		}
		if (player.countEnabledSlot() <= 2) {
			const extra2 = await player
				.chooseTarget(`独步：是否废除一名你距离1以内的角色的一个装备栏？`, (card, me, t) => t != me && me.distanceTo(t) <= 1 && [1, 2, 3, 4, 5].some((i) => t.countEnabledSlot(i) > 0))
				.set("ai", (button) => -get.attitude(get.event().player, button.link))
				.forResult();
			if (extra2?.bool && extra2.targets?.length) {
				const t = extra2.targets[0];
				player.line([t], "metal");
				const tSlots = [1, 2, 3, 4, 5].filter((i) => t.countEnabledSlot(i) > 0);
				const tCtrls = tSlots.map((i) => slotNames[i]);
				const pick = await player
					.chooseControl(tCtrls)
					.set("prompt", `独步：选择废除${get.translation(t)}的哪个装备栏`)
					.set("ai", () => 0)
					.forResult();
				if (pick?.index != null) await t.disableEquip(tSlots[pick.index]);
			}
		}
	},
},
xingyu_dubu_use: {
	audio: "xingyu_dubu",
	enable: "phaseUse",
	usable(skill, player) {
		return lib.skill.xingyu_dubu.getLimit(player) - lib.skill.xingyu_dubu.usedCount(player);
	},
	filter(event, player) {
		return lib.skill.xingyu_dubu.usedCount(player) < lib.skill.xingyu_dubu.getLimit(player) && game.hasPlayer((cur) => cur != player && player.inRange(cur));
	},
	filterTarget(card, player, target) {
		return target != player && player.inRange(target);
	},
	async content(event, trigger, player) {
		await lib.skill.xingyu_dubu.doDubu(event, player, event.targets[0]);
	},
},
xingyu_dubu_damage: {
	audio: "xingyu_dubu",
	trigger: { player: "damageAfter" },
	direct: true,
	filter(event, player) {
		return event.num > 0 && lib.skill.xingyu_dubu.usedCount(player) < lib.skill.xingyu_dubu.getLimit(player) && game.hasPlayer((cur) => cur != player && player.inRange(cur));
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool("独步：是否减1点体力上限或废除一个装备栏，对你攻击范围内的一名角色造成1点伤害？")
			.set("ai", () => (player.hp > 1 || player.countCards("e") > 0 ? 1 : 0))
			.forResult();
		if (!go?.bool) return;
		const result = await player
			.chooseTarget("独步：选择攻击范围内的一名角色", true, (card, me, t) => t != me && me.inRange(t))
			.set("ai", (button) => -get.attitude(get.event().player, button.link))
			.forResult();
		if (!result?.bool || !result.targets?.length) return;
		await lib.skill.xingyu_dubu.doDubu(event, player, result.targets[0]);
	},
},
// === 回戈⚠ ===
xingyu_fanpu: {
	audio: 2,
	trigger: { global: "phaseEnd" },
	direct: true,
	filter(event, player) {
		if (event.player == player || !event.player.isIn()) return false;
		// 本回合（该角色回合）你受到过伤害，或失去了至少两张牌
		const damaged = player.getHistory("damage", (evt) => evt.num > 0).length > 0;
		const lost = player
			.getHistory("lose")
			.reduce((n, evt) => n + (evt.hs?.length || 0) + (evt.es?.length || 0) + (evt.js?.length || 0) + (evt.ss?.length || 0), 0);
		return damaged || lost >= 2;
	},
	async content(event, trigger, player) {
		const enemy = trigger.player;
		const go = await player
			.chooseBool(`回戈：是否执行一个只能对${get.translation(enemy)}使用牌的回合？`)
			.set("ai", () => (get.attitude(player, enemy) < 0 ? 1 : 0))
			.forResult();
		if (!go?.bool) return;
		player.storage.xingyu_fanpu_enemy = enemy;
		player.addTempSkill("xingyu_fanpu_turn");
		await player.insertPhase();
	},
},
xingyu_fanpu_turn: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "戈",
	intro: { name: "回戈", content: "本回合只能对$使用牌" },
	// 两职责合一对象（避免 dupkey）：拦截不指定仇敌的用牌 + 自己回合结束清理
	trigger: { global: ["useCardBegin", "phaseEnd"] },
	forced: true,
	silent: true,
	popup: false,
	filter(event, player, name) {
		const enemy = player.storage.xingyu_fanpu_enemy;
		if (name == "phaseEnd") return event.player == player;
		return event.player == player && enemy && enemy.isIn() && event.targets && event.targets.length > 0 && !event.targets.includes(enemy);
	},
	async content(event, trigger, player) {
		if (trigger.name == "phase") {
			player.removeSkill("xingyu_fanpu_turn");
			return;
		}
		trigger.cancel();
		player.popup("回戈");
	},
},
// === 俊逸 ===
xingyu_junyi: {
	audio: 2,
	// 视为拥有"闭月"：结束阶段没有防具牌时可摸一张牌（锁定技保证检查，闭月本身仍可选）
	forced: true,
	trigger: { player: "phaseJieshuBegin" },
	filter(event, player) {
		return !player.getCards("e").some((card) => get.subtype(card) == "equip2");
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool("俊逸：视为拥有〖闭月〗，是否摸一张牌？")
			.set("ai", () => 1)
			.forResult();
		if (go?.bool) await player.draw();
	},
},
// === 饕⚠ ===
xingyu_taoxin: {
	audio: 2,
	forced: true,
	trigger: {
		global: "phaseEnd",
		player: "phaseBegin",
	},
	filter(event, player, name) {
		if (name == "phaseBegin") {
			// 你的回合开始时，若你的手牌数为全场最多，你执行"贾利"的一项
			return !game.hasPlayer((cur) => cur != player && cur.countCards("h") > player.countCards("h"));
		}
		// 其他角色的回合结束时，若你的手牌数不为全场最多，你获得其本回合弃置而置入弃牌堆的所有牌
		return event.player != player && event.player.isIn() && game.hasPlayer((cur) => cur.countCards("h") > player.countCards("h"));
	},
	async content(event, trigger, player) {
		if (event.triggername == "phaseBegin") {
			await lib.skill.xingyu_jiali.exec(event, player, player, player);
			return;
		}
		const cards = trigger.player
			.getHistory("lose", (evt) => evt.type == "discard")
			.flatMap((evt) => evt.cards || [])
			.filter((card) => get.position(card, true) == "d");
		if (cards.length) await player.gain(cards, "gain2", "log");
	},
},
// === 贾利 ===
xingyu_jiali: {
	audio: 2,
	trigger: { global: "phaseBegin" },
	// 每轮限一次（roundNumber 自计数）
	filter(event, player) {
		if (event.player == player || !player.countCards("he")) return false;
		return player.storage.xingyu_jiali_round != game.roundNumber;
	},
	async cost(event, trigger, player) {
		const target = trigger.player;
		const result = await player
			.chooseCard("he", `贾利：是否交给${get.translation(target)}一张牌？`)
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!result?.bool || !result.cards?.length) return void (event.result = { bool: false });
		event.result = { bool: true, cost_data: { cards: result.cards, target } };
	},
	async content(event, trigger, player) {
		const { cards, target } = event.cost_data;
		player.storage.xingyu_jiali_round = game.roundNumber;
		await player.give(cards, target);
		await lib.skill.xingyu_jiali.exec(event, player, target, target);
	},
	// 选项结算（贾利本体与饕的"执行贾利的一项"共用）
	// exec(event, player, actor, chooser)：actor=执行阶段/废除栏的人，chooser=选选项的人
	async exec(event, player, actor, chooser) {
		const slotNames = { 1: "武器栏", 2: "防具栏", 3: "+1坐骑栏", 4: "-1坐骑栏", 5: "宝物栏" };
		const hasSlot = [1, 2, 3, 4, 5].some((i) => actor.countEnabledSlot(i) > 0);
		const controls = hasSlot ? ["执行一个额外的弃牌阶段，然后摸一张牌", "废除一个装备栏，并执行一个额外的出牌阶段"] : ["执行一个额外的弃牌阶段，然后摸一张牌"];
		const pick = await chooser
			.chooseControl(controls)
			.set("prompt", "贾利：选择一项")
			.set("ai", () => {
				// 简易 AI：自己的话选弃牌阶段（通常手牌溢出才有收益由外层判断），这里偏选项1
				return 0;
			})
			.forResult();
		if (pick?.index == 1) {
			const slots = [1, 2, 3, 4, 5].filter((i) => actor.countEnabledSlot(i) > 0);
			const ctrl = await actor
				.chooseControl(slots.map((i) => slotNames[i]))
				.set("prompt", "贾利：选择废除一个装备栏")
				.set("ai", () => 0)
				.forResult();
			if (ctrl?.index != null) await actor.disableEquip(slots[ctrl.index]);
			if (actor.isIn()) await actor.phaseUse();
		} else {
			await actor.phaseDiscard();
			if (actor.isIn()) await actor.draw();
		}
	},
},
xingyu_suifu: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filterTarget(card, player, target) {
		return target != player;
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		// 观看我区域里的所有牌（手牌+装备+判定），展示其中一张并获得之
		const view = await target
			.choosePlayerCard(player, true, "hej", "绥抚：观看并展示获得其中一张牌")
			.set("ai", (button) => (button.link ? get.value(button.link) : get.value(button)))
			.forResult();
		const card = view?.cards?.[0];
		if (!card) return;
		await target.showCards([card], "绥抚");
		await target.gain([card], "gain2", "log");
		if (get.type(card) == "basic") {
			// 基本牌：其可以视为使用任意一种基本牌；若使用的牌与其获得的牌牌名相同，你摸一张牌
			const go = await target
				.chooseBool("绥抚：是否视为使用一种基本牌？")
				.set("ai", () => 0)
				.forResult();
			if (!go?.bool) return;
			const pick = await target
				.chooseControl("sha", "shan", "tao", "jiu")
				.set("prompt", "绥抚：选择视为使用的基本牌")
				.set("ai", () => {
					const me = get.event().player;
					if (me.hp < me.maxHp) return "tao";
					if (me.countCards("h", (c) => get.name(c) == "sha") > 0) return "sha";
					return "shan";
				})
				.forResult();
			if (!pick?.control) return;
			const vcard = get.autoViewAs({ name: pick.control }, []);
			const used = await target.chooseUseTarget(vcard);
			if (used?.bool && pick.control == get.name(card)) await player.draw();
		} else {
			// 非基本牌：其可以使用之；若如此做，你于结束阶段摸×张牌并交给其一张牌（×=你已损失的体力值且至少为1）
			const used = await target.chooseUseTarget(card);
			if (used?.bool) {
				player.storage.xingyu_suifu_target = target;
				player.addTempSkill("xingyu_suifu_due");
			}
		}
	},
},
xingyu_suifu_due: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "phaseJieshuBegin" },
	async content(event, trigger, player) {
		const x = Math.max(1, player.maxHp - player.hp);
		await player.draw(x);
		const target = player.storage.xingyu_suifu_target;
		if (target?.isIn()) {
			const give = await player
				.chooseCard("he", true, `绥抚：交给${get.translation(target)}一张牌`)
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (give?.cards?.length) await player.give(give.cards, target);
		}
	},
},
xingyu_jiyu: {
	audio: 2,
	trigger: { global: "phaseZhunbeiBegin" },
	direct: true,
	filter(event, player) {
		return event.player != player && player.countCards("h") > 0;
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const go = await player
			.chooseBool(`戢羽：是否弃置一张手牌，令${get.translation(target)}本回合计算与除其外的角色距离±×（×为你的体力值${player.hp}）？`)
			.set("ai", () => (player.countCards("h") > 1 ? 1 : 0))
			.forResult();
		if (!go?.bool) return;
		const discard = await player
			.chooseCard("h", true, "戢羽：弃置一张手牌")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!discard?.cards?.length) return;
		player.logSkill("xingyu_jiyu", target);
		await player.discard(discard.cards);
		const ctrl = await player
			.chooseControl("距离+×", "距离-×")
			.set("prompt", "戢羽：选择方向")
			.set("ai", () => (get.attitude(player, target) > 0 ? 1 : 0))
			.forResult();
		const num = ctrl?.index == 0 ? player.hp : -player.hp;
		target.storage.xingyu_jiyu_x = num;
		target.addTempSkill("xingyu_jiyu_dist");
		// 若你以此法弃置了最后的手牌，其选择令你回复1点体力，或你对其造成1点伤害
		if (player.countCards("h") == 0) {
			const pick = await target
				.chooseControl("令其回复1点体力", "令其对你造成1点伤害")
				.set("prompt", "戢羽：其弃置了最后的手牌，请你选择")
				.set("ai", () => (get.attitude(target, player) > 0 ? 0 : 1))
				.forResult();
			if (pick?.index == 0) {
				await player.recover(1);
			} else if (pick?.index == 1) {
				await player.damage(target, 1);
			}
		}
	},
},
xingyu_jiyu_dist: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "羽",
	intro: { name: "戢羽", content: "本回合计算与其他角色的距离$（自身除外）" },
	mod: {
		globalFrom(from, to, distance) {
			return distance + (from.storage.xingyu_jiyu_x || 0);
		},
	},
},
xingyu_bogua: {
	audio: 2,
	trigger: { global: "phaseZhunbeiBegin" },
	direct: true,
	filter(event, player) {
		// 每轮限一次（roundNumber 自计数）
		return player.storage.xingyu_bogua_round != game.roundNumber && event.player.isIn();
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const go = await player
			.chooseBool(`卜卦：是否为${get.translation(target)}判定一次？`)
			.set("ai", () => (get.attitude(player, target) != 0 ? 1 : 0))
			.forResult();
		if (!go?.bool) return;
		player.storage.xingyu_bogua_round = game.roundNumber;
		player.logSkill("xingyu_bogua", target);
		const judge = await target.judge();
		// 直到你的下个回合结束：由 _black/_red 内部的 phaseEnd 监听移除
		target.storage.xingyu_bogua_caster = player;
		target.addTempSkill(judge.color == "black" ? "xingyu_bogua_black" : "xingyu_bogua_red");
	},
},
xingyu_bogua_black: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "卦",
	intro: { name: "卜卦·黑", content: "使用和受到牌造成的伤害均+1，直到卜卦者下个回合结束" },
	trigger: {
		player: "damageBegin1",
		source: "damageBegin1",
		global: "phaseEnd",
	},
	forced: true,
	silent: true,
	popup: false,
	filter(event, player, name) {
		if (event.name == "phase") return event.player == player.storage.xingyu_bogua_caster;
		return !!event.card;
	},
	async content(event, trigger, player) {
		if (trigger.name == "phase") {
			player.removeSkill("xingyu_bogua_black");
			return;
		}
		trigger.num++;
	},
},
xingyu_bogua_red: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "卦",
	intro: { name: "卜卦·红", content: "至其他角色和其他角色至其的距离均-1，直到卜卦者下个回合结束" },
	trigger: { global: "phaseEnd" },
	forced: true,
	silent: true,
	popup: false,
	mod: {
		globalFrom(from, to, distance) {
			return Math.max(1, distance - 1);
		},
		globalTo(from, to, distance) {
			return Math.max(1, distance - 1);
		},
	},
	filter(event, player) {
		return event.player == player.storage.xingyu_bogua_caster;
	},
	async content(event, trigger, player) {
		player.removeSkill("xingyu_bogua_red");
	},
},
xingyu_juechou: {
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "water",
	trigger: { player: "phaseUseBegin" },
	direct: true,
	filter(event, player) {
		return !player.storage.xingyu_juechou && game.hasPlayer((cur) => cur != player && player.inRange(cur) && cur.hp > player.hp);
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool("决仇：是否指定攻击范围内一名体力值大于你的角色？（本回合你可以将红色的牌当【杀】对其使用，且对其使用【杀】无次数限制）")
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		const result = await player
			.chooseTarget("决仇：选择体力值大于你的目标", true, (card, me, t) => t != me && me.inRange(t) && t.hp > me.hp)
			.set("ai", (button) => -get.attitude(get.event().player, button.link))
			.forResult();
		if (!result?.targets?.length) return;
		player.awakenSkill("xingyu_juechou");
		player.logSkill("xingyu_juechou", result.targets);
		player.storage.xingyu_juechou_t = result.targets[0];
		player.addTempSkill("xingyu_juechou_eff");
	},
},
xingyu_juechou_eff: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "仇",
	intro: { name: "决仇", content: "本回合可以将红色的牌当【杀】对$使用，且对其使用【杀】无次数限制" },
	mod: {
		cardUsable(card, player) {
			if (get.name(card) == "sha") return Infinity;
		},
	},
	viewAs: { name: "sha", isCard: true },
	filterCard(card) {
		return get.color(card) == "red" && get.position(card) == "h";
	},
	selectCard: 1,
	filterTarget(card, player, target) {
		return target == player.storage.xingyu_juechou_t;
	},
	prompt: "决仇：将一张红色牌当【杀】对目标使用",
},
xingyu_qianci: {
	audio: 2,
	trigger: {
		player: "gainAfter",
		global: "loseAsyncAfter",
	},
	direct: true,
	filter(event, player) {
		// 每回合限一次
		if (player.getHistory("useSkill", (evt) => evt.skill == "xingyu_qianci").length > 0) return false;
		const cards = event.cards || (event.hs ? event.hs : []);
		return cards.some((card) => get.name(card) == "sha" || get.subtype(card) == "equip1");
	},
	async content(event, trigger, player) {
		const gained = (trigger.cards || trigger.hs || []).filter((card) => (get.name(card) == "sha" || get.subtype(card) == "equip1") && player.getCards("he").includes(card));
		if (!gained.length) return;
		const go = await player
			.chooseBool("谦辞：是否弃置获得的【杀】/武器牌，视为对一名角色使用一张【酒】/【桃】？")
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		const card = gained[0];
		await player.discard([card]);
		const ctrl = await player
			.chooseControl("jiu", "tao")
			.set("prompt", "谦辞：视为使用哪种牌")
			.set("ai", () => (player.isDamaged() ? "tao" : "jiu"))
			.forResult();
		const name = ctrl?.control || "tao";
		const result = await player
			.chooseTarget(`谦辞：选择${name == "jiu" ? "【酒】" : "【桃】"}的目标`, true)
			.set("ai", (button) => {
				const t = button.link;
				const me = get.event().player;
				return get.attitude(me, t);
			})
			.forResult();
		if (!result?.targets?.length) return;
		player.logSkill("xingyu_qianci", result.targets);
		await player.useCard(get.autoViewAs({ name }, []), [], result.targets, "xingyu_qianci");
	},
},
xingyu_qingke: {
	audio: 2,
	trigger: { global: "phaseUseBegin" },
	direct: true,
	filter(event, player) {
		return event.player != player && event.player.isIn() && player.countCards("h") > 0;
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const go = await player
			.chooseBool(`清恪：是否向${get.translation(target)}展示所有手牌并弃置一至两张牌？`)
			.set("ai", () => (player.countCards("h") >= 2 ? 1 : 0))
			.forResult();
		if (!go?.bool) return;
		await player.showCards(player.getCards("h"), "清恪");
		const num = Math.min(2, player.countCards("h"));
		const result = await player
			.chooseCard("h", true, [1, num], "清恪：弃置一至两张手牌")
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!result?.cards?.length) return;
		const x = result.cards.length;
		await player.discard(result.cards);
		// 该角色可以交给你×张牌
		const give = await target
			.chooseBool(`清恪：是否交给${get.translation(player)}${get.cnNumber(x)}张牌？`)
			.set("ai", () => (get.attitude(target, player) > 0 ? 1 : 0))
			.forResult();
		if (give?.bool) {
			const cards = await target
				.chooseCard("h", true, x, `清恪：交给${get.translation(player)}${get.cnNumber(x)}张牌`)
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (cards?.cards?.length) await target.give(cards.cards, player);
		}
		// 若你的手牌花色各不相同，其可以执行以下一项
		const suits = player.getCards("h").map((card) => get.suit(card)).unique();
		if (suits.length == player.countCards("h") && player.countCards("h") > 0) {
			const pick = await target
				.chooseControl("摸" + get.cnNumber(x) + "张牌", "结束阶段获得其至多" + get.cnNumber(x) + "张弃牌", "弃置场上一张武器牌")
				.set("prompt", "清恪：请选择执行的一项")
				.set("ai", () => 0)
				.forResult();
			if (pick?.index == 0) {
				await target.draw(x);
			} else if (pick?.index == 1) {
				target.storage.xingyu_qingke_x = x;
				target.addTempSkill("xingyu_qingke_pick");
			} else if (pick?.index == 2) {
				const weapons = [];
				game.players.forEach((cur) => weapons.add(cur.getCards("e").filter((card) => get.subtype(card) == "equip1")));
				if (weapons.length) {
					const choose = await target
						.chooseButton([`清恪：弃置场上一张武器牌`, [weapons, "card"]], true)
						.set("ai", (button) => get.value(button.link))
						.forResult();
					if (choose?.links?.length) await target.discard(choose.links);
				}
			}
		}
	},
},
xingyu_qingke_pick: {
	charlotte: true,
	onremove: true,
	trigger: { player: "phaseJieshuBegin" },
	forced: true,
	silent: true,
	popup: false,
	filter(event, player) {
		return player.storage.xingyu_qingke_x > 0;
	},
	async content(event, trigger, player) {
		const x = player.storage.xingyu_qingke_x;
		player.storage.xingyu_qingke_x = 0;
		// 其于本回合弃置的牌（在弃牌堆里的）
		const discarded = player
			.getHistory("discard")
			.flatMap((evt) => evt.cards || [])
			.filter((card) => get.position(card, true) == "d")
			.slice(0, x);
		if (discarded.length) {
			const choose = await player
				.chooseButton([`清恪：获得至多${get.cnNumber(x)}张你本回合弃置的牌`, [discarded, "card"]], [1, x])
				.set("ai", (button) => get.value(button.link))
				.forResult();
			if (choose?.links?.length) await player.gain(choose.links, "gain2", "log");
		}
	},
},
xingyu_qiaogong: {
	audio: 2,
	enable: "phaseUse",
	usable: () => 1,
	filter(event, player) {
		// 未发动过，或上次发动时无视了「限一次」
		const used = player.getHistory("useSkill", (evt) => evt.skill == "xingyu_qiaogong").length;
		return used == 0 || !!player.storage.xingyu_qiaogong_free;
	},
	filterTarget(card, player, target) {
		if (!target.countCards("e") && !player.storage.xingyu_qiaogong_ig1) return false;
		if (!(target.countCards("h") < player.countCards("h")) && !player.storage.xingyu_qiaogong_ig2) return false;
		return true;
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		// 声明发动前：弃置一至三张装备牌，按顺序无视「装备区有牌的」「手牌数小于你的」「限一次」
		const result = await player
			.chooseCard("e", [0, 3], `巧工：是否弃置一至三张装备牌？（按顺序无视「装备区有牌的」「手牌数小于你的」「限一次」，且你多摸等量的牌）`)
			.set("ai", (card) => (player.countCards("e") > 1 ? 4 - get.value(card) : 0))
			.forResult();
		let x = 0;
		if (result?.cards?.length) {
			x = result.cards.length;
			await player.discard(result.cards);
		}
		player.storage.xingyu_qiaogong_ig1 = x >= 1;
		player.storage.xingyu_qiaogong_ig2 = x >= 2;
		const igLimit = x >= 3;
		// 过滤条件（含无视）
		const ok1 = target.countCards("e") > 0 || player.storage.xingyu_qiaogong_ig1;
		const ok2 = target.countCards("h") < player.countCards("h") || player.storage.xingyu_qiaogong_ig2;
		if (!ok1 || !ok2) {
			delete player.storage.xingyu_qiaogong_ig1;
			delete player.storage.xingyu_qiaogong_ig2;
			return;
		}
		await target.draw(1);
		if (x > 0) await player.draw(x);
		delete player.storage.xingyu_qiaogong_ig1;
		delete player.storage.xingyu_qiaogong_ig2;
		// 「限一次」：本次发动不计入次数（下次仍可发动）
		player.storage.xingyu_qiaogong_free = igLimit;
	},
},
xingyu_qinjian: {
	audio: 2,
	trigger: {
		global: ["cardsDiscardAfter", "loseAsyncAfter"],
	},
	direct: true,
	filter(event, player) {
		const cards = event.cards || [];
		return cards.some((card) => get.position(card, true) == "d" && get.subtype(card).startsWith("equip") && player.countEnabledSlot() > 0);
	},
	async content(event, trigger, player) {
		const cards = (trigger.cards || []).filter((card) => get.position(card, true) == "d" && get.subtype(card).startsWith("equip"));
		for (const card of cards) {
			if (!player.isIn()) return;
			if (get.position(card, true) != "d") continue;
			const subtype = get.subtype(card);
			// 若你对应的装备栏没有牌
			const occupied = player.getCards("e").some((equip) => get.subtype(equip) == subtype);
			if (occupied) continue;
			const go = await player
				.chooseBool(`勤践：是否将【${get.translation(card)}】置入你的装备区？`)
				.set("ai", () => (get.value(card) > 3 ? 1 : 0))
				.forResult();
			if (!go?.bool) continue;
			player.logSkill("xingyu_qinjian");
			await player.gain([card], "gain2", "log");
			if (player.getCards("he").includes(card)) await player.equip(card);
		}
	},
},
// 共享"响应改移牌"逻辑挂在 xingyu_linan 下（阮籍·酾难 与 神孙权·断江 同款）
xingyu_linan: {
	// 返回 true 表示已按"移牌视为打出"处理（响应失败但对应伤害被防）
	async moveRespond(event, player, responder) {
		const useCard = event.getParent("useCard");
		if (!useCard || !useCard.card) return false;
		const name = useCard.card.name;
		const need = name == "nanman" || name == "juedou" ? "sha" : name == "wanjia" || name == "sha" ? "shan" : null;
		if (!need) return false;
		// 其判定区或装备区的一张牌 → 你的对应区域
		const cards = responder.getCards("je");
		if (!cards.length) return false;
		const pick = await responder
			.chooseCard("je", false, `是否将一张牌移动至${get.translation(player)}的对应区域，视为打出【${need == "sha" ? "杀" : "闪"}】？`)
			.set("ai", (card) => (get.position(card) == "j" || get.value(card) < 4 ? 10 : 0))
			.forResult();
		if (!pick?.bool || !pick.cards?.length) return false;
		const card = pick.cards[0];
		const isJudge = get.position(card) == "j";
		if (isJudge) {
			await player.addJudge(card);
		} else {
			await player.gain([card], "gain2");
			if (player.getCards("he").includes(card)) await player.equip(card);
		}
		// 视为打出：响应失败，但由移牌防止对应的伤害
		responder.addTempSkill("xingyu_linan_guard");
		game.log(responder, "将一张牌移动至", player, "的对应区域，视为打出了", "#g" + (need == "sha" ? "【杀】" : "【闪】"));
		return true;
	},
	audio: 2,
	trigger: { global: "chooseToRespondBegin" },
	direct: true,
	filter(event, player) {
		// 其他角色响应"我"发起的杀/闪需求
		if (!event.respondTo || event.respondTo[0] != player || event.player == player) return false;
		return !!event.getParent("useCard");
	},
	async content(event, trigger, player) {
		const responder = trigger.player;
		await lib.skill.xingyu_linan.moveRespond(trigger, player, responder);
	},
},
xingyu_linan_guard: {
	charlotte: true,
	onremove: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "damageBegin4" },
	filter(event, player) {
		return !!event.card && !player.storage.xingyu_linan_used;
	},
	async content(event, trigger, player) {
		player.storage.xingyu_linan_used = true;
		trigger.cancel();
		player.removeSkill("xingyu_linan_guard");
	},
},
xingyu_yinling: {
	audio: 2,
	trigger: { global: ["phaseEnd", "useCardToTargeted"] },
	direct: true,
	filter(event, player, name) {
		if (name == "useCardToTargeted") {
			// 记录本回合我成为目标的牌
			if (event.target != player) return false;
			return true;
		}
		// 回合结束：本回合我仅成为过一张牌的目标
		if (player.storage.xingyu_yinling_cards?.length != 1) return false;
		return player.isIn();
	},
	async content(event, trigger, player) {
		if (trigger.name == "useCardToTargeted") {
			if (!player.storage.xingyu_yinling_cards) player.storage.xingyu_yinling_cards = [];
			player.storage.xingyu_yinling_cards.push(trigger.card);
			return;
		}
		const thatCard = player.storage.xingyu_yinling_cards[0];
		player.storage.xingyu_yinling_cards = [];
		const len = get.translation(thatCard.name).length;
		// 视为使用一张与该牌牌名字数和为5的基本牌或普通锦囊牌
		const names = Object.keys(lib.card).filter((key) => {
			const info = lib.card[key];
			if (!info || info.mode || key.startsWith("_")) return false;
			const type = info.type;
			if (type != "basic" && type != "trick") return false;
			if (key == "shan" || key == "wuxie") return false;
			return get.translation(key).length == 5 - len;
		});
		if (!names.length) return;
		const go = await player
			.chooseBool(`吟翎：是否视为使用一张与【${get.translation(thatCard.name)}】牌名字数和为5的牌？`)
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		const choose = await player
			.chooseButton([`吟翎：选择视为使用的牌`, [names.map((name) => [name, lib.card[name].type]), "vcard"]], true)
			.set("ai", (button) => get.value({ name: button.link }))
			.forResult();
		if (!choose?.links?.length) return;
		const name = choose.links[0];
		const drunk = typeof player.hasWine == "function" ? player.hasWine() : false;
		const vcard = get.autoViewAs({ name }, []);
		// 若你不处于【酒】状态，以此法使用的牌仅对一个目标生效
		if (!drunk) {
			await player.chooseUseTarget(vcard, true, "singleTarget");
		} else {
			await player.useCard(vcard, [], "xingyu_yinling");
		}
	},
},
xingyu_xianlue: {
	// 同势力判定（含双势力兜底）
	sameGroup(a, b) {
		if (!a || !b) return false;
		const ga = new Set([a.group, a.group2].filter(Boolean));
		const gb = new Set([b.group, b.group2].filter(Boolean));
		for (const g of ga) if (gb.has(g)) return true;
		return false;
	},
	audio: 2,
	trigger: { player: "phaseBegin" },
	direct: true,
	filter(event, player) {
		return !player.storage.xingyu_xianlue_off;
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool("先略：是否摸一张牌并执行其中一项？（然后此技能失效直到你进入濒死状态）")
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		player.logSkill("xingyu_xianlue");
		await player.draw();
		// 选项
		const ctrl = await player
			.chooseControl("视为使用一种普通锦囊牌", "令一名同势力角色摸牌至体力上限")
			.set("prompt", "先略：执行其中一项")
			.set("ai", () => (player.countCards("h") < 2 ? 0 : 1))
			.forResult();
		if (ctrl?.index == 0) {
			const names = Object.keys(lib.card).filter((key) => {
				const info = lib.card[key];
				return info && info.type == "trick" && !info.mode && !key.startsWith("_") && !["wuxie", "shan"].includes(key);
			});
			const choose = await player
				.chooseButton([`先略：视为使用一种普通锦囊牌`, [names.map((name) => [name, lib.card[name].type]), "vcard"]], true)
				.set("ai", (button) => get.value({ name: button.link }))
				.forResult();
			if (choose?.links?.length) {
				await player.chooseUseTarget(get.autoViewAs({ name: choose.links[0] }, []), true);
			}
		} else if (ctrl?.index == 1) {
			const result = await player
				.chooseTarget(`先略：令一名与你势力相同的角色摸牌至体力上限（不超过五张）`, true, (card, me, t) => lib.skill.xingyu_xianlue.sameGroup(me, t))
				.set("ai", (button) => get.attitude(get.event().player, button.link))
				.forResult();
			if (result?.targets?.length) {
				const t = result.targets[0];
				const n = Math.min(t.maxHp, 5) - t.countCards("h");
				if (n > 0) await t.draw(n);
			}
		}
		// 失效直到进入濒死状态
		player.storage.xingyu_xianlue_off = true;
		player.addTempSkill("xingyu_xianlue_off");
	},
},
xingyu_xianlue_off: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "略",
	intro: { name: "先略", content: "技能已失效，直到进入濒死状态" },
	trigger: { player: ["dying", "dieBefore"] },
	forced: true,
	silent: true,
	popup: false,
	filter(event, player) {
		return event.name == "dying";
	},
	async content(event, trigger, player) {
		delete player.storage.xingyu_xianlue_off;
		player.removeSkill("xingyu_xianlue_off");
	},
},
xingyu_fengwang: {
	audio: 2,
	trigger: { player: "phaseDiscardBegin" },
	direct: true,
	filter(event, player) {
		return game.hasPlayer((cur) => lib.skill.xingyu_xianlue.sameGroup(player, cur));
	},
	async content(event, trigger, player) {
		const result = await player
			.chooseTarget(`奉王：是否令一名与你势力相同的角色摸一张牌，然后本回合你的手牌上限与该角色相同？`, true, (card, me, t) => lib.skill.xingyu_xianlue.sameGroup(me, t))
			.set("ai", (button) => {
				const t = button.link;
				const me = get.event().player;
				return get.attitude(me, t) + (t.getHandcardLimit() > me.getHandcardLimit() ? 3 : 0);
			})
			.forResult();
		if (!result?.targets?.length) return;
		const target = result.targets[0];
		player.logSkill("xingyu_fengwang", target);
		await target.draw();
		player.storage.xingyu_fengwang_t = target;
		player.addTempSkill("xingyu_fengwang_eff");
	},
},
xingyu_fengwang_eff: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "奉",
	intro: { name: "奉王", content: "本回合手牌上限与$相同" },
	mod: {
		maxHandcard(player, num) {
			const t = player.storage.xingyu_fengwang_t;
			if (t?.isIn()) return t.getHandcardLimit();
			return num;
		},
	},
},
xingyu_manyao: {
	audio: 2,
	group: ["xingyu_manyao1", "xingyu_manyao2"],
	ai: {
		effect: {
			target(card) {
				if (card.name == "nanman") return [0, 1, 0, 0];
			},
		},
	},
},
xingyu_manyao1: {
	audio: "xingyu_manyao",
	trigger: { target: "useCardToBefore" },
	forced: true,
	priority: 15,
	filter(event, player) {
		return event.card.name == "nanman";
	},
	async content(event, trigger, player) {
		trigger.cancel();
	},
},
xingyu_manyao2: {
	audio: "xingyu_manyao",
	trigger: { global: "useCardAfter" },
	forced: true,
	filter(event, player) {
		return event.card.name == "nanman" && event.player != player && event.cards.someInD();
	},
	async content(event, trigger, player) {
		await player.draw();
	},
},
xingyu_zhanyuan: {
	audio: 2,
	trigger: { global: "phaseUseBegin" },
	direct: true,
	filter(event, player) {
		return event.player != player && player.countCards("he") > 0;
	},
	// 检查一次 useCard 是否造成过伤害
	checkDamage(useEvt) {
		return game.players.some((cur) => cur.getHistory("damage", (evt) => evt.getParent("useCard") === useEvt).length > 0);
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const go = await player
			.chooseBool(`战缘：是否无视目标限制对${get.translation(target)}使用一张牌？`)
			.set("ai", () => (get.attitude(player, target) < 0 ? 1 : 0))
			.forResult();
		if (!go?.bool) return;
		const pick = await player
			.chooseCard("he", true, "战缘：选择使用一张牌")
			.set("ai", (card) => get.value(card) * (get.tag(card, "damage") ? 2 : 1))
			.forResult();
		if (!pick?.cards?.length) return;
		player.logSkill("xingyu_zhanyuan", target);
		const useEvt = await player.useCard(pick.cards[0], pick.cards, [target], "xingyu_zhanyuan");
		const damaged = lib.skill.xingyu_zhanyuan.checkDamage(useEvt);
		if (damaged || !target.isIn() || target.countCards("he") == 0) return;
		// 其可以无视目标限制对你使用一张牌
		const go2 = await target
			.chooseBool(`战缘：是否无视目标限制对${get.translation(player)}使用一张牌？`)
			.set("ai", () => (get.attitude(target, player) < 0 ? 1 : 0))
			.forResult();
		if (!go2?.bool) return;
		const pick2 = await target
			.chooseCard("he", true, "战缘：选择使用一张牌")
			.set("ai", (card) => get.value(card) * (get.tag(card, "damage") ? 2 : 1))
			.forResult();
		if (!pick2?.cards?.length) return;
		const useEvt2 = await target.useCard(pick2.cards[0], pick2.cards, [player], "xingyu_zhanyuan");
		const damaged2 = lib.skill.xingyu_zhanyuan.checkDamage(useEvt2);
		if (!damaged2 && player.isIn() && target.isIn()) {
			await player.draw();
			await target.draw();
		}
	},
},
xingyu_niansi: {
	audio: 2,
	trigger: {
		player: "phaseZhunbeiBegin",
		global: "damageAfter",
	},
	direct: true,
	filter(event, player) {
		if (event.name == "damage") {
			// 男性角色受到伤害后其体力值不大于你
			return event.player.isMale() && event.player.hp <= player.hp && event.player.isIn();
		}
		return true;
	},
	// 明置牌堆里的一张牌（自牌堆顶下数十张以内）——孤居重发动共用
	async doNiansi(event, player) {
		const pile = ui.cardPile.childNodes;
		const candidates = [];
		for (let i = Math.max(0, pile.length - 10); i < pile.length; i++) candidates.push(pile[i]);
		if (!candidates.length) return;
		const choose = await player
			.chooseButton([`念嗣：明置牌堆里的一张牌（牌堆顶下十张以内）`, [candidates, "card"]], true)
			.set("ai", (button) => get.value(button.link))
			.forResult();
		if (!choose?.links?.length) return;
		const card = choose.links[0];
		if (!player.storage.xingyu_niansi_cards) player.storage.xingyu_niansi_cards = [];
		player.storage.xingyu_niansi_cards.push(card);
		player.markSkill("xingyu_niansi_mark");
		await game.showCards([card], "念嗣·明置");
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool("念嗣：是否明置牌堆里的一张牌？")
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		player.logSkill("xingyu_niansi");
		await lib.skill.xingyu_niansi.doNiansi(event, player);
	},
},
xingyu_niansi_mark: {
	charlotte: true,
	mark: true,
	marktext: "嗣",
	intro: {
		name: "念嗣",
		content(storage, player) {
			const cards = player.storage.xingyu_niansi_cards || [];
			return "已明置" + cards.length + "张牌：" + cards.map((card) => get.translation(card)).join("、");
		},
	},
},
xingyu_guju: {
	audio: 2,
	trigger: { player: "gainAfter" },
	direct: true,
	filter(event, player) {
		// 回合外
		const phase = event.getParent("phase");
		if (!phase || phase.player == player) return false;
		return event.cards && event.cards.length > 0;
	},
	async content(event, trigger, player) {
		const gained = trigger.cards.filter((card) => player.getCards("hejsx").includes(card));
		if (!gained.length) return;
		const go = await player
			.chooseBool("孤居：是否弃置获得的牌，然后弃置当前回合角色区域里一张牌？")
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		player.logSkill("xingyu_guju");
		const category = get.type(gained[0]);
		await player.discard(gained);
		const cur = trigger.getParent("phase").player;
		if (!cur.isIn()) return;
		const pick = await player
			.choosePlayerCard(cur, true, "hej", "孤居：弃置当前回合角色区域里的一张牌")
			.set("ai", (button) => (button.link ? get.value(button.link) : 0))
			.forResult();
		const card = pick?.cards?.[0];
		if (!card) return;
		await player.discard([card]);
		// 若这些牌类别相同，你可以发动一次"念嗣"
		if (get.type(card) == category) {
			const again = await player
				.chooseBool("孤居：牌类别相同，是否发动一次「念嗣」？")
				.set("ai", () => 1)
				.forResult();
			if (again?.bool) {
				player.logSkill("xingyu_niansi");
				await lib.skill.xingyu_niansi.doNiansi(event, player);
			}
		}
	},
},
xingyu_jueyin: {
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "orange",
	trigger: { player: "phaseDrawBefore" },
	direct: true,
	filter(event, player) {
		return !player.storage.xingyu_jueyin && (player.storage.xingyu_niansi_cards || []).length > 0;
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool("绝姻：是否改为获得所有牌堆里明置的牌？")
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		player.awakenSkill("xingyu_jueyin");
		player.logSkill("xingyu_jueyin");
		const cards = (player.storage.xingyu_niansi_cards || []).filter((card) => get.position(card) == "c");
		if (cards.length) await player.gain(cards, "gain2", "log");
		const result = await player
			.chooseTarget("绝姻：令一名角色于其下一个回合使用的牌对你无效", true)
			.set("ai", (button) => -get.attitude(get.event().player, button.link))
			.forResult();
		if (result?.targets?.length) {
			const target = result.targets[0];
			player.line(target, "orange");
			target.storage.xingyu_jueyin_caster = player;
			target.addTempSkill("xingyu_jueyin_eff");
		}
	},
},
xingyu_jueyin_eff: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "姻",
	intro: { name: "绝姻", content: "其下一个回合使用的牌对你无效" },
	trigger: {
		player: ["phaseBegin", "phaseEnd"],
		global: "useCardBegin",
	},
	forced: true,
	silent: true,
	popup: false,
	filter(event, player, name) {
		if (event.name == "phase") return true;
		// 其下一回合对你使用的牌无效
		return !!player.storage.xingyu_jueyin_active && event.player == player && event.targets?.includes(player.storage.xingyu_jueyin_caster);
	},
	async content(event, trigger, player) {
		if (trigger.name == "phase") {
			if (trigger.name == "phaseBegin" && event.triggername == "phaseBegin") {
				player.storage.xingyu_jueyin_active = true;
			} else {
				// 其回合结束：移除
				player.storage.xingyu_jueyin_active = false;
				player.removeSkill("xingyu_jueyin_eff");
			}
			return;
		}
		trigger.targets.remove(player.storage.xingyu_jueyin_caster);
	},
},
xingyu_leishen: {
	audio: 2,
	mod: {
		// 你使用的雷【杀】无次数限制
		cardUsable(card, player) {
			if (get.name(card, player) == "sha" && get.nature(card) == "thunder") return Infinity;
		},
	},
	viewAs: { name: "sha", nature: "thunder", isCard: true },
	filterCard(card, player) {
		// 黑色手牌视为雷【杀】（⚠原文是否含"黑色"待最终确认）
		return get.color(card) == "black" && get.position(card) == "h";
	},
	selectCard: 1,
	prompt: "雷神：将一张黑色手牌视为雷【杀】使用",
},
// "震慑"标记（挂在其他角色身上）
xingyu_zhenzhe_mark: {
	charlotte: true,
	mark: true,
	marktext: "慑",
	intro: { name: "震慑", content: "拥有$枚" },
},
xingyu_leihong: {
	audio: 2,
	trigger: { player: "phaseUseBegin" },
	direct: true,
	filter(event, player) {
		return game.hasPlayer((cur) => cur != player && cur.countMark("xingyu_zhenzhe_mark") > 0 && cur.countMark("xingyu_zhenzhe_mark") < cur.maxHp);
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool("雷轰：是否令所有拥有「震慑」的角色依次弃牌或受伤？（然后你结束此阶段、移除所有「震慑」并废除一个装备栏）")
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		player.logSkill("xingyu_leihong");
		let did = false;
		const marked = game.filterPlayer((cur) => cur != player && cur.countMark("xingyu_zhenzhe_mark") > 0 && cur.countMark("xingyu_zhenzhe_mark") < cur.maxHp);
		for (const cur of marked) {
			if (!cur.isIn()) continue;
			const x = cur.maxHp - cur.countMark("xingyu_zhenzhe_mark");
			const pick = await cur
				.chooseControl(`弃置${get.cnNumber(x)}张牌`, "受到2点伤害")
				.set("prompt", "雷轰：请选择")
				.set("ai", () => (cur.countCards("he") >= x ? 0 : 1))
				.forResult();
			if (pick?.index == 0 && cur.countCards("he") >= x) {
				did = true;
				const cards = await cur
					.chooseCard("he", true, x, `雷轰：弃置${get.cnNumber(x)}张牌`)
					.set("ai", (card) => 5 - get.value(card))
					.forResult();
				if (cards?.cards?.length) await cur.discard(cards.cards);
			} else {
				did = true;
				await cur.damage(2);
			}
		}
		if (!did) return;
		// 你结束此阶段
		const phaseUse = trigger.getParent("phaseUse");
		if (phaseUse) phaseUse.cancel();
		// 移除所有"震慑"标记
		game.players.forEach((cur) => cur.removeSkill("xingyu_zhenzhe_mark"));
		// 废除一个装备栏
		const slots = [1, 2, 3, 4, 5].filter((i) => player.countEnabledSlot(i) > 0);
		if (slots.length) {
			const slotNames = { 1: "武器栏", 2: "防具栏", 3: "+1坐骑栏", 4: "-1坐骑栏", 5: "宝物栏" };
			const ctrl = await player
				.chooseControl(slots.map((i) => slotNames[i]))
				.set("prompt", "雷轰：废除一个装备栏")
				.set("ai", () => 0)
				.forResult();
			if (ctrl?.index != null) await player.disableEquip(slots[ctrl.index]);
		}
	},
},
xingyu_xuquan: {
	audio: 2,
	forced: true,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		// ×为你已损失的体力值
		return player.maxHp - player.hp > 0 && game.hasPlayer((cur) => cur != player && cur.countCards("h") > 0);
	},
	async content(event, trigger, player) {
		await lib.skill.xingyu_xuquan.run(event, trigger, player);
	},
	async run(event, trigger, player) {
		const x = player.maxHp - player.hp;
		const result = await player
			.chooseTarget(`虚权：指定至少${get.cnNumber(x)}名其他角色`, true, [x, game.countPlayer() - 1], (card, me, t) => t != me && t.countCards("h") > 0)
			.set("ai", (button) => {
				const t = button.link;
				const me = get.event().player;
				return get.attitude(me, t);
			})
			.forResult();
		if (!result?.targets?.length) return;
		player.storage.xingyu_xuquan_t = result.targets;
		for (const target of result.targets) {
			if (!target.isIn() || !target.countCards("h")) continue;
			const cards = await target
				.chooseCard("h", true, "虚权：将一张手牌置于牌堆顶")
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (cards?.cards?.length) await game.cardsGotoPile(cards.cards, ui.cardPile, "insert");
		}
	},
	group: ["xingyu_xuquan_draw"],
},
xingyu_xuquan_draw: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "phaseJieshuBegin" },
	filter(event, player) {
		return (player.storage.xingyu_xuquan_t || []).length > 0;
	},
	async content(event, trigger, player) {
		const targets = player.storage.xingyu_xuquan_t || [];
		player.storage.xingyu_xuquan_t = [];
		for (const target of targets) {
			if (target.isIn()) await target.draw();
		}
	},
},
// 内争：你的回合内，其他群势力角色始终视为"手牌最多或体力最多"
// 实现为选择器的候选过滤（供戚政使用）
xingyu_neizheng: {
	zhuSkill: true,
	mark: true,
	marktext: "争",
	intro: { name: "内争", content: "你的回合内，其他群势力角色始终视为手牌和体力最多的角色" },
	// 刘辩回合内"手牌最多或体力最多"的候选集（戚政等引用）
	maxCandidates(player) {
		const others = game.filterPlayer((cur) => cur != player);
		const qun = others.filter((cur) => cur.group == "qun" || cur.group2 == "qun");
		return qun.length ? qun : others;
	},
},
xingyu_qizheng: {
	audio: 2,
	forced: true,
	trigger: { player: "phaseDiscardAfter" },
	filter(event, player) {
		// 本阶段弃置过牌
		return player.getHistory("discard", (evt) => evt.getParent("phaseDiscard") == event.getParent("phaseDiscard")).some((evt) => evt.cards?.length);
	},
	async content(event, trigger, player) {
		await lib.skill.xingyu_qizheng.run(event, trigger, player);
	},
	async run(event, trigger, player) {
		const candidates = lib.skill.xingyu_neizheng.maxCandidates(player);
		const maxHand = Math.max(...candidates.map((cur) => cur.countCards("h")));
		const maxHp = Math.max(...candidates.map((cur) => cur.hp));
		const pool = candidates.filter((cur) => cur.countCards("h") == maxHand || cur.hp == maxHp);
		if (!pool.length) return;
		const target = pool.randomGet();
		player.line(target, "thunder");
		game.log(player, "令", target, "获得其弃牌阶段弃置的一张牌");
		// 你此阶段弃置的一张牌（在弃牌堆里的）
		const discarded = player
			.getHistory("discard", (evt) => evt.getParent("phaseDiscard") == trigger.getParent("phaseDiscard"))
			.flatMap((evt) => evt.cards || [])
			.filter((card) => get.position(card, true) == "d");
		if (!discarded.length) return;
		const card = discarded.randomGet();
		await target.gain([card], "gain2", "log");
		// 若此牌花色为 ♥/♦/♣ → 本轮所有角色不能使用【桃】/【闪】/【无懈可击】
		const suit = get.suit(card);
		const ban = { heart: "tao", diamond: "shan", club: "wuxie" }[suit];
		if (ban) {
			game.players.forEach((cur) => cur.addSkill("xingyu_qizheng_ban"));
			game.players.forEach((cur) => (cur.storage.xingyu_qizheng_ban = ban));
			game.log("本轮所有角色不能使用", "#g" + get.translation(ban));
		}
	},
},
xingyu_qizheng_ban: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: "roundStart" },
	mod: {
		cardEnabled(card, player) {
			const ban = player?.storage?.xingyu_qizheng_ban;
			if (ban && get.name(card) == ban) return false;
		},
	},
	filter(event) {
		return true;
	},
	async content(event, trigger, player) {
		await lib.skill.xingyu_qizheng_ban.run(event, trigger, player);
	},
	async run(event, trigger, player) {
		// 本轮结束：全体移除禁用
		game.players.forEach((cur) => {
			cur.storage.xingyu_qizheng_ban = null;
			cur.removeSkill("xingyu_qizheng_ban");
		});
	},
},
xingyu_yishi: {
	audio: 2,
	forced: true,
	trigger: { global: "phaseBeforeStart" },
	// 选将结束时：给每名玩家一张随机备选武将牌"弈"（⚠原版依赖实体牌选将，无名杀以随机武将牌近似）
	async content(event, trigger, player) {
		await lib.skill.xingyu_yishi.run(event, trigger, player);
	},
	async run(event, trigger, player) {
		const pool = Object.keys(lib.character).filter((key) => {
			const info = lib.character[key];
			return info && !info.isBoss && !info.isUnseen && info.skills && info.skills.length;
		});
		player.storage.xingyu_yi_map = {};
		game.players.forEach((cur) => {
			player.storage.xingyu_yi_map[cur.playerid] = pool.randomGet();
		});
		player.markSkill("xingyu_yishi_mark");
		game.log(player, "为所有玩家放置了备选武将牌「弈」");
	},
	group: ["xingyu_yishi_mark_skill"],
},
xingyu_yishi_mark_skill: {
	charlotte: true,
	mark: true,
	marktext: "弈",
	intro: {
		name: "弈",
		content(storage, player) {
			const map = player.storage.xingyu_yi_map || {};
			return Object.keys(map)
				.map((id) => {
					const cur = game.findPlayer((p) => p.playerid == id);
					return (cur ? get.translation(cur) : "?") + "：" + get.translation(map[id]);
				})
				.join("<br>");
		},
	},
},
xingyu_nongju: {
	audio: 2,
	// ⚠原文"在合适的场合"为自由时机，无名杀近似为出牌阶段
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		const map = player.storage.xingyu_yi_map || {};
		return game.hasPlayer((cur) => map[cur.playerid]);
	},
	filterTarget(card, player, target) {
		return !!(player.storage.xingyu_yi_map || {})[target.playerid];
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		const char = player.storage.xingyu_yi_map[target.playerid];
		delete player.storage.xingyu_yi_map[target.playerid];
		player.markSkill("xingyu_yishi_mark");
		const ctrl = await player
			.chooseControl("发动此「弈」上的一项非标签技", "其使用【杀】或普通锦囊牌时由你指定目标", "其进入濒死状态时以此「弈」替换其武将牌")
			.set("prompt", `弄局：移除${get.translation(target)}的「弈」（${get.translation(char)}），执行其中一项`)
			.set("ai", () => 0)
			.forResult();
		if (ctrl?.index == 0) {
			// 非标签技：排除锁定/限定/觉醒/主公/使命/隐匿等
			const skills = (lib.character[char]?.skills || []).filter((id) => {
				const info = lib.skill[id];
				if (!info || id.startsWith("_")) return false;
				return !info.forced && !info.limited && !info.zhuSkill && !info.awakenSkill && !info.juqing && !info.dutySkill && !info.hiddenSkill && !info.unique;
			});
			if (!skills.length) return;
			const choose = await player
				.chooseButton([`弄局：发动「${get.translation(char)}」上的一项技能`, [skills, "skill"]], true)
				.set("ai", () => 1)
				.forResult();
			if (choose?.links?.length) {
				// 近似：临时获得该技能到回合结束（原意为"发动一次"）
				player.addTempSkill(choose.links[0]);
				player.popup(choose.links[0]);
			}
		} else if (ctrl?.index == 1) {
			target.storage.xingyu_nongju_t = player;
			target.addTempSkill("xingyu_nongju_t2");
		} else if (ctrl?.index == 2) {
			target.storage.xingyu_nongju_t3 = char;
			target.addTempSkill("xingyu_nongju_t3");
		}
	},
},
xingyu_nongju_t2: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "局",
	intro: { name: "弄局", content: "你使用【杀】或普通锦囊牌时，目标由$指定" },
	trigger: { global: "useCardBegin" },
	forced: true,
	silent: true,
	popup: false,
	filter(event, player) {
		const me = player.storage.xingyu_nongju_t;
		if (!me?.isIn()) return false;
		if (event.player != player) return false;
		const name = get.name(event.card);
		return name == "sha" || (get.type(event.card) == "trick" && !lib.card[get.name(event.card)]?.wuxieable && get.name(event.card) != "wuxie");
	},
	async content(event, trigger, player) {
		const me = player.storage.xingyu_nongju_t;
		if (!trigger.targets?.length) return;
		const result = await me
			.chooseTarget("弄局：为其指定目标", true, (card, m, t) => t.isIn())
			.set("ai", (button) => -get.attitude(get.event().player, button.link))
			.forResult();
		if (result?.targets) {
			trigger.targets = result.targets;
			game.log(me, "改动了", player, "使用牌的目标");
		}
	},
},
xingyu_nongju_t3: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "弈",
	intro: { name: "弄局", content: "你进入濒死状态时将以「弈」替换武将牌" },
	trigger: { global: "dying" },
	forced: true,
	silent: true,
	popup: false,
	filter(event, player) {
		return event.player == player && !!player.storage.xingyu_nongju_t3;
	},
	async content(event, trigger, player) {
		await lib.skill.xingyu_nongju_t3.run(event, trigger, player);
	},
	async run(event, trigger, player) {
		const char = player.storage.xingyu_nongju_t3;
		player.storage.xingyu_nongju_t3 = null;
		player.removeSkill("xingyu_nongju_t3");
		game.log(player, "以「弈」（", "#g" + get.translation(char), "）替换了武将牌");
		player.reinit(char);
	},
},
xingyu_niying: {
	// 匿影：距离修正（×为其拥有的"弈"数）
	charlotte: true,
	mod: {
		globalFrom(from, to, distance) {
			const map = from.storage.xingyu_yi_map || {};
			return distance - (map[to.playerid] ? 1 : 0);
		},
		globalTo(from, to, distance) {
			const map = to.storage.xingyu_yi_map || {};
			return distance + (map[from.playerid] ? 1 : 0);
		},
	},
	ai: {
		effect: {
			player(card, player, target) {
				// 距离加成让顺手牵羊等更易命中（简单提示）
			},
		},
	},
},
xingyu_duanjiang: {
	audio: 2,
	trigger: {
		player: "phaseJudgeBefore",
		global: "chooseToRespondBegin",
	},
	direct: true,
	filter(event, player, name) {
		if (event.name == "phase") return true;
		// 其他角色需要响应"我"发起的杀/闪
		if (!event.respondTo || event.respondTo[0] != player || event.player == player) return false;
		return !!event.getParent("useCard");
	},
	async content(event, trigger, player) {
		if (trigger.name == "phase") {
			const go = await player.chooseBool("断江：是否跳过判定阶段？").set("ai", () => (player.countCards("j") ? 0 : 1)).forResult();
			if (go?.bool) {
				player.logSkill("xingyu_duanjiang");
				trigger.cancel();
			}
			return;
		}
		const responder = trigger.player;
		await lib.skill.xingyu_linan.moveRespond(trigger, player, responder);
	},
},
xingyu_zoujiao: {
	audio: 2,
	trigger: {
		player: ["phaseDrawBefore", "phaseUseBefore"],
	},
	direct: true,
	filter(event, player, name) {
		if (name == "phaseDrawBefore") return true;
		// phaseUseBefore：仅在跳过摸牌后才提供跳过出牌
		return !!player.storage.xingyu_zoujiao_skip;
	},
	async content(event, trigger, player) {
		if (trigger.name == "phaseDraw") {
			const go = await player
				.chooseBool("走蛟：是否跳过摸牌阶段和出牌阶段，依次移动场上三张不同区域的牌？")
				.set("ai", () => 0)
				.forResult();
			if (go?.bool) {
				player.logSkill("xingyu_zoujiao");
				player.storage.xingyu_zoujiao_skip = true;
				player.addTempSkill("xingyu_zoujiao_clear");
				trigger.cancel();
			}
			return;
		}
		// 出牌阶段前：跳过并执行移动
		delete player.storage.xingyu_zoujiao_skip;
		trigger.cancel();
		const movedTypes = [];
		for (let i = 0; i < 3; i++) {
			if (!player.isIn()) return;
			// 选一张场上不同区域的牌
			const all = [];
			game.players.forEach((cur) => {
				cur.getCards("hej").forEach((card) => {
					if (!movedTypes.includes(get.position(card))) all.push([card, cur]);
				});
			});
			if (!all.length) break;
			const pick = await player
				.chooseButton([`走蛟：移动第${get.cnNumber(i + 1)}张牌（须来自不同区域）`, [all.map((pair) => pair[0]), "card"]], true)
				.set("ai", (button) => get.value(button.link))
				.forResult();
			const card = pick?.links?.[0];
			if (!card) break;
			const owner = all.find((pair) => pair[0] == card)?.[1];
			if (!owner) break;
			const type = get.position(card);
			movedTypes.push(type);
			// 移入我的对应区域
			if (type == "h") {
				await player.gain([card], "gain2");
			} else if (type == "e") {
				await player.gain([card], "gain2");
				if (player.getCards("he").includes(card)) await player.equip(card);
			} else {
				await player.addJudge(card);
			}
		}
		// 三张牌点数相连或花色相同 → 摸三张牌
		if (movedTypes.length == 3) {
			const mine = player.getCards("he").slice(-3);
			if (mine.length == 3) {
				const nums = mine.map((card) => get.number(card)).sort((a, b) => a - b);
				const suits = mine.map((card) => get.suit(card));
				const connected = nums[1] == nums[0] + 1 && nums[2] == nums[1] + 1;
				const sameSuit = suits[0] == suits[1] && suits[1] == suits[2];
				if (connected || sameSuit) {
					game.log("走蛟：三张牌点数相连或花色相同");
					await player.draw(3);
				}
			}
		}
	},
},
xingyu_zoujiao_clear: {
	charlotte: true,
	onremove: true,
	trigger: { global: "phaseAfter" },
	forced: true,
	silent: true,
	popup: false,
	filter(event, player) {
		return !!player.storage.xingyu_zoujiao_skip;
	},
	async content(event, trigger, player) {
		delete player.storage.xingyu_zoujiao_skip;
		player.removeSkill("xingyu_zoujiao_clear");
	},
},
xingyu_qulie: {
	audio: 2,
	trigger: { player: "phaseDiscardBefore" },
	direct: true,
	filter(event, player) {
		return true;
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool("驱烈：是否跳过弃牌阶段，视为使用一张【南蛮入侵】或【万箭齐发】？")
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		player.logSkill("xingyu_qulie");
		trigger.cancel();
		const ctrl = await player
			.chooseControl("nanman", "wanjia")
			.set("prompt", "驱烈：视为使用哪种牌")
			.set("ai", () => "nanman")
			.forResult();
		const name = ctrl?.control || "nanman";
		const targets = game.filterPlayer((cur) => cur != player);
		const useEvt = await player.useCard(get.autoViewAs({ name }, []), [], targets, "xingyu_qulie");
		// 目标角色响应此牌后，其可以令你弃置你区域内的一张牌
		for (const target of targets) {
			if (!target.isIn() || !player.isIn()) return;
			const give = await target
				.chooseBool(`驱烈：是否令${get.translation(player)}弃置其区域内的一张牌？`)
				.set("ai", () => (get.attitude(target, player) < 0 ? 1 : 0))
				.forResult();
			if (!give?.bool) continue;
			const pick = await target
				.choosePlayerCard(player, true, "hej", "驱烈：选择弃置其区域内的一张牌")
				.set("ai", (button) => (button.link ? get.value(button.link) : 0))
				.forResult();
			if (pick?.cards?.length) await player.discard(pick.cards);
		}
	},
},
xingyu_kaitian: {
	audio: 2,
	forced: true,
	trigger: { global: "roundStart" },
	filter(event, player) {
		return true;
	},
	// 当前轮次类型："yang"/"xing"，逐轮交替
	roundType(player) {
		return player.storage.xingyu_kaitian_type || "yang";
	},
	async content(event, trigger, player) {
		await lib.skill.xingyu_kaitian.run(event, trigger, player);
	},
	async run(event, trigger, player) {
		const prev = player.storage.xingyu_kaitian_type;
		let type;
		if (!prev) {
			// 第一轮为"阳"轮次
			type = "yang";
		} else {
			type = prev == "yang" ? "xing" : "yang";
		}
		player.storage.xingyu_kaitian_type = type;
		player.storage.xingyu_kaitian_count = (player.storage.xingyu_kaitian_count || 0) + (type == "yang" ? 1 : 0);
		game.log(`本局轮次切换为「${type == "yang" ? "阳" : "星"}」轮次`);
		if (type != "yang") return;
		// 第×个"阳"轮次开始时（×为场上存活角色数）
		if (player.storage.xingyu_kaitian_count != game.countPlayer()) return;
		player.logSkill("xingyu_kaitian");
		// 令一名角色获得所有角色各1点体力上限：其余角色各-1上限，该角色+（减少总数）
		const result = await player
			.chooseTarget("开天：令一名角色获得其余角色各失去的1点体力上限", true)
			.set("ai", (button) => get.attitude(get.event().player, button.link))
			.forResult();
		if (!result?.targets?.length) return;
		const chosen = result.targets[0];
		const others = game.filterPlayer((cur) => cur != chosen && cur.isIn());
		let lost = 0;
		for (const cur of others) {
			if (cur.maxHp > 1) {
				await cur.loseMaxHp(1);
				lost++;
			}
		}
		if (lost > 0 && chosen.isIn()) await chosen.gainMaxHp(lost);
	},
},
xingyu_tuohai: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filterTarget: true,
	async content(event, trigger, player) {
		await lib.skill.xingyu_tuohai.run(event, trigger, player);
	},
	async run(event, trigger, player) {
		const chosen = event.targets[0];
		// 除其外所有角色可以受到1点伤害并令其回复1点体力
		const accepters = [];
		for (const cur of game.filterPlayer((cur) => cur != chosen && cur.isIn())) {
			const go = await cur
				.chooseBool(`拓海：是否受到1点伤害，令${get.translation(chosen)}回复1点体力？`)
				.set("ai", () => (get.attitude(cur, chosen) > 0 && cur.hp > 1 ? 1 : 0))
				.forResult();
			if (go?.bool) {
				accepters.push(cur);
				await cur.damage(1);
				if (chosen.isIn()) await chosen.recover(1);
			}
		}
		// 这些角色获得"阳/星"对应的转化权（每轮每名角色限两次）
		for (const cur of accepters) {
			if (cur.isIn()) cur.addSkill("xingyu_tuohai_eff");
		}
	},
},
xingyu_tuohai_eff: {
	charlotte: true,
	group: ["xingyu_tuohai_y", "xingyu_tuohai_x", "xingyu_tuohai_count"],
	mark: true,
	marktext: "拓",
	intro: { name: "拓海", content: "阳轮可将伤害牌当【决斗】/星轮可将两张红色牌当【桃】使用（每轮限两次）" },
},
xingyu_tuohai_y: {
	charlotte: true,
	enable: "chooseToUse",
	filter(event, player) {
		return lib.skill.xingyu_kaitian.roundType(player) == "yang" && (player.storage.xingyu_tuohai_count || 0) < 2;
	},
	viewAs: { name: "juedou", isCard: true },
	filterCard(card) {
		return !!get.tag(card, "damage") && get.position(card) == "h";
	},
	selectCard: 1,
	prompt: "拓海（阳）：将一张伤害类牌当【决斗】使用（每轮限两次）",
},
xingyu_tuohai_x: {
	charlotte: true,
	enable: "chooseToUse",
	filter(event, player) {
		return lib.skill.xingyu_kaitian.roundType(player) == "xing" && (player.storage.xingyu_tuohai_count || 0) < 2;
	},
	viewAs: { name: "tao", isCard: true },
	filterCard(card) {
		return get.color(card) == "red" && get.position(card) == "h";
	},
	selectCard: 2,
	prompt: "拓海（星）：将两张红色牌当【桃】使用（每轮限两次）",
},
xingyu_tuohai_count: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: ["useCardAfter", "roundStart"] },
	filter(event, player) {
		if (event.name == "round") {
			return true;
		}
		return ["xingyu_tuohai_y", "xingyu_tuohai_x"].includes(event.skill);
	},
	async content(event, trigger, player) {
		if (trigger.name == "round") {
			player.storage.xingyu_tuohai_count = 0;
		} else {
			player.storage.xingyu_tuohai_count = (player.storage.xingyu_tuohai_count || 0) + 1;
		}
	},
},
xingyu_dongdi: {
	audio: 2,
	trigger: {
		player: ["damageAfter", "roundStart"],
	},
	direct: true,
	filter(event, player, name) {
		if (event.name == "damage") return event.num == 1;
		// "阳"、"星"轮次交替时
		return true;
	},
	async content(event, trigger, player) {
		if (trigger.name == "damage") {
			const go = await player
				.chooseBool("动地：是否将牌堆顶的一张牌当作锦囊牌使用？")
				.set("ai", () => 1)
				.forResult();
			if (!go?.bool) return;
			player.logSkill("xingyu_dongdi");
			const isYang = lib.skill.xingyu_kaitian.roundType(player) == "yang";
			// 阳：任意伤害类锦囊；星：非伤害且非体力回复类锦囊
			const names = Object.keys(lib.card).filter((key) => {
				const info = lib.card[key];
				if (!info || info.mode || key.startsWith("_")) return false;
				if (info.type != "trick" && info.type != "delay") return false;
				if (isYang) return !!get.tag({ name: key }, "damage");
				return !get.tag({ name: key }, "damage") && !get.tag({ name: key }, "recover");
			});
			if (!names.length) return;
			const choose = await player
				.chooseButton([`动地（${isYang ? "阳" : "星"}）：将牌堆顶的牌视为使用`, [names.map((name) => [name, lib.card[name].type]), "vcard"]], true)
				.set("ai", (button) => get.value({ name: button.link }))
				.forResult();
			if (!choose?.links?.length) return;
			const top = ui.cardPile.lastChild;
			if (!top) return;
			await player.useCard(get.autoViewAs({ name: choose.links[0] }, [top]), [top], "xingyu_dongdi");
			return;
		}
		// 轮次交替时，你可以受到1点伤害并防止之（用于触发"受到伤害后"类效果）
		const go2 = await player
			.chooseBool("动地：是否受到1点伤害并防止之？")
			.set("ai", () => 1)
			.forResult();
		if (!go2?.bool) return;
		player.logSkill("xingyu_dongdi");
		player.addTempSkill("xingyu_dongdi_guard");
		await player.damage(1);
	},
},
xingyu_dongdi_guard: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "damageBegin4" },
	filter(event, player) {
		return !player.storage.xingyu_dongdi_used;
	},
	async content(event, trigger, player) {
		player.storage.xingyu_dongdi_used = true;
		trigger.cancel();
		player.removeSkill("xingyu_dongdi_guard");
	},
},
xingyu_xiongzhi: {
	audio: 2,
	forced: true,
	trigger: { global: "phaseBeforeStart" },
	// 同阵营判定（含仁望：内奸视为忠臣）
	isAlly(me, cur) {
		if (cur == me || !cur.isIn()) return false;
		if (me.side != null && me.side != undefined) {
			if (cur.side == me.side) return true;
			if (me.side == 0 && cur.identity == "nei") return true;
			return false;
		}
		return cur.group == me.group;
	},
	async content(event, trigger, player) {
		// 你没有体力值
		player.hp = 0;
		player.update();
		player.addSkill("xingyu_xiongzhi_guard");
		game.log(player, "没有体力值");
	},
	group: ["xingyu_xiongzhi_guard"],
},
xingyu_xiongzhi_guard: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	mark: true,
	marktext: "志",
	intro: { name: "雄志", content: "与你同阵营的其他角色均死亡前，你不会死亡" },
	trigger: { player: ["dying", "dieBefore"] },
	filter(event, player) {
		// 与你同阵营的其他角色均死亡前
		return game.hasPlayer((cur) => lib.skill.xingyu_xiongzhi.isAlly(player, cur));
	},
	async content(event, trigger, player) {
		trigger.cancel();
		game.log(player, "的同阵营角色尚存，不会死亡");
	},
},
xingyu_renwang: {
	audio: 2,
	zhuSkill: true,
	mark: true,
	marktext: "望",
	intro: { name: "仁望", content: "「内奸」身份牌视为「忠臣」" },
},
xingyu_qingshi: {
	audio: 2,
	forced: true,
	trigger: { player: "phaseZhunbeiBegin" },
	async content(event, trigger, player) {
		await lib.skill.xingyu_qingshi.run(event, trigger, player);
	},
	async run(event, trigger, player) {
		const name = player.storage.xingyu_xuechou ? "wanjia" : "taoyuan";
		player.logSkill("xingyu_qingshi");
		const targets = game.filterPlayer((cur) => cur.isIn());
		await player.useCard(get.autoViewAs({ name }, []), [], targets, "xingyu_qingshi");
	},
	group: ["xingyu_qingshi_watch"],
},
xingyu_qingshi_watch: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: "recoverBegin" },
	filter(event, player) {
		const useEvt = event.getParent("useCard");
		return useEvt?.skill == "xingyu_qingshi" && event.player != player && event.player.isIn();
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const go = await player
			.chooseBool(`倾世：是否改为与${get.translation(target)}各摸一张牌？`)
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		trigger.cancel();
		await player.draw();
		await target.draw();
	},
},
xingyu_xuechou: {
	audio: 2,
	awakenSkill: true,
	forced: true,
	trigger: { global: ["dieAfter", "die"] },
	filter(event, player) {
		return !player.storage.xingyu_xuechou && lib.skill.xingyu_xiongzhi.isAlly(player, event.player);
	},
	async content(event, trigger, player) {
		player.awakenSkill("xingyu_xuechou");
		player.storage.xingyu_xuechou = true;
		player.markSkill("xingyu_xuechou_mark");
		game.log(player, "将「倾世」中的【桃园结义】改为【万箭齐发】");
	},
},
xingyu_xuechou_mark: {
	charlotte: true,
	mark: true,
	marktext: "仇",
	intro: { name: "血仇", content: "「倾世」中的【桃园结义】已改为【万箭齐发】" },
},
}
