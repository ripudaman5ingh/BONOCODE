import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader,
} from "../../../shared/ui/icons";
import {
  gitDiffFiles,
  gitFileDiff,
  subscribeGitChanged,
  type GitChangedFile,
  type GitFileDiffKind,
} from "../../../platform/tauri/fs";
import { FileEditor, type SaveState } from "../../files/ui/FileEditor";
import { changedPathFiles } from "../model/workingTreeDiff";

type Props = {
  cwd: string;
  onOpenFile: (path: string) => void;
  /** Unsaved edits per absolute path, so the window can warn before a reload. */
  onDirtyChange: (path: string, dirty: boolean) => void;
};

/** How close to the viewport an entry comes before its editor mounts. */
const MOUNT_MARGIN_PX = 600;

/** Every changed file of `cwd` as an editable diff, stacked in one scroller. */
export function EditableChanges({ cwd, onOpenFile, onDirtyChange }: Props) {
  const [files, setFiles] = useState<GitChangedFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cwd || cwd === "~") {
      setFiles([]);
      return;
    }
    let disposed = false;
    let generation = 0;
    setFiles(null);
    setError(null);
    const run = () => {
      const current = ++generation;
      void gitDiffFiles(cwd)
        .then((index) => {
          if (disposed || current !== generation) return;
          setFiles(changedPathFiles(index.files));
          setError(null);
        })
        .catch((caught: unknown) => {
          if (disposed || current !== generation) return;
          setError(caught instanceof Error ? caught.message : String(caught));
        });
    };
    run();
    const unsubscribe = subscribeGitChanged(run);
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [cwd]);

  if (!cwd || cwd === "~") {
    return <Centered>No project folder</Centered>;
  }
  if (error && !files) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <AlertCircle className="mx-auto mb-3 size-5 text-danger" />
        <p className="text-[13px] text-content">Couldn’t load changes</p>
        <p className="mt-1 text-[12px] text-content/50">{error}</p>
      </div>
    );
  }
  if (files == null) {
    return (
      <Centered>
        <Loader className="size-4 animate-spin" strokeWidth={1.75} />
      </Centered>
    );
  }
  if (files.length === 0) return <Centered>No changes</Centered>;

  return (
    <div
      ref={scrollerRef}
      className="h-full min-h-0 overflow-y-auto overscroll-contain"
    >
      {files.map((file) => (
        <ChangeEntry
          key={file.path}
          cwd={cwd}
          file={file}
          scrollerRef={scrollerRef}
          active={focusedPath === file.path}
          onFocusChange={setFocusedPath}
          onOpenFile={onOpenFile}
          onDirtyChange={onDirtyChange}
        />
      ))}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center text-[13px] text-content/45">
      {children}
    </div>
  );
}

type Probe = "pending" | "text" | "binary" | "tooLarge";

