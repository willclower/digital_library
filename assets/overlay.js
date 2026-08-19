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
  return `<div class="vwl-bg vwl-ken" style="background-image:url('${b}');"></div>`;
}

// Render a full 16:9 screen into `el`. scale = font multiplier for thumbnails.
function renderScreen(el, screen, opts = {}) {
  const scale = opts.scale || 1;
  const scrim = SCRIMS[screen.treatment] || SCRIMS["left-scrim"];
  const accent = screen.accent || "#d9b98f";
  const showChrome = opts.chrome !== false; // false = thumbnail (headline only)
  const showQr = opts.qr !== false;         // false = hide QR (used on library thumbnails)
  el.innerHTML = `
    ${bgLayer(screen)}
    <div class="vwl-scrim" style="background:${scrim};"></div>
    <div class="vwl-copy">
      ${showChrome ? `<div class="vwl-eyebrow" style="color:${accent};font-size:${1.1*scale}em;">${screen.eyebrow || ""}</div>` : ""}
      <div class="vwl-head" style="font-size:${2.6*scale}em;">${screen.title || ""}</div>
      ${showChrome ? `<div class="vwl-sub" style="font-size:${1.05*scale}em;">${screen.subtitle || ""}</div>` : ""}
      ${showChrome ? `<span class="vwl-cta" style="font-size:${0.95*scale}em;">${screen.cta || ""}</span>` : ""}
    </div>
    ${showQr ? `<div class="vwl-qr"><div class="vwl-qrbox">${qrPlaceholder("#111")}</div><span class="vwl-qrlabel">Scan for support</span></div>` : ""}
  `;
}

if (typeof module !== "undefined") module.exports = { renderScreen, GRADIENTS, SCRIMS };
