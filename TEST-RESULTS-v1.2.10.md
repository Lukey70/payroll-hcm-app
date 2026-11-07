# v1.2.10 validation — 7 November 2026

- `npm test`: all 14 Node regression suites passed after the version update.
- `PAYROLL_CHROMIUM_PATH=/tmp/chromium npm run test:browser`: all 15 Chromium suites passed after the version update.
- All 49 JavaScript files passed `node --check`. HTML assets exist and use v1.2.10; package, lockfile, DataStore, sidebar and update metadata match.
- Payroll regression covers tax, super, deductions/recoveries, urgent pay, Additional Earnings, leave balances, pay errors, finalised history, same-day casual rehire, support and manager scopes.
- Timesheets cover actual work/breaks, 7.5-hour non-rostered flex threshold, approved-only carry/37.5 cap, explicit flex taken, historical readonly weekends, future-period rejection/current default, approved leave references, missing-day exceptions, overnight overlaps, manager review and immutable financial data.
- Browser checks exercise unsaved-navigation Save/Discard/Keep Editing, failed-save rollback, weekday layout, previous/current periods, week navigation, manager review/print and mobile containment.
- Extended absences cover combined approved bookings/non-working gaps, rostered returns, configurable thresholds, current manager reminders/deduplication/dismissal/cancellation/reporting changes, scoped navigation and failed-save rollback.
- Preferred names cover Payroll editing, legal/display separation, portal headers, read-only ESS/MSS, export/import, payslip/Statement of Service/Statement of Earnings legal identity, bank identity and rollback.
- Shared UI covers matching status colours, Cancel without persistence across core forms, DOM/visual action order, current acting position headers and responsive layout.
- Search covers a 65-employee dataset plus 20 extra positions, legal/preferred-name and ID matching, no-match states, unchanged selection, Escape/Arrow Down, MSS restrictions, native change handlers and mobile width.
- Certification covers persisted Payroll/MSS ticks with nested table/page scroll and focus retained.
- Date/report/table UI covers four-digit current/historical years, loading/busy states, stale export prevention, errors, navigation cancellation, hover and selected-row outlines, unchanged checkbox behaviour, formal-document/print exclusions and mobile placeholders.
- Existing real support popup/shared unsaved work, notification pane, payslip rows/filter/navigation, report/PDF exports, structured manager requests, leave attachments and urgent payment snapshots also passed without browser page errors.

Desktop/mobile screenshots were visually reviewed during implementation, including timesheet references/warnings, absence dashboard, selected rows and loading placeholders. Tests use synthetic data. No live bank file was uploaded. Existing browser-local storage, unconfirmed legacy LSL-date issue and bank-specific Urgent Pay CSV limitations remain in the release notes.

Final compatibility rerun: the updated timesheet browser suite also saved an older weekend entry without changing its work times and confirmed its weekend fields are read-only. The full Node rerun explicitly confirmed historical finalised on-call eligibility remains true where previously recorded, while new/open entries remain non-super. Both passed.
