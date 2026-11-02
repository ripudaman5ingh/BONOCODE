// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import bonocodeDark from "../../themes/model/builtin/bonocode-dark.json";
import { TERMINAL_KEYS } from "../../themes/model/themeFormat";
import { terminalTheme } from "./TerminalView";

const root = document.documentElement;

beforeEach(() => {
  root.style.cssText = "";
});

describe("terminalTheme", () => {
  it("takes the ANSI colors from the --terminal-* variables", () => {
    root.style.setProperty("--terminal-red", "#123456");
    root.style.setProperty("--terminal-bright-black", "#abcdef");
    const theme = terminalTheme(false);
    expect(theme.red).toBe("#123456");
    expect(theme.brightBlack).toBe("#abcdef");
  });

  it("falls back to the dark built-in without the variables", () => {
    const theme = terminalTheme(true);
    for (const key of TERMINAL_KEYS) {
      expect(theme[key], key).toBe(bonocodeDark.terminal[key]);
    }
  });
});
