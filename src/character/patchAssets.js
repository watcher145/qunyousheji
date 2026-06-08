import { lib } from "noname";

/**
 * 立绘：extension/群友设计/image/character/{武将id}.jpg
 * 阵亡配音：extension/群友设计/audio/die/{武将id}.mp3
 */
export function patchCharacterAssets(characters) {
	for (const id of Object.keys(characters)) {
		characters[id].img = lib.assetURL + `extension/群友设计/image/character/${id}.jpg`;
		characters[id].dieAudios = [`ext:群友设计/audio/die/${id}.mp3`];
	}
}
