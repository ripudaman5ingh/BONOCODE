// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-opener", () => ({
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  invoke: vi.fn(async () => null),
}));

const { invalidateWatchedFiles } = vi.hoisted(() => ({
  invalidateWatchedFiles: vi.fn(),
}));

vi.mock("../../../platform/tauri/fs", () => ({
  gitDiffIndex: vi.fn(),
  gitHistory: vi.fn(async () => []),
  gitPrStatus: vi.fn(async () => null),
  gitPull: vi.fn(async () => {}),
  gitSync: vi.fn(async () => {}),
  gitCommit: vi.fn(async () => {}),
  gitHeadMessage: vi.fn(async () => ""),
  gitStageAll: vi.fn(async () => {}),
  gitUnstageAll: vi.fn(async () => {}),
  gitDiscardAll: vi.fn(async () => {}),
  gitStageFile: vi.fn(async () => {}),
  gitUnstageFile: vi.fn(async () => {}),
  gitDiscardFile: vi.fn(async () => {}),
  gitFetch: vi.fn(async () => {}),
  gitPrCreate: vi.fn(async () => "https://github.com/acme/app/pull/9"),
  notifyGitChanged: vi.fn(),
  subscribeGitChanged: () => () => {},
  basename: (path: string) => path.split("/").pop() ?? path,
}));

vi.mock("../../../integrations/harness", () => ({
  generateCommitMessage: vi.fn(async () => ""),
  generatePrContent: vi.fn(),
}));

vi.mock("../../files/model/fileWatch", () => ({
  invalidateWatchedFiles,
  nudgeWatchedFiles: vi.fn(),
}));

vi.mock("../../github/model/inboxSelfActivity", () => ({
  recordInboxSelfActivity: vi.fn(),
}));

import { GitChangesPanel } from "./GitChangesPanel";
import { invoke } from "@tauri-apps/api/core";
import {
  gitDiffIndex,
  gitFetch,
  gitPrCreate,
  gitPrStatus,
  gitPull,
} from "../../../platform/tauri/fs";
import {
  generateCommitMessage,
  generatePrContent,
} from "../../../integrations/harness";
import type { GitDiffIndex } from "../../../platform/tauri/fs";

function index(overrides: Partial<GitDiffIndex> = {}): GitDiffIndex {
  return {
    branch: "feature/pull",
    head: "abc123",
    files: [],
    additions: 0,
    deletions: 0,
    remote: null,
    upstream: null,
    defaultBranch: "main",
    ahead: 0,
    behind: 0,
    aheadOfDefault: 0,
    headPushed: true,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(gitDiffIndex).mockReset();
  vi.mocked(gitPull).mockReset();
  vi.mocked(gitFetch).mockClear();
  vi.mocked(gitPrCreate).mockReset();
  vi.mocked(generateCommitMessage).mockReset();
  vi.mocked(generatePrContent).mockReset();
  vi.mocked(gitPrStatus).mockResolvedValue(null);
  vi.mocked(invoke).mockImplementation(async () => null);
  invalidateWatchedFiles.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

describe("GitChangesPanel commit message generation", () => {
  it("cancels promptly and ignores a late result after a retry", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({
        files: [
          {
            path: "/repo/change.ts",
            relative: "change.ts",
            status: "modified",
            additions: 1,
            deletions: 0,
            staged: true,
            unstaged: false,
          },
        ],
      }),
    );
    let resolveFirst!: (message: string) => void;
    vi.mocked(generateCommitMessage)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce("New message");
    await renderPanel();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Generate commit message"]',
        )!
        .click();
    });
    const signal = vi.mocked(generateCommitMessage).mock.calls[0]?.[2];
    expect(signal?.aborted).toBe(false);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Cancel commit message generation"]',
        )!
        .click();
    });
    expect(signal?.aborted).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Generate commit message"]',
      )?.disabled,
    ).toBe(false);
    expect(container.querySelector("textarea")?.disabled).toBe(false);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Generate commit message"]',
        )!
        .click();
    });
    expect(container.querySelector("textarea")?.value).toBe("New message");

    await act(async () => resolveFirst("Old message"));
    expect(container.querySelector("textarea")?.value).toBe("New message");
  });
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  container.remove();
  document.body
    .querySelectorAll("[data-popover-side]")
    .forEach((element) => element.remove());
  vi.unstubAllGlobals();
});

async function renderPanel(cwd = "/repo") {
  act(() =>
    root.render(
      createElement(GitChangesPanel, {
        cwd,
        enabled: true,
        onOpenFile: vi.fn(),
        onOpenAllChanges: vi.fn(),
        onOpenCommit: vi.fn(),
        onOpenPr: vi.fn(),
      }),
    ),
  );
  await act(async () => {});
}

