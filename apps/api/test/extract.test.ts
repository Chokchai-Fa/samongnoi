import { describe, expect, it } from 'vitest';
import { decodeEntities, extractPage, extractPlainText } from '../src/lib/extract';

// Runs in workerd, so HTMLRewriter here is the real one the Worker uses.
const article = `<!doctype html>
<html>
  <head>
    <title>Plain title</title>
    <meta property="og:title" content="Open Graph title">
    <meta property="og:site_name" content="Example News">
    <meta property="og:image" content="/images/cover.png">
    <style>body { color: red; }</style>
    <script>window.tracking = "secret";</script>
  </head>
  <body>
    <nav>Home | Login | Subscribe</nav>
    <article>
      <h1>Main heading</h1>
      <p>First paragraph &amp; a Thai letter &#3585;.</p>
      <ul><li><p>Nested point</p></li><li>Second item</li></ul>
    </article>
    <footer>Copyright footer text</footer>
    <aside>Related links sidebar</aside>
  </body>
</html>`;

describe('extractPage', () => {
  it('prefers Open Graph metadata and resolves relative images against the page', async () => {
    const page = await extractPage(article, 'https://example.com/news/story');

    expect(page.title).toBe('Open Graph title');
    expect(page.siteName).toBe('Example News');
    expect(page.imageUrl).toBe('https://example.com/images/cover.png');
  });

  it('falls back to the <title> element when there is no Open Graph title', async () => {
    const page = await extractPage(
      '<title>Only a title</title><p>Body</p>',
      'https://example.com/',
    );
    expect(page.title).toBe('Only a title');
    expect(page.siteName).toBeNull();
    expect(page.imageUrl).toBeNull();
  });

  it('keeps the article text and drops navigation, footers, sidebars, scripts and styles', async () => {
    const { text } = await extractPage(article, 'https://example.com/');

    expect(text).toContain('Main heading');
    expect(text).toContain('First paragraph');
    expect(text).toContain('Second item');
    expect(text).not.toContain('Home | Login');
    expect(text).not.toContain('Copyright footer');
    expect(text).not.toContain('Related links');
    expect(text).not.toContain('window.tracking');
    expect(text).not.toContain('color: red');
    expect(text).not.toContain('Plain title');
  });

  it('collects a block nested inside another block exactly once', async () => {
    const { text } = await extractPage(article, 'https://example.com/');
    expect(text.split('Nested point')).toHaveLength(2);
  });

  it('separates paragraphs with blank lines and decodes entities', async () => {
    const { text } = await extractPage(article, 'https://example.com/');

    expect(text.split('\n\n')).toEqual([
      'Main heading',
      'First paragraph & a Thai letter ก.',
      'Nested point',
      'Second item',
    ]);
  });

  it('falls back to loose text when a page has no paragraph-like tags', async () => {
    const { text } = await extractPage('<div>Just a div with words</div>', 'https://example.com/');
    expect(text).toBe('Just a div with words');
  });

  it('returns empty text for a page with nothing readable', async () => {
    const { text } = await extractPage(
      '<nav>Menu</nav><script>x()</script>',
      'https://example.com/',
    );
    expect(text).toBe('');
  });
});

describe('extractPlainText', () => {
  it('treats each non-empty line as a paragraph and has no metadata', () => {
    const page = extractPlainText('First line\r\n\r\n  Second line  \n');
    expect(page).toEqual({
      title: null,
      siteName: null,
      imageUrl: null,
      text: 'First line\n\nSecond line',
    });
  });
});

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities and leaves unknown ones alone', () => {
    expect(decodeEntities('&lt;b&gt; &quot;hi&quot; &#65; &#x42; &unknown;')).toBe(
      '<b> "hi" A B &unknown;',
    );
  });
});
