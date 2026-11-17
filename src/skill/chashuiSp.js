/**
 * 茶水贤设 · 晏（`tea_ex_sp`）技能定义
 *
 * 原型：`G:/FreeKill-release/packages/wild_collection/pkg/tea_ex_sp/skills/*.lua`（规则语义权威）
 * 中文描述：`荒海拾录-茶水贤设武将技能表.txt` 第 594-653 行
 *
 * 本文件按「模具」写法组织（`mold/define.js` 的 `defineSkill`）：
 *   - 子技能写父对象的 `sub` 里，挂载写 `group`（开局常驻）/ `grant`（运行时 addSkill 授予）
 *   - 结构问题在**注册那一刻**抛错：group 引用了不存在的 sub、sub 没人引用、mark 缺 intro、
 *     direct/forced 与 cost 共存、addTempSkill 的 expire 撞自己触发时机、字段名拼错
 *   - 翻译仍写在 `src/translate/chashui.js`（`keepTranslate: true`，与本文件既有 71 个技能一致；
 *     工厂侧的 translate 生成目前没有接线，`mountSkills` 未被扩展调用）
 *
 * ⚠️ 本文件必须显式 import `game/get/lib/ui/_status`：content/cost 里的这些名字在引擎里由
 * StepCompiler 的 topVars 注入，模块作用域不 import 就是 ReferenceError。
 * ⚠️ content/cost/precontent 会被 StepCompiler 重新编译，**模块作用域的函数会丢失** ⇒
 * 回调里一律写 `lib.xxx`（本文件末尾统一挂载）。
 */
import { game, get, lib, ui, _status } from "noname";
import { defineSkill } from "../../../../技能工作流/mold/define.js";

// ============================================================================
// 通用小工具
// ============================================================================

/**
 * 本回合进入过弃牌堆、且此刻仍在弃牌堆里的牌。
 *
 * 依据：`game.getGlobalHistory("cardMove", filter)` 是**本回合**作用域；
 * `cardsDiscard` 是「置入弃牌堆」事件（原生 `jsrgrangjie`，`character/jsrg.js:10255` 用同一套写法）。
 * 只取此刻仍在弃牌堆的牌 —— 已经被人拿走的牌不可能再被「获得」。
 *
 * @returns {Card[]}
 */
const chashuiTurnDiscardCards = () => {
	const pile = Array.from(ui.discardPile.childNodes);
	/** @type {Card[]} */
	const result = [];
	const history = game.getGlobalHistory("cardMove", (evt) => {
		if (evt.name === "lose") return evt.position === ui.discardPile;
		return evt.name === "cardsDiscard";
	});
	for (let i = history.length - 1; i >= 0; i--) {
		const cards = (history[i].cards || []).filter((card) => pile.includes(card) && !result.includes(card));
		if (cards.length) result.addArray(cards);
	}
	return result;
};
lib.chashuiTurnDiscardCards = chashuiTurnDiscardCards;

// ============================================================================
// 祖郎 · 至殆 / 阴图
// ============================================================================

/**
 * 至殆（祖郎）
 *
 * 描述：出牌阶段限一次，你可以摸一张牌并重复此流程直到手牌颜色不唯一，然后展示所有手牌，
 *       若红色牌数不大于/不小于黑色牌数，此阶段你可以将红色/黑色牌当【杀】/【酒】使用。
 *
 * 语义（`zhidai_active.lua` + `zhidai.lua`）：
 *   - 摸 1 → 循环：若「手牌中有一张颜色与第一张不同」则停，否则再摸 1（lua 上限 100 次防死循环）
 *   - 展示所有手牌后统计红/黑：`红 <= 黑` ⇒ 开「红→杀」；`红 >= 黑` ⇒ 开「黑→酒」
 *     （相等时两条都开）
 *   - 转换窗口是**本阶段**（lua 用 Phase 的 addCleaner 清掉）
 */
