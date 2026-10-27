// Teste 2.1.0: pictură spectrală (ton / zgomot), segmente cu export, comparare a două înregistrări.
// Rulare: PW_ROOT=/opt/npm-tools/ CHROMIUM_PATH=... node tests/paint-segments-compare-v21.test.mjs
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
function t(name, cond, extra) { if (cond) { ok++; console.log('  ok  ' + name); } else { bad++; console.log('  FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } }
const SR = 22050, DUR = 3, n = SR * DUR; // fișierele sunt la 22050 Hz; browserul le decodează la frecvența contextului audio
let S = 44100, NS = S * DUR;
function wav(fn) {
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(fn(i)), 44 + i * 2);
  return buf;
}
const tmp = (nm, b) => { const p = path.join(os.tmpdir(), nm + process.pid); fs.writeFileSync(p, b); return p; };
const wavA = tmp('es21-a.wav', wav((i) => 8000 * Math.sin(2 * Math.PI * 1000 * i / SR) + 8000 * Math.sin(2 * Math.PI * 3000 * i / SR)));
const wavB = tmp('es21-b.wav', wav((i) => 16384 * Math.sin(2 * Math.PI * 1000 * i / SR)));
const junk = tmp('es21-junk.wav', Buffer.from('nu sunt audio, doar text '.repeat(40)));

const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']});
async function open(lang) {
  const ctx = await b.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: 'block', acceptDownloads: true});
  if (lang) await ctx.addInitScript((l) => { try { localStorage.setItem('ecoul-spectral-settings', JSON.stringify({lang: l})); } catch (e) {} }, lang);
  let net = 0; await ctx.route(/^https?:/, (r) => { net++; r.abort(); });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (/Content Security|Refused/i.test(m.text())) errs.push('csp ' + m.text().slice(0, 120)); });
  await p.goto(FILE); await p.waitForTimeout(1200);
  return {ctx, p, errs, net: () => net};
}
async function load(p, f) {
  await p.setInputFiles('#fileInput', f || wavA);
  await p.waitForFunction(() => ES_BRUSH.channels().length > 0 && !document.getElementById('workspace').hidden, null, {timeout: 60000});
  await p.waitForFunction(() => !document.getElementById('btnBrushAdd').disabled, null, {timeout: 60000});
  await p.waitForTimeout(300);
  S = await p.evaluate(() => ES_BRUSH.sr()); NS = Math.round(S * DUR);
  await p.evaluate(() => { document.getElementById('toolSegments').open = true; document.getElementById('toolCompare').open = true; });
}
const GOERTZEL = `(ch, sr, f) => { const w = 2*Math.PI*f/sr, c = 2*Math.cos(w); let s0=0,s1=0,s2=0; for (let i=0;i<ch.length;i++){ s0 = ch[i] + c*s1 - s2; s2 = s1; s1 = s0; } return Math.sqrt(Math.max(0, s1*s1 + s2*s2 - c*s1*s2))*2/ch.length; }`;
// aplică lista curentă și întoarce diferența (rezultat − sursă) pe canalul 0
async function applyDiff(p) {
  await p.evaluate(() => { ES_BRUSH.result && (window.__prev = ES_BRUSH.result()); });
  await p.evaluate(() => { document.getElementById('resultPanel').hidden = true; });
  await p.evaluate(() => ES_BRUSH.apply());
  await p.waitForFunction(() => ES_BRUSH.result() !== null && !document.getElementById('resultPanel').hidden, null, {timeout: 90000});
  return p.evaluate(() => { const o = ES_BRUSH.channels()[0], r = ES_BRUSH.result().channels[0], d = new Float32Array(o.length); for (let i = 0; i < o.length; i++) d[i] = r[i] - o[i]; return Array.from(d); });
}
const rms = (a, s, e) => { let q = 0; for (let i = s; i < e; i++) q += a[i] * a[i]; return Math.sqrt(q / (e - s)); };
const db = (x) => 20 * Math.log10(x);

