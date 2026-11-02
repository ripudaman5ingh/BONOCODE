import { acceptCompletion, completionStatus } from "@codemirror/autocomplete";
import { indentLess, indentMore } from "@codemirror/commands";
import {
  foldGutter,
  foldKeymap,
  getIndentUnit,
  indentUnit,
} from "@codemirror/language";
import {
  Annotation,
  Compartment,
  countColumn,
  EditorSelection,
  Prec,
  StateField,
  Transaction,
  type EditorState,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { ChevronDown, ChevronUp } from "../../../shared/ui/icons";
import { formatInteger } from "../../../shared/lib/numbers";
import { minimalSetup } from "codemirror";
import { useCallback, useEffect, useRef, useState } from "react";
import { useColorScheme } from "../../../shared/hooks/useColorScheme";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import { isLightScheme } from "../../settings/model/appearance";
import { loadAutosave, loadFormatOnSave } from "../../settings/model/settings";
import { formatText } from "../../../shared/lib/format";
import type { EditorNavigation } from "../../search/model/search";
import {
  DiffCommentComposer,
  type DiffCommentComposerTarget,
} from "../../source-control/ui/DiffCommentComposer";
import { editorAutocomplete } from "../editor/editorAutocomplete";
import { languageForPath, schemeExtensions } from "../editor/editorChrome";
import { preserveEditorViewport, replaceEditorDoc } from "../editor/editorDoc";
import {
  editorMatching,
  editorTyping,
  tryExpandEmmet,
} from "../editor/editorEditing";
import {
  EditorSelectionMenu,
  type EditorSelectionTarget,
} from "./EditorSelectionMenu";
import {
  diffActiveChunkIndex,
  diffLineStatsForView,
  diffNavigablePositions,
  diffNavUpdateRelevant,
  diffScrollToChunk,
  editorGit,
  setGitOriginal,
} from "../editor/editorGit";
import { editorLint } from "../editor/editorLint";
import { editorSearch } from "../editor/editorSearch";
import { editorScrollbar } from "../editor/editorScrollbar";
import { editorGitFold } from "../editor/editorGitFold";

export type EditorNavigationRequest = EditorNavigation & { token: number };

export const FILE_EDITOR_AUTOSAVE_DELAY_MS = 1_000;

const editorScheme = new Compartment();
const editorGitConfig = new Compartment();

export function CodeMirrorEditor({
  path,
  commentPath,
  value,
  showDiff,
  gitOriginal,
  active,
  navigation,
  onDirtyChange,
  onErrorCountChange,
  onSave,
  canAutosave,
  onStageGit,
  onDocChange,
  formatOnSave = true,
  embedded = false,
}: {
  path: string;
  commentPath: string;
  value: string;
  showDiff: boolean;
  gitOriginal: string | null;
  active: boolean;
  navigation?: EditorNavigationRequest | null;
  onDirtyChange: (dirty: boolean) => void;
  onErrorCountChange: (count: number) => void;
  onSave: (content: string) => Promise<void>;
  canAutosave: () => boolean;
  onStageGit?: (contents: string) => Promise<void>;
  onDocChange?: (content: string) => void;
  formatOnSave?: boolean;
  /** Sized by its content inside an outer scroller, with unchanged lines folded. */
  embedded?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const savedDocumentRef = useRef<Text | null>(null);
  const dirtyRef = useRef(false);
  const activeRef = useRef(active);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onErrorCountChangeRef = useRef(onErrorCountChange);
  const onSaveRef = useRef(onSave);
  const canAutosaveRef = useRef(canAutosave);
  const onStageGitRef = useRef(onStageGit);
  const canStage = onStageGit !== undefined;
  const onDocChangeRef = useRef(onDocChange);
  const valueRef = useRef(value);
  const navigationTokenRef = useRef<number | undefined>(undefined);
  const pendingNavigationRef = useRef<EditorNavigationRequest | null>(null);
  const gitOriginalRef = useRef(gitOriginal);
  const chunkNavPinnedRef = useRef<number | null>(null);
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const colorScheme = useColorScheme();
  const [chunkNav, setChunkNav] = useState<{
    positions: number[];
    index: number;
    additions: number;
    deletions: number;
  } | null>(null);
  const [commentTarget, setCommentTarget] =
    useState<DiffCommentComposerTarget | null>(null);
  const [selectionTarget, setSelectionTarget] =
    useState<EditorSelectionTarget | null>(null);
  const gitOptions = {
    onStage: canStage
      ? (contents: string) => onStageGitRef.current?.(contents)
      : undefined,
    onComment: setCommentTarget,
  };
  activeRef.current = active;
  onDirtyChangeRef.current = onDirtyChange;
  onErrorCountChangeRef.current = onErrorCountChange;
  onSaveRef.current = onSave;
  canAutosaveRef.current = canAutosave;
  onStageGitRef.current = onStageGit;
  onDocChangeRef.current = onDocChange;
  valueRef.current = value;
  gitOriginalRef.current = gitOriginal;

  const syncChunkNav = useCallback((view: EditorView, fromScroll = true) => {
    const positions = diffNavigablePositions(view);
    const { additions, deletions } = diffLineStatsForView(view);
    if (positions.length === 0) {
      setChunkNav((current) =>
        current && current.positions.length === 0
          ? current
          : {
              positions: [],
              index: 0,
              additions: 0,
              deletions: 0,
            },
      );
      chunkNavPinnedRef.current = null;
      return;
    }
    let index = chunkNavPinnedRef.current;
    if (
      fromScroll ||
      index === null ||
      index < 0 ||
      index >= positions.length
    ) {
      index = diffActiveChunkIndex(view, positions);
    }
    chunkNavPinnedRef.current = index;
    setChunkNav((current) => {
      if (
        current &&
        current.index === index &&
        current.additions === additions &&
        current.deletions === deletions &&
        current.positions.length === positions.length &&
        current.positions.every((pos, i) => pos === positions[i])
      ) {
        return current;
      }
      return { positions, index, additions, deletions };
    });
  }, []);

  const stepChunkNav = useCallback(
    (delta: number) => {
      const view = viewRef.current;
      if (!view || !chunkNav || chunkNav.positions.length === 0) return;
      const next = Math.min(
        chunkNav.positions.length - 1,
        Math.max(0, chunkNav.index + delta),
      );
      if (next === chunkNav.index) return;
      chunkNavPinnedRef.current = next;
      diffScrollToChunk(view, chunkNav.positions[next]);
      setChunkNav({
        positions: chunkNav.positions,
        index: next,
        additions: chunkNav.additions,
        deletions: chunkNav.deletions,
      });
    },
    [chunkNav],
  );

  const setDirty = (nextDirty: boolean) => {
    if (dirtyRef.current === nextDirty) return;
    dirtyRef.current = nextDirty;
    onDirtyChangeRef.current(nextDirty);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const language = new Compartment();
    let disposed = false;
    let saveGeneration = 0;
    let autosaveTimer = 0;
    let view: EditorView;

    const markDirty = () => {
      const saved = savedDocumentRef.current;
      setDirty(saved ? !view.state.doc.eq(saved) : false);
    };

    const save = (automatic = false) => {
      const retryPendingAutosave = autosaveTimer !== 0 && loadAutosave();
      window.clearTimeout(autosaveTimer);
      const generation = ++saveGeneration;
      void (async () => {
        const before = view.state.doc.toString();
        if (formatOnSave && loadFormatOnSave()) {
          const result = await formatText(
            path,
            before,
            view.state.selection.main.head,
          );
          if (disposed || generation !== saveGeneration) return;

          if (
            result &&
            result.formatted !== before &&
            view.state.doc.toString() === before
          ) {
            replaceEditorDoc(view, result.formatted, {
              selection: {
                anchor: Math.min(
                  Math.max(0, result.cursorOffset),
                  result.formatted.length,
                ),
              },
            });
          }
        }

        const document = view.state.doc;
        if (automatic && !canAutosaveRef.current()) return;
        try {
          await onSaveRef.current(document.toString());
        } catch {
          if (
            retryPendingAutosave &&
            !disposed &&
            generation === saveGeneration &&
            dirtyRef.current
          ) {
            scheduleAutosave();
          }
          return;
        }
        if (disposed || generation !== saveGeneration) return;
        savedDocumentRef.current = document;
        markDirty();
      })();
      return true;
    };

    function scheduleAutosave() {
      window.clearTimeout(autosaveTimer);
      if (!loadAutosave()) return;
      autosaveTimer = window.setTimeout(() => {
        autosaveTimer = 0;
        if (
          dirtyRef.current &&
          loadAutosave() &&
          canAutosaveRef.current()
        ) {
          save(true);
        }
      }, FILE_EDITOR_AUTOSAVE_DELAY_MS);
    }

    view = new EditorView({
      doc: valueRef.current,
      parent: host,
      extensions: [
        minimalSetup,
        showDiff ? editorGitConfig.of(editorGit(gitOptions)) : [],
        showDiff && embedded ? editorGitFold : [],
        lineNumbers(),
        foldGutter(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        EditorView.lineWrapping,
        wrappedLineIndent,
        language.of([]),
        editorScheme.of(schemeExtensions(isLightScheme() ? "light" : "dark")),
        editorMatching,
        editorTyping(path),
        editorAutocomplete,
        editorLint(path, (count) => onErrorCountChangeRef.current(count)),
        editorScrollbar,
        editorSearch,
        Prec.high(
          keymap.of([
            ...foldKeymap,
            { key: "Mod-s", run: () => save(), preventDefault: true },
            {
              key: "Tab",
              run: (view) => {
                if (
                  completionStatus(view.state) === "active" &&
                  acceptCompletion(view)
                ) {
                  return true;
                }
                return tryExpandEmmet(view) || indentOrInsertTab(view);
              },
              shift: indentLess,
              preventDefault: true,
            },
          ]),
        ),
        EditorView.updateListener.of((update) => {
          if (
            update.transactions.some(
              (tr) =>
                (tr.selection || tr.docChanged) &&
                !tr.annotation(diskReload) &&
                !tr.annotation(sourceNavigation),
            )
          ) {
            pendingNavigationRef.current = null;
          }
          if (update.selectionSet) {
            setSelectionTarget(editorSelectionTarget(update.view, commentPath));
          } else if (update.docChanged) {
            setSelectionTarget(null);
          }
          if (!update.docChanged) return;
          onDocChangeRef.current?.(update.state.doc.toString());
          if (update.transactions.some((tr) => tr.annotation(diskReload))) {
            return;
          }
          markDirty();
          scheduleAutosave();
        }),
        EditorView.domEventHandlers({
          blur: () => {
            pendingNavigationRef.current = null;
          },
        }),
        showDiff
          ? EditorView.updateListener.of((update) => {
              if (!diffNavUpdateRelevant(update)) return;
              chunkNavPinnedRef.current = null;
              syncChunkNav(update.view);
            })
          : [],
      ],
    });
    savedDocumentRef.current = view.state.doc;
    dirtyRef.current = false;
    viewRef.current = view;
    lockOverscroll(view.scrollDOM as HTMLDivElement);
    if (showDiff) {
      if (gitOriginalRef.current) {
        setGitOriginal(view, gitOriginalRef.current);
      }
      syncChunkNav(view);
    } else {
      setChunkNav({
        positions: [],
        index: 0,
        additions: 0,
        deletions: 0,
      });
    }
    if (activeRef.current) view.focus();

    void languageForPath(path).then((extension) => {
      if (!disposed && extension) {
        view.dispatch({ effects: language.reconfigure(extension) });
      }
    });

    return () => {
      disposed = true;
      window.clearTimeout(autosaveTimer);
      onErrorCountChangeRef.current(0);
      lockOverscroll(null);
      viewRef.current = null;
      savedDocumentRef.current = null;
      setChunkNav(null);
      setSelectionTarget(null);
      // An embedded editor unmounts whenever its list does, so it saves rather
      // than drop the edit. Autosave's pending-disk guard is skipped on purpose.
      if (embedded && dirtyRef.current) {
        void onSaveRef.current(view.state.doc.toString()).catch(() => {});
      }
      view.destroy();
    };
  }, [embedded, formatOnSave, lockOverscroll, path, showDiff, syncChunkNav]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editorScheme.reconfigure(schemeExtensions(colorScheme)),
    });
  }, [colorScheme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !showDiff) return;
    view.dispatch({
      effects: editorGitConfig.reconfigure(editorGit(gitOptions)),
    });
  }, [canStage, showDiff]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !showDiff) return;
    let changed = false;
    preserveEditorViewport(view, () => {
      changed = setGitOriginal(view, gitOriginal);
    });
    if (!changed) return;
    chunkNavPinnedRef.current = null;
    syncChunkNav(view);
  }, [gitOriginal, showDiff, syncChunkNav]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !showDiff) return;
    const onScroll = () => {
      chunkNavPinnedRef.current = null;
      syncChunkNav(view);
    };
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    return () => view.scrollDOM.removeEventListener("scroll", onScroll);
  }, [showDiff, syncChunkNav, path]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || dirtyRef.current) return;
    if (view.state.doc.toString() === value) return;
    replaceEditorDoc(view, value, {
      annotations: [Transaction.addToHistory.of(false), diskReload.of(true)],
    });
    savedDocumentRef.current = view.state.doc;
    setDirty(false);
    if (showDiff) {
      chunkNavPinnedRef.current = null;
      syncChunkNav(view);
    }
  }, [showDiff, syncChunkNav, value]);

  useEffect(() => {
    if (!navigation) {
      pendingNavigationRef.current = null;
      return;
    }
    if (navigationTokenRef.current !== navigation.token) {
      navigationTokenRef.current = navigation.token;
      pendingNavigationRef.current = navigation;
    }
    const pending = pendingNavigationRef.current;
    if (!pending) return;
    const view = viewRef.current;
    if (!view) return;

    let cancelled = false;
    const run = () => {
      if (cancelled || pendingNavigationRef.current !== pending) return;
      revealNavigation(view, pending);
      // Retry a clamped location only while its line has not arrived and
      // the user has not moved the caret, edited the file, or left the editor.
      if (pending.line <= view.state.doc.lines) {
        pendingNavigationRef.current = null;
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(run));

    return () => {
      cancelled = true;
    };
  }, [navigation, value]);

  useEffect(() => {
    if (!active) return;
    const view = viewRef.current;
    if (!view) return;
    view.requestMeasure();
    const activeEl = document.activeElement;
    if (
      activeEl &&
      view.dom.contains(activeEl) &&
      activeEl !== view.contentDOM
    ) {
      return;
    }
    view.focus();
  }, [active, path]);

  useEffect(() => {
    if (!active) setSelectionTarget(null);
  }, [active]);

  return (
    <>
      <div
        className={
          embedded
            ? "flex flex-col"
            : "flex min-h-0 flex-1 flex-col overflow-hidden"
        }
      >
        {showDiff && !embedded ? (
          <DiffChunkNav
            index={chunkNav?.index ?? 0}
            total={chunkNav?.positions.length ?? 0}
            additions={chunkNav?.additions ?? 0}
            deletions={chunkNav?.deletions ?? 0}
            onPrev={() => stepChunkNav(-1)}
            onNext={() => stepChunkNav(1)}
          />
        ) : null}
        <div ref={hostRef} className={embedded ? undefined : "min-h-0 flex-1"} />
      </div>
      {commentTarget ? (
        <DiffCommentComposer
          path={commentPath}
          target={commentTarget}
          onDismiss={() => setCommentTarget(null)}
        />
      ) : null}
      <EditorSelectionMenu
        selection={selectionTarget}
        onDismiss={() => setSelectionTarget(null)}
      />
    </>
  );
}

