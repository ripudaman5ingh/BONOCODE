# App.tsx split map

Analysis of `src/app/App.tsx` before it is split into stores. Every line number refers to the file at commit `631301a` (branch `m1/session-store`). This document makes no code changes.

## Existing state tooling (baseline)

- **Store libraries in `package.json`:** none. There is no zustand, jotai, redux, valtio, mobx, recoil, xstate or nanostores. Tests run on `vitest` (`"test": "vitest run"`).
- **`useSyncExternalStore`:** already the house pattern. It has 34 call sites in 22 files, App.tsx included. The pattern is a module-level value, a `listeners` Set, and `subscribe`/`getSnapshot`. Examples are `src/features/workspace/model/paneDrop.ts:81-93`, `src/features/source-control/hooks/useProjectBranches.ts:132`, `src/features/providers/model/rateLimitsCache.ts:57`, `src/features/sessions/ui/TranscriptPool.tsx:102` and `src/features/sessions/model/projectProviders.ts:30`. App.tsx itself uses it once, for `liveAgentsEnabled` (`App.tsx:864`).
- **React contexts (`createContext`):** six, and none of them hold app state:
  - `RevealedSetting` (`features/settings/ui/SettingsView.tsx:337`)
  - `FileOpenContext` and `RemoteMediaContext` (`features/sessions/ui/AgentMarkdown.tsx:115,125`)
  - the model-source context (`features/sessions/ui/modelSource.ts:43`)
  - `TreeCtx` (`features/files/ui/FileTree.tsx:131`)
  - `NativePopupHost` (`shared/ui/NativePopupHost.tsx:4`)
- **`src/app/hooks/`:** holds one file.
  - `useLinkedWorkItemActivity.ts` (232 lines) polls the GitHub issues and PRs that chats link to. It returns `linkedSessionUpdateIds` and `linkedSessionUpdates`.
- **Name collision to avoid:** `src/features/sessions/data/sessionStore.ts` (1,129 lines) already exists. It is the persistence layer (`upsertSession`, `getSession`, `listSessionsByProject`…). The new in-memory store needs a different name. This doc uses `liveSessions.ts`.

---

## A. Summary

| | |
|---|---|
| File | `src/app/App.tsx` |
| Total lines | **8,923** |
| Exports | only `default function App` (763). Every helper is module-private. |
| Only importer | `src/main.tsx:25` (`import("./app/App")`) |

| Region | Lines |
|---|---|
| Imports | 1–550 |
| Lazy surfaces (`SearchView`, `SettingsView`, `LinkedWorkItemPanel`) | 552–569 |
| Constants and types (`SESSION_DETACH_DELAY_MS`, `LinkedWorkItemPanelState`, `SubmitOptions`, `Submit`) | 571–601 |
| Pure module helpers (`withPlanStatus`, `withHarnessChoice`, `withPlanBuildTarget`, `openSessionIds`, `titleTabsEqual`, …) | 603–750 |
| `registerBuiltinHarnesses()` side effect | 753 |
| `AppProps` + `App` (Suspense wrapper) | 755–769 |
| `Workspace` component | 771–8638 |
| ├ State declarations, main block | 778–1044 |
| ├ State declarations, later (sidebar/git/busy refs, detach, usage tick, title tabs, actions, dock refs) | 1297–1358, 1458–1504, 1819–1821, 6322, 7333, 7742, 7801, 8116–8117 |
| ├ Effects (39 `useEffect` + 2 `useLayoutEffect`, interleaved) | first 976, last 8135 |
| ├ Handlers (`useCallback`s) | 836–8149; the bulk is 1877–7740 |
| ├ Render-time derived values (`active`, `sidebarCwd`, `gitCwd`, title tabs, history slices) | 1223–1505, 3008, 7093, 7327–7387 |
| ├ `sessionPaneProps` object (47 keys) | 8151–8199 |
| └ JSX: `workspaceTitleBar` element + `return` | 8205–8234, 8236–8637 |
| Module helpers after the component (`toTitleTab`, `dropOpenFiles`, `trackSessionEdits`, `nudgeOpenEditors`, …) | 8639–8923 |

Other hooks called inside `Workspace`:
- `useProjectBranches` (1330, 1340)
- `useInputNotifications` (1468)
- `useLinkedWorkItemActivity` (7363)
- `useSyncExternalStore` (864)

---

## B. State table

R = read by, W = written by. These are the top-level blocks inside `Workspace` that reference the state, from a cross-reference pass checked by hand. `render@N` means a render-time statement at line N. "JSX" means the returned tree.

