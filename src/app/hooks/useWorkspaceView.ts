import { useMemo, useRef } from "react";
import type { useLinkedWorkItemPanels } from "../../features/github/hooks/useLinkedWorkItemPanels";
import type { useOpenFiles } from "../../features/files/hooks/useOpenFiles";
import type { useProjectBranches } from "../../features/source-control/hooks/useProjectBranches";
import type { useSessionHistory } from "../../features/sessions/hooks/useSessionHistory";
import type { useSessionIndicators } from "../../features/sessions/hooks/useSessionIndicators";
import type { useTerminalDock } from "../../features/terminal/hooks/useTerminalDock";
import type { useWorkspaceTabActions } from "../../features/workspace/hooks/useWorkspaceTabActions";
import type { useWorkspaceTabState } from "../../features/workspace/hooks/useWorkspaceTabState";
import type { Tab as TitleTab } from "../shell/TitleBar";
import { nativeSkillContextForSession } from "../../features/sessions/model/sessionSkills";
import { sessionWorkCwd, type Session } from "../../features/sessions/model/session";
import { historyWithLiveSessions, summaryFromSession } from "../../features/sessions/data/sessionHistory";
import { focusedFileTab, isFilesystemTab, leafIds, type FilePaneTab, type WorkspaceTab } from "../../features/workspace/model/layout";
import { toTitleTab, titleTabsEqual } from "../../features/workspace/model/titleTabs";
import { normalizeProjectPath, sameProjectPath } from "../../features/projects/model/recents";
import { findProjectTerminal } from "../../features/projects/model/projectTerminal";
import { listRunningTerminals } from "../../features/terminal/model/terminalTab";
import { projectName } from "../../shared/lib/paths";

export type UseWorkspaceFocusDeps = {
  sessions: Session[];
  tabs: WorkspaceTab[];
  activeTabId: string;
  projectCwd: string;
};

export function useWorkspaceFocus(deps: UseWorkspaceFocusDeps) {
  const {
    sessions,
    tabs,
    activeTabId,
    projectCwd,
  } = deps;

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const active =
    sessions.find((session) => session.id === activeTab?.focusedId) ??
    sessions.find(
      (session) => activeTab && leafIds(activeTab.layout).includes(session.id),
    );

  const activeFile = activeTab ? focusedFileTab(activeTab) : undefined;

  const sidebarCwd =
    activeFile?.projectCwd ?? activeFile?.cwd ?? active?.cwd ?? projectCwd;

  const sidebarCwdRef = useRef(sidebarCwd);

  sidebarCwdRef.current = sidebarCwd;

  const gitCwd =
    activeFile?.cwd ?? (active ? sessionWorkCwd(active) : sidebarCwd);

  const gitCwdRef = useRef(gitCwd);

  gitCwdRef.current = gitCwd;

  const activeSkillContext = active
    ? nativeSkillContextForSession(active)
    : null;

  const activeSkillCwd = activeSkillContext?.cwd;

  return {
    activeTab,
    active,
    sidebarCwd,
    sidebarCwdRef,
    gitCwd,
    gitCwdRef,
    activeSkillContext,
    activeSkillCwd,
  };
}


export type UseWorkspaceViewDeps = {
  sessions: Session[];
  tabs: WorkspaceTab[];
  activeTab: WorkspaceTab | undefined;
  active: Session | undefined;
  projectCwd: string;
  sidebarCwd: string;
  gitCwd: string;
  history: ReturnType<typeof useSessionHistory>["history"];
  historyErrorCwd: ReturnType<typeof useSessionHistory>["historyErrorCwd"];
  loadedProjects: ReturnType<typeof useSessionHistory>["loadedProjects"];
  projectBranches: ReturnType<typeof useProjectBranches>;
  gitCwdBranches: ReturnType<typeof useProjectBranches>;
  projectTerminals: ReturnType<typeof useTerminalDock>["projectTerminals"];
  currentProjectDock: ReturnType<typeof useTerminalDock>["currentProjectDock"];
  linkedWorkItemPanels: ReturnType<typeof useLinkedWorkItemPanels>["linkedWorkItemPanels"];
  deckProjectTabs: ReturnType<typeof useWorkspaceTabActions>["deckProjectTabs"];
  dirtyFiles: ReturnType<typeof useOpenFiles>["dirtyFiles"];
  unseenFinishedIds: ReturnType<typeof useSessionIndicators>["unseenFinishedIds"];
  tabProjectsRef: ReturnType<typeof useWorkspaceTabState>["tabProjectsRef"];
};

