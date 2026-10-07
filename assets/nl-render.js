/* ============================================================================
   nl-render.js — SHARED newsletter render engine (single source of truth)
   Loaded by admin.html (authoring preview) and render.html (download render).
   Data-driven: nl_render(el, data) paints the whole document from one object,
   so the same object IS the brand-neutral source_manifest.content.

   Template "magazine2" (2 pages):
     p1  logo · masthead band · title/subhead/hook on brand panel · hero photo
         intro column + small side photo · callout box (icon, title, body)
     p2  section title + intro · 4–6 tips (circle photo, heading, body)
         5 tips → 1 feature photo cell · 4 tips → feature photo spans 2 rows · 6 → none
   Template "editorial" (2 pages, 2026-09-30):
     p1  masthead block · big stacked title · organic-shape hero photo · sidebar
         (subhead lead, hook, bullets) · main column (callout title as H2 + callout body)
     p2  section title + intro · 3 zig-zag rows (photo | heading + body)
   Template "cover" (2 pages, 2026-09-30):
     p1  logo/masthead bar · full-bleed hero · title card (headline + subhead) over it
         hook · "Inside this issue" (callout title, section title, actions) · callout band
     p2  section title + intro · 2 numbered habit cards over photos · 4 "What you can do now" actions
   All three share ONE content object; each shows its own subset (NL_TEMPLATES[t].fields), so
   switching template reflows the same copy. Page-2 center footer / QR is shared by all.
   Requires html2canvas + jspdf (UMD) only for nl_buildPDF.
   ============================================================================ */

const NL_TEMPLATES = {
  magazine2: { name:"Diagonal",  pages:2, tipsMin:4, tipsMax:6,
               fields:["headline","subhead","hook","intro","side","co_icon","co_title","co_body","sec_title","sec_intro","tips","feature","runfoot"] },
  editorial: { name:"Editorial", pages:2, tipsMin:3, tipsMax:3,
               fields:["headline","subhead","hook","bullets","co_title","co_body","sec_title","sec_intro","tips","runfoot"] },
  cover:     { name:"Cover",     pages:2, tipsMin:2, tipsMax:2,
               fields:["headline","subhead","hook","co_icon","co_title","co_body","sec_title","sec_intro","tips","actions","runfoot"] }
};
function nl_tplKey(t){ return NL_TEMPLATES[t] ? t : "magazine2"; }
function nl_lines(v, max){ return (Array.isArray(v)?v:String(v||"").split("\n")).map(x=>String(x).trim()).filter(Boolean).slice(0, max||99); }

const NL_ICONS = {
  shield:'<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M12 8.5v6M9 11.5h6"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
  leaf:  '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19l8-8"/>',
  moon:  '<path d="M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z"/>',
  bolt:  '<path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  pot:   '<path d="M4 10h16v3a6 6 0 01-6 6h-4a6 6 0 01-6-6v-3z"/><path d="M2 10h20M9 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2"/>',
  steps: '<path d="M4 19h4v-4h4v-4h4V7h4"/>'
};
function nl_icon(key){
  const p = NL_ICONS[key] || NL_ICONS.shield;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

/* ---- logo contrast (logo-agnostic) ----
   Measures the logo's own tone (avg luminance of its visible pixels) so ANY logo reads:
     light logo -> footer band switches to the dark brand color, white text
     dark logo on a dark cover panel -> logo sits on a white chip
   Call nl_prepareBrand(brand) once before nl_render (admin + render.html). Never throws. */
function nl_hexLum(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex||"").trim()); if(!m) return 1;
  const n = parseInt(m[1],16), c = [n>>16&255, n>>8&255, n&255].map(v=>{ v/=255; return v<=.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4); });
  return .2126*c[0] + .7152*c[1] + .0722*c[2];
}
function nl_logoTone(src){
  return new Promise(resolve=>{
    if(!src) return resolve(null);
    const im = new Image(); im.crossOrigin = "anonymous";
    im.onload = ()=>{ try{
      const w = 64, h = Math.max(1, Math.round(64*im.naturalHeight/Math.max(1,im.naturalWidth)));
      const cv = document.createElement("canvas"); cv.width=w; cv.height=h;
      const cx = cv.getContext("2d"); cx.drawImage(im,0,0,w,h);
      const px = cx.getImageData(0,0,w,h).data; let sum=0, cnt=0;
      for(let i=0;i<px.length;i+=4){ if(px[i+3] < 128) continue;              // transparent
        const l = (.2126*px[i] + .7152*px[i+1] + .0722*px[i+2]) / 255;
        if(l > .97) continue;                                                // skip white box bg
        sum += l; cnt++; }
      // a logo that is ALL white (e.g. reversed logo) has cnt 0 after the skip -> light
      resolve(cnt === 0 ? "light" : (sum/cnt > .6 ? "light" : "dark"));
    }catch(e){ resolve(null); } };
    im.onerror = ()=>resolve(null);
    im.src = src;
  });
}
async function nl_prepareBrand(brand){
  const b = Object.assign({}, brand || {});
  if(b.logo && !b.logoTone) b.logoTone = await nl_logoTone(b.logo);
  return b;
}

