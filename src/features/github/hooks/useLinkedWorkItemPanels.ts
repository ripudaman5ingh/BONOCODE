import { LinkedSessionUpdate } from "../model/linkedSessionUpdates";
import { type LinkedWorkItem } from "../../sessions/model/session";
import {
  type LinkedWorkItemUpdateCard,
  completeLinkedWorkItemUpdateCard,
  failLinkedWorkItemUpdateCard,
  pendingLinkedWorkItemUpdateCard,
} from "../model/linkedWorkItemActivity";
import { type SessionSummary } from "../../sessions/data/sessionStore";
import { type WorkspaceTab, leafIds } from "../../workspace/model/layout";
import { githubWorkItemThread } from "../model/githubTasks";
import { markLinkedSessionUpdateSeen } from "../model/linkedSessionSeen";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { LiveSessionStore } from "../../sessions/model/liveSessions";

export type LinkedWorkItemPanelsDeps = {
  tabs: WorkspaceTab[];
  sessionsRef: LiveSessionStore["ref"];
  setSessions: LiveSessionStore["set"];
  history: SessionSummary[];
  sidebarCwd: string;
  setFilePickerOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setSearchViewOpen: Dispatch<SetStateAction<boolean>>;
  onSelectHistorySession: (sessionId: string) => Promise<void>;
};

type LinkedWorkItemPanelState = {
  item: LinkedWorkItem;
  sessionId: string;
  cwd: string;
};

