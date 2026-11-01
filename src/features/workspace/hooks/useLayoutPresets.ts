import { createElement, useCallback, useMemo, useRef, useState } from "react";
import {
  saveProjectRailOpen,
  saveSessionSidebarOpen,
} from "../../settings/model/appearance";
import {
  findProjectTerminal,
  mapProjectTerminal,
} from "../../projects/model/projectTerminal";
import type { PaletteAction } from "../../files/ui/FilePicker";
import type { DockPlacement } from "../model/dockLayout";
import {
  BUILT_IN_LAYOUT_PRESETS,
  DEFAULT_LAYOUT_PRESET,
  applyPreset,
  capturePreset,
  deleteUserPreset,
  loadUserPresets,
  nextPresetName,
  saveUserPreset,
  terminalPlacement,
  type LayoutPreset,
} from "../model/layoutPresets";
import type { WorkspaceStore } from "../model/workspaceStore";
import { SaveLayoutDialog } from "../ui/SaveLayoutDialog";

export type UseLayoutPresetsDeps = {
  workspace: WorkspaceStore;
  gitCwd: string;
  openProjectTerminal: (cwd: string) => boolean;
  projectRailOpen: boolean;
  sessionSidebarOpen: boolean;
  setProjectRailOpen: (open: boolean) => void;
  setSessionSidebarOpen: (open: boolean) => void;
};

const APPLY = "layout:apply:";
const DELETE = "layout:delete:";
const SAVE = "layout:save";

function samePlacement(a: DockPlacement, b: DockPlacement): boolean {
  return a.side === b.side && a.size === b.size && a.open === b.open;
}

/** Built-in and saved layouts: apply, cycle, save and delete. */
export function useLayoutPresets(deps: UseLayoutPresetsDeps) {
  const live = useRef(deps);
  live.current = deps;
  const [userPresets, setUserPresets] = useState(loadUserPresets);
  const [saving, setSaving] = useState(false);
  // Per window and not persisted: Next Layout starts from Default after a reload.
  const lastApplied = useRef<string | null>(null);

  const apply = useCallback((preset: LayoutPreset) => {
    const { workspace, gitCwd, openProjectTerminal } = live.current;
    const next = applyPreset(preset, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    live.current.setProjectRailOpen(next.projectRailOpen);
    saveProjectRailOpen(next.projectRailOpen);
    live.current.setSessionSidebarOpen(next.sessionSidebarOpen);
    saveSessionSidebarOpen(next.sessionSidebarOpen);
    workspace.setChangesDock((dock) =>
      samePlacement(dock, next.changesDock) ? dock : next.changesDock,
    );
    const projectPath = workspace.projectCwdRef.current;
    const terminal = next.terminalDock;
    // Opening a dock that has no terminal starts one, as Toggle Terminal does.
    if (
      terminal.open &&
      !findProjectTerminal(workspace.projectTerminalsRef.current, projectPath)
    ) {
      openProjectTerminal(gitCwd);
    }
    workspace.setProjectTerminals((prev) =>
      mapProjectTerminal(prev, projectPath, (dock) =>
        samePlacement(dock, terminal) ? dock : { ...dock, ...terminal },
      ),
    );
    lastApplied.current = preset.name;
  }, []);

  const commands = useMemo(
    () => ({
      onResetLayout: () => apply(DEFAULT_LAYOUT_PRESET),
      onNextLayout: () => {
        // Read storage again so presets saved in another window join the cycle.
        const user = loadUserPresets();
        setUserPresets(user);
        const presets = [...BUILT_IN_LAYOUT_PRESETS, ...user];
        const name = nextPresetName(
          presets.map((preset) => preset.name),
          lastApplied.current,
        );
        apply(presets.find((preset) => preset.name === name) ?? DEFAULT_LAYOUT_PRESET);
      },
    }),
    [apply],
  );

  const paletteActions = useMemo<PaletteAction[]>(
    () => [
      ...[...BUILT_IN_LAYOUT_PRESETS, ...userPresets].map((preset) => ({
        id: `${APPLY}${preset.name}`,
        label: `Layout: ${preset.name}`,
      })),
      { id: SAVE, label: "Layout: Save Current…" },
      ...userPresets.map((preset) => ({
        id: `${DELETE}${preset.name}`,
        label: `Layout: Delete ${preset.name}`,
      })),
    ],
    [userPresets],
  );

  /** Runs a layout palette action. False when `id` is not one of them. */
  const runPaletteAction = useCallback(
    (id: string): boolean => {
      if (id === SAVE) {
        setSaving(true);
        return true;
      }
      if (id.startsWith(APPLY)) {
        const name = id.slice(APPLY.length);
        const preset = [...BUILT_IN_LAYOUT_PRESETS, ...userPresets].find(
          (entry) => entry.name === name,
        );
        if (preset) apply(preset);
        return true;
      }
      if (id.startsWith(DELETE)) {
        const name = id.slice(DELETE.length);
        setUserPresets(deleteUserPreset(name));
        if (lastApplied.current === name) lastApplied.current = null;
        return true;
      }
      return false;
    },
    [apply, userPresets],
  );

  const onSave = useCallback((name: string) => {
    const { workspace, projectRailOpen, sessionSidebarOpen } = live.current;
    const dock = findProjectTerminal(
      workspace.projectTerminalsRef.current,
      workspace.projectCwdRef.current,
    );
    const preset = capturePreset(name, {
      projectRailOpen,
      sessionSidebarOpen,
      changesDock: workspace.changesDockRef.current,
      terminalDock: terminalPlacement(dock),
    });
    setUserPresets(saveUserPreset(preset));
    lastApplied.current = preset.name;
    setSaving(false);
  }, []);

  const dialog = saving
    ? createElement(SaveLayoutDialog, {
        onSave,
        onCancel: () => setSaving(false),
      })
    : null;

  return { commands, paletteActions, runPaletteAction, dialog };
}
