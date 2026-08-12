/* UI layer */
'use strict';
const APP_VERSION = '1.0';
const $ = id => document.getElementById(id);
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c;
  if (x !== undefined) n.textContent = x; return n; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MED_LABEL = { A:'Alprazolam', L:'Lorazepam', C:'Clonazepam', D:'Diazepam',
  AD:'Alprazolam + Diazepam', LD:'Lorazepam + Diazepam', CD:'Clonazepam + Diazepam' };
const FREQ_LABEL = { QD:'QD — once daily (morning)', QHS:'QHS — once daily at bedtime',
  BID:'BID — twice daily', TID:'TID — three times daily', QID:'QID — four times daily' };
const ORGANISER = {
  QD: ['7-day pill organizer', '1-dose daily planner',
       'These feature one single compartment for each day of the week.'],
  QHS:['7-day pill organizer', '1-dose daily planner',
       'These feature one single compartment for each day of the week.'],
  BID:['AM/PM pill organizer', '2-times-a-day planner',
       'These typically use two distinct colors, or clear sun and moon icons, to separate daytime and nighttime doses.'],
  TID:['3-times-a-day pill organizer', null,
       'These usually divide each day into morning, noon, and evening slots.'],
  QID:['4-dose weekly planner', '4-times-a-day organizer',
       'These include morning, noon, evening, and bedtime compartments.'],
};

const S = { medKey:null, freqs:{}, doses:{}, startDate:null, result:null, weeks:null, code:null,
            // Dispensing is a QUERY over the schedule, not part of it. Deliberately not
            // stored in the schedule code: the taper is identical however it is dispensed.
            disp: { weeks:4, from:null, nextOnly:false } };

/* ---------- date helpers ---------- */
function parseDate(str){
  const m = String(str||'').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if(!m) return null;
  let [,mo,da,yr]=m; mo=+mo; da=+da; yr=+yr;
  if(yr<100) yr += yr<70?2000:1900;
  if(mo<1||mo>12||da<1||da>31) return null;
  // The schedule code stores days since 2020-01-01 in 15 bits. Anything outside that
  // range used to be silently clamped, issuing a schedule for a date it never printed.
  if(yr<2020||yr>2109) return null;
  const d=new Date(yr,mo-1,da);
  return (d.getFullYear()===yr&&d.getMonth()===mo-1&&d.getDate()===da)?d:null;
}
const fmt = d => d ? `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}` : '';
const fmtLong = d => d ? d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}) : '';

/* ---------- screens ---------- */
function show(id){
  ['scr-gate','scr-setup','scr-work','scr-out','scr-info'].forEach(s=>$(s).classList.add('hidden'));
  $(id).classList.remove('hidden');
  window.scrollTo(0,0);
}

