// 技能翻译汇总（按前缀分文件，键集合与拆分前一致）
import { qunyouTranslate } from "./qunyou.js";
import { wendingTranslate } from "./wending.js";
import { shanheTranslate } from "./shanhe.js";
import { xiaobaiTranslate } from "./xiaobai.js";
import { yachaiTranslate } from "./yachai.js";
import { clanTranslate } from "./clan.js";
import { zishuTranslate } from "./zishu.js";
import { qiufengTranslate } from "./qiufeng.js";
import { threedTranslate } from "./threed.js";
import { zhuomingTranslate } from "./zhuoming.js";
import { xuandieTranslate } from "./xuandie.js";
import { miscTranslate } from "./misc.js";
import { maokuoTranslate } from "./maokuo.js";
import { xingyuTranslate } from "./xingyu.js";

export const skillTranslate = {
	...qunyouTranslate,
	...wendingTranslate,
	...shanheTranslate,
	...xiaobaiTranslate,
	...yachaiTranslate,
	...clanTranslate,
	...zishuTranslate,
	...qiufengTranslate,
	...threedTranslate,
	...zhuomingTranslate,
	...xuandieTranslate,
	...miscTranslate,
	...maokuoTranslate,
	...xingyuTranslate,
};
