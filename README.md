# Visual Wellness Library

Digital workplace-health content for TV screens. Brand-neutral, white-label ready.
Employers browse a library, filter by topic, preview, and download screens for their
floor displays. Each screen carries a QR code and every download is tracked, so we
see what's used and what's scanned.

## What's here

```
library.json      → the single source of truth. Every screen + its tags live here.
index.html        → the library interface (search, filter, preview, download).
screen.html       → full-screen render of one screen (?id=…). This is what we render to MP4.
assets/
  overlay.js      → the text-over-image renderer (scrim + headline + subtitle + CTA + QR).
  styles.css      → shared styles for screens and the interface.
images/           → background stills (and later, video loops).
screens/          → (optional) any per-screen exported assets.
```

## Run it locally

The interface fetches `library.json`, so it must be served over HTTP (not opened as a file):

```
cd vwl
python3 -m http.server 8000
# open http://localhost:8000
```

On GitHub Pages it just works — same as the flipbook repo.

---

## How to add a new screen  ← the important part

You do **not** touch any code. Two steps:

1. Drop the background image into `images/` (e.g. `images/warehouse_night_01.png`).
   - Best composition: **subject on one side, empty space on the other.** The empty
     side is where the text goes. A worker sitting on the right → text on the left.
   - Landscape 16:9, ideally ≥1920×1080.

2. Add one entry to the `"screens"` array in `library.json`:

```json
{
  "id": "burnout-warehouse-01",
  "title": "Rest is productive.",
  "subtitle": "You can't pour from an empty cup. Take the break you're owed.",
  "eyebrow": "Before the next shift",
  "cta": "Feeling burned out? Talk to your clinic",
  "background": "images/warehouse_night_01.png",
  "format": "still",
  "treatment": "left-scrim",
  "accent": "#d9b98f",
  "qrUrl": "https://go.mymedwellness.com/s/burnout-warehouse-01",
  "tags": {
    "subject": "burnout",
    "month": "Nov",
    "setting": "breakroom",
    "aspect": "16:9",
    "tone": "calm",
    "format": "still"
  }
}
```

Commit. The interface picks it up automatically — new thumbnail, searchable by every tag.

### Field notes
- `treatment`: `left-scrim` (subject on right), `right-scrim` (subject on left), or
  `bottom-band` (keeps the whole figure clear, text along the bottom).
- `accent`: the eyebrow colour. Pull a warm tone from the image so it feels part of the photo.
- `background`: an image path, OR `gradient:forest|water|dawn|night` for a no-photo screen,
  OR `video:images/clip.mp4` for a moving background.
- `tags`: only use values from `library.tagVocabulary` so search filters stay clean.

---

## Video backgrounds

A 5-second MidJourney (or stock) loop works exactly like a still. Set:

```json
"background": "video:images/worker_factory_01.mp4",
"format": "video",
"tags": { …, "format": "video" }
```

The text overlay (scrim, headline, CTA, QR) sits **on top** of the playing video —
identical code, the words don't move while the footage loops underneath.

---

## Rendering a screen to MP4 (for signage players)

TVs and signage players want a video file, not a web page. `screen.html?id=…` is a
clean full-bleed 16:9 render built exactly for this. Capture it to a looping MP4:

```bash
# one-time
npm i -g @puppeteer/browsers
pip install --break-system-packages playwright && playwright install chromium

# record a 30s loop of a screen (script: render.js — see below)
node render.js burnout-warehouse-01 30 > screens/burnout-warehouse-01.mp4
```

The render step is scriptable in n8n the same way the translation workflow is: a
headless browser opens `screen.html?id=X`, records N seconds, outputs an MP4. Stills
get a static loop; video backgrounds get captured as-is.

---

## Analytics (two-sided)

- **Downloads** — `index.html` beacons every download to the n8n webhook (`BEACON` in
  index.html). Tells us which screens each client pulls.
- **Scans** — each screen's QR points at a tracked short URL (`qrUrl`). Tells us what
  employees actually engage with on the floor.

Together: what clients choose vs. what workers respond to, by topic, setting, and month.

---

## White-labelling

`library.name` and the header subtitle drive the interface branding. Swap them per
client (or per deployment) — the same repo serves Concentra, One-to-One Health, HCS,
etc., exactly like the brand-neutral catalog system.
