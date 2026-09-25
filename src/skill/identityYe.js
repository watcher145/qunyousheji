import { lib, game, get, _status } from "noname";

/**
 * 身份模式扩展身份：野心家（ye）
 *
 * - 身份**不进默认分配池**：默认开局不会出现野心家，也不会出现在开局身份选择里；
 *   只能由技能效果调用 {@link qunyouYeGain}（或自行修改 player.identity 后等同步兜底）授予。
 * - 胜利条件与内奸相同：场上只剩自己（和"平民"）存活时获胜。
 * - 击杀任何角色统一摸三张牌（替代原生身份奖惩：杀反贼摸3/杀平民摸2 等）。
 * - 拥有野心家身份期间视为拥有〖跋扈〗〖飞扬〗——照斗地主地主的方式（addSkill 常驻挂载）。
 * - 美术全部复用本体：translate.ye="野" / ye2="野心家"、身份角标 ye 配色、死亡标记均由引擎原生支持
 *   （mode/identity.js $dieAfter 对"野心家"字样已有 40px 字号适配）；身份牌图无 identity_ye.jpg 时
 *   ui.create.identityCard 自动回退显示"野"字牌。
 * - 只作用于普通身份局（_status.mode == "normal"），不碰忠胆英杰/3v3v2/谋攻。
 * - 单机扩展（extension connect: false），不做联机同步。
 */

/** 野心家持有〖跋扈〗〖飞扬〗的技能对 */
const YE_SKILLS = ["qunyou_yefeiyang", "qunyou_yebahu"];

/**
 * 同步全场"野心家身份 ↔ 跋扈/飞扬"：
 * - 身份是 ye 而没挂技能的（含技能效果只改了 identity 的场景）→ 补挂；
 * - 身份不是 ye 却还挂着技能的 → 卸下。
 * 幂等，可在任意时机反复调用。
 */
export function qunyouYeSyncSkills() {
	for (const current of game.players) {
		if (current.identity == "ye") {
			if (!current.hasSkill("qunyou_yebahu")) {
				current.addSkill(YE_SKILLS.slice());
			}
		} else if (current.hasSkill("qunyou_yebahu")) {
			current.removeSkill("qunyou_yebahu");
			current.removeSkill("qunyou_yefeiyang");
		}
	}
}

/**
 * 技能效果授予野心家身份的统一入口。
 * 只改 identity 字段 + 刷新显示 + 同步技能；胜负/奖惩由 patch 后的 checkResult/dieAfter2 自动跟随。
 * @param {Player} player - 获得野心家身份的角色
 */
export function qunyouYeGain(player) {
	if (!player || !player.isIn() || player.identity == "ye") {
		return;
	}
	player.identity = "ye";
	player.identityShown = false;
	if (player == game.me || (game.me && player == game.me._trueMe)) {
		// 本机玩家：立即看到自己的新身份
		player.setIdentity();
		player.node.identity.classList.remove("guessing");
	} else if (player.identityShown) {
		// 原本身份已公开（如主公）：更新公开展示
		player.setIdentity();
	} else {
		// 身份未公开：维持"？"角标，死亡亮身份时自动显示"野心家"
		player.setIdentity("cai");
		player.node.identity.classList.add("guessing");
	}
	qunyouYeSyncSkills();
	game.log(player, "成为了野心家");
}

export const skills = {
	// 〖跋扈〗——复刻斗地主地主版（mode/doudizhu.js bahu），生效条件改为"野心家身份"
	qunyou_yebahu: {
		charlotte: true,
		trigger: { player: "phaseZhunbeiBegin" },
		filter(event, player) {
			return player.identity == "ye";
		},
		forced: true,
		async content(event, trigger, player) {
			await player.draw();
		},
		mod: {
			cardUsable(card, player, num) {
				if (player.identity == "ye" && card.name == "sha") {
					return num + 1;
				}
			},
		},
	},
	// 〖飞扬〗——复刻斗地主地主版 OL 飞扬（mode/doudizhu.js feiyang），生效条件改为"野心家身份"
	qunyou_yefeiyang: {
		charlotte: true,
		trigger: { player: "phaseJudgeBegin" },
		filter(event, player) {
			return player.identity == "ye" && player.countCards("j") && player.countCards("he") > 1;
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseToDiscard("he", 2, get.prompt(event.skill), "弃置两张牌，然后弃置判定区里的所有牌")
				.set("logSkill", event.skill)
				.set("ai", function (card) {
					if (_status.event.goon) {
						return 9 - get.value(card);
					}
					return 0;
				})
				.set(
					"goon",
					(() => {
						if (player.hasSkillTag("rejudge") && player.countCards("j") < 2) {
							return false;
						}
						if (player.hasSkill("dckanyu", null, false, false) && !player.hasCards("j", (card) => card.name == "lebu")) {
							return false;
						}
						return player.hasCard(function (card) {
							if (get.tag(card, "damage") && get.damageEffect(player, player, _status.event.player, get.natureList(card)) >= 0) {
								return false;
							}
							return get.effect(player, { name: card.viewAs || card.name, cards: [card] }, player, player) < 0;
						}, "j");
					})()
				)
				.forResult();
		},
		popup: false,
		async content(event, trigger, player) {
			await player.discardPlayerCard(player, "j", true, player.countCards("j"));
		},
	},
	// 身份↔技能同步兜底：任意技能效果只要改了 identity，下个检查点自动补挂/卸〖跋扈〗〖飞扬〗
	qunyou_ye_init: {
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { global: ["gameStart", "roundStart"] },
		filter(event, player) {
			return lib.config.mode == "identity" && _status.mode == "normal";
		},
		// async：走 AsyncCompiler 保住模块级闭包（同步 content 引用模块函数会 ReferenceError，知识库 #70）
		async content(event, trigger, player) {
			qunyouYeSyncSkills();
		},
	},
};

