import { lib } from "noname";
import dynamicTranslates from "./translate/dynamicTranslate.js";

/**
 * 扩展加载时执行：可在此注册 lib.namePrefix、合并 lib.dynamicTranslate 等
 */
export function precontent() {
	lib.dynamicTranslate ??= {};
	for (const key of Object.keys(dynamicTranslates)) {
		if (!lib.dynamicTranslate[key]) {
			lib.dynamicTranslate[key] = dynamicTranslates[key];
		}
	}
	// 若武将译名需前缀着色，与奇臣传一致在此注册，例如：
	// lib.namePrefix.set("群", { color: "#90caf9" });
}
