// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../../platform/tauri/fs", () => ({
  gitBranches: vi.fn(async () => ({
    current: "main",
    detached: false,
    branches: [{ name: "main", current: true, remote: null }],
  })),
  subscribeGitChanged: () => () => {},
  gitCheckout: vi.fn(),
  gitCommit: vi.fn(),
  gitCreateBranch: vi.fn(),
  gitDeleteBranch: vi.fn(),
  gitStageAll: vi.fn(),
  gitStash: vi.fn(),
  isBranchNotMerged: (error: unknown) => error === "BRANCH_NOT_MERGED",
  isCheckoutBlockedByChanges: () => false,
  notifyGitChanged: vi.fn(),
}));

import { BranchPicker } from "./BranchPicker";
import {
  gitBranches,
  gitCheckout,
  gitCreateBranch,
  gitDeleteBranch,
  notifyGitChanged,
} from "../../../platform/tauri/fs";

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("autofocuses the branch search input only once the popover frame is visible", async () => {
  const seenVisibility: (string | undefined)[] = [];
  const nativeFocus = HTMLInputElement.prototype.focus;
  vi.spyOn(HTMLInputElement.prototype, "focus").mockImplementation(function (
    this: HTMLInputElement,
  ) {
    const frame = this.closest("[data-popover-side]")
      ?.parentElement as HTMLElement | null;
    seenVisibility.push(frame?.style.visibility);
    return nativeFocus.call(this);
  });

  act(() =>
    root.render(createElement(BranchPicker, { cwd: "/repo", branch: "main" })),
  );
  await act(async () => {});
  const button = container.querySelector("button")!;
  await act(async () => button.click());
  await act(async () => {});

  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Search or create a branch"]',
  );
  expect(input).not.toBeNull();
  // Focusing a `visibility: hidden` element is a no-op in real browsers, so
  // the popover's pre-paint measure pass must never be where focus lands.
  expect(seenVisibility).not.toContain("hidden");
  expect(document.activeElement).toBe(input);
});

it("uses the interface typeface for branch names and search", async () => {
  act(() =>
    root.render(createElement(BranchPicker, { cwd: "/repo", branch: "main" })),
  );
  await act(async () => {});
  await act(async () => container.querySelector("button")!.click());

  const picker = document.querySelector<HTMLElement>("[data-branch-picker]")!;
  const search = picker.querySelector<HTMLInputElement>(
    'input[aria-label="Search or create a branch"]',
  )!;
  const branchName = picker.querySelector<HTMLElement>('[role="option"] span')!;

  expect(search.className).toContain("font-sans");
  expect(branchName.className).not.toContain("font-mono");
  expect(branchName.className).toContain("font-medium");
});

it("asks for a branch name before creating from the fixed action", async () => {
  act(() =>
    root.render(createElement(BranchPicker, { cwd: "/repo", branch: "main" })),
  );
  await act(async () => {});
  await act(async () => container.querySelector("button")!.click());

  const picker = document.querySelector<HTMLElement>("[data-branch-picker]")!;
  const create = [...picker.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === "New branch",
  )!;
  const list = picker.querySelector('[role="listbox"][aria-label="Branches"]')!;
  expect(list.contains(create)).toBe(false);
  expect(create.parentElement?.className).toContain("border-t");
  expect(create.parentElement?.className).toContain("shrink-0");
  expect(create.parentElement).toBe(picker.lastElementChild);
  expect(create.className).toContain("hover:bg-content/8");

  await act(async () => create.click());
  expect(gitCreateBranch).not.toHaveBeenCalled();

  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Branch name"]',
  )!;
  expect(input).not.toBeNull();
  await act(async () => {});
  expect(document.activeElement).toBe(input);

  const submit = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent === "Create branch")!;
  expect(submit.disabled).toBe(true);

  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, "feature/picker");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(submit.disabled).toBe(false);

  await act(async () => submit.click());
  expect(gitCreateBranch).toHaveBeenCalledWith("/repo", "feature/picker");
});

it("updates the branch creation row with the entered name", async () => {
  act(() =>
    root.render(createElement(BranchPicker, { cwd: "/repo", branch: "main" })),
  );
  await act(async () => {});
  await act(async () => container.querySelector("button")!.click());

  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Search or create a branch"]',
  )!;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, "feature/picker");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const picker = document.querySelector<HTMLElement>("[data-branch-picker]")!;
  const create = [...picker.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === "Create and checkout feature/picker",
  );
  expect(create).not.toBeUndefined();
  expect(create?.parentElement?.className).toContain("border-t");
});

it("checks out the highlighted matching branch when Enter is pressed", async () => {
  vi.mocked(gitBranches).mockResolvedValueOnce({
    current: "main",
    detached: false,
    branches: [
      { name: "main", current: true, remote: null },
      { name: "feature/picker", current: false, remote: null },
    ],
  });
  act(() =>
    root.render(
      createElement(BranchPicker, {
        cwd: "/repo-enter-existing",
        branch: "main",
      }),
    ),
  );
  await act(async () => {});
  await act(async () => container.querySelector("button")!.click());

  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Search or create a branch"]',
  )!;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, "picker");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const picker = document.querySelector<HTMLElement>("[data-branch-picker]")!;
  const highlighted = picker.querySelector<HTMLButtonElement>(
    '[role="option"]',
  )!;
  expect(highlighted.textContent).toContain("feature/picker");
  expect(
    [...picker.querySelectorAll<HTMLButtonElement>("button")].some(
      (button) => button.textContent === "Create and checkout picker",
    ),
  ).toBe(true);

  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });

  expect(gitCheckout).toHaveBeenCalledWith(
    "/repo-enter-existing",
    "feature/picker",
    null,
  );
  expect(gitCreateBranch).not.toHaveBeenCalledWith(
    "/repo-enter-existing",
    "picker",
  );
});

