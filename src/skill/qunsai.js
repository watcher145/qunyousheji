import { lib, game, get, ui, _status } from "noname";
import { getTurnDiscardCards, jinluSwapUI, qunyou_beixuan_cancelEvent, qunyou_bingzhu_cardOptions, qunyou_bingzhu_counts, qunyou_damageCardInDiscardThisRound, qunyou_guiwu_targetKind, qunyou_guiwu_targets, qunyou_jidu_discardedShan, qunyou_jidu_isCard, qunyou_lingzhen_limit, qunyou_lingzhen_useLoop, qunyou_miaoyu_canUse, qunyou_miaoyu_controls, qunyou_miaoyu_modAiValue, qunyou_no1Player, qunyou_shuze_effect, qunyou_suijian_options, qunyou_suijian_prompt, qunyou_suijian_queueTargets, qunyou_yaliang_addDelayed, qunyou_yaliang_clearDelayed, qunyou_yaliang_damageCards, qunyou_yaliang_delayed, qunyou_yanghui_phaseDiscardCards, qunyou_yongxu_baseCards, qunyou_yongxu_isTrick, qunyou_shenshi_getTurnDiscardCards, zishu_yusan_getCards } from "./helpers.js";

// 群赛角色的技能
export const skills = {
// === 灵镇 ===
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

// === 灵震 ===
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

// === 咏絮 ===
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
					position: "h",
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

// === 妙喻 ===
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
				/** 武将牌上的技能 = 武将初始携带的技能（参考穿屋 olchuanwu 的 getStockSkills） */
				const skillOrder = player.getStockSkills(true, true);
				/** precontent 会被 StepCompiler 单独抽出执行，不能引用 backup 闭包里的 X/skillOrder */
				player.storage.qunyou_miaoyu_pending = {
					banX: X,
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
							player.storage.qunyou_miaoyu_ban_order = d.banOrder;
						}
						player.logSkill("qunyou_miaoyu");
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
		group: ["qunyou_miaoyu_restore"],
		subSkill: {
			up: {
				charlotte: true,
				onremove: true,
				mark: true,
				markimage: "image/card/handcard.png",
				intro: {
					content(storage, player) {
						return `<li>手牌上限+1<br><li>当前手牌上限：${player.getHandcardLimit()}`;
					},
				},
				mod: {
					maxHandcard(player, num) {
						return num + 1;
					},
				},
			},
			down: {
				charlotte: true,
				onremove: true,
				mark: true,
				markimage: "image/card/handcard.png",
				intro: {
					content(storage, player) {
						return `<li>手牌上限-1<br><li>当前手牌上限：${player.getHandcardLimit()}`;
					},
				},
				mod: {
					maxHandcard(player, num) {
						return num - 1;
					},
				},
			},
			restore: {
				trigger: {
					player: "useCardAfter",
				},
				forced: true,
				popup: false,
				silent: true,
				charlotte: true,
				filter(event, player) {
					return event.skill === "qunyou_miaoyu_backup" && event.card?.name === "wuxie";
				},
				async content(event, trigger, player) {
					const banX = player.storage.qunyou_miaoyu_ban_x;
					const order = player.storage.qunyou_miaoyu_ban_order;
					delete player.storage.qunyou_miaoyu_ban_x;
					delete player.storage.qunyou_miaoyu_ban_order;
					if (typeof banX !== "number" || banX < 1 || !Array.isArray(order) || banX > order.length) {
						return;
					}
					const sid = order[banX - 1];
					if (sid && player.hasSkill(sid)) {
						const list = player.storage.qunyou_miaoyu_ban_skills || [];
						if (!list.includes(sid)) {
							list.push(sid);
						}
						player.storage.qunyou_miaoyu_ban_skills = list;
						player.disableSkill("qunyou_miaoyu_banmark", [sid]);
						player.addTempSkill("qunyou_miaoyu_banmark");
					}
				},
				"skill_id": "qunyou_miaoyu_restore",
				sub: true,
				sourceSkill: "qunyou_miaoyu",
				"_priority": 0,
			},
			banmark: {
				init(player2, skill) {
					player2.disableSkill(skill, player2.storage.qunyou_miaoyu_ban_skills || []);
				},
				onremove(player2, skill) {
					player2.enableSkill(skill);
					delete player2.storage.qunyou_miaoyu_ban_skills;
				},
				locked: true,
				mark: true,
				charlotte: true,
				intro: {
					content(storage, player2, skill) {
						const list = player2.storage.qunyou_miaoyu_ban_skills || [];
						return list.length ? "失效技能：" + list.map(i => get.translation(i)).join("、") : "无";
					},
				},
				"skill_id": "qunyou_miaoyu_banmark",
				sub: true,
				sourceSkill: "qunyou_miaoyu",
				"_priority": 0,
			},
		},
	},

// === 养晦 ===
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

// === 雅量 ===
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

// === 树泽 ===
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

// === 击渡 ===
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

// === 兵主 ===
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

// === 悖玄 ===
	qunyou_beixuan: {
		audio: 2,
		cancelEvent(trigger) {
			qunyou_beixuan_cancelEvent(trigger);
		},
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
				// useSkill 结算已自动输出“对XX发动了【悖玄】”，这里不再重复 logSkill
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
					lib.skill.qunyou_beixuan.cancelEvent(trigger);
				},
			},
		},
	},

// === 归物 ===
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

// === 碎坚 ===
	qunyou_suijian: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		names: ["tiesuo", "suijiyingbian", "jiu", "sha"],
		filter(event, player) {
			return qunyou_suijian_options(player, []).length > 0;
		},
		async content(event, trigger, player) {
			const used = [];
			let actor = player;
			let queue = [];
			while (used.length < lib.skill.qunyou_suijian.names.length) {
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

// === 传道 ===
shanhe_chuandao: {
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
            if (player.hasSkill("shanhe_shifu")) return get.value(card);
            return Math.max(0.1, 6 - get.value(card));
        }).forResult();
        if (!cardResult.bool || !cardResult.cards?.length) return;
        const cards = cardResult.cards;
        const targetResult = await player.chooseTarget("传道：选择分配目标", true, (card, p, t) => t !== p).set("ai", (target) => {
            const turnTargets = player.storage.shanhe_chuandao_turnTargets || [];
            const alreadyGiven = turnTargets.includes(target.playerid);
            const att = get.attitude(player, target);
            if (att > 0) {
                if (alreadyGiven) return 0.5;
                const nh = target.countCards("h");
                const suitsLeft = 4 - (player.storage.shanhe_chuandao_suits || []).length;
                if (target.hasSkill("haoshi")) return 10;
                if (nh <= 1) return 8;
                if (nh <= target.hp) return 6;
                if (suitsLeft > 0) return 4;
                if (player.hasSkill("shanhe_shifu") && target.isDamaged()) return 3;
                return 2;
            }
            if (alreadyGiven) return 0.01;
            const hasQiyi = player.hasSkill("shanhe_qiyi");
            const hasShifu = player.hasSkill("shanhe_shifu");
            const noMuzhong = !player.storage.shanhe_muzhong;

            if (hasQiyi) return 0;
            if (hasShifu && target.isDamaged()) return 0;
            if (hasShifu) return 0.3;
            if (noMuzhong) return 1;
            return 0.05;
        }).forResult();
        if (!targetResult.bool || !targetResult.targets?.length) return;
        const target = targetResult.targets[0];
        await player.give(cards, target);
        player.storage.shanhe_chuandao_suits ??= [];
        player.storage.shanhe_chuandao_targets ??= [];
        player.storage.shanhe_chuandao_turnTargets ??= [];
        for (const card of cards) {
            const suit = get.suit(card, player);
            if (lib.suit.includes(suit) && !player.storage.shanhe_chuandao_suits.includes(suit)) {
                player.storage.shanhe_chuandao_suits.push(suit);
            }
        }
        if (!player.storage.shanhe_chuandao_targets.includes(target.playerid)) {
            player.storage.shanhe_chuandao_targets.push(target.playerid);
        }
        if (!player.storage.shanhe_chuandao_turnTargets.includes(target.playerid)) {
            player.storage.shanhe_chuandao_turnTargets.push(target.playerid);
        }
        player.markSkill("shanhe_chuandao");
        if (player.storage.shanhe_chuandao_suits.length >= 4 && !player.storage.shanhe_chuandao_drew) {
            const X = Math.min(player.storage.shanhe_chuandao_turnTargets.length, 3);
            await player.draw(X);
            player.storage.shanhe_chuandao_drew = true;
            player.storage.shanhe_chuandao_suits = [];
            player.markSkill("shanhe_chuandao");
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
                if (!player.storage.shanhe_muzhong) return 0.5;
                return 0;
            }
        },
    },
    group: ["shanhe_chuandao_clear"],
    mark: true,
    marktext: "道",
    intro: {
        content(storage, player) {
            const suits = player.storage.shanhe_chuandao_suits || [];
            const turnTargets = player.storage.shanhe_chuandao_turnTargets || [];
            const targets = player.storage.shanhe_chuandao_targets || [];
            const getNames = ids => ids.map(id => {
                const p = game.findPlayer(pp => pp.playerid === id) || game.dead.find(pp => pp.playerid === id);
                return p ? get.translation(p) : "未知";
            }).join("、");
            const parts = [];
            if (suits.length) parts.push(`已集花色：${suits.map(s => get.translation(s)).join("、")}`);
            if (turnTargets.length) parts.push(`本回合已传道：${turnTargets.length}人`);
            if (targets.length) parts.push(`累计传道：${getNames(targets)}`);
            return parts.length ? parts.join("<br>") : "无记录";
        },
    },
    subSkill: {
        clear: {
            trigger: {
                player: "phaseAfter",
            },
            forced: true,
            popup: false,
            silent: true,
            charlotte: true,
            content(event, trigger, player) {
                delete player.storage.shanhe_chuandao_drew;
                player.storage.shanhe_chuandao_turnTargets = [];
                if ((player.storage.shanhe_chuandao_suits || []).length) {
                    player.markSkill("shanhe_chuandao");
                } else {
                    player.unmarkSkill("shanhe_chuandao");
                }
            },
            "skill_id": "shanhe_chuandao_clear",
            sub: true,
            sourceSkill: "shanhe_chuandao",
            "_priority": 0,
        },
    },
},

// === 募众 ===
shanhe_muzhong: {
    audio: 2,
    enable: "phaseUse",
    limited: true,
    filter(event, player) {
        const targets = player.storage.shanhe_chuandao_targets;
        if (!Array.isArray(targets) || !targets.length) return false;
        return targets.some(id => {
            const p = game.findPlayer(pp => pp.playerid === id);
            return p?.isIn() && p.countCards("h") > 0;
        });
    },
    async content(event, trigger, player) {
        player.awakenSkill(event.name);
        const targetIds = player.storage.shanhe_chuandao_targets || [];
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
            await player.addSkill("shanhe_qiyi");
            player.popup("起义");
        } else {
            await player.addSkill("shanhe_shifu");
            player.popup("施符");
        }
    },
    ai: {
        order: 1,
        result: { player: 1 },
    },
},

// === 起义 ===
shanhe_qiyi: {
    audio: 2,
    group: ["shanhe_qiyi_gain", "shanhe_qiyi_loss"],
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
shanhe_shifu: {
    audio: 2,
    trigger: { global: "gainAfter" },
    forced: true,
    filter(event, player) {
        if (event.player === player) return false;
        if (_status.currentPhase === event.player) return false;
        if (event.giver !== player) return false;
        const cards = event.getg?.(event.player) || event.cards || [];
        if (cards.some(c => c.hasGaintag?.("shanhe_shifu_return"))) return false;
        return true;
    },
    async content(event, trigger, player) {
        const target = trigger.player;
        if (!target?.isIn()) return;
        const cards = trigger.getg?.(target) || trigger.cards || [];
        if (!cards.length) return;
        await target.addToExpansion(cards, player, "give").forResult();
        for (const card of cards) {
            card.addGaintag("shanhe_shifu_return");
        }
        await target.recover(1);
        if (!target.hasSkill("shanhe_shifu_return")) {
            target.storage.shanhe_shifu_owner = player;
            target.addTempSkill("shanhe_shifu_return", { player: "phaseBeginStartAfter" });
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
                const skillOwner = player.storage.shanhe_shifu_owner;
                if (!skillOwner?.isIn()) {
                    player.removeSkill("shanhe_shifu_return");
                    return;
                }
                const fuCards = player.getExpansions("shanhe_shifu_return");
                if (!fuCards.length) {
                    player.removeSkill("shanhe_shifu_return");
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
                    card.removeGaintag("shanhe_shifu_return");
                }
                player.removeSkill("shanhe_shifu_return");
            },
        },
    },
},

// === 镇叛 ===
shanhe_zhenpan: {
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
		target.addTempSkill("shanhe_zhenpan_ban", { global: "phaseJieshuAfter" });
		target.storage.shanhe_zhenpan_ban = suits;
	},
	// check 必须位于技能顶层:触发技 AI 询问只读 info.check(content.js:3589),ai.check 不被消费
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
	ai: {
		order: 5,
		result: { player: 1 },
	},
},

// === 镇叛·禁 ===
shanhe_zhenpan_ban: {
	charlotte: true,
	onremove: true,
	mod: {
		cardEnabled(card, player) {
			const suits = player.storage.shanhe_zhenpan_ban;
			if (suits?.length && suits.includes(get.suit(card))) return false;
		},
		cardRespondable(card, player) {
			const suits = player.storage.shanhe_zhenpan_ban;
			if (suits?.length && suits.includes(get.suit(card))) return false;
		},
		cardSavable(card, player) {
			const suits = player.storage.shanhe_zhenpan_ban;
			if (suits?.length && suits.includes(get.suit(card))) return false;
		},
	},
	mark: true,
	marktext: "镇",
	intro: { content: (storage) => "本回合不能使用或打出" + (storage || []).map(s => get.translation(s)).join("、") + "的牌" },
},

// === 抗辩 ===
shanhe_kangbian: {
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
	group: "shanhe_kangbian_pindian",
	// check 必须位于技能顶层:触发技 AI 询问只读 info.check(content.js:3589),ai.check 不被消费
	check(event, player) {
		const target = event.player === player ? event.target : event.player;
		if (get.attitude(player, target) >= 0) return 0;
		const hasBig = player.getCards("h").some(c => get.number(c) >= 10);
		return hasBig ? 1 : 0;
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
},

// === 抗辩·拼点 ===
shanhe_kangbian_pindian: {
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

// === 隐山 ===
shanhe_yinshan: {
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
	// check 必须位于技能顶层:触发技 AI 询问只读 info.check(content.js:3589),ai.check 不被消费
	check(event, player) {
		const handCards = player.getCards("h");
		if (!handCards.length) return 0;
		const totalValue = handCards.reduce((sum, c) => sum + get.value(c, player), 0);
		const avgValue = totalValue / handCards.length;
		const lostHp = player.maxHp - player.hp;
		if (avgValue < 5 && lostHp > handCards.length) return 1;
		return 0;
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
},// 绮武

// === 拥立 ===
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
		if (player.hasSkill("shanhe_yunmo")) player.removeSkill("shanhe_yunmo");
		if (!player.hasSkill("shanhe_fuzhu")) player.addSkill("shanhe_fuzhu");
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
				player.addSkill("shanhe_yunmo");
				player.removeSkill("shanhe_fuzhu");
			},
		},
		mark: {
			mark: true,
			intro: { content: "被董相国拥立了" },
		},
	},
},

// === 讨佞 ===
shanhe_taoning: {
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
			.set("prompt", get.prompt("shanhe_taoning"))
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

// === 扶主 ===
shanhe_fuzhu: {
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

// === 陨没 ===
shanhe_yunmo: {
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

// === 督粮 ===
zishu_duliang: {
	audio: 2,
	trigger: { global: "phaseBeginStart" },
	group: ["zishu_duliang_roundClear"],
	filter(event, player) {
		if (event.player === player) return false;
		const used = player.storage.zishu_duliang_used;
		if (used?.[0] && used?.[1]) return false;
		return true;
	},
	check(event, player) {
		return get.attitude(player, event.player);
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const X = target.maxHp;
		let cards = get.cards(X);
		if (!cards.length) return;
		await game.cardsGotoOrdering(cards);

		await target.viewCards(`${get.translation(player)}的【督粮】`, cards);

		cards = cards.filterInD("od");
		if (!cards.length) return;

		const can1 = (player.storage.zishu_duliang_used?.[0] || 0) < 1;
		const can2 = (player.storage.zishu_duliang_used?.[1] || 0) < 1;
		if (!can1 && !can2) return;

		const choices = [];
		if (can1) choices.push("使用其中一张牌并跳过摸牌阶段");
		if (can2) choices.push("摸牌阶段多摸一张，改为弃牌阶段后执行");
		const choice = await player.chooseControl(choices).set("ai", function() {
			const evt = _status.event.getParent("zishu_duliang");
			const target = evt?.trigger?.player;
			if (!target) return 0;
			if (get.attitude(get.player(), target) < 0) return 0;
			if (target.hp <= 2 || target.countCards("h") <= 1) return 1;
			return 0;
		}).forResult();

		if (choice.control.includes("使用")) {
			if (!player.storage.zishu_duliang_used) player.storage.zishu_duliang_used = [0, 0];
			player.storage.zishu_duliang_used[0]++;

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
			if (!player.storage.zishu_duliang_used) player.storage.zishu_duliang_used = [0, 0];
			player.storage.zishu_duliang_used[1]++;

			const phaseList = trigger.phaseList;
			phaseList.splice(phaseList.indexOf("phaseDraw"), 1);
			phaseList.splice(phaseList.indexOf("phaseDiscard") + 1, 0, "phaseDraw");
			target.addTempSkill("zishu_duliang_bonus", "phaseAfter");
		}

		if (cards.length) {
			cards.reverse();
			game.cardsGotoPile(cards, "insert");
		}
	},
	reset(player) {
		player.storage.zishu_duliang_used = [0, 0];
	},
	subSkill: {
		roundClear: {
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				player.storage.zishu_duliang_used = [0, 0];
			},
		},
		bonus: {
			trigger: { player: "phaseDrawBegin1" },
			forced: true,
			popup: false,
			silent: true,
			charlotte: true,
			content(event, trigger, player) {
				trigger.num++;
			},
		},
	},
},

// === 衡澜 ===
zishu_henglan: {
	audio: 2,
	trigger: { global: "roundStart" },
	filter(event, player) {
		if (player.canMoveCard()) return true;
		return player.countCards("he") > 0 && game.hasPlayer((current) => current != player);
	},
	check(event, player) {
		return 1;
	},
	async content(event, trigger, player) {
		// 重置本轮记录：当事人、已摸角色、受伤次数
		player.storage.zishu_henglan_pair = null;
		player.storage.zishu_henglan_used = [];
		player.storage.zishu_henglan_dmg = {};
		const choices = [];
		if (player.canMoveCard()) choices.push("移动场上的一张牌");
		if (player.countCards("he")) choices.push("分配你的一张牌");
		if (!choices.length) return;
		const choice = await player
			.chooseControl("cancel2")
			.set("choiceList", choices)
			.set("prompt", get.prompt("zishu_henglan"))
			.set("ai", () => 0)
			.forResult();
		if (choice.control == "cancel2") return;
		if (choices[choice.index] == "移动场上的一张牌") {
			const result = await player.moveCard(true).forResult();
			if (!result?.bool || !result.targets || result.targets.length < 2) return;
			player.storage.zishu_henglan_pair = [result.targets[0], result.targets[1]];
		} else {
			const give = await player.chooseCard("he", true, "衡澜：选择分配的一张牌").forResult();
			const card = give?.cards?.[0];
			if (!card) return;
			const targetResult = await player
				.chooseTarget(true, "衡澜：选择一名角色获得这张牌", (cardx, player2, target) => target != player)
				.forResult();
			const target = targetResult?.targets?.[0];
			if (!target) return;
			await player.give([card], target);
			player.storage.zishu_henglan_pair = [player, target];
		}
	},
	group: ["zishu_henglan_effect"],
	subSkill: {
		effect: {
			charlotte: true,
			trigger: { global: "damageEnd" },
			direct: true,
			filter(event, player) {
				return player.storage.zishu_henglan_pair != null;
			},
			async content(event, trigger, player) {
				const pair = player.storage.zishu_henglan_pair;
				const damaged = trigger.player;
				// 本轮受伤次数计数（含本次）
				const map = (player.storage.zishu_henglan_dmg ||= {});
				map[damaged.playerid] = (map[damaged.playerid] || 0) + 1;
				if (!pair.includes(damaged)) return;
				if (player.storage.zishu_henglan_used.includes(damaged.playerid)) return;
				const X = (map[pair[0].playerid] || 0) + (map[pair[1].playerid] || 0);
				if (X <= 0) return;
				const result = await damaged
					.chooseBool("衡澜：是否摸" + get.cnNumber(X) + "张牌？")
					.set("ai", () => true)
					.forResult();
				if (result?.bool) {
					player.storage.zishu_henglan_used.push(damaged.playerid);
					damaged.logSkill("zishu_henglan");
					await damaged.draw(X);
				}
			},
		},
	},
},

// === 急鞭 ===
zishu_jibi: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filterCard: () => false,
	selectCard: 0,
	viewAs: { name: "sha", isCard: true, storage: { zishu_jibi: true } },
	filter(event, player) {
		return game.hasPlayer((current) => current != player && player.canUse(get.autoViewAs({ name: "sha" }, "unsure"), current, false));
	},
	prompt: "急鞭：视为使用一张【杀】，其目标可以将坐骑牌当【闪】使用",
	check() {
		return 1;
	},
	ai: {
		// 出牌阶段 AI 排序依赖 ai.order;无素材虚拟技,order 取低值(带"目标可当闪/回复"的温和效果)
		order: 4,
		result: { player: 1 },
	},
	mod: {
		cardUsable(card, player, num) {
			if (card?.storage?.zishu_jibi) return Infinity;
		},
	},
	group: ["zishu_jibi_target", "zishu_jibi_recover"],
	subSkill: {
		target: {
			charlotte: true,
			trigger: { global: "useCardToTarget" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.card?.storage?.zishu_jibi;
			},
			async content(event, trigger, player) {
				trigger.target.addTempSkill("zishu_jibi_shan", { global: "useCardAfter" });
			},
		},
		shan: {
			charlotte: true,
			enable: "chooseToRespond",
			filter(event, player) {
				const rt = event.respondTo;
				return rt && rt[1]?.storage?.zishu_jibi;
			},
			filterCard(card) {
				const sub = get.subtype(card);
				return sub == "equip3" || sub == "equip4";
			},
			position: "e",
			viewAs: { name: "shan" },
			prompt: "急鞭：将一张坐骑牌当【闪】使用",
			check() {
				return 1;
			},
			hiddenCard(player, name) {
				return name == "shan" && player.countCards("e", (card) => ["equip3", "equip4"].includes(get.subtype(card))) > 0;
			},
			ai: { order: 6 },
		},
		recover: {
			charlotte: true,
			trigger: { player: "useCardAfter" },
			forced: true,
			filter(event, player) {
				if (!event.card?.storage?.zishu_jibi) return false;
				const history = player.getHistory("useCard");
				return history.length > 0 && history[0] === event;
			},
			async content(event, trigger, player) {
				for (const target of trigger.targets || []) {
					if (target.isIn() && target.hp < target.maxHp) {
						await target.recover(1);
					}
				}
			},
		},
	},
},

// === 狭情 ===
zishu_xiaqing: {
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
			.chooseBool(get.prompt("zishu_xiaqing"), "交换观看的牌")
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
			lib.skill.zishu_duliang.reset(player);
		}
	},
},

