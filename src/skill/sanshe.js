import { lib, game, get, ui, _status } from "noname";
import {
	qunyou_adjustHandTo, qunyou_adjustHpTo, qunyou_aoyue_execute,
	qunyou_cangxiao_notBySkill, qunyou_cardNameLength,
	qunyou_chouci_discardByName, qunyou_chouci_isNormalTrick,
	qunyou_chouci_namesToRecord, qunyou_chouci_records,
	qunyou_combo_break, qunyou_combo_getDiscardCards, qunyou_combo_isDiscard,
	qunyou_combo_isDraw, qunyou_cuisheng_viewAs, qunyou_cycleState,
	qunyou_danpo_isPhaseUsing, qunyou_danpo_list, qunyou_danpo_matches,
	qunyou_dingyi_targets, qunyou_dusheng_getUnusedSuits,
	qunyou_dusheng_tryBinglin, qunyou_fenzi_maxHandPlayers,
	qunyou_fuzhen_zoneCount, qunyou_gainCount, qunyou_getDiscardSuits,
	qunyou_getPreviousUseNumber, qunyou_getState,
	qunyou_discardCountThisRound,
	qunyou_gouxian_useDamageCards, qunyou_gudan_cleanup,
	qunyou_gudan_discardCards, qunyou_gudan_gainCard, qunyou_gudan_track,
	qunyou_gushe_assignCards, qunyou_gushe_cards,
	qunyou_gushe_getDiscardFromEvent, qunyou_gushe_getLastDiscardCard,
	qunyou_gushe_getTopCard, qunyou_gushe_rank, qunyou_gushe_showCards,
	qunyou_gushe_targets, qunyou_gushe_useRemaining, qunyou_hanguo_visibleTag,
	qunyou_gumingMove, qunyou_skillMove,
	qunyou_haoxianCanGain, qunyou_haoxianGainSequential,
	qunyou_huameng_clear, qunyou_huameng_skillList,
	qunyou_isPositiveMultiple, qunyou_jianjiang_getShownCards,
	qunyou_jianjiang_hasTaggedCard, qunyou_jianjiang_isMinHand,
	qunyou_jianjiang_syncHolder, qunyou_jicheng_addLimitLoss,
	qunyou_jicheng_adjustHand, qunyou_jicheng_finishTurn,
	qunyou_jicheng_options, qunyou_jicheng_redCompareCount,
	qunyou_jicheng_targets, qunyou_jinfa_getCompareEvent,
	qunyou_jinfa_getEventStorage, qunyou_jinfa_sameSuitAndType,
	qunyou_jinfa_sum, qunyou_jingce_clear, qunyou_jingce_modeText,
	qunyou_jingce_recordUse, qunyou_jingce_storage,
	qunyou_jingce_targetCount, qunyou_jingce_usedSuitsText,
	qunyou_jingce_usedTypesText, qunyou_junming_hasUsed,
	qunyou_junming_markUsed, qunyou_longjue_isFull,
	qunyou_longjue_remaining, qunyou_longjue_vcards,
	qunyou_muxin_run, qunyou_qionfu_basicVcards, qunyou_rongguo_compareCards,
	qunyou_rongguo_targets, qunyou_shenshi_areaTargets,
	qunyou_shenshi_canAddTarget, qunyou_shenshi_canRemoveTarget,
	qunyou_shenshi_getTurnDiscardCards, qunyou_taowei_compare,
	qunyou_taowei_matchStage, qunyou_taowei_reuseCard,
	qunyou_taowei_useCards, qunyou_tongxian_canUse, qunyou_tongxian_type,
	qunyou_validNumber, qunyou_weitai_isSingleTarget,
	qunyou_weitai_storage, qunyou_weitai_viewAs,
	qunyou_xiongbo_compareCards, qunyou_xiongbo_debaters,
	qunyou_xiongbo_majorityTargets, qunyou_xiongbo_selfCards,
	qunyou_yunxian_sameColorActivate, qunyou_zhaduo_compareCards,
	qunyou_zhaduo_nonWinners, qunyou_zhaduo_targets,
	qunyou_zhashu_cards, qunyou_zhashu_clear, qunyou_zhashu_storage,
	qunyou_zhichao_lostEquips, qunyou_zhihu_handCounts,
	qunyou_zhihu_handCountsText, qunyou_zhihu_modeText,
	qunyou_zhihu_noDamage, qunyou_zhihu_storage, qunyou_zhihu_sync,
	qunyou_zhijue_availableNames, qunyou_zhijue_bothUsedSuits,
	qunyou_zhijue_busuan, qunyou_zhijue_canBusuan,
	qunyou_zhijue_canTransform, qunyou_zhijue_getUsed,
	qunyou_zhijue_hasTransformCard, qunyou_zhijue_markTransform,
	qunyou_zhijue_remainingSharedSuits, qunyou_zhijue_storage,
	qunyou_zhijue_suitText, qunyou_zhitian_execute,
	qunyou_zhitian_getExecutor, qunyou_zhitian_isDamageUnique,
	qunyou_zhouli_activate, qunyou_zhouli_bottomCards,
	qunyou_zhouli_topCards, qunyou_zhuoqu_addNumber,
	qunyou_zhuoqu_isBlocked, qunyou_zhuoqu_isCurrentUse,
	qunyou_zhuoqu_isOutsideDiscardPhase
} from "./helpers.js";

// 君侧：两侧牌名的初始分布（六个牌名始终各属一侧，转化与移侧围绕此状态进行）
const XUANDIE_JUNCE_INIT = [
	["sha", "jiu", "tiesuo"],
	["shan", "tao", "guohe"],
];
const xuandie_junce_getSides = (player) => player.storage.xuandie_junce_sides || XUANDIE_JUNCE_INIT;
const xuandie_junce_sideIndexOf = (player, name) => xuandie_junce_getSides(player).findIndex((side) => side.includes(name));

// 相赴：四种差值结果对应的印牌（类别 0相思·杀 1相逢·酒 2相失·闪 3相守·桃）
const XUANDIE_XIANGFU_NAMES = ["sha", "jiu", "shan", "tao"];
// 差值（使用者手牌数−搭档手牌数）调整后的变化：少者摸一张、多者弃一张，故差值向0靠近2；相等则不变
const xuandie_xiangfu_diffAfter = (dOld) => (dOld > 0 ? dOld - 2 : dOld < 0 ? dOld + 2 : 0);
const xuandie_xiangfu_category = (dOld, dNew) => {
	if (dNew === dOld) return 3; // 相守·未变化
	if (dNew === 0) return 1; // 相逢·变为0
	if (dOld * dNew < 0) return 2; // 相失·变为相反数
	return 0; // 相思·正负性不变
};

// 击楫：刷新「击」标记（行三可发动时击字变红）并保证「击」位于「楫」上方
const xuandie_jiji_refreshMark = (player) => {
	const counts = player.storage.xuandie_jiji_counts || [0, 0, 0];
	const active = counts[2] <= counts[0] && counts[2] <= counts[1];
	const markJi = player.marks["xuandie_jiji"];
	if (markJi) {
		const el = markJi.querySelector(".skillmark") || markJi.querySelector(".background");
		if (el) el.style.color = active ? "#ff4444" : "";
	}
	const markCard = player.marks["xuandie_jiji_markCard"];
	if (markJi && markCard && markJi.nextElementSibling !== markCard) {
		player.node.marks.insertBefore(markJi, markCard);
	}
};

// 分辙/窮擊 —— 发动时机可移动的双技能公共工具
export const qunyouPhaseNames = ["准备", "摸牌", "出牌", "弃牌", "结束"];
const qunyouPhaseEvents = ["phaseZhunbei", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];
// 阶段触发事件（phaseXBegin/Before）回调里的 event 就是 phaseX 事件本体，用 event.name 定位阶段
const qunyouPhaseIndex = (event) => qunyouPhaseEvents.indexOf(event.name);

// 散设 — 其余 qunyou_* 技能
export const skills = {
// === 审时 ===
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
						await fewer.addShownCards(drawn, "visible_qunyou_shenshi");
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

// === 荐降 ===
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

// === 浑随 ===
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

// === 才若 ===
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

// === 扶风 ===
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

// === 游龙 ===
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
				// 签名 (card, player, target)：第一参是牌，第二参才是用牌者（引擎 effect_use 调用约定）
				player_use: (card, player, target) => {
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

// === 覆阵 ===
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
					// 仅当调整能带来收益(摸牌:z<hp;回血/配合移陵弃牌:z>hp)才发动,其余不发动
					const z = qunyou_fuzhen_zoneCount(player);
					const hp = player.hp;
					if (z === hp) {
						return 0;
					}
					return 1;
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

// === 摧升 ===
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
				// 签名 (card, player, target)：第一参是牌，第二参才是用牌者（引擎 effect_use 调用约定）
				player_use(card, player, target) {
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

// === 荣国 ===
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
					.set("ai", () => {
						const p = get.player();
						if (p.countCards("h") < 3) return false;
						if (!qunyou_rongguo_targets(p).length) return false;
						const nums = p.getCards("h").map((c) => get.number(c, p)).sort((a, b) => b - a);
						if (nums[0] >= 11) return true;
						return nums[0] >= 9 && nums[1] >= 8;
					})
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

// === 龙绝 ===
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

// === 毅勇 ===
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

// === 定仪 ===
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

// === 知天 ===
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

// === 智绝 ===
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

// === 制朝 ===
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

// === 暮心 ===
	qunyou_muxin: {
		audio: 2,
		enable: "phaseUse",
		filter(event, player) {
			return player.getHp() > 0 && !player.hasSkill("qunyou_muxin_disabled") && game.hasPlayer((target) => target !== player && target.countCards("h") > 0);
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
			const targets = (event.targets || []).filter((target) => target.isIn() && target.countCards("h") > 0);
			if (!targets.length) return;
			await qunyou_muxin_run(player, targets);
		},
		ai: {
			order: 7,
			result: {
				player: 1,
			},
		},
		group: ["qunyou_muxin_clear"],
		subSkill: {
			clear: {
				charlotte: true,
				trigger: { global: "phaseAfter" },
				forced: true,
				popup: false,
				silent: true,
				content(event, trigger, player) {
					delete player.storage.qunyou_muxin_turn_count;
					delete player.storage.qunyou_muxin_turn_cards;
				},
			},
			disabled: {
				charlotte: true,
			},
		},
	},

// === 苍霄 ===
	qunyou_cangxiao: {
		audio: 2,
		group: ["qunyou_cangxiao_gain", "qunyou_cangxiao_damaged", "qunyou_cangxiao_damage"],
		subSkill: {
			gain: {
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
						.chooseToDiscard(get.prompt("qunyou_cangxiao"), "弃置任意张牌，然后令一名角色依次弃置", "he", [1, Infinity])
						.set("ai", (card) => 6 - get.value(card, player))
						.forResult();
					if (!discard?.bool || !discard.cards?.length) return;
					const num = discard.cards.length;
					const targetResult = await player
						.chooseTarget("苍霄：令一名角色弃置任意张牌", true)
						.set("ai", (target) => {
							const p = get.player();
							const att = get.attitude(p, target);
							if (att > 0) return 2;
							return 1 - target.countCards("he") * 0.05;
						})
						.forResult();
					if (!targetResult?.bool || !targetResult.targets?.length) return;
					const target = targetResult.targets[0];
					player.logSkill("qunyou_cangxiao", target);
					const tDiscard = await target
						.chooseToDiscard(`苍霄：弃置任意张牌（${get.translation(player)}弃置了${get.cnNumber(num)}张）`, [0, Infinity], "he", true)
						.set("ai", (card) => {
							const att = get.attitude(target, player);
							if (att > 0) return -1;
							return 6 - get.value(card, target);
						})
						.forResult();
					const tNum = tDiscard?.cards?.length || 0;
					if (num > tNum) {
						await player.gainMaxHp();
						player.popup("体力上限+1");
					}
				},
			},
			damaged: {
				trigger: { player: "damageEnd" },
				direct: true,
				filter(event, player) {
					return qunyou_cangxiao_notBySkill(event) && !player.hasSkill("qunyou_muxin_disabled") && game.hasPlayer((target) => target !== player && target.countCards("h") > 0);
				},
				async content(event, trigger, player) {
					const bool = await player
						.chooseBool(get.prompt2("qunyou_muxin"), "发动【暮心】")
						.set("ai", () => true)
						.forResult();
					if (!bool?.bool) return;
					player.logSkill("qunyou_muxin");
					const X = Math.max(1, player.getHp());
					const targets = await player
						.chooseTarget(get.prompt2("qunyou_muxin"), `选择至多${get.cnNumber(X)}名其他角色`, [1, X], (card, p, t) => t !== p && t.countCards("h") > 0)
						.set("ai", (target) => get.attitude(player, target) < 0 ? 1 : 0)
						.forResult();
					if (!targets?.bool || !targets.targets?.length) return;
					await qunyou_muxin_run(player, targets.targets);
				},
			},
			damage: {
				trigger: { source: "damageSource" },
				forced: true,
				popup: false,
				filter(event, player) {
					return qunyou_cangxiao_notBySkill(event) && event.player && event.player.isIn() && event.player !== player;
				},
				async content(event, trigger, player) {
					const num = player.getDamagedHp();
					if (num > 0) await player.draw(num);
				},
			},
		},
	},

// === 焚辎 ===
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
			order: 9,
			result: {
				player(player) {
					if (player.hasSkill("qunyou_fenzi_disabled")) {
						return 0;
					}
					const x = player.storage.qunyou_fenzi_count || 0;
					const targets = qunyou_fenzi_maxHandPlayers().filter(t => t !== player);
					if (!targets.length) {
						return 0;
					}
					let best = 0;
					for (const target of targets) {
						best = Math.max(best, get.damageEffect(target, player, player, "fire"));
					}
					return best + x * 1.5;
				},
			},
		},
	},

// === 独胜 ===
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
					const p = get.player();
					let best = suits[0] || "cancel2";
					let bestScore = -1;
					for (const s of suits) {
						const myCards = p.getCards("hes", (c) => get.suit(c, p) === s);
						if (!myCards.length) continue;
						const score = myCards.length * 10 - myCards.reduce((sum, c) => sum + get.value(c, p), 0);
						if (score > bestScore) {
							bestScore = score;
							best = s;
						}
					}
					return best;
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

// === 移陵 ===
	qunyou_yiling: {
		audio: 2,
		comboSkill: true,
		locked: false,
		_priority: 20,
		breakCombo(player) {
			qunyou_combo_break(player, "qunyou_yiling");
		},
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
					lib.skill.qunyou_yiling.breakCombo(player);
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

// === 夷业 ===
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

// === 秉德 ===
	qunyou_bingde: {
		audio: 2,
		enable: "phaseUse",
		filter(event, player) {
			return player.countDiscardableCards(player, "he") >= 3;
		},
		async content(event, trigger, player) {
			const result = await player.chooseToDiscard("秉德：弃置三张牌", 3, "he", true).set("ai", (card) => -get.value(card, player)).forResult();
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

// === 酒思 ===
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

// === 酾才 ===
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

// === 愁辞 ===
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

// === 琼赋 ===
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

// === 诈夺 ===
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

// === 鼓舌 ===
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

// === 作保 ===
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
			// effect.target 第一参为牌、第三参为技能拥有者:手牌数=体力值时伤害会被防止,
			// 敌人打之无收益 → 效果归零;已发动过(usable 耗尽)或条件不符则 fall-through 走默认
			effect: {
				target(card, player, target) {
					if (!get.tag(card, "damage")) return;
					if (target.getStat("skill").qunyou_zuobao) return;
					if (target.countCards("h") === target.hp) return [0, 0];
				},
			},
		},
	},

// === 险战 ===
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

// === 周旋 ===
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

// === 孤胆 ===
	qunyou_gudan: {
		audio: 2,
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		discardCards(player) {
			return qunyou_gudan_discardCards(player);
		},
		cleanup(player, cards) {
			qunyou_gudan_cleanup(player, cards);
		},
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
					const cards = lib.skill.qunyou_gudan.discardCards(player);
					if (cards.length) {
						lib.skill.qunyou_gudan.cleanup(player, cards);
						game.cardsGotoSpecial(cards);
						game.log(cards, "被销毁了");
					} else {
						lib.skill.qunyou_gudan.cleanup(player);
					}
				},
				sub: true,
			},
		},
	},

// === 胆破 ===
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

// === 岌城 ===
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

// === 凶搏 ===
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

