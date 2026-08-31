# Personal Place

Personal Place 是 Windows 上、本機優先的個人數位首頁。你可以把 App、網站、檔案、資料夾、筆記與內建工具，依照自己想做的事情整理成 Page 與 Place。

## 下載

目前版本：**1.9.1**

- [免安裝版 EXE（Windows 10／11 x64）](https://github.com/TANANIS/PersonalPlace_WindowsDashboard/raw/refs/tags/v1.9.1/releases/Personal-Place-1.9.1/Personal-Place-1.9.1-portable.exe)
- [SHA-256 驗證碼](https://github.com/TANANIS/PersonalPlace_WindowsDashboard/raw/refs/tags/v1.9.1/releases/Personal-Place-1.9.1/SHA256SUMS.txt)

v1.9.1 的公開下載只提供免安裝版；因應 Windows Defender 對 installer 的機器學習偵測，安裝版不公開。portable EXE 未使用受信任的 Authenticode 憑證簽章，Windows 仍可能顯示 SmartScreen、無法驗證發行者或安全性情報警告；SHA-256 只用來驗證下載內容是否與本 repository 發布的檔案一致。

## 1.9.1：Personal Place 2.0 視覺修復

- 完成 Stage 5 視覺系統遷移，統一 Dashboard、Today、Todo、Focus、Calendar、Activity 與設定頁面的層級、間距和元件外觀。
- 平常瀏覽與整理模式維持分離；整理模式補齊選取操作列、卡片狀態與拖曳相關視覺。
- 統一卡片與內建小工具高度，並修復 Focus、Todo、使用時間等混合內容的排版。
- 搜尋改為預設收斂、聚焦時才顯示範圍選項；加入與整理操作降低視覺干擾。
- 行事曆事件詳情與 Activity 時間軸重新排版，改善文字密度、資訊分組與可讀性。
- 這次更新不變更資料 schema、備份格式或本機優先的隱私邊界。

## 1.9.0：Today Intent 與工作流程教學

- Todo 支援 `plannedFor` 本機日期，可安排今天、明天或指定日期；`dueAt` 截止時間與安排日期是不同概念。
- Today 以「今天安排」作為明確計畫，並分開顯示「今天到期」與「逾期」，不再自動挑選任意待辦。
- recurring Todo 的下一次 occurrence 不會繼承 `plannedFor`；Todo 清單、備份與 schema migration 會保留安排資料。
- 保留 Today ↔ Focus Context Bridge：Todo 與 Place 可開始、暫停、繼續或結束 Focus。
- Settings 新手教學更新為五步核心 workflow，涵蓋 Place、Todo、Today、Focus、Calendar 與 Activity。

## 1.7.4：Today 與接續點

- Today 改善資訊層級，沒有固定行程時不再佔據主要視覺，並讓 Todo 成為主要工作區塊。
- Place 的 resumeNote 以「接續點」呈現，在離開或編輯完成時更可靠地保存；Today 可顯示最近 Place 的接續點。
- Today 可直接開啟 Place 已選取的一次開啟項目，並顯示成功、部分失敗或失敗結果。

## 1.7.3：Today 與 Todo 關聯改善

- 新增系統級「今天」Workspace，整合 Calendar 的下一個占用時間事件、跨 Todo Lists 的待辦，以及最近有進度記錄的 Place／Group。
- Todo Widget 新增時可建立新 List 或選擇 existing List；Widget title 會跟隨 Todo List 名稱，同一個 List 也可被多個 Widget 引用。
- Settings 顯示動態 App version 與 build provenance。

## 1.7.0：Calendar Workspace 與架構基礎

- 新增系統級 Calendar 工作區，可匯入或重新匯入本機 `.ics`，並以 agenda 閱讀指定日期的全天與定時事件。
- 支援 UTC、IANA `TZID`、all-day、RRULE、EXDATE、RECURRENCE-ID override 與 cancelled occurrence；重複事件只在查詢日期時展開。
- `OPAQUE`／`TRANSPARENT` 會顯示為「占用時間」／「不占用時間」，事件描述只以安全純文字呈現。
- Calendar source 與 normalized events 保存在本機 SQLite，並納入 `.personal-place` 備份、還原與 schema migration。
- App shell、system workspace registry 與 Tauri bridge 已建立 feature boundaries，未來 Today 可以直接查詢 Calendar domain，不需要解析 ICS。

## 1.5.0：ActivityWatch 活動工作區

左側欄新增系統級「活動」入口，將這台電腦上的 ActivityWatch 紀錄整理成 Personal Place 原生工作區。它獨立於使用者建立的 Page，不會出現在 Page 管理、排序或搜尋結果中。

### ActivityWatch 是什麼？

[ActivityWatch](https://activitywatch.net/) 是免費、開源、跨平台且以隱私為優先的自動時間追蹤工具。它在你的電腦上記錄目前使用的 App、有效／離開時間；安裝官方瀏覽器擴充功能後，也能記錄網站活動。資料由 ActivityWatch 保存在本機，不需要建立帳號或上傳到雲端。

Personal Place 不會取代 ActivityWatch，也不負責在背景監控使用行為；「活動」工作區只是將 ActivityWatch 已經收集的資料，重新整理成符合 Personal Place 設計語言的摘要畫面：

- 可切換今天、近 7 天與近 30 天。
- 顯示有效使用總時間、App 使用排行與 Website domain 使用排行。
- 最近活動以簡潔時間軸呈現，不加入生產力評分或 AI 分析。
- ActivityWatch 未啟動時會顯示 unavailable 狀態，不影響 Dashboard、Place 與其他工具。

## 1.6.0：更容易理解活動資料

- App 名稱會經過 normalization（例如 `msedge.exe` 顯示為 Microsoft Edge），網站排行會排除瀏覽器內部頁面與低於 60 秒的項目。
- 點擊 App 或 Website domain 排行項目可查看選定期間的活動區段；頁面標題優先顯示，完整 URL 只在詳細檢視中呈現。
- 新增今日時間軸，按時間顯示 normalized App、網站標題／domain、開始／結束時間與 duration；AFK 與 browser/window 重複區段不會重複計算。
- ActivityWatch privacy model unchanged：固定連線 `http://127.0.0.1:5600`，不新增遙測、雲端同步或原始事件資料庫。

### 推薦安裝方式（Windows）

1. 前往 [ActivityWatch 官方下載頁](https://activitywatch.net/downloads/)。
2. 在最新穩定版的 **Windows** 區域選擇 **Installer（recommended）**；一般使用不建議選擇 pre-release 或 nightly build。
3. 安裝後啟動 ActivityWatch，確認 Windows 系統匣出現 ActivityWatch 圖示。
4. 開啟 [ActivityWatch 本機介面](http://127.0.0.1:5600/)；能看到畫面後，再回到 Personal Place 的「活動」頁重新整理。
5. 若要顯示 Website domain 排行，請另外從官方下載頁安裝適合瀏覽器的 ActivityWatch Web Watcher 擴充功能。

更完整的設定方式可參考 [ActivityWatch Getting Started](https://docs.activitywatch.net/en/latest/getting-started.html)。Windows Installer 會自動設定登入時啟動；若你不希望持續記錄，也可以從 ActivityWatch 本身暫停或調整追蹤。

Personal Place 只透過 Tauri 後端連線固定的 `http://127.0.0.1:5600`，不接受遠端伺服器、不使用外部 API，也不把 ActivityWatch 原始事件複製到自己的資料庫。既有的選用 Usage tracker 與 Usage widget 仍保留為獨立功能。

## 主要功能

- 拖入或選擇 App、捷徑、檔案與資料夾，也可貼上網址或路徑。
- 用自由卡片網格、Page 與 Place 整理自己的入口。
- Place 可記錄最近進度，並依序開啟選定項目。
- 純文字筆記採閱讀優先的內頁，需要時再進入編輯。
- Todo、Focus Timer 與使用時間提供卡片摘要與完整工作區。
- 系統級「今天」工作區整合下一個固定行程、待辦事項與最近進度，提供每日開始工作的入口。
- 系統級 Calendar 工作區可匯入本機 `.ics`，閱讀每日 agenda、下一個占用時間事件與事件詳細內容。
- 系統級「活動」工作區可選擇性讀取本機 ActivityWatch，查看有效使用時間、App／網站排行與最近活動。
- `Ctrl + K` 可跨 Page、Place、筆記與卡片搜尋。
- 支援整理模式、多選、拖曳排序、鍵盤移動與復原。
- Dashboard 會依視窗寬度增加欄數，避免高解析度螢幕把卡片與圖示過度放大。
- 支援五種完整介面主題。
- 可備份、還原與重新定位失效的本機項目。

## 資料與隱私

- 不需要帳號，核心功能可離線使用。
- Dashboard 與工具資料保存在使用者的 Windows 本機資料目錄。
- Calendar 只讀取使用者主動選擇的本機 `.ics`；不登入 Google、不使用 Calendar API，也不做雲端同步。
- App 使用時間追蹤預設關閉；啟用後只記錄 App 身分與時間，不讀取視窗標題、網址、文件名稱、鍵鼠內容或畫面。
- 「活動」只連線固定的本機 ActivityWatch 服務並即時彙整，不把 ActivityWatch 原始事件複製到 Personal Place。
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
