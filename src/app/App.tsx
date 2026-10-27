import {
  createLiveSessionStore,
  useLiveSessions,
} from "../features/sessions/model/liveSessions";
import { useSessionIndicators } from "../features/sessions/hooks/useSessionIndicators";
import { useSessionListActions } from "../features/sessions/hooks/useSessionListActions";
import { useTerminalTabActions } from "../features/terminal/hooks/useTerminalTabActions";
import { useTurnController } from "../features/sessions/hooks/useTurnController";
import { useBtwController } from "../features/sessions/hooks/useBtwController";
import { useOpenFiles } from "../features/files/hooks/useOpenFiles";
import {
  useLinkedWorkItemPanels,
} from "../features/github/hooks/useLinkedWorkItemPanels";
import { useSessionHistory } from "../features/sessions/hooks/useSessionHistory";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Sidebar } from "./shell/Sidebar";
import { ApprovalToasts } from "../features/sessions/ui/ApprovalToasts";
import { HarnessUpdateNotice } from "../features/providers/ui/HarnessUpdateNotice";
import { WhatsNewDialog } from "./shell/WhatsNewDialog";
import { ProviderSignInDialog } from "../features/sessions/ui/ProviderSignInDialog";
import { TitleBar } from "./shell/TitleBar";
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
import {
  HAS_NATIVE_GLASS,
  IS_MAC,
} from "../platform/tauri/platform";
import {
  applyUiScale,
  loadUiScale,
  saveUiScale,
  UI_SCALE_DEFAULT,
  zoomInUiScale,
  zoomOutUiScale,
} from "../features/settings/model/uiScale";
import {
  leafIds,
  newTab,
} from "../features/workspace/model/layout";
import {
  selectedChangeKind,
  selectedChangePath,
  selectedCommitSha,
} from "./model/selectedChange";
import { type WindowTransferPayload } from "./model/windowTransfer";
import {
  cancelHarnessTurn,
  registerBuiltinHarnesses,
  pickTextHarness,
} from "../integrations/harness";
import {
  sessionChildHarnesses,
} from "../features/sessions/model/handoff";
import { pathKey } from "../shared/lib/paths";
import {
  lastProjectPath,
  isLocalProject,
  sameProjectPath,
} from "../features/projects/model/recents";
import {
  newDefaultSession,
  type Session,
} from "../features/sessions/model/session";
import { type SessionSummary } from "../features/sessions/data/sessionStore";
import {
  TranscriptPool,
  TranscriptPoolOutlet,
} from "../features/sessions/ui/TranscriptPool";
import { useInputNotifications } from "../features/notifications/hooks/useInputNotifications";
import {
  deferUnhandledEscape,
  focusedBusyAgentSessionId,
  shouldStopFocusedTurnOnEscape,
} from "../features/workspace/model/tabKeys";

import { PaneTree } from "../features/workspace/ui/PaneTree";
import { ProjectTerminalDock } from "../features/terminal/ui/ProjectTerminalDock";
import { lazySurface } from "../shared/ui/lazySurface";
import { requestTranscriptJump } from "../features/sessions/model/transcriptJump";
import {
  loadLiveAgentsEnabled,
  subscribeLiveAgentsEnabled,
} from "../features/settings/model/settings";

