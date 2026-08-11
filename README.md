# Personal Place

Personal Place 是 Windows 上、本機優先的個人數位首頁。它讓你依照「我現在想做什麼」進入 App、網站、檔案、資料夾與自己的 Place，而不是在不同工具裡尋找它們。

## 下載

目前版本：**1.3.0**

- [安裝版（Windows 10／11 x64）](https://github.com/TANANIS/PersonalPlace_WindowsDashboard/raw/refs/tags/v1.3.0/releases/Personal-Place-1.3.0/Personal-Place-1.3.0-setup.exe)
- [免安裝版（Windows 10／11 x64）](https://github.com/TANANIS/PersonalPlace_WindowsDashboard/raw/refs/tags/v1.3.0/releases/Personal-Place-1.3.0/Personal-Place-1.3.0-portable.exe)
- [SHA-256 驗證碼](https://github.com/TANANIS/PersonalPlace_WindowsDashboard/raw/refs/tags/v1.3.0/releases/Personal-Place-1.3.0/SHA256SUMS.txt)

安裝版適合一般使用；免安裝版可直接執行。Personal Place 不需要帳號，資料只留在你的電腦。

## 可以做什麼

- 拖入 App、捷徑、檔案、資料夾，或貼上網址與路徑。
- 以頁面與 Place 整理入口；Place 可以一次開啟多個相關項目。
- 建立筆記，先閱讀內容、需要時再進入編輯。
- 使用 Todo、Focus Timer 與使用時間小工具；它們是輔助，不會取代你的首頁。
- 使用 `Ctrl + K` 搜尋所有頁面、Place、卡片與筆記。
- 修復失效路徑，並匯出／還原本機備份。

## 資料與隱私

- Local-first：核心功能不需要帳號、訂閱或雲端。
- 使用時間追蹤預設關閉；啟用後只保存 App 身分與時間，不讀取視窗標題、網址、文件名稱、鍵鼠內容或螢幕。
- 可以從設定匯出與還原資料。絕對路徑可能包含個人資訊，備份請自行妥善保存。

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

目標平台為 Windows 10／11 x64；使用者介面目前以繁體中文為主。
