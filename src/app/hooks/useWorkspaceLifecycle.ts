import { useEffect, useLayoutEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { startHarnessBridge } from "../../integrations/harness";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IS_MAC } from "../../platform/tauri/platform";
import { prefetchProjectFiles } from "../../features/files/model/fileIndex";
import { warmNativeSkills } from "../../features/skills/model/skills";
import { setWindowFocused } from "../../features/notifications/model/notifications";
import { syncDockBadge } from "../../features/notifications/model/dockBadge";
import { type LiveSessionStore } from "../../features/sessions/model/liveSessions";
import { type useProjectState } from "../../features/projects/hooks/useProjectState";
import { type useTerminalDock } from "../../features/terminal/hooks/useTerminalDock";
import { type useWorkspaceTabState } from "../../features/workspace/hooks/useWorkspaceTabState";
import { type useProjectActions } from "../../features/projects/hooks/useProjectActions";
import { type useAppSurfaces } from "./useAppSurfaces";
import { type nativeSkillContextForSession } from "../../features/sessions/model/sessionSkills";
import { type Session } from "../../features/sessions/model/session";
import {
  bindResumedSessions,
  closeBusyWindow,
  closeCurrentWindow,
  hasInFlightSessions,
  hideCurrentWindow,
  isAppQuitting,
  persistLiveTranscripts,
  persistQuitState,
  reapWindowRuntime,
  setQuitWorkspace,
  type ResumedWorkspace,
} from "../model/appLifecycle";
import { loadCloseToTray } from "../../features/settings/model/settings";

export type UseWorkspaceLifecycleDeps = {
  resumed: ResumedWorkspace | null;
  readProjectReturnMemory: ReturnType<typeof useProjectActions>["readProjectReturnMemory"];
  liveSessions: LiveSessionStore;
  flushHarnessEvents: LiveSessionStore["flushHarnessEvents"];
  sessionsRef: LiveSessionStore["ref"];
  tabsRef: ReturnType<typeof useWorkspaceTabState>["tabsRef"];
  activeTabIdRef: ReturnType<typeof useWorkspaceTabState>["activeTabIdRef"];
  projectCwdRef: ReturnType<typeof useProjectState>["projectCwdRef"];
  projectTerminalsRef: ReturnType<typeof useTerminalDock>["projectTerminalsRef"];
  lastDockSideRef: ReturnType<typeof useTerminalDock>["lastDockSideRef"];
  projectTerminalFocusedRef: ReturnType<typeof useTerminalDock>["projectTerminalFocusedRef"];
  activeSkillContext: ReturnType<typeof nativeSkillContextForSession> | null;
  activeSkillCwd: string | undefined;
  active: Session | undefined;
  gitCwd: string;
  activeTabId: string;
  searchViewOpen: boolean;
  settingsOpen: boolean;
  setComposerFocused: ReturnType<typeof useWorkspaceTabState>["setComposerFocused"];
  setComposerFocusToken: ReturnType<typeof useWorkspaceTabState>["setComposerFocusToken"];
  searchViewOpenRef: ReturnType<typeof useAppSurfaces>["searchViewOpenRef"];
  settingsOpenRef: ReturnType<typeof useAppSurfaces>["settingsOpenRef"];
};

