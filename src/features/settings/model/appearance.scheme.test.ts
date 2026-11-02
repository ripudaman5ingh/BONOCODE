// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import {
  applyColorScheme,
  saveChatBackgroundPath,
  SCHEME_CHANGE_EVENT,
} from "./appearance";
import { applyPreparedNewThreadBackground } from "./newThreadBackgroundEffects";

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke: vi.fn(async () => undefined),
}));

vi.mock("./newThreadBackgroundEffects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./newThreadBackgroundEffects")>()),
  applyPreparedNewThreadBackground: vi.fn(async () => undefined),
}));

const render = vi.mocked(applyPreparedNewThreadBackground);
const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root.className = "has-chat-background";
  saveChatBackgroundPath("/app-data/backgrounds/chat-background.webp");
  render.mockClear();
});

// Theme-editor edits re-apply the same scheme; re-rendering the background on
// each one made it blink.
it("re-renders the chat background only when the scheme flips", () => {
  const announced: string[] = [];
  const listener = (event: Event) =>
    announced.push((event as CustomEvent<string>).detail);
  window.addEventListener(SCHEME_CHANGE_EVENT, listener);

  applyColorScheme("dark");
  applyColorScheme("dark");
  expect(render).not.toHaveBeenCalled();

  applyColorScheme("light");
  expect(render).toHaveBeenCalledTimes(1);
  expect(render.mock.calls[0]?.[3]).toBe(true);
  expect(root.classList.contains("theme-light")).toBe(true);

  applyColorScheme("light");
  expect(render).toHaveBeenCalledTimes(1);

  applyColorScheme("dark");
  expect(render).toHaveBeenCalledTimes(2);
  expect(root.classList.contains("theme-light")).toBe(false);

  window.removeEventListener(SCHEME_CHANGE_EVENT, listener);
  expect(announced).toEqual(["dark", "dark", "light", "light", "dark"]);
});
