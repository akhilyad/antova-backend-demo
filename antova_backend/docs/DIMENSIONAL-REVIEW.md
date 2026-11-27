# Dimensional review

This is a unit and scaling audit of the engine, run with Trail of Bits `dimensional-analysis` 3.2.0 on
27 Nov 2026. Scope was 41 files across `backend/` (Python engine and `antova_ingest/`) and
`frontend/src/lib/{native,domain}` (the TS engine that runs on the Worker). Every file went
through anchor annotation, then propagation, then validation. Vocabulary: `../DIMENSIONAL_UNITS.md`.
Scope and per-file status: `../DIMENSIONAL_SCOPE.json`.

The audit only added `{unit}` comments. A token-level check (Python `tokenize`, TS `transpileModule`
with comments stripped) confirms the code is identical to the pre-audit commit.

"Reproduced" means the case was run against the real code. Everything else was traced by hand
by the validators and confirmed in a second, independent pass.

## Fixed on this branch

Each fix was written test first, and every test named below failed before its fix.

| ID | Fix | Test |
|---|---|---|
| PY-M01 / TS-M01 | A headline worded per bay or per unit becomes status `PER_UNIT`: it isn't evaluated and the vendor is asked for the total. This works the same way as `FX_MISSING`. It replaces the earlier decision to report the figure as read. | `test_per_bay_headline_is_not_used_as_the_contract_total`, `test-units.mjs` |
| DIM-201 | A price with dot-grouped thousands (`452.000`) reads as thousands, as Python's `_amount` does. | `test-units.mjs` |
| TS-M02 | A scale word that follows the same number in the quote is applied. A scale word on a different figure is ignored. | `test-units.mjs` |
| VAL-TS-M01 | An LD rate per day or per month is normalised to %/week, using Python's factors. | `test-units.mjs` |
| PY-M02 | LD caps and liability limits carry their basis. If one is on the delayed portion and the other on the contract value, the exposure is unknown, with a reason, instead of €0. | `test_exposure.py` (3 tests) |
| SIM-M03 | With no labour rate applied, the sampled rate scales each line's own rate relative to the table's base rate, so the base value is neutral. | `test-simulation.mjs` (2 tests) |
| MONEY-M02 | `formatEur` rounds to cents before splitting off the euros. | `test-units.mjs` |

The rest of the findings below are still open.

## Fix first (original ranking)

| ID | Sev | Where | What goes wrong | Example |
|---|---|---|---|---|
| PY-M01 / TS-M01 | **Critical** | `antova_ingest/pipeline.py:562-575`, `native/pipeline.ts:647-660` | A per-bay price is stored as the contract total. It flows into the true evaluated price, the ranking, the LD and liability exposure, and the export. Python only adds a warning; TS doesn't check at all. | "EUR 42,000 per bay", 12 bays → headline €42,000 instead of €504,000. The bid ranks first and its exposures are 12× too small. **Reproduced (TS).** |
| DIM-201 | **High** | `native/values.ts:19-29` (`parseNumber`) | When a dot is the thousands separator, it's read as a decimal point. This is the normal European format. | `"452.000 €"` → €452. **Reproduced.** Also `"1.250 A"` → 1.25 A. |
| TS-M02 | **High** | `native/pipeline.ts:454-461` | The "million"/"k" scale word is read only from the amount field, never from the quote. | amount `"1.2"`, quote "EUR 1.2 million" → €1.20, PRICED. **Reproduced.** |
| VAL-TS-M01 | **High** | `native/values.ts:90-93, 229` | The TS engine reads an LD rate as plain %. Python normalises it to %/week. | "0.5 % per day": TS 0.5, Python 3.5. A 1 %/week requirement fails when it should pass, and "1 % per month" passes when it should fail. |
| PY-M02 | **High** | `values.py:569` → `findings.py:185` → `exposure.py:72` | The LD cap basis (`delayed_portion` vs `contract`) is parsed and then dropped. Every cap is treated as a % of the whole contract. | A bid offers 10 % of the delayed portion against an MR cap of 10 % of the contract: shortfall €0, when it is really about 8 % of the contract. |
| SIM-M03 | **High** | `domain/simulation.ts:149-193`, root cause `domain/sensitivity.ts:91-100` | The Monte Carlo baseline isn't neutral. The labour base is the first labour line's rate across all vendors. | 10 h @ €80 + 10 h @ €100 → baseline is €200 below the engine's figure, with a different offset per vendor. |