const zhidaiPlan = defineSkill({
	id: "chashui_zhidai",
	keepTranslate: true,
	audio: 2,
	enable: "phaseUse",
	usable: 1,
	filter(event, player) {
		return true;
	},
	mark: true,
	marktext: "殆",
	intro: {
		name: "至殆",
		content(storage, player) {
			const colors = player.storage.chashui_zhidai_colors || [];
			if (!colors.length) return "<li>本阶段没有可用的转化（尚未发动或颜色条件不满足）";
			const list = [];
			if (colors.includes("red")) list.push("<span style='color:#ff0000'>红色牌 → 【杀】</span>");
			if (colors.includes("black")) list.push("<span style='color:#000000'>黑色牌 → 【酒】</span>");
			return "<li>本阶段可用：" + list.join("、");
		},
	},
	onremove: true,
	async content(event, trigger, player) {
		await player.draw(1);
		// 「摸一张牌并重复此流程直到手牌颜色不唯一」：手牌里出现两种颜色就停。
		// 上限 100 次只是防死循环（牌堆见底时会反复洗牌），与原型 for i=1,100 一致。
		for (let i = 0; i < 100; i++) {
			const hand = player.getCards("h");
			if (hand.length) {
				const color = get.color(hand[0], false);
				if (hand.some((card) => get.color(card, false) !== color)) break;
			}
			await player.draw(1);
		}
		await player.showCards(player.getCards("h"), "至殆：展示所有手牌");
		const red = player.countCards("h", (card) => get.color(card, false) === "red");
		const black = player.countCards("h", (card) => get.color(card, false) === "black");
		const colors = [];
		if (red <= black) colors.push("red");
		if (red >= black) colors.push("black");
		if (!colors.length) return;
		player.storage.chashui_zhidai_colors = colors;
		player.addTempSkill("chashui_zhidai_use", "phaseUseAfter");
		player.markSkill("chashui_zhidai");
	},
	ai: {
		order: 5,
		result: {
			player(player) {
				return 1 + player.countCards("h", (card) => get.color(card, false) === "red");
			},
		},
	},
	sub: {
		/** 转换窗口：本阶段内把红牌当【杀】、黑牌当【酒】（哪一条开放由父技能的 storage 决定） */
		use: {
			audio: false,
			enable: ["chooseToUse"],
			position: "he",
			filterCard(card, player) {
				const colors = player.storage.chashui_zhidai_colors || [];
				const color = get.color(card, false);
				if (color === "red") return colors.includes("red");
				if (color === "black") return colors.includes("black");
				return false;
			},
			// 技能级预检：按钮只在本窗口真能印出【杀】/【酒】、且手上有对应颜色的牌时出现。
			// 不写这个 filter 会怎样：`filterEnable`（noname/library/index.js:10590-10664）只检查
			// enable 与「静态 viewAs 的牌名」，**函数式 viewAs 那一整段被跳过**
			// （`typeof info.viewAs !== "function"` 才进牌名校验）⇒ 按钮在每个 chooseToUse 窗
			// （出牌阶段/濒死求桃/借刀…）都会冒出来，且没有同色牌也点得到。
			filter(event, player) {
				if (event.skill == "chashui_zhidai_use" || event._skill == "chashui_zhidai_use") return true;
				if (typeof event.filterCard != "function") return false;
				const colors = player.storage.chashui_zhidai_colors || [];
				if (!colors.length) return false;
				for (const [color, name] of [
					["red", "sha"],
					["black", "jiu"],
				]) {
					if (!colors.includes(color)) continue;
					if (!player.countCards("he", (card) => get.color(card, false) === color)) continue;
					if (event.filterCard({ name, isCard: true }, player, event)) return true;
				}
				return false;
			},
			// 开窗预检通行证：借刀/决斗等「需要使用【杀】」的窗口靠 hasSha 决定要不要开，
			// 它读 `hasSkillTag("respondSha")` 与 hiddenCard ⇒ 不写就轮不到本技能
			hiddenCard(player, name) {
				const colors = player.storage.chashui_zhidai_colors || [];
				const color = name === "sha" ? "red" : name === "jiu" ? "black" : null;
				if (!color || !colors.includes(color)) return false;
				return player.countCards("he", (card) => get.color(card, false) === color) > 0;
			},
			viewAs(cards, player) {
				if (!cards || cards.length !== 1) return null;
				const name = get.color(cards[0], false) === "red" ? "sha" : "jiu";
				return get.autoViewAs({ name, isCard: true }, cards);
			},
			prompt: "至殆：将红色牌当【杀】、黑色牌当【酒】使用",
			ai: {
				order: 4,
				result: {
					player: 1,
				},
			},
		},
	},
	grant: ["use"],
});

/**
 * 阴图（祖郎）
 *
 * 描述：锁定技，当你每回合首次使用牌结算结束后，你于本回合对非此牌目标的角色使用牌
 *       无距离和次数限制。
 *
 * 语义（`yintu.lua`）：每回合你第一次使用牌结算后，记录该牌的**目标 id 列表**；
 * 之后本回合内对不在列表里的角色使用牌，`bypass_distances` 与 `bypass_times` 都为真。
 *
 * 诚实偏差：引擎的「次数」是**按牌种**计、不按目标计（`player.getCardUsable` 只看牌与玩家），
 * 所以只能做到「只要还存在未被记录的目标，就整体解除次数限制」。距离是按目标判的，完全精确。
 */
const yintuPlan = defineSkill({
	id: "chashui_yintu",
	keepTranslate: true,
	audio: 2,
	locked: true,
	forced: true,
	trigger: { player: "useCardAfter" },
	filter(event, player) {
		// 本回合你使用的第一张牌：useCard 入史发生在 content 开头（content.js:9177），
		// 所以此刻历史里只有这一张才是「首次」。
		return player.getHistory("useCard", (evt) => evt.player === player).length === 1;
	},
	async content(event, trigger, player) {
		const members = (trigger.targets || []).map((target) => target.playerid);
		player.storage.chashui_yintu_members = members;
		player.addTempSkill("chashui_yintu_buff", "phaseAfter");
	},
	sub: {
		buff: {
			charlotte: true,
			forced: true,
			popup: false,
			mod: {
				targetInRange(card, player, target) {
					const members = player.storage.chashui_yintu_members || [];
					if (!members.includes(target.playerid)) return true;
				},
				cardUsable(card, player, num) {
					// 只有本来有次数上限的牌才需要解除
					if (!get.info(card)?.usable) return;
					const members = player.storage.chashui_yintu_members || [];
					const rest = game.countPlayer((target) => target !== player && !members.includes(target.playerid));
					if (rest > 0) return Infinity;
				},
			},
			onremove: true,
		},
	},
	grant: ["buff"],
});

// ============================================================================
// 陈寿 · 阅文 / 仕荫 / 定史
// ============================================================================

/**
 * 阅文（陈寿）
 *
 * 描述：一名角色的出牌阶段结束后，你可以弃置一张手牌，然后将牌堆顶至多三张牌置入弃牌堆。
 *
 * 语义（`yuewen.lua`）：触发在 `EventPhaseEnd`（出牌阶段结束）；代价＝弃一张手牌；
 * 数字 1-3 由 `yuewen_active` 的 Spin 决定；效果是把牌堆顶 N 张**置入弃牌堆**（不是弃置）。
 */
