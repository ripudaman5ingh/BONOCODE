import type { ThemeInput } from "@streamdown/code";

const CONTENT = "var(--color-content)";
const LINK = "var(--link-color)";
const KEYWORD = "var(--syntax-keyword)";
const CALLABLE = "var(--syntax-callable)";
const STRING = "var(--syntax-string)";
const TYPE = "var(--syntax-type)";
const NUMBER = "var(--syntax-number)";
const COMMENT = "var(--syntax-comment)";
const PROPERTY = "var(--syntax-property)";
const INVALID = "var(--syntax-invalid)";
const SUCCESS = "var(--color-success)";
const DANGER = "var(--color-danger)";
const WARNING = "var(--color-warning)";

function rule(scope: string[], foreground: string) {
  return { scope, settings: { foreground } };
}

/**
 * Chat code blocks in the active theme's colors. Scopes follow Shiki's
 * createCssVariablesTheme, with its constant and function groups split so
 * variables and types get their own colors, and with support.type and
 * variable.language moved so chat matches the editor. Shiki swaps each var()
 * for a placeholder hex while tokenizing and restores it in the output.
 */
export const BONOCODE_SHIKI_THEME: ThemeInput = {
  name: "bonocode",
  type: "dark",
  fg: CONTENT,
  // The block's background comes from the .agent-markdown code-block CSS.
  bg: "transparent",
  tokenColors: [
    rule(
      [
        "keyword.operator.accessor",
        "meta.group.braces.round.function.arguments",
        "meta.template.expression",
        "markup.fenced_code meta.embedded.block",
      ],
      CONTENT,
    ),
    { scope: "emphasis", settings: { fontStyle: "italic" } },
    {
      scope: ["strong", "markup.heading.markdown", "markup.bold.markdown"],
      settings: { fontStyle: "bold" },
    },
    { scope: ["markup.italic.markdown"], settings: { fontStyle: "italic" } },
    {
      scope: "meta.link.inline.markdown",
      settings: { fontStyle: "underline", foreground: LINK },
    },
    rule(["string", "markup.fenced_code", "markup.inline"], STRING),
    rule(["comment", "string.quoted.docstring.multi"], COMMENT),
    rule(
      [
        "constant.numeric",
        "constant.language",
        "constant.other.placeholder",
        "constant.character.format.placeholder",
        "support",
      ],
      NUMBER,
    ),
    rule(
      [
        "variable.other.object",
        "variable.other.class",
        "variable.other.constant",
        "meta.property-name",
        "meta.property-value",
      ],
      PROPERTY,
    ),
    rule(
      [
        "keyword",
        "variable.language",
        "storage.modifier",
        "storage.type",
        "storage.control.clojure",
        "entity.name.function.clojure",
        "entity.name.tag.yaml",
        "support.function.node",
        "support.type.property-name.json",
        "punctuation.separator.key-value",
        "punctuation.definition.template-expression",
      ],
      KEYWORD,
    ),
    rule(["variable.parameter.function"], PROPERTY),
    rule(
      ["entity.name.type", "entity.other.inherited-class", "support.type"],
      TYPE,
    ),
    rule(
      [
        "support.function",
        "meta.function-call",
        "meta.instance.constructor",
        "entity.other.attribute-name",
        "entity.name.function",
        "constant.keyword.clojure",
      ],
      CALLABLE,
    ),
    rule(
      [
        "entity.name.tag",
        "string.quoted",
        "string.regexp",
        "string.interpolated",
        "string.template",
        "string.unquoted.plain.out.yaml",
        "keyword.other.template",
      ],
      STRING,
    ),
    rule(
      [
        "punctuation.definition.arguments",
        "punctuation.definition.dict",
        "punctuation.separator",
        "meta.function-call.arguments",
      ],
      CONTENT,
    ),
    rule(
      ["markup.underline.link", "punctuation.definition.metadata.markdown"],
      LINK,
    ),
    rule(["beginning.punctuation.definition.list.markdown"], STRING),
    rule(
      [
        "punctuation.definition.string.begin.markdown",
        "punctuation.definition.string.end.markdown",
        "string.other.link.title.markdown",
        "string.other.link.description.markdown",
      ],
      KEYWORD,
    ),
    rule(
      [
        "markup.inserted",
        "meta.diff.header.to-file",
        "punctuation.definition.inserted",
      ],
      SUCCESS,
    ),
    rule(
      [
        "markup.deleted",
        "meta.diff.header.from-file",
        "punctuation.definition.deleted",
      ],
      DANGER,
    ),
    rule(["markup.changed", "punctuation.definition.changed"], WARNING),
    // Not in the css-variables theme, which has no invalid color.
    rule(["invalid"], INVALID),
  ],
};
