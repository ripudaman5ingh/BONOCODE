import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ProjectTerminalDock } from "../../features/terminal/ui/ProjectTerminalDock";
import { ChangesDock } from "../../features/source-control/ui/ChangesDock";
import { sameProjectPath } from "../../features/projects/model/recents";
import {
  applyDockLayoutStyle,
  dockLayoutStyle,
  openDocks,
  resolveDockSides,
  type DockSurface,
} from "../../features/workspace/model/dockLayout";
import type { TerminalMetaPatch } from "../../features/terminal/model/terminalTab";
import type { useTerminalDock } from "../../features/terminal/hooks/useTerminalDock";
import type { useChangesDock } from "../../features/workspace/hooks/useChangesDock";

type Props = {
  projectCwd: string;
  gitCwd: string;
  terminalDock: ReturnType<typeof useTerminalDock>;
  changes: ReturnType<typeof useChangesDock>;
  onAddTerminal: () => void;
  onTerminalMetaChange: (fileId: string, patch: TerminalMetaPatch) => void;
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
  children,
}: Props) {
  const { projectTerminals, projectTerminalFocused, currentProjectDock } =
    terminalDock;
  const { changesDock } = changes;
  const docks = resolveDockSides(
    openDocks({ terminal: currentProjectDock, changes: changesDock }),
  );
  const sideOf = (surface: DockSurface) =>
    docks.find((dock) => dock.surface === surface)?.side;
  const terminalSide = sideOf("terminal");
  const changesSide = sideOf("changes");

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
          <ChangesDock
            gitCwd={gitCwd}
            side={changesSide}
            size={changesDock.size}
            onFocus={changes.onFocusChangesDock}
            onHide={changes.onHideChangesDock}
            onSideChange={changes.onChangesDockSide}
            onSizePaint={paint("changes")}
            onSizeCommit={commit(changes.onChangesDockSize)}
          />
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