// === 矜伐 ===
	qunyou_jinfa: {
		audio: 2,
		getCompareEvent(trigger) {
			return qunyou_jinfa_getCompareEvent(trigger);
		},
		getEventStorage(compareEvent, player) {
			return qunyou_jinfa_getEventStorage(compareEvent, player);
		},
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
					const compareEvent = lib.skill.qunyou_jinfa.getCompareEvent(trigger);
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
					const compareEvent = lib.skill.qunyou_jinfa.getCompareEvent(trigger);
					const storage = lib.skill.qunyou_jinfa.getEventStorage(compareEvent, player);
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

// === 翱月 ===
	qunyou_aoyue: {
		audio: 2,
		limited: true,
		skillAnimation: true,
		animationColor: "water",
		group: ["qunyou_aoyue_dying"],
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

// === 隽鸣 ===
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

// === 纸虎 ===
	qunyou_zhihu: {
		audio: 2,
		forced: true,
		locked: true,
		mark: true,
		marktext: "虎",
		storage(player) {
			return qunyou_zhihu_storage(player);
		},
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
					lib.skill.qunyou_zhihu.storage(player).count = 0;
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

// === 危台 ===
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
		viewAs(name) {
			return get.autoViewAs({ name, isCard: true });
		},
		storage(player) {
			if (typeof player.storage.qunyou_weitai !== "boolean") {
				player.storage.qunyou_weitai = false;
			}
			return player.storage.qunyou_weitai;
		},
		isSingleTarget(event) {
			return !!event.card && Array.isArray(event.targets) && event.targets.length === 1;
		},
		group: ["qunyou_weitai_gain", "qunyou_weitai_clear", "qunyou_weitai_use", "qunyou_weitai_target"],
		subSkill: {
			gain: {
				charlotte: true,
				trigger: { player: "gainAfter" },
				forced: true,
				popup: false,
				silent: true,
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
				silent: true,
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
				silent: true,
				filter(event, player) {
					return qunyou_weitai_storage(player) && qunyou_weitai_isSingleTarget(event) && get.name(event.card, player) !== "juedou";
				},
			content(event, trigger, player) {
				trigger.card = lib.skill.qunyou_weitai.viewAs("juedou");
				game.log(player, "使用的单目标牌按", "#y决斗", "结算");
			},
			sub: true,
		},
		target: {
			audio: "qunyou_weitai",
			trigger: { target: "useCardToTarget" },
			forced: true,
			silent: true,
			filter(event, player) {
				return qunyou_weitai_storage(player) && qunyou_weitai_isSingleTarget(event) && get.name(event.card, event.player) !== "chenghuodajie";
			},
			content(event, trigger, player) {
				const useEvent = trigger.getParent();
				if (useEvent?.card) {
					useEvent.card = lib.skill.qunyou_weitai.viewAs("chenghuodajie");
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

// === 屡战 ===
	qunyou_luzhan: {
		audio: 2,
		ai: {
			order: 7,
			result: { player: 1 },
		},
		enable: "chooseToUse",
		hiddenCard(player, name) {
			if (name === "juedou") {
				return player.countCards("hs", card => get.type(card, null, false) === "trick" || get.type(card, null, false) === "delay") > 0;
			}
			if (name === "jiu") {
				return player.countCards("hs", card => card.name === "sha") > 0;
			}
			return false;
		},
		filter(event, player) {
			const list = [];
			if (player.countCards("hs", card => get.type(card, null, false) === "trick" || get.type(card, null, false) === "delay")) {
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
				if (player.countCards("hs", card => get.type(card, null, false) === "trick" || get.type(card, null, false) === "delay") > 0) {
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
						return get.type(card, null, false) === "trick" || get.type(card, null, false) === "delay";
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
						if (get.type(card, null, false) === "trick" || get.type(card, null, false) === "delay") {
							return "juedou";
						}
					},
					cardnature(card) {
						if (get.position(card) !== "h") {
							return;
						}
						if (get.type(card, null, false) === "trick" || get.type(card, null, false) === "delay") {
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

// === 兴世 ===
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
				.set("choice", () => {
				const shuDamaged = game.filterPlayer((t) => t.group === "shu" && t.isDamaged());
				if (!shuDamaged.length) return false;
				const ally = shuDamaged.filter((t) => get.attitude(player, t) > 0).length;
				const foe = shuDamaged.filter((t) => get.attitude(player, t) < 0).length;
				return ally > foe;
			})
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

// === 权谋 ===
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

// === 化盟 ===
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
				// 收人头优先:此伤害足以令目标进入濒死时不防,其余情况能回血/可偷技能才发动
				if (trigger.num >= target.hp) return 0;
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

// === 诈书 ===
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

// === 妯娌 ===
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

// === 蕴贤 ===
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

// === 同弦 ===
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

// === 灵玉 ===
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

// === 青盟 ===
	qunyou_qingmeng: {
    audio: 2,
    trigger: { player: "damageBegin" },
    direct: true,
    ai: {
        order: 1,
        result: { player: 1 },
        // 卖血收益标记:受伤即摸牌,降低敌人打你的意愿(数值为设计约定,可调)
        effect: {
            target(card, player, target) {
                if (get.tag(card, "damage")) return [1, 0.5];
            },
        },
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

// === 灼躯 ===
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
				content(event, trigger, player) {
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

// === 孤我 ===
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

// === 躇步 ===
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

// === 精策 ===
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

// === 翩仪 ===
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
					.set("ai", () => {
						// 自己是 target（选择者），player 是发动者
						const att = get.attitude(target, player);
						const shaInSpades = spades.some((c) => get.name(c, target) === "sha");
						let useVal = 0;
						for (const s of spades) useVal += get.effect(target, s, target, target);
						if (att > 0) {
							if (shaInSpades && useVal > nonSpades.length) return 1;
							return 0;
						}
						return useVal > nonSpades.length ? 1 : 0;
					})
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
		result: {
			player: 1,
			target(card, player, target) {
				const p = get.player();
				const mySpades = p.getCards("h").filter((c) => get.suit(c, p) === "spade");
				if (mySpades.length) return target === p ? 10 : -1;
				const spades = target.getCards("h").filter((c) => get.suit(c, target) === "spade");
				let score = 0;
				if (get.attitude(p, target) <= 0) score += 3;
				if (spades.length) score += 2;
				return score;
			},
		},
		// 原此处有一段误从隐山复制来的 ai.check(弃牌摸已损逻辑),与翩仪无关且 ai.check 无消费点,
		// 已删除;翩仪为选目标技,选牌无需 check,目标收益由上方 result.target 驱动
	},
	},

// === 恣胜 ===
	qunyou_zisheng: {
		audio: 2,
		locked: true,
		group: ["qunyou_zisheng_clear"],
		trigger: { player: "useCardAfter" },
		forced: true,
		popup: false,
		filter(event, player) {
			return !!event.card;
		},
		async content(event, trigger, player) {
			player.storage.qunyou_zisheng_used_count = (player.storage.qunyou_zisheng_used_count || 0) + 1;
			const count = player.storage.qunyou_zisheng_used_count;
			const gainCount = game.getGlobalHistory("everything", (evt) => evt.name == "gain").length;
			const discardCount = game.getGlobalHistory("everything", (evt) => evt.name == "discard").length;
			const damageCount = game.getGlobalHistory("everything", (evt) => evt.name == "damage").length;
			if (count % 3 !== 0) {
				return;
			}
			player.storage.qunyou_zisheng_actcount = (player.storage.qunyou_zisheng_actcount || 0) + 1;
			const usedCount = player.storage.qunyou_zisheng_actcount - 1;   // 本回合已发动次数（不含本次）
			const X = [gainCount, discardCount, damageCount].filter((n) => usedCount < n).length;
			console.log("[恣胜] count=" + count, "gain=" + gainCount, "discard=" + discardCount, "damage=" + damageCount, "X=" + X, "actcount=" + player.storage.qunyou_zisheng_actcount);
			player.logSkill("qunyou_zisheng");
			await player.draw(X);
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
					return !!player.storage.qunyou_zisheng_used_count || !!player.storage.qunyou_zisheng_actcount || player.hasSkill("qunyou_zisheng_effect");
				},
				content(event, trigger, player) {
					//delete player.storage.qunyou_zisheng_used_count;
					delete player.storage.qunyou_zisheng_actcount;
					//if (player.hasSkill("qunyou_zisheng_effect")) {
					//	player.removeSkill("qunyou_zisheng_effect");
					//}
				},
				sub: true,
			},
		},
	},

// === 显略 ===
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

// === 豪贤 ===
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
			return count > 0 && !player.awakenedSkills.includes("qunyou_haoxian") && player.countCards("he") >= count && qunyou_haoxianCanGain(player, count) && !(player.storage.qunyou_haoxian_record || []).includes(count);
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
			player.storage.qunyou_haoxian_record ??= [];
			player.storage.qunyou_haoxian_record.push(count);
			player.addTempSkill("qunyou_haoxian_record", "phaseAfter");
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
		subSkill: {
			record: {
				onremove(player) {
					player.storage.qunyou_haoxian_record = [];
				},
			},
		},
	},

// === 翠屏 ===
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

// === 滔威 ===
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

// === 撼国 ===
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
		check: () => 1,
		async content(event, trigger, player) {
			await player
				.chooseUseTarget(trigger.qunyou_taowei_reuseCard, qunyou_taowei_useCards(player, trigger), true, false)
				.set("prompt", `撼国：你可再次使用${get.translation(trigger.card)}`)
				.forResult();
		},
	},

// === 冠勇 ===
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

// === 平征 ===
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
            // 选项一=自己摸1并对目标决斗：评估决斗对目标的净效果 + 态度
            const p = _status.event.player;
            const eff = get.effect(target, { name: "juedou" }, p, p);
            return eff - get.attitude(p, target) * 0.5;
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

// === 轻捷 ===
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

// === 骤劫 ===
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
             .set("ai", (button) => get.value(button.link, target))
             .forResult();
            if (!gainResult.bool || !gainResult.cards?.length) break;
            await player.gain(gainResult.cards, target, "give");
            remaining -= gainResult.cards.length;
        }
    },
},

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
				
				const choice = await player.chooseControl("弃置基本牌数", "对其造成伤害值").set("prompt", "勤战：请选择令〖绮武〗的哪一个数字+1？").set("ai", () => 1).forResult();
				
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

// === 构陷 ===
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
			forced: true,
			popup: false,
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
		).set("prompt", "众矢：请选择对" + targetName + "的处理方式")
			.set("ai", (function(_owner) {
				return function(event, player) {
					const att = get.attitude(player, _owner);
					if (att > 0) {
						return 0;
					}
					const count = game.filterPlayer(function(p) {
						if (p === _owner || !p.inRange(_owner)) {
							return false;
						}
						return p.getCards("h").some(function(c) {
							return get.tag(c, "damage") >= 1 && p.canUse(c, _owner);
						});
					}).length;
					return count <= 2 ? 1 : 0;
				};
			})(player))
			.forResult();
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
					"众矢：是否对" + get.translation(player) + "使用一张伤害牌？",
					(function(_chara, _player) {
						return function(card) {
							return get.tag(card, "damage") >= 1 && _chara.canUse(card, _player);
						};
					})(chara, player),
					player,
					-1
				);
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
},

// === 连筹 ===
qunyou_lianchou: {
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		const X = _status.discarded.length;
		if (X <= 0) return false;
		const suits = new Set();
		player.getCards("h").forEach(c => suits.add(get.suit(c, player)));
		return suits.size === X;
	},
	async content(event, trigger, player) {
		const X = _status.discarded.length;
		await player.draw(player.countCards("h"));
		const skills = game.filterSkills(player.getStockSkills(true, true), player);
		const idx = X - 1;
		if (idx >= 0 && idx < skills.length) {
			player.refreshSkill(skills[idx]);
		}
	},
	ai: {
		order: 7,
		result: { player: 1 },
	},
},

// === 圆难 ===
qunyou_yuannan: {
	enable: "phaseUse",
	filter(event, player) {
		const X = _status.discarded.length;
		if (!X || X <= 0) return false;
		if (!player.countCards("he", card => player.canRecast(card))) return false;
		const used = player.getStorage("qunyou_yuannan_used");
		if (!used.includes("A")) return true;
		if (used.includes("B")) return false;
		const suits = qunyou_getDiscardSuits();
		if (suits.size >= 4) return false;
		const missing = lib.suit.slice().filter(s => !suits.has(s));
		if (missing.length > X) return false;
		const avail = new Set();
		player.getCards("he", card => {
			if (player.canRecast(card)) avail.add(get.suit(card, player));
		});
		return missing.every(s => avail.has(s));
	},
	async content(event, trigger, player) {
		const X = _status.discarded.length;
		const used = player.getStorage("qunyou_yuannan_used");
		const entryA = !used.includes("A");
		const suits = qunyou_getDiscardSuits();
		const missing = suits.size < 4 ? lib.suit.slice().filter(s => !suits.has(s)) : [];
		const avail = new Set();
		player.getCards("he", card => {
			if (player.canRecast(card)) avail.add(get.suit(card, player));
		});
		const entryB = !used.includes("B") && suits.size < 4 && missing.length <= X && missing.every(s => avail.has(s));

		let entry = "A";
		if (entryA && entryB) {
			const result = await player.chooseControl(["出牌重铸", "补齐花色"]).set("prompt", "圆难：请选择重铸方式")
				.set("ai", () => {
					const player = _status.event.player;
					if (player.needsToDiscard()) return 0;
					return 1;
				})
				.forResult();
			entry = result.control === "补齐花色" ? "B" : "A";
		} else if (entryB) {
			entry = "B";
		}

		let cards;
		if (entry === "B") {
			const suits2 = qunyou_getDiscardSuits();
			const missing2 = lib.suit.slice().filter(s => !suits2.has(s));
			const picked = [];
			for (const suit of missing2) {
				const result = await player.chooseCard("he", true, `圆难：选择一张${get.translation(suit)}牌重铸`, card => {
					return get.suit(card, player) === suit && !picked.includes(card) && player.canRecast(card);
				})
				.set("ai", card => -get.value(card, player))
				.forResult();
				if (!result.bool) return;
				picked.push(...result.cards);
			}
			const remaining = X - missing2.length;
			if (remaining > 0) {
				const result = await player.chooseCard("he", remaining, true, `圆难：再选${remaining}张牌重铸`, card => {
					return !picked.includes(card) && player.canRecast(card);
				})
				.set("ai", card => -get.value(card, player))
				.forResult();
				if (!result.bool) return;
				cards = picked.concat(result.cards);
			} else {
				cards = picked;
			}
		} else {
			const result = await player.chooseCard("he", X, true, `圆难：选择${X}张牌重铸`, card => {
				return player.canRecast(card);
			})
			.set("ai", card => -get.value(card, player))
			.forResult();
			if (!result.bool) return;
			cards = result.cards;
		}

		await player.recast(cards);

		player.addTempSkill("qunyou_yuannan_used", { player: "phaseBeginStart" });
		player.markAuto("qunyou_yuannan_used", [entry]);

		const trickNames = lib.inpile.filter(name => {
			const info = get.info({ name });
			if (!info || info.type !== "trick") return false;
			if (info.delay) return false;
			const st = info.selectTarget;
			if (st === 1) return true;
			if (Array.isArray(st) && st[0] === 1 && st[1] === 1) return true;
			return false;
		});

		const btnResult = await player.chooseButton([`圆难：选择一张单目标非延时锦囊牌`, [trickNames.map(n => ["锦囊", "", n]), "vcard"]])
			.set("ai", button => player.getUseValue({ name: button.link[2] }))
			.forResult();
		if (!btnResult.bool) return;
		const trickName = btnResult.links[0][2];

		const vcard = get.autoViewAs({ name: trickName }, "unsure");
		await player.chooseUseTarget(vcard, true);
	},
	ai: {
		order: 6,
		result: { player: 1 },
	},
	subSkill: {
		used: { charlotte: true, onremove: true },
	},
},

// === 晦倾 ===
qunyou_huiqing: {
	enable: ["chooseToUse", "chooseToRespond"],
	filter(event, player) {
		const X = _status.discarded.length;
		if (!X || X <= 0) return false;
		if (!player.countCards("hes")) return false;
		const lastCount = player.storage.qunyou_huiqing_record;
		const max = lastCount != null ? Math.min(X, lastCount - 1) : X;
		if (max < 1) return false;
		for (const name of ["sha", "shan", "tao", "jiu"]) {
			if (event.filterCard(get.autoViewAs({ name }, "unsure"), player, event)) return true;
		}
		return false;
	},
	hiddenCard(player, name) {
		if (!["sha", "shan", "tao", "jiu"].includes(name)) return false;
		const X = _status.discarded.length;
		if (!X || X <= 0) return false;
		const lastCount = player.storage.qunyou_huiqing_record;
		const max = lastCount != null ? Math.min(X, lastCount - 1) : X;
		if (max < 1) return false;
		return player.countCards("hes") > 0;
	},
	chooseButton: {
		dialog(event, player) {
			const list = [];
			for (const name of ["sha", "shan", "tao", "jiu"]) {
				if (event.filterCard(get.autoViewAs({ name }, "unsure"), player, event)) {
					list.push(["基本", "", name]);
				}
			}
			return ui.create.dialog("晦倾", [list, "vcard"], "hidden");
		},
		filter(button, player) {
			const evt = _status.event.getParent();
			return evt.filterCard({ name: button.link[2], isCard: true }, player, evt);
		},
		check(button) {
			const card = { name: button.link[2] };
			const player = _status.event.player;
			if (_status.event.getParent().type != "phase") return 1;
			if (card.name == "jiu") return 0;
			if (card.name == "sha" && player.hasSkill("jiu")) return 0;
			return player.getUseValue(card, null, true);
		},
		backup(links, player) {
			const name = links[0][2];
			return {
				filterCard: true,
				selectCard() {
					const p = _status.event.player;
					const X = _status.discarded.length;
					const lastCount = p.storage.qunyou_huiqing_last;
					const max = lastCount != null ? Math.min(X, lastCount - 1) : X;
					return [1, Math.max(1, max)];
				},
				position: "hes",
				popname: true,
				viewAs: { name, isCard: true },
				precontent(event, trigger, player) {
					const count = event.result.cards.length;
					player.storage.qunyou_huiqing_record = count;
					player.addTempSkill("qunyou_huiqing_record", { player: "phaseBeginStart" });
				},
			};
		},
		prompt(links, player) {
			return `将若干张牌当${get.translation(links[0][2])}使用或打出`;
		},
	},
	ai: {
		// 印牌技出牌阶段排序依赖 ai.order(get.order),缺失时 AI 出牌阶段不会主动选择此技
		order: 5,
		result: { player: 1 },
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag) {
			const X = _status.discarded.length;
			if (!X || X <= 0) return false;
			const lastCount = player.storage.qunyou_huiqing_record;
			const max = lastCount != null ? Math.min(X, lastCount - 1) : X;
			if (max < 1) return false;
			return player.countCards("hes") > 0;
		},
	},
	subSkill: {
		record: { charlotte: true, onremove: true },
	},
},

// === 武威 ===
qunyou_wuwei: {
	audio: 2,
	enable: ["chooseToUse", "chooseToRespond"],
	group: ["qunyou_wuwei_target", "qunyou_wuwei_damage"],
	filter(event, player) {
		if (player.hasSkill("qunyou_wuwei_used")) return false;
		if (!player.countCards("hes", { color: "red" })) return false;
		for (var name of lib.inpile) {
			var card = { name: name, isCard: true };
			if (name == "sha") {
				if (event.filterCard(get.autoViewAs(card, "unsure"), player, event)) return true;
				for (var nature of lib.inpile_nature) {
					card.nature = nature;
					if (event.filterCard(get.autoViewAs(card, "unsure"), player, event)) return true;
				}
			} else if (get.type(name) == "trick") {
				if (event.filterCard(get.autoViewAs(card, "unsure"), player, event)) return true;
			}
		}
		return false;
	},
	hiddenCard(player, name) {
		return (name == "sha" || get.type(name) == "trick") && !player.hasSkill("qunyou_wuwei_used") && player.countCards("hes", { color: "red" }) > 0;
	},
	chooseButton: {
		dialog(event, player) {
			var cards = [];
			for (var name of lib.inpile) {
				var card = { name: name, isCard: true };
				if (name == "sha") {
					if (event.filterCard(get.autoViewAs(card, "unsure"), player, event)) cards.push(["基本", "", "sha"]);
					for (var nature of lib.inpile_nature) {
						card.nature = nature;
						if (event.filterCard(get.autoViewAs(card, "unsure"), player, event)) cards.push(["基本", "", "sha", nature]);
					}
				} else if (get.type(name) == "trick") {
					if (event.filterCard(get.autoViewAs(card, "unsure"), player, event)) cards.push(["锦囊", "", name]);
				}
			}
			return ui.create.dialog("武威", [cards, "vcard"]);
		},
		backup(links, player) {
			return {
				audio: "qunyou_wuwei",
				filterCard: { color: "red" },
				selectCard: [1, Infinity],
				position: "hes",
				popname: true,
				check(card) { return 6 - get.value(card); },
				viewAs: { name: links[0][2], nature: links[0][3], storage: { qunyou_wuwei: true } },
				precontent() {
					player.logSkill("qunyou_wuwei");
					delete event.result.skill;
					player.addTempSkill("qunyou_wuwei_used");
					event.result.card.storage.qunyou_wuwei_x = event.result.cards.length;
				},
			};
		},
		prompt(links, player) {
			return "将若干张红色牌当做" + (get.translation(links[0][3]) || "") + get.translation(links[0][2]) + "使用";
		},
	},
	subSkill: {
		used: { charlotte: true },
		target: {
			trigger: { player: "useCard2" },
			forced: true,
			charlotte: true,
			filter(event, player) {
				if (!event.card?.storage?.qunyou_wuwei) return false;
				if (_status.currentPhase !== player) return false;
				var X = event.card.storage.qunyou_wuwei_x || 0;
				return X > 0 && game.hasPlayer(function (target) {
					return lib.filter.targetEnabled2(event.card, player, target) && lib.filter.targetInRange(event.card, player, target);
				});
			},
			async content(event, trigger, player) {
				var X = trigger.card.storage.qunyou_wuwei_x;
				var result = await player.chooseTarget({
					prompt: "武威：为此牌选择1至" + get.cnNumber(X) + "名目标",
					selectTarget: [1, X],
					forced: true,
					filterTarget(card, player, target) {
						var card2 = get.event().card;
						return lib.filter.targetEnabled2(card2, player, target) && lib.filter.targetInRange(card2, player, target);
					},
				}).set("card", trigger.card).set("ai", function (target) {
					return get.damageEffect(target, player, player) > 0 ? 2 : 0.5;
				}).forResult();
				if (result.targets?.length) {
					trigger.targets.length = 0;
					trigger.targets.addArray(result.targets);
				}
			},
		},
		damage: {
			trigger: { source: "damageBegin" },
			forced: true,
			charlotte: true,
			filter(event, player) {
				if (!event.card?.storage?.qunyou_wuwei) return false;
				var useCardEvt = event.getParent("useCard");
				return useCardEvt && useCardEvt.targets?.length === 1;
			},
			content(event, trigger, player) {
				var X = trigger.card.storage.qunyou_wuwei_x || 0;
				trigger.num += X;
			},
		},
	},
	ai: {
		respondSha: true,
		skillTagFilter(player) {
			return !player.hasSkill("qunyou_wuwei_used") && player.countCards("hes", { color: "red" }) > 0;
		},
		order: 4,
		result: { player: 1 },
	},
},

// === 震襄 ===
qunyou_zhenxiang: {
	audio: 2,
	comboSkill: true,
	trigger: { player: "useCard" },
	filter(event, player) {
		var isRed = get.color(event.card) == "red";
		if (!isRed && event.cards?.length) {
			isRed = event.cards.every(function (c) { return get.color(c) == "red"; });
		}
		if (!isRed) return false;
		var evt = lib.skill.dcjianying.getLastUsed(player, event);
		if (!evt || !evt.card || evt.qunyou_zhenxiang) return false;
		var type = get.type(evt.card);
		return type == "trick" || type == "delay";
	},
	async cost(event, trigger, player) {
		event.result = await player.chooseBool(get.prompt2("qunyou_zhenxiang")).set("ai", () => {
			const targets = trigger.targets || [];
			if (!targets.length) return true;
			for (const t of targets) {
				if (get.attitude(player, t) <= 0) return true;
			}
			return targets.some((t) => t.countCards("j") > 0 || t.getCards("he").some((c) => get.value(c, t) < 3));
		}).forResult();
	},
	async content(event, trigger, player) {
		trigger.set("qunyou_zhenxiang", true);
		if (trigger.targets?.length) {
			for (var target of trigger.targets.sortBySeat()) {
				await target.draw(1);
				await player.discardPlayerCard(target, "hej", [1, 1], true);
				await target.damage(1, "thunder");
			}
		} else {
			await player.draw(2);
		}
	},
	ai: {
		result: { player: 1 },
	},
	},

// === 上兵 ===
qunyou_shangbing: {
	audio: 2,
	enable: ["chooseToUse", "chooseToRespond"],
	filter(event, player) {
		return player.countCards("h") >= 2;
	},
	chooseButton: {
		dialog(event, player) {
			var list = [];
			for (var name of lib.inpile) {
				if (get.type(name) !== "basic") continue;
				if (event.filterCard(get.autoViewAs({ name }, "unsure"), player, event)) {
					list.push(["基本", "", name]);
				}
			}
			if (event.filterCard(get.autoViewAs({ name: "wuxie" }, "unsure"), player, event)) {
				list.push(["锦囊", "", "wuxie"]);
			}
			return ui.create.dialog("上兵", [list, "vcard"], "hidden");
		},
		filter(button, player) {
			var evt = _status.event.getParent();
			return evt.filterCard({ name: button.link[2], isCard: true }, player, evt);
		},
		check(button) {
			if (_status.event.getParent().type != "phase") return 1;
			var player = _status.event.player;
			return player.getUseValue({ name: button.link[2] }, null, true);
		},
		backup(links, player) {
			return {
				filterCard(card, player) { return get.position(card) === "h"; },
				selectCard() { return _status.event.player.countCards("h") - 1; },
				position: "h",
				viewAs: { name: links[0][2], isCard: true },
				popname: true,
				precontent() {
					player.storage.qunyou_shangbing_lastName = event.result.card.name;
					player.storage.qunyou_shangbing_lastCount = event.result.cards.length;
				},
			};
		},
		prompt(links, player) {
			return "将" + get.cnNumber(player.countCards("h") - 1) + "张手牌当【" + get.translation(links[0][2]) + "】使用或打出";
		},
	},
	hiddenCard(player, name) {
		if (player.countCards("h") < 2) return false;
		if (name === "wuxie") return true;
		if (get.type(name) === "basic") return true;
		return false;
	},
	group: "qunyou_shangbing_lose",
	ai: {
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag) {
			return player.countCards("h") >= 2;
		},
		order: 1,
		result: { player: 1 },
	},
	subSkill: {
		lose: {
			trigger: { player: "loseAfter" },
			filter(event, player) {
				const hs = event.getl(player)?.hs;
				return hs?.length === 1 && !player.countCards("h") && player.storage.qunyou_shangbing_lastName;
			},
			async content(event, trigger, player) {
				const card = trigger.getl(player).hs[0];
				await player.showCards(card, get.translation(player) + "发动了【上兵】");
				const lastName = player.storage.qunyou_shangbing_lastName;
				if (lastName && get.name(card) === lastName) {
					const X = player.storage.qunyou_shangbing_lastCount || 0;
					if (X > 0) await player.draw(X);
				}
			},
		},
		backup: {},
	},
},
// === 视势 ===
	qunyou_shishi: {
		audio: 2,
		enable: "phaseUse",
		filter(event, player) {
			return !player.hasSkill("qunyou_shishi_disabled") && player.countCards("he") >= 3;
		},
		viewAs: { name: "dongzhuxianji", isCard: true, storage: { qunyou_shishi: true } },
		filterCard: true,
		selectCard: 3,
		position: "he",
		prompt: "将三张牌当【洞烛先机】使用",
		check(card) { return 1 / get.value(card); },
		ai: {
			// 出牌阶段 AI 排序依赖 ai.order(此前缺失,AI 不会主动发动);三张牌有成本,取中低值
			order: 4,
			result: { player: 1 },
		},
		group: "qunyou_shishi_fire",
		subSkill: {
			fire: {
				audio: "qunyou_shishi",
				trigger: { player: "useCardAfter" },
				filter(event, player) {
					if (event.card?.name != "dongzhuxianji") return false;
					return event.card?.storage?.qunyou_shishi;
				},
				direct: true,
				async content(event, trigger, player) {
					const targetResult = await player.chooseTarget({
						prompt: "选择一名角色，令其视为使用一张【火攻】",
						forced: true,
					}).forResult();
					if (!targetResult.bool) return;
					const fireChar = targetResult.targets[0];
					const huogong_card = get.autoViewAs({ name: "huogong", isCard: true });
					if (!fireChar.hasUseTarget(huogong_card)) return;
					const fireTargetResult = await fireChar.chooseTarget({
						prompt: get.translation(fireChar) + "请选择【火攻】的目标",
						filterTarget(card, player, target) {
							return player.canUse(get.autoViewAs({ name: "huogong", isCard: true }), target);
						},
						forced: true,
					}).forResult();
					if (!fireTargetResult.bool) return;
					const fireTarget = fireTargetResult.targets[0];
					await fireChar.useCard(huogong_card, fireTarget, false);
					const counts = [
						player.countCards("h"),
						fireChar.countCards("h"),
						fireTarget.countCards("h"),
					];
					if (counts[0] !== counts[1] || counts[0] !== counts[2]) {
						player.addTempSkill("qunyou_shishi_disabled", { player: "phaseAfter" });
						player.popup("视势已失效");
					}
				},
			},
			disabled: {
				charlotte: true,
			},
		},
	},

// === 击稷 ===
	qunyou_jiji: {
		audio: 2,
		trigger: {
			player: "loseAfter",
			global: ["gainAfter", "equipAfter", "addJudgeAfter", "loseAsyncAfter", "addToExpansionAfter"],
		},
		filter(event, player) {
			if (!player.isIn()) return false;
			if (event.getg?.(player)?.length) return true;
			if (event.getl?.(player)?.hs?.length) return true;
			return false;
		},
		direct: true,
		async content(event, trigger, player) {
			let change = 0;
			if (trigger.getg?.(player)?.length) {
				change = trigger.getg(player).length;
			} else if (trigger.getl?.(player)?.hs?.length) {
				change = trigger.getl(player).hs.length;
			}
			if (!change) return;
			const myHand = player.countCards("h");
			const targets = game.filterPlayer(p =>
				p != player && p.isIn() && Math.abs(p.countCards("h") - myHand) === change
			);
			if (!targets.length) return;
			const str = targets.map(t => get.translation(t) + "（" + t.countCards("h") + "张）").join("，");
			const result = await player.chooseBool(
				get.prompt("qunyou_jiji"),
				"手牌数变化" + change + "点，可对" + str + "各造成1点伤害"
			).set("ai", () => {
				// 伤害无差别波及所有差值角色:敌人数须多于队友数,且队友状态还行(无人濒死/残血)才发动
				const foes = targets.filter((t) => get.attitude(player, t) < 0);
				const mates = targets.filter((t) => get.attitude(player, t) > 0);
				if (foes.length <= mates.length) return 0;
				if (mates.some((t) => t.isDying() || t.hp <= 1)) return 0;
				return 1;
			}).forResult();
			if (!result.bool) return;
			player.logSkill("qunyou_jiji");
			for (const target of targets) {
				await target.damage(player);
			}
		},
	},
// === 耕读 ===
	qunyou_gengdu: {
		audio: 2,
		trigger: { player: "phaseChange" },
		direct: true,
		filter(event, player) {
			const phaseBase = event.phaseList[event.num].split("|")[0].split("-")[0];
			if (phaseBase.startsWith("skip")) return false;
			if (player.countCards("h") > player.getHandcardLimit())
				return phaseBase !== "phaseDiscard";
			else
				return phaseBase !== "phaseDraw";
		},
		async content(event, trigger, player) {
			const over = player.countCards("h") > player.getHandcardLimit();
			const phaseBase = trigger.phaseList[trigger.num].split("|")[0].split("-")[0];
			const phaseCN = { phaseZhunbei: "准备", phaseJudge: "判定", phaseDraw: "摸牌", phaseUse: "出牌", phaseDiscard: "弃牌", phaseJieshu: "结束" }[phaseBase];
			const r = await player.chooseBool(get.prompt("qunyou_gengdu"),
				`将${phaseCN}阶段改为${over ? "弃牌" : "摸牌"}阶段`
			).forResult();
			if (!r.bool) return;
			trigger.phaseList[trigger.num] = `${over ? "phaseDiscard" : "phaseDraw"}|${event.name}`;
		},
		ai: {
			threaten: 2,
		},
	},