/* ---------- setup ---------- */
function buildMedOpts(){
  const box=$('med-opts'); box.innerHTML='';
  for(const k of CODEC.MED_KEYS){
    const b=el('button','opt'+(S.medKey===k?' sel':''));
    b.appendChild(el('b',null,MED_LABEL[k]));
    b.appendChild(el('span',null,ENG.MED_OPTIONS[k].join(' + ')));
    b.setAttribute('aria-pressed', S.medKey===k?'true':'false');
    b.onclick=()=>{ S.medKey=k; S.freqs={}; S.doses={}; buildMedOpts(); buildFreq(); refresh(); };
    box.appendChild(b);
  }
}
function buildFreq(){
  const p=$('freq-panel'), box=$('freq-rows');
  if(!S.medKey){ p.classList.add('hidden'); return; }
  p.classList.remove('hidden'); box.innerHTML='';
  for(const d of ENG.MED_OPTIONS[S.medKey]){
    const row=el('div','row'); row.style.margin='0 0 10px';
    row.appendChild(el('label',null,d[0].toUpperCase()+d.slice(1)));
    const sel=el('select');
    sel.setAttribute('aria-label','How often is '+d+' taken?');
    sel.appendChild(new Option('— choose —',''));
    for(const f of CODEC.FREQ_KEYS) sel.appendChild(new Option(FREQ_LABEL[f],f));
    sel.value=S.freqs[d]||'';
    sel.onchange=()=>{ S.freqs[d]=sel.value; S.doses[d]={}; buildDoses(); refresh(); };
    row.appendChild(sel); box.appendChild(row);
  }
  buildDoses();
}
function buildDoses(){
  const p=$('dose-panel'), t=$('dose-table');
  const drugs=S.medKey?ENG.MED_OPTIONS[S.medKey]:[];
  if(!drugs.length||!drugs.every(d=>S.freqs[d])){ p.classList.add('hidden'); return; }
  p.classList.remove('hidden'); t.innerHTML='';
  const used=new Set(); drugs.forEach(d=>ENG.FREQ_SLOTS[S.freqs[d]].forEach(s=>used.add(s)));
  const cols=ENG.SLOTS.filter(s=>used.has(s));
  const hr=el('tr'); hr.appendChild(el('th',null,'Medication'));
  cols.forEach(c=>hr.appendChild(el('th',null,ENG.SLOT_LABEL[c])));
  t.appendChild(hr);
  for(const d of drugs){
    const tr=el('tr'); tr.appendChild(el('td',null,d[0].toUpperCase()+d.slice(1)));
    for(const c of cols){
      const td=el('td');
      if(ENG.FREQ_SLOTS[S.freqs[d]].includes(c)){
        const sel=el('select');
        sel.setAttribute('aria-label',d+' dose, '+ENG.SLOT_LABEL[c]);
        sel.appendChild(new Option('—',''));
        for(const v of ENG.achievableDoses(d)) sel.appendChild(new Option(v+' mg',v));
        if(S.doses[d]&&S.doses[d][c]!==undefined) sel.value=String(S.doses[d][c]);
        sel.onchange=()=>{ S.doses[d]=S.doses[d]||{};
          if(sel.value==='') delete S.doses[d][c]; else S.doses[d][c]=parseFloat(sel.value);
          refresh(); };
        td.appendChild(sel);
      } else { td.style.background='#f7f8fa'; td.appendChild(el('span','small','—')); }
      tr.appendChild(td);
    }
    t.appendChild(tr);
  }
}
function currentRegimen(){
  const reg={};
  if(!S.medKey) return reg;
  for(const d of ENG.MED_OPTIONS[S.medKey]){
    const per=S.doses[d]||{};
    for(const s in per) if(per[s]>0){ reg[s]=reg[s]||[]; reg[s].push([d,per[s]]); }
  }
  return reg;
}
function inputsComplete(){
  if(!S.medKey||!S.startDate) return false;
  for(const d of ENG.MED_OPTIONS[S.medKey]){
    if(!S.freqs[d]) return false;
    for(const s of ENG.FREQ_SLOTS[S.freqs[d]])
      if(!S.doses[d]||!(S.doses[d][s]>0)) return false;
  }
  return true;
}
function refresh(){
  $('date-panel').classList.toggle('hidden', !($('dose-panel').classList.contains('hidden')===false));
  const reg=currentRegimen(), eq=ENG.regimenEq(reg);
  $('eq-readout').textContent = eq>0
    ? `Total daily dose: ${eq}mg diazepam-equivalent.` + (eq>ENG.CEILING_EQ
        ? `  Above the ${ENG.CEILING_EQ}mg published ceiling — this tool will decline.` : '')
    : '';
  $('eq-readout').style.color = eq>ENG.CEILING_EQ ? 'var(--danger)' : '';
  $('date-echo').textContent = S.startDate ? fmtLong(S.startDate) : '';
  $('btn-run').disabled = !inputsComplete();
}

/* ---------- run ---------- */
function run(){
  $('run-err').innerHTML='';
  const reg=currentRegimen();
  const res=ENG.generate(DATA,{regimen:reg});
  if(res.error){ $('run-err').innerHTML=`<div class="err">${esc(res.error)}</div>`; return; }
  S.result=res;
  S.weeks = S.weeks && S.weeks.length===res.steps.length ? S.weeks : res.steps.map(s=>s.weeks_default);
  applyWeeks(); renderWork(); show('scr-work');
}
function applyWeeks(){
  if(!S.result||!S.result.steps) return;
  S.result.steps.forEach((s,i)=>{ s.weeks = s.weeks_default===0 ? 0
    : Math.max(1,Math.min(4, S.weeks[i]===undefined?s.weeks_default:S.weeks[i])); });
  ENG.applyDates(S.result.steps, S.startDate);
  S.dispensing = ENG.buildDispensing(S.result.steps, { weeks: S.disp.weeks, from: S.disp.from });
  // The patient handout covers the entire schedule, so its tablet strengths must come
  // from a full-schedule pass. Reading them from the filtered query made the handout
  // name strengths that appear nowhere on the dispensing document printed beside it.
  S.dispensingFull = ENG.buildDispensing(S.result.steps, { weeks: S.disp.weeks });
}
function weekDefaults(){ return S.result.steps.map(s=>s.weeks_default); }

