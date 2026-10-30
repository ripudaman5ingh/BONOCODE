import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

// The fork renamed classes in TSX but not here, so terminal and search styles silently stopped matching.
it("uses no pre-fork monocode- class or highlight names", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles/index.css"), "utf8");
  expect(css).not.toMatch(/monocode-/);
});
