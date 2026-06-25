import { getPackage } from "./src/package.js";
import { precontent } from "./src/precontent.js";

export const type = "extension";

export default function () {
	return {
		name: "群友设计",
		editable: true,
		connect: false,
		arenaReady() {},
		content(config, pack) {},
		prepare() {},
		precontent,
		help: {},
		config: {},
		package: getPackage(),
		intro: "群友投稿扩展：在 src/character、src/skill、src/card、src/translate 中按模块添加内容。",
		author: "无名玩家",
		diskURL: "",
		forumURL: "",
		version: "1.0",
		files: {
			character: [
				"image/character/qunyou_wenyang.jpg",
				"image/character/qunyou_shibao.jpg",
				"image/character/qunyou_xiedaoyun.jpg",
				"image/character/qunyou_xiean.jpg",
				"image/character/qunyou_xiexuan.jpg",
				"image/character/qunyou_xielingyun.jpg",
				"image/character/qunyou_xieshi.jpg",
				"image/character/qunyou_zhaoyun.jpg",
				"image/character/qunyou_sunshao.jpg",
				"image/character/qunyou_sunxiu.jpg",
				"image/character/qunyou_caocao.jpg",
				"image/character/qunyou_liukun.jpg",
				"image/character/qunyou_spwenyang.jpg",
				"image/character/qunyou_simayi.jpg",
			],
			card: [],
			skill: [],
			audio: [
				"audio/die/qunyou_wenyang.mp3",
				"audio/die/qunyou_shibao.mp3",
				"audio/die/qunyou_xiedaoyun.mp3",
				"audio/die/qunyou_xiean.mp3",
				"audio/die/qunyou_xiexuan.mp3",
				"audio/die/qunyou_xielingyun.mp3",
				"audio/die/qunyou_xieshi.mp3",
				"audio/die/qunyou_zhaoyun.mp3",
				"audio/die/qunyou_sunshao.mp3",
				"audio/die/qunyou_sunxiu.mp3",
				"audio/die/qunyou_caocao.mp3",
				"audio/die/qunyou_spwenyang.mp3",
				"audio/die/qunyou_liukun.mp3",
				"audio/die/qunyou_simayi.mp3",
				"audio/skill/qunyou_sc1_guanyong1.mp3",
				"audio/skill/qunyou_sc1_guanyong2.mp3",
			],
		},
	};
}
