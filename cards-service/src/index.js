import { renderAll, writeFiles } from './render.js';
import { Publisher } from './publish.js';
import { ViewCounter } from './counter.js';
import { createServer } from './server.js';
import { log } from './log.js';

// Loaded dynamically so a missing or malformed .env reports one clear line
// instead of a module-load stack trace.
let config;
try {
  ({ config } = await import('./config.js'));
} catch (err) {
  console.error(`configuration error: ${err.message}`);
  console.error('See .env.example for the variables this service expects.');
  process.exit(2);
}

const state = { lastRenderAt: null, lastRenderOk: false, lastPublishCommit: null };

const once = process.argv.includes('--once');
const noPublish = process.argv.includes('--no-publish');
const shouldPublish = config.publish && !noPublish;

const publisher = new Publisher(config);

/**
 * One render cycle. A failure is logged and swallowed: the previously published
 * cards stay exactly as they are, which is the whole point of publishing into
 * the repo rather than serving live.
 */
async function cycle() {
  try {
    const { files, meta } = await renderAll(config);
    await writeFiles(config.outDir, files);
    state.lastRenderAt = new Date().toISOString();
    state.lastRenderOk = true;

    log.info('render complete', {
      stars: meta.stats.stars,
      commits: meta.stats.commits,
      rank: meta.stats.rank.grade,
      currentStreak: meta.streaks.current.length,
      skippedPins: meta.missing,
    });

    if (shouldPublish) {
      const result = await publisher.publish(config.outDir, files);
      if (result.commit) state.lastPublishCommit = result.commit;
    } else {
      log.info('publishing disabled, cards written locally only', { outDir: config.outDir });
    }
    return true;
  } catch (err) {
    state.lastRenderOk = false;
    log.error('render cycle failed, keeping the cards already published', {
      error: err.message,
    });
    return false;
  }
}

const counter = config.counterEnabled ? await new ViewCounter(config.stateDir).load() : null;

if (once) {
  const ok = await cycle();
  await counter?.flush();
  process.exit(ok ? 0 : 1);
}

const server = createServer({ config, counter, state });
server.listen(config.port, () => {
  log.info('listening', { port: config.port, publish: shouldPublish });
});

await cycle();

const intervalMs = Math.max(0.25, config.renderIntervalHours) * 3600 * 1000;
const timer = setInterval(cycle, intervalMs);
log.info('scheduled renders', { everyHours: config.renderIntervalHours });

async function shutdown(signal) {
  log.info('shutting down', { signal });
  clearInterval(timer);
  await counter?.flush().catch(() => {});
  server.close(() => process.exit(0));
  // Do not hang forever on lingering keep-alive sockets.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
