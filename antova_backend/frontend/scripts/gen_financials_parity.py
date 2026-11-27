"""Write scripts/fixtures/financials-parity.json from the Python engine.

Seeded random tenders (vendors, parameters, tagged cost lines, rate ranges, legacy adders,
overrides, odd headlines) with the Python engine's financials for each. scripts/test-properties.mjs
checks that the built-in TypeScript engine (src/lib/native/evaluate.ts) returns the same to the cent.
Deterministic: the same seed always writes the same file, so CI can check it is current.

    cd antova_backend/backend
    python ../frontend/scripts/gen_financials_parity.py
"""
import json
import random
import sys
from decimal import Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "backend"))

import antova_engine as engine  # noqa: E402

SEED = 20261127
CASES = 200
rnd = random.Random(SEED)


def money(lo=0, hi=200_000) -> str:
    return f"{rnd.uniform(lo, hi):.2f}"


def headline():
    # Mostly real prices, plus every edge both engines must agree on.
    return rnd.choice([None, 0.0, -1500.0, 0.01, round(rnd.uniform(1, 5_000_000), 2)] + [round(rnd.uniform(1e5, 5e6), 2)] * 5)


def cost_line() -> dict:
    rate = Decimal(money(0, 20_000))
    line = {"label": "line", "qty": f"{rnd.uniform(0, 500):.3f}", "unit": "u", "rate": str(rate),
            "driver": rnd.choice(["fixed", "copper", "labour", "freight"])}
    if rnd.random() < 0.5:
        line["rate_low"] = str((rate * Decimal(str(round(rnd.uniform(0.5, 1), 3)))).quantize(Decimal("0.0001")))
        line["rate_high"] = str((rate * Decimal(str(round(rnd.uniform(1, 1.8), 3)))).quantize(Decimal("0.0001")))
    return line


def cell() -> dict:
    lines = [cost_line() for _ in range(rnd.randint(0, 3))]
    return {"extracted_text": "x", "status": rnd.choice([s.value for s in engine.ComplianceStatus]),
            "confidence": 1.0, "bbox": "", "snippet": "", "cost_lines": lines,
            "cost_adder": 0.0 if lines else float(money(0, 50_000)),
            "pricing_status": rnd.choice(["NONE", "PRICED", "UNPRICED"])}


def tender(i: int) -> dict:
    vids = [f"V{j}" for j in range(rnd.randint(1, 4))]
    vendors = [{"id": v, "name": v, "country": "DE", "doc_name": "", "cover_claim": "", "badge": "",
                "headline_price": headline(), "headline_citation": None,
                "headline_status": rnd.choice([None, None, "PRICED", "NOT_FOUND", "UNREADABLE"])} for v in vids]
    params = [{"id": f"P{k}", "category": "c", "name": f"P{k}", "mr_requirement": "", "pint_rule": "",
               "criticality": rnd.choice([c.value for c in engine.Criticality]),
               "vendors": {v: cell() for v in vids if rnd.random() < 0.8}} for k in range(rnd.randint(0, 6))]
    return {"id": f"T{i}", "title": "T", "client": "", "mr_doc": "", "pages_parsed": 0, "latency_sec": 0,
            "compute_cogs": 0.0, "vendors": vendors, "parameters": params}


def sensitivity() -> dict:
    return {"copper_multiplier": round(rnd.uniform(0, 3), 3),
            "site_labor_rate": rnd.choice([None, round(rnd.uniform(0, 250), 2)]),
            "freight_multiplier": round(rnd.uniform(0, 3), 3)}


cases = []
for i in range(CASES):
    t, s = tender(i), sensitivity()
    cells = [(p["id"], v) for p in t["parameters"] for v in p["vendors"]]
    overrides = {f"{p}|{v}": {"adder_eur": money(0, 80_000), "note": "n"}
                 for p, v in rnd.sample(cells, min(len(cells), rnd.randint(0, 2)))}
    py_overrides = {tuple(k.split("|")): engine.Override(adder_eur=Decimal(o["adder_eur"]), note=o["note"])
                    for k, o in overrides.items()}
    expected = engine.evaluate_vendor_financials(
        engine.TenderPackage.model_validate(t), engine.SensitivitySettings(**s), [], None, py_overrides)
    cases.append({"tender": t, "sensitivity": s, "overrides": overrides, "expected": expected})

out = HERE / "fixtures" / "financials-parity.json"
out.write_text(json.dumps({"source": "antova_engine.evaluate_vendor_financials", "seed": SEED, "cases": cases},
                          separators=(",", ":")) + "\n", encoding="utf-8")
print(f"wrote {out} ({len(cases)} cases)")
