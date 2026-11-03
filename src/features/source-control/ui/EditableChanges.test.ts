// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  gitDiffStats,
  type GitChangedFile,
  type GitFileDiff,
} from "../../../platform/tauri/fs";
import type { ChangeActions } from "../model/changeActions";

const fs = vi.hoisted(() => ({
  files: [] as GitChangedFile[],
  diffs: new Map<string, Partial<GitFileDiff>>(),
}));

vi.mock("../../../platform/tauri/fs", () => ({
  gitDiffFiles: vi.fn(async () => ({ files: fs.files })),
  gitDiffStats: vi.fn(async () => ({ files: 2, additions: 3, deletions: 1 })),
  gitFileDiff: vi.fn(async (_cwd: string, relative: string) => ({
    binary: false,
    tooLarge: false,
    ...fs.diffs.get(relative),
  })),
  subscribeGitChanged: () => () => {},
}));

type EditorProps = {
  path: string;
  embedded?: boolean;
  showDiff?: boolean;
  onDirtyChange: (path: string, dirty: boolean) => void;
};
const editors = vi.hoisted(() => new Map<string, EditorProps>());

vi.mock("../../files/ui/FileEditor", () => ({
  FileEditor: (props: EditorProps) => {
    editors.set(props.path, props);
    return createElement("div", { "data-editor": props.path });
  },
}));

import { EditableChanges } from "./EditableChanges";

function changed(
  relative: string,
  patch: Partial<GitChangedFile> = {},
): GitChangedFile {
  return {
    path: `/repo/${relative}`,
    relative,
    status: "modified",
    additions: 1,
    deletions: 1,
    staged: false,
    unstaged: true,
    ...patch,
  };
}

