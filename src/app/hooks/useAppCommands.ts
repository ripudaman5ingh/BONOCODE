import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef } from "react";
import { IS_MAC } from "../../platform/tauri/platform";
import {
  applyUiScale,
  loadUiScale,
  saveUiScale,
  UI_SCALE_DEFAULT,
  zoomInUiScale,
  zoomOutUiScale,
} from "../../features/settings/model/uiScale";
import { resolveZoomKeybinding } from "../../features/settings/model/zoomKeybinding";
import { resolveAppShortcut } from "../../features/settings/model/appShortcuts";
import { runUpdateFlow } from "../model/updater";
import { type FocusDir, type SplitDir } from "../../features/workspace/model/layout";
import { type Session } from "../../features/sessions/model/session";
import { NOTIFICATION_CLICK_EVENT } from "../../features/notifications/model/notifications";
import {
  shouldHandleListNavigation,
  tabCommand,
  tabCommandForKeybinding,
  tabCommandKeybinding,
} from "../../features/workspace/model/tabKeys";
import { type SettingsAnchor } from "../../features/settings/ui/SettingsView";
import {
  loadAutosave,
  loadKeybindingOverrides,
  keybindingPressed,
  matchCustomKeybinding,
  saveAutosave,
  type SettingsSectionId,
} from "../../features/settings/model/settings";
import {
  handleEditorFindKey,
  openFindInActiveEditor,
} from "../../features/files/editor/editorSearch";

export type UseAppCommandsDeps = {
  onActivate: (slot: number) => void;
  onArchiveFocusedSession: (event: KeyboardEvent) => void;
  onCloseAllTabs: () => void;
  onCloseOtherTabs: () => void;
  onClosePane: (sessionId?: string) => void;
  onFindInProject: () => void;
  onFocusDir: (dir: FocusDir) => void;
  onGoToFile: () => void;
  onNavigateProjectList: (delta: number) => void;
  onNavigateSessionList: (delta: number, inCurrentTab?: boolean) => void;
  onNew: () => void;
  onNewTerminal: () => void;
  onNewTerminalTab: () => void;
  onNext: () => void;
  onOpenApprovalSession: (sessionId: string) => void;
  onOpenCommandPalette: () => void;
  onOpenSearch: () => void;
  onPrev: () => void;
  onReload: () => void;
  onSplit: (dir: SplitDir) => void;
  onToggleProjectTerminal: () => void;
  onToggleSessionSidebar: () => void;
  onToggleSidebar: () => void;
  onVisitBack: () => void;
  onVisitForward: () => void;
  openSettings: (section?: SettingsSectionId, anchor?: SettingsAnchor) => void;
  pickProject: () => Promise<void>;
  searchViewOpenRef: { current: boolean };
  sessionsRef: { current: Session[] };
  settingsOpenRef: { current: boolean };
  filePickerOpenRef: { current: boolean };
  whatsNewVersionRef: { current: string | null };
};

