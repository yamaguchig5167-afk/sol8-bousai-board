// 防災ボード（MAXHUB 用）
// 情報：気象庁ホームページ（警報・天気・観測・地震・雨雲・キキクル）／国土地理院／ハザードマップポータルサイト
// サーバーは使わない。設定とライフラインの記録は、この端末の中（localStorage）だけに残す。
import * as maplibregl from './vendor/maplibre-gl.mjs';
import { T, DICT, LANGS, getLang, setLangCode, warnName, pair } from './i18n.mjs';

const JMA = 'https://www.jma.go.jp/bosai/';
const HAZARD = 'https://disaportaldata.gsi.go.jp/raster/';
const KEY = 'bousai-board-v1';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => `${d.getHours()}:${pad(d.getMinutes())}`;
const WD = { ja: ['日', '月', '火', '水', '木', '金', '土'], zh: ['日', '一', '二', '三', '四', '五', '六'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 日付の書き方（長い形・短い形）
const dateLong = (d) => {
  const l = getLang();
  if (l === 'en') return `${WD.en[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
  return `${d.getMonth() + 1}月${d.getDate()}日（${l === 'zh' ? '週' : ''}${WD[l][d.getDay()]}）`;
};
const dateShort = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

// ── 設定 ──
const DEFAULTS = {
  name: 'ソルエイト株式会社 大津営業所（見本）',
  addr: '熊本県菊池郡大津町杉水',
  lat: 32.909401, lon: 130.846848, muni: '43403', muniName: '大津町',
  meet: '正面駐車場',
  contacts: '代表電話｜096-277-7166\n大津町役場｜096-293-3111\n消防・救急｜119\n警察｜110',
  rotate: true, drill: false, lang: 'ja',
  infra: {},
};
const str = (v, max, d) => (typeof v === 'string' ? v.slice(0, max) : d);
// 保存された内容・リンクの内容は信用せず、形を確かめてから使う
function clean(s) {
  const c = { ...DEFAULTS };
  if (!s || typeof s !== 'object') return c;
  c.name = str(s.name, 40, c.name); c.addr = str(s.addr, 80, c.addr);
  c.meet = str(s.meet, 40, c.meet); c.contacts = str(s.contacts, 400, c.contacts);
  if (Number.isFinite(s.lat) && Number.isFinite(s.lon) && s.lat > 20 && s.lat < 46 && s.lon > 122 && s.lon < 154 && /^\d{5}$/.test(s.muni || '')) {
    c.lat = s.lat; c.lon = s.lon; c.muni = s.muni; c.muniName = str(s.muniName, 20, '');
  }
  if (typeof s.rotate === 'boolean') c.rotate = s.rotate;
  if (typeof s.drill === 'boolean') c.drill = s.drill;
  if (s.lang === 'zh' || s.lang === 'en') c.lang = s.lang;
  c.infra = {};
  if (s.infra && typeof s.infra === 'object') for (const k of Object.keys(s.infra)) {
    const v = s.infra[k];
    if (v && ['ok', 'part', 'ng', 'unk'].includes(v.s) && Number.isFinite(v.t)) c.infra[k] = { s: v.s, t: v.t };
  }
  return c;
}
function loadCfg() {
  try { return clean(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return clean(null); }
}
let cfg = loadCfg();
const saveCfg = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* 保存できない端末でも表示は続ける */ } };

// ── お客様版のリンク（#s=…）：事業所の設定だけを入れる。ライフラインの記録は入れない ──
const b64 = {
  enc: (o) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))),
};
const SHARE_KEYS = ['name', 'addr', 'lat', 'lon', 'muni', 'muniName', 'meet', 'contacts'];
function shareUrl() {
  const o = {}; for (const k of SHARE_KEYS) o[k] = cfg[k];
  return location.origin + location.pathname + '#s=' + b64.enc(o);
}
(function readHash() {
  const h = location.hash;
  if (h === '#drill') { cfg.drill = true; return; }
  if (!h.startsWith('#s=') || h.length > 6000) return;
  let got; try { got = clean(b64.dec(h.slice(3))); } catch { return; }
  const same = SHARE_KEYS.every((k) => got[k] === cfg[k]);
  let saved = false; try { saved = !!localStorage.getItem(KEY); } catch { /* 保存できない端末 */ }
  // すでに別の設定で使っている端末は、たずねてから切りかえる
  if (!same && (!saved || window.confirm('このリンクの設定（' + got.name + '）に切りかえますか？ いまの設定は上書きされます。'))) {
    for (const k of SHARE_KEYS) cfg[k] = got[k];
    saveCfg();
  }
  history.replaceState(null, '', location.pathname + location.search);
})();
// アドレスに ?lang=zh / ?lang=en を付けると、その言葉で始まる
const qLang = new URLSearchParams(location.search).get('lang');
if (qLang === 'zh' || qLang === 'en' || qLang === 'ja') cfg.lang = qLang;
setLangCode(cfg.lang);

// ── 警報・注意報の種類（気象庁の新しい防災気象情報：2026年5月〜）［種類・段階・レベル］──
const G = { 5: '特別警報', 4: '危険警報', 3: '警報', 2: '注意報' };
const KIND = {
  '33': ['大雨', 5], '43': ['大雨', 4], '03': ['大雨', 3], '10': ['大雨', 2],
  '39': ['土砂災害', 5], '49': ['土砂災害', 4], '09': ['土砂災害', 3], '29': ['土砂災害', 2],
  '38': ['高潮', 5], '48': ['高潮', 4], '08': ['高潮', 3], '19': ['高潮', 2],
  '35': ['暴風', 5], '05': ['暴風', 3], '15': ['強風', 2],
  '32': ['暴風雪', 5], '02': ['暴風雪', 3], '13': ['風雪', 2],
  '36': ['大雪', 5], '06': ['大雪', 3], '12': ['大雪', 2],
  '37': ['波浪', 5], '07': ['波浪', 3], '16': ['波浪', 2],
  '14': ['雷', 2], '17': ['融雪', 2], '20': ['濃霧', 2], '21': ['乾燥', 2], '22': ['なだれ', 2],
  '23': ['低温', 2], '24': ['霜', 2], '25': ['着氷', 2], '26': ['着雪', 2],
};
const LEVELED = new Set(['33', '43', '03', '10', '39', '49', '09', '29', '38', '48', '08', '19']); // 「レベル」を付けて呼ぶ種類
// 英語でレベルの付く種類は、気象庁の英語表示と同じ「段階（種類）」の順にする
const kindName = (code) => (getLang() === 'en' && LEVELED.has(code) ? `${T(G[KIND[code][1]])} (${T(KIND[code][0])})` : warnName(KIND[code][0], G[KIND[code][1]]));

// ── 状態 ──
const S = { area: null, warn: null, wx: null, obs: null, quakes: null, lastOk: 0, failed: false, rainTime: null, riskTime: null };

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

// 市町村 → 気象庁の区域（市町村等・一次細分・府県予報区）
async function resolveArea() {
  const a = await getJSON(JMA + 'common/const/area.json');
  const c20 = Object.keys(a.class20s).filter((k) => k.startsWith(cfg.muni)).sort()[0];
  if (!c20) throw new Error('area');
  const c15 = a.class20s[c20].parent, c10 = a.class15s[c15].parent, office = a.class10s[c10].parent;
  S.area = { c20, c10, office, name: cfg.muniName || a.class20s[c20].name, en: a.class20s[c20].enName || '', c10name: a.class10s[c10].name, c10en: a.class10s[c10].enName || '' };
}
// 地名：英語のときだけ気象庁の英語名、ほかは漢字のまま
const areaName = () => (getLang() === 'en' && S.area?.en) || S.area?.name || cfg.muniName;

async function loadWarn() {
  const list = await getJSON(`${JMA}warning/data/r8/${S.area.office}.json`);
  const active = []; let report = 0;
  for (const e of list) {
    const item = e.warning?.class20Items?.find((x) => x.areaCode === S.area.c20);
    if (!item) continue;
    for (const k of item.kinds || []) {
      if (!k.code || k.status === '解除' || !KIND[k.code]) continue;
      active.push({ code: k.code, lv: KIND[k.code][1] });
      const t = Date.parse(e.reportDatetime);
      if (t > report) report = t;
    }
  }
  active.sort((x, y) => y.lv - x.lv);
  S.warn = { active, report };
}

async function loadWx() {
  const f = await getJSON(`${JMA}forecast/data/forecast/${S.area.office}.json`);
  const ts = f[0].timeSeries;
  const w = ts[0].areas.find((x) => x.area.code === S.area.c10) || ts[0].areas[0];
  const p = ts[1].areas.find((x) => x.area.code === S.area.c10) || ts[1].areas[0];
  // 気温は観測所ごと。事業所にいちばん近い所を使う
  let temps = null;
  if (ts[2] && S.table) {
    const near = ts[2].areas.map((x) => ({ x, d: dist(S.table[x.area.code]) })).filter((o) => Number.isFinite(o.d)).sort((m, n) => m.d - n.d)[0];
    if (near) temps = { times: ts[2].timeDefines, vals: near.x.temps };
  }
  S.wx = {
    days: ts[0].timeDefines.slice(0, 2).map((t, i) => ({ t: new Date(t), code: w.weatherCodes[i], text: (w.weathers[i] || '').replace(/[\s　]+/g, ' ').trim() })),
    pops: ts[1].timeDefines.map((t, i) => ({ t: new Date(t), v: p.pops[i] })),
    temps,
  };
}
const deg = (v) => (Array.isArray(v) ? v[0] + v[1] / 60 : NaN);
const dist = (st) => (st ? Math.hypot((deg(st.lat) - cfg.lat) * 111, (deg(st.lon) - cfg.lon) * 93) : NaN);

async function loadObs() {
  if (!S.table) S.table = await getJSON(JMA + 'amedas/const/amedastable.json');
  const latest = (await (await fetch(JMA + 'amedas/data/latest_time.txt', { cache: 'no-store' })).text()).trim();
  const stamp = latest.replace(/[-:T]/g, '').slice(0, 14);
  const m = await getJSON(`${JMA}amedas/data/map/${stamp}.json`);
  // 気温を測っている、いちばん近い観測所
  const near = Object.keys(m).filter((k) => m[k].temp && S.table[k]).map((k) => ({ k, d: dist(S.table[k]) })).sort((a, b) => a.d - b.d)[0];
  if (!near) throw new Error('obs');
  const o = m[near.k];
  const val = (x) => (x && x[1] === 0 && x[0] != null ? x[0] : null);
  S.obs = { name: S.table[near.k].kjName, en: S.table[near.k].enName || '', km: Math.round(near.d), time: new Date(latest), temp: val(o.temp), r1: val(o.precipitation1h), r24: val(o.precipitation24h), wind: val(o.wind) };
}

const SHINDO = { '1': '1', '2': '2', '3': '3', '4': '4', '5-': '5弱', '5+': '5強', '6-': '6弱', '6+': '6強', '7': '7' };
const shindo = (s) => (getLang() === 'en' ? (s || '').replace('-', '−') : SHINDO[s]) || '—';
const shindoRank = (s) => ['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'].indexOf(s);
async function loadQuakes() {
  const list = await getJSON(JMA + 'quake/data/list.json');
  const pref = cfg.muni.slice(0, 2), seen = new Set(), out = [];
  const limit = Date.now() - 7 * 864e5;
  for (const q of list) {
    if (seen.has(q.eid) || !q.at || !q.anm) continue; // 同じ地震の続報は新しいほうだけ
    const p = (q.int || []).find((x) => x.code === pref);
    if (!p) continue;
    const at = Date.parse(q.at);
    if (!(at > limit)) continue;
    seen.add(q.eid);
    const city = (p.city || []).find((c) => c.code.startsWith(cfg.muni));
    out.push({ at: new Date(at), place: q.anm, en: q.en_anm || '', mag: q.mag, pref: p.maxi, city: city ? city.maxi : null });
    if (out.length >= 3) break;
  }
  S.quakes = out;
}

// 訓練の表示：見本の警報と地震
function applyDrill() {
  if (!cfg.drill) return;
  const now = Date.now();
  S.warn = { active: [{ code: '49', lv: 4 }, { code: '03', lv: 3 }, { code: '14', lv: 2 }], report: now - 12 * 6e4 };
  S.quakes = [{ at: new Date(now - 25 * 6e4), place: '熊本県熊本地方', en: 'Kumamoto Region, Kumamoto Prefecture', mag: '5.4', pref: '5+', city: '5-' }, ...(S.quakes || []).filter((q) => q.mag !== '5.4' || q.city !== '5-').slice(0, 2)];
}

// ── 表示：警報の帯 ──
function renderBand() {
  const band = $('band'), w = S.warn, n = areaName();
  const chips = $('bandChips'); chips.replaceChildren();
  const mark = $('bandMark'); mark.replaceChildren();
  const q = (S.quakes || []).find((x) => x.city && shindoRank(x.city) >= 3 && Date.now() - x.at < 864e5);
  let cls = 'lv0', title, sub = '', act = false;
  if (!w) { title = T('警報・注意報を取りにいっています'); mark.textContent = '…'; }
  else {
    const top = w.active[0]?.lv || 0;
    for (const a of w.active) chips.appendChild(el('li', '', (LEVELED.has(a.code) ? T('レベル{n} ', { n: a.lv }) : '') + kindName(a.code)));
    const when = w.report ? ' ' + T('{t} 発表', { t: hm(new Date(w.report)) }) : '';
    if (top >= 5) { cls = 'lv5'; title = T('{n}に 特別警報が 出ています', { n }); sub = T('命を守る行動をとってください。') + when; act = true; }
    else if (top === 4) { cls = 'lv4'; title = T('{n}に 危険警報が 出ています', { n }); sub = T('市町村の避難情報を確かめ、危ない場所から離れてください。') + when; act = true; }
    else if (top === 3) { cls = 'lv3'; title = T('{n}に 警報が 出ています', { n }); sub = T('市町村の避難情報を確かめてください。') + when; act = true; }
    else if (top === 2) { cls = 'lv2'; title = T('{n}に 注意報が 出ています', { n }); sub = T('これからの情報に気をつけてください。') + when; }
    else { title = T('いま {n}に 警報・注意報は 出ていません', { n }); sub = T('気象庁の発表をもとに表示しています'); }
    // 「レベル」と呼ぶのは大雨・土砂災害・高潮だけ。暴風や大雪などは段階の名前で出す
    const leveled = w.active.some((a) => LEVELED.has(a.code) && a.lv === top);
    if (top >= 2) mark.append(el('span', '', T(leveled ? 'レベル' : top >= 5 ? '特別' : top >= 3 ? '警報' : '注意')), el('b', '', leveled ? String(top) : '！'));
    else mark.append(el('b', '', '—'));
  }
  if (q && (cls === 'lv0' || cls === 'lv2')) {
    cls = 'quake'; act = true;
    title = T('{n}で 震度{s}の 地震がありました', { n, s: shindo(q.city) });
    sub = T('{d} {t}ごろ。身のまわりの安全を確かめてください。', { d: dateLong(q.at), t: hm(q.at) });
    mark.replaceChildren(el('span', '', T('震度')), el('b', '', shindo(q.city)));
  }
  band.className = 'band ' + cls;
  $('bandTitle').textContent = title; $('bandSub').textContent = sub;
  $('bandBtn').hidden = !act || current === 'action';
}

// ── 表示：天気 ──
function wxIcon(code) {
  const k = String(code || '')[0];
  const sun = '<circle cx="50" cy="50" r="20" fill="#FF9F1C"/><g stroke="#FF9F1C" stroke-width="6" stroke-linecap="round"><path d="M50 10v10M50 80v10M10 50h10M80 50h10M22 22l7 7M71 71l7 7M22 78l7-7M71 29l7-7"/></g>';
  const cloud = (f, y) => `<path d="M28 ${y}a16 16 0 0 1 2-32 22 22 0 0 1 42 4 14 14 0 0 1 0 28z" fill="${f}"/>`;
  let body = cloud('#8A99AD', 72);
  if (k === '1') body = sun;
  else if (k === '3') body = cloud('#6B7C93', 62) + '<g stroke="#1556B0" stroke-width="6" stroke-linecap="round"><path d="M34 78l-4 12M50 78l-4 12M66 78l-4 12"/></g>';
  else if (k === '4') body = cloud('#8A99AD', 62) + '<g fill="#5AA9E6"><circle cx="34" cy="86" r="5"/><circle cx="50" cy="86" r="5"/><circle cx="66" cy="86" r="5"/></g>';
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;
}
const WX_WORD = { '1': '晴れ', '2': 'くもり', '3': '雨', '4': '雪' };
function renderWx() {
  const w = S.wx; if (!w) return;
  const ja = getLang() === 'ja';
  $('wxArea').textContent = (getLang() === 'en' && S.area.c10en) || S.area.c10name;
  const box = $('wxDays'); box.replaceChildren();
  const today = new Date().getDate();
  w.days.forEach((d) => {
    const c = el('div', 'wx-day');
    c.append(el('p', 'd', `${T(d.t.getDate() === today ? 'きょう' : 'あす')} ${ja ? `${dateShort(d.t)}（${WD.ja[d.t.getDay()]}）` : dateShort(d.t)}`));
    const ic = el('div'); ic.innerHTML = wxIcon(d.code); c.append(ic.firstChild);
    // 日本語は気象庁の文のまま。ほかの言語は天気の区分だけを言葉にする
    c.append(el('p', 't', ja ? d.text : T(WX_WORD[String(d.code || '')[0]] || 'くもり')));
    const tp = el('p', 'temp');
    if (w.temps) {
      const idx = w.temps.times.map((t, i) => ({ t: new Date(t), v: w.temps.vals[i] })).filter((o) => o.t.getDate() === d.t.getDate() && o.v !== '');
      const lo = idx.find((o) => o.t.getHours() === 0), hi = idx.find((o) => o.t.getHours() === 9);
      if (lo && hi && Number(lo.v) < Number(hi.v)) { tp.append(T('最低 '), el('span', 'lo', lo.v + '℃'), '　'); }
      if (hi) tp.append(T('最高 '), el('span', 'hi', hi.v + '℃'));
    }
    c.append(tp); box.append(c);
  });
  const pops = $('pops'); pops.replaceChildren();
  w.pops.filter((p) => p.t.getTime() + 6 * 36e5 > Date.now()).slice(0, 4).forEach((p) => {
    const b = el('div', 'pop' + (Number(p.v) >= 50 ? ' wet' : ''));
    const h = el('p', 'h', T(p.t.getDate() === today ? 'きょう' : 'あす')); h.append(el('br'), T('{a}〜{b}時', { a: p.t.getHours(), b: p.t.getHours() + 6 })); b.append(h);
    const v = el('p', 'v', p.v); v.append(el('small', '', '%')); b.append(v); pops.append(b);
  });
  let pt = $('popsTitle'); if (!pt) { pt = el('p', 'pops-title'); pt.id = 'popsTitle'; pops.before(pt); }
  pt.textContent = T('雨のふる確率');
}
function renderObs() {
  const o = S.obs; if (!o) return;
  $('obsWhere').textContent = T('{n}の観測所（約{k}km）{t}', { n: (getLang() === 'en' && o.en) || o.name, k: o.km, t: hm(o.time) });
  const box = $('obs'); box.replaceChildren();
  const cell = (k, v, u) => { const d = el('div'); d.append(el('p', 'k', T(k))); const p = el('p', 'v', v == null ? '—' : String(v)); if (v != null) p.append(el('small', '', u)); d.append(p); return d; };
  box.append(cell('気温', o.temp, '℃'), cell('この1時間の雨', o.r1, 'mm'), cell('24時間の雨', o.r24, 'mm'), cell('風の強さ', o.wind, T('m/秒')));
}
function renderQuakes() {
  const ul = $('quakes'); ul.replaceChildren();
  $('qkScope').textContent = T('この7日間');
  const qs = S.quakes;
  if (!qs) return;
  if (!qs.length) { ul.append(el('li', 'empty', T('この7日間、県内でゆれを感じる地震は発表されていません。'))); return; }
  for (const q of qs) {
    const li = el('li'), own = q.city, s = own || q.pref;
    const b = el('div', 'shindo s' + (shindoRank(s) >= 8 ? 7 : shindoRank(s) >= 6 ? 6 : shindoRank(s) >= 4 ? 5 : shindoRank(s) + 1));
    b.append(el('span', '', T(own ? '震度' : '県内最大')), el('b', '', shindo(s)));
    const t = el('div');
    t.append(el('p', 'q1', `${dateShort(q.at)} ${hm(q.at)}　${(getLang() === 'en' && q.en.split(',')[0]) || q.place}`));
    t.append(el('p', 'q2', own ? T('{n}のゆれ／県内最大 震度{s}・M{m}', { n: areaName(), s: shindo(q.pref), m: q.mag }) : T('{n}では震度1以上の発表なし・M{m}', { n: areaName(), m: q.mag })));
    li.append(b, t); ul.append(li);
  }
}

// ── ライフライン ──
const ICON = {
  power: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', water: '<path d="M12 2s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z"/>',
  net: '<path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1.5"/>',
  gas: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 2 4-5z"/>', road: '<path d="M8 2 4 22M16 2l4 20M12 4v3M12 11v3M12 18v3"/>',
  building: '<path d="M4 22V4h10v18M14 10h6v12M8 8h2M8 12h2M8 16h2M2 22h20"/>',
  home: '<path d="M3 11 12 3l9 8M5 10v11h14V10"/>', map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>', run: '<circle cx="14" cy="4" r="2"/><path d="M6 22l4-7-2-4 4-3 3 4h4M10 11l-4 1-1 4M13 15l3 3v4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', exit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
const INFRA = [
  { id: 'power', name: '電気' }, { id: 'water', name: '水道' }, { id: 'net', name: 'インターネット', auto: true },
  { id: 'gas', name: 'ガス' }, { id: 'road', name: 'まわりの道路' }, { id: 'building', name: '建物・設備' },
];
const STATE = { ok: '使える', part: '一部だけ', ng: '使えない', unk: '確かめ中' };
function infraState(i) {
  if (i.auto) return S.failed ? { s: 'ng', label: 'つながらない' } : S.lastOk ? { s: 'ok', label: 'つながる' } : { s: 'unk', label: '確かめ中' };
  const v = cfg.infra[i.id];
  return v ? { s: v.s, label: STATE[v.s], t: v.t } : { s: 'unk', label: '記録なし' };
}
function renderInfra() {
  const mini = $('infraMini'), list = $('infraList'); mini.replaceChildren(); list.replaceChildren();
  for (const i of INFRA) {
    const st = infraState(i);
    const li = el('li'); li.append(el('span', '', T(i.name)), el('span', 'st ' + st.s, T(st.label))); mini.append(li);
    const it = el('li', 'infra-item' + (st.s === 'ng' ? ' is-ng' : ''));
    const hd = el('div', 'hd'); hd.innerHTML = svg(i.id); hd.append(el('span', 'nm', T(i.name)));
    if (st.t) { const d = new Date(st.t); hd.append(el('span', 'when', T('{d} {t} に記録', { d: dateShort(d), t: hm(d) }))); }
    it.append(hd);
    if (i.auto) {
      const p = el('p', 'auto'); p.append(el('span', 'st ' + st.s, T(st.label)), T(' この画面が自動で確かめています')); it.append(p);
    } else {
      const ch = el('div', 'choices');
      for (const s of ['ok', 'part', 'ng', 'unk']) {
        const b = el('button', s, T(STATE[s])); b.type = 'button'; b.setAttribute('aria-pressed', String(cfg.infra[i.id]?.s === s));
        b.addEventListener('click', () => { cfg.infra[i.id] = { s, t: Date.now() }; saveCfg(); renderInfra(); });
        ch.append(b);
      }
      it.append(ch);
    }
    list.append(it);
  }
}
const LINKS = [
  { nm: '停電の情報', by: '九州電力送配電', url: 'https://www.kyuden.co.jp/td_teiden/kyushu.html' },
  { nm: '道路の通行止め・渋滞', by: '日本道路交通情報センター', url: 'https://www.jartic.or.jp/' },
  { nm: '川の水位・カメラ', by: '国土交通省 川の防災情報', url: 'https://www.river.go.jp/' },
  { nm: '避難所・避難情報', by: '熊本県 防災情報', url: 'https://www.bousai.pref.kumamoto.jp/' },
  { nm: '列車の運行', by: 'JR九州', url: 'https://www.jrkyushu.co.jp/trains/unkou.php' },
  { nm: '家族の伝言を残す・聞く', by: '災害用伝言板 web171', url: 'https://www.web171.jp/' },
];
function drawQR(canvas, text, level = 'M') {
  const q = window.qrcode(0, level); q.addData(text, 'Byte'); q.make();
  const n = q.getModuleCount(), m = 2, size = n + m * 2;
  canvas.width = size; canvas.height = size;
  const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, size, size); c.fillStyle = '#000';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) c.fillRect(x + m, y + m, 1, 1);
}
function renderLinks() {
  const ul = $('qrList'); ul.replaceChildren();
  for (const l of LINKS) {
    const li = el('li'), cv = el('canvas'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', T(l.nm) + ' QR');
    drawQR(cv, l.url); li.append(cv, el('p', 'nm', T(l.nm)), el('p', 'by', l.by)); ul.append(li);
  }
}
function renderAction() {
  $('meetPlace').textContent = cfg.meet || T('（設定で入れてください）');
  const ul = $('contacts'); ul.replaceChildren();
  for (const line of cfg.contacts.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8)) {
    const [a, b] = line.split(/[｜|]/); const li = el('li'); li.append(el('span', '', (a || '').trim()), el('b', '', (b || '').trim())); ul.append(li);
  }
}

// ── 地図 ──
const ATTR_GSI = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
const ATTR_HZ = '<a href="https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html" target="_blank" rel="noopener">ハザードマップポータルサイト</a>';
const ATTR_JMA = '<a href="https://www.jma.go.jp/" target="_blank" rel="noopener">気象庁</a>';
// 凡例は［色・種類・中身］
const RAIN_LG = [['#A0D2FF', '弱い雨'], ['#0041FF', 'やや強い雨'], ['#FAF500', '強い雨'], ['#FF9900', '激しい雨'], ['#FF2800', '非常に激しい雨'], ['#B40068', '猛烈な雨']];
const KIKI_LG = [['#F2E700', '注意'], ['#FF2800', '警戒'], ['#AA00AA', '危険'], ['#0C000C', '災害切迫']];
const LAYERS = [
  { id: 'rain', group: 'live', name: '雨雲', chip: '#0041FF', on: true, legend: RAIN_LG.map(([c, t]) => [c, '雨雲', t]) },
  { id: 'land', group: 'live', name: '土砂災害の危険度（キキクル）', chip: '#AA00AA', on: false, legend: KIKI_LG.map(([c, t]) => [c, '危険度', t]) },
  { id: 'inund', group: 'live', name: '浸水の危険度（キキクル）', chip: '#FF2800', on: false, legend: KIKI_LG.map(([c, t]) => [c, '危険度', t]) },
  { id: 'flood', group: 'hazard', name: '洪水で水につかる深さ', chip: '#FFB7B7', on: true, dir: '01_flood_l2_shinsuishin_data',
    legend: [['#F7F5A9', '洪水', '0.5m未満'], ['#FFD8C0', '洪水', '0.5〜3m（1階がつかる）'], ['#FFB7B7', '洪水', '3〜5m（2階までつかる）'], ['#FF9191', '洪水', '5〜10m'], ['#F285C9', '洪水', '10〜20m'], ['#DC7ADC', '洪水', '20m以上']] },
  { id: 'doseki', group: 'hazard', name: '土石流', chip: '#E6C832', on: true, dir: '05_dosekiryukeikaikuiki', legend: [['#E6C832', '土石流', '警戒区域'], ['#A50021', '土石流', '特別警戒区域']] },
  { id: 'kyukei', group: 'hazard', name: 'がけ崩れ', chip: '#FAE600', on: true, dir: '05_kyukeishakeikaikuiki', legend: [['#FAE600', 'がけ崩れ', '警戒区域'], ['#FA2800', 'がけ崩れ', '特別警戒区域']] },
  { id: 'jisuberi', group: 'hazard', name: '地すべり', chip: '#FF9900', on: true, dir: '05_jisuberikeikaikuiki', legend: [['#FF9900', '地すべり', '警戒区域']] },
];
const style = {
  version: 8,
  sources: { pale: { type: 'raster', tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'], tileSize: 256, minzoom: 5, maxzoom: 18, attribution: ATTR_GSI } },
  layers: [{ id: 'pale', type: 'raster', source: 'pale' }],
};
for (const l of LAYERS.filter((x) => x.dir)) {
  style.sources[l.id] = { type: 'raster', tiles: [HAZARD + l.dir + '/{z}/{x}/{y}.png'], tileSize: 256, minzoom: 2, maxzoom: 17, attribution: ATTR_HZ };
  style.layers.push({ id: l.id, type: 'raster', source: l.id, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.7 } });
}
let map = null, marker = null;
function initMap() {
  $('slotNow').append($('map'));
  map = new maplibregl.Map({ container: 'map', style, center: [cfg.lon, cfg.lat], zoom: 9.6, minZoom: 9, maxZoom: 17, attributionControl: false, dragRotate: false, pitchWithRotate: false });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.AttributionControl({ compact: false }));
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
  const pin = el('div', 'pin');
  pin.innerHTML = '<svg viewBox="0 0 30 40" width="42" height="56" aria-hidden="true"><path d="M15 1C7.3 1 1 7.2 1 14.9 1 25 15 39 15 39s14-14 14-24.1C29 7.2 22.7 1 15 1z" fill="#17365D" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5.5" fill="#FFB300"/></svg>';
  marker = new maplibregl.Marker({ element: pin, anchor: 'bottom' }).setLngLat([cfg.lon, cfg.lat]).addTo(map);
  map.on('load', () => { applyLayers(); loadLiveTiles(); });
  window.__map = map;
}
// 「いま」は雨雲だけ、「地図」は選んだ情報を出す
function applyLayers() {
  if (!map || !map.isStyleLoaded()) return;
  for (const l of LAYERS) {
    if (!map.getLayer(l.id)) continue;
    const show = current === 'map' ? l.on : l.id === 'rain';
    map.setLayoutProperty(l.id, 'visibility', show ? 'visible' : 'none');
  }
}
// 雨雲とキキクルは時刻ごとに配信先が変わるので、新しい時刻に差し替える
function setLive(id, url, opacity) {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
  map.addSource(id, { type: 'raster', tiles: [url], tileSize: 256, minzoom: 10, maxzoom: 10, attribution: ATTR_JMA });
  map.addLayer({ id, type: 'raster', source: id, layout: { visibility: 'none' }, paint: { 'raster-opacity': opacity } });
}
const stampDate = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12)));
const renderRainTime = () => { if (S.rainTime) $('rainTime').textContent = T('{t} 時点', { t: hm(stampDate(S.rainTime)) }); };
async function loadLiveTiles() {
  if (!map || !map.isStyleLoaded()) return;
  try {
    const n = (await getJSON(JMA + 'jmatile/data/nowc/targetTimes_N1.json'))[0];
    if (n && n.basetime !== S.rainTime) {
      setLive('rain', `${JMA}jmatile/data/nowc/${n.basetime}/none/${n.validtime}/surf/hrpns/{z}/{x}/{y}.png`, 0.75);
      S.rainTime = n.basetime;
    }
    renderRainTime();
  } catch { /* 取れなかったら前の表示を残す */ }
  try {
    const r = (await getJSON(JMA + 'jmatile/data/risk/targetTimes.json')).find((x) => x.member === 'immed0');
    if (r && r.basetime !== S.riskTime) {
      for (const e of ['land', 'inund']) setLive(e, `${JMA}jmatile/data/risk/${r.basetime}/immed0/${r.validtime}/surf/${e}/{z}/{x}/{y}.png`, 0.7);
      S.riskTime = r.basetime;
    }
  } catch { /* 同上 */ }
  applyLayers();
}
function legendList(ul, rows) { ul.replaceChildren(); for (const [c, a, b] of rows) { const li = el('li'), sw = el('span', 'sw'); sw.style.background = c; li.append(sw, el('span', '', pair(a, b))); ul.append(li); } }
function renderLayerButtons() {
  for (const g of ['live', 'hazard']) {
    const box = $(g === 'live' ? 'layersLive' : 'layersHazard'); box.replaceChildren();
    for (const l of LAYERS.filter((x) => x.group === g)) {
      const b = el('button', 'layer'); b.type = 'button'; b.setAttribute('aria-pressed', String(l.on));
      const chip = el('span', 'chip'); chip.style.background = l.chip;
      const st = el('span', 'state', T(l.on ? '表示中' : '消してある'));
      b.append(chip, el('span', '', T(l.name)), st);
      b.addEventListener('click', () => { l.on = !l.on; b.setAttribute('aria-pressed', String(l.on)); st.textContent = T(l.on ? '表示中' : '消してある'); applyLayers(); renderMapLegend(); });
      box.append(b);
    }
  }
}
function renderMapLegend() {
  const rows = [], seen = new Set();
  for (const l of LAYERS.filter((x) => x.on)) for (const r of l.legend) { if (!seen.has(r.join())) { seen.add(r.join()); rows.push(r); } }
  legendList($('lgMap'), rows.length ? rows : [['#fff', null, '重ねる情報を選んでください']]);
}

// ── 画面の切りかえ ──
let current = 'now';
function go(view) {
  current = view;
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.go === view)));
  if (map && (view === 'now' || view === 'map')) {
    $(view === 'now' ? 'slotNow' : 'slotMap').append($('map'));
    map.resize();
    map.jumpTo({ center: [cfg.lon, cfg.lat], zoom: view === 'now' ? 9.6 : 13 });
    applyLayers();
  }
  if (view === 'settings') fillForm();
  renderBand();
}
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
$('bandBtn').addEventListener('click', () => go('action'));
$('toSite').addEventListener('click', () => map && map.easeTo({ center: [cfg.lon, cfg.lat], zoom: 13 }));

// さわらない間は順番に切りかえる（設定の画面と、スマホ用の窓が開いている間は止める）
let lastTouch = Date.now(), lastTurn = Date.now();
for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { lastTouch = Date.now(); }, { passive: true });
const ORDER = ['now', 'map', 'infra', 'action'];
function rotate() {
  if (!cfg.rotate || current === 'settings' || $('share').open) return;
  const now = Date.now();
  if (now - lastTouch < 120e3 || now - lastTurn < 25e3) return;
  lastTurn = now;
  go(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
}

// ── 時計と通信の表示 ──
function tick() {
  const d = new Date();
  $('date').textContent = dateLong(d);
  $('time').textContent = `${d.getHours()}:${pad(d.getMinutes())}`;
  rotate();
}
function renderNet() {
  const n = $('net');
  if (S.failed) { n.className = 'net off'; $('netText').textContent = S.lastOk ? T('通信できません（{t} の情報を表示中）', { t: hm(new Date(S.lastOk)) }) : T('通信できません。情報を表示できません'); }
  else if (S.lastOk) { n.className = 'net on'; $('netText').textContent = T('{t} に更新', { t: hm(new Date(S.lastOk)) }); }
  else $('netText').textContent = T('情報を取りにいっています');
}

// ── 言葉の切りかえ ──
// はじめから画面にある言葉（見出し・手順など）は、もとの日本語を覚えておいて差し替える
const fixed = [];
(function collect() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement;
    if (!p || p.closest('script, [data-view="settings"], #map, #langs')) continue;
    const key = n.textContent.trim();
    if (key && DICT.zh[key]) fixed.push({ n, key, lead: /^\s/.test(n.textContent) ? ' ' : '', tail: /\s$/.test(n.textContent) ? ' ' : '' });
  }
})();
function renderAll() {
  for (const f of fixed) f.n.textContent = f.lead + T(f.key) + f.tail;
  document.title = T('防災ボード');
  legendList($('lgRainNow'), RAIN_LG.map(([c, t]) => [c, null, t]));
  renderLayerButtons(); renderMapLegend(); renderLinks(); renderAction();
  renderBand(); renderWx(); renderObs(); renderQuakes(); renderInfra(); renderNet(); renderRainTime(); renderFs();
  tick();
  document.querySelectorAll('#langs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
}
for (const [code, label] of LANGS) {
  const b = el('button', '', label); b.type = 'button'; b.dataset.lang = code; b.lang = code === 'zh' ? 'zh-Hant' : code;
  b.addEventListener('click', () => { cfg.lang = code; setLangCode(code); saveCfg(); renderAll(); });
  $('langs').append(b);
}

// ── 全画面（ブラウザの枠を消して、画面いっぱいに映す）──
const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const fsCan = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
function renderFs() {
  const b = $('fsBtn'); b.hidden = !fsCan;
  b.firstElementChild.innerHTML = svg(fsOn() ? 'exit' : 'full');
  $('fsText').textContent = T(fsOn() ? '全画面をやめる' : '全画面');
  b.setAttribute('aria-pressed', String(fsOn()));
}
async function toggleFs() {
  const d = document, e = d.documentElement;
  try {
    if (fsOn()) await (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else await (e.requestFullscreen || e.webkitRequestFullscreen).call(e, { navigationUI: 'hide' });
  } catch { /* 端末が断ったときは、そのままの表示で続ける */ }
  renderFs();
}
$('fsBtn').addEventListener('click', toggleFs);
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => { renderFs(); if (map) setTimeout(() => map.resize(), 100); });
addEventListener('resize', () => { if (map) map.resize(); });

// ── スマホで見る（この事業所の設定を入れたリンクのQR）──
$('shareBtn').addEventListener('click', () => {
  const url = shareUrl();
  drawQR($('shareQr'), url, 'L');
  $('shareName').textContent = cfg.name;
  $('share').showModal();
});
$('shareClose').addEventListener('click', () => $('share').close());
$('share').addEventListener('click', (e) => { if (e.target === $('share')) $('share').close(); });

// ── 情報を取りにいく ──
async function refresh() {
  let ok = 0;
  const run = async (fn) => { try { await fn(); ok++; } catch { /* 取れなかった分は前の表示を残す */ } };
  if (!S.area) await run(resolveArea);
  if (S.area) {
    await run(loadObs);
    await Promise.all([run(loadWarn), run(loadWx), run(loadQuakes)]);
  }
  S.failed = ok === 0 || !S.area;
  if (ok) S.lastOk = Date.now();
  applyDrill();
  renderBand(); renderWx(); renderObs(); renderQuakes(); renderInfra(); renderNet();
  loadLiveTiles();
}

// ── 設定の画面（日本語のまま）──
let pending = null;
function fillForm() {
  $('fName').value = cfg.name; $('fAddr').value = cfg.addr; $('fMeet').value = cfg.meet; $('fContacts').value = cfg.contacts;
  $('fRotate').checked = cfg.rotate; $('fDrill').checked = cfg.drill;
  $('fMsg').className = 'msg'; $('fMsg').textContent = `いまの位置：${cfg.muniName}（${cfg.addr}）`; $('fSaved').textContent = ''; pending = null;
  $('fLink').value = shareUrl(); $('fCopied').textContent = '';
}
$('fFind').addEventListener('click', async () => {
  const q = $('fAddr').value.trim(), msg = $('fMsg');
  msg.className = 'msg';
  if (!q) { msg.className = 'msg err'; msg.textContent = '住所を入れてください。'; $('fAddr').focus(); return; }
  $('fFind').disabled = true; msg.textContent = '探しています…';
  try {
    const list = await getJSON('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q));
    if (!list.length) { msg.className = 'msg err'; msg.textContent = '見つかりませんでした。町名までにして、もう一度探してください。'; return; }
    const [lon, lat] = list[0].geometry.coordinates;
    const rev = await getJSON(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`);
    const muni = String(rev.results?.muniCd || '').padStart(5, '0');
    const area = await getJSON(JMA + 'common/const/area.json');
    const c20 = Object.keys(area.class20s).filter((k) => k.startsWith(muni)).sort()[0];
    if (!c20) { msg.className = 'msg err'; msg.textContent = 'この住所の市町村を特定できませんでした。'; return; }
    pending = { lat, lon, muni, muniName: area.class20s[c20].name, addr: q };
    msg.textContent = `「${list[0].properties.title}」の付近（${pending.muniName}）が見つかりました。「保存する」で切りかえます。`;
  } catch { msg.className = 'msg err'; msg.textContent = '住所を探せませんでした。通信を確かめて、もう一度押してください。'; }
  finally { $('fFind').disabled = false; }
});
$('fSave').addEventListener('click', () => {
  cfg.name = $('fName').value.trim().slice(0, 40) || DEFAULTS.name;
  cfg.meet = $('fMeet').value.trim().slice(0, 40);
  cfg.contacts = $('fContacts').value.slice(0, 400);
  cfg.rotate = $('fRotate').checked; cfg.drill = $('fDrill').checked;
  const moved = !!pending;
  if (pending) { Object.assign(cfg, pending); pending = null; }
  saveCfg();
  $('siteName').textContent = cfg.name; $('drill').hidden = !cfg.drill;
  renderAction();
  if (moved) { S.area = null; S.warn = null; S.wx = null; S.obs = null; S.quakes = null; marker?.setLngLat([cfg.lon, cfg.lat]); }
  $('fSaved').textContent = '保存しました。';
  $('fLink').value = shareUrl(); $('fCopied').textContent = '';
  refresh();
});
$('fCopy').addEventListener('click', async () => {
  const box = $('fLink'), msg = $('fCopied');
  try { await navigator.clipboard.writeText(box.value); msg.textContent = 'コピーしました。'; }
  catch { box.focus(); box.select(); msg.textContent = '選んだ状態にしました。Ctrl＋C でコピーしてください。'; }
});

// ── はじめる ──
document.querySelectorAll('[data-ico]').forEach((s) => { s.innerHTML = svg(s.dataset.ico); });
$('siteName').textContent = cfg.name; $('drill').hidden = !cfg.drill;
renderAll(); setInterval(tick, 1000);
try { initMap(); } catch { $('slotNow').textContent = T('この端末では地図を表示できません。'); }
refresh(); setInterval(refresh, 120e3);
addEventListener('online', refresh); addEventListener('offline', () => { S.failed = true; renderNet(); renderInfra(); });
