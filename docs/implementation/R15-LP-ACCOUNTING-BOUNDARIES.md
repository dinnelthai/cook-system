# R15 — LP position accounting and fee separation

Baseline 07ad0075ff202327bef7bb7c08f3587a4719f265. R14 CI 45628111279 completed successfully on both Node versions. The existing synthetic LP statement reconciliation and pro-rata fixture mark remain the only LP numerical engines. This follow-up introduces optional explicit fee asset identifiers and optional declarations of whether distributable assets contain separately recorded fees. A declared asset mismatch or contradictory inclusion flag blocks the synthetic mark. Legacy missing declarations remain UNKNOWN; a false flag is a declaration, not proof of economic disjointness. No real position valuation, ownership, claim mechanism, pool operation, or trade recommendation is established.

Project runtime retains lp_assets=null and all position/fee values unknown. The additional explanatory flags distinguish aggregate other assets from LP attribution, pool reserves from project assets, and pool fee buckets from wallet cash. Test an untrusted extra LP field in a retrospective archive and prove it does not add to the existing declared NAV. This does not certify the composition of supplied aggregate other assets.

All new checks are local synthetic or historical projection checks. No real data, UI, parameter, or execution changes. New CI required.
