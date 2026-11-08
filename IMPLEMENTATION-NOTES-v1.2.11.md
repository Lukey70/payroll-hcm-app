# v1.2.11 implementation

## Hide on-call hourly rate field

Removed the Allowance per hour field from On-call Allowance entry rows in Payroll Additional Earnings and MSS Payment Processing. Hours and the calculated amount remain; the configured $22.50/hour calculation and finalised history are unchanged. Included in v1.2.11.

STP2 tile and blank page were removed at Luke’s request. No STP functionality was introduced.

## Employee support submission permission fix

Reproduced ESS submission failing with Payroll Management access required after a previous Payroll support session. A hidden/cleared Payroll support UI remained cached and its refresh threw after the case had already been persisted, rolling the visible state back. Support change refreshes now run only for a populated view in the currently visible portal, with Payroll role checks for the Payroll view. Existing submit/assignment/access restrictions remain intact.

Regression checks cover ESS and non-Payroll MSS submissions after a Payroll session, persisted/visible case consistency and receipts, failed-save draft retention/rollback and restricted Payroll actions. Included in v1.2.11.

## Negative Personal and Long Service Leave recovery

Termination calculations now recover the remaining negative Personal Leave, accrued LSL and pro-rata LSL balances after current-pay accrual/usage and corrections, for all termination reasons on non-casual service. Separate negative earnings lines use the applicable final hourly rate: Personal Leave Overuse Recovery, Long Service Leave Overuse Recovery and (when relevant) Pro-rata LSL Overuse Recovery. They do not accrue leave or super. Positive Personal Leave remains unpaid on termination; existing annual/positive LSL payout rules are retained.

LSL deficit detection reads the signed service ledger rather than the displayed zero clamp. Recoveries credit the corresponding balance back to zero, feed the finalised service/usage history, and are excluded from ordinary retro generation. Zero-gross final pays with recovery rows are retained so settled balances commit. Same-day higher-sequence casual rehire keeps the earlier non-casual recovery and later casual pay active. Existing finalised historical payslips are not rewritten and the new rule does not add recovery to old finalised pays. Included in v1.2.11.

Validation: all 15 Node suites and 17 Chromium browser suites passed. The new recovery suite covers 11 groups including termination reasons, final-period leave/accruals, separate LSL deficits, zero-gross final pay, multiple positions, same-day casual rehire, historical finalised pays and export/import. Browser checks verified the actual Job Data termination, payslip recovery layout, finalisation, zero settled balances, no repeat recovery and reload persistence.

## Support search, payroll checks and manager delegation

Support request search now matches case numbers, subjects, descriptions and message text, as well as existing employee/status fields. It is case-insensitive, trims outer whitespace and respects the current status/assignment filters and own-case permissions in ESS/MSS. Payroll can search all permitted cases, including in the separate support window.

Negative net pay checks now include the shortfall, pre/post-tax deduction totals and negative recovery earnings, including final pay for terminated employees. These appear in Pay Errors and the finalisation confirmation. The warning remains advisory; existing recovery deduction caps and payment calculations are unchanged.

Finalised Recovery Deduction repayments now create a Payroll-only completion notification when a positive remaining debt reaches zero. Preview/calculation does not notify or settle debt. Each final repayment is committed once; notifications open the employee's Recovery Statement. Existing completed historical debts do not produce retrospective completion alerts.

Payroll Tools now includes Manager Delegation. Payroll selects the original and covering managers, inclusive start/end dates and a mandatory reason. Both require active MSS access; past starts, self-delegation, overlapping coverage for the same manager and circular arrangements are rejected. Pending leave/timesheet approval authority and notification recipients follow current dates/reporting relationships. There is no chained delegation and no self-approval. The original manager retains authority. Coverage expires automatically or Payroll can end it early; records and decision actors remain in history. Delegation grants no additional Direct Reports, payslip, employee-detail, payment-processing, certification, leave-booking or approved-leave cancellation access. Evidence is available only while the relevant leave awaits the delegate's approval. Failed saves roll back state and retain the form.

