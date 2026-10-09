import { useTheme } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';

/** The app's toast host. Follows the in-app theme switch, not only the OS setting. */
export function AppToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="bottom-center" closeButton />;
}
