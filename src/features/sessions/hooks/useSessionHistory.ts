import { type ResumedWorkspace } from "../../../app/model/appLifecycle";
import { type Session, sessionWorkCwd } from "../model/session";
import {
  type SessionSummary,
  getSession,
  listSessionsByProject,
  persistFingerprint,
  replaceInFlightSessions,
  shouldPersistSession,
  upsertSession,
} from "../data/sessionStore";
import { type WindowTransferPayload } from "../../../app/model/windowTransfer";
import { type WorkspaceTab, leafIds } from "../../workspace/model/layout";
import {
  bindHarnessSession,
  isLiveHarness,
} from "../../../integrations/harness";
import {
  inFlightRefs,
  inFlightSnapshotKey,
  shouldWriteInFlightSnapshot,
} from "../model/inFlight";
import {
  mergeProjectHistorySummary,
  replaceProjectHistory,
} from "../data/sessionHistory";
import { normalizeProjectPath } from "../../projects/model/recents";
import { rememberLoadedSession } from "../data/sessionCache";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { LiveSessionStore } from "../model/liveSessions";

export type SessionHistoryDeps = {
  windowTransfer: WindowTransferPayload | null;
  resumed: ResumedWorkspace | null;
  bootHistory: SessionSummary[];
  bootHistoryCwd: string | null;
  sessions: Session[];
  sessionsRef: LiveSessionStore["ref"];
  setSessions: LiveSessionStore["set"];
  tabs: WorkspaceTab[];
  tabsRef: RefObject<WorkspaceTab[]>;
  sidebarCwd: string;
  sidebarCwdRef: RefObject<string>;
  removingSessionIds: RefObject<Set<string>>;
  switchingWorktrees: RefObject<Map<string, string>>;
};

function openSessionIds(tabs: WorkspaceTab[]): Set<string> {
  const ids = new Set<string>();
  for (const tab of tabs) {
    for (const id of leafIds(tab.layout)) ids.add(id);
  }
  return ids;
}

function lastUserBlockId(session: Session): string | undefined {
  for (let i = session.blocks.length - 1; i >= 0; i--) {
    if (session.blocks[i]?.role === "user") return session.blocks[i]?.id;
  }
  return undefined;
}

