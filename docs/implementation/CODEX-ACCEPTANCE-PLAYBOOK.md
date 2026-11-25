# Codex unified acceptance playbook

**Purpose:** run one consistent code, integration, security and operator acceptance pass on the machine where the existing Solana Localnet / Pump Lab environment is installed. Codex is the independent reviewer in this pass. Do not make code changes while gathering the baseline report.

## Non-negotiable boundaries

- Do not reset, recreate, redeploy or wipe the existing validator, ledger, wallets or Pump Lab environment.
- Do not use mainnet funds or public RPCs for any wallet or transaction test.
- Do not request an airdrop, sign, transfer, buy, sell or submit any transaction during this acceptance pass.
- Do not turn on `COOK_LOCAL_FAUCET`, `COOK_LOCAL_TRANSFER` or `COOK_LOCAL_TRADING` merely to make a test pass. All three must remain off unless the operator separately approves a specific disposable-localnet transaction test.
- Never print, paste into the report, or commit private keys, seed phrases, read keys, API tokens, full credential-bearing URLs or wallet keyfile contents.
- A synthetic fixture passing is not chain parity, profitability, market-quality accuracy or production readiness.
- Review for deceptive market activity, wash/self-trading, fake volume, concealment of common control, or misleading K-line generation. These are not implementation targets. Keep the system focused on transparent local testing, market-quality measurement, inventory/risk controls and defensive detection.

## Phase 1 — repository and deterministic acceptance

From the repository root:

```bash
git status --short
git rev-parse HEAD
node --version
npm ci
npm run accept:all
```

Requirements:
- Node.js 22 or newer.
- Keep the exact commit SHA in the report.
- The command writes a JSON report under `.cook-system/acceptance/`; that directory is ignored by Git.
- If it fails, preserve the full failing command, exit code and relevant stack trace. Do not fix anything yet.
- Separately run `npm test` and `npm run validate:schemas` if the runner reports failure, to isolate the cause.
- Run `npm audit --omit=dev` only if network access is permitted; record it as an advisory dependency check, not as a substitute for code review.

## Phase 2 — inspect the existing local environment (read-only)

Do not start or reset anything. Identify what is already running and report:
- OS, shell, WSL version (if applicable), Node version and npm version;
- whether the existing validator RPC is listening on loopback and its current health;
- whether Pump Lab API / WebSocket is reachable on the existing private LAN endpoint;
- the validator genesis hash, obtained independently from the operator's known local setup;
- current slot, first available block and minimum ledger slot;
- whether the validator is localnet, not devnet/mainnet;
- whether the Pump Lab token and pool are the expected test mint/pool.

Never include credentials or a full private URL in the report. For genesis, report a short prefix/suffix only if the operator permits it. Do not infer the expected genesis pin from the same endpoint being checked.

## Phase 3 — optional read-only Localnet preflight

Only if the operator already has a known closed test interval and an independently confirmed private genesis pin, prepare a private evidence JSON file outside Git. Shape:

```json
{
  "range": { "start_slot": 100, "end_slot": 120 },
  "receiptSamples": [
    { "signature": "<confirmed-signature>", "slot": 110 }
  ],
  "reportInput": null
}
```

Use actual slots and signatures from the operator's local test environment. Do not use the synthetic fixture as a receipt. Then set:

```bash
COOK_ACCEPT_RPC=http://127.0.0.1:8899
COOK_ACCEPT_GENESIS=<independently-confirmed-private-genesis>
COOK_ACCEPT_EVIDENCE=<private-evidence-json-path>
npm run accept:all
```

PowerShell equivalent:

```powershell
$env:COOK_ACCEPT_RPC = "http://127.0.0.1:8899"
$env:COOK_ACCEPT_GENESIS = "<independently-confirmed-private-genesis>"
$env:COOK_ACCEPT_EVIDENCE = "C:\\private\\cook-local-evidence.json"
npm run accept:all
```

The preflight is read-only. It checks the genesis pin, health/version, finalized slot bounds, retention bounds and up to 20 transaction receipt identities. Missing samples, unavailable history or incomplete report-to-receipt binding must remain PARTIAL/UNKNOWN. A mismatch is REVIEW_REQUIRED. Do not change the code or evidence to force PASS.

## Phase 4 — offline terminal browser acceptance

With execution flags left off, run the offline terminal using the synthetic fixture:

Linux / macOS / WSL:

```bash
PORT=4173 COOK_TERMINAL_REPORT=fixtures/synthetic/inner-market-mvp.json \
COOK_LOCAL_FAUCET=0 COOK_LOCAL_TRANSFER=0 COOK_LOCAL_TRADING=0 \
node scripts/serve-offline-mvp.mjs
```

PowerShell:

```powershell
$env:PORT = "4173"
$env:COOK_TERMINAL_REPORT = "fixtures/synthetic/inner-market-mvp.json"
$env:COOK_LOCAL_FAUCET = "0"
$env:COOK_LOCAL_TRANSFER = "0"
$env:COOK_LOCAL_TRADING = "0"
node scripts/serve-offline-mvp.mjs
```

