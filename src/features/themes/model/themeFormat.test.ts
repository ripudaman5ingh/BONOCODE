import { describe, expect, it } from "vitest";
import bonocodeDark from "./builtin/bonocode-dark.json";
import bonocodeLight from "./builtin/bonocode-light.json";
import catppuccinLatte from "./builtin/catppuccin-latte.json";
import catppuccinMocha from "./builtin/catppuccin-mocha.json";
import dracula from "./builtin/dracula.json";
import {
  contrastRatio,
  parseTheme,
  themeClasses,
  themeCssVars,
  themeWarnings,
  type Theme,
  type ThemeColors,
  type ThemeScheme,
  type ThemeSelection,
  type ThemeStatus,
  type ThemeSyntax,
  type ThemeTerminal,
} from "./themeFormat";

const SANS =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';
const MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

// The built-in table from the theme plan: one column per built-in, in
// listThemes order. Every built-in uses today's font stacks, code size 13 and
// glass 0.85 / 0.85 / 24.
type Column = 0 | 1 | 2 | 3 | 4;
type Row = readonly [string, string, string, string, string];

const IDS: Row = ["bonocode-dark", "bonocode-light", "catppuccin-mocha", "catppuccin-latte", "dracula"];
const NAMES: Row = ["Bonocode Dark", "Bonocode Light", "Catppuccin Mocha", "Catppuccin Latte", "Dracula"];
const SCHEMES: readonly ThemeScheme[] = ["dark", "light", "dark", "light", "dark"];
const SELECTIONS: readonly ThemeSelection[] = [
  { subtle: 8, base: 10, strong: 12, hover: 15, emphasis: 20 },
  { subtle: 5, base: 6, strong: 7, hover: 10, emphasis: 14 },
  { subtle: 8, base: 10, strong: 12, hover: 15, emphasis: 20 },
  { subtle: 5, base: 6, strong: 7, hover: 10, emphasis: 14 },
  { subtle: 8, base: 10, strong: 12, hover: 15, emphasis: 20 },
];

const COLORS: Record<keyof Omit<ThemeColors, "userAccent">, Row> = {
  background: ["#171717", "#f7f7f7", "#1e1e2e", "#eff1f5", "#282a36"],
  foreground: ["#ebebeb", "#2e2e2e", "#cdd6f4", "#4c4f69", "#f8f8f2"],
  accent: ["#459bf7", "#2f7fe0", "#cba6f7", "#8839ef", "#bd93f9"],
  link: ["#7dd3fc", "#0863c4", "#89b4fa", "#1e66f5", "#8be9fd"],
  skill: ["#e8c547", "#a07c10", "#f9e2af", "#df8e1d", "#f1fa8c"],
  mention: ["#38bdf8", "#0284c7", "#74c7ec", "#209fb5", "#8be9fd"],
  heading: ["#f9a8c9", "#be185d", "#f5c2e7", "#ea76cb", "#bd93f9"],
  strong: ["#ebebeb", "#2e2e2e", "#cdd6f4", "#4c4f69", "#ffb86c"],
  searchMatch: ["#e2c08d", "#e2c08d", "#f9e2af", "#df8e1d", "#ffb86c"],
};

const STATUS: Record<keyof ThemeStatus, Row> = {
  danger: ["#f87171", "#dc2626", "#f38ba8", "#d20f39", "#ff5555"],
  success: ["#34d399", "#059669", "#a6e3a1", "#40a02b", "#50fa7b"],
  warning: ["#fbbf24", "#b45309", "#fab387", "#fe640b", "#ffb86c"],
  info: ["#38bdf8", "#0284c7", "#89dceb", "#04a5e5", "#8be9fd"],
  merged: ["#a78bfa", "#7c3aed", "#cba6f7", "#8839ef", "#bd93f9"],
};