function renderWork(){
  const st=S.result.steps;
  const totalWeeks=st.reduce((a,s)=>a+(s.weeks||0),0);
  const ash=st.filter(s=>s.provenance==='ashton').length;
  const ext=st.filter(s=>s.provenance==='extrapolated').length;
  const last=st[st.length-1];
  $('work-summary').innerHTML =
    `${st.length-2} dosing steps &middot; <strong>${totalWeeks} weeks</strong> ` +
    `(${(totalWeeks/52).toFixed(1)} years) &middot; ends ${esc(fmtLong(last.start))} &middot; ` +
    `${ash} published dose sequence${ash===1?'':'s'}, ${ext} generated` +
    (st.filter(x=>durationNote(x)).length
      ? ` &middot; <strong>${st.filter(x=>durationNote(x)).length} step(s) outside the published duration range</strong>`
      : '');

  const viol=(S.dispensing||[]).filter(p=>p.violation);
  $('dispense-warn').innerHTML = viol.length
    ? `<div class="err">${viol.length} dispensing period(s) would need more than two tablet
       strengths of one drug. Lengthening those steps usually resolves it.</div>` : '';

  const t=$('work-table'); t.innerHTML='';
  const hr=el('tr');
  ['#','Source','Morning','Midday','Afternoon','Night','Diazepam equiv.','Weeks','Dates']
    .forEach(h=>hr.appendChild(el('th',null,h)));
  t.appendChild(hr);
  st.forEach((s,i)=>{
    if(s.provenance==='end') return;
    const tr=el('tr');
    tr.appendChild(el('td',null,s.provenance==='current'?'—':String(i)));
    const td1=el('td');
    const tag=el('span','tag '+(s.provenance==='ashton'?'tag-ashton':s.provenance==='extrapolated'?'tag-extrap':'tag-current'),
      s.provenance==='ashton'?'PUBLISHED':s.provenance==='extrapolated'?'GENERATED':'CURRENT');
    td1.appendChild(tag);
    const cite=citation(s);
    if(cite) td1.appendChild(el('div','small',cite));
    const dn=durationNote(s);
    if(dn){ const n=el('div','small',dn); n.style.color='var(--extrap)'; td1.appendChild(n); }
    if(s.note) td1.appendChild(el('div','small',s.note));
    if(s.eq_erratum) td1.appendChild(el('div','small',`Manual prints ${s.eq_erratum}mg here; components sum to ${ENG.regimenEq(s.regimen)}mg.`));
    tr.appendChild(td1);
    for(const slot of ENG.SLOTS){
      const doses=s.regimen[slot]||[];
      tr.appendChild(el('td',null, doses.length?doses.map(([d,mg])=>`${d} ${mg}mg`).join(' + '):'—'));
    }
    tr.appendChild(el('td',null, ENG.regimenEq(s.regimen)+'mg'));
    const td2=el('td');
    if(s.weeks_default>0){
      const inp=el('select','wk');
      inp.setAttribute('aria-label','Weeks for step '+i+(s.source?', '+s.source:''));
      [1,2,3,4].forEach(v=>inp.appendChild(new Option(v,v)));
      inp.value=String(s.weeks);
      inp.onchange=()=>{ S.weeks[i]=parseInt(inp.value,10); applyWeeks(); renderWork(); };
      td2.appendChild(inp);
      if(s.weeks!==s.weeks_default) td2.appendChild(el('div','small',`default ${s.weeks_default}`));
    } else td2.appendChild(el('span','small','—'));
    tr.appendChild(td2);
    tr.appendChild(el('td',null, s.weeks>0?`${fmt(s.start)} – ${fmt(s.end)}`:fmt(s.start)));
    t.appendChild(tr);
  });
}
function shiftWeeks(delta){
  const st=S.result.steps;
  S.weeks=st.map((s,i)=> s.weeks_default===0?0:Math.max(1,Math.min(4,(S.weeks[i]||s.weeks_default)+delta)));
  applyWeeks(); renderWork();
}

