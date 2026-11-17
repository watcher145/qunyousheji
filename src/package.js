import { characterData } from "./character/data.js";
import { characterTranslate } from "./character/translate.js";
import { characterTitle } from "./character/title.js";
import { characterIntro } from "./character/intro.js";
import { characterSubstitute } from "./character/characterSubstitute.js";
import { patchCharacterAssets } from "./character/patchAssets.js";
import { cardData } from "./card/data.js";
import { cardTranslate } from "./card/translate.js";
import { patchCardPackImages } from "./card/patchAssets.js";
import { skills } from "./skill/index.js";
import { skillTranslate } from "./translate/skill.js";

function cloneAndPatchCharacters() {
	const o = {};
	for (const id of Object.keys(characterData)) {
		// 小白杯角色单独成包（见 getXiaobaiPack），主包要排除，否则会重复出现
		if (xiaobaiIdSet.has(id)) continue;
		// 茶水贤设同理（见 getChashuiPack）
		if (chashuiIdSet.has(id)) continue;
		o[id] = { ...characterData[id] };
	}
	patchCharacterAssets(o);
	return o;
}

// ⚠️ 角色翻译里有派生键：`<角色id>_prefix`（前缀着色用，如 "xiaobai_baoxun_prefix": "小白"）。
// 只挑角色 id 本身会把它们漏掉 → 名字前面的「小白」前缀会消失。
// 顺带保留 `<角色id>_teaprefix`（茶水贤设逐角色换茶杯用，见 precontent.js 的茶水前缀）。
function pickPackKeys(obj, idSet) {
	const out = {};
	for (const id of idSet) {
		for (const suffix of ["", "_prefix", "_teaprefix"]) {
			const key = id + suffix;
			if (obj[key] != null) out[key] = obj[key];
		}
	}
	return out;
}

function pickXiaobai(obj) {
	return pickPackKeys(obj, xiaobaiIdSet);
}

/**
 * 小白杯：独立成一个武将包（大包），在 precontent 里用 game.import("character", ...) 注册。
 * 包内按 FreeKill 的「届」分小包（xiaobaiSort）。
 */
export function getXiaobaiPack() {
	const character = {};
	for (const id of xiaobaiIdSet) {
		if (characterData[id]) character[id] = { ...characterData[id] };
	}
	patchCharacterAssets(character);
	/** @type {Record<string, string>} */
	const translate = { ...pickXiaobai(characterTranslate) };
	// 大包显示名：引擎读的是 `lib.translate[包名 + "_character_config"]`（game/index.js:5668、
	// get/index.js:5009），导入型武将包不会自动补，必须显式写，否则列表里这个包是空名。
	translate["小白杯_character_config"] = "小白杯";
	// 大包名 + 各届小包名
	translate.xiaobai = characterSortTranslate.xiaobai || "小白杯";
	for (const key of Object.keys(xiaobaiSort)) {
		if (characterSortTranslate[key] != null) translate[key] = characterSortTranslate[key];
	}
	return {
		name: "小白杯",
		connect: false,
		connectBanned: [],
		// ⚠️ characterSort 的**外层键必须是包名**（= lib.characterPack 的键 = 本包 name），
		// 引擎是 `lib.characterSort[packname]` 取的（get/index.js:5010、5683）。
		// 之前写成 `xiaobai` 对不上包名「小白杯」→ 大包内的小包（届）全部不显示。
		characterSort: { 小白杯: xiaobaiSort },
		character,
		translate,
		characterTitle: { ...pickXiaobai(characterTitle) },
		characterIntro: { ...pickXiaobai(characterIntro) },
	};
}

/**
 * 茶水贤设：与小白杯同构的第二个独立大包，同样在 precontent 里用
 * `game.import("character", getChashuiPack())` 注册，包内按专题分小包（chashuiSort）。
 *
 * 与大包有关的三个字符串必须一致：本对象的 `name` / `characterSort` 外层键 / 回填到
 * `lib.translate[包名 + "_character_config"]` 的键。
 */
