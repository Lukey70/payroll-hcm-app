# v1.2.7 - 31 October 2026

- New-employee commencement requests now collect structured Personal, Tax, Super and Bank details.
- Existing-employee requests automatically populate the employee name and ID. Additional personal, tax, super and bank sections are not required. Common job details and roster remain required.
- Added field validation, explicit TFN-not-provided selection, active super fund lookup and preservation of leading zeros in bank details.
- Case details display grouped onboarding information with the TFN masked until explicitly revealed by an authorised case viewer.
- Submitting a request stores the information on the support case only; Payroll still creates and maintains employee master records.

The reported LSL date remaining extended after LWOP deletion has not been reproduced or confirmed fixed. A fresh test restored the date after replacing LWOP with Annual Leave; further details are needed to identify the affected saved record or screen.

Existing browser-local payroll storage is retained. Replace the complete matching application file set when updating. Validation is recorded in TEST-RESULTS-v1.2.7.md. No live employee data or temporary QA outputs are included.
