import { zodResolver } from '@hookform/resolvers/zod';
import { createTextThreadSchema, type CreateTextThreadInput } from '@repo/shared';
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
import { Textarea } from '@/components/ui/textarea';
import { useCreateThread } from '../api/use-create-thread';
import { FormError, SaveBar } from './save-bar';

const EMPTY_TEXT: CreateTextThreadInput = { type: 'text', title: '', content: '' };

/** Save pasted text. On failure the draft stays put, so nothing the user typed is lost. */
export function TextThreadForm() {
  const navigate = useNavigate();
  const createThread = useCreateThread();
  const form = useForm<CreateTextThreadInput>({
    resolver: zodResolver(createTextThreadSchema),
    defaultValues: EMPTY_TEXT,
    mode: 'onTouched',
  });
  const rootError = form.formState.errors.root?.message;

  async function onSubmit(values: CreateTextThreadInput) {
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
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Give it a name" enterKeyHint="next" {...field} />
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

        <FormError message={rootError} />
        <SaveBar label="Save text" pending={createThread.isPending} />
      </form>
    </Form>
  );
}