export function getChashuiPack() {
	const character = {};
	for (const id of chashuiIdSet) {
		if (characterData[id]) character[id] = { ...characterData[id] };
	}
	patchCharacterAssets(character);
	/** @type {Record<string, string>} */
	const translate = { ...pickPackKeys(characterTranslate, chashuiIdSet) };
	// 大包显示名（导入型武将包不会自动补，缺了就是空名）
	translate["茶水贤设_character_config"] = "茶水贤设";
	for (const key of Object.keys(chashuiSort)) {
		if (characterSortTranslate[key] != null) translate[key] = characterSortTranslate[key];
	}
	return {
		name: "茶水贤设",
		connect: false,
		connectBanned: [],
		characterSort: { 茶水贤设: chashuiSort },
		character,
		translate,
		characterTitle: { ...pickPackKeys(characterTitle, chashuiIdSet) },
		characterIntro: { ...pickPackKeys(characterIntro, chashuiIdSet) },
	};
}

const pkgPrefixMap = {
	// 群友散设：这些角色此前不在任何包里，靠 applyCharacterPrefixes 的「无包 → 群友」兜底
	// 拿到「群友」前缀；进包后前缀改由本表决定，所以必须登记同名前缀，否则会掉前缀。
	qunyou_sanshe: "群友",
	threed: "3D",
	qiufeng: "秋风",
	xiaobai: "小白",
	zishubei: "自书",
	zhuoming: "濯名",
	qunyou_chenjunxieshi: "问鼎",
	qunyou_xingheshuo: "山河",
	xingyu: "星玉",
	yachaiclan: "崖柴",
	qunyou_sinatsuriku: "西夏",
	qunyou_yongdong: "群友",
	xuandie_design: "蝶设",
	maomi_dayuan: "猫咪",
	zizi: "子子",
};

function applyCharacterPrefixes(translate) {
	const result = { ...translate };
	for (const id of Object.keys(characterData)) {
		let inPkg = null;
		for (const pkg of Object.keys(characterSort)) {
			if (characterSort[pkg].includes(id)) {
				inPkg = pkg;
				break;
			}
		}
		const old = result[id + "_prefix"];
		if (!inPkg) {
			result[id] = "群友" + result[id];
			result[id + "_prefix"] = old ? "群友|" + old : "群友";
			continue;
		}
		const prefix = pkgPrefixMap[inPkg];
		if (!prefix || (old && old.split("|").includes(prefix))) continue;
		result[id] = prefix + result[id];
		result[id + "_prefix"] = old ? prefix + "|" + old : prefix;
	}
	return result;
}

function cloneAndPatchCards() {
	const o = {};
	for (const name of Object.keys(cardData)) {
		o[name] = { ...cardData[name] };
	}
	patchCardPackImages(o);
	return o;
}

const characterSortTranslate = {
	qunyou_sanshe: "群友散设",
	threed: "3D吧赛",
	qiufeng: "秋风杯",
	xiaobai: "小白杯",
	xiaobai_sgs48: "SGS48",
	xiaobai_ten: "十届小白杯",
	xiaobai_eleven: "十一届小白杯",
	xiaobai_twelve: "十二届小白杯",
	xiaobai_thirteen: "十三届小白杯",
	xiaobai_fourteen: "十四届小白杯",
	xiaobai_fifteen: "十五届小白杯",
	xiaobai_sixteen: "十六届小白杯",
	
	zishubei: "自书杯",
	zhuoming: "濯名杯",
	qunyou_chenjunxieshi: "问鼎•陈郡谢氏",
	qunyou_xingheshuo: "山河如梦",
	xingyu: "星玉扩展",
	yachaiclan: "崖柴的族武将设",
	qunyou_sinatsuriku:"西夏笠谷",
	qunyou_gaijin:"有问题的设计",
	qunyou_yongdong:"能永动的武将",
	xuandie_design: "玄蝶的设计",
	maomi_dayuan: "猫咪大院",
	zizi: "子子杯",
	// 茶水贤设（独立大包）的各小包名。大包名本身写在 getChashuiPack 里，不进本表。
	chashui_tea_a: "茶水贤设·昕",
	chashui_tea_b: "茶水贤设·晌",
	chashui_tea_c: "茶水贤设·昳",
	chashui_tea_d: "茶水贤设·晡",
	chashui_tea_e: "茶水贤设·曛",
	chashui_tea_sp: "茶水贤设·晏",
	chashui_tea_extra: "茶水贤设·曦",
};

