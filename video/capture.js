// Captura imagens reais da app (a correr em localhost:3100) para o vídeo cvviews-film.html.
// Precisa de puppeteer-core (pasta indicada em TOOLS) e de um Chrome instalado.
//   node capture.js   -> video/shots/*.jpg e video/shots/seq/*.jpg
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const tools = createRequire(path.join(process.env.TOOLS || __dirname, 'package.json'));
const puppeteer = tools('puppeteer-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.APP || 'http://localhost:3100/';
const OUT = path.join(__dirname, 'shots');
const SEQ = path.join(OUT, 'seq');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(SEQ, { recursive: true });

const FICHA = `Ficha de trabalho de História – 9.º ano
1. Indica duas causas da Primeira Guerra Mundial.
2. Em que ano terminou a guerra?
3. Explica, em poucas linhas, a importância do Tratado de Versalhes.`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 92 });

async function prepare(page, settings, skipLogin = true) {
  await page.evaluateOnNewDocument((s, skip) => {
    if (sessionStorage.getItem('prepared')) return;
    sessionStorage.setItem('prepared', '1');
    localStorage.clear();
    localStorage.setItem('cvviews-settings', JSON.stringify(s));
    if (skip) localStorage.setItem('cvviews-skip-login', '1');
  }, settings, skipLogin);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });

  // ---------------- PC, tema escuro ----------------
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  const settings = { displayName: 'Daniel', defaultMode: 'candidato', web: true, enterToSend: true, voiceLang: 'pt', autoSendVoice: false, memory: false, theme: 'dark', lang: 'pt-PT' };
  await prepare(page, settings);
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await wait(1500);
  await shot(page, 'welcome.jpg');

  // anexa a ficha (colada como ficheiro de texto) e escreve "faz"
  await page.evaluate((text) => {
    const ta = document.querySelector('textarea');
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'ficha-historia.txt', { type: 'text/plain' }));
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, FICHA);
  await wait(700);
  await shot(page, 'attached.jpg');
  await page.focus('textarea');
  await page.keyboard.type('faz', { delay: 160 });
  await wait(300);
  await shot(page, 'typed.jpg');

  // envia e grava a resposta a aparecer, quadro a quadro
  await page.keyboard.press('Enter');
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < 40000) {
    await page.screenshot({ path: path.join(SEQ, `ans-${String(n++).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 85 });
    const done = await page.evaluate(() => !document.querySelector('.send-btn.is-stop') && !document.querySelector('.prose.is-revealing') && document.querySelectorAll('.msg-assistant .prose').length > 0);
    if (done && n > 8) break;
    await wait(60);
  }
  console.log('answer frames', n, 'in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await wait(400);
  await shot(page, 'answer.jpg');

  // configurações
  await page.evaluate(() => document.querySelector('.rail-btn[aria-label="Configurações"], .phone-row')?.click());
  await wait(700);
  await shot(page, 'settings.jpg');
  await page.keyboard.press('Escape');

  // tema claro, ecrã inicial
  const light = await browser.newPage();
  await light.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await light.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await prepare(light, { ...settings, theme: 'light', defaultMode: 'recrutador' });
  await light.goto(URL, { waitUntil: 'networkidle0' });
  await wait(1500);
  await shot(light, 'light.jpg');

  // ---------------- Telemóvel: o ecrã de entrada ----------------
  const phone = await browser.newPage();
  await phone.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await prepare(phone, settings, false);
  await phone.goto(URL, { waitUntil: 'networkidle0' });
  const p0 = Date.now();
  n = 0;
  while (Date.now() - p0 < 9500) {
    await phone.screenshot({ path: path.join(SEQ, `login-${String(n++).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 85 });
    await wait(40);
  }
  console.log('login frames', n, 'in', ((Date.now() - p0) / 1000).toFixed(1), 's');

  await browser.close();
})();
