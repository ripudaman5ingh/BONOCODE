import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ProjectTerminalDock } from "../../features/terminal/ui/ProjectTerminalDock";
import { ChangesDock } from "../../features/source-control/ui/ChangesDock";
import { ChangesDockRail } from "../../features/source-control/ui/ChangesDockRail";
import { sameProjectPath } from "../../features/projects/model/recents";
import {
  applyDockLayoutStyle,
  dockLayoutStyle,
  layoutDocks,
  resolveDockSides,
  type DockSurface,
} from "../../features/workspace/model/dockLayout";
import type { TerminalMetaPatch } from "../../features/terminal/model/terminalTab";
import type { useTerminalDock } from "../../features/terminal/hooks/useTerminalDock";
import type { useChangesDock } from "../../features/workspace/hooks/useChangesDock";
import type { HarnessId, LinkedWorkItem } from "../../features/sessions/model/session";
import type { GitHistoryCommit } from "../../platform/tauri/fs";
import type { GitCiRepair } from "../../features/source-control/ui/GitChangesPanel";

type Props = {
  projectCwd: string;
  gitCwd: string;
  terminalDock: ReturnType<typeof useTerminalDock>;
  changes: ReturnType<typeof useChangesDock>;
  onAddTerminal: () => void;
  onTerminalMetaChange: (fileId: string, patch: TerminalMetaPatch) => void;
  onOpenFile: (path: string) => void;
  textHarness?: HarnessId;
  selectedSha?: string;
  onOpenCommit: (commit: GitHistoryCommit, pin?: boolean) => void;
  ciRepair?: GitCiRepair;
  onOpenPr?: (item: LinkedWorkItem) => void;
  /** The main area: the workspace tabs. */
  children: ReactNode;
};

/** The dock grid: per-project terminal docks, the changes dock and the main area. */
export function WorkspaceDocks({
  projectCwd,
  gitCwd,
  terminalDock,
  changes,
  onAddTerminal,
  onTerminalMetaChange,
  onOpenFile,
  textHarness,
  selectedSha,
  onOpenCommit,
  ciRepair,
  onOpenPr,
  children,
}: Props) {
  const { projectTerminals, projectTerminalFocused, currentProjectDock } =
    terminalDock;
  const { changesDock } = changes;
  // Without a project there is no diff to count, so a closed dock leaves no rail.
  const hasProject = Boolean(gitCwd) && gitCwd !== "~";
  const docks = resolveDockSides(
    layoutDocks(
      { terminal: currentProjectDock, changes: changesDock },
      { changes: hasProject },
    ),
  );
  const sideOf = (surface: DockSurface) =>
    docks.find((dock) => dock.surface === surface)?.side;
  const terminalSide = sideOf("terminal");
  const changesEntry = docks.find((dock) => dock.surface === "changes");
  const changesSide = changesEntry?.side;

  // While a sash is dragged the grid is painted directly, every frame, and the
  // store only hears about the size on release.
  const gridRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const style = dockLayoutStyle(docks);
  const paint = (surface: DockSurface) => (size: number) => {
    const el = gridRef.current;
    if (!el) return;
    dragging.current = true;
    applyDockLayoutStyle(
      el,
      docks.map((dock) => (dock.surface === surface ? { ...dock, size } : dock)),
    );
  };
  const commit = (onCommit: (size: number) => void) => (size: number) => {
    dragging.current = false;
    onCommit(size);
  };
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (dragging.current || !el) return;
    el.style.gridTemplateRows = style.gridTemplateRows;
    el.style.gridTemplateColumns = style.gridTemplateColumns;
    el.style.gridTemplateAreas = style.gridTemplateAreas;
  }, [style.gridTemplateRows, style.gridTemplateColumns, style.gridTemplateAreas]);

  return (
    <div ref={gridRef} className="grid h-full min-h-0 min-w-0 flex-1">
      {projectTerminals.map((dock) => {
        const show = dock.open && sameProjectPath(dock.projectPath, projectCwd);
        const side = (show && terminalSide) || dock.side;
        return (
          <div
            key={dock.projectPath}
            className={
              show ? "h-full min-h-0 min-w-0 w-full overflow-hidden" : "hidden"
            }
            style={show ? { gridArea: side } : undefined}
            aria-hidden={!show}
          >
            <ProjectTerminalDock
              dock={dock}
              side={side}
              focused={show && projectTerminalFocused}
              onFocus={terminalDock.focusProjectTerminal}
              onHide={terminalDock.onHideProjectTerminal}
              onSideChange={terminalDock.onProjectTerminalSide}
              onSizePaint={paint("terminal")}
              onSizeCommit={commit(terminalDock.onProjectTerminalSize)}
              onAddTerminal={onAddTerminal}
              onSelectTerminal={terminalDock.onSelectProjectTerminal}
              onCloseTerminal={terminalDock.onCloseProjectTerminal}
              onCloseOtherTerminals={terminalDock.onCloseOtherProjectTerminals}
              onReorderTerminals={terminalDock.onReorderProjectTerminals}
              onTerminalMetaChange={onTerminalMetaChange}
            />
          </div>
        );
      })}
      {changesSide ? (
        <div
          className="h-full min-h-0 min-w-0 w-full overflow-hidden"
          style={{ gridArea: changesSide }}
        >
          {changesEntry?.collapsed ? (
            <ChangesDockRail
              gitCwd={gitCwd}
              side={changesSide}
              onShow={changes.onShowChangesDock}
            />
          ) : (
            <ChangesDock
              gitCwd={gitCwd}
              side={changesSide}
              size={changesDock.size}
              onFocus={changes.onFocusChangesDock}
              onHide={changes.onHideChangesDock}
              onSideChange={changes.onChangesDockSide}
              onSizePaint={paint("changes")}
              onSizeCommit={commit(changes.onChangesDockSize)}
              onOpenFile={onOpenFile}
              onDirtyChange={changes.onChangesDirty}
              textHarness={textHarness}
              selectedSha={selectedSha}
              onOpenCommit={onOpenCommit}
              ciRepair={ciRepair}
              onOpenPr={onOpenPr}
            />
          )}
        </div>
      ) : null}
      <div
        className="relative flex min-h-0 min-w-0 flex-row"
        style={{ gridArea: "main" }}
      >
        <div className="relative min-h-0 min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
