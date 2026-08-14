# Personal Place

Personal Place 是 Windows 上、本機優先的個人數位首頁。你可以把 App、網站、檔案、資料夾、筆記與內建工具，依照自己想做的事情整理成 Page 與 Place。

## 下載

目前版本：**1.4.0**

- [安裝版（Windows 10／11 x64）](https://github.com/TANANIS/PersonalPlace_WindowsDashboard/raw/refs/tags/v1.4.0/releases/Personal-Place-1.4.0/Personal-Place-1.4.0-setup.exe)
- [免安裝版（Windows 10／11 x64）](https://github.com/TANANIS/PersonalPlace_WindowsDashboard/raw/refs/tags/v1.4.0/releases/Personal-Place-1.4.0/Personal-Place-1.4.0-portable.exe)
- [SHA-256 驗證碼](https://github.com/TANANIS/PersonalPlace_WindowsDashboard/raw/refs/tags/v1.4.0/releases/Personal-Place-1.4.0/SHA256SUMS.txt)

目前發行檔尚未使用程式碼簽章，Windows 可能顯示 SmartScreen 提醒。

## 主要功能

- 拖入或選擇 App、捷徑、檔案與資料夾，也可貼上網址或路徑。
- 用自由卡片網格、Page 與 Place 整理自己的入口。
- Place 可記錄最近進度，並依序開啟選定項目。
- 純文字筆記採閱讀優先的內頁，需要時再進入編輯。
- Todo、Focus Timer 與使用時間提供卡片摘要與完整工作區。
- `Ctrl + K` 可跨 Page、Place、筆記與卡片搜尋。
- 支援整理模式、多選、拖曳排序、鍵盤移動與復原。
- Dashboard 會依視窗寬度增加欄數，避免高解析度螢幕把卡片與圖示過度放大。
- 支援五種完整介面主題。
- 可備份、還原與重新定位失效的本機項目。

## 資料與隱私

- 不需要帳號，核心功能可離線使用。
- Dashboard 與工具資料保存在使用者的 Windows 本機資料目錄。
- App 使用時間追蹤預設關閉；啟用後只記錄 App 身分與時間，不讀取視窗標題、網址、文件名稱、鍵鼠內容或畫面。
- 匯出備份可能包含本機絕對路徑，請妥善保存。

詳細說明：

- [資料與備份](DATA_AND_BACKUP.md)
- [隱私說明](PRIVACY.md)
- [第三方授權](THIRD_PARTY_LICENSES.md)

## 開發

```powershell
pnpm install
pnpm dev
pnpm test
pnpm tauri build
```

目標平台為 Windows 10／11 x64。
