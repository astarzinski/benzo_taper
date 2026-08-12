const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const E = require(path.join(__dirname, 'engine.js'));
const C = require(path.join(__dirname, 'codec.js'));
let pass = 0, fail = 0;
const ok = (label, cond, detail) => { (cond ? pass++ : fail++);
  console.log(`  ${cond ? 'PASS' : '*** FAIL ***'}  ${label}${detail ? '  — ' + detail : ''}`); };

(async () => {
  // ---------- P1: DST ----------
  console.log('P1  DST / calendar dates');
  for (const tz of ['America/Los_Angeles','America/New_York','Europe/London','UTC']) {
    const b = await chromium.launch(); const p = await b.newPage({ timezoneId: tz });
    await p.goto(URL);
    await p.click('#btn-agree'); await p.click('#med-opts button:nth-child(5)');
    const s = await p.$$('#freq-rows select'); await s[0].selectOption('BID'); await s[1].selectOption('BID');
    await p.waitForSelector('#dose-table select'); const d = await p.$$('#dose-table select');
    await d[0].selectOption('1'); await d[1].selectOption('1'); await d[2].selectOption('10'); await d[3].selectOption('10');
    await p.fill('#start-date','10/1/26'); await p.click('#btn-run');
    await p.click('#btn-wk-plus'); await p.click('#btn-wk-plus'); await p.click('#btn-wk-plus'); await p.click('#btn-wk-plus');
    const rows = await p.$$eval('#work-table tr', rs => rs.slice(2).map(r => {
      const c=[...r.children];
      const sel=c[7] && c[7].querySelector('select');
      return { wk: sel ? sel.value : null, dates: c[8] ? c[8].textContent.trim() : '' };
    }).filter(r=>r.wk));
    let mismatch = 0;
    for (const r of rows) {
      const m = r.dates.match(/(\d+)\/(\d+)\/(\d+)\s*[–-]\s*(\d+)\/(\d+)\/(\d+)/); if (!m) continue;
      const a = Date.UTC(2000+ +m[3], m[1]-1, m[2]), z = Date.UTC(2000+ +m[6], m[4]-1, m[5]);
      const days = (z-a)/86400000 + 1;
      const wk = parseInt(r.wk, 10);
      if (wk && days !== wk*7) mismatch++;
    }
    ok(`${tz}: every step spans exactly weeks×7 days`, mismatch === 0, `${mismatch} mis-spanned of ${rows.length}`);
    await b.close();
  }

  const b = await chromium.launch();
  const errs = [];
  const p = await b.newPage({ timezoneId: 'America/Los_Angeles' });
  p.on('pageerror', e => errs.push(e.message));
  const setup = async (med, freqs, doses, date) => {
    await p.goto(URL); await p.click('#btn-agree');
    await p.click(`#med-opts button:nth-child(${med})`);
    const s = await p.$$('#freq-rows select');
    for (let i=0;i<freqs.length;i++) await s[i].selectOption(freqs[i]);
    await p.waitForSelector('#dose-table select');
    const d = await p.$$('#dose-table select');
    for (let i=0;i<doses.length;i++) await d[i].selectOption(doses[i]);
    await p.fill('#start-date', date); await p.click('#btn-run'); await p.click('#btn-finalize');
  };

  // ---------- P2 ----------
  console.log('\nP2  dispense-from must not rewrite handout strengths');
  await setup(5, ['BID','BID'], ['1','1','10','10'], '1/1/26');
  const before = await p.$$eval('#doc-hand table tr', rs => rs.slice(1,6).map(r=>[...r.children].map(c=>c.textContent.trim()).join('|')));
  await p.click('.tab[data-doc=doc-disp]');
  await p.fill('#disp-from','3/1/26');
  const after = await p.$$eval('#doc-hand table tr', rs => rs.slice(1,6).map(r=>[...r.children].map(c=>c.textContent.trim()).join('|')));
  ok('handout unchanged by dispense-from', JSON.stringify(before)===JSON.stringify(after),
     before.find((x,i)=>x!==after[i]) ? 'first diff: '+before.find((x,i)=>x!==after[i]) : '');

  // ---------- P4 ----------
  console.log('\nP4  next-fill-only must not claim full coverage');
  await p.fill('#disp-from',''); await p.check('#disp-next-only');
  const dt = await p.textContent('#doc-disp');
  ok('does not claim to cover the remainder', !/covers the remainder of the schedule/.test(dt));
  ok('states the true total in the printed doc', /Showing the next fill only/.test(dt) && /prescriptions in total|prescription in total/.test(dt));
  await p.uncheck('#disp-next-only');

  // ---------- P5 ----------
  console.log('\nP5  Start over must clear patient state');
  await p.selectOption('#disp-weeks','2'); await p.fill('#disp-from','3/1/26'); await p.check('#disp-next-only');
  await p.click('#btn-restart');
  ok('start date cleared', (await p.inputValue('#start-date'))==='');
  ok('Run disabled again', await p.isDisabled('#btn-run'));
  await p.click('#med-opts button:nth-child(4)');
  const s2 = await p.$$('#freq-rows select'); await s2[0].selectOption('BID');
  await p.waitForSelector('#dose-table select'); const d2 = await p.$$('#dose-table select');
  await d2[0].selectOption('10'); await d2[1].selectOption('10');
  ok('Run still disabled without a date', await p.isDisabled('#btn-run'));
  await p.fill('#start-date','6/1/26'); await p.click('#btn-run'); await p.click('#btn-finalize');
  const dt2 = await p.textContent('#doc-disp');
  ok('dispensing window reset to 4 weeks', /4-week fills/.test(dt2));
  ok('dispense-from not inherited', !/starting 3\/1\/26/.test(dt2));
  ok('next-fill-only not inherited', !/Showing the next fill only/.test(dt2));

  // ---------- P6 ----------
  console.log('\nP6  unreadable dispense-from is reported');
  await p.click('.tab[data-doc=doc-disp]'); await p.fill('#disp-from','13/45/99');
  ok('invalid date flagged', /could not be read/.test(await p.textContent('#disp-note')));
  await p.fill('#disp-from','');

  // ---------- P7 / D1 ----------
  console.log('\nP7/D1  out-of-range dates refused, not clamped');
  await p.click('#btn-restart');
  for (const bad of ['12/31/9999','1/5/19','1/1/999','1/5/70']) {
    await p.click('#med-opts button:nth-child(4)');
    const s3 = await p.$$('#freq-rows select'); await s3[0].selectOption('BID');
    await p.waitForSelector('#dose-table select'); const d3 = await p.$$('#dose-table select');
    await d3[0].selectOption('10'); await d3[1].selectOption('10');
    await p.fill('#start-date', bad);
    ok(`"${bad}" rejected (Run stays disabled)`, await p.isDisabled('#btn-run'));
  }
  ok('encode refuses an out-of-range date', (()=>{ try{
      C.encode({medKey:'D',freqs:{diazepam:'QD'},doses:{diazepam:{morning:10}},
        startDate:new Date(2019,11,31),weeks:null,weekDefaults:[0]}, E); return false;
    }catch(e){ return /representable range/.test(e.message); } })());

  // ---------- P3 / P9 mobile ----------
  console.log('\nP3/P9  mobile: nothing clipped, nothing overflowing');
  for (const [w,h] of [[390,844],[360,740],[320,568]]) {
    await p.setViewportSize({width:w,height:h});
    await p.goto(URL); await p.click('#btn-agree');
    const over1 = await p.evaluate(()=>document.documentElement.scrollWidth - window.innerWidth);
    ok(`${w}px setup screen: no page overflow`, over1<=1, `overflow ${over1}px`);
    await p.click('#med-opts button:nth-child(5)');
    const s4 = await p.$$('#freq-rows select'); await s4[0].selectOption('QID'); await s4[1].selectOption('QID');
    await p.waitForSelector('#dose-table select'); const d4 = await p.$$('#dose-table select');
    for (let i=0;i<4;i++) await d4[i].selectOption('1');
    for (let i=4;i<8;i++) await d4[i].selectOption('10');
    await p.click('#btn-today'); await p.click('#btn-run'); await p.click('#btn-finalize');
    const clip = await p.evaluate(()=>{
      const t=document.querySelector('#doc-hand table');
      return { hidden: t.scrollWidth - t.clientWidth, scrollable: getComputedStyle(t).overflowX };
    });
    ok(`${w}px QID handout: night column reachable`, clip.scrollable==='auto'||clip.hidden<=1,
       `overflow-x:${clip.scrollable}, ${clip.hidden}px beyond`);
    const over2 = await p.evaluate(()=>document.documentElement.scrollWidth - window.innerWidth);
    ok(`${w}px outputs: no page overflow`, over2<=1, `overflow ${over2}px`);
  }
  await p.setViewportSize({width:1200,height:900});

  // ---------- P8 ----------
  console.log('\nP8  accessible names');
  await p.goto(URL); await p.click('#btn-agree'); await p.click('#med-opts button:nth-child(5)');
  const s5 = await p.$$('#freq-rows select'); await s5[0].selectOption('TID'); await s5[1].selectOption('BID');
  await p.waitForSelector('#dose-table select');
  const unnamed = await p.$$eval('select,input[type=text]', ns =>
    ns.filter(n=>!n.getAttribute('aria-label') && !n.labels?.length).length);
  ok('every select and text input has an accessible name', unnamed===0, `${unnamed} unnamed`);
  const live = await p.$$eval('#run-err,#code-err', ns=>ns.every(n=>n.getAttribute('aria-live')));
  ok('error regions are announced', live);

  // ---------- P10 ----------
  console.log('\nP10  finalize with no schedule is guarded');
  await p.goto(URL); await p.click('#btn-agree');
  const threw = await p.evaluate(()=>{ try{ document.getElementById('btn-finalize').click(); return null; }
    catch(e){ return e.message; } });
  ok('no exception from finalize without a schedule', threw===null, threw||'');

  console.log('\nconsole/page errors during run: ' + (errs.length ? errs.join(' | ') : 'none'));
  ok('no uncaught errors', errs.length===0);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
