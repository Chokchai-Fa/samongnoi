import { zodResolver } from '@hookform/resolvers/zod';
import { createLinkThreadSchema, type CreateLinkThreadInput } from '@repo/shared';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useCreateThread } from '../api/use-create-thread';
import { FormError, SaveBar } from './save-bar';

const EMPTY_LINK: CreateLinkThreadInput = { type: 'url', url: '', note: '' };

/** Save a link. The server reads and summarizes it in the background; Home shows progress. */
export function LinkThreadForm() {
  const navigate = useNavigate();
  const createThread = useCreateThread();
  const form = useForm<CreateLinkThreadInput>({
    resolver: zodResolver(createLinkThreadSchema),
    defaultValues: EMPTY_LINK,
    mode: 'onTouched',
  });
  const rootError = form.formState.errors.root?.message;

  async function onSubmit(values: CreateLinkThreadInput) {
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Link</FormLabel>
              <FormControl>
                <Input
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  placeholder="https://"
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note (optional)</FormLabel>
              <FormControl>
                <Input placeholder="Why you're saving it" enterKeyHint="done" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormError message={rootError} />
        <SaveBar label="Save link" pending={createThread.isPending} />
      </form>
    </Form>
  );
}
