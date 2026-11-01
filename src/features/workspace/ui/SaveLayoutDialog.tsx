import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "../../../shared/ui/Modal";
import { isBuiltInPresetName } from "../model/layoutPresets";

type Props = {
  onSave: (name: string) => void;
  onCancel: () => void;
};

export function SaveLayoutDialog({ onSave, onCancel }: Props) {
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();
  const error = isBuiltInPresetName(trimmed)
    ? `“${trimmed}” is a built-in layout. Choose another name.`
    : null;

  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || error) return;
    onSave(trimmed);
  };

  return (
    <Modal
      title="Save layout"
      description="Save the sidebars and docks as a layout. A layout with the same name is replaced."
      size="sm"
      onClose={onCancel}
    >
      <form className="flex flex-col gap-4 p-4" onSubmit={submit}>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-content/70">
            Layout name
          </span>
          <input
            ref={input}
            type="text"
            value={name}
            placeholder="My layout"
            aria-label="Layout name"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(event) => setName(event.target.value)}
            className="h-9 rounded-md border border-content/10 bg-content/5 px-2.5 font-sans text-[13px] text-content outline-none placeholder:text-content/30 focus:border-content/25"
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
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[12px] text-content/70 hover:bg-content/8 hover:text-content"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!trimmed || !!error}
            className="inline-flex items-center gap-1.5 rounded-md bg-content px-3 py-1.5 text-[12px] font-medium text-background-base hover:bg-content/80 disabled:opacity-40"
          >
            Save layout
          </button>
        </div>
      </form>
    </Modal>
  );
}
