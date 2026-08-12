const E = require('./engine.js'), C = require('./codec.js');
let seed=12345; const rng=()=>{seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff;};
let fail=0; const ok=(c,m)=>{if(!c){console.log('  FAIL:',m);fail++;}};

function randInput(){
  const mk = C.MED_KEYS[Math.floor(rng()*C.MED_KEYS.length)];
  const drugs = E.MED_OPTIONS[mk], freqs={}, doses={};
  for(const d of drugs){
    const f = C.FREQ_KEYS[Math.floor(rng()*C.FREQ_KEYS.length)];
    freqs[d]=f; doses[d]={};
    const list=E.achievableDoses(d);
    for(const s of E.FREQ_SLOTS[f]) doses[d][s]=list[Math.floor(rng()*Math.min(list.length,40))+1]||list[0];
  }
  return {medKey:mk,freqs,doses,startDate:new Date(2026,Math.floor(rng()*12),1+Math.floor(rng()*28))};
}

console.log('=== ROUND TRIP (2000 random inputs) ===');
const codes=[];
let lens=[];
for(let i=0;i<2000;i++){
  const inp=randInput();
  const nsteps = 5+Math.floor(rng()*40);
  const def=Array.from({length:nsteps},()=>1+Math.floor(rng()*2));
  let weeks=null;
  const roll=rng();
  if(roll<0.34) weeks=null;
  else if(roll<0.67) weeks=def.map(v=>Math.max(1,Math.min(4,v+1)));
  else weeks=def.map(()=>1+Math.floor(rng()*4));
  inp.weeks=weeks; inp.weekDefaults=def;
  const code=C.encode(inp,E); codes.push(code); lens.push(code.replace(/-/g,'').length);
  const out=C.decode(code,E);
  ok(!out.error, `decode error: ${out.error}`);
  if(out.error) continue;
  ok(out.medKey===inp.medKey,'medKey');
  for(const d in inp.freqs) ok(out.freqs[d]===inp.freqs[d],'freq '+d);
  for(const d in inp.doses) for(const s in inp.doses[d]) ok(out.doses[d][s]===inp.doses[d][s],`dose ${d} ${s}: ${out.doses[d][s]} != ${inp.doses[d][s]}`);
  ok(out.startDate.getFullYear()===inp.startDate.getFullYear()&&out.startDate.getMonth()===inp.startDate.getMonth()&&out.startDate.getDate()===inp.startDate.getDate(),'date');
  if(weeks===null) ok(out.weekPlan===null,'weekPlan should be null');
  else if(out.weekPlan&&out.weekPlan.type==='explicit') ok(JSON.stringify(out.weekPlan.weeks)===JSON.stringify(weeks),'explicit weeks');
}
lens.sort((a,b)=>a-b);
console.log(`  code length: min ${lens[0]}  median ${lens[Math.floor(lens.length/2)]}  max ${lens[lens.length-1]} chars`);

console.log('\n=== CORRUPTION: every single-character substitution must be rejected ===');
let tested=0, accepted=0;
for(const code of codes.slice(0,300)){
  const raw=code.replace(/-/g,'');
  for(let i=0;i<raw.length;i++){
    for(const ch of C.ALPHABET){
      if(ch===raw[i]) continue;
      const bad=raw.slice(0,i)+ch+raw.slice(i+1);
      tested++;
      const res=C.decode(bad,E);
      if(!res.error) accepted++;
    }
  }
}
console.log(`  ${tested} corruptions tested, ${accepted} wrongly accepted (${(100*accepted/tested).toFixed(4)}%)`);
ok(accepted/tested < 0.0001, `checksum too weak: ${accepted} accepted`);

console.log('\n=== EXCLUDED CHARACTERS ===');
for(const ch of '01IO'){ ok(C.ALPHABET.indexOf(ch)<0, `alphabet must not contain ${ch}`); }
console.log('  alphabet:', C.ALPHABET, `(${C.ALPHABET.length} symbols)`);
const r=C.decode('23456789ABCD0FGH',E);
ok(!!r.error,'code containing 0 must be rejected');
console.log('  code with a 0 ->', r.error.slice(0,60)+'...');

console.log('\n=== SAMPLE CODES ===');
codes.slice(0,4).forEach(c=>console.log('  '+c));
console.log(fail?`\n*** ${fail} FAILURES ***`:'\nALL CHECKS PASSED');
