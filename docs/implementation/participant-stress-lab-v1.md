# Market Participants Lab — MVP

Extends the research catalogue in multi-agent-inner-market-game-model-v1.md with an offline defensive regression page. The six roles are independent trader, retail, fast entrant, arbitrage/searcher, sandwich-related MEV and early holder. Role labels describe synthetic hypotheses, not real wallets.

## Implemented
- A catalogue of distinct economic traits, relevant observables and confounders.
- Six fixed synthetic audit cases. Each case perturbs a copy of the existing closed-interval synthetic fixture; archived data is rejected.
- Cases check complete baseline, incomplete participation records, unknown acquisition basis, uncertain valuation reference, uncertain execution reconciliation and a fixed abstract NAV impairment.
- Compare expected audit outcome against the actual MVP report and export JSON.
- UI: page 06, Market Participants Lab. It never uses imported historical data as the experiment base.

## Interpretation
The cases are accounting and risk-monitoring proxies. They do not generate agent orders, reproduce participant timing, simulate a sandwich attack, infer real wallet roles, or establish causal attribution. The NAV impairment is an abstract valuation input, not an executable curve quote. A single bonding curve does not prove a cross-venue arbitrage opportunity. A passing regression is not empirical evidence of a participant behavior model.

## Run
`node --test test/participant-stress-lab.test.mjs`
`node scripts/serve-offline-mvp.mjs`

Next-stage validation: compare risk-monitoring outputs against independently collected, anonymized closed-interval local test records; report uncertainty and false positives. No execution or issuer trading decision optimizer is included.

## V0.1 runnable randomized experiment

Run `node scripts/run-participant-experiment.mjs 42 100` (seed, trials per role). This evaluates 600 synthetic risk-audit samples. The UI page 06 also accepts the seed and trials per role, and exports results. The seeded generator chooses baseline or a fixed role-associated QA perturbation. Report totals, audit mismatches, issue counts and observed drawdown on valid samples are included. Sampling weights are invented QA coverage values, not calibrated participant behavior or attack probabilities. There is no transaction generation, market replay policy, attacker strategy, or chain connection. Identical input and seed yield identical output. Exit 0 means expected audit results matched, 2 means mismatch, 1 means invalid input. Empirical behavior modeling and localnet source parity are not established.