const yuewenPlan = defineSkill({
	id: "chashui_yuewen",
	keepTranslate: true,
	audio: 2,
	trigger: { global: "phaseUseEnd" },
	filter(event, player) {
		return player.countCards("h") > 0;
	},
	async cost(event, trigger, player) {
		// 代价不加 forced：cost 里的选择就是「是否发动」的唯一入口（AGENTS.md §4.2 R8），
		// 加 forced 会把「你可以」变成强制发动。
		const discard = await player
			.chooseToDiscard("h", 1, "阅文：弃置一张手牌，然后将牌堆顶至多三张牌置入弃牌堆")
			.set("ai", get.unuseful)
			.forResult();
		if (!discard?.bool || !discard.cards?.length) return;
		// chooseNumbers 的数组参数是「多个选择器」：`next.list.push(...arg)`（player.js:6814-6815），
		// 每个元素渲染成一个下拉框 ⇒ 传 [1,2,3] 会弹出三个数值选择器。
		// 「一个数值、范围 1~3」的正确写法是传单个对象 { prompt, min, max }
		// （原生 character/bingshi.js:2737、character/collab.js:7786、character/offline.js:20392 同款）。
		const num = await player
			.chooseNumbers("阅文：选择置入弃牌堆的牌数", [
				{ prompt: "请选择置入弃牌堆的牌数", min: 1, max: 3 },
			])
			.forResult();
		if (!num?.bool || !num.numbers?.length) return;
		event.result = {
			bool: true,
			cost_data: { num: num.numbers[0], discarded: discard.cards.slice() },
		};
	},
	async content(event, trigger, player) {
		const num = event.cost_data.num;
		const cards = get.cards(num);
		if (cards.length) await game.cardsDiscard(cards);
	},
	ai: {
		threaten: 0.9,
	},
});

/**
 * 仕荫（陈寿 · 蜀势力技）
 *
 * 描述：蜀势力技，锁定技，每回合结束时，你选择并获得一张本回合进入弃牌堆的牌
 *       （此牌点数须大于你此前以此法获得过的牌）。若你未以此法获得牌，你将势力改为晋。
 *
 * 语义（`shiyin.lua`）：
 *   - 候选＝本回合进入弃牌堆的牌（lua 走 MoveCards 事件里 `toArea == DiscardPile` 的牌）
 *   - 可选＝点数 > 已有 mark（mark 记的是「上次以此法获得的牌的点数」，初值 0）
 *   - 一张都没获得 ⇒ `changeKingdom("jin")`
 * 「蜀势力技」＝只有势力为蜀时才生效（用 `player.group` 判，与 `attached_kingdom` 同义）。
 */
const shiyinPlan = defineSkill({
	id: "chashui_shiyin",
	keepTranslate: true,
	audio: 2,
	locked: true,
	forced: true,
	trigger: { global: "phaseEnd" },
	mark: true,
	marktext: "荫",
	intro: {
		name: "仕荫",
		content(storage, player) {
			const num = player.storage.chashui_shiyin_num || 0;
			return `<li>本局以此法获得过的最大点数：${num || "（无）"}<br><li>下次获得的牌点数须大于 ${num}`;
		},
	},
	onremove: true,
	filter(event, player) {
		return player.group === "shu";
	},
	async content(event, trigger, player) {
		const all = lib.chashuiTurnDiscardCards();
		const mark = player.storage.chashui_shiyin_num || 0;
		const ava = all.filter((card) => get.number(card) > mark);
		let got = false;
		if (ava.length) {
			// 只把「点数大于门槛」的牌放进对话框：旧版把全部牌塞进 dialog，
			// 再用 `chooseButton(dialog, true, fn)` 的第三个参数当过滤器——但那个位置的函数
			// 会被当成 `ai`（player.js:6248-6253：`if (next.ai) next.filterButton = arg; else next.ai = arg`），
			// 过滤从未生效，导致任意点数的牌都能选。
			// 直接缩小候选集既修掉该问题，也省掉一次 filterButton 判定。
			const result = await player
				.chooseButton(["仕荫：选择一张本回合进入弃牌堆的牌获得", ava], true)
				.set("ai", (button) => get.value(button.link, player))
				.forResult();
			if (result?.bool && result.links?.length) {
				const card = result.links[0];
				await player.gain(card, "gain2");
				player.storage.chashui_shiyin_num = get.number(card);
				player.markSkill("chashui_shiyin");
				got = true;
			}
		}
		if (!got) {
			// 「若你未以此法获得牌，你将势力改为晋」。点数门槛不清零（原型 setPlayerMark 只在获得时写）。
			await player.changeGroup("jin");
		}
	},
});

/**
 * 定史（陈寿 · 晋势力技，限定技）
 *
 * 描述：晋势力技，限定技，出牌阶段，你可以获得弃牌堆中任意张点数均不同的牌，
 *       若你以此法获得了所有点数的牌，你可以任意分配你以此法获得的牌。
 *
 * 语义（`dingshi.lua`）：poxi 面板按 13 个点数分组，每组内牌可选；`feasible` 恒真 ⇒
 * 允许只选一部分；获得后若张数 >= 13（即 13 个点数全拿到）走 `askToYiji(0..999)` 分配。
 * 「所有点数」= A~K 共 13 种。
 */
