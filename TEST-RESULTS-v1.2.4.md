# v1.2.4 validation - 24 October 2026

## Automated checks

`npm test` passed all six regression suites:

- Core payroll regression cases (`test-cases.js`), including prior casual retro settlement compatibility.
- 23 payment-details feature groups.
- 37 self-service feature groups.
- 15 support/certification/UI feature groups.
- 18 prior-release update feature groups.
- 18 v1.2.4 feature groups, including cash-out migration, protected MSS access, salary packaging tax/super separation, compensation leave, termination payouts, regular earnings, Job Data request permissions, history and backup/import.

All root JavaScript files passed syntax parsing.

`tests/browser-v124.test.js` passed in headless Chromium 153 using Playwright 1.62.1. Checks exercised the actual page and its event handlers: Dashboard metrics, five report tiles, report-specific views, Pay Errors, native PDF download, Print / Save PDF, one-employee leave selection, roster hours for compensation leave, inline validation and packaging save, cash-out credit rejection with draft retention, cash-out save/delete, MSS template conditions/submission, case activity history, and casual-only ESS login. No JavaScript page errors remained.

Both Statement of Earnings export paths produced one-page portrait A4 PDFs. Poppler parsed and rendered them successfully; the native PDF embeds its fonts. Rendered pages and screenshots of Reports, Leave and support request details were visually reviewed. Native PDF output supports its bundled Windows Latin font encoding; Print / Save PDF preserves other characters without substituting names.

The full automated output is in `test-results.txt`. Browser screenshots and test PDFs are temporary QA outputs and are not part of the application.

## Practical limits

The checks used synthetic records, including an effective 5 October 2026 casual commencement with stale master employment fields. The reported employee's actual saved payroll data was not supplied and has not been independently inspected.

The application remains a browser-local prototype. These tests do not establish server-side authorization, multi-user synchronization, cross-device notifications, external bank/super transmission, or legal/tax compliance certification. No such infrastructure was added in this release.