import type { InstalledUpdate } from "./model/updateNotice";
import {
  type ResumedWorkspace,
} from "./model/appLifecycle";
import { useAppCommands } from "./hooks/useAppCommands";
import { useWorkspaceLifecycle } from "./hooks/useWorkspaceLifecycle";
import {
  useWorkspaceFocus,
  useWorkspaceView,
} from "./hooks/useWorkspaceView";
import { useNavigationActions } from "./hooks/useNavigationActions";
import { useAppSurfaces } from "./hooks/useAppSurfaces";
import { useTerminalDock } from "../features/terminal/hooks/useTerminalDock";
import { useProjectState } from "../features/projects/hooks/useProjectState";
import { useWorkspaceTabState } from "../features/workspace/hooks/useWorkspaceTabState";
import { useWorkspaceTabActions } from "../features/workspace/hooks/useWorkspaceTabActions";
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

  const {
    activeTab,
    active,
    sidebarCwd,
    sidebarCwdRef,
    gitCwd,
    gitCwdRef,
    activeSkillContext,
    activeSkillCwd,
  } = useWorkspaceFocus({
    sessions,
    tabs,
    activeTabId,
    projectCwd,
  });

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
    onNavigateProjectList,
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

  useWorkspaceLifecycle({
    resumed,
    readProjectReturnMemory,
    liveSessions,
    flushHarnessEvents,
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    projectCwdRef,
    projectTerminalsRef,
    lastDockSideRef,
    projectTerminalFocusedRef,
    activeSkillContext,
    activeSkillCwd,
    active,
    gitCwd,
    activeTabId,
    searchViewOpen,
    settingsOpen,
    setComposerFocused,
    setComposerFocusToken,
    searchViewOpenRef,
    settingsOpenRef,
  });

  const gitCwdBranches = useProjectBranches(
    gitCwd,
    Boolean(gitCwd) && gitCwd !== "~",
  );
  const projectBranches = useProjectBranches(
    sidebarCwd,
    Boolean(sidebarCwd) && sidebarCwd !== "~",
  );

  const activeSessionId = active?.id;

  useInputNotifications(sessions, activeSessionId);

  const {
    busySessionIds,
    approvalSessionIds,
    unseenFinishedIds,
    unseenFinishedRef,
    liveAgents,
    hiddenApprovalToasts,
    onApproval,
    onQuestionReply,
    onQuestionInteraction,
    onLinkedWorkItemUpdateCardDismiss,
    onHandoffCardDismiss,
  } = useSessionIndicators({
    sessions,
    sessionsRef,
    setSessions,
    activeSessionId,
    activeTabId,
    tabs,
    composerFocused,
    liveAgentsEnabled,
    setLinkedWorkItemUpdateCard,
  });

  const {
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
  } = useWorkspaceView({
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
  });

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

  const {
    onOpenTerminal,
    onNewTerminal,
    onNewTerminalInSession,
    onTerminalMetaChange,
    onToggleRunningTerminal,
    onNewTerminalTab,
    onCloseOtherTabs,
    onCloseTitleTab,
  } = useTerminalTabActions({
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
  });

  onOpenTerminalRef.current = onOpenTerminal;

  onVisitBackRef.current = onVisitBack;
  onVisitForwardRef.current = onVisitForward;

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
    onToggleChanges,
    onOpenWorkingTreeDiff,
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

  const {
    onArchiveHistorySessions,
    onPinHistorySessions,
    onDeleteWorktreeSessions,
    onDeleteHistorySession,
    onDeleteHistorySessions,
    onArchiveTitleTab,
    onDeleteTitleTab,
    onFocusDir,
    onRatio,
    onReload,
    onOpenLinkedSession,
    onOpenArchivedSession,
  } = useSessionListActions({
    activeTab,
    history,
    sessionsRef,
    tabsRef,
    setTabs,
    setSettingsOpen,
    setSidebarTab,
    onFocusPane,
    dirtyFilesRef,
    onArchiveHistorySession,
    onPinHistorySession,
    onRemoveHistorySession,
    onSelectHistorySession,
  });

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

  const {
    startCiRepair,
    onRepairChecks,
    onOpenSettings,
    onManageWorktrees,
  } = useNavigationActions({
    sessionDefaults,
    sessionsRef,
    setSessions,
    ensureOpenSession,
    onSelectHistorySession,
    onSubmit,
    setSearchViewOpen,
    setSidebarTab,
    openSettings,
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

  const { linkedSessionUpdateIds, linkedSessionUpdates } =
    useLinkedWorkItemActivity(sidebarCwd, sidebarHistory);
  linkedSessionUpdatesRef.current = linkedSessionUpdates;

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