// === 逆浪 ===
zishu_nilang: {
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
			const cardResult = await player.chooseCard("h", card => get.type(card) === "equip" && player.hasUseTarget(card), "逆浪：选择一张装备牌使用")
				.set("ai", card => 4 + player.getUseValue(card))
				.forResult();
			if (cardResult.bool && cardResult.cards?.length) {
				await player.chooseUseTarget(cardResult.cards[0], true,"nopopup");
			} else {
				await player.loseHp(1);
			}
		} else {
			const shaCards = player.getCards("h", card => get.name(card) === "sha");
			if (!shaCards.length) {
				await player.loseHp(1);
			} else {
				const cardResult = await player.chooseCard("h", card => get.name(card) === "sha", "逆浪：选择一张【杀】使用")
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

// === 空馨 ===
zishu_kongxin: {
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

// === 上照 ===
zishu_shangzhao: {
	trigger: { global: "loseAfter" },
	forced: true,
	filter(event, player) {
		const loser = event.player;
		const seat1 = game.players.find(p => p.getSeatNum() === 1);
		if (loser !== player && loser !== seat1) return false;
		const evt = event.getl(loser);
		if (!evt?.es?.length) return false;
		if (player.hasSkill("zishu_shangzhao_used")) return false;
		return true;
	},
	async content(event, trigger, player) {
		player.addTempSkill("zishu_shangzhao_used", "roundStart");
		const loser = trigger.player;
		const seat1 = game.players.find(p => p.getSeatNum() === 1);
		const currentTurn = _status.currentPhase;
		const otherParty = loser === player ? seat1 : player;
		if (!otherParty?.isIn() || !currentTurn?.isIn()) return;
		if (!otherParty.countCards("h")) return;
		otherParty.when({ global: "phaseJieshuBegin" })
			.filter(evt => evt.player === currentTurn)
			.step(async (event, trigger, player) => {
				if (!player.countCards("h") || !loser.isIn()) return;
				const { bool, cards } = await player.chooseCard("h", true, "将一张手牌当【无中生有】对" + get.translation(loser) + "使用")
					.set("ai", card => {
						const player2 = _status.event.player;
						return get.attitude(player2, loser) > 0 ? -get.value(card) : get.value(card);
					})
					.forResult();
				if (!bool || !cards?.length) return;
				player.storage.zishu_shangzhao_noRespond = player.countCards("h") > loser.countCards("h");
				await player.useCard({ name: "wuzhong" }, cards, loser, "zishu_shangzhao");
				delete player.storage.zishu_shangzhao_noRespond;
			});
	},
	subSkill: {
		used: { charlotte: true },
		norespond: {
			charlotte: true,
			trigger: { global: "useCard1" },
			filter(event, player) {
				return event.skill == "zishu_shangzhao" && event.player.storage.zishu_shangzhao_noRespond;
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

// === 迷途 ===
zishu_mitu: {
	trigger: { player: "phaseBegin" },
	forced: true,
	init(player) {
		if (!Array.isArray(player.storage.zishu_mitu_left)) {
			player.storage.zishu_mitu_left = ["phaseZhunbei", "phaseDiscard", "phaseUse"];
			player.storage.zishu_mitu_right = ["phaseJieshu", "phaseDraw", "phaseJudge"];
		}
	},
	content(event, trigger, player) {
		const left = player.storage.zishu_mitu_left;
		const right = player.storage.zishu_mitu_right;
		const list = [];
		for (let i = 0; i < 3; i++) {
			list.push(left[i]);
			list.push(right[i] + "|zishu_mitu");
		}
		trigger.phaseList = list;
	},
},

// === 燼路 ===
zishu_jinlu: {
	trigger: { player: "useCardAfter", source: "damageAfter" },
	group: ["zishu_jinlu_turn", "zishu_jinlu_check"],
	filter(event, player) {
		return !!player.storage.zishu_mitu_left;
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
				player.storage.zishu_jinlu_turnCount = (player.storage.zishu_jinlu_turnCount || 0) + 1;
			},
		},
		check: {
			trigger: { player: "phaseAfter" },
			forced: true,
			popup: false,
			filter(event, player) {
				if (!player.hasSkill("zishu_mitu")) return false;
				const list = event.phaseList;
				if (!list || list.length !== 6) return false;
				const def = ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];
				for (let i = 0; i < 6; i++) {
					const base = (list[i] || "").split("|")[0].split("-")[0];
					if (base.startsWith("skip")) return false;
					if (base !== def[i]) return false;
				}
				const X = player.storage.zishu_jinlu_turnCount || 0;
				return X > 0;
			},
			async content(event, trigger, player) {
				const X = player.storage.zishu_jinlu_turnCount || 0;
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
// === 鸷刎 ===
xiaobai_zhiwen: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		var restrict = player.storage.xiaobai_zhiwen_restrict;
		var canThree = !restrict || restrict.method !== "last" ? player.countCards("hes") >= 3 : false;
		var canLast = !restrict || restrict.method !== "three" ? player.countCards("h") === 1 : false;
		if (!canThree && !canLast) return false;
		if (restrict?.name) {
			if (!lib.filter.cardEnabled({ name: restrict.name, isCard: true }, player, event)) return false;
			return player.hasUseTarget({ name: restrict.name, isCard: true }, null, false);
		}
		return (lib.filter.cardEnabled({ name: "sha", isCard: true }, player, event) && player.hasUseTarget({ name: "sha", isCard: true }, null, false))
			|| (lib.filter.cardEnabled({ name: "juedou", isCard: true }, player, event) && player.hasUseTarget({ name: "juedou", isCard: true }, null, false));
	},
	async content(event, trigger, player) {
		// 选择牌面 + 转化方式
		var restrict = player.storage.xiaobai_zhiwen_restrict;
		var list = [];
		var names = restrict?.name ? [restrict.name] : ["sha", "juedou"];
		for (var name of names) {
			if (player.countCards("hes") >= 3 && (!restrict || restrict.method !== "last")) {
				list.push([get.type(name), "", name, "three"]);
			}
			if (player.countCards("h") === 1 && (!restrict || restrict.method !== "three")) {
				list.push([get.type(name), "", name, "last"]);
			}
		}
		var dialog = ui.create.dialog("鸷刎", [list, "vcard"], "hidden");
		var chooseResult = await player.chooseButton(dialog, true).forResult();
		if (!chooseResult.bool) return;
		var cardName = chooseResult.links[0][2];
		var isLast = chooseResult.links[0][3] === "last";

		// 选择选项
		var optResult = await player.chooseControl("选项一", "选项二", "选项三", "cancel2")
			.set("choiceList", [
				"下次仅能以另一种方式转化",
				"下次仅能转化为另一种牌名",
				"背水"
			])
			.set("prompt", "鸷刎：选择一项")
			.set("ai", function() { return "cancel2" })
			.forResult();
		if (optResult.control === "cancel2") return;

		// 设置下次限制
		var st = {};
		if (optResult.index === 0 || optResult.index === 2) {
			st.method = isLast ? "three" : "last";
		}
		if (optResult.index === 1 || optResult.index === 2) {
			st.name = cardName === "sha" ? "juedou" : "sha";
		}
		if (Object.keys(st).length) {
			player.storage.xiaobai_zhiwen_restrict = st;
			player.markSkill("xiaobai_zhiwen_restrict");
		}

		// 背水：此牌对其他角色造成的伤害+1
		if (optResult.index === 2) {
			player.addTempSkill("xiaobai_zhiwen_backwater_bonus", { player: "useCardAfter" });
		}

		// 选牌并印牌使用
		var cardResult = await player.chooseCard(isLast ? "h" : "hes", isLast ? 1 : 3, true).set("prompt", "鸷刎：选择" + (isLast ? "一张手牌" : "三张牌") + "转化").forResult();
		if (!cardResult.bool) return;
		var vcard = get.autoViewAs({ name: cardName, isCard: true, storage: { xiaobai_zhiwen: true, isLast } });
		var chooseEvt = player.chooseUseTarget(vcard, cardResult.cards, false, true);
		chooseEvt.logSkill = "xiaobai_zhiwen";
		await chooseEvt;
	},
	ai: {
		// 出牌阶段 AI 排序依赖 ai.order(此前缺失,AI 不会主动发动);强转化技取 6,
		// 收益评估由转化出的【杀】/【决斗】自带 result 承担;content 内选项(含背水)暂取保守不选
		order: 6,
		result: { player: 1 },
	},
	mod: {
		cardUsable(card, player, num) {
			if (card?.storage?.xiaobai_zhiwen) return Infinity;
		},
	},
	subSkill: {
		backwater_bonus: {
			trigger: { player: "useCard", source: "damageBegin1" },
			forced: true,
			popup: false,
			charlotte: true,
			filter(event, player) {
				if (event.skill === "xiaobai_zhiwen") return true;
				return event.target !== player && player.storage.xiaobai_zhiwen_backwater_active;
			},
			async content(event, trigger, player) {
				if (trigger.skill === "xiaobai_zhiwen") {
					player.storage.xiaobai_zhiwen_backwater_active = true;
				} else {
					trigger.num++;
				}
			},
			onremove(player) {
				delete player.storage.xiaobai_zhiwen_backwater_active;
			},
		},
		restrict: {
			charlotte: true,
			onremove(player, skill) {
				delete player.storage[skill];
			},
			mark: true,
			marktext: "鸷",
			intro: {
				content(storage, player) {
					if (!storage) return "无限制";
					var parts = [];
					if (storage.method) {
						parts.push(storage.method === "last" ? "仅能用最后一张手牌转化" : "仅能用三张牌转化");
					}
					if (storage.name) {
						parts.push("仅能转化" + get.translation(storage.name));
					}
					return parts.length ? "下次发动鸷刎" + parts.join("") : "无限制";
				},
			},
		},
	},
},

// === 泯念 ===
xiaobai_minnian: {
	audio: 2,
	trigger: { player: "dying" },
	filter(event, player) {
		return !player.hasSkill("xiaobai_minnian_used");
	},
	check(event, player) {
		return true;
	},
	async content(event, trigger, player) {
		player.addTempSkill("xiaobai_minnian_used", { player: "phaseAfter" });
		const diff = player.maxHp - player.countCards("h");
		if (diff > 0) {
			await player.draw(diff);
		} else if (diff < 0) {
			await player.loseToDiscardpile(player.getCards("h").randomGets(-diff));
		}
		const targetResult = await player.chooseTarget(2, true, "泯念：横置两名角色").set("ai", (target) => get.attitude(player, target) < 0 ? 1 : 0).forResult();
		if (targetResult.bool && targetResult.targets.length) {
			for (const target of targetResult.targets) {
				if (!target.isLinked()) {
					await target.link(true);
				}
			}
			if (targetResult.targets.includes(player) && player.hp < 1) {
				await player.recover(1 - player.hp);
			}
		}
	},
	subSkill: {
		used: {
			charlotte: true,
		},
	},
},

// === 俱焚 ===
xiaobai_jufen: {
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "fire",
	enable: "phaseUse",
	filter(event, player) {
		return player.countCards("h") === 0;
	},
	async content(event, trigger, player) {
		player.awakenSkill("xiaobai_jufen");
		await player.damage(player, 1, "fire");
		if (_status.discarded?.length) {
			await player.gain(Array.from(_status.discarded), "gain2");
		}
	},
	ai: {
		order: 3,
		result: {
			player(player) {
				let value = 0;
				const ds = _status.discarded;
				if (ds) {
					for (const c of ds) {
						if (c && get.itemtype(c) === "card") value += get.value(c, player);
					}
				}
				return value > 4 ? 1 : 0;
			},
		},
	},
},
// === 六宫 ===
qiufeng_liugong: {
	audio: 2,
	trigger: {
		global: ["gameDrawBegin", "phaseBefore"],
		player: "enterGame"
	},
	forced: true,
	popup: false,
	filter(event, player) {
		if (event.name == "gameDraw") return true;
		return (event.name != "phase" || game.phaseNumber == 0) && !player.getCards("h").some(c => c.hasGaintag("qiufeng_liugong_wai"));
	},
	async content(event, trigger, player) {
		if (trigger.name == "gameDraw") {
			const numx = trigger.num;
			trigger.num = function (p) {
				const base = typeof numx == "function" ? numx(p) : numx;
				return p === player ? 6 : base;
			};
			return;
		}
		const hs = player.getCards("h").slice(0, 6);
		for (let i = 0; i < 3; i++) {
			const group = ["wai", "nei", "zhong"][i];
			player.addGaintag(hs.slice(i * 2, i * 2 + 2), "qiufeng_liugong_" + group);
		}
		player.addShownCards(hs, "visible_qiufeng_liugong");
	},
	group: ["qiufeng_liugong_trigger", "qiufeng_liugong_reset"],
},
qiufeng_liugong_trigger: {
	audio: "qiufeng_liugong",
	trigger: { player: "loseAfter" },
	forced: true,
	filter(event, player) {
		if (player.storage.qiufeng_liugong_triggered) {
			console.log("六宫 filter FAIL: triggered=" + player.storage.qiufeng_liugong_triggered);
			return false;
		}
		const remaining = player.getCards("h").filter(c =>
			["wai", "nei", "zhong"].some(g => c.hasGaintag("qiufeng_liugong_" + g))
		);
		if (!remaining.length) {
			console.log("六宫 filter FAIL: no remaining liugong cards");
			return false;
		}
		const suits = remaining.map(c => get.suit(c));
		if (new Set(suits).size !== suits.length) {
			console.log("六宫 filter FAIL: suits not all different, suits=" + suits.join(","));
			return false;
		}
		console.log("六宫 filter PASS! remaining=" + remaining.length + " suits=" + suits.join(","));
		return true;
	},
	async content(event, trigger, player) {
		player.storage.qiufeng_liugong_triggered = true;

		const doFlow = async () => {
			if (!player.getCards("h").some(c =>
				["wai", "nei", "zhong"].some(g => c.hasGaintag("qiufeng_liugong_" + g))
			)) return;
			const liugongCards = player.getCards("h", c =>
				["wai", "nei", "zhong"].some(g => c.hasGaintag("qiufeng_liugong_" + g))
			);
			console.log("六宫 liugongCards 数量=" + liugongCards.length);
			console.log("六宫 chooseButton 选牌前");
			console.log("六宫 isMine=" + player.isUnderControl() + " isOnline=" + (player.isOnline && player.isOnline()));
			console.log("六宫 tempEvent=" + (_status.eventManager.tempEvent?.name || "null"));
			console.log("六宫 getStartedEvent=" + (_status.eventManager.getStartedEvent()?.name || "null"));
			const btnEvt = player.chooseButton(
				["选择一张六宫牌", [liugongCards, "card"]]
			).set("ai", c => Math.random());
			console.log("六宫 btnEvt.parent=" + (btnEvt.parent?.name || "null"));
			console.log("六宫 btnEvt.player=" + (btnEvt.player?.name || btnEvt.player || "null"));
			const cardRes = await btnEvt.forResult();
			console.log("六宫 chooseButton 选牌后 cardRes=" + cardRes + " bool=" + cardRes?.bool);
			if (!cardRes.bool) return;
			const chosen = cardRes.links[0];
			const list = get.inpileVCardList((info) => {
				if (info[0] !== "trick") return false;
				const name = info[2];
				const cardInfo = lib.card[name];
				return !cardInfo?.delay && !cardInfo?.notarget && !get.tag({ name }, "damage");
			});
			if (!list.length) return;
			console.log("六宫 chooseButton 选锦囊前 list.length=" + list.length);
			console.log("六宫 2nd tempEvent=" + (_status.eventManager.tempEvent?.name || "null"));
			console.log("六宫 2nd getStartedEvent=" + (_status.eventManager.getStartedEvent()?.name || "null"));
			await game.delayx();
			const trickEvt = player.chooseButton(
				["六宫：选择一张普通锦囊牌", [list, "vcard"]], true
			).set("ai", button => {
				return player.getUseValue({ name: button.link[2], isCard: true });
			});
			console.log("六宫 2nd btnEvt.parent=" + (trickEvt.parent?.name || "null"));
			const trickRes = await trickEvt.forResult();
			console.log("六宫 chooseButton 选锦囊后 trickRes=" + trickRes + " bool=" + trickRes?.bool);
			if (!trickRes.bool) return;
			const trickName = trickRes.links[0][2];
			await player.chooseUseTarget({ name: trickName, isCard: true }, [chosen], true).forResult();
			for (const group of ["wai", "nei", "zhong"]) {
				const tag = "qiufeng_liugong_" + group;
				const existing = player.getCards("h").filter(c => c.hasGaintag(tag));
				const need = 2 - existing.length;
				if (need <= 0) continue;
				const drawn = [];
				for (let i = 0; i < need && ui.cardPile.childNodes.length; i++) {
					drawn.push(ui.cardPile.lastChild);
				}
				if (drawn.length) {
					await player.gain(drawn, "gain2");
					player.addGaintag(drawn, tag);
					player.addShownCards(drawn, "visible_qiufeng_liugong");
				}
			}
		};

		let parent = trigger.getParent();
		while (parent && ["lose", "loseAfter", "loseBefore"].includes(parent.name)) {
			parent = parent.getParent();
		}
		console.log("六宫 content: trigger.getParent=" + trigger.getParent()?.name + " parent=" + (parent?.name || "null") + " _triggered=" + parent?._triggered);
		if (parent && parent.name && !parent.name.endsWith("After")) {
			const afterName = parent.name + "After";
			console.log("六宫 走 player.when 延迟, afterName=" + afterName);
			const whenObj = player.when({ global: afterName }).filter(evt => {
				const result = evt === parent;
				console.log("六宫 when filter: evt=" + evt.name + " evt===parent=" + result + " evt._triggered=" + evt._triggered);
				return result;
			}).step(async () => {
				console.log("六宫 when 触发, 执行 doFlow");
				await doFlow();
				console.log("六宫 when doFlow 完成");
			});
		} else {
			console.log("六宫 走 else 立即执行");
			await doFlow();
			console.log("六宫 else doFlow 完成");
		}
	},
},
qiufeng_liugong_reset: {
	trigger: { global: "phaseBeginStart" },
	forced: true,
	silent: true,
	content(event, trigger, player) {
		delete player.storage.qiufeng_liugong_triggered;
	},
},
// === 三清 ===
qiufeng_sanqing: {
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	forced: true,
	async content(event, trigger, player) {
		const types = [];
		for (let i = 0; i < 3; i++) {
			const result = await player.judge(card => 0).forResult();
			if (result.card) {
				types.push(get.type2(result.card, player));
			}
		}
		player.storage.qiufeng_sanqing_cycle = types;
		player.storage.qiufeng_sanqing_pos = 0;
		player.storage.qiufeng_sanqing_broken = false;
	},
	mark: true,
	intro: {
		content: (storage, player) => {
			const cycle = player.storage.qiufeng_sanqing_cycle;
			if (!cycle?.length) return;
			const names = { basic: "基本", trick: "锦囊", equip: "装备" };
			const pos = player.storage.qiufeng_sanqing_pos || 0;
			const broken = player.storage.qiufeng_sanqing_broken;
			const str = cycle.map((t, i) => {
				const name = names[t] || t;
				return i === pos ? `<b>${name}</b>` : name;
			}).join("→");
			return "三清 [" + (broken ? "<s>" + str + "</s>" : str) + "]";
		},
	},
	group: ["qiufeng_sanqing_check", "qiufeng_sanqing_clear"],
},
qiufeng_sanqing_check: {
	trigger: { player: "useCardAfter" },
	forced: true,
	filter(event, player) {
		if (player.storage.qiufeng_sanqing_broken) return false;
		const cycle = player.storage.qiufeng_sanqing_cycle;
		if (!cycle?.length) return false;
		if (!event.cards?.length) return false;
		return event.cards[0].original === "h";
	},
	content(event, trigger, player) {
		const cycle = player.storage.qiufeng_sanqing_cycle;
		const pos = player.storage.qiufeng_sanqing_pos || 0;
		const card = trigger.cards[0];
		const type = get.type2(trigger.card, player);
		if (type !== cycle[pos]) {
			player.storage.qiufeng_sanqing_broken = true;
			return;
		}
		player.storage.qiufeng_sanqing_pos = (pos + 1) % 3;
		const curPos = get.position(card, true);
		if (curPos === "d") {
			ui.discardPile.removeChild(card);
		}
		card.fix();
		ui.cardPile.insertBefore(card, ui.cardPile.firstChild);
	},
},
qiufeng_sanqing_clear: {
	trigger: { player: "phaseAfter" },
	forced: true,
	silent: true,
	content(event, trigger, player) {
		delete player.storage.qiufeng_sanqing_cycle;
		delete player.storage.qiufeng_sanqing_pos;
		delete player.storage.qiufeng_sanqing_broken;
	},
},

// === 织连 ===
zishu_zhilian: {
	audio: 2,
	comboSkill: true,
	mark: true,
	marktext: "织",
	intro: {
		content: (storage, player) => {
			const data = player.storage.zishu_zhilian_data;
			if (!data) return "连招未开始";
			const suits = data.suits.map(s => get.translation(s)).join("、");
			return `进度 ${data.suits.length}/4${suits.length ? " · " + suits : ""}`;
		},
	},
	trigger: { player: "useCardAfter" },
	forced: true,
	popup: false,
	priority: 20,
	filter(event, player) {
		const data = player.storage.zishu_zhilian_data;
		if (data && data.suits.length >= 4) return false;
		return true;
	},
	async content(event, trigger, player) {
		if (!player.storage.zishu_zhilian_data)
			player.storage.zishu_zhilian_data = { suits: [] };
		const data = player.storage.zishu_zhilian_data;
		const suit = get.suit(trigger.card);
		if (suit === "none" || suit === "unsure") return;
		if (!data.suits.includes(suit)) {
			data.suits.push(suit);
			if (data.suits.length >= 4)
				trigger.zishu_zhilian_complete = true;
		} else {
			data.suits = data.suits.filter(s => s !== suit);
			const result = await player
				.chooseCard(
					"织连：连招中断，是否重铸两张牌以继续？",
					2, "he",
					(card) => {
						if (!player.canRecast(card)) return false;
						if (ui.selected.cards.length && get.type(card) !== get.type(ui.selected.cards[0]))
							return false;
						return true;
					}
				)
				.set("ai", card => 6 - get.value(card))
				.forResult();
			if (result.bool) {
				await player.recast(result.cards);
				for (const card of result.cards) {
					const s = get.suit(card);
					if (s !== "none" && s !== "unsure" && !data.suits.includes(s))
						data.suits.push(s);
				}
				if (data.suits.length >= 4)
					trigger.zishu_zhilian_complete = true;
			} else {
				delete player.storage.zishu_zhilian_data;
			}
		}
	},
	group: ["zishu_zhilian_resolve", "zishu_zhilian_clear"],
},
zishu_zhilian_resolve: {
	charlotte: true,
	trigger: { player: "useCardAfter" },
	forced: true,
	popup: false,
	priority: 10,
	filter(event) {
		return !!event.zishu_zhilian_complete;
	},
	async content(event, trigger, player) {
		const result = await player
			.chooseTarget("织连：连招完成！令一名角色回复1点体力")
			.set("ai", target => -get.attitude(player, target))
			.forResult();
		if (result.bool) {
			await result.targets[0].recover();
		}
		delete player.storage.zishu_zhilian_data;
	},
},
zishu_zhilian_clear: {
	charlotte: true,
	trigger: { player: "phaseUseAfter" },
	forced: true,
	popup: false,
	filter(event, player) {
		return !!player.storage.zishu_zhilian_data;
	},
	content(event, trigger, player) {
		delete player.storage.zishu_zhilian_data;
	},
},

// === 愁訴 ===
zishu_chousu: {
	trigger: {
		global: [
			"phaseZhunbeiEnd", "phaseJudgeEnd", "phaseDrawEnd",
			"phaseUseEnd", "phaseDiscardEnd", "phaseJieshuEnd",
		],
	},
	filter(event, player) {
		const colors = player.getStorage("zishu_chousu_colors");
		return colors.length > 0 && new Set(colors).size === 1;
	},
	async content(event, trigger, player) {
		const colors = player.getStorage("zishu_chousu_colors");
		const otherColor = colors[0] === "red" ? "black" : "red";
		player.removeStorage("zishu_chousu_colors");
		while (true) {
			await player.draw(1);
			const result = await player
				.chooseToUse({
					prompt: "愁訴：使用一张" + (otherColor === "red" ? "红色" : "黑色") + "牌以继续流程",
					filterCard: function (card, player, event) {
						return lib.filter.filterCard.apply(this, arguments);
					},
				})
				.forResult();
			if (!result.bool) break;
			const color = get.color(result.card);
			if (color !== otherColor) break;
		}
	},
	group: ["zishu_chousu_record", "zishu_chousu_clear"],
	subSkill: {
		record: {
			trigger: { target: "useCardToTargeted" },
			forced: true,
			popup: false,
			content(event, trigger, player) {
				const color = get.color(trigger.card);
				if (color === "red" || color === "black") {
					player.markAuto("zishu_chousu_colors", [color]);
				}
			},
		},
		clear: {
			trigger: {
				global: [
					"phaseBeginStart",
					"phaseChange",
				],
			},
			forced: true,
			popup: false,
			content(event, trigger, player) {
				player.removeStorage("zishu_chousu_colors");
			},
		},
	},
},

// === 猫眼 ===
threed_cat_eye: {
	locked: true,
	init(player, skill) {
		lib.translate.threed_cat_mark = "invisible";
		lib.translate.threed_cat_bottom = "牌堆底";
		game.filterPlayer(target => target !== player).forEach(target => {
			lib.translate["threed_cat_from_" + target.name] = get.translation(target);
		});
		if (!player.storage.threed_cat_bottom_card) {
			player.storage.threed_cat_bottom_card = null;
		}
		if (!Array.isArray(player.storage.threed_cat_gained_cards)) {
			player.storage.threed_cat_gained_cards = [];
		}
		if (!Array.isArray(player.storage.threed_cat_used_types)) {
			player.storage.threed_cat_used_types = [];
		}
		player.addSkill(skill + "_view");
		player.addSkill(skill + "_sync");
		player.addSkill(skill + "_phase");
		player.addSkill(skill + "_roundReset");
		player.addSkill(skill + "_gain");
	},
	onremove(player, skill) {
		lib.skill.threed_cat_eye.clearAll(player);
		player.removeSkill(skill + "_view");
		player.removeSkill(skill + "_sync");
		player.removeSkill(skill + "_phase");
		player.removeSkill(skill + "_roundReset");
		player.removeSkill(skill + "_gain");
	},
	getCatCards(player) {
		return player.getCards("s", card => {
			if (!card.gaintag) return false;
			return card.gaintag.some(tag => tag.startsWith("threed_cat_"));
		});
	},
	getRealCards(player) {
		const result = [];
		const bottom = player.storage.threed_cat_bottom_card;
		if (bottom && get.position(bottom, true) === "c") {
			result.push(bottom);
		}
		for (const card of player.storage.threed_cat_gained_cards || []) {
			if (card && get.position(card, true) != null && get.position(card, true) !== "d") {
				result.push(card);
			}
		}
		return result;
	},
	clearFakeCards(player, ids) {
		const cards = player.getCards("s", card => {
			if (!card.gaintag || !card.gaintag.some(tag => tag.startsWith("threed_cat_"))) return false;
			return !ids || ids.includes(card._cardid);
		});
		game.deleteFakeCards(cards);
	},
	syncCards(player) {
		const real = lib.skill.threed_cat_eye.getRealCards(player);
		const realIds = real.map(card => card.cardid);
		const fakeCards = lib.skill.threed_cat_eye.getCatCards(player);
		const staleFakes = fakeCards.filter(card => !realIds.includes(card._cardid));
		if (staleFakes.length) {
			lib.skill.threed_cat_eye.clearFakeCards(player, staleFakes.map(card => card._cardid));
		}
		const bottom = player.storage.threed_cat_bottom_card;
		if (bottom && get.position(bottom, true) !== "c") {
			player.storage.threed_cat_bottom_card = null;
			lib.skill.threed_cat_eye.addBottomCard(player);
		}
		player.storage.threed_cat_gained_cards = (player.storage.threed_cat_gained_cards || []).filter(card => {
			return card && get.position(card, true) != null && get.position(card, true) !== "d";
		});
		return lib.skill.threed_cat_eye.getRealCards(player);
	},
	clearAll(player) {
		lib.skill.threed_cat_eye.clearFakeCards(player);
		player.storage.threed_cat_bottom_card = null;
		player.storage.threed_cat_gained_cards = [];
	},
	addBottomCard(player) {
		const cards = get.bottomCards(1, true);
		if (!cards.length) return;
		player.storage.threed_cat_bottom_card = cards[0];
		game.addCardKnower(cards, player);
		player.directgains(game.createFakeCards(cards), null, ["threed_cat_mark", "threed_cat_bottom"]);
	},
	addGainedCard(player, target, card) {
		if (!card) return;
		const pos = get.position(card, true);
		if (pos == null) return;
		const bottom = player.storage.threed_cat_bottom_card;
		if (bottom && bottom.cardid === card.cardid) return;
		const gained = player.storage.threed_cat_gained_cards || [];
		if (gained.some(cardx => cardx.cardid === card.cardid)) return;
		gained.push(card);
		player.storage.threed_cat_gained_cards = gained;
		game.addCardKnower([card], player);
		const fromTag = "threed_cat_from_" + target.name;
		if (!lib.translate[fromTag]) {
			lib.translate[fromTag] = get.translation(target);
		}
		player.directgains(game.createFakeCards([card]), null, ["threed_cat_mark", fromTag]);
	},
	isTypeUsed(player, card) {
		const usedTypes = player.storage.threed_cat_used_types || [];
		return usedTypes.includes(get.type2(card, player));
	},
	recordType(player, card) {
		const type = get.type2(card, player);
		if (["basic", "trick", "equip"].includes(type)) {
			const list = player.storage.threed_cat_used_types || [];
			if (!list.includes(type)) {
				list.push(type);
				player.storage.threed_cat_used_types = list;
			}
		}
	},
	getGainedPairs(event, player) {
		const pairs = [];
		if (event.name === "loseAsync") {
			if (Array.isArray(event.gain_list)) {
				for (const [target, cards] of event.gain_list) {
					if (target !== player && target.isIn && cards?.length) {
						for (const card of cards) pairs.push([target, card]);
					}
				}
			}
		} else {
			if (event.player !== player && event.player?.isIn && event.cards?.length) {
				for (const card of event.cards) pairs.push([event.player, card]);
			}
		}
		return pairs;
	},
	mod: {
		cardEnabled(card, player) {
			if (player !== _status.currentPhase) return;
			const fakeCards = lib.skill.threed_cat_eye.getCatCards(player);
			const target = card?.cards?.length ? card.cards[0] : card;
			if (fakeCards.includes(target) && lib.skill.threed_cat_eye.isTypeUsed(player, target)) {
				return false;
			}
		},
	},
	group: ["threed_cat_eye_view", "threed_cat_eye_sync", "threed_cat_eye_phase", "threed_cat_eye_roundReset", "threed_cat_eye_gain"],
	subSkill: {
		view: {
			charlotte: true,
			forced: true,
			popup: false,
			firstDo: true,
			trigger: {
				player: ["useCardBegin", "respondBefore"],
			},
			filter(event, player) {
				const fakeCards = lib.skill.threed_cat_eye.getCatCards(player);
				return event.cards?.some(card => fakeCards.includes(card));
			},
			async content(event, trigger, player) {
				const fakeCards = lib.skill.threed_cat_eye.getCatCards(player);
				const realCards = lib.skill.threed_cat_eye.syncCards(player);
				const usedFakes = [];
				const usedIds = [];
				trigger.cards = trigger.cards.map(card => {
					if (!fakeCards.includes(card)) return card;
					const real = realCards.find(cardx => cardx.cardid === card._cardid);
					if (real) {
						usedFakes.push(card);
						usedIds.push(real.cardid);
						return real;
					}
					return card;
				});
				if (trigger.card?.cards) {
					trigger.card.cards = trigger.cards;
				}
				if (usedIds.length) {
					player.storage.threed_cat_gained_cards = (player.storage.threed_cat_gained_cards || []).filter(card => !usedIds.includes(card.cardid));
					lib.skill.threed_cat_eye.clearFakeCards(player, usedIds);
					if (trigger.name === "useCard") {
						lib.skill.threed_cat_eye.recordType(player, trigger.card);
					}
					await game.cardsGotoOrdering(trigger.cards.filter(card => usedIds.includes(card.cardid) && get.position(card, true) === "c"));
					lib.skill.threed_cat_eye.syncCards(player);
				}
				game.deleteFakeCards(usedFakes);
			},
			"skill_id": "threed_cat_eye_view",
			sub: true,
			sourceSkill: "threed_cat_eye",
			"_priority": 0,
		},
		sync: {
			charlotte: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: {
				global: ["gainEnd", "equipEnd", "addJudgeEnd", "loseEnd", "loseAsyncEnd", "addToExpansionEnd", "cardsGotoOrderingBegin", "cardsDiscardAfter", "loseToDiscardpile"],
			},
		filter(event, player) {
			const bottom = player.storage.threed_cat_bottom_card;
			const gained = player.storage.threed_cat_gained_cards || [];
			const cards = event.cards || [];
			if (bottom && cards.some(card => card.cardid === bottom.cardid)) return true;
			if (gained.length && cards.some(card => gained.some(g => g.cardid === card.cardid))) return true;
			return false;
		},
			content(event, trigger, player) {
				lib.skill.threed_cat_eye.syncCards(player);
			},
			"skill_id": "threed_cat_eye_sync",
			sub: true,
			sourceSkill: "threed_cat_eye",
			"_priority": 1,
		},
		phase: {
			charlotte: true,
			trigger: {
				player: ["phaseBegin", "phaseAfter"],
			},
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				if (event.triggername === "phaseBegin") {
					lib.skill.threed_cat_eye.addBottomCard(player);
				} else {
					lib.skill.threed_cat_eye.clearAll(player);
				}
			},
			"skill_id": "threed_cat_eye_phase",
			sub: true,
			sourceSkill: "threed_cat_eye",
			"_priority": 0,
		},
		roundReset: {
			charlotte: true,
			trigger: {
				global: "roundStart",
			},
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				player.storage.threed_cat_used_types = [];
			},
			"skill_id": "threed_cat_eye_roundReset",
			sub: true,
			sourceSkill: "threed_cat_eye",
			"_priority": 0,
		},
		gain: {
			charlotte: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: {
				global: ["gainAfter", "equipAfter", "addJudgeAfter", "loseAsyncAfter", "addToExpansionAfter"],
			},
			filter(event, player) {
				if (_status.currentPhase !== player) return false;
				return lib.skill.threed_cat_eye.getGainedPairs(event, player).length > 0;
			},
			content(event, trigger, player) {
				const pairs = lib.skill.threed_cat_eye.getGainedPairs(trigger, player);
				for (const [target, card] of pairs) {
					lib.skill.threed_cat_eye.addGainedCard(player, target, card);
				}
			},
			"skill_id": "threed_cat_eye_gain",
			sub: true,
			sourceSkill: "threed_cat_eye",
			"_priority": 0,
		},
	},
	"skill_id": "threed_cat_eye",
	"_priority": 0,
},

// === 享恶 ===
threed_xiang_e: {
	audio: 2,
	trigger: { player: "phaseDiscardEnd" },
	direct: true,
	filter(event, player) {
		return game.hasPlayer(target => target !== player);
	},
	async content(event, trigger, player) {
		const discarded = [];
		player.getHistory("lose", evt => {
			if (evt.type === "discard" && evt.getParent("phaseDiscard") === trigger) {
				discarded.addArray(evt.cards);
			}
		});
		if (!discarded.length) {
			const result = await player
				.chooseTarget(get.prompt2("threed_xiang_e"), "令一名其他角色执行一个弃牌阶段", lib.filter.notMe)
				.set("ai", target => get.attitude(player, target) * (target.countCards("he") - target.getHandcardLimit()))
				.forResult();
			if (result?.bool && result.targets?.length) {
				const target = result.targets[0];
				player.logSkill("threed_xiang_e", target);
				const next = target.phaseDiscard();
				event.next.remove(next);
				trigger.next.push(next);
			}
		} else {
			const result = await player
				.chooseTarget(get.prompt2("threed_xiang_e"), "令一名角色发动【崩坏】", lib.filter.all)
				.set("ai", target => -get.attitude(player, target) * (target.hp === target.maxHp ? 2 : 1))
				.forResult();
			if (result?.bool && result.targets?.length) {
				const target = result.targets[0];
				player.logSkill("threed_xiang_e", target);
				const { control } = await target
					.chooseControl("baonue_hp", "baonue_maxHp", function(event2, player2) {
						if (player2.hp == player2.maxHp) {
							return "baonue_hp";
						}
						if (player2.hp < player2.maxHp - 1 || player2.hp <= 2) {
							return "baonue_maxHp";
						}
						return "baonue_hp";
					})
					.set("prompt", "崩坏：失去1点体力或减1点体力上限")
					.forResult();
				if (control == "baonue_hp") {
					await target.loseHp();
				} else {
					await target.loseMaxHp(true);
				}
			}
		}
	},
	"skill_id": "threed_xiang_e",
	"_priority": 0,
},

// === 织乱 ===
threed_zhi_luan: {
	audio: 2,
	enable: "chooseToUse",
	filterCard(card, player) {
		if (get.name(card) !== "sha") {
			return false;
		}
		const catCards = lib.skill.threed_cat_eye.getCatCards(player);
		if (catCards.includes(card) && lib.skill.threed_cat_eye.isTypeUsed(player, { name: "jiedao", isCard: true })) {
			return false;
		}
		return true;
	},
	position: "hes",
	viewAsFilter(player) {
		const catCards = lib.skill.threed_cat_eye.getCatCards(player);
		const trickUsed = lib.skill.threed_cat_eye.isTypeUsed(player, { name: "jiedao", isCard: true });
		return player.countCards("hes", card => {
			if (get.name(card) !== "sha") {
				return false;
			}
			if (catCards.includes(card) && trickUsed) {
				return false;
			}
			return true;
		});
	},
	viewAs: { name: "jiedao" },
	check(card) {
		return 5 - get.value(card);
	},
	onuse(result, player) {
		player.addTempSkill("threed_zhi_luan_effect");
	},
	ai: {
		// 出牌阶段 AI 排序依赖 ai.order;收益评估沿用【借刀杀人】自带的 result
		order: 4,
	},
	subSkill: {
		effect: {
			trigger: { player: "gainBefore" },
			forced: true,
			popup: false,
			charlotte: true,
			filter(event, player) {
				const jiedao = event.getParent("jiedao");
				if (!jiedao || jiedao.skill !== "threed_zhi_luan" || !jiedao.addedTarget?.isIn()) {
					return false;
				}
				const cards = event.cards || [];
				return cards.length > 0 && cards.some(card => get.subtypes(card)?.includes("equip1"));
			},
			async content(event, trigger, player) {
				const jiedao = trigger.getParent("jiedao");
				const target = jiedao.target;
				const addedTarget = jiedao.addedTarget;
				const go = await player
					.chooseBool(get.prompt2("threed_zhi_luan"), `改为：你获得${get.translation(target)}一张牌，${get.translation(target)}获得${get.translation(addedTarget)}一张牌，${get.translation(addedTarget)}从牌堆底摸一张牌`)
					.set("ai", () => addedTarget && addedTarget.isIn() ? 1 : 0)
					.forResult();
				if (!go?.bool) {
					return;
				}
				trigger.cancel();
				player.logSkill("threed_zhi_luan");
				await player.gainPlayerCard({ target, position: "he", forced: true });
				if (target.isIn() && addedTarget.isIn() && addedTarget.hasGainableCards(target, "he")) {
					await target.gainPlayerCard({ target: addedTarget, position: "he", forced: true });
				}
				if (addedTarget.isIn()) {
					await addedTarget.draw(1, "bottom");
				}
			},
			"skill_id": "threed_zhi_luan_effect",
			sub: true,
			sourceSkill: "threed_zhi_luan",
			"_priority": 0,
		},
	},
	"skill_id": "threed_zhi_luan",
	"_priority": 0,
},

// === 恤遗 ===
threed_xuyi1: {
	global: "threed_xuyi1_use",
	subSkill: {
		use: {
			audio: 2,
			name: "恤遗",
			enable: ["chooseToUse", "chooseToRespond"],
			filter(event, player) {
				if (player.countCards("h")) {
					return false;
				}
				if (player.hasSkill("threed_xuyi1_banned") || player.hasSkill("threed_xuyi1_cool")) {
					return false;
				}
				if (!game.hasPlayer(cur => cur.hasSkill("threed_xuyi1"))) {
					return false;
				}
				return event.filterCard({ name: "tao", isCard: true }, player, event);
			},
			selectTarget: 1,
			filterTarget(card, player, target) {
				return target.hasSkill("threed_xuyi1");
			},
				ai: {
					save: true,
					skillTagFilter(player, tag, arg) {
						if (player.countCards("h")) {
							return false;
						}
						if (player.hasSkill("threed_xuyi1_banned") || player.hasSkill("threed_xuyi1_cool")) {
							return false;
						}
						if (!game.hasPlayer(cur => cur.hasSkill("threed_xuyi1"))) {
							return false;
						}
						return arg == player;
					},
					order: 2,
					result: {
						player(player) {
							if (_status.event.type == "dying" && _status.event.dying == player) {
								return 4;
							}
							// 目标大概率会拒绝时不发起（拒绝无任何收益，防止 AI 反复空发起）
							const owner = game.hasPlayer(cur => cur.hasSkill("threed_xuyi1") && get.attitude(cur, player) > 0);
							return owner ? 1 : -1;
						},
						target(player, target) {
							if (target == player) {
								return 2;
							}
							if (_status.event.type == "dying") {
								return 1;
							}
							return get.attitude(player, target);
						},
					},
				},
				async content(event, trigger, player) {
					const target = event.targets[0];
					if (player !== target) {
						const choice = await target
							.chooseControl("同意", "取消")
							.set("prompt", `恤遗：${get.translation(player)}请求与你各摸一张牌并视为使用【桃】`)
							.set("ai", () => get.attitude(target, player) > 0 ? "同意" : "取消")
							.forResult();
						if (choice.control === "取消") {
							// 被拒绝后本回合内不再发起：拒绝不产生任何状态变化，
							// 否则 AI 在出牌阶段的 chooseToUse 循环里会无限重复发起恤遗
							player.addTempSkill("threed_xuyi1_cool", "phaseAfter");
							return;
						}
					}
				player.logSkill("threed_xuyi1", target);
				const dying = player.hp <= 0;
				if (dying) {
					await game.asyncDraw([player, target]);
				} else {
					await player.draw();
					await target.drawTo(target.getHandcardLimit());
				}
				await player.useCard(get.autoViewAs({ name: "tao", isCard: true }), [player]);
				if (!dying && player.isIn() && target.isIn()) {
					player.addSkill("threed_xuyi1_banned");
				}
			},
			"skill_id": "threed_xuyi1_use",
			sub: true,
			sourceSkill: "threed_xuyi1",
			"_priority": 0,
		},
			banned: {
				charlotte: true,
				sub: true,
			},
			cool: {
				charlotte: true,
				sub: true,
			},
	},
	"skill_id": "threed_xuyi1",
	"_priority": 0,
},

// === 序仪 ===
threed_xuyi2: {
	audio: 2,
	enable: "chooseToUse",
	filterCard: true,
	selectCard: -1,
	position: "h",
	viewAs: { name: "wuxie" },
	filter(event, player) {
		if (!player.countCards("h")) {
			return false;
		}
		const used = player.storage.threed_xuyi2_used || [];
		return !used.includes(player.countCards("h"));
	},
	viewAsFilter(player) {
		if (!player.countCards("h")) {
			return false;
		}
		const used = player.storage.threed_xuyi2_used || [];
		return !used.includes(player.countCards("h"));
	},
	// hiddenCard 位于技能顶层:喂 hasWuxie 无懈预检(引擎只读 info.hiddenCard,player.js:2988)
	hiddenCard(player, name) {
		if (name != "wuxie" || !player.countCards("h")) {
			return false;
		}
		const used = player.storage.threed_xuyi2_used || [];
		return !used.includes(player.countCards("h"));
	},
	onuse(result, player) {
		if (!Array.isArray(player.storage.threed_xuyi2_used)) {
			player.storage.threed_xuyi2_used = [];
		}
		const n = player.countCards("h");
		if (!player.storage.threed_xuyi2_used.includes(n)) {
			player.storage.threed_xuyi2_used.push(n);
		}
		player.markSkill("threed_xuyi2");
	},
	group: ["threed_xuyi2_effect"],
	mod: {
		maxHandcard(player, num) {
			return num + player.countMark("threed_xuyi2_handcard");
		},
	},
	mark: true,
	marktext: "序",
	intro: {
		content(storage, player) {
			const used = (player.storage.threed_xuyi2_used || []).slice().sort((a, b) => a - b);
			return `已发动的手牌数：${used.length ? used.map(n => get.cnNumber(n)).join("、") : "无"}`;
		},
	},
	subSkill: {
		handcard: {
			charlotte: true,
			mark: true,
			markimage: "image/card/handcard.png",
			intro: {
				content(num, player) {
					var str = "<li>手牌上限";
					if (num >= 0) {
						str += "+";
					}
					str += num;
					str += "<br><li>当前手牌上限：";
					str += player.getHandcardLimit();
					return str;
				},
			},
		},
		effect: {
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: {
				player: "useCardAfter",
			},
			filter(event, player) {
				return event.skill === "threed_xuyi2" && event.card?.name === "wuxie";
			},
			async content(event, trigger, player) {
				player.addMark("threed_xuyi2_handcard", 1, false);
				const result = await player
					.chooseTarget(get.prompt2("threed_xuyi2"), "令一名手牌上限不小于你的角色摸两张牌", (card, p, target) => target.getHandcardLimit() >= player.getHandcardLimit())
					.set("ai", target => get.attitude(player, target))
					.forResult();
				if (result?.bool && result.targets?.length) {
					await result.targets[0].draw(2);
				}
			},
			"skill_id": "threed_xuyi2_effect",
			sub: true,
			sourceSkill: "threed_xuyi2",
			"_priority": 0,
		},
	},
	"skill_id": "threed_xuyi2",
	"_priority": 0,
},
// === 渊峙 ===
shanhe_yuanzhi: {
	audio: 2,
	locked: true,
	init(player) {
		const weaponCount = game.filterPlayer().reduce((n, p) => n + p.countCards("e", card => get.subtype(card) == "equip1"), 0);
		const armorCount = game.filterPlayer().reduce((n, p) => n + p.countCards("e", card => get.subtype(card) == "equip2"), 0);
		const want = weaponCount > armorCount ? "xindangxian" : weaponCount < armorCount ? "kunfen" : null;
		if (want) {
			player.addAdditionalSkill("shanhe_yuanzhi", want, true);
		}
		player.storage.shanhe_yuanzhi_skill = want;
	},
	trigger: { global: ["equipAfter", "loseEnd", "loseAsyncEnd"] },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		const cards = event.name == "equipAfter" ? [event.card] : event.cards;
		return cards?.some(card => get.subtype(card)?.startsWith("equip"));
	},
	async content(event, trigger, player) {
		const weaponCount = game.filterPlayer().reduce((n, p) => n + p.countCards("e", card => get.subtype(card) == "equip1"), 0);
		const armorCount = game.filterPlayer().reduce((n, p) => n + p.countCards("e", card => get.subtype(card) == "equip2"), 0);
		const want = weaponCount > armorCount ? "xindangxian" : weaponCount < armorCount ? "kunfen" : null;
		const current = player.storage.shanhe_yuanzhi_skill;
		if (want == current) return;
		if (current) player.removeAdditionalSkill("shanhe_yuanzhi", current);
		if (want) player.addAdditionalSkill("shanhe_yuanzhi", want, true);
		player.storage.shanhe_yuanzhi_skill = want;
	},
	onremove(player) {
		const current = player.storage.shanhe_yuanzhi_skill;
		if (current) player.removeAdditionalSkill("shanhe_yuanzhi", current);
		delete player.storage.shanhe_yuanzhi_skill;
	},
},
// === 殊途 ===
shanhe_shutu: {
	audio: 2,
	locked: true,
	trigger: { player: "phaseAfter" },
	forced: true,
	filter(event, player) {
		const change = game.getGlobalHistory("changeHp", evt => evt.player == player);
		return change.some(evt => evt.num < 0) != change.some(evt => evt.num > 0);
	},
	async content(event, trigger, player) {
		const change = game.getGlobalHistory("changeHp", evt => evt.player == player);
		const decrease = change.some(evt => evt.num < 0);
		const increase = change.some(evt => evt.num > 0);
		if (decrease) {
			await player.recover();
		}
		else {
			await player.loseHp();
		}
		const result = await player
			.chooseTarget(get.prompt2("shanhe_shutu"), "选择一名其他角色，视为对其使用一张【决斗】", lib.filter.notMe)
			.set("ai", target => get.effect(target, { name: "juedou" }, player, player))
			.forResult();
		if (result?.bool && result.targets?.length) {
			await player.useCard(get.autoViewAs({ name: "juedou", isCard: true }), result.targets[0]);
		}
	},
},
// === 自鸠 ===
shanhe_zijiu: {
	audio: 2,
	locked: true,
	forced: true,
	init(player) {
		if (!game.filterPlayer(current => current.countMark("shanhe_zijiu_jiu") > 0).length) {
			player.addMark("shanhe_zijiu_jiu", 1, false);
		}
	},
	trigger: { global: ["gainAfter", "loseAfter", "loseAsyncAfter", "loseHpAfter"] },
	popup: false,
	silent: true,
	filter(event, player, name) {
		const target = event.player;
		if (name == "gainAfter") {
			if (event.giver != player && event.source != player) return false;
			if (!event.cards?.some(card => get.color(card) == "black")) return false;
			if (game.filterPlayer(current => current.countMark("shanhe_zijiu_jiu") > 0).length >= 3) return false;
			return true;
		}
		if (name == "loseAfter") {
			if (!event.visible) return false;
			return target.countMark("shanhe_zijiu_jiu") > 0 && event.hs?.some(card => get.color(card) == "black");
		}
		if (name == "loseAsyncAfter") {
			if (game.hasGlobalHistory("cardMove", evt => evt.name == "lose" && evt.getParent() == trigger && evt.type == "gain")) return false;
			return game.filterPlayer(current => current.countMark("shanhe_zijiu_jiu") > 0 && event.getl(current)?.hs?.some(card => get.color(card) == "black")).length > 0;
		}
		return target.countMark("shanhe_zijiu_jiu") > 0;
	},
	async content(event, trigger, player) {
		const name = event.triggername;
		const target = trigger.player;
		if (name == "gainAfter") {
			if (target.countMark("shanhe_zijiu_jiu") > 0) return;
			target.addMark("shanhe_zijiu_jiu", 1);
			if (target != player) {
				target.addSkillBlocker("shanhe_zijiu_jiu");
				target.addTip("shanhe_zijiu_jiu", "非锁定技失效");
			}
			return;
		}
		if (name == "loseAfter") {
			await target.loseHp();
			return;
		}
		if (name == "loseAsyncAfter") {
			for (const current of game.filterPlayer(cur => cur.countMark("shanhe_zijiu_jiu") > 0 && event.getl(cur)?.hs?.some(card => get.color(card) == "black"))) {
				await current.loseHp();
			}
			return;
		}
		target.removeMark("shanhe_zijiu_jiu", target.countMark("shanhe_zijiu_jiu"));
		if (target != player) {
			target.removeSkillBlocker("shanhe_zijiu_jiu");
			target.removeTip("shanhe_zijiu_jiu");
		}
		if (!game.filterPlayer(current => current.countMark("shanhe_zijiu_jiu") > 0).length) {
			player.addMark("shanhe_zijiu_jiu", 1);
		}
	},
	subSkill: {
		// === 鸠（标记定义，非技能） ===
		jiu: {
			locked: true,
			marktext: "鸠",
			intro: {
				content(storage, player, skill) {
					return get.translation("shanhe_zijiu_jiu_info");
				},
				markcount: storage => storage || 0,
			},
			skillBlocker(skill, player) {
				if (player.skills.includes("shanhe_zijiu")) return false;
				return !lib.skill[skill].persevereSkill && !lib.skill[skill].charlotte && !get.is.locked(skill, player);
			},
		},
	},
},
// === 惑語 ===
shanhe_huoyu: {
	audio: 2,
	enable: "phaseUse",
	usable(skill, player) {
		return player.maxHp - player.hp;
	},
	filterTarget(card, player, target) {
		return target != player;
	},
	async content(event, trigger, player) {
		const { target } = event;
		await player.draw(1);
		await target.draw(1);
		await player.useCard(get.autoViewAs({ name: "tuixinzhifu", isCard: true }), target);
	},
	ai: {
		order: 1,
		result: {
			target(player, target) {
				return get.effect(target, { name: "tuixinzhifu" }, player, player);
			},
		},
	},
},
// === 聚澜 ===
xiaobai_julan: {
	audio: 2,
	comboSkill: true,
	locked: false,
	group: ["xiaobai_julan_yinpai", "xiaobai_julan_check"],
	init(player, skill) {
		if (!player.storage.xiaobai_julan_condition) {
			player.storage.xiaobai_julan_condition = ["basic"];
		}
		player.addSkill(`${skill}_mark`);
	},
	onremove(player, skill) {
		player.removeSkill(`${skill}_mark`);
		delete player.storage.xiaobai_julan_condition;
		delete player.storage.xiaobai_julan_progress;
		player.removeTip("xiaobai_julan");
	},
	trigger: { player: "useCard1" },
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		const cond = player.storage.xiaobai_julan_condition;
		if (!cond?.length) return false;
		return (player.storage.xiaobai_julan_progress || 0) < cond.length;
	},
	async content(event, trigger, player) {
		const cond = player.storage.xiaobai_julan_condition || ["basic"];
		const progress = player.storage.xiaobai_julan_progress || 0;
		const type = get.type2(trigger.card);
		if (type === cond[progress]) {
			const next = progress + 1;
			player.storage.xiaobai_julan_progress = next;
			player.markSkill("xiaobai_julan_mark");
			if (next >= cond.length) {
				await player.draw(cond.length);
				cond.push("basic");
				player.storage.xiaobai_julan_progress = 0;
				player.markSkill("xiaobai_julan_mark");
				player.removeTip("xiaobai_julan");
			} else {
				player.addTip("xiaobai_julan", "聚澜 可连击");
			}
		} else if (progress > 0) {
			player.storage.xiaobai_julan_progress = 0;
			player.markSkill("xiaobai_julan_mark");
			player.removeTip("xiaobai_julan");
			if (player.hasSkill("xiaobai_kuotao")) {
				await get.info("xiaobai_kuotao").onBreak(player, type);
			}
		}
	},
	subSkill: {
		// 印牌：一张牌当【趁火打劫】
		yinpai: {
			audio: "xiaobai_julan",
			enable: "chooseToUse",
			viewAsFilter(player) {
				return player.storage.xiaobai_julan_progress > 0;
			},
			filterCard(card, player) {
				return get.itemtype(card) == "card";
			},
			selectCard: 1,
			position: "he",
			viewAs: { name: "chenghuodajie", storage: { xiaobai_julan: true } },
			prompt: "聚澜：将一张牌当【趁火打劫】使用",
		},
		// 替换趁火打劫结算：展示基本牌时由使用者选择
		check: {
			trigger: { player: "useCardToBegin" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.card?.storage?.xiaobai_julan;
			},
			async content(event, trigger, player) {
				trigger.setContent(get.info("xiaobai_julan").chenghuoContent);
			},
		},
		// 连招进度显示：澜字 + 右下角进度/条件数
		mark: {
			charlotte: true,
			marktext: "澜",
			intro: {
				content(storage, player, skill) {
					const cond = player.storage.xiaobai_julan_condition || ["basic"];
					const progress = player.storage.xiaobai_julan_progress || 0;
					return `连招进度：${progress}/${cond.length}`;
				},
				markcount(storage, player) {
					const cond = player.storage.xiaobai_julan_condition || ["basic"];
					const progress = player.storage.xiaobai_julan_progress || 0;
					return `${progress}/${cond.length}`;
				},
			},
			init(player, skill) {
				player.markSkill(skill);
			},
			onremove(player, skill) {
				player.unmarkSkill(skill);
			},
		},
	},
	async chenghuoContent(event, trigger, player) {
		const { target } = event;
		if (typeof event.baseDamage !== "number") {
			event.baseDamage = 1;
		}
		if (typeof event.extraDamage !== "number") {
			event.extraDamage = 0;
		}
		if (!target.hasCards("h") || !player.isIn()) {
			return;
		}
		const result = await player.choosePlayerCard(target, "h", true).forResult();
		if (!result.bool) {
			return;
		}
		event.show_card = result.cards[0];
		const str = get.translation(player);
		await player.showCards(event.show_card);
		if (get.type(event.show_card) == "basic") {
			const controlResult = await player.chooseControl().set("choiceList", [`令使用者获得${get.translation(event.show_card)}`, `令${get.translation(target)}受到${event.baseDamage + event.extraDamage}点伤害`]).set("ai", () => {
				const evt = get.event().getParent();
				const card = evt.show_card;
				const source = evt.player;
				const target2 = evt.target;
				if (get.damageEffect(target2, source, source) > get.value(card, source)) {
					return 1;
				}
				return 0;
			}).forResult();
			if (controlResult.index === 0) {
				await target.give(event.show_card, player);
			} else {
				await target.damage();
			}
		} else {
			const controlResult = await target.chooseControl().set("choiceList", [`令${str}获得${get.translation(event.show_card)}`, `受到${str}造成的${event.baseDamage + event.extraDamage}点伤害`]).set("ai", () => {
				const evt = get.event().getParent();
				if (evt == null) {
					return 1;
				}
				const current = evt.target;
				const source = evt.player;
				const card = evt.show_card;
				if (get.damageEffect(current, source, current) > 0) {
					return 1;
				}
				if (get.attitude(current, source) * get.value(card, source) >= 0) {
					return 0;
				}
				if (card.name === "tao") {
					return 1;
				}
				return get.value(card, current) > 6 + (Math.max(current.maxHp, 3) - current.hp) * 1.5 ? 1 : 0;
			}).forResult();
			if (controlResult.index === 0) {
				await target.give(event.show_card, player);
			} else {
				await target.damage();
			}
		}
	},
	ai: {
		order: 6,
		result: { player: 1 },
	},
},
// === 括涛 ===
xiaobai_kuotao: {
	audio: 2,
	locked: false,
	group: ["xiaobai_kuotao_check"],
	mod: {
		cardUsable(card, player, num) {
			if (get.name(card) == "sha") {
				return num + (player.storage.xiaobai_kuotao_sha_count || 0);
			}
		},
	},
	trigger: {
		global: ["phaseBeginAfter", "phaseJudgeAfter", "phaseDrawAfter", "phaseUseAfter", "phaseDiscardAfter", "phaseJieshuAfter"],
	},
	forced: true,
	popup: false,
	silent: true,
	filter(event, player) {
		return Array.isArray(player.storage.xiaobai_kuotao_end) && player.storage.xiaobai_kuotao_end.length > 0;
	},
	async content(event, trigger, player) {
		const list = player.storage.xiaobai_kuotao_end || [];
		delete player.storage.xiaobai_kuotao_end;
		for (const X of list) {
			//if (!lib.card.binglinchengxiax) break;
			const vcard = get.autoViewAs({ name: "binglinchengxiax", isCard: true, storage: { xiaobai_kuotao_extra: X } });
			if (game.hasPlayer(target => target != player && lib.filter.filterTarget(vcard, player, target))) {
				await player.chooseUseTarget(vcard, true, false).set("prompt", "括涛：视为使用一张【兵临城下】").forResult();
			}
		}
	},
	init(player, skill) {
		player.addSkill(`${skill}_mark`);
		if (player.storage.xiaobai_kuotao_sha_count) {
			player.addTip("xiaobai_kuotao", `出杀次数+${player.storage.xiaobai_kuotao_sha_count}`);
		}
	},
	onremove(player, skill) {
		player.removeSkill(`${skill}_mark`);
		player.removeTip("xiaobai_kuotao");
		delete player.storage.xiaobai_kuotao_sha_count;
		delete player.storage.xiaobai_kuotao_last_break;
		delete player.storage.xiaobai_kuotao_end;
	},
	async onBreak(player, breakType) {
		const last = player.storage.xiaobai_kuotao_last_break;
		player.storage.xiaobai_kuotao_last_break = breakType;
		player.markSkill("xiaobai_kuotao_mark");
		if (last === breakType) {
			player.logSkill("xiaobai_kuotao");
			player.storage.xiaobai_kuotao_sha_count = (player.storage.xiaobai_kuotao_sha_count || 0) + 1;
			player.addTip("xiaobai_kuotao", `出杀次数+${player.storage.xiaobai_kuotao_sha_count}`);
			return;
		}
		const shaCount = player.storage.xiaobai_kuotao_sha_count || 0;
		const condLen = (player.storage.xiaobai_julan_condition || ["basic"]).length;
		const result = await player
			.chooseControl(["使用【杀】的次数", "连招条件"], "cancel2")
			.set("prompt", "括涛：将使用【杀】的次数或连招条件减少至1")
			.set("ai", () => {
				const player = get.player();
				const shaCount = player.storage.xiaobai_kuotao_sha_count || 0;
				const condLen = (player.storage.xiaobai_julan_condition || ["basic"]).length;
				return shaCount >= condLen - 1 ? 0 : 1;
			})
			.forResult();
		if (result.control === "cancel2") {
			return;
		}
		let X;
		if (result.control === "使用【杀】的次数") {
			X = shaCount;
			delete player.storage.xiaobai_kuotao_sha_count;
			player.removeTip("xiaobai_kuotao");
		} else {
			X = condLen - 1;
			player.storage.xiaobai_julan_condition = ["basic"];
			if (player.hasSkill("xiaobai_julan_mark")) {
				player.markSkill("xiaobai_julan_mark");
			}
		}
		(player.storage.xiaobai_kuotao_end ??= []).push(X);
	},
	subSkill: {
		// 替换兵临城下结算：多展示 X 张牌
		check: {
			trigger: { player: "useCardToBegin" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.card?.storage?.xiaobai_kuotao_extra;
			},
			async content(event, trigger, player) {
				trigger.setContent(get.info("xiaobai_kuotao").binglinContent);
			},
		},
		// 中断类别显示：涛字 + 右下角类别（基/锦/装）
		mark: {
			charlotte: true,
			marktext: "涛",
			intro: {
				content(storage, player, skill) {
					const type = player.storage.xiaobai_kuotao_last_break;
					const shaCount = player.storage.xiaobai_kuotao_sha_count || 0;
					const condLen = (player.storage.xiaobai_julan_condition || ["basic"]).length;
					let str = "";
					if (type) {
						str += `上次导致中断的牌类别：${get.translation(type)}<br>`;
					} else {
						str += "未记录中断牌<br>";
					}
					str += `出杀次数：${1 + shaCount}<br>连招条件数：${condLen}`;
					return str;
				},
				markcount(storage, player) {
					const type = player.storage.xiaobai_kuotao_last_break;
					return type ? { basic: "基", trick: "锦", equip: "装" }[type] || "" : "";
				},
			},
			init(player, skill) {
				player.markSkill(skill);
			},
			onremove(player, skill) {
				player.unmarkSkill(skill);
			},
		},
	},
	async binglinContent(event, trigger, player) {
		const { target } = event;
		if (!player.isIn() || !target.isIn()) {
			event.finish();
			return;
		}
		const extra = event.card?.storage?.xiaobai_kuotao_extra || 0;
		event.showCards = get.cards(4 + extra, true);
		await game.cardsGotoOrdering(event.showCards);
		await player.showCards(event.showCards, `${get.translation(player)}使用了【${get.translation(event.card)}】`, true).set("clearArena", false);
		if (player.isIn() && target.isIn() && event.showCards.length) {
			for (const card of event.showCards.slice()) {
				if (get.name(card) == "sha" && player.canUse(card, target, false)) {
					event.showCards.remove(card);
					await player.useCard(card, target, false);
				}
			}
		}
		game.broadcastAll(ui.clear);
		if (event.showCards.length) {
			await game.cardsGotoPile(event.showCards.reverse(), "insert");
		}
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
},
// === 胆执 ===
xiaobai_danzhi: {
	audio: 2,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		const data = player.storage.xiaobai_danzhi;
		if (data) {
			return get.suit(event.card) == data.suit;
		}
		if (event.player != player) return false;
		if (_status.dying.length) return false;
		const history = player.getHistory("useCard");
		return history[0] === event;
	},
	async cost(event, trigger, player) {
		if (player.storage.xiaobai_danzhi) {
			event.result = { bool: true };
			return;
		}
		const result = await player
			.chooseTarget(get.prompt2("xiaobai_danzhi"), "选择一名角色", (card, p, target) => target.isIn(), false)
			.set("ai", (target) => {
				const card = trigger?.card;
				const hasEntity = trigger?.cards?.length > 0 && card && get.suit(card) != "none";
				const att = get.attitude(player, target);
				if (!hasEntity) return -att;
				if (att > 0) {
					const value = get.value(card, player);
					if (value > 6) return value / 10;
					return 0;
				}
				return -att;
			})
			.forResult();
		if (!result?.bool || !result.targets?.length) return;
		const target = result.targets[0];
		let choice = "losehp";
		if (trigger.cards?.length) {
			const res = await player
				.chooseControl(["失去体力", "获得此牌"])
				.set("choiceList", ["令其失去1点体力", "令其获得此牌"])
				.set("prompt", "胆执：选择效果")
				.set("ai", () => {
					// 敌人→失去体力（伤害）；队友→获得此牌（送牌，未来收益）
					return get.attitude(player, target) > 0 ? 1 : 0;
				})
				.forResult();
			if (!res?.control) return;
			choice = res.control == "获得此牌" ? "gain" : "losehp";
		}
		event.result = { bool: true, cost_data: { target, choice } };
	},
	async content(event, trigger, player) {
		if (player.storage.xiaobai_danzhi) {
			const data = player.storage.xiaobai_danzhi;
			const target = data.target;
			if (target.isAlive()) {
				if (data.choice == "losehp") {
					await target.recover();
				} else if (target.countDiscardableCards(target, "he")) {
					await target.chooseToDiscard("胆执：弃置一张牌", 1, "he", true);
				}
			}
			return;
		}
		const { target, choice } = event.cost_data;
		if (choice == "losehp") {
			await target.loseHp();
		} else {
			await target.gain(trigger.cards, "gain2");
		}
		player.storage.xiaobai_danzhi = { target, choice, suit: get.suit(trigger.card) };
		target.storage.xiaobai_danzhi_mark = { suit: get.suit(trigger.card), choice };
		target.addSkill("xiaobai_danzhi_mark");
		player.addTempSkill("xiaobai_danzhi_clear", { global: "phaseAfter" });
	},
	subSkill: {
		// 执 mark（挂在被选角色身上）
		mark: {
			charlotte: true,
			marktext: "执",
			intro: {
				content(storage, player, skill) {
					if (!storage) return "未记录";
					const suitText = storage.suit == "none" ? "无色" : get.translation(storage.suit);
					const effect = storage.choice == "losehp" ? "回复1点体力" : "弃置一张牌";
					return `本回合${suitText}牌被使用后，${effect}`;
				},
				markcount(storage, player) {
					if (!storage) return "";
					return storage.suit == "none" ? "无" : get.translation(storage.suit);
				},
			},
			init(player, skill) {
				player.markSkill(skill);
			},
			onremove(player, skill) {
				delete player.storage[skill];
				player.unmarkSkill(skill);
			},
		},
		// 回合结束清理
		clear: {
			charlotte: true,
			onremove(player) {
				const data = player.storage.xiaobai_danzhi;
				if (data?.target) {
					data.target.removeSkill("xiaobai_danzhi_mark");
				}
				delete player.storage.xiaobai_danzhi;
			},
		},
	},
},
// === 骤笔 ===
xiaobai_zhoubi: {
	audio: 2,
	enable: "chooseToUse",
	init(player, skill) {
		player.addSkill(`${skill}_mark`);
	},
	onremove(player, skill) {
		player.removeSkill(`${skill}_mark`);
		player.removeSkill("xiaobai_zhoubi_disabled");
		player.enableSkill("xiaobai_zhoubi_disabled");
		delete player.storage.xiaobai_zhoubi_last_name;
		delete player.storage.xiaobai_zhoubi_words;
		delete player.storage.xiaobai_zhoubi_num;
	},
	filter(event, player) {
		if (player.hasSkill("xiaobai_zhoubi_disabled")) return false;
		const phase = _status.currentPhase;
		if (!phase?.isIn() || !phase.countDiscardableCards(phase, "he")) return false;
		return get.inpileVCardList(info => {
			if (info[0] !== "basic") return false;
			const card = new lib.element.VCard({ name: info[2], nature: info[3], isCard: true });
			return event.filterCard(card, player, event);
		}).length;
	},
	chooseButton: {
		dialog(event, player) {
			const list = get.inpileVCardList(info => {
				if (info[0] !== "basic") return false;
				const card = new lib.element.VCard({ name: info[2], nature: info[3], isCard: true });
				return event.filterCard(card, player, event);
			});
			const dialog = ui.create.dialog("骤笔", [list, "vcard"], "hidden");
			dialog.direct = true;
			return dialog;
		},
		check(button) {
			const player = get.player(),
				card = new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true });
			return player.getUseValue(card);
		},
		backup(links, player) {
			return {
				audio: "xiaobai_zhoubi",
				viewAs: {
					name: links[0][2],
					nature: links[0][3],
					isCard: true,
				},
				filterCard: () => false,
				selectCard: 0,
				async precontent(event, trigger, player) {
					const phase = _status.currentPhase;
					if (!phase?.isIn()) {
						event.result.bool = false;
						return;
					}
					const lastWords = player.storage.xiaobai_zhoubi_words ?? 0;
					const lastNum = player.storage.xiaobai_zhoubi_num ?? 0;
					const result = await player
						.choosePlayerCard(phase, "he", true, `骤笔：弃置${get.translation(phase)}一张牌`)
						.set("ai", card => get.value(card, phase))
						.forResult();
					if (!result?.bool || !result.cards?.length) {
						event.result.bool = false;
						return;
					}
					const card = result.cards[0];
					await phase.discard(card);
					const words = get.translation(card.name).length;
					const num = get.number(card);
					player.storage.xiaobai_zhoubi_last_name = card.name;
					player.storage.xiaobai_zhoubi_words = words;
					player.storage.xiaobai_zhoubi_num = num;
					player.markSkill("xiaobai_zhoubi_mark");
					game.broadcastAll((player2) => {
						const mark = player2.marks.xiaobai_zhoubi_mark;
						if (mark) {
							const cn = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五" }[player2.storage.xiaobai_zhoubi_words];
							mark.firstChild.innerHTML = cn || player2.storage.xiaobai_zhoubi_words;
						}
					}, player);
					const wordsOK = words > lastWords;
					const numOK = num < lastNum;
					if (wordsOK && numOK) {
						await player.drawTo(5);
						player.disableSkill("xiaobai_zhoubi_disabled", "xiaobai_zhoubi");
						player.addSkill("xiaobai_zhoubi_disabled");
						return;
					}
					if (wordsOK) {
						return;
					}
					if (numOK) {
						await player.drawTo(5);
						player.disableSkill("xiaobai_zhoubi_disabled", "xiaobai_zhoubi");
						player.addSkill("xiaobai_zhoubi_disabled");
						event.result.cancel = true;
						return;
					}
					event.result.cancel = true;
				},
			};
		},
		prompt(links, player) {
			return `弃置本回合角色一张牌，若字数更多则视为使用一张${get.translation(links[0][3] || "")}${get.translation(links[0][2])}`;
		},
	},
	hiddenCard(player, name) {
		if (get.type(name) != "basic") return false;
		if (player.hasSkill("xiaobai_zhoubi_disabled")) return false;
		return true;
	},
	subSkill: {
		// 失效监听：手牌数变化为1时解除
		disabled: {
			charlotte: true,
			trigger: {
				player: "loseAfter",
				global: ["loseAsyncAfter", "equipAfter", "addToExpansionAfter", "gainAfter", "addJudgeAfter"],
			},
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const lost = event.getl?.(player)?.hs?.length || 0;
				const gained = event.getg?.(player)?.length || 0;
				console.log("骤笔失效检测：", { 事件: event.name, 失去手牌: lost, 获得手牌: gained, 当前手牌数: player.countCards("h") });
				return lost + gained > 0 && player.countCards("h") == 1;
			},
			content(event, trigger, player) {
				console.log("骤笔失效解除判定成功：手牌数变化为1");
				player.enableSkill("xiaobai_zhoubi_disabled");
				player.removeSkill("xiaobai_zhoubi_disabled");
			},
		},
		// 上次弃置的牌信息
		mark: {
			charlotte: true,
			marktext: "笔",
			intro: {
				content(storage, player, skill) {
					const name = player.storage.xiaobai_zhoubi_last_name;
					if (!name) return "尚未发动过骤笔";
					let str = `上次弃置的牌：${get.translation(name)}（字数${player.storage.xiaobai_zhoubi_words ?? 0}，点数${player.storage.xiaobai_zhoubi_num ?? 0}）`;
					if (player.hasSkill("xiaobai_zhoubi_disabled")) {
						str += "<br>骤笔已失效（手牌数变为1时恢复）";
					}
					return str;
				},
				markcount(storage, player) {
					if (typeof player.storage.xiaobai_zhoubi_num !== "number") return "";
					return player.storage.xiaobai_zhoubi_num;
				},
			},
			init(player, skill) {
				player.markSkill(skill);
			},
			onremove(player, skill) {
				player.unmarkSkill(skill);
			},
		},
	},
	ai: {
		save: true,
		skillTagFilter(player, tag) {
			if (player.hasSkill("xiaobai_zhoubi_disabled")) return false;
			return true;
		},
		order: 1,
		result: { player: 1 },
	},
},
// === 嫉肆 ===
qiufeng_jisi: {
	audio: 2,
	trigger: { target: "useCardToTarget" },
	filter(event, player) {
		if (event.player == player) return false;
		if (get.suit(event.card) != "heart") return false;
		return event.player.countCards("h") != player.countCards("h");
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseControl(["令自己摸一张牌", "令其摸一张牌"], "cancel2")
			.set("prompt", "嫉肆：")
			.set("ai", () => {
				const player = get.player();
				const source = get.event().getTrigger().player;
				// 默认令其摸：对敌铺垫复谣（可交换翻面/横置状态），对友送牌
				// 自己手牌少时优先自己摸
				if (player.countCards("h") <= 2) return 0;
				return 1;
			})
			.forResult();
		if (!res?.control || res.control == "cancel2") return;
		event.result = { bool: true, cost_data: res.control == "令自己摸一张牌" ? "self" : "other" };
	},
	async content(event, trigger, player) {
		const source = trigger.player;
		if (event.cost_data == "self") {
			await player.draw();
		} else {
			await source.draw();
			player.storage.qiufeng_fuyao_target = source;
		}
		if (source.countCards("h") == player.countCards("h")) return;
		if (player.countCards("h") < 2) return;
		const result = await player
			.chooseCard("嫉肆：重铸两张手牌", 2, "h", true)
			.set("ai", (card) => {
				const p = get.player();
				const chosen = _status.event.cards || [];
				let score = 6 - get.value(card, p);
				if (chosen.length && get.suit(chosen[0], p) === get.suit(card, p)) score += 3;
				return score;
			})
			.forResult();
		if (!result?.bool || result.cards?.length != 2) return;
		await player.recast(result.cards);
		if (get.suit(result.cards[0]) != get.suit(result.cards[1])) {
			if (player.isLinked()) {
				await player.turnOver();
			} else {
				await player.link();
			}
		}
	},
},
// === 复谣 ===
qiufeng_fuyao: {
	audio: 2,
	trigger: { global: "phaseAfter" },
	filter(event, player) {
		const target = event.player;
		if (target == player) return false;
		if (target.isLinked() === player.isLinked() && target.isTurnedOver() === player.isTurnedOver()) return false;
		const last = player.storage.qiufeng_fuyao_target;
		return !!last && last.isAlive() && last != player;
	},
	async cost(event, trigger, player) {
		event.result = await player
			.chooseBool(get.prompt2("qiufeng_fuyao"))
			.set("ai", () => {
				// 拼点+展示有风险：受伤且手牌有红桃（可回血并交换状态）才值得
				if (!player.isDamaged()) return false;
				const heart = player.countCards("h", (c) => get.suit(c) === "heart");
				return heart >= 1;
			})
			.forResult();
	},
	async content(event, trigger, player) {
		const last = player.storage.qiufeng_fuyao_target;
		const result = await player.chooseToCompare(last).forResult();
		const winner = result.winner;
		if (!winner) return;
		const showChoice = await winner
			.chooseBool(`复谣：令${get.translation(player)}展示手牌？`)
			.set("ai", () => true)
			.forResult();
		if (!showChoice?.bool) return;
		await player.showCards(player.getCards("h"), "复谣：展示手牌");
		if (player.countCards("h", card => get.suit(card) == "heart") > 0) {
			await player.recover();
			const pOver = player.isTurnedOver(), lOver = last.isTurnedOver();
			if (pOver !== lOver) {
				player.turnOver(lOver);
				last.turnOver(pOver);
			}
			const pLink = player.isLinked(), lLink = last.isLinked();
			if (pLink !== lLink) {
				player.link(lLink);
				last.link(pLink);
			}
		}
	},
},
// === 众谪 ===
shanhe_zhongzhe: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { player: "phaseAfter" },
	filter(event, player) {
		return player.getHistory("useCard", evt => evt.card?.name == "wugu").length > 0;
	},
	async content(event, trigger, player) {
		const shown = player.getHistory("useCard", evt => evt.card?.name == "wugu")
			.reduce((arr, evt) => arr.addArray(evt.wuguShownCards || []), []);
		if (!shown.length) return;
		const gained = game.filterPlayer(p => p.getHistory("gain", evt => evt.cards?.some(c => shown.includes(c))).length > 0);
		const targets = game.filterPlayer(p => !gained.includes(p));
		if (!targets.length) return;
		const result = await player.chooseToDebate(targets).forResult();
		if (!result?.bool) return;
		if (result.opinion == "black") {
			for (const [target] of result.black || []) {
				await target.discardPlayerCard(player, "h", true);
				await target.draw();
			}
		} else if (result.opinion == "red") {
			for (const [target] of result.red || []) {
				await player.chooseToGive(target, 1, "h");
			}
			await player.recover();
		}
	},
},
// === 脧粮 ===
shanhe_jueliang: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return event.filterCard(get.autoViewAs({ name: "wugu", isCard: true, storage: { shanhe_jueliang: true } }, "unsure"), player, event);
	},
	group: ["shanhe_jueliang_reduce", "shanhe_jueliang_remain"],
	async content(event, trigger, player) {
		const result = await player
			.chooseToDiscard("脧粮：弃置任意张牌（可不弃置）", [0, Infinity], "he")
			.set("ai", card => get.value(card))
			.forResult();
		if (!result?.bool) return;
		const cards = result.cards || [];
		await player.discard(cards);
		player.logSkill("shanhe_jueliang");
		const vcard = get.autoViewAs({ name: "wugu", isCard: true, storage: { extraCardsNum: cards.length, shanhe_jueliang: true } });
		await player.chooseUseTarget(vcard, true, false);
	},
	subSkill: {
		reduce: {
			charlotte: true,
			trigger: { player: "useCard" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.card?.storage?.shanhe_jueliang;
			},
			async content(event, trigger, player) {
				const X = player.hp;
				const result = await player
					.chooseTarget(`脧粮：选择要取消的目标（至多${X}个）`, [0, X], (card, p, target) => trigger.targets.includes(target))
					.set("ai", target => -get.attitude(player, target))
					.forResult();
				if (result?.targets?.length) {
					trigger.excluded.addArray(result.targets);
				}
			},
		},
		remain: {
			charlotte: true,
			trigger: { global: "wuguRemained" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.card?.storage?.shanhe_jueliang;
			},
			async content(event, trigger, player) {
				const cards = trigger.remained || [];
				if (!cards.length) return;
				const res = await player.chooseBool(get.prompt2("shanhe_jueliang"), "获得置入弃牌堆的剩余牌？").set("ai", () => true).forResult();
				if (res?.bool) {
					await player.gain(cards, "gain2");
				}
			},
		},
	},
},

