import { lib, game, get, ui, _status } from "noname";
import { qunyou_getVisiblePileTop, qunyou_hasVisiblePile, qunyou_isPileCardVisible, qunyou_markPileVisible, qunyou_visiblePileSet } from "./visiblePile.js";

// ============================================================
// 星玉扩展技能（来源：实体民间扩展「星玉」将牌，2023，主创：翔叔）
// 技能文本 OCR 重构与存疑点见：
//   .workbuddy-ai/tmp/xingyu_zip/重构表.md
// ============================================================
// 弄局："对应时机"的代理——在哪个 triggername 上能匹配到的「非标签技」技能
const XINGYU_NONGJU_TRIGGER_NAMES = ["phaseBegin", "phaseZhunbeiBegin", "damageEnd", "phaseJieshuBegin", "loseAfter", "useCard", "phaseEnd", "phaseDrawBegin", "phaseUseBegin", "recoverEnd", "loseHpEnd", "dying", "judge", "gainMaxHpEnd", "loseMaxHpEnd"];

// 念嗣 watch：判断本次 gain 是否来自“牌堆里的明置牌”。
// 两条取牌路径：
// 1. get.cardPile（如奢葬）：只返回牌堆里的牌，gainBefore 时仍在 ui.cardPile；
// 2. get.cards（摸牌）：先 removeChild 并设 card.original = "c"，gainBefore 时已不在牌堆。
function xingyuNiansiIsVisiblePileGain(card, marked) {
	if (!marked.includes(card)) return false;
	if (qunyou_isPileCardVisible(card)) return true;
	return card.original == "c" && qunyou_visiblePileSet().has(card);
}

function xingyuNongjuExcludedSkill(info) {
	return info.forced || info.limited || info.juexingji || info.dutySkill || info.hiddenSkill || info.charlotte || info.zhuSkill || info.unique;
}

// 被借的「弈」技能把这个时机写在哪种作用域下（global 优先，取宽松的）。
// 弄局能不能在某事件上发动，不是由弄局自己定的，而是由这张「弈」上的技能代码决定的：
// 写 trigger.player（"你的出牌阶段开始时"）→ 只有属于弄局拥有者的事件才算；写 trigger.global（"每个出牌阶段开始时"）→ 任何角色的事件都算。
function xingyuNongjuSkillScope(info, triggerName) {
	const inList = (list) => list == triggerName || (Array.isArray(list) && list.includes(triggerName));
	if (inList(info.trigger.global)) return "global";
	if (inList(info.trigger.player)) return "player";
	return null;
}

function xingyuNongjuHasTrigger(char, triggerName, event, player) {
	const skills2 = lib.character[char]?.skills;
	if (!Array.isArray(skills2)) return false;
	for (const skillId of skills2) {
		const info = lib.skill[skillId];
		if (!info || !info.trigger) continue;
		if (xingyuNongjuExcludedSkill(info)) continue;
		const scope = xingyuNongjuSkillScope(info, triggerName);
		if (scope == "global") return true;
		if (scope == "player" && event?.player === player) return true;
	}
	return false;
}

// 返回某角色下的「弈」里所有能在当前事件上匹配 triggerName 的非标签技能列表
function xingyuNongjuSkillsMatching(char, triggerName, event, player) {
	return (lib.character[char]?.skills || []).filter((skillId) => {
		const info = lib.skill[skillId];
		if (!info || skillId.startsWith("_") || xingyuNongjuExcludedSkill(info) || !info.trigger) return false;
		const scope = xingyuNongjuSkillScope(info, triggerName);
		if (scope == "global") return true;
		return scope == "player" && event?.player === player;
	});
}

// 「弈」浮窗里常态展示该武将的全部非标签技能（不按弄局时机过滤；
// 是否能被弄局实际发动由 xingyuNongjuSkillsMatching 在具体时机判断）
function xingyuNongjuDisplaySkills(char) {
	return (lib.character[char]?.skills || []).filter((skillId) => {
		const info = lib.skill[skillId];
		if (!info || skillId.startsWith("_") || xingyuNongjuExcludedSkill(info)) return false;
		return get.skillInfoTranslation(skillId, null, false).length > 0;
	});
}

// 技能名 + 全文的统一排版。字号在原生 .skill 基础上略缩小，避免大段描述撑满浮窗/对话框
function xingyuNongjuSkillHtml(skillId) {
	return `<div class="skill" style="font-size:0.9em">【${get.translation(skillId)}】</div><div style="font-size:0.8em;line-height:1.4">${get.skillInfoTranslation(skillId, null, false)}</div>`;
}

// 「弈」的呈现：mark 浮窗只放武将图片（无任何文字），
// 悬停/点击图片时用 _customintro 只列出「弄局」能发动的技能（神典韦挈挟同款过滤思路）。
// 不用盈门的 addToExpansion：expansion 区被 iterableGetCards("x") 当真实卡牌遍历，装不下武将牌。
const XINGYU_YI_STYLE = ".dialog .xingyu-yi-gallery{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:4px;}" +
	".dialog .xingyu-yi-gallery>.button.character{width:52px;height:70px;flex:0 0 auto;background-size:cover;cursor:pointer;border-radius:4px;}";