| Name | Line | Kind | Domain | Read by | Written by |
|---|---|---|---|---|---|
| projectCwd | 778 | useState | projects/cwd | 20 blocks: currentProjectDock, projectCwdRef, sidebarCwd, runningTerminals, effect@1755, onNew, onSplit, onShowProjectTerminal, onToggleProjectTerminal, onCloseFile, onCloseAllTabs, JSX… | effect@1788, activateTab, onRemoveWorktree, onCwdChange, openProjects, onRemoveProject, applyProjectLocationChange |
| recents | 785 | useState | projects/cwd | effect@1046, sessionPaneProps, workspaceTitleBar, JSX | effect@1788, activateTab, onRemoveWorktree, onCwdChange, openProjects, onRemoveProject, onRestoreProject, applyProjectLocationChange |
| seed | 790 | useState (const) | sessions/turns | initializers of sessions/tabs/activeTabId only | never |
| **sessions** | 796 | useState | sessions/turns | 55 blocks: every derived value (active, busy/approval sets, liveAgents, title tabs, history slices), 13 effects (976, 1008, 1506, 1665, 1737, 1755, 1862, 6136, 6323, 6369, 7100 via autoContinueKey…), JSX (PaneTree, Sidebar `busyProjectPaths`, SearchView, SettingsView) | 52 blocks: flushHarnessEvents, applyApprovalEvent, effects 1195/1253/1788/6136/6369, detachIdleSessions, onSelectProviderAccount, onNew, setLinkedWorkItemUpdateCard, onHandoffCardDismiss, onSplit, onOpenTerminal, onCloseFile, onClearTabSession, onCloseAllTabs, replaceBlankPaneWithSession, ensureOpenSession, onPlaceSessionOnPane, onPlaceTabOnPane, onRenameHistorySession, onRemoveWorktree, onRemoveHistorySession, onSetHistorySessionLinkedWorkItem, onCwdChange, onBranchChange, onWorkspaceModeChange, onWorktreeBaseChange, onWorktreeChange, openProjects, onRemoveProject, applyProjectLocationChange, onModelChange, onModelSettingsChange, onRuntimeModeChange, onSaveDraft, onRemoveDraft, submitSession, onUpdatePlan, queued-message handlers ×4, usage-limit handlers ×2, openSessionBeside, updateBtwThread, removeBtwThread, onCompactContext, onStop, startCiRepair |
| sessionDeleteDialog | 799 | useState | sessions/turns | JSX | onRemoveHistorySession, JSX |
| switchingWorktrees | 804 | useRef | source-control/git | persistSession, effect@1665, onRemoveWorktree, onRemoveHistorySession, onWorktreeChange, submitSession | onWorktreeChange |
| removingWorktreePaths | 805 | useRef | source-control/git | onRemoveWorktree, onWorktreeChange, submitSession | onRemoveWorktree |
| deleteConfirmationPending | 806 | useRef | sessions/turns | onRemoveHistorySession | onRemoveHistorySession |
| **tabs** | 807 | useState | tabs & layout | 38 blocks: tabsRef, activeTab, effects 1008/1241/1737/1755/1802/1862/1929, runningTerminals, hiddenApprovalToasts, deckProjectTabs, onClearTabSession, openFilePaths, JSX | 40 blocks: effects 1253/1802, activateTab, appendTab, onSplit, onOpenTerminal, onTerminalMetaChange, onToggleRunningTerminal, onCloseTab, onCloseTabs, onCloseFile, onCloseOtherFiles, onClearTabSession, onCloseAllTabs, onClosePane, onFocusPane, onOpenDiff, onOpenAllChanges, onOpenCommit, onReorderTabs, onReorderFiles, onMovePane, onDetachPane, focusOpenSession, replaceBlankPaneWithSession, onPlaceSessionOnPane, onPlaceTabOnPane, onRemoveHistorySession, onRatio, onCwdChange, openProjects, onRemoveProject, onFileMoved, onFileDeleted, onOpenFile, onOpenPlan, onPinFile, onSelectFileSurface, openSessionBeside, onNavigateSessionList |
| projectTerminals | 810 | useState | terminal | currentProjectDock, projectTerminalsRef, runningTerminals, effect@1755, JSX | 14 dock handlers (openProjectTerminal … onToggleRunningTerminal), onRemoveProject, applyProjectLocationChange |
| lastDockSide | 814 | useState | terminal | lastDockSideRef, effect@1755 | onProjectTerminalSide |
| lastDockSideRef | 817 | useRef (mirror) | terminal | effects 1162/1558, openProjectTerminal | render@818 |
| projectTerminalFocused | 819 | useState | terminal | projectTerminalFocusedRef, JSX | effect@1253, effect@7642, focusProjectTerminal, onToggleProjectTerminal, onHideProjectTerminal, onToggleRunningTerminal, onFocusPane, onDetachPane, onPlaceSessionOnPane, onPlaceTabOnPane, onOpenFile, openSessionBeside |
| **activeTabId** | 820 | useState | tabs & layout | 32 blocks: activeTabIdRef, activeTab, effects 1008/1547/1755/1929, deckProjectTabs, onNext/onPrev, onCloseFile, onFocusPane, onOpenDiff/AllChanges/Commit, onOpenPlan, onRemoveProject, JSX | 17 blocks: effect@1253, activateTab, onSelectProviderAccount, onNew, onOpenTerminal, onToggleRunningTerminal, focusOpenSession, replaceBlankPaneWithSession, onSelectHistorySession, onPlaceSessionOnPane, onPlaceTabOnPane, onCwdChange, onWorktreeChange, openProjects, onRemoveProject, onOpenFile, openSessionBeside |
| composerFocused | 823 | useState | tabs & layout | hiddenApprovalToasts, JSX | 32 blocks (most tab/session/file handlers, effects 1253/1510) |
| composerFocusToken | 833 | useState | tabs & layout | JSX | effect@1510 |
| tabProjectsRef | 835 | useRef | tabs & layout | projectOfTab | render@7330 |
| projectRailOpen | 840 | useState | settings/appearance | compactRailActive, workspaceTitleBar, JSX | onToggleSidebar, onToggleProjectRail |
| sessionSidebarOpen | 841 | useState | settings/appearance | workspaceTitleBar, JSX | onToggleSessionSidebar |
| filesSearchOpen | 847 | useState | files | JSX | onFindInProject, JSX |
| searchFocusToken | 848 | useState | files | JSX | onFindInProject |
| searchViewOpen | 849 | useState | settings/appearance (surfaces) | searchViewOpenRef, foregroundSurfaceRef, layoutEffect@1547, onRailBack, JSX | onNew, openProjects, onSelectLiveAgent, onGoToFile, onOpenCommandPalette, onFindInProject, onOpenSearch, onLeaveSearch, onOpenLinkedWorkItem, startCiRepair, openSettings, onCloseSettings, onRailBack, onRailForward |
| searchViewFocusToken | 850 | useState | settings/appearance (surfaces) | JSX | onOpenSearch |
| linkedWorkItemPanels | 851 | useState | github linked items | activeLinkedWorkItemPanel, JSX | closeLinkedWorkItemPanel, effect@1241, onSetHistorySessionLinkedWorkItem, onOpenLinkedWorkItem |
| linkedWorkItemPanelRequest | 854 | useRef | github linked items | closeLinkedWorkItemPanel, onOpenLinkedWorkItem | same |
| liveAgentsEnabled | 864 | useSyncExternalStore | notifications | liveAgents, detachInputs, effect@1862 | settings module |
| collapsedProjectRailMode | 869 | useState | settings/appearance | compactProjectRail, JSX | JSX (SettingsView callback) |
| settingsOpen | 871 | useState | settings/appearance (surfaces) | foregroundSurfaceRef, settingsOpenRef, layoutEffect@1547, onRailBack, JSX | onOpenSearch, onOpenLinkedWorkItem, openSettings, onCloseSettings, onOpenArchivedSession, onRailForward |
| settingsReturnViewRef | 872 | useRef | settings/appearance | onCloseSettings | openSettings |
| updateNotice | 875 | useState | settings/appearance | JSX | JSX (`onDismissUpdate`) |
| whatsNewVersion | 876 | useState | settings/appearance | whatsNewVersionRef, JSX | onOpenWhatsNew, JSX |
| providerSignInRequest | 877 | useState | providers/harnesses | effect@1418, JSX | effects 1410/1418, JSX |
| seenProviderSignInRequestsRef | 882 | useRef (lazy-init from `sessions`, 883–895) | providers/harnesses | effect@1410 | render@883 |
| settingsSection | 896 | useState | settings/appearance | JSX | openSettings, onSelectSettingsSection |
| settingsAnchor | 898 | useState | settings/appearance | JSX | openSettings |
| notificationProjectPath | 901 | useState | notifications | JSX | openSettings, onOpenNotificationSettings |
| notificationSettingsRequest | 904 | useState | notifications | JSX | onOpenNotificationSettings |
| editorNavigation | 906 | useState | files | JSX | onOpenFile |
| editorNavigationToken | 908 | useRef | files | onOpenFile | onOpenFile |
| filePickerOpen | 909 | useState | files | filePickerOpenRef, JSX | onGoToFile, onOpenCommandPalette, onOpenSearch, onOpenLinkedWorkItem, openSettings, JSX |
| filePickerInitialQuery | 910 | useState | files | JSX | onGoToFile, onOpenCommandPalette |
| filePickerResetToken | 911 | useState | files | JSX | onGoToFile, onOpenCommandPalette |
| dirtyFiles | 912 | useState | files | dirtyFilesRef, nextTitleTabs (7328), JSX | onCloseTab, onCloseTabs, onCloseFile, onCloseOtherFiles, onClearTabSession, onCloseAllTabs, onRemoveHistorySession, onRemoveProject, onFileDeleted, onFileDirtyChange |
| fileErrorCounts | 917 | useState | files | JSX | onFileErrorCountChange |
| history | 920 | useState | sessions/turns (history) | onRemoveHistorySession, onSetHistorySessionLinkedWorkItem, projectHistory, sidebarHistory, repairSessions, onOpenLinkedWorkItem, onOpenLinkedSession | refreshHistory, persistSession, effect@1665, onRemoveWorktree, onRemoveHistorySession, onArchiveHistorySession, onPinHistorySession, onSetHistorySessionLinkedWorkItem, applyProjectLocationChange, onRemoveDraft |
| btwRequestsRef | 926 | useRef | sessions/turns (btw) | effects 976/985, runBtwRequest, onBtwDelete, onBtwStop | same |
| loadedProjects | 929 | useState | sessions/turns (history) | loadedProjectsRef, historyPending | refreshHistory, applyProjectLocationChange |
| loadedProjectsRef | 935 | useRef (mirror) | sessions/turns (history) | refreshHistory | render@936 |
| historyErrorCwd | 938 | useState | sessions/turns (history) | historyFailed | refreshHistory |
| **sessionsRef** | 940 | useRef (mirror + eager write) | sessions/turns | 79 blocks | render@941, plus 20 handlers that write `sessionsRef.current = next` before `setSessions(next)`: flushHarnessEvents, applyApprovalEvent, effect@1253, setLinkedWorkItemUpdateCard, ensureOpenSession, onPlaceSessionOnPane, onPlaceTabOnPane, onRemoveWorktree, onRemoveHistorySession, onSetHistorySessionLinkedWorkItem, onBranchChange, onWorktreeChange, onRemoveProject, applyProjectLocationChange, submitSession, openSessionBeside, updateBtwThread, removeBtwThread, onCompactContext, startCiRepair |
| linkedSessionUpdatesRef | 942 | useRef (mirror) | github linked items | revealLinkedSessionUpdate, onSelectHistorySession, onNavigateSessionList | render@7365 |
| linkedWorkItemActivityFetches | 945 | useRef | github linked items | revealLinkedSessionUpdate | same |
| queueDispatchingRef | 946 | useRef | sessions/turns | effect@6136 | effect@6136 |
| usageResumingRef | 947 | useRef | providers/harnesses | effect@6323 | effect@6323 |
| usageResetLookups | 948 | useRef | providers/harnesses | effect@6369 | effect@6369 |
| tabsRef | 949 | useRef (mirror + eager write) | tabs & layout | 37 blocks (incl. enqueueHarnessEvent, detachIdleSessions, effect@1665) | render@950, effect@1253, onDetachPane, onPlaceSessionOnPane, onPlaceTabOnPane, onRemoveHistorySession, onRemoveProject, openSessionBeside |
| dirtyFilesRef | 951 | useRef (mirror) | files | close handlers ×6, onRemoveHistorySession, onReload | render@952 |
| projectTerminalsRef | 953 | useRef (mirror) | terminal | effects 1162/1558, dock handlers, checkOpenWorktreeFiles, paintDockSize | render@954, applyProjectLocationChange |
| projectTerminalFocusedRef | 955 | useRef (mirror) | terminal | effect@1510, onArchiveFocusedSession, effect@7241 | render@956 |
| activeTabIdRef | 957 | useRef (mirror) | tabs & layout | 24 blocks (incl. enqueueHarnessEvent) | render@958, onRemoveProject |
| projectCwdRef | 959 | useRef (mirror) | projects/cwd | 20 blocks | render@960, applyProjectLocationChange |
| searchViewOpenRef | 961 | useRef (mirror) | settings/appearance | effect@1510, onArchiveFocusedSession, openSettings, effect@7820 | render@962 |
| foregroundSurfaceRef | 963 | useRef (mirror) | settings/appearance | enqueueHarnessEvent | render@966 |
| settingsOpenRef | 969 | useRef (mirror) | settings/appearance | effect@1510, onArchiveFocusedSession, openSettings, effect@7820 | render@970 |
| sessionNavigationIdsRef | 971 | useRef | sessions/turns | onNavigateSessionList | onSessionNavigationOrder |
| filePickerOpenRef | 972 | useRef (mirror) | files | onArchiveFocusedSession, effect@7820 | render@973 |
| whatsNewVersionRef | 974 | useRef (mirror) | settings/appearance | onArchiveFocusedSession, effect@7820 | render@975 |
| projectReturnRef | 996 | useRef | projects/cwd | readProjectReturnMemory, effect@1755 | readProjectReturnMemory |
| tabVisitRef | 1012 | useRef | tabs & layout | commitTabVisit, effect@1929, onVisitBack, onVisitForward | commitTabVisit |
| tabVisitFromHistoryRef | 1013 | useRef | tabs & layout | effect@1929, onVisitBack, onVisitForward | same |
| tabVisitNav | 1014 | useState | tabs & layout | workspaceTitleBar, JSX | commitTabVisit |
| **turnGen** | 1018 | useRef (Map) | sessions/turns | stopSessionForRemoval, onRemoveProject, submitSession, onCompactContext, onStop | same five |
| editedResends | 1019 | useRef(...).current | sessions/turns | submitSession | (coordinator internal) |
| lastPersisted | 1020 | useRef | sessions/turns (persistence) | 13 blocks | 13 blocks (effect@1052, persistSession, effect@1665, onOpenTerminal, replaceBlankPaneWithSession, ensureOpenSession, onPlaceSessionOnPane, onPlaceTabOnPane, onRenameHistorySession, onRemoveWorktree, onRemoveHistorySession, onRemoveProject, onRemoveDraft) |
| lastBoundProvider | 1021 | useRef | sessions/turns (persistence) | effects 1052/1665 | same |
| lastPersistedUserBlock | 1022 | useRef | sessions/turns (persistence) | effects 1052/1665, onRemoveDraft | same |
| inFlightSyncKey | 1023 | useRef | sessions/turns | effect@1737 | effect@1737 |
| sawInFlight | 1024 | useRef | sessions/turns | effect@1737 | effect@1737 |
| workspaceSyncKey | 1025 | useRef | tabs & layout (persistence) | effect@1755 | effect@1755 |
| observedSessions | 1026 | useRef | sessions/turns (persistence) | effects 1052/1665 | same |
| pendingPersist | 1027 | useRef | sessions/turns (persistence) | effect@1665, onRemoveWorktree, onRemoveHistorySession, onWorktreeChange, onRemoveProject, applyProjectLocationChange, onRemoveDraft | same |
| removingSessionIds | 1028 | useRef | sessions/turns | persistSession, effect@1665, loadStoredSession, ensureOpenSession, onPrefetchHistorySession, onRemoveWorktree, onRemoveHistorySession, onArchiveHistorySession, onWorktreeChange, submitSession | onRemoveWorktree, onRemoveHistorySession |
| loadedSessionCache | 1029 | useRef | sessions/turns (load cache) | 11 blocks | detachIdleSessions, focusOpenSession, invalidateLoadedSession, loadStoredSession, ensureOpenSession, onRenameHistorySession, onSetHistorySessionLinkedWorkItem, applyProjectLocationChange, onRemoveHistorySession, onRemoveProject |
| sessionLoads | 1030 | useRef | sessions/turns (load cache) | invalidateLoadedSession, loadStoredSession, onPrefetchHistorySession, onRemoveProject | invalidateLoadedSession, loadStoredSession |
| sessionLoadEpochs | 1031 | useRef | sessions/turns (load cache) | invalidateLoadedSession, loadStoredSession | invalidateLoadedSession |
| openingSessionIds | 1032 | useRef | sessions/turns (load cache) | detachIdleSessions, invalidateLoadedSession, ensureOpenSession | same |
| activeSessionPrefetch | 1033 | useRef | sessions/turns (load cache) | onPrefetchHistorySession | same |
| transcriptPool | 1034 | useState (const) | sessions/turns | JSX (PaneTree, TranscriptPoolOutlet) | never |
| **harnessQueued** (harness event queue) | 1037 | useRef (Map) | sessions/turns | flushHarnessEvents, applyApprovalEvent, enqueueHarnessEvent | same |
| **harnessFlush** | 1038 | useRef | sessions/turns | flushHarnessEvents, enqueueHarnessEvent, effect@1162 | same |
| skipForgetSessionIds | 1039 | useRef | sessions/turns | detachIdleSessions | never written (always empty) |
| importedSessionsApplied | 1040 | useRef | sessions/turns | effect@1052 | effect@1052 |
| projectLocationSyncs | 1041 | useRef | projects/cwd | submitSession | submitSession |
| submitAfterProjectSyncRef | 1044 | useRef | sessions/turns | submitSession | render@6057 |
| sidebarCwdRef | 1297 | useRef (mirror) | projects/cwd | setSidebarTab, refreshHistory, persistSession, effect@1665, onOpenDiff, onOpenAllChanges, onOpenCommit, onOpenFile | render@1298 |
| sidebarTabSelection | 1299 | useState | settings/appearance (sidebar) | sidebarTab | setSidebarTab, onRemoveProject, applyProjectLocationChange |
| gitCwdRef | 1338 | useRef (mirror) | source-control/git | onOpenDiff, onOpenAllChanges, onOpenCommit, onOpenFile | render@1339 |
| nextBusySessionIds | 1345 | useMemo | sessions/turns | busySessionIdsRef | derived |
| busySessionIdsRef | 1354 | useRef (identity cache) | sessions/turns | busySessionIds → Sidebar, unseen-finished calc | render@1355 |
| usageProviders | 1372 | useMemo | providers/harnesses | JSX (UsageFooter) | derived |
| usageSession | 1382 | useMemo | providers/harnesses | JSX (UsageFooter) | derived |
| activeProviderSignInRequest | 1396 | useMemo | providers/harnesses | effect@1410 | derived |
| runningTerminals | 1426 | useMemo | terminal | runningTerminalOpen, JSX | derived |
| runningTerminalOpen | 1437 | useMemo | terminal | JSX | derived |
| nextApprovalSessionIds | 1449 | useMemo | notifications | approvalSessionIdsRef | derived |
| approvalSessionIdsRef | 1458 | useRef (identity cache) | notifications | approvalSessionIds → Sidebar | render@1459 |
| activeSessionIdRef | 1465 | useRef (mirror) | sessions/turns | submitSession (finish banner) | render@1466 |
| busyForDoneRef | 1474 | useRef | notifications | render@1477 | render@1477 |
| focusedForDoneRef | 1475 | useRef | notifications | render@1477 | render@1477 |
| unseenFinishedRef | 1476 | useRef | notifications | unseenFinishedIds, detachIdleSessions | render@1477 |
| liveAgents | 1492 | useMemo | notifications | JSX (Sidebar) | derived |
| hiddenApprovalToasts | 1500 | useMemo | notifications | JSX (ApprovalToasts) | derived |
| harnessUpdateHeight | 1504 | useState | providers/harnesses | JSX | JSX (HarnessUpdateNotice callback) |
| detachInputs | 1819 | useRef (mirror) | sessions/turns | detachIdleSessions | render@1820 |
| detachTimer | 1821 | useRef | sessions/turns | detachIdleSessions, effects 1862/1870 | detachIdleSessions, effect@1862 |
| deckProjectTabs | 3008 | useMemo | tabs & layout | onNext, onPrev, onActivate, nextTitleTabs | derived |
| usageLimitTick | 6322 | useState | providers/harnesses | effect@6323 | effect@6323 |
| titleTabsRef | 7333 | useRef (identity cache) | tabs & layout | titleTabs | render@7334 |
| projectHistory | 7341 | useMemo | sessions/turns (history) | JSX (SearchView) | derived |
| sidebarHistory | 7346 | useMemo | sessions/turns (history) | useLinkedWorkItemActivity, JSX | derived |
| repairSessions | 7366 | useMemo | source-control/git | JSX (Sidebar, LinkedWorkItemPanel) | derived |
| openProjectSessions | 7370 | useMemo | sessions/turns | JSX (Sidebar) | derived |
| openFilePaths | 7646 | useMemo | files | JSX (FilePicker) | derived |
| actions | 7742 | useRef (mirror of 27 handlers) | other (shortcuts/menu) | effects 7820/8007, JSX (FilePicker `onRunAction`) | render@7771 |
| debounce | 7801 | useRef | other (shortcuts/menu) | run | run |
| dockGridRef | 8116 | useRef (DOM) | terminal | paintDockSize, layoutEffect@8135, JSX | React |
| dockDragSize | 8117 | useRef | terminal | paintDockSize, commitDockSize, layoutEffect@8135 | paintDockSize, commitDockSize |

