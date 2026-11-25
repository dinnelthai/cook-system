# Offline diagnostic logs

Open the sidebar **07 诊断日志**, or use **导出诊断日志** on any page. Reproduce the problem, then export the JSON and share it for analysis. A startup fixture failure also exposes an export button.

The log contains UTC timestamps, sequence numbers, severity, event types, approved audit issue codes, counts, duration and synthetic experiment seed/run counts. It does not record raw data, wallet addresses, credentials, RPC endpoints, arbitrary error messages or stack traces. This is a browser-session log, not a chain evidence archive or server log. When configured browser storage is available, sanitized entries persist across reloads. Otherwise logging remains memory-only. A default 1000-entry rolling limit bounds memory use. Check persistence_status and export before refreshing if storage is unavailable. No automatic upload or network logging is performed.

Run `node scripts/serve-offline-mvp.mjs` and open the printed localhost URL. Run `npm test` for diagnostic log tests.

Review issue objects and strings are normalized to explicitly approved codes, with raw IDs, messages, endpoints and credentials omitted. Archive ingestion reuses the bounded regular-file reader and rejects oversized input, symlinks and detected concurrent file modifications. The export remains a browser diagnostic snapshot, not a server access log.

### Local HTTP transport diagnostics
GET `/api/terminal/diagnostics` on the existing localhost server returns a bounded memory-only transport log. It includes route groups, allowed method categories, HTTP status, disconnect outcome and elapsed time. It deliberately excludes URLs, query strings, headers, request bodies, account identifiers and raw errors. The existing Host/Origin/fetch-site checks apply. The log resets when the server restarts, is not a financial audit trail, and does not enable execution.
