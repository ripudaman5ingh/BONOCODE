import { DockFrame } from "../../workspace/ui/DockFrame";
import { type DockSide } from "../../projects/model/projectTerminal";
import { ALT, MOD } from "../../../platform/tauri/platform";
import { lazySurface } from "../../../shared/ui/lazySurface";

const EditableChanges = lazySurface(async () => {
  const module = await import("./EditableChanges");
  return { default: module.EditableChanges };
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
};

export function ChangesDock({ gitCwd, onOpenFile, onDirtyChange, ...frame }: Props) {
  return (
    <DockFrame title="Changes" hideShortcut={`${MOD}${ALT}B`} {...frame}>
      <div className="absolute inset-0 h-full">
        <EditableChanges
          cwd={gitCwd}
          onOpenFile={onOpenFile}
          onDirtyChange={onDirtyChange}
        />
      </div>
    </DockFrame>
  );
}
