import { lib, game, get, ui, _status } from "noname";

// 全局“牌堆可见牌”注册表：念嗣/清玄写入，浮饰读取；牌离开牌堆后按位置自动失效。
// 数据放 _status（每局重建），UI 在 arenaReady 里包装原生「牌堆」按钮。
const KEY = "qunyou_visiblePile";

export function qunyou_visiblePileSet() {
	if (!_status[KEY]) {
		_status[KEY] = new Set();
	}
	return _status[KEY];
}

export function qunyou_clearVisiblePile() {
	_status[KEY] = new Set();
}

export function qunyou_pruneVisiblePile() {
	const set = qunyou_visiblePileSet();
	for (const card of Array.from(set)) {
		if (!card || card.parentNode !== ui.cardPile) {
			set.delete(card);
		}
	}
	return set;
}

export function qunyou_getVisiblePileTop() {
	const set = qunyou_pruneVisiblePile();
	const list = [];
	Array.from(ui.cardPile.childNodes).forEach((card, index) => {
		if (set.has(card)) {
			list.push({ pos: index + 1, card });
		}
	});
	return list;
}

export function qunyou_hasVisiblePile() {
	return qunyou_getVisiblePileTop().length > 0;
}

export function qunyou_isPileCardVisible(card) {
	return !!card && card.parentNode === ui.cardPile && qunyou_visiblePileSet().has(card);
}

export function qunyou_syncFushi() {
	game.filterPlayer((current) => current.hasSkill("maokuo_fushi")).forEach((current) => lib.skill.maokuo_fushi?.syncFushi?.(current));
}

export function qunyou_markPileVisible(cards, log = true) {
	const set = qunyou_visiblePileSet();
	let added = 0;
	for (const card of cards || []) {
		if (!card || card.parentNode !== ui.cardPile) continue;
		if (!set.has(card)) {
			set.add(card);
			added++;
		}
	}
	qunyou_pruneVisiblePile();
	if (added) {
		if (log) game.log(`牌堆里的${get.cnNumber(added)}张牌被置为可见`);
		// 可见牌变化后，拥有〖浮饰〗的角色需要刷新“如手牌般使用”的假牌
		qunyou_syncFushi();
	}
	return added > 0;
}

export function setupVisiblePile() {
	qunyou_clearVisiblePile();
	if (typeof document == "undefined") return;
	const button = ui.cardPileButton;
	if (!button || button._qunyouVisiblePilePatched) return;
	const original = button._poppedfunc;
	if (typeof original !== "function") return;
	button._qunyouVisiblePilePatched = true;
	button._poppedfunc = function () {
		const uiintro = original.apply(this, arguments);
		if (game.online || _status.connectMode) {
			return uiintro;
		}
		const visible = qunyou_getVisiblePileTop();
		if (visible.length) {
			// 弃牌堆会越堆越长：把可见牌插到「弃牌堆」标题之前，保证一眼能看到
			const content = uiintro.content;
			const anchor = Array.from(content.childNodes).find((node) => node.textContent?.trim() === "弃牌堆");
			const before = content.childNodes.length;
			uiintro.add('<div class="text center">牌堆可见牌</div>');
			uiintro.addSmall([visible.map((item) => item.card), "card"]);
			const added = Array.from(content.childNodes).slice(before);
			const reference = anchor || content.firstChild;
			for (const node of added) {
				content.insertBefore(node, reference || null);
			}
		}
		return uiintro;
	};
}
