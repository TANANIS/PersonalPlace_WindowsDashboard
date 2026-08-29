# Personal Place 1.6.0

- Activity data cleanup and normalized app names.
- App and Website ranking drill-down with title-aware activity details.
- Today timeline with AFK exclusion and browser/window overlap de-duplication.
- ActivityWatch privacy model unchanged: fixed localhost connection, no telemetry, cloud sync, or copied raw-event database.
- NSIS installer only. Portable is not included because this release does not have a reliably signed/validated portable pipeline; the installer was built from this release source with `--no-sign` because the local signing certificate was unavailable.
