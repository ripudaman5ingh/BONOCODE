// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChangesDockRail } from "./ChangesDockRail";
import { ALT, MOD } from "../../../platform/tauri/platform";

const { gitDiffStats } = vi.hoisted(() => ({ gitDiffStats: vi.fn() }));
vi.mock("../../../platform/tauri/fs", () => ({
  gitDiffStats,
  subscribeGitChanged: () => () => undefined,
}));

const LABEL = `Show Changes (${MOD}${ALT}B)`;

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  gitDiffStats.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/**
 * Renders the rail and waits for its stats to land. Each test passes its own
 * cwd, since the stats cache is shared by cwd across the module.
 */
async function mount(cwd: string, onShow = () => {}): Promise<HTMLButtonElement> {
  await act(async () => {
    root.render(createElement(ChangesDockRail, { gitCwd: cwd, side: "right", onShow }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const button = container.querySelector("button");
  if (!button) throw new Error("the rail rendered no button");
  return button;
}

it("shows the short counts, with the full numbers in its label", async () => {
  gitDiffStats.mockResolvedValue({ files: 3, additions: 1234, deletions: 4 });
  const button = await mount("/work/counts");
  expect(button.textContent).toContain("+1.2k");
  expect(button.textContent).toContain("-4");
  expect(button.getAttribute("aria-label")).toBe(`${LABEL}: 3 files, +1,234 -4`);
});

it("a click calls onShow once", async () => {
  const onShow = vi.fn();
  gitDiffStats.mockResolvedValue({ files: 1, additions: 2, deletions: 0 });
  const button = await mount("/work/click", onShow);
  await act(async () => {
    button.click();
  });
  expect(onShow).toHaveBeenCalledTimes(1);
});

it("with no stats, only the chevron shows", async () => {
  gitDiffStats.mockRejectedValue(new Error("not a repository"));
  const button = await mount("/work/none");
  expect(button.textContent).toBe("");
  expect(button.querySelector("span")).toBeNull();
  expect(button.querySelector("svg")).not.toBeNull();
  expect(button.getAttribute("aria-label")).toBe(LABEL);
});
