// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxDetail, LinkedWorkItemPanel } from "./InboxView";

const { openUrl, invoke } = vi.hoisted(() => ({
  openUrl: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isMaximized: async () => false,
    onResized: async () => () => {},
    setTitle: async () => {},
  }),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  invoke.mockReset();
  openUrl.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const render = (element: React.ReactElement) => {
  act(() => root.render(element));
  return container;
};

const buttonByLabel = (label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

const prItem = {
  kind: "pr" as const,
  number: 157,
  title: "Ship the checks tab",
  url: "https://github.com/acme/web/pull/157",
  state: "open",
  updatedAt: "2026-09-11T08:00:00Z",
  labels: [],
  assignees: [],
  draft: false,
  repo: "acme/web",
};

const checksAnswer = {
  headOid: "abc123",
  checks: [
    {
      name: "build",
      workflow: "CI",
      state: "pass",
      url: "https://github.com/acme/web/actions/runs/9",
      startedAt: "2026-09-11T08:00:00Z",
      completedAt: "2026-09-11T08:01:00Z",
    },
  ],
};

function mockBackend() {
  invoke.mockImplementation(
    (command: string, args: Record<string, unknown>) => {
      if (command === "git_github_pr_checks") {
        return Promise.resolve(checksAnswer);
      }
      if (command === "git_github_work_item") {
        return Promise.resolve(prItem);
      }
      return Promise.reject(new Error("No native bridge"));
    },
  );
}

const flush = () => act(async () => {});

describe("Checks tab user behavior", () => {
  beforeEach(() => {
    invoke.mockReset();
    openUrl.mockReset();
  });

  it("loads checks on open in the inbox even while Summary is active", async () => {
    mockBackend();
    render(
      createElement(InboxDetail, {
        item: { ...prItem, projectPath: "/tmp/web", provider: "github" },
        cwd: "/tmp/web",
        projects: [],
        revision: 0,
        relatedSessions: [],
        onDiscuss: () => {},
        onStart: () => {},
      }),
    );
    await flush();
    expect(invoke).toHaveBeenCalledWith("git_github_pr_checks", {
      cwd: "/tmp/web",
      repo: "acme/web",
      number: 157,
    });
    const summaryTab = container.querySelector<HTMLButtonElement>(
      'button[role="tab"][aria-selected="true"]',
    );
    expect(summaryTab?.textContent).toContain("Summary");

    const checksTab = container.querySelector<HTMLButtonElement>(
      'button[role="tab"][aria-label="Checks: 1 passed"]',
    );
    expect(checksTab).not.toBeNull();
    await act(async () => {
      checksTab?.click();
    });
    expect(container.textContent).toContain("build");
    expect(container.textContent).toContain("CI · Passed · 1m 00s");
    const row = buttonByLabel("build · Passed, took 1m 00s, CI");
    await act(async () => {
      row?.click();
    });
    expect(openUrl).toHaveBeenCalledWith(
      "https://github.com/acme/web/actions/runs/9",
    );

    // An inbox revision change revalidates the same PR.
    const checksCalls = () =>
      invoke.mock.calls.filter(
        ([command]) => command === "git_github_pr_checks",
      );
    expect(checksCalls()).toHaveLength(1);
    render(
      createElement(InboxDetail, {
        item: { ...prItem, projectPath: "/tmp/web", provider: "github" },
        cwd: "/tmp/web",
        projects: [],
        revision: 1,
        relatedSessions: [],
        onDiscuss: () => {},
        onStart: () => {},
      }),
    );
    await flush();
    expect(checksCalls()).toHaveLength(2);
  });

  it("loads checks in the linked side panel where revision stays 0", async () => {
    mockBackend();
    render(
      createElement(LinkedWorkItemPanel, {
        target: {
          kind: "pr",
          repo: "acme/web",
          number: 157,
          url: "https://github.com/acme/web/pull/157",
        },
        cwd: "/tmp/web",
        recents: [],
        onClose: () => {},
      }),
    );
    await flush();
    await flush();
    expect(invoke).toHaveBeenCalledWith("git_github_pr_checks", {
      cwd: "/tmp/web",
      repo: "acme/web",
      number: 157,
    });
    expect(
      container.querySelector(
        'button[role="tab"][aria-label="Checks: 1 passed"]',
      ),
    ).not.toBeNull();
    await act(async () => {
      (
        container.querySelector(
          'button[role="tab"][aria-label="Checks: 1 passed"]',
        ) as HTMLButtonElement
      )?.click();
    });
    expect(container.textContent).toContain("build");
  });
});