// === 战围 ===
	qunyou_zhanwei: {
		audio: 2,
		enable: "phaseUse",
		usable: 2,
		filter(event, player) {
			return game.hasPlayer(target => target !== player && player.canCompare(target));
		},
		async content(event, trigger, player) {
			const targetResult = await player
				.chooseTarget(get.prompt("qunyou_zhanwei"), "与一名角色拼点", true, (card, p, target) => {
					return target !== p && p.canCompare(target);
				})
				.set("ai", target => -get.attitude(player, target))
				.forResult();
			if (!targetResult?.bool || !targetResult.targets?.length) return;
			const target = targetResult.targets[0];
			player.logSkill("qunyou_zhanwei", target);
			const compare = await player.chooseToCompare(target).forResult();
			if (!compare?.player) return;
			if (!target.isIn()) return;
			if (compare.bool) {
				if (get.position(compare.player, true) !== "o" && get.position(compare.player, true) !== "d") return;
				await target.gain(compare.player, "gain2");
				if (player.canUse({ name: "juedou", isCard: true }, target, false)) {
					await player.useCard({ name: "juedou", isCard: true }, target, false);
				}
			} else {
				if (!player.isIn()) return;
				if (get.position(compare.target, true) !== "o" && get.position(compare.target, true) !== "d") return;
				await player.gain(compare.target, "gain2");
				if (target.canUse({ name: "juedou", isCard: true }, player, false)) {
					await target.useCard({ name: "juedou", isCard: true }, player, false);
				}
			}
		},
		ai: {
			order: 6,
			result: {
				player(player) {
					if (!game.hasPlayer(target => target !== player && get.effect(target, { name: "juedou" }, player, player) > 0)) return 0;
					const hasSha = player.countCards("h", (c) => get.name(c, player) === "sha") > 0;
					const canTank = player.hp >= 3;
					return hasSha || canTank ? 1 : 0;
				},
			},
		},
	},

	// === 荡阵 ===
	qunyou_dangzhen: {
		audio: 2,
		forced: true,
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			if (!event.targets || event.targets.length !== 1) return false;
			if (!event.targets[0].isIn()) return false;
			return true;
		},
		async content(event, trigger, player) {
			const target = trigger.targets[0];
			const prev = player.storage.qunyou_dangzhen_prev;
			if (prev !== undefined && target !== prev) {
				await target.damage(1, player);
			} else {
				await target.draw();
			}
		},
		group: ["qunyou_dangzhen_record", "qunyou_dangzhen_init"],
		subSkill: {
			record: {
				charlotte: true,
				trigger: { global: "useCard" },
				forced: true,
				popup: false,
				silent: true,
				filter(event, player) {
					return event.targets && event.targets.length === 1 && event.targets[0].isIn();
				},
				content(event, trigger, player) {
					player.storage.qunyou_dangzhen_prev = player.storage.qunyou_dangzhen_cur;
					player.storage.qunyou_dangzhen_cur = trigger.targets[0];
				},
				sub: true,
				sourceSkill: "qunyou_dangzhen",
			},
			init: {
				charlotte: true,
				trigger: { player: "phaseAfter" },
				forced: true,
				popup: false,
				silent: true,
				content(event, trigger, player) {
					delete player.storage.qunyou_dangzhen_prev;
					delete player.storage.qunyou_dangzhen_cur;
				},
				sub: true,
				sourceSkill: "qunyou_dangzhen",
			},
		},
	},

// === 激昂 ===
	qunyou_jiang: {
		audio: 2,
		sunbenSkill: true,
		getUsable(player, event) {
			const phase = (event ?? _status.event)?.getParent("phase");
			if (!phase || phase.name !== "phase") return [];
			const cards = qunyou_shenshi_getTurnDiscardCards(phase);
			const seen = new Set();
			const unique = [];
			for (const card of cards) {
				if (card == null) continue;
				const id = card.cardid ?? card._cardid ?? card;
				if (id != null && id !== false && id !== -1 && !seen.has(id)) {
					seen.add(id);
					unique.push(card);
				}
			}
			return unique.filter(card => {
				const vcard = { name: get.name(card, player), nature: get.nature(card), isCard: true, storage: { qunyou_jiang: true } };
				return event.filterCard(vcard, player, event);
			});
		},
		enable: ["chooseToUse", "chooseToRespond"],
		trigger: { player: "useCardAfter" },
		direct: true,
		popup: false,
		filter(event, player, name) {
			if (name === "useCardAfter") {
				return event.player === player && event.card?.storage?.qunyou_jiang;
			}
			return lib.skill.qunyou_jiang.getUsable(player, event).length > 0;
		},
		hiddenCard(player, name) {
			if (name !== "shan" && name !== "wuxie") return false;
			return lib.skill.qunyou_jiang.getUsable(player).some(card => get.name(card, player) === name);
		},
		chooseButton: {
			dialog(event, player) {
				const cards = lib.skill.qunyou_jiang.getUsable(player, event);
				if (!cards.length) return ui.create.dialog("激昂：本回合弃牌堆无可合法使用的牌");
				return ui.create.dialog("激昂：选择一张本回合弃牌堆的牌", [cards, "card"]);
			},
			check(button) {
				const player = get.player();
				return player.getUseValue(button.link);
			},
			backup(links, player) {
				const card = links[0];
				return {
					audio: "qunyou_jiang",
					sourceSkill: "qunyou_jiang",
					viewAs: { name: get.name(card), nature: get.nature(card), isCard: true, storage: { qunyou_jiang: true } },
					filterCard: () => false,
					selectCard: -1,
					popname: true,
					precontent(event, trigger, player) {
						player.removeSkill("qunyou_jiang_sunben");
						player.addSkill("qunyou_jiang_sunben");
					},
				};
			},
			prompt(links) {
				return "激昂：使用" + get.translation(links[0]);
			},
		},
		group: ["qunyou_jiang_unlimit"],
		async content(event, trigger, player) {
			if (!player.isIn()) return;
			if (player.hp >= player.maxHp) {
				await player.loseHp(1);
			} else {
				const choice = await player
					.chooseControl(["体力-1", "体力+1"])
					.set("prompt", "激昂：调整体力值")
					.set("ai", () => {
						if (player.hp <= 1 || player.isDamaged()) return "体力+1";
						return "体力-1";
					})
					.forResult();
				if (choice.control === "体力+1") await player.recover(1);
				else await player.loseHp(1);
			}
			if (player.hp !== 1) {
				player.disableSkill("qunyou_jiang_awake", "qunyou_jiang");
			}
		},
		ai: {
			order: 1,
			respondSha: true,
			respondShan: true,
			save: true,
			skillTagFilter(player, tag) {
				if (tag === "respondSha") {
					return lib.skill.qunyou_jiang.getUsable(player).some(c => get.name(c, player) === "sha");
				}
				if (tag === "respondShan") {
					return lib.skill.qunyou_jiang.getUsable(player).some(c => get.name(c, player) === "shan");
				}
				if (tag === "save") {
					return lib.skill.qunyou_jiang.getUsable(player).some(c => get.name(c, player) === "tao");
				}
				return false;
			},
			result: { player: 1 },
		},
		subSkill: {
			unlimit: {
				charlotte: true,
				mod: {
					cardUsable(card, player, num) {
						if (card.storage?.qunyou_jiang) return Infinity;
					},
				},
				trigger: { player: "useCard1" },
				forced: true,
				popup: false,
				firstDo: true,
				filter(event, player) {
					return event.card?.storage?.qunyou_jiang;
				},
				content(event, trigger, player) {
					if (trigger.addCount !== false) {
						trigger.addCount = false;
						const stat = player.getStat().card, name = trigger.card.name;
						if (typeof stat[name] == "number") stat[name]--;
					}
				},
			sub: true,
			sourceSkill: "qunyou_jiang",
		},
		sunben: {
				charlotte: true,
				trigger: { player: "changeHp" },
				forced: true,
				popup: false,
				silent: true,
				content(event, trigger, player) {
					if (player.hp !== 1) return;
					player.removeSkill("qunyou_jiang_sunben");
					if (player.hasSkill("qunyou_jiang", null, null, false) && !player.hasSkill("qunyou_jiang")) {
						player.popup("激昂");
						player.restoreSkill("qunyou_jiang");
						game.log(player, "恢复了技能", "#g【激昂】");
					}
				},
			},
		},
	},
	// === 英魄 ===
	qunyou_yingpo: {
		audio: 2,
		trigger: { player: "changeHpAfter" },
		async content(event, trigger, player) {
			if (!player.isIn()) return;
			if (player.isDying()) return;
			player.removeSkill("qunyou_yingpo_recover");
			player.addSkill("qunyou_yingpo_recover");
			const target = await player
				.chooseTarget("英魄：令一名其他角色选择一项", (card, p, t) => p != t)
				.set("ai", (target) => {
					const player = _status.event.player;
					if (player.getDamagedHp() == 1 && target.countCards("he") == 0) return 0;
					if (get.attitude(player, target) > 0) return 10 + get.attitude(player, target);
					if (player.getDamagedHp() == 1) return -1;
					return 1;
				})
				.forResult();
			if (!target.bool || !target.targets?.length) return;
			const target2 = target.targets[0];
			const num = player.getDamagedHp();
			let directcontrol = num == 1;
			if (!directcontrol) {
				const str1 = "摸" + get.cnNumber(num, true) + "弃一";
				const str2 = "摸一弃" + get.cnNumber(num, true);
				directcontrol = (await player
					.chooseControl(str1, str2, (event2, player2) => {
						if (player2.isHealthy()) return 1 - _status.event.choice;
						return _status.event.choice;
					})
					.set("choice", get.attitude(player, target2) > 0 ? 0 : 1)
					.forResult()).control === str1;
			}
			if (directcontrol) {
				if (num > 0) await target2.draw(num);
				await target2.chooseToDiscard(true, "he");
			} else {
				await target2.draw();
				if (num > 0) await target2.chooseToDiscard(num, true, "he", "allowChooseAll");
			}
			player.disableSkill("qunyou_yingpo_awake", "qunyou_yingpo");
		},
		subSkill: {
			recover: {
				charlotte: true,
				trigger: {
					global: "useCardToTarget",
					player: "useCard",
				},
				forced: true,
				popup: false,
				silent: true,
				filter(event, player, name) {
					if (name === "useCardToTarget") {
						if (event.target !== player || !get.tag(event.card, "damage")) return false;
					} else {
						if (event.respondTo || !get.tag(event.card, "damage")) return false;
					}
					const discardCards = qunyou_shenshi_getTurnDiscardCards(event.getParent("phase"));
					let red = 0;
					let black = 0;
					for (const card of discardCards) {
						if (get.color(card) === "red") red++;
						else if (get.color(card) === "black") black++;
					}
					const color = get.color(event.card);
					if (red < black) return color === "red";
					if (black < red) return color === "black";
					return color === "red" || color === "black";
				},
				content(event, trigger, player) {
					player.removeSkill("qunyou_yingpo_recover");
					if (player.hasSkill("qunyou_yingpo", null, null, false) && !player.hasSkill("qunyou_yingpo")) {
						player.popup("英魄");
						player.restoreSkill("qunyou_yingpo");
						game.log(player, "恢复了技能", "#g【英魄】");
					}
				},
			},
		},
	},
	// === 蹈烈 ===
	qunyou_daolie: {
		audio: 2,
		enable: "phaseUse",
		async content(event, trigger, player) {
			const targetResult = await player
				.chooseTarget("蹈烈：选择一名其他角色", true, (card, p, t) => p != t)
				.set("ai", (target) => get.effect(player, { name: "juedou" }, target, player))
				.forResult();
			if (!targetResult?.bool || !targetResult.targets?.length) return;
			const target = targetResult.targets[0];
			const num = player.getDamagedHp();
			const hs = player.countCards("h");
			if (hs > num) {
				await player
					.chooseToDiscard(`蹈烈：弃置${get.cnNumber(hs - num)}张手牌调整至${get.cnNumber(num)}张`, hs - num, "h", "allowChooseAll")
					.set("ai", (card) => 6 - get.value(card))
					.forResult();
			} else if (hs < num) {
				await player.drawTo(num);
			}
			const before = new Map();
			for (const p of game.filterPlayer()) before.set(p, p.getHistory("damage").length);
			await target.useCard({ name: "juedou", isCard: true }, player);
			let gained = false;
			for (const p of game.filterPlayer()) {
				if (!p.isAlive() || p.getHistory("damage").length <= before.get(p)) continue;
				gained = true;
				game.log(p, "因决斗受到了伤害，获得了技能", "#g【争绝】");
				p.popup("获得【争绝】");
				p.addSkill("qunyou_zhengjue");
			}
			if (!gained) game.log("蹈烈：这场【决斗】未造成伤害");
		},
		ai: {
			order: 5,
			result: {
				player(player) {
					return game.hasPlayer(t => t !== player && get.effect(player, { name: "juedou" }, t, player) * get.attitude(player, t) > 0.5) ? 1 : 0;
				},
				target(player, target) {
					const att = get.attitude(player, target);
					const juedouEff = get.effect(player, { name: "juedou" }, target, player);
					const zhengjueRisk = att <= 0 ? -0.5 : 0;
					return juedouEff * att + zhengjueRisk;
				},
			},
		},
	},
	// === 争绝 ===
	qunyou_zhengjue: {
		charlotte: true,
		trigger: { source: "damage" },
		forced: true,
		mod: {
			cardname(card, player) {
				return "sha";
			},
		},
		content(event, trigger, player) {
			player.removeSkill("qunyou_zhengjue");
			player.popup("失去争绝");
			game.log(player, "造成伤害，失去了技能", "#g【争绝】");
		},
	},
	// === 莽战 ===
	qunyou_mangzhan: {
		audio: 2,
		trigger: {
			player: ["chooseToRespondAfter", "chooseToUseAfter", "chooseToRespondBegin", "chooseToUseBegin"],
			target: "shaDamage",
			global: "_wuxieAfter",
		},
		forced: true,
		filter(event, player, name) {
			if (name === "shaDamage") {
				const shaEvent = event._trigger || event.getTrigger?.() || event;
				if (shaEvent.directHit || shaEvent.directHit2) return false;
				if (shaEvent.qunyou_mangzhan_counted) return false;
				const responded = game.hasGlobalHistory("everything", (evt) => {
					return evt.triggername === "shaMiss" && evt._trigger === shaEvent && evt._result?.bool && evt._result.result === "shaned";
				});
				return !responded;
			}
			if (name === "chooseToRespondBegin" || name === "chooseToUseBegin") {
				if (name === "chooseToUseBegin" && event.type !== "wuxie") return false;
				if (event.name === "chooseToRespond") {
					return player.hasCard((card) => event.filterCard(card, player, event) && lib.filter.cardRespondable(card, player, event), "hs");
				}
				return player.hasCard((card) => event.filterCard(card, player, event), "hs");
			}
			if (event.name == "chooseToUse" && event.type == "wuxie") return false;
			if (event.name == "_wuxie") {
				const directHit = event._trigger?.getParent()?.directHit;
				if (directHit?.length && directHit.includes(player)) return false;
				if (event.wuxieresult && event.wuxieresult == player) return false;
				return true;
			}
			return event.respondTo && !event.result.bool;
		},
		async content(event, trigger, player) {
			const name = event.triggername;
			if (name === "chooseToRespondBegin" || name === "chooseToUseBegin") {
				trigger.set("forced", true);
				return;
			}
			if (name === "chooseToUseAfter" && event.type === "respondShan") {
				const parent = event.getParent();
				if (parent?.name === "sha") {
					parent.qunyou_mangzhan_counted = true;
				}
			}
			player.addTempSkill("qunyou_mangzhan_c", "phaseAfter");
			player.addMark("qunyou_mangzhan", 1);
			if (player.countMark("qunyou_mangzhan") === player.getHp()) {
				await player.draw(player.getHp());
			}
		},
		intro: { content: "mark", name2: "莽" },
		marktext: "莽",
		subSkill: {
			c: {
				charlotte: true,
				onremove(player) {
					player.removeMark("qunyou_mangzhan", player.countMark("qunyou_mangzhan"));
				},
			},
		},
	},
	// === 趋势 ===
	qunyou_qushi: {
		audio: 2,
		trigger: { player: ["chooseToRespondBefore", "chooseToUseBefore"] },
		direct: true,
		filter(event, player) {
			if (event.responded) return false;
			if (player.hasSkill("qunyou_qushi_used")) return false;
			if (_status.currentPhase === player) return false;
			if (!player.hasUseTarget({ name: "dz_mantianguohai", isCard: true })) return false;
			return ["sha", "shan", "tao", "jiu"].some((name) => event.filterCard({ name, isCard: true }, player, event));
		},
		async content(event, trigger, player) {
			const { bool } = await player
				.chooseBool(get.prompt("qunyou_qushi"), "视为使用一张【瞒天过海】")
				.set("ai", () => {
					if (player.isDying()) return false;
					return player.getUseValue({ name: "dz_mantianguohai", isCard: true }) > 1;
				})
				.forResult();
			if (!bool) return;
			player.logSkill("qunyou_qushi");
			player.addTempSkill("qunyou_qushi_used", "roundStart");
			await player.chooseUseTarget({ name: "dz_mantianguohai", isCard: true, storage: { qunyou_qushi: true } });
		},
		group: ["qunyou_qushi_record", "qunyou_qushi_usable"],
		subSkill: {
			used: {
				charlotte: true,
			},
			record: {
				charlotte: true,
				trigger: { player: "useCardAfter" },
				forced: true,
				popup: false,
				silent: true,
				filter(event, player) {
					return event.card?.storage?.qunyou_qushi;
				},
				content(event, trigger, player) {
					const evtx = trigger;
					const names = [];
					for (const evt of player.getHistory("gain")) {
						if (evt.getParent("useCard") !== evtx) continue;
						for (const card of evt.cards ?? []) {
							const type = get.type(card, false);
							if (type !== "basic" && type !== "trick") continue;
							const name = get.name(card, false);
							if (!names.includes(name)) names.push(name);
						}
					}
					if (!names.length) return;
					player.addTempSkill("qunyou_qushi_mark", { global: "phaseAfter" });
					player.markAuto("qunyou_qushi_mark", names);
				},
				sub: true,
				sourceSkill: "qunyou_qushi",
			},
			mark: {
				charlotte: true,
				onremove: true,
				mark: true,
				intro: {
					content: "本回合你可视为使用或打出：$",
				},
				sub: true,
			},
			usable: {
				enable: ["chooseToUse", "chooseToRespond"],
				filter(event, player) {
					const list = player.storage.qunyou_qushi_mark ?? [];
					if (!list.length) return false;
					return list.some((name) => event.filterCard({ name, isCard: true }, player, event));
				},
				chooseButton: {
					dialog(event, player) {
						const list = (player.storage.qunyou_qushi_mark ?? []).filter((name) => event.filterCard({ name, isCard: true }, player, event));
						if (!list.length) return ui.create.dialog("趋势：无可视为使用或打出的即时牌");
						return ui.create.dialog("趋势：选择一张要视为使用或打出的牌", [list, "vcard"]);
					},
					check(button) {
						const player = get.player();
						return player.getUseValue({ name: button.link[2], isCard: true });
					},
					backup(links, player) {
						return {
							audio: "qunyou_qushi",
							sourceSkill: "qunyou_qushi",
							viewAs: { name: links[0][2], isCard: true },
							filterCard: () => false,
							selectCard: -1,
							popname: true,
						};
					},
					prompt(links) {
						return `趋势：视为使用或打出${get.translation(links[0][2])}`;
					},
				},
				hiddenCard(player, name) {
					return (player.storage.qunyou_qushi_mark ?? []).includes(name);
				},
				ai: {
					order: 7,
					result: {
						player: 1,
					},
				},
			},
		},
	},
	// === 施诿 ===
	qunyou_shiwei: {
		audio: 2,
		trigger: { global: "phaseJieshuBegin" },
		direct: true,
		filter(event, player) {
			const target = event.player;
			if (!target || !target.isIn()) return false;
			if ((player.storage.qunyou_shiwei_usedTo ?? []).includes(target.playerid)) return true;
			if ((player.storage.qunyou_shiwei_missedBy ?? []).includes(target.playerid)) return true;
			return target.countCards("h") === 0;
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			const usedTo = (player.storage.qunyou_shiwei_usedTo ?? []).includes(target.playerid);
			const missedBy = (player.storage.qunyou_shiwei_missedBy ?? []).includes(target.playerid);
			const noHand = target.countCards("h") === 0;
			const n = (usedTo ? 1 : 0) + (missedBy ? 1 : 0) + (noHand ? 1 : 0);
			player.logSkill("qunyou_shiwei", target);
			if (n >= 2 && player.hasSkill("qunyou_qushi_used")) {
				player.removeSkill("qunyou_qushi_used");
				game.log(player, "重置了", "#g【趋势】");
			}
			for (let i = 0; i < n; i++) {
				const result = await player
					.chooseToUse({
						prompt: `施诿：你可以使用至多${get.cnNumber(n)}张牌`,
					filterCard(card) {
						const info = get.info(card);
						if (!info || typeof info.enable === "undefined") return false;
						return lib.filter.cardEnabled(card, player, "forceEnable");
					},
						addCount: false,
						ai1(card) {
							const player = get.player();
							if (get.tag(card, "damage") && player.hasValueTarget(card)) {
								return 10 + get.cacheOrder(card);
							}
							return get.cacheOrder(card);
						},
					})
					.forResult();
				if (!result?.bool) break;
			}
		},
		group: ["qunyou_shiwei_recordUse", "qunyou_shiwei_recordMiss"],
		subSkill: {
			recordUse: {
				charlotte: true,
				trigger: { global: "useCardToPlayer" },
				forced: true,
				popup: false,
				silent: true,
				filter(event, player) {
					return event.target === player;
				},
				content(event, trigger, player) {
					player.storage.qunyou_shiwei_usedTo ??= [];
					if (!player.storage.qunyou_shiwei_usedTo.includes(trigger.player.playerid)) {
						player.storage.qunyou_shiwei_usedTo.push(trigger.player.playerid);
					}
				},
				sub: true,
				sourceSkill: "qunyou_shiwei",
			},
			recordMiss: {
				charlotte: true,
				trigger: { global: ["shaMiss", "eventNeutralized"] },
				forced: true,
				popup: false,
				silent: true,
				filter(event, player, name) {
					if (event.type != "card") return false;
					if (name == "shaMiss") return event.target === player;
					return event._neutralize_event?.player === player;
				},
				content(event, trigger, player) {
					player.storage.qunyou_shiwei_missedBy ??= [];
					const victim = trigger.player;
					if (!victim) return;
					if (!player.storage.qunyou_shiwei_missedBy.includes(victim.playerid)) {
						player.storage.qunyou_shiwei_missedBy.push(victim.playerid);
					}
				},
				sub: true,
				sourceSkill: "qunyou_shiwei",
			},
		},
	},
// === 忠炎 ===
	qunyou_zhongyan: {
		audio: 2,
		limited: true,
		skillAnimation: true,
		animationColor: "orange",
		trigger: { global: "useCard1" },
		filter(event, player) {
			if (_status.dying.length) return false;
			if (!event.targets?.length) return false;
			const color = get.color(event.card);
			return color == "red" || color == "black";
		},
		async cost(event, trigger, player) {
			const name = get.color(trigger.card) == "red" ? "火攻" : "过河拆桥";
			event.result = await player
				.chooseBool(get.prompt2("qunyou_zhongyan"), `令此牌视为【${name}】`)
				// 限定技仅对敌人使用:把敌人使用的牌改成【火攻】/【过河拆桥】;使用者非敌人(队友/自己)不烧
				.set("ai", () => get.attitude(player, trigger.player) < 0)
				.forResult();
		},
		async content(event, trigger, player) {
			player.logSkill("qunyou_zhongyan", trigger.player);
			player.awakenSkill("qunyou_zhongyan");
			const color = get.color(trigger.card);
			trigger.card = get.autoViewAs({ name: color == "red" ? "huogong" : "guohe", isCard: true }, trigger.cards);
			player.storage.qunyou_zhongyan_use = trigger;
			player.addSkill("qunyou_zhongyan_discard");
			player.addTempSkill("qunyou_zhongyan_clear", { global: "phaseAfter" });
		},
		subSkill: {
			discard: {
				charlotte: true,
				trigger: { global: "useCardAfter" },
				forced: true,
				popup: false,
				silent: true,
				filter(event, player) {
					const use = player.storage.qunyou_zhongyan_use;
					return !!use && event === use;
				},
				async content(event, trigger, player) {
					player.removeSkill("qunyou_zhongyan_discard");
					delete player.storage.qunyou_zhongyan_use;
					const cards = game.players.reduce((list, target) => {
						const history = target.getHistory("lose", evt => {
							if (evt.type != "discard" || evt.getlx === false) return false;
							let e = evt;
							let depth = 0;
							while (e && depth < 12) {
								if (e === trigger) return true;
								e = e.parent;
								depth++;
							}
							return false;
						});
						if (!history.length) {
							return list;
						}
						return list.addArray(history.reduce((listx, evt) => [...listx, ...evt.cards], []));
					}, []);
					const discarded = cards.filterInD("d");
					if (!discarded.length) {
						return;
					}
					const result = await player
						.chooseControl(["获得此牌", "置于牌堆顶"], "cancel2")
						.set("prompt", "忠炎：处理因此被弃置的牌")
						.set("ai", () => 0)
						.forResult();
					if (result.control == "获得此牌") {
						await player.gain(discarded, "gain2");
					} else if (result.control == "置于牌堆顶") {
						await game.cardsGotoPile(discarded, "insert");
					}
				},
				sub: true,
				sourceSkill: "qunyou_zhongyan",
			},
			clear: {
				charlotte: true,
				onremove(player) {
					player.removeSkill("qunyou_zhongyan_discard");
					delete player.storage.qunyou_zhongyan_use;
				},
				sub: true,
				sourceSkill: "qunyou_zhongyan",
			},
		},
	},