const dingshiPlan = defineSkill({
	id: "chashui_dingshi",
	keepTranslate: true,
	audio: 2,
	enable: "phaseUse",
	limited: true,
	skillAnimation: true,
	animationColor: "metal",
	filter(event, player) {
		return player.group === "jin" && ui.discardPile.childNodes.length > 0;
	},
	async content(event, trigger, player) {
		player.awakenSkill("chashui_dingshi");
		const pile = Array.from(ui.discardPile.childNodes);
		// 位置参数里的第一个 function 会被当成 `ai`（player.js:6248-6253），不是 filterButton；
		// 而下面还有 `.set("ai", ...)` 会覆盖它 ⇒ 旧的过滤函数等于从未执行，
		// 同点数的牌也能被重复选中。过滤器必须显式写成 `.set("filterButton", ...)`。
		const result = await player
			.chooseButton(["定史：选择任意张点数各不相同的牌获得", pile], [1, Infinity])
			.set("filterButton", (button) => {
				const number = get.number(button.link);
				return !ui.selected.buttons.some((one) => get.number(one.link) === number);
			})
			.set("ai", (button) => get.value(button.link, player))
			.forResult();
		if (!result?.bool || !result.links?.length) return;
		const cards = result.links.slice();
		await player.gain(cards, "gain2");
		const numbers = new Set(cards.map((card) => get.number(card)));
		if (numbers.size < 13) return;
		// 拿到全部 13 个点数 ⇒ 可以任意分配（遗计式逐人询问，未分配的默认留给自己）
		for (const target of game.filterPlayer((current) => current !== player)) {
			if (!target.isIn() || !player.countCards("h")) break;
			await player
				.chooseToGive(target, [0, Infinity], "h", "定史：分配给" + get.translation(target))
				.set("ai", get.unuseful)
				.forResult();
		}
	},
	ai: {
		order: 6,
		result: {
			player: 4,
		},
	},
});

// ============================================================================
// 齐万年 · 寇祸 / 肇乱
// ============================================================================

/**
 * 寇祸（齐万年）
 *
 * 描述：每名角色的回合限一次，当其需要使用【杀】时，其可以将一张牌当【杀】使用，
 *       若你未因此受到伤害，你摸一张牌；若其因此造成伤害，其摸一张牌。
 *
 * 语义（`kouhuo.lua` + `kouhuo_viewas.lua`）：
 *   - 全场每个角色都获得一个「将一张牌当【杀】使用」的转化技，每回合限一次（`usedSkillTimes(HistoryTurn)`）
 *   - 那张牌打出时打标记；结算结束后由拥有者判断：自己没被这张牌伤到 → 自己摸 1；
 *     这张牌造成了伤害 → 使用者摸 1（两者可同时成立）
 */
const kouhuoPlan = defineSkill({
	id: "chashui_kouhuo",
	keepTranslate: true,
	audio: 2,
	// 描述里「若你未因此受到伤害，你摸一张牌；若其因此造成伤害，其摸一张牌」没有「可以」，
	// 是必发效果 ⇒ forced 让引擎直接 result={bool:true}（content.js:3595），不弹「是否发动」。
	// 原型 `kouhuo.lua` 同样是 `mute = true` + `on_cost = Util.TrueFunc`（无条件发动）。
	forced: true,
	trigger: { global: "useCardAfter" },
	filter(event, player) {
		return !!event.card?.storage?.chashui_kouhuo;
	},
	async content(event, trigger, player) {
		const user = trigger.player;
		// 「你未因此受到伤害」：你（拥有者）的受伤史里有没有这张牌
		const hurtOwner = player.getHistory("damage", (evt) => evt.card === trigger.card).length > 0;
		// 「其因此造成伤害」：使用者的伤害来源史里有没有这张牌
		const dealt = user.hasHistory("sourceDamage", (evt) => evt.card === trigger.card);
		if (!hurtOwner) await player.draw(1);
		if (dealt && user.isIn()) await user.draw(1);
	},
	group: ["sync"],
	grant: ["use"],
	sub: {
		/** 把「寇祸」转化技同步给全场（拥有者死后收回） */
		sync: {
			charlotte: true,
			forced: true,
			silent: true,
			popup: false,
			forceDie: true,
			trigger: { global: ["gameStart", "dieAfter"] },
			filter(event, player) {
				if (event.name === "dieAfter") return event.player === player;
				return player.hasSkill("chashui_kouhuo");
			},
			async content(event, trigger, player) {
				const alive = player.isAlive() && player.hasSkill("chashui_kouhuo");
				for (const target of game.filterPlayer()) {
					if (alive) {
						if (!target.hasSkill("chashui_kouhuo_use")) target.addSkill("chashui_kouhuo_use");
					} else if (target.hasSkill("chashui_kouhuo_use")) {
						target.removeSkill("chashui_kouhuo_use");
					}
				}
			},
		},
		/** 全场共享的转化技：一张牌当【杀】（只有当前回合角色可用，每回合限一次） */
		use: {
			audio: false,
			// 描述是「**使用**一张牌当【杀】**使用**」——没有「打出」，所以只开 chooseToUse。
			// 开了 chooseToRespond 会让它在【无懈可击】等所有响应窗口里冒按钮（那些窗口要的是
			// 无懈/闪，不是杀）。
			enable: "chooseToUse",
			position: "he",
			filter(event, player) {
				// 「每名角色的回合限一次，**其**可以…」：其 = 需要使用的那个角色 = 当前回合角色。
				// 不加这条，任何人（包括非回合角色）在任何窗口都能用。
				if (!_status.currentPhase || player !== _status.currentPhase) return false;
				// 每回合限一次：历史是**本回合**作用域（player.js:11890），数「以此技能使用过的牌」。
				return player.getHistory("useCard", (evt) => evt.skill === "chashui_kouhuo_use").length === 0;
			},
			filterCard(card, player) {
				// 任意一张牌都能转化（含装备区），描述只说「一张牌」
				return true;
			},
			viewAs(cards, player) {
				if (!cards || !cards.length) return null;
				const card = get.autoViewAs({ name: "sha", isCard: true }, cards);
				card.storage = { chashui_kouhuo: true };
				return card;
			},
			prompt: "寇祸：将一张牌当【杀】使用",
			ai: {
				order: 4,
				result: { player: 1 },
			},
		},
	},
});

