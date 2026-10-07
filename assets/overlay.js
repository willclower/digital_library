// overlay.js — renders one screen from a manifest entry.
// Used by both the library interface (thumbnails + preview) and the
// standalone screen pages (screen.html) that get rendered to MP4.
//
// The text-overlay layer is identical whether the background is a still
// image or a looping <video> — swap the background element, keep the scrim,
// headline, subtitle, CTA, and QR untouched.

const GRADIENTS = {
  forest: "linear-gradient(160deg,#2a3d34,#1c2620)",
  water: "linear-gradient(160deg,#0f6e7a,#0a4854)",
  dawn: "linear-gradient(160deg,#d9a878,#4f4033)",
  night: "linear-gradient(160deg,#1a1730,#2f2960)"
};

const SCRIMS = {
  "left-scrim": "linear-gradient(90deg, rgba(8,10,14,0.86) 0%, rgba(8,10,14,0.6) 34%, rgba(8,10,14,0.15) 60%, rgba(8,10,14,0) 78%)",
  "right-scrim": "linear-gradient(270deg, rgba(8,10,14,0.86) 0%, rgba(8,10,14,0.6) 34%, rgba(8,10,14,0.15) 60%, rgba(8,10,14,0) 78%)",
  "bottom-band": "linear-gradient(0deg, rgba(8,10,14,0.9) 0%, rgba(8,10,14,0.55) 22%, rgba(8,10,14,0) 44%)"
};

// Minimal deterministic QR-style pattern for placeholder/preview.
// In production, replace with a real QR generated from screen.qrUrl.
function qrPlaceholder(fg) {
  return `<svg viewBox="0 0 25 25" shape-rendering="crispEdges" width="100%" height="100%" aria-label="Scan for support">
    <rect width="25" height="25" fill="#fff"/>
    <g fill="${fg}">
      <rect x="1" y="1" width="7" height="7"/><rect x="2" y="2" width="5" height="5" fill="#fff"/><rect x="3" y="3" width="3" height="3"/>
      <rect x="17" y="1" width="7" height="7"/><rect x="18" y="2" width="5" height="5" fill="#fff"/><rect x="19" y="3" width="3" height="3"/>
      <rect x="1" y="17" width="7" height="7"/><rect x="2" y="18" width="5" height="5" fill="#fff"/><rect x="3" y="19" width="3" height="3"/>
      <rect x="11" y="1" width="1" height="1"/><rect x="13" y="1" width="2" height="1"/><rect x="1" y="11" width="1" height="2"/><rect x="3" y="10" width="2" height="1"/>
      <rect x="10" y="11" width="2" height="2"/><rect x="14" y="10" width="1" height="1"/><rect x="16" y="11" width="2" height="1"/><rect x="19" y="10" width="1" height="2"/><rect x="22" y="11" width="1" height="2"/>
      <rect x="12" y="14" width="1" height="2"/><rect x="15" y="13" width="2" height="1"/><rect x="18" y="14" width="1" height="2"/><rect x="21" y="13" width="2" height="1"/>
      <rect x="11" y="17" width="1" height="2"/><rect x="14" y="17" width="2" height="1"/><rect x="17" y="18" width="2" height="1"/><rect x="20" y="17" width="1" height="2"/>
      <rect x="11" y="21" width="2" height="1"/><rect x="15" y="20" width="1" height="2"/><rect x="18" y="21" width="2" height="1"/><rect x="21" y="21" width="1" height="1"/>
    </g>
  </svg>`;
}

function bgLayer(screen) {
  const b = screen.background || "";
  if (b.startsWith("gradient:")) {
    const key = b.split(":")[1];
    return `<div class="vwl-bg" style="background:${GRADIENTS[key] || GRADIENTS.night};"></div>`;
  }
  if (b.startsWith("video:") || (screen.format === "video" && screen.videoSrc)) {
    const src = screen.videoSrc || b.replace("video:", "");
    return `<video class="vwl-bg" src="${src}" autoplay muted loop playsinline></video>`;
  }
  // Vertical crop offset (0=top…100=bottom) so a banner-derived screen frames the SAME
  // region its source flyer banner shows. Absent/invalid → 50 (center), the prior default.
  const fy = (screen.focus_y == null || isNaN(+screen.focus_y)) ? 50 : Math.max(0, Math.min(100, +screen.focus_y));
  const fx = scrFocusX(screen);
  return `<div class="vwl-bg vwl-ken" style="background-image:url('${b}');background-position:${fx}% ${fy}%;"></div>`;
}

