// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncNativeGlass } from "./appearance";

const platform = vi.hoisted(() => ({ isLinux: false }));
vi.mock("../../../platform/tauri/platform", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../platform/tauri/platform")
  >()),
  get IS_LINUX() {
    return platform.isLinux;
  },
}));

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  invoke,
}));

/** The class applyTheme sets for a translucent pane; the Linux check reads it. */
function setPaneGlass(on: boolean) {
  document.documentElement.classList.toggle("glass-body", on);
}

function hasGlass() {
  return document.documentElement.classList.contains("has-native-glass");
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  platform.isLinux = false;
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.cssText = "";
  // The real token, so the tests below exercise the deferred window call rather
  // than an unparseable duration that would collapse it to zero.
  document.documentElement.style.setProperty(
    "--motion-feedback-duration",
    "120ms",
  );
});

describe("native glass", () => {
  it("turns glass on and marks the page translucent in dark mode", async () => {
    syncNativeGlass("dark");
    await vi.waitFor(() => expect(hasGlass()).toBe(true));
    expect(invoke).toHaveBeenCalledWith(
      "set_window_glass_enabled",
      expect.objectContaining({ enabled: true }),
    );
  });

  it("turns glass off and paints the page opaque in light mode", async () => {
    syncNativeGlass("light");
    expect(hasGlass()).toBe(false);
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_window_glass_enabled", {
        enabled: false,
        background: expect.any(Object),
      }),
    );
  });

  it("fills an opaque window with the themed colour, not a fixed light one", async () => {
    document.documentElement.style.setProperty(
      "--color-background-base",
      "#333333",
    );
    syncNativeGlass("light");
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_window_glass_enabled", {
        enabled: false,
        background: { r: 51, g: 51, b: 51 },
      }),
    );
  });

  it("keeps the dark theme opaque on Linux when the theme's pane is opaque", async () => {
    platform.isLinux = true;
    setPaneGlass(false);
    syncNativeGlass("dark");
    expect(hasGlass()).toBe(false);
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_window_glass_enabled", {
        enabled: false,
        background: { r: 23, g: 23, b: 23 },
      }),
    );
  });

  it("enables glass on Linux when the theme's pane is translucent", async () => {
    platform.isLinux = true;
    setPaneGlass(true);
    syncNativeGlass("dark");
    await vi.waitFor(() => expect(hasGlass()).toBe(true));
    expect(invoke).toHaveBeenCalledWith(
      "set_window_glass_enabled",
      expect.objectContaining({ enabled: true }),
    );
  });

  it("waits for the window to settle before the page changes", async () => {
    let settle = () => {};
    invoke.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    syncNativeGlass("dark");
    await Promise.resolve();
    expect(hasGlass()).toBe(false);
    settle();
    await vi.waitFor(() => expect(hasGlass()).toBe(true));
  });

  it("fades the page opaque before the window stops being transparent", async () => {
    platform.isLinux = true;
    setPaneGlass(true);
    syncNativeGlass("dark");
    await vi.waitFor(() => expect(hasGlass()).toBe(true));

    invoke.mockClear();
    setPaneGlass(false);
    syncNativeGlass("dark");
    expect(hasGlass()).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_window_glass_enabled", {
        enabled: false,
        background: { r: 23, g: 23, b: 23 },
      }),
    );
  });

  it("drops a fade still owed to glass that is back on", async () => {
    platform.isLinux = true;
    setPaneGlass(true);
    syncNativeGlass("dark");
    await vi.waitFor(() => expect(hasGlass()).toBe(true));

    invoke.mockClear();
    setPaneGlass(false);
    syncNativeGlass("dark");
    setPaneGlass(true);
    syncNativeGlass("dark");
    await vi.waitFor(() => expect(hasGlass()).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      "set_window_glass_enabled",
      expect.objectContaining({ enabled: true }),
    );
  });

  it("ignores an enable that a newer disable has overtaken", async () => {
    let settle = () => {};
    invoke.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );

    platform.isLinux = true;
    setPaneGlass(true);
    syncNativeGlass("dark");
    setPaneGlass(false);
    syncNativeGlass("dark");
    expect(hasGlass()).toBe(false);

    settle();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(hasGlass()).toBe(false);
    expect(invoke).toHaveBeenLastCalledWith(
      "set_window_glass_enabled",
      expect.objectContaining({ enabled: false }),
    );
  });

  it("still flips the page when the window call fails", async () => {
    invoke.mockRejectedValue(new Error("no window"));
    syncNativeGlass("light");
    await vi.waitFor(() => expect(hasGlass()).toBe(false));
    invoke.mockRejectedValue(new Error("no window"));
    syncNativeGlass("dark");
    await vi.waitFor(() => expect(hasGlass()).toBe(true));
  });
});
