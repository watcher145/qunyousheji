// 记录型 mock：一切未知属性返回可调用桩（记录访问），数组属性返回真数组，choose 事件返回链式桩
function makeChooser(result) {
	return {
		result,
		set() {
			return this;
		},
		onresult() {
			return this;
		},
		forResult: async () => result,
	};
}

function makeRecorder(target, name, log) {
	return new Proxy(target, {
		get(obj, prop) {
			if (prop === Symbol.toStringTag) return "Mock" + name;
			if (prop === "then") return undefined;
			if (prop in obj) return obj[prop];
			const key = `${name}.${String(prop)}`;
			log.add(key);
			if (typeof prop == "string") {
				if (["players", "dead", "filterPlayer", "childNodes", "buttons", "targets", "cards", "links", "list"].includes(prop)) {
					obj[prop] = [];
					return obj[prop];
				}
				// 通用可调用桩
				const fn = function (...args) {
					const r = { bool: false, links: [], cards: [], targets: [], control: "cancel", winner: null, moved: [] };
					return makeChooser(r);
				};
				obj[prop] = fn;
				return fn;
			}
			if (!(prop in obj)) {
				obj[prop] = makeRecorder({}, key, log);
			}
			return obj[prop];
		},
		set(obj, prop, value) {
			obj[prop] = value;
			return true;
		},
		has(obj, prop) {
			return prop in obj || typeof prop == "string";
		},
	});
}

export function createMockNoname() {
	globalThis.window ??= globalThis;
	const log = new Set();
	const getImpl = {
		poptip: (x) => x,
		prompt: (x) => x,
		prompt2: (x) => x,
		translation: (x) => (typeof x == "string" ? x : x?.name || "牌"),
		cnNumber: (n) => String(n),
		cnNumber2: (n) => String(n),
		type: () => "basic",
		type2: () => "basic",
		subtype: () => "equip1",
		name: () => "sha",
		suit: () => "heart",
		number: (c) => c?.number ?? 5,
		color: (card) => {
			if (card && typeof card == "object") {
				if (card.color === "red" || card.color === "black") return card.color;
				if (card.suit) return ["heart", "diamond"].includes(card.suit) ? "red" : "black";
			}
			return "red";
		},
		suit: (card) => (card && typeof card == "object" ? card.suit || "heart" : "heart"),
		value: () => 3,
		itemtype: (x) => {
			if (x == null) return null;
			if (Array.isArray(x)) return "cards";
			if (typeof x == "string") return "cardname";
			if (x.playerid != null) return "player";
			if (x.cards != null) return "vcard";
			if (x.isCard) return "card";
			if (x.name != null) return "card";
			return "object";
		},
		inpile: (t) => (t == "basic" ? ["sha", "shan", "tao", "jiu"] : t == "trick" ? ["wuzhong", "juedou"] : ["sha"]),
		info: (x) => (x && typeof x == "object" ? {} : {}),
		// 真实 tag/type：查 lib.card 配置（供技能 filter 正确判断）
		tag: (item, tag) => {
			// 引擎真实行为：裸字符串时 get.info 只查 lib.skill（技能表）不查 lib.card → 返回 undefined
			// 只有对象（{name} 或实体卡）才查卡牌表。这里故意模拟，让自检能抓"裸字符串传 tag"的 bug
			if (typeof item == "string") return undefined;
			const name = typeof item == "object" ? item?.name : item;
			return lib.card[name]?.ai?.tag?.[tag];
		},
		type: (item) => {
			const name = typeof item == "string" ? item : item?.name;
			return lib.card[name]?.type || "basic";
		},
		type2: (item) => {
			const name = typeof item == "string" ? item : item?.name;
			return lib.card[name]?.type2 || lib.card[name]?.type || "basic";
		},
		select: (s) => (Array.isArray(s) ? s : [1, 1]),
		copy: (x) => (x && typeof x == "object" ? { ...x } : x),
		attitude: () => 0,
		effect: () => 1,
		rand: () => 0,
		autoViewAs: (x) => ({ ...x, isCard: true }),
		position: () => "h",
		owner: () => null,
		cardPile: () => [],
		cardPile2: () => [],
		discardPile: () => [],
		rawName: (x) => (typeof x == "string" ? x : x?.name || ""),
		zhuanhuanItemNum: () => 2,
		is: {
			damageCard(card, includeDelay) {
				if (!lib.card[card?.name]?.ai?.tag?.damage) return false;
				if (!includeDelay && get.type(card) === "delay") return false;
				return true;
			},
		},
	};
	const get = makeRecorder(getImpl, "get", log);
	const lib = makeRecorder(
		{
			skill: {},
			zhanfa: { getList: () => [], each: () => {} },
			card: {},
			character: {},
			translate: {},
			assetURL: "test://asset/",
			inpile: ["sha", "shan", "tao", "jiu", "wuzhong", "juedou"],
			inpile_nature: ["fire", "thunder"],
		},
		"lib",
		log
	);
	const ai = makeRecorder({ basic: {}, index: {} }, "ai", log);
	const game = makeRecorder({}, "game", log);
	const ui = makeRecorder({}, "ui", log);
	const _status = makeRecorder({}, "_status", log);
	game.players = [];
	game.dead = [];
	game.filterPlayer = () => [];
	game.hasPlayer = () => false;
	game.countPlayer = () => 0;
	game.log = () => {};
	game.broadcast = () => {};
	game.broadcastAll = () => {};
	game.addCardKnower = () => {};
	game.createEvent = (name) => ({ name, player: null, setContent() { return this; }, start() {}, trigger() {} });
	game.cardsGotoOrdering = async () => {};
	game.cardsGotoPile = async () => {};
	ui.discardPile = { childNodes: [], appendChild() {}, insertBefore() {}, firstChild: null };
	ui.cardPile = { childNodes: [], appendChild() {}, insertBefore() {}, firstChild: null };
	return { lib, game, get, ui, _status, ai, log };
}

const cache = new Map();
export function getNoname() {
	if (!cache.has("noname")) {
		const mock = createMockNoname();
		cache.set("noname", mock);
	}
	return cache.get("noname");
}