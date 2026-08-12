/* benzo-taper engine — pure functions, no DOM. Testable under node. */
'use strict';

const ENGINE_VERSION = 3;
const EQ = { alprazolam: 20, lorazepam: 10, clonazepam: 20, diazepam: 1 };
const STRENGTHS = {
  alprazolam: [0.25, 0.5, 1, 2],
  lorazepam:  [0.5, 1, 2],
  clonazepam: [0.25, 0.5, 1, 2],
  diazepam:   [2, 5, 10],
};
const SLOTS = ['morning', 'midday', 'afternoon', 'night'];
const SLOT_LABEL = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon', night: 'Night' };
const FREQ_SLOTS = {
  QD:  ['morning'],
  QHS: ['night'],
  BID: ['morning', 'night'],
  TID: ['morning', 'midday', 'night'],
  QID: ['morning', 'midday', 'afternoon', 'night'],
};
const MED_OPTIONS = {
  A:   ['alprazolam'],            L:   ['lorazepam'],
  C:   ['clonazepam'],            D:   ['diazepam'],
  AD:  ['alprazolam', 'diazepam'],LD:  ['lorazepam', 'diazepam'],
  CD:  ['clonazepam', 'diazepam'],
};
const CEILING_EQ = 120;          // Schedule 1 starting dose
// Diazepam exchanged per substitution step. Ashton uses 5mg on the lower-dose
// schedules (3, 8) and 10mg on the highest (1); 60mg-equivalent is the dividing line.
// Both values are whole dispensable diazepam doses, so the daily total stays flat.
const EXCHANGE_SMALL = 5, EXCHANGE_LARGE = 10, EXCHANGE_THRESHOLD_EQ = 60;
const MAX_DECREMENT = 0.10;      // Ashton: up to one tenth per decrement
const DISPENSE_DAYS = 28;              // default: four weeks
const MAX_DISPENSE_WEEKS = 4;          // hard ceiling — never dispense more at once
// California, Schedule IV: at most 5 refills, refills capped at 120 days combined, and
// the prescription expires 6 months from the date written. Whichever comes first ends it.
const RX_MAX_REFILLS = 5, RX_MAX_REFILL_DAYS = 120, RX_VALID_MONTHS = 6;
const MAX_ONRAMP_STEPS = 80;

const r2 = n => Math.round(n * 1000) / 1000;
// Tablets below this are dispensed whole — quartering a 0.25mg tablet is not
// reliably reproducible, and Ashton never does it.
const MIN_SPLITTABLE = 0.5;

/* ---------- tablet arithmetic ---------- */

// Can `dose` be built from whole/half tablets of `strengths`?
function composable(dose, strengths) {
  const T = Math.round(dose * 2 * 100);
  if (T === 0) return true;
  if (T < 0) return false;
  const coins = [];
  for (const s of strengths) {
    coins.push(Math.round(s * 200));                                  // whole tablet
    if (s >= MIN_SPLITTABLE) coins.push(Math.round(s * 100));         // half tablet
  }
  const reach = new Uint8Array(T + 1); reach[0] = 1;
  for (let v = 1; v <= T; v++)
    for (const c of coins) if (c <= v && reach[v - c]) { reach[v] = 1; break; }
  return !!reach[T];
}