console.log('Pictură: ton, nivel RMS, localitate, determinism');
{
  const {ctx, p, errs, net} = await open();
  await load(p);
  const opts = await p.$$eval('#paintDb option', (o) => o.map((x) => +x.value));
  t('nivelurile oferite sunt toate ≤ −12 dBFS', opts.every((v) => v <= -12) && opts.includes(-12), opts);
  await p.selectOption('#paintMode', 'tone'); await p.selectOption('#paintDb', '-24');
  await p.evaluate(() => ES_BRUSH.setSelection({f0: 60, f1: 200, k0: 200, k1: 204}));
  await p.click('#btnPaintAdd');
  const txt = await p.textContent('#brushList');
  t('zona pictată apare în listă (RO), cu −24 dBFS', /pictat/.test(txt) && /-24|−24/.test(txt) && /ton/.test(txt), txt);
  const d1 = await applyDiff(p);
  const a = Math.floor(1.0 * S), z = Math.floor(2.0 * S);
  const r = rms(d1, a, z);
  t('RMS-ul sunetului adăugat ≈ −24 dBFS (±1 dB)', Math.abs(db(r) - (-24)) < 1.0, db(r));
  const outside = Math.max(rms(d1, Math.floor(0.05 * S), Math.floor(0.5 * S)), rms(d1, Math.floor(2.6 * S), Math.floor(2.95 * S)));
  t('în afara intervalului de timp: neatins (< −60 dBFS)', db(outside) < -60, db(outside));
  const G = await p.evaluate(([src, d]) => { const g = eval(src); const sr = ES_BRUSH.sr(); const x = Float32Array.from(d).slice(Math.floor(1.0 * sr), Math.floor(2.0 * sr)); return {on: g(x, sr, 4350), off1: g(x, sr, 1000), off3: g(x, sr, 3000)}; }, [GOERTZEL, d1]);
  t('în frecvență: energie în banda pictată, nu la 1000/3000 Hz', G.on > 0.02 && G.off1 < G.on * 0.03 && G.off3 < G.on * 0.03, G);
  const d2 = await applyDiff(p);
  let same = d1.length === d2.length; for (let i = 0; same && i < d1.length; i++) if (d1[i] !== d2[i]) same = false;
  t('determinism: două aplicări → rezultat identic', same);
  t('rezultat etichetat „labelBrush”', await p.evaluate(() => ES_BRUSH.result().labelKey === 'labelBrush'));
  await p.click('#btnBrushUndo');
  t('anulare scoate zona pictată', (await p.locator('#brushList .brush-row').count()) === 0);
  t('0 erori / 0 rețea', errs.length === 0 && net() === 0, errs);
  await ctx.close();
}

console.log('Pictură: zgomot, plafon −12 dBFS, pictură + atenuare');
{
  const {ctx, p, errs} = await open();
  await load(p);
  await p.selectOption('#paintMode', 'noise'); await p.selectOption('#paintDb', '-30');
  await p.evaluate(() => ES_BRUSH.setSelection({f0: 60, f1: 200, k0: 200, k1: 400}));
  await p.click('#btnPaintAdd');
  const d = await applyDiff(p);
  const r = rms(d, Math.floor(1.0 * S), Math.floor(2.0 * S));
  t('zgomot: RMS ≈ −30 dBFS (±1,5 dB)', Math.abs(db(r) - (-30)) < 1.5, db(r));
  t('zgomot: nimic înainte de zonă', db(rms(d, Math.floor(0.05 * S), Math.floor(0.5 * S))) < -60);
  // plafon: o zonă cu nivel cerut 0 dBFS este limitată la −12
  await p.click('#btnBrushClear');
  await p.evaluate(() => { ES_BRUSH.state().edits.push({kind: 'paint', mode: 'noise', level: 0, db: 0, f0: 60, f1: 200, k0: 200, k1: 400, fe: 1}); });
  const dc = await applyDiff(p);
  const rc = rms(dc, Math.floor(1.0 * S), Math.floor(2.0 * S));
  t('plafon: nivel cerut 0 dBFS → ≤ −11 dBFS RMS', db(rc) <= -11 && db(rc) > -13.5, db(rc));
  // pictură + atenuare suprapusă
  await p.click('#btnBrushClear');
  await p.selectOption('#paintMode', 'tone'); await p.selectOption('#paintDb', '-24');
  await p.evaluate(() => ES_BRUSH.setSelection({f0: 60, f1: 200, k0: 200, k1: 204})); await p.click('#btnPaintAdd');
  await p.selectOption('#brushDb', '-40');
  await p.evaluate(() => ES_BRUSH.setSelection({f0: 0, f1: 250, k0: 190, k1: 215})); await p.click('#btnBrushAdd');
  t('lista combină pictura și atenuarea (2 rânduri)', (await p.locator('#brushList .brush-row').count()) === 2);
  const dm = await applyDiff(p);
  t('pictură sub atenuare: sunetul adăugat scade > 30 dB', db(rms(dm, Math.floor(1.0 * S), Math.floor(2.0 * S))) < -24 - 30, db(rms(dm, Math.floor(1.0 * S), Math.floor(2.0 * S))));
  const keep = await p.evaluate((src) => { const g = eval(src), o = ES_BRUSH.channels()[0], rr = ES_BRUSH.result().channels[0]; const m = (x) => x.slice(Math.floor(o.length * .2), Math.floor(o.length * .8)); return [g(m(o), ES_BRUSH.sr(), 3000), g(m(rr), ES_BRUSH.sr(), 3000)]; }, GOERTZEL);
  t('tonul de 3000 Hz al sursei rămâne', Math.abs(keep[1] / keep[0] - 1) < 0.12, keep);
  t('0 erori', errs.length === 0, errs);
  await ctx.close();
}

