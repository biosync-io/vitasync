"use client"

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-xl shadow-indigo-500/25">
          <svg viewBox="0 0 36 36" fill="none" className="h-12 w-12">
            <polyline
              points="4,18 8,18 10,14 13,23 17,7 21,23 23,14 26,18 32,18"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          You&apos;re offline
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          VitaSync needs an internet connection to load this page. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/25"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
