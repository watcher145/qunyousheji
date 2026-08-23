/**
 * 扩展卡牌定义（锦囊/装备等）
 * 插画：extension/群友设计/image/card/{卡牌键名}.jpg（由 patchCardPackImages 写入）
 */
export const cardData = {
	zishu_yiyi: {
		fullskin: true,
		audio: true,
		type: "trick",
		enable: true,
		filterTarget(card, player, target) {
			return target === player;
		},
		selectTarget: -1,
		async content(event, trigger, player) {
			const target = event.targets?.[0] || player;
			await target.draw(2);
			const result = await target.chooseToDiscard(2, "he", true).forResult();
			const discards = (result?.cards || []).filter((c) => get.position(c, true) == "d");
			if (!player.hasSkill("zishu_jifan")) return;
			// 使用一张因此弃置的牌
			const usable = discards.filter((c) => player.hasUseTarget(c, true, false));
			if (usable.length) {
				const res = await player
					.chooseCardButton("击藩：选择一张因此弃置的牌并使用", usable, true)
					.set("filterButton", (b) => get.player().hasUseTarget(b.link, true, false))
					.set("ai", (button) => get.player().getUseValue(button.link, true, false))
					.forResult();
				if (res?.bool && res.links?.length) {
					const card = res.links[0];
					player.logSkill("zishu_jifan");
					await player.chooseUseTarget(card, true, false).forResult();
				}
			}
			// 若均不为即时牌，获得强袭
			const notAllImmediate = discards.length && discards.every((c) => {
				const type = get.type(c);
				return type != "basic" && type != "trick";
			});
			if (notAllImmediate) {
				player.addTempSkill("qiangxix", { player: "phaseAfter" });
				player.popup("获得【强袭】");
			}
		},
		ai: {
			order: 7,
			value: 5,
			useful: 3,
			tag: {
				draw: 2,
				loseCard: 2,
				discard: 2,
			},
		},
	},
	zishu_dujiu: {
		fullskin: true,
		audio: true,
		type: "basic",
		toself: true,
		enable(event, player) {
			return true;
		},
		lianheng: true,
		logv: false,
		savable(card, player, dying) {
			return dying === player || player.hasSkillTag("jiuOther", null, dying, true);
		},
		usable: 1,
		selectTarget: -1,
		modTarget: true,
		filterTarget(card, player, target) {
			return target === player;
		},
		global: ["zishu_dujiu_poison"],
		async content(event, trigger, player) {
			const target = event.target;
			const targets = event.targets;
			const cards = event.cards;
			let card = event.card;
			if (typeof event.baseDamage !== "number") {
				event.baseDamage = 1;
			}
			if (target.isDying() || event.getParent(2).type === "dying") {
				await target.recover();
				if (_status.currentPhase === target && typeof target.getStat().card.jiu === "number") {
					target.getStat().card.jiu--;
				}
			} else {
				game.addVideo("jiuNode", target, true);
				if (cards && cards.length) {
					card = cards[0];
				}
				if (!target.storage.jiu) {
					target.storage.jiu = 0;
				}
				target.storage.jiu += event.baseDamage;
				game.broadcastAll(
					(target2, card2, gain2) => {
						target2.addSkill("jiu");
						if (!target2.node.jiu && lib.config.jiu_effect) {
							target2.node.jiu = ui.create.div(".playerjiu", target2.node.avatar);
							target2.node.jiu2 = ui.create.div(".playerjiu", target2.node.avatar2);
						}
						if (gain2 && card2.clone && (card2.clone.parentNode === target2.parentNode || card2.clone.parentNode === ui.arena)) {
							card2.clone.moveDelete(target2);
						}
					},
					target,
					card,
					target === targets[0] && cards.length === 1
				);
				if (target === targets[0] && cards.length === 1) {
					if (card.clone && (card.clone.parentNode === target.parentNode || card.clone.parentNode === ui.arena)) {
						game.addVideo("gain2", target, get.cardsInfo([card]));
					}
				}
			}
		},
		ai: {
			order: 6,
			value: 3,
			useful: 4,
			result: {
				player(player, target) {
					if (player.hasSkillTag("usedu")) {
						return 4;
					}
					return -1;
				},
			},
			tag: {
				recover: 1,
			},
		},
		subSkill: {
			poison: {
				cardSkill: true,
				trigger: {
					player: ["loseAfter", "compare"],
					global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
					target: "compare",
				},
				filter(event, player, name) {
					if (name === "compare") {
						if (player === event.player) {
							if (event.iwhile > 0) return false;
							return event.card1.name === "zishu_dujiu";
						}
						return event.card2.name === "zishu_dujiu";
					}
					if (event.name !== "equip" && !event.visible) {
						return false;
					}
					const evt = event.getl(player);
					if (!evt || !evt.hs || !evt.hs.filter((i) => get.name(i, player) === "zishu_dujiu").length) {
						return false;
					}
					return true;
				},
				forced: true,
				popup: false,
				async content(event, trigger, player) {
					if (trigger.delay === false) {
						await game.delayx();
					}
					game.log(player, "触发了", "#g【毒酒】", "的效果");
					let num = 1;
					if (typeof trigger.getl === "function") {
						num = trigger.getl(player).hs.filter((i) => get.name(i, player) === "zishu_dujiu").length;
					}
					const next = player.loseHp(num);
					next.type = "du";
					await next;
				},
			},
		},
	},
};