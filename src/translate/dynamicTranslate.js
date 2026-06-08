import { lib, get, _status } from "noname";

/**
 * 局内动态技能描述：键为技能 id，值为 (player, skill) => string
 * 在 precontent 中合并到 lib.dynamicTranslate
 */
const dynamicTranslates = {
	/** 妙喻：局内显示当前回合角色手牌上限，便于对照 X 与 ±1 逻辑 */
	qunyou_miaoyu(player, skill) {
		const base = lib.translate[`${skill}_info`] || "";
		const cur = _status.currentPhase;
		if (!cur?.isIn()) {
			return `${base}<br><span class="bluetext">当前回合角色手牌上限：—（无当前回合角色）</span>`;
		}
		const L = cur.getHandcardLimit();
		const up = L + 1;
		const down = L - 1;
		const downStr = down < 1 ? "—（不足 1，不可选）" : String(down);
		return `${base}<br><span class="bluetext">当前回合角色：${get.translation(cur)}；手牌上限：${L}（选「+1」后 X=${up}；选「-1」后 X=${downStr}）</span>`;
	},
};

export default dynamicTranslates;
