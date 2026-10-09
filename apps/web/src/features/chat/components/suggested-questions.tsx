import { Button } from '@/components/ui/button';

/** Tappable starter questions. On phones they scroll sideways; on desktop they wrap. */
export function SuggestedQuestions({
  questions,
  onPick,
}: {
  questions: string[];
  onPick: (question: string) => void;
}) {
  if (questions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">Try asking</p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {questions.map((question) => (
          <Button
            key={question}
            variant="outline"
            size="sm"
            className="min-h-11 shrink-0 rounded-full px-4 text-left whitespace-normal md:min-h-9"
            onClick={() => onPick(question)}
          >
            {question}
          </Button>
        ))}
      </div>
    </div>
  );
}