console.log('Segmente: adăugare, listă, export CSV/JSON/WAV, reset');
{
  const {ctx, p, errs} = await open();
  await load(p);
  await p.click('#btnSegAdd'); // fără selecție
  t('fără selecție: eroare, niciun segment', !(await p.isHidden('#errorBox')) && (await p.evaluate(() => ES_BRUSH.segs().length)) === 0);
  await p.evaluate(() => ES_BRUSH.setSelection({f0: 20, f1: 60, k0: 5, k1: 50}));
  await p.fill('#segLabel', 'Intro');
  await p.click('#btnSegAdd');
  await p.evaluate(() => ES_BRUSH.setSelection({f0: 80, f1: 110, k0: 5, k1: 50}));
  await p.fill('#segLabel', '=cmd,"x"');
  await p.click('#btnSegAdd');
  t('două segmente în listă, sortate', (await p.locator('#segList .brush-row').count()) === 2 && (await p.evaluate(() => ES_BRUSH.segs()[0].label)) === 'Intro');
  t('textul rândului conține eticheta și secundele', /Intro · 0\.\d+–\d\.\d+ s/.test(await p.textContent('#segList')), await p.textContent('#segList'));
  const csv = await p.evaluate(() => ES_BRUSH.segCsv());
  const lines = csv.trim().split('\n');
  t('CSV: antet + 2 rânduri, etichetă periculoasă neutralizată și citată', lines[0] === 'label,start_s,end_s,duration_s' && lines.length === 3 && lines[1].startsWith('Intro,0.') && lines[2].startsWith(`"'=cmd,""x""",`), lines);
  const js = JSON.parse(await p.evaluate(() => ES_BRUSH.segJson()));
  t('JSON: sampleRate și 2 segmente cu durata = sfârșit − început', js.sampleRate === S && js.segments.length === 2 && Math.abs(js.segments[0].duration_s - (js.segments[0].end_s - js.segments[0].start_s)) < 0.002, js);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnSegCsv')]);
  t('descărcare CSV prin buton', /segmente\.csv$/.test(dl.suggestedFilename()) && fs.readFileSync(await dl.path(), 'utf8').startsWith('label,start_s'));
  const [dj] = await Promise.all([p.waitForEvent('download'), p.click('#btnSegJson')]);
  t('descărcare JSON prin buton', /\.json$/.test(dj.suggestedFilename()) && JSON.parse(fs.readFileSync(await dj.path(), 'utf8')).segments.length === 2);
  const [dw] = await Promise.all([p.waitForEvent('download'), p.locator('#segList .brush-row button').nth(1).click()]);
  const wb = fs.readFileSync(await dw.path());
  const exp = await p.evaluate(() => ES_BRUSH.segSlice(ES_BRUSH.segs()[0])[0].length);
  t('WAV de segment: antet RIFF/WAVE, 16 biți, lungime = felia', wb.toString('ascii', 0, 4) === 'RIFF' && wb.toString('ascii', 8, 12) === 'WAVE' && wb.readUInt16LE(34) === 16 && wb.readUInt32LE(40) === exp * 2, [wb.length, exp]);
  await p.locator('#segList .brush-row button').nth(0).click(); // ▶ nu trebuie să arunce
  await p.locator('#segList .brush-row button').nth(2).click(); // ✕
  t('ștergere segment', (await p.locator('#segList .brush-row').count()) === 1);
  await load(p, wavB);
  t('la încărcarea altui fișier segmentele se șterg', (await p.evaluate(() => ES_BRUSH.segs().length)) === 0 && (await p.isDisabled('#btnSegCsv')));
  t('0 erori', errs.length === 0, errs);
  await ctx.close();
}