function editorSelectionTarget(
  view: EditorView,
  path: string,
): EditorSelectionTarget | null {
  if (view.state.selection.ranges.length !== 1) return null;
  const selection = view.state.selection.main;
  if (selection.empty) return null;

  const text = view.state.sliceDoc(selection.from, selection.to);
  if (!text.trim()) return null;
  const coordinates = view.coordsAtPos(
    selection.head,
    selection.head === selection.from ? 1 : -1,
  );
  if (!coordinates) return null;

  const viewport = view.scrollDOM.getBoundingClientRect();
  if (
    coordinates.bottom < viewport.top ||
    coordinates.top > viewport.bottom ||
    coordinates.right < viewport.left ||
    coordinates.left > viewport.right
  ) {
    return null;
  }

  const lastSelectedPosition = Math.max(selection.from, selection.to - 1);
  return {
    path,
    startLine: view.state.doc.lineAt(selection.from).number,
    endLine: view.state.doc.lineAt(lastSelectedPosition).number,
    anchor: new DOMRect(
      coordinates.left,
      coordinates.top,
      Math.max(1, coordinates.right - coordinates.left),
      Math.max(1, coordinates.bottom - coordinates.top),
    ),
  };
}

function DiffChunkNav({
  index,
  total,
  additions,
  deletions,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  additions: number;
  deletions: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <header
      className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-stroke px-3 pr-1"
      role="toolbar"
      aria-label="Jump between changes"
    >
      <DiffChunkStat additions={additions} deletions={deletions} />
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          title="Previous change"
          aria-label="Previous change"
          disabled={total === 0 || index <= 0}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onPrev}
          className="grid size-6 place-items-center rounded text-content/70 hover:bg-content/10 hover:text-content disabled:opacity-35"
        >
          <ChevronUp className="size-3.5" strokeWidth={1.75} />
        </button>
        <span className="min-w-10 px-0.5 text-center font-mono text-[10.5px] font-medium tabular-nums text-content/55 select-none">
          {total === 0 ? "0/0" : `${index + 1}/${total}`}
        </span>
        <button
          type="button"
          title="Next change"
          aria-label="Next change"
          disabled={total === 0 || index >= total - 1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onNext}
          className="grid size-6 place-items-center rounded text-content/70 hover:bg-content/10 hover:text-content disabled:opacity-35"
        >
          <ChevronDown className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}

