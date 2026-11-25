# R13 — historical financial identities and exact amounts

Baseline 6ae698a25e4cb1142c0eadf4a074b5bf24cedf9b: CI [45627364565](https://github.com/dinnelthai/cook-system/actions/runs/45627364565) passed both Node versions, 804 tests, 203 business regressions, populated browser checks. Eight external gates remain pending.

The existing financial identity auditor is extended from 17 to 22 fixed identities (additional domain-error rows remain possible). Added checks for expected closing cash, interval change in inventory unrealized mark minus cost, the NAV bridge residual, receivable change, and remaining NAV bridge residual. Uses the canonical producer output and exact signed BigInt arithmetic, not a replacement accounting engine. Missing dependencies remain UNKNOWN; malformed values require review. A nonzero economically unexplained residual can be arithmetically correct and must not be treated as profit or forced to zero. No independent valuation or source certification.

Tests mutate each of the five new fields by one base unit, verify values beyond safe integer range, distinguish missing and malformed inputs and preserve a nonzero residual. UI, calibration, raw data integration, permissions unchanged. New CI pending.