/**
 * 肇乱（齐万年）
 *
 * 描述：锁定技，游戏开始时和你死亡后，每名角色依次选择一项：1.弃一张牌；
 *       2.使用一张无距离限制的【杀】。
 *
 * 语义（`zhaoluan.lua`）：`sortByAction` 排序（从当前回合角色开始按座次），逐个询问；
 * 能选「使用杀」或「弃牌」二选一；两个都做不到就跳过。
 * 拥有者死亡后仍要发动 ⇒ `forceDie: true`（content 里新建的事件也要带）。
 */
const zhaoluanPlan = defineSkill({
	id: "chashui_zhaoluan",
	keepTranslate: true,
	audio: 2,
	locked: true,
	forced: true,
	forceDie: true,
	trigger: { global: ["gameStart", "dieAfter"] },
	filter(event, player) {
		if (event.name === "gameStart") return player.hasSkill("chashui_zhaoluan");
		return event.player === player;
	},
	async content(event, trigger, player) {
		const targets = game.filterPlayer().sortBySeat(_status.currentPhase || player);
		for (const target of targets) {
			if (!target.isAlive()) continue;
			const canDiscard = target.countCards("he") > 0;
			// 「使用一张无距离限制的【杀】」：凭空印牌 + nodistance，允许取消（取消后必须弃牌）
			const used = await target
				.chooseUseTarget(
					{ name: "sha", isCard: true },
					"肇乱：使用一张无距离限制的【杀】，或取消并弃置一张牌",
					false,
					"nodistance"
				)
				.set("forceDie", true)
				.forResult();
			if (used?.bool) continue;
			if (!canDiscard) continue;
			await target
				.chooseToDiscard("he", 1, true, "肇乱：弃置一张牌")
				.set("ai", get.unuseful)
				.set("forceDie", true)
				.forResult();
		}
	},
});

// ============================================================================
// 刘阿知 · 漂泊 / 夷封 / 衍众
// ============================================================================

/**
 * 读区划。
 *
 * 存储键**不用** `chashui_piaobo`（那是技能 id）：技能 id 当 storage 键会和引擎的
 * 技能状态（`intro` / `markcount` / 转换技判定都读 `storage[skillId]`）共用一格，
 * 排查时极难区分「这是技能状态还是我的业务数据」。改用独立键，旧键保留只读兼容。
 *
 * @param {Player} player
 * @returns {"china" | "japan"}
 */
const chashuiPiaoboZone = (player) => {
	const value = player?.storage?.chashui_piaobo_zone ?? player?.storage?.chashui_piaobo;
	return value === "japan" ? "japan" : "china";
};
lib.chashuiPiaoboZone = chashuiPiaoboZone;

/**
 * 把 mark 上的字刷成「华 / 倭」并按区划染色。
 *
 * 为什么不能只写 `marktext`：`marktext` 是**静态**的（引擎把它写进
 * `lib.translate[技能id + "_bg"]`，见 player.js:10372-10376），一个技能只有一种字。
 * 而区划会变，所以只能在运行时改 DOM —— mark 的文字节点是 `.background.skillmark`。
 * 同款先例：`xuandie_jiji_refreshMark`（sanshe.js:87-99 改色）、
 * `xiaobai_yinhan.paint`（xiaobai.js:17070-17074 改色）。
 *
 * @param {Player} player
 */
const chashuiPiaoboPaint = (player) => {
	const node = player?.marks?.chashui_piaobo_rule;
	if (!node) return;
	const el = node.querySelector(".background.skillmark") || node.querySelector(".background");
	if (!el) return;
	const japan = chashuiPiaoboZone(player) === "japan";
	el.innerHTML = japan ? "倭" : "华";
	el.style.color = japan ? "#008000" : "#ff0000";
};
lib.chashuiPiaoboPaint = chashuiPiaoboPaint;

/**
 * 切换区划对「手牌可打性」的收益（AI 用）。
 *
 * 学原生〖手谈〗`dcshoutan` 的 `ai.result.player`（character/xianding.js:44823-44850）：
 * 手谈把 `player.storage.dcshoutan` **临时翻转**，对每张手牌各算一遍 `getUseValue`，
 * 比较翻转前后的差值来判断「这一下转换值不值得」。
 * 漂泊同理：区划变了，能指定的目标集合就变了（`mod.playerEnabled`），
 * 手牌里每张牌的可用价值随之变化，累加正收益即为切换的价值。
 *
 * @param {Player} player
 * @returns {number}
 */
