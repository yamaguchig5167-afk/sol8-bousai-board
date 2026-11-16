// 検査：1920×1080（MAXHUB）とスマホ幅で全画面を撮り、はみ出し・エラー・小さい押す所を数える
// 使い方：node serve.mjs を動かしたまま、node check.mjs
// puppeteer-core は sol8-look のものを借りる（SOL8_LOOK で場所を変えられる）
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOOK = process.env.SOL8_LOOK || 'C:/Users/gyama/projects/sol8-look/';
const puppeteer = createRequire(LOOK)('puppeteer-core');
const EDGE = process.env.SOL8_LOOK_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BOARD_URL || 'http://localhost:3760/';
const out = join(dirname(fileURLToPath(import.meta.url)), 'qa');
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'bousai-board-'));
spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', '--enable-unsafe-swiftshader', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} if (i === 59) throw new Error('Edge を開けませんでした'); await sleep(500); }
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });

const report = [];
async function run(name, w, h, hash) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  const errors = [], failed = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(m.text()); });
  page.on('requestfailed', (r) => { if (!r.url().includes('.png')) failed.push(r.url()); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('.png') && !r.url().includes('favicon')) failed.push(r.status() + ' ' + r.url()); });
  await page.goto(BASE + hash, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.bringToFront();
  await sleep(4000);
  for (const v of ['now', 'map', 'infra', 'action', 'settings']) {
    // page.click は、スマホ幅で画面を切りかえた後に内部の待ちで固まることがある。位置を測って押す
    const pt = await page.$eval(`#tabs button[data-go="${v}"]`, (b) => { const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.click(pt[0], pt[1]);
    await sleep(v === 'map' || v === 'now' ? 3500 : 500);
    await page.screenshot({ path: join(out, `${name}_${v}.png`), fullPage: w < 1000 });
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth, vh = innerHeight;
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const view = document.querySelector('.view:not([hidden])');
      const small = [...document.querySelectorAll('button, input, a, textarea')].filter(vis).filter((e) => !e.closest('.maplibregl-ctrl-attrib')).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || e.id).trim().slice(0, 14), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((o) => o.h < 44 || o.w < 44);
      const wide = [...document.querySelectorAll('body *')].filter(vis).filter((e) => e.getBoundingClientRect().right > vw + 1 && !e.closest('#map')).length;
      const texts = [...view.querySelectorAll('*')].filter(vis).filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
      const minFont = Math.min(...texts.filter((e) => !e.closest('#map')).map((e) => parseFloat(getComputedStyle(e).fontSize)));
      return { scrollX: document.documentElement.scrollWidth > vw, viewScrolls: view.scrollHeight > view.clientHeight + 1, pageScrolls: document.documentElement.scrollHeight > vh + 1, small, wide, minFont, band: document.getElementById('bandTitle').textContent, net: document.getElementById('netText').textContent };
    });
    report.push({ name, view: v, ...m });
    console.log(JSON.stringify({ name, view: v, ...m }));
  }
  report.push({ name, errors, failed: [...new Set(failed)].slice(0, 10) });
  console.log(JSON.stringify(report[report.length - 1]));
  await page.close();
}
await run('hub', 1920, 1080, '');
await run('hub-drill', 1920, 1080, '#drill');
await run('phone', 390, 844, '');
await run('hub-zh', 1920, 1080, '?lang=zh#drill');
await run('hub-en', 1920, 1080, '?lang=en#drill');
await run('phone-en', 390, 844, '?lang=en');
// 画面の大きさと縦横比のちがい（4K・ノートPC・16:10・横長・縦が低い）
for (const [w, h] of [[3840, 2160], [1366, 768], [1280, 800], [1920, 1200], [2560, 1080], [1280, 720]]) await run(`size-${w}x${h}`, w, h, '#drill');
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
try { await browser.close(); } catch {}
setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(0); }, 800);