const characterSort = {
	qunyou_sanshe: ["qunyou_zoushi", "qunyou_wenyang", "qunyou_shibao", "qunyou_sunxiu", "qunyou_zhaoyun", "qunyou_sunshao", "qunyou_caocao", "qunyou_sp_wenyang", "qunyou_liukun", "qunyou_simayi", "qunyou_sunjiao", "qunyou_v_luxun", "qunyou_caozhi", "qunyou_haopu", "qunyou_chen_zhaoyun", "qunyou_cbp_zhaoyun", "qunyou_sb_zhugeliang", "qunyou_liumo", "qunyou_meng_liufeng", "qunyou_caoshuang", "qunyou_hanshiwuhu", "qunyou_sb_zhonghui", "qunyou_mo_jiangwei", "qunyou_sb_guohuai", "qunyou_clan_diaochan", "qunyou_wu_zhangfei", "qunyou_v_guanyu", "qunyou_zhangyan", "qunyou_lvyi", "qunyou_zhouyu", "qunyou_wangyun", "qunyou_guojia", "qunyou_zhaoshuang", "qunyou_guanyu", "qunyou_dongzhuo", "qunyou_clan_zhugejun", "qunyou_taishici", "qunyou_sunce", "qunyou_guotu", "qunyou_liuchen", "qunyou_masu", "qunyou_zhongjin", "qunyou_feiyi", "qunyou_clan_xunzhuan", "qunyou_clan_wangrong", "qunyou_clan_yuantanshang", "qunyou_clan_yuanshao", "qunyou_yangqun", "qunyou_clan_yuanshu", "qunyou_clan_jiangwei", "qunyou_clan_diaochan2", "qunyou_taokan", "qunyou_clan_kongyu", "qunyou_clan_yuankui", "qunyou_jiananfeng", "qunyou_sunhao", "qunyou_clan_wangjun", "qunyou_zhugeguo", "qunyou_mo_wangyun", "qunyou_luxun", "qunyou_zhonghui", "qunyou_sunziliufang", "qunyou_zhangfei", "qunyou_sp_menghuo", "qunyou_zhangliang", "qunyou_sunchen", "qunyou_wei_dongzhuo", "qunyou_re_zhaoyun", "qunyou_dengai", "qunyou_zhoufei", "qunyou_clan_xunyu", "qunyou_clan_yangjun", "qunyou_simarui", "qunyou_sunjian", "qunyou_sb_dongzhuo", "qunyou_pot_taishici", "qunyou_gengxun", "qunyou_guanning"],
	threed: ["threed_dongbai", "threed_heji", "threed_qianzhao"],
	qiufeng: ["qiufeng_zhangqiying", "qiufeng_hushi", "qiufeng_xiahouhui"],
	zishubei: ["zishu_liyan", "zishu_lvju", "zishu_xunyu", "zishu_wangguan","zishu_panshu", "zishu_sunhe", "zishu_zhangjinyun", "zishu_zangba", "zishu_duanjiong", "zishu_shantao", "zishu_maohuanghou", "zishu_guli","zishu_yongkai", "zishu_liangxi"],
	zhuoming: ["zhuoming_gongsunyuan", "zhuoming_feili_gongsunyuan", "zhuoming_liuyan", "zhuoming_mateng", "zhuoming_fq_mateng", "zhuoming_sc_mateng", "zhuoming_dongzhuo", "zhuoming_beimihu"],
	qunyou_chenjunxieshi: ["wending_clan_xiedaoyun", "wending_clan_xiean", "wending_clan_xiexuan", "wending_clan_xielingyun", "wending_clan_xieshi"],
	qunyou_xingheshuo: ["shanhe_zhangjiao", "shanhe_luzhi", "shanhe_dongzhuo", "shanhe_wangyi", "shanhe_jiangwei", "shanhe_hanfu", "shanhe_lusu", "shanhe_maliang"],
	xingyu: ["xingyu_liubei", "xingyu_dianwei", "xingyu_jiaxu", "xingyu_zhangfei", "xingyu_sunquan",
		"xingyu_dingfuren", "xingyu_majun", "xingyu_ruanji", "xingyu_dongzhao", "xingyu_huaman",
		"xingyu_zhugeshang_zhangzun", "xingyu_xiahouba", "xingyu_sunshangxiang", "xingyu_xushi", "xingyu_shiyi",
		"xingyu_sunyu", "xingyu_dongtaihou", "xingyu_yangaoruo", "xingyu_liubian", "xingyu_xunyu_xunyou", "xingyu_sunce"],
	yachaiclan: ["yachaiclan_cuiyan", "yachaiclan_wangxiang", "yachaiclan_diaochan", "yachaiclan_wuyi", "yachaiclan_xunyu",
		 "yachaiclan_luxun", "yachaiclan_lukang", "yachaiclan_luji2", "yachaiclan_luyun", "yachaiclan_luji", "yachaiclan_luyusheng", "yachaiclan_lukai", 
		 "yachaiclan_zhugeliang", "yachaiclan_zhugezhan", "yachaiclan_zhugeshang", "yachaiclan_zhugejin", "yachaiclan_zhugeke", "yachaiclan_zhugedan", "yachaiclan_zhugeliang2"],
	qunyou_sinatsuriku: ["qunyou_yang_wang","qunyou_caoxiancaohua","qunyou_xx_sunce","qunyou_lvlingqi","qunyou_panjun"],
	qunyou_gaijin: ["qunyou_pengyue"],
	qunyou_yongdong: ["qunyou_wanglang"],
	xuandie_design: ["xuandie_xunguan", "xuandie_lvzhi", "xuandie_wenjun", "xuandie_zuti"],
	maomi_dayuan: ["maokuo_caobuxing", "maokuo_jiangwei", "maokuo_nuqi_jiangwei", "maokuo_pengyang", "maokuo_wangwang", "maokuo_zhangte", "maokuo_lukang",
		"maokuo_lichunxiang", "maokuo_weiwen_zhugezhi", "maokuo_wangfan", "maokuo_liuling", "maokuo_huangchong", "maokuo_caogun", "maokuo_xiahouhui", "maokuo_yangxi", "maokuo_zanghong", "maokuo_heyan", "maokuo_zerong",
		// 二蛋展示（15 名新武将）
		"maokuo_qinyilu", "maokuo_jiangshu", "maokuo_zhaozhi", "maokuo_qinlang", "maokuo_haopu", "maokuo_sunhuan", "maokuo_zhaoji", "maokuo_weihuacun", "maokuo_guohuai", "maokuo_jikang", "maokuo_ruanji", "maokuo_shantao", "maokuo_xiangxiu", "maokuo_wangrong", "maokuo_ruanxian"],
	// 子子杯（第二届子子杯S2·轮首，双头武将，按字母序）
	zizi: ["zizi_caozhencaoxiu", "zizi_guotufengji", "zizi_jiangwanfeiyi", "zizi_weiwenzhugezhi", "zizi_yangzhiyangyan"],
};

