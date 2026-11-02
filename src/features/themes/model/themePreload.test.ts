// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { listThemes, THEME_CACHE_KEY } from "./themeEngine";
import { themeCssVars } from "./themeFormat";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const preload = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
const root = document.documentElement;

function runPreload() {
  // The script is plain ES5 that index.html runs before any module loads.
  new Function(preload)();
}

beforeEach(() => {
  localStorage.clear();
  root.className = "";
  root.style.cssText = "";
});

describe("index.html theme preload", () => {
  it("finds the inline script", () => {
    expect(preload).toContain(THEME_CACHE_KEY);
  });

  it("applies the cached light theme before React", () => {
    const light = listThemes().find((theme) => theme.id === "bonocode-light");
    if (!light) throw new Error("missing bonocode-light");
    const vars = themeCssVars(light);
    localStorage.setItem(
      THEME_CACHE_KEY,
      JSON.stringify({ scheme: "light", vars }),
    );
    runPreload();
    for (const [name, value] of Object.entries(vars)) {
      expect(root.style.getPropertyValue(name), name).toBe(value);
    }
    expect(root.classList.contains("theme-light")).toBe(true);
  });

  it("marks a cached user accent", () => {
    localStorage.setItem(
      THEME_CACHE_KEY,
      JSON.stringify({ vars: { "--user-accent-color": "#ec4899" } }),
    );
    runPreload();
    expect(root.classList.contains("has-user-accent")).toBe(true);
    expect(root.style.getPropertyValue("--user-accent-color")).toBe("#ec4899");
  });

  it("leaves the accent class off when the cache has no user accent", () => {
    localStorage.setItem(
      THEME_CACHE_KEY,
      JSON.stringify({ vars: { "--color-background-base": "#171717" } }),
    );
    runPreload();
    expect(root.classList.contains("has-user-accent")).toBe(false);
  });

  it("does nothing to the theme without a cache", () => {
    expect(runPreload).not.toThrow();
    expect(root.classList.contains("theme-light")).toBe(false);
    expect(root.style.getPropertyValue("--color-background-base")).toBe("");
  });

  it("survives a corrupt cache and still runs the rest of the preload", () => {
    for (const corrupt of ["{not json", "null", "42", '{"vars":null}']) {
      root.className = "";
      localStorage.setItem(THEME_CACHE_KEY, corrupt);
      localStorage.setItem("bonocode.bodyGlass", "1");
      expect(runPreload, corrupt).not.toThrow();
      expect(root.classList.contains("theme-light")).toBe(false);
      expect(root.classList.contains("glass-body"), corrupt).toBe(true);
    }
  });
});
