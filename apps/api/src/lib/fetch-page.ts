// Limits from docs/PRODUCT.md → "Pipeline rules". The size cap also keeps HTML parsing small
// enough for the Worker's CPU budget.
export const PAGE_LIMITS = {
  timeoutMs: 10_000,
  maxRedirects: 3,
  maxBytes: 1024 * 1024,
} as const;

/** A problem with the page itself. Its message is written for the user, so it can be shown as-is. */
export class PageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageError';
  }
}

export interface FetchedPage {
  /** Final address after redirects. Relative links on the page resolve against it. */
  url: string;
  kind: 'html' | 'text';
  body: string;
}

export type PageFetcher = (url: string) => Promise<FetchedPage>;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Reads one public web page. Every failure throws a `PageError`, which the pipeline records on
 * the thread as a user-facing message (with Retry), so nothing here leaks internals.
 */
export async function fetchPage(
  rawUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<FetchedPage> {
  // One budget for the whole read, redirects and body included.
  const signal = AbortSignal.timeout(PAGE_LIMITS.timeoutMs);
  try {
    let url = parsePublicUrl(rawUrl);
    for (let hop = 0; ; hop += 1) {
      const res = await fetcher(url, {
        redirect: 'manual',
        signal,
        headers: { accept: 'text/html, text/plain;q=0.9' },
      });

      if (REDIRECT_STATUSES.has(res.status)) {
        await res.body?.cancel();
        if (hop >= PAGE_LIMITS.maxRedirects) throw new PageError('Too many redirects');
        const location = res.headers.get('location');
        if (!location) throw new PageError("Couldn't read this page");
        // Every hop is checked again, so a redirect cannot reach a private address either.
        url = parsePublicUrl(new URL(location, url).toString());
        continue;
      }

      if (!res.ok) {
        await res.body?.cancel();
        throw new PageError(`The site returned an error (${res.status}). Check the link.`);
      }

      const type = classify(res.headers.get('content-type'));
      if (!type) {
        await res.body?.cancel();
        throw new PageError('Unsupported content type — only web pages and plain text can be read');
      }

      const declared = Number(res.headers.get('content-length'));
      if (declared > PAGE_LIMITS.maxBytes) {
        await res.body?.cancel();
        throw new PageError('Page too large');
      }

      const body = await readCapped(res, PAGE_LIMITS.maxBytes, type.charset);
      return { url: url.toString(), kind: type.kind, body };
    }
  } catch (error) {
    if (error instanceof PageError) throw error;
    if (signal.aborted) throw new PageError('The page took too long to load');
    throw new PageError("Couldn't read this page");
  }
}

/** Parses an address and rejects anything that is not a public http(s) address. */
export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PageError("That doesn't look like a web link");
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PageError('Only http and https links can be read');
  }
  if (isPrivateHost(url.hostname)) {
    throw new PageError("This link points to a private address, so it can't be read");
  }
  return url;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) return true;
  // IPv6 literals are rare on the open web and easy to misuse; refuse them outright.
  if (host.startsWith('[')) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  return (
    a === 0 || // "this" network
    a === 10 || // private
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a >= 224 // multicast and reserved
  );
}

function classify(
  contentType: string | null,
): { kind: 'html' | 'text'; charset: string } | undefined {
  if (!contentType) return undefined;
  const [mime = '', ...params] = contentType.split(';').map((part) => part.trim().toLowerCase());
  const charsetParam = params.find((param) => param.startsWith('charset='));
  const charset = charsetParam
    ? charsetParam.slice('charset='.length).replace(/["']/g, '')
    : 'utf-8';
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return { kind: 'html', charset };
  if (mime === 'text/plain') return { kind: 'text', charset };
  return undefined;
}

/** Reads the body, stopping as soon as it passes the byte cap. */
async function readCapped(res: Response, maxBytes: number, charset: string): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PageError('Page too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decode(bytes, charset);
}

function decode(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // Unknown or unsupported charset label: UTF-8 is the safe default.
    return new TextDecoder().decode(bytes);
  }
}
