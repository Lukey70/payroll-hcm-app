# v1.2.13 validation — 9 November 2026

- All 18 Node regression suites passed, including 26 payroll-operations groups, 17 structured-request groups and 26 concurrent-job groups.
- All 24 Chromium browser suites passed with no reported page errors in the new workflows.
- All 64 JavaScript syntax checks passed. Version metadata and HTML asset versions match v1.2.13; referenced local assets exist.
- Casual Input coverage: active casual eligibility, replacement by employee/record or position, acting-position resolution, daily schedule OK/Cancel, work-date pay-period routing, stable instances, idempotent updates, historical rate snapshots, legacy entry migration, failed-save rollback/draft retention, and deletion/recovery without modifying closed payslips.
- MSS coverage: shared active casual pool, schedule/save, finalised-input deletion protection in UI and business logic, unpaid and late-entry deletion, record-specific locking with another casual record on Cease Pay, prefilled support drafts/submission, and retained Payroll deletion authority.
- Additional Earnings coverage: employee then record selection, record isolation, protected existing Casual Earnings and no manual Casual Earnings option in Payroll or MSS.
- Request coverage: one-record auto-fill, required valid selection for multiple records, initial record 0 for new employees, and New Concurrent Record for existing-employee commencements without creating Job Data at request submission.
- Calendar coverage: pre-commencement NRD in Payroll/ESS/MSS, zero pre-employment hours and retained casual-only exclusions. A recursion in the service view for multiple casual-only records was corrected and tested.
- Existing support, bank/super, deductions, finalisation, timesheets, leave, reports/PDF, notifications and concurrent-job workflows passed regression checks. Desktop/mobile Casual Input screens and the finalised MSS screen were visually reviewed during implementation.

Tests use synthetic data. This release remains browser-local with no shared server-side state or authorization. Bank-specific acceptance of Urgent Pay CSV remains unverified. The generated ZIP is verified against its SHA-256 manifest and excludes temporary test screenshots and dependencies. GitHub upload was not performed for this generation request.
