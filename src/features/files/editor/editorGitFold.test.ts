import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { editorGit, stateWithGitOriginalUpdated } from "./editorGit";
import {
  editorGitFold,
  expandUnchangedRun,
  foldedRuns,
  unchangedLineRuns,
} from "./editorGitFold";

describe("unchangedLineRuns", () => {
  it("folds nothing without changes", () => {
    expect(unchangedLineRuns([], 100)).toEqual([]);
  });

  it("keeps three lines of context on each side of a change", () => {
    expect(unchangedLineRuns([{ from: 10, to: 10 }], 20)).toEqual([
      { from: 1, to: 6 },
      { from: 14, to: 20 },
    ]);
  });

  it("does not fold lines within three lines of a change", () => {
    expect(unchangedLineRuns([{ from: 4, to: 5 }], 8)).toEqual([]);
    expect(unchangedLineRuns([{ from: 1, to: 1 }], 5)).toEqual([
      { from: 5, to: 5 },
    ]);
  });

  it("folds the gap between two changes only when it is wider than both contexts", () => {
    expect(
      unchangedLineRuns(
        [
          { from: 5, to: 6 },
          { from: 13, to: 13 },
        ],
        16,
      ),
    ).toEqual([{ from: 1, to: 1 }]);
    expect(
      unchangedLineRuns(
        [
          { from: 5, to: 6 },
          { from: 20, to: 22 },
        ],
        30,
      ),
    ).toEqual([
      { from: 1, to: 1 },
      { from: 10, to: 16 },
      { from: 26, to: 30 },
    ]);
  });

  it("merges overlapping changes", () => {
    expect(
      unchangedLineRuns(
        [
          { from: 10, to: 20 },
          { from: 12, to: 14 },
        ],
        40,
      ),
    ).toEqual([
      { from: 1, to: 6 },
      { from: 24, to: 40 },
    ]);
  });
});

describe("editorGitFold", () => {
  const lines = (count: number, changed?: number) =>
    Array.from({ length: count }, (_, i) =>
      i + 1 === changed ? "CHANGED" : `line ${i + 1}`,
    ).join("\n");

  function stateFor(doc: string, original: string | null) {
    const state = EditorState.create({
      doc,
      extensions: [editorGit(), editorGitFold],
    });
    return stateWithGitOriginalUpdated(state, original);
  }

  it("folds the unchanged lines around one changed line", () => {
    const state = stateFor(lines(30, 15), lines(30));
    const runs = foldedRuns(state);
    expect(runs.map((run) => run.lines)).toEqual([11, 12]);
    expect(state.doc.lineAt(runs[0]!.from).number).toBe(1);
    expect(state.doc.lineAt(runs[0]!.to).number).toBe(11);
    expect(state.doc.lineAt(runs[1]!.from).number).toBe(19);
    expect(state.doc.lineAt(runs[1]!.to).number).toBe(30);
  });

  it("folds nothing before the original arrives or when nothing changed", () => {
    expect(foldedRuns(stateFor(lines(30, 15), null))).toEqual([]);
    expect(foldedRuns(stateFor(lines(30), lines(30)))).toEqual([]);
  });

  it("keeps an expanded run open through an edit elsewhere", () => {
    let state = stateFor(lines(30, 15), lines(30));
    const [first] = foldedRuns(state);
    state = state.update({ effects: expandUnchangedRun.of(first!.from) }).state;
    expect(foldedRuns(state).map((run) => run.lines)).toEqual([12]);

    const line15 = state.doc.line(15);
    state = state.update({
      changes: { from: line15.from, to: line15.to, insert: "EDITED" },
    }).state;
    expect(foldedRuns(state).map((run) => run.lines)).toEqual([12]);
  });
});
