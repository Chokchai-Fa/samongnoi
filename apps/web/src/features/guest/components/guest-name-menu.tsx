import { zodResolver } from '@hookform/resolvers/zod';
import { guestNameSchema } from '@repo/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { renameGuest } from '@/lib/guest-identity';
import { useGuest } from '../hooks/use-guest';
import { GuestAvatar } from './guest-avatar';

const renameSchema = z.object({ name: guestNameSchema });
type RenameValues = z.infer<typeof renameSchema>;

/** Top-bar menu: shows the display name used on this browser and lets the user change it. */
export function GuestNameMenu() {
  const guest = useGuest();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 gap-2 px-2"
          aria-label={`Your name is ${guest.clientName}. Change it`}
        >
          <GuestAvatar name={guest.clientName} />
          <span className="hidden max-w-32 truncate text-sm font-medium md:inline">
            {guest.clientName}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <RenameForm currentName={guest.clientName} onSaved={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function RenameForm({ currentName, onSaved }: { currentName: string; onSaved: () => void }) {
  const form = useForm<RenameValues>({
    resolver: zodResolver(renameSchema),
    defaultValues: { name: currentName },
  });

  function onSubmit(values: RenameValues) {
    renameGuest(values.name);
    onSaved();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your name</FormLabel>
              <FormControl>
                <Input autoComplete="nickname" enterKeyHint="done" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="text-muted-foreground text-xs">
          Shown on threads and messages you post from this browser.
        </p>
        <Button type="submit">Save name</Button>
      </form>
    </Form>
  );
}
