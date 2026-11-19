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
// 言葉の切りかえ
await page.click('#langs button[data-lang="zh"]'); await sleep(300);
ok('繁體中文に切りかわる', /沒有發布|已發布/.test(await txt('#bandTitle')) &&(await txt('#tabs button[data-go="infra"]')).includes('維生管線'), await txt('#bandTitle'));
await page.click('#langs button[data-lang="en"]'); await sleep(300);
ok('English に切りかわる', /No warnings|Advisory|Warning/.test(await txt('#bandTitle')) && (await txt('#tabs button[data-go="map"]')).includes('Map'), await txt('#bandTitle'));
const leftover = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => !e.closest('[data-view="settings"], #map, #langs, script, #contacts, #siteName, #meetPlace, #qrList .by, #shareName') && e.offsetParent !== null).flatMap((e) => [...e.childNodes].filter((n) => n.nodeType === 3 && /[ぁ-んァ-ヶ]/.test(n.textContent)).map((n) => n.textContent.trim())).slice(0, 8));
ok('English のとき、かな文字が残っていない', leftover.length === 0, leftover.join(' / '));
await page.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
ok('選んだ言葉が次回も続く', (await txt('#tabs button[data-go="map"]')).includes('Map'));
await page.click('#langs button[data-lang="ja"]'); await sleep(300);
ok('日本語にもどせる', (await txt('#tabs button[data-go="map"]')).includes('地図'));
// 全画面
ok('全画面のボタンが出る', await page.$eval('#fsBtn', (b) => !b.hidden && b.textContent.includes('全画面')));
await page.click('#fsBtn'); await sleep(800);
const fsIn = await page.evaluate(() => !!document.fullscreenElement);
ok('押すと全画面になり、ボタンが「やめる」に変わる', fsIn && (await txt('#fsBtn')).includes('やめる'), 'fullscreen=' + fsIn);
await page.click('#fsBtn'); await sleep(800);
ok('もう一度押すと元にもどる', await page.evaluate(() => !document.fullscreenElement) && !(await txt('#fsBtn')).includes('やめる'));
// スマホで見る → リンクを別の端末（別の保存領域）で開く
await page.click('#shareBtn'); await sleep(300);
ok('スマホ用のQRの窓が開く', await page.$eval('#share', (d) => d.open && document.getElementById('shareQr').width > 20));
await page.click('#shareClose');
await page.click('#tabs button[data-go="settings"]');
const link = await page.$eval('#fLink', (e) => e.value);
ok('設定にリンクが出る', link.includes('#s='), link.length + '文字');
const ctx2 = await browser.createBrowserContext(); const p2 = await ctx2.newPage(); await p2.setViewport({ width: 390, height: 844 });
await p2.goto(link, { waitUntil: 'networkidle2' }); await sleep(2500);
ok('リンクを開いた端末に設定が入る', (await p2.$eval('#meetPlace', (e) => e.textContent)) === '第2駐車場' && !(await p2.evaluate(() => location.hash)));
ok('リンクにライフラインの記録は入らない', !(await p2.$eval('#infraMini li:nth-child(1)', (e) => e.textContent)).includes('使えない'));
await p2.goto(link.split('#')[0] + '#s=AAAA%%', { waitUntil: 'networkidle2' }); await sleep(1500);
ok('こわれたリンクでも止まらない', (await p2.$eval('#bandTitle', (e) => e.textContent)).length > 5);
await ctx2.close();
// 細工した保存内容でも、文字として出るだけで動かない
await page.evaluate(() => localStorage.setItem('bousai-board-v1', JSON.stringify({ name: '<img src=x onerror=alert(1)>', lat: 'x', muni: '../../x', infra: { power: { s: '<b>', t: 'a' } }, contacts: '<script>alert(1)</script>｜1' })));
let dialog = false; page.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
await page.reload({ waitUntil: 'networkidle2' }); await sleep(2500);
ok('細工した保存内容でも文字として出るだけ', !dialog && (await txt('#siteName')).includes('<img') && (await txt('#bandTitle')).includes('大津町'));
console.log(`${res.filter((r) => r.ok).length}/${res.length} OK`);
try { await browser.close(); } catch {}
setTimeout(() => process.exit(res.every((r) => r.ok) ? 0 : 1), 800);