// Tablet breakdown for `dose`, returned as {strength: count} where a count of 1.5
// means one whole plus one half. Halving is error-prone for patients, so a half
// tablet costs far more than a whole one: the solver reaches for halves only when a
// dose cannot be made without them.
const HALF_PENALTY = 10;
function breakdown(dose, strengths) {
  const T = Math.round(dose * 2 * 100);          // work in half-milligram-hundredths
  if (T === 0) return {};
  const coins = [];
  for (const s of strengths) {
    const u = Math.round(s * 100);
    coins.push({ v: u * 2, k: s, amt: 1, cost: 1 });                    // a whole tablet
    if (s >= MIN_SPLITTABLE)
      coins.push({ v: u, k: s, amt: 0.5, cost: HALF_PENALTY });         // half a tablet
  }
  const best = new Array(T + 1).fill(null); best[0] = {};
  const cost = new Array(T + 1).fill(Infinity); cost[0] = 0;
  for (let v = 1; v <= T; v++)
    for (const c of coins)
      if (c.v <= v && cost[v - c.v] + c.cost < cost[v]) {
        cost[v] = cost[v - c.v] + c.cost;
        best[v] = Object.assign({}, best[v - c.v]);
        best[v][c.k] = (best[v][c.k] || 0) + c.amt;
      }
  return best[T];
}

let _achievable = null;
function achievableDoses(drug) {
  if (!_achievable) {
    _achievable = {};
    for (const d in STRENGTHS) {
      const av = STRENGTHS[d], max = d === 'diazepam' ? 60 : 12, out = new Set();
      // Enumerate at HALF THE SMALLEST TABLET, so e.g. alprazolam/clonazepam 0.25mg
      // is representable. A coarser grid silently hid those doses from dose entry.
      const grain = Math.min(...av) / 2;
      for (let i = 0; i < av.length; i++) for (let j = i; j < av.length; j++) {
        const combo = i === j ? [av[i]] : [av[i], av[j]];
        for (let t = grain; t <= max; t += grain) {
          const v = r2(t);
          if (v <= max && composable(v, combo)) {
            const bd = breakdown(v, combo);
            const tabs = Object.values(bd).reduce((a, b) => a + b, 0);
            if (tabs <= 8) out.add(v);
          }
        }
      }
      _achievable[d] = [...out].sort((a, b) => a - b);
    }
  }
  return _achievable[drug];
}

function snapDown(drug, mg) {
  const list = achievableDoses(drug);
  let best = 0;
  for (const v of list) if (v <= mg + 1e-9) best = v;
  return best;
}

// Smallest achievable dose in [lo, hi]; null if none. Used so a reduction can never
// overshoot below the join target's total.
function snapBetween(drug, lo, hi) {
  if (lo <= 0 && hi >= 0) return 0;
  for (const v of achievableDoses(drug))
    if (v >= lo - 1e-9 && v <= hi + 1e-9) return v;
  return null;
}

/* ---------- THE RULES ----------------------------------------------------
   Every step this tool generates follows the rules below. They are exported so
   they can be displayed in the interface and audited against the source, rather
   than being buried in code. Derived from Ashton (2002), Chapter II, and from
   measuring the crossover steps of published Schedules 1, 3, 6 and 8. */

const RULES = {
  version: 1,
  phases: 'Substitution runs to completion before any reduction begins. The two are ' +
    'never interleaved: no dose is lowered while any of the original drug remains.',
  crossover: [
    'Substitute to diazepam one time-of-day dose at a time. Never convert a whole dose in one move.',
    'Each step lowers the original drug by exactly ONE rung of its dispensable ladder — the ' +
      'next lower dose makeable from whole or half tablets — and adds the diazepam equivalent ' +
      'of what was removed. This is what makes each step 5mg of diazepam for lorazepam and ' +
      '10mg for alprazolam and clonazepam: it follows from tablet geometry, not from a chosen number.',
    'Advance whichever dose is least converted so far. Ties go to the night dose, then morning, ' +
      'then midday, then afternoon.',
    'The original drug is stopped once it reaches its smallest whole tablet; that tablet is not ' +
      'split further.',
    'The total daily diazepam-equivalent does not change during substitution.',
  ],
  reduction: [
    'Reductions begin only once the patient is entirely on diazepam, or once the regimen matches ' +
      'a published Ashton step.',
    'No single reduction exceeds one tenth of the running total daily dose (Ashton, Chapter II).',
    'The total daily dose never increases between consecutive steps.',
    'The schedule ends at zero.',
  ],
  dispensing: [
    'Every dose must be makeable from whole or half tablets of available strengths.',
    'No more than two tablet strengths of any one drug in any single fill.',
    'A fill never covers more than four weeks of medication; the prescriber may choose less.',
    'No more than two drugs at any time.',
    'Where the tablet grid forces a dose away from the ideal value, the step is flagged.',
  ],
  duration: [
    'Published steps carry their published duration. Generated steps default to one week.',
    'The prescriber may set any step between 1 and 4 weeks.',
    'A duration outside the published range is flagged on the step and the published range shown.',
  ],
  ceiling: 'Declines above 120mg diazepam-equivalent, the highest published starting dose ' +
    '(Schedule 1). Above that there is no published basis to extrapolate from.',
};

