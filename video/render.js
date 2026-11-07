// Grava cvviews-promo.html em MP4 (1920x1080, 30 fps) com a banda sonora de cvviews-sound.js.
// Precisa de puppeteer-core e ffmpeg-static (npm i puppeteer-core ffmpeg-static, numa pasta à parte
// indicada em TOOLS) e de um Chrome instalado (CHROME, por omissão o do Windows).
//   node render.js                 -> cvviews-promo.mp4
//   node render.js --stills 3,12   -> imagens desses instantes, para rever
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const { createRequire } = require('module');

const tools = createRequire(path.join(process.env.TOOLS || __dirname, 'package.json'));
const puppeteer = tools('puppeteer-core');
const ffmpeg = tools('ffmpeg-static');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FPS = 30;
// NAME escolhe o vídeo: cvviews-promo (por omissão) ou cvviews-launch, com a banda sonora de cada um.
const NAME = process.env.NAME || 'cvviews-promo';
const SOUND = NAME === 'cvviews-promo' ? 'cvviews-sound.js' : NAME + '-sound.js';
const OUT = process.env.OUT || path.join(__dirname, NAME + '.mp4');
const stills = process.argv.includes('--stills') ? process.argv[process.argv.indexOf('--stills') + 1].split(',').map(Number) : null;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-device-scale-factor=1', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto('file:///' + path.join(__dirname, NAME + '.html').replace(/\\/g, '/') + '?capture', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => window.DURATION);
  const frame = async (t) => { await page.evaluate((x) => window.render(x), t); return page.screenshot({ type: 'jpeg', quality: 92 }); };

  if (stills) {
    for (const t of stills) fs.writeFileSync(path.join(process.env.STILLS || __dirname, `still-${t}.jpg`), await frame(t));
    await browser.close();
    return console.log('stills', stills.join(', '));
  }

  const wav = path.join(process.env.STILLS || __dirname, NAME + '-sound.wav');
  execFileSync(process.execPath, [path.join(__dirname, SOUND), wav], { stdio: 'inherit' });
  const enc = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', wav,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round(duration * FPS);
  for (let i = 0; i < total; i++) {
    const img = await frame(i / FPS);
    if (!enc.stdin.write(img)) await new Promise((r) => enc.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${total}`);
  }
  enc.stdin.end();
  await new Promise((r) => enc.on('close', r));
  await browser.close();
  console.log('ok', OUT);
})();
