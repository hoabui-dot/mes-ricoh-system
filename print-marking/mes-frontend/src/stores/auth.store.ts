import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserDTO } from '@/types'
import { tokenStorage } from '@/services/api-client'

interface AuthState {
  user: UserDTO | null
  isAuthenticated: boolean
  isLoading: boolean

  // Actions
  setUser: (user: UserDTO) => void
  setLoading: (loading: boolean) => void
  logout: () => void
  hasPermission: (permission: string) => boolean
  hasRole: (role: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) => set({ user, isAuthenticated: true }),

      setLoading: (isLoading) => set({ isLoading }),

      logout: () => {
        tokenStorage.clear()
        set({ user: null, isAuthenticated: false })
      },

      hasPermission: (permission: string): boolean => {
        const { user } = get()
        if (!user) return false

        // Super admin has unrestricted access to all actions
        const isSuperAdmin = (user.roles ?? []).some((r) => r.name === 'super_admin') || user.username === 'superadmin'
        if (isSuperAdmin) return true

        const searchPerm = permission.toLowerCase()
        const rolePerms = (user.roles ?? []).flatMap((r) => (r.permissions ?? []).map((p) => p.name.toLowerCase()))
        const directPerms = (user.permissions ?? []).map((p) => p.toLowerCase())

        return rolePerms.includes(searchPerm) || directPerms.includes(searchPerm)
      },

      hasRole: (role: string): boolean => {
        const { user } = get()
        if (!user) return false
        return (user.roles ?? []).some((r) => r.name === role)
      },
    }),
    {
      name: 'mes-auth',
      // Only persist user info, not loading state
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
