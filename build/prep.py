import json, re, sys

S = json.load(open('/tmp/taper/ashton_schedules.json'))
EQ = {'alprazolam':20.0,'lorazepam':10.0,'clonazepam':20.0,'diazepam':1.0}
INSCOPE = [1,2,3,5,6,7,8]
SLOTMAP = {   # normalise the manual's varying column names onto 4 canonical slots
 'Morning':'morning','Midday/Afternoon':'midday','Midday':'midday','Afternoon':'afternoon',
 'Evening/Night':'night','Evening':'night','Night':'night','Night time':'night',
}
CHAIN = {1:('2','start'), 5:('3',26), 6:('5',10), 7:('3',26), 8:('3',26)}

def is_total(n): return n.lower().startswith(('daily','equivalent','total'))

steps={}; order={}
problems=[]
for sn in INSCOPE:
    s=S[str(sn)]; seq=[]
    for st in s['stages']:
        slots={}; printed=None; notes=[]
        for name,c in st['columns'].items():
            if is_total(name):
                if c['note']:
                    m=re.search(r'([\d.]+)\s?mg', c['note'])
                    if m: printed=float(m.group(1))
                continue
            key=SLOTMAP.get(name)
            if key is None:
                problems.append(f"S{sn}: unmapped column {name!r}"); continue
            if c['doses']:
                slots[key]=[[d['drug'],d['mg']] for d in c['doses']]
            if c['note'] and not c['doses']: notes.append(f"{key}:{c['note']}")
        if not slots: continue
        calc=sum(EQ[d]*mg for v in slots.values() for d,mg in v)
        sid=f"s{sn}_{'start' if st['is_start'] else st['stage']}"
        wk=st['weeks'] or ([1,1] if st['is_start'] else [1,2])
        steps[sid]={'sched':sn,'stage':'start' if st['is_start'] else st['stage'],
                    'slots':slots,'weeks_default':wk[1],'weeks_range':wk,
                    'eq':round(calc,4),'printed_eq':printed,'notes':notes}
        seq.append(sid)
    order[sn]=seq

# ---- reconciliation ----
print("RECONCILIATION: computed diazepam-equivalent vs printed total")
bad=[]
for sid,v in steps.items():
    if v['printed_eq'] is None: continue
    if abs(v['eq']-v['printed_eq'])>0.001: bad.append((sid,v['eq'],v['printed_eq'],v['slots']))
print(f"  {len(steps)} stages, {sum(1 for v in steps.values() if v['printed_eq'] is not None)} with a printed total")
print(f"  MISMATCHES: {len(bad)}")
for sid,c,p,sl in bad: print(f"    {sid}: computed {c} vs printed {p}   {sl}")

# ---- chaining ----
for sn in INSCOPE:
    seq=order[sn]
    for i,sid in enumerate(seq):
        steps[sid]['next']= seq[i+1] if i+1<len(seq) else None
    last=seq[-1]
    if sn in CHAIN:
        tsn,tstg=CHAIN[sn]
        tid=f"s{tsn}_{tstg}"
        if tid not in steps: problems.append(f"S{sn} chains to missing {tid}")
        else: steps[last]['next']=tid; steps[last]['chains_to']=tid
    else:
        steps[last]['next']=None

print("\nCHAIN TAILS (where each schedule ends up):")
for sn in INSCOPE:
    sid=order[sn][0]; n=0; seen=set()
    while sid and sid not in seen:
        seen.add(sid); last=sid; sid=steps[sid]['next']; n+=1
    print(f"  Schedule {sn}: {n} steps -> terminates at {last} (eq {steps[last]['eq']}mg)")

print("\nPROBLEMS:", problems or "none")
json.dump({'steps':steps,'order':{str(k):v for k,v in order.items()},'eq':EQ},
          open('build/schedule_data.json','w'), indent=1)
print(f"\nwrote build/schedule_data.json — {len(steps)} steps")
