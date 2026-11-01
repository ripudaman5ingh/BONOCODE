import { useCallback } from "react";
import {
  clampDockSize,
  findProjectTerminal,
  mapProjectTerminal,
  type DockSide,
} from "../../projects/model/projectTerminal";
import { moveDockToSide, type DockSurface } from "../model/dockLayout";
import { useWorkspaceStore, type WorkspaceStore } from "../model/workspaceStore";

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Moves the changes dock or the current project's terminal dock to `side`,
 * swapping the other one onto the mover's old side if it is open there.
 */
export function moveWorkspaceDock(
  workspace: WorkspaceStore,
  surface: DockSurface,
  side: DockSide,
) {
  const { projectCwd, projectTerminals, changesDock } = workspace.get();
  const terminal = findProjectTerminal(projectTerminals, projectCwd);
  const next = moveDockToSide(
    { terminal, changes: changesDock },
    surface,
    side,
    viewport(),
  );
  if (next.changes && next.changes !== changesDock) {
    workspace.setChangesDock(next.changes);
  }
  const moved = next.terminal;
  if (terminal && moved && moved !== terminal) {
    workspace.setProjectTerminals((prev) =>
      mapProjectTerminal(prev, projectCwd, (dock) => ({
        ...dock,
        side: moved.side,
        size: moved.size,
      })),
    );
  }
}

export function useChangesDock(workspace: WorkspaceStore) {
  const changesDock = useWorkspaceStore(workspace, (state) => state.changesDock);
  const { setChangesDock, setProjectTerminalFocused } = workspace;

  const onToggleChangesDock = useCallback(() => {
    setChangesDock((dock) => ({ ...dock, open: !dock.open }));
  }, [setChangesDock]);

  const onHideChangesDock = useCallback(() => {
    setChangesDock((dock) => (dock.open ? { ...dock, open: false } : dock));
  }, [setChangesDock]);

  const onChangesDockSide = useCallback(
    (side: DockSide) => moveWorkspaceDock(workspace, "changes", side),
    [workspace],
  );

  const onChangesDockSize = useCallback(
    (size: number) => {
      setChangesDock((dock) => {
        const next = clampDockSize(dock.side, size, viewport());
        return next === dock.size ? dock : { ...dock, size: next };
      });
    },
    [setChangesDock],
  );

  /** Clicking into the dock takes keyboard focus away from the terminal. */
  const onFocusChangesDock = useCallback(() => {
    setProjectTerminalFocused(false);
  }, [setProjectTerminalFocused]);

  return {
    changesDock,
    onToggleChangesDock,
    onHideChangesDock,
    onChangesDockSide,
    onChangesDockSize,
    onFocusChangesDock,
  };
}
