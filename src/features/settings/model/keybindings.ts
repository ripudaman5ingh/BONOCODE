import {
  ALT,
  IS_MAC,
  MOD,
  SHIFT,
} from "../../../platform/tauri/platform";
import {
  canonicalShortcut,
  shortcutFromKeyEvent,
  shortcutLabel,
  shortcutTokens,
} from "./shortcutFormat";

const CTRL = IS_MAC ? "⌃" : "Ctrl+";

export type KeybindingRow = {
  command: string;
  keys: string;
  when: string;
};

/**
 * Mirrors the bindings we actually handle: the native menu accelerators in
 * `src-tauri/src/menu.rs`, `tabCommand`, the window key handler in App, and
 * focused surface handlers such as the draft composer workspace toggle.
 */
export const KEYBINDINGS: KeybindingRow[] = [
  { command: "App: Settings", keys: `${MOD},`, when: "Always" },
  { command: "App: Search", keys: `${MOD}K`, when: "Always" },
  { command: "App: Go to File", keys: `${MOD}P`, when: "Always" },
  { command: "App: Command Palette", keys: `${MOD}${SHIFT}P`, when: "Always" },
  { command: "App: Find in Files", keys: `${MOD}${SHIFT}F`, when: "Always" },
  { command: "App: Open Project", keys: `${MOD}O`, when: "Always" },
  { command: "App: New Window", keys: `${MOD}${SHIFT}N`, when: "Always" },
  { command: "App: Toggle Sidebar", keys: `${MOD}B`, when: "Always" },
  {
    command: "App: Toggle Session Sidebar",
    keys: `${MOD}${SHIFT}B`,
    when: "Always",
  },
  { command: "App: Switch Model", keys: `${MOD}.`, when: "Always" },
  {
    command: "Composer: Toggle Workspace",
    keys: `${MOD}${SHIFT}G`,
    when: "Draft session composer",
  },
  { command: "View: Reload", keys: `${MOD}${SHIFT}R`, when: "Always" },
  { command: "View: Zoom In", keys: `${MOD}+`, when: "Always" },
  { command: "View: Zoom Out", keys: `${MOD}-`, when: "Always" },
  { command: "View: Reset Zoom", keys: `${MOD}0`, when: "Always" },
  { command: "Tab: New", keys: `${MOD}T`, when: "Always" },
  { command: "Tab: Close Others", keys: `${MOD}${ALT}T`, when: "Always" },
  { command: "Tab: Close All", keys: `${MOD}${SHIFT}W`, when: "Always" },
  { command: "Tab: Next", keys: `${MOD}${SHIFT}]`, when: "Always" },
  { command: "Tab: Previous", keys: `${MOD}${SHIFT}[`, when: "Always" },
  { command: "Tab: Cycle Next", keys: `${CTRL}Tab`, when: "Always" },
  {
    command: "Tab: Cycle Previous",
    keys: `${CTRL}${SHIFT}Tab`,
    when: "Always",
  },
  { command: "Tab: Back", keys: `${MOD}[`, when: "Always" },
  { command: "Tab: Forward", keys: `${MOD}]`, when: "Always" },
  { command: "Tab: Activate 1–8", keys: `${MOD}1 … ${MOD}8`, when: "Always" },
  { command: "Tab: Activate Last", keys: `${MOD}9`, when: "Always" },
  {
    command: "Session: Archive",
    keys: `${MOD}${SHIFT}A`,
    when: "sessionFocus && !overlay",
  },
  {
    command: "Session: Previous",
    keys: `${MOD}${SHIFT}↑`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Session: Next",
    keys: `${MOD}${SHIFT}↓`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Session: Previous in Current Tab",
    keys: `${MOD}↑`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Session: Next in Current Tab",
    keys: `${MOD}↓`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Project: Previous",
    keys: `${MOD}${SHIFT}←`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Project: Next",
    keys: `${MOD}${SHIFT}→`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  { command: "Pane: Close", keys: `${MOD}W`, when: "Always" },
  { command: "Pane: Split Right", keys: `${MOD}D`, when: "!editorFocus" },
  {
    command: "Pane: Split Down",
    keys: `${MOD}${SHIFT}D`,
    when: "!editorFocus",
  },
  { command: "Pane: Focus Left", keys: `${MOD}${ALT}←`, when: "Always" },
  { command: "Pane: Focus Right", keys: `${MOD}${ALT}→`, when: "Always" },
  { command: "Pane: Focus Up", keys: `${MOD}${ALT}↑`, when: "Always" },
  { command: "Pane: Focus Down", keys: `${MOD}${ALT}↓`, when: "Always" },
  { command: "Terminal: New", keys: `${MOD}\``, when: "Always" },
  { command: "Terminal: New Tab", keys: `${MOD}${SHIFT}\``, when: "Always" },
  { command: "Terminal: Toggle Dock", keys: `${MOD}J`, when: "Always" },
  { command: "Changes: Toggle Dock", keys: `${MOD}${ALT}B`, when: "Always" },
  { command: "Layout: Reset", keys: "", when: "Always" },
  { command: "Layout: Next", keys: `${MOD}${ALT}L`, when: "Always" },
  { command: "Editor: Find", keys: `${MOD}F`, when: "editorFocus" },
  { command: "Editor: Replace", keys: `${MOD}${ALT}F`, when: "editorFocus" },
];

const KEYBINDING_OVERRIDES_KEY = "bonocode.keybindingOverrides";
const KEYBINDINGS_CHANGE_EVENT = "bonocode:keybindings-change";

export type KeybindingOverride = {
  disabled?: boolean;
  shortcut?: string;
};

export type KeybindingOverrides = Record<string, KeybindingOverride>;

const VALID_COMMANDS = new Set(KEYBINDINGS.map((row) => row.command));

const KEY_CODES: Record<string, string> = {
  " ": "Space",
  Enter: "Enter",
  Space: "Space",
  Tab: "Tab",
  "`": "Backquote",
  "[": "BracketLeft",
  "]": "BracketRight",
  ",": "Comma",
  ".": "Period",
  "+": "Equal",
  "-": "Minus",
  "\\": "Backslash",
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  "←": "ArrowLeft",
  "→": "ArrowRight",
};

const DISPLAY_MODIFIERS: [string, string][] = IS_MAC
  ? [
      ["⌘", "Command"],
      ["⌃", "Control"],
      ["⌥", "Option"],
      ["⇧", "Shift"],
    ]
  : [
      ["Ctrl+", "Control"],
      ["Alt+", "Option"],
      ["Shift+", "Shift"],
    ];

const ACTIVATE_RANGE_COMMAND = "Tab: Activate 1–8";

/**
 * Every chord a command owns by default, in stored form. Grouped rows expand
 * to one chord per key so a rebind can never shadow a working shortcut.
 */
function defaultShortcutsFor(command: string): string[] {
  const row = KEYBINDINGS.find((entry) => entry.command === command);
  if (!row) return [];
  let rest = row.keys;
  const modifiers: string[] = [];
  for (const [display, modifier] of DISPLAY_MODIFIERS) {
    if (rest.startsWith(display)) {
      modifiers.push(modifier);
      rest = rest.slice(display.length);
    }
  }
  const chords = (code: string) => {
    const value = canonicalShortcut(
      modifiers.length ? [...modifiers, code].join("+") : code,
    );
    return value ? [value] : [];
  };
  if (row.keys.includes("…")) {
    return [1, 2, 3, 4, 5, 6, 7, 8].flatMap((digit) =>
      chords(`Digit${digit}`),
    );
  }
  if (/^[A-Za-z]$/.test(rest)) return chords(`Key${rest.toUpperCase()}`);
  if (/^[0-9]$/.test(rest)) return chords(`Digit${rest}`);
  if (KEY_CODES[rest]) return chords(KEY_CODES[rest]);
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(rest)) return chords(rest);
  return [];
}

