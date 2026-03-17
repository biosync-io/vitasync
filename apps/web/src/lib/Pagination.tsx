"use client"

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <p className="text-gray-500 dark:text-gray-400">
        {start}–{end} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        <PageBtn onClick={() => onChange(1)} disabled={page === 1} label="«" />
        <PageBtn onClick={() => onChange(page - 1)} disabled={page === 1} label="‹" />

        {buildPages(page, totalPages).map((p, i) =>
          p === "…" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: ellipsis separators are positional
            <span key={`ellipsis-${i}`} className="px-2 py-1 text-gray-400 select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={`min-w-[32px] rounded-lg px-2.5 py-1 font-medium transition-colors ${
                p === page
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {p}
            </button>
          ),
        )}

        <PageBtn onClick={() => onChange(page + 1)} disabled={page === totalPages} label="›" />
        <PageBtn onClick={() => onChange(totalPages)} disabled={page === totalPages} label="»" />
      </div>
    </div>
  )
}

function PageBtn({
  onClick,
  disabled,
  label,
}: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-w-[32px] rounded-lg px-2 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {label}
    </button>
  )
}

/** Produce a window of page numbers with ellipsis gaps. */
function buildPages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | "…")[] = [1]
  if (current > 3) pages.push("…")
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push("…")
  pages.push(total)
  return pages
}
