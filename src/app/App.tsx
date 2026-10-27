import {
  createLiveSessionStore,
  useLiveSessions,
} from "../features/sessions/model/liveSessions";
import { useTurnController } from "../features/sessions/hooks/useTurnController";
import { useBtwController } from "../features/sessions/hooks/useBtwController";
import { useOpenFiles } from "../features/files/hooks/useOpenFiles";
import {
  useLinkedWorkItemPanels,
} from "../features/github/hooks/useLinkedWorkItemPanels";
import { useSessionHistory } from "../features/sessions/hooks/useSessionHistory";
import type { CiRepairRequest } from "../features/source-control/model/ciRepair";
import { trackCiRepair } from "../features/source-control/model/ciRepairTracking";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Sidebar } from "./shell/Sidebar";
import { ApprovalToasts } from "../features/sessions/ui/ApprovalToasts";
import { HarnessUpdateNotice } from "../features/providers/ui/HarnessUpdateNotice";
import { WhatsNewDialog } from "./shell/WhatsNewDialog";
import { ProviderSignInDialog } from "../features/sessions/ui/ProviderSignInDialog";
import { TitleBar, type Tab as TitleTab } from "./shell/TitleBar";
import { MenuBar } from "./shell/MenuBar";
import { FilePicker } from "../features/files/ui/FilePicker";
import { DeleteSessionDialog } from "../features/sessions/ui/DeleteSessionDialog";
import { UsageFooter } from "./shell/UsageFooter";
import { useProjectBranches } from "../features/source-control/hooks/useProjectBranches";
import { useLinkedWorkItemActivity } from "./hooks/useLinkedWorkItemActivity";
import {
  type SidebarTabId,
} from "../features/settings/model/appearance";
import { loadProjectSidebarTab } from "../features/settings/model/projectSidebarTab";
import { HAS_NATIVE_GLASS, IS_MAC } from "../platform/tauri/platform";
import {
  applyUiScale,
  loadUiScale,
  saveUiScale,
  UI_SCALE_DEFAULT,
  zoomInUiScale,
  zoomOutUiScale,
} from "../features/settings/model/uiScale";
import { basename, type GitFileDiffKind } from "../platform/tauri/fs";
import { prefetchProjectFiles } from "../features/files/model/fileIndex";
import { focusedFileTab, isFilesystemTab, isCommitTab, isTerminalTab, leafIds, neighborLeafId, newTab, newTerminalFile, newTerminalWorkspaceTab, nextTerminalTitle, previewWorkspaceFile, openTerminalTab, setSplitRatio, updateTerminalTab, withSurfacePanes, type FilePaneTab, type FocusDir, type WorkspaceTab } from "../features/workspace/model/layout";
import {
  releaseNotesTitle,
} from "./model/releaseNotes";
import {
  findProjectTerminal,
  mapProjectTerminal,
  patchProjectTerminals,
  selectDockTerminal,
  withDockOpen,
} from "../features/projects/model/projectTerminal";
import { type WindowTransferPayload } from "./model/windowTransfer";
import {
  listRunningTerminals,
  terminalTabLabel,
  type TerminalMetaPatch,
} from "../features/terminal/model/terminalTab";
import { cancelHarnessTurn, forgetHarnessSession, registerBuiltinHarnesses, respondHarnessApproval, respondHarnessQuestion, keepHarnessQuestionOpen, startHarnessBridge, pickTextHarness, type ApprovalDecision, type UserQuestionReply } from "../integrations/harness";
import { isPreparingHandoff, sessionChildHarnesses } from "../features/sessions/model/handoff";
import { displayPath, pathKey, projectName } from "../shared/lib/paths";
import { lastProjectPath, loadRecents, isLocalProject, normalizeProjectPath, projectRailItems, sameProjectPath } from "../features/projects/model/recents";
import { planWorkspaceTabClose } from "../features/workspace/model/workspaceTabGroups";
import { sessionNeedsInput, newDefaultSession, sessionDisplayTitle, sessionWorkCwd, type HarnessId, type LinkedWorkItem, type Session } from "../features/sessions/model/session";
import { type SessionSummary } from "../features/sessions/data/sessionStore";
import {
  TranscriptPool,
  TranscriptPoolOutlet,
} from "../features/sessions/ui/TranscriptPool";
import { syncDockBadge } from "../features/notifications/model/dockBadge";
import { liveAgentsFromSessions } from "../features/sessions/model/liveAgents";
import { hiddenApprovalNotices } from "../features/notifications/model/approvalToast";
import { nextUnseenFinishedSessions } from "../features/sessions/model/sessionDone";
import {
  loadNotificationsEnabled,
  probeNotificationPermission,
  setWindowFocused,
} from "../features/notifications/model/notifications";
import { useInputNotifications } from "../features/notifications/hooks/useInputNotifications";
import {
  adjacentItemId,
  deferUnhandledEscape,
  focusedBusyAgentSessionId,
  shouldStopFocusedTurnOnEscape,
} from "../features/workspace/model/tabKeys";
import { warmNativeSkills } from "../features/skills/model/skills";
import { nativeSkillContextForSession } from "../features/sessions/model/sessionSkills";

import { PaneTree } from "../features/workspace/ui/PaneTree";
import { ProjectTerminalDock } from "../features/terminal/ui/ProjectTerminalDock";
import { lazySurface } from "../shared/ui/lazySurface";
import { requestTranscriptJump } from "../features/sessions/model/transcriptJump";
import { type InboxItem } from "../features/github/model/githubTasks";
import {
  linkedWorkItemFromInboxItem,
} from "../features/sessions/model/sessionWorkItem";
import { loadCloseToTray, loadLiveAgentsEnabled, subscribeLiveAgentsEnabled } from "../features/settings/model/settings";

import { historyWithLiveSessions, summaryFromSession } from "../features/sessions/data/sessionHistory";
import { isBlankSession } from "../features/projects/model/projectReturn";
import type { InstalledUpdate } from "./model/updateNotice";
import {
  bindResumedSessions,
  closeBusyWindow,
  closeCurrentWindow,
  confirmReload,
  hasInFlightSessions,
  hideCurrentWindow,
  isAppQuitting,
  persistLiveTranscripts,
  persistQuitState,
  reapWindowRuntime,
  setQuitWorkspace,
  type ResumedWorkspace,
} from "./model/appLifecycle";
import { useAppCommands } from "./hooks/useAppCommands";
import { useAppSurfaces } from "./hooks/useAppSurfaces";
import { useTerminalDock } from "../features/terminal/hooks/useTerminalDock";
import { useProjectState } from "../features/projects/hooks/useProjectState";
import { useWorkspaceTabState } from "../features/workspace/hooks/useWorkspaceTabState";
import { useWorkspaceTabActions } from "../features/workspace/hooks/useWorkspaceTabActions";
import { isBlankWorkspaceTab } from "../features/workspace/hooks/useWorkspaceTabActions";
import { useProjectActions } from "../features/projects/hooks/useProjectActions";
import { useProviderControls } from "../features/providers/hooks/useProviderControls";
import { withPlanBuildTarget } from "../features/providers/hooks/useProviderControls";
import { useWorktreeActions } from "../features/source-control/hooks/useWorktreeActions";
import { useWorktreeState } from "../features/source-control/hooks/useWorktreeState";
import { useSessionLifecycleState } from "../features/sessions/hooks/useSessionLifecycleState";
import { useSessionLifecycle } from "../features/sessions/hooks/useSessionLifecycle";

const SearchView = lazySurface(
  async () => {
    const module = await import("../features/search/ui/SearchView");
    return { default: module.SearchView };
  },
  { suspense: false },
);
const SettingsView = lazySurface(
  async () => {
    const module = await import("../features/settings/ui/SettingsView");
    return { default: module.SettingsView };
  },
  { suspense: false },
);
const LinkedWorkItemPanel = lazySurface(async () => {
  const module = await import("../features/github/ui/WorkItemDetail");
  return { default: module.LinkedWorkItemPanel };
});

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function titleTabsEqual(a: TitleTab[], b: TitleTab[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tab, index) => {
    const other = b[index];
    return (
      other != null &&
      tab.id === other.id &&
      tab.project === other.project &&
      tab.title === other.title &&
      tab.sessionCount === other.sessionCount &&
      tab.dirty === other.dirty &&
      tab.more.join("\u0000") === other.more.join("\u0000") &&
      tab.harnesses.join("\u0000") === other.harnesses.join("\u0000") &&
      tab.busyHarnesses.join("\u0000") === other.busyHarnesses.join("\u0000") &&
      (tab.doneHarnesses ?? []).join("\u0000") ===
        (other.doneHarnesses ?? []).join("\u0000") &&
      tab.files.join("\u0000") === other.files.join("\u0000") &&
      tab.multiPane === other.multiPane &&
      tab.fileFocused === other.fileFocused &&
      tab.blank === other.blank &&
      tab.terminal === other.terminal &&
      tab.previewFileId === other.previewFileId &&
      tab.groupId === other.groupId
    );
  });
}