export function useSessionHistory(deps: SessionHistoryDeps) {
  const {
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
  } = deps;

  const [history, setHistory] = useState<SessionSummary[]>(() => bootHistory);
  /**
   * Projects whose rows are already in `history`. This has to be state, not a
   * ref: `sidebarCwd` is derived during render, so the frame that first shows
   * a new project must already know the listing has not arrived yet.
   */
  const [loadedProjects, setLoadedProjects] = useState<ReadonlySet<string>>(
    () =>
      bootHistoryCwd
        ? new Set([normalizeProjectPath(bootHistoryCwd)])
        : new Set(),
  );
  const loadedProjectsRef = useRef(loadedProjects);
  loadedProjectsRef.current = loadedProjects;
  /** Project whose listing failed, so the error cannot leak to another one. */
  const [historyErrorCwd, setHistoryErrorCwd] = useState<string | null>(null);

  const lastPersisted = useRef(new Map<string, string>());
  const lastBoundProvider = useRef(new Map<string, string>());
  const lastPersistedUserBlock = useRef(new Map<string, string>());
  const inFlightSyncKey = useRef<string | null>(null);
  const sawInFlight = useRef(false);

  const observedSessions = useRef(new Map<string, Session>());
  const pendingPersist = useRef(new Map<string, Session>());

  const loadedSessionCache = useRef(new Map<string, Session>());
  const sessionLoads = useRef(new Map<string, Promise<Session | null>>());
  const sessionLoadEpochs = useRef(new Map<string, number>());
  const openingSessionIds = useRef(new Set<string>());
  const activeSessionPrefetch = useRef<Promise<Session | null> | null>(null);

  const importedSessionsApplied = useRef(false);

  useEffect(() => {
    if (importedSessionsApplied.current) return;
    const imported = windowTransfer?.sessions ?? resumed?.sessions;
    if (!imported?.length) return;
    importedSessionsApplied.current = true;
    for (const session of imported) {
      observedSessions.current.set(session.id, session);
      lastPersisted.current.set(session.id, persistFingerprint(session));
      const userId = lastUserBlockId(session);
      if (userId) lastPersistedUserBlock.current.set(session.id, userId);
      if (session.providerSessionId) {
        lastBoundProvider.current.set(session.id, session.providerSessionId);
      }
    }
  }, [windowTransfer, resumed]);

  const refreshHistory = useCallback(async (cwd: string) => {
    if (!cwd || cwd === "~") return;
    // `history` holds every visited project's rows and the sidebar filters it
    // by cwd, so a project loaded once paints from cache on the way back and
    // revalidates quietly underneath the cards already on screen. Whether the
    // first load is still pending is derived from `loadedProjects`, not
    // tracked here — a status set from this effect lands a render too late to
    // suppress the empty state.
    const key = normalizeProjectPath(cwd);
    setHistoryErrorCwd((prev) => (prev === key ? null : prev));
    try {
      const rows = await listSessionsByProject(cwd);
      if (cwd !== sidebarCwdRef.current) return;
      setHistory((current) => replaceProjectHistory(current, cwd, rows));
      setLoadedProjects((prev) =>
        prev.has(key) ? prev : new Set(prev).add(key),
      );
    } catch {
      if (cwd !== sidebarCwdRef.current) return;
      // A failed revalidate keeps the cached cards rather than replacing a
      // good list with an error.
      if (!loadedProjectsRef.current.has(key)) setHistoryErrorCwd(key);
    }
  }, []);

  useEffect(() => {
    void refreshHistory(sidebarCwd);
  }, [sidebarCwd, refreshHistory]);

  const persistSession = useCallback((session: Session | undefined) => {
    if (
      !session ||
      !shouldPersistSession(session) ||
      removingSessionIds.current.has(session.id) ||
      switchingWorktrees.current.has(session.id)
    )
      return;
    const fingerprint = persistFingerprint(session);
    // Leaving a session flushes it. An unchanged one would still rewrite and
    // re-diff its whole transcript under the store lock, stalling the next load.
    if (lastPersisted.current.get(session.id) === fingerprint) return;
    void upsertSession(session)
      .then((summary) => {
        if (!summary) return;
        lastPersisted.current.set(session.id, fingerprint);
        if (summary.cwd === sidebarCwdRef.current) {
          setHistory((current) => mergeProjectHistorySummary(current, summary));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const liveIds = new Set(sessions.map((session) => session.id));
    const visibleIds = openSessionIds(tabsRef.current);
    for (const session of sessions) {
      if (
        removingSessionIds.current.has(session.id) ||
        switchingWorktrees.current.has(session.id)
      )
        continue;
      if (observedSessions.current.get(session.id) === session) continue;
      observedSessions.current.set(session.id, session);
      const parked = !visibleIds.has(session.id);
      const newlyBound =
        !!session.providerSessionId &&
        lastBoundProvider.current.get(session.id) !== session.providerSessionId;
      const lastUserId = lastUserBlockId(session);
      const newUserTurn =
        !!lastUserId &&
        lastPersistedUserBlock.current.get(session.id) !== lastUserId;
      if (newlyBound && session.providerSessionId) {
        lastBoundProvider.current.set(session.id, session.providerSessionId);
      }
      if (newUserTurn && lastUserId) {
        lastPersistedUserBlock.current.set(session.id, lastUserId);
      }
      if ((newlyBound || newUserTurn) && shouldPersistSession(session)) {
        persistSession(session);
      }
      if (
        shouldPersistSession(session) &&
        (!session.busy ||
          parked ||
          newlyBound ||
          newUserTurn ||
          !lastPersisted.current.has(session.id))
      ) {
        pendingPersist.current.set(session.id, session);
      }
    }
    for (const sessionId of observedSessions.current.keys()) {
      if (liveIds.has(sessionId)) continue;
      observedSessions.current.delete(sessionId);
      pendingPersist.current.delete(sessionId);
    }
    if (pendingPersist.current.size === 0) return;

    const timer = window.setTimeout(() => {
      const dirty = [...pendingPersist.current.values()];
      pendingPersist.current.clear();
      void Promise.all(
        dirty.map(async (session) => {
          if (
            removingSessionIds.current.has(session.id) ||
            switchingWorktrees.current.has(session.id)
          )
            return;
          const fingerprint = persistFingerprint(session);
          if (lastPersisted.current.get(session.id) === fingerprint) return;
          const summary = await upsertSession(session).catch(() => null);
          if (!summary) return;
          lastPersisted.current.set(session.id, fingerprint);
          if (summary.cwd === sidebarCwdRef.current) {
            setHistory((current) =>
              mergeProjectHistorySummary(current, summary),
            );
          }
        }),
      );
    }, 650);
    return () => window.clearTimeout(timer);
  }, [persistSession, sessions]);

  useEffect(() => {
    const refs = inFlightRefs(sessions, tabs);
    if (refs.length > 0) sawInFlight.current = true;
    const key = inFlightSnapshotKey(refs);
    if (
      !shouldWriteInFlightSnapshot(
        key,
        refs,
        inFlightSyncKey.current,
        sawInFlight.current,
      )
    ) {
      return;
    }
    inFlightSyncKey.current = key;
    void replaceInFlightSessions(refs).catch(() => undefined);
  }, [sessions, tabs]);

  const invalidateLoadedSession = useCallback((sessionId: string) => {
    openingSessionIds.current.delete(sessionId);
    loadedSessionCache.current.delete(sessionId);
    sessionLoads.current.delete(sessionId);
    sessionLoadEpochs.current.set(
      sessionId,
      (sessionLoadEpochs.current.get(sessionId) ?? 0) + 1,
    );
  }, []);

  const loadStoredSession = useCallback(
    (sessionId: string): Promise<Session | null> => {
      const cached = loadedSessionCache.current.get(sessionId);
      if (cached) {
        // The cache owns closed sessions only. Transfer this reference into
        // live state instead of retaining a stale duplicate while it changes.
        loadedSessionCache.current.delete(sessionId);
        return Promise.resolve(cached);
      }

      const pending = sessionLoads.current.get(sessionId);
      if (pending) return pending;

      const epoch = sessionLoadEpochs.current.get(sessionId) ?? 0;
      const loading = getSession(sessionId)
        .then((loaded) => {
          if (
            !loaded ||
            removingSessionIds.current.has(sessionId) ||
            (sessionLoadEpochs.current.get(sessionId) ?? 0) !== epoch
          ) {
            return null;
          }
          return loaded;
        })
        .catch(() => null);
      sessionLoads.current.set(sessionId, loading);
      void loading.then(() => {
        if (sessionLoads.current.get(sessionId) === loading) {
          sessionLoads.current.delete(sessionId);
        }
      });
      return loading;
    },
    [],
  );

  const ensureOpenSession = useCallback(
    async (sessionId: string): Promise<Session | null> => {
      const open = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (open) return open;

      openingSessionIds.current.add(sessionId);
      const restored = await loadStoredSession(sessionId);
      if (!restored || removingSessionIds.current.has(sessionId)) {
        openingSessionIds.current.delete(sessionId);
        void refreshHistory(sidebarCwd);
        return null;
      }
      loadedSessionCache.current.delete(sessionId);
      const appeared = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (appeared) return appeared;
      if (
        !restored.worktreeRemoved &&
        restored.providerSessionId &&
        isLiveHarness(restored.harness)
      ) {
        bindHarnessSession(
          restored.harness,
          restored.id,
          restored.providerSessionId,
          sessionWorkCwd(restored),
          restored.providerAccountId,
          restored.blocks,
        );
      }
      lastPersisted.current.set(restored.id, persistFingerprint(restored));
      if (!sessionsRef.current.some((session) => session.id === restored.id)) {
        const next = [...sessionsRef.current, restored];
        sessionsRef.current = next;
        setSessions(next);
      }
      return restored;
    },
    [loadStoredSession, refreshHistory, sidebarCwd],
  );

  const onPrefetchHistorySession = useCallback(
    (sessionId: string) => {
      if (
        removingSessionIds.current.has(sessionId) ||
        sessionsRef.current.some((session) => session.id === sessionId) ||
        loadedSessionCache.current.has(sessionId) ||
        sessionLoads.current.has(sessionId) ||
        activeSessionPrefetch.current
      ) {
        return;
      }
      const loading = loadStoredSession(sessionId);
      activeSessionPrefetch.current = loading;
      void loading.then((loaded) => {
        if (
          loaded &&
          !removingSessionIds.current.has(sessionId) &&
          !sessionsRef.current.some((session) => session.id === sessionId)
        ) {
          rememberLoadedSession(loadedSessionCache.current, loaded);
        }
        if (activeSessionPrefetch.current === loading) {
          activeSessionPrefetch.current = null;
        }
      });
    },
    [loadStoredSession],
  );

  return {
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
  };
}

export { lastUserBlockId, openSessionIds };