There is no `useReducer` in the file.

---

## C. Effects table

| Line | Purpose | State read | State written | Domain |
|---|---|---|---|---|
| 976 | Abort `/btw` requests whose session left `sessions` | sessions, btwRequestsRef | btwRequestsRef | sessions/turns |
| 985 | Unmount: abort all `/btw` requests and stop text prompts | btwRequestsRef | btwRequestsRef | sessions/turns |
| 1008 | Reconcile project-return memory | activeTabId, tabs, sessions | projectReturnRef | projects/cwd |
| 1046 | `rememberProjectLocation` for each recent | recents | — | projects/cwd |
| 1052 | Seed persistence fingerprints from imported sessions (once) | windowTransfer, resumed | observedSessions, lastPersisted, lastPersistedUserBlock, lastBoundProvider, importedSessionsApplied | sessions/turns |
| 1162 | Bind resumed sessions, start the harness bridge, persist and reap on pagehide/beforeunload, cancel flush on unmount | sessionsRef, tabsRef, activeTabIdRef, projectCwdRef, projectTerminalsRef, lastDockSideRef | harnessFlush | sessions/turns |
| 1195 | Probe harness availability, refresh catalogs, normalize session models | sessionsRef | sessions | providers/harnesses |
| 1241 | Drop linked-item panels whose session is in no tab | tabs | linkedWorkItemPanels | github linked items |
| 1253 | `ADD_TO_CHAT_EVENT` listener: apply add-to-chat | sessionsRef, tabsRef, activeTabIdRef, projectCwdRef, sessionDefaults | sessionsRef, tabsRef, sessions, tabs, activeTabId, projectTerminalFocused, composerFocused | sessions + tabs |
| 1289 | Warm native skills for the active session | active, activeSkillContext | — | other (skills) |
| 1367 | Refresh the live model catalog for the active harness | activeHarness | — | providers/harnesses |
| 1410 | Open the sign-in dialog once per login-needed turn | activeProviderSignInRequest, seen set | providerSignInRequest, seen set | providers/harnesses |
| 1418 | Clear the sign-in request when the active session changes | active.id, providerSignInRequest | providerSignInRequest | providers/harnesses |
| 1471 | Probe OS notification permission | — | — | notifications |
| 1506 | `syncDockBadge(sessions)` | sessions | (native badge) | notifications |
| 1510 | Window focus: `setWindowFocused`, flush the harness queue, dock badge, refocus the composer | sessionsRef, projectTerminalFocusedRef, searchViewOpenRef, settingsOpenRef | composerFocused, composerFocusToken, sessions (via flush) | notifications + sessions + tabs |
| 1537 | `visibilitychange` → `flushHarnessEvents` | — | sessions (via flush) | sessions/turns |
| 1547 (layout) | Flush the harness queue before paint on tab or surface switch | activeTabId, searchViewOpen, settingsOpen | sessions (via flush) | sessions/turns |
| 1558 | `setQuitWorkspace` + `onCloseRequested` (tray, close, persist) | sessionsRef, tabsRef, activeTabIdRef, projectCwdRef, projectTerminalsRef, lastDockSideRef | sessions (via flush) | sessions/turns |
| 1634 | `refreshHistory(sidebarCwd)` | sidebarCwd | history, loadedProjects, historyErrorCwd | sessions/turns |
| 1638 | `prefetchProjectFiles(gitCwd)` | gitCwd | — | files |
| 1665 | Debounced (650 ms) session persistence | sessions, tabsRef, observedSessions, lastPersisted, lastBoundProvider, lastPersistedUserBlock, removingSessionIds, switchingWorktrees, sidebarCwdRef | observedSessions, pendingPersist, lastPersisted, lastBoundProvider, lastPersistedUserBlock, history | sessions/turns |
| 1737 | Write the in-flight session snapshot | sessions, tabs | inFlightSyncKey, sawInFlight | sessions/turns |
| 1755 | Debounced (250 ms) workspace snapshot save | tabs, sessions, activeTabId, projectCwd, projectTerminals, lastDockSide, projectReturnRef | workspaceSyncKey | tabs & layout |
| 1788 | Resolve `default_cwd` when there is no last project | — | projectCwd, recents, sessions | projects + sessions |
| 1802 | Isolate terminal panes in every tab | tabs | tabs | tabs & layout |
| 1862 | Schedule `detachIdleSessions` (250 ms) | sessions, tabs, liveAgentsEnabled, detachTimer | detachTimer | sessions/turns |
| 1870 | Clear the detach timer on unmount | detachTimer | — | sessions/turns |
| 1929 | Record and prune tab visit history | activeTabId, tabs, tabVisitRef, tabVisitFromHistoryRef | tabVisitRef, tabVisitFromHistoryRef, tabVisitNav | tabs & layout |
| 6136 | Dispatch queued-message heads when a session is idle | sessions, sessionsRef, queueDispatchingRef | sessions (queueStatus), queueDispatchingRef; calls onSubmit | sessions/turns |
| 6323 | Auto-resume at usage-limit reset and schedule a recheck | sessions, usageLimitTick, usageResumingRef | usageResumingRef, usageLimitTick; calls onUsageLimitResume | providers/harnesses |
| 6369 | Fetch provider rate limits to fill `usageLimit.resetsAt` | sessions, usageResetLookups | sessions, usageResetLookups | providers/harnesses |
| 7100 | Auto-continue interrupted sessions | autoContinueKey (derived from sessions at 7093), sessionsRef | calls onSubmit | sessions/turns |
| 7241 | Escape stops the focused busy turn (deferred) | activeTabIdRef, tabsRef, sessionsRef, projectTerminalFocusedRef | calls onStop | sessions/turns |
| 7585 | `bonocode:open-mcp-settings` listener | — | calls openSettings | settings/appearance |
| 7642 | Unfocus the terminal when the dock is hidden | dockVisible | projectTerminalFocused | terminal |
| 7662 | `set_traffic_lights_visible` | — | — | settings/appearance |
| 7810 | Mac: push autosave and keybinding overrides to native | — | — | settings/appearance |
| 7820 | Global keydown (capture): zoom, tab commands, app shortcuts | actions, searchViewOpenRef, settingsOpenRef, filePickerOpenRef, whatsNewVersionRef | via actions | other (shortcuts) |
| 8007 | Tauri menu event listeners (35 `listen` calls) | actions, sessionsRef | via actions | other (menu) |
| 8135 (layout) | Apply the dock grid style | currentProjectDock, dockVisible, dockDragSize | DOM | terminal |

---

## D. Handlers table (functions over 15 lines)

⚑ marks the items the task asked to flag.

### Inside `Workspace`