function ChangeEntry({
  cwd,
  file,
  scrollerRef,
  active,
  onFocusChange,
  onOpenFile,
  onDirtyChange,
}: {
  cwd: string;
  file: GitChangedFile;
  scrollerRef: RefObject<HTMLDivElement | null>;
  active: boolean;
  onFocusChange: Dispatch<SetStateAction<string | null>>;
  onOpenFile: (path: string) => void;
  onDirtyChange: (path: string, dirty: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [near, setNear] = useState(false);
  const [probe, setProbe] = useState<Probe>("pending");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [dirty, setDirty] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const deleted = file.status === "deleted";
  const { path, relative } = file;
  // Same side FileEditor diffs against, so the probe and the editor agree.
  const kind: GitFileDiffKind =
    file.staged && !file.unstaged ? "staged" : "unstaged";
  const kindRef = useRef(kind);
  kindRef.current = kind;

  useEffect(() => {
    const section = sectionRef.current;
    if (near || collapsed || deleted || !section) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setNear(true);
      },
      {
        root: scrollerRef.current,
        rootMargin: `${MOUNT_MARGIN_PX}px 0px`,
        threshold: 0,
      },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [near, collapsed, deleted, scrollerRef]);

  // Binary and oversized files have no text to edit. Probed once: a later
  // change of side must not remount an editor the user is typing in.
  useEffect(() => {
    if (!near || deleted) return;
    let cancelled = false;
    void gitFileDiff(cwd, relative, kindRef.current)
      .then((diff) => {
        if (cancelled) return;
        setProbe(diff.binary ? "binary" : diff.tooLarge ? "tooLarge" : "text");
      })
      .catch(() => {
        // FileEditor shows its own load error.
        if (!cancelled) setProbe("text");
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, deleted, near, relative]);

  const mounted = near && !collapsed && !deleted && probe === "text";

  // The editor saves its own edits as it unmounts; the window's unsaved
  // marker goes with it.
  useEffect(() => {
    if (!mounted) return;
    return () => {
      setDirty(false);
      onDirtyChange(path, false);
    };
  }, [mounted, onDirtyChange, path]);

  const onEditorDirty = useCallback(
    (_path: string, next: boolean) => {
      setDirty(next);
      onDirtyChange(path, next);
    },
    [onDirtyChange, path],
  );

  const message = deleted
    ? "File deleted."
    : probe === "binary"
      ? "Binary file not shown."
      : probe === "tooLarge"
        ? "File too large to show."
        : null;

  return (
    <section
      ref={sectionRef}
      data-change-path={path}
      className="border-b border-stroke"
    >
      <header className="sticky top-0 z-30 flex h-8 items-center gap-1 border-b border-stroke bg-content/2 pr-1 pl-1 backdrop-blur-xl">
        <button
          type="button"
          aria-label={collapsed ? `Expand ${relative}` : `Collapse ${relative}`}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
          className="grid size-6 shrink-0 place-items-center rounded text-content/60 hover:bg-content/10 hover:text-content"
        >
          {collapsed ? (
            <ChevronRight className="size-3.5" strokeWidth={1.75} />
          ) : (
            <ChevronDown className="size-3.5" strokeWidth={1.75} />
          )}
        </button>
        <span
          className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-content/80"
          title={path}
        >
          {relative}
        </span>
        <EntrySaveState dirty={dirty} state={saveState} />
        <button
          type="button"
          title="Open in tab"
          aria-label={`Open ${relative} in tab`}
          onClick={() => onOpenFile(path)}
          className="grid size-6 shrink-0 place-items-center rounded text-content/60 hover:bg-content/10 hover:text-content"
        >
          <ExternalLink className="size-3.5" strokeWidth={1.75} />
        </button>
      </header>
      {collapsed ? null : message ? (
        <p className="px-3 py-2 text-[12px] text-content/50">{message}</p>
      ) : mounted ? (
        <div
          onFocus={() => onFocusChange(path)}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            onFocusChange((current) => (current === path ? null : current));
          }}
        >
          <FileEditor
            embedded
            showDiff
            path={path}
            cwd={cwd}
            active={active}
            onDirtyChange={onEditorDirty}
            onSaveStateChange={setSaveState}
            onOpenFile={onOpenFile}
          />
        </div>
      ) : (
        <div className="h-16" aria-hidden />
      )}
    </section>
  );
}

function EntrySaveState({ dirty, state }: { dirty: boolean; state: SaveState }) {
  const className = "shrink-0 px-1 text-[10.5px] text-content/45";
  if (state.status === "saving") return <span className={className}>Saving…</span>;
  if (state.status === "error") {
    return (
      <span
        className="max-w-40 shrink-0 truncate px-1 text-[10.5px] text-danger"
        title={state.message}
      >
        Save failed
      </span>
    );
  }
  if (dirty) return <span className={className}>Unsaved</span>;
  if (state.status === "saved") return <span className={className}>Saved</span>;
  return null;
}
