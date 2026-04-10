"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { Toaster } from "sonner"
import { useState } from "react"
import { ThemeProvider } from "../lib/ThemeProvider"
import { AuthProvider, useAuth } from "../lib/auth-context"
import { UserSelectionProvider } from "../lib/user-selection-context"

/** Bridges auth context → user selection context */
function AuthAwareUserSelection({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  return (
    <UserSelectionProvider
      authUserId={user?.id}
      authUserRole={user?.role}
    >
      {children}
    </UserSelectionProvider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 2,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AuthAwareUserSelection>{children}</AuthAwareUserSelection>
        </AuthProvider>
      </ThemeProvider>
      <Toaster
        position="top-right"
        expand={false}
        richColors
        closeButton
        toastOptions={{
          className: "font-sans",
        }}
      />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
