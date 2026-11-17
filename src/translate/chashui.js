/**
 * 茶水贤设 · 技能译名（`chashui_*`）
 *
 * 每个技能都要 `id: "技能名"` + `id_info: "描述"`；
 * 描述里引用**其他技能名**用 `${get.poptip("技能id")}`，牌名用【】；
 * 判定细则/作者注用 `id_append`（只进技能浮窗，不进 prompt2）。
 *
 * 内嵌 subSkill / 纯内部辅助技：只写 `name`，不写 `_info`（说明由父技能承载）。
 */
import { get } from "noname";

export const chashuiTranslate = {
	// ==================== 典满 ====================
	chashui_jiyong: "继勇",
	chashui_jiyong_info:
		"当你使用一张描述含「【杀】」的非【杀】牌结算后，你可以视为使用一张无距离次数限制的【杀】。",
	chashui_chenglie: "承烈",
	chashui_chenglie_info:
		"每回合限一次，当你造成或受到伤害后，你可以移动你场上的一张牌，若如此做，你令获得牌的角色回复1点体力。",

	// ==================== 马钧 ====================
	chashui_qiaozhu: "巧筑",
	chashui_qiaozhu_info:
		"一名角色出牌阶段限一次，其可以交给你一张牌并展示，你可以重铸任意张非此类型的牌，然后你可以交给其任意张此类型的牌。",
	chashui_qiaozhu_o: "巧筑",
	chashui_qiaozhu_o_info:
		"出牌阶段限一次，你可以交给拥有〖巧筑〗的角色一张牌并展示，其可以重铸任意张非此类型的牌，然后其可以交给你任意张此类型的牌。",
	chashui_jingnu: "精弩",
	chashui_jingnu_info: `当你一次性获得或失去至少X张牌时（你于回合外发动${get.poptip("chashui_qiaozhu")}重铸与给出牌除外），你可以令当前回合角色本回合攻击范围和使用【杀】的次数上限+X（X为当前回合角色攻击范围）。`,
	chashui_jingnu_buff: "精弩",

	// ==================== 霍峻 ====================
	chashui_jianju: "坚拒",
	chashui_jianju_info: `结束阶段，你可以摸你攻击范围内含有的角色数张牌，若如此做，直到你的下个准备阶段，你可以将一张红色/黑色手牌当【闪】/【无懈可击】使用或打出。你因使用${get.poptip("chashui_jianju")}转化的牌失去一种花色的手牌后，你可以于当前回合结束阶段视为对当前回合角色使用一张【决斗】。`,
	chashui_jianju_on: "坚拒",
	chashui_jianju_loseall: "坚拒",
	chashui_jianju_loseall_duel: "坚拒",

	// ==================== 殷观 ====================
	chashui_yingfa: "应伐",
	chashui_yingfa_info:
		"出牌阶段限一次，你可以令两名其他角色同时选择是否对你选择的另一名角色使用【杀】（无距离限制），若均选择：是这些【杀】目标改为你；否，你获得其中一名角色一张牌。",
	chashui_zhiyue: "制越",
	chashui_zhiyue_info:
		"当你受到伤害后，你可以亮出牌堆顶的三张牌，并将其中任意张交给一名角色，该角色声明等量花色，展示所有手牌然后弃置此花色的所有手牌。",

	// ==================== 桓阶 ====================
	chashui_nianzhi: "捻止",
	chashui_nianzhi_info:
		"你的手牌数变化后，若其中每种花色的牌数均相等，你可以展示所有手牌并令当前回合角色摸等量于花色数张牌，然后其本回合不能使用这些花色的牌。",
	chashui_nianzhi_ban: "捻止",
	chashui_qisang: "乞丧",
	chashui_qisang_info: "限定技，其他角色死亡时，你可以弃置一张牌并选择一名角色，其获得死亡角色的所有牌。",

	// ==================== 钟离牧 ====================
	chashui_pingyue: "平越",
	chashui_pingyue_info: "当你需要使用一张【杀】时，若你的攻击范围大于0，你可以视为使用一张【杀】，然后你本轮攻击范围-1。",
	chashui_pingyue_down: "平越",
	chashui_pingyue_used: "平越",
	chashui_anjing: "安境",
	chashui_anjing_info: "每轮开始时，你攻击范围+1（至多+5）。每阶段结束时，若有角色攻击范围与此阶段开始时不相等，你可以使用一张【杀】。",
	chashui_anjing_range: "安境",
	chashui_anjing_record: "安境",
	chashui_anjing_use: "安境",

	// ==================== 波才 ====================
	chashui_zhuojun: "捉骏",
	chashui_zhuojun_info:
		"当你于出牌阶段指定第二名目标的牌结算结束后，你可以视为对本阶段你指定的前两名目标间（含其）最短路径上任意名连续角色使用【南蛮入侵】，此【南蛮入侵】造成的伤害均视为雷电伤害，若有角色打出火【杀】响应此牌，其对你造成1点火焰伤害。",

	// ==================== 郑泰 ====================
	chashui_huize: "恢泽",
	chashui_huize_info:
		"游戏开始时，你将牌堆顶五张牌背面朝上排列于武将牌上，称为“泽”。准备阶段，你可以展示并置换两张“泽”的位置，然后令至多X名角色各摸一张牌（X为这两张“泽”之间的牌数）。",
	chashui_chouren: "筹刃",
	chashui_chouren_info:
		"出牌阶段，若所有“泽”点数依次递增或递减，你可以展示之并对一名角色造成2点伤害，然后打乱之。每轮结束时，体力值唯一最多的角色可以令你回复1点体力，然后用一张牌替换一张“泽”。",

	// ==================== 司马孚 ====================
	chashui_xunde: "勋德",
	chashui_xunde_info: "当你的手牌数发生变化后，你可以令一名手牌数等于你的角色摸一张牌，若该角色为你，则此技能本回合失效。",
	chashui_lizang: "礼葬",
	chashui_lizang_info:
		"每个回合的结束阶段，若本回合内有角色进入过濒死状态，你可与当前回合角色依次弃牌，直至以此法弃置的牌达到四种花色或一方失去最后一张手牌。",

	// ==================== 王濬 ====================
	chashui_lianfang: "连舫",
	chashui_lianfang_info:
		"准备阶段，你可以令至多X+1名角色同时选择一张牌重铸，然后你获得其中一种类别的牌（X为你装备区牌数）。",
	chashui_ranjiang: "燃江",
	chashui_ranjiang_info:
		"你可以将装备区一张牌当火【杀】使用（无距离与次数限制），结算结束后，若未造成伤害，此技能本回合失效。你使用的火【杀】至多指定X名角色为目标（X为你装备区牌数）。",

	// ==================== 茶水贤设·晌 ====================
	// —— 曹洪 ——
	chashui_zaobing: "躁兵",
	chashui_zaobing_info:
		"当你成为过锦囊牌目标的回合结束时，你可视为对当前回合角色使用一张无距离限制的【杀】。若此【杀】未对其造成伤害，其可弃置你两张牌。",
	chashui_zaobing_back: "躁兵",
	chashui_yuanbo: "援搏",
	chashui_yuanbo_info:
		"当一名其他角色使用【杀】指定你攻击范围的角色为目标后，你可以令目标角色弃置一至两张牌并摸等量张牌，若其因此弃置了装备牌，则此【杀】对其无效，且此【杀】使用者视为对你使用一张【决斗】。",

	// —— 应玚 ——
	chashui_pianpian: "篇翩",
	chashui_pianpian_info:
		"你可以将两张点数相邻的牌当任意基本牌使用；若转化牌名与上次不同，你摸一张牌；若本次与上次转化的底牌点数恰好连成四张连续的牌（如先3、4后5、6），你回复1点体力。",
	chashui_juejue: "珏决",
	chashui_juejue_info:
		"锁定技，结束阶段，你失去1点体力，摸一张牌并始终明置之，此牌点数视为场上没有的任意点数直至你失去此牌。",
	chashui_juejue_num: "珏决",
	chashui_juejue_clear: "珏决",
	// 明置标签（必须有 name）
	"visible_chashui_juejue": "珏决",

	// —— 王平 ——
	chashui_feijun: "飞军",
	chashui_feijun_info:
		"结束阶段结束时，你可以摸三张牌并将手牌数弃置体力上限。若以此法弃置的牌数小于你的体力值，你调整此技能的发动阶段，否则你增加一点体力上限。",

	// —— 王崇 ——
	chashui_hongcui: "弘粹",
	chashui_hongcui_info:
		"你可以将任意张牌当一张牌名字数为你以此法使用牌的牌名字数和的普通锦囊牌使用。若你以此法至少使用了两张牌，则你摸一张牌。",
	chashui_zaide: "载德",
	chashui_zaide_info:
		"出牌阶段，你可以重铸任意张花色/点数/类型相同的牌，然后你可以令至多等量名角色各摸一张牌，本回合你不能再以此法重铸该花色/点数/类型的牌。",
	chashui_zaide_clear: "载德",

	// —— 韦曜 ——
	chashui_juzheng: "据正",
	chashui_juzheng_info:
		"其他角色使用伤害牌时，你可以将一张与此牌类型相同牌名不同的牌置于牌堆顶，取消此牌所有目标并获得此牌。此回合结束时，若本回合没有角色受到伤害，你弃置X张牌并摸等量牌（X为本回合此技能发动次数）。",
	chashui_juzheng_end: "据正",
	chashui_sheniang: "蔎酿",
	chashui_sheniang_info: "锁定技，若你的体力值大于/小于当前游戏轮数，你手牌中的【酒】/【桃】视为【桃】/【酒】。",

	// —— 程普 ——
	chashui_fenpan: "焚叛",
	chashui_fenpan_info:
		"出牌阶段限一次，你可以视为对任意名手牌数相同的角色使用一张【火攻】，若有目标角色因此死亡，你失去1点体力或弃两张牌。",
	chashui_dangkou: "荡寇",
	chashui_dangkou_info:
		"当你使用伤害类锦囊牌指定首个目标后，你可展示所有手牌。此牌结算后，若此牌造成了伤害，你摸X张牌（X为你展示牌中缺少的花色数）。",
	chashui_dangkou_draw: "荡寇",

	// —— 郑玄 ——
	chashui_zhujing: "注经",
	chashui_zhujing_info:
		"准备阶段，你可以将一张基本牌当一张非伤害类普通锦囊牌使用，直到你下回合开始，所有角色出牌阶段限一次，其可将一张此牌名的基本牌当一张此牌名的普通锦囊牌使用。",
	chashui_zhujing_other: "注经",
	chashui_zhujing_other_info:
		"出牌阶段限一次，你可以将一张「注经」所记录牌名的基本牌，当所记录牌名的普通锦囊牌使用。",
	chashui_zhujing_clear: "注经",
	chashui_zhuwo: "注我",
	chashui_zhuwo_info:
		"限定技，回合结束时，若你本局游戏已失去过所有牌名的基本牌，你可以展示牌堆顶六张牌，然后依次用其中的基本牌发动“注经”。",
	chashui_zhuwo_record: "注我",

	// —— 张温 ——
	chashui_weibing: "威兵",
	chashui_weibing_info:
		"你使用伤害类牌指定目标后，可以亮出牌堆顶三张牌，令目标角色依次选择一项：1.弃置点数和大于当前亮出牌点数和的任意张手牌，令此牌对其无效；2.令你获得一张亮出牌。",
	chashui_hanlv: "汉律",
	chashui_hanlv_info:
		"锁定技，若牌堆未洗过牌，当你受到大于1点的伤害时，将伤害值改为1点；当你使用单目标伤害类牌时，多指定一名目标角色。",
	chashui_hanlv_target: "汉律",
	chashui_hanlv_mark: "汉律",

	// —— 石苞 ——
	chashui_zuojing: "佐靖",
	chashui_zuojing_info:
		"限定技，你可以视为使用一张基本牌或【无懈可击】。此技能的状态为已发动时，你每回合首次不通过此法使用与以此法使用过的同名牌时，可以重置此技能或令一名角色摸两张牌。",
	chashui_zuojing_again: "佐靖",
	chashui_fenwu: "奋务",
	chashui_fenwu_info:
		"每回合限一次，当一名角色弃置至少两张牌后，你可以令其依次重铸两张牌，若这两张牌颜色相同，其可以收回弃置牌中一张牌。",

	// —— 左思 ——
	chashui_zhuanfu: "撰赋",
	chashui_zhuanfu_info:
		"游戏开始时，你从牌堆获得一张普通锦囊牌。每种牌名限一次，出牌阶段，你可以将一张普通锦囊牌置于武将牌上，称为“赋”，然后重置“誊钞”中X的值。",
	chashui_zhuanfu_start: "撰赋",
	chashui_tengchao: "誊钞",
	chashui_tengchao_info:
		"每名角色的回合限一次，其可以将至少X+1张牌当与任意一张“赋”牌名相同的牌使用（X为以此法使用的上一张牌对应的实体牌数且至少为1）。此牌结算后，你可以获得这些牌中的一张。",
	chashui_tengchao_o: "誊钞",
	chashui_tengchao_o_info:
		"每名角色的回合各限一次，你可以将至少X+1张牌当与任意一张“赋”牌名相同的牌使用（X为以此法使用的上一张牌对应的实体牌数且至少为1，见拥有〖誊钞〗的角色）。此牌结算后，拥有〖誊钞〗的角色可以获得这些牌中的一张。",
	chashui_tengchao_gain: "誊钞",
	// ===== 茶水贤设·昳（tea_ex_c） =====
	chashui_liaoge: "料戈",
	chashui_liaoge_info: "其他角色回合开始时，你可将一张牌扣置于武将牌上，并于回合结束时展示之。若此牌为黑色/红色且本回合有/没有角色使用过【杀】，你获得此牌并摸一张牌，否则你弃置之。",
	chashui_guijian: "规鉴",
	chashui_guijian_info: "每回合限一次，你可以将手牌调整至体力上限，视为使用一张基本牌。若以此法获得牌，本回合你使用牌时弃一张牌。",
	chashui_guijian_used: "规鉴",
	chashui_guijian_debuff: "规鉴",
	chashui_lianhe: "连壑",
	chashui_lianhe_info: "出牌阶段，你可将体力值最大或手牌数最多的角色的一张手牌当【决斗】对一名本回合未以此法选中的角色使用。若转化底牌为【杀】，此牌结算后你获得之。若因此受伤的角色存活，你下次发动此技能须选择其邻家的手牌。",
	chashui_lianhe_clear: "连壑",
	chashui_xifeng: "熄锋",
	chashui_xifeng_info: "每回合限一次，当你造成或受到伤害后，你可以防止此伤害，令受伤角色获得其装备区所有牌，并弃置X张牌（X为其获得牌数），然后你可以将其以此法弃置的【杀】分配给任意名角色。",
	chashui_chengquan: "承权",
	chashui_chengquan_info: "一号位的结束阶段，你可以令攻击范围内包含其的所有角色选择一项：1.摸一张牌并交给其一张手牌；2.对其使用一张【杀】。",
	chashui_roujia: "柔嘉",
	chashui_roujia_info: "当一名角色使用【杀】结算结束后，若此【杀】未对目标角色造成伤害，你可以令当前回合角色摸一张牌。",
	chashui_suizuo: "随佐",
	chashui_suizuo_info: "每轮开始时，你可以横置你和一名其他角色（若你已横置，则改为横置两名其他角色），令所有已横置的角色各摸一张牌。每轮限X次（X为你的体力值），一名已横置的角色回合开始时，你可以摸一张牌并交给其一张牌。",
	chashui_suizuo_round: "随佐",
	chashui_suizuo_turn: "随佐",
	chashui_shanmeng: "山盟",
	chashui_shanmeng_info: "每回合限一次，当一名已横置的角色成为牌的目标时，你可以令其他已横置的角色依次交给其任意张牌。",
	chashui_mengsong: "梦松",
	chashui_mengsong_info: "判定阶段/摸牌阶段，你可以改为将判定区里所有牌/牌堆顶的牌当做一张【树上开花】使用。",
	chashui_xiangqian: "相谦",
	chashui_xiangqian_info: "出牌阶段限一次，你可观看一名其他角色的手牌，若你手牌中有与其手牌中牌名相同的牌，你可重铸之。若如此做，其观看你的手牌，若其手牌中有与你手牌中牌名相同的牌，其可重铸之。",
	chashui_guye: "固业",
	chashui_guye_info: "每个阶段结束时，若有角色于此阶段不因使用或打出而失去至少两张牌，你可令其摸一张牌。",
	chashui_shanji: "善济",
	chashui_shanji_info: "出牌阶段限一次，你可以弃置所有手牌，令所有已受伤的角色依次选择一项：1.回复1点体力；2.复原武将牌并摸一张牌。",
	chashui_debao: "德报",
	chashui_debao_info: "当你进入濒死状态时，其他角色可以依次将任意张手牌置于牌堆顶，若以此法置于牌堆顶的牌不少于X张，你回复1点体力并摸X张牌（X为你的手牌数），然后此技能本轮失效。",
	chashui_chizong: "持宗",
	chashui_chizong_info: "出牌阶段各限一次，你可以令一名手牌数最多/体力值最大的角色回复1点体力/摸两张牌。当你每回合对同一名角色发动两次“持宗”后，其视为使用一张【万箭齐发】。",
	chashui_chizong_clear: "持宗",
	chashui_yihuo: "溢祸",
	chashui_yihuo_info: "当你受到1点伤害后，你可以摸一至三张牌，然后令手牌数最多的角色依次弃置X张手牌（X为需要弃牌的角色数）。",
	chashui_woluan: "握乱",
	chashui_woluan_info: "锁定技，准备阶段，你选择任意项：1.你摸X张牌；2.你弃置X名角色各一张牌；3.本回合你使用的第一张牌执行X次（至少为1）；4.本回合你的攻击范围+X（X为你未选择的项数）。",
	chashui_woluan_effect: "握乱",
	chashui_woluan_range: "握乱",
	chashui_raoguo: "扰国",
	chashui_raoguo_info: "锁定技，你使用【杀】和普通锦囊牌无距离和次数限制且仅能指定你攻击范围内与你距离最远的角色为目标。",
	chashui_shiwan: "食万",
	chashui_shiwan_info: "准备阶段，你可以摸一张牌，然后令手牌数最多的角色依次弃至少X张牌，若这些角色不包含你，你可以重复此流程（X为你此阶段的摸牌数）。",
	chashui_xiluan: "悉乱",
	chashui_xiluan_info: "限定技，结束阶段，你可以将本回合进入弃牌堆的任意张伤害牌明置于一名角色的武将牌旁，若当前游戏轮数小于3/不小于3，其受到同名牌造成的伤害-1/+1。",
	chashui_xiluan_damage: "悉乱",
	chashui_tongzhi: "通质",
	chashui_tongzhi_info: "出牌阶段限一次，你可以选择一名其他角色，你与其将两张手牌扣置于对方的武将牌上（不足则全扣），然后于各自的回合开始时获得各自武将牌上的牌。",
	chashui_tongzhi_mark: "通质",
	chashui_yishu: "疑术",
	chashui_yishu_info: "当你需要使用一张射【杀】时，你可以展示两张手牌，并将一张点数位于这两张牌之间的牌当射【杀】使用。若此牌点数处于你武将牌上“通质”牌点数之间，你与此牌目标各受到1点无来源伤害。",
	chashui_yishu_damage: "疑术",
	// ===== 茶水贤设·晡（tea_ex_d） =====
	chashui_kuitian: "窥天",
	chashui_kuitian_info:
		"锁定技，牌堆顶第X张牌始终对你可见（X为你的体力上限）。你可以使用或打出此牌，然后本轮你可见牌前移一位。",
	chashui_kuitian_use: "窥天",
	chashui_kuitian_reset: "窥天",
	chashui_shixiang: "饰相",
	chashui_shixiang_info:
		"限定技，出牌阶段，你可以令一名已受伤的其他角色将体力回复至上限，然后本局游戏其体力值即将变化时，此变化值+1。",
	chashui_shixiang_buff: "饰相",
	chashui_qiuqiu: "赇求",
	chashui_qiuqiu_info:
		"出牌阶段限一次，你可以声明场上的一张牌，本回合你对场上有此牌的角色使用牌无距离和次数限制，且当你对其使用牌结算结束后，其可以移动之。结束阶段，若你为其，则你摸两张牌，否则你失去1点体力。",
	chashui_qiuqiu_delay: "赇求",
	chashui_qiuqiu_end: "赇求",
	chashui_xuanfeng: "悬锋",
	chashui_xuanfeng_info:
		"限定技，出牌阶段，你可以将一张牌当【闪电】使用。当此牌位于你/其他角色的判定区时，其他角色/你可以视为使用或打出一张【杀】，然后令此牌进行判定。",
	chashui_xuanfeng_use: "悬锋",
	chashui_xuanfeng_active: "悬锋",
	chashui_xuanfeng_clear: "悬锋",
	chashui_xuanfeng_active_judge: "悬锋",
	chashui_dianjie: "点解",
	chashui_dianjie_info:
		"每轮开始时，你选择一名其他角色，本轮第一/二/三张【杀】结算后，你卜算2/其卜算1/你卜算3。因此技能卜算时，你与其互相可见，然后你可以令你或其使用其中一张牌，若造成伤害，此技能本轮失效。",
	chashui_dianjie_trigger: "点解",
	chashui_dianjie_disabled: "点解",
	chashui_xiaobai: "晓白",
	chashui_xiaobai_info:
		"每轮限一次，当有角色受到伤害后，你可以亮出牌堆底四张牌（若为属性伤害则改为六张），若其中有牌与造成此伤害的牌牌名相同，你获得其中另外两张牌名不同的牌。",
	chashui_xiaobai_reset: "晓白",
	chashui_qiwei: "绮位",
	chashui_qiwei_info:
		"出牌阶段限一次，你可以与一名角色拼点，赢的角色获得所有拼点牌，然后另一名角色摸X张牌（X为此次拼点牌中没有的花色数）。",
	chashui_wangjian: "妄谮",
	chashui_wangjian_info:
		"出牌阶段结束时，你可以与一名其他角色各自将手牌数调整至体力上限（至多摸5张牌），然后你与其展示手牌，♥较少的角色对♥较多的角色造成1点伤害。",
	chashui_sixiang: "四相",
	chashui_sixiang_info:
		"游戏开始时，你摸四张牌并将四张牌以任意顺序置于你武将牌的东南西北方位，称为“风”。当你每回合首次使用一种花色的牌后，若“风”中包含此花色，你可以转动“风”（你的回合内顺时针，否则逆时针）。<br><font color='gray'>（东风对应♠、南风对应♥、西风对应♣、北风对应♦）</font>",
	chashui_sixiang_use: "四相",
	chashui_souliu: "飕飗",
	chashui_souliu_info:
		"锁定技，当“风”转动后，若X为0，防止你本回合受到的属性伤害和锦囊牌伤害；若X不为0，你用牌堆顶X张牌交换等量的“风”，然后可令一名角色摸至多X张牌（X为四个方位里花色对得上的个数，即东风♠、南风♥、西风♣、北风♦）。",
	chashui_souliu_clear: "飕飗",
	chashui_shichong: "恃宠",
	chashui_shichong_info:
		"一号位的回合结束时，你可以选择以下两项，令一名有手牌的其他角色从其中选择一项：1.将一张牌当你指定的基本牌使用；2.将其一张手牌当【杀】使用；3.对你指定的角色使用一张手牌。",
	chashui_fangzi: "放恣",
	chashui_fangzi_info:
		"转换技，每回合限一次，你可以将一张牌（阳）/三张牌（阴）当【酒】或【无中生有】使用，然后你须与一名手牌数与你相同的角色交换手牌。",
	chashui_fangzi_swap: "放恣",
	chashui_fujie: "符节",
	chashui_fujie_info:
		"出牌阶段限一次，你可以重铸至少两张点数连续的牌（X为这些牌的张数），视为对至多X名角色使用一张【桃】。若你的体力值不小于X，你令这些角色依次选择一项：重铸一张点数在区间内的牌，或受到2点雷电伤害。",
	chashui_fujie_append: "「区间」指以此法重铸的牌的点数范围（这组连续点数的最小值至最大值）。",
	chashui_xuzhong: "蓄众",
	chashui_xuzhong_info:
		"出牌阶段，你可以观看牌堆顶三张牌，然后获得其中点数与你手牌均不同且在点数最大与最小之间的牌。若你未以此法获得牌，你失去1点体力并获得这些牌，本回合此技能失效。",
	chashui_xuzhong_disabled: "蓄众",
	chashui_dengjie: "登阶",
	chashui_dengjie_info:
		"出牌阶段限一次，你可重铸装备区里所有牌，然后重铸更多张锦囊牌，最后重铸更多张基本牌。当你以此法重铸牌后，弃置手牌数大于你的角色一张牌，若没有手牌数大于你的角色，你摸一张牌。",
	chashui_tizheng: "替政",
	chashui_tizheng_info:
		"其他角色视为拥有目标仅为你的“放权”。每轮限一次，其他角色的出牌阶段开始时，你可以弃置三张类型不同的牌令其发动“放权”，然后其获得这些牌。",
	chashui_tizheng_fangquan: "放权",
	chashui_tizheng_fangquan_info:
		"其他角色的出牌阶段开始前，其可以跳过此阶段。若如此做，此回合结束时，其可以弃置一张手牌，令拥有【替政】的角色获得一个额外回合。",
	chashui_tizheng_fq_rider: "放权",
	chashui_tizheng_used: "替政",
	chashui_lianxiu: "炼修",
	chashui_lianxiu_info:
		"锁定技，你的所有阶段均改为：重铸任意张手牌，然后你可使用一张与你本回合使用的上一张牌类型不同的牌。你每回合首次失去最后一张手牌后摸三张牌。回合结束时，若你的手牌数大于3，你将手牌弃置至三张并回复1点体力。",
	chashui_lianxiu_lose: "炼修",
	chashui_lianxiu_end: "炼修",
	chashui_lianxiu_clear: "炼修",
	chashui_lianxiu_free: "炼修",
	chashui_jiangdao: "讲道",
	chashui_jiangdao_info:
		"回合开始时，你可以选择一名角色，若其手牌数：为0，其摸三张牌；大于3，其将手牌调整至三张并回复1点体力；否则，其重铸任意张手牌，然后可使用一张牌。",
	chashui_zhengyin: "正音",
	chashui_zhengyin_info:
		"转换技，每轮每种牌名限一次。阳：你可以将至少X张红色牌当做任意一张基本牌或普通锦囊牌使用；阴：你可以展示X张黑色牌并将之置于牌堆顶，视为使用任意一张基本牌或普通锦囊牌（X为本轮发动此技能的次数+1，至多为体力值）。",
	chashui_zhengyin_clear: "正音",
	chashui_chuaicun: "揣存",
	chashui_chuaicun_info: "锁定技，当你使用牌造成伤害后，若此牌为红色，你失去1点体力，否则你回复1点体力。",

	// ===== 茶水贤设·曛（tea_ex_e） =====
	chashui_andong: "安东",
	chashui_andong_info:
		"出牌阶段，若你的手牌中有【杀】，你可以展示所有手牌，重铸其中所有【杀】，然后摸一张牌，令一名有手牌的其他角色展示手牌，重铸其中所有【闪】。当你受到伤害后，你可以展示所有手牌，重铸其中所有【闪】，若你以此法重铸过牌且你已受伤，你回复1点体力，然后伤害来源展示手牌，重铸其中所有【杀】。",
	chashui_yingshi: "应势",
	chashui_yingshi_info:
		"锁定技，当你获得牌后，若你以此法获得的牌数为1，你令此牌获得“应势”标记（其他手牌上的标记被清除）。你使用带有“应势”标记的牌时，此牌结算两次；当你失去带有“应势”标记的牌后，若你不是因使用而失去此牌，你观看一名角色的手牌。",
	chashui_lanxin: "兰心",
	chashui_lanxin_info:
		"出牌阶段或当你受到伤害后，若你的手牌数大于体力值，你可以弃置至少一张手牌，然后将手牌数调整至你的体力值。每回合限一次，若你以此法弃置的牌数大于获得的牌数+1且你已受伤，你回复1点体力。",
	chashui_kunyi: "坤仪",
	chashui_kunyi_info:
		"当你使用牌指定目标后，你可以令其中一名目标摸一张牌。若其本阶段未获得过牌，你摸两张牌。",
	chashui_benhan: "奔汉",
	chashui_benhan_info:
		"每回合限一次，本回合你执行的第X个阶段结束时，你可以将手牌数调整至X。若你的手牌数：未因此变化，本技能本回合的限制次数+2；减少，你本局出牌阶段额定使用【杀】的次数+1；增加，你将下个阶段改为出牌阶段。",
	chashui_shushen: "淑慎",
	chashui_shushen_info:
		"每回合限一次，当你获得牌后，你可以重铸任意张花色各不相同的牌，然后当前回合角色本回合下次使用与这些牌花色均不同的牌后，你可以令其摸等量张牌。",
	chashui_xiuren: "修仁",
	chashui_xiuren_info:
		"转换技，当一名角色回复体力后，①你可以令其摸两张牌；②其可以令你摸两张牌。",
	chashui_zhenqu: "振躯",
	chashui_zhenqu_info:
		"出牌阶段限一次，你可以将一张牌当【决斗】使用。此牌指定目标后，该目标须选择一项：1.此牌结算两次；2.此牌结算方式改为：由目标开始，双方轮流将一张【闪】交给一名除双方外的角色，先无法交出【闪】的一方受到对方造成的1点伤害。",
	chashui_chuangxun: "创勋",
	chashui_chuangxun_info:
		"当你受到过伤害的回合结束时，你可以分配牌堆顶两张牌。本回合每满足一项，牌数翻倍：你造成过伤害；有角色进入过濒死。未分配的牌由你获得。",
	chashui_yanzhu: "宴诛",
	chashui_yanzhu_info:
		"出牌阶段限一次，你可以将一张【杀】当【五谷丰登】使用。此牌结算结束后，你可以对一名装备区牌数不小于你的角色造成1点伤害，然后以此法获得基本牌或普通锦囊牌的其他角色可以依次对其使用一张伤害牌（无距离与次数限制）。",
	chashui_xingxue: "兴学",
	chashui_xingxue_info:
		"当你于回合内首次使用一种牌名字数的牌时，你可以令至多X名角色各摸一张牌（X为你本回合发动此技能的次数），然后其中手牌数大于体力值的角色须将至少一张牌置于牌堆顶。",
	chashui_zhaofu: "诏缚",
	chashui_zhaofu_info:
		"主公技，限定技，准备阶段，你可以横置一名其他角色，直到其下次重置前，吴势力角色对其使用牌无次数限制，且其不能响应牌。",
	chashui_zhaofu_eff: "诏缚",
	chashui_zhaofu_global: "诏缚",
	chashui_tonglun: "同纶",
	chashui_tonglun_info:
		"准备阶段，你可以令任意名角色同时选择一项：摸一张牌，或弃置一张牌。若手牌数与你相同的角色数因此变多，你可以重复此流程。",
	chashui_yinhe: "隐壑",
	chashui_yinhe_info:
		"结束阶段，你可以将手牌数调整至一个不为场上最多且不与任何其他角色相同的数值。手牌数与你不同的角色使用【杀】不能指定你为目标。",
	chashui_jiexin: "竭心",
	chashui_jiexin_info:
		"你可以将两张牌当【无懈可击】或【闪】使用，然后获得等同于其中红色牌数的【影】；若你未获得【影】，你隐匿。",
	chashui_fenyuan: "焚缘",
	chashui_fenyuan_clear: "焚缘",
	chashui_fenyuan_info:
		"隐匿技，你登场的回合结束时，你可以将一张手牌当【出其不意】使用；若你以此法使用或展示的牌为黑桃，你可以重复此流程。",
	chashui_hongkuang: "弘旷",
	chashui_hongkuang_info:
		"摸牌阶段结束时，你可以使用此阶段获得的任意张手牌；然后若你于此阶段使用的牌数等于你的体力值，你执行一个额外的摸牌阶段。",
	chashui_jianzhi: "坚执",
	chashui_jianzhi_info:
		"锁定技，当你每阶段首次使用伤害牌时，你摸一张牌然后弃置一张牌。若弃置的牌与摸到的牌牌名不同，此牌无效，且你本回合不能使用与之同名的牌；若牌名相同，此阶段结束时，你展示所有手牌，然后依次使用其中与之同名的牌。",
	chashui_bingxin: "冰心",
	chashui_bingxin_info:
		"当你造成或受到伤害时，你可以依次弃置受到伤害的角色两张牌，防止此伤害，然后你可以令一名其他已受伤角色回复1点体力。",
	chashui_deqing: "德清",
	chashui_deqing_info:
		"摸牌阶段或弃牌阶段开始时，你可以改为与一名其他角色拼点：若你赢，你将手牌摸至体力上限；若你没赢，其对你造成1点伤害。然后结束此阶段。",
	chashui_benhan_clear: "奔汉",
	// ===== 茶水贤设·晏（tea_ex_sp）=====
	chashui_zhidai: "至殆",
	chashui_zhidai_use: "至殆",
	chashui_zhidai_info:
		"出牌阶段限一次，你可以摸一张牌并重复此流程直到手牌颜色不唯一，然后展示所有手牌，若红色牌数不大于/不小于黑色牌数，此阶段你可以将红色/黑色牌当【杀】/【酒】使用。",
	chashui_yintu: "阴图",
	chashui_yintu_buff: "阴图",
	chashui_yintu_info:
		"锁定技，当你每回合首次使用牌结算结束后，你于本回合对非此牌目标的角色使用牌无距离和次数限制。",
	chashui_yuewen: "阅文",
	chashui_yuewen_info: "一名角色的出牌阶段结束后，你可以弃置一张手牌，然后将牌堆顶至多三张牌置入弃牌堆。",
	chashui_shiyin: "仕荫",
	chashui_shiyin_info:
		"蜀势力技，锁定技，每回合结束时，你选择并获得一张本回合进入弃牌堆的牌（此牌点数须大于你此前以此法获得过的牌）。若你未以此法获得牌，你将势力改为晋。",
	chashui_dingshi: "定史",
	chashui_dingshi_info:
		"晋势力技，限定技，出牌阶段，你可以获得弃牌堆中任意张点数均不同的牌，若你以此法获得了所有点数的牌，你可以任意分配你以此法获得的牌。",
	chashui_kouhuo: "寇祸",
	chashui_kouhuo_sync: "寇祸",
	chashui_kouhuo_use: "寇祸",
	chashui_kouhuo_info:
		"每名角色的回合限一次，当其需要使用【杀】时，其可以将一张牌当【杀】使用，若你未因此受到伤害，你摸一张牌；若其因此造成伤害，其摸一张牌。",
	chashui_zhaoluan: "肇乱",
	chashui_zhaoluan_info: "锁定技，游戏开始时和你死亡后，每名角色依次选择一项：1.弃一张牌；2.使用一张无距离限制的【杀】。",
	chashui_piaobo: "漂泊",
	chashui_piaobo_sync: "漂泊",
	chashui_piaobo_rule: "漂泊",
	chashui_piaobo_move: "漂泊",
	chashui_piaobo_info:
		"锁定技，游戏开始时，你将场上分为“华夏”与“倭国”两个区划，其他角色默认位于“华夏”，你进入“倭国”。每名角色使用牌仅可指定同区划内的角色，且计算距离时仅计算同区划内的角色。每名角色的准备阶段，其可以弃一张牌并进入另一个区划。",
	chashui_yifeng: "夷封",
	chashui_yifeng_info: "锁定技，你进入“倭国”后加1点体力上限；其他角色进入你所在区划后，你与其各摸一张牌。",
	chashui_yanzhong: "衍众",
	chashui_yanzhong_info:
		"当你造成或受到伤害后，你可以交给一名其他角色一张牌并令其获得“衍众”。当有角色获得“衍众”后，你摸一张牌。",
	chashui_suofu: "索缚",
	chashui_suofu_delay: "索缚",
	chashui_suofu_info:
		"每回合开始时，你可以横置或将势力变更至魏，然后摸两张牌。若如此做，本回合结束时，若你本回合未造成或受到伤害，你变更势力至吴，令当前回合角色视为对你使用冰【杀】。",
	// ===== 茶水贤设·曦（tea_ex_extra）：9 名 =====
	chashui_duzhi: "笃志",
	chashui_duzhi_count: "笃志",
	chashui_duzhi_info:
		"摸牌阶段开始时，你可以改为令一名角色将手牌摸至四张，然后若你本局游戏的每个摸牌阶段均如此做，你回复1点体力。",
	chashui_nihui: "匿辉",
	chashui_nihui_info:
		"当你成为锦囊牌的目标时，你可以失去1点体力并取消之，然后若你本局游戏未使用过锦囊牌，你可以令一名其他角色将手牌弃至与你相同。",
	chashui_liutan: "流谈",
	chashui_liutan_disabled: "流谈",
	chashui_liutan_info:
		"出牌阶段，你可以令一名其他角色摸两张牌并选择一项：1.对你使用一张手牌；2.弃置两张牌，此技能此阶段失效。",
	chashui_jindui: "近对",
	chashui_jindui_info:
		"当其他角色使用非虚拟或转化的牌指定你为目标时，你可以令其选择一项：1.其视为用此牌与你议事，若结果与此牌颜色相同，你摸一张牌；2.其视为用此牌与你拼点，若你赢，此牌对你无效。",
	chashui_kuipan: "溃叛",
	chashui_kuipan_info:
		"当你使用伤害牌结算结束后，你可以令一名目标角色收回一张装备牌或蓄谋一张牌，然后除其外手牌数与其相等的角色依次视为对其使用一张【火攻】。",
	chashui_hejian: "劾奸",
	chashui_hejian_info:
		"当有角色的体力值变化后，若其未处于濒死状态且体力值与你相等，你可以重铸其每个区域里各一张牌，视为使用第X项（X为你以此法重铸的牌数）：1.【无中生有】；2.【杀】；3.【过河拆桥】。",
	chashui_linrong: "麟荣",
	chashui_linrong_info:
		"锁定技，你的前三个回合结束时，你摸两张牌并展示这些牌，若你已受伤，你因此展示过的牌视为只能指定你为目标的【桃】。",
	chashui_wenyi: "温宜",
	chashui_wenyi_info:
		"当一名其他角色使用【桃】或装备牌后，你可以交给其一张【桃】或装备牌并令其摸一张牌，然后若其未受伤，你摸一张牌。",
	chashui_youse: "忧色",
	chashui_youse_eff: "忧色",
	chashui_youse_info:
		"每轮限一次，每回合开始时你可以摸三张牌并弃置三张牌，若你以此法失去的牌花色均相同/均不同，当前回合角色本轮可以将同种/另一种花色的牌当任意其本回合未使用过的基本牌使用（无次数限制）。",
	chashui_lieyi: "烈义",
	chashui_lieyi_watch: "烈义",
	chashui_lieyi_info:
		"限定技，当一名其他角色于醉酒状态结束回合时，你可以重置“忧色”并将“弃置”修改为“正面向上交给当前回合角色”，令当前回合角色执行一个额外回合，此回合结束时，若其没有杀死过角色，你死亡。",
	chashui_xuanfa: "玄法",
	chashui_xuanfa_use: "玄法",
	chashui_xuanfa_info:
		"当你使用牌指定唯一目标后，若你的体力值为X，你回复1点体力；若此牌目标的体力值为X，你可以令此牌对其无效并于结算完成后视为对其使用一张基本或普通锦囊牌（X为你与目标手牌数之和）。以此法使用的牌不会触发此技能。",
	chashui_xianmo: "仙陌",
	chashui_xianmo_info:
		"当你的体力值变化后，你可以亮出牌堆顶等同你体力值数张牌并选择至多等量名角色，这些角色按你选择的顺序依次将Y张牌置于牌堆顶，并获得一张亮出牌（Y为当前亮出牌数-1）。剩余的亮出牌进入弃牌堆。",
	// 戎笔：描述按原型实现改写（用户 2026-11-14 拍板：素材=弃牌堆顶的牌，无手牌条件；锁定=转化结果牌名）
	chashui_rongbi: "戎笔",
	chashui_rongbi_respond: "戎笔",
	chashui_rongbi_mark: "戎笔",
	chashui_rongbi_ban: "戎笔",
	chashui_rongbi_info:
		"你可以将弃牌堆顶的牌当【杀】或【决斗】使用或打出。若你以此法使用了牌，你本回合不能再使用以此法转化出的牌名的牌。",
	chashui_qiudui: "求对",
	chashui_qiudui_a: "求对",
	chashui_qiudui_eff: "求对",
	chashui_qiudui_a_info:
		"每回合限一次，出牌阶段，你可以将一张牌当【决斗】对茶水邓展使用。以此法造成伤害的角色摸两张牌；若其因此受到伤害，其获得因此次技能进入弃牌堆的牌。",
	chashui_qiudui_info:
		"每名角色的出牌阶段限一次，其可以将一张牌当【决斗】对你使用。以此法造成伤害的角色摸两张牌。若你因此受到伤害，你获得因此次技能进入弃牌堆的牌。",
	chashui_koushou: "寇守",
	chashui_koushou_info:
		"当你于回合外使用牌结算结束后，你可以令当前回合角色获得此牌，若其不是此牌目标，此牌所有的目标角色可以依次选择是否将一张伤害牌当【决斗】对你使用直到有人如此做。",
	chashui_zhenge: "斟戈",
	chashui_zhenge_info:
		"每轮每种牌名限一次，没有角色造成过伤害的回合结束时，你可以重铸任意张类型相同的牌，然后你可以将因此置入弃牌堆的牌当一张同类别的无距离限制的伤害牌使用。",
	// 结心与灵雎〖竭心〗chashui_jiexin 撞名，照原型 tea__jiexinq 加 q 后缀
	chashui_jiexinq: "结心",
	chashui_jiexinq_info:
		"锁定技，你的首个回合结束时，你选择一名其他角色称为“结心”角色；你的每个回合结束时，你视为对“结心”角色使用一张无距离限制的【推心置腹】且你与其连接因此获得的牌。",
	chashui_shengmeng: "生盟",
	chashui_shengmeng_link: "生盟",
	chashui_shengmeng_link_info:
		"每回合限一次，你可以将一张牌当“结心”角色的已连接的基本牌或普通锦囊牌使用。",
	chashui_shengmeng_info:
		"每回合各限一次，你与“结心”角色可以将一张牌当对方一张已连接的基本牌或普通锦囊牌使用。",
	chashui_xunbie: "殉别",
	chashui_xunbie_info:
		"锁定技，当你失去所有手牌后，你失去1点体力并将手牌摸至当前体力值。",
	// ===== 茶水贤设·曦 番外补全：6 名（实体卡转录文本，无 Lua 原型）=====
	chashui_miaoshu: "妙书",
	chashui_miaoshu_info:
		"每回合每种牌名限一次，你可以弃置任意张牌，视为使用一张牌名字数不多于此次弃置牌牌名字数和的基本牌或普通锦囊牌。",
	chashui_xinghuan: "兴唤",
	chashui_xinghuan_record: "兴唤",
	chashui_xinghuan_yb: "兴唤",
	chashui_xinghuan_info:
		"锁定技，当你的牌进入弃牌堆后，你依次执行以下前X项（X为此次进入弃牌堆的牌数）：1.回复1点体力，若如此做，你删除此技能的最后一项；2.摸1张牌；3.令当前回合角色的一张手牌视为【随机应变】直到本回合结束。",
	chashui_shimi: "拾秘",
	chashui_shimi_info:
		"限定技，转换技，你可以将一张牌当任意一张基本牌或普通锦囊牌使用，且你以此法使用的牌在初始牌堆中的数量须①小于②等于③大于转化后的牌。",
	chashui_dingliu: "定流",
	chashui_dingliu_info:
		"限定技，转换技，当你摸牌或造成伤害后，你可以和一名手牌数与你相等的其他角色依次①弃置一张牌；②回复1点体力。",
	chashui_shengzhi: "生枝",
	chashui_shengzhi_info:
		"转换技，每回合限一次，当一名角色的体力值①减少②增加后，你可以重置你武将牌上的一个技能的使用次数，若为此技能，你将手牌数调整至体力值。",
	chashui_wangzhuo: "望擢",
	chashui_wangzhuo_link: "望擢",
	chashui_wangzhuo_info:
		"出牌阶段限一次，你可以令一名其他角色将手牌数摸至与你相同。若如此做，本轮你/其成为【杀】的目标时，其/你成为额外目标。",
	chashui_xuanjiang: "宣降",
	chashui_xuanjiang_ban: "宣降",
	chashui_xuanjiang_info:
		"每回合首次有角色需要使用【闪】而未使用牌时，你可以令任意名角色各摸一张牌，然后这些角色本回合不能响应其他角色使用的牌。",
	chashui_zhaoyun: "兆运",
	chashui_zhaoyun_resume: "兆运",
	chashui_zhaoyun_info:
		"当你使用【杀】指定唯一一名角色为目标后，你可以令此牌于接下来的三个回合内其受到伤害后结算。若你以此法造成致命伤害时，你回复1点体力。",
	chashui_yishang: "移赏",
	chashui_yishang_pend: "移赏",
	chashui_yishang_info:
		"每轮限一次，当有角色回复体力时，你可以令其选择是否防止之。若其选择是，本局游戏下一张被使用的【桃】无效且其获得之。",
	chashui_kuilian: "窥帘",
	chashui_kuilian_extra: "窥帘",
	chashui_kuilian_info:
		"每轮限三次，其他角色的结束阶段，你可以选择以下结算后你与其手牌数相等的一项执行：1.观看其手牌；2.使用一张以你自己为目标的牌；3.摸此技能本轮发动次数张牌。",
	chashui_qiexiang: "窃香",
	chashui_qiexiang_disabled: "窃香",
	chashui_qiexiang_info:
		"你使用基本牌指定唯一目标后，可以指定一种花色，若其有此花色的手牌，其弃置之并获得本回合进入弃牌堆中的一张牌。若以上流程：出现了伤害牌，你获得之并令此技能本轮失效；恰出现一张♣牌，你可以于本阶段结束时对其发动“窥帘”。",
	chashui_tongzhu: "通旨",
	chashui_tongzhu_info:
		"每回合限一次，当你的牌进入弃牌堆后，若本回合进入弃牌堆的牌中有点数不相连的牌因此相连，你可以获得这些牌中点数相连的所有牌。",
	chashui_guibian: "鬼辩",
	chashui_guibian_count: "鬼辩",
	chashui_guibian_damage: "鬼辩",
	chashui_guibian_info:
		"当一张黑色锦囊牌生效前，你可以将任意张点数和大于此牌的牌当【无懈可击】抵消之。黑色锦囊牌对你造成的伤害等于你本轮因此技能使用牌的次数。",
};
