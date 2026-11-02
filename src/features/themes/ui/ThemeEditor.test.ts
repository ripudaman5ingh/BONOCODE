// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeTheme, initTheme, userThemes } from "../model/themeEngine";
import { THEME_SAVE_DELAY_MS, ThemeEditor } from "./ThemeEditor";

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  invoke: vi.fn(async () => undefined),
}));

const html = document.documentElement;
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  html.className = "";
  html.style.cssText = "";
  initTheme();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Buttons by their text, including those in the Modal's portal. */
function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!found) throw new Error(`no "${text}" button`);
  return found;
}

function hasButton(text: string): boolean {
  return [...document.querySelectorAll("button")].some(
    (candidate) => candidate.textContent?.trim() === text,
  );
}

function input(label: string): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  if (!found) throw new Error(`no "${label}" input`);
  return found;
}

async function type(field: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
      .set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function openCopyOfBuiltin() {
  await act(async () => root.render(createElement(ThemeEditor)));
  await act(async () => button("Duplicate to customize").click());
}

describe("ThemeEditor", () => {
  it("duplicates a built-in, selects the copy and opens it for editing", async () => {
    await act(async () => root.render(createElement(ThemeEditor)));
    expect(hasButton("Delete")).toBe(false);

    await act(async () => button("Duplicate to customize").click());
    expect(activeTheme.load()).toBe("bonocode-dark-copy");
    expect(userThemes.load().map((theme) => theme.name)).toEqual([
      "Bonocode Dark copy",
    ]);
    expect(input("Background").value).toBe("#171717");
    expect(hasButton("Delete")).toBe(true);
  });

  it("previews a color at once and saves it after the debounce", async () => {
    await openCopyOfBuiltin();
    vi.useFakeTimers();

    await type(input("Background"), "#202020");
    expect(html.style.getPropertyValue("--color-background-base")).toBe(
      "#202020",
    );
    expect(userThemes.load()[0]?.colors.background).toBe("#171717");

    await act(async () => vi.advanceTimersByTime(THEME_SAVE_DELAY_MS - 1));
    expect(userThemes.load()[0]?.colors.background).toBe("#171717");
    await act(async () => vi.advanceTimersByTime(1));
    expect(userThemes.load()[0]?.colors.background).toBe("#202020");
  });

  it("does not apply a half-typed color", async () => {
    await openCopyOfBuiltin();
    await type(input("Background"), "#2020");
    expect(html.style.getPropertyValue("--color-background-base")).toBe(
      "#171717",
    );
    expect(input("Background").getAttribute("aria-invalid")).toBe("true");
  });

  it("asks before deleting a theme", async () => {
    await openCopyOfBuiltin();

    await act(async () => button("Delete").click());
    expect(document.body.textContent).toContain("Delete theme?");
    expect(userThemes.load()).toHaveLength(1);

    await act(async () => button("Cancel").click());
    expect(userThemes.load()).toHaveLength(1);
    expect(activeTheme.load()).toBe("bonocode-dark-copy");

    await act(async () => button("Delete").click());
    await act(async () => button("Delete theme").click());
    expect(userThemes.load()).toEqual([]);
    expect(activeTheme.load()).toBe("bonocode-dark");
    expect(hasButton("Duplicate to customize")).toBe(true);
  });

  it("undoes back to the theme as it was when opened", async () => {
    await openCopyOfBuiltin();
    await type(input("Accent"), "#ff0000");
    expect(html.style.getPropertyValue("--color-accent")).toBe("#ff0000");

    await act(async () => button("Undo changes").click());
    expect(html.style.getPropertyValue("--color-accent")).toBe("#459bf7");
    expect(input("Accent").value).toBe("#459bf7");
  });
});
