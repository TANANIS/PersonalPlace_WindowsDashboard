export const zhTW = {
  brand: {
    name: "Personal Place",
    mark: "PP",
    eyebrow: "PERSONAL PLACE",
  },
  card: {
    placeSummary: (count: number) => `${count} 個項目的地方`,
    keyboardReorderHint: "Alt 加方向鍵可調整順序",
  },
  sidebar: {
    edit: "整理",
    finishEditing: "完成",
    editTitle: "進入整理模式",
    finishEditingTitle: "完成整理",
    settings: "設定",
  },
  notes: {
    empty: "空白筆記",
    edit: "編輯",
    close: "關閉",
    closeViewer: "關閉筆記",
    returnToViewer: "返回閱讀",
    saveAndReturn: "儲存並返回",
  },
  pages: {
    save: "儲存頁面",
    moveUp: "向前移動",
    moveDown: "向後移動",
    delete: "刪除頁面",
  },
  guide: {
    settingsTitle: "新手教學",
    settingsDescription: "用四個步驟熟悉加入、整理與開啟內容",
    eyebrow: "GETTING STARTED",
    title: "新手教學",
    closeLabel: "關閉新手教學",
    previous: "上一步",
    next: "下一步",
    complete: "完成",
    stepProgress: (current: number, total: number) => `第 ${current} / ${total} 步`,
    steps: [
      {
        title: "加入你的內容",
        description: "把常用的程式、網站、檔案和資料夾放進目前頁面。",
        points: [
          "直接拖入 EXE、捷徑、檔案或資料夾，也能一次拖入多個項目。",
          "按「新增」可以貼上網址或路徑，也可以使用檔案與資料夾選擇器。",
          "名稱、圖示與縮圖會在加入時盡量自動完成。",
        ],
      },
      {
        title: "整理你的首頁",
        description: "需要調整時再進入編輯模式，平常畫面會保持乾淨。",
        points: [
          "拖曳卡片即可排序，也能改名、調整大小或移到其他頁面。",
          "使用 Ctrl 或 Shift 可以一次選取多張卡片。",
          "排序、移動、刪除與群組操作完成後都能復原。",
        ],
      },
      {
        title: "建立一個地方",
        description: "把同一件事情會用到的入口整理成群組。",
        points: [
          "在編輯模式選取兩張以上的卡片，再按「建立群組」。",
          "進入群組後，可以選擇要一起開啟的項目。",
          "用「上次做到這裡」記下簡短進度，下次可以直接繼續。",
        ],
      },
      {
        title: "平常這樣使用",
        description: "從 Personal Place 直接進入你現在想做的事情。",
        points: [
          "點擊卡片即可開啟；進入群組後可一次開啟選定的項目。",
          "按 Ctrl + K 搜尋所有頁面、群組、卡片與筆記。",
          "路徑失效時可以重新定位；資料則可從設定中備份與還原。",
        ],
      },
    ],
  },
  release: {
    versionStatus: (version: string) => `版本 ${version} · 未公開測試版`,
  },
} as const;
