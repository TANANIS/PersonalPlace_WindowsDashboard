import { useId, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ingestItems,
  platformErrorMessage,
  type IngestInput,
  type IngestIssueCode,
  type IngestProblem,
  type IngestRequest,
  type IngestResult,
} from "../lib/platform";
import type { LauncherItem } from "../types";

interface AddPanelProps {
  pageId: string;
  parentGroupId?: string | null;
  onAdded?: (items: LauncherItem[]) => void;
  onClose: () => void;
  performIngest?: (request: IngestRequest) => Promise<IngestResult>;
}

interface IngestResultPanelProps {
  result: IngestResult;
  busy?: boolean;
  onDismiss: () => void;
  onRetryDuplicates?: () => void;
  onConfirmRisky?: () => void;
}

const issueLabels: Record<IngestIssueCode, string> = {
  duplicate: "已經存在",
  risky: "需要確認",
  invalid: "格式無效",
  missing: "找不到項目",
  unsupported: "不支援",
  metadataUnavailable: "已加入，資訊未取得",
};

export interface IngestPermissions {
  allowDuplicate: boolean;
  allowRisky: boolean;
}

export interface ApprovedRetryGroup {
  inputs: IngestInput[];
  permissions: IngestPermissions;
}

function inputApprovalKey(input: Pick<IngestInput, "inputType" | "value">): string {
  return `${input.inputType}\u0000${input.value}`;
}

function canStartNewIngest(busy: boolean, hasPendingResult: boolean): boolean {
  return !busy && !hasPendingResult;
}

function approveAndGroupProblems(
  problems: IngestProblem[],
  approvedCode: "duplicate" | "risky",
  approvals: Map<string, IngestPermissions>,
): ApprovedRetryGroup[] {
  const groups = new Map<string, ApprovedRetryGroup>();

  for (const problem of [...problems].sort(
    (left, right) => left.inputIndex - right.inputIndex,
  )) {
    const key = inputApprovalKey(problem);
    const previous = approvals.get(key) ?? {
      allowDuplicate: false,
      allowRisky: false,
    };
    const permissions = {
      allowDuplicate:
        previous.allowDuplicate || approvedCode === "duplicate",
      allowRisky: previous.allowRisky || approvedCode === "risky",
    };
    approvals.set(key, permissions);

    const groupKey = `${permissions.allowDuplicate}:${permissions.allowRisky}`;
    const group = groups.get(groupKey) ?? { permissions, inputs: [] };
    group.inputs.push({ inputType: problem.inputType, value: problem.value });
    groups.set(groupKey, group);
  }

  return [...groups.values()];
}

function parseInputLines(value: string): IngestInput[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      inputType: /^[a-z][a-z\d+.-]*:\/\//i.test(line) ? "url" : "path",
      value: line,
    }));
}

function combineIngestResults(left: IngestResult, right: IngestResult): IngestResult {
  const addedById = new Map(left.added.map((item) => [item.id, item]));
  for (const item of right.added) addedById.set(item.id, item);

  return {
    added: [...addedById.values()],
    issues: [...left.issues, ...right.issues],
    errors: [...left.errors, ...right.errors],
  };
}

function mergeIngestRetryResult(
  previous: IngestResult,
  next: IngestResult,
  resolvedCode: "duplicate" | "risky",
  resolvedProblems: IngestProblem[],
): IngestResult {
  const remainingCounts = new Map<string, number>();
  for (const problem of resolvedProblems) {
    const key = `${inputApprovalKey(problem)}\u0000${resolvedCode}`;
    remainingCounts.set(key, (remainingCounts.get(key) ?? 0) + 1);
  }

  const remainingIssues = previous.issues.filter((issue) => {
    const key = `${inputApprovalKey(issue)}\u0000${issue.code}`;
    const count = remainingCounts.get(key) ?? 0;
    if (count === 0) return true;
    remainingCounts.set(key, count - 1);
    return false;
  });

  return combineIngestResults(
    {
      added: previous.added,
      issues: remainingIssues,
      errors: previous.errors,
    },
    next,
  );
}

