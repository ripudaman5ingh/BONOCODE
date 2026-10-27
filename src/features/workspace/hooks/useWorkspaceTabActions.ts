import { flushSync } from "react-dom";
import { ask } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction, type RefObject } from "react";
import { basename } from "../../../platform/tauri/fs";
import { invalidateProjectFiles, rememberOpenedFile, resolveFileOpenRequest } from "../../files/model/fileIndex";
import { closeLeaf, closeSurfacePanes, findSurfacePane, firstLeafId, isolateTerminalPanes, isFilesystemTab, leaf, leafIds, movePane, newEditorWorkspaceTab, newFileTab, newPlanTab, openEditorTab, pinEditorFile, openWorkspaceFile, removePane, resetTabToSession, siblingLeafId, splitPane, surfacePanes, withSurfacePanes, type EditorPane, type PaneEdge, type SplitDir, type WorkspaceTab } from "../model/layout";
import { mergeOrderedSubset, orderByIds } from "../../../shared/lib/reorder";
import { applyGroupedReorder, insertTabBesideActive } from "../model/tabGroups";
import { confirmCloseTerminal, confirmCloseTerminals } from "../../terminal/model/terminalClose";
import { type OpenFileFn } from "../../search/model/search";
import { planTitle } from "../../sessions/model/plan";
import { isEqualOrInside, projectName, rebasePath } from "../../../shared/lib/paths";
import { looksLikeProject, normalizeProjectPath, rememberProject, sameProjectPath } from "../../projects/model/recents";
import { applyDetachPaneToTab, filterTabsForProject, planWorkspaceTabClose, workspaceTabCwd, focusedWorkspaceTabCwd } from "../model/workspaceTabGroups";
import { newDefaultSession, newSession, sessionWorkCwd, type Session } from "../../sessions/model/session";
import { saveWorkspaceSnapshot } from "../../sessions/data/sessionStore";
import { canTabVisitBack, canTabVisitForward, pruneTabVisitHistory, recordTabVisit, tabVisitBack, tabVisitForward, type TabVisitHistory } from "../model/tabVisitHistory";
import { loadFileTabMode } from "../../settings/model/settings";
import { isBlankSession, reconcileProjectReturn, type ProjectReturnMemory } from "../../projects/model/projectReturn";
import { collectWorkspaceSnapshot, workspaceSnapshotKey } from "../model/workspaceSnapshot";
import { type useProjectState } from "../../projects/hooks/useProjectState";
import { type useSessionHistory } from "../../sessions/hooks/useSessionHistory";
import { type useOpenFiles } from "../../files/hooks/useOpenFiles";
import { type useTerminalDock } from "../../terminal/hooks/useTerminalDock";
import { type LiveSessionStore } from "../../sessions/model/liveSessions";
import { type WindowTransferPayload } from "../../../app/model/windowTransfer";


export /** Native sheet. `window.confirm` is swallowed when a macOS menu accelerator fires. */
function confirmDiscardUnsaved(message: string): Promise<boolean> {
  return ask(message, { title: "Bonocode", kind: "warning" });
}

export function isBlankWorkspaceTab(tab: WorkspaceTab, sessions: Session[]): boolean {
  if (tab.editorPanes.some((pane) => pane.files.length > 0)) return false;
  if ((tab.terminalPanes ?? []).some((pane) => pane.files.length > 0))
    return false;
  const ids = leafIds(tab.layout);
  if (ids.length !== 1) return false;
  return isBlankSession(sessions.find((entry) => entry.id === ids[0]));
}

export function dropOpenFiles(
  tab: WorkspaceTab,
  shouldDrop: (path: string) => boolean,
): WorkspaceTab {
  let layout = tab.layout;
  let focusedId = tab.focusedId;
  const editorPanes: EditorPane[] = [];
  for (const pane of tab.editorPanes) {
    const files = pane.files.filter(
      (file) =>
        !isFilesystemTab(file) || !shouldDrop(file.path),
    );
    if (files.length === 0) {
      const sibling = siblingLeafId(layout, pane.id);
      const withoutPane = removePane(layout, pane.id);
      if (withoutPane) {
        layout = withoutPane;
        if (focusedId === pane.id)
          focusedId = sibling ?? firstLeafId(withoutPane);
      }
      continue;
    }
    editorPanes.push({
      ...pane,
      files,
      activeFileId: files.some((file) => file.id === pane.activeFileId)
        ? pane.activeFileId
        : files[0].id,
    });
  }
  return { ...tab, layout, focusedId, editorPanes };
}

