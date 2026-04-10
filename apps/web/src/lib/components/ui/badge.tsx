"use client";

import React from "react";
import { cn } from "./utils";

/* ──────────────────────── Badge ─────────────────────────────── */

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple";

export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 border-gray-200/60 dark:border-white/[0.08]",
  success:
    "bg-vitality-50 dark:bg-vitality-500/10 text-vitality-700 dark:text-vitality-400 border-vitality-200/60 dark:border-vitality-500/20",
  warning:
    "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-500/20",
  danger:
    "bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-400 border-accent-200/60 dark:border-accent-500/20",
  info: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200/60 dark:border-blue-500/20",
  purple:
    "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200/60 dark:border-purple-500/20",
};

const dotColorMap: Record<BadgeVariant, string> = {
  default: "bg-gray-400 dark:bg-gray-500",
  success: "bg-vitality-500",
  warning: "bg-amber-500",
  danger: "bg-accent-500",
  info: "bg-blue-500",
  purple: "bg-purple-500",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "text-[11px] px-2 py-0.5",
  md: "text-xs px-2.5 py-1",
};

export function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  pulse = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium leading-none",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                dotColorMap[variant],
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              dotColorMap[variant],
            )}
          />
        </span>
      )}
      {children}
    </span>
  );
}

/* ──────────────────────── StatusDot ──────────────────────────── */

export type StatusDotStatus =
  | "online"
  | "offline"
  | "idle"
  | "busy"
  | "success"
  | "warning"
  | "danger";

export interface StatusDotProps {
  status: StatusDotStatus;
  label?: string;
  pulse?: boolean;
  className?: string;
}

const statusColorMap: Record<StatusDotStatus, string> = {
  online: "bg-vitality-500",
  success: "bg-vitality-500",
  offline: "bg-gray-400 dark:bg-gray-500",
  idle: "bg-amber-500",
  warning: "bg-amber-500",
  busy: "bg-accent-500",
  danger: "bg-accent-500",
};

export function StatusDot({
  status,
  label,
  pulse = false,
  className,
}: StatusDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative flex h-2.5 w-2.5">
        {pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              statusColorMap[status],
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full",
            statusColorMap[status],
          )}
        />
      </span>
      {label && (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {label}
        </span>
      )}
    </span>
  );
}
