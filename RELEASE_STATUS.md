# Personal Place 1.0.1 驗收狀態

狀態：**未公開測試版**

1.0.1 加入設定內的四步新手教學，並保留 1.0.0 已完成的核心功能。程式尚未取得 Windows 程式碼簽章，也尚未完成乾淨 Windows 10／11 與完整實體 DPI 矩陣，因此不可標示為已簽章的公開正式版。

## 已通過

- 設定內可開啟四步新手教學；上一步、下一步、完成、關閉與 Escape 均正常。
- 完成或關閉教學後會返回設定，重新啟動時不會強制顯示。
- 1440×900 與 920×620 沒有水平溢位、文字裁切、Dialog 超界或按鈕遮擋。
- 前端 13 個測試檔、34 項測試全部通過；TypeScript 與 Vite 正式建置通過。
- Rust 54 項測試、rustfmt 與 Clippy `-D warnings` 通過。
- Tauri Release 與 NSIS 1.0.1 建置成功。
- 免安裝版與實際安裝版均可啟動，程序有回應，產品版本為 1.0.1。
- PE Subsystem 為 Windows GUI（2），啟動時沒有 Console。
- NSIS 安裝、登錄、啟動與解除安裝成功；解除安裝後安裝目錄及登錄項目均移除。
- D 槽前端依賴已重建，不再指向 Codex 的 C 槽工作資料夾。

## 尚未完成的公開發布條件

- EXE 與 Installer 尚未簽章。
- 尚未在乾淨 Windows 10／11 x64 VM 測試覆蓋升級與降版阻擋。
- 尚未實測 125%、150%、200% 與不同縮放雙螢幕。

## 產物 SHA-256

- `Personal-Place-1.0.1-portable.exe`: `B7E78A69242DE9B6B652185961CC0C41BD2E6FD2347C128C22B70734D4A1B2A6`
- `Personal-Place-1.0.1-setup.exe`: `A560A8346BECE5079992AC573789CBAA0676F6274F58A13C3220BD4E07CF85F2`