// === 挽澜 ===
	qunyou_wanlan: {
		audio: 2,
		limited: true,
		skillAnimation: true,
		animationColor: "fire",
		trigger: { global: "dying" },
		filter(event, player) {
			return event.player.isAlive();
		},
		async cost(event, trigger, player) {
			if (!player.countCards("h")) return;
			event.result = await player
				.chooseBool(get.prompt2("qunyou_wanlan"), `弃置所有手牌并令${get.translation(trigger.player)}回复体力至1点`)
				.set("ai", () => get.attitude(player, trigger.player) > 0)
				.forResult();
		},
		async content(event, trigger, player) {
			player.logSkill("qunyou_wanlan", trigger.player);
			player.awakenSkill("qunyou_wanlan");
			await player.discard(player.getCards("h"));
			const dying = trigger.player;
			await dying.recover(1 - dying.hp);
			player.when({ global: "dyingAfter" }).then(async (event, trigger, player) => {
				const cur = _status.currentPhase;
				if (cur?.isIn()) {
					await player.damage(cur);
				}
			});
		},
	},
// === 续天 ===
	qunyou_xutian: {
		audio: 2,
		locked: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { global: "cardsDiscardAfter" },
		filter(event, player) {
			return event.cards?.length > 0;
		},
		async content(event, trigger, player) {
			const card = trigger.cards[trigger.cards.length - 1];
			const last = player.storage.qunyou_xutian_last;
			const same = !!last && (get.suit(card) == get.suit(last) || get.type2(card) == get.type2(last));
			player.storage.qunyou_xutian_last = card;
			if (!same) return;
			player.storage.qunyou_xutian_count = (player.storage.qunyou_xutian_count || 0) + 1;
			const x = player.storage.qunyou_xutian_count % 3;
			if (x === 0) return;
			const skills = player.getStockSkills(true, true);
			const skill = skills[x - 1];
			if (skill) {
				player.refreshSkill(skill);
			}
		},
		onremove(player) {
			delete player.storage.qunyou_xutian_last;
			delete player.storage.qunyou_xutian_count;
		},
	},

// === 奇略 ===
qunyou_qilue: {
	audio: 2,
	enable: "phaseUse",
	discardCount: qunyou_discardCountThisRound,
	filter(event, player) {
		const removed = player.storage.qunyou_qilue_removed || [];
		const nums = player.storage.qunyou_qilue_nums || [];
		if (!removed.includes(1) && nums.length >= 6) {
			return false;
		}
		return true;
	},
	async content(event, trigger, player) {
		const removed = player.storage.qunyou_qilue_removed || (player.storage.qunyou_qilue_removed = []);
		const nums = player.storage.qunyou_qilue_nums || (player.storage.qunyou_qilue_nums = []);
		const phaseEvent = event.getParent("phaseUse");
		const usedNames = game.getGlobalHistory("useCard", (h) => {
			return h.getParent("phaseUse") === phaseEvent && h.player.isIn();
		}).map((h) => get.name(h.card)).toUniqued();
		const useUnusedTrick = async (user) => {
			const list = get.inpileVCardList((info) => {
				if (get.type(info[2], null, false) !== "trick" || get.info(info[2])?.type === "delay") {
					return false;
				}
				if (!removed.includes(3) && usedNames.includes(info[2])) {
					return false;
				}
				return true;
			});
			if (!list.length) {
				return;
			}
			const result = await user
				.chooseButton(["奇略：视为使用一张本阶段未使用过的普通锦囊牌（取消则失去1点体力）", [list, "vcard"]], true)
				.set("ai", (button) => {
					const p = get.player();
					return p.getUseValue({ name: button.link[2], nature: button.link[3] });
				})
				.forResult();
			if (!result?.bool || !result.links?.length) {
				if (!removed.includes(4)) {
					await user.loseHp();
				}
				return;
			}
			const name = result.links[0][2];
			const useResult = await user.chooseUseTarget(get.autoViewAs({ name, nature: result.links[0][3] }, "unsure"), true, false).forResult();
			if (!useResult?.bool) {
				if (!removed.includes(4)) {
					await user.loseHp();
				}
				return;
			}
			usedNames.push(name);
			if (removed.includes(4)) {
				await user.loseHp();
			}
		};
		const result = await player
			.chooseTarget("奇略：令一名角色将手牌数调整至一个本阶段未因此法调整过的数", (card, p, target) => true)
			.set("ai", (target) => {
				const p = get.player();
				return Math.min(5, Math.max(0, 3 - Math.abs(target.countCards("h") - p.countCards("h")))) + (target === p ? 0.5 : 0);
			})
			.forResult();
		if (!result?.bool || !result.targets?.length) return;
		const target = result.targets[0];
		const canNums = [0, 1, 2, 3, 4, 5].filter((n) => removed.includes(1) || !nums.includes(n));
		const numResult = await player
			.chooseControl(canNums.map((n) => `${n}`))
			.set("prompt", `奇略：将${get.translation(target)}的手牌数调整至多少？（本阶段已用过：${nums.length ? nums.join("、") : "无"}）`)
			.set("ai", () => {
				const evt = _status.event;
				const cur = evt.target.countCards("h");
				let best = 0, bestScore = -Infinity;
				for (const n of evt.nums) {
					const score = -Math.abs(cur - n) - Math.abs(n - get.player().countCards("h"));
					if (score > bestScore) {
						bestScore = score;
						best = n;
					}
				}
				return evt.controls.indexOf(`${best}`);
			})
			.set("target", target)
			.set("nums", canNums)
			.forResult();
		if (!numResult?.control) return;
		const num = parseInt(numResult.control, 10);
		nums.push(num);
		if (target.countCards("h") < num) {
			await target.drawTo(num);
		} else if (target.countCards("h") > num) {
			await target.chooseToDiscard("奇略：弃置手牌至" + num + "张", target.countCards("h") - num, "h", true).forResult();
		}
		player.updateMarks("qunyou_qilue");
		const usedByTarget = !removed.includes(2) ? target.countCards("h") >= player.countCards("h") : target.countCards("h") < player.countCards("h");
		const usedByPlayer = !removed.includes(3) ? target.countCards("h") <= player.countCards("h") : target.countCards("h") > player.countCards("h");
		if (usedByTarget) {
			await useUnusedTrick(target);
		}
		if (usedByPlayer) {
			await useUnusedTrick(player);
		}
	},
	mark: true,
	marktext: "奇",
	intro: {
		markcount(storage, player) {
			const removed = player.storage.qunyou_qilue_removed || [];
			return removed.length;
		},
		content(storage, player) {
			const removed = player.storage.qunyou_qilue_removed || [];
			return `已删去${removed.length ? removed.map((n) => `第${get.cnNumber(n)}个“未”`).join("、") : "无"}。本回合弃牌堆牌数：${lib.skill.qunyou_qilue.discardCount()}`;
		},
	},
	group: ["qunyou_qilue_record", "qunyou_qilue_clear", "qunyou_qilue_clearNums"],
	subSkill: {
		record: {
			charlotte: true,
			trigger: {
				global: ["loseAfter", "cardsDiscardAfter", "loseAsyncAfter", "equipAfter", "addJudgeAfter", "addToExpansionAfter"],
			},
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				console.log("[奇略record] 触发", event.name, "player", player.name);
				if (_status.currentPhase !== player) {
					console.log("[奇略record] 非自己回合", _status.currentPhase?.name);
					return false;
				}
				const removed = player.storage.qunyou_qilue_removed || [];
				if (removed.includes(6)) {
					console.log("[奇略record] 已删⑥，跳过");
					return false;
				}
				let discardCards;
				try {
					discardCards = (event.getd() || []).filter((c) => c && get.itemtype(c) === "card" && get.position(c) === "d");
				} catch (e) {
					console.log("[奇略record] getd异常:", e.message);
					discardCards = [];
				}
				console.log("[奇略record] getd结果", discardCards.map((c) => get.name(c)).join(",") || "空");
				if (!discardCards.length) return false;
				if (event.name == "cardsDiscard") {
					const parent = event.getParent();
					if (parent?.name == "orderingDiscard") {
						const related = parent.relatedEvent || parent.getParent();
						if (related?.name == "useCard") {
							console.log("[奇略record] 因使用进入，跳过");
							return false;
						}
					}
				}
				const usedTypes = game.getGlobalHistory("useCard", (evt) => {
					return evt.player.isIn();
				}).map((evt) => get.type2(evt.card, false));
				console.log("[奇略record] 本回合已使用类别", usedTypes.join(",") || "无");
				const condReverse = removed.includes(5);
				const categories = discardCards.map((c) => get.type2(c, false));
				console.log("[奇略record] 进弃牌堆牌类别", categories.join(","), "⑤反转", condReverse);
				const result = categories.some((type) => {
					if (type !== "basic" && type !== "trick" && type !== "equip") return false;
					const used = usedTypes.includes(type);
					return condReverse ? used : !used;
				});
				console.log("[奇略record] 判定结果", result);
				return result;
			},
			content(event, trigger, player) {
				const removed = player.storage.qunyou_qilue_removed || (player.storage.qunyou_qilue_removed = []);
				const X = lib.skill.qunyou_qilue.discardCount();
				const remaining = [1, 2, 3, 4, 5, 6].filter((n) => !removed.includes(n));
				if (X < 1 || X > remaining.length) return;
				const toRemove = 7 - X;
				if (!removed.includes(toRemove)) {
					removed.push(toRemove);
				}
				player.updateMarks("qunyou_qilue");
				game.log(player, `删去了“奇略”倒数第${get.cnNumber(X)}个“未”字`);
			},
		},
		clear: {
			charlotte: true,
			trigger: { global: "phaseAfter" },
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				if (player.storage.qunyou_qilue_removed?.length) {
					delete player.storage.qunyou_qilue_removed;
					player.updateMarks("qunyou_qilue");
				}
			},
		},
		clearNums: {
			charlotte: true,
			trigger: { global: "phaseUseAfter" },
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				if (player.storage.qunyou_qilue_nums?.length) {
					delete player.storage.qunyou_qilue_nums;
					player.updateMarks("qunyou_qilue");
				}
			},
		},
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
},

// === 明策 ===
	qunyou_mingce: {
		audio: 2,
		group: ["qunyou_mingce_target", "qunyou_mingce_clear"],
		enable: "chooseToUse",
		hiddenCard(player, name) {
			return lib.inpile.includes(name) && get.type(name) == "trick" && !(player.storage.qunyou_mingce_used || []).includes(name) && player.hasCard((card) => !get.is.shownCard(card), "h");
		},
		filter(event, player) {
			// 印牌条件：有牌可明置（与其他普通锦囊牌一致，无懈同款）；候选限本回合未以此法使用过的普通锦囊
			if (!player.hasCard((card) => !get.is.shownCard(card), "h")) return false;
			const used = player.storage.qunyou_mingce_used || [];
			return get.inpile("trick").some((name) => !used.includes(name) && event.filterCard(get.autoViewAs({ name, isCard: true }, "unsure"), player, event));
		},
		chooseButton: {
			dialog(event, player) {
				// 候选以当前用牌请求探测：出牌阶段=全部普通锦囊（无懈不可主动使用，自动排除）；限本回合未以此法使用过
				const used = player.storage.qunyou_mingce_used || [];
				const tricks = get.inpile("trick").filter((name) => !used.includes(name) && event.filterCard(get.autoViewAs({ name, isCard: true }, "unsure"), player, event));
				return ui.create.dialog("明策：视为使用一张普通锦囊牌", [tricks.map((name) => ["trick", "", name]), "vcard"]);
			},
			check(button) {
				if (_status.event.getParent().type != "phase") return 1;
				const player = get.player();
				return player.getUseValue(get.autoViewAs({ name: button.link[2], isCard: true }), null, true);
			},
			backup(links, player) {
				return {
					audio: "qunyou_mingce",
					filterCard: () => false,
					selectCard: 0,
					viewAs: { name: links[0][2], isCard: true },
					log: false,
					async precontent(event, trigger, player) {
						player.logSkill("qunyou_mingce");
						await lib.skill.qunyou_mingce.mingzhi(player);
						// 记入本回合已用牌名（clear 子技能于下回合开始时清空）
						(player.storage.qunyou_mingce_used ??= []).push(links[0][2]);
					},
				};
			},
			prompt(links) {
				return "明策：明置一种类型的所有牌，视为使用一张【" + get.translation(links[0][2]) + "】";
			},
		},
		// 明置一种类型的所有手牌（主动印牌与无懈接口共用）
		async mingzhi(player) {
			const typeNames = { basic: "基本牌", trick: "锦囊牌", equip: "装备牌" };
			const available = ["basic", "trick", "equip"].filter(
				(type) =>
					player.countCards("h", (card) => {
						if (get.is.shownCard(card)) return false;
						const t = get.type(card);
						return (t == "delay" ? "trick" : t) == type;
					}) > 0
			);
			if (!available.length) return;
			let chosenType;
			if (available.length == 1) {
				chosenType = available[0];
			} else {
				const result = await player
					.chooseControl(available.map((type) => typeNames[type]))
					.set("prompt", "明策：选择一种类型，明置手牌中该类型的所有牌")
					.set("ai", () => 0)
					.forResult();
				if (!result?.control) return;
				chosenType = Object.keys(typeNames).find((key) => typeNames[key] === result.control);
			}
			const cards = player.getCards("h", (card) => {
				if (get.is.shownCard(card)) return false;
				const t = get.type(card);
				return (t == "delay" ? "trick" : t) == chosenType;
			});
			if (!cards.length) return;
			await player.addShownCards(cards, "visible_qunyou_mingce");
		},
		mod: {
			cardUsable(card, player) {
				const list = get.itemtype(card) == "card" ? [card] : card.cards || [];
				if (list.some((c) => c.hasGaintag && get.is.shownCard(c))) return Infinity;
			},
			targetInRange(card, player) {
				const list = get.itemtype(card) == "card" ? [card] : card.cards || [];
				if (list.some((c) => c.hasGaintag && get.is.shownCard(c))) return true;
			},
		},
		ai: {
			order: 5,
			result: { player: 1 },
		},
		subSkill: {
			clear: {
				// 本回合以此法使用过的锦囊名记录，回合开始时清空
				name: "明策",
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				trigger: { global: "phaseBeginStart" },
				filter(event, player) {
					return (player.storage.qunyou_mingce_used || []).length > 0;
				},
				content(event, trigger, player) {
					delete player.storage.qunyou_mingce_used;
				},
			},
			target: {
				name: "明策",
				audio: "qunyou_mingce",
				charlotte: true,
				trigger: { target: "useCardToTarget" },
				forced: true,
				filter(event, player) {
					return player.hasShownCards();
				},
				async content(event, trigger, player) {
					const category = (card) => {
						const t = get.type(card);
						return t == "delay" ? "trick" : t;
					};
					const revealed = player.getShownCards();
					if (!revealed.length) return;
					const matched = revealed.some((card) => category(card) == category(trigger.card));
					if (matched) {
						await player.loseHp();
					} else if (player.isDamaged()) {
						await player.recover();
					}
				},
			},
		},
	},

// === 定略 ===
	qunyou_dinglue: {
		audio: 2,
		group: ["qunyou_dinglue_dying"],
		trigger: { player: "changeHpAfter" },
		forced: true,
		filter(event, player) {
			return event.changedHp != 0 && player.hasShownCards();
		},
		async content(event, trigger, player) {
			const typeNames = { basic: "基本牌", trick: "锦囊牌", equip: "装备牌" };
			const available = Object.keys(typeNames).filter((key) =>
				player.getCards("h").some((card) => {
					if (!get.is.shownCard(card)) return false;
					const t = get.type(card);
					return (t == "delay" ? "trick" : t) == key;
				})
			);
			if (!available.length) return;
			let control;
			if (available.length == 1) {
				control = typeNames[available[0]];
			} else {
				const result = await player
					.chooseControl(available.map((key) => typeNames[key]))
					.set("prompt", "定略：暗置一种类型的明置牌")
					.set("ai", () => 0)
					.forResult();
				control = result?.control;
			}
			if (!control) return;
			const chosenType = Object.keys(typeNames).find((key) => typeNames[key] === control);
			const cards = player.getCards("h", (card) => {
				if (!get.is.shownCard(card)) return false;
				const t = get.type(card);
				return (t == "delay" ? "trick" : t) == chosenType;
			});
			if (!cards.length) return;
			await player.hideShownCards(cards, "visible_qunyou_mingce", "visible_qunyou_xianlv");
		},
		subSkill: {
			dying: {
				audio: "qunyou_dinglue",
				charlotte: true,
				trigger: { player: "dying" },
				direct: true,
				firstDo: true,
				filter(event, player) {
					return game.hasPlayer((current) => current != player);
				},
				async content(event, trigger, player) {
					const next = player.chooseTarget(true, "定略：令一名其他角色获得技能〖明策〗", (card, player2, target) => {
						return target != player2;
					});
					next.set("ai", (target) => get.attitude(get.player(), target));
					const result = await next.forResult();
					if (!result?.bool || !result.targets?.length) return;
					const target = result.targets[0];
					player.logSkill("qunyou_dinglue", target);
					target.addSkill("qunyou_mingce");
					game.log(target, "获得了技能", "#g【明策】");
				},
			},
		},
	},

// === 方圆 ===
	qunyou_fangyuan: {
		charlotte: true,
		locked: true,
		mod: {
			cardnumber(card) {
				if (get.position(card) != "h") return;
				if (typeof card.number != "number") return;
				if (get.is.shownCard(card)) {
					if (card.number != 13) return card.number + 1;
				} else if (card.hasGaintag("daozhi_tag")) {
					if (card.number != 1) return card.number - 1;
				}
			},
			ignoredHandcard(card) {
				return get.is.shownCard(card) || card.hasGaintag("daozhi_tag");
			},
		},
	},

// === 弦率 ===
	qunyou_xianlv: {
		audio: 2,
		group: ["qunyou_xianlv_use1", "qunyou_xianlv_gougu"],
		subSkill: {
			use1: {
				audio: "qunyou_xianlv",
				charlotte: true,
				trigger: { player: "useCardAfter" },
				direct: true,
				filter(event, player) {
					if (player.storage.qunyou_jingkuo_busy) return false;
					return player.hasCard((card) => !get.is.shownCard(card) && !card.hasGaintag("daozhi_tag"), "h");
				},
				async content(event, trigger, player) {
					const go = await player
						.chooseBool(get.prompt("qunyou_xianlv"), "你可以明置或倒置一张暗置手牌")
						.set("ai", () => get.player().countCards("h") < 5)
						.forResult();
					if (!go?.bool) return;
					const result = await player
						.chooseControl(["明置一张手牌", "倒置一张手牌"])
						.set("prompt", "弦率：请选择一项")
						.set("ai", () => 0)
						.forResult();
					if (!result?.control) return;
					const isMing = result.control == "明置一张手牌";
					const next = player.chooseCard(
						"h",
						true,
						"弦率：" + (isMing ? "明置" : "倒置") + "一张暗置手牌",
						(card) => !get.is.shownCard(card) && !card.hasGaintag("daozhi_tag")
					);
					next.set("ai", (card) => get.value(card));
					const result2 = await next.forResult();
					if (!result2?.cards?.length) return;
					const cards = result2.cards;
					player.logSkill("qunyou_xianlv");
					if (isMing) {
						await player.addShownCards(cards, "visible_qunyou_xianlv");
					} else {
						game.log(player, "倒置了", cards);
						game.broadcastAll((cards2) => cards2.forEach((card2) => card2.addGaintag("daozhi_tag")), cards);
					}
					await lib.skill.qunyou_jingkuo.update(player);
				},
			},
			gougu: {
				audio: "qunyou_xianlv",
				charlotte: true,
				trigger: { global: "useCard" },
				direct: true,
				filter(event, player) {
					if (player.storage.qunyou_jingkuo_busy) return false;
					if (!event.card) return false;
					const num = get.number(event.card);
					if (typeof num != "number") return false;
					const triples = [
						[3, 4, 5],
						[6, 8, 10],
						[5, 12, 13],
					];
					return triples.some((t) => {
						if (!t.includes(num)) return false;
						const rest = t.filter((x) => x != num);
						return (
							player.countCards("hes", (card) => get.number(card) == rest[0]) > 0 &&
							player.countCards("hes", (card) => get.number(card) == rest[1]) > 0
						);
					});
				},
				async content(event, trigger, player) {
					const num = get.number(trigger.card);
					const triples = [
						[3, 4, 5],
						[6, 8, 10],
						[5, 12, 13],
					];
					const validPairs = [];
					for (const t of triples) {
						if (!t.includes(num)) continue;
						const rest = t.filter((x) => x != num);
						if (
							player.countCards("hes", (card) => get.number(card) == rest[0]) > 0 &&
							player.countCards("hes", (card) => get.number(card) == rest[1]) > 0
						) {
							validPairs.push(rest);
						}
					}
					if (!validPairs.length) return;
					const go = await player
						.chooseBool(get.prompt("qunyou_xianlv"), "弃置两张点数与此牌点数构成勾股数的牌，然后摸三张牌")
						.set("ai", () => true)
						.forResult();
					if (!go?.bool) return;
					let pair = validPairs[0];
					if (validPairs.length > 1) {
						const ctrlResult = await player
							.chooseControl(validPairs.map((p) => p.join("和") + "点"))
							.set("prompt", "弦率：选择要弃置的勾股数组合")
							.set("ai", () => 0)
							.forResult();
						const idx = validPairs.findIndex((p) => p.join("和") + "点" == ctrlResult?.control);
						if (idx >= 0) pair = validPairs[idx];
					}
					player.logSkill("qunyou_xianlv");
					const r1 = await player
						.chooseCard("hes", true, "弦率：选择一张点数为" + pair[0] + "的牌", (card) => get.number(card) == pair[0])
						.forResult();
					if (!r1?.cards?.length) return;
					const r2 = await player
						.chooseCard(
							"hes",
							true,
							"弦率：选择一张点数为" + pair[1] + "的牌",
							(card) => get.number(card) == pair[1] && !r1.cards.includes(card)
						)
						.forResult();
					if (!r2?.cards?.length) return;
					await player.discard(r1.cards.concat(r2.cards));
					await player.draw(3);
				},
			},
		},
	},

// === 精括 ===
	qunyou_jingkuo: {
		audio: 2,
		group: ["qunyou_jingkuo_check"],
		mod: {
			cardEnabled(card) {
				if (card.storage && card.storage.qunyou_jingkuo_vcard) return true;
			},
		},
		onremove(player) {
			delete player.storage.qunyou_jingkuo_state;
			delete player.storage.qunyou_jingkuo_busy;
		},
		getCounts(player) {
			const counts = [0, 0, 0];
			for (const card of player.getCards("h")) {
				if (get.is.shownCard(card)) counts[1]++;
				else if (card.hasGaintag("daozhi_tag")) counts[2]++;
				else counts[0]++;
			}
			return counts;
		},
		async update(player) {
			if (!player.isIn()) return;
			const counts = lib.skill.qunyou_jingkuo.getCounts(player);
			const prev = player.storage.qunyou_jingkuo_state || null;
			player.storage.qunyou_jingkuo_state = counts;
			if (!prev) return;
			// 0,0,0（手牌为空）也视为三者相等；eq(prev) 保证同一相等态不重复结算
			const eq = (arr) => arr[0] == arr[1] && arr[1] == arr[2];
			if (!eq(counts) || eq(prev)) return;
			if (player.storage.qunyou_jingkuo_busy) return;
			player.storage.qunyou_jingkuo_busy = true;
			try {
				player.logSkill("qunyou_jingkuo");
				const tricks = get.inpile("trick").filter((name) => name != "wuxie");
				if (!tricks.length) return;
				const result = await player
					.chooseButton(["精括：视为使用一张普通锦囊牌", [tricks.map((name) => ["trick", "", name]), "vcard"]], true)
					.set("ai", () => 0)
					.forResult();
						if (!result?.bool || !result.links?.length) return;
						const vcard = get.autoViewAs(
							{ name: result.links[0][2], isCard: true, storage: { qunyou_jingkuo_vcard: true } },
							"unsure"
						);
						await player.chooseUseTarget({
							card: vcard,
							addCount: false,
							// prompt 不传：有目标牌走默认"选择【X】的目标"（content.js:2265），
							// 无中生有等自目标牌走默认"是否对自己使用"确认框（content.js:2207）
						});
					} finally {
				delete player.storage.qunyou_jingkuo_busy;
			}
		},
		subSkill: {
			check: {
				audio: "qunyou_jingkuo",
				charlotte: true,
				trigger: {
					player: ["loseAfter", "gainAfter", "addShownCardsAfter", "hideShownCardsAfter"],
					// 手牌数变化入口全家桶（知识库 #18）：装备/判定区/移出路径不走 loseAfter
					global: ["loseAsyncAfter", "equipAfter", "addJudgeAfter", "addToExpansionAfter"],
				},
				forced: true,
				popup: false,
				silent: true,
				filter(event, player) {
					if (event.name != "loseAsync") return true;
					const evt = event.getl ? event.getl(player) : null;
					return !!(evt && evt.hs && evt.hs.length);
				},
				async content(event, trigger, player) {
					await lib.skill.qunyou_jingkuo.update(player);
				},
			},
		},
	},

