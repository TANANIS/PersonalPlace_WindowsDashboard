# Personal Place v1.7.1

這是 v1.7.0 的 Windows installer repack patch release。應用程式行為、資料格式與 Calendar／architecture groundwork 不變；本版只重新產生 Windows 安裝包與同一次 build 的免安裝版。

- NSIS compression 維持 `none`，降低壓縮封裝造成的 Windows Defender ML 誤判機會。
- installer 與 portable EXE 來自同一次 release build。
- 產物未使用受信任的 Authenticode 憑證簽章；Windows SmartScreen 或 Defender 仍可能依裝置 reputation 顯示警告。
- 請使用 `SHA256SUMS.txt` 驗證下載內容。
