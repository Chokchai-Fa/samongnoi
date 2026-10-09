import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await exports.default.fetch('http://example.com/api/health');
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; env: string }>();
    expect(body.ok).toBe(true);
    expect(body.env).toBe('test');
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const res = await exports.default.fetch('http://example.com/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Route not found' } });
  });
});
