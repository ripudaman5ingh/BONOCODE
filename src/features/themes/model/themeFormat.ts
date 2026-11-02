import { hexToRgb, isHexColor } from "../../../shared/lib/colorUtils";

export type ThemeScheme = "dark" | "light";

export type ThemeColors = {
  background: string;
  foreground: string;
  accent: string;
  /** Message bubbles and primary buttons. Omitted keeps them neutral. */
  userAccent?: string;
  link: string;
  skill: string;
  mention: string;
  heading: string;
  /** Bold text in chat. */
  strong: string;
  /** Search hits in the transcript. */
  searchMatch: string;
};

export type ThemeSelection = {
  subtle: number;
  base: number;
  strong: number;
  hover: number;
  emphasis: number;
};

export const SYNTAX_KEYS = [
  "keyword",
  "callable",
  "string",
  "type",
  "number",
  "comment",
  "property",
  "meta",
  "invalid",
] as const;

export const TERMINAL_KEYS = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

export const STATUS_KEYS = [
  "danger",
  "success",
  "warning",
  "info",
  "merged",
] as const;

/** Errors, additions, warnings, notices and merged items across the UI. */
export type ThemeStatus = Record<(typeof STATUS_KEYS)[number], string>;
/** Code colors for the editor, diffs and chat code blocks. Headings use colors.heading. */
export type ThemeSyntax = Record<(typeof SYNTAX_KEYS)[number], string>;
/** The 16 ANSI colors, keyed like xterm's ITheme. */
export type ThemeTerminal = Record<(typeof TERMINAL_KEYS)[number], string>;

export type Theme = {
  id: string;
  name: string;
  scheme: ThemeScheme;
  colors: ThemeColors;
  status: ThemeStatus;
  syntax: ThemeSyntax;
  terminal: ThemeTerminal;
  /** Percent of the foreground mixed into each selection fill, 0 to 100. */
  selection: ThemeSelection;
  fonts: ThemeFonts;
  /** Window translucency. It only shows in dark themes. */
  glass: ThemeGlass;
};

export type ThemeFonts = {
  /** CSS font-family lists. */
  sans: string;
  mono: string;
  /** Editor and terminal font size in px, 10 to 24. */
  codeSize: number;
};

export type ThemeGlass = {
  sidebarOpacity: number;
  /** 1 keeps the main pane opaque. */
  paneOpacity: number;
  blur: number;
};

export type ParsedTheme = { theme: Theme } | { errors: string[] };

const REQUIRED_COLORS = [
  "background",
  "foreground",
  "accent",
  "link",
  "skill",
  "mention",
  "heading",
  "strong",
  "searchMatch",
] as const;

const SELECTION_KEYS = [
  "subtle",
  "base",
  "strong",
  "hover",
  "emphasis",
] as const;

const COLOR_VARS: Record<(typeof REQUIRED_COLORS)[number], string> = {
  background: "--color-background-base",
  foreground: "--color-content",
  accent: "--color-accent",
  link: "--link-color",
  skill: "--color-skill",
  mention: "--color-mention",
  heading: "--color-markdown-heading",
  strong: "--color-strong",
  searchMatch: "--color-search-match",
};

const SELECTION_VARS: Record<keyof ThemeSelection, string> = {
  subtle: "--selection-subtle-strength",
  base: "--selection-strength",
  strong: "--selection-strong-strength",
  hover: "--selection-hover-strength",
  emphasis: "--selection-emphasis-strength",
};

export const USER_ACCENT_VARS = [
  "--user-accent-color",
  "--user-accent-foreground",
] as const;

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function inRange(
  raw: unknown,
  min: number,
  max: number,
  whole = false,
): raw is number {
  return (
    typeof raw === "number" &&
    Number.isFinite(raw) &&
    raw >= min &&
    raw <= max &&
    (!whole || Number.isInteger(raw))
  );
}

