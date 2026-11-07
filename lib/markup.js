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
    // The same page drawn again at a higher resolution (the corrected CV is delivered at print quality).
    const hires = async (width) => {
      const vp = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const big = document.createElement("canvas");
      big.width = Math.round(vp.width);
      big.height = Math.round(vp.height);
      const bctx = big.getContext("2d");
      bctx.fillStyle = "#fff";
      bctx.fillRect(0, 0, big.width, big.height);
      await page.render({ canvas: big, canvasContext: bctx, viewport: vp }).promise;
      return big;
    };
    pages.push({ canvas, words, hires });
  }
  return pages;
}

/* ---------------- A CV that already has our pen on it ---------------- */
// The marked version, downloaded and attached again, comes with the slips, strikes and arrows of an earlier
// review. They go before anything is read: each slip (a small off-white card with green writing) is painted over
// with the colour around it, and the red and green pen strokes are filled in from the pixels just above and below.
// Returns how many slips were found (none: the page is left exactly as it was).
function scrubMarks(canvas) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const isPaper = (i) => d[i] >= 247 && d[i + 1] >= 244 && d[i + 1] <= 255 && d[i] - d[i + 2] >= 5 && d[i] - d[i + 2] <= 18 && Math.abs(d[i] - d[i + 1] - 3) <= 4;
  const isRed = (i) => d[i] > 140 && d[i] - d[i + 1] > 80 && d[i] - d[i + 2] > 70;
  const isGreen = (i) => d[i + 1] > 70 && d[i + 1] - d[i] > 40 && d[i + 1] - d[i + 2] > 12 && d[i] < 120;

  // 1. Slips: cells of 8×8 pixels that are mostly slip paper, grouped into blocks.
  const C = 8, cw = Math.ceil(W / C), ch = Math.ceil(H / C);
  const cell = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    let n = 0, k = 0;
    for (let y = cy * C; y < Math.min(H, cy * C + C); y += 2) for (let x = cx * C; x < Math.min(W, cx * C + C); x += 2) { n++; if (isPaper((y * W + x) * 4)) k++; }
    cell[cy * cw + cx] = k >= n * 0.4 ? 1 : 0;
  }
  const seen = new Uint8Array(cw * ch);
  const slips = [];
  for (let s = 0; s < cell.length; s++) {
    if (!cell[s] || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    let x0 = cw, y0 = ch, x1 = 0, y1 = 0, count = 0;
    while (stack.length) {
      const c = stack.pop(), cx = c % cw, cy = (c - cx) / cw;
      count++;
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      // neighbours, bridging one cell of writing
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const n = ny * cw + nx;
        if (cell[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    const box = { x0: x0 * C, y0: y0 * C, x1: Math.min(W, (x1 + 1) * C), y1: Math.min(H, (y1 + 1) * C) };
    const area = (box.x1 - box.x0) * (box.y1 - box.y0);
    // a slip is small, fairly full, and has green writing on it (a cream page or band is none of these)
    if (area > W * H * 0.2 || area < 900 || count * C * C < area * 0.35 || box.x1 - box.x0 < 40) continue;
    let green = 0;
    for (let y = box.y0; y < box.y1; y += 2) for (let x = box.x0; x < box.x1; x += 2) if (isGreen((y * W + x) * 4)) green++;
    if (green < area / 4 * 0.01) continue;
    slips.push(box);
  }
  if (!slips.length) return 0;

  // the colour around a box: the most common one on a ring just outside it
  const around = (b, pad) => {
    const ring = new Map();
    const add = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4;
      if (isPaper(i) || isRed(i) || isGreen(i)) return;
      const k = (d[i] >> 3) * 1024 + (d[i + 1] >> 3) * 32 + (d[i + 2] >> 3);
      const e = ring.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += d[i]; e.g += d[i + 1]; e.b += d[i + 2];
      ring.set(k, e);
    };
    for (let x = b.x0 - pad; x <= b.x1 + pad; x += 2) { add(x, b.y0 - pad); add(x, b.y1 + pad); }
    for (let y = b.y0 - pad; y <= b.y1 + pad; y += 2) { add(b.x0 - pad, y); add(b.x1 + pad, y); }
    let best = null;
    for (const e of ring.values()) if (!best || e.n > best.n) best = e;
    return best ? [best.r / best.n, best.g / best.n, best.b / best.n] : [255, 255, 255];
  };
  const pad = Math.round(W * 0.008);
  for (const b of slips) {
    const c = around(b, pad + 2);
    for (let y = Math.max(0, b.y0 - pad); y < Math.min(H, b.y1 + pad); y++) for (let x = Math.max(0, b.x0 - pad); x < Math.min(W, b.x1 + pad); x++) {
      const i = (y * W + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
  }

  // 2. Pen strokes (only on a page that had slips, so a CV's own red or green is never touched).
  const mask = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) if (isRed(p * 4) || isGreen(p * 4)) mask[p] = 1;
  // one pixel wider, for the soft edge of each stroke
  const wide = mask.slice();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x;
    if (mask[p]) { wide[p - 1] = 1; wide[p + 1] = 1; wide[p - W] = 1; wide[p + W] = 1; }
  }
  const R = Math.max(6, Math.round(W * 0.006));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (!wide[p]) continue;
    let up = -1, down = -1;
    for (let k = 1; k <= R; k++) { if (up < 0 && y - k >= 0 && !wide[p - k * W]) up = p - k * W; if (down < 0 && y + k < H && !wide[p + k * W]) down = p + k * W; if (up >= 0 && down >= 0) break; }
    const from = [up, down].filter((q) => q >= 0);
    if (!from.length) continue;
    const i = p * 4;
    for (let c = 0; c < 3; c++) d[i + c] = from.reduce((s, q) => s + d[q * 4 + c], 0) / from.length;
  }
  ctx.putImageData(img, 0, 0);
  return slips.length;
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
      // the marked version of an earlier review, attached again: its old marks go first
      const premarked = scrubMarks(canvas) > 0;
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      const words = [];
      (data.blocks || []).forEach((block, b) => block.paragraphs.forEach((para, pa) => para.lines.forEach((line, l) => {
        for (const word of line.words) words.push({ text: word.text, page: p, line: `${p}:${b}-${pa}-${l}`, box: word.bbox, conf: word.confidence });
      })));
      const hires = async (width) => {
        const w = Math.round(Math.max(WIDTH, Math.min(img.naturalWidth, width)));
        const big = document.createElement("canvas");
        big.width = w;
        big.height = Math.round(img.naturalHeight * (w / img.naturalWidth));
        const bctx = big.getContext("2d");
        bctx.imageSmoothingQuality = "high";
        bctx.drawImage(img, 0, 0, big.width, big.height);
        if (premarked) scrubMarks(big);
        return big;
      };
      pages.push({ canvas, words, hires, premarked });
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
  // The sheet's drop shadow (a darker band of the frame's grey) belongs to the frame, not to the sheet:
  // without this, a photo at the sheet's edge would come with a grey strip.
  const shadowy = (x, y) => { const i = (y * W + x) * 4; return dist([data[i], data[i + 1], data[i + 2]], bg) < 150; };
  const colShadow = (x) => { let n = 0, k = 0; for (let y = y0; y <= y1; y += 4) { n++; if (shadowy(x, y)) k++; } return k / n; };
  const rowShadow = (y) => { let n = 0, k = 0; for (let x = x0; x <= x1; x += 4) { n++; if (shadowy(x, y)) k++; } return k / n; };
  const mx = W * 0.03, my = H * 0.03;
  for (let k = 0; k < mx && colShadow(x0) > 0.6; k++) x0++;
  for (let k = 0; k < mx && colShadow(x1) > 0.6; k++) x1--;
  for (let k = 0; k < my && rowShadow(y0) > 0.6; k++) y0++;
  for (let k = 0; k < my && rowShadow(y1) > 0.6; k++) y1--;
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

  // Levels drawn as bars next to a skill or a language ("Photoshop ▮▮▮▮▯"): how full each bar is.
  // A bar is a solid run of one colour (maybe with a lighter track after it), as thick all along; letters aren't.
  const bgFor = (x) => (sideBg && split && x >= sideX0 && x <= sideX1 ? sideBg : paper);
  const px = (x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const inkAt = (x, yc) => { const hits = [yc - 2, yc, yc + 2].map((y) => px(x, y)).filter((c) => dist(c, bgFor(x)) >= 45); return hits.length >= 2 ? hits[0] : null; };
  // The bar's own thickness at a column: the unbroken run of ink through its middle row (not the bars around it).
  const thickness = (x, yc) => {
    const ink = (y) => dist(px(x, y), bgFor(x)) >= 45;
    if (!ink(yc)) return 0;
    let n = 1;
    for (let y = yc - 1; y > S.y0 && ink(y); y--) n++;
    for (let y = yc + 1; y < S.y1 && ink(y); y++) n++;
    return n;
  };
  // Where a solid run (a bar) starts inside a word's box: the photo reader reads bars as made-up words ("ua",
  // "m—"), sometimes glued to the real word before them.
  const solidFrom = (w) => {
    const yc = Math.round((w.box.y0 + w.box.y1) / 2), h = w.box.y1 - w.box.y0;
    let run = 0;
    for (let x = Math.ceil(w.box.x0); x < w.box.x1; x++) {
      if (inkAt(x, yc)) { if (++run >= h * 1.5) return x - run + 1; } else run = 0;
    }
    return null;
  };
  // A bar starting within `maxGap` of `from` on row `yc`: its fill and, after it, a lighter track (or none).
  // The fill's colour is read a little inside the bar (its first pixels are a soft edge, blended with the paper);
  // a new colour that holds for a few pixels is the track, and a pixel or two of a blend in between is an edge.
  const measureBar = (from, yc, h, maxGap) => {
    const limit = Math.min(S.x1 - 2, from + SW * 0.35);
    let x = from, gap = 0;
    while (x < limit && !inkAt(x, yc) && gap < maxGap) { x++; gap++; }
    if (x >= limit || gap >= maxGap) return null;
    const start = x, fillInk = inkAt(x + 2, yc) || inkAt(x, yc);
    let fill = 0, track = 0, trackInk = null, holes = 0, odd = 0;
    for (; x < limit; x++) {
      const c = inkAt(x, yc);
      if (!c) { if (++holes > 2) break; continue; }
      holes = 0;
      if (!trackInk && dist(c, fillInk) < 60) { fill = x - start + 1; odd = 0; continue; }
      if (trackInk && dist(c, trackInk) < 60) { track = x - start + 1 - fill; odd = 0; continue; }
      if (!trackInk && x - start > 3) {
        const next = [1, 2, 3].map((k) => inkAt(x + k, yc)).filter(Boolean);
        if (next.length >= 2 && next.every((n) => dist(n, c) < 60)) { trackInk = c; track = x - start + 1 - fill; odd = 0; continue; }
      }
      if (++odd > 2) break;
    }
    if (fill < 3) return null;
    // A bar is as thick all along (letters aren't), long for its thickness, and inside the page, not its edge.
    const ts = [0.2, 0.5, 0.8].map((k) => thickness(Math.round(start + fill * k), yc));
    const thick = Math.max(...ts);
    if (Math.min(...ts) < 2 || thick - Math.min(...ts) > 2 || thick > h * 1.6) return null;
    if (fill + track < Math.max(thick * 3, h * 1.2)) return null;
    if (start + fill + track >= S.x1 - 4 || yc + thick >= S.y1 - 2 || yc - thick <= S.y0 + 2) return null;
    return { start, fill, track };
  };
  const bars = [];
  // Rows of words by their height on the page (the photo reader can split one printed row into several lines).
  const rowsOfWords = [];
  for (const w of [...first].sort((a, b) => (a.box.y0 + a.box.y1) - (b.box.y0 + b.box.y1))) {
    const yc = (w.box.y0 + w.box.y1) / 2, h = w.box.y1 - w.box.y0, r = rowsOfWords.at(-1);
    if (r && Math.abs(r.yc - yc) < Math.max(4, Math.min(r.h, h) * 0.5)) r.ws.push(w); else rowsOfWords.push({ yc, h, ws: [w] });
  }
  for (const { ws } of rowsOfWords) {
    const real = [];
    for (const w of [...ws].sort((a, b) => a.box.x0 - b.box.x0)) {
      const s = solidFrom(w);
      if (s == null) real.push(w);
      else if (s - w.box.x0 > (w.box.y1 - w.box.y0) * 1.2) real.push({ ...w, box: { ...w.box, x1: s - 1 } });
    }
    // a printed line can hold two items ("Premiere Pro ▮▮▮   After Effect ▮▮"): split it at the wide gaps
    const groups = [];
    for (const w of real) {
      const g = groups.at(-1);
      if (g && w.box.x0 - g.at(-1).box.x1 < (w.box.y1 - w.box.y0) * 1.6) g.push(w); else groups.push([w]);
    }
    for (const group of groups) {
      // the photo reader often reads the bar itself as a made-up word, with low confidence: it isn't the item
      const g = [...group];
      while (g.length > 1 && g.at(-1).conf != null && g.at(-1).conf < 50) g.pop();
      if (g.length > 4 || (g[0].conf != null && g[0].conf < 30)) continue;
      const box = { x0: g[0].box.x0, x1: g.at(-1).box.x1, y0: Math.min(...g.map((w) => w.box.y0)), y1: Math.max(...g.map((w) => w.box.y1)) };
      const h = box.y1 - box.y0, yc = Math.round((box.y0 + box.y1) / 2);
      if (h < 4) continue;
      const bar = measureBar(Math.ceil(box.x1) + 2, yc, h, h * 8);
      if (!bar) continue;
      bars.push({ norm: g.map((w) => w.norm).join(""), fill: bar.fill / SW, total: bar.track > 2 ? (bar.fill + bar.track) / SW : null, x: (box.x0 - S.x0) / SW, y: (yc - S.y0) / SH, sx: bar.start, ix: box.x0, yc, h });
    }
  }
  // Bars whose item the reader missed (a word misread or skipped, like "Urdu"): bars of one list line up, at the
  // same start and evenly spaced, so the empty rows between them (and one row before or after) are looked at too.
  const clustersOf = () => {
    const cs = [];
    for (const b of bars) { const c = cs.find((k) => Math.abs(k[0].sx - b.sx) < 8); if (c) c.push(b); else cs.push([b]); }
    cs.forEach((c) => c.sort((a, b) => a.yc - b.yc));
    return cs;
  };
  const gapsOf = (c) => c.slice(1).map((b, i) => b.yc - c[i].yc).filter((d) => d > 0).sort((a, b) => a - b);
  // A bar found this way must look like the others of its list: the same kind (with a lighter track or without)
  // and a similar size, so a stray line or the page's edge is never taken for one.
  const probe = (sx, yc, h, ix, list) => {
    if (yc < S.y0 || yc > S.y1 || bars.some((b) => Math.abs(b.sx - sx) < 8 && Math.abs(b.yc - yc) < h * 0.6)) return;
    const bar = measureBar(sx - 4, Math.round(yc), h, 8);
    if (!bar || Math.abs(bar.start - sx) >= 6) return;
    const total = bar.track > 2 ? (bar.fill + bar.track) / SW : null;
    const tracked = list.filter((b) => b.total);
    if (tracked.length) {
      const typical = tracked.map((b) => b.total).sort((a, b) => a - b)[Math.floor(tracked.length / 2)];
      if (!total || Math.abs(total - typical) > typical * 0.15) return;
    } else if (total || bar.fill / SW > Math.max(...list.map((b) => b.fill)) * 1.6) return;
    bars.push({ norm: "", fill: bar.fill / SW, total, x: (ix - S.x0) / SW, y: (yc - S.y0) / SH, sx, ix, yc, h });
  };
  // 1. Every row of text that starts where the list's items start (and ends before its bars) may hold one more bar.
  for (const c of clustersOf()) {
    const ix = Math.min(...c.map((b) => b.ix)), h = c[0].h;
    for (const r of rowsOfWords) {
      if (r.yc < c[0].yc - SH * 0.12 || r.yc > c.at(-1).yc + SH * 0.12) continue;
      if (r.ws.some((w) => Math.abs(w.box.x0 - ix) < h * 2 && w.box.x1 < c[0].sx)) probe(c[0].sx, r.yc, h, ix, c);
    }
  }
  // 2. Then the list's own spacing (or, for a list of one, the spacing of the others): the rows in its gaps, and
  //    one row before and after it. Twice, so a bar found one row away leads to the next.
  for (let pass = 0; pass < 2; pass++) {
    const cs = clustersOf();
    const any = cs.flatMap(gapsOf).sort((a, b) => a - b)[0];
    for (const c of cs) {
      const step = gapsOf(c)[0] || any;
      if (!step) continue;
      for (let i = 1; i < c.length; i++) {
        const n = Math.round((c[i].yc - c[i - 1].yc) / step);
        for (let k = 1; k < n; k++) probe(c[0].sx, c[i - 1].yc + (k * (c[i].yc - c[i - 1].yc)) / n, c[0].h, c[0].ix, c);
      }
      probe(c[0].sx, c[0].yc - step, c[0].h, c[0].ix, c);
      probe(c[0].sx, c.at(-1).yc + step, c[0].h, c[0].ix, c);
    }
  }

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
    serif: fam.serif, font: fam.css, bars,
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
  // The items of a section: entry titles and lines, with "A · B · C" lists split up.
  const itemsOf = (s) => (s.entries || []).flatMap((e) => [e.title, ...(e.lines || [])]).filter(Boolean)
    .flatMap((l) => l.split(/\s+·\s+|\s*;\s*/)).flatMap((p) => (p.split(/,\s+/).every((x) => x.split(" ").length <= 4) ? p.split(/,\s+/) : [p]))
    .map((t) => t.trim()).filter(Boolean);
  // Each section sits in the column where its title was; without the title, where most of its content was.
  const sections = (full.sections || []).map((s) => {
    const found = where(s.title);
    if (found) return found;
    const votes = [...itemsOf(s), ...(s.entries || []).map((e) => e.subtitle)].filter((t) => t && t.length > 3).slice(0, 10).map(where).filter(Boolean);
    if (votes.length) return votes.filter((v) => v === "side").length > votes.length / 2 ? "side" : "main";
    return layout.split != null && SIDE.test(s.title) ? "side" : "main";
  });
  // Levels drawn as bars on the original: each skill or language keeps its own level.
  const bars = layout.bars || [];
  const levels = {};
  const taken = new Set();
  const barSections = (full.sections || []).map((s) => {
    const items = itemsOf(s);
    if (items.length < 2 || items.length > 16) return null;
    const found = items.map((it) => {
      const n = norm(it);
      return bars.find((b) => !taken.has(b) && (b.norm === n || (n.length >= 4 && (b.norm.includes(n) || n.includes(b.norm)) && Math.min(n.length, b.norm.length) / Math.max(n.length, b.norm.length) > 0.6))) || null;
    });
    const hits = found.filter(Boolean);
    if (!hits.length) return null;
    // An item the photo reader misread or skipped ("Urdu" read as "Sul") takes the unclaimed bar of the same list,
    // in order. A list counts as drawn with bars when most of its items end up with one.
    const lo = Math.min(...hits.map((b) => b.y)) - 0.06, hi = Math.max(...hits.map((b) => b.y)) + 0.06;
    const spare = bars.filter((b) => !taken.has(b) && !hits.includes(b) && b.y >= lo && b.y <= hi && col(b.x) === col(hits[0].x)).sort((a, b) => a.y - b.y || a.x - b.x);
    found.forEach((b, k) => { if (!b && spare.length) found[k] = spare.shift(); });
    const got = found.filter(Boolean);
    if (got.length < Math.max(2, Math.ceil(items.length * 0.6))) return null;
    got.forEach((b) => taken.add(b));
    const most = Math.max(...got.map((b) => b.fill));
    items.forEach((it, k) => { const b = found[k]; if (b) levels[norm(it)] = Math.max(0.08, Math.min(1, b.total ? b.fill / b.total : b.fill / most)); });
    return { track: got.some((b) => b.total) };
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
    levels, barSections,
  };
}

/* ---------------- The corrected CV: the same pages, with each new line set where the old one was ---------------- */
// Nothing else on the page changes: the photo, the columns, the colours, the bars and every other line stay
// exactly as they are. Each line the review rewrites is painted over with the colour behind it and the new
// text is set in its place, in the same column, the same ink and (near enough) the same type.
const median = (xs) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function cloneCanvas(c) {
  const k = document.createElement("canvas");
  k.width = c.width;
  k.height = c.height;
  k.getContext("2d").drawImage(c, 0, 0);
  return k;
}

// The words printed on one line next to each other (one column's part of a line that may span two).
function segmentAround(lineWords, anchor, gap) {
  const ws = [...lineWords].sort((a, b) => a.box.x0 - b.box.x0);
  const i = ws.indexOf(anchor);
  if (i < 0) return [anchor];
  let a = i, b = i;
  while (a > 0 && ws[a].box.x0 - ws[a - 1].box.x1 < gap) a--;
  while (b < ws.length - 1 && ws[b + 1].box.x0 - ws[b].box.x1 < gap) b++;
  return ws.slice(a, b + 1);
}

// A run of words is only safe to paint over when it is one block of body text: it covers the quote, sits in one
// column on consecutive lines, and its words are all about the same size. A title (bigger letters) at the start or
// the end of the run stays as it is. Anything else odd and the line is left alone: a correction missing is better
// than a page with text on top of text, a title wiped out or a line in another column.
function safeRun(run, quote) {
  const q = tokens(quote).length;
  if (!q || run.length < q * 0.7) return null;
  const hOf = (x) => x.box.y1 - x.box.y0;
  const lines = [];
  for (const w of run) {
    const last = lines.at(-1);
    if (last && last.id === w.line) last.ws.push(w); else lines.push({ id: w.line, ws: [w] });
  }
  for (const l of lines) {
    l.h = median(l.ws.map(hOf));
    l.x0 = Math.min(...l.ws.map((x) => x.box.x0));
    l.x1 = Math.max(...l.ws.map((x) => x.box.x1));
    l.y0 = Math.min(...l.ws.map((x) => x.box.y0));
  }
  const body = median(run.map(hOf)) || 1;
  while (lines.length > 1 && lines[0].h > body * 1.18) lines.shift();
  while (lines.length > 1 && lines.at(-1).h > body * 1.18) lines.pop();
  if (lines.some((l) => l.h > body * 1.25 || l.h < body * 0.72)) return null;
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1], b = lines[i];
    if (b.y0 - a.y0 > body * 2.6 || b.y0 < a.y0 - body * 0.3) return null;
    if (b.x0 > a.x1 || b.x1 < a.x0) return null;
  }
  const kept = lines.flatMap((l) => l.ws);
  return kept.length >= q * 0.6 ? kept : null;
}

function paintCorrections(pages, out, words, review) {
  // the words were read on the working pages; the sharp pages are k times bigger
  const scaled = words.map((w) => {
    const k = out[w.page].width / pages[w.page].canvas.width;
    return { ...w, size: w.size && w.size * k, baseline: w.baseline != null ? w.baseline * k : undefined, box: { x0: w.box.x0 * k, x1: w.box.x1 * k, y0: w.box.y0 * k, y1: w.box.y1 * k } };
  });
  words = scaled;
  const used = new Set();
  let fixed = 0;
  const unplaced = [];
  for (const w of review.rewrites || []) {
    const improved = String(w.improved || "").replace(/^[-•–*]\s*/, "").trim();
    if (!improved || !w.original) continue;
    // the same text can be on the CV more than once (a template repeats it in every entry): each rewrite takes the
    // next place that has not been rewritten yet, top to bottom
    const found = findWords(words.filter((x) => !used.has(x)), w.original);
    const run = found && safeRun(found, w.original);
    if (!run || run.some((x) => used.has(x))) { unplaced.push({ original: w.original, improved }); continue; }
    try {
      if (setLine(out[run[0].page], words.filter((x) => x.page === run[0].page), run, improved)) {
        run.forEach((x) => used.add(x));
        fixed++;
      } else unplaced.push({ original: w.original, improved });
    } catch (err) { console.warn("[cv corrigido]", err); unplaced.push({ original: w.original, improved }); }
  }
  // A photo of a CV keeps only the sheet (no desk or grey frame around it).
  const pagesOut = out.map((canvas) => {
    const W = canvas.width, H = canvas.height;
    const data = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const S = findSheet(data, W, H);
    if (S.x0 === 0 && S.y0 === 0 && S.x1 === W && S.y1 === H) return canvas;
    // Only a real frame goes (a desk, a grey border of another colour than the paper): white margins are the
    // page's own and stay.
    const frame = dominant(data, W, { x1: W, y1: H, step: 4, keep: (c, x, y) => x < 8 || y < 8 || x > W - 9 || y > H - 9 });
    const paper = dominant(data, W, { x0: S.x0, y0: S.y0, x1: S.x1, y1: S.y1, step: 6 });
    if (!frame || !paper || dist(frame.colour, paper.colour) < 60 || (S.x1 - S.x0) * (S.y1 - S.y0) < W * H * 0.5) return canvas;
    const k = document.createElement("canvas");
    k.width = S.x1 - S.x0;
    k.height = S.y1 - S.y0;
    k.getContext("2d").drawImage(canvas, S.x0, S.y0, k.width, k.height, 0, 0, k.width, k.height);
    return k;
  });
  return { pages: pagesOut, fixed, unplaced };
}

function setLine(canvas, pageWords, run, improved) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const W = canvas.width, H = canvas.height;
  const hOf = (x) => x.box.y1 - x.box.y0;
  const h = median(run.map(hOf)) || 20;

  // The printed lines the quote is on, in its column only.
  const lineIds = [...new Set(run.map((x) => x.line))];
  const segs = lineIds.map((id) => segmentAround(pageWords.filter((x) => x.line === id), run.find((x) => x.line === id), h * 2.2));
  const inRun = new Set(run);
  const before = segs[0].filter((x) => !inRun.has(x) && x.box.x1 <= run[0].box.x0 + 1).map((x) => x.text).join(" ");
  const after = segs.at(-1).filter((x) => !inRun.has(x) && x.box.x0 >= run.at(-1).box.x1 - 1).map((x) => x.text).join(" ");
  // what is left of the old line next to the quote stays only when it is a real piece of sentence, not a stray word
  const keep = (t) => (t.split(/\s+/).filter(Boolean).length >= 3 ? t : "");
  const text = [keep(before), improved, keep(after)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const all = segs.flat();
  let x0 = Math.min(...all.map((x) => x.box.x0));
  const top = Math.min(...all.map((x) => x.box.y0));
  const bottom = Math.max(...all.map((x) => x.box.y1));

  // The column around it: the lines just above and below that start at the same left edge give its width
  // and the spacing between lines.
  const nearLines = new Map();
  for (const x of pageWords) {
    if (x.box.y1 < top - h * 8 || x.box.y0 > bottom + h * 8) continue;
    if (!nearLines.has(x.line)) nearLines.set(x.line, []);
    nearLines.get(x.line).push(x);
  }
  const column = [];
  for (const ws of nearLines.values()) {
    const sorted = ws.sort((a, b) => a.box.x0 - b.box.x0);
    const start = sorted.find((x) => Math.abs(x.box.x0 - x0) < h * 1.6);
    if (!start) continue;
    const seg = segmentAround(sorted, start, h * 2.2);
    column.push({ x1: Math.max(...seg.map((x) => x.box.x1)), y0: Math.min(...seg.map((x) => x.box.y0)), h: median(seg.map(hOf)) });
  }
  const similarSize = column.filter((c) => c.h > h * 0.75 && c.h < h * 1.3);
  const x1 = Math.min(W - 4, Math.max(...all.map((x) => x.box.x1), ...similarSize.map((c) => c.x1)));
  const ys = [...new Set(similarSize.map((c) => Math.round(c.y0)))].sort((a, b) => a - b);
  const gaps = ys.slice(1).map((y, i) => y - ys[i]).filter((g) => g > h * 1.05 && g < h * 2.6);
  // the spacing between lines, kept to what a line of this size can really have
  const pitch = Math.min(h * 2.2, Math.max(h * 1.05, segs.length > 1
    ? (Math.min(...segs.at(-1).map((x) => x.box.y0)) - Math.min(...segs[0].map((x) => x.box.y0))) / (segs.length - 1)
    : median(gaps) || h * 1.45));

  // Free lines right below the paragraph (nothing printed there in this column) can take a longer text.
  let room = segs.length;
  for (let k = 1; k <= 2; k++) {
    const y = bottom + pitch * k;
    if (y + h > H) break;
    const busy = pageWords.some((x) => x.box.x1 > x0 - h && x.box.x0 < x1 + h && x.box.y1 > y - pitch * 0.9 && x.box.y0 < y + h * 0.2);
    if (busy) break;
    room++;
  }

  // The colours: the ink of the old words, and the colour right behind them.
  const data = ctx.getImageData(0, 0, W, H).data;
  const boxes = segs.map((s) => ({ x0: Math.min(...s.map((x) => x.box.x0)), x1: Math.max(...s.map((x) => x.box.x1)), y0: Math.min(...s.map((x) => x.box.y0)), y1: Math.max(...s.map((x) => x.box.y1)) }));
  const bg = dominant(data, W, { x0: Math.max(0, x0 - h), y0: Math.max(0, top - h * 0.6), x1: Math.min(W, x1 + h), y1: Math.min(H, bottom + h * 0.6), step: 2 })?.colour || [255, 255, 255];
  let ink = inkOf(data, W, boxes) || (lumOf(bg) < 0.5 ? [245, 245, 245] : [30, 30, 30]);
  // In a small or blurry picture the letters' soft edges make the ink look paler than it is: push it back towards
  // the contrast the printed text really has, so the new line is not greyer than its neighbours.
  if (lumOf(bg) >= 0.5 && lumOf(ink) > 0.22) ink = ink.map((v) => v * 0.6);
  else if (lumOf(bg) < 0.5 && lumOf(ink) < 0.8) ink = ink.map((v) => v + (255 - v) * 0.5);
  const rgb = (c) => `rgb(${c.map(Math.round).join(",")})`;
  // A short glyph right before the first word that the reader skipped (an "I", a quote mark) belongs to the old
  // line too: it goes with it, and the new text starts where it was.
  {
    const b = boxes[0];
    // the rows with ink in one column of pixels (or null)
    const inkAt = (x) => {
      let lo = -1, hi = -1;
      for (let y = Math.max(0, Math.floor(b.y0)); y < Math.min(H, b.y1); y++) { const i = (y * W + x) * 4; if (dist([data[i], data[i + 1], data[i + 2]], bg) > 140) { if (lo < 0) lo = y; hi = y; } }
      return lo < 0 ? null : [lo, hi];
    };
    let x = Math.floor(b.x0) - 1, last = b.x0, lo = Infinity, hi = -Infinity;
    while (x > 0 && last - x < h * 0.75 && b.x0 - x < h * 1.4) { const r = inkAt(x); if (r) { last = x; lo = Math.min(lo, r[0]); hi = Math.max(hi, r[1]); } x--; }
    // a letter is about as tall as the words; a bullet or a dash is not, and stays
    // nor is a vertical rule (a timeline beside the text), which runs on above or below the line
    const inkPx = (px, py) => { if (py < 0 || py >= H) return false; const i = (Math.round(py) * W + px) * 4; return dist([data[i], data[i + 1], data[i + 2]], bg) > 140; };
    let rule = false;
    for (let px = last; px < b.x0 && !rule; px++) rule = inkPx(px, b.y0 - h * 0.45) || inkPx(px, b.y1 + h * 0.45);
    if (last < b.x0 - 1 && hi - lo >= h * 0.55 && !rule) { b.x0 = last; x0 = Math.min(x0, last); }
  }

  // The type: the PDF's own font when it has one; for a photo, a plain sans whose size is set so that the old
  // line, written in it, would be as wide as it is on the page.
  const font = run.map((x) => x.font).find(Boolean);
  const pdfFamilyName = run[0].family && run[0].family !== "sans-serif" ? run[0].family : "";
  const family = font?.css ? `${font.css}, ${run[0].family || "sans-serif"}` : (pdfFamilyName || 'Arial, "Helvetica Neue", Helvetica, sans-serif');
  const weight = font?.weight || 400;
  const italic = font?.italic ? "italic " : "";
  const fontAt = (px) => `${italic}${weight} ${px}px ${family}`;
  let size = run[0].size || h * 1.2;
  const sample = segs[0];
  const sampleText = sample.map((x) => x.text).join(" ");
  const sampleW = Math.max(...sample.map((x) => x.box.x1)) - Math.min(...sample.map((x) => x.box.x0));
  if (!run[0].size && sampleText.length >= 12) {
    ctx.font = fontAt(100);
    const per = ctx.measureText(sampleText).width / 100;
    if (per > 0) size = Math.min(h * 1.6, Math.max(h * 0.85, sampleW / per));
  }
  size = Math.min(size, pitch * 0.95);

  // Wrapped to the column; a little smaller when it would need more lines than there are.
  const width = x1 - x0;
  const fit = (least) => {
    let s = size, lines;
    for (; ; s *= 0.96) {
      ctx.font = fontAt(s);
      lines = wrap(ctx, text, width);
      if (lines.length <= room || s < size * least) break;
    }
    return { s, lines };
  };
  // First the same type, barely smaller; when the new text still needs more lines, what follows in this column
  // moves down to make room (the way it would in a document), if there is blank space at the foot of the page.
  let { s, lines } = fit(0.97);
  if (lines.length > room) {
    // the column moves anyway, so the new line keeps the full size of the old one
    s = size;
    ctx.font = fontAt(s);
    lines = wrap(ctx, text, width);
    const extra = (lines.length - room) * pitch;
    let colL = Math.max(0, x0 - h * 1.6);
    let colR = Math.min(W, x1 + h * 0.6);
    // the whole column moves, from its own left edge (headings and bullets start further left than the text)
    let below = pageWords.filter((x) => x.box.y0 > bottom && x.box.x1 > colL && x.box.x0 < colR);
    if (below.length) colL = Math.max(0, Math.min(colL, ...below.map((x) => x.box.x0)) - h * 0.8);
    let end = below.length ? Math.max(...below.map((x) => x.box.y1)) + h * 0.6 : bottom;
    // Something below runs past the right edge (cards side by side, say) and nothing is printed to the right of
    // the paragraph itself: that space is still this column, so everything to the page's edge moves together.
    const wider = pageWords.some((x) => x.box.y0 > bottom && x.box.y1 < end && x.box.x0 < colR && x.box.x1 > colR);
    const rightFree = !pageWords.some((x) => x.box.x0 >= colR && x.box.y1 > top - h && x.box.y0 < bottom + h);
    if (wider && rightFree) {
      colR = W;
      below = pageWords.filter((x) => x.box.y0 > bottom && x.box.x1 > colL);
      end = below.length ? Math.max(...below.map((x) => x.box.y1)) + h * 0.6 : bottom;
    }
    const from = bottom + Math.max(2, Math.min(h * 0.35, (pitch - h) / 2));
    // Only a column with clean edges moves: a word, a card or a line crossing either edge would be cut in half.
    const crosses = (edge) => {
      if (pageWords.some((x) => x.box.y0 > bottom && x.box.y1 < end && x.box.x0 < edge && x.box.x1 > edge)) return true;
      const px = Math.round(Math.min(W - 1, Math.max(0, edge)));
      let ink = 0, n = 0;
      for (let y = Math.round(from); y < Math.min(H, end); y += 2) {
        n++;
        const i = (y * W + px) * 4;
        if (dist([data[i], data[i + 1], data[i + 2]], bg) > 60) ink++;
      }
      return n > 0 && ink / n > 0.02;
    };
    if (end + extra < H - h * 2 && end > from && !crosses(colL) && (colR >= W || !crosses(colR))) {
      const strip = document.createElement("canvas");
      strip.width = Math.round(colR - colL);
      strip.height = Math.round(end - from);
      strip.getContext("2d").drawImage(canvas, colL, from, strip.width, strip.height, 0, 0, strip.width, strip.height);
      ctx.fillStyle = rgb(bg);
      ctx.fillRect(colL, from, strip.width, strip.height + extra);
      ctx.drawImage(strip, colL, from + extra);
      for (const x of below) { x.box = { ...x.box, y0: x.box.y0 + extra, y1: x.box.y1 + extra }; if (x.baseline != null) x.baseline += extra; }
      room = lines.length;
    } else ({ s, lines } = fit(0.8));
  }
  if (lines.length > room) return false;
  const step = pitch * Math.max(0.85, s / size);

  // The old words go...
  ctx.fillStyle = rgb(bg);
  const padY = Math.max(2, Math.min(h * 0.35, (pitch - h) / 2));
  const padX = Math.max(3, h * 0.22);
  for (const b of boxes) ctx.fillRect(b.x0 - padX, b.y0 - padY, b.x1 - b.x0 + padX * 2, b.y1 - b.y0 + padY * 2);
  // ...and the new ones go on the same baselines.
  const baseOf = (seg) => seg[0].baseline ?? median(seg.map((x) => x.box.y1)) - h * 0.04;
  const base0 = baseOf(segs[0]);
  ctx.textBaseline = "alphabetic";
  ctx.font = fontAt(s);
  lines.forEach((line, i) => {
    const y = base0 + i * step;
    // a line past the old paragraph goes on a clean strip of the background
    if (i >= segs.length) { ctx.fillStyle = rgb(bg); ctx.fillRect(x0 - 3, y - s * 0.95, width + 6, s * 1.25); }
    ctx.fillStyle = rgb(ink);
    ctx.fillText(line, x0, y);
  });
  return true;
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
  // How an applicant-tracking system reads the PDF: its words come in the file's own order, so with two columns
  // the order shows whether they are read one after the other or mixed line by line.
  let ats = null;
  if (pdf) {
    let switches = 0;
    const split = layout?.split;
    if (split != null) {
      const W0 = pages[0].canvas.width;
      let side = null;
      for (const w of words) {
        if (w.page !== 0) break;
        const s = (w.box.x0 + w.box.x1) / 2 / W0 < split ? "L" : "R";
        if (side && s !== side) switches++;
        side = s;
      }
    }
    ats = { columns: split != null, switches };
  }
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

  let corrected = { pages: [], fixed: 0, unplaced: [] };
  try {
    // The corrected CV is set on fresh, sharp copies of the pages: print quality on a computer, a little less
    // on a phone (whose browser has less memory for pictures).
    onStep?.("A escrever o CV corrigido em alta qualidade");
    const sharp = matchMedia("(pointer: coarse)").matches ? 2000 : 2480;
    const clean = [];
    for (const page of pages) clean.push(page.hires ? await page.hires(sharp) : cloneCanvas(page.canvas));
    corrected = paintCorrections(pages, clean, words, review);
  } catch (err) { console.warn("[cv corrigido]", err); }

  return { pages: pages.map((p) => p.canvas), marks, layout, corrected: corrected.pages, fixed: corrected.fixed, unplaced: corrected.unplaced, premarked: pages.some((p) => p.premarked), ats };
}
