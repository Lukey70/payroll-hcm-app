# v1.2.7 validation - 31 October 2026

All ten Node.js regression suites passed with `npm test`, including 13 manager-template groups. All seven Chromium browser suites passed with `PAYROLL_CHROMIUM_PATH=/tmp/chromium npm run test:browser` using Playwright 1.62.1 and Chromium 153.

Commencement coverage includes required Personal/Tax/Super/Bank fields, malformed values, explicit missing TFN, authoritative active fund lookup, inactive fund rejection, leading zeros, automatic existing-employee identity, ignoring client-spoofed identity and private details for existing employees, no employee master changes, backup/import preservation, notification privacy, masked TFN display, switching employees, roster preservation and mobile layout. Desktop form screenshot was visually reviewed.

Existing browser checks also passed for Payroll workflows and reports, companion support windows, notification routing, ESS/MSS/Payroll payslip navigation and export guards, Dashboard queues, absence cards and credit adjustments, and Pay Errors PDF/print export. No JavaScript page errors were reported.

31 root/test JavaScript and CommonJS files passed `node --check`. Application/package metadata and versioned HTML asset references were verified as 1.2.7.

Tests use synthetic data. The reported stale LSL date after LWOP deletion remains unconfirmed: a fresh synthetic calculation restores the date after replacing LWOP with Annual Leave, but the affected live data was not available. This release does not claim to repair that report or rewrite finalised payslips.