const SYNTAX: Record<keyof ThemeSyntax, Row> = {
  keyword: ["#ff8ffd", "#a626a4", "#cba6f7", "#8839ef", "#ff79c6"],
  callable: ["#a5d5fe", "#4078f2", "#89b4fa", "#1e66f5", "#50fa7b"],
  string: ["#b4fa72", "#3d8a3c", "#a6e3a1", "#40a02b", "#f1fa8c"],
  type: ["#ff8272", "#a06d00", "#f9e2af", "#df8e1d", "#8be9fd"],
  number: ["#b4fa72", "#986801", "#fab387", "#fe640b", "#bd93f9"],
  comment: ["#fefdc2", "#7d848c", "#9399b2", "#7c7f93", "#6272a4"],
  property: ["#d0d1fe", "#e45649", "#b4befe", "#7287fd", "#f8f8f2"],
  meta: ["#8e8e8e", "#5c6370", "#a6adc8", "#6c6f85", "#6272a4"],
  invalid: ["#ffc4bd", "#cf222e", "#f38ba8", "#d20f39", "#ff5555"],
};

const TERMINAL: Record<keyof ThemeTerminal, Row> = {
  black: ["#1d2428", "#383a42", "#45475a", "#5c5f77", "#21222c"],
  red: ["#f87171", "#e45649", "#f38ba8", "#d20f39", "#ff5555"],
  green: ["#4ade80", "#50a14f", "#a6e3a1", "#40a02b", "#50fa7b"],
  yellow: ["#fbbf24", "#c18401", "#f9e2af", "#df8e1d", "#f1fa8c"],
  blue: ["#60a5fa", "#4078f2", "#89b4fa", "#1e66f5", "#bd93f9"],
  magenta: ["#c084fc", "#a626a4", "#f5c2e7", "#ea76cb", "#ff79c6"],
  cyan: ["#22d3ee", "#0184bc", "#94e2d5", "#179299", "#8be9fd"],
  white: ["#e8eef2", "#fafafa", "#a6adc8", "#acb0be", "#f8f8f2"],
  brightBlack: ["#64748b", "#7c8591", "#585b70", "#6c6f85", "#6272a4"],
  brightRed: ["#fca5a5", "#df6b60", "#f37799", "#de293e", "#ff6e6e"],
  brightGreen: ["#86efac", "#68b567", "#89d88b", "#49af3d", "#69ff94"],
  brightYellow: ["#fde68a", "#d19a2f", "#ebd391", "#eea02d", "#ffffa5"],
  brightBlue: ["#93c5fd", "#5c89f5", "#74a8fc", "#456eff", "#d6acff"],
  brightMagenta: ["#d8b4fe", "#b54bb3", "#f2aede", "#fe85d8", "#ff92df"],
  brightCyan: ["#67e8f9", "#1f9cc9", "#6bd7ca", "#2d9fa8", "#a4ffff"],
  brightWhite: ["#f8fafc", "#ffffff", "#bac2de", "#bcc0cc", "#ffffff"],
};

function column<K extends string>(
  rows: Record<K, Row>,
  index: Column,
): Record<K, string> {
  const out: Partial<Record<K, string>> = {};
  for (const key of Object.keys(rows) as K[]) out[key] = rows[key][index];
  return out as Record<K, string>;
}

function tableTheme(index: Column): Theme {
  return {
    id: IDS[index],
    name: NAMES[index],
    scheme: SCHEMES[index],
    colors: column(COLORS, index),
    status: column(STATUS, index),
    syntax: column(SYNTAX, index),
    terminal: column(TERMINAL, index),
    selection: SELECTIONS[index],
    fonts: { sans: SANS, mono: MONO, codeSize: 13 },
    glass: { sidebarOpacity: 0.85, paneOpacity: 0.85, blur: 24 },
  };
}

const BUILTIN_JSON = [
  bonocodeDark,
  bonocodeLight,
  catppuccinMocha,
  catppuccinLatte,
  dracula,
] as const;