// 小白杯：独立成大包，内部按 FreeKill 的「届」分小包
const xiaobaiSort = {
	xiaobai_ten: ["xiaobai_fugu", "xiaobai_zhushixing", "xiaobai_dinggu", "xiaobai_liuying", "xiaobai_liuji", "xiaobai_liumin"],
	xiaobai_eleven: ["xiaobai_lizhaoyi", "xiaobai_zhaoshuang", "xiaobai_shenyi", "xiaobai_lifeng", "xiaobai_luyu", "xiaobai_weidan", "xiaobai_yangyong", "xiaobai_dengfuren", "xiaobai_louxuan"],
	xiaobai_twelve: ["xiaobai_malun", "xiaobai_lisheng", "xiaobai_xuci", "xiaobai_zhaoqi", "xiaobai_liuhongx", "xiaobai_maohuanghou", "xiaobai_wangsi", "xiaobai_sunshao", "xiaobai_baochu"],
	xiaobai_thirteen: ["xiaobai_shenmu", "xiaobai_gaoding", "xiaobai_feishi", "xiaobai_tianxu", "xiaobai_heyong", "xiaobai_huzhi", "xiaobai_wangbi", "xiaobai_xumu", "xiaobai_huzong", "xiaobai_zhaozi", "xiaobai_huangwan", "xiaobai_gaixun", "xiaobai_fuxuan", "xiaobai_simayue", "xiaobai_jiangziwen"],
	xiaobai_fourteen: ["xiaobai_hufang", "xiaobai_lvzhu", "xiaobai_zhangjian", "xiaobai_youchu", "xiaobai_lvyi", "xiaobai_wangbimawen", "xiaobai_weiji", "xiaobai_fanjian", "xiaobai_hezhi", "xiaobai_lujix", "xiaobai_doumiao", "xiaobai_hexiu", "xiaobai_huangfugui", "xiaobai_yangxu", "xiaobai_shichong"],
	xiaobai_fifteen: ["xiaobai_baoxun", "xiaobai_chengxi", "xiaobai_xunyue", "xiaobai_hanji", "xiaobai_zhaorao", "xiaobai_nieyou", "xiaobai_xueying", "xiaobai_douwu", "xiaobai_liying", "xiaobai_wangxiu", "xiaobai_leguang", "xiaobai_peikai", "xiaobai_peiwei", "xiaobai_zhangfang", "xiaobai_guopu"],
	// 注：本扩展目前没有双面武将——蒋子文原「神形态」背面（xiaobai_jiangziwen_dead）已删除，
	//     死亡形态改为**真死幽灵**：死亡照常结算，deadform 在死亡链上换皮（changeGroup("shen")
	//     + 改名「秦广王」+ 换立绘），死后〖司酆〗靠 forceDie 继续发动；羊献容走本体隐匿机制（hasHiddenSkill）。
	//     将来若恢复双面武将，**背面 id 必须也写进这里**：xiaobaiIdSet 只认这些 id，
	//     漏掉背面 → 背面会残留在主包（verify-xiaobai-pack 会报「残留小白杯角色」）。
	xiaobai_sixteen: ["xiaobai_lite", "xiaobai_suojing", "xiaobai_liukun", "xiaobai_liusong", "xiaobai_jishao", "xiaobai_zuosi", "xiaobai_simayou", "xiaobai_simajun", "xiaobai_wangjunx", "xiaobai_heqiao", "xiaobai_xunkai", "xiaobai_luoshang", "xiaobai_yangxianrong"],
	xiaobai_sgs48: ["xiaobai_zhugerong", "xiaobai_zhaoyu", "xiaobai_zhangyu", "xiaobai_xiyingxi", "xiaobai_cuifu", "xiaobai_hushi", "xiaobai_jiyan"],
};

