import { openSessionIds, type useSessionHistory } from "./useSessionHistory";
import { message } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, type Dispatch, type SetStateAction, type RefObject } from "react";
import { type SessionDeleteChoice } from "../ui/DeleteSessionDialog";
import { listWorktrees, worktreeSessionIds } from "../../source-control/model/worktrees";
import { isFilesystemTab, leafIds, newTab, replaceLeafId, splitPane, type PaneEdge, type WorkspaceTab } from "../../workspace/model/layout";
import { confirmCloseTerminals } from "../../terminal/model/terminalClose";
import { forgetHarnessSession } from "../../../integrations/harness";
import { sessionChildHarnesses } from "../model/handoff";
import { pathKey } from "../../../shared/lib/paths";
import { looksLikeProject } from "../../projects/model/recents";
import { applyPlaceTabOnPane, applyPlaceSessionOnPane, findOpenSessionTab, switchSessionInTab } from "../../workspace/model/workspaceTabGroups";
import { applyAddToChatRequest } from "../model/addChatToWorkspace";
import { ADD_TO_CHAT_EVENT, type AddToChatRequest } from "../model/quoteDraft";
import { createSessionRemover } from "../model/sessionRemoval";
import { HARNESS_LABEL, canReplaceSessionTitle, formatSessionTitle, newDefaultSession, removeSessionDraft, sessionDisplayTitle, sessionDraftBlock, titleFromPrompt, type Attachment, type LinkedWorkItem, type Session } from "../model/session";
import { discardDraftSessionRecord, getSession, persistFingerprint, setSessionArchived, setSessionLinkedWorkItem, setSessionPinned, shouldPersistSession, upsertSession } from "../data/sessionStore";
import { rememberLoadedSession } from "../data/sessionCache";
import { archiveFocusedSession } from "../model/archiveShortcut";
import { adjacentItemId } from "../../workspace/model/tabKeys";
import { loadSessionFolders, placeSessionInFolder, saveSessionFolders, type SessionFolderTarget } from "../model/sessionFolders";
import { mergeHistorySummary, mergeProjectHistorySummary, summaryFromSession } from "../data/sessionHistory";
import { isBlankSession } from "../../projects/model/projectReturn";
import { confirmDiscardUnsaved, type useWorkspaceTabActions } from "../../workspace/hooks/useWorkspaceTabActions";
import { filesInWorkspaceTabs, type useWorktreeActions } from "../../source-control/hooks/useWorktreeActions";
import { type useSessionLifecycleState } from "./useSessionLifecycleState";
import { type useOpenFiles } from "../../files/hooks/useOpenFiles";
import { type useTerminalDock } from "../../terminal/hooks/useTerminalDock";
import { type useAppSurfaces } from "../../../app/hooks/useAppSurfaces";
import { type useLinkedWorkItemPanels } from "../../github/hooks/useLinkedWorkItemPanels";
import { type LiveSessionStore } from "../model/liveSessions";

/** How long a hidden idle session stays attached after it leaves every tab. */
const SESSION_DETACH_DELAY_MS = 250;

