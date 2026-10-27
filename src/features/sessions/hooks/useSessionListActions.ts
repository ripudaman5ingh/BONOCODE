import { useCallback } from "react";
import { confirmReload } from "../../../app/model/appLifecycle";
import { leafIds, neighborLeafId, setSplitRatio, type FocusDir, type WorkspaceTab } from "../../workspace/model/layout";
import type { useAppSurfaces } from "../../../app/hooks/useAppSurfaces";
import type { useOpenFiles } from "../../files/hooks/useOpenFiles";
import type { useProjectActions } from "../../projects/hooks/useProjectActions";
import type { useWorkspaceTabActions } from "../../workspace/hooks/useWorkspaceTabActions";
import type { useWorkspaceTabState } from "../../workspace/hooks/useWorkspaceTabState";
import type { LiveSessionStore } from "../model/liveSessions";
import type { useSessionHistory } from "./useSessionHistory";
import type { useSessionLifecycle } from "./useSessionLifecycle";

export type UseSessionListActionsDeps = {
  activeTab: WorkspaceTab | undefined;
  history: ReturnType<typeof useSessionHistory>["history"];
  sessionsRef: LiveSessionStore["ref"];
  tabsRef: ReturnType<typeof useWorkspaceTabState>["tabsRef"];
  setTabs: ReturnType<typeof useWorkspaceTabState>["setTabs"];
  setSettingsOpen: ReturnType<typeof useAppSurfaces>["setSettingsOpen"];
  setSidebarTab: ReturnType<typeof useProjectActions>["setSidebarTab"];
  onFocusPane: ReturnType<typeof useWorkspaceTabActions>["onFocusPane"];
  dirtyFilesRef: ReturnType<typeof useOpenFiles>["dirtyFilesRef"];
  onArchiveHistorySession: ReturnType<typeof useSessionLifecycle>["onArchiveHistorySession"];
  onPinHistorySession: ReturnType<typeof useSessionLifecycle>["onPinHistorySession"];
  onRemoveHistorySession: ReturnType<typeof useSessionLifecycle>["onRemoveHistorySession"];
  onSelectHistorySession: ReturnType<typeof useSessionLifecycle>["onSelectHistorySession"];
};

export function useSessionListActions(deps: UseSessionListActionsDeps) {
  const {
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
  } = deps;

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

  const onOpenArchivedSession = useCallback(
    (sessionId: string) => {
      setSettingsOpen(false);
      void onSelectHistorySession(sessionId);
    },
    [onSelectHistorySession],
  );

  return {
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
  };
}