/* ---------- regimen helpers ---------- */
// regimen = { morning:[[drug,mg],...], midday:[...], ... }  (absent slot = no dose)

function regimenEq(reg) {
  let t = 0;
  for (const s of SLOTS) for (const [d, mg] of (reg[s] || [])) t += EQ[d] * mg;
  return r2(t);
}
function slotEq(reg, slot) {
  let t = 0; for (const [d, mg] of (reg[slot] || [])) t += EQ[d] * mg; return r2(t);
}
function drugsIn(reg) {
  const s = new Set();
  for (const sl of SLOTS) for (const [d] of (reg[sl] || [])) s.add(d);
  return s;
}
function cloneReg(reg) {
  const o = {};
  for (const s of SLOTS) if (reg[s] && reg[s].length) o[s] = reg[s].map(x => x.slice());
  return o;
}
function regKey(reg) {
  return SLOTS.map(s => (reg[s] || []).slice()
    .sort().map(([d, m]) => d + m).join('+')).join('|');
}
function setSlotDiazepam(reg, slot, mg) {
  if (mg > 0) reg[slot] = [['diazepam', mg]]; else delete reg[slot];
}

/* ---------- the dispensable ladder ---------- */

// The original drug is stopped at its smallest whole tablet rather than split further —
// Ashton never splits a 0.25mg tablet, and a quarter-tablet is not reliably dispensable.
function ladderFloor(drug) { return drug === 'diazepam' ? 0 : Math.min(...STRENGTHS[drug]); }

// The next lower dispensable dose. Returns 0 when already at the floor.
function nextRung(drug, from) {
  const floor = ladderFloor(drug);
  const below = achievableDoses(drug).filter(v => v < from - 1e-9 && v >= floor - 1e-9);
  return below.length ? below[below.length - 1] : 0;
}

/* ---------- schedule data access ---------- */

function stepRegimen(step) {
  const o = {};
  for (const s of SLOTS) if (step.slots[s]) o[s] = step.slots[s].map(x => x.slice());
  return o;
}

/* ---------- join target selection ---------- */

function findJoinTarget(DATA, reg) {
  const patEq = regimenEq(reg);
  const patDrugs = drugsIn(reg);
  const nonDiaz = [...patDrugs].filter(d => d !== 'diazepam');
  const patSlots = SLOTS.filter(s => (reg[s] || []).length);

  let best = null;
  for (const id in DATA.steps) {
    const st = DATA.steps[id];
    if (st.eq > patEq + 1e-9) continue;                 // never increase
    const sreg = stepRegimen(st);
    const sDrugs = drugsIn(sreg);
    const sSlots = SLOTS.filter(s => (sreg[s] || []).length);

    const gap = patEq - st.eq;
    // prefer a target that still contains the patient's own drug — lets Ashton's
    // published path do the crossover rather than our on-ramp
    const drugBonus = nonDiaz.length && sDrugs.has(nonDiaz[0]) ? 1 : 0;
    const slotDiff = Math.abs(sSlots.length - patSlots.length);
    let distDiff = 0;
    for (const s of SLOTS) distDiff += Math.abs(slotEq(sreg, s) - slotEq(reg, s));
    // tiebreak toward the head of a schedule, so an exact match lands on the
    // published starting dosage rather than an identical tail step of another chain
    const startBonus = st.stage === 'start' ? 1 : 0;

    const score = gap * 3 + slotDiff * 4 + distDiff * 0.5 - drugBonus * 25 - startBonus * 2;
    if (!best || score < best.score) best = { id, step: st, score, gap };
  }
  return best;
}

