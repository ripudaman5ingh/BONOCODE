import type { HarnessId, LinkedWorkItem } from "../../sessions/model/session";
import type { GitFileDiffKind, GitHistoryCommit } from "../../../platform/tauri/fs";
import { GitChangesPanel, type GitCiRepair } from "./GitChangesPanel";

type Props = {
  cwd: string;
  enabled: boolean;
  textHarness?: HarnessId;
  selectedPath?: string;
  selectedKind?: GitFileDiffKind;
  selectedSha?: string;
  onOpenFile: (path: string, kind: GitFileDiffKind) => void;
  onOpenAllChanges: (kind: GitFileDiffKind) => void;
  onOpenCommit: (commit: GitHistoryCommit) => void;
  ciRepair?: GitCiRepair;
  onOpenPr?: (item: LinkedWorkItem) => void;
};

export function SourceControl({
  cwd,
  enabled,
  textHarness,
  selectedPath,
  selectedKind,
  selectedSha,
  onOpenFile,
  onOpenAllChanges,
  onOpenCommit,
  ciRepair,
  onOpenPr,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <GitChangesPanel
        key={cwd}
        cwd={cwd}
        enabled={enabled}
        textHarness={textHarness}
        selectedPath={selectedPath}
        selectedKind={selectedKind}
        selectedSha={selectedSha}
        onOpenFile={onOpenFile}
        onOpenAllChanges={onOpenAllChanges}
        onOpenCommit={onOpenCommit}
        ciRepair={ciRepair}
        onOpenPr={onOpenPr}
      />
    </div>
  );
}