// === 武圣 ===
	qunyou_wusheng: {
		audio: 2,
		enable: ["chooseToUse", "chooseToRespond"],
		// 区域内存在红牌/伤害牌/基本牌任一，且至少能印出一种候选
		filter(event, player) {
			return lib.skill.qunyou_wusheng.getCandidateCards(event, player).length > 0;
		},
		// 红色基本牌（存在红色实体的基本牌）：桃/闪/酒/杀/火杀
		redBasics() {
			const list = ["tao", "shan", "jiu", "sha"];
			// 火杀（红色）；雷杀/冰杀无红色实体，不列入
			if (lib.inpile_nature.includes("fire")) list.push("sha_fire");
			return list;
		},
		// 生成"可印候选"：遍历牌堆牌池，按三组素材条件生成 [类型, "", 牌名, 属性, 组] 按钮数据
		getCandidateCards(event, player) {
			const list = [];
			const hasRed = player.hasCard((card) => get.color(card) === "red", "hes");
			const hasDamage = player.hasCard((card) => get.is.damageCard(card), "hes");
			const hasBasic = player.hasCard((card) => get.type(card) === "basic", "hes");
			// ①红牌 → 当【伤害+基本】的牌（杀及其属性变体，遍历牌堆）
			if (hasRed) {
				for (const name of lib.inpile) {
					if (get.type(name) != "basic" || !get.tag({ name }, "damage")) continue;
					if (event.filterCard(get.autoViewAs({ name, isCard: true }, "unsure"), player, event)) {
						list.push([get.translation(get.type(name)), "", name, "", "g1"]);
					}
				}
				// 杀属性变体（火/雷/冰杀）——红牌可印任意伤害基本牌
				for (const nature of lib.inpile_nature) {
					const vcard = get.autoViewAs({ name: "sha", nature, isCard: true }, "unsure");
					if (event.filterCard(vcard, player, event)) {
						list.push([get.translation(get.type("sha")), "", "sha", nature, "g1"]);
					}
				}
			}
			// ②伤害牌 → 当【红色+基本】的牌（红色基本牌=桃/闪/酒/杀/火杀，印出强制红）
			if (hasDamage) {
				for (const name of lib.skill.qunyou_wusheng.redBasics()) {
					const isFireSha = name == "sha_fire";
					const cardName = isFireSha ? "sha" : name;
					const nature = isFireSha ? "fire" : "";
					const vcard = get.autoViewAs({ name: cardName, nature, isCard: true, color: "red" }, "unsure");
					if (event.filterCard(vcard, player, event)) {
						list.push([get.translation(get.type(cardName)), "", cardName, nature, "g2"]);
					}
				}
			}
			// ③基本牌 → 当【红色+伤害】的牌（牌堆中非延时伤害牌，印出强制红；杀含火变体，雷/冰非红不列）
			if (hasBasic) {
				for (const name of lib.inpile) {
					if (get.type(name) == "delay" || !get.tag({ name }, "damage")) continue;
					const vcard = get.autoViewAs({ name, isCard: true, color: "red" }, "unsure");
					if (event.filterCard(vcard, player, event)) {
						list.push([get.translation(get.type(name)), "", name, "", "g3"]);
					}
				}
				// 红色伤害杀=火杀（雷/冰无红实体）
				if (lib.inpile_nature.includes("fire")) {
					const vcard = get.autoViewAs({ name: "sha", nature: "fire", isCard: true, color: "red" }, "unsure");
					if (event.filterCard(vcard, player, event)) {
						list.push([get.translation(get.type("sha")), "", "sha", "fire", "g3"]);
					}
				}
			}
			return list;
		},
		// 构建候选 vcard（组决定是否强制红、属性变体；格式参照原生义烈：[类型,"",牌名,属性,组]）
		makeVCard(buttonLink) {
			const [, , name, nature, group] = buttonLink;
			const forcedRed = group != "g1";
			return get.autoViewAs({ name, nature: nature || undefined, isCard: true, ...(forcedRed ? { color: "red" } : {}) }, "unsure");
		},
		chooseButton: {
			dialog(event, player) {
				const list = lib.skill.qunyou_wusheng.getCandidateCards(event, player);
				return ui.create.dialog("武圣", [list, "vcard"], "hidden");
			},
			filter(button, player) {
				const evt = _status.event.getParent();
				return evt.filterCard(lib.skill.qunyou_wusheng.makeVCard(button.link), player, evt);
			},
			check(button) {
				if (_status.event.getParent().type != "phase") return 1;
				const player = _status.event.player;
				return player.getUseValue(lib.skill.qunyou_wusheng.makeVCard(button.link), null, true);
			},
			backup(links, player) {
				const name = links[0][2];
				const nature = links[0][3] || "";
				const group = links[0][4];
				const forcedRed = group != "g1";
				return {
					audio: "qunyou_wusheng",
					filterCard(card) {
						if (group == "g1") return get.color(card) === "red";
						if (group == "g2") return get.is.damageCard(card);
						return get.type(card) === "basic";
					},
					selectCard: 1,
					position: "hes",
					viewAs: { name, nature, isCard: true, ...(forcedRed ? { color: "red" } : {}) },
					popname: true,
				};
			},
			prompt(links, player) {
				const name = links[0][2];
				const nature = links[0][3] || "";
				return "将一张红色/伤害/基本牌当" + (nature ? get.translation(nature) : "") + "【" + get.translation(name) + "】使用或打出";
			},
		},
		hiddenCard(player, name) {
			// 只能声明牌堆中存在的牌名
			if (!lib.inpile?.includes(name)) return false;
			if (name == "sha") {
				// 杀可被红牌/伤害牌/基本牌印出（含属性变体）
				return (
					player.hasCard((card) => get.color(card) === "red", "hes") ||
					player.hasCard((card) => get.tag(card, "damage"), "hes") ||
					player.hasCard((card) => get.type(card) === "basic", "hes")
				);
			}
			if (get.type(name) == "basic") {
				// 基本牌可被伤害牌印出（红色基本牌）
				return player.hasCard((card) => get.is.damageCard(card), "hes");
			}
			if (get.type(name) != "delay" && get.tag({ name }, "damage")) {
				// 伤害牌可被基本牌印出（红色伤害牌）
				return player.hasCard((card) => get.type(card) === "basic", "hes");
			}
			return false;
		},
		ai: {
			respondSha: true,
			respondShan: true,
			save: true,
			order: 5,
			result: { player: 1 },
			skillTagFilter(player, tag, arg) {
				if (!player.countCards("hes")) return false;
				if (tag == "respondSha" || tag == "respondShan" || tag == "save") return true;
				return false;
			},
		},
	},

// === 逾围 ===
	xuandie_yuwei: {
		audio: 2,
		enable: "chooseToUse",
		position: "h",
		filter(event, player) {
			// 有可“以移出方式使用”的手牌（任意牌型；可用性由 event.filterCard 按牌面探测）
			// 防自递归：本技能自身的选择流程事件里 event.filterCard 已是本技能过滤层的包装，不能再调
			const inner = event.skill == "xuandie_yuwei";
			return player.hasCard((card) => inner || event.filterCard(card, player, event), "h");
		},
		filterCard(card, player, event) {
			event = event || _status.event;
			// 防自递归：同上（gameEvent.js:761 会把本技能 filterCard 包装为事件的 filterCard/filterCard2）
			if (event && (event.skill == "xuandie_yuwei" || event._skill == "xuandie_yuwei")) return true;
			return event.filterCard(card, player, event);
		},
		selectCard: 1,
		viewAs(cards, player) {
			// 以牌面本身使用：透传牌名/属性/花色/点数
			const card = cards && cards[0];
			if (!card) {
				// 点击/缓存期尚无选中材料：返回占位（选中材料后引擎会实时按真牌重算）
				return { name: "sha", isCard: true };
			}
			return get.autoViewAs({ name: get.name(card), nature: get.nature(card), suit: get.suit(card), number: get.number(card), isCard: true }, cards);
		},
		async precontent(event, trigger, player) {
			// 以移出方式使用：牌先置于武将牌上（移出游戏，官方笔伐/威肆同款 addToExpansion），再结算
			const cards = event.result?.cards || [];
			if (!cards.length) return;
			const card = cards[0];
			player.addToExpansion(card);
			const type = get.type(card);
			if (type == "basic" || type == "trick") {
				// 基本牌/普通锦囊：以无实体材料的虚拟牌结算，实体牌留在武将牌上
				event.result.card = get.autoViewAs({ name: get.name(card), nature: get.nature(card), suit: get.suit(card), number: get.number(card), isCard: true });
				event.result.cards = [];
			}
			// 装备牌/延时锦囊：保留实体牌参与结算，结算时由引擎带入装备区/判定区（“去它该去的地方”）
		},
		check(card) {
			if (_status.event.type != "phase") return 1;
			return get.order(card);
		},
		prompt(event, player) {
			if (lib.config.extension_群友设计_xuandie_xunguan == "false") {
				return "逾围：以移出方式使用一张牌，摸牌至X张（X为此牌点数），本技能失效至你使用X张牌，失效X回合后失去、失去X回合后获得";
			}
			return "逾围：以移出方式使用一张牌，摸牌至X张（X为此牌点数），本技能失效至你使用X张牌，失效X回合后失去";
		},
		ai: {
			order: 4,
			result: { player: 1 },
		},
		// ⚠️ count 不可放进主技能 group：awakenSkill 的 disableSkill 会递归失效 group 子技能（player.js:11249），
		// 计数器将永不触发；须由 effect.content 动态 addSkill 独立挂载。
		// restore/lose 为纯标记定义（不 addSkill，面板无条目），挂在 count 的 group 下进入 expandSkills 名单，
		// 躲过 checkMarks 清扫（player.js:11271），"复/失"气泡才能在失效期存活
		group: ["xuandie_yuwei_effect"],
		subSkill: {
			effect: {
				// 使用后：摸牌至X张并封印本技能
				forced: true,
				trigger: { player: "useCardAfter" },
				filter(event, player) {
					return event.skill == "xuandie_yuwei" && get.number(event.card) > 0;
				},
async content(event, trigger, player) {
						const X = get.number(trigger.card);
						await player.drawTo(X);
						// 完全体：保存X供"获"阶段使用
						if (lib.config.extension_群友设计_xuandie_xunguan == "false") {
							player.storage.xuandie_yuwei_getX = X;
						}
						// 用 awakenSkill/restoreSkill 对：与已用限定技/昂扬技同款的失效变灰显示
						player.awakenSkill("xuandie_yuwei");
						player.addSkill("xuandie_yuwei_count");
						// 数值标记：addMark/removeMark 自带实时刷新
						player.addMark("xuandie_yuwei_restore", X, false);
						player.addMark("xuandie_yuwei_lose", X, false);
					},
			},
			count: {
				// 封印计数：使用X张牌后恢复；失效X个回合后永久失去（完全体：失去X回合后重新获得）
				name: "逾围",
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				onremove: true,
				// 携带"复/失"两个纯标记定义：进入 expandSkills 名单，防止 checkMarks 清掉气泡
				// "获"mark 由 gettimer 独立管理（不放在这里，因为失去技能时要清掉一切）
				group: ["xuandie_yuwei_restore", "xuandie_yuwei_lose"],
				trigger: { player: "useCard1", global: "phaseBeginStart" },
				filter(event, player) {
					return player.awakenedSkills.includes("xuandie_yuwei");
				},
				async content(event, trigger, player) {
					if (event.triggername == "useCard1") {
						player.removeMark("xuandie_yuwei_restore", 1, false);
						if (player.countMark("xuandie_yuwei_restore") <= 0) {
							// 解封（restoreSkill 与 awakenSkill 对应，技能名恢复正常显示）
							player.restoreSkill("xuandie_yuwei", true);
							player.unmarkSkill("xuandie_yuwei_restore");
							player.unmarkSkill("xuandie_yuwei_lose");
							player.removeSkill("xuandie_yuwei_count");
							game.log(player, "的技能", "#g【逾围】", "恢复了");
						}
					} else {
						player.removeMark("xuandie_yuwei_lose", 1, false);
						if (player.countMark("xuandie_yuwei_lose") <= 0) {
							if (lib.config.extension_群友设计_xuandie_xunguan == "false") {
								// 完全体：先像普通版一样完全清理技能（面板消失+mark全清）
								const X = player.storage.xuandie_yuwei_getX || 1;
								player.removeSkills("xuandie_yuwei");
								player.unmarkSkill("xuandie_yuwei_restore");
								player.unmarkSkill("xuandie_yuwei_lose");
								player.unmarkSkill("xuandie_yuwei_get");
								player.removeSkill("xuandie_yuwei_count");
								// 再开独立"获"计时器
								player.addSkill("xuandie_yuwei_gettimer");
								player.addMark("xuandie_yuwei_get", X, false);
								game.log(player, "的技能", "#g【逾围】", "将在" + X + "个回合后重新获得");
							} else {
								// 普通版：永久失去
								player.removeSkills("xuandie_yuwei");
								player.unmarkSkill("xuandie_yuwei_restore");
								player.unmarkSkill("xuandie_yuwei_lose");
								player.unmarkSkill("xuandie_yuwei_get");
								player.removeSkill("xuandie_yuwei_count");
								game.log(player, "失去了技能", "#g【逾围】");
							}
						}
					}
				},
				onremove(player, skill) {
					delete player.storage.xuandie_yuwei_restore;
					delete player.storage.xuandie_yuwei_lose;
					delete player.storage.xuandie_yuwei_get;
					delete player.storage.xuandie_yuwei_getX;
				},
			},
			gettimer: {
				// 完全体专属：失效X回合后重新获得的倒计时器
				// 独立于 count（count 会在"失"→0时被 removeSkill 清理），单独监听回合
				name: "逾围",
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				trigger: { global: "phaseBeginStart" },
				filter(event, player) {
					return player.countMark("xuandie_yuwei_get") > 0;
				},
				async content(event, trigger, player) {
					player.removeMark("xuandie_yuwei_get", 1, false);
					if (player.countMark("xuandie_yuwei_get") <= 0) {
						// 重新获得：清除 awakened 状态，恢复技能
						player.awakenedSkills.remove("xuandie_yuwei");
						player.addSkill("xuandie_yuwei");
						player.unmarkSkill("xuandie_yuwei_get");
						player.removeSkill("xuandie_yuwei_gettimer");
						game.log(player, "的技能", "#g【逾围】", "重新获得了");
					}
				},
				onremove(player, skill) {
					delete player.storage.xuandie_yuwei_get;
					delete player.storage.xuandie_yuwei_getX;
				},
			},
			restore: {
				// 恢复倒计时标记（markcount = storage 数值，addMark/removeMark 实时刷新）
				name: "逾围",
				mark: true,
				marktext: "复",
				intro: {
					content(storage, player) {
						return "还需使用" + storage + "张牌，〖逾围〗才能恢复";
					},
				},
			},
			lose: {
				// 失去倒计时标记
				name: "逾围",
				mark: true,
				marktext: "失",
				intro: {
					content(storage, player) {
						return "〖逾围〗失效" + storage + "个回合后失去";
					},
				},
			},
			get: {
				// 获得倒计时标记（完全体专属）
				name: "逾围",
				mark: true,
				marktext: "获",
				intro: {
					content(storage, player) {
						return "〖逾围〗将在" + storage + "个回合后重新获得";
					},
				},
			},
		},
	},

// === 君侧 ===
	xuandie_junce: {
		audio: 2,
		enable: "chooseToUse",
		init(player) {
			if (!player.storage.xuandie_junce_sides) {
				player.storage.xuandie_junce_sides = [
					["sha", "jiu", "tiesuo"],
					["shan", "tao", "guohe"],
				];
			}
		},
		filter(event, player) {
			// 防自递归：本技能自身的选择流程事件里 event.filterCard 已是本技能过滤层的包装，不能再调（逾围同款）
			if (event.skill == "xuandie_junce" || event._skill == "xuandie_junce") {
				return player.getCards("hes").some((card) => xuandie_junce_sideIndexOf(player, get.name(card, player)) >= 0);
			}
			// 材料须属于某一侧；其另一侧的牌名（单牌名侧视为【无中生有】）中存在当前可使用的候选
			const sides = xuandie_junce_getSides(player);
			return player.getCards("hes").some((card) => {
				const idx = xuandie_junce_sideIndexOf(player, get.name(card, player));
				if (idx < 0) return false;
				const other = sides[1 - idx];
				const names = other.length == 1 ? ["wuzhong"] : other;
				return names.some((name) => event.filterCard(get.autoViewAs({ name }, "unsure"), player, event));
			});
		},
		chooseButton: {
			dialog(event, player) {
				const sides = xuandie_junce_getSides(player);
				// 单牌名侧的候选显示为【无中生有】（光环）
				const list0 = get.inpileVCardList((info) => (sides[0].length == 1 ? ["wuzhong"] : sides[0]).includes(info[2]));
				const list1 = get.inpileVCardList((info) => (sides[1].length == 1 ? ["wuzhong"] : sides[1]).includes(info[2]));
				const args = ["君侧：选择转化后的牌名"];
				if (list0.length) {
					args.push('<div class="text center">甲侧牌名（以乙侧的牌使用）</div>', [list0, "vcard"]);
				}
				if (list1.length) {
					args.push('<div class="text center">乙侧牌名（以甲侧的牌使用）</div>', [list1, "vcard"]);
				}
				return ui.create.dialog(...args);
			},
			check(button) {
				if (_status.event.getParent().type != "phase") return 1;
				return get.player().getUseValue(get.autoViewAs({ name: button.link[2] }, null, true));
			},
			backup(links, player) {
				const info = links[0];
				const displayName = info[2];
				const sides = xuandie_junce_getSides(player);
				let targetName = displayName;
				if (displayName == "wuzhong") {
					// 光环候选：还原为单牌名侧的原名牌名
					const single = sides.find((side) => side.length == 1);
					targetName = single ? single[0] : displayName;
				}
				const targetIdx = sides.findIndex((side) => side.includes(targetName));
				return {
					audio: "xuandie_junce",
					// 材料须在目标牌名的另一侧
					filterCard(card, player2) {
						return xuandie_junce_sideIndexOf(player2, get.name(card, player2)) == 1 - targetIdx;
					},
					selectCard: 1,
					position: "hes",
					viewAs: { name: displayName, isCard: true, storage: { xuandie_junce_target: targetName } },
					popname: true,
				};
			},
			prompt(links) {
				const info = links[0];
				const displayName = info[2];
				const shown = displayName == "wuzhong" ? "【无中生有】（原牌名见技能描述）" : "【" + get.translation(displayName) + "】";
				return "君侧：将另一侧的一张牌当" + shown + "使用，结算后你可以选择将两个牌名移至同侧";
			},
		},
		ai: {
			order: 5,
			result: { player: 1 },
		},
		group: ["xuandie_junce_move"],
		subSkill: {
			move: {
				// 转化牌使用结算后：选择将两个牌名之一移至对方所在一侧（单牌名侧的牌名不能移出，唯一合法项自动执行）
				charlotte: true,
				direct: true,
				trigger: { player: "useCardAfter" },
				filter(event, player) {
					return event.card?.storage?.xuandie_junce_target && event.cards?.length;
				},
				async content(event, trigger, player) {
					const sides = xuandie_junce_getSides(player);
					const fromName = get.name(trigger.cards[0], player); // 转换前的牌名
					const toName = trigger.card.storage.xuandie_junce_target; // 转换后的牌名（光环时为原名）
					const iFrom = sides.findIndex((side) => side.includes(fromName));
					const iTo = sides.findIndex((side) => side.includes(toName));
					if (iFrom < 0 || iTo < 0 || iFrom == iTo) return;
					const canA = sides[iTo].length > 1; // 将转换后牌名移向转换前牌名一侧
					const canB = sides[iFrom].length > 1; // 将转换前牌名移向转换后牌名一侧
					let opt = -1;
					if (canA && canB) {
						const result = await player
							.chooseControl()
							.set("choiceList", [
								"将【" + get.translation(toName) + "】移至【" + get.translation(fromName) + "】所在一侧",
								"将【" + get.translation(fromName) + "】移至【" + get.translation(toName) + "】所在一侧",
							])
							.set("prompt", "君侧：请选择移至同侧的方式")
							.set("ai", () => 0)
							.forResult();
						opt = result.index;
					} else if (canA) {
						opt = 0;
					} else if (canB) {
						opt = 1;
					}
					if (opt == 0) {
						sides[iTo].remove(toName);
						sides[iFrom].push(toName);
						game.log(player, "将", "#g【" + get.translation(toName) + "】", "移至了", "#g【" + get.translation(fromName) + "】", "所在一侧");
					} else if (opt == 1) {
						sides[iFrom].remove(fromName);
						sides[iTo].push(fromName);
						game.log(player, "将", "#g【" + get.translation(fromName) + "】", "移至了", "#g【" + get.translation(toName) + "】", "所在一侧");
					}
				},
			},
		},
	},

// === 相赴 ===
	xuandie_xiangfu: {
		audio: 2,
		enable: "chooseToUse",
		filter(event, player) {
			// 防自递归：自身选择流程里 event.filterCard 已被包装为备份的过滤层（恒 false），跳过常规可用性探测
			if (event.skill == "xuandie_xiangfu" || event._skill == "xuandie_xiangfu") {
				const used = player.storage.xuandie_xiangfu_used || [];
				return [0, 1, 2, 3].some(
					(cat) =>
						!used.includes(cat) &&
						game.hasPlayer((current) => {
							if (current == player) return false;
							const dOld = player.countCards("h") - current.countCards("h");
							return xuandie_xiangfu_category(dOld, xuandie_xiangfu_diffAfter(dOld)) == cat;
						})
				);
			}
			// 任一类别：本轮未用 + 存在能产生该结果的搭档 + 该牌常规可用（桃需已受伤，闪不可主动使用）
			const used = player.storage.xuandie_xiangfu_used || [];
			return game.hasPlayer((current) => {
				if (current == player) return false;
				const dOld = player.countCards("h") - current.countCards("h");
				const cat = xuandie_xiangfu_category(dOld, xuandie_xiangfu_diffAfter(dOld));
				if (used.includes(cat)) return false;
				return event.filterCard(get.autoViewAs({ name: XUANDIE_XIANGFU_NAMES[cat] }, "unsure"), player, event);
			});
		},
		chooseButton: {
			dialog(event, player) {
				const used = player.storage.xuandie_xiangfu_used || [];
				const cats = [0, 1, 2, 3].filter((cat) => {
					if (used.includes(cat)) return false;
					if (!event.filterCard(get.autoViewAs({ name: XUANDIE_XIANGFU_NAMES[cat] }, "unsure"), player, event)) return false;
					return game.hasPlayer((current) => {
						if (current == player) return false;
						const dOld = player.countCards("h") - current.countCards("h");
						return xuandie_xiangfu_category(dOld, xuandie_xiangfu_diffAfter(dOld)) == cat;
					});
				});
				const list = get.inpileVCardList((info) => cats.includes(XUANDIE_XIANGFU_NAMES.indexOf(info[2])));
				return ui.create.dialog(
					"相赴：调整手牌，视为使用基本牌（相思·杀｜相逢·酒｜相失·闪｜相守·桃）",
					[list, "vcard"]
				);
			},
			check(button) {
				if (_status.event.getParent().type != "phase") return 1;
				return get.player().getUseValue(get.autoViewAs({ name: button.link[2] }, null, true));
			},
			backup(links, player) {
				const name = links[0][2];
				return {
					audio: "xuandie_xiangfu",
					filterCard: () => false,
					selectCard: 0,
					viewAs: { name, isCard: true, storage: { xuandie_xiangfu: true } },
					log: false,
					async precontent(event, trigger, player) {
						const cat = XUANDIE_XIANGFU_NAMES.indexOf(name);
						// 选搭档（其手牌数差值变化须产生该结果）
						const result = await player
							.chooseTarget(true, "相赴：选择一名角色，与其将手牌向彼此调整一张", (card, player2, target) => {
								if (target == player2) return false;
								const dOld = player2.countCards("h") - target.countCards("h");
								return xuandie_xiangfu_category(dOld, xuandie_xiangfu_diffAfter(dOld)) == cat;
							})
							.set("ai", (target) => {
								// 调整使手牌少者得牌、多者弃牌： uniformly 偏好态度较低（敌方）的搭档
								return -get.attitude(get.player(), target);
							})
							.forResult();
						const partner = result?.targets?.[0];
						if (!partner) {
							event.cancel();
							return;
						}
						// 一心：仅首任搭档获得〖相赴〗；本体换搭档或借用者选错人，持有者均永久失去，此后不再授予任何人
						const owner = game.findPlayer((cur) => cur.hasSkill("xuandie_yixin"));
						if (player.hasSkill("xuandie_yixin")) {
							const state = (player.storage.xuandie_yixin ||= { first: null, holder: null, banned: [] });
							if (!state.holder) {
								if (!state.first) {
									// 首任搭档：唯一一次授予
									state.first = partner;
									state.holder = partner;
									partner.addSkill("xuandie_xiangfu");
									game.log(partner, "视为拥有", "#g【相赴】");
								}
							} else if (partner != state.holder) {
								// 本体换搭档：当前持有者永久失去，不再授予任何人
								state.holder.removeSkill("xuandie_xiangfu");
								if (!state.banned.includes(state.holder)) state.banned.push(state.holder);
								game.log(state.holder, "永久失去", "#g【相赴】");
								state.holder = null;
							}
						} else if (owner && player != owner) {
							const state = (owner.storage.xuandie_yixin ||= { first: null, holder: null, banned: [] });
							if (partner != owner && state.holder == player) {
								// 借用者相赴时未选择本体：永久失去，不再授予任何人
								player.removeSkill("xuandie_xiangfu");
								if (!state.banned.includes(player)) state.banned.push(player);
								state.holder = null;
								game.log(player, "因〖相赴〗未选择", owner, "，永久失去", "#g【相赴】");
							}
						}
						// 双向调整：手牌少者摸一张，多者弃一张（自选），相等则均不变
						const dOld = player.countCards("h") - partner.countCards("h");
						if (dOld > 0) {
							await player.chooseToDiscard(1, "h", true);
							await partner.draw();
						} else if (dOld < 0) {
							await player.draw();
							await partner.chooseToDiscard(1, "h", true);
						}
						// 每轮各限一次（各使用者独立计数）
						(player.storage.xuandie_xiangfu_used ||= []).push(cat);
					},
				};
			},
			prompt(links) {
				return "相赴：与一名其他角色将手牌向彼此调整一张，按差值变化视为使用【" + get.translation(links[0][2]) + "】";
			},
		},
		ai: {
			order: 5,
			result: { player: 1 },
		},
		group: ["xuandie_xiangfu_reset"],
		subSkill: {
			reset: {
				// 每轮各限一次：轮次开始清空（本体与借用者各自独立）
				charlotte: true,
				trigger: { global: "roundStart" },
				forced: true,
				popup: false,
				silent: true,
				filter(event, player) {
					return player.storage.xuandie_xiangfu_used?.length;
				},
				content(event, trigger, player) {
					player.storage.xuandie_xiangfu_used = [];
				},
			},
		},
	},

