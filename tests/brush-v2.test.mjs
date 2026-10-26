// Teste v2.0.0 pentru Ecoul Spectral: pensulă spectrală (zone atenuate, listă de parametri, anulare/refacere nelimitate, aplicare pe tot clipul).
// Rulare: node tests/brush-v2.test.mjs   (Playwright din /opt/node-tools, rețea blocată). Fără redare audio: se verifică masca și semnalul rezultat.
import {createRequire} from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
const require = createRequire(process.env.PW_ROOT || import.meta.url);
const {chromium} = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + path.resolve(here, '..', 'index.html');
let ok = 0, bad = 0;
function t(name, cond, extra) { if (cond) { ok++; console.log('  ok  ' + name); } else { bad++; console.log('  FAIL ' + name + (extra ? ' :: ' + JSON.stringify(extra) : '')); } }
// WAV mono 16 bit, 22050 Hz, 3 s: 1000 Hz + 3000 Hz, amplitudini egale
const SR = 22050, DUR = 3, n = SR * DUR, buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 1000 * i / SR) + 8000 * Math.sin(2 * Math.PI * 3000 * i / SR)), 44 + i * 2);
const wavPath = path.join(os.tmpdir(), 'es-brush-test-' + process.pid + '.wav'); fs.writeFileSync(wavPath, buf);

const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']});
async function open(lang) {
  const ctx = await b.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: 'block'});
  if (lang) await ctx.addInitScript((l) => { try { localStorage.setItem('ecoul-spectral-settings', JSON.stringify({lang: l})); } catch (e) {} }, lang);
  let net = 0; await ctx.route(/^https?:/, (r) => { net++; r.abort(); });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (/Content Security|Refused/i.test(m.text())) errs.push('csp ' + m.text().slice(0, 120)); });
  await p.goto(FILE); await p.waitForTimeout(1200);
  return {ctx, p, errs, net: () => net};
}
async function load(p) {
  await p.setInputFiles('#fileInput', wavPath);
  await p.waitForFunction(() => ES_BRUSH.channels().length > 0 && !document.getElementById('workspace').hidden, null, {timeout: 60000});
  await p.waitForTimeout(500);
  await p.waitForFunction(() => !document.getElementById('btnBrushAdd').disabled, null, {timeout: 60000});
}
// putere la o frecvență (Goertzel) pe un canal
const GOERTZEL = `(ch, sr, f) => { const w = 2*Math.PI*f/sr, c = 2*Math.cos(w); let s0=0,s1=0,s2=0; for (let i=0;i<ch.length;i++){ s0 = ch[i] + c*s1 - s2; s2 = s1; s1 = s0; } return Math.sqrt(Math.max(0, s1*s1 + s2*s2 - c*s1*s2))*2/ch.length; }`;

console.log('Masca: ponderi, compunere, margini');
{
  const {ctx, p, errs, net} = await open();
  const R = await p.evaluate(() => {
    const B = ES_BRUSH, e = {f0: 10, f1: 20, k0: 50, k1: 80, db: -20, fe: 1};
    const m1 = B.buildMask([e]), m2 = B.buildMask([e, e]);
    return {
      inside: m1(15, 60), g: B.dbToGain(-20), outside: m1(100, 60), outsideK: m1(15, 200), edge: m1(8.5, 60), edgeOut: m1(7, 60),
      comp: m2(15, 60), none: B.buildMask([])(15, 60), w0: B.weight(e, 15, 60), wEdge: B.weight(e, 10 - 1.5, 60), wSoft: B.weight({...e, fe: 4}, 10 - 6, 60),
      mute: B.buildMask([{...e, db: -40}])(15, 60)
    };
  });
  t('în interior: câștig = 10^(dB/20)', Math.abs(R.inside - R.g) < 1e-9 && Math.abs(R.g - 0.1) < 1e-9, R);
  t('în afara zonei: 1 (neatins)', R.outside === 1 && R.outsideK === 1);
  t('muchia moale: între câștig și 1', R.edge > R.g && R.edge < 1 && R.edgeOut === 1, [R.edge, R.edgeOut]);
  t('muchie mai largă (×4) → pondere parțială mai departe', R.wSoft > 0 && R.wEdge > 0 && R.wEdge < 1, [R.wSoft, R.wEdge]);
  t('două zone suprapuse se compun (−20 dB + −20 dB = −40 dB)', Math.abs(R.comp - 0.01) < 1e-9 && R.none === 1, R.comp);
  t('−40 dB ≈ 0,01', Math.abs(R.mute - 0.01) < 1e-9);
  t('0 erori / 0 rețea', errs.length === 0 && net() === 0, errs);
  await ctx.close();
}

