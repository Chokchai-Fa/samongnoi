import { THREAD_CONTENT_MAX, THREAD_TITLE_MAX } from '@repo/shared';

export interface ExtractedPage {
  title: string | null;
  siteName: string | null;
  imageUrl: string | null;
  /** Readable text: one paragraph per block, separated by blank lines, capped for storage. */
  text: string;
}

// Page furniture that is not the article. `title` is skipped as text too: its own handler reads it.
const SKIPPED =
  'title, script, style, noscript, template, svg, iframe, nav, footer, aside, form, button';
const BLOCKS = 'p, h1, h2, h3, h4, li, blockquote, pre, figcaption, td, dd, dt';

/**
 * Streams the HTML through HTMLRewriter (no full DOM in memory) and collects the title, the
 * Open Graph fields, and the text of content blocks. A block nested in another block is not
 * collected twice: the outermost block owns its text.
 */
export async function extractPage(html: string, baseUrl: string): Promise<ExtractedPage> {
  const meta = new Map<string, string>();
  let title = '';
  let skipDepth = 0;
  let blockDepth = 0;
  let block = '';
  let loose = '';
  const paragraphs: string[] = [];

  const flush = () => {
    const text = collapse(decodeEntities(block));
    if (text) paragraphs.push(text);
    block = '';
  };

  const rewriter = new HTMLRewriter()
    .on('title', {
      text: (chunk) => {
        title += chunk.text;
      },
    })
    .on('meta', {
      element: (el) => {
        const key = (el.getAttribute('property') ?? el.getAttribute('name') ?? '').toLowerCase();
        const value = el.getAttribute('content');
        if (key && value && !meta.has(key)) meta.set(key, decodeEntities(value));
      },
    })
    .on(SKIPPED, {
      element: (el) => {
        skipDepth += 1;
        el.onEndTag(() => {
          skipDepth -= 1;
        });
      },
    })
    .on(BLOCKS, {
      element: (el) => {
        blockDepth += 1;
        el.onEndTag(() => {
          blockDepth -= 1;
          if (blockDepth === 0) flush();
        });
      },
    })
    .on('*', {
      text: (chunk) => {
        if (skipDepth > 0) return;
        if (blockDepth > 0) block += chunk.text;
        else loose += chunk.text;
      },
    });

  await rewriter.transform(new Response(html)).text();

  // Pages built from <div>s and no paragraph tags still get their text.
  if (paragraphs.length === 0 && loose.trim()) {
    paragraphs.push(collapse(decodeEntities(loose)));
  }

  return {
    title: clean(meta.get('og:title') ?? decodeEntities(title), THREAD_TITLE_MAX),
    siteName: clean(meta.get('og:site_name') ?? null, THREAD_TITLE_MAX),
    imageUrl: resolveHttpUrl(meta.get('og:image') ?? meta.get('twitter:image') ?? null, baseUrl),
    text: cap(paragraphs.join('\n\n'), THREAD_CONTENT_MAX),
  };
}

/** Plain text: each non-empty line is a paragraph. There is no title or metadata to read. */
export function extractPlainText(body: string): ExtractedPage {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    title: null,
    siteName: null,
    imageUrl: null,
    text: cap(lines.join('\n\n'), THREAD_CONTENT_MAX),
  };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodes the entities that show up in page text: named ones and numeric ones (e.g. Thai). */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1]?.toLowerCase() === 'x';
      const code = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function cap(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function clean(value: string | null, max: number): string | null {
  if (value === null) return null;
  const text = cap(collapse(value), max);
  return text || null;
}

function resolveHttpUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
