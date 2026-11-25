# M09-E — revision-bound historical project queries
With the existing opt-in loopback historical workspace service enabled, POST /api/historical-workspace/query (application/json) accepts {kind,revision,...}. This is a read-only query even though it uses POST to keep project keys out of URLs. Every query requires a specific saved revision (0 is the empty baseline). Response includes exact revision and digest; missing revisions or records return 404, malformed query 400. No snapshot writes or transaction capabilities.
- projects: revision only; returns declared project groups.
- project: projectKey; returns only that project's record summaries.
- record: projectKey and recordKey; returns recomputed closed-interval accounting, trust, risk and evidence states, never a live market view.
- events: projectKey and recordKey, optional offset and limit (1–100); returns derived event references, nullable total, next_offset, and workspace-wide archive audit status. Does not expose raw receipts or input reports. Project membership checked on each request.
No financial aggregation across intervals, source authentication, wallet inference or real settlement. Query computation currently re-audits original snapshot; no global cache or measured latency guarantee. UI wiring, full-server enabled integration and actual browser acceptance remain M09-F.