// === 一心 ===
	xuandie_yixin: {
		locked: true,
		mark: true,
		marktext: "一",
		intro: {
			content(storage, player) {
				const state = player.storage.xuandie_yixin;
				if (!state?.first) return "当前没有参与过〖相赴〗的其他角色";
				const holder = state.holder ? "当前持有者：" + get.translation(state.holder) + "（视为拥有〖相赴〗）" : "〖相赴〗已被永久失去，不再有任何角色获得";
				const banned = state.banned?.length ? "；已永久失去者：" + state.banned.map((cur) => get.translation(cur)).join("、") : "";
				return "首任搭档：" + get.translation(state.first) + "；" + holder + banned;
			},
		},
		// 授予/转移/永久收回逻辑实现于〖相赴〗的 precontent（搭档选择发生在彼处，一心为其锁定声明与状态展示）
	},

// === 击楫 ===
	xuandie_jiji: {
		audio: 2,
		// 行三仅可「使用」（无懈窗口/濒死求桃走 chooseToUse），不可打出，故无 chooseToRespond
		enable: ["chooseToUse"],
		// 「击」标记：三行发动次数（行三可发动时击字变红，见 xuandie_jiji_refreshMark）
		mark: true,
		intro: {
			content(storage, player) {
				const counts = player.storage.xuandie_jiji_counts || [0, 0, 0];
				return "移出/移去 " + counts[0] + " 次；摸牌 " + counts[1] + " 次；视为使用 " + counts[2] + " 次";
			},
		},
		init(player) {
			player.storage.xuandie_jiji_counts ||= [0, 0, 0];
			// 先创建「楫」标记，随后自动创建的「击」标记（本技能 mark）自然位于其上方
			player.markSkill("xuandie_jiji_markCard");
			xuandie_jiji_refreshMark(player);
		},
		// 行三：视为使用一张移出牌（虚拟使用，牌留在武将牌上；无懈/桃/闪经事件探测自然接通）
		filter(event, player) {
			if (event.skill == "xuandie_jiji" || event._skill == "xuandie_jiji") {
				// 自身选择流程：跳过常规可用性探测（彼时 event.filterCard 已被包装），仅查次数与移出牌
				const counts = player.storage.xuandie_jiji_counts || [0, 0, 0];
				if (!(counts[2] <= counts[0] && counts[2] <= counts[1])) return false;
				return player.countExpansions("xuandie_jiji_markCard") > 0;
			}
			const counts = player.storage.xuandie_jiji_counts || [0, 0, 0];
			// 本行次数不超过其余两行（允许并列）
			if (!(counts[2] <= counts[0] && counts[2] <= counts[1])) return false;
			const exps = player.getExpansions("xuandie_jiji_markCard");
			if (!exps.length) return false;
			return exps.some((card) => event.filterCard(get.autoViewAs({ name: get.name(card) }, "unsure"), player, event));
		},
		// hiddenCard 必须位于技能顶层：引擎 hasUsableCard/hasWuxie 预检只读 info.hiddenCard（player.js:2988），
		// 写在 ai 内不被消费
		hiddenCard(player, name) {
			const counts = player.storage.xuandie_jiji_counts || [0, 0, 0];
			if (!(counts[2] <= counts[0] && counts[2] <= counts[1])) return false;
			return player.getExpansions("xuandie_jiji_markCard").some((card) => get.name(card) == name);
		},
		chooseButton: {
			dialog(event, player) {
				const exps = player.getExpansions("xuandie_jiji_markCard");
				const seen = new Set();
				const list = [];
				for (const card of exps) {
					const name = get.name(card);
					const nature = get.nature(card);
					const key = name + (nature || "");
					if (seen.has(key)) continue;
					seen.add(key);
					list.push([get.type(name), "", name, nature]);
				}
				return ui.create.dialog("击楫：视为使用一张移出牌", [list, "vcard"]);
			},
			check(button) {
				if (_status.event.getParent().type != "phase") return 1;
				return get.player().getUseValue(get.autoViewAs({ name: button.link[2], nature: button.link[3] }, null, true));
			},
			backup(links, player) {
				return {
					audio: "xuandie_jiji",
					filterCard: () => false,
					selectCard: 0,
					viewAs: { name: links[0][2], nature: links[0][3], isCard: true, storage: { xuandie_jiji_line3: true } },
					log: false,
					async precontent(event, trigger, player) {
						player.logSkill("xuandie_jiji");
						const counts = (player.storage.xuandie_jiji_counts ||= [0, 0, 0]);
						counts[2]++;
						xuandie_jiji_refreshMark(player);
					},
				};
			},
			prompt(links) {
				return "击楫：视为使用一张移出牌【" + get.translation(links[0][2]) + "】（牌留在武将牌上）";
			},
		},
		ai: {
			order: 5,
			// 卫境同款接口：respondSha/respondShan 标签是“使用型”询问的可达开关（本引擎闪响应即使用闪，
			// 走 chooseToUse(type respondShan)），skillTagFilter 排除打出型检查（arg === "respond"）；
			// save 打开濒死求桃询问（canSave）；hiddenCard 见技能顶层（喂 hasWuxie 无懈预检）
			respondSha: true,
			respondShan: true,
			save: true,
			skillTagFilter(player, tag, arg) {
				const counts = player.storage.xuandie_jiji_counts || [0, 0, 0];
				// 行三当前可发动（次数不超过其余两行）
				if (!(counts[2] <= counts[0] && counts[2] <= counts[1])) return false;
				const names = player.getExpansions("xuandie_jiji_markCard").map((card) => get.name(card));
				if (tag == "save") {
					// arg 为濒死角色对象
					return names.includes("tao");
				}
				// 仅使用：打出型检查不放行
				if (arg === "respond") return false;
				switch (tag) {
					case "respondSha":
						return names.includes("sha");
					case "respondShan":
						return names.includes("shan");
				}
				return false;
			},
			result: {
				player(player) {
					if (_status.event.type == "dying") {
						return get.attitude(player, _status.event.dying);
					}
					return 1;
				},
			},
		},
		group: ["xuandie_jiji_move", "xuandie_jiji_draw", "xuandie_jiji_markCard"],
		subSkill: {
			move: {
				// 行一：当即时牌进入弃牌堆后，移出（手牌/装备区同名牌置于武将牌上）或移去（武将牌上同名牌置于弃牌堆）
				audio: "xuandie_jiji",
				name: "击楫",
				charlotte: true,
				direct: true,
				trigger: { global: ["loseAfter", "loseAsyncAfter", "cardsDiscardAfter", "equipAfter"] },
				filter(event, player) {
					return event.getd?.().some((card) => {
						const name = get.name(card, false);
						if (get.type(name) != "basic" && get.type(name) != "trick") return false; // 即时牌
						if (player.getCards("he").some((c) => get.name(c, player) == name)) return true;
						return player.getExpansions("xuandie_jiji_markCard").some((c) => get.name(c) == name);
					});
				},
				async content(event, trigger, player) {
					const entered = trigger.getd().filter((card) => {
						const name = get.name(card, false);
						if (get.type(name) != "basic" && get.type(name) != "trick") return false;
						return player.getCards("he").some((c) => get.name(c, player) == name) || player.getExpansions("xuandie_jiji_markCard").some((c) => get.name(c) == name);
					});
					const names = [...new Set(entered.map((card) => get.name(card, false)))];
					let targetName;
					if (names.length > 1) {
						const pick = await player
							.chooseButton(["击楫：有即时牌进入弃牌堆，选择一张进行移出/移去", [names.map((n) => [get.type(n), "", n]), "vcard"]], true)
							.set("ai", (button) => get.player().getUseValue({ name: button.link[2] }))
							.forResult();
						targetName = pick?.links?.[0]?.[2];
						if (!targetName) return;
					} else {
						targetName = names[0];
					}
					const outs = player.getCards("he").filter((c) => get.name(c, player) == targetName);
					const ins = player.getExpansions("xuandie_jiji_markCard").filter((c) => get.name(c) == targetName);
					// direct + chooseBool 交待信息：双向、仅可移出、仅可移去三种措辞
					let boolPrompt;
					if (outs.length && ins.length) {
						boolPrompt = "击楫：是否移出或移去一张【" + get.translation(targetName) + "】？";
					} else if (outs.length) {
						boolPrompt = "击楫：是否移出一张【" + get.translation(targetName) + "】（置于武将牌上）？";
					} else {
						boolPrompt = "击楫：是否移去武将牌上的一张【" + get.translation(targetName) + "】（置于弃牌堆）？";
					}
					const result = await player.chooseBool(boolPrompt).set("ai", () => true).forResult();
					if (!result?.bool) return;
					player.logSkill("xuandie_jiji_move");
					let moveOut = outs.length > 0;
					if (outs.length && ins.length) {
						const ctrl = await player
							.chooseControl(["移出：将一张同名牌置于武将牌上", "移去：将武将牌上的一张同名牌置于弃牌堆"])
							.set("prompt", "击楫：请选择方式")
							.set("ai", () => 0)
							.forResult();
						moveOut = ctrl.control.startsWith("移出");
					}
					if (moveOut) {
						let card = outs[0];
						if (outs.length > 1) {
							const pick = await player.chooseCard("he", true, "击楫：选择移出的一张同名牌", (c) => outs.includes(c)).forResult();
							card = pick?.cards?.[0] ?? card;
						}
						if (card) await player.addToExpansion({ cards: [card], source: player, animate: "give", gaintag: ["xuandie_jiji_markCard"] });
					} else {
						let card = ins[0];
						if (ins.length > 1) {
							const pick = await player.chooseButton(["击楫：选择移去的一张同名牌", ins], true).set("ai", (button) => get.value(button.link)).forResult();
							card = pick?.links?.[0] ?? card;
						}
						if (card) await player.loseToDiscardpile({ cards: [card] });
					}
					const counts = (player.storage.xuandie_jiji_counts ||= [0, 0, 0]);
					counts[0]++;
					xuandie_jiji_refreshMark(player);
				},
			},
			draw: {
				// 行二（蒺藜式）：本回合使用第X张牌后（X=移出牌数），可以摸牌至X张
				audio: "xuandie_jiji",
				name: "击楫",
				charlotte: true,
				direct: true,
				trigger: { player: "useCardAfter" },
				filter(event, player) {
					const X = player.countExpansions("xuandie_jiji_markCard");
					if (X < 1) return false;
					if (player.getHistory("useCard").length != X) return false;
					return player.countCards("h") < X;
				},
				async content(event, trigger, player) {
					const X = player.countExpansions("xuandie_jiji_markCard");
					const result = await player
						.chooseBool("击楫：你本回合已使用了第" + X + "张牌，是否摸牌至" + X + "张？")
						.set("ai", () => true)
						.forResult();
					if (!result?.bool) return;
					player.logSkill("xuandie_jiji_draw");
					const counts = (player.storage.xuandie_jiji_counts ||= [0, 0, 0]);
					counts[1]++;
					xuandie_jiji_refreshMark(player);
					await player.drawTo(X);
				},
			},
			markCard: {
				// 「楫」标记：显示武将牌上的移出牌牌面
				name: "击楫",
				charlotte: true,
				mark: true,
				intro: {
					content: "expansion",
					markcount: "expansion",
				},
			},
		},
	},

// === 疏守 ===
	qunyou_shushou: {
		audio: 2,
		locked: true,
		forced: true,
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			// 每回合使用前四张牌各触发一次（第3项执行后计数清零，窗口重新可用）
			return (player.storage.qunyou_shushou_used || 0) <= 4;
		},
		async content(event, trigger, player) {
			// X = 所使用牌的牌名字数（按显示名计）
			const X = get.translation(get.name(trigger.card)).length;
			const items = ["draw", "discard", "reset", "none"];
			// 循环执行：指针从首项开始，可执行则执行并计 1 次，无法执行则跳回首项不计数，直至执行满 X 次
			const executedItems = [];
			let ptr = 0;
			for (let done = 0; done < X; ) {
				const item = items[ptr];
				let executed = false;
				if (item == "draw") {
					await player.draw();
					executed = true;
				} else if (item == "discard") {
					if (player.countCards("h") >= 4) {
						await player.chooseToDiscard(4, "h", true);
						executed = true;
					}
				} else if (item == "reset") {
					// 视为未使用过牌：清空本技能计数与本回合用牌 stat（次数限制等随之归零）
					player.storage.qunyou_shushou_used = 0;
					const stat = player.getStat("card");
					for (const key in stat) {
						delete stat[key];
					}
					executed = true;
				}
				// 第4项“此项无法执行”恒不可执行
				if (executed) {
					done++;
					executedItems.push(ptr + 1);
					ptr = (ptr + 1) % 4;
				} else {
					ptr = 0;
				}
			}
			console.log("[疏守] X=" + X + "，依次执行项（1摸一张牌/2弃置四张手牌/3视为未使用过牌）：" + executedItems.join(","));
		},
		group: ["qunyou_shushou_record"],
		subSkill: {
			record: {
				// 每回合用牌计数（第3项执行后清零；回合开始清零）
				name: "疏守",
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				trigger: { player: "useCard1", global: "phaseBeginStart" },
				content(event, trigger, player) {
					if (event.triggername == "useCard1") {
						player.storage.qunyou_shushou_used = (player.storage.qunyou_shushou_used || 0) + 1;
					} else {
						delete player.storage.qunyou_shushou_used;
					}
				},
			},
		},
	},

// === 懷綏 ===
	qunyou_huaisui: {
		audio: 2,
		enable: "phaseUse",
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		intro: {
			content(storage) {
				return  (storage ? "阴：将一张黑牌当【兵粮寸断】使用" : "阳：将一张红牌当【远交近攻】使用") + "，并令手牌数小于你的目标摸一张牌。";
			},
		},
		filter(event, player) {
			const bool = player.storage.qunyou_huaisui;
			const name = bool ? "bingliang" : "yuanjiao";
			const color = bool ? "black" : "red";
			if (!player.countCards("hes", (card) => get.color(card, player) == color)) {
				return false;
			}
			const vcard = get.autoViewAs({ name, isCard: true }, "unsure");
			return player.hasUseTarget(vcard);
		},
		filterCard(card, player) {
			const bool = player.storage.qunyou_huaisui;
			return get.color(card, player) == (bool ? "black" : "red");
		},
		position: "hes",
		viewAs(cards, player) {
			const bool = player.storage.qunyou_huaisui;
			return { name: bool ? "bingliang" : "yuanjiao", isCard: true };
		},
		onuse(event, player) {
			player.changeZhuanhuanji("qunyou_huaisui");
		},
		prompt(event, player) {
			const bool = player.storage.qunyou_huaisui;
			return bool
				? "懷綏：将一张黑牌当【兵粮寸断】使用，并令手牌数小于你的目标摸一张牌"
				: "懷綏：将一张红牌当【远交近攻】使用，并令手牌数小于你的目标摸一张牌";
		},
		check(card) {
			return 8 - get.value(card);
		},
		ai: {
			order: 6,
			result: { player: 1 },
		},
		group: ["qunyou_huaisui_draw"],
		subSkill: {
			draw: {
				audio: "qunyou_huaisui",
				name: "懷綏",
				forced: true,
				trigger: { player: "useCardAfter" },
				filter(event, player) {
					if (event.skill != "qunyou_huaisui" || !event.targets || !event.targets.length) {
						return false;
					}
					return event.targets.some((target) => target.isIn() && target.countCards("h") < player.countCards("h"));
				},
				async content(event, trigger, player) {
					const targets = trigger.targets.filter((target) => target.isIn() && target.countCards("h") < player.countCards("h"));
					for (const target of targets) {
						await target.draw();
					}
				},
			},
		},
	},
// === 養隙 ===
	qunyou_yangxi: {
		audio: 2,
		trigger: { global: "phaseBeginStart" },
		filter(event, player) {
			const target = event.player;
			return (
				target != player &&
				target.isIn() &&
				target.countCards("h") > 0 &&
				target.inRange(player) &&
				target.countCards("h") > player.countCards("h")
			);
		},
		// 拿牌对象由敌我决定:敌人必拿(白赚一张),队友不拿(拿到伤害牌会被反打且无法响应)
		check(event, player) {
			return get.attitude(player, event.player) < 0;
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			const result = await player
				.gainPlayerCard({
					target,
					position: "h",
					prompt: "養隙：你可以获得" + get.translation(target) + "的一张手牌",
				})
				.forResult();
			const card = result?.cards?.[0];
			if (!card) return;
			if (get.is.damageCard(card)) {
				// 若为伤害牌：其对你使用之（无视距离与合法性），且你无法响应（directHit）
				const next = target.useCard(card, player, false);
				next.directHit = [player];
				await next;
			}
		},
	},

// === 识李 ===
	qunyou_shili: {
		audio: 2,
		trigger: { player: ["gainAfter", "loseAfter"] },
		filter(event, player) {
			// 不以此法：排除本技能视为使用【推心置腹】造成的获得/失去
			const use = event.getParent("useCard");
			if (use?.card?.storage?.qunyou_shili) return false;
			let cards = [];
			if (event.name == "gain") {
				cards = (event.cards || []).slice(0);
			} else {
				const lose = event.getl?.(player);
				cards = lose ? (lose.cards2 || []).slice(0) : [];
			}
			if (cards.length != 2) return false;
			event._qunyou_shili_cards = cards;
			return true;
		},
		async content(event, trigger, player) {
			const cards = trigger._qunyou_shili_cards || [];
			const use = await player
				.chooseUseTarget({ name: "tuixinzhifu", isCard: true, storage: { qunyou_shili: true } }, "识李：是否视为使用一张【推心置腹】？")
				.forResult();
			if (!use?.bool || !use.targets?.length) return;
			const target = use.targets[0];
			// 给目标分配一张触发此技能的牌（从其当前位置取：在手牌则直接给，在弃牌堆则取出给）
			const gainable = cards.filter((card) => get.position(card) == "h" || get.position(card, true) == "d");
			if (!gainable.length) return;
			let card = gainable[0];
			if (gainable.length > 1) {
				const pick = await player
					.chooseButton(["识李：选择分配给" + get.translation(target) + "的牌", gainable])
					.set("ai", (button) => get.value(button.link))
					.forResult();
				card = pick?.links?.[0] || card;
			}
			if (get.position(card) == "h") {
				await player.give([card], target);
			} else {
				await target.gain([card], "gain2");
				game.log(card, "被分配给了", target);
			}
		},
	},

