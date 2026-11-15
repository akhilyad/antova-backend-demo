# SpecClaw vs Antova: analysis from chat of 2026-11-03

Trigger word for new chats: "fgh" (load this doc, then continue from "Open items").

## What SpecClaw is (per specclaw_yc_2027_master_blueprint.md)
- AI agent for technical bid evaluation on heavy electrical equipment (switchgear, PLC panels, BESS skids).
- Input: buyer spec package (MR + SLD) plus 3-5 vendor bid PDFs.
- Pipeline: cited extraction (page + bbox), deterministic Pint checks against the spec, euro penalty per deviation, "true evaluated price", then vendor email agent for clawback.
- Demo case: Vendor B quotes EUR 418k vs Vendor A 452k; true evaluated price EUR 482.8k.
- Pricing in blueprint: USD 1,500 per tender, USD 4,500 per month workspace, 15% clawback share.

## Code state when reviewed (original root-level files)
- Hardcoded single tender dataset; ingest worker only sleeps through labelled stages.
- No LLM, vision, PDF parsing or email calls in the original code. Tender DB tables empty.
- Real parts: Pint rule checker, leveling formula, tests.
- Note: the project later gained a specclaw_ingest package and ingestion-pipeline task logs from a separate session. Not reviewed in this chat.

## What Antova is
- Older (Aug 2025) Scope 3 shipment emissions SaaS: FastAPI, Supabase, Stripe, fixed emission factors, tiers USD 49 to 499 per month.
- Different buyer (sustainability/logistics), different data, crowded space.
- Name collision: antova_landing.html is titled as a bid-evaluation (SpecClaw) page.

## Conclusions
- Do not merge Antova into SpecClaw. Drop Antova.
- Stay on SpecClaw. Optional later: carbon as one more column in the evaluated price (EPD data, SF6 flag; verify EU dates).
- Take from the parallel Gemini chat: the overlooked problem is that the package engineer and commercial buyer never compare notes; document precedence (cover letter vs datasheet) is already in the blueprint's hierarchy rule; human approves every flag in v1; start in DACH solar/wind EPCs and automation integrators.
- Gemini cited files (SpecClear_Pitch_Deck_Framework.md, baseline-landing-page-prompt.md) and an n=1 offshore test that do not exist in the folder. Unverified.
- Weak spots in blueprint: USD 1.5B TAM (12,500 x USD 120k ACV) is loose; 99.7% margin ignores human review; 1.5-month CAC payback unrealistic; clawback share invites disputes (start with flat fee).
- Use public or anonymized tenders for testing, not employer-confidential files.

## Open items
- Run real extraction on 2-3 anonymized tenders; the SLD extraction is the make-or-break risk.
- Decide pricing: flat per-tender or per-seat first, clawback share later.
