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
		o[id] = { ...characterData[id] };
	}
	patchCharacterAssets(o);
	return o;
}

const pkgPrefixMap = {
	threed: "3D",
	qiufeng: "秋风",
	xiaobai: "小白",
	zishubei: "自书",
	zhuoming: "濯名",
	qunyou_chenjunxieshi: "问鼎",
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
	threed: "3D吧赛",
	qiufeng: "秋风杯",
	xiaobai: "小白杯",
	zishubei: "自书杯",
	zhuoming: "濯名杯",
	qunyou_chenjunxieshi: "问鼎•陈郡谢氏",
	qunyou_xingheshuo: "山河如梦",
	yachaiclan: "崖柴的族武将设",
	qunyou_sinatsuriku:"西夏笠谷",
	qunyou_gaijin:"有问题的设计",
	qunyou_yongdong:"能永动的武将",
	xuandie_design: "玄蝶的设计",
	maomi_dayuan: "猫咪大院",
};

const characterSort = {
	threed: ["threed_dongbai", "threed_heji"],
	qiufeng: ["qiufeng_zhangqiying", "qiufeng_hushi", "qiufeng_xiahouhui"],
	xiaobai: ["xiaobai_lizhaoyi", "xiaobai_lite", "xiaobai_suojing"],
	zishubei: ["zishu_liyan", "zishu_lvju", "zishu_xunyu", "zishu_wangguan","zishu_panshu", "zishu_sunhe", "zishu_zhangjinyun", "zishu_zangba", "zishu_duanjiong", "zishu_shantao", "zishu_maohuanghou", "zishu_guli","zishu_yongkai"],
	zhuoming: ["zhuoming_gongsunyuan", "zhuoming_feili_gongsunyuan", "zhuoming_liuyan", "zhuoming_mateng", "zhuoming_fq_mateng", "zhuoming_sc_mateng"],
	qunyou_chenjunxieshi: ["qunyou_xiedaoyun", "qunyou_xiean", "qunyou_xiexuan", "qunyou_xielingyun", "qunyou_xieshi"],
	qunyou_xingheshuo: ["shanhe_zhangjiao", "shanhe_luzhi", "shanhe_dongzhuo", "shanhe_wangyi", "shanhe_jiangwei", "shanhe_hanfu", "shanhe_lusu"],
	yachaiclan: ["yachaiclan_cuiyan", "yachaiclan_wangxiang", "yachaiclan_diaochan", "yachaiclan_wuyi", "yachaiclan_xunyu",
		 "yachaiclan_luxun", "yachaiclan_lukang", "yachaiclan_luji2", "yachaiclan_luyun", "yachaiclan_luji", "yachaiclan_luyusheng", "yachaiclan_lukai", 
		 "yachaiclan_zhugeliang", "yachaiclan_zhugezhan", "yachaiclan_zhugeshang", "yachaiclan_zhugejin", "yachaiclan_zhugeke", "yachaiclan_zhugedan", "yachaiclan_zhugeliang2"],
	qunyou_sinatsuriku: ["qunyou_yang_wang","qunyou_caoxiancaohua","qunyou_xx_sunce","qunyou_lvlingqi","qunyou_panjun"],
	qunyou_gaijin: ["qunyou_jiangwei","qunyou_pengyue"],
	qunyou_yongdong: ["qunyou_wanglang"],
	xuandie_design: ["xuandie_xunguan", "xuandie_lvzhi", "xuandie_wenjun", "xuandie_zuti"],
	maomi_dayuan: ["maokuo_caobuxing", "maokuo_jiangwei", "maokuo_nuqi_jiangwei"],
};

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
