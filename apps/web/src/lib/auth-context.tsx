"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { setCookieAuthActive } from "./api"

export interface AuthUser {
  id: string
  email: string | null
  displayName: string | null
  role: string
  workspaceId: string
}

export interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isAdmin: boolean
  isLoading: boolean
  login: (
    email: string,
    password: string,
  ) => Promise<{ mfaRequired?: boolean; mfaToken?: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const API = "/api"

async function fetchMe(): Promise<AuthUser> {
  const res = await fetch(`${API}/v1/auth/me`, { credentials: "include" })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

async function fetchRefresh(): Promise<void> {
  const res = await fetch(`${API}/v1/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
  if (!res.ok) throw new Error(`${res.status}`)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadUser = useCallback(async () => {
    try {
      const me = await fetchMe()
      setUser(me)
      setCookieAuthActive(true)
      return true
    } catch {
      // If 401, attempt a silent refresh then retry
      try {
        await fetchRefresh()
        const me = await fetchMe()
        setUser(me)
        setCookieAuthActive(true)
        return true
      } catch {
        setUser(null)
        setCookieAuthActive(false)
        return false
      }
    }
  }, [])

  useEffect(() => {
    loadUser().finally(() => setIsLoading(false))
  }, [loadUser])

  // Auto-refresh every 13 minutes
  useEffect(() => {
    refreshInterval.current = setInterval(
      async () => {
        try {
          await fetchRefresh()
        } catch {
          // silent – next API call will handle expiry
        }
      },
      13 * 60 * 1000,
    )
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current)
    }
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API}/v1/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }))
        throw new Error(body?.message ?? `Login failed: ${res.status}`)
      }

      const data: { mfaRequired?: boolean; mfaToken?: string } =
        await res.json()

      if (!data.mfaRequired) {
        // Successful login – fetch user profile
        await loadUser()
      }

      return data
    },
    [loadUser],
  )

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
      })
    } catch {
      // best-effort
    }
    setUser(null)
    setCookieAuthActive(false)
    window.location.href = "/login"
  }, [])

  const refresh = useCallback(async () => {
    await fetchRefresh()
    await loadUser()
  }, [loadUser])

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin",
    isLoading,
    login,
    logout,
    refresh,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}
