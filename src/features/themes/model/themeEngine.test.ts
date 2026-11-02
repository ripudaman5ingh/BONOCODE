// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEME_CHANGE_EVENT } from "../../settings/model/appearance";
import {
  activeTheme,
  applyTheme,
  deleteUserTheme,
  duplicateTheme,
  getActiveTheme,
  isBuiltinTheme,
  listThemes,
  previewTheme,
  renameUserTheme,
  saveUserTheme,
  setTheme,
  THEME_CACHE_KEY,
  THEME_CHANGE_EVENT,
  userThemes,
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
  it("lists the built-ins in order", () => {
    expect(listThemes().map((theme) => theme.name)).toEqual([
      "Bonocode Dark",
      "Bonocode Light",
      "Catppuccin Mocha",
      "Catppuccin Latte",
      "Dracula",
    ]);
  });

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

function copyOf(id: string): Theme {
  const copy = duplicateTheme(id);
  if (!copy) throw new Error(`could not duplicate ${id}`);
  return copy;
}

describe("user themes", () => {
  it("parses stored themes, dropping invalid entries and taken ids", () => {
    const dark = builtin("bonocode-dark");
    localStorage.setItem(
      userThemes.key,
      JSON.stringify([
        { ...dark, id: "mine", name: "Mine" },
        { ...dark, id: "bonocode-light", name: "Shadows a built-in" },
        { ...dark, id: "broken", colors: { ...dark.colors, accent: "blue" } },
        { ...dark, id: "mine", name: "Mine again" },
        "nonsense",
      ]),
    );
    expect(userThemes.load().map((theme) => theme.name)).toEqual(["Mine"]);
    expect(listThemes().map((theme) => theme.id).slice(-2)).toEqual([
      "dracula",
      "mine",
    ]);
    expect(isBuiltinTheme("mine")).toBe(false);
    expect(isBuiltinTheme("dracula")).toBe(true);
    // A stable snapshot, so userThemes.use() does not re-render forever.
    expect(userThemes.load()).toBe(userThemes.load());
  });

  it("reads unreadable storage as no user themes", () => {
    localStorage.setItem(userThemes.key, "{oops");
    expect(userThemes.load()).toEqual([]);
    localStorage.setItem(userThemes.key, JSON.stringify({ not: "a list" }));
    expect(userThemes.load()).toEqual([]);
  });

  it("duplicates into the first free copy id", () => {
    expect(copyOf("bonocode-dark")).toMatchObject({
      id: "bonocode-dark-copy",
      name: "Bonocode Dark copy",
    });
    expect(copyOf("bonocode-dark").id).toBe("bonocode-dark-copy-2");
    expect(copyOf("bonocode-dark").id).toBe("bonocode-dark-copy-3");
    expect(copyOf("bonocode-dark-copy").id).toBe("bonocode-dark-copy-copy");
    expect(duplicateTheme("missing")).toBeUndefined();
    expect(userThemes.load()).toHaveLength(4);
    expect(builtin("bonocode-dark").name).toBe("Bonocode Dark");
  });

  it("renames a user theme and ignores blank names and built-ins", () => {
    const copy = copyOf("dracula");
    renameUserTheme(copy.id, "  Night  ");
    expect(userThemes.load()[0]?.name).toBe("Night");
    renameUserTheme(copy.id, "   ");
    expect(userThemes.load()[0]?.name).toBe("Night");
    renameUserTheme("dracula", "Mine now");
    expect(builtin("dracula").name).toBe("Dracula");
  });

  it("saves edits in place and never stores a built-in id", () => {
    const copy = copyOf("bonocode-dark");
    saveUserTheme({ ...copy, colors: { ...copy.colors, accent: "#ff0000" } });
    expect(userThemes.load()).toHaveLength(1);
    expect(userThemes.load()[0]?.colors.accent).toBe("#ff0000");
    saveUserTheme({ ...builtin("bonocode-light"), name: "Hijack" });
    expect(userThemes.load()).toHaveLength(1);
  });

  it("switches to bonocode-dark when the active theme is deleted", () => {
    const copy = copyOf("bonocode-light");
    setTheme(copy.id);
    expect(getActiveTheme().id).toBe(copy.id);
    expect(root.classList.contains("theme-light")).toBe(true);

    deleteUserTheme(copy.id);
    expect(userThemes.load()).toEqual([]);
    expect(activeTheme.load()).toBe("bonocode-dark");
    expect(root.classList.contains("theme-light")).toBe(false);
  });

  it("keeps the active theme when another one is deleted", () => {
    const kept = copyOf("bonocode-light");
    const dropped = copyOf("dracula");
    setTheme(kept.id);
    deleteUserTheme(dropped.id);
    expect(activeTheme.load()).toBe(kept.id);
    expect(userThemes.load().map((theme) => theme.id)).toEqual([kept.id]);
  });

  it("previews a theme without changing the active id", () => {
    previewTheme(builtin("bonocode-light"));
    expect(root.classList.contains("theme-light")).toBe(true);
    expect(activeTheme.load()).toBe("bonocode-dark");
    expect(localStorage.getItem(activeTheme.key)).toBeNull();
  });
});
