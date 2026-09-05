"use strict";

const $ = sel => document.querySelector(sel);
const state = {
	ext: null,
	locate: null,       // { targets, existingIds, files }
	meta: null,         // { prefixes, packages }
	skills: { ext: [], global: [] },
	byId: new Map(),
	selectedSkills: [], // 有序
	selectedPrefixes: [],
	tab: "ext",
	filtered: [],
	shown: 0,
	PAGE: 100,
};

/* ---------------- 工具 ---------------- */

function esc(s) {
	return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtInfo(info) {
	// 模板串里的 ${get.poptip("xxx")} 渲染成【技能名】
	return esc(info).replace(/\$\{get\.poptip\(["']([^"']+)["']\)\}/g, (m, id) => {
		const s = state.byId.get(id);
		return `<span class="poptip">【${esc(s ? s.name : id)}】</span>`;
	});
}

async function api(path, opts) {
	const r = await fetch(path, opts);
	const data = await r.json();
	if (data.error) throw new Error(data.error);
	return data;
}

/* ---------------- 扩展与文件定位 ---------------- */

const ROLE_NAMES = { data: "data", translate: "translate", title: "title", intro: "intro", package: "package" };

function renderFileChips() {
	const box = $("#fileChips");
	box.innerHTML = "";
	const targets = state.locate?.targets || {};
	for (const role of Object.keys(ROLE_NAMES)) {
		const t = targets[role];
		const chip = document.createElement("span");
		chip.className = "file-chip" + (t ? "" : " missing");
		chip.innerHTML = `<b>${ROLE_NAMES[role]}</b>${t ? esc(t.rel) : "未找到"}`;
		chip.title = t ? state.ext + "/" + t.rel : "自动定位失败，请把对应文件放到约定位置";
		box.appendChild(chip);
	}
}

async function loadExt(ext) {
	state.ext = ext;
	$("#skillMeta").textContent = "加载中…";
	const [locate, meta] = await Promise.all([
		api(`/api/locate?ext=${encodeURIComponent(ext)}`),
		api(`/api/meta?ext=${encodeURIComponent(ext)}`),
	]);
	state.locate = locate;
	state.meta = meta;
	renderFileChips();

	// 前缀 datalist
	const dl = $("#prefixList");
	dl.innerHTML = meta.prefixes.map(p => `<option value="${esc(p)}">`).join("");

	// 包复选
	const pl = $("#packageList");
	pl.innerHTML = "";
	if (!meta.packages.length) {
		pl.innerHTML = `<span class="hint">未扫描到 characterSort 包</span>`;
	} else {
		for (const p of meta.packages) {
			const label = document.createElement("label");
			label.className = "pkg-item";
			label.innerHTML = `<input type="checkbox" value="${esc(p.key)}"><span class="pkg-name">${esc(p.name)}</span><span class="pkg-key">${esc(p.key)}</span>`;
			pl.appendChild(label);
		}
	}

	// 技能（本扩展快、本体可能要几秒）
	state.skills = { ext: [], global: [] };
	rebuildById();
	api(`/api/skills?ext=${encodeURIComponent(ext)}`).then(s => {
		state.skills = s;
		rebuildById();
		$("#skillMeta").textContent = `本扩展 ${s.ext.length} 个技能 · 游戏本体 ${s.global.length} 个技能`;
		if ($("#skillOverlay").classList.contains("hidden")) return;
		applyFilter();
	});
	$("#skillMeta").textContent = "扫描技能中…";
	applyFilter();
}

function rebuildById() {
	state.byId = new Map();
	for (const s of [...state.skills.ext, ...state.skills.global]) state.byId.set(s.id, s);
}

/* ---------------- id 查重 ---------------- */

$("#charId").addEventListener("input", () => {
	const v = $("#charId").value.trim();
	const hint = $("#idHint");
	if (!state.locate) { hint.textContent = ""; return; }
	const ids = state.locate.existingIds || [];
	if (!v) { hint.textContent = ""; return; }
	if (!/^[A-Za-z_$][\w$]*$/.test(v)) {
		hint.textContent = "✗ 不是合法的 JS 标识符";
		hint.style.color = "var(--err)";
	} else if (ids.includes(v)) {
		hint.textContent = "✗ 该 id 已存在于 data 文件";
		hint.style.color = "var(--err)";
	} else {
		hint.textContent = "✓ 可用";
		hint.style.color = "var(--ok)";
	}
});

/* ---------------- 技能选择 ---------------- */

function renderSkillChips() {
	const box = $("#skillChips");
	box.innerHTML = "";
	if (!state.selectedSkills.length) {
		box.innerHTML = `<span class="hint">尚未选择技能（点击“选择 / 浏览技能”）</span>`;
		return;
	}
	state.selectedSkills.forEach((id, i) => {
		const s = state.byId.get(id) || { name: id };
		const chip = document.createElement("span");
		chip.className = "chip";
		chip.innerHTML = `<span class="mv" data-i="${i}" data-d="-1">▲</span><span class="mv" data-i="${i}" data-d="1">▼</span>` +
			`<b>${esc(s.name)}</b><span class="hint">${esc(id)}</span><span class="x" data-i="${i}">✕</span>`;
		box.appendChild(chip);
	});
}

$("#skillChips").addEventListener("click", e => {
	const t = e.target;
	if (t.classList.contains("x")) {
		state.selectedSkills.splice(Number(t.dataset.i), 1);
		renderSkillChips();
	} else if (t.classList.contains("mv")) {
		const i = Number(t.dataset.i), d = Number(t.dataset.d);
		const j = i + d;
		if (j < 0 || j >= state.selectedSkills.length) return;
		[state.selectedSkills[i], state.selectedSkills[j]] = [state.selectedSkills[j], state.selectedSkills[i]];
		renderSkillChips();
	}
});

$("#openSkillPicker").addEventListener("click", () => {
	$("#skillOverlay").classList.remove("hidden");
	applyFilter();
});
$("#closeSkillPicker").addEventListener("click", () => $("#skillOverlay").classList.add("hidden"));
$("#skillOverlay").addEventListener("click", e => { if (e.target === $("#skillOverlay")) $("#skillOverlay").classList.add("hidden"); });

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
	document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
	state.tab = btn.dataset.tab;
	state.shown = 0;
	applyFilter();
}));

