import { Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRetryThread } from '../api/use-retry-thread';

/** Shown only to the browser that saved the thread: the API refuses everyone else. */
export function RetryButton({ id }: { id: string }) {
  const retry = useRetryThread();
  return (
    <Button variant="outline" size="sm" disabled={retry.isPending} onClick={() => retry.mutate(id)}>
      {retry.isPending ? <Loader2 className="animate-spin" /> : <RotateCw />}
      {retry.isPending ? 'Retrying…' : 'Retry'}
    </Button>
  );
}
