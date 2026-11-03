// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectTerminal } from "../../projects/model/projectTerminal";
import { newTerminalFile } from "../../workspace/model/layout";

// TerminalView kills its shell on unmount, so the test counts mounts and
// unmounts: a terminal that moves or remounts shows up here.
const terminals = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));

vi.mock("./TerminalView", async () => {
  const { createElement, useEffect } = await import("react");
  return {
    TerminalView: function TerminalViewStub({ id }: { id: string }) {
      useEffect(() => {
        terminals.mounts += 1;
        return () => {
          terminals.unmounts += 1;
        };
      }, []);
      return createElement("div", { "data-terminal-stub": id });
    },
  };
});

import { ProjectTerminalDock } from "./ProjectTerminalDock";

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("ProjectTerminalDock", () => {
  let root: Root;
  let container: HTMLDivElement;
  const file = newTerminalFile("/tmp/project", "one");
  const noop = () => {};

  function render(side: "bottom" | "left", size: number) {
    const dock = { ...createProjectTerminal("/tmp/project", file, "bottom"), size };
    return act(async () => {
      root.render(
        createElement(ProjectTerminalDock, {
          dock,
          side,
          focused: true,
          onFocus: noop,
          onHide: noop,
          onSideChange: noop,
          onSizePaint: noop,
          onSizeCommit: noop,
          onAddTerminal: noop,
          onSelectTerminal: noop,
          onCloseTerminal: noop,
          onCloseOtherTerminals: noop,
          onReorderTerminals: noop,
        }),
      );
    });
  }

  const stub = () =>
    container.querySelector<HTMLElement>(`[data-terminal-stub="${file.id}"]`);

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    terminals.mounts = 0;
    terminals.unmounts = 0;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("puts each terminal in a per-terminal div inside the body under the dock section", async () => {
    await render("bottom", 220);
    await flush();

    const terminal = stub();
    expect(terminal).not.toBeNull();
    const perTerminal = terminal!.parentElement!;
    const body = perTerminal.parentElement!;
    const section = body.parentElement!;
    expect(perTerminal.className).toBe("absolute inset-0 h-full");
    expect(body.className).toBe("relative min-h-0 min-w-0 flex-1");
    expect(section.getAttribute("data-dock")).toBe("terminal");
  });

  it("keeps the same terminal node and does not remount it when side and size change", async () => {
    await render("bottom", 220);
    await flush();
    const before = stub();
    expect(terminals.mounts).toBe(1);

    await render("left", 360);
    await flush();

    expect(stub()).toBe(before);
    expect(terminals.mounts).toBe(1);
    expect(terminals.unmounts).toBe(0);
  });
});
