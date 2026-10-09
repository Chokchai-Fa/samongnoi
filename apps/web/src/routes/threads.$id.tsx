import { createFileRoute } from '@tanstack/react-router';
import { ThreadView } from '@/features/threads/components/thread-view';

export const Route = createFileRoute('/threads/$id')({
  component: ThreadPage,
});

function ThreadPage() {
  const { id } = Route.useParams();
  return <ThreadView id={id} />;
}
