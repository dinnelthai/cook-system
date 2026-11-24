# V0.8 archived cash crosscheck

This offline Localnet diagnostic reuses archived-account-audit and project-accounting without replacing their original contracts. Input: {accountInterval, projectId, cashHistoryComplete, postings}. Each existing cash posting must provide id, signature, kind, amountBaseUnits, projectId, quoteAsset SOL_LAMPORTS, genesisHash, wallet, openingSlot, closingSlot, status and reconciliation. Scope must match the one designated native account. It does not generate postings.

Run: node scripts/audit-archived-cash.mjs cash-evidence.json

The diagnostic compares each receipt's signed native balance delta with its associated signed cash postings, checks failed fee classification, rejects duplicate posting IDs and mismatched scope, and crosschecks the aggregate cash ledger. Multiple gross components in one successful receipt require further evidence even when their net sum matches. Unverified or unmatched rows cannot establish consistency. An internally consistent result does not authenticate the evidence, attest economic classification, prove completeness, establish PnL, or authorize settlement. Account ownership and transaction finality remain independently unverified. No live integration, execution or signing is added.

Regression cases include offsetting errors with matching closing balance, duplicate fees, missing failed fees, ambiguous components and incomplete coverage.
