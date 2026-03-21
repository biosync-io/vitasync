/**
 * Remove keys whose value is `undefined` from an object.
 * Fixes `exactOptionalPropertyTypes` mismatches when passing Zod-parsed objects
 * to functions expecting optional (but not `undefined`) properties.
 */
type Defined<T> = { [K in keyof T]: Exclude<T[K], undefined> }

export function defined<T extends Record<string, unknown>>(obj: T): Defined<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Defined<T>
}
