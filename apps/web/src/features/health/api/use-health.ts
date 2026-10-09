import { healthResponseSchema } from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api.health.$get();
      if (!res.ok) throw new Error(`API responded ${res.status}`);
      return healthResponseSchema.parse(await res.json());
    },
  });
}
