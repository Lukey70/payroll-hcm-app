# v1.2.9 — 7 November 2026

- Replaced earnings-based timesheets with a fortnightly Personal Record Sheet modelled on the supplied example: daily On/Off work periods, breaks between periods, all seven days, rostered/worked hours, Flex Time Taken, remarks, weekly navigation and print/PDF.
- Timesheet saves, submission, withdrawal and manager approval/denial never calculate pay or generate earnings. Managers enter any payment for additional work separately in Additional Earnings. There are no overtime entry controls in timesheets.
- Daily work above the roster earns flex, including work on non-rostered days. Shortfalls do not automatically debit flex. Only explicit Flex Time Taken reduces the balance; approved records carry forward up to 37.5 hours with excess displayed separately. Checks cover complete times, overlaps (including overnight/across fortnights), available flex and current manager scope. Approved records retain roster snapshots.
- Earlier unfinalised timesheet-generated earnings are archived and excluded from pay. Finalised historical earnings and payslips remain unchanged. Legacy hours-only sheets retain their original record for reference and return to Draft for actual-time entry and resubmission.
- Fixed On-call Allowance at $22.50 per hour in Payroll Additional Earnings and MSS Payment Processing. New entries ignore rate/amount overrides; finalised historical rates remain unchanged.
- Redesigned roster confirmation with Current/Proposed Monday–Sunday grids, separate weeks, highlighted changed days, weekly totals and average changes. Returning to Job Data retains unsaved inputs. Imported empty roster maps use their linked saved schedule.

Validation: all 14 Node suites, all 11 Chromium suites, JavaScript syntax and version/asset checks. See TEST-RESULTS-v1.2.9.md. Deploy the complete matching file set together; browser-local data and credentials are retained.

Existing limits remain: browser-local storage is not cross-device shared data or server-side authorization. The previously reported stale LSL date after replacing LWOP has not been reproduced and is not claimed fixed. Urgent Pay bank-specific CSV acceptance remains unverified; no bank upload was performed.
