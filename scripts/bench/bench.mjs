#!/usr/bin/env node
// Benchmarks a built .app on macOS: time to first window, time until CPU settles,
// idle memory (app + webview + child processes) and bundle size. Writes JSON.
// Usage: node scripts/bench/bench.mjs --app /Applications/nocode.app [--runs 5]
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
let PIDS_HELPER = null;

function usage() {
  console.log(`Usage: node scripts/bench/bench.mjs --app <path.app> [options]
  --runs <n>          timed launches (default 5), after one untimed warm-up
  --label <name>      result name (default <app>-<version>)
  --fixture <dir>     copy this folder into Application Support/<bundle id> first
  --settle-ms <ms>    wait after the app goes idle before sampling memory (default 10000)
  --timeout-ms <ms>   give up on a launch after this long (default 60000)
  --quiet-cpu <pct>   CPU % of one core counted as idle (default 10)
  --out <dir>         results folder (default bench-results)
  --no-isolate        use your real app data instead of a clean, restored copy
  --hold              open the app (isolated data, optional --fixture), wait for Enter, then quit and restore`);
}

function die(message) {
  console.error(`bench: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { runs: 5, settleMs: 10000, timeoutMs: 60000, quietCpu: 10, isolate: true, out: "bench-results" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) die(`Missing value for ${a}`);
      return v;
    };
    if (a === "--app") opts.app = path.resolve(next());
    else if (a === "--runs") opts.runs = Number(next());
    else if (a === "--label") opts.label = next();
    else if (a === "--fixture") opts.fixture = path.resolve(next());
    else if (a === "--settle-ms") opts.settleMs = Number(next());
    else if (a === "--timeout-ms") opts.timeoutMs = Number(next());
    else if (a === "--quiet-cpu") opts.quietCpu = Number(next());
    else if (a === "--out") opts.out = next();
    else if (a === "--no-isolate") opts.isolate = false;
    else if (a === "--hold") opts.hold = true;
    else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else die(`Unknown argument: ${a}`);
  }
  if (!opts.app) {
    usage();
    die("--app is required");
  }
  if (!Number.isInteger(opts.runs) || opts.runs < 1) die("--runs must be a positive integer");
  return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function plist(app, key) {
  return sh("plutil", ["-extract", key, "raw", "-o", "-", path.join(app, "Contents", "Info.plist")]);
}

function parseCpuTime(s) {
  let days = 0;
  if (s.includes("-")) {
    const [d, rest] = s.split("-");
    days = Number(d);
    s = rest;
  }
  let sec = 0;
  for (const part of s.split(":")) sec = sec * 60 + Number(part);
  return days * 86400 + sec;
}

function procs() {
  return sh("ps", ["-axo", "pid=,ppid=,rss=,time=,comm="])
    .split("\n")
    .map((line) => {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      if (!m) return null;
      return { pid: +m[1], ppid: +m[2], rssKb: +m[3], cpuSec: parseCpuTime(m[4]), comm: m[5] };
    })
    .filter(Boolean);
}

const isWebKit = (p) => /com\.apple\.WebKit\./.test(p.comm);

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// The app process plus everything macOS holds it responsible for: its WebKit helpers
// and child processes (scripts/bench/app-pids.swift, the attribution Activity Monitor
// uses). Other apps' WebKit processes are not counted. The second argument is unused.
function appGroup(appPid, _unused) {
  let owned = [];
  try {
    owned = sh(PIDS_HELPER, [String(appPid)]).split("\n").filter(Boolean).map(Number);
  } catch {
    owned = [];
  }
  const ids = new Set(owned);
  const all = procs();
  const main = all.find((p) => p.pid === appPid);
  const others = all.filter((p) => ids.has(p.pid) && p.pid !== appPid);
  return { main, webview: others.filter(isWebKit), children: others.filter((p) => !isWebKit(p)) };
}

function cpuTotal(g) {
  const sum = (list) => list.reduce((s, p) => s + p.cpuSec, 0);
  return (g.main?.cpuSec ?? 0) + sum(g.children) + sum(g.webview);
}

function memory(g) {
  const mb = (list) => list.reduce((s, p) => s + p.rssKb, 0) / 1024;
  const main = g.main ? g.main.rssKb / 1024 : 0;
  const webview = mb(g.webview);
  const children = mb(g.children);
  return { main, webview, children, total: main + webview + children };
}

function stats(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return { median: round(median), min: round(v[0]), max: round(v.at(-1)) };
}

function medianMem(samples) {
  const out = {};
  for (const key of ["main", "webview", "children", "total"]) out[key] = stats(samples.map((s) => s[key])).median;
  return out;
}

function compileHelper(name) {
  const src = path.join(HERE, `${name}.swift`);
  const bin = path.join(os.tmpdir(), `bonocode-bench-${name}`);
  if (!fs.existsSync(bin) || fs.statSync(bin).mtimeMs < fs.statSync(src).mtimeMs) {
    console.log(`Compiling ${name} helper (one time)...`);
    sh("swiftc", ["-O", src, "-o", bin]);
  }
  return bin;
}

function dataDirs(id) {
  const lib = path.join(HOME, "Library");
  return [
    path.join(lib, "Application Support", id),
    path.join(lib, "Caches", id),
    path.join(lib, "WebKit", id),
    path.join(lib, "Saved Application State", `${id}.savedState`),
  ];
}

function backupData(ctx) {
  ctx.backupRoot = path.join(HOME, ".bonocode-bench-backup", String(Date.now()));
  ctx.moved = [];
  for (const [i, dir] of ctx.dirs.entries()) {
    if (!fs.existsSync(dir)) continue;
    const dest = path.join(ctx.backupRoot, String(i));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(dir, dest);
    ctx.moved.push({ dir, dest });
  }
  if (ctx.moved.length) console.log(`Moved your app data to ${ctx.backupRoot} (restored when done).`);
}

function resetData(ctx) {
  for (const dir of ctx.dirs) fs.rmSync(dir, { recursive: true, force: true });
  if (ctx.opts.fixture) fs.cpSync(ctx.opts.fixture, ctx.dirs[0], { recursive: true });
}

function restoreData(ctx) {
  if (!ctx.opts.isolate || ctx.restored) return;
  ctx.restored = true;
  for (const dir of ctx.dirs) fs.rmSync(dir, { recursive: true, force: true });
  for (const { dir, dest } of ctx.moved ?? []) fs.renameSync(dest, dir);
  if (ctx.moved?.length) {
    fs.rmSync(ctx.backupRoot, { recursive: true, force: true });
    console.log("Restored your app data.");
  }
}

const isAppProc = (ctx, p) => p.comm === ctx.exe || path.basename(p.comm) === path.basename(ctx.exe);

// Launches through LaunchServices (like Finder), so macOS makes the app responsible for
// its own WebKit helpers. Spawning the binary directly would make the terminal
// responsible and hide them. Returns the new app pid and the launch start time.
async function launch(ctx) {
  const before = new Set(procs().filter((p) => isAppProc(ctx, p)).map((p) => p.pid));
  const t0 = Date.now();
  sh("open", ["-n", ctx.opts.app]);
  for (let i = 0; i < 400; i++) {
    const found = procs().find((p) => isAppProc(ctx, p) && !before.has(p.pid));
    if (found) return { pid: found.pid, t0 };
    await sleep(25);
  }
  throw new Error("the app process did not start");
}

// Kills app processes left over from earlier launches (an instance that survived
// quit, or one the app relaunched itself), so they never leak into the next run.
async function killStragglers(ctx) {
  const left = procs().filter((p) => isAppProc(ctx, p));
  for (const p of left) {
    try {
      process.kill(p.pid, "SIGKILL");
    } catch {}
  }
  if (left.length) {
    console.log(`\n  killed ${left.length} leftover app process(es)`);
    await sleep(3000);
  }
}

async function quit(ctx, pid, preWebkit) {
  const tree = appGroup(pid, preWebkit).children.map((p) => p.pid);
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
  for (let w = 0; w < 100 && alive(pid); w++) await sleep(100);
  if (alive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  for (const c of tree) {
    if (!alive(c)) continue;
    try {
      process.kill(c, "SIGKILL");
    } catch {}
  }
  for (let w = 0; w < 50; w++) {
    if (appGroup(pid, preWebkit).webview.length === 0) break;
    await sleep(100);
  }
  ctx.pid = null;
  await killStragglers(ctx);
  await sleep(2000);
}

async function waitForSettle(pid, preWebkit, t0, timeoutMs, quietCpuPct) {
  const INTERVAL = 500;
  const QUIET_SAMPLES = 4;
  const QUIET_CPU = quietCpuPct / 100;
  let last = cpuTotal(appGroup(pid, preWebkit));
  let quiet = 0;
  let quietStart = null;
  while (Date.now() - t0 < timeoutMs) {
    await sleep(INTERVAL);
    const now = cpuTotal(appGroup(pid, preWebkit));
    const util = (now - last) / (INTERVAL / 1000);
    last = now;
    if (util < QUIET_CPU) {
      if (quiet === 0) quietStart = Date.now() - INTERVAL;
      quiet++;
      if (quiet >= QUIET_SAMPLES) return quietStart - t0;
    } else quiet = 0;
  }
  return null;
}

async function runOnce(ctx, name) {
  await killStragglers(ctx);
  const preWebkit = new Set(procs().filter(isWebKit).map((p) => p.pid));
  const { pid, t0 } = await launch(ctx);
  ctx.pid = pid;
  const helper = spawn(ctx.helper, [String(pid), String(ctx.opts.timeoutMs / 1000)], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  let helperOut = "";
  helper.stdout.on("data", (d) => (helperOut += d));
  const code = await new Promise((r) => helper.on("exit", r));
  if (code !== 0) {
    await quit(ctx, pid, preWebkit);
    throw new Error(`${name}: no window within ${ctx.opts.timeoutMs} ms`);
  }
  const windowMs = Number(helperOut.trim()) - t0;
  const settleMs = await waitForSettle(pid, preWebkit, t0, ctx.opts.timeoutMs, ctx.opts.quietCpu);
  await sleep(ctx.opts.settleMs);
  const cpuStart = cpuTotal(appGroup(pid, preWebkit));
  const sampleStart = Date.now();
  const samples = [];
  for (let s = 0; s < 5; s++) {
    samples.push(memory(appGroup(pid, preWebkit)));
    await sleep(1000);
  }
  const idleCpuPct =
    ((cpuTotal(appGroup(pid, preWebkit)) - cpuStart) / ((Date.now() - sampleStart) / 1000)) * 100;
  const mem = medianMem(samples);
  if (!mem.webview) console.log(`\n  warning: ${name}: no WebKit processes were attributed to the app`);
  await quit(ctx, pid, preWebkit);
  if (!mem.main) throw new Error(`${name}: the app process exited during the run`);
  return { window_ms: windowMs, settle_ms: settleMs, idle_cpu_pct: round(idleCpuPct), mem_mb: mem };
}

async function runWithRetry(ctx, name) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runOnce(ctx, name);
    } catch (e) {
      if (attempt >= 3) throw e;
      console.log(`\n  ${e.message}; retrying (${attempt}/2)`);
    }
  }
}

// Opens the app with the prepared data and leaves it open for manual testing.
async function hold(ctx, name) {
  await killStragglers(ctx);
  const { pid } = await launch(ctx);
  ctx.pid = pid;
  console.log(`\n${name} is open${ctx.opts.fixture ? " with the fixture" : ""}.`);
  console.log("Press Enter here when you are done. It will quit the app and restore your data.");
  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });
  await quit(ctx, ctx.pid, new Set());
}

function bundleInfo(app, exe) {
  const kb = Number(sh("du", ["-sk", app]).split(/\s+/)[0]);
  return { bundle_mb: round(kb / 1024), binary_mb: round(fs.statSync(exe).size / 1048576) };
}

function machine() {
  const get = (k) => {
    try {
      return sh("sysctl", ["-n", k]);
    } catch {
      return null;
    }
  };
  return {
    macos: sh("sw_vers", ["-productVersion"]),
    cpu: get("machdep.cpu.brand_string"),
    cores: os.cpus().length,
    memory_gb: Math.round(Number(get("hw.memsize")) / 2 ** 30),
  };
}

async function main() {
  if (process.platform !== "darwin") die("macOS only");
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(path.join(opts.app, "Contents", "Info.plist"))) die(`Not an app bundle: ${opts.app}`);
  if (opts.fixture && !opts.isolate) die("--fixture needs isolation; remove --no-isolate");
  if (opts.fixture && !fs.existsSync(opts.fixture)) die(`Fixture not found: ${opts.fixture}`);

  const id = plist(opts.app, "CFBundleIdentifier");
  const exeName = plist(opts.app, "CFBundleExecutable");
  const version = plist(opts.app, "CFBundleShortVersionString");
  const name = plist(opts.app, "CFBundleName");
  const exe = path.join(opts.app, "Contents", "MacOS", exeName);
  if (procs().some((p) => p.comm === exe || path.basename(p.comm) === exeName)) {
    die(`${name} is already running. Quit it (and any tauri dev session) first.`);
  }

  const label = (opts.label ?? `${name}-${version}`).toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  PIDS_HELPER = compileHelper("app-pids");
  try {
    sh(PIDS_HELPER, [String(process.pid)]);
  } catch (e) {
    die(`app-pids helper failed: ${e.message}`);
  }
  const ctx = { opts, id, exe, dirs: dataDirs(id), helper: compileHelper("first-window"), pid: null };
  process.on("SIGINT", () => {
    if (ctx.pid) {
      try {
        process.kill(ctx.pid, "SIGKILL");
      } catch {}
    }
    restoreData(ctx);
    process.exit(130);
  });

  if (opts.isolate) {
    backupData(ctx);
    resetData(ctx);
  }
  if (opts.hold) {
    try {
      await hold(ctx, name);
    } finally {
      restoreData(ctx);
    }
    return;
  }
  const runs = [];
  try {
    process.stdout.write("Warm-up launch (not recorded)... ");
    await runWithRetry(ctx, "warm-up");
    console.log("done");
    for (let i = 1; i <= opts.runs; i++) {
      process.stdout.write(`Run ${i}/${opts.runs}... `);
      const r = await runWithRetry(ctx, `run ${i}`);
      runs.push(r);
      console.log(`window ${r.window_ms} ms, settled ${r.settle_ms ?? "n/a"} ms, idle ${round(r.mem_mb.total)} MB, idle CPU ${r.idle_cpu_pct}%`);
    }
  } finally {
    if (ctx.pid && alive(ctx.pid)) {
      try {
        process.kill(ctx.pid, "SIGKILL");
      } catch {}
    }
    restoreData(ctx);
  }

  const pick = (fn) => stats(runs.map(fn));
  const result = {
    schema: 1,
    label,
    date: new Date().toISOString(),
    app: { path: opts.app, name, identifier: id, version, ...bundleInfo(opts.app, exe) },
    machine: machine(),
    settings: { runs: opts.runs, settle_ms: opts.settleMs, quiet_cpu_pct: opts.quietCpu, fixture: opts.fixture ?? null, isolated: opts.isolate },
    summary: {
      window_ms: pick((r) => r.window_ms),
      settle_ms: pick((r) => r.settle_ms),
      idle_cpu_pct: pick((r) => r.idle_cpu_pct),
      idle_total_mb: pick((r) => r.mem_mb.total),
      idle_main_mb: pick((r) => r.mem_mb.main),
      idle_webview_mb: pick((r) => r.mem_mb.webview),
      idle_children_mb: pick((r) => r.mem_mb.children),
    },
    runs: runs.map((r) => ({
      ...r,
      mem_mb: Object.fromEntries(Object.entries(r.mem_mb).map(([k, v]) => [k, round(v)])),
    })),
  };

  fs.mkdirSync(opts.out, { recursive: true });
  const stamp = result.date.replace(/[:.]/g, "-");
  const file = path.join(opts.out, `${label}-${stamp}.json`);
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);

  const s = result.summary;
  console.log(`\n${name} ${version} — median of ${opts.runs} runs`);
  console.log(`  time to window : ${s.window_ms?.median ?? "n/a"} ms`);
  console.log(`  time to idle   : ${s.settle_ms?.median ?? "n/a"} ms`);
  console.log(`  idle CPU       : ${s.idle_cpu_pct?.median ?? "n/a"} % of one core`);
  console.log(`  idle memory    : ${s.idle_total_mb?.median ?? "n/a"} MB (app ${s.idle_main_mb?.median}, webview ${s.idle_webview_mb?.median}, children ${s.idle_children_mb?.median})`);
  console.log(`  bundle / binary: ${result.app.bundle_mb} MB / ${result.app.binary_mb} MB`);
  console.log(`\nSaved ${file}`);
}

main().catch((e) => {
  console.error(`bench: ${e.message}`);
  process.exitCode = 1;
});
