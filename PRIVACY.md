# Personal Place 隱私說明

Personal Place 採本機優先設計。核心功能不需要帳號、登入、訂閱或雲端服務。

## 不會發生的事

- 不收集或上傳使用行為。
- 不包含遙測、廣告追蹤或分析 SDK。
- 不監控剪貼簿；只有你在新增介面主動貼上時才處理內容。
- 不在背景掃描整台電腦、瀏覽器歷史或已開啟視窗。
- 不自動上傳錯誤、資料庫或診斷資訊。

## 何時可能連線

- 你主動加入 HTTP／HTTPS 網址時，程式會嘗試取得網頁標題與 favicon。請求不帶 Cookie、登入資訊或自訂認證，並限制 timeout、redirect 與下載大小。
- localhost、私有 IP 與區域網路網址不會主動抓取 metadata。
- 你開啟系統級「活動」工作區時，Tauri 後端只會連線固定的 `http://127.0.0.1:5600`，從本機 ActivityWatch 讀取即時摘要。此連線不允許重新導向，也不會改連其他主機。
- 你開啟網站卡片時，網站會由 Windows 的預設瀏覽器處理；其隱私行為取決於瀏覽器與該網站。

即使離線或 metadata 取得失敗，網址卡片仍可建立。

## 本機資料

頁面、卡片、路徑、筆記與一次開啟設定保存在本機 SQLite。縮圖是可清除、可重建的本機衍生資料。`.personal-place` 備份可能含本機絕對路徑，應像其他私人檔案一樣妥善保管。

ActivityWatch 活動資料不寫入 Personal Place 的資料庫，原始事件也不會納入 `.personal-place` 備份。既有的選用 App 使用時間追蹤仍是獨立功能。

詳見 [DATA_AND_BACKUP.md](./DATA_AND_BACKUP.md)。
