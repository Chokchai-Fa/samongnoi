import { zodResolver } from '@hookform/resolvers/zod';
import { createThreadSchema, type CreateThreadInput } from '@repo/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { Info, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateThread } from '../api/use-create-thread';

const EMPTY_THREAD: CreateThreadInput = { type: 'text', title: '', content: '' };

/** Saves pasted text. On failure the draft stays put, so nothing the user typed is lost. */
export function NewThreadForm() {
  const navigate = useNavigate();
  const createThread = useCreateThread();
  const form = useForm<CreateThreadInput>({
    resolver: zodResolver(createThreadSchema),
    defaultValues: EMPTY_THREAD,
  });
  const rootError = form.formState.errors.root?.message;

  async function onSubmit(values: CreateThreadInput) {
    form.clearErrors('root');
    try {
      await createThread.mutateAsync(values);
      await navigate({ to: '/' });
    } catch (error) {
      form.setError('root', {
        message: error instanceof Error ? error.message : "Couldn't save this. Try again.",
      });
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mx-auto flex w-full max-w-xl flex-col gap-6"
        noValidate
      >
        <p className="text-muted-foreground flex gap-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Everything you post here is visible to everyone using this app. Don&apos;t save private
          content.
        </p>

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Give it a name" enterKeyHint="next" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Text</FormLabel>
              <FormControl>
                <Textarea rows={12} placeholder="Paste the text here" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {rootError && (
          <p role="alert" className="text-destructive text-sm">
            {rootError}
          </p>
        )}

        {/* Sticky on phones so the save button stays in reach; inline on wider screens. */}
        <div className="bg-background/95 sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
          <Button asChild variant="ghost">
            <Link to="/">Cancel</Link>
          </Button>
          <Button type="submit" disabled={createThread.isPending}>
            {createThread.isPending && <Loader2 className="animate-spin" />}
            {createThread.isPending ? 'Saving…' : 'Save text'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