// === 韬略 ===
shanhe_taolue: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		if (event.player != player) return false;
		if (get.type2(event.card) != "trick") return false;
		if (event.targets.length == 1) return true;
		return event.targets.length == 2 && get.info(event.card, false)?.complexTarget;
	},
	async content(event, trigger, player) {
		const target = trigger.targets[0];
		const last = player.storage.shanhe_taolue_last;
		player.storage.shanhe_taolue_last = target;
		if (!last || last == target) return;
		if (last.isDead() || last.isOut() || target.isDead() || target.isOut()) return;
		const num1 = last.countCards("h");
		const num2 = target.countCards("h");
		if (num1 == num2) return;
		if (num1 > num2) {
			const X = Math.ceil((num1 - num2) / 2);
			await last.chooseToGive(target, X, "h", true);
		} else {
			const X = Math.ceil((num2 - num1) / 2);
			await target.chooseToGive(last, X, "h", true);
		}
	},
	group: ["shanhe_taolue_record", "shanhe_taolue_clear"],
	subSkill: {
		record: {
			charlotte: true,
			trigger: { global: "useCardAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				if (event.player == player) return false;
				if (get.type2(event.card) != "trick") return false;
				if (event.targets.length == 1) return true;
				return event.targets.length == 2 && get.info(event.card, false)?.complexTarget;
			},
			content(event, trigger, player) {
				player.storage.shanhe_taolue_last = trigger.targets[0];
			},
		},
		clear: {
			charlotte: true,
			trigger: { global: "phaseBeginStart" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.storage.shanhe_taolue_last;
			},
			async content(event, trigger, player) {
				delete player.storage.shanhe_taolue_last;
			},
		},
	},
},

