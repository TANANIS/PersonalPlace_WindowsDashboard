import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { open } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestProblem, IngestRequest, IngestResult } from "../lib/platform";
import type { LauncherItem } from "../types";
import { AddPanel, canStartNewIngest } from "./AddPanel";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const youtubeItem: LauncherItem = {
  id: "card-youtube",
  workspaceId: "home",
  title: "YouTube",
  subtitle: "https://www.youtube.com/",
  kind: "web",
  target: "https://www.youtube.com/",
  symbol: "↗",
  tone: "cyan",
  size: "square",
};

function issue(
  code: IngestProblem["code"],
  value: string,
  inputIndex = 0,
): IngestProblem {
  return {
    inputIndex,
    inputType: value.startsWith("http") ? "url" : "path",
    value,
    code,
    message:
      code === "risky"
        ? "這個項目可能執行程式或變更系統。"
        : code === "duplicate"
          ? "這個項目已在目前頁面。"
          : "無法加入這個項目。",
  };
}

function renderPanel(performIngest: (request: IngestRequest) => Promise<IngestResult>) {
  const onAdded = vi.fn();
  render(
    <AddPanel
      pageId="home"
      onAdded={onAdded}
      onClose={vi.fn()}
      performIngest={performIngest}
    />,
  );
  return { onAdded };
}

