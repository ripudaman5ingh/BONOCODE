import { ciRepairSessions } from "../model/ciRepairSessions";
import { useCallback, useMemo, type Dispatch, type SetStateAction, type RefObject } from "react";
import { assertWorktreeFilesClosed, detachSessionWorktree, checkWorktreeRemoval, listWorktrees, removeWorktree, sessionInWorktree, worktreeSessionIds, type Worktree } from "../model/worktrees";
import { notifyGitChanged, type GitFileDiffKind, type GitHistoryCommit } from "../../../platform/tauri/fs";
import { rememberOpenedFile, resolveOpenablePath } from "../../files/model/fileIndex";
import { newFileTab, newTab, openChangesTab, openCommitTab, openEditorTab, openSessionChangesTab, type FilePaneTab, type WorkspaceTab } from "../../workspace/model/layout";
import { bindHarnessSession, forgetHarnessSession, stopStreaming } from "../../../integrations/harness";
import { sessionChildHarnesses } from "../../sessions/model/handoff";
import { flushSessionCheckpoint, keepSessionChanges, notifyReviewChanged } from "../../sessions/model/checkpoint";
import { isEqualOrInside, pathKey } from "../../../shared/lib/paths";
import { rememberProject } from "../../projects/model/recents";
import { sessionWorkCwd, type WorkspaceMode, type Session } from "../../sessions/model/session";
import { shouldPersistSession, upsertSession, flushSessionWrites, type SessionSummary } from "../../sessions/data/sessionStore";
import { loadDiffViewer } from "../../settings/model/settings";
import { isBlankSession } from "../../projects/model/projectReturn";
import { bindResumedSessions } from "../../../app/model/appLifecycle";
import { type useWorkspaceTabActions } from "../../workspace/hooks/useWorkspaceTabActions";
import { type useSessionHistory } from "../../sessions/hooks/useSessionHistory";
import { type useTerminalDock } from "../../terminal/hooks/useTerminalDock";
import { type LiveSessionStore } from "../../sessions/model/liveSessions";
import { type SidebarTabId } from "../../settings/model/appearance";
import { type useProjectState } from "../../projects/hooks/useProjectState";


export function filesInWorkspaceTabs(tabs: readonly WorkspaceTab[]): FilePaneTab[] {
  return tabs.flatMap((tab) => [
    ...tab.editorPanes.flatMap((pane) => pane.files),
    ...(tab.terminalPanes ?? []).flatMap((pane) => pane.files),
  ]);
}

export type UseWorktreeActionsDeps = {
  history: ReturnType<typeof useSessionHistory>["history"];
  sessions: Session[];
  tabsRef: RefObject<WorkspaceTab[]>;
  projectTerminalsRef: ReturnType<typeof useTerminalDock>["projectTerminalsRef"];
  removingWorktreePaths: RefObject<Set<string>>;
  switchingWorktrees: RefObject<Map<string, string>>;
  sessionsRef: LiveSessionStore["ref"];
  removingSessionIds: RefObject<Set<string>>;
  pendingPersist: ReturnType<typeof useSessionHistory>["pendingPersist"];
  invalidateLoadedSession: ReturnType<typeof useSessionHistory>["invalidateLoadedSession"];
  stopSessionForRemoval: (sessionId: string) => Promise<Session | undefined>;
  setSessions: LiveSessionStore["set"];
  projectCwdRef: RefObject<string>;
  setProjectCwd: Dispatch<SetStateAction<string>>;
  setRecents: ReturnType<typeof useProjectState>["setRecents"];
  lastPersisted: ReturnType<typeof useSessionHistory>["lastPersisted"];
  setHistory: ReturnType<typeof useSessionHistory>["setHistory"];
  appendTab: ReturnType<typeof useWorkspaceTabActions>["appendTab"];
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  refreshHistory: ReturnType<typeof useSessionHistory>["refreshHistory"];
  persistSession: ReturnType<typeof useSessionHistory>["persistSession"];
  gitCwdRef: RefObject<string>;
  sidebarCwdRef: RefObject<string>;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  activeTabId: string;
  setSidebarTab: (tab: SidebarTabId, project?: string) => void;
};

