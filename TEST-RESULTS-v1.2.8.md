# v1.2.8 validation — 7 November 2026

## Automated regression

npm test passed all thirteen Node.js suites. The runner now provides a repository-owned fixed reference date (24 October 2026) for fixture-driven tests, so results do not depend on the execution machine's date.

Coverage includes the existing core payroll calculations, bank/super/recovery controls, self-service permissions, support/certification, historical update rules, structured request templates, Dashboard, balance cards and Pay Errors. New coverage includes:

- 12 operations groups: attachment validation and scoped retrieval; configured excess thresholds; same-day/two-week roster comparison; occupied/approved FTE; current/upcoming/ended acting assignments; contract expiry buckets; recovery history; probation/reply validation; on-call calculation; timesheet draft/submission/denial/resubmission/withdrawal, current-manager scope, approval-time revalidation, duplicate-approval prevention, source earnings, finalised locks and export/import preservation.
- 7 urgent-pay/on-call groups: one-period post-tax effects with unchanged gross/tax/super; valid bank details; positive fixed amounts; immutable batch snapshots; no repeat processing; stale previews/drafts; duplicate IDs; failed validation without partial source locks; finalisation controls; real deduction form staging; and manager-scoped On-call Additional Earnings.
- 4 same-day casual rehire groups: sequence-aware reconciliation and historical service reconstruction; AL/accrued LSL payouts matching a normal fixed-term termination; no personal/pro-rata LSL payout; mixed non-casual/casual source accrual; ongoing casual earnings; finalisation/zero paid-out balances; no repeat payout next period; import/access continuity; and a later higher-sequence termination still taking effect without cancelling the old final payout.

## Browser verification

PAYROLL_CHROMIUM_PATH=/tmp/chromium npm run test:browser passed all ten suites using Playwright 1.62.1 and Chromium 153:

1. Existing Payroll workflows, eight report tiles, earnings PDF/print, leave, compensation, salary packaging, cash-outs, support requests and casual login.
2. Support companion window/state, failed saves, notifications and ESS/MSS payslip navigation/finalisation controls.
3. Structured manager request templates, rosters, automatic identity, new employee details, TFN masking, fund lookup and mobile layout.
4. Dashboard counts/navigation, upcoming Job Data rows, refresh and mobile layout.
5. Payroll payslip rows, recent-ten/range filters, dedicated view, Back, finalised export guards and mobile layout.
6. Shared Payroll/ESS/MSS absence cards, signed credit/date changes, comment validation, retained selection and read-only scope.
7. Pay Errors structured identities, actual table, native PDF download, print view, Unicode fallback and export permissions.
8. New operations: reports/thresholds/FTE/recovery print; On-call entry in Additional Earnings; probation completion; saved reply insertion/sending; certificate upload/download; roster confirmation before persistence; employee timesheet submission; manager approval; source earnings preservation; desktop/mobile layouts.
9. Urgent Pay: one-time dates, editable pre-run amount, Settings preview, failed-save rollback, actual CSV download, preserved leading zeros/quoted names, frozen bank snapshot, identical re-download, exclusion of processed records, read-only sources and no extra payslips or pay-period advancement.
10. Actual Job Data sequence-0 fixed-term termination and sequence-1 Rehire Casual, unchanged final leave payouts, casual earnings, finalisation, persisted reload and casual ESS payslip access.

No JavaScript page errors were reported. Relevant desktop Dashboard and mobile operations/urgent-pay screenshots were inspected. Test screenshots, generated CSVs and other temporary QA outputs are excluded from the release.

## Packaging and limits

All 41 root/test JavaScript and CommonJS files passed node --check. Application/package/latest-version metadata and all versioned HTML assets were verified as 1.2.8, and referenced local scripts exist. Git blob hashes are checked for every local release file before moving main, with untouched repository files preserved.

Tests use synthetic employees. No bank upload was performed. Urgent Pay exports the documented five-column CSV, whose compatibility with a particular bank is unverified until its import layout is supplied. The reported stale LSL entitlement date after replacing LWOP with Annual Leave remains unconfirmed and is not claimed fixed. Existing finalised payroll snapshots are not rewritten.
