import { pathKey } from "../../../shared/lib/paths";

const KEY = "bonocode:project-notes-folders";

export const PROJECT_NOTES_FOLDER_CHANGED =
  "bonocode:project-notes-folder-changed";

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && entry[1].trim() !== "",
      ),
    );
  } catch {
    return {};
  }
}

/** The notes folder linked to a project, or null when none is. */
export function loadProjectNotesFolder(project: string): string | null {
  if (!project) return null;
  return read()[pathKey(project)] ?? null;
}

/** Link a folder to a project; null (or blank) unlinks it. */
export function saveProjectNotesFolder(
  project: string,
  folder: string | null,
) {
  if (!project) return;
  const next = read();
  const path = folder?.trim();
  if (path) next[pathKey(project)] = path;
  else delete next[pathKey(project)];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode / quota
  }
  window.dispatchEvent(new CustomEvent(PROJECT_NOTES_FOLDER_CHANGED));
}

export function subscribeProjectNotesFolder(listener: () => void) {
  window.addEventListener(PROJECT_NOTES_FOLDER_CHANGED, listener);
  return () =>
    window.removeEventListener(PROJECT_NOTES_FOLDER_CHANGED, listener);
}