function ingestFailureResult(inputs: IngestInput[], error: unknown): IngestResult {
  const message = platformErrorMessage(error, "新增項目時發生未預期的錯誤。");
  return {
    added: [],
    issues: [],
    errors: inputs.map((input, inputIndex) => ({
      inputIndex,
      inputType: input.inputType,
      value: input.value,
      code: "invalid",
      message,
    })),
  };
}

export function IngestResultPanel({
  result,
  busy = false,
  onDismiss,
  onRetryDuplicates,
  onConfirmRisky,
}: IngestResultPanelProps) {
  const titleId = useId();
  const duplicateCount = result.issues.filter((issue) => issue.code === "duplicate").length;
  const riskyCount = result.issues.filter((issue) => issue.code === "risky").length;
  const allProblems = [...result.issues, ...result.errors];

  return (
    <section className="ingest-result" aria-labelledby={titleId}>
      <div className="ingest-result-header">
        <div>
          <strong id={titleId}>新增結果</strong>
          <small>
            已新增 {result.added.length} 個
            {allProblems.length > 0 ? ` · ${allProblems.length} 個需要處理` : ""}
          </small>
        </div>
        <button
          type="button"
          className="result-dismiss"
          disabled={busy}
          onClick={onDismiss}
        >
          關閉結果
        </button>
      </div>

      {result.added.length > 0 && (
        <ul className="ingest-added-list" aria-label="已新增項目">
          {result.added.map((item) => (
            <li key={item.id}>✓ {item.title}</li>
          ))}
        </ul>
      )}

      {allProblems.length > 0 && (
        <ul className="ingest-problem-list" aria-label="需要處理的項目">
          {allProblems.map((problem, index) => (
            <li key={`${problem.inputType}-${problem.value}-${problem.code}-${index}`}>
              <span className={`problem-code is-${problem.code}`}>
                {issueLabels[problem.code]}
              </span>
              <span>
                <strong>{problem.value}</strong>
                <small>{problem.message}</small>
              </span>
            </li>
          ))}
        </ul>
      )}

      {riskyCount > 0 && (
        <div className="risk-confirmation" role="alert">
          <p>開啟此卡片可能執行程式或變更系統。只加入你信任的內容。</p>
          <button
            type="button"
            className="button danger"
            disabled={busy}
            onClick={onConfirmRisky}
          >
            確認並新增 {riskyCount} 個
          </button>
        </div>
      )}

      {duplicateCount > 0 && (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={onRetryDuplicates}
        >
          仍要新增 {duplicateCount} 個
        </button>
      )}
    </section>
  );
}

