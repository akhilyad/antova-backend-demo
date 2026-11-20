"""Write scripts/fixtures/sensitivity-parity.json from the Python engine.

The fixture pins the browser's sensitivity preview (src/lib/domain/sensitivity.ts) to
antova_engine.evaluate_vendor_financials. Re-run after an engine change:

    cd antova_backend/backend
    python ../frontend/scripts/gen_sensitivity_parity.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "backend"))

import antova_engine as engine  # noqa: E402

sample = json.loads((HERE.parent / "src" / "lib" / "sample402.json").read_text(encoding="utf-8"))
tender = engine.TenderPackage.model_validate(sample["tender"])

RATES = {
    "table": {"copper_multiplier": 1.0, "site_labor_rate": None, "freight_multiplier": 1.0},
    "pessimistic": {"copper_multiplier": 1.8, "site_labor_rate": 85, "freight_multiplier": 1.5},
    "optimistic": {"copper_multiplier": 0.85, "site_labor_rate": 50, "freight_multiplier": 0.85},
    "odd_cents": {"copper_multiplier": 1.137, "site_labor_rate": 61.33, "freight_multiplier": 0.913},
}
PAIRS = [("table", "pessimistic"), ("table", "optimistic"), ("pessimistic", "optimistic"), ("optimistic", "odd_cents")]


def financials(rates: dict) -> list[dict]:
    return engine.evaluate_vendor_financials(tender, engine.SensitivitySettings(**rates), [], "", {})


cases = []
for applied, staged in PAIRS:
    cases.append({
        "name": f"{applied} -> {staged}",
        "applied": RATES[applied],
        "staged": RATES[staged],
        "financials_applied": financials(RATES[applied]),
        "expected": {f["vendor_id"]: f["true_evaluated_price"] for f in financials(RATES[staged])},
    })

out = HERE / "fixtures" / "sensitivity-parity.json"
out.write_text(json.dumps({"source": "antova_engine.evaluate_vendor_financials", "cases": cases}, indent=1) + "\n",
               encoding="utf-8")
print(f"wrote {out} ({len(cases)} cases)")
