/**
 * Offline mutation queue — stores failed POST/PUT/DELETE requests in IndexedDB
 * and registers a Background Sync event for replay when connectivity returns.
 */

const DB_NAME = "vitasync-offline"
const STORE_NAME = "mutations"
const DB_VERSION = 1

interface OfflineMutation {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  timestamp: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Queue a failed mutation for background sync replay. */
export async function queueOfflineMutation(mutation: Omit<OfflineMutation, "timestamp">): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readwrite")
  const store = tx.objectStore(STORE_NAME)

  store.add({ ...mutation, timestamp: Date.now() })

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  // Request background sync
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    const registration = await navigator.serviceWorker.ready
    await (registration as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } })
      .sync.register("vitasync-offline-mutations")
  }
}

/** Get the count of pending offline mutations. */
export async function getOfflineMutationCount(): Promise<number> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readonly")
  const store = tx.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const request = store.count()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Clear all queued mutations (e.g., after successful sync). */
export async function clearOfflineMutations(): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readwrite")
  tx.objectStore(STORE_NAME).clear()
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
