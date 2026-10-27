import { useCallback } from "react";
import { forgetHarnessSession } from "../../../integrations/harness";
import { isLocalProject } from "../../projects/model/recents";
import { isBlankSession } from "../../projects/model/projectReturn";
import { mapProjectTerminal, patchProjectTerminals, selectDockTerminal, withDockOpen } from "../../projects/model/projectTerminal";
import { sessionWorkCwd } from "../../sessions/model/session";
import type { LiveSessionStore } from "../../sessions/model/liveSessions";
import { newTerminalFile, newTerminalWorkspaceTab, nextTerminalTitle, openTerminalTab, updateTerminalTab, withSurfacePanes, type WorkspaceTab } from "../../workspace/model/layout";
import { planWorkspaceTabClose } from "../../workspace/model/workspaceTabGroups";
import type { useProjectState } from "../../projects/hooks/useProjectState";
import type { useSessionHistory } from "../../sessions/hooks/useSessionHistory";
import type { useWorkspaceTabActions } from "../../workspace/hooks/useWorkspaceTabActions";
import type { useWorkspaceTabState } from "../../workspace/hooks/useWorkspaceTabState";
import type { TerminalMetaPatch } from "../model/terminalTab";
import type { useTerminalDock } from "./useTerminalDock";

export type UseTerminalTabActionsDeps = {
  gitCwd: string;
  projectCwd: string;
  sidebarCwd: string;
  activeTab: WorkspaceTab | undefined;
  tabCloseScope: "project";
  appendTab: ReturnType<typeof useWorkspaceTabActions>["appendTab"];
  onClosePane: ReturnType<typeof useWorkspaceTabActions>["onClosePane"];
  onCloseTab: ReturnType<typeof useWorkspaceTabActions>["onCloseTab"];
  onCloseTabs: ReturnType<typeof useWorkspaceTabActions>["onCloseTabs"];
  setActiveTabId: ReturnType<typeof useWorkspaceTabState>["setActiveTabId"];
  setComposerFocused: ReturnType<typeof useWorkspaceTabState>["setComposerFocused"];
  setTabs: ReturnType<typeof useWorkspaceTabState>["setTabs"];
  tabsRef: ReturnType<typeof useWorkspaceTabState>["tabsRef"];
  activeTabIdRef: ReturnType<typeof useWorkspaceTabState>["activeTabIdRef"];
  projectCwdRef: ReturnType<typeof useProjectState>["projectCwdRef"];
  projectTerminalsRef: ReturnType<typeof useTerminalDock>["projectTerminalsRef"];
  setProjectTerminals: ReturnType<typeof useTerminalDock>["setProjectTerminals"];
  setProjectTerminalFocused: ReturnType<typeof useTerminalDock>["setProjectTerminalFocused"];
  openProjectTerminal: ReturnType<typeof useTerminalDock>["openProjectTerminal"];
  focusProjectTerminal: ReturnType<typeof useTerminalDock>["focusProjectTerminal"];
  sessionsRef: LiveSessionStore["ref"];
  setSessions: LiveSessionStore["set"];
  lastPersisted: ReturnType<typeof useSessionHistory>["lastPersisted"];
};

