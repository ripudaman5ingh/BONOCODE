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
    for (const key of ["id", "name", "scheme", "colors", "selection", "fonts"]) {
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

  it("has no warnings for the dark built-in", () => {
    expect(themeWarnings(DARK)).toEqual([]);
  });

  // The plan expected no warnings for either built-in, but today's accent on
  // the light background is about 2.69:1, under the 3:1 accent threshold.
  it("flags only the accent for the light built-in", () => {
    expect(themeWarnings(LIGHT)).toEqual([
      "accent on background has contrast 2.69, below 3",
    ]);
  });
});