/* ---------- documents ---------- */
function makeCode(){
  try{
  return CODEC.encode({ medKey:S.medKey, freqs:S.freqs, doses:S.doses, startDate:S.startDate,
    weeks:S.weeks, weekDefaults:weekDefaults() }, ENG);
  }catch(e){ return 'UNAVAILABLE'; }
}
function watermark(code){
  const d=el('div','wm');
  const big=el('div','big');
  big.appendChild(el('span',null,'NOT A PRESCRIPTION\nPRESCRIBER REVIEW REQUIRED'));
  d.appendChild(big);
  d.appendChild(el('div','stamp-line',
    `NOT A PRESCRIPTION — PRESCRIBER REVIEW REQUIRED · benzo-taper v${APP_VERSION} ` +
    `(engine v${ENG.ENGINE_VERSION}) · Code ${code} · CONTAINS PHI · ${fmtLong(new Date())}`));
  return d;
}
function footer(code){
  const f=el('div','docfoot');
  f.innerHTML =
    'Dose sequences are cited from Ashton, C.H., <em>Benzodiazepines: How They Work and How to '+
    'Withdraw</em> (2002). <strong>This schedule was generated by this software and was not produced, '+
    'reviewed, or endorsed by Professor Ashton, her estate, or the Benzodiazepine Information '+
    'Coalition.</strong> Step durations are set by the prescriber and may differ from those published. '+
    'Not reviewed by a clinician. For informational and research purposes only — not medical advice, '+
    'not a prescription, and not a substitute for professional judgement. Verify every dose '+
    'independently before use. Provided AS IS, without warranty of any kind; the author accepts no '+
    'liability arising from its use. Do not start, stop, or change any medication except as directed '+
    'by your prescriber.'+
    `<div class="stamp">benzo-taper v${APP_VERSION} (engine v${ENG.ENGINE_VERSION}) &middot; `+
    `Code ${esc(code)} (contains PHI) &middot; Generated ${esc(fmtLong(new Date()))}</div>`;
  return f;
}
function page(code,cls){ return el('div','page'+(cls?' '+cls:'')); }

function renderDocs(){
  const code=S.code=makeCode();
  const box=$('docs'); box.innerHTML='';
  box.appendChild(handoutDoc(code));
  box.appendChild(dispensingDoc(code));
  box.appendChild(codeDoc(code));
  $('stamp-line').textContent =
    `NOT A PRESCRIPTION — PRESCRIBER REVIEW REQUIRED · benzo-taper v${APP_VERSION} ` +
    `(engine v${ENG.ENGINE_VERSION}) · Code ${code} · CONTAINS PHI · ${fmtLong(new Date())}`;
  selectDoc(S._tab||'doc-hand');
}
function activeSteps(){ return S.result.steps.filter(s=>s.weeks>0&&Object.keys(s.regimen).length); }

/* Provenance is expressed as a CITATION, not an endorsement badge. The dose sequence
   is Ashton's; the schedule — entry point, path and durations — is this tool's and the
   prescriber's. The distinction has to survive a duration edit. */
function citation(s){
  return s.provenance==='ashton' && s.source ? `${s.source} — Ashton 2002` : null;
}
function durationNote(s){
  if(s.provenance!=='ashton'||!s.weeks_range) return null;
  const [lo,hi]=s.weeks_range;
  if(s.weeks>=lo && s.weeks<=hi) return null;      // within the published range
  return `duration modified (published: ${lo===hi?lo:lo+'\u2013'+hi} week${hi>1?'s':''})`;
}
// The handout must describe the tablets the pharmacy actually dispensed, so each step
// inherits the strength selection made for its dispensing period.
function strengthsForStep(idx){
  const per=(S.dispensingFull||[]).find(p=>p.steps.includes(idx));
  return per?per.strengths:null;
}

