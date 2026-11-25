# M09-D — historical project evidence index
Rebuild a retrospective index from a saved workspace export. Each accepted record is bound to its project key and canonical-object SHA-256; if existing report/event link rules pass, derive the candle event batch ID and list declared inventory journal/cash posting references by event ID. The existing cross-batch audit reports conflicts. Missing or unsupported evidence remains unavailable, not zero. The existing byte-exact report/event archive CLI contract is unchanged.
```sh
node scripts/historical-workspace.mjs export workspace-revision.json
node scripts/review-historical-workspace-evidence.mjs workspace-revision.json evidence-index.json
```
Output must be a new file. Exit 0 internally consistent, 2 empty/incomplete/review, 1 invalid input or I/O failure. Use sanitized inputs and private directories. Canonical object digest is not the original imported file digest. Event batch IDs are derived, not proof that files are archived separately. No inferred receipt/ownership/fee attribution, financial totals across overlapping intervals, full historical coverage, source authentication, settlement, or live execution. Query API and browser integration remain pending.