describe("EditableChanges", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onDirtyChange = vi.fn();
  const onOpenFile = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // Every entry is near the viewport.
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(
          private readonly callback: (
            entries: { isIntersecting: boolean }[],
          ) => void,
        ) {}
        observe() {
          this.callback([{ isIntersecting: true }]);
        }
        disconnect() {}
      },
    );
    fs.files = [];
    fs.diffs.clear();
    editors.clear();
    onDirtyChange.mockClear();
    onOpenFile.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render() {
    await act(async () => {
      root.render(
        createElement(EditableChanges, {
          cwd: "/repo",
          onOpenFile,
          onDirtyChange,
        }),
      );
    });
    // Let the per-entry probes settle.
    await act(async () => {});
  }

  const entryPaths = () =>
    [...container.querySelectorAll("section")].map((section) =>
      section.getAttribute("data-change-path"),
    );
  const entry = (relative: string) =>
    container.querySelector<HTMLElement>(
      `section[data-change-path="/repo/${relative}"]`,
    );

  it("shows one entry per path, even with staged and unstaged changes", async () => {
    fs.files = [
      changed("a.ts", { staged: true, unstaged: true }),
      changed("b.ts", { staged: true, unstaged: false }),
      changed("c.ts"),
    ];
    await render();
    expect(entryPaths()).toEqual(["/repo/a.ts", "/repo/b.ts", "/repo/c.ts"]);
    expect(editors.get("/repo/a.ts")).toMatchObject({
      embedded: true,
      showDiff: true,
    });
  });

  it("shows a message instead of an editor for deleted, binary and too-large files", async () => {
    fs.files = [
      changed("gone.ts", { status: "deleted" }),
      changed("logo.png"),
      changed("dump.json"),
      changed("ok.ts"),
    ];
    fs.diffs.set("logo.png", { binary: true });
    fs.diffs.set("dump.json", { tooLarge: true });
    await render();
    expect(entry("gone.ts")?.textContent).toContain("File deleted.");
    expect(entry("logo.png")?.textContent).toContain("Binary file not shown.");
    expect(entry("dump.json")?.textContent).toContain("File too large to show.");
    expect([...editors.keys()]).toEqual(["/repo/ok.ts"]);
  });

  it("opens the file in a tab from the header", async () => {
    fs.files = [changed("a.ts")];
    await render();
    const open = entry("a.ts")?.querySelector<HTMLButtonElement>(
      'button[title="Open in tab"]',
    );
    act(() => open?.click());
    expect(onOpenFile).toHaveBeenCalledWith("/repo/a.ts");
  });

  it("reports unsaved edits and clears them when the entry collapses", async () => {
    fs.files = [changed("a.ts")];
    await render();
    act(() => editors.get("/repo/a.ts")?.onDirtyChange("/repo/a.ts", true));
    expect(onDirtyChange).toHaveBeenLastCalledWith("/repo/a.ts", true);
    expect(entry("a.ts")?.textContent).toContain("Unsaved");

    const collapse = entry("a.ts")?.querySelector<HTMLButtonElement>(
      'button[aria-expanded="true"]',
    );
    act(() => collapse?.click());
    expect(container.querySelector("[data-editor]")).toBeNull();
    expect(onDirtyChange).toHaveBeenLastCalledWith("/repo/a.ts", false);
  });

  const actionsOf = (patch: Partial<ChangeActions> = {}): ChangeActions => ({
    busy: null,
    onAction: vi.fn(),
    onAll: vi.fn(),
    stagedCount: 0,
    unstagedCount: 0,
    ...patch,
  });
  const FILE_ACTIONS = ["Discard Changes", "Stage Changes", "Unstage Changes"];
  async function renderWith(actions?: ChangeActions) {
    await act(async () => {
      root.render(
        createElement(EditableChanges, {
          cwd: "/repo",
          onOpenFile,
          onDirtyChange,
          actions,
        }),
      );
    });
    await act(async () => {});
  }
  const labelsIn = (scope: ParentNode) =>
    [...scope.querySelectorAll<HTMLButtonElement>("button[aria-label]")]
      .map((button) => button.getAttribute("aria-label") ?? "")
      .filter((label) => label.endsWith("Changes") || label.endsWith("All Changes"));
  const fileButton = (relative: string, label: string) =>
    [...entry(relative)!.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.getAttribute("aria-label") === label,
    )!;
  const bulkButton = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  it("offers discard and stage on an unstaged file", async () => {
    fs.files = [changed("u.ts")];
    await renderWith(actionsOf({ unstagedCount: 1 }));
    expect(labelsIn(entry("u.ts")!)).toEqual(["Discard Changes", "Stage Changes"]);
  });

  it("offers only unstage on a staged-only file", async () => {
    fs.files = [changed("s.ts", { staged: true, unstaged: false })];
    await renderWith(actionsOf({ stagedCount: 1 }));
    expect(labelsIn(entry("s.ts")!)).toEqual(["Unstage Changes"]);
  });

  it("offers all three on a file with staged and unstaged changes", async () => {
    fs.files = [changed("b.ts", { staged: true, unstaged: true })];
    await renderWith(actionsOf({ stagedCount: 1, unstagedCount: 1 }));
    expect(labelsIn(entry("b.ts")!)).toEqual(FILE_ACTIONS);
  });

  it("offers discard and stage on an untracked file", async () => {
    fs.files = [changed("n.ts", { status: "untracked" })];
    await renderWith(actionsOf({ unstagedCount: 1 }));
    expect(labelsIn(entry("n.ts")!)).toEqual(["Discard Changes", "Stage Changes"]);
  });

  it("keeps the file buttons in the header without hover-only classes", async () => {
    fs.files = [changed("b.ts", { staged: true, unstaged: true })];
    await renderWith(actionsOf({ stagedCount: 1, unstagedCount: 1 }));
    const header = entry("b.ts")!.querySelector("header")!;
    expect(header.querySelector(".hidden, [class*='group-hover']")).toBeNull();
    for (const label of FILE_ACTIONS) {
      expect(fileButton("b.ts", label).className).not.toMatch(/hidden|group-hover/);
    }
    // The status letter sits before the buttons, and "Open in tab" stays last.
    expect(header.lastElementChild?.getAttribute("title")).toBe("Open in tab");
    expect([...header.querySelectorAll("span")].some((span) => span.textContent === "M")).toBe(true);
  });

  it("calls onAction with the file and the action each button stands for", async () => {
    fs.files = [
      changed("u.ts"),
      changed("b.ts", { staged: true, unstaged: true }),
    ];
    const actions = actionsOf({ stagedCount: 1, unstagedCount: 2 });
    await renderWith(actions);

    act(() => fileButton("u.ts", "Stage Changes").click());
    expect(actions.onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ relative: "u.ts" }),
      "stage",
    );
    act(() => fileButton("u.ts", "Discard Changes").click());
    expect(actions.onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ relative: "u.ts" }),
      "discard",
    );
    act(() => fileButton("b.ts", "Unstage Changes").click());
    expect(actions.onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ relative: "b.ts", staged: true }),
      "unstage",
    );
    expect(actions.onAction).toHaveBeenCalledTimes(3);
  });

  it("disables the file and bulk buttons while a git action runs", async () => {
    fs.files = [changed("b.ts", { staged: true, unstaged: true })];
    await renderWith(actionsOf({ busy: "b.ts", stagedCount: 1, unstagedCount: 1 }));
    for (const label of FILE_ACTIONS) {
      expect(fileButton("b.ts", label).disabled).toBe(true);
    }
    for (const label of ["Discard All Changes", "Unstage All Changes", "Stage All Changes"]) {
      expect(bulkButton(label)?.disabled).toBe(true);
    }
  });

  it("shows the bulk row with the buttons that apply and calls onAll", async () => {
    fs.files = [
      changed("b.ts", { staged: true, unstaged: true }),
      changed("u.ts"),
    ];
    const actions = actionsOf({ stagedCount: 1, unstagedCount: 2 });
    await renderWith(actions);

    expect(container.textContent).toContain("2 files");
    expect(container.textContent).toContain("+3");
    expect(container.textContent).toContain("-1");
    expect(labelsIn(container)).toEqual(
      expect.arrayContaining(["Discard All Changes", "Unstage All Changes", "Stage All Changes"]),
    );

    act(() => bulkButton("Discard All Changes")!.click());
    expect(actions.onAll).toHaveBeenLastCalledWith("discard");
    act(() => bulkButton("Unstage All Changes")!.click());
    expect(actions.onAll).toHaveBeenLastCalledWith("unstage");
    act(() => bulkButton("Stage All Changes")!.click());
    expect(actions.onAll).toHaveBeenLastCalledWith("stage");
  });

  it("hides the bulk buttons that do not apply", async () => {
    fs.files = [changed("u.ts")];
    await renderWith(actionsOf({ stagedCount: 0, unstagedCount: 1 }));
    expect(bulkButton("Unstage All Changes")).toBeNull();
    expect(bulkButton("Discard All Changes")).not.toBeNull();
    expect(bulkButton("Stage All Changes")).not.toBeNull();
  });

  it("renders no git controls without actions", async () => {
    vi.mocked(gitDiffStats).mockClear();
    fs.files = [changed("b.ts", { staged: true, unstaged: true })];
    await renderWith();
    expect(labelsIn(container)).toEqual([]);
    expect(container.textContent).not.toContain("files");
    expect(gitDiffStats).not.toHaveBeenCalled();
  });
});
