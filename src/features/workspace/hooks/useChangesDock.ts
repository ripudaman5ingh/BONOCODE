import { useCallback } from "react";
import {
  clampDockSize,
  findProjectTerminal,
  mapProjectTerminal,
  type DockSide,
} from "../../projects/model/projectTerminal";
import { moveDockToSide, type DockSurface } from "../model/dockLayout";
import { useWorkspaceStore, type WorkspaceStore } from "../model/workspaceStore";

/** The dirty-file id of an unsaved edit in the changes dock. */
export function changesDockDirtyId(path: string): string {
  return `changes-dock:${path}`;
}

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
  const { setChangesDock, setProjectTerminalFocused, setDirtyFiles } = workspace;

  const onToggleChangesDock = useCallback(() => {
    setChangesDock((dock) => ({ ...dock, open: !dock.open }));
  }, [setChangesDock]);

  const onHideChangesDock = useCallback(() => {
    setChangesDock((dock) => (dock.open ? { ...dock, open: false } : dock));
  }, [setChangesDock]);

  /** The rail's click: reopens the dock where it was hidden. */
  const onShowChangesDock = useCallback(() => {
    setChangesDock((dock) => (dock.open ? dock : { ...dock, open: true }));
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

  /** Unsaved edits in the dock count as dirty files, so a reload asks first. */
  const onChangesDirty = useCallback(
    (path: string, dirty: boolean) => {
      const id = changesDockDirtyId(path);
      setDirtyFiles((prev) => {
        if (prev.has(id) === dirty) return prev;
        const next = new Set(prev);
        if (dirty) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [setDirtyFiles],
  );

  return {
    changesDock,
    onChangesDirty,
    onToggleChangesDock,
    onHideChangesDock,
    onShowChangesDock,
    onChangesDockSide,
    onChangesDockSize,
    onFocusChangesDock,
  };
}
