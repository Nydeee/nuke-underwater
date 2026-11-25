// Small interface helpers: toast messages, drop-down menus, dialogs, the guided tour and
// browser storage. Nothing here knows about the physics.

const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------------------------------------------------------------- storage (may be unavailable, e.g. private windows)
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`nukesim.${key}`); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(`nukesim.${key}`, JSON.stringify(value)); return true; } catch (_) { return false; } },
  del(key) { try { localStorage.removeItem(`nukesim.${key}`); } catch (_) { /* ignore */ } },
  clearAll() {
    try { Object.keys(localStorage).filter((k) => k.startsWith("nukesim.")).forEach((k) => localStorage.removeItem(k)); } catch (_) { /* ignore */ }
  },
};

// ---------------------------------------------------------------- toasts
let toastBox = null;
export function toast(msg, { kind = "info", action = null, ms = 3500 } = {}) {
  if (!toastBox) { toastBox = document.createElement("div"); toastBox.id = "toasts"; document.body.appendChild(toastBox); }
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement("button");
    b.textContent = action.label;
    b.addEventListener("click", () => { action.fn(); close(); });
    t.appendChild(b);
  }
  toastBox.appendChild(t);
  requestAnimationFrame(() => t.classList.add("in"));
  const timer = setTimeout(close, action ? Math.max(ms, 6000) : ms);
  function close() { clearTimeout(timer); t.classList.remove("in"); setTimeout(() => t.remove(), 250); }
  return close;
}

// ---------------------------------------------------------------- drop-down menus
let openMenu = null;
export function closeMenus() { openMenu?.remove(); openMenu = null; document.querySelectorAll(".menuBtn.open").forEach((b) => b.classList.remove("open")); }
/** items: () => [{label, kbd, icon, action, disabled} | "-" | {html, onMount}] */
export function attachMenu(btn, items) {
  btn.classList.add("menuBtn");
  btn.setAttribute("aria-haspopup", "menu");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = btn.classList.contains("open");
    closeMenus();
    if (wasOpen) return;
    const m = document.createElement("div");
    m.className = "menu"; m.setAttribute("role", "menu");
    for (const it of items()) {
      if (it === "-") { m.appendChild(Object.assign(document.createElement("div"), { className: "sep" })); continue; }
      if (it.html != null) { const d = document.createElement("div"); d.className = "menuHtml"; d.innerHTML = it.html; m.appendChild(d); it.onMount?.(d); continue; }
      const b = document.createElement("button");
      b.setAttribute("role", "menuitem");
      b.disabled = !!it.disabled;
      b.innerHTML = `<span class="mi">${it.icon || ""}</span><span class="ml">${esc(it.label)}</span>${it.kbd ? `<kbd>${esc(it.kbd)}</kbd>` : ""}`;
      b.addEventListener("click", () => { closeMenus(); it.action(); });
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.top = `${r.bottom + 6}px`;
    m.style.left = `${Math.min(r.left, window.innerWidth - m.offsetWidth - 8)}px`;
    btn.classList.add("open");
    openMenu = m;
  });
}
document.addEventListener("click", (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenus(); });

// ---------------------------------------------------------------- dialogs
export function openModal(id) { $(id).hidden = false; $(id).querySelector("input, button.primary, button")?.focus(); }
export function closeModal(id) { $(id).hidden = true; }
export function anyModalOpen() { return [...document.querySelectorAll(".modal")].some((m) => !m.hidden); }

/** Ask for a line of text in a small dialog. Resolves to the text, or null if cancelled. */
export function askText(title, value = "", okLabel = "Save") {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.innerHTML = `<div class="card small"><h2>${esc(title)}</h2>
      <input type="text" value="${esc(value)}" maxlength="80">
      <div class="cardButtons"><button class="ghost" data-x="cancel">Cancel</button><button class="primary" data-x="ok">${esc(okLabel)}</button></div></div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector("input");
    input.focus(); input.select();
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.querySelector("[data-x=ok]").addEventListener("click", () => done(input.value.trim() || null));
    wrap.querySelector("[data-x=cancel]").addEventListener("click", () => done(null));
    wrap.addEventListener("click", (e) => { if (e.target === wrap) done(null); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(input.value.trim() || null); if (e.key === "Escape") done(null); });
  });
}

/** Save text or a data URL as a file in the user's downloads. */
export function download(name, content, type = "application/json") {
  const url = content instanceof Blob ? URL.createObjectURL(content)
    : content.startsWith?.("data:") ? content : URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  if (!url.startsWith("data:")) setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------- guided tour
export function runTour(steps, { onEnd } = {}) {
  let i = 0;
  const shade = document.createElement("div"); shade.className = "tourSpot";
  const card = document.createElement("div"); card.className = "tourCard";
  const block = document.createElement("div"); block.className = "tourBlock";   // stops clicks on the page during the tour
  document.body.append(block, shade, card);

  function show() {
    const s = steps[i];
    s.before?.();
    const el = typeof s.el === "string" ? document.querySelector(s.el) : s.el;
    const r = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
    const pad = 6;
    if (r) Object.assign(shade.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px`, opacity: 1 });
    else Object.assign(shade.style, { left: "50%", top: "50%", width: "0px", height: "0px" });
    card.innerHTML = `<div class="tourStep">${i + 1} / ${steps.length}</div><h3>${esc(s.title)}</h3><p>${s.text}</p>
      <div class="cardButtons"><button class="ghost" data-t="skip">${i === steps.length - 1 ? "Close" : "Skip tour"}</button>
      <span style="flex:1"></span>${i ? `<button data-t="back">Back</button>` : ""}
      <button class="primary" data-t="next">${i === steps.length - 1 ? "Finish" : "Next"}</button></div>`;
    // place the card beside the highlighted area, inside the window
    const W = window.innerWidth, H = window.innerHeight, cw = 320, ch = card.offsetHeight || 180;
    let x = W / 2 - cw / 2, y = H / 2 - ch / 2;
    if (r) {
      if (r.right + cw + 24 < W) { x = r.right + 16; y = r.top; }
      else if (r.left - cw - 24 > 0) { x = r.left - cw - 16; y = r.top; }
      else if (r.bottom + ch + 24 < H) { x = r.left + r.width / 2 - cw / 2; y = r.bottom + 16; }
      else { x = r.left + r.width / 2 - cw / 2; y = r.top - ch - 16; }
    }
    card.style.left = `${Math.min(Math.max(x, 12), W - cw - 12)}px`;
    card.style.top = `${Math.min(Math.max(y, 12), H - ch - 12)}px`;
    card.querySelector("[data-t=next]").addEventListener("click", () => { if (++i >= steps.length) end(); else show(); });
    card.querySelector("[data-t=back]")?.addEventListener("click", () => { i--; show(); });
    card.querySelector("[data-t=skip]").addEventListener("click", end);
    card.querySelector("[data-t=next]").focus();
  }
  function key(e) {
    if (e.key === "Escape") end();
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (++i >= steps.length) end(); else show(); }
    else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); e.stopPropagation(); i--; show(); }
  }
  function end() {
    window.removeEventListener("keydown", key, true); window.removeEventListener("resize", show);
    shade.remove(); card.remove(); block.remove(); onEnd?.();
  }
  window.addEventListener("keydown", key, true);
  window.addEventListener("resize", show);
  show();
}
