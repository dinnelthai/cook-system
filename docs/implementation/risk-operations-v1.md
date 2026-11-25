# Risk and alert operations V1

The portfolio risk evaluator checks total and per-market exposure, drawdown, daily loss, data freshness, evidence status and exposure-to-liquidation-depth. It returns BLOCKED, UNKNOWN or WITHIN_CONFIGURED_LIMITS; even the latter is not a production authorization.

The local alert journal is append-only and hash-chained. It supports OPEN, ACKNOWLEDGED and RESOLVED state transitions under an exclusive filesystem lock. Corrupt journals fail closed. The journal does not deliver Telegram/email/push notifications and is not a distributed alert service. A stale lock directory must only be removed after the operator confirms no writer remains.

The paper quote planner can consume an emergency-halt state. Missing, corrupt or unavailable halt storage is treated as halted. Resume requires explicit operator confirmation. No execution adapter consumes these outputs in this branch.