export type UseWorkspaceTabActionsDeps = {
  tabProjectsRef: RefObject<Map<string, string>>;
  tabsRef: RefObject<WorkspaceTab[]>;
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  sessionsRef: LiveSessionStore["ref"];
  projectCwdRef: RefObject<string>;
  setProjectCwd: Dispatch<SetStateAction<string>>;
  setRecents: ReturnType<typeof useProjectState>["setRecents"];
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  tabVisitRef: RefObject<TabVisitHistory>;
  setTabVisitNav: Dispatch<SetStateAction<{ canBack: boolean; canForward: boolean }>>;
  tabs: WorkspaceTab[];
  activeTabId: string;
  tabVisitFromHistoryRef: RefObject<boolean>;
  activeTabIdRef: RefObject<string>;
  activeTab: WorkspaceTab;
  sessionDefaults: Session | undefined;
  projectCwd: string;
  setSessions: LiveSessionStore["set"];
  tabCloseScope: "project";
  dirtyFilesRef: ReturnType<typeof useOpenFiles>["dirtyFilesRef"];
  persistSession: ReturnType<typeof useSessionHistory>["persistSession"];
  setDirtyFiles: ReturnType<typeof useOpenFiles>["setDirtyFiles"];
  refreshHistory: ReturnType<typeof useSessionHistory>["refreshHistory"];
  sidebarCwd: string;
  sessions: Session[];
  setProjectTerminalFocused: Dispatch<SetStateAction<boolean>>;
  gitCwdRef: RefObject<string>;
  sidebarCwdRef: RefObject<string>;
  editorNavigationToken: ReturnType<typeof useOpenFiles>["editorNavigationToken"];
  setEditorNavigation: ReturnType<typeof useOpenFiles>["setEditorNavigation"];
  windowTransfer: WindowTransferPayload | null;
  projectReturnRef: RefObject<ProjectReturnMemory>;
  projectTerminals: ReturnType<typeof useTerminalDock>["projectTerminals"];
  lastDockSide: ReturnType<typeof useTerminalDock>["lastDockSide"];
  workspaceSyncKey: RefObject<string | null>;
};

