import type { Thread } from '@repo/shared';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/** The AI summary, key points and questions. Open by default; the user can fold it away. */
export function SummaryPanel({ thread }: { thread: Thread }) {
  return (
    <Collapsible defaultOpen className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="text-base font-semibold">Summary</span>
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
