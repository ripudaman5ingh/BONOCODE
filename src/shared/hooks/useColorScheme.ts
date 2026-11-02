import { useEffect, useState } from "react";
import {
  SCHEME_CHANGE_EVENT,
  type ColorScheme,
} from "../../features/settings/model/appearance";
import { getActiveTheme } from "../../features/themes/model/themeEngine";

/** Subscribes to color scheme changes triggered by applyColorScheme(). */
export function useColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(
    () => getActiveTheme().scheme,
  );
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ColorScheme>).detail;
      setScheme(detail === "light" ? "light" : "dark");
    };
    window.addEventListener(SCHEME_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(SCHEME_CHANGE_EVENT, onChange);
  }, []);
  return scheme;
}
