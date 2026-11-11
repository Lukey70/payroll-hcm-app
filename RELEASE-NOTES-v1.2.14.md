# Payroll/HCM App v1.2.14

11 November 2026

- Payroll can return selected manager request fields for correction on the same case. Managers update only those fields; Payroll reviews the changes before saving revised Job Data.
- Create linked Job Data drafts from manager commencement, variation, movement and termination requests. Fixed-term expiry and termination start the day after the last working day; temporary returns use the requested return effective date.
- Job Data keeps separate unsaved row drafts while switching rows, records or employees. Due expiry, return and corrected rows are checked before finalisation.
- After the last required Job Data row saves, Payroll can explicitly resolve the request with an editable note prefilled with the Perth processing date.
- Casual Input shows pay estimates before saving, possible duplicates, permanent references and payment status by work date. Payroll has a dedicated review list; instance numbering starts at 1 for each distinct work date.

Correction requests keep the original case, attachments and activity history. Saved payroll rows remain unchanged until Payroll reviews and saves the revision. Unsaved Job Data drafts remain in memory until they are saved or discarded.

Export existing browser data before replacing files. Use the complete matching release files together. See TEST-RESULTS-v1.2.14.md for validation and IMPLEMENTATION-NOTES-v1.2.14.md for workflow details.
