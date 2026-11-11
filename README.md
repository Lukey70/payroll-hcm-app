# Payroll/HCM App v1.2.14

Static payroll/HCM application for GitHub Pages. Open `index.html` or serve the repository root with a static web server. Upload the complete root application files together so the browser loads matching versions of every script. The release uses no build step or external runtime CDN.

The app stores payroll data in the browser's localStorage. Export data before replacing files or changing browsers/devices. Browser data is not automatically shared between users or devices. Portal permissions and support notifications operate within that saved browser dataset; this prototype does not provide server-side authentication, authorization or real-time cross-device messaging.

Default test password: `1234`. Existing stored credentials remain in use. New installations contain no demonstration employees.

## v1.2.14

- Payroll can return selected manager request fields for correction on the same case. Managers update only those fields; Payroll reviews the changes before saving revised Job Data.
- Create linked Job Data drafts from manager commencement, variation, movement and termination requests. Fixed-term expiry and termination start the day after the last working day; temporary returns use the requested return effective date.
- Job Data keeps separate unsaved row drafts while switching rows, records or employees. Due expiry, return and corrected rows are checked before finalisation.
- After the last required Job Data row saves, Payroll can explicitly resolve the request with an editable note prefilled with the Perth processing date.
- Casual Input shows pay estimates before saving, possible duplicates, permanent references and payment status by work date. Payroll has a dedicated review list; instance numbering starts at 1 for each distinct work date.

See RELEASE-NOTES-v1.2.14.md, TEST-RESULTS-v1.2.14.md and IMPLEMENTATION-NOTES-v1.2.14.md.

## v1.2.13

- Relief-style Casual Input in Payroll Tools and MSS Payment Processing, with employee/position replacement details, daily schedules, history and automatic pay-period routing.
- Casual earnings are read-only in Additional Earnings. Select an employee and record for other earnings; manage casual earnings through Casual Input.
- Managers cannot delete casual input after its payment is finalised. A prefilled Payroll support request is available; Payroll retains deletion and recovery authority.
- Structured manager requests include Record Number, single-record defaults and New Concurrent Record for commencements. Requests remain instructions for Payroll processing.
- Casual Job Data uses the configured Casual position with no Reports To. Multi-record calendars show NRD before non-casual commencement.

See RELEASE-NOTES-v1.2.13.md, TEST-RESULTS-v1.2.13.md and IMPLEMENTATION-NOTES-v1.2.13.md.

## v1.2.12

- Exclude casual-only employees and casual job records from Book Leave in Payroll, ESS and MSS. Leave validation rejects all leave types against casual dates, including unpaid leave and ranges crossing into casual employment. Existing leave history is retained.
- Absence calendars use only employed non-casual records. Casual rosters and historical casual bookings do not change work hours, leave colours or non-rostered days. Employees with contract records display those records’ schedules and leave; managers who supervise only the casual record do not see them on the leave calendar. Casual-only yearly views show no calendar grid.
- Clearer commencement, variation, movement and termination request sections. Submitted dates, including dates of birth and return dates, use DD/MM/YYYY. Position names accompany position/reporting numbers where available; TFNs remain masked.
- Optional Preferred Name in new-employee commencement requests, retained separately from legal names. Existing-employee requests continue to use automatic identity.
- Permanent/Temporary Work Schedule Adjustment requests. Temporary changes require a later return effective date and a one- or two-week return roster. Submitted requests show both rosters and totals. These remain instructions for Payroll; requests do not automatically update Job Data.
- Seven editable starter Payroll replies: Request received, Further information required, Processing update, Commencement processed, Employment change processed, Work schedule adjustment processed and Pay enquiry reviewed. Defaults install once without replacing custom matching names or edited/inactive replies. Inserting a reply creates editable message text and does not send it automatically.

Deploy the complete matching file set. Existing browser-local data, credentials and finalised payslips are retained. Stored ISO dates are unchanged. This remains a browser-local prototype without server-side authentication or shared cross-device state. Bank-specific Urgent Pay CSV acceptance remains unverified. See TEST-RESULTS-v1.2.12.md and IMPLEMENTATION-NOTES-v1.2.12.md.

## v1.2.11

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

## v1.2.10

