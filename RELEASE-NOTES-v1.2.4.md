# v1.2.4 - 24 October 2026

This release brings the queued payroll, report and interface changes together.

- Dashboard first in Payroll Management, report tiles and Pay Errors moved out of Settings.
- Branded Statement of Earnings preview, PDF download and Print / Save PDF.
- Selected-employee Leave screen, Workers Compensation Leave and salary packaging deductions.
- Redundant, Dismissal and Ill Health termination reasons.
- Leave cash-outs in Additional Earnings with migration of existing records, credit validation and protection against duplicate payment or MSS edits.
- Manager-only Job Data support templates, Additional Comments, attachments and read-only case activity history.
- Casual commencement login reconciliation, trial employee banner, inline validation, SVG icons, sticky headings and shared form sections.

Existing finalised payslips remain frozen. Payroll data remains in the existing browser storage; export a backup before updating the application files. No live employee data is included in the release.

Validation: all six Node.js regression suites passed. Chromium checks passed for the new navigation, report screens, both PDF actions, leave booking, salary packaging, cash-out validation/save/delete, manager templates and casual-only ESS access. Native and browser-generated earnings PDFs were rendered and visually reviewed. See TEST-RESULTS-v1.2.4.md for the scope and limitations.
