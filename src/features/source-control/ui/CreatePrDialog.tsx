import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Loader } from "../../../shared/ui/icons";
import { Modal } from "../../../shared/ui/Modal";

type Props = {
  base: string;
  head: string;
  initialTitle: string;
  initialBody: string;
  busy: boolean;
  error?: string | null;
  onCreate: (title: string, body: string) => void;
  onCancel: () => void;
};

export function CreatePrDialog({
  base,
  head,
  initialTitle,
  initialBody,
  busy,
  error,
  onCreate,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const input = useRef<HTMLInputElement>(null);
  const trimmedTitle = title.trim();

  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (error) input.current?.focus();
  }, [error]);

  const create = () => {
    if (!trimmedTitle || busy) return;
    onCreate(trimmedTitle, body.trim());
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    create();
  };

  return (
    <Modal
      title="Create pull request"
      description="Review the generated title and description before creating it."
      size="md"
      onClose={() => {
        if (!busy) onCancel();
      }}
    >
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={submit}
        onKeyDown={onKeyDown}
      >
        <p className="font-mono text-[11px] text-content/50">
          {base} ← {head}
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-content/70">Title</span>
          <input
            ref={input}
            type="text"
            value={title}
            aria-label="Pull request title"
            spellCheck={false}
            autoComplete="off"
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            className="h-9 rounded-md border border-content/10 bg-content/5 px-2.5 font-sans text-[13px] text-content outline-none placeholder:text-content/30 focus:border-content/25 disabled:opacity-50"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-content/70">Body</span>
          <textarea
            value={body}
            rows={8}
            aria-label="Pull request body"
            spellCheck={false}
            disabled={busy}
            onChange={(event) => setBody(event.target.value)}
            className="resize-y rounded-md border border-content/10 bg-content/5 px-2.5 py-2 font-sans text-[13px] leading-5 text-content outline-none placeholder:text-content/30 focus:border-content/25 disabled:opacity-50"
          />
        </label>

        {error ? (
          <p role="alert" className="text-[11px] leading-4 text-red-400/90">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[12px] text-content/70 hover:bg-content/8 hover:text-content disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!trimmedTitle || busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-content px-3 py-1.5 text-[12px] font-medium text-background-base hover:bg-content/80 disabled:opacity-40"
          >
            {busy ? (
              <Loader className="size-3.5 animate-spin" strokeWidth={1.75} />
            ) : null}
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}
