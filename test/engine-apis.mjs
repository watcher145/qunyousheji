import { readFileSync } from "node:fs";

// 引擎 API 白名单（从源码静态提取）
function extract(file) {
	const t = readFileSync(file, "utf8");
	const re = /^\s{2}(?:async\s+)?([a-zA-Z_$][\w$]*)\(/gm;
	const set = new Set();
	let m;
	while ((m = re.exec(t))) set.add(m[1]);
	return set;
}

const E = "G:/game/noname/resources/app/noname/";
const sets = {
	player: extract(E + "library/element/player.js"),
	content: extract(E + "library/element/content.js"),
	game: extract(E + "game/index.js"),
	get: extract(E + "get/index.js"),
	ui: extract(E + "ui/index.js"),
	lib: extract(E + "library/index.js"),
};
const allApis = new Set();
for (const k of Object.keys(sets)) for (const x of sets[k]) allApis.add(x);

export function getApiSets() {
	return sets;
}
export function hasApi(name) {
	return allApis.has(name);
}
export { extract };