# v1.2.5 validation - 24 October 2026

## Automated regression

`npm test` passed all seven Node.js suites: core payroll cases, 23 payment-details groups, 39 self-service groups, 15 support/certification groups, 18 prior-update groups, 18 v1.2.4 feature groups and 9 simplified manager-template groups. The legacy suite filenames and printed historical version labels are retained; they execute against the current application source.

Coverage includes payroll calculations and historical casual retro settlement, cash-out migration and frozen history, compensation leave, salary packaging, termination rules, scoped self-service and support access, manager requests and daily roster validation. New restriction checks reject MSS creation, amendment, conversion and deletion of Overpayment Adjustments, and verify that ordinary MSS earnings saves/deletions preserve Payroll adjustments.

All 23 root and test JavaScript/CommonJS files passed `node --check`.

## Browser verification

`PAYROLL_CHROMIUM_PATH=/tmp/chromium npm run test:browser` passed all three suites using Playwright 1.62.1 and Chromium 153:

- `browser-v124.test.js`: Dashboard, reports, Statement of Earnings PDF download and print, compensation roster hours, salary packaging validation/save, leave cash-out validation/save/delete, manager templates, support history, casual-only ESS access, updated home icons and MSS earnings saves preserving Payroll Overpayment Adjustments.
- `windows-notifications-payslips.test.js`: real companion support window, shared state while unrelated parent earnings remain unsaved, window reuse and popup-block feedback, failed-save rollback, unsent draft preservation, parent closure/logout locking and direct-link rejection. Shared notification pane, per-user dismissal including Payroll-wide notices, scoped navigation, ESS/MSS payslip list rows, retained date filters on Back and finalisation restrictions.
- `request-template-ui.test.js`: automatic subjects and hidden structured description, daily/two-week roster grids and totals, inline validation, position-derived reporting, Last Working Day only for termination, casual roster rules, formatted saved schedules, general enquiry field restoration and mobile roster layout. Request submission does not change Job Data.

No JavaScript page errors remained in these checks. Screenshots and PDFs are temporary QA files and are excluded from the upload. Full automated output is recorded in `test-results.txt`.

## Scope

Tests use synthetic records and browser-local storage. The companion window depends on the main application remaining open and signed in. These checks do not establish multi-device synchronization or server-side authorization. No live employee database is bundled or modified by the tests.
