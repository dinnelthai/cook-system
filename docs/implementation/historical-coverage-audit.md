# DATA-03: Historical scan coverage audit

A scan manifest describes one provider scan over an explicit closed range. Each page records its zero-based page index, incoming/outgoing opaque cursor, has_more flag and event IDs. The audit checks page-index continuity, cursor chaining/advancement, terminal exhaustion declaration, event/source identity, range membership, event order and complete accounting of the supplied event set.

Statuses: PAGINATION_COMPLETE_DECLARED means only that the declared page chain is internally consistent and terminal; PARTIAL means pages are absent or the cursor remains open; REVIEW_REQUIRED means contradictory page, cursor, event, range, source or ordering evidence exists. The report always keeps coverage_attestation UNKNOWN and history_complete_attested false.

Do not infer missing trades from empty slots, time gaps or sparse activity: valid markets can have no transactions during those periods. Cursor exhaustion is only a provider-declared result, not source authentication, archive completeness, finality, or proof the provider's query semantics were correct. Each provider's cursor contract must be adapted and validated separately. This module is an offline manifest audit and is not yet wired to the live collectors or financial report.
