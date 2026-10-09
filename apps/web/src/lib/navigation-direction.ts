import type { ParsedLocation } from '@tanstack/react-router';

/** How deep a path is: "/" is 0, "/new" is 1, "/threads/:id" is 2. */
function depth(pathname: string): number {
  return pathname.split('/').filter(Boolean).length;
}

/**
 * Which way a page change slides, like a phone's navigation stack: moving up the app (a thread
 * back to Home) comes in from the left, moving deeper (Home to a thread) from the right. The
 * history action can't tell these apart, because the thread's back button is an ordinary link.
 */
export function transitionTypes(from: ParsedLocation | undefined, to: ParsedLocation): string[] {
  if (!from) return ['forward'];
  return [depth(to.pathname) < depth(from.pathname) ? 'back' : 'forward'];
}
