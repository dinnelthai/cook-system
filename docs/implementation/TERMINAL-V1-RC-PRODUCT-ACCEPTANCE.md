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
