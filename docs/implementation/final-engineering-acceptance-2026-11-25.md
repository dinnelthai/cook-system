# Cook System — post-merge engineering acceptance

**Repository:** `dinnelthai/cook-system`  
**Branch:** `master`  
**Reviewed commit:** `9522ffdd9d260dad7a0315bca12ca335a06750ce`  
**Latest CI:** [Run 45530375980](https://github.com/dinnelthai/cook-system/actions/runs/45530375980)  
**CI result:** 326 tests passed, 0 failed, 0 skipped; JSON Schema registry validation and held-out defensive regression passed.

## Delivered implementation

| Workstream | Delivered |
|---|---|
| Historical event integrity | bounded event archive/index, replay checks and integrity audit |
| Evidence and provenance | source/coverage checks, explicit unknown states, historical report boundaries |
| Financial audit | cash, inventory, cost basis, receivables, liabilities, NAV and closing account-set cross-checks |
| Reliability | hash-chained alert journal, diagnostic snapshot restore/archive, file-backed paper halt state |
| Market quality | historical descriptive metrics, attribution uncertainty, scenario isolation, synthetic conservation regression |
| Local validator preflight | loopback-only read-only RPC checks, genesis pin, retention bounds and receipt samples |
| Offline terminal | local-only HTTP server, report bridge, bounded regular-file reads, path and request controls |
| Paper risk gate | stale-data, halt, drawdown, inventory, volatility and numeric-input fail-closed checks |
| Capability isolation | faucet, transfer and trading each have separate explicit opt-in flags; all default off |

## Reproduction on master

```bash
git checkout master
git pull --ff-only origin master
npm ci
npm test
npm run validate:schemas
mkdir -p .cook-system/acceptance
npm run evaluate:defensive -- .cook-system/acceptance/defensive-evaluation.json 901,902,903
```

The repository ignores `.cook-system/`. Keep all wallet files, private evidence, diagnostic exports and RPC credentials outside Git.

## Localnet read-only acceptance

Use an existing operator-managed loopback validator. Do not reset the ledger or create transactions for this check. Obtain the expected genesis hash independently from the operator's known local environment; do not trust a value merely because the endpoint reports it.

Prepare a private JSON file with a closed slot interval, up to 20 known transaction signature/slot pairs, and optionally an archived historical report input. Then run:

```bash
COOK_ACCEPT_RPC=http://127.0.0.1:8899 \
COOK_ACCEPT_GENESIS='<independently-confirmed-local-genesis>' \
node scripts/accept-local-read.mjs ./private-evidence.json
```

A `PARTIAL` result is expected when history is outside retention, receipt samples are absent/unavailable, or report-to-receipt interval binding is incomplete. The tool deliberately does not certify source authenticity, complete history, ownership or financial parity.

## Local execution capability flags

All are independent and default disabled:

- `COOK_LOCAL_FAUCET=1`: local validator airdrop only.
- `COOK_LOCAL_TRANSFER=1`: local validator wallet transfers only.
- `COOK_LOCAL_TRADING=1`: local PumpSwap adapter only.

Each additionally requires the private non-public genesis pin and loopback RPC checks. Do not enable these against public clusters or production funds. The local server is not a multi-user authenticated custody service.

## Outstanding acceptance — not represented as passed

1. Run the read-only preflight against the operator's actual Localnet and inspect its returned range/receipt statuses.
2. Reconcile independently exported wallet balances, transaction fees, inventory and NAV against the archived report for a closed interval.
3. Open the offline terminal in the operator's browser and verify the evidence status, financial contradiction handling, log export and all disabled execution controls.
4. Run an operator-controlled soak/load test and inspect memory, file growth, recovery after process termination and stale lock handling.
5. Perform a human security review of local wallet custody, host permissions, private report contents, RPC exposure and the exact opt-in flags before any local transaction testing.

## Acceptance boundary

CI validates deterministic repository tests and synthetic defensive scenarios. It does **not** prove actual Localnet connectivity, independent source attestation, real wallet ownership, historical completeness, live market quality, production performance, custody security or production readiness. The market-quality engine is descriptive/research-oriented; paper quote planning cannot sign or submit orders. The trading adapter is a separate local-only opt-in and must not be treated as production-approved.

No production deployment or live-market manipulation capability is certified by this acceptance record.
