import { RouterProvider } from '@tanstack/react-router'
import { AppProvider } from '@/providers/AppProvider'
import { router } from '@/routes/router'
import { Toaster } from '@/components/ui/toaster'

export function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
      <Toaster />
    </AppProvider>
  )
}