// === 合纵 ===
shanhe_hezong: {
	audio: 2,
	enable: "phaseUse",
	zhuanhuanji: true,
	mark: true,
	marktext: "☯",
	intro: {
		content(storage) {
			return "转换技，出牌阶段，你可以" + (storage ? "弃置两张牌并令一名本回合未以此法使用过【树上开花】的角色视为使用一张【树上开花】" : "弃置一张牌并视为使用一张【声东击西】") + "。";
		},
	},
	filter(event, player) {
		if (!player.storage.shanhe_hezong) {
			return player.countCards("he") > 0 && game.countPlayer() > 2;
		}
		return player.countCards("he") > 1 && game.hasPlayer((current) => {
			return !current.hasSkill("shanhe_hezong_used") && current.hasUseTarget({ name: "kaihua", isCard: true }, null, false);
		});
	},
	async content(event, trigger, player) {
		if (!player.storage.shanhe_hezong) {
			const discard = await player
				.chooseToDiscard("合纵：弃置一张牌并视为使用一张【声东击西】", 1, "he", true)
				.set("ai", (card) => get.value({ name: "shengdong", isCard: true }, player) - get.value(card, player))
				.forResult();
			if (!discard.bool) return;
			await player.discard(discard.cards);
			await player.chooseUseTarget(get.autoViewAs({ name: "shengdong", isCard: true }), true, false);
		} else {
			const discard = await player
				.chooseToDiscard("合纵：弃置两张牌并令一名角色视为使用一张【树上开花】", 2, "he", true)
				.set("ai", (card) => get.value({ name: "kaihua", isCard: true }, player) - get.value(card, player))
				.forResult();
			if (!discard.bool) return;
			await player.discard(discard.cards);
			const result = await player
				.chooseTarget("合纵：选择一名本回合未以此法使用过【树上开花】的角色", (card, p, target) => {
					return !target.hasSkill("shanhe_hezong_used") && target.hasUseTarget({ name: "kaihua", isCard: true }, null, false);
				})
				.set("ai", (target) => get.attitude(player, target))
				.forResult();
			if (!result.bool || !result.targets?.length) return;
			const target = result.targets[0];
			target.addTempSkill("shanhe_hezong_used", { global: "phaseBeginStartAfter" });
			await target.chooseUseTarget({
				card: get.autoViewAs({ name: "kaihua", isCard: true }),
				forced: true,
				prompt: `${get.translation(player)}对你发动了【合纵】###视为使用一张【树上开花】`,
			});
		}
		player.changeZhuanhuanji("shanhe_hezong");
	},
	ai: {
		// 出牌阶段 AI 排序依赖 ai.order(此前缺失,AI 不会主动发动);
		// 弃牌/选目标的收益已由 content 内各选择自带 ai 评估
		order: 5,
		result: { player: 1 },
	},
	subSkill: {
		used: {
			charlotte: true,
			onremove: true,
		},
	},
},

