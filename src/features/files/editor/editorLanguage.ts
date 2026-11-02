import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  type StreamParser,
} from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tagHighlighter, tags, type Highlighter } from "@lezer/highlight";
import { basename } from "../../../platform/tauri/fs";

const HIGHLIGHT_TAGS = {
  keyword: [
    tags.keyword,
    tags.controlKeyword,
    tags.definitionKeyword,
    tags.moduleKeyword,
    tags.operatorKeyword,
    tags.modifier,
    tags.self,
    tags.bool,
    tags.null,
    tags.atom,
    tags.unit,
  ],
  callable: [
    tags.function(tags.variableName),
    tags.function(tags.propertyName),
    tags.labelName,
    tags.macroName,
  ],
  string: [
    tags.string,
    tags.docString,
    tags.character,
    tags.attributeValue,
    tags.special(tags.string),
    tags.regexp,
    tags.escape,
  ],
  type: [
    tags.typeName,
    tags.className,
    tags.namespace,
    tags.tagName,
    tags.standard(tags.typeName),
  ],
  number: [tags.number, tags.integer, tags.float],
  comment: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
  property: [tags.propertyName, tags.attributeName],
  meta: [tags.meta, tags.processingInstruction, tags.annotation],
  heading: [
    tags.heading,
    tags.heading1,
    tags.heading2,
    tags.heading3,
    tags.heading4,
    tags.heading5,
    tags.heading6,
  ],
};

// Theme variables, so the editor and diffs follow the active theme without
// rebuilding their styles.
const HIGHLIGHT_PALETTE = {
  keyword: "var(--syntax-keyword)",
  heading: "var(--color-markdown-heading)",
  callable: "var(--syntax-callable)",
  string: "var(--syntax-string)",
  type: "var(--syntax-type)",
  number: "var(--syntax-number)",
  comment: "var(--syntax-comment)",
  property: "var(--syntax-property)",
  meta: "var(--syntax-meta)",
  invalid: "var(--syntax-invalid)",
};

const HIGHLIGHT_STYLE = HighlightStyle.define([
  { tag: HIGHLIGHT_TAGS.keyword, color: HIGHLIGHT_PALETTE.keyword },
  { tag: HIGHLIGHT_TAGS.heading, color: HIGHLIGHT_PALETTE.heading },
  { tag: HIGHLIGHT_TAGS.callable, color: HIGHLIGHT_PALETTE.callable },
  { tag: HIGHLIGHT_TAGS.string, color: HIGHLIGHT_PALETTE.string },
  { tag: HIGHLIGHT_TAGS.type, color: HIGHLIGHT_PALETTE.type },
  { tag: HIGHLIGHT_TAGS.number, color: HIGHLIGHT_PALETTE.number },
  { tag: HIGHLIGHT_TAGS.comment, color: HIGHLIGHT_PALETTE.comment },
  { tag: HIGHLIGHT_TAGS.property, color: HIGHLIGHT_PALETTE.property },
  { tag: HIGHLIGHT_TAGS.meta, color: HIGHLIGHT_PALETTE.meta },
  {
    tag: tags.invalid,
    color: HIGHLIGHT_PALETTE.invalid,
    textDecoration: "underline",
  },
]);

/** Same tag → color map as the editor, for highlighting outside CodeMirror. */
const SYNTAX_TAG_HIGHLIGHTER = tagHighlighter([
  { tag: HIGHLIGHT_TAGS.keyword, class: HIGHLIGHT_PALETTE.keyword },
  { tag: HIGHLIGHT_TAGS.heading, class: HIGHLIGHT_PALETTE.heading },
  { tag: HIGHLIGHT_TAGS.callable, class: HIGHLIGHT_PALETTE.callable },
  { tag: HIGHLIGHT_TAGS.string, class: HIGHLIGHT_PALETTE.string },
  { tag: HIGHLIGHT_TAGS.type, class: HIGHLIGHT_PALETTE.type },
  { tag: HIGHLIGHT_TAGS.number, class: HIGHLIGHT_PALETTE.number },
  { tag: HIGHLIGHT_TAGS.comment, class: HIGHLIGHT_PALETTE.comment },
  { tag: HIGHLIGHT_TAGS.property, class: HIGHLIGHT_PALETTE.property },
  { tag: HIGHLIGHT_TAGS.meta, class: HIGHLIGHT_PALETTE.meta },
  { tag: tags.invalid, class: HIGHLIGHT_PALETTE.invalid },
]);

export function editorHighlightStyleFor(): HighlightStyle {
  return HIGHLIGHT_STYLE;
}

export function syntaxTagHighlighter(): Highlighter {
  return SYNTAX_TAG_HIGHLIGHTER;
}

function legacyLanguage(parser: StreamParser<unknown>): Extension {
  return StreamLanguage.define(parser);
}

