# v1.2.13 implementation

The following completed draft work is included in v1.2.13. References to unreleased status describe development history.

# Development status

## Unreleased — NRD before commencement with multiple job records

When a calendar row has no employed non-casual job on a date before a relevant non-casual commencement, show NRD rather than an empty cell. Public holidays retain the existing single-record calendar styling. These cells have zero hours and do not create employment. Payroll/ESS/MSS share this calculation. Monthly inclusion still requires actual non-casual employment in that month; casual-only records, their rosters and legacy casual leave remain excluded. Dates after the last contract ends remain blank when only casual service remains. No version generated or uploaded.

Validation: all 18 Node regression suites passed, including 26 concurrent-job groups. Browser checks verified pre-commencement NRD cells in Payroll monthly/yearly, ESS yearly and manager-scoped monthly calendars, while preserving casual-only exclusions and zero pre-employment hours.

## Unreleased — relief-style Casual Input and record-specific Additional Earnings

Replaced the initial Casual Input draft with an active-casual employee picker, all saved input history, Add New and a relief detail form. Each saved input has a stable instance number, casual record, start/end dates, replacement by employee/record or by position, comments and a Schedule window with daily hours and weekly totals. Replacement by employee derives the position worked, including effective-dated assignment changes. Daily canonical earnings route to their work-date pay periods automatically; there is no pay-period picker. Save/update/delete operates on the linked source rows without duplicating earnings. Old unlinked casual earnings are retained and opened as legacy input entries.

Deleting an unpaid input removes its earnings. Deleting settled earnings generates a once-only negative retro adjustment against paid dates; unpaid dates are not recovered and finalised payslips are preserved. Validation and failed-save rollback preserve saved data and entered drafts.

Additional Earnings now selects an employee then a record number. Position and record columns are removed from the row table; Higher Duties position selection remains within the earning-type cell. Casual earnings are read-only and cannot be added, edited or deleted from Payroll/MSS Additional Earnings. Saving other earnings preserves casual rows and other records. All casual changes are processed through Casual Input.

Casual Job Data uses the configured Casual position and no Reports To, including commencement requests. The existing active position named Casual is selected automatically; Settings → Positions also allows Payroll to choose the Casual position explicitly. Casual records no longer grant direct-report visibility or generate missing-manager errors. Worked-position rates remain on Casual Input earnings, separately from the pool position. Existing finalised pay and stored historical Job Data remain intact.

No version generated or uploaded.

Validation: all 18 Node suites passed, including relief position resolution, cross-period schedules, idempotent saves, legacy migration, instance numbering, active casual eligibility, role/date/hour checks and one-time recovery only for settled dates. The complete 23-suite browser run passed after adapting superseded expectations, and targeted final checks cover history/add/edit/delete, replacement by employee/position, Schedule OK/Cancel, automatic pay-period routing, rollback/storage/draft preservation, read-only casual Additional Earnings, selected-record isolation, the correct employee banner, Casual position settings and mobile layout. Existing finalised pay is preserved.

Final compatibility checks: the updated Casual Input workflow passed after verifying the Casual position setting and preventing false unsaved-change prompts when viewing legacy casual Job Data. All 18 Node suites passed again; Job Data toolbar/deletion and shared UI browser checks passed. Changed JavaScript syntax checks passed.

## Unreleased — MSS Casual Input and structured-request record selection

MSS Payment Processing now offers Additional Earnings and Casual Input. Since casual records have no Reports To, MSS Casual Input uses the same active casual employee pool and entry workflow as Payroll; ordinary MSS Additional Earnings remains scoped to direct reports. Managers can delete unpaid inputs, but deletion is blocked in both UI and business logic once any linked earnings have been finalised. Finalised entries offer a prefilled Payroll support request instead. Payroll retains deletion/recovery authority. Late inputs for closed work periods remain deletable until their actual payment is finalised. Existing source earnings remain read-only in Additional Earnings in both portals, with Casual Earnings excluded from manual entry options.

Structured manager requests include Record Number: single records auto-fill, multiple records require selection, and new employees use initial record 0. Existing-employee Commencement requests offer New Concurrent Record, retained as an instruction for Payroll to create the record when processing the commencement. Variations, movements and terminations target an existing record; requesting a new concurrent record uses Commencement. Requests do not create Job Data before Payroll processing. No version generated or uploaded.

Validation: all 18 Node regression suites passed, including 26 operations groups and record-specific finalisation locks, late input payment timing, paid-input edit retention, Payroll deletion/recovery authority and request record validation. The targeted MSS browser scenario passed with real schedule entry, failed-save rollback/draft retention, read-only casual Additional Earnings, finalised deletion protection, prefilled support submission and single/multiple/new-concurrent/new-employee record choices. A multiple-casual-record service-view recursion discovered during testing was corrected; casual-only records retain zero LSL. All 64 JavaScript syntax checks passed.

Final regression validation: the complete 24-suite Chromium run passed, including Payroll/ESS/MSS permissions, finalisation, recovery, concurrent records, leave calendars, request forms, Casual Input and Additional Earnings. The finalised-input MSS screen was visually reviewed. Changes remain unreleased at v1.2.12.