- Weekday timesheets default to the current pay period; future periods cannot be selected or saved. A single Flex Balance shows approved carry plus current earnings less explicit flex use, capped at 37.5 hours. Non-rostered days earn flex only above 7.5 net worked hours. Previously saved weekend records remain read-only.
- Unsaved timesheet prompts; approved leave references and missing-day warnings. Timesheets never generate pay; managers enter any payment separately in Additional Earnings.
- Extended Absences on the Payroll Dashboard and roster-based return reminders for current managers. Settings defaults: 14 calendar days for extended absence; reminders 7 calendar days before return. Checks run while the app is open and on reopening.
- Optional preferred names for app display, retaining legal names on payslips, Statements of Service/Earnings and financial records.
- On-call Allowance remains $22.50/hour with no Super Eligible option; new/open entries exclude super and finalised history is preserved.
- Shared status colours, aligned Save/Cancel actions, compact employee context headers, searchable long employee/position selectors and retained certification scroll/focus.
- Four-digit date years, report loading placeholders and data-table hover/selection outlines.

See RELEASE-NOTES-v1.2.10.md and TEST-RESULTS-v1.2.10.md. Existing browser-local storage and bank CSV limitations still apply.

## v1.2.9

- Fortnightly Personal Record Sheet with daily On/Off times, breaks, remarks, roster comparisons and manager review. Timesheets never calculate or generate pay. Managers must enter any payable additional work separately in Additional Earnings.
- Explicit Flex Time Taken, flex earned above each day's roster (including extra days), approved-only carry-forward capped at 37.5 hours and separate excess display.
- Fixed $22.50/hour On-call Allowance for new entries; finalised historical rates are preserved.
- Current/Proposed Job Data roster confirmation grids, highlighted changes, separate weeks and preserved unsaved inputs.
- Legacy hours-only time records are retained for reference and reset for actual-time resubmission. Unfinalised generated earnings are archived and excluded from pay; finalised sources and payslips are preserved.

See RELEASE-NOTES-v1.2.9.md and TEST-RESULTS-v1.2.9.md.

## v1.2.8

- Leave attachments; roster comparison; employee timesheets and manager approvals.
- Excess Leave, FTE Establishment and Recovery Statements reports; configured leave thresholds and Approved FTE.
- Dashboard acting/contract-expiry registers; probation tracking and saved Payroll support replies.
- On-call Allowance in Additional Earnings and MSS Payment Processing.
- One-time Urgent Pay post-tax deductions and Settings CSV batches, with immutable processed sources and repeat-download history.
- Required Super/Bank details for new employees, DD/MM/YYYY payslip LSL dates and Payroll-only suspension types.
- Same-day fixed-term termination/casual rehire now preserves normal final payouts and ongoing casual pay/access.

Urgent CSV columns are BSB, Account Number, Account Name, Amount and Reference. Bank-specific import acceptance is unverified without the bank's layout. The earlier stale LSL date report remains unconfirmed. See RELEASE-NOTES-v1.2.8.md and TEST-RESULTS-v1.2.8.md for scope and validation.

## v1.2.7

New-employee commencement requests include Personal, Tax, Super and Bank sections. Existing employees use their automatically populated name and employee ID; common job details and roster remain required. Requests do not create employee master records.

## v1.2.6

- Dashboard includes Unassigned, Assigned to Me and Awaiting Information support counts, linking to matching case lists. Upcoming Employee Changes lists saved commencements, terminations, contract expiries and temporary-assignment returns for the next 30 days, with links to Job Data.
- Payroll Management payslips match ESS/MSS: date-filtered list rows, a dedicated document view and Back preserving employee/date selection. The default remains the latest ten. Open payslips are visible; print/download requires finalisation and current Payroll access.
- Absence Balance uses shared cards across Payroll, ESS and MSS: Annual/Personal Leave, then LSL Pro Rata/LSL Accrued, then the entitlement date across the full width. ESS/MSS remain read-only with existing scope and pending reservations.
- Payroll Adjust Balance supports adding or taking credits and changing the LSL entitlement date, requires a comment and records an audit event. Adjustments retain precision, normal LSL accrual and finalised history. Failed storage saves roll back. Recalculate Balances was removed from the screen.
- Pay Errors uses Employee Name, Employee ID and Error Message columns. PDF download includes current-pay context, generation time, repeated table headers and pagination. Print / Save PDF supports names outside the bundled native font encoding.
- Separate adjacent leave bookings retain their own dates/hours on calculated payslips. Older merged rows display their full actual range without changing saved pay amounts.
- Requester messages or attachments return Awaiting Info cases to Open, retaining assignment and notifying the existing assignee. Payroll follow-ups retain Awaiting Info.
- Termination requests require a configured termination reason and Last Working Day; subject/description automation is retained. Home tiles show only icons and names.

