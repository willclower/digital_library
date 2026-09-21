/* ============================================================================
   flyer-render.js — SHARED flyer render engine (single source of truth)
   Loaded by BOTH admin.html (authoring preview) and render.html (download render).
   Owns the flyer render functions AND the render-time globals below, so there is
   ONE copy of the template logic. Fix a template (e.g. the 2 Steps layout) HERE
   and both authoring and download pick it up. Must load BEFORE any page script
   that reads/writes these globals or calls these functions.

   Requires on the page: html2canvas + jspdf (UMD) for fl_buildFlyerPDF; a .flyer
   DOM with the fl_* ids; and the copy inputs (fl_in_*) the render reads from.
   ============================================================================ */

// ---- render-time globals (shared; pages read/write these) ----
var fl_template   = "checklist";              // reassigned by admin's template switcher
var fl_bannerData = null, fl_logoData = null, fl_subjectData = null;
var fl_bannerRef  = null, fl_subjectRef = null;   // image-library ids when picked from library
var fl_bannerY    = 50;                        // banner vertical crop (background-position Y%)
const fl_TILES    = [0,1,2,3,4,5];             // render funcs iterate this to read fl_in_t{i}_h/_p

// ---- helpers ----
const fl_$   = id => document.getElementById(id);
const fl_set = (id,v) => { const el=fl_$(id); if(el) el.textContent=v; };
function fl_esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

const FL_ITEMS_TPL = { checklist:4, explainer:4, segments:4, twostep:3 };
function fl_itemCount(){ return FL_ITEMS_TPL[fl_template] ?? 4; }

// ---- body/render ----
function fl_bodyData(){
  const lead = fl_$("fl_in_lead") ? fl_$("fl_in_lead").value : "";
  const items = fl_TILES.map((_,i)=>({
    h: fl_$(`fl_in_t${i}_h`) ? fl_$(`fl_in_t${i}_h`).value : "",
    p: fl_$(`fl_in_t${i}_p`) ? fl_$(`fl_in_t${i}_p`).value : ""
  }));
  return { lead, items };
}

function fl_renderBody(){
  const zone = fl_$("fl_bodyZone"); if(!zone) return;
  const { lead, items } = fl_bodyData();
  const shown = items.filter(t=>t.h||t.p);
  const leadHTML = `<p class="fl-lead" id="fl_lead">${fl_esc(lead)}</p>`;
  let bodyHTML = "";
  if(fl_template==="explainer"){
    const li = shown.map((t,i)=>
      `<li class="fl-flow__item"><div class="fl-flow__num">${i+1}</div>`+
      `<div><h4 class="fl-flow__head">${fl_esc(t.h)}</h4>`+
      `<p class="fl-flow__body">${fl_esc(t.p)}</p></div></li>`).join("");
    bodyHTML = `<ol class="fl-flow">${li}</ol>`;
  } else if(fl_template==="segments"){
    const hero = shown[0]
      ? `<div class="fl-hero"><h4 class="fl-hero__label">${fl_esc(shown[0].h)}</h4>`+
        `<p class="fl-hero__body">${fl_esc(shown[0].p)}</p></div>` : "";
    const cols = shown.slice(1).map(t=>
      `<div class="fl-col"><h4 class="fl-col__label">${fl_esc(t.h)}</h4>`+
      `<p class="fl-col__body">${fl_esc(t.p)}</p></div>`).join("");
    bodyHTML = hero + (cols ? `<div class="fl-cols">${cols}</div>` : "");
  } else if(fl_template==="twostep"){
    // Title in the body (navy serif, centered) — the banner carries no scrim text here.
    // Intro area (beside the circle): lead paragraph (non-bold) under the title, then
    // Tile 1 as heading (bold) + body. Items 1-2 are the two badge cards.
    const title = fl_$("fl_in_headline") ? fl_$("fl_in_headline").value : "";
    const introHead = items[0] ? items[0].h : "";
    const introBody = items[0] ? items[0].p : "";
    const circleStyle = fl_subjectData ? ` style="background-image:url('${fl_subjectData}')"` : "";
    const cards = [items[1], items[2]].filter(t=>t && (t.h||t.p)).map((t,i)=>
      `<div class="ts-card"><div class="ts-badge">${i+1}</div>`+
      `<h4 class="ts-card__head">${fl_esc(t.h)}</h4>`+
      `<p class="ts-card__body">${fl_esc(t.p)}</p></div>`).join("");
    const sweep = `<div class="ts-sweep"><svg viewBox="0 0 612 46" preserveAspectRatio="none">`+
      `<path d="M0,46 L0,4 Q306,52 612,4 L612,46 Z" fill="var(--page)"></path></svg></div>`;
    bodyHTML = sweep +
      `<h1 class="ts-title">${fl_esc(title)}</h1>`+
      `<div class="ts-intro"><div class="ts-circle fl-zone"${circleStyle}></div>`+
      `<div>`+
      (introHead ? `<h4 class="ts-intro__head">${fl_esc(introHead)}</h4>` : "")+
      `<p class="ts-intro__body">${fl_esc(introBody)}</p></div></div>`+
      (cards ? `<div class="ts-cards">${cards}</div>` : "");
    // keep a zero-height .fl-lead so the flex spacing contract (#fl_bodyZone > :not(.fl-lead)) holds
    zone.innerHTML = `<p class="fl-lead" id="fl_lead" style="display:none"></p>` + bodyHTML;
    return;
  } else { // checklist (default)
    const tiles = shown.map(t=>
      `<div class="tile"><div class="box"></div>`+
      `<div class="tbody"><h4>${fl_esc(t.h)}</h4><p>${fl_esc(t.p)}</p></div></div>`).join("");
    bodyHTML = `<div class="tile-grid" id="fl_tiles">${tiles}</div>`;
  }
  zone.innerHTML = leadHTML + bodyHTML;
}

