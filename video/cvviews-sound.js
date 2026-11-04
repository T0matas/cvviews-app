// Banda sonora do vídeo do CVviews, gerada por código (sem amostras de terceiros).
// Música ambiente suave + efeitos sincronizados com as cenas de cvviews-promo.html.
// Uso: node cvviews-sound.js saida.wav
const fs = require('fs');

const SR = 44100;
const DUR = 42;
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

// ---------------- Música ----------------
// Acordes alinhados com as mudanças de cena.
const C = { C: [48, 55, 59, 64, 67], Am: [45, 52, 55, 60, 64], F: [41, 48, 52, 57, 60], G: [43, 50, 55, 57, 62], Em: [40, 47, 52, 55, 59] };
const prog = [[0, 'C'], [3.4, 'Am'], [7.6, 'F'], [11.9, 'C'], [15.6, 'Am'], [19.9, 'F'], [23.4, 'G'], [26.0, 'Em'], [28.8, 'F'], [31.2, 'Am'], [33.9, 'F'], [36.6, 'G'], [37.7, 'C']];
prog.forEach(([t, c], i) => {
  const t1 = i + 1 < prog.length ? prog[i + 1][0] : DUR - 2;
  pad(t, t1, C[c].slice(1).map((m) => m + 12), .045);
  if (t >= 3.4) bass(t, t1, C[c][0] - 12, t >= 7.6 ? .1 : .06);
});
// Arpejo: começa quando o app aparece.
const BEAT = 60 / 104 / 2;
for (let t = 7.6; t < 36.4; t += BEAT) {
  const c = prog.filter(([pt]) => pt <= t + .001).pop()[1];
  const k = Math.round((t - 7.6) / BEAT), tones = C[c].slice(1);
  const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
  const m = tones[pattern[k % 8]] + 12 + (k % 16 >= 12 ? 12 : 0);
  const accent = k % 4 === 0 ? 1 : .7;
  const fade = Math.min(1, (t - 7.6) / 2);
  keys(t, m, .35, .05 * accent * fade, (k % 2 ? .3 : -.3), .5);
}
// Final: o acorde abre e fica.
[60, 64, 67, 71, 74, 79].forEach((m, i) => keys(37.7 + i * .06, m, 3.2, .07, (i - 2.5) * .12, .7));
keys(37.7, 36, 3.5, .12, 0, .3);

// ---------------- Efeitos sincronizados ----------------
shimmer(.1, 1.1, .035);
chime(1.15, 76, .05);                                  // nome aparece
whoosh(3.15, 1.1, .1, 250, 1800);                     // "Conhece o Leo."
[3.5, 3.64, 3.78].forEach((t) => pop(t + .05, .035, 900, 600));
whoosh(7.3, 1.5, .16, 180, 1400);                     // telemóvel entra
[8.4, 8.52, 8.62].forEach((t, i) => pop(t, .04, 1000 + i * 60, 600));
[8.8, 8.88, 8.96, 9.04].forEach((t, i) => pop(t, .05, 1200 + i * 80, 650, (i % 2 ? .3 : -.3)));
whoosh(10.05, 1.2, .09, 400, 1600, 1);                // vai para a direita
click(11.9, .09, .3, 1800); pop(11.95, .05, 900, 700, .3);   // troca para Candidato
[12.2, 12.26, 12.32, 12.38].forEach((t, i) => pop(t, .04, 1300 + i * 70, 700, .3));
click(14.2, .09, .3, 1800); pop(14.25, .05, 800, 600, .3);   // volta a Recrutador
[14.45, 14.5, 14.55, 14.6].forEach((t, i) => pop(t, .035, 1200 + i * 70, 700, .3));
whoosh(15.45, 1.3, .12, 200, 1200);                   // aproxima
pop(16.6, .08, 1400, 700, .2); chime(16.65, 88, .02, .2);     // anexo
const TYPED = 'Analisa este CV para Product Designer';
for (let i = 1; i <= TYPED.length; i++) {             // teclado
  const t = 17.4 + (i / TYPED.length) * 1.9 - .02;
  if (TYPED[i - 1] !== ' ') click(t + (rand() * .012), .045 + rand() * .01, .2, 2200 + rand() * 600);
  else click(t, .06, .2, 1500);
}
click(19.5, .12, .2, 1400); pop(19.52, .07, 700, 380, .2);   // enviar
whoosh(19.55, .9, .1, 600, 3000, .3);
whoosh(19.85, 1.0, .07, 300, 1200);                   // passa para a conversa
pop(20.1, .05, 1000, 600, .2);
for (let i = 0; i < 14; i++) click(22.0 + i * .1 * (1 + i * .03), .022, .25, 3200 + i * 40);   // nota a contar
[22.3, 22.42, 22.54, 22.66].forEach((t, i) => pop(t, .04, 1300 + i * 80, 700, .25));
chime(23.45, 83, .06, .2); chime(23.5, 88, .04, .2); // nota final
[23.4, 23.55, 23.7].forEach((t) => pop(t, .03, 1100, 700, .25));
whoosh(25.7, 1.1, .12, 1800, 300);                    // sai do telemóvel
[26.3, 27.9, 29.5].forEach((t, i) => { whoosh(t - .25, .7, .07, 500, 2200); pop(t + .05, .045, 900 + i * 120, 600); });
whoosh(31.0, 1.4, .14, 180, 1400);                    // dois telemóveis
whoosh(36.35, 1.1, .1, 1600, 250);                    // final
shimmer(36.9, 1.0, .03);
chime(37.75, 72, .07); chime(37.8, 79, .05, .2); chime(37.85, 84, .04, -.2);

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
