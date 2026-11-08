// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../features/terminal/ui/ProjectTerminalDock", () => ({
  ProjectTerminalDock: () => null,
}));
vi.mock("../../features/source-control/ui/ChangesDock", () => ({
  ChangesDock: (props: { prChip?: { number: number } }) =>
    createElement("div", { "data-testid": "dock" }, props.prChip?.number),
}));
vi.mock("../../features/source-control/ui/ChangesDockRail", () => ({
  ChangesDockRail: (props: { onShow: () => void }) =>
    createElement("button", { "data-testid": "rail", onClick: props.onShow }),
}));

import { WorkspaceDocks } from "./WorkspaceDocks";

type Props = ComponentProps<typeof WorkspaceDocks>;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function setup(extra: Partial<Props>) {
  const changesDock = { side: "right" as const, size: 400, open: true };
  const onShowChangesDock = vi.fn();
  const props = {
    projectCwd: "/repo",
    gitCwd: "/repo",
    terminalDock: {
      projectTerminals: [],
      projectTerminalFocused: false,
      currentProjectDock: undefined,
    },
    changes: { changesDock, onShowChangesDock },
    onAddTerminal: vi.fn(),
    onTerminalMetaChange: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenCommit: vi.fn(),
    children: null,
    ...extra,
  } as unknown as Props;
  act(() => root.render(createElement(WorkspaceDocks, props)));
  return { changesDock, onShowChangesDock };
}

const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);

it("draws the open changes dock and passes the PR chip down", () => {
  setup({ prChip: { number: 7, onShow: vi.fn() } });
  expect(q("dock")?.textContent).toBe("7");
  expect(q("rail")).toBeNull();
});

it("shows the rail for a collapsed dock without touching the saved state", () => {
  const onShowChanges = vi.fn();
  const { changesDock, onShowChangesDock } = setup({
    changesCollapsed: true,
    onShowChanges,
  });
  expect(q("dock")).toBeNull();
  expect(q("rail")).not.toBeNull();
  expect(changesDock.open).toBe(true);
  expect(onShowChangesDock).not.toHaveBeenCalled();

  act(() => (q("rail") as HTMLButtonElement).click());
  expect(onShowChangesDock).toHaveBeenCalledTimes(1);
  expect(onShowChanges).toHaveBeenCalledTimes(1);
});
