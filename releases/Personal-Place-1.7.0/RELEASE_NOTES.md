# Personal Place 1.7.0

- Calendar Workspace：匯入與重新匯入本機 `.ics`，依日期閱讀全天／定時 agenda。
- Calendar domain 支援 UTC、IANA `TZID`、all-day、RRULE、EXDATE、RECURRENCE-ID override、cancelled occurrence 與 OPAQUE／TRANSPARENT 語意。
- Calendar source 與 normalized events 納入 SQLite schema v5、`.personal-place` backup/restore 與 migration。
- 建立 system workspace registry、domain platform bridge 與 Calendar feature boundary，為未來 Today Workspace 保留乾淨查詢 API。
- Installer 與 portable EXE 來自同一個 release build；NSIS compression 維持 `none`。
- Windows artifacts 未使用受信任的 Authenticode 憑證簽章；SmartScreen 或 Defender reputation warning 仍可能出現。