function nl_esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function nl_br(s){ return nl_esc(s).replace(/\n/g,"<br>"); }
function nl_paras(v){ return (Array.isArray(v)?v:String(v||"").split(/\n\s*\n/)).filter(x=>String(x).trim()); }
// Photo crop positions (2026-10-07): d.img_pos = { <zone>: {x, y} } in % (centre 50/50),
// set per render in nl_render. Saved in the manifest, so downloads keep the framing.
let NL_POS = {};
function nl_bg(src, zone){
  if(!src) return "";
  const p = (zone && NL_POS[zone]) || {}, c = v => (v==null || isNaN(+v)) ? 50 : Math.max(0, Math.min(100, +v));
  return ` style="background-image:url('${String(src).replace(/'/g,"%27")}');background-position:${c(p.x)}% ${c(p.y)}%"`;
}

/* Lay out the page-2 grid: returns an array of cells {kind:'tip'|'feature', tip, lastCol, span2} */
function nl_gridCells(tips, hasFeature){
  const n = tips.length;
  if(n>=6 || !hasFeature) return tips.slice(0,6).map((t,i)=>({kind:"tip",tip:t,lastCol:(i%3)===2}));
  if(n===5) return [
    {kind:"tip",tip:tips[0]},{kind:"tip",tip:tips[1]},{kind:"feature"},
    {kind:"tip",tip:tips[2]},{kind:"tip",tip:tips[3]},{kind:"tip",tip:tips[4],lastCol:true}];
  // 4 (or fewer): feature spans both rows in column 3
  return [
    {kind:"tip",tip:tips[0]},{kind:"tip",tip:tips[1]},{kind:"feature",span2:true},
    {kind:"tip",tip:tips[2]},{kind:"tip",tip:tips[3]}].filter(c=>c.kind==="feature"||c.tip);
}

