// Draws a review onto the CV itself: the attached photo or PDF pages, with the reviewer's pen on top.
// PDF pages come with the position of every word (pdf.js); photos are read for word positions by
// Tesseract, in this tab. Both are served by our own site, and nothing here leaves the browser.
// Copied from cvviews-ofcsite/public/markup.js; only the two imports below changed for this app.

const RED = "#d23b2c";
const GREEN = "#1d7a4c";
const PAPER = "rgba(255, 252, 244, 0.96)";
const MAX_PAGES = 3;
const WIDTH = 1600; // pages are drawn this wide, whatever their size

/* ---------------- Pages and the words on them ---------------- */
// The PDF's typeface, by name: pdf.js knows each font's PostScript name ("ABCDEF+Calibri-Bold"), and when that
// family is installed here (Calibri, Arial, Georgia, Roboto…) the corrected lines are written in it, at its weight.
// Returns { css, weight }: a font stack to put before the fallback, or null.
const pdfFonts = new Map();
async function pdfFont(page, name) {
  if (pdfFonts.has(name)) return pdfFonts.get(name);
  let font = null;
  try {
    const f = page.commonObjs.get(name);
    const raw = String(f?.name || "").replace(/^[A-Z]{6}\+/, "");
    const [base, style = ""] = raw.split(/[-,]/);
    if (base) {
      const spaced = base.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/(MT|PS|Std|Pro)$/, "").trim();
      const all = `${raw} ${style}`;
      const weight = /black|heavy/i.test(all) || f.black ? 900 : /extrabold|ultrabold/i.test(all) ? 800 : /bold/i.test(all) || f.bold ? (/semi|demi/i.test(all) ? 600 : 700) : /medium/i.test(all) ? 500 : /light/i.test(all) ? 300 : 400;
      font = { css: [...new Set([spaced, base])].map((n) => `"${n}"`).join(", "), weight, italic: /italic|oblique/i.test(all) || Boolean(f.italic) };
    }
  } catch { font = null; }
  // a web font this page declares only loads once asked for; an installed font needs nothing
  if (font) await document.fonts.load(`${font.weight} 16px ${font.css}`).catch(() => {});
  pdfFonts.set(name, font);
  return font;
}

async function pdfPages(base64, onStep) {
  onStep?.("A abrir o PDF");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, fontExtraProperties: true }).promise;
  const pages = [];
  for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: WIDTH / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    // Each text item is a run of characters on one line; split it into words. With the PDF's font, each word's
    // place is measured; without it, the item's width is shared out by the number of characters.
    const words = [];
    const { items, styles } = await page.getTextContent();
    const measurer = document.createElement("canvas").getContext("2d");
    for (const item of items) {
      if (!item.str?.trim()) continue;
      const tx = pdfjs.Util.transform(viewport.transform, item.transform);
      const h = Math.hypot(tx[2], tx[3]);
      const w = item.width * viewport.scale;
      const line = `${n}:${Math.round(tx[5] / Math.max(h * 0.5, 1))}`;
      const family = styles?.[item.fontName]?.fontFamily || "sans-serif";
      const font = await pdfFont(page, item.fontName);
      let at = (i) => (w * i) / item.str.length;
      if (font) {
        measurer.font = `${font.italic ? "italic " : ""}${font.weight} 100px ${font.css}, ${family}`;
        const total = measurer.measureText(item.str).width;
        if (total > 0) at = (i) => (w * measurer.measureText(item.str.slice(0, i)).width) / total;
      }
      for (const m of item.str.matchAll(/\S+/g)) {
        const x0 = tx[4] + at(m.index);
        const x1 = tx[4] + at(m.index + m[0].length);
        words.push({ text: m[0], page: n - 1, line, size: h, family, font, baseline: tx[5], box: { x0, x1, y0: tx[5] - h * 0.82, y1: tx[5] + h * 0.18 } });
      }
    }
    pages.push({ canvas, words });
  }
  return pages;
}

async function photoPages(images, onStep) {
  onStep?.("A procurar as linhas na fotografia");
  // Served as a file from public/vendor, so the bundler must leave this import alone.
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "/vendor/tesseract/tesseract.esm.min.js");
  const createWorker = mod.createWorker || mod.default?.createWorker;
  const worker = await createWorker("por", 1, {
    workerPath: "/vendor/tesseract/worker.min.js",
    corePath: "/vendor/tesseract",
    langPath: "/vendor/tesseract/lang",
    gzip: true,
  });
  const pages = [];
  try {
    for (const [p, src] of images.slice(0, MAX_PAGES).entries()) {
      if (images.length > 1) onStep?.(`A ler a página ${p + 1} de ${Math.min(images.length, MAX_PAGES)}`);
      const img = await loadImage(src);
      const scale = WIDTH / img.naturalWidth;
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      const words = [];
      (data.blocks || []).forEach((block, b) => block.paragraphs.forEach((para, pa) => para.lines.forEach((line, l) => {
        for (const word of line.words) words.push({ text: word.text, page: p, line: `${p}:${b}-${pa}-${l}`, box: word.bbox, conf: word.confidence });
      })));
      pages.push({ canvas, words });
    }
  } finally {
    await worker.terminate();
  }
  return pages;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível abrir a fotografia."));
    img.src = src;
  });
}