const deletableBranches = {
  current: "main",
  detached: false,
  branches: [
    { name: "main", current: true, remote: null },
    { name: "feature/old", current: false, remote: null },
    { name: "release", current: false, remote: "origin" },
  ],
};

function picker(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-branch-picker]")!;
}

async function openPicker(cwd: string): Promise<void> {
  act(() => root.render(createElement(BranchPicker, { cwd, branch: "main" })));
  await act(async () => {});
  await act(async () => container.querySelector("button")!.click());
}

function buttonWithText(scope: HTMLElement, text: string): HTMLButtonElement {
  return [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === text,
  )!;
}

function deleteButton(scope: HTMLElement, name: string): HTMLButtonElement {
  return scope.querySelector<HTMLButtonElement>(
    `button[aria-label="Delete branch ${name}"]`,
  )!;
}

it("gives only local non-current branches a delete button", async () => {
  vi.mocked(gitBranches).mockResolvedValueOnce(deletableBranches);
  await openPicker("/repo-delete-buttons");

  const labels = [
    ...picker().querySelectorAll<HTMLButtonElement>(
      'button[aria-label^="Delete branch"]',
    ),
  ].map((button) => button.getAttribute("aria-label"));
  expect(labels).toEqual(["Delete branch feature/old"]);
});

it("asks before deleting and deletes without force", async () => {
  vi.mocked(gitBranches).mockResolvedValueOnce(deletableBranches);
  vi.mocked(gitDeleteBranch).mockResolvedValueOnce(undefined);
  await openPicker("/repo-delete-confirm");

  await act(async () => deleteButton(picker(), "feature/old").click());
  expect(picker().textContent).toContain("Delete branch feature/old?");
  expect(gitDeleteBranch).not.toHaveBeenCalled();
  expect(gitCheckout).not.toHaveBeenCalled();

  await act(async () => buttonWithText(picker(), "Delete").click());

  expect(gitDeleteBranch).toHaveBeenCalledOnce();
  expect(gitDeleteBranch).toHaveBeenCalledWith(
    "/repo-delete-confirm",
    "feature/old",
    false,
  );
  expect(notifyGitChanged).toHaveBeenCalled();
  expect(gitCheckout).not.toHaveBeenCalled();
  expect(document.querySelector("[data-branch-picker]")).not.toBeNull();
  expect(picker().querySelector('[role="listbox"]')).not.toBeNull();
});

it("asks again and force-deletes when git says the branch is not fully merged", async () => {
  vi.mocked(gitBranches).mockResolvedValueOnce(deletableBranches);
  vi.mocked(gitDeleteBranch)
    .mockRejectedValueOnce("BRANCH_NOT_MERGED")
    .mockResolvedValueOnce(undefined);
  await openPicker("/repo-delete-unmerged");

  await act(async () => deleteButton(picker(), "feature/old").click());
  await act(async () => buttonWithText(picker(), "Delete").click());

  expect(picker().textContent).toContain(
    "feature/old has commits that aren't on main. That's normal after a squash merge. Delete anyway?",
  );
  expect(gitDeleteBranch).toHaveBeenNthCalledWith(
    1,
    "/repo-delete-unmerged",
    "feature/old",
    false,
  );

  await act(async () => buttonWithText(picker(), "Delete anyway").click());

  expect(gitDeleteBranch).toHaveBeenNthCalledWith(
    2,
    "/repo-delete-unmerged",
    "feature/old",
    true,
  );
  expect(gitCheckout).not.toHaveBeenCalled();
});

it("cancels the delete without calling git", async () => {
  vi.mocked(gitBranches).mockResolvedValueOnce(deletableBranches);
  await openPicker("/repo-delete-cancel");

  await act(async () => deleteButton(picker(), "feature/old").click());
  await act(async () => buttonWithText(picker(), "Cancel").click());

  expect(gitDeleteBranch).not.toHaveBeenCalled();
  expect(picker().querySelector('[role="listbox"]')).not.toBeNull();
});

it("shows other delete errors in the picker's error area", async () => {
  vi.mocked(gitBranches).mockResolvedValueOnce(deletableBranches);
  vi.mocked(gitDeleteBranch).mockRejectedValueOnce(
    "error: Cannot delete branch 'feature/old' checked out at '/wt'",
  );
  await openPicker("/repo-delete-error");

  await act(async () => deleteButton(picker(), "feature/old").click());
  await act(async () => buttonWithText(picker(), "Delete").click());

  expect(
    [...picker().querySelectorAll("p")].some((p) =>
      p.textContent?.includes("Cannot delete branch 'feature/old'"),
    ),
  ).toBe(true);
  expect(picker().querySelector('[role="listbox"]')).not.toBeNull();
  expect(gitDeleteBranch).toHaveBeenCalledOnce();
});