| Name | Lines | Len | Domain | State touched | Calls |
|---|---|---|---|---|---|
| ⚑ flushHarnessEvents (**harness event queue**) | 1068–1083 | 16 | sessions/turns | harnessFlush, harnessQueued, ⚑sessionsRef, sessions | `applyHarnessEvents`, `syncDockBadge` |
| ⚑ stopSessionForRemoval (stop flow) | 1085–1103 | 19 | sessions/turns | ⚑turnGen, sessionsRef | flushHarnessEvents, `cancelHarnessTurn` |
| ⚑ applyApprovalEvent (queue bypass) | 1105–1122 | 18 | sessions/turns | harnessQueued, sessionsRef, sessions | `applyHarnessEvents`, `syncDockBadge` |
| ⚑ enqueueHarnessEvent (**harness event queue**) | 1124–1160 | 37 | sessions/turns | harnessQueued, harnessFlush, tabsRef, activeTabIdRef, foregroundSurfaceRef | applyApprovalEvent, flushHarnessEvents, `scheduleHarnessFlush` |
| refreshHistory | 1609–1632 | 24 | sessions/turns | history, loadedProjects, historyErrorCwd, sidebarCwdRef, loadedProjectsRef | — |
| persistSession | 1642–1663 | 22 | sessions/turns | removingSessionIds, switchingWorktrees, lastPersisted, history, sidebarCwdRef | `upsertSession` |
| detachIdleSessions | 1822–1860 | 39 | sessions/turns | sessionsRef, tabsRef, openingSessionIds, loadedSessionCache, unseenFinishedRef, skipForgetSessionIds, sessions | persistSession, `forgetHarnessSession` |
| activateTab | 1877–1916 | 40 | tabs & layout | tabsRef, sessionsRef, projectCwdRef, activeTabId, tabs, projectCwd, recents, composerFocused | — |
| onSelectProviderAccount | 1967–2003 | 37 | providers/harnesses | active, sessions, activeTabId, composerFocused | appendTab |
| onNew | 2017–2033 | 17 | sessions + tabs | searchViewOpen, sessions, activeTabId, composerFocused | appendTab |
| setLinkedWorkItemUpdateCard | 2035–2055 | 21 | github linked items | sessionsRef, sessions | — |
| onSplit | 2074–2095 | 22 | tabs & layout | sessions, tabs, composerFocused | — |
| openProjectTerminal | 2102–2132 | 31 | terminal | projectCwdRef, lastDockSideRef, projectTerminals | focusProjectTerminal |
| onOpenTerminal | 2134–2177 | 44 | terminal | projectCwdRef, sessionsRef, lastPersisted, sessions, tabs, activeTabId, composerFocused | openProjectTerminal, appendTab |
| onToggleProjectTerminal | 2214–2229 | 16 | terminal | projectTerminalsRef, projectTerminals, projectTerminalFocused | openProjectTerminal, focusProjectTerminal |
| onCloseProjectTerminal | 2283–2298 | 16 | terminal | projectTerminalsRef, projectCwdRef, projectTerminals | — |
| onCloseOtherProjectTerminals | 2300–2326 | 27 | terminal | projectTerminalsRef, projectCwdRef, projectTerminals | — |
| onToggleRunningTerminal | 2338–2395 | 58 | terminal | projectTerminalsRef, tabsRef, activeTabIdRef, projectTerminals, tabs, activeTabId, composerFocused, projectTerminalFocused | focusProjectTerminal |
| onCloseTab | 2401–2464 | 64 | tabs & layout | tabsRef, sessionsRef, dirtyFilesRef, dirtyFiles, tabs | persistSession, activateTab, refreshHistory |
| onCloseTabs | 2466–2529 | 64 | tabs & layout | tabsRef, sessionsRef, dirtyFilesRef, dirtyFiles, tabs | persistSession, activateTab, refreshHistory |
| onCloseFile | 2541–2669 | 129 | files | tabsRef, sessionsRef, dirtyFilesRef, tabs, sessions, dirtyFiles, composerFocused | onCloseTab |
| onCloseOtherFiles | 2671–2729 | 59 | files | tabsRef, dirtyFilesRef, tabs, dirtyFiles | — |
| onClearTabSession | 2731–2797 | 67 | tabs & layout | tabs, sessionsRef, dirtyFilesRef, sessions, dirtyFiles, composerFocused | persistSession, refreshHistory |
| onCloseAllTabs | 2799–2930 | 132 | tabs & layout | tabsRef, activeTabIdRef, sessionsRef, dirtyFilesRef, sessions, tabs, dirtyFiles, composerFocused | onCloseTab, onCloseTabs, onClearTabSession |
| onClosePane | 2932–2989 | 58 | tabs & layout | activeTab, sessionsRef, tabsRef, tabs, composerFocused | onCloseFile, onCloseTab, onClearTabSession, persistSession, refreshHistory |
| onFocusPane | 3072–3087 | 16 | tabs & layout | projectTerminalFocused, tabs, composerFocused | — |
| onOpenDiff | 3089–3141 | 53 | source-control/git | gitCwdRef, sessionsRef, sidebarCwdRef, tabs, composerFocused | setSidebarTab |
| onOpenAllChanges | 3150–3165 | 16 | source-control/git | gitCwdRef, sidebarCwdRef, tabs, composerFocused | — |
| onOpenCommit | 3167–3189 | 23 | source-control/git | gitCwdRef, sidebarCwdRef, tabs, composerFocused | — |
| onReorderTabs | 3199–3217 | 19 | tabs & layout | tabs | projectOfTab |
| onReorderFiles | 3219–3235 | 17 | files | tabs | — |
| onMovePane | 3237–3252 | 16 | tabs & layout | tabs | — |
| onDetachPane | 3254–3270 | 17 | tabs & layout | tabsRef, tabs, projectTerminalFocused | activateTab |
| focusOpenSession | 3272–3288 | 17 | sessions + tabs | tabsRef, sessionsRef, loadedSessionCache, activeTabId, tabs, composerFocused | — |
| replaceBlankPaneWithSession | 3290–3330 | 41 | sessions + tabs | tabsRef, activeTabIdRef, sessionsRef, lastPersisted, sessions, tabs, activeTabId, composerFocused | `forgetHarnessSession` |
| loadStoredSession | 3342–3377 | 36 | sessions/turns | loadedSessionCache, sessionLoads, sessionLoadEpochs, removingSessionIds | `getSession` |
| ensureOpenSession | 3379–3421 | 43 | sessions/turns | sessionsRef, openingSessionIds, loadedSessionCache, removingSessionIds, lastPersisted, sessions | loadStoredSession, refreshHistory, `bindHarnessSession` |
| onPrefetchHistorySession | 3423–3450 | 28 | sessions/turns | removingSessionIds, sessionsRef, loadedSessionCache, sessionLoads, activeSessionPrefetch | loadStoredSession |
| revealLinkedSessionUpdate | 3452–3527 | 76 | github linked items | sessionsRef, linkedWorkItemActivityFetches, linkedSessionUpdatesRef | setLinkedWorkItemUpdateCard |
| onSelectHistorySession | 3529–3555 | 27 | sessions + tabs | linkedSessionUpdatesRef, activeTabId, composerFocused | ensureOpenSession, focusOpenSession, replaceBlankPaneWithSession, revealLinkedSessionUpdate, appendTab |
| onPlaceSessionOnPane | 3571–3627 | 57 | tabs & layout | tabsRef, sessionsRef, projectCwdRef, lastPersisted, sessions, tabs, activeTabId, projectTerminalFocused, composerFocused | ensureOpenSession |
| onPlaceTabOnPane | 3629–3664 | 36 | tabs & layout | tabsRef, sessionsRef, lastPersisted, sessions, tabs, activeTabId, projectTerminalFocused, composerFocused | — |
| onRenameHistorySession | 3666–3702 | 37 | sessions/turns | sessionsRef, sessions, loadedSessionCache, lastPersisted | invalidateLoadedSession, persistSession, refreshHistory |
| onRemoveWorktree | 3721–3848 | 128 | source-control/git | removingWorktreePaths, switchingWorktrees, removingSessionIds, pendingPersist, lastPersisted, sessionsRef, sessions, projectCwd, recents, history | onCheckWorktreeRemoval, stopSessionForRemoval, invalidateLoadedSession, checkOpenWorktreeFiles |
| onRemoveHistorySession | 3850–4043 | 194 | sessions/turns | removingSessionIds, switchingWorktrees, deleteConfirmationPending, sessionDeleteDialog, pendingPersist, lastPersisted, loadedSessionCache, sessionsRef, tabsRef, dirtyFilesRef, sessions, tabs, dirtyFiles, history, composerFocused | invalidateLoadedSession, activateTab, refreshHistory, stopSessionForRemoval, onRemoveWorktree, `createSessionRemover` |
| onArchiveHistorySession | 4045–4069 | 25 | sessions/turns | removingSessionIds, history | onRemoveHistorySession |
| onArchiveFocusedSession | 4071–4093 | 23 | sessions/turns | activeTabIdRef, tabsRef, sessionsRef, surface refs | onArchiveHistorySession |
| onPinHistorySession | 4095–4117 | 23 | sessions/turns | sessionsRef, history | — |
| onSetHistorySessionLinkedWorkItem | 4119–4172 | 54 | github linked items | sessionsRef, history, sessions, linkedWorkItemPanels, loadedSessionCache | invalidateLoadedSession, refreshHistory |
| onCwdChange | 4276–4355 | 80 | projects/cwd | sessionsRef, projectCwd, recents, sessions, tabs, activeTabId, composerFocused | appendTab, projectOfTab |
| onBranchChange | 4357–4377 | 21 | source-control/git | sessionsRef, sessions | persistSession |
| onWorkspaceModeChange | 4379–4407 | 29 | source-control/git | sessions | — |
| onWorktreeBaseChange | 4409–4425 | 17 | source-control/git | sessions | — |
| onWorktreeChange | 4427–4528 | 102 | source-control/git | sessionsRef, removingSessionIds, switchingWorktrees, removingWorktreePaths, pendingPersist, sessions, activeTabId, composerFocused | appendTab, invalidateLoadedSession, refreshHistory |
| openProjects | 4536–4602 | 67 | projects/cwd | tabsRef, sessionsRef, activeTabIdRef, searchViewOpen, sessions, tabs, projectCwd, activeTabId, composerFocused, recents | readProjectReturnMemory, onCwdChange, insertBeside, activateTab |
| onPlaceSessionInFolder | 4615–4638 | 24 | sessions/turns | sessionsRef (folders live in localStorage) | — |
| onRemoveProject | 4640–4761 | 122 | projects/cwd | projectCwdRef, tabsRef, sessionsRef, activeTabIdRef, loadedSessionCache, sessionLoads, pendingPersist, ⚑turnGen, lastPersisted, recents, sidebarTabSelection, sessions, tabs, activeTabId, dirtyFiles, projectTerminals, projectCwd, composerFocused | invalidateLoadedSession, persistSession, onSelectProject, `cancelHarnessTurn` |
| onFileMoved | 4771–4788 | 18 | files | tabs | — |
| applyProjectLocationChange | 4790–4846 | 57 | projects/cwd | sessionsRef, loadedSessionCache, pendingPersist, projectCwdRef, projectTerminalsRef, sessions, history, loadedProjects, projectCwd, projectTerminals, sidebarTabSelection, recents | onFileMoved, `rebaseCiRepairs` |
| onFileDeleted | 4848–4874 | 27 | files | tabsRef, tabs, dirtyFiles | — |
| onOpenFile | 4876–4955 | 80 | files | gitCwdRef, sidebarCwdRef, tabsRef, activeTabIdRef, sessionsRef, tabs, activeTabId, projectTerminalFocused, composerFocused, editorNavigation | activateTab, insertBesideActive |
| onOpenPlan | 4957–4982 | 26 | files | tabsRef, sessionsRef, tabs, composerFocused | — |
| onSelectFileSurface | 5020–5035 | 16 | files | tabs, composerFocused | — |
| onModelChange | 5037–5087 | 51 | providers/harnesses | sessionsRef, sessions | `forgetHarnessSession` |
| onSaveDraft | 5108–5153 | 46 | sessions/turns | sessionsRef, sessions | — |
| onRemoveDraft | 5155–5185 | 31 | sessions/turns | sessionsRef, pendingPersist, lastPersisted, lastPersistedUserBlock, history, sessions | invalidateLoadedSession |
| ⚑ **submitSession** | 5187–6056 | **870** | sessions/turns | editedResends, removingSessionIds, switchingWorktrees, removingWorktreePaths, ⚑sessionsRef, sessions, ⚑turnGen (5457–5458; checked at 5725, 5753, 5757, 5807, 5840, 5870, 5881, 5932, 5948, 5963, 6024, 6043), projectLocationSyncs, submitAfterProjectSyncRef, activeSessionIdRef | enqueueHarnessEvent, flushHarnessEvents, dismissNoticesForContinuedSession, applyProjectLocationChange, `submitAfterProjectSync`, `sendHarnessTurn`, `steerHarnessTurn`, `rewindHarnessLastTurn`, `requestOutgoingHandoff`, `stopHarnessSession`, `cancelHarnessTurn`, `forgetHarnessSession`, `createWorktree`, `flushSync` (5595, 5816, 5830) |
| ↳ commitSubmittedTurn (closure) | 5495–5593 | 99 | sessions/turns | sessions | `appendUser`, `appendPreparingHandoff`, `stopStreaming` |
| ↳ launchTitleGeneration (closure) | 5598–5641 | 44 | sessions/turns | sessions | `generateHarnessTitle`, `resolveLinkedWorkItem` |
| ↳ ⚑ **routeTurnEvent** (closure) | 5806–5813 | 8 | sessions/turns | turnGen | applyTurnEvent (5787–5805), which calls routePlanEvent, nudgeOpenEditors, trackSessionEdits, enqueueHarnessEvent |
| ↳ acceptEditedResend / recoverEditedResend | 5814–5837 | 24 | sessions/turns | sessionsRef, sessions | `flushSync` |
| ⚑ handoff flow inside submitSession | 5487–5492, 5568–5583, 5726–5768, 5921–5944 | — | sessions/turns | sessions, turnGen | `requestOutgoingHandoff`, `chooseHandoffBrief`, `completeHandoff`, `consumeHandoff`, `wrapHandoffPrompt` |
| onUpdatePlan | 6071–6105 | 35 | sessions/turns | sessions | — |
| onBuildPlan | 6107–6134 | 28 | sessions/turns | sessionsRef | onSubmit |
| onEditQueuedMessage | 6219–6236 | 18 | sessions/turns | sessions | — |
| onSteerQueuedMessage | 6238–6255 | 18 | sessions/turns | sessionsRef | onSubmit |
| onResumeQueue | 6257–6282 | 26 | sessions/turns | sessionsRef, sessions | onSubmit |
| openSessionBeside | 6396–6434 | 39 | sessions + tabs | sessionsRef, tabsRef, activeTabIdRef, sessions, tabs, activeTabId, projectTerminalFocused, composerFocused | appendTab |
| onSecondOpinion | 6436–6465 | 30 | sessions/turns | sessionsRef | openSessionBeside, onSubmit |
| updateBtwThread | 6466–6505 | 40 | sessions/turns | sessionsRef, sessions | persistSession |
| removeBtwThread | 6507–6541 | 35 | sessions/turns | sessionsRef, sessions | persistSession |
| runBtwRequest | 6543–6756 | 214 | sessions/turns | btwRequestsRef | updateBtwThread, `runHarnessTextPrompt`, `applyBtwHarnessEvent` |
| onBtwSubmit | 6758–6863 | 106 | sessions/turns | sessionsRef | updateBtwThread, runBtwRequest |
| onBtwModelChange | 6865–6911 | 47 | sessions/turns | sessionsRef | updateBtwThread |
| onBtwDelete | 6913–6945 | 33 | sessions/turns | sessionsRef, btwRequestsRef | removeBtwThread |
| ⚑ onBtwStop (stop flow) | 6949–6999 | 51 | sessions/turns | btwRequestsRef | updateBtwThread |
| onBtwRetry | 7001–7053 | 53 | sessions/turns | sessionsRef | updateBtwThread, runBtwRequest |
| ⚑ onHandoff (handoff flow) | 7055–7091 | 37 | sessions/turns | sessionsRef | openSessionBeside, `buildHandoffComposerCard`, `buildDeterministicHandoff` |
| onCompactContext | 7121–7203 | 83 | sessions/turns | ⚑turnGen, ⚑sessionsRef, sessions | enqueueHarnessEvent, flushHarnessEvents, ⚑`applyHarnessEvent` (7130, 7147), `compactHarnessContext`, `syncDockBadge` |
| ⚑ onStop (stop + handoff completion) | 7205–7239 | 35 | sessions/turns | ⚑turnGen, sessionsRef, sessions | flushHarnessEvents, `cancelHarnessTurn`, `completeHandoff` |
| onOpenLinkedWorkItem | 7452–7479 | 28 | github linked items | linkedWorkItemPanelRequest, sessionsRef, history, filePickerOpen, settingsOpen, searchViewOpen, linkedWorkItemPanels | onSelectHistorySession |
| ⚑ **startCiRepair** | 7492–7545 | 54 | source-control/git | sessionsRef, sessions, searchViewOpen, sidebarTab | ensureOpenSession, onSubmit, onSelectHistorySession, setSidebarTab, `trackCiRepair` |
| openSettings | 7562–7582 | 21 | settings/appearance | settingsOpenRef, searchViewOpenRef, settingsReturnViewRef, filePickerOpen, searchViewOpen, settingsSection, settingsAnchor, notificationProjectPath, settingsOpen | — |
| onRailBack | 7619–7634 | 16 | settings/appearance | settingsOpen, searchViewOpen | onCloseSettings, onVisitBack |
| onNavigateSessionList | 7672–7727 | 56 | sessions + tabs | tabsRef, activeTabIdRef, sessionsRef, sessionNavigationIdsRef, linkedSessionUpdatesRef, tabs, composerFocused | onPrefetchHistorySession, onSelectHistorySession, ensureOpenSession, revealLinkedSessionUpdate |