function handoutDoc(code){
  const p=page(code); p.id='doc-hand'; const c=el('div','hand');
  const clinic=el('div','clinic');
  clinic.innerHTML='<strong>If you have left from the schedule please reach out. '+
    'Your doctor is here to help.</strong><br><br>Clinic Phone <span class="line"></span>';
  c.appendChild(clinic);

  c.appendChild(el('h2',null,'Your medication taper'));
  c.appendChild(el('p',null,
    'This plan slowly lowers your medication over time. Going slowly is what makes it work. '+
    'Most people do best when each reduction is small and they stay at each step long enough '+
    'to settle before the next one.'));
  c.appendChild(el('p',null,
    'Some symptoms during a taper are normal and usually pass. If a step feels too hard, that is '+
    'not a failure — it usually means staying at that step longer, not going back up. '+
    'Do not change your dose on your own. Talk to your doctor first.'));
  c.appendChild(el('p',null,
    'Never stop a benzodiazepine suddenly. Stopping abruptly can be dangerous.'));

  const f=S.freqs[ENG.MED_OPTIONS[S.medKey][0]];
  const org=ORGANISER[f]||ORGANISER.TID;
  c.appendChild(el('h3',null,'Getting a pill organizer'));
  c.appendChild(el('p',null,
    'A weekly pill organizer makes this much easier and much safer. You are taking your medicine '+
    (f==='QD'||f==='QHS'?'once':f==='BID'?'twice':f==='TID'?'three times':'four times')+
    ' a day, so look for:'));
  const ul=el('ul');
  const li=el('li');
  li.innerHTML = `Search for a <strong>"${esc(org[0])}"</strong>` +
    (org[1]?` or <strong>"${esc(org[1])}"</strong>`:'') + `. ${esc(org[2])}`;
  ul.appendChild(li);
  c.appendChild(ul);

  c.appendChild(el('h3',null,'Filling your organizer each week'));
  const ol=el('ol');
  [ 'Find the row in the table below whose date range includes the coming week.',
    'That row tells you exactly what to take, and at what times of day.',
    'Fill the whole week at once, on the same day each week — Sunday works well for most people.',
    'Check the dates before you fill. Some weeks the dose changes, and it is easy to fill from the wrong row.',
    'If a tablet needs to be halved, use a pill cutter from any pharmacy. Ask your pharmacist to show you.',
    'Keep the rest of the medicine in its original bottle, out of reach of children and pets.'
  ].forEach(x=>ol.appendChild(el('li',null,x)));
  c.appendChild(ol);

  c.appendChild(el('h3',null,'Reminder apps'));
  c.appendChild(el('p',null,
    'A phone reminder helps a lot, especially on days the dose changes. In your phone\'s app store, '+
    'search for "medication reminder", "pill reminder", or "medisafe". Set one alarm for each time '+
    'of day you take a dose. Your phone\'s built-in Clock or Reminders app works fine too.'));

  c.appendChild(el('h2',null,'Your schedule'));
  c.appendChild(el('p','small','Take the medicines listed for each date range. Do not skip ahead.'));
  const steps=activeSteps();
  const usedSlots=ENG.SLOTS.filter(sl=>steps.some(s=>(s.regimen[sl]||[]).length));
  const t=el('table');
  const hr=el('tr');
  ['Dates','How long'].concat(usedSlots.map(sl=>ENG.SLOT_LABEL[sl])).forEach(h=>hr.appendChild(el('th',null,h)));
  t.appendChild(hr);
  steps.forEach(s=>{
    const tr=el('tr');
    tr.appendChild(el('td',null,`${fmt(s.start)} – ${fmt(s.end)}`));
    tr.appendChild(el('td',null,`${s.weeks} week${s.weeks>1?'s':''}`));
    const st=strengthsForStep(S.result.steps.indexOf(s));
    usedSlots.forEach(sl=>tr.appendChild(el('td',null,ENG.slotDoseText(s.regimen,sl,st))));
    t.appendChild(tr);
  });
  const trEnd=el('tr');
  const lastActive=steps.slice(-1)[0];
  trEnd.appendChild(el('td',null, lastActive?fmt(new Date(lastActive.end.getTime()+86400000)):''));
  trEnd.appendChild(el('td',null,'—'));
  const tdEnd=el('td',null,'Finished. No further doses.');
  tdEnd.colSpan=usedSlots.length; trEnd.appendChild(tdEnd);
  t.appendChild(trEnd);
  c.appendChild(t);
  c.appendChild(el('p','small','\u00bd means half a tablet. Use a pill cutter.'));

  p.appendChild(c); p.appendChild(footer(code)); return p;
}