// ---------------------------------------------------------------------------
// Builder position adjustments (2026-10-07). Stored with the screen in its
// source_manifest: { focus_x, layout:{ <block>: {x, y} } }. x/y are % of the
// screen's width/height (-30..30). The builder passes them directly (screen.layout,
// screen.focus_x); saved screens carry them in source_manifest. Absent = no shift.
// ---------------------------------------------------------------------------
function scrManifest(screen){
  const m = screen.source_manifest;
  if (m && typeof m === "string") { try { return JSON.parse(m); } catch(e) { return {}; } }
  return m || {};
}
function scrFocusX(screen){
  const v = screen.focus_x != null ? screen.focus_x : scrManifest(screen).focus_x;
  return (v == null || isNaN(+v)) ? 50 : Math.max(0, Math.min(100, +v));
}
function scrOff(screen, key){
  const L = screen.layout || scrManifest(screen).layout || {};
  const o = L[key] || {};
  const c = v => (v == null || isNaN(+v)) ? 0 : Math.max(-30, Math.min(30, +v));
  return { x: c(o.x), y: c(o.y) };
}
// Wrap an absolutely-positioned block in a full-screen layer and shift that layer. The
// block keeps its own CSS position (the layer is the same size as the screen), and the
// translate %, being % of the layer, is % of the screen.
function scrShift(screen, key, html, z){
  const o = scrOff(screen, key);
  return `<div class="vwl-off" data-off="${key}" style="position:absolute;inset:0;z-index:${z};pointer-events:none;`
    + `transform:translate(${o.x}%,${o.y}%);">${html}</div>`;
}

// ---------------------------------------------------------------------------
// Screen TEMPLATES (2026-09-30). Selected by `treatment` = tpl-panel | tpl-card |
// tpl-circles; anything else renders the Classic scrim layout below, unchanged.
// Templates size everything off the screen's own width (container units), so the
// same markup is exact at thumbnail, builder-preview, screen.html and 1280x720 PNG.
// Colors are white-label: brand_primary (panel / card / big circle) and
// brand_secondary (bar / rule / small circle), set per client at download.
// Unbranded = the same neutral defaults flyers use.
// ---------------------------------------------------------------------------
const SCREEN_TEMPLATES = ["tpl-panel", "tpl-card", "tpl-circles"];
const TEMPLATE_DEFAULTS = { primary: "#123a52", secondary: "#e08a00" };
function isScreenTemplate(t) { return SCREEN_TEMPLATES.indexOf(t) !== -1; }
function tplHex(v, d) { return (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim())) ? v.trim() : d; }

function renderTemplate(el, screen, ctx) {
  const t = screen.treatment;
  const P = tplHex(screen.brand_primary, TEMPLATE_DEFAULTS.primary);
  const S = tplHex(screen.brand_secondary, TEMPLATE_DEFAULTS.secondary);
  const list = ctx.bullets.length
    ? `<ul class="vwl-t-list">${ctx.bullets.slice(0, 4).map(b => `<li><span class="vwl-t-dot">&bull;</span><span>${b}</span></li>`).join("")}</ul>`
    : (ctx.showChrome && screen.subtitle ? `<div class="vwl-t-sub">${screen.subtitle}</div>` : "");
  const qr = ctx.showQr
    ? `<div class="vwl-t-qr">${ctx.qrImg ? `<img src="${ctx.qrImg}" alt="Scan for support">` : qrPlaceholder("#111")}</div>` : "";
  const code = ctx.showCode ? `<span class="vwl-t-code">${ctx.assetCode}</span>` : "";
  const title = `<div class="vwl-t-title">${screen.title || ""}</div>`;
  let body = "";
  if (t === "tpl-panel") {
    body = `
      <div class="vwl-t-photo">${bgLayer(screen)}</div>
      <div class="vwl-t-panel" style="background:${P};">
        <div style="transform:translate(${scrOff(screen,'panel').x}cqw,${scrOff(screen,'panel').y*0.5625}cqw);">
        ${title}
        <div class="vwl-t-bar" style="background:${S};"></div>
        ${ctx.showChrome ? list : ""}
        </div>
      </div>`;
  } else if (t === "tpl-card") {
    body = `
      ${bgLayer(screen)}
      ${scrShift(screen, 'card', `<div class="vwl-t-card">
        <div class="vwl-t-cardbg" style="background:${P};"></div>
        <div class="vwl-t-rule" style="background:${S};"></div>
        <div class="vwl-t-inner">${title}${ctx.showChrome ? list : ""}</div>
      </div>`, 2)}`;
  } else { // tpl-circles
    const small = screen.cta || screen.subtitle || "";
    body = `
      ${bgLayer(screen)}
      <div class="vwl-t-c1" style="background:${P};"></div>
      <div class="vwl-t-c2" style="background:${S};"></div>
      ${scrShift(screen, 'c1', `<div class="vwl-t-c1txt">${screen.title || ""}</div>`, 3)}
      ${ctx.showChrome && small ? scrShift(screen, 'c2', `<div class="vwl-t-c2txt">${small}</div>`, 3) : ""}`;
  }
  el.classList.remove("vwl-right", "vwl-has-bullets");
  el.classList.add("vwl-tpl");
  el.setAttribute("data-tpl", t);
  el.innerHTML = body + qr + code;
}

