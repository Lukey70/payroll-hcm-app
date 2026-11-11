# v1.2.14 implementation

## Casual Input instances by work date

Casual Input numbering now starts at 1 for distinct worked dates. Active inputs for the same employee sharing any positive scheduled work date use separate instances (2, 3, etc.), including across casual records. Overlapping date ranges with different actual worked dates both use instance 1. Deleted inputs do not reserve numbers. Existing active entries are normalised without changing source earnings, IDs, amounts, pay periods or finalised payslips. Numbering can compact when entries are deleted or dates change; stable source IDs retain the financial links.

The shared Payroll/MSS detail form previews the number after date changes and Schedule OK, and the Schedule heading uses the same calculation. Saved instance numbers are read-only and calculated by the business logic.

Validation: all 18 Node suites passed, including 28 operations groups with separate dates, same-day inputs, multi-day schedules, zero-hour dates, concurrent records, edits, legacy numbering correction and deletion reuse. Payroll Casual Input and MSS Casual Input browser suites passed, covering instance previews, saves, rollback, finalised deletion protection and support requests. Changed application JavaScript syntax checks passed.

## Casual Input pay preview and review

Payroll and MSS now open a confirmation preview before saving a casual input. It uses the same validation and rate calculations as saving, lists the work date, replacement position, hours, loaded rate and gross, and groups expected pay by pay period. Backdated earnings and adjustments are identified separately. Held or unsupported dates show why payment timing cannot be confirmed. Preview and cancellation leave saved earnings unchanged.

Possible duplicates show the existing date, position, hours, instance and reference. A genuine second shift can be confirmed with Save Anyway. Instance numbers still follow shared worked dates.

Saved entries have permanent CI references, retained through edits, export/import and deletion history. Payroll can find a saved input by reference, and the MSS support request includes it. History shows Awaiting Pay, Partially Paid and Finalised with date-level settlement details. The settlement snapshot records the actual run that processed each eligible date, including late work, and does not modify finalised payslips. Older grouped payslip history is matched conservatively and labelled when inferred or uncertain.

Payroll Tools → Casual Input Review links possible duplicates, missing earnings/rates and unpaid backdated work to their inputs. The review list is Payroll-only.

Validation: all 18 Node suites and 24 Chromium browser suites passed. New tests cover estimated versus actual gross, current/future/backdated grouping, duplicate override, partial and final settlement, stable references, historical matching, Payroll review links, save rollback and mobile preview containment. Changed JavaScript passed syntax checks.

## Keep Job Data edits when switching rows

Job Data keeps separate in-memory drafts for edited saved rows and new rows. Previous/Next, Add Row, changing the job record, and choosing another employee within Job Data preserve those drafts. The row toolbar identifies unsaved changes. Save, Cancel and Delete act on the selected row; saving one row leaves other drafts unsaved. The exit prompt detects changes on any row, including second-week roster changes, and drafts are cleared on confirmed exit, logout or data replacement. Saved Job Data is unchanged until Save succeeds; failed saves restore payroll state and keep the draft.

Validation: all 18 Node suites and the targeted Job Data toolbar, concurrent jobs, Cease Pay, shared UI, casual rehire and roster-confirmation browser suites passed. Browser coverage includes editing two rows, saving only one, retaining second-week hours, cancelling one of several new rows, switching employees and job records, and warning about off-screen drafts on exit. Changed JavaScript passed syntax checks.

## Create Job Data drafts from manager requests

Payroll can open a structured manager Commencement, Variation, Movement or Termination request and choose Create Job Data Draft. The draft is linked to the source case and prefilled with the employee, job record, action, reason, dates, position and roster where available. Free-text changes remain visible for Payroll review. New concurrent records are created only when the commencement saves successfully; new employee requests first open the existing onboarding form with the supplied details for Payroll to review and save.

