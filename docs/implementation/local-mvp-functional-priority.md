# Local MVP functional priority — 2026-11-25

The operator prioritizes functionality and mathematical correctness in an existing private local test environment. Retain existing basic safety boundaries; defer enterprise custody, distributed recovery and production infrastructure work.

Prioritize read-only data and report integration, independently checkable historical replay and accounting, exact units and fee handling, raw OHLCV and pool identity, browser consistency, and isolated synthetic model regression. Do not treat synthetic scenarios as market forecasts or optimize deceptive market behavior. Do not add live execution features or change execution permissions in this workstream.

First functional correction: candle aggregation separates curve accounts and explicitly identified pools in the same token/time interval. Unknown pool identity is kept separate from identified pools. Existing unscoped historical candle exports may require recomputation. This changes historical data presentation only; no order creation or submission.

Acceptance: compare immutable receipts with replay output, reconcile independently retained balances and fees, verify charts against actual observed trades, and run the existing unified acceptance suite. Real Localnet and browser tests remain operator-side tasks.

## Deferred work

See [post-local MVP engineering backlog](deferred-engineering-backlog.md). Security and production infrastructure expansion are deferred; existing local protections and correctness requirements remain unchanged. Current work is functional and mathematical acceptance first.

## Historical transaction arithmetic correction

The Pump/PumpSwap receipt balance extraction no longer treats unavailable balance arrays, unsafe JS numbers, or absent network fees as zero. Token-account addresses are not substituted for missing owners. Owner aggregates are withheld if attribution or token identity is incomplete; account counts count distinct accounts rather than pre/post rows. A recorded absence in an available token array is still a provisional zero for the observed delta, not proof of creation or closure. Historical consumers must inspect `balance_evidence_status` and reconcile against retained receipts. This is a read-only accounting correction, not an execution or strategy change.

## F03 — recorded curve transition diagnostics

Historical curve replay preserves recorded post-state and separately reports `recorded_reserve_audit`: token reserve movements against recorded token quantities, completion flag consistency, and real reserve against recorded supply. The collector exposes these diagnostics without changing legacy pagination/replay coverage labels; those labels are not arithmetic acceptance. Null required post-state fields are rejected rather than silently copied from the preceding state, and a null snapshot field is UNKNOWN rather than PASS. Distinct explicitly identified curve accounts cannot share a replay. Quote/fee parity remains NOT_CHECKED; no inferred quote, sizing, price path or execution strategy is produced. Some legacy synthetic fixtures contain intentionally or accidentally inconsistent reserve movements; matching a closing snapshot alone does not resolve those discrepancies.

## F04 — historical PumpSwap snapshot and receipt consistency

The replay checks conflicting repeated vault-delta annotations in one recorded transaction and reports FAIL rather than silently applying the first. Missing delta fields remain UNKNOWN. Current-account reconciliation detects incompatible reported slots across the Pool and both vaults; a mixed-slot snapshot is not comparable and has no combined effective reserve output. Missing quote amount or virtual reserve does not become zero. Older snapshots lacking context slots retain legacy value-comparison status but expose `snapshot_slot_status=UNKNOWN`; PASS does not certify atomic observation. This is retrospective evidence validation only, not new quote or trading logic. Actual fee attribution and independently captured local snapshots remain open.

## F05 — historical inventory and cost journal

The existing historical cost audit now diagnoses duplicate source/journal event IDs, ambiguous ordering, invalid side, zero-quantity trade rows and intermediate integer range violations even when supplied endpoints agree. Existing conservation checks remain. Six additional regressions cover these cases; independently retained cost records and ordered external adjustments remain required for actual Localnet accounting acceptance.

## F06 — historical NAV evidence arithmetic

Compare available endpoint balance-sheet components independently. Missing or malformed valuation data must not hide a known cash or inventory contradiction or be silently converted into zero. Only complete supplied components are used for the NAV identity. Four integration regressions cover partial/malformed endpoint evidence. Independent valuation and real historical cash-flow evidence remain operator-side acceptance requirements.

## F07 — synthetic regression evidence

The existing offline participant simulator now emits an aggregate opening/closing asset conservation audit. The audit checks exact integer differences and rejects duplicate agent identities or malformed balances; it neither changes participant behavior nor generates trades. The different-seed regression compares event content rather than seed metadata. The defensive regression explicitly distinguishes its four fixed templates from repeated seed-labelled cases; repetitions do not represent independent market paths. Calibration against real markets is not claimed.

## F08 — historical risk reporting consistency

Historical risk summaries now include independent closing-account-set and trade-evidence review findings. The cash crosscheck's nested ledger difference and arithmetic identity are checked with exact integers even when the top-level summary claims consistency. Missing differences remain unknown. Four regressions cover these cases. Current liquidity, independent ownership, asset valuation and live risk are not inferred from closed-interval accounting. No order sizing, execution policy or forward liquidity model is changed.

## F09 — historical dashboard integration

The review dashboard renders the same backend risk alerts and check evidence as the terminal, including closing account set and trade evidence. A distinct input-record export supports later reimport; the existing derived report export remains separate. Historical cash/NAV labels no longer imply a current spendable balance. The dashboard labels its data as offline; diagnostic retention text matches session storage behavior. Tests cover the presentation contract, not a real browser interaction. No transaction controls or live strategy logic are added.

## F10 — second-round functional acceptance handoff

See [Codex second-round functional acceptance](CODEX-FUNCTIONAL-ACCEPTANCE-R2.md). F01–F09 code changes are in master; baseline Node 22/24 CI has 390 tests passing each. F10 is an acceptance plan, not a completed Localnet/browser/financial acceptance. Production infrastructure remains deferred. State-changing functionality and execution are not part of this read-only acceptance pass.
