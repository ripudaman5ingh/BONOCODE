import { useMemo } from "react";
import {
  applyColorScheme,
  applySidebarBlur,
} from "../../settings/model/appearance";
import { defineSetting } from "../../settings/model/defineSetting";
import bonocodeDark from "./builtin/bonocode-dark.json";
import bonocodeLight from "./builtin/bonocode-light.json";
import catppuccinLatte from "./builtin/catppuccin-latte.json";
import catppuccinMocha from "./builtin/catppuccin-mocha.json";
import dracula from "./builtin/dracula.json";
import {
  parseTheme,
  themeClasses,
  themeCssVars,
  USER_ACCENT_VARS,
  type Theme,
} from "./themeFormat";

export const DEFAULT_THEME_ID = "bonocode-dark";
export const THEME_CHANGE_EVENT = "bonocode:theme-change";
export const USER_THEMES_CHANGE_EVENT = "bonocode:user-themes-change";
/** Read by the inline script in index.html so the first paint already has the theme. */
export const THEME_CACHE_KEY = "bonocode.themeCache";

function builtin(value: unknown): Theme {
  const result = parseTheme(value);
  if ("errors" in result) {
    throw new Error(`Invalid built-in theme: ${result.errors.join("; ")}`);
  }
  return result.theme;
}

const BUILTIN_THEMES: readonly Theme[] = [
  builtin(bonocodeDark),
  builtin(bonocodeLight),
  builtin(catppuccinMocha),
  builtin(catppuccinLatte),
  builtin(dracula),
];

const BUILTIN_IDS = new Set(BUILTIN_THEMES.map((theme) => theme.id));
const NO_THEMES: readonly Theme[] = [];

let parsedRaw: string | null = null;
let parsedThemes: readonly Theme[] = NO_THEMES;

/**
 * Valid entries only, minus any id a built-in or an earlier entry already uses.
 * One array per stored string, so userThemes.use() gets a stable snapshot.
 */
function parseUserThemes(raw: string | null): readonly Theme[] {
  if (raw === parsedRaw) return parsedThemes;
  let entries: unknown = [];
  try {
    entries = raw ? JSON.parse(raw) : [];
  } catch {
    // Unreadable storage reads as no user themes.
  }
  const taken = new Set(BUILTIN_IDS);
  const themes: Theme[] = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const result = parseTheme(entry);
    if ("errors" in result || taken.has(result.theme.id)) continue;
    taken.add(result.theme.id);
    themes.push(result.theme);
  }
  parsedRaw = raw;
  parsedThemes = themes.length > 0 ? themes : NO_THEMES;
  return parsedThemes;
}

export const userThemes = defineSetting<readonly Theme[]>({
  key: "bonocode.userThemes",
  default: NO_THEMES,
  parse: parseUserThemes,
  serialize: (themes) => JSON.stringify(themes),
  event: USER_THEMES_CHANGE_EVENT,
});

export function listThemes(): readonly Theme[] {
  return [...BUILTIN_THEMES, ...userThemes.load()];
}

/** listThemes() for React, re-rendering when user themes change. */
export function useThemes(): readonly Theme[] {
  const user = userThemes.use();
  return useMemo(() => [...BUILTIN_THEMES, ...user], [user]);
}

export function isBuiltinTheme(id: string): boolean {
  return BUILTIN_IDS.has(id);
}

function findTheme(id: string): Theme | undefined {
  return listThemes().find((theme) => theme.id === id);
}

export const activeTheme = defineSetting<string>({
  key: "bonocode.theme",
  default: DEFAULT_THEME_ID,
  parse: (raw) => (raw != null && findTheme(raw) ? raw : undefined),
  event: THEME_CHANGE_EVENT,
});

export function getActiveTheme(): Theme {
  return findTheme(activeTheme.load()) ?? BUILTIN_THEMES[0];
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const vars = themeCssVars(theme);
  for (const name of USER_ACCENT_VARS) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  const classes = themeClasses(theme);
  for (const name of ["has-user-accent", "glass-body"]) {
    root.classList.toggle(name, classes.includes(name));
  }
  applySidebarBlur(theme.glass.blur);
  // After the variables and classes, so the native window picks up the new
  // background and glass.
  applyColorScheme(theme.scheme);
  try {
    localStorage.setItem(
      THEME_CACHE_KEY,
      JSON.stringify({ scheme: theme.scheme, vars, classes }),
    );
  } catch {
    // Private mode / quota: the next launch paints the CSS defaults first.
  }
}

export function setTheme(id: string) {
  const theme = findTheme(id) ?? BUILTIN_THEMES[0];
  applyTheme(theme);
  activeTheme.save(theme.id);
}

export function initTheme() {
  applyTheme(getActiveTheme());
}

/** Applies a theme without making it the active one. */
export function previewTheme(theme: Theme) {
  applyTheme(theme);
}

/** Adds or replaces a user theme. Built-in ids are left alone. */
export function saveUserTheme(theme: Theme) {
  if (isBuiltinTheme(theme.id)) return;
  const themes = userThemes.load();
  userThemes.save(
    themes.some((saved) => saved.id === theme.id)
      ? themes.map((saved) => (saved.id === theme.id ? theme : saved))
      : [...themes, theme],
  );
}

/** A new user theme named "<name> copy", with the first free "<id>-copy[-n]" id. */
export function duplicateTheme(id: string): Theme | undefined {
  const source = findTheme(id);
  if (!source) return undefined;
  const taken = new Set(listThemes().map((theme) => theme.id));
  let copyId = `${source.id}-copy`;
  for (let n = 2; taken.has(copyId); n += 1) copyId = `${source.id}-copy-${n}`;
  const copy: Theme = {
    ...structuredClone(source),
    id: copyId,
    name: `${source.name} copy`,
  };
  saveUserTheme(copy);
  return copy;
}

export function renameUserTheme(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const theme = userThemes.load().find((saved) => saved.id === id);
  if (theme) saveUserTheme({ ...theme, name: trimmed });
}

/** Removes a user theme; when it was active, Bonocode Dark takes over. */
export function deleteUserTheme(id: string) {
  const wasActive = activeTheme.load() === id;
  userThemes.save(userThemes.load().filter((theme) => theme.id !== id));
  if (wasActive) setTheme(DEFAULT_THEME_ID);
}
