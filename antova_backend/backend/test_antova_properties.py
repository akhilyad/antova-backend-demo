"""Property tests for the leveling math in antova_engine.evaluate_vendor_financials.

Each test states a rule that must hold for every tender, not one sample. Hypothesis
generates tenders (vendors, parameters, tagged cost lines, rate ranges, overrides) and
shrinks any failure to the smallest tender that breaks the rule.
"""
from decimal import Decimal

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

import antova_engine as engine

D = Decimal
MONEY = st.decimals(min_value=0, max_value=500_000, places=2, allow_nan=False, allow_infinity=False)
QTY = st.decimals(min_value=0, max_value=2_000, places=3, allow_nan=False, allow_infinity=False)
FACTOR = st.decimals(min_value=0, max_value=1, places=3, allow_nan=False, allow_infinity=False)


@st.composite
def cost_lines(draw):
    rate = draw(MONEY)
    ranged = draw(st.booleans())
    low = rate * (1 - draw(FACTOR)) if ranged else None
    high = rate * (1 + draw(FACTOR)) if ranged else None
    return engine.CostLine(
        label="line", qty=draw(QTY), unit="u", rate=rate,
        driver=draw(st.sampled_from(["fixed", "copper", "labour", "freight"])),
        rate_low=low, rate_high=high,
    )


@st.composite
def extractions(draw):
    lines = draw(st.lists(cost_lines(), max_size=4))
    legacy = float(draw(MONEY)) if not lines else 0.0
    return engine.ExtractedParameter(
        extracted_text="x", status=draw(st.sampled_from(list(engine.ComplianceStatus))),
        confidence=1.0, bbox="", snippet="", cost_adder=legacy, cost_lines=lines,
        pricing_status=draw(st.sampled_from(["NONE", "PRICED", "UNPRICED"])),
    )


@st.composite
def tenders(draw, min_vendors=1):
    n_vendors = draw(st.integers(min_value=min_vendors, max_value=4))
    vendor_ids = [f"V{i}" for i in range(n_vendors)]
    vendors = [
        engine.Vendor(
            id=vid, name=vid, country="DE", doc_name="", cover_claim="", badge="",
            headline_price=draw(st.one_of(st.none(), MONEY.filter(lambda m: m > 0).map(float))),
        )
        for vid in vendor_ids
    ]
    params = []
    for i in range(draw(st.integers(min_value=0, max_value=6))):
        present = draw(st.lists(st.sampled_from(vendor_ids), unique=True))
        params.append(engine.EngineeringParameter(
            id=f"P{i}", category="c", name=f"P{i}", mr_requirement="", pint_rule="",
            criticality=draw(st.sampled_from(list(engine.Criticality))),
            vendors={vid: draw(extractions()) for vid in present},
        ))
    return engine.TenderPackage(
        id="T", title="T", client="", mr_doc="", pages_parsed=0, latency_sec=0, compute_cogs=0.0,
        vendors=vendors, parameters=params,
    )


sensitivities = st.builds(
    engine.SensitivitySettings,
    copper_multiplier=st.floats(min_value=0, max_value=3, allow_nan=False).map(lambda f: round(f, 3)),
    site_labor_rate=st.one_of(st.none(), st.floats(min_value=0, max_value=250, allow_nan=False).map(lambda f: round(f, 2))),
    freight_multiplier=st.floats(min_value=0, max_value=3, allow_nan=False).map(lambda f: round(f, 3)),
)

PROPS = settings(max_examples=300, deadline=None, suppress_health_check=[HealthCheck.too_slow])


def evaluate(tender, s, conceded=(), negotiating=None, overrides=None):
    rows = engine.evaluate_vendor_financials(tender, s, list(conceded), negotiating, overrides or {})
    return {r["vendor_id"]: r for r in rows}


def money(x) -> Decimal:
    return D(str(x))


@PROPS
@given(tenders(), sensitivities)
def test_low_base_high_are_ordered(tender, s):
    """With non-negative rates, multipliers and well-ordered rate ranges, low <= base <= high."""
    for r in evaluate(tender, s).values():
        assert money(r["total_adders_low"]) <= money(r["total_adders"]) <= money(r["total_adders_high"])
        if r["true_evaluated_price"] is not None:
            assert r["true_evaluated_low"] <= r["true_evaluated_price"] <= r["true_evaluated_high"]


@PROPS
@given(tenders(), sensitivities)
def test_price_is_headline_plus_adders(tender, s):
    """The true evaluated price is the headline plus the adders, and the adders split into tech + commercial."""
    for r in evaluate(tender, s).values():
        assert money(r["total_adders"]) == money(r["total_tech_penalty"]) + money(r["total_commercial_adder"])
        if r["price_status"] in ("PRICED", "UNPRICED_ITEMS"):
            assert money(r["true_evaluated_price"]) == money(r["headline_price"]) + money(r["total_adders"])
        else:
            assert r["true_evaluated_price"] is None


@PROPS
@given(tenders(), sensitivities, st.data())
def test_conceding_moves_adders_without_losing_any(tender, s, data):
    """Conceding parameters for one vendor moves their adders into clawed_back; nothing appears or vanishes,
    the vendor's price never rises, and no other vendor changes."""
    if not tender.parameters:
        return
    vendor = data.draw(st.sampled_from([v.id for v in tender.vendors]))
    conceded = data.draw(st.lists(st.sampled_from([p.id for p in tender.parameters]), unique=True))
    before = evaluate(tender, s)
    after = evaluate(tender, s, conceded, vendor)
    b, a = before[vendor], after[vendor]
    assert money(a["total_adders"]) + money(a["clawed_back_amount"]) == money(b["total_adders"])
    if b["true_evaluated_price"] is not None:
        assert a["true_evaluated_price"] <= b["true_evaluated_price"]
    for vid in before:
        if vid != vendor:
            assert after[vid] == before[vid]


@PROPS
@given(tenders(), sensitivities, st.data())
def test_overriding_a_cell_with_its_own_adder_changes_no_total(tender, s, data):
    """An override equal to the computed adder leaves every total unchanged (it only collapses the range)."""
    cells = [(p.id, vid) for p in tender.parameters for vid in p.vendors]
    if not cells:
        return
    pid, vid = data.draw(st.sampled_from(cells))
    before = evaluate(tender, s)
    cell = next(i for i in before[vid]["itemized_breakdown"] if i["param_id"] == pid)
    after = evaluate(tender, s, overrides={(pid, vid): engine.Override(adder_eur=money(cell["adder_eur"]), note="")})
    for key in ("total_adders", "total_tech_penalty", "total_commercial_adder", "true_evaluated_price"):
        assert after[vid][key] == before[vid][key]


@PROPS
@given(tenders(min_vendors=2), sensitivities, st.randoms(use_true_random=False))
def test_vendor_order_does_not_change_any_vendor(tender, s, rnd):
    """Without concessions each vendor is evaluated on its own: reordering vendors changes nothing."""
    before = evaluate(tender, s)
    shuffled = tender.model_copy(update={"vendors": rnd.sample(tender.vendors, len(tender.vendors))})
    assert evaluate(shuffled, s) == before


def test_negative_or_zero_headline_is_not_a_price():
    """Found by the TS parity check: a negative headline counted as PRICED. Only a positive headline prices a vendor."""
    for bad in (-1500.0, 0.0):
        v = engine.Vendor(id="V", name="V", country="DE", doc_name="", cover_claim="", badge="", headline_price=bad)
        assert engine.headline_status(v) == "NOT_FOUND"