function dispensingDoc(code){
  const p=page(code); p.id='doc-disp';
  p.appendChild(el('h2',null,'Dispensing breakdown'));

  const w=S.disp.weeks;
  const lead=el('p','small');
  lead.innerHTML=`Quantities are grouped into <strong>${w}-week fills</strong>`+
    (S.disp.from?` starting ${esc(fmt(S.disp.from))}`:'')+
    `. A fill usually spans more than one step, so quantities are totalled across the ` +
    `whole fill rather than per step. No fill requires more than two tablet strengths of any one drug.`;
  p.appendChild(lead);

  const allPeriods=(S.dispensing||[]).slice();
  const allGroups=allPeriods.length?ENG.groupIntoPrescriptions(allPeriods):[];
  let periods=allPeriods.slice();
  if(S.disp.nextOnly && periods.length){
    periods=periods.slice(0,1);
    const note=el('p','small');
    note.innerHTML=`<strong>Showing the next fill only.</strong> The remaining schedule needs `+
      `${allPeriods.length} fill${allPeriods.length===1?'':'s'} across ${allGroups.length} `+
      `prescription${allGroups.length===1?'':'s'} in total.`;
    p.appendChild(note);
  }
  if(!periods.length){ p.appendChild(el('p',null,'No fills in the selected range.'));
    p.appendChild(footer(code)); return p; }

  // Group over the full list so the refill counts are true, then show only what was asked for.
  const shown=new Set(periods);
  const groups=allGroups.map(g=>({...g,periods:g.periods.filter(x=>shown.has(x))}))
                        .filter(g=>g.periods.length);
  groups.forEach(g=>{
    const box=el('div'); box.style.margin='22px 0';
    const h=el('h3',null,`Prescription ${g.rx} \u2014 written ${fmt(g.written)}`);
    box.appendChild(h);
    const meta=el('p','small');
    const full=allGroups.find(x=>x.rx===g.rx)||g;
    meta.textContent=`${full.periods.length} fill${full.periods.length>1?'s':''} `+
      `(initial fill plus ${full.refills} refill${full.refills===1?'':'s'}, ${full.refillDays} days of refills)`+
      (g.periods.length<full.periods.length?`, of which ${g.periods.length} shown here`:'')+`. `+
      (full.endedBecause?`A new prescription is required after this one: ${full.endedBecause}.`
                     :'This prescription covers the remainder of the schedule.');
    box.appendChild(meta);

    // collapse runs of identical fills so repeated scripts read as repeats, not as a bug
    const key=per=>per.lines.map(l=>l.drug+l.strength+'x'+l.qty).join('|');
    const runs=[];
    g.periods.forEach(per=>{
      const last=runs[runs.length-1];
      if(last && key(last.periods[0])===key(per)) last.periods.push(per);
      else runs.push({periods:[per]});
    });

    runs.forEach(run=>{
      const first=run.periods[0], n=run.periods.length;
      const blk=el('div','keep'); blk.style.margin='12px 0';
      const title=n>1
        ? `Fills ${first.n}\u2013${run.periods[n-1].n} \u2014 ${n} identical fills, `+
          `${fmt(first.start)} to ${fmt(run.periods[n-1].end)}`
        : `Fill ${first.n} \u2014 ${fmt(first.start)} to ${fmt(first.end)} (${first.days} days)`;
      blk.appendChild(el('h4',null,title));
      if(n>1) blk.appendChild(el('p','small',
        `The dose does not change across these ${n} fills. Dispense the quantity below `+
        `${n} times, once per fill.`));
      const t=el('table');
      const hr=el('tr'); ['Medication','Strength','Quantity per fill'].forEach(x=>hr.appendChild(el('th',null,x)));
      t.appendChild(hr);
      first.lines.forEach(l=>{
        const tr=el('tr');
        tr.appendChild(el('td',null,l.drug));
        tr.appendChild(el('td',null,l.strength+' mg'));
        tr.appendChild(el('td',null,l.qty+' tablets'));
        t.appendChild(tr);
      });
      blk.appendChild(t);
      if(first.violation) blk.appendChild(el('p','small','\u26a0 Requires more than two strengths of one drug.'));

      const ins=el('div'); ins.style.marginTop='8px';
      ins.appendChild(el('div','small','Patient instructions during this fill:'));
      const ul=el('ul'); ul.style.fontSize='14px';
      first.steps.forEach(idx=>{
        const s=S.result.steps[idx]; if(!s||!s.weeks) return;
        const cite=citation(s), dn=durationNote(s);
        const li=el('li');
        li.innerHTML=`<strong>${esc(fmt(s.start))} \u2013 ${esc(fmt(s.end))}:</strong> `+
          `${esc(ENG.instructionFor(s.regimen,first.strengths))}`+
          (cite?` <span style="color:#5b6672">[${esc(cite)}${dn?'; '+esc(dn):''}]</span>`:'');
        ul.appendChild(li);
      });
      ins.appendChild(ul); blk.appendChild(ins);
      box.appendChild(blk);
    });
    p.appendChild(box);
  });

  p.appendChild(el('p','small',
    'Prescription grouping applies California Schedule IV limits: at most five refills, '+
    'refills capped at 120 days combined, and expiry six months after the date written. '+
    'Whichever limit binds first ends the prescription. Verify against current state rules.'));
  p.appendChild(footer(code)); return p;
}

