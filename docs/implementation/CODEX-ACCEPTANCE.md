# Codex unified acceptance — handoff entrypoint

Read the complete playbook at [CODEX-ACCEPTANCE-PLAYBOOK.md](CODEX-ACCEPTANCE-PLAYBOOK.md). The single automated command is:

```bash
npm ci
npm run accept:all
```

The runner performs deterministic code checks and writes a JSON report under `.cook-system/acceptance/`. It never starts/resets a validator, requests funds, signs/submits transactions or sends live orders. The report deliberately keeps Localnet, browser, wallet-custody, financial-parity and performance gates separate from unit/synthetic test results.

Codex should perform the operator-side read-only and browser checks from the playbook, inspect the high-risk source files, then return `CODEX-ACCEPTANCE-REPORT.md` plus the runner JSON. Do not auto-fix during baseline acceptance. Preserve exact failure evidence and line references so the next implementation pass can target confirmed defects.
