import { useCallback, useEffect, useMemo, useRef } from "react";
import type { useLinkedWorkItemPanels } from "../../github/hooks/useLinkedWorkItemPanels";
import { hiddenApprovalNotices } from "../../notifications/model/approvalToast";
import { syncDockBadge } from "../../notifications/model/dockBadge";
import { loadNotificationsEnabled, probeNotificationPermission } from "../../notifications/model/notifications";
import { respondHarnessApproval, respondHarnessQuestion, keepHarnessQuestionOpen, type ApprovalDecision, type UserQuestionReply } from "../../../integrations/harness";
import { liveAgentsFromSessions } from "../model/liveAgents";
import { nextUnseenFinishedSessions } from "../model/sessionDone";
import { sessionNeedsInput, type Session } from "../model/session";
import { type LiveSessionStore } from "../model/liveSessions";
import { type WorkspaceTab } from "../../workspace/model/layout";

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

export type UseSessionIndicatorsDeps = {
  sessions: Session[];
  sessionsRef: LiveSessionStore["ref"];
  setSessions: LiveSessionStore["set"];
  activeSessionId: string | undefined;
  activeTabId: string;
  tabs: WorkspaceTab[];
  composerFocused: boolean;
  liveAgentsEnabled: boolean;
  setLinkedWorkItemUpdateCard: ReturnType<typeof useLinkedWorkItemPanels>["setLinkedWorkItemUpdateCard"];
};

export function useSessionIndicators(deps: UseSessionIndicatorsDeps) {
  const {
    sessions,
    sessionsRef,
    setSessions,
    activeSessionId,
    activeTabId,
    tabs,
    composerFocused,
    liveAgentsEnabled,
    setLinkedWorkItemUpdateCard,
  } = deps;

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

  return {
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
  };
}