### Module-level (pure, outside `Workspace`)

| Name | Lines | Len | Domain |
|---|---|---|---|
| withPlanStatus | 603–619 | 17 | sessions/turns |
| withHarnessChoice | 643–668 | 26 | providers/harnesses |
| withPlanBuildTarget | 670–703 | 34 | providers/harnesses |
| titleTabsEqual | 725–750 | 26 | tabs & layout |
| toTitleTab | 8688–8809 | 122 | tabs & layout |
| dropOpenFiles | 8811–8842 | 32 | files |
| trackSessionEdits | 8844–8866 | 23 | sessions/turns (checkpoints) |
| nudgeOpenEditors | 8873–8910 | 38 | files |

`applyHarnessEvent` and `applyHarnessEvents` are not defined in App.tsx. They are imported from `src/integrations/harness/core/apply.ts:54,26` and are already pure (`applyBatch.test.ts:57-58` checks batch = reduce). App calls them at 1077, 1113, 7130 and 7147.

---

## E. Render

- **Returned JSX:** 8236–8637. The `workspaceTitleBar` element is built at 8205–8234 and placed at 8243 or 8379.
- **Top 10 children by props passed:**

| # | Component | Line | Props |
|---|---|---|---|
| 1 | `Sidebar` | 8245 | 73 |
| 2 | `PaneTree` (one per tab) | 8435 | 71 (24 explicit + the 47-key `sessionPaneProps` spread from 8151) |
| 3 | `TitleBar` | 8206 | 26 |
| 4 | `SettingsView` (lazy) | 8528 | 22 |
| 5 | `MenuBar` (non-mac) | 8349 | 16 |
| 6 | `ProjectTerminalDock` (one per dock) | 8401 | 13 |
| 7 | `SearchView` (lazy) | 8507 | 13 |
| 8 | `UsageFooter` | 8556 | 11 |
| 9 | `LinkedWorkItemPanel` (lazy, one per panel) | 8486 | 8 |
| 10 | `FilePicker` | 8585 | 8 |

These are smaller: `ApprovalToasts` 4, `DeleteSessionDialog` 3, `ProviderSignInDialog` 3, `HarnessUpdateNotice` 2, `WhatsNewDialog` 2 and `TranscriptPoolOutlet` 1.

---

## F. Lines per domain (approximate, ±10%)

Each handler or effect is counted once, under its primary domain.

| Domain | ~Lines | Biggest contributors |
|---|---|---|
| sessions/turns | **~3,500** | submitSession 870, btw 590, remove/archive/pin 350, load/open/prefetch 180, persistence and detach 220, queue/plan 210, compact/stop 120, harness queue 90 |
| tabs & layout | **~1,020** | close flows 420, toTitleTab 122, nav/visit/activate 140, place/move/detach 150 |
| source-control/git | ~540 | worktree switch/remove 320, diff/commit openers 110, CI repair 70 |
| files | ~530 | onCloseFile/onCloseOtherFiles 190, onOpenFile 80, editor nudges/dropOpenFiles 75 |
| projects/cwd | ~410 | onRemoveProject 122, onCwdChange 80, openProjects 67, applyProjectLocationChange 57 |
| providers/harnesses | ~390 | usage limits 110, model change 70, harness-choice helpers 60, sign-in 70 |
| other (shortcuts/menu) | ~380 | keydown handler 186, menu listeners 108, actions mirror 58 |
| terminal | ~370 | dock handlers 300, dock sizing 30 |
| github linked items | ~250 | revealLinkedSessionUpdate 76, linked-item setters 54, panels 50 |
| settings/appearance | ~185 | openSettings and rail nav 80, sidebar tab 24, toggles 23 |
| notifications | ~45 | badge, unseen-finished, permissions |
| *(not a domain)* imports | 550 | |
| *(not a domain)* JSX + `sessionPaneProps` | ~485 | |

---

## G. Couplings

### Writers that set state in two or more domains

Sessions **and** tabs/layout:

| Block | Lines | Domains written |
|---|---|---|
| effect (add-to-chat) | 1253–1282 | sessions, tabs, activeTabId, terminal focus, composer focus |
| onSelectProviderAccount | 1967–2003 | sessions, tabs (via appendTab), activeTabId |
| onNew | 2017–2033 | sessions, tabs, activeTabId, search surface |
| onSplit | 2074–2095 | sessions, tabs |
| onOpenTerminal | 2134–2177 | sessions (drops blank), tabs, activeTabId |
| onCloseFile | 2541–2669 | sessions (seeds one), tabs, dirtyFiles |
| onClearTabSession | 2731–2797 | sessions, tabs, dirtyFiles |
| onCloseAllTabs | 2799–2930 | sessions, tabs, dirtyFiles |
| replaceBlankPaneWithSession | 3290–3330 | sessions, tabs, activeTabId |
| onSelectHistorySession | 3529–3555 | sessions (via ensureOpenSession), tabs, activeTabId |
| onPlaceSessionOnPane | 3571–3627 | sessions, tabs, activeTabId, terminal focus |
| onPlaceTabOnPane | 3629–3664 | sessions, tabs, activeTabId, terminal focus |
| onRemoveHistorySession | 3850–4043 (apply at 3929–3988) | sessions, tabs, dirtyFiles, history |
| onCwdChange | 4276–4355 | sessions, tabs, projectCwd, recents |
| onWorktreeChange | 4427–4528 | sessions, tabs (via appendTab), activeTabId |
| openProjects | 4536–4602 | sessions, tabs, projectCwd, recents, search surface |
| onRemoveProject | 4640–4761 | sessions, tabs, activeTabId, dirtyFiles, projectTerminals, projectCwd, recents, sidebar tab, turnGen |
| openSessionBeside | 6396–6434 | sessions, tabs, activeTabId, terminal focus |
| onNavigateSessionList | 7672–7727 | sessions (via ensureOpenSession), tabs |
| startCiRepair | 7492–7545 | sessions, sidebar tab, search surface; tabs via onSelectHistorySession |

