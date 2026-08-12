const E = require('./engine.js');
const DATA = require('./schedule_data.json');
let fail = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL:', m); fail++; } };

// 1. reproduce each published schedule from its own starting dose
console.log('=== FIXTURE TEST: does each schedule regenerate from its own start? ===');
for (const sn of [1,2,3,5,6,7,8]) {
  const startId = DATA.order[sn][0];
  const reg = E.stepRegimen(DATA.steps[startId]);
  const res = E.generate(DATA, { regimen: reg });
  if (res.error) { console.log(`  Sched ${sn}: ERROR ${res.error}`); fail++; continue; }
  const ash = res.steps.filter(s => s.provenance === 'ashton').length;
  const ext = res.steps.filter(s => s.provenance === 'extrapolated').length;
  const weeks = res.steps.reduce((a,s)=>a+(s.weeks||0),0);
  console.log(`  Sched ${sn}: join=${res.joinAt.padEnd(9)} onramp=${ext}  ashton=${ash}  ${weeks}wk`);
  ok(res.joinAt === startId, `Sched ${sn} should join at its own start (${startId}), got ${res.joinAt}`);
  ok(ext === 0, `Sched ${sn} should need no on-ramp, got ${ext}`);
}

// 2. safety invariants over a sweep
console.log('\n=== INVARIANT SWEEP ===');
const drugs = { A:'alprazolam', L:'lorazepam', C:'clonazepam', D:'diazepam' };
let n=0, declined=0, errors=0, maxOnramp=0;
for (const k in drugs) {
  const drug = drugs[k];
  for (const freq of ['QD','QHS','BID','TID','QID']) {
    const slots = E.FREQ_SLOTS[freq];
    for (const per of E.achievableDoses(drug)) {
      const reg = {}; slots.forEach(s => reg[s] = [[drug, per]]);
      const eq = E.regimenEq(reg);
      if (eq > E.CEILING_EQ) continue;
      n++;
      const res = E.generate(DATA, { regimen: reg });
      if (res.error) { if (/ceiling/.test(res.error)) declined++; else { errors++; if (errors<6) console.log(`  ERR ${drug} ${freq} ${per}mg: ${res.error}`);} continue; }
      maxOnramp = Math.max(maxOnramp, res.onrampLength);
      let prev = Infinity;
      for (const s of res.steps) {
        const e = E.regimenEq(s.regimen);
        ok(e <= prev + 1e-9, `${drug} ${freq} ${per}mg: dose increased ${prev}->${e}`);
        prev = e;
      }
      ok(E.regimenEq(res.steps[res.steps.length-1].regimen) === 0, `${drug} ${freq} ${per}mg: does not end at zero`);
      ok(E.regimenEq(res.steps[0].regimen) === eq, `${drug} ${freq} ${per}mg: step 0 != entered regimen`);
    }
  }
}
console.log(`  ${n} regimens tested, ${errors} errors, ${declined} declined at ceiling, longest on-ramp ${maxOnramp} steps`);

// 3. two-strength rule across dispensing windows, at every week setting
console.log('\n=== DISPENSING: two strengths per drug, weeks 1..4 ===');
let viol = 0, windows = 0;
for (const sn of [1,2,3,5,6,7,8]) {
  const reg = E.stepRegimen(DATA.steps[DATA.order[sn][0]]);
  for (const w of [1,2,3,4]) {
    const res = E.generate(DATA, { regimen: reg });
    res.steps.forEach(s => { if (s.weeks_default > 0) s.weeks = w; });
    E.applyDates(res.steps, new Date(2026,0,1));
    const per = E.buildDispensing(res.steps);
    windows += per.length;
    per.forEach(p => { if (p.violation) { viol++; if (viol<5) console.log(`    Sched ${sn} w=${w} period ${p.n}: >2 strengths`); } });
  }
}
console.log(`  ${windows} dispensing windows checked, ${viol} violations`);

// 4. on-ramp cases
console.log('\n=== ON-RAMP EXAMPLES ===');
for (const [label, reg] of [
  ['alprazolam 1mg TID', {morning:[['alprazolam',1]],midday:[['alprazolam',1]],night:[['alprazolam',1]]}],
  ['clonazepam 2mg BID', {morning:[['clonazepam',2]],night:[['clonazepam',2]]}],
  ['diazepam 13mg split', {morning:[['diazepam',5]],midday:[['diazepam',3]],night:[['diazepam',5]]}],
  ['lorazepam 0.5mg QHS', {night:[['lorazepam',0.5]]}],
]) {
  const res = E.generate(DATA, { regimen: reg });
  if (res.error) { console.log(`  ${label}: ${res.error}`); continue; }
  const wk = res.steps.reduce((a,s)=>a+(s.weeks||0),0);
  console.log(`  ${label.padEnd(22)} eq=${res.patEq}  onramp=${res.onrampLength}  join=${res.joinAt}  total=${res.steps.length} steps / ${wk}wk`);
}

console.log(fail ? `\n*** ${fail} FAILURES ***` : '\nALL CHECKS PASSED');
