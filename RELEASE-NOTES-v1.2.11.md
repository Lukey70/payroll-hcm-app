# v1.2.11 — 8 November 2026

- Concurrent job records under one employee ID, with their own Job Data, roster, rates, reporting, additional earnings, leave booking attribution, Cease Pay and termination. Existing data defaults to Job 0.
- Shared Annual, Personal and LSL balances in hours. Accruals follow each eligible job; overlapping appointments do not double-count LSL service. Ending the last non-casual record pays eligible leave even if casual employment remains active. Positive Personal Leave is not paid out.
- Deductions belong to a selected job record, including record-specific percentage bases and recovery limits. Existing untagged deductions belong to Job 0. Tax is calculated across combined employee earnings; bank, super, personal and tax details remain shared.
- Separate non-casual job/position payslips; casual earnings remain consolidated. Manager access follows the relevant job. Statements of Service use the exact job record number, including Job 0, for service and LWOP.
- Job Data Variation reasons Cease Pay and Return from Cease Pay; effective-dated holds, backdated return arrears, held-date Pay Errors and final-pay safeguards.
- Termination recovery of negative Personal Leave, accrued LSL and pro-rata LSL under the configured application rules, without rewriting historical finalised payslips.
- Payroll Tools Manager Delegation for pending leave/timesheet approvals, with dated coverage, reason, expiry/revocation and recorded decision actors.
- Support search includes descriptions and message content. Fixed employee support submission after a Payroll session. Negative-net warnings and once-only recovery-completion notifications to Payroll.
- Labelled Job Data row controls and confirmation before deleting saved or draft rows. Removed the On-call hourly-rate input; calculation remains $22.50/hour. STP2 tile remains removed.

Deploy the complete matching file set. Existing browser-local data, credentials and finalised payslips are preserved. This remains a browser-local prototype; it does not provide server authentication or shared cross-device state. Bank-specific Urgent Pay CSV acceptance remains unverified. Timesheets never generate pay. See TEST-RESULTS-v1.2.11.md for validation and IMPLEMENTATION-NOTES-v1.2.11.md for implementation details.