function nl_render(el, d, opts){
  opts = opts || {};
  d = d || {};
  const b = d.brand || {}, m = d.masthead || {}, c = d.cover || {}, co = d.callout || {}, s = d.section || {};
  NL_POS = d.img_pos || {};
  // authoring shows every slot (so an empty tip's circle can still be clicked); print drops empties
  const tips = (d.tips || []).filter(t=>t && (opts.edit || t.h || t.p || t.img));
  const style = [
    b.primary   ? `--brand-primary:${b.primary}`     : "",
    b.secondary ? `--brand-secondary:${b.secondary}` : "",
    b.accent    ? `--brand-accent:${b.accent}`       : ""
  ].filter(Boolean).join(";");
  const z = opts.edit ? " nl-zone" : "";
  // Angled shapes are inline SVG with resolved hex fills (html2canvas does not paint
  // CSS clip-path, and a serialized SVG loses CSS vars) — so the PDF matches the screen.
  const hex = v => /^#[0-9a-f]{6}$/i.test(String(v||"").trim()) ? String(v).trim() : null;
  const P = hex(b.primary) || "#123a52", S = hex(b.secondary) || "#2f6f8f";   // = nl.css defaults
  const svg = (w,h,pts,fill) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="position:absolute;left:0;top:0;display:block"><polygon points="${pts}" fill="${fill}"/></svg>`;
  const pgtab = n => `<div class="nl-pgtab">${svg(34,20,"0,0 34,0 26.5,20 0,20",P)}<span>${n}</span></div>`;
  // logo contrast: cover panel is --brand-primary; footer band is light unless the logo is light
  const darkPanel = nl_hexLum(b.primary || "#123a52") < .35;
  const coverChip = !!b.logo && b.logoTone === "dark" && darkPanel;
  const darkBand  = !!b.logo && b.logoTone === "light";

  const T = nl_tplKey(d.template);
  const foot = nl_footer(d, b, opts, darkBand);
  let p1, p2;
  if(T === "editorial"){
    p1 = nl_p1Editorial(d, b, z, pgtab);
    p2 = nl_p2Editorial(d, tips, z, pgtab, foot);
  } else if(T === "cover"){
    p1 = nl_p1Cover(d, b, z, svg, P);
    p2 = nl_p2Cover(d, tips, z, pgtab, foot);
  } else {
  p1 = `
  <section class="nl-page nl-p1">
    <div class="nl-cover">
      <div class="nl-hero${z}" data-zone="hero"${nl_bg(c.hero,"hero")}></div>
      <div class="nl-panel">${svg(410,490,"0,0 410,0 336,490 0,490",P)}</div>
    </div>
    <div class="nl-logo${coverChip?" nl-chip":""}">${b.logo ? `<img src="${b.logo}" alt="">` : ""}</div>
    <div class="nl-mast">${svg(430,52,"24,0 430,0 430,52 0,52",S)}
      <div class="nl-mast__title">${nl_esc(m.title || "Wellness Newsletter")}</div>
      <div class="nl-mast__vol">${nl_esc(m.volume ? "Volume " + m.volume : "")}</div>
      <div class="nl-mast__date">${nl_esc(m.issue || "")}</div>
    </div>
    <div class="nl-cover__text">
      <h1 class="nl-title">${nl_br(c.headline)}</h1>
      <div class="nl-rule"></div>
      <p class="nl-sub">${nl_esc(c.subhead)}</p>
      <p class="nl-hook">${nl_esc(c.hook)}</p>
    </div>
    <div class="nl-lower">
      <div class="nl-intro">${nl_paras(d.intro).map(p=>`<p>${nl_esc(p)}</p>`).join("")}</div>
      <div class="nl-callout">
        <div class="nl-callout__head"><div class="nl-icon">${nl_icon(co.icon)}</div>
          <h3 class="nl-callout__title">${nl_br(co.title)}</h3></div>
        ${nl_paras(co.body).map(p=>`<p>${nl_esc(p)}</p>`).join("")}
      </div>
    </div>
    <div class="nl-side${z}${d.side?"":" nl-empty"}" data-zone="side"${nl_bg(d.side,"side")}></div>
    ${pgtab(1)}
  </section>`;

  const cells = nl_gridCells(tips, !!d.feature || opts.edit).map((cell,i)=>{
    if(cell.kind==="feature")
      return `<div class="nl-feature${cell.span2?" span2":""}${z}" data-zone="feature"${nl_bg(d.feature,"feature")}></div>`;
    const t = cell.tip, ti = tips.indexOf(t);
    return `<div class="nl-tip${cell.lastCol?" nl-last-col":""}">
      <div class="nl-tip__img${z}" data-zone="tip${ti}"${nl_bg(t.img,"tip"+ti)}></div>
      <h4 class="nl-tip__h">${nl_esc(t.h)}</h4><p class="nl-tip__p">${nl_esc(t.p)}</p></div>`;
  }).join("");

  p2 = `
  <section class="nl-page nl-p2page nl-pg2${foot.cls}">
    <div class="nl-p2">
      <h2 class="nl-sec__title">${nl_esc(s.title)}</h2>
      <p class="nl-sec__intro">${nl_esc(s.intro)}</p>
      <div class="nl-grid">${cells}</div>
    </div>
    ${pgtab(2)}
    <div class="nl-runfoot">${nl_esc(d.runfoot || "")}</div>
    ${foot.html}
  </section>`;
  }

  el.innerHTML = `<div class="nl-doc nl-t-${T}${opts.edit?" nl-edit":""}${opts.print?" nl-print":""}" style="${style}">${p1}${p2}</div>`;
}


// ============================ Template: EDITORIAL ============================
function nl_p1Editorial(d, b, z, pgtab){
  const m = d.masthead || {}, c = d.cover || {}, co = d.callout || {};
  const lightLogo = !!b.logo && b.logoTone === "light";     // white page: a light logo needs a dark chip
  const bullets = nl_lines(d.bullets, 5);
  return `
  <section class="nl-page nl-p1 nl-e1">
    <div class="nl-e-mast">
      <div class="nl-e-mast__title">${nl_esc(m.title || "Wellness Newsletter")}</div>
      <div class="nl-e-mast__sub">${nl_esc([m.volume ? "Volume " + m.volume : "", m.issue || ""].filter(Boolean).join("  |  "))}</div>
    </div>
    <h1 class="nl-e-title">${nl_br(c.headline)}</h1>
    <div class="nl-e-hero${z}" data-zone="hero"${nl_bg(c.hero,"hero")}></div>
    <div class="nl-e-side">
      ${c.subhead ? `<p class="nl-e-lead">${nl_esc(c.subhead)}</p>` : ""}
      ${c.hook ? `<p class="nl-e-body">${nl_esc(c.hook)}</p>` : ""}
      ${bullets.length ? `<ul class="nl-e-list">${bullets.map(x=>`<li>${nl_esc(x)}</li>`).join("")}</ul>` : ""}
    </div>
    <div class="nl-e-main">
      <h2 class="nl-e-h2">${nl_br(co.title)}</h2>
      ${nl_paras(co.body).map(p=>`<p class="nl-e-body">${nl_esc(p)}</p>`).join("")}
    </div>
    <div class="nl-e-logo${lightLogo?" nl-e-logo--dark":""}">${b.logo ? `<img src="${b.logo}" alt="">` : ""}</div>
    ${pgtab(1)}
  </section>`;
}
function nl_p2Editorial(d, tips, z, pgtab, foot){
  const s = d.section || {};
  const rows = tips.slice(0,3).map((t,i)=>{
    const img = `<div class="nl-e-img${z}" data-zone="tip${i}"${nl_bg(t.img,"tip"+i)}></div>`;
    const txt = `<div class="nl-e-rowtxt${i%2===0?" r":""}"><h3 class="nl-e-h3">${nl_esc(t.h)}</h3><p class="nl-e-body">${nl_esc(t.p)}</p></div>`;
    return `<div class="nl-e-row">${i%2===0 ? txt+img : img+txt}</div>`;
  }).join("");
  return `
  <section class="nl-page nl-p2page nl-pg2 nl-e2${foot.cls}">
    <div class="nl-e-p2">
      <h2 class="nl-e-sec">${nl_esc(s.title)}</h2>
      <p class="nl-e-body nl-e-secintro">${nl_esc(s.intro)}</p>
      <div class="nl-e-rows">${rows}</div>
    </div>
    ${pgtab(2)}
    <div class="nl-runfoot">${nl_esc(d.runfoot || "")}</div>
    ${foot.html}
  </section>`;
}

// ============================== Template: COVER ==============================
function nl_p1Cover(d, b, z, svg, P){
  const m = d.masthead || {}, c = d.cover || {}, co = d.callout || {}, s = d.section || {};
  const lightLogo = !!b.logo && b.logoTone === "light";
  const items = [co.title, s.title, nl_lines(d.actions,4).length ? "What you can do now" : ""]
    .map(x=>String(x||"").replace(/\s*\n\s*/g," ").trim()).filter(Boolean);
  const bandText = nl_paras(co.body)[0] || "";
  return `
  <section class="nl-page nl-p1 nl-c1">
    <div class="nl-c-bar">
      <div class="nl-c-logo${lightLogo?" nl-c-logo--dark":""}">${b.logo ? `<img src="${b.logo}" alt="">` : ""}</div>
      <div class="nl-c-mast">
        <div class="nl-c-mast__title">${nl_esc(m.title || "Wellness Newsletter")}</div>
        <div class="nl-c-mast__sub">${nl_esc([m.issue || "", m.volume ? "Vol " + m.volume : ""].filter(Boolean).join("  ·  "))}</div>
      </div>
    </div>
    <div class="nl-c-hero${z}" data-zone="hero"${nl_bg(c.hero,"hero")}></div>
    <div class="nl-c-card">
      <div class="nl-c-card__bar"></div>
      <h1 class="nl-c-title">${nl_br(c.headline)}</h1>
      ${c.subhead ? `<p class="nl-c-sub">${nl_esc(c.subhead)}</p>` : ""}
    </div>
    <p class="nl-c-hook">${nl_esc(c.hook)}</p>
    <div class="nl-c-inside">
      <div class="nl-c-label">Inside this issue</div>
      ${items.map((x,i)=>`<div class="nl-c-item"><span class="n">0${i+1}</span><span>${nl_esc(x)}</span></div>`).join("")}
    </div>
    <div class="nl-c-band">
      <div class="nl-c-band__icon">${nl_icon(co.icon)}</div>
      <p class="nl-c-band__text">${nl_esc(bandText)}</p>
    </div>
  </section>`;
}
function nl_p2Cover(d, tips, z, pgtab, foot){
  const s = d.section || {};
  const acts = nl_lines(d.actions, 4);
  const cards = tips.slice(0,2).map((t,i)=>`
    <div class="nl-c-row${i%2 ? " flip" : ""}">
      <div class="nl-c-img${z}" data-zone="tip${i}"${nl_bg(t.img,"tip"+i)}></div>
      <div class="nl-c-cardtip"><div class="nl-c-num">${i+1}</div>
        <h3 class="nl-c-h3">${nl_esc(t.h)}</h3><p class="nl-c-p">${nl_esc(t.p)}</p></div>
    </div>`).join("");
  return `
  <section class="nl-page nl-p2page nl-pg2 nl-c2${foot.cls}">
    <div class="nl-c-p2">
      <h2 class="nl-c-sec">${nl_esc(s.title)}</h2>
      ${s.intro ? `<p class="nl-c-secintro">${nl_esc(s.intro)}</p>` : ""}
      <div class="nl-c-rows">${cards}</div>
      ${acts.length ? `<div class="nl-c-label">What you can do now</div>
      <div class="nl-c-acts">${acts.map(a=>`<div class="nl-c-act">${nl_esc(a)}</div>`).join("")}</div>` : ""}
    </div>
    ${pgtab(2)}
    <div class="nl-runfoot">${nl_esc(d.runfoot || "")}</div>
    ${foot.html}
  </section>`;
}

// ---- center footer (page 2, every template). Mirrors render.html flyer rules:
//   branded   -> address band (name/addr/phone | hours | logo | QR cell)
function nl_footer(d, b, opts, darkBand){
  //   unbranded -> no band, no logo; QR floats bottom-right
  //   brand.footer overrides the manifest footer field-by-field
  const unbranded = (b.mode === "none");
  const mf = d.footer || {}, bf = b.footer || {};
  const fv = k => (bf[k] != null ? bf[k] : mf[k]) || "";
  const qrData = b.qrData || null;
  const qrBox = qrData ? `<div class="nl-qrbox"><img src="${qrData}" alt=""></div>`
              : (opts.edit ? `<div class="nl-qrbox ph">QR</div>` : "");
  const qrHTML = qrBox ? `<div class="nl-qr">${qrBox}<span class="nl-qrlabel">Scan for support</span></div>` : "";
  const addrHTML = unbranded ? "" : `
    <div class="nl-addr${qrHTML?" has-qr":""}${darkBand?" nl-addr--dark":""}">
      <div><div class="nl-addr__name">${nl_esc(fv("name"))}</div>
        <div class="nl-addr__line">${nl_esc(fv("addr1"))}</div>
        <div class="nl-addr__line">${nl_esc(fv("addr2"))}</div>
        <div class="nl-addr__line">${nl_esc(fv("phone"))}</div></div>
      <div><div class="nl-addr__name">${nl_esc(fv("hours_label"))}</div>
        <div class="nl-addr__line">${nl_esc(fv("hours1"))}</div>
        <div class="nl-addr__line">${nl_esc(fv("hours2"))}</div></div>
      <div class="nl-addr__logo">${b.logo ? `<img src="${b.logo}" alt="">` : ""}</div>
      ${qrHTML ? `<div class="nl-addr__qr">${qrHTML}</div>` : ""}
    </div>
    <div class="nl-foot"><span class="powered">${nl_esc(d.powered || "")}</span><span class="code">${nl_esc(b.footCode || "")}</span></div>`;
  const floatQR = (unbranded && qrHTML) ? `<div class="nl-qr-float">${qrHTML}</div>` : "";
  const p2cls = (unbranded ? "" : " has-addr") + (floatQR ? " qr-float" : "");

  return { html: addrHTML + floatQR, cls: p2cls };
}

/* ---- PDF: one letter page per .nl-page; returns { pdfB64, thumbB64 } without downloading ---- */
async function nl_buildPDF(el){
  if(typeof html2canvas==="undefined" || !window.jspdf) throw new Error("PDF libraries didn't load");
  const doc = el.querySelector(".nl-doc");
  const hadPrint = doc.classList.contains("nl-print");
  doc.classList.add("nl-print");
  try{
    for(const im of doc.querySelectorAll("img")){ try{ if(im.decode) await im.decode(); }catch(e){} }
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit:"pt", format:"letter" });
    const pages = [...doc.querySelectorAll(".nl-page")];
    let thumbB64 = null;
    for(let i=0;i<pages.length;i++){
      const canvas = await html2canvas(pages[i], { scale:300/72, backgroundColor:"#ffffff",
        useCORS:true, logging:false, width:612, height:792, windowWidth:612 });
      if(i>0) pdf.addPage("letter");
      pdf.addImage(canvas.toDataURL("image/jpeg",0.92), "JPEG", 0, 0, 612, 792);
      if(i===0){
        const t = Math.min(1, 640/canvas.width), tc = document.createElement("canvas");
        tc.width = Math.round(canvas.width*t); tc.height = Math.round(canvas.height*t);
        tc.getContext("2d").drawImage(canvas,0,0,tc.width,tc.height);
        thumbB64 = tc.toDataURL("image/jpeg",0.8).split(",")[1];
      }
    }
    const uri = pdf.output("datauristring");
    return { pdfB64: uri.slice(uri.indexOf(",")+1), thumbB64 };
  } finally {
    if(!hadPrint) doc.classList.remove("nl-print");
  }
}
