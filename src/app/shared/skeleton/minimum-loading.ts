import { signal } from '@angular/core';

/** Presentation clock, independent of requests and write operations. */
export class MinimumLoading {
  readonly visible = signal(false);
  private pending = new Set<() => void>();
  private generation = 0;

  begin(initial: boolean): () => void {
    // A refresh must not shorten an initial skeleton that is still visible.
    if (!initial && this.visible()) return () => {};
    this.cancel();
    const generation = this.generation;
    const started = performance.now();
    this.visible.set(initial);
    return () => {
      if (!initial || generation !== this.generation) return;
      const remaining = Math.max(0, 750 - (performance.now() - started));
      if (!remaining) {
        this.visible.set(false);
        return;
      }
      const finish = () => {
        clearTimeout(timer);
        this.pending.delete(finish);
        if (generation === this.generation) this.visible.set(false);
      };
      const timer = setTimeout(finish, remaining);
      this.pending.add(finish);
    };
  }

  cancel(): void {
    this.generation++;
    for (const finish of this.pending) finish();
    this.visible.set(false);
  }
}