const xiaobaiIdSet = new Set(Object.values(xiaobaiSort).flat());

// 茶水贤设：第二个独立大包，小包按 FreeKill 的 7 个子包（昕/晌/昳/晡/曛/晏/曦）分。
// 键不要以 mode_ 开头；空数组的小包会被界面自动跳过，所以预留全部 7 个是安全的。
// 加武将：src/character/data.js 加 chashui_* → translate/title/intro 各补一条 → 这里把 id 放进对应小包。
// （漏放进本表 = 选将界面看不到该武将；skill-test 会报「在 data.js 里但没写进某个小包」）
const chashuiSort = {
	// 茶水贤设·昕（tea_ex_a）：10 名
	chashui_tea_a: [
		"chashui_dianman",
		"chashui_majun",
		"chashui_huojun",
		"chashui_yinguan",
		"chashui_huanjie",
		"chashui_zhonglimu",
		"chashui_bocai",
		"chashui_zhengtai",
		"chashui_simafu",
		"chashui_wangjun",
	],
	// 茶水贤设·晌（tea_ex_b）：10 名
	chashui_tea_b: [
		"chashui_caohong",
		"chashui_yingyang",
		"chashui_wangping",
		"chashui_wangchong",
		"chashui_weiyao",
		"chashui_chengpu",
		"chashui_zhengxuan",
		"chashui_zhangwen",
		"chashui_shibao",
		"chashui_zuosi",
	],
	// 茶水贤设·昳（tea_ex_c）：10 名
	chashui_tea_c: [
		"chashui_weizhen",
		"chashui_mohuba",
		"chashui_chenqi",
		"chashui_jihuo",
		"chashui_dinggu",
		"chashui_kangsenghui",
		"chashui_yuanwei",
		"chashui_beigongboyu",
		"chashui_hezeng",
		"chashui_tuobashamohan",
	],
	// 茶水贤设·晡（tea_ex_d）：10 名
	chashui_tea_d: [
		"chashui_zhujianping",
		"chashui_dengyang",
		"chashui_liyis",
		"chashui_liuyans",
		"chashui_wangbiaofangji",
		"chashui_heding",
		"chashui_zhangxiu",
		"chashui_zhangrangzhaozhong",
		"chashui_weihuacun",
		"chashui_xunxu",
	],
	// 茶水贤设·曛（tea_ex_e）：10 名
	chashui_tea_e: [
		"chashui_duji",
		"chashui_bianfuren",
		"chashui_xiahouba",
		"chashui_ganfuren",
		"chashui_zhoutai",
		"chashui_sunxiu",
		"chashui_guanning",
		"chashui_lingju",
		"chashui_zhanghua",
		"chashui_wangxiang",
	],
	// 茶水贤设·曦（tea_ex_extra）：15 名（番外 6 名为实体卡转录版，FreeKill 无原型）
	chashui_tea_extra: [
		"chashui_fancan",
		"chashui_zhangyis",
		"chashui_mengguan",
		"chashui_huanshujun",
		"chashui_lifuren",
		"chashui_sunhanhua",
		"chashui_liulanzhi",
		"chashui_dengzhan",
		"chashui_budugen",
		"chashui_liuzuan",
		"chashui_xudeng",
		"chashui_jiangxian",
		"chashui_xuguang",
		"chashui_jiawu",
		"chashui_ruanzhan",
	],
	// 茶水贤设·晏（tea_ex_sp）：5 名
	chashui_tea_sp: ["chashui_zulang", "chashui_chenshou", "chashui_qiwannian", "chashui_liuezhi", "chashui_wugang"],
};

