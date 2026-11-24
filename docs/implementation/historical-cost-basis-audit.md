# Historical cost-basis conservation audit

Recheck existing historical journal records in the order of the linked market events when complete and no unsequenced external adjustment is present. Reject negative intermediate quantity or cost, residual cost at zero inventory, impossible opening/closing balances, and endpoint disagreement. This audit does not choose or optimize cost allocation; it tests basic conservation of supplied records.

External transfers and burns without a shared ordering contract remain PARTIAL, not assumed chronological. Internally consistent results do not authenticate source data, cost allocation policy, or ownership. The terminal risk classification remains UNKNOWN unless a contradiction is detected. No execution, signing, future valuation or trading functionality is changed.

Regression tests cover negative intermediate balances, full disposal, residual basis, partial adjustment evidence, ending balance mismatch and integration with report readiness.
