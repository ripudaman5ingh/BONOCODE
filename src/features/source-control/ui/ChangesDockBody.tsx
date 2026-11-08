import type { ReactNode } from "react";
import type { HarnessId, LinkedWorkItem } from "../../sessions/model/session";
import type { GitHistoryCommit } from "../../../platform/tauri/fs";
import { GitChangesPanel, type GitCiRepair } from "./GitChangesPanel";
import { EditableChanges } from "./EditableChanges";

type Props = {
  gitCwd: string;
  /** The dock's Move and Hide buttons, placed in the panel's header row. */
  headerControls: ReactNode;
  textHarness?: HarnessId;
  selectedSha?: string;
  onOpenFile: (path: string) => void;
  onOpenCommit: (commit: GitHistoryCommit, pin?: boolean) => void;
  onDirtyChange: (path: string, dirty: boolean) => void;
  ciRepair?: GitCiRepair;
  onOpenPr?: (item: LinkedWorkItem) => void;
  onBranchChange?: () => void;
  prChip?: { number: number; onShow: () => void };
};

/** The git panel around the editable diffs: commit, staging, PR and history. */
export function ChangesDockBody({
  gitCwd,
  headerControls,
  textHarness,
  selectedSha,
  onOpenFile,
  onOpenCommit,
  onDirtyChange,
  ciRepair,
  onOpenPr,
  onBranchChange,
  prChip,
}: Props) {
  // The key resets the panel's per-checkout state when the project changes.
  return (
    <GitChangesPanel
      key={gitCwd}
      cwd={gitCwd}
      enabled
      textHarness={textHarness}
      selectedSha={selectedSha}
      headerControls={
        <>
          {prChip ? (
            <button
              type="button"
              title="Show pull request"
              onClick={prChip.onShow}
              className="mr-1 h-6 shrink-0 rounded-md px-1.5 text-[11px] text-content/50 hover:bg-content/10 hover:text-content"
            >
              PR #{prChip.number}
            </button>
          ) : null}
          {headerControls}
        </>
      }
      onOpenCommit={onOpenCommit}
      ciRepair={ciRepair}
      onOpenPr={onOpenPr}
      onBranchChange={onBranchChange}
      renderFiles={(actions) => (
        <EditableChanges
          cwd={gitCwd}
          actions={actions}
          onOpenFile={onOpenFile}
          onDirtyChange={onDirtyChange}
        />
      )}
    />
  );
}