Open `http://127.0.0.1:4173` and inspect:
1. Dashboard/report labels clearly identify SYNTHETIC data and unknown/unattested fields.
2. Contradictory accounting or candle evidence suppresses derived outputs.
3. Historical review mode does not expose transaction actions.
4. Wallet management creates/lists test keyfiles only; API responses contain public addresses, never secret bytes.
5. Faucet, transfer and trading return disabled responses while flags are off.
6. Market page shows unknown/unavailable status instead of fabricating candles.
7. Browser console has no uncaught errors; keyboard focus, narrow layout and overflow are usable.
8. Network panel shows only loopback/private test endpoints; no external telemetry or unexpected requests.
9. Cross-origin requests are rejected and report/static paths cannot escape the allowed root.

Record screenshots or short screen recordings for each failed view. Do not create or fund a wallet just to inspect the UI.

## Phase 5 — independent code review

Inspect the complete diff and these high-risk paths:
- `src/inner-market/local-wallet-store.mjs`: key generation, file permissions, symlink/race handling, signer loading, key material exposure.
- `src/inner-market/local-faucet.mjs`, `local-transfer.mjs`, `local-trading.mjs`: network pinning, bounded requests, confirmation ambiguity, no automatic retries, aggregate limits, disabled-by-default behavior.
- `scripts/start-localnet.mjs`: private host validation, port-forward lifecycle, shutdown and feature-flag forwarding.
- `scripts/serve-offline-mvp.mjs`: loopback binding, origin/host checks, request limits, static path containment, report-file handling.
- `src/risk/quote-risk-gate.mjs`, `portfolio-risk-engine.mjs`: fail-closed behavior, exact arithmetic, stale data, drawdown and unknown evidence.
- `src/core/market-quality-engine.mjs`: facts vs inference, coverage/attribution limitations, no false manipulation claims.
- Pump/Raydium decoders and collectors: IDL revision, account ownership, fee accounting, pagination, slot ordering, transaction/meta reconciliation, migration boundaries.

Report every issue with severity P0/P1/P2/P3, exact file and line, reproduction, impact and proposed acceptance test. Distinguish confirmed defects from hypotheses and missing evidence. Do not silently modify code.

## Phase 6 — performance and recovery (non-destructive)

Use the existing environment only. Do not generate transactions. Measure:
- process memory at idle and after repeated report/index reads;
- report load and browser render time for small, medium and largest available private fixtures;
- archive/index rebuild time and peak memory;
- alert journal read/audit time as it grows;
- API behavior under malformed, oversized and slow requests;
- server shutdown/restart and recovery after a killed process;
- behavior with missing/corrupt report, missing RPC, stale data and a changed genesis.

Do not delete locks or archives as a recovery shortcut. If a lock remains, verify no writer process is active before any operator action.

## Required deliverables from Codex

Create `CODEX-ACCEPTANCE-REPORT.md` in the ignored `.cook-system/acceptance/` directory and preserve the runner JSON report. Include:

1. Commit SHA, OS/WSL, Node/npm versions and exact commands.
2. Automated tests: total/pass/fail/skipped, schema validation, syntax and hygiene results.
3. Localnet: network identity, genesis-pin match, slot/retention bounds, receipt sample counts and contradictions.
4. Browser: each page pass/fail, screenshots, console/network errors and responsive findings.
5. Wallet/API: keyfile permission findings, secret-exposure findings, feature-flag behavior and confirmation semantics. No transaction is to be submitted.
6. Performance: fixture sizes, durations, memory and resource observations, methodology.
7. P0-P3 findings with file/line, evidence, reproduction and proposed test.
8. A prioritized recommendation: release blocker, fix before next local test, or deferred.
9. Explicitly list checks that could not be run and why.

End with one of:
- `CODE_ACCEPTED_OPERATOR_GATES_PENDING`
- `LOCALNET_READ_ACCEPTED_BUT_BROWSER_OR_FINANCIAL_GATES_PENDING`
- `REVIEW_REQUIRED`

Do not claim production readiness. Return the report and JSON artifact to the project owner. Wait for the owner to pass findings back for implementation; this baseline pass is review-only.

Additional browser check: change the active-wallet selector in the top header and the wallet-management page independently. Each selector must update the stored active address without throwing a browser-console error or mutating another form's destination field.

CI also runs the unified code acceptance matrix on Node.js 22 and 24. Workflow actions are pinned to immutable commit SHAs; checkout credentials are not persisted and setup-node's automatic package-manager cache is disabled.

The npm lockfile has been normalized with npm 11 so clean installs work with both Node 22/npm 10 and Node 24/npm 11. The CI matrix now installs the committed lockfile directly on both Node versions; it does not rewrite or push repository files during a test run.