console.log('Comparare: LTAS pe benzi de 1/3 de octavă, tabel, CSV, aliniere, erori');
{
  const {ctx, p, errs, net} = await open();
  await load(p);
  const U = await p.evaluate(async () => {
    const sr = 44100, x = new Float32Array(sr * 2); for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * 1000 * i / sr);
    const r = await ES_BRUSH.cmpLTAS(x, sr); const i0 = ES_BRUSH.cmpBands.findIndex((f) => Math.abs(f - 1000) < 1e-6);
    return {db1k: r.db[i0], neighbours: [r.db[i0 - 3], r.db[i0 + 3]], rms: r.rms, nulls: r.db.filter((v) => v === null).length, nb: r.db.length};
  });
  t('sinus 0,5 la 1 kHz → bandă 1 kHz ≈ −9,0 dB (RMS² = 0,125)', Math.abs(U.db1k - (-9.03)) < 0.4, U.db1k);
  t('benzile vecine (±1 octavă) sunt cu > 40 dB mai jos', U.neighbours.every((v) => v === null || v < U.db1k - 40), U.neighbours);
  t('benzile fără bin sau peste Nyquist sunt omise (null)', U.nulls > 0 && U.nulls < U.nb, U);
  t('buton A/B și CSV dezactivate până la încărcarea lui B', (await p.isDisabled('#btnCmpPlayA')) && (await p.isDisabled('#btnCmpCsv')) && !(await p.isDisabled('#btnCmpLoad')));
  await p.setInputFiles('#cmpFile', junk);
  await p.waitForFunction(() => !document.getElementById('errorBox').hidden, null, {timeout: 20000});
  t('fișier ne-audio ca B: mesaj de eroare, fără stare', /decoda/.test(await p.textContent('#errorBox')) && (await p.evaluate(() => ES_BRUSH.cmpState().B)) === null);
  await p.setInputFiles('#cmpFile', wavB);
  await p.waitForFunction(() => ES_BRUSH.cmpState().B !== null, null, {timeout: 60000});
  await p.waitForTimeout(200);
  const rows = await p.evaluate(() => ES_BRUSH.cmpRows());
  const r1k = rows.find((r) => Math.abs(r.fc - 1000) < 1e-6), r3k = rows.find((r) => Math.abs(r.fc - 3174.8) < 2);
  t('A la 1 kHz ≈ −15,2 dB; B ≈ −9,0 dB; diferența ≈ +6,2 dB', Math.abs(r1k.a + 15.2) < 0.6 && Math.abs(r1k.b + 9.0) < 0.6 && Math.abs(r1k.d - 6.2) < 0.8, r1k);
  t('banda 3175 Hz: A conține tonul de 3 kHz, B nu (B−A < −40 dB)', Math.abs(r3k.a + 15.2) < 0.6 && r3k.d < -40, r3k);
  t('tabel: antet RO + un rând per bandă comună', /bandă \(Hz\)/.test(await p.textContent('#cmpTableWrap th')) && (await p.locator('#cmpTableWrap tr').count()) === rows.length + 1);
  t('grafic vizibil, cu aria-label, A/B și CSV active', (await p.isVisible('#cmpCanvas')) && /benzi comparate/.test(await p.getAttribute('#cmpCanvas', 'aria-label')) && !(await p.isDisabled('#btnCmpPlayA')) && !(await p.isDisabled('#btnCmpPlayB')) && !(await p.isDisabled('#btnCmpCsv')));
  const [dc] = await Promise.all([p.waitForEvent('download'), p.click('#btnCmpCsv')]);
  const csv = fs.readFileSync(await dc.path(), 'utf8').trim().split('\n');
  t('CSV: antet band_hz,A_db,B_db,B_minus_A_db și un rând per bandă', csv[0] === 'band_hz,A_db,B_db,B_minus_A_db' && csv.length === rows.length + 1, csv.slice(0, 2));
  await p.check('#cmpAlign');
  const rows2 = await p.evaluate(() => ES_BRUSH.cmpRows());
  const r1k2 = rows2.find((r) => Math.abs(r.fc - 1000) < 1e-6);
  t('aliniere RMS: B coboară cu ≈ 3,2 dB (RMS 0,354 → 0,244)', Math.abs((r1k.b - r1k2.b) - 3.2) < 0.4, [r1k.b, r1k2.b]);
  t('informația arată câștigul aplicat', /-3\.\d dB/.test(await p.textContent('#cmpInfo')), await p.textContent('#cmpInfo'));
  await p.click('#btnCmpPlayA'); await p.click('#btnCmpPlayB');
  await load(p, wavB);
  t('la încărcarea altui fișier comparația se resetează', (await p.evaluate(() => ES_BRUSH.cmpState().A)) === null && (await p.isHidden('#cmpCanvas')) && (await p.isDisabled('#btnCmpCsv')));
  t('0 erori / 0 rețea', errs.length === 0 && net() === 0, errs);
  await ctx.close();
}

