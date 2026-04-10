"use client";

import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "./utils";

/* ──────────────────────── MetricRing ────────────────────────── */

export interface MetricRingProps {
  value: number;
  max?: number;
  label?: string;
  color?: "brand" | "vitality" | "accent" | "amber";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const ringColorMap: Record<string, string> = {
  brand: "stroke-brand-500",
  vitality: "stroke-vitality-500",
  accent: "stroke-accent-500",
  amber: "stroke-amber-500",
};

const ringTrackMap: Record<string, string> = {
  brand: "stroke-brand-100 dark:stroke-brand-500/10",
  vitality: "stroke-vitality-100 dark:stroke-vitality-500/10",
  accent: "stroke-accent-100 dark:stroke-accent-500/10",
  amber: "stroke-amber-100 dark:stroke-amber-500/10",
};

const ringSizeMap = {
  sm: { box: 64, strokeWidth: 5, textClass: "text-sm font-bold", wrapperClass: "w-16 h-16" },
  md: { box: 96, strokeWidth: 6, textClass: "text-xl font-bold", wrapperClass: "w-24 h-24" },
  lg: { box: 128, strokeWidth: 7, textClass: "text-2xl font-bold", wrapperClass: "w-32 h-32" },
} as const;

export function MetricRing({
  value,
  max = 100,
  label,
  color = "brand",
  size = "md",
  className,
}: MetricRingProps) {
  const { box, strokeWidth, textClass, wrapperClass } = ringSizeMap[size];
  const radius = (box - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const offset = circumference * (1 - progress);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className={cn("relative", wrapperClass)}>
        <svg
          viewBox={`0 0 ${box} ${box}`}
          className="w-full h-full -rotate-90"
        >
          {/* Track */}
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className={ringTrackMap[color]}
          />
          {/* Progress */}
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn(ringColorMap[color], "transition-all duration-700 ease-out")}
          />
        </svg>
        {/* Center value */}
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center tabular-nums text-gray-900 dark:text-gray-50",
            textClass,
          )}
        >
          {Math.round(value)}
        </span>
      </div>
      {label && (
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 text-center">
          {label}
        </span>
      )}
    </div>
  );
}

/* ──────────────────────── MetricBar ─────────────────────────── */

export interface MetricBarProps {
  value: number;
  max?: number;
  label?: string;
  color?: "brand" | "vitality" | "accent" | "amber";
  showValue?: boolean;
  className?: string;
}

const barColorMap: Record<string, string> = {
  brand: "bg-brand-500",
  vitality: "bg-vitality-500",
  accent: "bg-accent-500",
  amber: "bg-amber-500",
};

const barTrackMap: Record<string, string> = {
  brand: "bg-brand-100 dark:bg-brand-500/10",
  vitality: "bg-vitality-100 dark:bg-vitality-500/10",
  accent: "bg-accent-100 dark:bg-accent-500/10",
  amber: "bg-amber-100 dark:bg-amber-500/10",
};

export function MetricBar({
  value,
  max = 100,
  label,
  color = "brand",
  showValue = true,
  className,
}: MetricBarProps) {
  const progress = Math.min((value / max) * 100, 100);

  return (
    <div className={cn("space-y-2", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-sm">
          {label && (
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {label}
            </span>
          )}
          {showValue && (
            <span className="tabular-nums text-gray-500 dark:text-gray-400">
              {Math.round(value)}/{max}
            </span>
          )}
        </div>
      )}
      <div className={cn("h-2 w-full rounded-full overflow-hidden", barTrackMap[color])}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            barColorMap[color],
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

/* ──────────────────────── MetricTrend ───────────────────────── */

export interface MetricTrendProps {
  current: number;
  previous: number;
  label?: string;
  format?: (value: number) => string;
  className?: string;
}

export function MetricTrend({
  current,
  previous,
  label,
  format = (v) => String(v),
  className,
}: MetricTrendProps) {
  const diff = previous !== 0 ? ((current - previous) / previous) * 100 : 0;
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "neutral";

  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">
          {label}
        </span>
      )}
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-50">
          {format(current)}
        </span>
        <div
          className={cn(
            "inline-flex items-center gap-1 text-sm font-medium",
            direction === "up" && "text-vitality-600 dark:text-vitality-400",
            direction === "down" && "text-accent-600 dark:text-accent-400",
            direction === "neutral" && "text-gray-400 dark:text-gray-500",
          )}
        >
          {direction === "up" && <TrendingUp className="h-3.5 w-3.5" />}
          {direction === "down" && <TrendingDown className="h-3.5 w-3.5" />}
          {direction === "neutral" && <Minus className="h-3.5 w-3.5" />}
          <span>
            {diff > 0 ? "+" : ""}
            {diff.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
