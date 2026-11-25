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

## Automated visual evidence

Verified follow-up baseline: commit `653276f0160053648b724c46237fb6aa84f7955d`, CI [45624039462](https://github.com/dinnelthai/cook-system/actions/runs/45624039462). Node 22 and 24 passed; 798 tests, 201 business regressions, 19 code checks, zero failures. Chromium recovery, seven-page navigation, risk filter, narrow viewport and missing selection checks passed. Eight external operator gates remain pending.

The browser recovery runner now optionally captures 14 viewport PNGs (seven primary pages at 1440 × 900 and 390 × 844), with a manifest of viewport and document widths. CI collects the disposable fixture previews as `cook-system-browser-previews`. These screenshots support, but do not replace, manual visual review. Captures are made from an isolated temporary project database, not an operator's existing environment. No user wallet keys or live RPC are used.

Local command on a non-root system with a supported Chromium binary:

```sh
COOK_BROWSER_BINARY="/path/to/chromium" npm run accept:browser-recovery -- --capture-previews
```

Look in `.cook-system/acceptance/browser-preview-*/` for the manifest and PNG files. The manifest reports document overflow measurements instead of claiming visual quality. A missing screenshot or a failed navigation is not a visual pass.

## Screenshot review of baseline 715c67e

Reviewed all fourteen viewport PNGs from [CI 45624340508](https://github.com/dinnelthai/cook-system/actions/runs/45624340508). Manifest: zero document-level horizontal overflow in all fourteen captures. Visible defects: missing Chinese glyphs in the runner; narrow captures inheriting a previous page's scroll offset; operator task list pushing historical asset indicators below the desktop first viewport; narrow desktop navigation and overly small labels. These are real rendered fixture screenshots, not a live operator environment. The follow-up installs the OS CJK font in the screenshot runner (no bundled font), resets navigation and capture scroll, captures operator mode, moves asset indicators ahead of tasks, translates task statuses and improves desktop readability. New screenshots and CI must be verified before closing the defects. Table-local horizontal scrolling and below-fold content still require inspection.

## Seven-page UI baseline and final polish

Verified baseline: `498a1b9ac66fa98780420fc14107df4757d07c57`, [CI 45626203552](https://github.com/dinnelthai/cook-system/actions/runs/45626203552), Node 22 and 24 passed. 801 tests, 201 business regression tests, 19 code checks, zero failures. Chromium tested all seven primary page navigation paths, experiment input rejection and fixed synthetic experiment result, missing project recovery and 14 PNG captures. Reviewed the complete desktop and narrow viewport screenshot sets. All 14 manifest document horizontal overflow measurements are zero. Remaining refinements: visible status labels on the review summary, narrower header layout, programmatic input labels, keyboard navigation focus after render, and revealing collapsed invalid optional fields. These new changes require independent CI. Screenshots of disposable metadata fixtures do not validate actual data-heavy layouts, independent source verification, or production operation.

## Populated evidence display regression

Baseline b7b60e2 passed both Node matrix jobs (run [45626530040](https://github.com/dinnelthai/cook-system/actions/runs/45626530040)). The follow-up browser harness uses its own disposable project database only: a synthetic historical interval with exact positive cash, negative NAV, and a quantity larger than Number.MAX_SAFE_INTEGER; a separate conflicting interval; and the existing synthetic candle report. It verifies explicit interval selection, matching exact values on terminal/assets/review pages, conflict masking, clearing a selection, and independent chart rendering. No real chain evidence, operator database, model calibration, live data or execution is involved. Existing 14 screenshots still cover the original metadata fixture; the new populated checks are DOM assertions, not visual acceptance. This follow-up requires its own CI result.
