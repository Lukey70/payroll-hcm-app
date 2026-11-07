# v1.2.10 implementation

The shared UI enhancements keep original select elements and handlers. Search hides nonmatching existing options without inventing new options, changing selection or expanding role scope. It matches legal/display names and numeric identifiers and preserves native keyboard interaction.

Workflow status styling retains text labels. Form action order matches DOM/tab order. Cancel handlers reload saved drafts without running payroll. Table selection is visual and independent of checkboxes and row actions; stable certification row keys retain selection across checkbox rendering. Certification separately restores the nested scroll offsets, window position and checkbox focus after refresh.

Report loading yields for a browser paint before synchronous report generation. Tokens prevent stale tasks from overwriting later openings, and navigation guards cancel inactive opening tasks. Error states replace placeholders; statement export actions stay disabled until the preview succeeds. Reduced-motion preferences disable the skeleton animation. Formal document and print styling excludes interactive row highlights.

Date formatting changes display years only, keeping ISO inputs and financial values unchanged. Preferred/display names use a separate helper from the legal-name helper. Payslip snapshots and formal service/earnings reports continue using legal identity.

Timesheets use the current configured pay period as the upper bound. The corrected non-rostered flex threshold is 7.5 net worked hours; rostered days retain their own threshold. Approved leave references and missing-day warnings are calculated for display, without adding paid earnings or altering flex through leave. Previously saved weekend records remain intact and read-only in the UI.

Extended-absence episodes group approved bookings across calendar-contiguous or non-working gaps. Expected return is the next rostered non-holiday day within active employment (casual records without guaranteed rosters use the next active day). Return reminders use current Reports To managers and stable employee/episode/return/recipient keys, preserve dismissal, and remove obsolete notifications after changes. Settings default to 14-day extended absences and 7-day notice. App startup, refresh and the existing minute checks evaluate reminders; the closed browser sends nothing externally.

No version-specific data migration rewrites financial history. Local data can still be exported/imported with optional preferred names and leave settings preserved.