const chashuiPiaoboSwitchGain = (player) => {
	const before = chashuiPiaoboZone(player);
	const after = before === "china" ? "japan" : "china";
	let gain = 0;
	for (const card of player.getCards("hs")) {
		const v1 = player.getUseValue(card, null, true);
		player.storage.chashui_piaobo_zone = after;
		let v2 = 0;
		try {
			v2 = player.getUseValue(card, null, true);
		} catch (e) {
			v2 = 0;
		}
		player.storage.chashui_piaobo_zone = before;
		if (v2 > v1) gain += v2 - v1;
	}
	return gain;
};
lib.chashuiPiaoboSwitchGain = chashuiPiaoboSwitchGain;

/**
 * 令角色进入某区划，并结算〖夷封〗。
 *
 * 为什么是函数而不是事件：无名杀没有「区划变化」这类事件，`player.changeGroup` 改的是
 * 真正的势力（会牵动一堆势力相关技能），不能借来当信号。区划是本扩展自己的状态，
 * 所以变化点统一走这里；〖夷封〗是锁定技、行为固定，由这里直接结算（见交付说明的偏差项）。
 *
 * @param {Player} player
 * @param {"china" | "japan"} zone
 */
const chashuiPiaoboEnter = async (player, zone) => {
	if (!player || !player.isIn()) return;
	// 注意：这里**不能**在「区划没变」时提前 return 而不写 storage。
	// `chashuiPiaoboZone` 对未写过的角色按缺省返回 "china"，如果某角色从没被写过
	// storage，`mod.playerEnabled` 读到的仍是缺省值 —— 一旦之后有代码把「缺省」
	// 和「显式 china」当成两种状态比较，就会出现「明明同为华夏却互相不能指定」。
	// 所以每次进入都落一次 storage（幂等），让状态只有一个真源。
	// 键必须与 `chashuiPiaoboZone` 读的键**完全一致**（`chashui_piaobo_zone`）：
	// 曾出现过「写旧键 `chashui_piaobo`、读新键」的分叉，导致刚转成华夏仍被判成倭国。
	player.storage.chashui_piaobo_zone = zone;
	delete player.storage.chashui_piaobo;
	player.markSkill("chashui_piaobo_rule");
	lib.chashuiPiaoboPaint(player);
	game.log(player, "进入了", zone === "japan" ? "#g倭国" : "#r华夏");
	for (const owner of game.filterPlayer((current) => current.hasSkill("chashui_yifeng"))) {
		if (owner === player) {
			// 夷封①：你进入倭国后加 1 点体力上限
			if (zone === "japan") await owner.gainMaxHp(1);
		} else if (chashuiPiaoboZone(owner) === zone) {
			// 夷封②：其他角色进入你所在区划后，你与其各摸一张牌
			await owner.draw(1);
			if (player.isIn()) await player.draw(1);
		}
	}
};
lib.chashuiPiaoboEnter = chashuiPiaoboEnter;

/**
 * 漂泊（刘阿知）
 *
 * 描述：锁定技，游戏开始时，你将场上分为「华夏」与「倭国」两个区划，其他角色默认位于
 *       「华夏」，你进入「倭国」。每名角色使用牌仅可指定同区划内的角色，且计算距离时
 *       仅计算同区划内的角色。每名角色的准备阶段，其可以弃一张牌并进入另一个区划。
 *
 * 语义（`piaobo.lua`）：区划存在 mark 里（缺省 china）；`prohibit` 拦异区划目标；
 * `distance.correct_func` 减去路径上异区划角色数；准备阶段弃 1 张牌切换。
 *
 * 引擎落地：
 *   - 「仅可指定同区划」用 `mod.playerEnabled` 返回 false（只在异区划时否决，
 *     返回 undefined 交回牌自身规则 —— 返回 true 会短路牌自己的 filterTarget）
 *   - 距离用 `mod.globalFrom` 减去路径上异区划的人数（引擎只有 globalFrom/globalTo 两个
 *     加性 mod，没有按目标对的距离函数；与 lua 的 correct_func 同义）
 */