export async function languageForPath(path: string): Promise<Extension | null> {
  const name = basename(path).toLowerCase();
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";

  if ([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"].includes(extension)) {
    const { javascript } = await import("@codemirror/lang-javascript");
    return javascript({
      jsx: extension === ".jsx" || extension === ".tsx",
      typescript: extension === ".ts" || extension === ".tsx",
    });
  }
  if (extension === ".json" || name === "package-lock.json") {
    const { json } = await import("@codemirror/lang-json");
    return json();
  }
  if (extension === ".jsonc") {
    // Lezer's JSON grammar rejects comments; the legacy JS-based mode tokenizes them.
    const { json } = await import("@codemirror/legacy-modes/mode/javascript");
    return legacyLanguage(json);
  }
  if (extension === ".css") {
    const { css } = await import("@codemirror/lang-css");
    return css();
  }
  if ([".html", ".htm"].includes(extension)) {
    const { html } = await import("@codemirror/lang-html");
    return html();
  }
  if ([".md", ".mdx", ".markdown"].includes(extension)) {
    const { markdown } = await import("@codemirror/lang-markdown");
    return markdown();
  }
  if (extension === ".rs") {
    const { rustLanguage } = await import("@codemirror/lang-rust");
    const { completeFromList } = await import("@codemirror/autocomplete");
    const keywords =
      "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while"
        .split(" ")
        .map((label) => ({ label, type: "keyword" }));
    return new LanguageSupport(rustLanguage, [
      rustLanguage.data.of({ autocomplete: completeFromList(keywords) }),
    ]);
  }
  if (extension === ".py") {
    const { python } = await import("@codemirror/lang-python");
    return python();
  }
  if (extension === ".c") {
    const { c } = await import("@codemirror/legacy-modes/mode/clike");
    return legacyLanguage(c);
  }
  if (
    [".h", ".cc", ".cpp", ".cxx", ".hh", ".hpp", ".hxx"].includes(extension)
  ) {
    const { cpp } = await import("@codemirror/lang-cpp");
    return cpp();
  }
  if (extension === ".java") {
    const { java } = await import("@codemirror/lang-java");
    return java();
  }
  if ([".php", ".phtml"].includes(extension)) {
    const { php } = await import("@codemirror/lang-php");
    return php();
  }
  if (extension === ".sql") {
    const { sql } = await import("@codemirror/lang-sql");
    return sql();
  }
  if ([".xml", ".svg"].includes(extension)) {
    const { xml } = await import("@codemirror/lang-xml");
    return xml();
  }
  if ([".yaml", ".yml"].includes(extension)) {
    const { yaml } = await import("@codemirror/lang-yaml");
    return yaml();
  }
  if (extension === ".cs") {
    const { csharp } = await import("@codemirror/legacy-modes/mode/clike");
    return legacyLanguage(csharp);
  }
  if (extension === ".go") {
    const { go } = await import("@codemirror/legacy-modes/mode/go");
    return legacyLanguage(go);
  }
  if (extension === ".dart") {
    const { dart } = await import("@codemirror/legacy-modes/mode/clike");
    return legacyLanguage(dart);
  }
  if (extension === ".swift") {
    const { swift } = await import("@codemirror/legacy-modes/mode/swift");
    return legacyLanguage(swift);
  }
  if ([".kt", ".kts"].includes(extension)) {
    const { kotlin } = await import("@codemirror/legacy-modes/mode/clike");
    return legacyLanguage(kotlin);
  }
  if (
    [".rb", ".rake"].includes(extension) ||
    ["gemfile", "rakefile"].includes(name)
  ) {
    const { ruby } = await import("@codemirror/legacy-modes/mode/ruby");
    return legacyLanguage(ruby);
  }
  if (
    [".sh", ".bash", ".zsh"].includes(extension) ||
    [".bashrc", ".bash_profile", ".zshrc", ".zprofile"].includes(name)
  ) {
    const { shell } = await import("@codemirror/legacy-modes/mode/shell");
    return legacyLanguage(shell);
  }
  if (extension === ".toml") {
    const { toml } = await import("@codemirror/legacy-modes/mode/toml");
    return legacyLanguage(toml);
  }
  if ([".scala", ".sc"].includes(extension)) {
    const { scala } = await import("@codemirror/legacy-modes/mode/clike");
    return legacyLanguage(scala);
  }
  if (extension === ".lua") {
    const { lua } = await import("@codemirror/legacy-modes/mode/lua");
    return legacyLanguage(lua);
  }
  if (extension === ".r") {
    const { r } = await import("@codemirror/legacy-modes/mode/r");
    return legacyLanguage(r);
  }
  if ([".pl", ".pm"].includes(extension)) {
    const { perl } = await import("@codemirror/legacy-modes/mode/perl");
    return legacyLanguage(perl);
  }
  if ([".ps1", ".psd1", ".psm1"].includes(extension)) {
    const { powerShell } =
      await import("@codemirror/legacy-modes/mode/powershell");
    return legacyLanguage(powerShell);
  }
  if ([".m", ".mm"].includes(extension)) {
    const { objectiveC, objectiveCpp } =
      await import("@codemirror/legacy-modes/mode/clike");
    return legacyLanguage(extension === ".mm" ? objectiveCpp : objectiveC);
  }
  if (extension === ".proto") {
    const { protobuf } = await import("@codemirror/legacy-modes/mode/protobuf");
    return legacyLanguage(protobuf);
  }
  if (name === "dockerfile" || name.startsWith("dockerfile.")) {
    const { dockerFile } =
      await import("@codemirror/legacy-modes/mode/dockerfile");
    return legacyLanguage(dockerFile);
  }
  return null;
}
