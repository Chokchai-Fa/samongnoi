import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Pull this far (px, on the finger) and letting go refreshes. */
const TRIGGER_PX = 72;
/** The page follows the finger at half speed, and never further than this. */
const MAX_PULL_PX = 120;
/** Where the content rests while a refresh runs, so the spinner stays in view. */
const HOLD_PX = 56;
/** The spinner sits this far above the content and slides down with it. */
const SPINNER_OFFSET_PX = 44;
const SETTLE = 'transform 200ms ease-out, opacity 200ms ease-out';

interface PullToRefreshProps {
  /** Runs when the user pulls down from the top of the page and lets go. */
  onRefresh: () => Promise<unknown>;
  /** Only touch screens pull. Everyone else uses the same action from a menu. */
  enabled: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Pull down from the top of the page to refresh. The content follows the finger with resistance.
 * Past the trigger, letting go runs `onRefresh` and keeps a spinner up until it settles. While
 * enabled, the browser's own overscroll (which reloads the page on Android) is switched off.
 */
export function PullToRefresh({ onRefresh, enabled, children, className }: PullToRefreshProps) {
  const content = useRef<HTMLDivElement>(null);
  const spinner = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const latestOnRefresh = useRef(onRefresh);
  useEffect(() => {
    latestOnRefresh.current = onRefresh;
  });

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    const previousOverscroll = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'contain';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let startY: number | null = null;
    let pulled = 0;
    let busy = false;

    // Written straight to the DOM: re-rendering on every touch move is too slow on a phone.
    const place = (distance: number, settle: boolean) => {
      const transition = settle && !reduceMotion ? SETTLE : '';
      if (content.current) {
        content.current.style.transition = transition;
        content.current.style.transform = distance > 0 ? `translateY(${distance}px)` : '';
      }
      if (spinner.current) {
        spinner.current.style.transition = transition;
        spinner.current.style.opacity = String(Math.min(1, distance / TRIGGER_PX));
        spinner.current.style.transform = `translateY(${distance - SPINNER_OFFSET_PX}px)`;
      }
    };
    const reset = () => {
      pulled = 0;
      place(0, false);
    };

    const onStart = (event: TouchEvent) => {
      // Only one finger that starts at the very top of the page can pull.
      const first = event.touches[0];
      const alone = event.touches.length === 1 && first !== undefined;
      startY = !busy && alone && window.scrollY <= 0 ? first.clientY : null;
      pulled = 0;
    };

    const onMove = (event: TouchEvent) => {
      if (startY === null) return;
      if (window.scrollY > 0) {
        // The page has moved on its own: the browser keeps this gesture.
        startY = null;
        if (pulled > 0) reset();
        return;
      }
      const first = event.touches[0];
      if (!first) return;
      const drag = first.clientY - startY;
      if (drag <= 0) {
        if (pulled > 0) reset();
        return;
      }
      pulled = Math.min(MAX_PULL_PX, drag / 2);
      // Stop the page from scrolling under the spinner while the user pulls.
      if (event.cancelable) event.preventDefault();
      place(pulled, false);
    };

    const onEnd = () => {
      const released = pulled;
      startY = null;
      pulled = 0;
      if (released < TRIGGER_PX || busy) {
        place(0, true);
        return;
      }
      busy = true;
      setRefreshing(true);
      place(HOLD_PX, true);
      Promise.resolve()
        .then(() => latestOnRefresh.current())
        // A failed read shows its own message on the page, so the spinner just goes away.
        .catch(() => undefined)
        .finally(() => {
          busy = false;
          setRefreshing(false);
          place(0, true);
        });
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      root.style.overscrollBehaviorY = previousOverscroll;
    };
  }, [enabled]);

  return (
    <div className={cn('relative', className)}>
      <div
        ref={spinner}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{ opacity: 0, transform: `translateY(-${SPINNER_OFFSET_PX}px)` }}
      >
        <span className="bg-card text-muted-foreground flex size-9 items-center justify-center rounded-full border shadow-sm">
          <RefreshCw
            className={cn('size-4', refreshing && 'animate-spin motion-reduce:animate-none')}
          />
        </span>
      </div>
      <span role="status" className="sr-only">
        {refreshing ? 'Refreshing…' : ''}
      </span>
      <div ref={content} className={cn(enabled && 'will-change-transform')}>
        {children}
      </div>
    </div>
  );
}
