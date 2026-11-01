import {
  clampDockSize,
  defaultDockSize,
  isDockSide,
} from "../../projects/model/projectTerminal";
import { INITIAL_CHANGES_DOCK, type DockPlacement } from "./dockLayout";

/** What a preset sets. The terminal dock is the current project's. */
export type LayoutState = {
  projectRailOpen: boolean;
  sessionSidebarOpen: boolean;
  changesDock: DockPlacement;
  terminalDock: DockPlacement;
};

export type LayoutPreset = LayoutState & { name: string };

export const LAYOUT_PRESETS_KEY = "bonocode.layoutPresets";

const TERMINAL_CLOSED: DockPlacement = {
  side: "bottom",
  size: defaultDockSize("bottom"),
  open: false,
};

/** A project's terminal dock as a preset sees it; no dock reads as closed. */
export function terminalPlacement(
  dock: DockPlacement | undefined,
): DockPlacement {
  return dock ? { side: dock.side, size: dock.size, open: dock.open } : TERMINAL_CLOSED;
}

export const BUILT_IN_LAYOUT_PRESETS: readonly LayoutPreset[] = [
  {
    name: "Default",
    projectRailOpen: true,
    sessionSidebarOpen: true,
    changesDock: INITIAL_CHANGES_DOCK,
    terminalDock: TERMINAL_CLOSED,
  },
  {
    name: "Focus",
    projectRailOpen: false,
    sessionSidebarOpen: false,
    changesDock: { ...INITIAL_CHANGES_DOCK, open: false },
    terminalDock: TERMINAL_CLOSED,
  },
  {
    name: "Review",
    projectRailOpen: true,
    sessionSidebarOpen: true,
    changesDock: { side: "right", size: 760, open: true },
    terminalDock: TERMINAL_CLOSED,
  },
];

export const DEFAULT_LAYOUT_PRESET = BUILT_IN_LAYOUT_PRESETS[0]!;

export function isBuiltInPresetName(name: string): boolean {
  const key = name.trim().toLowerCase();
  return BUILT_IN_LAYOUT_PRESETS.some((preset) => preset.name.toLowerCase() === key);
}

export function capturePreset(name: string, current: LayoutState): LayoutPreset {
  return {
    name: name.trim(),
    projectRailOpen: current.projectRailOpen,
    sessionSidebarOpen: current.sessionSidebarOpen,
    changesDock: { ...current.changesDock },
    terminalDock: { ...current.terminalDock },
  };
}

/** The placements a preset asks for, with dock sizes clamped to the window. */
export function applyPreset(
  preset: LayoutPreset,
  viewport?: { width: number; height: number },
): LayoutState {
  const fit = (dock: DockPlacement): DockPlacement => ({
    ...dock,
    size: clampDockSize(dock.side, dock.size, viewport),
  });
  return {
    projectRailOpen: preset.projectRailOpen,
    sessionSidebarOpen: preset.sessionSidebarOpen,
    changesDock: fit(preset.changesDock),
    terminalDock: fit(preset.terminalDock),
  };
}

/** The preset after `last` in `names`, wrapping; Default when `last` is unknown. */
export function nextPresetName(
  names: readonly string[],
  last: string | null,
): string {
  const index = last == null ? -1 : names.indexOf(last);
  return names[(index + 1) % names.length] ?? DEFAULT_LAYOUT_PRESET.name;
}

function parsePlacement(raw: unknown): DockPlacement | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!isDockSide(value.side)) return null;
  if (typeof value.size !== "number" || !Number.isFinite(value.size)) return null;
  if (typeof value.open !== "boolean") return null;
  return { side: value.side, size: value.size, open: value.open };
}

function parsePreset(raw: unknown): LayoutPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.name !== "string" || !value.name.trim()) return null;
  if (isBuiltInPresetName(value.name)) return null;
  if (typeof value.projectRailOpen !== "boolean") return null;
  if (typeof value.sessionSidebarOpen !== "boolean") return null;
  const changesDock = parsePlacement(value.changesDock);
  const terminalDock = parsePlacement(value.terminalDock);
  if (!changesDock || !terminalDock) return null;
  return {
    name: value.name.trim(),
    projectRailOpen: value.projectRailOpen,
    sessionSidebarOpen: value.sessionSidebarOpen,
    changesDock,
    terminalDock,
  };
}

/** Saved user presets. Malformed, built-in-named and repeated entries are dropped. */
export function parseUserPresets(raw: unknown): LayoutPreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const presets: LayoutPreset[] = [];
  for (const entry of raw) {
    const preset = parsePreset(entry);
    if (!preset || seen.has(preset.name.toLowerCase())) continue;
    seen.add(preset.name.toLowerCase());
    presets.push(preset);
  }
  return presets;
}

export function loadUserPresets(): LayoutPreset[] {
  try {
    const raw = localStorage.getItem(LAYOUT_PRESETS_KEY);
    return raw ? parseUserPresets(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function storeUserPresets(presets: readonly LayoutPreset[]): void {
  try {
    localStorage.setItem(LAYOUT_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Storage can be full or blocked; the presets still apply this session.
  }
}

/**
 * Adds or replaces a user preset by name, case-insensitively. Built-in names
 * are refused, so the list comes back unchanged.
 */
export function withUserPreset(
  presets: readonly LayoutPreset[],
  preset: LayoutPreset,
): LayoutPreset[] {
  if (!preset.name || isBuiltInPresetName(preset.name)) return [...presets];
  const key = preset.name.toLowerCase();
  const index = presets.findIndex((entry) => entry.name.toLowerCase() === key);
  if (index < 0) return [...presets, preset];
  return presets.map((entry, i) => (i === index ? preset : entry));
}

export function withoutUserPreset(
  presets: readonly LayoutPreset[],
  name: string,
): LayoutPreset[] {
  return presets.filter((preset) => preset.name !== name);
}

export function saveUserPreset(preset: LayoutPreset): LayoutPreset[] {
  const next = withUserPreset(loadUserPresets(), preset);
  storeUserPresets(next);
  return next;
}

export function deleteUserPreset(name: string): LayoutPreset[] {
  const next = withoutUserPreset(loadUserPresets(), name);
  storeUserPresets(next);
  return next;
}
