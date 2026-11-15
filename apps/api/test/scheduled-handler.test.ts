import { createExecutionContext, createScheduledController } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { createScheduledHandler } from '../src/jobs/scheduled-handler';
import { KEEPALIVE_KEY } from '../src/services/keepalive.service';
import type { Cache } from '../src/lib/cache';
import { makeFakeDeps } from './support/fake-deps';

function depsWithCache(set: (...args: unknown[]) => Promise<unknown>) {
  const { deps } = makeFakeDeps();
  return { ...deps, cache: { set } as unknown as Cache };
}

describe('scheduled keep-alive', () => {
  it('writes the keep-alive key with an expiry', async () => {
    const set = vi.fn(async () => 'OK');
    const handler = createScheduledHandler(() => depsWithCache(set));

    await handler(createScheduledController({ cron: '17 3 * * *' }), env, createExecutionContext());

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(KEEPALIVE_KEY, expect.any(String), {
      ex: expect.any(Number),
    });
  });

  it('rethrows so a failed run is visible in the dashboard', async () => {
    const handler = createScheduledHandler(() =>
      depsWithCache(async () => {
        throw new Error('upstash unavailable');
      }),
    );
    await expect(
      handler(createScheduledController({ cron: '17 3 * * *' }), env, createExecutionContext()),
    ).rejects.toThrow('upstash unavailable');
  });
});
