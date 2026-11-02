import { describe, expect, it } from "vitest";
import bonocodeDark from "./builtin/bonocode-dark.json";
import bonocodeLight from "./builtin/bonocode-light.json";
import {
  contrastRatio,
  parseTheme,
  themeCssVars,
  themeWarnings,
  type Theme,
} from "./themeFormat";

const SANS =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';
const MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const DARK: Theme = {
  id: "bonocode-dark",
  name: "Bonocode Dark",
  scheme: "dark",
  colors: {
    background: "#171717",
    foreground: "#ebebeb",
    accent: "#459bf7",
    link: "#7dd3fc",
    skill: "#e8c547",
    mention: "#38bdf8",
    heading: "#f9a8c9",
  },
  status: {
    danger: "#f87171",
    success: "#34d399",
    warning: "#fbbf24",
    info: "#38bdf8",
    merged: "#a78bfa",
  },
  // HIGHLIGHT_PALETTE.dark from editorLanguage.ts before themes owned it.
  syntax: {
    keyword: "#ff8ffd",
    callable: "#a5d5fe",
    string: "#b4fa72",
    type: "#ff8272",
    number: "#b4fa72",
    comment: "#fefdc2",
    property: "#d0d1fe",
    meta: "#8e8e8e",
    invalid: "#ffc4bd",
  },
  // ANSI_DARK from TerminalView.tsx before themes owned it.
  terminal: {
    black: "#1d2428",
    red: "#f87171",
    green: "#4ade80",
    yellow: "#fbbf24",
    blue: "#60a5fa",
    magenta: "#c084fc",
    cyan: "#22d3ee",
    white: "#e8eef2",
    brightBlack: "#64748b",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fde68a",
    brightBlue: "#93c5fd",
    brightMagenta: "#d8b4fe",
    brightCyan: "#67e8f9",
    brightWhite: "#f8fafc",
  },
  selection: { subtle: 8, base: 10, strong: 12, hover: 15, emphasis: 20 },
  fonts: { sans: SANS, mono: MONO },
};

const LIGHT: Theme = {
  id: "bonocode-light",
  name: "Bonocode Light",
  scheme: "light",
  colors: {
    background: "#f7f7f7",
    foreground: "#2e2e2e",
    accent: "#459bf7",
    link: "#0863c4",
    skill: "#a07c10",
    mention: "#0284c7",
    heading: "#be185d",
  },
  status: {
    danger: "#dc2626",
    success: "#059669",
    warning: "#b45309",
    info: "#0284c7",
    merged: "#7c3aed",
  },
  // HIGHLIGHT_PALETTE.light from editorLanguage.ts.
  syntax: {
    keyword: "#a626a4",
    callable: "#4078f2",
    string: "#50a14f",
    type: "#c18401",
    number: "#986801",
    comment: "#8a9199",
    property: "#e45649",
    meta: "#5c6370",
    invalid: "#cf222e",
  },
  // ANSI_LIGHT from TerminalView.tsx.
  terminal: {
    black: "#383a42",
    red: "#e45649",
    green: "#50a14f",
    yellow: "#c18401",
    blue: "#4078f2",
    magenta: "#a626a4",
    cyan: "#0184bc",
    white: "#fafafa",
    brightBlack: "#7c8591",
    brightRed: "#df6b60",
    brightGreen: "#68b567",
    brightYellow: "#d19a2f",
    brightBlue: "#5c89f5",
    brightMagenta: "#b54bb3",
    brightCyan: "#1f9cc9",
    brightWhite: "#ffffff",
  },
  selection: { subtle: 5, base: 6, strong: 7, hover: 10, emphasis: 14 },
  fonts: { sans: SANS, mono: MONO },
};

function parsed(value: unknown): Theme {
  const result = parseTheme(value);
  if ("errors" in result) throw new Error(result.errors.join("; "));
  return result.theme;
}

function errorsFor(value: unknown): string[] {
  const result = parseTheme(value);
  return "errors" in result ? result.errors : [];
}

/** A deep copy of the dark theme with one top-level field replaced. */
function withField(key: string, value: unknown): Record<string, unknown> {
  return { ...structuredClone(DARK), [key]: value };
}

describe("built-in themes", () => {
  it("parse and reproduce today's default look exactly", () => {
    expect(parsed(bonocodeDark)).toEqual(DARK);
    expect(parsed(bonocodeLight)).toEqual(LIGHT);
  });
});