export type UseSessionLifecycleDeps = {
  detachTimer: ReturnType<typeof useSessionLifecycleState>["detachTimer"];
  sessions: Session[];
  sessionsRef: LiveSessionStore["ref"];
  liveAgentsEnabled: boolean;
  detachInputs: ReturnType<typeof useSessionLifecycleState>["detachInputs"];
  tabsRef: RefObject<WorkspaceTab[]>;
  openingSessionIds: ReturnType<typeof useSessionHistory>["openingSessionIds"];
  loadedSessionCache: ReturnType<typeof useSessionHistory>["loadedSessionCache"];
  unseenFinishedRef: RefObject<Set<string>>;
  skipForgetSessionIds: ReturnType<typeof useSessionLifecycleState>["skipForgetSessionIds"];
  persistSession: ReturnType<typeof useSessionHistory>["persistSession"];
  setSessions: LiveSessionStore["set"];
  tabs: WorkspaceTab[];
  setSearchViewOpen: ReturnType<typeof useAppSurfaces>["setSearchViewOpen"];
  active: Session | undefined;
  sessionDefaults: Session | undefined;
  projectCwd: string;
  appendTab: ReturnType<typeof useWorkspaceTabActions>["appendTab"];
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  ensureOpenSession: ReturnType<typeof useSessionHistory>["ensureOpenSession"];
  linkedSessionUpdatesRef: ReturnType<typeof useLinkedWorkItemPanels>["linkedSessionUpdatesRef"];
  revealLinkedSessionUpdate: ReturnType<typeof useLinkedWorkItemPanels>["revealLinkedSessionUpdate"];
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  activeTabIdRef: RefObject<string>;
  lastPersisted: ReturnType<typeof useSessionHistory>["lastPersisted"];
  tabCloseScope: "project";
  projectCwdRef: RefObject<string>;
  setProjectTerminalFocused: ReturnType<typeof useTerminalDock>["setProjectTerminalFocused"];
  sessionNavigationIdsRef: ReturnType<typeof useSessionLifecycleState>["sessionNavigationIdsRef"];
  onPrefetchHistorySession: ReturnType<typeof useSessionHistory>["onPrefetchHistorySession"];
  invalidateLoadedSession: ReturnType<typeof useSessionHistory>["invalidateLoadedSession"];
  refreshHistory: ReturnType<typeof useSessionHistory>["refreshHistory"];
  sidebarCwd: string;
  removingSessionIds: ReturnType<typeof useSessionLifecycleState>["removingSessionIds"];
  switchingWorktrees: RefObject<Map<string, string>>;
  deleteConfirmationPending: ReturnType<typeof useSessionLifecycleState>["deleteConfirmationPending"];
  history: ReturnType<typeof useSessionHistory>["history"];
  setSessionDeleteDialog: ReturnType<typeof useSessionLifecycleState>["setSessionDeleteDialog"];
  pendingPersist: ReturnType<typeof useSessionHistory>["pendingPersist"];
  dirtyFilesRef: ReturnType<typeof useOpenFiles>["dirtyFilesRef"];
  setDirtyFiles: ReturnType<typeof useOpenFiles>["setDirtyFiles"];
  activateTab: ReturnType<typeof useWorkspaceTabActions>["activateTab"];
  setHistory: ReturnType<typeof useSessionHistory>["setHistory"];
  stopSessionForRemoval: (sessionId: string) => Promise<Session | undefined>;
  onRemoveWorktree: ReturnType<typeof useWorktreeActions>["onRemoveWorktree"];
  projectTerminalFocusedRef: ReturnType<typeof useTerminalDock>["projectTerminalFocusedRef"];
  searchViewOpenRef: ReturnType<typeof useAppSurfaces>["searchViewOpenRef"];
  settingsOpenRef: ReturnType<typeof useAppSurfaces>["settingsOpenRef"];
  filePickerOpenRef: ReturnType<typeof useAppSurfaces>["filePickerOpenRef"];
  whatsNewVersionRef: ReturnType<typeof useAppSurfaces>["whatsNewVersionRef"];
  setLinkedWorkItemPanels: ReturnType<typeof useLinkedWorkItemPanels>["setLinkedWorkItemPanels"];
  lastPersistedUserBlock: ReturnType<typeof useSessionHistory>["lastPersistedUserBlock"];
};

