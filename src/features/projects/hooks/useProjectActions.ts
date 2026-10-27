import { rebaseCiRepairs } from "../../source-control/model/ciRepairTracking";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, type Dispatch, type SetStateAction, type RefObject } from "react";
import { type SidebarTabId } from "../../settings/model/appearance";
import { loadProjectSidebarTab, saveProjectSidebarTab } from "../../settings/model/projectSidebarTab";
import { pickFolders } from "../../../platform/tauri/fs";
import { leafIds, newTab, type WorkspaceTab } from "../../workspace/model/layout";
import { removeTabFromGroup, tabGroupProject } from "../../workspace/model/tabGroups";
import { cancelHarnessTurn, forgetHarnessSession } from "../../../integrations/harness";
import { sessionChildHarnesses } from "../../sessions/model/handoff";
import { keepSessionChanges, notifyReviewChanged } from "../../sessions/model/checkpoint";
import { notifyDirsChanged } from "../../files/model/fileTree";
import { pathKey, projectName } from "../../../shared/lib/paths";
import { rebaseProjectData, removeProjectData } from "../model/projectData";
import { forgetProjectLocation, rememberProjectLocation } from "../model/projectLocation";
import { archiveProject, forgetProject, lastProjectPath, looksLikeProject, normalizeProjectPath, rememberProject, replaceProjectPath, sameProjectPath } from "../model/recents";
import { filterTabsForProject } from "../../workspace/model/workspaceTabGroups";
import { newDefaultSession, newSession, retargetSessionToProject, type Session } from "../../sessions/model/session";
import { rebaseProjectSessions, shouldPersistSession } from "../../sessions/data/sessionStore";
import { rememberLoadedSession } from "../../sessions/data/sessionCache";
import { isBlankSession, reconcileProjectReturn } from "../model/projectReturn";
import { planProjectOpenRun, type ProjectOpenStep } from "../model/projectOpenRun";
import { type useProjectState } from "./useProjectState";
import { type useWorkspaceTabActions } from "../../workspace/hooks/useWorkspaceTabActions";
import { type useSessionHistory } from "../../sessions/hooks/useSessionHistory";
import { type useOpenFiles } from "../../files/hooks/useOpenFiles";
import { type useTerminalDock } from "../../terminal/hooks/useTerminalDock";
import { type useAppSurfaces } from "../../../app/hooks/useAppSurfaces";
import { type LiveSessionStore } from "../../sessions/model/liveSessions";

export type UseProjectActionsDeps = {
  projectReturnRef: ReturnType<typeof useProjectState>["projectReturnRef"];
  tabsRef: RefObject<WorkspaceTab[]>;
  sessionsRef: LiveSessionStore["ref"];
  activeTabIdRef: RefObject<string>;
  activeTabId: string;
  tabs: WorkspaceTab[];
  sessions: Session[];
  recents: ReturnType<typeof useProjectState>["recents"];
  setProjectCwd: ReturnType<typeof useProjectState>["setProjectCwd"];
  setRecents: ReturnType<typeof useProjectState>["setRecents"];
  setSessions: LiveSessionStore["set"];
  sidebarTabSelection: { project: string; tab: SidebarTabId };
  sidebarCwd: string;
  sidebarCwdRef: RefObject<string>;
  setSidebarTabSelection: Dispatch<SetStateAction<{ project: string; tab: SidebarTabId }>>;
  appendTab: ReturnType<typeof useWorkspaceTabActions>["appendTab"];
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  projectOfTab: ReturnType<typeof useWorkspaceTabActions>["projectOfTab"];
  setSearchViewOpen: ReturnType<typeof useAppSurfaces>["setSearchViewOpen"];
  insertBeside: ReturnType<typeof useWorkspaceTabActions>["insertBeside"];
  activateTab: ReturnType<typeof useWorkspaceTabActions>["activateTab"];
  projectCwdRef: RefObject<string>;
  loadedSessionCache: ReturnType<typeof useSessionHistory>["loadedSessionCache"];
  sessionLoads: ReturnType<typeof useSessionHistory>["sessionLoads"];
  invalidateLoadedSession: ReturnType<typeof useSessionHistory>["invalidateLoadedSession"];
  pendingPersist: ReturnType<typeof useSessionHistory>["pendingPersist"];
  turnGen: LiveSessionStore["turnGen"];
  lastPersisted: ReturnType<typeof useSessionHistory>["lastPersisted"];
  persistSession: ReturnType<typeof useSessionHistory>["persistSession"];
  setDirtyFiles: ReturnType<typeof useOpenFiles>["setDirtyFiles"];
  setProjectTerminals: ReturnType<typeof useTerminalDock>["setProjectTerminals"];
  setHistory: ReturnType<typeof useSessionHistory>["setHistory"];
  setLoadedProjects: ReturnType<typeof useSessionHistory>["setLoadedProjects"];
  projectTerminalsRef: ReturnType<typeof useTerminalDock>["projectTerminalsRef"];
  onFileMoved: ReturnType<typeof useWorkspaceTabActions>["onFileMoved"];
};

