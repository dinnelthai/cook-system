# M25–M49 — offline workflow integration, first implementation batch

This batch extends the existing Project business-review API and terminal rather than creating a second project, accounting, market or risk engine.

- M25/M27/M28/M29: static Project configuration audit with exact BigInt cap comparisons; missing values, zero, contradictions and warnings remain distinct. Declared wallet limits are not reservations, funding, balance, ownership or permission.
- M25/M37/M41/M42/M43/M45: reuse existing lifecycle, receipt, treasury, market and close reviews; show coverage separately per linked historical interval. Never infer complete history or add across overlapping intervals.
- M48: render configuration and per-interval coverage on existing terminal, available in existing JSON export.
- M49: automated regression tests for configuration, unknown values, exact arithmetic, interval separation and non-execution.

Not complete: M26/M30–M36/M38–M40/M44/M46–M47 and remaining portions of M25–M49. Existing canonical math and synthetic stress modules are preserved; this batch does not implement new participant behavior policies, trading or market intervention. No data is connected, no mainnet signing or automatic lifecycle changes. M50–M52 remain deferred. Static review and CI are not actual browser, Localnet or production acceptance.

Run npm test and npm run accept:all. Review actual CI status for this commit; do not infer it from a prior run.


## Second batch — M30–M36 evidence integration

The project review now consumes canonical treasury/market archive outputs at exact link and digest scope; it preserves closed-interval inventory amounts as base-unit strings, distinguishes missing and zero, validates financial audit count summaries and participant record counts, and withholds numbers when evidence conflicts. It exposes canonical participant model limitations, not calibrated behavior or trading policy. No cross-interval totals, no live depth or independent demand estimates. The existing terminal displays the scoped results; findings flow to the overall review status. Five regression tests cover exact values, malformed amounts, count contradictions, empty records and foreign-project isolation.

M30–M36 remain partial: historical output integration is not live inventory, behavioral calibration, empirical market demand, or actual market-quality operational acceptance. M50–M52 remain deferred. M26 and remaining M37–M49 work are still open. No real data, trading or automated intervention added.


## Third batch — M37–M45 continuity and cross-review consistency

Compare canonical treasury and close outputs for the same report link and digest: cash difference, token inventory, creator receivable, other assets and liabilities. Compare creator cash receipts and receivable balances with the existing subledger, not accrual or pool fee buckets. Missing values remain unknown. Historical milestone declarations with conflicting signatures/slots or backwards slots surface review findings; no stage transition or inferred financial continuity. Findings propagate to the existing business status and cross-module risk status, with separately labeled counts. Terminal displays scoped checks. Five regression tests added.

M37/M42/M43/M44/M45 partially advanced. M38–M41 remain open beyond previously delivered evidence review; there is no LP health calculation, new strategy or execution, migration financial parity, real settlement or live data. M46–M49 and remaining earlier tasks are open. M50–M52 remain deferred. Verify CI separately.


## Fourth batch — M26/M46/M47 governance and operating review

Add issuance readiness checklist (declared profile and configuration, independent demand, disclosures, rights, legal review and support plan unassessed). Add historical accounting-component projection from canonical treasury archives, without causal inference or totals. Extend GET /api/projects with directory registration review computed from the same returned project list; detect duplicate mint and wallet registrations within known network/genesis scope, not ownership or coordinated activity. Existing project list client remains compatible. Terminal shows these three views. Five new pure regression tests and extended existing HTTP integration assertion.

No actual launch selection or recommendation, independent demand measurement, causal attribution, or portfolio valuation. M26/M46/M47 are partial. M33/M38–M41 and other offline business gaps remain open; M50–M52 deferred. CI and actual browser acceptance are separate.