const piaoboPlan = defineSkill({
	id: "chashui_piaobo",
	keepTranslate: true,
	audio: 2,
	locked: true,
	forced: true,
	trigger: { global: "gameStart" },
	filter(event, player) {
		return player.hasSkill("chashui_piaobo");
	},
	async content(event, trigger, player) {
		// 开局：全场落到「华夏」。这里直接写 storage 而不走 `lib.chashuiPiaoboEnter`，
		// 因为那会把〖夷封〗的「他人进入你所在区划」结算一遍（开局不算「进入」）。
		// mark 的创建交给 `sync`（它负责把 rule 挂到全场），这里只落状态。
		for (const target of game.filterPlayer()) target.storage.chashui_piaobo_zone = "china";
		await lib.chashuiPiaoboEnter(player, "japan");
	},
	group: ["sync"],
	grant: ["rule", "move"],
	sub: {
		/** 把规则/迁移技同步给全场（拥有者死后收回） */
		sync: {
			charlotte: true,
			forced: true,
			silent: true,
			popup: false,
			forceDie: true,
			trigger: { global: ["gameStart", "dieAfter"] },
			filter(event, player) {
				if (event.name === "dieAfter") return event.player === player;
				return player.hasSkill("chashui_piaobo");
			},
			async content(event, trigger, player) {
				const alive = player.isAlive() && player.hasSkill("chashui_piaobo");
				for (const target of game.filterPlayer()) {
					for (const id of ["chashui_piaobo_rule", "chashui_piaobo_move"]) {
						if (alive) {
							if (!target.hasSkill(id)) target.addSkill(id);
						} else if (target.hasSkill(id)) {
							target.removeSkill(id);
						}
					}
					// addSkill 会自动 markSkill（`mark: true`，player.js:10954-10960），
					// 而 marktext 是静态的，新建出来的字是「华」；这里立刻按真实区划刷一遍，
					// 免得已经身处倭国的角色首次挂上 mark 时显示成「华」。
					if (alive) lib.chashuiPiaoboPaint(target);
				}
			},
		},
		/** 区划规则：异区划不可指定 + 距离只数同区划 */
		rule: {
			charlotte: true,
			forced: true,
			popup: false,
			mark: true,
			// marktext 是静态的（引擎写进 lib.translate[id + "_bg"]，player.js:10372-10376），
			// 所以这里只给一个「缺省区划=华夏」的初始字；真实字与颜色由
			// `lib.chashuiPiaoboPaint` 在运行时按区划刷成「华（红）/倭（绿）」。
			marktext: "华",
			intro: {
				name: "漂泊",
				content(storage, player) {
					const zone = lib.chashuiPiaoboZone(player);
					return `<li>当前区划：${zone === "japan" ? "<span style='color:#008000'>倭</span>" : "<span style='color:#ff0000'>华</span>"}（${zone === "japan" ? "倭国" : "华夏"}）`;
				},
			},
			mod: {
				playerEnabled(card, player, target) {
					if (lib.chashuiPiaoboZone(player) !== lib.chashuiPiaoboZone(target)) return false;
				},
				globalFrom(from, to, distance) {
					// 「计算距离时仅计算同区划内的角色」：沿两条座次路径各数一遍「异区划人数」，
					// 取较短路径的那一份，把距离减去它。引擎只有加性 mod（get/index.js:3575-3601
					// 只读 globalFrom/globalTo），没有「按目标对」的距离函数，所以与 lua 的
					// distance.correct_func 同义。
					//
					// 只数**引擎也算作一格**的角色：基础距离 `n` 的算法是「1 + 路径上
					// `isAlive() && !isOut() && !hasSkill("undist") && !isMin(true)` 的中间人数」
					// （get/index.js:3541-3550）。死亡/离场/`undist` 的座位本来就不占格，
					// 若把它们也计入 skip，就会多减、出现「隔着一个死人反而更近」。
					const zone = lib.chashuiPiaoboZone(from);
					// 自身对自身：引擎在 get/index.js:3518-3520 就 `return 0` 提前退出了，
					// 正常不会走到这里；但 mod 可能被别处直接调用，兜一道免得返回负数距离。
					if (from === to) return;
					if (zone !== lib.chashuiPiaoboZone(to)) return;
					const counts = (current) => current.isAlive() && !current.isOut() && !current.hasSkill("undist") && !current.isMin(true);
					const walk = (step) => {
						let steps = 0;
						let skip = 0;
						let current = step(from);
						while (current && current !== from && current !== to && steps <= game.players.length) {
							steps++;
							if (counts(current) && lib.chashuiPiaoboZone(current) !== zone) skip++;
							current = step(current);
						}
						return { steps, skip };
					};
					const forward = walk((current) => current.getNext());
					const backward = walk((current) => current.getPrevious());
					let skip;
					if (forward.steps < backward.steps) skip = forward.skip;
					else if (forward.steps > backward.steps) skip = backward.skip;
					else skip = Math.max(forward.skip, backward.skip);
					if (skip > 0) return distance - skip;
				},
			},
		},
		/** 准备阶段：每名角色可弃一张牌切换区划 */
		move: {
			charlotte: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: { global: "phaseZhunbeiBegin" },
			filter(event, player) {
				return player === event.player && player.countCards("he") > 0;
			},
			async content(event, trigger, player) {
				// AI 是否切换：学原生〖手谈〗`dcshoutan` 的 `ai.result.player`
				// （character/xianding.js:44823-44850）—— 先算「切换后手牌价值涨了多少」，
				// 涨了才换；没涨就不换（弃一张牌换不来收益，是纯亏）。
				const gain = lib.chashuiPiaoboSwitchGain(player);
				const result = await player
					.chooseToDiscard("he", "漂泊：弃置一张牌并进入另一个区划", 1)
					.set("ai", (card) => {
						if (gain <= 0) return -1;
						// 切换有收益时，尽量弃最没用的牌（装备区优先给高权，避免为换区拆装备）
						return (get.position(card) === "e" ? 8 : get.unuseful(card)) - 3 + gain;
					})
					.forResult();
				if (!result?.bool || !result.cards?.length) return;
				// popup 已关（子技能默认不记日志），这里手动记到父技能上，否则界面上看不到发动
				player.logSkill("chashui_piaobo");
				await lib.chashuiPiaoboEnter(player, lib.chashuiPiaoboZone(player) === "china" ? "japan" : "china");
			},
		},
	},
});

/**
 * 夷封（刘阿知）
 *
 * 描述：锁定技，你进入「倭国」后加1点体力上限；其他角色进入你所在区划后，
 *       你与其各摸一张牌。
 *
 * 实现说明：无名杀没有区划/势力变化事件，区划是本扩展自管状态，所以这两条由
 * `lib.chashuiPiaoboEnter` 在区划变化时直接结算（本技能对象负责技能栏呈现与 `hasSkill` 判定）。
 */
const yifengPlan = defineSkill({
	id: "chashui_yifeng",
	keepTranslate: true,
	audio: 2,
	locked: true,
});

