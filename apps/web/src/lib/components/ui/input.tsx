"use client";

import React from "react";
import { cn } from "./utils";
import type { LucideIcon } from "lucide-react";

/* ──────────────────────── Input ─────────────────────────────── */

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: LucideIcon;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, icon: Icon, error, hint, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400 dark:text-gray-500">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "block w-full rounded-xl border bg-white dark:bg-white/[0.03]",
              "px-4 py-2.5 text-sm text-gray-900 dark:text-gray-50",
              "placeholder:text-gray-400 dark:placeholder:text-gray-500",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              error
                ? "border-accent-300 dark:border-accent-500/40 focus:ring-accent-500/30"
                : "border-gray-200/60 dark:border-white/[0.08] focus:ring-brand-500/30 focus:border-brand-400 dark:focus:border-brand-500/50",
              Icon && "pl-10",
              className,
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs font-medium text-accent-500">{error}</p>
        )}
        {!error && hint && (
          <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

/* ──────────────────────── Select ────────────────────────────── */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  icon?: LucideIcon;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    { label, icon: Icon, options, error, placeholder, className, id, ...props },
    ref,
  ) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400 dark:text-gray-500">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <select
            ref={ref}
            id={selectId}
            className={cn(
              "block w-full appearance-none rounded-xl border bg-white dark:bg-white/[0.03]",
              "px-4 py-2.5 pr-10 text-sm text-gray-900 dark:text-gray-50",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              error
                ? "border-accent-300 dark:border-accent-500/40 focus:ring-accent-500/30"
                : "border-gray-200/60 dark:border-white/[0.08] focus:ring-brand-500/30 focus:border-brand-400 dark:focus:border-brand-500/50",
              Icon && "pl-10",
              className,
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          {/* Chevron */}
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 dark:text-gray-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>
        {error && (
          <p className="text-xs font-medium text-accent-500">{error}</p>
        )}
      </div>
    );
  },
);
Select.displayName = "Select";

/* ──────────────────────── Toggle ────────────────────────────── */

export interface ToggleProps {
  label?: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: ToggleProps) {
  return (
    <label
      className={cn(
        "group flex items-center justify-between gap-4 cursor-pointer select-none",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      <div className="min-w-0">
        {label && (
          <span className="block text-sm font-medium text-gray-900 dark:text-gray-50">
            {label}
          </span>
        )}
        {description && (
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {description}
          </span>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent",
          "transition-colors duration-200 ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2",
          checked
            ? "bg-brand-500"
            : "bg-gray-200 dark:bg-white/[0.1]",
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm",
            "transform transition-transform duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </label>
  );
}
