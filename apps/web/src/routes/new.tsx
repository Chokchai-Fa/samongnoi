import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { NewThreadTabs, type NewThreadTab } from '@/features/threads/components/new-thread-tabs';

export const Route = createFileRoute('/new')({
  // `?tab=text` opens the Text tab (used by "Paste the text instead" on a failed link).
  validateSearch: (search: Record<string, unknown>): { tab?: NewThreadTab } => ({
    tab: search.tab === 'text' ? 'text' : undefined,
  }),
  component: NewThreadPage,
});

function NewThreadPage() {
  const { tab = 'link' } = Route.useSearch();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Save" description="Save a link to read and discuss, or paste some text." />
      <NewThreadTabs tab={tab} />
    </div>
  );
}
