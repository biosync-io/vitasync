"use client";

import React from "react";
import { ArrowUpDown, Inbox, type LucideIcon } from "lucide-react";
import { cn } from "./utils";
import { TableSkeleton } from "./loading";
import { EmptyState } from "./empty-state";

/* ──────────────────────── Types ─────────────────────────────── */

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  onRowClick?: (row: T, index: number) => void;
  onSort?: (key: string) => void;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  className?: string;
  rowKey?: (row: T, index: number) => string | number;
}

/* ──────────────────────── Component ─────────────────────────── */

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = "No data found",
  emptyIcon,
  onRowClick,
  onSort,
  sortKey,
  sortDir,
  className,
  rowKey,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <TableSkeleton rows={5} cols={columns.length} {...(className ? { className } : {})} />
    );
  }

  if (data.length === 0) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-gray-200/50 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03]",
          className,
        )}
      >
        <EmptyState
          icon={emptyIcon || Inbox}
          title={emptyMessage}
          description="Try adjusting your filters or check back later."
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200/50 dark:border-white/[0.06] overflow-hidden",
        "bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/50 dark:bg-white/[0.02]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400",
                    "sticky top-0 bg-gray-50/50 dark:bg-white/[0.02]",
                    col.sortable && "cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200",
                    col.headerClassName,
                  )}
                  onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.header}
                    {col.sortable && (
                      <ArrowUpDown
                        className={cn(
                          "h-3.5 w-3.5",
                          sortKey === col.key
                            ? "text-brand-500"
                            : "text-gray-300 dark:text-gray-600",
                        )}
                      />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-white/[0.02]">
            {data.map((row, rowIdx) => (
              <tr
                key={rowKey ? rowKey(row, rowIdx) : rowIdx}
                className={cn(
                  "transition-colors duration-150",
                  "hover:bg-gray-50/60 dark:hover:bg-white/[0.02]",
                  onRowClick && "cursor-pointer",
                )}
                onClick={onRowClick ? () => onRowClick(row, rowIdx) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-6 py-4 text-gray-700 dark:text-gray-300 whitespace-nowrap",
                      col.className,
                    )}
                  >
                    {col.render
                      ? col.render(row, rowIdx)
                      : (row[col.key] as React.ReactNode) ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
