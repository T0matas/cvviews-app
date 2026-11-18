// Banda sonora do vídeo do CVviews, gerada por código (sem amostras de terceiros).
// Música ambiente suave + efeitos sincronizados com as cenas de cvviews-promo.html.
// Uso: node cvviews-sound.js saida.wav
const fs = require('fs');

const SR = 44100;
const DUR = 40;
const N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);       // mistura seca
const RL = new Float32Array(N), RR = new Float32Array(N);     // envio para a reverberação
const PAD = new Float32Array(N);                              // pad antes do filtro

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function add(i, v, pan = 0, rev = .25) {
  if (i < 0 || i >= N) return;
  const l = v * Math.min(1, 1 - pan), r = v * Math.min(1, 1 + pan);
  L[i] += l; R[i] += r; RL[i] += l * rev; RR[i] += r * rev;
}

// ---------------- Instrumentos ----------------
// Piano suave: parciais com decaimento exponencial.
function keys(t0, m, dur = 1.6, amp = .12, pan = 0, rev = .45) {
  const f = midi(m), s0 = Math.floor(t0 * SR), len = Math.floor((dur + 1.2) * SR);
  const parts = [[1, 1], [2, .35], [3, .12], [4, .05]];
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const env = Math.min(1, t / .006) * Math.exp(-t * 2.6) * (t > dur ? Math.exp(-(t - dur) * 6) : 1);
    let v = 0;
    for (const [h, a] of parts) v += a * Math.sin(2 * Math.PI * f * h * t) * Math.exp(-t * h * .8);
    add(s0 + k, v * env * amp, pan, rev);
  }
}
// Pad: senos desafinados com entrada e saída lentas.
function pad(t0, t1, notes, amp = .05) {
  const s0 = Math.floor(t0 * SR), s1 = Math.min(N, Math.floor((t1 + 1.8) * SR));
  for (const m of notes) {
    const f = midi(m);
    for (const d of [-.11, 0, .13]) {
      const ff = f * Math.pow(2, d / 12), ph = (rand() + 1) * 3.14;
      for (let i = s0; i < s1; i++) {
        const t = (i - s0) / SR, len = t1 - t0;
        const env = Math.min(1, t / 1.4) * (t > len ? Math.max(0, 1 - (t - len) / 1.8) : 1);
        const x = 2 * Math.PI * ff * t + ph;
        PAD[i] += (Math.sin(x) + .25 * Math.sin(2 * x) + .08 * Math.sin(3 * x)) * env * amp / 3;
      }
    }
  }
}
function bass(t0, t1, m, amp = .09) {
  const f = midi(m), s0 = Math.floor(t0 * SR), s1 = Math.min(N, Math.floor((t1 + .6) * SR));
  for (let i = s0; i < s1; i++) {
    const t = (i - s0) / SR, len = t1 - t0;
    const env = Math.min(1, t / .25) * (t > len ? Math.max(0, 1 - (t - len) / .6) : 1);
    add(i, Math.sin(2 * Math.PI * f * t) * env * amp, 0, .05);
  }
}

// ---------------- Efeitos ----------------
// Sopro: ruído num filtro passa-banda cuja frequência sobe ou desce.
function whoosh(t0, dur = .9, amp = .16, f0 = 300, f1 = 2400, pan = 0) {
  const s0 = Math.floor(t0 * SR), len = Math.floor(dur * SR);
  let lp = 0, bp = 0;
  for (let k = 0; k < len; k++) {
    const x = k / len;
    const fc = f0 * Math.pow(f1 / f0, x), q = .55;
    const F = 2 * Math.sin(Math.PI * fc / SR);
    const hp = rand() - lp - q * bp; bp += F * hp; lp += F * bp;
    const env = Math.pow(Math.sin(Math.PI * Math.pow(x, .7)), 2);
    add(s0 + k, bp * env * amp, pan * (x * 2 - 1), .5);
  }
}
function click(t0, amp = .05, pan = 0, tone = 2600) {
  const s0 = Math.floor(t0 * SR), len = Math.floor(.03 * SR);
  let prev = 0;
  for (let k = 0; k < len; k++) {
    const t = k / SR, n = rand(), hp = n - prev; prev = n;
    const v = hp * Math.exp(-t * 900) * .6 + Math.sin(2 * Math.PI * tone * t) * Math.exp(-t * 300) * .5;
    add(s0 + k, v * amp, pan, .15);
  }
}
function pop(t0, amp = .09, fHi = 1100, fLo = 520, pan = 0) {
  const s0 = Math.floor(t0 * SR), len = Math.floor(.12 * SR);
  let ph = 0;
  for (let k = 0; k < len; k++) {
    const t = k / SR, f = fLo + (fHi - fLo) * Math.exp(-t * 60);
    ph += 2 * Math.PI * f / SR;
    add(s0 + k, Math.sin(ph) * Math.min(1, t / .002) * Math.exp(-t * 38) * amp, pan, .3);
  }
}
function chime(t0, m, amp = .08, pan = 0) {
  const f = midi(m), s0 = Math.floor(t0 * SR), len = Math.floor(3 * SR);
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.6) + .35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 3.5) + .15 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 6);
    add(s0 + k, v * Math.min(1, t / .003) * amp, pan, .6);
  }
}
// Brilho a subir antes da marca.
function shimmer(t0, dur, amp = .03) {
  const notes = [84, 88, 91, 95, 96];
  for (let i = 0; i < 14; i++) keys(t0 + i * dur / 14, notes[i % notes.length] - (i < 7 ? 12 : 0), .4, amp * (.4 + i / 20), (i % 2 ? .4 : -.4), .8);
}

