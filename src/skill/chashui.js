/**
 * 茶水贤设 · 技能定义（前缀 `chashui_`）
 *
 * 与「小白杯」同构：技能本体仍合并进主包的 `lib.skill`（`src/skill/index.js`），
 * 大包只负责「哪些武将、怎么分组、怎么显示」。所以：
 *   - 技能写在本文件
 *   - 技能译名写 `src/translate/chashui.js`（`src/translate/skill.js` 汇总）
 *   - 武将挂技能写 `src/character/data.js` 的 `skills` 数组
 *
 * 原型来源：`G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_a\skills\*.lua`
 * （Lua 是权威；中文技能表与 Lua 冲突时以 Lua 为准，差异写在各技能注释里）
 *
 * ⚠️ 本文件必须显式 import `game/get/lib/_status`：content 里的这些名字在引擎里由
 * StepCompiler 的 topVars 注入，但在本文件作用域里不 import 就是 ReferenceError
 * （skill-test 的「content 执行」项会直接抓出来，知识库 #70 同源）。
 */
import { game, get, lib, ui, _status } from "noname";
import { getTurnDiscardCards } from "./helpers.js";
import { defineSkill } from "../../../../技能工作流/mold/define.js";

/**
 * 继勇（典满）
 *
 * 描述：当你使用一张描述含「【杀】」的非【杀】牌结算后，你可以视为使用一张无距离次数限制的【杀】。
 *
 * 入口：`useCardAfter`（= Lua `fk.CardUseFinished`）。
 * 「描述含杀」：Lua 用 `Fk:translate(":"..name)` 查卡牌描述文本（jiyong.lua:19-22）。
 *   无名杀对应 `lib.translate[card.name + "_info"]`（判定口径已与用户确认）。
 *   ⚠️ 必须排除牌名本身是【杀】的（含火杀/雷杀等变体）：用 `get.name(card)` 而非 `card.name`。
 * 效果：`useCard` 直调（`event.cards = []` 纯虚拟牌）+ `addCount:false`；
 *   距离/次数在选目标时就要放开（`chooseTarget` 的 filter 用 `canUse(card, target, false)`）。
 *   依据：docs/印牌类技能标准.md §5「content 直调 useCard 要三处一起放开」。
 */
const chashui_jiyong = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		const card = event.card;
		if (!card) return false;
		// 牌名本身是【杀】（含火杀/雷杀/冰杀等变体）不算
		if (get.name(card) == "sha") return false;
		// 描述含「杀」：查卡牌描述文本
		const info = lib.translate[`${card.name}_info`] || lib.translate[`${get.name(card)}_info`] || "";
		if (!info.includes("杀")) return false;
		// 得真的能对一个目标用出【杀】
		const vcard = { name: "sha", isCard: true };
		return game.hasPlayer((current) => current != player && player.canUse(vcard, current, false));
	},
	check(event, player) {
		// 有收益目标才发动（打友方没意义）
		const vcard = { name: "sha", isCard: true };
		return game.hasPlayer((current) => current != player && player.canUse(vcard, current, false) && get.effect(current, vcard, player, player) > 0);
	},
	async content(event, trigger, player) {
		const vcard = { name: "sha", isCard: true };
		const result = await player
			.chooseTarget(get.prompt("chashui_jiyong"), "视为使用一张无距离次数限制的【杀】", (card, player2, target) => {
				return target != player2 && player2.canUse(vcard, target, false);
			})
			.set("ai", (target) => get.effect(target, vcard, player, player))
			.forResult();
		if (!result?.bool || !result.targets?.length) return;
		player.logSkill("chashui_jiyong", result.targets);
		await player.useCard(vcard, [], result.targets).set("addCount", false);
	},
	ai: {
		threaten: 1.3,
	},
};

/**
 * 承烈（典满）
 *
 * 描述：每回合限一次，当你造成或受到伤害后，你可以移动你场上的一张牌，若如此做，你令获得牌的角色回复1点体力。
 *
 * 入口：`{ player: "damageEnd", source: "damageEnd" }` 双槽（原生 `bushi` sp.js:38845）。
 *   自伤（player === source）引擎只触发一次（gameEvent.js:491-494 去重），无需额外处理。
 * 数据：Lua 用独立 active 技能 `#tea__chenglie_active` 承载选牌流程：
 *   ① **只能移「你场上」的牌** —— `sourceTargets` 必须限定为 `[player]`
 *      （chenglie_active.lua:16 `getCardArea(to_select) == Player.Equip or Judge`，
 *       且 `expand_pile` 只给 `player:getCardIds(Player.Judge)`；`canMoveCardInBoardTo` 以自己为源）
 *   ② **接收方必须是其他角色** —— `to_select ~= Self.id`（chenglie_active.lua:19-20）
 * 取接收方：`moveCard` 的 `event.targets = [失去牌者, 获得牌者]`（content.js:8863/8896/8952）。
 * 限次：`countSkill` 数本回合发动次数（原生 relianying 同款思路）。
 * 取消入口：「可以」的取消由**发动询问**提供（无 cost 的触发技由引擎自动弹「是否发动」），
 *   所以进入 content 后的 `moveCard(true)` 传 forced 是对的（玩家已决定发动，就该完成移动）。
 */
const chashui_chenglie = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "damageEnd", source: "damageEnd" },
	filter(event, player) {
		if (event.num <= 0) return false;
		if (player.countSkill("chashui_chenglie") >= 1) return false;
		// 自己场上得有能移给别人的牌（装备区/判定区）；源只限自己
		return player.canMoveCard(
			false,
			false,
			[player],
			game.filterPlayer((current) => current != player)
		);
	},
	async content(event, trigger, player) {
		const next = player.moveCard(true);
		next.set("prompt", get.prompt2("chashui_chenglie"));
		// ① 只能移自己场上的牌（装备区/判定区）
		next.set("sourceTargets", [player]);
		// ② 只能移给其他角色
		next.set(
			"aimTargets",
			game.filterPlayer((current) => current != player)
		);
		const result = await next.forResult();
		if (!result?.bool || !result.targets?.length) return;
		player.logSkill("chashui_chenglie", result.targets[1]);
		// targets = [失去牌者, 获得牌者]；回血给获得牌的角色
		const gainer = result.targets[1];
		// 原型 chenglie_active.lua:32-39 有 `target:isWounded()` 守卫：满血角色不回复，
		// 否则会白发一条「回复体力」日志并让「回复过体力」类监听误判
		if (gainer?.isIn() && gainer.isWounded()) await gainer.recover();
	},
	ai: {
		expose: 0.2,
	},
};

/**
 * 巧筑（马钧）
 *
 * 描述：一名角色出牌阶段限一次，其可以交给你一张牌并展示，你可以重铸任意张非此类型的牌，
 *       然后你可以交给其任意张此类型的牌。
 *
 * 结构（Lua 分两个技能，本实现照搬）：
 *   主技能 `chashui_qiaozhu`：马钧自己的出牌阶段限一次 —— 选一张牌展示 → 自己重铸非该类型 → 自己给出该类型
 *     （qiaozhu.lua:5-33；`#tea__qiaozhu-invoke` 文案「你可以展示一张牌，然后可以重铸任意张非此类型牌」）
 *   子技能 `chashui_qiaozhu_o`：挂给**其他所有角色**的出牌阶段限一次 —— 交给马钧一张并展示 →
 *     **马钧**重铸任意张非该类型 → **马钧**可选给回该类型（qiaozhu&.lua:16-52）
 *
 * 挂载：`group` 挂不到别人身上（坑-清单.md:34），必须 `init` 里 countPlayer + addSkill，
 *   `onremove` 对称摘除。范例 `mbpanxiang`（mobile.js:13837）、`dawu`（extra.js:2399）。
 *   马钧获得/失去技能时也要同步（Lua 用 EventAcquireSkill/EventLoseSkill/Deathed 三个钩子），
 *   本实现用 `init` + `onremove` 覆盖（无名杀技能生命周期已够）。
 *
 * 「排除回合外巧筑重铸/给出」：精弩用 `tea__qiaozhu-block-phase` 标记（jingnu.lua:10-13）。
 *   本实现把该标记换成「回合内/外」判断 + storage 标记，见精弩。
 */
const chashui_qiaozhu = {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		// ① 选一张牌展示（手牌/装备区都可以 —— 「给你一张牌」的区域是 hes）
		const show = await player
			.chooseCard("hes", get.prompt("chashui_qiaozhu"), "展示一张牌，然后重铸任意张非此类型的牌", 1)
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!show?.bool || !show.cards?.length) return;
		const card = show.cards[0];
		// 先 log 再展示：取消重铸时技能已发动过（旧版展示在前，取消时无技能日志）
		player.logSkill("chashui_qiaozhu");
		player.showCards([card]);
		const type = get.type2(card);
		// ② 重铸任意张非该类型
		const recast = await player
			.chooseCard(
				"he",
				"巧筑：可以重铸任意张非" + get.translation(type) + "的牌",
				[1, Infinity],
				(c) => get.type2(c) != type,
				"allowChooseAll"
			)
			.set("ai", (c) => (get.type2(c) == type ? 0 : 5 - get.value(c)))
			.forResult();
		if (!recast?.bool || !recast.cards?.length) return;
		await player.recast(recast.cards);
		// ③ 可以交给其任意张该类型的牌（马钧自己：交给「其」= 自己 → 无意义，故只给自己时跳过）
		//    Lua 主技能到第 ② 步就结束（qiaozhu.lua:29-31 只有 recastCard），第 ③ 步是 `&` 版专有
	},
	ai: {
		order: 8,
		result: { player: 1 },
	},
	group: ["chashui_qiaozhu_mount"],
	subSkill: {
		// 把「巧筑」的他人侧挂给所有其他角色（group 挂不到别人身上，坑-清单.md:34）
		// 范例 mbpanxiang（mobile.js:13837）、dawu（extra.js:2399）
		// ⚠️ 不能在 init 里挂：开局 `for (i) game.players[i].init(...)` 按座次逐个初始化
		//   （noname/game/index.js:3294-3308），而 player.init 开头就 clearSkills(true)
		//   （noname/library/element/player.js:3400）⇒ 座次排在巧筑拥有者**之后**的角色，
		//   其 init 会把刚挂上的 _o 又清掉（clearSkills 只保 superCharlotte，player.js:11670-11682）。
		//   改为 gameStart / changeSkillsAfter 挂载：此时全员 init 已完成，换将/中途获得也能补挂。
		mount: {
			charlotte: true,
			sub: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: { global: ["gameStart", "changeSkillsAfter"] },
			filter(event, player) {
				return player.hasSkill("chashui_qiaozhu");
			},
			content(event, trigger, player) {
				game.countPlayer((current) => {
					if (current != player) current.addSkill("chashui_qiaozhu_o");
				});
			},
		},
	},
	onremove(player) {
		// 场上还有人持有巧筑时不要拆（巧筑可能被复制/转移给其他角色）
		if (game.hasPlayer((current) => current.hasSkill("chashui_qiaozhu"))) return;
		game.countPlayer((current) => current.removeSkill("chashui_qiaozhu_o"));
	},
};

const chashui_qiaozhu_o = {
	audio: "chashui_qiaozhu",
	enable: "phaseUse",
	usable: 1,
	charlotte: true,
	filter(event, player) {
		const owner = game.findPlayer((current) => current.hasSkill("chashui_qiaozhu") && current.isIn());
		return owner && player.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		const owner = game.findPlayer((current) => current.hasSkill("chashui_qiaozhu") && current.isIn());
		if (!owner) return;
		// ① 交给马钧一张牌并展示（hes：手牌/装备区/木牛）
		const give = await player
			.chooseCard("hes", get.prompt("chashui_qiaozhu"), "交给" + get.translation(owner) + "一张牌并展示", 1)
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!give?.bool || !give.cards?.length) return;
		const card = give.cards[0];
		const type = get.type2(card);
		player.logSkill("chashui_qiaozhu_o", owner);
		player.showCards([card]);
		await player.give([card], owner);
		if (!owner.isIn()) return;
		// 标记：本次重铸/给出属于「回合外巧筑」，精弩不计
		owner.storage.chashui_qiaozhu_block = (owner.storage.chashui_qiaozhu_block || 0) + 1;
		// 计数必须与 +1 严格配对：旧版中途 `return` 会跳过末尾的自减，block 永久偏高，
		// 之后精弩就再也不计数了。用 try/finally 兜住所有提前退出。
		try {
			// ② 马钧重铸任意张非该类型
			const recast = await owner
				.chooseCard(
					"he",
					"巧筑：可以重铸任意张非" + get.translation(type) + "的牌",
					[1, Infinity],
					(c) => get.type2(c) != type,
					"allowChooseAll"
				)
				.set("ai", (c) => (get.type2(c) == type ? 0 : 5 - get.value(c)))
				.forResult();
			if (recast?.bool && recast.cards?.length) await owner.recast(recast.cards);
			// ③ 马钧可以交给其任意张该类型的牌
			// 描述「…然后你可以交给其…」是顺序关系而非条件关系：即使②一张都没重铸，
			// ③ 仍然成立（旧版把③嵌在②成功里，重铸 0 张就再也给不了牌）
			if (!owner.isIn() || !player.isIn()) return;
			const back = await owner
				.chooseCard(
					"he",
					"巧筑：可以交给" + get.translation(player) + "任意张" + get.translation(type) + "的牌",
					[1, Infinity],
					(c) => get.type2(c) == type,
					"allowChooseAll"
				)
				.set("ai", (c) => 4 - get.value(c))
				.forResult();
			if (back?.bool && back.cards?.length) await owner.give(back.cards, player);
		} finally {
			owner.storage.chashui_qiaozhu_block = Math.max((owner.storage.chashui_qiaozhu_block || 1) - 1, 0);
		}
	},
	ai: {
		order: 1,
		result: { player: 1 },
	},
};

/**
 * 精弩（马钧）
 *
 * 描述：当你一次性获得或失去至少X张牌时（你于回合外发动"巧筑"重铸与给出牌除外），
 *       你可以令当前回合角色本回合攻击范围和使用【杀】的次数上限+X（X为当前回合角色攻击范围）。
 *
 * 入口：`{ player: ["gainAfter", "loseAfter"], global: ["loseAsyncAfter", "equipAfter"] }`
 *   —— 无名杀**没有** `afterCardsMove`/`cardsMove` 事件（已核 noname/ 全库无此名），
 *   必须用获得/失去全家桶；原生同款「一次性获得/失去至少 N 张」：`olhongyuan`（sp.js:22935
 *   `{player:"gainAfter", global:"loseAsyncAfter"}` + `event.getg(player).length >= 2`）。
 * 取数：`event.getg(player)`（获得）/ `event.getl(player)`（失去），都返回 `{hs, es, js, ss, cards2}`
 *   —— 见 docs/坑-清单.md「getlx:false 时 getl 返回空 map」条，所以只数有分类字段的。
 * X：**当前回合角色的攻击范围**，在 filter 里快照（改完会变，不能事后算）。
 * 效果：给当前回合角色挂临时技能 `chashui_jingnu_buff`，`mod.attackRange` 与 `mod.cardUsable` 各 +X。
 *   注意滚雪球：标记同时加攻击范围，所以下次 X 更大（Lua 测试断言 3→6→12，jingnu.lua:73-86）。
 * 排除项：回合外发动巧筑产生的重铸/给出不计（Lua 用 `tea__qiaozhu-block-phase` 标记，
 *   jingnu.lua:10-13）。本实现用 `chashui_qiaozhu_block` 计数 + 当前回合判定。
 */
const chashui_jingnu = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: {
		player: ["gainAfter", "loseAfter"],
		global: ["loseAsyncAfter", "equipAfter"],
	},
	filter(event, player) {
		const current = _status.currentPhase;
		if (!current || current.isDead()) return false;
		// 回合外巧筑的重铸/给出不计
		if (player.storage.chashui_qiaozhu_block > 0) return false;
		// 只数手牌区/装备区的获得与失去（Lua 口径：move.toArea==Hand / fromArea in {Hand,Equip}）
		let num = 0;
		if (event.name == "gain" || event.name == "loseAsync" || event.name == "equip") {
			const gain = event.getg?.(player);
			if (gain?.hs?.length) num += gain.hs.length;
			if (event.name == "equip") {
				// equipAfter 的 getg 可能拿不到，改用 moveInfo 兜底
				num += (event.getl?.(player)?.es || []).length;
			}
		}
		if (event.name == "lose" || event.name == "loseAsync") {
			const lose = event.getl?.(player);
			if (lose?.hs?.length) num += lose.hs.length;
			if (lose?.es?.length) num += lose.es.length;
		}
		if (num <= 0) return false;
		// X = 当前回合角色攻击范围；必须在改之前算
		return num >= Math.max(current.getAttackRange(), 1);
	},
	async content(event, trigger, player) {
		const current = _status.currentPhase;
		if (!current || current.isDead()) return;
		const range = current.getAttackRange();
		if (range <= 0) return;
		player.logSkill("chashui_jingnu", current);
		// mark 只挂在**被给 buff 的角色**（当前回合角色）身上，当前回合结束即消失。
		// ⚠️ addTempSkill 开头有 `hasSkill && tempSkills==undefined → return` 的早退（player.js:11589），
		//    若该角色已因故持有此技能，过期会被跳过 → 先移除再挂，保证过期一定生效。
		if (current.hasSkill("chashui_jingnu_buff")) current.removeSkill("chashui_jingnu_buff");
		current.addTempSkill("chashui_jingnu_buff", { player: "phaseAfter" });
		current.addMark("chashui_jingnu_buff", range, false);
	},
	ai: {
		threaten: 1.1,
	},
};

/**
 * 精弩的加成（攻击范围 + 杀次数）
 *
 * 呈现：这一条**同时**改攻击范围和【杀】次数上限，按 R18 挂
 * `markimage: "image/card/attackRange.png"`（攻击范围是主修正，图标用攻击范围那张），
 * 不写 `mark`/`marktext`；数值角标由数字 storage 自动生成（player.js:4714）。
 */
const chashui_jingnu_buff = {
	audio: false,
	charlotte: true,
	forced: true,
	popup: false,
	onremove: true,
	markimage: "image/card/attackRange.png",
	intro: {
		name: "精弩",
		content(storage, player) {
			return `<li>攻击范围+${storage}<br><li>使用【杀】的次数上限+${storage}<br><li>当前攻击范围：${player.getAttackRange(false)}`;
		},
	},
	mod: {
		attackRange(player, num) {
			return num + player.countMark("chashui_jingnu_buff");
		},
		cardUsable(card, player, num) {
			if (get.name(card) == "sha") return num + player.countMark("chashui_jingnu_buff");
		},
	},
};

/**
 * 坚拒（霍峻）
 *
 * 描述：结束阶段，你可以摸你攻击范围内含有的角色数张牌，若如此做，直到你的下个准备阶段，
 *       你可以将所有红色/黑色手牌当【闪】/【无懈可击】使用或打出。
 *       你因使用「坚拒」转化的牌失去最后的手牌后，你可以于当前回合结束阶段视为对当前回合角色使用一张【决斗】。
 *
 * 三段结构（Lua 三块：jianju_trigger / jianju viewas / jianju_record，jianju.lua:5-123）：
 *   ① 结束阶段：摸「攻击范围内含有的其他角色数」张牌，挂 `chashui_jianju_on` 标记
 *      （Lua `tea__jianju_on_effect`，:32-40；注意只数**其他角色**，`room:getOtherPlayers`）
 *   ② 转化：红手牌→【闪】、黑手牌→【无懈】（jianju.lua:99-111，用 `color == Card.Red/Black`）；
 *      **使用和打出都支持**（`:115-120` `enabled_at_play` + `enabled_at_response`）
 *      ⇒ 无名杀：`enable: ["chooseToUse", "chooseToRespond"]` + 红色/黑色两套 filterCard，
 *         牌面不同（闪/无懈）用 `chooseButton` + `backup` 实现
 *      ⇒ 无懈窗必须写 `hiddenCard`（docs/响应与抵消.md:106「只认 hiddenCard(player,"wuxie")」）
 *   ③ 决斗：`PreCardUse` 时若「本次使用的手牌全在转化底牌里」= 失去最后手牌 → 记 `chashui_jianju_loseall`
 *      （jianju.lua:64-79）；结束阶段若该标记在、且当前回合角色可被指定 → 视为对其用【决斗】（`:18-25,44-51`）
 *
 * 标记过期：Lua 用 `EventPhaseStart` + `player.phase == Start` 时清 `on_effect`（`:55-60`）
 *   ⇒ 无名杀：`addTempSkill(..., { player: "phaseZhunbeiBegin" })` 自动过期。
 */
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_jianjuPlan = defineSkill({
	id: "chashui_jianju",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "phaseJieshuBegin" },
	// ③ 的两个子技能必须常驻挂载（不能靠 addTempSkill：过期点与触发时机同名会互斥，
	//    TRIGGER_REFERENCE.md §七.3）；它们各自用 storage / mark 当开关。
	filter(event, player) {
		// 原型 jianju.lua:32-37：攻击范围内没有其他角色时摸 0 张也能发动
		// （这段的主要收益是后面的转化能力，不是摸牌），旧版要求至少 1 人 ⇒ 不符
		return true;
	},
	async content(event, trigger, player) {
		const num = game.countPlayer((current) => current != player && player.inRange(current));
		player.logSkill("chashui_jianju");
		if (num > 0) await player.draw(num);
		player.addTempSkill("chashui_jianju_on", { player: "phaseZhunbeiBegin" });
	},
	ai: {
		threaten: 1.2,
	},
	group: ["loseall", "loseall_duel", "loseall_clear"],
	sub: {
		loseall: {
		audio: false,
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { player: ["useCardAfter", "respondAfter"] },
		filter(event, player) {
			if (event.skill != "chashui_jianju_on_backup") return false;
			const used = (event.cards || []).filter((card) => card);
			if (!used.length) return false;
			const usedSuits = used.map((card) => get.suit(card));
			const restSuits = player.getCards("h").map((card) => get.suit(card));
			return usedSuits.some((suit) => !restSuits.includes(suit));
		},
		async content(event, trigger, player) {
			player.storage.chashui_jianju_loseall = true;
			// mark 变红 + 追加说明
			lib.skill.chashui_jianju_on.setReady?.(player, true);
		},
		},
		loseall_duel: {
		// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
		popup: false,
		audio: "chashui_jianju",
		charlotte: true,
		// 描述「你可以」——发动与否询问玩家（原型 askToSkillInvoke 可取消），不再强制
		trigger: { global: "phaseJieshuBegin" },
		filter(event, player) {
			if (!player.storage.chashui_jianju_loseall) return false;
			const current = _status.currentPhase;
			if (!current || current.isDead() || current == player) return false;
			const vcard = { name: "juedou", isCard: true };
			return player.canUse(vcard, current);
		},
		check(event, player) {
			const current = _status.currentPhase;
			return current && current.isIn() && get.attitude(player, current) < 0;
		},
		async content(event, trigger, player) {
			const current = _status.currentPhase;
			player.storage.chashui_jianju_loseall = false;
			// 决斗结算后 mark 恢复黑色
			lib.skill.chashui_jianju_on.setReady?.(player, false);
			if (!current || current.isDead()) return;
			player.logSkill("chashui_jianju", current);
			const vcard = { name: "juedou", isCard: true };
			await player.useCard(vcard, [], current);
		},
		onremove(player) {
			delete player.storage.chashui_jianju_loseall;
		},
		},
		loseall_clear: {
		audio: false,
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { global: "phaseAfter" },
		filter(event, player) {
			return !!player.storage.chashui_jianju_loseall;
		},
		async content(event, trigger, player) {
			player.storage.chashui_jianju_loseall = false;
			lib.skill.chashui_jianju_on.setReady?.(player, false);
		},
		},
	},
});
const chashui_jianju = chashui_jianjuPlan.skills.chashui_jianju;
const chashui_jianju_loseall = chashui_jianjuPlan.skills.chashui_jianju_loseall;
const chashui_jianju_loseall_duel = chashui_jianjuPlan.skills.chashui_jianju_loseall_duel;
const chashui_jianju_loseall_clear = chashui_jianjuPlan.skills.chashui_jianju_loseall_clear;

/** 坚拒的转化态（红→闪、黑→无懈；使用+打出） */
const chashui_jianju_on = {
	audio: false,
	charlotte: true,
	forced: true,
	popup: false,
	mark: true,
	marktext: "拒",
	intro: {
		content(storage, player) {
			const base = "你可以将一张红色手牌当【闪】、黑色手牌当【无懈可击】使用或打出。";
			// 已满足③的触发条件 → 追加说明
			if (player?.storage?.chashui_jianju_loseall) {
				return base + '<br><span class="bluetext">本回合结束阶段，你可以视为对当前回合角色使用一张【决斗】。</span>';
			}
			return base;
		},
	},
	/**
	 * 切换「已就绪」状态的呈现：mark 的「拒」字变红 + intro 追加说明。
	 *
	 * 引擎链路（已核）：
	 *   - mark 文字取 `lib.translate[技能id + "_bg"]`（player.js:10367），**创建节点时**写入
	 *   - `updateMark` 只重算角标计数，**不会**重渲染 `_bg`（player.js:4689-4741）
	 *   - `markSkill` 在 mark 已存在时只更新 `info`，也不重建节点（player.js:10199-10207）
	 * ⇒ 必须 **unmarkSkill → 改 _bg → markSkill** 三步，节点才会用新文字重建。
	 */
	setReady(player, ready) {
		if (!player) return;
		// 与 xingyu_bogua_red/black 同款：marktext 里直接写 <span style="color:...">
		lib.translate["chashui_jianju_on_bg"] = ready ? '<span style="color:#ff0000">拒</span>' : "拒";
		if (player.hasSkill("chashui_jianju_on")) {
			// updateMark 只重算角标、markSkill 只更新 info，都不会重建 _bg 节点 → 必须 unmark 再 mark
			player.unmarkSkill("chashui_jianju_on");
			player.markSkill("chashui_jianju_on");
		}
	},
	enable: ["chooseToUse", "chooseToRespond"],
	filter(event, player) {
		if (!player.countCards("h")) return false;
		// 出牌阶段窗不接（本技能只在响应/无懈窗有意义；描述是「使用或打出」但实指响应）
		if (event.type == "phase") return false;
		for (const name of ["shan", "wuxie"]) {
			const color = name == "shan" ? "red" : "black";
			if (player.countCards("h", (card) => get.color(card) == color) && event.filterCard({ name, isCard: true }, player, event)) {
				return true;
			}
		}
		return false;
	},
	chooseButton: {
		dialog(event, player) {
			const list = [];
			for (const name of ["shan", "wuxie"]) {
				const color = name == "shan" ? "red" : "black";
				if (player.countCards("h", (card) => get.color(card) == color) && event.filterCard({ name, isCard: true }, player, event)) {
					list.push(["基本", "", name]);
				}
			}
			if (!list.length) return ui.create.dialog("坚拒：没有可转化的手牌");
			const dialog = ui.create.dialog("坚拒", [list, "vcard"], "hidden");
			dialog.direct = true;
			return dialog;
		},
		filter(button, player) {
			const name = button.link[2];
			const color = name == "shan" ? "red" : "black";
			return player.countCards("h", (card) => get.color(card) == color) > 0;
		},
		check(button) {
			const name = button.link[2];
			const color = name == "shan" ? "red" : "black";
			return get.player().countCards("h", (card) => get.color(card) == color);
		},
		backup(links) {
			const name = links[0][2];
			const color = name == "shan" ? "red" : "black";
			return {
				filterCard: (card) => get.color(card) == color,
				selectCard: 1,
				position: "h",
				viewAs: { name, isCard: true },
				popname: true,
			};
		},
		prompt(links) {
			const name = links[0][2];
			return "坚拒：将一张" + (name == "shan" ? "红色" : "黑色") + "手牌当【" + get.translation(name) + "】使用或打出";
		},
	},
	// 无懈窗硬预检（docs/响应与抵消.md:106）
	hiddenCard(player, name) {
		if (name != "wuxie" && name != "shan") return false;
		const color = name == "shan" ? "red" : "black";
		return player.countCards("h", (card) => get.color(card) == color) > 0;
	},
	ai: {
		respondShan: true,
		respondSha: false,
		skillTagFilter(player, tag, arg) {
			if (tag != "respondShan") return false;
			return player.countCards("h", (card) => get.color(card) == "red") > 0;
		},
	},
};

/**
 * 坚拒③：因使用坚拒转化的牌而**失去一种花色的手牌** → 记标记
 *
 * 判据范式照原生 `yuejian`（sp.js:28785-28786 / 28803）：
 *   `suits.some(suit => !hssuits.includes(suit))`
 *   —— 本次失去的牌里有某个花色，是你**现在手牌里已经没有的**花色。
 *   这同时排除了「本来就没有该花色」的误判：判据比较的是「失去的牌的花色」与「剩余手牌的花色」，
 *   只有该花色被本次使用清空才成立。
 * 取数：`event.cards` 是本次使用的底牌（转化牌；respond 无 result、牌在 event.cards，坑-清单 #102）。
 * 触发时机用 `useCardAfter` + `respondAfter`（原生 extra.js:3114 同款双挂）——转化【闪】是
 * **打出**，走 respond 事件，只挂 useCardAfter 会让最常用的闪防路径点亮不了③。
 */


/**
 * 坚拒③的结算：**当前回合的结束阶段**视为对当前回合角色用【决斗】
 *
 * ⚠️ 不能做成 `addTempSkill(..., {player:"phaseJieshuBegin"})` 的临时技能 ——
 *   过期点与触发时机同名时，引擎先清过期技能再派发 trigger，永远来不及触发
 *   （TRIGGER_REFERENCE.md §七.3）。所以本技能**常驻**（进主技能 group），
 *   靠 `storage.chashui_jianju_loseall` 当开关，触发后自己清标记。
 */


/* 坚拒③收尾：标记只活到**本回合**结束（原型 @@tea__jianju_loseall-turn 的 -turn 语义）——
 * 无论决斗是否发动，回合结束就清；否则标记存留到之后任意回合的结束阶段，
 * 「当前回合结束阶段」被拉长。
 * 用普通块注释而非 JSDoc：正文里的 `@@标记名` 会让 TS 的 JSDoc 解析器报 TS1003。
 */


/**
 * 应伐（殷观）
 *
 * 描述：出牌阶段限一次，你可以令两名其他角色同时选择是否对你选择的另一名角色使用【杀】（无距离限制），
 *       若均选择：是这些【杀】目标改为你；否，你获得其中一名角色一张牌。
 *
 * Lua（yingfa.lua:5-104）：
 *   选 2 名其他角色 → 你再选 1 名「另一名角色」作为【杀】的目标 →
 *   两名角色**依次**（不是并行，`for i=1,2` :38-53）用【杀】指定该目标（`must_targets` 强制、`bypass_distances`）
 *   → 若 **两人都出了杀**（`#answer == 2`）→ 把两张杀的目标都改成你（`:54-59`）
 *   → 若 **两人都没出**（`#answer == 0`）→ 你从两人中选一人获得其一张牌（`:73-102`）
 *   → 只有一人出：什么都不发生（照常结算那一张杀）
 *
 * ⚠️ 与中文表措辞的差异：表里写「若均选择：是…；否…」，Lua 是「都出杀→改目标；都没出→拿牌」，
 *   一人出一人不出 = 无额外效果。本实现按 Lua。
 *
 * 无名杀实现：
 *   `chooseTarget` 选 2 名 → `chooseTarget` 选 1 名目标 → 先逐个 `chooseBool` 收集两人的
 *   「是否出杀」决定（描述「同时选择」），**再**统一出杀——这样「两人都出」在第一张杀
 *   飞出去之前就已确定，可以直接把 useCard 的目标建成 `[player]`，不再需要 useCard2 改目标
 *   的子技能（旧版标记挂在循环之后，两张杀早已结算完，改目标永远不生效）。
 *   无距离：出杀前用 `canUse(vcard, aim, false)` 判定；不计数：useCard 后 `next.addCount = false`。
 */
const chashui_yingfa = {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.countPlayer((current) => current != player) >= 3;
	},
	async content(event, trigger, player) {
		// ① 选两名其他角色
		const first = await player
			.chooseTarget(get.prompt("chashui_yingfa"), "选择两名其他角色", 2, (card, player2, target) => target != player2)
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
		if (!first?.bool || first.targets?.length != 2) return;
		const helpers = first.targets.slice(0);
		// ② 选「另一名角色」作为杀的目标
		const second = await player
			.chooseTarget("选择【杀】的目标", (card, player2, target) => target.isIn() && !helpers.includes(target))
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
		if (!second?.bool || !second.targets?.length) return;
		const aim = second.targets[0];
		player.logSkill("chashui_yingfa", helpers);
		// ③ 两名角色先后询问、同时生效地选择是否对 aim 用杀（描述「同时选择」）
		// ⚠ 必须真的打出手里的【杀】并消耗掉（原型 yingfa.lua 走 askToUseCard）。
		//   旧版 `helper.useCard({name:"sha",isCard:true}, [], [to])` 是凭空印牌——
		//   手牌里一张杀都没有也能飞出去。
		const answers = [];
		for (const helper of helpers) {
			if (!helper.isIn() || !aim.isIn()) continue;
			if (!helper.countCards("hs", (one) => get.name(one) == "sha")) continue;
			const go = await helper
				.chooseBool("应伐：是否对" + get.translation(aim) + "使用一张【杀】（无距离限制）？")
				.set("ai", () => (get.attitude(helper, aim) < 0 ? 1 : -1))
				.forResult();
			if (!go?.bool) continue;
			const pick = await helper
				// 目标合法性：无距离限制不等于无目标限制（例如目标有「帷幕」等）。
				// canUse 的第 3 参 false 只跳过距离，仍会跑 targetEnabled。
				.chooseCard("hs", "应伐：选择一张【杀】", true, (one) => get.name(one) == "sha" && helper.canUse(one, aim, false) && helper.canUse(one, player, false))
				.set("ai", (one) => 4 - get.value(one))
				.forResult();
			if (!pick?.cards?.length) continue;
			answers.push({ helper, card: pick.cards[0] });
		}
		// ④ 统一出杀：两人都出 → 两张【杀】目标改为你；只有一人出 → 照常对该目标结算
		// 「均选择」按 helpers 全为 2 人计：任一环节缺失（离场/没杀/放弃）都算没选。
		const both = answers.length == 2 && helpers.every((current) => current.isIn());
		for (const { helper, card } of answers) {
			const to = both ? player : aim;
			if (!helper.isIn() || !to?.isIn()) continue;
			// 真实底牌：不传 cards 时引擎自动取 [next.card]（player.js:7420-7425）
			const next = helper.useCard(card, [to]);
			next.addCount = false;
			await next;
		}
		if (both) return;
		// ⑤ 都没出 → 你获得其中一人一张牌
		if (answers.length == 0) {
			const list = helpers.filter((current) => current.isIn() && current.countCards("he") > 0);
			if (!list.length) return;
			const pick = await player
				.chooseTarget("应伐：选择一名角色，获得其一张牌", (card, player2, target) => list.includes(target))
				.set("ai", (target) => -get.attitude(player, target))
				.forResult();
			if (!pick?.bool || !pick.targets?.length) return;
			const target = pick.targets[0];
			// 发动时（第 664 行附近）已 logSkill 过一次；这里再记会让 countSkill 翻倍
			// （countSkill 读 getStat("skill")，player.js:4949-4959）
			await player.gainPlayerCard(target, "he", true).set("ai", (button) => get.buttonValue(button));
		}
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
};

/**
 * 制越（殷观）
 *
 * 描述：当你受到伤害后，你可以亮出牌堆顶的三张牌，并将其中任意张交给一名角色，
 *       该角色声明等量花色，展示所有手牌然后弃置此花色的所有手牌。
 *
 * Lua（zhiyue.lua:5-71）：
 *   亮 3 张（进处理区 `Card.Processing`，:12-19）→ 选 1~3 张（`:20-28`）→
 *   **给 0 张则整个技能结束**（`:29` `if #choosecards > 0`，与用户确认口径一致）→
 *   选一名角色（全场存活，含自己，`:31-38`）→ 交给其这些牌（`:41`）→
 *   其选**等量**个花色（`:43-50`）→ 展示所有手牌（`:52`）→ 弃这些花色的所有手牌（`:51-64`）
 *
 * ⚠️ 口径（用户已确认）：**花色不能重复**（N 张就选 N 种不同花色）；给 0 张则技能直接结束。
 *   Lua 的 `askToChoices` 没显式去重，但描述「等量花色」+ 用户口径 = 去重。本实现用
 *   `chooseControl` 逐个选并排除已选，确保 N 种不同花色。
 */
const chashui_zhiyue = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "damageEnd" },
	filter(event, player) {
		return event.num > 0;
	},
	async content(event, trigger, player) {
		// ① 亮出牌堆顶三张
		const cards = get.cards(3);
		await game.cardsGotoOrdering(cards);
		const show = await player
			// 可取消（Lua askToCards 默认 cancelable）：给 0 张 = 技能结束，亮出的牌进弃牌堆
			.chooseButton(["制越：选择任意张亮出的牌交给一名角色", cards], [1, 3])
			.set("ai", (button) => 1 + get.value(button.link))
			.forResult();
		// 给 0 张 → 技能结束（用户口径）
		if (!show?.bool || !show.links?.length) {
			// 亮出的牌进弃牌堆
			await game.cardsDiscard(cards);
			return;
		}
		const chosen = show.links.slice(0);
		// ② 选一名角色（含自己）
		const target = await player
			.chooseTarget("制越：将选择的牌交给一名角色", (card, player2, t) => t.isIn())
			.set("ai", (t) => get.attitude(player, t))
			.forResult();
		if (!target?.bool || !target.targets?.length) {
			await game.cardsDiscard(cards);
			return;
		}
		const to = target.targets[0];
		player.logSkill("chashui_zhiyue", to);
		// ③ 交给其这些牌
		await to.gain(chosen, "gain2");
		// 剩余亮出牌进弃牌堆
		const rest = cards.filter((card) => !chosen.includes(card));
		if (rest.length) await game.cardsDiscard(rest);
		if (!to.isIn()) return;
		// ④ 其声明等量花色（不能重复）
		const suits = [];
		const allSuits = lib.suit.slice(0);
		for (let i = 0; i < chosen.length; i++) {
			const available = allSuits.filter((s) => !suits.includes(s));
			if (!available.length) break;
			const result = await to
				.chooseControl(available)
				.set("prompt", "制越：请声明" + get.cnNumber(chosen.length) + "个不同的花色（已选" + get.cnNumber(suits.length) + "个）")
				.set("ai", () => {
					// AI 优先选其手牌里最多的花色
					const count = {};
					for (const card of to.getCards("h")) {
						const s = get.suit(card);
						count[s] = (count[s] || 0) + 1;
					}
					available.sort((a, b) => (count[b] || 0) - (count[a] || 0));
					return available[0];
				})
				.forResult();
			if (!result?.control || result.control == "cancel2") break;
			suits.push(result.control);
		}
		if (!suits.length) return;
		// ⑤ 展示所有手牌，弃置这些花色的所有手牌
		const hand = to.getCards("h");
		if (!hand.length) return;
		to.showCards(hand);
		const discards = hand.filter((card) => suits.includes(get.suit(card)));
		if (discards.length) await to.discard(discards);
	},
	ai: {
		expose: 0.2,
	},
};

/**
 * 捻止（桓阶）
 *
 * 描述：你的手牌数变化后，若其中每种花色的牌数均相等，你可以展示所有手牌并令当前回合角色
 *       摸等量于花色数张牌，然后其本回合不能使用这些花色的牌。
 *
 * Lua（nianzhi.lua:5-90）：
 *   入口 `AfterCardsMove`，判「自己的手牌有增减」（:10-14）
 *   条件：手牌非空，且**出现的每种花色数量相同**（:15-47；只统计 >0 的花色）
 *   效果：展示所有手牌 → 当前回合角色摸「花色数」张（:60-61）→
 *     给当前回合角色挂 `@nianzhi-turn` 标记（存花色数组，可累加，:62-72）
 *   禁牌：`prohibit_use`（:76-87）——只禁**手牌里的**这些花色
 *
 * 无名杀：
 *   入口用获得/失去全家桶（无名杀无 AfterCardsMove）
 *   禁牌用临时技能 + `mod.cardEnabled`（注意：不能用 `cardEnabled:()=>false` 做目标级限制，
 *     这里是「这些花色的牌不能使用」，属于整张牌禁用，`cardEnabled` 合适；
 *     但要判「牌在手牌区」——docs/印牌类技能标准 §7.9 提示 cardEnabled 是整牌禁用）
 */
const chashui_nianzhi = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: {
		player: ["gainAfter", "loseAfter"],
		global: ["loseAsyncAfter", "equipAfter"],
	},
	filter(event, player) {
		const current = _status.currentPhase;
		if (!current || current.isDead()) return false;
		if (!player.countCards("h")) return false;
		// 手牌数确有变化
		let changed = false;
		if (event.name == "gain" || event.name == "loseAsync" || event.name == "equip") {
			if (event.getg?.(player)?.hs?.length) changed = true;
		}
		if (event.name == "lose" || event.name == "loseAsync") {
			if (event.getl?.(player)?.hs?.length) changed = true;
		}
		if (!changed) return false;
		// 每种出现的花色数量相同
		const count = {};
		for (const card of player.getCards("h")) {
			const suit = get.suit(card);
			count[suit] = (count[suit] || 0) + 1;
		}
		const nums = Object.values(count);
		if (nums.length <= 0) return false;
		return nums.every((num) => num == nums[0]);
	},
	async content(event, trigger, player) {
		const current = _status.currentPhase;
		if (!current || current.isDead()) return;
		const count = {};
		for (const card of player.getCards("h")) {
			const suit = get.suit(card);
			count[suit] = (count[suit] || 0) + 1;
		}
		const suits = Object.keys(count);
		player.logSkill("chashui_nianzhi", current);
		player.showCards(player.getCards("h"));
		await current.draw(suits.length);
		// 本回合不能使用这些花色
		if (!current.isIn()) return;
		current.addTempSkill("chashui_nianzhi_ban", { player: "phaseAfter" });
		current.storage.chashui_nianzhi_ban = (current.storage.chashui_nianzhi_ban || []).concat(suits).toUniqued();
	},
	ai: {
		threaten: 1.1,
	},
};

/** 捻止的禁牌态：本回合不能使用指定花色的手牌 */
const chashui_nianzhi_ban = {
	audio: false,
	charlotte: true,
	forced: true,
	popup: false,
	mark: true,
	marktext: "止",
	intro: {
		content(storage, player) {
			const suits = player.storage.chashui_nianzhi_ban || [];
			return "本回合不能使用" + suits.map((s) => get.translation(s)).join("、") + "的牌。";
		},
	},
	mod: {
		cardEnabled(card, player) {
			const suits = player.storage.chashui_nianzhi_ban || [];
			if (!suits.length) return;
			// 只禁「手牌里的」牌（原型 nianzhi.lua:80-84 按 subcards 是否全在手牌区判）。
			// ⚠ 不能只看 `get.position(card) != "h"`：转化/虚拟牌本身不属于任何区域，
			// position 恒不是 "h"，等于把这类牌全部放行。原生同款展开写法见
			// character/collab.js:2723-2729、character/huicui.js:2531-2535。
			const cards2 = [card];
			if (Array.isArray(card.cards)) cards2.push(...card.cards);
			const hand = player.getCards("h");
			if (!cards2.every((one) => hand.includes(one))) return;
			if (cards2.some((one) => suits.includes(get.suit(one)))) return false;
		},
	},
	onremove(player) {
		delete player.storage.chashui_nianzhi_ban;
	},
};

/**
 * 乞丧（桓阶）
 *
 * 描述：限定技，其他角色死亡时，你可以弃置一张牌并选择一名角色，其获得死亡角色的所有牌。
 *
 * Lua（qisang.lua:5-38）：
 *   `fk.Death`（死亡时，不是死亡后）→ 目标未空手（`not target:isNude()`）→ 限定技（HistoryGame）
 *   → 弃一张牌（含装备，:13-19）→ 选一名存活角色（:25-32）→ 其获得死者**手牌+装备区**所有牌
 *     （:23 `getCardIds{Player.Hand, Player.Equip}`，**不含判定区**）
 *
 * 无名杀：用 `die`（不是 dieAfter —— dieAfter 时牌已进弃牌堆），`limited: true`。
 */
const chashui_qisang = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "metal",
	trigger: { global: "die" },
	filter(event, player) {
		if (event.player == player) return false;
		if (!event.player.countCards("he")) return false;
		return player.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		const dead = trigger.player;
		// 弃一张牌
		const discard = await player
			.chooseToDiscard("he", get.prompt2("chashui_qisang"), 1, true)
			.set("ai", (card) => 4 - get.value(card))
			.forResult();
		if (!discard?.bool || !discard.cards?.length) return;
		player.awakenSkill("chashui_qisang");
		// 选一名存活角色
		const target = await player
			.chooseTarget("乞丧：选择一名角色，其获得" + get.translation(dead) + "的所有牌", (card, player2, t) => t.isIn())
			.set("ai", (t) => get.attitude(player, t))
			.forResult();
		if (!target?.bool || !target.targets?.length) return;
		const to = target.targets[0];
		const cards = dead.getCards("he");
		player.logSkill("chashui_qisang", to);
		if (cards.length) await to.gain(cards, "gain2");
	},
};

/**
 * 平越（钟离牧）
 *
 * 描述：当你需要使用一张【杀】时，若你的攻击范围大于0，你可以视为使用一张【杀】，
 *       然后你本轮攻击范围-1。
 *
 * Lua（pingyue.lua:5-37）：纯 viewas，`pattern="slash"`、`card_filter=FalseFunc`（凭空印）
 *   `enabled_at_play`: `getAttackRange() > 0`
 *   `enabled_at_response`: `getAttackRange() > 0 and not response`（响应窗只接「需要使用杀」的场合）
 *   `before_use` / `after_use` 各加一次 `@pingyue_attackrange-round` 标记（:20-27）
 *   `atkrange.correct_func` 减这个标记（:30-34）
 *
 * 无名杀：照 `weijing`（sp.js:32670）的 chooseButton + backup 三件套。
 *   注意「需要使用杀」= 借刀/决斗等 chooseToUse 窗，不是打出窗 ⇒ enable 只写 chooseToUse。
 *   攻距 -1 用临时技能 + mod.attackRange，`roundStart` 过期（「本轮」）。
 */
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_pingyuePlan = defineSkill({
	id: "chashui_pingyue",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	enable: "chooseToUse",
	hiddenCard(player, name) {
		// 没有 hiddenCard 的话 hasSha()/hasUsableCard() 完全看不到本技能（player.js:13507-13524）：
		// 引擎对「凭空印牌」的技能只认静态 viewAs 或 hiddenCard，chooseButton 形态两者都没有。
		if (name != "sha") return false;
		if (player.getAttackRange() <= 0) return false;
		// 【杀】是有目标的牌，要问「现在有没有合法目标」
		return player.hasUseTarget({ name: "sha", isCard: true }, false, false);
	},
	filter(event, player) {
		if (event.type == "wuxie") return false;
		if (player.getAttackRange() <= 0) return false;
		return event.filterCard({ name: "sha", isCard: true }, player, event);
	},
	chooseButton: {
		dialog(event, player) {
			if (!event.filterCard({ name: "sha", isCard: true }, player, event)) return ui.create.dialog("平越：当前不能视为使用【杀】");
			const dialog = ui.create.dialog("平越", [["基本", "", "sha"], "vcard"], "hidden");
			dialog.direct = true;
			return dialog;
		},
		backup(links) {
			return {
				filterCard: () => false,
				selectCard: -1,
				viewAs: { name: "sha", isCard: true },
				popname: true,
			};
		},
		prompt(links) {
			return "平越：视为使用一张【杀】（本轮攻击范围-1）";
		},
	},
	ai: {
		order(item, player) {
			const player2 = _status.event.player;
			const event2 = _status.event;
			if (event2.filterCard({ name: "sha" }, player2, event2)) {
				if (
					!player2.hasShan() &&
					!game.hasPlayer((current) => player2.canUse("sha", current) && current.hp == 1 && get.effect(current, { name: "sha" }, player2, player2) > 0)
				) {
					return 0;
				}
				return 2.5;
			}
			return 0;
		},
	},
	group: ["used"],
	sub: {
		used: {
		audio: false,
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { player: "useCard" },
		filter(event, player) {
			// `useCard` 的 skill 可能是引擎在 content.js:4773 动态建的 `chashui_pingyue_backup`，
			// 也可能（若 backup 没被套上）仍是主技能 id；两种都认，避免再因为一条链路没走到而静默失效。
			if (event.skill != "chashui_pingyue_backup" && event.skill != "chashui_pingyue") return false;
			return player.getAttackRange() > 0;
		},
		async content(event, trigger, player) {
			player.logSkill("chashui_pingyue");
			player.addTempSkill("chashui_pingyue_down", { global: "roundStart" });
			player.addMark("chashui_pingyue_down", 1, false);
		},
		},
	},
});
const chashui_pingyue = chashui_pingyuePlan.skills.chashui_pingyue;
const chashui_pingyue_used = chashui_pingyuePlan.skills.chashui_pingyue_used;

/**
 * 平越的攻距衰减（本轮有效）
 *
 * 呈现同安境：攻击范围类修正一律挂 `markimage: "image/card/attackRange.png"`，
 * 不写 `mark`/`marktext`（否则图标被字符顶掉，见 docs/呈现与可视化标准.md §八）。
 * 每用一次 +1 层（负向），`addTempSkill(..., { global: "roundStart" })` 到轮首自动移除，
 * 移除时 `player.removeSkill` 走 `unmarkSkill`（player.js:11476）与 `onremove`（11491-11493）。
 */
const chashui_pingyue_down = {
	audio: false,
	charlotte: true,
	forced: true,
	popup: false,
	onremove: true,
	markimage: "image/card/attackRange.png",
	intro: {
		name: "平越",
		content(storage, player) {
			return `<li>攻击范围-${storage}<br><li>当前攻击范围：${player.getAttackRange(false)}`;
		},
	},
	mod: {
		attackRange(player, num) {
			return num - player.countMark("chashui_pingyue_down");
		},
	},
};

/**
 * 平越的结算（本轮攻击范围 -1）
 *
 * 为什么挂在 `useCard` 触发上，而不是 backup 的 `precontent`：
 *   `precontent` 只在「确认牌之后、useCard 之前」那条分支里被消费（content.js:4759，
 *   条件是 `get.info(event.result.skill).precontent` 存在）。它依赖 `ui.click.ok()` 把
 *   `event.skill`（此时已是 content.js:4773 动态建出来的 `<主技能>_backup`）写回
 *   `result.skill`；只要这条链路有一环没走到，代价就静默不结算——而牌照样用出去，
 *   表现正是「出了杀但攻击范围没减」。
 *   `useCard` 触发没有这个不确定性：牌只要真的用出去，事件一定派发，且 `event.skill`
 *   就是那个 `<主技能>_backup`（`player.useCard` 把字符串实参写进 `next.skill`，
 *   player.js:7405-7412；`useResult` 又把 `result.skill` 原样传进来，player.js:7359）。
 *   时机也等价：`useCard` 派发早于牌面结算，与原型 `before_use` 一致。
 *
 * 原型 pingyue.lua:20-27 的两段都加标记，但 `after_use` 那段的守卫是
 * 「`getAttackRange() > 0` 才加」——这里按描述「然后你本轮攻击范围-1」只结算一次，
 * 并保留同样的 `> 0` 守卫，保证不会把攻击范围减成负数。
 */


/**
 * 安境（钟离牧）
 *
 * 描述：每轮开始时，你攻击范围+1（至多+5）。每阶段结束时，若有角色攻击范围与此阶段开始时不相等，
 *       你可以使用一张【杀】。
 *
 * Lua（anjing.lua:5-70）：
 *   ① `RoundStart`：`@anjing_attackrange < 5` 时 +1（:9-11,41-43）
 *   ② `EventPhaseStart`（**每个阶段开始时**）：把**全场每个角色**的攻击范围快照到
 *      `anjing_record-phase`（:49-58）
 *   ③ `EventPhaseEnd`（每个阶段结束时）：只要有一个角色的 `anjing_record-phase != getAttackRange()`
 *      就可以使用一张【杀】（:12-15；出杀用 `askToUseCard`，:17-39）
 *
 * 无名杀：
 *   ① `roundStart` + addMark 封顶 5 + mod.attackRange
 *   ② 六个 `phase*End` 前要先快照 → 用 `phaseAnyBegin`？不行，`phaseAny` 只在 trigger 注册时展开。
 *      **改为：用 `player: ["phaseBegin"]`？** 不对——需要「每个阶段开始时」。
 *      正确做法：`global: ["phaseZhunbeiBegin","phaseJudgeBegin","phaseDrawBegin","phaseUseBegin","phaseDiscardBegin","phaseJieshuBegin"]`
 *      逐个快照（取证确认六阶段都有 Begin/End）。
 *   ③ 六个 `phase*End` 检查。
 */
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_anjingPlan = defineSkill({
	id: "chashui_anjing",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	// 每轮开始 +1（至多 +5）
	trigger: { global: "roundStart" },
	filter(event, player) {
		return player.countMark("chashui_anjing_range") < 5;
	},
	forced: true,
	async content(event, trigger, player) {
		player.addMark("chashui_anjing_range", 1, false);
	},
	ai: {
		threaten: 1.1,
	},
	group: ["record", "use", "range"],
	sub: {
		record: {
		audio: false,
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: {
			global: ["phaseZhunbeiBegin", "phaseJudgeBegin", "phaseDrawBegin", "phaseUseBegin", "phaseDiscardBegin", "phaseJieshuBegin"],
		},
		async content(event, trigger, player) {
			const record = {};
			for (const current of game.filterPlayer()) {
				record[current.playerid] = current.getAttackRange();
			}
			player.storage.chashui_anjing_record = record;
		},
		onremove(player) {
			delete player.storage.chashui_anjing_record;
		},
		},
		use: {
		// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
		popup: false,
		audio: "chashui_anjing",
		charlotte: true,
		trigger: {
			global: ["phaseZhunbeiEnd", "phaseJudgeEnd", "phaseDrawEnd", "phaseUseEnd", "phaseDiscardEnd", "phaseJieshuEnd"],
		},
		filter(event, player) {
			const record = player.storage.chashui_anjing_record;
			if (!record) return false;
			// 有角色攻击范围与此阶段开始时不等
			const changed = game.filterPlayer().some((current) => record[current.playerid] !== current.getAttackRange());
			if (!changed) return false;
			const vcard = { name: "sha", isCard: true };
			return player.hasUseTarget(vcard);
		},
		async content(event, trigger, player) {
			const vcard = { name: "sha", isCard: true };
			const result = await player
				.chooseUseTarget(vcard, "安境：你可以使用一张【杀】", false)
				.set("ai", (target) => get.effect(target, vcard, player, player))
				.forResult();
			if (result?.bool) player.logSkill("chashui_anjing");
		},
		},
		range: {
		audio: false,
		charlotte: true,
		forced: true,
		popup: false,
		onremove: true,
		markimage: "image/card/attackRange.png",
		intro: {
			name: "安境",
			content(storage, player) {
				const num = Math.min(storage, 5);
				return `<li>攻击范围+${num}（至多+5）<br><li>当前攻击范围：${player.getAttackRange(false)}`;
			},
		},
		mod: {
			attackRange(player, num) {
				return num + Math.min(player.countMark("chashui_anjing_range"), 5);
			},
		},
		},
	},
});
const chashui_anjing = chashui_anjingPlan.skills.chashui_anjing;
const chashui_anjing_record = chashui_anjingPlan.skills.chashui_anjing_record;
const chashui_anjing_use = chashui_anjingPlan.skills.chashui_anjing_use;
const chashui_anjing_range = chashui_anjingPlan.skills.chashui_anjing_range;

/**
 * 安境①：攻击范围 +X
 *
 * 呈现（范本 B，docs/呈现与可视化标准.md §八）：
 *   改攻击范围**必须**挂 `markimage: "image/card/attackRange.png"`（R18），
 *   不要 `mark: true`（那会被 `marktext` 走字符 mark 分支，player.js:10366-10371，
 *   图标就被覆盖成文字了）；mark 的出现/消失由 `addMark`/`removeMark` 自动托管
 *   （player.js:4640 markSkill；4603 `storage[i] ? markSkill : unmarkSkill`）。
 *   `intro.content` 的 `#` 用当前层数、`$` 用 storage 值（player.js:10966-10968）；
 *   这里层级与 storage 同源，直接函数形态取 storage，并补一句「当前攻击范围」
 *   （`getAttackRange(false)` 才是真实攻击范围；`raw` 版会把 -1 坐骑算进来，而那是距离不是攻击范围）。
 */


/** 安境②：每个阶段开始时快照全场攻击范围 */


/** 安境③：每个阶段结束时，若有角色攻击范围变了 → 可使用一张【杀】 */


/**
 * 捉骏（波才）
 *
 * 描述：当你于出牌阶段指定第二名目标的牌结算结束后，你可以视为对本阶段你指定的前两名目标间（含其）
 *       最短路径上任意名连续角色使用【南蛮入侵】，此【南蛮入侵】造成的伤害均视为雷电伤害，
 *       若有角色打出火【杀】响应此牌，其对你造成1点火焰伤害。
 *
 * Lua（zhuojun.lua:5-150）：
 *   ① 触发：`CardUseFinished`，本阶段自己的用牌目标**累积去重**后取前两个（:14-33，
 *      `table.insertIfNeed` 去重；`room:sortByAction` 按座次排序），两者相同则不触发
 *   ② 路径：从 to1 分别沿 getNextAlive / getLastAlive 走到 to2，**取短的那条**；
 *      等长且长度==2 取顺时针；等长且 >2 让玩家选方向（两条等长，都最短）（:49-73）
 *   ③ 目标里**剔除自己**（:75-77）
 *   ④ 南蛮：`card.skillName = 捉骏`，`room:useCard`（:78-85）
 *   ⑤ 雷电伤害：`DamageCaused` 里 `data.damageType = fk.ThunderDamage`（:107-111）
 *   ⑥ 火杀响应：`CardRespondFinished` 里判 `data.responseToEvent.card.name == "savage_assault"`
 *      且 `data.card.name == "fire__slash"` → 其对你造成1点火焰伤害（:97-103,112-122）
 *
 * 无名杀：
 *   ① `useCardAfter` + `player.getHistory("useCard")` 累积 targets 去重
 *   ② 座位链 `getNext()/getPrevious()`，注意可能 null（知识库 §十三）
 *   ⑤ `damageBegin1` 里 `trigger.nature = "thunder"`（content.js:11178 是首个可改时机）
 *   ⑥ `global:"respond"` + `event.getParent(2).name == "nanman"` + `game.hasNature(event.card,"fire")`
 *      （取证：respond 里必须用 event.card 虚拟牌判属性，不能用 event.cards[0]）
 */
const chashui_zhuojun = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		if (!player.isPhaseUsing()) return false;
		// 「每阶段限一次」：本阶段已发动过就不再触发（Lua 用 `tea__zhuojun_passed-phase`，
		// `-phase` 后缀 = 阶段结束自动清除；这里用 phaseUseEnd 子技能手动清）
		if (player.storage.chashui_zhuojun_passed_phase) return false;
		const pair = lib.getZhuojunPair(player);
		if (!pair) return false;
		return pair[0] != pair[1];
	},
	async content(event, trigger, player) {
		const pair = lib.getZhuojunPair(player);
		if (!pair) return;
		const [to1, to2] = pair;
		// 取短路径（等长且>2 时由玩家选方向）
		const path = await lib.getShortestPath(player, to1, to2);
		if (!path?.length) return;
		const alive = path.filter((current) => current.isIn());
		if (!alive.length) return;
		// 描述是「最短路径上**任意名连续**角色」⇒ 让玩家选一段连续区间（起点 + 终点），
		// 旧版直接把整条路径当目标（不符）。
		const startRes = await player
			.chooseTarget("捉骏：选择这段连续角色的起点（路径：" + alive.map((current) => get.translation(current)).join("→") + "）", (card, player2, target) => alive.includes(target))
			.set("ai", (target) => get.effect(target, { name: "nanman" }, player, player))
			.forResult();
		if (!startRes?.bool || !startRes.targets?.length) return;
		const startIdx = alive.indexOf(startRes.targets[0]);
		const endRes = await player
			.chooseTarget("捉骏：选择终点（须不早于起点）", (card, player2, target) => alive.indexOf(target) >= startIdx)
			.set("ai", (target) => get.effect(target, { name: "nanman" }, player, player))
			.forResult();
		if (!endRes?.bool || !endRes.targets?.length) return;
		const chosen = alive.slice(startIdx, alive.indexOf(endRes.targets[0]) + 1);
		player.storage.chashui_zhuojun_passed_phase = true;
		// 剔除自己
		const vcard = { name: "nanman", isCard: true, storage: { chashui_zhuojun: true } };
		// 连续路径上的人也要过【南蛮入侵】的目标合法性（例如帷幕/距离等），不能只按路径硬塞
		const targets = chosen.filter((current) => current != player && current.isIn() && player.canUse(vcard, current));
		if (!targets.length) return;
		player.logSkill("chashui_zhuojun", targets);
		await player.useCard(vcard, [], targets);
	},
	group: ["chashui_zhuojun_clear", "chashui_zhuojun_thunder", "chashui_zhuojun_fire"],
	onremove(player) {
		delete player.storage.chashui_zhuojun_passed_phase;
	},
	ai: {
		threaten: 1.3,
	},
	subSkill: {
		// 「每阶段限一次」的清除：出牌阶段结束时重置
		clear: {
			audio: false,
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { player: "phaseUseEnd" },
			async content(event, trigger, player) {
				delete player.storage.chashui_zhuojun_passed_phase;
			},
		},
		thunder: {
			audio: false,
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { source: "damageBegin1" },
			filter(event, player) {
				return event.card?.storage?.chashui_zhuojun;
			},
			async content(event, trigger, player) {
				trigger.nature = "thunder";
			},
		},
		fire: {
			audio: false,
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { global: "respond" },
			filter(event, player) {
				// 打出的是火【杀】（必须用 event.card 虚拟牌）
				if (get.name(event.card) != "sha" || !game.hasNature(event.card, "fire")) return false;
				// 响应的正是本技能印的【南蛮】：`respond` 的祖先链深度不固定（中间隔着
				// chooseToRespond 等事件），不能用 getParent(2) 猜——按名字上溯到 useCard。
				// 第二参 true 才在未命中时返回 undefined（否则返回 {} 恒真）。
				const cardEvent = event.getParent("useCard", true);
				if (!cardEvent || cardEvent.name != "useCard") return false;
				if (cardEvent.card?.name != "nanman") return false;
				return !!cardEvent.card.storage?.chashui_zhuojun && !event.player.isDead() && !player.isDead();
			},
			async content(event, trigger, player) {
				const responder = trigger.player;
				player.logSkill("chashui_zhuojun", responder);
				// 描述「其**对你**造成1点火焰伤害」⇒ 受伤者是 player（`X.damage(source, num)` 的 X 才是受伤者）
				await player.damage(responder, 1, "fire");
			},
		},
	},
};

/**
 * 捉骏：取**本阶段**自己用牌目标累积去重后的前两个（Lua zhuojun.lua:14-25）
 *
 * ⚠️ `getHistory("useCard")` 是**本回合**口径（player.js:11885），不是本阶段 ——
 *   必须用 `getParent("phaseUse")` 过滤到当前出牌阶段。
 *   原生同款：`drlt_wanglie`（shenhua.js:1955-1958）
 */
function getZhuojunPair(player) {
	const phase = _status.event?.getParent?.("phaseUse");
	if (!phase || phase.name != "phaseUse") return null;
	const ids = [];
	for (const evt of player.getHistory("useCard", (evt) => evt.getParent("phaseUse") == phase)) {
		if (!evt.targets?.length) continue;
		for (const target of evt.targets) {
			if (target?.isIn() && !ids.includes(target)) ids.push(target);
		}
	}
	if (ids.length < 2) return null;
	return [ids[0], ids[1]];
}

/** 捉骏：to1→to2 的最短座位路径（含两端）。等长且>2 时让玩家选方向（Lua zhuojun.lua:49-73） */
async function getShortestPath(player, to1, to2) {
	const path1 = [to1];
	let current = to1.getNext();
	while (current && current != to1 && path1.length < 100) {
		path1.push(current);
		if (current == to2) break;
		current = current.getNext();
	}
	const path2 = [to1];
	current = to1.getPrevious();
	while (current && current != to1 && path2.length < 100) {
		path2.push(current);
		if (current == to2) break;
		current = current.getPrevious();
	}
	const has1 = path1[path1.length - 1] == to2;
	const has2 = path2[path2.length - 1] == to2;
	if (has1 && !has2) return path1;
	if (has2 && !has1) return path2;
	if (!has1 && !has2) return null;
	if (path1.length != path2.length) return path1.length < path2.length ? path1 : path2;
	// 等长：长度 2（相邻）直接取顺时针；否则两条都最短，交给玩家选（Lua zhuojun.lua:63-70 askToChoice）
	if (path1.length == 2) return path1;
	const result = await player
		.chooseControl(["顺时针方向", "逆时针方向"])
		.set("prompt", "捉骏：两条最短路径等长，请选择【南蛮入侵】经过的方向")
		.set("ai", () => 0)
		.forResult();
	return result.index == 1 ? path2 : path1;
}

/**
 * 恢泽（郑泰）
 *
 * 描述：游戏开始时，你将牌堆顶五张牌背面朝上排列于武将牌上，称为“泽”。
 *       准备阶段，你可以展示并置换两张“泽”的位置，然后令至多X名角色各摸一张牌
 *       （X为这两张“泽”之间的牌数）。
 *
 * Lua（huize.lua:5-93）：
 *   ① `GamePrepared`：`room:getNCards(5)` → `addToPile("$tea__ze_pile", ...)`（:31-35）
 *   ② `EventPhaseStart` + `player.phase == Player.Start`：要求泽满 5 张（:39）
 *      → 选 2 张（:41-53）→ 展示（:63）→ **数组下标交换后整体重写 pile**（:64,69）
 *      → X = `|i-j| - 1`（:70），令至多 X 名角色各摸 1 张（:71-85）
 *
 * 无名杀（关键技术点，均已取证）：
 *   - 没有 `addToPile`，用 `addToExpansion`（牌在 `node.expansions`，`getExpansions(tag)` 按 DOM 顺序读回）
 *   - **`$addToExpansion` 是头插**（player.js:8122）⇒ 传入数组会被反转。
 *     所以：要 `getExpansions()` 读回 `[a,b,c]`，必须传 `[c,b,a]`（原生 potsifeng bingshi.js:1380 同款）
 *   - 重排：照 `dczhengyue`（xianding.js:29744-29755）——取出→重排→`reverse()`→
 *     `$addToExpansion(moved, null, [tag], false)`（第 4 参 false 跳过「已在 x 区则剔除」）
 *   - 背面朝上：引擎**没有**这个开关（取证否定）；照 `twqianxiong`（tw.js:4783-4790）
 *     用「intro 只报张数、不写 expansion」模拟
 */
const chashui_huize = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		return player.getExpansions("chashui_huize").length >= 5;
	},
	async content(event, trigger, player) {
		const pile = player.getExpansions("chashui_huize");
		if (pile.length < 5) return;
		// 选两张（用 chooseButton 选「泽」）
		const result = await player
			.chooseButton(["恢泽：选择并交换两张“泽”", pile], 2, true)
			.set("ai", (button) => get.value(button.link))
			.forResult();
		if (!result?.bool || result.links?.length != 2) return;
		const [card1, card2] = result.links;
		const i1 = pile.indexOf(card1);
		const i2 = pile.indexOf(card2);
		if (i1 < 0 || i2 < 0) return;
		player.logSkill("chashui_huize");
		// 展示
		player.showCards([card1, card2]);
		// 交换并整体重写（Lua huize.lua:64-69）
		const newPile = pile.slice(0);
		newPile[i1] = card2;
		newPile[i2] = card1;
		await lib.rewriteExpansion(player, "chashui_huize", newPile);
		// X = 两牌之间隔几张
		const num = Math.max(Math.abs(i1 - i2) - 1, 0);
		if (num <= 0) return;
		// 令至多 X 名角色各摸一张
		const drawResult = await player
			.chooseTarget("恢泽：令至多" + get.cnNumber(num) + "名角色各摸一张牌", [1, num], (card, player2, target) => target.isIn())
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!drawResult?.bool || !drawResult.targets?.length) return;
		await game.asyncDraw(drawResult.targets);
	},
	init(player) {
		// 游戏开始时把牌堆顶 5 张背面朝上置于武将牌上（Lua GamePrepared）
		player.storage.chashui_huize_ready = false;
	},
	// 「泽」的 mark：照原生「七星」`qixing`（extra.js:2255-2276）
	//   - 自己/被操控 → 浮窗里显示牌面（能算 X 与递增递减）
	//   - 其他人 → 只报张数（对应描述「背面朝上」）
	// ⚠️ gaintag 必须等于技能 id，`intro.content:"expansion"` 才取得到牌（get/index.js:4833-4836）
	// ⚠️ **不写 `mark: true`**：技能挂载时泽还没放（gameStart 才放），
	//    写了会先冒出一个空 mark。`addToExpansion` 的 content 会对 gaintag 自动
	//    `markSkill`（content.js:10723-10725），放牌后 mark 自然出现。
	marktext: "泽",
	intro: {
		markcount: "expansion",
		mark(dialog, storage, player) {
			const pile = player.getExpansions("chashui_huize");
			if (!pile.length) return;
			if (player == game.me || player.isUnderControl()) {
				dialog.addAuto(pile);
			} else {
				return "共有" + get.cnNumber(pile.length) + "张“泽”";
			}
		},
		content(storage, player) {
			const pile = player.getExpansions("chashui_huize");
			if (!pile.length) return "没有“泽”";
			if (player == game.me || player.isUnderControl()) {
				return get.translation(pile);
			}
			return "共有" + get.cnNumber(pile.length) + "张“泽”";
		},
	},
	group: ["chashui_huize_init"],
	ai: {
		threaten: 1.1,
	},
	subSkill: {
		init: {
			audio: false,
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { global: "gameStart" },
			filter(event, player) {
				return !player.storage.chashui_huize_ready;
			},
			async content(event, trigger, player) {
				player.storage.chashui_huize_ready = true;
				const cards = get.cards(5);
				// 头插会反转 → 传 reverse
				const next = player.addToExpansion(cards.slice(0).reverse(), "draw");
				next.gaintag.add("chashui_huize");
				await next;
			},
		},
	},
};

/**
 * 重写 expansion 内容（照 dczhengyue xianding.js:29762-29768：$ 直移）。
 * 牌本来就在 x 区，$addToExpansion 第 4 参 false 直接重排 DOM——不走弃牌堆：
 * 旧版 loseToDiscardpile 过一圈会发 lose 事件、污染「本回合进入弃牌堆」类历史
 * （本包晓白/悉乱以其为判据），还有弃牌堆闪动。
 */
function rewriteExpansion(player, tag, cards) {
	if (!cards?.length) return;
	// 头插 → 传 reverse
	player.$gain2(cards.slice(0));
	player.$addToExpansion(cards.slice(0).reverse(), null, [tag], false);
	player.markSkill(tag);
}

/**
 * 筹刃（郑泰）
 *
 * 描述：出牌阶段，若所有“泽”点数依次递增或递减，你可以展示之并对一名角色造成2点伤害，然后打乱之。
 *       每轮结束时，体力值唯一最多的角色可以令你回复1点体力，然后用一张牌替换一张“泽”。
 *
 * Lua（chouren.lua:5-170）：
 *   ① 主动技（无次数限制），要求泽满 5 张（:22）且点数单调递增或递减（:23-48）
 *      → 展示 → 造成 2 点伤害（:56-62）→ `table.random` 逐张抽 = 打乱（:63-69）→ 整体重写 pile（:70-72）
 *   ② `RoundEnd`：体力**唯一最多**的角色（:93-101）→ 可以令你回 1 点（:110-115）
 *      → 然后用其一张牌替换一张「泽」（:116-147，用 poxi 双选：一张泽 + 一张其区域牌）
 *
 * 无名杀：
 *   ① `enable:"phaseUse"`（不写 usable = 无限次）；单调判定用点数数组；打乱用 `randomSort()`
 *   ② `global:"roundEnd"`；替换用 chooseButton 选「泽」+ 选其一张牌
 */
const chashui_chouren = {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		const pile = player.getExpansions("chashui_huize");
		if (pile.length < 5) return false;
		const nums = pile.map((card) => get.number(card) || 0);
		const up = nums.every((num, i) => i == 0 || num >= nums[i - 1]);
		const down = nums.every((num, i) => i == 0 || num <= nums[i - 1]);
		if (!up && !down) return false;
		return game.hasPlayer((current) => current.isIn());
	},
	async content(event, trigger, player) {
		const pile = player.getExpansions("chashui_huize");
		if (pile.length < 5) return;
		const target = await player
			.chooseTarget("筹刃：对一名角色造成2点伤害", (card, player2, t) => t.isIn())
			.set("ai", (t) => -get.attitude(player, t) * 2)
			.forResult();
		if (!target?.bool || !target.targets?.length) return;
		const to = target.targets[0];
		player.logSkill("chashui_chouren", to);
		player.showCards(pile);
		// 描述「对一名角色造成2点伤害」⇒ 受伤者是 to、来源是你（补 source，伤害来源会影响后续技能判定）
		await to.damage(player, 2);
		// 打乱之（randomSort → 整体重写）
		await lib.rewriteExpansion(player, "chashui_huize", pile.slice(0).randomSort());
	},
	ai: {
		order: 7,
		result: { player: 1, target: (player, target) => -get.attitude(player, target) * 2 },
	},
	group: ["chashui_chouren_round"],
	subSkill: {
		round: {
			audio: false,
			charlotte: true,
			trigger: { global: "roundEnd" },
			filter(event, player) {
				if (!player.isDamaged()) return false;
				const pile = player.getExpansions("chashui_huize");
				if (!pile.length) return false;
				// 体力值唯一最多的角色
				const maxHp = Math.max(...game.filterPlayer().map((current) => current.hp));
				const list = game.filterPlayer((current) => current.hp == maxHp);
				return list.length == 1 && list[0].isIn();
			},
			async content(event, trigger, player) {
				const maxHp = Math.max(...game.filterPlayer().map((current) => current.hp));
				const list = game.filterPlayer((current) => current.hp == maxHp);
				if (list.length != 1) return;
				const from = list[0];
				const agree = await from
					.chooseBool("筹刃：是否令" + get.translation(player) + "回复1点体力，然后用一张牌替换一张“泽”？")
					.set("ai", () => get.attitude(from, player) > 0)
					.forResult();
				if (!agree?.bool) return;
				player.logSkill("chashui_chouren", from);
				await player.recover();
				if (!player.isIn() || !from.isIn()) return;
				const pile = player.getExpansions("chashui_huize");
				if (!pile.length) return;
				// 选一张「泽」
				const ze = await player
					.chooseButton(["筹刃：选择一张“泽”被替换", pile], true)
					.set("ai", (button) => -get.value(button.link))
					.forResult();
				if (!ze?.bool || !ze.links?.length) return;
				const oldCard = ze.links[0];
				// 选其一张牌
				if (!from.countCards("he")) return;
				const pick = await from
					.chooseCard("he", "筹刃：选择一张牌替换" + get.translation(player) + "的一张“泽”", true)
					.set("ai", (card) => 4 - get.value(card))
					.forResult();
				if (!pick?.bool || !pick.cards?.length) return;
				const newCard = pick.cards[0];
				// 替换：取出旧牌 → 用新牌填到原位置
				const newPile = player.getExpansions("chashui_huize").slice(0);
				const index = newPile.indexOf(oldCard);
				if (index < 0) return;
				await from.lose(newCard, ui.special, "toExpansion");
				newPile[index] = newCard;
				await lib.rewriteExpansion(player, "chashui_huize", newPile);
				// 被替换下来的旧「泽」要交给 from（原型 chouren.lua:144
				// `room:obtainCard(from, ret, false, fk.ReasonJustMove)`）。
				// 只重写 expansions 是不够的：$addToExpansion 第 4 参 check=false 只做
				// insertBefore（player.js:8111-8128），不会清理旧节点 ⇒ 旧泽牌永久留在
				// node.expansions 里，getExpansions 变成 6 张、"泽" 判据全部失真。
				await from.gain(oldCard, "gain2");
			},
		},
	},
};

/**
 * 勋德（司马孚）
 *
 * 描述：当你的手牌数发生变化后，你可以令一名手牌数等于你的角色摸一张牌，
 *       若该角色为你，则此技能本回合失效。
 *
 * Lua（xunde.lua:5-49）：
 *   `AfterCardsMove` 判自己手牌增减（:9-19）→ 选一名**手牌数等于你**的存活角色（:23-32，含自己）
 *   → 若选自己：打 `@@xunde_prohibit-turn` 标记 + `invalidateSkill(name, "-turn")`（:41-44）
 *   → 其摸一张（:45）
 *
 * 无名杀：
 *   入口用获得/失去全家桶；「本回合失效」用 `disableSkill` + 独立载体 `onremove` 里
 *   `enableSkill`（tempBanSkill 只写 storage，不会摘技能、不会让描述变灰，别用）
 */
const chashui_xunde = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: {
		player: ["gainAfter", "loseAfter"],
		global: ["loseAsyncAfter", "equipAfter"],
	},
	filter(event, player) {
		// 手牌数确有变化
		let changed = false;
		if (event.name == "gain" || event.name == "loseAsync" || event.name == "equip") {
			if (event.getg?.(player)?.hs?.length) changed = true;
		}
		if (event.name == "lose" || event.name == "loseAsync") {
			if (event.getl?.(player)?.hs?.length) changed = true;
		}
		if (!changed) return false;
		// 得有手牌数等于自己的角色
		const num = player.countCards("h");
		return game.hasPlayer((current) => current.isIn() && current.countCards("h") == num);
	},
	async content(event, trigger, player) {
		const num = player.countCards("h");
		const target = await player
			.chooseTarget(
				get.prompt("chashui_xunde"),
				"令一名手牌数等于你的角色摸一张牌，若为你，此技能本回合失效",
				(card, player2, t) => t.isIn() && t.countCards("h") == num
			)
			.set("ai", (t) => (t == player ? -1 : get.attitude(player, t)))
			.forResult();
		if (!target?.bool || !target.targets?.length) return;
		const to = target.targets[0];
		player.logSkill("chashui_xunde", to);
		// 选自己 → 本回合失效。用 disableSkill + 独立载体，引擎才会把技能描述变灰；
		// tempBanSkill 只写 storage.temp_ban_*，既不摘技能也不影响技能栏灰度。
		if (to == player) {
			player.disableSkill("chashui_xunde_disabled", "chashui_xunde");
			player.addTempSkill("chashui_xunde_disabled", { player: "phaseAfter" });
		}
		await to.draw();
	},
	subSkill: {
		disabled: {
			charlotte: true,
			sub: true,
			onremove(player) {
				player.enableSkill("chashui_xunde_disabled");
			},
		},
	},
	ai: {
		threaten: 1.1,
	},
};

/**
 * 礼葬（司马孚）
 *
 * 描述：每个回合的结束阶段，若本回合内有角色进入过濒死状态，你可与当前回合角色依次弃牌，
 *       直至以此法弃置的牌达到四种花色或一方失去最后一张手牌。
 *
 * Lua（lizang.lua:5-67）：
 *   `EnterDying` 时打 `tea__lizang_canuse-turn` 标记（:57-64）
 *   `EventPhaseStart` + `target.phase == Finish` 且标记在、当前回合角色不空手（:8-9）
 *   → **当前回合角色先弃**，然后你弃，交替（:14-53），直到：
 *     四种花色齐（`#suits >= 4`）/ 一方手牌空 / 一方无可弃牌（:15,34）
 *
 * 无名杀：
 *   `hasGlobalHistory("everything", e => e.name === "dying")`（取证推荐，`dclinghai` 同款）
 *   弃牌交替用 while + `chooseToDiscard`（`include_equip`：Lua 用 include_equip=true）
 */
const chashui_lizang = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { global: "phaseJieshuBegin" },
	filter(event, player) {
		const current = _status.currentPhase;
		if (!current || current.isDead()) return false;
		if (current == player) return false;
		// 本回合有角色进入过濒死
		if (!game.hasGlobalHistory("everything", (evt) => evt.name === "dying")) return false;
		// 只要求当前回合角色不空（Lua 同款；司马孚空场也可进入，轮到自己时自然终止）
		return current.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		const current = _status.currentPhase;
		if (!current || !current.isIn() || !player.isIn()) return;
		player.logSkill("chashui_lizang", current);
		const suits = [];
		let turn = current; // 当前回合角色先弃
		let idle = 0; // 连续「无牌可弃/取消」计数：双方都连续推让则结束
		let guard = 0;
		while (guard++ < 50 && player.isIn() && current.isIn() && suits.length < 4 && idle < 2) {
			if (!turn.countCards("he")) {
				idle++;
				turn = turn == current ? player : current;
				continue;
			}
			const handBefore = turn.countCards("h");
			const result = await turn
				.chooseToDiscard("he", "礼葬：弃置一张牌", 1)
				.set("ai", (card) => 4 - get.value(card))
				.forResult();
			if (!result?.bool || !result.cards?.length) {
				// 取消 = 跳过该方、换对方继续（Lua skip=true；旧版直接整段结束）
				idle++;
				turn = turn == current ? player : current;
				continue;
			}
			idle = 0;
			const card = result.cards[0];
			const suit = get.suit(card);
			if (!suits.includes(suit)) suits.push(suit);
			// 「失去最后一张手牌」：这次弃的**是手牌**且弃后手牌为 0
			// （chooseToDiscard 已自动弃置，不要再 discard 一次；弃装备不算失去手牌）
			const fromHand = turn.countCards("h") == handBefore - 1;
			if (fromHand && turn.countCards("h") == 0) break;
			// 交替
			turn = turn == current ? player : current;
		}
	},
	ai: {
		expose: 0.2,
	},
};

/**
 * 连舫（王濬）
 *
 * 描述：准备阶段，你可以令至多X+1名角色同时选择一张牌重铸，然后你获得其中一种类别的牌
 *       （X为你装备区牌数）。
 *
 * Lua（lianfang.lua:5-88）：
 *   `EventPhaseStart` + `player.phase == Start`（:9）
 *   → 选至多 `装备数+1` 名不空角色（:13-23）
 *   → 这些人**同时**各选一张（`Request:new(targets,"AskForUseActiveSkill")`，:41-46）
 *      → 各**随机**取一张重铸（:48-58，`table.random(...)`）
 *   → 统计重铸牌里出现过的类别（basic/trick/equip，:60-75）
 *   → 你选一个类别，获得该类别**全部**这些牌（:76-83）
 *
 * 无名杀：
 *   多人同时选牌用 `chooseCardOL`（取证：result 是**数组**，按下标配 list，content.js:6977；
 *   原生 yizheng huicui.js:2518）。本地是逐个询问（非真并行），可接受。
 */
const chashui_lianfang = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		return game.hasPlayer((current) => current.isIn() && current.countCards("h") > 0);
	},
	async content(event, trigger, player) {
		const max = player.countCards("e") + 1;
		const targets = await player
			.chooseTarget(
				get.prompt("chashui_lianfang"),
				"令至多" + get.cnNumber(max) + "名角色同时选择一张牌重铸",
				[1, max],
				(card, player2, t) => t.isIn() && t.countCards("h") > 0
			)
			.set("ai", (t) => get.attitude(player, t))
			.forResult();
		if (!targets?.bool || !targets.targets?.length) return;
		const list = targets.targets.slice(0);
		player.logSkill("chashui_lianfang", list);
		// 同时各选一张（chooseCardOL，result 是数组）
		const result = await player
			.chooseCardOL(list, "连舫：选择一张牌重铸", true)
			.set(
				"ai",
				(card) => 6 - get.value(card)
			)
			.forResult();
		const recastCards = [];
		for (let i = 0; i < list.length; i++) {
			const res = result?.[i];
			const target = list[i];
			if (!res?.cards?.length || !target.isIn()) continue;
			const card = res.cards[0];
			recastCards.push(card);
			await target.recast(card);
		}
		if (!recastCards.length) return;
		// 统计类别
		const types = [];
		for (const card of recastCards) {
			const type = get.type2(card);
			if (!types.includes(type)) types.push(type);
		}
		if (!types.length) return;
		// 选一个类别，获得该类别的全部牌
		let type = types[0];
		if (types.length > 1) {
			const choice = await player
				.chooseControl(types)
				.set("prompt", "连舫：选择一个类别，获得该类别的所有牌")
				.set("ai", () => {
					// 选张数最多的
					const count = {};
					for (const card of recastCards) {
						const t = get.type2(card);
						count[t] = (count[t] || 0) + 1;
					}
					types.sort((a, b) => (count[b] || 0) - (count[a] || 0));
					return types[0];
				})
				.forResult();
			// 右键取消 = 放弃获得（旧版取消后 type 仍是 types[0] ⇒ 取消也能拿牌）
			if (!choice?.control) return;
			type = choice.control;
		}
		const gains = recastCards.filter((card) => get.type2(card) == type);
		if (gains.length) await player.gain(gains, "gain2");
	},
	ai: {
		threaten: 1.1,
	},
};

/**
 * 燃江（王濬）
 *
 * 描述：你可以将装备区一张牌当火【杀】使用（无距离与次数限制），结算结束后，若未造成伤害，
 *       此技能本回合失效。你使用的火【杀】至多指定X名角色为目标（X为你装备区牌数）。
 *
 * Lua（ranjiang.lua:5-56）：
 *   ① viewas：`card_filter` 限装备区（:9-12）→ `view_as` 火杀（:13-21）
 *      `enabled_at_play`/`enabled_at_response`：`@@tea__ranjiang_prohibit-turn == 0`（:22-27）
 *   ② targetmod：`bypass_distances` + `bypass_times` **只对本技能印的牌**（:31-36）
 *      `extra_target_func`：`card.name == "fire__slash"` 时额外目标数 = `max(装备数-1, 0)`
 *      ——**对所有火杀生效**，不只本技能印的（:37-41）
 *   ③ 未造成伤害 → `@@tea__ranjiang_prohibit-turn` 本回合失效（:44-52）
 *
 * 无名杀（R2：同一技能对象不能两套 filter/content → 拆主技能 + subSkill）：
 *   ① 主技能：`enable:["chooseToUse","chooseToRespond"]` + `viewAs`（转化，`filterCard` 限装备区）
 *      `selectTarget` 动态上限 = 装备区牌数；`precontent` 打 `nodistance`/`addCount:false`
 *   ② 无距离次数只对本技能印的牌生效 → `mod.cardUsable` 判牌上的 storage 标记
 *      ⚠️ 不能用 `mod.cardUsable → Infinity` 无条件放开（会连真牌都无限）
 *   ③ 未造成伤害 → `useCardAfter` 判「本技能印的火杀且 sourceDamage 历史里没有这张牌」→ `tempBanSkill`
 *      因为主技能已有 content（viewAs 兜底），失效判定必须放 subSkill（R2）
 */
const chashui_ranjiang = {
	audio: 2,
	// 描述是「将装备区一张牌当火【杀】**使用**」——没有「打出」，所以不写 chooseToRespond。
	// （打出窗 = 南蛮/决斗要【杀】、万箭要【闪】；把使用技塞进去会让它在这些窗口冒按钮。）
	enable: "chooseToUse",
	filterCard(card, player) {
		return get.position(card) == "e";
	},
	position: "e",
	selectCard: 1,
	viewAs: { name: "sha", nature: "fire", isCard: true },
	filterTarget(card, player, target) {
		// 无距离限制：第三参 false 忽略距离（选目标阶段就要放开，precontent 在选目标之后跑不到）
		return player.canUse(card, target, false);
	},
	precontent(event, trigger, player) {
		// 无次数：经 useResult 的 _apply_args 通道传给 useCard（player.js:7365-7368），不占【杀】次数
		event.result._apply_args = { addCount: false };
		// 本技能印的火杀打上标记，供 mod.cardUsable 与 _miss 判定
		const vcard = event.result.card;
		if (vcard) vcard.storage = { ...(vcard.storage || {}), chashui_ranjiang: true };
	},
	// viewAs 技能被 useSkill 路由兜底（坑-清单:33）
	content() {},
	mod: {
		cardUsable(card, player, num) {
			if (card?.storage?.chashui_ranjiang) return Infinity;
		},
		selectTarget(card, player, range) {
			// 描述「你使用的火【杀】至多指定X名角色为目标」是**泛指**，不只本技能印的牌
			// （原型 ranjiang.lua:37-41 的 extra_target_func 判的就是 `card.name == "fire__slash"`）。
			// 写在本技能对象上的 selectTarget 只对本技能的转化牌生效，故改用 mod 钩子。
			if (get.name(card) != "sha" || !game.hasNature(card, "fire")) return;
			if (range[1] == -1) return;
			range[1] = Math.max(range[1], player.countCards("e"));
		},
	},
	ai: {
		order: 6,
		skillTagFilter(player, tag, arg) {
			// 只能「使用」不能「打出」：hasSha(respond) 会把 respond 作为 arg 传进来
			// （player.js:13517 `hasSkillTag("respondSha", true, respond, true)`），
			// 原生「只使用不打出」的技能都是这么否掉的（clan.js:4234、collab.js:2505 等）。
			if (arg === "respond") return false;
			return player.countCards("e") > 0;
		},
		respondSha: true,
	},
	subSkill: {
		miss: {
			audio: false,
			charlotte: true,
			forced: true,
			popup: false,
			silent: true,
			trigger: { player: "useCardAfter" },
			filter(event, player) {
				if (event.card?.name != "sha" || !game.hasNature(event.card, "fire")) return false;
				if (event.skill != "chashui_ranjiang") return false;
				// 未造成伤害：查 sourceDamage 历史（原生 mobile.js:1807 同款）
				return !player.hasHistory("sourceDamage", (evt) => evt.card === event.card);
			},
			async content(event, trigger, player) {
				// 「此技能本回合失效」：disableSkill 才会让技能描述变灰（tempBanSkill 不会）
				player.disableSkill("chashui_ranjiang_disabled", "chashui_ranjiang");
				player.addTempSkill("chashui_ranjiang_disabled", { player: "phaseAfter" });
			},
		},
		disabled: {
			charlotte: true,
			sub: true,
			onremove(player) {
				player.enableSkill("chashui_ranjiang_disabled");
			},
		},
	},
	group: ["chashui_ranjiang_miss"],
};

// ==================== 茶水贤设·晌（tea_ex_b） ====================

/**
 * 躁兵（曹洪）
 *
 * 描述：当你成为过锦囊牌目标的回合结束时，你可视为对当前回合角色使用一张无距离限制的【杀】。
 *       若此【杀】未对其造成伤害，其可弃置你两张牌。
 *
 * Lua（zaobing.lua:5-74）：
 *   ① `TurnEnd`：本回合「有锦囊牌以自己为目标」（`getEventsOfScope(UseCard, …, HistoryTurn)`）
 *      且能对 current 用杀（`bypass_distances`）→ 用杀，`extra_data.is_zaobing = {from, to}`
 *   ② `CardUseFinished`：若该杀 `damageDealt[to] == 0` → 由 **to（被杀的当前回合角色）**
 *      决定是否弃 from 两张牌（:53-68）
 *
 * 无名杀：
 *   ① `phaseEnd` 必须挂 **global**：`lib.filter.filterTrigger`（index.js:10812-10814）对 `trigger.player`
 *      要求 `player === event.player`，而 phaseEnd 派发在 phase 事件上、`event.player` 是**当前回合角色**，
 *      写 `player:` 就只在自己回合结束才发动（原型是 fk.TurnEnd，任意回合结束）。
 *   ② 伤害判据：`player.hasHistory("sourceDamage", evt => evt.card === trigger.card)`
 *      （`damage()` 会 `next.card = event.card`，player.js:8668-8670；content.js:11239 入史）
 */
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_zaobingPlan = defineSkill({
	id: "chashui_zaobing",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { global: "phaseEnd" },
	filter(event, player) {
		const current = event.player;
		if (!current || current.isDead() || current == player) return false;
		// 本回合有锦囊牌以自己为目标
		const hit = game.getGlobalHistory(
			"useCard",
			(evt) => evt.targets?.includes(player) && evt.card && get.type2(evt.card) == "trick"
		);
		if (!hit.length) return false;
		const vcard = { name: "sha", isCard: true };
		return player.canUse(vcard, current, false);
	},
	async content(event, trigger, player) {
		const current = trigger.player;
		if (!current || current.isDead()) return;
		player.logSkill("chashui_zaobing", current);
		const vcard = { name: "sha", isCard: true, storage: { chashui_zaobing: true } };
		await player.useCard(vcard, [], current);
	},
	check(event, player) {
		// 这是「对当前回合角色补一刀」，只该对敌人用
		return get.attitude(player, event.player) < 0;
	},
	ai: {
		threaten: 1.2,
	},
	group: ["back"],
	sub: {
		back: {
		audio: false,
		charlotte: true,
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			if (!event.card?.storage?.chashui_zaobing) return false;
			const target = event.targets?.[0];
			if (!target || !target.isIn()) return false;
			// 未对目标造成伤害：查 sourceDamage 历史（原生 mobile.js:1807 同款）
			return !player.hasHistory("sourceDamage", (evt) => evt.card === event.card);
		},
		async content(event, trigger, player) {
			const target = trigger.targets[0];
			const agree = await target
				.chooseBool("躁兵：是否弃置" + get.translation(player) + "两张牌？")
				.set("ai", () => get.attitude(target, player) < 0)
				.forResult();
			if (!agree?.bool) return;
			// 技能激活已在主 content logSkill 过，这里不再重复弹（同一次流程）
			// 弃置 from（曹洪）的牌，由 target 操作。
			// ⚠️ `player.discardPlayerCard(target, …)` 是「player 选 target 的牌」，选择权在调用者；
			// content.discardPlayerCard（content.js:7973/8142/8174）全程用 `event.player` 开窗、收按钮，
			// `target` 只是被弃置对象。原型 zaobing.lua:53-68 是 `askToChooseCards(to, {target = from})`
			// —— 由 to（被杀的当前回合角色）挑 from（曹洪）的牌，所以调用者必须是 target、被弃者必须是 player。
			const count = Math.min(2, player.countCards("he"));
			if (count <= 0) return;
			const result = await target
				.discardPlayerCard(player, "he", count, true)
				.set("ai", (button) => get.buttonValue(button))
				.forResult();
			if (result?.bool) game.log(target, "弃置了", player, "的牌");
		},
		},
	},
});
const chashui_zaobing = chashui_zaobingPlan.skills.chashui_zaobing;
const chashui_zaobing_back = chashui_zaobingPlan.skills.chashui_zaobing_back;

/** 躁兵的后续：杀未造成伤害 → 目标可弃置你两张牌 */


/**
 * 援搏（曹洪）
 *
 * 描述：当一名其他角色使用【杀】指定你攻击范围的角色为目标后，你可以令目标角色选择弃置至多两张牌
 *       并摸等量张牌，若其因此弃置了装备牌，则此【杀】对其无效，且此【杀】使用者视为对你使用一张【决斗】。
 *
 * Lua（yuanbo.lua:5-64）：
 *   `TargetConfirmed`（成为目标后）：`data.from ~= player` 且 `card.trueName == "slash"`
 *   且 `player:inMyAttackRange(target)` → **目标**弃至多2张（含装备）→ 摸等量
 *   → 若弃了装备：`data.use.nullifiedTargets` 加目标（此杀对其无效）
 *     + `from` 视为对 player 用【决斗】（:40-58）
 *
 * 无名杀：
 *   入口 `useCardToTargeted`（成为目标后，content.js:9418 的 useCardToTarget）——
 *     注意 docs 提示：要改结算必须用 `useCardToTarget`（Targeted 已晚）
 *   「此杀对其无效」用 `trigger.targets.remove(target)` + `triggeredTargets2` 同步
 *   ⚠️ `chooseToDiscard` **默认已经弃置**（content.js:5469-5477），不要再 `target.discard()` 一次
 */
const chashui_yuanbo = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { global: "useCardToTarget" },
	filter(event, player) {
		if (event.player == player) return false;
		if (event.card?.name != "sha") return false;
		const target = event.target;
		if (!target || !target.isIn()) return false;
		// 目标在曹洪攻击范围内
		return player.inRange(target) && target.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		const target = trigger.target;
		const source = trigger.player;
		if (!target?.isIn()) return;
		player.logSkill("chashui_yuanbo", target);
		const result = await target
			// 原型 askToDiscard min1/max2 cancelable=false：曹洪发动后目标必须弃 1-2 张
			.chooseToDiscard("he", "援搏：弃置一至两张牌并摸等量张牌", [1, 2], true)
			.set("ai", (card) => {
				// 目标视角：队友配合（弃装备 → 此杀无效，还能摸等量张牌）；敌人不配合，尽量避开装备
				const equip = get.type(card) == "equip";
				const friendly = get.attitude(target, player) > 0;
				if (friendly && equip) return 8 - get.value(card) * 0.1;
				if (!friendly && equip && target.countCards("he", (item) => get.type(item) != "equip") > 0) return -1;
				return 1 - get.value(card) * 0.1;
			})
			.forResult();
		if (!result?.bool || !result.cards?.length) return;
		// chooseToDiscard 默认已弃置（content.js:5469-5477），不要再 discard 一次
		const cards = result.cards.slice(0);
		await target.draw(cards.length);
		// 弃置了装备牌 → 此杀对其无效 + 使用者视为对曹洪用【决斗】
		if (!cards.some((card) => get.type(card) == "equip")) return;
		// 此杀对其无效：从 targets 移除
		if (Array.isArray(trigger.targets)) trigger.targets.remove(target);
		const parent = trigger.getParent?.();
		if (parent && Array.isArray(parent.triggeredTargets2)) parent.triggeredTargets2.remove(target);
		game.log(trigger.card, "对", target, "无效");
		// 使用者视为对曹洪用【决斗】
		if (!source.isIn() || !player.isIn()) return;
		const vcard = { name: "juedou", isCard: true };
		if (!source.canUse(vcard, player)) return;
		await source.useCard(vcard, [], player);
	},
	check(event, player) {
		// 只保护友方：替敌人挡【杀】没意义；且事后自己可能要吃一次【决斗】，残血时不硬接
		if (get.attitude(player, event.target) <= 0) return false;
		return player.hp > 1 || player.countCards("h") > 1;
	},
	ai: {
		threaten: 1.2,
	},
};

/**
 * 篇翩（应玚）
 *
 * 描述：你可以将两张点数相邻的牌当任意基本牌使用；若转化牌名与上次不同，你摸一张牌；
 *       若转化底牌与上次仍构成相邻点数，你回复1点体力。
 *
 * Lua（pianpian.lua:19-141）：
 *   ① viewas：`pattern = ".|.|.|.|.|basic"`，两张牌，`card_filter` 要求点数相邻
 *      （珏决明置牌可用「场上缺失点数」当万能点数，:38-58）
 *   ② `before_use`：比较本次牌名/点数与 `@tea__pianpian_record`
 *      - 牌名不同 → 摸1（:116-120）
 *      - 点数差 == 4 → 回复1（:124-131）
 *      - 然后记录本次 `{num1, num2, name}`（:133）
 *
 * 无名杀：
 *   ① `viewAs`（chooseButton 运行时牌面，因为「任意基本牌」）+ `filterCard` 相邻
 *   ② `precontent` 里比较 storage 并摸牌/回复
 */
const chashui_pianpian = {
	audio: 2,
	// 描述只说「使用」；原型 enabled_at_response 明确禁打出（响应窗不接）
	enable: "chooseToUse",
	hiddenCard(player, name) {
		if (get.type(name) != "basic") return false;
		// 至少有一对相邻点数的牌
		return lib.skill.chashui_pianpian.hasAdjacent(player);
	},
	hasAdjacent(player) {
		// 传 player 让 get.number 走 cardnumber mod —— 珏决的明置牌由此被当成「场上缺失的某个点数」参与配对
		const nums = player.getCards("h").map((card) => get.number(card, player)).filter((num) => typeof num == "number");
		if (nums.length < 2) return false;
		const sorted = nums.slice(0).sort((a, b) => a - b);
		for (let i = 1; i < sorted.length; i++) {
			if (sorted[i] - sorted[i - 1] == 1) return true;
		}
		return false;
	},
	/** 两张牌点数是否相邻（差 1）；珏决牌按 mod 后的点数算 */
	isAdjacentPair(a, b, player) {
		const num = get.number(a, player);
		const other = get.number(b, player);
		if (typeof num != "number" || typeof other != "number") return false;
		return Math.abs(num - other) == 1;
	},
	filter(event, player) {
		if (event.skill == "chashui_pianpian" || event._skill == "chashui_pianpian") return true;
		if (!lib.skill.chashui_pianpian.hasAdjacent(player)) return false;
		// 探测：任意基本牌能否用
		return get.inpileVCardList((info) => {
			return info[0] == "basic" && event.filterCard({ name: info[2], nature: info[3], isCard: true }, player, event);
		}).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			const list = get.inpileVCardList((info) => {
				return info[0] == "basic" && event.filterCard({ name: info[2], nature: info[3], isCard: true }, player, event);
			});
			if (!list.length) return ui.create.dialog("篇翩：没有可视为使用的基本牌");
			return ui.create.dialog("篇翩", [list, "vcard"]);
		},
		filter(button, player) {
			return lib.skill.chashui_pianpian.hasAdjacent(player);
		},
		check(button) {
			return get.player().getUseValue({ name: button.link[2], nature: button.link[3] }, null, true);
		},
		backup(links) {
			return {
				filterCard(card, player) {
					// 与已选牌点数相邻（珏决牌按 mod 后的点数算）
					const selected = ui.selected.cards;
					if (!selected.length) return true;
					return lib.skill.chashui_pianpian.isAdjacentPair(card, selected[0], player);
				},
				selectCard: 2,
				position: "h",
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true },
				popname: true,
				async precontent(event, trigger, player) {
					const cards = event.result?.cards || [];
					if (cards.length != 2) return;
					// 同样要传 player：否则珏决牌记下来的是原始点数，下次比较时对不上
					const nums = cards.map((card) => get.number(card, player)).sort((a, b) => a - b);
					const name = links[0][2];
					const record = player.storage.chashui_pianpian_record;
					player.logSkill("chashui_pianpian");
					if (record) {
						// 牌名与上次不同 → 摸1
						if (record.name != name) await player.draw();
						// 「仍构成相邻点数」（原型 pianpian.lua:124-131）：|Σ本次-Σ上次|==4，
						// 即两组相邻对互不重叠、四张底牌点数连续（如 3,4 → 5,6）；共享一点的 3,4→4,5 不算
						if (Math.abs(nums[0] + nums[1] - (record.nums[0] + record.nums[1])) == 4 && player.isDamaged()) {
							await player.recover();
						}
					}
					player.storage.chashui_pianpian_record = { nums, name };
				},
			};
		},
		prompt(links) {
			return "篇翩：将两张点数相邻的牌当【" + get.translation(links[0][2]) + "】使用";
		},
	},
	content() {},
	ai: {
		order: 5,
		// 只产基本牌且不再接响应窗（原型禁打出），保留 save（濒死求桃是 chooseToUse 窗）
		save: true,
		skillTagFilter(player, tag, arg) {
			return lib.skill.chashui_pianpian.hasAdjacent(player);
		},
	},
	onremove(player) {
		delete player.storage.chashui_pianpian_record;
	},
};

/**
 * 珏决（应玚）
 *
 * 描述：锁定技，结束阶段，你失去1点体力，摸一张牌并始终明置之，
 *       此牌点数视为场上没有的任意点数直至你失去此牌。
 *
 * Lua（juejue.lua:5-31）：
 *   ① `EventPhaseStart` + `phase == Finish`：失1体力 → 摸1 → 给该牌打 `@@juejue_mark-inhand`
 *   ② `visibility.card_visible`：该牌在手牌区时对所有人可见（= 明置）
 *   ③ 篇翩里用 `getNeededNumbers`（场上装备区/判定区缺失的点数）当「万能点数」
 *
 * 无名杀：
 *   ① `phaseJieshuBegin` + `loseHp(1)` + `draw()` 取 `event.result.cards`
 *   ② 明置：`player.addShownCards(cards, "visible_chashui_juejue")`
 *   ③ 「视为场上没有的任意点数」：`mod.cardnumber` 返回缺失点数里的一个（用户已确认取最优即可）
 */
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_juejuePlan = defineSkill({
	id: "chashui_juejue",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	trigger: { player: "phaseJieshuBegin" },
	forced: true,
	locked: true,
	async content(event, trigger, player) {
		await player.loseHp();
		if (!player.isIn()) return;
		const next = player.draw();
		await next;
		const cards = next.result?.cards || [];
		if (!cards.length) return;
		// addShownCards 是 createEvent(..., false)，必须 await
		await player.addShownCards(cards, "visible_chashui_juejue");
		// chashui_juejue_num 已在 chashui_juejue 的 group 里常驻，addTempSkill 会被
		// player.js:11589 的早退吞掉（hasSkill 且非 temp）⇒ 删掉这行死代码，只留 markSkill 刷新
		player.storage.chashui_juejue_cards = cards.slice(0);
		player.markSkill("chashui_juejue_num");
		// 刚挂上 mark 时浮窗还是基础文案，这里把「视为几点」写进去
		lib.skill.chashui_juejue_num.refreshIntro(player);
	},
	onremove(player) {
		delete player.storage.chashui_juejue_cards;
	},
	ai: {
		threaten: 1.1,
	},
	group: ["num", "clear"],
	grant: ["num"], // 运行时 addSkill/addTempSkill 挂载
	sub: {
		num: {
		audio: false,
		charlotte: true,
		forced: true,
		popup: false,
		mark: true,
		marktext: "珏",
		intro: {
			name: "珏决",
			content: "你的明置牌点数视为场上缺失的任意点数。",
		},
		/** 场上装备区/判定区没有出现的点数（1~13） */
		getNeededNumbers() {
			const used = [];
			for (const current of game.filterPlayer()) {
				for (const card of current.getCards("ej")) {
					const num = get.number(card);
					if (typeof num == "number" && !used.includes(num)) used.push(num);
				}
			}
			const list = [];
			for (let num = 1; num <= 13; num++) {
				if (!used.includes(num)) list.push(num);
			}
			return list;
		},
		mod: {
			cardnumber(card, player, num) {
				const shown = player.storage.chashui_juejue_cards || [];
				if (!shown.includes(card)) return;
				const needed = lib.skill.chashui_juejue_num.getNeededNumbers();
				if (!needed.length) return;
				// ⚠ 必须返回 1~13 内的**整数**：mod 的返回值会被 game.checkMod 当成新的 num 继续传给后面的
				//    mod（game/index.js:8507-8509），而篇翩要拿 get.number 做「差 1」判断。
				//    历史上曾返回 `13 + 缺失个数 / 10` 这类浮点小数（当时想让「最有利」的点数排最后、判胜时更大），
				//    结果和真点数相减永远得不出正好 1，「珏决牌 + 相邻真点数」永远不成对 → 篇翩按钮不出现。
				return lib.skill.chashui_juejue_num.pickNumber(needed);
			},
		},
		/** 从缺失点数里挑一个：优先能被常用基本牌点数 +1/-1 贴上的那个（只从缺失集里取，保持「场上没有的点数」） */
		pickNumber(needed) {
			// 1~13 全扫一遍；先看 +1 再看 -1，尽量给「小点数牌」留出上贴空间
			for (let base = 1; base <= 13; base++) {
				if (needed.includes(base + 1)) return base + 1;
			}
			for (let base = 1; base <= 13; base++) {
				if (needed.includes(base - 1)) return base - 1;
			}
			return Math.max(...needed);
		},
		/**
		 * 把「明置牌点数可视为哪些点数」写进 mark 的 intro。
		 * ⚠ 不能写成 `intro.content(storage, player)` 函数形态：get.storageintro 调它时只传
		 *   `(content, player.storage[skill], player, uiintro, skill)`（noname/get/index.js:4911/5420），
		 *   传进去的 player 是**看浮窗的人**，不是明置牌的主人；而且 markSkill(player.markSkill(id, storage))
		 *   只会覆写 `marks[id].info = intro`（player.js:10199-10201），不会重跑 mark()，改了也刷不出来。
		 *   所以每次明置牌变化时直接改 `marks[id].info.content`，浮窗读的是现成的字符串。
		 * 调用点：chashui_juejue 摸牌后、chashui_juejue_clear 清牌后。
		 */
		refreshIntro(player) {
			const skill = "chashui_juejue_num";
			// ① 本地实时算一份，给「我」看
			const content = lib.skill.chashui_juejue_num.buildIntroText(player);
			if (!content) return;
			const mark = player.marks?.[skill];
			const attr = mark?.firstElementChild;
			if (attr) attr.info = { name: "珏决", content };
			// ② 别人的客户端拿不到我的 storage，把算好的字符串广播过去
			game.broadcastAll(
				(player2, skill2, info) => {
					const mark2 = player2.marks?.[skill2]?.firstElementChild;
					if (mark2) mark2.info = info;
				},
				player,
				skill,
				{ name: "珏决", content }
			);
		},
		/** 浮窗要显示的文案（没有明置牌时返回空串，表示不用改） */
		buildIntroText(player) {
			const shown = (player.storage.chashui_juejue_cards || []).filter((card) => get.position(card) == "h");
			if (!shown.length) return "";
			const needed = lib.skill.chashui_juejue_num.getNeededNumbers();
			const detail = shown.map((card) => get.translation(card)).join("、");
			if (!needed.length) {
				return `明置牌（${detail}）点数：场上1~13已全部出现，按牌面点数计算。`;
			}
			// 「可视为」——列出全部候选点数，不写死引擎实际取用的那一个
			return `明置牌（${detail}）点数可视为：${needed.map((num) => get.cnNumber(num)).join("、")}。`;
		},
		},
		clear: {
		audio: false,
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { player: ["loseAfter", "hideShownCardsAfter"] },
		filter(event, player) {
			const shown = player.storage.chashui_juejue_cards;
			if (!shown?.length) return false;
			// 明置牌已不在手牌
			return shown.some((card) => get.position(card) != "h");
		},
		async content(event, trigger, player) {
			const shown = player.storage.chashui_juejue_cards || [];
			const gone = shown.filter((card) => get.position(card) != "h");
			if (gone.length) await player.hideShownCards(gone, "visible_chashui_juejue");
			player.storage.chashui_juejue_cards = shown.filter((card) => get.position(card) == "h");
			if (!player.storage.chashui_juejue_cards.length) player.removeSkill("chashui_juejue_num");
			// 明置牌变了 → 浮窗里的「视为几点」也要跟着变
			lib.skill.chashui_juejue_num.refreshIntro(player);
		},
		},
	},
});
const chashui_juejue = chashui_juejuePlan.skills.chashui_juejue;
const chashui_juejue_num = chashui_juejuePlan.skills.chashui_juejue_num;
const chashui_juejue_clear = chashui_juejuePlan.skills.chashui_juejue_clear;

/** 珏决：明置牌点数视为「场上缺失的任意点数」（取最优） */


/** 珏决：失去该牌后移除明置标记 */


/**
 * 飞军（王平）
 *
 * 描述：结束阶段结束时，你可以摸三张牌并将手牌数弃置体力上限。
 *       若以此法弃置的牌数小于你的体力值，你调整此技能的发动阶段，否则你增加一点体力上限。
 *
 * Lua（feijun.lua:5-61）：
 *   ① 触发时机由 mark `tea__feijun_record` 决定：
 *      `record == 0` → 结束阶段（`Player.Finish`）触发
 *      `record == player.phase` → 在该阶段结束时触发
 *   ② 摸3 → 手牌弃至 `maxHp`（`:20-34`）
 *   ③ 若弃牌数 < 体力值 → 让玩家选一个阶段（1~6），写进 record（`:35-45`）
 *   ④ `GamePrepared` 时把展示文本重置为「结束阶段」（`:50-58`）
 *
 * 无名杀（用户已确认：**永久改变触发阶段**）：
 *   六个 `phase*End` 都监听，filter 里比对 `storage.chashui_feijun_stage`
 *   未设置时 = 结束阶段（`phaseJieshuEnd`）
 *   ★ 用户补充规则：弃牌数 **≥** 体力值时改为「增加1点体力上限」（上面 Lua 只有 < 那一支）。
 *     所以现在两支是互斥的：< 体力值 → 调阶段；≥ 体力值 → maxHp +1。
 */
// 阶段表（key 不带 End）：实现与动态描述共用同一份，避免两处硬编码漂移。
const chashuiFeijunStages = [
	["phaseZhunbei", "准备阶段"],
	["phaseJudge", "判定阶段"],
	["phaseDraw", "摸牌阶段"],
	["phaseUse", "出牌阶段"],
	["phaseDiscard", "弃牌阶段"],
	["phaseJieshu", "结束阶段"],
];
const chashuiFeijunStageName = (key) => (chashuiFeijunStages.find((info) => info[0] == key) || chashuiFeijunStages[5])[1];

const chashui_feijun = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: {
		player: ["phaseZhunbeiEnd", "phaseJudgeEnd", "phaseDrawEnd", "phaseUseEnd", "phaseDiscardEnd", "phaseJieshuEnd"],
	},
	filter(event, player, name) {
		// 时机名必须读**第 3 个参数**：引擎调用形式是 info.filter(event, player, triggerName, indexedData)
		// （lib/index.js:10837）。`event` 是**被触发的宿主事件**（phaseJieshu 等），
		// 它身上没有 triggername 属性 —— 旧写法 `event.triggername` 恒 undefined，
		// 导致三个条件全部落空、技能永远进不来（表现为「无法发动」）。
		// 另外 storage / intro 存的都是不带 End 的阶段名（"phaseJieshu"），
		// 默认值也统一成不带 End，再自己拼 "End" 比对。
		const stage = player.storage.chashui_feijun_stage || "phaseJieshu";
		return name == stage + "End";
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_feijun");
		await player.draw(3);
		if (!player.isIn()) return;
		// 手牌弃至体力上限
		const num = Math.max(player.countCards("h") - player.maxHp, 0);
		let discarded = 0;
		if (num > 0) {
			const result = await player
				.chooseToDiscard("h", "飞军：须弃置" + get.cnNumber(num) + "张手牌", num, true)
				.set("ai", (card) => 4 - get.value(card))
				.forResult();
			discarded = result?.cards?.length || 0;
		}
		if (!player.isIn()) return;
		// 弃牌数 ≥ 体力值 → 增加1点体力上限（描述新增的"否则"分支）
		if (discarded >= player.hp) {
			await player.gainMaxHp();
			return;
		}
		// 弃牌数 < 体力值 → 调整发动阶段
		const choice = await player
			.chooseControl(
				chashuiFeijunStages.map((info) => info[1])
			)
			.set("prompt", "飞军：选择调整此技能的发动阶段")
			.set("ai", () => chashuiFeijunStages[5][1])
			.forResult();
		if (!choice?.control) return;
		const found = chashuiFeijunStages.find((info) => info[1] == choice.control);
		// 阶段变了 → 描述文本跟着变（lib.dynamicTranslate.chashui_feijun），所以这里不需要 mark。
		if (found) player.storage.chashui_feijun_stage = found[0];
	},
	ai: {
		threaten: 1.1,
	},
	onremove(player) {
		delete player.storage.chashui_feijun_stage;
	},
};

/**
 * 弘粹（王崇）
 *
 * 描述：你可以将任意张牌当一张牌名字数为你以此法使用牌的牌名字数和的普通锦囊牌使用。
 *       若你以此法至少使用了两张牌，则你摸一张牌。
 *
 * Lua（hongcui.lua:5-47）：
 *   ① viewas：`pattern = ".|.|.|.|.|trick"`，任意张牌
 *   ② `view_as`：底牌**牌名字数之和**必须等于目标锦囊的字数（`:23-29`）
 *   ③ `before_use`：底牌 ≥2 张 → 摸1（`:34-38`）
 *   ④ 原型有「每回合限一次」（`:39-44`），但按设计者要求已去掉
 *
 * 无名杀：判据照 `clanchengqi`（clan.js:4180-4184）的 `filterOk` 写法，但要求**相等**
 */
const chashui_hongcui = {
	audio: 2,
	// 描述是「当…普通锦囊牌**使用**」——没有「打出」，故只开 chooseToUse。
	enable: "chooseToUse",
	hiddenCard(player, name) {
		// 普通锦囊：get.type 区分 delay（get.type2 会把延时锦囊也算成 trick）
		if (get.type(name) != "trick") return false;
		// 需要凑出该字数
		const need = get.cardNameLength(name);
		const nums = player.getCards("h").map((card) => get.cardNameLength(card));
		if (!nums.length) return false;
		// 子集和 == need（DFS，最多 10 张）
		const can = (idx, sum) => {
			if (sum == need) return true;
			if (sum > need || idx >= nums.length) return false;
			return can(idx + 1, sum + nums[idx]) || can(idx + 1, sum);
		};
		return can(0, 0);
	},
	filter(event, player) {
		if (event.skill == "chashui_hongcui" || event._skill == "chashui_hongcui") return true;
		return get.inpileVCardList((info) => {
			if (get.type(info[2]) != "trick") return false;
			if (!lib.skill.chashui_hongcui.hiddenCard(player, info[2])) return false;
			return event.filterCard({ name: info[2], nature: info[3], isCard: true }, player, event);
		}).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			const list = get.inpileVCardList((info) => {
				if (get.type(info[2]) != "trick") return false;
				if (!lib.skill.chashui_hongcui.hiddenCard(player, info[2])) return false;
				return event.filterCard({ name: info[2], nature: info[3], isCard: true }, player, event);
			});
			if (!list.length) return ui.create.dialog("弘粹：没有可转化的普通锦囊牌");
			return ui.create.dialog("弘粹：将几张牌转化成一张普通锦囊牌", [list, "vcard"]);
		},
		filter(button, player) {
			return lib.skill.chashui_hongcui.hiddenCard(player, button.link[2]);
		},
		check(button) {
			return get.player().getUseValue({ name: button.link[2], nature: button.link[3] }, null, true);
		},
		backup(links) {
			const need = get.cardNameLength(links[0][2]);
			return {
				filterCard: true,
				complexCard: true,
				selectCard: [1, Infinity],
				// 原型仅手牌（hongcui.lua getCardIds("h")）
				position: "h",
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true },
				popname: true,
				filterOk() {
					const cards = ui.selected.cards || [];
					return cards.reduce((sum, card) => sum + get.cardNameLength(card), 0) == need;
				},
				async precontent(event, trigger, player) {
					const cards = event.result?.cards || [];
					player.logSkill("chashui_hongcui");
					if (cards.length >= 2) await player.draw();
				},
			};
		},
		prompt(links) {
			return "弘粹：将字数之和为" + get.cardNameLength(links[0][2]) + "的牌当【" + get.translation(links[0][2]) + "】使用";
		},
	},
	content() {},
	ai: {
		// 只产锦囊（变不出杀/闪/桃），不配响应类标签
		order: 6,
	},
};

/**
 * 载德（王崇）
 *
 * 描述：出牌阶段，你可以重铸任意张花色/点数/类型相同的牌，然后你可以令至多等量名角色各摸一张牌，
 *       本回合你不能再以此法重铸该花色/点数/类型的牌。
 *
 * Lua（zaide.lua:5-50）：
 *   active，`card_filter` 要求所有牌在**花色/点数/类型**三者中至少一项相同（`:8-27`）
 *   → 重铸 → 可选至多等量其他角色各摸1（`:33-46`）
 *
 * 无名杀：
 *   ① 一次重铸的牌集在**所有牌上一致**的属性（花色 / 点数 / 类型2）全部记进
 *      `storage.chashui_zaide = { suit, number, type2 }`，本回合内不能再重铸带这些值的牌
 *      （多项同时相同就全部记录，全部禁用）。
 *   ② 记录挂在 `storage` 上，用 `{ global: "phaseAfter" }` 子技能清空 —— 就是「本回合」。
 */
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_zaidePlan = defineSkill({
	id: "chashui_zaide",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	enable: "phaseUse",
	mark: true,
	marktext: "德",
	init(player) {
		if (!player.storage.chashui_zaide) player.storage.chashui_zaide = { suit: [], number: [], type2: [] };
	},
	intro: {
		name: "载德",
		content(storage) {
			const frozen = lib.chashuiZaideList(storage);
			if (!frozen.length) return "本回合尚未重铸过牌。";
			return "本回合已重铸过的牌：<br>" + frozen.join("、") + "<br>这些牌不能再以此法重铸。";
		},
	},
	filter(event, player) {
		if (!player.countCards("he")) return false;
		return player.countCards("he", (card) => !lib.chashuiZaideBanned(player, card)) > 0;
	},
	async content(event, trigger, player) {
		// 与原型 zaide.lua 的 card_filter 完全对齐（:8-27）：
		//   选第 1 张 → 任意；选第 2 张 → 与第 1 张在 点数/花色/类型 中至少一项相同；
		//   选第 3 张起 → 由**前两张**决定「共同属性」（优先级 点数 > 花色 > 类型），后续牌必须共享它。
		// 这样牌集的共同属性一定存在且唯一，冻结才有确定的值可记（旧版 filterCard 用「与每一张各有一项相同」，
		// 三张牌可以两两相连却无共同属性 → 冻结集为空 → 「本回合不能再重铸」永不生效）。
		const zaideFilterCard = (card) => {
			if (lib.chashuiZaideBanned(player, card)) return false;
			const selected = ui.selected.cards;
			if (!selected.length) return true;
			if (selected.length == 1) return Boolean(lib.chashuiZaideCommon(selected[0], card));
			const common = lib.chashuiZaideCommon(selected[0], selected[1]);
			if (!common) return false;
			return lib.chashuiZaideGet(common[0], card) == common[1];
		};
		// 选牌界面只在「可选状态变化」时调 filterCard，已选中的牌不会被重新剔除
		// （game/check.js:106-122 只对每张牌算 selectable，ui/click/index.js:2588-2607 只 toggle class），
		// 所以点确定时用 filterOk 再整体校验一次，不满足就不给「确定」按钮。
		const zaideFilterOk = () => {
			const selected = ui.selected.cards;
			if (selected.length < 1) return false;
			if (selected.length == 1) return true;
			const common = lib.chashuiZaideCommon(selected[0], selected[1]);
			if (!common) return false;
			return selected.every((one) => lib.chashuiZaideGet(common[0], one) == common[1]);
		};
		const result = await player
			.chooseCard("he", "载德：重铸任意张花色/点数/类型相同的牌", [1, Infinity], zaideFilterCard)
			.set("filterOk", zaideFilterOk)
			.set("ai", (card) => 5 - get.value(card))
			.forResult();
		if (!result?.bool || !result.cards?.length) return;
		const cards = result.cards.slice(0);
		player.logSkill("chashui_zaide");
		lib.chashuiZaideFreeze(player, cards);
		await player.recast(cards);
		// 可令至多等量名角色各摸一张（不限「其他角色」，也可以是自己）
		const num = cards.length;
		const target = await player
			.chooseTarget("载德：令至多" + get.cnNumber(num) + "名角色各摸一张牌", [1, num], (card, player2, t) => t.isIn())
			.set("ai", (t) => (t == player ? 1 : get.attitude(player, t)))
			.forResult();
		if (!target?.bool || !target.targets?.length) return;
		await game.asyncDraw(target.targets);
	},
	ai: {
		order: 4,
		result: { player: 1 },
	},
	group: ["clear"],
	sub: {
		clear: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { global: "phaseAfter" },
		filter(event, player) {
			const frozen = player.storage.chashui_zaide;
			return Boolean(frozen && (frozen.suit?.length || frozen.number?.length || frozen.type2?.length));
		},
		async content(event, trigger, player) {
			player.unmarkSkill("chashui_zaide", true);
			delete player.storage.chashui_zaide;
			player.markSkill("chashui_zaide", true);
		},
		},
	},
});
const chashui_zaide = chashui_zaidePlan.skills.chashui_zaide;
const chashui_zaide_clear = chashui_zaidePlan.skills.chashui_zaide_clear;

/**
 * 载德：取两张牌的「共同属性」→ [键, 值]，无共同属性返回 null
 * 优先级 点数 > 花色 > 类型2，与原型 zaide.lua:8-27 的 if/elseif 顺序一致。
 */
const chashuiZaideCommon = (a, b) => {
	if (get.number(a) == get.number(b)) return ["number", get.number(a)];
	if (get.suit(a) == get.suit(b)) return ["suit", get.suit(a)];
	if (get.type2(a) == get.type2(b)) return ["type2", get.type2(a)];
	return null;
};

/** 载德：按属性键取值 */
const chashuiZaideGet = (key, card) => {
	if (key == "number") return get.number(card);
	if (key == "suit") return get.suit(card);
	return get.type2(card);
};

/**
 * 载德：记录冻结属性
 * 牌集的共同属性由**前两张**决定（与 card_filter 同一套规则），所以只要选了两张以上，
 * 冻结项必然存在且唯一；只选一张时没有「该花色/点数/类型」，不冻结。
 */
const chashuiZaideFreeze = (player, cards) => {
	if (!player.storage.chashui_zaide) player.storage.chashui_zaide = { suit: [], number: [], type2: [] };
	const frozen = player.storage.chashui_zaide;
	if (cards.length < 2) return;
	const common = chashuiZaideCommon(cards[0], cards[1]);
	if (!common) return;
	const [key, value] = common;
	if (!frozen[key].includes(value)) frozen[key].push(value);
	player.syncStorage("chashui_zaide");
	player.markSkill("chashui_zaide");
};

/** 载德：该牌是否因为命中本回合已冻结的属性而不能选 */
const chashuiZaideBanned = (player, card) => {
	const frozen = player.storage.chashui_zaide;
	if (!frozen) return false;
	if (frozen.suit?.includes(get.suit(card, false))) return true;
	if (frozen.number?.includes(get.number(card, false))) return true;
	if (frozen.type2?.includes(get.type2(card, false))) return true;
	return false;
};

/** 载德：把冻结记录翻成可读条目（mark 说明用） */
const chashuiZaideList = (storage) => {
	const list = [];
	if (!storage) return list;
	for (const suit of storage.suit || []) list.push(get.translation(suit) + "花色");
	for (const number of storage.number || []) list.push(get.cnNumber(number) + "点");
	for (const type2 of storage.type2 || []) list.push(get.translation(type2) + "牌");
	return list;
};

/**
 * 载德：回合结束清空冻结记录
 * 用 `unmarkSkill` → 换 `_bg` → `markSkill` 把「德」字标记整个撤掉（mark 说明是空的就没必要常驻）。
 */

lib.chashuiZaideFreeze = chashuiZaideFreeze;
lib.chashuiZaideBanned = chashuiZaideBanned;
lib.chashuiZaideList = chashuiZaideList;
lib.chashuiZaideCommon = chashuiZaideCommon;
lib.chashuiZaideGet = chashuiZaideGet;

/**
 * 据正（韦曜）
 *
 * 描述：其他角色使用伤害牌时，你可以将一张与此牌类型相同牌名不同的牌置于牌堆顶，然后取消此次用牌。
 *       此回合结束时，若本回合没有角色受到伤害，你弃置X张牌并摸等量牌（X为本回合此技能发动次数）。
 *
 * Lua（juzheng.lua:5-71）：
 *   ① `CardUsing`（使用牌时）：其他角色用**伤害牌** → 弃一张「同类型、不同牌名」的牌置于牌堆顶
 *      → `data.tos = {}`（清空目标 = 取消此次用牌，:52）
 *      → 记 `@@tea__juzheng_used-turn` 标记（:51）
 *   ② `TurnEnd`：若本回合**没有伤害事件** → 弃 X 摸 X（X = 本回合发动次数，:33-36、53-66）
 *
 * 无名杀：
 *   ① `useCard`（使用牌时，可改 targets）——用 `trigger.targets.length = 0` 取消
 *   ② `phaseEnd` + `game.getGlobalHistory("everything", e => e.name === "damage")`
 */
const chashui_juzheng = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { global: "useCard" },
	filter(event, player) {
		if (event.player == player) return false;
		const card = event.card;
		if (!card || !get.tag(card, "damage")) return false;
		// 描述是「然后获得此牌」⇒ 这张伤害牌必须由实体牌构成，
		// 凭空印出来的牌（如神速/奇策）没有牌可拿，此时整技不该亮
		if (get.itemtype(event.cards) != "cards" || !event.cards.length) return false;
		// 需要一张同类型、不同牌名的牌
		return player.countCards("he", (c) => get.type2(c) == get.type2(card) && get.name(c) != get.name(card)) > 0;
	},
	async content(event, trigger, player) {
		const card = trigger.card;
		const result = await player
			.chooseToDiscard("he", "chooseonly")
			.set("prompt", get.prompt("chashui_juzheng"))
			.set("prompt2", "将一张与" + get.translation(card) + "类型相同但牌名不同的牌置于牌堆顶，然后获得此牌")
			.set("filterCard", (c) => get.type2(c) == get.type2(card) && get.name(c) != get.name(card))
			.set("ai", (c) => 6 - get.value(c))
			.forResult();
		if (!result?.bool || !result.cards?.length) return;
		const chosen = result.cards[0];
		player.logSkill("chashui_juzheng");
		// 原型 moveVisible：置顶的牌明示牌面
		await player.showCards(chosen, "据正：置于牌堆顶的牌");
		// 置于牌堆顶（原生标准写法：lose(card, ui.cardPile, "insert")）
		await player.lose(chosen, ui.cardPile, "insert");
		// 然后获得此牌（描述 m21755 由「取消此次用牌」改为「获得此牌」）。
		// 牌被拿走 ⇒ 此次用牌没有目标可结算，伤害自然不发生；两步都要做：
		//   ① `trigger.targets` 清空：`event.card` 是 useCard 里 get.autoViewAs 出来的
		//      VCard（`noname/library/element/player.js` 的 useCard 末尾），它不会因为
		//      实体牌离场而失效，不清目标照样会结算伤害；
		//   ② 真正 gain：牌此刻在处理区（position "o"），用原生同款守卫
		//      `get.position(card, true) == "o"` 后再 gain（范本 `character/collab.js:10307`
		//      dcjianxiong：`player.gain(trigger.cards, "gain2")`）。
		// 不会在结算结束时被再弃一次：useCard 收尾走 `orderingDiscard`，
		// 它只弃 `get.position(card, true) == "o"` 的牌（`content.js:2591-2595`），
		// 已进手牌的牌会被跳过。
		if (Array.isArray(trigger.targets)) trigger.targets.length = 0;
		if (get.itemtype(trigger.cards) == "cards" && trigger.cards.length) {
			const inOrdering = trigger.cards.filter((card2) => get.position(card2, true) == "o");
			if (inOrdering.length) await player.gain(inOrdering, "gain2");
		}
		// 发动次数用 countSkill（每回合 stat 口径，logSkill 自动计数）——
		// 旧版 storage 计数在结算被跳过时跨回合泄漏
		// 这里**只**靠 addTempSkill 挂载（本技能**不在** group 里）：标记「正」应当只在发动过
		// 据正的回合出现，回合结束随 tempSkill 一起消失；若同时写进 group，技能从开局就常驻，
		// `mark: true` 会让「正」从开局一直亮着并显示「本回合发动0次」。
		player.addTempSkill("chashui_juzheng_end", "phaseAfter");
		player.markSkill("chashui_juzheng_end");
	},
	ai: {
		threaten: 1.3,
	},
};

/** 据正②：回合结束时若本回合无人受伤 → 弃X摸X（X=countSkill，每回合自动归零） */
const chashui_juzheng_end = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: "chashui_juzheng",
	charlotte: true,
	mark: true,
	marktext: "正",
	intro: {
		content(storage, player) {
			return "本回合发动" + player.countSkill("chashui_juzheng") + "次。";
		},
	},
	trigger: { global: "phaseEnd" },
	filter(event, player) {
		const num = player.countSkill("chashui_juzheng");
		if (num <= 0) return false;
		// 本回合没有角色受到伤害
		if (game.getGlobalHistory("everything", (evt) => evt.name === "damage").length) return false;
		return player.countCards("he") > 0;
	},
	forced: true,
	async content(event, trigger, player) {
		const num = player.countSkill("chashui_juzheng");
		if (num <= 0) return;
		const count = Math.min(num, player.countCards("he"));
		if (count <= 0) return;
		// 这里**不能**再 logSkill("chashui_juzheng")：主技能 content 里已经记过一次，
		// countSkill 读 getStat("skill")（player.js:4949-4959）会翻倍，
		// 导致 mark 说明「本回合发动X次」每次多 1、台词二次弹出。
		const result = await player
			.chooseToDiscard("he", "据正：须弃置" + get.cnNumber(count) + "张牌，然后摸等量牌", count, true)
			.set("ai", (card) => 4 - get.value(card))
			.forResult();
		if (result?.cards?.length) await player.draw(result.cards.length);
	},
};

/**
 * 蔎酿（韦曜）
 *
 * 描述：锁定技，若你的体力值大于/小于当前游戏轮数，你手牌中的【酒】/【桃】视为【桃】/【酒】。
 *
 * Lua（sheniang.lua:5-46）：
 *   `filter.card_filter`：体力 > 轮数 → 手牌【酒】可用；体力 < 轮数 → 手牌【桃】可用
 *   `view_as`：把该牌当作【桃】/【酒】（透传花色点数，:17-28）
 *   锁定技，无次数限制
 *
 * 移植取舍：原型是 FreeKill 的 view_as（那是它唯一的转化写法），
 * 但无名杀里「锁定技…视为…」有更强的原生写法 `mod.cardname`，见下方实现注释。
 */
/**
 * 蔎酿（韦曜）
 *
 * 描述：锁定技，若你的体力值大于/小于当前游戏轮数，你手牌中的【酒】/【桃】视为【桃】/【酒】。
 *
 * 实现方式：`mod.cardname`（强制视为），**不是** viewAs 转化技。
 * 判据（用户 m21755 指出）：描述是「锁定技…视为…」⇒ 牌在手里就**是**那张牌，
 * 玩家不该看到「是否转化」的按钮，也不该能拒绝；viewAs 是「你可以将X当Y使用」的写法。
 * 原生范本 `character/shiji.js:6107-6115` 的 `xianghai`（锁定技，手牌区的装备牌均视为【酒】）
 * 就是纯 `mod.cardname`：没有 enable / viewAs / filterCard。
 *
 * `mod.cardname` 的生效面（`noname/get/index.js:3277-3285` 的 `get.name`）：
 * 只有「牌在手牌里」或「显式传了 player」时才走 `game.checkMod(..., "cardname", ...)`，
 * 而 `cardname` 全引擎只有这一个消费点（`get/index.js:3279`）⇒ 天然就是「手牌中的」，
 * 不需要自己写 `get.position(card) == "h"` 守卫，也不会污染弃牌堆/装备区里的同名牌。
 *
 * 使用次数上限自动跟着新牌名走，不需要额外 mod：
 * `player.getCardUsable`（`noname/library/element/player.js`）里 `get.info(card).usable`
 * 不带 player ⇒ 会经 `get.name` 拿到**视为后**的牌名 ⇒
 * 【酒】当【桃】时拿到【桃】的 `usable`（undefined ⇒ 无限次），
 * 【桃】当【酒】时拿到【酒】的 `usable: 1`（`card/extra.js:72`）⇒ 每回合一次。
 * 体力值恰好等于轮数时两向都不成立，牌保持原样。
 */
const chashui_sheniang = {
	audio: 2,
	// 纯 mod 技能，没有触发/发动时机 ⇒ 不写 forced（无物可强制），
	// `locked` 只负责技能栏显示「锁定技」标签（`get.is.locked` 读 info.locked）
	locked: true,
	mod: {
		cardname(card, player) {
			const round = game.roundNumber || 1;
			// 直接读 card.name（原始牌名）：不能调 get.name(card, player)，
			// 那会重新进入本 mod 造成自我递归
			if (player.hp > round && card.name == "jiu") return "tao";
			if (player.hp < round && card.name == "tao") return "jiu";
		},
	},
	ai: {
		// 锁定技没有「是否发动」的询问，但 AI 的「有没有桃可救」要算上被转化的牌，
		// 否则濒死时不会把自己手里的【酒】当【桃】用
		save: true,
		skillTagFilter(player, tag) {
			const round = game.roundNumber || 1;
			if (player.hp > round) return player.countCards("h", (card) => card.name == "jiu") > 0;
			if (player.hp < round) return player.countCards("h", (card) => card.name == "tao") > 0;
			return false;
		},
	},
};

/**
 * 焚叛（程普）
 *
 * 描述：出牌阶段限一次，你可以视为对任意名手牌数相同的角色使用一张【火攻】，
 *       若有目标角色因此死亡，你失去1点体力或弃两张牌。
 *
 * Lua（fenpan.lua:5-54）：
 *   active，`target_filter` 要求所有目标**手牌数相同**（`:10-12`）
 *   → 视为对这些人用【火攻】（`:22-30`）
 *   → 若有目标因此死亡 → 弃2张（不足则）失1体力（`:31-50`）
 *
 * 移植时踩的坑（已修）：末段的「弃2张**或**失1体力」原来是
 * `chooseToDiscard("he", prompt, 2)`——数字 2 会变成 `selectCard:[2,2]`（player.js:5875-5876），
 * 弹窗没有取消按钮，`discard.bool` 恒为 true，`loseHp()` 分支永远走不到，
 * 「或」被吃掉、玩家失去选择权。改为先 `chooseBool`（有取消按钮，content.js:7683），
 * 选弃牌才去选 2 张；取消 / 牌不足 2 张 → 失 1 点体力。
 * 注：`event.targets` 多目标使用单目标牌【火攻】是**合法**的——引擎对非 multitarget 牌
 * 会逐个目标轮流结算（content.js:9597-9600 的 num++ 与 goto(12)），不需要拆成多次 useCard。
 */
const chashui_fenpan = {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => current.isIn() && player.canUse({ name: "huogong", isCard: true }, current));
	},
	async content(event, trigger, player) {
		const vcard = { name: "huogong", isCard: true };
		const result = await player
			.chooseTarget(
				get.prompt("chashui_fenpan"),
				"视为对任意名手牌数相同的角色使用一张【火攻】",
				[1, Infinity],
				(card, player2, target) => {
					const selected = ui.selected.targets;
					if (!player2.canUse(vcard, target)) return false;
					if (!selected.length) return true;
					return target.countCards("h") == selected[0].countCards("h");
				}
			)
			// filterTarget 依赖 ui.selected.targets ⇒ 必须关掉目标缓存
			// （game/index.js:6903 useCache、:6916 filterCache 读 !event.complexTarget；game/check.js:17 对 type=="target" 的 cacheId 只由 button 决定 ⇒ 按空选择算一次就固化）
			.set("complexTarget", true)
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
		if (!result?.bool || !result.targets?.length) return;
		const targets = result.targets.slice(0);
		player.logSkill("chashui_fenpan", targets);
		await player.useCard(vcard, [], targets);
		// 有目标死亡 → 失1体力或弃2张
		// ⚠️ 「或」必须是玩家自己选：原来写 chooseToDiscard("he", prompt, 2) 是 [2,2] 必选，
		//    弹窗没有取消按钮，discard.bool 恒 true，loseHp 分支永远走不到（取消了「或」）。
		//    改成先 chooseBool（有取消按钮，content.js:7683 ui.create.confirm("oc")），
		//    选弃牌才去选牌；选取消/牌不足 2 张则失 1 点体力。
		if (!player.isIn()) return;
		// 「若有目标角色因此死亡」= 死因必须是这张【火攻】（可能被别人补刀/死于其他来源）。
		// 判据：`sourceDamage` 历史里的 damage 事件，`event.player` 是受伤者、`event.card` 是来源牌
		// （content.js:11239 `source.getHistory("sourceDamage").push(event)`）。
		const killed = targets.some(
			(target) =>
				target.isDead() &&
				player.hasHistory("sourceDamage", (evt) => evt.card === vcard && evt.player === target)
		);
		if (!killed) return;
		const canDiscard = player.countCards("he") > 1;
		if (canDiscard) {
			const go = await player
				.chooseBool("焚叛：是否弃置两张牌？（取消则失去1点体力）")
				.set("ai", () => {
					// 手上两张开外都比 1 点体力便宜时才弃
					const cards = player.getCards("h").concat(player.getCards("e"));
					if (cards.length < 2) return 0;
					const sort = cards.sort((a, b) => get.value(a) - get.value(b)).slice(0, 2);
					return get.value(sort[0]) + get.value(sort[1]) < 5 * Math.min(2, player.hp) ? 1 : 0;
				})
				.forResult();
			if (go?.bool) {
				const discard = await player
					.chooseToDiscard("he", "焚叛：弃置两张牌", 2)
					.set("ai", (card) => 4 - get.value(card))
					.forResult();
				if (discard?.bool && discard.cards?.length == 2) return;
			}
		}
		await player.loseHp();
	},
	ai: {
		order: 5,
		result: { player: 1, target: (player, target) => -get.attitude(player, target) },
	},
};

/**
 * 荡寇（程普）
 *
 * 描述：当你使用伤害类锦囊牌指定首个目标后，你可展示所有手牌。
 *       此牌结算后，若此牌造成了伤害，你摸X张牌（X为你展示牌中缺少的花色数）。
 *
 * Lua（dangkou.lua:5-37）：
 *   ① `TargetSpecified` + `firstTarget` + 伤害类锦囊 → 展示所有手牌
 *      → 记 `4 - 手牌花色数` 到 `data.extra_data.tea__dangkou`（`:10-22`）
 *   ② `CardUseFinished`：若造成伤害 → 摸该数（`:24-33`）
 *
 * 移植时踩的两个坑（已修）：
 *   ① 首个目标用 `event.target == event.targets[0]` → 错。
 *      `useCardToTargeted` 是逐目标派发的（content.js:9366-9377，next.target 是当前目标、
 *      next.targets 是全部目标），派发顺序由 getTriggerTarget 按座次排序（content.js:9390-9409），
 *      `targets[0]` 不等价于「首个」。正确字段是 `event.isFirstTarget`（引擎在第一次派发时置位，
 *      content.js:9367-9370），原生 twfenghan（tw.js:23597-23601）就是这套写法。
 *   ② 伤害判定：把本次使用的牌记下来，在 useCardAfter 里查 damage 历史 `evt.card === 这张牌`
 *      （原生范本 yijiang.js:8344、onlyOL.js:13410）。
 *   ③ 顺带：`player.showCards(...)` 是 createEvent，必须 await（R19）；
 *      手牌为空时也合法（少 4 种花色），不必展示。
 */
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_dangkouPlan = defineSkill({
	id: "chashui_dangkou",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	// 「指定首个目标后」= 引擎的 isFirstTarget（第一个被派发 useCardToTargeted 的目标）。
	// ⚠️ 不能用 `event.target == event.targets[0]`：event.targets 是全部目标，[0] 只是数组首项，
	//    引擎派发顺序由 getTriggerTarget 按座次排序决定（content.js:9390-9409），不保证是 targets[0]。
	//    原生同款（twfenghan，tw.js:23597-23601）：isFirstTarget + get.tag(card,"damage") + trick。
	trigger: { player: "useCardToTargeted" },
	filter(event, player) {
		if (!event.isFirstTarget) return false;
		if (get.type2(event.card) != "trick") return false;
		return get.tag(event.card, "damage") > 0;
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_dangkou");
		const cards = player.getCards("h");
		// 空手牌也合法（少 4 种花色），此时不必展示
		if (cards.length) await player.showCards(cards);
		const suits = cards.map((card) => get.suit(card, player)).toUniqued();
		const num = 4 - suits.length;
		player.storage.chashui_dangkou_num = num;
		// 绑定本次使用的牌：结尾用 damage 历史的 evt.card === 这张牌 确认「此牌」造成了伤害
		// （yijiang.js:8344、onlyOL.js:13410）。
		player.storage.chashui_dangkou_card = trigger.card;
		// chashui_dangkou_draw 已在 group 里常驻，addTempSkill 会被 player.js:11589 早退吞掉；
		// 它的 filter 靠 storage.chashui_dangkou_num 把关，常驻不会误触发 ⇒ 删掉这行死代码
	},
	onremove(player) {
		delete player.storage.chashui_dangkou_num;
		delete player.storage.chashui_dangkou_card;
	},
	group: ["draw"],
	sub: {
		draw: {
		audio: false,
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			const num = player.storage.chashui_dangkou_num;
			if (!num || num <= 0) return false;
			const card = player.storage.chashui_dangkou_card;
			if (!card || event.card !== card) return false;
			// 此牌造成过伤害：任一角色身上有 card 为该牌的 damage 历史
			return game.hasPlayer2((current) => current.getHistory("damage", (evt) => evt.card && evt.card === card).length > 0);
		},
		async content(event, trigger, player) {
			const num = player.storage.chashui_dangkou_num || 0;
			delete player.storage.chashui_dangkou_num;
			delete player.storage.chashui_dangkou_card;
			if (num <= 0) return;
			await player.draw(num);
		},
		},
	},
});
const chashui_dangkou = chashui_dangkouPlan.skills.chashui_dangkou;
const chashui_dangkou_draw = chashui_dangkouPlan.skills.chashui_dangkou_draw;

/** 荡寇②：此牌造成伤害 → 摸「缺少的花色数」 */


/**
 * 注经（郑玄）
 *
 * 描述：准备阶段，你可以将一张基本牌当一张非伤害类普通锦囊牌使用，直到你下回合开始，
 *       所有角色出牌阶段限一次，其可将一张此牌名的基本牌当一张此牌名的普通锦囊牌使用。
 *
 * Lua（zhujing.lua:5-91）：
 *   ① `EventPhaseStart` + `phase == Start`：用 active 选「一张基本牌 + 一个非伤害普通锦囊」
 *      → useCard → 记录 `@tea__zhujing_mark = {基本牌名, 锦囊牌名}`
 *      → **给所有存活角色**挂 `tea__zhujing_other&` + 记录 `tea__zhujing_trans`（`:33-41`）
 *   ② `TurnStart`（自己下回合开始）：清记录 + 摘掉所有人的 `_other`（`:44-59`）
 *
 * 无名杀（用户已确认可用巧筑那套 init 挂载）：
 *   `init` 里不挂（因为要「发动后」才挂），改在 content 里 `addSkill` 给所有角色；
 *   自己回合开始时统一摘除。
 */
/**
 * 「视为使用」的目标：唯一合法目标时直接用它，不弹选目标框。
 *
 * 为什么需要：原生印牌技（奇策 `reqice`，`character/refresh.js:2906-2975`）**从不手写 chooseTarget**，
 * 它只给出 `viewAs`，目标选择完全交给引擎的 `chooseToUse` 流程 —— 那个流程里目标唯一时不必点。
 * 我们手写 `chooseTarget` 就绕过了它，于是【无中生有】这种「只允许自己」（`card/standard.js:1934-1936`
 * `filterTarget: (card, player, target) => target === player`）也要多点一次自己。
 *
 * 注意 `toself` 不是答案：全引擎只有 `noname/game/index.js:8412-8413` 给**装备牌**补默认值，锦囊不吃它。
 */
const chashuiAutoTarget = async (player, vcard, prompt) => {
	const targets = game.filterPlayer((target) => player.canUse(vcard, target));
	if (!targets.length) return null;
	if (targets.length == 1) return targets;
	const result = await player
		.chooseTarget(prompt, (card, player2, target) => player2.canUse(vcard, target))
		.set("ai", (target) => get.effect(target, vcard, player, player))
		.forResult();
	return result?.bool && result.targets?.length ? result.targets : null;
};
lib.chashuiAutoTarget = chashuiAutoTarget;

const chashui_zhujing = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		// 需要一张基本牌 + 至少一个可用的非伤害普通锦囊（预检免得白弹选牌框）
		if (player.countCards("he", (card) => get.type(card) == "basic") <= 0) return false;
		return (
			get.inpileVCardList((info) => {
				const name = info[2];
				if (get.type(name) != "trick") return false;
				if (get.tag({ name }, "damage")) return false;
				return player.hasUseTarget({ name, nature: info[3], isCard: true }, false, false);
			}).length > 0
		);
	},
	async content(event, trigger, player) {
		// ① 选一张基本牌
		const basic = await player
			.chooseCard("he", get.prompt("chashui_zhujing"), "选择一张基本牌", (card) => get.type(card) == "basic")
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!basic?.bool || !basic.cards?.length) return;
		const basicCard = basic.cards[0];
		// ② 选一个非伤害普通锦囊（get.type 区分 delay，get.type2 会把延时锦囊也算 trick）
		const list = get.inpileVCardList((info) => {
			const name = info[2];
			if (get.type(name) != "trick") return false;
			if (get.tag({ name }, "damage")) return false;
			return player.hasUseTarget({ name, nature: info[3], isCard: true }, false, false);
		});
		if (!list.length) return;
		const chosen = await player
			.chooseButton(["注经：选择一张非伤害类普通锦囊牌", [list, "vcard"]], true)
			.set("ai", (button) => get.player().getUseValue({ name: button.link[2] }, null, true))
			.forResult();
		if (!chosen?.bool || !chosen.links?.length) return;
		const trickName = chosen.links[0][2];
		const trickNature = chosen.links[0][3];
		player.logSkill("chashui_zhujing");
		// ③ 使用
		const vcard = get.autoViewAs({ name: trickName, nature: trickNature, isCard: true }, [basicCard]);
		// 唯一合法目标（如【无中生有】只允许自己）直接选中，不弹框 —— 见 lib.chashuiAutoTarget 的注释
		const targets = await lib.chashuiAutoTarget(player, vcard, "注经：选择【" + get.translation(trickName) + "】的目标");
		if (!targets) return;
		await player.useCard(vcard, [basicCard], targets, "chashui_zhujing");
		// ④ 记录并给所有人挂 _other
		if (!player.isIn()) return;
		player.storage.chashui_zhujing_record = { basic: get.name(basicCard), trick: trickName };
		game.countPlayer((current) => {
			current.storage.chashui_zhujing_trans = { basic: get.name(basicCard), trick: trickName };
			current.addSkill("chashui_zhujing_other");
			// 「获得技能」的原生呈现：`addTempSkills` 就是 popup（`player.popup` 默认 className "water"＝蓝色，
			// player.js:9916）+ 一条「获得了技能 #g【X】」日志（player.js:11555-11572）。
			// 这里要按「自己下回合开始」才失效（不能用 addTempSkills 的 expire：它的 role 只按被授予者自己的时机算），
			// 所以挂载仍手写，但呈现照原生补齐。
			current.popup("chashui_zhujing_other");
		});
		game.log(player, "令所有角色获得了技能", "#g【注经】");
		// 常驻挂载、触发后自摘——addTempSkill 用自己的触发名当 expire 会在钩子派发前被移除，
		// 清理 content 永远跑不到（自检指南「addTempSkill expire 陷阱」）
		player.addSkill("chashui_zhujing_clear");
	},
	onremove(player) {
		delete player.storage.chashui_zhujing_record;
		game.countPlayer((current) => {
			delete current.storage.chashui_zhujing_trans;
			current.removeSkill("chashui_zhujing_other");
		});
	},
	ai: {
		threaten: 1.1,
	},
};

/** 注经：其他人（和自己）出牌阶段限一次，可将已记录牌名的基本牌当已记录的锦囊使用 */
const chashui_zhujing_other = {
	audio: false,
	charlotte: true,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		const trans = player.storage.chashui_zhujing_trans;
		if (!trans) return false;
		// 有该牌名的基本牌
		if (!player.countCards("he", (card) => get.name(card) == trans.basic)) return false;
		// 该锦囊可用
		return player.hasUseTarget({ name: trans.trick, isCard: true }, false, false);
	},
	async content(event, trigger, player) {
		const trans = player.storage.chashui_zhujing_trans;
		if (!trans) return;
		const basic = await player
			.chooseCard("he", "注经：选择一张" + get.translation(trans.basic), (card) => get.name(card) == trans.basic)
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!basic?.bool || !basic.cards?.length) return;
		const basicCard = basic.cards[0];
		const vcard = get.autoViewAs({ name: trans.trick, isCard: true }, [basicCard]);
		// 唯一合法目标（如【无中生有】只允许自己）直接选中，不弹框 —— 见 lib.chashuiAutoTarget 的注释
		const targets = await lib.chashuiAutoTarget(player, vcard, "注经：选择【" + get.translation(trans.trick) + "】的目标");
		if (!targets) return;
		player.logSkill("chashui_zhujing");
		await player.useCard(vcard, [basicCard], targets, "chashui_zhujing");
	},
	ai: {
		order: 4,
		result: { player: 1 },
	},
};

/** 注经：自己下回合开始时清掉所有人的 _other */
const chashui_zhujing_clear = {
	audio: false,
	charlotte: true,
	forced: true,
	// 死亡后仍要清理：否则「你下回合开始」永远不会到来，_other 会永久留在所有人身上
	forceDie: true,
	popup: false,
	silent: true,
	// `phaseBeginStart` 是**整回合**开始（content.js:4239，在 phase 事件内容里，每回合一次），不是每个阶段
	trigger: { player: ["phaseBeginStart", "dieAfter"] },
	async content(event, trigger, player) {
		game.countPlayer((current) => {
			delete current.storage.chashui_zhujing_trans;
			current.removeSkill("chashui_zhujing_other");
		});
		delete player.storage.chashui_zhujing_record;
		player.removeSkill("chashui_zhujing_clear");
	},
};

/**
 * 注我（郑玄）
 *
 * 描述：限定技，回合结束时，若你本局游戏已失去过所有牌名的基本牌，
 *       你可以展示牌堆顶六张牌，然后依次用其中的基本牌发动「注经」。
 *
 * Lua（zhuwo.lua:5-89）：
 *   ① `TurnEnd` + 限定技：`@$tea__zhuwo_record`（本局失去过的基本牌牌名集合）数量 >= 全部基本牌名数
 *   ② 展示牌堆顶 6 张 → 过滤出基本牌 → 逐张用「注经」的方式使用（:17-50）
 *   ③ `AfterCardsMove`：记录自己失去的**基本牌**牌名（:54-86）
 */
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_zhuwoPlan = defineSkill({
	id: "chashui_zhuwo",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "metal",
	// 限定技的发动条件（已失去过所有牌名的基本牌）必须看得见：
	// markSkill 在该技能没有 intro 时直接 return（player.js:10197-10202），
	// 旧版只有 :3215 的 markSkill 调用而本技能无 mark/intro ⇒ 标记永远不出现。
	mark: true,
	marktext: "我",
	intro: {
		name: "注我",
		// 角标显示进度「已失去牌名数 / 基本牌名总数」，浮窗里列具体牌名。
		// 引擎：intro.markcount 为函数时即使 storage 为空也进角标分支（player.js:4705 条件含 intro.markcount），
		// 且返回值原样写进 innerHTML（:4721-4728）⇒ 可以返回 "1/4" 这种字符串；
		// 但返回值 falsy 会把角标删掉（:4729-4731），所以 0 也要返回字符串 "0/4"。
		markcount(storage, player) {
			if (player.awakenedSkills?.includes("chashui_zhuwo")) return "";
			const record = player.storage.chashui_zhuwo_record || [];
			const all = lib.inpile.filter((name) => get.type(name) == "basic");
			const got = all.filter((name) => record.includes(name));
			return got.length + "/" + all.length;
		},
		content(storage, player) {
			if (player.awakenedSkills?.includes("chashui_zhuwo")) return "限定技，已发动。";
			const record = player.storage.chashui_zhuwo_record || [];
			const all = lib.inpile.filter((name) => get.type(name) == "basic");
			const got = all.filter((name) => record.includes(name));
			const miss = all.filter((name) => !record.includes(name));
			const list = (names) => names.map((name) => get.translation(name)).join("、");
			return (
				"限定技，回合结束时，若你本局游戏已失去过所有牌名的基本牌，你可以展示牌堆顶六张牌，" +
				"然后依次用其中的基本牌发动〖注经〗。<br>已失去的基本牌：<span class='bluetext'>" +
				(got.length ? list(got) : "无") +
				"</span><br>尚缺：" +
				(miss.length ? `<span style="color:#f04a4a">${list(miss)}</span>` : "<span class='bluetext'>无（可发动）</span>")
			);
		},
	},
	// 「回合结束时」= phaseEnd（整回合，Lua TurnEnd）；旧版提前到结束阶段开始
	trigger: { player: "phaseEnd" },
	filter(event, player) {
		const record = player.storage.chashui_zhuwo_record || [];
		const allBasic = lib.inpile.filter((name) => get.type(name) == "basic");
		return record.length >= allBasic.length;
	},
	async content(event, trigger, player) {
		player.awakenSkill("chashui_zhuwo");
		player.logSkill("chashui_zhuwo");
		// 展示牌堆顶 6 张：get.cards(6, true) 取出即放回——原型里未用的牌从未离开牌堆，
		// 旧版把它们移入 ordering 再弃置，牌堆凭空净亏
		const cards = get.cards(6, true);
		await player.showCards(cards, "注我：牌堆顶的六张牌");
		const basics = cards.filter((card) => get.type(card) == "basic");
		// 依次用其中的基本牌发动注经（用哪张，引擎从牌堆顶把它取走）
		for (const card of basics) {
			if (!player.isIn()) break;
			if (get.position(card) != "c") continue;
			const list = get.inpileVCardList((info) => {
				const name = info[2];
				// 普通锦囊：get.type 区分 delay
				if (get.type(name) != "trick") return false;
				if (get.tag({ name }, "damage")) return false;
				return player.hasUseTarget({ name, isCard: true }, false, false);
			});
			if (!list.length) break;
			const chosen = await player
				.chooseButton(["注我：选择一张非伤害类普通锦囊牌", [list, "vcard"]], true)
				.set("ai", (button) => get.player().getUseValue({ name: button.link[2] }, null, true))
				.forResult();
			if (!chosen?.bool || !chosen.links?.length) break;
			const trickName = chosen.links[0][2];
			const vcard = get.autoViewAs({ name: trickName, isCard: true }, [card]);
			// 唯一合法目标（如【无中生有】只允许自己）直接选中，不弹框 —— 见 lib.chashuiAutoTarget 的注释
			const targets = await lib.chashuiAutoTarget(player, vcard, "注我：选择【" + get.translation(trickName) + "】的目标");
			if (!targets) break;
			await player.useCard(vcard, [card], targets, "chashui_zhuwo");
		}
		// 未使用的基本牌/非基本牌都留在牌堆顶，不再弃置
	},
	ai: {
		threaten: 1.3,
	},
	group: ["record"],
	sub: {
		record: {
		audio: false,
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: {
			player: ["loseAfter"],
			global: ["loseAsyncAfter", "equipAfter", "addJudgeAfter", "addToExpansionAfter"],
		},
		filter(event, player) {
			const lose = event.getl?.(player);
			if (!lose) return false;
			const all = (lose.hs || []).concat(lose.es || []).concat(lose.js || []);
			return all.some((card) => get.type(card) == "basic");
		},
		async content(event, trigger, player) {
			const lose = trigger.getl?.(player);
			if (!lose) return;
			const all = (lose.hs || []).concat(lose.es || []).concat(lose.js || []);
			const names = all.filter((card) => get.type(card) == "basic").map((card) => get.name(card));
			if (!names.length) return;
			const record = player.storage.chashui_zhuwo_record || [];
			const next = record.concat(names).toUniqued();
			player.storage.chashui_zhuwo_record = next;
			player.markSkill("chashui_zhuwo");
			// markSkill 在标记已存在时只更新浮窗 info，不重算角标（player.js:10199-10207）⇒ 必须显式 updateMark
			player.updateMark("chashui_zhuwo");
		},
		onremove(player) {
			delete player.storage.chashui_zhuwo_record;
		},
		},
	},
});
const chashui_zhuwo = chashui_zhuwoPlan.skills.chashui_zhuwo;
const chashui_zhuwo_record = chashui_zhuwoPlan.skills.chashui_zhuwo_record;

/** 注我：记录自己失去过的基本牌牌名 */


/**
 * 威兵（张温）
 *
 * 描述：你使用伤害类牌指定目标后，可以亮出牌堆顶三张牌，令目标角色依次选择一项：
 *       1.弃置点数和大于当前亮出牌点数和的任意张手牌，令此牌对其无效；2.令你获得一张亮出牌。
 *
 * Lua（weibing.lua:5-73）：
 *   `TargetSpecified` + 伤害类牌 → 亮牌堆顶 3 张（进处理区）→ 按座次对每个目标：
 *     能弃出「点数和 > 亮出牌点数和」的手牌 → 弃之，此牌对其无效
 *     否则 → 张温获得一张亮出牌
 *   剩余亮出牌进弃牌堆（:63-68）
 */
const chashui_weibing = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "useCardToTargeted" },
	filter(event, player) {
		if (!get.tag(event.card, "damage")) return false;
		// 首个目标时才亮牌
		// 首个目标才亮牌（isFirstTarget 与荡寇同口径，targets[0] 不保证派发序）
		return event.isFirstTarget;
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_weibing");
		// 亮出牌堆顶三张
		const cards = get.cards(3);
		await game.cardsGotoOrdering(cards);
		await player.showCards(cards);
		let remain = cards.slice(0);
		// 按座次对每个目标依次询问
		const targets = trigger.targets?.slice(0) || [];
		targets.sortBySeat();
		for (const target of targets) {
			if (!remain.length) break;
			if (!target.isIn()) continue;
			// 「当前亮出牌点数和」按**剩余**亮出牌算（原型每轮取剩余和：张温取走一张后门槛降低）
			const sum = remain.reduce((acc, card) => acc + (get.number(card) || 0), 0);
			// 能否弃出点数和 > sum 的手牌
			const handCards = target.getCards("h");
			const canPay = (() => {
				const nums = handCards.map((card) => get.number(card) || 0).sort((a, b) => b - a);
				let acc = 0;
				for (const num of nums) {
					acc += num;
					if (acc > sum) return true;
				}
				return false;
			})();
			let nullified = false;
			if (canPay) {
				const result = await target
					.chooseToDiscard("h", [1, Infinity], "威兵：弃置点数和大于" + sum + "的任意张手牌，令此牌对你无效")
					// ⚠️ filterOk 是**无参调用**（game/index.js:6990、content.js:5214/7187/7276），
					// 当前选择只能自己从 ui.selected.cards 读。写成 (cards2) => cards2.reduce(...)
					// 会在点下第一张牌的瞬间抛 Cannot read properties of undefined (reading 'reduce')。
					.set("filterOk", () => (ui.selected.cards || []).reduce((acc, card) => acc + (get.number(card) || 0), 0) > sum)
					// ⚠️ ai 也不能写死常量：basic.chooseCard 的选牌循环只在 check(card) <= 0 时停手
					// （noname/ai/basic.js:130-136），常量正数会让 AI 把整只手牌都选上。
					// 达标后返回 -1 停手；只有「视这张牌为敌」的目标才愿意付（get.attitude(target, player) < 0）。
					.set("ai", (card) => {
						const current = (ui.selected.cards || []).reduce((acc, item) => acc + (get.number(item) || 0), 0);
						if (current > sum) return -1;
						if (get.attitude(target, player) >= 0) return -1;
						return get.number(card) || 0;
					})
					.forResult();
				if (result?.bool && result.cards?.length) {
					// chooseToDiscard 默认已经弃置（content.js:5461-5477），不能再 discard 一次。
					nullified = true;
				}
			}
			if (nullified) {
				// 此牌对其无效
				if (Array.isArray(trigger.targets)) trigger.targets.remove(target);
				const parent = trigger.getParent?.();
				if (parent && Array.isArray(parent.triggeredTargets2)) parent.triggeredTargets2.remove(target);
				game.log(trigger.card, "对", target, "无效");
				continue;
			}
			// 否则张温获得一张亮出牌
			const pick = await player
				.chooseButton(["威兵：获得一张亮出牌", remain], true)
				.set("ai", (button) => get.value(button.link))
				.forResult();
			if (pick?.bool && pick.links?.length) {
				const card = pick.links[0];
				remain.remove(card);
				await player.gain(card, "gain2");
			}
		}
		// 剩余亮出牌进弃牌堆
		if (remain.length) await game.cardsDiscard(remain);
	},
	ai: {
		threaten: 1.2,
	},
};

/**
 * 汉律（张温）
 *
 * 描述：锁定技，若牌堆未洗过牌，当你受到大于1点的伤害时，将伤害值改为1点；
 *       当你使用单目标伤害类牌时，多指定一名目标角色。
 *
 * Lua（hanlv.lua:5-58）：
 *   ① `DamageInflicted`：`damage > 1` 且 `tea__hanlv_mark == 0`（未洗过牌）→ 改为 1（:11-23）
 *   ② `CardUsing`：伤害牌且单目标 → 可多加一个目标（:24-41）
 *   ③ `AfterDrawPileShuffle`：洗过牌 → 标记 1（失效，:45-54）
 */
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_hanlvPlan = defineSkill({
	id: "chashui_hanlv",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	locked: true,
	forced: true,
	mark: true,
	marktext: "律",
	intro: {
		content(storage, player) {
			return player.storage.chashui_hanlv_shuffled
				? "牌堆已洗过，此技能已失效。"
				: "牌堆未洗过牌：你受到大于1点的伤害时，将伤害值改为1点；你使用单目标伤害类牌时，多指定一名目标角色。";
		},
	},
	// 用 damageBegin4 而不是 damageBegin1：begin2/3/4 还有加伤（酒、裸衣、藤甲等），
	// 在 begin1 压成 1 会被后续加伤加回 >1。原生「伤害值改为1点」的写法即
	// character/mobile.js:24220 tiansuan2_1 / :24283 tiansuan2_2（damageBegin4 + trigger.num = 1）。
	trigger: { player: "damageBegin4" },
	filter(event, player) {
		// 牌堆未洗过牌
		if (player.storage.chashui_hanlv_shuffled) return false;
		return event.num > 1;
	},
	async content(event, trigger, player) {
		trigger.num = 1;
	},
	onremove(player) {
		delete player.storage.chashui_hanlv_shuffled;
	},
	ai: {
		threaten: 1.2,
	},
	group: ["target", "mark"],
	sub: {
		target: {
		audio: false,
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { player: "useCard2" },
		filter(event, player) {
			if (player.storage.chashui_hanlv_shuffled) return false;
			if (!get.tag(event.card, "damage")) return false;
			if (event.targets?.length != 1) return false;
			// 有可加的额外目标
			return game.hasPlayer((current) => !event.targets.includes(current) && player.canUse(event.card, current));
		},
		async content(event, trigger, player) {
			// 锁定技「多指定一名目标」：不可取消逃避（原型 cancelable=false）
			const extra = await player
				.chooseTarget(
					"汉律：须为" + get.translation(trigger.card) + "选择一个额外目标",
					true,
					(card, player2, target) => {
						return !trigger.targets.includes(target) && player2.canUse(trigger.card, target);
					}
				)
				.set("ai", (target) => -get.attitude(player, target))
				.forResult();
			if (!extra?.bool || !extra.targets?.length) return;
			const target = extra.targets[0];
			if (!Array.isArray(trigger.targets)) trigger.targets = [];
			// 注意：这里**不能**同时 push 到 trigger.triggeredTargets2。
			// 引擎在 content.js:9418 用 _triggerTo("useCardToTarget","triggeredTargets2",…) 派发目标类事件，
			// 其内部 getTriggerTarget（:9390-9409）会把 triggeredTargets2 里的目标从 event.targets 中扣掉，
			// 先 push 等于让新目标跳过所有 useCardToTarget 类技能（如援搏）。
			// useCard2 早于 step6/7 的目标派发，只改 targets 即可让新目标享有同等目标身份。
			trigger.targets.push(target);
			game.log(trigger.card, "增加了目标", target);
		},
		},
		mark: {
		audio: false,
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { global: "washCard" },
		async content(event, trigger, player) {
			player.storage.chashui_hanlv_shuffled = true;
			player.markSkill("chashui_hanlv");
		},
		onremove(player) {
			delete player.storage.chashui_hanlv_shuffled;
		},
		},
	},
});
const chashui_hanlv = chashui_hanlvPlan.skills.chashui_hanlv;
const chashui_hanlv_target = chashui_hanlvPlan.skills.chashui_hanlv_target;
const chashui_hanlv_mark = chashui_hanlvPlan.skills.chashui_hanlv_mark;

/** 汉律②：使用单目标伤害牌时多加一个目标 */


/** 汉律③：洗过牌后失效 */


/**
 * 佐靖（石苞）
 *
 * 描述：限定技，你可以视为使用一张基本牌或【无懈可击】。
 *       此技能的状态为已发动时，你每回合首次不通过此法使用与以此法使用过的同名牌时，
 *       可以重置此技能或令一名角色摸两张牌。
 *
 * 与原型的两处差异（用户明确要求）：
 *   ① 触发要排除「通过佐靖印出来的牌」本身 —— 原型 `CardUsing` 不排除，等于印一张立刻能重置，可无限续；
 *   ② 记录是**累积**的（「使用过」）：重置后再印别的牌名要累加，mark 里列出全部牌名。
 *
 * Lua（zuojing.lua:5-96）：
 *   ① viewas（限定）：`pattern = "nullification;.|.|.|.|.|basic"`，凭空印牌
 *   ② `before_use`：记录 `@zuojing_record = 使用的牌名`（:36-39）
 *   ③ `CardUsing`：本回合首次使用该牌名 → 选「重置佐靖」或「令一名角色摸2」（:48-92）
 */
const chashui_zuojing = {
	audio: 2,
	limited: true,
	mark: true,
	marktext: "佐",
	intro: {
		content(storage, player) {
			const record = player.storage.chashui_zuojing_record || [];
			const names = record.length ? record.map((name) => get.translation(name)).join("、") : "无";
			const head = player.storage.chashui_zuojing_used ? "限定技，已发动。" : "限定技，未发动。";
			return (
				head +
				"你可以视为使用一张基本牌或【无懈可击】。<br>已通过〖佐靖〗使用过的牌名：<span class='bluetext'>" +
				names +
				"</span><br>此技能的状态为已发动时，你每回合首次<b>不通过此法</b>使用这些牌名之一的牌时，可以重置此技能或令一名角色摸两张牌。"
			);
		},
	},
	skillAnimation: true,
	animationColor: "metal",
	// 描述是「视为**使用**一张基本牌或【无懈可击】」——没有「打出」，故只开 chooseToUse。
	// 注意【闪】也在这个窗口里（对【杀】的响应在无名杀是 chooseToUse），所以不写 chooseToRespond 不影响印闪。
	enable: "chooseToUse",
	/**
	 * 【无懈可击】走专门通道，不能走 hiddenCard 的 hasUseTarget 判据。
	 *
	 * 引擎问「这个人有没有无懈」有两处，都是逐个技能试：
	 *   ① player.hasWuxie(info)（noname/library/element/player.js:13477-13503）：
	 *      手牌有【无懈】→ true；否则 hiddenWuxie(player, info) → 静态 viewAs.name=="wuxie" → hiddenCard(player,"wuxie")。
	 *   ② card/standard.js:4181-4201 用 `current.hasWuxie(map)` 过滤「谁进无懈候选名单」。
	 * 【无懈可击】是 `notarget: true`（card/standard.js:2894），而 hasUseTarget
	 * （player.js:10493-10498）是拿每个玩家去试 canUse(card, target) —— 对无目标的牌这个问法恒 false，
	 * 于是佐靖永远进不了无懈名单（不是按钮变灰，是根本轮不到他）。
	 */
	hiddenWuxie(player, info) {
		if (player.storage.chashui_zuojing_used) return false;
		// 凭空印无懈，不需要素材；但要确认窗口确实在等无懈（info 由 event.info_map 传入）
		return !!info;
	},
	hiddenCard(player, name) {
		if (player.storage.chashui_zuojing_used) {
			// 已发动 → 只用于「重置/摸牌」的判定，不作为印牌
			return false;
		}
		// 【无懈可击】【闪】都是 notarget: true（card/standard.js:502 闪、:2894 无懈），
		// 没有「对某个玩家使用」这回事，用 hasUseTarget 问必得 false ⇒ 直接放行。
		if (lib.card[name]?.notarget) return true;
		if (get.type(name) != "basic") return false;
		// 有目标的牌（【桃】【酒】等）才需要问「现在有没有合法目标」
		return player.hasUseTarget({ name, isCard: true }, false, false);
	},
	filter(event, player) {
		if (event.skill == "chashui_zuojing" || event._skill == "chashui_zuojing") return true;
		if (player.storage.chashui_zuojing_used) return false;
		return get.inpileVCardList((info) => {
			const name = info[2];
			if (info[0] != "basic" && name != "wuxie") return false;
			return event.filterCard({ name, nature: info[3], isCard: true }, player, event);
		}).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			const list = get.inpileVCardList((info) => {
				const name = info[2];
				if (info[0] != "basic" && name != "wuxie") return false;
				return event.filterCard({ name, nature: info[3], isCard: true }, player, event);
			});
			if (!list.length) return ui.create.dialog("佐靖：没有可视为使用或打出的牌");
			return ui.create.dialog("佐靖", [list, "vcard"]);
		},
		filter(button, player) {
			return !player.storage.chashui_zuojing_used;
		},
		check(button) {
			return get.player().getUseValue({ name: button.link[2], nature: button.link[3] }, null, true);
		},
		backup(links) {
			return {
				filterCard: () => false,
				selectCard: -1,
				viewAs: { name: links[0][2], nature: links[0][3], isCard: true },
				popname: true,
				async precontent(event, trigger, player) {
					player.logSkill("chashui_zuojing");
					player.awakenSkill("chashui_zuojing");
					player.storage.chashui_zuojing_used = true;
					// 「使用过」是累积的：重置佐靖后再印另一个牌名要累加，mark 里列出全部牌名
					player.storage.chashui_zuojing_record = (player.storage.chashui_zuojing_record || []).concat(links[0][2]).toUniqued();
					// 常驻 addSkill：awakenSkill 会 disable 主技能，group 不再展开（player.js:11190-11199），
					// 依赖 group 的 _again 只在发动当回合有效（tempSkill 又到回合末就过期）——
					// 「每回合首次」必须显式常驻；重置时由 content 自摘
					player.addSkill("chashui_zuojing_again");
					player.markSkill("chashui_zuojing");
				},
			};
		},
		prompt(links) {
			return "佐靖：视为使用一张【" + get.translation(links[0][2]) + "】";
		},
	},
	content() {},
	onremove(player) {
		delete player.storage.chashui_zuojing_used;
		delete player.storage.chashui_zuojing_record;
		player.removeSkill("chashui_zuojing_again");
	},
	ai: {
		order: 7,
	},
};

/** 佐靖②：已发动后，每回合首次使用同名牌 → 重置 或 令一名角色摸2（发动时常驻 addSkill） */
const chashui_zuojing_again = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: "chashui_zuojing",
	charlotte: true,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		const record = player.storage.chashui_zuojing_record;
		if (!record?.length) return false;
		// 「以此法使用的牌」不算：佐靖是 chooseButton 转化技，引擎把 backup 注册成 `${buttoned}_backup`
		// （content.js:4773 与 :4789 `event.backup(`${event.buttoned}_backup`)`），所以 event.skill 是
		// "chashui_zuojing_backup" 而不是 "chashui_zuojing" —— 只判后者等于没判，印出来的那张牌自己就是
		// 本回合第一次使用该牌名 ⇒ 结算后立刻能重置限定技，可无限续。
		const viaZuojing = (evt) => typeof evt.skill == "string" && evt.skill.startsWith("chashui_zuojing");
		if (viaZuojing(event)) return false;
		if (!record.includes(get.name(event.card))) return false;
		// 每回合首次：本回合第一次「不通过此法」使用已记录牌名的牌
		return player.getHistory("useCard", (evt) => record.includes(get.name(evt.card)) && !viaZuojing(evt)).indexOf(event) === 0;
	},
	async content(event, trigger, player) {
		const choice = await player
			.chooseControl(["重置佐靖", "令一名角色摸两张牌"])
			.set("prompt", "佐靖：选择一项")
			.set("ai", () => (player.isDamaged() || player.countCards("h") < 2 ? 1 : 0))
			.forResult();
		if (!choice?.control) return;
		if (choice.control == "重置佐靖") {
			player.restoreSkill("chashui_zuojing");
			delete player.storage.chashui_zuojing_used;
			// 记录**不清**：描述是「以此法使用过的」牌名（累积），重置后再印新牌名要继续累加，
			// mark 里也要一直列着全部已用过的牌名
			// 主技能已恢复（group 恢复展开），摘掉显式挂载避免双实例
			player.removeSkill("chashui_zuojing_again");
			player.markSkill("chashui_zuojing");
			return;
		}
		const target = await player
			.chooseTarget("佐靖：选择一名角色，令其摸两张牌", (card, player2, t) => t.isIn())
			.set("ai", (t) => get.attitude(player, t))
			.forResult();
		if (target?.bool && target.targets?.length) {
			player.logSkill("chashui_zuojing", target.targets[0]);
			await target.targets[0].draw(2);
		}
	},
};

/**
 * 奋务（石苞）
 *
 * 描述：每回合限一次，当一名角色弃置至少两张牌后，你可以令其依次重铸两张牌，
 *       若这两张牌颜色相同，其可以收回弃置牌中一张牌。
 *
 * Lua（fenwu.lua:5-70）：
 *   `AfterCardsMove`：某角色一次弃置 ≥2 张（`moveReason == ReasonDiscard`）
 *   → 该角色依次重铸 2 张（:31-45）
 *   → 颜色相同 → 可收回弃置牌中一张（:46-66）
 */
const chashui_fenwu = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { global: "discardAfter" },
	filter(event, player) {
		if (player.countSkill("chashui_fenwu") >= 1) return false;
		const target = event.player;
		if (!target?.isIn()) return false;
		// 一次弃置至少两张
		if ((event.cards || []).length < 2) return false;
		// 该角色不空手
		return target.countCards("he") > 0;
	},
	check(event, player) {
		// 重铸对目标基本是净收益，只替友方发动
		return get.attitude(player, event.player) > 0;
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		if (!target?.isIn()) return;
		player.logSkill("chashui_fenwu", target);
		const discarded = (trigger.cards || []).slice(0);
		const recastCards = [];
		for (let i = 0; i < 2; i++) {
			if (!target.isIn() || !target.countCards("he")) break;
			const result = await target
				.chooseCard("he", "奋务：选择一张牌重铸（" + (i + 1) + "/2）", true)
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (!result?.bool || !result.cards?.length) break;
			const card = result.cards[0];
			recastCards.push(card);
			await target.recast(card);
		}
		// 两张颜色相同 → 可收回弃置牌中一张
		if (recastCards.length != 2) return;
		if (get.color(recastCards[0]) != get.color(recastCards[1])) return;
		const inDiscard = discarded.filter((card) => get.position(card) == "d");
		if (!inDiscard.length || !target.isIn()) return;
		const pick = await target
			// 描述「可以收回」：可放弃
			.chooseButton(["奋务：可以收回弃置牌中的一张", inDiscard])
			.set("ai", (button) => get.value(button.link))
			.forResult();
		if (pick?.bool && pick.links?.length) await target.gain(pick.links[0], "gain2");
	},
	ai: {
		threaten: 1.1,
	},
};

/**
 * 撰赋（左思）
 *
 * 描述：游戏开始时，你从牌堆获得一张普通锦囊牌。每种牌名限一次，出牌阶段，
 *       你可以将一张普通锦囊牌置于武将牌上，称为“赋”，然后重置“誊钞”中X的值。
 *
 * Lua（zhuanfu.lua:5-53）：
 *   ① `GameStart`：从牌堆随机获得一张普通锦囊（:29-50）
 *   ② active：将一张**普通锦囊**置入「赋」pile（每种牌名限一次，:8-17）
 *      → 重置 `@tea__tengchao_num = 1`（:25）
 */
/** 撰赋是否还有可置入的普通锦囊（「赋」里已有同名牌不能再置入 —— 每种牌名限一次）。
 *  旧版 filter 只判「手里有普通锦囊」，若这些牌名都已在「赋」里，按钮亮但点开是空选择框。 */
const chashuiZhuanfuHas = (player) => {
	const exist = player.getExpansions("chashui_zhuanfu").map((card) => get.name(card));
	return player.countCards("he", (card) => get.type(card) == "trick" && !exist.includes(get.name(card))) > 0;
};
lib.chashuiZhuanfuHas = chashuiZhuanfuHas;

/**
 * 誊钞当前能印出的牌名（「赋」里的普通锦囊 ∩ 当前窗口真的能用的）。
 *
 * 本体（`chashui_tengchao`）与「他人版」（`chashui_tengchao_o`）共用：两版判据必须同源，
 * 否则 dialog 里列出的牌名与 AI 评分用的牌名会漂移。他人版读左思身上的共享「赋」。
 */
const chashuiTengchaoNames = (player, event) => {
	const owner = player.hasSkill("chashui_tengchao_o") ? lib.skill.chashui_tengchao_o.owner(player) : player;
	if (!owner) return [];
	const evt = event || get.event();
	const names = owner
		.getExpansions("chashui_zhuanfu")
		.map((card) => get.name(card))
		.toUniqued();
	if (!evt || typeof evt.filterCard != "function") return names;
	return names.filter((name) => evt.filterCard({ name, isCard: true }, player, evt));
};
lib.chashuiTengchaoNames = chashuiTengchaoNames;

// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_zhuanfuPlan = defineSkill({
	id: "chashui_zhuanfu",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		// 普通锦囊：get.type 区分 delay（type2 会把延时锦囊也算 trick）
		return lib.chashuiZhuanfuHas(player);
	},
	async content(event, trigger, player) {
		// 可置入的牌名（排除已有）
		const exist = player.getExpansions("chashui_zhuanfu").map((card) => get.name(card));
		const result = await player
			.chooseCard(
				"he",
				"撰赋：将一张普通锦囊牌置于武将牌上，称为“赋”",
				(card) => get.type(card) == "trick" && !exist.includes(get.name(card))
			)
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!result?.bool || !result.cards?.length) return;
		const card = result.cards[0];
		player.logSkill("chashui_zhuanfu");
		// 置入「赋」（头插会反转 → 单张无影响）
		const next = player.addToExpansion(card, "giveAuto");
		next.gaintag.add("chashui_zhuanfu");
		await next;
		// 重置誊钞的 X
		player.storage.chashui_tengchao_num = 1;
		player.markSkill("chashui_tengchao");
	},
	// 「赋」的 mark：与「泽」同款（自己看牌面、他人看张数）
	// 不写 mark: true —— 赋是 gameStart 之后才有的，addToExpansion 会自动 markSkill
	marktext: "赋",
	intro: {
		markcount: "expansion",
		mark(dialog, storage, player) {
			const pile = player.getExpansions("chashui_zhuanfu");
			if (!pile.length) return;
			if (player == game.me || player.isUnderControl()) {
				dialog.addAuto(pile);
			} else {
				return "共有" + get.cnNumber(pile.length) + "张“赋”";
			}
		},
		content(storage, player) {
			const pile = player.getExpansions("chashui_zhuanfu");
			if (!pile.length) return "没有“赋”";
			if (player == game.me || player.isUnderControl()) {
				return get.translation(pile);
			}
			return "共有" + get.cnNumber(pile.length) + "张“赋”";
		},
	},
	onremove(player) {
		player.loseToDiscardpile(player.getExpansions("chashui_zhuanfu"));
	},
	ai: {
		order: 5,
		result: { player: 1 },
	},
	group: ["start"],
	sub: {
		start: {
		audio: false,
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { global: "gameStart" },
		async content(event, trigger, player) {
			const card = get.cardPile((card2) => get.type(card2) == "trick");
			if (!card) return;
			player.logSkill("chashui_zhuanfu");
			await player.gain(card, "gain2");
		},
		},
	},
});
const chashui_zhuanfu = chashui_zhuanfuPlan.skills.chashui_zhuanfu;
const chashui_zhuanfu_start = chashui_zhuanfuPlan.skills.chashui_zhuanfu_start;

/** 撰赋：游戏开始时从牌堆获得一张普通锦囊 */


/**
 * 誊钞（左思）
 *
 * 描述：每名角色的回合限一次，其可以将至少X+1张牌当与任意一张“赋”牌名相同的牌使用
 *       （X为以此法使用的上一张牌对应的实体牌数且至少为1）。此牌结算后，你可以获得这些牌中的一张。
 *
 * Lua（tengchao.lua:5-91）：
 *   ① viewas：`pattern = ".|.|.|.|.|trick"`，牌名限定为「赋」里已有的（:7-32）
 *      `view_as` 要求 `#cards > X`（:27）
 *   ② `before_use`：把 X 更新为本次底牌数（:33-37）
 *   ③ `CardUseFinished`：可得底牌中的一张（:70-82）
 *   ④ 「每名角色的回合限一次」（:38-43）
 */
const chashui_tengchao = {
	audio: 2,
	// 描述是「当与任意一张“赋”牌名相同的牌**使用**」——「赋」只收普通锦囊（撰赋），
	// 既没有「打出」也没有【闪】/【桃】，故只开 chooseToUse。
	enable: "chooseToUse",
	hiddenCard(player, name) {
		const piles = player.getExpansions("chashui_zhuanfu");
		if (!piles.length) return false;
		if (!piles.some((card) => get.name(card) == name)) return false;
		const x = Math.max(player.storage.chashui_tengchao_num || 1, 1);
		return player.countCards("he") > x;
	},
	filter(event, player) {
		if (event.skill == "chashui_tengchao" || event._skill == "chashui_tengchao") return true;
		// 本回合是否已发动
		if (player.countSkill("chashui_tengchao") >= 1) return false;
		const x = Math.max(player.storage.chashui_tengchao_num || 1, 1);
		if (player.countCards("he") <= x) return false;
		return lib.chashuiTengchaoNames(player, event).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			// 与 ai.order 同源（lib.chashuiTengchaoNames）：列出的牌名 = AI 评分用的牌名
			const list = lib.chashuiTengchaoNames(player, event);
			if (!list.length) return ui.create.dialog("誊钞：没有可使用的“赋”牌名");
			return ui.create.dialog("誊钞：选择要使用的“赋”牌名", [list.map((name) => [get.translation(get.type2(name)), "", name]), "vcard"]);
		},
		filter(button, player) {
			return true;
		},
		check(button) {
			const player = get.player();
			const name = button.link[2];
			// 手里已经有这张真牌时不要转化：先用真的，「每回合限一次」的转化留给缺的牌。
			// 原生同判据：奇策 reqice（character/refresh.js:2941）
			//   `if (player.countCards("hs", name) > 0) return 0;`
			if (player.countCards("hs", (card) => get.name(card) == name)) return 0;
			return Math.max(0, player.getUseValue({ name, isCard: true }, null, true));
		},
		backup(links) {
			return {
				filterCard: true,
				selectCard() {
					const player = get.player();
					const num = Math.max(player.storage.chashui_tengchao_num || 1, 1);
					return [num + 1, Infinity];
				},
				position: "hes",
				viewAs: { name: links[0][2], isCard: true },
				popname: true,
				async precontent(event, trigger, player) {
					const cards = event.result?.cards || [];
					player.logSkill("chashui_tengchao");
					// 更新 X 为本次底牌数
					player.storage.chashui_tengchao_num = cards.length;
					player.storage.chashui_tengchao_cards = cards.slice(0);
					// 虚拟牌打标记：useCard 的 event.skill 是 backup 名，_gain 靠这个识别（躁兵同款）
					const vcard = event.result?.card;
					if (vcard) vcard.storage = { ...(vcard.storage || {}), chashui_tengchao: true };
				},
			};
		},
		prompt(links) {
			return "誊钞：将至少X+1张牌当【" + get.translation(links[0][2]) + "】使用";
		},
	},
	content() {},
	// 他人版誊钞用 global 全局技（同原生〖问卦〗wengua2），不进其他角色技能描述；
	// 不再用 subSkill.mount 逐个 addSkill（那会把「誊钞」写进别人武将技能描述）。
	global: "chashui_tengchao_o",
	group: ["chashui_tengchao_gain"],
	mark: true,
	marktext: "钞",
	intro: {
		content(storage, player) {
			return "当前X=" + Math.max(player?.storage?.chashui_tengchao_num || 1, 1) + "。";
		},
	},
	onremove(player) {
		delete player.storage.chashui_tengchao_num;
		delete player.storage.chashui_tengchao_cards;
	},
	ai: {
		// order 不能写死常数。写死 5 会让 AI 把「花至少 2 张牌换一张牌」排在真牌后面
		// （无中生有 order 7、顺手牵羊 7.5，见 card/standard.js 的 ai.order），于是永远不发动。
		// 正确做法是算「这次能印出的最好的那张牌的 order」，原生同款三处：
		//   dcshizong（character/huicui.js:7301）、clanshixi（character/clan.js:785）、
		//   clanchengqi（character/clan.js:4119）。
		order(item, player) {
			player = player || get.player();
			let num = 0;
			for (const name of lib.chashuiTengchaoNames(player)) num = Math.max(num, get.order({ name }, player));
			return num > 0 ? num + 0.1 : -1;
		},
		result: { player: 1 },
		// 不声明 respondSha/respondShan/save：「赋」只收**普通锦囊**（撰赋的 filter 卡死），
		// 誊钞永远印不出【杀】/【闪】/【桃】，声明这些 tag 只会让 AI 误判自己有响应牌。
	},
};

/**
 * 誊钞（他人版）：挂给所有其他角色。X 与「赋」都读左思的共享状态；发动后同样更新 X，
 * 结算后由左思（而非使用者）获得底牌中的一张。
 */
const chashui_tengchao_o = {
	audio: "chashui_tengchao",
	// 同誊钞本体：描述只写「使用」，且「赋」里只有普通锦囊。
	enable: "chooseToUse",
	owner(player) {
		return game.findPlayer((current) => current != player && current.isIn() && current.hasSkill("chashui_tengchao"));
	},
	hiddenCard(player, name) {
		const owner = lib.skill.chashui_tengchao_o.owner(player);
		if (!owner) return false;
		const piles = owner.getExpansions("chashui_zhuanfu");
		if (!piles.some((card) => get.name(card) == name)) return false;
		const x = Math.max(owner.storage.chashui_tengchao_num || 1, 1);
		return player.countCards("he") > x;
	},
	filter(event, player) {
		if (event.skill == "chashui_tengchao_o" || event._skill == "chashui_tengchao_o") return true;
		if (player.countSkill("chashui_tengchao_o") >= 1) return false;
		const owner = lib.skill.chashui_tengchao_o.owner(player);
		if (!owner) return false;
		const x = Math.max(owner.storage.chashui_tengchao_num || 1, 1);
		if (player.countCards("he") <= x) return false;
		return lib.chashuiTengchaoNames(player, event).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			// 与 ai.order 同源（lib.chashuiTengchaoNames，内部已按 owner 找「赋」）
			const list = lib.chashuiTengchaoNames(player, event);
			if (!list.length) return ui.create.dialog("誊钞：没有可使用的“赋”牌名");
			return ui.create.dialog("誊钞：选择要使用的“赋”牌名", [list.map((name) => [get.translation(get.type2(name)), "", name]), "vcard"]);
		},
		filter(button, player) {
			return true;
		},
		check(button) {
			const player = get.player();
			const name = button.link[2];
			// 同本体：手里有真牌先用真牌（奇策 reqice，character/refresh.js:2941）
			if (player.countCards("hs", (card) => get.name(card) == name)) return 0;
			return Math.max(0, player.getUseValue({ name, isCard: true }, null, true));
		},
		backup(links) {
			return {
				filterCard: true,
				selectCard() {
					const player = get.player();
					const owner = lib.skill.chashui_tengchao_o.owner(player);
					const num = Math.max(owner?.storage.chashui_tengchao_num || 1, 1);
					return [num + 1, Infinity];
				},
				position: "hes",
				viewAs: { name: links[0][2], isCard: true },
				popname: true,
				async precontent(event, trigger, player) {
					const cards = event.result?.cards || [];
					player.logSkill("chashui_tengchao_o");
					// 更新共享 X（存在左思身上），浮窗角标同步
					const owner = lib.skill.chashui_tengchao_o.owner(player);
					if (owner) {
						owner.storage.chashui_tengchao_num = cards.length;
						owner.markSkill("chashui_tengchao");
					}
					player.storage.chashui_tengchao_o_cards = cards.slice(0);
					// 虚拟牌打标记：左思的 _gain 靠这个识别本次结算
					const vcard = event.result?.card;
					if (vcard) vcard.storage = { ...(vcard.storage || {}), chashui_tengchao: true };
				},
			};
		},
		prompt(links) {
			return "誊钞：将至少X+1张牌当【" + get.translation(links[0][2]) + "】使用";
		},
	},
	content() {},
	ai: {
		// 同本体：order 用「能印出的最好的牌的 order」算，写死常数会让 AI 永远不发动。
		order(item, player) {
			player = player || get.player();
			let num = 0;
			for (const name of lib.chashuiTengchaoNames(player)) num = Math.max(num, get.order({ name }, player));
			return num > 0 ? num + 0.1 : -1;
		},
		result: { player: 1 },
		// 同誊钞本体：只印「赋」里的普通锦囊，印不出【杀】/【闪】/【桃】，
		// 所以不声明 respondSha/respondShan/save（声明了 AI 会以为自己有响应牌）。
	},
};

/** 誊钞：结算后左思可获得底牌中的一张（自己或他人发动的都算） */
const chashui_tengchao_gain = {
	audio: false,
	charlotte: true,
	forced: true,
	popup: false,
	silent: true,
	// 他人发动时 useCard 属于使用者，必须挂 global 才能接到。
	// `enable` 含 chooseToRespond —— 打出走 `respond` 事件、没有 useCard（R14），
	// 只听 useCardAfter 会让「把赋当【闪】打出」永远收不回底牌。
	trigger: { global: ["useCardAfter", "respondAfter"] },
	filter(event, player) {
		// player = 左思（技能持有者）；只认本技能印的牌（precontent 打的 storage 标记）
		if (!event.card?.storage?.chashui_tengchao) return false;
		if (!player.isIn()) return false;
		const user = event.player;
		const cards = user == player ? player.storage.chashui_tengchao_cards : user.storage.chashui_tengchao_o_cards;
		return cards?.length > 0 && cards.some((card) => get.position(card) == "d");
	},
	async content(event, trigger, player) {
		const user = trigger.player;
		const cards = (user == player ? player.storage.chashui_tengchao_cards : user.storage.chashui_tengchao_o_cards || []).filter(
			(card) => get.position(card) == "d"
		);
		if (user == player) delete player.storage.chashui_tengchao_cards;
		else delete user.storage.chashui_tengchao_o_cards;
		if (!cards.length) return;
		player.logSkill("chashui_tengchao");
		const pick = await player
			.chooseButton(["誊钞：可以获得其中一张牌", cards])
			.set("ai", (button) => get.value(button.link))
			.forResult();
		if (pick?.bool && pick.links?.length) await player.gain(pick.links[0], "gain2");
	},
};

// ===== 动态描述 =====
// 飞军的发动阶段是**规则文本**在变（不是数值），按 AGENTS.md §6 走 dynamicTranslate，
// 不用 mark 承载：引擎取技能描述时优先读 lib.dynamicTranslate（get/index.js:3852-3853），
// 询问面板 prompt2（content.js:3610-3611）与技能浮窗（ui/click/index.js:2968-2969）同源，
// 所以改一处即可全链路生效。
lib.dynamicTranslate ??= {};
lib.dynamicTranslate.chashui_feijun = function (player) {
	const stage = chashuiFeijunStageName(player.storage.chashui_feijun_stage);
	// 调过阶段就把那个阶段名标蓝（同本扩转换技的写法），一眼看出"已经不是默认的结束阶段了"
	const label = stage == "结束阶段" ? stage : `<span class='bluetext'>${stage}</span>`;
	return `${label}结束时，你可以摸三张牌并将手牌数弃置体力上限。若以此法弃置的牌数小于你的体力值，你调整此技能的发动阶段，否则你增加一点体力上限。`;
};

// 奔汉的「本回合的限制次数」会被自己改大 ⇒ 规则文本跟着变，同样走 dynamicTranslate。
// 只改「限一次」这一处：额定【杀】次数由 mark 角标呈现（intro.markcount），不在描述里重复写数字。
// 同源：filter/cost 都读 `lib.chashuiBenhanCanUse`，而它读的就是 storage.chashui_benhan_count/times。
lib.dynamicTranslate.chashui_benhan = function (player) {
	const times = player.storage?.chashui_benhan_times || 1;
	const limit = times > 1 ? `每回合限${get.cnNumber(times)}次` : "每回合限一次";
	return (
		`${limit}，本回合你执行的第X个阶段结束时，你可以将手牌数调整至X。若你的手牌数：` +
		`未因此变化，本技能本回合的限制次数+2；减少，你本局出牌阶段额定使用【杀】的次数+1；` +
		`增加，你将下个阶段改为出牌阶段。`
	);
};

// ============================================================
// 茶水贤设·昳（tea_ex_c）—— 卫臻
// 原型：G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_c\skills\{liaoge,guijian}.lua
// ============================================================

/**
 * 料戈（卫臻）
 *
 * 描述：其他角色回合开始时，你可将一张牌扣置于武将牌上，并于回合结束时展示之。若此牌为黑色/红色
 *       且本回合有/没有角色使用过【杀】，你获得此牌并摸一张牌，否则你弃置之。
 *
 * 入口：`phaseBegin`（回合开始，content.js:4242）+ `phaseEnd`（整回合结束，content.js:4304-4312，
 *   `_phaseEndTriggered` 保证只派发一次）。Lua 也是同一 spec 双挂 fk.TurnStart/fk.TurnEnd。
 *   `phaseBegin` 派发在 actionHistory 重置之后（content.js:4124-4142 重置 → :4242 派发），
 *   所以回合刚开始时本回合的 useCard 历史必为空。
 *
 * 「本回合有角色使用过【杀】」：Lua 用 getEventsOfScope(GameEvent.UseCard, 1, fn, Player.HistoryTurn)
 *   扫全房（含卫臻自己、含转化杀）→ 对应 `game.hasPlayer2(c => c.hasHistory("useCard", …), true)`，
 *   原生同款 caanchao（character/offline.js:7734）。
 *
 * 「扣置」的呈现：引擎没有「武将牌上暗置」机制（addToExpansion 的牌客户端就是明的），
 *   照「恢泽」/原生「七星」的做法——自己看得见牌面、其他人只看张数。
 */
const chashui_liaoge = {
	// ⚠️ gaintag 必须等于技能 id，`intro.content:"expansion"` 才取得到牌（get/index.js:4833-4836）
	// ⚠️ 不写 `mark: true`：技能挂载时还没有牌，`addToExpansion` 会对 gaintag 自动 markSkill
	//    （content.js:10723-10725），写了反而先冒出一个空 mark。
	marktext: "戈",
	intro: {
		markcount: "expansion",
		mark(dialog, storage, player) {
			const pile = player.getExpansions("chashui_liaoge");
			if (!pile.length) return;
			if (player == game.me || player.isUnderControl()) dialog.addAuto(pile);
			else return "共有" + get.cnNumber(pile.length) + "张“戈”";
		},
		content(storage, player) {
			const pile = player.getExpansions("chashui_liaoge");
			if (!pile.length) return "没有“戈”";
			if (player == game.me || player.isUnderControl()) return get.translation(pile);
			return "共有" + get.cnNumber(pile.length) + "张“戈”";
		},
	},
	group: ["chashui_liaoge_start", "chashui_liaoge_end"],
	ai: { threaten: 1.2 },
	subSkill: {
		// 其他角色回合开始时：扣置一张牌
		start: {
			audio: false,
			charlotte: true,
			trigger: { global: "phaseBegin" },
			filter(event, player) {
				return event.player != player && player.countCards("he") > 0 && player.getExpansions("chashui_liaoge").length == 0;
			},
			async cost(event, trigger, player) {
				event.result = await player
					.chooseCard("he", "料戈：将一张牌扣置于武将牌上", "回合结束时展示之")
					.set("ai", (card) => {
						// 回合刚开始时本回合还没人用过【杀】，只有红牌能成功，所以优先扣红牌
						return get.color(card) == "red" ? 6 - get.value(card) : -1;
					})
					.forResult();
			},
			async content(event, trigger, player) {
				player.logSkill("chashui_liaoge");
				await player.addToExpansion(event.cards, "gain2").set("gaintag", ["chashui_liaoge"]);
			},
		},
		// 回合结束时：展示并判定（自动结算，无询问）
		end: {
			audio: false,
			charlotte: true,
			forced: true,
			popup: false,
			trigger: { global: "phaseEnd" },
			filter(event, player) {
				return player.getExpansions("chashui_liaoge").length > 0;
			},
			async content(event, trigger, player) {
				const cards = player.getExpansions("chashui_liaoge");
				if (!cards.length) return;
				player.logSkill("chashui_liaoge");
				await player.showCards(cards, "料戈");
				const used = game.hasPlayer2((current) => current.hasHistory("useCard", (evt) => evt.card && evt.card.name == "sha"), true);
				const black = get.color(cards[0], player) == "black";
				// 黑+本回合有【杀】成功；红+本回合无【杀】成功
				if (black === used) {
					game.log(player, "料戈成功，获得", cards, "并摸一张牌");
					await player.gain(cards, "gain2");
					if (player.isIn()) await player.draw(1);
				} else {
					game.log(player, "料戈失败，弃置", cards);
					await player.loseToDiscardpile(cards);
				}
			},
		},
	},
};

/**
 * 规鉴（卫臻）
 *
 * 描述：每回合限一次，你可以将手牌调整至体力上限，视为使用一张基本牌。若以此法获得牌，
 *       本回合你使用牌时弃一张牌。
 *
 * 入口：`chooseToUse` + `chooseToRespond`（Lua 有 enabled_at_response）。
 *   骨架照 `taoluan`（character/yijiang.js:4614）的「chooseButton 选牌名 → backup 里 viewAs」；
 *   「手牌调整至体力上限」照 `dcbeini`（character/huicui.js:6874）的 `selectCard()` 函数形态。
 *
 * 底牌张数 = max(0, 手牌数 − 体力上限)：
 *   - 手牌 > 上限 → 选差额张当底牌，结算后自然进弃牌堆 ⇒ 手牌正好回到上限，不挂 debuff；
 *   - 手牌 ≤ 上限 → 0 张底牌，`onuse` 里摸到上限并挂 debuff（对应 Lua 的 getDiscardNum<0 分支）；
 *   - 手牌 == 上限 → 0 张底牌、不摸、不挂 debuff（Lua 的 getDiscardNum==0 分支）。
 *
 * 次数：不用 `usable: 1`——引擎的 usable 读 `getStat("triggerSkill")`，而转化牌走 backup 记的是
 *   `chashui_guijian_backup`，口径对不上；改用 `chashui_guijian_used` 临时技能标记，
 *   `addTempSkill(…, "phaseAfter")` 在回合结束时自动清。
 */
const chashui_guijian = {
	// 描述是「视为**使用**一张基本牌」——没有「打出」，故只开 chooseToUse。
	// （【闪】/【桃】在无名杀都属于「使用」窗，所以印闪印桃不受影响。）
	enable: "chooseToUse",
	filter(event, player) {
		if (player.hasSkill("chashui_guijian_used")) return false;
		// 至少有一个基本牌名能在当前窗口用出去
		return lib.inpile.some((name) => {
			if (get.type(name) != "basic") return false;
			return event.filterCard({ name, isCard: true }, player, event);
		});
	},
	filterCard(card, player) {
		// 只当「能不能发动」的开关用：底牌张数由 selectCard 锁死，所以这里放行所有手牌
		if (get.itemtype(card) == "vcard") return true;
		return get.position(card) == "h" && get.owner(card) == player;
	},
	selectCard() {
		const player = get.player();
		return Math.max(0, player.countCards("h") - player.maxHp);
	},
	hiddenCard(player, name) {
		return get.type(name) == "basic" && !player.hasSkill("chashui_guijian_used") && player.countCards("h") > 0;
	},
	chooseButton: {
		dialog(event, player) {
			const list = [];
			for (const name of lib.inpile) {
				if (get.type(name) != "basic") continue;
				if (!event.filterCard({ name, isCard: true }, player, event)) continue;
				list.push([get.translation(get.type(name)), "", name]);
			}
			if (!list.length) return ui.create.dialog("规鉴：没有可视为使用的基本牌");
			return ui.create.dialog("规鉴", [list, "vcard"]);
		},
		filter(button, player) {
			const evt = _status.event.getParent();
			return evt.filterCard({ name: button.link[2], isCard: true }, player, evt);
		},
		check(button) {
			const player = get.player();
			const card = { name: button.link[2] };
			if (_status.event.getParent().type == "phase") return player.getUseValue(card);
			return 1;
		},
		backup(links, player) {
			const name = links[0][2];
			return {
				position: "h",
				popname: true,
				filterCard(card, player2) {
					if (get.itemtype(card) == "vcard") return true;
					return get.position(card) == "h" && get.owner(card) == player2;
				},
				selectCard() {
					const player2 = get.player();
					return Math.max(0, player2.countCards("h") - player2.maxHp);
				},
				viewAs: { name, isCard: true },
				prompt: "将手牌调整至体力上限，视为使用一张【" + get.translation(name) + "】",
				async onuse(result, player2) {
					if (!player2.isIn()) return;
					player2.addTempSkill("chashui_guijian_used", "phaseAfter");
					// 底牌已在 useCard 时离开手牌；手牌仍不足上限 ⇒ 摸差额并挂 debuff
					const num = player2.maxHp - player2.countCards("h");
					if (num <= 0) return;
					await player2.draw(num);
					player2.addTempSkill("chashui_guijian_debuff", "phaseAfter");
				},
			};
		},
	},
	ai: {
		order: 6,
		result: { player: 1 },
	},
	onremove: true,
};

// 规鉴：本回合已发动（只是计数器，`usable` 口径对不上，见上面注释）
const chashui_guijian_used = {
	charlotte: true,
	mark: true,
	intro: { name: "规鉴", content: "本回合已发动过〖规鉴〗。" },
	onremove: true,
};

// 规鉴：本回合使用牌时须弃一张牌（Lua guijian_delay 挂 fk.CardUsing）
const chashui_guijian_debuff = {
	charlotte: true,
	mark: true,
	intro: { name: "规鉴", content: "本回合你使用牌时，弃置一张牌。" },
	trigger: { player: "useCard" },
	forced: true,
	popup: false,
	filter(event, player) {
		// 排除〖规鉴〗自己转化的那张牌（Lua 用 not table.contains(data.card.skillNames, skill.name)）
		if (event.skill && String(event.skill).startsWith("chashui_guijian")) return false;
		return player.countCards("he") > 0;
	},
	async content(event, trigger, player) {
		await player.chooseToDiscard("he", 1, true);
	},
	onremove: true,
};

// ============================================================
// 茶水贤设·昳（tea_ex_c）—— 莫护跋
// 原型：G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_c\skills\{lianhe,lianhe_viewas,xifeng}.lua
// ============================================================

/**
 * 连壑可选的「素材来源角色」：手牌数 > 0 且（体力值最大 或 手牌数最多）。
 *
 * 原型 lianhe.lua 的 target_filter 把「是某人的邻家」和「体力最大/手牌最多」用 and
 * 连在一起，没有退路：上一次因本技能受伤的角色存活时，只能取它上下家的手牌，而上下家
 * 本身也必须满足「体力最大或手牌最多」，否则本技能根本不能发动。
 * （list 本身已经是「最大集」，所以对 list 取交集即可。）
 */
const chashuiLianheSources = (player) => {
	const list = game.filterPlayer((current) => current.countCards("h") > 0 && (current.isMaxHp() || current.isMaxHandcard()));
	const record = player.storage.chashui_lianhe_choose;
	if (Array.isArray(record) && record.length) {
		const last = record[0];
		if (last && last.isAlive()) {
			const next = last.getNext();
			const previous = last.getPrevious();
			return list.filter((current) => current == next || current == previous);
		}
	}
	return list;
};
lib.chashuiLianheSources = chashuiLianheSources;

/** 连壑本回合已选中的【决斗】目标（原型 tea__lianhe_record-turn）。 */
const chashuiLianheRecord = (player) => {
	const record = player.storage.chashui_lianhe_record;
	return Array.isArray(record) ? record : [];
};
lib.chashuiLianheRecord = chashuiLianheRecord;

/** 连壑可以指定的【决斗】目标：本回合未以此法选中过，且【决斗】对它可用。 */
const chashuiLianheDuelTarget = (player, target) => {
	if (lib.chashuiLianheRecord(player).includes(target)) return false;
	return player.canUse({ name: "juedou", isCard: true }, target, false);
};
lib.chashuiLianheDuelTarget = chashuiLianheDuelTarget;

/**
 * 连壑（莫护跋）
 *
 * 描述：出牌阶段，你可将体力值最大或手牌数最多的角色的一张手牌当【决斗】对一名本回合未以此法
 *       选中的角色使用。若转化底牌为【杀】，此牌结算后你获得之。若因此受伤的角色存活，你下次
 *       发动此技能须选择其邻家的手牌。
 *
 * 入口：`enable:"phaseUse"`。素材不在自己手里，所以走「凭空印牌」形态（`filterCard:()=>false`
 *   + `selectCard:-1`）。
 *   **第一次选的是「素材来源」**（技能自带的 selectTarget），与原型 lianhe.lua 的 target_filter
 *   一致：只有「手牌数 > 0 且体力最大或手牌最多」的角色能被点，邻家限制生效时更窄。
 *   【决斗】的目标在 content 里另选（原型在 lianhe_viewas 交互里选），本回合已选中的不能重复。
 *   「本回合已选」存 storage.chashui_lianhe_record（回合结束由 chashui_lianhe_clear 清），
 *   「因此受伤且存活」存 storage.chashui_lianhe_choose（跨回合保留，原型 tea__lianhe_choose 同义）。
 */
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_lianhePlan = defineSkill({
	id: "chashui_lianhe",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	enable: "phaseUse",
	position: "h",
	filterCard: () => false,
	selectCard: -1,
	selectTarget: 1,
	mark: true,
	marktext: "壑",
	targetprompt: "连壑：选择一名角色，将其中一张手牌当【决斗】使用",
	intro: {
		name: "连壑",
		content(storage, player) {
			const record = lib.chashuiLianheRecord(player);
			let str = `本回合已选：${record.length ? record.map((current) => get.translation(current)).join("、") : "无"}`;
			const choose = player.storage.chashui_lianhe_choose;
			const last = Array.isArray(choose) && choose.length ? choose[0] : null;
			if (last && last.isAlive()) {
				const allow = lib.chashuiLianheSources(player);
				str += `（下次的手牌选择者必须为${get.translation(last)}的邻家，满足条件的有${allow.length ? allow.map((current) => get.translation(current)).join("、") : "无"}）`;
			}
			return str;
		},
	},
	filterTarget(card, player, target) {
		return lib.chashuiLianheSources(player).includes(target);
	},
	filter(event, player) {
		if (!lib.chashuiLianheSources(player).length) return false;
		return game.hasPlayer((current) => lib.chashuiLianheDuelTarget(player, current));
	},
	async content(event, trigger, player) {
		const source = event.targets[0];
		if (!source) return;
		const result = await player
			.choosePlayerCard(source, true, "h", `连壑：选择${get.translation(source)}的一张手牌当【决斗】使用`)
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!result.bool || !result.cards || !result.cards.length) return;
		const card = result.cards[0];
		const duel = await player
			.chooseTarget(`连壑：选择${get.translation(card)}的目标`, (card2, player2, current) => lib.chashuiLianheDuelTarget(player2, current))
			.set("ai", (current) => -get.attitude(player, current))
			.forResult();
		if (!duel.bool || !duel.targets || !duel.targets.length) return;
		const target = duel.targets[0];
		const isSha = card.name == "sha";
		player.storage.chashui_lianhe_record = lib.chashuiLianheRecord(player).concat([target]);
		player.line(source, "green");
		player.line(target, "green");
		player.markSkill("chashui_lianhe");
		// 伤害事件没有 .card（决斗走 card/standard.js 的 event.turn.damage(event.source)），
		// 所以用「伤害历史长度快照差」判谁受伤：决斗只会伤到其中一方。
		const before = {
			player: player.getHistory("damage").length,
			target: target.getHistory("damage").length,
		};
		await player.useCard(get.autoViewAs({ name: "juedou", isCard: true }, [card]), [card], target, "chashui_lianhe");
		// 底牌是【杀】：结算后收回（用出去之后它在弃牌堆）
		if (isSha && get.position(card) == "d") await player.gain(card, "gain2");
		const injured = [];
		if (player.getHistory("damage").length > before.player) injured.push(player);
		if (target != player && target.getHistory("damage").length > before.target) injured.push(target);
		const alive = injured.filter((current) => current.isAlive());
		if (alive.length) player.storage.chashui_lianhe_choose = alive;
		else delete player.storage.chashui_lianhe_choose;
		player.markSkill("chashui_lianhe");
	},
	ai: {
		order: 4,
		result: {
			target(player, target) {
				return get.attitude(player, target) > 0 ? 0.5 : 1;
			},
		},
	},
	onremove(player) {
		delete player.storage.chashui_lianhe_choose;
		delete player.storage.chashui_lianhe_record;
	},
	group: ["clear"],
	sub: {
		clear: {
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { global: "phaseAfter" },
		filter(event, player) {
			return lib.chashuiLianheRecord(player).length > 0;
		},
		async content(event, trigger, player) {
			delete player.storage.chashui_lianhe_record;
			player.markSkill("chashui_lianhe");
		},
		},
	},
});
const chashui_lianhe = chashui_lianhePlan.skills.chashui_lianhe;
const chashui_lianhe_clear = chashui_lianhePlan.skills.chashui_lianhe_clear;

/**
 * 连壑·清理：本回合已选中的【决斗】目标在回合结束后作废（原型 tea__lianhe_record-turn 的 `-turn`）。
 */


/**
 * 熄锋（莫护跋）
 *
 * 描述：每回合限一次，当你造成或受到伤害后，你可以防止此伤害，令受伤角色获得其装备区所有牌，
 *       并弃置 X 张牌（X 为其获得牌数），然后你可以将其以此法弃置的【杀】分配给任意名角色。
 *
 * 入口：`damageBegin3`（`content.js:11186`，此时还能 `trigger.cancel()`；damageBegin4 在
 *   `:11190` 且没有 await，改不了）。source / player 双挂：造成、受到各一条，同一事件只会派发一次。
 */
const chashui_xifeng = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	trigger: { source: "damageBegin3", player: "damageBegin3" },
	usable: 1,
	filter(event, player) {
		return event.player && event.player.isIn();
	},
	async content(event, trigger, player) {
		const to = trigger.player;
		player.logSkill("chashui_xifeng", to);
		trigger.cancel();
		const equips = to.getCards("e");
		// gain 之后 to 的手牌+装备恒 >= equips.length ⇒ 原来的 Math.min 是 no-op
		const num = equips.length;
		if (equips.length) await to.gain(equips, "give2");
		if (!to.isIn() || !num) return;
		const result = await to.chooseToDiscard(num, true, "he", `熄锋：弃置 ${num} 张牌`).forResult();
		const shas = (result.cards || []).filter((card) => card.name == "sha");
		if (!shas.length || !player.isIn()) return;
		// 一次性选目标再按序分配（旧版逐张 chooseTarget：弃出 3 张杀就弹 3 次框）
		const picked = await player
			.chooseTarget(`熄锋：将${shas.map((card) => get.translation(card)).join("、")}分配给任意名角色`, [1, shas.length], (c, p, current) => current.isIn())
			.set("ai", (current) => get.attitude(player, current))
			.forResult();
		if (!picked.bool || !picked.targets?.length) return;
		for (let i = 0; i < shas.length; i++) {
			if (!player.isIn()) return;
			const receiver = picked.targets[i % picked.targets.length];
			if (receiver?.isIn()) await receiver.gain(shas[i], "gain2");
		}
	},
	check(event, player) {
		// 触发技意愿在顶层 check（ai.result 对触发技确认不生效）：
		// 防自己受伤基本划算；替别人防伤只替友方（对敌人防伤=帮敌人免伤）
		const to = event.player;
		if (to == player) return true;
		return get.attitude(player, to) > 0;
	},
	ai: {
		order: 5,
	},
};

// ============================================================
// 茶水贤设·昳（tea_ex_c）—— 陈祇
// 原型：G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_c\skills\{chengquan,roujia}.lua
// ============================================================

/**
 * 承权（陈祇）
 *
 * 描述：一号位的结束阶段，你可以令攻击范围内包含其的所有角色选择一项：1.摸一张牌并交给其一张
 *       手牌；2.对其使用一张【杀】。
 *
 * 入口：`phaseJieshuBegin`（结束阶段开始，content.js 的 phaseJieshu 事件）。
 *   一号位判据用 `getSeatNum() === 1`（原生 `character/huicui.js:11095` 同款）。
 */
const chashui_chengquan = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	trigger: { global: "phaseJieshuBegin" },
	filter(event, player) {
		const lord = event.player;
		if (!lord || lord == player || !lord.isIn()) return false;
		if (lord.getSeatNum() !== 1) return false;
		return game.hasPlayer((current) => current != lord && current.inRange(lord));
	},
	async content(event, trigger, player) {
		const lord = trigger.player;
		player.logSkill("chashui_chengquan", lord);
		const targets = game.filterPlayer((current) => current != lord && current.inRange(lord)).sortBySeat(player);
		for (const current of targets) {
			// 某个目标离场只跳过它自己（旧版 `return` 会中断后续所有目标）
			if (!current.isIn()) continue;
			if (!lord.isIn()) return;
			// 原型 chengquan.lua 的 targets = getOtherPlayers(target) 过滤 inMyAttackRange(target)，包含陈祇自己
			// 「对其使用一张【杀】」必须真的有【杀】并消耗（原型走 askToUseCard）
			const canSha = current.countCards("hs", (one) => get.name(one) == "sha") > 0 && current.canUse({ name: "sha", isCard: true }, lord);
			let control = "摸一张牌并交给其一张手牌";
			if (canSha) {
				const result = await current
					.chooseControl(["摸一张牌并交给其一张手牌", "对其使用一张【杀】"])
					.set("ai", () => (get.attitude(current, lord) < 0 ? 1 : 0))
					.forResult();
				control = result.control || control;
			}
			if (control == "对其使用一张【杀】" && canSha) {
				const pick = await current
					.chooseCard("hs", "承权：选择一张【杀】对" + get.translation(lord) + "使用", true, (one) => get.name(one) == "sha")
					.set("ai", (one) => 4 - get.value(one))
					.forResult();
				if (pick?.cards?.length) await current.useCard(pick.cards[0], [lord]);
			} else {
				await current.draw(1);
				if (current.isIn() && lord.isIn() && current.countCards("h") > 0) await current.chooseToGive(lord, 1, true, "承权：交给其一张手牌");
			}
		}
	},
	check(event, player) {
		const lord = event.player;
		return lord && lord.getSeatNum() === 1 && get.attitude(player, lord) < 0;
	},
};

/**
 * 柔嘉（陈祇）
 *
 * 描述：当一名角色使用【杀】结算结束后，若此【杀】未对目标角色造成伤害，你可以令当前回合角色
 *       摸一张牌。
 *
 * 入口：`useCardAfter`（全局）。「未造成伤害」用**全局历史 `everything`** 筛 `evt.name === "damage"`，
 *   再按 `evt.card === trigger.card` 认牌（伤害事件自带触发牌：player.js 的 damage() 会从父 useCard 继承 `.card`）。
 *   注意不能用 `game.getGlobalHistory("damage", …)` —— 全局历史没有 damage 这个键（只有玩家自己的 actionHistory 有）。
 */
const chashui_roujia = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		if (!event.card || event.card.name != "sha") return false;
		// ⚠️ 全局历史（_status.globalHistory）只有 cardMove/custom/useCard/changeHp/everything 五个键
		//   （noname/status/index.js:31-39、content.js:4117-4123 两处初始化），
		//   **没有 "damage"** —— 传 "damage" 会让 game.getGlobalHistory 拿到 undefined 再 .filter 崩掉
		//   （noname/game/index.js:1122-1137）。伤害历史只在玩家自己的 actionHistory 里。
		if (game.getGlobalHistory("everything", (evt) => evt.name === "damage" && evt.card === event.card).length) return false;
		const current = _status.currentPhase;
		return current && current.isAlive();
	},
	async content(event, trigger, player) {
		const current = _status.currentPhase;
		if (!current || !current.isAlive()) return;
		player.logSkill("chashui_roujia", current);
		await current.draw(1);
	},
	check(event, player) {
		const current = _status.currentPhase;
		return current && current.isAlive() && get.attitude(player, current) > 0;
	},
};

// ============================================================
// 茶水贤设·昳（tea_ex_c）—— 济火
// 原型：G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_c\skills\{suizuo,shanmeng}.lua
// ============================================================

/** 随佐本轮已发动次数（每轮重置，X = 体力值） */
const chashuiSuizuoCount = (player) => {
	const storage = player.storage.chashui_suizuo_count;
	if (!storage || storage.round !== game.roundNumber) return 0;
	return storage.count || 0;
};
const chashuiSuizuoAdd = (player) => {
	player.storage.chashui_suizuo_count = { round: game.roundNumber, count: chashuiSuizuoCount(player) + 1 };
	// 刷新 mark 说明里的「本轮已发动/可用」
	if (player.hasSkill("chashui_suizuo")) player.markSkill("chashui_suizuo");
};
lib.chashuiSuizuoCount = chashuiSuizuoCount;

/**
 * 随佐·横置（济火）
 *
 * 每轮开始时，你可以横置你和一名其他角色（若你已横置，则改为横置两名其他角色），令所有已横置
 * 的角色各摸一张牌。
 */


/**
 * 随佐·回合（济火）
 *
 * 一名已横置的角色回合开始时，你可以摸一张牌并交给其一张牌。（同样受每轮 X 次限制）
 */


// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_suizuoPlan = defineSkill({
	id: "chashui_suizuo",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	// 「每轮限X次（X为体力值）」——不挂 mark 玩家完全看不到还剩几次
	mark: true,
	marktext: "佐",
	intro: {
		name: "随佐",
		content(storage, player) {
			const used = lib.chashuiSuizuoCount ? lib.chashuiSuizuoCount(player) : 0;
			return `<li>本轮已发动：${used} 次<br><li>本轮可用：${Math.max(player.hp - used, 0)} 次（X = 体力值 ${player.hp}）`;
		},
	},
	onremove(player) {
		delete player.storage.chashui_suizuo_count;
	},
	group: ["round", "turn"],
	sub: {
		round: {
		// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
		popup: false,
		// roundStart 是在 phase 事件上触发的（content.js:4145 `event.trigger("roundStart")`），
		// 它的 event.player 是回合角色；写 player: 只会在济火自己回合开新一轮时才触发，其余轮次全部漏掉。
		trigger: { global: "roundStart" },
		filter(event, player) {
			if (chashuiSuizuoCount(player) >= player.hp) return false;
			const need = player.isLinked() ? 2 : 1;
			return game.countPlayer((current) => current != player) >= need;
		},
		async content(event, trigger, player) {
			player.logSkill("chashui_suizuo");
			const need = player.isLinked() ? 2 : 1;
			const targets = [];
			for (let i = 0; i < need; i++) {
				if (!player.isIn()) return;
				const picked = await player
					.chooseTarget(`随佐：横置一名其他角色（${i + 1}/${need}）`, (card, player2, current) => current != player && !targets.includes(current))
					.set("ai", (current) => -get.attitude(player, current))
					.forResult();
				if (!picked.bool || !picked.targets || !picked.targets.length) break;
				targets.push(picked.targets[0]);
			}
			// 描述「横置你和一名其他角色（若你已横置，则改为横置两名其他角色）」是定额：
			// 中途取消导致少选时整体不结算（旧版只判 targets.length，已横置时选 1 名也能发动）
			if (targets.length < need) return;
			lib.chashuiSuizuoAdd(player);
			if (!player.isLinked()) await player.link(true);
			for (const current of targets) {
				if (current.isIn() && !current.isLinked()) await current.link(true);
			}
			const linked = game.filterPlayer((current) => current.isLinked());
			if (linked.length) await game.asyncDraw(linked);
		},
		check(event, player) {
			// 自己必摸 1（未横置时）；给敌方也横置摸牌是代价，整体仍倾向发动
			return true;
		},
		},
		turn: {
		// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
		popup: false,
		trigger: { global: "phaseBegin" },
		filter(event, player) {
			if (chashuiSuizuoCount(player) >= player.hp) return false;
			// 描述没有「其他角色」限定 ⇒ 自己已横置时，自己的回合也能发动
			// （原型同样允许，只是不给自己牌）
			return event.player && event.player.isLinked() && event.player.isIn();
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			if (target == player) player.logSkill("chashui_suizuo");
			else player.logSkill("chashui_suizuo", target);
			lib.chashuiSuizuoAdd(player);
			await player.draw(1);
			if (target == player) return;
			if (!player.isIn() || !target.isIn() || !player.countCards("h")) return;
			await player.chooseToGive(target, 1, true, "随佐：交给其一张牌");
		},
		},
	},
});
const chashui_suizuo = chashui_suizuoPlan.skills.chashui_suizuo;
const chashui_suizuo_round = chashui_suizuoPlan.skills.chashui_suizuo_round;
const chashui_suizuo_turn = chashui_suizuoPlan.skills.chashui_suizuo_turn;

/**
 * 山盟（济火）
 *
 * 描述：每回合限一次，当一名已横置的角色成为牌的目标时，你可以令其他已横置的角色依次交给其
 *       任意张牌。
 *
 * 入口：`useCardToTargeted`（全局，逐目标派发）。`usable:1` 即每回合一次。
 *   `chooseToGive` 的 `[0, Infinity]` 会被 `get.itemtype` 认成 "select"，即「任意张」。
 */
const chashui_shanmeng = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	trigger: { global: "useCardToTargeted" },
	usable: 1,
	filter(event, player) {
		const target = event.target;
		// 描述「当一名已横置的角色成为牌的目标时」没有排除自己 ⇒ 自己成为目标也能发动
		// （原型 shanmeng.lua 用 TargetConfirming，同样不限 target 是否为拥有者）
		if (!target || !target.isIn() || !target.isLinked()) return false;
		// 原型 shanmeng.lua 用 room:getOtherPlayers(target)：除目标外的所有已横置角色，含济火自己
		return game.hasPlayer((current) => current != target && current.isLinked() && current.countCards("he") > 0);
	},
	async content(event, trigger, player) {
		const target = trigger.target;
		player.logSkill("chashui_shanmeng", target);
		const givers = game.filterPlayer((current) => current != target && current.isLinked()).sortBySeat(player);
		for (const current of givers) {
			if (!current.isIn() || !target.isIn() || !current.countCards("he")) continue;
			await current.chooseToGive(target, [0, Infinity], true, "山盟：交给其任意张牌");
		}
	},
	check(event, player) {
		return get.attitude(player, event.target) > 0;
	},
};

// ============================================================
// 茶水贤设·昳（tea_ex_c）—— 丁固
// 原型：G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_c\skills\{mengsong,xiangqian,guye}.lua
// ============================================================

/**
 * 梦松（丁固）
 *
 * 描述：判定阶段/摸牌阶段，你可以改为将判定区里所有牌/牌堆顶的牌当做一张【树上开花】使用。
 *
 * 入口：`phaseJudgeBefore` / `phaseDrawBefore`（原生 `character/diy.js:3993-4003` nsjuxian2 用
 *   `trigger.cancel()` 跳阶段）。【树上开花】= `kaihua`（`card/zhulu.js:191`），只在逐鹿牌包
 *   启用时存在，所以 filter 里要 `lib.card.kaihua` 守卫。
 */
const chashui_mengsong = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	trigger: { player: ["phaseJudgeBefore", "phaseDrawBefore"] },
	filter(event, player) {
		if (!lib.card.kaihua) return false;
		const isJudge = event.name == "phaseJudge";
		// ⚠️ 摸牌阶段分支只能「窥视」牌堆顶：get.cards(1) 会把牌移出牌堆（get/index.js:3478-3509），
		//    在 filter 里调用=每次评估泄漏一张（取出的牌无人认领就悬空丢失）。
		const cards = isJudge ? player.getCards("j") : [ui.cardPile?.firstChild].filter(Boolean);
		if (!cards.length) return false;
		return player.canUse(get.autoViewAs({ name: "kaihua", isCard: true }, cards), player);
	},
	async content(event, trigger, player) {
		const isJudge = trigger.name == "phaseJudge";
		const cards = isJudge ? player.getCards("j") : get.cards(1);
		if (!cards.length) return;
		const vcard = get.autoViewAs({ name: "kaihua", isCard: true }, cards);
		if (!player.canUse(vcard, player)) return;
		player.logSkill("chashui_mengsong");
		trigger.cancel();
		await player.useCard(vcard, cards, player, "chashui_mengsong");
	},
	check(event, player) {
		return player.getUseValue({ name: "kaihua" }) > 0;
	},
};

/**
 * 相谦（丁固）
 *
 * 描述：出牌阶段限一次，你可观看一名其他角色的手牌，若你手牌中有与其手牌中牌名相同的牌，
 *       你可重铸之。若如此做，其观看你的手牌，若其手牌中有与你手牌中牌名相同的牌，其可重铸之。
 */
const chashui_xiangqian = {
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.countCards("h") > 0);
	},
	async content(event, trigger, player) {
		const picked = await player
			.chooseTarget("相谦：观看一名其他角色的手牌", (card, player2, current) => current != player && current.countCards("h") > 0)
			.set("ai", (current) => -get.attitude(player, current))
			.forResult();
		if (!picked.bool || !picked.targets || !picked.targets.length) return;
		const target = picked.targets[0];
		player.logSkill("chashui_xiangqian", target);
		await player.viewHandcards(target);
		// 我重铸与其同名的牌
		const theirs = target.getCards("h").map((card) => card.name);
		const mine = player.getCards("h").filter((card) => theirs.includes(card.name));
		let recasted = false;
		if (mine.length) {
			// 描述是「你可重铸**之**」——「之」指前述「与其手牌中牌名相同的牌」，
			// 是复数集合，不是「一张」⇒ selectCard 用 [1, mine.length] 让玩家自选张数。
			// （chooseCard 参数按类型识别：数组→selectCard，见 player.js:6363-6365）
			const go = await player.chooseBool("相谦：是否重铸与其同名的牌？").set("ai", () => true).forResult();
			if (go.bool) {
				const res = await player.chooseCard("h", [1, mine.length], true, "相谦：选择要重铸的牌", (card) => mine.includes(card)).forResult();
				if (res.bool && res.cards && res.cards.length) {
					await player.recast(res.cards);
					recasted = true;
				}
			}
		}
		// 描述是「若如此做，其观看你的手牌」：第一阶段没重铸就到此为止
		if (!recasted) return;
		if (!player.isIn() || !target.isIn()) return;
		// 其重铸与我同名的牌
		await target.viewHandcards(player);
		const myNames = player.getCards("h").map((card) => card.name);
		const yours = target.getCards("h").filter((card) => myNames.includes(card.name));
		if (!yours.length) return;
		const go2 = await target.chooseBool("相谦：是否重铸与其同名的牌？").set("ai", () => true).forResult();
		if (!go2.bool) return;
		const res2 = await target.chooseCard("h", [1, yours.length], true, "相谦：选择要重铸的牌", (card) => yours.includes(card)).forResult();
		if (res2.bool && res2.cards && res2.cards.length) await target.recast(res2.cards);
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
};

/**
 * 固业（丁固）
 *
 * 描述：每个阶段结束时，若有角色于此阶段不因使用或打出而失去至少两张牌，你可令其摸一张牌。
 *
 * 入口：`phaseAnyEnd`（会被展开成各 `phaseXxxEnd`，事件就是该阶段事件本身，`event.name` =
 *   "phaseUse" 这类）。判「此阶段」用 `evt.getParent(event.name) === event`。
 */
const chashui_guye = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	trigger: { global: "phaseAnyEnd" },
	filter(event, player) {
		if (!event.name || !event.name.startsWith("phase")) return false;
		return game.hasPlayer((current) => lib.skill.chashui_guye.lostCount(event, current) >= 2);
	},
	lostCount(event, current) {
		const loses = current.getHistory("lose", (evt) => {
			if (evt.getParent(event.name) !== event) return false;
			const parent = evt.parent;
			if (parent && (parent.name == "useCard" || parent.name == "respond")) return false;
			return true;
		});
		let num = 0;
		for (const evt of loses) num += (evt.cards2 || evt.cards || []).length;
		return num;
	},
	async content(event, trigger, player) {
		const targets = game.filterPlayer((current) => lib.skill.chashui_guye.lostCount(trigger, current) >= 2);
		if (!targets.length) return;
		// 描述「你可令其摸一张牌」= 由技能拥有者挑人（原型 guye.lua:36-46 用
		// `askToChoosePlayers{min_num=1,max_num=999}`）。旧版对达标角色全部自动摸 1，跳过挑选。
		const result = await player
			.chooseTarget("固业：令至多" + get.cnNumber(targets.length) + "名角色各摸一张牌", [1, targets.length], (card, player2, target) => targets.includes(target))
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!result?.bool || !result.targets?.length) return;
		player.logSkill("chashui_guye", result.targets);
		for (const current of result.targets.sortBySeat(player)) {
			if (current.isIn()) await current.draw(1);
		}
	},
	check(event, player) {
		return game.hasPlayer((current) => get.attitude(player, current) > 0 && lib.skill.chashui_guye.lostCount(event, current) >= 2);
	},
};

// ============================================================
// 茶水贤设·昳（tea_ex_c）—— 康僧会
// 原型：G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_c\skills\{shanji,debao}.lua
// ============================================================

/**
 * 善济（康僧会）
 *
 * 描述：出牌阶段限一次，你可以弃置所有手牌，令所有已受伤的角色依次选择一项：1.回复 1 点体力；
 *       2.复原武将牌并摸一张牌。
 *
 * 注：「复原武将牌」= 取消横置 + 翻回正面（无名杀没有 `player.reset()`，原生
 *   `character/newjiang.js:7117` 用 `link(false)` + `turnOver(false)`）。
 */
const chashui_shanji = {
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		// 原型 shanji.lua 的 can_use 要求 `#player:getCardIds("h") > 0`：
		// 空手牌时发动等于「白得全场回复/复原」，必须挡住
		if (!player.countCards("h")) return false;
		return game.hasPlayer((current) => current.isDamaged());
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_shanji");
		const hand = player.getCards("h");
		if (hand.length) await player.discard(hand);
		for (const current of game.filterPlayer((c) => c.isDamaged()).sortBySeat(player)) {
			if (!current.isDamaged()) continue;
			const result = await current
				.chooseControl(["回复1点体力", "复原武将牌并摸一张牌"])
				.set("ai", () => (current.isTurnedOver() || current.isLinked() ? 1 : 0))
				.forResult();
			if (result.index === 1) {
				await current.link(false);
				await current.turnOver(false);
				await current.draw(1);
			} else {
				await current.recover();
			}
		}
	},
	ai: {
		order: 6,
		result: {
			player: 1,
		},
	},
};

/**
 * 德报（康僧会）
 *
 * 描述：当你进入濒死状态时，其他角色可以依次将任意张手牌置于牌堆顶，若以此法置于牌堆顶的牌
 *       不少于X张，你回复1点体力并摸X张牌(X为你的手牌数)，然后此技能本轮失效。
 *
 * 注：X 要在发动瞬间先存下来（中间可能有人给你牌）。置顶用 `lose(cards, ui.cardPile, "insert")`。
 *     描述里的「可以」属于**其他角色**（各自决定放不放牌），技能本身没有「你可以发动」这层选择 ⇒
 *     写 `forced: true`，濒死时直接进入 content，不再弹「是否发动德报？」的确认框。
 */
const chashui_debao = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	// 无「你可以发动」⇒ 强制发动（引擎在 content.js:3595 对 forced 直接置 result={bool:true}，跳过询问与 check）
	forced: true,
	trigger: { player: "dying" },
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.countCards("h") > 0);
	},
	async content(event, trigger, player) {
		const x = player.countCards("h");
		player.logSkill("chashui_debao");
		let total = 0;
		for (const current of game.filterPlayer((c) => c != player).sortBySeat(player)) {
			if (!current.isIn() || !current.countCards("h")) continue;
			// 描述「其他角色**可以**依次…」⇒ 这里的选择不能 forced（forced 会去掉取消按钮，等于逼人点确定）
			const result = await current.chooseCard("h", [0, Infinity], "德报：将任意张手牌置于牌堆顶").forResult();
			if (!result.bool || !result.cards || !result.cards.length) continue;
			await current.lose(result.cards, ui.cardPile, "insert");
			total += result.cards.length;
		}
		// 「…不少于X张，你回复1点体力并摸X张牌，然后此技能本轮失效」
		// 「然后」挂在条件成立之后 ⇒ 没达标就不失效（旧版无条件失效，白掉一次濒死机会）。
		// x === 0 时（发动瞬间空手）本就没有可回复/可摸的收益，按原型同样视为未达成。
		if (x > 0 && total >= x) {
			await player.recover();
			await player.draw(x);
			if (player.isIn()) {
				// 「此技能本轮失效」：disableSkill 才会让技能描述变灰（tempBanSkill 不会）
				player.disableSkill("chashui_debao_disabled", "chashui_debao");
				player.addTempSkill("chashui_debao_disabled", "roundStart");
			}
		}
	},
	subSkill: {
		disabled: {
			charlotte: true,
			sub: true,
			onremove(player) {
				player.enableSkill("chashui_debao_disabled");
			},
		},
	},
};

// ============================================================
// 茶水贤设·昳（tea_ex_c）—— 袁隗
// 原型：G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_c\skills\{chizong,yihuo}.lua
// ============================================================

/**
 * 持宗（袁隗）
 *
 * 描述：出牌阶段各限一次，你可以令一名手牌数最多/体力值最大的角色回复 1 点体力/摸两张牌。
 *       当你每回合对同一名角色发动两次“持宗”后，其视为使用一张【万箭齐发】。
 *
 * 两项各限一次用 `storage.chashui_chizong_used` 计（`chashui_chizong_clear` 在 phaseAfter 清），
 * 「对同一人两次」用 `storage.chashui_chizong_targets` 计。
 */
const chashui_chizong = {
	enable: "phaseUse",
	mark: true,
	marktext: "宗",
	intro: {
		content(storage, player) {
			const used = player?.storage?.chashui_chizong_used || {};
			const list = [];
			if (used.recover) list.push("回复项");
			if (used.draw) list.push("摸牌项");
			return list.length ? "本阶段已用：" + list.join("、") + "。" : "本阶段「回复/摸牌」两项均未用。";
		},
	},
	filter(event, player) {
		const used = player.storage.chashui_chizong_used || {};
		if (!used.recover && game.hasPlayer((current) => current.isMaxHandcard() && current.isDamaged())) return true;
		if (!used.draw && game.hasPlayer((current) => current.isMaxHp())) return true;
		return false;
	},
	async content(event, trigger, player) {
		const used = player.storage.chashui_chizong_used || {};
		const modes = [];
		if (!used.recover && game.hasPlayer((current) => current.isMaxHandcard() && current.isDamaged())) modes.push(["recover", "令一名手牌数最多的角色回复1点体力"]);
		if (!used.draw && game.hasPlayer((current) => current.isMaxHp())) modes.push(["draw", "令一名体力值最大的角色摸两张牌"]);
		if (!modes.length) return;
		let mode = modes[0][0];
		if (modes.length > 1) {
			const result = await player.chooseControl(modes.map((item) => item[1])).set("ai", () => 0).forResult();
			mode = modes[result.index || 0][0];
		}
		// ⚠️ 先记已用再选目标：只要选定了项就消耗该项，避免 AI 在 chooseTarget 取消后 used 未推进 →
		// filter 仍为 true → AI 反复发动同一项（无限发动）。见 AGENTS §7「phaseUse 每条分支必须推进状态」。
		used[mode] = true;
		player.storage.chashui_chizong_used = used;
		// 用 addSkill 而不是 addTempSkill：addTempSkill 的 expire 会在钩子派发**之前**就把技能移除
		// （gameEvent.js:541-573 在 doing.addList 之前清 tempSkills），子技能的 content 永远跑不到。
		player.addSkill("chashui_chizong_clear");
		if (!player.isIn()) return;
		const filter = mode == "recover" ? (current) => current.isMaxHandcard() && current.isDamaged() : (current) => current.isMaxHp();
		const picked = await player.chooseTarget(mode == "recover" ? "持宗：令一名手牌数最多的角色回复1点体力" : "持宗：令一名体力值最大的角色摸两张牌", (card, player2, current) => filter(current)).set("ai", (current) => get.attitude(player, current)).forResult();
		if (!picked.bool || !picked.targets || !picked.targets.length) return;
		const target = picked.targets[0];
		player.logSkill("chashui_chizong", target);
		if (mode == "recover") await target.recover();
		else await target.draw(2);
		// 对同一角色累计两次 → 其视为使用【万箭齐发】
		const counts = player.storage.chashui_chizong_targets || {};
		counts[target.playerid] = (counts[target.playerid] || 0) + 1;
		player.storage.chashui_chizong_targets = counts;
		if (counts[target.playerid] >= 2 && target.isIn()) {
			delete counts[target.playerid];
			player.storage.chashui_chizong_targets = counts;
			game.log(target, "视为使用了一张【万箭齐发】");
			await target.chooseUseTarget({ name: "wanjian", isCard: true }, true);
		}
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
	onremove(player) {
		delete player.storage.chashui_chizong_used;
		delete player.storage.chashui_chizong_targets;
	},
};

const chashui_chizong_clear = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "phaseUseAfter" },
	filter: () => true,
	content(event, trigger, player) {
		delete player.storage.chashui_chizong_used;
		delete player.storage.chashui_chizong_targets;
		player.removeSkill("chashui_chizong_clear");
	},
};

/**
 * 溢祸（袁隗）
 *
 * 描述：当你受到 1 点伤害后，你可以摸一至三张牌，然后令手牌数最多的角色依次弃置 X 张手牌
 *       （X 为需要弃牌的角色数）。
 */
const chashui_yihuo = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	trigger: { player: "damageEnd" },
	filter(event, player) {
		// 「受到1点伤害后」= 每受到 1 点伤害各触发一次（原生口径：遗计 yiji
		// character/standard.js:882-891 → filter `event.num > 0` + getIndex 返回 event.num）。
		// 旧版 `event.num == 1` 让 2 点以上伤害完全不触发。
		return event.num > 0;
	},
	getIndex(event) {
		return event.num;
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_yihuo");
		const result = await player
			.chooseControl(["摸一张牌", "摸两张牌", "摸三张牌"])
			.set("ai", () => 1)
			.forResult();
		await player.draw((result.index || 0) + 1);
		const targets = game.filterPlayer((current) => current.isMaxHandcard()).sortBySeat(player);
		const num = targets.length;
		for (const current of targets) {
			if (!current.isIn()) continue;
			const count = Math.min(num, current.countCards("h"));
			if (!count) continue;
			await current.chooseToDiscard(count, true, "h", `溢祸：弃置 ${count} 张手牌`);
		}
	},
	check(event, player) {
		return true;
	},
};

// ============================================================
// 茶水贤设·昳（tea_ex_c）—— 北宫伯玉
// 原型：G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_c\skills\{woluan,raoguo}.lua
// ============================================================

/**
 * 握乱（北宫伯玉）
 *
 * 描述：锁定技，准备阶段，你选择任意项：1.你摸 X 张牌；2.你弃置 X 名角色各一张牌；
 *       3.本回合你使用的第一张牌执行 X 次（至少为1）；4.本回合你的攻击范围+X
 *       （X 为你未选择的项数）。
 *
 * 「执行 X 次」只能走 `trigger.effectCount`（引擎 content.js:9170-9171 初始化、9630/9640 消费）；
 * 字段名 `additionalEffect` 在无名杀**不存在**。
 */
const chashui_woluan = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	trigger: { player: "phaseZhunbeiBegin" },
	forced: true,
	locked: true,
	filter: () => true,
	async content(event, trigger, player) {
		player.logSkill("chashui_woluan");
		const items = [
			["woluan_draw", "1. 摸X张牌"],
			["woluan_discard", "2. 弃X名角色各一张牌"],
			["woluan_effect", "3. 本回合首张牌执行X次"],
			["woluan_range", "4. 本回合攻击范围+X"],
		];
		const dialog = ui.create.dialog("握乱：请选择任意项（X 为未选择的项数）", [items, "tdnodes"]);
		const result = await player
			.chooseButton(dialog, [1, 4])
			.set("filterButton", (button) => !!button.link)
			.set("ai", (button) => (button.link == "woluan_draw" ? 3 : 2))
			.forResult();
		if (!result.bool || !result.links || !result.links.length) return;
		const chosen = result.links;
		// 描述只对项 3 说「至少为 1」；其余三项 X = 未选择的项数，可以选满 4 项得到 X=0
		const num = 4 - chosen.length;
		if (chosen.includes("woluan_draw")) {
			await player.draw(num);
		}
		if (chosen.includes("woluan_discard")) {
			// 描述是「X **名**角色各一张牌」⇒ 目标必须互不相同（原型 woluan.lua:41-47 用
			// askToChoosePlayers，天然去重；逐个 chooseTarget 时必须自己排除已选）。
			const count = Math.min(num, game.countPlayer((current) => current != player && current.countCards("he") > 0));
			const used = [];
			for (let i = 0; i < count; i++) {
				if (!player.isIn()) return;
				const picked = await player
					.chooseTarget(`握乱：弃置一名角色的一张牌（${i + 1}/${count}）`, (card, player2, current) => current != player && current.countCards("he") > 0 && !used.includes(current))
					.set("ai", (current) => -get.attitude(player, current))
					.forResult();
				if (!picked.bool || !picked.targets || !picked.targets.length) break;
				const target = picked.targets[0];
				used.push(target);
				if (!target.countCards("he")) continue;
				await player.discardPlayerCard(target, true, "he", "握乱：弃置其一张牌");
			}
		}
		if (chosen.includes("woluan_effect")) {
			player.storage.chashui_woluan_addition = Math.max(1, num);
			player.addTempSkill("chashui_woluan_effect", "phaseAfter");
		}
		if (chosen.includes("woluan_range")) {
			// 呈现同安境/精弩/平越（R18）：`addMark` + `countMark` 托管标记，
			// 不写 `mark: true`（那是「加技能即自动挂标」的开关，连 num=0 的「+0」标记也会挂出来）。
			player.addTempSkill("chashui_woluan_range", "phaseAfter");
			if (num > 0) player.addMark("chashui_woluan_range", num, false);
		}
	},
};

const chashui_woluan_effect = {
	charlotte: true,
	forced: true,
	popup: false,
	trigger: { player: "useCard" },
	filter(event, player) {
		return (player.storage.chashui_woluan_addition || 0) > 0;
	},
	content(event, trigger, player) {
		const num = player.storage.chashui_woluan_addition || 0;
		delete player.storage.chashui_woluan_addition;
		if (num > 1) trigger.effectCount += num - 1;
		player.removeSkill("chashui_woluan_effect");
	},
};

const chashui_woluan_range = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	markimage: "image/card/attackRange.png",
	intro: {
		name: "握乱",
		content(storage, player) {
			return `<li>本回合攻击范围+${storage}<br><li>当前攻击范围：${player.getAttackRange(false)}`;
		},
	},
	mod: {
		attackRange(player, num) {
			return num + player.countMark("chashui_woluan_range");
		},
	},
	onremove(player) {
		delete player.storage.chashui_woluan_range;
		delete player.storage.chashui_woluan_addition;
	},
};

/**
 * 扰国（北宫伯玉）
 *
 * 描述：锁定技，你使用【杀】和普通锦囊牌无距离和次数限制且仅能指定你攻击范围内与你距离
 *       最远的角色为目标。
 *
 * 关键：要用 `mod.playerEnabled`，**不是** `mod.targetEnabled`——`lib.filter.targetEnabled`
 *   （noname/library/index.js:11379-11407）先查 `playerEnabled`（第 6 参是使用者）并短路，
 *   `targetEnabled` 查的是目标自己的技能，挂在使用者身上无效。范本 `character/newjiang.js:6363`。
 */
const chashui_raoguo = {
	locked: true,
	forced: true,
	mod: {
		targetInRange(card, player) {
			if (lib.skill.chashui_raoguo.applies(card)) return true;
		},
		cardUsable(card, player, num) {
			if (lib.skill.chashui_raoguo.applies(card)) return Infinity;
		},
		playerEnabled(card, player, target) {
			if (!lib.skill.chashui_raoguo.applies(card)) return;
			if (target == player) return;
			// 只否决「不是最远」的目标；是最远时**返回 undefined** 交回牌自身的 filterTarget
			// （`lib/index.js:11103-11110`：playerEnabled 一旦给出非 unchanged 值就短路，
			//  返回 true 会让火攻/借刀/顺手对无手牌、无武器、超距离的角色全部可选）
			if (!lib.skill.chashui_raoguo.farthest(player, target)) return false;
		},
	},
	applies(card) {
		if (!card) return false;
		if (card.name == "sha") return true;
		return get.type(card) == "trick";
	},
	farthest(player, target) {
		if (!player.inRange(target)) return false;
		let max = -1;
		for (const current of game.filterPlayer((c) => c != player && player.inRange(c))) {
			max = Math.max(max, player.distanceTo(current));
		}
		return max >= 0 && player.distanceTo(target) == max;
	},
};

// ============================================================
// 茶水贤设·昳（tea_ex_c）—— 何曾
// 原型：G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_c\skills\{shiwan,xiluan}.lua
// ============================================================

/**
 * 食万（何曾）
 *
 * 描述：准备阶段，你可以摸一张牌，然后令手牌数最多的角色依次弃至少 X 张牌，若这些角色不包含你，
 *       你可以重复此流程（X 为你此阶段的摸牌数）。
 */
const chashui_shiwan = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	trigger: { player: "phaseZhunbeiBegin" },
	async content(event, trigger, player) {
		player.logSkill("chashui_shiwan");
		let x = 0;
		while (true) {
			if (!player.isIn()) return;
			if (x > 0) {
				const go = await player.chooseBool(`食万：是否重复此流程？（X = ${x}）`).set("ai", () => true).forResult();
				if (!go.bool) return;
			}
			await player.draw(1);
			x++;
			const targets = game.filterPlayer((current) => current.isMaxHandcard()).sortBySeat(player);
			for (const current of targets) {
				if (!current.isIn()) continue;
				if (!current.countCards("he")) continue;
				// 描述是「弃至少 X 张**牌**」（原型 include_equip=true）；只给 "h" 会把
				// 装备区也算进弃牌范围的角色卡住，且只有装备的角色会被上面 continue 掉
				await current.chooseToDiscard("he", `食万：弃置至少 ${x} 张牌`, [Math.min(x, current.countCards("he")), Infinity], true);
			}
			if (targets.includes(player)) return;
		}
	},
	check(event, player) {
		return true;
	},
};

/**
 * 悉乱（何曾）
 *
 * 描述：限定技，结束阶段，你可以将本回合进入弃牌堆的任意张伤害牌明置于一名角色的武将牌旁，
 *       若当前游戏轮数小于 3/不小于 3，其受到同名牌造成的伤害-1/+1。
 */
const chashui_xiluan = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	limited: true,
	mark: true,
	trigger: { player: "phaseJieshuBegin" },
	filter(event, player) {
		return lib.chashuiXiluanCards().length > 0;
	},
	intro: {
		name: "悉乱",
		content: "limited",
	},
	async content(event, trigger, player) {
		const cards = lib.chashuiXiluanCards();
		if (!cards.length) return;
		const result = await player
			.chooseButton(["悉乱：选择要明置的伤害牌", [cards, "card"]], [1, cards.length])
			.set("ai", (button) => 6 - get.value(button.link))
			.forResult();
		if (!result.bool || !result.links || !result.links.length) return;
		const picked = await player
			.chooseTarget("悉乱：选择一名角色，将这些牌置于其武将牌旁", (card, player2, current) => current.isIn())
			.set("ai", (current) => get.attitude(player, current))
			.forResult();
		if (!picked.bool || !picked.targets || !picked.targets.length) return;
		player.logSkill("chashui_xiluan", picked.targets[0]);
		player.awakenSkill("chashui_xiluan");
		const target = picked.targets[0];
		target.addSkill("chashui_xiluan_damage");
		// gaintag 必须 = mark 技能 id（料戈注释的规矩）：悬浮 intro 的 "expansion" 按
		// node.skill 的 gaintag 取 x 区牌——旧版 gaintag=chashui_xiluan 与 mark 技能
		// chashui_xiluan_damage 错位，且主技能的 limited intro 让悬浮误显示「未发动」
		// 描述是「**明置**于武将牌旁」：addToExpansion 默认 visible=false（牌背），
		// 必须显式 set("visible", true) 才是明置（content.js:10620-10622）
		await target.addToExpansion(result.links, "gain2").set("gaintag", ["chashui_xiluan_damage"]).set("visible", true);
		target.markSkill("chashui_xiluan_damage");
	},
};

const chashui_xiluan_damage = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	mark: true,
	intro: {
		name: "悉乱",
		// "expansion"：悬浮对**所有人**公开亮出 x 区牌面（明置就该公开；"cards" 读的是没设置的 storage）
		content: "expansion",
	},
	trigger: { player: "damageBegin3" },
	filter(event, player) {
		const name = event.card && event.card.name;
		if (!name) return false;
		return player.getExpansions("chashui_xiluan_damage").some((card) => card.name == name);
	},
	content(event, trigger, player) {
		if (game.roundNumber < 3) {
			trigger.num = Math.max(0, trigger.num - 1);
		} else {
			trigger.num++;
		}
	},
};

// ============================================================
// 茶水贤设·昳（tea_ex_c）—— 拓跋沙漠汗
// 原型：G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_c\skills\{tongzhi,yishu}.lua
// ============================================================

/**
 * 通质（拓跋沙漠汗）
 *
 * 描述：出牌阶段限一次，你可以选择一名其他角色，你与其将两张手牌扣置于对方的武将牌上
 *       （不足则全扣），然后于各自的回合开始时获得各自武将牌上的牌。
 *
 * 「置于武将牌上」用引擎的正规区域：`x` 区 + `gaintag`（`player.getExpansions(tag)` /
 * `countExpansions(tag)`，player.js:10049-10060）。不用 `ui.special` + 手工 storage 数组——
 * 那样 mark 显示不了牌面，也不受 `$addToExpansion` 的可见性与自动重排管理。
 *
 * 牌面 mark 的原生范本：七星 `qixing`（character/extra.js:2205-2276）
 *   `addToExpansion(cards).gaintag.add(id)` + `intro: { markcount: "expansion", mark(dialog, content, player){…} }`
 *   `intro.mark` 里自己判「是不是本人/是否被操控」：本人 `dialog.addAuto(getExpansions(id))` 显示牌面，
 *   旁人只回「共有 N 张」。这才是「扣置」该有的呈现。
 *
 * 所选两张：原型 `tongzhi.lua:41-50` 是 `AskForUseActiveSkill` 让**持牌者自己挑**（`num=2, min_num=2`），
 *   只在 `#hand <= 1` 时不问（全扣）。所以这里也是「多于两张才问」，恰两张直接全扣。
 *
 * 收牌时机：原型是 `fk.TurnStart`（target == player，即**自己**回合开始时取回自己武将牌上的牌）。
 */
const chashui_tongzhi = {
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("h") > 0 && game.hasPlayer((current) => current != player && current.countCards("h") > 0);
	},
	async content(event, trigger, player) {
		const picked = await player
			.chooseTarget("通质：选择一名其他角色", (card, player2, current) => current != player && current.countCards("h") > 0)
			.set("ai", (current) => get.attitude(player, current))
			.forResult();
		if (!picked.bool || !picked.targets || !picked.targets.length) return;
		const target = picked.targets[0];
		player.logSkill("chashui_tongzhi", target);
		// 双方各挑两张扣到「对方」武将牌上：我给的进对方，对方给的进我
		await lib.chashuiTongzhiPlace(player, target);
		if (!target.isIn()) return;
		await lib.chashuiTongzhiPlace(target, player);
	},
	ai: {
		order: 5,
		result: {
			player: 1,
		},
	},
};

/**
 * giver 挑最多两张手牌，扣置到 holder 的武将牌上。
 * 手牌 > 2 张时由 giver 自己选；≤ 2 张时「不足则全扣」，不必问。
 */
const chashuiTongzhiPlace = async (giver, holder) => {
	const hand = giver.getCards("h");
	if (!hand.length || !holder.isIn()) return;
	let cards;
	if (hand.length <= 2) {
		cards = hand.slice();
	} else {
		const res = await giver
			.chooseCard(
				"h",
				true,
				2,
				`通质：选择两张手牌扣置于${get.translation(holder)}的武将牌上`,
				(card) => lib.filter.cardDiscardable(card, giver, "chashui_tongzhi")
			)
			.set("ai", (card) => -get.value(card))
			.forResult();
		if (!res?.cards?.length) return;
		cards = res.cards.slice(0, 2);
	}
	if (!cards.length) return;
	const next = holder.addToExpansion(cards, "giveAuto");
	next.gaintag.add("chashui_tongzhi");
	await next;
	// 「扣置」对旁观者不可见：只让持有者与给牌者知情（addToExpansion 的 visible 默认 false 即牌背）
	// markSkill 只是显示、不挂技能（player.js:10175-10215）——收牌触发在 chashui_tongzhi_mark 上，
	// 必须 addSkill 给持有者，否则「回合开始时获得武将牌上的牌」永不发生（诏缚 eff 同款挂载）
	holder.addSkill("chashui_tongzhi_mark");
	holder.markSkill("chashui_tongzhi_mark");
};
lib.chashuiTongzhiPlace = chashuiTongzhiPlace;

/** 「通质」牌面 mark：挂在持有者身上，随 x 区内容实时刷新 */
const chashui_tongzhi_mark = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	mark: true,
	intro: {
		name: "通质",
		markcount: "expansion",
		mark(dialog, content, player) {
			const cards = player.getExpansions("chashui_tongzhi");
			if (!cards?.length) return "没有牌";
			if (player == game.me || player.isUnderControl()) {
				dialog.addAuto(cards);
			} else {
				return "共有" + get.cnNumber(cards.length) + "张「通质」牌";
			}
		},
		content(content, player) {
			const cards = player.getExpansions("chashui_tongzhi");
			if (!cards?.length) return "没有牌";
			if (player == game.me || player.isUnderControl()) {
				return get.translation(cards);
			}
			return "共有" + get.cnNumber(cards.length) + "张「通质」牌";
		},
	},
	// 自己回合开始时取回自己武将牌上的牌（原型 fk.TurnStart，target == player）
	trigger: { player: "phaseBegin" },
	filter(event, player) {
		return player.getExpansions("chashui_tongzhi").length > 0;
	},
	async content(event, trigger, player) {
		const cards = player.getExpansions("chashui_tongzhi");
		if (!cards.length) return;
		await player.gain(cards, "gain2");
		// 牌收完了就摘掉 mark 技能，等下次扣置再挂
		if (!player.getExpansions("chashui_tongzhi").length) player.removeSkill("chashui_tongzhi_mark");
	},
};

/**
 * 射杀（衍生基本牌，只在技能里出现，不进牌堆）
 *
 * 原型：`G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_cards\init.lua` 的 `tea_shot__slash`
 *   （基本牌、红桃 13、造成 1 点普通伤害、不触发【闪】）。无名杀没有这张牌，只能在扩展里定义。
 *   不进 `lib.inpile` ⇒ 永远不会出现在牌堆/牌局里。
 */
lib.card.chashui_shesha = {
	type: "basic",
	enable: true,
	// 不写 `usable`：射杀只能由疑术印出来，而疑术的描述没有「出牌阶段限一次」。
	// 写 usable:1 会让疑术每阶段只能发动一次（`usable` 在触发过滤层按阶段强制）。
	selectTarget: 1,
	modTarget: true,
	filterTarget(card, player, target) {
		return target != player;
	},
	range(card, player, target) {
		return player.inRange(target);
	},
	async content(event, trigger, player) {
		const target = event.target;
		// 补 source：射杀是「你造成的伤害」，无来源会让依赖伤害来源的技能失效
		if (target && target.isIn()) await target.damage(player, 1);
	},
	ai: {
		basic: { damage: 1, useful: 1 },
		result: { target: 1 },
		order: 3,
	},
};
lib.translate.chashui_shesha = "射杀";
lib.translate.chashui_shesha_info = "基本牌。出牌阶段，对你攻击范围内的一名其他角色使用，对其造成 1 点伤害。";

/** 原型 yishu.lua:4-6 的 isBetween：num 严格位于 num1 与 num2 之间 */
const chashuiYishuBetween = (num1, num2, num) => (num1 < num && num2 > num) || (num1 > num && num2 < num);
lib.chashuiYishuBetween = chashuiYishuBetween;

/** 手牌里是否存在至少两张，使得某张手牌点数严格介于二者之间（疑术 filter / filterCard 用） */
const chashuiYishuHasMiddle = (cards) => {
	const nums = cards.map((card) => get.number(card));
	for (let i = 0; i < nums.length; i++) {
		for (let j = i + 1; j < nums.length; j++) {
			for (let k = 0; k < nums.length; k++) {
				if (k == i || k == j) continue;
				if (chashuiYishuBetween(nums[i], nums[j], nums[k])) return true;
			}
		}
	}
	return false;
};
lib.chashuiYishuHasMiddle = chashuiYishuHasMiddle;

/** filterCard 的第二张：必须能与已选的那张构成「中间有一张」的组合（原型 yishu.lua:22-30） */
const chashuiYishuSecondOk = (player, selected, card) => {
	const first = selected?.[0];
	if (!first) return true;
	const num1 = get.number(first);
	const num2 = get.number(card);
	return player
		.getCards("h")
		.some((current) => current != first && current != card && chashuiYishuBetween(num1, num2, get.number(current)));
};
lib.chashuiYishuSecondOk = chashuiYishuSecondOk;

/**
 * 疑术（拓跋沙漠汗）
 *
 * 描述：当你需要使用一张射【杀】时，你可以展示两张手牌，并将一张点数位于这两张牌之间的牌
 *       当射【杀】使用。若此牌点数处于你武将牌上“通质”牌点数之间，你与此牌目标各受到1点
 *       无来源伤害。
 *
 * 原型 `yishu.lua` 的真实流程（我第一版理解错了三条）：
 *   1. `interaction` 先选牌名（射杀），`card_filter`：「第一张任意手牌；选完第一张后，
 *      第二张只要是**手牌里存在某张牌，其点数严格介于这两张之间**就允许」——即**选两张手牌**，
 *      不是选三张。这两张是「被展示的两张」。
 *   2. `before_use`（`:44-106`）：从**手牌**里找「点数严格介于展示的两张之间」的牌
 *      （`isBetween`，`ids` 会预筛掉没有合法目标的），让玩家从中**另选一张**当底牌；
 *      选完 `player:showCards(cards)` 展示那两张。
 *   3. 若 `#player:getPile("$tea__tongzhi") == 2`（恰好两张，`yishu.lua:69` 写死 `== 2`）且底牌
 *      点数介于这两张通质牌的点数之间 ⇒ 先伤自己 1 点，再按座次伤所有目标各 1 点（无来源）。
 *
 * 实现：`selectCard: 2`；`precontent` 里先找候选底牌让玩家选（无候选则整体取消），
 *   `showCards` 展示那两张，再把底牌塞进 `result.cards` 当转化底牌。
 */
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_yishuPlan = defineSkill({
	id: "chashui_yishu",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	enable: "chooseToUse",
	position: "h",
	selectCard: 2,
	viewAs: { name: "chashui_shesha", isCard: true },
	filterCard(card, player) {
		if (get.itemtype(card) != "card" || get.owner(card) != player || get.position(card) != "h") return false;
		// 原型 yishu.lua:22-30：第一张任意；第二张起必须是「手牌里另有牌点数介于二者之间」
		return lib.chashuiYishuSecondOk(player, ui.selected.cards, card);
	},
	filter(event, player) {
		if (!lib.card.chashui_shesha) return false;
		const cards = player.getCards("h");
		if (cards.length < 3) return false;
		if (!lib.chashuiYishuHasMiddle(cards)) return false;
		return event.filterCard(get.autoViewAs({ name: "chashui_shesha", isCard: true }), player, event);
	},
	async precontent(event, trigger, player) {
		const shown = (event.result.cards || []).slice(0, 2);
		if (shown.length < 2) {
			event.result.cancel = true;
			return;
		}
		// 找出「点数严格介于展示两张之间」的手牌（不含刚选的那两张），并预筛有无合法目标
		const [num1, num2] = shown.map((card) => get.number(card));
		const candidates = player
			.getCards("h")
			.filter((card) => !shown.includes(card))
			.filter((card) => {
				if (!lib.chashuiYishuBetween(num1, num2, get.number(card))) return false;
				// 原型预筛：这张牌当射杀时必须有合法目标，否则不该出现在候选里
				return game.hasPlayer((current) => player.canUse(get.autoViewAs({ name: "chashui_shesha", isCard: true }, [card]), current));
			});
		if (!candidates.length) {
			event.result.cancel = true;
			return;
		}
		const res = await player
			.chooseCard(`疑术：选择一张点数介于这两张之间的牌当【射杀】使用`, "h", true, 1, (card) => candidates.includes(card))
			.set("ai", (card) => {
				// 优先选能触发通质追加伤害的
				const nums = player.getExpansions("chashui_tongzhi").map((c) => get.number(c));
				if (nums.length == 2 && lib.chashuiYishuBetween(Math.min(...nums), Math.max(...nums), get.number(card))) return 10;
				return get.value(card, player) < 0 ? 1 : 0;
			})
			.forResult();
		if (!res?.cards?.length) {
			event.result.cancel = true;
			return;
		}
		const middle = res.cards[0];
		await player.showCards(shown, "疑术：展示两张手牌");
		if (!player.isIn()) {
			event.result.cancel = true;
			return;
		}
		event.result.cards = [middle];
		event.result.card = get.autoViewAs({ name: "chashui_shesha", isCard: true, storage: { chashui_yishu: true } }, [middle]);
	},
	ai: {
		order: 4,
		result: { player: 1 },
	},
	group: ["damage"],
	sub: {
		damage: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			return !!event.card?.storage?.chashui_yishu && !!event.targets?.length;
		},
		async content(event, trigger, player) {
			// 原型 yishu.lua:69 写死 `#player:getPile("$tea__tongzhi") == 2`
			const piles = player.getExpansions("chashui_tongzhi");
			if (piles.length != 2) return;
			const [num1, num2] = piles.map((card) => get.number(card));
			if (!lib.chashuiYishuBetween(num1, num2, get.number(trigger.card))) return;
			player.logSkill("chashui_yishu");
			await player.damage("nosource", 1);
			// 「按座次」结算（原型 room:sortByAction(tos)）
			for (const target of trigger.targets.slice().sort((a, b) => (a.getSeatNum?.() ?? 0) - (b.getSeatNum?.() ?? 0))) {
				if (target.isIn() && !target.isDead()) await target.damage("nosource", 1);
			}
		},
		},
	},
});
const chashui_yishu = chashui_yishuPlan.skills.chashui_yishu;
const chashui_yishu_damage = chashui_yishuPlan.skills.chashui_yishu_damage;



/** 悉乱可选的「本回合进弃牌堆的伤害牌」 */
const chashuiXiluanCards = () => getTurnDiscardCards().filter((card) => get.tag(card, "damage"));
lib.chashuiXiluanCards = chashuiXiluanCards;

// ==================== 茶水贤设·晡（tea_ex_d） ====================
// 原型：G:\FreeKill-release\packages\wild_collection\pkg\tea_ex_d\skills\{kuitian,shixiang}.lua

// —— 朱建平 · 窥天 ——
/**
 * 窥天：牌堆顶第 X 张（X = 体力上限 - 本轮已用次数）。
 * 与 FreeKill `draw_pile[player.maxHp - mark]` 同口径：mark 每用一次 +1 ⇒ 可见位置向牌堆顶前移一位；
 * mark 达到体力上限后 X ≤ 0 ⇒ 没有可见牌（原型 draw_pile[0] 也是 nil）。
 */
const chashuiKuitianCard = (player) => {
	const index = player.maxHp - player.countMark("chashui_kuitian_round");
	if (index <= 0) return null;
	const pile = ui.cardPile?.childNodes;
	if (!pile || !pile.length) return null;
	return pile[Math.min(index, pile.length) - 1] || null;
};
lib.chashuiKuitianCard = chashuiKuitianCard;

// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_kuitianPlan = defineSkill({
	id: "chashui_kuitian",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	locked: true,
	forced: true,
	mark: true,
	intro: {
		name: "窥天",
		mark(dialog, storage, player) {
			// 只有本人（或被接管时）才看得到具体牌面，其他人只知道「在看牌堆」
			if (player != game.me && !player.isUnderControl()) return "牌堆中的牌";
			const card = lib.chashuiKuitianCard(player);
			if (!card) return "没有可见的牌";
			dialog.add([card]);
		},
		content(storage, player) {
			const index = player.maxHp - player.countMark("chashui_kuitian_round");
			if (index <= 0) return "本轮可见次数已用尽";
			const card = lib.chashuiKuitianCard(player);
			if (!card) return "牌堆顶没有第" + get.cnNumber(index) + "张牌";
			if (player != game.me && !player.isUnderControl()) return "牌堆顶第" + get.cnNumber(index) + "张牌";
			return "牌堆顶第" + get.cnNumber(index) + "张：" + get.translation(card);
		},
	},
	onremove: true,
	group: ["use", "reset"],
	sub: {
		use: {
		enable: ["chooseToUse", "chooseToRespond"],
		filterCard: () => false,
		selectCard: -1,
		viewAs(cards, player) {
			const card = lib.chashuiKuitianCard(player);
			if (!card) return null;
			return get.autoViewAs(card, [card]);
		},
		filter(event, player) {
			const card = lib.chashuiKuitianCard(player);
			if (!card) return false;
			// 自己点按钮进来时不再问「这张牌能不能用」（此时 event.filterCard 已被 backup 覆盖）
			if (event.skill == "chashui_kuitian_use" || event._skill == "chashui_kuitian_use") return true;
			if (typeof event.filterCard != "function") return false;
			return event.filterCard(card, player, event);
		},
		hiddenCard(player, name) {
			const card = lib.chashuiKuitianCard(player);
			return !!card && get.name(card, false) == name;
		},
		async precontent(event, trigger, player) {
			const card = lib.chashuiKuitianCard(player);
			if (!card) {
				event.result.cancel = true;
				return;
			}
			event.result.card = get.autoViewAs(card, [card]);
			event.result.cards = [card];
			// 本轮可见位置前移一位
			player.addMark("chashui_kuitian_round", 1, false);
			player.markSkill("chashui_kuitian");
		},
		ai: {
			order: 3,
			result: { player: 1 },
		},
		},
		reset: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		// roundStart 挂在 phase 事件上（event.player 是回合角色）⇒ 必须用 global，否则只有自己回合开新一轮才清
		trigger: { global: "roundStart" },
		content(event, trigger, player) {
			const count = player.countMark("chashui_kuitian_round");
			if (count > 0) player.removeMark("chashui_kuitian_round", count, false);
			player.markSkill("chashui_kuitian");
		},
		},
	},
});
const chashui_kuitian = chashui_kuitianPlan.skills.chashui_kuitian;
const chashui_kuitian_use = chashui_kuitianPlan.skills.chashui_kuitian_use;
const chashui_kuitian_reset = chashui_kuitianPlan.skills.chashui_kuitian_reset;

/**
 * 「你可以使用或打出此牌」：
 * 无名杀没有「牌堆里的牌可被选中」的机制，所以走「凭空印牌」路线 —— `filterCard: () => false` +
 * `selectCard: -1` 让按钮不看手牌，真正的底牌在 `precontent` 里塞回 `event.result.cards`，
 * 引擎随后 `useCard(vcard, [这张牌], targets, skill)` 会把它从牌堆里拿走（`get.owner` 为空 ⇒ directDiscard）。
 */




// —— 朱建平 · 饰相 ——
const chashui_shixiang = {
	audio: 2,
	enable: "phaseUse",
	limited: true,
	skillAnimation: true,
	animationColor: "wood",
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.isDamaged());
	},
	filterTarget(card, player, target) {
		return target != player && target.isDamaged();
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		player.awakenSkill("chashui_shixiang");
		player.logSkill("chashui_shixiang", target);
		// 先回满，再挂「体力变化 +1」——顺序与原型的 recover 后 setPlayerMark 一致
		const num = target.maxHp - target.hp;
		if (num > 0) await target.recover(num);
		target.addSkill("chashui_shixiang_buff");
	},
	ai: {
		order: 4,
		result: {
			target(player, target) {
				return get.attitude(player, target) > 0 ? 3 : -3;
			},
		},
	},
};

const chashui_shixiang_buff = {
	forced: true,
	locked: true,
	mark: true,
	intro: {
		name: "饰相",
		content: "本局游戏你体力值的变化值+1",
	},
	// 造成/受到伤害、回复体力、失去体力 —— 四条里「体力值即将变化」的三种来源
	trigger: { player: ["damageBegin3", "recoverBegin", "loseHpBegin"] },
	filter(event, player) {
		return event.num > 0;
	},
	content(event, trigger, player) {
		trigger.num++;
	},
	onremove: true,
};

// —— 邓飏 · 赇求 ——
/** 被声明的那张牌（跟着牌走，可能被移动/转手）。 */
const chashuiQiuqiuCard = () => {
	for (const current of game.filterPlayer()) {
		const found = current.getCards("ej").find((card) => card.storage?.chashui_qiuqiu);
		if (found) return { card: found, holder: current };
	}
	return null;
};
lib.chashuiQiuqiuCard = chashuiQiuqiuCard;

/* 注意：这里用普通块注释而不是 JSDoc（/**），因为正文里的 `@@标记名` 会让
 * TypeScript 的 JSDoc 解析器把 `@tea__...` 当成标签名并报 TS1003。
 * 清除当前声明（原型 @@tea__qiuqiu-turn 回合末自动清，这里手动补） */
lib.chashuiQiuqiuClear = () => {
	const info = lib.chashuiQiuqiuCard();
	if (info) delete info.card.storage.chashui_qiuqiu;
};

// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_qiuqiuPlan = defineSkill({
	id: "chashui_qiuqiu",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => current.countCards("ej") > 0);
	},
	filterTarget(card, player, target) {
		return target.countCards("ej") > 0;
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		const result = await player
			.choosePlayerCard(target, true, "ej", "赇求：声明其一张牌")
			.set("ai", (button) => 1 + get.value(button.link, target))
			.forResult();
		if (!result.bool || !result.cards?.length) return;
		player.logSkill("chashui_qiuqiu", target);
		// 清掉上一回合的旧声明，再记新声明
		lib.chashuiQiuqiuClear();
		result.cards[0].storage.chashui_qiuqiu = true;
		// 结束阶段结算的门槛（qiuqiu_end 读这个；旧版漏赋值导致结算永不发生）
		player.storage.chashui_qiuqiu = true;
		player.markSkill("chashui_qiuqiu");
	},
	mark: true,
	intro: {
		name: "赇求",
		content() {
			const info = lib.chashuiQiuqiuCard();
			if (!info) return "本回合没有声明的牌。";
			return `本回合你声明了${get.translation(info.holder)}的【${get.translation(info.card)}】，对其使用牌无距离和次数限制。`;
		},
	},
	mod: {
		targetInRange(card, player, target) {
			const info = lib.chashuiQiuqiuCard();
			if (info && info.holder === target) return true;
		},
		// 无次数限制对**所有牌**生效（描述与原型 bypass_times 一致）；cardUsable 拿不到目标，
		// 用目标感知的 cardUsableTarget（诏缚 global 同款，index.js:11201-11213/11360-11364 消费）
		cardUsableTarget(card, player, target) {
			const info = lib.chashuiQiuqiuCard();
			if (info && info.holder === target) return true;
		},
	},
	onremove: true,
	ai: { order: 4, result: { player: 1 } },
	group: ["delay", "end"],
	sub: {
		delay: {
		charlotte: true,
		forced: true,
		popup: false,
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			const info = lib.chashuiQiuqiuCard();
			if (!info) return false;
			return (event.targets || []).includes(info.holder);
		},
		async content(event, trigger, player) {
			const info = lib.chashuiQiuqiuCard();
			if (!info) return;
			// 「其可以移动之」= 移动到另一名角色的**同名区域**。只有装备区/判定区的牌有同名区域可去；
			// 若这张牌在结算前已被挪到别处（如被【顺手牵羊】拿走），就没有可移动的目标，直接跳过
			// （旧版答了「是」却静默不结算，玩家会以为技能坏了）。
			const position = get.position(info.card);
			if (position != "e" && position != "j") return;
			const zone = position == "e" ? "装备区" : "判定区";
			const holders = game.filterPlayer((current) => current != info.holder && current.isIn());
			if (!holders.length) return;
			const move = await info.holder
				.chooseBool("赇求：是否移动被声明的牌？", `将其移动到一名其他角色的${zone}`)
				.set("ai", () => get.attitude(info.holder, player) <= 0)
				.forResult();
			if (!move.bool) return;
			const result = await info.holder
				.chooseTarget(`赇求：将声明的牌移动到一名其他角色的${zone}`, true, (card, player2, target) => target != player2)
				.set("ai", (target) => -get.attitude(info.holder, target))
				.forResult();
			if (!result.bool || !result.targets?.length) return;
			const to = result.targets[0];
			if (position == "e") {
				await to.equip(info.card);
			} else {
				await to.addJudge(info.card);
			}
		},
		},
		end: {
		charlotte: true,
		forced: true,
		popup: false,
		// 描述是「**结束阶段**」（= phaseJieshu，lib.phaseName 六阶段之一）；`phaseEnd` 是
		// 整个回合结束的事件，会落在弃牌阶段之后，与描述时机不同。
		trigger: { player: "phaseJieshuBegin" },
		filter(event, player) {
			return !!lib.chashuiQiuqiuCard() && !!player.storage.chashui_qiuqiu;
		},
		async content(event, trigger, player) {
			const info = lib.chashuiQiuqiuCard();
			if (!info) return;
			if (info.holder === player) {
				player.logSkill("chashui_qiuqiu");
				await player.draw(2);
			} else {
				player.logSkill("chashui_qiuqiu");
				await player.loseHp(1);
			}
			// 本回合结束，声明失效（原型 -turn 自动清）
			lib.chashuiQiuqiuClear();
			delete player.storage.chashui_qiuqiu;
		},
		},
	},
});
const chashui_qiuqiu = chashui_qiuqiuPlan.skills.chashui_qiuqiu;
const chashui_qiuqiu_delay = chashui_qiuqiuPlan.skills.chashui_qiuqiu_delay;
const chashui_qiuqiu_end = chashui_qiuqiuPlan.skills.chashui_qiuqiu_end;

/** 结算结束后：其可以移动该牌（次数豁免走主技能 mod.cardUsableTarget，不再需要计数器）。 */




// —— 邓飏 · 悬锋 ——
// 原型：G:/FreeKill-release/packages/wild_collection/pkg/tea_ex_d/skills/{xuanfeng,xuanfeng_active}.lua
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_xuanfengPlan = defineSkill({
	id: "chashui_xuanfeng",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	enable: "phaseUse",
	limited: true,
	skillAnimation: true,
	animationColor: "thunder",
	// 素材至少一张（描述「将一张牌当【闪电】使用」）。静态 viewAs 只会被 filterEnable 拿
	// **牌名**做窗口校验（noname/library/index.js:10616-10622），不检查「手上有没有牌」⇒
	// 不写这个 filter，空手也能点，点开对话框里一张牌都没有。
	// 另外自己判定区已有【闪电】时不能再贴（canAddJudge 会挡，player.js:9425-9451）。
	filter(event, player) {
		return player.countCards("he") > 0 && player.canAddJudge("shandian");
	},
	filterCard: (card) => true,
	selectCard: 1,
	position: "he",
	// ⚠️【闪电】的牌 id 是 shandian（card/standard.js:3007），不是 FreeKill 的 lightning。
	//   牌名写错会让 finishSkill 走进 `if (!lib.card[info.viewAs.name]) deleteSkill(...)`
	//   （noname/game/index.js:8198-8202）⇒ 整个技能被清空、描述变成「此模式下不可用」。
	viewAs: { name: "shandian", isCard: true },
	mark: true,
	intro: {
		name: "悬锋",
		content: "limited",
	},
	onremove(player, skill) {
		player.removeSkill("chashui_xuanfeng_clear");
		delete player.storage[skill];
	},
	ai: { order: 5, result: { player: 1 } },
	// ⚠️ clear 只能写 grant（init 里 addSkill 独立挂载），不能写 group：
	// `awakenSkill` 会 disableSkill 主技能，而 disableSkill 沿 group 递归禁用
	// （player.js:11267-11269）⇒ 放在 group 里的「死亡清理」会在限定技用掉的瞬间被一起禁用，
	// 之后邓飏死亡时场上的「悬锋」按钮再也撤不掉（docs/坑-技能失效与标记显示.md 同款坑）。
	group: ["use"],
	grant: ["clear"],
	init(player, skill) {
		player.addSkill("chashui_xuanfeng_clear");
	},
	sub: {
		use: {
			charlotte: true,
			forced: true,
			popup: false,
			trigger: { player: "useCardAfter" },
			filter(event, player) {
				return event.skill == "chashui_xuanfeng" && !!event.cards?.length;
			},
			async content(event, trigger, player) {
				player.awakenSkill("chashui_xuanfeng");
				// 判定区放的是 viewAs 卡（addJudge 末尾 addVirtualJudge，content.js:11905-12029），
				// 实体底牌在它的 .cards 里 ⇒ 标记打在实体牌上，取用时两路匹配（lib.chashuiXuanfengMark）。
				const physical = trigger.cards[0];
				physical.storage.chashui_xuanfeng = true;
				physical.storage.chashui_xuanfeng_owner = player.playerid;
				player.logSkill("chashui_xuanfeng");
				for (const current of game.filterPlayer()) {
					current.addSkill("chashui_xuanfeng_active");
				}
			},
		},
		clear: {
			charlotte: true,
			forced: true,
			popup: false,
			forceDie: true,
			trigger: { global: "dieAfter" },
			// 悬锋发起者死亡 ⇒ 撤掉全场的「悬锋」可发动技（原型 xuanfeng_re 的 handleAddLoseSkills("-…")）
			filter(event, player) {
				return event.player === player;
			},
			async content(event, trigger, player) {
				for (const current of game.filterPlayer()) {
					if (current.hasSkill("chashui_xuanfeng_active")) current.removeSkill("chashui_xuanfeng_active");
				}
			},
		},
	},
});
const chashui_xuanfeng = chashui_xuanfengPlan.skills.chashui_xuanfeng;
const chashui_xuanfeng_use = chashui_xuanfengPlan.skills.chashui_xuanfeng_use;

/** 取「悬锋」标记：判定区那张 viewAs 卡本身，或它的实体底牌。 */
lib.chashuiXuanfengMark = (card) => {
	if (!card) return null;
	if (card.storage?.chashui_xuanfeng) return card.storage;
	for (const sub of card.cards || []) {
		if (sub.storage?.chashui_xuanfeng) return sub.storage;
	}
	return null;
};

/** 场上带「悬锋」标记的判定区牌。 */
lib.chashuiXuanfengCard = () => {
	for (const current of game.filterPlayer()) {
		for (const card of current.getCards("j")) {
			if (lib.chashuiXuanfengMark(card)) return { card, holder: current };
		}
	}
	return null;
};

/**
 * 悬锋·发动（原型 tea__xuanfeng_active&）：视为使用一张【杀】，**结算之后**再令那张「悬锋」【闪电】判定。
 * 原型 xuanfeng_active.lua 就是一个 pattern="slash" 的 ViewAs 技（card_filter 恒 false、view_as 用 0 张牌），
 * 判定写在 after_use 里 —— 不是「先判定再出杀」。
 * 谁能用（原型 can_use）：牌在「悬锋」持有者判定区 → 其他角色；牌在别人判定区 → 只有「悬锋」持有者。
 */
const chashui_xuanfeng_active = {
	charlotte: true,
	enable: ["chooseToUse", "chooseToRespond"],
	filterCard: () => false,
	selectCard: -1,
	viewAs: { name: "sha", isCard: true },
	group: ["chashui_xuanfeng_active_judge"],
	filter(event, player) {
		if (event.skill == "chashui_xuanfeng_active" || event._skill == "chashui_xuanfeng_active") return true;
		const info = lib.chashuiXuanfengCard();
		if (!info) return false;
		// ⚠️ 不能用 hasSkill("chashui_xuanfeng") 判断「谁是悬锋的主人」：
		// 主技能在 use 子技能里已经 awakenSkill（限定技）⇒ disableSkill 之后 hasSkill 恒 false
		// （getSkills 默认走 game.filterSkills 摘掉 disabledSkills）。原来这么写会得到
		// holderHas=false ⇒ 走 `!playerHas` 分支 ⇒ 只有「以为自己有悬锋」的人能过，
		// 实际全员 hasSkill 都是 false，别人当然点不出来。
		// 主人身份写在实体牌的 storage 上（chashui_xuanfeng_use 里的 chashui_xuanfeng_owner）。
		const mark = lib.chashuiXuanfengMark(info.card);
		const ownerId = mark?.chashui_xuanfeng_owner;
		if (ownerId == null) return false;
		const holderIsOwner = info.holder.playerid == ownerId;
		const playerIsOwner = player.playerid == ownerId;
		// 原型 can_use：牌在主人自己判定区 → 其他角色可用；牌在别人判定区 → 只有主人可用
		if (holderIsOwner ? playerIsOwner : !playerIsOwner) return false;
		// 窗口校验：这张【杀】在当前窗口能不能用（非响应窗口、无合法目标都会在这里被挡掉）
		if (typeof event.filterCard != "function") return false;
		return event.filterCard(get.autoViewAs({ name: "sha", isCard: true }, []), player, event);
	},
	ai: { order: 4, result: { player: 1 } },
};

/** 悬锋·发动后的【闪电】判定结算（原型 xuanfeng_active.lua 的 after_use）。 */
const chashui_xuanfeng_active_judge = {
	charlotte: true,
	forced: true,
	popup: false,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		if (typeof event.skill != "string" || !event.skill.startsWith("chashui_xuanfeng_active")) return false;
		return !!lib.chashuiXuanfengCard();
	},
	async content(event, trigger, player) {
		const info = lib.chashuiXuanfengCard();
		if (!info) return;
		const { card, holder } = info;
		// 台词归属：牌在悬锋主人判定区 → 记主人，否则记发动者。
		// 主人 id 从实体牌 storage 取（主技能已 awakenSkill，hasSkill 恒 false，不能用来判身份）。
		// ⚠️ 这里只能播台词，不能调 logSkill("chashui_xuanfeng")：logSkill 会走
		// player.trySkillAnimate（noname/library/element/player.js:9719-9731），而限定技在
		// finishSkill 里默认 skillAnimation = true（noname/game/index.js:8230-8235）⇒ 每次
		// 发动悬锋（印杀）都会重播一次限定技动画。限定技真正的动画由 use 子技能里那一次
		// logSkill 负责（只在第一次贴【闪电】时播放）。
		const mark = lib.chashuiXuanfengMark(card);
		const speaker = holder.playerid == mark?.chashui_xuanfeng_owner ? holder : player;
		game.trySkillAudio("chashui_xuanfeng", speaker, null, null, null, [event, trigger]);
		// 用【闪电】自己的 judge 取判定结果：judge() 只翻一张牌，不会重复结算【闪电】本身。
		// result.bool === false 就是「黑桃2~9 命中」（card/standard.js:3020-3026 的 judge 返回 -5 ⇒
		// content.js:12109-12115 把它转成 bool=false）。这里必须用 result.bool 而不是自己比
		// suit/number —— 判定牌的花色点数会被 mod 改写（如红颜把♠当♥），get.suit 才是正确口径。
		const judge = await holder.judge(card).forResult();
		if (judge?.bool === false) {
			await holder.damage(3, "thunder", "nosource");
			await game.cardsDiscard(card);
		} else {
			// 交给下家：原生 addJudgeNext 会跳过已有【闪电】或不能再贴的角色（player.js:9453-9480）；
			// 没人可传则进弃牌堆
			const next = holder.addJudgeNext(card);
			if (next) await next;
			else await game.cardsDiscard(card);
		}
		if (!lib.chashuiXuanfengCard()) {
			for (const current of game.filterPlayer()) {
				if (current.hasSkill("chashui_xuanfeng_active")) current.removeSkill("chashui_xuanfeng_active");
			}
		}
	},
};

// —— 李意 · 点解 ——
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_dianjiePlan = defineSkill({
	id: "chashui_dianjie",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { global: "roundStart" },
	filter(event, player) {
		return game.hasPlayer((current) => current != player);
	},
	async cost(event, trigger, player) {
		const result = await player
			.chooseTarget("点解：选择一名其他角色", true, (card, player2, target) => target != player2)
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!result.bool) return;
		event.result = { bool: true, targets: result.targets };
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		player.storage.chashui_dianjie_target = target.playerid;
		delete player.storage.chashui_dianjie_used;
		player.logSkill("chashui_dianjie", target);
		player.markSkill("chashui_dianjie");
	},
	mark: true,
	intro: {
		name: "点解",
		content(storage, player) {
			const target = player.storage.chashui_dianjie_target;
			const current = target ? (_status.connectMode ? lib.playerOL : game.playerMap)[target] : null;
			if (!current) return "本轮未指定角色。";
			const body = `本轮指定了${get.translation(current)}：第1/2/3张【杀】结算后分别由你卜算2、其卜算1、你卜算3。`;
			return body;
		},
	},
	onremove: true,
	group: ["trigger"],
	sub: {
		trigger: {
		charlotte: true,
		forced: true,
		popup: false,
		trigger: { global: "useCardAfter" },
		filter(event, player) {
			if (!event.card || get.name(event.card) != "sha") return false;
			if (!player.storage.chashui_dianjie_target) return false;
			if (player.storage.chashui_dianjie_used) return false;
			// 原型 can_trigger 还要 table.find(其他角色, 带 @@tea__dianjie-round 标记)——即目标必须仍在场
			if (!game.hasPlayer((current) => current.playerid == player.storage.chashui_dianjie_target)) return false;
			// 「本轮第 1/2/3 张【杀】」按**轮**计数——getGlobalHistory 是每回合 push 一次的「本回合」
			// 口径（content.js:4117），会让每个角色的回合都重新数；必须用 getRoundHistory
			const count = game.getRoundHistory("useCard", (evt) => evt.card && get.name(evt.card) == "sha").length;
			return count >= 1 && count <= 3;
		},
		async content(event, trigger, player) {
			const count = game.getRoundHistory("useCard", (evt) => evt.card && get.name(evt.card) == "sha").length;
			const target = game.findPlayer((current) => current.playerid == player.storage.chashui_dianjie_target);
			if (!target) return;
			const num = count == 1 ? 2 : count == 2 ? 1 : 3;
			const who = count == 2 ? target : player;
			player.logSkill("chashui_dianjie", target);
			// chooseToGuanxing 自取牌堆顶 num 张并返回布置结果（content.js:12184-12293）——
			// 旧版先 get.cards(num) 再 guanxing，取出的那张集合滞留悬空且卜算的是另一批牌
			const guanxing = await who.chooseToGuanxing(num).forResult();
			const cards = (guanxing?.moved || []).flat();
			// 「你与其均互相可见」：卜算界面只有卜算者能看到，另一方用 viewCards 私看
			// （content.js:8691-8694 只在 player == game.me 时建 dialog，且 addCardKnower 记账）。
			// 旧版用 showCards 是向**全场**公开，属于信息泄露。
			const other = who === player ? target : player;
			if (cards.length && other.isIn() && other !== who) {
				await other.viewCards("点解：卜算的牌", cards);
			}
			// 「然后你可以令你或其使用其中一张牌，若造成伤害，此技能本轮失效」
			// 谁用由拥有者决定（措辞是「你可以令…」）⇒ 先问拥有者，再由被选中的一方选牌使用。
			if (cards.length) {
				// 只把「该角色现在真的用得出」的牌列进候选，避免出现点开一片灰的死局。
				// canUse(card, target) 要逐个目标试：对【杀】而言 canUse(card, 自己) 恒 false。
				const usableBy = (who) => cards.filter((card) => game.hasPlayer((current) => who.canUse(card, current)));
				const selfCards = player.isIn() ? usableBy(player) : [];
				const otherCards = target.isIn() ? usableBy(target) : [];
				const choices = [];
				if (selfCards.length) choices.push("自己");
				if (otherCards.length) choices.push("其");
				if (choices.length) {
					choices.push("cancel2");
					const control = await player
						.chooseControl(choices)
						.set("prompt", "点解：令谁使用其中一张牌？")
						.set("ai", () => (otherCards.length ? "其" : "自己"))
						.forResult();
					const pick = control?.control;
					const user = pick == "自己" ? player : pick == "其" ? target : null;
					const pool = user === player ? selfCards : otherCards;
					if (user && pool.length) {
						const result = await user
							.chooseButton(["点解：使用其中一张牌", [pool, "card"]])
							.set("ai", (button) => get.value(button.link))
							.forResult();
						if (result.bool && result.links?.length) {
							// 「若造成伤害」用伤害历史快照判：直接比 evt.card === card 不可靠
							// （转化/虚拟牌的 event.card 不是同一个对象），快照差值只问「这次使用有没有造成伤害」。
							const before = user.getHistory("sourceDamage").length;
							await user.chooseUseTarget(result.links[0], "点解：使用其中一张牌");
							if (player.isIn() && user.getHistory("sourceDamage").length > before) {
								player.storage.chashui_dianjie_used = true;
								// 「此技能本轮失效」的视觉表现 = 技能描述变灰，由 disableSkill 自动完成
								// （get/index.js:5040-5083：技能仍在 node.skills、但被 filterSkills 摘除 ⇒ opacity:0.5）。
								// 恢复靠载体 chashui_dianjie_disabled 的 addTempSkill 到期 + onremove 里的 enableSkill。
								player.disableSkill("chashui_dianjie_disabled", "chashui_dianjie");
								player.addTempSkill("chashui_dianjie_disabled", "roundEnd");
								player.markSkill("chashui_dianjie");
								game.log(player, "的", "#g【点解】", "本轮失效");
							}
						}
					}
				}
			}
		},
		},
	},
});
const chashui_dianjie = chashui_dianjiePlan.skills.chashui_dianjie;
const chashui_dianjie_trigger = chashui_dianjiePlan.skills.chashui_dianjie_trigger;

/**
 * 点解·失效载体（「此技能本轮失效」）。
 * 描述变灰由 disableSkill 自动完成（技能仍在 node.skills 里，但被 game.filterSkills 摘除 ⇒
 * get/index.js:5040-5083 用 opacity:0.5 渲染），本技能只负责两件事：
 * ① 用 addTempSkill(..., "roundEnd") 给「本轮」这个期限一个落点；
 * ② 到期被 removeSkill 时撤掉禁用表项（enableSkill 传的是**禁用方键**，不是技能 id）。
 * ⚠️ 绝不能放进主技能 group：disableSkill 会沿 group 级联禁用，恢复逻辑会被一起砸掉
 * （AGENTS.md R4 / docs/坑-技能失效与标记显示.md），所以走 addTempSkill 独立挂载。
 * ⚠️ 本载体**不挂 mark**：主技能的 mark 节点在 disableSkill 后仍然存在（引擎只在
 * clearSkills 里 checkMarks，disableSkill 不动 marks），失效状态由主技能 intro.content
 * 现算现显（get.storageintro 每次打开浮窗都重算）。再挂一个「解」会出现两个一样的标记。
 */
const chashui_dianjie_disabled = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	onremove(player, skill) {
		player.enableSkill("chashui_dianjie_disabled");
	},
};



// —— 李意 · 晓白 ——
// —— 迁移试点：晓白改写成 defineSkill 形态（mold/define.js）——
// 目的：验证「子技能进 sub、group 只写 key」的增量迁移路径（mold/README.md「下一步」第 3 条）。
// keepTranslate: true —— 译名与说明暂时留在 src/translate/chashui.js，等整批迁移时再搬进 spec。
// 行为等价性不靠眼睛看：mold/tools/dump-skill.mjs 逐字比对 lib.skill 的装配结果。
const xiaobaiPlan = defineSkill({
	id: "chashui_xiaobai",
	keepTranslate: true,
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { global: "damageAfter" },
	// 「每轮限一次」靠 storage 门 + 轮首清零；清零技必须挂进 group 才会被挂载
	// （subSkill 不会自动生效，AGENTS.md R3）。
	group: ["reset"],
	filter(event, player) {
		if (player.storage.chashui_xiaobai_round) return false;
		return event.card && event.num > 0;
	},
	async cost(event, trigger, player) {
		event.result = await player
			.chooseBool(`晓白：是否亮出牌堆底${4 + (trigger.hasNature() || trigger.nature ? 2 : 0)}张牌？`)
			.set("ai", () => true)
			.forResult();
	},
	async content(event, trigger, player) {
		player.storage.chashui_xiaobai_round = true;
		player.logSkill("chashui_xiaobai");
		let num = 4;
		if (trigger.nature || trigger.hasNature?.()) num += 2;
		const cards = get.bottomCards(num);
		await game.cardsGotoOrdering(cards);
		player.showCards(cards, "晓白：亮出的牌");
		const name = get.name(trigger.card, false);
		if (!cards.some((card) => get.name(card, false) == name)) {
			await game.cardsDiscard(cards);
			return;
		}
		let obtain = 2;
		const selectable = cards.filter((card) => get.name(card, false) != name);
		if (!selectable.length) {
			await game.cardsDiscard(cards);
			return;
		}
		const count = Math.min(obtain, selectable.length);
		const result = await player
			.chooseButton([`晓白：选择${get.cnNumber(count)}张牌获得`, [selectable, "card"]], true, count)
			.set("ai", (button) => get.value(button.link))
			.forResult();
		if (result.bool && result.links?.length) {
			await player.gain(result.links, "gain2");
		}
		await game.cardsDiscard(cards.filter((card) => !result.links?.includes(card)));
	},
	sub: {
		reset: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { global: "roundStart" },
		content(event, trigger, player) {
			delete player.storage.chashui_xiaobai_round;
		},
		},
	},
});
const chashui_xiaobai = xiaobaiPlan.skills.chashui_xiaobai;
const chashui_xiaobai_reset = xiaobaiPlan.skills.chashui_xiaobai_reset;

// —— 刘琰 · 绮位 ——
const chashui_qiwei = {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("h") > 0 && game.hasPlayer((current) => current != player && current.countCards("h") > 0);
	},
	filterTarget(card, player, target) {
		return target != player && target.countCards("h") > 0;
	},
	selectTarget: 1,
	async content(event, trigger, player) {
		const target = event.targets[0];
		player.logSkill("chashui_qiwei", target);
		const result = await player.chooseToCompare(target).forResult();
		if (!result?.winner) return;
		const cards = [result.player, result.target].filter((card) => card && ["c", "d", "o", "s"].includes(get.position(card)));
		if (cards.length) await result.winner.gain(cards, "gain2");
		const loser = result.winner === player ? target : player;
		const suits = new Set([result.player, result.target].filter(Boolean).map((card) => get.suit(card, false)));
		const num = 4 - suits.size;
		if (loser.isIn() && num > 0) await loser.draw(num);
	},
	ai: { order: 3, result: { player: 1 } },
};

// —— 刘琰 · 妄谮 ——
const chashui_wangjian = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "phaseUseEnd" },
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.isIn());
	},
	async cost(event, trigger, player) {
		const result = await player
			.chooseTarget("妄谮：选择一名其他角色", (card, player2, target) => target != player2)
			.set("ai", (target) => (get.attitude(player, target) > 0 ? -1 : 1))
			.forResult();
		if (!result.bool) return;
		event.result = { bool: true, targets: result.targets };
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		player.logSkill("chashui_wangjian", target);
		for (const current of [player, target]) {
			if (!current.isIn()) continue;
			const hand = current.countCards("h");
			if (hand > current.maxHp) {
				await current.chooseToDiscard("h", hand - current.maxHp, true);
			} else {
				const num = Math.min(current.maxHp - hand, 5);
				if (num > 0) await current.draw(num);
			}
		}
		await player.showHandcards("妄谮：展示手牌");
		if (!target.isIn()) return;
		await target.showHandcards("妄谮：展示手牌");
		if (!player.isIn() || !target.isIn()) return;
		const count = (who) => who.countCards("h", (card) => get.suit(card, who) == "heart");
		const mine = count(player);
		const theirs = count(target);
		if (mine === theirs) return;
		const from = mine < theirs ? player : target;
		const to = mine < theirs ? target : player;
		// 描述「♥较少的角色**对**♥较多的角色造成1点伤害」⇒ 受伤者是 to（♥多的一方）
		await to.damage(from, 1);
	},
	ai: { order: 4, result: { player: 1 } },
};

// —— 王表纺绩 · 四相 ——
const chashui_sixiang_positions = ["东", "南", "西", "北"];
/**
 * 方位 → 花色：东风对应♠、南风对应♥、西风对应♣、北风对应♦
 *
 * 出处：原型 `sixiang.lua` 的描述原文「（东风对应♠、南风对应♥、西风对应♣、北风对应♦）」，
 * 也与武将技能表 `荒海拾录-茶水贤设武将技能表.txt:416` 一致。
 * 注意原型 `souliu.lua` 的 `getCorrectNum` 写的是 `{Diamond,Heart,Club,Spade}`，
 * 对东/北两个方位与它自己的描述相反 —— 以玩家能看到的描述为准。
 */
const chashui_sixiang_suits = ["spade", "heart", "club", "diamond"];

// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_sixiangPlan = defineSkill({
	id: "chashui_sixiang",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	locked: true,
	forced: true,
	// gameStart 是全局事件、没有 event.player，写 player: 会永远不触发
	trigger: { global: "gameStart" },
	async content(event, trigger, player) {
		const draw = await player.draw(4).forResult();
		const cards = draw?.cards || [];
		if (!cards.length) return;
		player.logSkill("chashui_sixiang");
		let ordered = cards;
		if (cards.length > 1) {
			const result = await player
				.chooseToMove("四相：以任意顺序放置这四张牌（从上到下依次为东、南、西、北）", true)
				.set("list", [["风", cards]])
				.set("processAI", (list) => [list[0][1]])
				.forResult();
			if (result.bool && result.moved?.[0]?.length) ordered = result.moved[0];
		}
		await player.lose(ordered, ui.special);
		player.storage.chashui_sixiang = ordered.slice();
		player.markSkill("chashui_sixiang");
	},
	mark: true,
	intro: {
		name: "四相",
		content(storage, player) {
			const wind = player.storage.chashui_sixiang;
			if (!wind?.length) return "尚未放置「风」。";
			// 每个方位显示「方位+牌」，花色对得上的用蓝色标出来 —— 玩家一眼能数出飕飗的 X
			const suits = chashui_sixiang_suits;
			let correct = 0;
			const items = wind.map((card, index) => {
				const suit = get.suit(card, false);
				const ok = suit == suits[index];
				if (ok) correct++;
				const text = `${chashui_sixiang_positions[index] || ""}${get.translation(card)}`;
				return ok ? `<span class="bluetext">${text}</span>` : text;
			});
			return `<li>${items.filter(Boolean).join("　")}<br><li>花色对应正确：${correct} 个（即〖飕飗〗的 X）<br><li>东风♠　南风♥　西风♣　北风♦`;
		},
	},
	onremove(player) {
		delete player.storage.chashui_sixiang;
	},
	group: ["use"],
	sub: {
		use: {
		charlotte: true,
		forced: true,
		popup: false,
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			const wind = player.storage.chashui_sixiang;
			if (!wind?.length || !event.card) return false;
			const suit = get.suit(event.card, false);
			if (!suit) return false;
			const count = player.getHistory("useCard", (evt) => evt.card && get.suit(evt.card, false) == suit).length;
			if (count > 1) return false;
			return wind.some((card) => get.suit(card, false) == suit);
		},
		async content(event, trigger, player) {
			const suit = get.suit(trigger.card, false);
			const clockwise = _status.currentPhase === player;
			const result = await player
				.chooseBool(
					"四相：是否转动「风」？",
					`本轮首次使用${get.translation(suit)}牌，转动方向：${clockwise ? "顺时针" : "逆时针"}`,
				)
				.set("ai", () => true)
				.forResult();
			if (!result.bool) return;
			const wind = player.storage.chashui_sixiang.slice();
			const next = [null, null, null, null];
			if (clockwise) {
				next[0] = wind[2];
				next[3] = wind[0];
				next[1] = wind[3];
				next[2] = wind[1];
			} else {
				next[2] = wind[0];
				next[0] = wind[3];
				next[3] = wind[1];
				next[1] = wind[2];
			}
			player.storage.chashui_sixiang = next;
			player.markSkill("chashui_sixiang");
			player.logSkill("chashui_sixiang");
			await lib.chashuiSouliu(player);
		},
		},
	},
});
const chashui_sixiang = chashui_sixiangPlan.skills.chashui_sixiang;
const chashui_sixiang_use = chashui_sixiangPlan.skills.chashui_sixiang_use;



// —— 王表纺绩 · 飕飗 ——
/** 风转动后结算：算对位数（方位花色相符的个数 = X），换牌、防止伤害。 */
lib.chashuiSouliu = async (player) => {
	const wind = player.storage.chashui_sixiang;
	if (!wind?.length || !player.isIn()) return;
	const suits = chashui_sixiang_suits;
	let x = 0;
	for (let i = 0; i < 4; i++) {
		if (wind[i] && get.suit(wind[i], false) == suits[i]) x++;
	}
	if (x <= 0) {
		player.addMark("chashui_souliu_turn", 1, false);
		player.markSkill("chashui_souliu");
		return;
	}
	const pileCards = get.cards(x);
	if (!pileCards.length) return;
	player.logSkill("chashui_souliu");
	// 原型 souliu.lua 用 QML 拖拽框（SixiangBox）让玩家把「牌堆顶 X 张」与「风」自由交换：
	// 最终留在「风」栏的牌成为新的风，落在「牌堆顶」栏的牌放回牌堆顶。
	const windCards = wind.filter(Boolean);
	const result = await player
		.chooseToMove_new("飕飗：用牌堆顶的牌交换等量的「风」", true)
		.set("list", [
			["「风」", windCards.slice()],
			["牌堆顶", pileCards.slice()],
		])
		.set("processAI", (list) => {
			const slots = list[0][1].slice();
			const pile = list[1][1].slice();
			for (let i = 0; i < slots.length && pile.length; i++) {
				if (get.suit(slots[i], false) === suits[i]) continue;
				const j = pile.findIndex((card) => get.suit(card, false) === suits[i]);
				if (j < 0) continue;
				[slots[i], pile[j]] = [pile[j], slots[i]];
			}
			return [slots, pile];
		})
		.forResult();
	if (!result.bool || !result.moved?.length) return;
	// 「风」固定是四个方位，交换后仍须四张（chooseToMove_new 不管栏位容量，这里补齐/退回）
	const next = result.moved[0].slice();
	const backToPile = result.moved[1].slice();
	while (next.length > windCards.length) backToPile.push(next.pop());
	while (next.length < windCards.length && backToPile.length) next.push(backToPile.shift());
	player.storage.chashui_sixiang = next;
	player.markSkill("chashui_sixiang");
	// 从牌堆被换进「风」的牌移到特殊区
	const toSpecial = next.filter((card) => pileCards.includes(card));
	if (toSpecial.length) await game.cardsGotoSpecial(toSpecial);
	// 从「风」被换出的牌按原顺序放回牌堆顶（先插的在下面）
	// 不用 `ui.cardPile.insertBefore` 直改 DOM：那样不产生事件、联机不同步、也不走 willBeDestroyed。
	// `game.cardsGotoPile(cards,"insert")` 内部就是逐张 insertBefore(firstChild)（game/index.js:1437-1439），
	// 传入顺序与原来一致即行为不变。
	const backWind = backToPile.filter((card) => windCards.includes(card));
	if (backWind.length) await game.cardsGotoPile(backWind, "insert");
	// 交换后重算正确数（原型 getCorrectNum 重新算 mod_num）
	let mod = 0;
	for (let i = 0; i < 4; i++) {
		if (next[i] && get.suit(next[i], false) == suits[i]) mod++;
	}
	if (mod <= 0) return;
	// 可令一名角色摸至多 X 张（X 用交换后重算的 mod，与原型一致）
	const draw = await player
		.chooseControl(["cancel2", ...Array.from({ length: mod }, (_, i) => i + 1).map((num) => `${num}张`)])
		.set("prompt", "飕飗：可令一名角色摸至多" + get.cnNumber(mod) + "张牌")
		.set("ai", () => {
			// 有友方（含自己）才摸，保守取最小数
			const friendly = game.hasPlayer((current) => get.attitude(player, current) > 0);
			return friendly ? "1张" : "cancel2";
		})
		.forResult();
	if (!draw?.control || draw.control == "cancel2") return;
	const num = Number.parseInt(draw.control, 10) || 0;
	if (num <= 0) return;
	const target = await player
		.chooseTarget("飕飗：令一名角色摸" + get.cnNumber(num) + "张牌", true)
		.set("ai", (target) => get.attitude(player, target))
		.forResult();
	if (target.bool && target.targets?.length) await target.targets[0].draw(num);
};

// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_souliuPlan = defineSkill({
	id: "chashui_souliu",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	locked: true,
	forced: true,
	trigger: { player: "damageBegin3" },
	filter(event, player) {
		if (!player.countMark("chashui_souliu_turn")) return false;
		if (event.nature) return true;
		return !!event.card && get.type2(event.card) == "trick";
	},
	content(event, trigger, player) {
		player.logSkill("chashui_souliu");
		trigger.cancel();
	},
	mark: true,
	intro: {
		name: "飕飗",
		content(storage, player) {
			return player.countMark("chashui_souliu_turn")
				? "本回合你防止属性伤害与锦囊牌伤害。"
				: "「风」全部错位时，本回合你防止属性伤害与锦囊牌伤害。";
		},
	},
	onremove: true,
	group: ["clear"],
	sub: {
		clear: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		// 原型标记名是 @@tea__souliu-turn，按「回合」清而不是按「轮」
		trigger: { global: "phaseBeforeStart" },
		content(event, trigger, player) {
			player.removeMark("chashui_souliu_turn", player.countMark("chashui_souliu_turn"), false);
			player.markSkill("chashui_souliu");
		},
		},
	},
});
const chashui_souliu = chashui_souliuPlan.skills.chashui_souliu;
const chashui_souliu_clear = chashui_souliuPlan.skills.chashui_souliu_clear;



// —— 何定 · 恃宠 ——
const chashui_shichong_items = [
	["basic", "将一张手牌当任意基本牌使用"],
	["slash", "将一名角色的一张手牌当【杀】使用"],
	["target", "对一名角色使用一张手牌"],
];

const chashui_shichong = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { global: "phaseEnd" },
	filter(event, player) {
		if (event.player.getSeatNum() !== 1) return false;
		return game.hasPlayer((current) => current != player && current.countCards("h") > 0);
	},
	async cost(event, trigger, player) {
		const result = await player
			.chooseTarget(
				"恃宠：选择一名有手牌的其他角色",
				true,
				(card, player2, target) => target != player2 && target.countCards("h") > 0,
			)
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
		if (!result.bool) return;
		event.result = { bool: true, targets: result.targets };
	},
	async content(event, trigger, player) {
		const to = event.targets[0];
		player.logSkill("chashui_shichong", to);
		const chosen = await player
			.chooseButton(
				[
					"恃宠：选择两项（然后由" + get.translation(to) + "从中选择一项执行）",
					[chashui_shichong_items.map(([key, label]) => [key, label]), "textbutton"],
				],
				true,
				2,
			)
			.set("ai", () => 1)
			.forResult();
		if (!chosen.bool || !chosen.links?.length) return;
		const keys = chosen.links.slice();
		const pick = await to
			.chooseControl(keys.map((key) => chashui_shichong_items.find((item) => item[0] == key)[1]))
			.set("prompt", "恃宠：选择一项执行")
			.set("ai", () => 0)
			.forResult();
		const key = keys[pick?.index ?? 0];
		if (!key || !to.isIn()) return;
		if (key == "basic") {
			// ①「你指定的基本牌」= 何定指定牌名（原型 askToChoice(player)），目标只选手牌
			const names = lib.inpile.filter((name) => get.type(name) == "basic" && to.hasUseTarget({ name, isCard: true }, false, false));
			if (!names.length) return;
			const name = await player
				.chooseButton(["恃宠：指定一个基本牌名", [names.map((item) => [item, get.translation(item)]), "textbutton"]], true)
				.set("ai", () => 1)
				.forResult();
			if (!name?.bool || !name.links?.length) return;
			const basicName = name.links[0];
			const card = await to
				.chooseCard("h", true, "恃宠：将一张手牌当【" + get.translation(basicName) + "】使用")
				.set("ai", (card) => get.value(card))
				.forResult();
			if (!card?.bool || !card.cards?.length) return;
			await to.chooseUseTarget(get.autoViewAs({ name: basicName, isCard: true }, card.cards), card.cards, false, "恃宠");
		} else if (key == "slash") {
			// ②「将其一张手牌」= 何定从其手牌里选（原型 askToChooseCard(player, target=to)）
			if (!to.countCards("h")) return;
			const card = await player
				.choosePlayerCard(to, true, "h", "恃宠：选择其一张手牌当【杀】使用")
				.set("ai", (button) => get.value(button.link))
				.forResult();
			if (!card?.bool || !card.cards?.length) return;
			await to.chooseUseTarget(get.autoViewAs({ name: "sha", isCard: true }, card.cards), card.cards, false, "恃宠");
		} else {
			// ③「对你指定的角色」= 何定指定目标（原型 askToChoosePlayers(player)），
			// 目标对其使用一张手牌，无距离次数限制（原型 bypass_distances+bypass_times）
			const victim = await player
				.chooseTarget("恃宠：指定一名角色", true, (card, player2, target) => target.isIn())
				.set("ai", (target) => -get.attitude(player, target))
				.forResult();
			if (!victim?.bool || !victim.targets?.length) return;
			const aim = victim.targets[0];
			// 先筛出「对 aim 真正可用」的手牌。原实现把任意手牌都放出来，选到不能对目标使用的牌
			// （装备牌、【闪】/【无懈】这类无目标牌、满血时的【桃】等）后 canUse 直接 return，
			// 表现就是「选了手牌没有后续」。
			// canUse 第 3 参 false = 无距离限制（对应原型 bypass_distances）；不传 includecard
			// 即不检查使用次数（对应原型 bypass_times），见 player.js:10458-10485。
			const usable = to.getCards("h").filter((card2) => to.canUse(card2, aim, false));
			if (!usable.length) {
				game.log(to, "没有可以对" + get.translation(aim) + "使用的手牌");
				return;
			}
			const card = await to
				.chooseCard({
					prompt: "恃宠：对" + get.translation(aim) + "使用一张手牌",
					position: "h",
					filterCard: (card2) => to.canUse(card2, aim, false),
					forced: true,
				})
				.set("ai", (card2) => get.value(card2))
				.forResult();
			if (!card?.bool || !card.cards?.length) return;
			if (!to.canUse(card.cards[0], aim, false)) return;
			const next = to.useCard(card.cards[0], card.cards, [aim], "chashui_shichong");
			next.addCount = false;
			await next;
		}
	},
	ai: { order: 4 },
};

// —— 何定 · 放恣 ——
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_fangziPlan = defineSkill({
	id: "chashui_fangzi",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	enable: "chooseToUse",
	usable: 1,
	// 转换技的标准 mark 写法：mark + marktext "☯" + intro.content(storage)，不用 markimage
	// （没有 marktext 时标记会退化成技能名首字「放」，且引擎不会按阴阳旋转，player.js:10362-10393）
	mark: true,
	marktext: "☯",
	zhuanhuanji: true,
	intro: {
		name: "放恣",
		content(storage, player) {
			return player.storage.chashui_fangzi
				? "阴：将三张牌当【酒】或【无中生有】使用。"
				: "阳：将一张牌当【酒】或【无中生有】使用。";
		},
	},
	filterCard(card, player) {
		return true;
	},
	selectCard() {
		return get.player().storage.chashui_fangzi ? 3 : 1;
	},
	position: "hs",
	filter(event, player) {
		const num = player.storage.chashui_fangzi ? 3 : 1;
		if (player.countCards("hs") < num) return false;
		return ["jiu", "wuzhong"].some((name) => event.filterCard(get.autoViewAs({ name, isCard: true }, "unsure"), player, event));
	},
	chooseButton: {
		dialog(event, player) {
			const list = ["jiu", "wuzhong"].filter((name) =>
				event.filterCard(get.autoViewAs({ name, isCard: true }, "unsure"), player, event),
			);
			return ui.create.dialog("放恣", [[list.map((name) => [name, get.translation(name)]), "textbutton"]]);
		},
		filter(button, player) {
			const evt = get.event().getParent();
			return evt.filterCard(get.autoViewAs({ name: button.link, isCard: true }, "unsure"), player, evt);
		},
		check(button) {
			return get.player().getUseValue({ name: button.link });
		},
		backup(links, player) {
			return {
				audio: "chashui_fangzi",
				popname: true,
				position: "hs",
				filterCard: () => true,
				selectCard() {
					return get.player().storage.chashui_fangzi ? 3 : 1;
				},
				viewAs: { name: links[0], isCard: true },
				async precontent(event, trigger, player2) {
					// 只切转换态；使用交还给引擎的 useResult——这里自调 useCard 会和引擎的
					// useResult（player.js:7357-7370，result.card 还在就再用一次）双重结算
					player2.changeZhuanhuanji("chashui_fangzi");
				},
			};
		},
	},
	ai: { order: 5, result: { player: 1 } },
	group: ["swap"],
	sub: {
		swap: {
		charlotte: true,
		forced: true,
		popup: false,
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			// useCard 的 skill 是 backup 名（chooseButton 路径），按前缀认（规鉴 debuff 同款）
			if (!String(event.skill || "").startsWith("chashui_fangzi")) return false;
			return game.hasPlayer((current) => current != player && current.countCards("h") == player.countCards("h"));
		},
		async content(event, trigger, player) {
			// 描述是「然后你**须**与一名手牌数与你相同的角色交换手牌」——不是可选，传 forced
			const result = await player
				.chooseTarget(
					"放恣：选择一名手牌数与你相同的角色交换手牌",
					true,
					(card, player2, target) => target != player2 && target.countCards("h") == player2.countCards("h"),
				)
				.set("ai", (target) => -get.attitude(player, target))
				.forResult();
			if (!result.bool || !result.targets?.length) return;
			const target = result.targets[0];
			player.logSkill("chashui_fangzi", target);
			await player.swapHandcards(target);
		},
		},
	},
});
const chashui_fangzi = chashui_fangziPlan.skills.chashui_fangzi;
const chashui_fangzi_swap = chashui_fangziPlan.skills.chashui_fangzi_swap;



// —— 张修 · 符节 ——
/** 判断一组点数是否连续（排序后相邻差 1）。 */
lib.chashuiFujieSeries = (cards, player = get.player()) => {
	if (!cards || cards.length < 2) return false;
	const nums = cards.map((card) => get.number(card, player)).sort((a, b) => a - b);
	for (let i = 1; i < nums.length; i++) {
		if (nums[i] - nums[i - 1] !== 1) return false;
	}
	return true;
};

const chashui_fujie = {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		// 描述只写「牌」，原型初始取牌区同样是 he（手牌+装备区），不能只给手牌
		return player.countCards("he", (card) => player.canRecast(card)) > 1 && game.hasPlayer((current) => current.isDamaged());
	},
	filterCard(card, player) {
		// 原生范本 hszaibi（character/offline.js:38651-38667）：
		// 每次加选都拿「已选 + 当前候选」整体判连续；不写 filterCard 的话，选满两张后第三张可以乱选
		if (!player.canRecast(card)) return false;
		const selected = ui.selected.cards.slice();
		if (!selected.length) return true;
		return lib.chashuiFujieSeries(selected.concat(card), player);
	},
	selectCard: [2, Infinity],
	position: "he",
	complexCard: true,
	// 与原生 hszaibi 一致：内容里自己 recast，禁止引擎再自动弃置/移动
	lose: false,
	discard: false,
	delay: false,
	filterOk() {
		return lib.chashuiFujieSeries(ui.selected.cards);
	},
	prompt: "选择至少两张点数连续的牌，重铸后视为对至多等量角色使用一张【桃】",
	async content(event, trigger, player) {
		const cards = event.cards.slice();
		player.logSkill("chashui_fujie");
		const nums = cards.map((card) => get.number(card));
		const min = Math.min(...nums);
		const max = Math.max(...nums);
		await player.recast(cards);
		const targets = await player
			.chooseTarget(
				`符节：选择至多${get.cnNumber(cards.length)}名已受伤的角色`,
				[1, cards.length],
				(card, player2, target) => target.isDamaged(),
			)
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!targets.bool || !targets.targets?.length) return;
		// 底牌已经在 recast 里进了弃牌堆，不能再当实体底牌传给 useCard
		// （否则引擎会把它们从弃牌堆拉回处理区，且【桃】的花色/点数被污染）。
		// 纯虚拟牌的正确写法：player.useCard(vcard, targets, skill)，不传 cards（player.js:7396-7425）。
		await player.useCard({ name: "tao", isCard: true }, targets.targets, "chashui_fujie");
		for (const target of targets.targets.slice()) {
			if (!target.isIn()) continue;
			// 门槛判的是张修的体力值（原型代码 player.hp >= #cards），不是筛目标体力值
			if (player.hp < cards.length) continue;
			// 原型取牌区是 he（手牌+装备区）
			if (!target.countCards("he")) {
				await target.damage(player, 2, "thunder");
				continue;
			}
			const choice = await target
				.chooseBool(
					"符节：重铸一张点数在区间内的牌，或受到 2 点雷电伤害",
					`区间：${get.cnNumber(min, true)}~${get.cnNumber(max, true)}`,
				)
				.set("ai", () => get.attitude(target, player) > 0)
				.forResult();
			if (choice.bool) {
				const pick = await target
					.chooseCard("he", "符节：重铸一张点数在区间内的牌", (card) => {
						const num = get.number(card);
						return num >= min && num <= max;
					})
					.forResult();
				if (pick.bool && pick.cards?.length) await target.recast(pick.cards);
				else await target.damage(2, "thunder");
			} else {
				await target.damage(player, 2, "thunder");
			}
		}
	},
	ai: { order: 4, result: { player: 1 } },
};

// —— 张修 · 蓄众 ——
const chashui_xuzhong = {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		// 「本回合此技能失效」由 disableSkill 实现（描述变灰）；载体存在期间不再可用
		return !player.hasSkill("chashui_xuzhong_disabled");
	},
	filterCard: () => false,
	selectCard: -1,
	async content(event, trigger, player) {
		player.logSkill("chashui_xuzhong");
		const cards = get.cards(3);
		if (!cards.length) return;
		await game.cardsGotoOrdering(cards);
		// 「观看」= 私有查看（showCards 是公开展示，会泄露牌面）
		await player.viewCards("蓄众：牌堆顶的三张牌", cards);
		const nums = cards.map((card) => get.number(card));
		const min = Math.min(...nums);
		const max = Math.max(...nums);
		const own = player.getCards("h").map((card) => get.number(card));
		const match = cards.filter((card) => {
			const num = get.number(card);
			return num > min && num < max && !own.includes(num);
		});
		if (match.length) {
			// 只获得**符合条件**的牌（旧版把三张全拿走）
			await player.gain(match, "gain2");
			// 未获得的按原顺序放回牌堆顶。
			// 不要直接操作 ui.cardPile DOM：那样不产生事件、联机不同步、也不走 willBeDestroyed。
			// cardsGotoPile(..., "insert") 逐张 insertBefore(firstChild) ⇒ 传入顺序会被反转，故先 reverse。
			const rest = cards.filter((card) => !match.includes(card));
			if (rest.length) await game.cardsGotoPile(rest.slice().reverse(), "insert");
		} else {
			await player.loseHp(1);
			await player.gain(cards, "gain2");
			// 「本回合此技能失效」= 描述变灰：disableSkill + 独立载体（不能进 group，disableSkill 会级联）
			// 本回合结束（phaseAfter）由 addTempSkill 到期移除载体，onremove 里 enableSkill 恢复
			player.disableSkill("chashui_xuzhong_disabled", "chashui_xuzhong");
			player.addTempSkill("chashui_xuzhong_disabled", "phaseAfter");
		}
	},
	ai: { order: 4, result: { player: 1 } },
};

// 蓄众失效载体：不用 mark（用户要求描述变灰，而不是加标记）
// 技能 id 与 disableSkill 的禁用方键一致；addTempSkill 到期 → removeSkill → onremove 恢复
const chashui_xuzhong_disabled = {
	charlotte: true,
	onremove(player) {
		player.enableSkill("chashui_xuzhong_disabled");
	},
};

// —— 张让赵忠 · 登阶 ——
const chashuiDengjieStep = async (player) => {
	const targets = game.filterPlayer((current) => current.countCards("h") > player.countCards("h"));
	if (!targets.length) {
		await player.draw(1);
		return;
	}
	const result = await player
		.chooseTarget("登阶：弃置一名手牌数大于你的角色一张牌", true, (card, player2, target) => target.countCards("h") > player2.countCards("h"))
		.set("ai", (target) => -get.attitude(player, target))
		.forResult();
	if (!result.bool || !result.targets?.length) return;
	// 原型 `askToChooseCard(player, {target = to, flag = "he"})`：手牌+装备区，不是只有手牌
	await player.discardPlayerCard(result.targets[0], "he", true);
};

const chashui_dengjie = {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return player.countCards("e") > 0;
	},
	filterCard: () => false,
	selectCard: -1,
	async content(event, trigger, player) {
		player.logSkill("chashui_dengjie");
		const equips = player.getCards("e").slice();
		const r_equip = equips.length;
		if (equips.length) {
			await player.recast(equips);
			await lib.chashuiDengjieStep(player);
		}
		const tricks = player.getCards("h", (card) => get.type(card) == "trick");
		let r_trick = 0;
		if (tricks.length > r_equip) {
			const num = Math.min(r_equip + 1, tricks.length);
			const result = await player
				.chooseCard("h", `登阶：重铸至少${get.cnNumber(num)}张锦囊牌`, [num, tricks.length], (card) => get.type(card) == "trick", true)
				.set("ai", (card) => get.value(card))
				.forResult();
			if (result.bool && result.cards?.length) {
				r_trick = result.cards.length;
				await player.recast(result.cards);
				await lib.chashuiDengjieStep(player);
			}
		}
		const basics = player.getCards("h", (card) => get.type(card) == "basic");
		if (r_trick && basics.length > r_trick) {
			const num = Math.min(r_trick + 1, basics.length);
			const result = await player
				.chooseCard("h", `登阶：重铸至少${get.cnNumber(num)}张基本牌`, [num, basics.length], (card) => get.type(card) == "basic", true)
				.set("ai", (card) => get.value(card))
				.forResult();
			if (result.bool && result.cards?.length) {
				await player.recast(result.cards);
				await lib.chashuiDengjieStep(player);
			}
		}
	},
	ai: { order: 4, result: { player: 1 } },
};

// —— 张让赵忠 · 替政 ——
/**
 * 替政（张让赵忠）
 *
 * 描述：其他角色视为拥有目标仅为你的「放权」。每轮限一次，其他角色的出牌阶段开始时，
 *       你可以弃置三张类型不同的牌令其发动「放权」，然后其获得这些牌。
 *
 * 「放权」变体（原型 tizheng.lua + tizheng_active.lua，文案取自 tizheng_active）：
 *   ① 其他角色出牌阶段开始前，可跳过此阶段；
 *   ② 跳过后回合结束时，可弃置一张手牌，令拥有【替政】的角色获得一个额外回合。
 * 无名杀实现：
 *   - 变体技能 mount 给所有其他角色（巧筑 mount 同款：gameStart/changeSkillsAfter，
 *     避开开局 init clearSkills 把挂载清掉）；
 *   - ① = trigger phaseUseBefore + chooseBool → trigger.cancel() 结束阶段（R27：置 finish 只吞本阶段）；
 *   - ② = rider 挂在变体 group 里，phaseAfter 消费 storage.chashui_tizheng_fq 标记；
 *   - 替政本体强制路径：给牌后置同一标记（rider 同样生效），再 cancel 阶段。
 */
const chashui_tizheng = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { global: "phaseUseBegin" },
	filter(event, player) {
		if (event.player == player) return false;
		if (player.countCards("he") <= 2) return false;
		if (player.hasSkill("chashui_tizheng_used")) return false;
		return true;
	},
	async cost(event, trigger, player) {
		event.result = await player
			.chooseBool("替政：是否弃置三张类型不同的牌，令" + get.translation(trigger.player) + "发动「放权」？")
			.set("ai", () => get.attitude(player, trigger.player) < 0)
			.forResult();
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		player.logSkill("chashui_tizheng", target);
		// 其本回合已经自主发动过「放权」就不再重复强制（同一次跳阶段收两次钱）
		if (target.storage.chashui_tizheng_fq) return;
		// 选牌时就拦掉重复类型：旧版 filterCard 恒 true，玩家可以选三张同类型，
		// 点确定后 :6754 直接 return —— 答了「是」却什么都不发生，且没有任何提示。
		const tizhengFilterCard = (card) => {
			const types = ui.selected.cards.map((one) => get.type(one));
			return !types.includes(get.type(card));
		};
		const tizhengFilterOk = () => {
			const cards = ui.selected.cards;
			if (cards.length != 3) return false;
			return new Set(cards.map((one) => get.type(one))).size == 3;
		};
		const result = await player
			.chooseCard("he", "替政：选择三张类型各不相同的牌", 3, tizhengFilterCard)
			.set("filterOk", tizhengFilterOk)
			.set("prompt2", "三张牌的类型必须互不相同")
			.set("ai", (card) => 6 - get.value(card))
			.forResult();
		if (!result.bool || !result.cards?.length) return;
		const types = new Set(result.cards.map((card) => get.type(card)));
		if (types.size !== result.cards.length) return;
		await player.give(result.cards, target);
		player.addTempSkill("chashui_tizheng_used", "roundStart");
		// 记「已发动放权」，其回合结束时 rider 会询问弃牌换你的额外回合
		target.storage.chashui_tizheng_fq = true;
		// 结束其出牌阶段：trigger 就是 phaseUse 事件，cancel() 会直接 finish 掉它
		if (target.isIn()) trigger.cancel();
	},
	ai: { order: 4 },
	group: ["chashui_tizheng_mount"],
	onremove(player) {
		// 场上还有人持有替政时不要拆（可能被复制/转移）
		if (game.hasPlayer((current) => current.hasSkill("chashui_tizheng"))) return;
		game.countPlayer((current) => current.removeSkill("chashui_tizheng_fangquan"));
	},
	subSkill: {
		mount: {
			charlotte: true,
			sub: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: { global: ["gameStart", "changeSkillsAfter"] },
			filter(event, player) {
				return player.hasSkill("chashui_tizheng");
			},
			content(event, trigger, player) {
				game.countPlayer((current) => {
					if (current != player) current.addSkill("chashui_tizheng_fangquan");
				});
			},
		},
	},
};

/** 「放权」变体：授予其他角色，可自主跳过出牌阶段（目标仅为替政持有者的换回合契约） */
const chashui_tizheng_fangquan = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: "chashui_tizheng",
	charlotte: true,
	trigger: { player: "phaseUseBefore" },
	async cost(event, trigger, player) {
		event.result = await player
			.chooseBool("放权：是否跳过出牌阶段？")
			.set("ai", () => {
				const lord = game.findPlayer((current) => current != player && current.hasSkill("chashui_tizheng"));
				return !!lord && get.attitude(player, lord) > 4;
			})
			.forResult();
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_tizheng_fangquan");
		player.storage.chashui_tizheng_fq = true;
		// 结束出牌阶段：trigger 就是 phaseUse 事件，cancel() 只吞掉本阶段（R27）
		trigger.cancel();
	},
	group: ["chashui_tizheng_fq_rider"],
};

/** 放权 rider：发动过的回合结束时，可弃一张手牌令替政持有者获得额外回合 */
const chashui_tizheng_fq_rider = {
	audio: false,
	charlotte: true,
	trigger: { player: "phaseAfter" },
	filter(event, player) {
		return !!player.storage.chashui_tizheng_fq;
	},
	async cost(event, trigger, player) {
		// 一次性消费：无论是否弃牌，标记先收掉（每次发动只问一次）
		delete player.storage.chashui_tizheng_fq;
		const lord = game.findPlayer((current) => current != player && current.isIn() && current.hasSkill("chashui_tizheng"));
		if (!lord || !player.countCards("h")) {
			event.result = { bool: false };
			return;
		}
		event.result = await player
			.chooseBool("放权：是否弃置一张手牌，令" + get.translation(lord) + "获得一个额外回合？")
			.set("ai", () => get.attitude(player, lord) > 0)
			.forResult();
	},
	async content(event, trigger, player) {
		const lord = game.findPlayer((current) => current != player && current.isIn() && current.hasSkill("chashui_tizheng"));
		if (!lord) return;
		await player.chooseToDiscard("h", 1, true);
		if (lord.isIn()) {
			game.log(lord, "获得了一个额外回合");
			lord.insertPhase();
		}
	},
};

const chashui_tizheng_used = {
	charlotte: true,
	mark: true,
	intro: {
		name: "替政",
		content: "本轮已发动过〖替政〗。",
	},
	onremove: true,
};

// —— 魏华存 · 炼修 ——
// 原型 lianxiu.lua：fk.EventPhaseStart（自己的每个阶段）→ data.phase_end = true（结束该阶段）
//   → 重铸任意张手牌 → 可使用一张牌（不能与本回合上一张使用的牌类型相同，bypass_times）。
// 无名杀对应：六个阶段各自的 phaseXxxBegin 里 trigger.cancel() 结束该阶段，再执行同样的重铸+使用。
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_lianxiuPlan = defineSkill({
	id: "chashui_lianxiu",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	locked: true,
	forced: true,
	trigger: {
		player: [
			"phaseZhunbeiBegin",
			"phaseJudgeBegin",
			"phaseDrawBegin",
			"phaseUseBegin",
			"phaseDiscardBegin",
			"phaseJieshuBegin",
		],
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_lianxiu");
		// 该阶段的正常内容改为本技能的效果
		trigger.cancel();
		if (!player.isIn()) return;
		const cards = await player
			.chooseCard("h", [0, Infinity], "炼修：可以重铸任意张手牌")
			.set("ai", (card) => (get.value(card) < 4 ? 1 : -1))
			.forResult();
		if (cards.bool && cards.cards?.length) await player.recast(cards.cards);
		if (!player.isIn()) return;
		// 不能与本回合使用的上一张牌类型相同
		const last = player
			.getHistory("useCard", (evt) => evt.card)
			.map((evt) => get.type(evt.card))
			.pop();
		// bypass_times 的等价物：临时把使用次数放开
		player.addTempSkill("chashui_lianxiu_free", "phaseAfter");
		await player
			.chooseToUse({
				prompt: last ? `炼修：可使用一张非${get.translation(last)}牌` : "炼修：可使用一张牌",
				// 自定义 filterCard 会替换引擎默认的 lib.filter.filterCard，必须自己把
				// 「这张牌现在是否合法」补回来：cardEnabled（闪/无懈/满血桃）+ cardUsable
				//（次数）+ 至少有一个合法目标（hasUseTarget）；否则不合法的牌也会出现。
				filterCard(card, me, evt) {
					evt = evt || get.event();
					if (last && get.type(card) == last) return false;
					return lib.filter.filterCard(card, me, evt) && me.hasUseTarget(card, true, evt);
				},
				filterTarget(card, me, to) {
					return lib.filter.filterTarget(card, me, to);
				},
			})
			.set("ai", () => 1)
			.forResult();
		player.removeSkill("chashui_lianxiu_free");
	},
	ai: { order: 1 },
	group: ["lose", "end", "clear"],
	sub: {
		lose: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { player: "loseAfter" },
		filter(event, player) {
			// 「失去最后一张手牌」：本次失去里必须真有手牌（手牌本来就是 0 时丢装备不算）
			if (!(event.hs || []).length) return false;
			if (player.countCards("h") > 0) return false;
			if (player.storage.chashui_lianxiu_round) return false;
			return true;
		},
		async content(event, trigger, player) {
			player.storage.chashui_lianxiu_round = true;
			await player.draw(3);
		},
		},
		end: {
		charlotte: true,
		forced: true,
		popup: false,
		trigger: { player: "phaseAfter" },
		filter(event, player) {
			return player.countCards("h") > 3;
		},
		async content(event, trigger, player) {
			player.logSkill("chashui_lianxiu");
			await player.chooseToDiscard("h", player.countCards("h") - 3, true);
			await player.recover(1);
		},
		},
		clear: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		// 原型标记名带 -turn，是「每回合」不是「每轮」
		trigger: { global: "phaseBeforeStart" },
		content(event, trigger, player) {
			delete player.storage.chashui_lianxiu_round;
		},
		},
	},
});
const chashui_lianxiu = chashui_lianxiuPlan.skills.chashui_lianxiu;
const chashui_lianxiu_lose = chashui_lianxiuPlan.skills.chashui_lianxiu_lose;
const chashui_lianxiu_end = chashui_lianxiuPlan.skills.chashui_lianxiu_end;
const chashui_lianxiu_clear = chashui_lianxiuPlan.skills.chashui_lianxiu_clear;

/** 让炼修里的使用不计次数（原型 bypass_times）。
 *
 * ⚠️ 不能写 `cardUsable: () => Infinity`。`mod.cardUsable` 的第三形参 `num` 是引擎算好的
 *    当前上限（初值 `get.info(card).usable`，三个消费点都传入：player.js:12260、
 *    library/index.js:11162、:11206），`game.checkMod` 会把返回值写回 `num`。
 *    返回 `Infinity` = 「这张牌无限次」，而本技能只要求「这一次使用不算次数」，
 *    且它是 `phaseAfter` 才过期 —— 一旦 `removeSkill` 没跑到（content 中途返回/异常），
 *    整个出牌阶段就无限出牌。原生同需求写法是 `num + 1`（chijian，character/huicui.js:18767-18769）。
 *    这里同样用 `num + 1`：只多给一次，之后的取舍仍由 `chooseToUse` 自己把关。
 */
const chashui_lianxiu_free = {
	charlotte: true,
	forced: true,
	popup: false,
	mod: {
		cardUsable(card, player, num) {
			// bypass_times 等价物：凡是有「每回合使用次数」的牌都放开一次。
			// 不能只写【杀】——【酒】同样 `usable: 1`（card/extra.js:72），
			// 否则本回合已喝过酒时炼修给的那次使用会被引擎自己挡掉。
			if (!get.info(card)?.usable) return;
			if (!player.isPhaseUsing()) return;
			return num + 1;
		},
	},
};







// —— 魏华存 · 讲道 ——
const chashui_jiangdao = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "phaseBegin" },
	filter: () => true,
	async cost(event, trigger, player) {
		const result = await player
			.chooseTarget("讲道：选择一名角色")
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!result.bool) return;
		event.result = { bool: true, targets: result.targets };
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		player.logSkill("chashui_jiangdao", target);
		const hand = target.countCards("h");
		if (hand === 0) {
			await target.draw(3);
		} else if (hand > 3) {
			await target.chooseToDiscard("h", hand - 3, true);
			await target.recover(1);
		} else {
			const cards = await target
				.chooseCard("h", [0, Infinity], "讲道：可以重铸任意张手牌")
				.set("ai", (card) => (get.value(card) < 4 ? 1 : -1))
				.forResult();
			if (cards.bool && cards.cards?.length) await target.recast(cards.cards);
			if (target.isIn()) {
				await target.chooseToUse({ prompt: "讲道：可使用一张牌" }).set("ai", () => 1).forResult();
			}
		}
	},
	ai: { order: 5 },
};

// —— 荀勖 · 正音 ——
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_zhengyinPlan = defineSkill({
	id: "chashui_zhengyin",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	enable: "chooseToUse",
	// 转换技的标准 mark 写法：mark + marktext "☯" + intro.content(storage)，不用 markimage
	// （没有 marktext 时标记会退化成技能名首字「正」，且引擎不会按阴阳旋转，player.js:10362-10393）
	mark: true,
	marktext: "☯",
	zhuanhuanji: true,
	intro: {
		name: "正音",
		content(storage, player) {
			// X 是「本轮发动次数（含本次），至多为体力值」，不写出来玩家没法判断该选几张
			const x = lib.chashuiZhengyinX(player);
			const used = player.storage.chashui_zhengyin_used || [];
			const head = player.storage.chashui_zhengyin
				? `阴：展示${get.cnNumber(x)}张黑色牌置于牌堆顶，视为使用任意一张基本牌或普通锦囊牌。`
				: `阳：将至少${get.cnNumber(x)}张红色牌当任意一张基本牌或普通锦囊牌使用。`;
			const tail = used.length ? used.map((name) => get.translation(name)).join("、") : "无";
			return `${head}<br><li>当前X：${x}<br><li>本轮已用牌名：${tail}`;
		},
	},
	hiddenCard(player, name) {
		// 正音能印「任意基本牌/普通锦囊」，其中包括 notarget 的【闪】【无懈可击】和【桃】。
		// 没有 hiddenCard 的话 hasShan/hasWuxie/hasSha/canSave 这些判定完全看不到本技能
		// （player.js:13507-13563 只认静态 viewAs 或 hiddenCard），AI 会以为自己没牌可用。
		const type = get.type(name);
		if (type != "basic" && type != "trick") return false;
		if (!lib.chashuiZhengyinNames(player).includes(name)) return false; // 每轮每种牌名限一次
		const yin = !!player.storage.chashui_zhengyin;
		const num = lib.chashuiZhengyinX(player);
		const cards = player.getCards("hs", (card) => (yin ? get.color(card) == "black" : get.color(card) == "red"));
		return cards.length >= num;
	},
	filter(event, player) {
		const num = lib.chashuiZhengyinX(player);
		const yin = player.storage.chashui_zhengyin;
		const cards = player.getCards("hs", (card) => (yin ? get.color(card) == "black" : get.color(card) == "red"));
		if (cards.length < num) return false;
		return lib.chashuiZhengyinNames(player).some((name) => event.filterCard(get.autoViewAs({ name, isCard: true }, "unsure"), player, event));
	},
	chooseButton: {
		dialog(event, player) {
			// 选牌面（vcard），不要选文字按钮：用真实牌面展示可印的牌名
			const names = lib.chashuiZhengyinNames(player);
			const list = get.inpileVCardList(
				(info) =>
					names.includes(info[2]) &&
					event.filterCard({ name: info[2], nature: info[3], isCard: true }, player, event),
			);
			if (!list.length) return ui.create.dialog("正音：当前没有可使用的牌");
			return ui.create.dialog("正音", [list, "vcard"]);
		},
		filter(button, player) {
			const evt = get.event().getParent();
			return evt.filterCard({ name: button.link[2], nature: button.link[3], isCard: true }, player, evt);
		},
		check(button) {
			return get.player().getUseValue({ name: button.link[2], nature: button.link[3] }, null, true);
		},
		backup(links, player) {
			const name = links[0][2];
			const nature = links[0][3];
			return {
				audio: "chashui_zhengyin",
				popname: true,
				position: "hs",
				filterCard(card, player2) {
					return player2.storage.chashui_zhengyin ? get.color(card) == "black" : get.color(card) == "red";
				},
				selectCard() {
					const player = get.player();
					const num = lib.chashuiZhengyinX(player);
					// 阳：「至少X张红色牌」→ 可多选；阴：「展示X张黑色牌」→ 恰好 X 张
					if (player.storage.chashui_zhengyin) return [num, num];
					return [num, Math.max(num, player.countCards("hs"))];
				},
				viewAs: { name, nature, isCard: true },
				async precontent(event, trigger, player2) {
					const yin = !!player2.storage.chashui_zhengyin;
					player2.changeZhuanhuanji("chashui_zhengyin");
					lib.chashuiZhengyinRecord(player2, name);
					const cards = (event.result.cards || []).slice();
					if (yin) {
						await player2.showCards(cards, "正音：展示的牌");
						// 阴：展示的牌置于牌堆顶，然后凭空视为使用（不消耗这些牌）
						// 走 game.cardsGotoPile 而不是直改 ui.cardPile DOM（同 souliu 的理由）
						if (cards.length) await game.cardsGotoPile(cards.slice().reverse(), "insert");
						event.result.card = get.autoViewAs({ name, nature, isCard: true }, []);
						event.result.cards = [];
					}
					// 使用交还给引擎的 useResult（自调 useCard 会双重结算，放恣同款）
				},
			};
		},
	},
	ai: { order: 5, result: { player: 1 } },
	group: ["clear"],
	sub: {
		clear: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { global: "roundStart" },
		content(event, trigger, player) {
			delete player.storage.chashui_zhengyin_used;
			delete player.storage.chashui_zhengyin_count;
		},
		},
	},
});
const chashui_zhengyin = chashui_zhengyinPlan.skills.chashui_zhengyin;
const chashui_zhengyin_clear = chashui_zhengyinPlan.skills.chashui_zhengyin_clear;

/** X：本轮发动次数（含本次，即已发动次数+1），至多为体力值。 */
lib.chashuiZhengyinX = (player) => Math.min((player.storage.chashui_zhengyin_count || 0) + 1, Math.max(player.hp, 0));
/** 本轮尚未用过的基本牌/普通锦囊牌名。 */
lib.chashuiZhengyinNames = (player) => {
	const used = player.storage.chashui_zhengyin_used || [];
	return lib.inpile.filter(
		(name) => (get.type(name) == "basic" || get.type(name) == "trick") && !used.includes(name),
	);
};
lib.chashuiZhengyinRecord = (player, name) => {
	player.storage.chashui_zhengyin_used = (player.storage.chashui_zhengyin_used || []).concat(name);
	player.storage.chashui_zhengyin_count = (player.storage.chashui_zhengyin_count || 0) + 1;
};


// —— 荀勖 · 揣存 ——
const chashui_chuaicun = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	locked: true,
	forced: true,
	trigger: { source: "damageAfter" },
	filter(event, player) {
		return !!event.card && player.isAlive();
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_chuaicun");
		if (get.color(trigger.card, false) == "red") await player.loseHp(1);
		else await player.recover(1);
	},
};

// ===== 茶水贤设·曛（tea_ex_e）=====

// —— 杜畿 · 安东 ——
lib.chashuiAndongShow = async (player, prompt) => {
	if (!player.countCards("h")) return;
	await player.showCards(player.getCards("h"), `${get.translation(player)}【安东】：展示所有手牌`);
};

// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_andongPlan = defineSkill({
	id: "chashui_andong",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		// 「令一名有手牌的其他角色」⇒ 没有合法目标时整个技能不可发动
		return player.countCards("h", { name: "sha" }) > 0 && game.hasPlayer((current) => current != player && current.countCards("h") > 0);
	},
	async content(event, trigger, player) {
		await lib.chashuiAndongShow(player);
		const sha = player.getCards("h", { name: "sha" });
		if (sha.length) await player.recast(sha);
		await player.draw(1);
		const result = await player
			.chooseTarget("安东：令一名有手牌的其他角色展示手牌", true, (card, player2, target) => {
				return target != player2 && target.countCards("h") > 0;
			})
			.set("ai", (target) => (get.attitude(player, target) > 0 ? -1 : 1))
			.forResult();
		if (!result.bool) return;
		const target = result.targets[0];
		await target.showCards(target.getCards("h"), `${get.translation(target)}【安东】：展示所有手牌`);
		const shan = target.getCards("h", { name: "shan" });
		if (shan.length) await target.recast(shan);
	},
	ai: { order: 6, result: { player: 1 } },
	group: ["damage"],
	sub: {
		damage: {
		audio: 2,
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { player: "damageAfter" },
		async content(event, trigger, player) {
			const go = await player.chooseBool("安东：是否展示所有手牌，重铸所有【闪】？").forResult();
			if (!go.bool) return;
			player.logSkill("chashui_andong");
			await lib.chashuiAndongShow(player);
			const shan = player.getCards("h", { name: "shan" });
			if (shan.length) await player.recast(shan);
			if (shan.length && player.isDamaged()) await player.recover(1);
			const source = trigger.source;
			if (source && source.isAlive() && source.countCards("h") > 0) {
				await source.showCards(source.getCards("h"), `${get.translation(source)}【安东】：展示所有手牌`);
				const sha = source.getCards("h", { name: "sha" });
				if (sha.length) await source.recast(sha);
			}
		},
		},
	},
});
const chashui_andong = chashui_andongPlan.skills.chashui_andong;
const chashui_andong_damage = chashui_andongPlan.skills.chashui_andong_damage;



// —— 杜畿 · 应势 ——
// 牌上的「应势」既是可见 gaintag，也保留 storage：gaintag 负责显示，storage 兼容旧存档/其他读取点。
lib.chashuiYingshiCard = (player) => player.getCards("h").find((card) => card.hasGaintag?.("chashui_yingshi") || card.storage?.chashui_yingshi);
const chashuiYingshiHas = (card) => !!(card.hasGaintag?.("chashui_yingshi") || card.storage?.chashui_yingshi);

// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_yingshiPlan = defineSkill({
	id: "chashui_yingshi",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	locked: true,
	forced: true,
	mark: true,
	intro: {
		content(storage, player) {
			const card = lib.chashuiYingshiCard(player);
			if (!card) return "手牌中没有“最近一次获得的牌”。";
			return `最近一次获得的牌：${get.translation(card)}。你使用此牌时，效果结算两次；你不因使用而失去此牌后，观看一名角色的手牌。`;
		},
	},
	group: ["gain", "use", "lose"],
	onremove(player) {
		player.removeGaintag("chashui_yingshi");
		player.getCards("h").forEach((card) => {
			if (card.storage) delete card.storage.chashui_yingshi;
		});
	},
	sub: {
		gain: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		// 重铸的 recastingGain 走 player.draw，gainAfter 在部分 draw 路径上取不到牌；
		// 同时监听 drawAfter，用 draw.result.cards 兜底（两者都会清旧标记再重设，重复触发无副作用）。
		trigger: { player: ["gainAfter", "drawAfter"] },
		content(event, trigger, player) {
			// draw 的 gain 事件在部分路径上会带 getlx=false，getg() 取不到牌；
			// 用 getg 优先、trigger.cards 兜底（draw 的 gain 仍保留 event.cards）。
			// 注意：content 的 trigger 是宿主事件（name 仍是 gain/draw），
			// 实际监听名要看技能事件 event.triggername。
			const gained = (event.triggername == "drawAfter" ? trigger.result?.cards || [] : trigger.getg?.(player) || trigger.cards || []).filter((card) => get.position(card) == "h");
			// 没有获得手牌（如摸 0 张、获得装备区的牌）时不改变已有标记；
			// 原型只处理 move.toArea == Card.PlayerHand。
			if (!gained.length) return;
			// 先清旧标记（gaintag 与 storage 都清）
			player.removeGaintag("chashui_yingshi");
			player.getCards("h").forEach((card) => {
				if (card.storage) delete card.storage.chashui_yingshi;
			});
			if (gained.length == 1) {
				const card = gained[0];
				if (!card.storage) card.storage = {};
				card.storage.chashui_yingshi = true;
				player.addGaintag(card, "chashui_yingshi");
			}
			player.markSkill("chashui_yingshi");
		},
		},
		use: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { player: "useCard" },
		filter(event, player) {
			// 「你使用带有『应势』标记的牌」⇒ 底牌里**任意一张**带标记即可；
			// 旧版要求 event.cards.length == 1，转化牌（多底牌）永远不翻倍。
			return (event.cards || []).some((card) => chashuiYingshiHas(card));
		},
		content(event, trigger, player) {
			trigger.effectCount = (trigger.effectCount || 1) + 1;
			// 因使用而失去的牌不再保留“应势”标记（与原型 ReasonUse 分支一致）；
			// 后续 loseAfter 会因 parent.name == "useCard" 被排除，不会重复结算观看。
			player.removeGaintag("chashui_yingshi", trigger.cards || []);
			(trigger.cards || []).forEach((card) => {
				if (card.storage) delete card.storage.chashui_yingshi;
			});
		},
		},
		lose: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { player: "loseAfter" },
		filter(event, player) {
			if (event.parent && event.parent.name == "useCard") return false;
			return (event.cards || []).some((card) => chashuiYingshiHas(card));
		},
		async content(event, trigger, player) {
			player.removeGaintag("chashui_yingshi", trigger.cards || []);
			(trigger.cards || []).forEach((card) => {
				if (card.storage) delete card.storage.chashui_yingshi;
			});
			player.markSkill("chashui_yingshi");
			const result = await player
				.chooseTarget("应势：观看一名角色的手牌", true)
				.set("ai", (target) => (target == player ? 0 : -get.attitude(player, target)))
				.forResult();
			if (result.bool) await player.viewHandcards(result.targets[0]);
		},
		},
	},
});
const chashui_yingshi = chashui_yingshiPlan.skills.chashui_yingshi;
const chashui_yingshi_gain = chashui_yingshiPlan.skills.chashui_yingshi_gain;
const chashui_yingshi_use = chashui_yingshiPlan.skills.chashui_yingshi_use;
const chashui_yingshi_lose = chashui_yingshiPlan.skills.chashui_yingshi_lose;







// —— 卞夫人 · 兰心 ——
lib.chashuiLanxinFlow = async (player) => {
	const result = await player.chooseToDiscard("兰心：弃置任意张手牌", "h", [1, Infinity], true).forResult();
	if (!result.bool) return;
	// 「以此法弃置的牌数」= 整个流程弃置的总数（含「调整至体力值」弃掉的部分）
	let discarded = result.cards.length;
	let gained = 0;
	const diff = player.countCards("h") - player.getHp();
	if (diff > 0) {
		await player.chooseToDiscard(diff, "h", true);
		discarded += diff;
	} else if (diff < 0) {
		gained = -diff;
		await player.draw(gained);
	}
	if (discarded > gained + 1 && player.isDamaged() && !player.storage.chashui_lanxin_turn) {
		player.storage.chashui_lanxin_turn = true;
		await player.recover(1);
	}
};

// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_lanxinPlan = defineSkill({
	id: "chashui_lanxin",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		return player.countCards("h") > player.getHp();
	},
	async content(event, trigger, player) {
		await lib.chashuiLanxinFlow(player);
	},
	ai: { order: 5, result: { player: 1 } },
	group: ["damage", "clear"],
	sub: {
		damage: {
		audio: 2,
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { player: "damageAfter" },
		filter(event, player) {
			return player.countCards("h") > player.getHp();
		},
		async content(event, trigger, player) {
			const go = await player.chooseBool("兰心：是否弃置任意张手牌，然后将手牌数调整至体力值？").forResult();
			if (!go.bool) return;
			player.logSkill("chashui_lanxin");
			await lib.chashuiLanxinFlow(player);
		},
		},
		clear: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { global: "phaseBeforeStart" },
		content(event, trigger, player) {
			delete player.storage.chashui_lanxin_turn;
		},
		},
	},
});
const chashui_lanxin = chashui_lanxinPlan.skills.chashui_lanxin;
const chashui_lanxin_damage = chashui_lanxinPlan.skills.chashui_lanxin_damage;
const chashui_lanxin_clear = chashui_lanxinPlan.skills.chashui_lanxin_clear;





// —— 卞夫人 · 坤仪 ——
const chashui_kunyi = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "useCard" },
	filter(event, player) {
		return (event.targets || []).length > 0;
	},
	async cost(event, trigger, player) {
		const result = await player
			.chooseTarget(`坤仪：是否令一名目标摸一张牌？`, (card, player2, target) => trigger.targets.includes(target))
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!result.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, targets: result.targets };
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		player.logSkill("chashui_kunyi", target);
		const phase = trigger.getParent("phase");
		const had = target.getHistory("gain", (evt) => evt.getParent("phase") === phase).length > 0;
		await target.draw(1);
		if (!had) await player.draw(2);
	},
};

// —— 夏侯霸 · 奔汉 ——

/**
 * 奔汉（夏侯霸）
 *
 * 描述：每回合限一次，本回合你执行的第X个阶段结束时，你可以将手牌数调整至X。若你的手牌数：
 *       未因此变化，本技能本回合的限制次数+2；减少，你本局出牌阶段额定使用【杀】的次数+1；
 *       增加，你将下个阶段改为出牌阶段。
 *
 * 入口：六个 `phaseXxxAfter`（兜底，见下）+ 三个 `phaseXxxSkipped`。
 *   ⚠ 跳过/取消的阶段**不会派发 `<phase>After`**：`content.phase` 把 `next.isSkipped` 的
 *   阶段事件交给 `gameEvent.checkSkipped()`（gameEvent.js:258-269），那里 `finish()` 后只派发
 *   `<phase>Skipped`（gameEvent.js:267）；`cancel()` 的路径只派发 `<phase>Cancelled`
 *   （gameEvent.js:631-640）。跳出回合的 `turnOver`（content.js:4154-4164）走 cancel，
 *   乐不思蜀等的 `skip("phaseJudge")` 走 skip。两者都算「执行过这个阶段」，所以两种事件都要听。
 *
 * X 取 `phaseIndex + 1`：`content.phase` 逐阶段 `player[event.currentPhase]()` 并把
 *   `next.phaseIndex = num`（content.js:4269-4270），num 从 0 起算，而 `phaseList` 默认是
 *   ["phaseZhunbei",…,"phaseJieshu"]（content.js:4082）⇒ 准备阶段 = 第 1 个。
 *   注意 `phaseIndex` 只挂在 `phase` 事件的直接子事件上，`.setContent("phase")` 自建的额外回合不带。
 *
 * 「增加」分支改下个阶段：`evt.phaseList.splice(evt.num + 1, 0, \`phaseUse|${skill}\`)`
 *   —— 与原生 starjixian 完全同款（character/sp2/skill.js:475-485），`|` 后半段会写进
 *   新阶段事件的 `_extraPhaseReason`（content.js:4271-4273），可用于给自己上「本阶段无次数限制」。
 *   `evt.num` 此刻正是「下一个要执行的阶段下标」（content.js:4302 `event.num++` 已在阶段后跑过），
 *   所以插在 `num + 1` 就是「下个阶段之后」；`num + 1 >= phaseList.length` 时无事发生。
 */

// 本回合已发动次数 → 「本回合限一次」是否还成立
lib.chashuiBenhanCanUse = (player) => {
	return (player.storage.chashui_benhan_count || 0) < (player.storage.chashui_benhan_times || 1);
};

// 阶段事件 → 本回合第几个阶段（1 起算）；取不到返回 0 表示不发动
lib.chashuiBenhanIndex = (event) => {
	if (!event) return 0;
	if (typeof event.name == "string" && event.name.startsWith("phase") && event.phaseIndex != null) {
		return event.phaseIndex + 1;
	}
	return 0;
};

// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_benhanPlan = defineSkill({
	id: "chashui_benhan",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: {
		player: [
			"phaseZhunbeiAfter",
			"phaseJudgeAfter",
			"phaseDrawAfter",
			"phaseUseAfter",
			"phaseDiscardAfter",
			"phaseJieshuAfter",
			"phaseZhunbeiSkipped",
			"phaseJudgeSkipped",
			"phaseUseSkipped",
		],
	},
	filter(event, player) {
		if (!player.isIn() || _status.currentPhase != player) return false;
		if (!lib.chashuiBenhanIndex(event)) return false;
		return lib.chashuiBenhanCanUse(player);
	},
	async cost(event, trigger, player) {
		const index = lib.chashuiBenhanIndex(trigger);
		const go = await player.chooseBool(`奔汉：是否将手牌数调整至${get.cnNumber(index)}张？`).forResult();
		if (!go.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true };
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_benhan");
		player.storage.chashui_benhan_count = (player.storage.chashui_benhan_count || 0) + 1;
		const index = lib.chashuiBenhanIndex(trigger);
		if (!index) return;
		const before = player.countCards("h");
		if (before > index) {
			await player.chooseToDiscard("奔汉：弃置" + get.cnNumber(before - index) + "张手牌", "h", before - index, true);
		} else if (before < index) {
			await player.draw(index - before);
		}
		const after = player.countCards("h");
		if (after == before) {
			// 未变化：本回合的限制次数 +2
			player.storage.chashui_benhan_times = (player.storage.chashui_benhan_times || 1) + 2;
		} else if (after < before) {
			// 减少：本局出牌阶段额定使用【杀】的次数 +1（永久，不随回合清）
			// 这里存的是「额外次数」，mod 里是 `num + add`（num 初值=【杀】的 usable=1）
			// ⇒ 初值必须是 0，写成 `|| 1` 会让第一次就 +2。
			player.storage.chashui_benhan_slash = (player.storage.chashui_benhan_slash || 0) + 1;
			player.markSkill("chashui_benhan");
		} else {
			// 增加：**将下个阶段改为**出牌阶段（是替换，不是插入新阶段）；没有后继阶段则无事发生
			const evt = trigger.getParent("phase", true);
			if (!evt?.phaseList) return;
			if (evt.num + 1 >= evt.phaseList.length) return;
			evt.phaseList[evt.num + 1] = `phaseUse|${event.name}`;
		}
	},
	mod: {
		cardUsable(card, player, num) {
			// 写法照抄原生「持 Jian」chijian（character/huicui.js:18767-18769）与「负山」jsrgfushan_sha
			// （character/jsrg.js:6820-6826）：**必须返回 `num + N`，不能返回 `Infinity`**。
			//   · 引擎 cardUsable 的 num 初值是 `get.info(card).usable`（对【杀】是 1），
			//     三个消费点都把它传进来（player.js:12260、library/index.js:11162、:11206），
			//     返回 Infinity 就等于「这张牌无限次」，而不是「+1 次」。
			//   · `num` 会随着已使用次数被后续计算扣减（`getCardUsable` 非 pure 分支返回
			//     `num - countUsed(card)`），所以不能用 storage 直接覆盖成绝对值。
			// 次数是「本局」累计的固定增量，故用 `num + 累计值`。
			if (get.name(card, player) != "sha") return;
			const add = player.storage.chashui_benhan_slash || 0;
			if (add <= 0) return;
			return num + add;
		},
	},
	mark: true,
	marktext: "汉",
	intro: {
		name: "奔汉",
		markcount(storage, player) {
			return player.storage.chashui_benhan_slash || 0;
		},
		content(storage, player) {
			// 基础 1 次（【杀】的 usable）+ 额外次数
			const slash = 1 + (player.storage.chashui_benhan_slash || 0);
			return "你出牌阶段额定使用【杀】的次数为" + get.cnNumber(slash) + "。";
		},
	},
	// 描述只有「将下个阶段改为出牌阶段」，没有额外加成 ⇒ 不再挂 _extra 子技
	group: ["clear"],
	sub: {
		clear: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { global: "phaseAfter" },
		content(event, trigger, player) {
			delete player.storage.chashui_benhan_count;
			delete player.storage.chashui_benhan_times;
		},
		},
	},
});
const chashui_benhan = chashui_benhanPlan.skills.chashui_benhan;
const chashui_benhan_clear = chashui_benhanPlan.skills.chashui_benhan_clear;

// 本回合已发动次数 / 限制次数：回合结束清空


// —— 甘夫人 · 淑慎 ——
lib.chashuiShushenCheck = (player, suits) => (card) => {
	const suit = get.suit(card, false);
	if (suits.includes(suit)) return false;
	return true;
};

const chashui_shushen = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "gainAfter" },
	filter(event, player) {
		return player.storage.chashui_shushen_phase !== game.phaseNumber;
	},
	async cost(event, trigger, player) {
		const result = await player
			.chooseCard("淑慎：重铸任意张花色互不相同的牌", [1, Infinity], "he", (card, player2) => {
				const suits = (ui.selected.cards || []).map((item) => get.suit(item, false));
				return !suits.includes(get.suit(card, false));
			})
			// complexCard 必写：filterCard 依赖 ui.selected.cards 时，引擎默认会缓存「哪些牌可选」的结果
			// （game/index.js:6902 useCache、:6903-6915 filterCache 返回 !event.complexCard；game/check.js:21-40 的 cacheId 对 type=="card" 只由已选 button 决定 ⇒ 纯选牌时恒为 0）
			// ⇒ 缓存只按「空选择」算一次，同花色第二张仍可点。原生「花色互异」范本 character/xianding.js:29147 同样写 complexCard
			.set("complexCard", true)
			.forResult();
		if (!result.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cards: result.cards };
	},
	async content(event, trigger, player) {
		player.storage.chashui_shushen_phase = game.phaseNumber;
		player.logSkill("chashui_shushen");
		const cards = event.cards.slice();
		const suits = cards.map((card) => get.suit(card, false));
		const num = cards.length;
		await player.recast(cards);
		player.storage.chashui_shushen_suits = suits;
		player.storage.chashui_shushen_num = num;
		player.addTempSkill("chashui_shushen_watch", "phaseAfter");
	},
};

const chashui_shushen_watch = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: "useCard" },
	filter(event, player) {
		if (!player.storage.chashui_shushen_num) return false;
		if (!_status.currentPhase || !event.cards || !event.cards.length) return false;
		if (event.player != _status.currentPhase) return false;
		const suits = player.storage.chashui_shushen_suits || [];
		return event.cards.every((card) => !suits.includes(get.suit(card, false)));
	},
	async content(event, trigger, player) {
		const target = _status.currentPhase;
		const num = player.storage.chashui_shushen_num;
		delete player.storage.chashui_shushen_suits;
		delete player.storage.chashui_shushen_num;
		player.removeSkill("chashui_shushen_watch");
		if (!target || !target.isAlive()) return;
		const go = await player.chooseBool(`淑慎：是否令${get.translation(target)}摸${get.cnNumber(num)}张牌？`).forResult();
		if (!go.bool) return;
		player.logSkill("chashui_shushen", target);
		await target.draw(num);
	},
};

// —— 甘夫人 · 修仁 ——
const chashui_xiuren = {
	audio: 2,
	direct: true,
	zhuanhuanji: true,
	// 转换技的标准 mark 写法：mark + marktext "☯" + intro.content(storage)，不用 markimage
	// （原生三处范本 character/sp.js:6813 olfenyue、character/sp2.js:8017、character/xianding.js:31293 全是这一套）
	mark: true,
	marktext: "☯",
	intro: {
		content(storage) {
			return storage ? "阴：一名角色回复体力后，其可以令你摸两张牌。" : "阳：一名角色回复体力后，你可以令其摸两张牌。";
		},
	},
	trigger: { global: "recoverAfter" },
	filter(event, player) {
		return event.player && event.player.isAlive();
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		if (player.storage.chashui_xiuren) {
			const go = await target.chooseBool(`修仁：是否令${get.translation(player)}摸两张牌？`).forResult();
			if (!go.bool) return;
			player.logSkill("chashui_xiuren", target);
			await player.draw(2);
		} else {
			const go = await player.chooseBool(`修仁：是否令${get.translation(target)}摸两张牌？`).forResult();
			if (!go.bool) return;
			player.logSkill("chashui_xiuren", target);
			await target.draw(2);
		}
		player.changeZhuanhuanji("chashui_xiuren");
	},
};

// —— 周泰 · 振躯 ——
// 标准【决斗】流程：由 target 先打【杀】，双方交替，先打不出的一方受到对方 1 点伤害。
// 「结算两次」= 这个流程整段执行两次（原型 `data.use.additionalEffect = 1`）。
lib.chashuiZhenquDuel = async (player, target) => {
	let current = target;
	let other = player;
	while (true) {
		if (!current.isIn() || !other.isIn()) return;
		const res = await current
			.chooseToRespond({ prompt: "振躯：请打出一张【杀】", filterCard: (card) => get.name(card) == "sha" })
			.forResult();
		if (!res.bool) {
			await current.damage(other, 1);
			return;
		}
		const temp = current;
		current = other;
		other = temp;
	}
};

lib.card.chashui_zhenqu_duel = {
	type: "trick",
	enable: true,
	selectTarget: 1,
	filterTarget(card, player, target) {
		return target != player;
	},
	async content(event, trigger, player) {
		const target = event.target;
		const choice = await target
			.chooseControl("结算两次", "轮流分配【闪】", () => (target.countCards("h", { name: "shan" }) > 0 ? "轮流分配【闪】" : "结算两次"))
			.set("prompt", "振躯：请选择此牌的结算方式")
			.forResult();
		if (choice.control == "结算两次") {
			// 整张【决斗】的结算执行**两次**——每次都是完整的「目标先出杀、双方交替」流程
			for (let i = 0; i < 2; i++) {
				if (!target.isIn() || !player.isIn()) break;
				await lib.chashuiZhenquDuel(player, target);
			}
			return;
		}
		let current = target;
		let other = player;
		while (true) {
			const shan = current.getCards("h", { name: "shan" });
			if (!shan.length) {
				await current.damage(other, 1);
				break;
			}
			const result = await current
				.chooseCard("振躯：选择一张【闪】", "h", 1, (card) => get.name(card) == "shan")
				.forResult();
			if (!result.bool) {
				await current.damage(other, 1);
				break;
			}
			const res2 = await current
				.chooseTarget("振躯：选择一名除你们外的角色", (card, player2, target2) => target2 != player2 && target2 != player && target2 != target)
				.forResult();
			if (!res2.bool) {
				await current.damage(other, 1);
				break;
			}
			await res2.targets[0].gain(result.cards, "gain2");
			const temp = current;
			current = other;
			other = temp;
		}
	},
	ai: { order: 5, wuxie: true },
};

lib.translate.chashui_zhenqu_duel = "决斗";
lib.translate.chashui_zhenqu_duel_info = "出牌阶段，对一名其他角色使用。";

const chashui_zhenqu = {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filterCard: () => true,
	selectCard: 1,
	position: "he",
	viewAs: { name: "chashui_zhenqu_duel", isCard: true },
	filter(event, player) {
		// 素材至少一张（描述「将一张牌当【决斗】使用」）。静态 viewAs 只被 filterEnable 拿
		// **牌名**做窗口校验（noname/library/index.js:10616-10622），不检查「手上有没有牌」⇒
		// 不写素材检查，空手也能点，点开对话框里一张牌都没有
		if (!player.countCards("he")) return false;
		return game.hasPlayer((current) => current != player);
	},
	ai: { order: 4, result: { target: (player, target) => -get.attitude(player, target) } },
};

// —— 周泰 · 创勋 ——
const chashui_chuangxun = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	// 原型是 fk.TurnEnd（任意角色的回合结束都触发），不是只在自己的回合结束触发；
	// 因此用 global 监听，本回合是否受到过伤害由 player.getHistory("damage") 判断。
	trigger: { global: "phaseEnd" },
	filter(event, player) {
		// 发动条件只看「受到过伤害」；造成伤害/有人濒死只是**翻倍**条件（旧版把它们当成了发动门槛）
		// 描述「当你受到过伤害的回合结束时」= 本回合口径；`player.getHistory` 本身就是 turn 作用域
		// （`player.js:11890`），不需要再比 `getParent("phase")`（phaseEnd 与 phase 不是同一个事件）。
		return player.getHistory("damage").length > 0;
	},
	async cost(event, trigger, player) {
		const go = await player
			.chooseBool("创勋：是否分配牌堆顶的牌？")
			.set("ai", () => true)
			.forResult();
		if (!go.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true };
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_chuangxun");
		let num = 2;
		// 「本回合每满足一项，牌数翻倍」
		if (player.getHistory("sourceDamage").length > 0) num *= 2;
		// actionHistory 没有 dying 这个键（`content.js:4126-4136`），用全局历史按事件名扫
		if (game.hasGlobalHistory("everything", (evt) => evt.name === "dying")) num *= 2;
		const cards = get.cards(num);
		await game.cardsGotoOrdering(cards);
		await player.showCards(cards, `${get.translation(player)}【创勋】：亮出${get.cnNumber(num)}张牌`);
		const targets = game.filterPlayer((current) => current.isAlive());
		for (const card of cards.slice()) {
			const result = await player
				.chooseTarget(`创勋：将${get.translation(card)}交给一名角色`, (card2, player2, target) => target.isAlive())
				.set("ai", (target) => get.attitude(player, target))
				.forResult();
			if (!result.bool) break;
			await result.targets[0].gain(card, "gain2");
		}
		const left = cards.filter((card) => get.position(card) == "o");
		if (left.length) await player.gain(left, "gain2");
	},
};

// —— 孙休 · 宴诛 ——
// 用 defineSkill 声明：group 只能写 sub 的 key（写错编译报错），sub 里定义了没人引用则加载期抛错。
// 这一条正是当初 chashui_yanzhu_done 漏挂的形态 —— 以前只能靠人发现，现在做不出来。
const yanzhuPlan = defineSkill({
	id: "chashui_yanzhu",
	keepTranslate: true, // 译名与说明暂留 translate/chashui.js（迁移期两段式）
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filterCard(card, player) {
		return get.name(card) == "sha";
	},
	selectCard: 1,
	position: "he",
	viewAs: { name: "wugu", isCard: true },
	filter(event, player) {
		return game.hasPlayer((current) => current != player);
	},
	ai: { order: 5, result: { player: 1 } },
	group: ["mark", "done"],
	grant: ["gain"], // 运行时 addTempSkill("chashui_yanzhu_gain")，声明式告诉工厂它有人用
	sub: {
		mark: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { player: "useCard" },
		filter(event, player) {
			return event.skill == "chashui_yanzhu";
		},
		content(event, trigger, player) {
			player.storage.chashui_yanzhu_gainers = [];
			player.addTempSkill("chashui_yanzhu_gain");
		},
		},
		gain: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { global: "gainAfter" },
		filter(event, player) {
			return (event.cards || []).some((card) => {
				const type = get.type(card, false);
				return type == "basic" || type == "trick";
			});
		},
		content(event, trigger, player) {
			const list = player.storage.chashui_yanzhu_gainers || [];
			if (!list.includes(trigger.player)) list.push(trigger.player);
			player.storage.chashui_yanzhu_gainers = list;
		},
		},
		done: {
		audio: 2,
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			return event.skill == "chashui_yanzhu";
		},
		async content(event, trigger, player) {
			player.removeSkill("chashui_yanzhu_gain");
			const gainers = (player.storage.chashui_yanzhu_gainers || []).filter((current) => current.isAlive());
			delete player.storage.chashui_yanzhu_gainers;
			const result = await player
				.chooseTarget("宴诛：是否对一名装备区牌数不小于你的角色造成1点伤害？", (card, player2, target) => {
					return target != player2 && target.countCards("e") >= player2.countCards("e");
				})
				.set("ai", (target) => -get.attitude(player, target))
				.forResult();
			if (!result.bool) return;
			const target = result.targets[0];
			player.logSkill("chashui_yanzhu", target);
			// 描述「你可以对一名…角色造成1点伤害」⇒ 受伤者是 target。
			// `X.damage(source, num)` 的 X 才是受伤者（player.js:8620-8649：next.player = this，玩家参数写 next.source）
			await target.damage(player, 1);
			for (const gainer of gainers) {
				// 「其他角色」：孙休自己不进依次用牌队列
				if (gainer == target || gainer == player || !gainer.isAlive() || !target.isAlive()) continue;
				const go = await gainer
					.chooseBool(`宴诛：是否对${get.translation(target)}使用一张伤害牌？（无距离与次数限制）`)
					.forResult();
				if (!go.bool) continue;
				// 原生范式（character/sp2.js:13911-13916）：目标固定用 filterTarget，次数用 addCount:false，
				// 距离用 event.nodistance（content.js:2316/2324 消费）。
				// ⚠️ 不能用 chooseUseTarget：它的第 1 个非对象参数必须是 card，传函数会被忽略、
				//    next.card 为 undefined 时 content 里 get.copy(undefined) 直接抛。
				await gainer
					.chooseToUse({
						prompt: `宴诛：对${get.translation(target)}使用一张伤害牌`,
						filterCard: (card, player2, event2) => get.tag(card, "damage") > 0 && lib.filter.filterCard(card, player2, event2),
						// 固定目标也要再跑一遍 targetEnabled/距离（target 可能因帷幕/距离等不能成为该牌目标）
						filterTarget: (card, player2, target2) => target2 === target && lib.filter.filterTarget(card, player2, target2),
						selectTarget: -1,
					})
					.set("addCount", false)
					.set("nodistance", true);
			}
		},
		},
	},
});
const chashui_yanzhu = yanzhuPlan.skills.chashui_yanzhu;
const chashui_yanzhu_mark = yanzhuPlan.skills.chashui_yanzhu_mark;
const chashui_yanzhu_gain = yanzhuPlan.skills.chashui_yanzhu_gain;
const chashui_yanzhu_done = yanzhuPlan.skills.chashui_yanzhu_done;

// —— 孙休 · 兴学 ——
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_xingxuePlan = defineSkill({
	id: "chashui_xingxue",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "useCard" },
	filter(event, player) {
		if (_status.currentPhase != player) return false;
		// 描述是「于**回合内**首次」⇒ 用 turn 作用域的 getHistory（`player.js:11890`），
		// 不能再用 getParent("phase") 收窄（那会变成「每个阶段首次」）。
		// useCard 入史发生在 useCard 内容开头（`content.js:9177`），此时本张已在史里 ⇒ 首次 = 1。
		const len = get.translation(event.card).length;
		const used = player.getHistory("useCard", (evt) => get.translation(evt.card).length === len).length;
		return used <= 1;
	},
	async cost(event, trigger, player) {
		const num = (player.storage.chashui_xingxue_count || 0) + 1;
		const result = await player
			.chooseTarget(`兴学：是否令至多${get.cnNumber(num)}名角色各摸一张牌？`, [1, num])
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!result.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, targets: result.targets };
	},
	async content(event, trigger, player) {
		player.storage.chashui_xingxue_count = (player.storage.chashui_xingxue_count || 0) + 1;
		player.logSkill("chashui_xingxue", event.targets);
		for (const target of event.targets) {
			if (target.isAlive()) await target.draw(1);
		}
		for (const target of event.targets) {
			if (!target.isAlive() || target.countCards("h") <= target.getHp()) continue;
			const result = await target
				.chooseCard(`兴学：将至少一张牌置于牌堆顶`, [1, Infinity], "he", true)
				.forResult();
			if (!result.bool) continue;
			const cards = result.cards.slice();
			target.$throw(cards);
			await game.cardsGotoPile(cards.reverse(), "insert");
		}
	},
	group: ["clear"],
	sub: {
		clear: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { global: "phaseBeforeStart" },
		content(event, trigger, player) {
			delete player.storage.chashui_xingxue_count;
		},
		},
	},
});
const chashui_xingxue = chashui_xingxuePlan.skills.chashui_xingxue;
const chashui_xingxue_clear = chashui_xingxuePlan.skills.chashui_xingxue_clear;



// —— 孙休 · 诏缚 ——
const chashui_zhaofu = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	zhuSkill: true,
	limited: true,
	skillAnimation: true,
	animationColor: "fire",
	trigger: { player: "phaseZhunbeiBegin" },
	filter(event, player) {
		return player.hasZhuSkill("chashui_zhaofu") && game.hasPlayer((current) => current != player);
	},
	async cost(event, trigger, player) {
		const result = await player
			.chooseTarget("诏缚：是否横置一名其他角色？", (card, player2, target) => target != player2)
			.set("ai", (target) => -get.attitude(player, target))
			.forResult();
		if (!result.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, targets: result.targets };
	},
	async content(event, trigger, player) {
		player.awakenSkill("chashui_zhaofu");
		const target = event.targets[0];
		player.logSkill("chashui_zhaofu", target);
		await target.link(true);
		target.addSkill("chashui_zhaofu_eff");
		target.markSkill("chashui_zhaofu_eff");
		// 「吴势力角色对其使用牌无次数限制」靠 chashui_zhaofu_eff 的 global 字段自动挂载
		// （addSkill 里 player.js:10752-10758 `info.global` → game.addGlobalSkill；removeSkill 里 :11410 自动摘）
	},
};

const chashui_zhaofu_eff = {
	charlotte: true,
	forced: true,
	mark: true,
	intro: {
		content: "直到你下次重置前，吴势力角色对你使用牌无次数限制，且你不能响应。",
	},
	mod: {
		// mod 回调只会收到 (card, player)，第三个形参其实是当前值 "unchanged"
		// （`noname/library/index.js:10827` `game.checkMod(card2, player, "unchanged", "cardRespondable", player)`）
		// ⇒ 事件必须从 get.event() 取（AGENTS.md §预检类回调）。
		cardRespondable(card, player) {
			const evt = get.event();
			if (!evt || evt.name != "chooseToRespond") return;
			// 「谁在使用这张牌」与引擎 lib.filter.cardRespondable 同源：事件父链的 player
			// （`noname/library/index.js:10814` `const source = event.getParent()?.player;`）
			const source = evt.getParent()?.player;
			if (!source || source == player) return;
			if (source.group == "wu") return false;
		},
	},
	group: ["chashui_zhaofu_mount"],
	// 挂载全局子技能（原生同款：表召 jsrgbiaozhao 的 `global: "jsrgbiaozhao_global"`，
	// character/jsrg.js:8558）。removeSkill 时会自动摘掉，不需要 onremove。
	global: "chashui_zhaofu_global",
};

const chashui_zhaofu_mount = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "linkAfter" },
	filter(event, player) {
		return !player.isLinked();
	},
	content(event, trigger, player) {
		player.removeSkill("chashui_zhaofu_eff");
	},
};

// 全场唯一的 global 载体：只对「身上有 chashui_zhaofu_eff 的角色」解除吴势力角色的次数限制。
// cardUsableTarget 的引擎语义见 noname/library/index.js:11201-11213 与 :11360-11364。
const chashui_zhaofu_global = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	mod: {
		cardUsableTarget(card, player, target) {
			if (player == target) return;
			if (player.group != "wu") return;
			if (!target.hasSkill("chashui_zhaofu_eff")) return;
			return true;
		},
	},
};

// —— 管宁 · 同纶 ——
const chashui_tonglun = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "phaseZhunbeiBegin" },
	async cost(event, trigger, player) {
		const go = await player.chooseBool("同纶：是否令任意名角色同时选择「摸一张」或「弃置一张牌」？").forResult();
		if (!go.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true };
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_tonglun");
		let guard = 0;
		while (guard++ < 10) {
			// 「你可以重复此流程」= 可选：首轮是发动本身，之后每轮先问是否继续
			if (guard > 1) {
				const again = await player
					.chooseBool("同纶：是否重复此流程？")
					.set("ai", () => true)
					.forResult();
				if (!again?.bool) break;
			}
			const result = await player
				.chooseTarget("同纶：选择任意名角色", [1, Infinity])
				.set("ai", (target) => (target == player ? 2 : get.attitude(player, target) > 0 ? 1 : -1))
				.forResult();
			if (!result.bool) break;
			const targets = result.targets.filter((current) => current.isAlive());
			if (!targets.length) break;
			const before = game.countPlayer((current) => current.countCards("h") == player.countCards("h"));
			// chooseButtonOL 的 list 元素 = [目标, chooseButton 参数数组, forced]（xiaobai.js 猊伺、refresh.js 起惑同款）：
			// 第二项必须是整体数组 → 引擎存为 createDialog 后展开成 ui.create.dialog(prompt, [items, "textbutton"])。
			// 旧写法 [目标, prompt, [items, "textbutton"]] 会让引擎把元组展开成 dialog(items)，
			// items 里的 ["draw","摸一张"] 二元数组在 dialog.js:309 被当成 [内容, 类型] → 「button不合法」崩溃。
			// forced=true：描述是二选一，不提供取消路径。
			const list = targets.map((target) => [target, ["同纶：请选择", [[["draw", "摸一张"], ["discard", "弃置一张牌"]], "textbutton"]], true]);
			const res = await player
				.chooseButtonOL(list, () => {})
				.set("switchToAuto", () => {
					_status.event.result = "ai";
				})
				.set("processAI", () => {
					// 目标自己选：摸牌对自身恒为正收益，AI 一律「摸一张」
					return { bool: true, links: ["draw"] };
				})
				.forResult();
			for (const target of targets) {
				const choice = res?.[target.playerid]?.links?.[0];
				if (choice == "draw" || !target.countCards("he")) await target.draw(1);
				else await target.chooseToDiscard("同纶：弃置一张牌", "he", true);
			}
			const after = game.countPlayer((current) => current.countCards("h") == player.countCards("h"));
			if (after <= before) break;
		}
	},
};

// —— 管宁 · 隐壑 ——
lib.chashuiYinheNumbers = (player) => {
	const counts = game
		.filterPlayer((current) => current != player)
		.map((current) => current.countCards("h"));
	const max = Math.max(...counts, 0);
	const list = [];
	for (let i = 0; i <= 12; i++) {
		if (i >= max) continue;
		if (counts.includes(i)) continue;
		list.push(i);
	}
	return list;
};

const chashui_yinhe = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "phaseJieshuBegin" },
	filter(event, player) {
		return lib.chashuiYinheNumbers(player).length > 0;
	},
	// mod.targetEnabled 只从**目标**的技能里读（game/index.js:8486-8508 checkMod 末参=被查玩家，
	// lib.filter.targetEnabled 里传的是 target）——所以这个 mod 必须挂在管宁自己身上。
	// 旧版把它挂到其他角色身上=引擎永远查不到，整句不生效。
	mod: {
		targetEnabled(card, player, target) {
			if (card.name != "sha") return;
			// 手牌数与管宁不同的角色不能用【杀】指定他
			if (player.countCards("h") == target.countCards("h")) return;
			return false;
		},
	},
	async cost(event, trigger, player) {
		const list = lib.chashuiYinheNumbers(player);
		const go = await player.chooseBool("隐壑：是否将手牌数调整至一个不为场上最多且不与任何其他角色相同的数值？").forResult();
		if (!go.bool) {
			event.result = { bool: false };
			return;
		}
		// cost → content 只透传 cost_data/cards/targets（`content.js:3758-3760`），
		// 自定义字段必须塞进 cost_data，否则 content 里 event.numbers 是 undefined。
		event.result = { bool: true, cost_data: { numbers: list } };
	},
	async content(event, trigger, player) {
		const list = event.cost_data.numbers;
		const controls = list.map((num) => `${num}张`);
		const result = await player
			.chooseControl(controls)
			.set("prompt", "隐壑：请选择要调整至的手牌数")
			.set("ai", () => controls.length - 1)
			.forResult();
		const num = list[result.index];
		player.logSkill("chashui_yinhe");
		const diff = player.countCards("h") - num;
		if (diff > 0) await player.chooseToDiscard(diff, "h", true);
		else if (diff < 0) await player.draw(-diff);
	},
};

// —— 灵雎 · 竭心 ——
lib.chashuiJiexinGain = async (player, num) => {
	if (num <= 0) return;
	await player.gain(lib.card.ying.getYing(num), "gain2");
};

// 进入「隐匿」：镜像引擎 hasHiddenSkill 的暗置变换（noname/library/element/player.js:3423-3433 与 :3488-3496）
// 亮将时由引擎 $showCharacter 还原（player.js:2673-2679 的 rawHp 公式 + :2720-2725 的 hiddenSkills 回挂）。
// ⚠️ 顺序必须是「先 removeSkill，再 hiddenSkills.addArray」：removeSkill 内部会
//    player.hiddenSkills.remove(skill)（player.js:11469），反过来写会导致亮将时技能一个都回不来。
lib.chashuiEnterHidden = (player) => {
	// get.character(name) 会归一化成带 .skills 的对象（noname/get/index.js:1293 + convertedCharacter）
	const skills = (get.character(player.name1)?.skills || []).filter((skill) => player.hasSkill(skill));
	if (!skills.length) return false;
	for (const skill of skills) player.removeSkill(skill);
	if (!player.hiddenSkills) player.hiddenSkills = [];
	player.hiddenSkills.addArray(skills);
	player.addSkill("g_hidden_ai");
	game.broadcastAll((current) => {
		current.name = "unknown";
		current.sex = "male";
		current.classList.add("unseen");
		if (get.mode() != "guozhan") current.classList.add("unseen_show");
		current.storage.nohp = true;
		current.storage.rawHp = current.hp;
		current.storage.rawMaxHp = current.maxHp;
		current.hp = 1;
		current.maxHp = 1;
		if (current.node?.hp) current.node.hp.hide();
		// lib.translate.unknown = "未知"（noname/library/index.js:10258）；update() 不会重写名字节点，
		// 引擎自己的 init 才写（player.js:3419），所以这里手动补
		if (current.node?.name) current.node.name.innerHTML = get.translation("unknown");
		if (current.node?.name2) current.node.name2.innerHTML = "";
		current.update();
	}, player);
	return true;
};

// 竭心的印牌牌名由**窗口**决定（无懈窗→无懈，杀响应窗→闪），
// 放在模块级并挂 lib.（StepCompiler 重编译的回调里只能引用 lib.xxx，见 AGENTS.md §4.7）
const chashuiJiexinName = (event, player) => {
	if (!event || typeof event.filterCard != "function") return null;
	for (const name of ["wuxie", "shan"]) {
		if (event.filterCard(get.autoViewAs({ name, isCard: true }, []), player, event)) return name;
	}
	return null;
};
lib.chashuiJiexinName = chashuiJiexinName;

const chashui_jiexin = {
	audio: 2,
	// 描述只有「当【无懈可击】或【闪】**使用**」，没有「打出」⇒ 不开 chooseToRespond 窗
	// （打出窗是南蛮/决斗打【杀】、万箭打【闪】，本技能不覆盖）
	enable: ["chooseToUse"],
	filterCard: () => true,
	selectCard: 2,
	position: "he",
	// 技能级预检：按钮只在本窗口真能印出【无懈】/【闪】、且素材够两张时出现。
	// 不写这个 filter 会怎样：`filterEnable`（noname/library/index.js:10590-10664）只检查
	// enable 与「静态 viewAs 的牌名」——**函数式 viewAs 那一整段被跳过**（`typeof info.viewAs !== "function"`
	// 才进牌名校验）⇒ 按钮在每个 chooseToUse 窗（出牌阶段/濒死求桃/借刀…）都会冒出来，
	// 手上没两张牌也点得到。
	filter(event, player) {
		if (event.skill == "chashui_jiexin" || event._skill == "chashui_jiexin") return true;
		if (player.countCards("he") < 2) return false;
		return lib.chashuiJiexinName(event, player) != null;
	},
	// 开窗预检通行证：无懈窗只认 `hiddenCard(player,"wuxie")` / `hiddenWuxie` /
	// 静态 viewAs.name=="wuxie"（docs/响应与抵消.md）⇒ 没有它连无懈窗口都不会为本技能打开
	hiddenCard(player, name) {
		if (name != "wuxie" && name != "shan") return false;
		return player.countCards("he") >= 2;
	},
	viewAs(cards, player) {
		const name = lib.chashuiJiexinName(get.event(), player) || "wuxie";
		return get.autoViewAs({ name, isCard: true }, cards);
	},
	async precontent(event, trigger, player) {
		const cards = event.result.cards || [];
		const red = cards.filter((card) => get.color(card, false) == "red").length;
		await lib.chashuiJiexinGain(player, red);
		if (!red) {
			player.logSkill("chashui_jiexin");
			// 原型：未获得【影】即重新隐匿（jiexin.lua 的 changeHero(player,"hiddenone")）。
			// 暗置后角色名字变「未知」、体力显示隐藏，由引擎 _showHiddenCharacter
			// （noname/library/skill.js:1367-1380）在下次 phaseBeginStart 或体力变化时自动登场。
			lib.chashuiEnterHidden(player);
		}
	},
	ai: { order: 3, result: { player: 1 }, respondShan: true, respondWuxie: true },
};

// —— 灵雎 · 焚缘 ——
// defineSkill 声明：group 只能写 sub 的 key（写错编译报错）；sub 里定义了没人引用则加载期抛错。
const chashui_fenyuanPlan = defineSkill({
	id: "chashui_fenyuan",
	keepTranslate: true, // 译名与说明暂留 translate/*.js（迁移期两段式）
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	// 技能标签：`get.info(skill).hiddenSkill` 为真时技能栏显示「隐匿技」（`noname/get/index.js:774-776`）。
	// 只影响标签，不影响执行——`hiddenSkills` 的暗置流程只对 `character.hasHiddenSkill` 的角色生效
	// （`player.js:3425` 在 addSkill 时把该角色的**全部**技能塞进 hiddenSkills），本武将没有这个字段。
	hiddenSkill: true,
	// 原型 fenyuan.lua 挂的是全局 TurnEnd（不是自己回合结束），且只在「登场当回合」有效
	trigger: { global: "phaseEnd" },
	filter(event, player) {
		if (!player.storage.chashui_fenyuan_appear) return false;
		if (player.isUnseen(2)) return false;
		if (!lib.card.chuqibuyi) return false;
		return player.countCards("h") > 0;
	},
	async cost(event, trigger, player) {
		const go = await player.chooseBool("焚缘：是否将一张手牌当【出其不意】使用？").forResult();
		if (!go.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true };
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_fenyuan");
		let guard = 0;
		while (guard++ < 10) {
			const result = await player
				.chooseCard("焚缘：将一张手牌当【出其不意】使用", "h", 1)
				.forResult();
			if (!result.bool) break;
			const card = result.cards[0];
			const suit = get.suit(card, false);
			// 描述是「使用**或展示**的牌为黑桃」⇒ 这张牌要亮出来
			await player.showCards([card], `${get.translation(player)}【焚缘】：展示一张手牌`);
			const vcard = get.autoViewAs({ name: "chuqibuyi", isCard: true }, [card]);
			const candidates = game.filterPlayer((current) => player.canUse(vcard, current));
			if (candidates.length) {
				let target = candidates[0];
				if (candidates.length > 1) {
					const res = await player
						.chooseTarget("焚缘：选择【出其不意】的目标", (card2, player2, target2) => player2.canUse(vcard, target2))
						.set("ai", (target2) => -get.attitude(player, target2))
						.forResult();
					if (res.bool) target = res.targets[0];
				}
				await player.useCard(vcard, [card], target, "chashui_fenyuan");
			}
			// 描述是「使用**或展示**的牌为黑桃」⇒ 即使没有合法目标（只展示没用出），黑桃也要继续
			if (suit != "spade") break;
		}
	},
	group: ["appear", "clear"],
	sub: {
		appear: {
		charlotte: true,
		forced: true,
		direct: true,
		silent: true,
		popup: false,
		trigger: { player: "showCharacterAfter" },
		filter(event, player) {
			if (player.isUnseen(2)) return false;
			const shown = event.toShow || [];
			return shown.some((name) => (get.character(name)?.skills || []).includes("chashui_fenyuan"));
		},
		content(event, trigger, player) {
			player.storage.chashui_fenyuan_appear = true;
		},
		},
		clear: {
		charlotte: true,
		forced: true,
		direct: true,
		silent: true,
		popup: false,
		trigger: { global: "phaseAfter" },
		content(event, trigger, player) {
			if (player.storage.chashui_fenyuan_appear) delete player.storage.chashui_fenyuan_appear;
		},
		},
	},
});
const chashui_fenyuan = chashui_fenyuanPlan.skills.chashui_fenyuan;
const chashui_fenyuan_appear = chashui_fenyuanPlan.skills.chashui_fenyuan_appear;
const chashui_fenyuan_clear = chashui_fenyuanPlan.skills.chashui_fenyuan_clear;

// 「登场」记一次：原型用 U.GeneralAppeared 置 @@tea__fenyuan-turn。
// 无名杀对应事件是 showCharacterAfter（player.js:2577 建 showCharacter 事件，引擎在本事件后派发 After）。
// ⚠️ 本技能在暗置期间位于 player.hiddenSkills，createTrigger（content.js:3554-3587）对暗置技能的规则是：
//    只有 info.direct 为真（或锁定技且带 cost）才会真正执行，否则只派发 triggerHidden 而身份局无人监听
//    ⇒ 必须写 direct: true，否则登场时这段代码根本不跑。


// 本回合结束即失效（原型标记带 -turn）


// —— 张华 · 弘旷 ——
const chashui_hongkuang = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: "phaseDrawAfter" },
	async content(event, trigger, player) {
		// 本技在 phaseDrawAfter 触发，trigger 就是摸牌阶段事件本身。
		// 不能拿 trigger.getParent("phase")：那会匹配到名为 "phase" 的回合主事件，
		// 把「本阶段获得/使用」错算成「整个回合」（同坚执修复，参见 mobile.js:12590、tw.js:23516）。
		const phase = trigger;
		// 上限随手牌数走（旧版硬编码 10 张，手牌多时提前断）
		let guard = player.countCards("h") + 1;
		while (guard-- > 0) {
			const cards = player
				.getCards("h")
				.filter((card) => player.getHistory("gain", (evt) => evt.getParent("phaseDraw") === phase && (evt.cards || []).includes(card)).length > 0);
			if (!cards.length) break;
			const result = await player
				// 注意：chooseToUse 的字符串参数表里没有 "nodistance"（那是 chooseUseTarget 的），
				// 传了只会被当成提示文案；描述也没说无距离，按正常距离规则。
				// 自定义 filterCard 会整体替换引擎默认的 lib.filter.filterCard，
				// 所以必须自己补回「牌本身可用 + 存在合法目标」两层（技能模板与印牌.md §使用一张牌）。
				.chooseToUse({
					prompt: "弘旷：是否使用此阶段获得的手牌？",
					filterCard(card, me, evt) {
						evt = evt || get.event();
						return cards.includes(card) && lib.filter.filterCard(card, me, evt) && me.hasUseTarget(card, true, evt);
					},
					filterTarget(card, me, to) {
						return lib.filter.filterTarget(card, me, to);
					},
				})
				.forResult();
			if (!result.bool) break;
		}
		// 「此阶段使用的牌数」：循环里（及摸牌阶段内）的使用牌事件，父链上都挂在这个 phaseDraw 事件上
		// （mobile.js:12590 同款 evt.getParent(trigger.name)==trigger）。
		const used = player.getHistory("useCard", (evt) => evt.getParent("phaseDraw") === phase).length;
		if (used == player.getHp() && player.isAlive()) {
			player.logSkill("chashui_hongkuang");
			// insertPhase 的参数只是 event.skill 归因，不设 phaseList 默认跑全部六阶段=完整额外回合
			// （player.js:5553 + content.js:4082）——额外摸牌阶段必须显式指定（范本 offline.js:4957）
			const next = player.insertPhase("chashui_hongkuang");
			next.phaseList = ["phaseDraw"];
		}
	},
	ai: { order: 1 },
};

// —— 张华 · 坚执 ——
const chashui_jianzhi = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	locked: true,
	forced: true,
	mark: true,
	marktext: "执",
	intro: {
		name: "坚执",
		content(storage, player) {
			const ban = player?.storage?.chashui_jianzhi_ban || [];
			const same = player?.storage?.chashui_jianzhi_same;
			const banText = ban.length ? ban.map((name) => `【${get.translation(name)}】`).join("、") : "无";
			let sameText = "无";
			if (same) {
				// 前者（本回合不能使用）优先级更高：已列入禁用名单的牌名不再显示为可用的同名牌
				sameText = ban.includes(same) ? `无（【${get.translation(same)}】已被前者禁用）` : `【${get.translation(same)}】`;
			}
			return `<li>本回合不能使用：<span style="color:#f04a4a">${banText}</span><br><li>本阶段结束时可使用手牌中的同名牌：<span class="bluetext">${sameText}</span>`;
		},
	},
	trigger: { player: "useCard" },
	filter(event, player) {
		// get.tag 对没有 ai.tag.damage 的牌返回 undefined，而 `undefined <= 0` 是 false，
		// 不能写 `<= 0`；必须先判 `> 0` 再取反，否则任何牌都会通过。
		if (!(get.tag(event.card, "damage") > 0)) return false;
		// 「每阶段首次」：按原生「每阶段首次…」标准写法（character/bingshi.js potchiyun）
		// 遍历 lib.phaseName，用 `evt.getParent(phase)===event.getParent(phase)` 判定同一阶段，
		// `indexOf(event)===0` 判该阶段首次使用。
		// 注意不能用 `getParent("phase")`——它匹配事件名恰为 "phase" 的**回合主事件**
		// （6 个阶段的公共祖先），会把整回合所有阶段的伤害牌合并成一次计数，
		// 导致「每阶段首次」退化为「每回合首次」。lib.phaseName 定义见 noname/library/index.js:14225。
		return lib.phaseName.some((phase) =>
			player
				.getHistory(
					"useCard",
					(evt) =>
						evt.getParent(phase) === event.getParent(phase) &&
						get.tag(evt.card, "damage") > 0
				)
				.indexOf(event) === 0
		);
	},
	async content(event, trigger, player) {
		player.logSkill("chashui_jianzhi");
		const drawn = await player.draw().forResult();
		const drawnCard = (drawn.cards || [])[0];
		const result = await player.chooseToDiscard("坚执：弃置一张牌", "he", 1, true).forResult();
		if (!result.bool || !drawnCard) return;
		const discardCard = result.cards[0];
		if (get.name(discardCard, false) != get.name(drawnCard, false)) {
			trigger.cancel();
			// 「与之同名」= 与**此伤害牌**同名（原型 @tea__jianzhi-turn 存 data.card.trueName；
			// 旧版禁的是摸到的牌名，指代错位）
			if (!player.storage.chashui_jianzhi_ban) player.storage.chashui_jianzhi_ban = [];
			player.storage.chashui_jianzhi_ban.push(get.name(trigger.card));
			player.addTempSkill("chashui_jianzhi_ban", "phaseAfter");
			player.markSkill("chashui_jianzhi");
		} else {
			// 「此阶段结束时」：记下使用牌所处的**阶段事件**，由 same 技能在该阶段的 End 精确触发
			// （旧版挂到 phaseAfter=整回合结束，时机偏差一个阶段序列）
			player.storage.chashui_jianzhi_same = get.name(drawnCard, false);
			let phase = trigger.parent;
			while (phase && !(phase.name != "phase" && String(phase.name).startsWith("phase"))) {
				phase = phase.parent;
			}
			player.storage.chashui_jianzhi_same_phase = phase || null;
			player.addSkill("chashui_jianzhi_same");
			player.markSkill("chashui_jianzhi");
		}
	},
};

const chashui_jianzhi_ban = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	mod: {
		cardEnabled(card, player) {
			const list = player.storage.chashui_jianzhi_ban;
			if (list && list.includes(get.name(card, false))) return false;
		},
	},
	onremove(player) {
		delete player.storage.chashui_jianzhi_ban;
		if (player.hasSkill("chashui_jianzhi")) player.markSkill("chashui_jianzhi");
	},
};

const chashui_jianzhi_same = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	// phaseAnyEnd 展开为各 phaseXxxEnd，事件就是该阶段事件本身（固业同款）——
	// 与记录的阶段事件全等才算「此阶段结束」
	trigger: { global: "phaseAnyEnd" },
	filter(event, player) {
		return !!player.storage.chashui_jianzhi_same && event == player.storage.chashui_jianzhi_same_phase;
	},
	async content(event, trigger, player) {
		const name = player.storage.chashui_jianzhi_same;
		delete player.storage.chashui_jianzhi_same;
		delete player.storage.chashui_jianzhi_same_phase;
		player.removeSkill("chashui_jianzhi_same");
		if (player.hasSkill("chashui_jianzhi")) player.markSkill("chashui_jianzhi");
		if (!name) return;
		await player.showCards(player.getCards("h"), `${get.translation(player)}【坚执】：展示所有手牌`);
		// 前者优先：本回合已被禁用牌名的牌，即使同名也不在阶段结束时使用
		const banned = player.storage.chashui_jianzhi_ban || [];
		const cards = player.getCards("h").filter((card) => get.name(card, false) == name && !banned.includes(get.name(card, false)));
		for (const card of cards) {
			if (!player.getCards("h").includes(card)) continue;
			const candidates = game.filterPlayer((current) => player.canUse(card, current));
			if (!candidates.length) continue;
			let target = candidates[0];
			if (candidates.length > 1) {
				const res = await player
					.chooseTarget(`坚执：选择${get.translation(card)}的目标`, (card2, player2, target2) => player2.canUse(card, target2))
					.set("ai", (target2) => -get.attitude(player, target2))
					.forResult();
				if (!res.bool) continue;
				target = res.targets[0];
			}
			await player.useCard(card, [card], target, "chashui_jianzhi");
		}
	},
};

// —— 王祥 · 冰心 ——
const chashui_bingxin = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { source: "damageBegin3", player: "damageBegin3" },
	filter(event, player) {
		if (!event.player || !event.player.isAlive()) return false;
		return event.player.countCards("he") >= 1;
	},
	async cost(event, trigger, player) {
		const go = await player
			.chooseBool(`冰心：是否弃置${get.translation(trigger.player)}两张牌，防止此伤害？`)
			.set("ai", () => true)
			.forResult();
		if (!go.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true };
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		player.logSkill("chashui_bingxin", target);
		let count = 0;
		while (count < 2 && target.countCards("he") > 0) {
			const result = await player
				.discardPlayerCard(target, "he", true, 1)
				.forResult();
			if (!result.bool) break;
			count++;
		}
		trigger.cancel();
		const result = await player
			.chooseTarget("冰心：是否令一名其他已受伤角色回复1点体力？", (card, player2, target2) => {
				return target2 != player2 && target2.isDamaged();
			})
			.set("ai", (target2) => get.attitude(player, target2))
			.forResult();
		if (result.bool) await result.targets[0].recover(1);
	},
};

// —— 王祥 · 德清 ——
const chashui_deqing = {
	// 引擎在触发技派发前已自动 logSkill（content.js:3731）；本技 content 里手动记录目标，故关掉自动那一条，避免双日志/计数翻倍
	popup: false,
	audio: 2,
	trigger: { player: ["phaseDrawBegin", "phaseDiscardBegin"] },
	filter(event, player) {
		// 拼点需要双方都有手牌，否则 chooseToCompare 直接返回 {cancelled:true, bool:false}
		// 会被当成「没赢」⇒ 阶段被取消 + 自己掉血（描述没有这层代价）。
		return !event.numFixed && player.countCards("h") > 0 && game.hasPlayer((current) => current != player && current.countCards("h") > 0);
	},
	async cost(event, trigger, player) {
		const result = await player
			.chooseTarget("德清：是否改为与一名其他角色拼点？", (card, player2, target) => target != player2)
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!result.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, targets: result.targets };
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		player.logSkill("chashui_deqing", target);
		const result = await player.chooseToCompare(target).forResult();
		// 拼点因故没能进行（一方中途失去全部手牌）⇒ 保留原阶段，不做任何结算
		if (result?.cancelled) return;
		trigger.cancel();
		if (result.bool) {
			const num = player.maxHp - player.countCards("h");
			if (num > 0) await player.draw(num);
		} else {
			// 描述「其**对你**造成1点伤害」⇒ 受伤者是 player。
			// `X.damage(source, num)` 的 X 才是受伤者（player.js:8620-8649）
			await player.damage(target, 1);
		}
	},
};

// ==================== 茶水贤设·曦（tea_ex_extra）：9 名 ====================

// —— 范粲 · 笃志 ——
// 「本局游戏的每个摸牌阶段均如此做」的判定：phases 计数子技在每次 phaseDrawBegin（loop 自动派发，
// 先于 content.js:4397 显式派发的 phaseDrawBegin1）+1；发动时 used+1，used>=phases 即全称满足。
// 空集按全称真处理（首次发动即可能回复，与原型 getEventsByRule 口径一致）。
const chashui_duzhi_count = {
	charlotte: true,
	forced: true,
	popup: false,
	trigger: { player: "phaseDrawBegin" },
	async content(event, trigger, player) {
		player.storage.chashui_duzhi_phases = (player.storage.chashui_duzhi_phases || 0) + 1;
	},
};

const chashui_duzhi = {
	audio: 2,
	trigger: { player: "phaseDrawBegin1" },
	filter(event, player) {
		return !event.numFixed;
	},
	logTarget: "targets",
	async cost(event, trigger, player) {
		const result = await player
			.chooseTarget("笃志：是否改为令一名角色将手牌摸至四张？")
			.set("ai", (target) => {
				const att = get.attitude(player, target);
				const diff = Math.max(0, 4 - target.countCards("h"));
				let gain = att > 0 ? diff : -diff;
				if (target == player && player.isDamaged()) gain += 4;
				return gain;
			})
			.forResult();
		if (!result.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, targets: result.targets };
	},
	async content(event, trigger, player) {
		// 「改为」= 跳过本次摸牌（眩惑 xinxuanhuo 同款 changeToZero）
		trigger.changeToZero();
		const target = event.targets[0];
		await target.drawTo(4);
		player.storage.chashui_duzhi_used = (player.storage.chashui_duzhi_used || 0) + 1;
		if (player.storage.chashui_duzhi_used >= (player.storage.chashui_duzhi_phases || 0) && player.isDamaged()) {
			await player.recover(1);
		}
	},
};

// —— 范粲 · 匿辉 ——
const chashui_nihui = {
	audio: 2,
	trigger: { target: "useCardToTarget" },
	filter(event, player) {
		if (event.player == player || !event.player.isIn()) return false;
		return get.type(event.card, null, false) == "trick";
	},
	async cost(event, trigger, player) {
		const result = await player
			.chooseBool(get.prompt2("chashui_nihui"))
			.set("ai", () => {
				// 取消敌方锦囊目标、救命时优先；友方牌不挡
				const att = get.attitude(trigger.player, player);
				return att < 0 || player.hp <= 1 ? 1 : -1;
			})
			.forResult();
		event.result = { bool: result.bool };
	},
	async content(event, trigger, player) {
		// 取消该目标（滋义同款：useCardToTarget 子事件 cancel 只取消自己这个目标）
		trigger.cancel();
		await player.loseHp(1);
		// 「若你本局游戏未使用过锦囊牌」
		const usedTrick = player.getHistory("useCard", (evt) => get.type(evt.card, null, false) == "trick").length > 0;
		if (usedTrick || !player.isIn()) return;
		const num = player.countCards("h");
		const hasTarget = game.hasPlayer((current) => current != player && current.isIn() && current.countCards("h") > num);
		if (!hasTarget) return;
		const result = await player
			.chooseTarget("匿辉：选择一名角色，其将手牌弃至与你相同", (card, player2, target) => target != player2 && target.isIn() && target.countCards("h") > player2.countCards("h"))
			.set("ai", (target) => -get.attitude(player, target) * (target.countCards("h") - num))
			.forResult();
		if (result.bool) {
			const target = result.targets[0];
			const diff = target.countCards("h") - player.countCards("h");
			if (diff > 0) await player.discardPlayerCard(target, "h", diff, true);
		}
	},
};

// —— 张裔 · 流谈 ——
const chashui_liutan = {
	audio: 2,
	enable: "phaseUse",
	filter(event, player) {
		// 「此技能此阶段失效」⇒ 弃牌分支执行后本阶段不能再发动
		return !player.hasSkill("chashui_liutan_disabled");
	},
	filterTarget(card, player, target) {
		return target != player && target.isIn();
	},
	ai: {
		order: 6,
		result: {
			target(player, target) {
				// 目标摸2是给牌；若目标是敌人，期望其选择分支进弃牌（亏2）
				const att = get.attitude(player, target);
				if (att <= 0) return -0.5;
				// 自己血线糟糕时更需要队友把正面牌打过来，收益略高
				return player.hp <= 2 ? 2 : 1.5;
			},
		},
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		await target.draw(2);
		if (!target.isIn() || !player.isIn()) return;
		// 血线糟糕：1血，或2血且手里只剩一张（下一张伤害牌就可能带走）
		const badHp = player.hp <= 1 || (player.hp <= 2 && player.countCards("h") <= 1);
		// 单张手牌对拥有者的收益：get.effect 为基线（含牌自身 ai 与各技能修正），再按牌类兜底。
		// 「能不能对拥有者使用」完全交给 canUse / filterTarget，这里只算收益。
		const cardValue = (card) => {
			if (typeof card == "string" || !card) return 0;
			if (get.position(card) != "h") return 0;
			let value = get.effect(player, card, target, target);
			if (typeof value != "number" || isNaN(value)) value = 0;
			// 五谷丰登可指定任意角色（standard.js:951-958 filterTarget 恒真），拥有者必得一张
			if (card.name == "wugu") value = Math.max(value, 5);
			// 桃园结义对满血拥有者被 ignoreTarget 跳过（standard.js:1191），白扔一张牌
			else if (card.name == "taoyuan") value = player.isDamaged() ? Math.max(value, 5) : -0.5;
			return value;
		};
		// 写法照原生「令某角色对某人使用一张手牌」范例（character/xianding.js:27935-27955 妩艳、
		// character/sp.js:32647-32658）：filterCard 交回 lib.filter.filterCard，目标合法性用
		// lib.filter.filterTarget（含距离，本技能未写「无距离限制」），addCount:false 不计次数。
		const result = await target
			.chooseToUse(function (card, player2) {
				if (get.itemtype(card) != "card" || get.position(card) != "h") return false;
				return lib.filter.filterCard.apply(this, arguments);
			}, "流谈：是否对" + get.translation(player) + "使用一张手牌？点「取消」则改为弃置两张牌")
			.set("filterTarget", function (card, player2, target2) {
				if (target2 != player) return false;
				return lib.filter.filterTarget.apply(this, arguments);
			})
			.set("targetRequired", true)
			.set("complexTarget", true)
			.set("complexSelect", true)
			// 技能给出的额外使用，不占队友本阶段的使用次数（同 xianding.js:27955 / sp.js:32658）
			.set("addCount", false)
			// ai1 返回 ≤0 时引擎走取消（ai.basic.chooseCard: check(cards[ix]) <= 0 → return ok）。
			// 血线糟糕：只接受明确落在拥有者身上的正收益牌（五谷、受伤时的桃园）；
			//   一张都没有就返回 0 触发取消 → 弃两张牌让技能本阶段失效，这是唯一的弃牌时机。
			// 血线尚可：正收益优先；没有正收益也宁可让拥有者挨一张最轻的牌（负值压到 (0,0.01)
			//   区间，保持「越不亏越优先」的排序），不因为没好牌就白丢技能。
			.set("ai1", (card) => {
				const value = cardValue(card);
				if (badHp) return value >= 1 ? value : 0;
				if (value >= 0) return Math.max(value, 0.01);
				return Math.max(0.0001, 0.01 + value / 1000);
			})
			.forResult();
		if (!result || !result.bool) {
			await target.chooseToDiscard("流谈：弃置两张牌", 2, "he", true);
			if (player.isIn()) {
				// 「此技能此阶段失效」= 描述变灰：disableSkill + 独立载体（不能进 group，disableSkill 会级联）
				// 出牌阶段结束（phaseUseAfter）由 addTempSkill 到期移除载体，onremove 里 enableSkill 恢复
				player.disableSkill("chashui_liutan_disabled", "chashui_liutan");
				player.addTempSkill("chashui_liutan_disabled", "phaseUseAfter");
			}
		}
	},
};

// 流谈失效载体：不用 mark（描述变灰，而不是加标记）
// 技能 id 与 disableSkill 的禁用方键一致；addTempSkill 到期 → removeSkill → onremove 恢复
const chashui_liutan_disabled = {
	charlotte: true,
	onremove(player) {
		player.enableSkill("chashui_liutan_disabled");
	},
};

// —— 张裔 · 近对 ——
// 议事分支按原型语义复刻：使用者以「此牌」为议事牌（不另选），张裔展示一张手牌，
// 两牌颜色相同 ⇔ 议事结果与此牌颜色相同（两人议事不一致 = 无结果）。
const chashui_jindui = {
	audio: 2,
	trigger: { target: "useCardToTarget" },
	filter(event, player) {
		// 「非虚拟或转化的牌」= 实体牌（card ∈ cards，memory 覆盖机制条目口径）
		if (!event.cards || !event.cards.includes(event.card)) return false;
		if (event.player == player || !event.player.isIn()) return false;
		return player.countCards("h") > 0;
	},
	logTarget: "player",
	async cost(event, trigger, player) {
		const result = await player
			.chooseBool(get.prompt2("chashui_jindui"))
			.set("ai", () => {
				// 敌方指定自己时发动（议事可能摸牌、拼点可能让牌无效）；友方牌不拦
				return get.attitude(trigger.player, player) < 0 ? 1 : -1;
			})
			.forResult();
		event.result = { bool: result.bool };
	},
	async content(event, trigger, player) {
		const from = trigger.player;
		const card = trigger.card;
		const choice = await from
			.chooseControl("议事", "拼点")
			.set("prompt", "近对：" + get.translation(player) + "令你选择一项")
			.set("choiceList", ["用" + get.translation(card) + "与" + get.translation(player) + "议事（若结果与此牌颜色相同，其摸一张牌）", "用" + get.translation(card) + "与" + get.translation(player) + "拼点（若其赢，此牌对其无效）"])
			.set("ai", () => {
				// from 视角：此牌点数大 → 拼点赢面高；否则议事（赌颜色不一致）
				const num = get.number(card) || 0;
				return num >= 7 ? 1 : 0;
			})
			.forResult();
		if (!choice || !from.isIn()) return;
		if (choice.index == 0) {
			// 议事：张裔展示一张手牌，与此牌颜色比对
			const result = await player.chooseCard("h", "近对：请展示一张手牌参与议事", true).forResult();
			if (!result.bool) return;
			const card2 = result.cards[0];
			await player.showCards([card2], get.translation(player) + "【近对】议事");
			if (get.color(card) == get.color(card2) && player.isIn()) await player.draw(1);
		} else {
			// 拼点：from 以此牌作拼点牌（fixedResult 塞处理区牌，青德 nsqingde 先例）
			if (!player.countCards("h")) return;
			const compare = from.chooseToCompare(player);
			compare.fixedResult = { [from.playerid]: card };
			const result = await compare.forResult();
			if (result?.cancelled) return;
			// 「若你赢，此牌对你无效」⇒ excluded 单目标无效（与 useCard 共享同一数组）
			if (result.winner == player) trigger.excluded.add(player);
		}
	},
};

// —— 环夫人 · 麟荣 ——
// 展示过的牌打 eternal_ 前缀 gaintag（lose 只剥非 eternal tag，跨区域保留）。
// ① 只有「已受伤」时展示的牌才打标记：未受伤时摸到的牌不会在日后受伤时凭空变成【桃】。
// ② 「视为只能指定你为目标的【桃】」是**强制视为**，不是转化技（争绝/祥海式）⇒ 纯 mod.cardname，
//    没有按钮、不能拒绝；「只能指定自己」用 mod.playerEnabled 否决其他目标。
lib.chashuiLinrongCard = (card) => {
	if (!card) return false;
	if (card.hasGaintag?.("eternal_chashui_linrong")) return true;
	if (card.storage?.chashui_linrong_view) return true;
	return Array.isArray(card.cards) && card.cards.some((sub) => sub.hasGaintag?.("eternal_chashui_linrong"));
};
const chashui_linrong = {
	audio: 2,
	forced: true,
	trigger: { player: "phaseEnd" },
	filter(event, player) {
		return player.getHistory("useSkill", (evt) => evt.skill == "chashui_linrong").length < 3;
	},
	async content(event, trigger, player) {
		const drawEvt = player.draw(2);
		await drawEvt;
		const cards = drawEvt.result?.cards || [];
		if (!cards.length || !player.isIn()) return;
		await player.showCards(cards, "麟荣");
		if (!player.isDamaged()) return;
		for (const card of cards) card.addGaintag("eternal_chashui_linrong");
	},
	mod: {
		// 强制视为【桃】：get.name 只在牌位于手牌区（或显式传 player）时走这个 mod，
		// 所以弃牌堆/装备区的同名牌不受影响（noname/get/index.js:3274-3282）。
		cardname(card, player, name) {
			if (name == "tao" || !player?.isDamaged()) return;
			if (!lib.chashuiLinrongCard(card)) return;
			return "tao";
		},
		// 「只能指定你为目标」= 使用者视角限制 ⇒ playerEnabled
		// （lib.filter.targetEnabled 命中 playerEnabled 就短路，不再问牌自身 filterTarget：noname/library/index.js:11103-11106）。
		playerEnabled(card, player, target) {
			if (target == player || !player?.isDamaged()) return;
			if (!lib.chashuiLinrongCard(card)) return;
			return false;
		},
	},
	ai: {
		// 濒死求桃窗的 AI 预检（canSave → hasSkillTag("save") → skillTagFilter，arg=濒死者）
		save: true,
		skillTagFilter(player, tag, arg) {
			if (tag != "save") return false;
			if (!arg || arg.hp > 0) return false;
			if (!player.isDamaged()) return false;
			return player.countCards("h", (card) => lib.chashuiLinrongCard(card)) > 0;
		},
	},
};

// —— 环夫人 · 温宜 ——
// 候选牌含麟荣牌：已受伤时麟荣牌「视为【桃】」⇒ 自然可交（两技能联动，与原型 filter 一致）。
// 判据统一走 lib.chashuiLinrongCard（gaintag / storage / vcard 底牌三路），不再各写一遍 gaintag 判定。
const chashui_wenyi = {
	audio: 2,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		if (event.player == player || !event.player.isIn()) return false;
		const card = event.card;
		if (card.name != "tao" && get.type(card) != "equip") return false;
		return player.countCards("he", (card2) => {
			if (card2.name == "tao" || get.type(card2) == "equip") return true;
			return player.isDamaged() && lib.chashuiLinrongCard(card2);
		}) > 0;
	},
	logTarget: "player",
	async cost(event, trigger, player) {
		const result = await player
			.chooseCard("he", "温宜：是否交给" + get.translation(trigger.player) + "一张【桃】或装备牌并令其摸一张牌？", 1, (card) => {
				if (card.name == "tao" || get.type(card) == "equip") return true;
				return player.isDamaged() && lib.chashuiLinrongCard(card);
			})
			.set("ai", (card) => {
				const target = trigger.player;
				if (get.attitude(player, target) <= 0) return 0;
				if (get.type(card) == "equip") return 4 - get.value(card) / 5;
				return 6;
			})
			.forResult();
		event.result = { bool: result.bool, cards: result.cards };
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		await player.give(event.cards, target);
		if (!target.isIn()) return;
		await target.draw(1);
		// 「然后若其未受伤，你摸一张牌」——在其摸牌后判定
		if (player.isIn() && !target.isDamaged()) await player.draw(1);
	},
};

// —— 孟观 · 溃叛 ——
// 「蓄谋」复用官方蓄谋牌 xumou_jsrg（jsrg.js:521，判定阶段询问使用实体牌/取消则全部入弃牌堆，
// 与原型 utility.premeditate 语义一致；炴营先例 addJudge({name:"xumou_jsrg"},[card])）。
const chashui_kuipan = {
	audio: 2,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		// 伤害牌判定用 get.tag(card, "damage")
		if (!get.tag(event.card, "damage")) return false;
		return game.hasPlayer((current) => current != player && current.isIn() && current.countCards("he") > 0 && event.targets?.includes(current));
	},
	logTarget: "targets",
	async cost(event, trigger, player) {
		const result = await player
			.chooseTarget("溃叛：令一名目标角色收回一张装备牌或蓄谋一张牌", (card, player2, target) => trigger.targets?.includes(target) && target.isIn() && target.countCards("he") > 0)
			.set("ai", (target) => {
				// 目标被蓄谋占判定区/弃装备 → 敌人正收益
				return -get.attitude(player, target);
			})
			.forResult();
		if (!result.bool) {
			event.result = { bool: false };
			return;
		}
		const target = result.targets[0];
		const choice = await target
			.chooseControl("收回一张装备牌", "蓄谋一张牌")
			.set("prompt", "溃叛：" + get.translation(player) + "令你选择一项")
			.set("ai", () => {
				// 有装备牌收回（无损）；否则蓄谋（选低价值牌）
				return target.countCards("e") > 0 ? 0 : 1;
			})
			.forResult();
		if (!choice) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, targets: [target], cost_data: { choice: choice.index } };
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		if (event.cost_data.choice == 0) {
			// 收回一张装备牌（he 区任一装备牌 → 取回手牌区；原为手牌则无变化）
			const res = await target.chooseCard("he", "溃叛：请收回一张装备牌", 1, (card) => get.type(card) == "equip", true).forResult();
			if (res.bool && res.cards?.length) {
				const card = res.cards[0];
				if (get.position(card) != "h") await target.gain([card]);
			}
		} else {
			const res = await target.chooseCard("he", "溃叛：请选择一张牌蓄谋", 1, true).forResult();
			if (res.bool && res.cards?.length) {
				const card = res.cards[0];
				// 无条件扣置为官方蓄谋牌：选牌区为 he，本身不可能在判定区；
				// 若牌恰为判定区里的 xumou_jsrg 也无法再次扣置（addJudge 会因位置 "j" 弃置），故不再加守卫。
				await target.addJudge({ name: "xumou_jsrg" }, [card]);
			}
		}
		if (!target.isIn()) return;
		// 除其外手牌数与其相等的角色（按行动序）依次视为对其使用一张【火攻】
		const num = target.countCards("h");
		const list = game.filterPlayer((current) => current != target && current.isIn() && current.countCards("h") == num);
		if (!list.length) return;
		list.sortBySeat(_status.currentPhase || player);
		for (const current of list) {
			if (!target.isIn() || !current.isIn()) continue;
			const huogong = { name: "huogong", isCard: true };
			if (current.canUse(huogong, target)) {
				await current.useCard(get.autoViewAs(huogong, []), target, false, "chashui_kuipan");
			}
		}
	},
};

// —— 孟观 · 劾奸 ——
// 「重铸其每个区域里各一张牌」= 目标的牌重铸、目标摸新牌（target.recast）。
// 「视为使用」统一走 chooseUseTarget 单对象形式（player.js:6428 分支）：
//   addCount:false 对应「不计数」——content.js:2234 在 addCount===false 时跳过 cardUsable 检查；
//   logSkill:"chashui_hejian" 由 content.js:2378-2383 透传成 useCard 事件的 skill 归因。
// 【无中生有】是 toself 无目标牌（standard.js:1931-1936 selectTarget:-1 / filterTarget 仅自己），
//   content.js:2252 判定 range[1] <= -1 后走「无目标分支」：forced:true 跳过 chooseBool，
//   targets2 由 filterTarget 收敛为自己，引擎按 toself 自行指向使用者，不弹目标框（同 bingshi.js:1825 potsongyan）。
// 【杀】/【过河拆桥】是有目标牌，先 hasUseTarget 判合法目标（含距离），落空则视为使用不成立。
const chashui_hejian = {
	audio: 2,
	trigger: { global: "changeHpAfter" },
	filter(event, player) {
		const target = event.player;
		if (!target || !target.isIn()) return false;
		if (!event.changedHp) return false;
		if (target.isDying()) return false;
		if (target.hp != player.hp) return false;
		// 目标每个区域里各一张（空区跳过），全部空则无法执行
		return target.countCards("hej") > 0;
	},
	async cost(event, trigger, player) {
		const target = trigger.player;
		const cards = [];
		for (const pos of ["h", "e", "j"]) {
			if (!target.countCards(pos)) continue;
			const res = await player.choosePlayerCard(target, pos, 1, true, "劾奸：重铸" + get.translation(target) + (pos == "h" ? "手牌区" : pos == "e" ? "装备区" : "判定区") + "的一张牌").forResult();
			if (res?.bool && res.cards?.length) cards.addArray(res.cards);
		}
		if (!cards.length) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, targets: [target], cards };
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		const cards = event.cards.filter((card) => get.position(card) == "h" || get.position(card) == "e" || get.position(card) == "j");
		if (!cards.length || !player.isIn()) return;
		await target.recast(cards);
		const cardNames = ["wuzhong", "sha", "guohe"];
		const cardName = cardNames[Math.min(3, cards.length) - 1];
		const vcard = get.autoViewAs({ name: cardName, isCard: true }, []);
		const promptText = "劾奸：视为使用一张【" + get.translation(cardName) + "】";
		if (cardName == "wuzhong") {
			// 无中生有是 toself 无目标牌：content.js:2252 判定 range[1] <= -1 后走无目标分支，
			// forced:true 跳过 chooseBool 询问，targets2 由 filterTarget 收敛为使用者本人，不弹目标框。
			await player.chooseUseTarget({
				card: vcard,
				forced: true,
				addCount: false,
				logSkill: "chashui_hejian",
				prompt: promptText,
			});
			return;
		}
		// 【杀】/【过河拆桥】有目标：无合法目标（含距离与牌自身限制）时视为使用落空，不报错
		if (!player.hasUseTarget(vcard)) return;
		// forced 留空 = 可取消（与原 chooseTarget 行为一致）；ai 按收益挑目标
		await player.chooseUseTarget({
			card: vcard,
			addCount: false,
			logSkill: "chashui_hejian",
			prompt: promptText,
			ai: (target2) => get.effect(target2, vcard, player, player),
		});
	},
};

// —— 李夫人 · 忧色 ——
// 「每轮限一次」用引擎托管 round:1（触发技 usable:1/round:1 托管）。
// 花色判定按原型：三张同花色 → 该花色；互不相同 → 未出现的第 4 种花色。
// 基本牌名候选：动态枚举 lib.card 中 type=="basic" 的真实牌名（火杀/雷杀是 sha 带 nature，
// 不存在 lib.card["fire_sha"]；硬编码会令 get.info 返回 undefined、canUse 崩在 multicheck）。
lib.chashuiYouseBasicNames = function (player) {
	const used = player
		.getHistory("useCard", (evt) => get.type(evt.card, null, false) == "basic")
		.map((evt) => evt.card.name);
	return Object.keys(lib.card).filter((name) => {
		const info = lib.card[name];
		if (!info || info.type != "basic") return false;
		if (used.includes(name)) return false;
		return player.hasUseTarget({ name: name, isCard: true }, true, false);
	});
};
const chashui_youse = {
	audio: 2,
	round: 1,
	trigger: { global: "phaseBegin" },
	filter(event, player) {
		return event.player && event.player.isIn();
	},
	logTarget: "player",
	async cost(event, trigger, player) {
		const result = await player
			.chooseBool("忧色：是否摸三张牌并" + (player.storage.chashui_youse_modified ? "正面向上交给当前回合角色三张牌" : "弃置三张牌") + "？")
			.set("ai", () => {
				const current = get.event().trigger?.player;
				const modified = player.storage.chashui_youse_modified;
				if (modified) return current && get.attitude(player, current) > 0 ? 1 : -1;
				return 1;
			})
			.forResult();
		event.result = { bool: result.bool };
	},
	async content(event, trigger, player) {
		const current = trigger.player;
		await player.draw(3);
		if (player.isDead()) return;
		let cards;
		if (player.storage.chashui_youse_modified) {
			const res = await player.chooseCard("he", "忧色：请正面向上交给" + get.translation(current) + "三张牌", 3, true).forResult();
			if (!res.bool || !res.cards?.length) return;
			cards = res.cards;
			if (current.isIn()) await player.give(cards, current, true);
		} else {
			const res = await player.chooseToDiscard("忧色：请弃置三张牌", 3, "he", true).forResult();
			cards = res.cards || [];
		}
		// 花色判定：均相同 → 该花色；均不同 → 未出现的第 4 种
		let suit = null;
		if (cards.length == 3) {
			const suits = cards.map((card) => get.suit(card, player));
			if (suits[0] == suits[1] && suits[1] == suits[2]) suit = suits[0];
			else if (new Set(suits).size == 3) {
				suit = ["club", "spade", "heart", "diamond"].find((s) => !suits.includes(s));
			}
		}
		if (suit && current.isIn()) {
			current.storage.chashui_youse_suit = suit;
			current.addTempSkill("chashui_youse_eff", "roundEnd");
			current.markSkill("chashui_youse_eff");
		}
	},
};

// 忧色的转化子技：授予当前回合角色，本轮有效。
// 「任意其本回合未使用过的基本牌」：选花色牌 → 选牌名（排除本回合已用）→ chooseUseTarget。
const chashui_youse_eff = {
	charlotte: true,
	mark: true,
	marktext: "忧",
	intro: {
		// markcount 角标显示花色符号（本技能的唯一用途是「拿一张该花色牌印基本牌」）
		markcount(storage, player) {
			const suit = player.storage.chashui_youse_suit;
			return { spade: "♠", heart: "♥", club: "♣", diamond: "♦" }[suit] || "";
		},
		// mark 文本显示 buff 拥有者本回合已使用过的基本牌
		content(storage, player) {
			const suit = player.storage.chashui_youse_suit;
			const suitName = suit ? get.translation(suit) : "";
			const used = player
				.getHistory("useCard", (evt) => get.type(evt.card, null, false) == "basic")
				.map((evt) => get.translation(evt.card.name));
			const usedStr = used.length ? [...new Set(used)].join("、") : "无";
			return `可以将一张${suitName}牌当本回合未使用过的基本牌使用（无次数限制）。<br>本回合已使用过的基本牌：${usedStr}`;
		},
	},
	enable: "phaseUse",
	filter(event, player) {
		const suit = player.storage.chashui_youse_suit;
		if (!suit) return false;
		if (player.countCards("he", (card) => get.suit(card) == suit) == 0) return false;
		// 必须存在可用的牌名，否则 AI 会无限点按钮（每条分支都要推进状态）
		return lib.chashuiYouseBasicNames(player).length > 0;
	},
	filterCard(card, player) {
		return get.suit(card) == player.storage.chashui_youse_suit;
	},
	selectCard: 1,
	position: "he",
	prompt() {
		const player = get.event().player;
		return "忧色：请选择一张" + get.translation(player.storage.chashui_youse_suit) + "牌（转化为基本牌使用）";
	},
	ai: {
		order: 9,
		result: { player: 1 },
	},
	async content(event, trigger, player) {
		const suit = player.storage.chashui_youse_suit;
		const card = event.cards[0];
		if (!card || get.suit(card) != suit) return;
		const usable = lib.chashuiYouseBasicNames(player);
		if (!usable.length) return;
		const res = await player
			.chooseButton(["忧色：选择一张基本牌", [usable.map((name) => [name, get.translation(name)]), "textbutton"]], true)
			.set("ai", (button) => {
				const vcard = { name: button.link, isCard: true };
				return player.getUseValue(vcard, null, true);
			})
			.forResult();
		if (!res.bool || !res.links?.length) return;
		const name = res.links[0];
		const vcard = get.autoViewAs({ name: name, isCard: true }, [card]);
		// 「无次数限制」：addCount=false 不计入使用次数
		await player.chooseUseTarget(vcard, "忧色：是否将" + get.translation(card) + "当【" + get.translation(name) + "】使用？", true).set("logSkill", "chashui_youse_eff").set("addCount", false);
		player.markSkill("chashui_youse_eff");
	},
};

// —— 李夫人 · 烈义 ——
// 「醉酒状态」= hasSkill("jiu")（无名杀酒是 addTempSkill("jiu") 临时技能，回合结束自动过期）。
// 「其没有杀死过角色」：临时监听 dieAfter（source=其）记录击杀；额外回合 await 结束后判定。
const chashui_lieyi_watch = {
	charlotte: true,
	forced: true,
	popup: false,
	global: "dieAfter",
	filter(event, player) {
		return event.source == player;
	},
	async content(event, trigger, player) {
		player.markAuto("chashui_lieyi_kills", [trigger.player]);
	},
};

const chashui_lieyi = {
	audio: 2,
	limited: true,
	skillAnimation: true,
	animationColor: "metal",
	trigger: { global: "phaseEnd" },
	filter(event, player) {
		const current = event.player;
		if (current == player || !current.isIn()) return false;
		// 于醉酒状态结束回合 = 本回合用过酒（hasSkill("jiu")）
		if (!current.hasSkill("jiu")) return false;
		return !player.storage.chashui_lieyi;
	},
	logTarget: "player",
	async content(event, trigger, player) {
		player.awakenSkill("chashui_lieyi");
		// 重置“忧色”（round:1 托管的轮计数由 refreshSkill 清除）
		player.refreshSkill("chashui_youse");
		// 修改忧色：弃置 → 正面向上交给当前回合角色
		player.storage.chashui_youse_modified = true;
		const current = trigger.player;
		if (!current.isIn()) return;
		const extraTurn = current.insertPhase("chashui_lieyi");
		// 记录额外回合内的击杀（手动清理，不用自动过期——phaseAfter 会在当前回合收尾立即过期）
		current.addTempSkill("chashui_lieyi_watch");
		await extraTurn;
		current.removeSkill("chashui_lieyi_watch");
		// 「此回合结束时，若其没有杀死过角色，你死亡」
		if (player.isIn() && !(current.storage.chashui_lieyi_kills || []).length) {
			await player.die({ source: current });
		}
		delete current.storage.chashui_lieyi_kills;
	},
};

// —— 孙寒华 · 玄法 ——
// 「若：A 你回复1点体力；B 你可以令此牌无效…」两分支并列（都满足都执行；回复强制、无效化询问）。
// 「以此法使用的牌不会触发此技能」：归因 skill="chashui_xuanfa"，filter 里排除。
const chashui_xuanfa = {
	audio: 2,
	trigger: { player: "useCardToTargeted" },
	filter(event, player) {
		const use = event.getParent("useCard");
		if (!use || use.skill == "chashui_xuanfa") return false;
		// 「指定唯一目标后」
		if (use.targets?.length != 1 || use.targets[0] != event.target) return false;
		const target = event.target;
		if (!target || !target.isIn()) return false;
		const x = player.countCards("h") + target.countCards("h");
		return player.hp == x || target.hp == x;
	},
	logTarget: "target",
	async cost(event, trigger, player) {
		const target = trigger.target;
		const x = player.countCards("h") + target.countCards("h");
		// 分支①条件满足时不询问（强制回复，与原型 on_cost 一致）；否则询问是否发动（覆盖分支②）
		if (player.hp == x && player.isDamaged()) {
			event.result = { bool: true };
			return;
		}
		const result = await player
			.chooseBool(get.prompt2("chashui_xuanfa"))
			.set("ai", () => (target.hp == x && get.attitude(player, target) < 0 ? 1 : -1))
			.forResult();
		event.result = { bool: result.bool };
	},
	async content(event, trigger, player) {
		const target = trigger.target;
		const x = player.countCards("h") + target.countCards("h");
		let asked = false;
		if (player.hp == x && player.isDamaged()) {
			await player.recover(1);
		} else {
			asked = true;
		}
		if (!target.isIn()) return;
		if (target.hp == x) {
			// 已在 cost 询问并确认发动（asked=true）时不再重复询问；仅当分支①强制回复直接进入（未问）时，才单独询问分支②
			let doIt = true;
			if (!asked) {
				doIt = (await player
					.chooseBool(
						"玄法：是否令" + get.translation(trigger.card) + "对" + get.translation(target) + "无效并于结算完成后视为对其使用一张基本或普通锦囊牌？"
					)
					.set("ai", () => get.attitude(player, target) < 0)
					.forResult()).bool;
			}
			if (doIt) {
				// 单目标无效（与 useCard 共享同一 excluded 数组）
				trigger.excluded.add(target);
				// 结算完成后视为对其使用：记录宿主 useCard 与目标，useCardAfter 子技消费
				player.storage.chashui_xuanfa_pending = target;
				player.storage.chashui_xuanfa_host = event.getParent("useCard");
				player.addTempSkill("chashui_xuanfa_use");
			}
		}
	},
};

// 玄法的“结算完成后视为使用”子技：挂起一个 useCardAfter 监听，选牌名后自选目标使用。
const chashui_xuanfa_use = {
	charlotte: true,
	forced: true,
	popup: false,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		return player.storage.chashui_xuanfa_pending && event == player.storage.chashui_xuanfa_host;
	},
	async content(event, trigger, player) {
		const target = player.storage.chashui_xuanfa_pending;
		delete player.storage.chashui_xuanfa_pending;
		delete player.storage.chashui_xuanfa_host;
		player.removeSkill("chashui_xuanfa_use");
		if (!player.isIn() || !target.isIn()) return;
		// 候选：取自牌堆中实际存在的牌名（按牌堆列牌名），限基本牌 + 普通锦囊，去重后须可对该目标合法使用
		const names = [];
		for (const card of ui.cardPile.childNodes) {
			const name = get.name(card, false);
			if (!name || names.includes(name)) continue;
			const type = get.type(card, null, false);
			if (type != "basic" && type != "trick") continue;
			const vcard = get.autoViewAs({ name: name, isCard: true }, []);
			if (!player.canUse(vcard, target, false, false)) continue;
			names.push(name);
		}
		if (!names.length) return;
		let name;
		if (names.length == 1) {
			name = names[0];
		} else {
			// 选牌面：用 vcard 按钮展示每个牌名对应的牌面
			const res = await player
				.chooseButton(["玄法：选择一个牌名", [names.map((n) => [n, "", n]), "vcard"]], true)
				.set("ai", (button) => player.getUseValue({ name: button.link[2], isCard: true }, null, true))
				.forResult();
			if (!res.bool || !res.links?.length) return;
			name = res.links[0][2];
		}
		const vcard = get.autoViewAs({ name: name, isCard: true }, []);
		// 绕距离次数（原型 bypass_distances/bypass_times），不计数
		await player.useCard(vcard, [target], false, "chashui_xuanfa");
	},
};

// —— 孙寒华 · 仙陌 ——
// 用户拍板：每名被选角色置牌后**强制**获得一张亮出牌；选的角色少于体力值数时，剩余亮出牌按原型入弃牌堆。
const chashui_xianmo = {
	audio: 2,
	trigger: { player: "changeHpAfter" },
	filter(event, player) {
		return event.changedHp != 0 && player.hp > 0;
	},
	async cost(event, trigger, player) {
		const result = await player
			.chooseBool("仙陌：是否亮出牌堆顶" + get.cnNumber(player.hp) + "张牌并选择至多等量名角色执行？")
			.set("ai", () => 1)
			.forResult();
		event.result = { bool: result.bool };
	},
	async content(event, trigger, player) {
		const num = player.hp;
		// ① 亮出牌堆顶等同体力值数张牌：取到处理区（离堆）→ 展示亮出
		const revealed = get.cards(num);
		if (!revealed.length) return;
		await game.cardsGotoOrdering(revealed);
		// 用显式数组跟踪“仍未被拿走的亮出牌”，不依赖 get.position 过滤（避免位置查询失效导致整个流程空转）
		let pool = revealed.slice(0);
		await player.showCards(pool.slice(0), `${get.translation(player)}发动了【仙陌】`);
		if (player.isDead()) {
			if (pool.length) await game.cardsDiscard(pool.slice(0));
			return;
		}
		// ② 选择至多等量名角色，按选择顺序依次执行
		const result = await player
			.chooseTarget("仙陌：选择至多" + get.cnNumber(num) + "名角色（按你的选择顺序依次执行）", [1, num], (card, player2, target) => target.isIn())
			.set("ai", (target) => {
				// 亮出牌对角色是“先放牌再拿牌”：友军正收益、敌军强制拿牌+被迫放牌
				const att = get.attitude(player, target);
				return att > 0 ? att + 1 : att - 1;
			})
			.forResult();
		if (!result.bool) {
			if (pool.length) await game.cardsDiscard(pool.slice(0));
			return;
		}
		const targets = result.targets;
		game.log("仙陌：亮出" + get.cnNumber(revealed.length) + "张牌，选择" + get.cnNumber(targets.length) + "名角色");
		for (const current of targets) {
			if (!current.isIn()) break;
			if (!pool.length) break;
			// 该角色将 Y = min(当前亮出牌数 - 1, 其 he 区牌数) 张牌置于牌堆顶
			const y = Math.min(pool.length - 1, current.countCards("he"));
			game.log("仙陌：", current, "需将" + get.cnNumber(y) + "张牌置于牌堆顶（剩余亮出" + get.cnNumber(pool.length) + "张）");
			if (y > 0) {
				const res = await current
					.chooseCard("he", true, [y, y], "仙陌：请将" + get.cnNumber(y) + "张牌置于牌堆顶")
					.set("ai", (card) => 6 - get.value(card))
					.forResult();
				if (res.bool && res.cards?.length) {
					// 抛出动画：肉眼可见"放牌"动作
					current.$throw(res.cards.slice(0), 1e3);
					game.log(current, "将", res.cards, "置于牌堆顶");
					// 用手牌 lose 到牌堆顶（原生标准：player.lose(cards, ui.cardPile, "insert")）；
					// insert 逐张压到牌堆顶，倒序使先选的牌落在最上
					await current.lose(res.cards.slice(0).reverse(), ui.cardPile, "insert");
				}
			}
			if (!current.isIn()) continue;
			// ③ 该角色获得一张亮出牌（多张时自选，仅一张时直接获得）
			if (!pool.length) break;
			let card;
			if (pool.length == 1) {
				card = pool[0];
			} else {
				const res2 = await current
					.chooseButton(["仙陌：请选择一张牌获得", [pool.slice(0), "card"]], true)
					.set("ai", (button) => get.value(button.link, current))
					.forResult();
				if (!res2.bool || !res2.links?.length) continue;
				card = res2.links[0];
			}
			pool.remove(card);
			await current.gain([card], "gain2");
		}
		// 剩余亮出牌进入弃牌堆
		if (pool.length) await game.cardsDiscard(pool.slice(0));
	},
};

// —— 邓展 · 戎笔 ——（用户拍板：按原型实现——素材=弃牌堆顶那张牌本身，无手牌条件；
// 「不能再使用」拦的是转化结果牌名；描述由译名处对齐）
// 本回合口径 = getHistory（actionHistory 每回合 push 新页，getHistory 恒为本回合）。
const chashui_rongbi = {
	audio: 2,
	// 使用（出牌阶段）走 chooseToUse + chooseButton 弹【杀】/【决斗】；打出（响应）交给 chashui_rongbi_respond 子技
	enable: ["chooseToUse"],
	group: ["chashui_rongbi_respond"],
	filterCard: () => false,
	selectCard: -1,
	hiddenCard(player, name) {
		// 响应窗开窗预检：只放行【杀】/【决斗】且本回合未以该牌名转化过
		if (name != "sha" && name != "juedou") return false;
		if (ui.discardPile.childNodes.length == 0) return false;
		return player.getHistory("useCard", (evt) => evt.skill && evt.skill.startsWith("chashui_rongbi") && evt.card.name == name).length == 0;
	},
	onChooseToUse(event) {
		if (event.chashui_rongbi || !event.player) return;
		const player = event.player;
		if (ui.discardPile.childNodes.length == 0) return;
		const list = [["basic", "", "sha"], ["trick", "", "juedou"]].filter((info) => {
			if (player.getHistory("useCard", (evt) => evt.skill && evt.skill.startsWith("chashui_rongbi") && evt.card.name == info[2]).length > 0) return false;
			return event.filterCard({ name: info[2], isCard: true }, player, event);
		});
		if (list.length) event.set("chashui_rongbi", list);
	},
	filter(event, player) {
		if (event.skill == "chashui_rongbi" || event._skill == "chashui_rongbi") return true;
		return (event.chashui_rongbi || []).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			const top = ui.discardPile.childNodes[ui.discardPile.childNodes.length - 1];
			return ui.create.dialog("戎笔", `<div class="text center">将弃牌堆顶的${top ? get.translation(top) : ""}当【杀】或【决斗】使用</div>`, [event.chashui_rongbi || [], "vcard"]);
		},
		filter(button, player) {
			const evt = get.event().getParent();
			return evt.filterCard({ name: button.link[2], isCard: true }, player, evt);
		},
		check(button) {
			const evt = get.event().getParent();
			if (evt.type != "phase") return 1;
			return get.player().getUseValue({ name: button.link[2], isCard: true }, null, true);
		},
		backup(links, player) {
			return {
				audio: "chashui_rongbi",
				filterCard: () => false,
				selectCard: -1,
				viewAs: {
					name: links[0][2],
					isCard: true,
				},
				// 素材=弃牌堆顶那张牌（官方蓄谋 xumou_jsrg 同款：非常驻区域牌直接作为使用素材）
				async precontent(event, trigger, player2) {
					const top = ui.discardPile.childNodes[ui.discardPile.childNodes.length - 1];
					if (!top) {
						event.result.bool = false;
						return;
					}
					event.result.cards = [top];
				},
			};
		},
		prompt(links) {
			return `###戎笔###<div class="text center">将弃牌堆顶的牌当${get.translation(links[0][2]) == "sha" ? "【杀】" : "【决斗】"}使用或打出</div>`;
		},
	},
	ai: {
		order: 9,
	},
};

// 戎笔·打出侧：将弃牌堆顶的牌当【杀】打出（响应南蛮/决斗/万箭等需打出【杀】的窗口）。
// 打出只可能是【杀】（【决斗】不能被"打出"），故用最简单的单牌名 viewAs，不弹按钮。
const chashui_rongbi_respond = {
	charlotte: true,
	enable: ["chooseToRespond"],
	filter(event, player) {
		// 只在本回合尚未以此法使用过【杀】时可打出（与"不能再使用以此法转化出的牌名"同口径，避免无限）
		if (!player.hasSkill("chashui_rongbi")) return false;
		if (ui.discardPile.childNodes.length == 0) return false;
		return player.getHistory("useCard", (evt) => evt.skill && evt.skill.startsWith("chashui_rongbi") && evt.card.name == "sha").length == 0;
	},
	hiddenCard(player, name) {
		if (name != "sha") return false;
		if (ui.discardPile.childNodes.length == 0) return false;
		return player.getHistory("useCard", (evt) => evt.skill && evt.skill.startsWith("chashui_rongbi") && evt.card.name == "sha").length == 0;
	},
	filterCard: () => false,
	selectCard: -1,
	viewAs: { name: "sha", isCard: true },
	// 素材=弃牌堆顶那张牌
	async precontent(event) {
		const top = ui.discardPile.childNodes[ui.discardPile.childNodes.length - 1];
		if (!top) {
			event.result.bool = false;
			return;
		}
		event.result.cards = [top];
	},
	ai: {
		respondSha: true,
		skillTagFilter(player) {
			return ui.discardPile.childNodes.length > 0;
		},
	},
};

// 戎笔的「本回合不能再使用」记录：主动使用（非响应）的转化牌结算后记牌名。
const chashui_rongbi_mark = {
	charlotte: true,
	forced: true,
	popup: false,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		// 「若你以此法**使用了**牌」——打出（响应链）不算
		if (event.respondTo) return false;
		return event.skill && event.skill.startsWith("chashui_rongbi");
	},
	async content(event, trigger, player) {
		player.markAuto("chashui_rongbi_used", [trigger.card.name]);
	},
};

// 「不能再使用」的拦截：mod.cardEnabled 挡住本回合已用戎笔转化过的牌名（含真杀/决斗与再次转化）
lib.chashuiRongbiBlocked = (player, card) => {
	const name = get.name(card, false);
	return player.getHistory("useCard", (evt) => evt.skill && evt.skill.startsWith("chashui_rongbi") && evt.card.name == name).length > 0;
};

const chashui_rongbi_ban = {
	charlotte: true,
	mod: {
		cardEnabled(card, player) {
			if (lib.chashuiRongbiBlocked(player, card)) return false;
		},
	},
};

// —— 邓展 · 求对 ——
const chashui_qiudui = {
	audio: 2,
	// 他人侧：效仿原生〖问卦〗（wengua: {global:"wengua2"}）——用 global 全局技让任意角色都能发动 chashui_qiudui_a，
	// 而不是 addSkill 到每个角色（那样会把「求对」写进别人的技能描述）。global 技不进任何角色的武将技能列表。
	global: "chashui_qiudui_a",
	// eff 是邓展自己的结算监听（damageAfter），仍需挂在邓展身上
	group: ["chashui_qiudui_eff"],
};

const chashui_qiudui_a = {
	// global 全局技（由 chashui_qiudui.global 提供）：任意角色可用，不出现在角色技能描述里（同原生〖问卦〗wengua2）
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return game.hasPlayer((current) => current != player && current.isAlive() && current.hasSkill("chashui_qiudui") && current.isIn());
	},
	filterCard: true,
	position: "he",
	selectCard: 1,
	viewAs: { name: "juedou", isCard: true, chashui_qiudui_card: true },
	filterTarget(card, player, target) {
		return target != player && target.isAlive() && target.hasSkill("chashui_qiudui");
	},
	prompt: "求对：将一张牌当【决斗】对其使用",
	// 标记：这张【决斗】由求对转化而来，供 chashui_qiudui_eff 的 damageAfter 精确识别
	async precontent(event) {
		const vc = event.result?.card;
		if (vc) vc.chashui_qiudui_card = true;
	},
	ai: {
		order: 4,
		result: {
			player(player, target) {
				// 决斗胜利（造成伤害）摸2；失败则步度根回收牌
				const att = get.attitude(player, target);
				return -att;
			},
			target(player, target) {
				return get.attitude(player, target) <= 0 ? -1 : 0.5;
			},
		},
	},
};

// 求对的结算：以此法造成伤害的角色摸两张牌；步度根受伤则获得相关牌。
const chashui_qiudui_eff = {
	charlotte: true,
	forced: true,
	popup: false,
	trigger: { global: "damageAfter" },
	filter(event, player) {
		// 只认「求对子技（chashui_qiudui_a）以此法转化出的【决斗】」造成的伤害，不把真【决斗】牌也算进来：
		// ① 该【决斗】VCard 上有 chashui_qiudui_a.precontent 打的标记；②或 useCard.skill 归因为求对子技。
		let isQiudui = !!event.card?.chashui_qiudui_card;
		if (!isQiudui) {
			const use = event.getParent("useCard");
			if (use && use.skill && String(use.skill).startsWith("chashui_qiudui")) isQiudui = true;
		}
		if (!isQiudui) return false;
		return !!(event.source?.isIn() || (event.player == player && event.player.isIn()));
	},
	logSkill: ["chashui_qiudui"],
	async content(event, trigger, player) {
		const use = trigger.getParent("useCard");
		// ① 以此法造成伤害的角色摸两张牌（含邓展自己通过决斗造成伤害的情况，不排除 player）
		if (trigger.source && trigger.source.isIn()) {
			await trigger.source.draw(2);
		}
		// ② 若你（邓展）因此受到伤害，获得决斗牌与响应牌中已进弃牌堆/处理区的
		if (trigger.player == player && use) {
			const cids = (use.cards || []).slice();
			player.getHistory("respond", (evt) => {
				if (evt.getParent("useCard") == use && evt.cards?.length) cids.addArray(evt.cards);
			});
			const gainCards = cids.filter((card) => ["d", "o"].includes(get.position(card, true)));
			if (gainCards.length && player.isIn()) await player.gain(gainCards, "gain2");
		}
	},
};

// —— 步度根 · 寇守 ——
// 「回合外」= 自己不是当前回合角色；素材牌须在弃牌堆/处理区。
const chashui_koushou = {
	audio: 2,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		// 「回合外」按这张牌所在 phase 的回合角色判断（实时 _status.currentPhase 在回合末尾可能已切走，会误判）
		const phasePlayer = event.getParent("phase")?.player;
		if ((phasePlayer || _status.currentPhase) == player) return false;
		if (!_status.currentPhase || !_status.currentPhase.isIn()) return false;
		const pos = get.position(event.card, true);
		if (pos != "d" && pos != "o") return false;
		return true;
	},
	logTarget: "card",
	async cost(event, trigger, player) {
		// 「当前回合角色」= 这张牌所在的 phase 的回合角色（不能实时读 _status.currentPhase：
		// 回合结束阶段用牌、useCardAfter 结算时可能已切到下个回合角色，会给错人）
		const current = trigger.getParent("phase")?.player || _status.currentPhase;
		const result = await player
			.chooseBool("寇守：是否令" + get.translation(current) + "获得" + get.translation(trigger.card) + "？")
			.set("ai", () => {
				// 把牌交给当前回合角色：友军给、敌军不给
				return get.attitude(player, current) > 0 ? 1 : -1;
			})
			.forResult();
		event.result = { bool: result.bool };
	},
	async content(event, trigger, player) {
		const current = trigger.getParent("phase")?.player || _status.currentPhase;
		if (!current || !current.isIn()) return;
		await current.gain([trigger.card], "gain2");
		if (!player.isIn()) return;
		// 「若其不是此牌目标」→ 目标角色依次可将一张伤害牌当【决斗】对步度根使用
		if (trigger.targets?.includes(current)) return;
		const targets = (trigger.targets || []).filter((t) => t.isIn());
		if (!targets.length) return;
		targets.sortBySeat(current);
		for (const t of targets) {
			const res = await t
				.chooseCard("he", "寇守：是否将一张伤害牌当【决斗】对" + get.translation(player) + "使用？", 1, (card) => get.tag(card, "damage"))
				.set("ai", (card) => {
					const vcard = get.autoViewAs({ name: "juedou", isCard: true }, [card]);
					return get.effect(player, vcard, t, t) > 0 ? 5 - get.value(card) : 0;
				})
				.forResult();
			if (res.bool && res.cards?.length) {
				const card = res.cards[0];
				const vcard = get.autoViewAs({ name: "juedou", isCard: true }, [card]);
				const useEvt = t.useCard(vcard, [card], player, false, "chashui_koushou_a");
				useEvt.addCount = false;
				await useEvt;
				break;
			}
		}
	},
};

// —— 步度根 · 斟戈 ——
// 「每轮每种牌名限一次」= 转化结果**牌名**每轮各一次（不是类别；同类别不同牌名仍可各用一次）。
const chashui_zhenge = {
	audio: 2,
	// mark：显示本轮已转化过的牌名
	mark: true,
	marktext: "戈",
	intro: {
		name: "斟戈",
		content(storage, player) {
			const usedRound = player.storage.chashui_zhenge_round;
			if (!usedRound || usedRound.round != game.roundNumber || !usedRound.names?.length) return "本轮尚未转化过牌名。";
			return "本轮已转化：" + usedRound.names.map((n) => "【" + get.translation(n) + "】").join("、");
		},
	},
	trigger: { global: "phaseEnd" },
	filter(event, player) {
		// 「没有角色造成过伤害的回合」= 本回合全场 sourceDamage 为空
		if (game.hasPlayer((current) => current.getHistory("sourceDamage").length > 0)) return false;
		return player.countCards("he") > 0;
	},
	async cost(event, trigger, player) {
		const res = await player
			.chooseCard("he", [1, Infinity], "斟戈：是否重铸任意张类型相同的牌？", (card, player2) => {
				const sel = ui.selected.cards;
				if (!sel.length) return true;
				return get.type(card) == get.type(sel[0]);
			})
			.set("complexCard", true)
			.set("ai", (card) => {
				// 重铸换新牌：低价值牌重铸有收益
				return 4 - get.value(card);
			})
			.forResult();
		if (!res.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cards: res.cards };
	},
	async content(event, trigger, player) {
		const cards = (event.cards || []).filter((card) => ["h", "e"].includes(get.position(card)));
		if (!cards.length || !player.isIn()) return;
		await player.recast(cards);
		// 「因此置入弃牌堆的牌」= 刚重铸的这批牌，现在在弃牌堆
		const discarded = cards.filter((card) => get.position(card, true) == "d");
		if (!discarded.length || !player.isIn()) return;
		// 牌名/类别以【重铸的这批牌】为准（同类别的伤害牌）
		const type = get.type(discarded[0], null, false);
		if (type != "basic" && type != "trick") return;
		// 每轮每种牌名限一次（trueName 口径，storage 记轮号与已用名单）
		let usedRound = player.storage.chashui_zhenge_round;
		if (!usedRound || usedRound.round != game.roundNumber) {
			usedRound = { round: game.roundNumber, names: [] };
			player.storage.chashui_zhenge_round = usedRound;
		}
		// 候选：按本局开启的牌名范围（lib.inpile）筛同类别（basic/trick）的伤害牌名，排除本轮已转化过的牌名与不可用的
		const names = [];
		for (const name of lib.inpile) {
			const info = lib.card[name];
			if (!info || info.type != type) continue;
			const vcard = get.autoViewAs({ name: name, isCard: true }, []);
			if (!(get.tag(vcard, "damage") > 0)) continue;
			if (usedRound.names.includes(name)) continue;
			if (!player.hasUseTarget(vcard, false, false)) continue;
			names.push(name);
		}
		if (!names.length) return;
		// 素材默认=全部重铸进弃牌堆的牌（无需再选底牌）→ 选牌面（vcard）→ 使用
		const matCards = discarded.slice(0);
		const resName = await player
			.chooseButton(["斟戈：选择一张同类别伤害牌", [names.map((name) => [name, "", name]), "vcard"]], true)
			.set("ai", (button) => {
				const vcard = { name: button.link[2], isCard: true };
				return player.getUseValue(vcard, null, true);
			})
			.forResult();
		if (!resName.bool || !resName.links?.length) return;
		const name = resName.links[0][2];
		// 记录本轮已转化的牌名（按牌名限一次，不是类别），并刷新 mark
		if (!usedRound.names.includes(name)) usedRound.names.push(name);
		player.markSkill("chashui_zhenge");
		const vcard = get.autoViewAs({ name: name, isCard: true }, matCards);
		const result = await player
			.chooseTarget("斟戈：使用【" + get.translation(name) + "】", (card, player2, target2) => player2.canUse(vcard, target2, false, false))
			.set("ai", (target2) => get.effect(target2, vcard, player, player))
			.forResult();
		if (!result.bool || !result.targets?.length) return;
		const useEvt = player.useCard(vcard, matCards, result.targets, false, "chashui_zhenge");
		useEvt.addCount = false;
		await useEvt;
	},
};

// —— 刘兰芝 · 结心 ——（原型 id 即 jiexinq：与灵雎〖竭心〗chashui_jiexin 撞名，照原型加 q 后缀）
// 连接牌照本扩植党（姻谋/宿伍）范式：get.is.connectedCard 判定 + player.connectCards 连接。
// 「连接因此获得的牌」= 本次推心置腹中双方获得、现仍在手牌区的牌。
const chashui_jiexinq = {
	audio: 2,
	forced: true,
	trigger: { player: "phaseEnd" },
	filter(event, player) {
		if (!player.isIn()) return false;
		// 未选定结心角色时需要还有其他角色可选；已选定时需要结心角色在场
		const target = player.storage.chashui_jiexinq_target;
		if (!target) return game.hasPlayer((current) => current != player && current.isIn());
		return target.isIn();
	},
	async content(event, trigger, player) {
		// ① 首个回合结束时：选定“结心”角色（双向 storage + 挂对方视角的生盟入口）
		if (!player.storage.chashui_jiexinq_target) {
			const res = await player
				.chooseTarget("结心：选择一名其他角色作为“结心”角色", true, (card, player2, target) => target != player2 && target.isIn())
				.set("ai", (target) => get.attitude(player, target))
				.forResult();
			if (res.bool && res.targets?.length) {
				const target = res.targets[0];
				player.storage.chashui_jiexinq_target = target;
				target.storage.chashui_jiexinq_target = player;
				target.addSkill("chashui_shengmeng_link");
				// 呈现：以角色图片 mark 标记“结心”角色是谁（同原生〖相谶〗 markSkillCharacter）
				player.markSkillCharacter("chashui_jiexinq", target, "结心", "结心角色：" + get.translation(target));
				game.log(player, "选择了", target, "作为“结心”角色");
			}
		}
		// ② 每个回合结束时：视为对结心角色使用一张无距离限制的【推心置腹】
		const target = player.storage.chashui_jiexinq_target;
		if (!target || !target.isIn() || !player.isIn()) return;
		const vcard = get.autoViewAs({ name: "tuixinzhifu", isCard: true }, []);
		if (!player.canUse(vcard, target, false, true)) return;
		const useEvt = player.useCard(vcard, target, false, "chashui_jiexinq");
		useEvt.addCount = false;
		await useEvt;
		// ③ 连接“因此获得的牌”：本次结算中双方 gain 且仍在手牌区的牌
		const cards = [];
		for (const current of [player, target]) {
			current.getHistory("gain", (evt) => evt.getParent("useCard") == useEvt && evt.cards?.length).forEach((evt) => {
				for (const card of evt.cards) {
					if (get.position(card) == "h" && !cards.includes(card)) cards.push(card);
				}
			});
		}
		if (cards.length) await player.connectCards(cards);
	},
	// 呈现：结心角色死亡后清掉角色图片 mark（markSkillCharacter 建的是 player.marks["chashui_jiexinq"]）
	group: ["chashui_jiexinq_mark"],
	subSkill: {
		mark: {
			charlotte: true,
			forced: true,
			popup: false,
			trigger: { global: "dieAfter" },
			filter(event, player) {
				return event.player == player.storage.chashui_jiexinq_target && player.marks?.chashui_jiexinq;
			},
			content(event, trigger, player) {
				player.unmarkSkill("chashui_jiexinq");
			},
		},
	},
};
// 「每回合各限一次」= usable:1 引擎托管；转化名 = 对方已连接手牌中基本/普通锦囊的 trueName（原型口径）。
const chashui_shengmeng = {
	audio: 2,
	charlotte: true,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		const other = player.storage.chashui_jiexinq_target;
		if (!other || !other.isIn()) return false;
		if (player.countCards("he") == 0) return false;
		return other.countCards("h", (card) => get.is.connectedCard(card) && (get.type(card) == "basic" || get.type(card) == "trick")) > 0;
	},
	filterCard: true,
	position: "he",
	selectCard: 1,
	prompt() {
		const player = get.event().player;
		return "生盟：将一张牌当" + get.translation(player.storage.chashui_jiexinq_target) + "的已连接的基本牌或普通锦囊牌使用";
	},
	ai: {
		order: 8,
		result: { player: 1 },
	},
	async content(event, trigger, player) {
		const other = player.storage.chashui_jiexinq_target;
		const card = event.cards[0];
		if (!card || !other || !other.isIn() || !player.isIn()) return;
		// 候选牌名：对方已连接的基本/普通锦囊的 trueName（去重）
		const names = [];
		for (const c of other.getCards("h")) {
			if (!get.is.connectedCard(c)) continue;
			const type = get.type(c);
			if (type != "basic" && type != "trick") continue;
			const trueName = c.trueName || c.name;
			if (!names.includes(trueName)) names.push(trueName);
		}
		if (!names.length) return;
		const res = await player
			.chooseButton(["生盟：选择一个牌名", [names.map((name) => [name, get.translation(name)]), "textbutton"]], true)
			.set("ai", (button) => {
				const vcard = { name: button.link, isCard: true };
				return player.getUseValue(vcard, null, true);
			})
			.forResult();
		if (!res.bool || !res.links?.length) return;
		const name = res.links[0];
		const vcard = get.autoViewAs({ name: name, isCard: true }, [card]);
		await player.chooseUseTarget(vcard, "生盟：是否将" + get.translation(card) + "当【" + get.translation(name) + "】使用？", true).set("logSkill", "chashui_shengmeng");
	},
};

// 对方（“结心”角色）视角的生盟入口：内容与本体相同（各自读自己 storage 的“对方”）
const chashui_shengmeng_link = {
	...chashui_shengmeng,
	charlotte: true,
};

// —— 刘兰芝 · 殉别 ——
const chashui_xunbie = {
	audio: 2,
	forced: true,
	trigger: { player: "loseAfter" },
	filter(event, player) {
		// 「失去所有手牌后」= 本次失去涉及手牌区且结算后空手牌
		if (!Array.isArray(event.hs) || !event.hs.length) return false;
		return player.countCards("h") == 0 && player.isIn();
	},
	async content(event, trigger, player) {
		if (!player.isIn()) return;
		await player.loseHp(1);
		// 「将手牌摸至当前体力值」——失去体力后的 hp（濒死/死亡时 isIn 兜底）
		if (!player.isIn()) return;
		const num = player.hp - player.countCards("h");
		if (num > 0) await player.draw(num);
	},
};

// ==================== 茶水贤设·曦 番外补全（SD.TEA 番外缺失 6 名，无 Lua 原型，以实体卡转录为权威源）====================

// —— 刘纂 · 妙书 ——
// 「每回合每种牌名限一次」= 转化结果牌名每回合各一次；
// 「牌名字数和」= 牌名中文字数（get.translation(name).length）；
// 「弃置任意张牌」范围 = hes（手牌+装备+木牛）。虚拟印（无底牌），运行时牌面，走 chooseButton+backup（道转 potdaozhuan / 火宴 xiaobai_huoyan 范本）。
// 印出可为基本牌（含闪/桃）与普通锦囊（含无懈）⇒ enable=chooseToUse 全使用窗；hiddenCard 按牌名收窄开窗（无懈窗必须）。
const chashui_miaoshu = {
	audio: 2,
	enable: "chooseToUse",
	// mark：显示本回合已印过的牌名
	mark: true,
	marktext: "书",
	intro: {
		name: "妙书",
		content(storage, player) {
			const used = player.getHistory("useCard", (evt) => evt.skill && evt.skill.startsWith("chashui_miaoshu")).map((evt) => evt.card.name);
			if (!used.length) return "本回合尚未以此法印过牌。";
			return "本回合已印：" + used.map((n) => "【" + get.translation(n) + "】").join("、");
		},
	},
	// 本回合已印牌名
	_getUsed(player) {
		return player.getHistory("useCard", (evt) => evt.skill && evt.skill.startsWith("chashui_miaoshu")).map((evt) => evt.card.name);
	},
	// hes 牌名字数和上限（=最多能弃多少字）
	_heSum(player) {
		return player.getCards("hes").reduce((acc, card) => acc + get.translation(card.name).length, 0);
	},
	hiddenCard(player, name) {
		// 只放行基本牌 / 普通锦囊（含闪/桃/无懈）；按牌名收窄，避免开不出的窗口
		const type = get.type(name);
		if (type != "basic" && type != "trick") return false;
		const lib_ = lib.skill.chashui_miaoshu;
		if (lib_._getUsed(player).includes(name)) return false;
		if (get.translation(name).length > lib_._heSum(player)) return false;
		return player.countCards("hes") > 0;
	},
	onChooseToUse(event) {
		if (event.chashui_miaoshu || !event.player) return;
		const player = event.player;
		const used = lib.skill.chashui_miaoshu._getUsed(player);
		const sum = lib.skill.chashui_miaoshu._heSum(player);
		if (sum <= 0) return;
		const list = get.inpileVCardList((info) => {
			const type = info[0];
			if (type != "basic" && type != "trick") return false;
			const name = info[2];
			if (used.includes(name)) return false;
			if (get.translation(name).length > sum) return false;
			return event.filterCard(new lib.element.VCard({ name: name, nature: info[3], isCard: true }), player, event);
		});
		if (list.length) event.set("chashui_miaoshu", list);
	},
	filter(event, player) {
		if (event.skill == "chashui_miaoshu" || event._skill == "chashui_miaoshu") return true;
		return (event.chashui_miaoshu || []).length > 0;
	},
	chooseButton: {
		dialog(event, player) {
			return ui.create.dialog("妙书", [event.chashui_miaoshu || [], "vcard"]);
		},
		filter(button, player) {
			const evt = get.event().getParent();
			const name = button.link[2];
			if (lib.skill.chashui_miaoshu._getUsed(player).includes(name)) return false;
			return evt.filterCard(new lib.element.VCard({ name: name, nature: button.link[3], isCard: true }), player, evt);
		},
		check(button) {
			const evt = get.event().getParent();
			if (evt.type != "phase") return 1;
			return get.player().getUseValue(new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true }));
		},
		backup(links, player) {
			return {
				audio: "chashui_miaoshu",
				// 无素材印牌三件套
				filterCard: () => false,
				selectCard: -1,
				viewAs: {
					name: links[0][2],
					nature: links[0][3],
					isCard: true,
				},
				// 支付：弃置任意张 hes 牌，其牌名字数之和须 ≥ 所选牌名字数（filterOk 保证确认时已够，避免白弃）
				async precontent(event, trigger, player2) {
					const name = event.result?.card?.name;
					if (!name) return;
					const need = get.translation(name).length;
					const res = await player2
						.chooseToDiscard("hes", "妙书：弃置任意张牌（牌名字数之和须不少于" + need + "）", [1, Infinity])
						.set("filterOk", () => {
							const sum = ui.selected.cards.reduce((acc, card) => acc + get.translation(card.name).length, 0);
							return sum >= need;
						})
						.set("ai", (card) => 4 - get.value(card))
						.forResult();
					if (!res.bool) {
						// 玩家取消弃牌：重开选牌名窗口（未弃牌，无损失）
						event.result.cancel = true;
						return;
					}
					// 弃牌成功：刷新 mark（显示本回合已印牌名，此刻这张即将使用）
					player2.markSkill("chashui_miaoshu");
				},
			};
		},
		prompt(links) {
			return "妙书：弃置任意张牌，视为使用" + (get.translation(links[0][3]) || "") + "【" + get.translation(links[0][2]) + "】";
		},
	},
	ai: {
		order: 9,
		// 能印杀/闪/桃：让 AI 在对应使用窗会用；只"使用"不"打出"，拒 respond
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag, arg) {
			if (arg === "respond") return false;
			// save 的 arg 是濒死者 Player，不按字符串拒
			return player.countCards("hes") > 0;
		},
	},
};

// —— 刘纂 · 兴唤 ——
// 「依次执行以下前X项」：项列表存 storage（本局持久），项1 回复成功则从尾部删一项；
// 删到空列表后技能不再执行任何项。X 超过现存项数时执行现存全部。
const chashui_xinghuan_record = {
	charlotte: true,
	silent: true,
	firstDo: true,
	popup: false,
	trigger: { player: ["useCard1", "respond"], global: "phaseBeginStart" },
	filter(event, player, name) {
		if (name == "phaseBeginStart") return true;
		const type = get.type(event.card);
		return type == "basic" || type == "trick";
	},
	async content(event, trigger, player) {
		if (event.triggername == "phaseBeginStart") {
			delete player.storage.chashui_xinghuan_last;
			// 新一轮去重集合清空（防洗牌后同对象牌被误判已处理）
			delete player.storage.chashui_xinghuan_done;
		} else {
			player.storage.chashui_xinghuan_last = trigger.card.name;
		}
	},
};

const chashui_xinghuan = {
	audio: 2,
	forced: true,
	trigger: {
		player: ["loseAfter", "discardAfter"],
		global: ["equipAfter", "addJudgeAfter", "loseAsyncAfter", "addToExpansionAfter", "cardsDiscardAfter"],
	},
	filter(event, player) {
		if (!player.isIn()) return false;
		// 「你的牌进入弃牌堆」：各事件统一提取本次进入弃牌堆的牌
		const cards = lib.skill.chashui_xinghuan.getDiscarded(event, player);
		return cards.length > 0;
	},
	getDiscarded(event, player) {
		const cards = [];
		if (event.name == "loseAsync") {
			const getl = event.getl?.[player.playerid];
			if (getl?.cards) cards.addArray(getl.cards);
		} else if (event.name == "cardsDiscard") {
			if (event.getParent("useCard")?.player == player && Array.isArray(event.cards)) cards.addArray(event.cards);
		} else if (Array.isArray(event.cards)) {
			cards.addArray(event.cards);
		}
		return cards.filter((card) => card && get.position(card, true) == "d");
	},
	async content(event, trigger, player) {
		// 去重：同一批牌进入弃牌堆会触发 loseAfter / discardAfter / loseAsyncAfter / cardsDiscardAfter 等多个事件，
		// 用已处理 cardid 集合保证每张牌只结算一次，避免「前X项」重复执行
		const done = player.getStorage("chashui_xinghuan_done");
		const cards = lib.skill.chashui_xinghuan
			.getDiscarded(trigger, player)
			.filter((card) => card && !done.includes(card.cardid));
		if (!cards.length) return;
		for (const card of cards) if (card.cardid) done.push(card.cardid);
		const x = cards.length;
		if (x <= 0) return;
		const list = player.storage.chashui_xinghuan_list || [1, 2, 3];
		if (!list.length) return;
		const items = list.slice(0, Math.min(x, list.length));
		for (const item of items) {
			if (item == 1) {
				// ① 回复1点体力，若如此做，删除此技能的最后一项
				if (player.isDamaged()) {
					const before = player.hp;
					await player.recover(1);
					if (player.hp > before) {
						list.pop();
						game.log(player, "的", "#g【兴唤】", "删除了最后一项");
					}
				}
			} else if (item == 2) {
				// ② 摸1张牌
				if (player.isIn()) await player.draw(1);
			} else if (item == 3) {
				// ③ 令当前回合角色的一张手牌视为【随机应变】直到本回合结束
				const current = _status.currentPhase;
				if (!current || !current.isIn() || !player.isIn()) continue;
				if (current.countCards("h") == 0) continue;
				// 你替其选一张手牌（织宫「你替每名角色选」同款）
				const res = await player.choosePlayerCard(current, "h", true, "兴唤：选择" + get.translation(current) + "的一张手牌视为【随机应变】").forResult();
				if (res?.bool && res.cards?.length) {
					const card = res.cards[0];
					// 强制视为（mod.cardname）：用牌 tag 标记这张手牌（牌面可见标记，便于识别视为对象）
					card.addGaintag("eternal_chashui_xinghuan");
					current.addTempSkill("chashui_xinghuan_yb", "roundEnd");
					game.log(card, "被视为【随机应变】直到回合结束");
				}
			}
		}
		player.storage.chashui_xinghuan_list = list;
	},
};

// 兴唤「依次执行以下前X项」——项列表会因「回复成功删最后一项」而变，属**规则文本**变化，
// 按 AGENTS.md §6 走 dynamicTranslate（引擎取技能描述优先读 lib.dynamicTranslate，
// 询问面板 prompt2 与技能浮窗同源，改一处全链路生效）。
lib.dynamicTranslate ??= {};
lib.dynamicTranslate.chashui_xinghuan = function (player) {
	const list = player?.storage?.chashui_xinghuan_list || [1, 2, 3];
	const text = {
		1: "回复1点体力，若如此做，你删除此技能的最后一项",
		2: "摸一张牌",
		3: "令当前回合角色的一张手牌视为【随机应变】直到本回合结束",
	};
	const remain = list
		.slice()
		.sort((a, b) => a - b)
		.map((item) => item + "." + text[item]);
	const tail = remain.length ? "：" + remain.join("；") + "。" : "（已无剩余项）。";
	return "锁定技，当你的牌进入弃牌堆后，你依次执行以下前X项（X为此次进入弃牌堆的牌数）" + tail;
};

// 随机应变语义子技：挂在被标记手牌的持有者身上（牌名视为本回合内使用或打出的上一张基本牌或普通锦囊牌）
const chashui_xinghuan_yb = {
	charlotte: true,
	mod: {
		cardname(card, player) {
			if (card.hasGaintag?.("eternal_chashui_xinghuan")) {
				const last = player.storage.chashui_xinghuan_last;
				if (last && lib.card[last]) return last;
			}
		},
	},
};

// —— 徐登&赵炳 · 拾秘 ——
// 「转换技，限定技」组合照原生解弦 clanjiexuan（clan.js:5701）：每次发动
// logSkill + changeZhuanhuanji（数字态推进）+ awakenSkill(skill, true)（消耗一次限定并禁用），
// 生枝的 refreshSkill 可恢复（restoreSkill）。
// 三态：①素材牌名在牌库中数量 < 转化牌名数量；②相等；③大于（「初始牌堆」≈ 全局现存牌口径，
// 牌不会凭空增减，用牌堆+弃牌堆+全场区域+处理区统计，等价于初始牌堆）。
// 「初始牌堆」直接数 lib.card.list（建局时生成的初始牌组 [suit, number, name, nature?]，牌移动不改它，
// 只有洗牌才 randomSort）——比统计牌堆+弃牌堆+全场区域更准，也不会因 get.discardPile() 无参返回 null 而崩。
lib.chashuiCountCardName = (name) => {
	let count = 0;
	for (const item of lib.card.list) {
		if (item[2] == name) count++;
	}
	return count;
};

const chashui_shimi = {
	audio: 2,
	// 印牌技（转化印：将一张牌当任意基本牌/普通锦囊「使用」）——使用全窗（出牌/闪/桃/无懈），同妙书标准
	enable: "chooseToUse",
	limited: true,
	zhuanhuanji: "number",
	// 三态转换技：☯ 需按 3 档旋转（缺省 zhuanhuanItemNum 返回 2，会只转两档、与三态不符）
	zhuanhuanLimit: 3,
	mark: true,
	marktext: "拾",
	// mark 不旋转：marktext 非"☯"时初始渲染本就不转；翻转时引擎仍会在 $changeZhuanhuanji 里按 zhuanhuanLimit 转角度，
	// 自定义 $zhuanhuanji 覆盖它 → 只刷新角标(markcount 态号)、不旋转。
	$zhuanhuanji(skill, player) {
		player.updateMarks();
	},
	intro: {
		// 三态转换技：markcount 显示当前态序号（1/2/3）
		markcount(storage, player) {
			return ((storage ?? player.storage.chashui_shimi) || 0) + 1;
		},
		content(storage) {
			const state = storage || 0;
			if (state == 0) return "限定技，转换技。你可以将一张牌当任意一张基本牌或普通锦囊牌使用，且你以此法使用的牌在初始牌堆中的数量须小于转化后的牌。";
			if (state == 1) return "限定技，转换技。你可以将一张牌当任意一张基本牌或普通锦囊牌使用，且你以此法使用的牌在初始牌堆中的数量须等于转化后的牌。";
			return "限定技，转换技。你可以将一张牌当任意一张基本牌或普通锦囊牌使用，且你以此法使用的牌在初始牌堆中的数量须大于转化后的牌。";
		},
	},
	// 转化印牌（素材=底牌，非虚拟）：chooseButton 先选牌面 → backup 里 filterCard 选底牌 + viewAs 转化使用，
	// 走标准 useCard 链，受使用次数与距离限制（不 addCount:false / 不 nodistance）。
	// 印牌技无静态 viewAs，filterEnable 不兜底 → filter 必判窗口+素材。
	filter(event, player) {
		if (event.skill == "chashui_shimi" || event._skill == "chashui_shimi") return true;
		if (player.countCards("he") == 0) return false;
		if (typeof event.filterCard != "function") return false;
		return lib.skill.chashui_shimi.getNames(player, event).length > 0;
	},
	// 印牌技开窗预检：多牌名转化印无 respond/save 标签，必须按牌名收窄（无懈窗只认 hiddenCard）
	hiddenCard(player, name) {
		const type = get.type(name);
		if (type != "basic" && type != "trick") return false;
		return player.countCards("he") > 0;
	},
	getUsed(player) {
		return player.getHistory("useCard", (evt) => evt.skill && evt.skill.startsWith("chashui_shimi")).map((evt) => evt.card.name);
	},
	// 可印牌名：basic/trick、本回合未用、当前窗口可对某目标使用、且存在至少一张 he 素材能成立当前态牌库数量条件
	getNames(player, event) {
		const state = player.storage.chashui_shimi || 0;
		const heCards = player.getCards("he");
		const used = lib.skill.chashui_shimi.getUsed(player);
		return lib.inpile.filter((name) => {
			const type = get.type(name);
			if (type != "basic" && type != "trick") return false;
			if (used.includes(name)) return false;
			const countDst = lib.chashuiCountCardName(name);
			const hasMat = heCards.some((card) => {
				const cs = lib.chashuiCountCardName(get.name(card, false));
				if (state == 0) return cs < countDst;
				if (state == 1) return cs == countDst;
				return cs > countDst;
			});
			if (!hasMat) return false;
			return event ? event.filterCard(new lib.element.VCard({ name, isCard: true }), player, event) : true;
		});
	},
	chooseButton: {
		dialog(event, player) {
			const names = lib.skill.chashui_shimi.getNames(player, event);
			if (!names.length) return ui.create.dialog("拾秘：没有可转化的牌名");
			return ui.create.dialog("拾秘", [names.map((name) => [name, "", name]), "vcard"]);
		},
		filter(button, player) {
			const evt = get.event().getParent();
			return evt.filterCard(new lib.element.VCard({ name: button.link[2], isCard: true }), player, evt);
		},
		check(button) {
			const evt = get.event().getParent();
			if (evt.type != "phase") return 1;
			return get.player().getUseValue(new lib.element.VCard({ name: button.link[2], isCard: true }));
		},
		// backup：先选牌面（links）后选底牌——filterCard 按所选牌名的三态牌库数量条件筛底牌，viewAs 作转化牌
		backup(links, player) {
			const name = links[0][2];
			const state = player.storage.chashui_shimi || 0;
			const countDst = lib.chashuiCountCardName(name);
			return {
				audio: "chashui_shimi",
				position: "he",
				selectCard: 1,
				filterCard(card) {
					const cs = lib.chashuiCountCardName(get.name(card, false));
					if (state == 0) return cs < countDst;
					if (state == 1) return cs == countDst;
					return cs > countDst;
				},
				// 转化牌：素材作为底牌（非虚拟）
				viewAs: { name: name, isCard: true },
				// 消耗：结算前转态 + 限定
				async precontent(event, trigger, player2) {
					player2.logSkill("chashui_shimi");
					player2.changeZhuanhuanji("chashui_shimi");
					player2.awakenSkill("chashui_shimi", true);
				},
			};
		},
		prompt(links) {
			return "拾秘：将一张牌当【" + get.translation(links[0][2]) + "】使用";
		},
	},
	ai: {
		order: 9,
		result: { player: 1 },
		// 能印杀/闪/桃：AI 在对应使用窗会用；只「使用」不「打出」→ 拒 respond
		respondSha: true,
		respondShan: true,
		save: true,
		skillTagFilter(player, tag, arg) {
			if (arg === "respond") return false;
			return player.countCards("he") > 0;
		},
	},
};

// —— 徐登&赵炳 · 定流 ——
// 「当你摸牌或造成伤害后」= player:["drawAfter","damageAfter"]（摸牌必产生 draw 事件）。
// 两态：阳=两人各弃置一张牌；阴=两人各回复1点体力。
const chashui_dingliu = {
	audio: 2,
	limited: true,
	zhuanhuanji: true,
	mark: true,
	marktext: "☯",
	intro: {
		markcount: () => 0,
		content(storage) {
			return "限定技，转换技，当你摸牌或造成伤害后，你可以和一名手牌数与你相等的其他角色依次" + ((storage || 0) % 2 ? "②回复1点体力" : "①弃置一张牌") + "。";
		},
	},
	trigger: { player: "drawAfter", source: "damageAfter" },
	filter(event, player) {
		if (!player.isIn()) return false;
		if (!player.countCards("h")) return false;
		// 存在手牌数与你相等的其他角色
		return game.hasPlayer((current) => current != player && current.isIn() && current.countCards("h") == player.countCards("h"));
	},
	async cost(event, trigger, player) {
		// 可选发动：不能传 forced（否则去掉取消按钮 = 强制发动）。取消 → bool:false → 引擎不发动。
		const result = await player
			.chooseTarget("定流：与一名手牌数与你相等的其他角色" + ((player.storage.chashui_dingliu || 0) % 2 ? "各回复1点体力" : "各弃置一张牌"), (card, player2, target) => target != player2 && target.isIn() && target.countCards("h") == player2.countCards("h"))
			.set("ai", (target) => get.attitude(player, target))
			.forResult();
		if (!result.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, targets: result.targets };
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		player.logSkill("chashui_dingliu", target);
		const yang = ((player.storage.chashui_dingliu || 0) % 2) == 0;
		if (yang) {
			// ① 两人各弃置一张牌
			for (const current of [player, target]) {
				if (current.isIn() && current.countCards("h")) {
					await current.chooseToDiscard("定流：弃置一张牌", 1, "h", true);
				}
			}
		} else {
			// ② 两人各回复1点体力
			for (const current of [player, target]) {
				if (current.isIn() && current.isDamaged()) {
					await current.recover(1);
				}
			}
		}
		player.changeZhuanhuanji("chashui_dingliu");
		player.awakenSkill("chashui_dingliu", true);
	},
};

// —— 徐登&赵炳 · 生枝 ——
// 「重置你武将牌上的一个技能」按穿屋判定口径：getStockSkills(true, true) = 武将牌上的技能；
// 「重置」= refreshSkill（清 usable/round 计数 + restoreSkill 恢复限定消耗，jsrgcuifeng 无参同源）。
// 「若为此技能」=重置的是生枝自己 → 手牌数调整至体力值。
const chashui_shengzhi = {
	audio: 2,
	zhuanhuanji: true,
	mark: true,
	marktext: "☯",
	usable: 1,
	intro: {
		markcount: () => 0,
		content(storage) {
			return "转换技，每回合限一次，当一名角色的体力值" + ((storage || 0) % 2 ? "②增加后" : "①减少后") + "，你可以重置你武将牌上的一个技能的使用次数，若为此技能，你将手牌数调整至体力值。";
		},
	},
	trigger: { global: "changeHpAfter" },
	filter(event, player) {
		if (!player.isIn()) return false;
		// 阳态=体力值减少后；阴态=体力值增加后
		const yang = ((player.storage.chashui_shengzhi || 0) % 2) == 0;
		if (yang && event.changedHp >= 0) return false;
		if (!yang && event.changedHp <= 0) return false;
		// 武将牌上存在「已消耗状态」可重置的技能
		return lib.skill.chashui_shengzhi.getResettable(player).length > 0;
	},
	getResettable(player) {
		return game
			.expandSkills(player.getStockSkills(true, true))
			.filter((skill) => {
				const info = get.info(skill);
				if (!info) return false;
				if (player.awakenedSkills.includes(skill)) return true;
				if (info.usable !== void 0 && ((player.getStat("triggerSkill")[skill] || 0) > 0 || (player.getStat("skill")[skill] || 0) > 0)) return true;
				if (info.round && player.storage[skill + "_roundcount"]) return true;
				return false;
			})
			.toUniqued();
	},
	async cost(event, trigger, player) {
		const list = lib.skill.chashui_shengzhi.getResettable(player);
		if (!list.length) {
			event.result = { bool: false };
			return;
		}
		const res = await player
			.chooseButton(["生枝：重置你武将牌上的一个技能", [list.map((skill) => [skill, get.translation(skill)]), "textbutton"]], true)
			.set("ai", (button) => {
				// 重置限定技（复活）优先于清次数
				return player.awakenedSkills.includes(button.link) ? 10 : 5;
			})
			.forResult();
		if (!res.bool || !res.links?.length) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { skill: res.links[0] } };
	},
	async content(event, trigger, player) {
		const skill = event.cost_data.skill;
		player.logSkill("chashui_shengzhi");
		player.refreshSkill(skill);
		game.log(player, "重置了", "#g【" + get.translation(skill) + "】");
		// 「若为此技能，你将手牌数调整至体力值」
		if (skill == "chashui_shengzhi" && player.isIn()) {
			const diff = player.countCards("h") - player.hp;
			if (diff > 0) await player.chooseToDiscard("生枝：弃置" + diff + "张手牌", diff, "h", true);
			else if (diff < 0) await player.draw(-diff);
		}
		player.changeZhuanhuanji("chashui_shengzhi");
	},
};

// —— 徐登&赵炳 三个转换技的 dynamicTranslate（技能面板高亮当前态，呈现文档范本A/C）——
// 拾秘：三态（state 0/1/2 = ①小于②等于③大于），蓝高亮当前态
lib.dynamicTranslate.chashui_shimi = function (player) {
	const blue = (t) => `<span class="bluetext">${t}</span>`;
	const s = player?.storage?.chashui_shimi || 0;
	const clauses = ["①小于", "②等于", "③大于"];
	const line = clauses.map((c, i) => (i === s ? blue(c) : c)).join("");
	return "限定技，转换技，你可以将一张牌当任意一张基本牌或普通锦囊牌使用，且你以此法使用的牌在初始牌堆中的数量须" + line + "转化后的牌。";
};
// 定流：二态。yang(state 偶/0)=①弃置一张牌；yin(state 奇/1)=②回复1点体力
lib.dynamicTranslate.chashui_dingliu = function (player) {
	const blue = (t) => `<span class="bluetext">${t}</span>`;
	const fire = (t) => `<span class='firetext'>${t}</span>`;
	const yin = !!(player?.storage?.chashui_dingliu % 2);
	let one = "①弃置一张牌";
	let two = "②回复1点体力";
	if (yin) two = blue(two);
	else one = fire(one);
	return "限定技，转换技，当你摸牌或造成伤害后，你可以和一名手牌数与你相等的其他角色依次" + one + "；" + two + "。";
};
// 生枝：二态。yang(state 偶/0)=体力值①减少后；yin(state 奇/1)=体力值②增加后
lib.dynamicTranslate.chashui_shengzhi = function (player) {
	const blue = (t) => `<span class="bluetext">${t}</span>`;
	const fire = (t) => `<span class='firetext'>${t}</span>`;
	const yin = !!(player?.storage?.chashui_shengzhi % 2);
	let one = "①减少";
	let two = "②增加";
	if (yin) two = blue(two);
	else one = fire(one);
	return "转换技，每回合限一次，当一名角色的体力值" + one + two + "后，你可以重置你武将牌上的一个技能的使用次数，若为此技能，你将手牌数调整至体力值。";
};

// —— 蒋显 · 望擢 ——
// 「本轮你/其成为【杀】的目标时，其/你成为额外目标」：useCardToTarget 时点 push targets（讨护范本），
// 本轮判定用 storage 记轮号（不依赖 roundEnd 过期）。
const chashui_wangzhuo_link = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	// mark：被望擢联动的角色获得可见标记，显示本轮联动对象；本轮结束清除
	mark: true,
	marktext: "擢",
	intro: {
		name: "望擢",
		content(storage, player) {
			const data = player.storage.chashui_wangzhuo_data;
			if (!data || data.round != game.roundNumber) return "本轮望擢联动已失效。";
			const other = data.other === player ? data.me : data.other;
			const valid = other && other.isIn();
			return "本轮与" + (valid ? get.translation(other) : "（已离场）") + "望擢联动：你或对方成为【杀】目标时，另一方成为额外目标。";
		},
	},
	trigger: { target: "useCardToTarget", global: "roundStart" },
	filter(event, player, name) {
		// 宿主时机名是 filter 的第 3 个形参（AGENTS R7）；roundStart 事件没有 card
		if (name == "roundStart") {
			// 新一轮：清掉上一轮的联动数据与 mark
			const data = player.storage.chashui_wangzhuo_data;
			return !!data && data.round != game.roundNumber;
		}
		if (!event.card || get.name(event.card) != "sha") return false;
		const data = player.storage.chashui_wangzhuo_data;
		if (!data || data.round != game.roundNumber || !player.isIn()) return false;
		// 「你/其成为杀的目标时，其/你成为额外目标」：本次目标是对面才联动
		const other = data.other === player ? data.me : data.other;
		if (!other || !other.isIn()) return false;
		if ((event.getParent("useCard")?.targets || []).includes(other)) return false;
		return event.targets?.includes(player);
	},
	async content(event, trigger, player) {
		// content 里 event.name 是技能 id；判宿主时机用 trigger.name（AGENTS R7 / 契约检查）
		if (trigger.name == "roundStart") {
			delete player.storage.chashui_wangzhuo_data;
			player.unmarkSkill("chashui_wangzhuo_link");
			player.removeSkill("chashui_wangzhuo_link");
			return;
		}
		const data = player.storage.chashui_wangzhuo_data;
		const other = data.other === player ? data.me : data.other;
		const use = trigger.getParent("useCard");
		use.targets.push(other);
		game.log(other, "成为", trigger.card, "的额外目标");
	},
};

const chashui_wangzhuo = {
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filterTarget(card, player, target) {
		return target != player && target.isIn() && target.countCards("h") < player.countCards("h");
	},
	ai: {
		order: 7,
		result: {
			target(player, target) {
				return get.attitude(player, target) > 0 ? 1.5 : -0.5;
			},
		},
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		const num = player.countCards("h");
		const before = target.countCards("h");
		await target.drawTo(num);
		// 「若如此做」=实际摸了牌才建立本轮联动
		if (target.countCards("h") <= before || !player.isIn() || !target.isIn()) return;
		const data = { round: game.roundNumber, me: player, other: target };
		player.storage.chashui_wangzhuo_data = data;
		target.storage.chashui_wangzhuo_data = data;
		player.addSkill("chashui_wangzhuo_link");
		target.addSkill("chashui_wangzhuo_link");
		game.log(player, "和", target, "本轮互相成为对方成为", "#g【杀】", "目标时的额外目标");
	},
};

// —— 蒋显 · 宣降 ——
// 「每回合首次有角色需要使用【闪】而未使用牌时」= 杀结算后目标未出闪（useCardAfter 判定）。
// 「不能响应其他角色使用的牌」= 被选角色挂 debuff 子技，在其作为目标的结算子事件 Begin 时
// 置 directHit（potshishi/jsrgchengxu 的 directHit 口径）。
const chashui_xuanjiang_ban = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	// mark：被宣降选中的角色获得可见 debuff 标记（本回合不能响应其他角色使用的牌），持续到回合结束
	mark: true,
	marktext: "降",
	intro: {
		name: "宣降",
		content: "本回合你不能响应其他角色使用的牌。",
	},
	trigger: { target: "useCardToBegin" },
	filter(event, player) {
		// 「不能响应其他角色使用的牌」——自己使用的牌不拦
		return event.player != player;
	},
	async content(event, trigger, player) {
		trigger.directHit = true;
	},
};

const chashui_xuanjiang = {
	audio: 2,
	usable: 1,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		if (get.name(event.card) != "sha" || !player.isIn()) return false;
		// 「需要使用【闪】而未使用牌」——杀→闪是**使用**闪（chooseToUse 窗，standard.js:161-180 给该事件
		// set("respondTo",[杀使用者, 杀牌])），不是打出；查 useCard 历史（打出只记在 respond 历史）。
		// 用 respondTo 指向本杀来确认是"为响应本杀而使用闪"，对象/ID/牌面三重匹配防引用不等。
		return (event.targets || []).some((target) => {
			if (!target.isIn()) return false;
			const used = target.getHistory("useCard", (evt) => {
				if (!evt.respondTo) return false;
				const [src, card] = evt.respondTo;
				if (!card || src !== event.player) return false;
				if (card === event.card) return true;
				if (card.cardid && event.card.cardid && card.cardid === event.card.cardid) return true;
				return get.name(card, false) === get.name(event.card, false) && card.suit === event.card.suit && card.number === event.card.number;
			});
			return !used.length;
		});
	},
	logTarget: "targets",
	async cost(event, trigger, player) {
		const targets = (trigger.targets || []).filter((target) => target.isIn());
		if (!targets.length) {
			event.result = { bool: false };
			return;
		}
		const result = await player
			.chooseTarget("宣降：令任意名角色各摸一张牌，然后这些角色本回合不能响应其他角色使用的牌", [1, Infinity], (card, player2, target) => target.isIn())
			.set("ai", (target) => get.attitude(player, target) * 2)
			.forResult();
		if (!result.bool || !result.targets?.length) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, targets: result.targets };
	},
	async content(event, trigger, player) {
		for (const target of event.targets) {
			if (target.isIn()) {
				await target.draw(1);
				target.addTempSkill("chashui_xuanjiang_ban", "phaseAfter");
			}
		}
	},
};

// —— 徐光 · 兆运 ——
// 「令此牌于接下来的三个回合内其受到伤害后结算」照本扩何来挂起范式（maokuo_helai）：
// useCardToTargeted 时点给宿主 useCard 设 noOrdering + cancel（牌留处理区），
// 目标受伤后以原使用者名义重演 useCard（addCount:false + log:false）。
// 「致命伤害」= 重演结算后目标 hp<=0。
const chashui_zhaoyun_resume = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { global: ["damageAfter", "phaseBegin"] },
	filter(event, player) {
		const d = player.storage.chashui_zhaoyun_data;
		if (!d || !player.isIn()) return false;
		if (event.name == "phaseBegin") {
			// 「接下来的三个回合」：超过期限则作废
			return game.phaseNumber > d.deadline;
		}
		// 其受到伤害后结算
		return event.player == d.victim;
	},
	async content(event, trigger, player) {
		const d = player.storage.chashui_zhaoyun_data;
		delete player.storage.chashui_zhaoyun_data;
		// 无论结算还是逾期，都清掉被挂起角色身上的「兆」mark
		const clearMark = () => {
			const v = d.victim;
			if (v?.storage?.chashui_zhaoyun_left != null) {
				delete v.storage.chashui_zhaoyun_left;
				v.unmarkSkill("chashui_zhaoyun_mark");
				v.removeSkill("chashui_zhaoyun_mark");
			}
		};
		if (event.triggername == "phaseBegin") {
			// 逾期作废：处理区的牌弃置
			const cards = (d.cards || []).filter((card) => get.position(card, true) == "o");
			if (cards.length) await game.cardsDiscard(cards);
			clearMark();
			game.log(d.card, "的挂起结算逾期作废");
			return;
		}
		const cards = (d.cards || []).filter((card) => get.position(card, true) == "o");
		if (!cards.length || !d.user.isIn() || !d.victim.isIn()) {
			clearMark();
			return;
		}
		game.log(d.user, "的", d.card, "因", trigger.player, "受伤而开始结算");
		clearMark();
		await d.user.useCard(d.card, cards, [d.victim], "chashui_zhaoyun").set("addCount", false).set("log", false);
		// 「若你以此法造成致命伤害时，你回复1点体力」
		if (player.isIn() && d.victim.isIn() && d.victim.hp <= 0) {
			await player.recover(1);
		}
	},
};

const chashui_zhaoyun = {
	audio: 2,
	trigger: { player: "useCardToTargeted" },
	filter(event, player) {
		if (get.name(event.card) != "sha") return false;
		const use = event.getParent("useCard");
		if (!use || use.skill == "chashui_zhaoyun") return false;
		// 「指定唯一一名角色为目标后」
		return use.targets?.length == 1 && use.targets[0] == event.target && event.target?.isIn();
	},
	logTarget: "target",
	async cost(event, trigger, player) {
		const result = await player
			.chooseBool("兆运：是否令此牌于接下来的三个回合内" + get.translation(trigger.target) + "受到伤害后结算？")
			.set("ai", () => get.attitude(player, trigger.target) < 0 ? 1 : -1)
			.forResult();
		event.result = { bool: result.bool };
	},
	async content(event, trigger, player) {
		const use = trigger.getParent("useCard");
		// 挂起：牌留处理区，中止本次结算
		use.noOrdering = true;
		use.cancel();
		const victim = trigger.target;
		player.storage.chashui_zhaoyun_data = {
			card: use.card,
			cards: (use.cards || []).slice(0),
			user: use.player,
			victim: victim,
			// 当前回合之后 3 个回合内有效（game.phaseNumber 每回合 +1）
			deadline: game.phaseNumber + 3,
		};
		// 呈现：在被挂起的角色身上挂「兆」mark，markcount 从 3 起每回合 -1，归零/受伤结算后消失
		if (victim?.isIn()) {
			victim.storage.chashui_zhaoyun_left = 3;
			victim.addSkill("chashui_zhaoyun_mark");
			victim.markSkill("chashui_zhaoyun_mark");
			victim.updateMarks();
		}
		game.log(player, "令", use.card, "挂起，于", trigger.target, "受伤后结算");
	},
};

// 兆运 mark（挂在被挂起的角色上）：markcount = 剩余回合数（3 → 0）
const chashui_zhaoyun_mark = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	mark: true,
	marktext: "兆",
	intro: {
		name: "兆运",
		markcount(storage, player) {
			return Math.max(player.storage.chashui_zhaoyun_left || 0, 0);
		},
		content(storage, player) {
			return "兆运挂起中：剩余" + Math.max(player.storage.chashui_zhaoyun_left || 0, 0) + "个回合；若你于此期间受到伤害，则立即结算该牌。";
		},
	},
	trigger: { global: "phaseBegin" },
	filter(event, player) {
		return (player.storage.chashui_zhaoyun_left || 0) > 0;
	},
	async content(event, trigger, player) {
		player.storage.chashui_zhaoyun_left = (player.storage.chashui_zhaoyun_left || 0) - 1;
		if (player.storage.chashui_zhaoyun_left <= 0) {
			delete player.storage.chashui_zhaoyun_left;
			player.unmarkSkill("chashui_zhaoyun_mark");
			player.removeSkill("chashui_zhaoyun_mark");
			return;
		}
		player.updateMarks();
	},
	onremove(player) {
		delete player.storage.chashui_zhaoyun_left;
	},
};

// —— 徐光 · 移赏 ——
// 「当有角色回复体力时，你可以令其选择是否防止之」：recoverBegin 时点询问；
// 「下一张被使用的【桃】无效且其获得之」：useCardBefore 时点夺牌 + cancel（牌尚在使用者手中）。
const chashui_yishang_pend = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	// mark：挂在获得效果的角色身上（其下一张【桃】无效且由其获得）
	mark: true,
	marktext: "赏",
	intro: {
		name: "移赏",
		content: "下一张被使用的【桃】无效，且由你获得之。",
	},
	trigger: { global: "useCardBefore" },
	filter(event, player) {
		if (get.name(event.card) != "tao") return false;
		if (!player.storage.chashui_yishang_data) return false;
		// 多个角色同时持有移赏效果时，按座次只让最靠前的那个结算；其余保留
		const holders = game.filterPlayer((c) => c.isIn() && c.storage.chashui_yishang_data);
		holders.sortBySeat();
		return holders[0] === player;
	},
	async content(event, trigger, player) {
		const d = player.storage.chashui_yishang_data;
		delete player.storage.chashui_yishang_data;
		player.unmarkSkill("chashui_yishang_pend");
		player.removeSkill("chashui_yishang_pend");
		// content 的 event 是技能事件，牌在宿主 trigger 上（event.card 为 undefined）
		const card = trigger.card;
		if (!card) return;
		const owner = get.owner(card);
		if (card.cards?.length) {
			// 实体桃：夺走底牌再取消
			await player.gain(card.cards, "gain2");
		} else if (owner) {
			const cards = owner.getCards("he", (c) => c == card);
			if (cards.length) await player.gain(cards, "gain2");
		}
		trigger.cancel();
		game.log(player, "获得了", card, "，此牌无效");
	},
	onremove(player) {
		delete player.storage.chashui_yishang_data;
	},
};

const chashui_yishang = {
	audio: 2,
	trigger: { global: "recoverBegin" },
	filter(event, player) {
		if (!player.isIn()) return false;
		if (player.storage.chashui_yishang_round == game.roundNumber) return false;
		return event.player.isIn();
	},
	logTarget: "player",
	async cost(event, trigger, player) {
		const go = await player
			.chooseBool("移赏：是否令" + get.translation(trigger.player) + "选择是否防止本次回复？")
			.set("ai", () => get.attitude(player, trigger.player) < 0 ? 1 : -1)
			.forResult();
		if (!go.bool) {
			event.result = { bool: false };
			return;
		}
		const res = await trigger.player
			.chooseBool("移赏：是否防止本次回复？", "若防止，本局游戏下一张被使用的【桃】无效且你获得之")
			.set("ai", () => 1)
			.forResult();
		if (!res.bool) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { prevent: true } };
	},
	async content(event, trigger, player) {
		player.storage.chashui_yishang_round = game.roundNumber;
		trigger.cancel();
		// 效果挂在**获得效果的角色**（本次被防止回复者）身上，各自独立；多个角色并存时按座次结算
		const ben = trigger.player;
		ben.storage.chashui_yishang_data = { owner: player };
		ben.addSkill("chashui_yishang_pend");
		ben.markSkill("chashui_yishang_pend");
		game.log(ben, "防止了本次回复，其下一张【桃】将无效且由", ben, "获得");
	},
};

// —— 贾午 · 窃香 ——
// 「出现了伤害牌」的判定集 = 弃置的花色牌 + 目标获得的牌；「恰出现一张♣牌」→ 本阶段结束时
// 可对其发动窥帘（player.when(阶段名+"After") 一次性监听）。
const chashui_kuilian_execute = (player, target, free) => {
	// 窥帘执行体（cost/content/窃香联动共用）：返回 Promise<是否执行>
	return (async () => {
		const diff = player.countCards("h") - target.countCards("h");
		const roundData = player.storage.chashui_kuilian_round || { round: game.roundNumber, count: 0 };
		const usedCount = roundData.round == game.roundNumber ? roundData.count : 0;
		// 选项可用性由差额决定（用户拍板）：观看=已相等；自用一张=恰多1；摸N张=恰少N（N=本轮发动次数，含本次）
		const options = [];
		if (diff == 0) options.push("观看其手牌");
		if (diff == 1 && player.countCards("h") > 0) options.push("使用一张以你自己为目标的牌");
		if (diff == -(usedCount + 1)) options.push("摸" + (usedCount + 1) + "张牌");
		if (!options.length) return false;
		const prompt = free ? "窥帘：是否对" + get.translation(target) + "发动？" : "窥帘：请选择一项（执行后你与其手牌数相等）";
		const choice = await player
			.chooseControl(options, free)
			.set("prompt", prompt)
			.set("prompt2", "当前你" + player.countCards("h") + "张、其" + target.countCards("h") + "张")
			.set("ai", () => 0)
			.forResult();
		if (!choice || !choice.control) return false;
		if (choice.control == "观看其手牌") {
			await player.viewCards("窥帘：观看" + get.translation(target) + "的手牌", target.getCards("h"));
		} else if (choice.control == "使用一张以你自己为目标的牌") {
			const useRes = await player.chooseToUse(function (card, player2, event2) {
				return lib.filter.filterCard.apply(this, arguments);
			}, "窥帘：使用一张以你自己为目标的牌")
				.set("filterTarget", (card, player2, target2) => target2 == player2)
				.set("targetRequired", true)
				.forResult();
			// 取消 = 本次窥帘未执行（不计发动次数）
			if (!useRes || !useRes.bool) return false;
		} else {
			await player.draw(usedCount + 1);
		}
		roundData.count = usedCount + 1;
		roundData.round = game.roundNumber;
		player.storage.chashui_kuilian_round = roundData;
		return true;
	})();
};

const chashui_kuilian_extra = {
	charlotte: true,
	forced: true,
	popup: false,
	trigger: { player: "phaseAfter" },
	filter(event, player) {
		const d = player.storage.chashui_kuilian_extra;
		return d && d.target?.isIn() && player.isIn();
	},
	async content(event, trigger, player) {
		const d = player.storage.chashui_kuilian_extra;
		delete player.storage.chashui_kuilian_extra;
		await lib.chashuiKuilianExecute(player, d.target, true);
	},
};

// 窥帘触发技本体（每轮限三次，其他角色的结束阶段；选项可用性由差额决定）
const chashui_kuilian = {
	audio: 2,
	trigger: { global: "phaseJieshuBegin" },
	filter(event, player) {
		if (event.player == player || !event.player.isIn() || !player.isIn()) return false;
		const d = player.storage.chashui_kuilian_round;
		const used = d && d.round == game.roundNumber ? d.count : 0;
		if (used >= 3) return false;
		const diff = player.countCards("h") - event.player.countCards("h");
		if (diff == 0) return true;
		if (diff == 1 && player.countCards("h") > 0 && player.getCards("h").some((card) => player.canUse(card, player, false, true))) return true;
		if (diff == -(used + 1)) return true;
		return false;
	},
	logTarget: "player",
	async cost(event, trigger, player) {
		const target = trigger.player;
		const d = player.storage.chashui_kuilian_round;
		const used = d && d.round == game.roundNumber ? d.count : 0;
		const diff = player.countCards("h") - target.countCards("h");
		const options = [];
		if (diff == 0) options.push("观看其手牌");
		if (diff == 1 && player.countCards("h") > 0) options.push("使用一张以你自己为目标的牌");
		if (diff == -(used + 1)) options.push("摸" + (used + 1) + "张牌");
		if (!options.length) {
			event.result = { bool: false };
			return;
		}
		const choice = await player
			.chooseControl(options)
			.set("prompt", "窥帘：请选择一项（执行后你与其手牌数相等）")
			.set("prompt2", "当前你" + player.countCards("h") + "张、" + get.translation(target) + target.countCards("h") + "张")
			.set("ai", () => 0)
			.forResult();
		if (!choice?.control) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { choice: choice.control, count: used + 1 } };
	},
	async content(event, trigger, player) {
		const target = trigger.player;
		const choice = event.cost_data.choice;
		let done = true;
		if (choice == "观看其手牌") {
			await player.viewCards("窥帘：观看" + get.translation(target) + "的手牌", target.getCards("h"));
		} else if (choice == "使用一张以你自己为目标的牌") {
			const useRes = await player.chooseToUse(function (card, player2, event2) {
				return lib.filter.filterCard.apply(this, arguments);
			}, "窥帘：使用一张以你自己为目标的牌")
				.set("filterTarget", (card, player2, target2) => target2 == player2)
				.set("targetRequired", true)
				.forResult();
			if (!useRes || !useRes.bool) done = false;
		} else {
			await player.draw(event.cost_data.count);
		}
		// 发动计数（选择使用牌后取消则本次不计数）
		if (done) {
			const d = player.storage.chashui_kuilian_round;
			const used = d && d.round == game.roundNumber ? d.count : 0;
			player.storage.chashui_kuilian_round = { round: game.roundNumber, count: used + 1 };
		}
	},
};

const chashui_qiexiang = {
	audio: 2,
	trigger: { player: "useCardToTargeted" },
	filter(event, player) {
		if (get.type(event.card) != "basic") return false;
		const use = event.getParent("useCard");
		if (!use || use.skill == "chashui_qiexiang") return false;
		return use.targets?.length == 1 && use.targets[0] == event.target && event.target?.isIn();
	},
	logTarget: "target",
	async cost(event, trigger, player) {
		const result = await player
			.chooseControl(["红桃", "方片", "黑桃", "梅花"])
			.set("prompt", "窃香：指定一种花色（若" + get.translation(trigger.target) + "有此花色的手牌，其弃置之并获得本回合进入弃牌堆中的一张牌）")
			.set("ai", () => {
				const target = trigger.target;
				// 选其手牌最多的花色（有流程收益）
				const counts = {};
				for (const card of target.getCards("h")) {
					const s = get.suit(card, target);
					counts[s] = (counts[s] || 0) + 1;
				}
				const map = { "红桃": "heart", "方片": "diamond", "黑桃": "spade", "梅花": "club" };
				return Object.keys(map).sort((a, b) => (counts[map[b]] || 0) - (counts[map[a]] || 0))[0];
			})
			.forResult();
		if (!result || result.index == undefined) {
			event.result = { bool: false };
			return;
		}
		event.result = { bool: true, cost_data: { suit: ["heart", "diamond", "spade", "club"][result.index] } };
	},
	async content(event, trigger, player) {
		const target = trigger.target;
		const suit = event.cost_data.suit;
		const flowCards = [];
		const suitCards = target.getCards("h", (card) => get.suit(card, target) == suit);
		if (suitCards.length) {
			// 其弃置之（不含刚获得的：先快照本回合弃牌堆）
			const pool = lib.getTurnDiscardCards().filter((card) => get.position(card, true) == "d");
			await target.discard(suitCards);
			flowCards.addArray(suitCards);
			// 其获得本回合进入弃牌堆中的一张牌
			if (pool.length) {
				const res = await target
					.chooseButton(["窃香：获得本回合进入弃牌堆中的一张牌", [pool, "card"]], true)
					.set("ai", (button) => get.value(button.link, target))
					.forResult();
				if (res.bool && res.links?.length) {
					const card = res.links[0];
					await target.gain([card], "gain2");
					flowCards.push(card);
				}
			}
		}
		if (!player.isIn()) return;
		// 「若以上流程出现了伤害牌，你获得之并令此技能本轮失效」
		const damageCards = flowCards.filter((card) => get.tag(card, "damage"));
		if (damageCards.length) {
			for (const card of damageCards) {
				// 被弃置的进弃牌堆、被获得的在目标手牌——两种位置都夺走
				if (get.position(card, true) == "d" || get.owner(card) == target) {
					await player.gain([card], "gain2");
				}
			}
			player.addTempSkill("chashui_qiexiang_disabled", "roundEnd");
			// 「本轮失效」= 描述变灰：disableSkill + 独立载体（不能进 group，disableSkill 会级联）
			// roundEnd 由 addTempSkill 到期移除载体，onremove 里 enableSkill 恢复
			player.disableSkill("chashui_qiexiang_disabled", "chashui_qiexiang");
			game.log(player, "获得了流程中出现的伤害牌，", "#g【窃香】", "本轮失效");
		}
		// 「恰出现一张♣牌，你可以于本阶段结束时对其发动“窥帘”」
		const clubs = flowCards.filter((card) => get.suit(card) == "club");
		if (clubs.length == 1) {
			// 当前阶段名（沿父链找最近的 phaseXxx 宿主）
			let evt = get.event().getParent();
			let phaseName = "phase";
			while (evt) {
				if (/^phase/.test(evt.name) && evt.name != "phase") {
					phaseName = evt.name;
					break;
				}
				evt = evt.parent;
			}
			player.storage.chashui_kuilian_extra = { target: target };
			player.addTempSkill("chashui_kuilian_extra", phaseName + "After");
			game.log(player, "将于本阶段结束时可以对", target, "发动", "#g【窥帘】");
		}
	},
};

// 窃香失效载体：不用 mark（描述变灰，而不是加标记）
const chashui_qiexiang_disabled = {
	charlotte: true,
	onremove(player) {
		player.enableSkill("chashui_qiexiang_disabled");
	},
};

// —— 阮瞻 · 通旨 ——
// 「点数不相连的牌因此相连」：本次进入弃牌堆的牌补上了某连续点数段的断点
// （段内存在「其牌全部来自本次」的点数）。「获得点数相连的所有牌」=该段的全部牌。
// 通旨与既有「通知」chashui_tongzhi 撞名 → 阮瞻〖通旨〗用 chashui_tongzhu
lib.chashuiTongzhuSegments = (newCards) => {
	// 范围限「本回合的弃牌堆」：game.getGlobalHistory(key) 无 filter 时读 _status.globalHistory 最后一页 = 本回合
	// （game/index.js:1120-1125）；且只保留当前仍在弃牌堆(d)的牌。
	const pile = [];
	for (const evt of game.getGlobalHistory("cardMove")) {
		for (const card of evt.cards || []) {
			if (card && get.position(card, true) == "d" && !pile.includes(card)) pile.push(card);
		}
	}
	const newNums = new Set(newCards.filter((card) => get.position(card, true) == "d").map((card) => get.number(card)));
	if (!newNums.size) return [];
	const allNums = new Set(pile.map((card) => get.number(card)));
	const gains = [];
	for (const n of newNums) {
		let lo = n;
		let hi = n;
		while (allNums.has(lo - 1)) lo--;
		while (allNums.has(hi + 1)) hi++;
		// 段内存在「其牌全部来自本次」的点数 = 因此相连
		let newly = false;
		for (let p = lo; p <= hi; p++) {
			if (!newNums.has(p)) continue;
			const sameNum = pile.filter((card) => get.number(card) == p);
			if (sameNum.length && sameNum.every((card) => newCards.includes(card))) newly = true;
		}
		if (!newly) continue;
		for (const card of pile) {
			const num = get.number(card);
			if (num >= lo && num <= hi && !gains.includes(card)) gains.push(card);
		}
	}
	return gains;
};

const chashui_tongzhu = {
	audio: 2,
	usable: 1,
	trigger: {
		player: ["loseAfter", "discardAfter"],
		global: ["equipAfter", "addJudgeAfter", "loseAsyncAfter", "addToExpansionAfter", "cardsDiscardAfter"],
	},
	filter(event, player) {
		if (!player.isIn()) return false;
		const newCards = lib.skill.chashui_tongzhu.getNewCards(event, player);
		if (!newCards.length) return false;
		return lib.chashuiTongzhuSegments(newCards).length > 0;
	},
	getNewCards(event, player) {
		const cards = [];
		if (event.name == "loseAsync") {
			const getl = event.getl?.[player.playerid];
			if (getl?.cards) cards.addArray(getl.cards);
		} else if (event.name == "cardsDiscard") {
			if (event.getParent("useCard")?.player == player && Array.isArray(event.cards)) cards.addArray(event.cards);
		} else if (Array.isArray(event.cards)) {
			cards.addArray(event.cards);
		}
		return cards.filter((card) => card && get.position(card, true) == "d");
	},
	async cost(event, trigger, player) {
		const newCards = lib.skill.chashui_tongzhu.getNewCards(trigger, player);
		const gains = lib.chashuiTongzhuSegments(newCards);
		if (!gains.length) {
			event.result = { bool: false };
			return;
		}
		const result = await player
			.chooseBool("通旨：是否获得弃牌堆中点数相连的" + gains.length + "张牌？")
			.set("ai", () => gains.reduce((acc, card) => acc + get.value(card), 0) > 0 ? 1 : -1)
			.forResult();
		event.result = { bool: result.bool, cost_data: { gains: gains } };
	},
	async content(event, trigger, player) {
		const gains = (event.cost_data.gains || []).filter((card) => get.position(card, true) == "d");
		if (gains.length && player.isIn()) await player.gain(gains, "gain2");
	},
};

// —— 阮瞻 · 鬼辩 ——
// 响应窗目标牌 = event.respondTo[1]（card/standard.js:180 同款）；
// 「黑色锦囊牌对你造成的伤害」在 damageBegin3 绝对改值（sasami 式）。
const chashui_guibian = {
	audio: 2,
	// 无懈可击是「使用」不是「打出」→ 必须在 chooseToUse 窗开；chooseToRespond 兼容打出类响应
	enable: ["chooseToUse", "chooseToRespond"],
	filter(event, player) {
		const respondTo = event.respondTo;
		if (!Array.isArray(respondTo) || !respondTo[1]) return false;
		const card = respondTo[1];
		if (get.color(card, respondTo[0]) != "black" || get.type(card) != "trick") return false;
		return player.countCards("he") > 0;
	},
	// 印牌技完整：无懈窗只认 hiddenCard（/hiddenWuxie/静态 viewAs.name），缺它无懈窗开不出
	hiddenCard(player, name) {
		if (name != "wuxie") return false;
		return player.countCards("he") > 0;
	},
	filterCard(card, player) {
		return get.position(card) == "h" || get.position(card) == "e";
	},
	selectCard: [1, Infinity],
	viewAs: { name: "wuxie", isCard: true },
	viewAsFilter(player) {
		return player.countCards("he") > 0;
	},
	prompt() {
		const evt = get.event();
		const card = evt.respondTo?.[1];
		return "鬼辩：将任意张点数和大于" + (card ? get.translation(card) + "（点数" + (get.number(card) || 0) + "）的牌" : "") + "当【无懈可击】抵消之";
	},
	check(card) {
		// 引导 AI 选出点数和超过目标牌的组合（响应窗无 filterOk 消费点，组合校验靠 AI 与提示）
		const evt = get.event();
		const card2 = evt.respondTo?.[1];
		if (!card2) return 8 - get.value(card);
		const sum = ui.selected.cards.reduce((acc, c) => acc + (get.number(c) || 0), 0) + (get.number(card) || 0);
		if (sum <= (get.number(card2) || 0)) return -5;
		return 8 - get.value(card);
	},
	ai: {
		order: 12,
		wuxie: true,
		skillTagFilter(player, tag, arg) {
			if (tag != "wuxie") return false;
			// 目标牌须为黑色锦囊
			const card = arg?.card;
			if (!card || get.color(card) != "black" || get.type(card) != "trick") return false;
			return player.countCards("he") > 0;
		},
	},
	// 素材点数和 > 目标牌点数：响应窗无 filterOk 消费点（content.js 仅 chooseToUse 4650 一处），
	// 组合约束靠 prompt 提示 + ai.check 引导，AI 选不足时会因负分继续挑牌
};

const chashui_guibian_count = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		return event.skill && event.skill.startsWith("chashui_guibian");
	},
	async content(event, trigger, player) {
		let d = player.storage.chashui_guibian_count;
		if (!d || d.round != game.roundNumber) {
			d = { round: game.roundNumber, num: 0 };
			player.storage.chashui_guibian_count = d;
		}
		d.num++;
	},
};

const chashui_guibian_damage = {
	charlotte: true,
	forced: true,
	silent: true,
	popup: false,
	trigger: { player: "damageBegin3" },
	filter(event, player) {
		const card = event.card;
		if (!card) return false;
		if (get.color(card, event.source) != "black" || get.type(card) != "trick") return false;
		const d = player.storage.chashui_guibian_count;
		return d && d.round == game.roundNumber && d.num > 0;
	},
	async content(event, trigger, player) {
		const d = player.storage.chashui_guibian_count;
		trigger.num = d.num;
		game.log(player, "受到黑色锦囊牌的伤害改为", d.num);
	},
};

export const skills = {
	chashui_qiuqiu,
	chashui_qiuqiu_delay,
	chashui_qiuqiu_end,
	chashui_xuanfeng,
	chashui_xuanfeng_use,
	chashui_xuanfeng_active,
	chashui_xuanfeng_active_judge,
	chashui_dianjie,
	chashui_dianjie_trigger,
	chashui_dianjie_disabled,
	chashui_xiaobai,
	chashui_xiaobai_reset,
	chashui_qiwei,
	chashui_wangjian,
	chashui_sixiang,
	chashui_sixiang_use,
	chashui_souliu,
	chashui_souliu_clear,
	chashui_shichong,
	chashui_fangzi,
	chashui_fangzi_swap,
	chashui_fujie,
	chashui_xuzhong,
	chashui_xuzhong_disabled,
	chashui_dengjie,
	chashui_tizheng,
	chashui_tizheng_fangquan,
	chashui_tizheng_fq_rider,
	chashui_tizheng_used,
	chashui_lianxiu,
	chashui_lianxiu_lose,
	chashui_lianxiu_end,
	chashui_lianxiu_clear,
	chashui_lianxiu_free,
	chashui_jiangdao,
	chashui_zhengyin,
	chashui_zhengyin_clear,
	chashui_chuaicun,
	chashui_liaoge,
	chashui_guijian,
	chashui_guijian_used,
	chashui_guijian_debuff,
	chashui_lianhe,
	chashui_lianhe_clear,
	chashui_xifeng,
	chashui_chengquan,
	chashui_roujia,
	chashui_suizuo,
	chashui_suizuo_round,
	chashui_suizuo_turn,
	chashui_shanmeng,
	chashui_mengsong,
	chashui_xiangqian,
	chashui_guye,
	chashui_shanji,
	chashui_debao,
	chashui_chizong,
	chashui_chizong_clear,
	chashui_yihuo,
	chashui_woluan,
	chashui_woluan_effect,
	chashui_woluan_range,
	chashui_raoguo,
	chashui_shiwan,
	chashui_xiluan,
	chashui_xiluan_damage,
	chashui_tongzhi,
	chashui_tongzhi_mark,
	chashui_yishu,
	chashui_yishu_damage,
	chashui_kuitian,
	chashui_kuitian_use,
	chashui_kuitian_reset,
	chashui_shixiang,
	chashui_shixiang_buff,
	chashui_jiyong,
	chashui_chenglie,
	chashui_qiaozhu,
	chashui_qiaozhu_o,
	chashui_jingnu,
	chashui_jingnu_buff,
	chashui_jianju,
	chashui_jianju_on,
	chashui_jianju_loseall,
	chashui_jianju_loseall_duel,
	chashui_jianju_loseall_clear,
	chashui_yingfa,
	chashui_zhiyue,
	chashui_nianzhi,
	chashui_nianzhi_ban,
	chashui_qisang,
	chashui_pingyue,
	chashui_pingyue_used,
	chashui_pingyue_down,
	chashui_anjing,
	chashui_anjing_range,
	chashui_anjing_record,
	chashui_anjing_use,
	chashui_zhuojun,
	chashui_huize,
	chashui_chouren,
	chashui_xunde,
	chashui_lizang,
	chashui_lianfang,
	chashui_ranjiang,
	chashui_zaobing,
	chashui_zaobing_back,
	chashui_yuanbo,
	chashui_pianpian,
	chashui_juejue,
	chashui_juejue_num,
	chashui_juejue_clear,
	chashui_feijun,
	chashui_hongcui,
	chashui_zaide,
	chashui_zaide_clear,
	chashui_juzheng,
	chashui_juzheng_end,
	chashui_sheniang,
	chashui_fenpan,
	chashui_dangkou,
	chashui_dangkou_draw,
	chashui_zhujing,
	chashui_zhujing_other,
	chashui_zhujing_clear,
	chashui_zhuwo,
	chashui_zhuwo_record,
	chashui_weibing,
	chashui_hanlv,
	chashui_hanlv_target,
	chashui_hanlv_mark,
	chashui_zuojing,
	chashui_zuojing_again,
	chashui_fenwu,
	chashui_zhuanfu,
	chashui_zhuanfu_start,
	chashui_tengchao,
	chashui_tengchao_o,
	chashui_tengchao_gain,
	chashui_andong,
	chashui_andong_damage,
	chashui_yingshi,
	chashui_yingshi_gain,
	chashui_yingshi_use,
	chashui_yingshi_lose,
	chashui_lanxin,
	chashui_lanxin_damage,
	chashui_lanxin_clear,
	chashui_kunyi,
	chashui_benhan,
	chashui_benhan_clear,
	chashui_shushen,
	chashui_shushen_watch,
	chashui_xiuren,
	chashui_zhenqu,
	chashui_chuangxun,
	chashui_yanzhu,
	chashui_yanzhu_mark,
	chashui_yanzhu_gain,
	chashui_yanzhu_done,
	chashui_xingxue,
	chashui_xingxue_clear,
	chashui_zhaofu,
	chashui_zhaofu_eff,
	chashui_zhaofu_mount,
	chashui_zhaofu_global,
	chashui_tonglun,
	chashui_yinhe,
	chashui_jiexin,
	chashui_fenyuan,
	chashui_fenyuan_appear,
	chashui_fenyuan_clear,
	chashui_hongkuang,
	chashui_jianzhi,
	chashui_jianzhi_ban,
	chashui_jianzhi_same,
	chashui_bingxin,
	chashui_deqing,
	chashui_duzhi_count,
	chashui_duzhi,
	chashui_nihui,
	chashui_liutan,
	chashui_liutan_disabled,
	chashui_jindui,
	chashui_linrong,
	chashui_wenyi,
	chashui_kuipan,
	chashui_hejian,
	chashui_youse,
	chashui_youse_eff,
	chashui_lieyi_watch,
	chashui_lieyi,
	chashui_xuanfa,
	chashui_xuanfa_use,
	chashui_xianmo,
	chashui_rongbi,
	chashui_rongbi_respond,
	chashui_rongbi_mark,
	chashui_rongbi_ban,
	chashui_qiudui,
	chashui_qiudui_a,
	chashui_qiudui_eff,
	chashui_koushou,
	chashui_zhenge,
	chashui_jiexinq,
	chashui_shengmeng,
	chashui_shengmeng_link,
	chashui_xunbie,
	chashui_miaoshu,
	chashui_xinghuan_record,
	chashui_xinghuan,
	chashui_xinghuan_yb,
	chashui_shimi,
	chashui_dingliu,
	chashui_shengzhi,
	chashui_wangzhuo_link,
	chashui_wangzhuo,
	chashui_xuanjiang_ban,
	chashui_xuanjiang,
	chashui_zhaoyun_resume,
	chashui_zhaoyun_mark,
	chashui_zhaoyun,
	chashui_yishang_pend,
	chashui_yishang,
	chashui_kuilian_extra,
	chashui_kuilian,
	chashui_qiexiang,
	chashui_qiexiang_disabled,
	chashui_tongzhu,
	chashui_guibian,
	chashui_guibian_count,
	chashui_guibian_damage,
};

// 所有 defineSkill plan 的产物统一并入导出表 —— 不靠人手把 30 个 plan 的每个 sub 逐个列进来。
// 为什么必须自动并入：工厂在加载期把 group 的 key 改写成 `<父id>_<key>`（如 `use` → `chashui_xuanfeng_use`），
// 所以「漏注册某个 sub」在源码里看不出来、静态检查也看不见；而引擎的 disableSkill 会沿 group 递归
// 读 `lib.skill[skills].group`（noname/library/element/player.js:11267-11269），悬空的 group 成员会在
// awakenSkill / 技能失效那一刻抛 `Cannot read properties of undefined (reading 'group')`
// （悬锋 2026-11-13 实测崩在这里：sub.clear 没被列进导出表）。
const chashuiPlans = [
	chashui_jianjuPlan,
	chashui_pingyuePlan,
	chashui_anjingPlan,
	chashui_zaobingPlan,
	chashui_juejuePlan,
	chashui_zaidePlan,
	chashui_dangkouPlan,
	chashui_zhuwoPlan,
	chashui_hanlvPlan,
	chashui_zhuanfuPlan,
	chashui_lianhePlan,
	chashui_suizuoPlan,
	chashui_yishuPlan,
	chashui_kuitianPlan,
	chashui_qiuqiuPlan,
	chashui_xuanfengPlan,
	chashui_dianjiePlan,
	xiaobaiPlan,
	chashui_sixiangPlan,
	chashui_souliuPlan,
	chashui_fangziPlan,
	chashui_lianxiuPlan,
	chashui_zhengyinPlan,
	chashui_andongPlan,
	chashui_yingshiPlan,
	chashui_lanxinPlan,
	chashui_benhanPlan,
	yanzhuPlan,
	chashui_xingxuePlan,
	chashui_fenyuanPlan,
];
for (const plan of chashuiPlans) Object.assign(skills, plan.skills);
// 并入之后再自查一遍：plan 的每个产物都必须真的进了导出表（防止以后有人先在字面量里写同 id 又被覆盖）。
for (const plan of chashuiPlans) {
	for (const id of Object.keys(plan.skills)) {
		if (!skills[id]) throw new Error(`[chashui] defineSkill 产物 ${id} 没有进导出表`);
	}
}

// ===== StepCompiler 可见性：编译后的回调（content/cost/precontent/onuse）里只能用引擎注入的名字，
// 模块作用域的函数/import 全部丢失，所以这里统一挂到 lib 上，回调里写 lib.xxx。
lib.getZhuojunPair = getZhuojunPair;
lib.getShortestPath = getShortestPath;
lib.rewriteExpansion = rewriteExpansion;
lib.chashuiSuizuoAdd = chashuiSuizuoAdd;
lib.chashuiDengjieStep = chashuiDengjieStep;
lib.chashuiKuilianExecute = chashui_kuilian_execute;
lib.getTurnDiscardCards = getTurnDiscardCards;
