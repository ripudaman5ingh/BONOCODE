import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

// Palette classes ignore the active theme; status tokens (text-danger, …) follow it.
const PALETTE_CLASS =
  /\b(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g;
const SOURCE = /\.(?:tsx?|css)$/;
const TEST = /\.test\.tsx?$/;

it("uses no Tailwind palette color classes outside tests", () => {
  const src = resolve(process.cwd(), "src");
  const found: string[] = [];
  for (const entry of readdirSync(src, { recursive: true, encoding: "utf8" })) {
    if (!SOURCE.test(entry) || TEST.test(entry)) continue;
    const lines = readFileSync(join(src, entry), "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const match of line.matchAll(PALETTE_CLASS)) {
        found.push(`src/${entry}:${index + 1} ${match[0]}`);
      }
    });
  }
  expect(found).toEqual([]);
});