Other multi-domain writers:

| Block | Lines | Domains written |
|---|---|---|
| applyProjectLocationChange | 4790–4846 | sessions, history, loadedProjects, projectCwd, projectTerminals, sidebar tab, recents, tabs (via onFileMoved) |
| onRemoveWorktree | 3721–3848 | sessions, history, projectCwd, recents |
| onSetHistorySessionLinkedWorkItem | 4119–4172 | sessions, history, linkedWorkItemPanels |
| effect (default_cwd) | 1788–1800 | projectCwd, recents, sessions |
| activateTab | 1877–1916 | tabs, activeTabId, projectCwd, recents |
| onOpenFile | 4876–4955 | tabs, activeTabId, terminal focus, editorNavigation |
| onToggleRunningTerminal | 2338–2395 | projectTerminals, tabs, activeTabId, focus |
| onTerminalMetaChange | 2328–2336 | projectTerminals, tabs |
| onFocusPane / onDetachPane | 3072 / 3254 | tabs, terminal focus |
| onOpenLinkedWorkItem | 7452–7479 | surfaces, linkedWorkItemPanels; sessions and tabs via onSelectHistorySession |
| effect (window focus) | 1510–1535 | sessions (flush), composer focus |

### Read couplings that matter for the session store

- `enqueueHarnessEvent` (1139–1146) reads `tabsRef`, `activeTabIdRef` and `foregroundSurfaceRef` to pick the rAF or timeout cadence. The session store needs this as an injected `isForeground(sessionId)` probe.
- `detachIdleSessions` (1826) and the persistence effect (1667) read `tabsRef` to tell visible sessions from parked ones.
- `readProjectReturnMemory` (999), the in-flight snapshot (1738) and the workspace snapshot (1757) read sessions and tabs together.
- These render-time derived values join sessions with tabs: `active` (1224), `hiddenApprovalToasts` (1500), `deckProjectTabs` (3008), `nextTitleTabs` (7327).

### The eager-ref pattern

20 handlers write `sessionsRef.current = next` and then call `setSessions(next)` (for example 1080–1082, 3415–3416, 4131–4132, 6499–6500, 7136–7138). Another 32 call only `setSessions(fn)`, so `sessionsRef` stays stale until the next render (941). This split is what a synchronous external store removes.

---

## H. Tests

- **No test imports `App.tsx` or any function from it.** `App.tsx` exports only `default App`, and its only importer is `src/main.tsx:25`. Every helper in the file (`withPlanStatus`, `toTitleTab`, `dropOpenFiles`, `trackSessionEdits`, `nudgeOpenEditors`, …) is untested as written.
  - The 19 test files that mention "App.tsx" use it only as a fixture path string, for example `layout.test.ts:422` and `fileMentions.test.ts:28`.
- **Tests covering the session/turn flow pieces App composes:**
  - `src/app/model/`: `harnessFlush.test.ts`, `submissionAcceptance.test.ts`, `appLifecycle.test.ts`, `bootWorkspace.test.ts`, `windowTransfer.test.ts`.
  - Harness reducer: `src/integrations/harness/core/apply.test.ts` and `applyBatch.test.ts`, which check that `applyHarnessEvents` equals reducing `applyHarnessEvent`.
  - `src/features/sessions/model/`: `handoff`, `editLastTurn`, `messageQueue`, `inFlight`, `plan`, `btw`, `secondOpinion`, `usageLimit`, `sessionRemoval`, `addChatToWorkspace`, `sessionTitle`, `sessionDone`, `liveAgents`, `archiveShortcut`, `sessionWorkItem`, `sessionWorkspaceLifecycle`, `promptPreparation`, `sessionSelection` (`*.test.ts`).
  - `src/features/sessions/data/`: `sessionStore*.test.ts` (5 files), `sessionCache.test.ts`, `sessionHistory.test.ts`.
  - Glue models: `workspace/model/workspaceTabGroups.test.ts`, `projects/model/projectReturn.test.ts`, `source-control/model/ciRepair*.test.ts` (3 files).
- **Untested glue that PR 1 moves:**
  - enqueue/flush ordering, including the approval bypass (1105–1134)
  - `turnGen` cancellation
  - `routeTurnEvent` gating (5806–5813)
  - edited-resend accept/recover (5814–5837)
  - the queued-message dispatch effect (6136)

  PR 1 should add a `vitest` file for the new store that covers these.

---

## I. Proposed PR order

Rules:
- One store per PR.
- The app works after each PR.
- Every step keeps its consumers in App reading through a hook (`useX()`), so JSX and props don't change until the end.
- Line estimates are lines removed from App.tsx, net of new call sites.

| # | What moves | Target | ~Lines out of App | Risk |
|---|---|---|---|---|
| **1** | **Live session store.** `sessions` + `setSessions` (796), `sessionsRef` (940), `turnGen` (1018), the harness event queue (`harnessQueued`/`harnessFlush` 1037–1038, `flushHarnessEvents`, `applyApprovalEvent`, `enqueueHarnessEvent` 1068–1160), and `syncDockBadge` on commit. Built on `useSyncExternalStore` following `paneDrop.ts`: `getSnapshot`/`subscribe`/`set(next \| fn)`/`useSessions()`, plus `bumpTurn(id)`/`isCurrentTurn(id, gen)` and `enqueue`/`flush`/`dispose`. The foreground check is injected (`setForegroundProbe`). `applyHarnessEvent(s)` stays in `integrations/harness/core/apply.ts` and stays pure; the store only calls it. App keeps `const sessions = useSessions()`, so the 13 effects keyed on `sessions` are unchanged. | `src/features/sessions/model/liveSessions.ts` (+ `liveSessions.test.ts`). Avoid `sessionStore.ts`, which is taken by `data/`. | ~150 | **High.** It touches all 52 writer blocks. `sessionsRef` reads become synchronously fresh after `setSessions(fn)` where they were render-lagged before (behavior change in detachIdleSessions, the persistence effect, onCloseFile). `flushSync` at 5595, 5816 and 5830 must still force a commit. StrictMode double-invokes functional updaters. Snapshot identity must change only on real commits, or the persistence and detach effects loop. |
| 2 | **Turn controller** (no new state; actions on the PR 1 store): submitSession, onSubmit, onStop, onCompactContext, the queue handlers and dispatch effect, auto-continue, usage-limit resume, onSecondOpinion, onHandoff. | `src/features/sessions/model/turnController.ts` | ~1,300 | **High.** It is the largest block (870-line submitSession). It depends on `applyProjectLocationChange`, `dismissNoticesForContinuedSession` and `openSessionBeside`, which still live in App and must be passed in. Ordering of `turnGen` checks against awaits must be preserved exactly. |
| 3 | **`/btw` side-question controller** (actions on the PR 1 store): `btwRequestsRef`, update/removeBtwThread, runBtwRequest, onBtw* ×5, effects 976 and 985. | `src/features/sessions/model/btwController.ts` | ~620 | **Med.** Self-contained: it touches only sessions and `btwRequestsRef`. It calls `persistSession`, which is still in App until PR 8. |
| 4 | **Terminal dock store:** `projectTerminals`, `lastDockSide`, `projectTerminalFocused`, their refs, the 14 dock handlers, dock sizing (8116–8144), effect 7642. | `src/features/terminal/model/terminalDock.ts` | ~330 | **Low/med.** onOpenTerminal, onToggleRunningTerminal and onTerminalMetaChange also write tabs; they stay in App and call the store. |
| 5 | **App surfaces store:** `searchViewOpen`, `settingsOpen`, `settingsSection`/`Anchor`, file picker ×3, `filesSearchOpen`, focus tokens, `notificationProjectPath`/`Request`, `whatsNewVersion`, `updateNotice`, rail open flags, `collapsedProjectRailMode`, their mirror refs, openSettings/onCloseSettings/onRail*. | `src/app/model/surfaces.ts` | ~220 | **Low.** Pure UI flags. Watch `foregroundSurfaceRef`, which PR 1's foreground probe reads. |
| 6 | **Linked work item store:** `linkedWorkItemPanels`, `linkedWorkItemPanelRequest`, `linkedWorkItemActivityFetches`, `linkedSessionUpdatesRef`, setLinkedWorkItemUpdateCard, revealLinkedSessionUpdate, dismissNoticesForContinuedSession, onOpenLinkedWorkItem, effect 1241. | `src/features/github/model/linkedWorkItemPanels.ts` | ~250 | **Med.** It writes session fields through the PR 1 store, and the panel pruning reads tabs. |
| 7 | **Open files store:** `dirtyFiles`, `fileErrorCounts`, `editorNavigation`/token, onFileDirtyChange, onFileErrorCountChange. | `src/features/files/model/openFiles.ts` | ~100 | **Low.** The close flows keep calling `clearDirty(ids)`. |
| 8 | **Session history and persistence store:** `history`, `loadedProjects`, `historyErrorCwd`, refreshHistory, persistSession, persistence refs (1020–1027), load cache (1028–1033), effects 1052/1634/1665/1737, ensureOpenSession/loadStoredSession/prefetch/invalidate. | `src/features/sessions/model/sessionHistory.ts` (live layer over `data/sessionStore.ts`) | ~450 | **Med.** The 650 ms debounce and fingerprint logic must stay identical. `removingSessionIds`/`switchingWorktrees` guards are shared with the worktree flows. |
| 9 | **Project store:** `projectCwd`, `recents`, `projectReturnRef`, `projectLocationSyncs`, `sidebarTabSelection`, effects 1008/1046/1788, onCwdChange, openProjects, onRemoveProject, applyProjectLocationChange. | `src/features/projects/model/projectStore.ts` | ~420 | **High.** onRemoveProject and applyProjectLocationChange write 6–8 domains. This lands after stores 1–8 exist so it can call them. |
| 10 | **Workspace tabs store:** `tabs`, `activeTabId`, `composerFocused`/token, tab visit history, `tabProjectsRef`, mirrors, activateTab, insertBeside/appendTab, close flows (2401–3006), place/move/detach, nav, effects 1802/1929/1755, toTitleTab. | `src/features/workspace/model/workspaceStore.ts` | ~1,100 | **High.** It is coupled to almost every domain (section G). Do it last, when every other side is already a store call. Compound sessions+tabs writes need one batched notify so no frame shows a tab pointing at a missing session. |
| 11 | *(Hook, not a store)* **App commands:** the `actions` mirror, `run` debounce, keydown effect 7820, menu listeners 8007, effect 7810. | `src/app/hooks/useAppCommands.ts` | ~380 | **Low.** Mechanical; it reads actions through a ref already. |

The estimated total removed is about 5,300 lines, which would leave App.tsx near 3,600 lines (imports, derived render values, JSX).

---

## PR 1 Part 1 — done

**New API** (`src/features/sessions/model/liveSessions.ts`)
- `createLiveSessionStore(initial: Session[])`: closures only, no side effects on creation.
  - `get()` and `set(next | fn)`. `set` with the same array does nothing; a new array notifies listeners.
  - `subscribe(listener)` returns an unsubscribe function.
  - `ref`: `current` getter and setter over `get`/`set`. It replaces `sessionsRef`.
  - `turnGen`: `{ current: Map<string, number> }`.
  - `flushHarnessEvents`, `applyApprovalEvent`, `enqueueHarnessEvent`: the moved bodies. The queue and flush handle are private.
  - `setForegroundProbe(fn)`: App injects the foreground check. The default returns `false`.
  - `dispose()`: cancels a pending flush. The store stays usable afterwards.
