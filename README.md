# Benzodiazepine Taper Schedule Generator

A single-file, client-side tool that turns a patient's **current** benzodiazepine
regimen into a withdrawal schedule derived from the Ashton Manual.

**Not for clinical use.** Research and informational purposes only. Every schedule
requires review by a qualified prescriber. See `LICENSE` for the full notice.

## Running it

`index.html` is the entire application. Open it in any browser — no build step, no
server, no dependencies, no network access required.

To publish: enable GitHub Pages on this repo (Settings → Pages → deploy from branch,
root). The tool works identically from a URL or a downloaded copy on disk.

## How it works

Nothing is transmitted. All computation happens in the browser. No analytics, no
storage, no cookies, no network requests of any kind. The host serves one file and
never sees a dose, a date, or a schedule code.

A generated schedule has up to two labelled parts:

- **Generated** — an on-ramp bridging the patient's actual regimen onto a published
  schedule. Substitutes to diazepam one dose at a time starting with the night dose,
  and reduces by no more than one tenth per step.
- **Published** — steps whose dose sequence is cited from the manual by schedule and
  stage number.

### Citation, not endorsement

Labels are deliberately *citations of source*, not endorsement badges. A step reading
`Schedule 1, Stage 9 — Ashton 2002` says where the dose sequence came from, so a
prescriber can check it against the source. It does **not** say Professor Ashton
recommended this schedule for this patient — she died in 2019 and never saw this tool.
The entry point, the path through the schedules, and the durations are chosen by the
software and the prescriber.

Where a prescriber sets a duration outside the range Ashton published, the step is
marked **duration modified** and the published range is shown, so the citation stays
accurate after an edit. Every printed document carries an explicit non-endorsement
clause naming Professor Ashton, her estate, and the Benzodiazepine Information
Coalition.

## Scope

Alprazolam, lorazepam, clonazepam, diazepam. US tablet strengths. Seven published
schedules in scope (Ashton 1, 2, 3, 5, 6, 7, 8) giving **157 join points**. Declines
above 120mg diazepam-equivalent — the highest published starting dose.

## Guarantees, and how they are tested

`build/test_engine.js` and `build/test_codec.js` run under node with no dependencies.

| Property | Test |
|---|---|
| Each published schedule regenerates exactly from its own starting dose | 7/7, zero on-ramp steps |
| Dose never increases between consecutive steps | 582 synthetic regimens |
| Every schedule terminates at zero | 582 regimens |
| No more than two tablet strengths per drug per 28-day dispensing window | 565 windows, at every week setting 1–4 |
| Schedule code round-trips exactly | 2,000 random inputs |
| Every single-character corruption of a code is rejected | 235,972 corruptions, **0 wrongly accepted** |
| Watermark, code, version and PHI marking appear on every printed page | verified by PDF text extraction |
| Dates correct across daylight saving transitions | 4 timezones, every step spans exactly weeks×7 days |
| UI regression (dates, state, mobile, accessibility) | 32 checks, `build/test_ui_regression.js` |

## Schedule codes

Each schedule gets a checksummed code that regenerates it exactly. The code stores the
**inputs**, not the output — the engine is deterministic, so the same inputs always
produce the same schedule.

Alphabet is `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` — 32 symbols, excluding `0`, `O`, `1`
and `I`. A mistyped character is rejected outright rather than silently producing a
different schedule. Codes are locked to the engine version that made them.

**A code encodes patient dosing and dates. Treat it as PHI.**

## Known defect carried from the source

Schedule 1, Stage 9 prints a daily total of 80mg where its component doses sum to
70mg. This is an error in the original manual. The component doses are used and the
discrepancy is surfaced in the interface rather than silently corrected.

## Build

```
python3 build/prep.py             # manual -> schedule_data.json (156/157 stages reconcile)
node build/test_engine.js         # engine invariants + fixture reproduction
node build/test_codec.js          # code round-trip + corruption resistance
python3 build/bundle.py           # -> index.html
node build/test_ui_regression.js  # browser regression (needs playwright)
```

`index.html` is generated. Edit `build/engine.js`, `build/codec.js`, `build/app.js` or
`build/template.html` and re-run `bundle.py`.

## Before publishing

- [x] Tablet strengths confirmed against a current US formulary
- [ ] Legal review: FDA Clinical Decision Support status (guidance updated Jan 2026)
- [ ] Legal review: whether schedule data derived from the manual may be redistributed.
      Researched and **unresolved** — no published notice addresses derived data. Ashton
      (d. 2019) and Ray Nimmo are both deceased; benzo.org.uk is now a read-only memorial
      archive; benzobookreview.com is dead. Best contact is BIC at `bic@benzoinfo.com`,
      who state they obtained "full permission from relevant parties" for their reprint
      and therefore know who those parties are. Newcastle University's IP office is a
      second route — the institution is named in the copyright line itself.
- [ ] Decide whether to keep the MIT licence or move to Apache 2.0, whose liability
      limitation is more explicit