console.log('E2E: încarcă, adaugă zonă, aplică, verifică spectrul');
{
  const {ctx, p, errs} = await open();
  await load(p);
  const info = await p.evaluate(() => ({sr: ES_BRUSH.sr(), N: ES_BRUSH.N, HOP: ES_BRUSH.HOP, ch: ES_BRUSH.channels().length, len: ES_BRUSH.channels()[0].length}));
  // bandă 900–1100 Hz pe tot clipul (k = Hz·N/sr)
  const k0 = Math.floor(900 * info.N / info.sr), k1 = Math.ceil(1100 * info.N / info.sr), fLast = Math.floor(info.len / info.HOP) - 2;
  await p.selectOption('#brushDb', '-40');
  await p.evaluate(([k0, k1, fl]) => { ES_BRUSH.setSelection({f0: 0, f1: fl, k0, k1}); }, [k0, k1, fLast]);
  await p.click('#btnBrushAdd');
  t('zona apare în listă și butoanele se activează', (await p.locator('#brushList .brush-row').count()) === 1 && !(await p.isDisabled('#btnBrushApply')) && !(await p.isDisabled('#btnBrushUndo')));
  t('lista conține intervalul în Hz', /(8|9)\d\d–1[01]\d\d Hz/.test(await p.textContent('#brushList')) && /-40/.test(await p.textContent('#brushList')), await p.textContent('#brushList'));
  await p.click('#btnBrushApply');
  await p.waitForFunction(() => ES_BRUSH.result() !== null, null, {timeout: 90000});
  const R = await p.evaluate((src) => {
    const g = eval(src), ch = ES_BRUSH.channels()[0], res = ES_BRUSH.result().channels[0], sr = ES_BRUSH.sr();
    const mid = (a) => a.slice(Math.floor(a.length * 0.2), Math.floor(a.length * 0.8));
    return {o1: g(mid(ch), sr, 1000), r1: g(mid(res), sr, 1000), o3: g(mid(ch), sr, 3000), r3: g(mid(res), sr, 3000), label: ES_BRUSH.result().labelKey};
  }, GOERTZEL);
  t('tonul de 1000 Hz scade cu > 30 dB', R.r1 < R.o1 * 0.03, R);
  t('tonul de 3000 Hz rămâne (±1 dB)', R.r3 > R.o3 * 0.89 && R.r3 < R.o3 * 1.12, R);
  t('rezultat etichetat „labelBrush”; panoul de rezultat vizibil', R.label === 'labelBrush' && (await p.isVisible('#resultPanel')));
  t('sursa rămâne neschimbată (aceeași lungime, 1 canal)', await p.evaluate((l) => ES_BRUSH.channels()[0].length === l, info.len));
  t('0 erori', errs.length === 0, errs);
  await ctx.close();
}

console.log('Anulare / refacere nelimitate, ștergere pe element, golire');
{
  const {ctx, p, errs} = await open();
  await load(p);
  await p.evaluate(() => { for (let i = 0; i < 25; i++) { ES_BRUSH.setSelection({f0: i * 3, f1: i * 3 + 10, k0: 20 + i, k1: 60 + i}); ES_BRUSH.add(); } });
  const cnt = () => p.evaluate(() => [ES_BRUSH.state().edits.length, ES_BRUSH.state().redo.length]);
  t('25 de zone adăugate (peste adâncimea de anulare a clipurilor, 5)', (await cnt())[0] === 25);
  await p.evaluate(() => { for (let i = 0; i < 25; i++) ES_BRUSH.undo(); });
  t('25 de anulări → listă goală, 25 în „refă”', JSON.stringify(await cnt()) === '[0,25]');
  await p.evaluate(() => { for (let i = 0; i < 25; i++) ES_BRUSH.redo(); });
  t('25 de refaceri → toate zonele înapoi, în aceeași ordine', await p.evaluate(() => { const e = ES_BRUSH.state().edits; return e.length === 25 && e[0].k0 === 20 && e[24].k0 === 44; }));
  await p.evaluate(() => ES_BRUSH.undo());
  await p.setInputFiles('#fileInput', []).catch(() => {});
  await p.evaluate(() => { ES_BRUSH.setSelection({f0: 1, f1: 9, k0: 5, k1: 30}); ES_BRUSH.add(); });
  t('adăugarea unei zone noi șterge „refă”', JSON.stringify(await cnt()) === '[25,0]', await cnt());
  await p.locator('#brushList .brush-row button').nth(3).click();
  t('ștergere pe element', (await cnt())[0] === 24);
  await p.click('#btnBrushUndo'); await p.click('#btnBrushRedo');
  t('butoanele anulează/refă din UI', (await cnt())[0] === 24);
  await p.click('#btnBrushClear');
  t('golire', JSON.stringify(await cnt()) === '[0,0]' && (await p.locator('#brushList .brush-row').count()) === 0 && (await p.isDisabled('#btnBrushApply')));
  await p.evaluate(() => { ES_BRUSH.setSelection(null); }); await p.click('#btnBrushAdd');
  t('fără selecție: eroare, nicio zonă', !(await p.isHidden('#errorBox')) && (await cnt())[0] === 0);
  await p.evaluate(() => { for (let i = 0; i < 90; i++) { ES_BRUSH.setSelection({f0: 1, f1: 9, k0: 5, k1: 30}); ES_BRUSH.add(); } });
  t('plafon de 80 de zone', (await cnt())[0] === 80);
  t('0 erori', errs.length === 0, errs);
  await ctx.close();
}

console.log('i18n (EN) și avertisment local');
{
  const {ctx, p, errs} = await open();
  await p.selectOption('#langSelect', 'en'); await p.waitForTimeout(300);
  t('secțiunea tradusă', /Spectral brush/.test(await p.textContent('#toolBrush summary')), await p.textContent('#toolBrush summary'));
  t('mesajul de listă goală tradus', /No areas yet/.test(await p.textContent('#brushList')));
  await p.selectOption('#langSelect', 'de'); await p.waitForTimeout(300);
  t('germană: butonul de aplicare', /Pinsel anwenden/.test(await p.textContent('#btnBrushApply')));
  t('0 erori', errs.length === 0, errs);
  await ctx.close();
}
await b.close(); fs.unlinkSync(wavPath);
console.log(`\n${ok} reușite, ${bad} eșuate`); process.exit(bad ? 1 : 0);
