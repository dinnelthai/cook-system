# Localnet read-only acceptance preflight

Run against the existing operator-managed loopback RPC or its existing approved loopback forward. No deployment, reset, faucet, signing, or submission is performed.

Create a private JSON evidence file containing range.start_slot and range.end_slot, optional receiptSamples (up to 20 objects with signature and slot), and optional reportInput (raw archived historical input). Use only a known closed historical interval. Obtain the expected genesis separately from the operator; do not copy a value observed from the endpoint into the pin merely to pass.

```bash
COOK_ACCEPT_RPC=http://127.0.0.1:8899 \
COOK_ACCEPT_GENESIS='<operator-confirmed-local-genesis>' \
node scripts/accept-local-read.mjs ./private-evidence.json
```

The script rejects public genesis identifiers, redirects, remote URLs and mismatched pins before further history reads. It checks reported health, version, finalized head, first available block, minimum ledger slot and sampled receipt identity. An interval below retained ledger bounds stays PARTIAL. Missing receipts are not treated as successful checks. A synthetic report cannot serve as observed local-validator evidence. An internally consistent historical report remains PARTIAL because its interval and financial inputs have not been independently bound to the sampled receipts.

Exit codes: 1 invalid input; 2 partial; 3 review required; 0 reserved for all checks passing (current report binding deliberately remains partial). No independently authenticated source, complete history, financial parity, production readiness or execution is asserted.

CI uses mock RPC only. Actual validator connectivity, historical account and fee reconciliation, browser acceptance and load testing remain operator-environment tasks.

## Independent sample comparison (next acceptance round)

Each receiptSamples row may now contain an optional expected object: fee_lamports (canonical unsigned decimal string), outcome (SUCCESS or FAILED), and accounts (1–32 public addresses, each with pre_lamports and post_lamports as decimal strings). Derive these expectations from separately retained evidence, not from the very RPC response under test. The preflight checks the returned fee, execution outcome and exact native balance observations at mapped static/loaded account indices. Missing/unsafe numbers remain PARTIAL; contradictions require review. Reported sample indexes avoid printing addresses or raw receipt bodies. The reader also checks JSON-RPC version and response ID; legacy collector behavior is unchanged. This is not token balance, ownership, cost-basis or NAV reconciliation and cannot establish full financial parity. No transactions are submitted.

## Token receipt sample evidence

An optional `expected.token_accounts` array adds 1–32 declared token-account observations: `address`, `mint`, `owner`, `decimals`, `pre_amount`, `post_amount`. Amounts must be canonical u64 decimal strings; `null` explicitly means a missing balance record on that side, not zero. Compare against separately retained historical evidence. JSON-encoded static and loaded writable/readonly indices are checked. Missing arrays, missing owner, or a missing expected non-null balance record stay UNKNOWN; duplicate indices, malformed records and known contradictory values require review. The report emits only indexed check statuses, not account identifiers or amounts. `receipt_tokens=PASS` means declared sample matches only, never complete historical inventory, attribution, cost basis or NAV verification. No changes to trading or transaction submission.

## M50 — report interval and retained sample association

The canonical archived financial report uses network localnet, while normalized events use local_sim. The preflight accepts the canonical label and treats the legacy report alias as partial. For a ready report, opening/closing slot cutoffs must exactly match the requested range; a sampled retained receipt must match the same signature, finalized declaration, genesis and slot in (opening, closing]. Compare separately declared sample expectations with both the retained receipt and the RPC observation using the existing receipt auditor. Output contains only counts and status codes; no address, signature or raw receipt export. Missing retained samples or expectations stay partial, contradictions require review. Even all matching samples cannot attest full financial parity, independent source truth, completeness or production readiness. This change is tested against mock/fixture inputs; no actual validator has been contacted in this implementation turn. Use an existing approved loopback endpoint and separately confirmed genesis pin on the operator machine. Do not reset or redeploy the validator.
