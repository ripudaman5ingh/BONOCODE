import { createCodePlugin, type HighlightResult } from "@streamdown/code";
import { describe, expect, it } from "vitest";
import { BONOCODE_SHIKI_THEME } from "./shikiTheme";

const THEMES: [typeof BONOCODE_SHIKI_THEME, typeof BONOCODE_SHIKI_THEME] = [
  BONOCODE_SHIKI_THEME,
  BONOCODE_SHIKI_THEME,
];

function highlight(code: string): Promise<HighlightResult> {
  const plugin = createCodePlugin({ themes: THEMES });
  return new Promise((resolve) => {
    const ready = plugin.highlight(
      { code, language: "typescript", themes: THEMES },
      resolve,
    );
    if (ready) resolve(ready);
  });
}

describe("BONOCODE_SHIKI_THEME", () => {
  it("colors tokens with the theme's syntax variables", async () => {
    const result = await highlight(
      'const greeting = "hi";\n// note\nfunction greet() {}\n',
    );
    const tokens = result.tokens.flat();
    const colorOf = (text: string) => {
      const token = tokens.find((piece) => piece.content.trim() === text);
      // Streamdown reads the light color from `color` and the dark one from
      // --shiki-dark; both slots hold the same theme.
      return [token?.htmlStyle?.color, token?.htmlStyle?.["--shiki-dark"]];
    };
    const both = (value: string) => [value, value];

    expect(colorOf("const")).toEqual(both("var(--syntax-keyword)"));
    expect(colorOf('"hi"')).toEqual(both("var(--syntax-string)"));
    expect(colorOf("// note")).toEqual(both("var(--syntax-comment)"));
    expect(colorOf("greet")).toEqual(both("var(--syntax-callable)"));
  });
});
