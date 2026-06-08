/**
 * 扩展锦囊/卡牌插画：extension/群友设计/image/card/{卡牌键名}.jpg
 */
export function patchCardPackImages(cards) {
	for (const name of Object.keys(cards)) {
		delete cards[name].cardimage;
		cards[name].image = `ext:群友设计/image/card/${name}.jpg`;
	}
}
