// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitChangedFile, GitFileDiff } from "../../../platform/tauri/fs";

const fs = vi.hoisted(() => ({
  files: [] as GitChangedFile[],
  diffs: new Map<string, Partial<GitFileDiff>>(),
}));

vi.mock("../../../platform/tauri/fs", () => ({
  gitDiffFiles: vi.fn(async () => ({ files: fs.files })),
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
});
