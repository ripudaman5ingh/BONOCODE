import { DockFrame } from "../../workspace/ui/DockFrame";
import { type DockSide } from "../../projects/model/projectTerminal";
import { ALT, MOD } from "../../../platform/tauri/platform";
import { lazySurface } from "../../../shared/ui/lazySurface";
import type { HarnessId, LinkedWorkItem } from "../../sessions/model/session";
import type { GitHistoryCommit } from "../../../platform/tauri/fs";
import type { GitCiRepair } from "./GitChangesPanel";

const ChangesDockBody = lazySurface(async () => {
  const module = await import("./ChangesDockBody");
  return { default: module.ChangesDockBody };
});

type Props = {
  /** The active chat's git cwd, so a worktree chat shows its own changes. */
  gitCwd: string;
  side: DockSide;
  size: number;
  onFocus: () => void;
  onHide: () => void;
  onSideChange: (side: DockSide) => void;
  onSizePaint: (size: number) => void;
  onSizeCommit: (size: number) => void;
  onOpenFile: (path: string) => void;
  onDirtyChange: (path: string, dirty: boolean) => void;
  textHarness?: HarnessId;
  selectedSha?: string;
  onOpenCommit: (commit: GitHistoryCommit, pin?: boolean) => void;
  ciRepair?: GitCiRepair;
  onOpenPr?: (item: LinkedWorkItem) => void;
};

export function ChangesDock({
  gitCwd,
  onOpenFile,
  onDirtyChange,
  textHarness,
  selectedSha,
  onOpenCommit,
  ciRepair,
  onOpenPr,
  ...frame
}: Props) {
  return (
    <DockFrame
      title="Changes"
      hideShortcut={`${MOD}${ALT}B`}
      {...frame}
      renderBody={(controls) => (
        <ChangesDockBody
          gitCwd={gitCwd}
          headerControls={controls}
          textHarness={textHarness}
          selectedSha={selectedSha}
          onOpenFile={onOpenFile}
          onOpenCommit={onOpenCommit}
          onDirtyChange={onDirtyChange}
          ciRepair={ciRepair}
          onOpenPr={onOpenPr}
        />
      )}
    />
  );
}