/* ---------------- Finding the review's quotes among the words ---------------- */
const norm = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9%+#]/g, "");
const tokens = (s) => (String(s || "").match(/[\p{L}\p{N}%+#]+/gu) || []).map(norm).filter(Boolean);

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// Text read from a photo has typos, so near enough counts.
function similar(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const d = distance(a, b);
  return (a.length >= 4 && d <= 1) || (a.length >= 7 && d <= 2);
}

// The run of words that best matches the quote, in order, allowing for a few misread or extra words.
function findWords(words, quote) {
  const q = tokens(quote);
  if (!q.length) return null;
  let best = null;
  for (let i = 0; i < words.length; i++) {
    if (!similar(words[i].norm, q[0]) && !(q[1] && similar(words[i].norm, q[1]))) continue;
    const hit = [];
    let j = i;
    for (const t of q) {
      for (let k = j; k < Math.min(j + 3, words.length); k++) {
        if (similar(words[k].norm, t)) { hit.push(k); j = k + 1; break; }
      }
    }
    if (!hit.length) continue;
    const score = hit.length / q.length;
    const span = hit.at(-1) - hit[0] + 1;
    if (score >= 0.6 && span <= q.length + 4 && words[hit[0]].page === words[hit.at(-1)].page && (!best || score > best.score)) {
      best = { score, from: hit[0], to: hit.at(-1) };
    }
  }
  return best && words.slice(best.from, best.to + 1);
}

// Words on the same printed line become one box.
function lineBoxes(run) {
  const groups = [];
  for (const w of run) {
    const last = groups.at(-1);
    if (last && last.line === w.line) {
      last.x0 = Math.min(last.x0, w.box.x0); last.x1 = Math.max(last.x1, w.box.x1);
      last.y0 = Math.min(last.y0, w.box.y0); last.y1 = Math.max(last.y1, w.box.y1);
    } else groups.push({ line: w.line, ...w.box });
  }
  return groups;
}

/* ---------------- The pen ---------------- */
let seed = 7;
const wobble = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);

// A line drawn by hand: not quite straight, not quite level.
function penLine(ctx, x0, x1, y, color, width, wave = 0) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0 - 3, y + wobble() * 3);
  const steps = Math.max(2, Math.round((x1 - x0) / 120));
  for (let s = 1; s <= steps; s++) {
    const x = x0 + ((x1 - x0) * s) / steps + (s === steps ? 4 : 0);
    const mid = x - (x1 - x0) / steps / 2;
    ctx.quadraticCurveTo(mid, y + (wave ? (s % 2 ? wave : -wave) : 0) + wobble() * 4, x, y + wobble() * 3);
  }
  ctx.stroke();
  ctx.restore();
}

function tick(ctx, x, y, size) {
  ctx.save();
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = size * 0.16;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.35);
  ctx.lineTo(x + size * 0.32, y);
  ctx.lineTo(x + size, y - size * 0.95);
  ctx.stroke();
  ctx.restore();
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// How big a slip would be for this text at this width.
function measure(ctx, text, maxWidth, size) {
  ctx.save();
  ctx.font = `600 ${size}px Caveat, cursive`;
  const lines = wrap(ctx, text, maxWidth - size);
  const w = Math.min(maxWidth, Math.max(...lines.map((l) => ctx.measureText(l).width)) + size);
  ctx.restore();
  return { lines, w, h: lines.length * size * 1.08 + size * 0.5 };
}

