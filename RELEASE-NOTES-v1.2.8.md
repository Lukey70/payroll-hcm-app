# v1.2.8 — 7 November 2026

- Added supporting documents to Payroll, ESS and MSS leave bookings/requests. Files are scoped to Payroll, the employee and current direct-report managers; failed saves roll back booking and attachment changes.
- Added Excess Leave, FTE Establishment and Recovery Statements reports with Print / Save PDF. Excess-leave thresholds start blank for Payroll to configure. Approved FTE is maintained in Position Settings; casuals have zero guaranteed FTE.
- Job Data roster changes now show old/new daily hours for both weeks and average weekly hours before confirmation.
- Implemented fortnightly employee timesheets, manager approval/denial and notifications. Approved hours enter Additional Earnings once. Casuals enter Casual Earnings; other employees enter extra hours/overtime because their normal rostered pay is automatic. Denial requires a comment, and approved/finalised records cannot be withdrawn by employees.
- Added On-call Allowance to Additional Earnings and MSS Payment Processing, with hours, an hourly allowance rate, automatic amount and explicit super eligibility. It does not accrue leave. There is no separate On-call tile.
- Added the current/upcoming Acting Assignment Register and grouped Contract Expiry to the Dashboard, plus due/overdue probation reviews.
- Added Payroll Tools for probation review dates/completion, shared Support Response Templates and the timesheet register. Saved replies insert into the message composer for review before sending.
- Added Urgent Pay as a fixed, one-time post-tax deduction. Settings → Run Urgent Pay Cycle previews saved entries, generates a CSV payment batch and locks processed deductions. Frozen batch history can be downloaded again without creating a second batch. No separate payslips are generated.
- Urgent Pay checks bank details, available normal net pay, stale previews and duplicate IDs; failed saves leave deductions unlocked. Unprocessed urgent entries block normal pay finalisation. CSV columns: BSB, Account Number, Account Name, Amount and Reference. Generating a file does not upload it to the bank.
- New employee creation now requires active Super and Bank details, saved together with the employee. Initial effective dates default to the current pay-period start, with current/future period starts available and sequence 0.
- Payslip LSL entitlement dates now display DD/MM/YYYY. Added Payroll-only Suspension with Pay and Suspension without Pay; both appear as Other Leave on calendars. Unpaid suspension follows the app's existing LWOP accrual/LSL treatment.
- Fixed same-day fixed-term termination followed by Rehire Casual at a higher sequence. Normal final leave payouts are retained, casual employment remains active, and casual earnings and ESS continue after finalisation. Completed service is reconstructed from saved Job Data where necessary; only non-casual work accrues leave in a mixed employment pay period. Existing finalised payslips are preserved.

Validation is recorded in TEST-RESULTS-v1.2.8.md. The complete matching file set must be deployed together. Existing browser-local payroll data and stored credentials are retained.

Known limits: the reported LSL entitlement date remaining extended after replacing LWOP with Annual Leave has not been reproduced on a fresh record and is not claimed fixed. Urgent Pay CSV bank acceptance has not been verified without the receiving bank's import layout; Payroll must match that layout before uploading a payment file. Tests use synthetic data, and no payment file has been uploaded to a bank.
