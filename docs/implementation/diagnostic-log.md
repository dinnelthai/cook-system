# Offline diagnostic logs

Open the sidebar **07 诊断日志**, or use **导出诊断日志** on any page. Reproduce the problem, then export the JSON and share it for analysis. A startup fixture failure also exposes an export button.

The log contains UTC timestamps, sequence numbers, severity, event types, approved audit issue codes, counts, duration and synthetic experiment seed/run counts. It does not record raw data, wallet addresses, credentials, RPC endpoints, arbitrary error messages or stack traces. This is a browser-session log, not a chain evidence archive or server log. Refreshing resets the log; a 1000-entry rolling limit avoids unbounded memory use. Export before refreshing. No automatic upload or network logging is performed.

Run `node scripts/serve-offline-mvp.mjs` and open the printed localhost URL. Run `npm test` for diagnostic log tests.
