import '@fontsource-variable/inter';
import './styles/globals.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppToaster } from './components/app-toaster';
import { ThemeProvider } from './components/theme-provider';
import { transitionTypes } from './lib/navigation-direction';
import { queryClient } from './lib/query-client';
import { routeTree } from './routeTree.gen';

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  // Page changes slide like a phone's navigation stack (see lib/navigation-direction.ts).
  defaultViewTransition: {
    types: ({ fromLocation, toLocation }) => transitionTypes(fromLocation, toLocation),
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <AppToaster />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
