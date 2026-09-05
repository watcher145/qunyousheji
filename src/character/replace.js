import { lib } from "noname";
/**
 * 角色替换列表：让群友设计角色与本体同名武将在选将页面可互相切换。
 * 参考 Nirvana 扩展（lib.arenaReady + lib.characterReplace）的做法。
 * 解析规则：取角色 id 最后一个 "_" 之后的部分作 baseName（支持"第二前缀+下划线"命名，
 * 如 qunyou_cbp_zhaoyun → zhaoyun），若 lib.character 中存在该本体 id，则加入替换组。
 */
const PREFIXES = ["qunyou_", "shanhe_", "zishu_", "zhuoming_", "yachaiclan_", "xiaobai_", "qiufeng_", "threed_"];

// 去掉末段后会误配到本体其他人物（名字不同人）的，需排除。
// 例：qunyou_simayi=司马乂（本体 simayi=司马懿）、qunyou_sunshao=孙绍（本体 sunshao=孙韶）、qunyou_sunxiu=孙秀（本体 sunxiu=孙休）
const EXCLUDED = new Set(["qunyou_simayi", "qunyou_sunshao", "qunyou_sunxiu"]);

export function setupCharacterReplace() {
	const cr = lib.characterReplace || (lib.characterReplace = {});
	for (const charName of Object.keys(lib.character)) {
		if (EXCLUDED.has(charName)) continue;
		if (!PREFIXES.some((p) => charName.startsWith(p))) continue;
		const idx = charName.lastIndexOf("_");
		if (idx < 0) continue;
		const baseName = charName.slice(idx + 1);
		if (!baseName || baseName === charName || !lib.character[baseName]) continue;
		if (!cr[baseName]) cr[baseName] = [baseName];
		if (!cr[baseName].includes(charName)) cr[baseName].push(charName);
		if (!cr[charName]) {
			cr[charName] = [charName].concat(cr[baseName].filter((i) => i !== charName));
		}
	}
}