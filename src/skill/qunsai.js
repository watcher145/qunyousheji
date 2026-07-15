import { lib, game, get, ui, _status } from "noname";
import { getTurnDiscardCards, jinluSwapUI, qunyou_beixuan_cancelEvent, qunyou_bingzhu_cardOptions, qunyou_bingzhu_counts, qunyou_guiwu_targetKind, qunyou_guiwu_targets, qunyou_jidu_discardedShan, qunyou_jidu_isCard, qunyou_lingzhen_limit, qunyou_lingzhen_useLoop, qunyou_miaoyu_canUse, qunyou_miaoyu_controls, qunyou_miaoyu_modAiValue, qunyou_shuze_effect, qunyou_suijian_options, qunyou_suijian_prompt, qunyou_suijian_queueTargets, qunyou_yaliang_addDelayed, qunyou_yaliang_clearDelayed, qunyou_yaliang_damageCards, qunyou_yaliang_delayed, qunyou_yanghui_phaseDiscardCards, qunyou_yongxu_baseCards, qunyou_yongxu_isTrick } from "./helpers.js";

// 群赛角色的技能
export const skills = {
	qunyou_lingzhen: {
		audio: 2,
		enable: "phaseUse",
		filter(event, player) {
			return !player.hasSkill("qunyou_lingzhen_disabled");
		},
		async content(event, trigger, player) {
			const limit = qunyou_lingzhen_limit(player, "qunyou_lingzhen");
			const used = await qunyou_lingzhen_useLoop(player, "qunyou_lingzhen", limit);
			if (player.isIn()) {
				await player.draw();
			}
			if (used < limit && player.isIn()) {
				player.addTempSkill("qunyou_lingzhen_disabled", "phaseAfter");
			}
		},
		subSkill: {
			disabled: {
				charlotte: true,
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

	qunyou_lingzhen2: {
		audio: 2,
		enable: "phaseUse",
		filter(event, player) {
			return !player.hasSkill("qunyou_lingzhen2_disabled");
		},
		async content(event, trigger, player) {
			const limit = qunyou_lingzhen_limit(player, "qunyou_lingzhen2");
			await player.draw();
			const used = await qunyou_lingzhen_useLoop(player, "qunyou_lingzhen2", limit);
			if (used < limit && player.isIn()) {
				player.addTempSkill("qunyou_lingzhen2_disabled", "phaseAfter");
			}
		},
		subSkill: {
			disabled: {
				charlotte: true,
				sub: true,
			},
		},
		ai: {
			order: 7.1,
			result: {
				player: 1,
			},
		},
	},

	qunyou_yongxu: {
		audio: 2,
		trigger: { player: ["useCard", "respond"] },
		filter(event, player) {
			if (!Array.isArray(event.respondTo)) {
				return false;
			}
			return qunyou_yongxu_baseCards(event).length > 0;
		},
		check() {
			return true;
		},
		async content(event, trigger, player) {
			const base = qunyou_yongxu_baseCards(trigger);
			if (!base.length) {
				return;
			}
			const hasClub = base.some((c) => get.suit(c, player) === "club");
			const hasTrick = base.some((c) => qunyou_yongxu_isTrick(c, player));
			player.logSkill("qunyou_yongxu");
			if (hasClub && hasTrick) {
				const go = await player
					.chooseBool("咏絮：是否翻面并摸三张牌？")
					.set("ai", () => (player.needsToDiscard() > 0 ? 0 : 1))
					.forResult();
				if (go?.bool) {
					await player.turnOver();
					await player.draw(3);
				}
				return;
			}
			const needClub = !hasClub;
			const needTrick = !hasTrick;
			const filterCard = (card) => {
				if (!["h", "e"].includes(get.position(card))) {
					return false;
				}
				const satisfied = (needClub && get.suit(card, player) === "club") || (needTrick && qunyou_yongxu_isTrick(card, player));
				return satisfied && player.hasUseTarget(card, true, false);
			};
			if (!player.countCards("he", filterCard)) {
				return;
			}
			const go2 = await player
				.chooseBool("咏絮：是否使用一张牌（梅花或锦囊：满足一项尚未满足的）并摸一张？")
				.set("ai", () => 0.35)
				.forResult();
			if (!go2?.bool) {
				return;
			}
			const pick = await player
				.chooseCard({
					prompt: "咏絮：选择一张手牌或装备区里的牌",
					selectCard: 1,
					position: "he",
					forced: true,
					filterCard,
				})
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (!pick?.bool || !pick.cards?.length) {
				return;
			}
			const useResult = await player.chooseUseTarget(pick.cards[0], false, false).forResult();
			if (useResult?.bool) {
				await player.draw();
			}
		},
	},

	qunyou_miaoyu: {
		audio: 2,
		locked: false,
		enable: "chooseToUse",
		/** 无顶层 viewAs 时，须靠 hiddenCard 才能进入 hasWuxie / hasUsableCard 的无懈检测（见 player.js hasWuxie） */
		hiddenCard(player, name) {
			if (name !== "wuxie") {
				return false;
			}
			const cur = _status.currentPhase;
			return qunyou_miaoyu_canUse(player, cur);
		},
		filter(event, player) {
			if (event.type !== "wuxie") {
				return false;
			}
			return qunyou_miaoyu_canUse(player, _status.currentPhase);
		},
		viewAsFilter(player) {
			return qunyou_miaoyu_canUse(player, _status.currentPhase);
		},
		mod: {
			aiValue: qunyou_miaoyu_modAiValue,
			aiUseful() {
				return qunyou_miaoyu_modAiValue.apply(this, arguments);
			},
		},
		threaten: 1.2,
		chooseButton: {
			dialog() {
				return ui.create.dialog("妙喻：请选择当前回合角色本回合手牌上限", "hidden");
			},
			chooseControl(event, player) {
				return qunyou_miaoyu_controls(player, _status.currentPhase);
			},
			check(event, player) {
				const opts = qunyou_miaoyu_controls(player, _status.currentPhase);
				if (opts.length === 1) {
					return opts[0];
				}
				const cur = _status.currentPhase;
				const L = cur?.getHandcardLimit() ?? 0;
				const n = player.countCards("hes");
				return n >= L + 1 ? "手牌上限+1" : "手牌上限-1";
			},
			prompt(result, player) {
				return `###妙喻###${get.skillInfoTranslation("qunyou_miaoyu", player)}`;
			},
			backup(result, player) {
				delete player.storage.qunyou_miaoyu_pending;
				const cur = _status.currentPhase;
				if (!cur?.isIn()) {
					return { filterCard: () => false, selectCard: [0, 0] };
				}
				const up = result.control === "手牌上限+1";
				const skName = up ? "qunyou_miaoyu_up" : "qunyou_miaoyu_down";
				/** 须用「调整前上限 L」显式算出 X；addTempSkill 后 getHandcardLimit 未必已变，会误用旧值（如 L=3 选 -1 仍当 3 张） */
				const L = cur.getHandcardLimit();
				const X = up ? L + 1 : L - 1;
				const n = player.countCards("hes");
				if (X < 1 || n < X) {
					return { filterCard: () => false, selectCard: [0, 0] };
				}
				const pid = player.name1 || player.name;
				const skillOrder = lib.character[pid]?.skills || [];
				const a = skillOrder.length;
				/** precontent 会被 StepCompiler 单独抽出执行，不能引用 backup 闭包里的 X/a/skillOrder */
				player.storage.qunyou_miaoyu_pending = {
					banX: X,
					banA: a,
					banOrder: skillOrder.slice(),
					limitSkill: skName,
				};
				return {
					audio: "qunyou_miaoyu",
					sourceSkill: "qunyou_miaoyu",
					viewAs: { name: "wuxie", isCard: true },
					filterCard: true,
					position: "hes",
					selectCard: [X, X],
					prompt: `妙喻：将${get.cnNumber(X)}张牌当【无懈可击】使用`,
					check(card) {
						const tri = _status.event.getTrigger?.();
						if (tri?.card?.name === "chiling") {
							return -1;
						}
						return 8 - get.value(card);
					},
					precontent(event, trigger, player) {
						const d = player.storage.qunyou_miaoyu_pending;
						delete player.storage.qunyou_miaoyu_pending;
						if (d && typeof d.banX === "number") {
							const cur = _status.currentPhase;
							if (cur?.isIn() && d.limitSkill) {
								cur.addTempSkill(d.limitSkill, { player: "phaseAfter" });
							}
							player.storage.qunyou_miaoyu_ban_x = d.banX;
							player.storage.qunyou_miaoyu_ban_a = d.banA;
							player.storage.qunyou_miaoyu_ban_order = d.banOrder;
						}
						player.logSkill("qunyou_miaoyu");
					},
					async contentAfter(event, trigger, player) {
						const banX = player.storage.qunyou_miaoyu_ban_x;
						const banA = player.storage.qunyou_miaoyu_ban_a;
						const order = player.storage.qunyou_miaoyu_ban_order;
						delete player.storage.qunyou_miaoyu_ban_x;
						delete player.storage.qunyou_miaoyu_ban_a;
						delete player.storage.qunyou_miaoyu_ban_order;
						if (typeof banX !== "number" || banX < 1 || banX > banA || !Array.isArray(order)) {
							return;
						}
						const sid = order[banX - 1];
						if (sid && player.hasSkill(sid)) {
							await player.tempBanSkill(sid, { global: "phaseAnyAfter" });
						}
					},
				};
			},
		},
		ai: {
			basic: {
				useful: [6, 4, 3],
				value: [6, 4, 3],
			},
			result: {
				player: 1,
			},
			expose: 0.2,
		},
		subSkill: {
			up: {
				charlotte: true,
				onremove: true,
				mod: {
					maxHand(player, num) {
						return num + 1;
					},
				},
			},
			down: {
				charlotte: true,
				onremove: true,
				mod: {
					maxHand(player, num) {
						return num - 1;
					},
				},
			},
		},
	},

	qunyou_yanghui: {
		audio: 2,
		trigger: {
			player: ["damageEnd", "loseAfter"],
			global: "loseAsyncAfter",
		},
		filter(event, player) {
			if (event.name === "damage") {
				return true;
			}
			return qunyou_yanghui_phaseDiscardCards(event, player).length >= 2;
		},
		async cost(event, trigger, player) {
			event.result = await player.chooseBool(get.prompt2(event.skill)).set("ai", () => true).forResult();
		},
		async content(event, trigger, player) {
			await player.turnOver();
			await player.draw(3);
		},
	},

	qunyou_yaliang: {
		audio: 2,
		mark: true,
		onremove(player) {
			delete player.storage.qunyou_yaliang_draw;
			delete player.storage.qunyou_yaliang_discard;
		},
		intro: {
			content(storage, player) {
				const draw = qunyou_yaliang_delayed(player, "draw");
				const discard = qunyou_yaliang_delayed(player, "discard");
				const list = [];
				if (draw) {
					list.push(`延后摸牌：${draw}`);
				}
				if (discard) {
					list.push(`延后弃牌：${discard}`);
				}
				return list.length ? list.join("<br>") : "没有延后牌数";
			},
		},
		group: ["qunyou_yaliang_draw", "qunyou_yaliang_applyDraw", "qunyou_yaliang_discard", "qunyou_yaliang_damage"],
		subSkill: {
			draw: {
				audio: "qunyou_yaliang",
				trigger: { player: "drawBegin" },
				filter(event, player) {
					return player.isTurnedOver() && !event.qunyou_yaliang && event.num > 0;
				},
				async cost(event, trigger, player) {
					event.result = await player
						.chooseBool(`雅量：是否延后摸${get.cnNumber(trigger.num)}张牌？`)
						.set("ai", () => qunyou_yaliang_delayed(player, "draw") === 0 ? 1 : 0)
						.forResult();
				},
				async content(event, trigger, player) {
					qunyou_yaliang_addDelayed(player, "draw", trigger.num);
					trigger.num = 0;
				},
			},
			applyDraw: {
				audio: "qunyou_yaliang",
				trigger: { player: "chooseToDiscardBegin" },
				forced: true,
				priority: 10,
				filter(event, player) {
					return qunyou_yaliang_delayed(player, "draw") > 0;
				},
				async content(event, trigger, player) {
					const num = qunyou_yaliang_delayed(player, "draw");
					await player.draw({ num, qunyou_yaliang: true });
					trigger.selectCard = [num, num];
					trigger.forced = true;
					trigger.prompt = `雅量：弃牌数改为${get.cnNumber(num)}张`;
					qunyou_yaliang_clearDelayed(player, "draw");
				},
			},
			discard: {
				audio: "qunyou_yaliang",
				trigger: { player: "chooseToDiscardBegin" },
				priority: 1,
				filter(event, player) {
					return player.isTurnedOver() && !event.chooseonly && event.selectCard;
				},
				async cost(event, trigger, player) {
					const range = get.select(trigger.selectCard);
					let str;
					if (range[0] === range[1]) {
						str = get.cnNumber(range[0]);
					} else if (range[1] === Infinity) {
						str = `至少${get.cnNumber(range[0])}`;
					} else {
						str = `${get.cnNumber(range[0])}至${get.cnNumber(range[1])}`;
					}
					event.result = await player
						.chooseBool(`雅量：是否延后弃置${str}张牌？`)
						.set("ai", () => true)
						.forResult();
				},
				async content(event, trigger, player) {
					trigger.chooseonly = true;
					trigger.set("logSkill", "qunyou_yaliang");
					player
						.when("chooseToDiscardAfter")
						.filter((evt) => evt === trigger && evt.result?.bool && evt.result.cards?.length)
						.step(async (event, trigger, player) => {
							qunyou_yaliang_addDelayed(player, "discard", trigger.result.cards.length);
						});
				},
			},
			damage: {
				audio: "qunyou_yaliang",
				trigger: { source: "damageBegin1" },
				forced: true,
				filter(event, player) {
					return qunyou_yaliang_delayed(player, "discard") > 0;
				},
				async content(event, trigger, player) {
					const cards = qunyou_yaliang_damageCards(trigger);
					const num = qunyou_yaliang_delayed(player, "discard");
					qunyou_yaliang_clearDelayed(player, "discard");
					const discardNum = Math.min(num, player.countCards("he"));
					if (discardNum > 0) {
						await player.chooseToDiscard(`雅量：弃置${get.cnNumber(discardNum)}张牌`, "he", discardNum, true);
					}
					if (cards.length) {
						await player.gain(cards, "gain2");
					}
				},
			},
		},
	},

	qunyou_shuze: {
		audio: 2,
		clanSkill: true,
		trigger: { player: ["turnOverEnd", "linkEnd", "removeJiu", "useCard1"], global: "phaseAfter" },
		filter(event, player, name) {
			if (event.name === "turnOver") {
				return !player.isTurnedOver();
			}
			if (event.name === "link") {
				return !player.isLinked();
			}
			if (event.name === "removeJiu") {
				return true;
			}
			if (name === "useCard1") {
				if (player.hasSkill("xu_jiu", true) && event.card?.name === "sha" && lib.skill.jiu2?.filter?.(event, player)) {
					return true;
				}
				if (
					player.hasSkill("xu_zuijiu", true) &&
					!event.card?.xu_huangzui &&
					["basic", "trick"].includes(get.type(event.card)) &&
					!get.tag(event.card, "damage") &&
					lib.skill.xu_zuijiu2?.filter?.(event, player)
				) {
					return true;
				}
				return false;
			}
			if (name === "phaseAfter") {
				return player.hasSkill("xu_zuijiu", true) && !player.hasSkillTag("jiuSustain", null, name);
			}
			return false;
		},
		check() {
			return true;
		},
		async content(event, trigger, player) {
			await qunyou_shuze_effect(player);
		},
	},

	qunyou_jidu: {
		audio: 2,
		trigger: { player: "phaseZhunbeiBegin" },
		direct: true,
		ai: {
			order: 5,
			result: { player: 1 },
		},
		async content(event, trigger, player) {
			const card = { name: "wanjian", isCard: true, storage: { qunyou_jidu: true } };
			if (!player.hasUseTarget(card, true, false)) {
				return;
			}
			const go = await player
				.chooseBool(get.prompt("qunyou_jidu"), "视为使用一张伤害为0的【万箭齐发】？响应此牌的角色摸一张牌。")
				.set("ai", () => player.getUseValue(card, null, true) > 0)
				.forResult();
			if (!go?.bool) {
				return;
			}
			player.logSkill("qunyou_jidu");
			await player.chooseUseTarget(card, true, false).forResult();
		},
		group: ["qunyou_jidu_draw", "qunyou_jidu_zero", "qunyou_jidu_shan", "qunyou_jidu_clear"],
		subSkill: {
			draw: {
				audio: "qunyou_jidu",
				trigger: { global: "respond" },
				forced: true,
				filter(event) {
					return get.name(event.card) === "shan" && qunyou_jidu_isCard(event.respondTo?.[1]);
				},
				async content(event, trigger, player) {
					player.logSkill("qunyou_jidu", trigger.player);
					await trigger.player.draw();
				},
			},
			zero: {
				audio: "qunyou_jidu",
				trigger: { source: "damageBegin1" },
				forced: true,
				filter(event) {
					return qunyou_jidu_isCard(event.card);
				},
				content(event, trigger) {
					trigger.num = 0;
				},
			},
			shan: {
				audio: "qunyou_jidu",
				trigger: { global: ["loseAfter", "loseAsyncAfter"] },
				direct: true,
				filter(event, player) {
					if (_status.currentPhase !== player) return false;
					if (event.name === "loseAfter" && event.getParent("loseAsync")) return false;
					return qunyou_jidu_discardedShan(event).length > 0;
				},
				async content(event, trigger, player) {
					const num = qunyou_jidu_discardedShan(trigger).length;
					let count = (player.storage.qunyou_jidu_shan || 0) + num;
					while (count >= 2) {
						const result = await player
							.chooseTarget(get.prompt("qunyou_jidu"), "令一名角色下次受到的伤害改为2点", (card, p, target) => target.isIn())
							.set("ai", (target) => {
								const att = get.attitude(player, target);
								if (att >= 0) {
									return target.hp > 2 ? 0.2 : -1;
								}
								return 2 - target.hp;
							})
							.forResult();
						if (!result?.bool || !result.targets?.length) {
							count -= 2;
							break;
						}
						count -= 2;
						const target = result.targets[0];
						player.logSkill("qunyou_jidu", target);
						target.addTempSkill("qunyou_jidu_effect", { player: ["damageAfter", "damageZero", "dieAfter"] });
					}
					if (count > 0) {
						player.storage.qunyou_jidu_shan = count;
					} else {
						delete player.storage.qunyou_jidu_shan;
					}
				},
			},
			effect: {
				charlotte: true,
				mark: true,
				intro: { content: "下次受到的伤害改为2点" },
				trigger: { player: "damageBegin4" },
				forced: true,
				content(event, trigger, player) {
					trigger.num = 2;
					player.removeSkill("qunyou_jidu_effect");
				},
			},
			clear: {
				charlotte: true,
				trigger: { player: "phaseAfter" },
				forced: true,
				popup: false,
				content(event, trigger, player) {
					delete player.storage.qunyou_jidu_shan;
				},
			},
		},
	},

	qunyou_bingzhu: {
		audio: 2,
		enable: "chooseToUse",
		trigger: { global: ["chooseToUseBegin", "chooseToRespondBegin"] },
		direct: true,
		filter(event, player, triggername) {
			if (player.hasSkill("qunyou_bingzhu_used")) {
				return false;
			}
			if (triggername) {
				if (event.responded || event.player.isLinked()) {
					return false;
				}
				const shan = { name: "shan", isCard: true };
				if (!event.filterCard?.(shan, event.player, event)) {
					return false;
				}
				return event.player.getCards("he", (card) => event.player.canRecast(card, event.player)).length > 0;
			}
			return qunyou_bingzhu_counts(event, player).length > 0;
		},
		hiddenCard(player, name) {
			if (!["sha", "tao"].includes(name) || player.hasSkill("qunyou_bingzhu_used")) {
				return false;
			}
			const linked = game.filterPlayer((target) => target.isLinked()).length;
			return linked >= 2 && game.hasPlayer((target) => target.countCards("h") >= 2 && target.countCards("h") <= linked);
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			const go = await player
				.chooseBool(get.prompt("qunyou_bingzhu", target), `令${get.translation(target)}横置并重铸一张牌？`)
				.set("ai", () => {
					if (get.attitude(player, target) <= 0) {
						return true;
					}
					return target.isLinked() ? true : 0.2;
				})
				.forResult();
			if (!go?.bool) {
				return;
			}
			player.logSkill("qunyou_bingzhu", target);
			player.addTempSkill("qunyou_bingzhu_used", { global: "phaseAfter" });
			await target.link(true);
			const result = await target
				.chooseCard("兵主：重铸一张牌", "he", true, (card, p) => p.canRecast(card, p))
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (result?.bool && result.cards?.length) {
				await target.recast(result.cards);
			}
		},
		chooseButton: {
			dialog(event, player) {
				const buttons = [];
				for (const count of qunyou_bingzhu_counts(event, player)) {
					for (const info of qunyou_bingzhu_cardOptions(event, player, count)) {
						const name = info[2];
						buttons.push([`${count}:${name}`, `重置${get.cnNumber(count)}名角色，视为使用【${get.translation(name)}】`]);
					}
				}
				return ui.create.dialog("兵主：请选择重置数量和视为使用的牌", [buttons, "textbutton"], "hidden");
			},
			check(button) {
				const player = _status.event.player;
				const [countText, name] = button.link.split(":");
				const count = Number(countText);
				const card = { name, isCard: true };
				if (name === "tao") {
					return game.hasPlayer((target) => target.countCards("h") === count && get.recoverEffect(target, player, player) > 0) ? 5 : 0.5;
				}
				return Math.max(
					0.1,
					...game.filterPlayer((target) => {
						return target.countCards("h") === count;
					}).map((target) => get.effect(target, card, player, player))
				);
			},
			backup(links, player) {
				const [countText, name] = links[0].split(":");
				const count = Number(countText);
				player.storage.qunyou_bingzhu_pending = { count, name };
				return {
					audio: "qunyou_bingzhu",
					sourceSkill: "qunyou_bingzhu",
					viewAs: { name, isCard: true },
					filterCard: () => false,
					selectCard: -1,
					selectTarget: 1,
					filterTarget(card, player, target) {
						const data = player.storage.qunyou_bingzhu_pending;
						return data?.count === target.countCards("h") && lib.filter.targetEnabled2(card, player, target);
					},
					popname: true,
					async precontent(event, trigger, player) {
						const data = player.storage.qunyou_bingzhu_pending;
						delete player.storage.qunyou_bingzhu_pending;
						if (!data || typeof data.count !== "number") {
							return;
						}
						const result = await player
							.chooseTarget(`兵主：重置${get.cnNumber(data.count)}名角色`, data.count, true, (card, p, target) => target.isLinked())
							.set("ai", (target) => {
								const att = get.attitude(player, target);
								return att > 0 ? 2 : -1;
							})
							.forResult();
						if (!result?.bool || result.targets?.length !== data.count) {
							return;
						}
						player.logSkill("qunyou_bingzhu", result.targets);
						player.addTempSkill("qunyou_bingzhu_used", { global: "phaseAfter" });
						const targets = result.targets.sortBySeat?.(player) ?? result.targets;
						for (const target of targets) {
							if (target.isLinked()) {
								await target.link(false);
							}
						}
					},
				};
			},
			prompt(links) {
				const [countText, name] = links[0].split(":");
				return `兵主：重置${get.cnNumber(Number(countText))}名角色，视为使用【${get.translation(name)}】`;
			},
		},
		ai: {
			respondSha: true,
			save: true,
			skillTagFilter(player, tag) {
				if (player.hasSkill("qunyou_bingzhu_used")) {
					return false;
				}
				if (tag === "respondSha") {
					return lib.skill.qunyou_bingzhu.hiddenCard(player, "sha");
				}
				if (tag === "save") {
					return lib.skill.qunyou_bingzhu.hiddenCard(player, "tao");
				}
				return false;
			},
			order: 8,
			result: {
				player: 1,
			},
		},
		subSkill: {
			backup: {},
			used: {
				charlotte: true,
				mark: true,
				marktext: "兵",
				intro: { content: "本回合已发动过兵主" },
			},
		},
	},

	qunyou_beixuan: {
		audio: 2,
		enable: "phaseUse",
		filter(event, player) {
			return game.hasPlayer((target) => target !== player && player.canCompare(target));
		},
		filterTarget(card, player, target) {
			return target !== player && player.canCompare(target);
		},
		async content(event, trigger, player) {
			const target = event.target;
			const go = await target
				.chooseBool(`悖玄：是否与${get.translation(player)}拼点？`)
				.set("ai", () => get.attitude(target, player) < 0)
				.forResult();
			if (!go?.bool) {
				player.logSkill("qunyou_beixuan", target);
				target.addTempSkill("qunyou_beixuan_ban", { global: "phaseAfter" });
				return;
			}
			const result = await player.chooseToCompare(target).forResult();
			if (result?.tie) {
				return;
			}
			const winner = result?.bool ? player : target;
			const loser = result?.bool ? target : player;
			if (!winner?.isIn() || !loser?.isIn() || !loser.countCards("he")) {
				return;
			}
			const gain = await winner
				.chooseBool(`悖玄：是否获得${get.translation(loser)}一张牌？`)
				.set("ai", () => get.attitude(winner, loser) <= 0)
				.forResult();
			if (gain?.bool) {
				await winner.gainPlayerCard(loser, "he", true);
			}
		},
		ai: {
			order: 7,
			result: {
				target(player, target) {
					return -get.attitude(player, target);
				},
			},
		},
		subSkill: {
			ban: {
				charlotte: true,
				mark: true,
				intro: { content: "本回合不能再选择确定" },
				trigger: {
					player: [
						"chooseBoolBegin",
						"chooseControlBegin",
						"chooseButtonBegin",
						"chooseTargetBegin",
						"chooseCardBegin",
						"chooseToUseBegin",
						"chooseToRespondBegin",
					],
				},
				forced: true,
				popup: false,
				firstDo: true,
				filter(event) {
					if (event.name === "chooseControl") {
						return !event.forced && event.controls?.includes("cancel2");
					}
					return !event.forced;
				},
				content(event, trigger) {
					qunyou_beixuan_cancelEvent(trigger);
				},
			},
		},
	},

	qunyou_guiwu: {
		audio: 2,
		trigger: { player: "useCard1" },
		direct: true,
		filter(event, player) {
			const kind = qunyou_guiwu_targetKind(event);
			if (!kind) {
				return false;
			}
			if (player.getHistory("useCard", (evt) => qunyou_guiwu_targetKind(evt) === kind).indexOf(event) !== 0) {
				return false;
			}
			const targets = qunyou_guiwu_targets();
			return targets.length > 0 && targets.some((target) => lib.filter.targetEnabled2(event.card, player, target));
		},
		async content(event, trigger, player) {
			const targets = qunyou_guiwu_targets().filter((target) => lib.filter.targetEnabled2(trigger.card, player, target));
			if (!targets.length) {
				return;
			}
			const go = await player
				.chooseBool(get.prompt("qunyou_guiwu"), `将${get.translation(trigger.card)}的目标改为${get.translation(targets)}？`)
				.set("ai", () => {
					let oldEffect = 0;
					for (const target of trigger.targets || []) {
						oldEffect += get.effect(target, trigger.card, player, player);
					}
					let newEffect = 0;
					for (const target of targets) {
						newEffect += get.effect(target, trigger.card, player, player);
					}
					return newEffect > oldEffect;
				})
				.forResult();
			if (!go?.bool) {
				return;
			}
			player.logSkill("qunyou_guiwu", targets);
			trigger.targets.length = 0;
			trigger.targets.addArray(targets);
			if (targets.includes(player) && !player.hasSkill("jiu")) {
				await player.useCard({ name: "jiu", isCard: true }, player, false);
			} else {
				await player.turnOver();
			}
		},
	},

	qunyou_suijian: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return qunyou_suijian_options(player, []).length > 0;
		},
		async content(event, trigger, player) {
			const used = [];
			let actor = player;
			let queue = [];
			while (used.length < qunyou_suijian_names.length) {
				if (!actor?.isIn()) {
					actor = null;
				}
				while (!actor && queue.length) {
					const next = queue.shift();
					if (next?.isIn() && qunyou_suijian_options(next, used).length) {
						actor = next;
					}
				}
				if (!actor) {
					break;
				}
				const options = qunyou_suijian_options(actor, used);
				if (!options.length) {
					actor = null;
					continue;
				}
				const result = await actor
					.chooseButton([qunyou_suijian_prompt(actor, options), [options.map((option) => [option.key, option.label]), "textbutton"]], true)
					.set("options", options)
					.set("ai", (button) => {
						const option = get.event().options.find((item) => item.key === button.link);
						if (!option) {
							return 0;
						}
						return actor.getUseValue(option.card, true, false);
					})
					.forResult();
				if (!result?.bool || !result.links?.length) {
					break;
				}
				const option = options.find((item) => item.key === result.links[0]);
				if (!option) {
					actor = null;
					continue;
				}
				if (actor === player) {
					player.logSkill("qunyou_suijian");
				} else {
					player.logSkill("qunyou_suijian", actor);
				}
				const useResult = await actor
					.chooseUseTarget(option.card, true, false)
					.set("prompt", `碎坚：视为使用${option.label}`)
					.set("logSkill", "qunyou_suijian")
					.forResult();
				if (!useResult?.bool) {
					break;
				}
				used.add(option.usedKey);
				const newTargets = qunyou_suijian_queueTargets(useResult.targets, actor);
				queue = newTargets.concat(queue);
				actor = null;
			}
		},
		ai: {
			order: 8,
			result: {
				player: 1,
			},
		},
	},

qunyou_chuandao: {
    audio: 2,
    enable: "phaseUse",
    filter(event, player) {
        return player.countCards("h") > 0;
    },
    async content(event, trigger, player) {
        const maxGive = Math.max(1, player.countCards("h"));
        const cardResult = await player.chooseCard({
            position: "h",
            selectCard: [1, maxGive],
            prompt: "传道：选择要分配的手牌",
        }).set("ai", (card) => {
            if (ui.selected.cards.length >= 1) return 0;
            if (player.hasSkill("qunyou_shifu")) return get.value(card);
            return Math.max(0.1, 6 - get.value(card));
        }).forResult();
        if (!cardResult.bool || !cardResult.cards?.length) return;
        const cards = cardResult.cards;
        const targetResult = await player.chooseTarget("传道：选择分配目标", true, (card, p, t) => t !== p).set("ai", (target) => {
            const turnTargets = player.storage.qunyou_chuandao_turnTargets || [];
            const alreadyGiven = turnTargets.includes(target.playerid);
            const att = get.attitude(player, target);
            if (att > 0) {
                if (alreadyGiven) return 0.5;
                const nh = target.countCards("h");
                const suitsLeft = 4 - (player.storage.qunyou_chuandao_suits || []).length;
                if (target.hasSkill("haoshi")) return 10;
                if (nh <= 1) return 8;
                if (nh <= target.hp) return 6;
                if (suitsLeft > 0) return 4;
                if (player.hasSkill("qunyou_shifu") && target.isDamaged()) return 3;
                return 2;
            }
            if (alreadyGiven) return 0.01;
            const hasQiyi = player.hasSkill("qunyou_qiyi");
            const hasShifu = player.hasSkill("qunyou_shifu");
            const noMuzhong = !player.storage.qunyou_muzhong;

            if (hasQiyi) return 0;
            if (hasShifu && target.isDamaged()) return 0;
            if (hasShifu) return 0.3;
            if (noMuzhong) return 1;
            return 0.05;
        }).forResult();
        if (!targetResult.bool || !targetResult.targets?.length) return;
        const target = targetResult.targets[0];
        await player.give(cards, target);
        player.storage.qunyou_chuandao_suits ??= [];
        player.storage.qunyou_chuandao_targets ??= [];
        player.storage.qunyou_chuandao_turnTargets ??= [];
        for (const card of cards) {
            const suit = get.suit(card, player);
            if (lib.suit.includes(suit) && !player.storage.qunyou_chuandao_suits.includes(suit)) {
                player.storage.qunyou_chuandao_suits.push(suit);
            }
        }
        if (!player.storage.qunyou_chuandao_targets.includes(target.playerid)) {
            player.storage.qunyou_chuandao_targets.push(target.playerid);
        }
        if (!player.storage.qunyou_chuandao_turnTargets.includes(target.playerid)) {
            player.storage.qunyou_chuandao_turnTargets.push(target.playerid);
        }
        player.markSkill("qunyou_chuandao");
        if (player.storage.qunyou_chuandao_suits.length >= 4 && !player.storage.qunyou_chuandao_drew) {
            const X = Math.min(player.storage.qunyou_chuandao_turnTargets.length, 3);
            await player.draw(X);
            player.storage.qunyou_chuandao_drew = true;
            player.storage.qunyou_chuandao_suits = [];
            player.storage.qunyou_chuandao_turnTargets = [];
            player.unmarkSkill("qunyou_chuandao");
        }
    },
    ai: {
        order: 6,
        result: {
            player: function(player) {
                var friends = game.filterPlayer(function(p) {
                    return p !== player && get.attitude(player, p) > 0;
                });
                if (friends.length > 0) return 1;
                if (!player.storage.qunyou_muzhong) return 0.5;
                return 0;
            }
        },
    },
    mark: true,
    intro: {
        content(storage, player) {
            const suits = player.storage.qunyou_chuandao_suits || [];
            const turnTargets = player.storage.qunyou_chuandao_turnTargets || [];
            const parts = [];
            if (suits.length) parts.push(`花色：${suits.map(s => get.translation(s)).join("、")}`);
            if (turnTargets.length) parts.push(`本回合：${turnTargets.length}人`);
            return parts.length ? parts.join(" | ") : "无记录";
        },
    },
},

qunyou_muzhong: {
    audio: 2,
    enable: "phaseUse",
    limited: true,
    filter(event, player) {
        const targets = player.storage.qunyou_chuandao_targets;
        if (!Array.isArray(targets) || !targets.length) return false;
        return targets.some(id => {
            const p = game.findPlayer(pp => pp.playerid === id);
            return p?.isIn() && p.countCards("h") > 0;
        });
    },
    async content(event, trigger, player) {
        player.awakenSkill(event.name);
        const targetIds = player.storage.qunyou_chuandao_targets || [];
        const available = targetIds.map(id => game.findPlayer(p => p.playerid === id)).filter(p => p?.isIn() && p.countCards("h") > 0);
        if (!available.length) return;
        const targetResult = await player.chooseTarget(
            "募众：选择要令其展示牌的角色（曾对其发动过传道）",
            [1, available.length],
            (card, p, t) => available.includes(t)
        ).set("ai", (target) => {
            return 1;
        }).forResult();
        const targets = targetResult.targets || [];
        if (!targets.length) return;
        const typeSet = new Set();
        for (const target of targets) {
            if (!target.isIn() || !target.countCards("h")) continue;
            const result = await target.chooseCard("h", true, `募众：展示并交给${get.translation(player)}一张牌`).set("ai", (card) => {
                const att = get.attitude(target, player);
                if (att > 0) {
                    const curTypes = new Set(typeSet);
                    player.getCards("he").forEach(c => curTypes.add(get.type2(c)));
                    const cardType = get.type2(card, target);
                    if (!curTypes.has(cardType)) return 20 + get.value(card, target);
                    return 10 - get.value(card, target);
                }
                return 6 - get.value(card, target);
            }).forResult();
            if (result.bool && result.cards?.length) {
                const card = result.cards[0];
                await target.give(card, player);
                typeSet.add(get.type2(card, player));
            }
        }
        if (typeSet.has("basic") && typeSet.has("trick") && typeSet.has("equip")) {
            await player.addSkill("qunyou_qiyi");
            player.popup("起义");
        } else {
            await player.addSkill("qunyou_shifu");
            player.popup("施符");
        }
    },
    ai: {
        order: 1,
        result: { player: 1 },
    },
},

qunyou_zhenpan: {
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	async content(event, trigger, player) {
		const Y = player.hp - 1;
		if (player.countCards("he") < 1 || player.countCards("he") < Y) return;
        await player.loseHp();
        const X = player.hp;
		const toDiscard = await player.chooseToDiscard("he", true, X).set("prompt", `镇叛：弃置${X}张牌`).forResult();
		if (!toDiscard.bool || !toDiscard.cards.length) return;
		const suits = [...new Set(toDiscard.cards.map(c => get.suit(c, player)).filter(s => lib.suit.includes(s)))];
		if (!suits.length) return;
		const targetResult = await player.chooseTarget("镇叛：选择一名其他角色观看其手牌", true, (card, p, t) => t !== p).set("ai", (target) => {
			const player = _status.event.player;
			if (get.attitude(player, target) > 0) return 0;
			return target.countCards("h");
		}).forResult();
		if (!targetResult.bool || !targetResult.targets.length) return;
		const target = targetResult.targets[0];
		await player.viewHandcards(target);
		target.addTempSkill("qunyou_zhenpan_ban", { global: "phaseJieshuAfter" });
		target.storage.qunyou_zhenpan_ban = suits;
	},
	ai: {
		order: 5,
		result: { player: 1 },
		check(event, player) {
			if (player.hp < 1) return 0;
			if (player.hp === 1) {
				const hasPeach = player.getCards("h").some(c => get.name(c) === "tao");
				const hasJiu = player.getCards("h").some(c => get.name(c) === "jiu");
				if (!hasPeach && !hasJiu) return 0;
			}
			if (player.countCards("he") > player.hp - 1) return 1;
			return 0;
		},
	},
},

qunyou_zhenpan_ban: {
	charlotte: true,
	onremove: true,
	mod: {
		cardEnabled(card, player) {
			const suits = player.storage.qunyou_zhenpan_ban;
			if (suits?.length && suits.includes(get.suit(card))) return false;
		},
		cardRespondable(card, player) {
			const suits = player.storage.qunyou_zhenpan_ban;
			if (suits?.length && suits.includes(get.suit(card))) return false;
		},
		cardSavable(card, player) {
			const suits = player.storage.qunyou_zhenpan_ban;
			if (suits?.length && suits.includes(get.suit(card))) return false;
		},
	},
	mark: true,
	marktext: "镇",
	intro: { content: (storage) => "本回合不能使用或打出" + (storage || []).map(s => get.translation(s)).join("、") + "的牌" },
},

qunyou_kangbian: {
	audio: 2,
	trigger: { player: "useCardToPlayer", global: "useCardToPlayer" },
	usable: 1,
	filter(event, player) {
		if (event.targets.length !== 1) return false;
		if (event.player === player && event.target !== player) return true;
		if (event.target === player && event.player !== player && get.name(event.card) === "sha") return true;
		return false;
	},
	async content(event, trigger, player) {
		const target = trigger.player === player ? trigger.target : trigger.player;
		if (!target.countCards("h")) return;
		const handCards = player.getCards("h");
		const turnDiscards = getTurnDiscardCards();
		const dialogSections = ["抗辩：选择拼点牌"];
		if (handCards.length) dialogSections.push("手牌", handCards);
		if (turnDiscards.length) dialogSections.push("本回合弃牌堆", turnDiscards);
		const chooseResult = await player.chooseButton(dialogSections, true).set("ai", (button) => {
			return 6 - get.value(button.link, player);
		}).forResult();
		if (!chooseResult.bool || !chooseResult.links.length) return;
		const selectedCard = chooseResult.links[0];
		const compare = player.chooseToCompare(target);
		compare.set("fixedResult", { [player.playerid]: selectedCard });
		const { bool: win } = await compare.forResult();
		if (win) {
			const gainTargets = await player.chooseTarget(
				"抗辩：选择至多三名其他角色，获得其各一张手牌",
				[1, 3],
				(card, p, t) => t !== player && t.countCards("h") > 0
			).set("ai", (target) => {
				const player = _status.event.player;
				if (get.attitude(player, target) < 0) return target.countCards("h");
				return 0;
			}).forResult();
			if (gainTargets.bool && gainTargets.targets.length) {
				const gainedCards = [];
				for (const t of gainTargets.targets) {
					const cardResult = await player.gainPlayerCard(t, "h", true).forResult();
					if (cardResult.bool && cardResult.cards.length) {
						gainedCards.push({ target: t, card: cardResult.cards[0] });
					}
				}
				for (const { target: t } of gainedCards) {
					if (player.countCards("h") > 0) {
						const giveResult = await player.chooseCard("h", true, `抗辩：交给${get.translation(t)}一张牌`).set("ai", (card) => {
							return -get.value(card);
						}).forResult();
						if (giveResult.bool && giveResult.cards.length) {
							await player.give(giveResult.cards, t);
						}
					}
				}
			}
		} else {
			await player.loseHp();
		}
	},
	group: "qunyou_kangbian_pindian",
	ai: {
		order: 5,
		result: { player: 1 },
		check(event, player) {
			const target = event.player === player ? event.target : event.player;
			if (get.attitude(player, target) >= 0) return 0;
			const hasBig = player.getCards("h").some(c => get.number(c) >= 10);
			return hasBig ? 1 : 0;
		},
	},
},

qunyou_kangbian_pindian: {
	name: "抗辩·拼点",
	direct: true,
	trigger: { global: "chooseToCompareBegin" },
	filter(event, player) {
		if (event.player !== player && !event.targets?.includes(player) && event.target !== player) return false;
		if (event.fixedResult?.[player.playerid]) return false;
		return getTurnDiscardCards().length > 0;
	},
	async content(event, trigger, player) {
		const handCards = player.getCards("h");
		const turnDiscards = getTurnDiscardCards();
		const dialogSections = ["抗辩·拼点：选择拼点牌"];
		if (handCards.length) dialogSections.push("手牌", handCards);
		if (turnDiscards.length) dialogSections.push("本回合弃牌堆", turnDiscards);
		const result = await player.chooseButton(dialogSections, true).set("ai", (button) => {
			return 6 - get.value(button.link, player);
		}).forResult();
		if (result.bool && result.links.length) {
			trigger.fixedResult = trigger.fixedResult || {};
			trigger.fixedResult[player.playerid] = result.links[0];
		}
	},
},

qunyou_yinshan: {
	audio: 2,
	trigger: { player: "phaseJieshuBegin" },
	async content(event, trigger, player) {
		const handCards = player.getCards("h");
		if (handCards.length) {
			await player.discard(handCards);
		}
		const lostHp = player.maxHp - player.hp;
		if (lostHp > 0) {
			await player.draw(lostHp);
		}
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
},// 绮武

qunyou_yongli: {
	audio: 2,
	trigger: { global: "roundStart" },
	forced: true,
	init(player, skill) {
		player.addSkill(skill + "_die");
	},
	onremove(player, skill) {
		player.removeSkill(skill + "_die");
	},
	async content(event, trigger, player) {
		if (player.hasSkill("qunyou_yunmo")) player.removeSkill("qunyou_yunmo");
		if (!player.hasSkill("qunyou_fuzhu")) player.addSkill("qunyou_fuzhu");
		const { result } = await player.chooseTarget(
			"拥立",
			"选择一名其他角色",
			(card, player, target) => target != player
		);
		if (!result?.targets?.length) return;
		const target = result.targets[0];
		if (target.hasSkill("tianming")) {	
			target.addTempSkill("twzhuiting", "roundEnd");
		} else {
			target.addTempSkill("tianming", "roundEnd");
		}
		player.storage.qunyou_yongli_target = target;
		target.addTempSkill("qunyou_yongli_mark", "roundEnd");
	},
	subSkill: {
		die: {
			trigger: { global: "dieAfter" },
			forced: true,
			filter(event, player) {
				return player.storage.qunyou_yongli_target?.playerid == event.player.playerid;
			},
			async content(event, trigger, player) {
				delete player.storage.qunyou_yongli_target;
				player.addSkill("qunyou_yunmo");
				player.removeSkill("qunyou_fuzhu");
			},
		},
		mark: {
			mark: true,
			intro: { content: "被董相国拥立了" },
		},
	},
},

qunyou_taoning: {
	audio: 2,
	trigger: { player: "useCardToPlayer" },
	usable: 1,
	filter(event, player) {
		if (event.targets.length != 1) return false;
		if (event.player == player && get.type(event.card) == "basic") return true;
		return event.target == player && get.suit(event.card) == "none";
	},
	check(event, player) {
		if (event.player === player) return 1;
		const cur = _status.currentPhase;
		if (!cur) return 0;
		return get.damageEffect(cur, player, player) > 0 ? 1 : 0;
	},
	async content(event, trigger, player) {
		const { result } = await player.chooseControl("摸两张牌", "造成1点伤害")
			.set("prompt", get.prompt("qunyou_taoning"))
			.set("ai", () => {
				const evt = _status.event.getParent("useCardToPlayer");
				if (evt && evt.player === _status.event.player) return "摸两张牌";
				if (_status.event.player.isDamaged() || _status.event.player.countCards("h") < 2) return "摸两张牌";
				return "造成1点伤害";
			});
		if (result.control == "摸两张牌") await player.draw(2);
		else await _status.currentPhase.damage(1, player);
	},
},

qunyou_fuzhu: {
	audio: 2,
	trigger: { source: "damageAfter" },
	usable: 1,
	filter(event, player) {
		return player.storage.qunyou_yongli_target?.isIn();
	},
	async content(event, trigger, player) {
		await player.draw(2);
		const target = player.storage.qunyou_yongli_target;
		const result = await player.chooseCard({
			position: "h",
			selectCard: [2, 2],
			forced: true,
			prompt: "选择两张牌交给" + get.translation(target),
		}).set("ai", card => get.value(card)).forResult();
		if (result.cards?.length) {
			await player.give(result.cards, target);
		}
		const current = _status.currentPhase;
		const allSkills = current.getSkills(null, false, false);
		const skills = allSkills.filter(id => {
			const info = lib.translate[id + "_info"];
			const count = get.skillCount(id, current);
			const triggerCount = current.getStat("triggerSkill")[id];
			return info && info.match(/"?出牌阶段限一次/g) &&
				(get.skillCount(id, current) > 0 || current.getStat("triggerSkill")[id] > 0);
		});
		if (skills.length) {
		const controlResult = await player.chooseControl(skills, "cancel2")
			.set("prompt", "为" + get.translation(current) + "选择一个技能重置为未发动")
			.set("ai", () => skills[0])
			.forResult();
			if (controlResult.control != "cancel2") {
				delete current.getStat("skill")[controlResult.control];
				delete current.getStat("triggerSkill")[controlResult.control];
			}
		}
	},
},

qunyou_yunmo: {
	audio: 2,
	trigger: { player: "damageBegin2" },
	forced: true,
	filter(event, player) {
		return get.type(event.card) == "trick";
	},
	async content(event, trigger, player) {
		trigger.num++;
	},
},

qunyou_duliang: {
	audio: 2,
	trigger: { global: "phaseBeginStart" },
	filter(event, player) {
		return event.player !== player;
	},
	check(event, player) {
		return get.attitude(player, event.player);
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const used = player.storage.qunyou_duliang_used;
		if (used?.[0] && used?.[1]) return;
		const X = target.maxHp;
		let cards = get.cards(X);
		if (!cards.length) return;
		await game.cardsGotoOrdering(cards);

		await target.viewCards(`${get.translation(player)}的【督粮】`, cards);

		cards = cards.filterInD("od");
		if (!cards.length) return;

		const can1 = (player.storage.qunyou_duliang_used?.[0] || 0) < 1;
		const can2 = (player.storage.qunyou_duliang_used?.[1] || 0) < 1;
		if (!can1 && !can2) return;

		const choices = [];
		if (can1) choices.push("使用其中一张牌并跳过摸牌阶段");
		if (can2) choices.push("摸牌阶段多摸一张，改为弃牌阶段后执行");
		const choice = await player.chooseControl(choices).set("ai", function() {
			const evt = _status.event.getParent("qunyou_duliang");
			const target = evt?.trigger?.player;
			if (!target) return 0;
			if (get.attitude(get.player(), target) < 0) return 0;
			if (target.hp <= 2 || target.countCards("h") <= 1) return 1;
			return 0;
		}).forResult();

		if (choice.control.includes("使用")) {
			if (!player.storage.qunyou_duliang_used) player.storage.qunyou_duliang_used = [0, 0];
			player.storage.qunyou_duliang_used[0]++;

			const result = await target
				.chooseButton(["【督粮】选择一张使用", cards])
				.set("filterButton", btn => target.hasUseTarget(btn.link))
				.set("ai", button => get.value(button.link, target, "raw"))
				.forResult();
			if (result.bool) {
				const card = result.links[0];
				cards.remove(card);
				target.$gain2(card, false);
				await game.delayx();
				await target.chooseUseTarget(true, card, false);
			}
			target.skip("phaseDraw");
		} else {
			if (!player.storage.qunyou_duliang_used) player.storage.qunyou_duliang_used = [0, 0];
			player.storage.qunyou_duliang_used[1]++;

			const phaseList = trigger.phaseList;
			phaseList.splice(phaseList.indexOf("phaseDraw"), 1);
			phaseList.splice(phaseList.indexOf("phaseDiscard") + 1, 0, "phaseDraw");
			target.addTempSkill("qunyou_duliang_bonus", "phaseAfter");
		}

		if (cards.length) {
			cards.reverse();
			game.cardsGotoPile(cards, "insert");
		}
	},
	reset(player) {
		player.storage.qunyou_duliang_used = [0, 0];
	},
	subSkill: {
		roundClear: {
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			content() {
				player.storage.qunyou_duliang_used = [0, 0];
			},
		},
		bonus: {
			trigger: { player: "phaseDrawBegin1" },
			forced: true,
			popup: false,
			silent: true,
			charlotte: true,
			content() {
				trigger.num++;
			},
		},
	},
},

qunyou_xiaqing: {
	audio: 2,
	trigger: { global: "viewCardsBegin" },
	filter(event, player) {
		if (event.player === player) return false;
		return event.cards?.length > 0;
	},
	check(event, player) {
		if (!event.cards?.length || !player.countCards("h")) return 0;
		const maxV = Math.max(...event.cards.map(c => get.value(c, player)));
		const minH = Math.min(...player.getCards("h").map(c => get.value(c, player)));
		return maxV > minH ? maxV - minH : 0;
	},
	direct: true,
	async content(event, trigger, player) {
		const cards = trigger.cards.slice();
		if (!cards.length) return;
		const handCards = player.getCards("h");
		if (!handCards.length) return;

		const go = await player
			.chooseBool(get.prompt("qunyou_xiaqing"), "交换观看的牌")
			.forResult();
		if (!go?.bool) return;

		await player.viewCards("狭情：观看的牌", cards);

		const result = await player
			.chooseToMove("狭情：选择要交换的牌（两侧等量）")
			.set("list", [
				["观看的牌", cards],
				["我的手牌", handCards],
			])
			.set("filterMove", (from, to, moved) => {
				if (typeof to == "number") return false;
				const in0 = c => moved[0].includes(c);
				const in1 = c => moved[1].includes(c);
				if ((in0(from.link) && in0(to.link)) || (in1(from.link) && in1(to.link))) return false;
				return true;
			})
			.set("processAI", function (list) {
				const viewed = list[0][1].slice();
				const hand = list[1][1].slice();
				if (!viewed.length || !hand.length) return [viewed, hand];
				viewed.sort((a, b) => get.value(b) - get.value(a));
				hand.sort((a, b) => get.value(a) - get.value(b));
				const num = Math.min(viewed.length, hand.length);
				const toTake = viewed.slice(0, num);
				const toGive = hand.slice(0, num);
				return [
					viewed.filter(c => !toTake.includes(c)).concat(toGive),
					hand.filter(c => !toGive.includes(c)).concat(toTake),
				];
			})
			.forResult();

		const moved = result?.moved;
		if (!moved?.[0]?.length || !moved?.[1]?.length) return;

		const myTake = moved[1].filter(c => cards.includes(c));
		const myGive = moved[0].filter(c => handCards.includes(c));
		if (!myTake.length || !myGive.length) return;

		await player.gain(myTake, "gain2");
		if (myGive.length) {
			await player.lose(myGive, ui.special).set("getlx", false);
			await game.cardsGotoPile(myGive.slice().reverse(), "insert");
		}

		const cur = _status.currentPhase;
		if (!cur?.isIn()) return;

		const penalty = await cur.chooseControl(
			"弃置一张牌，令" + get.translation(player) + "失去1点体力",
			"交给" + get.translation(player) + "一张牌，令其重置【督粮】"
		).set("ai", function() {
			return get.attitude(cur, player) < 0 ? 0 : 1;
		}).forResult();

		if (penalty.control.includes("弃置")) {
			await cur.chooseToDiscard("he", true);
			await player.loseHp(1);
		} else {
			const giveResult = await cur.chooseCard("he", true, "交给" + get.translation(player) + "一张牌")
				.set("ai", function(card) {
					return -get.value(card, get.player());
				})
				.forResult();
			if (giveResult.bool) {
				await cur.give(giveResult.cards, player);
			}
			lib.skill.qunyou_duliang.reset(player);
		}
	},
},

qunyou_nilang: {
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		if (event.player !== _status.currentPhase) return false;
		const name = get.name(event.card, false);
		return name === "sha" || get.type(name) === "equip";
	},
	check(event, player) {
		if (player.hp <= 1 && !player.countCards("h", card => get.name(card) === "sha" || get.type(card) === "equip")) return 0;
		return 1;
	},
	async content(event, trigger, player) {
		await player.draw();
		const name = get.name(trigger.card, false);
		if (name === "sha") {
			const cardResult = await player.chooseCard("he", card => get.type(card) === "equip" && player.hasUseTarget(card), "逆浪：选择一张装备牌使用")
				.set("ai", card => 4 + player.getUseValue(card))
				.forResult();
			if (cardResult.bool && cardResult.cards?.length) {
				await player.chooseUseTarget(cardResult.cards[0], true,"nopopup");
			} else {
				await player.loseHp(1);
			}
		} else {
			const shaCards = player.getCards("he", card => get.name(card) === "sha");
			if (!shaCards.length) {
				await player.loseHp(1);
			} else {
				const cardResult = await player.chooseCard("he", card => get.name(card) === "sha", "逆浪：选择一张【杀】使用")
					.set("ai", card => player.getUseValue({ name: "sha" }))
					.forResult();
				if (cardResult.bool && cardResult.cards?.length) {
					await player.chooseUseTarget(cardResult.cards[0], "逆浪：选择【杀】的目标", false, "nodistance");
				} else {
					await player.loseHp(1);
				}
			}
		}
	},
},

qunyou_kongxin: {
	trigger: { target: "useCardToTarget" },
	forced: true,
	filter(event, player) {
		return event.directHit?.includes(player) || event.player === player;
	},
	async content(event, trigger, player) {
		if (player.isDamaged()) {
			await player.recover(1);
		} else {
			await player.draw(2);
			await player.loseHp(2);
		}
	},
},

qunyou_shangzhao: {
	trigger: { global: "loseAfter" },
	forced: true,
	filter(event, player) {
		const loser = event.player;
		const seat1 = game.players.find(p => p.getSeatNum() === 1);
		if (loser !== player && loser !== seat1) return false;
		const evt = event.getl(loser);
		if (!evt?.es?.length) return false;
		if (player.hasSkill("qunyou_shangzhao_used")) return false;
		return true;
	},
	async content(event, trigger, player) {
		player.addTempSkill("qunyou_shangzhao_used", "roundStart");
		const loser = trigger.player;
		const seat1 = game.players.find(p => p.getSeatNum() === 1);
		const currentTurn = _status.currentPhase;
		const otherParty = loser === player ? seat1 : player;
		if (!otherParty?.isIn() || !currentTurn?.isIn()) return;
		if (!otherParty.countCards("h")) return;
		otherParty.when({ global: "phaseJieshuBegin" })
			.filter(evt => evt.player === currentTurn)
			.step(async (event, trigger, player) => {
				if (!player.countCards("h") || !currentTurn.isIn()) return;
				const { bool, cards } = await player.chooseCard("h", true, "将一张手牌当【无中生有】对" + get.translation(currentTurn) + "使用")
					.set("ai", card => {
						const player2 = _status.event.player;
						return get.attitude(player2, currentTurn) > 0 ? -get.value(card) : get.value(card);
					})
					.forResult();
				if (!bool || !cards?.length) return;
				player.storage.qunyou_shangzhao_noRespond = player.countCards("h") > currentTurn.countCards("h");
				await player.useCard({ name: "wuzhong" }, cards, currentTurn, "qunyou_shangzhao");
				delete player.storage.qunyou_shangzhao_noRespond;
			});
	},
	subSkill: {
		used: { charlotte: true },
		norespond: {
			charlotte: true,
			trigger: { player: "useCard1" },
			filter(event, player) {
				return event.skill == "qunyou_shangzhao" && player.storage.qunyou_shangzhao_noRespond;
			},
			forced: true,
			popup: false,
			content(event, trigger, player) {
				for (const target of trigger.targets || []) {
					trigger.directHit.add(target);
				}
				game.log(trigger.card, "不可被响应");
			},
		},
	},
},

qunyou_mitu: {
	trigger: { player: "phaseBegin" },
	forced: true,
	init(player) {
		if (!Array.isArray(player.storage.qunyou_mitu_left)) {
			player.storage.qunyou_mitu_left = ["phaseZhunbei", "phaseDiscard", "phaseUse"];
			player.storage.qunyou_mitu_right = ["phaseJieshu", "phaseDraw", "phaseJudge"];
		}
	},
	content(event, trigger, player) {
		const left = player.storage.qunyou_mitu_left;
		const right = player.storage.qunyou_mitu_right;
		const list = [];
		for (let i = 0; i < 3; i++) {
			list.push(left[i]);
			list.push(right[i] + "|qunyou_mitu");
		}
		trigger.phaseList = list;
	},
},

qunyou_jinlu: {
	trigger: { player: ["useCardAfter", "damageAfter"] },
	filter(event, player) {
		return !!player.storage.qunyou_mitu_left;
	},
	async content(event, trigger, player) {
		const result = await jinluSwapUI(player);
		if (!result?.bool || !result.swapped) return;
		game.log(player, "对调了「迷途」的阶段规则");
	},
	subSkill: {
		turn: {
			trigger: { player: "phaseBeginStart" },
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				player.storage.qunyou_jinlu_turnCount = (player.storage.qunyou_jinlu_turnCount || 0) + 1;
			},
		},
		check: {
			trigger: { player: "phaseAfter" },
			forced: true,
			popup: false,
			filter(event, player) {
				if (!player.hasSkill("qunyou_mitu")) return false;
				const list = event.phaseList;
				if (!list || list.length !== 6) return false;
				const def = ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];
				for (let i = 0; i < 6; i++) {
					const base = (list[i] || "").split("|")[0].split("-")[0];
					if (base.startsWith("skip")) return false;
					if (base !== def[i]) return false;
				}
				const X = player.storage.qunyou_jinlu_turnCount || 0;
				return X > 0;
			},
			async content(event, trigger, player) {
				const X = player.storage.qunyou_jinlu_turnCount || 0;
				await player.damage(player, X, "fire");
				if (!player.isIn()) return;
				const result = await player.chooseTarget(true, lib.filter.notMe,
					"燼路：选择一名角色受到" + X + "点火焰伤害").forResult();
				if (result?.bool && result.targets?.length) {
					await player.damage(result.targets[0], X, "fire");
				}
			},
			backup: {},
		},
	},
},
};
