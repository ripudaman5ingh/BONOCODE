/**
 * Per-session cancel counters. A send captures `watch(id)` when it starts and
 * is cancelled only by a `cancel(id)` after that. Unlike a sticky flag, a
 * cancel with no send in flight can't swallow the next one.
 */
export function createCancelEpochs() {
  const epochs = new Map<string, number>();
  return {
    cancel(id: string) {
      epochs.set(id, (epochs.get(id) ?? 0) + 1);
    },
    watch(id: string): () => boolean {
      const start = epochs.get(id) ?? 0;
      return () => (epochs.get(id) ?? 0) !== start;
    },
    clear() {
      epochs.clear();
    },
  };
}
