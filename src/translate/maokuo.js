import { get } from "noname";

// maokuo 前缀技能翻译：主技能 name+_info；顶层子技能/牌 gaintag 只加 name（描述由父 _info 承载；gaintag 的 name 会渲染在牌面上）
export const maokuoTranslate = {
	maokuo_bolan: "博览",
	maokuo_bolan_info:
			"准备阶段，你可以亮出牌堆顶的一张牌。此回合的结束阶段，你可以选择你区域内的至少一张牌（若为手牌则展示之），若这些牌的点数之和等于亮出的牌，你摸X张牌（X为此次选择牌的数量）。",
	maokuo_bolan_jieshu: "博览",
	maokuo_canlie: "残猎",
	maokuo_canlie_info:
			"锁定技，当其他角色于你的回合内获得牌后，你对其造成1点伤害，然后若此次是你于此回合内首次发动此技能，你回复1点体力。",
	maokuo_canlie_reset: "残猎",
	maokuo_chiyan: "赤宴",
	maokuo_chiyan_info:
			"觉醒技，回合结束时，若你的体力值为1/没有手牌，你弃置所有手牌/将体力值减至1，获得“残猎”，然后再执行一个额外的回合。",
	maokuo_fushi: "浮饰",
	maokuo_fushi_info:
			"若牌堆顶的第X张牌可见（X为你某一种花色手牌的数量），当你需要使用该牌时，你可以展示所有手牌，使用之。",
	maokuo_huifo: "会佛",
	maokuo_huifo_info:
			"出牌阶段，你可以与一名其他角色同时展示一张手牌，若这两张牌的颜色：不同，将你与其展示的牌按序扣置于你的武将牌上；相同，你与其轮流获得一张“会佛”牌，直到没有“会佛”牌为止，然后你结束此回合；当你于此阶段内对另一名角色发动“会佛”后，你结束此回合。",
	maokuo_huifo_reset: "会佛",
	maokuo_juezhi: "绝志",
	maokuo_juezhi_info:
			"锁定技，当你进入濒死状态时，你将体力回复至1点，然后直到你的下回合开始，防止你受到的所有伤害；你的下回合开始前，你将武将牌替换为【怒麒·姜维】。",
	maokuo_kaodu: "考度",
	maokuo_kaodu_info:
			"出牌阶段限一次，你可以重铸一张牌，然后你可以弃置一张牌。若如此做，你可以获得场上的一张牌。",
	maokuo_kunguan: "髡冠",
	maokuo_kunguan_info:
			"锁定技，当你造成伤害或受到伤害时，若你的区域内有可见黑色牌，当前回合角色选择其中一张，你将之当【无中生有】使用。",
	maokuo_kuolue: "阔略",
	maokuo_kuolue_info:
			"一名角色的结束阶段，若你于此回合内未成为过黑色牌的目标，你可以亮出一张手牌：当你的手牌均可见时，你令手牌均不可见，摸一张牌。",
	visible_maokuo_kuolue: "阔略",
	maokuo_kuolue_hit: "阔略",
	maokuo_kuolue_hitmark: "阔略",
	maokuo_lukang: "陆抗",
	maokuo_lukang_prefix: "猫咪",
	maokuo_luomo: "落墨",
	maokuo_luomo_info:
			"每轮每种花色限一次，一名角色的弃牌阶段结束时，你可以将其于此阶段内弃置过的一张♠/♣牌当普通锦囊牌/基本牌使用。",
	maokuo_luomo_used: "落墨",
	maokuo_nishui: "逆水",
	maokuo_nishui_info:
			"游戏开始时，你将【杀】、【闪】、【桃】、【酒】各一张置于武将牌上。你可以将一张“逆水”牌移出游戏，视为使用之，然后直到游戏结束，你不能使用或打出相同名称的牌。",
	maokuo_nishui_use: "逆水",
	maokuo_qianzhen: "迁阵",
	maokuo_qianzhen_info:
			"你可以将你每轮的额定回合提前或推迟至“地势”标记所在的位置执行，然后此额定回合开始前，你将自己的座位移动到此位置。",
	maokuo_qingxuan: "清玄",
	maokuo_qingxuan_info:
			"一名角色的回合开始时，若牌堆里没有可见牌，你可以弃置一张牌，观看牌堆顶与该牌点数等量的牌，选择一项：获得其中一张点数大于该牌的牌；或令这些牌可见。",
	maokuo_qingxuan_reset: "清玄",
	maokuo_qiongshou: "穷守",
	maokuo_qiongshou_info:
			"锁定技，当你扣减体力时，若你的体力为1且有牌，你弃置一张牌，防止之。",
	maokuo_qusu: "驱速",
	maokuo_qusu_info:
			"一名角色的弃牌阶段结束时，若其于此阶段内弃置过【杀】、武器牌或伤害类锦囊牌，你可以对其造成1点伤害，然后其获得弃牌堆里其于此阶段内弃置的这些牌，执行一个额外的出牌阶段。",
	// ==================== 一蛋展示（11 名武将） ====================
	maokuo_raolue: "娆掠",
	maokuo_raolue_info:
			"每回合限一次，当你需要使用或打出【杀】/【闪】时，你可以展示一张【杀】/【闪】，然后若其他男性角色展示一张【杀】/【闪】，视为你使用或打出之。",
	maokuo_raolue_sha: "娆掠",
	maokuo_raolue_shan: "娆掠",
	maokuo_raolue_flow: "娆掠",
	maokuo_raolue_ready: "娆掠",
	maokuo_raolue_used: "娆掠",
	maokuo_shameng: "歃盟",
	maokuo_shameng_info:
			"每阶段限一次，包括你在内的任意角色于自己的出牌阶段内需要使用【杀】时，可以声明一项：弃置自己的所有手牌，或令你失去1点体力。若你同意，则执行此项，视为其使用【杀】。此【杀】结算后，其摸X张牌（X为其目标本轮内最近连续被以此法使用的【杀】指定为目标的次数，一轮结束重新计数）。",
	maokuo_shameng_btn: "歃盟",
	maokuo_shameng_used: "歃盟",
	maokuo_shameng_reset: "歃盟",
	maokuo_shidi: "示敌",
	maokuo_shidi_info:
			"你的手牌上限+X；结束阶段，你至少明置一张手牌，然后摸X张牌（X为你明置手牌的花色数）。若你有明置牌，你于回合外仅可使用明置牌，回合内仅可使用非明置牌。",
	visible_maokuo_shidi: "示敌",
	maokuo_shuirong: "衰荣",
	maokuo_shuirong_info:
			"准备阶段，你可以将手牌补至手牌上限，然后令你的手牌上限-1。",
	maokuo_shuirong_down: "衰荣",
	maokuo_simen: "死门",
	maokuo_simen_info:
			"锁定技，你的锦囊牌视为【决斗】；当你造成伤害后，你回复等量的体力；你不以此法回复体力时，防止之；当你杀死其他角色后，你不执行奖惩。",
	maokuo_siqian: "思虔",
	maokuo_siqian_info:
			"当你成为【杀】的目标后，你可以摸一张牌并展示之，若你的武将牌上：没有此花色的牌，你须将之置于武将牌上；有此花色的牌，你于此回合内再次成为此花色牌的目标时，你不能发动“思虔”。",
	maokuo_siqian_ban: "思虔",
	maokuo_songjiu: "颂酒",
	maokuo_songjiu_info:
			"一名角色的出牌阶段开始时，你可以展示任一角色的一张手牌，令该牌视为【酒】直到本轮结束，且“颂酒”失效直到本轮结束或当【酒】被使用时。",
	maokuo_songjiu_tag: "酒",
	maokuo_songjiu_v: "颂酒",
	maokuo_songjiu_restore_jiu: "颂酒",
	maokuo_songjiu_restore_round: "颂酒",
	maokuo_suizhi: "遂志",
	maokuo_suizhi_info:
			"当你受到伤害后，你可以获得装备区里、判定区里和武将牌上的所有牌，然后翻面；若你的武将牌背面朝上，防止你受到的伤害。",
	maokuo_suizhi_protect: "遂志",
	maokuo_tianqian: "天堑",
	maokuo_tianqian_info:
			"游戏开始时，你获得1枚“地势”标记（正面为“山”，负面为“泽”）；回合开始时，或当你受到伤害后，你将“地势”标记以“山”或“泽”的形式置于两名相邻角色的座位之间。",
	maokuo_wuci: "婺辞",
	maokuo_wuci_info:
			"其他角色的弃牌阶段开始时，若其手牌数大于手牌上限，你可以获得其一张手牌并展示之。若此牌为基本牌或普通锦囊牌，你视为使用之并将此牌的使用目标改为其。",
	maokuo_xiangxie: "相携",
	maokuo_xiangxie_info:
			"你于回合外可以将一张/二张/三张相同花色的牌置于武将牌上，视为使用一张【闪】/【桃】/【无懈可击】；准备阶段，你令一名角色获得所有“相携”牌。",
	maokuo_xiangxie_shan: "相携",
	maokuo_xiangxie_tao: "相携",
	maokuo_xiangxie_wuxie: "相携",
	maokuo_xiangxie_get: "相携",
	maokuo_xiaoxing: "肖形",
	maokuo_xiaoxing_info:
			"回合开始/结束时，你可以重铸一张♥/♦手牌，然后你视为装备着场上由你指定的一张装备牌，直到你此回合结束时/下回合开始时。",
	maokuo_xiaoxing_equip: "肖形",
	maokuo_xinwang: "心往",
	maokuo_xinwang_info:
			"结束阶段，你可以将手牌数调整为两张，然后若你的手牌均为❤️，你可以展示所有手牌，亮出牌堆顶的一张牌并获得之。重复此流程，直到以此法获得❤牌。",
	maokuo_xinyi: "信意",
	maokuo_xinyi_info:
			"一名角色弃牌阶段开始前，你可以明置X张手牌（X为其超出手牌上限的手牌数，且至多为你的暗置手牌数），令其跳过此阶段；其他角色造成伤害时，该角色可以令你为伤害来源。",
	visible_maokuo_xinyi: "信意",
	maokuo_xuejian: "血溅",
	maokuo_xuejian_info: "限定技，出牌阶段，若你未受伤，你可以杀死一名角色。",
	maokuo_xuezheng: "血征",
	maokuo_xuezheng_info:
			"出牌阶段开始时，你可以令一名角色展示所有手牌，该角色须依次使用其中可使用的牌；若该角色为你，你先重铸其中所有不能使用的牌，并令你本回合使用牌无距离和次数限制。",
	maokuo_xunyi: "寻夷",
	maokuo_xunyi_info:
			"回合开始时，你可以令你的手牌上限和攻击范围+1，然后若你的攻击范围不小于存活角色数，你失去“寻夷”。",
	maokuo_xunyi_up: "寻夷",
	maokuo_yumou: "预谋",
	maokuo_yumou_info:
			"其他角色的出牌阶段开始时，你可以展示两张不同颜色的手牌，然后其选择一项：1.获得黑色牌，其摸一张牌；2.获得红色牌，你摸一张牌。",
	maokuo_zhanhao: "战嚎",
	maokuo_zhanhao_info:
			"锁定技，你的第一个回合开始时，你令所有角色弃置各自区域内的所有牌，然后所有【闪】均视为【杀】、【桃】均视为【酒】，直到你的下回合结束。",
	maokuo_zhidi: "制地",
	maokuo_zhidi_info:
			"锁定技，当一名角色使用牌指定唯一目标后，若该角色计算与目标角色的距离时越过了“山”标记，目标角色摸一张牌；越过了“泽”标记，其弃置目标角色的一张牌。",
	maokuo_zhuzan: "著贊",
	maokuo_zhuzan_info:
			"当一名角色使用【杀】时，你可以将一张牌置于武将牌上。当此【杀】结算后，若此【杀】没造成过伤害，你可以将至少一张“著贊”牌置入弃牌堆，其摸等量的牌。",
	maokuo_zhuzan_after: "著贊",
	maokuo_zuishi: "醉世",
	maokuo_zuishi_info:
			"锁定技，你使用【酒】后，摸一张牌；你死亡后，你依然能以发动“颂酒”的形式参与游戏，且将消耗改为“观看一名角色的手牌并展示其中一张”。",
};
