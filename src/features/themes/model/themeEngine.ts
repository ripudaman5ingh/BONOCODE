import {
  applyColorScheme,
  applySidebarBlur,
} from "../../settings/model/appearance";
import { defineSetting } from "../../settings/model/defineSetting";
import bonocodeDark from "./builtin/bonocode-dark.json";
import bonocodeLight from "./builtin/bonocode-light.json";
import {
  parseTheme,
  themeClasses,
  themeCssVars,
  USER_ACCENT_VARS,
  type Theme,
} from "./themeFormat";

export const DEFAULT_THEME_ID = "bonocode-dark";
export const THEME_CHANGE_EVENT = "bonocode:theme-change";
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
];

export function listThemes(): readonly Theme[] {
  return BUILTIN_THEMES;
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
