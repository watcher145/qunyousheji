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
	xiaobai_buxi: "补隙",
	xiaobai_buxi_info:
			"出牌阶段限一次，你可以弃置两张牌，视为使用【过河拆桥】，然后你使用最后进入弃牌堆的三张牌中，类型与余者均不同的牌；若没有此类牌，则视为使用任意一张单体伤害牌。",
	xiaobai_zhenlv: "贞律",
	xiaobai_zhenlv_info:
			`你使用过牌的回合内，【无懈可击】能且仅能以收回一张装备牌的方式视为使用。且使用后，使用者获得${get.poptip("xiaobai_shuanglv")}。`,
	xiaobai_zhenlv_g:"贞律",
	xiaobai_shuanglv: "爽律",
	xiaobai_shuanglv_info:
			"锁定技，你成为牌的目标后，失去此技能，与使用者各摸一张牌；回合结束时，你失去此技能和一点体力。",
	xiaobai_anmang: "安氓",
	xiaobai_anmang_info:
			"每轮各限一次，当你造成或受到伤害时，你可以令此伤害+1。若此伤害值与本回合你上次摸牌的牌数相同，你获得本回合弃牌堆中的两张牌并回复1点体力。",
	xiaobai_anzuo: "按祚",
	xiaobai_anzuo_info:
			"限定技，出牌阶段，你可以令一名角色加1点体力上限。其每回合首次：失去所有手牌后，回复1点体力；回满体力后，减1点体力上限。",
	xiaobai_anzuo_buff: "按祚",
	xiaobai_anzuo_buff_info: "每回合首次失去所有手牌后，回复1点体力；每回合首次回满体力后，减1点体力上限。",
	xiaobai_anzuo_buff_hp: "按祚",
	xiaobai_anzuo_buff_hp_info: "每回合首次失去所有手牌后，回复1点体力。",
	xiaobai_anzuo_buff_max: "按祚",
	xiaobai_anzuo_buff_max_info: "每回合首次回满体力后，减1点体力上限。",
	xiaobai_anzuo_buff_clear: "按祚",
	xiaobai_anzuo_buff_clear_info: "每回合开始时清空“按祚”附加效果的已发动记录。",
	xiaobai_beijia: "悲笳",
	xiaobai_beijia_info:
			"每轮限一次，体力值最小的角色受到伤害时，你可以交替地明置、暗置X张点数严格递减的手牌，防止此伤害（X为伤害来源与你的距离+1）。",
	xiaobai_beisi: "悖伺",
	xiaobai_beisi_info:
			"其他角色获得你的牌时，若场上没有处于濒死状态的角色，你可以改为将这些牌置于牌堆顶，然后于当前结算后视为对其使用【笑里藏刀】。",
	xiaobai_bingyan: "秉严",
	xiaobai_bingyan_info:
			"一张黑色伤害牌被使用时，你可以令此牌无法被响应，然后本技能失效至你下一次失去黑色牌后。此期间内，你无法响应基本牌或普通锦囊牌。",
	xiaobai_bizhao: "蔽诏",
	xiaobai_bizhao_info:
			"每回合限一次，当你或你攻击范围内的角色成为伤害牌的唯一目标时，你可以令所有手牌数不小于你的角色议事。若结果为：红色，此牌造成的伤害+1；黑色，此牌的使用者弃置一张牌。",
	xiaobai_anmou: "暗谋",
	xiaobai_anmou_info:
			`准备阶段，你可以选择一名其他角色，然后令至多三名角色摸一张牌并与其${get.poptip("sxrm_compare")}，其只能观看并用牌堆顶的牌拼点。结束阶段，其选择一组延时拼点公开，赢的角色视为对没赢的角色使用一张【杀】，若其没赢，重复此流程。`,
	xiaobai_beibian: "狈变",
	xiaobai_beibian_info:
			"蜀势力技，你可以将一张非基本牌当【决斗】使用（此牌类型须与上次发动此技能转化用的底牌类型不同），此牌的响应方式添加\u201C询问对方是否将势力变更至魏\u201D直到一方拒绝/双方同意后，此牌伤害+1/双方各摸两张牌。",
	xiaobai_boshe: "博涉",
	xiaobai_boshe_info:
			"一名角色的回合结束时，若当前回合角色本回合恰好以四种不同的方式失去过牌，你可以摸一张牌并与其各获得一张【影】。",
	xiaobai_bowen: "博文",
	xiaobai_bowen_info:
			"出牌阶段限X次，你可以选择一项：1.观看牌堆顶X张牌，然后可以弃置任意张牌，获得其中牌名字数之和不大于你弃置牌的牌；2.视为使用一张牌名字数为X的基本牌或普通锦囊牌，然后本阶段结束。（X为你本阶段已使用的牌数，至多为5）",
	xiaobai_bozhu: "拨珠",
	xiaobai_bozhu_info:
			"当你使用基本牌或普通锦囊牌指定目标或成为基本牌或普通锦囊牌的目标后，你可以选择一项：1、将三张牌置于武将牌上。2、获得武将牌上两张牌。然后若你的手牌数与你的武将牌上的牌数相等，你令此牌无效或多结算一次。",
	xiaobai_cairen: "豺刃",
	xiaobai_cairen_info:
			"每回合限一次，你可以弃置一张非基本牌，或重铸两张基本牌以视为使用一张【杀】，若之：花色相同，你获得一张【影】；均为【影】，此【杀】无距离限制。",
	xiaobai_changhe: "长河",
	xiaobai_changhe_info:
			"游戏开始时，将未出场的“小白杯”武将正面向上洗入牌堆，这些牌均视为♠9的锦囊牌，这些牌进入弃牌堆后销毁，效果为：此牌可当作此武将技能描述中的一张基本牌或普通锦囊牌使用。",
	xiaobai_dabai: "大白",
	xiaobai_dabai_info: "你可以将一张“小白杯”武将牌当对应武将牌上技能中的牌名的牌使用。",
	xiaobai_chengmo: "诚谟",
	xiaobai_chengmo_info:
			"每轮限一次，其他角色于其回合内使用【杀】指定目标后，你可以交给任意名其他角色各一张手牌。若如此做，其须选择一项：1.此【杀】结算完成后，本次因此获得牌的角色可以将一张手牌当【杀】或【过河拆桥】对其使用；2.取消此【杀】所有目标。",
	xiaobai_chenguang: "沉光",
	xiaobai_chenguang_info:
			"你受到伤害时，若你本轮未获得过牌，你可以摸一张牌，防止之；你回复体力时，若你本轮未失去过牌，你可以弃置一张牌，翻倍之。牌堆洗牌后，修改此技能。",
	xiaobai_chenzhu: "沉诛",
	xiaobai_chenzhu_info:
			"出牌阶段限一次，你可以重铸至多两张牌，然后你令一名其他角色也可如此做，若你与其被重铸的牌花色均不同，则你可以使用一张【杀】。",
	xiaobai_chuanjing: "传经",
	xiaobai_chuanjing_info:
			"当你造成或受到伤害时，你可以将牌堆底的三张牌置于牌堆顶，然后可以令你或当前回合角色用所有手牌交换牌堆顶的三张牌。",
	xiaobai_cuanhe: "攒和",
	xiaobai_cuanhe_info:
			"当你需要使用基本牌时，你可以依次与手牌数相差一、二、三的其他角色交换手牌，若因此交换了三次，你视为使用之；若你手牌数未减少，此技能本轮失效。",
	xiaobai_danggou: "党构",
	xiaobai_danggou_info:
			"锁定技，当你指定或成为【杀】的目标时，同时询问此【杀】目标的上家和下家与你：是否弃置两张牌令此【杀】额外结算一次，若没有角色因此濒死，唯一与你意见不一致的角色翻面。",
	xiaobai_danglian: "党连",
	xiaobai_danglian_info:
			"每回合各限一次，你不因使用或打出失去牌后，你可以横置并摸两张牌；你受到非属性伤害时，你可以重置并防止此伤害。",
	xiaobai_cetu: "策图",
	xiaobai_cetu_info:
			"你可以跳过额定回合，改为询问一名其他角色是否使用一张牌。若是，你可以摸两张牌并再次询问。若还是，你可以使用一张牌并再次询问。",
	xiaobai_boyi: "博议",
	xiaobai_boyi_info:
			"出牌阶段限一次，你可以执行一项：1.将一张牌当作【桃】使用；2.重铸两张牌并进行一次【闪电】判定；3.将三张手牌置于牌堆顶；4.摸四张牌并获得一个单独的“鉴戒”；然后你可以删去此项，令手牌数与你相同的任意名角色依次依序执行所有剩余项。",
	xiaobai_jianjie: "鉴戒",
	xiaobai_jianjie_info:
			"锁定技，你于出牌阶段使用牌时，若此牌与你此阶段上次使用牌的花色不同，你弃置X张牌（X为你本回合使用过的花色数）。",
	xiaobai_jiudian: "究典",
	xiaobai_jiudian_info:
			"每回合限一次，其他角色可以赠予你一张“小白杯”武将，然后摸一张牌；你可以重铸所有“小白杯”武将以视为使用一张本轮没有角色使用过的基本牌或普通锦囊牌。",
	xiaobai_jiudian_gift: "究典",
	xiaobai_jiudian_gift_info:
			"每回合限一次，出牌阶段，你可以赠予一名拥有〖究典〗的其他角色一张“小白杯”武将，然后摸一张牌。",
	xiaobai_shilang: "逝浪",
	xiaobai_shilang_info:
			"锁定技，一个势力的“小白杯”武将从牌堆中全部消逝后，你减1点体力上限，摸2张牌，然后获得一层永久的【酒】效果。",
	xiaobai_nisi: "猊伺",
	xiaobai_nisi_info:
			"魏势力技，当你对其他角色造成或受到其他角色造成的伤害后，你可以与其同时选择一项：1.变更势力至蜀；2.摸一张牌；若你与其选择项不同，则你获得其一张牌。",
	xiaobai_gengjian: "梗谏",
	xiaobai_gengjian_info:
			"你可以将所有手牌当【无懈可击】或【杀】使用，然后本技能失效至你下一次受到伤害后，此期间内你受到伤害后，你将手牌摸至四张。",
	xiaobai_zuangong: "攥功",
	xiaobai_zuangong_info:
			"准备阶段，你可以摸一张牌并与一名其他角色“协力”直到你下回合开始；“协力”成功后，出力更多的角色摸两张牌，然后出力更少的角色视为对出力更多的角色使用【推心置腹】。",
};
