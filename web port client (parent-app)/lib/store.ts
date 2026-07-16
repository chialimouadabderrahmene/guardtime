import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  email: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User | null) => void
  login: (user: User, tokens: { accessToken: string; refreshToken: string }) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      login: (user, tokens) => {
        localStorage.setItem('accessToken', tokens.accessToken)
        localStorage.setItem('refreshToken', tokens.refreshToken)
        set({ user, isAuthenticated: true })
      },
      logout: () => {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        set({ user: null, isAuthenticated: false })
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)

interface DashboardState {
  selectedChild: string | null
  setSelectedChild: (childId: string | null) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedChild: null,
  setSelectedChild: (childId) => set({ selectedChild: childId }),
}))
