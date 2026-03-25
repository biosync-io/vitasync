/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope

// ── Push Notifications ────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return

  const data = event.data.json() as {
    title?: string
    body?: string
    icon?: string
    badge?: string
    tag?: string
    data?: { url?: string; category?: string; severity?: string }
  }

  const options: NotificationOptions = {
    body: data.body ?? "",
    icon: data.icon ?? "/icons/vitasync-192.png",
    badge: data.badge ?? "/icons/vitasync-72.png",
    tag: data.tag,
    data: data.data,
    vibrate: [100, 50, 100],
    actions: [
      { action: "open", title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ],
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? "VitaSync", options),
  )
})

// ── Notification Click ────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  if (event.action === "dismiss") return

  const url =
    (event.notification.data as { url?: string })?.url ?? "/dashboard"

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus()
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url)
    }),
  )
})

// ── Background Sync ──────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "vitasync-offline-mutations") {
    event.waitUntil(replayOfflineMutations())
  }
})

async function replayOfflineMutations(): Promise<void> {
  // Open the IndexedDB queue of offline mutations
  const db = await openMutationDB()
  const tx = db.transaction("mutations", "readonly")
  const store = tx.objectStore("mutations")
  const mutations = await getAllFromStore<OfflineMutation>(store)
  await tx.done

  for (const mutation of mutations) {
    try {
      const response = await fetch(mutation.url, {
        method: mutation.method,
        headers: mutation.headers,
        body: mutation.body,
      })
      if (response.ok) {
        // Remove from queue on success
        const deleteTx = db.transaction("mutations", "readwrite")
        deleteTx.objectStore("mutations").delete(mutation.id)
        await deleteTx.done
      }
    } catch {
      // Will retry on next sync event
      break
    }
  }
}

interface OfflineMutation {
  id: number
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  timestamp: number
}

// Minimal IndexedDB helpers (no idb library needed in SW)
function openMutationDB(): Promise<IDBDatabaseWrapper> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("vitasync-offline", 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains("mutations")) {
        db.createObjectStore("mutations", { keyPath: "id", autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(wrapDB(request.result))
    request.onerror = () => reject(request.error)
  })
}

interface IDBDatabaseWrapper {
  transaction(store: string, mode: IDBTransactionMode): IDBTransactionWrapper
}

interface IDBTransactionWrapper {
  objectStore(name: string): IDBObjectStore
  done: Promise<void>
}

function wrapDB(db: IDBDatabase): IDBDatabaseWrapper {
  return {
    transaction(store: string, mode: IDBTransactionMode) {
      const tx = db.transaction(store, mode)
      return {
        objectStore: (name: string) => tx.objectStore(name),
        done: new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }),
      }
    },
  }
}

function getAllFromStore<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

// ── Periodic Background Sync ─────────────────────────────────────────
self.addEventListener("periodicsync", (event: ExtendableEvent & { tag: string }) => {
  if (event.tag === "vitasync-health-refresh") {
    event.waitUntil(refreshHealthData())
  }
})

async function refreshHealthData(): Promise<void> {
  try {
    // Refresh key dashboard data in the cache
    const cacheName = "api-cache"
    const cache = await caches.open(cacheName)
    const urlsToRefresh = [
      "/api/v1/health-scores",
      "/api/v1/readiness",
      "/api/v1/insights",
    ]

    await Promise.allSettled(
      urlsToRefresh.map(async (url) => {
        try {
          const response = await fetch(url)
          if (response.ok) {
            await cache.put(url, response)
          }
        } catch {
          // Silently fail — this is best-effort background refresh
        }
      }),
    )
  } catch {
    // Periodic sync failure is non-critical
  }
}
