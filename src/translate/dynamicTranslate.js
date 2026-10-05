import { lib, get, _status } from "noname";
import { qunyou_no1Player } from "../skill/helpers.js";
import { qunyou_jike_del, qunyou_jike_texts, qunyouPhaseNames } from "../skill/sanshe.js";

const blue = (text) => `<span class="bluetext">${text}</span>`;
const red = (text) => `<span style="color:#f04a4a">${text}</span>`;
const phaseName = (id) => blue(get.translation(id).replace("阶段", ""));
// 花色 → 显示符号：复用 skill/xiaobai.js 导出的 lib.xiaobaiNichangSuitChar，避免两处各写一份花色表而漂移
const nichangSuitChar = (suit) => lib.xiaobaiNichangSuitChar?.(suit) || suit || "";

const dynamicTranslates = {
	// 妙喻：① 显示当前回合角色的手牌上限（±1 的对象）② 按序号列出「武将牌上的技能」，玩家才知道第 X 张会失效
	wending_miaoyu(player, skill) {
		const base = lib.translate[`${skill}_info`] || "";
		const cur = _status.currentPhase;
		const limit = cur?.isIn() ? `${blue(`当前回合角色：${get.translation(cur)}；手牌上限：${cur.getHandcardLimit()}`)}` : blue("当前回合角色手牌上限：无当前回合角色");
		const order = player?.getStockSkills?.(true, true) || [];
		if (!order.length) {
			return `${base}<br>${limit}`;
		}
		const list = order.map((sid, i) => `${i + 1}.${get.translation(sid)}`).join("　");
		return `${base}<br>${limit}<br>${blue(`你武将牌上的技能（共${order.length}个）：${list}`)}`;
	},
	qunyou_guwo(player) {
		const state = player.storage.qunyou_guwo_state || 0;
		const text = "转换技，锁定技，当你使用牌结算后，①②③若与你上使用牌点数递增，②③则将体力调整至手牌数，③手牌调整至已损失体力数。";
		if (state === 0) {
			return text.replace("①", blue("①")).replace("若与你上使用牌点数递增", blue("若与你上使用牌点数递增"));
		}
		if (state === 1) {
			return text
				.replaceAll("②", blue("②"))
				.replace("若与你上使用牌点数递增", blue("若与你上使用牌点数递增"))
				.replace("则将体力调整至手牌数", blue("则将体力调整至手牌数"));
		}
		return text
			.replaceAll("③", blue("③"))
			.replace("若与你上使用牌点数递增", blue("若与你上使用牌点数递增"))
			.replace("则将体力调整至手牌数", blue("则将体力调整至手牌数"))
			.replace("手牌调整至已损失体力数", blue("手牌调整至已损失体力数"));
	},
	qunyou_chubu(player) {
		const state = player.storage.qunyou_chubu_state || 0;
		const text = "转换技，锁定技，当你使用牌结算后，①②③若与你上使用牌点数递减，②③则弃置所有手牌摸1张牌，③并减1点体力上限。";
		if (state === 0) {
			return text.replace("①", blue("①")).replace("若与你上使用牌点数递减", blue("若与你上使用牌点数递减"));
		}
		if (state === 1) {
			return text
				.replaceAll("②", blue("②"))
				.replace("若与你上使用牌点数递减", blue("若与你上使用牌点数递减"))
				.replace("则弃置所有手牌摸1张牌", blue("则弃置所有手牌摸1张牌"));
		}
		return text
			.replaceAll("③", blue("③"))
			.replace("若与你上使用牌点数递减", blue("若与你上使用牌点数递减"))
			.replace("则弃置所有手牌摸1张牌", blue("则弃置所有手牌摸1张牌"))
			.replace("并减1点体力上限", blue("并减1点体力上限"));
	},
	// 绩陂：转换技——描述里把**当前态**那一项标蓝（原生 clandongxu 同款；
	// ☯ 标记与浮窗另由 skill 里的 mark/intro 负责，这里只管技能描述文本的高亮）
	qunyou_jipo(player, skill) {
		const info = lib.translate[`${skill}_info`] || "";
		const i1 = info.indexOf("①");
		const i2 = info.indexOf("②");
		if (i1 < 0 || i2 < 0 || i2 < i1) return info;
		// 尾注「（X为②的发动次数）」不参与高亮
		const tailIdx = info.indexOf("（", i2);
		const head = info.slice(0, i1);
		const yang = info.slice(i1, i2);
		const yin = info.slice(i2, tailIdx > i2 ? tailIdx : undefined);
		const tail = tailIdx > i2 ? info.slice(tailIdx) : "";
		// storage：false → 态①（重铸触发）；true → 态②（印桃）
		const onSecond = player?.storage?.qunyou_jipo === true;
		return head + (onSecond ? yang : blue(yang)) + (onSecond ? blue(yin) : yin) + tail;
	},
	// 挟民：连招技描述里把**当前连招条件**逐条高亮（初始【杀】，每完成一次连招+1）
	qunyou_xiemin(player, skill) {
		const info = lib.translate[`${skill}_info`] || "";
		const cond = player?.storage?.qunyou_xiemin_condition || ["sha"];
		const list = cond.map((id) => `【${get.translation(id)}】`).join(" + ");
		// 只替换第一个括号区间：连招技（【杀】）
		return info.replace(/（[^（）]*）/, () => `（${blue(list)}）`);
	},
	// 势众：把「限X次」的 X 换成蓝色数字（X=挟民连招条件数，至少1，与 usable 口径一致）
	qunyou_shizhong(player, skill) {
		const info = lib.translate[`${skill}_info`] || "";
		const cond = player?.storage?.qunyou_xiemin_condition || [];
		const num = Math.max(1, cond.length);
		return info.replace("限X次", `限${blue(num)}次`);
	},
	zishu_mitu(player, skill) {
		const left = player?.storage?.zishu_mitu_left;
		const right = player?.storage?.zishu_mitu_right;
		if (!left?.length || !right?.length) {
			return lib.translate[`${skill}_info`] || "";
		}
		const rules = [];
		for (let i = 0; i < 3; i++) {
			rules.push(`于${phaseName(left[i])}后，下个阶段改为执行${phaseName(right[i])}`);
		}
		return `锁定技，你的回合开始时，按以下三条规则重新排列阶段顺序：${rules.join("；")}。`;
	},
	xiaobai_julan(player) {
		const cond = player.storage.xiaobai_julan_condition || ["basic"];
		const typeText = { basic: "基本牌", trick: "锦囊牌", equip: "装备牌" };
		const condStr = cond.map(t => typeText[t] || t).join("+");
		return `连招技（${blue(condStr)}），你摸${blue(cond.length)}张牌，然后你将一个${blue("基本牌")}加入连招条件。你处于连招进度时，可以将一张牌当【趁火打劫】使用，若此【趁火打劫】展示的为基本牌，则改为由你选择令使用者获得此牌或令其受到1点伤害。`;
	},
	zhuoming_feili(player) {
		const state = player.storage.zhuoming_feili || 0;
		const slots = player.storage.zhuoming_feili_slots || [];
		const len = slots.length || 4;
		const nums = ["①", "②", "③", "④"];
		let head = "转换技，出牌阶段，";
		for (let i = 0; i < len; i++) {
			const s = slots[i];
			const sub = s ? (s.player === player ? "你" : get.translation(s.player)) : "无";
			head += (i === state ? blue(nums[i] + sub) : nums[i] + sub);
			if (i < len - 1) {
				head += "；";
			}
		}
		return `${head}可以视为使用一张【决斗】，然后将当前序号内容改为因此受伤且没有死亡的角色。当序号内角色死亡后，删掉对应序号。周始：你依次对序号内角色造成一点伤害然后摸两张牌。`;
	},
	zhuoming_weigong(player) {
		const state = player.storage.zhuoming_weigong || 0;
		const forward = player.storage.zhuoming_weigong_forward;
		const nums = ["①", "②", "③", "④"];
		const actions = nums.map((n, i) => {
			const act = i === forward ? "推进" : "回退";
			return i === state ? blue(n + act) : n + act;
		});
		return `锁定技，转换技，每当你受到或造成一点伤害后，需：${actions.join("；")}${get.poptip("zhuoming_feili")}进度。周始：将一项改为推进。`;
	},
	qunyou_qilue(player) {
		const removed = player.storage.qunyou_qilue_removed || [];
		const red = (text) => `<span style="color:#ff4444">${text}</span>`;
		const redWu = () => red("未");
		const isR = (n) => removed.includes(n);
		let text = "出牌阶段，你可令一名角色将手牌数调整为本阶段你";
		text += isR(1) ? "因此法调整过" : redWu() + "因此法调整过";
		text += "的数（至多为5），然后若其手牌数";
		text += isR(2) ? "小于/大于" : redWu() + "小于/大于";
		text += "你，其/你可视为使用一张本阶段";
		text += isR(3) ? "使用过" : redWu() + "使用过";
		text += "的普通锦囊牌，若";
		text += isR(4) ? "使用" : redWu() + "使用";
		text += "则失去一点体力。你的回合内，当有";
		text += isR(5) ? "被使用过" : redWu() + "被使用过";
		text += "的类别牌进入弃牌堆后，你本回合删去本技能倒数第X个";
		text += isR(6) ? "“”" : "“" + redWu() + "”";
		text += "字。（X为本回合弃牌堆牌数）";
		return text;
	},
	zhuoming_liezong(player) {
		const no1 = qunyou_no1Player();
		const cond1 = !!no1 && player.countCards("e") >= no1.countCards("e");
		const cond2 = !!no1 && no1.hp <= player.hp;
		let timing = "出牌阶段";
		if (cond1) {
			timing += "/你受到伤害后";
		}
		if (cond2) {
			timing += "/你回复体力后";
		}
		const act = cond1 && cond2 ? "使用" : "弃置";
		return `${timing}，你可以${act}一张牌；然后若你手牌数差X成为手牌数最多，你摸X张牌，此阶段此技能失效，且你使用牌均无次数、距离限制（X为本回合弃牌堆中伤害牌数）。若你装备牌的牌数不少于一号位，你受到伤害后也可发动；若一号位体力值不多于你，你回复体力后也可发动。若两项条件均满足，“弃置”改为“使用”。`;
	},
	zhuoming_fengqi(player) {
		const state = player.storage.zhuoming_fengqi || 0;
		const slots = player.storage.zhuoming_fengqi_slots || [];
		let head = "转换技，";
		if (!slots.length) {
			head += "序号：无";
		} else {
			for (let i = 0; i < slots.length; i++) {
				const s = slots[i];
				const num = i < 20 ? String.fromCodePoint(0x2460 + i) : `(${i + 1})`;
				const sub = s.player === player ? "你" : get.translation(s.player);
				head += i === state ? blue(num + sub) : num + sub;
			}
		}
		const initiator = player.storage.zhuoming_fengqi_zhoushi;
		const zhoushiName = !initiator || initiator === player ? blue("你") : blue(get.translation(initiator));
		return `${head}，使用【杀】后，可以令所有序号内角色各重铸一至二张牌，各类型的唯一失去者可以使用其失去的同类型牌。锁定技，“${get.poptip("zhuoming_fengqi")}”被连续拒绝发动两次后，删去前者的序号及内容，被连续发动两次后，周始发动者改为后者。周始：${zhoushiName}令一名角色弃置一种类型的所有牌，然后添加一个内容为其的序号。`;
	},
	xuandie_junce(player) {
		const red = (text) => `<span style="color:#ff4444">${text}</span>`;
		const sides = player.storage.xuandie_junce_sides || [
			["sha", "jiu", "tiesuo"],
			["shan", "tao", "guohe"],
		];
		// 两个列表实时生成并标蓝（表示动态部分）；单牌名侧受光环显示为红色的【无中生有】（附原牌名），恢复时自动还原
		const fmt = (side) =>
			side.length == 1
				? `${red("【无中生有】")}（原【${get.translation(side[0])}】）`
				: blue(`【${side.map((name) => get.translation(name)).join("/")}】`);
		return `你可以将${fmt(sides[0])}、${fmt(sides[1])}当另一侧一张牌使用并将两者移至同侧。任意侧唯一需要使用的牌名改为【无中生有】。`;
	},
	qunyou_tiaolong(player) {
		const state = player.storage.qunyou_tiaolong || 0;
		const names = ["杀", "闪", "酒", "桃"];
		const nums = ["①", "②", "③", "④"];
		let head = "转换技，你可以将一张非基本牌当作";
		for (let i = 0; i < 4; i++) {
			head += i === state ? blue(nums[i] + "【" + names[i] + "】") : nums[i] + "【" + names[i] + "】";
		}
		const prev = names[(state + 3) % 4], next = names[(state + 1) % 4];
		return `${head}使用；${get.poptip("qunyou_tiaolong")}当前状态的上一状态（${blue("【" + prev + "】")}）的同名牌你仅可当作【决斗】使用，下一状态（${blue("【" + next + "】")}）的同名牌你仅可当作【无懈可击】使用。`;
	},
	qunyou_fenzhe(player) {
		const idx = Number.isInteger(player.storage.qunyou_fenzhe) ? player.storage.qunyou_fenzhe : 0;
		const zero = player.storage.qunyou_fenzhe_zero ? `<br>${blue("你的手牌上限已减少至0。")}` : "";
		return `此技能当前于${blue(qunyouPhaseNames[idx] + "阶段开始时")}发动。你可以令此技能的发动时机后移任意个阶段（选择0则不移动，至多至本回合结束阶段开始时）并令你的手牌上限减少至0，视为使用等量张【调虎离山】；然后你本回合可对游戏外（移出游戏）的角色使用牌。${zero}`;
	},
qunyou_qiongji(player) {
			const idx = Number.isInteger(player.storage.qunyou_qiongji) ? player.storage.qunyou_qiongji : 4;
			let str = `此技能当前于${blue(qunyouPhaseNames[idx] + "阶段开始时")}发动。你可以令此技能的发动时机前移任意个阶段（选择0则不移动，至多至准备阶段开始时）并摸三张牌，视为使用一张【杀】；然后你于下个该阶段开始前弃置所有手牌。`;
			const pen = player.storage.qunyou_qiongji_pen;
			if (Number.isInteger(pen)) {
				str += `<br>${blue(`下个${qunyouPhaseNames[pen]}阶段开始前：`)}你弃置所有手牌。`;
			}
			return str;
		},
		xuandie_yuwei(player) {
			if (lib.config.extension_群友设计_xuandie_xunguan == "false") {
				return "你可以以移出方式使用牌并摸牌至X张，令本技能于你使用X张牌前失效、失效X回合后失去、失去X回合后获得。（X为上一张移出牌点数）";
			}
			return lib.translate["xuandie_yuwei_info"];
		},
		xiaobai_sanfa(player) {
			const info = player.storage.xiaobai_sanfa || { names: ["thunder"], bases: ["sha"] };
			const productName = (n) => (n == "fire" ? "火【杀】" : n == "ice" ? "冰【杀】" : "雷【杀】");
			const baseName = (b) => (b == "basic" ? "基本牌" : "普通锦囊牌");
			const products = blue(info.names.map(productName).join("/"));
			const materials = blue(info.bases.map((b) => (b == "sha" ? "【杀】" : baseName(b))).join("/"));
			const nameRemain = ["fire", "ice"].filter((n) => !info.names.includes(n)).map(productName).join("/");
			const baseRemain = ["basic", "trick"].filter((b) => !info.bases.includes(b)).map(baseName).join("/");
			const use = red(player.storage.xiaobai_dengxian ? "相互转化使用" : "使用");
			let str = "你可以将一张" + materials + "当" + products + use;
			let tail = "";
			if (nameRemain.length) tail += "，然后若此【杀】：造成伤害，转换牌名依次添加" + nameRemain;
			if (baseRemain.length) tail += (tail ? "；" : "，然后若此【杀】：") + "未造成伤害，转换底牌依次添加" + baseRemain;
			if (tail) str += tail + "。";
			return str;
		},
		qunyou_jike(player) {
			const del = qunyou_jike_del(player);
			const labels = ["①", "②", "③", "④"];
			const texts = qunyou_jike_texts();
			const opts = labels
				.map((label, i) =>
					del.includes(i)
						? `<span style="opacity:0.5">${label}${texts[i]}（已删除）</span>`
						: blue(`${label}${texts[i]}`)
				)
				.join("；");
			return `当你使用牌时，你可以执行一项并删除此项直到本回合结束：${opts}。选项的总数量减少/增加时你弃/摸一张牌。每回合结束时所有选项复原。`;
		},
	xiaobai_chenguang(player) {
			if (player.hasMark("xiaobai_chenguang")) {
				return "你受到伤害时，若你本轮获得过牌，你可以弃置一张牌，防止之；你回复体力时，若你本轮失去过牌，你可以摸一张牌，翻倍之。";
			}
			return "你受到伤害时，若你本轮未获得过牌，你可以摸一张牌，防止之；你回复体力时，若你本轮未失去过牌，你可以弃置一张牌，翻倍之。牌堆洗牌后，修改此技能。";
		},
	// 契定技：契定前后标签与措辞不同；已失效的代价项置灰（状态见 player.storage）
	xiaobai_huailie(player) {
		const contracted = Boolean(player?.storage?.xiaobai_huailie);
		const disabled = player?.storage?.xiaobai_huailie_disabled || [];
		const opt = (key, text) => (disabled.includes(key) ? `<font color='grey'>${text}</font>` : text);
		const type = contracted ? "锁定技" : get.poptip("sxrm_qidingSkill");
		const may = contracted ? "" : "可";
		return (
			`${type}，指定或途经你的【杀】没有造成伤害而进入弃牌堆时，你${may}明置一张♥牌，然后获得之。` +
			`若不能，你需先「${opt("recast", "重铸三张牌")}」、「${opt("draw", "摸两张牌")}」或「${opt("obtain", "获得场上一张牌")}」；` +
			"依然不能明置♥牌，你失去1点体力且不能再如此做。"
		);
	},
	xiaobai_yinhan(player) {
		const color = player?.storage?.xiaobai_yinhan_color;
		if (color == "black") {
			return "锁定技，<font color=\"#E0DB2F\">若最后进入弃牌堆的是黑色牌，你以明置替代使用，以交给替代打出；</font>反之，你以暗置替代使用，以重铸替代弃置。";
		}
		if (color == "red") {
			return "锁定技，若最后进入弃牌堆的是黑色牌，你以明置替代使用，以交给替代打出；<font color=\"#E0DB2F\">反之，你以暗置替代使用，以重铸替代弃置。</font>";
		}
		return "锁定技，若最后进入弃牌堆的是黑色牌，你以明置替代使用，以交给替代打出；反之，你以暗置替代使用，以重铸替代弃置。";
	},
	// 耽名：描述里的「4」是动态数值（摸牌后可选择令其 -1，直至本轮结束），需要随 storage 变化实时显示
	xiaobai_danming(player, skill) {
		const base = lib.translate[`${skill}_info`] || "";
		const value = 4 - (player?.storage?.xiaobai_danming_reduce || 0);
		return base.replace("调整至4", `调整至${blue(value)}`);
	},
	// 进替：描述里「依次：…」那五项的顺序是动态的（每轮发动后「摸牌至四张」会与最后执行的项交换），
	// 需要按 storage.xiaobai_jinti_order 实时重排
	xiaobai_jinti(player, skill) {
		const base = lib.translate[`${skill}_info`] || "";
		const order = player?.storage?.xiaobai_jinti_order || 1;
		const seq = [];
		for (let i = 1; i <= 5; i++) seq.push(i == order ? blue("摸牌至四张") : "使用一张牌");
		return base.replace(/依次：[^。]*。/, `依次：${seq.join("，")}。`);
	},
	// 霓裳：描述里的花色顺序（①♥②♠③♣④♦）是动态的——随「转换（每次重铸后队头轮转）」与
	// 「凋蝶删去转换项」实时变化，需按 storage.xiaobai_nichang 只列出仍存在的花色；
	// 被删去的花色其「对应项」从描述里一并消失，序号 ①②③④ 按当前队列顺序重排（与标记 / intro 一致）；
	// 队头（= 当前转换项）标蓝，与恣逸 / 言祸 / 逐梦飞离等转换技惯例一致
	// ⚠️ replace 的锚点必须与 translate/xiaobai.js 的 xiaobai_nichang_info 逐字一致，
	//    否则替换会静默失效（自检 test/debug-nichang.mjs 守这个锚点）
	xiaobai_nichang(player, skill) {
		const base = lib.translate[`${skill}_info`] || "";
		const queue = player?.storage?.xiaobai_nichang;
		if (!Array.isArray(queue)) {
			return base; // 尚未初始化（未获得技能）→ 回退到静态描述
		}
		const labels = ["①", "②", "③", "④"];
		const list = queue
			.map((suit, index) => {
				const text = `${labels[index] || ""}${nichangSuitChar(suit)}`;
				// 队头 = 当前转换项 → 标蓝
				return index === 0 ? blue(text) : text;
			})
			.join("");
		const clause = list ? `重铸你区域内的一张${list}牌` : "重铸你区域内的一张牌（花色顺序已删空）";
		return base.replace("重铸你区域内的一张①♥②♠③♣④♦牌", clause);
	},
	// 司酆：蒋子文死亡后仍可发动（司酆死后模式），「你」改为「一号位」——按 isIn() 切换措辞
	// （⚠️ player.dead 不是 Player 的属性、恒 undefined；真死后 isIn() 为假）
	xiaobai_sifeng(player, skill) {
		const base = lib.translate[`${skill}_info`] || "";
		if (player?.isIn()) {
			return base;
		}
		return (
			"你曾登场过的额定回合开始前，你可以令当前回合角色选择一项：1.交给「一号位」一张牌；2.「一号位」对其发动对应的〖显灾〗效果。若其已死亡，你令一名角色执行此额定回合；若你已死亡，你依然可以发动此技能。"
		);
	},
	// 迂策：契定技——契定后两效果由「可以」变「须」（原生乞施/殚瘁同款切换）
	qunyou_yuce(player, skill) {
		if (player?.storage?.qunyou_yuce) {
			return "锁定技，你于摸牌阶段外获得牌后，你须弃置这些牌；当你每回合首次进入濒死状态时，你须令本回合其他角色不能对你使用【桃】，然后回复一点体力并视为使用一张【过河拆桥】。";
		}
		return lib.translate[`${skill}_info`] || "";
	},
	// 犷勇：转换技——描述中的当前态（①/②）标蓝（原生 clandongxu 同款 bluetext）
	qunyou_kuangyong(player, skill) {
		const second = Boolean(player?.storage?.qunyou_kuangyong);
		const items = ["①你", "②你使用的上张有目标的牌的所有目标"];
		const text = items
			.map((item, index) => {
				return index == (second ? 1 : 0) ? `<span class='bluetext'>${item}</span>` : item;
			})
			.join("");
		return `转换技，当你使用牌指定目标时，你可以将此牌目标改为${text}，以获得原目标中除你外所有目标的各一张牌；若改后目标含你，你摸一张牌。`;
	},
	// 诂守：动态描述——当前首项标蓝、已删去项划线置灰，尾部附实时进度
	xiaobai_gushou(player, skill) {
		const stage = player?.storage?.xiaobai_gushou_stage || 0;
		const used = player?.storage?.xiaobai_gushou_used || 0;
		const names = ["伤害牌", "锦囊牌", "K点牌"];
		const items = ["①伤害牌", "②锦囊牌", "③K点牌"];
		const list = items
			.map((item, index) => {
				if (index < stage) return `<span style='opacity:0.45;text-decoration:line-through'>${item}</span>`;
				if (index == stage && stage < 3) return `<span class='bluetext'>${item}</span>`;
				return item;
			})
			.join("");
		const head = `${list}进入弃牌堆前，你的♠基本牌仅能当做首项的基本牌或普通锦囊牌使用，首项牌进入弃牌堆时删去之。均删去后，你分配弃牌堆中上述项牌X张（X为你以此法使用牌数）。`;
		const status =
			stage >= 3
				? `<br>当前：三项均已删去（已以此法使用${used}张♠基本牌）。`
				: `<br>当前首项：${names[stage]}（已以此法使用${used}张♠基本牌）。`;
		return head + status;
	},

	// ==================== 一蛋展示（猫咪大院）：随状态刷新的技能面板描述 ====================
	// 约定：base 取 lib.translate[skill+"_info"]，动态状态行用 blue/red 追加（妙喻/诂守同款）
	maokuo_raolue(player) {
		const base = lib.translate.maokuo_raolue_info || "";
		if (player.hasSkill("maokuo_raolue_used")) {
			return `${base}<br>${red("本回合已发动")}`;
		}
		const ready = player.storage?.maokuo_raolue_ready;
		return ready ? `${base}<br>${blue(`已就绪：可视为使用或打出【${get.translation(ready)}】`)}` : base;
	},
	maokuo_bolan(player) {
		const base = lib.translate.maokuo_bolan_info || "";
		const card = player.storage?.maokuo_bolan_card;
		return card ? `${base}<br>${blue(`本回合亮出：${get.translation(card.suit)}${get.translation(card.name)}（点数${card.num}）`)}` : base;
	},
	maokuo_songjiu(player) {
		const base = lib.translate.maokuo_songjiu_info || "";
		return player.hasSkill("maokuo_songjiu_jin") ? `${base}<br>${red("“颂酒”当前失效")}` : base;
	},
	maokuo_xunyi(player) {
		const base = lib.translate.maokuo_xunyi_info || "";
		const n = player.storage?.maokuo_xunyi_up || 0;
		return n ? `${base}<br>${blue(`当前：手牌上限和攻击范围+${n}；攻击范围 ${player.getAttackRange()}`)}` : base;
	},
	maokuo_shuirong(player) {
		const base = lib.translate.maokuo_shuirong_info || "";
		const n = player.storage?.maokuo_shuirong_down || 0;
		return n ? `${base}<br>${blue(`当前：手牌上限-${n}（现为 ${player.getHandcardLimit()}）`)}` : base;
	},
	maokuo_nishui(player) {
		const base = lib.translate.maokuo_nishui_info || "";
		const cards = player.getExpansions("maokuo_nishui");
		const ban = player.getStorage("maokuo_nishui_ban") || [];
		let str = base;
		if (cards.length) {
			str += `<br>${blue(`剩余“逆水”牌：${cards.map(c => `【${get.translation(c.name)}】`).join("、")}`)}`;
		}
		if (ban.length) {
			str += `<br>${red(`不能再使用或打出：${ban.map(n => `【${get.translation(n)}】`).join("、")}`)}`;
		}
		return str;
	},
	maokuo_qingxuan(player) {
		const base = lib.translate.maokuo_qingxuan_info || "";
		if (!ui.cardPile) {
			return base;
		}
		const list = get.info("maokuo_qingxuan").getVisibleTop();
		if (!list.length) {
			return base;
		}
		return `${base}<br>${blue(`牌堆可见牌：${list.map(item => `第${item.pos}张 ${get.translation(item.card)}`).join("、")}`)}`;
	},
	maokuo_shameng(player) {
		const base = lib.translate.maokuo_shameng_info || "";
		const st = player.storage?.maokuo_shameng_streak;
		return st?.target ? `${base}<br>${blue(`本轮连击：${get.translation(st.target)} 已被连续指定${st.count}次（再指定其摸${st.count + 1}张）`)}` : base;
	},
	maokuo_canlie(player) {
		const base = lib.translate.maokuo_canlie_info || "";
		const n = player.getStorage("maokuo_canlie_count") || 0;
		return n ? `${base}<br>${blue(`本回合已发动${n}次`)}` : `${base}<br>${blue("本回合尚未发动（首次发动时回复1点体力）")}`;
	},
	maokuo_siqian(player) {
		const base = lib.translate.maokuo_siqian_info || "";
		const ban = player.getStorage("maokuo_siqian_ban") || [];
		return ban.length ? `${base}<br>${red(`本回合不能再对${ban.map(s => get.translation(s)).join("、")}色牌发动`)}` : base;
	},
	maokuo_kuolue(player) {
		const base = lib.translate.maokuo_kuolue_info || "";
		const hit = (player.getStorage("maokuo_kuolue_hitmark") || []).length;
		return hit ? `${base}<br>${red("本回合已成为过黑色牌的目标")}` : base;
	},
};

export default dynamicTranslates;
