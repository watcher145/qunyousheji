import fs from "node:fs";

const DIR = "G:/game/noname/resources/app/extension/群友设计/src/skill/";

function loadKeys(file) {
	const src = fs.readFileSync(DIR + file, "utf8");
	const lines = src.split("\n");
	// 汇总所有 import 的具名导出（helpers.js 可能是多行块）
	let names = [];
	let inImport = false;
	for (const l of lines) {
		if (/^\s*import\s/.test(l)) inImport = true;
		if (inImport) {
			const cleaned = l.replace(/^\s*import\s*/, "").replace(/from\s+["'][^"']*["'];?/, "");
			const m = cleaned.match(/\{([\s\S]*)\}/);
			const inner = m ? m[1] : cleaned;
			names = names.concat(
				inner
					.split(",")
					.map((x) => x.trim())
					.filter((x) => /^[A-Za-z_$][\w$]*$/.test(x))
			);
			if (/from\s+["']/.test(l)) inImport = false;
		}
	}
	names = [...new Set(names)];
	let skipImport = false;
	const body = lines
		.filter((l) => {
			if (/^\s*import\s/.test(l)) {
				skipImport = !/from\s+["']/.test(l);
				return false;
			}
			if (skipImport) {
				if (/from\s+["']/.test(l)) skipImport = false;
				return false;
			}
			return true;
		})
		.join("\n")
		.replace("export const skills =", "globalThis.__s =")
		.replace(/^export\s+/gm, "");
	const stub = {};
	for (const n of names) stub[n] = () => {};
	return Object.keys(
		new Function(...names, "lib", "game", "ui", "_status", body + "\nreturn globalThis.__s;")(...names.map((n) => stub[n]), {}, {}, {}, {})
	);
}

for (const file of ["yachai.js", "clan.js", "qunsai.js", "sanshe.js", "xiaobai.js"]) {
	const keys = loadKeys(file);
	const pref = {};
	for (const k of keys) {
		const p = k.includes("_") ? k.slice(0, k.indexOf("_")) : k;
		pref[p] = (pref[p] || 0) + 1;
	}
	console.log("=== " + file + " 顶层技能 " + keys.length + " 个 ===");
	console.log(
		"   " +
			Object.entries(pref)
				.sort((a, b) => b[1] - a[1])
				.map(([p, c]) => p + "×" + c)
				.join("  ")
	);
}
