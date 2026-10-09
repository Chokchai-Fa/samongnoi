import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { NewThreadForm } from '@/features/threads/components/new-thread-form';

export const Route = createFileRoute('/new')({
  component: NewThreadPage,
});

function NewThreadPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Save text"
        description="Paste an article, note, or anything you want to talk about."
      />
      <NewThreadForm />
    </div>
  );
}
