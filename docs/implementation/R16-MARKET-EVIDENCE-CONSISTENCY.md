# R16 — closed market evidence consistency

Baseline e47507fb050a4c0becce495da487379c95755c01. Existing candle parity and market-quality engines are unchanged. Runtime projection now validates recognized descriptive statuses, count domains, explicit candle status, participant record count and incompatible source/execution flags. Missing legacy optional fields remain unverified. Unknown producer or quality status does not display counts. Conflicting count declarations for one immutable report interval block its records; distinct intervals remain independent.

Compute market evidence before the asset projection. Reuse the existing scoped conflict gate for financial and market review and hide derived figures on the implicated interval; financial conflicts also mask same-interval market counts. Raw archive evidence remains retained. No new market model, participant ranking, prediction, parameter adjustment, live data or execution.

Regression cases exercise unknown status, zero/nonzero inconsistency, candle mismatch, explicit incompatible flag, duplicate reviews with disagreeing counts, unrelated interval isolation and financial-to-market conflict propagation. New CI required. Independent market history, provenance and completeness remain unverified.
