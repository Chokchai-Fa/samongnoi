import { createDeps } from '../middleware/deps';
import { keepCacheAlive } from '../services/keepalive.service';
import type { Deps } from '../types/deps';

/**
 * Workers `scheduled()` handler for the cron triggers in wrangler.toml. Thin like the queue
 * consumer: build deps, call a service. Errors are rethrown so the run shows as failed in the
 * Cloudflare dashboard. `makeDeps` is injectable for tests.
 */
export function createScheduledHandler(makeDeps: (env: Env) => Deps) {
  return async function handleScheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    try {
      await keepCacheAlive(makeDeps(env));
    } catch (error) {
      console.error('Scheduled keep-alive failed', {
        cron: controller.cron,
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  };
}

export const handleScheduled = createScheduledHandler(createDeps);
