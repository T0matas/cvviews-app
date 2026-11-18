// Banda sonora do vídeo do CVviews, gerada por código (sem amostras de terceiros).
// Versão do vídeo de lançamento (cvviews-launch.html): mais animada, com efeitos nos mesmos instantes.
// Uso: node cvviews-launch-sound.js saida.wav
const fs = require('fs');

const SR = 44100;
const DUR = 36;
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
// Alegre e saltitante, como num lançamento de produto: acordes que mudam com as cenas e um arpejo a 112 bpm.
const C = { C: [48, 55, 60, 64, 67], Am: [45, 52, 57, 60, 64], F: [41, 48, 53, 57, 60], G: [43, 50, 55, 59, 62], Dm: [38, 50, 53, 57, 62] };
const prog = [[0, 'C'], [4.8, 'F'], [8.4, 'G'], [12.2, 'C'], [15.8, 'Am'], [19.6, 'F'], [23.2, 'G'], [26.8, 'C'], [29.2, 'Dm'], [31.6, 'F'], [33.0, 'C']];
for (let i = 0; i < prog.length; i++) {
  const [t0, name] = prog[i], t1 = i + 1 < prog.length ? prog[i + 1][0] : DUR;
  pad(t0, t1 + .3, C[name].slice(1), .042);
  bass(t0, t1, C[name][0], .08);
}
const BEAT = 60 / 112 / 2;
for (let t = 1.6, n = 0; t < 33.0; t += BEAT, n++) {
  const name = [...prog].reverse().find(([s]) => s <= t)[1];
  const notes = C[name].slice(1).map((m) => m + 12);
  keys(t, notes[[0, 2, 1, 3, 2, 1][n % 6]], .22, n % 4 === 0 ? .075 : .05, (n % 2 ? .3 : -.3), .35);
}
keys(33.0, 36, 3.0, .12, 0, .3);

// ---------------- Efeitos sincronizados com cvviews-launch.html ----------------
shimmer(.1, 1.0, .03);
scratch(.65, 1.1, .035);                                   // o logo desenha-se
chime(1.05, 76, .06); chime(1.1, 83, .04, .2);             // o nome aparece
pop(2.65, .07, 1100, 600, -.5); pop(2.95, .07, 1250, 650, .5);   // as notas adesivas
whoosh(4.6, 1.0, .1, 250, 1800);                           // cena 2
pop(5.4, .06, 900, 500);
pop(6.3, .05, 1300, 800, .4); whoosh(6.6, 1.2, .07, 300, 1500, -.2); pop(7.8, .08, 1000, 520, -.3);   // arrasta o PDF
const T1 = 'Revê o meu CV para Product Designer';
for (let i = 1; i <= T1.length; i++) { const t = 8.2 + (i / T1.length) * 2.0; click(t + rand() * .01, T1[i - 1] === ' ' ? .06 : .045, .1, T1[i - 1] === ' ' ? 1500 : 2200 + rand() * 600); }
click(10.95, .12, .3, 1400); pop(10.97, .08, 800, 400, .3);   // enviar
for (let i = 0; i < 8; i++) pop(11.0 + i * .03, .03, 1400 + i * 120, 900, (i % 2 ? .4 : -.4));   // faíscas
whoosh(12.0, 1.0, .1, 1600, 300);                          // cena 3
pop(12.35, .06, 900, 480);
scratch(13.6, .5, .05, -.3); scratch(15.0, .5, .05, -.3);  // os riscos
pop(14.05, .06, 1200, 700, -.1); pop(15.45, .06, 1300, 700, -.1);   // os papelinhos
for (let i = 0; i < 16; i++) click(13.3 + i * .16 * (1 + i * .03), .022, .3, 3000 + i * 50);   // a nota a contar
chime(16.25, 83, .06, .3); chime(16.3, 88, .04, .3);
whoosh(19.4, 1.0, .1, 250, 1900);                          // cena 4
pop(20.45, .06, 1000, 520, -.4); pop(20.75, .06, 900, 480, .2);
[21.95, 22.12, 22.3].forEach((t) => click(t, .05, .2, 2400));   // faz
click(22.75, .12, .3, 1400); pop(22.77, .08, 800, 400, .3);
for (let i = 0; i < 8; i++) pop(22.8 + i * .03, .03, 1400 + i * 120, 900, (i % 2 ? .4 : -.4));
whoosh(23.0, .7, .06, 600, 2400, .2);
for (let i = 0; i < 6; i++) keys(23.4 + i * .28, [84, 88, 91][i % 3], .25, .014, .2, .8);   // a resposta a escrever
whoosh(26.6, 1.0, .1, 1600, 300);                          // cena 5
[27.4, 27.57, 27.74, 27.91, 28.08, 28.25].forEach((t, i) => pop(t, .07, 900 + i * 110, 480, [-.6, -.2, .2, .6, -.3, .4][i]));
whoosh(31.4, 1.2, .11, 1500, 250);                         // final
scratch(31.9, 1.0, .035);
shimmer(32.2, 1.0, .03);
chime(32.4, 72, .07); chime(32.45, 79, .05, .2); chime(32.5, 84, .04, -.2);
pop(33.85, .06, 1000, 600);

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
fs.writeFileSync(process.argv[2] || 'cvviews-launch-sound.wav', buf);
console.log('ok', (peak).toFixed(3));