export function useWorkspaceView(deps: UseWorkspaceViewDeps) {
  const {
    sessions,
    tabs,
    activeTab,
    active,
    projectCwd,
    sidebarCwd,
    gitCwd,
    history,
    historyErrorCwd,
    loadedProjects,
    projectBranches,
    gitCwdBranches,
    projectTerminals,
    currentProjectDock,
    linkedWorkItemPanels,
    deckProjectTabs,
    dirtyFiles,
    unseenFinishedIds,
    tabProjectsRef,
  } = deps;

  const activeTabSessionIds = activeTab ? leafIds(activeTab.layout) : [];

  const activeLinkedWorkItemPanel = activeTab
    ? (linkedWorkItemPanels.get(activeTab.focusedId) ??
      [...linkedWorkItemPanels.values()]
        .reverse()
        .find((panel) => activeTabSessionIds.includes(panel.sessionId)) ??
      null)
    : null;

  const sidebarCwdKey =
    sidebarCwd && sidebarCwd !== "~" ? normalizeProjectPath(sidebarCwd) : null;

  const historyFailed =
    sidebarCwdKey != null && historyErrorCwd === sidebarCwdKey;

  // True from the very first frame that shows a project we have never listed,
  // so the sidebar can stay blank instead of flashing "No sessions yet".
  const historyPending =
    sidebarCwdKey != null &&
    !loadedProjects.has(sidebarCwdKey) &&
    !historyFailed;

  const explorerRootLabel =
    active?.worktreeCwd && sameProjectPath(gitCwd, sessionWorkCwd(active))
      ? active.branch || gitCwdBranches?.current || undefined
      : undefined;

  const runningTerminals = useMemo(() => {
    const files: FilePaneTab[] = [];
    const dock = findProjectTerminal(projectTerminals, projectCwd);
    if (dock) files.push(...dock.pane.files);
    for (const tab of tabs) {
      for (const pane of tab.terminalPanes ?? []) {
        files.push(...pane.files);
      }
    }
    return listRunningTerminals(files);
  }, [projectCwd, projectTerminals, tabs]);

  const runningTerminalOpen = useMemo(() => {
    const ids = new Set(runningTerminals.map((terminal) => terminal.id));
    if (
      currentProjectDock?.open &&
      currentProjectDock.pane.files.some((file) => ids.has(file.id))
    ) {
      return true;
    }
    const focused = activeTab ? focusedFileTab(activeTab) : undefined;
    return !!focused && ids.has(focused.id);
  }, [activeTab, currentProjectDock, runningTerminals]);

  const nextTitleTabs: TitleTab[] = deckProjectTabs.map((tab) =>
    toTitleTab(tab, sessions, dirtyFiles, unseenFinishedIds),
  );

  tabProjectsRef.current = new Map(
    nextTitleTabs.map((tab) => [tab.id, tab.project]),
  );

  const titleTabsRef = useRef(nextTitleTabs);

  if (!titleTabsEqual(titleTabsRef.current, nextTitleTabs)) {
    titleTabsRef.current = nextTitleTabs;
  }

  const titleTabs = titleTabsRef.current;

  // `history` now spans every visited project; consumers that expect the
  // current project only get this slice.
  const projectHistory = useMemo(
    () => history.filter((entry) => sameProjectPath(entry.cwd, sidebarCwd)),
    [history, sidebarCwd],
  );

  const sidebarHistory = useMemo(
    () =>
      historyWithLiveSessions(
        history,
        sessions,
        sidebarCwd,
        {
          ...(projectBranches?.current
            ? { branch: projectBranches.current }
            : {}),
          ...(sidebarCwd && sidebarCwd !== "~"
            ? { repo: projectName(sidebarCwd) }
            : {}),
        },
      ),
    [history, projectBranches, sessions, sidebarCwd],
  );

  const openProjectSessions = useMemo(
    () =>
      sessions
        .filter(
          (session) => sameProjectPath(session.cwd, sidebarCwd),
        )
        .map((session) =>
          summaryFromSession(session, {
            ...(projectBranches?.current
              ? { branch: projectBranches.current }
              : {}),
            ...(sidebarCwd && sidebarCwd !== "~"
              ? { repo: projectName(sidebarCwd) }
              : {}),
          }),
        ),
    [projectBranches, sessions, sidebarCwd],
  );

  const openFilePaths = useMemo(() => {
    const paths: string[] = [];
    const seen = new Set<string>();
    for (const tab of tabs) {
      for (const pane of tab.editorPanes) {
        for (const file of pane.files) {
          if (!isFilesystemTab(file) || seen.has(file.path))
            continue;
          seen.add(file.path);
          paths.push(file.path);
        }
      }
    }
    return paths;
  }, [tabs]);

  return {
    activeLinkedWorkItemPanel,
    openFilePaths,
    projectHistory,
    sidebarHistory,
    openProjectSessions,
    titleTabs,
    historyFailed,
    historyPending,
    explorerRootLabel,
    runningTerminals,
    runningTerminalOpen,
  };
}
