# Payroll/HCM App v1.2.5

Static payroll/HCM application for GitHub Pages. Open `index.html` or serve the repository root with a static web server. Upload the complete root application files together so the browser loads matching versions of every script. The release uses no build step or external runtime CDN.

The app stores payroll data in the browser's localStorage. Export data before replacing files or changing browsers/devices. Browser data is not automatically shared between users or devices. Portal permissions and support notifications operate within that saved browser dataset; this prototype does not provide server-side authentication, authorization or real-time cross-device messaging.

Default test password: `1234`. Existing stored credentials remain in use. New installations contain no demonstration employees.

## v1.2.5

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

Run all seven calculation/service/DOM regression suites with Node.js:

```sh
npm test
```

For browser checks, install the development dependency and Chromium, then run:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

An existing Chromium executable can be selected using `PAYROLL_CHROMIUM_PATH`. Browser QA files are written to `tmp/browser-qa` by default; `PAYROLL_QA_OUTPUT` can change that destination. Browser tests use synthetic employees and browser-local storage only. `TEST-RESULTS-v1.2.5.md` records the release checks and their limits.

Two historical payroll engine fixtures under `tests/` support regression checks for already-paid casual earnings and settlement compatibility. They are test references and are not loaded by the app.
