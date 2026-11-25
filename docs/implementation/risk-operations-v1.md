# Risk and alert operations V1

The portfolio risk evaluator checks total and per-market exposure, drawdown, daily loss, data freshness, evidence status and exposure-to-liquidation-depth. It returns BLOCKED, UNKNOWN or WITHIN_CONFIGURED_LIMITS; even the latter is not a production authorization.

The local alert journal is append-only and hash-chained. It supports OPEN, ACKNOWLEDGED and RESOLVED state transitions under an exclusive filesystem lock. Corrupt journals fail closed. The journal does not deliver Telegram/email/push notifications and is not a distributed alert service. A stale lock directory must only be removed after the operator confirms no writer remains.

The paper quote planner can consume an emergency-halt state. Missing, corrupt or unavailable halt storage is treated as halted. Resume requires explicit operator confirmation. No execution adapter consumes these outputs in this branch.

### Local alert writer recovery
The read-only audit command (`node scripts/audit-alert-store.mjs <private-alert-journal.jsonl>`) reports journal integrity and lock observations separately. A directory lock may survive a crash; its age does not establish that the owner is dead. Do not automatically break it. Stop all writers, confirm the journal integrity and preserve a backup, then have a local administrator remove the empty orphan lock only after verifying there is no active writer. Restart in a controlled environment and re-audit. Journal publication still rewrites the bounded file; this is not a high-throughput database or a production notification service.
