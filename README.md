# Personal Place

本機優先的 Windows 個人首頁。目前完成 0.6.0「編輯模式、群組、頁面與 Undo」里程碑。

## 目前功能

- 新使用者從一個乾淨頁面開始，舊版資料會完整保留
- 桌面應用程式與網頁啟動卡片
- 貼上 HTTP／HTTPS 網址或本機路徑即可自動加入，不必手填類型、名稱或 App ID
- 使用系統選擇器一次加入多個檔案，或選擇一個資料夾
- 拖放、貼上與選擇器共用同一套加入、重複及風險判斷
- 網址加入時嘗試取得標題與 favicon；離線或失敗時仍以 hostname 建立卡片
- 同頁重複項目會先提示，確認後仍可新增；不同頁可使用相同目標
- BAT、CMD、PS1、VBS、VBE、WSF、WSH、REG、MSI、MSP、SCR、COM 需明確確認
- 批次可部分成功，完整結果會保留到使用者自行關閉
- 搜尋、拖曳排序、大小切換與移除
- 將 EXE、Windows 捷徑、資料夾或一般檔案直接拖入目前工作區
- 一次拖入並新增多個本機項目
- 從設定開啟完整使用介紹，首頁保持簡潔
- 自動顯示 Windows 系統圖示、圖片／影片縮圖與文字檔前幾行預覽
- Windows 捷徑會優先取得目標縮圖，沒有縮圖時才退回捷徑圖示
- 修正拖入項目的 Windows 延伸路徑無法交給 Shell 擷取預覽的問題
- Windows release 改為 GUI 子系統，啟動時不再伴隨 Console 視窗
- 將預覽保存在本機縮圖儲存區，來源變更時自動更新
- 設定內可查看縮圖儲存區用量並手動清除
- 畫面只載入目前工作區的預覽，切換時釋放上一個工作區的圖片資料
- 卡片可修改名稱、副標題、五種色調與尺寸，並可重設為自動值
- 瀏覽器預覽模式
- Tauri 後端保存並解析啟動目標；正式啟動與預覽只接受 Card ID
- 使用 SQLite 交易式保存頁面、卡片與啟動目標
- 首次升級會備份並匯入舊版 `localStorage` 與啟動路徑登記
- Schema v3 在升級前使用 SQLite Backup API 建立一致性備份，包含 WAL 內尚未 checkpoint 的資料
- 編輯模式支援一般點擊、Ctrl 點擊、Shift 連續選取、全選與清除選取
- 同頁頂層卡片可建立單層群組；群組顯示最多四個子項目圖示與項目數量
- 支援卡片移入／移出群組、解散群組、群組重新命名、Resize 與跨頁移動
- 支援新增、重新命名、符號、排序與刪除頁面，並強制保留至少一個頁面
- 排序、Resize、刪除、群組與頁面操作使用明確的 SQLite transaction command
- 所有整理操作在目前執行期間保留最多 20 筆 Undo，不保存到下次啟動
- 已移除前端整份 `save_workspace_state` 自動保存流程

## 開發

```powershell
pnpm install
pnpm dev
pnpm test
```

安裝 Rust 工具鏈後可以執行桌面版：

```powershell
pnpm tauri dev
```

## 0.6.0 驗證

```powershell
pnpm build
cargo test --manifest-path .\src-tauri\Cargo.toml
cargo clippy --manifest-path .\src-tauri\Cargo.toml --all-targets
pnpm tauri build
```

## 下一階段（0.7.0）

- Group 詳細畫面
- Launch Set 與逐項啟動結果
- 「上次做到這裡」簡短狀態
- 最小純文字 Note Card
