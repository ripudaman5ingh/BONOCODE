import { Plus } from "../../../shared/ui/icons";
import { SurfaceTabs } from "../../workspace/ui/SurfaceTabs";
import { DockFrame } from "../../workspace/ui/DockFrame";
import { IconButton } from "../../../app/shell/TitleBar";
import {
  type DockSide,
  type ProjectTerminalDock,
} from "../../projects/model/projectTerminal";
import { MOD } from "../../../platform/tauri/platform";
import type { TerminalMetaPatch } from "../model/terminalTab";
import { lazySurface } from "../../../shared/ui/lazySurface";

const TerminalView = lazySurface(async () => {
  const module = await import("./TerminalView");
  return { default: module.TerminalView };
});

type Props = {
  dock: ProjectTerminalDock;
  /** The side it is drawn on, which can differ from the saved one when another dock holds it. */
  side: DockSide;
  focused: boolean;
  onFocus: () => void;
  onHide: () => void;
  onSideChange: (side: DockSide) => void;
  onSizePaint: (size: number) => void;
  onSizeCommit: (size: number) => void;
  onAddTerminal: () => void;
  onSelectTerminal: (fileId: string) => void;
  onCloseTerminal: (fileId: string) => void;
  onCloseOtherTerminals: (fileId: string) => void;
  onReorderTerminals: (ids: string[]) => void;
  onTerminalMetaChange?: (fileId: string, patch: TerminalMetaPatch) => void;
};

export function ProjectTerminalDock({
  dock,
  side,
  focused,
  onFocus,
  onHide,
  onSideChange,
  onSizePaint,
  onSizeCommit,
  onAddTerminal,
  onSelectTerminal,
  onCloseTerminal,
  onCloseOtherTerminals,
  onReorderTerminals,
  onTerminalMetaChange,
}: Props) {
  return (
    <DockFrame
      title="Terminal"
      side={side}
      size={dock.size}
      hideShortcut={`${MOD}J`}
      onFocus={onFocus}
      onHide={onHide}
      onSideChange={onSideChange}
      onSizePaint={onSizePaint}
      onSizeCommit={onSizeCommit}
      actions={
        <IconButton label={`New Terminal (${MOD}\`)`} onClick={onAddTerminal}>
          <Plus className="size-3.5" strokeWidth={1.75} />
        </IconButton>
      }
      renderBody={(controls) => (
        <>
          <SurfaceTabs
            files={dock.pane.files}
            activeFileId={dock.pane.activeFileId}
            dirtyFileIds={EMPTY_IDS}
            fileErrorCounts={EMPTY_ERRORS}
            label="Terminals"
            onSelectFile={onSelectTerminal}
            onCloseFile={onCloseTerminal}
            onCloseOtherFiles={onCloseOtherTerminals}
            onReorder={onReorderTerminals}
            trailing={controls}
          />
          {/* Same wrapper DockFrame gives a body; the terminals must stay under it. */}
          <div className="relative min-h-0 min-w-0 flex-1">
            {dock.pane.files.map((file) => (
              <div
                key={file.id}
                aria-hidden={file.id !== dock.pane.activeFileId}
                className={
                  file.id === dock.pane.activeFileId
                    ? "absolute inset-0 h-full"
                    : "hidden"
                }
              >
                <TerminalView
                  id={file.id}
                  cwd={file.cwd}
                  active={focused && file.id === dock.pane.activeFileId}
                  onMetaChange={(patch) => onTerminalMetaChange?.(file.id, patch)}
                />
              </div>
            ))}
          </div>
        </>
      )}
    />
  );
}

const EMPTY_IDS = new Set<string>();
const EMPTY_ERRORS = new Map<string, number>();