describe("AddPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("群組內新增會把容器 ID 交給統一加入引擎", async () => {
    const user = userEvent.setup();
    const performIngest = vi.fn().mockResolvedValue({ added: [], issues: [], errors: [] });
    render(
      <AddPanel
        pageId="home"
        parentGroupId="group-unity"
        onClose={vi.fn()}
        performIngest={performIngest}
      />,
    );
    await user.type(screen.getByLabelText("貼上網址或路徑"), "https://unity.com");
    await user.click(screen.getByRole("button", { name: "加入" }));
    await waitFor(() => expect(performIngest).toHaveBeenCalledWith(expect.objectContaining({
      pageId: "home",
      parentGroupId: "group-unity",
    })));
  });

  it("只需貼上網址就能以統一契約加入", async () => {
    const user = userEvent.setup();
    const performIngest = vi.fn().mockResolvedValue({
      added: [youtubeItem],
      issues: [],
      errors: [],
    });
    const { onAdded } = renderPanel(performIngest);

    await user.type(screen.getByLabelText("貼上網址或路徑"), "https://www.youtube.com");
    await user.click(screen.getByRole("button", { name: "加入" }));

    await waitFor(() =>
      expect(performIngest).toHaveBeenCalledWith({
        pageId: "home",
        parentGroupId: null,
        inputs: [{ inputType: "url", value: "https://www.youtube.com" }],
        allowDuplicate: false,
        allowRisky: false,
      }),
    );
    expect(onAdded).toHaveBeenCalledWith([youtubeItem]);
    expect(screen.getByText("✓ YouTube")).toBeInTheDocument();
  });

  it("重複確認只重送 issue 對應的輸入，不重送已成功項目", async () => {
    const user = userEvent.setup();
    const duplicatePath = "C:\\Apps\\Existing.exe";
    const missingPath = "C:\\Missing\\lost.txt";
    const performIngest = vi
      .fn()
      .mockResolvedValueOnce({
        added: [youtubeItem],
        issues: [issue("duplicate", duplicatePath, 1)],
        errors: [issue("missing", missingPath, 2)],
      })
      .mockResolvedValueOnce({
        added: [{ ...youtubeItem, id: "card-existing", title: "Existing" }],
        issues: [],
        errors: [],
      });
    renderPanel(performIngest);

    await user.type(
      screen.getByLabelText("貼上網址或路徑"),
      `https://www.youtube.com{enter}${duplicatePath}{enter}${missingPath}`,
    );
    await user.click(screen.getByRole("button", { name: "加入" }));
    await screen.findByRole("button", { name: "仍要新增 1 個" });
    await user.click(screen.getByRole("button", { name: "仍要新增 1 個" }));

    await waitFor(() => expect(performIngest).toHaveBeenCalledTimes(2));
    expect(performIngest.mock.calls[1][0]).toEqual({
      pageId: "home",
      parentGroupId: null,
      inputs: [{ inputType: "path", value: duplicatePath }],
      allowDuplicate: true,
      allowRisky: false,
    });
    expect(screen.getByText("✓ YouTube")).toBeInTheDocument();
    expect(screen.getByText("✓ Existing")).toBeInTheDocument();
    expect(screen.getByText(missingPath)).toBeInTheDocument();
  });

  it("同一高風險重複項目依序確認後才同時帶兩個同意旗標", async () => {
    const user = userEvent.setup();
    const scriptPath = "C:\\Tools\\setup.cmd";
    const performIngest = vi
      .fn()
      .mockResolvedValueOnce({ added: [], issues: [issue("risky", scriptPath)], errors: [] })
      .mockResolvedValueOnce({ added: [], issues: [issue("duplicate", scriptPath)], errors: [] })
      .mockResolvedValueOnce({
        added: [{ ...youtubeItem, id: "card-script", title: "setup", kind: "local" }],
        issues: [],
        errors: [],
      });
    renderPanel(performIngest);

    await user.type(screen.getByLabelText("貼上網址或路徑"), scriptPath);
    await user.click(screen.getByRole("button", { name: "加入" }));
    await user.click(await screen.findByRole("button", { name: "確認並新增 1 個" }));
    await user.click(await screen.findByRole("button", { name: "仍要新增 1 個" }));

    await waitFor(() => expect(performIngest).toHaveBeenCalledTimes(3));
    expect(performIngest.mock.calls[1][0]).toMatchObject({
      allowDuplicate: false,
      allowRisky: true,
    });
    expect(performIngest.mock.calls[2][0]).toMatchObject({
      inputs: [{ inputType: "path", value: scriptPath }],
      allowDuplicate: true,
      allowRisky: true,
    });
  });

  it("不同輸入的批准互不洩漏", async () => {
    const user = userEvent.setup();
    const regularDuplicate = "C:\\Apps\\existing.exe";
    const riskyDuplicate = "C:\\Tools\\existing.cmd";
    const performIngest = vi
      .fn()
      .mockResolvedValueOnce({
        added: [],
        issues: [
          issue("duplicate", regularDuplicate, 0),
          issue("risky", riskyDuplicate, 1),
        ],
        errors: [],
      })
      .mockResolvedValueOnce({
        added: [{ ...youtubeItem, id: "card-regular", title: "existing", kind: "local" }],
        issues: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        added: [],
        issues: [issue("duplicate", riskyDuplicate)],
        errors: [],
      })
      .mockResolvedValueOnce({
        added: [{ ...youtubeItem, id: "card-risky", title: "existing.cmd", kind: "local" }],
        issues: [],
        errors: [],
      });
    renderPanel(performIngest);

    await user.type(
      screen.getByLabelText("貼上網址或路徑"),
      `${regularDuplicate}{enter}${riskyDuplicate}`,
    );
    await user.click(screen.getByRole("button", { name: "加入" }));
    await user.click(await screen.findByRole("button", { name: "仍要新增 1 個" }));
    await user.click(await screen.findByRole("button", { name: "確認並新增 1 個" }));

    await waitFor(() => expect(performIngest).toHaveBeenCalledTimes(3));
    expect(performIngest.mock.calls[1][0]).toMatchObject({
      inputs: [{ inputType: "path", value: regularDuplicate }],
      allowDuplicate: true,
      allowRisky: false,
    });
    expect(performIngest.mock.calls[2][0]).toMatchObject({
      inputs: [{ inputType: "path", value: riskyDuplicate }],
      allowDuplicate: false,
      allowRisky: true,
    });

    await user.click(await screen.findByRole("button", { name: "仍要新增 1 個" }));
    await waitFor(() => expect(performIngest).toHaveBeenCalledTimes(4));
    expect(performIngest.mock.calls[3][0]).toMatchObject({
      inputs: [{ inputType: "path", value: riskyDuplicate }],
      allowDuplicate: true,
      allowRisky: true,
    });
  });

  it("高風險項目保持顯示並要求明確確認", async () => {
    const user = userEvent.setup();
    const scriptPath = "C:\\Tools\\cleanup.ps1";
    const performIngest = vi
      .fn()
      .mockResolvedValueOnce({ added: [], issues: [issue("risky", scriptPath)], errors: [] })
      .mockResolvedValueOnce({
        added: [{ ...youtubeItem, id: "card-script", title: "cleanup", kind: "local" }],
        issues: [],
        errors: [],
      });
    renderPanel(performIngest);

    await user.type(screen.getByLabelText("貼上網址或路徑"), scriptPath);
    await user.click(screen.getByRole("button", { name: "加入" }));

    expect(
      await screen.findByText("開啟此卡片可能執行程式或變更系統。只加入你信任的內容。"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "確認並新增 1 個" }));
    await waitFor(() => expect(performIngest).toHaveBeenCalledTimes(2));
    expect(performIngest.mock.calls[1][0]).toMatchObject({
      inputs: [{ inputType: "path", value: scriptPath }],
      allowDuplicate: false,
      allowRisky: true,
    });
  });

  it("部分成功與錯誤會保留到使用者關閉結果", async () => {
    const user = userEvent.setup();
    const missingPath = "C:\\Missing\\nothing.txt";
    const performIngest = vi.fn().mockResolvedValue({
      added: [youtubeItem],
      issues: [],
      errors: [issue("missing", missingPath, 1)],
    });
    renderPanel(performIngest);

    await user.type(
      screen.getByLabelText("貼上網址或路徑"),
      `https://www.youtube.com{enter}${missingPath}`,
    );
    await user.click(screen.getByRole("button", { name: "加入" }));

    expect(await screen.findByText(missingPath)).toBeInTheDocument();
    expect(screen.getByText("✓ YouTube")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "關閉結果" }));
    expect(screen.queryByText(missingPath)).not.toBeInTheDocument();
  });

  it("上一批結果未關閉前不能開始新的普通提交", async () => {
    const user = userEvent.setup();
    const performIngest = vi.fn().mockResolvedValue({
      added: [youtubeItem],
      issues: [],
      errors: [],
    });
    renderPanel(performIngest);

    const input = screen.getByLabelText("貼上網址或路徑");
    await user.type(input, "https://www.youtube.com");
    await user.click(screen.getByRole("button", { name: "加入" }));
    await screen.findByText("✓ YouTube");

    expect(screen.getByRole("button", { name: "加入" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "選擇檔案" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "選擇資料夾" })).toBeDisabled();
    expect(performIngest).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "關閉結果" }));
    expect(screen.getByRole("button", { name: "加入" })).toBeEnabled();
  });

  it("檔案選擇器可以一次送出多個檔案", async () => {
    const user = userEvent.setup();
    const paths = ["C:\\Apps\\one.exe", "C:\\Docs\\two.txt"];
    vi.mocked(open).mockResolvedValue(paths);
    const performIngest = vi.fn().mockResolvedValue({ added: [], issues: [], errors: [] });
    renderPanel(performIngest);

    await user.click(screen.getByRole("button", { name: "選擇檔案" }));

    await waitFor(() =>
      expect(performIngest).toHaveBeenCalledWith({
        pageId: "home",
        parentGroupId: null,
        inputs: paths.map((value) => ({ inputType: "path", value })),
        allowDuplicate: false,
        allowRisky: false,
      }),
    );
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ directory: false, multiple: true }),
    );
  });

  it("資料夾選擇器送出單一資料夾，取消時不送出", async () => {
    const user = userEvent.setup();
    const folder = "C:\\Projects\\Personal Place";
    vi.mocked(open).mockResolvedValueOnce(folder).mockResolvedValueOnce(null);
    const performIngest = vi.fn().mockResolvedValue({ added: [], issues: [], errors: [] });
    renderPanel(performIngest);

    await user.click(screen.getByRole("button", { name: "選擇資料夾" }));
    await waitFor(() => expect(performIngest).toHaveBeenCalledTimes(1));
    expect(performIngest).toHaveBeenLastCalledWith({
      pageId: "home",
      parentGroupId: null,
      inputs: [{ inputType: "path", value: folder }],
      allowDuplicate: false,
      allowRisky: false,
    });

    await user.click(screen.getByRole("button", { name: "選擇資料夾" }));
    expect(performIngest).toHaveBeenCalledTimes(1);
  });

  it("新批次閘門會阻擋忙碌中或尚有未關閉結果的 native drop", () => {
    expect(canStartNewIngest(false, false)).toBe(true);
    expect(canStartNewIngest(true, false)).toBe(false);
    expect(canStartNewIngest(false, true)).toBe(false);
    expect(canStartNewIngest(true, true)).toBe(false);
  });
});
