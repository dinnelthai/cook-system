# M25–M49 — offline workflow integration, first implementation batch

This batch extends the existing Project business-review API and terminal rather than creating a second project, accounting, market or risk engine.

- M25/M27/M28/M29: static Project configuration audit with exact BigInt cap comparisons; missing values, zero, contradictions and warnings remain distinct. Declared wallet limits are not reservations, funding, balance, ownership or permission.
- M25/M37/M41/M42/M43/M45: reuse existing lifecycle, receipt, treasury, market and close reviews; show coverage separately per linked historical interval. Never infer complete history or add across overlapping intervals.
- M48: render configuration and per-interval coverage on existing terminal, available in existing JSON export.
- M49: automated regression tests for configuration, unknown values, exact arithmetic, interval separation and non-execution.

Not complete: M26/M30–M36/M38–M40/M44/M46–M47 and remaining portions of M25–M49. Existing canonical math and synthetic stress modules are preserved; this batch does not implement new participant behavior policies, trading or market intervention. No data is connected, no mainnet signing or automatic lifecycle changes. M50–M52 remain deferred. Static review and CI are not actual browser, Localnet or production acceptance.

Run npm test and npm run accept:all. Review actual CI status for this commit; do not infer it from a prior run.
