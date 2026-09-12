import { get } from "noname";

// xiaobai 前缀技能翻译（附属条目紧跟主条目）
export const xiaobaiTranslate = {
	xiaobai_julan: "聚澜",
	xiaobai_julan_info: "连招技（基本牌），你摸连招条件数张牌，然后你将一个\u201C基本牌\u201D加入连招条件。你处于连招进度时，可以将一张牌当【趁火打劫】使用，若此【趁火打劫】展示的为基本牌，则改为由你选择令使用者获得此牌或令其受到1点伤害。",
	xiaobai_kuotao: "括涛",
	xiaobai_kuotao_info: `${get.poptip("xiaobai_julan")}中断后，若与上次导致中断的牌类别相同，你本局游戏出牌阶段使用【杀】的次数+1；否则你可以将本局游戏出牌阶段使用【杀】的次数或连招条件减少至1，然后于当前阶段结束时视为使用一张多展示X张牌的【兵临城下】（X为减少值）。`,
	xiaobai_danzhi: "胆执",
	xiaobai_danzhi_info: "每回合首次使用牌后，若没有角色处于濒死状态，你可以令一名角色失去1点体力或获得此牌，然后本回合与该牌相同花色的牌被使用后，该角色回复1点体力或弃置一张牌。",
	xiaobai_zhoubi: "骤笔",
	xiaobai_zhoubi_info: `当你需要使用基本牌时，可以弃置本回合角色一张牌，然后若：该牌字数比上一次更多，你视为使用之；点数比上一次更小，你将手牌数摸至5，此技能失效至你下一次手牌数变化为1。`,
	xiaobai_liewu: "烈忤",
	xiaobai_liewu_info: "每轮限一次，你的牌响应其他角色使用的黑色牌后，你可以弃置任意张类别不同的牌对其造成X点伤害，其因此进入濒死状态时，其可以回复至X点体力并令你摸X张牌（X为你弃置的牌数）。",
	xiaobai_chongjuan: "宠眷",
	xiaobai_chongjuan_info: "摸牌阶段或弃牌阶段结束时，你可以令手牌数唯一最多的角色摸一张牌，然后其可以令你将手牌数摸至比其少一张（至多摸5张）。",
	xiaobai_huzhen: "斛珍",
	xiaobai_huzhen_info: "当你失去手牌后，若与你上次失去手牌的方式不同，你可以摸一张牌，相同，你可以明置一张手牌。你手牌因此变为均明置时，你可以用两张手牌交换一名其他角色三张手牌。",
	visible_xiaobai_huzhen: "明置",
	xiaobai_liufang: "流芳",
	xiaobai_liufang_info: "每回合限一次，你需要使用基本牌时，你可以翻转一张或三张手牌，若明置牌颜色数为一，你弃置所有暗置牌，然后视为使用之。",
	visible_xiaobai_liufang: "明置",
	xiaobai_bianmei: "辩眉",
	xiaobai_bianmei_info:
			`出牌阶段限一次，你可以与一名手牌比你多一张的角色拼点，赢者可以摸一张牌，或摸两张牌并令对方收回拼点牌，若你赢，你可以再发动${get.poptip("xiaobai_bianmei")}。`,
	xiaobai_yingying: "营盈",
	xiaobai_yingying_info:
			`你可以将手牌数调整为手牌上限，视为使用或打出一张基本牌。若你因${get.poptip("xiaobai_yingying")}累计的摸牌数大于弃牌数，则你只能通过弃牌发动${get.poptip("xiaobai_yingying")}。`,
	xiaobai_hengxian: "横弦",
	xiaobai_hengxian_info:
			"出牌阶段结束时，若场上存在三名角色的手牌数能构成三角形，你可以将手牌数调整为4；若构成的三角形形状存在等腰三角形，你可以选择三名能构成等腰三角形的角色，然后交换其中两名角色的手牌。",
	xiaobai_zhuyuan: "琢圆",
	xiaobai_zhuyuan_info:
			"锁定技，你的弃牌阶段改为弃置X²张牌（X为场上手牌数为4的角色数，不足全弃），直到下个你的回合开始时，当你的手牌数发生变化后，你将手牌数调整为4。",
	xiaobai_zhiwen: "鸷刎",
	xiaobai_zhiwen_info:
			"你可以将三张牌或最后一张手牌当无次数限制的【杀】或【决斗】使用，然后你选择一项：1.下次仅能以另一种方式转化；2.下次仅能转化为另一种牌名。背水：此牌对其他角色造成的伤害+1，并依次执行上述所有选项。",
	xiaobai_minnian: "泯念",
	xiaobai_minnian_info:
			"每回合限一次，当你进入濒死状态时，你可以将手牌数调整为X（X为你的体力上限），然后横置两名角色，若其中包含你，你回复至1点体力。",
	xiaobai_jufen: "俱焚",
	xiaobai_jufen_info:
			"限定技，出牌阶段，若你没有手牌，你可以对自己造成1点火焰伤害，然后获得所有本回合进入弃牌堆的牌。",
	xiaobai_sanfa: "三法",
	xiaobai_sanfa_info:
			"你可以将一张【杀】当雷【杀】使用，然后若此【杀】：造成伤害，转换牌名依次添加火【杀】、冰【杀】；未造成伤害，转换底牌依次添加基本牌、普通锦囊牌。",
	xiaobai_shidao: "释道",
	xiaobai_shidao_info:
			"造成过属性伤害的回合结束时，你可以重铸一张牌，若此牌为当前〖三法〗的转换底牌，你摸一张牌；转换牌名，你对一名其他角色造成1点属性伤害（属性由你从本回合造成过的属性伤害中选择）。",
	xiaobai_dengxian: "登仙",
	xiaobai_dengxian_info:
			"觉醒技，〖三法〗及〖释道〗所有句段均执行后，你将体力上限调整为9，然后可令一名其他角色获得一个〖三法〗。此后你的〖三法〗可以进行逆向转换。",
	xiaobai_pantan: "叛探",
	xiaobai_pantan_info:
			`出牌阶段限一次，你可以将一张牌当【知己知彼】使用，若你因此转化与观看的牌中包含：伤害牌，你摸一张牌；相同牌名，你视为使用【决斗】。${get.poptip("rule_chengshi")}：你变更势力。`,
	xiaobai_manyi: "蛮异",
	xiaobai_manyi_info:
			`结束阶段，你可以选择一项：1.对一名与你本回合开始时势力相同但此时不同的角色造成1点伤害；2.令一名与你此时势力相同的角色摸两张牌。${get.poptip("rule_beishui")}：本局游戏你不能变更至本回合开始时的势力。`,
};