// === 交阋 ===
zishu_jiaoxi: {
	audio: 2,
	group: ["zishu_jiaoxi_dieclear"],
	zhuanhuanji(player, skill) {
		player.storage[skill] = !player.storage[skill];
		if (player.storage[skill]) {
			game.players.forEach((p) => p.removeSkill("zishu_jiaoxi_wuzhong"));
			player.addSkill("zishu_jiaoxi_respond");
		} else {
			game.players.forEach((p) => p.addSkill("zishu_jiaoxi_wuzhong"));
			player.removeSkill("zishu_jiaoxi_respond");
		}
	},
	mark: true,
	marktext: "☯",
	intro: {
		content(storage) {
			return "转换技。" + (storage
				? "②你可以将颜色与上次因此转化牌相同的牌当【无懈可击】或【闪】使用。你抵消牌后，可以转换此技能或摸一张牌。"
				: "①所有角色均可以将一张锦囊牌当一张【无中生有】使用。");
		},
	},
	init(player) {
		game.players.forEach((p) => p.addSkill("zishu_jiaoxi_wuzhong"));
	},
	onremove(player) {
		game.players.forEach((p) => p.removeSkill("zishu_jiaoxi_wuzhong"));
		player.removeSkill("zishu_jiaoxi_respond");
	},
	trigger: { global: ["eventNeutralized", "shaMiss"] },
	filter(event, player) {
		if (event.type !== "card") return false;
		const evt = event._neutralize_event;
		let responder;
		if (event.name === "sha") {
			responder = event.target;
		} else {
			if (evt?.type !== "card") return false;
			responder = evt.player;
		}
		return responder === player;
	},
	check(event, player) {
		return true;
	},
	async content(event, trigger, player) {
		const choice = await player
			.chooseControl("转换交阋", "摸一张牌")
			.set("prompt", get.prompt("zishu_jiaoxi"))
			.set("ai", () => 1)
			.forResult();
		if (choice?.control === "转换交阋") {
			player.changeZhuanhuanji("zishu_jiaoxi");
		} else if (choice?.control === "摸一张牌") {
			player.logSkill("zishu_jiaoxi");
			await player.draw();
		}
	},
	subSkill: {
		dieclear: {
			trigger: { player: "dieAfter" },
			silent: true,
			forceDie: true,
			filter(event, player) {
				return !game.hasPlayer((current) => current.hasSkill("zishu_jiaoxi"));
			},
			content(event, trigger, player) {
				lib.skill.zishu_jiaoxi.onremove(player);
			},
		},
		wuzhong: {
			charlotte: true,
			enable: "chooseToUse",
			filterCard(card) {
				return get.type2(card) == "trick";
			},
			position: "hes",
			viewAsFilter(player) {
				return player.countCards("hes", (card) => get.type2(card) == "trick") > 0;
			},
			viewAs: { name: "wuzhong", isCard: true },
			prompt: "将一张锦囊牌当【无中生有】使用",
			check(card) {
				return get.value({ name: "wuzhong" }, get.player()) - get.value(card);
			},
			precontent(event, trigger, player) {
				const card = event.result?.cards?.[0] || event.result?.card;
				const color = card ? get.color(card, false) : null;
				if (color) {
					game.players.forEach((p) => {
						if (p.hasSkill("zishu_jiaoxi")) {
							p.storage.zishu_jiaoxi_lastColor = color;
						}
					});
				}
				game.players.forEach((p) => {
					if (p.hasSkill("zishu_jiaoxi")) {
						p.changeZhuanhuanji("zishu_jiaoxi");
					}
				});
			},
		},
		respond: {
			charlotte: true,
			audio: "zishu_jiaoxi",
			enable: ["chooseToUse", "chooseToRespond"],
			position: "hes",
			filter(event, player) {
				const color = player.storage.zishu_jiaoxi_lastColor;
				if (!color || player.countCards("hes", (card) => get.color(card, false) == color) === 0) {
					return false;
				}
				if (event.name == "chooseToUse" && event.type == "wuxie") {
					return event.filterCard(get.autoViewAs({ name: "wuxie" }, "unsure"), player, event);
				}
				return event.filterCard(get.autoViewAs({ name: "shan" }, "unsure"), player, event);
			},
			filterCard(card, player, event) {
				if (get.color(card, false) != player.storage.zishu_jiaoxi_lastColor) {
					return false;
				}
				event = event || _status.event;
				const filter = event._backup?.filterCard || event.filterCard;
				if (event.name == "chooseToUse" && event.type == "wuxie") {
					return filter({ name: "wuxie", cards: [card] }, player, event);
				}
				return filter({ name: "shan", cards: [card] }, player, event);
			},
			viewAs(cards, player) {
				const evt = _status.event;
				if (evt.name == "chooseToUse" && evt.type == "wuxie") {
					return { name: "wuxie" };
				}
				return { name: "shan" };
			},
			check(card) {
				if (_status.event.type == "phase") {
					return 0;
				}
				return 1;
			},
			hiddenCard(player, name) {
				if (!["shan", "wuxie"].includes(name)) {
					return false;
				}
				const color = player.storage.zishu_jiaoxi_lastColor;
				return !!color && player.countCards("hes", (card) => get.color(card, false) == color) > 0;
			},
			precontent(event, trigger, player) {
				player.changeZhuanhuanji("zishu_jiaoxi");
			},
			prompt: "将一张同色牌当【无懈可击】或【闪】使用",
		},
	},
},

// === 宫殇 ===
zishu_gongshang: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { global: "useCard" },
	filter(event, player) {
		if (get.name(event.card, false) != "sha") return false;
		const last = player.storage.zishu_gongshang_last;
		if (!last) return false;
		if (event.player != player && !event.targets.includes(player)) return false;
		if (last.targets.includes(event.player)) return true;
		if (event.targets.includes(last.player)) return true;
		return false;
	},
	content(event, trigger, player) {
		trigger.effectCount++;
	},
	group: ["zishu_gongshang_record"],
	subSkill: {
		record: {
			charlotte: true,
			trigger: { global: "useCardAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return get.name(event.card, false) == "sha";
			},
			content(event, trigger, player) {
				player.storage.zishu_gongshang_last = {
					player: trigger.player,
					targets: trigger.targets.slice(),
				};
			},
		},
	},
},

// === 飞戾 ===
zhuoming_feili: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		const vcard = { name: "juedou", isCard: true, storage: { zhuoming_feili: true } };
		return event.filterCard(vcard, player, event);
	},
	mark: true,
	marktext: "戾",
	init(player) {
		if (!Number.isInteger(player.storage.zhuoming_feili)) {
			player.storage.zhuoming_feili = 0;
		}
	},
	intro: {
		markcount(storage, player) {
			return (player.storage.zhuoming_feili || 0) + 1;
		},
		content(storage, player) {
			const slots = player.storage.zhuoming_feili_slots || [];
			const len = slots.length || 4;
			const state = player.storage.zhuoming_feili || 0;
			let str = `当前：第${get.cnNumber(state + 1)}项（共${get.cnNumber(len)}项）。`;
			str += "序号：" + slots.map((s, i) => `${get.cnNumber(i + 1)}：${s.player === player ? "你" : get.translation(s.player)}`).join("、");
			return str;
		},
	},
	async content(event, trigger, player) {
		const slots = player.storage.zhuoming_feili_slots || (player.storage.zhuoming_feili_slots = []);
		if (!slots.length) {
			slots.push({ player }, { player }, { player }, { player });
			player.updateMarks("zhuoming_feili");
		}
		const state = player.storage.zhuoming_feili || 0;
		const subject = slots[state].player;
		const vcard = { name: "juedou", isCard: true, storage: { zhuoming_feili: true } };
		await subject.chooseUseTarget(vcard, true, false);
	},
	group: ["zhuoming_feili_cycle", "zhuoming_feili_record", "zhuoming_feili_remove"],
	subSkill: {
		cycle: {
			charlotte: true,
			trigger: { player: "useCard" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.card?.storage?.zhuoming_feili;
			},
			async content(event, trigger, player) {
				const slots = player.storage.zhuoming_feili_slots || [];
				const len = slots.length || 4;
				const state = player.storage.zhuoming_feili || 0;
				player.storage.zhuoming_feili = state === len - 1 ? 0 : state + 1;
				player.updateMarks("zhuoming_feili");
				if (state === len - 1) {
					for (const s of slots.slice()) {
						if (s.player?.isIn() && !s.player.isDead()) {
							await s.player.damage(1, null, player);
						}
					}
					await player.draw(2);
				}
			},
		},
		record: {
			charlotte: true,
			priority: 1,
			trigger: { global: "damageAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.card?.storage?.zhuoming_feili && !event.player?.isDead();
			},
			content(event, trigger, player) {
				const slots = player.storage.zhuoming_feili_slots || (player.storage.zhuoming_feili_slots = []);
				if (!slots.length) {
					slots.push({ player }, { player }, { player }, { player });
				}
				const state = player.storage.zhuoming_feili || 0;
				slots[state].player = trigger.player;
				player.updateMarks("zhuoming_feili");
			},
		},
		remove: {
			charlotte: true,
			trigger: { global: "dieAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const slots = player.storage.zhuoming_feili_slots;
				return slots?.some((s) => s.player === event.player);
			},
			content(event, trigger, player) {
				const slots = player.storage.zhuoming_feili_slots;
				if (!slots) return;
				slots.removeArray(slots.filter((s) => s.player === trigger.player));
				const state = player.storage.zhuoming_feili || 0;
				if (state >= slots.length) {
					player.storage.zhuoming_feili = Math.max(0, slots.length - 1);
				}
				if (!slots.length) {
					slots.push({ player }, { player }, { player }, { player });
					player.storage.zhuoming_feili = 0;
				}
				player.updateMarks("zhuoming_feili");
			},
		},
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
},

// === 伪恭 ===
zhuoming_weigong: {
	audio: 2,
	locked: true,
	forced: true,
	priority: 2,
	trigger: {
		player: "damageAfter",
		source: "damageAfter",
	},
	filter(event, player) {
		return true;
	},
	mark: true,
	marktext: "恭",
	init(player) {
		if (!Number.isInteger(player.storage.zhuoming_weigong)) {
			player.storage.zhuoming_weigong = 0;
		}
	},
	intro: {
		markcount(storage, player) {
			return (player.storage.zhuoming_weigong || 0) + 1;
		},
		content(storage, player) {
			const state = player.storage.zhuoming_weigong || 0;
			const forward = player.storage.zhuoming_weigong_forward;
			let str = `当前：第${get.cnNumber(state + 1)}项。`;
			str += state === forward ? "当前项为推进。" : "当前项为回退。";
			if (forward !== undefined) {
				str += `推进项：第${get.cnNumber(forward + 1)}项。`;
			}
			return str;
		},
	},
	async content(event, trigger, player) {
		const num = trigger.num || 1;
		for (let i = 0; i < num; i++) {
			const state = player.storage.zhuoming_weigong || 0;
			const forward = player.storage.zhuoming_weigong_forward;
			const feiliSlots = player.storage.zhuoming_feili_slots || [];
			const feiliLen = feiliSlots.length || 4;
			const feiliState = player.storage.zhuoming_feili || 0;
			if (forward === state) {
				player.storage.zhuoming_feili = Math.min(feiliLen - 1, feiliState + 1);
			} else {
				player.storage.zhuoming_feili = Math.max(0, feiliState - 1);
			}
			player.updateMarks("zhuoming_feili");
			player.storage.zhuoming_weigong = (state + 1) % 4;
			if (state === 3) {
				const choice = await player
					.chooseControl("第①项", "第②项", "第③项", "第④项")
					.set("prompt", "伪恭：周始——将一项改为推进")
					.set("ai", () => 0)
					.forResult();
				if (choice?.control) {
					player.storage.zhuoming_weigong_forward = ["第①项", "第②项", "第③项", "第④项"].indexOf(choice.control);
				}
			}
			player.updateMarks("zhuoming_weigong");
		}
	},
},

// === 封叛 ===
zhuoming_fengpan: {
	audio: 2,
	trigger: { source: "damageBegin1" },
	direct: true,
	filter(event, player) {
		const target = event.player;
		if (!target?.isIn()) return false;
		if (target.group == player.group) return true;
		const counts = {};
		game.players.forEach((p) => {
			counts[p.group] = (counts[p.group] || 0) + 1;
		});
		return counts[target.group] === Math.max(...Object.values(counts));
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		let num = 0;
		if (target.group == player.group) num++;
		const counts = {};
		game.players.forEach((p) => {
			counts[p.group] = (counts[p.group] || 0) + 1;
		});
		if (counts[target.group] === Math.max(...Object.values(counts))) num++;
		if (!num) return;
		const go = await player
			.chooseBool(get.prompt("zhuoming_fengpan"), `摸${get.cnNumber(num)}张牌并变更势力`)
			.set("ai", () => true)
			.forResult();
		if (!go?.bool) return;
		player.logSkill("zhuoming_fengpan", target);
		await player.draw(num);
		const groups = lib.group.filter((g) => !lib.selectGroup.includes(g) && g != player.group);
		const choice = await player
			.chooseButton(["封叛：选择要变更的势力", [groups.map((g) => ["", "", `group_${g}`]), "vcard"]], true)
			.set("direct", true)
			// 变更势力偏好(设计者指定):魏最优先,其次群;其余势力兜底
			.set("ai", (button) => {
				const g = button.link[2].slice(6);
				if (g === "wei") return 10;
				if (g === "qun") return 5;
				return 1;
			})
			.forResult();
		if (choice?.bool && choice.links?.length) {
			await player.changeGroup(choice.links[0][2].slice(6));
		}
	},
	ai: {
		order: 1,
		result: { source: 1 },
	},
},

// === 浮乱 ===
zhuoming_fuluan: {
	audio: 2,
	groupSkill: "qun",
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		if (player.group != "qun") return false;
		return game.hasPlayer((current) => current != player);
	},
	async content(event, trigger, player) {
		const max = new Set(game.players.filter((p) => p != player).map((p) => p.group)).size;
		const result = await player
			.chooseTarget({
				filterTarget(card, player2, target) {
					// 所选角色势力互不相同（同晦默）；此处目标须为其他角色
					return target != player2 && target.group != "unknown" && !ui.selected.targets.some((current) => current.group == target.group);
				},
				selectTarget: [1, Math.max(1, max)],
				complexTarget: true,
				prompt: "浮乱：选择任意名势力各不相同的其他角色议事",
				ai(target) {
					const p = get.player();
					return get.attitude(p, target) < 0 ? 1 : 0.1;
				},
			})
			.forResult();
		if (!result?.bool || !result.targets?.length) return;
		const targets = result.targets;
		const debate = await player.chooseToDebate(targets).forResult();
		if (!debate?.bool) return;
		if (debate.opinion == "black") {
			const blackTargets = (debate.black || []).map((arr) => arr[0]).filter((t) => t?.isIn());
			if (!blackTargets.length) return;
			const t2 = await player
				.chooseTarget("浮乱：对一名意见为黑色的角色造成1点伤害", (card, p, target) => blackTargets.includes(target))
				.set("ai", (target) => get.damageEffect(target, get.player(), get.player()))
				.forResult();
			if (t2?.bool && t2.targets?.length) {
				player.logSkill("zhuoming_fuluan", t2.targets[0]);
				await t2.targets[0].damage(1, null, player);
			}
		} else {
			const redCards = (debate.red || []).map((arr) => arr[1]);
			if (redCards.length) {
				player.logSkill("zhuoming_fuluan");
				await player.gain(redCards, "gain2");
			}
		}
	},
},

// === 遣通 ===
zhuoming_quantong: {
	audio: 2,
	groupSkill: "wei",
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		if (player.group != "wei") return false;
		return game.hasPlayer((current) => current != player);
	},
	async content(event, trigger, player) {
		const result = await player
			.chooseTarget("遣通：令一名其他角色对你发动【驱虎】", (card, p, target) => target != p)
			.set("ai", (target) => {
				const p = get.player();
				return -get.attitude(p, target);
			})
			.forResult();
		if (!result?.bool || !result.targets?.length) return;
		const target = result.targets[0];
		player.logSkill("zhuoming_quantong", target);
		const next = game.createEvent("quhu", false, event);
		next.player = target;
		next.target = player;
		next.setContent(lib.skill.quhu.content);
		await next;
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
},

// === 裂宗 ===
zhuoming_liezong: {
	audio: 2,
	enable: "phaseUse",
	seatRelated: true,
	trigger: {
		player: ["damageAfter", "recoverAfter"],
	},
	filter(event, player, name) {
		if (player.hasSkill("zhuoming_liezong_used")) return false;
		if (player.countCards("he") === 0) return false;
		const no1 = qunyou_no1Player();
		if (!no1) return false;
		if (name === "damageAfter") {
			return player.countCards("e") >= no1.countCards("e");
		}
		if (name === "recoverAfter") {
			return no1.hp <= player.hp;
		}
		return true;
	},
	mark: true,
	marktext: "裂",
	intro: {
		content(storage, player) {
			return `本回合弃牌堆中伤害牌数：${qunyou_damageCardInDiscardThisRound()}`;
		},
	},
	async content(event, trigger, player) {
		const no1 = qunyou_no1Player();
		const both = no1 && player.countCards("e") >= no1.countCards("e") && no1.hp <= player.hp;
		if (both) {
			const result = await player
				.chooseCard("h", "裂宗：使用一张手牌", true)
				.set("ai", (card) => {
					const p = get.player();
					return p.getUseValue(card);
				})
				.forResult();
			if (!result?.bool || !result.cards?.length) return;
			await player.chooseUseTarget(result.cards[0], true, false);
		} else {
			const result = await player
				.chooseToDiscard("裂宗：弃置一张牌", 1, "he", true)
				.set("ai", (card) => -get.value(card))
				.forResult();
			if (!result?.bool) return;
			await player.discard(result.cards);
		}
		const X = qunyou_damageCardInDiscardThisRound();
		const maxHand = Math.max(...game.players.map((p) => p.countCards("h")));
		if (X > 0 && maxHand - player.countCards("h") <= X) {
			player.logSkill("zhuoming_liezong");
			await player.draw(X);
			player.addTempSkill("zhuoming_liezong_used", "phaseAfter");
			player.addTempSkill("zhuoming_liezong_effect", "phaseAfter");
		}
	},
	subSkill: {
		used: {
			charlotte: true,
			onremove: true,
		},
		effect: {
			charlotte: true,
			mod: {
				cardUsable(card, player, num) {
					return Infinity;
				},
				targetInRange(card, player, target, now) {
					return true;
				},
			},
		},
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
},

// === 玉伞 ===
zishu_yusan: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		return get.type2(event.card) == "trick";
	},
	mark: true,
	marktext: "伞",
	init(player) {
		setTimeout(() => {
			if (player.marks?.zishu_yusan) {
				player.unmarkSkill("zishu_yusan");
			}
		}, 0);
	},
	intro: {
		mark(dialog, storage, player) {
			const cards = zishu_yusan_getCards(player);
			dialog.addText("你使用下张锦囊牌后可获得的牌");
			if (cards.length) {
				dialog.addSmall(cards);
			} else {
				dialog.addText("（暂无）");
			}
		},
	},
	async content(event, trigger, player) {
		const count = player.countAllHistory("useCard", (evt) => get.type2(evt.card) == "trick");
		if (count % 2 === 1) {
			player.storage.zishu_yusan_last = trigger;
			player.markSkill("zishu_yusan");
			return;
		}
		const gains = zishu_yusan_getCards(player);
		player.storage.zishu_yusan_last = trigger;
		player.unmarkSkill("zishu_yusan");
		if (gains.length) {
			player.logSkill("zishu_yusan");
			await player.gain(gains, "gain2");
		}
	},
},

// === 回纷 ===
zishu_huifen: {
	audio: 2,
	enable: "chooseToUse",
	filterCard(card) {
		return get.name(card) == "sha";
	},
	position: "h",
	viewAsFilter(player) {
		return !player.hasSkill("zishu_huifen_disabled") && player.countCards("h", "sha") > 0;
	},
	viewAs: { name: "kaihua", isCard: true },
	prompt: "将一张【杀】当【树上开花】使用",
	check(card) {
		const p = get.player();
		return p.getUseValue({ name: "kaihua", isCard: true }) - get.value(card);
	},
	precontent(event, trigger, player) {
		player.addSkill("zishu_huifen_disabled");
	},
	group: ["zishu_huifen_record"],
	subSkill: {
		record: {
			charlotte: true,
			trigger: { global: ["gainAfter", "loseAsyncAfter"] },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.hasSkill("zishu_huifen_disabled") && (event.getg?.(player) || []).length >= 3;
			},
			content(event, trigger, player) {
				player.removeSkill("zishu_huifen_disabled");
			},
		},
		disabled: {
			charlotte: true,
			onremove: true,
		},
	},
	ai: {
		order: 4,
		result: { player: 1 },
	},
},

// === 击藩 ===
zishu_jifan: {
	audio: 2,
	onChooseToUse(event) {
		const player = event.player;
		event.set("zishu_jifan", (() => {
			event.zishu_jifan ??= {};
			event.zishu_jifan[player.playerid] = player.getHistory("gain").reduce((cards, evt) => cards.addArray(evt.cards), []);
			return event.zishu_jifan;
		})());
	},
	enable: "chooseToUse",
	filter(event, player) {
		const cards = player.getCards("he", card => event.zishu_jifan?.[player.playerid]?.includes(card));
		return cards.length > 0 && cards.some(i => event.filterCard(get.autoViewAs({ name: "zishu_yiyi" }, [i]), player, event));
	},
	chooseButton: {
		dialog(event, player) {
			const cards = player.getCards("he", card => event.zishu_jifan?.[player.playerid]?.includes(card));
			const vcards = [];
			if (cards.some(i => event.filterCard(get.autoViewAs({ name: "zishu_yiyi" }, [i]), player, event))) {
				vcards.push(["锦囊", "", "zishu_yiyi"]);
			}
			const dialog = ui.create.dialog("击藩", [vcards, "vcard"], "hidden");
			dialog.direct = true;
			return dialog;
		},
		ai: () => 1,
		prompt(links) {
			return `###击藩###<div class="text center">将一张本回合获得的牌当作【以逸待劳】使用</div>`;
		},
		backup(links, player) {
			return {
				audio: "zishu_jifan",
				filterCard(card, player) {
					return get.event().zishu_jifan?.[player.playerid]?.includes(card);
				},
				position: "he",
				check(card) {
					return 8 - get.value(card);
				},
				viewAs: { name: "zishu_yiyi" },
			};
		},
	},
	ai: {
		order: 7,
		result: { player: 1 },
	},
},

// === 馘灭 ===
zishu_guomie: {
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	// 决斗风险自评:手中留有【杀】应对交替打出、体力不致被反伤打危,才值得发动;目标优劣交由 chooseUseTarget 的 AI
	check(event, player) {
		if (player.hp <= 1) return 0;
		return player.countCards("h", "sha") > 0;
	},
	group: ["zishu_guomie_record", "zishu_guomie_boost", "zishu_guomie_juedou", "zishu_guomie_extra"],
	async content(event, trigger, player) {
		const vcard = get.autoViewAs({ name: "juedou", isCard: true, storage: { zishu_guomie: true } }, "unsure");
		await player.chooseUseTarget("馘灭：视为使用一张【决斗】", vcard, true, false).forResult();
	},
	subSkill: {
		record: {
			charlotte: true,
			trigger: { player: "damageEnd" },
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				const num = trigger.num || 1;
				player.storage.zishu_guomie_maxHurt = Math.max(player.storage.zishu_guomie_maxHurt || 0, num);
			},
		},
		boost: {
			charlotte: true,
			trigger: { source: "damageBefore" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const maxHurt = player.storage.zishu_guomie_maxHurt || 0;
				return maxHurt > 0 && event.num < maxHurt && player.getRoundHistory("sourceDamage").length === 0;
			},
			content(event, trigger, player) {
				trigger.num = player.storage.zishu_guomie_maxHurt;
				game.log(player, "因【馘灭】将伤害值改为", trigger.num);
			},
		},
		juedou: {
			charlotte: true,
			trigger: { global: "chooseToRespondAfter" },
			forced: true,
			popup: false,
			filter(event, player) {
				const card = event.respondTo?.[1];
				if (!card || get.name(card, event.player) != "juedou") return false;
				if (!card.storage?.zishu_guomie) return false;
				if (event.result?.bool) return false;
				if (card.storage.zishu_guomie_handled) return false;
				return true;
			},
			async content(event, trigger, player) {
				const card = trigger.respondTo[1];
				card.storage.zishu_guomie_handled = true;
				const useEvt = trigger.getParent("useCard");
				const responder = trigger.player;
				const source = useEvt?.player;
				const target = useEvt?.targets?.[0];
				const opposite = responder === source ? target : source;
				if (!opposite?.isIn()) {
					trigger.result.bool = true;
					return;
				}
				const choice = await opposite
					.chooseControl("弃置其一张牌", "令此牌伤害+1", "cancel2")
					.set("prompt", "馘灭：一方首次放弃打出【杀】，请选择一项")
					.set("ai", () => {
						const att = get.attitude(opposite, responder);
						if (att <= 0) return "令此牌伤害+1";
						return "弃置其一张牌";
					})
					.forResult();
				if (!choice?.control || choice.control === "cancel2") {
					return;
				}
				if (choice.control === "弃置其一张牌") {
					if (responder.countDiscardableCards(opposite, "he")) {
						await opposite.discardPlayerCard(responder, "he", [1, 1], true).forResult();
					}
				} else {
					useEvt.extraDamage = (useEvt.extraDamage || 0) + 1;
				}
				trigger.result.bool = true;
			},
		},
		extra: {
			charlotte: true,
			trigger: { global: "damageBegin" },
			forced: true,
			popup: false,
			filter(event, player) {
				const useEvt = event.getParent("useCard");
				if (!useEvt?.card?.storage?.zishu_guomie) return false;
				return (useEvt.extraDamage || 0) > 0;
			},
			content(event, trigger, player) {
				const useEvt = trigger.getParent("useCard");
				trigger.num += useEvt.extraDamage || 0;
			},
		},
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
},

// === 骸饗 ===
zishu_haixiang: {
	audio: 2,
	direct: true,
	trigger: { global: "damageBegin" },
	group: ["zishu_haixiang_after", "zishu_haixiang_dujiu"],
	filter(event, player) {
		return event.num > event.player.hp && event.player.isIn();
	},
	async content(event, trigger, player) {
		const diff = trigger.num - trigger.player.hp;
		const bool = await player
			.chooseBool(get.prompt2("zishu_haixiang"), `是否将此伤害值改为${get.translation(trigger.player)}的体力值（${trigger.player.hp}），摸${get.cnNumber(diff)}张牌？`)
			.set("ai", () => {
				const t = trigger.player;
				if (t === player) return true;
				return get.attitude(player, t) > 0;
			})
			.forResult();
		if (!bool?.bool) return;
		player.logSkill("zishu_haixiang", trigger.player);
		trigger.num = trigger.player.hp;
		if (diff > 0) {
			player.storage.zishu_haixiang_pending = { damage: trigger, diff };
		}
	},
	subSkill: {
		after: {
			charlotte: true,
			trigger: { global: "damageAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const pending = player.storage.zishu_haixiang_pending;
				return !!pending && event === pending.damage;
			},
			async content(event, trigger, player) {
				const pending = player.storage.zishu_haixiang_pending;
				delete player.storage.zishu_haixiang_pending;
				if (pending.diff > 0) {
					const before = player.getHistory("gain").length;
					await player.draw(pending.diff);
					const gained = player.getHistory("gain").slice(before).flatMap((evt) => evt.cards || []);
					player.markAuto("zishu_haixiang_cards", gained);
					player.addSkill("zishu_haixiang_dujiu");
				}
			},
		},
		dujiu: {
			charlotte: true,
			mod: {
				cardname(card, player) {
					if (get.owner(card) === player && (player.getStorage("zishu_haixiang_cards") || []).includes(card) && !game.hasPlayer((p) => p.isDying())) {
						return "zishu_dujiu";
					}
				},
			},
			trigger: { source: "damage" },
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				player.unmarkAuto("zishu_haixiang_cards", player.getStorage("zishu_haixiang_cards").slice());
				player.removeSkill("zishu_haixiang_dujiu");
				//player.popup("失去【毒酒】");
			},
		},
	},
	ai: {
		order: 6,
		result: { player: 1 },
	},
},

// === 不群 ===
zishu_buqun: {
	audio: 2,
	group: ["zishu_buqun_draw", "zishu_buqun_remove"],
	subSkill: {
		draw: {
			audio: "zishu_buqun",
			charlotte: true,
			trigger: { player: "phaseJieshuBegin" },
			filter(event, player) {
				const num = player.countCards("h");
				return game.hasPlayer((current) => current != player && current.countCards("h") == num);
			},
			async content(event, trigger, player) {
				let count = 0;
				while (
					count < 20 &&
					game.hasPlayer((current) => current != player && current.countCards("h") == player.countCards("h"))
				) {
					const before = player.countCards("h");
					await player.draw();
					if (player.countCards("h") == before) {
						break;
					}
					count++;
				}
			},
		},
		remove: {
			audio: "zishu_buqun",
			charlotte: true,
			trigger: { player: "useCard" },
			forced: true,
			filter(event, player) {
				if (!event.card) return false;
				const num = player.countCards("h");
				return game.hasPlayer((current) => current.countCards("h") == num && current.countCards("he") > 0);
			},
			async content(event, trigger, player) {
				const num = player.countCards("h");
				const next = player.chooseTarget(
					true,
					"不群：选择一名手牌数为" + get.cnNumber(num) + "的角色，将其一张牌移出游戏至回合结束",
					(card, player2, target) => target.countCards("h") == num && target.countCards("he") > 0
				);
				next.set("ai", (target) => -get.attitude(get.player(), target));
				const result = await next.forResult();
				if (!result?.bool || !result.targets?.length) return;
				const target = result.targets[0];
				player.logSkill("zishu_buqun", target);
				const next2 = player.choosePlayerCard(target, "he", true);
				next2.set("ai", (button) => get.value(button.link));
				const result2 = await next2.forResult();
				if (!result2?.bool || !result2.cards?.length) return;
				target.addSkill("zishu_buqun_back");
				const next3 = target.addToExpansion("giveAuto", result2.cards, target);
				next3.gaintag.add("zishu_buqun_back");
				await next3;
				game.log(target, "的一张牌被移出游戏至回合结束");
			},
		},
		back: {
			audio: "zishu_buqun",
			charlotte: true,
			mark: true,
			trigger: { global: "phaseEnd" },
			forced: true,
			popup: false,
			silent: true,
			intro: {
				content: "expansion",
				markcount: "expansion",
			},
			filter(event, player) {
				return player.getExpansions("zishu_buqun_back").length > 0;
			},
			async content(event, trigger, player) {
				const cards = player.getExpansions("zishu_buqun_back");
				if (cards.length) {
					await player.gain(cards, "draw");
				}
				game.log(player, "收回了被移出游戏的牌");
				player.removeSkill("zishu_buqun_back");
			},
		},
	},
},

