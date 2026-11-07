# v1.2.9 validation — 7 November 2026

- `npm test`: all 14 Node regression suites passed.
- `PAYROLL_CHROMIUM_PATH=/tmp/chromium npm run test:browser`: all 11 Chromium browser suites passed after the release version update.
- 45 JavaScript files passed `node --check`. HTML script/style references exist and use v1.2.9; package, DataStore, sidebar and update metadata match.
- Timesheets: split shifts/breaks, overnight and cross-fortnight overlaps, incomplete drafts, actual-time submission, owner/manager scope, denial/resubmission, readonly approval, withdrawal archive, print and mobile containment. Verified payroll data stays identical across save/submission/approval and no pay calculation runs on time-record actions.
- Flex: positive daily roster excess, extra-day earning, explicit use only, approved-only carry, available balance checks, 37.5-hour carry cap/excess and retained approved roster snapshots.
- Migration: unfinalised generated earnings archived/excluded, finalised historical earnings/payslips unchanged, original legacy sheets retained and repeat migration idempotent.
- On-call: fixed $22.50 rate, attempted override ignored, finalised history preserved, finalisation/source normalisation and no next-pay reversal.
- Roster: current/proposed one-/two-week grids, imported schedule fallback, changed cells/totals, Back retaining draft, confirmation-only persistence and mobile width. Employee and manager timesheet screenshots visually reviewed.
- Existing support popup, notifications, payslips, leave attachments/cards, reports/PDF, request templates, dashboard, urgent pay and same-day casual rehire browser workflows passed without page errors.

Synthetic data only. No live payment or bank upload was performed. Existing browser-local storage, unconfirmed historical LSL-date issue and bank-specific Urgent Pay CSV limits remain documented in the release notes.
