import { useCallback } from "react";
import { isPreparingHandoff } from "../../features/sessions/model/handoff";
import { newDefaultSession, type LinkedWorkItem, type Session } from "../../features/sessions/model/session";
import { linkedWorkItemFromInboxItem } from "../../features/sessions/model/sessionWorkItem";
import { sameProjectPath } from "../../features/projects/model/recents";
import { trackCiRepair } from "../../features/source-control/model/ciRepairTracking";
import type { CiRepairRequest } from "../../features/source-control/model/ciRepair";
import type { InboxItem } from "../../features/github/model/githubTasks";
import type { LiveSessionStore } from "../../features/sessions/model/liveSessions";
import type { useAppSurfaces } from "./useAppSurfaces";
import type { useProjectActions } from "../../features/projects/hooks/useProjectActions";
import type { useSessionHistory } from "../../features/sessions/hooks/useSessionHistory";
import type { useSessionLifecycle } from "../../features/sessions/hooks/useSessionLifecycle";
import type { useTurnController } from "../../features/sessions/hooks/useTurnController";

export type UseNavigationActionsDeps = {
  sessionDefaults: Session | undefined;
  sessionsRef: LiveSessionStore["ref"];
  setSessions: LiveSessionStore["set"];
  ensureOpenSession: ReturnType<typeof useSessionHistory>["ensureOpenSession"];
  onSelectHistorySession: ReturnType<typeof useSessionLifecycle>["onSelectHistorySession"];
  onSubmit: ReturnType<typeof useTurnController>["onSubmit"];
  setSearchViewOpen: ReturnType<typeof useAppSurfaces>["setSearchViewOpen"];
  setSidebarTab: ReturnType<typeof useProjectActions>["setSidebarTab"];
  openSettings: ReturnType<typeof useAppSurfaces>["openSettings"];
};

export function useNavigationActions(deps: UseNavigationActionsDeps) {
  const {
    sessionDefaults,
    sessionsRef,
    setSessions,
    ensureOpenSession,
    onSelectHistorySession,
    onSubmit,
    setSearchViewOpen,
    setSidebarTab,
    openSettings,
  } = deps;

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

  const onManageWorktrees = useCallback(
    () => openSettings("worktrees"),
    [openSettings],
  );

  return {
    startCiRepair,
    onRepairChecks,
    onOpenSettings,
    onManageWorktrees,
  };
}
