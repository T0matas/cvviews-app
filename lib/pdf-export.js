// Builds real PDF files in the browser, so "Descarregar em PDF" saves a file instead of opening the print window.
// Two kinds: pages that are pictures (the CV corrected in place) and a CV written out as text.

const A4 = [595.28, 841.89];
const enc = new TextEncoder();

// Assembles the numbered objects into a PDF file. Each object is a string, or [dict, bytes] for a stream.
function assemble(objects) {
  const parts = [];
  let size = 0;
  const push = (p) => { const b = typeof p === "string" ? enc.encode(p) : p; parts.push(b); size += b.length; };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(size);
    push(`${i + 1} 0 obj\n`);
    if (Array.isArray(o)) { push(`${o[0].replace(">>", ` /Length ${o[1].length} >>`)}\nstream\n`); push(o[1]); push("\nendstream"); }
    else push(o);
    push("\nendobj\n");
  });
  const xref = size;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}

export function savePdf(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `${name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "CV"}.pdf` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const loadImage = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
const bytesOf = (dataUrl) => Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));

// One A4 page per JPEG data URL, each picture as large as fits, centred.
export async function imagesPdf(srcs) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", ""];
  const kids = [];
  for (const src of srcs) {
    const img = await loadImage(src);
    const [W, H] = A4;
    const k = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    const n = objects.length;
    objects.push([`<< /Type /XObject /Subtype /Image /Width ${img.naturalWidth} /Height ${img.naturalHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode >>`, bytesOf(src)]);
    objects.push(["<< >>", enc.encode(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${((W - w) / 2).toFixed(2)} ${((H - h) / 2).toFixed(2)} cm /Im Do Q`)]);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`);
    kids.push(`${n + 3} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  return assemble(objects);
}

/* ---- A CV written out as text: real, selectable text that applicant-tracking systems can read ---- */

// The built-in PDF fonts speak Windows-1252; the few characters it places below 0xA0 are mapped here.
const CP1252 = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99 };
function pdfString(s) {
  const out = [0x28];
  for (const ch of s) {
    let c = CP1252[ch] ?? ch.codePointAt(0);
    if (c > 0xff || (c >= 0x80 && c < 0xa0 && !Object.values(CP1252).includes(c))) c = 0x3f;
    if (c === 0x28 || c === 0x29 || c === 0x5c) out.push(0x5c);
    out.push(c);
  }
  out.push(0x29);
  return out;
}

const FONTS = { r: ["F1", "Helvetica"], b: ["F2", "Helvetica-Bold"], i: ["F3", "Helvetica-Oblique"] };
const measure = (() => {
  const ctx = document.createElement("canvas").getContext("2d");
  return (text, size, style = "r") => {
    ctx.font = `${style === "b" ? "bold " : style === "i" ? "italic " : ""}${size}px Helvetica, Arial, sans-serif`;
    return ctx.measureText(text).width;
  };
})();
function wrap(text, size, style, width) {
  const lines = [];
  let line = "";
  // A word wider than the column (a long link or email) is split, so it never runs off the page.
  const words = [];
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    let rest = w;
    while (measure(rest, size, style) > width && rest.length > 1) {
      let n = rest.length - 1;
      while (n > 1 && measure(rest.slice(0, n), size, style) > width) n--;
      words.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    words.push(rest);
  }
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, size, style) > width) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// doc = { name, headline, contact[], sections[{ title, entries[{ title, subtitle, dates, lines[] }] }] }
// accent is a "#rrggbb" colour for the name and section titles.
export function textPdf(doc, accent = "#1a1a1a") {
  const [W, H] = A4;
  const M = 45, inner = W - 2 * M;
  const rgb = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
  const pages = [];
  let ops, y;
  const newPage = () => { ops = []; pages.push(ops); y = H - M; };
  const text = (s, x, size, style = "r", colour = "#1a1a1a") => {
    ops.push(enc.encode(`BT /${FONTS[style][0]} ${size} Tf ${rgb(colour)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td `), new Uint8Array(pdfString(s)), enc.encode(" Tj ET\n"));
  };
  const rule = (colour) => ops.push(enc.encode(`${rgb(colour)} RG 0.8 w ${M} ${y.toFixed(2)} m ${W - M} ${y.toFixed(2)} l S\n`));
  newPage();

  // The header
  wrap(doc.name || "", 22, "b", inner).forEach((l, i) => { y -= i ? 24 : 22; text(l, M, 22, "b", accent); });
  if (doc.headline) wrap(doc.headline, 12, "r", inner).forEach((l, i) => { y -= i ? 15 : 18; text(l, M, 12, "r", "#333333"); });
  if (doc.contact?.length) for (const l of wrap(doc.contact.join("  ·  "), 9.5, "r", inner)) { y -= 14; text(l, M, 9.5, "r", "#555555"); }

  for (const s of doc.sections || []) {
    // An entry is laid out first, so it moves to the next page whole rather than being cut in two.
    const blocks = (s.entries || []).map((e) => {
      const rows = [];
      // The title wraps before it reaches the dates, so the two never run into each other.
      if (e.title || e.dates) {
        const datesW = e.dates ? measure(e.dates, 9.5) + 14 : 0;
        const titleLines = e.title ? wrap(e.title, 10.5, "b", inner - datesW) : [""];
        titleLines.forEach((l, i) => rows.push({ h: 14, draw: () => { text(l, M, 10.5, "b"); if (i === 0 && e.dates) text(e.dates, W - M - measure(e.dates, 9.5), 9.5, "r", "#555555"); } }));
      }
      if (e.subtitle) wrap(e.subtitle, 9.5, "i", inner).forEach((l) => rows.push({ h: 13, draw: () => text(l, M, 9.5, "i", "#444444") }));
      const lines = e.lines || [];
      const plain = !e.title && lines.length === 1;
      for (const line of lines) {
        wrap(line, 10, "r", plain ? inner : inner - 12).forEach((l, i) => {
          rows.push({ h: 13.5, draw: () => { if (!plain && i === 0) text("•", M + 2, 10); text(l, plain ? M : M + 12, 10); } });
        });
      }
      return { h: rows.reduce((t, r) => t + r.h, 0) + 8, rows };
    });
    const head = 30;
    if (y - head - (blocks[0]?.h || 0) < M) newPage();
    y -= 20; text(String(s.title || "").toUpperCase(), M, 10.5, "b", accent);
    y -= 5; rule(accent);
    y -= 2;
    for (const b of blocks) {
      if (y - b.h < M && b.h < H - 2 * M) newPage();
      y -= 6;
      for (const r of b.rows) { if (y - r.h < M) newPage(); y -= r.h; r.draw(); }
    }
  }

  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", ""];
  for (const [, base] of Object.values(FONTS)) objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`);
  const fonts = Object.values(FONTS).map(([id], i) => `/${id} ${i + 3} 0 R`).join(" ");
  const kids = [];
  for (const p of pages) {
    const body = new Uint8Array(p.reduce((t, b) => t + b.length, 0));
    p.reduce((at, b) => (body.set(b, at), at + b.length), 0);
    const n = objects.length;
    objects.push(["<< >>", body]);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << ${fonts} >> >> /Contents ${n + 1} 0 R >>`);
    kids.push(`${n + 2} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  return assemble(objects);
}

/* ---- The corrected CV in the original's design: its columns, colours, photo and chips ---- */
// style = the CvStyle from markup.js styleFor(); doc = the tidied FullCv. Laid out row by row, so a row
// that doesn't fit moves to the next page whole, and nothing is ever drawn on top of anything else.
export async function styledPdf(doc, st) {
  const [W, H] = A4;
  const serif = Boolean(st.serif);
  const F = serif ? { r: "Times-Roman", b: "Times-Bold", i: "Times-Italic" } : { r: "Helvetica", b: "Helvetica-Bold", i: "Helvetica-Oblique" };
  const ID = { r: "F1", b: "F2", i: "F3" };
  const mctx = document.createElement("canvas").getContext("2d");
  const m = (text, size, style = "r") => {
    mctx.font = `${style === "b" ? "bold " : style === "i" ? "italic " : ""}${size}px ${serif ? "'Times New Roman', Times, serif" : "Helvetica, Arial, sans-serif"}`;
    return mctx.measureText(text).width;
  };
  // Wraps to the width; a word wider than the column (a long link) is split, so nothing runs off the page.
  const wr = (text, size, style, width) => {
    const out = [];
    let line = "";
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
      let w = word;
      while (m(w, size, style) > width && w.length > 1) {
        let n = w.length - 1;
        while (n > 1 && m(w.slice(0, n), size, style) > width) n--;
        if (line) { out.push(line); line = ""; }
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      const next = line ? `${line} ${w}` : w;
      if (line && m(next, size, style) > width) { out.push(line); line = w; } else line = next;
    }
    if (line) out.push(line);
    return out;
  };
  const valid = (h) => /^#[0-9a-f]{6}$/i.test(h || "");
  const rgbOf = (h, fallback) => { const c = valid(h) ? h : fallback; return [1, 3, 5].map((i) => (parseInt(c.slice(i, i + 2), 16) / 255).toFixed(3)).join(" "); };
  const mix = (h, t) => { const c = valid(h) ? h : "#1a1a1a"; return "#" + [1, 3, 5].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * t + 255 * (1 - t)).toString(16).padStart(2, "0")).join(""); };
  const heading = st.heading || st.accent || "#1a1a1a", accent = st.accent || heading, decor = st.decor || heading;
  const band = st.band || mix(decor, 0.1);
  const dark = Boolean(st.sideDark);

  const pages = [];
  const page = (n) => { while (pages.length <= n) pages.push([]); return pages[n]; };
  const op = (o, s) => o.push(typeof s === "string" ? enc.encode(s) : s);
  const T = (o, s, x, y, size, style = "r", colour = "#2b2b2b", spacing = 0) => {
    op(o, `BT /${ID[style]} ${size} Tf ${rgbOf(colour, "#2b2b2b")} rg ${spacing ? `${spacing} Tc ` : ""}${x.toFixed(2)} ${(H - y).toFixed(2)} Td `);
    op(o, new Uint8Array(pdfString(s)));
    op(o, ` Tj${spacing ? " 0 Tc" : ""} ET\n`);
  };
  const R = (o, x, y, w, h, colour) => op(o, `${rgbOf(colour, "#eeeeee")} rg ${x.toFixed(2)} ${(H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`);
  const L = (o, x0, y0, x1, y1, colour, width = 0.6) => op(o, `${rgbOf(colour, "#dddddd")} RG ${width} w ${x0.toFixed(2)} ${(H - y0).toFixed(2)} m ${x1.toFixed(2)} ${(H - y1).toFixed(2)} l S\n`);

  // The photo, once, as a JPEG image; round photos are clipped to a circle.
  let photo = null;
  if (st.photo?.src) {
    try { const img = await loadImage(st.photo.src); photo = { w: img.naturalWidth, h: img.naturalHeight, bytes: bytesOf(st.photo.src), round: st.photo.round }; } catch { photo = null; }
  }
  const f2 = (n) => n.toFixed(2);
  const drawPhoto = (o, x, y, size) => {
    const r = size / 2, k = 0.5523 * r, cx = x + r, cy = H - y - r;
    op(o, "q ");
    if (photo.round) {
      op(o, `${f2(cx + r)} ${f2(cy)} m ${f2(cx + r)} ${f2(cy + k)} ${f2(cx + k)} ${f2(cy + r)} ${f2(cx)} ${f2(cy + r)} c `
        + `${f2(cx - k)} ${f2(cy + r)} ${f2(cx - r)} ${f2(cy + k)} ${f2(cx - r)} ${f2(cy)} c `
        + `${f2(cx - r)} ${f2(cy - k)} ${f2(cx - k)} ${f2(cy - r)} ${f2(cx)} ${f2(cy - r)} c `
        + `${f2(cx + k)} ${f2(cy - r)} ${f2(cx + r)} ${f2(cy - k)} ${f2(cx + r)} ${f2(cy)} c W n `);
    }
    op(o, `${f2(size)} 0 0 ${f2(size)} ${f2(x)} ${f2(H - y - size)} cm /Im1 Do Q\n`);
  };

  // The columns.
  const bar = st.topBar ? 9 : 0;
  const top = bar + 34, bottom = H - 36;
  const ratio = Math.min(0.44, Math.max(0.3, st.sideRatio || 0.36));
  const sw = W * ratio;
  const cols = {};
  if (st.two) {
    const sideX0 = st.side === "left" ? 0 : W - sw;
    const mainX0 = st.side === "left" ? sw : 0;
    cols.side = { x: sideX0 + 22, w: sw - 44, page: 0, y: top, side: true };
    cols.main = { x: mainX0 + 28, w: W - sw - 56, page: 0, y: top, side: false };
  } else cols.main = { x: 42, w: W - 84, page: 0, y: top, side: false };

  // Rows go down a column; a group of rows that fits on one page is kept together.
  const place = (col, rows) => {
    const total = rows.reduce((s, r) => s + r.h, 0);
    if (col.y + total > bottom && total <= bottom - top && col.y > top + 1) { col.page++; col.y = top; }
    for (const r of rows) {
      if (col.y + r.h > bottom && col.y > top + 1) { col.page++; col.y = top; }
      r.draw(page(col.page), col.x, col.y, col.w);
      col.y += r.h;
    }
  };
  const gap = (h) => ({ h, draw: () => {} });
  const ink = (col) => (col.side && dark ? "#f2f2f2" : "#2b2b2b");
  const muted = (col) => (col.side && dark ? "#d0d0d0" : "#666666");
  const head = (col) => (col.side && dark ? "#ffffff" : heading);
  const bandOf = (col) => (col.side && dark ? mix("#ffffff", 0.15) : band);

  const headerRows = (col) => {
    const rows = [];
    const one = !st.two;
    const withPhoto = Boolean(photo) && st.photo?.column === (st.two ? st.header : "main");
    const ps = 78;
    const textX = one && withPhoto ? ps + 18 : 0;
    const tw = col.w - textX;
    const name = st.nameUpper ? String(doc.name || "").toUpperCase() : doc.name || "";
    const nameLines = wr(name, 22, "b", tw);
    const roleLines = doc.headline ? wr(doc.headline, 12.5, "r", tw) : [];
    const contactLines = st.contact === "header" && doc.contact?.length ? wr(doc.contact.join("  ·  "), 9, "r", tw) : [];
    const textH = nameLines.length * 25 + roleLines.length * 16 + (contactLines.length ? 6 + contactLines.length * 12.5 : 0);
    if (withPhoto && !one && st.photo.bleed) {
      // edge to edge across the top of its column, as on the original
      const edge = st.side === "left" ? 0 : W - sw, ph = sw / (st.photo.aspect || 1);
      rows.push({ h: Math.max(0, bar + ph - top) + 22, draw: (o) => op(o, `q ${f2(sw)} 0 0 ${f2(ph)} ${f2(edge)} ${f2(H - bar - ph)} cm /Im1 Do Q
`) });
    } else if (withPhoto && !one) rows.push({ h: ps + 16, draw: (o, x, y) => drawPhoto(o, x, y, ps) });
    const h = Math.max(textH, one && withPhoto ? ps : 0) + 6;
    rows.push({ h, draw: (o, x, y) => {
      if (one && withPhoto) drawPhoto(o, x, y + Math.max(0, (h - 6 - ps) / 2), ps);
      let yy = y + Math.max(0, one && withPhoto ? (ps - textH) / 2 : 0);
      nameLines.forEach((l) => { yy += 22; T(o, l, x + textX, yy, 22, "b", col.side && dark ? "#ffffff" : accent); yy += 3; });
      roleLines.forEach((l) => { yy += 15; T(o, l, x + textX, yy, 12.5, "r", col.side && dark ? "#e6e6e6" : decor); yy += 1; });
      if (contactLines.length) { yy += 6; contactLines.forEach((l) => { yy += 12.5; T(o, l, x + textX, yy, 9, "r", muted(col)); }); }
    } });
    return rows;
  };
  const sectionHead = (col, title) => (st.headingUpper === false
    ? { h: 38, draw: (o, x, y) => { T(o, String(title), x, y + 20, 14, "b", head(col)); L(o, x, y + 28, x + 24, y + 28, head(col), 1.6); } }
    : { h: 30, draw: (o, x, y, w) => { T(o, String(title).toUpperCase(), x, y + 18, 10, "b", head(col), 1); L(o, x, y + 24, x + w, y + 24, mix(head(col), 0.25)); } });
  const entryRows = (col, e, sectionTitle) => {
    const rows = [];
    const w = col.w;
    if (e.title) {
      const tl = wr(e.title, 10.5, "b", w - 12);
      tl.forEach((l, i) => {
        const last = i === tl.length - 1;
        rows.push({ h: last ? 19 : 14, draw: (o, x, y) => { R(o, x, y, w, last ? 17 : 14, bandOf(col)); T(o, l, x + 6, y + 12, 10.5, "b", head(col)); } });
      });
    }
    const meta = [e.subtitle, e.dates].filter(Boolean).join(" | ");
    if (meta) wr(meta, 9, "r", w - 12).forEach((l) => rows.push({ h: 13, draw: (o, x, y) => T(o, l, x + 6, y + 10, 9, "r", muted(col)) }));
    const lines = e.lines || [];
    const paragraph = !e.title && lines.length === 1;
    const boxed = paragraph && col.side && /perfil|profile|resumo|summary|sobre|about/i.test(sectionTitle);
    if (paragraph) {
      const ls = wr(lines[0], 9.5, "r", w - (boxed ? 16 : 0));
      ls.forEach((l, i) => {
        const pad = boxed ? (i === 0 ? 5 : 0) + (i === ls.length - 1 ? 5 : 0) : 0;
        rows.push({ h: 13.5 + pad, draw: (o, x, y) => {
          if (boxed) R(o, x, y, w, 13.5 + pad, bandOf(col));
          T(o, l, x + (boxed ? 8 : 0), y + 10 + (boxed && i === 0 ? 5 : 0), 9.5, "r", ink(col));
        } });
      });
    } else {
      if (lines.length) rows.push(gap(3));
      for (const line of lines) {
        wr(line, 9.5, "r", w - 18).forEach((l, i) => rows.push({ h: 13.5, draw: (o, x, y) => {
          if (i === 0) T(o, "•", x + 7, y + 10, 9.5, "r", muted(col));
          T(o, l, x + 18, y + 10, 9.5, "r", ink(col));
        } }));
      }
    }
    rows.push(gap(9));
    return rows;
  };
  const chipRows = (col, items) => {
    const rows = [];
    let line = [], used = 0;
    const flush = () => {
      if (!line.length) return;
      const these = line;
      rows.push({ h: 22, draw: (o, x, y) => { let xx = x; for (const c of these) { R(o, xx, y, c.w, 17, bandOf(col)); T(o, c.t, xx + 6, y + 12, 9, "r", ink(col)); xx += c.w + 5; } } });
      line = []; used = 0;
    };
    for (const t of items) {
      const cw = Math.min(col.w, m(t, 9) + 12);
      if (used + cw > col.w) flush();
      line.push({ t: cw === col.w ? wr(t, 9, "r", col.w - 12)[0] : t, w: cw });
      used += cw + 5;
    }
    flush();
    rows.push(gap(6));
    return rows;
  };
  const contactRows = (col) => doc.contact.flatMap((c) => wr(c, 9, "r", col.w - 14).map((l, i) => ({ h: 14, draw: (o, x, y) => {
    if (i === 0) R(o, x, y + 4, 4, 4, head(col));
    T(o, l, x + 12, y + 10, 9, "r", ink(col));
  } })));
  const chipish = (s) => /compet|skill|aptid|ferrament|tecnolog|idioma|lingua|language|interess|hobb|softw|tools|conhecimento/i.test(s.title) && (s.entries || []).every((e) => !e.title || !(e.lines || []).length);
  const chipsOf = (lines) => lines
    .flatMap((line) => line.split(/\s+·\s+|\s*;\s*/).flatMap((p) => (p.split(/,\s+/).every((x) => x.split(" ").length <= 4) ? p.split(/,\s+/) : [p])))
    .map((p) => p.trim()).filter(Boolean);

  // The header first, then each column's sections in the CV's order.
  const headerCol = st.two ? cols[st.header] : cols.main;
  place(headerCol, headerRows(headerCol));
  headerCol.y += 10;
  if (st.two && photo && st.photo?.column !== st.header) {
    const c = cols[st.photo.column];
    place(c, [{ h: 94, draw: (o, x, y) => drawPhoto(o, x, y, 78) }]);
  }
  if (st.two && st.contact === "side" && doc.contact?.length) {
    const c = cols.side;
    const label = /[ãçõé]|ção/i.test((doc.sections || []).map((s) => s.title).join(" ")) ? "Contacto" : "Contact";
    place(c, [sectionHead(c, label), ...contactRows(c), gap(14)]);
  }
  (doc.sections || []).forEach((s, i) => {
    const c = st.two ? cols[st.sections[i]] : cols.main;
    const entries = s.entries || [];
    if (chipish(s)) {
      place(c, [sectionHead(c, s.title), ...chipRows(c, chipsOf(entries.flatMap((e) => [e.title, ...(e.lines || [])].filter(Boolean))))]);
    } else {
      entries.forEach((e, k) => place(c, [...(k === 0 ? [sectionHead(c, s.title)] : []), ...entryRows(c, e, s.title)]));
    }
    c.y += 8;
  });

  // The backgrounds go under everything: the sidebar's colour (or a thin rule) on every page, the bar on the first.
  pages.forEach((ops, n) => {
    const under = [];
    if (st.two) {
      const sx = st.side === "left" ? 0 : W - sw, edge = st.side === "left" ? sw : W - sw;
      if (st.sideBg) R(under, sx, n === 0 ? bar : 0, sw, H, st.sideBg);
      else L(under, edge, (n === 0 ? bar : 0) + 24, edge, H - 24, "#e2e2e2");
    }
    if (n === 0 && bar) R(under, 0, 0, W, bar, decor);
    ops.unshift(...under);
  });

  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", ""];
  for (const k of ["r", "b", "i"]) objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${F[k]} /Encoding /WinAnsiEncoding >>`);
  const fonts = ["r", "b", "i"].map((k, i) => `/${ID[k]} ${i + 3} 0 R`).join(" ");
  let imgRef = "";
  if (photo) {
    objects.push([`<< /Type /XObject /Subtype /Image /Width ${photo.w} /Height ${photo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode >>`, photo.bytes]);
    imgRef = `/XObject << /Im1 ${objects.length} 0 R >>`;
  }
  const kids = [];
  for (const p of pages) {
    const body = new Uint8Array(p.reduce((t, b) => t + b.length, 0));
    p.reduce((at, b) => (body.set(b, at), at + b.length), 0);
    const n = objects.length;
    objects.push(["<< >>", body]);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << ${fonts} >> ${imgRef} >> /Contents ${n + 1} 0 R >>`);
    kids.push(`${n + 2} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  return assemble(objects);
}