The standalone pay-hold proposal was superseded by the effective-dated Job Data Cease Pay / Return from Cease Pay rules below. Included in v1.2.11.

Validation: all 16 Node suites and all 18 Chromium browser suites passed. New coverage includes 11 rule groups plus real Payroll/ESS/MSS workflows, delegation creation and failed-save rollback, start/end and early revocation, future role changes, evidence access, timesheet decisions without pay changes, unchanged direct-report access, scoped description/message search, negative-net warnings at reporting/finalisation, once-only debt completion alerts, direct Recovery Statement navigation, reload persistence and desktop/mobile layouts. Changed JavaScript files passed syntax checks.

## Job Data Cease Pay and Return from Cease Pay

Added Cease Pay and Return from Cease Pay under Variation in Job Data and the shared reason catalogue. Cease Pay stops earnings from its effective date (inclusive); Return resumes from its effective date (inclusive). Rows use effective sequence for same-day changes, survive unrelated variations and reset on a genuine new hire/rehire. Returns require a preceding cease row and duplicate effective date/sequence entries are rejected.

Pay controls are separate from assignment, roster, pay-rate and employment-status records. The form displays the underlying roster read-only and creates no derived schedule/rate records. ESS/MSS eligibility, reporting relationships, acting/substantive rates and LSL service dates continue under their existing rules. Pay controls do not represent LWOP or termination. Failed saves roll back the new/edited row and retain entered details.

Regular pay, paid leave, public holidays, higher duties, additional earnings and cash outs are withheld on held dates. A fully held cycle creates no payslip, deduction, super or recovery repayment for that employee. Paid-leave accruals and leave usage only settle when the related pay is processed. Additional Earnings entries spanning held and payable dates are withheld and flagged for manual splitting rather than guessing the allocation of entered hours/amounts.

A backdated return recalculates the restored source dates through the existing cumulative arrears engine, including casual earnings and leave usage/accrual corrections, without rewriting closed payslips or repeating settled arrears. Dates between cease and return remain unpaid. Backdated cease changes can create negative corrections after pay resumes. Finalised cycles retain held-date markers so a cash out that was never paid can be restored once after a backdated return; deleting an unpaid held cash out does not produce a recovery. An unpaid termination final pay must have Return covering its last payable date before finalising, preventing final entitlements from becoming stranded in a closed cycle.

Validation: all 17 Node suites and all 19 Chromium browser suites passed, including 13 new rule groups and the actual Job Data/ESS/payslip/finalisation flow. Coverage includes partial/full holds, future and same-day changes, legacy rosters, acting/reporting continuity, invalid returns, failed-save rollback, backdated regular/casual/leave/cash-out payments, final balances, no repeat after finalisation/reload, final-pay checks and mobile layout. The read-only roster display refinement passed an additional targeted Chromium run. Included in v1.2.11.

## Current-period Cease Pay warnings

Pay Errors explicitly lists the employee name/ID and held dates within the current pay period for full or partial Cease Pay, including holds starting in earlier periods and active legacy casual records. Future-only holds and holds ended before the current period are excluded. Verified with all 14 Cease Pay rule groups and the real Pay Errors browser flow, including report name, ID and held-date text. Included in v1.2.11.

## Job Data row toolbar and deletion confirmation

Replaced the compact symbol-only strip with labelled Change Employee, Add Row and outlined Delete Row actions, shared SVG icons, and a separate row-navigation group. The current row count and unsaved-row status are clear; unavailable navigation/delete buttons are disabled. The layout stacks cleanly on narrow screens.

Deleting both saved and unsaved rows now opens an explicit Are you sure confirmation showing the employee, effective date/sequence and action/reason. Cancel preserves the row and form. Saved-row deletion recalculates pay, removes linked rate/schedule/event records, persists atomically and rolls back if saving fails. Unsaved rows are discarded only after confirmation. Included in v1.2.11.