$("#skillSearch").addEventListener("input", () => { state.shown = 0; applyFilter(); });

function applyFilter() {
	const kw = $("#skillSearch").value.trim().toLowerCase();
	const pool = state.skills[state.tab] || [];
	let list = pool;
	if (kw) {
		list = pool.filter(s => s.name.toLowerCase().includes(kw) || s.id.toLowerCase().includes(kw) || (s.info || "").toLowerCase().includes(kw));
	}
	state.filtered = list;
	renderSkillList();
	const sel = state.selectedSkills.length;
	$("#skillMeta").textContent = `本扩展 ${state.skills.ext.length} · 本体 ${state.skills.global.length}` +
		(kw ? ` · 命中 ${list.length}` : "") + (sel ? ` · 已选 ${sel}` : "");
}

function renderSkillList() {
	const box = $("#skillList");
	const list = state.filtered;
	const show = list.slice(0, Math.max(state.shown, state.PAGE));
	state.shown = show.length;
	box.innerHTML = "";
	const frag = document.createDocumentFragment();
	for (const s of show) {
		const div = document.createElement("div");
		div.className = "skill-item" + (state.selectedSkills.includes(s.id) ? " selected" : "");
		const info = s.info ? `<div class="sinfo">${fmtInfo(s.info)}</div>` : `<div class="sinfo hint">（无描述）</div>`;
		div.innerHTML = `<div class="row1"><span class="sname">${esc(s.name || s.id)}</span><span class="sid">${esc(s.id)}</span></div>` +
			info + `<div class="stail">来源：${esc(s.from || "")}</div>`;
		div.addEventListener("click", () => {
			const i = state.selectedSkills.indexOf(s.id);
			if (i >= 0) state.selectedSkills.splice(i, 1);
			else state.selectedSkills.push(s.id);
			div.classList.toggle("selected", state.selectedSkills.includes(s.id));
			renderSkillChips();
			$("#skillMeta").textContent = $("#skillMeta").textContent.replace(/· 已选 \d+$/, "").trim() + (state.selectedSkills.length ? ` · 已选 ${state.selectedSkills.length}` : "");
		});
		frag.appendChild(div);
	}
	box.appendChild(frag);
	$("#skillCount").textContent = `显示 ${show.length} / ${list.length}`;
	$("#skillMore").classList.toggle("hidden", show.length >= list.length);
}

$("#skillMore").addEventListener("click", () => { state.shown += state.PAGE; renderSkillList(); });

/* ---------------- 前缀 ---------------- */

function renderPrefixChips() {
	const box = $("#prefixChips");
	box.innerHTML = "";
	if (!state.selectedPrefixes.length) {
		box.innerHTML = `<span class="hint">无前缀（不写入 id_prefix）</span>`;
		return;
	}
	state.selectedPrefixes.forEach((p, i) => {
		const chip = document.createElement("span");
		chip.className = "chip prefix";
		chip.innerHTML = `<b>${esc(p)}</b><span class="x" data-i="${i}">✕</span>`;
		box.appendChild(chip);
	});
}