/** A required object whose every key is a #rrggbb color. */
function hexSection<K extends string>(
  value: unknown,
  section: string,
  keys: readonly K[],
  errors: string[],
): Record<K, string> {
  const out: Partial<Record<K, string>> = {};
  if (!isRecord(value)) {
    errors.push(`${section} must be an object`);
  } else {
    for (const key of keys) {
      const raw = value[key];
      if (typeof raw === "string" && isHexColor(raw)) {
        out[key] = raw.toLowerCase();
      } else {
        errors.push(`${section}.${key} must be a #rrggbb color`);
      }
    }
  }
  // Only read when errors is empty, which means every key was filled.
  return out as Record<K, string>;
}

export function terminalCssVar(key: keyof ThemeTerminal): string {
  return `--terminal-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Validates untrusted JSON. Colors come back lowercase; unknown keys are dropped. */
export function parseTheme(value: unknown): ParsedTheme {
  const errors: string[] = [];
  if (!isRecord(value)) return { errors: ["theme must be an object"] };

  const { id, name, scheme } = value;
  if (typeof id !== "string" || !ID_RE.test(id)) {
    errors.push("id must be lowercase kebab-case");
  }
  if (!nonEmptyString(name)) errors.push("name must be a non-empty string");
  if (scheme !== "dark" && scheme !== "light") {
    errors.push('scheme must be "dark" or "light"');
  }

  const colorsIn = isRecord(value.colors) ? value.colors : null;
  if (!colorsIn) errors.push("colors must be an object");
  const color = (key: string, optional = false): string | undefined => {
    const raw = colorsIn?.[key];
    if (raw === undefined && optional) return undefined;
    if (typeof raw === "string" && isHexColor(raw)) return raw.toLowerCase();
    if (colorsIn) errors.push(`colors.${key} must be a #rrggbb color`);
    return undefined;
  };
  const colors: Partial<Record<keyof ThemeColors, string>> = {};
  for (const key of REQUIRED_COLORS) colors[key] = color(key);
  const userAccent = color("userAccent", true);
  const status = hexSection(value.status, "status", STATUS_KEYS, errors);
  const syntax = hexSection(value.syntax, "syntax", SYNTAX_KEYS, errors);
  const terminal = hexSection(value.terminal, "terminal", TERMINAL_KEYS, errors);

  const selectionIn = isRecord(value.selection) ? value.selection : null;
  if (!selectionIn) errors.push("selection must be an object");
  const selection: Partial<ThemeSelection> = {};
  for (const key of SELECTION_KEYS) {
    const raw = selectionIn?.[key];
    if (inRange(raw, 0, 100)) {
      selection[key] = raw;
    } else if (selectionIn) {
      errors.push(`selection.${key} must be a number from 0 to 100`);
    }
  }

  const fontsIn = isRecord(value.fonts) ? value.fonts : null;
  if (!fontsIn) errors.push("fonts must be an object");
  for (const key of ["sans", "mono"] as const) {
    if (fontsIn && !nonEmptyString(fontsIn[key])) {
      errors.push(`fonts.${key} must be a non-empty font-family list`);
    }
  }
  if (fontsIn && !inRange(fontsIn.codeSize, 10, 24, true)) {
    errors.push("fonts.codeSize must be a whole number from 10 to 24");
  }

  const glassIn = isRecord(value.glass) ? value.glass : null;
  if (!glassIn) errors.push("glass must be an object");
  for (const key of ["sidebarOpacity", "paneOpacity"] as const) {
    if (glassIn && !inRange(glassIn[key], 0.15, 1)) {
      errors.push(`glass.${key} must be a number from 0.15 to 1`);
    }
  }
  if (glassIn && !inRange(glassIn.blur, 1, 64, true)) {
    errors.push("glass.blur must be a whole number from 1 to 64");
  }

  if (errors.length > 0) return { errors };
  // Every field was checked above; the casts only restate that for the compiler.
  const checkedColors = colors as Omit<ThemeColors, "userAccent">;
  const checkedFonts = fontsIn as ThemeFonts;
  const checkedGlass = glassIn as ThemeGlass;
  return {
    theme: {
      id: id as string,
      name: name as string,
      scheme: scheme as ThemeScheme,
      colors: userAccent
        ? { ...checkedColors, userAccent }
        : { ...checkedColors },
      status,
      syntax,
      terminal,
      selection: selection as ThemeSelection,
      fonts: {
        sans: checkedFonts.sans,
        mono: checkedFonts.mono,
        codeSize: checkedFonts.codeSize,
      },
      glass: {
        sidebarOpacity: checkedGlass.sidebarOpacity,
        paneOpacity: checkedGlass.paneOpacity,
        blur: checkedGlass.blur,
      },
    },
  };
}

