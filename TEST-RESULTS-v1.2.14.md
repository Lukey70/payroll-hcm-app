# v1.2.14 validation — 11 November 2026

- All 18 Node regression suites and all 26 Chromium browser suites passed on v1.2.14.
- All 66 JavaScript syntax checks passed. Package, lockfile, login version, update metadata and HTML assets match v1.2.14.
- A synthetic v1.2.13 backup imported successfully. Employee records, finalised payslips, pay-run history and existing manager requests were preserved. An existing manager request could be returned and corrected after upgrading.
- Manager request coverage includes all four templates, initial/concurrent job records, inclusive last-working-day conversion, exact roster and acting return dates, distinct draft rows, saved-row rollback, reopening an outstanding companion, and safeguards for due incomplete or corrected rows.
- Correction coverage includes original-requester permissions, selected-field edits, two-week rosters, withdrawal, before/after values, notifications, review of a revised saved expiry by its original row ID and rejection of outdated drafts. The resolution prompt requires explicit action and preserves edited notes if saving fails.
- Casual Input coverage includes day-based instance numbering, same-day duplicates, stable references, estimated versus actual pay, current/future/backdated grouping, paid and pending dates, finalised deletion protection, Payroll review links and mobile layout.
- Regression coverage includes leave, concurrent jobs, Cease Pay, bank and super, deductions, timesheets, Urgent Pay, payslips, reports/PDF and support popups.

The tests use synthetic data. The app remains browser-local and does not share payroll records across devices. See test-results.txt for the run output.