export function useLinkedWorkItemPanels(deps: LinkedWorkItemPanelsDeps) {
  const {
    tabs,
    sessionsRef,
    setSessions,
    history,
    sidebarCwd,
    setFilePickerOpen,
    setSettingsOpen,
    setSearchViewOpen,
    onSelectHistorySession,
  } = deps;

  const [linkedWorkItemPanels, setLinkedWorkItemPanels] = useState<
    ReadonlyMap<string, LinkedWorkItemPanelState>
  >(() => new Map());
  const linkedWorkItemPanelRequest = useRef(0);
  const closeLinkedWorkItemPanel = useCallback((sessionId: string) => {
    linkedWorkItemPanelRequest.current += 1;
    setLinkedWorkItemPanels((current) => {
      if (!current.has(sessionId)) return current;
      const next = new Map(current);
      next.delete(sessionId);
      return next;
    });
  }, []);

  const linkedSessionUpdatesRef = useRef<
    ReadonlyMap<string, LinkedSessionUpdate>
  >(new Map());
  const linkedWorkItemActivityFetches = useRef(new Map<string, number>());

  // Panels are tab-local UI. Keep mounted panels alive while their tab is in
  // the workspace so switching away preserves the fetched issue and its UI
  // state, then discard them when their session leaves every open tab.
  useEffect(() => {
    const openSessionIds = new Set(tabs.flatMap((tab) => leafIds(tab.layout)));
    setLinkedWorkItemPanels((current) => {
      if ([...current.keys()].every((id) => openSessionIds.has(id))) {
        return current;
      }
      return new Map([...current].filter(([id]) => openSessionIds.has(id)));
    });
  }, [tabs]);

  const setLinkedWorkItemUpdateCard = useCallback(
    (
      sessionId: string,
      update: (
        card: LinkedWorkItemUpdateCard | undefined,
      ) => LinkedWorkItemUpdateCard | undefined,
    ) => {
      const previous = sessionsRef.current;
      const next = previous.map((session) => {
        if (session.id !== sessionId) return session;
        const card = update(session.linkedWorkItemUpdateCard);
        return card === session.linkedWorkItemUpdateCard
          ? session
          : { ...session, linkedWorkItemUpdateCard: card };
      });
      if (!next.some((session, index) => session !== previous[index])) return;
      sessionsRef.current = next;
      setSessions(next);
    },
    [],
  );

  const revealLinkedSessionUpdate = useCallback(
    (sessionId: string, update: LinkedSessionUpdate) => {
      const session = sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      if (!session?.linkedWorkItem) return;
      if (
        session.linkedWorkItemUpdateCard?.updatedAt === update.updatedAt &&
        session.linkedWorkItemUpdateCard.status !== "error"
      ) {
        return;
      }
      if (
        linkedWorkItemActivityFetches.current.get(sessionId) ===
        update.updatedAt
      ) {
        return;
      }
      const pending = pendingLinkedWorkItemUpdateCard(update);
      linkedWorkItemActivityFetches.current.set(sessionId, update.updatedAt);
      // A stale/error card should not remain visible while fresh details load.
      // The session itself is already open; this request stays fully detached
      // from the navigation path.
      setLinkedWorkItemUpdateCard(sessionId, (current) =>
        current?.updatedAt === update.updatedAt && current.status === "ready"
          ? current
          : undefined,
      );

      void githubWorkItemThread(
        session.cwd,
        session.linkedWorkItem.repo,
        session.linkedWorkItem.kind,
        session.linkedWorkItem.number,
        { force: true },
      ).then(
        (thread) => {
          if (
            linkedWorkItemActivityFetches.current.get(sessionId) !==
            pending.updatedAt
          ) {
            return;
          }
          linkedWorkItemActivityFetches.current.delete(sessionId);
          if (
            linkedSessionUpdatesRef.current.get(sessionId)?.updatedAt !==
            pending.updatedAt
          ) {
            return;
          }
          setLinkedWorkItemUpdateCard(sessionId, () =>
            completeLinkedWorkItemUpdateCard(pending, thread),
          );
        },
        () => {
          if (
            linkedWorkItemActivityFetches.current.get(sessionId) !==
            pending.updatedAt
          ) {
            return;
          }
          linkedWorkItemActivityFetches.current.delete(sessionId);
          if (
            linkedSessionUpdatesRef.current.get(sessionId)?.updatedAt !==
            pending.updatedAt
          ) {
            return;
          }
          setLinkedWorkItemUpdateCard(sessionId, () =>
            failLinkedWorkItemUpdateCard(pending),
          );
        },
      );
    },
    [setLinkedWorkItemUpdateCard],
  );

  const dismissNoticesForContinuedSession = useCallback(
    (sessionId: string) => {
      const updatedAt = sessionsRef.current.find(
        (session) => session.id === sessionId,
      )?.linkedWorkItemUpdateCard?.updatedAt;
      if (updatedAt == null) return;
      markLinkedSessionUpdateSeen(sessionId, updatedAt);
      setLinkedWorkItemUpdateCard(sessionId, (card) =>
        card?.updatedAt === updatedAt ? undefined : card,
      );
    },
    [setLinkedWorkItemUpdateCard],
  );

  const onOpenLinkedWorkItem = useCallback(
    (item: LinkedWorkItem, sessionId: string) => {
      const request = linkedWorkItemPanelRequest.current + 1;
      linkedWorkItemPanelRequest.current = request;
      setFilePickerOpen(false);
      setSettingsOpen(false);
      setSearchViewOpen(false);
      const cwd =
        sessionsRef.current.find((session) => session.id === sessionId)?.cwd ??
        history.find((session) => session.id === sessionId)?.cwd ??
        sidebarCwd;
      void onSelectHistorySession(sessionId).then(() => {
        if (linkedWorkItemPanelRequest.current !== request) return;
        if (!sessionsRef.current.some((session) => session.id === sessionId)) {
          return;
        }
        setLinkedWorkItemPanels((current) => {
          const next = new Map(current);
          // Reinsert the panel so it wins if this workspace tab contains
          // multiple sessions with remembered panels.
          next.delete(sessionId);
          next.set(sessionId, { item, sessionId, cwd });
          return next;
        });
      });
    },
    [history, onSelectHistorySession, sidebarCwd],
  );

  return {
    linkedWorkItemPanels,
    setLinkedWorkItemPanels,
    closeLinkedWorkItemPanel,
    linkedSessionUpdatesRef,
    setLinkedWorkItemUpdateCard,
    revealLinkedSessionUpdate,
    dismissNoticesForContinuedSession,
    onOpenLinkedWorkItem,
  };
}
