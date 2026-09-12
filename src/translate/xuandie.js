import { get } from "noname";

// xuandie 前缀技能翻译（附属条目紧跟主条目）
export const xuandieTranslate = {
	xuandie_yuwei: "逾围",
	xuandie_yuwei_info: "你可以以移出方式使用牌并摸牌至X张，令本技能于你使用X张牌前失效、失效X回合后失去。（X为上一张移出牌点数）",
	xuandie_yuwei_append:
			'<span style="font-family: yuanli"><li>作者注：玄蝶系列中的“以重铸、移出、明置、暗置等方式使用牌”仅改变使用牌的方式，不影响此牌结算。即是将原本“置入结算区，结算这张牌”改为了“置入弃牌堆并摸一张牌，结算这张牌”“置于你武将牌上，结算这张牌”“明置/暗置这张牌，结算这张牌”。若是装备牌或延时锦囊，依然会在结算时去它该去的地方，所以荀灌可以通过移出游戏方式使用装备牌和延时锦囊牌。另外这里的移出游戏是指置于武将牌上。</span>',
	xuandie_yuwei_restore_bg: "复",
	xuandie_yuwei_lose_bg: "失",
	xuandie_yuwei_get_bg: "获",
	xuandie_junce: "君侧",
	xuandie_junce_info:
			"你可以将【杀/酒/铁索连环】、【闪/桃/过河拆桥】当另一侧一张牌使用并将两者移至同侧。任意侧唯一需要使用的牌名改为【无中生有】。",
	xuandie_xiangfu: "相赴",
	xuandie_xiangfu_info:
			"出牌阶段，每轮各限一次，你可以与一名其他角色将手牌向彼此调整一张（手牌少者摸一张，多者弃一张，相等则不变），按差值变化视为使用一张基本牌：<br><span style=\"color:#e0566b\">相思</span>·正负性不变，【杀】；<br><span style=\"color:#d69a2d\">相逢</span>·变为0，【酒】；<br><span style=\"color:#7c9cc4\">相失</span>·变为相反数，【闪】；<br><span style=\"color:#f0a3b8\">相守</span>·未变化，【桃】。",
	xuandie_yixin: "一心",
	xuandie_yixin_info: `锁定技，唯一参与${get.poptip("xuandie_xiangfu")}的其他角色视为拥有之。`,
	xuandie_yixin_append:
			'<span style="font-family: yuanli"><li>愿得一人心，白首不分离。</li></span>',
	xuandie_jiji: "击楫",
	xuandie_jiji_bg: "击",
	xuandie_jiji_info:
			"当即时牌进入弃牌堆后，你可以移出或移去一张你的同名牌。<br>你一回合使用了X张牌后可以摸牌至X张（X为移出牌数）。<br>若你发动本行的次数最少，你可以视为使用一张移出牌。",
	xuandie_jiji_markCard_bg: "楫",
};
