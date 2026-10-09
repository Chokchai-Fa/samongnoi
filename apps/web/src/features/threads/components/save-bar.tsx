import { Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The form's submit row. Sticky at the bottom on phones so the save button stays in reach. */
export function SaveBar({ label, pending }: { label: string; pending: boolean }) {
  return (
    <div className="bg-background/95 sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
      <Button asChild variant="ghost">
        <Link to="/">Cancel</Link>
      </Button>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? 'Saving…' : label}
      </Button>
    </div>
  );
}

/** A failure from the whole form, shown next to the submit row. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  );
}
