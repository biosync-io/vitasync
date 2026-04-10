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

export interface AdminUser {
  id: string
  email: string | null
  displayName: string | null
  role: string
  workspaceId: string
}

export interface AdminAuthContextValue {
  user: AdminUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (
    email: string,
    password: string,
  ) => Promise<{ mfaRequired?: boolean; mfaToken?: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

const API = "/api"

async function fetchMe(): Promise<AdminUser> {
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

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadUser = useCallback(async () => {
    try {
      const me = await fetchMe()
      if (me.role !== "admin") {
        setUser(null)
        setCookieAuthActive(false)
        window.location.href = "/admin/login?error=not_admin"
        return false
      }
      setUser(me)
      setCookieAuthActive(true)
      return true
    } catch {
      // If 401, attempt a silent refresh then retry
      try {
        await fetchRefresh()
        const me = await fetchMe()
        if (me.role !== "admin") {
          setUser(null)
          setCookieAuthActive(false)
          window.location.href = "/admin/login?error=not_admin"
          return false
        }
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
    window.location.href = "/admin/login"
  }, [])

  const refresh = useCallback(async () => {
    await fetchRefresh()
    await loadUser()
  }, [loadUser])

  const value: AdminAuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    refresh,
  }

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx)
    throw new Error("useAdminAuth must be used within an AdminAuthProvider")
  return ctx
}
