// 技能翻译汇总（键集合与拆分前一致）
// spread 顺序 = 前缀包序（qunyou 最先，其余按 characterSort 包序：threed→qiufeng→zishu→zhuoming
// →wending→shanhe→xingyu→yachai→xuandie→maokuo→xiaobai），clan/misc 为非包内公共技能放最后
import { qunyouTranslate } from "./qunyou.js";
import { threedTranslate } from "./threed.js";
import { qiufengTranslate } from "./qiufeng.js";
import { zishuTranslate } from "./zishu.js";
import { zhuomingTranslate } from "./zhuoming.js";
import { wendingTranslate } from "./wending.js";
import { shanheTranslate } from "./shanhe.js";
import { xingyuTranslate } from "./xingyu.js";
import { yachaiTranslate } from "./yachai.js";
import { xuandieTranslate } from "./xuandie.js";
import { maokuoTranslate } from "./maokuo.js";
import { xiaobaiTranslate } from "./xiaobai.js";
import { clanTranslate } from "./clan.js";
import { miscTranslate } from "./misc.js";

export const skillTranslate = {
	...qunyouTranslate,
	...threedTranslate,
	...qiufengTranslate,
	...zishuTranslate,
	...zhuomingTranslate,
	...wendingTranslate,
	...shanheTranslate,
	...xingyuTranslate,
	...yachaiTranslate,
	...xuandieTranslate,
	...maokuoTranslate,
	...xiaobaiTranslate,
	...clanTranslate,
	...miscTranslate,
};