- `useLiveSessions(store)`: `useSyncExternalStore(store.subscribe, store.get)`.

**App.tsx line count:** 8,923 before, 8,858 after (net −65). `stopSessionForRemoval` (1085–1103) stays in App because it is not part of the queue.

**Behavior differences I could not avoid**
- `sessionsRef.current` is now fresh right after `setSessions(fn)`. Before, the 32 handlers that used only `setSessions(fn)` saw the value from the last render. This is the intended effect of the store.
- Updates now go through `useSyncExternalStore`, which renders synchronously. Before, they were batched like `useState` updates. Commit timing for updates made outside React event handlers may therefore change. Not verified in the running app, since dev servers were off-limits for this PR.
- `applyApprovalEvent` is not destructured in App, because nothing in App reads it and `noUnusedLocals` would fail. It is still used inside the store.
- `liveSessions.ts` imports `app/model/harnessFlush`, so a feature module depends on `app/`. Move that helper into `features/` in a later PR.

## PR 1 Part 2 — done

**New hooks** (both under `src/features/sessions/hooks/`, each takes one `XDeps` object)
- `useTurnController(deps)` in `useTurnController.ts`: 14 deps, returns 15 handlers. It holds `submitSession`, `onSubmit`, `onUpdatePlan`, `onBuildPlan`, the queued-message handlers and dispatch effect, the usage-limit handlers and effects, `onSecondOpinion`, `onHandoff`, the auto-continue effect, `onCompactContext` and `onStop`.
- `useBtwController(deps)` in `useBtwController.ts`: 4 deps, returns 5 handlers (`onBtwSubmit`, `onBtwModelChange`, `onBtwDelete`, `onBtwStop`, `onBtwRetry`). It holds `btwRequestsRef`, both btw effects, `updateBtwThread`, `removeBtwThread` and `runBtwRequest`.

**Ref bridges:** none. Nothing crosses a cycle.

**Choices beyond the brief**
- Module-level helpers used only by the turn code moved verbatim into `useTurnController.ts`: the `SubmitOptions` and `Submit` types, `withPlanStatus`, `lastAssistantTextInTurn`, `userTurnCards`, `trackSessionEdits`, `nudgeWorkspace`, `nudgeOpenEditors`.
- `withPlanBuildTarget` stays in App because it calls `withHarnessChoice`, which `onModelChange` also uses. It is passed in as a dep.
- `openSessionBeside` stays in App and moved up, unchanged, to just above the turn hook call. Only the turn hook uses it, so it can move in later.
- `useBtwController` is called after `persistSession`, not at the position of `btwRequestsRef`. Its deps (`persistSession`, which needs `sidebarCwdRef`) are declared lower in Workspace, so calling it earlier would have meant moving a chain of declarations. The btw effects therefore run after the effects that used to sit between them. Nothing reads what they write, so the order change should be inert.

**App.tsx line count:** 8,858 before, 6,620 after (`wc -l`, net −2,238).

**Move proof:** each of the 24 moved blocks (including `openSessionBeside`) was compared to `git show HEAD:src/app/App.tsx` with leading whitespace ignored. All match exactly. The bodies were copied by script without re-indenting, so they are byte-identical to HEAD.

## PR 2 Part 1 — done

**New hooks** (each takes one `XDeps` object and returns only what App or other hooks use)
- `useOpenFiles(deps)` in `src/features/files/hooks/useOpenFiles.ts`: 2 deps, 9 returns. Holds `editorNavigation`, `editorNavigationToken`, `dirtyFiles` with its ref mirror, `fileErrorCounts`, `onFileDirtyChange` and `onFileErrorCountChange`. The close flows and `onOpenFile` stay in App and use the returned setters.
- `useLinkedWorkItemPanels(deps)` in `src/features/github/hooks/useLinkedWorkItemPanels.ts`: 9 deps, 8 returns. Holds the panel state, request ref, activity fetch map, `linkedSessionUpdatesRef`, the drop-panels effect, `setLinkedWorkItemUpdateCard`, `revealLinkedSessionUpdate`, `dismissNoticesForContinuedSession` and `onOpenLinkedWorkItem`. `useLinkedWorkItemActivity` stays in App.
- `useSessionHistory(deps)` in `src/features/sessions/hooks/useSessionHistory.ts`: 13 deps, 16 returns. Holds the history and load-cache state and refs, `refreshHistory`, `persistSession`, `invalidateLoadedSession`, `loadStoredSession`, `ensureOpenSession`, `onPrefetchHistorySession`, the imported-session seed effect, the `refreshHistory(sidebarCwd)` effect, the 650 ms persistence effect and the in-flight effect. It also exports `openSessionIds` and `lastUserBlockId`, which App still uses. Both were moved verbatim from App's module scope.
- `LinkedWorkItemPanelState` (type) moved verbatim into `useLinkedWorkItemPanels.ts`.

**Ref bridges:** one.
- `onSelectHistorySessionRef` in App. `onOpenLinkedWorkItem` (in the hook) calls `onSelectHistorySession`. That function is declared later in App and reads the hook's `linkedSessionUpdatesRef` and `revealLinkedSessionUpdate`, which is a cycle. App fills the ref right after the declaration, and the hook gets the stable forwarder `bridgedSelectHistorySession`. The moved `onOpenLinkedWorkItem` still lists `onSelectHistorySession` in its deps, but that value is now stable and calls the latest function through the ref.

**Placement changes outside the brief**
- `useLinkedWorkItemPanels` is called after `useSessionHistory`, not at its first block, because `onOpenLinkedWorkItem` reads `history`.
- Declarations moved up verbatim, above the first hook call, because the hooks need them and they need nothing from a hook: `onPinFile`, `sessionsRef`, `tabsRef`, `removingSessionIds`, `activeTab`, `active`, `activeFile`, `sidebarCwd` and `sidebarCwdRef`. `activeTab` and `active` also come along because `sidebarCwd` depends on them.
- The `activeLinkedWorkItemPanel` statement stays where it was. It is after the new `useLinkedWorkItemPanels` call, so it did not need to move.
- App imports that only moved code used were removed. Two were rewritten to drop names only the hooks use.

**App.tsx line count:** 6,620 before, 6,149 after (`wc -l`, net −471). The three hooks are 69, 238 and 418 lines.

**Move proof:** 26 moved blocks in the hooks and 6 moved-up blocks in App. Every block matches `git show HEAD:src/app/App.tsx` exactly, including blank lines, once leading whitespace is ignored. The hook bodies were copied by script without re-indenting.

**Effect order changes**
- Moved earlier, and now run before every App-level effect: the seed effect, `refreshHistory(sidebarCwd)`, the persistence effect and the in-flight effect. Before, they ran after readProjectReturn, recents, bind-resumed, probe-harness, add-to-chat, warm-skills, catalog, sign-in ×2, notification probe, dock badge, window focus, visibility, layout flush, close-requested and prefetch. They also moved ahead of the effects of `useBtwController` and `useInputNotifications`. Safe: none of those earlier effects read or write the history refs (checked by scanning their bodies). The persistence and in-flight effects still see the same `sessions` and `tabs` from their commit. The persistence cleanup, which only clears the 650 ms timer and does not flush, now runs before the close-requested cleanup. Nothing depends on that order.
- The drop-panels effect now runs before every App effect, not after probe-harness and bind-resumed. It writes only `linkedWorkItemPanels` and reads only `tabs`, so it is safe.
- The `useBtwController` and `useInputNotifications` effects now run after the three history effects. Previously they ran before them. Neither touches history or persistence state, so it is safe.
- Unchanged: `useTurnController` and `useLinkedWorkItemActivity` effects, and all App effects that were already after the history effects.

**Tests:** `tsc --noEmit` is clean. The six listed suites pass when run one at a time: `liveSessions` 10/10, `sessionHistory` 21/21, `sessionCache` 4/4, `sessionWorkItem` 5/5, `sessionRemoval` 13/13, `bootWorkspace` 2/2.

**Not done:** `App.tsx` was not run through prettier. It already had about 887 lines of prettier drift at HEAD. The new hook files were formatted with prettier, and their moved bodies were already prettier-clean.

## PR 2 Part 2 — done

**New hooks**
- `useTerminalDock(deps)` in `src/features/terminal/hooks/useTerminalDock.ts`: 7 deps, 22 returns. Holds the dock state and refs, `currentProjectDock` and `dockVisible`, the 11 project-terminal dock handlers, the unfocus effect, and dock sizing (`dockGridRef`, `paintDockSize`, `commitDockSize`, the layout effect). `onProjectTerminalSize` stays internal, since only `commitDockSize` uses it.
- `useAppSurfaces(deps)` in `src/app/hooks/useAppSurfaces.ts`: 4 deps, 44 returns. Holds the surface state and setters, the mirror refs (`searchViewOpenRef`, `settingsOpenRef`, `filePickerOpenRef`, `whatsNewVersionRef`, `foregroundSurfaceRef`), `onOpenWhatsNew`, the toggle, search, file-picker and settings handlers, and the `bonocode:open-mcp-settings` listener.
- `useAppCommands(deps)` in `src/app/hooks/useAppCommands.ts`: 32 deps, 1 return (`actions`). Holds the `actions` mirror, the `run` debounce, the autosave/keybinding push effect, the global keydown effect and the Tauri menu listeners. It is called after every handler, just before the `return`. `actions` is returned because the file picker's `onRunAction` reads it in JSX.

**Placement**
- `useTerminalDock` is called where its first block was (`projectTerminals`).
- `useAppSurfaces` is called where its first block was (`projectRailOpen`).
- `setForegroundProbe` stays below the surface call. `foregroundSurfaceRef` is now returned by `useAppSurfaces`.
- These declarations moved up, verbatim, because the two hooks need them and they need no hook output: `activeTabId`, `composerFocused`, `activeTab`, `active`, `activeFile`, `sidebarCwd`, `sidebarCwdRef`, `projectCwdRef`, `gitCwd`, and the `sidebarTabSelection`/`sidebarTab`/`setSidebarTab` group.

**Ref bridges**
- `onOpenTerminalRef` → `bridgedOpenTerminal` (dock). A real cycle: `onShowProjectTerminal` calls `onOpenTerminal`, which calls `openProjectTerminal` from the dock. App fills the ref right after `onOpenTerminal`.
- `onVisitBackRef` / `onVisitForwardRef` → `bridgedOnVisitBack` / `bridgedOnVisitForward` (surfaces). Not a cycle: `onVisitBack` → `activateTab` and `commitTabVisit` never read surface state. Bridged because moving them up would drag `activateTab`, `commitTabVisit` and `tabVisitRef` with them. This departs from the brief's "move up only if nothing from the hook is needed" rule. App fills the refs right after the two handlers.

