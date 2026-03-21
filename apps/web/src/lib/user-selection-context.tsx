"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

const STORAGE_KEY = "vitasync-selected-user"

interface UserSelectionContextValue {
  selectedUserId: string
  setSelectedUserId: (id: string) => void
}

const UserSelectionContext = createContext<UserSelectionContextValue | null>(null)

export function UserSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedUserId, setSelectedUserIdRaw] = useState("")

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) setSelectedUserIdRaw(stored)
  }, [])

  const setSelectedUserId = useCallback((id: string) => {
    setSelectedUserIdRaw(id)
    if (id) {
      localStorage.setItem(STORAGE_KEY, id)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  return (
    <UserSelectionContext.Provider value={{ selectedUserId, setSelectedUserId }}>
      {children}
    </UserSelectionContext.Provider>
  )
}

export function useSelectedUser() {
  const ctx = useContext(UserSelectionContext)
  if (!ctx) throw new Error("useSelectedUser must be used within UserSelectionProvider")
  return ctx
}
