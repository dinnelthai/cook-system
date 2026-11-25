# Deferred engineering backlog — post-local MVP

Decision date: 2026-11-25. Operator prioritizes local functionality and mathematical correctness. The following tasks are recorded, not deleted or represented as accepted. No new production security or infrastructure work is scheduled during the current functional iteration.

| ID | Deferred task | Return condition |
|---|---|---|
| SEC-01 | Encrypted key storage, key lifecycle, OS permission and Windows ACL audit | Before real funds or shared custody |
| SEC-02 | Authentication, authorization, role separation and operator audit trail | Before multi-user or non-loopback deployment |
| SEC-03 | Credential rotation and Git history exposure review | Before using external services or production credentials; any known exposed credential should be revoked promptly |
| SEC-04 | Independent penetration testing, dependency and supply-chain review | Before production deployment |
| REL-01 | Durable transactional storage, concurrent writers, crash recovery and backup/restore | Before unattended or multi-process operation |
| REL-02 | Centralized logs, notifications, distributed monitoring and alert recovery | Before unattended service |
| INF-01 | Deployment automation, high availability, disaster recovery and production observability | Before production rollout |
| PERF-01 | Production capacity, sustained load and resource budgeting | Before production sizing; functional latency and reproducible local performance checks remain in scope |

Existing local-only restrictions, default-off execution flags, private genesis checks and fail-closed behavior remain unchanged. Correctness of arithmetic, receipt reconciliation, data provenance, explicit uncertainty and basic error handling remain active functional requirements. No new live trading capability or deceptive market-behavior optimization is included.

Revisit this backlog after the local MVP's functional and algorithmic acceptance. Any transition to real funds, shared custody or externally reachable service requires explicit review of the relevant deferred gates. The current independent acceptance report remains a record of open evidence gaps, not a pass certificate.
