# v1.2.12 validation — 8 November 2026

- All 18 Node regression suites passed, including 25 concurrent-job groups, 16 structured-request groups and 14 payroll-operations groups.
- All 22 Chromium browser suites passed in the final full run. Coverage includes Payroll, ESS, MSS, reports/PDF, support, messages/attachments, bank/super, notifications, timesheets, Urgent Pay, casual rehire, Cease Pay, Job Data deletion, concurrent jobs and the new casual leave/calendar checks.
- All 62 JavaScript files passed syntax checks. Package/lockfile, storage version, sidebar, update metadata and all HTML asset versions match v1.2.12.
- Casual booking checks cover all leave types, casual-only employees, primary casual/secondary contract records, manager scope, legacy leave preservation and ranges transitioning into casual employment. Calendars ignore casual hours and legacy casual leave, retain contract non-rostered days, exclude casual-only monthly rows/yearly grids and respect manager record scope.
- Structured request checks cover DD/MM/YYYY display and unchanged ISO storage, Payroll/MSS layouts, mobile containment, masked TFNs, optional/trimmed preferred names and legal identity, temporary/permanent roster toggling, later return dates, valid one-/two-week return grids, totals, saved roster tables and unchanged Job Data.
- Starter reply checks cover new/existing datasets, one-time migration, preserved custom/edited/inactive/removed replies, export/import, Payroll editing/persistence and insertion into an editable unsent message.

An initial file-URL browser run lost the seeded concurrent-job records on reload. The concurrent-job, Cease Pay and Job Data deletion persistence tests now use a local HTTP server, matching GitHub Pages hosting, and concurrent records are explicitly checked in localStorage before reload. The final complete run passed; the concurrent workflow also passed three additional HTTP runs. No application change was made for the file-origin test result.

Desktop/mobile screenshots were visually reviewed during implementation. Tests use synthetic employee data and send no live payments. Uploaded Git blob hashes are verified before updating main, and remote files absent from the local workspace are retained. Existing browser-local storage/server authorization and bank-specific Urgent Pay CSV limitations remain documented in the release notes.
