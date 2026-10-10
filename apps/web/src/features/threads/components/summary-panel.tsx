import type { Thread } from '@repo/shared';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface SummaryPanelProps {
  thread: Thread;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The AI summary, key points and questions. Folded away on phones once the chat starts, and then
 * its first line stays under the title so the reader still sees what the thread is about.
 */
export function SummaryPanel({ thread, open, onOpenChange }: SummaryPanelProps) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-base font-semibold">Summary</span>
          {thread.summary && (
            <span className="text-muted-foreground line-clamp-1 text-sm group-data-[state=open]:hidden">
              {thread.summary}
            </span>
          )}
        </span>
        <ChevronDown
          className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="flex flex-col gap-5">
        {thread.summary && <p className="leading-relaxed">{thread.summary}</p>}

        {thread.keyPoints && thread.keyPoints.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Key points</h2>
            <ul className="text-muted-foreground list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {thread.keyPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        )}

        {thread.suggestedQuestions && thread.suggestedQuestions.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Questions to ask</h2>
            <ul className="text-muted-foreground space-y-1.5 text-sm leading-relaxed">
              {thread.suggestedQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </section>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
