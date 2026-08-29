import { createMockNoname } from "./mock-noname.mjs";

const mocks = new Map();

export function initialize() {
	const mock = createMockNoname();
	mocks.set("noname", mock);
	return mock;
}

export function resolve(specifier, context, nextResolve) {
	if (specifier === "noname") {
		return { url: "noname-mock:" + specifier, shortCircuit: true };
	}
	if (specifier === "dedent") {
		// 指向引擎 node_modules 里已安装的 dedent
		return {
			url: "file:///G:/game/noname/resources/app/node_modules/.pnpm/dedent@1.7.1/node_modules/dedent/dist/dedent.js",
			shortCircuit: true,
		};
	}
	return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
	if (url.startsWith("noname-mock:")) {
		const mock = mocks.get("noname");
		return {
			format: "module",
			shortCircuit: true,
			source: `
				import { getNoname } from ${JSON.stringify(new URL("./mock-noname.mjs", import.meta.url).href)};
				const mock = getNoname();
				export const lib = mock.lib;
				export const game = mock.game;
				export const get = mock.get;
				export const ui = mock.ui;
				export const _status = mock._status;
				export const ai = mock.ai;
			`,
		};
	}
	return nextLoad(url, context);
}