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
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
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
  y -= 22; text(doc.name || "", M, 22, "b", accent);
  if (doc.headline) { y -= 18; text(doc.headline, M, 12, "r", "#333333"); }
  if (doc.contact?.length) for (const l of wrap(doc.contact.join("  ·  "), 9.5, "r", inner)) { y -= 14; text(l, M, 9.5, "r", "#555555"); }

  for (const s of doc.sections || []) {
    // An entry is laid out first, so it moves to the next page whole rather than being cut in two.
    const blocks = (s.entries || []).map((e) => {
      const rows = [];
      if (e.title || e.dates) rows.push({ h: 14, draw: () => { text(e.title || "", M, 10.5, "b"); if (e.dates) text(e.dates, W - M - measure(e.dates, 9.5), 9.5, "r", "#555555"); } });
      if (e.subtitle) rows.push({ h: 13, draw: () => text(e.subtitle, M, 9.5, "i", "#444444") });
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
