# Historical NAV endpoint evidence

Optional nav.endpointEvidence schema cook-nav-endpoints.1 contains the report scope and opening/closing records. Each endpoint carries cutoff, sequence, cashBaseUnits, tokenAmountBaseUnits, inventoryValueBaseUnits, receivableBaseUnits, liabilitiesBaseUnits, otherAssetsBaseUnits. All amounts use canonical nonnegative integer strings. NAV is checked as cash + supplied inventory value + receivables + other assets - liabilities. Cash, token quantity and receivables must agree with the corresponding historical ledger endpoints.

Legacy archived reports remain importable, but missing endpoint evidence suppresses historical NAV and capital-adjusted NAV change. Contradictory evidence blocks report readiness. Even internally consistent endpoints do not independently authenticate inventory values, liabilities, other assets, source coverage or ownership. Historical TWR, sampled drawdown and NAV chart observations remain unavailable pending independent time-series valuation evidence; synthetic fixtures retain test-only performance values. The valuation check is UNKNOWN unless contradictory (REVIEW). No execution, signing, valuation strategy or market policy is added.

Regression tests cover absent evidence, consistent endpoints, contradictory balances and value arithmetic, and scope/position mismatches.

F06: a missing or invalid endpoint amount is recorded as a review finding, not a zero or an unhandled exception. Available cash, token and receivable comparisons continue independently, so an absent inventory valuation cannot hide a known cash contradiction. The NAV identity is compared only if every component is known. No new valuation methodology or future trading calculation is introduced.