/**
 * 原生普通身份局的胜负结算（复制自 mode/identity.js checkResult 的 normal 分支，
 * 适配野心家的三处改动）：
 * ① "游戏继续"条件把野心家计入守方——否则"只剩主公+野心家"时主公会被原生逻辑直接判胜；
 * ② 新增 ye 结算分支——条件与内奸完全相同，否则最后只剩野心家存活时游戏永不结束；
 * ③ 主公变节局（game.zhu 已变为野心家身份）＝全员混战：任何身份的胜利条件统一为
 *    "除同身份外的所有角色死亡"（平民互为同身份，沿用原生口径不阻止获胜），
 *    且只要场上不止一人存活就继续——否则原主公变成野心家后唯一存活时游戏永不结束。
 * 返回 true 表示已按扩展逻辑结算（调用方跳过原函数）；false 表示场景不适用（透传原函数）。
 * @param {Player} me - 本机视角玩家
 */
function qunyouCheckResultNormal(me) {
	if (!game.zhu) {
		return false;
	}
	const zhuBetrayed = game.zhu.identity == "ye";
	if (zhuBetrayed) {
		// 变节局：混战没有阵营胜利，场上不止一人存活就继续
		if (game.players.length > 1) {
			return true;
		}
	} else if (game.zhu.isAlive() && get.population("fan") + get.population("nei") + get.population("ye") > 0) {
		return true;
	}
	if (game.zhong) {
		game.zhong.identity = "zhong";
	}
	game.showIdentity();
	if (zhuBetrayed) {
		const win = me.isAlive() && game.players.every((p) => p == me || p.identity == "commoner");
		game.over(win);
		return true;
	}
	if (me.identity == "zhu" || me.identity == "zhong" || me.identity == "mingzhong") {
		if (game.zhu.classList.contains("dead")) {
			game.over(false);
		} else {
			game.over(true);
		}
	} else if (me.identity == "nei") {
		if (game.players.length == 1 + game.players.filter((i) => i.identity == "commoner").length && me.isAlive()) {
			game.over(true);
		} else {
			game.over(false);
		}
	} else if (me.identity == "ye") {
		if (game.players.length == 1 + game.players.filter((i) => i.identity == "commoner").length && me.isAlive()) {
			game.over(true);
		} else {
			game.over(false);
		}
	} else if (me.identity == "fan") {
		if ((get.population("fan") + get.population("zhong") > 0 || get.population("nei") > 1) && game.zhu.classList.contains("dead")) {
			game.over(true);
		} else {
			game.over(false);
		}
	} else if (me.identity == "commoner") {
		game.over(true);
	}
	return true;
}

// 模块级缓存原函数：游戏重开时 loadMode 会重新 defineProperty 覆盖掉包装，
// arenaReady 重新执行时基于缓存的原函数重新包装，不会层层套娃
let _origCheckResult = null;
let _origDieAfter2 = null;

/**
 * 身份模式 patch（extension.js 的 arenaReady 钩子调用，此时模式文件已加载）：
 * 1. 包装 game.checkResult —— normal 局走 {@link qunyouCheckResultNormal}，其余子模式透传；
 * 2. 包装 lib.element.Player.prototype.dieAfter2 —— 击杀者是野心家时统一摸三张牌
 *    （跳过原生奖惩分支，即"替代"而非"叠加"），其余透传。
 * 非 identity 模式直接跳过。
 */
export function setupIdentityYe() {
	if (lib.config.mode != "identity") {
		return;
	}
	if (typeof game.checkResult == "function" && _origCheckResult === null) {
		_origCheckResult = game.checkResult;
		game.checkResult = function () {
			const me = game.me._trueMe || game.me;
			if (_status.brawl && _status.brawl.checkResult) {
				_status.brawl.checkResult();
				return;
			}
			if (_status.mode == "normal" && qunyouCheckResultNormal(me)) {
				return;
			}
			return _origCheckResult.call(this);
		};
	}
	const playerProto = lib.element.Player.prototype;
	if (typeof playerProto.dieAfter2 == "function" && _origDieAfter2 === null) {
		_origDieAfter2 = playerProto.dieAfter2;
		playerProto.dieAfter2 = function (source) {
			if (source && source.identity == "ye" && _status.mode == "normal") {
				source.draw(3);
				return;
			}
			return _origDieAfter2.call(this, source);
		};
	}
}
