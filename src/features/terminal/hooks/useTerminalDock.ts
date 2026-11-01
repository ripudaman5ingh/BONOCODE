import { useCallback, useEffect } from "react";
import { newTerminalFile } from "../../workspace/model/layout";
import { orderByIds } from "../../../shared/lib/reorder";
import {
  addTerminalToDock,
  closeTerminalInDock,
  createProjectTerminal,
  findProjectTerminal,
  mapProjectTerminal,
  nextDockTerminalTitle,
  reorderDockTerminals,
  selectDockTerminal,
  withDockOpen,
  withDockSize,
  type DockSide,
} from "../../projects/model/projectTerminal";
import { confirmCloseTerminal, confirmCloseTerminals } from "../model/terminalClose";
import { isLocalProject } from "../../projects/model/recents";
import { useWorkspaceStore, type WorkspaceStore } from "../../workspace/model/workspaceStore";
import { moveWorkspaceDock } from "../../workspace/hooks/useChangesDock";

export type UseTerminalDockDeps = {
  workspace: WorkspaceStore;
  gitCwd: string;
  setComposerFocused: (value: boolean) => void;
  onOpenTerminal: (cwd: string) => void;
};

export function useTerminalDock(deps: UseTerminalDockDeps) {
  const {
    workspace,
    gitCwd,
    setComposerFocused,
    onOpenTerminal,
  } = deps;
  const {
    projectCwdRef,
    setProjectTerminals,
    projectTerminalsRef,
    setLastDockSide,
    lastDockSideRef,
    setProjectTerminalFocused,
  } = workspace;
  // Render-time copies for effects and JSX only. Callbacks read live state.
  const projectCwd = useWorkspaceStore(workspace, (state) => state.projectCwd);
  const projectTerminals = useWorkspaceStore(
    workspace,
    (state) => state.projectTerminals,
  );
  const projectTerminalFocused = useWorkspaceStore(
    workspace,
    (state) => state.projectTerminalFocused,
  );

  const currentProjectDock = findProjectTerminal(projectTerminals, projectCwd);
  const dockVisible = !!currentProjectDock?.open;

  const focusProjectTerminal = useCallback(() => {
    setProjectTerminalFocused(true);
    setComposerFocused(false);
  }, []);

  const openProjectTerminal = useCallback(
    (cwd: string) => {
      const workdir = cwd || projectCwdRef.current;
      const projectPath = projectCwdRef.current;
      if (!isLocalProject(projectPath)) return false;
      setProjectTerminals((prev) => {
        const existing = findProjectTerminal(prev, projectPath);
        const file = newTerminalFile(
          workdir,
          existing ? nextDockTerminalTitle(existing, workdir) : undefined,
          projectPath,
        );
        if (!existing) {
          return [
            ...prev,
            createProjectTerminal(
              projectPath,
              file,
              lastDockSideRef.current ?? "bottom",
            ),
          ];
        }
        return mapProjectTerminal(prev, projectPath, (dock) =>
          addTerminalToDock(dock, file),
        );
      });
      focusProjectTerminal();
      return true;
    },
    [focusProjectTerminal],
  );

  const onShowProjectTerminal = useCallback(() => {
    const projectCwd = projectCwdRef.current;
    const dock = findProjectTerminal(projectTerminalsRef.current, projectCwd);
    if (dock && dock.pane.files.length > 0) {
      if (!dock.open) {
        setProjectTerminals((prev) =>
          mapProjectTerminal(prev, projectCwd, (entry) =>
            withDockOpen(entry, true),
          ),
        );
      }
      focusProjectTerminal();
      return;
    }
    onOpenTerminal(gitCwd);
  }, [gitCwd, focusProjectTerminal, onOpenTerminal]);

  const onToggleProjectTerminal = useCallback(() => {
    const projectCwd = projectCwdRef.current;
    if (!isLocalProject(projectCwd)) return;
    const dock = findProjectTerminal(projectTerminalsRef.current, projectCwd);
    if (!dock) {
      openProjectTerminal(gitCwd);
      return;
    }
    const nextOpen = !dock.open;
    setProjectTerminals((prev) =>
      mapProjectTerminal(prev, projectCwd, (entry) =>
        withDockOpen(entry, nextOpen),
      ),
    );
    if (nextOpen) focusProjectTerminal();
    else setProjectTerminalFocused(false);
  }, [gitCwd, focusProjectTerminal, openProjectTerminal]);

  const onHideProjectTerminal = useCallback(() => {
    setProjectTerminals((prev) =>
      mapProjectTerminal(prev, projectCwdRef.current, (dock) =>
        withDockOpen(dock, false),
      ),
    );
    setProjectTerminalFocused(false);
  }, []);

  const onProjectTerminalSide = useCallback(
    (side: DockSide) => {
      setLastDockSide(side);
      moveWorkspaceDock(workspace, "terminal", side);
    },
    [workspace],
  );

  const onProjectTerminalSize = useCallback((size: number) => {
    setProjectTerminals((prev) =>
      mapProjectTerminal(prev, projectCwdRef.current, (dock) =>
        withDockSize(dock, size, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      ),
    );
  }, []);

  const onSelectProjectTerminal = useCallback(
    (fileId: string) => {
      setProjectTerminals((prev) =>
        mapProjectTerminal(prev, projectCwdRef.current, (dock) =>
          selectDockTerminal(dock, fileId),
        ),
      );
      focusProjectTerminal();
    },
    [focusProjectTerminal],
  );

  const onReorderProjectTerminals = useCallback((ids: string[]) => {
    setProjectTerminals((prev) =>
      mapProjectTerminal(prev, projectCwdRef.current, (dock) =>
        reorderDockTerminals(dock, orderByIds(dock.pane.files, ids)),
      ),
    );
  }, []);

  const onCloseProjectTerminal = useCallback((fileId: string) => {
    const dock = findProjectTerminal(
      projectTerminalsRef.current,
      projectCwdRef.current,
    );
    const file = dock?.pane.files.find((entry) => entry.id === fileId);
    if (!file) return;
    const finishClose = () => {
      setProjectTerminals((prev) =>
        mapProjectTerminal(prev, projectCwdRef.current, (entry) =>
          closeTerminalInDock(entry, fileId),
        ),
      );
    };
    void confirmCloseTerminal(file).then((ok) => ok && finishClose());
  }, []);

  const onCloseOtherProjectTerminals = useCallback((fileId: string) => {
    const projectPath = projectCwdRef.current;
    const dock = findProjectTerminal(projectTerminalsRef.current, projectPath);
    if (!dock?.pane.files.some((file) => file.id === fileId)) return;
    const closingFiles = dock.pane.files.filter((file) => file.id !== fileId);
    if (closingFiles.length === 0) return;
    const closingIds = new Set(closingFiles.map((file) => file.id));

    const finishClose = () => {
      setProjectTerminals((prev) =>
        mapProjectTerminal(prev, projectPath, (entry) => {
          if (!entry.pane.files.some((file) => file.id === fileId)) {
            return entry;
          }
          const files = entry.pane.files.filter(
            (file) => !closingIds.has(file.id),
          );
          return {
            ...entry,
            pane: { ...entry.pane, files, activeFileId: fileId },
          };
        }),
      );
    };

    void confirmCloseTerminals(closingFiles).then((ok) => ok && finishClose());
  }, []);

  useEffect(() => {
    if (!dockVisible) setProjectTerminalFocused(false);
  }, [dockVisible]);

  return {
    projectTerminals,
    projectTerminalFocused,
    currentProjectDock,
    focusProjectTerminal,
    openProjectTerminal,
    onShowProjectTerminal,
    onToggleProjectTerminal,
    onHideProjectTerminal,
    onProjectTerminalSide,
    onSelectProjectTerminal,
    onReorderProjectTerminals,
    onCloseProjectTerminal,
    onCloseOtherProjectTerminals,
    onProjectTerminalSize,
  };
}