export function useSessionLifecycle(deps: UseSessionLifecycleDeps) {
  const {
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
  } = deps;
  useEffect(() => {
    const openSessionForAddToChat = (event: Event) => {
      const detail = (event as CustomEvent<AddToChatRequest>).detail;
      if (!detail?.text) return;

      const result = applyAddToChatRequest({
        sessions: sessionsRef.current,
        tabs: tabsRef.current,
        activeTabId: activeTabIdRef.current,
        projectCwd: projectCwdRef.current,
        fallbackCwd: sessionDefaults?.cwd,
        defaultRuntimeMode: sessionDefaults?.runtimeMode,
        text: detail.text,
        mode: detail.mode,
      });
      if (!result) return;

      sessionsRef.current = result.sessions;
      tabsRef.current = result.tabs;
      setSessions(result.sessions);
      setTabs(result.tabs);
      setActiveTabId(result.activeTabId);
      setProjectTerminalFocused(false);
      setComposerFocused(true);
    };

    window.addEventListener(ADD_TO_CHAT_EVENT, openSessionForAddToChat);
    return () =>
      window.removeEventListener(ADD_TO_CHAT_EVENT, openSessionForAddToChat);
  }, [sessionDefaults?.cwd, sessionDefaults?.runtimeMode]);

  const detachIdleSessions = useCallback(() => {
    detachTimer.current = null;
    const sessions = sessionsRef.current;
    const { liveAgentsEnabled } = detachInputs.current;
    const visibleIds = openSessionIds(tabsRef.current);
    for (const sessionId of visibleIds) {
      openingSessionIds.current.delete(sessionId);
      loadedSessionCache.current.delete(sessionId);
    }
    const keepUnseen = liveAgentsEnabled;
    const idleDetached = sessions.filter(
      (session) =>
        !visibleIds.has(session.id) &&
        !session.busy &&
        !openingSessionIds.current.has(session.id) &&
        !(keepUnseen && unseenFinishedRef.current.has(session.id)),
    );
    if (idleDetached.length === 0) return;
    for (const session of idleDetached) {
      if (skipForgetSessionIds.current.has(session.id)) continue;
      if (shouldPersistSession(session)) {
        rememberLoadedSession(loadedSessionCache.current, session);
      }
      persistSession(session);
      for (const harness of sessionChildHarnesses(session)) {
        void forgetHarnessSession(harness, session.id);
      }
    }
    setSessions((prev) =>
      prev.filter(
        (session) =>
          visibleIds.has(session.id) ||
          session.busy ||
          openingSessionIds.current.has(session.id) ||
          (keepUnseen && unseenFinishedRef.current.has(session.id)) ||
          skipForgetSessionIds.current.has(session.id),
      ),
    );
  }, [persistSession]);

  useEffect(() => {
    if (detachTimer.current != null) return;
    detachTimer.current = window.setTimeout(
      detachIdleSessions,
      SESSION_DETACH_DELAY_MS,
    );
  }, [sessions, tabs, liveAgentsEnabled, detachIdleSessions]);

  useEffect(
    () => () => {
      if (detachTimer.current != null) window.clearTimeout(detachTimer.current);
    },
    [],
  );

  const onNew = useCallback(() => {
    setSearchViewOpen(false);
    const cwd = active?.cwd ?? sessionDefaults?.cwd ?? projectCwd;
    const session = newDefaultSession(cwd, sessionDefaults?.runtimeMode);
    const tab = newTab(session.id);
    setSessions((prev) => [...prev, session]);
    appendTab(tab, cwd);
    setActiveTabId(tab.id);
    setComposerFocused(true);
    return session.id;
  }, [
    active?.cwd,
    appendTab,
    sessionDefaults?.cwd,
    sessionDefaults?.runtimeMode,
    projectCwd,
  ]);

  const focusOpenSession = useCallback((sessionId: string) => {
    const tab = findOpenSessionTab(
      tabsRef.current,
      sessionsRef.current,
      sessionId,
    );
    if (!tab) return false;
    loadedSessionCache.current.delete(sessionId);
    setActiveTabId(tab.id);
    setTabs((prev) =>
      prev.map((entry) =>
        entry.id === tab.id ? { ...entry, focusedId: sessionId } : entry,
      ),
    );
    setComposerFocused(true);
    return true;
  }, []);

  const replaceBlankPaneWithSession = useCallback((session: Session) => {
    const tab =
      tabsRef.current.find((entry) => entry.id === activeTabIdRef.current) ??
      tabsRef.current[0];
    if (!tab) return false;

    const paneId = isBlankSession(
      sessionsRef.current.find((entry) => entry.id === tab.focusedId),
    )
      ? tab.focusedId
      : leafIds(tab.layout).find((id) =>
          isBlankSession(sessionsRef.current.find((entry) => entry.id === id)),
        );
    if (!paneId || paneId === session.id) return false;

    lastPersisted.current.delete(paneId);
    {
      const blank = sessionsRef.current.find((entry) => entry.id === paneId);
      if (blank) void forgetHarnessSession(blank.harness, paneId);
    }
    setSessions((prev) => {
      const next = prev.filter((entry) => entry.id !== paneId);
      return next.some((entry) => entry.id === session.id)
        ? next
        : [...next, session];
    });
    setTabs((prev) =>
      prev.map((entry) =>
        entry.id === tab.id
          ? {
              ...entry,
              layout: replaceLeafId(entry.layout, paneId, session.id),
              focusedId: session.id,
            }
          : entry,
      ),
    );
    setActiveTabId(tab.id);
    setComposerFocused(true);
    return true;
  }, []);

  const onSelectHistorySession = useCallback(
    async (sessionId: string) => {
      const session = await ensureOpenSession(sessionId);
      if (!session) return;
      const linkedUpdate = linkedSessionUpdatesRef.current.get(session.id);
      if (focusOpenSession(session.id)) {
        if (linkedUpdate) revealLinkedSessionUpdate(session.id, linkedUpdate);
        return;
      }
      if (replaceBlankPaneWithSession(session)) {
        if (linkedUpdate) revealLinkedSessionUpdate(session.id, linkedUpdate);
        return;
      }
      const tab = newTab(session.id);
      appendTab(tab, session.cwd);
      setActiveTabId(tab.id);
      setComposerFocused(true);
      if (linkedUpdate) revealLinkedSessionUpdate(session.id, linkedUpdate);
    },
    [
      appendTab,
      ensureOpenSession,
      focusOpenSession,
      replaceBlankPaneWithSession,
      revealLinkedSessionUpdate,
    ],
  );

  const onPlaceSessionOnPane = useCallback(
    async (sessionId: string, targetId: string, edge: PaneEdge) => {
      if (sessionId === targetId) return;
      const targetTab = tabsRef.current.find((tab) =>
        leafIds(tab.layout).includes(targetId),
      );
      if (!targetTab) return;

      const alreadyHere = leafIds(targetTab.layout).includes(sessionId);
      if (!alreadyHere) {
        const session = await ensureOpenSession(sessionId);
        if (!session) return;
      }

      const tab = tabsRef.current.find((entry) => entry.id === targetTab.id);
      if (!tab || !leafIds(tab.layout).includes(targetId)) return;

      const replaceTarget =
        !leafIds(tab.layout).includes(sessionId) &&
        isBlankSession(
          sessionsRef.current.find((entry) => entry.id === targetId),
        );

      if (replaceTarget) {
        lastPersisted.current.delete(targetId);
        const blank = sessionsRef.current.find(
          (entry) => entry.id === targetId,
        );
        if (blank) void forgetHarnessSession(blank.harness, targetId);
      }

      const result = applyPlaceSessionOnPane({
        tabs: tabsRef.current,
        sessions: sessionsRef.current,
        sessionId,
        targetId,
        edge,
        replaceTarget,
        scope: tabCloseScope,
        createReplacement: (seed) =>
          newDefaultSession(
            seed?.cwd ?? projectCwdRef.current,
            seed?.runtimeMode,
          ),
      });
      if (!result) return;

      sessionsRef.current = result.sessions;
      tabsRef.current = result.tabs;
      setSessions(result.sessions);
      setTabs(result.tabs);
      setActiveTabId(result.activeTabId);
      setProjectTerminalFocused(false);
      setComposerFocused(true);
    },
    [ensureOpenSession, tabCloseScope],
  );

  const onPlaceTabOnPane = useCallback(
    (sourceTabId: string, targetId: string, edge: PaneEdge) => {
      const targetTab = tabsRef.current.find((tab) =>
        leafIds(tab.layout).includes(targetId),
      );
      if (!targetTab || targetTab.id === sourceTabId) return;

      const blankTarget = sessionsRef.current.find(
        (session) => session.id === targetId && isBlankSession(session),
      );
      const result = applyPlaceTabOnPane({
        tabs: tabsRef.current,
        sessions: sessionsRef.current,
        sourceTabId,
        targetId,
        edge,
        replaceTarget: blankTarget != null,
      });
      if (!result) return;

      if (blankTarget) {
        lastPersisted.current.delete(blankTarget.id);
        void forgetHarnessSession(blankTarget.harness, blankTarget.id);
      }
      sessionsRef.current = result.sessions;
      tabsRef.current = result.tabs;
      setSessions(result.sessions);
      setTabs(result.tabs);
      setActiveTabId(result.activeTabId);
      setProjectTerminalFocused(false);
      setComposerFocused(
        result.sessions.some((session) => session.id === result.focusedId),
      );
    },
    [],
  );

  const onRenameHistorySession = useCallback(
    async (sessionId: string, displayTitle: string) => {
      const trimmed = displayTitle.trim();
      if (!trimmed) return;
      invalidateLoadedSession(sessionId);

      const open = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (open) {
        const title = formatSessionTitle(open.harness, trimmed);
        const updated = { ...open, title };
        setSessions((prev) =>
          prev.map((session) => (session.id === sessionId ? updated : session)),
        );
        loadedSessionCache.current.delete(sessionId);
        persistSession(updated);
      } else {
        const restored = await getSession(sessionId).catch(() => null);
        if (!restored) {
          void refreshHistory(sidebarCwd);
          return;
        }
        const updated = {
          ...restored,
          title: formatSessionTitle(restored.harness, trimmed),
        };
        const saved = await upsertSession(updated).catch(() => null);
        if (saved) {
          rememberLoadedSession(loadedSessionCache.current, updated);
          lastPersisted.current.set(sessionId, persistFingerprint(updated));
        }
      }
      void refreshHistory(sidebarCwd);
    },
    [invalidateLoadedSession, persistSession, refreshHistory, sidebarCwd],
  );

  const onRemoveHistorySession = useCallback(
    async (
      sessionId: string,
      mode: "archive" | "delete",
      skipDeleteConfirm = false,
    ): Promise<boolean> => {
      if (
        removingSessionIds.current.has(sessionId) ||
        switchingWorktrees.current.has(sessionId) ||
        deleteConfirmationPending.current
      )
        return false;
      const open = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      const summary = history.find((entry) => entry.id === sessionId);
      const seed = open ?? summary;
      const label = seed
        ? sessionDisplayTitle(seed.title, seed.harness)
        : "this session";
      removingSessionIds.current.add(sessionId);
      let deleteWorktreePath: string | undefined;
      if (mode === "delete" && !skipDeleteConfirm) {
        deleteConfirmationPending.current = true;
        let unusedWorktree: string | undefined;
        if (seed?.worktreeCwd) {
          try {
            const { worktrees } = await listWorktrees(seed.cwd);
            const tree = worktrees.find(
              (entry) => pathKey(entry.path) === pathKey(seed.worktreeCwd!),
            );
            if (
              tree &&
              !tree.isMain &&
              !tree.locked &&
              tree.branch &&
              worktreeSessionIds(tree, sessionsRef.current).every(
                (id) => id === sessionId,
              )
            )
              unusedWorktree = tree.path;
          } catch {
            // A failed lookup must never offer filesystem cleanup.
          }
        }
        if (!unusedWorktree) {
          deleteConfirmationPending.current = false;
        } else {
          const choice = await new Promise<SessionDeleteChoice>((resolve) => {
            setSessionDeleteDialog({ title: label, unusedWorktree, resolve });
          });
          deleteConfirmationPending.current = false;
          if (!choice.confirmed) {
            removingSessionIds.current.delete(sessionId);
            return false;
          }
          if (choice.deleteWorktree) deleteWorktreePath = unusedWorktree;
        }
      }
      invalidateLoadedSession(sessionId);
      pendingPersist.current.delete(sessionId);
      try {
        const remover = createSessionRemover({
          mode,
          scope: tabCloseScope,
          replacement: {
            harness: seed?.harness ?? "cursor",
            cwd: seed?.cwd ?? sidebarCwd,
            model: seed?.model,
            runtimeMode: seed?.runtimeMode,
            modelSettings: open?.modelSettings,
          },
          workspace: {
            snapshot: () => ({
              tabs: tabsRef.current,
              sessions: sessionsRef.current,
              activeTabId: activeTabIdRef.current,
              dirtyFiles: dirtyFilesRef.current,
            }),
            apply: (change) => {
              if (change.type === "stopped") {
                const next = sessionsRef.current.map((session) =>
                  session.id === sessionId ? change.session : session,
                );
                sessionsRef.current = next;
                setSessions(next);
                return;
              }

              const { removal } = change;
              lastPersisted.current.delete(sessionId);
              pendingPersist.current.delete(sessionId);
              const closingFiles = filesInWorkspaceTabs(removal.closedTabs);
              setDirtyFiles((current) => {
                const next = new Set(current);
                for (const file of closingFiles) next.delete(file.id);
                return next;
              });
              sessionsRef.current = removal.sessions;
              tabsRef.current = removal.tabs;
              setSessions(removal.sessions);
              setTabs(removal.tabs);
              if (removal.activeTabId !== activeTabIdRef.current) {
                activateTab(removal.activeTabId);
              }
              const activeTab = removal.tabs.find(
                (tab) => tab.id === removal.activeTabId,
              );
              setComposerFocused(
                removal.sessions.some(
                  (session) => session.id === activeTab?.focusedId,
                ),
              );
              if (change.mode === "archive") {
                if (change.session && shouldPersistSession(change.session)) {
                  rememberLoadedSession(
                    loadedSessionCache.current,
                    change.session,
                  );
                }
                const archived =
                  change.savedSummary ??
                  summary ??
                  (change.session && summaryFromSession(change.session));
                if (archived) {
                  setHistory((current) =>
                    mergeHistorySummary(current, {
                      ...archived,
                      archived: true,
                    }),
                  );
                }
              } else {
                setHistory((current) =>
                  current.filter((entry) => entry.id !== sessionId),
                );
                void refreshHistory(sidebarCwd);
              }
            },
          },
          confirm: async (closedTabs, removalMode) => {
            const files = filesInWorkspaceTabs(closedTabs);
            const unsaved = files.some(
              (file) =>
                isFilesystemTab(file) && dirtyFilesRef.current.has(file.id),
            );
            if (
              unsaved &&
              !(await confirmDiscardUnsaved(
                `${removalMode === "archive" ? "Archive" : "Delete"} this conversation with unsaved files?`,
              ))
            )
              return false;
            const terminals = files.filter((file) => file.terminal);
            return (
              terminals.length === 0 || (await confirmCloseTerminals(terminals))
            );
          },
          stop: stopSessionForRemoval,
        });
        const removed = await remover.remove(sessionId);
        if (removed && deleteWorktreePath && seed) {
          try {
            await onRemoveWorktree(seed.cwd, deleteWorktreePath, false);
          } catch (error) {
            void message(
              `The session was deleted. Its worktree was kept.\n\n${String(error)}\n\nYou can manage it in Settings → Worktrees.`,
              { title: "Bonocode", kind: "warning" },
            );
          }
        }
        return removed;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        void message(`Could not ${mode} this conversation.\n\n${detail}`, {
          title: "Bonocode",
          kind: "error",
        });
        return false;
      } finally {
        removingSessionIds.current.delete(sessionId);
      }
    },
    [
      activateTab,
      history,
      invalidateLoadedSession,
      refreshHistory,
      sidebarCwd,
      stopSessionForRemoval,
      tabCloseScope,
      onRemoveWorktree,
    ],
  );

  const onArchiveHistorySession = useCallback(
    async (sessionId: string, archived: boolean) => {
      if (archived) return onRemoveHistorySession(sessionId, "archive");
      if (removingSessionIds.current.has(sessionId)) return false;
      try {
        await setSessionArchived(sessionId, false);
        setHistory((current) =>
          current.map((entry) =>
            entry.id === sessionId ? { ...entry, archived: false } : entry,
          ),
        );
        return true;
      } catch (error) {
        void message(
          `Could not unarchive this conversation.\n\n${String(error)}`,
          {
            title: "Bonocode",
            kind: "error",
          },
        );
        return false;
      }
    },
    [onRemoveHistorySession],
  );

  const onArchiveFocusedSession = useCallback(
    (event: KeyboardEvent) => {
      archiveFocusedSession(
        event,
        {
          activeTabId: activeTabIdRef.current,
          tabs: tabsRef.current,
          sessions: sessionsRef.current,
          projectTerminalFocused: projectTerminalFocusedRef.current,
          surfaceOpen: Boolean(
            searchViewOpenRef.current ||
            settingsOpenRef.current ||
            filePickerOpenRef.current ||
            whatsNewVersionRef.current,
          ),
        },
        (sessionId) => {
          void onArchiveHistorySession(sessionId, true);
        },
      );
    },
    [onArchiveHistorySession],
  );

  const onPinHistorySession = useCallback(
    async (sessionId: string, pinned: boolean) => {
      const open = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (open && shouldPersistSession(open)) {
        await upsertSession(open).catch(() => undefined);
      }
      await setSessionPinned(sessionId, pinned).catch(() => undefined);
      setHistory((current) => {
        const existing = current.find((entry) => entry.id === sessionId);
        if (existing) {
          return mergeProjectHistorySummary(current, { ...existing, pinned });
        }
        if (!open) return current;
        return mergeProjectHistorySummary(current, {
          ...summaryFromSession(open),
          pinned,
        });
      });
    },
    [],
  );

  const onSetHistorySessionLinkedWorkItem = useCallback(
    (sessionId: string, linkedWorkItem: LinkedWorkItem | undefined) => {
      const previousLinkedWorkItem =
        sessionsRef.current.find((session) => session.id === sessionId)
          ?.linkedWorkItem ??
        history.find((session) => session.id === sessionId)?.linkedWorkItem;
      invalidateLoadedSession(sessionId);
      loadedSessionCache.current.delete(sessionId);

      const nextSessions = sessionsRef.current.map((session) =>
        session.id === sessionId ? { ...session, linkedWorkItem } : session,
      );
      sessionsRef.current = nextSessions;
      setSessions(nextSessions);
      setHistory((current) =>
        current.map((session) =>
          session.id === sessionId ? { ...session, linkedWorkItem } : session,
        ),
      );
      setLinkedWorkItemPanels((current) => {
        if (!current.has(sessionId)) return current;
        const next = new Map(current);
        next.delete(sessionId);
        return next;
      });

      void setSessionLinkedWorkItem(sessionId, linkedWorkItem).catch(
        (error) => {
          const rolledBackSessions = sessionsRef.current.map((session) =>
            session.id === sessionId &&
            session.linkedWorkItem === linkedWorkItem
              ? { ...session, linkedWorkItem: previousLinkedWorkItem }
              : session,
          );
          sessionsRef.current = rolledBackSessions;
          setSessions(rolledBackSessions);
          setHistory((current) =>
            current.map((session) =>
              session.id === sessionId &&
              session.linkedWorkItem === linkedWorkItem
                ? { ...session, linkedWorkItem: previousLinkedWorkItem }
                : session,
            ),
          );
          void refreshHistory(sidebarCwd);
          void message(
            `Could not update this conversation's GitHub link.\n\n${String(error)}`,
            { title: "Bonocode", kind: "error" },
          );
        },
      );
    },
    [history, invalidateLoadedSession, refreshHistory, sidebarCwd],
  );

  const onPlaceSessionInFolder = useCallback(
    (sessionId: string, target: SessionFolderTarget) => {
      const source = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (!source || !looksLikeProject(source.cwd)) return;
      const folders = loadSessionFolders(source.cwd);
      if (
        target.kind === "existing" &&
        !folders.some((folder) => folder.id === target.folderId)
      ) {
        return;
      }
      saveSessionFolders(
        source.cwd,
        placeSessionInFolder(
          folders,
          sessionId,
          target,
        ),
      );
    },
    [],
  );

  const onSaveDraft = useCallback(
    (sessionId: string, text: string, attachments: Attachment[] = []) => {
      const current = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (
        !current ||
        current.busy ||
        sessionDraftBlock(current) ||
        current.worktreeRemoved ||
        (!text.trim() && attachments.length === 0)
      ) {
        return false;
      }
      const placeholderTitle = canReplaceSessionTitle(
        current.title,
        current.harness,
        HARNESS_LABEL[current.harness],
      );
      const title = placeholderTitle
        ? titleFromPrompt(text, current.harness, attachments)
        : current.title;
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId && !sessionDraftBlock(session)
            ? {
                ...session,
                title,
                blocks: [
                  ...session.blocks,
                  {
                    id: crypto.randomUUID(),
                    role: "user",
                    text,
                    ...(attachments.length > 0 ? { attachments } : {}),
                    draft: true,
                  },
                ],
              }
            : session,
        ),
      );
      return true;
    },
    [],
  );

  const onRemoveDraft = useCallback(
    (sessionId: string, draftBlockId: string) => {
      const current = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (!current) return false;
      const withoutDraft = removeSessionDraft(current, draftBlockId);
      if (!withoutDraft) return false;

      if (!shouldPersistSession(withoutDraft)) {
        pendingPersist.current.delete(sessionId);
        lastPersisted.current.delete(sessionId);
        lastPersistedUserBlock.current.delete(sessionId);
        invalidateLoadedSession(sessionId);
        setHistory((history) =>
          history.filter((session) => session.id !== sessionId),
        );
        void discardDraftSessionRecord(sessionId).catch(() => undefined);
      }

      setSessions((sessions) =>
        sessions.map((session) =>
          session.id === sessionId
            ? (removeSessionDraft(session, draftBlockId) ?? session)
            : session,
        ),
      );
      return true;
    },
    [invalidateLoadedSession],
  );

  const openSessionBeside = useCallback(
    (
      sourceId: string,
      session: Session,
      cwd: string,
      focusComposer = false,
    ) => {
      const nextSessions = [...sessionsRef.current, session];
      sessionsRef.current = nextSessions;
      setSessions(nextSessions);

      const tab = tabsRef.current.find((entry) =>
        leafIds(entry.layout).includes(sourceId),
      );
      if (tab) {
        const nextTabs = tabsRef.current.map((entry) =>
          entry.id === tab.id
            ? {
                ...entry,
                layout: splitPane(entry.layout, sourceId, "right", session.id),
                focusedId: session.id,
                diffFocused: false,
              }
            : entry,
        );
        tabsRef.current = nextTabs;
        setTabs(nextTabs);
        if (tab.id !== activeTabIdRef.current) setActiveTabId(tab.id);
      } else {
        const nextTab = newTab(session.id);
        appendTab(nextTab, cwd);
        setActiveTabId(nextTab.id);
      }

      setProjectTerminalFocused(false);
      setComposerFocused(focusComposer);
    },
    [appendTab],
  );

  const onSessionNavigationOrder = useCallback((ids: readonly string[]) => {
    sessionNavigationIdsRef.current = ids;
  }, []);

  const onNavigateSessionList = useCallback(
    (delta: number, inCurrentTab = false) => {
      const activeWorkspace = tabsRef.current.find(
        (entry) => entry.id === activeTabIdRef.current,
      );
      if (!activeWorkspace || activeWorkspace.diffFocused) return;
      const current = sessionsRef.current.find(
        (session) => session.id === activeWorkspace.focusedId,
      );
      if (!current) return;
      const next = adjacentItemId(
        sessionNavigationIdsRef.current,
        current.id,
        delta,
      );
      if (!next || next === current.id) return;
      // Stepping gives no hover to warm the transcript, so load the one a
      // further step away once this switch has its own session.
      const prefetchAhead = () => {
        const ahead = adjacentItemId(
          sessionNavigationIdsRef.current,
          next,
          delta,
        );
        if (ahead && ahead !== current.id) onPrefetchHistorySession(ahead);
      };
      if (!inCurrentTab) {
        void onSelectHistorySession(next).then(prefetchAhead);
        return;
      }
      const activeTabId = activeWorkspace.id;
      const focusedId = current.id;
      void ensureOpenSession(next).then((session) => {
        prefetchAhead();
        if (!session) return;
        if (activeTabIdRef.current !== activeTabId) return;
        const currentTab = tabsRef.current.find(
          (tab) => tab.id === activeTabId,
        );
        if (currentTab?.focusedId !== focusedId) return;
        setTabs(
          (prev) =>
            switchSessionInTab(prev, activeTabId, focusedId, next) ?? prev,
        );
        setComposerFocused(true);
        const linkedUpdate = linkedSessionUpdatesRef.current.get(next);
        if (linkedUpdate) revealLinkedSessionUpdate(next, linkedUpdate);
      });
    },
    [
      ensureOpenSession,
      onPrefetchHistorySession,
      onSelectHistorySession,
      revealLinkedSessionUpdate,
    ],
  );

  return { onNew, onSelectHistorySession, focusOpenSession, onPlaceSessionOnPane, onPlaceTabOnPane, openSessionBeside, onNavigateSessionList, onSessionNavigationOrder, onRenameHistorySession, onRemoveHistorySession, onArchiveHistorySession, onArchiveFocusedSession, onPinHistorySession, onSetHistorySessionLinkedWorkItem, onPlaceSessionInFolder, onSaveDraft, onRemoveDraft };
}