function fl_draw(){
  // twostep puts the title/eyebrow in the body, so its banner carries no scrim text.
  const isTs = (fl_template==="twostep");
  const flyerEl = fl_$("fl_in_flyer"); if(flyerEl) flyerEl.classList.toggle("ts-mode", isTs);
  // logo now lives in the address footer (bottom-right), not the banner
  const lg=fl_$("fl_ftLogo");
  if(lg) lg.innerHTML = fl_logoData ? `<img src="${fl_logoData}">` : "";
  fl_set("fl_eyebrow", isTs ? "" : fl_$("fl_in_eyebrow").value);
  fl_set("fl_head",    isTs ? "" : fl_$("fl_in_headline").value);
  fl_renderBody();
  // shared address footer
  fl_set("fl_ftName",       fl_$("fl_in_ftName").value);
  fl_set("fl_ftAddr1",      fl_$("fl_in_ftAddr1").value);
  fl_set("fl_ftAddr2",      fl_$("fl_in_ftAddr2").value);
  fl_set("fl_ftPhone",      fl_$("fl_in_ftPhone").value);
  fl_set("fl_ftHoursLabel", fl_$("fl_in_ftHoursLabel").value);
  fl_set("fl_ftHours1",     fl_$("fl_in_ftHours1").value);
  fl_set("fl_ftHours2",     fl_$("fl_in_ftHours2").value);
  fl_set("fl_footPowered",fl_$("fl_in_footPowered").value);
  fl_set("fl_footCode",fl_$("fl_in_footCode").value);
}

// ---- PDF ----
const fl_PDF_SCALE = 300/72;

// Render the flyer once; return { pdfB64, thumbB64, imgH } WITHOUT downloading.
// Used by both the Export button (download) and admin save() (publish).
async function fl_buildFlyerPDF(){
  if(typeof html2canvas==="undefined" || !window.jspdf) throw new Error("PDF libraries didn't load");
  const flyer = fl_$("fl_in_flyer");
  const prevShadow = flyer.style.boxShadow;
  flyer.style.boxShadow = "none";
  try{
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await html2canvas(flyer, {
      scale: fl_PDF_SCALE, backgroundColor:"#ffffff", useCORS:true, logging:false,
      width:612, height:flyer.offsetHeight, windowWidth:612
    });
    const img = canvas.toDataURL("image/jpeg", 0.92);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit:"pt", format:"letter" });
    const pageW=612, pageH=792;
    const imgH = canvas.height * (pageW / canvas.width);
    if(imgH <= pageH){ pdf.addImage(img,"JPEG",0,0,pageW,imgH); }
    else { const h=pageH, w=canvas.width*(pageH/canvas.height); pdf.addImage(img,"JPEG",(pageW-w)/2,0,w,h); }
    // PDF bytes as bare base64 (strip data: prefix)
    const pdfDataUri = pdf.output("datauristring");
    const pdfB64 = pdfDataUri.slice(pdfDataUri.indexOf(",")+1);
    // Thumbnail: reuse the same canvas, downscale to <=640px wide JPEG (matches makeDocThumb)
    const tScale = Math.min(1, 640 / canvas.width);
    const tc = document.createElement("canvas");
    tc.width = Math.round(canvas.width*tScale); tc.height = Math.round(canvas.height*tScale);
    tc.getContext("2d").drawImage(canvas,0,0,tc.width,tc.height);
    const thumbB64 = tc.toDataURL("image/jpeg",0.8).split(",")[1];
    return { pdfB64, thumbB64, imgH, pageH };
  } finally {
    flyer.style.boxShadow = prevShadow;
  }
}
