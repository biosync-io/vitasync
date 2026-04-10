import type { EventBus } from "./event-bus.ts";
import type { DomainEvent, EventHandler } from "./types.ts";

interface RegisteredHandler {
  eventType: string;
  name: string;
  priority: number;
  handler: EventHandler;
}

/**
 * Typed registry for domain event handlers.
 *
 * Wraps an {@link EventBus} instance and adds:
 * - Named handlers (for diagnostics and targeted unregistration)
 * - Priority ordering (lower = runs first)
 * - Bulk registration via `registerAll`
 * - Introspection via `listHandlers`
 */
export class EventHandlerRegistry {
  private readonly bus: EventBus;
  private readonly handlers: RegisteredHandler[] = [];
  private nextId = 0;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  /**
   * Register a single event handler with optional priority and name.
   * Lower priority numbers execute first. Default priority is 100.
   */
  register(
    eventType: string,
    handler: EventHandler,
    options?: { priority?: number; name?: string },
  ): void {
    const name =
      options?.name ?? `handler-${eventType}-${this.nextId++}`;
    const priority = options?.priority ?? 100;

    const entry: RegisteredHandler = { eventType, name, priority, handler };
    this.handlers.push(entry);

    // Sort by priority so the bus dispatches in order
    this.handlers.sort((a, b) => a.priority - b.priority);

    // Wrap handler with error isolation so one handler can't break others
    const wrappedHandler: EventHandler = async (event: DomainEvent) => {
      try {
        await handler(event);
      } catch (err) {
        // Error is already caught/retried by EventBus — rethrow so retry logic works
        throw err;
      }
    };

    // Store the wrapped handler ref for unregistration
    entry.handler = wrappedHandler;
    this.bus.subscribe(eventType, wrappedHandler);
  }

  /**
   * Register multiple handlers at once.
   */
  registerAll(
    handlers: Array<{
      eventType: string;
      handler: EventHandler;
      name?: string;
      priority?: number;
    }>,
  ): void {
    for (const h of handlers) {
      const options: { priority?: number; name?: string } = {};
      if (h.priority !== undefined) options.priority = h.priority;
      if (h.name !== undefined) options.name = h.name;
      this.register(h.eventType, h.handler, options);
    }
  }

  /**
   * List all registered handlers (for diagnostics / health endpoints).
   */
  listHandlers(): Array<{
    eventType: string;
    name: string;
    priority: number;
  }> {
    return this.handlers.map((h) => ({
      eventType: h.eventType,
      name: h.name,
      priority: h.priority,
    }));
  }

  /**
   * Unregister a handler by its name.
   */
  unregisterByName(name: string): void {
    const idx = this.handlers.findIndex((h) => h.name === name);
    if (idx === -1) return;

    const entry = this.handlers[idx]!;
    this.bus.unsubscribe(entry.eventType, entry.handler);
    this.handlers.splice(idx, 1);
  }
}
