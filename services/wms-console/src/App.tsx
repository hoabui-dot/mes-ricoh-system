import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { I18nProvider } from '@mom-platform/i18n-ui-shared';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { WarehouseFilterProvider } from './context/WarehouseFilterContext';
import { wmsConsoleI18n } from './i18n';
import { router } from './routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => error?.status !== 503 && failureCount < 2,
      staleTime: 10000,
    },
  },
});

export default function App() {
  return (
    <AuthProvider>
      <I18nProvider i18n={wmsConsoleI18n}>
        <QueryClientProvider client={queryClient}>
          <WarehouseFilterProvider>
            <RouterProvider router={router} />
            <Toaster position="top-right" richColors />
          </WarehouseFilterProvider>
        </QueryClientProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