// === 晦默 ===
	qunyou_huimo: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filterTarget(card, player, target) {
			// 所选角色须为其他角色且势力互不相同
			return target != player && !ui.selected.targets.some((current) => current.group == target.group);
		},
		// 任意名不同势力的角色：至少两名（单一角色无“不同势力”可言）
		selectTarget: [2, Infinity],
		complexTarget: true,
		filter(event, player) {
			const groups = new Set(game.filterPlayer((current) => current != player).map((current) => current.group));
			return groups.size >= 2;
		},
		ai: {
			order: 6,
			result: { player: 1, target: 1 },
		},
		async content(event, trigger, player) {
			// 同一出牌阶段只结算一次：不依赖 usable/filterEnable（其 _skillChoice 缓存可能跨 chooseToUse 复用）
			const pue = event.getParent("phaseUse");
			if (pue) {
				if (pue._huimo_used) {
					event.finish();
					return;
				}
				pue._huimo_used = true;
			}
			const ctu = event.getParent("chooseToUse");
			if (ctu) {
				// 强制下一次 game.check 重新过滤技能按钮，让“晦默”按钮在发动后消失
				delete ctu._skillChoice;
			}
			const choosers = [player, ...event.targets];
			const map = await game.chooseAnyOL(choosers, lib.skill.qunyou_huimo.chooseItem, [choosers]).forResult();
			const comparePlayers = choosers.filter((cur) => map.get(cur)?.control == "共同拼点" && cur.countCards("h") > 0);
			const drawPlayers = choosers.filter((cur) => map.get(cur)?.control == "摸一张牌");
			// 1. 选“摸一张牌”者各摸一张
			for (const cur of drawPlayers) {
				if (cur.isIn()) await cur.draw();
			}
			// 2. 选共同拼点的角色一起拼点（全程只进行这一次；平局无赢家）
			let winner = null;
			let compareEvt = null;
			if (comparePlayers.length >= 2) {
				compareEvt = comparePlayers[0].chooseToCompare(comparePlayers.slice(1)).setContent("chooseToCompareMeanwhile");
				const result = await compareEvt.forResult();
				winner = result?.winner || null;
			} else if (comparePlayers.length == 1) {
				// 只有一人选择共同拼点：直接成为赢家，无需拼点
				winner = comparePlayers[0];
			}
			// 3. 有赢者，其获得所有拼点牌（没有赢家直接跳过）
			if (winner?.isIn() && compareEvt?.lose_list) {
				const cards = compareEvt.lose_list.map((list) => list[1]).flat().filterInD("od");
				if (cards.length) await winner.gain(cards, "gain2");
			}
			// 4. 其他角色（除赢家）将手牌数弃至与最少者相同
			const alive = choosers.filter((cur) => cur.isIn());
			if (!alive.length) return;
			const min = Math.min(...alive.map((cur) => cur.countCards("h")));
			for (const cur of alive) {
				if (cur == winner) continue;
				const num = cur.countCards("h") - min;
				if (num > 0) await cur.chooseToDiscard(num, "h", true);
			}
		},
		chooseItem(current) {
			// 没有手牌可拼，只能选“摸一张牌”：自动选定，跳过选择环节
			if (!current.countCards("h")) {
				return { forResult: async () => ({ control: "摸一张牌" }) };
			}
			return current
				.chooseControl(["共同拼点", "摸一张牌"])
				.set("prompt", "晦默：请选择一项")
				.set("ai", () => (Math.random() < 0.5 ? "共同拼点" : "摸一张牌"));
		},
	},

	// === 令智 ===
	qunyou_lingzhi: {
		audio: 2,
		locked: true,
		forced: true,
		trigger: { player: "gainBegin" },
		filter(event, player) {
			if (!event.cards || event.cards.length <= 1) return false;
			const hand = player.countCards("h");
			if (hand <= player.maxHp && hand <= player.getHandcardLimit()) {
				return false;
			}
			return player.canMoveCard() || player.countCards("he") > 0;
		},
		async content(event, trigger, player) {
			const options = [];
			if (player.canMoveCard()) {
				options.push("移动场上的一张牌");
			}
            if (player.countCards("he") > 0) {
			options.push("分配一张你的牌给其他角色");
		    }
			if (!options.length) {
				return;
			}
			let choice = options[0];
			if (options.length > 1) {
				const ctrl = await player
					.chooseControl(options)
					.set("prompt", "令智：请选择一项")
					.set("ai", () => options[0])
					.forResult();
				choice = ctrl.control ?? choice;
			}
			if (choice === "移动场上的一张牌") {
				await player.moveCard(true, "令智：请移动场上的一张牌");
			} else {
				const cardResult = await player
					.chooseCard("he", 1, true)
					.set("prompt", "令智：请选择要分配的一张牌")
					.set("ai", card => 8 - get.value(card))
					.forResult();
				if (!cardResult?.cards?.length) {
					return;
				}
				const card = cardResult.cards[0];
				const targetResult = await player
					.chooseTarget(true, "令智：请选择要分配" + get.translation(card) + "的目标（其他角色）", (card2, player2, target) => target !== player && target.isIn())
					.set("ai", target => {
						const player2 = get.player();
						return get.value(card, target) * get.attitude(player2, target);
					})
					.forResult();
				if (!targetResult?.bool || !targetResult.targets?.length) {
					return;
				}
				await player.give(card, targetResult.targets[0]);
			}
		},
	},

	// === 诚质 ===
	qunyou_chengzhi: {
		audio: 2,
		trigger: { global: "phaseEnd" },
		filter(event, player) {
			if (!player.hasHistory('lose')) {
				return false;
			}
			if (!event.player?.isIn()) {
				return false;
			}
			if (player.hasSkill("qunyou_chengzhi_block")) {
				return false;
			}
			return ui.cardPile.hasChildNodes() || ui.discardPile.hasChildNodes();
		},
		// 当前回合角色将获得检索中点数唯一最大的牌:队友才发动,避免资敌
		check(trigger, player) {
			return trigger.player?.isIn?.() && get.attitude(player, trigger.player) > 0;
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			// 检索：依次亮出牌堆顶的牌，直到亮出锦囊牌
			const revealed = [];
			let trick = null;
			while (!trick) {
				if (!ui.cardPile.hasChildNodes()) {
					if (!ui.discardPile.hasChildNodes()) {
						break;
					}
					await game.washCard();
					if (!ui.cardPile.hasChildNodes()) {
						break;
					}
				}
				const card = get.cards(1)[0];
				await game.cardsGotoOrdering(card);
				revealed.push(card);
				await target.showCards(card, get.translation(target) + "检索牌堆顶的牌");
				if (get.type2(card) == "trick") {
					trick = card;
				} else {
					await game.delay(0.5);
				}
			}
			if (!revealed.length) {
				return;
			}
			const max = Math.max(...revealed.map(card => get.number(card)));
			const maxCards = revealed.filter(card => get.number(card) == max);
			if (maxCards.length == 1) {
				// 其获得亮出牌中点数唯一最大的牌，你获得剩余亮出的牌
				const card = maxCards[0];
				revealed.remove(card);
				await target.gain(card, "gain2");
				if (revealed.length) {
					await player.gain(revealed, "gain2");
				}
				return;
			}
			// 否则你须将检索的锦囊牌当【无中生有】使用，然后此技能本轮失效
			if (trick) {
				revealed.remove(trick);
				await player.useCard({ name: "wuzhong" }, [trick], player, false);
				player.addTempSkill("qunyou_chengzhi_block", "roundStart");
			}
			// 其余亮出牌置入弃牌堆
			if (revealed.length) {
				for (const card of revealed) {
					card.fix();
					ui.discardPile.appendChild(card);
				}
				game.log(target, "将", revealed, "置入了弃牌堆");
			}
		},
		subSkill: {
			block: {
				charlotte: true,
				sub: true,
			},
		},
	},

	// === 挑龙 ===
	qunyou_tiaolong: {
		audio: 2,
		enable: ["chooseToUse", "chooseToRespond"],
		init(player) {
			if (!Number.isInteger(player.storage.qunyou_tiaolong)) {
				player.storage.qunyou_tiaolong = 0;
			}
		},
		mark: true,
		marktext: "龙",
		intro: {
			// 标记数字 = 当前处于第几项（①~④）
			markcount(storage, player) {
				return (storage || 0) + 1;
			},
			content(storage, player) {
				const names = ["杀", "闪", "酒", "桃"];
				const state = storage || 0;
				const prev = names[(state + 3) % 4], next = names[(state + 1) % 4];
				return `当前第${get.cnNumber(state + 1)}项：非基本牌可当作【${names[state]}】使用；上一状态【${prev}】的同名牌仅可当作【决斗】使用，下一状态【${next}】的同名牌仅可当作【无懈可击】使用。`;
			},
		},
		filter(event, player) {
			// 候选：当前状态牌（非基本材料）/决斗（上一状态同名牌）/无懈（下一状态同名牌）
			// 防自递归：本技能自身选择流程事件（含 backup 流程）里 filterCard 已被包装为事件层，直接放行
			if (event.skill == "qunyou_tiaolong" || event._skill == "qunyou_tiaolong") {
				return player.countCards("hes") > 0;
			}
			const state = player.storage.qunyou_tiaolong || 0;
			const names = ["sha", "shan", "jiu", "tao"];
			const cur = names[state], prev = names[(state + 3) % 4], next = names[(state + 1) % 4];
			if (player.hasCard(card => get.type(card) != "basic", "hes") && event.filterCard(get.autoViewAs({ name: cur, isCard: true }, "unsure"), player, event)) return true;
			if (player.hasCard(card => get.name(card) == prev, "hes") && event.filterCard(get.autoViewAs({ name: "juedou", isCard: true }, "unsure"), player, event)) return true;
			if (player.hasCard(card => get.name(card) == next, "hes") && event.filterCard(get.autoViewAs({ name: "wuxie", isCard: true }, "unsure"), player, event)) return true;
			return false;
		},
		hiddenCard(player, name) {
			const state = player.storage.qunyou_tiaolong || 0;
			const names = ["sha", "shan", "jiu", "tao"];
			if (name == names[state]) return player.hasCard(card => get.type(card) != "basic", "hes");
			if (name == "juedou") return player.hasCard(card => get.name(card) == names[(state + 3) % 4], "hes");
			if (name == "wuxie") return player.hasCard(card => get.name(card) == names[(state + 1) % 4], "hes");
			return false;
		},
		mod: {
			// 上一/下一状态同名牌封锁正常使用（转化出的 vcard 名为当前状态名/决斗/无懈，不受影响）
			cardEnabled(card, player) {
				const state = player.storage.qunyou_tiaolong || 0;
				const names = ["sha", "shan", "jiu", "tao"];
				const name = get.name(card);
				if (name == names[(state + 3) % 4] || name == names[(state + 1) % 4]) {
					return false;
				}
			},
		},
		chooseButton: {
			dialog(event, player) {
				const state = player.storage.qunyou_tiaolong || 0;
				const names = ["sha", "shan", "jiu", "tao"];
				const list = [["基本", "", names[state]], ["锦囊", "", "juedou"], ["锦囊", "", "wuxie"]];
				return ui.create.dialog("挑龙：视为使用一张牌", [list, "vcard"], "hidden");
			},
			filter(button, player) {
				const evt = _status.event.getParent();
				const state = player.storage.qunyou_tiaolong || 0;
				const names = ["sha", "shan", "jiu", "tao"];
				const name = button.link[2];
				const prev = names[(state + 3) % 4], next = names[(state + 1) % 4];
				if (name == "juedou") {
					if (!player.hasCard(card => get.name(card) == prev, "hes")) return false;
				} else if (name == "wuxie") {
					if (!player.hasCard(card => get.name(card) == next, "hes")) return false;
				} else if (name == names[state]) {
					if (!player.hasCard(card => get.type(card) != "basic", "hes")) return false;
				} else {
					return false;
				}
				return evt.filterCard(get.autoViewAs({ name, isCard: true }, "unsure"), player, evt);
			},
			check(button) {
				if (_status.event.getParent().type != "phase") return 1;
				return get.player().getUseValue(get.autoViewAs({ name: button.link[2], isCard: true }), null, true);
			},
			backup(links, player) {
				const state = player.storage.qunyou_tiaolong || 0;
				const names = ["sha", "shan", "jiu", "tao"];
				const name = links[0][2];
				const prev = names[(state + 3) % 4], next = names[(state + 1) % 4];
				let filterCard, viewAs;
				if (name == "juedou") {
					filterCard = card => get.name(card) == prev;
					viewAs = { name: "juedou", isCard: true };
				} else if (name == "wuxie") {
					filterCard = card => get.name(card) == next;
					viewAs = { name: "wuxie", isCard: true };
				} else {
					filterCard = card => get.type(card) != "basic";
					viewAs = { name, isCard: true };
				}
				return {
					audio: "qunyou_tiaolong",
					filterCard,
					selectCard: 1,
					position: "hes",
					viewAs,
					popname: true,
				};
			},
			prompt(links, player) {
				const state = player.storage.qunyou_tiaolong || 0;
				const names = ["sha", "shan", "jiu", "tao"];
				const name = links[0][2];
				const prev = names[(state + 3) % 4], next = names[(state + 1) % 4];
				if (name == "juedou") return "挑龙：将一张【" + get.translation(prev) + "】当作【决斗】使用";
				if (name == "wuxie") return "挑龙：将一张【" + get.translation(next) + "】当作【无懈可击】使用";
				return "挑龙：将一张非基本牌当作【" + get.translation(name) + "】使用";
			},
		},
		ai: {
			order: 4,
			result: { player: 1 },
		},
		group: ["qunyou_tiaolong_advance"],
		subSkill: {
			advance: {
				// 转换技：仅"非基本牌当作当前状态牌"的主转化发动后才转入下一状态（④后回绕至①）；
				// 决斗/无懈的附带转化不推进——其 vcard 名为 juedou/wuxie，与当前状态牌名比对即可区分
				// （filter 先于 content 执行，此时状态尚未推进，event.card 名与当前状态名一致即主转化）
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				trigger: { player: ["useCardAfter", "respondAfter"] },
				filter(event, player) {
					if (event.skill != "qunyou_tiaolong_backup") return false;
					const state = player.storage.qunyou_tiaolong || 0;
					return event.card && get.name(event.card) == ["sha", "shan", "jiu", "tao"][state];
				},
				async content(event, trigger, player) {
					const state = player.storage.qunyou_tiaolong || 0;
					player.storage.qunyou_tiaolong = (state + 1) % 4;
					player.updateMarks("qunyou_tiaolong");
				},
			},
		},
	},

	// === 赤途 ===
	qunyou_chitu: {
		audio: 2,
		locked: true,
		forced: true,
		trigger: { source: "damage" },
		filter(event, player) {
			return event.player?.isIn();
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			// 展示受伤角色的所有手牌，X 为其中花色数
			const hand = target.getCards("h");
			if (hand.length) {
				await target.showCards(hand, get.translation(target) + "的手牌");
			}
			const X = new Set(hand.map(card => get.suit(card)).filter(suit => suit && suit != "none")).size;
			// 将挑龙转至第X项；同项视为无法转换
			let converted = false;
			if (X >= 1 && X <= 4) {
				const state = player.storage.qunyou_tiaolong || 0;
				if (state != X - 1) {
					player.storage.qunyou_tiaolong = X - 1;
					player.updateMarks("qunyou_tiaolong");
					game.log(player, "将", "#g【挑龙】", "转至了第" + get.cnNumber(X) + "项");
					converted = true;
				}
			}
			if (converted) return;
			// 若无法转换，你回复1点体力
			if (player.isDamaged()) {
				await player.recover();
				return;
			}
			// 若无法回复，其重铸两张红色牌
			const recastable = target.getCards("hes", card => get.color(card) == "red" && target.canRecast(card));
			if (recastable.length >= 2) {
				const result = await target
					.chooseCard("hes", 2, true, "赤途：请重铸两张红色牌")
					.set("filterCard", card => get.color(card) == "red" && get.player().canRecast(card))
					.set("ai", card => 6 - get.value(card))
					.forResult();
				if (result?.cards?.length == 2) {
					await target.recast(result.cards);
					return;
				}
			}
			// 若无法重铸，你摸三张牌
			await player.draw(3);
		},
	},

	// === 聊伐 ===
	qunyou_liaofa: {
		audio: 2,
		locked: true,
		forced: true,
		trigger: { player: "useCard" },
		filter(event, player) {
			// 普通锦囊：get.type 对延时锦囊返回 "delay"，天然排除
			return get.type(event.card) == "trick";
		},
		async content(event, trigger, player) {
			// 官方多重结算机制（fuyu 同款）：effectCount 增加，引擎在目标结算循环里 goto 重跑整牌结算
			trigger.effectCount++;
		},
	},

	// === 鬩墙 ===
	qunyou_xiqiang: {
		audio: 2,
		locked: true,
		forced: true,
		init(player) {
			// 机关子技能经 additionalSkills 挂载（不进 player.skills，避免污染“最下方的技能”判定）
			player.addAdditionalSkill("qunyou_xiqiang_machinery", "qunyou_xiqiang_sync", true);
			if (!Array.isArray(player.storage.qunyou_xiqiang_lost)) {
				player.storage.qunyou_xiqiang_lost = [];
			}
		},
		trigger: { player: "damageAfter", source: "damageAfter" },
		filter(event, player) {
			// 仅统计武将牌上可见的技能（有 _info 翻译者）；隐形机关技能不算
			return player.skills.some(skill => lib.translate[skill + "_info"]);
		},
		async content(event, trigger, player) {
			// 失去武将牌上最下方的（可见）技能直到本轮结束
			let last = null;
			for (let i = player.skills.length - 1; i >= 0; i--) {
				if (lib.translate[player.skills[i] + "_info"]) {
					last = player.skills[i];
					break;
				}
			}
			if (!last) return;
			const lost = player.getStorage("qunyou_xiqiang_lost");
			lost.push({ name: last, index: player.skills.indexOf(last) });
			player.removeSkill(last);
			// restore 动态独立挂载（被失去的可能是鬩墙自身，group 链会断，须独立存活到本轮结束）
			player.addAdditionalSkill("qunyou_xiqiang_machinery", "qunyou_xiqiang_restore", true);
			game.log(player, "失去了", "#g【" + get.translation(last) + "】", "直到本轮结束");
			lib.skill.qunyou_xiqiang.syncDisable(player);
		},
		syncDisable(player) {
			// 维护“此技能上方的技能失效”：当前上方技能禁用，原上方技能恢复
			// ⚠️ enableSkill 的参数是“禁用者键”（disableSkill(key, skill) 把 key 记进 disabledSkills[skill]），
			//    传被禁用的技能名会什么也移除不掉（参照 awakenSkill：disableSkill(skill+"_awake", skill) ↔ enableSkill(skill+"_awake")）
			const idx = player.skills.indexOf("qunyou_xiqiang");
			const above = idx > 0 ? player.skills[idx - 1] : null;
			const current = player.storage.qunyou_xiqiang_disabled;
			if (above != current) {
				if (current) {
					player.enableSkill("qunyou_xiqiang");
				}
				if (above) {
					player.disableSkill("qunyou_xiqiang", above);
				}
				player.storage.qunyou_xiqiang_disabled = above || null;
			}
		},
		subSkill: {
			sync: {
				// 捕捉技能列表的顺序/成员变化（沽名在准备阶段移动技能、技能被移除、
				// 痛悼等濒死结算内的技能恢复（removeSkill+addSkill 重建列表）等）
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				trigger: { global: ["phaseZhunbeiEnd", "phaseAfter", "roundStart", "dyingAfter"] },
				async content(event, trigger, player) {
					lib.skill.qunyou_xiqiang.syncDisable(player);
				},
			},
			restore: {
				// 本轮结束：取回本回合因鬩墙失去的技能（按失去时的位置插回）
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				trigger: { global: "roundEnd" },
				filter(event, player) {
					return player.getStorage("qunyou_xiqiang_lost").length > 0;
				},
				async content(event, trigger, player) {
					const lost = player.getStorage("qunyou_xiqiang_lost").slice(0).sort((a, b) => a.index - b.index);
					for (const entry of lost) {
						if (player.skills.includes(entry.name)) continue;
						player.addSkill(entry.name);
						const cur = player.skills.indexOf(entry.name);
						if (cur >= 0) {
							player.skills.splice(cur, 1);
							player.skills.splice(Math.min(entry.index, player.skills.length), 0, entry.name);
						}
					}
					player.setStorage("qunyou_xiqiang_lost", []);
					player.removeSkill("qunyou_xiqiang_restore");
					_status.event.clearStepCache();
					lib.skill.qunyou_xiqiang.syncDisable(player);
				},
			},
		},
	},

	// === 曜兵 ===
	qunyou_yaobing: {
		audio: 2,
		locked: true,
		forced: true,
		trigger: { source: "damageAfter" },
		async content(event, trigger, player) {
			await player.draw(Math.max(0, player.hp));
		},
	},

	// === 合众 ===
	qunyou_hezhong: {
		audio: 2,
		locked: true,
		forced: true,
		// 与原生应变规则技能同拍：yingbian 时机（使用确认后、目标结算前），战论同款
		trigger: { player: "yingbian" },
		filter(event, player) {
			// 单目标伤害牌（判定同官方冲击 sm_chongji：get.is.damageCard 排除闪电等延时伤害牌）
			if (!(event.targets?.length == 1 && get.is.damageCard(event.card))) {
				return false;
			}
			if (!lib.yingbian.condition.complex.has("zhuzhan")) return false;
			// 牌自带原版助战/force 应变时不再让位：合众的助战窗口照常开启，与原生助战（若有）一起结算
			// 带有助战/force 以外其他应变条件的牌仍由原生系统结算
			return get.yingbianConditions(event.card).every(condition => condition == "zhuzhan" || condition == "force");
		},
		async content(event, trigger, player) {
			// 复用原生助战窗口工厂（战论同款）：按座次询问、首个助战者生效、弃同类型手牌
			trigger.yingbianZhuzhanAI = (asked, card, source, targets) => cardx => {
				// 队友愿意为拥有者的额外结算助战（选低价值牌）；敌对/中立不助战
				if (get.attitude(asked, source) <= 0) return 0;
				return 5 - get.value(cardx);
			};
			const next = lib.yingbian.condition.complex.get("zhuzhan")(trigger);
			// 自定义 AI 只作用于合众自己的助战窗口，不影响原生助战窗口
			delete trigger.yingbianZhuzhanAI;
			await next;
			if (!next.result?.bool) return;
			// 首个助战者生效：此牌额外结算一次 + 沽名上升一格
			trigger.effectCount++;
			game.log(trigger.card, "额外结算一次");
			qunyou_gumingMove(player, 1);
		},
	},

	// === 神离 ===
	qunyou_shenli: {
		audio: 2,
		locked: true,
		forced: true,
		// 与合众同拍：yingbian 时机
		trigger: { player: "yingbian" },
		filter(event, player) {
			// 多目标锦囊牌
			if (!event.targets || event.targets.length <= 1 || get.type2(event.card) != "trick") {
				return false;
			}
			if (!lib.yingbian.condition.complex.has("zhuzhan")) return false;
			// 牌自带原版助战/force 应变时不再让位：神离的助战窗口照常开启，与原生助战（若有）一起结算
			// 带有助战/force 以外其他应变条件的牌仍由原生系统结算
			return get.yingbianConditions(event.card).every(condition => condition == "zhuzhan" || condition == "force");
		},
		async content(event, trigger, player) {
			// 复用原生助战窗口工厂；AI 按助战者身份与牌性质分档
			trigger.yingbianZhuzhanAI = (asked, card, source, targets) => cardx => {
				const idx = source.skills.indexOf("clanguming");
				// 沽名是否已降至最后一个可见技能位（此时下降不给拥有者带来移动收益）
				const atBottom = idx >= 0 && !source.skills.slice(idx + 1).some(skill => lib.translate[skill + "_info"]);
				if (targets && targets.includes(asked)) {
					// 助战者是目标：伤害牌目标助战=躲避伤害（沽名在末位时更划算）；
					// 无中生有（收益牌）、铁索连环（中性牌）等目标不助战
					if (get.tag(card, "damage") > 0) {
						return (get.tag(card, "damage") || 1) * 3 + (atBottom ? 3 : 0) - get.value(cardx);
					}
					return 0;
				}
				// 非目标：助战=摸一张牌，仅队友愿意（顺带帮沽名下降）
				if (get.attitude(asked, source) <= 0) return 0;
				return 4 - get.value(cardx);
			};
			const next = lib.yingbian.condition.complex.get("zhuzhan")(trigger);
			// 自定义 AI 只作用于神离自己的助战窗口，不影响原生助战窗口
			delete trigger.yingbianZhuzhanAI;
			await next;
			if (!next.result?.bool) return;
			// 首个助战者生效：是此牌目标则排除自己，否则摸一张牌 + 沽名下降一格
			const assistant = next.zhuzhanresult;
			if (trigger.targets.includes(assistant)) {
				trigger.excluded.add(assistant);
				game.log(assistant, "不再被", trigger.card, "结算");
			} else {
				await assistant.draw();
			}
			qunyou_gumingMove(player, -1);
		},
	},

	// === 权惘 ===
	qunyou_quanwang: {
		audio: 2,
		init(player) {
			if (!Array.isArray(player.storage.qunyou_quanwang_used)) {
				player.storage.qunyou_quanwang_used = [];
			}
			if (!Array.isArray(player.storage.qunyou_quanwang_mirrors)) {
				player.storage.qunyou_quanwang_mirrors = [];
			}
			// 初始建立装备效果镜像
			player.addSkill("qunyou_quanwang_sync");
			lib.skill.qunyou_quanwang.syncMirrors(player);
		},
		group: ["qunyou_quanwang_sync"],
		syncDisable(player) {},
		syncMirrors(player) {
			// 自初始化存储：不依赖 init 的调用顺序
			if (!Array.isArray(player.storage.qunyou_quanwang_used)) {
				player.storage.qunyou_quanwang_used = [];
			}
			if (!Array.isArray(player.storage.qunyou_quanwang_mirrors)) {
				player.storage.qunyou_quanwang_mirrors = [];
			}
			// 收集当前场上非坐骑装备的可发动技能（有触发时机、非静默内部技）
			// 排除 mod 状态类（连弩/方天画戟，content 为空壳，没有发动时机）；
			// 排除以装备/失去结算自身状态为时机的技能（天机图/锦盒等 equipAfter/loseAfter 类）——
			// 这类时机与 sync 同频派发，借用会在装备结算内嵌套 flow 导致无限递归
			const selfSettleEvents = ["equipAfter", "loseAfter", "loseAsyncAfter", "dieAfter"];
			const candidates = [];
			for (const target of game.filterPlayer()) {
				for (const card of target.getCards("e")) {
					const st = get.subtype(card);
					if (st == "equip3" || st == "equip4") continue;
					for (const s of get.skillsFromEquips([card])) {
						const info = lib.skill[s];
						const triggersSelfSettle = info && info.trigger && Object.values(info.trigger).some(evts => (Array.isArray(evts) ? evts : [evts]).some(e => selfSettleEvents.includes(e)));
						if (info && info.trigger && !info.silent && !info.mod && !triggersSelfSettle && !candidates.includes(s)) {
							candidates.push(s);
						}
					}
				}
			}
			const owned = player.storage.qunyou_quanwang_mirrors;
			// 移除失效镜像
			for (let i = owned.length - 1; i >= 0; i--) {
				const m = owned[i];
				const skillId = m.slice("qunyou_quanwang_m_".length);
				if (!candidates.includes(skillId)) {
					player.removeSkill(m);
					delete lib.skill[m];
					owned.splice(i, 1);
				}
			}
			// 新增镜像（动态 lib.skill 条目，闭包持有对应装备技能 id）
			for (const s of candidates) {
				const m = "qunyou_quanwang_m_" + s;
				if (owned.includes(m)) continue;
				if (!lib.skill[m]) {
					lib.skill[m] = {
						charlotte: true,
						trigger: lib.skill[s].trigger,
						forced: true,
						popup: false,
						silent: true,
						filter(event, player) {
							if (!player.hasSkill("qunyou_quanwang")) return false;
							if (player._qunyou_quanwang_flowing) return false;
							if (event._qunyou_quanwang_done) return false;
							// 手牌区有可重铸的❤牌（只看"h"：重铸已装备的牌会让装备离场，再次派发 equipAfter 造成递归）
							if (!player.countCards("h", card => get.suit(card) == "heart" && lib.filter.cardRecastable(card, player))) return false;
							// 该装备仍在场上
							if (!game.hasPlayer(target => target.getCards("e").some(card => get.skillsFromEquips([card]).includes(s)))) return false;
							// 装备技能自身 filter 以“自己语境”复评（异常按不可发动处理）
							const equipInfo = lib.skill[s];
							if (equipInfo.filter) {
								try {
									if (!equipInfo.filter(event, player)) return false;
								} catch (e) {
									return false;
								}
							}
							(event.qunyou_quanwang_candidates ??= new Set()).add(s);
							return true;
						},
						async content(event, trigger, player) {
							// 同一事件只跑一次选择流程（多镜像同时命中时由首个执行）
							if (trigger._qunyou_quanwang_done) return;
							trigger._qunyou_quanwang_done = true;
							// 候选由各镜像 filter 写在触发事件上（content 的 event 是技能事件，不是触发事件）
							const candidates = Array.from(trigger.qunyou_quanwang_candidates || []);
							await lib.skill.qunyou_quanwang.flow(trigger, player, candidates);
						},
					};
				}
				player.addSkill(m);
				owned.push(m);
			}
		},
		async flow(trigger, player, candidates) {
			// 重入保护：flow 内的重铸/结算可能再次派发装备/失去事件，任何路径都不允许嵌套发动
			if (player._qunyou_quanwang_flowing) return;
			player._qunyou_quanwang_flowing = true;
			try {
				await lib.skill.qunyou_quanwang.flowInner(trigger, player, candidates);
			} finally {
				player._qunyou_quanwang_flowing = false;
			}
		},
		async flowInner(trigger, player, candidates) {
			let activated = 0;
			while (true) {
				const hearts = player.getCards("h", card => get.suit(card) == "heart" && lib.filter.cardRecastable(card, player));
				if (!hearts.length) break;
				// 牌面列表：场上装备着候选效果的装备牌（同名去重）
				const equipCards = [];
				for (const target of game.filterPlayer()) {
					for (const card of target.getCards("e")) {
						const st = get.subtype(card);
						if (st == "equip3" || st == "equip4") continue;
						if (!get.skillsFromEquips([card]).some(s => candidates.includes(s))) continue;
						if (equipCards.some(c => c.name == card.name)) continue;
						equipCards.push(card);
					}
				}
				if (!equipCards.length) break;
				const result = await player
					.chooseButton([`权惘：是否重铸所有❤牌（${hearts.length}张），发动一个装备效果？`, [equipCards, "card"]])
					.set("ai", button => {
						// 粗略估值：有效果的装备牌优先，装备价值低者优先
						const cardx = button.link;
						return get.skillsFromEquips([cardx]).some(s => candidates.includes(s)) ? 2 - get.value(cardx) / 10 : 0;
					})
					.forResult();
				if (!result?.bool || !result.links?.length) break;
				const equipCard = result.links[0];
				// 重铸当前所有❤牌（仅手牌区）
				const currentHearts = player.getCards("h", card => get.suit(card) == "heart" && lib.filter.cardRecastable(card, player));
				if (currentHearts.length) {
					await player.recast(currentHearts);
				}
				// 结算所选装备效果（自己语境）
				const skills = get.skillsFromEquips([equipCard]).filter(s => candidates.includes(s));
				for (const skillId of skills) {
					const info = lib.skill[skillId];
					if (!info || !info.content) continue;
					// 发动过同名效果：翻面或失去〖殆鋩〗（效果照常发动）
					if (player.getStorage("qunyou_quanwang_used").includes(equipCard.name)) {
						const options = ["翻面"];
						if (player.hasSkill("qunyou_daimang")) options.push("失去殆鋩");
						const pen = await player
							.chooseControl(options)
							.set("prompt", "权惘：你发动过同名效果")
							.set("ai", () => (player.hasSkill("qunyou_daimang") ? options[options.length - 1] : options[0]))
							.forResult();
						if (pen.control == "翻面") {
							await player.turnOver();
						} else {
							player.removeSkill("qunyou_daimang");
						}
					}
					player.storage.qunyou_quanwang_used.push(equipCard.name);
					const skillEvent = game.createEvent(skillId + "_quanwang");
					skillEvent.player = player;
					skillEvent._trigger = trigger;
					skillEvent.setContent(info.content);
					await skillEvent.forResult();
					activated++;
				}
			}
			// 每次发动流程结束：权惘上升一格
			if (activated) {
				qunyou_skillMove(player, "qunyou_quanwang", 1);
			}
		},
		subSkill: {
			sync: {
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				trigger: { global: ["equipAfter", "loseAfter", "loseAsyncAfter", "dieAfter"] },
				async content(event, trigger, player) {
					// 触发期异常会杀死引擎事件链（表现为游戏卡死），这里兜底
					try {
						lib.skill.qunyou_quanwang.syncMirrors(player);
					} catch (e) {
						console.error("qunyou_quanwang syncMirrors error:", e);
					}
				},
			},
		},
	},

	// === 殆鋩 ===
	qunyou_daimang: {
		audio: 2,
		// chooseToUse/chooseToRespond：最后一张弃牌堆普通锦囊为【无懈可击】时可在响应窗口发动（hiddenCard 供 hasWuxie 预检）
		enable: ["phaseUse", "chooseToUse", "chooseToRespond"],
		hiddenCard(player, name) {
			const last = lib.skill.qunyou_daimang.lastTrick();
			return !!last && name == last.name && player.countCards("hes") >= 3;
		},
		init(player) {
			// 标记底字与弃牌堆状态同步
			const last = lib.skill.qunyou_daimang.lastTrick();
			lib.translate["qunyou_daimang_bg"] = last ? get.translation(last.name) : "鋩";
		},
		mark: true,
		marktext: "鋩",
		intro: {
			content(storage, player) {
				const last = lib.skill.qunyou_daimang.lastTrick();
				return last ? `最后置入弃牌堆的普通锦囊牌：${get.translation(last.name)}` : "还没有锦囊牌置入弃牌堆";
			},
		},
		filter(event, player) {
			if (player.countCards("hes") < 3) return false;
			const last = lib.skill.qunyou_daimang.lastTrick();
			if (!last) return false;
			// 防自递归：本技能自身选择流程事件里 filterCard 已被包装，直接放行
			if (event.skill == "qunyou_daimang" || event._skill == "qunyou_daimang") return true;
			return event.filterCard(get.autoViewAs({ name: last.name, isCard: true }, "unsure"), player, event);
		},
		filterCard: true,
		selectCard: 3,
		position: "hes",
		viewAs(cards, player) {
			const last = lib.skill.qunyou_daimang.lastTrick();
			if (!last || cards.length < 3) {
				// 点击/缓存期防御：无材料或材料不足时返回占位（选中后引擎实时重算）
				return { name: last ? last.name : "wuzhong", isCard: true };
			}
			return get.autoViewAs({ name: last.name, isCard: true }, cards);
		},
		check(card) {
			if (_status.event.getParent().type != "phase") return 1;
			return 4 - get.value(card);
		},
		lastTrick() {
			// 最后一张置入弃牌堆的普通锦囊牌（从弃牌堆顶向下找，普通锦囊=非延时）
			for (let i = ui.discardPile.childNodes.length - 1; i >= 0; i--) {
				const card = ui.discardPile.childNodes[i];
				if (get.itemtype(card) == "card" && get.type(card) == "trick") {
					return card;
				}
			}
			return null;
		},
		ai: {
			order: 4,
			result: { player: 1 },
		},
		group: ["qunyou_daimang_after", "qunyou_daimang_mark"],
		subSkill: {
			mark: {
				// 标记底字随弃牌堆变化：显示最后置入弃牌堆的普通锦囊牌名
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				trigger: { global: ["cardsDiscardAfter", "loseAfter", "loseAsyncAfter"] },
				async content(event, trigger, player) {
					const last = lib.skill.qunyou_daimang.lastTrick();
					const name = last ? get.translation(last.name) : "鋩";
					if (lib.translate["qunyou_daimang_bg"] != name) {
						lib.translate["qunyou_daimang_bg"] = name;
						if (player.marks.qunyou_daimang) {
							// _bg 在标记创建时渲染，改动后重建标记
							player.unmarkSkill("qunyou_daimang");
							player.markSkill("qunyou_daimang");
						}
					}
				},
			},
			after: {
				charlotte: true,
				forced: true,
				trigger: { player: "useCardAfter" },
				filter(event, player) {
					return event.skill == "qunyou_daimang";
				},
				async content(event, trigger, player) {
					// 若此牌目标不包括你：横置或失去〖权惘〗（已横置则"横置"不可选，只剩单选项时自动结算）
					if (!trigger.targets.includes(player)) {
						const options = [];
						if (!player.isLinked()) options.push("横置");
						if (player.hasSkill("qunyou_quanwang")) options.push("失去权惘");
						if (options.length) {
							const pen = await player
								.chooseControl(options)
								.set("prompt", "殆鋩：此牌目标不包括你")
								.set("direct", options.length == 1)
								.set("ai", () => options[0])
								.forResult();
							if (pen.control == "横置") {
								await player.link(true);
							} else {
								player.removeSkill("qunyou_quanwang");
								for (const m of player.storage.qunyou_quanwang_mirrors || []) {
									player.removeSkill(m);
									delete lib.skill[m];
								}
								player.storage.qunyou_quanwang_mirrors = [];
							}
						}
					}
					// 此技能上升一格
					qunyou_skillMove(player, "qunyou_daimang", 1);
				},
			},
		},
	},

	/*
	// === 分辙 ===
	qunyou_fenzhe: {
		audio: 2,
		mark: true,
		marktext: "辙",
		init(player) {
			if (!Number.isInteger(player.storage.qunyou_fenzhe)) {
				player.storage.qunyou_fenzhe = 0;
			}
		},
		intro: {
			content(storage, player) {
				const idx = Number.isInteger(storage) ? storage : 0;
				return `当前发动时机：${qunyouPhaseNames[idx]}阶段开始时`;
			},
		},
		trigger: { player: ["phaseZhunbeiBegin", "phaseDrawBegin", "phaseUseBegin", "phaseDiscardBegin", "phaseJieshuBegin"] },
		filter(event, player) {
			return qunyouPhaseIndex(event) === player.storage.qunyou_fenzhe;
		},
		mod: {
			// 手牌上限减少至0（每次发动重新设为0，此后一直为0）
			maxHandcard(player) {
				if (player.storage.qunyou_fenzhe_zero) {
					return 0;
				}
			},
		},
		ai: {
			result: {
				player(player2) {
					// 没有值得调虎离山的敌人时不发动（发动必吃手牌上限0）
					return game.hasPlayer(current => current != player2 && get.attitude(player2, current) < 0) ? 1 : -1;
				},
			},
		},
		async content(event, trigger, player) {
			player.storage.qunyou_fenzhe_zero = true;
			const cur = player.storage.qunyou_fenzhe;
			// 选项"数字.阶段名"：0=不移动，可后移至本回合结束阶段开始时；只剩0时跳过选择
			const options = [];
			for (let i = cur; i <= 4; i++) {
				options.push(`${i}.${qunyouPhaseNames[i]}阶段`);
			}
			let choice;
			if (options.length == 1) {
				choice = options[0];
			} else {
				const result = await player
					.chooseControl(options)
					.set("prompt", "分辙：选择此技能下次发动的时机")
					.set("ai", () => {
						// 一般只后移1或2个阶段（限制一至两个敌人），不多移
						const enemies = game.countPlayer(current => current != player && get.attitude(player, current) < 0);
						const move = enemies >= 2 ? 2 : enemies >= 1 ? 1 : 0;
						return options[Math.min(move, 4 - cur)];
					})
					.forResult();
				choice = result.control;
			}
			const moved = options.indexOf(choice);
			player.storage.qunyou_fenzhe = cur + moved;
			player.updateMarks("qunyou_fenzhe");
			// 本回合可对游戏外（移出游戏）的角色使用牌
			if (!player.hasSkill("qunyou_fenzhe_wai")) {
				player.addTempSkill("qunyou_fenzhe_wai", "phaseAfter");
			}
			// 视为使用等量张【调虎离山】（无可选目标时强制使用会永久等待，必须先探测）
			const diao = { name: "diaohulishan", isCard: true };
			for (let i = 0; i < moved; i++) {
				if (!player.isIn()) {
					break;
				}
				if (!player.hasUseTarget(diao)) {
					break;
				}
				await player.chooseUseTarget(diao, true, false);
			}
		},
		subSkill: {
			wai: {
				charlotte: true,
				sub: true,
				name: "分辙",
				trigger: { player: ["chooseToUseBegin", "chooseToRespondBegin"] },
				forced: true,
				popup: false,
				silent: true,
				content(event, trigger, player) {
					// 目标选择池加入移出游戏的角色（game.Check.target 读 event.includeOut）
					trigger.includeOut = true;
				},
			},
		},
	},

	// === 窮擊 ===
	qunyou_qiongji: {
		audio: 2,
		mark: true,
		marktext: "窮",
		init(player) {
			if (!Number.isInteger(player.storage.qunyou_qiongji)) {
				player.storage.qunyou_qiongji = 4;
			}
		},
		intro: {
			content(storage, player) {
				const idx = Number.isInteger(storage) ? storage : 4;
				let str = `当前发动时机：${qunyouPhaseNames[idx]}阶段开始时`;
				const pen = player.storage.qunyou_qiongji_pen;
				if (Number.isInteger(pen)) {
					str += `<br>下个${qunyouPhaseNames[pen]}阶段开始前：弃置所有手牌`;
				}
				return str;
			},
		},
		trigger: { player: ["phaseZhunbeiBegin", "phaseDrawBegin", "phaseUseBegin", "phaseDiscardBegin", "phaseJieshuBegin"] },
		filter(event, player) {
			return qunyouPhaseIndex(event) === player.storage.qunyou_qiongji;
		},
		ai: {
			result: { player: 1 },
		},
		async content(event, trigger, player) {
			const cur = player.storage.qunyou_qiongji;
			// 选项"数字.阶段名"：0=不移动，可前移至准备阶段开始时（其下个发生点）；只剩0时跳过选择
			const options = [];
			for (let i = cur; i >= 0; i--) {
				options.push(`${cur - i}.${qunyouPhaseNames[i]}阶段`);
			}
			let choice;
			if (options.length == 1) {
				choice = options[0];
			} else {
				const result = await player
					.chooseControl(options)
					.set("prompt", "窮擊：选择此技能下次发动的时机")
					// 逐步前移（先移到弃牌阶段、再逐步到准备阶段）收益最好
					.set("ai", () => (options.length > 1 ? options[1] : options[0]))
					.forResult();
				choice = result.control;
			}
			const moved = options.indexOf(choice);
			player.storage.qunyou_qiongji = cur - moved;
			player.updateMarks("qunyou_qiongji");
			// 摸三张牌
			await player.draw(3);
			// 视为使用一张【杀】（无可选目标时强制使用会永久等待，必须先探测）
			if (player.isIn() && player.hasUseTarget({ name: "sha", isCard: true })) {
				await player.chooseUseTarget({ name: "sha", isCard: true }, true, false);
			}
			// 下个该阶段开始前弃置所有手牌
			player.storage.qunyou_qiongji_pen = player.storage.qunyou_qiongji;
			player.updateMarks("qunyou_qiongji");
		},
		group: ["qunyou_qiongji_pen"],
		subSkill: {
			pen: {
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				trigger: { player: ["phaseZhunbeiBefore", "phaseDrawBefore", "phaseUseBefore", "phaseDiscardBefore", "phaseJieshuBefore"] },
				filter(event, player) {
					return qunyouPhaseIndex(event) === player.storage.qunyou_qiongji_pen;
				},
				async content(event, trigger, player) {
					player.storage.qunyou_qiongji_pen = null;
					const cards = player.getCards("h");
					if (cards.length) {
						await player.discard(cards);
					}
				},
			},
		},
	},
	*/
	// === 逐辉 ===
	qunyou_zhuhui: {
		audio: 2,
		locked: true,
		forced: true,
		trigger: { player: "phaseUseEnd" },
		filter(event, player) {
			return player.isIn();
		},
		async content(event, trigger, player) {
			// 手牌数、体力值、同势力角色数（同势力角色数含自己）每有一项为1，视为使用一张火【杀】
			const items = [player.countCards("h"), player.hp, game.countPlayer(current => current.group == player.group)];
			const times = items.filter(num => num == 1).length;
			for (let i = 0; i < times; i++) {
				if (!player.isIn()) {
					break;
				}
				const vcard = { name: "sha", nature: "fire", isCard: true, storage: { qunyou_zhuhui: true } };
				// 无合法目标（攻击范围内无人等）则不再继续视为使用
				if (!game.hasPlayer(current => player.canUse(vcard, current))) {
					break;
				}
				await player.chooseUseTarget(vcard, true, false);
			}
			// 以此法造成的总伤害：sourceDamage=造成的伤害（damage 是受到的伤害），按牌上的逐辉标记筛选（本回合内正常的火杀不会误计）
			const totalDamage = player
				.getHistory("sourceDamage", evt => evt.card?.storage?.qunyou_zhuhui)
				.reduce((sum, evt) => sum + (evt.num || 0), 0);
			const heal = totalDamage;
			// 总伤害不大于0时不触发后续
			if (heal > 0) {
				// 仅当还有下个阶段可供更改时才询问（当前出牌阶段是最后一个槽位时不弹）
				const phase = trigger.getParent("phase", true);
				const canChange = !!phase?.phaseList && typeof phase.num === "number" && phase.num + 1 < phase.phaseList.length;
				if (canChange) {
					const go = await player
						.chooseBool(`逐辉：是否回复${heal}点体力并将你的下个阶段改为出牌阶段？`)
						.set("choice", true)
						.forResult();
					if (go.bool) {
						await player.recover(heal);
						// 下个阶段改为出牌阶段（孤胆同款写法；下个阶段是结束阶段时同样可改）
						phase.phaseList[phase.num + 1] = "phaseUse";
					}
				}
			}
		},
	},

	// === 绝澜 ===
	qunyou_juelan: {
		audio: 2,
		locked: true,
		forced: true,
		trigger: {
			player: ["recoverBegin", "damageBegin1"],
		},
		filter(event, player) {
			if (event.name == "recover") {
				// 回复体力溢出：请求回复量超过可回复空间
				return event.num > player.maxHp - player.hp;
			}
			// 受到大于1的伤害
			return event.num > 1;
		},
		async content(event, trigger, player) {
			if (trigger.name == "recover") {
				// 新上限吸收溢出：结算前加上限，本次回复顺势填满新上限
				await player.gainMaxHp(1);
				return;
			}
			// 受到大于1的伤害：减1点体力上限，此伤害改为1点冰冻伤害
			await player.loseMaxHp(1);
			trigger.num = 1;
			game.setNature(trigger, "ice");
			// 你可以选择弃置两张牌防止此伤害（寒冰剑式）
			if (player.countCards("he") >= 2) {
				const go = await player
					.chooseBool("绝澜：是否弃置两张牌防止此1点冰冻伤害？")
					.set("choice", player.hp <= 1)
					.forResult();
				if (go.bool) {
					await player.chooseToDiscard(2, "he", true);
					trigger.num = 0;
				}
			}
		},
	},

