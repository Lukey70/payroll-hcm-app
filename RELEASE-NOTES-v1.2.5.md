# v1.2.5 - 24 October 2026

- Redesigned Support Requests across Payroll, ESS and MSS, including list filters, grouped forms, attachments, case details and newest-first conversations.
- Added Open in New Window for Payroll support work. The companion window shares and commits the parent's live state; it locks when the main application closes, signs out or loses Payroll access.
- Replaced notification dropdowns with a shared right-side pane, individual dismiss buttons, per-user read state and links to the correct page. Existing ten-second notification popups are retained.
- ESS/MSS payslips now use date-filtered rows and a dedicated document view. Back retains the selected employee and date range. Open payslips are viewable; print/download remains finalised-only.
- Additional Earnings defaults to the current pay period, has a Current Pay Period button and keeps the selected employee/period after saving.
- Improved Leave balance cards and default date filtering to the previous two years, with To Date blank.
- Simplified manager Commencement, Variation, Movement and Termination templates: automatic subjects, no required description, daily roster grids, automated reporting positions and Last Working Day only for termination. Optional Additional Comments remain available.
- Updated Payroll/ESS/MSS home icons. Overpayment Adjustment is Payroll-only, protected from MSS creation, conversion, modification and deletion; ordinary MSS saves preserve existing Payroll records.

All seven Node.js regression suites and all three Chromium browser suites passed. See TEST-RESULTS-v1.2.5.md and test-results.txt for validation details.

Existing browser payroll storage and finalised history are retained. Upload the complete matching application files, including support-window.html and support-window.js. No live employee data is included.
