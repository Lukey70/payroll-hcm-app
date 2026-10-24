# v1.2.6 - 24 October 2026

- Added Dashboard Support Requests counts with filtered case links, plus upcoming employee changes for the next 30 days linked to Job Data.
- Matched Payroll Management payslips to ESS/MSS using date-filtered rows, a separate document view and Back preserving the employee and filter. Print/download remains finalised-only.
- Replaced Absence Balance tables in all three portals with cards in the requested order: Annual/Personal Leave; LSL Pro Rata/LSL Accrued; LSL Entitlement Date.
- Payroll Adjust Balance can add or take credits and edit the LSL entitlement date, with a required audit comment and failed-save rollback. ESS/MSS remain read-only. Removed Recalculate Balances from the screen.
- Pay Errors now has Employee Name, Employee ID and Error Message columns, direct PDF download and Print / Save PDF. Exports include the current pay context and generation time; large reports have repeated headers and page numbering.
- Fixed separate adjacent leave bookings being merged under the first booking date. New calculations keep the bookings separate; previously saved merged rows show their actual date range without rewriting finalised amounts.
- Awaiting Info support cases return to Open when the requester responds with a message or attachment. The existing assignment and message-notification routing are retained.
- Added required Termination Reason to manager termination requests alongside Last Working Day. Removed subtitles from the main Payroll/ESS/MSS tiles.

Validation: all ten Node.js regression suites and all seven Chromium browser suites passed. Pay Errors PDFs were parsed, rendered and visually reviewed, including a ten-page stress report. See TEST-RESULTS-v1.2.6.md for details.

The application retains existing browser-local payroll storage. Replace the complete matching application file set when updating. No live employee data or temporary QA outputs are included in this release.