// Render a full 16:9 screen into `el`. scale = font multiplier for thumbnails.
function renderScreen(el, screen, opts = {}) {
  const scale = opts.scale || 1;
  const scrim = SCRIMS[screen.treatment] || SCRIMS["left-scrim"];
  const accent = screen.accent || "#d9b98f";
  const showChrome = opts.chrome !== false; // false = thumbnail (headline only)
  const hasQrLink = !!(screen.qrUrl || screen.qr_url);
  const qrImg = screen.qrDataUrl || screen.qr_data_url || null;  // real QR (data-URL) if minted
  const showQr = opts.qr !== false && (hasQrLink || !!qrImg); // link OR a real image = show
  // Optional action bullets (banner-derived screens): short list on the opposite
  // side from the copy. Accept overlay_bullets (DB) or bullets; ignore if empty.
  const bulletsRaw = screen.overlay_bullets || screen.bullets || [];
  const bullets = Array.isArray(bulletsRaw)
    ? bulletsRaw.filter(b => b && String(b).trim())
    : String(bulletsRaw).split("\n").map(s=>s.trim()).filter(Boolean);
  const showBullets = showChrome && bullets.length > 0;
  // Small tracking/reference code in the bottom corner (opposite the QR).
  // Screen-side counterpart to the flyer footer code; suppressed in thumbnails.
  const assetCode = screen.asset_code || screen.assetCode || "";
  const showCode = showChrome && !!assetCode;
  if (isScreenTemplate(screen.treatment)) {
    renderTemplate(el, screen, { bullets, showChrome, showQr, qrImg, showCode, assetCode });
    return;
  }
  el.classList.remove("vwl-tpl"); el.removeAttribute("data-tpl");
  el.classList.toggle("vwl-right", screen.treatment === "right-scrim");
  el.classList.toggle("vwl-has-bullets", showBullets);
  el.innerHTML = `
    ${bgLayer(screen)}
    <div class="vwl-scrim" style="background:${scrim};"></div>
    ${scrShift(screen, 'copy', `<div class="vwl-copy">
      ${showChrome && screen.eyebrow ? `<div class="vwl-eyebrow" style="background:${accent};font-size:${1.0*scale}em;">${screen.eyebrow}</div>` : ""}
      <div class="vwl-head" style="font-size:${2.6*scale}em;">${screen.title || ""}</div>
      ${showChrome && screen.subtitle ? `<div class="vwl-sub" style="font-size:${1.05*scale}em;">${screen.subtitle}</div>` : ""}
      ${showChrome && screen.cta ? `<span class="vwl-cta" style="font-size:${0.95*scale}em;">${screen.cta}</span>` : ""}
    </div>`, 1)}
    ${showBullets ? scrShift(screen, 'bullets', `<div class="vwl-bullets-card"><ul class="vwl-bullets" style="font-size:${1.15*scale}em;">${bullets.map(b=>`<li>${b}</li>`).join("")}</ul></div>`, 2) : ""}
    ${showQr ? `<div class="vwl-qr"><div class="vwl-qrbox">${qrImg ? `<img src="${qrImg}" alt="Scan for support" style="width:100%;height:100%;display:block;">` : qrPlaceholder("#111")}</div><span class="vwl-qrlabel">Scan for support</span></div>` : ""}
    ${showCode ? `<span class="vwl-code" style="font-size:${0.62*scale}em;">${assetCode}</span>` : ""}
  `;
}

if (typeof module !== "undefined") module.exports = { renderScreen, GRADIENTS, SCRIMS, SCREEN_TEMPLATES, TEMPLATE_DEFAULTS };
