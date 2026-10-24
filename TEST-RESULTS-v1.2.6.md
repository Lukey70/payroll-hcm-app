# v1.2.6 validation - 24 October 2026

## Automated regression

`npm test` passed all ten Node.js suites:

- Core payroll regression cases, including historical casual retro settlement and leave calculations.
- 23 payment-details groups.
- 42 self-service groups, including separate adjacent leave booking dates and unchanged financial totals.
- 17 support/certification groups, including requester-response status changes, attachments and notification routing.
- 18 prior-update groups and 18 v1.2.4 feature groups.
- 9 manager-template groups, including required termination reasons and valid Last Working Day.
- 6 Dashboard groups covering exact support filters, date boundaries, Job Data links, expiry dates, saved-row selection and non-mutation.
- 6 absence balance groups covering signed credits, four-decimal precision, audit history, entitlement-date changes, continuing LSL accrual, finalised history, export/import, permissions and failed-save rollback.
- 3 Pay Errors groups covering structured employee IDs, duplicate names, escaped display text, empty reports, long messages and paginated PDF tables.

All 30 root and test JavaScript/CommonJS files passed syntax checks. Version metadata and all versioned HTML asset references were verified as 1.2.6. Historical suite filenames and printed v1.2.4 labels remain for continuity; these tests execute against the current source.

## Browser verification

`PAYROLL_CHROMIUM_PATH=/tmp/chromium npm run test:browser` passed all seven suites using Playwright 1.62.1 and Chromium 153:

1. Existing Payroll workflows: Dashboard, reports, both Statement of Earnings export paths, compensation leave, salary packaging, cash-outs, MSS templates, support history, casual login and protected Payroll Overpayment Adjustments.
2. Companion support window, shared state and unsaved drafts, failed-save rollback, access loss, notifications, ESS/MSS payslip filters and finalisation controls.
3. Manager request fields, daily/two-week rosters, automated reporting, termination reason/last day, general enquiry restoration and mobile layout.
4. Dashboard support counts and filtered links, precise upcoming Job Data selection, response refresh and mobile layout.
5. Payroll payslip rows, default ten, date filters, mouse/keyboard opening, Back preserving employee/range, finalised print/download, open-pay/role guards, employee switching, empty results and mobile layout.
6. Shared Payroll/ESS/MSS absence card rows, Add/Take credit and date edits, comment validation, cancellation, retained employee selection, read-only scoped self-service and mobile layout.
7. Pay Errors table, duplicate-name IDs, direct PDF download, print view, Unicode print fallback, refreshed empty report and export permissions.

No JavaScript page errors remained. Full output is in `test-results.txt`.

## PDF and visual checks

Browser-exported Pay Errors PDFs were parsed with pdfplumber, confirming columns and employee IDs. Empty reports show No errors found. A 65-row stress report with a very long name and multi-page message produced ten pages; all employee IDs remained present, continuation headers repeated and text stayed inside page margins. Poppler-rendered first/continuation pages were visually reviewed for wrapping, borders, spacing and footers. Dashboard, Payroll payslip and shared balance desktop/mobile screenshots were reviewed during implementation.

Temporary screenshots, PDFs, executable browser files and synthetic datasets are excluded from the upload.

## Scope

Checks use synthetic employees and browser-local storage; no live employee dataset is bundled. This remains a local browser application, without shared server storage or cross-device authentication. Native PDF downloads use the bundled Latin font encoding; Print / Save PDF preserves names outside that encoding. Older merged finalised leave rows retain saved amounts and show their actual date range; they are not rewritten as reconstructed historical bookings.
