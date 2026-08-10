# Personal Place 發布檢查表

## 每個版本

- [ ] `pnpm build`
- [ ] `pnpm test`
- [ ] `cargo test --manifest-path .\src-tauri\Cargo.toml`
- [ ] `cargo clippy --manifest-path .\src-tauri\Cargo.toml --all-targets`
- [ ] `pnpm tauri build`
- [ ] 實際啟動 Release EXE，確認有回應且沒有 Console
- [ ] 驗證 1440×900、920×620、鍵盤流程、forced-colors 與 reduced-motion
- [ ] 使用資料副本驗證 migration、備份、還原與損壞檔案失敗路徑
- [ ] 比對實際使用者資料庫前後筆數、integrity 與 foreign keys

## 公開發布前

- [ ] 使用可信任的 Windows 程式碼簽章憑證簽署 EXE 與 Installer
- [ ] 在乾淨 Windows 10／11 x64 虛擬機測試全新安裝
- [ ] 測試 0.4.0 實際資料直接升級
- [ ] 測試覆蓋安裝與降版阻擋
- [ ] 測試移除程式並確認使用者資料保留
- [ ] 驗證 100%、125%、150%、200% 實體 DPI 與雙螢幕不同縮放
- [ ] 檢查 [PRIVACY.md](./PRIVACY.md)、[DATA_AND_BACKUP.md](./DATA_AND_BACKUP.md) 與第三方授權清單
- [ ] 發布 SHA-256 校驗值

目前沒有程式碼簽章憑證，因此產物只能標示為「未公開測試版」，不可宣稱為已簽章公開正式版。自動更新器在簽章與穩定發布流程完成前延後。

