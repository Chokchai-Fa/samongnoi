import { useMemo } from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { MermaidDiagram } from './mermaid-diagram';

const PLUGINS = [remarkGfm, remarkBreaks];

type HastChild = NonNullable<ExtraProps['node']>['children'][number];

function textOf(node: HastChild): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return node.children.map(textOf).join('');
  return '';
}

/** The source of a ```mermaid block, or undefined for any other code block. */
function mermaidSourceOf(node: ExtraProps['node']): string | undefined {
  const code = node?.children[0];
  if (code?.type !== 'element' || code.tagName !== 'code') return undefined;
  const classes = code.properties.className;
  return Array.isArray(classes) && classes.includes('language-mermaid') ? textOf(code) : undefined;
}

/**
 * How each Markdown element looks in a chat bubble. Raw HTML is never rendered (react-markdown
 * shows it as text), and images are dropped so answers cannot load pictures from other sites.
 */
function componentsFor(streaming: boolean): Components {
  return {
    // A link with no address (react-markdown drops unsafe ones such as javascript:) is plain text.
    a: ({ href, children }) =>
      href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-primary font-medium break-words underline underline-offset-4"
        >
          {children}
        </a>
      ) : (
        <span>{children}</span>
      ),
    pre: ({ node, children }) => {
      const source = mermaidSourceOf(node);
      if (source !== undefined) return <MermaidDiagram source={source} ready={!streaming} />;
      return (
        <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-sm leading-relaxed [&_code]:bg-transparent [&_code]:p-0">
          {children}
        </pre>
      );
    },
    code: ({ className, children }) => (
      <code className={cn('bg-muted rounded px-1 py-0.5 font-mono text-sm', className)}>
        {children}
      </code>
    ),
    table: ({ children }) => <Table>{children}</Table>,
    thead: ({ children }) => <TableHeader>{children}</TableHeader>,
    tbody: ({ children }) => <TableBody>{children}</TableBody>,
    tr: ({ children }) => <TableRow>{children}</TableRow>,
    th: ({ children }) => <TableHead>{children}</TableHead>,
    td: ({ children }) => <TableCell>{children}</TableCell>,
    h1: ({ children }) => <h1 className="text-lg font-semibold">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-semibold">{children}</h2>,
    h3: ({ children }) => <h3 className="text-base font-semibold">{children}</h3>,
    h4: ({ children }) => <h4 className="text-sm font-semibold">{children}</h4>,
    h5: ({ children }) => <h5 className="text-sm font-semibold">{children}</h5>,
    h6: ({ children }) => <h6 className="text-sm font-semibold">{children}</h6>,
    ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
    blockquote: ({ children }) => (
      <blockquote className="border-border text-muted-foreground border-l-2 pl-3">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="border-border" />,
    input: ({ type, checked }) =>
      type === 'checkbox' ? (
        <input
          type="checkbox"
          checked={checked}
          disabled
          readOnly
          className="accent-primary mr-2 align-middle"
        />
      ) : null,
    img: () => null,
  };
}

interface MarkdownMessageProps {
  content: string;
  /** While the answer streams: a caret follows the text, and diagrams wait for the end. */
  streaming?: boolean;
}

/**
 * A question or answer as formatted text: Markdown with GitHub tables, lists, code and Mermaid
 * diagrams. Line breaks are kept as typed, as in a chat.
 */
export function MarkdownMessage({ content, streaming = false }: MarkdownMessageProps) {
  const components = useMemo(() => componentsFor(streaming), [streaming]);
  return (
    <div className={cn('space-y-3', streaming && '[&>p:last-of-type]:inline')}>
      <Markdown remarkPlugins={PLUGINS} components={components}>
        {content}
      </Markdown>
      {streaming && (
        <span
          aria-hidden="true"
          className="bg-foreground ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle motion-reduce:animate-none"
        />
      )}
    </div>
  );
}
