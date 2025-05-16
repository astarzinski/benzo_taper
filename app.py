from flask import Flask, render_template, request
from datetime import datetime
import taper_utils

# Diazepam‑equivalent conversion factors
equiv_to_diazepam = {
    'alprazolam': 20.0,
    'lorazepam': 10.0,
    'clonazepam': 20.0,
    'diazepam': 1.0,
}

app = Flask(__name__)

def calculate_equivalent_dose(med, dose):
    return dose * equiv_to_diazepam.get(med, 0.0)

def total_diazepam_equiv(doses, med):
    return sum(calculate_equivalent_dose(med, d) for d in doses.values())

def flatten_schedule_doses(times):
    result = {}
    for tod, value in times.items():
        if not value:
            continue
        meds = value if isinstance(value[0], tuple) else [value]
        for med, dose in meds:
            result.setdefault(med, {})[tod] = result.setdefault(med, {}).get(tod, 0) + dose
    return result

def find_matching_step(med1, doses1, med2=None, doses2=None):
    # 1. Build linearized order of all steps
    order = []
    seen = set()
    for root in sorted(k for k in taper_utils.all_steps if k.endswith("_0")):
        curr = root
        while curr not in seen:
            seen.add(curr)
            order.append(curr)
            _, _, nxt = taper_utils.all_steps[curr]
            if nxt == "END":
                break
            curr = nxt

    # 2. Filter steps to those containing med1
    filtered = []
    for step in order:
        _, times, _ = taper_utils.all_steps[step]
        sched = flatten_schedule_doses(times)
        if med1 in sched:
            filtered.append(step)
    order = filtered

    # 3. Compute user's total and fractions
    user_eq = total_diazepam_equiv(doses1, med1)
    user_med2_eq = 0.0
    if med2:
        user_med2_eq = total_diazepam_equiv(doses2, med2)
        user_eq += user_med2_eq

    # Range filter: up to +2mg, down to -20mg
    candidates = []
    for step in order:
        _, times, _ = taper_utils.all_steps[step]
        sched = flatten_schedule_doses(times)
        step_eq = sum(
            calculate_equivalent_dose(m, d)
            for m, tods in sched.items()
            for d in tods.values()
        )
        if user_eq - 20 <= step_eq <= user_eq + 2:
            candidates.append((step, sched, step_eq))

    # If none in range, fallback
    if not candidates:
        candidates = [
            (
                step,
                flatten_schedule_doses(taper_utils.all_steps[step][1]),
                sum(
                    calculate_equivalent_dose(m, d)
                    for m, tods in flatten_schedule_doses(taper_utils.all_steps[step][1]).items()
                    for d in tods.values()
                )
            )
            for step in order
        ]

    # 4. Score by fraction and time-of-day match
    user_frac1 = total_diazepam_equiv(doses1, med1) / user_eq if user_eq else 0
    user_frac2 = user_med2_eq / user_eq if user_eq else 0
    user_tod_eq = {
        tod: calculate_equivalent_dose(med1, doses1.get(tod, 0)) +
             (calculate_equivalent_dose(med2, doses2.get(tod, 0)) if med2 else 0)
        for tod in ("Morning","Midday","Afternoon","Night")
    }

    best_score = -float('inf')
    best_step  = None
    WEIGHT_FRAC = 100.0
    WEIGHT_TIME = 10.0

    for step, sched, step_eq in candidates:
        step_med1_eq = sum(
            calculate_equivalent_dose(med1, d)
            for d in sched.get(med1, {}).values()
        )
        step_med2_eq = sum(
            calculate_equivalent_dose(med2, d)
            for d in sched.get(med2, {}).values()
        ) if med2 else 0.0

        frac1 = step_med1_eq / step_eq if step_eq else 0
        frac2 = step_med2_eq / step_eq if step_eq else 0
        frac_score = 1.0 - (abs(frac1 - user_frac1) + abs(frac2 - user_frac2))

        time_diff_sum = 0.0
        for tod in ("Morning","Midday","Afternoon","Night"):
            step_tod_eq = sum(
                calculate_equivalent_dose(m, sched[m].get(tod, 0))
                for m in sched
            )
            time_diff_sum += abs(step_tod_eq - user_tod_eq[tod])
        time_score = -time_diff_sum

        score = WEIGHT_FRAC * frac_score + WEIGHT_TIME * time_score
        if score > best_score:
            best_score = score
            best_step  = step

    if best_step:
        _, _, nxt = taper_utils.all_steps[best_step]
        return nxt if nxt and nxt != "END" else best_step
    return None

@app.route("/", methods=["GET","POST"])
def index():
    meds     = sorted(taper_utils.medication_doses.keys())
    schedule = None
    error    = None

    if request.method == "POST":
        med1           = request.form.get("med1")
        start_date_str = request.form.get("start_date")
        if med1 and start_date_str:
            doses1 = {
                tod: float(request.form.get(f"{tod}_1") or 0)
                for tod in ("Morning","Midday","Afternoon","Night")
            }
            if request.form.get("diazepam") == "yes":
                med2 = "diazepam"
                doses2 = {
                    tod: float(request.form.get(f"{tod}_2") or 0)
                    for tod in ("Morning","Midday","Afternoon","Night")
                }
            else:
                med2   = None
                doses2 = None

            try:
                start_date = datetime.strptime(start_date_str, "%m/%d/%Y")
            except ValueError:
                error = "Invalid date. Please use M/D/YYYY format."
            else:
                start_step = find_matching_step(med1, doses1, med2, doses2)
                if not start_step:
                    error = "No matching taper step found for those doses."
                else:
                    schedule = []
                    for s in taper_utils.get_schedule_steps(start_step, start_date):
                        schedule.extend(taper_utils.prescriptions_for_step(s))

                    # map raw 'sX_Y' codes to human‑readable "Step 1, Step 2, …"
                    step_map = {}
                    for item in schedule:
                        code = item['step']
                        if code not in step_map:
                            step_map[code] = len(step_map) + 1
                        item['step'] = f"Step {step_map[code]}"

    return render_template("index.html",
                           meds=meds,
                           schedule=schedule,
                           error=error)

if __name__ == "__main__":
    app.run(debug=True)
