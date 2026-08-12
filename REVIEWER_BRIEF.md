# Reviewer brief

**Benzodiazepine Taper Schedule Generator — for review, not for clinical use.**

Thank you for looking at this. What follows is what the tool does, how to try it in five
minutes, and — most importantly — **the places where I made a judgement call that you may
disagree with.** Those are what I need your eyes on. Everything else has been tested to
death; the decisions have not.

---

## Trying it

`index.html` is the entire application. Open it in any browser. Nothing installs, nothing
is transmitted, nothing is stored. It works with the wifi off.

1. Read the disclaimer, click **I have read and agree**.
2. Pick a medication tile, set the frequency, pick doses from the dropdowns.
3. Enter a start date, or click **Today**. Click **Run**.
4. On the working schedule, adjust weeks per step if you want. Click **Finalize**.
5. Three tabs: **Patient handout**, **Dispensing breakdown**, **Schedule code**.
   Print/Save-as-PDF prints all three.

A few regimens worth trying: `lorazepam 3mg TID` (lands exactly on a published schedule),
`alprazolam 0.5mg QD` (low dose), `diazepam 5/3/5mg TID` (a patient stalled mid-taper),
`alprazolam 3mg TID` (declines — over the ceiling).

**The schedule code** at the end regenerates the identical schedule. Copy it, click Start
over, paste it back. That is how a patient who stalls comes back: enter where they are
now, or reload their code.

---

## What is Ashton's and what is mine

This matters for how you read the output.

| Label on a step | Meaning |
|---|---|
| **PUBLISHED** | The dose sequence is reproduced from the Ashton Manual, cited by schedule and stage number so you can check it against the source. |
| **GENERATED** | Produced by this software. Appears in no published schedule. |

A citation is **not** an endorsement. Where a step reads *Schedule 1, Stage 9 — Ashton
2002*, that says where the dose sequence came from. It does not say Professor Ashton
recommended this schedule for this patient. The entry point, the path through the
schedules, and every step duration are chosen by the software and by you.

The full rule set the tool follows is printed inside the app under **About this tool →
The rules this tool follows**. Please read it — it is short, and it is the thing to argue
with.

---

## The decisions I want you to challenge

These are ranked by how much I doubt them.

### 1. Crossover ordering

When substituting to diazepam, the tool advances **whichever time-of-day dose is least
converted so far**, ties going to the night dose, then morning, then midday.

I derived this by measuring Ashton's four substitution schedules. It reproduces Schedules
**6 and 8 exactly**. It does **not** reproduce Schedules 1 and 3, which push the night
dose ahead of the others — those two have four rungs per dose rather than two or three,
and she appears to front-load the night conversion when the ladder is long.

I chose the round-robin because it is one sentence, and because where it differs it is
*more* gradual, never less. **Is that the right call, or should the night dose be
converted first and fully?**

### 2. How much drug is exchanged at each substitution step

Each step swaps **5mg of diazepam-equivalent below 60mg-equivalent total, 10mg above**.

This falls out of tablet geometry: one 0.5mg rung of lorazepam is 5mg of diazepam, while
one 0.5mg rung of alprazolam or clonazepam is 10mg. It reproduces Schedules 1, 3 and 8.
It does **not** reproduce Schedule 6, which uses 10mg steps at 60mg-equivalent — right at
the boundary. **Is 60 the right dividing line, and does the direction of the error (too
gradual at 60) matter?**

### 3. Substitution and reduction never overlap

The tool finishes converting to diazepam **before** lowering any dose. Ashton overlaps
them — in Schedule 6 she starts reducing while a dose is still part-converted.

Strict sequencing is easier to explain and to audit, and it means no patient is ever
reducing and switching at the same time. It also makes schedules longer. **Is the extra
duration worth the simplicity, or should reduction start once the crossover is mostly
done?**

### 4. The ceiling

