# Personal Place 1.6.1

- Repacked the v1.6.0 Activity Workspace release with NSIS compression disabled to reduce Windows Defender ML false-positive risk.
- Activity Workspace functionality is unchanged: normalized names, ranking drill-down, and Today timeline.
- ActivityWatch privacy model is unchanged: fixed localhost connection, no telemetry, cloud sync, or copied raw-event database.
- NSIS installer only. Portable is not included; the installer remains unsigned because no trusted code-signing certificate is available on this build host.
