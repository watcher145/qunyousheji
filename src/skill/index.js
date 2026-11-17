import { lib } from "noname";
import { skills as yachai } from "./yachai.js";
import { skills as clan } from "./clan.js";
import { skills as qunsai } from "./qunsai.js";
import { skills as sanshe } from "./sanshe.js";
import { skills as xiaobai } from "./xiaobai.js";
import { skills as identityYe } from "./identityYe.js";
import { skills as maokuo } from "./maokuo.js";
import { skills as xingyu } from "./xingyu.js";
import { skills as chashui } from "./chashui.js";
import { skills as chashuiSp } from "./chashuiSp.js";

export const skills = { ...yachai, ...clan, ...qunsai, ...sanshe, ...xiaobai, ...identityYe, ...maokuo, ...xingyu, ...chashui, ...chashuiSp };

// 注册期不变量：group 里写的每个 id 都必须真的有定义。
// 引擎的 disableSkill 会沿 group 递归读 `lib.skill[skills].group`
// （noname/library/element/player.js:11267-11269），悬空成员会在 awakenSkill / 技能失效
// 那一刻抛 `Cannot read properties of undefined (reading 'group')`（悬锋 2026-11-13 实测崩过）。
// 静态检查抓不到这一类：defineSkill 的 group 是加载期由 sub 的 key 拼出来的。
// subSkill 的成员由引擎自己注册成 `<父id>_<key>`（noname/game/index.js:8237-8241），一并算作已定义。
{
	const known = new Set(Object.keys(skills));
	for (const [id, info] of /** @type {[string, any][]} */ (Object.entries(skills))) {
		for (const key of Object.keys(info?.subSkill || {})) known.add(`${id}_${key}`);
	}
	for (const [id, info] of /** @type {[string, any][]} */ (Object.entries(skills))) {
		const group = info?.group;
		const list = typeof group === "string" ? [group] : Array.isArray(group) ? group : [];
		for (const member of list) {
			if (typeof member !== "string") continue;
			if (known.has(member) || lib.skill?.[member]) continue;
			throw new Error(`[群友设计] 技能 ${id} 的 group 引用了不存在的技能 ${member}（会导致 awakenSkill/失效时崩溃）`);
		}
	}
}

// chooseButton 转化技的 useSkill 兜底（坑见 docs/坑-清单.md:33）：
// chooseToUse 收尾若结果缺 card，会走 useResult→player.useSkill（content.js:7373）；
// useSkill 无条件读取 info.content 建技能事件（content.js:9924），缺 content 时子事件已入队但没挂 content，
// 随后运行到 gameEvent.js:232 报 this.content is not a function（父事件正是 useSkill）。
// 这里只做"不崩"的兜底：不猜牌面/不结算（具体技能需要时自行写等价 content，如 xiaobai_kenyan）。
// 这里是对异构技能对象的反射探针：逐个探「有没有 chooseButton / content / inherit」，
// 必然要读所有成员都不同时具备的字段，所以显式声明成 any 才是对的类型（不是放宽检查）。
for (const [id, info] of /** @type {[string, any][]} */ (Object.entries(skills))) {
	if (!info || !info.chooseButton || info.content != null || info.inherit) continue;
	info.content = async function (event) {
		console.error("[群友设计] chooseButton 技能走了 useSkill 兜底（该技能未定义 content）：", id, "cards:", event.cards, "targets:", event.targets);
	};
}