Above **120mg diazepam-equivalent** — the highest published starting dose, Schedule 1 —
the tool declines and says specialist referral is indicated, rather than extrapolating.

**Is declining right, or is a clearly-flagged extrapolated schedule better than nothing
for a patient on 200mg-equivalent?**

### 5. Where the tool joins a published schedule

Given a patient's regimen, the tool picks the published step to aim for by scoring: never
above the patient's current dose, closest total, similar spread across the day, and a
preference for landing on the head of a schedule. **Look at the "Cited source enters at"
line on the code sheet and tell me whether the entry point makes sense clinically.**

### 6. Tablet handling

- The original drug is stopped at its **smallest whole tablet** rather than split further
  (no quartering a 0.25mg tablet). Ashton never splits below this either.
- The solver **prefers whole tablets over fewer tablets**. It will give one 10mg plus
  four 2mg rather than one and a half 10mg plus one and a half 2mg — five tablets instead
  of three, but nothing halved. **Is that the right trade for a dependent patient?**
- Half tablets appear only where a dose cannot be made without them.

### 7. Durations

Published steps carry their published duration. Generated steps default to one week. You
can set any step from **1 to 4 weeks**. Where you set a duration outside the range Ashton
published, the step is flagged *duration modified* with her range shown, so the citation
stays honest.

**Dose values cannot be edited.** That is deliberate — it keeps the dose curve a pure
function of the entered regimen, which is what makes the schedule code safe. **Is that too
restrictive?**

### 8. Dispensing

Maximum **four weeks per fill**, and you can choose 1, 2 or 3. Fills are grouped into
prescriptions under Schedule IV limits — five refills, 120 days of refills, six-month
expiry — so you can see when a new prescription is required. A 50–90 week taper needs
several prescriptions regardless.

Shorter fills exist for patients where overuse, diversion or adherence is a concern. They
do not change the taper.

---

## Known imperfections, already understood

- **Schedule 1, Stage 9 prints a daily total of 80mg where its component doses sum to
  70mg.** This is an error in the original manual. The tool uses the component doses —
  what the patient actually takes — and surfaces the discrepancy on the step rather than
  silently correcting it.
- **Five regimens out of 541 tested decline rather than generate.** All are clinically
  implausible (lorazepam 0.25mg once daily; four-times-daily splits below 8mg-equivalent).
  They decline with an actionable message rather than producing something unsafe.
- **A single dose too large to substitute** — for example a patient taking their entire
  daily dose at bedtime at a high total — declines, with a message suggesting the dose be
  split across the day first. This is intentional: substituting it in one move would be a
  cut larger than 10%.

---

## What has been tested

So you know where *not* to spend your time:

- All seven in-scope published schedules regenerate exactly from their own starting doses.
- 541 regimens across every medication, frequency and dose: no dose ever increases, every
  schedule terminates at zero, no dispensing window needs more than two tablet strengths
  of one drug, never more than six tablets at one administration.
- Schedule codes: 247,442 corruptions tested, none wrongly accepted. A mistyped code is
  rejected, never silently turned into a different schedule.
- Dates verified across four timezones including daylight saving transitions.
- Printed output verified page by page for the watermark, code, version and PHI marking.

**None of this is clinical review.** It confirms the tool does what its rules say. Whether
the rules are right is the question I am asking you.

---

## What would help most

1. Generate a schedule for a patient you have actually tapered. Does it resemble what you
   did? Where does it differ, and is the difference defensible?
2. Read the patient handout as though you were handing it to someone. Is the reading level
   right? Is anything missing or confusing?
3. Look at the dispensing breakdown as though you were writing the prescriptions. Are the
   quantities right? Would a pharmacy fill it?
4. Tell me where the tool is confidently wrong. That is worth more than anywhere it is
   merely awkward.

Any schedule you generate carries a code at the bottom. **Send me the code and I can
reproduce exactly what you saw** — no screenshots needed. Treat the code as protected
health information: it encodes dosing and dates.
