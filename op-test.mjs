// 操作の試験：ライフラインの記録・保存の持ち越し・通信が切れたときの表示
// 使い方：node serve.mjs を動かしたまま、node op-test.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const puppeteer = createRequire(process.env.SOL8_LOOK || 'C:/Users/gyama/projects/sol8-look/')('puppeteer-core');
const EDGE = process.env.SOL8_LOOK_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BOARD_URL || 'http://localhost:3760/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 400), profile = mkdtempSync(join(tmpdir(), 'bousai-op-'));
spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--no-first-run', '--enable-unsafe-swiftshader', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(500); }
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
const page = await browser.newPage(); await page.setViewport({ width: 1920, height: 1080 });
const res = [];
const ok = (name, v, note = '') => { res.push({ name, ok: !!v }); console.log((v ? 'OK  ' : 'NG  ') + name + (note ? '  ' + note : '')); };
const txt = (sel) => page.$eval(sel, (e) => e.textContent);

await page.goto(BASE, { waitUntil: 'networkidle2' }); await page.bringToFront(); await sleep(3000);
ok('警報の帯に市町村名が出る', (await txt('#bandTitle')).includes('大津町'));
ok('天気が2日分出る', (await page.$$('.wx-day')).length === 2);
ok('観測の4項目が出る', (await page.$$('#obs > div')).length === 4, await txt('#obsWhere'));
ok('雨雲の時刻が出る', /時点/.test(await txt('#rainTime')), await txt('#rainTime'));
await page.click('#tabs button[data-go="infra"]');
await page.click('#infraList li:nth-child(1) .choices button.ng'); await sleep(200);
ok('電気を「使えない」に記録できる', await page.$eval('#infraList li:nth-child(1)', (e) => e.classList.contains('is-ng') && /に記録/.test(e.textContent)));
ok('QRが6つ出る', (await page.$$('#qrList canvas')).length === 6);
await page.click('#tabs button[data-go="now"]');
ok('「いま」にも反映される', (await txt('#infraMini li:nth-child(1)')).includes('使えない'));
await page.reload({ waitUntil: 'networkidle2' }); await sleep(2000);
ok('読み込み直しても記録が残る', (await txt('#infraMini li:nth-child(1)')).includes('使えない'));
await page.click('#tabs button[data-go="settings"]');
await page.$eval('#fMeet', (e) => { e.value = '第2駐車場'; }); await page.click('#fSave'); await sleep(500);
await page.click('#tabs button[data-go="action"]');
ok('集まる場所を変えられる', (await txt('#meetPlace')) === '第2駐車場');
await page.setOfflineMode(true); await page.evaluate(() => dispatchEvent(new Event('offline'))); await sleep(500);
ok('通信が切れたら上の帯に出る', /通信できません/.test(await txt('#netText')), await txt('#netText'));
await page.click('#tabs button[data-go="now"]');
ok('切れても前の情報は残す', (await txt('#bandTitle')).includes('大津町') && (await page.$$('.wx-day')).length === 2);
ok('インターネット欄が「つながらない」', (await txt('#infraMini li:nth-child(3)')).includes('つながらない'));
await page.setOfflineMode(false); await page.evaluate(() => dispatchEvent(new Event('online'))); await sleep(6000);
ok('戻ったら更新の表示に戻る', /に更新/.test(await txt('#netText')), await txt('#netText'));
// 細工した保存内容でも、文字として出るだけで動かない
await page.evaluate(() => localStorage.setItem('bousai-board-v1', JSON.stringify({ name: '<img src=x onerror=alert(1)>', lat: 'x', muni: '../../x', infra: { power: { s: '<b>', t: 'a' } }, contacts: '<script>alert(1)</script>｜1' })));
let dialog = false; page.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
await page.reload({ waitUntil: 'networkidle2' }); await sleep(2500);
ok('細工した保存内容でも文字として出るだけ', !dialog && (await txt('#siteName')).includes('<img') && (await txt('#bandTitle')).includes('大津町'));
console.log(`${res.filter((r) => r.ok).length}/${res.length} OK`);
try { await browser.close(); } catch {}
setTimeout(() => process.exit(res.every((r) => r.ok) ? 0 : 1), 800);
