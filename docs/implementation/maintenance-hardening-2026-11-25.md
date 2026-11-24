# Maintenance hardening — 2026-11-25

- Remove tracked dependency directory and local environment file from the current tree. Do not commit wallet keyfiles or credentials. The prior public history contained a nonempty LOCALNET_READ_KEY; rotate it at its issuer and review access logs. Removing a file does not revoke a credential or erase Git history.
- Restore a root npm v3 lockfile using the existing resolved dependency metadata; verify with a clean npm ci on Node 22. CI uses npm ci. The SDK interop patch is idempotent and rejects unsupported named BN imports instead of silently skipping them.
- Historical reports can be inspected but cannot be marked settled or archived until independent source and wallet attribution are available. Synthetic review settlement is a test-only operation. No execution or signing capability is added.
- Regression coverage: patch repeatability and unverified historical settlement refusal. CI results and local validator acceptance must be checked independently; this change does not certify production readiness.
