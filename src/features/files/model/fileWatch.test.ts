import { afterEach, describe, expect, it, vi } from "vitest";

const statFiles = vi.hoisted(() => vi.fn());

vi.mock("../../../platform/tauri/fs", () => ({ statFiles }));

import {
  announceFileSaved,
  invalidateWatchedFiles,
  nudgeWatchedFiles,
  watchFile,
  watchFileSaves,
} from "./fileWatch";

describe("file watch", () => {
  const stops: Array<() => void> = [];

  afterEach(() => {
    while (stops.length > 0) stops.pop()?.();
    statFiles.mockReset();
  });

  it("reconciles the file after establishing its initial mtime baseline", async () => {
    statFiles.mockResolvedValue([{ path: "/repo/README.md", mtimeMs: 2 }]);
    const changed = vi.fn();

    stops.push(watchFile("/repo/README.md", changed));

    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());
  });

  it("does not notify again while the sampled mtime is unchanged", async () => {
    statFiles.mockResolvedValue([{ path: "/repo/README.md", mtimeMs: 2 }]);
    const changed = vi.fn();
    stops.push(watchFile("/repo/README.md", changed));
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());

    nudgeWatchedFiles(["/repo/README.md"]);

    await vi.waitFor(() => expect(statFiles).toHaveBeenCalledTimes(2));
    expect(changed).toHaveBeenCalledOnce();
  });

  it("notifies when a later sample observes a different mtime", async () => {
    statFiles
      .mockResolvedValueOnce([{ path: "/repo/README.md", mtimeMs: 2 }])
      .mockResolvedValueOnce([{ path: "/repo/README.md", mtimeMs: 3 }]);
    const changed = vi.fn();
    stops.push(watchFile("/repo/README.md", changed));
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());

    nudgeWatchedFiles(["/repo/README.md"]);

    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
  });

  it("does not duplicate an invalidation while resetting its baseline", async () => {
    statFiles.mockResolvedValue([{ path: "/repo/README.md", mtimeMs: 2 }]);
    const changed = vi.fn();
    stops.push(watchFile("/repo/README.md", changed));
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());

    invalidateWatchedFiles(["/repo/README.md"]);

    await vi.waitFor(() => expect(statFiles).toHaveBeenCalledTimes(2));
    expect(changed).toHaveBeenCalledTimes(2);
  });
});

describe("file saves", () => {
  it("tells every other editor of the path, but not the saver", () => {
    const saver = vi.fn();
    const peer = vi.fn();
    const elsewhere = vi.fn();
    const stops = [
      watchFileSaves("/repo/a.ts", saver),
      watchFileSaves("/repo/a.ts", peer),
      watchFileSaves("/repo/b.ts", elsewhere),
    ];
    announceFileSaved("/repo/a.ts", saver);
    expect(saver).not.toHaveBeenCalled();
    expect(peer).toHaveBeenCalledOnce();
    expect(elsewhere).not.toHaveBeenCalled();

    stops[1]!();
    announceFileSaved("/repo/a.ts", saver);
    expect(peer).toHaveBeenCalledOnce();
    for (const stop of stops) stop();
  });
});
