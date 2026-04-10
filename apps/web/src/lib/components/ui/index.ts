/* ── VitaSync Design System ── barrel export ───────────────────── */

export { cn } from "./utils";

// Card
export {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  StatCard,
  FeatureCard,
} from "./card";
export type {
  CardProps,
  CardHeaderProps,
  CardContentProps,
  CardFooterProps,
  StatCardProps,
  FeatureCardProps,
} from "./card";

// Button
export { Button } from "./button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./button";

// Input / Select / Toggle
export { Input, Select, Toggle } from "./input";
export type {
  InputProps,
  SelectProps,
  SelectOption,
  ToggleProps,
} from "./input";

// Badge / StatusDot
export { Badge, StatusDot } from "./badge";
export type {
  BadgeProps,
  BadgeVariant,
  BadgeSize,
  StatusDotProps,
  StatusDotStatus,
} from "./badge";

// PageHeader
export { PageHeader } from "./page-header";
export type { PageHeaderProps, Breadcrumb } from "./page-header";

// EmptyState
export { EmptyState } from "./empty-state";
export type { EmptyStateProps, EmptyStateAction } from "./empty-state";

// Loading skeletons
export {
  PageLoading,
  CardSkeleton,
  TableSkeleton,
  StatSkeleton,
} from "./loading";
export type {
  PageLoadingProps,
  CardSkeletonProps,
  TableSkeletonProps,
  StatSkeletonProps,
} from "./loading";

// DataTable
export { DataTable } from "./data-table";
export type { DataTableProps, DataTableColumn } from "./data-table";

// Metric visualizations
export { MetricRing, MetricBar, MetricTrend } from "./metric";
export type {
  MetricRingProps,
  MetricBarProps,
  MetricTrendProps,
} from "./metric";
