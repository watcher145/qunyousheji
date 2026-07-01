import { characterData } from "./character/data.js";
import { characterTranslate } from "./character/translate.js";
import { characterTitle } from "./character/title.js";
import { characterIntro } from "./character/intro.js";
import { patchCharacterAssets } from "./character/patchAssets.js";
import { cardData } from "./card/data.js";
import { cardTranslate } from "./card/translate.js";
import { patchCardPackImages } from "./card/patchAssets.js";
import { skills } from "./skill/skills.js";
import { skillTranslate } from "./translate/skill.js";

function cloneAndPatchCharacters() {
	const o = {};
	for (const id of Object.keys(characterData)) {
		o[id] = { ...characterData[id] };
	}
	patchCharacterAssets(o);
	return o;
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
	qunyou_chenjunxieshi: "问鼎•陈郡谢氏",
	qunyou_xingheshuo: "山河如梦•朔",
	yachaiclan: "崖柴的族武将设",
	qunyou_sinatsuriku:"西夏笠谷",
	qunyou_gaijin:"有问题的设计",
	qunyou_yongdong:"能永动的武将",
};

const characterSort = {
	qunyou_chenjunxieshi: ["qunyou_xiedaoyun", "qunyou_xiean", "qunyou_xiexuan", "qunyou_xielingyun", "qunyou_xieshi"],
    qunyou_xingheshuo: ["shanhe_zhangjiao", "shanhe_luzhi", "shanhe_dongzhuo"],
	yachaiclan: ["yachaiclan_cuiyan", "yachaiclan_wangxiang", "yachaiclan_diaochan", "yachaiclan_wuyi", "yachaiclan_xunyu", "yachaiclan_luxun", "yachaiclan_lukang", "yachaiclan_luji", "yachaiclan_luyun"],
	qunyou_sinatsuriku: ["qunyou_yang_wang","qunyou_xian_hua","qunyou_sunce","qunyou_lvlingqi"],
	qunyou_gaijin: ["qunyou_zhugeliang", "qunyou_weiguanyu"],
	qunyou_yongdong: ["qunyou_wuzhangfei", "qunyou_wanglang"],
};

/**
 * 无名杀扩展 package，结构与「奇臣传」扩展一致
 */
export function getPackage() {
	return {
		character: {
			character: cloneAndPatchCharacters(),
			translate: { ...characterTranslate, ...characterSortTranslate },
			characterSort: {
				mode_extension_群友设计: characterSort,
			},
			characterTitle: { ...characterTitle },
			characterIntro: { ...characterIntro },
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
