import { beforeEach, describe, expect, it, vi } from "vitest";

const pickFolder = vi.fn<(title: string) => Promise<string | null>>();
vi.mock("../../platform/tauri/fs", () => ({
  pickFolder: (title: string) => pickFolder(title),
  basename: (path: string) => path.split("/").filter(Boolean).pop() ?? path,
}));

import {
  loadProjectNotesFolder,
  saveProjectNotesFolder,
} from "../../features/projects/model/projectNotesFolder";
import { projectNotesMenuItems, runProjectNotesAction } from "./projectNotesMenu";

function mockBrowserStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { dispatchEvent: () => true },
    configurable: true,
  });
}

describe("project notes menu", () => {
  beforeEach(() => {
    mockBrowserStorage();
    pickFolder.mockReset();
  });

  it("offers only the link item when nothing is linked", () => {
    expect(projectNotesMenuItems(null).map((i) => i.label)).toEqual([
      "Link notes folder…",
    ]);
  });

  it("shows the folder, change and unlink when linked", () => {
    const items = projectNotesMenuItems("/vault/Notes/Bonocode");
    expect(items.map((i) => i.label)).toEqual([
      "Notes: Bonocode",
      "Change notes folder…",
      "Unlink notes folder",
    ]);
    expect(items[0]).toMatchObject({
      disabled: true,
      title: "/vault/Notes/Bonocode",
    });
    expect(items[1].title).toBe("Applies to new Claude Code chats");
  });

  it("links the picked folder and ignores a cancelled picker", async () => {
    pickFolder.mockResolvedValueOnce("/vault/Notes");
    expect(runProjectNotesAction("notes-link", "/work/alpha")).toBe(true);
    await vi.waitFor(() =>
      expect(loadProjectNotesFolder("/work/alpha")).toBe("/vault/Notes"),
    );
    expect(pickFolder).toHaveBeenCalledWith("Link notes folder");

    pickFolder.mockResolvedValueOnce(null);
    runProjectNotesAction("notes-link", "/work/alpha");
    await Promise.resolve();
    await Promise.resolve();
    expect(loadProjectNotesFolder("/work/alpha")).toBe("/vault/Notes");
  });

  it("unlinks, and leaves other actions alone", () => {
    saveProjectNotesFolder("/work/alpha", "/vault/Notes");
    expect(runProjectNotesAction("notes-unlink", "/work/alpha")).toBe(true);
    expect(loadProjectNotesFolder("/work/alpha")).toBeNull();
    expect(runProjectNotesAction("pin", "/work/alpha")).toBe(false);
  });
});
