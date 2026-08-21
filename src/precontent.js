import { lib, game } from "noname";
import dynamicTranslates from "./translate/dynamicTranslate.js";

/**
 * 扩展加载时执行：可在此注册 lib.namePrefix、合并 lib.dynamicTranslate 等
 */
export function precontent() {
	lib.namePrefix.set("群友", {
		getSpan: () => {
			const span = document.createElement("span"), style = span.style;
			style.writingMode = style.webkitWritingMode = "horizontal-tb";
			style.fontFamily = "STXingkai, KaiTi, '楷体', sans-serif";
			style.fontSize = "11px";
			style.color = "#E0E0E0";
			style.fontWeight = "bold";
			style.letterSpacing = "-0.5px";
			span.textContent = "群友";
			return span.outerHTML;
		},
	});
	lib.namePrefix.set("问鼎", {
		getSpan: () => {
			const span = document.createElement("span"), style = span.style;
			style.writingMode = style.webkitWritingMode = "horizontal-tb";
			style.fontFamily = "STLiti, '隶书', KaiTi, '楷体', sans-serif";
			style.fontSize = "11px";
			style.color = "#FFD700";
			style.fontWeight = "bold";
			style.letterSpacing = "-0.5px";
			span.textContent = "问鼎";
			return span.outerHTML;
		},
	});
	lib.namePrefix.set("崖柴", {
		getSpan: () => {
			const span = document.createElement("span"), style = span.style;
			style.writingMode = style.webkitWritingMode = "horizontal-tb";
			style.fontFamily = "KaiTi, '楷体', STKaiti, sans-serif";
			style.fontSize = "12px";
			style.color = "#B388FF";
			style.textShadow = "0 0 1px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.5)";
			style.fontWeight = "normal";
			style.letterSpacing = "-0.5px";
			span.textContent = "崖柴";
			return span.outerHTML;
		},
	});
	lib.namePrefix.set("3D", {
		getSpan: () => {
			const span = document.createElement("span"), style = span.style;
			style.writingMode = style.webkitWritingMode = "horizontal-tb";
			style.fontFamily = "SimHei, '黑体', sans-serif";
			style.fontSize = "12px";
			style.color = "#90EE90";
			style.fontWeight = "bold";
			style.letterSpacing = "-0.5px";
			span.textContent = "3D";
			return span.outerHTML;
		},
	});
	lib.namePrefix.set("秋风", {
		getSpan: () => {
			const span = document.createElement("span"), style = span.style;
			style.writingMode = style.webkitWritingMode = "horizontal-tb";
			style.fontFamily = "STXingkai, KaiTi, '楷体', sans-serif";
			style.fontSize = "11px";
			style.color = "#FF5A36";
			style.fontWeight = "bold";
			style.letterSpacing = "-0.5px";
			span.textContent = "秋风";
			return span.outerHTML;
		},
	});
	lib.namePrefix.set("小白", {
		getSpan: () => {
			const span = document.createElement("span"), style = span.style;
			style.writingMode = style.webkitWritingMode = "horizontal-tb";
			style.fontFamily = "SimSun, KaiTi, '楷体', sans-serif";
			style.fontSize = "11px";
			style.color = "#FFFFFF";
			//style.textShadow = "-1px -1px 0 #000000, 1px -1px 0 #000000, -1px 1px 0 #000000, 1px 1px 0 #000000";
			style.fontWeight = "bold";
			style.letterSpacing = "-0.5px";
			span.textContent = "小白";
			return span.outerHTML;
		},
	});
	lib.namePrefix.set("自书", {
		getSpan: () => {
			const span = document.createElement("span"), style = span.style;
			style.writingMode = style.webkitWritingMode = "horizontal-tb";
			style.fontFamily = "KaiTi, '楷体', STKaiti, sans-serif";
			style.fontSize = "11px";
			style.color = "#c8cdd1";
			style.fontWeight = "bold";
			style.letterSpacing = "-0.5px";
			span.textContent = "自书";
			return span.outerHTML;
		},
	});
	lib.namePrefix.set("濯名", {
		getSpan: () => {
			const span = document.createElement("span"), style = span.style;
			style.writingMode = style.webkitWritingMode = "horizontal-tb";
			style.fontFamily = "YouYuan, KaiTi, '楷体', sans-serif";
			style.fontSize = "11px";
			style.color = "#9ec5ff";
			style.fontWeight = "bold";
			style.letterSpacing = "-0.5px";
			span.textContent = "濯名";
			return span.outerHTML;
		},
	});
	lib.namePrefix.set("谋", {
		color: "#def7ca",
		nature: "woodmm",
	});
	lib.namePrefix.set("魔", {
		color: "#2e002e",
		nature: "firemm",
	});
	lib.namePrefix.set("嗔", {
		color: "#c8cdd1",
	});
	lib.namePrefix.set("梦", {
		color: "#6affe2",
		nature: "watermm",
	});
	lib.namePrefix.set("武", {
		color: "#c8cdd1",
		nature: "woodmm",
	});
	lib.namePrefix.set("威", {
		color: "#ff9966",
        nature: "glodenmm",
	});
	lib.namePrefix.set("朔", {
		color: "#dbdbdb",
        nature: "glodenmm",
	});
	lib.namePrefix.set("弦", {
		color: "#9ec5ff",
        nature: "watermm",
	});
	lib.namePrefix.set("望", {
		color: "#ffe9a8",
        nature: "shenmm",
	});
	lib.namePrefix.set("晦", {
		color: "#3d3d3d",
        nature: "blackmm",
	});
	lib.namePrefix.set("新", {
		color: "#fefedc",
		nature: "shenmm",
	});
	lib.namePrefix.set("西夏", {
		getSpan: () => {
			const span = document.createElement("span"), style = span.style;
			style.writingMode = style.webkitWritingMode = "horizontal-tb";
			style.fontFamily = "KaiTi, '楷体', STLiti,  '隶书', sans-serif";
			style.fontSize = "11px";
			style.color = "#00c2a8";
			style.fontWeight = "bold";
			style.letterSpacing = "-0.5px";
			span.textContent = "西夏";
			return span.outerHTML;
		},
	});
	// 注册汉势力
	game.addGroup("han", "汉", "汉势力", {
		color: "#FAD6A2",
		image: "ext:群友设计/image/card/group_han.png",
	});

	// 来自活动武将扩展
	lib.poptip.add({
		name: "奋武技",
		id: "rule_shiwuSkill",
		info: "奋武技的使用次数为本轮你造成和受到的伤害值+1，至多为5。",
	});
	lib.dynamicTranslate ??= {};
	for (const key of Object.keys(dynamicTranslates)) {
		if (!lib.dynamicTranslate[key]) {
			lib.dynamicTranslate[key] = dynamicTranslates[key];
		}
	}
	// 若武将译名需前缀着色，与奇臣传一致在此注册，例如：
	// lib.namePrefix.set("群", { color: "#90caf9" });
}