export function useWorktreeActions(deps: UseWorktreeActionsDeps) {
  const {
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
  } = deps;
  const onOpenDiff = useCallback(
    (
      path?: string,
      session?: { sessionId: string; cwd: string },
      changeKind?: GitFileDiffKind,
      pin = false,
    ) => {
      void (async () => {
        const diffCwd = session?.cwd ?? gitCwdRef.current;
        const diffProjectCwd = session
          ? sessionsRef.current.find((entry) => entry.id === session.sessionId)
              ?.cwd
          : sidebarCwdRef.current;
        const resolved = path
          ? ((await resolveOpenablePath(diffCwd, path)) ?? path)
          : undefined;
        if (resolved) rememberOpenedFile(diffCwd, resolved);
        setTabs((prev) =>
          prev.map((tab) => {
            if (tab.id !== activeTabId) return tab;
            if (session) {
              return openSessionChangesTab(
                tab,
                session.cwd,
                session.sessionId,
                resolved,
                diffProjectCwd,
                pin,
              );
            }
            if (loadDiffViewer() === "unified") {
              return openChangesTab(
                tab,
                diffCwd,
                resolved,
                changeKind,
                diffProjectCwd,
              );
            }
            if (!resolved) return tab;
            return openEditorTab(
              tab,
              newFileTab(resolved, diffCwd, true, changeKind, diffProjectCwd),
              { pin },
            );
          }),
        );
        setSidebarTab("changes", diffProjectCwd);
        setComposerFocused(false);
      })();
    },
    [activeTabId],
  );

  /** Stack one section's working-tree changes in one review, whatever the diff-view setting. */
  const onOpenAllChanges = useCallback((kind: GitFileDiffKind) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId
          ? openChangesTab(
              tab,
              gitCwdRef.current,
              undefined,
              kind,
              sidebarCwdRef.current,
            )
          : tab,
      ),
    );
    setComposerFocused(false);
  }, [activeTabId]);

  const onOpenCommit = useCallback(
    (commit: GitHistoryCommit, pin?: boolean) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId
            ? openCommitTab(
                tab,
                gitCwdRef.current,
                {
                  sha: commit.sha,
                  shortSha: commit.shortSha,
                  subject: commit.subject,
                },
                sidebarCwdRef.current,
                pin,
              )
            : tab,
        ),
      );
      setComposerFocused(false);
    },
    [activeTabId],
  );

  const checkOpenWorktreeFiles = useCallback((path: string) => {
    assertWorktreeFilesClosed(path, [
      ...filesInWorkspaceTabs(tabsRef.current),
      ...projectTerminalsRef.current.flatMap((dock) => dock.pane.files),
    ]);
  }, []);

  const onCheckWorktreeRemoval = useCallback(
    async (cwd: string, path: string, force: boolean) => {
      checkOpenWorktreeFiles(path);
      await checkWorktreeRemoval(cwd, path, force);
      // Re-read UI state after the native check, before deleting sessions.
      checkOpenWorktreeFiles(path);
    },
    [checkOpenWorktreeFiles],
  );

  const onRemoveWorktree = useCallback(
    async (cwd: string, path: string, force: boolean, keepSessions = false) => {
      if (removingWorktreePaths.current.has(path)) {
        throw new Error("This worktree is already being deleted.");
      }
      removingWorktreePaths.current.add(path);
      const lockedIds = new Set<string>();
      const forgottenIds = new Set<string>();
      try {
        if (
          [...switchingWorktrees.current.values()].some((target) =>
            isEqualOrInside(target, path),
          )
        ) {
          throw new Error(
            "A session is selecting this worktree. Try deleting it again once selection finishes.",
          );
        }
        await onCheckWorktreeRemoval(cwd, path, force);
        const listed = await listWorktrees(cwd);
        const tree = listed.worktrees.find(
          (entry) => pathKey(entry.path) === pathKey(path),
        );
        if (!tree) throw new Error("This worktree is no longer available.");
        const ids = worktreeSessionIds(tree, sessionsRef.current);
        if (!keepSessions && ids.length) {
          throw new Error(
            "Move or delete the sessions using this worktree first.",
          );
        }
        if (
          ids.some(
            (id) =>
              removingSessionIds.current.has(id) ||
              switchingWorktrees.current.has(id),
          )
        ) {
          throw new Error(
            "Wait for these sessions to finish changing before deleting the worktree.",
          );
        }
        for (const id of ids) {
          removingSessionIds.current.add(id);
          lockedIds.add(id);
          pendingPersist.current.delete(id);
          invalidateLoadedSession(id);
        }
        for (const id of ids) {
          await stopSessionForRemoval(id);
          const session = sessionsRef.current.find((entry) => entry.id === id);
          if (!session) continue;
          await flushSessionCheckpoint(id);
          forgottenIds.add(id);
          for (const harness of sessionChildHarnesses(session)) {
            await forgetHarnessSession(harness, id);
          }
          const latest = sessionsRef.current.find((entry) => entry.id === id);
          if (!latest) continue;
          const stopped = {
            ...stopStreaming(latest),
            busy: false,
            queueStatus: "paused" as const,
            pendingQuestion: undefined,
          };
          sessionsRef.current = sessionsRef.current.map((entry) =>
            entry.id === id ? stopped : entry,
          );
          setSessions(sessionsRef.current);
          if (shouldPersistSession(stopped)) await upsertSession(stopped);
        }
        await flushSessionWrites();
        checkOpenWorktreeFiles(path);
        const removed = await removeWorktree(cwd, path, force, keepSessions);
        const affected = new Set([...ids, ...removed.sessionIds]);
        if (isEqualOrInside(projectCwdRef.current, path)) {
          setProjectCwd(removed.projectCwd);
          setRecents(rememberProject(removed.projectCwd));
        }
        for (const id of affected) {
          invalidateLoadedSession(id);
          pendingPersist.current.delete(id);
          lastPersisted.current.delete(id);
        }
        sessionsRef.current = sessionsRef.current.map((session) =>
          affected.has(session.id)
            ? detachSessionWorktree(session, removed.projectCwd, path)
            : session,
        );
        setSessions(sessionsRef.current);
        const patchSummary = (entry: SessionSummary) =>
          affected.has(entry.id)
            ? detachSessionWorktree(entry, removed.projectCwd, path)
            : entry;
        setHistory((current) => current.map(patchSummary));
        for (const id of affected) notifyReviewChanged(id);
      } catch (error) {
        // Removal may fail after idle agent processes were stopped. Rebind
        // their saved threads so the unchanged working copy can still resume.
        const kept = sessionsRef.current.filter(
          (session) => forgottenIds.has(session.id) && !session.worktreeRemoved,
        );
        bindResumedSessions(kept);
        for (const session of kept) {
          const pending = session.pendingSwitch;
          if (pending?.fromProviderSessionId) {
            bindHarnessSession(
              pending.from,
              session.id,
              pending.fromProviderSessionId,
              sessionWorkCwd(session),
              pending.fromProviderAccountId,
              session.blocks,
            );
          }
        }
        throw error;
      } finally {
        removingWorktreePaths.current.delete(path);
        for (const id of lockedIds) removingSessionIds.current.delete(id);
      }
    },
    [
      checkOpenWorktreeFiles,
      invalidateLoadedSession,
      onCheckWorktreeRemoval,
      stopSessionForRemoval,
    ],
  );

  const onBranchChange = useCallback(
    (sessionId: string) => {
      notifyGitChanged();
      const current = sessionsRef.current.find((s) => s.id === sessionId);
      if (!current) return;
      void forgetHarnessSession(current.harness, sessionId);
      const next = {
        ...current,
        branch: undefined,
        providerSessionId: undefined,
        context: undefined,
      };
      sessionsRef.current = sessionsRef.current.map((s) =>
        s.id === sessionId ? next : s,
      );
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? next : s)));
      persistSession(next);
      notifyReviewChanged(sessionId);
    },
    [persistSession],
  );

  const onWorkspaceModeChange = useCallback(
    (sessionId: string, mode: WorkspaceMode, base?: string) => {
      setSessions((prev) =>
        prev.map((session) => {
          if (
            session.id !== sessionId ||
            (!isBlankSession(session) &&
              !(session.workspaceMode && !session.worktreeCwd && !session.busy))
          ) {
            return session;
          }
          return mode === "worktree"
            ? base || session.worktreeBase
              ? {
                  ...session,
                  workspaceMode: "worktree",
                  worktreeBase: base || session.worktreeBase,
                }
              : session
            : {
                ...session,
                workspaceMode: undefined,
                worktreeBase: undefined,
              };
        }),
      );
    },
    [],
  );

  const onWorktreeBaseChange = useCallback(
    (sessionId: string, base: string) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId &&
          (isBlankSession(session) ||
            (!!session.workspaceMode &&
              !session.worktreeCwd &&
              !session.busy)) &&
          session.workspaceMode === "worktree"
            ? { ...session, worktreeBase: base }
            : session,
        ),
      );
    },
    [],
  );

  const onWorktreeChange = useCallback(
    async (sessionId: string, tree: Worktree) => {
      const current = sessionsRef.current.find((s) => s.id === sessionId);
      if (
        !current ||
        current.busy ||
        removingSessionIds.current.has(sessionId) ||
        switchingWorktrees.current.has(sessionId)
      ) {
        throw new Error(
          "Wait for this session to finish before changing working copies.",
        );
      }
      if (
        !current.worktreeRemoved &&
        pathKey(sessionWorkCwd(current)) === pathKey(tree.path)
      )
        return;
      if (
        [...removingWorktreePaths.current].some((path) =>
          isEqualOrInside(tree.path, path),
        )
      ) {
        throw new Error(
          "This worktree is being deleted. Select another working copy.",
        );
      }
      if (!current.worktreeRemoved && current.queuedMessages?.length) {
        throw new Error(
          "Clear queued messages before changing working copies.",
        );
      }
      switchingWorktrees.current.set(sessionId, tree.path);
      pendingPersist.current.delete(sessionId);
      try {
        const listed = await listWorktrees(current.cwd);
        const target = listed.worktrees.find(
          (entry) =>
            pathKey(entry.path) === pathKey(tree.path) && !entry.missing,
        );
        if (!target) {
          throw new Error(
            "This worktree is no longer available. Refresh the picker.",
          );
        }
        const source = sessionsRef.current.find((s) => s.id === sessionId);
        if (
          !source ||
          source.busy ||
          source.cwd !== current.cwd ||
          sessionWorkCwd(source) !== sessionWorkCwd(current)
        ) {
          throw new Error(
            "The session changed. Try selecting the working copy again.",
          );
        }
        const selected = sessionInWorktree(source, target);
        if (selected.id !== sessionId) {
          // Leave the original conversation, checkpoints, and live provider
          // context attached to the files they describe.
          const tab = newTab(selected.id);
          sessionsRef.current = [...sessionsRef.current, selected];
          setSessions(sessionsRef.current);
          appendTab(tab, selected.cwd);
          setActiveTabId(tab.id);
          setComposerFocused(true);
          return;
        }
        await flushSessionCheckpoint(sessionId);
        for (const harness of sessionChildHarnesses(source)) {
          await forgetHarnessSession(harness, sessionId);
        }
        const latest = sessionsRef.current.find((s) => s.id === sessionId);
        if (
          !latest ||
          (!latest.worktreeRemoved && !isBlankSession(latest)) ||
          latest.cwd !== current.cwd ||
          sessionWorkCwd(latest) !== sessionWorkCwd(current)
        ) {
          throw new Error(
            "The session changed. Try selecting the working copy again.",
          );
        }
        const next = sessionInWorktree(latest, target);
        if (latest.worktreeRemoved)
          await keepSessionChanges(sessionId, target.path);
        pendingPersist.current.delete(sessionId);
        if (shouldPersistSession(next)) await upsertSession(next);
        invalidateLoadedSession(sessionId);
        sessionsRef.current = sessionsRef.current.map((s) =>
          s.id === sessionId ? next : s,
        );
        setSessions(sessionsRef.current);
        notifyGitChanged();
        notifyReviewChanged(sessionId);
        void refreshHistory(next.cwd);
      } finally {
        switchingWorktrees.current.delete(sessionId);
      }
    },
    [appendTab, invalidateLoadedSession, refreshHistory],
  );

  const repairSessions = useMemo(
    () => ciRepairSessions(history, sessions),
    [history, sessions],
  );

  return { repairSessions, onCheckWorktreeRemoval, onRemoveWorktree, onWorktreeChange, onBranchChange, onWorkspaceModeChange, onWorktreeBaseChange, onOpenDiff, onOpenAllChanges, onOpenCommit };
}
