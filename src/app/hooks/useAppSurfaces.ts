import { message } from "@tauri-apps/plugin-dialog";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import {
  loadProjectRailOpen,
  loadSessionSidebarOpen,
  saveProjectRailOpen,
  saveSessionSidebarOpen,
  type SidebarTabId,
} from "../../features/settings/model/appearance";
import { releaseNotesForVersion } from "../model/releaseNotes";
import { type SettingsAnchor } from "../../features/settings/ui/SettingsView";
import {
  loadCollapsedProjectRailMode,
  loadSettingsSection,
  saveSettingsSection,
  type CollapsedProjectRailMode,
  type SettingsSectionId,
} from "../../features/settings/model/settings";
import { type InstalledUpdate } from "../model/updateNotice";

export type UseAppSurfacesDeps = {
  installedUpdate: InstalledUpdate | null;
  setSidebarTab: (tab: SidebarTabId, project?: string) => void;
  onVisitBack: () => void;
  onVisitForward: () => void;
};

export function useAppSurfaces(deps: UseAppSurfacesDeps) {
  const {
    installedUpdate,
    setSidebarTab,
    onVisitBack,
    onVisitForward,
  } = deps;

  const [projectRailOpen, setProjectRailOpen] = useState(loadProjectRailOpen);
  const [sessionSidebarOpen, setSessionSidebarOpen] = useState(
    loadSessionSidebarOpen,
  );

  const [filesSearchOpen, setFilesSearchOpen] = useState(false);
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [searchViewOpen, setSearchViewOpen] = useState(false);
  const [searchViewFocusToken, setSearchViewFocusToken] = useState(0);

  const [collapsedProjectRailMode, setCollapsedProjectRailMode] =
    useState<CollapsedProjectRailMode>(loadCollapsedProjectRailMode);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsReturnViewRef = useRef({
    search: false,
  });
  const [updateNotice, setUpdateNotice] = useState(installedUpdate);
  const [whatsNewVersion, setWhatsNewVersion] = useState<string | null>(null);

  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionId>(loadSettingsSection);
  const [settingsAnchor, setSettingsAnchor] = useState<SettingsAnchor | null>(
    null,
  );
  const [notificationProjectPath, setNotificationProjectPath] = useState<
    string | null
  >(null);
  const [notificationSettingsRequest, setNotificationSettingsRequest] =
    useState(0);

  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [filePickerInitialQuery, setFilePickerInitialQuery] = useState("");
  const [filePickerResetToken, setFilePickerResetToken] = useState(0);

  const searchViewOpenRef = useRef(searchViewOpen);
  searchViewOpenRef.current = searchViewOpen;
  const foregroundSurfaceRef = useRef<{ workspaceVisible: boolean }>({
    workspaceVisible: true,
  });
  foregroundSurfaceRef.current = {
    workspaceVisible: !searchViewOpen && !settingsOpen,
  };

  const settingsOpenRef = useRef(settingsOpen);
  settingsOpenRef.current = settingsOpen;

  const filePickerOpenRef = useRef(filePickerOpen);
  filePickerOpenRef.current = filePickerOpen;
  const whatsNewVersionRef = useRef(whatsNewVersion);
  whatsNewVersionRef.current = whatsNewVersion;

  const onOpenWhatsNew = useCallback((version: string) => {
    const document = releaseNotesForVersion(version);
    if (!document) {
      void message(
        "Release notes for this version are not available in this build.",
        { title: "Bonocode" },
      );
      return;
    }
    setWhatsNewVersion(document.source.version);
  }, []);

  const onToggleSidebar = useCallback(() => {
    setProjectRailOpen((open) => {
      const next = !open;
      saveProjectRailOpen(next);
      return next;
    });
  }, []);

  const onToggleSessionSidebar = useCallback(() => {
    setSessionSidebarOpen((open) => {
      const next = !open;
      saveSessionSidebarOpen(next);
      return next;
    });
  }, []);

  const onToggleProjectRail = useCallback(() => {
    setProjectRailOpen((open) => {
      const next = !open;
      saveProjectRailOpen(next);
      return next;
    });
  }, []);

  const onGoToFile = useCallback(() => {
    setSearchViewOpen(false);
    setFilePickerInitialQuery("");
    setFilePickerResetToken((token) => token + 1);
    setFilePickerOpen(true);
  }, []);
  const onOpenCommandPalette = useCallback(() => {
    setSearchViewOpen(false);
    setFilePickerInitialQuery(">");
    setFilePickerResetToken((token) => token + 1);
    setFilePickerOpen(true);
  }, []);

  const onFindInProject = useCallback(() => {
    setSearchViewOpen(false);
    setSidebarTab("files");
    setFilesSearchOpen(true);
    setSearchFocusToken((token) => token + 1);
  }, []);

  const onOpenSearch = useCallback(() => {
    startTransition(() => {
      setFilePickerOpen(false);
      setSettingsOpen(false);
      setSearchViewOpen(true);
      setSearchViewFocusToken((token) => token + 1);
    });
  }, []);

  const onLeaveSearch = useCallback(() => {
    setSearchViewOpen(false);
  }, []);

  const openSettings = useCallback(
    (section?: SettingsSectionId, anchor?: SettingsAnchor) => {
      if (!settingsOpenRef.current) {
        settingsReturnViewRef.current = {
          search: searchViewOpenRef.current,
        };
      }
      startTransition(() => {
        setFilePickerOpen(false);
        setSearchViewOpen(false);
        if (section) {
          setSettingsSection(section);
          saveSettingsSection(section);
        }
        setSettingsAnchor(anchor ?? null);
        setNotificationProjectPath(null);
        setSettingsOpen(true);
      });
    },
    [],
  );

  useEffect(() => {
    const onOpenMcp = () => openSettings("mcp");
    window.addEventListener("bonocode:open-mcp-settings", onOpenMcp);
    return () => window.removeEventListener("bonocode:open-mcp-settings", onOpenMcp);
  }, [openSettings]);

  const onOpenNotificationSettings = useCallback(
    (path?: string) => {
      openSettings("github", "project-notifications");
      setNotificationProjectPath(path ?? null);
      setNotificationSettingsRequest((request) => request + 1);
    },
    [openSettings],
  );

  const onCloseSettings = useCallback(() => {
    const returnView = settingsReturnViewRef.current;
    setSearchViewOpen(returnView.search);
    setSettingsOpen(false);
  }, []);

  const onSelectSettingsSection = useCallback((section: SettingsSectionId) => {
    setSettingsSection(section);
    saveSettingsSection(section);
  }, []);

  const onRailBack = useCallback(() => {
    if (settingsOpen) {
      onCloseSettings();
      return;
    }
    if (searchViewOpen) {
      setSearchViewOpen(false);
      return;
    }
    onVisitBack();
  }, [
    onCloseSettings,
    onVisitBack,
    searchViewOpen,
    settingsOpen,
  ]);

  const onRailForward = useCallback(() => {
    setSearchViewOpen(false);
    setSettingsOpen(false);
    onVisitForward();
  }, [onVisitForward]);

  return {
    projectRailOpen,
    sessionSidebarOpen,
    filesSearchOpen,
    setFilesSearchOpen,
    searchFocusToken,
    searchViewOpen,
    setSearchViewOpen,
    searchViewFocusToken,
    collapsedProjectRailMode,
    setCollapsedProjectRailMode,
    settingsOpen,
    setSettingsOpen,
    updateNotice,
    setUpdateNotice,
    whatsNewVersion,
    setWhatsNewVersion,
    settingsSection,
    settingsAnchor,
    notificationProjectPath,
    notificationSettingsRequest,
    filePickerOpen,
    setFilePickerOpen,
    filePickerInitialQuery,
    filePickerResetToken,
    searchViewOpenRef,
    foregroundSurfaceRef,
    settingsOpenRef,
    filePickerOpenRef,
    whatsNewVersionRef,
    onOpenWhatsNew,
    onToggleSidebar,
    onToggleSessionSidebar,
    onToggleProjectRail,
    onGoToFile,
    onOpenCommandPalette,
    onFindInProject,
    onOpenSearch,
    onLeaveSearch,
    openSettings,
    onOpenNotificationSettings,
    onCloseSettings,
    onSelectSettingsSection,
    onRailBack,
    onRailForward,
  };
}
