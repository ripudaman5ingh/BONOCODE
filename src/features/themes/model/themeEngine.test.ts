// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEME_CHANGE_EVENT } from "../../settings/model/appearance";
import {
  activeTheme,
  applyTheme,
  getActiveTheme,
  listThemes,
  setTheme,
  THEME_CACHE_KEY,
  THEME_CHANGE_EVENT,
} from "./themeEngine";
import { themeCssVars, type Theme } from "./themeFormat";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  invoke,
}));

const root = document.documentElement;

function builtin(id: string): Theme {
  const theme = listThemes().find((candidate) => candidate.id === id);
  if (!theme) throw new Error(`missing built-in ${id}`);
  return theme;
}

function captureEvents(name: string): unknown[] {
  const details: unknown[] = [];
  window.addEventListener(name, (event) => {
    details.push((event as CustomEvent).detail);
  });
  return details;
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  localStorage.clear();
  root.className = "";
  root.style.cssText = "";
});

describe("applyTheme", () => {
  it("sets every variable and the light class", () => {
    const light = builtin("bonocode-light");
    applyTheme(light);
    for (const [name, value] of Object.entries(themeCssVars(light))) {
      expect(root.style.getPropertyValue(name), name).toBe(value);
    }
    expect(root.classList.contains("theme-light")).toBe(true);

    applyTheme(builtin("bonocode-dark"));
    expect(root.classList.contains("theme-light")).toBe(false);
    expect(root.style.getPropertyValue("--color-background-base")).toBe(
      "#171717",
    );
  });

  it("adds and removes the user accent", () => {
    const dark = builtin("bonocode-dark");
    applyTheme({ ...dark, colors: { ...dark.colors, userAccent: "#ec4899" } });
    expect(root.classList.contains("has-user-accent")).toBe(true);
    expect(root.style.getPropertyValue("--user-accent-color")).toBe("#ec4899");
    expect(root.style.getPropertyValue("--user-accent-foreground")).toBe(
      "#000000",
    );

    applyTheme(dark);
    expect(root.classList.contains("has-user-accent")).toBe(false);
    expect(root.style.getPropertyValue("--user-accent-color")).toBe("");
    expect(root.style.getPropertyValue("--user-accent-foreground")).toBe("");
  });

  it("applies the theme's glass", () => {
    const dark = builtin("bonocode-dark");
    applyTheme(dark);
    expect(root.classList.contains("glass-body")).toBe(true);
    expect(root.style.getPropertyValue("--pane-opacity")).toBe("0.85");
    expect(invoke).toHaveBeenCalledWith("set_window_background_blur", {
      radius: 24,
    });

    applyTheme({ ...dark, glass: { ...dark.glass, paneOpacity: 1, blur: 8 } });
    expect(root.classList.contains("glass-body")).toBe(false);
    expect(invoke).toHaveBeenLastCalledWith("set_window_background_blur", {
      radius: 8,
    });
  });

  it("announces the scheme on every apply", () => {
    const schemes = captureEvents(SCHEME_CHANGE_EVENT);
    applyTheme(builtin("bonocode-light"));
    applyTheme(builtin("bonocode-dark"));
    applyTheme(builtin("bonocode-dark"));
    expect(schemes).toEqual(["light", "dark", "dark"]);
  });

  it("writes the preload cache", () => {
    const light = builtin("bonocode-light");
    applyTheme(light);
    const cache: unknown = JSON.parse(localStorage.getItem(THEME_CACHE_KEY) ?? "");
    expect(cache).toEqual({
      scheme: "light",
      vars: themeCssVars(light),
      classes: ["glass-body"],
    });
  });
});

describe("active theme", () => {
  it("defaults to bonocode-dark", () => {
    expect(getActiveTheme().id).toBe("bonocode-dark");
  });

  it("setTheme persists, applies and fires the change event", () => {
    const changes = captureEvents(THEME_CHANGE_EVENT);
    setTheme("bonocode-light");
    expect(localStorage.getItem(activeTheme.key)).toBe("bonocode-light");
    expect(getActiveTheme().id).toBe("bonocode-light");
    expect(root.classList.contains("theme-light")).toBe(true);
    expect(changes).toEqual(["bonocode-light"]);
  });

  it("resolves an unknown stored id to bonocode-dark", () => {
    localStorage.setItem(activeTheme.key, "solarized");
    expect(activeTheme.load()).toBe("bonocode-dark");
    expect(getActiveTheme().id).toBe("bonocode-dark");
  });
});
