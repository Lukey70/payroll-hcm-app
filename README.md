# Payroll/HCM App v1.1.0

This is a static GitHub Pages payroll/HCM prototype for Australian-style payroll testing.

## Files to upload to GitHub

Upload all of these files to the root of the `payroll-hcm-app` repository:

- index.html
- styles.css
- app.js
- payroll-engine.js
- data-store.js
- latest-version.json
- .nojekyll

`test-cases.js`, `README.md`, and `test-results.txt` are included for checking and documentation. They do not need to be uploaded for the app to work, but it is fine if they are uploaded.

## Login

Password: `1234`

## Current anchored pay cycle

- PPE4/6/26
- Period: 22/5/26 - 4/6/26
- Payment Date: 4/6/26
- Pay close: 29/5/26

## Important note about data

This version stores data in the browser's localStorage. Export your data before replacing files or using another device. Data is not automatically shared between devices.

## How to run tests locally

If Node.js is installed, open a terminal in this folder and run:

```bash
node test-cases.js
```
<!-- force pages redeploy v1.1.5 -->
