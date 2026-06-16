import { lib, get, _status } from "noname";

const blue = (text) => `<span class="bluetext">${text}</span>`;

const dynamicTranslates = {
	qunyou_miaoyu(player, skill) {
		const base = lib.translate[`${skill}_info`] || "";
		const cur = _status.currentPhase;
		if (!cur?.isIn()) {
			return `${base}<br>${blue("当前回合角色手牌上限：无当前回合角色")}`;
		}
		const L = cur.getHandcardLimit();
		return `${base}<br>${blue(`当前回合角色：${get.translation(cur)}；手牌上限：${L}`)}`;
	},
	qunyou_guwo(player) {
		const state = player.storage.qunyou_guwo_state || 0;
		const text = "转换技，锁定技，当你使用牌结算后，①②③若与你上使用牌点数递增，②③则将体力调整至手牌数，③手牌调整至已损失体力数。";
		if (state === 0) {
			return text.replace("①", blue("①")).replace("若与你上使用牌点数递增", blue("若与你上使用牌点数递增"));
		}
		if (state === 1) {
			return text
				.replaceAll("②", blue("②"))
				.replace("若与你上使用牌点数递增", blue("若与你上使用牌点数递增"))
				.replace("则将体力调整至手牌数", blue("则将体力调整至手牌数"));
		}
		return text
			.replaceAll("③", blue("③"))
			.replace("若与你上使用牌点数递增", blue("若与你上使用牌点数递增"))
			.replace("则将体力调整至手牌数", blue("则将体力调整至手牌数"))
			.replace("手牌调整至已损失体力数", blue("手牌调整至已损失体力数"));
	},
	qunyou_chubu(player) {
		const state = player.storage.qunyou_chubu_state || 0;
		const text = "转换技，锁定技，当你使用牌结算后，①②③若与你上使用牌点数递减，②③则弃置所有手牌摸1张牌，③并减1点体力上限。";
		if (state === 0) {
			return text.replace("①", blue("①")).replace("若与你上使用牌点数递减", blue("若与你上使用牌点数递减"));
		}
		if (state === 1) {
			return text
				.replaceAll("②", blue("②"))
				.replace("若与你上使用牌点数递减", blue("若与你上使用牌点数递减"))
				.replace("则弃置所有手牌摸1张牌", blue("则弃置所有手牌摸1张牌"));
		}
		return text
			.replaceAll("③", blue("③"))
			.replace("若与你上使用牌点数递减", blue("若与你上使用牌点数递减"))
			.replace("则弃置所有手牌摸1张牌", blue("则弃置所有手牌摸1张牌"))
			.replace("并减1点体力上限", blue("并减1点体力上限"));
	},
};

export default dynamicTranslates;