export function useTerminalTabActions(deps: UseTerminalTabActionsDeps) {
  const {
    gitCwd,
    projectCwd,
    sidebarCwd,
    activeTab,
    tabCloseScope,
    appendTab,
    onClosePane,
    onCloseTab,
    onCloseTabs,
    setActiveTabId,
    setComposerFocused,
    setTabs,
    tabsRef,
    activeTabIdRef,
    projectCwdRef,
    projectTerminalsRef,
    setProjectTerminals,
    setProjectTerminalFocused,
    openProjectTerminal,
    focusProjectTerminal,
    sessionsRef,
    setSessions,
    lastPersisted,
  } = deps;

  const onOpenTerminal = useCallback(
    (cwd: string, asWorkspaceTab = false, occupySessionId?: string) => {
      const workdir = cwd || gitCwd;
      if (!isLocalProject(projectCwdRef.current) || !isLocalProject(workdir)) return;
      if (openProjectTerminal(workdir)) return;

      if (asWorkspaceTab || !activeTab) {
        const file = newTerminalFile(workdir, undefined, sidebarCwd);
        const tab = newTerminalWorkspaceTab(file);
        appendTab(tab, sidebarCwd);
        setActiveTabId(tab.id);
        setComposerFocused(false);
        return;
      }

      const occupying = sessionsRef.current.find(
        (session) => session.id === (occupySessionId ?? activeTab.focusedId),
      );
      const occupyPaneId =
        occupying && isBlankSession(occupying) ? occupying.id : undefined;
      if (occupyPaneId && occupying) {
        lastPersisted.current.delete(occupyPaneId);
        void forgetHarnessSession(occupying.harness, occupyPaneId);
        setSessions((prev) =>
          prev.filter((session) => session.id !== occupyPaneId),
        );
      }

      const file = newTerminalFile(
        workdir,
        nextTerminalTitle(activeTab, workdir),
        sidebarCwd,
      );
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTab.id
            ? openTerminalTab(tab, file, occupyPaneId)
            : tab,
        ),
      );
      setComposerFocused(false);
    },
    [gitCwd, activeTab, appendTab, openProjectTerminal, sidebarCwd],
  );

  const onNewTerminal = useCallback(() => {
    onOpenTerminal(gitCwd);
  }, [gitCwd, onOpenTerminal]);

  const onNewTerminalInSession = useCallback(
    (sessionId: string) => {
      const session = sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      if (session?.worktreeRemoved) return;
      onOpenTerminal(
        session ? sessionWorkCwd(session) : projectCwd,
        false,
        sessionId,
      );
    },
    [onOpenTerminal, projectCwd],
  );

  const onTerminalMetaChange = useCallback(
    (fileId: string, patch: TerminalMetaPatch) => {
      setProjectTerminals((prev) => patchProjectTerminals(prev, fileId, patch));
      setTabs((prev) =>
        prev.map((tab) => updateTerminalTab(tab, fileId, patch)),
      );
    },
    [],
  );

  const onToggleRunningTerminal = useCallback(
    (fileId: string) => {
      const dock = projectTerminalsRef.current.find((entry) =>
        entry.pane.files.some((file) => file.id === fileId),
      );
      if (dock) {
        if (dock.open) {
          setProjectTerminals((prev) =>
            mapProjectTerminal(prev, dock.projectPath, (entry) =>
              withDockOpen(entry, false),
            ),
          );
          setProjectTerminalFocused(false);
          return;
        }
        setProjectTerminals((prev) =>
          mapProjectTerminal(prev, dock.projectPath, (entry) =>
            withDockOpen(selectDockTerminal(entry, fileId), true),
          ),
        );
        focusProjectTerminal();
        return;
      }
      for (const tab of tabsRef.current) {
        for (const pane of tab.terminalPanes ?? []) {
          if (!pane.files.some((file) => file.id === fileId)) continue;
          const showing =
            activeTabIdRef.current === tab.id &&
            tab.focusedId === pane.id &&
            pane.activeFileId === fileId;
          if (showing) {
            setComposerFocused(true);
            setProjectTerminalFocused(false);
            return;
          }
          setActiveTabId(tab.id);
          setTabs((prev) =>
            prev.map((entry) => {
              if (entry.id !== tab.id) return entry;
              return withSurfacePanes(
                { ...entry, focusedId: pane.id },
                "terminal",
                (entry.terminalPanes ?? []).map((item) =>
                  item.id === pane.id
                    ? { ...item, activeFileId: fileId }
                    : item,
                ),
              );
            }),
          );
          setProjectTerminalFocused(false);
          setComposerFocused(false);
          return;
        }
      }
    },
    [focusProjectTerminal],
  );

  const onNewTerminalTab = useCallback(() => {
    onOpenTerminal(gitCwd, true);
  }, [gitCwd, onOpenTerminal]);

  const onCloseOtherTabs = useCallback(() => {
    const current = tabsRef.current;
    const activeId = activeTabIdRef.current;
    if (!current.some((tab) => tab.id === activeId)) return;
    onCloseTabs(
      current.filter((tab) => tab.id !== activeId).map((tab) => tab.id),
      activeId,
    );
  }, [onCloseTabs]);

  const onCloseTitleTab = useCallback(
    (id: string) => {
      const closePlan = planWorkspaceTabClose({
        tabs: tabsRef.current,
        sessions: sessionsRef.current,
        closingTabId: id,
        scope: tabCloseScope,
      });
      if (closePlan.action === "keep" && id === activeTabIdRef.current) {
        onClosePane();
        return;
      }
      onCloseTab(id);
    },
    [onClosePane, onCloseTab, tabCloseScope],
  );

  return {
    onOpenTerminal,
    onNewTerminal,
    onNewTerminalInSession,
    onTerminalMetaChange,
    onToggleRunningTerminal,
    onNewTerminalTab,
    onCloseOtherTabs,
    onCloseTitleTab,
  };
}
