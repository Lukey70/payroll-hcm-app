# v1.2.12 implementation

## exclude casual records from leave bookings

Payroll Book Leave excludes casual-only employees and hides the booking action for a selected casual-only employee. Payroll, ESS and MSS job selectors exclude casual records and default to an available non-casual record, including when Job 0 is casual. MSS Request Absence excludes employees for whom the manager only owns casual records. Casual ESS shows no booking form. Leave history, balances and other employee access remain available under existing permissions.

Validation rejects all leave types on casual dates, including unpaid types and a booking spanning a change into casual employment. Existing historical bookings are retained. Included in v1.2.12.

Validation: all 18 Node suites passed, including 24 concurrent-job groups. The new Payroll/ESS/MSS casual-booking browser check and existing concurrent-job browser workflow passed. Changed JavaScript passed syntax checks.

## exclude casual records from absence calendars

Calendar status combines only employed non-casual records on each displayed date. Casual rosters and legacy casual leave cannot colour cells, add work hours or suppress the contract record’s non-rostered days. Dates outside contract employment remain blank when only casual service remains. Monthly calendars exclude casual-only employees, including managers who only supervise the casual record. Yearly calendars show no grid when the selected employee has no non-casual service in that year. Payroll, ESS and MSS reuse the same rendering rules; history is retained. Included in v1.2.12.

Calendar validation: all 18 Node regression suites passed, including 25 concurrent-job groups. The Payroll/ESS/MSS browser scenario verified casual-only exclusion, contract-only work/non-rostered/leave cells, manager record scope and yearly casual-only exclusion.

## readable Job Data support requests

Submitted commencement, variation, movement and termination requests group employment details, dates, positions, employee details and proposed changes in labelled sections. Position/reporting numbers display their position names where available. Comments and work schedules have distinct sections; TFNs retain masking. Request dates, including nested new-employee dates of birth, display as DD/MM/YYYY. Support timestamps use padded day/month and four-digit years. Stored ISO dates and request processing are unchanged. Included in v1.2.12.

Support layout validation: all 18 Node suites passed. The structured-request Chromium workflow verified all four request types, exact DD/MM/YYYY dates and date of birth, unchanged ISO storage, Payroll and MSS case views, TFN masking, roster display and mobile containment. Desktop and mobile screenshots were reviewed.

## preferred name in commencement requests

New-employee commencement requests include an optional Preferred Name field in Personal Details. Submitted requests retain and display the trimmed preferred name separately from legal First Name and Last Name. Existing-employee requests still use automatic employee identity and do not collect new personal details. Included in v1.2.12.

Preferred name validation: all 18 Node suites passed, including optional/trimmed preferred-name storage, invalid/overlong value rejection and existing-employee isolation. The structured-request browser workflow passed with optional-field entry, saved/displayed preferred name, preserved legal names and automatic existing-employee identity.

## temporary Work Schedule Adjustment support requests

Managers can mark a Work Schedule Adjustment as Permanent or Temporary. Temporary requests require a return effective date after the initial adjustment and a complete return roster, using one- or two-week daily-hour grids with totals. The submitted request clearly shows adjusted and return rosters and DD/MM/YYYY dates. Permanent and legacy requests do not require return details; hidden return values are omitted from permanent submissions. Requests remain instructions for Payroll and do not modify Job Data automatically. Included in v1.2.12.

Temporary-roster validation: all 18 Node suites passed, including request round-trip preservation and unchanged Job Data, missing/invalid/non-later return dates, incomplete/negative/zero return hours, alternating patterns, legacy requests and omission of stale return data on permanent changes. The structured-request browser workflow passed temporary/permanent toggling, return date validation, separate two-week totals, both saved roster tables, DD/MM/YYYY display and mobile containment. Desktop layout was visually reviewed.

## starter Payroll reply templates

Added seven editable active replies: Request received, Further information required, Processing update, Commencement processed, Employment change processed, Work schedule adjustment processed and Pay enquiry reviewed. They are available in Payroll Tools → Support Response Templates and the case composer’s Saved Payroll Reply picker. New and existing datasets receive defaults once. Custom matching names, edited/inactive replies and later removals are preserved; insertion remains an editable draft and sends nothing automatically. Included in v1.2.12.

Starter reply validation: all 18 Node suites passed, including one-time installation for existing datasets, custom-name preservation, independent new-dataset defaults, edited/inactive/removed reply preservation and export/import. The operations browser workflow verified seven defaults, Payroll editing and persistence, inserting a starter into an editable unsent message, and the existing custom reply/send workflow.

## Release verification

All 18 Node suites, all 22 browser suites and 62 syntax checks passed. Reload-persistence browser checks now use a local HTTP server; the concurrent workflow additionally verifies saved records before reload and passed three extra runs. See TEST-RESULTS-v1.2.12.md for validation and the initial file-origin test result.