export function useProjectActions(deps: UseProjectActionsDeps) {
  const {
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
  } = deps;
  const sidebarTab =
    sidebarTabSelection.project === pathKey(sidebarCwd)
      ? sidebarTabSelection.tab
      : loadProjectSidebarTab(sidebarCwd);

  const setSidebarTab = useCallback((tab: SidebarTabId, project?: string) => {
    const cwd = project ?? sidebarCwdRef.current;
    saveProjectSidebarTab(cwd, tab);
    setSidebarTabSelection({
      project: pathKey(cwd),
      tab,
    });
  }, []);

  const readProjectReturnMemory = useCallback(() => {
    projectReturnRef.current = reconcileProjectReturn({
      memory: projectReturnRef.current,
      tabs: tabsRef.current,
      sessions: sessionsRef.current,
      activeTabId: activeTabIdRef.current,
    });
    return projectReturnRef.current;
  }, []);

  useEffect(() => {
    readProjectReturnMemory();
  }, [activeTabId, tabs, sessions, readProjectReturnMemory]);

  useEffect(() => {
    for (const project of recents) {
      void rememberProjectLocation(project.path).catch(() => undefined);
    }
  }, [recents]);

  useEffect(() => {
    if (lastProjectPath()) return;
    void invoke<string>("default_cwd")
      .then((cwd) => {
        if (!looksLikeProject(cwd)) return;
        setProjectCwd(cwd);
        setRecents((prev) => (prev.length > 0 ? prev : rememberProject(cwd)));
        setSessions((prev) =>
          prev.map((s) => (s.cwd === "~" ? { ...s, cwd } : s)),
        );
      })
      .catch(() => {});
  }, []);

  const onCwdChange = useCallback(
    (sessionId: string, cwd: string) => {
      const normalized = normalizeProjectPath(cwd);
      const current = sessionsRef.current.find((s) => s.id === sessionId);
      const previous = current?.cwd;
      // Threads stay bound to their project. Switching from the composer opens a
      // new tab instead of retargeting the conversation.
      if (
        current &&
        previous &&
        looksLikeProject(previous) &&
        !sameProjectPath(previous, normalized) &&
        !isBlankSession(current)
      ) {
        setProjectCwd(normalized);
        setRecents(rememberProject(normalized));
        const session = newSession(
          current.harness,
          normalized,
          current.model,
          current.runtimeMode,
          current.modelSettings,
        );
        const tab = newTab(session.id);
        setSessions((prev) => [...prev, session]);
        appendTab(tab, normalized);
        setActiveTabId(tab.id);
        setComposerFocused(true);
        return;
      }
      if (
        previous &&
        !sameProjectPath(previous, normalized) &&
        previous !== "~"
      ) {
        void keepSessionChanges(sessionId, previous).catch(() => undefined);
      }
      setProjectCwd(normalized);
      setRecents(rememberProject(normalized));
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          // A blank session moving into a project adopts its provider defaults;
          // a conversation keeps its own provider.
          const base = isBlankSession(s)
            ? retargetSessionToProject(s, normalized)
            : s;
          return {
            ...base,
            cwd: normalized,
            branch: undefined,
            worktreeCwd: undefined,
            worktreeRemoved: undefined,
            workspaceMode: undefined,
            worktreeBase: undefined,
          };
        }),
      );
      // The session's project just moved in place; a group only holds tabs that
      // share one project, so drop this tab out if it no longer matches.
      setTabs((prev) => {
        const tab = prev.find((t) => leafIds(t.layout).includes(sessionId));
        // The tab's visible project follows its focused pane; a background
        // pane changing project doesn't change what the group check should see.
        if (!tab?.groupId || tab.focusedId !== sessionId) return prev;
        const newProject = projectName(normalized);
        const othersProject = tabGroupProject(
          prev.filter((t) => t.id !== tab.id),
          tab.groupId,
          projectOfTab,
        );
        if (othersProject && newProject && othersProject !== newProject) {
          return removeTabFromGroup(prev, tab.id);
        }
        return prev;
      });
      notifyReviewChanged(sessionId);
    },
    [appendTab, projectOfTab],
  );

  /**
   * Open a run of folders from one snapshot, committed in a single transition.
   *
   * Planning per folder from refs would read state React has not rendered yet,
   * so the whole run is planned first and applied here in selection order.
   */
  const openProjects = useCallback(
    (paths: readonly string[]) => {
      const steps = planProjectOpenRun({
        memory: readProjectReturnMemory(),
        tabs: tabsRef.current,
        sessions: sessionsRef.current,
        activeTabId: activeTabIdRef.current,
        paths,
      });
      const last = steps[steps.length - 1];
      if (!last) return;

      // After the early return, not before it. `pickFolders` hands back an
      // empty list when the picker is dismissed, and every path failing
      // `looksLikeProject` comes out the same way — so closing these first
      // meant cancelling a folder picker shut whatever the user had open.
      // Nothing below opens a project without also leaving one of these views.
      setSearchViewOpen(false);

      // At most one folder can take the blank session, and it keeps the
      // retargeting rules `onCwdChange` already owns.
      const blank = steps.find(
        (step): step is Extract<ProjectOpenStep, { action: "reuse-blank" }> =>
          step.action === "reuse-blank",
      );
      if (blank) onCwdChange(blank.sessionId, blank.path);

      const created = steps.filter(
        (step): step is Extract<ProjectOpenStep, { action: "create" }> =>
          step.action === "create",
      );
      if (created.length > 0) {
        setSessions((prev) => [...prev, ...created.map((step) => step.session)]);
        // Each tab sits beside the one before it in the run, so the folders keep
        // their selection order.
        setTabs((prev) =>
          created.reduce(
            (tabs, step) =>
              insertBeside(tabs, step.tab, step.besideTabId, step.path),
            prev,
          ),
        );
      }

      // The folder chosen last ends up focused.
      switch (last.action) {
        case "create":
          setProjectCwd(last.path);
          setActiveTabId(last.tab.id);
          setComposerFocused(true);
          break;
        case "activate":
          setProjectCwd(last.path);
          activateTab(last.tabId, last.paneId);
          break;
        case "keep":
          setProjectCwd(last.path);
          break;
        case "reuse-blank":
          // `onCwdChange` already moved to it.
          break;
      }
      // Every project opened is remembered, the one chosen last most recently.
      for (const step of steps) setRecents(rememberProject(step.path));
    },
    [activateTab, insertBeside, onCwdChange, readProjectReturnMemory],
  );

  const onSelectProject = useCallback(
    (path: string) => openProjects([path]),
    [openProjects],
  );

  const pickProject = useCallback(async () => {
    // Several folders can be taken at once; each opens as its own project, and
    // the last one selected ends up focused.
    openProjects(await pickFolders());
  }, [openProjects]);

  const onRemoveProject = useCallback(
    (path: string, options: { purgeData: boolean }) => {
      const normalized = normalizeProjectPath(path);
      const wasCurrent = sameProjectPath(projectCwdRef.current, normalized);
      const remaining = options.purgeData
        ? forgetProject(normalized)
        : archiveProject(normalized);
      if (options.purgeData) {
        forgetProjectLocation(normalized);
        setSidebarTabSelection((current) =>
          sameProjectPath(current.project, normalized)
            ? { project: "~", tab: loadProjectSidebarTab("~") }
            : current,
        );
      }
      setRecents(remaining);

      const tabs = tabsRef.current;
      const sessions = sessionsRef.current;
      const projectTabs = filterTabsForProject(tabs, sessions, normalized);
      const projectTabIds = new Set(projectTabs.map((tab) => tab.id));
      const projectSessions = sessions.filter((session) =>
        sameProjectPath(session.cwd, normalized),
      );
      const projectSessionIds = new Set(
        projectSessions.map((session) => session.id),
      );

      if (options.purgeData) {
        const cachedOrLoading = new Set([
          ...loadedSessionCache.current.keys(),
          ...sessionLoads.current.keys(),
        ]);
        for (const sessionId of cachedOrLoading) {
          invalidateLoadedSession(sessionId);
        }
        for (const session of projectSessions) {
          pendingPersist.current.delete(session.id);
          if (session.busy) {
            turnGen.current.set(
              session.id,
              (turnGen.current.get(session.id) ?? 0) + 1,
            );
            for (const id of sessionChildHarnesses(session)) {
              void cancelHarnessTurn(id, session.id);
            }
          }
          for (const id of sessionChildHarnesses(session)) {
            void forgetHarnessSession(id, session.id);
          }
          lastPersisted.current.delete(session.id);
        }
        void removeProjectData(normalized);
      } else {
        for (const session of projectSessions) {
          if (session.busy) continue;
          if (shouldPersistSession(session)) {
            rememberLoadedSession(loadedSessionCache.current, session);
          }
          persistSession(session);
          pendingPersist.current.delete(session.id);
          for (const id of sessionChildHarnesses(session)) {
            void forgetHarnessSession(id, session.id);
          }
        }
      }

      let nextTabs = tabs.filter((tab) => !projectTabIds.has(tab.id));
      let nextSessions = sessions.filter((session) => {
        if (!projectSessionIds.has(session.id)) return true;
        return !options.purgeData && session.busy;
      });
      let nextActiveTabId = activeTabIdRef.current;

      if (nextTabs.length === 0) {
        const fallback = nextSessions[0];
        const session = newDefaultSession("~", fallback?.runtimeMode);
        const tab = newTab(session.id);
        nextSessions = [...nextSessions, session];
        nextTabs = [tab];
        nextActiveTabId = tab.id;
      } else if (projectTabIds.has(nextActiveTabId)) {
        nextActiveTabId = nextTabs[0]?.id ?? nextActiveTabId;
      }

      sessionsRef.current = nextSessions;
      tabsRef.current = nextTabs;
      activeTabIdRef.current = nextActiveTabId;
      setSessions(nextSessions);
      setTabs(nextTabs);
      if (nextActiveTabId !== activeTabId) {
        setActiveTabId(nextActiveTabId);
      }
      setDirtyFiles((prev) => {
        const updated = new Set(prev);
        for (const tab of projectTabs) {
          for (const file of [
            ...tab.editorPanes.flatMap((pane) => pane.files),
            ...(tab.terminalPanes ?? []).flatMap((pane) => pane.files),
          ]) {
            updated.delete(file.id);
          }
        }
        return updated;
      });
      setProjectTerminals((prev) =>
        prev.filter((dock) => !sameProjectPath(dock.projectPath, normalized)),
      );

      if (wasCurrent) {
        const next = remaining.find((item) => looksLikeProject(item.path));
        if (next) {
          onSelectProject(next.path);
          setProjectCwd(next.path);
        } else {
          setProjectCwd("~");
          setComposerFocused(true);
        }
      }
    },
    [activeTabId, invalidateLoadedSession, onSelectProject, persistSession],
  );

  const onRestoreProject = useCallback(
    (path: string) => {
      setRecents(rememberProject(path));
      onSelectProject(path);
    },
    [onSelectProject],
  );

  const applyProjectLocationChange = useCallback(
    async (from: string, to: string) => {
      await rebaseProjectSessions(from, to);
      rebaseCiRepairs(from, to);

      const nextSessions = sessionsRef.current.map((session) =>
        sameProjectPath(session.cwd, from) ? { ...session, cwd: to } : session,
      );
      sessionsRef.current = nextSessions;
      setSessions(nextSessions);
      for (const [id, session] of loadedSessionCache.current) {
        if (sameProjectPath(session.cwd, from)) {
          loadedSessionCache.current.set(id, { ...session, cwd: to });
        }
      }
      for (const [id, session] of pendingPersist.current) {
        if (sameProjectPath(session.cwd, from)) {
          pendingPersist.current.set(id, { ...session, cwd: to });
        }
      }
      setHistory((current) =>
        current.map((session) =>
          sameProjectPath(session.cwd, from)
            ? { ...session, cwd: to }
            : session,
        ),
      );
      setLoadedProjects((current) => {
        const next = new Set(current);
        next.delete(normalizeProjectPath(from));
        next.add(normalizeProjectPath(to));
        return next;
      });

      if (sameProjectPath(projectCwdRef.current, from)) {
        projectCwdRef.current = to;
        setProjectCwd(to);
      }
      const nextDocks = projectTerminalsRef.current.map((dock) =>
        sameProjectPath(dock.projectPath, from)
          ? { ...dock, projectPath: to }
          : dock,
      );
      projectTerminalsRef.current = nextDocks;
      setProjectTerminals(nextDocks);
      rebaseProjectData(from, to);
      setSidebarTabSelection((current) =>
        sameProjectPath(current.project, from)
          ? { ...current, project: pathKey(to) }
          : current,
      );
      setRecents(replaceProjectPath(from, to));
      onFileMoved(from, to);
      notifyDirsChanged();
    },
    [onFileMoved],
  );

  return { readProjectReturnMemory, sidebarTab, setSidebarTab, onCwdChange, onSelectProject, pickProject, onRemoveProject, onRestoreProject, applyProjectLocationChange };
}