function codeDoc(code){
  const p=page(code); p.id='doc-code';
  p.appendChild(el('h2',null,'Schedule code'));
  p.appendChild(el('p',null,
    'This code regenerates this exact schedule. Enter it in the "Enter schedule code here" box on '+
    'the first screen to return to it, adjust it, or reprint it.'));
  const cb=el('div','codebox',code); p.appendChild(cb);
  const ph=el('p'); ph.style.marginTop='14px';
  ph.innerHTML='<span class="phi">CONTAINS PHI</span> &nbsp;This code encodes the patient\'s dosing '+
    'and taper dates. Handle it with the same care as any other identifiable clinical information. '+
    'Do not post it publicly or send it over unsecured channels.';
  p.appendChild(ph);
  const ul=el('ul');
  [`Locked to engine version ${ENG.ENGINE_VERSION}. A future version will refuse it rather than
    regenerate something different.`,
   'Checksummed — a mistyped character is rejected outright, never silently accepted as a different schedule.',
   'The characters 0, O, 1 and I are never used, so they cannot be confused.'
  ].forEach(x=>ul.appendChild(el('li',null,x)));
  p.appendChild(ul);

  p.appendChild(el('h3',null,'Schedule summary'));
  const st=S.result.steps, tot=st.reduce((a,s)=>a+(s.weeks||0),0);
  const t=el('table');
  [['Medications',MED_LABEL[S.medKey]],
   ['Starting dose',ENG.regimenEq(st[0].regimen)+'mg diazepam-equivalent'],
   ['Start date',fmtLong(S.startDate)],
   ['Total duration',`${tot} weeks (${(tot/52).toFixed(1)} years)`],
   ['Dose sequences',`${st.filter(s=>s.provenance==='ashton').length} steps reproduce dose `+
     `sequences from published schedules; ${st.filter(s=>s.provenance==='extrapolated').length} `+
     `generated by this tool`],
   ['Durations',`Set by the prescriber`+(st.some(s=>durationNote(s))
     ? `; ${st.filter(s=>durationNote(s)).length} step(s) outside the published range` : '')],
   ['Cited source enters at',S.result.joinAt.replace(/^s(\d+)_/,'Schedule $1, stage ').replace('start','starting dosage')+' (Ashton 2002)'],
  ].forEach(([k,v])=>{ const tr=el('tr'); tr.appendChild(el('th',null,k)); tr.appendChild(el('td',null,v)); t.appendChild(tr); });
  p.appendChild(t);
  p.appendChild(footer(code)); return p;
}

function selectDoc(id){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.doc===id));
  ['doc-hand','doc-disp','doc-code'].forEach(d=>{
    const n=$(d); if(n) n.classList.toggle('hidden', d!==id);
  });
}

/* ---------- code loading ---------- */
function loadCode(){
  const out=$('code-err'); out.innerHTML='';
  const res=CODEC.decode($('code-in').value, ENG);
  if(res.error){ out.innerHTML=`<div class="err">${esc(res.error)}</div>`; return; }
  S.medKey=res.medKey; S.freqs=res.freqs; S.doses=res.doses; S.startDate=res.startDate;
  $('start-date').value=fmt(res.startDate);
  buildMedOpts(); buildFreq(); refresh();
  const gen=ENG.generate(DATA,{regimen:currentRegimen()});
  if(gen.error){ out.innerHTML=`<div class="err">${esc(gen.error)}</div>`; return; }
  S.result=gen;
  if(res.weekPlan&&res.weekPlan.type==='explicit') S.weeks=res.weekPlan.weeks.slice();
  else if(res.weekPlan&&res.weekPlan.type==='offset')
    S.weeks=gen.steps.map(s=>s.weeks_default===0?0:Math.max(1,Math.min(4,s.weeks_default+res.weekPlan.offset)));
  else S.weeks=gen.steps.map(s=>s.weeks_default);
  if(S.weeks.length!==gen.steps.length) S.weeks=gen.steps.map(s=>s.weeks_default);
  applyWeeks(); renderWork(); show('scr-work');
}

/* ---------- transparency: equivalence table and rule set ---------- */
const HALF_LIFE = { alprazolam:'6\u201312 h', lorazepam:'10\u201320 h',
                    clonazepam:'18\u201350 h', diazepam:'20\u2013100 h [36\u2013200]' };
const EQUIV_MG  = { alprazolam:0.5, lorazepam:1, clonazepam:0.5, diazepam:10 };
function buildEquivTable(){
  const t=$('equiv-table'); if(!t) return; t.innerHTML='';
  const hr=el('tr');
  ['Medication','Approx. equivalent to 10mg diazepam','Multiplier used','Half-life (hrs)']
    .forEach(h=>hr.appendChild(el('th',null,h)));
  t.appendChild(hr);
  for(const d of ['alprazolam','lorazepam','clonazepam','diazepam']){
    const tr=el('tr');
    tr.appendChild(el('td',null,d[0].toUpperCase()+d.slice(1)));
    tr.appendChild(el('td',null,EQUIV_MG[d]+' mg'));
    tr.appendChild(el('td',null,'\u00d7 '+ENG.EQ[d]));
    tr.appendChild(el('td',null,HALF_LIFE[d]));
    t.appendChild(tr);
  }
}
function buildRules(){
  const box=$('rules-block'); if(!box) return; box.innerHTML='';
  const R=ENG.RULES;
  const sec=(title,items)=>{
    box.appendChild(el('h4',null,title));
    if(Array.isArray(items)){ const ul=el('ul');
      items.forEach(x=>ul.appendChild(el('li',null,x))); box.appendChild(ul); }
    else box.appendChild(el('p',null,items));
  };
  sec('Order of operations', R.phases);
  sec('Substituting to diazepam', R.crossover);
  sec('Reducing the dose', R.reduction);
  sec('Dispensing', R.dispensing);
  sec('Step durations', R.duration);
  sec('Upper limit', R.ceiling);
}

