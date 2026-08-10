# Personal Place 1.0.0 驗收狀態

狀態：**未公開測試版**

1.0.0 已完成規畫中的核心產品範圍與目前測試主機可執行的發布門檻，但尚未取得 Windows 程式碼簽章，也尚未完成乾淨 Windows 10／11 VM 與完整實體 DPI 矩陣。因此這兩個產物不能宣稱為已簽章的公開正式版。

## 已通過

- 全新資料庫只建立一個空白「我的地方」，不預設作者分類。
- 完整 Unity 學習情境在關閉／重開後保留五個資源、群組名稱、三項 Launch Set 與「上次做到角色移動」。
- 實際 schema v2 使用者備份只以一致性副本升級到 schema v3；來源沒有被改寫，卡片數、integrity 與 foreign keys 正常。
- `.personal-place` 在乾淨資料庫往返還原，損壞備份不改變現有資料，WAL 內已提交內容包含在備份。
- 壞路徑重新定位保留 Card ID、群組、順序、尺寸與 Launch Set。
- 鍵盤選取、搜尋、Dialog 焦點、Enter 進入 Place 與 Alt＋方向鍵排序邊界均有測試或實際操作證據。
- 200 卡測試每頁只渲染 100 卡；頁面切換約 302 ms，沒有累積上一頁 DOM。
- 1440×900 與 920×620 沒有水平溢位、Dialog 超界或控制項遮擋。
- Release warm start 到已安裝主視窗約 989 ms；程序有回應，PE Subsystem 為 Windows GUI（2），沒有 Console。
- NSIS 1.0.0 安裝、登錄、開始選單捷徑、啟動與解除安裝成功；解除安裝後程式、登錄與捷徑移除，使用者資料庫和備份保留。
- 解除安裝後實際資料仍為 schema v3、`integrity_check = ok`、foreign key error 0、3 個 Page 與 23 張 Card。
- Rust 54 項測試、前端 32 項測試、TypeScript、Vite、rustfmt、Clippy 與 Tauri／NSIS 建置通過。
- 隱私、資料／備份、發布檢查表與 641 個第三方套件授權清單已包含於專案。

## 尚未完成的公開發布條件

- EXE 與 Installer 目前皆為 `NotSigned`；本機沒有可用的程式碼簽章憑證。
- 尚未在乾淨 Windows 10／11 x64 VM 測試全新安裝、覆蓋升級與降版阻擋。
- 目前兩個實體螢幕都是 96 DPI／100%；尚未實測 125%、150%、200%、不同縮放雙螢幕及拔除螢幕後視窗復位。
- Windows 應用程式控制外掛的 helper 路徑在本機缺失，因此真實 Tauri 視窗以程序句柄、版本、快取與同版瀏覽器 UI 截圖交叉驗證，沒有外掛擷取的 Tauri 截圖。

## 產物 SHA-256

- `Personal-Place-1.0.0-portable.exe`: `FB17AA56643DEB5428023331221184A626D6E79E51B44CC767688F64421D1F35`
- `Personal-Place-1.0.0-setup.exe`: `A311EC564A7B7F2A1A76C7CA637C5862C689F3629EC6E70719A77D21CA855106`