async function openBranchMenu() {
  const toggle = container.querySelector<HTMLButtonElement>(
    '[aria-label="Branch actions"]',
  )!;
  await act(async () => toggle.click());
  await act(async () => {});
  return document.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
}

describe("GitChangesPanel pull action", () => {
  it("disables Pull when the branch has no upstream", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ remote: null, upstream: null }),
    );
    await renderPanel();

    const pull = await openBranchMenu();
    expect(pull.textContent).toContain("Pull");
    expect(pull.disabled).toBe(true);
  });

  it("disables Pull when the repository has no remote", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ remote: null, upstream: "origin/feature/pull" }),
    );
    await renderPanel();

    const pull = await openBranchMenu();
    expect(pull.disabled).toBe(true);
  });

  it("pulls the current branch and reloads watched files", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ remote: "origin", upstream: "origin/feature/pull" }),
    );
    await renderPanel();

    const pull = await openBranchMenu();
    expect(pull.disabled).toBe(false);

    invalidateWatchedFiles.mockClear();
    await act(async () => {
      pull.click();
      await Promise.resolve();
    });

    expect(gitPull).toHaveBeenCalledWith("/repo");
    expect(invalidateWatchedFiles).toHaveBeenCalled();
  });
});

describe("GitChangesPanel PR checks", () => {
  it("lists the failing checks of the current PR", async () => {
    const cwd = "/repo-checks";
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ remote: "origin", upstream: "origin/feature/pull" }),
    );
    vi.mocked(gitPrStatus).mockResolvedValue({
      number: 7,
      title: "Add checks",
      url: "https://github.com/acme/app/pull/7",
      state: "open",
      repo: "acme/app",
    });
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === "git_github_pr_checks"
        ? {
            headOid: "abc123",
            checks: [
              {
                name: "unit tests",
                workflow: "CI",
                state: "fail",
                url: null,
                startedAt: null,
                completedAt: null,
              },
            ],
          }
        : null,
    );
    await renderPanel(cwd);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("unit tests");
  });
});

describe("GitChangesPanel auto fetch", () => {
  it("fetches when enabled and again every five minutes", async () => {
    vi.useFakeTimers();
    vi.mocked(gitDiffIndex).mockResolvedValue(index());
    const props = {
      cwd: "/repo-fetch",
      onOpenFile: vi.fn(),
      onOpenAllChanges: vi.fn(),
      onOpenCommit: vi.fn(),
    };
    act(() =>
      root.render(createElement(GitChangesPanel, { ...props, enabled: false })),
    );
    await act(async () => {});
    expect(gitFetch).not.toHaveBeenCalled();

    act(() =>
      root.render(createElement(GitChangesPanel, { ...props, enabled: true })),
    );
    await act(async () => {});
    expect(gitFetch).toHaveBeenCalledOnce();
    expect(gitFetch).toHaveBeenCalledWith("/repo-fetch");

    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(gitFetch).toHaveBeenCalledTimes(2);
  });
});

describe("GitChangesPanel pull request dialog", () => {
  it("prefills generated text, creates with the edited title, and cancel creates nothing", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({
        remote: "origin",
        upstream: "origin/feature/pull",
        aheadOfDefault: 2,
      }),
    );
    vi.mocked(generatePrContent).mockResolvedValue({
      title: "Generated title",
      body: "Generated body",
      base: "main",
      head: "feature/pull",
    });
    await renderPanel();

    const findButton = (text: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent?.trim() === text,
      )!;
    const titleInput = () =>
      document.querySelector<HTMLInputElement>(
        '[aria-label="Pull request title"]',
      )!;
    const bodyInput = () =>
      document.querySelector<HTMLTextAreaElement>(
        '[aria-label="Pull request body"]',
      )!;
    const typeInto = (
      element: HTMLInputElement | HTMLTextAreaElement,
      value: string,
    ) => {
      const proto =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    };

    await act(async () => findButton("Create PR").click());
    await act(async () => {});
    expect(titleInput().value).toBe("Generated title");
    expect(bodyInput().value).toBe("Generated body");

    await act(async () => findButton("Cancel").click());
    expect(titleInput()).toBeNull();
    expect(gitPrCreate).not.toHaveBeenCalled();

    await act(async () => findButton("Create PR").click());
    await act(async () => {});
    await act(async () => typeInto(titleInput(), "Edited title"));
    await act(async () => findButton("Create").click());
    await act(async () => {});

    expect(gitPrCreate).toHaveBeenCalledOnce();
    expect(gitPrCreate).toHaveBeenCalledWith(
      "/repo",
      "Edited title",
      "Generated body",
      "main",
      "feature/pull",
    );
  });
});