The request stores the manager's last working day unchanged. A Termination draft takes effect on the next calendar day. A fixed-term Commencement keeps its requested start date and gets a separate Expiry of Fixed Term draft effective the day after its last working day. Both dates are shown in Job Data. Temporary movements and roster adjustments also receive a separate return draft at the requested return effective date. Save the main row first, then review and save its companion separately. Reopening a request resumes its existing rows without creating duplicate drafts. Each successful save appears in the request history.

Validation includes ISO date checks, effective sequence collisions, main-row/companion order, and conflicting existing expiry rows. Draft creation does not change saved Job Data.

All 18 Node suites and 25 Chromium browser suites passed, including the four request types, concurrent record creation at save, new employee review, year/month date rollover, payable boundary, temporary returns, failed-save rollback, and reopening without duplicate rows. Changed JavaScript passed syntax checks.

## Manager request draft audit and finalisation safeguards

Verified the effective-date boundaries on saved Job Data: the old roster/acting assignment applies through the day before the requested return date, and the last working day remains payable on fixed-term and other terminations. The movement request now labels the field Return Effective Date (first day back).

Fixed an incomplete-processing gap: saving the main row without its due expiry or return could let payroll finalise against the temporary arrangement. Pay Errors and the finalisation precheck identify the employee, job and source request. The safeguard also runs inside finalisation. It applies once the expiry/return is due, including a fixed-term final working day at a pay-period boundary, and accepts a saved companion or a superseding change on the same job. Reopening the source case restores an outstanding draft without duplicating saved rows.

Also tightened main/companion date order, requested return-date and commencement class checks, checked existing expiry conflicts before committing the main row, preserved effective-sequence reservations while other rows have drafts, rejected inactive positions for new assignments, and protected unsaved Payroll edits when opening a request draft from the support window.

Validation: all 18 Node suites and all 25 Chromium browser suites passed. Tests include the day-before/on-return roster and acting assignment boundaries, termination boundaries, same-record companion checks, finalisation blocked without mutation, Settings precheck, save rollback, outstanding-row recovery and protection of unsaved Payroll edits. Changed JavaScript passed syntax checks.

## Prefill manager request resolution notes

After Payroll saves the last required linked Job Data row, Resolve Request opens with editable notes starting “Request processed DD/MM/YYYY”, using the processing date in Perth. Payroll must explicitly choose Resolve Request; Keep Open leaves the case unchanged. Fixed-term expiry and temporary return rows must also be saved before the prompt appears. If Payroll resolves the processed request later from its case screen, it receives the same default note. Failed resolution saves leave the case open and preserve the typed notes without undoing saved Job Data.

Validation: all 18 Node suites and the request draft, request template and support popup browser suites passed. Tests cover incomplete requests, same-record companion matching, Perth date rollover, Keep Open, later resolution prefill, edited notes, and failed resolution saves preserving the open case and entered text.

## Return manager requests for correction

Payroll can choose Return for Correction on an open structured request, select which Job Data fields need changes and enter instructions. The original requester edits only the requested fields in Manager Self Service. The request stays on the same case with its messages and attachments, and Payroll sees the previous and corrected values and receives an app notification. A normal message does not complete the correction. Payroll can withdraw an unanswered correction without changing the submitted values.

Supported fields include dates, reason, position, work and return schedules, proposed changes and comments; the job record can be corrected before linked Job Data is saved. Request identity, onboarding details and the type of employment or assignment are not changed by this workflow.

Payroll explicitly reviews the corrected draft. A correction cannot save Job Data by itself; already saved rows retain their IDs and values until Payroll saves the affected revision. Stale drafts cannot be saved, and Pay Errors/finalisation flag affected saved rows when their corrections are due. The case can resolve normally after the relevant revisions are reviewed.

Validation: all 18 Node suites and 26 Chromium browser suites passed. Tests cover selected-field permission and validation, roster revisions, withdrawal, notification navigation, immutable saved expiry until review, preserving row identity, stale-draft rejection and refresh, and due pay safeguards. Changed JavaScript passed syntax checks.