// Register capabilities before composer hooks choose their discovery strategy.
registerBuiltinHarnesses();

type AppProps = {
  windowTransfer?: WindowTransferPayload | null;
  resumed?: ResumedWorkspace | null;
  installedUpdate?: InstalledUpdate | null;
  history?: SessionSummary[];
  historyCwd?: string | null;
};

export default function App(props: AppProps) {
  return (
    <Suspense fallback={null}>
      <Workspace {...props} />
    </Suspense>
  );
}

function Workspace({
  windowTransfer = null,
  resumed = null,
  installedUpdate = null,
  history: bootHistory = [],
  historyCwd: bootHistoryCwd = null,
}: AppProps) {
  const {
    projectCwd,
    setProjectCwd,
    recents,
    setRecents,
    projectCwdRef,
    projectReturnRef,
  } = useProjectState({
    windowTransfer,
    resumed,
  });

  const [seed] = useState(() => {
    const cwd = lastProjectPath() ?? "~";
    const session = newDefaultSession(cwd);
    const tab = newTab(session.id);
    return { session, tab };
  });
  const [liveSessions] = useState(() =>
    createLiveSessionStore(
      windowTransfer?.sessions ?? resumed?.sessions ?? [seed.session],
    ),
  );
  const sessions = useLiveSessions(liveSessions);
  const setSessions = liveSessions.set;
  const liveAgentsEnabled = useSyncExternalStore(
    subscribeLiveAgentsEnabled,
    loadLiveAgentsEnabled,
    () => true,
  );

  const {
    sessionDeleteDialog,
    setSessionDeleteDialog,
    deleteConfirmationPending,
    removingSessionIds,
    skipForgetSessionIds,
    sessionNavigationIdsRef,
    detachInputs,
    detachTimer,
  } = useSessionLifecycleState({
    liveAgentsEnabled,
  });

  const {
    switchingWorktrees,
    removingWorktreePaths,
  } = useWorktreeState();
  const {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    composerFocused,
    setComposerFocused,
    composerFocusToken,
    setComposerFocusToken,
    tabProjectsRef,
    tabsRef,
    activeTabIdRef,
    tabVisitRef,
    tabVisitFromHistoryRef,
    tabVisitNav,
    setTabVisitNav,
    workspaceSyncKey,
  } = useWorkspaceTabState({
    windowTransfer,
    resumed,
    seed,
  });


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

  const onOpenTerminalRef = useRef<(cwd: string) => void>(() => undefined);
  // Bridges onShowProjectTerminal to onOpenTerminal, which is declared below and
  // calls openProjectTerminal from this hook. App fills the ref after it.
  const bridgedOpenTerminal = useCallback(
    (cwd: string) => onOpenTerminalRef.current(cwd),
    [],
  );

  const {
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
  } = useTerminalDock({
    windowTransfer,
    resumed,
    projectCwd,
    projectCwdRef,
    gitCwd,
    setComposerFocused,
    onOpenTerminal: bridgedOpenTerminal,
  });
  const [sidebarTabSelection, setSidebarTabSelection] = useState<{
    project: string;
    tab: SidebarTabId;
  }>(() => ({
    project: pathKey(sidebarCwd),
    tab: loadProjectSidebarTab(sidebarCwd),
  }));

  const setSidebarTabRef = useRef<(tab: SidebarTabId, project?: string) => void>(
    () => undefined,
  );
  // Bridges useAppSurfaces to setSidebarTab, which is declared further down in
  // useProjectActions. App fills the ref after it.
  const bridgedSetSidebarTab = useCallback(
    (tab: SidebarTabId, project?: string) =>
      setSidebarTabRef.current(tab, project),
    [],
  );

  const onVisitBackRef = useRef<() => void>(() => undefined);
  const onVisitForwardRef = useRef<() => void>(() => undefined);
  // Bridges the rail handlers to onVisitBack and onVisitForward, which are declared
  // below and depend on activateTab. App fills the refs after them.
  const bridgedOnVisitBack = useCallback(() => onVisitBackRef.current(), []);
  const bridgedOnVisitForward = useCallback(
    () => onVisitForwardRef.current(),
    [],
  );

  const {
    projectRailOpen,
    sessionSidebarOpen,
    filesSearchOpen,
    setFilesSearchOpen,
    searchFocusToken,
    searchViewOpen,
    setSearchViewOpen,
    searchViewFocusToken,
    collapsedProjectRailMode,
    setCollapsedProjectRailMode,
    settingsOpen,
    setSettingsOpen,
    updateNotice,
    setUpdateNotice,
    whatsNewVersion,
    setWhatsNewVersion,
    settingsSection,
    settingsAnchor,
    notificationProjectPath,
    notificationSettingsRequest,
    filePickerOpen,
    setFilePickerOpen,
    filePickerInitialQuery,
    filePickerResetToken,
    searchViewOpenRef,
    foregroundSurfaceRef,
    settingsOpenRef,
    filePickerOpenRef,
    whatsNewVersionRef,
    onOpenWhatsNew,
    onToggleSidebar,
    onToggleSessionSidebar,
    onToggleProjectRail,
    onGoToFile,
    onOpenCommandPalette,
    onFindInProject,
    onOpenSearch,
    onLeaveSearch,
    openSettings,
    onOpenNotificationSettings,
    onCloseSettings,
    onSelectSettingsSection,
    onRailBack,
    onRailForward,
  } = useAppSurfaces({
    installedUpdate,
    setSidebarTab: bridgedSetSidebarTab,
    onVisitBack: bridgedOnVisitBack,
    onVisitForward: bridgedOnVisitForward,
  });

  const tabCloseScope = "project" as const;

  const onPinFileRef = useRef<(fileId: string) => void>(() => undefined);
  // Bridges useOpenFiles to onPinFile, which is declared further down in
  // useWorkspaceTabActions. App fills the ref after it.
  const bridgedOnPinFile = useCallback(
    (fileId: string) => onPinFileRef.current(fileId),
    [],
  );

  const {
    editorNavigation,
    setEditorNavigation,
    editorNavigationToken,
    dirtyFiles,
    setDirtyFiles,
    fileErrorCounts,
    dirtyFilesRef,
    onFileDirtyChange,
    onFileErrorCountChange,
  } = useOpenFiles({
    windowTransfer,
    onPinFile: bridgedOnPinFile,
  });

  const sessionsRef = liveSessions.ref;

  const {
    history,
    setHistory,
    loadedProjects,
    setLoadedProjects,
    historyErrorCwd,
    lastPersisted,
    lastPersistedUserBlock,
    pendingPersist,
    loadedSessionCache,
    sessionLoads,
    openingSessionIds,
    refreshHistory,
    persistSession,
    invalidateLoadedSession,
    ensureOpenSession,
    onPrefetchHistorySession,
  } = useSessionHistory({
    windowTransfer,
    resumed,
    bootHistory,
    bootHistoryCwd,
    sessions,
    sessionsRef,
    setSessions,
    tabs,
    tabsRef,
    sidebarCwd,
    sidebarCwdRef,
    removingSessionIds,
    switchingWorktrees,
  });

  const onSelectHistorySessionRef = useRef<
    (sessionId: string) => Promise<void>
  >(async () => undefined);
  // Bridges onOpenLinkedWorkItem to onSelectHistorySession, which is declared
  // further down and reads this hook's outputs. App fills the ref after it.
  const bridgedSelectHistorySession = useCallback(
    (sessionId: string) => onSelectHistorySessionRef.current(sessionId),
    [],
  );

  const {
    linkedWorkItemPanels,
    setLinkedWorkItemPanels,
    closeLinkedWorkItemPanel,
    linkedSessionUpdatesRef,
    setLinkedWorkItemUpdateCard,
    revealLinkedSessionUpdate,
    dismissNoticesForContinuedSession,
    onOpenLinkedWorkItem,
  } = useLinkedWorkItemPanels({
    tabs,
    sessionsRef,
    setSessions,
    history,
    sidebarCwd,
    setFilePickerOpen,
    setSettingsOpen,
    setSearchViewOpen,
    onSelectHistorySession: bridgedSelectHistorySession,
  });
  const sessionDefaults = active ?? sessions[0];

  const gitCwdRef = useRef(gitCwd);

  gitCwdRef.current = gitCwd;

  const {
    projectOfTab,
    activateTab,
    insertBeside,
    appendTab,
    onSplit,
    onCloseTab,
    onCloseTabs,
    onCloseFile,
    onCloseOtherFiles,
    onCloseAllTabs,
    onClosePane,
    deckProjectTabs,
    onNext,
    onPrev,
    onVisitBack,
    onVisitForward,
    onActivate,
    onFocusPane,
    onReorderTabs,
    onReorderFiles,
    onMovePane,
    onDetachPane,
    onFileMoved,
    onFileDeleted,
    onSelectFileSurface,
    onOpenFile,
    onOpenPlan,
    onPinFile,
  } = useWorkspaceTabActions({
    tabProjectsRef,
    tabsRef,
    setActiveTabId,
    setTabs,
    sessionsRef,
    projectCwdRef,
    setProjectCwd,
    setRecents,
    setComposerFocused,
    tabVisitRef,
    setTabVisitNav,
    tabs,
    activeTabId,
    tabVisitFromHistoryRef,
    activeTabIdRef,
    activeTab,
    sessionDefaults,
    projectCwd,
    setSessions,
    tabCloseScope,
    dirtyFilesRef,
    persistSession,
    setDirtyFiles,
    refreshHistory,
    sidebarCwd,
    sessions,
    setProjectTerminalFocused,
    gitCwdRef,
    sidebarCwdRef,
    editorNavigationToken,
    setEditorNavigation,
    windowTransfer,
    projectReturnRef,
    projectTerminals,
    lastDockSide,
    workspaceSyncKey,
  });
  const turnGen = liveSessions.turnGen;

  const {
    readProjectReturnMemory,
    sidebarTab,
    setSidebarTab,
    onCwdChange,
    onSelectProject,
    pickProject,
    onRemoveProject,
    onRestoreProject,
    applyProjectLocationChange,
  } = useProjectActions({
    projectReturnRef,
    tabsRef,
    sessionsRef,
    activeTabIdRef,
    activeTabId,
    tabs,
    sessions,
    recents,
    setProjectCwd,
    setRecents,
    setSessions,
    sidebarTabSelection,
    sidebarCwd,
    sidebarCwdRef,
    setSidebarTabSelection,
    appendTab,
    setActiveTabId,
    setComposerFocused,
    setTabs,
    projectOfTab,
    setSearchViewOpen,
    insertBeside,
    activateTab,
    projectCwdRef,
    loadedSessionCache,
    sessionLoads,
    invalidateLoadedSession,
    pendingPersist,
    turnGen,
    lastPersisted,
    persistSession,
    setDirtyFiles,
    setProjectTerminals,
    setHistory,
    setLoadedProjects,
    projectTerminalsRef,
    onFileMoved,
  });
  const {
    providerSignInRequest,
    setProviderSignInRequest,
    usageProviders,
    usageSession,
    harnessUpdateHeight,
    setHarnessUpdateHeight,
    onSelectProviderAccount,
    onModelChange,
    onModelSettingsChange,
    onRuntimeModeChange,
  } = useProviderControls({
    sessions,
    active,
    sessionsRef,
    setSessions,
    appendTab,
    setActiveTabId,
    setComposerFocused,
  });

  setSidebarTabRef.current = setSidebarTab;

  onPinFileRef.current = onPinFile;

  liveSessions.setForegroundProbe((sessionId) => {
    const tab = tabsRef.current.find(
      (entry) => entry.id === activeTabIdRef.current,
    );
    return (
      !document.hidden &&
      foregroundSurfaceRef.current.workspaceVisible &&
      !!tab &&
      leafIds(tab.layout).includes(sessionId)
    );
  });
  const [transcriptPool] = useState(() => new TranscriptPool());

  const { flushHarnessEvents, enqueueHarnessEvent } = liveSessions;

  const stopSessionForRemoval = useCallback(
    async (sessionId: string): Promise<Session | undefined> => {
      const open = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (!open?.busy) return open;

      turnGen.current.set(sessionId, (turnGen.current.get(sessionId) ?? 0) + 1);
      flushHarnessEvents();
      await Promise.all(
        sessionChildHarnesses(open).map((harness) =>
          cancelHarnessTurn(harness, sessionId).catch(() => undefined),
        ),
      );
      flushHarnessEvents();
      return sessionsRef.current.find((session) => session.id === sessionId);
    },
    [flushHarnessEvents],
  );

  useEffect(() => {
    if (resumed?.sessions.length) bindResumedSessions(resumed.sessions);
    const stopBridge = startHarnessBridge();
    const reap = () => {
      if (isAppQuitting()) return;
      void persistQuitState(
        sessionsRef.current,
        tabsRef.current,
        activeTabIdRef.current,
        projectCwdRef.current,
        readProjectReturnMemory(),
        "unload",
        projectTerminalsRef.current,
        lastDockSideRef.current ?? undefined,
      ).finally(() => {
        void reapWindowRuntime(
          sessionsRef.current,
          tabsRef.current,
          projectTerminalsRef.current,
        );
      });
    };
    window.addEventListener("pagehide", reap);
    window.addEventListener("beforeunload", reap);
    return () => {
      window.removeEventListener("pagehide", reap);
      window.removeEventListener("beforeunload", reap);
      stopBridge();
      liveSessions.dispose();
    };
  }, [resumed, readProjectReturnMemory]);

  const activeTabSessionIds = activeTab ? leafIds(activeTab.layout) : [];
  const activeLinkedWorkItemPanel = activeTab
    ? (linkedWorkItemPanels.get(activeTab.focusedId) ??
      [...linkedWorkItemPanels.values()]
        .reverse()
        .find((panel) => activeTabSessionIds.includes(panel.sessionId)) ??
      null)
    : null;

  const activeSkillContext = active
    ? nativeSkillContextForSession(active)
    : null;
  const activeSkillCwd = activeSkillContext?.cwd;

  useEffect(() => {
    if (!activeSkillContext || !activeSkillCwd) return;
    warmNativeSkills(activeSkillContext);
  }, [activeSkillCwd, active?.id, active?.harness]);

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
  const gitCwdBranches = useProjectBranches(
    gitCwd,
    Boolean(gitCwd) && gitCwd !== "~",
  );
  const explorerRootLabel =
    active?.worktreeCwd && sameProjectPath(gitCwd, sessionWorkCwd(active))
      ? active.branch || gitCwdBranches?.current || undefined
      : undefined;
  const projectBranches = useProjectBranches(
    sidebarCwd,
    Boolean(sidebarCwd) && sidebarCwd !== "~",
  );

  const nextBusySessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const session of sessions) {
      if (session.busy) {
        ids.add(session.id);
      }
    }
    return ids;
  }, [sessions]);
  const busySessionIdsRef = useRef(nextBusySessionIds);
  if (!setsEqual(busySessionIdsRef.current, nextBusySessionIds)) {
    busySessionIdsRef.current = nextBusySessionIds;
  }
  const busySessionIds = busySessionIdsRef.current;
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

  const nextApprovalSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const session of sessions) {
      if (sessionNeedsInput(session)) {
        ids.add(session.id);
      }
    }
    return ids;
  }, [sessions]);
  const approvalSessionIdsRef = useRef(nextApprovalSessionIds);
  if (!setsEqual(approvalSessionIdsRef.current, nextApprovalSessionIds)) {
    approvalSessionIdsRef.current = nextApprovalSessionIds;
  }
  const approvalSessionIds = approvalSessionIdsRef.current;

  const activeSessionId = active?.id;

  useInputNotifications(sessions, activeSessionId);

  // Cache the OS decision so a turn ending later can skip a denied banner.
  useEffect(() => {
    if (loadNotificationsEnabled()) void probeNotificationPermission();
  }, []);
  const busyForDoneRef = useRef(busySessionIds);
  const focusedForDoneRef = useRef(activeSessionId);
  const unseenFinishedRef = useRef<Set<string>>(new Set());
  if (
    busyForDoneRef.current !== busySessionIds ||
    focusedForDoneRef.current !== activeSessionId
  ) {
    unseenFinishedRef.current = nextUnseenFinishedSessions({
      previousBusyIds: busyForDoneRef.current,
      busyIds: busySessionIds,
      previousUnseenIds: unseenFinishedRef.current,
      focusedSessionId: activeSessionId,
    });
    busyForDoneRef.current = busySessionIds;
    focusedForDoneRef.current = activeSessionId;
  }
  const unseenFinishedIds = unseenFinishedRef.current;

  const liveAgents = useMemo(
    () =>
      liveAgentsEnabled
        ? liveAgentsFromSessions(sessions, unseenFinishedIds)
        : [],
    [liveAgentsEnabled, sessions, unseenFinishedIds],
  );

  const hiddenApprovalToasts = useMemo(
    () => hiddenApprovalNotices(sessions, activeTabId, tabs, composerFocused),
    [sessions, activeTabId, tabs, composerFocused],
  );

  useEffect(() => {
    syncDockBadge(sessions);
  }, [sessions]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        setWindowFocused(focused);
        if (focused) {
          flushHarnessEvents();
          syncDockBadge(sessionsRef.current);
          if (
            document.activeElement === document.body &&
            !projectTerminalFocusedRef.current &&
            !searchViewOpenRef.current &&
            !settingsOpenRef.current
          ) {
            setComposerFocused(true);
            setComposerFocusToken((token) => token + 1);
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [flushHarnessEvents]);

  useEffect(() => {
    const onVisible = () => {
      // Flush on hiding too: WebKit can suspend a pending animation frame,
      // leaving the last output stranded until another event or activation.
      flushHarnessEvents();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [flushHarnessEvents]);

  useLayoutEffect(() => {
    // A newly selected chat catches up before paint, even if its output was
    // waiting on the background cadence. Draft/composer input stays immediate.
    flushHarnessEvents();
  }, [
    activeTabId,
    searchViewOpen,
    settingsOpen,
    flushHarnessEvents,
  ]);

  useEffect(() => {
    let unlistenClose: (() => void) | undefined;
    const releaseQuit = setQuitWorkspace(
      () => sessionsRef.current,
      () => tabsRef.current,
      () => activeTabIdRef.current,
      () => projectCwdRef.current,
      () => projectTerminalsRef.current,
      readProjectReturnMemory,
      flushHarnessEvents,
      () => lastDockSideRef.current,
    );
    void getCurrentWindow()
      .onCloseRequested((event) => {
        // Listening here makes close our job. Letting the default path run
        // calls JS `window.destroy`, which Tauri denies without a permission.
        event.preventDefault();
        const toTray = loadCloseToTray();
        if (hasInFlightSessions(sessionsRef.current)) {
          flushHarnessEvents();
          if (!toTray && !IS_MAC) {
            void closeBusyWindow();
            return;
          }
          // Not `persistQuitState`: that marks the live turns interrupted.
          void persistLiveTranscripts(sessionsRef.current);
          void hideCurrentWindow();
          return;
        }
        void persistQuitState(
          sessionsRef.current,
          tabsRef.current,
          activeTabIdRef.current,
          projectCwdRef.current,
          readProjectReturnMemory(),
          "unload",
          projectTerminalsRef.current,
          lastDockSideRef.current ?? undefined,
        ).finally(() => {
          void (toTray ? hideCurrentWindow() : closeCurrentWindow());
        });
      })
      .then((fn) => {
        unlistenClose = fn;
      });
    return () => {
      releaseQuit();
      unlistenClose?.();
    };
  }, [flushHarnessEvents, readProjectReturnMemory]);

  useEffect(() => {
    prefetchProjectFiles(gitCwd);
  }, [gitCwd]);

  const {
    onBtwSubmit,
    onBtwModelChange,
    onBtwDelete,
    onBtwStop,
    onBtwRetry,
  } = useBtwController({
    persistSession,
    sessions,
    sessionsRef,
    setSessions,
  });

  const onLinkedWorkItemUpdateCardDismiss = useCallback(
    (sessionId: string) => {
      setLinkedWorkItemUpdateCard(sessionId, () => undefined);
    },
    [setLinkedWorkItemUpdateCard],
  );

  const onHandoffCardDismiss = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId && session.handoffCard
          ? { ...session, handoffCard: undefined }
          : session,
      ),
    );
  }, []);

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
  onOpenTerminalRef.current = onOpenTerminal;

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
  onVisitBackRef.current = onVisitBack;
  onVisitForwardRef.current = onVisitForward;


  const onShowSourceControl = useCallback(() => {
    setSidebarTab("changes");
  }, []);

  const onToggleChanges = useCallback(() => {
    onShowSourceControl();
  }, [onShowSourceControl]);
  const {
    repairSessions,
    onCheckWorktreeRemoval,
    onRemoveWorktree,
    onWorktreeChange,
    onBranchChange,
    onWorkspaceModeChange,
    onWorktreeBaseChange,
    onOpenDiff,
    onOpenAllChanges,
    onOpenCommit,
  } = useWorktreeActions({
    history,
    sessions,
    tabsRef,
    projectTerminalsRef,
    removingWorktreePaths,
    switchingWorktrees,
    sessionsRef,
    removingSessionIds,
    pendingPersist,
    invalidateLoadedSession,
    stopSessionForRemoval,
    setSessions,
    projectCwdRef,
    setProjectCwd,
    setRecents,
    lastPersisted,
    setHistory,
    appendTab,
    setActiveTabId,
    setComposerFocused,
    refreshHistory,
    persistSession,
    gitCwdRef,
    sidebarCwdRef,
    setTabs,
    activeTabId,
    setSidebarTab,
  });
  const {
    onNew,
    onSelectHistorySession,
    focusOpenSession,
    onPlaceSessionOnPane,
    onPlaceTabOnPane,
    openSessionBeside,
    onNavigateSessionList,
    onSessionNavigationOrder,
    onRenameHistorySession,
    onRemoveHistorySession,
    onArchiveHistorySession,
    onArchiveFocusedSession,
    onPinHistorySession,
    onSetHistorySessionLinkedWorkItem,
    onPlaceSessionInFolder,
    onSaveDraft,
    onRemoveDraft,
  } = useSessionLifecycle({
    detachTimer,
    sessions,
    sessionsRef,
    liveAgentsEnabled,
    detachInputs,
    tabsRef,
    openingSessionIds,
    loadedSessionCache,
    unseenFinishedRef,
    skipForgetSessionIds,
    persistSession,
    setSessions,
    tabs,
    setSearchViewOpen,
    active,
    sessionDefaults,
    projectCwd,
    appendTab,
    setActiveTabId,
    setComposerFocused,
    ensureOpenSession,
    linkedSessionUpdatesRef,
    revealLinkedSessionUpdate,
    setTabs,
    activeTabIdRef,
    lastPersisted,
    tabCloseScope,
    projectCwdRef,
    setProjectTerminalFocused,
    sessionNavigationIdsRef,
    onPrefetchHistorySession,
    invalidateLoadedSession,
    refreshHistory,
    sidebarCwd,
    removingSessionIds,
    switchingWorktrees,
    deleteConfirmationPending,
    history,
    setSessionDeleteDialog,
    pendingPersist,
    dirtyFilesRef,
    setDirtyFiles,
    activateTab,
    setHistory,
    stopSessionForRemoval,
    onRemoveWorktree,
    projectTerminalFocusedRef,
    searchViewOpenRef,
    settingsOpenRef,
    filePickerOpenRef,
    whatsNewVersionRef,
    setLinkedWorkItemPanels,
    lastPersistedUserBlock,
  });
  onSelectHistorySessionRef.current = onSelectHistorySession;


  const onOpenWorkingTreeDiff = useCallback(
    (path: string, kind?: GitFileDiffKind, pin?: boolean) =>
      onOpenDiff(path, undefined, kind, pin),
    [onOpenDiff],
  );

  const onArchiveHistorySessions = useCallback(
    async (sessionIds: readonly string[], archived: boolean) => {
      for (const sessionId of sessionIds) {
        if (!(await onArchiveHistorySession(sessionId, archived))) break;
      }
    },
    [onArchiveHistorySession],
  );

  const onPinHistorySessions = useCallback(
    async (sessionIds: readonly string[], pinned: boolean) => {
      await Promise.all(
        sessionIds.map((sessionId) => onPinHistorySession(sessionId, pinned)),
      );
    },
    [onPinHistorySession],
  );

  const onDeleteWorktreeSessions = useCallback(
    async (sessionIds: readonly string[]): Promise<boolean> => {
      for (const sessionId of sessionIds) {
        if (!(await onRemoveHistorySession(sessionId, "delete", true))) {
          return false;
        }
      }
      return true;
    },
    [onRemoveHistorySession],
  );

  const onDeleteHistorySession = useCallback(
    (sessionId: string) => onRemoveHistorySession(sessionId, "delete"),
    [onRemoveHistorySession],
  );

  const onDeleteHistorySessions = useCallback(
    async (sessionIds: readonly string[]) => {
      if (sessionIds.length === 0) return;
      if (
        !window.confirm(
          `Delete ${sessionIds.length} selected conversations? This can’t be undone.`,
        )
      )
        return;
      for (const sessionId of sessionIds) {
        if (!(await onRemoveHistorySession(sessionId, "delete", true))) break;
      }
    },
    [onRemoveHistorySession],
  );

  const sessionIdsInTitleTab = useCallback((tabId: string): string[] => {
    const tab = tabsRef.current.find((entry) => entry.id === tabId);
    if (!tab) return [];
    const openSessionIds = new Set(
      sessionsRef.current.map((session) => session.id),
    );
    return leafIds(tab.layout).filter((id) => openSessionIds.has(id));
  }, []);

  const onArchiveTitleTab = useCallback(
    (tabId: string) => {
      const sessionIds = sessionIdsInTitleTab(tabId);
      void onArchiveHistorySessions(sessionIds, true);
    },
    [onArchiveHistorySessions, sessionIdsInTitleTab],
  );

  const onDeleteTitleTab = useCallback(
    (tabId: string) => {
      const sessionIds = sessionIdsInTitleTab(tabId);
      if (sessionIds.length === 1) {
        void onDeleteHistorySession(sessionIds[0]);
      } else if (sessionIds.length > 1) {
        void onDeleteHistorySessions(sessionIds);
      }
    },
    [onDeleteHistorySession, onDeleteHistorySessions, sessionIdsInTitleTab],
  );

  const onFocusDir = useCallback(
    (dir: FocusDir) => {
      if (!activeTab) return;
      const next = neighborLeafId(activeTab.layout, activeTab.focusedId, dir);
      if (next) onFocusPane(next);
    },
    [activeTab, onFocusPane],
  );

  const onRatio = useCallback(
    (tabId: string, splitId: string, index: number, ratio: number) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, layout: setSplitRatio(t.layout, splitId, index, ratio) }
            : t,
        ),
      );
    },
    [],
  );

  const {
    onSubmit,
    onUpdatePlan,
    onBuildPlan,
    onDeleteQueuedMessage,
    onQueuedMessageEditingChange,
    onEditQueuedMessage,
    onSteerQueuedMessage,
    onResumeQueue,
    onUsageLimitDismiss,
    onUsageLimitResumeAtReset,
    onUsageLimitResume,
    onSecondOpinion,
    onHandoff,
    onCompactContext,
    onStop,
  } = useTurnController({
    activeSessionId,
    applyProjectLocationChange,
    dismissNoticesForContinuedSession,
    enqueueHarnessEvent,
    flushHarnessEvents,
    openSessionBeside,
    removingSessionIds,
    removingWorktreePaths,
    sessions,
    sessionsRef,
    setSessions,
    switchingWorktrees,
    turnGen,
    withPlanBuildTarget,
  });

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const inTerminal = Boolean(target?.closest(".bonocode-terminal"));
      const activeTabId = activeTabIdRef.current;
      const sessionId = focusedBusyAgentSessionId(
        activeTabId,
        tabsRef.current,
        sessionsRef.current,
        projectTerminalFocusedRef.current,
      );
      if (
        !sessionId ||
        !shouldStopFocusedTurnOnEscape(event, {
          inTerminal,
          focusedSessionBusy: true,
        })
      ) {
        return;
      }

      // Other surfaces (drag/reorder included) can claim Escape later in the
      // same keydown dispatch. Defer the destructive stop until every handler
      // has had a chance to preventDefault, then verify focus did not move.
      deferUnhandledEscape(event, () => {
        const stillFocusedSessionId = focusedBusyAgentSessionId(
          activeTabIdRef.current,
          tabsRef.current,
          sessionsRef.current,
          projectTerminalFocusedRef.current,
        );
        if (
          activeTabIdRef.current !== activeTabId ||
          stillFocusedSessionId !== sessionId
        ) {
          return;
        }
        onStop(sessionId);
      });
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onStop]);

  const onApproval = useCallback(
    (sessionId: string, requestId: number, decision: ApprovalDecision) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      if (!session || session.worktreeRemoved) return;
      respondHarnessApproval(session.harness, sessionId, requestId, decision);
    },
    [],
  );

  const onQuestionReply = useCallback(
    (sessionId: string, requestId: number, reply: UserQuestionReply) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      if (!session || session.worktreeRemoved) return;
      respondHarnessQuestion(session.harness, sessionId, requestId, reply);
    },
    [],
  );

  const onQuestionInteraction = useCallback(
    (sessionId: string, requestId: number) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      if (session && !session.worktreeRemoved)
        keepHarnessQuestionOpen(session.harness, sessionId, requestId);
    },
    [],
  );

  const onOpenApprovalSession = useCallback(
    (sessionId: string) => {
      if (!focusOpenSession(sessionId)) void onSelectHistorySession(sessionId);
    },
    [focusOpenSession, onSelectHistorySession],
  );

  const onSelectLiveAgent = useCallback(
    (sessionId: string) => {
      setSearchViewOpen(false);
      onOpenApprovalSession(sessionId);
    },
    [onOpenApprovalSession],
  );

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
  const { linkedSessionUpdateIds, linkedSessionUpdates } =
    useLinkedWorkItemActivity(sidebarCwd, sidebarHistory);
  linkedSessionUpdatesRef.current = linkedSessionUpdates;
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

  const onReload = useCallback(() => {
    void (async () => {
      if (!(await confirmReload(dirtyFilesRef.current.size > 0))) return;
      window.location.reload();
    })();
  }, []);

  const onOpenLinkedSession = useCallback(
    (sessionId: string) => {
      const cwd =
        sessionsRef.current.find((session) => session.id === sessionId)?.cwd ??
        history.find((session) => session.id === sessionId)?.cwd;
      setSidebarTab("sessions", cwd);
      void onSelectHistorySession(sessionId);
    },
    [history, onSelectHistorySession],
  );

  const startCiRepair = useCallback(
    async (
      target: {
        cwd: string;
        number: number;
        title: string;
        linkedWorkItem?: LinkedWorkItem;
      },
      request: CiRepairRequest,
      sessionId?: string,
    ) => {
      const cwd = target.cwd;
      if (!cwd) throw new Error("Choose a local project for this PR first.");
      let session = sessionId ? await ensureOpenSession(sessionId) : undefined;
      if (sessionId && (!session || !sameProjectPath(session.cwd, cwd))) {
        throw new Error("Choose a chat from this project.");
      }
      if (
        session &&
        (session.busy || session.pendingSwitch || isPreparingHandoff(session))
      ) {
        throw new Error(
          "This chat is busy. Choose another chat or start a new one.",
        );
      }
      if (!session) {
        session = {
          ...newDefaultSession(cwd, sessionDefaults?.runtimeMode),
          title: `Fix CI #${target.number}: ${target.title}`,
          linkedWorkItem: target.linkedWorkItem,
        };
        const next = [...sessionsRef.current, session];
        sessionsRef.current = next;
        setSessions(next);
      }
      const repairSessionId = session.id;
      trackCiRepair(cwd, request, repairSessionId, (settle) =>
        onSubmit(repairSessionId, request.text, [], {
          ciRepair: request,
          handoffCard: undefined,
          onSettled: (outcome) => settle(outcome.status),
        }),
      );
      setSearchViewOpen(false);
      setSidebarTab("sessions", cwd);
      await onSelectHistorySession(session.id);
    },
    [
      ensureOpenSession,
      onSubmit,
      onSelectHistorySession,
      sessionDefaults?.runtimeMode,
    ],
  );

  const onRepairChecks = useCallback(
    (item: InboxItem, request: CiRepairRequest, sessionId?: string) =>
      startCiRepair(
        {
          cwd: item.projectPath ?? "",
          number: item.number,
          title: item.title,
          linkedWorkItem: linkedWorkItemFromInboxItem(item) ?? undefined,
        },
        request,
        sessionId,
      ),
    [startCiRepair],
  );

  const onOpenSettings = useCallback(() => openSettings(), [openSettings]);

  const onOpenArchivedSession = useCallback(
    (sessionId: string) => {
      setSettingsOpen(false);
      void onSelectHistorySession(sessionId);
    },
    [onSelectHistorySession],
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

  useEffect(() => {
    void invoke("set_traffic_lights_visible", { visible: true }).catch(
      () => {},
    );
  }, []);

  const onNavigateProjectList = useCallback(
    (delta: number) => {
      const current = normalizeProjectPath(projectCwdRef.current);
      const ids = projectRailItems(loadRecents(), current).map(
        (project) => project.path,
      );
      const next = adjacentItemId(ids, current, delta);
      if (!next || sameProjectPath(next, current)) return;
      onSelectProject(next);
    },
    [onSelectProject],
  );

  const onManageWorktrees = useCallback(
    () => openSettings("worktrees"),
    [openSettings],
  );

  const sessionPaneProps = {
    recents,
    hideProjectPicker: true,
    onFocus: onFocusPane,
    onClose: onClosePane,
    onCwdChange,
    onBranchChange,
    onWorktreeChange,
    onWorkspaceModeChange,
    onWorktreeBaseChange,
    onManageWorktrees,
    onModelChange,
    onModelSettingsChange,
    onRuntimeModeChange,
    onSaveDraft,
    onRemoveDraft,
    onSubmit,
    onStop,
    onCompactContext,
    onPlaceSessionInFolder,
    onDeleteQueuedMessage,
    onEditQueuedMessage,
    onQueuedMessageEditingChange,
    onSteerQueuedMessage,
    onResumeQueue,
    onUsageLimitResume,
    onUsageLimitResumeAtReset,
    onUsageLimitDismiss,
    onLinkedWorkItemUpdateCardDismiss,
    onHandoffCardDismiss,
    onOpenLinkedWorkItem,
    onArchiveSession: onArchiveHistorySession,
    onDeleteSession: onDeleteHistorySession,
    onApproval,
    onQuestionReply,
    onQuestionInteraction,
    onOpenFile,
    onOpenDiff,
    onOpenPlan,
    onBuildPlan,
    onSecondOpinion,
    onHandoff,
    onBtwSubmit,
    onBtwRetry,
    onBtwDelete,
    onBtwStop,
    onBtwModelChange,
    onNewTerminal: onNewTerminalInSession,
  };

  const chromeSurfaceOpen = searchViewOpen || settingsOpen;
  const compactProjectRail = collapsedProjectRailMode === "compact";
  const compactRailActive = compactProjectRail && !projectRailOpen;
  const compactTitleBar = IS_MAC && compactRailActive && !chromeSurfaceOpen;
  const workspaceTitleBar = (
    <TitleBar
      tabs={titleTabs}
      activeId={activeTabId}
      cwd={sidebarCwd}
      projectRailOpen={projectRailOpen}
      sessionSidebarOpen={sessionSidebarOpen}
      compactRail={compactTitleBar}
      canGoBack={tabVisitNav.canBack}
      canGoForward={tabVisitNav.canForward}
      onGoBack={onRailBack}
      onGoForward={onRailForward}
      onToggleSidebar={onToggleSidebar}
      onToggleSessionSidebar={onToggleSessionSidebar}
      onSelect={activateTab}
      onNew={onNew}
      onNewTerminal={onNewTerminal}
      onOpenSettings={onOpenSettings}
      onClose={onCloseTitleTab}
      onCloseMany={onCloseTabs}
      onArchiveTab={onArchiveTitleTab}
      onDeleteTab={onDeleteTitleTab}
      onReorder={onReorderTabs}
      onPlaceOnPane={onPlaceTabOnPane}
      onGoToFile={onGoToFile}
      onPinFile={onPinFile}
      recents={recents}
      onSelectProject={onSelectProject}
    />
  );

  const { actions } = useAppCommands({
    onActivate,
    onArchiveFocusedSession,
    onCloseAllTabs,
    onCloseOtherTabs,
    onClosePane,
    onFindInProject,
    onFocusDir,
    onGoToFile,
    onNavigateProjectList,
    onNavigateSessionList,
    onNew,
    onNewTerminal,
    onNewTerminalTab,
    onNext,
    onOpenApprovalSession,
    onOpenCommandPalette,
    onOpenSearch,
    onPrev,
    onReload,
    onSplit,
    onToggleProjectTerminal,
    onToggleSessionSidebar,
    onToggleSidebar,
    onVisitBack,
    onVisitForward,
    openSettings,
    pickProject,
    searchViewOpenRef,
    sessionsRef,
    settingsOpenRef,
    filePickerOpenRef,
    whatsNewVersionRef,
  });

  return (
    <>
    <div
      className={`flex h-full flex-col text-content ${
        HAS_NATIVE_GLASS ? "bg-background-base/40" : "bg-background-base"
      }`}
    >
      {compactTitleBar ? workspaceTitleBar : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        <Sidebar
          cwd={sidebarCwd}
          gitCwd={gitCwd}
          explorerRootLabel={explorerRootLabel}
          open={sessionSidebarOpen}
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          filesSearchOpen={filesSearchOpen}
          onFilesSearchOpenChange={setFilesSearchOpen}
          onOpenFilesSearch={onFindInProject}
          ciRepair={{
            sessions: repairSessions,
            onOpenSession: onOpenLinkedSession,
            onStart: startCiRepair,
          }}
          searchFocusToken={searchFocusToken}
          sessions={sidebarHistory}
          busySessionIds={busySessionIds}
          approvalSessionIds={approvalSessionIds}
          activeSessionId={active?.id}
          status={historyFailed ? "error" : "idle"}
          pending={historyPending}
          onSelectSession={onSelectHistorySession}
          onPrefetchSession={onPrefetchHistorySession}
          onSessionNavigationOrder={onSessionNavigationOrder}
          onPlaceSessionOnPane={onPlaceSessionOnPane}
          onRenameSession={onRenameHistorySession}
          onArchiveSession={onArchiveHistorySession}
          onArchiveSessions={onArchiveHistorySessions}
          onPinSession={onPinHistorySession}
          onPinSessions={onPinHistorySessions}
          onSetSessionLinkedWorkItem={onSetHistorySessionLinkedWorkItem}
          onDeleteSession={onDeleteHistorySession}
          onDeleteSessions={onDeleteHistorySessions}
          onOpenFile={onOpenFile}
          onOpenTerminal={onOpenTerminal}
          onFileMoved={onFileMoved}
          onFileDeleted={onFileDeleted}
          canGoBack={
            tabVisitNav.canBack ||
            searchViewOpen ||
            settingsOpen
          }
          canGoForward={tabVisitNav.canForward}
          onGoBack={onRailBack}
          onGoForward={onRailForward}
          onOpenDiff={onOpenWorkingTreeDiff}
          onOpenAllChanges={onOpenAllChanges}
          onOpenCommit={onOpenCommit}
          selectedDiffPath={
            activeTab ? selectedChangePath(activeTab, gitCwd) : undefined
          }
          selectedDiffKind={
            activeTab ? selectedChangeKind(activeTab) : undefined
          }
          selectedCommitSha={
            activeTab ? selectedCommitSha(activeTab) : undefined
          }
          textHarness={pickTextHarness(active?.harness)}
          recents={recents}
          busyProjectPaths={sessions.flatMap((session) =>
            session.busy && session.cwd ? [session.cwd] : [],
          )}
          liveAgents={liveAgents}
          onSelectAgent={onSelectLiveAgent}
          onSelectProject={onSelectProject}
          onOpenProject={pickProject}
          onRemoveProject={onRemoveProject}
          onNew={onNew}
          openSessions={openProjectSessions}
          onNewTerminal={onNewTerminal}
          onSearch={onOpenSearch}
          onOpenLinkedWorkItem={onOpenLinkedWorkItem}
          onGoToFile={onGoToFile}
          searchActive={searchViewOpen}
          projectRailOpen={projectRailOpen}
          compactProjectRail={compactProjectRail}
          titleBarAbove={compactTitleBar}
          onToggleProjectRail={onToggleProjectRail}
          unseenFinishedIds={unseenFinishedIds}
          linkedSessionUpdateIds={linkedSessionUpdateIds}
          settingsOpen={settingsOpen}
          settingsSection={settingsSection}
          onOpenSettings={onOpenSettings}
          onOpenNotificationSettings={onOpenNotificationSettings}
          onSelectSettingsSection={onSelectSettingsSection}
          onCloseSettings={onCloseSettings}
          updateNotice={updateNotice}
          onOpenWhatsNew={onOpenWhatsNew}
          onDismissUpdate={() => setUpdateNotice(null)}
        />

        <div className="body-glass flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className={
              searchViewOpen ||
              settingsOpen
                ? "hidden"
                : "flex min-h-0 min-w-0 flex-1 flex-col"
            }
            aria-hidden={searchViewOpen || settingsOpen}
            inert={searchViewOpen || settingsOpen || undefined}
          >
            {!IS_MAC ? (
              <MenuBar
                onNew={onNew}
                onNewTerminal={onNewTerminal}
                onToggleTerminal={onToggleProjectTerminal}
                onGoToFile={onGoToFile}
                onToggleSidebar={onToggleSidebar}
                onToggleSessionSidebar={onToggleSessionSidebar}
                onShowSourceControl={onToggleChanges}
                onCloseCurrentTab={
                  activeTabId ? () => onCloseTab(activeTabId) : undefined
                }
                onCloseOtherTabs={onCloseOtherTabs}
                onCloseAllTabs={onCloseAllTabs}
                onPickProject={pickProject}
                onFindInProject={onFindInProject}
                onSearch={onOpenSearch}
                onZoomIn={() => {
                  const next = saveUiScale(zoomInUiScale(loadUiScale()));
                  void applyUiScale(next);
                }}
                onZoomOut={() => {
                  const next = saveUiScale(zoomOutUiScale(loadUiScale()));
                  void applyUiScale(next);
                }}
                onZoomReset={() => {
                  saveUiScale(UI_SCALE_DEFAULT);
                  void applyUiScale(UI_SCALE_DEFAULT);
                }}
              />
            ) : null}
            {compactTitleBar ? null : workspaceTitleBar}

            <main className="relative flex min-h-0 min-w-0 flex-1">
              <div
                ref={dockGridRef}
                className="grid h-full min-h-0 min-w-0 flex-1"
              >
                {projectTerminals.map((dock) => {
                  const show =
                    dock.open &&
                    sameProjectPath(dock.projectPath, projectCwd);
                  return (
                    <div
                      key={dock.projectPath}
                      className={
                        show
                          ? "h-full min-h-0 min-w-0 w-full overflow-hidden"
                          : "hidden"
                      }
                      style={show ? { gridArea: "dock" } : undefined}
                      aria-hidden={!show}
                    >
                      <ProjectTerminalDock
                        dock={dock}
                        focused={show && projectTerminalFocused}
                        onFocus={focusProjectTerminal}
                        onHide={onHideProjectTerminal}
                        onSideChange={onProjectTerminalSide}
                        onSizePaint={paintDockSize}
                        onSizeCommit={commitDockSize}
                        onAddTerminal={onNewTerminal}
                        onSelectTerminal={onSelectProjectTerminal}
                        onCloseTerminal={onCloseProjectTerminal}
                        onCloseOtherTerminals={onCloseOtherProjectTerminals}
                        onReorderTerminals={onReorderProjectTerminals}
                        onTerminalMetaChange={onTerminalMetaChange}
                      />
                    </div>
                  );
                })}
                <div
                  className="relative flex min-h-0 min-w-0 flex-row"
                  style={{ gridArea: "main" }}
                >
                  <div className="relative min-h-0 min-w-0 flex-1">
                    {tabs.map((tab) => (
                      <div
                        key={tab.id}
                        aria-hidden={tab.id !== activeTabId}
                        className={
                          tab.id === activeTabId
                            ? "absolute inset-0 flex h-full min-h-0 flex-col"
                            : "hidden"
                        }
                      >
                        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
                          <PaneTree
                            {...sessionPaneProps}
                            visible={tab.id === activeTabId}
                            layout={tab.layout}
                            sessions={sessions}
                            editorPanes={[
                              ...tab.editorPanes,
                              ...(tab.terminalPanes ?? []),
                            ]}
                            dirtyFileIds={dirtyFiles}
                            fileErrorCounts={fileErrorCounts}
                            focusedId={
                              tab.id === activeTabId &&
                              !tab.diffFocused &&
                              !projectTerminalFocused
                                ? tab.focusedId
                                : ""
                            }
                            addToChatSessionId={
                              tab.id === activeTabId
                                ? active?.id
                                : undefined
                            }
                            composerFocused={
                              composerFocused && !projectTerminalFocused
                            }
                            composerFocusToken={composerFocusToken}
                            onSelectFile={onSelectFileSurface}
                            onCloseFile={onCloseFile}
                            onCloseOtherFiles={onCloseOtherFiles}
                            onPinFile={onPinFile}
                            onReorderFiles={onReorderFiles}
                            onFileDirtyChange={onFileDirtyChange}
                            onFileErrorCountChange={onFileErrorCountChange}
                            transcriptPool={transcriptPool}
                            onRatio={(splitId, index, ratio) =>
                              onRatio(tab.id, splitId, index, ratio)
                            }
                            editorNavigation={editorNavigation}
                            onUpdatePlan={onUpdatePlan}
                            onMovePane={onMovePane}
                            onDetachPane={onDetachPane}
                            onTerminalMetaChange={onTerminalMetaChange}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {[...linkedWorkItemPanels.values()].map((panel) => (
                <LinkedWorkItemPanel
                  repairSessions={repairSessions}
                  onRepairChecks={onRepairChecks}
                  onOpenSession={(sessionId) => {
                    closeLinkedWorkItemPanel(panel.sessionId);
                    onOpenLinkedSession(sessionId);
                  }}
                  key={panel.sessionId}
                  target={panel.item}
                  cwd={panel.cwd}
                  visible={
                    !searchViewOpen &&
                    !settingsOpen &&
                    activeLinkedWorkItemPanel?.sessionId === panel.sessionId
                  }
                  onClose={() => closeLinkedWorkItemPanel(panel.sessionId)}
                />
              ))}
            </main>
          </div>
          {searchViewOpen ? (
            <SearchView
              open
              cwd={gitCwd}
              recents={recents}
              history={projectHistory}
              sessions={sessions}
              focusToken={searchViewFocusToken}
              besideRail={projectRailOpen || compactProjectRail}
              compactRail={compactRailActive}
              onClose={onLeaveSearch}
              onToggleSidebar={onToggleSidebar}
              onOpenFile={onOpenFile}
              onOpenSession={(sessionId, blockId, query) => {
                if (blockId)
                  requestTranscriptJump(sessionId, blockId, query);
                void onSelectHistorySession(sessionId);
              }}
              onOpenProject={onSelectProject}
            />
          ) : null}
          {settingsOpen ? (
            <SettingsView
              section={settingsSection}
              anchor={settingsAnchor}
              notificationProjectPath={notificationProjectPath}
              notificationSettingsRequest={notificationSettingsRequest}
              recents={recents}
              cwd={sidebarCwd}
              sessions={sidebarHistory}
              liveSessions={sessions}
              onRemoveWorktree={onRemoveWorktree}
              onCheckWorktreeRemoval={onCheckWorktreeRemoval}
              onDeleteWorktreeSessions={onDeleteWorktreeSessions}
              besideRail
              onClose={onCloseSettings}
              onSelectSection={onSelectSettingsSection}
              onOpenSession={onOpenArchivedSession}
              onArchiveSession={onArchiveHistorySession}
              onDeleteSession={onDeleteHistorySession}
              onRestoreProject={onRestoreProject}
              onDeleteProject={(path) =>
                onRemoveProject(path, { purgeData: true })
              }
              onOpenWhatsNew={onOpenWhatsNew}
              collapsedProjectRailMode={collapsedProjectRailMode}
              onCollapsedProjectRailModeChange={setCollapsedProjectRailMode}
            />
          ) : null}
          {searchViewOpen || settingsOpen ? null : (
            <UsageFooter
              providers={usageProviders}
              session={usageSession}
              project={active?.cwd ?? projectCwd}
              onSelectAccount={onSelectProviderAccount}
              onManageAccounts={() =>
                openSettings("providers", "provider-accounts")
              }
              terminals={runningTerminals}
              terminalOpen={runningTerminalOpen}
              onToggleTerminal={onToggleRunningTerminal}
              onNewTerminal={
                isLocalProject(projectCwd) ? onNewTerminal : undefined
              }
              onShowTerminal={
                isLocalProject(projectCwd)
                  ? onShowProjectTerminal
                  : undefined
              }
              projectTerminalActive={
                !!currentProjectDock &&
                currentProjectDock.pane.files.length > 0
              }
            />
          )}
        </div>
      </div>

      {filePickerOpen ? (
        <FilePicker
          key={filePickerResetToken}
          open
          cwd={gitCwd}
          openPaths={openFilePaths}
          initialQuery={filePickerInitialQuery}
          onOpenFile={onOpenFile}
          onRunAction={(id) => {
            if (id === "reload") actions.current.onReload();
          }}
          onClose={() => setFilePickerOpen(false)}
        />
      ) : null}

      {sessionDeleteDialog && (
        <DeleteSessionDialog
          title={sessionDeleteDialog.title}
          unusedWorktree={sessionDeleteDialog.unusedWorktree}
          onClose={(choice) => {
            sessionDeleteDialog.resolve(choice);
            setSessionDeleteDialog(undefined);
          }}
        />
      )}
      <HarnessUpdateNotice
        topOffset={12}
        onHeightChange={setHarnessUpdateHeight}
      />
      <ApprovalToasts
        notices={hiddenApprovalToasts}
        topOffset={
          12 + (harnessUpdateHeight ? harnessUpdateHeight + 8 : 0)
        }
        onFocusSession={onOpenApprovalSession}
        onApproval={onApproval}
      />
      {whatsNewVersion ? (
        <WhatsNewDialog
          version={whatsNewVersion}
          onClose={() => setWhatsNewVersion(null)}
        />
      ) : null}
      {providerSignInRequest ? (
        <ProviderSignInDialog
          key={providerSignInRequest.key}
          harness={providerSignInRequest.harness}
          onClose={() => setProviderSignInRequest(null)}
        />
      ) : null}
    </div>
    <TranscriptPoolOutlet pool={transcriptPool} />
    </>
  );
}
function conversationTitle(session: Session): string {
  const title = sessionDisplayTitle(session.title, session.harness);
  return title === "New session" ? "" : title;
}

function selectedChangePath(
  tab: WorkspaceTab,
  gitCwd?: string,
): string | undefined {
  const file = focusedFileTab(tab);
  if (!file || !isFilesystemTab(file) || !file.review) return undefined;
  return displayPath(file.path, gitCwd || file.cwd);
}

function selectedChangeKind(tab: WorkspaceTab): GitFileDiffKind | undefined {
  const file = focusedFileTab(tab);
  return file?.review ? file.changeKind : undefined;
}

function selectedCommitSha(tab: WorkspaceTab): string | undefined {
  const focused = focusedFileTab(tab);
  if (focused && isCommitTab(focused)) return focused.commit.sha;
  for (const pane of tab.editorPanes) {
    const file = pane.files.find((entry) => entry.id === pane.activeFileId);
    if (file && isCommitTab(file)) return file.commit.sha;
  }
}

function toTitleTab(
  tab: WorkspaceTab,
  sessions: Session[],
  dirtyFiles: Set<string>,
  unseenFinishedIds: ReadonlySet<string>,
): TitleTab {
  const paneIds = leafIds(tab.layout);
  const multiPane = paneIds.length > 1;
  const tabSessions = paneIds
    .map((id) => sessions.find((session) => session.id === id))
    .filter((session): session is Session => session != null);
  const sessionFocused = tabSessions.some(
    (session) => session.id === tab.focusedId,
  );
  const fileFocused =
    !sessionFocused &&
    (tab.editorPanes.some((pane) => pane.id === tab.focusedId) ||
      (tab.terminalPanes ?? []).some((pane) => pane.id === tab.focusedId));
  const focused =
    sessions.find((session) => session.id === tab.focusedId) ?? tabSessions[0];

  const seen = new Set<HarnessId>();
  const harnesses: HarnessId[] = [];
  const busySeen = new Set<HarnessId>();
  const busyHarnesses: HarnessId[] = [];
  const doneSeen = new Set<HarnessId>();
  const doneHarnesses: HarnessId[] = [];
  const ordered = focused
    ? [focused, ...tabSessions.filter((session) => session.id !== focused.id)]
    : tabSessions;
  for (const session of ordered) {
    if (
      session.busy &&
      !sessionNeedsInput(session) &&
      !busySeen.has(session.harness)
    ) {
      busySeen.add(session.harness);
      busyHarnesses.push(session.harness);
    }
    if (unseenFinishedIds.has(session.id) && !doneSeen.has(session.harness)) {
      doneSeen.add(session.harness);
      doneHarnesses.push(session.harness);
    }
    if (seen.has(session.harness)) continue;
    seen.add(session.harness);
    harnesses.push(session.harness);
  }

  const files: string[] = [];
  const seenKeys = new Set<string>();
  const pushFile = (file: FilePaneTab) => {
    const key = file.terminal
      ? `terminal:${file.id}`
      : file.plan
        ? `plan:${file.plan.blockId}`
        : file.releaseNotes
          ? `release-notes:${file.releaseNotes.version}`
          : file.path;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    files.push(
      file.plan?.title?.trim() ||
        (file.releaseNotes
          ? releaseNotesTitle(file.releaseNotes.version)
          : file.terminal
            ? terminalTabLabel(file)
            : basename(file.path)),
    );
  };
  const focusedPane =
    tab.editorPanes.find((pane) => pane.id === tab.focusedId) ??
    (tab.terminalPanes ?? []).find((pane) => pane.id === tab.focusedId);
  const otherPanes = [
    ...tab.editorPanes.filter((pane) => pane.id !== focusedPane?.id),
    ...(tab.terminalPanes ?? []).filter((pane) => pane.id !== focusedPane?.id),
  ];
  const panes = focusedPane ? [focusedPane, ...otherPanes] : otherPanes;
  for (const pane of panes) {
    const active = pane.files.find((file) => file.id === pane.activeFileId);
    if (active) pushFile(active);
  }
  for (const pane of panes) {
    for (const file of pane.files) pushFile(file);
  }

  const more = tabSessions
    .filter((session) => session.id !== focused?.id)
    .map(conversationTitle)
    .filter(Boolean);

  const hasTerminal = (tab.terminalPanes ?? []).some((pane) =>
    pane.files.some(isTerminalTab),
  );
  const focusedFile = focusedFileTab(tab);

  return {
    id: tab.id,
    project: focused
      ? projectName(focused.cwd)
      : focusedFile
        ? projectName(focusedFile.projectCwd ?? focusedFile.cwd)
        : "~",
    title: focused ? conversationTitle(focused) : "",
    more,
    sessionCount: tabSessions.length,
    harnesses,
    busyHarnesses,
    doneHarnesses,
    files,
    multiPane,
    fileFocused,
    blank: isBlankWorkspaceTab(tab, sessions),
    dirty: tab.editorPanes.some((pane) =>
      pane.files.some(
        (file) => isFilesystemTab(file) && dirtyFiles.has(file.id),
      ),
    ),
    terminal: hasTerminal && harnesses.length === 0,
    previewFileId: previewWorkspaceFile(tab)?.id,
    groupId: tab.groupId,
  };
}
