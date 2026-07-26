import { create } from 'zustand'

interface UIState {
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  globalLoading: boolean
  notifications: UINotification[]

  // Actions
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setGlobalLoading: (loading: boolean) => void
  addNotification: (notification: Omit<UINotification, 'id'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
}

interface UINotification {
  id: string
  title: string
  message?: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  globalLoading: false,
  notifications: [],

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  setGlobalLoading: (globalLoading) => set({ globalLoading }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { ...notification, id: crypto.randomUUID() },
      ],
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () => set({ notifications: [] }),
}))