const DARK = tableTheme(0);

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
  it("each parse to exactly the built-in table", () => {
    BUILTIN_JSON.forEach((json, index) => {
      expect(parsed(json), IDS[index]).toEqual(tableTheme(index as Column));
    });
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
      "glass",
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
    const fonts = DARK.fonts;
    expect(errorsFor(withField("fonts", { ...fonts, sans: "" }))).toEqual([
      "fonts.sans must be a non-empty font-family list",
    ]);
    expect(errorsFor(withField("fonts", { ...fonts, mono: "   " }))).toEqual([
      "fonts.mono must be a non-empty font-family list",
    ]);
  });

  it("rejects a code size that is not a whole number from 10 to 24", () => {
    for (const codeSize of [9, 25, 13.5, "13", undefined]) {
      expect(
        errorsFor(withField("fonts", { ...DARK.fonts, codeSize })),
        String(codeSize),
      ).toEqual(["fonts.codeSize must be a whole number from 10 to 24"]);
    }
    for (const codeSize of [10, 24]) {
      expect(parsed(withField("fonts", { ...DARK.fonts, codeSize })).fonts)
        .toMatchObject({ codeSize });
    }
  });

  it("rejects glass outside its ranges", () => {
    for (const value of [0.1, 1.5, "0.5", undefined]) {
      expect(
        errorsFor(withField("glass", { ...DARK.glass, paneOpacity: value })),
        String(value),
      ).toEqual(["glass.paneOpacity must be a number from 0.15 to 1"]);
      expect(
        errorsFor(withField("glass", { ...DARK.glass, sidebarOpacity: value })),
        String(value),
      ).toEqual(["glass.sidebarOpacity must be a number from 0.15 to 1"]);
    }
    for (const blur of [0, 65, 2.5]) {
      expect(
        errorsFor(withField("glass", { ...DARK.glass, blur })),
        String(blur),
      ).toEqual(["glass.blur must be a whole number from 1 to 64"]);
    }
    expect(
      parsed(withField("glass", { sidebarOpacity: 0.15, paneOpacity: 1, blur: 64 }))
        .glass,
    ).toEqual({ sidebarOpacity: 0.15, paneOpacity: 1, blur: 64 });
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
      "--color-strong": "#ebebeb",
      "--color-search-match": "#e2c08d",
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
      "--font-code-size": "13px",
      "--sidebar-opacity": "0.85",
      "--pane-opacity": "0.85",
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

describe("themeClasses", () => {
  it("turns on main pane glass and the user accent only when the theme has them", () => {
    expect(themeClasses(DARK)).toEqual(["glass-body"]);
    expect(
      themeClasses({
        ...DARK,
        colors: { ...DARK.colors, userAccent: "#ec4899" },
        glass: { ...DARK.glass, paneOpacity: 1 },
      }),
    ).toEqual(["has-user-accent"]);
  });
});

describe("contrast", () => {
  it("computes the WCAG ratio", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#ffffff", "#000000")).toBe(21);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });

  it("warns on low-contrast bold text", () => {
    expect(
      themeWarnings({ ...DARK, colors: { ...DARK.colors, strong: "#777777" } }),
    ).toEqual(["strong on background has contrast 4.00, below 4.5"]);
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

  it("has no warnings for any built-in except Catppuccin Latte", () => {
    BUILTIN_JSON.forEach((json, index) => {
      if (IDS[index] === "catppuccin-latte") return;
      expect(themeWarnings(parsed(json)), IDS[index]).toEqual([]);
    });
  });

  // Catppuccin Latte keeps the official palette, whose pastels sit under 3:1
  // on its light base.
  it("flags Catppuccin Latte's official status and syntax colors", () => {
    expect(themeWarnings(parsed(catppuccinLatte))).toEqual([
      "status success on background has contrast 2.96, below 3",
      "status warning on background has contrast 2.64, below 3",
      "status info on background has contrast 2.47, below 3",
      "syntax string on background has contrast 2.96, below 3",
      "syntax type on background has contrast 2.31, below 3",
      "syntax number on background has contrast 2.64, below 3",
      "syntax property on background has contrast 2.81, below 3",
    ]);
  });
});
