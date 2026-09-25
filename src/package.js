import { characterData } from "./character/data.js";
import { characterTranslate } from "./character/translate.js";
import { characterTitle } from "./character/title.js";
import { characterIntro } from "./character/intro.js";
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
		o[id] = { ...characterData[id] };
	}
	patchCharacterAssets(o);
	return o;
}

// ⚠️ 角色翻译里有派生键：`<角色id>_prefix`（前缀着色用，如 "xiaobai_baoxun_prefix": "小白"）。
// 只挑角色 id 本身会把它们漏掉 → 名字前面的「小白」前缀会消失。
function pickXiaobai(obj) {
	const out = {};
	for (const id of xiaobaiIdSet) {
		if (obj[id] != null) out[id] = obj[id];
		const pref = id + "_prefix";
		if (obj[pref] != null) out[pref] = obj[pref];
	}
	return out;
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
	xiaobai_ten: "十届小白杯",
	xiaobai_eleven: "十一届小白杯",
	xiaobai_twelve: "十二届小白杯",
	xiaobai_thirteen: "十三届小白杯",
	xiaobai_fourteen: "十四届小白杯",
	xiaobai_fifteen: "十五届小白杯",
	xiaobai_sixteen: "十六届小白杯",
	xiaobai_sgs48: "SGS48",
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
};

const characterSort = {
	qunyou_sanshe: ["qunyou_zoushi", "qunyou_wenyang", "qunyou_shibao", "qunyou_sunxiu", "qunyou_zhaoyun", "qunyou_sunshao", "qunyou_caocao", "qunyou_sp_wenyang", "qunyou_liukun", "qunyou_simayi", "qunyou_sunjiao", "qunyou_v_luxun", "qunyou_caozhi", "qunyou_haopu", "qunyou_chen_zhaoyun", "qunyou_cbp_zhaoyun", "qunyou_sb_zhugeliang", "qunyou_liumo", "qunyou_meng_liufeng", "qunyou_caoshuang", "qunyou_hanshiwuhu", "qunyou_sb_zhonghui", "qunyou_mo_jiangwei", "qunyou_sb_guohuai", "qunyou_clan_diaochan", "qunyou_wu_zhangfei", "qunyou_v_guanyu", "qunyou_zhangyan", "qunyou_lvyi", "qunyou_zhouyu", "qunyou_wangyun", "qunyou_guojia", "qunyou_zhaoshuang", "qunyou_guanyu", "qunyou_dongzhuo", "qunyou_clan_zhugejun", "qunyou_taishici", "qunyou_sunce", "qunyou_guotu", "qunyou_liuchen", "qunyou_masu", "qunyou_zhongjin", "qunyou_feiyi", "qunyou_clan_xunzhuan", "qunyou_clan_wangrong", "qunyou_clan_yuantanshang", "qunyou_clan_yuanshao", "qunyou_yangqun", "qunyou_clan_yuanshu", "qunyou_clan_jiangwei", "qunyou_clan_diaochan2", "qunyou_taokan", "qunyou_clan_kongyu", "qunyou_clan_yuankui", "qunyou_jiananfeng", "qunyou_sunhao", "qunyou_clan_wangjun", "qunyou_zhugeguo", "qunyou_mo_wangyun", "qunyou_luxun", "qunyou_zhonghui"],
	threed: ["threed_dongbai", "threed_heji"],
	qiufeng: ["qiufeng_zhangqiying", "qiufeng_hushi", "qiufeng_xiahouhui"],
	zishubei: ["zishu_liyan", "zishu_lvju", "zishu_xunyu", "zishu_wangguan","zishu_panshu", "zishu_sunhe", "zishu_zhangjinyun", "zishu_zangba", "zishu_duanjiong", "zishu_shantao", "zishu_maohuanghou", "zishu_guli","zishu_yongkai", "zishu_liangxi"],
	zhuoming: ["zhuoming_gongsunyuan", "zhuoming_feili_gongsunyuan", "zhuoming_liuyan", "zhuoming_mateng", "zhuoming_fq_mateng", "zhuoming_sc_mateng", "zhuoming_dongzhuo"],
	qunyou_chenjunxieshi: ["wending_clan_xiedaoyun", "wending_clan_xiean", "wending_clan_xiexuan", "wending_clan_xielingyun", "wending_clan_xieshi"],
	qunyou_xingheshuo: ["shanhe_zhangjiao", "shanhe_luzhi", "shanhe_dongzhuo", "shanhe_wangyi", "shanhe_jiangwei", "shanhe_hanfu", "shanhe_lusu", "shanhe_maliang"],
	xingyu: ["xingyu_sunshangxiang"],
	yachaiclan: ["yachaiclan_cuiyan", "yachaiclan_wangxiang", "yachaiclan_diaochan", "yachaiclan_wuyi", "yachaiclan_xunyu",
		 "yachaiclan_luxun", "yachaiclan_lukang", "yachaiclan_luji2", "yachaiclan_luyun", "yachaiclan_luji", "yachaiclan_luyusheng", "yachaiclan_lukai", 
		 "yachaiclan_zhugeliang", "yachaiclan_zhugezhan", "yachaiclan_zhugeshang", "yachaiclan_zhugejin", "yachaiclan_zhugeke", "yachaiclan_zhugedan", "yachaiclan_zhugeliang2"],
	qunyou_sinatsuriku: ["qunyou_yang_wang","qunyou_caoxiancaohua","qunyou_xx_sunce","qunyou_lvlingqi","qunyou_panjun"],
	qunyou_gaijin: ["qunyou_jiangwei","qunyou_pengyue"],
	qunyou_yongdong: ["qunyou_wanglang"],
	xuandie_design: ["xuandie_xunguan", "xuandie_lvzhi", "xuandie_wenjun", "xuandie_zuti"],
	maomi_dayuan: ["maokuo_caobuxing", "maokuo_jiangwei", "maokuo_nuqi_jiangwei", "maokuo_pengyang", "maokuo_wangwang"],
};