/* ---------- on-ramp ---------- */

// Returns { steps, targetId } | null | { fail }.
//
// STRICTLY SEQUENTIAL: substitution runs to completion before any reduction. No dose
// is lowered while any of the original drug remains. At every point we check whether
// the regimen has landed exactly on a published step — if it has, we hand off to
// Ashton rather than continuing to generate.
function exactMatch(DATA, reg) {
  const k = regKey(reg);
  let hit = null;
  for (const id in DATA.steps) {
    if (regKey(stepRegimen(DATA.steps[id])) !== k) continue;
    if (DATA.steps[id].stage === 'start') return id;   // prefer a schedule's head
    if (!hit) hit = id;
  }
  return hit;
}

function slotDiazepam(reg, slot) {
  return (reg[slot] || []).filter(([d]) => d === 'diazepam').reduce((a, [, m]) => a + m, 0);
}

function buildOnRamp(DATA, reg0) {
  const out = [];
  let state = cloneReg(reg0);
  const unit = regimenEq(reg0) > EXCHANGE_THRESHOLD_EQ ? EXCHANGE_LARGE : EXCHANGE_SMALL;

  const push = (r, note, flag) => {
    const prev = out.length ? out[out.length - 1].regimen : reg0;
    if (regimenEq(r) > regimenEq(prev) + 1e-9) throw new Error('invariant: dose increased');
    out.push({ regimen: cloneReg(r), note, flag, provenance: 'extrapolated',
               weeks_default: 1, weeks_range: [1, 2] });
  };

  /* ---- PHASE 1 — substitution, one ladder rung at a time ---- */
  const ORDER = ['night', 'morning', 'midday', 'afternoon'];
  let guard = 0;
  for (;;) {
    const hit = exactMatch(DATA, state);
    if (hit) return { steps: out, targetId: hit };
    const open = ORDER.filter(s => (state[s] || []).some(([d]) => d !== 'diazepam'));
    if (!open.length) break;                       // fully on diazepam
    if (++guard > MAX_ONRAMP_STEPS) return null;

    // advance whichever dose is least converted; ties by ORDER
    let pick = null;
    for (const s of open) {
      const tot = slotEq(state, s);
      const frac = tot ? slotDiazepam(state, s) / tot : 1;
      if (!pick || frac < pick.frac - 1e-9) pick = { s, frac };
    }
    const slot = pick.s;
    const [drug, from] = (state[slot] || []).find(([d]) => d !== 'diazepam');
    // Remove the amount of original drug worth one exchange unit of diazepam, then
    // let the tablet grid round the RESIDUAL to something dispensable.
    let to = snapDown(drug, from - unit / EQ[drug]);
    if (to >= from - 1e-9) to = nextRung(drug, from);      // must strictly decrease
    if (to < ladderFloor(drug) - 1e-9) to = 0;             // don't split the smallest tablet
    const removed = r2((from - to) * EQ[drug]);
    const dzWant = r2(slotDiazepam(state, slot) + removed);
    const dzGot = snapDown('diazepam', dzWant);
    const shortfall = r2(dzWant - dzGot);

    const next = [];
    if (to > 0) next.push([drug, to]);
    if (dzGot > 0) next.push(['diazepam', dzGot]);
    if (next.length) state[slot] = next; else delete state[slot];

    const where = SLOT_LABEL[slot].toLowerCase();
    if (shortfall > 0.001 && out.length === 0 && regimenEq(state) < regimenEq(reg0) * (1 - MAX_DECREMENT))
      return { fail: 'This regimen cannot be substituted to diazepam without either a dose ' +
        'increase or a cut larger than 10% in one step, given available tablet sizes.' };
    push(state,
      to > 0
        ? `Substitute part of the ${where} dose \u2014 ${drug} ${from}mg down to ${to}mg, ` +
          `with diazepam ${dzGot}mg`
        : `Stop ${drug} in the ${where} dose, replaced by diazepam ${dzGot}mg`,
      shortfall > 0.001
        ? `Tablet sizes gave ${dzGot}mg diazepam where ${dzWant}mg was the exact equivalent ` +
          `(${shortfall}mg short).`
        : null);
  }

  /* ---- PHASE 2 — reduction. Only reached once entirely on diazepam. ---- */
  const target = findJoinTarget(DATA, state);
  if (!target) return null;
  const targetReg = stepRegimen(target.step);
  const tgtEq = regimenEq(targetReg);

  guard = 0;
  while (regKey(state) !== regKey(targetReg)) {
    if (++guard > MAX_ONRAMP_STEPS) return null;
    const cur = regimenEq(state);

    if (cur > tgtEq + 1e-9) {
      const room = Math.max(cur * MAX_DECREMENT, 1);
      const headroom = cur - tgtEq;
      const cands = SLOTS.filter(s => slotEq(state, s) > 0)
        .sort((a, b) => (slotEq(state, b) - slotEq(targetReg, b))
                      - (slotEq(state, a) - slotEq(targetReg, a)));
      let moved = false;
      for (const slot of cands) {
        const have = slotEq(state, slot);
        const lo = Math.max(0, have - Math.min(room, headroom));
        const v = snapBetween('diazepam', lo, have - 1e-6);
        if (v === null) continue;
        setSlotDiazepam(state, slot, v);
        push(state, v === 0
          ? `Stop the ${SLOT_LABEL[slot].toLowerCase()} dose`
          : `Reduce the ${SLOT_LABEL[slot].toLowerCase()} dose to diazepam ${v}mg`);
        moved = true; break;
      }
      if (!moved) return null;
    } else {
      state = cloneReg(targetReg);
      push(state, 'Redistribute the same total daily dose across the day');
    }
  }
  return { steps: out, targetId: target.id };
}