export function useWorkspaceLifecycle(deps: UseWorkspaceLifecycleDeps) {
  const {
    resumed,
    readProjectReturnMemory,
    liveSessions,
    flushHarnessEvents,
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    projectCwdRef,
    projectTerminalsRef,
    lastDockSideRef,
    projectTerminalFocusedRef,
    activeSkillContext,
    activeSkillCwd,
    active,
    gitCwd,
    activeTabId,
    searchViewOpen,
    settingsOpen,
    setComposerFocused,
    setComposerFocusToken,
    searchViewOpenRef,
    settingsOpenRef,
  } = deps;

  useEffect(() => {
    if (resumed?.sessions.length) bindResumedSessions(resumed.sessions);
    const stopBridge = startHarnessBridge();
    const reap = () => {
      if (isAppQuitting()) return;
      void persistQuitState(
        sessionsRef.current,
        tabsRef.current,
        activeTabIdRef.current,
        projectCwdRef.current,
        readProjectReturnMemory(),
        "unload",
        projectTerminalsRef.current,
        lastDockSideRef.current ?? undefined,
      ).finally(() => {
        void reapWindowRuntime(
          sessionsRef.current,
          tabsRef.current,
          projectTerminalsRef.current,
        );
      });
    };
    window.addEventListener("pagehide", reap);
    window.addEventListener("beforeunload", reap);
    return () => {
      window.removeEventListener("pagehide", reap);
      window.removeEventListener("beforeunload", reap);
      stopBridge();
      liveSessions.dispose();
    };
  }, [resumed, readProjectReturnMemory]);

  useEffect(() => {
    if (!activeSkillContext || !activeSkillCwd) return;
    warmNativeSkills(activeSkillContext);
  }, [activeSkillCwd, active?.id, active?.harness]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        setWindowFocused(focused);
        if (focused) {
          flushHarnessEvents();
          syncDockBadge(sessionsRef.current);
          if (
            document.activeElement === document.body &&
            !projectTerminalFocusedRef.current &&
            !searchViewOpenRef.current &&
            !settingsOpenRef.current
          ) {
            setComposerFocused(true);
            setComposerFocusToken((token) => token + 1);
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [flushHarnessEvents]);

  useEffect(() => {
    const onVisible = () => {
      // Flush on hiding too: WebKit can suspend a pending animation frame,
      // leaving the last output stranded until another event or activation.
      flushHarnessEvents();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [flushHarnessEvents]);

  useLayoutEffect(() => {
    // A newly selected chat catches up before paint, even if its output was
    // waiting on the background cadence. Draft/composer input stays immediate.
    flushHarnessEvents();
  }, [
    activeTabId,
    searchViewOpen,
    settingsOpen,
    flushHarnessEvents,
  ]);

  useEffect(() => {
    let unlistenClose: (() => void) | undefined;
    const releaseQuit = setQuitWorkspace(
      () => sessionsRef.current,
      () => tabsRef.current,
      () => activeTabIdRef.current,
      () => projectCwdRef.current,
      () => projectTerminalsRef.current,
      readProjectReturnMemory,
      flushHarnessEvents,
      () => lastDockSideRef.current,
    );
    void getCurrentWindow()
      .onCloseRequested((event) => {
        // Listening here makes close our job. Letting the default path run
        // calls JS `window.destroy`, which Tauri denies without a permission.
        event.preventDefault();
        const toTray = loadCloseToTray();
        if (hasInFlightSessions(sessionsRef.current)) {
          flushHarnessEvents();
          if (!toTray && !IS_MAC) {
            void closeBusyWindow();
            return;
          }
          // Not `persistQuitState`: that marks the live turns interrupted.
          void persistLiveTranscripts(sessionsRef.current);
          void hideCurrentWindow();
          return;
        }
        void persistQuitState(
          sessionsRef.current,
          tabsRef.current,
          activeTabIdRef.current,
          projectCwdRef.current,
          readProjectReturnMemory(),
          "unload",
          projectTerminalsRef.current,
          lastDockSideRef.current ?? undefined,
        ).finally(() => {
          void (toTray ? hideCurrentWindow() : closeCurrentWindow());
        });
      })
      .then((fn) => {
        unlistenClose = fn;
      });
    return () => {
      releaseQuit();
      unlistenClose?.();
    };
  }, [flushHarnessEvents, readProjectReturnMemory]);

  useEffect(() => {
    prefetchProjectFiles(gitCwd);
  }, [gitCwd]);

  useEffect(() => {
    void invoke("set_traffic_lights_visible", { visible: true }).catch(
      () => {},
    );
  }, []);
}
