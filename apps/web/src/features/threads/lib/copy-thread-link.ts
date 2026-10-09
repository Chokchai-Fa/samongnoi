import { toast } from 'sonner';

/** Copies the address of a thread. Some browsers block clipboard access on plain http. */
export async function copyThreadLink(id: string) {
  const url = new URL(`/threads/${id}`, window.location.origin).toString();
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  } catch {
    toast.error("Couldn't copy the link in this browser.");
  }
}
