import { beforeEach, describe, expect, it } from "vitest";
import {
  loadProjectNotesFolder,
  saveProjectNotesFolder,
} from "./projectNotesFolder";

const KEY = "bonocode:project-notes-folders";

function mockBrowserStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
      clear: () => data.clear(),
      key: (index: number) => [...data.keys()][index] ?? null,
      get length() {
        return data.size;
      },
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { dispatchEvent: () => true },
    configurable: true,
  });
}

describe("project notes folder", () => {
  beforeEach(mockBrowserStorage);

  it("round-trips per project", () => {
    saveProjectNotesFolder("/work/alpha", "/notes/a");
    saveProjectNotesFolder("/work/beta", "/notes/b");
    expect(loadProjectNotesFolder("/work/alpha")).toBe("/notes/a");
    expect(loadProjectNotesFolder("/work/beta")).toBe("/notes/b");
    expect(loadProjectNotesFolder("/work/gamma")).toBeNull();
  });

  it("unlinks with null and leaves other projects alone", () => {
    saveProjectNotesFolder("/work/alpha", "/notes/a");
    saveProjectNotesFolder("/work/beta", "/notes/b");
    saveProjectNotesFolder("/work/alpha", null);
    expect(loadProjectNotesFolder("/work/alpha")).toBeNull();
    expect(loadProjectNotesFolder("/work/beta")).toBe("/notes/b");
  });

  it("treats bad stored JSON as nothing linked", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadProjectNotesFolder("/work/alpha")).toBeNull();
    localStorage.setItem(KEY, "[1,2]");
    expect(loadProjectNotesFolder("/work/alpha")).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ "/work/alpha": 7 }));
    expect(loadProjectNotesFolder("/work/alpha")).toBeNull();
  });

  it("recovers by overwriting bad stored JSON on save", () => {
    localStorage.setItem(KEY, "{not json");
    saveProjectNotesFolder("/work/alpha", "/notes/a");
    expect(loadProjectNotesFolder("/work/alpha")).toBe("/notes/a");
  });

  it("finds the folder when the project path is spelled differently", () => {
    saveProjectNotesFolder("/work/alpha/", "/notes/a");
    expect(loadProjectNotesFolder("/work/alpha")).toBe("/notes/a");
    saveProjectNotesFolder("C:\\Work\\Alpha", "D:/notes");
    expect(loadProjectNotesFolder("c:/work/alpha/")).toBe("D:/notes");
  });
});
