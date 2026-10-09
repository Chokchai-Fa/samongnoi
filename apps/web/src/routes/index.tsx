import { createFileRoute } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useHealth } from '@/features/health/api/use-health';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="md:col-span-2">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Read later, think together
        </h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-base">
          Save a link, get an AI summary, and discuss it with the AI and your friends. Coming soon.
        </p>
      </section>
      <ApiStatusCard />
    </div>
  );
}

function ApiStatusCard() {
  const health = useHealth();
  return (
    <Card>
      <CardHeader>
        <CardTitle>API status</CardTitle>
        <CardDescription>Checks GET /api/health on the same origin.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {health.isPending ? (
          <Skeleton className="h-6 w-32" />
        ) : health.isError ? (
          <Badge variant="destructive">Unreachable</Badge>
        ) : (
          <>
            <Badge className="bg-success text-success-foreground">Healthy</Badge>
            <span className="text-muted-foreground text-sm">env: {health.data.env}</span>
          </>
        )}
      </CardContent>
    </Card>
  );
}
