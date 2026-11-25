# Terminal V1.0 RC — Product acceptance and release boundary

## Verified baseline

Commit `109b4b7b2cf10c5922b73f1da035eadd6bb16aac`, CI run [45623706992](https://github.com/dinnelthai/cook-system/actions/runs/45623706992): Node 22 and 24 passed. Node 22 runner reported 796 tests, 0 failures, 200/200 business regression tests, 19/19 code checks. Chromium metadata recovery, primary navigation and risk filter checks passed. The runner explicitly reported 8 pending operator gates and did not establish full browser E2E acceptance.

## RC hardening in this change

- Reject duplicate project identities and unexpected execution or source-attestation flags at the browser API boundary; reject unrelated archive records.
- Suppress historical amounts for unrecognized evidence statuses.
- Extend disposable browser QA with a narrow viewport and unavailable saved project recovery, including the disabled draft form and explicit exit.
- Keep dense historical evidence tables and identifiers inside narrow workspace layouts.

New changes require their own CI result; baseline success does not certify this commit.

## Manual product acceptance checklist (not run)

Use the existing local offline terminal, no real funds or mainnet execution. Check all seven navigation pages at desktop and narrow viewport sizes. Inspect loading, empty, invalid input and request failure states; verify project identity in the header, no unrelated report or wallet balance in a project, no amount shown until an explicit historical interval is selected, and conflicts/unknowns are not zero. Inspect the terminal stage strip, task links, risk severity filters, exact amount formatting, order evidence, report export, audit mode, keyboard focus, scrolling and console errors. Check successful and rejected metadata saves with a disposable project only. Record screenshots and defects separately. No screenshot or complete visual pass is claimed here.

## Release boundary

Offline code/metadata QA is distinct from independent source authenticity, chain/account reconciliation, real browser operator acceptance, local key custody, local transfer confirmation, archive replay parity, load/soak and credential review. Do not mark these gates PASS merely because CI succeeds. Core math and real data integration are unchanged; execution stays disabled for project workflows.
