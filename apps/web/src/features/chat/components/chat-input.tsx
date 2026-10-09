import { Loader2, SendHorizontal } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatInputProps {
  disabled: boolean;
  disabledReason: string;
  sending: boolean;
  onSend: (text: string) => Promise<void>;
  onTyping: () => void;
}

/**
 * The question box. Enter sends, Shift+Enter adds a line. The draft stays put if sending fails.
 * Sticky at the bottom so it is always in reach on a phone.
 */
export function ChatInput({ disabled, disabledReason, sending, onSend, onTyping }: ChatInputProps) {
  const [draft, setDraft] = useState('');
  const text = draft.trim();
  const canSend = !disabled && !sending && text.length > 0;

  async function send() {
    if (!canSend) return;
    try {
      await onSend(text);
      setDraft('');
    } catch {
      // Keep the draft so nothing typed is lost; the error is shown by the caller.
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <form
      className="bg-background/95 sticky bottom-0 flex flex-col gap-2 border-t pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:border-0 md:bg-transparent md:p-0"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {disabled && <p className="text-muted-foreground text-xs">{disabledReason}</p>}
      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          rows={1}
          disabled={disabled}
          enterKeyHint="send"
          placeholder={disabled ? 'Chat opens when the summary is ready' : 'Ask about this…'}
          aria-label="Your question"
          className="max-h-40 min-h-11 flex-1 resize-none"
          onChange={(event) => {
            setDraft(event.target.value);
            if (event.target.value) onTyping();
          }}
          onKeyDown={onKeyDown}
        />
        <Button
          type="submit"
          size="icon-lg"
          aria-label="Ask"
          disabled={!canSend}
          className="size-11 shrink-0"
        >
          {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
        </Button>
      </div>
    </form>
  );
}
