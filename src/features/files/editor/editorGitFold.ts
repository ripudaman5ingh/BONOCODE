import type { Chunk } from "@codemirror/merge";
import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { chunksField } from "./editorGit";

/** One-based, inclusive line numbers. */
export type LineSpan = { from: number; to: number };

export const FOLD_CONTEXT_LINES = 3;

/**
 * The runs of lines more than `context` lines away from every change.
 * `changes` must be in document order. No changes means nothing folds, so a
 * file whose diff has not loaded yet stays fully visible.
 */
export function unchangedLineRuns(
  changes: readonly LineSpan[],
  lines: number,
  context = FOLD_CONTEXT_LINES,
): LineSpan[] {
  if (changes.length === 0) return [];
  const runs: LineSpan[] = [];
  let next = 1;
  for (const change of changes) {
    const to = Math.min(lines, change.from - context - 1);
    if (to >= next) runs.push({ from: next, to });
    next = Math.max(next, change.to + context + 1);
  }
  if (next <= lines) runs.push({ from: next, to: lines });
  return runs;
}

/** The current document's lines each chunk touches. A pure deletion touches the line after it. */
export function changedLineSpans(doc: Text, chunks: readonly Chunk[]): LineSpan[] {
  return chunks.map((chunk) => {
    const pos = Math.min(Math.max(0, chunk.fromB), doc.length);
    const from = doc.lineAt(pos).number;
    if (chunk.fromB === chunk.toB) return { from, to: from };
    const end = Math.max(pos, Math.min(chunk.endB, doc.length) - 1);
    return { from, to: doc.lineAt(end).number };
  });
}

/** Expands the folded run that contains this document position. */
export const expandUnchangedRun = StateEffect.define<number>();

// Expanded runs are remembered by a position inside them, mapped through
// edits, so a run stays open while the hunks around it change.
const expandedField = StateField.define<readonly number[]>({
  create: () => [],
  update(value, tr) {
    let next = tr.docChanged
      ? value.map((pos) => tr.changes.mapPos(pos))
      : value;
    for (const effect of tr.effects) {
      if (effect.is(expandUnchangedRun)) next = [...next, effect.value];
    }
    return next;
  },
});

/** The folded runs as document ranges, for the decorations and for tests. */
export function foldedRuns(
  state: EditorState,
): { from: number; to: number; lines: number }[] {
  const doc = state.doc;
  const chunks = state.field(chunksField, false) ?? [];
  const expanded = state.field(expandedField, false) ?? [];
  const runs = unchangedLineRuns(changedLineSpans(doc, chunks), doc.lines);
  return runs
    .map((run) => ({
      from: doc.line(run.from).from,
      to: doc.line(run.to).to,
      lines: run.to - run.from + 1,
    }))
    .filter((run) => !expanded.some((pos) => pos >= run.from && pos <= run.to));
}

class UnchangedLinesWidget extends WidgetType {
  constructor(readonly lines: number) {
    super();
  }

  eq(other: UnchangedLinesWidget) {
    return other.lines === this.lines;
  }

  toDOM(view: EditorView) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-gitUnchanged";
    button.textContent = `${this.lines} unchanged ${this.lines === 1 ? "line" : "lines"}`;
    button.addEventListener("click", () => {
      view.dispatch({ effects: expandUnchangedRun.of(view.posAtDOM(button)) });
    });
    return button;
  }

  get estimatedHeight() {
    return 24;
  }

  ignoreEvent() {
    return true;
  }
}

function foldDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = foldedRuns(state).map((run) =>
    Decoration.replace({
      widget: new UnchangedLinesWidget(run.lines),
      block: true,
    }).range(run.from, run.to),
  );
  return Decoration.set(ranges);
}

// Block replacements must come from a state field, not a view plugin.
const foldField = StateField.define<DecorationSet>({
  create: foldDecorations,
  update(value, tr) {
    if (
      tr.docChanged ||
      tr.state.field(chunksField, false) !==
        tr.startState.field(chunksField, false) ||
      tr.state.field(expandedField) !== tr.startState.field(expandedField)
    ) {
      return foldDecorations(tr.state);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Collapses unchanged lines into "N unchanged lines" bars. Needs `editorGit`. */
export const editorGitFold: Extension = [
  expandedField,
  foldField,
  EditorView.theme({
    ".cm-gitUnchanged": {
      display: "block",
      width: "100%",
      height: "24px",
      padding: "0 12px",
      border: "none",
      textAlign: "left",
      fontFamily: "var(--font-sans)",
      fontSize: "11px",
      color: "color-mix(in srgb, var(--color-content) 55%, transparent)",
      background: "color-mix(in srgb, var(--color-content) 5%, transparent)",
      cursor: "pointer",
    },
    ".cm-gitUnchanged:hover": {
      color: "var(--color-content)",
      background: "color-mix(in srgb, var(--color-content) 9%, transparent)",
    },
    // The overview strip maps the whole file, which no longer matches the
    // folded height, and the outer list owns scrolling anyway.
    "&.cm-editor .cm-gitOverview": { display: "none" },
  }),
];