// 小白杯：独立成大包，内部按 FreeKill 的「届」分小包
const xiaobaiSort = {
	xiaobai_ten: ["xiaobai_fugu", "xiaobai_zhushixing", "xiaobai_dinggu", "xiaobai_liuying", "xiaobai_liuji", "xiaobai_liumin"],
	xiaobai_eleven: ["xiaobai_lizhaoyi", "xiaobai_zhaoshuang", "xiaobai_shenyi", "xiaobai_lifeng", "xiaobai_luyu", "xiaobai_weidan", "xiaobai_yangyong", "xiaobai_dengfuren", "xiaobai_louxuan"],
	xiaobai_twelve: ["xiaobai_malun", "xiaobai_lisheng", "xiaobai_xuci", "xiaobai_zhaoqi", "xiaobai_liuhongx", "xiaobai_maohuanghou", "xiaobai_wangsi", "xiaobai_sunshao", "xiaobai_baochu"],
	xiaobai_thirteen: ["xiaobai_shenmu", "xiaobai_gaoding", "xiaobai_feishi", "xiaobai_tianxu", "xiaobai_heyong", "xiaobai_huzhi", "xiaobai_wangbi", "xiaobai_xumu", "xiaobai_huzong", "xiaobai_zhaozi", "xiaobai_huangwan", "xiaobai_gaixun", "xiaobai_fuxuan", "xiaobai_simayue"],
	xiaobai_fourteen: ["xiaobai_hufang", "xiaobai_lvzhu", "xiaobai_zhangjian", "xiaobai_youchu", "xiaobai_lvyi", "xiaobai_wangbimawen", "xiaobai_weiji", "xiaobai_fanjian", "xiaobai_hezhi", "xiaobai_lujix", "xiaobai_doumiao", "xiaobai_hexiu", "xiaobai_huangfugui", "xiaobai_yangxu", "xiaobai_shichong"],
	xiaobai_fifteen: ["xiaobai_baoxun", "xiaobai_chengxi", "xiaobai_xunyue", "xiaobai_hanji", "xiaobai_zhaorao", "xiaobai_nieyou", "xiaobai_xueying", "xiaobai_douwu", "xiaobai_liying", "xiaobai_wangxiu", "xiaobai_leguang", "xiaobai_peikai", "xiaobai_peiwei", "xiaobai_zhangfang", "xiaobai_guopu"],
	xiaobai_sixteen: ["xiaobai_lite", "xiaobai_suojing", "xiaobai_liukun", "xiaobai_liusong", "xiaobai_jishao", "xiaobai_zuosi", "xiaobai_simayou", "xiaobai_simajun", "xiaobai_wangjunx", "xiaobai_heqiao", "xiaobai_xunkai", "xiaobai_luoshang"],
	xiaobai_sgs48: ["xiaobai_zhugerong", "xiaobai_zhaoyu", "xiaobai_zhangyu", "xiaobai_xiyingxi"],
};

const xiaobaiIdSet = new Set(Object.values(xiaobaiSort).flat());

/**
 * 无名杀扩展 package，结构与「奇臣传」扩展一致
 */
export function getPackage() {
	return {
		character: {
			character: cloneAndPatchCharacters(),
			translate: { ...applyCharacterPrefixes(characterTranslate), ...characterSortTranslate },
			characterSort: {
				mode_extension_群友设计: characterSort,
			},
			characterTitle: { ...characterTitle },
			characterIntro: { ...characterIntro },
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