// Where a correction goes, best first: in the free margin beside the line (with an arrow to it),
// then in the nearest blank space below, and only if there is none, over the text under the line.
function placeNote(ctx, text, { boxes, size, words, taken, page }) {
  const first = boxes[0], last = boxes.at(-1);
  const pad = size * 0.4;
  const free = (b) => b.x >= 8 && b.y >= 8 && b.x + b.w <= page.width - 8 && b.y + b.h <= page.height - 8
    && !taken.some((t) => overlaps(t, b))
    && !words.some((w) => overlaps({ x: w.box.x0 - pad, y: w.box.y0 - pad, w: w.box.x1 - w.box.x0 + pad * 2, h: w.box.y1 - w.box.y0 + pad * 2 }, b));

  // 1. Beside the line, past the end of whatever is printed at that height.
  for (const shift of [0, -0.5, 0.5, 1, -1, 1.5, 2, 2.5, 3, 4, 5, 6, 7]) {
    const top = first.y0 - size * 0.3 + shift * size;
    const probe = measure(ctx, text, page.width * 0.3, size);
    const right = Math.max(last.x1, ...words.filter((w) => w.box.y1 > top && w.box.y0 < top + probe.h).map((w) => w.box.x1));
    const x = right + size * 1.4;
    const maxWidth = page.width - x - 16;
    if (maxWidth < page.width * 0.2) continue;
    const m = measure(ctx, text, Math.min(maxWidth, page.width * 0.34), size);
    const box = { x, y: top, w: m.w, h: m.h };
    if (free(box)) return { box, lines: m.lines, arrow: { x: last.x1 + 8, y: (last.y0 + last.y1) / 2 } };
  }
  // 2. In a blank space just below.
  const m = measure(ctx, text, Math.min(page.width - first.x0 - 16, Math.max(last.x1 - first.x0, page.width * 0.42)), size);
  for (let y = last.y1 + 4; y < last.y1 + size * 8; y += size * 0.5) {
    const box = { x: Math.max(8, Math.min(first.x0 - 6, page.width - m.w - 8)), y, w: m.w, h: m.h };
    if (free(box)) return { box, lines: m.lines };
  }
  // 3. Over the text below, as a slip stuck on the page.
  let box = { x: Math.max(8, Math.min(first.x0 - 6, page.width - m.w - 8)), y: last.y1 + 6, w: m.w, h: m.h };
  for (let tries = 0; tries < 12 && taken.some((t) => overlaps(t, box)); tries++) box = { ...box, y: box.y + size * 0.9 };
  box.y = Math.max(8, Math.min(box.y, page.height - m.h - 8));
  return { box, lines: m.lines };
}

// A curved pen arrow from the struck line to its correction in the margin.
function arrow(ctx, from, to, size) {
  ctx.save();
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  const mx = (from.x + to.x) / 2;
  ctx.quadraticCurveTo(mx, Math.min(from.y, to.y) - size * 0.6, to.x, to.y);
  ctx.stroke();
  const angle = Math.atan2(to.y - (Math.min(from.y, to.y) - size * 0.6), to.x - mx);
  const head = size * 0.35;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - head * Math.cos(angle - 0.5), to.y - head * Math.sin(angle - 0.5));
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - head * Math.cos(angle + 0.5), to.y - head * Math.sin(angle + 0.5));
  ctx.stroke();
  ctx.restore();
}

// A correction written on a slip of paper, in green ink.
function note(ctx, { box, lines, arrow: from }, { size, taken }) {
  ctx.save();
  taken.push(box);
  if (from) arrow(ctx, from, { x: box.x - 6, y: box.y + size * 0.7 }, size);
  ctx.font = `600 ${size}px Caveat, cursive`;
  ctx.shadowColor = "rgba(0, 0, 0, 0.18)";
  ctx.shadowBlur = size * 0.4;
  ctx.shadowOffsetY = size * 0.08;
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, size * 0.25);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = GREEN;
  ctx.fillRect(box.x, box.y + size * 0.2, 3, box.h - size * 0.4);
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, box.x + size * 0.5, box.y + size * 0.22 + i * size * 1.08));
  ctx.restore();
}

/* ---------------- The look of the original ----------------
   Read from the first page before any pen touches it: the columns, the colours, the photo and the typeface,
   so the corrected CV can be laid out again in the same design, with its content always in order. */
const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
const lumOf = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

// The most common colour among the pixels `keep` lets through, sampled every `step` pixels.
function dominant(data, W, { x0 = 0, y0 = 0, x1, y1, step = 6, keep = () => true }) {
  const count = new Map();
  let total = 0;
  for (let y = Math.floor(y0); y < y1; y += step) for (let x = Math.floor(x0); x < x1; x += step) {
    const i = (y * W + x) * 4, c = [data[i], data[i + 1], data[i + 2]];
    if (!keep(c, x, y)) continue;
    total++;
    const k = (c[0] >> 4) * 256 + (c[1] >> 4) * 16 + (c[2] >> 4);
    const e = count.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += c[0]; e.g += c[1]; e.b += c[2];
    count.set(k, e);
  }
  let best = null;
  for (const e of count.values()) if (!best || e.n > best.n) best = e;
  return best ? { colour: [best.r / best.n, best.g / best.n, best.b / best.n], share: best.n / Math.max(1, total) } : null;
}

