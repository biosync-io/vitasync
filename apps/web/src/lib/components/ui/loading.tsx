"use client";

import React from "react";
import { cn } from "./utils";

/* ──────────────────────── Shimmer Block ─────────────────────── */

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-gray-200/60 dark:bg-white/[0.06] skeleton-shimmer",
        className,
      )}
    />
  );
}

/* ──────────────────────── PageLoading ───────────────────────── */

export interface PageLoadingProps {
  className?: string;
}

export function PageLoading({ className }: PageLoadingProps) {
  return (
    <div className={cn("space-y-6 animate-fade-in", className)}>
      {/* Header skeleton */}
      <div className="space-y-3">
        <Shimmer className="h-8 w-48" />
        <Shimmer className="h-4 w-72" />
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-200/50 dark:border-white/[0.06] p-6 space-y-3"
          >
            <Shimmer className="h-4 w-20" />
            <Shimmer className="h-8 w-24" />
            <Shimmer className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Content area */}
      <div className="rounded-2xl border border-gray-200/50 dark:border-white/[0.06] p-6 space-y-4">
        <Shimmer className="h-5 w-36" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── CardSkeleton ──────────────────────── */

export interface CardSkeletonProps {
  count?: number;
  className?: string;
}

export function CardSkeleton({ count = 3, className }: CardSkeletonProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-200/50 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] p-6 space-y-4"
        >
          <div className="flex items-center gap-3">
            <Shimmer className="h-10 w-10 rounded-xl" />
            <div className="space-y-2 flex-1">
              <Shimmer className="h-4 w-2/3" />
              <Shimmer className="h-3 w-1/2" />
            </div>
          </div>
          <div className="space-y-2">
            <Shimmer className="h-3 w-full" />
            <Shimmer className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────── TableSkeleton ─────────────────────── */

export interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 5,
  cols = 4,
  className,
}: TableSkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200/50 dark:border-white/[0.06] overflow-hidden",
        className,
      )}
    >
      {/* Header */}
      <div className="flex gap-4 px-6 py-3 bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/[0.04]">
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer
            key={i}
            className="h-4 flex-1"
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex gap-4 px-6 py-4 border-b border-gray-50 dark:border-white/[0.02] last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Shimmer
              key={colIdx}
              className="h-4 flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────── StatSkeleton ──────────────────────── */

export interface StatSkeletonProps {
  count?: number;
  className?: string;
}

export function StatSkeleton({ count = 4, className }: StatSkeletonProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-200/50 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] p-6 space-y-3"
        >
          <Shimmer className="h-4 w-24" />
          <Shimmer className="h-9 w-20" />
          <Shimmer className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