const chashuiIdSet = new Set(Object.values(chashuiSort).flat());

/**
 * 无名杀扩展 package，结构与「奇臣传」扩展一致
 */
// 小白杯 / 茶水贤设的角色本体已从主包排除（cloneAndPatchCharacters），它们的
// translate / title / intro 也应由各自独立包（getXiaobaiPack / getChashuiPack）提供；
// 主包若再整表灌入，就会与独立包先注册的同名键撞车 → loading.js:183 逐键 duplicated 日志。
// 这里把这两批角色的键（含 _prefix/_teaprefix 派生键）从主包翻译表里剔除。
function omitPackKeys(obj, idSets, extraSkipKeys) {
	const out = {};
	for (const key of Object.keys(obj)) {
		if (extraSkipKeys && extraSkipKeys.has(key)) continue;
		let skip = false;
		for (const idSet of idSets) {
			for (const id of idSet) {
				if (key === id || key === id + "_prefix" || key === id + "_teaprefix") {
					skip = true;
					break;
				}
			}
			if (skip) break;
		}
		if (!skip) out[key] = obj[key];
	}
	return out;
}

// 只属于独立包（小白杯 / 茶水贤设）的小包名 + 大包配置键：主包 characterSort 不引用它们，
// 主包若也带有就会与独立包撞键（如 lib.translate.xiaobai）。列出来从主包翻译里踢掉。
const packOnlyKeys = new Set([
	"xiaobai",
	// 小白杯各届小包名（characterSortTranslate 里，主包 characterSort 不引用）
	"xiaobai_sgs48",
	"xiaobai_ten",
	"xiaobai_eleven",
	"xiaobai_twelve",
	"xiaobai_thirteen",
	"xiaobai_fourteen",
	"xiaobai_fifteen",
	"xiaobai_sixteen",
	"小白杯_character_config",
	"茶水贤设_character_config",
	"chashui_tea_a",
	"chashui_tea_b",
	"chashui_tea_c",
	"chashui_tea_d",
	"chashui_tea_e",
	"chashui_tea_sp",
	"chashui_tea_extra",
]);

export function getPackage() {
	return {
		character: {
			character: cloneAndPatchCharacters(),
			// 先按前缀处理整表，再剔除小白杯/茶水贤设（其翻译由独立包提供，避免重复注册）
			translate: omitPackKeys({ ...applyCharacterPrefixes(characterTranslate), ...characterSortTranslate }, [xiaobaiIdSet, chashuiIdSet], packOnlyKeys),
			characterSort: {
				mode_extension_群友设计: characterSort,
			},
			characterTitle: omitPackKeys({ ...characterTitle }, [xiaobaiIdSet, chashuiIdSet]),
			characterIntro: omitPackKeys({ ...characterIntro }, [xiaobaiIdSet, chashuiIdSet]),
			characterSubstitute: { ...characterSubstitute },
			// 怒麒·姜维仅为绝志变身的形态，不进入任何模式的选将池（get.characterDisabled 消费）
			characterFilter: {
				maokuo_nuqi_jiangwei: () => false,
			},
		},
		card: {
			card: cloneAndPatchCards(),
			translate: { ...cardTranslate },
			list: [],
		},
		skill: {
			skill: { ...skills },
			translate: { ...skillTranslate },
		},
	};
}
