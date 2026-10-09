import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

import { log } from './log.js';

const DAYS_KEPT = 60;

/**
 * The profile view counter. This is the one asset that cannot be a committed
 * file, since a file cannot count its own views, so it is served live and its
 * tally is persisted to disk.
 *
 * GitHub proxies README images through Camo and caches them, so this undercounts
 * real views the same way every GitHub view counter does. It is a rough gauge,
 * not analytics.
 */
export class ViewCounter {
  constructor(stateDir) {
    this.file = path.join(stateDir, 'views.json');
    this.state = { count: 0, firstSeen: null, lastSeen: null, perDay: {} };
    this.dirty = false;
    this.flushTimer = null;
  }

  async load() {
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (typeof parsed.count === 'number') this.state = { perDay: {}, ...parsed };
      log.info('loaded view counter', { count: this.state.count });
    } catch (err) {
      if (err.code !== 'ENOENT') log.warn('could not read view state', { error: err.message });
      log.info('starting view counter from zero');
    }
    return this;
  }

  increment() {
    const today = new Date().toISOString().slice(0, 10);
    this.state.count += 1;
    this.state.firstSeen ??= today;
    this.state.lastSeen = today;
    this.state.perDay[today] = (this.state.perDay[today] ?? 0) + 1;

    // Keep the per-day history bounded.
    const cutoff = Object.keys(this.state.perDay).sort().slice(0, -DAYS_KEPT);
    for (const day of cutoff) delete this.state.perDay[day];

    this.scheduleFlush();
    return this.state.count;
  }

  /** Batches writes: a burst of views costs one disk write, not one each. */
  scheduleFlush() {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch((err) => log.error('view state flush failed', { error: err.message }));
    }, 5000);
    this.flushTimer.unref?.();
  }

  async flush() {
    if (!this.dirty) return;
    this.dirty = false;
    await mkdir(path.dirname(this.file), { recursive: true });
    // Write-then-rename so a crash cannot leave a truncated file behind.
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.state), 'utf8');
    await rename(tmp, this.file);
  }

  get count() {
    return this.state.count;
  }

  get today() {
    return this.state.perDay[new Date().toISOString().slice(0, 10)] ?? 0;
  }
}