// Caneta a riscar o papel: ruído agudo e curto, a variar.
function scratch(t0, dur = .35, amp = .05, pan = 0) {
  const s0 = Math.floor(t0 * SR), len = Math.floor(dur * SR);
  let lp = 0, bp = 0;
  for (let k = 0; k < len; k++) {
    const x = k / len, fc = 3200 + Math.sin(x * 40) * 900, F = 2 * Math.sin(Math.PI * fc / SR);
    const hp = rand() - lp - .4 * bp; bp += F * hp; lp += F * bp;
    add(s0 + k, bp * Math.sin(Math.PI * x) * (.6 + .4 * Math.abs(Math.sin(x * 23))) * amp, pan, .2);
  }
}

// ---------------- Música ----------------
// Calma e luminosa, como nos vídeos de produto: acordes alinhados com as mudanças de cena.
const C = { C: [48, 55, 59, 64, 67], Am: [45, 52, 55, 60, 64], F: [41, 48, 52, 57, 60], G: [43, 50, 55, 57, 62], Em: [40, 47, 52, 55, 59] };
const prog = [[0, 'C'], [3.5, 'Am'], [7.5, 'F'], [11.5, 'C'], [16.1, 'Am'], [19.5, 'F'], [21.8, 'G'], [25.0, 'Em'], [27.4, 'F'], [29.4, 'Am'], [32.4, 'F'], [35.6, 'G'], [37.0, 'C']];
prog.forEach(([t, c], i) => {
  const t1 = i + 1 < prog.length ? prog[i + 1][0] : DUR - 2;
  pad(t, t1, C[c].slice(1).map((m) => m + 12), .045);
  if (t >= 3.5) bass(t, t1, C[c][0] - 12, t >= 7.5 ? .1 : .06);
});
// Arpejo de piano: começa quando a app aparece e pára antes do final.
const BEAT = 60 / 100 / 2;
for (let t = 7.5; t < 35.4; t += BEAT) {
  const c = prog.filter(([pt]) => pt <= t + .001).pop()[1];
  const k = Math.round((t - 7.5) / BEAT), tones = C[c].slice(1);
  const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
  const m = tones[pattern[k % 8]] + 12 + (k % 16 >= 12 ? 12 : 0);
  const accent = k % 4 === 0 ? 1 : .7;
  const fade = Math.min(1, (t - 7.5) / 2) * Math.min(1, (35.4 - t) / 1.2);
  keys(t, m, .35, .045 * accent * fade, (k % 2 ? .3 : -.3), .5);
}
// Final: o acorde abre e fica.
[60, 64, 67, 71, 74, 79].forEach((m, i) => keys(37.0 + i * .06, m, 3.2, .07, (i - 2.5) * .12, .7));
keys(37.0, 36, 3.5, .12, 0, .3);