// === 不孤 ===
zishu_bugu: {
	audio: 2,
	group: ["zishu_bugu_ask", "zishu_bugu_die"],
	subSkill: {
		ask: {
			audio: "zishu_bugu",
			charlotte: true,
			trigger: { player: "phaseZhunbeiBegin" },
			direct: true,
			filter(event, player) {
				return game.hasPlayer((current) => current != player);
			},
			async content(event, trigger, player) {
				const handValue = (p) => p.getCards("h").reduce((sum, card) => sum + get.value(card), 0);
				const order = [];
				let current = player.next;
				while (current && current != player) {
					order.push(current);
					current = current.next;
				}
				let swapped = false;
				for (const target of order) {
					if (swapped || target.isDead()) continue;
					const req = await target
						.chooseBool("不孤：是否向" + get.translation(player) + "请求交换手牌？")
						.set("ai", () => handValue(player) > handValue(target))
						.forResult();
					if (!req?.bool) continue;
					const agree = await player
						.chooseBool(get.prompt("zishu_bugu"), "若同意，你与" + get.translation(target) + "交换手牌")
						.set("ai", () => handValue(target) > handValue(player))
						.forResult();
					if (!agree?.bool) continue;
					player.logSkill("zishu_bugu", target);
					await player.swapHandcards(target);
					swapped = true;
				}
			},
		},
		die: {
			audio: "zishu_bugu",
			charlotte: true,
			trigger: { player: "dieBegin" },
			direct: true,
			firstDo: true,
			filter(event, player) {
				return game.hasPlayer((current) => current != player);
			},
			async content(event, trigger, player) {
				const handValue = (p) => p.getCards("h").reduce((sum, card) => sum + get.value(card), 0);
				const next = player.chooseTarget("不孤：选择一名其他角色，若其同意，你与其交换手牌", (card, player2, target) => {
					return target != player2;
				});
				next.set("ai", (target) => get.attitude(get.player(), target) * (handValue(target) - handValue(get.player())));
				const result = await next.forResult();
				if (!result?.bool || !result.targets?.length) return;
				const target = result.targets[0];
				const agree = await target
					.chooseBool(get.prompt("zishu_bugu"), get.translation(player) + "请求与你交换手牌，是否同意？")
					.set("ai", () => handValue(get.player()) > handValue(target))
					.forResult();
				if (!agree?.bool) return;
					player.logSkill("zishu_bugu", target);
					await player.swapHandcards(target);
				},
			},
		},
	},

// === 悉心 ===
qiufeng_xixin: {
	audio: 2,
	trigger: { global: "phaseZhunbeiBegin" },
	direct: true,
	filter(event, player) {
		return player.countCards("hes") >= 2;
	},
	async content(event, trigger, player) {
		const go = await player
			.chooseBool(get.prompt("qiufeng_xixin"), "你可以依次弃两张牌，声明第一张牌的类型和第二张牌的花色")
			.set("ai", () => player.countCards("hes") > 2)
			.forResult();
		if (!go?.bool) return;
		const typeNames = { basic: "基本牌", trick: "锦囊牌", equip: "装备牌" };
		const suitNames = { spade: "黑桃", heart: "红桃", club: "梅花", diamond: "方块" };
		const getCategory = (card) => {
			const t = get.type(card, "trick");
			return t == "delay" ? "trick" : t;
		};
		player.logSkill("qiufeng_xixin");
		const r1 = await player
			.chooseCard("hes", true, "悉心：弃置第一张牌，声明其类型")
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!r1?.cards?.length) return;
		const typeKey = getCategory(r1.cards[0]);
		await player.discard(r1.cards);
		const r2 = await player
			.chooseCard("hes", true, "悉心：弃置第二张牌，声明其花色")
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!r2?.cards?.length) return;
		const suitKey = get.suit(r2.cards[0]);
		await player.discard(r2.cards);
		player.storage.qiufeng_xixin_deal = { type: typeKey, suit: suitKey };
		game.log(player, "声明了", "#g" + typeNames[typeKey] + "和" + suitNames[suitKey]);
	},
	group: ["qiufeng_xixin_settle"],
	getDealCards(phase) {
		return qunyou_shenshi_getTurnDiscardCards(phase);
	},
	subSkill: {
		settle: {
			audio: "qiufeng_xixin",
			charlotte: true,
			trigger: { global: "phaseEnd" },
			direct: true,
			filter(event, player) {
				return !!player.storage.qiufeng_xixin_deal;
			},
			async content(event, trigger, player) {
				const deal = player.storage.qiufeng_xixin_deal;
				delete player.storage.qiufeng_xixin_deal;
				if (player.isDying()) return;
				const phase = trigger.name == "phase" ? trigger : trigger.getParent("phase");
				const cards = lib.skill.qiufeng_xixin.getDealCards(phase).filter((card) => {
					if (get.position(card, true) != "d") return false;
					const t = get.type(card, "trick");
					return (t == "delay" ? "trick" : t) == deal.type && get.suit(card) == deal.suit;
				});
				if (cards.length) {
					const result = await player
						.chooseButton(["悉心：获得一张相符的牌", cards], true)
						.set("ai", (button) => get.value(button.link))
						.forResult();
					if (!result?.bool || !result.links?.length) return;
					player.logSkill("qiufeng_xixin");
					await player.gain(result.links[0], "gain2");
					game.log(player, "获得了", result.links[0]);
				} else {
					player.logSkill("qiufeng_xixin");
					await player.draw(3);
				}
			},
		},
	},
},

// === 袍虱 ===
qiufeng_paoshi: {
	audio: 2,
	enable: ["chooseToUse"],
	group: ["qiufeng_paoshi_record", "qiufeng_paoshi_reset"],
	mark: true,
	marktext: "☯",
	init(player, skill) {
		if (!Array.isArray(player.storage.qiufeng_paoshi_discards)) {
			player.storage.qiufeng_paoshi_discards = [];
		}
	},
	intro: {
		markcount(storage, player) {
			return lib.skill.qiufeng_paoshi.getRoundBasics(player).length;
		},
		content(storage, player) {
			let str = "转换技。" + (storage
				? "②你可以将本轮弃牌堆两张与印牌名不同的基本牌置于牌堆两侧，视为使用一张名字与二者皆不同的基本牌。"
				: "①你可以将本轮弃牌堆两张同名基本牌置于牌堆两侧，视为使用一张对应牌名的基本牌。");
			const cards = lib.skill.qiufeng_paoshi.getRoundBasics(player);
			if (!cards.length) {
				return str + "<br>本轮弃牌堆暂无基本牌";
			}
			const map = {};
			for (const card of cards) {
				const name = get.name(card);
				map[name] = (map[name] || 0) + 1;
			}
			str += "<br>本轮弃牌堆基本牌：" + Object.keys(map).map((n) => get.translation(n) + "×" + map[n]).join("、");
			return str;
		},
	},
	getRoundBasics(player) {
		return (player.storage.qiufeng_paoshi_discards || []).filter((card) => {
			return get.itemtype(card) == "card" && get.position(card, true) == "d" && get.type(card) == "basic";
		});
	},
	getCandidates(player, isYin, event) {
		const basics = lib.skill.qiufeng_paoshi.getRoundBasics(player);
		return get.inpile("basic").filter((name) => {
			const info = lib.card[name];
			if (!info || !info.enable) return false;
			if (isYin) {
				if (basics.filter((card) => get.name(card) != name).length < 2) return false;
			} else if (basics.filter((card) => get.name(card) == name).length < 2) {
				return false;
			}
			const vcard = { name, isCard: true };
			return !event || event.filterCard(vcard, player, event);
		});
	},
	hiddenCard(player, name) {
		const isYin = !!player.storage.qiufeng_paoshi;
		return lib.skill.qiufeng_paoshi.getCandidates(player, isYin).includes(name);
	},
	filter(event, player) {
		if (event.type == "wuxie") return false;
		const isYin = !!player.storage.qiufeng_paoshi;
		return lib.skill.qiufeng_paoshi.getCandidates(player, isYin, event).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			const isYin = !!player.storage.qiufeng_paoshi;
			const candidates = lib.skill.qiufeng_paoshi.getCandidates(player, isYin, event);
			const list = candidates.map((name) => ["基本", "", name]);
			return ui.create.dialog("袍虱", [list, "vcard"], "hidden");
		},
		filter(button, player) {
			const evt = _status.event.getParent();
			return evt.filterCard({ name: button.link[2], isCard: true }, player, evt);
		},
		check(button) {
			const player = _status.event.player;
			const card = { name: button.link[2] };
			if (_status.event.getParent().type != "phase") return 1;
			return player.getUseValue(card, null, true);
		},
		backup(links, player) {
			const name = links[0][2];
			return {
				audio: "qiufeng_paoshi",
				filterCard() {
					return false;
				},
				popname: true,
				viewAs: { name, isCard: true },
				selectCard: -1,
				async precontent(event, trigger, player2) {
					const isYin = !!player2.storage.qiufeng_paoshi;
					let basics = lib.skill.qiufeng_paoshi.getRoundBasics(player2).filter((card) => {
						return isYin ? get.name(card) != name : get.name(card) == name;
					});
					if (basics.length < 2) {
						basics = basics.slice(0, 1);
					}
					const next = player2.chooseToMove_new("袍虱：将两张基本牌分别置于牌堆顶和牌堆底", true);
					next.set("list", [
						["置于牌堆", basics],
						[
							["牌堆顶", []],
							["牌堆底", []],
						],
					]);
					next.set("filterMove", (from, to, moved) => {
						if (typeof to != "number") return false;
						if (to == 1 && (moved[1]?.length || 0) >= 1) return false;
						if (to == 2 && (moved[2]?.length || 0) >= 1) return false;
						return true;
					});
					next.set("processAI", (list) => {
						const cards = list[0].map((i) => i[1]).flat();
						return [[], cards.slice(0, 1), cards.slice(1)];
					});
					const moved = await next.forResult();
					if (!moved?.bool) return;
					const [, tops, bottoms] = moved.moved;
					if (tops.length != 1 || bottoms.length != 1) return;
					player2.logSkill("qiufeng_paoshi");
					const topCard = tops[0];
					topCard.fix();
					ui.cardPile.insertBefore(topCard, ui.cardPile.firstChild);
					game.log(player2, "将", topCard, "置于牌堆顶");
					const bottomCard = bottoms[0];
					bottomCard.fix();
					ui.cardPile.appendChild(bottomCard);
					game.log(player2, "将", bottomCard, "置于牌堆底");
					player2.changeZhuanhuanji("qiufeng_paoshi");
				},
			};
		},
		prompt(links, player) {
			return "将本轮弃牌堆两张基本牌置于牌堆两侧，视为使用一张【" + get.translation(links[0][2]) + "】";
		},
	},
	subSkill: {
		record: {
			charlotte: true,
			trigger: { global: ["cardsDiscardAfter", "loseAsyncAfter", "gainAfter"] },
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				const discards = player.storage.qiufeng_paoshi_discards;
				let cards = typeof trigger.getd === "function" ? trigger.getd() : [];
				if (!Array.isArray(cards) || !cards.length) {
					cards = [];
					for (const key of ["cards2", "cards"]) {
						if (Array.isArray(trigger[key])) {
							cards = cards.concat(trigger[key]);
						}
					}
				}
				for (const card of cards) {
					if (get.itemtype(card) != "card" || get.type(card) != "basic") continue;
					if (get.position(card, true) != "d") continue;
					if (discards.includes(card)) continue;
					discards.push(card);
				}
				player.updateMarks("qiufeng_paoshi");
			},
		},
		reset: {
			charlotte: true,
			trigger: { global: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				if (player.storage.qiufeng_paoshi_discards?.length) {
					player.storage.qiufeng_paoshi_discards = [];
					player.updateMarks("qiufeng_paoshi");
				}
			},
		},
	},
	ai: {
		order: 4,
		result: { player: 1 },
	},
},

// === 时宠 ===
zishu_shichong: {
	audio: 2,
	locked: true,
	forced: true,
	zhuanhuanji: true,
	mark: true,
	marktext: "☯",
	intro: {
		content(storage) {
			return (storage ? "阴：你摸牌时改为摸一张牌" : "阳：你摸牌时改为摸三张牌") + "。";
		},
	},
	trigger: { player: "drawBegin" },
	filter(event, player) {
		return event.num > 0;
	},
	async content(event, trigger, player) {
		trigger.num = player.storage.zishu_shichong ? 1 : 3;
		player.changeZhuanhuanji(event.name);
	},
},
// === 畔君 ===
zishu_panjun: {
	audio: 2,
	locked: true,
	forced: true,
	trigger: { player: "damageBegin2" },
	filter(event, player) {
		if (!event.source || event.source == player) return false;
		const diff = Math.abs(event.source.countCards("h") - player.countCards("h"));
		return diff >= player.hp || event.source.countCards("h") == player.countCards("h");
	},
	async content(event, trigger, player) {
		if (trigger.source.countCards("h") == player.countCards("h")) {
			trigger.num++;
		} else {
			trigger.num--;
		}
	},
	ai: {
		effect: {
			target(card, player, target) {
				if (!get.tag(card, "damage")) return;
				const n1 = player.countCards("h"), n2 = target.countCards("h");
				if (n1 == n2) return 1.25;
				if (Math.abs(n1 - n2) >= target.hp) return 0.75;
			},
		},
	},
},
// === 觸顏 ===
zishu_chuyan: {
	audio: 2,
	trigger: { target: "useCardToTargeted" },
	filter(event, player) {
		if (event.player == player) return false;
		if (!player.countCards("he") || !event.player.countCards("he")) return false;
		const useCardEvt = event.getParent("useCard");
		// 每回合首次成为其目标：扫使用者的 useCard 历史（useCardToTargeted 子事件不进历史）
		return !game.hasPlayer2((current) =>
			current.hasHistory("useCard", (evt) => {
				if (evt == useCardEvt || !evt.targets?.includes(player)) return false;
				const excluded = evt.excluded;
				if (excluded && (excluded.has ? excluded.has(player) : excluded.includes?.(player))) return false;
				return true;
			})
		);
	},
	async content(event, trigger, player) {
		const source = trigger.player;
		const targets = [player, source];
		const optionMap = new Map();
		const map = await game.chooseAnyOL(targets, lib.skill.zishu_chuyan.chooseOption, [targets, optionMap]).forResult();
		for (const current of targets) {
			const control = map.get(current)?.control;
			optionMap.set(current, control == "重铸" || control == "弃置" ? control : null);
		}
		// 任一方取消（目标可取消）则整体取消
		if (targets.some((current) => !optionMap.get(current))) return;
		const map2 = await game.chooseAnyOL(targets, lib.skill.zishu_chuyan.chooseCardFunc, [optionMap]).forResult();
		for (const current of targets) {
			const cards = map2.get(current)?.cards;
			if (!cards?.length) continue;
			if (optionMap.get(current) == "重铸") {
				await current.recast(cards);
			} else {
				await current.discard(cards);
			}
		}
	},
	chooseOption(current, targets) {
		const isInitiator = current == targets[0];
		const list = isInitiator ? ["重铸", "弃置"] : ["重铸", "弃置", "cancel2"];
		return current
			.chooseControl(list)
			.set("prompt", "觸顏：请选择“重铸”或“弃置”")
			.set("ai", () => {
				const worst = current.getCards("he").sort((a, b) => get.value(a) - get.value(b))[0];
				if (!isInitiator && (!worst || get.value(worst) >= 6)) return "cancel2";
				return Math.random() < 0.6 ? "重铸" : "弃置";
			});
	},
	chooseCardFunc(current, optionMap) {
		const option = optionMap.get(current);
		return current
			.chooseCard("he", true, 1)
			.set("prompt", "觸顏：请选择要" + (option == "重铸" ? "重铸" : "弃置") + "的一张牌")
				.set("ai", (card) => 5.5 - get.value(card));
		},
	},

// === 踏塞 ===
zhuoming_tasai: {
	audio: 2,
	zhuanhuanji: true,
	mark: true,
	marktext: "☯",
	intro: {
		content(storage) {
			return "转换技。当前为" + (storage ? "阴：视为额外装备一张进攻马，可转换视为使用或打出【闪】" : "阳：视为额外装备一张防御马，可转换视为使用或打出【杀】") + "。";
		},
	},
	// 额外坐骑栏：变化的虚拟+1/-1马（神典韦绝影同款 extraEquip 占位显示）
	init(player, skill) {
		// 扩一个额外坐骑栏（合并坐骑模式下 equip3/4 共用 equip3 键）
		player.expandedSlots ??= {};
		player.expandedSlots.equip3 = (player.expandedSlots.equip3 || 0) + 1;
		if (!get.is.mountCombined()) {
			player.expandedSlots.equip4 = (player.expandedSlots.equip4 || 0) + 1;
		}
		player.$syncExpand();
		player.addExtraEquip(skill, lib.skill.zhuoming_tasai.getHorseName(player), true, (p) => !p.isTempBanned(skill));
	},
	onremove(player, skill) {
		player.removeExtraEquip(skill);
		if (player.expandedSlots?.equip3) player.expandedSlots.equip3--;
		if (!get.is.mountCombined() && player.expandedSlots?.equip4) player.expandedSlots.equip4--;
		player.$syncExpand();
	},
	getHorseName(player) {
		return player.storage.zhuoming_tasai ? "zhuoming_jinma" : "zhuoming_fangma";
	},
	group: ["zhuoming_tasai_sha", "zhuoming_tasai_shan"],
	// 转换印牌的后续：马所致的范围变化 → 弃"对方"两张牌
	trigger: { player: ["useCard", "respond"] },
	forced: true,
	logTarget(event, player) {
		// 冲阵式"对方"解析：杀→目标；闪→杀的使用者；打出→响应来源
		if (event.name == "respond") return event.source;
		if (event.card.name == "sha") return event.targets?.[0];
		return event.respondTo?.[0];
	},
	filter(event, player) {
		if (!event.skill || !event.skill.startsWith("zhuoming_tasai")) return false;
		const target = lib.skill.zhuoming_tasai.logTarget(event, player);
		if (!target || !target.isIn() || target == player) return false;
		if (!target.countDiscardableCards(player, "he")) return false;
		// 严格因果判定：挂起虚拟马的距离修正后对比范围状态
		const inMyRangeWith = player.inRange(target), inTheirRangeWith = target.inRange(player);
		player.storage.zhuoming_tasai_suspended = true;
		const inMyRangeWithout = player.inRange(target), inTheirRangeWithout = target.inRange(player);
		delete player.storage.zhuoming_tasai_suspended;
		if (event.card.name == "sha") {
			// 对方因此进入你的攻击范围
			return inMyRangeWith && !inMyRangeWithout;
		}
		// 你因此脱离对方的攻击范围
		return !inTheirRangeWith && inTheirRangeWithout;
	},
	async content(event, trigger, player) {
		const target = lib.skill.zhuoming_tasai.logTarget(trigger, player);
		if (!target?.isIn()) return;
		await player.discardPlayerCard(target, 2, "he", true);
	},
		// 虚拟马的距离修正（阳=防御马：他人计算与你的距离+1；阴=进攻马：你计算与其他角色的距离-1）
		mod: {
			globalTo(from, to, distance) {
				if (to.storage?.zhuoming_tasai_suspended || to.storage?.zhuoming_tasai) return;
				return distance + 1;
			},
			globalFrom(from, to, distance) {
				if (from.storage?.zhuoming_tasai_suspended || !from.storage?.zhuoming_tasai) return;
				return distance - 1;
			},
		},
		subSkill: {
		sha: {
			audio: "zhuoming_tasai",
			name: "踏塞",
			enable: ["chooseToUse", "chooseToRespond"],
			viewAs: { name: "sha", isCard: true },
			viewAsFilter(player) {
				return !player.storage.zhuoming_tasai;
			},
			filter(event, player) {
				return event.filterCard(get.autoViewAs({ name: "sha", isCard: true }, "unsure"), player, event);
			},
			filterCard: () => false,
			selectCard: 0,
			async precontent(event, trigger, player) {
				player.changeZhuanhuanji("zhuoming_tasai");
				// 换状态：replace=true 先清该技能旧虚拟马再挂新马
				player.addExtraEquip("zhuoming_tasai", lib.skill.zhuoming_tasai.getHorseName(player), true, (p) => !p.isTempBanned("zhuoming_tasai"));
			},
			ai: {
				order: 4.5,
				respondSha: true,
				skillTagFilter(player, tag) {
					return tag == "respondSha" && !player.storage.zhuoming_tasai;
				},
			},
			hiddenCard(player, name) {
				return name == "sha" && !player.storage.zhuoming_tasai;
			},
		},
		shan: {
			audio: "zhuoming_tasai",
			name: "踏塞",
			enable: ["chooseToUse", "chooseToRespond"],
			viewAs: { name: "shan", isCard: true },
			viewAsFilter(player) {
				return player.storage.zhuoming_tasai;
			},
			filter(event, player) {
				return event.filterCard(get.autoViewAs({ name: "shan", isCard: true }, "unsure"), player, event);
			},
			filterCard: () => false,
			selectCard: 0,
			async precontent(event, trigger, player) {
				player.changeZhuanhuanji("zhuoming_tasai");
				// 换状态：replace=true 先清该技能旧虚拟马再挂新马
				player.addExtraEquip("zhuoming_tasai", lib.skill.zhuoming_tasai.getHorseName(player), true, (p) => !p.isTempBanned("zhuoming_tasai"));
			},
			ai: {
				order: 4.5,
				respondShan: true,
				skillTagFilter(player, tag) {
					return tag == "respondShan" && player.storage.zhuoming_tasai;
				},
			},
			hiddenCard(player, name) {
				return name == "shan" && player.storage.zhuoming_tasai;
			},
		},
	},
},

// === 卷陇 ===
zhuoming_juanlong: {
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "orange",
	trigger: { player: "phaseDiscardBefore" },
	// 限定技珍贵:仅当本阶段必然重弃手牌(手牌数>手牌上限)时才值得发动
	check(event, player) {
		return player.countCards("h") > player.getHandcardLimit();
	},
	async content(event, trigger, player) {
		player.awakenSkill(event.name);
		trigger.cancel();
		const deadBefore = game.dead.length;
		// 开启全流程"成为牌的目标"计数（不限杀——杀可能触发其他技能使用其他牌指定目标）
		player.storage.zhuoming_juanlong_counting = true;
		player.storage.zhuoming_juanlong_targetCount = {};
		player.storage.zhuoming_juanlong_hpLost = [];
		player.addSkill("zhuoming_juanlong_count");
		try {
			await player.draw(4);
			// 分配若干手牌（共创式单对话框：已分配的手牌变灰，剩余可继续分配；首轮强制保证"若干"至少一张）
			const give_map = new Map();
			const allAssigned = [];
			let first = true;
			while (player.hasCard((card) => !card.hasGaintag("zhuoming_juanlong_assigned"), "h")) {
				const rest = player.countCards("h", (card) => !card.hasGaintag("zhuoming_juanlong_assigned"));
				const result = await player
					.chooseCardTarget({
						prompt: "卷陇：请选择要分配的卡牌和目标" + (first ? "" : "（可点击取消结束分配）"),
						filterCard(card) {
							return !card.hasGaintag("zhuoming_juanlong_assigned");
						},
						selectCard: [1, rest],
						position: "h",
						filterTarget: true,
						forced: first,
						ai1(card) {
							if (!ui.selected.cards.length) return 1;
							return 0;
						},
						ai2(target) {
							const player2 = get.player(), card = ui.selected.cards[0];
							if (!card) return 0;
							const val = target.getUseValue(card);
							if (val > 0) return val * get.attitude(player2, target) * 2;
							return get.value(card, target) * get.attitude(player2, target);
						},
					})
					.forResult();
				if (!result?.bool || !result.cards?.length || !result.targets?.length) {
					if (!first) break;
					continue;
				}
				first = false;
				const { cards: assignedCards, targets: [target] } = result;
				player.addGaintag(assignedCards, "zhuoming_juanlong_assigned");
				allAssigned.addArray(assignedCards);
				give_map.set(target, (give_map.get(target) || []).concat(assignedCards));
			}
			if (!give_map.size) return;
			const gain_list = [];
			for (const [target, cards] of give_map) {
				if (!target.isIn()) continue;
				player.line(target, "green");
				gain_list.push([target, cards]);
			}
			const cards2 = Array.from(give_map.values()).flat();
			await game.loseAsync({ gain_list, giver: player, player, cards: cards2, animate: "giveAuto" }).setContent("gaincardMultiple");
			player.removeGaintag("zhuoming_juanlong_assigned", allAssigned);
			// 因此获得至少三张牌的角色可以使用若干【杀】
			for (const [target, cards] of give_map) {
				if (cards.length < 3 || !target.isIn()) continue;
				while (target.isIn()) {
					const next = target.chooseToUse("卷陇：你可以使用一张【杀】（或点击“取消”结束）", { name: "sha" });
					next.set("addCount", false);
					const res = await next.forResult();
					if (!res?.bool) break;
				}
			}
		} finally {
			player.removeSkill("zhuoming_juanlong_count");
			delete player.storage.zhuoming_juanlong_counting;
			delete player.storage.zhuoming_juanlong_targetCount;
			delete player.storage.zhuoming_juanlong_hpLost;
		}
		// 因此死亡至少一名角色后重置此技能
		if (game.dead.length > deadBefore && player.isIn()) {
			player.restoreSkill(event.name);
			game.log(player, "重置了", "#g【" + get.translation(event.name) + "】");
		}
	},
	subSkill: {
		count: {
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			// 流程内全局监听：任何角色成为使用牌的目标即计数
			trigger: { global: "useCardToTarget" },
			filter(event, player) {
				return player.storage.zhuoming_juanlong_counting && event.target?.isIn();
			},
			async content(event, trigger, player) {
				const target = trigger.target;
				const key = target.playerid;
				const map = player.storage.zhuoming_juanlong_targetCount;
				map[key] = (map[key] || 0) + 1;
				// 该流程中第二次成为牌的目标后，失去一点体力（每人至多一次）
				if (map[key] >= 2 && !player.storage.zhuoming_juanlong_hpLost.includes(key) && target.isIn()) {
					player.storage.zhuoming_juanlong_hpLost.push(key);
					await target.loseHp(1);
				}
			},
		},
	},
},

