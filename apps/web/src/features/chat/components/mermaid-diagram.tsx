import { useEffect, useState, useSyncExternalStore } from 'react';

// Mermaid is large, so it is loaded the first time a diagram is drawn, not with the page.
// Diagrams are drawn one at a time: Mermaid keeps shared state while it renders.
let queue: Promise<unknown> = Promise.resolve();
let nextId = 0;

function draw(source: string, dark: boolean): Promise<string> {
  const job = async () => {
    const mermaid = (await import('mermaid')).default;
    // Strict security: no clickable nodes and no HTML labels, so the SVG is only Mermaid's drawing.
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    });
    nextId += 1;
    const id = `diagram-${nextId}`;
    try {
      const { svg } = await mermaid.render(id, source);
      return svg;
    } catch (error) {
      // A broken diagram leaves Mermaid's error box in the page. Remove it.
      document.getElementById(`d${id}`)?.remove();
      throw error;
    }
  };
  const next = queue.then(job);
  queue = next.catch(() => undefined);
  return next;
}

const isDark = () => document.documentElement.classList.contains('dark');

/** Re-renders when the page switches between light and dark (the `.dark` class on <html>). */
function useIsDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    },
    isDark,
    () => false,
  );
}

function drawKey(source: string, dark: boolean): string {
  return `${dark ? 'dark' : 'light'}\n${source}`;
}

interface Drawing {
  key: string;
  svg?: string;
  failed?: boolean;
}

interface MermaidDiagramProps {
  source: string;
  /** False while the answer streams: a half-written diagram would only fail to draw. */
  ready: boolean;
}

/** A ```mermaid block drawn as a diagram. The source stays one tap away underneath. */
export function MermaidDiagram({ source, ready }: MermaidDiagramProps) {
  const dark = useIsDark();
  const [drawing, setDrawing] = useState<Drawing>();

  useEffect(() => {
    if (!ready) return;
    const key = drawKey(source, dark);
    let cancelled = false;
    draw(source, dark).then(
      (svg) => {
        if (!cancelled) setDrawing({ key, svg });
      },
      () => {
        if (!cancelled) setDrawing({ key, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source, dark, ready]);

  // A drawing made for another source or theme is not shown: it is drawn again first.
  const current = drawing?.key === drawKey(source, dark) ? drawing : undefined;

  return (
    <figure className="flex flex-col gap-2">
      {!ready ? (
        <p className="text-muted-foreground text-sm">
          The diagram appears when the answer is complete.
        </p>
      ) : current?.svg ? (
        <div
          role="img"
          aria-label="Diagram"
          className="overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: current.svg }}
        />
      ) : current?.failed ? (
        <p role="alert" className="text-destructive text-sm">
          Couldn&apos;t draw this diagram. The source is below.
        </p>
      ) : (
        <p aria-busy="true" className="text-muted-foreground flex h-24 items-center text-sm">
          Drawing diagram…
        </p>
      )}
      <details className="text-muted-foreground text-xs">
        <summary className="cursor-pointer">Diagram source</summary>
        <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-2 font-mono">{source}</pre>
      </details>
    </figure>
  );
}