function renderDispNote(){
  const n=$('disp-note'); if(!n) return;
  const w=S.disp.weeks;
  const periods=S.dispensing||[];
  const groups=periods.length?ENG.groupIntoPrescriptions(periods):[];
  let html = S.disp.fromInvalid
    ? `<div class="err">That date could not be read. Use mm/dd/yy, with a year between 2020 and 2109. Showing the whole schedule instead.</div>`
    : '';
  html+=`<p class="small" style="margin:10px 0 0">${periods.length} fill`+
    `${periods.length===1?'':'s'} across <strong>${groups.length} prescription`+
    `${groups.length===1?'':'s'}</strong> for the remaining schedule.</p>`;
  if(w<4) html+=`<div class="note">Dispensing less than four weeks at a time is usually done `+
    `where there is concern about overuse, diversion, or adherence \u2014 it increases the number `+
    `of prescriber contacts. It does not change the taper itself.</div>`;
  html+=`<p class="small">Dispensing choices are <strong>not stored in the schedule code</strong>. `+
    `The code regenerates the taper; how it is dispensed is chosen fresh each visit.</p>`;
  n.innerHTML=html;
}
function refreshDispensing(){
  applyWeeks(); renderDocs(); renderDispNote();
}

/* ---------- wiring ---------- */
$('btn-agree').onclick=()=>{ show('scr-setup'); buildMedOpts(); buildEquivTable(); refresh(); };
$('btn-info-gate').onclick=()=>{ S._back='scr-gate'; buildRules(); show('scr-info'); };
$('btn-info').onclick=()=>{ S._back='scr-setup'; buildRules(); show('scr-info'); };
$('btn-info-back').onclick=()=>show(S._back||'scr-setup');
$('btn-today').onclick=()=>{ const d=new Date(); S.startDate=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  $('start-date').value=fmt(S.startDate); refresh(); };
$('start-date').oninput=()=>{ S.startDate=parseDate($('start-date').value); refresh(); };
$('btn-run').onclick=run;
$('btn-load').onclick=loadCode;
$('code-in').onkeydown=e=>{ if(e.key==='Enter') loadCode(); };
$('btn-wk-plus').onclick=()=>shiftWeeks(1);
$('btn-wk-minus').onclick=()=>shiftWeeks(-1);
$('btn-reset').onclick=()=>{ S.weeks=weekDefaults(); applyWeeks(); renderWork(); };
$('btn-back').onclick=()=>show('scr-setup');
$('btn-finalize').onclick=()=>{ if(!S.result) return; renderDocs(); renderDispNote(); show('scr-out'); };
$('disp-weeks').onchange=()=>{ S.disp.weeks=parseInt($('disp-weeks').value,10); refreshDispensing(); };
$('disp-next-only').onchange=()=>{ S.disp.nextOnly=$('disp-next-only').checked; renderDocs(); renderDispNote(); };
$('disp-from').oninput=()=>{
  const raw=$('disp-from').value.trim();
  S.disp.from=parseDate(raw);
  S.disp.fromInvalid = raw!=='' && !S.disp.from;
  refreshDispensing(); };
$('btn-disp-today').onclick=()=>{ const d=new Date();
  S.disp.from=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  $('disp-from').value=fmt(S.disp.from); refreshDispensing(); };
$('btn-disp-start').onclick=()=>{ S.disp.from=null; $('disp-from').value=''; refreshDispensing(); };
$('btn-work').onclick=()=>show('scr-work');
$('btn-restart').onclick=()=>{
  // Everything patient-specific, or the next patient inherits the last one's dates.
  S.medKey=null; S.freqs={}; S.doses={}; S.result=null; S.weeks=null; S.code=null;
  S.startDate=null; S.dispensing=null; S.dispensingFull=null; S._tab='doc-hand';
  S.disp={ weeks:4, from:null, nextOnly:false };
  $('code-in').value=''; $('code-err').innerHTML='';
  $('start-date').value=''; $('run-err').innerHTML='';
  if($('disp-from')) $('disp-from').value='';
  if($('disp-weeks')) $('disp-weeks').value='4';
  if($('disp-next-only')) $('disp-next-only').checked=false;
  buildMedOpts(); buildFreq(); refresh(); show('scr-setup'); };
$('btn-print').onclick=()=>window.print();
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{ S._tab=b.dataset.doc; selectDoc(b.dataset.doc); });
