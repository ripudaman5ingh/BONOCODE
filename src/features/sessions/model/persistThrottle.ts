/**
 * Runs `flush` once, `delayMs` after the first `schedule()` since the last
 * flush. Later calls in that window don't push it back, so a stream that
 * changes state every frame can't starve the save.
 */
export function createPersistThrottle(delayMs: number, flush: () => void) {
  let timer: number | null = null;
  return {
    schedule() {
      if (timer != null) return;
      timer = window.setTimeout(() => {
        timer = null;
        flush();
      }, delayMs);
    },
    cancel() {
      if (timer == null) return;
      window.clearTimeout(timer);
      timer = null;
    },
  };
}