// === 烽起 ===
zhuoming_fengqi: {
	audio: 2,
	mark: true,
	marktext: "烽",
	init(player) {
		if (!Number.isInteger(player.storage.zhuoming_fengqi)) {
			player.storage.zhuoming_fengqi = 0;
		}
		if (!Array.isArray(player.storage.zhuoming_fengqi_slots)) {
			player.storage.zhuoming_fengqi_slots = [{ player }];
		}
		if (!player.storage.zhuoming_fengqi_zhoushi) {
			player.storage.zhuoming_fengqi_zhoushi = player;
		}
	},
	intro: {
		markcount(storage, player) {
			const slots = player.storage.zhuoming_fengqi_slots;
			if (!Array.isArray(slots) || !slots.length) return 0;
			return (player.storage.zhuoming_fengqi || 0) + 1;
		},
		content(storage, player) {
			const slots = player.storage.zhuoming_fengqi_slots;
			if (!Array.isArray(slots) || !slots.length) return "当前：无序号。";
			const state = player.storage.zhuoming_fengqi || 0;
			const seqName = (i) => (i < 20 ? String.fromCodePoint(0x2460 + i) : `(${i + 1})`);
			let str = `当前：第${get.cnNumber(state + 1)}项（共${get.cnNumber(slots.length)}项）。`;
			str += "序号：" + slots.map((s, i) => `${seqName(i)}${s.player === player ? "你" : get.translation(s.player)}`).join("、");
			return str;
		},
	},
	trigger: { global: "useCardAfter" },
	direct: true,
	filter(event, player) {
		if (get.name(event.card) != "sha" || !event.player?.isIn()) return false;
		const slots = player.storage.zhuoming_fengqi_slots;
		if (!Array.isArray(slots) || !slots.length) return false;
		const state = player.storage.zhuoming_fengqi || 0;
		if (state >= slots.length || slots[state].player !== event.player) return false;
		return slots.some((s) => s.player?.isIn() && s.player.countCards("hes", (card) => s.player.canRecast(card)));
	},
	async content(event, trigger, player) {
		const chooser = trigger.player;
		const slots = player.storage.zhuoming_fengqi_slots;
		const seqName = (i) => (i < 20 ? String.fromCodePoint(0x2460 + i) : `(${i + 1})`);
		const names = slots.map((s, i) => seqName(i) + (s.player === chooser ? "你" : get.translation(s.player))).join("");
		const result = await chooser
			.chooseBool(`烽起：是否发动？${names}，使用【杀】后，可以令所有序号内角色各重铸一至二张牌，各类型的唯一失去者可以使用其失去的同类型牌`)
			.set("ai", () => {
				return slots.some((s) => s.player === chooser && s.player.countCards("hes", (card) => s.player.canRecast(card)));
			})
			.forResult();
		if (result.bool) {
			await chooser.logSkill("zhuoming_fengqi");
			// 锁定技：被连续发动两次后，周始发动者改为后者
			player.storage.zhuoming_fengqi_acts = (player.storage.zhuoming_fengqi_acts || 0) + 1;
			player.storage.zhuoming_fengqi_declines = { count: 0, player: null };
			if (player.storage.zhuoming_fengqi_acts >= 2 && player.storage.zhuoming_fengqi_zhoushi !== chooser) {
				player.storage.zhuoming_fengqi_zhoushi = chooser;
				game.log(chooser, "成为了", "#g【烽起】", "的周始发动者");
			}
			// 所有序号内角色各重铸一至二张牌
			const lost = [];
			for (const s of slots) {
				const current = s.player;
				if (!current?.isIn()) continue;
				const max = Math.min(2, current.countCards("hes", (card) => current.canRecast(card)));
				if (!max) continue;
				const recast = await current
					.chooseCard("hes", [1, max], true, max > 1 ? "烽起：请重铸一至二张牌" : "烽起：请重铸一张牌")
					.set("filterCard", (card, p) => p.canRecast(card))
					.set("ai", (card) => 6 - get.value(card))
					.forResult();
				if (recast?.cards?.length) {
					await current.recast(recast.cards);
					lost.push({ player: current, cards: recast.cards.slice() });
				}
			}
			// 各类型的唯一失去者可以使用其失去的同类型牌
			for (const cat of ["basic", "trick", "equip"]) {
				const owners = lost.filter((l) => l.cards.some((card) => lib.skill.zhuoming_fengqi.getCat(card) === cat));
				if (owners.length !== 1 || !owners[0].player.isIn()) continue;
				const loser = owners[0].player;
				for (const card of owners[0].cards) {
					if (lib.skill.zhuoming_fengqi.getCat(card) !== cat) continue;
					if (get.position(card, true) != "d") continue;
					if (!game.hasPlayer((target) => loser.canUse(card, target))) continue;
					const useBool = await loser
						.chooseBool(`烽起：是否使用你重铸失去的${lib.skill.zhuoming_fengqi.catName(cat)}（${get.translation(card)}）？`)
						.set("ai", () => get.value(card, loser) > 0)
						.forResult();
					if (useBool.bool) {
						await loser.chooseUseTarget(card, true, "nopopup");
					}
				}
			}
		} else {
			// 锁定技：被连续拒绝发动两次后，删去前者的序号及内容
			const decl = player.storage.zhuoming_fengqi_declines || (player.storage.zhuoming_fengqi_declines = { count: 0, player: null });
			decl.count++;
			player.storage.zhuoming_fengqi_acts = 0;
			if (decl.count >= 2) {
				const former = decl.player;
				const idx = former ? slots.findIndex((s) => s.player === former) : -1;
				if (idx >= 0) {
					slots.splice(idx, 1);
					if (idx < (player.storage.zhuoming_fengqi || 0)) {
						player.storage.zhuoming_fengqi = Math.max(0, player.storage.zhuoming_fengqi - 1);
					}
					if ((player.storage.zhuoming_fengqi || 0) >= slots.length) {
						player.storage.zhuoming_fengqi = 0;
					}
					game.log("#g【烽起】", "删去了", former, "的序号");
				}
				decl.count = 1;
			}
			decl.player = chooser;
		}
		player.updateMarks("zhuoming_fengqi");
		// 拒绝发动不转换状态；仅发动后推进序号，由发动导致的回绕触发周始
		if (!result.bool || !slots.length) return;
		const cur = player.storage.zhuoming_fengqi || 0;
		if (cur >= slots.length) {
			player.storage.zhuoming_fengqi = 0;
			player.updateMarks("zhuoming_fengqi");
			return;
		}
		const wrapped = cur === slots.length - 1;
		player.storage.zhuoming_fengqi = wrapped ? 0 : cur + 1;
		player.updateMarks("zhuoming_fengqi");
		if (!wrapped || !result.bool) return;
		// 周始：周始发动者令一名角色弃置一种类型的所有牌，然后添加一个内容为其的序号
		const initiator = player.storage.zhuoming_fengqi_zhoushi;
		if (!initiator?.isIn()) return;
		if (!game.hasPlayer((current) => current.countCards("he") > 0)) return;
		const choose = await initiator
			.chooseTarget(true, "周始：请选择一名角色，令其弃置一种类型的所有牌", (card, target) => target.countCards("he") > 0)
			.set("ai", (target) => -get.attitude(get.player(), target) * target.countCards("he"))
			.forResult();
		const target = choose.targets[0];
		const cats = [...new Set(target.getCards("he").map((card) => lib.skill.zhuoming_fengqi.getCat(card)))];
		const catMap = {};
		for (const cat of cats) {
			catMap[lib.skill.zhuoming_fengqi.catName(cat)] = cat;
		}
		const controls = Object.keys(catMap);
		let cat = catMap[controls[0]];
		if (controls.length > 1) {
			const ctrl = await initiator
				.chooseControl(controls)
				.set("prompt", `周始：请选择弃置${get.translation(target)}的一种类型`)
				.set("ai", () => {
					let best = controls[0];
					let bestVal = -1;
					for (const name of controls) {
						const val = target.getCards("he", (card) => lib.skill.zhuoming_fengqi.getCat(card) === catMap[name]).reduce((sum, card2) => sum + get.value(card2, target), 0);
						if (val > bestVal) {
							bestVal = val;
							best = name;
						}
					}
					return best;
				})
				.forResult();
			cat = catMap[ctrl.control] ?? cat;
		}
		const cards = target.getCards("he", (card) => lib.skill.zhuoming_fengqi.getCat(card) === cat);
		if (cards.length) {
			await target.discard(cards);
		}
		slots.push({ player: target });
		player.updateMarks("zhuoming_fengqi");
		game.log("#g【烽起】", "添加了序号：", target);
	},
	group: ["zhuoming_fengqi_remove"],
	subSkill: {
		remove: {
			charlotte: true,
			name: "烽起",
			trigger: { global: "dieAfter" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				const slots = player.storage.zhuoming_fengqi_slots;
				return Array.isArray(slots) && slots.some((s) => s.player === event.player);
			},
			content(event, trigger, player) {
				const slots = player.storage.zhuoming_fengqi_slots;
				const dead = trigger.player;
				let pointer = player.storage.zhuoming_fengqi || 0;
				for (let i = slots.length - 1; i >= 0; i--) {
					if (slots[i].player === dead) {
						slots.splice(i, 1);
						if (i < pointer) pointer = Math.max(0, pointer - 1);
					}
				}
				if (pointer >= slots.length) {
					pointer = Math.max(0, slots.length - 1);
				}
				player.storage.zhuoming_fengqi = pointer;
				player.updateMarks("zhuoming_fengqi");
				game.log("#g【烽起】", "删去了", dead, "的序号");
			},
		},
	},
	getCat(card) {
		const type = get.type(card);
		if (type === "equip") return "equip";
		if (type === "basic") return "basic";
		return "trick";
	},
	catName(cat) {
		if (cat === "equip") return "装备牌";
		if (cat === "basic") return "基本牌";
		return "锦囊牌";
	},
},

// === 横驰 ===
zhuoming_hengchi: {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		const used = player.storage.zhuoming_hengchi_used || [];
		if (used.includes(player.countCards("h"))) return false;
		// 若你的手牌数唯一（没有其他角色与你手牌数相同）
		if (!player.countCards("h")) return false;
		return !game.hasPlayer((current) => current !== player && current.countCards("h") === player.countCards("h"));
	},
	onuse(result, player) {
		if (!Array.isArray(player.storage.zhuoming_hengchi_used)) {
			player.storage.zhuoming_hengchi_used = [];
		}
		const n = player.countCards("h");
		if (!player.storage.zhuoming_hengchi_used.includes(n)) {
			player.storage.zhuoming_hengchi_used.push(n);
		}
		player.updateMarks("zhuoming_hengchi");
	},
	mark: true,
	marktext: "驰",
	intro: {
		content(storage, player) {
			const used = (player.storage.zhuoming_hengchi_used || []).slice().sort((a, b) => a - b);
			return `本阶段已使用的手牌数：${used.length ? used.map((n) => get.cnNumber(n)).join("、") : "无"}`;
		},
	},
	async content(event, trigger, player) {
		const cards = player.getCards("h");
		if (!cards.length) return;
		// 你可以重铸所有手牌
		const bool = await player
			.chooseBool("横驰：是否重铸所有手牌？")
			.set("ai", () => {
				const needs = lib.skill.zhuoming_hengchi.getComboNeeds(player);
				if (needs.some((check) => cards.some((card) => check(card, player)))) return true;
				return cards.some((card) => get.value(card) < 5);
			})
			.forResult();
		if (!bool.bool) return;
		await player.recast(cards);
		const recastCards = cards.filter((card) => get.position(card, true) == "d");
		if (!recastCards.length) return;
		// 使用其中一张符合拥有的连招技中当前连招进度的牌
		const needs = lib.skill.zhuoming_hengchi.getComboNeeds(player);
		const matched = needs.length ? recastCards.filter((card) => needs.some((check) => check(card, player))) : [];
		if (matched.length) {
			const choose = await player
				.chooseButton(["横驰：选择使用一张符合连招进度的牌", [matched, "card"]], true)
				.set("ai", (button) => player.getUseValue(button.link))
				.forResult();
			const card = choose.links?.[0];
			if (card && get.position(card, true) == "d") {
				await player.chooseUseTarget(card, true, "nopopup");
			}
			return;
		}
		// 否则你将其中一张牌当作-1马置入一名角色的任意装备栏（可替换原装备）
		const chooseCard = await player
			.chooseButton(["横驰：选择一张重铸的牌当作-1马", [recastCards, "card"]], true)
			.set("ai", (button) => 4 - get.value(button.link))
			.forResult();
		const card = chooseCard.links?.[0];
		if (!card || get.position(card, true) != "d") return;
		const canEquip = (current) => {
			for (let i = 0; i <= 5; i++) {
				if (current.hasEquipableSlot(i)) return true;
			}
			return false;
		};
		if (!game.hasPlayer((current) => canEquip(current))) return;
		const chooseTarget = await player
			.chooseTarget(true, "横驰：请选择一名角色，置入其任意装备栏", (cardx, target) => canEquip(target))
			.set("ai", (target) => {
				if (target === player) {
					return [4, 3, 5, 1, 2, 0].some((i) => player.hasEmptySlot(i)) ? 8 : 2;
				}
				if (get.attitude(player, target) < 0) return Math.min(8, target.countCards("e") * 2);
				return 0;
			})
			.forResult();
		const target = chooseTarget.targets[0];
		const slots = [];
		for (let i = 0; i <= 5; i++) {
			if (target.hasEquipableSlot(i)) slots.push(`equip${i}`);
		}
		const ctrl = await player
			.chooseControl(slots)
			.set("prompt", `横驰：请选择置入${get.translation(target)}的哪个装备栏`)
			.set("ai", () => {
				const empty = [4, 3, 5, 1, 2, 0].find((i) => target.hasEmptySlot(i));
				return empty != null ? `equip${empty}` : slots[0];
			})
			.forResult();
		const slot = ctrl.control;
		// 重铸牌在弃牌堆中无归属，equip不会搬运：先取回手中，让装备流程正常完成“弃牌堆→装备栏”的转移
		await player.gain(card, "gain2");
		const vcard = get.autoViewAs({ name: "chitu" }, [card]);
		vcard.subtypes = [slot];
		game.log(player, "将", card, "当作", "#y-1马", "置入了", target, "的", "#g" + get.translation(slot) + "栏");
		await target.equip(vcard);
	},
	getComboNeeds(player) {
		const needs = [];
		for (const skill of player.getSkills()) {
			const info = lib.skill[skill];
			if (!info?.comboSkill) continue;
			if (typeof info.comboNeed === "function") {
				const check = info.comboNeed(player);
				if (check) needs.push(check);
			}
		}
		return needs;
	},
	group: ["zhuoming_hengchi_clear"],
	subSkill: {
		clear: {
			charlotte: true,
			name: "横驰",
			trigger: { player: "phaseUseBegin" },
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return player.storage.zhuoming_hengchi_used?.length;
			},
			content(event, trigger, player) {
				player.storage.zhuoming_hengchi_used = [];
				player.updateMarks("zhuoming_hengchi");
			},
		},
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
},

// === 朔骋 ===
zhuoming_shuocheng: {
	audio: 2,
	comboSkill: true,
	getLastUsed(player, event) {
		var history = player.getAllHistory("useCard");
		var index;
		if (event) {
			index = history.indexOf(event) - 1;
		} else {
			index = history.length - 1;
		}
		if (index >= 0) {
			return history[index];
		}
		return false;
	},
	isSelfOnly(evt, player) {
		return evt?.targets?.length === 1 && evt.targets[0] === player;
	},
	comboNeed(player) {
		const info = lib.skill.zhuoming_shuocheng;
		if (info.isSelfOnly(info.getLastUsed(player), player)) {
			// 连招进度：已达成“自己为唯一目标的牌”，下一张需要“其他角色为唯一目标的牌”
			return (card) => game.hasPlayer((target) => target !== player && player.canUse(card, target));
		}
		// 连招进度：需要“自己为唯一目标的牌”
		return (card) => player.canUse(card, player);
	},
	getX(player) {
		const count = (current) =>
			current.countCards("e", (card) => {
				if (get.subtype(card) == "equip1") return true;
				const info = get.info(card, false);
				return info?.distance?.attackFrom;
			});
		let num = count(player);
		for (const current of game.players) {
			if (current !== player && current.isIn() && player.inRange(current)) {
				num += count(current);
			}
		}
		return num;
	},
	trigger: { player: "useCard" },
	filter(event, player) {
		const info = lib.skill.zhuoming_shuocheng;
		if (event.targets?.length !== 1 || event.targets[0] === player) return false;
		if (!info.isSelfOnly(info.getLastUsed(player, event), player)) return false;
		return info.getX(player) > 0;
	},
	check(event, player) {
		const target = event.targets[0];
		if (get.attitude(player, target) >= 0) return 0;
		if (get.name(event.card) == "sha") return 2 + lib.skill.zhuoming_shuocheng.getX(player);
		return target.countCards("he") > 0 ? 1 + lib.skill.zhuoming_shuocheng.getX(player) : 0;
	},
	async content(event, trigger, player) {
		const X = lib.skill.zhuoming_shuocheng.getX(player);
		if (get.name(trigger.card) == "sha") {
			const bool = await player
				.chooseBool(`朔骋：是否令${get.translation(trigger.card)}多结算${get.cnNumber(X)}次？`)
				.set("ai", () => get.attitude(player, trigger.targets[0]) < 0)
				.forResult();
			if (bool.bool) {
				trigger.effectCount = (typeof trigger.effectCount == "number" ? trigger.effectCount : get.info(trigger.card, false).effectCount || 1) + X;
				game.log(trigger.card, "额外结算了", get.cnNumber(X), "次");
			}
		} else {
			const target = trigger.targets[0];
			const num = Math.min(X, target.countCards("he"));
			if (!num) return;
			const result = await player
				.choosePlayerCard(target, "he", num, true)
				.set("prompt", `朔骋：请弃置${get.translation(target)}${get.cnNumber(num)}张牌`)
				.set("ai", get.buttonValue)
				.forResult();
			const cards = result.cards || [];
			if (!cards.length) return;
			await player.discard(cards);
			const shas = cards.filter((card) => get.name(card) == "sha");
			if (shas.length) {
				await player.gain(shas, "gain2");
				player.addGaintag(shas, "zhuoming_shuocheng_tag");
			}
		}
	},
	mod: {
		cardUsable(card, player, num) {
			if (card?.hasGaintag?.("zhuoming_shuocheng_tag")) return Infinity;
		},
	},
	ai: {
		order: 1,
	},
},

// === 骄黠 ===
zishu_jiaoxie: {
	audio: 2,
	mark: true,
	marktext: "黠",
	init(player) {
		player.storage.zishu_jiaoxie = 4;
	},
	intro: {
		content(storage, player) {
			const left = player.storage.zishu_jiaoxie || 0;
			return `每轮限四次，剩余${left}次。<br>你可以视为使用或打出一张【杀】（消耗1次），或消耗所有剩余次数以视为使用一张【兵临城下】。`;
		},
	},
	enable: ["chooseToUse", "chooseToRespond"],
	filter(event, player) {
		const rem = player.storage.zishu_jiaoxie || 0;
		if (rem <= 0) return false;
		if (event.type == "wuxie") return false;
		if (event.skill == "zishu_jiaoxie" || event._skill == "zishu_jiaoxie") {
			return true;
		}
		if (event.filterCard({ name: "sha", isCard: true }, player, event)) {
			return true;
		}
		if (event.name == "chooseToUse") {
			const bing = { name: "binglinchengxiax", isCard: true };
			return event.filterCard(bing, player, event) && game.hasPlayer((t) => t != player && player.canUse(bing, t, false));
		}
		return false;
	},
	// hiddenCard 必须位于技能顶层：引擎 hasUsableCard/hasWuxie 预检只读 info.hiddenCard（player.js:2988）
	hiddenCard(player, name) {
		return name == "sha" && (player.storage.zishu_jiaoxie || 0) > 0;
	},
	chooseButton: {
		filter(button, player) {
			const evt = _status.event.getParent();
			const name = button.link[2];
			if (name == "sha") {
				return evt.filterCard({ name: "sha", isCard: true }, player, evt);
			}
			if (name == "binglinchengxiax") {
				return (
					evt.name == "chooseToUse" &&
					evt.filterCard({ name: "binglinchengxiax", isCard: true }, player, evt) &&
					game.hasPlayer((t) => t != player && player.canUse({ name: "binglinchengxiax", isCard: true }, t, false))
				);
			}
			return false;
		},
		dialog(event, player) {
			const evt = _status.event;
			const list = [];
			if (evt.filterCard(get.autoViewAs({ name: "sha", isCard: true }, "unsure"), player, evt)) {
				list.push(["basic", "", "sha", ""]);
			}
			if (
				evt.name == "chooseToUse" &&
				evt.filterCard(get.autoViewAs({ name: "binglinchengxiax", isCard: true }, "unsure"), player, evt) &&
				(player.storage.zishu_jiaoxie || 0) > 0 &&
				game.hasPlayer((t) => t != player && player.canUse(get.autoViewAs({ name: "binglinchengxiax", isCard: true }, "unsure"), t, false))
			) {
				list.push(["trick", "", "binglinchengxiax", ""]);
			}
			return ui.create.dialog("骄黠：视为使用一张牌", [list, "vcard"]);
		},
		check(button) {
			if (button.link[2] == "binglinchengxiax") return 5;
			return 4;
		},
		backup(links, player) {
			const name = links[0][2];
			const all = name == "binglinchengxiax";
			return {
				audio: "zishu_jiaoxie",
				filterCard: () => false,
				selectCard: -1,
				popname: true,
				viewAs: { name, isCard: true },
				log: false,
				async precontent(event, trigger, player) {
					player.logSkill("zishu_jiaoxie");
					if (all) {
						player.storage.zishu_jiaoxie = 0;
					} else {
						player.storage.zishu_jiaoxie = Math.max(0, (player.storage.zishu_jiaoxie || 0) - 1);
					}
					player.updateMarks("zishu_jiaoxie");
				},
			};
		},
		prompt(links) {
			const name = links[0][2];
			return "骄黠：视为使用" + (name == "binglinchengxiax" ? "一张【兵临城下】（消耗所有剩余次数）" : "一张【杀】（消耗1次）");
		},
	},
	ai: {
		order: 4.5,
		respondSha: true,
		skillTagFilter(player, tag, arg) {
			if ((player.storage.zishu_jiaoxie || 0) <= 0) return false;
			if (arg === "respond") return false;
			return tag == "respondSha";
		},
		// hiddenCard 已移至技能顶层（引擎预检只读 info.hiddenCard）
	},
	group: ["zishu_jiaoxie_reset"],
	subSkill: {
		reset: {
			name: "骄黠",
			charlotte: true,
			trigger: { player: "roundStart" },
			forced: true,
			popup: false,
			silent: true,
			content(event, trigger, player) {
				player.storage.zishu_jiaoxie = 4;
				player.updateMarks("zishu_jiaoxie");
			},
		},
	},
},

// === 桀朔 ===
zishu_jieshuo: {
	audio: 2,
	onremove(player) {
		game.players.forEach((current) => {
			if (current != player && current.hasSkill("zishu_jieshuo_mark")) {
				current.removeSkill("zishu_jieshuo_mark");
			}
		});
	},
	group: ["zishu_jieshuo_grant", "zishu_jieshuo_juedou", "zishu_jieshuo_transfer"],
	subSkill: {
		// 游戏开始时，给每名其他角色挂上「朔」mark（4次）
		grant: {
			name: "桀朔",
			audio: "zishu_jieshuo",
			trigger: {
				global: "phaseBefore",
				player: "enterGame",
			},
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				return event.name != "phase" || game.phaseNumber == 0;
			},
			content(event, trigger, player) {
				const list = game.filterPlayer((current) => current != player && !current.hasMark("zishu_jieshuo_mark"));
				for (const current of list) {
					if (!current.hasSkill("zishu_jieshuo_mark")) current.addSkill("zishu_jieshuo_mark");
					current.addMark("zishu_jieshuo_mark", 4, true);
				}
			},
		},
		// 挂在其他角色身上的「朔」mark：角标剩余次数，悬停显示"桀朔还有X次"
		mark: {
			name: "桀朔",
			mark: true,
			marktext: "朔",
			charlotte: true,
			intro: {
				content(storage) {
					return `桀朔还有${storage || 0}次`;
				},
				markcount(storage) {
					return storage || 0;
				},
			},
			onremove: true,
		},
		// 出牌阶段开始时，其他角色可视为对拥有者使用【决斗】（消耗1次）
		juedou: {
			name: "桀朔",
			audio: "zishu_jieshuo",
			trigger: { global: "phaseUseBegin" },
			filter(event, player) {
				const current = event.player;
				if (!current || current === player) return false;
				if (!current.hasMark("zishu_jieshuo_mark")) return false;
				return current.canUse({ name: "juedou", isCard: true }, player, false);
			},
			async cost(event, trigger, player) {
				const current = trigger.player;
				event.result = await current
					.chooseBool("桀朔：是否视为对" + get.translation(player) + "使用一张【决斗】（消耗1次）？")
					.set("ai", () => get.attitude(current, player) < 0)
					.forResult();
			},
			async content(event, trigger, player) {
				const current = trigger.player;
				current.removeMark("zishu_jieshuo_mark", 1, false);
				if (current.hasSkill("zishu_jieshuo_mark") && !current.hasMark("zishu_jieshuo_mark")) {
					current.removeSkill("zishu_jieshuo_mark");
				}
				await current.useCard({ name: "juedou", isCard: true }, player, "zishu_jieshuo");
			},
		},
		// 其他角色成为拥有者【杀】的目标时，可消耗所有剩余次数以转移之（流离式，不弃牌）
		transfer: {
			name: "桀朔",
			audio: "zishu_jieshuo",
			trigger: { global: "useCardToTarget" },
			filter(event, player) {
				if (event.card?.name != "sha" || event.player !== player) return false;
				const target = event.target;
				if (!target || target === player) return false;
				if (!target.hasMark("zishu_jieshuo_mark")) return false;
				return game.hasPlayer(
					(current) =>
						current != target &&
						current != player &&
						lib.filter.targetEnabled(event.card, player, current) &&
						target.inRange(current)
				);
			},
			async cost(event, trigger, player) {
				const target = trigger.target;
				event.result = await target
					.chooseBool("桀朔：是否消耗所有剩余次数以转移此【杀】？")
					.set("ai", () => 1)
					.forResult();
			},
			async content(event, trigger, player) {
				const target = trigger.target;
				target.removeMark("zishu_jieshuo_mark", target.countMark("zishu_jieshuo_mark"), false);
				if (target.hasSkill("zishu_jieshuo_mark") && !target.hasMark("zishu_jieshuo_mark")) {
					target.removeSkill("zishu_jieshuo_mark");
				}
				const evt = trigger.getParent();
				const result = await target
					.chooseTarget(true, "桀朔：转移此【杀】", (card, p, t) => {
						return p.inRange(t) && t !== target && t !== player && lib.filter.targetEnabled(trigger.card, player, t);
					})
					.set("ai", (t) => get.attitude(target, t))
					.forResult();
				const chosen = result?.targets?.[0];
				if (!chosen) return;
				evt.triggeredTargets2.remove(target);
				evt.targets.remove(target);
				evt.targets.push(chosen);
			},
		},
	},
},
// === 远疆 ===
zishu_yuanjiang: {
	audio: 2,
	trigger: {
		global: ["phaseZhunbeiAfter", "phaseJudgeAfter", "phaseDrawAfter", "phaseUseAfter", "phaseDiscardAfter", "phaseJieshuAfter"],
	},
	filter(event, player) {
		return player.isIn() && !!ui.cardPile?.childNodes?.length && player.storage.zishu_yuanjiang_flag === event;
	},
	check(event, player) {
		// 当前回合角色为敌方时不发动：避免亮出的攻击牌白送其结算机会
		return get.attitude(player, event.player) >= 0;
	},
	async content(event, trigger, player) {
		// 亮出牌堆顶的一张牌（米券/心往同款：进处理区+展示）
		const card = get.cards()[0];
		if (!card) return;
		game.cardsGotoOrdering(card);
		player.showCards([card], "远疆：亮出牌堆顶的一张牌");
		const current = trigger.player;
		let used = false;
		// 亮出的牌须能合法对拥有者使用：闪/无懈等无 enable 定义的响应牌、无法指定拥有者的牌（如装备牌）直接跳过询问
		if (current && current.isIn() && lib.filter.cardEnabled(card, current, "forceEnable") && current.canUse(card, player)) {
			const go = await current
				.chooseBool("远疆：是否将亮出的牌对" + get.translation(player) + "使用？")
				.set("ai", () => {
					// 队友：仅当此牌对拥有者有正收益才使用，否则放弃让其获得；敌方：能造成负收益则使用
					const evt = get.event();
					const eff = get.effect(evt.yxowner, evt.yxcard, get.player(), get.player());
					return get.attitude(get.player(), evt.yxowner) > 0 ? eff > 0 : eff < 0;
				})
				.set("yxowner", player)
				.set("yxcard", card)
				.forResult();
			if (go?.bool) {
				await current.useCard(card, player);
				used = true;
			}
		}
		if (!used) {
			await player.gain(card, "gain2");
		}
	},
	group: ["zishu_yuanjiang_record"],
	onremove(player) {
		delete player.storage.zishu_yuanjiang_flag;
	},
	subSkill: {
		record: {
			// 口径：本阶段内失去过手牌即记录（摸回不影响）；flag 记录所属阶段事件，供该阶段结束时比对
			name: "远疆",
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { player: "loseAfter", global: "loseAsyncAfter" },
			filter(event, player) {
				if (event.name == "loseAsync") {
					const evt = event.getl ? event.getl(player) : null;
					return !!(evt && evt.hs && evt.hs.length);
				}
				return !!event.getl?.(player)?.hs?.length;
			},
			content(event, trigger, player) {
				const names = ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];
				for (let cur = trigger.parent; cur; cur = cur.parent) {
					if (names.includes(cur.name)) {
						player.storage.zishu_yuanjiang_flag = cur;
						return;
					}
				}
			},
		},
	},
},