console.log('i18n: EN, alte limbi cu rezervă engleză, secțiuni accesibile');
{
  const {ctx, p, errs} = await open();
  await load(p);
  await p.selectOption('#langSelect', 'en'); await p.waitForTimeout(300);
  t('EN: pictură, segmente, comparare', /painted area/.test(await p.textContent('#btnPaintAdd')) && /Segments/.test(await p.textContent('#toolSegments summary')) && /Compare two recordings/.test(await p.textContent('#toolCompare summary')));
  t('EN: placeholder și aria-label', (await p.getAttribute('#segLabel', 'placeholder')) === 'segment label' && /second recording/.test(await p.getAttribute('#cmpFile', 'aria-label')));
  await p.evaluate(() => ES_BRUSH.setSelection({f0: 60, f1: 200, k0: 200, k1: 204})); await p.click('#btnPaintAdd');
  t('EN: rândul de pictură tradus', /painted/.test(await p.textContent('#brushList')) && /tone/.test(await p.textContent('#brushList')));
  await p.selectOption('#langSelect', 'fr'); await p.waitForTimeout(300);
  t('FR: textele noi sunt traduse (nu cad pe engleză)', /zone peinte/.test(await p.textContent('#btnPaintAdd')) && !/painted area/.test(await p.textContent('#btnPaintAdd')) && !/Pinsel/.test(await p.textContent('#btnBrushApply')));
  for (const [lg, re] of [['it', /area dipinta/], ['es', /zona pintada/], ['pt', /zona pintada/], ['de', /gemalten Bereich/], ['hu', /festett terület/]]) {
    await p.selectOption('#langSelect', lg); await p.waitForTimeout(250);
    t(lg.toUpperCase() + ': pictură, segmente, comparare traduse (nu engleză)', re.test(await p.textContent('#btnPaintAdd')) && !/Segments|Compare two/.test(await p.textContent('#toolSegments summary') + await p.textContent('#toolCompare summary')));
  }
  await p.selectOption('#langSelect', 'ro'); await p.waitForTimeout(300);
  t('RO: revenire', /zonă pictată/.test(await p.textContent('#btnPaintAdd')));
  t('0 erori', errs.length === 0, errs);
  await ctx.close();
}
await b.close();
for (const f of [wavA, wavB, junk]) fs.unlinkSync(f);
console.log(`\n${ok} reușite, ${bad} eșuate`); process.exit(bad ? 1 : 0);