/* ---------- full schedule ---------- */

function generate(DATA, input) {
  const reg = input.regimen;
  const patEq = regimenEq(reg);
  if (patEq <= 0) return { error: 'Enter at least one dose.' };
  if (patEq > CEILING_EQ)
    return { error: `Total daily dose is ${patEq}mg diazepam-equivalent, above the ` +
      `${CEILING_EQ}mg ceiling of the published schedules (Schedule 1). This tool ` +
      `cannot generate a schedule from here — specialist referral is indicated.` };

  if (!findJoinTarget(DATA, reg))
    return { error: 'No published schedule step at or below this dose.' };

  const ramp = buildOnRamp(DATA, reg);
  if (ramp === null) {
    // Almost always caused by the daily dose being concentrated in one administration,
    // so no single slot can be reduced without breaching the 10% rule. Say so.
    const big = SLOTS.filter(s => slotEq(reg, s) > 0)
      .sort((a, b) => slotEq(reg, b) - slotEq(reg, a))[0];
    const share = big ? Math.round(100 * slotEq(reg, big) / patEq) : 0;
    return { error: 'Could not construct a safe path from this regimen to a published schedule ' +
      'without exceeding a 10% reduction in a single step.' +
      (big && share >= 50
        ? ` ${share}% of the daily dose is in the ${SLOT_LABEL[big].toLowerCase()} dose. ` +
          'Splitting the daily dose across more times of day would usually make a taper possible.'
        : ' Redistributing the daily dose across more times of day would usually make a taper possible.') };
  }
  if (ramp.fail) return { error: ramp.fail };
  const onramp = ramp.steps;

  const steps = [];
  // starting point, shown for reference, zero duration
  steps.push({ regimen: cloneReg(reg), provenance: 'current', label: 'Current regimen',
               weeks: 0, weeks_default: 0, note: 'As entered. No change yet.' });
  for (const s of onramp)
    steps.push({ regimen: s.regimen, provenance: 'extrapolated', note: s.note,
                 weeks: s.weeks_default, weeks_default: s.weeks_default, weeks_range: s.weeks_range });

  let id = ramp.targetId, guard = 0;
  while (id && guard++ < 400) {
    const st = DATA.steps[id];
    steps.push({ regimen: stepRegimen(st), provenance: 'ashton',
                 source: `Schedule ${st.sched}, ${st.stage === 'start' ? 'starting dosage' : 'Stage ' + st.stage}`,
                 weeks: st.weeks_default, weeks_default: st.weeks_default,
                 weeks_range: st.weeks_range, eq_erratum: st.printed_eq !== null &&
                   Math.abs(st.printed_eq - st.eq) > 0.001 ? st.printed_eq : null });
    id = st.next;
  }
  // Collapse consecutive identical regimens (schedule chains can overlap at the seam).
  const merged = [steps[0]];
  for (let i = 1; i < steps.length; i++) {
    const prev = merged[merged.length - 1];
    if (regKey(steps[i].regimen) === regKey(prev.regimen) && prev.provenance !== 'current') {
      prev.weeks += steps[i].weeks;
      prev.weeks_default += steps[i].weeks_default;
      if (prev.weeks_range && steps[i].weeks_range)
        prev.weeks_range = [prev.weeks_range[0] + steps[i].weeks_range[0],
                            prev.weeks_range[1] + steps[i].weeks_range[1]];
      else if (steps[i].weeks_range) prev.weeks_range = steps[i].weeks_range.slice();
      if (steps[i].source) prev.source = (prev.source ? prev.source + '; ' : '') + steps[i].source;
      // If an on-ramp step lands exactly on a published regimen, it IS that published
      // step — label it Ashton rather than leaving it marked as our own extrapolation.
      if (steps[i].provenance === 'ashton' && prev.provenance === 'extrapolated') {
        prev.provenance = 'ashton';
        if (steps[i].eq_erratum) prev.eq_erratum = steps[i].eq_erratum;
      }
      continue;
    }
    merged.push(steps[i]);
  }
  merged.push({ regimen: {}, provenance: 'end', label: 'Stop', weeks: 0, weeks_default: 0,
                note: 'Benzodiazepine withdrawal complete.' });

  for (let i = 1; i < merged.length; i++)
    if (regimenEq(merged[i].regimen) > regimenEq(merged[i - 1].regimen) + 1e-9)
      return { error: `Internal error: dose increases at step ${i}.` };

  return { steps: merged, joinAt: ramp.targetId, onrampLength: onramp.length, patEq };
}