## Fix soon

| ID | Sev | Where | Problem |
|---|---|---|---|
| MONEY-M02 | Medium | `domain/money.ts:50` | `formatEur(2.999)` shows "€2.00": the rounding carry never reaches the euros. Display only. **Reproduced.** |
| DIM-401 | Medium | `domain/simulation.ts:321-332` | The default distributions are centred on the middle of the range, not on the engine's value. Copper and labour samples sit about 7.5 % above the engine. |
| COST-M06 | Medium | `antova_ingest/costs.py:157, 287` | A rate line's `unit` is never checked against its quantity, e.g. `tender.bay_count` with unit "kg". The shipped tables are consistent. |
| PY-M05 | Medium | `antova_engine.py:151-153` | With the labour slider set, low and high equal base for labour lines, so `rank_flip` sees no range. |
| SENS-M05 | Medium | `domain/sensitivity.ts:127-145` | The per-driver deltas don't add up to the total delta, by up to €0.01 per cell. |
| COST-M03 | High, latent | `antova_ingest/costs.py:171-174, 206` | The FX direction is never checked, so a market-style quote (USD per EUR) would invert the conversion. No shipped table has `fx_rates`. |
| PY-M04 / TS-M04 | Low, latent | `antova_engine.py:141, 333`, `native/evaluate.ts:160`, `antova_export.py` headers | Results are always labelled EUR, but the maths runs in `table.currency`. All shipped tables are EUR. |

## Low

- **Rounding:** float cent rounding differs from Decimal half-up (`native/pipeline.ts:463`, `native/handler.ts:474-479`, `locator_eval.py:115`). For `1.005`, TS gives 1.00 and Python gives 1.01.
- **Negative headlines:** `apparent_low_bidder_id` (`antova_engine.py:195`) and `findings.py:124` still accept a negative headline. Phase 1 fixed only `headline_status`.
- **Units in text:** CLI and export show a per-bay headline as a total (`run.py:59`). Clarification templates add a unit word for some fields and not others (`clarify.py:38-42`). The `unpriced_allowance` label is "€" where it should be "€/gap".
- **Lead time:** TS doesn't recognise "business days" or "calendar weeks" (it fails safe). The schedule check isn't passed transit or drawing-approval figures (`findings.py:211`), so those cases always go to manual review.
- **Precision and plumbing:** `_fmt` keeps only 6 significant digits (`values.py:222`). The headline is stored as a float in the DB, with 0.0 meaning "none". `Retry-After` isn't a true ceiling (`antova_ratelimit.py:120`). The `ld_rate` plausible bound should say "per week".

## Refuted (no action)

- The shortfall `Decimal()` input is an `int`, so it's exact.
- `api_cost_usd` has default prices, so the call with no prices is valid.
- Override `adder_eur` is cent-checked and normalised in `antova_review_api.py`.
- `cost_adder = 0.0` in fixtures matches the field's own float type.

## Not covered

- `performance_fee` and `net_savings` in the clawback ledger (`antova_db.py:280-282`): nothing in the code sets them, so their units couldn't be determined.
- I haven't checked whether the Python engine's number parser has the DIM-201 dot-separator behaviour. Python refuses abbreviated amounts, so it is less exposed, but it is still worth a test.

## Suggested fix order

1. **Per-bay headline** (both engines). If the amount is per unit, multiply by `bay_count` and record a formula, or mark the vendor `PER_UNIT_UNRESOLVED` with no price. It must never stay as a total.
2. **TS number parsing.** Handle dot-grouped thousands, read the scale word from the quote, and normalise LD rates to %/week. Add parity cases for each.
3. **Carry the LD cap basis into the exposure maths.** A delayed-portion cap against a contract-value requirement becomes "needs review", not €0.
4. **Make the simulation neutral at its defaults.** Use a labour multiplier on each line's own rate, and centre the distributions on the engine's value.
5. **Smaller fixes:** `formatEur`, unit checks on rate lines, the FX direction field, currency labels.