## Previous release: v1.2.5

- Additional Earnings opens on the current pay period, includes a Current Pay Period button, and retains the employee and period after saving.
- Leave balances use separate cards; date filtering defaults to the previous two years with no To Date cutoff.
- Support Requests has a redesigned list, grouped request forms, case details, attachment previews, newest-first conversations and activity history.
- Payroll can open Support Requests in a separate window. It shares the parent application's live state and saves through the parent, preserving unrelated unsaved forms. The parent must remain open and signed in; access loss locks the support window. Unsent support drafts are preserved during background refreshes.
- Every portal uses the shared right-side Notifications pane. Notifications have individual dismiss buttons, per-user read state and links to the relevant employee, request or page. Ten-second notification popups remain available.
- ESS and MSS payslips use date-filtered list rows. Clicking a row opens the document; Back returns to the same list/filter. Open payslips remain visible, with print/download restricted to finalised pay.
- Manager Job Data support requests use automatic “[Request Type] Request” subjects without requiring a description. Commencement, Movement and roster variations use daily one-week/two-week roster grids; casual rosters follow Job Data rules. Commencement and Movement reporting positions derive from Position Data. Termination requires only Last Working Day. Additional Comments and attachments remain optional.
- New home icons identify Payroll Management, ESS and MSS. MSS cannot create, change, convert or delete Overpayment Adjustments; saving ordinary earnings preserves Payroll adjustments and leave cash-outs.

## Previous release: v1.2.4

- Dashboard is the first Payroll Management tab and contains the four pay summary cards.
- Reports use five tiles: Statement of Service, Statement of Earnings, Monthly Absence Calendar, Position Structure Report and Pay Errors. Error checking moved out of Settings.
- Statement of Earnings previews and downloads a branded A4 PDF of regular fortnightly gross income using the employee's effective roster and pay rate. Both weeks of a two-week roster are included. Bonuses, reimbursements, overtime, arrears and other one-off entries are excluded. Casual employees have no guaranteed regular earnings statement. Fonts are bundled for consistent native PDF output; their license is in `PDF-FONT-LICENSE.txt`. Print / Save PDF is also available and preserves characters outside the native PDF font encoding.
- Leave opens for one selected employee with employee search, date/type/status filters, balances and the existing yearly calendar. Company-wide monthly reporting remains in Reports.
- Payroll can book unlimited paid Workers Compensation Leave. Payslips display Income Compensation Payment and calendars group it as Other Leave. It does not consume Annual, Personal or Long Service Leave credits. ESS and MSS cannot book this type.
- Salary Packaging - Pre-Tax and Salary Packaging - Post-Tax deductions reduce the respective tax/net bases and are excluded from employee super contributions.
- Redundant, Dismissal and Ill Health termination reasons pay accrued Annual Leave and LSL, without pro-rata LSL.
- Annual Leave and Long Service Leave cash-outs are entered in Payroll Additional Earnings. Existing cash-out records are mirrored there once while their original payment/balance ledger remains authoritative. Finalised cash-outs are read only. Cash-outs do not create calendar absences. New cash-outs require available credits in the current open pay period; MSS cannot enter them.
- MSS managers can submit Commencement, Variation, Movement and Termination support templates with Additional Comments and attachments. These requests do not apply Job Data changes automatically; Payroll processes them. General support requests remain available in the existing portals.
- Support cases show read-only activity history, including assignments, status changes, messages, resolutions, reopening reasons and automatic closure.
- Login eligibility recognises an effective saved casual commencement when older master fields are stale, without requiring a substantive position or ongoing roster. Later terminations still block access. The reported casual scenario was recreated in tests; no live employee database is bundled.
- Trial selected-employee banner, inline validation, shared form sections, SVG icons and sticky table headings. Failed new cash-out validation retains the draft entries.

## Validation

Run all ten calculation/service/DOM regression suites with Node.js:

```sh
npm test
```

For browser checks, install the development dependency and Chromium, then run:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

An existing Chromium executable can be selected using `PAYROLL_CHROMIUM_PATH`. Browser QA files are written to `tmp/browser-qa` by default; `PAYROLL_QA_OUTPUT` can change that destination. Browser tests use synthetic employees and browser-local storage only. `TEST-RESULTS-v1.2.8.md` records the release checks and their limits.

Two historical payroll engine fixtures under `tests/` support regression checks for already-paid casual earnings and settlement compatibility. They are test references and are not loaded by the app.
