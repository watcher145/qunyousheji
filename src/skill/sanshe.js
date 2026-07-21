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
	qunyou_gouxian_useDamageCards, qunyou_gudan_cleanup,
	qunyou_gudan_discardCards, qunyou_gudan_gainCard, qunyou_gudan_track,
	qunyou_gushe_assignCards, qunyou_gushe_cards,
	qunyou_gushe_getDiscardFromEvent, qunyou_gushe_getLastDiscardCard,
	qunyou_gushe_getTopCard, qunyou_gushe_rank, qunyou_gushe_showCards,
	qunyou_gushe_targets, qunyou_gushe_useRemaining, qunyou_hanguo_visibleTag,
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
	qunyou_qionfu_basicVcards, qunyou_rongguo_compareCards,
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
						await fewer.showCards(drawn, `${get.translation(fewer)}因【审时】明置了`);
					} else {
						await fewer.showHandcards();
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
				player_use: (player, card) => {
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
					const z = qunyou_fuzhen_zoneCount(player);
					const hp = player.hp;
					if (z === hp) {
						return 0;
					}
					if (z > hp + 2 && game.hasPlayer((cur) => cur !== player && get.attitude(player, cur) < 0)) {
						return 1;
					}
					if (z < hp) {
						return 1;
					}
					return 0.35;
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
				player_use(player, card) {
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
					.set("ai", () => true)
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
			return player.getHp() > 0 && player.countCards("h") > 0 && !player.hasSkill("qunyou_muxin_disabled");
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
			const targets = event.targets?.filter((target) => target.isIn() && target.countCards("h")) || [];
			if (!targets.length || !player.countCards("h")) {
				return;
			}
			const selfResult = await player
				.chooseCard("暮心：展示一张手牌", "h", true)
				.set("ai", (card) => get.number(card, get.player()))
				.forResult();
			if (!selfResult?.bool || !selfResult.cards?.length) {
				return;
			}
			const selfCard = selfResult.cards[0];
			await player.showCards([selfCard], `${get.translation(player)}发动了【暮心】`);
			const shown = [];
			for (const target of targets) {
				if (!target.isIn() || !target.countCards("h")) {
					continue;
				}
				const result = await target
					.chooseCard("暮心：展示一张手牌", "h", true)
					.set("ai", (card) => {
						const num = get.number(card, target);
						return get.attitude(target, player) > 0 ? Math.abs(num - get.number(selfCard, player)) : 13 - Math.abs(num - get.number(selfCard, player));
					})
					.forResult();
				if (result?.bool && result.cards?.length) {
					await target.showCards(result.cards, `${get.translation(target)}因【暮心】展示了手牌`);
					shown.push({ target, card: result.cards[0] });
				}
			}
			if (!shown.length) {
				return;
			}
			const selfNum = get.number(selfCard, player);
			const nums = shown.map((info) => get.number(info.card, info.target));
			if (nums.every((num) => selfNum > num)) {
				const before = player.getHistory("sourceDamage").length;
				for (const info of shown) {
					if (info.target.isIn()) {
						await info.target.damage(player);
					}
				}
				if (player.getHistory("sourceDamage").length > before) {
					player.addTempSkill("qunyou_muxin_disabled", "phaseAfter");
				}
			} else if (nums.every((num) => selfNum < num)) {
				const gainCards = [selfCard].concat(shown.map((info) => info.card)).filter((card) => get.owner(card) !== player);
				if (gainCards.length) {
					await player.gain(gainCards, "gain2");
				}
				const before = player.getHistory("damage").length;
				await player.damage("nosource");
				if (player.getHistory("damage").length > before) {
					player.addTempSkill("qunyou_muxin_disabled", "phaseAfter");
				}
			} else if (nums.every((num) => selfNum === num)) {
				await player.recover();
			}
			if (!player.hasSkill("qunyou_muxin_turn")) {
				player.addTempSkill("qunyou_muxin_turn", "phaseAfter");
				player.storage.qunyou_muxin_turn_cards = [];
			}
			player.storage.qunyou_muxin_turn_cards.push(selfCard, ...shown.map(i => i.card));
			player.storage.qunyou_muxin_turn_count = (player.storage.qunyou_muxin_turn_count || 0) + 1;
			if (player.storage.qunyou_muxin_turn_count >= 3) {
				const gainCards = player.storage.qunyou_muxin_turn_cards.filter(c => {
					const owner = get.owner(c);
					return owner && owner !== player && get.itemtype(c) === "card";
				});
				if (gainCards.length) {
					await player.gain(gainCards, "gain2");
				}
				player.addTempSkill("qunyou_muxin_disabled", "phaseAfter");
			}
		},
		ai: {
			order: 7,
			result: {
				player: 1,
			},
		},
		subSkill: {
			disabled: {
				charlotte: true,
			},
			turn: {
				charlotte: true,
				onremove(player) {
					delete player.storage.qunyou_muxin_turn_count;
					delete player.storage.qunyou_muxin_turn_cards;
				},
			},
		},
	},

// === 苍霄 ===
	qunyou_cangxiao: {
		audio: 2,
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
				.chooseToDiscard(get.prompt("qunyou_cangxiao"), "弃置任意张牌，然后令一名角色选择一项", "he", [1, Infinity])
				.set("ai", (card) => {
					return 6 - get.value(card);
				})
				.forResult();
			if (!discard?.bool || !discard.cards?.length) {
				return;
			}
			const num = discard.cards.length;
			const targetResult = await player
				.chooseTarget("苍霄：令一名角色选择一项", true)
				.set("ai", (target) => {
					const att = get.attitude(get.player(), target);
					return target.countDiscardableCards(get.player(), "he") >= num ? -att : att;
				})
				.forResult();
			if (!targetResult?.bool || !targetResult.targets?.length) {
				return;
			}
			const target = targetResult.targets[0];
			player.logSkill("qunyou_cangxiao", target);
			const choices = [];
			if (target.countDiscardableCards(target, "he") >= num) {
				choices.push(`弃置${get.cnNumber(num)}张牌`);
			}
			choices.push("令其加1点体力上限");
			const choice = await target
				.chooseControl(choices)
				.set("prompt", `苍霄：请选择一项（${get.translation(player)}弃置了${get.cnNumber(num)}张牌）`)
				.set("ai", () => {
					if (choices.length > 1) {
						const att = get.attitude(get.player(), player);
						if (att > 0) return "令其加1点体力上限";
					}
					return choices[0];
				})
				.forResult();
			if (choice.control?.startsWith("弃置")) {
				await target.chooseToDiscard(num, "he", true);
			} else {
				await player.gainMaxHp();
			}
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
					return suits[0] || "cancel2";
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
					qunyou_combo_break(player, "qunyou_yiling");
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
			const result = await player.chooseToDiscard("秉德：弃置三张牌", 3, "he", true).forResult();
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
					const cards = qunyou_gudan_discardCards(player);
					if (cards.length) {
						qunyou_gudan_cleanup(player, cards);
						game.cardsGotoSpecial(cards);
						game.log(cards, "被销毁了");
					} else {
						qunyou_gudan_cleanup(player);
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
					const compareEvent = qunyou_jinfa_getCompareEvent(trigger);
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
					const compareEvent = qunyou_jinfa_getCompareEvent(trigger);
					const storage = qunyou_jinfa_getEventStorage(compareEvent, player);
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
					qunyou_zhihu_storage(player).count = 0;
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
		group: ["qunyou_weitai_gain", "qunyou_weitai_clear", "qunyou_weitai_use", "qunyou_weitai_target"],
		subSkill: {
			gain: {
				charlotte: true,
				trigger: { player: "gainAfter" },
				forced: true,
				popup: false,
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
				filter(event, player) {
					return qunyou_weitai_storage(player) && qunyou_weitai_isSingleTarget(event) && get.name(event.card, player) !== "juedou";
				},
				content(event, trigger, player) {
					trigger.card = qunyou_weitai_viewAs("juedou", trigger);
					game.log(player, "使用的单目标牌按", "#y决斗", "结算");
				},
				sub: true,
			},
			target: {
				audio: "qunyou_weitai",
				trigger: { target: "useCardToTargeted" },
				forced: true,
				filter(event, player) {
					return qunyou_weitai_storage(player) && qunyou_weitai_isSingleTarget(event.getParent?.() || event) && get.name(event.card, event.player) !== "chenhuodajie";
				},
				content(event, trigger, player) {
					const useEvent = trigger.getParent();
					if (useEvent?.card) {
						useEvent.card = qunyou_weitai_viewAs("chenhuodajie", useEvent);
						trigger.card = useEvent.card;
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
				return player.countCards("hs", card => get.type(card, null, false) === "trick") > 0;
			}
			if (name === "jiu") {
				return player.countCards("hs", card => card.name === "sha") > 0;
			}
			return false;
		},
		filter(event, player) {
			const list = [];
			if (player.countCards("hs", card => get.type(card, null, false) === "trick")) {
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
				if (player.countCards("hs", card => get.type(card, null, false) === "trick") > 0) {
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
							return get.type(card, null, false) === "trick";
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
						if (get.type(card, null, false) === "trick") {
							return "juedou";
						}
					},
					cardnature(card) {
						if (get.position(card) !== "h") {
							return;
						}
						if (get.type(card, null, false) === "trick") {
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
				.set("choice", game.hasPlayer((target) => target.group === "shu" && get.attitude(player, target) > 0 && target.isDamaged()))
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
				content() {
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
					.set("ai", () => 0)
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
		result: { player: 1 },
		check(event, player) {
			const handCards = player.getCards("h");
			if (!handCards.length) return 0;
			const totalValue = handCards.reduce((sum, c) => sum + get.value(c, player), 0);
			const avgValue = totalValue / handCards.length;
			const lostHp = player.maxHp - player.hp;
			if (avgValue < 5 && lostHp > handCards.length) return 1;
			return 0;
		},
	},
	},

// === 恣胜 ===
	qunyou_zisheng: {
		audio: 2,
		locked: true,
		trigger: { player: "useCardAfter" },
		forced: true,
		filter(event, player) {
			return !!event.card;
		},
		async content(event, trigger, player) {
			player.storage.qunyou_zisheng_used_count = (player.storage.qunyou_zisheng_used_count || 0) + 1;
			const count = player.storage.qunyou_zisheng_used_count;
			if (count % 3 !== 0) {
				return;
			}
			await player.draw(3);
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
					return !!player.storage.qunyou_zisheng_used_count || player.hasSkill("qunyou_zisheng_effect");
				},
				content(event, trigger, player) {
					delete player.storage.qunyou_zisheng_used_count;
					if (player.hasSkill("qunyou_zisheng_effect")) {
						player.removeSkill("qunyou_zisheng_effect");
					}
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
            // AI 优先选敌人
            return -get.attitude(_status.event.player, target);
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
             .forResult();
            if (!gainResult.bool || !gainResult.cards?.length) break;
            await player.gain(gainResult.cards, target, "give");
            remaining -= gainResult.cards.length;
        }
    },
},

// === 起义 ===
qunyou_qiyi: {
    audio: 2,
    group: ["qunyou_qiyi_gain", "qunyou_qiyi_loss"],
    ai: {
        order: 5,
        result: { player: 1 },
    },
    subSkill: {
        gain: {
            name: "起义",
            trigger: { player: "gainAfter" },
            usable: 1,
            filter(event, player) {
                return event.getParent("phaseDraw")?.player != player;
            },
            async content(event, trigger, player) {
                await player.draw(2);
                const targets = game.filterPlayer(p => p !== player && p.isIn());
                if (!targets.length) return;
                const result = await player.chooseTarget(
                    "起义：分配给至多两名其他角色各一张牌",
                    [1, Math.min(2, targets.length)],
                    (card, p, t) => t !== player
                ).set("ai", (target) => {
                    const player = _status.event.player;
                    const att = get.attitude(player, target);
                    if (att > 0) return att + 5;
                    return 0;
                }).forResult();
                if (result.targets?.length) {
                    for (const target of result.targets) {
                        if (player.countCards("h") > 0) {
                            const giveResult = await player.chooseCard("h", true, `起义：给${get.translation(target)}一张牌`).set("ai", (card) => {
                                const player = _status.event.player;
                                const att = get.attitude(player, target);
                                if (att > 0) return get.value(card, player);
                                return -get.value(card, player);
                            }).forResult();
                            if (giveResult.cards?.length) {
                                await player.give(giveResult.cards, target);
                            }
                        }
                    }
                }
            },
        },
        loss: {
            name: "起义",
            trigger: { player: "loseAfter" },
            usable: 1,
            filter(event, player) {
                const parent = event.getParent();
                return parent?.name !== "phaseDiscard" && parent?.name !== "useCard";
            },
            async content(event, trigger, player) {
                const targets = game.filterPlayer(p => p !== player && p.isIn());
                if (!targets.length) return;
                const result = await player.chooseTarget(
                    "起义：对至多两名其他角色各造成1点雷电伤害",
                    [1, Math.min(2, targets.length)],
                    (card, p, t) => t !== player
                ).set("ai", (target) => {
                    const player = _status.event.player;
                    const damage = get.damageEffect(target, player, player, "thunder");
                    if (damage > 0) return damage + 2;
                    return 0;
                }).forResult();
                if (result.targets?.length) {
                    for (const target of result.targets) {
                        await target.damage(1, "thunder");
                    }
                }
            },
        },
    },
},

// === 施符 ===
qunyou_shifu: {
    audio: 2,
    trigger: { global: "gainAfter" },
    forced: true,
    filter(event, player) {
        if (event.player === player) return false;
        if (_status.currentPhase === event.player) return false;
        if (event.giver !== player) return false;
        const cards = event.getg?.(event.player) || event.cards || [];
        if (cards.some(c => c.hasGaintag?.("qunyou_shifu_return"))) return false;
        return true;
    },
    async content(event, trigger, player) {
        const target = trigger.player;
        if (!target?.isIn()) return;
        const cards = trigger.getg?.(target) || trigger.cards || [];
        if (!cards.length) return;
        await target.addToExpansion(cards, player, "give").forResult();
        for (const card of cards) {
            card.addGaintag("qunyou_shifu_return");
        }
        await target.recover(1);
        if (!target.hasSkill("qunyou_shifu_return")) {
            target.storage.qunyou_shifu_owner = player;
            target.addTempSkill("qunyou_shifu_return", { player: "phaseBeginStartAfter" });
        }
    },
    subSkill: {
        "return": {
            trigger: { player: "phaseBeginStart" },
            forced: true,
            mark: true,
            intro: { content: "expansion", markcount: "expansion" },
            onremove(player, skill) {
                const cards = player.getExpansions(skill);
                if (cards.length) {
                    player.loseToDiscardpile({ cards });
                }
            },
            async content(event, trigger, player) {
                const skillOwner = player.storage.qunyou_shifu_owner;
                if (!skillOwner?.isIn()) {
                    player.removeSkill("qunyou_shifu_return");
                    return;
                }
                const fuCards = player.getExpansions("qunyou_shifu_return");
                if (!fuCards.length) {
                    player.removeSkill("qunyou_shifu_return");
                    return;
                }
                const num = fuCards.length;
                const handCount = player.countCards("h");
                const toGive = Math.min(num, handCount);
                if (toGive > 0) {
                    const result = await player.chooseCard("h", true, toGive, `施符：交给${get.translation(skillOwner)}${toGive}张牌`).forResult();
                    if (result.cards?.length) {
                        await player.give(result.cards, skillOwner);
                    }
                }
                await player.gain(fuCards, player, "give");
                await player.loseHp(1);
                for (const card of fuCards) {
                    card.removeGaintag("qunyou_shifu_return");
                }
                player.removeSkill("qunyou_shifu_return");
            },
        },
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
		).set("prompt", "众矢：请选择对" + targetName + "的处理方式").forResult();
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
					"众矢：是否对" + get.translation(player) + "使用一张伤害牌？"
				).set("filterCard", (function(_chara, _player) {
					return function(card) {
						return get.tag(card, "damage") >= 1 && _chara.canUse(card, _player);
					};
				})(chara, player));
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
		event.result = await player.chooseBool(get.prompt2("qunyou_zhenxiang")).set("choice", true).forResult();
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
				return targets.some(t => get.damageEffect(t, player, player) > 0);
			}).forResult();
			if (!result.bool) return;
			player.logSkill("qunyou_jiji");
			for (const target of targets) {
				await target.damage(player);
			}
		},
	},
}
