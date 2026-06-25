Payroll/HCM App v1.1.11
Generated 2026-06-25

Files:
- index.html
- styles.css
- app.js
- payroll-engine.js
- data-store.js
- latest-version.json
- test-cases.js
- test-results.txt
- .nojekyll

Upload all files to the root of the GitHub Pages repository, replacing the prior app files.

Important changes in this version:
1. Payslip Leave Balance now includes Annual Leave, Personal Leave, Long Service Leave, and LSL Entitlement Date.
2. Pro-rata LSL is excluded from the payslip, but remains visible in Absence Balance/admin views.
3. Employee address changes are effective-dated. Finalised payslips keep their address snapshot and do not update later.
4. Absence Calendar key now includes Other Leave in dark green after Leave Without Pay and before Public Holiday.
5. Leave types not yet specifically mapped in the system fall back to Other Leave on the absence calendar.
6. Open payslip content is cleared when leaving the Payslip tab.
7. Every tab resets to the top of the page directly below the fixed top bar.
8. Payslip print CSS targets the selected payment advice only, uses more of the A4 page, and removes trailing blank pages where possible.
9. Fixed top bar now includes an alert bell dropdown. With no alerts it displays exactly: No New Alerts.
10. Sidebar now has an Employee Data dropdown with Personal Details, Bank Details, Tax Details and Super.
11. Public holidays pay only when the public holiday falls on the employee's effective-dated regular working day.
12. Retro pay rate changes calculate the difference only, with separate retro rows by earnings type.

Login password: 1234

Recommended deployment steps:
1. Export data from the current app first.
2. Replace the existing GitHub Pages files with this version.
3. Open the site and import the exported data if required.
4. Run Calculate Pay.
5. Finalise the pay before printing payslips.

Testing:
Run `node test-cases.js` from the app folder.