/** Chord to owning command, covering defaults and live overrides. */
function shortcutOwners(): Map<string, string> {
  const owners = new Map<string, string>();
  for (const row of KEYBINDINGS) {
    const chords = defaultShortcutsFor(row.command);
    for (const chord of chords) owners.set(chord, row.command);
  }
  for (const [command, override] of Object.entries(
    loadKeybindingOverrides(),
  )) {
    if (override.shortcut) owners.set(override.shortcut, command);
  }
  return owners;
}

function validateShortcut(command: string, shortcut: string): string {
  const canonical = canonicalShortcut(shortcut);
  if (!canonical) throw new Error("That combination is not a valid shortcut");
  if (command === ACTIVATE_RANGE_COMMAND && !/Digit[1-8]$/.test(canonical)) {
    throw new Error("Tab: Activate 1–8 needs a number key from 1 to 8");
  }
  return canonical;
}

/** Shared by both save paths so no chord can be claimed twice. */
export function validateKeybindingShortcut(
  command: string,
  shortcut: string,
): string {
  const canonical = validateShortcut(command, shortcut);
  const owner = shortcutOwners().get(canonical);
  if (owner && owner !== command) {
    throw new Error(`Already used by ${owner}`);
  }
  return canonical;
}

let cacheStorage: Storage | null = null;
let cacheRaw: string | null = null;
let cacheValue: KeybindingOverrides = {};

