"use client";

import React from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "./utils";

/* ──────────────────────── Types ─────────────────────────────── */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "outline";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
}

/* ──────────────────────── Styles ────────────────────────────── */

const variantStyles: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-gradient-to-b from-brand-500 to-brand-600 text-white",
    "shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.1)]",
    "hover:from-brand-600 hover:to-brand-700 hover:-translate-y-0.5 hover:shadow-md",
    "active:translate-y-0 active:shadow-sm",
  ),
  secondary: cn(
    "bg-transparent border border-gray-200/60 dark:border-white/[0.08]",
    "text-gray-700 dark:text-gray-200",
    "hover:bg-gray-50 dark:hover:bg-white/[0.04] hover:border-gray-300 dark:hover:border-white/[0.12]",
  ),
  ghost: cn(
    "bg-transparent text-gray-600 dark:text-gray-300",
    "hover:bg-gray-100/80 dark:hover:bg-white/[0.06]",
  ),
  danger: cn(
    "bg-gradient-to-b from-accent-500 to-accent-600 text-white",
    "shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.1)]",
    "hover:from-accent-600 hover:to-accent-700 hover:-translate-y-0.5 hover:shadow-md",
    "active:translate-y-0 active:shadow-sm",
  ),
  outline: cn(
    "bg-transparent border border-gray-300 dark:border-white/[0.12]",
    "text-gray-700 dark:text-gray-200",
    "hover:bg-gray-50 dark:hover:bg-white/[0.04]",
  ),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2.5 rounded-xl",
};

const iconSizes: Record<ButtonSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

/* ──────────────────────── Component ─────────────────────────── */

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = "primary",
      size = "md",
      loading = false,
      icon: Icon,
      disabled,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          "relative inline-flex items-center justify-center font-medium",
          "transition-all duration-200 select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950",
          variantStyles[variant],
          sizeStyles[size],
          isDisabled && "opacity-50 pointer-events-none",
          className,
        )}
        {...props}
      >
        {loading ? (
          <>
            <Loader2
              className={cn("animate-spin", iconSizes[size])}
            />
            <span className="sr-only">Loading</span>
          </>
        ) : (
          <>
            {Icon && <Icon className={iconSizes[size]} />}
            {children}
          </>
        )}
      </button>
    );
  },
);
Button.displayName = "Button";
