# Cook System — engineering handoff and Codex acceptance baseline

**Repository:** `dinnelthai/cook-system`  
**Branch:** `master`  
**Current master:** `c758975c4db05b66e38a632207963ae688853377`  
**CI run:** [45534513693](https://github.com/dinnelthai/cook-system/actions/runs/45534513693)  
**CI result:** Node 22 and Node 24 both passed; each run completed 334 tests, 0 failed, 0 skipped, 12 automated acceptance checks passed and 0 failed.

## Delivered code in this handoff

| Area | Delivered |
|---|---|
| Local execution isolation | Faucet, wallet transfer and PumpSwap trading each require their own explicit opt-in; all default off |
| Localnet launcher | `start-localnet.mjs` no longer silently enables the faucet; it only forwards the separately opted-in capabilities to loopback |
| Wallet transfer | Polls signature status and reports `CONFIRMED`, `FAILED` or `UNKNOWN`; ambiguous submissions are never automatically retried |
| Transfer UI | Displays the actual result and warns not to repeat an unknown transfer before checking signature and balances |
| Wallet selector | Fixed the header selector's reference to an unrelated, undefined wallet-management query function; added a regression test |
| HTTP boundary | Loopback-only server, origin/host checks, byte-accurate request cap, malformed UTF-8 rejection, bounded timeouts and connection limits |
| File boundary | Shared bounded regular-file reader for reports, alert journal and emergency halt state; leaf symlinks rejected |
| Paper quote gate | Missing/invalid volatility blocks quote planning; skew/drawdown limits and numeric input lengths are bounded |
| Repository hygiene | Current tracked-tree high-confidence secret marker scan; findings report path/line only, never the matched value |
| Unified acceptance | `npm run accept:all` runs runtime/dependency checks, syntax, full tests, schema registry, repository hygiene and held-out synthetic regression; writes JSON under ignored `.cook-system/acceptance/` |
| CI | Node 22 + 24 matrix, immutable action SHA pins, read-only checkout token, machine-readable reports retained for 14 days |

## Reproduce the automated checks

> Historical handoff baseline above is retained for audit. The current default branch is `main`; use its current CI report rather than assuming the historical test count still applies.

Use Node.js 22 or 24:

```bash
git checkout main
git pull --ff-only origin main
node --version
npm ci
npm run accept:all
```

The command creates a report similar to:

```text
.cook-system/acceptance/unified-acceptance-<timestamp>.json
```

Expected automated result:

- 334 tests passed, 0 failed, 0 skipped
- JSON Schema registry validation passed
- Held-out synthetic defensive regression passed
- All local money-moving capabilities default disabled
- Current tracked-tree high-confidence secret scan has no findings

The held-out metrics are deterministic synthetic contract checks, not an estimate of precision/recall on real markets.

## Codex operator acceptance — still required

Read [CODEX-ACCEPTANCE-PLAYBOOK.md](CODEX-ACCEPTANCE-PLAYBOOK.md) and [CODEX-ACCEPTANCE.md](CODEX-ACCEPTANCE.md). Codex's baseline pass is review-only: do not auto-fix before returning the report.

The following eight operator gates remain open or unverified:

1. Read-only preflight against the actual existing private Localnet, with genesis independently pinned and a closed evidence interval.
2. Real browser acceptance of every terminal page, including console/network errors and narrow layouts.
3. Local wallet keyfile permissions and proof that API responses never expose secret material.
4. Actual localnet transfer confirmation test, only after separate operator approval and with disposable wallets. The automated runner does not submit transactions.
5. Independent reconciliation of confirmed receipts, fees, wallet balances, inventory, cost basis and NAV over a closed interval.
6. Real archived Pump/PumpSwap/Raydium receipt fixtures and decoder parity.
7. Operator-controlled soak/recovery/performance measurements.
8. Credential rotation/history review. The hygiene scanner inspects the current tracked tree only; it does not inspect Git history, ignored files or external secret stores.

Optional read-only Localnet preflight uses a private evidence file outside Git:

```bash
COOK_ACCEPT_RPC=http://127.0.0.1:8899 \
COOK_ACCEPT_GENESIS='<independently-confirmed-private-genesis>' \
COOK_ACCEPT_EVIDENCE='<private-evidence-json-path>' \
npm run accept:all
```

PowerShell users can set the same three environment variables before running `npm run accept:all`. Never put credential-bearing URLs, keys or seed phrases in the evidence file or acceptance report.

## Local execution policy

All flags default off:

- `COOK_LOCAL_FAUCET=1` — local validator airdrop only.
- `COOK_LOCAL_TRANSFER=1` — local validator wallet transfers only.
- `COOK_LOCAL_TRADING=1` — local PumpSwap adapter only.

Only set a flag when the operator deliberately authorizes that exact localnet action and the independently confirmed private genesis pin is present. Never point these adapters at public clusters or production funds.

The runner does not start, reset or wipe a validator; request an airdrop; sign or submit a transaction; or place a live order. Unknown transaction status must be reconciled on-chain before any retry.

## Acceptance boundary

This baseline establishes that the repository's deterministic code checks pass on Node 22 and Node 24. It does **not** establish real Localnet parity, source authenticity, complete historical coverage, real-world market-quality accuracy, profitability, production throughput, custody security or production readiness.

Keep the next work cycle evidence-led: Codex reports concrete failures and risks with severity, file/line, reproduction and suggested regression test; implementation changes follow after the owner returns that report.