export function AddPanel({
  pageId,
  parentGroupId = null,
  onAdded,
  onClose,
  performIngest = ingestItems,
}: AddPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const approvalsRef = useRef(new Map<string, IngestPermissions>());

  const textInputs = useMemo(() => parseInputLines(inputValue), [inputValue]);

  async function submitInputs(
    inputs: IngestInput[],
  ) {
    if (inputs.length === 0 || !canStartNewIngest(busy, Boolean(result))) return;

    approvalsRef.current.clear();
    setBusy(true);
    try {
      const nextResult = await performIngest({
        pageId,
        parentGroupId,
        inputs,
        allowDuplicate: false,
        allowRisky: false,
      });
      setResult(nextResult);
      if (nextResult.added.length > 0) onAdded?.(nextResult.added);
    } catch (error) {
      setResult(ingestFailureResult(inputs, error));
    } finally {
      setBusy(false);
    }
  }

  async function retryProblems(
    problems: IngestProblem[],
    approvedCode: "duplicate" | "risky",
  ) {
    if (problems.length === 0 || busy) return;

    setBusy(true);
    const groups = approveAndGroupProblems(
      problems,
      approvedCode,
      approvalsRef.current,
    );
    let combined: IngestResult = { added: [], issues: [], errors: [] };

    for (const group of groups) {
      try {
        const nextResult = await performIngest({
          pageId,
          parentGroupId,
          inputs: group.inputs,
          ...group.permissions,
        });
        combined = combineIngestResults(combined, nextResult);
        if (nextResult.added.length > 0) onAdded?.(nextResult.added);
      } catch (error) {
        combined = combineIngestResults(
          combined,
          ingestFailureResult(group.inputs, error),
        );
      }
    }

    setResult((current) =>
      current
        ? mergeIngestRetryResult(current, combined, approvedCode, problems)
        : combined,
    );
    setBusy(false);
  }

  async function chooseFiles() {
    if (!canStartNewIngest(busy, Boolean(result))) return;
    try {
      const selected = await open({
        directory: false,
        multiple: true,
        title: "選擇要加入的檔案",
      });
      const paths = selected == null ? [] : Array.isArray(selected) ? selected : [selected];
      await submitInputs(paths.map((value) => ({ inputType: "path", value })));
    } catch (error) {
      const message = error instanceof Error ? error.message : "無法開啟檔案選擇器。";
      setResult({
        added: [],
        issues: [],
        errors: [
          {
            inputIndex: 0,
            inputType: "path",
            value: "選擇檔案",
            code: "invalid",
            message,
          },
        ],
      });
    }
  }

  async function chooseFolder() {
    if (!canStartNewIngest(busy, Boolean(result))) return;
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "選擇要加入的資料夾",
      });
      if (typeof selected === "string") {
        await submitInputs([{ inputType: "path", value: selected }]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "無法開啟資料夾選擇器。";
      setResult({
        added: [],
        issues: [],
        errors: [
          {
            inputIndex: 0,
            inputType: "path",
            value: "選擇資料夾",
            code: "invalid",
            message,
          },
        ],
      });
    }
  }

  const duplicateProblems = result?.issues.filter((issue) => issue.code === "duplicate") ?? [];
  const riskyProblems = result?.issues.filter((issue) => issue.code === "risky") ?? [];

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
    >
      <section
        className="dialog add-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-panel-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">ADD TO THIS PLACE</p>
            <h2 id="add-panel-title">新增項目</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            aria-label="關閉新增面板"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitInputs(textInputs);
          }}
        >
          <label>
            貼上網址或路徑
            <textarea
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={"https://www.youtube.com\n或 C:\\Users\\你\\Documents"}
              rows={3}
              autoFocus
            />
          </label>
          <p className="form-hint">每行可放一個網址或路徑；名稱、類型與圖示會自動處理。</p>
          <div className="add-panel-actions">
            <button
              type="submit"
              className="button primary"
              disabled={busy || Boolean(result) || textInputs.length === 0}
            >
              {busy ? "加入中…" : "加入"}
            </button>
            <span aria-hidden="true">或</span>
            <button
              type="button"
              className="button secondary"
              disabled={busy || Boolean(result)}
              onClick={() => void chooseFiles()}
            >
              選擇檔案
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy || Boolean(result)}
              onClick={() => void chooseFolder()}
            >
              選擇資料夾
            </button>
          </div>
        </form>

        <div className="add-drop-hint">
          <span aria-hidden="true">＋</span>
          <div>
            <strong>也可以直接拖進視窗</strong>
            <small>支援多個檔案、EXE、捷徑與資料夾</small>
          </div>
        </div>

        {result && (
          <IngestResultPanel
            result={result}
            busy={busy}
            onDismiss={() => {
              approvalsRef.current.clear();
              setResult(null);
            }}
            onRetryDuplicates={() =>
              void retryProblems(duplicateProblems, "duplicate")
            }
            onConfirmRisky={() =>
              void retryProblems(riskyProblems, "risky")
            }
          />
        )}
      </section>
    </div>
  );
}

export {
  approveAndGroupProblems,
  canStartNewIngest,
  combineIngestResults,
  ingestFailureResult,
  inputApprovalKey,
  mergeIngestRetryResult,
  parseInputLines,
};
