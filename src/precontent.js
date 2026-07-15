import { lib, game } from "noname";
import dynamicTranslates from "./translate/dynamicTranslate.js";

/**
 * 扩展加载时执行：可在此注册 lib.namePrefix、合并 lib.dynamicTranslate 等
 */
export function precontent() {
	lib.namePrefix.set("自书", {
		color: "#c8cdd1",
		nature: "inkmm",
	});
	lib.namePrefix.set("谋", {
		color: "#def7ca",
		nature: "woodmm",
	});
	lib.namePrefix.set("魔", {
		color: "#2e002e",
		nature: "firemm",
	});
	lib.namePrefix.set("嗔", {
		color: "#c8cdd1",
	});
	lib.namePrefix.set("梦", {
		color: "#6affe2",
		nature: "watermm",
	});
	lib.namePrefix.set("武", {
		color: "#c8cdd1",
		nature: "woodmm",
	});
	lib.namePrefix.set("威", {
		color: "#ff9966",
        nature: "glodenmm",
	});
	lib.namePrefix.set("朔", {
		color: "#dbdbdb",
        nature: "glodenmm",
	});
	// 注册汉势力
	game.addGroup("han", "汉", "汉势力", {
		color: "#FAD6A2",
		image: "ext:群友设计/image/card/group_han.png",
	});

	// 来自活动武将扩展
	lib.poptip.add({
		name: "奋武技",
		id: "rule_shiwuSkill",
		info: "奋武技的使用次数为本轮你造成和受到的伤害值+1，至多为5。",
	});
	lib.dynamicTranslate ??= {};
	for (const key of Object.keys(dynamicTranslates)) {
		if (!lib.dynamicTranslate[key]) {
			lib.dynamicTranslate[key] = dynamicTranslates[key];
		}
	}
	// 若武将译名需前缀着色，与奇臣传一致在此注册，例如：
	// lib.namePrefix.set("群", { color: "#90caf9" });
}