function DiffChunkStat({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  if (additions <= 0 && deletions <= 0) {
    return <span className="min-w-0 flex-1" />;
  }
  return (
    <span className="flex min-w-0 shrink-0 items-center gap-1.5 font-sans text-[11px] font-semibold tabular-nums">
      {additions > 0 ? (
        <span className="text-success">+{formatInteger(additions)}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-danger">-{formatInteger(deletions)}</span>
      ) : null}
    </span>
  );
}

function revealNavigation(view: EditorView, target: EditorNavigation) {
  const lineNumber = Math.min(Math.max(1, target.line), view.state.doc.lines);
  const line = view.state.doc.line(lineNumber);
  const column = Math.max(1, target.column ?? 1);
  const anchor = Math.min(line.from + column - 1, line.to);
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: "center" }),
    annotations: sourceNavigation.of(true),
  });
  view.focus();
}

const diskReload = Annotation.define<boolean>();
const sourceNavigation = Annotation.define<boolean>();

function indentOrInsertTab(view: EditorView): boolean {
  const { state, dispatch } = view;
  if (state.readOnly) return false;
  if (state.selection.ranges.some((range) => !range.empty)) {
    return indentMore(view);
  }

  const unit = state.facet(indentUnit);
  if (unit === "\t") {
    dispatch(
      state.update(state.replaceSelection("\t"), {
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  }

  const width = getIndentUnit(state);
  dispatch(
    state.update(
      state.changeByRange((range) => {
        const line = state.doc.lineAt(range.head);
        const column = countColumn(
          line.text.slice(0, range.head - line.from),
          state.tabSize,
        );
        const insert = " ".repeat(width - (column % width) || width);
        return {
          changes: { from: range.head, insert },
          range: EditorSelection.cursor(range.head + insert.length),
        };
      }),
      { scrollIntoView: true, userEvent: "input" },
    ),
  );
  return true;
}

type LineRange = { from: number; to: number };

const wrappedLineIndent = StateField.define<DecorationSet>({
  create(state) {
    return Decoration.set(
      indentDecorations(state, [{ from: 0, to: state.doc.length }]),
      true,
    );
  },
  update(decorations, transaction) {
    if (!transaction.docChanged) return decorations;
    const ranges: LineRange[] = [];
    transaction.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
      const from = transaction.state.doc.lineAt(fromB).from;
      const to = transaction.state.doc.lineAt(toB).to;
      ranges.push({ from, to });
    });
    const changedLines = mergeLineRanges(ranges);
    return decorations.map(transaction.changes).update({
      filter: (from) =>
        !changedLines.some((range) => from >= range.from && from <= range.to),
      add: indentDecorations(transaction.state, changedLines),
      sort: true,
    });
  },
  provide: (field) => EditorView.decorations.from(field),
});

function indentDecorations(state: EditorState, ranges: LineRange[]) {
  const decorations = [];
  for (const range of ranges) {
    let line = state.doc.lineAt(range.from);
    while (line.from <= range.to) {
      const columns = leadingIndentColumns(line.text, state.tabSize);
      if (columns > 0) {
        const indent = Math.min(columns, 40);
        decorations.push(
          Decoration.line({
            attributes: {
              class: "cm-wrapped-indent",
              style: `padding-left: calc(${indent}ch + 6px); text-indent: -${indent}ch`,
            },
          }).range(line.from),
        );
      }
      if (line.number >= state.doc.lines) break;
      line = state.doc.line(line.number + 1);
    }
  }
  return decorations;
}

function leadingIndentColumns(text: string, tabSize: number): number {
  let columns = 0;
  for (const character of text) {
    if (character === " ") {
      columns += 1;
    } else if (character === "\t") {
      columns += tabSize - (columns % tabSize);
    } else {
      break;
    }
  }
  return columns;
}

function mergeLineRanges(ranges: LineRange[]): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const merged: LineRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to + 1) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}