/* ---------- dates & dispensing ---------- */

// Calendar arithmetic, never fixed 24-hour blocks. Adding 86400000ms across a daylight
// saving transition lands on 23:00 the previous day, which silently shifted every date
// from November to March by one and made "4 week" steps span 27 or 29 days.
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function daysBetween(a, b) {           // inclusive-exclusive day count, DST-safe
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
                     Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function applyDates(steps, startDate) {
  let cur = startOfDay(startDate);
  for (const s of steps) {
    s.start = startOfDay(cur);
    const days = (s.weeks || 0) * 7;
    s.end = addDays(cur, Math.max(0, days - 1));
    if (days > 0) cur = addDays(cur, days);
  }
  return steps;
}

// Choose <=2 strengths per drug across a set of doses.
function selectStrengths(drug, doses) {
  const av = STRENGTHS[drug];
  const uniq = [...new Set(doses.filter(d => d > 0))].sort((a, b) => a - b);
  if (!uniq.length) return { strengths: [], ok: true };
  // Within the two-strength limit, minimise TABLETS FIRST, then strength count.
  // Preferring fewer strengths first would hand a patient nine 2mg tablets where one
  // 10mg plus four 2mg would do.
  let best = null;
  for (let n = 1; n <= 2; n++) {
    for (const combo of combinations(av, n)) {
      if (!uniq.every(d => composable(d, combo))) continue;
      const tabs = uniq.reduce((a, d) =>
        a + Object.values(breakdown(d, combo)).reduce((x, y) => x + y, 0), 0);
      if (!best || tabs < best.tabs || (tabs === best.tabs && combo.length < best.strengths.length))
        best = { strengths: combo, tabs };
    }
  }
  if (best) return { strengths: best.strengths, ok: true };
  for (let n = 3; n <= av.length; n++)
    for (const combo of combinations(av, n))
      if (uniq.every(d => composable(d, combo)))
        return { strengths: combo, ok: false };
  return { strengths: av, ok: false };
}
function combinations(arr, n) {
  const out = [];
  (function rec(start, cur) {
    if (cur.length === n) { out.push(cur.slice()); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
  })(0, []);
  return out;
}

function buildDispensing(steps, opts) {
  opts = opts || {};
  const weeks = Math.max(1, Math.min(MAX_DISPENSE_WEEKS, opts.weeks || 4));
  const span = weeks * 7;
  const active = steps.filter(s => s.weeks > 0 && Object.keys(s.regimen).length);
  if (!active.length) return [];
  const first = active[0].start, last = active[active.length - 1].end;
  // Dispensing is a query over the schedule, not a property of it: the prescriber can
  // ask for any window starting anywhere, and nothing about the taper changes.
  let begin = first;
  if (opts.from instanceof Date && !isNaN(opts.from) && startOfDay(opts.from) > first)
    begin = startOfDay(opts.from);
  if (begin > last) return [];
  const periods = [];
  let cur = startOfDay(begin), n = 1;
  while (cur <= last) {
    const pEndRaw = addDays(cur, span - 1);
    const pEnd = pEndRaw > last ? startOfDay(last) : pEndRaw;
    const inWin = active.filter(s => s.end >= cur && s.start <= pEnd);
    const perDrug = {};
    for (const s of inWin) {
      const ovStart = s.start > cur ? s.start : cur;
      const ovEnd = s.end < pEnd ? s.end : pEnd;
      const days = daysBetween(ovStart, ovEnd) + 1;
      for (const slot of SLOTS) for (const [drug, mg] of (s.regimen[slot] || [])) {
        perDrug[drug] = perDrug[drug] || { doses: new Set(), daily: [] };
        perDrug[drug].doses.add(mg);
        perDrug[drug].daily.push({ mg, days });
      }
    }
    const lines = [];
    const chosen = {};
    let violation = false;
    for (const drug in perDrug) {
      const sel = selectStrengths(drug, [...perDrug[drug].doses]);
      chosen[drug] = sel.strengths;
      if (!sel.ok) violation = true;
      const tally = {};
      for (const { mg, days } of perDrug[drug].daily) {
        const bd = breakdown(mg, sel.strengths) || {};
        for (const k in bd) tally[k] = (tally[k] || 0) + bd[k] * days;
      }
      for (const k of Object.keys(tally).sort((a, b) => b - a))
        lines.push({ drug, strength: +k, qty: Math.ceil(tally[k]) });
    }
    periods.push({ n, start: cur, end: pEnd, lines, violation, strengths: chosen,
                   days: daysBetween(cur, pEnd) + 1,
                   steps: inWin.map(s => steps.indexOf(s)) });
    cur = addDays(pEnd, 1); n++;
  }
  return periods;
}

// Group fills into prescriptions. A Schedule IV prescription ends at whichever limit
// binds first: 5 refills, 120 days of refills, or 6 months from the date written.
function groupIntoPrescriptions(periods) {
  const out = [];
  let cur = null;
  for (const p of periods) {
    if (!cur) {
      cur = { rx: 1, periods: [p], refills: 0, refillDays: 0, written: p.start };
      out.push(cur); continue;
    }
    const refills = cur.refills + 1;
    const refillDays = cur.refillDays + p.days;
    const months = daysBetween(cur.written, p.end) / 30.44;
    let reason = null;
    if (refills > RX_MAX_REFILLS) reason = `${RX_MAX_REFILLS}-refill limit reached`;
    else if (refillDays > RX_MAX_REFILL_DAYS) reason = `${RX_MAX_REFILL_DAYS}-day refill limit reached`;
    else if (months > RX_VALID_MONTHS) reason = `prescription expires ${RX_VALID_MONTHS} months after it is written`;
    if (reason) {
      cur.endedBecause = reason;
      cur = { rx: out.length + 1, periods: [p], refills: 0, refillDays: 0, written: p.start };
      out.push(cur);
    } else { cur.periods.push(p); cur.refills = refills; cur.refillDays = refillDays; }
  }
  return out;
}

/* ---------- instructions ---------- */

const WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
function tabletPhrase(count, strength, drug) {
  const whole = Math.floor(count), frac = count - whole;
  let q;
  if (frac < 1e-9) q = `${WORDS[whole] || whole} tablet${whole === 1 ? '' : 's'}`;
  else if (whole === 0) q = 'half a tablet';
  else q = `${WORDS[whole] || whole} and a half tablets`;
  return `${q} of ${strength}mg ${drug}`;
}
const SLOT_PREP = { morning: 'in the morning', midday: 'at midday',
                    afternoon: 'in the afternoon', night: 'at night' };

// Compact per-slot cell, e.g. "1/2 x 1mg alprazolam + 2 x 10mg diazepam"
function slotDoseText(regimen, slot, strengthsByDrug) {
  const out = [];
  for (const [drug, mg] of (regimen[slot] || [])) {
    const st = (strengthsByDrug && strengthsByDrug[drug]) || selectStrengths(drug, [mg]).strengths;
    const bd = breakdown(mg, st) || {};
    for (const k of Object.keys(bd).sort((a, b) => b - a)) {
      const n = bd[k];
      const q = Number.isInteger(n) ? String(n) : (n === 0.5 ? '\u00bd' : Math.floor(n) + '\u00bd');
      out.push(`${q} \u00d7 ${k}mg ${drug}`);
    }
  }
  return out.length ? out.join(' + ') : '\u2014';
}

function instructionFor(regimen, strengthsByDrug) {
  const parts = [];
  for (const slot of SLOTS) {
    const bits = [];
    for (const [drug, mg] of (regimen[slot] || [])) {
      const st = (strengthsByDrug && strengthsByDrug[drug]) || selectStrengths(drug, [mg]).strengths;
      const bd = breakdown(mg, st) || {};
      Object.keys(bd).sort((a, b) => b - a).forEach(k => bits.push(tabletPhrase(bd[k], +k, drug)));
    }
    if (bits.length) parts.push(`${bits.join(' and ')} ${SLOT_PREP[slot]}`);
  }
  if (!parts.length) return 'No dose.';
  return 'Take ' + parts.join('; ') + '.';
}

if (typeof module !== 'undefined') module.exports = {
  ENGINE_VERSION, RULES, EQ, STRENGTHS, SLOTS, SLOT_LABEL, FREQ_SLOTS, MED_OPTIONS,
  CEILING_EQ, DISPENSE_DAYS, MAX_DISPENSE_WEEKS, groupIntoPrescriptions, composable, breakdown, achievableDoses, snapDown,
  regimenEq, slotEq, drugsIn, cloneReg, stepRegimen, addDays, daysBetween, startOfDay, findJoinTarget, buildOnRamp, snapBetween,
  generate, applyDates, selectStrengths, buildDispensing, instructionFor, tabletPhrase, slotDoseText,
};