export function useWorkspaceTabActions(deps: UseWorkspaceTabActionsDeps) {
  const {
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
  } = deps;
  const projectOfTab = useCallback(
    (id: string) => tabProjectsRef.current.get(id),
    [],
  );

  const onPinFile = useCallback((fileId: string) => {
    setTabs((prev) => {
      const next = prev.map((tab) => pinEditorFile(tab, fileId));
      return next.some((tab, index) => tab !== prev[index]) ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (windowTransfer) return;
    const snapshot = collectWorkspaceSnapshot(
      tabs,
      sessions,
      activeTabId,
      projectCwd,
      reconcileProjectReturn({
        memory: projectReturnRef.current,
        tabs,
        sessions,
        activeTabId,
      }),
      projectTerminals,
      lastDockSide ?? undefined,
    );
    const key = workspaceSnapshotKey(snapshot);
    if (workspaceSyncKey.current === key) return;
    workspaceSyncKey.current = key;
    const timer = window.setTimeout(() => {
      void saveWorkspaceSnapshot(snapshot).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    tabs,
    sessions,
    activeTabId,
    projectCwd,
    projectTerminals,
    lastDockSide,
    windowTransfer,
  ]);

  useEffect(() => {
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((tab) => {
        const isolated = isolateTerminalPanes(tab);
        if (isolated !== tab) changed = true;
        return isolated;
      });
      return changed ? next : prev;
    });
  }, [tabs]);

  const activateTab = useCallback((id: string, paneId?: string) => {
    const tab = tabsRef.current.find((entry) => entry.id === id);
    const nextFocusedId =
      tab &&
      paneId &&
      (leafIds(tab.layout).includes(paneId) ||
        tab.editorPanes.some((entry) => entry.id === paneId) ||
        (tab.terminalPanes ?? []).some((entry) => entry.id === paneId))
        ? paneId
        : tab?.focusedId;

    setActiveTabId(id);
    if (tab && nextFocusedId && nextFocusedId !== tab.focusedId) {
      setTabs((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? { ...entry, focusedId: nextFocusedId, diffFocused: false }
            : entry,
        ),
      );
    }

    if (tab) {
      const focusedTab = nextFocusedId
        ? { ...tab, focusedId: nextFocusedId }
        : tab;
      const cwd = focusedWorkspaceTabCwd(focusedTab, sessionsRef.current);
      if (cwd && looksLikeProject(cwd)) {
        const normalized = normalizeProjectPath(cwd);
        if (!sameProjectPath(normalized, projectCwdRef.current)) {
          setProjectCwd(normalized);
          setRecents(rememberProject(normalized));
        }
      }
    }
    setComposerFocused(
      !!nextFocusedId &&
        sessionsRef.current.some((session) => session.id === nextFocusedId),
    );
  }, []);

  const commitTabVisit = useCallback((history: TabVisitHistory) => {
    tabVisitRef.current = history;
    const canBack = canTabVisitBack(history);
    const canForward = canTabVisitForward(history);
    setTabVisitNav((prev) =>
      prev.canBack === canBack && prev.canForward === canForward
        ? prev
        : { canBack, canForward },
    );
  }, []);

  useEffect(() => {
    const openIds = new Set(tabs.map((tab) => tab.id));
    let next = pruneTabVisitHistory(tabVisitRef.current, openIds, activeTabId);
    if (tabVisitFromHistoryRef.current) {
      tabVisitFromHistoryRef.current = false;
    } else if (next.current !== activeTabId) {
      next = recordTabVisit(next, activeTabId);
    }
    commitTabVisit(pruneTabVisitHistory(next, openIds, activeTabId));
  }, [activeTabId, commitTabVisit, tabs]);

  /** `cwd` scopes group inheritance: a tab from another project starts alone. */
  const insertBeside = useCallback(
    (
      prev: WorkspaceTab[],
      tab: WorkspaceTab,
      anchorId: string | undefined,
      cwd?: string,
    ) =>
      insertTabBesideActive(prev, tab, anchorId, (id) =>
        id === tab.id ? (cwd ? projectName(cwd) : undefined) : projectOfTab(id),
      ),
    [projectOfTab],
  );

  const insertBesideActive = useCallback(
    (prev: WorkspaceTab[], tab: WorkspaceTab, cwd?: string) =>
      insertBeside(prev, tab, activeTabIdRef.current, cwd),
    [insertBeside],
  );

  const appendTab = useCallback(
    (tab: WorkspaceTab, cwd?: string) => {
      setTabs((prev) => insertBesideActive(prev, tab, cwd));
    },
    [insertBesideActive],
  );

  const onSplit = useCallback(
    (dir: SplitDir) => {
      if (!activeTab) return;
      const session = newDefaultSession(
        sessionDefaults?.cwd ?? projectCwd,
        sessionDefaults?.runtimeMode,
      );
      setSessions((prev) => [...prev, session]);
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== activeTab.id) return t;
          return {
            ...t,
            layout: splitPane(t.layout, t.focusedId, dir, session.id),
            focusedId: session.id,
          };
        }),
      );
      setComposerFocused(true);
    },
    [activeTab, projectCwd, sessionDefaults?.cwd, sessionDefaults?.runtimeMode],
  );

  const onCloseTab = useCallback(
    (id: string, opts?: { confirmedTerminalIds?: string[] }) => {
      const current = tabsRef.current;
      const index = current.findIndex((t) => t.id === id);
      if (index < 0) return;
      const closePlan = planWorkspaceTabClose({
        tabs: current,
        sessions: sessionsRef.current,
        closingTabId: id,
        scope: tabCloseScope,
      });
      if (closePlan.action === "keep") return;
      const closing = current[index];
      const closingFiles = [
        ...closing.editorPanes.flatMap((pane) => pane.files),
        ...(closing.terminalPanes ?? []).flatMap((pane) => pane.files),
      ];
      const unsaved = closingFiles.filter(
        (file) => isFilesystemTab(file) && dirtyFilesRef.current.has(file.id),
      );
      const confirmed = new Set(opts?.confirmedTerminalIds ?? []);
      const terminals = closingFiles.filter(
        (file) => file.terminal && !confirmed.has(file.id),
      );

      const finishClose = () => {
        const nextActiveTabId = closePlan.nextActiveTabId;
        const next = current.filter((t) => t.id !== id);
        const gone = new Set(
          leafIds(closing.layout).filter((paneId) =>
            sessionsRef.current.some((session) => session.id === paneId),
          ),
        );
        for (const sessionId of gone) {
          persistSession(sessionsRef.current.find((s) => s.id === sessionId));
        }
        setDirtyFiles((prev) => {
          const updated = new Set(prev);
          for (const file of closingFiles) updated.delete(file.id);
          return updated;
        });
        setTabs(next);
        if (id === activeTabIdRef.current && nextActiveTabId) {
          activateTab(nextActiveTabId);
        }
        void refreshHistory(sidebarCwd);
      };

      void (async () => {
        if (unsaved.length > 0) {
          const ok = await confirmDiscardUnsaved(
            "Close this tab with unsaved files?",
          );
          if (!ok) return;
        }
        if (terminals.length > 0) {
          const ok = await confirmCloseTerminals(terminals);
          if (!ok) return;
        }
        finishClose();
      })();
    },
    [activateTab, persistSession, refreshHistory, sidebarCwd, tabCloseScope],
  );

  const onCloseTabs = useCallback(
    (ids: string[], fallbackId: string, opts?: { confirmed?: boolean }) => {
      const current = tabsRef.current;
      const closingIds = new Set(ids);
      const closing = current.filter((tab) => closingIds.has(tab.id));
      const fallback = current.find(
        (tab) => tab.id === fallbackId && !closingIds.has(tab.id),
      );
      if (!fallback || closing.length === 0) return;

      const closingFiles = closing.flatMap((tab) => [
        ...tab.editorPanes.flatMap((pane) => pane.files),
        ...(tab.terminalPanes ?? []).flatMap((pane) => pane.files),
      ]);
      const unsaved = closingFiles.filter(
        (file) => isFilesystemTab(file) && dirtyFilesRef.current.has(file.id),
      );
      const terminals = closingFiles.filter((file) => file.terminal);

      const finishClose = () => {
        const sessionIds = new Set(
          closing.flatMap((tab) =>
            leafIds(tab.layout).filter((paneId) =>
              sessionsRef.current.some((session) => session.id === paneId),
            ),
          ),
        );
        for (const sessionId of sessionIds) {
          persistSession(
            sessionsRef.current.find((session) => session.id === sessionId),
          );
        }
        setDirtyFiles((prev) => {
          const next = new Set(prev);
          for (const file of closingFiles) next.delete(file.id);
          return next;
        });
        setTabs((prev) => prev.filter((tab) => !closingIds.has(tab.id)));
        if (closingIds.has(activeTabIdRef.current)) activateTab(fallback.id);
        void refreshHistory(sidebarCwd);
      };

      // The caller already confirmed unsaved files and terminals.
      if (opts?.confirmed) {
        finishClose();
        return;
      }

      void (async () => {
        if (unsaved.length > 0) {
          const ok = await confirmDiscardUnsaved(
            "Close these tabs with unsaved files?",
          );
          if (!ok) return;
        }
        if (terminals.length > 0) {
          const ok = await confirmCloseTerminals(terminals);
          if (!ok) return;
        }
        finishClose();
      })();
    },
    [activateTab, persistSession, refreshHistory, sidebarCwd],
  );

  const onCloseFile = useCallback(
    (paneId: string, fileId: string) => {
      const tab = tabsRef.current.find((entry) =>
        findSurfacePane(entry, paneId),
      );
      if (!tab) return;
      const found = findSurfacePane(tab, paneId);
      if (!found) return;
      const { kind, pane } = found;
      const index = pane.files.findIndex((file) => file.id === fileId);
      if (index < 0) return;
      const file = pane.files[index];
      const needsUnsavedConfirm =
        isFilesystemTab(file) && dirtyFilesRef.current.has(fileId);

      const finishClose = () => {
        const files = pane.files.filter((entry) => entry.id !== fileId);
        let nextFocus = tab.focusedId;
        let nextLayout = tab.layout;
        let nextPanes = surfacePanes(tab, kind);
        if (files.length > 0) {
          nextFocus = paneId;
          const activeFileId =
            pane.activeFileId === fileId
              ? files[Math.min(index, files.length - 1)].id
              : pane.activeFileId;
          nextPanes = nextPanes.map((entry) =>
            entry.id === paneId ? { ...entry, files, activeFileId } : entry,
          );
        } else {
          const sibling = siblingLeafId(tab.layout, paneId);
          const withoutPane = removePane(tab.layout, paneId);
          if (!withoutPane) {
            setDirtyFiles((prev) => {
              const next = new Set(prev);
              next.delete(fileId);
              return next;
            });
            const closePlan = planWorkspaceTabClose({
              tabs: tabsRef.current,
              sessions: sessionsRef.current,
              closingTabId: tab.id,
              scope: tabCloseScope,
            });
            if (closePlan.action === "close") {
              onCloseTab(
                tab.id,
                file.terminal ? { confirmedTerminalIds: [fileId] } : undefined,
              );
              return;
            }
            const seed = sessionsRef.current[0];
            const session = newSession(
              seed?.harness ?? "claude",
              file.cwd || projectCwd,
              seed?.model,
              seed?.runtimeMode,
              seed?.modelSettings,
            );
            setSessions((prev) => [...prev, session]);
            setTabs((prev) =>
              prev.map((entry) =>
                entry.id === tab.id
                  ? {
                      ...entry,
                      layout: leaf(session.id),
                      focusedId: session.id,
                      editorPanes: [],
                      terminalPanes: [],
                      diffOpen: false,
                      diffFocused: false,
                    }
                  : entry,
              ),
            );
            setComposerFocused(true);
            return;
          }
          nextLayout = withoutPane;
          nextFocus =
            tab.focusedId === paneId
              ? (sibling ?? firstLeafId(withoutPane))
              : tab.focusedId;
          nextPanes = nextPanes.filter((entry) => entry.id !== paneId);
        }

        setTabs((prev) =>
          prev.map((entry) =>
            entry.id === tab.id
              ? withSurfacePanes(
                  {
                    ...entry,
                    layout: nextLayout,
                    focusedId: nextFocus,
                  },
                  kind,
                  nextPanes,
                )
              : entry,
          ),
        );
        setDirtyFiles((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
        if (tab.id === activeTabId && files.length === 0) {
          setComposerFocused(
            sessionsRef.current.some((session) => session.id === nextFocus),
          );
        }
      };

      void (async () => {
        if (needsUnsavedConfirm) {
          const ok = await confirmDiscardUnsaved(
            `Close ${basename(file.path)} without saving?`,
          );
          if (!ok) return;
        }
        if (file.terminal) {
          const ok = await confirmCloseTerminal(file);
          if (!ok) return;
        }
        finishClose();
      })();
    },
    [activeTabId, onCloseTab, projectCwd, tabCloseScope],
  );

  const onCloseOtherFiles = useCallback((paneId: string, fileId: string) => {
    const tab = tabsRef.current.find((entry) => findSurfacePane(entry, paneId));
    if (!tab) return;
    const found = findSurfacePane(tab, paneId);
    if (!found?.pane.files.some((file) => file.id === fileId)) return;
    const closingFiles = found.pane.files.filter((file) => file.id !== fileId);
    if (closingFiles.length === 0) return;
    const closingIds = new Set(closingFiles.map((file) => file.id));
    const unsaved = closingFiles.filter(
      (file) => isFilesystemTab(file) && dirtyFilesRef.current.has(file.id),
    );
    const terminals = closingFiles.filter((file) => file.terminal);

    const finishClose = () => {
      setTabs((prev) =>
        prev.map((entry) => {
          if (entry.id !== tab.id) return entry;
          const current = findSurfacePane(entry, paneId);
          if (!current?.pane.files.some((file) => file.id === fileId)) {
            return entry;
          }
          return withSurfacePanes(
            { ...entry, focusedId: paneId },
            current.kind,
            surfacePanes(entry, current.kind).map((pane) =>
              pane.id === paneId
                ? {
                    ...pane,
                    files: pane.files.filter(
                      (file) => !closingIds.has(file.id),
                    ),
                    activeFileId: fileId,
                  }
                : pane,
            ),
          );
        }),
      );
      setDirtyFiles((prev) => {
        const next = new Set(prev);
        for (const id of closingIds) next.delete(id);
        return next;
      });
    };

    void (async () => {
      if (unsaved.length > 0) {
        const ok = await confirmDiscardUnsaved(
          "Close other tabs with unsaved files?",
        );
        if (!ok) return;
      }
      if (terminals.length > 0) {
        const ok = await confirmCloseTerminals(terminals);
        if (!ok) return;
      }
      finishClose();
    })();
  }, []);

  const onClearTabSession = useCallback(
    (id: string) => {
      const tab = tabs.find((entry) => entry.id === id);
      if (!tab || isBlankWorkspaceTab(tab, sessionsRef.current)) return;

      const closingFiles = [
        ...tab.editorPanes.flatMap((pane) => pane.files),
        ...(tab.terminalPanes ?? []).flatMap((pane) => pane.files),
      ];
      const unsaved = closingFiles.filter(
        (file) => isFilesystemTab(file) && dirtyFilesRef.current.has(file.id),
      );

      const oldSessionId = leafIds(tab.layout).find((paneId) =>
        sessionsRef.current.some((session) => session.id === paneId),
      );
      const oldSession = sessionsRef.current.find(
        (session) => session.id === oldSessionId,
      );
      if (!oldSession) return;

      const finishClear = () => {
        persistSession(oldSession);

        const session = newSession(
          oldSession.harness,
          oldSession.cwd,
          oldSession.model,
          oldSession.runtimeMode,
          oldSession.modelSettings,
        );

        setSessions((prev) => [...prev, session]);
        setDirtyFiles((prev) => {
          const updated = new Set(prev);
          for (const file of closingFiles) updated.delete(file.id);
          return updated;
        });
        setTabs((prev) =>
          prev.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  layout: leaf(session.id),
                  focusedId: session.id,
                  editorPanes: [],
                  terminalPanes: [],
                  diffOpen: false,
                  diffFocused: false,
                }
              : entry,
          ),
        );
        setComposerFocused(true);
        void refreshHistory(sidebarCwd);
      };

      if (unsaved.length === 0) {
        finishClear();
        return;
      }
      void confirmDiscardUnsaved(
        "Close this conversation with unsaved files?",
      ).then((ok) => ok && finishClear());
    },
    [tabs, persistSession, refreshHistory, sidebarCwd],
  );

  const onCloseAllTabs = useCallback(() => {
    const tab = tabsRef.current.find(
      (entry) => entry.id === activeTabIdRef.current,
    );
    if (!tab) return;

    const seedSession = (cwd: string) => {
      const seed = sessionsRef.current[0];
      return newSession(
        seed?.harness ?? "claude",
        cwd,
        seed?.model,
        seed?.runtimeMode,
        seed?.modelSettings,
      );
    };

    // Stage one: files open in the active tab's editor panes close first.
    // Only when none are open does the command close every workspace tab.
    const editorFiles = tab.editorPanes.flatMap((pane) => pane.files);
    if (editorFiles.length > 0) {
      const remaining = closeSurfacePanes(tab, "editor");
      if (!remaining) {
        const closePlan = planWorkspaceTabClose({
          tabs: tabsRef.current,
          sessions: sessionsRef.current,
          closingTabId: tab.id,
          scope: tabCloseScope,
        });
        if (closePlan.action === "close") {
          onCloseTab(tab.id);
          return;
        }
      }
      const unsaved = editorFiles.filter(
        (file) => isFilesystemTab(file) && dirtyFilesRef.current.has(file.id),
      );

      const finishClose = () => {
        let nextTab: WorkspaceTab;
        let focusesSession: boolean;
        if (remaining) {
          nextTab = remaining;
          focusesSession = sessionsRef.current.some(
            (session) => session.id === remaining.focusedId,
          );
        } else {
          // The tab held only editor panes and must stay: seed a session.
          const session = seedSession(editorFiles[0].cwd || projectCwd);
          setSessions((prev) => [...prev, session]);
          nextTab = resetTabToSession(tab, session.id);
          focusesSession = true;
        }
        setTabs((prev) =>
          prev.map((entry) => (entry.id === tab.id ? nextTab : entry)),
        );
        setDirtyFiles((prev) => {
          const updated = new Set(prev);
          for (const file of editorFiles) updated.delete(file.id);
          return updated;
        });
        setComposerFocused(focusesSession);
      };

      void (async () => {
        if (unsaved.length > 0) {
          const ok = await confirmDiscardUnsaved(
            "Close all open files with unsaved changes?",
          );
          if (!ok) return;
        }
        finishClose();
      })();
      return;
    }

    // Stage two: the workspace always keeps one tab, so close every other
    // tab and reset the active one to a blank session. Every confirmation
    // runs before any tab changes, so a cancelled prompt leaves all tabs.
    const otherIds = tabsRef.current
      .filter((entry) => entry.id !== tab.id)
      .map((entry) => entry.id);
    const terminalFiles = (tab.terminalPanes ?? []).flatMap(
      (pane) => pane.files,
    );
    const closingFiles = [
      ...tabsRef.current
        .filter((entry) => otherIds.includes(entry.id))
        .flatMap((entry) => [
          ...entry.editorPanes.flatMap((pane) => pane.files),
          ...(entry.terminalPanes ?? []).flatMap((pane) => pane.files),
        ]),
      ...terminalFiles,
    ];
    const unsaved = closingFiles.filter(
      (file) => isFilesystemTab(file) && dirtyFilesRef.current.has(file.id),
    );
    const terminals = closingFiles.filter((file) => file.terminal);

    void (async () => {
      if (unsaved.length > 0) {
        const ok = await confirmDiscardUnsaved(
          "Close all tabs with unsaved files?",
        );
        if (!ok) return;
      }
      if (terminals.length > 0) {
        const ok = await confirmCloseTerminals(terminals);
        if (!ok) return;
      }
      if (otherIds.length > 0) {
        onCloseTabs(otherIds, tab.id, { confirmed: true });
      }
      const hasSession = leafIds(tab.layout).some((paneId) =>
        sessionsRef.current.some((session) => session.id === paneId),
      );
      if (hasSession) {
        // No editor files remain, so this commits without a prompt.
        onClearTabSession(tab.id);
        return;
      }
      // The tab held no session: seed one so the workspace stays usable.
      const session = seedSession(terminalFiles[0]?.cwd || projectCwd);
      setSessions((prev) => [...prev, session]);
      setTabs((prev) =>
        prev.map((entry) =>
          entry.id === tab.id ? resetTabToSession(entry, session.id) : entry,
        ),
      );
      setComposerFocused(true);
    })();
  }, [onCloseTab, onCloseTabs, onClearTabSession, projectCwd, tabCloseScope]);

  const onClosePane = useCallback(
    (sessionId?: string) => {
      // The project terminal is shared by every workspace tab in the project.
      // Keep the global close command scoped to workspace tabs and panes even
      // while the dock has focus; terminal tabs have their own close buttons.
      if (!activeTab) return;
      const focusedSurface = findSurfacePane(activeTab, activeTab.focusedId);
      if (sessionId === undefined && focusedSurface) {
        onCloseFile(focusedSurface.pane.id, focusedSurface.pane.activeFileId);
        return;
      }
      const closingId = sessionId ?? activeTab.focusedId;
      const ids = leafIds(activeTab.layout);
      const sessionIds = ids.filter((paneId) =>
        sessionsRef.current.some((session) => session.id === paneId),
      );
      if (!sessionIds.includes(closingId)) return;
      const nextTab = closeLeaf(activeTab, closingId);
      if (!nextTab) {
        const closePlan = planWorkspaceTabClose({
          tabs: tabsRef.current,
          sessions: sessionsRef.current,
          closingTabId: activeTab.id,
          scope: tabCloseScope,
        });
        if (closePlan.action === "keep") onClearTabSession(activeTab.id);
        else onCloseTab(activeTab.id);
        return;
      }
      persistSession(sessionsRef.current.find((s) => s.id === closingId));
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? { ...t, layout: nextTab.layout, focusedId: nextTab.focusedId }
            : t,
        ),
      );
      if (closingId === activeTab.focusedId) {
        setComposerFocused(
          nextTab &&
            sessionsRef.current.some(
              (session) => session.id === nextTab.focusedId,
            ),
        );
      }
      void refreshHistory(sidebarCwd);
    },
    [
      activeTab,
      onCloseFile,
      onCloseTab,
      onClearTabSession,
      persistSession,
      refreshHistory,
      sidebarCwd,
      tabCloseScope,
    ],
  );

  const deckProjectTabs = useMemo(() => {
    // A projectless session belongs to no project, so it stands on its own
    // rather than trailing the last project's tabs.
    const active = tabs.find((tab) => tab.id === activeTabId);
    if (active && !workspaceTabCwd(active, sessions)) return [active];
    return filterTabsForProject(tabs, sessions, projectCwd);
  }, [activeTabId, tabs, sessions, projectCwd]);

  const onNext = useCallback(() => {
    const index = deckProjectTabs.findIndex((t) => t.id === activeTabId);
    if (index >= 0)
      activateTab(deckProjectTabs[(index + 1) % deckProjectTabs.length].id);
  }, [activateTab, activeTabId, deckProjectTabs]);

  const onPrev = useCallback(() => {
    const index = deckProjectTabs.findIndex((t) => t.id === activeTabId);
    if (index >= 0) {
      activateTab(
        deckProjectTabs[
          (index - 1 + deckProjectTabs.length) % deckProjectTabs.length
        ].id,
      );
    }
  }, [activateTab, activeTabId, deckProjectTabs]);

  const onVisitBack = useCallback(() => {
    const openIds = new Set(tabsRef.current.map((tab) => tab.id));
    const pruned = pruneTabVisitHistory(
      tabVisitRef.current,
      openIds,
      activeTabIdRef.current,
    );
    const next = tabVisitBack(pruned);
    if (!next || !openIds.has(next.current)) return;
    tabVisitFromHistoryRef.current = true;
    commitTabVisit(next);
    activateTab(next.current);
  }, [activateTab, commitTabVisit]);

  const onVisitForward = useCallback(() => {
    const openIds = new Set(tabsRef.current.map((tab) => tab.id));
    const pruned = pruneTabVisitHistory(
      tabVisitRef.current,
      openIds,
      activeTabIdRef.current,
    );
    const next = tabVisitForward(pruned);
    if (!next || !openIds.has(next.current)) return;
    tabVisitFromHistoryRef.current = true;
    commitTabVisit(next);
    activateTab(next.current);
  }, [activateTab, commitTabVisit]);

  const onActivate = useCallback(
    (slot: number) => {
      const tab =
        slot < 0
          ? deckProjectTabs[deckProjectTabs.length - 1]
          : deckProjectTabs[slot];
      if (tab) activateTab(tab.id);
    },
    [activateTab, deckProjectTabs],
  );

  const onFocusPane = useCallback(
    (paneId: string) => {
      setProjectTerminalFocused(false);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? { ...t, focusedId: paneId, diffFocused: false }
            : t,
        ),
      );
      setComposerFocused(
        sessionsRef.current.some((session) => session.id === paneId),
      );
    },
    [activeTabId],
  );

  const onReorderTabs = useCallback(
    (ids: string[], movedId?: string) => {
      setTabs((prev) => {
        const visibleIds = new Set(ids);
        const visibleTabs = prev.filter((tab) => visibleIds.has(tab.id));
        if (movedId) {
          const reordered = applyGroupedReorder(
            visibleTabs,
            ids,
            movedId,
            projectOfTab,
          );
          return reordered ? mergeOrderedSubset(prev, reordered) : prev;
        }
        return mergeOrderedSubset(prev, orderByIds(visibleTabs, ids));
      });
    },
    [projectOfTab],
  );

  const onReorderFiles = useCallback((paneId: string, ids: string[]) => {
    setTabs((prev) =>
      prev.map((tab) => {
        const found = findSurfacePane(tab, paneId);
        if (!found) return tab;
        return withSurfacePanes(
          tab,
          found.kind,
          surfacePanes(tab, found.kind).map((pane) =>
            pane.id === paneId
              ? { ...pane, files: orderByIds(pane.files, ids) }
              : pane,
          ),
        );
      }),
    );
  }, []);

  const onMovePane = useCallback(
    (fromId: string, toId: string, edge: PaneEdge) => {
      setTabs((prev) =>
        prev.map((tab) => {
          return leafIds(tab.layout).includes(fromId)
            ? {
                ...tab,
                layout: movePane(tab.layout, fromId, toId, edge),
                focusedId: fromId,
              }
            : tab;
        }),
      );
    },
    [],
  );

  const onDetachPane = useCallback(
    (paneId: string, targetTabId: string, position: "before" | "after") => {
      const result = applyDetachPaneToTab({
        tabs: tabsRef.current,
        paneId,
        targetTabId,
        position,
      });
      if (!result) return;

      tabsRef.current = result.tabs;
      setTabs(result.tabs);
      setProjectTerminalFocused(false);
      activateTab(result.activeTabId, result.focusedId);
    },
    [activateTab],
  );

  const onFileMoved = useCallback((from: string, to: string) => {
    invalidateProjectFiles();
    setTabs((prev) =>
      prev.map((tab) => {
        return {
          ...tab,
          editorPanes: tab.editorPanes.map((pane) => ({
            ...pane,
            files: pane.files.map((file) =>
              isFilesystemTab(file)
                ? { ...file, path: rebasePath(file.path, from, to) }
                : file,
            ),
          })),
        };
      }),
    );
  }, []);

  const onFileDeleted = useCallback((path: string) => {
    invalidateProjectFiles();
    const dropped = new Set<string>();
    for (const tab of tabsRef.current) {
      for (const pane of tab.editorPanes) {
        for (const file of pane.files) {
          if (
            isFilesystemTab(file) &&
            isEqualOrInside(file.path, path)
          ) {
            dropped.add(file.id);
          }
        }
      }
    }
    setTabs((prev) =>
      prev.map((tab) =>
        dropOpenFiles(tab, (filePath) => isEqualOrInside(filePath, path)),
      ),
    );
    if (dropped.size === 0) return;
    setDirtyFiles((prev) => {
      const next = new Set(prev);
      for (const id of dropped) next.delete(id);
      return next;
    });
  }, []);

  const onOpenFile = useCallback<OpenFileFn>(
    (path, navigation, options) => {
      void (async () => {
        const fileCwd = gitCwdRef.current;
        const fileProjectCwd = sidebarCwdRef.current;
        const resolved = await resolveFileOpenRequest(fileCwd, path, options);
        rememberOpenedFile(fileCwd, resolved);
        const tab = tabsRef.current.find(
          (entry) => entry.id === activeTabIdRef.current,
        );
        if (!tab) return;
        const file = newFileTab(
          resolved,
          fileCwd,
          false,
          undefined,
          fileProjectCwd,
        );
        const pin = !!options?.pin;
        if (loadFileTabMode() === "workspace") {
          // Built once: the updater may run twice in StrictMode.
          const created = newEditorWorkspaceTab(
            pin ? file : { ...file, preview: true },
          );
          let target: { tabId: string; paneId?: string } | undefined;
          // Select inside the updater, not from `tabsRef`: two opens resuming
          // before a render would otherwise both miss the preview and append
          // twice. flushSync runs the updater now so `target` is set below.
          flushSync(() => {
            setTabs((prev) => {
              const result = openWorkspaceFile(
                prev,
                file,
                created,
                (tabs, tab) => insertBesideActive(tabs, tab, fileProjectCwd),
                pin,
              );
              target = result;
              return result.tabs;
            });
          });
          if (target?.paneId) activateTab(target.tabId, target.paneId);
          else if (target) setActiveTabId(target.tabId);
          setProjectTerminalFocused(false);
          setComposerFocused(false);
          if (navigation) {
            editorNavigationToken.current += 1;
            setEditorNavigation({
              path: resolved,
              ...navigation,
              token: editorNavigationToken.current,
            });
          }
          return;
        }
        setTabs((prev) =>
          prev.map((entry) => {
            if (entry.id !== tab.id) return entry;
            const focusedSession = sessionsRef.current.find(
              (session) => session.id === entry.focusedId,
            );
            return openEditorTab(entry, file, {
              split: focusedSession?.blocks.length === 0 ? "left" : "right",
              pin,
            });
          }),
        );
        if (navigation) {
          editorNavigationToken.current += 1;
          setEditorNavigation({
            path: resolved,
            ...navigation,
            token: editorNavigationToken.current,
          });
        }
        setComposerFocused(false);
      })();
    },
    [activateTab, insertBesideActive],
  );

  const onOpenPlan = useCallback(
    (sessionId: string, blockId: string) => {
      const tab = tabsRef.current.find((entry) => entry.id === activeTabId);
      const session = sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      const block = session?.blocks.find((entry) => entry.id === blockId);
      if (!tab || !session || !block) return;
      const file = {
        ...newPlanTab(
          session.id,
          block.id,
          planTitle(block.text),
          sessionWorkCwd(session),
        ),
        ...(session.worktreeCwd ? { projectCwd: session.cwd } : {}),
      };
      setTabs((prev) =>
        prev.map((entry) =>
          entry.id === tab.id ? openEditorTab(entry, file) : entry,
        ),
      );
      setComposerFocused(false);
    },
    [activeTabId],
  );

  const onSelectFileSurface = useCallback((paneId: string, fileId: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        const found = findSurfacePane(tab, paneId);
        if (!found) return tab;
        return withSurfacePanes(
          { ...tab, focusedId: paneId },
          found.kind,
          surfacePanes(tab, found.kind).map((pane) =>
            pane.id === paneId ? { ...pane, activeFileId: fileId } : pane,
          ),
        );
      }),
    );
    setComposerFocused(false);
  }, []);

  return { projectOfTab, activateTab, insertBeside, appendTab, onSplit, onCloseTab, onCloseTabs, onCloseFile, onCloseOtherFiles, onCloseAllTabs, onClosePane, deckProjectTabs, onNext, onPrev, onVisitBack, onVisitForward, onActivate, onFocusPane, onReorderTabs, onReorderFiles, onMovePane, onDetachPane, onFileMoved, onFileDeleted, onSelectFileSurface, onOpenFile, onOpenPlan, onPinFile };
}