function xingyuBindYiMark(player) {
	if (typeof document == "undefined") return;
	if (!document.getElementById("xingyu_yi_style")) {
		const style = document.createElement("style");
		style.id = "xingyu_yi_style";
		style.textContent = XINGYU_YI_STYLE;
		document.head.appendChild(style);
	}
	const node = player?.marks?.xingyu_yishi_mark_skill;
	if (!node || node._xingyuYiBound) return;
	node._xingyuYiBound = true;
	node._customintro = (uiintro) => {
		const yi = player.storage?.xingyu_yi || [];
		const box = ui.create.div(".xingyu-yi-gallery");
		yi.forEach((char) => {
			if (!lib.character[char]) return;
			const avatar = ui.create.div(".button.character.pointerdiv", box);
			avatar.setBackground(char, "character");
			// 单张武将的信息只看「弄局」能发动的技能，不列无关技能全文
			lib.setIntro(avatar, (intro) => {
				const skills = xingyuNongjuDisplaySkills(char);
				intro.add(get.translation(char));
				if (!skills.length) {
					intro.add('<div class="text center" style="opacity:0.6">无技能</div>');
					return intro;
				}
				// 原生技能全文排版（统一用 xingyuNongjuSkillHtml，字号略小）
				for (const id of skills) {
					intro.add(xingyuNongjuSkillHtml(id));
				}
				return intro;
			}, true);
			// 不让 mark 气泡的"点击即关闭"吃掉这次点击
			avatar.addEventListener(lib.config.touchscreen ? "touchend" : "click", (e) => e?.stopPropagation?.());
		});
		if (box.childNodes.length) uiintro.add(box);
		return uiintro;
	};
}

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
	// content 的重铸循环自带可取消询问 → direct 免引擎"是否发动"重复询问
	direct: true,
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
			// 本回合攻击范围 buff 需可见：mark 数量 = 已重铸张数（"#" 占位符由引擎替换为 storage 数值）
			// 改攻击范围必须挂 attackRange.png（R18），否则 marktext 会把图标退化成字符
			mark: true,
			markimage: "image/card/attackRange.png",
			intro: {
				name: "英風",
				content(storage, player) {
					return `<li>攻击范围+${storage || 0}<br><li>当前攻击范围：${player.getAttackRange(false)}`;
				},
			},
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
	// 出牌阶段限X次，X为体力值
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
		// 弃置目标的手牌必须用 discardPlayerCard：内部是 target.discard(...).discarder = player。
		// 直接 player.discard([card]) 会走玩家自己的 lose，lose 按自己的 hejsx 过滤，
		// 目标的手牌会被静默剔除 → 实际什么都没弃。
		const result = await player
			.discardPlayerCard(`逆战：弃置${get.translation(target)}的一张手牌`, target, "h", true)
			.forResult();
		const card = result?.cards?.[0];
		if (!card) return;
		const isSha = get.name(card) == "sha";
		if (!isSha || !player.isIn() || !target.isIn()) return;
		// 视为其对你使用一张【决斗】，此【决斗】双方打出【杀】的总数不能超过X（X=你的体力值）
		// 限制由 _cap 子技能在决斗的 "juedou" 触发时机实现：总数达标后 directHit 跳过当前应答，
		// 应答方受伤、决斗结束（不能改 shaReq：会无限循环）
		player.addTempSkill("xingyu_nizhan_cap");
		const vcard = get.autoViewAs({ name: "juedou" }, []);
		await target.useCard(vcard, [], player, "xingyu_nizhan");
	},
	ai: {
		// 敌方手牌多于自己才有收益；弃到【杀】会进入决斗，手里有杀/体力高时更敢发动
		order(item, player) {
			if (!game.hasPlayer((cur) => cur != player && cur.countCards("h") > player.countCards("h") && get.attitude(player, cur) < 0)) return 0;
			return player.countCards("h", (card) => get.name(card) == "sha") > 0 || player.hp > 2 ? 5.5 : 3;
		},
		result: {
			target(player, target) {
				if (get.attitude(player, target) >= 0) return -1;
				return 1 + Math.min(2, target.countCards("h") - player.countCards("h")) * 0.5;
			},
		},
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
			// 已达上限：当前应答方不能再打出【杀】。不能把 shaReq 归零——引擎对 shaReq=0
			// 只跳过应答并交换出杀方，双方都归零会无限循环；用 directHit 跳过本次应答，
			// 应答方按决斗规则受伤并结束结算
			trigger.directHit = true;
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
	// content 自带询问（伤害分支 chooseBool；die 分支为强制性结算）→ direct 免引擎"是否发动"重复询问
	direct: true,
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
			// 当你失去"烈锋"时，重置"肃靖"（restoreSkill 自带 re-enable，勿重复调用 enableSkill）
			if (player.storage.xingyu_sujing) {
				player.restoreSkill("xingyu_sujing");
			}
		} else {
const go = await player
			.chooseBool("烈锋：是否失去1点体力，令此伤害+1？")
			.set("ai", () => (trigger.num >= 1 && player.hp > 1 && get.attitude(player, trigger.player) < 0 ? 1 : 0))
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
	// content 自带询问（伤害分支 chooseBool；dying 分支为强制性结算）→ direct 免引擎"是否发动"重复询问
	direct: true,
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
			// 当你失去"怒芒"时，重置"盛威"（restoreSkill 自带 re-enable，勿重复调用 enableSkill）
			if (player.storage.xingyu_shengwei) {
				player.restoreSkill("xingyu_shengwei");
			}
		} else {
const go = await player
			.chooseBool(`怒芒：是否弃置两张牌，对${get.translation(trigger.source)}造成1点伤害？`)
			.set("ai", () => (player.countCards("he") >= 2 && get.attitude(player, trigger.source) < 0 ? 1 : 0))
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
	ai: {
		// 限定技：只在有敌方手牌溢出时使用
		order(item, player) {
			return game.hasPlayer((cur) => cur != player && cur.countCards("h") > cur.hp && get.attitude(player, cur) < 0) ? 8 : 0;
		},
		result: {
			target(player, target) {
				const num = target.countCards("h") - target.hp;
				if (num <= 0) return 0;
				return get.attitude(player, target) < 0 ? 2 + num : -2 - num;
			},
		},
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
	ai: {
		// 限定技：自己或队友手牌不足体力上限时使用
		order(item, player) {
			return game.hasPlayer((cur) => cur.countCards("h") < cur.maxHp && (cur == player || get.attitude(player, cur) > 0)) ? 7 : 0;
		},
		result: {
			target(player, target) {
				const num = target.maxHp - target.countCards("h");
				if (num <= 0) return 0;
				const base = target == player ? 2 : get.attitude(player, target);
				// 给敌方补牌是负收益，不能因为补牌数多就翻正
				if (base <= 0) return base;
				return base + num * 0.5;
			},
		},
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
		// 额外效果的条件按「发动前」判定：本次代价把上限/装备栏降到阈值内不追溯
		const hasHpExtra = player.maxHp <= 2;
		const hasSlotExtra = player.countEnabledSlot() <= 2;
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
			// 无装备栏时 controls 只有下标 0，不能再返回 1
			.set("ai", () => (player.maxHp > 2 || !slots.length ? 0 : 1))
			.forResult();
		if (cost?.index == 0) {
			await player.loseMaxHp(1);
		} else if (cost?.index != null && cost.index > 0) {
			await player.disableEquip(ctrlSlots[cost.index - 1]);
		}
		if (!player.isIn() || !target.isIn()) return;
		await target.damage(player, 1);
		// 额外效果（按发动前状态判定；"距离1以内的角色"含自己）
		if (hasHpExtra) {
			const extra1 = await player
				.chooseTarget(`独步：是否扣减一名你距离1以内的角色1点体力上限？`, (card, me, t) => me.distanceTo(t) <= 1 && t.maxHp > 1)
				.set("ai", (target) => -get.attitude(player, target) * (target.maxHp > 2 ? 2 : 1))
				.forResult();
			if (extra1?.bool && extra1.targets?.length) {
				player.line(extra1.targets, "metal");
				await extra1.targets[0].loseMaxHp(1);
			}
		}
		if (hasSlotExtra) {
			const extra2 = await player
				.chooseTarget(`独步：是否废除一名你距离1以内的角色的一个装备栏？`, (card, me, t) => me.distanceTo(t) <= 1 && [1, 2, 3, 4, 5].some((i) => t.countEnabledSlot(i) > 0))
				.set("ai", (target) => -get.attitude(player, target))
				.forResult();
			if (extra2?.bool && extra2.targets?.length) {
				const t = extra2.targets[0];
				player.line([t], "metal");
				const tSlots = [1, 2, 3, 4, 5].filter((i) => t.countEnabledSlot(i) > 0);
				const tCtrls = tSlots.map((i) => slotNames[i]);
				const pick = await player
					.chooseControl(tCtrls)
					.set("prompt", `独步：选择废除${get.translation(t)}的哪个装备栏`)
					.set("ai", () => {
						// 优先废除其持有装备价值最高的栏（有牌的栏比空栏更值得废）
						let best = 0, bestVal = -1;
						tSlots.forEach((slotIdx, i) => {
							const equip = t.getCards("e").find((card) => get.subtype(card) == "equip" + slotIdx);
							const val = equip ? get.value(equip, t) : 0;
							if (val > bestVal) {
								bestVal = val;
								best = i;
							}
						});
						return best;
					})
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
		// usable 比的是 stat.skill[本技能] 的累计次数，必须返回本阶段上限；
		// 返回"剩余次数"会让第一次发动后 usable=1、skillCount=1 → 第二次被直接隐藏
		return lib.skill.xingyu_dubu.getLimit(player);
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
	ai: {
		order(item, player) {
			// 只在攻击范围内有能打出正收益的敌方目标时考虑
			if (!game.hasPlayer((target) => target != player && player.inRange(target) && get.damageEffect(target, player, player) > 0)) return 0;
			// 无装备栏可废时只能减体力上限；已用次数会把上限压到 1 以下（再减即死）则停手
			if (!player.countEnabledSlot() && player.maxHp - lib.skill.xingyu_dubu.usedCount(player) <= 1) return 0;
			return 5;
		},
		result: {
			player: 1,
			target(player, target) {
				return get.damageEffect(target, player, player);
			},
		},
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
			.set("ai", () => (player.hp > 1 || player.countEnabledSlot() > 0 ? 1 : 0))
			.forResult();
		if (!go?.bool) return;
		const result = await player
			.chooseTarget("独步：选择攻击范围内的一名角色", true, (card, me, t) => t != me && me.inRange(t))
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
		if (!result?.bool || !result.targets?.length) return;
		// 伤害路径是 direct 触发技，不自带 useSkill 记录 → 手动 logSkill（每回合限一次的计数依赖 useSkill 历史）
		player.logSkill("xingyu_dubu", result.targets[0]);
		await lib.skill.xingyu_dubu.doDubu(event, player, result.targets[0]);
	},
},
// === 反扑 ===
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
			.reduce((n, evt) => n + (evt.hs?.length || 0) + (evt.es?.length || 0) + (evt.js?.length || 0) + (evt.ss?.length || 0) + (evt.xs?.length || 0), 0);
		return damaged || lost >= 2;
	},
	async content(event, trigger, player) {
		const enemy = trigger.player;
		const go = await player
			.chooseBool(`反扑：是否执行一个只能对${get.translation(enemy)}使用牌的回合？`)
			.set("ai", () => (get.attitude(player, enemy) < 0 ? 1 : 0))
			.forResult();
		if (!go?.bool) return;
		// 存到 mark 所在子技能的 storage 键上（intro 的 $ 读 storage[技能id]）
		player.storage.xingyu_fanpu_turn = enemy;
		// 显式 expire：默认 expire 在下个 phase 事件的 phaseBeforeStart 就会移除临时技，额外回合的约束会整轮失效
		player.addTempSkill("xingyu_fanpu_turn", { player: "phaseAfter" });
		// 原生 insertPhase 均不 await：它只是把额外回合插入事件链，等待会改变结算时机
		player.insertPhase();
	},
},
xingyu_fanpu_turn: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "扑",
	intro: { name: "反扑", content: "本回合只能对$使用牌" },
	mod: {
		// 仿原生「只能对某角色使用牌」的写法（zishou2：mod.playerEnabled）：
		// 在选目标阶段直接禁用其他目标，而不是等 useCardBegin 再取消。
		// 同时会拦住自身目标牌（桃/酒/无中/装备）：它们的目标是自己，不是仇敌。
		playerEnabled(card, player, target) {
			const enemy = player.storage.xingyu_fanpu_turn;
			if (enemy && target != enemy) return false;
		},
	},
	// 额外回合结束时卸下限制（不依赖 phaseAfter 钩子是否被注册）
	trigger: { player: "phaseEnd" },
	forced: true,
	silent: true,
	popup: false,
	content(event, trigger, player) {
		player.removeSkill("xingyu_fanpu_turn");
	},
},
// === 俊逸 ===
xingyu_junyi: {
	audio: 2,
	locked: true,
	// 视为拥有〖闭月〗：直接 inherit 原生 rebiyue，而不是重写摸牌逻辑
	derivation: ["rebiyue"],
	group: ["xingyu_junyi_biyue"],
	subSkill: {
		biyue: {
			name: "闭月",
			inherit: "rebiyue",
			// 显式写出触发时机（与 rebiyue 相同），content/frequent 由 inherit 继承；
			// 同时满足 skill-test 的子技能职责字段检查
			trigger: { player: "phaseJieshuBegin" },
			filter(event, player) {
				// 已经拥有闭月时不重复触发
				if (player.hasSkill("rebiyue")) return false;
				// 装备区里没有防具牌（equip2）时视为拥有闭月
				return !player.getCards("e").some((card) => get.subtype(card) == "equip2");
			},
		},
	},
},
// === 饕心 ===
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
	round: 1,
	trigger: { global: "phaseBegin" },
	filter(event, player) {
		return event.player != player && player.countCards("he") > 0;
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
		await player.give(cards, target);
		await lib.skill.xingyu_jiali.exec(event, player, target, target);
	},
	// 选项结算（贾利本体与饕心的"执行贾利的一项"共用）
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
		// 观看我区域里的所有牌（手牌+装备+判定），展示其中一张并获得之。
		// "visible" 必须显式传：否则选择方看不到手牌内容，不符合描述里的"观看"
		const view = await target
			.choosePlayerCard(player, "visible", true, "hej", "绥抚：观看并展示获得其中一张牌")
			.set("ai", (button) => (button.link ? get.value(button.link) : get.value(button)))
			.forResult();
		const card = view?.cards?.[0];
		if (!card) return;
		await target.showCards([card], "绥抚");
		await target.gain([card], "gain2", "log");
		if (get.type(card) == "basic") {
			// 基本牌：其可以视为使用任意一种基本牌（含属性【杀】），只列当前真能使用的基本牌；
			// 若使用的牌与其获得的牌牌名相同，你摸一张牌
			const list = get.inpileVCardList((info) => {
				if (info[0] != "basic") return false;
				return target.hasUseTarget(get.autoViewAs({ name: info[2], nature: info[3], isCard: true }, []));
			});
			if (!list.length) return;
			// 不 forced：描述是"可以视为使用"，选牌框本身可取消
			const choose = await target
				.chooseButton(["绥抚：选择视为使用的基本牌", [list, "vcard"]])
				.set("ai", (button) => target.getUseValue(get.autoViewAs({ name: button.link[2], nature: button.link[3], isCard: true }, [])))
				.forResult();
			const link = choose?.links?.[0];
			if (!link) return;
			const vcard = get.autoViewAs({ name: link[2], nature: link[3], isCard: true }, []);
			// ⚠️ 必须 .forResult()：GameEvent.then() 的解析值是 undefined（gameEvent.js:75-77，
			//    start() 无返回值，只有 forResult() 才 `return this.result`）。原先直接
			//    `await target.chooseUseTarget(vcard)` 拿到的 used 恒为 undefined →
			//    `used?.bool` 恒假 → "牌名相同则你摸一张牌"一次都不会触发。
			const used = await target.chooseUseTarget(vcard).forResult();
			// 牌名比较口径与上面的 get.type(card) 一致：牌已在目标手牌区，get.name(card) 会取
			// get.owner(card)（=目标）跑 cardname mod；要"印刷牌名"应显式传 get.name(card, false)。
			if (used?.bool && link[2] == get.name(card)) await player.draw();
		} else {
			// 非基本牌：其可以使用之；若如此做，你于结束阶段摸X张牌并交给其一张牌（X=你已损失的体力值且至少为1）
			// 同上：不 .forResult() 则 used 恒 undefined，结束阶段效果也不会挂载
			const used = await target.chooseUseTarget(card).forResult();
			if (used?.bool) {
				player.storage.xingyu_suifu_target = target;
				player.addTempSkill("xingyu_suifu_due");
			}
		}
	},
	ai: {
		// 让目标从自己区域挑牌获得，只对队友发动
		order: 3.5,
		result: {
			target(player, target) {
				return get.attitude(player, target) > 0 ? 1 : -1;
			},
		},
	},
},
xingyu_suifu_due: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	onremove(player) {
		delete player.storage.xingyu_suifu_target;
	},
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
		// 描述是「一名角色的准备阶段」，含自己。
		// trigger.global 对每个玩家分别注册钩子（player.js:10767-10789）并在派发时逐个查表
		// （gameEvent.js:576-579），global 角色还会跳过 player!==event[role] 的判断
		// （gameEvent.js:551），所以自己的准备阶段本来就会派发到这里。
		// 唯一条件是「有手牌可弃」（内容里要弃置一张手牌）。
		return player.countCards("h") > 0;
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const go = await player
			.chooseBool(`戢羽：是否弃置一张手牌，令${get.translation(target)}本回合计算与除其外的角色距离±X（X为你的体力值${player.hp}）？`)
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
			.chooseControl("距离+X", "距离-X")
			.set("prompt", "戢羽：选择方向")
			.set("ai", () => (get.attitude(player, target) > 0 ? 1 : 0))
			.forResult();
		const num = ctrl?.index == 0 ? player.hp : -player.hp;
		// 存到 mark 所在子技能的 storage 键上（intro 的 $ 读 storage[技能id]）
		target.storage.xingyu_jiyu_dist = num;
		target.addTempSkill("xingyu_jiyu_dist");
		// 若你以此法弃置了最后的手牌，其选择令你回复1点体力，或你对其造成1点伤害
		// 选项文案按描述「令你回复 / 你对其造成伤害」直接写清主客体，避免两个「其」互指。
		// damage 的方向：a.damage(b, n) = b 对 a 造成伤害（player.js:8616 next.player=this 承伤，
		// source 由 player 类型实参指定，player.js:8643-8649），所以「你对其造成伤害」要写 target.damage(player)
		//
		// 关键：recover 的 filterStop 在 isHealthy() 时直接 finish（player.js:8777-8785），
		// 也就是满血/无法回复时「令你回复1点体力」是个空选项。描述是「二选一」而非「可以选」，
		// 所以回复不成立时不该把空选项丢给目标选，直接按「你对其造成1点伤害」结算——
		// 原生同款短路：old_mbquesong（newjiang.js:7141）`target.isHealthy() ? { index: 0 } : await target.chooseControl(...)`。
		// 这里回复的一方是 player，所以判 player.isHealthy()；不成立则跳过询问走 damage 分支。
		if (player.countCards("h") == 0) {
			const pick = player.isHealthy()
				? { index: 1 }
				: await target
						.chooseControl("令其回复1点体力", `令${get.translation(player)}对其造成1点伤害`)
						.set("prompt", `戢羽：${get.translation(player)}弃置了最后的手牌，选择对你的影响`)
						.set("ai", () => (get.attitude(target, player) > 0 ? 0 : 1))
						.forResult();
			if (pick?.index == 0) {
				await player.recover(1);
			} else if (pick?.index == 1) {
				await target.damage(player, 1);
			}
		}
	},
},
xingyu_jiyu_dist: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "羽",
	// 距离是「本回合」的临时修正，用 mark:true + 字符 mark 是原生允许的写法
	// （不是 R18 的手牌上限/攻击范围那两类，没有成套图片，别套 attackRange.png）；
	// 距离不是攻击范围，`-1` 坐骑那套 `distance.globalFrom` 才是距离的写法，方向一致。
	// 但 intro.content 里的 `$` 会被 get.translation(storage) 替换（get/index.js:4895），
	// 而 storage 是形如 -3 的数字，翻译不出东西。这里改成函数形态直接返回带符号数字。
	intro: {
		name: "戢羽",
		content(storage) {
			const num = storage || 0;
			return `本回合计算与其他角色的距离${num >= 0 ? "+" : ""}${num}（自身除外）`;
		},
	},
	mod: {
		globalFrom(from, to, distance) {
			return distance + (from.storage.xingyu_jiyu_dist || 0);
		},
	},
},
xingyu_bogua: {
	audio: 2,
	round: 1,
	trigger: { global: "phaseZhunbeiBegin" },
	direct: true,
	filter(event, player) {
		return event.player.isIn();
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const go = await player
			.chooseBool(`卜卦：是否为${get.translation(target)}判定一次？`)
			.set("ai", () => (get.attitude(player, target) != 0 ? 1 : 0))
			.forResult();
		if (!go?.bool) return;
		player.logSkill("xingyu_bogua", target);
		// ⚠️ 必须 .forResult()：await 事件本身拿到的是 undefined（gameEvent.then 返回 void 0），
		// 直接读 judge.color 会抛异常 → content 中断、mark 永远不出现
		const judge = await target.judge().forResult();
		// 持续到卜卦者的「下个回合结束」：记录施加时的 phaseNumber，效果技能在 phaseEnd 里
		// 要求 phaseNumber 已前进（若卜卦发生在卜卦者自己的回合，跳过本回合结束，留到下个回合）
		// 数据存在各自效果技能的 storage 里，黑白两种效果可同时存在、互不覆盖
		const skillId = judge.color == "black" ? "xingyu_bogua_black" : "xingyu_bogua_red";
		target.storage[skillId] = { caster: player, startPhase: game.phaseNumber };
		// expire 只处理卜卦者离场；时长由效果技能自己的 phaseEnd 触发控制
		target.addTempSkill(skillId, (evt) => !player.isIn());
	},
},
xingyu_bogua_black: {
	charlotte: true,
	onremove: true,
	mark: true,
	// 判定为黑 → mark 字色为黑
	marktext: '<span style="color:#000000">卦</span>',
	intro: { name: "卜卦·黑", content: "你使用或受到牌造成的伤害+1，直到卜卦者下个回合结束" },
	trigger: {
		player: "damageBegin1",
		source: "damageBegin1",
		global: "phaseEnd",
	},
	forced: true,
	silent: true,
	popup: false,
	filter(event, player, name) {
		if (event.name == "phase") {
			const storage = player.storage.xingyu_bogua_black;
			return !!storage?.caster && event.player == storage.caster && game.phaseNumber > storage.startPhase;
		}
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
	// 判定为红 → mark 字色为红
	marktext: '<span style="color:#ff0000">卦</span>',
	intro: { name: "卜卦·红", content: "你计算与其他角色的距离-1，其他角色计算与你的距离-1，直到卜卦者下个回合结束" },
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
		const storage = player.storage.xingyu_bogua_red;
		return !!storage?.caster && event.player == storage.caster && game.phaseNumber > storage.startPhase;
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
			.set("ai", (target) => (target ? -get.attitude(get.event().player, target) : 0))
			.forResult();
		if (!result?.targets?.length) return;
		player.awakenSkill("xingyu_juechou");
		player.logSkill("xingyu_juechou", result.targets);
		// 键名与技能 id 一致 → mark intro 的 $ / mod.cardUsableTarget 都直接读它
		player.storage.xingyu_juechou_eff = result.targets[0];
		player.addTempSkill("xingyu_juechou_eff");
	},
},
xingyu_juechou_eff: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "仇",
	intro: { name: "决仇", content: "本回合可以将红色的牌当【杀】对$使用，且对其使用【杀】无次数限制" },
	enable: "chooseToUse",
	mod: {
		// 仿 jsrgbiaozhao 表召：cardUsableTarget 只对指定目标解除次数限制
		// （此前用 cardUsable 全局 return Infinity，会把本回合所有【杀】都放开）
		cardUsableTarget(card, player, target) {
			if (target == player.storage.xingyu_juechou_eff && get.name(card) == "sha") return true;
		},
	},
	viewAs: { name: "sha", isCard: true },
	filterCard(card) {
		return get.color(card) == "red" && get.position(card) == "h";
	},
	selectCard: 1,
	filterTarget(card, player, target) {
		return target == player.storage.xingyu_juechou_eff;
	},
	prompt: "决仇：将一张红色牌当【杀】对目标使用",
	ai: {
		order: 6,
		result: {
			target(player, target) {
				return get.damageEffect(target, player, player);
			},
		},
	},
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
		// 【桃】只有在场上有已受伤角色时才有合法目标（满血角色不能成为桃的目标）
		const options = [["basic", "", "jiu"]];
		if (game.hasPlayer((cur) => cur.isDamaged())) options.push(["basic", "", "tao"]);
		const choose = await player
			.chooseButton(["谦辞：视为使用一张牌", [options, "vcard"]], true)
			.set("ai", (button) => (button.link[2] == (player.isDamaged() ? "tao" : "jiu") ? 2 : 1))
			.forResult();
		const name = choose?.links?.[0]?.[2] || "jiu";
		const vcard = get.autoViewAs({ name }, []);
		// 目标按牌自身规则：桃只能选已受伤角色（targetEnabled2 的 modTarget = isDamaged），
		// 酒因 modTarget:true 可选任意角色；同时尊重 targetEnabled/playerEnabled 修正
		const result = await player
			.chooseTarget(`谦辞：选择${name == "jiu" ? "【酒】" : "【桃】"}的目标`, true, (cardx, me, t) => lib.filter.targetEnabled2(vcard, me, t))
			// ⚠️ chooseTarget 的 ai 回调收到的是**目标玩家本身**（noname/ai/basic.js:162-169 的
			// `check(target?: Player, targets?: Player[])`），不是 button；写成 (button) => button.link
			// 会拿到 undefined，get.attitude 里读 to.ai.shown 直接崩（mode/identity.js:3734）。
			.set("ai", (target) => {
				if (!target) return 0;
				const me = get.event().player;
				return name == "tao" ? get.attitude(me, target) + (target.isDamaged() ? 2 : 0) : get.attitude(me, target);
			})
			.forResult();
		if (!result?.targets?.length) return;
		player.logSkill("xingyu_qianci", result.targets);
		await player.useCard(vcard, [], result.targets, "xingyu_qianci");
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
		// 该角色可以交给你X张牌
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
				// 描述"可以执行以下一项"：加 cancel2 恢复可拒（引擎不再自动补 cancel，须手动加）
				.chooseControl("摸" + get.cnNumber(x) + "张牌", "结束阶段获得其至多" + get.cnNumber(x) + "张弃牌", "弃置场上一张武器牌", "cancel2")
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
				game.players.forEach((cur) => weapons.addArray(cur.getCards("e").filter((card) => get.subtype(card) == "equip1")));
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
		// 其于本回合弃置的牌（在弃牌堆里的）。
		// ⚠️ getHistory("discard") 是死键（actionHistory 初始键只有 useCard/respond/skipped/lose/gain/sourceDamage/damage/custom/useSkill，
		// content.js:4126-4136），必须用 lose + type=="discard" 认领，否则 undefined.flatMap 直接抛错。
		const discarded = player
			.getHistory("lose")
			.filter((evt) => evt.type == "discard")
			.flatMap((evt) => [...(evt.hs || []), ...(evt.es || []), ...(evt.js || [])])
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
	// 「限一次」；若蓄力时预选了「限一次」，则下一次发动不计次数
	usable(skill, player) {
		return (player.storage.xingyu_qiaogong_ignore || []).includes("limit") ? 2 : 1;
	},
	filter(event, player) {
		const pending = player.storage.xingyu_qiaogong_ignore || [];
		const ignoreEquip = pending.includes("equip");
		const ignoreHand = pending.includes("hand");
		return game.hasPlayer(
			(target) =>
				(ignoreEquip || target.countCards("e") > 0) &&
				(ignoreHand || target.countCards("h") < player.countCards("h"))
		);
	},
	async content(event, trigger, player) {
		// 蓄力时已预选无视项，本次发动直接套用并清空
		const pending = (player.storage.xingyu_qiaogong_ignore || []).slice();
		delete player.storage.xingyu_qiaogong_ignore;
		const ignoreEquip = pending.includes("equip");
		const ignoreHand = pending.includes("hand");
		const ignoreLimit = pending.includes("limit");
		const choose = await player
			.chooseTarget("巧工：选择令其摸一张牌的角色", true, (card, me, target) =>
				(ignoreEquip || target.countCards("e") > 0) &&
				(ignoreHand || target.countCards("h") < me.countCards("h"))
			)
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!choose?.targets?.length) return;
		const target = choose.targets[0];
		player.logSkill("xingyu_qiaogong", target);
		await target.draw(1);
		// 预选「限一次」：本次发动不计次数
		if (ignoreLimit) {
			const stat = player.getStat("skill");
			if (typeof stat.xingyu_qiaogong === "number" && stat.xingyu_qiaogong > 0) {
				stat.xingyu_qiaogong--;
			}
		}
	},
	group: ["xingyu_qiaogong_charge"],
	subSkill: {
		charge: {
			audio: "xingyu_qiaogong",
			enable: "phaseUse",
			filter(event, player) {
				// 不限次数、累计；三项都无视后不能再蓄力
				const equips = player.countCards("hes", (card) => get.type(card) == "equip");
				return (player.storage.xingyu_qiaogong_ignore || []).length < 3 && equips > 0;
			},
			async content(event, trigger, player) {
				const pending = player.storage.xingyu_qiaogong_ignore || [];
				const labels = { equip: "装备区有牌", hand: "手牌数小于你", limit: "限一次" };
				const remaining = ["equip", "hand", "limit"].filter((key) => !pending.includes(key));
				const equipCount = player.countCards("hes", (card) => get.type(card) == "equip");
				const max = Math.min(remaining.length, equipCount, 3);
				if (max <= 0) return;
				const result = await player
					.chooseCard("hes", [1, max], "巧工（蓄力）：选择要弃置的装备牌（可取消）", (card) => get.type(card) == "equip")
					.set("ai", (card) => 5 - get.value(card))
					.forResult();
				if (!result?.cards?.length) return;
				const x = result.cards.length;
				await player.discard(result.cards);
				await player.draw(x);
				// 蓄力时预选等量项：用自带的可多选按钮（tdnodes），不要用单选 textbutton
				const list = remaining.map((key) => [key, labels[key]]);
				const pick = await player
					.chooseButton(["巧工（蓄力）：选择要无视的项", [list, "tdnodes"]], [x, x], true)
					.set("ai", (button) => 1)
					.forResult();
				const chosen = (pick?.links || []).filter((key) => remaining.includes(key));
				if (!chosen.length) return;
				player.storage.xingyu_qiaogong_ignore = pending.concat(chosen);
				player.logSkill("xingyu_qiaogong_charge");
			},
			ai: {
				// 蓄力是给主技能铺路：有装备可弃时低优先级使用
				order: 4,
				result: {
					player: 1,
				},
			},
		},
	},
	ai: {
		// 令满足条件的角色摸一张，按态度选队友
		order: 5,
		result: {
			target(player, target) {
				return get.attitude(player, target);
			},
		},
	},
	onremove(player) {
		delete player.storage.xingyu_qiaogong_ignore;
	},
},
xingyu_qinjian: {
	audio: 2,
	// 弃牌入堆的触发全家桶（坑清单 #95）：player.discard 弃装备走 loseAfter，game.cardsDiscard 走
	// cardsDiscardAfter，批量移动走 loseAsyncAfter——按 position=d 过滤幂等，不重不漏
	trigger: {
		global: ["loseAfter", "cardsDiscardAfter", "loseAsyncAfter"],
	},
	direct: true,
	filter(event, player) {
		const cards = event.cards || [];
		// get.subtype 对非装备牌返回 undefined ⇒ 直接 .startsWith 会崩；用可选链守卫
		return cards.some((card) => get.position(card, true) == "d" && get.subtype(card)?.startsWith("equip") && player.countEnabledSlot() > 0);
	},
	async content(event, trigger, player) {
		const cards = (trigger.cards || []).filter((card) => get.position(card, true) == "d" && get.subtype(card)?.startsWith("equip"));
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
// 共享"响应改移牌"逻辑挂在 xingyu_linan 下（断江第二段等调用；酾难本体是其自己的"翻面成为额外目标"）
xingyu_linan: {
	// 返回 true 表示已按"移牌视为打出"处理：直接以虚拟牌完成本次响应（护驾 sxrm.js:2007 同款），
	// 响应成功即不再产生伤害事件，无残留防护窗口
	async moveRespond(event, player, responder) {
		const useCard = event.getParent("useCard");
		if (!useCard || !useCard.card) return false;
		const name = useCard.card.name;
		const need = name == "nanman" || name == "juedou" ? "sha" : name == "wanjian" || name == "sha" ? "shan" : null;
		if (!need) return false;
		// 其判定区或装备区的一张能在「断江拥有者」对应区域放下的牌才候选
		const cards = responder.getCards("je").filter((card) => {
			const pos = get.position(card);
			if (pos == "e") return player.canEquip(card, false);
			if (pos == "j") return player.canAddJudge(card);
			return false;
		});
		if (!cards.length) return false;
		const pick = await responder
			.chooseCard("je", false, `是否将一张牌移动至${get.translation(player)}的对应区域，视为打出【${need == "sha" ? "杀" : "闪"}】？`)
			.set("ai", (card) => (get.position(card) == "j" || get.value(card) < 4 ? 10 : 0))
			.forResult();
		if (!pick?.bool || !pick.cards?.length) return false;
		const card = pick.cards[0];
		// 若玩家选了不能按定义放下的牌，按「未触发断江」处理，响应仍走常规盈后续流程
		if (!cards.includes(card)) return false;
		const isJudge = get.position(card) == "j";
		if (isJudge) {
			await player.addJudge(card);
		} else {
			await player.gain([card], "gain2");
			if (player.getCards("he").includes(card)) await player.equip(card);
		}
		// 视为打出：以虚拟【杀/闪】直接完成响应，其本人的响应窗口不再弹出
		event.result = { bool: true, card: { name: need, isCard: true } };
		event.responded = true;
		event.animate = false;
		game.log(responder, "将一张牌移动至", player, "的对应区域，视为打出了", "#g" + (need == "sha" ? "【杀】" : "【闪】"));
		return true;
	},
	audio: 2,
	// 酾难：其他角色使用仅指定自己为目标的基本牌或普通锦囊牌时，你可以翻面并成为此牌的额外目标
	trigger: { global: "useCard2" },
	direct: true,
	filter(event, player) {
		if (event.player == player || !player.isIn() || !event.card) return false;
		const targets = event.targets;
		if (!targets || targets.length != 1 || targets[0] != event.player) return false;
		// 基本牌或普通锦囊（延时锦囊的 type 是 "delay"，天然排除）
		const type = get.type(event.card);
		if (type != "basic" && type != "trick") return false;
		// 额外目标也必须符合牌自身的目标规则（原生加目标统一用 targetEnabled2）：
		// 【桃】的 modTarget = target.isDamaged() → 满血角色不能成为桃的额外目标；
		// 【无中】【酒】等 modTarget:true 的牌则不受限
		return lib.filter.targetEnabled2(event.card, event.player, player);
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool(`酾难：是否翻面并成为【${get.translation(trigger.card)}】的额外目标？`)
			.set("ai", () => get.effect(player, trigger.card, trigger.player, player) > 0)
			.forResult();
		if (!go?.bool) return;
		player.logSkill("xingyu_linan", trigger.player);
		await player.turnOver();
		// 追加目标：useCard2 时 triggeredTargets2 尚未惰性初始化，必须两处都加（坑清单 #37）
		trigger.targets.add(player);
		if (!Array.isArray(trigger.triggeredTargets2)) trigger.triggeredTargets2 = [];
		trigger.triggeredTargets2.add(player);
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
		// 回合结束：无论几张都要进来清点（清空记录 + 恰为 1 时结算）
		return player.isIn();
	},
	async content(event, trigger, player) {
		// useCardToTargeted 触发名的宿主事件是 useCard，trigger.name 恒为 "useCard"，须用 triggername 区分
		if (event.triggername == "useCardToTargeted") {
			if (!player.storage.xingyu_yinling_cards) player.storage.xingyu_yinling_cards = [];
			player.storage.xingyu_yinling_cards.push(trigger.card);
			return;
		}
		const recorded = player.storage.xingyu_yinling_cards || [];
		player.storage.xingyu_yinling_cards = [];
		// 描述"仅成为过一张牌的目标"：恰记录一张才结算
		if (recorded.length != 1) return;
		const thatCard = recorded[0];
		const len = get.translation(thatCard.name).length;
		// 视为使用一张与该牌牌名字数和为5的基本牌或普通锦囊牌
		// 正常印牌口径：候选 = 当前牌堆里的名（inpileVCardList），且当前用得出（hasUseTarget）
		const list = get.inpileVCardList((info) => {
			if (info[0] != "basic" && info[0] != "trick") return false;
			if (info[2] == "shan" || info[2] == "wuxie") return false;
			if (get.translation(info[2]).length != 5 - len) return false;
			return player.hasUseTarget(get.autoViewAs({ name: info[2], nature: info[3] }, []), true, true);
		});
		if (!list.length) return;
		const go = await player
			.chooseBool(`吟翎：是否视为使用一张与【${get.translation(thatCard.name)}】牌名字数和为5的牌？`)
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		const choose = await player
			.chooseButton([`吟翎：选择视为使用的牌`, [list, "vcard"]], true)
			.set("ai", (button) => player.getUseValue({ name: button.link[2], nature: button.link[3], isCard: true }))
			.forResult();
		if (!choose?.links?.length) return;
		const name = choose.links[0][2], nature = choose.links[0][3];
		const drunk = player.hasSkill("jiu");
		const vcard = get.autoViewAs({ name, nature }, []);
		// 若你不处于【酒】状态，以此法使用的牌仅对一个目标生效
		if (!drunk) {
			// ⚠️ 不能无条件弹「选目标」：本来就只能指定自己的单目标牌（无中生有、桃等 toself），
			//    以及无目标牌（notarget），合法目标只有 0~1 个，弹窗要么给空框、要么根本没得选。
			// 正确口径：先算合法目标，按数量分流——
			//   0 个 → 无目标牌，直接视为使用；
			//   1 个 → 直接指定它，不问（这就是「本来就指定自己的牌不用选目标」）；
			//   ≥2 个 → 才让玩家挑一个（描述「仅对一个目标生效」）。
			const legal = game.filterPlayer((target) => player.canUse(vcard, target));
			let targets;
			if (legal.length <= 1) {
				targets = legal;
			} else {
				const result = await player
					.chooseTarget(`吟翎：选择【${get.translation(name)}】的目标（仅对一个目标生效）`, true, (card, me, t) => me.canUse(vcard, t))
					// chooseTarget 的 ai 回调收到的是**目标玩家**本身；旧写法 (button) => get.effect(button.link, ...)
					// 里 button.link 恒 undefined，等于每次都在给 get.effect 传垃圾参数（AI 目标选择失效）。
					.set("ai", (target) => get.effect(target, vcard, player, player))
					.forResult();
				if (!result?.targets?.length) return;
				targets = result.targets;
			}
			await player.useCard(vcard, [], targets, "xingyu_yinling");
		} else {
			await player.chooseUseTarget(vcard, true).set("logSkill", "xingyu_yinling");
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
		return !player.hasSkill("xingyu_xianlue_off");
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool("先略：是否摸一张牌并执行其中一项？（然后此技能失效直到有角色进入濒死状态）")
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
			// 正常印牌口径：候选 = 当前牌堆里的普通锦囊（inpileVCardList，延时锦囊 type 为 delay 天然排除），
			// 且当前用得出（hasUseTarget 全链：目标合法性/次数/桃满血等），不是 lib.card 全表
			const list = get.inpileVCardList((info) => info[0] == "trick" && player.hasUseTarget(get.autoViewAs({ name: info[2], nature: info[3] }, []), true, true));
			if (list.length) {
				const choose = await player
					.chooseButton([`先略：视为使用一种普通锦囊牌`, [list, "vcard"]], true)
					.set("ai", (button) => player.getUseValue({ name: button.link[2], nature: button.link[3], isCard: true }))
					.forResult();
				if (choose?.links?.length) {
					await player.chooseUseTarget(get.autoViewAs({ name: choose.links[0][2], nature: choose.links[0][3] }, []), true);
				}
			}
		} else if (ctrl?.index == 1) {
			const result = await player
				.chooseTarget(`先略：令一名与你势力相同的角色摸牌至体力上限（不超过五张）`, true, (card, me, t) => lib.skill.xingyu_xianlue.sameGroup(me, t))
				.set("ai", (target) => (target ? get.attitude(get.event().player, target) : 0))
				.forResult();
			if (result?.targets?.length) {
				const t = result.targets[0];
				const n = Math.min(t.maxHp, 5) - t.countCards("h");
				if (n > 0) await t.draw(n);
			}
		}
		// 失效直到进入濒死状态（颂酒同款：disableSkill 使技能描述变灰；off 指标记一并做恢复门）
		player.disableSkill("xingyu_xianlue_off", "xingyu_xianlue");
		player.addSkill("xingyu_xianlue_off");
	},
},
xingyu_xianlue_off: {
	charlotte: true,
	onremove: true,
	// 有角色进入濒死状态时恢复
	trigger: { global: "dying" },
	forced: true,
	silent: true,
	popup: false,
	filter(event, player) {
		// disabledSkills 以「被禁用技能」为键、禁用方键为值（player.js:11260-11261）；
		// disableSkill 后 xingyu_xianlue 被 game.filterSkills 移出 getSkills()，hasSkill 恒为 false，
		// 故恢复门只能直接查禁用表里是否仍挂着 off 键
		return !!player.disabledSkills.xingyu_xianlue?.includes("xingyu_xianlue_off");
	},
	async content(event, trigger, player) {
		// enableSkill 必须传 disableSkill 时的第一个参数（键）
		player.enableSkill("xingyu_xianlue_off");
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
		// direct+chooseBool 经典搭配：chooseBool 承担"可以"（可拒绝），确认后再强制选目标
		const go = await player
			.chooseBool(`奉王：是否令一名与你势力相同的角色摸一张牌，然后本回合你的手牌上限与该角色相同？`)
			.set("ai", () => game.hasPlayer((cur) => lib.skill.xingyu_xianlue.sameGroup(player, cur) && (get.attitude(player, cur) > 0 || cur.getHandcardLimit() > player.getHandcardLimit())))
			.forResult();
		if (!go?.bool) return;
		const result = await player
			.chooseTarget(`奉王：选择与你势力相同的角色`, true, (card, me, t) => lib.skill.xingyu_xianlue.sameGroup(me, t))
			// ⚠️ chooseTarget 的 ai 参数是目标角色本身（不是 button，没有 .link）
			.set("ai", (target) => {
				if (!target) return 0;
				const me = get.event().player;
				return get.attitude(me, target) + (target.getHandcardLimit() > me.getHandcardLimit() ? 3 : 0);
			})
			.forResult();
		if (!result?.targets?.length) return;
		const target = result.targets[0];
		player.logSkill("xingyu_fengwang", target);
		await target.draw();
		// 存到 mark 所在子技能的 storage 键上（intro 的 $ 读 storage[技能id]）
		player.storage.xingyu_fengwang_eff = target;
		player.addTempSkill("xingyu_fengwang_eff");
	},
},
xingyu_fengwang_eff: {
	charlotte: true,
	onremove: true,
	mark: true,
	// 改手牌上限必须挂 handcard.png（R18）；storage 是目标角色，intro 里 $ 由引擎换成其名字
	markimage: "image/card/handcard.png",
	intro: {
		name: "奉王",
		content(storage, player) {
			const target = get.translation(storage);
			return `<li>本回合手牌上限与${target}相同<br><li>当前手牌上限：${player.getHandcardLimit()}`;
		},
	},
	mod: {
		maxHandcard(player, num) {
			const t = player.storage.xingyu_fengwang_eff;
			// 目标为自己 = 上限不因本技能改变；直接返回 num，否则 getHandcardLimit 会重新进入本 mod 自递归
			if (!t?.isIn() || t === player) return num;
			// 两名奉王互相指定时同样会跨玩家递归，仿原生隐避（dcyinbi）加一次求值保护
			if (_status.xingyu_fengwang_limit) return num;
			_status.xingyu_fengwang_limit = true;
			const value = t.getHandcardLimit();
			delete _status.xingyu_fengwang_limit;
			return value;
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
		return event.card.name == "nanman" && event.player != player;
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
	// 「对某人使用一张牌」标准（docs/技能模板与印牌.md §使用一张牌/对某人使用一张牌）：
	// · 不受距离限制：canUse 第 3 参 distance=false，跳过 targetInRange
	// · 牌池 = 能对目标使用 或 能对自己使用（酒/装备/无中/非满血桃等自身目标牌不被排除）
	// · 自动排除满血桃、闪/无懈、以及对该目标和自己都没有合法目标的牌；额外排除 multitarget
	// · 次数：战缘拥有者回合外使用 → cardUsable 的 phaseUse 分支放行；
	//   被战缘的角色在自己的出牌阶段使用【杀】→ 正常受本回合次数限制
	async useCardOn(user, target, prefix) {
		user.storage.xingyu_zhanyuan_damaged = false;
		user.addTempSkill("xingyu_zhanyuan_damage");
		const phaseUse = _status.event.getParent("phaseUse");
		const usableEvent = { player: user, getParent: () => phaseUse || { name: "none" } };
		const res = await user
			.chooseToUse(
				(card) =>
					!get.info(card).multitarget &&
					(user.canUse(card, target, false) || user.canUse(card, user, false)) &&
					lib.filter.cardUsable(card, user, usableEvent),
				`战缘：${prefix}对${get.translation(target)}使用一张牌`,
				(card, me, to) => to === target && lib.filter.targetEnabled(card, me, to)
			)
			.forResult();
		const damaged = !!user.storage.xingyu_zhanyuan_damaged;
		user.removeSkill("xingyu_zhanyuan_damage");
		return { used: !!res?.bool && !!res.cards?.length, damaged };
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		// 标记本次结算链：xingyu_zhanyuan_damage 据此判断"造成伤害的牌是不是战缘用的"
		event.xingyuZhanyuan = true;
		const first = await lib.skill.xingyu_zhanyuan.useCardOn(player, target, "");
		if (!first.used || first.damaged || !target.isIn() || target.countCards("he") == 0) return;
		const second = await lib.skill.xingyu_zhanyuan.useCardOn(target, player, "其可以");
		if (!second.used || second.damaged || !player.isIn() || !target.isIn()) return;
		await player.draw();
		await target.draw();
	},
},
// 战缘的伤害记录：source 为用牌者，伤害链上挂着战缘事件时打标记（勿用 getHistory 扫 useCard，
// 之前 await player.useCard(...) 拿到的是 undefined，导致"造成了伤害"永远判不出来）
xingyu_zhanyuan_damage: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { source: "damageAfter" },
	filter(event) {
		// getParent 未命中返回 {}（真值），必须判 .name
		return !!event.getParent((evt) => evt.xingyuZhanyuan)?.name;
	},
	async content(event, trigger, player) {
		await lib.skill.xingyu_zhanyuan_damage.run(event, trigger, player);
	},
	run(event, trigger, player) {
		player.storage.xingyu_zhanyuan_damaged = true;
	},
},
xingyu_niansi: {
	audio: 2,
	trigger: {
		player: "phaseZhunbeiBegin",
		// 原生“其他角色受伤后”统一用裸 damage
		global: "damage",
	},
	direct: true,
	filter(event, player, name) {
		if (name === "damage" || event.name == "damage") {
			// 男性角色受到伤害后其体力值不大于你；本引擎用 sex，没有 isMale()
			const damaged = event.player;
			return damaged?.sex == "male" && damaged.hp <= player.hp;
		}
		return true;
	},
	// 明置牌堆里的一张牌（自牌堆顶下数十张以内）——孤居重发动共用
	async doNiansi(event, player) {
		const pile = ui.cardPile.childNodes;
		const candidates = [];
		for (let i = 0; i < Math.min(10, pile.length); i++) candidates.push(pile[i]);
		if (!candidates.length) return;
		// 顶下十张都已经明置时没有可选的牌
		if (!candidates.some((card) => !qunyou_isPileCardVisible(card))) return;
		const dialog = ui.create.dialog(`念嗣：明置牌堆里的一张牌（牌堆顶下十张以内）`, [candidates, "card"], "hidden");
		for (const button of dialog.buttons) {
			if (qunyou_isPileCardVisible(button.link)) {
				// 已明置的牌保留展示，但不可选
				button.classList.add("unselectable");
			}
		}
		const choose = await player
			.chooseButton(dialog, true)
			.set("filterButton", (button) => !qunyou_isPileCardVisible(button.link))
			.set("ai", (button) => get.value(button.link))
			.forResult();
		if (!choose?.links?.length) return;
		const card = choose.links[0];
		// 双保险：结果里也不接受已明置的牌
		if (qunyou_isPileCardVisible(card)) return;
		if (!player.storage.xingyu_niansi_cards) player.storage.xingyu_niansi_cards = [];
		if (!player.storage.xingyu_niansi_cards.includes(card)) {
			player.storage.xingyu_niansi_cards.push(card);
		}
		player.markSkill("xingyu_niansi_mark");
		// 写入全局“牌堆可见牌”注册表：清玄/浮饰等技能共享同一可见性
		qunyou_markPileVisible([card], false);
		await player.showCards([card], "念嗣·明置");
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
	group: ["xingyu_niansi_watch"],
	subSkill: {
		// 其他角色获得牌堆里明置的牌时：你可以令其摸一张牌，然后改为你获得这些牌
		watch: {
			audio: "xingyu_niansi",
			// gainBefore 先确认“确实是从牌堆明置区获得”，gainAfter 再结算；
			// 避免明置牌先离开牌堆、之后从弃牌堆被获得时被误判为“获得牌堆里的明置牌”
			trigger: { global: ["gainBefore", "gainAfter"] },
			direct: true,
			filter(event, player, name) {
				const marked = player.storage.xingyu_niansi_cards;
				if (!marked?.length || event.player == player) return false;
				if (name === "gainBefore") {
					// 两条取牌路径统一判断：get.cardPile（牌仍在牌堆）/ get.cards（original="c"）
					return (event.cards || []).some((card) => lib.xingyuNiansiIsVisiblePileGain(card, marked));
				}
				const pending = player.storage.xingyu_niansi_gaining?.[event.id] || [];
				return (event.cards || []).some((card) => marked.includes(card) && pending.includes(card.cardid));
			},
			async content(event, trigger, player) {
				if (event.triggername === "gainBefore") {
					const marked = player.storage.xingyu_niansi_cards || [];
					const ids = (trigger.cards || [])
						.filter((card) => lib.xingyuNiansiIsVisiblePileGain(card, marked))
						.map((card) => card.cardid);
					player.storage.xingyu_niansi_gaining ??= {};
					player.storage.xingyu_niansi_gaining[trigger.id] = ids;
					return;
				}
				const pending = player.storage.xingyu_niansi_gaining?.[trigger.id] || [];
				if (player.storage.xingyu_niansi_gaining) {
					delete player.storage.xingyu_niansi_gaining[trigger.id];
				}
				const marked = player.storage.xingyu_niansi_cards || [];
				const cards = (trigger.cards || []).filter((card) => marked.includes(card) && pending.includes(card.cardid));
				if (!cards.length) return;
				const go = await player
					.chooseBool("念嗣：是否令其摸一张牌，改为你获得这些明置的牌？")
					.set("ai", () => 1)
					.forResult();
				if (!go?.bool) return;
				player.logSkill("xingyu_niansi", trigger.player);
				await trigger.player.draw(1);
				await player.gain(cards, "gain2", "log");
				player.storage.xingyu_niansi_cards = marked.filter((card) => !cards.includes(card));
				player.markSkill("xingyu_niansi_mark");
			},
		},
	},
},
xingyu_niansi_mark: {
	charlotte: true,
	mark: true,
	marktext: "嗣",
	intro: {
		name: "念嗣",
		content(storage, player) {
			// 只显示仍在牌堆里的明置牌：被摸走/使用后不再列出
			const cards = (player.storage.xingyu_niansi_cards || []).filter((card) => get.position(card, true) == "c");
			return "已明置" + cards.length + "张牌：" + cards.map((card) => get.translation(card)).join("、");
		},
	},
},
xingyu_guju: {
	audio: 2,
	trigger: { player: "gainAfter" },
	direct: true,
	filter(event, player) {
		// 回合外；getParent 未命中返回 {}（真值），forced=true 才返回 undefined
		const phase = event.getParent("phase", true);
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
		const phase = trigger.getParent("phase", true);
		if (!phase) return;
		const cur = phase.player;
		if (!cur?.isIn()) return;
		const pick = await player
			.choosePlayerCard(cur, true, "hej", "孤居：弃置当前回合角色区域里的一张牌")
			.set("ai", (button) => (button.link ? get.value(button.link) : 0))
			.forResult();
		const card = pick?.cards?.[0] || pick?.links?.[0];
		if (!card) return;
		// 牌属于当前回合角色，必须由持有者弃置；player.discard 只会处理自己的牌
		await cur.discard([card]);
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
		// 描述是“所有牌堆里明置的牌”，走共享可见牌注册表，不只念嗣自己的记录
		return !player.storage.xingyu_jueyin && qunyou_hasVisiblePile();
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool("绝姻：是否改为获得所有牌堆里明置的牌？")
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		player.awakenSkill("xingyu_jueyin");
		player.logSkill("xingyu_jueyin");
		const cards = lib.qunyou_getVisiblePileTop().map((item) => item.card);
		if (cards.length) {
			await player.gain(cards, "gain2", "log");
			// 同步清掉念嗣个人记录中已被获得的牌
			player.storage.xingyu_niansi_cards = (player.storage.xingyu_niansi_cards || []).filter((card) => !cards.includes(card));
			if ((player.storage.xingyu_niansi_cards || []).length) {
				player.markSkill("xingyu_niansi_mark");
			} else {
				player.unmarkSkill("xingyu_niansi_mark");
			}
		}
		// 「改为」获得：跳过本阶段的正常摸牌
		trigger.cancel();
		const result = await player
			.chooseTarget("绝姻：令一名角色于其下一个回合使用的牌对你无效", true)
			.set("ai", (target) => -get.attitude(player, target))
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
	onremove(player) {
		delete player.storage.xingyu_jueyin_active;
		delete player.storage.xingyu_jueyin_caster;
	},
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
			// ⚠️ trigger 是宿主事件（phase 事件，name 恒为 "phase"），时机名要看 event.triggername。
			//    原写 trigger.name == "phaseBegin" 恒 false → phaseBegin 也走 else 分支，
			//    在目标回合开始就 active=false 并 removeSkill，效果永远不生效。
			if (event.triggername == "phaseBegin") {
				player.storage.xingyu_jueyin_active = true;
			} else if (player.storage.xingyu_jueyin_active) {
				// 只有“其下一个回合”真正开始过，才在结束阶段移除；
				// 目标是当前回合角色时，本回合的 phaseEnd 不能把效果提前删掉
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
	locked: true,
	// 锁定技：黑色手牌均视为雷【杀】（争绝式 cardname/cardnature，而非 chooseToUse 转化）
	mod: {
		cardname(card, player) {
			if (get.color(card, player) === "black") return "sha";
		},
		cardnature(card, player) {
			if (get.color(card, player) === "black") return "thunder";
		},
		// 你使用的雷【杀】无次数限制
		cardUsable(card, player) {
			if (get.name(card, player) == "sha" && get.nature(card, player) == "thunder") return Infinity;
		},
	},
	group: ["xingyu_leishen_thunder"],
	subSkill: {
		// 当你造成雷属性伤害后：所有其他角色依次亮出一张手牌，未亮出【闪】的角色获得1枚「震慑」
		thunder: {
			audio: "xingyu_leishen",
			trigger: { source: "damageAfter" },
			direct: true,
			filter(event, player) {
				return event.nature == "thunder" && event.player != player && game.hasPlayer((cur) => cur != player && cur.isIn());
			},
			async content(event, trigger, player) {
				const go = await player
					.chooseBool("雷神：是否令所有其他角色依次亮出一张手牌？（未亮出【闪】者获得1枚「震慑」）")
					.set("ai", () => 1)
					.forResult();
				if (!go?.bool) return;
				player.logSkill("xingyu_leishen", game.filterPlayer((cur) => cur != player));
				for (const cur of game.filterPlayer((cur) => cur != player && cur.isIn())) {
					if (!cur.countCards("h")) {
						// 无牌可亮：视为未亮出【闪】
						cur.addSkill("xingyu_zhenzhe_mark");
						cur.addMark("xingyu_zhenzhe_mark", 1, false);
						continue;
					}
					const res = await cur
						.chooseCard("h", true, "雷神：亮出一张手牌")
						.set("ai", (card) => (get.name(card) == "shan" ? 10 : 0))
						.forResult();
					const card = res?.cards?.[0];
					if (!card) continue;
					await cur.showCards([card], "雷神");
					if (get.name(card) != "shan") {
						cur.addSkill("xingyu_zhenzhe_mark");
						cur.addMark("xingyu_zhenzhe_mark", 1, false);
					}
				}
			},
		},
	},
},
// "震慑"标记（挂在其他角色身上）
xingyu_zhenzhe_mark: {
	charlotte: true,
	mark: true,
	marktext: "慑",
	intro: { name: "震慑", content: "拥有$枚" },
	onremove(player) {
		// removeSkill 只移除标记图标，不清 storage；不删会留下 countMark 幽灵计数
		delete player.storage.xingyu_zhenzhe_mark;
	},
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
			.chooseBool("雷轰：是否令所有拥有「震慑」的角色依次弃牌或受伤？（此阶段结束时，你移除所有「震慑」，可以废除其中标记数不小于体力上限的角色的一个装备栏）")
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
		// 记录本次已发动；本阶段继续正常进行，清理在自然结束时（phaseUseEnd）执行
		player.storage.xingyu_leihong_pending = true;
		player.addTempSkill("xingyu_leihong_clear", "phaseUseAfter");
	},
	subSkill: {
		clear: {
			charlotte: true,
			sub: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: { player: "phaseUseEnd" },
			filter(event, player) {
				return !!player.storage.xingyu_leihong_pending;
			},
			async content(event, trigger, player) {
				delete player.storage.xingyu_leihong_pending;
				// 范围是当前所有拥有「震慑」标记的角色，而不是只限本次被令弃牌/受伤的快照；
				// 高标记角色本来就被发动 filter（标记数<体力上限）排除在快照外，必须在这里重新取
				const eligible = game.filterPlayer((cur) => cur != player && cur.countMark("xingyu_zhenzhe_mark") >= cur.maxHp);
				// 移除所有"震慑"标记
				game.players.concat(game.dead).forEach((cur) => cur.removeSkill("xingyu_zhenzhe_mark"));
				// 可以选择废除其中每个符合条件角色的一个装备栏；也可以不废除
				const slotNames = { 1: "武器栏", 2: "防具栏", 3: "+1坐骑栏", 4: "-1坐骑栏", 5: "宝物栏" };
				for (const target of eligible) {
					if (!target.isIn()) continue;
					const slots = [1, 2, 3, 4, 5].filter((i) => target.countEnabledSlot(i) > 0);
					if (!slots.length) continue;
					const go = await player
						.chooseBool(`雷轰：是否废除${get.translation(target)}的一个装备栏？`)
						.set("ai", () => get.attitude(player, target) < 0)
						.forResult();
					if (!go?.bool) continue;
					const ctrl = await player
						.chooseControl(slots.map((i) => slotNames[i]))
						.set("prompt", `雷轰：废除${get.translation(target)}的哪个装备栏`)
						.set("ai", () => {
							// 敌人废价值最高的栏；队友废价值最低/空栏
							const att = get.attitude(player, target);
							let best = 0, bestVal = att > 0 ? Infinity : -1;
							slots.forEach((slotIdx, i) => {
								const equip = target.getCards("e").find((card) => get.subtype(card) == "equip" + slotIdx);
								const val = equip ? get.value(equip, target) : 0;
								if (att > 0 ? val < bestVal : val > bestVal) {
									bestVal = val;
									best = i;
								}
							});
							return best;
						})
						.forResult();
					if (ctrl?.index != null) await target.disableEquip(slots[ctrl.index]);
				}
			},
		},
	},
},
xingyu_xuquan: {
	audio: 2,
	forced: true,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		// X为你已损失的体力值
		return player.maxHp - player.hp > 0 && game.hasPlayer((cur) => cur != player && cur.countCards("h") > 0);
	},
	async content(event, trigger, player) {
		await lib.skill.xingyu_xuquan.run(event, trigger, player);
	},
	async run(event, trigger, player) {
		const others = game.filterPlayer((cur) => cur != player && cur.countCards("h") > 0);
		// X 不得超过有手牌的其他角色人数：forced 窗口凑不满下界时既不能确认也不能取消
		const x = Math.min(player.maxHp - player.hp, others.length);
		const result = await player
			.chooseTarget(`虚权：指定至少${get.cnNumber(x)}名其他角色`, true, [x, others.length], (card, me, t) => t != me && t.countCards("h") > 0)
			.set("ai", (target) => {
				// chooseTarget 的 ai 参数是目标角色本身（非 button）
				return get.attitude(player, target);
			})
			.forResult();
		if (!result?.targets?.length) return;
		player.storage.xingyu_xuquan_t = result.targets;
		for (const target of result.targets.sortBySeat()) {
			if (!target.isIn() || !target.countCards("h")) continue;
			const cards = await target
				.chooseCard("h", true, "虚权：将一张手牌置于牌堆顶")
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (!cards?.cards?.length) continue;
			target.$throw(1, 1000);
			game.log(target, "将", "#y一张手牌", "置于了牌堆顶");
			await target.lose(cards.cards, ui.cardPile, "insert");
			game.updateRoundNumber();
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
		// 并列全收、比较范围不含自己（原生定安同款：isMaxHandcard / isMaxHp）
		const list = others.filter(
			(cur) => cur.isMaxHandcard(false, (c) => c != player) || cur.isMaxHp(false, false, (c) => c != player)
		);
		// 内争只在本技能真挂上身时参与（非主公时引擎的 player.init 不会挂上 zhuSkill）
		if (player.hasSkill("xingyu_neizheng")) {
			for (const cur of others) {
				if (cur.group == "qun" || cur.group2 == "qun") {
					list.add(cur);
				}
			}
		}
		return list;
	},
},
xingyu_qizheng: {
	audio: 2,
	forced: true,
	trigger: { player: "phaseDiscardAfter" },
	filter(event, player) {
		// 本阶段弃置过牌。⚠️ getHistory("discard") 是死键（actionHistory 初始键不含、
		// 全引擎无显式 push）——用 lose 认领（type="discard"），且 event 即 phaseDiscard
		// 本体，getParent("phaseDiscard") 会沿父链找到 undefined（原实现恒 false 的第二个死点）
		return player.getHistory("lose").some(
			(evt) => evt.type == "discard" && evt.getParent("phaseDiscard") == event && (evt.hs?.length || evt.es?.length)
		);
	},
	async content(event, trigger, player) {
		await lib.skill.xingyu_qizheng.run(event, trigger, player);
	},
	async run(event, trigger, player) {
		// 内争改写后的候选集：手牌最多或体力最多的其他角色（并列全收）
		const candidates = lib.skill.xingyu_neizheng.maxCandidates(player);
		if (!candidates.length) return;
		// 你此阶段弃置的一张牌（落入弃牌堆的；trigger 即 phaseDiscard 本体）
		const discarded = player
			.getHistory("lose")
			.filter((evt) => evt.type == "discard" && evt.getParent("phaseDiscard") == trigger)
			.flatMap((evt) => [...(evt.hs || []), ...(evt.es || [])])
			.filter((card) => get.position(card, true) == "d");
		if (!discarded.length) return;
		// 锁定技：forced 窗口没有取消按钮
		let toRes = { targets: candidates };
		if (candidates.length > 1) {
			toRes = await player
				.chooseTarget("戚政：选择一名手牌最多或体力最多的其他角色", true, (card, me, t) => get.event().targetsx.includes(t))
				.set("targetsx", candidates)
				.set("ai", (target) => get.attitude(player, target))
				.forResult();
		}
		const target = toRes?.targets?.[0];
		if (!target) return;
		let cardRes = { links: [discarded[0]] };
		if (discarded.length > 1) {
			cardRes = await player
				.chooseButton(["戚政：选择一张你此阶段弃置的牌", discarded], true)
				.set("targetx", target)
				.set("ai", (button) => {
					const { player: me, targetx } = get.event();
					const val = get.value(button.link);
					return get.attitude(me, targetx) >= 0 ? val : 6 - val;
				})
				.forResult();
		}
		const card = cardRes?.links?.[0];
		if (!card) return;
		player.line(target, "thunder");
		game.log(player, "令", target, "获得其弃牌阶段弃置的一张牌");
		await target.gain([card], "gain2", "log");
		// 若此牌花色为 ♥/♦/♣ → 本轮所有角色不能使用【桃】/【闪】/【无懈可击】
		const ban = { heart: "tao", diamond: "shan", club: "wuxie" }[get.suit(card)];
		if (ban) {
			for (const cur of game.players) {
				cur.addTempSkill("xingyu_qizheng_ban", "roundStart");
				cur.markAuto("xingyu_qizheng_ban", [ban]);
			}
			game.log("本轮所有角色不能使用", "#g【" + get.translation(ban) + "】");
		}
	},
},
xingyu_qizheng_ban: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "政",
	intro: {
		name: "戚政",
		content(storage) {
			if (!storage?.length) return "无效果";
			return `本轮不能使用${storage.map((name) => `【${get.translation(name)}】`).join("")}`;
		},
	},
	mod: {
		cardEnabled(card, player) {
			if (player.getStorage("xingyu_qizheng_ban").includes(get.name(card))) return false;
		},
	},
},
xingyu_yishi: {
	audio: 2,
	forced: true,
	trigger: { global: "gameStart" },
	filter(event, player) {
		// gameStart 每局只在选将完成后派发一次；联机/boss 等模式会重复广播，留门禁防重发「弈」
		return !player.storage.xingyu_yi_map;
	},
	async content(event, trigger, player) {
		await lib.skill.xingyu_yishi.run(event, trigger, player);
	},
	async run(event, trigger, player) {
		const pool = Object.keys(lib.character).filter((key) => {
			const info = lib.character[key];
			return info && !info.isBoss && !info.isUnseen && info.skills && info.skills.length;
		});
		player.storage.xingyu_yi_map = {};
		// 引擎读不到本人的候选将（mode/identity.js 的 list 是选将流程内的局部变量，AI 玩家更是直接 init），
		// 所以按描述发 X 张随机武将牌，X=游戏人数-1
		const yiNum = Math.max(1, game.players.length - 1);
		game.players.forEach((cur) => {
			const list = [];
			for (let idx = 0; idx < yiNum; idx++) list.push(pool.randomGet());
			cur.storage.xingyu_yi = list;
			player.storage.xingyu_yi_map[cur.playerid] = list.slice();
			cur.addSkill("xingyu_yishi_mark_skill");
			cur.markSkill("xingyu_yishi_mark_skill");
			cur.addSkill("xingyu_yishi_ui");
			xingyuBindYiMark(cur);
		});
		game.log(player, "为所有玩家放置了备选武将牌「弈」");
	},
},
// 「弈」浮窗的自愈重挂（标记节点被引擎重建后 _customintro 会丢，靠每回合开始补一次）
xingyu_yishi_ui: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: ["phaseBegin", "roundStart"] },
	filter() {
		return true;
	},
	async content(event, trigger, player) {
		await lib.skill.xingyu_yishi_ui.run(event, trigger, player);
	},
	run() {
		game?.players?.forEach((cur) => lib.xingyuBindYiMark(cur));
	},
},
xingyu_yishi_mark_skill: {
	charlotte: true,
	mark: true,
	marktext: "弈",
	intro: {
		name: "弈",
		// 浮窗内容全部由 xingyuBindYiMark 的 _customintro 负责（只显示武将图片）；
		// 这里不再返回文本，避免自定义浮窗失效时又冒出将名列表
		markcount(storage, player) {
			// updateMark 每次刷新标记都会调用这里，顺手把「弈」浮窗（含全部弈武将牌）挂上
			xingyuBindYiMark(player);
			return (player.storage.xingyu_yi || []).length;
		},
	},
},
xingyu_nongju: {
	audio: 2,
	// 用 global 收下同名的**所有**事件，能不能发动交给 filter 按「弈」上那把技能自己的作用域判定
	//（该技能把时机写在 trigger.player 下→只有属于弄局拥有者的事件才弹；写在 trigger.global 下→任何角色的事件都弹）
	// 每回合限一次：addTempSkill 缺省 expire（global phaseAfter/phaseBeforeStart）= 任何人的回合内一次
	trigger: {
		global: XINGYU_NONGJU_TRIGGER_NAMES,
	},
	direct: true,
	filter(event, player, name) {
		if (!name || player.hasSkill("xingyu_nongju_used")) return false;
		// 场上某枚「弈」含有该时机的非标签技能，且该事件归属于它自己声明的主语
		return game.hasPlayer((cur) => (cur.storage.xingyu_yi || []).some((char) => lib.xingyuNongjuHasTrigger(char, name, event, player)));
	},
	async content(event, trigger, player) {
		player.logSkill("xingyu_nongju");
		player.addTempSkill("xingyu_nongju_used");
		const triggerName = event.triggername;
		const targetCandidates = game.filterPlayer((cur) => (cur.storage.xingyu_yi || []).some((char) => lib.xingyuNongjuHasTrigger(char, triggerName, trigger, player)));
		if (!targetCandidates.length) return;
		const targetRes = await player
			.chooseTarget("弄局：移除一名角色的一张含有对应时机的非标签技能的「弈」", (card, me, t) => targetCandidates.includes(t))
			.set("ai", (target) => (target && get.attitude(player, target) < 0 ? 1 : 0))
			.forResult();
		if (!targetRes?.bool || !targetRes.targets?.length) return;
		const target = targetRes.targets[0];
		const matching = (target.storage.xingyu_yi || []).filter((char) => lib.xingyuNongjuHasTrigger(char, triggerName, trigger, player));
		if (!matching.length) return;
		let char = matching[0];
		if (matching.length > 1) {
			const pick = await player
				.chooseButton(["弄局：选择要移除的「弈」", [matching, "character"]], true)
				.set("ai", () => 1)
				.forResult();
			if (!pick?.links?.length) return;
			char = pick.links[0];
		}
		target.storage.xingyu_yi = (target.storage.xingyu_yi || []).filter((c) => c !== char);
		delete player.storage.xingyu_yi_map[target.playerid];
		// 每人的「弈」标记减计数 / 刷新简介
		target.updateMarks("xingyu_yishi_mark_skill");
		lib.xingyuBindYiMark(target);
		// 三个选项的界面直接展开：
		// · 每个「发动此弈上的技能」候选各占一条，附技能全文（等价于选项一，但不用二段选择）
		// · 另两条为改目标 / 替换武将
		// 写法同原生 jinghe/twbudao：controls 是底栏按钮（技能 id 自动显示技名），choiceList 是对话框全文
		const matchingSkills = lib.xingyuNongjuSkillsMatching(char, triggerName, trigger, player);
		if (!matchingSkills.length) return;
		const optionTarget = "弄局·改目标";
		const optionReplace = "弄局·替换武将";
		const ctrl = await player
			.chooseControl({
				controls: [...matchingSkills, optionTarget, optionReplace],
				choiceList: [
					...matchingSkills.map(xingyuNongjuSkillHtml),
					'<div style="font-size:0.85em;line-height:1.4">其使用下一张【杀】或普通锦囊牌时，由你指定目标</div>',
					'<div style="font-size:0.85em;line-height:1.4">其进入濒死状态时，以此「弈」替换其武将牌</div>',
				],
				displayIndex: false,
				prompt: `弄局：移除${get.translation(target)}的「弈」（${get.translation(char)}），执行其中一项`,
				ai: () => 0,
			})
			.forResult();
		const choice = ctrl?.control;
		if (matchingSkills.includes(choice)) {
			// 「发动」＝就在当前这个时机结算这一个技能，而不是把技能挂着等它的时机自然到来
			//（挂着等会退化成"技能拥有者自己到那个阶段才触发"，时机早就错过了）
			player.addTempSkill(choice);
			player.popup(choice);
			// game.createTrigger(时机名, 技能, 拥有者, 触发事件)：第 4 参必须是「本时机真正的事件」
			// （content 里的 trigger），不能传弄局自己的技能事件——否则技能的 content 读 trigger.* 全都取空，
			// 表现为"选了技能却没有效果"（原生/其它扩展示例：虚界 skills01.js:2242、杀海拾遗 skill.js:22）。
			const trig = game.createTrigger(triggerName, choice, player, trigger);
			if (trig) await trig.forResult();
			player.removeSkill(choice);
		} else if (choice == optionTarget) {
			target.storage.xingyu_nongju_t = player;
			target.addTempSkill("xingyu_nongju_t2");
		} else if (choice == optionReplace) {
			target.storage.xingyu_nongju_t3 = char;
			target.addTempSkill("xingyu_nongju_t3");
		}
	},
},
xingyu_nongju_t2: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "指",
	intro: { name: "指", content: "其使用下一张【杀】或普通锦囊牌时，改为由你指定目标" },
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
			.set("ai", (target) => (target ? -get.attitude(get.event().player, target) : 0))
			.forResult();
		if (result?.targets) {
			trigger.targets = result.targets;
			game.log(me, "改动了", player, "使用牌的目标");
		}
		// 只对下一张【杀】或普通锦囊牌生效：一次性移除
		player.storage.xingyu_nongju_t = null;
		player.removeSkill("xingyu_nongju_t2");
	},
},
xingyu_nongju_t3: {
	charlotte: true,
	onremove: true,
	mark: true,
	marktext: "替",
	intro: {
		name: "替",
		content(storage, player) {
			const char = player.storage.xingyu_nongju_t3;
			return char ? `其进入濒死状态时，将以「弈」角色牌「${get.translation(char)}」替换其武将牌` : "其进入濒死状态时，以「弈」替换其武将牌";
		},
	},
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
xingyu_nongju_used: { charlotte: true },
xingyu_niying: {
	// 匿影：距离修正（X为其拥有的"弈"数）
	charlotte: true,
	mod: {
		globalFrom(from, to, distance) {
			// 你到别人：按对方目前拥有的「弈」数量减少距离
			return distance - (to.storage.xingyu_yi || []).length;
		},
		globalTo(from, to, distance) {
			// 别人到你：按对方目前拥有的「弈」数量增加距离
			return distance + (from.storage.xingyu_yi || []).length;
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
		if (name == "phaseJudgeBefore") return true;
		// 其他角色需要响应"我"发起的杀/闪
		if (!event.respondTo || event.respondTo[0] != player || event.player == player) return false;
		// 响应者需要打出【杀】或【闪】才进来（南蛮/决斗扣杀，万箭/杀扣闪）
		const useCard = event.getParent("useCard");
		if (!useCard || !useCard.card) return false;
		const cardName = useCard.card.name;
		const need = cardName == "nanman" || cardName == "juedou" ? "sha" : cardName == "wanjian" || cardName == "sha" ? "shan" : null;
		if (!need) return false;
		// 响应者判定区/装备区里须存在一张能在「断江拥有者」的对应区放下的牌，否则没牌可移动 → 不出断江按钮
		const responder = event.player;
		return responder.getCards("je").some((card) => {
			const pos = get.position(card);
			if (pos == "e") return player.canEquip(card, false);
			if (pos == "j") return player.canAddJudge(card);
			return false;
		});
	},
	async content(event, trigger, player) {
		if (event.triggername == "phaseJudgeBefore") {
			// 有判定牌才跳（躲避乐/兵/闪电）
			const go = await player.chooseBool("断江：是否跳过判定阶段？").set("ai", () => (player.countCards("j") ? 1 : 0)).forResult();
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
		if (name == "phaseDrawBefore") {
			// 场上（装备区/判定区）至少有一张牌才询问跳过阶段+移牌的流程
			return game.hasPlayer((current) => current.countCards("e") + current.countCards("j") > 0);
		}
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
		// 以「角色 → 目标角色」两选、再选牌的原生流程移动卡牌（对齐 永澄「移动场上的至多三张不同的装备牌」同款 player.moveCard）。
		// 「不同区域」限制：已用过的来源区域（同一个角色的同一类装备区/判定区）不再允许其它卡作为来源，
		// 但另一个角色的同类区域、同一个角色的另一类区域都可以。
		const usedZones = new Map();
		const filterMove = (card) => {
			// 移牌来源筛选卡：传进来的可能是 vcardsMap 里的虚拟牌（装备/判定组聚合），
			// get.owner / get.position 都应以真实底牌为准，否则返回 undefined 导致所有候选被误过滤
			const realCard = card.cards?.[0] ?? card;
			const owner = get.owner(realCard);
			if (!owner) return true; // 兜底放行，避免因无法归属误拒
			const own = usedZones.get(owner);
			return !own?.has(get.position(realCard));
		};
		const movedCards = [];
		for (let i = 0; i < 3; i++) {
			if (!player.isIn()) return;
			// 若剩下的可搬牌与「不同区域」限制已无交集，不是 canMoveCard 过了也判，
			// 而是把 filter 一并传进去判定 —— 没牌可搬就直接结束
			if (!player.canMoveCard(false, false, game.filterPlayer(), game.filterPlayer(), filterMove)) break;
			// 走列合/追舳同款对象形参：直接用 {prompt,filter} 对象式调用，避免位置形参链出错被一下子直接跳过 UI
			const result = await player
				.moveCard({ prompt: `走蛟：移动场上第${get.cnNumber(i + 1)}张不同区域的牌`, filter: filterMove })
				.forResult();
			if (!result?.bool || !result?.card) break;
			const sourceOwner = result.targets[0];
			if (!usedZones.has(sourceOwner)) usedZones.set(sourceOwner, new Set());
			usedZones.get(sourceOwner).add(result.position);
			movedCards.push(result.card);
		}
		// 点数相连或花色相同即摸三张；移动一张时必然符合（「点数相连」按升序逐项相差+1 判定），
		// 场上至多两个区域有牌导致只能移动一张/两张时，只要移动的牌符合条件依然摸三张
		if (movedCards.length) {
			let ok;
			if (movedCards.length == 1) {
				ok = true;
			} else {
				const nums = movedCards
					.map((card) => get.number(card))
					.sort((a, b) => a - b);
				const suits = movedCards.map((card) => get.suit(card));
				const connected = nums.every((n, i2) => i2 == 0 || n == nums[i2 - 1] + 1);
				const sameSuit = suits.every((s) => s === suits[0]);
				ok = connected || sameSuit;
			}
			if (ok) await player.draw(3);
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
		const choose = await player
			.chooseButton(["驱烈：视为使用一张锦囊牌", [[["trick", "", "nanman"], ["trick", "", "wanjian"]], "vcard"]], true)
			.set("ai", (button) => (button.link[2] == "nanman" ? 2 : 1))
			.forResult();
		const name = choose?.links?.[0]?.[2] || "nanman";
		const targets = game.filterPlayer((cur) => cur != player);
		// 每个目标角色响应后立刻询问，而不是整张牌结算完再逐个问
		const useNext = player.useCard(get.autoViewAs({ name }, []), [], targets, "xingyu_qulie");
		player.storage.xingyu_qulie_respond = { useCardEvt: useNext, targets: targets.slice() };
		player.addSkill("xingyu_qulie_respond");
		await useNext;
		player.removeSkill("xingyu_qulie_respond");
		delete player.storage.xingyu_qulie_respond;
	},
},
xingyu_qulie_respond: {
	charlotte: true,
	// 内部子技能：不能再让技能拥有者确认一次「是否发动驱烈」，是否弃牌由响应者决定
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: "respondAfter" },
	filter(event, player) {
		const store = player.storage.xingyu_qulie_respond;
		if (!store) return false;
		if (event.getParent("useCard") != store.useCardEvt) return false;
		if (!store.targets.includes(event.player)) return false;
		return true;
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		if (!target.isIn()) return;
		// 「其可以令你弃置你区域内的一张牌」：是否弃、弃哪张都由响应此牌的角色决定，
		// 技能拥有者只负责执行弃置。
		const go = await target
			.chooseBool(`驱烈：是否令${get.translation(player)}弃置其区域内的一张牌？`)
			.set("ai", () => (get.attitude(target, player) < 0 && player.countCards("hej") > 0 ? 1 : 0))
			.forResult();
		if (!go?.bool) return;
		if (!player.isIn() || player.countCards("hej") <= 0) return;
		// 由响应者挑牌（手牌对他显示为牌背），拥有者执行弃置
		await target.discardPlayerCard(player, "hej", true, 1, `驱烈：弃置${get.translation(player)}区域内的一张牌`);
	},
},
xingyu_kaitian: {
	audio: 2,
	forced: true,
	mark: true,
	marktext: "阳",
	init(player) {
		player.storage.xingyu_kaitian_count = player.storage.xingyu_kaitian_count || 0;
		player.storage.xingyu_kaitian_xing_count = player.storage.xingyu_kaitian_xing_count || 0;
		player.storage.xingyu_kaitian = player.storage.xingyu_kaitian || 0;
	},
	intro: {
		name: "开天",
		content(storage, player) {
			const type = player.storage.xingyu_kaitian_type || "yang";
			const n = type == "yang" ? player.storage.xingyu_kaitian_count || 0 : player.storage.xingyu_kaitian_xing_count || 0;
			return `当前为第${n}个「${type == "yang" ? "阳" : "星"}」轮次`;
		},
	},
	trigger: { global: "roundStart" },
	filter(event, player) {
		return true;
	},
	// 当前轮次类型："yang"/"xing"，逐轮交替（存于开天拥有者；拓海转化技在获得者身上，经此读取）
	roundType(player) {
		const owner = game.findPlayer((cur) => cur.hasSkill("xingyu_kaitian")) || player;
		return owner.storage.xingyu_kaitian_type || "yang";
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
		player.storage.xingyu_kaitian_xing_count = (player.storage.xingyu_kaitian_xing_count || 0) + (type == "xing" ? 1 : 0);
		// 角标文字切阳/星；角标数字=本轮次类型已走到第几个
		// ⚠ marktext 在注册期就被烘焙进 lib.translate["xingyu_kaitian_bg"]（game/index.js:8320），
		//   且 updateMarks 只重算数字角标、不重渲染主文字 → 必须手动改 mark 主文字并广播同步（原生 dcwangyao 同款）
		const marktext = type == "yang" ? "阳" : "星";
		player.storage.xingyu_kaitian = type == "yang" ? player.storage.xingyu_kaitian_count : player.storage.xingyu_kaitian_xing_count;
		player.updateMarks("xingyu_kaitian");
		game.broadcastAll(
			(player2, text) => {
				lib.translate["xingyu_kaitian_bg"] = text;
				if (player2.marks.xingyu_kaitian) player2.marks.xingyu_kaitian.firstChild.innerHTML = text;
			},
			player,
			marktext
		);
		game.log(`本局轮次切换为「${type == "yang" ? "阳" : "星"}」轮次`);
		if (type != "yang") return;
		// 第X个"阳"轮次开始时（X为场上存活角色数）
		if (player.storage.xingyu_kaitian_count != game.countPlayer()) return;
		player.logSkill("xingyu_kaitian");
		// 令一名角色获得所有角色各1点体力上限：其余角色各-1上限，该角色+（减少总数）
		const result = await player
			.chooseTarget("开天：令一名角色获得其余角色各失去的1点体力上限", true)
			.set("ai", (target) => (target ? get.attitude(get.event().player, target) : 0))
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
		// 除其外所有角色可以受到1点伤害并令其回复1点体力；
		// 只有选择执行（受到伤害）的角色本轮获得「拓海」转化权
		for (const cur of game.filterPlayer((cur) => cur != chosen && cur.isIn())) {
			const go = await cur
				.chooseBool(`拓海：是否受到1点伤害，令${get.translation(chosen)}回复1点体力？`)
				.set("ai", () => (get.attitude(cur, chosen) > 0 && cur.hp > 1 ? 1 : 0))
				.forResult();
			if (!go?.bool) continue;
			await cur.damage(1);
			if (chosen.isIn()) await chosen.recover(1);
			// 本轮有效：挂临时技、轮末（roundEnd）自动移除；计数归零后重新给两次转化权
			cur.addTempSkill("xingyu_tuohai_eff", "roundEnd");
			cur.storage.xingyu_tuohai_count = 0;
			cur.storage.xingyu_tuohai_eff = 2;
			cur.updateMarks("xingyu_tuohai_eff");
		}
	},
	ai: {
		// 自己/队友受伤时才值得让别人掉血换回复；选人优先自己，其次受伤队友
		order(item, player) {
			if (player.isDamaged()) return 5;
			return game.hasPlayer((cur) => cur != player && cur.isDamaged() && get.attitude(player, cur) > 0) ? 4.5 : 0;
		},
		result: {
			target(player, target) {
				const base = target == player ? 2 : get.attitude(player, target);
				if (base <= 0) return base;
				return base + (target.isDamaged() ? 1 : 0);
			},
		},
	},
},
xingyu_tuohai_eff: {
	charlotte: true,
	group: ["xingyu_tuohai_y", "xingyu_tuohai_x", "xingyu_tuohai_count"],
	mark: true,
	marktext: "拓",
	intro: {
		name: "拓海",
		content(storage, player) {
			const yang = lib.skill.xingyu_kaitian.roundType(player) == "yang";
			const left = Math.max(0, 2 - (player.storage.xingyu_tuohai_count || 0));
			return (yang ? "阳轮：可以将一张伤害牌当【决斗】使用" : "星轮：可以将两张红色牌当【桃】使用") + `（本轮限两次，剩余${left}次）`;
		},
	},
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
	ai: {
		order: 5,
		result: {
			target(player, target) {
				return get.damageEffect(target, player, player);
			},
		},
	},
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
	ai: {
		save: true,
		order: 6,
		skillTagFilter(player, tag, arg) {
			if (tag != "save") return false;
			return lib.skill.xingyu_kaitian.roundType(player) == "xing" &&
				(player.storage.xingyu_tuohai_count || 0) < 2 &&
				player.countCards("h", (card) => get.color(card) == "red") >= 2;
		},
		result: {
			player(player) {
				if (_status.event.dying) return get.attitude(player, _status.event.dying);
				return 1;
			},
		},
	},
},
xingyu_tuohai_count: {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: ["useCardAfter", "roundStart"] },
	filter(event, player, name) {
		// roundStart 的宿主事件是 phase（content.js:4145），event.name 判定不了，用 name 判
		if (name == "roundStart") {
			return true;
		}
		return ["xingyu_tuohai_y", "xingyu_tuohai_x"].includes(event.skill);
	},
	async content(event, trigger, player) {
		if (event.triggername == "roundStart") {
			player.storage.xingyu_tuohai_count = 0;
			player.storage.xingyu_tuohai_eff = 2;
			player.updateMarks("xingyu_tuohai_eff");
		} else {
			player.storage.xingyu_tuohai_count = (player.storage.xingyu_tuohai_count || 0) + 1;
			player.storage.xingyu_tuohai_eff = Math.max(0, 2 - player.storage.xingyu_tuohai_count);
			player.updateMarks("xingyu_tuohai_eff");
		}
	},
},
xingyu_dongdi: {
	audio: 2,
	trigger: { player: "damageAfter", global: "roundEnd" },
	direct: true,
	filter(event, player, name) {
		if (name == "damageAfter") return event.name == "damage" && event.num == 1;
		return name == "roundEnd";
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool(
				trigger.name == "damage" || event.triggername == "damageAfter"
					? "动地：是否将牌堆顶的一张牌当作锦囊牌使用？"
					: "动地（本轮结束）：是否将牌堆顶的一张牌当作锦囊牌使用？"
			)
			.set("ai", () => 1)
			.forResult();
		if (!go?.bool) return;
		player.logSkill("xingyu_dongdi");
		const isYang = lib.skill.xingyu_kaitian.roundType(player) == "yang";
		// 阳：任意伤害类锦囊；星：非伤害且非体力回复类锦囊
		// 正常印牌口径：候选 = 当前牌堆里的锦囊（含延时，inpileVCardList），且当前用得出（hasUseTarget）
		const list = get.inpileVCardList((info) => {
			if (info[0] != "trick" && info[0] != "delay") return false;
			if (isYang) {
				if (!get.tag({ name: info[2] }, "damage")) return false;
			} else if (get.tag({ name: info[2] }, "damage") || get.tag({ name: info[2] }, "recover")) {
				return false;
			}
			return player.hasUseTarget(get.autoViewAs({ name: info[2], nature: info[3] }, []), true, true);
		});
		if (!list.length) return;
		const choose = await player
			.chooseButton([`动地（${isYang ? "阳" : "星"}）：将牌堆顶的牌视为使用`, [list, "vcard"]], true)
			.set("ai", (button) => player.getUseValue({ name: button.link[2], nature: button.link[3], isCard: true }))
			.forResult();
		if (!choose?.links?.length) return;
		const top = ui.cardPile.firstChild;
		if (!top) return;
		// 正常使用流程（选目标等按牌本身规则走；牌堆顶那当作底牌跟随结算，不再是无目标的 useCard）
		const vcard = get.autoViewAs({ name: choose.links[0][2], nature: choose.links[0][3] }, [top]);
		await player.chooseUseTarget(vcard, true, [top]).set("logSkill", "xingyu_dongdi");
	},
},
xingyu_xiongzhi: {
	audio: 2,
	forced: true,
	trigger: { global: "phaseBeforeStart" },
	filter(event, player) {
		// 游戏开始时一次性建立（phaseBeforeStart 每回合都会派发，无门禁会每回合重复 hp=0 并刷日志）
		return !player.storage.xingyu_xiongzhi_used;
	},
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
		player.storage.xingyu_xiongzhi_used = true;
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

// ===== StepCompiler 可见性：编译后的回调（content/cost/precontent/onuse）里只能用引擎注入的名字，
// 模块作用域的函数/import 全部丢失，所以这里统一挂到 lib 上，回调里写 lib.xxx。
lib.xingyuNiansiIsVisiblePileGain = xingyuNiansiIsVisiblePileGain;
lib.qunyou_getVisiblePileTop = qunyou_getVisiblePileTop;
lib.xingyuNongjuHasTrigger = xingyuNongjuHasTrigger;
lib.xingyuBindYiMark = xingyuBindYiMark;
lib.xingyuNongjuSkillsMatching = xingyuNongjuSkillsMatching;
