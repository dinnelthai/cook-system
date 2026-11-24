# Historical trade evidence cross-check

Each project journal event must refer to an existing market event ID of the same side and declared finalized/reconciled state. When market token quantities, candle events or transaction signatures are supplied, compare them with the corresponding existing journal and cash records. Duplicate linked candle evidence, zero journal quantity and contradictory identifiers are review failures. Market gross notional is not equated with fee-inclusive or fee-net cash movement.

Legacy records without quantity or signature evidence remain importable as PARTIAL; a matching label is not independent source authentication, wallet attribution, economic classification, or proof of completeness. Additional market events may represent other participants and are not inferred to belong to the project. No trading, signing, valuation strategy or execution behavior is added.

Regression coverage: missing/opposite-side event, partial evidence, quantity contradiction, different gross/net amounts, signature mismatch, and candle/journal mismatch.
