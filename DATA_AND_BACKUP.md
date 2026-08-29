# Personal Place 資料與備份

## Windows 資料位置

為了保持舊版資料相容，Tauri identifier 固定為 `tw.jsrad.personal-workspace`。

- 正式資料庫：`%APPDATA%\tw.jsrad.personal-workspace\personal-place.db`
- 自動安全備份：`%APPDATA%\tw.jsrad.personal-workspace\backups`
- 衍生縮圖快取：Windows 應用程式快取目錄中的 `previews`

解除安裝程式不應默認刪除使用者資料。正式發布前必須實測安裝、升級、移除與保留資料流程。

## 匯出

設定中的「備份與還原」可匯出 `.personal-place`。它是版本化 ZIP 容器，包含 `manifest.json`，保存頁面、卡片、地方、Target、Note、最近狀態與 Launch Set；衍生縮圖不匯出。

SQLite 讀取採一致性 transaction，因此已提交但仍位於 WAL 的最新資料也會包含在匯出內容。

系統級「活動」工作區即時讀取本機 ActivityWatch；摘要、排行 drill-down 與今日時間軸都只在畫面需要時查詢。Personal Place 不另建活動歷史資料庫、不複製原始事件，因此這些資料不包含在備份中。normalization、internal-page／sub-minute 過濾與 timeline 去重只存在於查詢／展示層。既有 Usage tracker 的資料與設定維持原本行為。

## 還原

目前只提供「取代目前資料」，不提供 Merge。還原前會：

1. 驗證 ZIP、格式版本、主鍵、URL 與單層 Group 限制。
2. 使用 SQLite Backup API 建立自動安全備份。
3. 在單一 transaction 匯入。
4. 驗證 foreign keys 與 integrity。

任何步驟失敗都會 rollback，保持原資料。

## Recovery

若資料庫無法開啟，Personal Place 不會用空白資料覆寫它。Recovery 畫面可選擇備份；程式會先在旁邊建立並驗證完整新資料庫，再保存原 DB／WAL／SHM、替換並重新啟動。
