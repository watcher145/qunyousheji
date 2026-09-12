import { get } from "noname";

// zhuoming 前缀技能翻译（附属条目紧跟主条目）
export const zhuomingTranslate = {
	zhuoming_feili: "飞戾",
	zhuoming_feili_info: "转换技，出牌阶段，①你；②你；③你；④你可以视为使用一张【决斗】，然后将当前序号内容改为因此受伤且没有死亡的角色。当序号内角色死亡后，删掉对应序号。周始：你依次对序号内角色造成一点伤害然后摸两张牌。",
	zhuoming_weigong: "伪恭",
	zhuoming_weigong_info: `锁定技，转换技，每当你受到或造成一点伤害后，需：①回退；②回退；③回退；④回退${get.poptip("zhuoming_feili")}进度。周始：将一项改为推进。`,
	zhuoming_fengpan: "封叛",
	zhuoming_fengpan_info: "当你造成伤害时，若受伤角色所在势力：①与你相同；②角色数最多；每满足一项，你可以摸一张牌。若如此做，你变更势力。",
	zhuoming_fuluan: "浮乱",
	zhuoming_fuluan_info: "群势力技，准备阶段，你可以令任意名势力各不相同的其他角色议事。若结果为黑色，你对一名意见为黑色的角色造成1点伤害；否则你获得所有红色意见牌。",
	zhuoming_quantong: "遣通",
	zhuoming_quantong_info: `魏势力技，出牌阶段限一次，你可以令一名其他角色对你发动${get.poptip("quhu")}。`,
	zhuoming_liezong: "裂宗",
	zhuoming_liezong_info: "出牌阶段，你可以弃置一张牌；然后若你手牌数差X成为手牌数最多，你摸X张牌，此阶段此技能失效，且你使用牌均无次数、距离限制（X为本回合弃牌堆中伤害牌数）。若你装备牌的牌数不少于一号位，你受到伤害后也可发动；若一号位体力值不多于你，你回复体力后也可发动。若两项条件均满足，“弃置”改为“使用”。",
	zhuoming_tasai: "踏塞",
	zhuoming_tasai_info: "转换技，你视为额外装备一张①防御马②进攻马。你可以转换此技能以视为使用或打出①【杀】②【闪】。若对方因此进入你的攻击范围，或你因此脱离对方的攻击范围，你弃置对方两张牌。",
	zhuoming_tasai_sha: "踏塞",
	zhuoming_tasai_shan: "踏塞",
	zhuoming_juanlong: "卷陇",
	zhuoming_juanlong_info: "限定技，弃牌阶段，你可以改为摸四张牌并分配若干手牌；因此获得至少三张牌的角色可以使用若干【杀】；因此成为至少两次目标角色失去一点体力；因此死亡至少一名角色后重置此技能。",
	zhuoming_juanlong_assigned: "已分配",
	zhuoming_fengqi: "烽起",
	zhuoming_fengqi_info:
			`转换技，①你，使用【杀】后，可以令所有序号内角色各重铸一至二张牌，各类型的唯一失去者可以使用其失去的同类型牌。锁定技，“${get.poptip("zhuoming_fengqi")}”被连续拒绝发动两次后，删去前者的序号及内容，被连续发动两次后，周始发动者改为后者。周始：你令一名角色弃置一种类型的所有牌，然后添加一个内容为其的序号。`,
	zhuoming_hengchi: "横驰",
	zhuoming_hengchi_info:
			"出牌阶段每种手牌数限一次，若你的手牌数唯一，则你可以重铸所有手牌，然后使用其中一张符合拥有的连招技中当前连招进度的牌，否则你将其中一张牌当作-1马置入一名角色的任意装备栏。（可替换原装备）",
	zhuoming_shuocheng: "朔骋",
	zhuoming_shuocheng_info:
			"连招技（自己为唯一目标的牌＋其他角色为唯一目标的牌），若此牌为【杀】，则你可以令之多结算X次；否则，你可以弃置目标角色X张牌并获得其中的【杀】且使用这些【杀】时无次数限制。（X为你场上和攻击范围内能增加攻击范围的牌数）",
	zhuoming_shuocheng_tag: "朔骋",
};
