# v1.2.8 implementation notes

Included in v1.2.8. See the release and validation notes for the published scope.

## Requested operations additions — 7 November 2026

- Leave attachments in Payroll, ESS and MSS: optional supporting documents at booking/request submission; up to five files, 1 MB each and 2 MB total. Payroll, the employee and current direct-report managers can download the booking's files. Evidence Provided remains a separate explicit selection. Failed saves roll back the booking and its files.
- Excess Leave Report: configurable thresholds in hours for Annual, Personal, LSL Accrued and LSL Pro Rata. All thresholds start disabled until Payroll configures them. Reports use current recorded balances, excluding the open pay's projected accrual. Print / Save PDF is available.
- Roster comparison: compare both weeks and average weekly hours before Job Data roster changes are saved; confirm or return to the unsaved form.
- Fortnightly timesheets: employee drafts, submissions, withdrawal before approval, manager approval/denial with mandatory denial comment, notifications and history. Managers can see their current direct reports only. Approved hours create protected Additional Earnings once. Casuals enter Casual Earnings; other employees enter additional hours or overtime because normal rostered earnings remain automatic. Finalised periods cannot receive new or changed timesheets. The Operations Manager's own timesheet follows the existing automatic approval rule.
- On-call Allowance is an Additional Earnings type in Payroll and MSS Payment Processing. Enter dates, hours and an hourly allowance rate; the amount calculates automatically. Super eligibility is explicit and no leave accrual is generated. Existing Additional Earnings date/permission/save/retro rules apply. The standalone Payroll Tools tile was removed at Luke’s request.
- Recovery Statements in Reports: opening debt, finalised repayment history and remaining debt, with Print / Save PDF. Payroll selects the employee.
- FTE Establishment Report: actual occupied FTE versus Approved FTE in Position Settings. Acting employees occupy their actual position; casuals have zero guaranteed FTE. Unconfigured capacity is distinguished from zero. Historical occupancy uses the selected date; approved capacity is the current position configuration.
- Dashboard Acting Assignment Register: current and upcoming saved acting movements, expected end dates where known, with ended assignments excluded.
- Dashboard Contract Expiry: Expired, Within 30 days, 31–60 days, 61–90 days and Over 90 days groups, using authoritative fixed-term expiry dates.
- Probation Tracking in Payroll Tools: start/review dates, Scheduled/In Progress/Extended/Completed statuses, completion date, notes and audit entries. Due/overdue reviews appear on the Dashboard.
- Support Response Templates in Payroll Tools: create/edit/deactivate shared Payroll replies, insert them into a case's message composer, then review and send using normal support permissions and notification routing.

## Urgent Pay — replaces the off-cycle proposal

Luke chose a post-tax Urgent Pay deduction and CSV output instead of separate off-cycle payslips.

- Urgent Pay is a fixed, one-time deduction for a single current/future pay period, automatically end-dated to that period. It offsets an advance against the normal net pay; it does not add taxable earnings or change gross/tax/super.
- Payroll can edit its amount or delete it before processing. Settings → Run Urgent Pay Cycle previews all saved, unprocessed Urgent Pay deductions for a selected open period and payment date.
- A successful run stores a batch with frozen employee, amount and bank details, generates a CSV and locks every included deduction against editing, deletion or stale-draft overwrites. Failed saves roll back the whole batch and leave deductions unlocked.
- CSV columns are BSB, Account Number, Account Name, Amount and Reference. Account strings preserve leading zeros and fields are quoted. Bank-specific import acceptance is not verified without the bank's CSV layout/specification.
- Missing/invalid bank details, stale previews, duplicate IDs and insufficient regular net pay block processing. The regular pay cannot be finalised with unprocessed Urgent Pay deductions.
- Batch history re-downloads the exact frozen CSV without creating a second payment batch. Bank-detail changes after processing do not alter the saved file.
- This creates a file only; Payroll uploads it through the bank separately. No additional payslips are generated and the normal pay period is not advanced by the urgent run.

## Earlier unreleased changes retained

- New employee creation requires valid active super and bank details, saved together with the employee. Current/future pay-period starts and initial sequence 0.
- Payslip LSL entitlement date displays DD/MM/YYYY.
- Payroll-only Suspension with Pay and Suspension without Pay. Paid suspension uses no leave credits; unpaid suspension follows current LWOP accrual/LSL treatment; both display as Other Leave on calendars.

## Outstanding earlier issues

- Same-day fixed-term termination followed by Rehire Casual sequence 1 is fixed in v1.2.8. Normal Annual Leave/accrued LSL payouts remain, the casual employment stays active and finalisation does not duplicate payouts. Node and actual Job Data browser checks cover the transition and subsequent ESS access.
- Stale LSL entitlement date after replacing LWOP with Annual Leave: not reproduced on a fresh record and not claimed fixed.

## Validation

All thirteen Node regression suites passed using the existing fixtures' fixed date of 24 October 2026, including twelve operations groups and seven urgent-pay/on-call groups. Focused Chromium workflows passed for urgent-pay creation/editing, failed-save rollback, CSV download, frozen bank snapshots, exclusion of repeat payments and source locks; the revised Additional Earnings on-call workflow also passed. Current browser and syntax-check results are recorded in TEST-RESULTS-v1.2.8.md.

Existing operation coverage includes attachment upload/download, roster confirmation, reports and thresholds, recovery printing, probation, replies, employee timesheet submission, manager approval, scoped access and protected generated earnings. Test data is synthetic; no bank upload has been performed.
