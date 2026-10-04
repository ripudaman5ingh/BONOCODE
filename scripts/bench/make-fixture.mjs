#!/usr/bin/env node
// Builds the benchmark fixture: a large chat (default 500 messages) plus two small
// chats, restored as three tabs. The output folder is passed to bench.mjs --fixture.
// It uses the app's own TypeScript and Rust code, so the data matches what the app saves.
// Usage: node scripts/bench/make-fixture.mjs [--out bench-fixtures/three-chats] [--messages 500]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const out = path.resolve(opt("--out", "bench-fixtures/three-chats"));
const messages = opt("--messages", "500");
const project = path.join(os.homedir(), "bonocode-bench-project");
const spec = path.join(os.tmpdir(), "bonocode-bench-fixture.json");

function run(cmd, cmdArgs, { env = {}, cwd } = {}) {
  console.log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  execFileSync(cmd, cmdArgs, { stdio: "inherit", cwd, env: { ...process.env, ...env } });
}

if (!fs.existsSync(path.join(project, ".git"))) {
  console.log(`Creating benchmark project at ${project}`);
  fs.mkdirSync(path.join(project, "src"), { recursive: true });
  for (let i = 0; i < 40; i++) {
    fs.writeFileSync(path.join(project, "src", `module${i}.ts`), `export const value${i} = ${i};\n`);
  }
  fs.writeFileSync(path.join(project, "README.md"), "# Bonocode benchmark project\n");
  run("git", ["init", "-q"], { cwd: project });
  run("git", ["add", "."], { cwd: project });
  run("git", ["-c", "user.name=bench", "-c", "user.email=bench@example.com", "commit", "-q", "-m", "init"], {
    cwd: project,
  });
}

fs.rmSync(spec, { force: true });
run("npx", ["vitest", "run", "src/features/sessions/data/benchFixture.test.ts"], {
  env: { BENCH_FIXTURE_SPEC: spec, BENCH_FIXTURE_PROJECT: project, BENCH_FIXTURE_MESSAGES: messages },
});
if (!fs.existsSync(spec)) {
  console.error("make-fixture: the TypeScript step did not write the spec");
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
run("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml", "--lib", "write_bench_fixture", "--", "--ignored"], {
  env: { BENCH_FIXTURE_SPEC: spec, BENCH_FIXTURE_OUT: out },
});
const db = path.join(out, "bonocode.db");
if (!fs.existsSync(db)) {
  console.error("make-fixture: the Rust step did not write bonocode.db");
  process.exit(1);
}
// MonoCode v0.6.0 reads monocode.db; same schema, so the same file works for the baseline.
fs.copyFileSync(db, path.join(out, "monocode.db"));
fs.rmSync(spec, { force: true });

console.log(`\nFixture ready: ${out}`);
console.log(`Project folder: ${project}`);
console.log(`Use it with: npm run bench -- --app /Applications/Bonocode.app --fixture ${path.relative(process.cwd(), out)}`);
