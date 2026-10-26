import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { newTerminalFile } from "../../workspace/model/layout";
import { orderByIds } from "../../../shared/lib/reorder";
import {
  addTerminalToDock,
  applyDockGridStyle,
  closeTerminalInDock,
  createProjectTerminal,
  findProjectTerminal,
  mapProjectTerminal,
  nextDockTerminalTitle,
  reorderDockTerminals,
  selectDockTerminal,
  withDockOpen,
  withDockSide,
  withDockSize,
  type DockSide,
  type ProjectTerminalDock as ProjectTerminal,
} from "../../projects/model/projectTerminal";
import { type WindowTransferPayload } from "../../../app/model/windowTransfer";
import { confirmCloseTerminal, confirmCloseTerminals } from "../model/terminalClose";
import { isLocalProject } from "../../projects/model/recents";
import { type ResumedWorkspace } from "../../../app/model/appLifecycle";

export type UseTerminalDockDeps = {
  windowTransfer: WindowTransferPayload | null;
  resumed: ResumedWorkspace | null;
  projectCwd: string;
  projectCwdRef: { current: string };
  gitCwd: string;
  setComposerFocused: (value: boolean) => void;
  onOpenTerminal: (cwd: string) => void;
};

export function useTerminalDock(deps: UseTerminalDockDeps) {
  const {
    windowTransfer,
    resumed,
    projectCwd,
    projectCwdRef,
    gitCwd,
    setComposerFocused,
    onOpenTerminal,
  } = deps;

  const [projectTerminals, setProjectTerminals] = useState<ProjectTerminal[]>(
    () => windowTransfer?.projectTerminals ?? resumed?.projectTerminals ?? [],
  );

  /** Dock side a brand-new project's terminal starts with, persisted in the workspace snapshot. */
  const [lastDockSide, setLastDockSide] = useState<DockSide | null>(
    () => resumed?.lastDockSide ?? null,
  );
  const lastDockSideRef = useRef(lastDockSide);
  lastDockSideRef.current = lastDockSide;

  const [projectTerminalFocused, setProjectTerminalFocused] = useState(false);

  const currentProjectDock = findProjectTerminal(projectTerminals, projectCwd);
  const dockVisible = !!currentProjectDock?.open;

  const projectTerminalsRef = useRef(projectTerminals);
  projectTerminalsRef.current = projectTerminals;
  const projectTerminalFocusedRef = useRef(projectTerminalFocused);
  projectTerminalFocusedRef.current = projectTerminalFocused;

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
  }, [gitCwd, focusProjectTerminal, onOpenTerminal, projectCwd]);

  const onToggleProjectTerminal = useCallback(() => {
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
  }, [gitCwd, focusProjectTerminal, openProjectTerminal, projectCwd]);

  const onHideProjectTerminal = useCallback(() => {
    setProjectTerminals((prev) =>
      mapProjectTerminal(prev, projectCwdRef.current, (dock) =>
        withDockOpen(dock, false),
      ),
    );
    setProjectTerminalFocused(false);
  }, []);

  const onProjectTerminalSide = useCallback((side: DockSide) => {
    setLastDockSide(side);
    setProjectTerminals((prev) =>
      mapProjectTerminal(prev, projectCwdRef.current, (dock) =>
        withDockSide(dock, side, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      ),
    );
  }, []);

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

  const dockGridRef = useRef<HTMLDivElement>(null);
  const dockDragSize = useRef<number | null>(null);
  const paintDockSize = useCallback((size: number) => {
    const dock = findProjectTerminal(
      projectTerminalsRef.current,
      projectCwdRef.current,
    );
    const el = dockGridRef.current;
    if (!dock || !el) return;
    dockDragSize.current = size;
    applyDockGridStyle(el, dock.side, size);
  }, []);
  const commitDockSize = useCallback(
    (size: number) => {
      dockDragSize.current = null;
      onProjectTerminalSize(size);
    },
    [onProjectTerminalSize],
  );
  useLayoutEffect(() => {
    if (dockDragSize.current != null) return;
    const el = dockGridRef.current;
    if (!el) return;
    applyDockGridStyle(
      el,
      dockVisible && currentProjectDock ? currentProjectDock.side : null,
      currentProjectDock?.size ?? 0,
    );
  }, [currentProjectDock, dockVisible]);

  return {
    projectTerminals,
    setProjectTerminals,
    lastDockSide,
    lastDockSideRef,
    projectTerminalFocused,
    setProjectTerminalFocused,
    currentProjectDock,
    projectTerminalsRef,
    projectTerminalFocusedRef,
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
    dockGridRef,
    paintDockSize,
    commitDockSize,
  };
}
