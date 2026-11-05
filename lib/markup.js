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
        for (const word of line.words) words.push({ text: word.text, page: p, line: `${p}:${b}-${pa}-${l}`, box: word.bbox });
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

// The ink of some words: the average of their strongest pixels (the letters' edges blend into the paper).
function inkOf(data, W, boxes, paper) {
  const px = [];
  for (const bx of boxes) for (let y = Math.max(0, Math.floor(bx.y0)); y < bx.y1; y++) for (let x = Math.max(0, Math.floor(bx.x0)); x < Math.min(W, bx.x1); x++) {
    const i = (y * W + x) * 4, c = [data[i], data[i + 1], data[i + 2]], d = dist(c, paper);
    if (d >= 220) px.push([d, c]);
  }
  if (px.length <= 20) return null;
  px.sort((a, b) => b[0] - a[0]);
  const top = px.slice(0, Math.max(10, Math.floor(px.length * 0.35)));
  return [0, 1, 2].map((k) => top.reduce((s, [, c]) => s + c[k], 0) / top.length);
}

function readLayout(pages, words, review) {
  const { canvas } = pages[0];
  const W = canvas.width, H = canvas.height;
  const data = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const first = words.filter((w) => w.page === 0);
  const paper = dominant(data, W, { x1: W, y1: H, step: 8 })?.colour || [255, 255, 255];
  const textBoxes = first.filter((w) => w.norm.length >= 2 && w.box.y1 - w.box.y0 < H * 0.06).map((w) => w.box);

  // Two columns: a band down the middle of the page that no word crosses.
  let split = null;
  const body = first.filter((w) => w.box.y0 > H * 0.12 && w.box.y1 < H * 0.97);
  if (body.length > 30) {
    const bins = new Float32Array(Math.ceil(W / 4));
    for (const w of body) for (let x = Math.max(0, Math.floor(w.box.x0 / 4)); x <= Math.min(bins.length - 1, Math.ceil(w.box.x1 / 4)); x++) bins[x]++;
    let bestGap = null;
    for (let x = Math.floor(bins.length * 0.22); x < bins.length * 0.78; x++) {
      if (bins[x] > 0) continue;
      let e = x;
      while (e < bins.length * 0.78 && bins[e] === 0) e++;
      if (!bestGap || e - x > bestGap.w) bestGap = { x, w: e - x };
      x = e;
    }
    if (bestGap && bestGap.w * 4 >= W * 0.012) {
      const at = (bestGap.x + bestGap.w / 2) * 4;
      const left = body.filter((w) => w.box.x1 <= at).reduce((s, w) => s + w.text.length, 0);
      const right = body.filter((w) => w.box.x0 >= at).reduce((s, w) => s + w.text.length, 0);
      if (Math.min(left, right) > (left + right) * 0.15) split = { at, side: left < right ? "left" : "right" };
    }
  }

  // The photo: a dense, roughly square patch of colour near the top, with no words on it.
  const C = 10, cols = Math.ceil(W / C), rows = Math.ceil((H * 0.45) / C);
  const busy = new Uint8Array(cols * rows);
  const hasText = (cx, cy) => textBoxes.some((b) => cx * C + C > b.x0 - 4 && cx * C < b.x1 + 4 && cy * C + C > b.y0 - 4 && cy * C < b.y1 + 4);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    let ink = 0, n = 0;
    for (let y = cy * C; y < Math.min(H, cy * C + C); y += 3) for (let x = cx * C; x < Math.min(W, cx * C + C); x += 3) {
      const i = (y * W + x) * 4;
      n++; if (dist([data[i], data[i + 1], data[i + 2]], paper) > 60) ink++;
    }
    if (ink / n > 0.5 && !hasText(cx, cy)) busy[cy * cols + cx] = 1;
  }
  let photo = null;
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
    if (aspect < 0.65 || aspect > 1.5 || w * C < W * 0.06 || w * C > W * 0.38 || fill < 0.5) continue;
    if (!photo || n > photo.n) photo = { n, x0: x0 * C, y0: y0 * C, x1: (x1 + 1) * C, y1: (y1 + 1) * C, round: fill < 0.88 };
  }
  if (photo) {
    const size = Math.max(photo.x1 - photo.x0, photo.y1 - photo.y0);
    const cx = (photo.x0 + photo.x1) / 2, cy = (photo.y0 + photo.y1) / 2;
    const crop = document.createElement("canvas");
    crop.width = crop.height = Math.min(480, Math.round(size));
    crop.getContext("2d").drawImage(canvas, cx - size / 2, cy - size / 2, size, size, 0, 0, crop.width, crop.height);
    photo = { src: crop.toDataURL("image/jpeg", 0.9), round: photo.round, x: cx / W, y: cy / H };
  }
  const inPhoto = (x, y) => photo && Math.abs(x / W - photo.x) < 0.2 && Math.abs(y / H - photo.y) < 0.15;

  // The colours: the name's ink, the headings' ink, and the decoration (bars, bands, chips).
  const nameRun = findWords(first, review?.profile?.name || "");
  const nameInk = nameRun && inkOf(data, W, lineBoxes(nameRun), paper);
  const headingInks = [];
  for (const re of [/^(profile|perfil|resumo|summary)$/, /^(experience|experiencia|education|educacao|formacao|skills|competencias|contact|contacto|contactos|idiomas|languages)$/]) {
    const hw = first.filter((w) => re.test(w.norm) && w.text === w.text.toUpperCase()).slice(0, 3);
    const ink = hw.length && inkOf(data, W, hw.map((w) => w.box), paper);
    if (ink) headingInks.push(ink);
  }
  const decor = dominant(data, W, { x1: W, y1: H, step: 6, keep: (c, x, y) => sat(c) > 0.16 && dist(c, paper) > 60 && !inPhoto(x, y) && !textBoxes.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) });
  const decorColour = decor && decor.share > 0.08 ? decor.colour : null;
  const band = dominant(data, W, { x1: W, y1: H, step: 6, keep: (c, x, y) => dist(c, paper) > 12 && dist(c, paper) < 70 && !inPhoto(x, y) });
  const topBar = Boolean(decorColour) && dominant(data, W, { x1: W, y1: H * 0.04, step: 4, keep: (c) => dist(c, decorColour) < 60 })?.share > 0;

  // A sidebar in its own colour.
  let sideBg = null;
  if (split) {
    const sx0 = split.side === "left" ? 0 : split.at, sx1 = split.side === "left" ? split.at : W;
    const d = dominant(data, W, { x0: sx0, x1: sx1, y0: H * 0.1, y1: H * 0.95, step: 8 });
    if (d && d.share > 0.45 && dist(d.colour, paper) > 30) sideBg = d.colour;
  }

  const fam = pdfFamily(first);
  const nameUpper = Boolean(nameRun?.length) && nameRun.every((w) => w.text === w.text.toUpperCase());
  return {
    width: W, height: H,
    split: split ? split.at / W : null, side: split?.side || null,
    sideBg: sideBg && hex(sideBg), sideDark: Boolean(sideBg && lumOf(sideBg) < 0.5),
    accent: nameInk ? hex(nameInk) : null,
    heading: headingInks.length ? hex(headingInks[0]) : null,
    decor: decorColour && hex(decorColour),
    band: band && band.share > 0.04 ? hex(band.colour) : null,
    topBar, photo, nameUpper,
    serif: fam.serif, font: fam.css,
    words: words.map((w) => ({ norm: w.norm, text: w.text, page: w.page, line: w.line, x: (w.box.x0 + w.box.x1) / 2 / W, y: (w.box.y0 + w.box.y1) / 2 / H, box: w.box })),
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
  const SIDE = /compet|skill|aptid|ferrament|tecnolog|idioma|lingua|language|interess|hobb|certif|contact|refer|softw|tools/i;
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
  return {
    two,
    side: layout.side,
    sideRatio: layout.side === "left" ? layout.split : 1 - layout.split,
    sections: two ? sections : sections.map(() => "main"),
    header: two ? where(full.name) || "main" : "main",
    contact: two && contactSide ? "side" : "header",
    photo: layout.photo ? { ...layout.photo, column: two ? col(layout.photo.x) : "main" } : null,
    // Without the name's own ink, it takes the headings' colour, as most designs do.
    accent: layout.accent || layout.heading, heading: layout.heading || layout.accent, decor: layout.decor, band: layout.band,
    sideBg: two ? layout.sideBg : null, sideDark: two && layout.sideDark,
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
