"use client";

import React from "react";
import { cn } from "./utils";
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

/* ──────────────────────────── Card ──────────────────────────── */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  glow?: "brand" | "vitality" | "accent";
}

const glowMap: Record<string, string> = {
  brand:
    "hover:border-brand-400/40 dark:hover:border-brand-400/30 hover:shadow-[0_0_24px_rgba(99,102,241,0.12)]",
  vitality:
    "hover:border-vitality-400/40 dark:hover:border-vitality-400/30 hover:shadow-[0_0_24px_rgba(16,185,129,0.12)]",
  accent:
    "hover:border-accent-400/40 dark:hover:border-accent-400/30 hover:shadow-[0_0_24px_rgba(239,68,68,0.12)]",
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, hover = false, glow, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border border-gray-200/50 dark:border-white/[0.06]",
        "bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl",
        "shadow-sm transition-all duration-300",
        hover &&
          "hover:border-gray-300/60 dark:hover:border-white/[0.1] hover:shadow-md",
        glow && glowMap[glow],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
Card.displayName = "Card";

/* ──────────────────────── CardHeader ────────────────────────── */

export interface CardHeaderProps {
  children?: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function CardHeader({
  children,
  title,
  subtitle,
  action,
  icon,
  className,
}: CardHeaderProps) {
  if (children) {
    return (
      <div className={cn("px-6 pt-6 pb-2", className)}>{children}</div>
    );
  }

  return (
    <div className={cn("px-6 pt-6 pb-2 flex items-start justify-between gap-4", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <span className="mt-0.5 flex-shrink-0 text-gray-400 dark:text-gray-500">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {title && (
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50 truncate">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

/* ──────────────────────── CardContent ───────────────────────── */

export interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={cn("px-6 py-4", className)}>{children}</div>;
}

/* ──────────────────────── CardFooter ────────────────────────── */

export interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-t border-gray-100 dark:border-white/[0.04]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ──────────────────────── StatCard ──────────────────────────── */

export interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  color?: "brand" | "vitality" | "accent" | "default";
  href?: string;
}

const statColorMap: Record<string, string> = {
  brand: "text-brand-500",
  vitality: "text-vitality-500",
  accent: "text-accent-500",
  default: "text-gray-900 dark:text-gray-50",
};

export function StatCard({
  label,
  value,
  change,
  changeLabel,
  icon,
  color = "default",
  href,
}: StatCardProps) {
  const Wrapper = href ? "a" : "div";
  const linkProps = href ? { href } : {};

  const glowProp = color !== "default" ? (color as CardProps["glow"]) : undefined;
  const cardProps = glowProp ? { hover: !!href, glow: glowProp } : { hover: !!href };

  return (
    <Card {...cardProps}>
      <Wrapper
        {...linkProps}
        className={cn("block p-6", href && "cursor-pointer")}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {label}
          </span>
          {icon && (
            <span className="text-gray-400 dark:text-gray-500">{icon}</span>
          )}
        </div>

        <div className={cn("text-3xl font-bold tabular-nums tracking-tight", statColorMap[color])}>
          {value}
        </div>

        {change !== undefined && (
          <div className="mt-2 flex items-center gap-1.5 text-sm">
            {change >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-vitality-500" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-accent-500" />
            )}
            <span
              className={cn(
                "font-medium",
                change >= 0 ? "text-vitality-600 dark:text-vitality-400" : "text-accent-600 dark:text-accent-400",
              )}
            >
              {change >= 0 ? "+" : ""}
              {change}%
            </span>
            {changeLabel && (
              <span className="text-gray-400 dark:text-gray-500">
                {changeLabel}
              </span>
            )}
          </div>
        )}
      </Wrapper>
    </Card>
  );
}

/* ──────────────────────── FeatureCard ───────────────────────── */

export interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href?: string;
  className?: string;
}

export function FeatureCard({
  icon: Icon,
  title,
  description,
  href,
  className,
}: FeatureCardProps) {
  const Wrapper = href ? "a" : "div";
  const linkProps = href ? { href } : {};

  return (
    <Card hover className={cn("group", className)}>
      <Wrapper {...linkProps} className="block p-6">
        <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/10 p-2.5">
          <Icon className="h-5 w-5 text-brand-500" />
        </div>

        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-1">
          {title}
        </h3>

        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          {description}
        </p>

        {href && (
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-500 group-hover:gap-2 transition-all duration-200">
            Learn more
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        )}
      </Wrapper>
    </Card>
  );
}
