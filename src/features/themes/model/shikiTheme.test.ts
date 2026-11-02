import {
  createCodePlugin,
  type HighlightOptions,
  type HighlightResult,
} from "@streamdown/code";
import { describe, expect, it } from "vitest";
import { BONOCODE_SHIKI_THEME } from "./shikiTheme";

const THEMES: [typeof BONOCODE_SHIKI_THEME, typeof BONOCODE_SHIKI_THEME] = [
  BONOCODE_SHIKI_THEME,
  BONOCODE_SHIKI_THEME,
];

async function colors(
  code: string,
  language: HighlightOptions["language"] = "typescript",
) {
  const plugin = createCodePlugin({ themes: THEMES });
  const result = await new Promise<HighlightResult>((resolve) => {
    const ready = plugin.highlight({ code, language, themes: THEMES }, resolve);
    if (ready) resolve(ready);
  });
  const tokens = result.tokens.flat();
  return (text: string) => {
    const token = tokens.find((piece) => piece.content.trim() === text);
    // Streamdown reads the light color from `color` and the dark one from
    // --shiki-dark; both slots hold the same theme.
    return [token?.htmlStyle?.color, token?.htmlStyle?.["--shiki-dark"]];
  };
}

const both = (value: string) => [value, value];

describe("BONOCODE_SHIKI_THEME", () => {
  it("colors tokens with the theme's syntax variables", async () => {
    const colorOf = await colors(
      'const greeting = "hi";\n// note\nfunction greet() {}\n',
    );
    expect(colorOf("const")).toEqual(both("var(--syntax-keyword)"));
    expect(colorOf('"hi"')).toEqual(both("var(--syntax-string)"));
    expect(colorOf("// note")).toEqual(both("var(--syntax-comment)"));
    expect(colorOf("greet")).toEqual(both("var(--syntax-callable)"));
  });

  it("colors primitive types as types and `this` as a keyword, like the editor", async () => {
    const colorOf = await colors(
      "class A {\n  n: number = 0;\n  f(): string {\n    return this.g();\n  }\n}\n",
    );
    expect(colorOf("number")).toEqual(both("var(--syntax-type)"));
    expect(colorOf("string")).toEqual(both("var(--syntax-type)"));
    expect(colorOf("this")).toEqual(both("var(--syntax-keyword)"));
  });

  it("colors diff lines with the status colors", async () => {
    const colorOf = await colors("-old line\n+new line\n! changed line\n", "diff");
    expect(colorOf("-old line")).toEqual(both("var(--color-danger)"));
    expect(colorOf("+new line")).toEqual(both("var(--color-success)"));
    expect(colorOf("! changed line")).toEqual(both("var(--color-warning)"));
  });
});
