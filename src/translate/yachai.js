import { get } from "noname";

// yachai 前缀技能翻译（附属条目紧跟主条目）
export const yachaiTranslate = {
	yachai_jianshi: "鉴识",
	yachai_jianshi_info: "出牌阶段限一次，你可以展示一张手牌或装备区或s区的牌并将其交给一名其他角色，当其于下个回合内使用与之颜色相同的牌时，其从牌堆底摸一张牌。",
	yachai_shibian: "时变",
	yachai_shibian_info: "锁定技，当牌堆底的牌发生变化后，你摸一张牌，然后若你本回合以此法摸牌数大于体力上限，你失去1点体力且本技能失效直到本回合结束。",
	yachai_qingjie: "清界",
	yachai_qingjie_info: "出牌阶段各限一次，你可以将手牌摸至体力上限或弃置至少一张手牌。出牌阶段结束时，你可以令一名其他角色执行你本阶段未执行过的一项。",
	yachai_chenxun: "陈训",
	yachai_chenxun_info: "每回合限一次，当前回合角色使用伤害牌结算后，你可以将弃牌堆顶的两张牌任意分配于牌堆顶或牌堆底，然后若其为你，此伤害牌不计入次数。",
	yachai_qianjiao: "潜礁",
	yachai_qianjiao_info: "出牌阶段限一次，若你没有“礁”，你可以将牌堆顶的X张牌暗置于武将牌上，称为“礁”。（X为场上体力值的极差且至少为1）",
	yachai_anchao: "暗潮",
	yachai_anchao_info: "每名角色的出牌阶段限一次，其可以令你观看其手牌并获得其中一张，然后你可以令其观看你的“礁”并使用或获得其中一张。",
	yachai_yijiang: "诣降",
	yachai_yijiang_info: "每轮限一次，手牌上限大于你的角色出牌阶段开始时，你可以将手牌上限增加至与其相同，然后你与其各摸X张牌。你计算与其他角色的距离-X直到下次发动此技能。（X为你因此增加的手牌上限）",
	yachai_jieren: "解任",
	yachai_jieren_info: "当你于回合内使用牌后，你可以令你的手牌上限-1，然后摸一张牌或令其中一个目标弃置一张牌。",
	yachai_jizi: "赍志",
	yachai_jizi_info: "锁定技，每轮开始时，你对一名其他角色造成1点伤害；每轮结束时，其视为对你使用一张冰【杀】。",
	yachai_tuicheng: "推诚",
	yachai_tuicheng_info: "锁定技，准备阶段，你将一张牌当【铁索连环】对自己与一名其他角色使用；结束阶段，其将一张牌当【火攻】对你使用。",
	yachai_yingxiang: "萦香",
	yachai_yingxiang_info: "锁定技，当你的牌于回合外进入弃牌堆后，你获得你武将牌上本轮首次失去的技能。",
	yachai_lijian: "砺剑",
	yachai_lijian_info: "出牌阶段限一次，你可以重铸所有手牌并展示，若手牌中牌的类别因此增多，你视为使用一张火【杀】并可以重复此流程。",
	yachai_tanghuo: "蹚祸",
	yachai_tanghuo_info: "锁定技，当你每回合首次成为其他角色使用牌的目标后，若其技能数大于体力值，你弃置所有手牌，否则你摸一张牌。",
	yachai_bozui: "驳罪",
	yachai_bozui_info: "其他角色使用【杀】指定你为目标后，你可以与其交换装备区内的牌，然后令此牌对你无效。",
	yachai_heshu: "和戍",
	yachai_heshu_info: "每名角色的出牌阶段限一次，其可以弃置其装备区内的所有牌，你可以与其各摸一张牌，然后视为其使用一张【桃】或【酒】。",
	yachai_bianwang: "辨亡",
	yachai_bianwang_info: "一张非转化的实体伤害牌造成伤害后，若此牌为红色/黑色，你可以将此牌当【乐不思蜀】/【兵粮寸断】对自己使用。",
	yachai_najian: "纳剑",
	yachai_najian_info: "一名角色的出牌阶段结束时，若本阶段内有同类别的牌进入过弃牌堆，你可以获得你判定区内的牌，然后若这些同类别的牌中有牌同名，你可以将这些同名牌中还在弃牌堆的牌交给一名其他角色。",
	yachai_wuyan: "忤言",
	yachai_wuyan_info:
			"每轮每名角色限一次，其他角色于摸牌阶段外获得牌时，你可以选择一项：1.将其中一张牌置于其武将牌上，令其下一个摸牌阶段开始时获得之；2.将一张黑色牌当【兵粮寸断】对自己使用。",
	yachai_lihui: "励诲",
	yachai_lihui_info:
			"其他角色的摸牌阶段结束时，若其本阶段获得牌数不为2，你依次判定你判定区内的每张牌，然后将这些判定牌与判定结果牌交给一名其他角色。",
	yachai_shangwen: "尚文",
	yachai_shangwen_info:
			"其他角色的结束阶段，若其于本回合未造成过伤害，你可以将至多X张牌交给其。（X为你的体力值）",
	yachai_gailan: "该览",
	yachai_gailan_info:
			"出牌阶段限一次，你可以弃置X张牌并观看一名角色的手牌，然后用至多X张手牌交换其中等量张牌。（X为你的体力值）",
	yachai_yishuang: "移霜",
	yachai_yishuang_info:
			"当一张点数未被记录过的牌造成伤害后，你可以记录此牌的点数，并令一名角色重铸至多三张牌。",
	yachai_baizhou: "柏舟",
	yachai_baizhou_info:
			"当你使用牌造成伤害或受到牌造成的伤害时，你可以令此牌点数+3或-3（最小为A，最大为K）。",
	yachai_jingui: "尽规",
	yachai_jingui_mark: "尽规",
	yachai_jingui_info:
			"一名角色的回合内，当其区域内首次有牌进入弃牌堆后，你可以令其获得其中一张，若如此做，其于本回合内使用此牌时无距离和次数限制。",
	yachai_jiegai: "节概",
	yachai_jiegai_info:
			"锁定技，每回合首次成为其他角色使用牌的目标后，若你不在其攻击范围内，此牌对你无效。",
	yachai_shice: "势策",
	yachai_shice_info:
			"每回合限一次，当你成为伤害牌的目标后，你可以令此牌的一个目标摸一张牌。然后若其不为你且此牌未对你与其造成伤害，你可以弃置使用者一张牌。",
	yachai_jiangming: "将明",
	yachai_jiangming_info:
			"每回合限X次，当你使用手牌后，若此牌点数比你本回合此前使用过的手牌点数都大，你可以亮出牌堆顶的X张牌并依次使用其中任意张点数大于此牌点数的非装备牌。（X为你的体力上限）",
	yachai_yanling: "赝令",
	yachai_yanling_info:
			"其他角色使用普通锦囊牌时，若你不为此牌的唯一目标，你可以代替其成为此牌的使用者，然后获得〖誉虚〗。",
	yachai_feijiao: "非矫",
	yachai_feijiao_info:
			"锁定技，其他角色对另一名其他角色使用单目标【杀】未造成伤害后，若前者/后者距离一号位更近，你弃置其一张牌/失去〖誉虚〗。",
	yachai_yuxu: "誉虚",
	yachai_yuxu_info:
			"当你于出牌阶段内使用牌结算结束后，你可以摸一张牌。若如此做，当你于此阶段内使用下一张牌结算结束后，你不能以此法摸牌且须弃置一张牌。",
	yachai_xiaoqiang: "效戕",
	yachai_xiaoqiang_info:
			"出牌阶段限一次，你可以依次执行以下任意项并视为对同一目标使用等量张【决斗】：①弃置所有牌；②失去体力至1点；③翻至背面。",
	yachai_changshang: "长殇",
	yachai_changshang_info:
			"锁定技，当你受到伤害后，若你因此/未因此进入过濒死状态，你从牌堆顶/弃牌堆顶摸两张牌。你死亡时，令一名角色获得本技能。",
	yachai_xiumu: "修睦",
	yachai_xiumu_info:
			"你/你的上下家的准备阶段，你的上下家/你可以将X张手牌当【桃】或【酒】对当前回合角色使用。（X为本局游戏此技能的发动次数）",
	yachai_shenjiao: "神交",
	yachai_shenjiao_info:
			`限定技，当你进入濒死状态时，你可以令一名其他角色选择是否令你回复所有体力，若其执行，其摸等量张牌且${get.poptip("yachai_xiumu")}视为未发动过。`,
	yachai_qiyi: "岐嶷",
	yachai_qiyi_info:
			"每名角色限一次，当你需要响应目标为你的牌时，你可以观看使用者的手牌并选择其中一张牌响应之。",
	yachai_chengshi: "逞师",
	yachai_chengshi_info:
			`出牌阶段限一次，你可以选择一名其他角色，然后弃置另一名角色的一张牌并视为你对该角色使用一张【杀】。若此【杀】造成了伤害，则${get.poptip("yachai_qiyi")}视为未发动过；否则被弃牌的其他角色视为对你使用一张【杀】。`,
	yachai_po: "迫",
	yachai_jinshi: "浸势",
	yachai_jinshi_info:
			`一名角色受到伤害时，你可以获得其或来源装备区内的一张装备牌并使用之，然后获得1枚"迫"标记。`,
	yachai_faji: "发机",
	yachai_faji_mark: "发机",
	yachai_faji_info:
			`觉醒技，当"迫"的数量达到3枚时，你失去${get.poptip("yachai_jinshi")}并获得${get.poptip("yachai_nilv")}，然后你须选择一名其他角色，当你对其/其对你造成伤害时，此伤害+1/移去1枚"迫"，直到你或其受到雷电伤害后。`,
	yachai_nilv: "逆旅",
	yachai_nilv_info:
			`出牌阶段限一次，你可以移去1枚"迫"，然后视为使用一张基本牌或对一名座位号小于X的角色造成1点伤害。（X为你上次以此法选择角色的座位号，初次发动可以任选）`,
	yachai_liuliu: "流罹",
	yachai_liuliu_info:
			`锁定技，你成为过牌的目标的回合结束时，你变更为一个未成为过的势力，选择一项：1.视为使用一张基本牌；2.从牌堆或弃牌堆中选择一张坐骑牌使用。然后若所有势力你均成为过，你失去武将牌上所有的技能并获得${get.poptip("yachai_beixuan")}。`,
	yachai_beixuan: "背玄",
	yachai_beixuan_info:
			`出牌阶段限一次，你可以摸X张牌，然后直到你失去最后的手牌前，你不能摸牌。（X为场上没有的势力数且至少为1）`,
};