// The ink of some words: their strongest pixels against the colour right behind them, so white letters
// on a dark sidebar read as white (the letters' soft edges blend into that background and are left out).
function inkOf(data, W, boxes) {
  const px = [];
  for (const bx of boxes) {
    const bg = dominant(data, W, { x0: Math.max(0, bx.x0 - 3), y0: Math.max(0, bx.y0 - 3), x1: Math.min(W, bx.x1 + 3), y1: bx.y1 + 3, step: 2 })?.colour;
    if (!bg) continue;
    for (let y = Math.max(0, Math.floor(bx.y0)); y < bx.y1; y++) for (let x = Math.max(0, Math.floor(bx.x0)); x < Math.min(W, bx.x1); x++) {
      const i = (y * W + x) * 4, c = [data[i], data[i + 1], data[i + 2]], d = dist(c, bg);
      if (d >= 150) px.push([d, c]);
    }
  }
  if (px.length <= 20) return null;
  px.sort((a, b) => b[0] - a[0]);
  const top = px.slice(0, Math.max(10, Math.floor(px.length * 0.35)));
  return [0, 1, 2].map((k) => top.reduce((s, [, c]) => s + c[k], 0) / top.length);
}

// The sheet inside the picture: a photo or a screenshot of a CV often has a table, a desk or a grey
// frame around it. Everything below is measured inside the sheet only.
function findSheet(data, W, H) {
  const frame = dominant(data, W, { x1: W, y1: H, step: 4, keep: (c, x, y) => x < 8 || y < 8 || x > W - 9 || y > H - 9 });
  const whole = { x0: 0, y0: 0, x1: W, y1: H };
  if (!frame || frame.share < 0.5) return whole;
  const bg = frame.colour;
  const off = (x, y) => { const i = (y * W + x) * 4; return dist([data[i], data[i + 1], data[i + 2]], bg) > 40; };
  const colShare = (x) => { let n = 0, k = 0; for (let y = 0; y < H; y += 6) { n++; if (off(x, y)) k++; } return k / n; };
  const rowShare = (y) => { let n = 0, k = 0; for (let x = 0; x < W; x += 6) { n++; if (off(x, y)) k++; } return k / n; };
  let x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1;
  while (x0 < W / 2 && colShare(x0) < 0.4) x0 += 2;
  while (x1 > W / 2 && colShare(x1) < 0.4) x1 -= 2;
  while (y0 < H / 2 && rowShare(y0) < 0.4) y0 += 2;
  while (y1 > H / 2 && rowShare(y1) < 0.4) y1 -= 2;
  // A frame the same colour as the paper (an ordinary page) leaves no sheet to find.
  if (x1 - x0 < W * 0.4 || y1 - y0 < H * 0.4 || (x0 < 4 && y0 < 4 && x1 > W - 5 && y1 > H - 5)) return whole;
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

function readLayout(pages, words, review) {
  const { canvas } = pages[0];
  const W = canvas.width, H = canvas.height;
  const data = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const S = findSheet(data, W, H);
  const SW = S.x1 - S.x0, SH = S.y1 - S.y0;
  const inside = (b) => (b.x0 + b.x1) / 2 >= S.x0 && (b.x0 + b.x1) / 2 <= S.x1 && (b.y0 + b.y1) / 2 >= S.y0 && (b.y0 + b.y1) / 2 <= S.y1;
  const first = words.filter((w) => w.page === 0 && inside(w.box) && /[\p{L}\p{N}]/u.test(w.text));
  // Words the photo reader made up (in hair, a face, a pattern) have low confidence: they don't count as
  // text when looking for the photo. (White text on a dark sidebar can score low too, so only here.)
  const sure = first.filter((w) => w.conf == null || w.conf >= 55);
  const paper = dominant(data, W, { ...S, step: 8 })?.colour || [255, 255, 255];
  const textBoxes = sure.filter((w) => w.norm.length >= 2 && w.box.y1 - w.box.y0 < SH * 0.06).map((w) => w.box);
  const onText = (x, y) => textBoxes.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);

  // Two columns: a band down the sheet that no word crosses.
  let split = null;
  const body = first.filter((w) => w.box.y0 > S.y0 + SH * 0.12 && w.box.y1 < S.y0 + SH * 0.97);
  if (body.length > 30) {
    const bins = new Float32Array(Math.ceil(W / 4));
    for (const w of body) for (let x = Math.max(0, Math.floor(w.box.x0 / 4)); x <= Math.min(bins.length - 1, Math.ceil(w.box.x1 / 4)); x++) bins[x]++;
    let bestGap = null;
    for (let x = Math.floor((S.x0 + SW * 0.2) / 4); x < (S.x0 + SW * 0.8) / 4; x++) {
      if (bins[x] > 0) continue;
      let e = x;
      while (e < (S.x0 + SW * 0.8) / 4 && bins[e] === 0) e++;
      if (!bestGap || e - x > bestGap.w) bestGap = { x, w: e - x };
      x = e;
    }
    if (bestGap && bestGap.w * 4 >= SW * 0.012) {
      const at = (bestGap.x + bestGap.w / 2) * 4;
      const left = body.filter((w) => w.box.x1 <= at).reduce((s, w) => s + w.text.length, 0);
      const right = body.filter((w) => w.box.x0 >= at).reduce((s, w) => s + w.text.length, 0);
      if (Math.min(left, right) > (left + right) * 0.15) split = { at, side: left < right ? "left" : "right" };
    }
  }
  const sideX0 = split ? (split.side === "left" ? S.x0 : split.at) : 0;
  const sideX1 = split ? (split.side === "left" ? split.at : S.x1) : 0;

  // A sidebar in its own colour (often dark, with the text in white).
  let sideBg = null;
  if (split) {
    const d = dominant(data, W, { x0: sideX0, x1: sideX1, y0: S.y0 + SH * 0.1, y1: S.y0 + SH * 0.95, step: 8 });
    if (d && d.share > 0.4 && dist(d.colour, paper) > 30) sideBg = d.colour;
  }

  // A coloured sidebar: its real edge (the gutter between the words can sit a little off it), and a photo
  // filling its top: whatever sits above the point where the sidebar's colour starts, with no words on it.
  let topPhoto = null;
  if (split && sideBg) {
    const near = (x, y) => { const i = (Math.floor(y) * W + Math.floor(x)) * 4; return dist([data[i], data[i + 1], data[i + 2]], sideBg) < 36; };
    const rowShare = (y) => { let n = 0, k = 0; for (let x = sideX0 + 4; x < sideX1 - 4; x += 4) { n++; if (near(x, y)) k++; } return k / Math.max(1, n); };
    let start = S.y0;
    while (start < S.y0 + SH * 0.6 && !(rowShare(start) > 0.7 && rowShare(start + 6) > 0.7)) start += 3;
    const colShare = (x) => { let n = 0, k = 0; for (let y = start + 10; y < S.y1 - 4; y += 6) { n++; if (near(x, y)) k++; } return k / Math.max(1, n); };
    let edge = split.side === "left" ? S.x0 : S.x1 - 1;
    if (split.side === "left") { while (edge < S.x0 + SW * 0.6 && colShare(edge + 2) > 0.6) edge += 2; }
    else { while (edge > S.x0 + SW * 0.4 && colShare(edge - 2) > 0.6) edge -= 2; }
    if (Math.abs(edge - split.at) < SW * 0.08) split.at = edge;
    const sx0 = split.side === "left" ? S.x0 : split.at, sx1 = split.side === "left" ? split.at : S.x1;
    const wordsOnTop = sure.filter((w) => w.norm.length >= 3 && w.box.y1 < start && (w.box.x0 + w.box.x1) / 2 > sx0 && (w.box.x0 + w.box.x1) / 2 < sx1).length;
    if (start - S.y0 > SH * 0.12 && start < S.y0 + SH * 0.55 && wordsOnTop < 3) topPhoto = { n: 1e9, x0: sx0, y0: S.y0, x1: sx1, y1: start, round: false };
  }

  // The photo: a dense, roughly square patch near the top, with no words on it. The sidebar's own colour
  // doesn't count, so a photo sitting right on a dark sidebar is still found on its own.
  const C = 10, cols = Math.ceil(W / C), rows = Math.ceil((S.y0 + SH * 0.5) / C);
  const busy = new Uint8Array(cols * rows);
  const hasText = (cx, cy) => textBoxes.some((b) => cx * C + C > b.x0 - 4 && cx * C < b.x1 + 4 && cy * C + C > b.y0 - 4 && cy * C < b.y1 + 4);
  for (let cy = Math.floor(S.y0 / C); cy < rows; cy++) for (let cx = Math.floor(S.x0 / C); cx < Math.min(cols, S.x1 / C); cx++) {
    let ink = 0, side = 0, n = 0;
    for (let y = cy * C; y < Math.min(H, cy * C + C); y += 3) for (let x = cx * C; x < Math.min(W, cx * C + C); x += 3) {
      const i = (y * W + x) * 4, c = [data[i], data[i + 1], data[i + 2]];
      n++;
      if (dist(c, paper) > 60) ink++;
      if (sideBg && dist(c, sideBg) < 36) side++;
    }
    if (ink / n > 0.5 && side / n < 0.5 && !hasText(cx, cy)) busy[cy * cols + cx] = 1;
  }
  let photo = topPhoto;
  const seen = new Uint8Array(cols * rows);
  for (let s = 0; s < busy.length; s++) {
    if (!busy[s] || seen[s]) continue;
    const stack = [s]; seen[s] = 1;
    let n = 0, x0 = cols, x1 = 0, y0 = rows, y1 = 0;
    while (stack.length) {
      const c = stack.pop(), cx = c % cols, cy = (c - cx) / cols;
      n++; x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, k = ny * cols + nx;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && busy[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, aspect = w / h, fill = n / (w * h);
    if (aspect < 0.6 || aspect > 1.6 || w * C < SW * 0.06 || w * C > SW * 0.5 || fill < 0.5) continue;
    if (!photo || n > photo.n) photo = { n, x0: x0 * C, y0: y0 * C, x1: (x1 + 1) * C, y1: (y1 + 1) * C, round: fill < 0.88 };
  }
  if (photo) {
    // A photo that fills the top of its column edge to edge is laid out the same way, uncropped.
    const pw = photo.x1 - photo.x0, ph = photo.y1 - photo.y0;
    const bleed = Boolean(split) && !photo.round && pw >= (sideX1 - sideX0) * 0.8 && photo.y0 - S.y0 < SH * 0.06;
    const crop = document.createElement("canvas");
    let sx = photo.x0, sy = photo.y0, sw = pw, sh = ph;
    if (!bleed) { const size = Math.max(pw, ph); sx = (photo.x0 + photo.x1 - size) / 2; sy = (photo.y0 + photo.y1 - size) / 2; sw = sh = size; }
    const k = Math.min(1, 520 / Math.max(sw, sh));
    crop.width = Math.round(sw * k); crop.height = Math.round(sh * k);
    crop.getContext("2d").drawImage(canvas, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
    photo = { src: crop.toDataURL("image/jpeg", 0.9), round: photo.round, bleed, aspect: sw / sh, x: ((photo.x0 + photo.x1) / 2 - S.x0) / SW, y: ((photo.y0 + photo.y1) / 2 - S.y0) / SH, box: photo };
  }
  const inPhoto = (x, y) => photo && x >= photo.box.x0 && x <= photo.box.x1 && y >= photo.box.y0 && y <= photo.box.y1;
  const inMain = (b) => !split || ((b.x0 + b.x1) / 2 < split.at) !== (split.side === "left");

  // The colours: the name's ink, the headings' ink (in the main column first), and the decoration.
  const nameRun = findWords(first, review?.profile?.name || "");
  const nameInk = nameRun && inkOf(data, W, lineBoxes(nameRun));
  const lineWords = new Map();
  for (const w of first) (lineWords.get(w.line) || lineWords.set(w.line, []).get(w.line)).push(w);
  const HEAD = /^(profile|perfil|resumo|summary|about|sobre|experience|experiencia|education|educacao|formacao|skills|competencias|expertise|contact|contacto|contactos|idiomas|languages|projects|projetos)$/;
  const headWords = first.filter((w) => HEAD.test(w.norm) && (lineWords.get(w.line) || []).length <= 3);
  const mainHeads = headWords.filter((w) => inMain(w.box));
  const headingInk = inkOf(data, W, (mainHeads.length ? mainHeads : headWords).slice(0, 3).map((w) => w.box));
  const headingUpper = headWords.length ? headWords.filter((w) => w.text === w.text.toUpperCase()).length > headWords.length / 2 : true;
  const keepDecor = (c, x, y) => sat(c) > 0.16 && dist(c, paper) > 60 && !inPhoto(x, y) && !onText(x, y);
  const decor = dominant(data, W, { ...S, step: 6, keep: keepDecor });
  const decorColour = decor && decor.share > 0.08 ? decor.colour : null;
  const band = dominant(data, W, { ...S, step: 6, keep: (c, x, y) => dist(c, paper) > 12 && dist(c, paper) < 70 && !inPhoto(x, y) && (!split || x < sideX0 || x > sideX1 || !sideBg) });
  const topBar = Boolean(decorColour) && dominant(data, W, { x0: S.x0, x1: S.x1, y0: S.y0, y1: S.y0 + SH * 0.04, step: 4, keep: (c) => dist(c, decorColour) < 60 })?.share > 0;

  const fam = pdfFamily(first);
  const nameUpper = Boolean(nameRun?.length) && nameRun.every((w) => w.text === w.text.toUpperCase());
  return {
    width: SW, height: SH,
    split: split ? (split.at - S.x0) / SW : null, side: split?.side || null,
    sideBg: sideBg && hex(sideBg), sideDark: Boolean(sideBg && lumOf(sideBg) < 0.5),
    accent: nameInk ? hex(nameInk) : null,
    heading: headingInk ? hex(headingInk) : null,
    headingUpper,
    decor: decorColour && hex(decorColour),
    band: band && band.share > 0.04 ? hex(band.colour) : null,
    topBar, photo: photo && { src: photo.src, round: photo.round, bleed: photo.bleed, aspect: photo.aspect, x: photo.x, y: photo.y }, nameUpper,
    serif: fam.serif, font: fam.css,
    words: words.filter((w) => w.page !== 0 || inside(w.box)).map((w) => ({ norm: w.norm, text: w.text, page: w.page, line: w.line, x: (((w.box.x0 + w.box.x1) / 2) - S.x0) / SW, y: (((w.box.y0 + w.box.y1) / 2) - S.y0) / SH })),
  };
}

// The typeface most of the PDF's words are set in (photos: unknown, sans).
function pdfFamily(words) {
  const count = new Map();
  for (const w of words) if (w.font?.css) count.set(w.font.css, (count.get(w.font.css) || 0) + w.text.length);
  const css = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const family = words.find((w) => w.font?.css === css)?.family || "";
  return { css, serif: /serif/i.test(family) && !/sans/i.test(family) || /times|georgia|garamond|cambria|book/i.test(css || "") };
}

// Where each part of the corrected CV goes, in the same design: which sections sit in the sidebar,
// and where the name, the contact details and the photo were.
export function styleFor(full, layout, text = "") {
  if (!layout) return null;
  const words = layout.words.filter((w) => w.page === 0);
  const col = (x) => (layout.split == null ? "main" : (x < layout.split) === (layout.side === "left") ? "side" : "main");
  const where = (text) => { const run = findWords(words, text); return run ? col(run.reduce((s, w) => s + w.x, 0) / run.length) : null; };
  const SIDE = /compet|skill|expertise|aptid|ferrament|tecnolog|idioma|lingua|language|interess|hobb|certif|contact|refer|softw|tools/i;
  const sections = (full.sections || []).map((s) => {
    const found = where(s.title);
    return found || (layout.split != null && SIDE.test(s.title) ? "side" : "main");
  });
  const two = layout.split != null && sections.includes("side") && sections.includes("main");
  // The contact details sit where most of them were, or under a "Contact" heading in the sidebar.
  const contactVotes = (full.contact || []).map(where).filter(Boolean);
  const contactHeading = words.find((w) => /^(contact|contacts|contacto|contactos|contato|kontakt)$/.test(w.norm));
  const contactSide = contactVotes.filter((v) => v === "side").length > contactVotes.length / 2 || (contactHeading && col(contactHeading.x) === "side");
  // The name as the page set it: in capitals or not, in its own column.
  const nameRun = findWords(words, full.name || "");
  // A big bold name is often missed when a photo is read for words; the CV's text still has it as written.
  const upperName = String(full.name || "").toUpperCase();
  const nameUpper = layout.nameUpper
    || Boolean(nameRun?.length && nameRun.every((w) => w.text === w.text.toUpperCase() && /\p{L}/u.test(w.text)))
    || (upperName.length > 2 && upperName !== full.name && String(text).includes(upperName));
  const photoCol = layout.photo ? (two ? col(layout.photo.x) : "main") : null;
  // A big name on a dark sidebar is easily missed when a photo is read for words: then it sits with the photo.
  const header = two ? where(full.name) || photoCol || "main" : "main";
  // Colours that work where they land: white ink only on a dark sidebar, never on white paper.
  const light = (h) => Boolean(h) && (parseInt(h.slice(1, 3), 16) * 0.299 + parseInt(h.slice(3, 5), 16) * 0.587 + parseInt(h.slice(5, 7), 16) * 0.114) / 255 > 0.72;
  const headerDark = two && header === "side" && layout.sideDark;
  const heading = layout.heading && !light(layout.heading) ? layout.heading : "#1f1f1f";
  let accent = layout.accent || heading;
  if (headerDark) accent = light(accent) ? accent : "#ffffff";
  else if (light(accent)) accent = heading;
  return {
    two,
    side: layout.side,
    sideRatio: layout.side === "left" ? layout.split : 1 - layout.split,
    sections: two ? sections : sections.map(() => "main"),
    header,
    contact: two && contactSide ? "side" : "header",
    photo: layout.photo ? { ...layout.photo, bleed: Boolean(layout.photo.bleed && two && photoCol === "side"), column: photoCol } : null,
    accent, heading, decor: light(layout.decor) ? null : layout.decor, band: layout.band,
    sideBg: two ? layout.sideBg : null, sideDark: two && layout.sideDark,
    headingUpper: layout.headingUpper !== false,
    topBar: layout.topBar, nameUpper, serif: layout.serif, font: layout.font,
  };
}

/* ---------------- Putting it together ---------------- */
export async function drawCorrections({ review, images, pdf, onStep }) {
  await document.fonts.load("600 40px Caveat");
  const pages = pdf ? await pdfPages(pdf, onStep) : await photoPages(images || [], onStep);
  if (!pages.length) return { pages: [], marks: 0, layout: null };
  onStep?.("A desenhar as correções");

  const words = pages.flatMap((p) => p.words).map((w) => ({ ...w, norm: norm(w.text) })).filter((w) => w.norm);
  let layout = null;
  try { layout = readLayout(pages, words, review); } catch (err) { console.warn("[cv] layout", err); }
  const heights = words.map((w) => w.box.y1 - w.box.y0).sort((a, b) => a - b);
  const lineHeight = heights[Math.floor(heights.length / 2)] || 24;
  const size = Math.round(Math.min(44, Math.max(24, lineHeight * 1.15)));
  const taken = pages.map(() => []);
  let marks = 0;
  seed = 7;

  // The lines to rewrite are found first: a line that's struck out can't also be praised.
  const struck = new Set();
  const rewrites = (review.rewrites || []).map((w) => ({ w, run: w.improved ? findWords(words, w.original) : null })).filter((x) => x.run);
  rewrites.forEach(({ run }) => run.forEach((word) => struck.add(word)));

  // What works: a quick green underline and a tick.
  for (const s of review.strengths || []) {
    const run = findWords(words, s.evidence);
    if (!run || run.some((word) => struck.has(word))) continue;
    const page = pages[run[0].page];
    const ctx = page.canvas.getContext("2d");
    const boxes = lineBoxes(run);
    for (const b of boxes) penLine(ctx, b.x0, b.x1, b.y1 + 4, GREEN, Math.max(2.5, lineHeight * 0.12), 2);
    const last = boxes.at(-1);
    tick(ctx, last.x1 + 10, last.y1 - 2, lineHeight * 0.9);
    marks++;
  }

  // What goes: every line struck through in red first, so that no stroke ever runs across a slip...
  const struckLines = rewrites.map(({ w, run }) => {
    const p = run[0].page;
    const page = pages[p];
    const ctx = page.canvas.getContext("2d");
    const boxes = lineBoxes(run);
    for (const b of boxes) penLine(ctx, b.x0, b.x1, b.y0 + (b.y1 - b.y0) * 0.55, RED, Math.max(2.5, lineHeight * 0.11));
    return { w, p, page, ctx, boxes };
  });
  // ...then each new line, written on a slip. All the arrows go down before any slip, so a slip laid
  // over an arrow hides it the way paper would, instead of the arrow running across its words.
  const spots = struckLines.map(({ w, p, page, ctx, boxes }) => {
    const spot = placeNote(ctx, w.improved.replace(/^[-•–*]\s*/, ""), { boxes, size, words: page.words, taken: taken[p], page: page.canvas });
    taken[p].push(spot.box);
    return { ctx, spot };
  });
  for (const { ctx, spot } of spots) if (spot.arrow) arrow(ctx, spot.arrow, { x: spot.box.x - 6, y: spot.box.y + size * 0.7 }, size);
  for (const { ctx, spot } of spots) {
    note(ctx, { box: spot.box, lines: spot.lines }, { size, taken: [] });
    marks++;
  }

  // What's missing: the keywords, on a slip near the foot of the last page.
  const kws = (review.ats?.missing_keywords || []).slice(0, 6);
  if (kws.length) {
    const p = pages.length - 1;
    const canvas = pages[p].canvas;
    const ctx = canvas.getContext("2d");
    const text = `Acrescenta: ${kws.join(", ")}`;
    const m = measure(ctx, text, canvas.width * 0.46, size);
    note(ctx, { box: { x: canvas.width - m.w - 40, y: canvas.height - m.h - size * 1.5, w: m.w, h: m.h }, lines: m.lines }, { size, taken: taken[p] });
  }

  return { pages: pages.map((p) => p.canvas), marks, layout };
}