// === 肃齐 ===
zishu_suqi: {
	audio: 2,
	trigger: { player: "damage", source: "damage" },
	filter(event, player) {
		const source = event.source, victim = event.player;
		// 无来源伤害/自伤不发动；任一方没有手牌则拼点不成立（无事发生），不询问
		if (!source || !victim || source == victim || !source.isIn() || !victim.isIn()) return false;
		return source.canCompare(victim);
	},
	check(event, player) {
		// 对另一方怀有敌意时才发动
		const other = event.player == player ? event.source : event.player;
		return get.attitude(player, other) < 0;
	},
	async content(event, trigger, player) {
		const source = trigger.source, victim = trigger.player;
		const go = await source
			.chooseBool("肃齐：是否与" + get.translation(victim) + "拼点？")
			.set("ai", () => get.attitude(get.player(), get.event().sqvictim) < 0)
			.set("sqvictim", victim)
			.forResult();
		if (!go?.bool) {
			// 来源放弃拼点 → 拿来源的一张牌置于牌堆顶或牌堆底
			await lib.skill.zishu_suqi.takeToPile(player, source);
			return;
		}
		const result = await source.chooseToCompare(victim).forResult();
		if (!result.winner) {
			// 平局：双方都没赢，依次拿双方的牌
			await lib.skill.zishu_suqi.takeToPile(player, source);
			if (player.isIn() && victim.isIn()) {
				await lib.skill.zishu_suqi.takeToPile(player, victim);
			}
		} else {
			await lib.skill.zishu_suqi.takeToPile(player, result.winner == source ? victim : source);
		}
	},
	takeToPile: async function (taker, target) {
		if (!taker.isIn() || !target.isIn() || !target.countCards("he")) return;
		const result = await taker
			.choosePlayerCard(target, "he", true)
			.set("prompt", "肃齐：选择" + get.translation(target) + "区域里的一张牌置于牌堆顶或牌堆底")
			.set("ai", (card) => get.value(card))
			.forResult();
		const card = result?.cards?.[0] || result?.links?.[0];
		if (!card) return;
		taker.showCards([card], "肃齐：置于牌堆的牌");
		const pos = await taker
			.chooseControl(["置于牌堆顶", "置于牌堆底"])
			.set("prompt", "肃齐：将此牌置于牌堆顶还是牌堆底？")
			.set("ai", () => "置于牌堆底")
			.forResult();
		// 牌堆两端（$cardsGotoPile game/index.js:1436）：无参=appendChild=底（lastChild），"insert"=插到 firstChild=顶；
		// 摸牌端 get.cards 取 firstChild（get/index.js:3498），get.bottomCards 取 lastChild
		if (pos?.control == "置于牌堆顶") {
			game.cardsGotoPile([card], "insert");
		} else {
			game.cardsGotoPile(card);
		}
		game.log(taker, "将", target, "区域里的一张牌置于了牌堆" + (pos?.control == "置于牌堆顶" ? "顶" : "底"));
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

// === 相携·闪 ===
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
		hiddenCard(player, name) {
			if (name != "shan") {
				return false;
			}
			return player.countCards("he") > 0 && lib.skill.maokuo_xiangxie.isWai(player);
		},
	},
},

// === 相携·桃 ===
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
	ai: {
		order: 4,
		save: true,
		skillTagFilter(player, tag, arg) {
			if (tag != "save") {
				return false;
			}
			return lib.skill.maokuo_xiangxie.hasSameSuit(player, 2) && lib.skill.maokuo_xiangxie.isWai(player);
		},
		hiddenCard(player, name) {
			if (name != "tao") {
				return false;
			}
			return lib.skill.maokuo_xiangxie.hasSameSuit(player, 2) && lib.skill.maokuo_xiangxie.isWai(player);
		},
	},
},

// === 相携·无懈 ===
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
	ai: {
		order: 4,
		hiddenCard(player, name) {
			if (name != "wuxie") {
				return false;
			}
			return lib.skill.maokuo_xiangxie.hasSameSuit(player, 3) && lib.skill.maokuo_xiangxie.isWai(player);
		},
	},
},

// === 相携·授牌 ===
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

// === 烈忤 ===
xiaobai_liewu: {
	audio: 2,
	trigger: {
		player: ["respond", "chooseToUseAfter"],
		global: "_wuxieAfter",
	},
	filter(event, player) {
		if (player.hasSkill("xiaobai_liewu_used")) return false;
		if (event.name == "chooseToUse") {
			// 闪响应杀走 chooseToUse(type respondShan)（standard.js:161），不产生 respond 事件
			if (event.type != "respondShan") return false;
			const respondTo = event.respondTo;
			if (!respondTo?.[0] || !respondTo?.[1]) return false;
			if (respondTo[0] == player) return false;
			return get.color(respondTo[1], false) == "black";
		}
		if (event.name == "respond") {
			// respondTo 可能存在或需要从父事件链取（content.js:5020 的条件可能不满足）
			const respondTo = event.respondTo || event.getParent("chooseToUse")?.respondTo || event.getParent("chooseToRespond")?.respondTo;
			if (!respondTo?.[0] || !respondTo?.[1]) return false;
			if (respondTo[0] == player) return false;
			return get.color(respondTo[1], false) == "black";
		}
		if (event.name == "_wuxie") {
			if (event.wuxieresult != player) return false;
			const card = event._trigger?.card;
			if (!card) return false;
			if (event._info_map?.player == player) return false;
			return get.color(card, false) == "black";
		}
		return false;
	},
	check(event, player) {
		// 有可弃牌且被响应者值得打才发动
		if (!player.countCards("he")) return false;
		return game.hasPlayer(target => get.attitude(player, target) < 0);
	},
	async content(event, trigger, player) {
		let source;
		if (trigger.name == "respond" || trigger.name == "chooseToUse") {
			const respondTo = trigger.respondTo || trigger.getParent("chooseToUse")?.respondTo || trigger.getParent("chooseToRespond")?.respondTo;
			source = respondTo?.[0];
		} else {
			source = trigger._trigger?.player || trigger._info_map?.player;
		}
		if (!source?.isIn()) return;
		player.addTempSkill("xiaobai_liewu_used", "roundStart");
		const result = await player
			.chooseToDiscard(
				`烈忤：弃置任意张类别不同的牌，对${get.translation(source)}造成等量伤害`,
				[1, Infinity],
				"he",
				(card) => {
					const type = get.type2(card);
					for (const cardx of ui.selected.cards) {
						if (get.type2(cardx) == type) return false;
					}
					return true;
				},
			)
			.set("ai", card => {
				if (get.tag(card, "damage")) return 8 - get.value(card);
				return 6 - get.value(card);
			})
			// 对齐官方"弃置任意张X互异"写法（聚攸 junkyuheng）
			.set("complexCard", true)
			.forResult();
		if (!result?.bool || !result.cards?.length) return;
		const X = result.cards.length;
		// 标记挂在伤害事件上：濒死子技能只对本次伤害导致的濒死生效（避免残留到之后无关的濒死）
		const dmg = source.damage(player, X);
		dmg.liewu_info = { sourcePlayer: player, X };
		source.addTempSkill("xiaobai_liewu_dying", "dyingAfter");
		await dmg;
	},
	ai: {
		threaten: 1.5,
		effect: {
			target(card, player, target) {
				if (get.tag(card, "damage") && player.hasSkillTag("jueqing", false, target)) return [1, -1];
				if (get.tag(card, "damage")) return [1, 0.5];
			},
		},
	},
	subSkill: {
		used: {
			charlotte: true,
		},
		dying: {
			trigger: { global: "dying" },
			forceDie: true,
			forced: true,
			popup: false,
			silent: true,
			filter(event, player) {
				// 仅响应带标记的烈忤伤害导致的濒死
				const dmg = event.getParent("damage");
				return !!(dmg && dmg.liewu_info && event.player == dmg.player);
			},
			async content(event, trigger, player) {
				const target = trigger.player;
				const info = event.getParent("damage").liewu_info;
				const X = info.X;
				const sourcePlayer = info.sourcePlayer;
				target.removeSkill("xiaobai_liewu_dying");
				const choice = await target
					.chooseBool(
						`烈忤：你可以回复至${get.cnNumber(X)}点体力并令${get.translation(sourcePlayer)}摸${get.cnNumber(X)}张牌`,
					)
					.set("ai", () => {
						const evt = _status.event;
						// 濒死时优先保命；除非对手优势太大
						if (evt.player.hp <= 0) return true;
						const attitude = get.attitude(evt.player, sourcePlayer);
						return attitude > 0 ? false : true;
					})
					.forResult();
				if (choice?.bool) {
					const recoverAmount = Math.max(0, Math.min(X, target.maxHp) - target.hp);
					await target.recover(recoverAmount);
					await sourcePlayer.draw(X);
					game.log(target, "回复了", recoverAmount, "点体力，并令", sourcePlayer, "摸了", X, "张牌");
				}
			},
		},
	},
},
// === 宠眷 ===
xiaobai_chongjuan: {
	audio: 2,
	trigger: { player: ["phaseDrawAfter", "phaseDiscardAfter"] },
	filter(event, player) {
		const maxCount = Math.max(...game.filterPlayer().map(p => p.countCards("h")));
		const maxPlayers = game.filterPlayer(p => p.countCards("h") == maxCount);
		return maxPlayers.length == 1;
	},
	check(event, player) {
		const maxCount = Math.max(...game.filterPlayer().map(p => p.countCards("h")));
		const maxPlayers = game.filterPlayer(p => p.countCards("h") == maxCount);
		if (maxPlayers.length != 1) return false;
		const target = maxPlayers[0];
		// 有队友或自己可受益才发动
		return get.attitude(player, target) > 0;
	},
	async content(event, trigger, player) {
		const maxCount = Math.max(...game.filterPlayer().map(p => p.countCards("h")));
		const maxPlayers = game.filterPlayer(p => p.countCards("h") == maxCount);
		if (maxPlayers.length != 1) return;
		const target = maxPlayers[0];
		await target.draw();
		// 优化：当技能拥有者就是手牌唯一最多的角色时，跳过询问（自己命自己摸牌无意义）
		if (target == player) return;
		// 其可以令你将手牌数摸至比其少一张（至多摸5张）
		const choice = await target
			.chooseBool(
				`宠眷：是否令${get.translation(player)}将手牌数摸至比${get.translation(target)}少一张（至多摸5张）？`,
			)
			.set("source", player)
			.set("ai", () => {
				const evt = _status.event;
				const p = evt.player;
				const s = evt.source;
				if (!s || !s.isIn()) return false;
				const draw = Math.min(p.countCards("h") - 1 - s.countCards("h"), 5);
				if (draw <= 0) return false;
				return get.attitude(p, s) > 0;
			})
			.forResult();
		if (choice?.bool) {
			const drawAmount = Math.min(target.countCards("h") - 1 - player.countCards("h"), 5);
			if (drawAmount > 0) {
				await player.draw(drawAmount);
			}
			if (choice?.bool) {
				const drawAmount = Math.min(target.countCards("h") - 1 - player.countCards("h"), 5);
				if (drawAmount > 0) {
					await player.draw(drawAmount);
				}
			}
		}
	},
},
// === 斛珍 ===
xiaobai_huzhen: {
	audio: 2,
	trigger: { player: "loseAfter" },
	filter(event, player) {
		// 失去过手牌：lose 事件的 hs（loseAsync 内部的失去有自己的 lose 事件，同样走这里，无需 loseAsyncAfter 重复评估）
		return !!event.hs?.length;
	},
	async content(event, trigger, player) {
		const lastWay = player.storage.xiaobai_huzhen_lastWay;
		const currentWay = lib.skill.xiaobai_huzhen.getLoseWay(trigger, player);
		player.storage.xiaobai_huzhen_lastWay = currentWay;
		player.markSkill("xiaobai_huzhen_mark");
		if (currentWay !== lastWay) {
			await player.draw();
			game.log(player, "因", "#g【斛珍】", "不同方式失去手牌，摸了1张牌");
		} else {
			const hiddenCards = player.getCards("h", card => !get.is.shownCard(card));
			if (!hiddenCards.length) return;
			// 明置选牌：标准 chooseCard("h") + filterCard 排除已明置（数组首参会令 get.filter 产出恒假过滤器导致卡死）
			const result = await player
				.chooseCard("h", true)
				.set("prompt", "斛珍：明置一张手牌（上次失去方式：" + get.translation(currentWay) + "）")
				.set("filterCard", card => !get.is.shownCard(card))
				.set("ai", card => get.value(card))
				.forResult();
			if (!result?.bool || !result.cards?.length) return;
			const card = result.cards[0];
			await player.addShownCards(card, "visible_xiaobai_huzhen");
			game.log(player, "因", "#g【斛珍】", "明置了一张手牌");
			if (player.countCards("h") >= 2 && player.getCards("h").every(c => get.is.shownCard(c))) {
				const chooseResult = await player
				.chooseTarget("斛珍：选择一名其他角色交换手牌（你2张换其3张）", (card, player, target) => {
					return target != player && target.countCards("h") >= 3;
				})
				.set("ai", target => -get.attitude(player, target))
					.forResult();
				if (!chooseResult?.bool || !chooseResult.targets?.length) return;
				const target = chooseResult.targets[0];
				const myResult = await player
					.chooseCard("h", 2, true, "斛珍：选择2张手牌用于交换（你将获得对方3张）")
					.set("ai", card => 7 - get.value(card))
					.forResult();
				if (!myResult?.bool || !myResult.cards?.length || myResult.cards.length < 2) return;
				const myCards = myResult.cards;
				const targetResult = await target
					.chooseCard("h", 3, true, "斛珍：选择3张手牌与" + get.translation(player) + "交换")
					.set("ai", card => 5 - get.value(card))
					.forResult();
				if (!targetResult?.bool || !targetResult.cards?.length || targetResult.cards.length < 3) return;
				const targetCards = targetResult.cards;
				await player.swapHandcards(target, myCards, targetCards);
				game.log(player, "因", "#g【斛珍】", "与", target, "交换了手牌");
			}
		}
	},
	getLoseWay(event, player) {
		const parent = event.getParent();
		const name = parent?.name;
		// loseAsync 只是包装层：向上递归取真实原因（交换→交换手牌、技能→其事件名）
		if (name === "loseAsync" && parent !== event) return lib.skill.xiaobai_huzhen.getLoseWay(parent, player);
		if (name === "useCard") return "use";
		if (name === "respond") return "respond";
		if (name === "phaseDiscard" || name === "discard") return "discard";
		if (name === "compare" || name === "compareMultiple") return "compare";
		if (name === "recast") return "recast";
		if (name === "swapHandcards") return "swap";
		if (name === "addToExpansion") return "expansion";
		if (name === "gain") {
			// 被获得：因 gain 事件失去手牌（被拿走/交给他人），统一归类
			return "obtained";
		}
		return name || "unknown";
	},
	ai: {
		threaten: 1.2,
	},
	subSkill: {
			mark: {
				name: "斛珍",
			mark: true,
			marktext: "珍",
			intro: {
				content(storage, player) {
					const way = player.storage.xiaobai_huzhen_lastWay;
					if (!way) return "尚未失去手牌";
					const map = {
						use: "使用牌",
						respond: "打出响应",
						discard: "弃置",
						compare: "拼点",
						recast: "重铸",
						obtained: "被获得",
						swap: "交换手牌",
						expansion: "移出游戏",
						unknown: "未知",
					};
					return "上次失去方式：" + (map[way] || "未知方式(" + way + ")");
				},
			},
		},
	},
},
// === 流芳 ===
xiaobai_liufang: {
	audio: 2,
	enable: "chooseToUse",
	filter(event, player) {
		if (player.hasSkill("xiaobai_liufang_used")) return false;
		if (!player.countCards("h")) return false;
		return get.inpileVCardList(info => {
			if (info[0] !== "basic") return false;
			return event.filterCard(new lib.element.VCard({ name: info[2], nature: info[3], isCard: true }), player, event);
		}).length > 0;
	},
	// hiddenCard 位于技能顶层:喂 hasWuxie/hasUsableCard 预检;翻转颜色条件由 chooseButton 再筛
	hiddenCard(player, name) {
		if (player.hasSkill("xiaobai_liufang_used")) return false;
		return player.countCards("h") > 0 && get.type({ name, isCard: true }) == "basic";
	},
	chooseButton: {
		dialog(event, player) {
			const list = get.inpileVCardList(info => {
				if (info[0] !== "basic") return false;
				return event.filterCard(new lib.element.VCard({ name: info[2], nature: info[3], isCard: true }), player, event);
			});
			const dialog = ui.create.dialog("流芳", [list, "vcard"], "hidden");
			dialog.direct = true;
			return dialog;
		},
		check(button) {
			const player = get.player();
			const card = new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true });
			return player.getUseValue(card);
		},
		backup(links, player) {
			return {
				audio: "xiaobai_liufang",
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true },
				filterCard: () => false,
				selectCard: 0,
				async precontent(event, trigger, player) {
					// 仅提供可行选项：手牌不足 3 张时不出现"翻转三张"
					const controls = ["翻转一张"];
					if (player.countCards("h") >= 3) controls.push("翻转三张");
					const countResult = await player
						.chooseControl(controls)
						.set("prompt", "流芳：选择翻转手牌数量")
						.set("ai", () => {
							const p = get.player();
							if (controls.includes("翻转三张")) return "翻转三张";
							return "翻转一张";
						})
						.forResult();
					if (!countResult?.control) {
						// 中止用 cancel 而非 bool=false：bool=false 会让 chooseToUse 以取消收场，出牌阶段循环视为结束阶段
						event.result.cancel = true;
						return;
					}
					const flipCount = countResult.control === "翻转三张" ? 3 : 1;
					if (player.countCards("h") < flipCount) {
						event.result.cancel = true;
						return;
					}
					const cardResult = await player
						.chooseCard("h", flipCount, true, "流芳：选择" + get.cnNumber(flipCount) + "张手牌翻转")
						.set("ai", card => 5 - get.value(card))
						.forResult();
					if (!cardResult?.bool || !cardResult.cards?.length) {
						event.result.cancel = true;
						return;
					}
					const flipCards = cardResult.cards;
					for (const card of flipCards) {
						if (get.is.shownCard(card)) {
							// 翻转为暗置：清除该牌全部明置标记（含斛珍等其他来源）
							await player.hideShownCards(card);
						} else {
							await player.addShownCards(card, "visible_xiaobai_liufang");
						}
					}
					const shownCards = player.getCards("h", c => get.is.shownCard(c));
					const colors = new Set(shownCards.map(c => get.color(c, false)));
					if (colors.size === 1) {
						const hiddenCards = player.getCards("h", c => !get.is.shownCard(c));
						if (hiddenCards.length) {
							await player.discard(hiddenCards);
						}
						player.addTempSkill("xiaobai_liufang_used", "phaseAfter");
					} else {
						// 明置牌颜色数不为一种：取消本次使用并回到用牌提示（bool 保持 true + cancel → goto(0) 重开）
						event.result.cancel = true;
					}
				},
			};
		},
		prompt(links) {
			return "流芳：翻转手牌，若明置牌颜色数为一则视为使用" + (links[0][3] ? get.translation(links[0][3]) : "") + "【" + get.translation(links[0][2]) + "】";
		},
	},
	ai: {
		order: 5,
		result: { player: 1 },
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag, arg) {
			if (player.hasSkill("xiaobai_liufang_used")) return false;
			if (!player.countCards("h")) return false;
			if (tag === "respondSha") return true;
			if (tag === "respondShan") return true;
			if (tag === "save") return true;
			return false;
		},
	},
	subSkill: {
		used: {
			charlotte: true,
		},
	},
},

// === 辩眉 ===
xiaobai_bianmei: {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filterTarget(card, player, target) {
		// 手牌恰好比你多一张，且双方可拼点
		return target != player && target.countCards("h") == player.countCards("h") + 1 && player.canCompare(target);
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		const cmp = player.chooseToCompare(target);
		const result = await cmp.forResult();
		const winner = result.winner;
		// 平局：无人拼点成功，无后续
		if (!winner) return;
		const loser = winner == player ? target : player;
		const loserCard = winner == player ? cmp.card2 : cmp.card1;
		const choice = await winner
			.chooseControl("摸一张牌", "摸两张牌并令对方收回拼点牌")
			.set("prompt", "辩眉：请选择一项")
			.set("ai", () => {
				// 对方拼点牌对其价值高（弃掉更亏）选拆掉，否则多拿一张
				const evt = get.event();
				return evt.bmloserCard && get.value(evt.bmloserCard, evt.bmloser) > 1 ? "摸一张牌" : "摸两张牌并令对方收回拼点牌";
			})
			.set("bmloser", loser)
			.set("bmloserCard", loserCard)
			.forResult();
		if (!choice?.control) return;
		if (choice.control == "摸一张牌") {
			await winner.draw();
		} else {
			await winner.draw(2);
			if (loserCard) {
				await loser.gain(loserCard, "gain2");
				game.log(loser, "收回了拼点牌");
			}
		}
		if (winner == player) {
			// 你赢：重置限次，可以再发动（引擎 resetSkills 同款重置）
			delete player.getStat("skill").xiaobai_bianmei;
			delete player.getStat("triggerSkill").xiaobai_bianmei;
		}
	},
	ai: {
		order: 6,
		result: {
			target(player, target) {
				return -get.attitude(player, target) - 1;
			},
		},
	},
},

// === 营盈 ===
xiaobai_yingying: {
	audio: 2,
	enable: ["chooseToUse", "chooseToRespond"],
	group: ["xiaobai_yingying_lock"],
	filter(event, player) {
		// 手牌数等于手牌上限：无事可调整，不出现按钮
		if (player.countCards("h") == player.getHandcardLimit()) return false;
		const info = player.storage.xiaobai_yingying || { draw: 0, discard: 0 };
		// 累计摸牌数大于弃牌数时锁定：只能通过弃牌发动（当前手牌数须超过手牌上限）
		if (info.draw > info.discard && player.countCards("h") <= player.getHandcardLimit()) return false;
		return get.inpileVCardList(info2 => {
			if (info2[2] != "sha" && info2[2] != "shan") return false;
			return event.filterCard(new lib.element.VCard({ name: info2[2], nature: info2[3], isCard: true }), player, event);
		}).length > 0;
	},
	hiddenCard(player, name) {
		if (name != "sha" && name != "shan") return false;
		if (player.countCards("h") == player.getHandcardLimit()) return false;
		const info = player.storage.xiaobai_yingying || { draw: 0, discard: 0 };
		return !(info.draw > info.discard && player.countCards("h") <= player.getHandcardLimit());
	},
	chooseButton: {
		dialog(event, player) {
			const list = get.inpileVCardList(info => {
				if (info[2] != "sha" && info[2] != "shan") return false;
				return event.filterCard(new lib.element.VCard({ name: info[2], nature: info[3], isCard: true }), player, event);
			});
			return ui.create.dialog("营盈：将手牌数调整为手牌上限，视为使用或打出", [list, "vcard"]);
		},
		check(button) {
			const player = get.player();
			const card = new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true });
			return player.getUseValue(card);
		},
		backup(links, player) {
			return {
				audio: "xiaobai_yingying",
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true },
				filterCard: () => false,
				selectCard: 0,
				log: false,
				async precontent(event, trigger, player) {
					player.logSkill("xiaobai_yingying");
					// 将手牌数调整为手牌上限，并累计因营盈产生的摸牌/弃牌数
					const info = (player.storage.xiaobai_yingying ??= { draw: 0, discard: 0 });
					const limit = player.getHandcardLimit();
					const count = player.countCards("h");
					if (count < limit) {
						info.draw += limit - count;
						await player.draw(limit - count);
					} else if (count > limit) {
						const num = count - limit;
						await player.chooseToDiscard(num, "h", true).set("prompt", "营盈：弃置" + get.cnNumber(num) + "张手牌（将手牌数调整为手牌上限）").forResult();
						info.discard += num;
					}
					// 锁定标记：累计摸牌数大于弃牌数时显示
					if (info.draw > info.discard) {
						player.markSkill("xiaobai_yingying_lock");
					} else {
						player.unmarkSkill("xiaobai_yingying_lock");
					}
					player.updateMarks("xiaobai_yingying");
				},
			};
		},
		prompt(links) {
			return "营盈：将手牌数调整为手牌上限，视为使用或打出" + (links[0][3] ? get.translation(links[0][3]) : "") + "【" + get.translation(links[0][2]) + "】";
		},
	},
	ai: {
		order: 4,
		result: { player: 1 },
		respondSha: true,
		respondShan: true,
		skillTagFilter(player, tag, arg) {
			if (tag != "respondSha" && tag != "respondShan") return false;
			if (player.countCards("h") == player.getHandcardLimit()) return false;
			const info = player.storage.xiaobai_yingying || { draw: 0, discard: 0 };
			return !(info.draw > info.discard && player.countCards("h") <= player.getHandcardLimit());
		},
	},
	mark: true,
	marktext: "盈",
	intro: {
		markcount(storage, player) {
			const info = player.storage.xiaobai_yingying || { draw: 0, discard: 0 };
			return Math.max(0, info.draw - info.discard);
		},
		content(storage, player) {
			const info = player.storage.xiaobai_yingying || { draw: 0, discard: 0 };
			let str = "因〖营盈〗累计摸牌" + get.cnNumber(info.draw) + "张，累计弃牌" + get.cnNumber(info.discard) + "张";
			if (info.draw > info.discard) {
				str += "<br>当前仅可通过弃牌发动〖营盈〗";
			}
			return str;
		},
	},
	init(player) {
		player.storage.xiaobai_yingying ??= { draw: 0, discard: 0 };
	},
	onremove(player) {
		delete player.storage.xiaobai_yingying;
		player.unmarkSkill("xiaobai_yingying_lock");
	},
	subSkill: {
		used: {
			charlotte: true,
		},
		lock: {
			// 锁定提示标记：累计摸牌数大于弃牌数时由 precontent 动态挂/摘
			name: "营盈",
			mark: true,
			marktext: "锁",
			intro: {
				content(storage, player) {
					const info = player.storage.xiaobai_yingying || { draw: 0, discard: 0 };
					return "累计摸牌" + get.cnNumber(info.draw) + "张大于累计弃牌" + get.cnNumber(info.discard) + "张：当前仅可通过弃牌发动〖营盈〗（发动时须弃置手牌至手牌上限）";
				},
			},
		},
	},
},
}