describe("parseTheme", () => {
  it("accepts a valid theme with a user accent", () => {
    const theme = parsed({
      ...DARK,
      colors: { ...DARK.colors, userAccent: "#ec4899" },
    });
    expect(theme.colors.userAccent).toBe("#ec4899");
  });

  it("rejects non-objects", () => {
    expect(errorsFor(null)).not.toEqual([]);
    expect(errorsFor("theme")).not.toEqual([]);
    expect(errorsFor([])).not.toEqual([]);
  });

  it("rejects missing fields", () => {
    for (const key of [
      "id",
      "name",
      "scheme",
      "colors",
      "status",
      "syntax",
      "terminal",
      "selection",
      "fonts",
    ]) {
      const value: Record<string, unknown> = structuredClone(DARK);
      delete value[key];
      expect(errorsFor(value), key).not.toEqual([]);
    }
    const noLink: Record<string, unknown> = { ...DARK.colors };
    delete noLink.link;
    expect(errorsFor(withField("colors", noLink))).toEqual([
      "colors.link must be a #rrggbb color",
    ]);
  });

  it("rejects colors that are not #rrggbb", () => {
    for (const color of ["#fff", "red", "rgb(0,0,0)", "#12345g", "171717", 0]) {
      expect(
        errorsFor(withField("colors", { ...DARK.colors, background: color })),
        String(color),
      ).toEqual(["colors.background must be a #rrggbb color"]);
    }
    expect(
      errorsFor(withField("colors", { ...DARK.colors, userAccent: "blue" })),
    ).toEqual(["colors.userAccent must be a #rrggbb color"]);
  });

  it("rejects a missing or non-hex status color", () => {
    const noMerged: Record<string, unknown> = { ...DARK.status };
    delete noMerged.merged;
    expect(errorsFor(withField("status", noMerged))).toEqual([
      "status.merged must be a #rrggbb color",
    ]);
    expect(
      errorsFor(withField("status", { ...DARK.status, danger: "red" })),
    ).toEqual(["status.danger must be a #rrggbb color"]);
  });

  it("rejects a missing or non-hex syntax or terminal color", () => {
    const noComment: Record<string, unknown> = { ...DARK.syntax };
    delete noComment.comment;
    expect(errorsFor(withField("syntax", noComment))).toEqual([
      "syntax.comment must be a #rrggbb color",
    ]);
    expect(
      errorsFor(withField("syntax", { ...DARK.syntax, keyword: "#fff" })),
    ).toEqual(["syntax.keyword must be a #rrggbb color"]);
    const noBrightBlack: Record<string, unknown> = { ...DARK.terminal };
    delete noBrightBlack.brightBlack;
    expect(errorsFor(withField("terminal", noBrightBlack))).toEqual([
      "terminal.brightBlack must be a #rrggbb color",
    ]);
    expect(
      errorsFor(withField("terminal", { ...DARK.terminal, red: "red" })),
    ).toEqual(["terminal.red must be a #rrggbb color"]);
    expect(errorsFor(withField("terminal", "dark"))).toEqual([
      "terminal must be an object",
    ]);
  });

  it("rejects a bad scheme", () => {
    expect(errorsFor(withField("scheme", "system"))).toEqual([
      'scheme must be "dark" or "light"',
    ]);
  });

  it("rejects ids that are not lowercase kebab-case", () => {
    for (const id of ["Bonocode", "bono code", "bono_code", "-bono", "bono-", "a--b", ""]) {
      expect(errorsFor(withField("id", id)), id).toEqual([
        "id must be lowercase kebab-case",
      ]);
    }
  });

  it("rejects selection strengths outside 0 to 100", () => {
    for (const value of [-1, 101, Number.NaN, "10"]) {
      expect(
        errorsFor(withField("selection", { ...DARK.selection, hover: value })),
        String(value),
      ).toEqual(["selection.hover must be a number from 0 to 100"]);
    }
    expect(
      parsed(withField("selection", { ...DARK.selection, subtle: 0, emphasis: 100 }))
        .selection,
    ).toMatchObject({ subtle: 0, emphasis: 100 });
  });

  it("rejects empty fonts", () => {
    expect(errorsFor(withField("fonts", { sans: "", mono: MONO }))).toEqual([
      "fonts.sans must be a non-empty font-family list",
    ]);
    expect(errorsFor(withField("fonts", { sans: SANS, mono: "   " }))).toEqual([
      "fonts.mono must be a non-empty font-family list",
    ]);
  });

  it("lowercases uppercase hex", () => {
    const theme = parsed(
      withField("colors", {
        ...DARK.colors,
        accent: "#459BF7",
        userAccent: "#ABCDEF",
      }),
    );
    expect(theme.colors.accent).toBe("#459bf7");
    expect(theme.colors.userAccent).toBe("#abcdef");
    expect(
      parsed(withField("syntax", { ...DARK.syntax, keyword: "#FF8FFD" })).syntax
        .keyword,
    ).toBe("#ff8ffd");
  });
});