// === 惑溺 ===
	qunyou_huoni: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filterTarget(card, player, target) {
			// 可选自己；"此阶段未以此法选择过"按描述记录（限一次下暂不构成约束）
			return !(player.getStorage("qunyou_huoni_used") || []).includes(target.playerid);
		},
		async content(event, trigger, player) {
			const target = event.targets[0];
			// 翻面
			player.turnOver();
			// 将手牌数调整至3
			await qunyou_adjustHandTo(player, 3);
			// 记录目标
			(player.storage.qunyou_huoni_used ??= []).push(target.playerid);
			// 其获得你的一张手牌：自己选可见手牌；他人选为顺手牵羊式暗选（你的手牌对其他角色不可见）
			let card;
			if (target == player) {
				const res = await player.chooseCard("h", true).set("prompt", "惑溺：获得你的一张手牌").forResult();
				card = res?.cards?.[0];
			} else {
				const res = await target.gainPlayerCard(player, "h", true).set("prompt", "惑溺：获得" + get.translation(player) + "的一张手牌").forResult();
				card = res?.cards?.[0] || res?.links?.[0];
			}
			if (!card) return;
			if (get.color(card) == "red") {
				// 你观看其手牌并使用其中一张（谏诤式：仅当前可使用的牌可选，无可使用则可不使用）
				const forced = target.hasCard((i) => player.hasUseTarget(i), "h");
				const res2 = await player
					.choosePlayerCard(target, "h", "visible", forced, "惑溺：观看其手牌，使用其中一张")
					.set("filterButton", (button) => get.event().player.hasUseTarget(button.link))
					.set("ai", (button) => get.event().player.getUseValue(button.link))
					.forResult();
				const useCard = res2?.links?.[0];
				if (useCard) {
					await player.chooseUseTarget(useCard, true);
				}
			} else {
				// 其视为使用一张【决斗】（目标自选，不计入出牌次数）
				await target.chooseUseTarget({ name: "juedou", isCard: true }, true, false);
			}
		},
		group: ["qunyou_huoni_clear"],
		subSkill: {
			clear: {
				name: "惑溺",
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				trigger: { player: "phaseUseAfter" },
				content(event, trigger, player) {
					delete player.storage.qunyou_huoni_used;
				},
			},
		},
		ai: {
			order: 4,
			result: {
				target(player, target) {
					// 自己为目标收益稳定；他人获得你的牌有利，但可能被你使用其手牌
					if (target == player) return 2;
					return -1 + Math.min(target.countCards("h"), 2) * 0.5;
				},
			},
		},
	},

	// === 栋澜 ===
	qunyou_donglan: {
		audio: 2,
		group: ["qunyou_donglan_count", "qunyou_donglan_reset"],
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			// 本阶段累计使用数恰好等于 X
			return (player.storage.qunyou_donglan_count || 0) == (player.storage.qunyou_donglan_x || 1);
		},
		check(event, player) {
			// 摸X张为纯收益，正常发动
			return true;
		},
		async content(event, trigger, player) {
			const X = player.storage.qunyou_donglan_x || 1;
			// 摸X张（必做）
			await player.draw(X);
			// 二选一：翻倍 或 使用杀（无可使用的杀→直接翻倍）
			// canUse 自带 cardEnabled 阶段限制，出牌阶段外杀不可用；此处手写 forceEnable 版判定
			const canSha =
				player.hasCard(card => get.name(card, player) == "sha", "hes") &&
				game.hasPlayer(cur => {
					const vsha = { name: "sha", isCard: true };
					return (
						lib.filter.cardEnabled(vsha, player, "forceEnable") &&
						lib.filter.targetInRange(vsha, player, cur) &&
						lib.filter.targetEnabled(vsha, player, cur)
					);
				});
			if (!canSha) {
				player.storage.qunyou_donglan_x = X * 2;
				player.updateMarks("qunyou_donglan");
				game.log(player, "的", "#g【栋澜】", "X翻倍为", get.cnNumber(X * 2));
				return;
			}
			const choice = await player
				.chooseControl("令X翻倍", "使用一张【杀】")
				.set("prompt", "栋澜：选择一项")
				.set("choiceList", [`令本阶段X翻倍（${X}→${X * 2}）`, "使用一张【杀】"])
				.set("ai", () => {
					const p = get.player();
					// 有杀且存在可杀目标时倾向使用杀，否则翻倍滚雪球
					if (
						p.hasCard(card => get.name(card, p) == "sha", "hes") &&
						game.hasPlayer(cur => {
							return get.attitude(p, cur) < 0 && p.canUse({ name: "sha", isCard: true }, cur);
						})
					) {
						return "使用一张【杀】";
					}
					return "令X翻倍";
				})
				.forResult();
			if (!choice?.control || choice.control == "cancel2") {
				// 理论上必选，保险兜底：执行翻倍
				player.storage.qunyou_donglan_x = X * 2;
				player.updateMarks("qunyou_donglan");
				return;
			}
			if (choice.control == "令X翻倍") {
				player.storage.qunyou_donglan_x = X * 2;
				player.updateMarks("qunyou_donglan");
				game.log(player, "的", "#g【栋澜】", "X翻倍为", get.cnNumber(X * 2));
				return;
			}
			// 使用一张杀：X 同步为当前计数+1（杀计入计数后恰好==X，继续触发）
			player.storage.qunyou_donglan_x = (player.storage.qunyou_donglan_count || 0) + 1;
			player.updateMarks("qunyou_donglan");
			const useResult = await player
				.chooseToUse({
					prompt: "栋澜：使用一张【杀】",
					filterCard(card, p) {
						if (get.name(card, p) != "sha") return false;
						return lib.filter.cardEnabled(card, p, "forceEnable");
					},
					addCount: false,
					ai1(card) {
						return get.order(card);
					},
				})
				.forResult();
			if (!useResult?.bool) {
				// 使用了杀但取消目标等：X 已同步（仍大于计数），本阶段不再自动触发
				return;
			}
		},
		mark: true,
		marktext: "澜",
		intro: {
			markcount(storage, player) {
				return player.storage.qunyou_donglan_x || 1;
			},
			content(storage, player) {
				const count = player.storage.qunyou_donglan_count || 0;
				const X = player.storage.qunyou_donglan_x || 1;
				return `本阶段已使用${get.cnNumber(count)}张牌；使用第${get.cnNumber(X)}张牌后可发动【栋澜】`;
			},
		},
		onremove(player) {
			delete player.storage.qunyou_donglan_count;
			delete player.storage.qunyou_donglan_x;
		},
		subSkill: {
			count: {
				// 本阶段你使用牌计数（useCard1 先于主技能 useCardAfter）
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
				trigger: { player: "useCard1" },
				content(event, trigger, player) {
					player.storage.qunyou_donglan_count = (player.storage.qunyou_donglan_count || 0) + 1;
					player.updateMarks("qunyou_donglan");
				},
			},
			reset: {
				// 每个阶段（六个子阶段）开始时重置：计数=0，X=1
				charlotte: true,
				forced: true,
				popup: false,
				silent: true,
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
				content(event, trigger, player) {
					player.storage.qunyou_donglan_count = 0;
					player.storage.qunyou_donglan_x = 1;
					player.updateMarks("qunyou_donglan");
				},
			},
		},
	},
}