export function useAppCommands(deps: UseAppCommandsDeps) {
  const {
    onActivate,
    onArchiveFocusedSession,
    onCloseAllTabs,
    onCloseOtherTabs,
    onClosePane,
    onFindInProject,
    onFocusDir,
    onGoToFile,
    onNavigateProjectList,
    onNavigateSessionList,
    onNew,
    onNewTerminal,
    onNewTerminalTab,
    onNext,
    onOpenApprovalSession,
    onOpenCommandPalette,
    onOpenSearch,
    onPrev,
    onReload,
    onSplit,
    onToggleProjectTerminal,
    onToggleSessionSidebar,
    onToggleSidebar,
    onVisitBack,
    onVisitForward,
    openSettings,
    pickProject,
    searchViewOpenRef,
    sessionsRef,
    settingsOpenRef,
    filePickerOpenRef,
    whatsNewVersionRef,
  } = deps;

  const actions = useRef({
    onNew,
    onArchiveFocusedSession,
    onCloseOtherTabs,
    onCloseAllTabs,
    onClosePane,
    onNext,
    onPrev,
    onVisitBack,
    onVisitForward,
    onActivate,
    onSplit,
    onFocusDir,
    onToggleSidebar,
    onToggleSessionSidebar,
    onGoToFile,
    onOpenCommandPalette,
    onReload,
    onFindInProject,
    onOpenSearch,
    pickProject,
    onNewTerminal,
    onNewTerminalTab,
    onToggleProjectTerminal,
    onNavigateSessionList,
    onNavigateProjectList,
    openSettings,
    onOpenApprovalSession,
  });
  actions.current = {
    onNew,
    onArchiveFocusedSession,
    onCloseOtherTabs,
    onCloseAllTabs,
    onClosePane,
    onNext,
    onPrev,
    onVisitBack,
    onVisitForward,
    onActivate,
    onSplit,
    onFocusDir,
    onToggleSidebar,
    onToggleSessionSidebar,
    onGoToFile,
    onOpenCommandPalette,
    onReload,
    onFindInProject,
    onOpenSearch,
    pickProject,
    onNewTerminal,
    onNewTerminalTab,
    onToggleProjectTerminal,
    onNavigateSessionList,
    onNavigateProjectList,
    openSettings,
    onOpenApprovalSession,
  };

  const debounce = useRef({ name: "", at: 0 });
  const run = useCallback((name: string, fn: () => void) => {
    const now = performance.now();
    if (name === debounce.current.name && now - debounce.current.at < 80)
      return;
    debounce.current = { name, at: now };
    fn();
  }, []);

  useEffect(() => {
    if (!IS_MAC) return;
    void invoke("autosave_set_enabled", { enabled: loadAutosave() }).catch(
      console.error,
    );
    void invoke("keybindings_set_overrides", {
      overrides: loadKeybindingOverrides(),
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The Quick Composer recorder owns the next key combination, including
      // bindings that the workspace would normally handle in capture phase.
      if (document.querySelector('[data-shortcut-recorder-active="true"]'))
        return;
      // Never act on a chord while an IME is composing: tabCommand and the
      // editor guards already do, and the app shortcut resolver does too, so
      // this keeps the whole handler consistent for whatever is added next.
      if (e.isComposing) return;
      const customCommand = matchCustomKeybinding(e);
      const pressed = (command: string, defaultMatch: boolean) =>
        keybindingPressed(command, e, defaultMatch);
      // A rebound zoom chord may be Option-only, so it is resolved outside the
      // Cmd/Ctrl guard that only the browser-standard defaults need.
      const zoom = resolveZoomKeybinding(e);
      if (zoom) {
        e.preventDefault();
        e.stopPropagation();
        if (zoom === "zoom-in") {
          const next = saveUiScale(zoomInUiScale(loadUiScale()));
          void applyUiScale(next);
        } else if (zoom === "zoom-out") {
          const next = saveUiScale(zoomOutUiScale(loadUiScale()));
          void applyUiScale(next);
        } else {
          saveUiScale(UI_SCALE_DEFAULT);
          void applyUiScale(UI_SCALE_DEFAULT);
        }
        return;
      }
      const cmd = customCommand
        ? tabCommandForKeybinding(customCommand, e)
        : tabCommand(e);
      if (cmd && pressed(tabCommandKeybinding(cmd), !customCommand)) {
        if (cmd === "archive-session") {
          if (e.repeat) return;
          actions.current.onArchiveFocusedSession(e);
          return;
        }
        const target = e.target instanceof Element ? e.target : null;
        const listNavigation =
          cmd === "prev-session" ||
          cmd === "next-session" ||
          cmd === "prev-session-in-tab" ||
          cmd === "next-session-in-tab" ||
          cmd === "prev-project" ||
          cmd === "next-project";
        if (listNavigation) {
          const blockedTarget = Boolean(
            target?.closest(
              'input, textarea, select, [contenteditable="true"], .cm-editor, .bonocode-terminal, [role="dialog"], [data-model-picker], [data-file-picker], [data-branch-picker], [data-skill-picker], [data-mention-picker], [data-app-search]',
            ),
          );
          const emptyComposerTarget = Boolean(
            target?.matches('textarea[data-composer-empty="true"]'),
          );
          const surfaceOpen =
            searchViewOpenRef.current ||
            settingsOpenRef.current ||
            filePickerOpenRef.current ||
            Boolean(whatsNewVersionRef.current);
          if (
            !shouldHandleListNavigation({
              blockedTarget,
              emptyComposerTarget,
              surfaceOpen,
            })
          ) {
            return;
          }
        }
        if (
          target?.closest(".bonocode-terminal") &&
          e.ctrlKey &&
          !e.metaKey &&
          (cmd === "back" ||
            cmd === "forward" ||
            /Mac|iPhone|iPad/.test(navigator.platform))
        ) {
          return;
        }
        if (
          (cmd === "split-right" || cmd === "split-down") &&
          target?.closest(".cm-editor")
        ) {
          return;
        }
        const inPicker =
          target &&
          target.closest(
            "[data-model-picker], [data-file-picker], [data-branch-picker], [data-skill-picker], [data-mention-picker], [data-app-search]",
          );
        if (inPicker && typeof cmd === "object" && "activate" in cmd) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const a = actions.current;
        if (cmd === "new") run("new", a.onNew);
        else if (cmd === "close-others")
          run("close-others", a.onCloseOtherTabs);
        else if (cmd === "close-all") run("close-all", a.onCloseAllTabs);
        else if (cmd === "close") run("close", a.onClosePane);
        else if (cmd === "next") run("next", a.onNext);
        else if (cmd === "prev") run("prev", a.onPrev);
        else if (cmd === "cycle-next") run("next", a.onNext);
        else if (cmd === "cycle-prev") run("prev", a.onPrev);
        else if (cmd === "back") run("back", a.onVisitBack);
        else if (cmd === "forward") run("forward", a.onVisitForward);
        else if (cmd === "split-right")
          run("split-right", () => a.onSplit("right"));
        else if (cmd === "split-down")
          run("split-down", () => a.onSplit("down"));
        else if (cmd === "new-terminal") run("new-terminal", a.onNewTerminal);
        else if (cmd === "new-terminal-tab")
          run("new-terminal-tab", a.onNewTerminalTab);
        else if (cmd === "toggle-terminal")
          run("toggle-terminal", a.onToggleProjectTerminal);
        else if (cmd === "prev-session")
          run("prev-session", () => a.onNavigateSessionList(-1));
        else if (cmd === "next-session")
          run("next-session", () => a.onNavigateSessionList(1));
        else if (cmd === "prev-session-in-tab")
          run("prev-session-in-tab", () => a.onNavigateSessionList(-1, true));
        else if (cmd === "next-session-in-tab")
          run("next-session-in-tab", () => a.onNavigateSessionList(1, true));
        else if (cmd === "prev-project")
          run("prev-project", () => a.onNavigateProjectList(-1));
        else if (cmd === "next-project")
          run("next-project", () => a.onNavigateProjectList(1));
        else if (typeof cmd === "object" && "focus" in cmd)
          run(`focus-${cmd.focus}`, () => a.onFocusDir(cmd.focus));
        else if (typeof cmd === "object" && "activate" in cmd)
          run(`activate-${cmd.activate}`, () => a.onActivate(cmd.activate));
        return;
      }
      if (
        !searchViewOpenRef.current &&
        !(
          e.target instanceof Element &&
          e.target.closest("[data-session-drop], [data-agent-tab]")
        ) &&
        handleEditorFindKey(e)
      ) {
        e.stopPropagation();
        return;
      }
      const shortcut = resolveAppShortcut(e);
      if (shortcut) {
        if (
          shortcut === "App: Search" &&
          e.target instanceof Element &&
          e.target.closest(".bonocode-terminal") &&
          e.ctrlKey &&
          !e.metaKey
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const a = actions.current;
        if (shortcut === "App: New Window")
          run("new_window", () => void invoke("open_new_window"));
        else if (shortcut === "App: Open Project")
          run("open_project", () => void a.pickProject());
        else if (shortcut === "App: Toggle Sidebar")
          run("toggle_sidebar", a.onToggleSidebar);
        else if (shortcut === "App: Toggle Session Sidebar")
          run("toggle_session_sidebar", a.onToggleSessionSidebar);
        else if (shortcut === "App: Go to File")
          run("go_to_file", a.onGoToFile);
        else if (shortcut === "App: Command Palette")
          run("open_command_palette", a.onOpenCommandPalette);
        else if (shortcut === "View: Reload") run("reload", a.onReload);
        else if (shortcut === "App: Search") run("open_search", a.onOpenSearch);
        else if (shortcut === "App: Settings")
          run("open_settings", () => a.openSettings());
        else if (shortcut === "App: Find in Files")
          run("find_in_project", a.onFindInProject);
        return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [run]);

  useEffect(() => {
    const unlisten: Array<Promise<() => void>> = [
      listen("new_tab", () => run("new", actions.current.onNew)),
      listen("close_other_tabs", () =>
        run("close-others", actions.current.onCloseOtherTabs),
      ),
      listen("close_all_tabs", () =>
        run("close-all", actions.current.onCloseAllTabs),
      ),
      listen("close_tab", () => run("close", actions.current.onClosePane)),
      listen<boolean>("toggle_autosave", ({ payload }) => {
        const saved = saveAutosave(payload);
        if (saved !== payload && IS_MAC) {
          void invoke("autosave_set_enabled", { enabled: saved });
        }
      }),
      listen("next_tab", () => run("next", actions.current.onNext)),
      listen("prev_tab", () => run("prev", actions.current.onPrev)),
      listen("back_tab", () => run("back", actions.current.onVisitBack)),
      listen("forward_tab", () =>
        run("forward", actions.current.onVisitForward),
      ),
      listen("split_right", () =>
        run("split-right", () => actions.current.onSplit("right")),
      ),
      listen("split_down", () =>
        run("split-down", () => actions.current.onSplit("down")),
      ),
      listen("new_terminal", () =>
        run("new-terminal", actions.current.onNewTerminal),
      ),
      listen("new_terminal_tab", () =>
        run("new-terminal-tab", actions.current.onNewTerminalTab),
      ),
      listen("toggle_terminal", () =>
        run("toggle-terminal", actions.current.onToggleProjectTerminal),
      ),
      listen("focus_left", () =>
        run("focus-left", () => actions.current.onFocusDir("left")),
      ),
      listen("focus_right", () =>
        run("focus-right", () => actions.current.onFocusDir("right")),
      ),
      listen("focus_up", () =>
        run("focus-up", () => actions.current.onFocusDir("up")),
      ),
      listen("focus_down", () =>
        run("focus-down", () => actions.current.onFocusDir("down")),
      ),
      listen("toggle_sidebar", () =>
        run("toggle_sidebar", actions.current.onToggleSidebar),
      ),
      listen("toggle_session_sidebar", () =>
        run("toggle_session_sidebar", actions.current.onToggleSessionSidebar),
      ),
      listen("open_project", () => {
        void actions.current.pickProject();
      }),
      listen("go_to_file", () => run("go_to_file", actions.current.onGoToFile)),
      listen("open_command_palette", () =>
        run("open_command_palette", actions.current.onOpenCommandPalette),
      ),
      listen("reload", () => run("reload", actions.current.onReload)),
      listen("open_search", () => actions.current.onOpenSearch()),
      listen("open_settings", () => actions.current.openSettings()),
      listen("check_for_updates", () => {
        void runUpdateFlow(true);
      }),
      listen("sidebar_opacity", () => {
        actions.current.openSettings("appearance");
      }),
      listen("find_in_project", () => actions.current.onFindInProject()),
      listen("find", () => {
        openFindInActiveEditor();
      }),
      listen("open_model_picker", () => {
        window.dispatchEvent(new Event("open_model_picker"));
      }),
      // Every window hears the click; only the one holding the session acts.
      listen<string>(NOTIFICATION_CLICK_EVENT, ({ payload: sessionId }) => {
        if (!sessionsRef.current.some((s) => s.id === sessionId)) return;
        const win = getCurrentWindow();
        // Windows leaves a minimized window minimized when it is only focused.
        void win
          .unminimize()
          .then(() => win.setFocus())
          .catch(() => {});
        actions.current.onOpenApprovalSession(sessionId);
      }),
      listen("zoom_in", () => {
        const next = zoomInUiScale(loadUiScale());
        saveUiScale(next);
        void applyUiScale(next);
      }),
      listen("zoom_out", () => {
        const next = zoomOutUiScale(loadUiScale());
        saveUiScale(next);
        void applyUiScale(next);
      }),
      listen("zoom_reset", () => {
        saveUiScale(UI_SCALE_DEFAULT);
        void applyUiScale(UI_SCALE_DEFAULT);
      }),
    ];
    return () => {
      void Promise.all(unlisten).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [run]);

  return {
    actions,
  };
}
