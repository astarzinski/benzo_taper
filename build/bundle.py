import json, re, pathlib
import os
os.chdir(pathlib.Path(__file__).resolve().parent)
eng = open('engine.js').read()
cod = open('codec.js').read()
app = open('app.js').read()
data = open('schedule_data.json').read()

# strip node-only exports, expose namespaces for the browser
eng = re.sub(r"if \(typeof module.*?\n};\n", "", eng, flags=re.S)
cod = re.sub(r"if \(typeof module.*?\n", "", cod, flags=re.S)
eng += """
const ENG = { ENGINE_VERSION, RULES, EQ, STRENGTHS, SLOTS, SLOT_LABEL, FREQ_SLOTS, MED_OPTIONS,
  CEILING_EQ, DISPENSE_DAYS, MAX_DISPENSE_WEEKS, groupIntoPrescriptions, composable, breakdown, achievableDoses, snapDown, snapBetween,
  regimenEq, slotEq, drugsIn, cloneReg, stepRegimen, findJoinTarget, buildOnRamp,
  generate, applyDates, selectStrengths, buildDispensing, instructionFor, tabletPhrase, slotDoseText };
"""
cod += "\nconst CODEC = { encode, decode, ALPHABET, MED_KEYS, FREQ_KEYS, group, crc16 };\n"

# minify the data a little: drop fields the browser never reads
d = json.loads(data)
for k, v in d['steps'].items():
    v.pop('notes', None)
data = json.dumps(d, separators=(',', ':'))

html = open('template.html').read()
html = html.replace('/*ENGINE*/', eng).replace('/*CODEC*/', cod)
html = html.replace('/*DATA*/', data).replace('/*APP*/', app)
root = pathlib.Path(__file__).resolve().parent.parent
(root/'index.html').write_text(html)
print(f"wrote index.html — {len(html):,} bytes ({len(html)/1024:.0f} KB)")