describe("themeCssVars", () => {
  it("maps every field to its CSS variable", () => {
    const theme: Theme = {
      ...DARK,
      colors: { ...DARK.colors, userAccent: "#ffffff" },
    };
    expect(themeCssVars(theme)).toEqual({
      "--color-background-base": "#171717",
      "--color-content": "#ebebeb",
      "--color-accent": "#459bf7",
      "--link-color": "#7dd3fc",
      "--color-skill": "#e8c547",
      "--color-mention": "#38bdf8",
      "--color-markdown-heading": "#f9a8c9",
      "--color-danger": "#f87171",
      "--color-success": "#34d399",
      "--color-warning": "#fbbf24",
      "--color-info": "#38bdf8",
      "--color-merged": "#a78bfa",
      "--color-warning-foreground": "#000000",
      "--syntax-keyword": "#ff8ffd",
      "--syntax-callable": "#a5d5fe",
      "--syntax-string": "#b4fa72",
      "--syntax-type": "#ff8272",
      "--syntax-number": "#b4fa72",
      "--syntax-comment": "#fefdc2",
      "--syntax-property": "#d0d1fe",
      "--syntax-meta": "#8e8e8e",
      "--syntax-invalid": "#ffc4bd",
      "--terminal-black": "#1d2428",
      "--terminal-red": "#f87171",
      "--terminal-green": "#4ade80",
      "--terminal-yellow": "#fbbf24",
      "--terminal-blue": "#60a5fa",
      "--terminal-magenta": "#c084fc",
      "--terminal-cyan": "#22d3ee",
      "--terminal-white": "#e8eef2",
      "--terminal-bright-black": "#64748b",
      "--terminal-bright-red": "#fca5a5",
      "--terminal-bright-green": "#86efac",
      "--terminal-bright-yellow": "#fde68a",
      "--terminal-bright-blue": "#93c5fd",
      "--terminal-bright-magenta": "#d8b4fe",
      "--terminal-bright-cyan": "#67e8f9",
      "--terminal-bright-white": "#f8fafc",
      "--selection-subtle-strength": "8%",
      "--selection-strength": "10%",
      "--selection-strong-strength": "12%",
      "--selection-hover-strength": "15%",
      "--selection-emphasis-strength": "20%",
      "--font-sans": SANS,
      "--font-mono": MONO,
      "--user-accent-color": "#ffffff",
      "--user-accent-foreground": "#000000",
    });
  });

  it("leaves out the user accent variables without a user accent", () => {
    const vars = themeCssVars(DARK);
    expect(vars).not.toHaveProperty("--user-accent-color");
    expect(vars).not.toHaveProperty("--user-accent-foreground");
  });

  it("puts white text on a dark user accent", () => {
    const vars = themeCssVars({
      ...DARK,
      colors: { ...DARK.colors, userAccent: "#1e3a8a" },
    });
    expect(vars["--user-accent-foreground"]).toBe("#ffffff");
  });

  it("puts white text on a dark warning color", () => {
    const vars = themeCssVars({
      ...DARK,
      status: { ...DARK.status, warning: "#78350f" },
    });
    expect(vars["--color-warning-foreground"]).toBe("#ffffff");
  });
});

describe("contrast", () => {
  it("computes the WCAG ratio", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#ffffff", "#000000")).toBe(21);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });

  it("warns on low-contrast foreground and accent", () => {
    const warnings = themeWarnings({
      ...DARK,
      colors: { ...DARK.colors, foreground: "#333333", accent: "#222222" },
    });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/^foreground on background/);
    expect(warnings[1]).toMatch(/^accent on background/);
  });

  it("warns on low-contrast status colors", () => {
    const warnings = themeWarnings({
      ...DARK,
      status: { ...DARK.status, merged: "#333333" },
    });
    expect(warnings).toEqual([
      "status merged on background has contrast 1.42, below 3",
    ]);
  });

  it("warns on low-contrast syntax colors but never terminal colors", () => {
    const warnings = themeWarnings({
      ...DARK,
      syntax: { ...DARK.syntax, comment: "#333333" },
      terminal: { ...DARK.terminal, white: "#171717" },
    });
    expect(warnings).toEqual([
      "syntax comment on background has contrast 1.42, below 3",
    ]);
  });

  it("has no warnings for the dark built-in", () => {
    expect(themeWarnings(DARK)).toEqual([]);
  });

  // Today's light accent and three light syntax colors sit just under 3:1.
  // A later change retunes the light theme.
  it("flags the accent and three syntax colors for the light built-in", () => {
    expect(themeWarnings(LIGHT)).toEqual([
      "accent on background has contrast 2.69, below 3",
      "syntax string on background has contrast 2.99, below 3",
      "syntax type on background has contrast 2.98, below 3",
      "syntax comment on background has contrast 2.97, below 3",
    ]);
  });
});
