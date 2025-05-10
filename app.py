from flask import Flask, render_template, request
from datetime import datetime

import taper_utils

EQUIV_TO_DIAZEPAM = {
    'alprazolam': 20.0,
    'lorazepam': 10.0,
    'clonazepam': 20.0,
    'diazepam': 1.0,
    'chlordiazepoxide': 0.4,
    'nitrazepam': 1.0,
    'temazepam': 0.5,
    'oxazepam': 0.5,
    'zopiclone': 10/15,
}

app = Flask(__name__)

def calculate_equivalent_dose(med, dose):
    return dose * EQUIV_TO_DIAZEPAM.get(med, 0.0)

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

    user_diazepam_equiv = total_diazepam_equiv(doses1, med1) + (total_diazepam_equiv(doses2, med2) if med2 else 0)

    best_step = None
    best_score = -float('inf')

    for step in order:
        _, times, _ = taper_utils.all_steps[step]
        sched_doses = flatten_schedule_doses(times)

        step_diazepam_equiv = 0.0
        dose_match_score = 0
        med_match_score = 0

        for med, user_doses in ((med1, doses1), (med2, doses2) if med2 else (None, None)):
            if med is None:
                continue

            sched = sched_doses.get(med, {})
            if sched:
                med_match_score += 1
                for tod, user_dose in user_doses.items():
                    sched_dose = sched.get(tod, 0.0)
                    if abs(sched_dose - user_dose) < 1e-6:
                        dose_match_score += 1
                    elif sched_dose > user_dose:
                        dose_match_score -= 2
            else:
                dose_match_score -= 2

        for med, tod_doses in sched_doses.items():
            for dose in tod_doses.values():
                step_diazepam_equiv += calculate_equivalent_dose(med, dose)

        diazepam_diff = abs(step_diazepam_equiv - user_diazepam_equiv)
        diazepam_penalty = diazepam_diff if diazepam_diff > 1e-6 else 0

        score = (10 * med_match_score + 5 * dose_match_score) - diazepam_penalty

        if score > best_score:
            best_score = score
            best_step = step

    if best_step:
        _, _, nxt = taper_utils.all_steps[best_step]
        return nxt if nxt and nxt != "END" else best_step
    return None

@app.route("/", methods=["GET", "POST"])
def index():
    meds = sorted(taper_utils.medication_doses.keys())
    schedule = None
    error = None

    if request.method == "POST":
        med1 = request.form.get("med1")
        start_date_str = request.form.get("start_date")

        if med1 and start_date_str:
            doses1 = {
                tod: float(request.form.get(f"{tod}_1") or 0)
                for tod in ("Morning", "Midday", "Afternoon", "Night")
            }

            if request.form.get("diazepam") == "yes":
                med2 = "diazepam"
                doses2 = {
                    tod: float(request.form.get(f"{tod}_2") or 0)
                    for tod in ("Morning", "Midday", "Afternoon", "Night")
                }
            else:
                med2 = None
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
                    for step in taper_utils.get_schedule_steps(start_step, start_date):
                        schedule.extend(taper_utils.prescriptions_for_step(step))

    return render_template("index.html",
                           meds=meds,
                           schedule=schedule,
                           error=error)

if __name__ == "__main__":
    app.run(debug=True)