$("#addPrefix").addEventListener("click", () => {
	const v = $("#prefixInput").value.trim();
	if (v && !state.selectedPrefixes.includes(v)) state.selectedPrefixes.push(v);
	$("#prefixInput").value = "";
	renderPrefixChips();
});
$("#prefixInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("#addPrefix").click(); } });
$("#prefixChips").addEventListener("click", e => {
	if (e.target.classList.contains("x")) {
		state.selectedPrefixes.splice(Number(e.target.dataset.i), 1);
		renderPrefixChips();
	}
});

/* ---------------- 预览 / 提交 ---------------- */

function collectPayload() {
	const clansRaw = $("#charClans").value.trim();
	const extra = clansRaw
		? { clans: clansRaw.split(/[、,，;；]/).map(s => s.trim()).filter(Boolean) }
		: null;
	return {
		ext: state.ext,
		targets: state.locate?.targets,
		force: $("#forceAdd").checked,
		char: {
			id: $("#charId").value.trim(),
			sex: $("#charSex").value.trim() || "male",
			group: $("#charGroup").value.trim(),
			hp: Number($("#charHp").value) || 4,
			maxHp: Number($("#charMaxHp").value) || 4,
			hujia: Number($("#charHujia").value) || 0,
			extra,
			skills: state.selectedSkills.slice(),
		},
		name: $("#charName").value.trim(),
		title: $("#charTitle").value.trim(),
		intro: $("#charIntro").value,
		prefixes: state.selectedPrefixes.slice(),
		packages: [...document.querySelectorAll("#packageList input:checked")].map(i => i.value),
	};
}

/* ---------------- 弹窗提示 / 忙碌状态 ---------------- */

function showToast(msg, ok = true, sticky = false) {
	const box = $("#toastBox");
	const t = document.createElement("div");
	t.className = "toast " + (ok ? "ok" : "err");
	t.textContent = msg;
	box.appendChild(t);
	if (!sticky) setTimeout(() => t.remove(), 5000);
	return t;
}

function setBusy(busy) {
	$("#btnSubmit").disabled = busy;
	$("#btnPreview").disabled = busy;
	$("#btnSubmit").textContent = busy ? "写入中…" : "写入五个文件";
	$("#btnPreview").textContent = busy ? "生成中…" : "生成预览";
}

async function doPost(url) {
	let payload;
	try { payload = collectPayload(); } catch (e) {
		return showToast("收集表单失败：" + e.message, false);
	}
	setBusy(true);
	const toast = showToast(url.includes("preview") ? "正在生成预览…" : `正在把「${payload.char.id}」写入五个文件…`, true, true);
	try {
		const res = await api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
		toast.remove();
		renderResult(res);
		if (res.ok && !res.dryRun) {
			showToast(`✔ 武将「${payload.char.id}」添加成功！重启游戏或重新加载扩展后生效（别忘了立绘 image/character/${payload.char.id}.jpg）`, true);
		} else if (res.ok) {
			showToast("预览已生成，见右侧结果面板", true);
		} else {
			showToast("✗ 失败：" + (res.errors?.[0] || "未知错误") + (res.errors?.length > 1 ? `（共 ${res.errors.length} 条，详见右侧面板）` : ""), false);
		}
	} catch (e) {
		toast.remove();
		showToast("✗ 请求失败：" + String(e.message || e), false);
		renderResult({ ok: false, errors: [String(e.message || e)], warns: [] });
	} finally {
		setBusy(false);
	}
}

$("#btnPreview").addEventListener("click", () => doPost("/api/preview"));
$("#btnSubmit").addEventListener("click", async () => {
	const id = $("#charId").value.trim();
	if (!confirm(`确认把武将「${id}」写入扩展「${state.ext}」的五个文件？\n（写前会自动备份到 tools/角色添加器/backups/）`)) return;
	await doPost("/api/add");
});

function renderResult(res) {
	const box = $("#resultPanel");
	box.innerHTML = "";
	if (res.warns?.length) {
		const w = document.createElement("div");
		w.className = "warn-box";
		w.textContent = "⚠ " + res.warns.join("\n⚠ ");
		box.appendChild(w);
	}
	if (res.errors?.length) {
		const w = document.createElement("div");
		w.className = "warn-box";
		w.style.borderColor = "var(--err)";
		w.style.color = "var(--err)";
		w.textContent = "✗ " + res.errors.join("\n✗ ");
		box.appendChild(w);
	}
	for (const r of res.results || []) {
		const d = document.createElement("div");
		d.className = "file-result";
		let head = r.error
			? `<div class="head bad">✗ [${esc(r.role)}] ${esc(r.rel)} — ${esc(r.error)}</div>`
			: `<div class="head ok">✓ [${esc(r.role)}] ${esc(r.rel)}${r.backup ? ` — 备份: ${esc(r.backup)}` : ""}${r.check ? ` — <span class="bad">语法检查失败: ${esc(r.check)}</span>` : ""}</div>`;
		d.innerHTML = head + (r.snippet ? `<pre>${esc(r.snippet)}</pre>` : "");
		box.appendChild(d);
	}
	if (res.ok && !res.dryRun && res.results?.length) {
		const done = document.createElement("div");
		done.className = "warn-box";
		done.style.borderColor = "var(--ok)";
		done.style.color = "var(--ok)";
		done.textContent = `✔ 武将写入完成。重启游戏或在扩展管理里重新加载「${state.ext}」即可生效。别忘了立绘 image/character/${$("#charId").value.trim()}.jpg`;
		box.prepend(done);
	}
}

/* ---------------- 启动 ---------------- */

(async function init() {
	const boot = await api("/api/bootstrap");
	const sel = $("#extSelect");
	sel.innerHTML = boot.extensions.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join("");
	const preferred = boot.extensions.includes("群友设计") ? "群友设计" : boot.extensions[0];
	sel.value = preferred;
	sel.addEventListener("change", () => loadExt(sel.value));
	await loadExt(preferred);
})();
