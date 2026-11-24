# Offline MVP UI

Node.js 22+. Run `node scripts/serve-offline-mvp.mjs` from the repository and open `http://127.0.0.1:4173/`.

Five screens: token metadata draft/export, project cash and inventory ledger, historical fixture import and audit, historical market snapshot, and realized profit/risk report. The default fixture is synthetic. The historical audit runs directly in the browser using existing pure modules. Missing history can be tested with the provided button. No real wallet connection, signing, token creation, trade submission, or coordinated wallet execution. Wallet-level records, K-lines, and Holder details are not synthesized when absent. Token metadata export does not include the preview image. Browser smoke testing and local-chain parity remain pending.