// ---------------- Efeitos sincronizados com cvviews-promo.html ----------------
shimmer(.1, 1.2, .035);
chime(1.35, 76, .05);                                   // o nome aparece
whoosh(3.3, 1.1, .1, 250, 1800);                        // "Conheça o Leo."
[3.8, 3.94, 4.08].forEach((t) => pop(t + .05, .035, 900, 600));
pop(5.05, .03, 800, 600);
whoosh(7.3, 1.5, .15, 180, 1400);                       // a janela da app entra
click(9.5, .09, -.2, 1800); pop(9.55, .07, 1400, 700, -.2); chime(9.62, 88, .02, -.2);   // anexa o CV
const TYPED = 'Revê o meu CV para Product Designer';
for (let i = 1; i <= TYPED.length; i++) {               // teclado
  const t = 10.4 + (i / TYPED.length) * 1.8 - .02;
  if (TYPED[i - 1] !== ' ') click(t + rand() * .012, .045 + rand() * .01, .1, 2200 + rand() * 600);
  else click(t, .06, .1, 1500);
}
click(12.7, .12, .3, 1400); pop(12.72, .07, 700, 380, .3);   // enviar
whoosh(12.85, .8, .08, 500, 2600, .2);
for (let i = 0; i < 6; i++) keys(13.25 + i * .16, [84, 88, 91][i % 3], .3, .015, .2, .8);   // o Leo a pensar
for (let i = 0; i < 14; i++) click(14.3 + i * .07 * (1 + i * .04), .022, .2, 3200 + i * 40);   // a nota a contar
chime(15.25, 83, .05, .2); chime(15.3, 88, .035, .2);
whoosh(16.0, 1.1, .1, 1600, 300);                       // "Uma nota honesta."
[17.1, 17.45, 17.8].forEach((t, i) => pop(t, .045, 1000 + i * 90, 600, .3));
pop(18.65, .05, 1100, 650, .3);
scratch(19.5, .65, .05, .3);                            // a linha antiga é riscada
chime(20.35, 79, .045, .3); chime(20.4, 86, .03, .3);  // a nova aparece
whoosh(21.8, 1.2, .12, 220, 1600);                      // "O teu CV corrigido."
[22.0, 22.12, 22.24].forEach((t) => pop(t + .05, .03, 900, 600));
scratch(23.4, .4, .05, -.4); scratch(23.7, .4, .05, -.4); scratch(24.6, .35, .05, -.2);   // a caneta
pop(24.15, .05, 1200, 700, -.3); pop(25.05, .05, 1300, 700, -.2);   // as notas
pop(25.85, .08, 900, 450); whoosh(26.2, .9, .1, 400, 2400, .5);     // a seta e o CV corrigido
chime(27.0, 84, .05, .4); chime(27.06, 91, .03, .4);
whoosh(29.2, 1.4, .14, 180, 1300);                      // o telemóvel entra
[30.6, 30.72, 30.84, 30.96].forEach((t, i) => pop(t, .04, 1000 + i * 70, 600, .3));
click(31.9, .08, .3, 1800); pop(31.95, .05, 900, 700, .3);   // troca para Candidato
click(32.9, .08, .3, 1800); pop(32.95, .05, 800, 600, .3);   // volta
whoosh(33.05, .8, .09, 300, 1800, -.4);                // a gaveta abre
whoosh(34.95, .7, .07, 1800, 400, .4);                 // e fecha
whoosh(35.4, 1.2, .11, 1600, 250);                      // final
shimmer(36.2, 1.0, .03);
chime(37.0, 72, .07); chime(37.05, 79, .05, .2); chime(37.1, 84, .04, -.2);

// ---------------- Mistura ----------------
// Pad filtrado (passa-baixo), em estéreo largo.
let lp1 = 0, lp2 = 0;
for (let i = 0; i < N; i++) {
  lp1 += .045 * (PAD[i] - lp1); lp2 += .045 * (lp1 - lp2);
  const w = Math.sin(i / SR * .7) * .25;
  L[i] += lp2 * (1 - w); R[i] += lp2 * (1 + w); RL[i] += lp2 * .5; RR[i] += lp2 * .5;
}
// Reverberação Schroeder (4 pentes + 2 passa-tudo por canal).
function reverb(inp, out, offs) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ b: new Float32Array(d + offs), i: 0, f: 0 }));
  const aps = [225, 556].map((d) => ({ b: new Float32Array(d + offs), i: 0 }));
  for (let n = 0; n < N; n++) {
    let s = 0;
    for (const c of combs) { const y = c.b[c.i]; c.f = y * .8 + c.f * .2; c.b[c.i] = inp[n] + c.f * .84; c.i = (c.i + 1) % c.b.length; s += y; }
    s *= .25;
    for (const a of aps) { const y = a.b[a.i]; a.b[a.i] = s + y * .5; a.i = (a.i + 1) % a.b.length; s = y - s * .5; }
    out[n] += s * .9;
  }
}
reverb(RL, L, 0); reverb(RR, R, 23);
// Entrada e saída, normalização e limitador suave.
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, g = Math.min(1, t / .08) * (t > DUR - 2.2 ? Math.max(0, (DUR - t) / 2.2) : 1);
  L[i] *= g; R[i] *= g; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = .89 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.tanh(L[i] * gain * 1.1) * 32000), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.tanh(R[i] * gain * 1.1) * 32000), 46 + i * 4);
}
fs.writeFileSync(process.argv[2] || 'cvviews-sound.wav', buf);
console.log('ok', (peak).toFixed(3));