Validation: all 17 Node regression suites passed. The new toolbar/deletion Chromium suite and the existing Cease Pay and shared UI browser suites passed. Desktop/mobile screenshots were reviewed; checks cover row boundaries, both confirmation paths, cancellation, failed-save rollback, linked-record cleanup and reload persistence.

## Concurrent job records and shared leave

Employees can hold multiple concurrent appointments under one employee ID. Existing data uses Job Record 0 by default; adding a second record preserves its employment snapshot and creates an independent empty record for a new Commencement. Job Data has a record selector and Add Job Record action. Effective dates/sequences, rosters, rates, movements/acting, Cease Pay and terminations are scoped to the selected record. Derived rate/schedule rows carry the record number. Bank, super, tax and personal details remain employee-wide. Deductions belong to a selected job record.

Payroll calculates source earnings and cumulative arrears by record, then calculates combined employee withholding and record-specific deductions before allocating the result across payslips. Non-casual records retain separate position payslips; casual earnings retain one consolidated casual payslip. Payslips/list rows identify their contributing record numbers, and frozen source snapshots preserve each job's employment context. Existing untagged historical rows belong to Job 0 and are not rewritten.

Annual, Personal and LSL balances are shared in hours. Paid-service accrual and leave bookings remain attributable to the selected job and its roster. Leave on separate jobs can occupy the same date, but pending/approved bookings reserve the shared capacity across records. LSL service uses the union of non-casual service periods rather than counting overlapping appointments twice; leave in one job does not create a whole-employee non-contributory service interval while another ongoing job is working. Ending one ongoing job retains shared credits while another ongoing job remains. The last ongoing job's final pay uses the existing payout/recovery rules and its closing rate. A casual record can remain active after that payout.

Payroll Additional Earnings has per-row job selection; MSS only edits records reporting to that manager. Payroll/ESS/MSS leave requests select the job, calculate its roster hours and route to its current manager/delegate. Managers cannot approve, delete or edit another job's bookings/earnings, including attempts to relabel an existing earnings ID. Direct-report job summaries and non-casual payslips are scoped. The existing consolidated casual payslip remains visible to current Reports To managers for its contributing casual records. Certification retains shared manager sign-off for those consolidated casual slips.

FTE establishment, earnings statements, acting/expiry registers, calendars and extended-absence/return reminders account for individual appointments. Employee/portal access remains active while an eligible record is active, and permissions cease when the record granting them ends. Saved/exported records retain one employee identity and one set of payment accounts. Included in v1.2.11.

Validation: all eighteen Node regression suites passed, including nineteen concurrent-job rule groups, and all twenty-one Chromium browser suites passed on the final source. Changed JavaScript syntax checks passed. Desktop and mobile screenshots were reviewed for the job selector, roster form and manager earnings screen.


### Concurrent-record clarification — leave payout and record deductions

Confirmed and expanded coverage: terminating the final non-casual record pays shared Annual Leave and eligible LSL under the existing termination rules even when casual records remain active. The casual record retains ESS access and can receive later casual earnings, without repeating the leave payout.

Deductions now belong to a job record. Payroll selects the record when adding a deduction, and the table displays it for concurrent employees. Untagged existing deductions belong to Job 0. Fixed deductions appear only on payslips for the assigned record; percentage deductions use its own earnings/net base. Tax remains calculated across the employee’s combined earnings. Recovery is capped by the assigned record’s available net and cannot consume another record’s pay. A held or unpaid record does not transfer its deductions to a paid record. Casual deductions remain attributed to their originating record on the consolidated casual payslip. Bank/super accounts remain shared. Included in v1.2.11.


Statement of Service Job Number now exactly matches the job record number (including Job 0), rather than numbering positions or adding one. Service History and Leave Without Pay both use that same record number.

Validation for these clarifications: all eighteen Node regression suites passed, including twenty-two concurrent-job groups; the concurrent-job Chromium workflow passed with deduction selection/payslip isolation and exact Statement of Service record numbers, and the Urgent Pay Chromium workflow passed. Changed JavaScript syntax checks passed.
