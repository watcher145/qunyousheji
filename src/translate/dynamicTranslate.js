import { lib, get, _status } from "noname";
import { qunyou_no1Player } from "../skill/helpers.js";

const blue = (text) => `<span class="bluetext">${text}</span>`;
const phaseName = (id) => blue(get.translation(id).replace("阶段", ""));

const dynamicTranslates = {
	qunyou_miaoyu(player, skill) {
		const base = lib.translate[`${skill}_info`] || "";
		const cur = _status.currentPhase;
		if (!cur?.isIn()) {
			return `${base}<br>${blue("当前回合角色手牌上限：无当前回合角色")}`;
		}
		const L = cur.getHandcardLimit();
		return `${base}<br>${blue(`当前回合角色：${get.translation(cur)}；手牌上限：${L}`)}`;
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
};

export default dynamicTranslates;
