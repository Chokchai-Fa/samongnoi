import { useNavigate } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LinkThreadForm } from './link-thread-form';
import { TextThreadForm } from './text-thread-form';

export type NewThreadTab = 'link' | 'text';

/**
 * Save a link or pasted text. Both forms stay mounted while switching tabs, so a draft in the
 * other tab survives (design rule: never lose user input).
 */
export function NewThreadTabs({ tab }: { tab: NewThreadTab }) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <p className="text-muted-foreground flex gap-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Everything you post here is visible to everyone using this app. Summaries are written by
        Google Gemini, whose free tier may use what you send to improve Google&apos;s products.
        Don&apos;t save private content.
      </p>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({
            to: '/new',
            search: { tab: value === 'text' ? 'text' : 'link' },
            replace: true,
          })
        }
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="link" className="min-h-11 md:min-h-0">
            Link
          </TabsTrigger>
          <TabsTrigger value="text" className="min-h-11 md:min-h-0">
            Text
          </TabsTrigger>
        </TabsList>
        <TabsContent value="link" forceMount className="pt-6 data-[state=inactive]:hidden">
          <LinkThreadForm />
        </TabsContent>
        <TabsContent value="text" forceMount className="pt-6 data-[state=inactive]:hidden">
          <TextThreadForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
