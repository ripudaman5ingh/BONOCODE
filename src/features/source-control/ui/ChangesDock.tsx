import { DockFrame } from "../../workspace/ui/DockFrame";
import { type DockSide } from "../../projects/model/projectTerminal";
import { ALT, MOD } from "../../../platform/tauri/platform";
import { lazySurface } from "../../../shared/ui/lazySurface";

const WorkingTreeDiff = lazySurface(async () => {
  const module = await import("./WorkingTreeDiff");
  return { default: module.WorkingTreeDiff };
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
};

export function ChangesDock({ gitCwd, ...frame }: Props) {
  return (
    <DockFrame title="Changes" hideShortcut={`${MOD}${ALT}B`} {...frame}>
      <div className="absolute inset-0 h-full">
        <WorkingTreeDiff cwd={gitCwd} />
      </div>
    </DockFrame>
  );
}
