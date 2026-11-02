// @vitest-environment happy-dom
import { EditorView } from "@codemirror/view";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SCHEME_CHANGE_EVENT } from "../../settings/model/appearance";
import { CodeMirrorEditor } from "./CodeMirrorEditor";

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  invoke: vi.fn(async () => undefined),
}));

let root: Root;
let container: HTMLDivElement;

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

// Every theme apply announces the scheme; the code size may have changed with
// it, and CodeMirror cannot see a CSS variable change by itself.
it("re-measures an open editor whenever a theme is applied", async () => {
  await act(async () =>
    root.render(
      createElement(CodeMirrorEditor, {
        path: "/project/notes.txt",
        commentPath: "notes.txt",
        value: "one\ntwo\n",
        showDiff: false,
        gitOriginal: null,
        active: true,
        onDirtyChange: () => {},
        onErrorCountChange: () => {},
        onSave: async () => {},
        canAutosave: () => false,
      }),
    ),
  );
  await act(async () =>
    vi.waitFor(() =>
      expect(container.querySelector(".cm-editor")).not.toBeNull(),
    ),
  );
  const view = EditorView.findFromDOM(
    container.querySelector<HTMLElement>(".cm-editor")!,
  )!;
  const requestMeasure = vi.spyOn(view, "requestMeasure");

  window.dispatchEvent(
    new CustomEvent(SCHEME_CHANGE_EVENT, { detail: "dark" }),
  );
  expect(requestMeasure).toHaveBeenCalledTimes(1);
});
