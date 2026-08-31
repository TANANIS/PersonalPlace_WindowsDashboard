export const zhTW = {
  brand: {
    name: "Personal Place",
    mark: "PP",
    eyebrow: "PERSONAL PLACE",
  },
  card: {
    placeSummary: (count: number) => `${count} 個項目的地方`,
    keyboardReorderHint: "Alt 加方向鍵可調整順序",
    dragHint: "拖曳卡片調整位置",
  },
  sidebar: {
    edit: "整理",
    finishEditing: "完成",
    editTitle: "進入整理模式",
    finishEditingTitle: "完成整理",
    activity: "活動",
    settings: "設定",
  },
  appearance: {
    title: "介面主題",
    description: "一次更換背景、側欄、卡片、表單與操作色，選擇最適合你的整體氛圍。",
    options: {
      cyan: "深海藍",
      violet: "暮光紫",
      mint: "森霧綠",
      amber: "暖暮棕",
      rose: "莓夜紅",
    },
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
    settingsDescription: "用五個步驟認識空間、待辦、Today 與專注流程",
    eyebrow: "GETTING STARTED",
    title: "新手教學",
    closeLabel: "關閉新手教學",
    previous: "上一步",
    next: "下一步",
    complete: "完成",
    stepProgress: (current: number, total: number) => `第 ${current} / ${total} 步`,
    steps: [
      {
        title: "建立你的空間",
        description: "把常用的程式、網站、檔案與工作內容整理成自己的地方。",
        points: [
          "直接拖入程式、捷徑、檔案或資料夾，也可以從「新增」加入網址與路徑。",
          "用頁面整理不同領域，再把同一件事情會用到的入口組成 Place。",
          "Place 可以保存「接續點」，讓你下次知道自己做到哪裡。",
        ],
      },
      {
        title: "記下要做的事",
        description: "Todo 負責保存事情本身，而「安排」與「截止」是兩件不同的事。",
        points: [
          "用 Todo List 分開工作、學習、生活或其他領域。",
          "「截止時間」代表期限；「安排日期」代表你打算哪一天處理它。",
          "可以把 Todo 排到今天、明天或指定日期，原本的 List 不會因此改變。",
        ],
      },
      {
        title: "從 Today 開始一天",
        description: "Today 把現在真正需要注意的事情集中在一起。",
        points: [
          "「今天安排」只顯示你明確排進今天的 Todo。",
          "「今天到期」與「逾期」會另外提醒，不會把它們視為你的今日計畫。",
          "如果有最近做到一半的 Place，也可以從「繼續」接回工作脈絡。",
        ],
      },
      {
        title: "開始專注，接著做",
        description: "選好現在要做的事後，可以直接建立與 Todo 或 Place 相連的 Focus。",
        points: [
          "從 Today 的 Todo 或 Place 按「開始專注」，目前工作會顯示在「正在做」。",
          "Focus 可以暫停、繼續或結束，而且不會自動完成 Todo。",
          "「開啟這個地方」與「開始專注」是分開的，可以自由決定是否一起使用。",
        ],
      },
      {
        title: "回顧與保護你的資料",
        description: "Personal Place 保持本機優先，也提供 Calendar、Activity 與備份工具協助整理工作狀態。",
        points: [
          "Calendar 可以匯入本機 ICS 行事曆，Today 會顯示接下來的重要行程。",
          "Activity 用來回顧實際發生過的活動，不會取代 Today 計畫。",
          "從設定匯出 .personal-place 備份，可以保存目前的重要 Personal Place 資料。",
        ],
      },
    ],
  },
  release: {
    versionStatus: (version: string) => `版本 ${version} · 本機優先`,
  },
} as const;
