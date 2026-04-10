"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./utils";

/* ──────────────────────── Types ─────────────────────────────── */

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: LucideIcon;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

/* ──────────────────────── Component ─────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const ActionIcon = action?.icon;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-5 inline-flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/[0.04] p-4">
          <Icon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
        </div>
      )}

      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
        {title}
      </h3>

      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          {description}
        </p>
      )}

      {action && (
        <div className="mt-6">
          {action.href ? (
            <a
              href={action.href}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
                "bg-gradient-to-b from-brand-500 to-brand-600 text-white",
                "shadow-sm hover:from-brand-600 hover:to-brand-700 hover:-translate-y-0.5 hover:shadow-md",
                "transition-all duration-200",
              )}
            >
              {ActionIcon && <ActionIcon className="h-4 w-4" />}
              {action.label}
            </a>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
                "bg-gradient-to-b from-brand-500 to-brand-600 text-white",
                "shadow-sm hover:from-brand-600 hover:to-brand-700 hover:-translate-y-0.5 hover:shadow-md",
                "transition-all duration-200",
              )}
            >
              {ActionIcon && <ActionIcon className="h-4 w-4" />}
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
