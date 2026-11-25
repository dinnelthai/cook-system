# M09-B — opt-in SQLite historical workspace journal
Uses Node built-in node:sqlite (Node 22.13+ or Node 24; on older 22 builds use a current patch release). No new npm dependency. The standalone CLI is opt-in, not started by the terminal, does not connect to RPC and does not access wallets. Default path is .cook-system/historical-workspace/workspace.sqlite, ignored by Git. COOK_HISTORICAL_WORKSPACE_DB may point to a private operator-controlled directory. Only use sanitized offline reports; local files are not encrypted. On Windows check ACLs independently.
```sh
node scripts/historical-workspace.mjs list
node scripts/historical-workspace.mjs save historical-project-workspace.json 0
node scripts/historical-workspace.mjs export restored-workspace.json
```
Use the current revision from list instead of 0 on later saves. Export an older revision by appending its number. Export refuses to overwrite existing files. Every save and read re-audits original reports. SQLite transactions and expected revision reject stale writes; previous snapshots remain readable; identical current snapshots do not create revisions. Digests detect content corruption, not source authenticity. Limit 32 revisions / 128 MiB total serialized payload and existing workspace capacity; no automatic deletion. Browser auto-restoration, HTTP API, lifecycle editing, operational backups and real environment acceptance remain pending. No execution capability or custody change.
