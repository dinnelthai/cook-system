# Historical capital flow cross-check

Compare the gross confirmed cash capital inflows and outflows against the corresponding gross NAV snapshot flows for the same closed reporting interval. A mismatch blocks report readiness and suppresses derived financial metrics. Equal net flows are insufficient: offsetting gross differences may hide inconsistent records.

This is an internal consistency check for offline historical and synthetic records only. It does not establish event-level flow timing, NAV valuation, ownership, source authenticity, completeness, or historical settlement eligibility. No execution, signing, market-making policy or live trading functionality is changed.

Regression coverage: inconsistent inflow, offsetting gross mismatch, matching gross totals. CI and local acceptance remain separate.
