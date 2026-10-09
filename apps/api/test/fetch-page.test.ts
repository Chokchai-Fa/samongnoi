import { describe, expect, it } from 'vitest';
import { fetchPage, PAGE_LIMITS, PageError, parsePublicUrl } from '../src/lib/fetch-page';

/** Serves the given responses in order, one per request. */
function scripted(...responses: Response[]): typeof fetch {
  let index = 0;
  return (async () => {
    const response = responses[index];
    index += 1;
    if (!response) throw new Error('unexpected extra request');
    return response;
  }) as unknown as typeof fetch;
}

const html = (body = '<p>Hello</p>') =>
  new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PageError) return error.message;
    throw error;
  }
  throw new Error('expected a PageError');
}

describe('parsePublicUrl', () => {
  it('accepts public http and https addresses', () => {
    expect(parsePublicUrl('https://example.com/a?b=1').hostname).toBe('example.com');
    expect(parsePublicUrl('http://news.example.org').protocol).toBe('http:');
  });

  it.each([
    ['ftp://example.com/file', 'Only http and https links can be read'],
    ['javascript:alert(1)', 'Only http and https links can be read'],
    ['not a url', "That doesn't look like a web link"],
    ['http://localhost:8787/api', 'private address'],
    ['http://service.internal/admin', 'private address'],
    ['http://127.0.0.1/', 'private address'],
    ['http://10.1.2.3/', 'private address'],
    ['http://192.168.0.10/', 'private address'],
    ['http://172.20.0.1/', 'private address'],
    ['http://169.254.169.254/latest/meta-data', 'private address'],
    ['http://[::1]/', 'private address'],
    ['http://0x7f.0.0.1/', 'private address'],
  ])('rejects %s', (raw, message) => {
    expect(() => parsePublicUrl(raw)).toThrow(PageError);
    expect(() => parsePublicUrl(raw)).toThrow(new RegExp(message));
  });
});

describe('fetchPage', () => {
  it('reads an HTML page and reports its kind', async () => {
    const page = await fetchPage('https://example.com/a', scripted(html('<p>Body</p>')));
    expect(page).toEqual({ url: 'https://example.com/a', kind: 'html', body: '<p>Body</p>' });
  });

  it('reads plain text as text', async () => {
    const res = new Response('line one', { headers: { 'content-type': 'text/plain' } });
    const page = await fetchPage('https://example.com/a.txt', scripted(res));
    expect(page.kind).toBe('text');
    expect(page.body).toBe('line one');
  });

  it('follows redirects and checks each hop, using the final address', async () => {
    const redirect = new Response(null, {
      status: 301,
      headers: { location: '/final' },
    });
    const page = await fetchPage('https://example.com/start', scripted(redirect, html()));
    expect(page.url).toBe('https://example.com/final');
  });

  it('refuses a redirect into a private address', async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' },
    });
    expect(await failureOf(fetchPage('https://example.com/', scripted(redirect)))).toMatch(
      /private address/,
    );
  });

  it('gives up after the redirect limit', async () => {
    const hop = () => new Response(null, { status: 302, headers: { location: '/next' } });
    const responses = Array.from({ length: PAGE_LIMITS.maxRedirects + 1 }, hop);
    expect(await failureOf(fetchPage('https://example.com/', scripted(...responses)))).toBe(
      'Too many redirects',
    );
  });

  it('rejects content types that are not pages or text', async () => {
    const pdf = new Response('%PDF', { headers: { 'content-type': 'application/pdf' } });
    expect(await failureOf(fetchPage('https://example.com/doc.pdf', scripted(pdf)))).toMatch(
      /Unsupported content type/,
    );
  });

  it('explains HTTP errors without exposing internals', async () => {
    const missing = new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } });
    expect(await failureOf(fetchPage('https://example.com/gone', scripted(missing)))).toBe(
      'The site returned an error (404). Check the link.',
    );
  });

  it('rejects a page that declares a size over the cap, without reading it', async () => {
    const big = new Response('x', {
      headers: {
        'content-type': 'text/html',
        'content-length': String(PAGE_LIMITS.maxBytes + 1),
      },
    });
    expect(await failureOf(fetchPage('https://example.com/', scripted(big)))).toBe(
      'Page too large',
    );
  });

  it('stops reading a streamed body once it passes the cap', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(PAGE_LIMITS.maxBytes));
        controller.enqueue(new Uint8Array(10));
        controller.close();
      },
    });
    const streamed = new Response(stream, { headers: { 'content-type': 'text/html' } });
    expect(await failureOf(fetchPage('https://example.com/', scripted(streamed)))).toBe(
      'Page too large',
    );
  });

  it('turns network failures into a user-facing message', async () => {
    const broken = (() =>
      Promise.reject(new TypeError('socket hang up'))) as unknown as typeof fetch;
    expect(await failureOf(fetchPage('https://example.com/', broken))).toBe(
      "Couldn't read this page",
    );
  });
});
