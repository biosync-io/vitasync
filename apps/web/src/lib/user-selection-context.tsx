"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

const STORAGE_KEY = "vitasync-selected-user"

interface UserSelectionContextValue {
  selectedUserId: string
  setSelectedUserId: (id: string) => void
  /** True when the logged-in user is an admin (can switch users) */
  isAdmin: boolean
  /** The authenticated user's own ID (from auth context) */
  currentUserId: string
}

const UserSelectionContext = createContext<UserSelectionContextValue | null>(null)

/**
 * Provides user selection state for the dashboard.
 *
 * Privacy boundary: non-admin users are locked to their own ID.
 * Admin users can switch between users via the dropdown.
 */
export function UserSelectionProvider({
  children,
  authUserId,
  authUserRole,
}: {
  children: React.ReactNode
  authUserId?: string | undefined
  authUserRole?: string | undefined
}) {
  const isAdmin = authUserRole === "admin"
  const [selectedUserId, setSelectedUserIdRaw] = useState("")

  // Hydrate from localStorage on mount, respecting privacy boundary
  useEffect(() => {
    if (authUserId && !isAdmin) {
      // Non-admin: always lock to own user ID
      setSelectedUserIdRaw(authUserId)
      localStorage.setItem(STORAGE_KEY, authUserId)
    } else if (authUserId && isAdmin) {
      // Admin: restore saved selection, default to own ID
      const stored = localStorage.getItem(STORAGE_KEY)
      setSelectedUserIdRaw(stored || authUserId)
    } else {
      // No auth (API key mode fallback)
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setSelectedUserIdRaw(stored)
    }
  }, [authUserId, isAdmin])

  const setSelectedUserId = useCallback(
    (id: string) => {
      // Non-admin users cannot change selection
      if (authUserId && !isAdmin) return

      setSelectedUserIdRaw(id)
      if (id) {
        localStorage.setItem(STORAGE_KEY, id)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    },
    [authUserId, isAdmin],
  )

  // Deterministic override: non-admin users always see their own data.
  // Admins get no selectedUserId — they manage the platform, not view health data.
  const effectiveSelectedUserId =
    isAdmin ? "" : (authUserId ?? selectedUserId)

  return (
    <UserSelectionContext.Provider
      value={{
        selectedUserId: effectiveSelectedUserId,
        setSelectedUserId,
        isAdmin,
        currentUserId: authUserId ?? "",
      }}
    >
      {children}
    </UserSelectionContext.Provider>
  )
}

export function useSelectedUser() {
  const ctx = useContext(UserSelectionContext)
  if (!ctx) throw new Error("useSelectedUser must be used within UserSelectionProvider")
  return ctx
}
