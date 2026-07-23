import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom'; import { I18nProvider } from '@mom-platform/i18n-ui-shared'; import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext'; import { qmsI18n } from './i18n'; import { router } from './routes';
const queryClient = new QueryClient();
export default function App() { return <AuthProvider><I18nProvider i18n={qmsI18n}><QueryClientProvider client={queryClient}><RouterProvider router={router} /><Toaster position="top-right" richColors /></QueryClientProvider></I18nProvider></AuthProvider>; }