**Effect order changes** (all listed; none changes an App effect's relative order)
- The dock unfocus effect (was after `onRailForward`) now runs first among App's passive effects, right after the dock hook call. Safe: it only sets `projectTerminalFocused` to false when the dock is hidden. The window-focus effect reads only refs, and no effect sets the flag to true.
- The mcp-settings listener (was after `openSettings`) now runs second, before the other App effects. Safe: it only adds a window listener.
- The dock layout effect (`useLayoutEffect`, was last) now runs first among layout effects, before the `flushHarnessEvents` layout effect. Safe: it writes only `dockGridRef`'s style, which no other layout effect touches.
- The keydown, menu and autosave effects keep their order. They are still the last App effects, since the hook call sits just before the `return`.
- The App-level `useState` call order changed (`activeTabId` and `composerFocused` now come before the dock state). It is deterministic, so no behavior changes.

**Proof:** 49 moved blocks, each compared with `git show HEAD:src/app/App.tsx` ignoring leading whitespace. All 49 match exactly. The 10 blocks moved up appear once in App, and no moved block remains in App.

**Sizes:** `wc -l src/app/App.tsx` = 5,490 (was 6,149; net −659). Hook files: `useTerminalDock.ts` 292, `useAppSurfaces.ts` 273, `useAppCommands.ts` 488.

**Verification:** `npx tsc --noEmit` is clean (run after all three hooks were written, not after each). Single-file vitest runs, one at a time, all pass: `liveSessions` 10/10, `layout` 48/48, `appLifecycle` 19/19, and the five files in `src/features/terminal/model/` (terminalChrome 2, terminalClose 3, terminalKeys 4, terminalLayout 2, terminalTab 8).

**Not done:** no prettier run on App.tsx or the new hook files, so moved code stays byte-for-byte. Imports were pruned to what each file now uses, and `import type` was kept. Nothing was built, run or committed.


## PR 3 Part 1 — done

**New hooks**
- `useProjectState({ windowTransfer, resumed })` in `src/features/projects/hooks/useProjectState.ts`: 2 deps, 6 returns. Holds `projectCwd`, `recents`, `projectCwdRef` and `projectReturnRef`.
- `useWorkspaceTabState({ windowTransfer, resumed, seed })` in `src/features/workspace/hooks/useWorkspaceTabState.ts`: 3 deps, 16 returns. Holds `tabs`, `activeTabId`, `composerFocused` and its token, `tabProjectsRef`, `tabsRef`, `activeTabIdRef`, the tab visit refs and state, and `workspaceSyncKey`.
- `useProjectActions(deps)` in `src/features/projects/hooks/useProjectActions.ts`: 37 deps, 9 returns (`readProjectReturnMemory`, `sidebarTab`, `setSidebarTab`, `onCwdChange`, `onSelectProject`, `pickProject`, `onRemoveProject`, `onRestoreProject`, `applyProjectLocationChange`). Holds the project-return reconcile, recents and `default_cwd` effects.
- `useWorkspaceTabActions(deps)` in `src/features/workspace/hooks/useWorkspaceTabActions.ts`: 36 deps, 32 returns. Holds `projectOfTab`, activate, insert, append, split, the close flows, navigation, pane and file handlers, `deckProjectTabs`, `onPinFile`, `onOpenFile`, `onOpenPlan`, and the three effects (isolate terminal panes, tab visit pruning, 250 ms snapshot save).

**Ref bridges**
- `onPinFileRef` → `bridgedOnPinFile`. `useOpenFiles` (called earlier) takes `onPinFile`, which is declared in `useWorkspaceTabActions`. App fills the ref after the call.
- `setSidebarTabRef` → `bridgedSetSidebarTab`. `useAppSurfaces` (called earlier) takes `setSidebarTab`, which is declared in `useProjectActions`. Cycle: project actions read surface setters. App fills the ref after the call.

**App statements moved, not hook code**
- `turnGen` alias (`liveSessions.turnGen`) hoisted above the project actions call.
- `sessionDefaults`, `gitCwdRef` and its mirror hoisted above the workspace actions call.
- `workspaceSyncKey` ref moved into `useWorkspaceTabState` (ref declaration, not handler).

**Kept in App (deviations from the brief)**
- `sidebarTabSelection` state. Its lazy initializer reads `sidebarCwd`, which depends on `projectCwd` and `tabs`, so it cannot sit in the project state hook. Its setter is passed into `useProjectActions`.
- Title tabs (`nextTitleTabs`, `titleTabs`, the `tabProjectsRef` render mirror, `titleTabsRef`, module `toTitleTab`). They read `unseenFinishedIds`, which is declared far below the actions call.
- `pickProject` moved with the project actions. It was not in the brief but belongs to the project domain.

**Effect order changes**
- Isolate-terminal, tab-visit prune and snapshot-save effects now run right after the linked-panels effects, before the project and provider effects. Safe: they write only `tabs`, the visit state and a timer, and no earlier effect writes `tabs` on mount.
- Project reconcile, recents and `default_cwd` effects now run before App's bind/reap, probe and catalog effects. Safe: reconcile and recents write refs only, and `default_cwd` is an async read that sets state.

**Proof:** 4 hook files, 68 moved statements (including module decls). Each one is found in `git show HEAD:src/app/App.tsx` after whitespace normalization. Zero misses.

**Tests (one at a time):** liveSessions 10/10, layout 48/48, workspaceTabGroups 37/37, projectReturn 20/20, bootWorkspace 2/2. `tsc --noEmit` clean.

## PR 3 Part 2 — done

**New hooks**
- `useProviderControls(deps)` in `src/features/providers/hooks/useProviderControls.ts`: 7 deps, 10 returns. One hook, not split: nothing before it reads its state. Holds `providerSignInRequest`, `seenProviderSignInRequestsRef`, `harnessUpdateHeight`, `activeProviderSignInRequest`, `usageProviders`, `usageSession`, the four handlers, and the probe, catalog and two sign-in effects. Module helpers moved with it: `withHarnessChoice`, `withPlanBuildTarget` (still passed to `useTurnController`), `providerSignInRequestKey`, `sameSettings`.
- `useWorktreeState()` in `src/features/source-control/hooks/useWorktreeState.ts`: 0 deps, 2 returns (`switchingWorktrees`, `removingWorktreePaths`). Called at their original position because `useSessionHistory` and the turn controller read them.
- `useWorktreeActions(deps)` in `src/features/source-control/hooks/useWorktreeActions.ts`: 27 deps, 10 returns (`repairSessions`, `onCheckWorktreeRemoval`, `onRemoveWorktree`, `onWorktreeChange`, `onBranchChange`, `onWorkspaceModeChange`, `onWorktreeBaseChange`, `onOpenDiff`, `onOpenAllChanges`, `onOpenCommit`). Module helper `filesInWorkspaceTabs` moved with it.
- `useSessionLifecycleState({ liveAgentsEnabled })` in `src/features/sessions/hooks/useSessionLifecycleState.ts`: 1 dep, 8 returns. Holds `sessionDeleteDialog`, `deleteConfirmationPending`, `removingSessionIds`, `skipForgetSessionIds`, `sessionNavigationIdsRef`, `detachInputs` (with its mirror line), `detachTimer`.
- `useSessionLifecycle(deps)` in `src/features/sessions/hooks/useSessionLifecycle.ts`: 53 deps, 17 returns. Holds the detach handler and its two effects, the 18 session handlers listed in the brief, and the add-to-chat effect. Module constant `SESSION_DETACH_DELAY_MS` moved with it.

**Ref bridges:** none new. The existing `onSelectHistorySessionRef` bridge is now filled after the lifecycle call, not after the `onSelectHistorySession` declaration.

**App statements moved**
- `liveAgentsEnabled` hoisted above `useSessionLifecycleState`, verbatim. Not in the brief; needed for the `detachInputs` initializer.
- `onOpenWorkingTreeDiff` moved below the worktree actions call. Its deps array reads `onOpenDiff` directly.
- `onSelectHistorySessionRef.current = onSelectHistorySession` moved below the lifecycle call.

**Kept in App (deviations)**
- `stopSessionForRemoval`. The worktree hook needs it and is called before the lifecycle hook, so it cannot move into the lifecycle hook.
- `startCiRepair`. It needs `onSubmit` from the turn controller, which is called after the worktree hook. It stays in App below the turn call.
- The Escape-to-stop effect. It needs `onStop` from the turn controller, so it stays below the turn call.
- `gitCwd` and `gitCwdRef`. The terminal dock, which is called earlier, reads them.
- `onCloseOtherTabs`, `onCloseTitleTab`, `onShowSourceControl`, `onToggleChanges`, `onNewTerminal*`. Not in the brief, so they stay.

**Effect order changes**
- Provider probe, live catalog and the two sign-in effects now run before App's bind/reap effect. Safe: the probe reads `sessionsRef`, which `bindResumedSessions` does not write (it only binds harness sessions). Its `setSessions` runs after the async catalog refresh. The sign-in effects only set sign-in state.
- Detach schedule and cleanup effects and the add-to-chat listener now run before the turn controller's effects. Safe: the detach effects manage only a timer, and the listener only registers.
- Escape-to-stop effect did not move. It stays after the turn call, so its order is unchanged.

**Proof:** 5 hook files, 65 moved statements (including module decls). Zero misses against HEAD.

**Tests (one at a time):** liveSessions 10/10, sessionRemoval 13/13, addChatToWorkspace 9/9, archiveShortcut 23/23, ciRepair 5/5, ciRepairSessions 2/2, ciRepairTracking 7/7. `tsc --noEmit` clean.

**App.tsx line count:** 2,396 (`wc -l`). Was 5,487 at the start of Part 1.

## What is left in App.tsx (for Part 3)

| Group | Lines in App.tsx | Lines |
|---|---|---|
| Imports, lazy surfaces, AppProps, App wrapper, `setsEqual`, `titleTabsEqual` | 1–214 | 214 |
| Conversation/selected-change helpers, `toTitleTab` (module) | 2247–2273, 2275–2396 | 149 |
| Title tabs (render-time) | 1528–1538 | 11 |
| Terminal handlers (`onOpenTerminal` … `onCloseTitleTab`) | 1010–1173 | 164 |
| Source control (`onShowSourceControl`, `onToggleChanges`, `onOpenWorkingTreeDiff`, `startCiRepair`, `onRepairChecks`) | 1178–1184, 1301–1305, 1604–1672 | 81 |
| Session list and history handlers (archive/pin/delete batches, title-tab actions, `onFocusDir`, `onRatio`, `onReload`, `onOpenLinkedSession`, `onOpenArchivedSession`) | 1307–1407, 1586–1602, 1676–1682 | 125 |
| Projects and navigation (`openFilePaths`, `projectHistory`, `sidebarHistory`, `openProjectSessions`, `onOpenSettings`, `onNavigateProjectList`, `onManageWorktrees`) | 1542–1584, 1684–1698, 1674, 1706–1722 | 76 |
| Approvals, live agents, linked-card dismissals | 993–1008, 1486–1526 | 57 |
| Effects left in App (resume/bind, skills, notifications, dock badge, visibility, layout flush, close-requested, prefetch, Escape-to-stop, traffic lights) | 708–738, 754–757, 839–841, 873–875, 877–902, 904–912, 914–923, 925–974, 976–978, 1442–1484, 1700–1704 | 187 |
| Render-time derived values (active, busy, approval, running terminals, liveAgents, toasts, linked panel, skill context, history flags) | 740–868 | 129 |
| Final render (`sessionPaneProps`, chrome flags, `workspaceTitleBar`, actions hook call) | 1724–1842 | 119 |
| JSX return | 1844–2245 | 402 |
| Glue: hook calls, bridge refs, App-held state (`sessions`, `seed`, `sidebarTabSelection`, `gitCwd`, `sessionDefaults`), blank lines, Workspace signature | the rest of 215–1009 and 1010–1842 | 682 |
| **Total** | | **2,396** |