/** WCAG relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Black or white, whichever reads better on the user accent. */
export function accentForeground(color: string): "#000000" | "#ffffff" {
  return luminance(color) > 0.179 ? "#000000" : "#ffffff";
}

export function themeCssVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of REQUIRED_COLORS) vars[COLOR_VARS[key]] = theme.colors[key];
  for (const key of STATUS_KEYS) vars[`--color-${key}`] = theme.status[key];
  vars["--color-warning-foreground"] = accentForeground(theme.status.warning);
  for (const key of SYNTAX_KEYS) vars[`--syntax-${key}`] = theme.syntax[key];
  for (const key of TERMINAL_KEYS) {
    vars[terminalCssVar(key)] = theme.terminal[key];
  }
  for (const key of SELECTION_KEYS) {
    vars[SELECTION_VARS[key]] = `${theme.selection[key]}%`;
  }
  vars["--font-sans"] = theme.fonts.sans;
  vars["--font-mono"] = theme.fonts.mono;
  vars["--font-code-size"] = `${theme.fonts.codeSize}px`;
  vars["--sidebar-opacity"] = String(theme.glass.sidebarOpacity);
  vars["--pane-opacity"] = String(theme.glass.paneOpacity);
  const { userAccent } = theme.colors;
  if (userAccent) {
    vars[USER_ACCENT_VARS[0]] = userAccent;
    vars[USER_ACCENT_VARS[1]] = accentForeground(userAccent);
  }
  return vars;
}

/** Classes on <html> that the theme turns on; the preload script reapplies them. */
export function themeClasses(theme: Theme): string[] {
  const classes: string[] = [];
  if (theme.colors.userAccent) classes.push("has-user-accent");
  if (theme.glass.paneOpacity < 1) classes.push("glass-body");
  return classes;
}

export function themeWarnings(theme: Theme): string[] {
  const { background, foreground, accent, strong } = theme.colors;
  const warnings: string[] = [];
  const text = contrastRatio(foreground, background);
  if (text < 4.5) {
    warnings.push(
      `foreground on background has contrast ${text.toFixed(2)}, below 4.5`,
    );
  }
  const strongRatio = contrastRatio(strong, background);
  if (strongRatio < 4.5) {
    warnings.push(
      `strong on background has contrast ${strongRatio.toFixed(2)}, below 4.5`,
    );
  }
  const accentRatio = contrastRatio(accent, background);
  if (accentRatio < 3) {
    warnings.push(
      `accent on background has contrast ${accentRatio.toFixed(2)}, below 3`,
    );
  }
  for (const key of STATUS_KEYS) {
    const ratio = contrastRatio(theme.status[key], background);
    if (ratio < 3) {
      warnings.push(
        `status ${key} on background has contrast ${ratio.toFixed(2)}, below 3`,
      );
    }
  }
  // Terminal colors are left out: ANSI black on a dark background is normal.
  for (const key of SYNTAX_KEYS) {
    const ratio = contrastRatio(theme.syntax[key], background);
    if (ratio < 3) {
      warnings.push(
        `syntax ${key} on background has contrast ${ratio.toFixed(2)}, below 3`,
      );
    }
  }
  return warnings;
}