/**
 * 衍众（刘阿知）
 *
 * 描述：当你造成或受到伤害后，你可以交给一名其他角色一张牌并令其获得「衍众」。
 *       当有角色获得「衍众」后，你摸一张牌。
 *
 * 语义（`yanzhong.lua`）：`fk.Damage`（你造成）+ `fk.Damaged`（你受到）；
 * 目标须是**还没有**衍众的其他角色；给牌后目标获得衍众，然后除目标外每个持有衍众的角色
 * （含你）各摸一张（lua：`for p in getOtherPlayers(to) do if p:hasSkill then p:drawCards(1)`）。
 */
const yanzhongPlan = defineSkill({
	id: "chashui_yanzhong",
	keepTranslate: true,
	audio: 2,
	trigger: { player: "damageAfter", source: "damageAfter" },
	filter(event, player) {
		if (!player.countCards("he")) return false;
		return game.hasPlayer((target) => target !== player && !target.hasSkill("chashui_yanzhong"));
	},
	async cost(event, trigger, player) {
		const result = await player
			.chooseCardTarget({
				prompt: "衍众：交给一名其他角色一张牌，并令其获得「衍众」",
				position: "he",
				filterCard: true,
				selectCard: 1,
				filterTarget(card, player2, target) {
					return target !== player2 && target.isAlive() && !target.hasSkill("chashui_yanzhong");
				},
				ai1: get.unuseful,
				ai2: (target) => get.attitude(player, target),
			})
			.forResult();
		if (!result?.bool || !result.cards?.length || !result.targets?.length) return;
		event.result = { bool: true, cards: result.cards, targets: result.targets };
	},
	async content(event, trigger, player) {
		const target = event.targets[0];
		await player.give(event.cards, target);
		target.addSkill("chashui_yanzhong");
		for (const current of game.filterPlayer((one) => one !== target && one.hasSkill("chashui_yanzhong"))) {
			await current.draw(1);
		}
	},
});

// ============================================================================
// 吴纲 · 索缚
// ============================================================================

/**
 * 索缚（吴纲）
 *
 * 描述：每回合开始时，你可以横置或将势力变更至魏，然后摸两张牌。若如此做，本回合结束时，
 *       若你本回合未造成或受到伤害，你变更势力至吴，令当前回合角色视为对你使用冰【杀】。
 *
 * 语义（`suofu.lua`）：`fk.TurnStart`（每回合开始，不限谁的回合）；
 * 选项按当前状态裁剪（已横置就不给「横置」，已是魏就不给「变更势力」），可以取消；
 * 成功则摸 2；本回合结束时检查「本回合有无造成/受到伤害」，没有则改势力回吴 + 当前回合角色
 * 视为对你使用冰【杀】（`bypass_distances/bypass_times`）。
 * 「冰」是引擎已注册的伤害属性（`noname/library/index.js` 的 `lib.nature` 含 `ice`）。
 */
const suofuPlan = defineSkill({
	id: "chashui_suofu",
	keepTranslate: true,
	audio: 2,
	trigger: { global: "phaseBegin" },
	filter(event, player) {
		return !player.isLinked() || player.group !== "wei";
	},
	async cost(event, trigger, player) {
		const choices = [];
		if (!player.isLinked()) choices.push("横置");
		if (player.group !== "wei") choices.push("变更势力至魏");
		const result = await player
			.chooseControl(choices.concat(["cancel2"]))
			.set("prompt", "索缚：选择一项，然后摸两张牌")
			.set("ai", () => (player.countCards("h") < 3 ? choices[0] : "cancel2"))
			.forResult();
		if (!result?.control || result.control === "cancel2") return;
		event.result = { bool: true, cost_data: { choice: result.control } };
	},
	async content(event, trigger, player) {
		const choice = event.cost_data.choice;
		if (choice === "横置") await player.link(true);
		else await player.changeGroup("wei");
		if (player.isAlive()) await player.draw(2);
		player.storage.chashui_suofu_turn = true;
	},
	group: ["delay"],
	sub: {
		delay: {
			charlotte: true,
			forced: true,
			silent: true,
			popup: false,
			trigger: { global: "phaseEnd" },
			filter(event, player) {
				// 只在「本回合发动过索缚」的回合结束时进来；标记必须在这里清掉（不能只在成立时清），
				// 否则受伤的回合没清，下一回合结束时会用新回合的空历史误判成「未受伤」。
				return !!player.storage.chashui_suofu_turn;
			},
			async content(event, trigger, player) {
				player.storage.chashui_suofu_turn = false;
				// 本回合未造成且未受到伤害
				if (player.getHistory("sourceDamage").length > 0) return;
				if (player.getHistory("damage").length > 0) return;
				player.logSkill("chashui_suofu");
				if (player.group !== "wu") await player.changeGroup("wu");
				const current = trigger.player;
				if (!current || current === player || !current.isAlive() || !player.isAlive()) return;
				const card = get.autoViewAs({ name: "sha", nature: "ice", isCard: true }, []);
				// 视为使用也要目标合法（无距离限制不等于无目标限制）
				if (!current.canUse(card, player, false)) return;
				await current.useCard(card, [player], "chashui_suofu");
			},
		},
	},
});

// ============================================================================
// 导出
// ============================================================================

const chashuiSpPlans = [zhidaiPlan, yintuPlan, yuewenPlan, shiyinPlan, dingshiPlan, kouhuoPlan, zhaoluanPlan, piaoboPlan, yifengPlan, yanzhongPlan, suofuPlan];

/** @type {Record<string, any>} */
export const skills = {};
for (const plan of chashuiSpPlans) Object.assign(skills, plan.skills);

export const chashuiSpSkillIds = Object.keys(skills);
