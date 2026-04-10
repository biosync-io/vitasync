/**
 * Match an event type string against a glob-like pattern.
 *
 * Supported patterns:
 *  - `*`            → matches everything
 *  - `health.*`     → matches any type starting with "health."
 *  - `sync.completed` → exact match
 */
export function matchEventType(pattern: string, eventType: string): boolean {
  if (pattern === "*") return true;
  if (pattern === eventType) return true;

  if (!pattern.includes("*")) return false;

  const regex = new RegExp(
    `^${pattern.replace(/\./g, "\\.").replace(/\*/g, ".*")}$`,
  );
  return regex.test(eventType);
}
