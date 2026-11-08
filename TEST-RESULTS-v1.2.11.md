# v1.2.11 validation — 8 November 2026

- All 18 Node regression suites passed, including 22 concurrent-job groups, 14 Cease Pay groups, termination leave recovery, support search, delegation, negative-net checks and recovery notifications.
- All 21 Chromium browser suites passed in the final complete run, including Payroll, ESS/MSS, reports/PDF, support popup/attachments/search, notifications, timesheets, bank/super, Urgent Pay, casual rehire, Cease Pay, row deletion and concurrent records.
- All 60 JavaScript files passed syntax checks. Release assets, package/lockfile, storage version, sidebar and update metadata match v1.2.11.
- Concurrent tests cover independent rosters/rates, combined withholding, record deductions/percentage bases/recovery limits, scoped manager access, shared leave capacity, final non-casual payout while casual employment remains, later casual earnings, arrears isolation, exact Statement of Service record numbers and persistence/mobile layout.
- Finalised historical sources remain frozen. Browser tests use synthetic data and do not upload live bank payments.

An initial full browser run failed a Cease Pay row-count assertion after reload. The isolated Cease Pay, Job Data toolbar and concurrent workflows passed on rerun. Added explicit checks of both saved pay-control rows before reload; the final complete 21-suite run passed. No application change was needed for this transient result.

Desktop/mobile screenshots were reviewed during implementation. Git blob hashes are verified against the uploaded tree before updating main. This remains a browser-local prototype without shared cross-device data or server-side authorization. Bank-specific Urgent Pay CSV acceptance remains unverified; the earlier legacy LSL-date report remains unconfirmed. See the release and implementation notes for scope.