function parseKeybindingOverrides(raw: string | null): KeybindingOverrides {
  const value = JSON.parse(raw ?? "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: KeybindingOverrides = {};
  for (const [command, entry] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!VALID_COMMANDS.has(command) || !entry || typeof entry !== "object")
      continue;
    const override = entry as { disabled?: unknown; shortcut?: unknown };
    const disabled = override.disabled === true;
    const shortcut =
      typeof override.shortcut === "string"
        ? (canonicalShortcut(override.shortcut) ?? undefined)
        : undefined;
    if (shortcut) next[command] = { shortcut };
    else if (disabled) next[command] = { disabled: true };
  }
  return next;
}

/** Cached per raw value: this runs several times on every keydown. Returns a fresh object. */
export function loadKeybindingOverrides(): KeybindingOverrides {
  try {
    const storage = localStorage;
    const raw = storage.getItem(KEYBINDING_OVERRIDES_KEY);
    if (cacheStorage === storage && cacheRaw === raw) return { ...cacheValue };
    const next = parseKeybindingOverrides(raw);
    cacheStorage = storage;
    cacheRaw = raw;
    cacheValue = next;
    return { ...next };
  } catch {
    return {};
  }
}

export function saveKeybindingOverride(
  command: string,
  override: KeybindingOverride,
): KeybindingOverrides {
  const next = loadKeybindingOverrides();
  if (override.disabled) next[command] = { disabled: true };
  else if (override.shortcut) {
    const shortcut = validateKeybindingShortcut(command, override.shortcut);
    next[command] = { shortcut };
  } else delete next[command];
  try {
    if (Object.keys(next).length) {
      localStorage.setItem(KEYBINDING_OVERRIDES_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(KEYBINDING_OVERRIDES_KEY);
    }
  } catch {
    throw new Error("Could not save shortcuts");
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(KEYBINDINGS_CHANGE_EVENT));
  }
  return next;
}

export type ShortcutEvent = Pick<KeyboardEvent, "code"> &
  Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

export function shortcutMatches(
  shortcut: string,
  event: ShortcutEvent,
): boolean {
  // Copy the fields: real keyboard events expose modifiers as prototype
  // accessors, so spreading the event would silently drop all of them.
  return (
    shortcutFromKeyEvent({
      code: event.code,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
    }) === shortcut
  );
}

export function matchCustomKeybinding(event: ShortcutEvent): string | null {
  for (const [command, override] of Object.entries(loadKeybindingOverrides())) {
    if (override.shortcut && shortcutMatches(override.shortcut, event)) {
      return command;
    }
  }
  return null;
}

export function keybindingPressed(
  command: string,
  event: ShortcutEvent,
  defaultMatch: boolean,
): boolean {
  const override = loadKeybindingOverrides()[command];
  if (override?.disabled) return false;
  if (override?.shortcut) return shortcutMatches(override.shortcut, event);
  return defaultMatch;
}

export function keybindingShortcutLabel(
  command: string,
  fallback: string,
): string | null {
  const override = loadKeybindingOverrides()[command];
  if (override?.disabled) return null;
  return override?.shortcut
    ? shortcutLabel(override.shortcut)
    : fallback;
}

export function keybindingShortcutTokens(
  command: string,
  fallback: string,
): string | null {
  const override = loadKeybindingOverrides()[command];
  if (override?.disabled) return null;
  return override?.shortcut
    ? shortcutTokens(override.shortcut)
    : fallback;
}

export function subscribeKeybindings(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEYBINDING_OVERRIDES_KEY) onStoreChange();
  };
  window.addEventListener(KEYBINDINGS_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(KEYBINDINGS_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function currentKeybindings(): KeybindingRow[] {
  const overrides = loadKeybindingOverrides();
  return KEYBINDINGS.map((row) => {
    const override = overrides[row.command];
    return {
      ...row,
      keys: override?.disabled
        ? "Disabled"
        : override?.shortcut
          ? shortcutLabel(override.shortcut)
          : row.keys,
    };
  });
}

export function filterKeybindings(
  rows: KeybindingRow[],
  query: string,
): KeybindingRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (row) =>
      row.command.toLowerCase().includes(needle) ||
      row.keys.toLowerCase().includes(needle) ||
      row.when.toLowerCase().includes(needle),
  );
}
