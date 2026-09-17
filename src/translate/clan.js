import { get } from "noname";

// clan 前缀技能翻译（附属条目紧跟主条目）
export const clanTranslate = {
	clanlunyi: "沦佚",
	clanlunyi_info: "宗族技，锁定技，当同族角色的牌进入弃牌堆时，你将其中一张牌置于牌堆底。",
	clan_guoting: "过庭",
	clan_guoting_info: "宗族技，锁定技，出牌阶段结束时，若有同族角色已受伤，你重铸手中唯一最多花色的牌，并横置或重置等量名角色。",
	clan_xinggu: "星孤",
	clan_xinggu_info: "宗族技，出牌阶段开始时，你可以进行任意次【浮雷】判定并获得判定牌（同族角色以此法进行的判定视为同一张【浮雷】）。",
	clanguming: "沽名",
	clanguming_info:
			`宗族技，锁定技，准备阶段，你令一名同族角色的${get.poptip("clanguming")}上升一格，视为使用【无中生有】或【桃】。`,
	clanqianzhang: "潜章",
	clanqianzhang_info: "宗族技，回合结束时，若本回合同族角色使用的第一张牌与最后一张牌同名，你可以执行一个额外的出牌阶段。",
	clanxunli: "训礼",
	clanxunli_info: "宗族技，每回合限一次，当一名同族角色失去其一个区域内的最后一张牌后，你可以令其摸一张牌。",
	clanzhuding: "柱鼎",
	clanzhuding_info:
			"宗族技，锁定技，游戏开始时，你选择一种牌的类别，同族角色每回合首次通过武将牌上的技能使用此类牌时将手牌摸至体力上限。",
	clanzuguan: "族冠",
	clanzuguan_info:
			"宗族技，你一次性失去多张牌后，若没有角色处于濒死状态，你可以令一名同族角色使用其中一张牌。",
	clanshuze: "树泽",
	clanshuze_info:
			"宗族技，当你翻至正面、解除横置、脱离醉酒状态时，你可以视为对一名同族角色使用【桃】，或对所有同族角色使用【五谷丰登】。",
};
