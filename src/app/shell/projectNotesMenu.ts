import { Folder, FolderPlus, X } from "../../shared/ui/icons";
import { basename, pickFolder } from "../../platform/tauri/fs";
import { saveProjectNotesFolder } from "../../features/projects/model/projectNotesFolder";
import type { TabGroupMenuExtraItem } from "../../features/workspace/ui/TabGroupMenu";

export const NOTES_FOLDER_TITLE = "Link notes folder";
const APPLIES_TO = "Applies to new Claude Code chats";

/** Project menu rows for the notes folder, linked or not. */
export function projectNotesMenuItems(
  folder: string | null,
): TabGroupMenuExtraItem[] {
  if (!folder) {
    return [
      {
        id: "notes-link",
        label: "Link notes folder…",
        title: APPLIES_TO,
        icon: FolderPlus,
      },
    ];
  }
  return [
    {
      id: "notes-current",
      label: `Notes: ${basename(folder)}`,
      title: folder,
      icon: Folder,
      disabled: true,
    },
    {
      id: "notes-link",
      label: "Change notes folder…",
      title: APPLIES_TO,
      icon: FolderPlus,
    },
    { id: "notes-unlink", label: "Unlink notes folder", icon: X },
  ];
}

/**
 * Runs a notes menu action for a project. Returns false when the action is
 * not a notes action, so the caller can keep dispatching.
 */
export function runProjectNotesAction(
  action: string,
  project: string,
): boolean {
  if (action === "notes-unlink") {
    saveProjectNotesFolder(project, null);
  } else if (action === "notes-link") {
    void pickFolder(NOTES_FOLDER_TITLE)
      .then((folder) => {
        if (folder) saveProjectNotesFolder(project, folder);
      })
      .catch(() => undefined);
  } else {
    return false;
  }
  return true;
}
