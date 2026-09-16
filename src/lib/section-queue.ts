/**
 * Sequential section loader.
 *
 * The home page used to fire every section's queries at once. On a free
 * Supabase plan that means ~10 parallel requests hitting a cold connection
 * pool, so *every* section is slow instead of the first one being fast.
 *
 * Instead, sections register themselves with the order they appear in the
 * page and are loaded one after the other, top to bottom. A section that the
 * user actually scrolled to jumps the queue (priority), so scrolling fast is
 * never punished.
 */

type Task = {
  order: number;
  priority: boolean;
  cancelled: boolean;
  run: () => Promise<unknown>;
};

const queue: Task[] = [];
let running = false;

/** Small breather between sections so the UI stays responsive while loading. */
const GAP_MS = 120;

function nextTask(): Task | undefined {
  let best: Task | undefined;
  let bestIndex = -1;
  queue.forEach((t, i) => {
    if (t.cancelled) return;
    if (
      !best ||
      (t.priority && !best.priority) ||
      (t.priority === best.priority && t.order < best.order)
    ) {
      best = t;
      bestIndex = i;
    }
  });
  if (bestIndex >= 0) queue.splice(bestIndex, 1);
  return best;
}

async function drain() {
  if (running) return;
  running = true;
  try {
    for (let task = nextTask(); task; task = nextTask()) {
      if (task.cancelled) continue;
      try {
        await task.run();
      } catch {
        /* a failing section must never stall the ones after it */
      }
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
  } finally {
    running = false;
  }
}

/**
 * Queue a section's data loading. Returns a handle to bump it to the front
 * (when it scrolls into view) or cancel it (on unmount).
 */
export function enqueueSection(order: number, run: () => Promise<unknown>) {
  const task: Task = { order, priority: false, cancelled: false, run };
  queue.push(task);
  void drain();
  return {
    promote() {
      task.priority = true;
      void drain();
    },
    cancel() {
      task.cancelled = true;
    },
  };
}

/** Run promise factories strictly one after another (used by route loaders). */
export async function runSequentially(factories: Array<() => Promise<unknown>>) {
  for (const f of factories) {
    try {
      await f();
    } catch {
      /* ignore */
    }
  }
}
