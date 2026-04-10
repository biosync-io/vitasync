/** Merge Tailwind class strings, filtering out falsy values. */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
