// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DockFrame } from "./DockFrame";

describe("DockFrame", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onHide = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    onHide.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const base = {
    title: "Terminal",
    side: "bottom" as const,
    size: 200,
    onHide,
    onSideChange: vi.fn(),
    onSizePaint: vi.fn(),
    onSizeCommit: vi.fn(),
  };

  it("draws the title row with Move and Hide above its children", async () => {
    await act(async () => {
      root.render(createElement(DockFrame, base, createElement("p", null, "body")));
    });

    expect(container.querySelector('[data-dock="terminal"] .h-9')?.textContent).toContain(
      "Terminal",
    );
    expect(container.querySelector('button[aria-label="Move Terminal"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Hide Terminal"]')).not.toBeNull();
    expect(container.textContent).toContain("body");
  });

  it("lets renderBody place the controls and replaces the title row and children", async () => {
    const renderBody = vi.fn((controls: ReactNode) =>
      createElement("header", { "data-custom": "" }, "Custom", controls),
    );
    await act(async () => {
      root.render(
        createElement(
          DockFrame,
          { ...base, renderBody },
          createElement("p", null, "body"),
        ),
      );
    });

    expect(renderBody).toHaveBeenCalled();
    expect(container.querySelector("[data-custom]")).not.toBeNull();
    expect(container.querySelector('[data-custom] button[aria-label="Hide Terminal"]')).not.toBeNull();
    expect(container.querySelector('[data-custom] button[aria-label="Move Terminal"]')).not.toBeNull();
    expect(container.querySelector(".h-9")).toBeNull();
    expect(container.textContent).not.toContain("body");
  });

  it("calls onHide from the Hide button", async () => {
    await act(async () => {
      root.render(
        createElement(DockFrame, {
          ...base,
          renderBody: (controls) => createElement("div", null, controls),
        }),
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Hide Terminal"]')!
        .click();
    });
    expect(onHide).toHaveBeenCalledOnce();
  });
});
