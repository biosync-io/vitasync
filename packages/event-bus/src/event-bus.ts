import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { matchEventType } from "./event-matcher.ts";
import type {
  DomainEvent,
  DomainEventInput,
  EventBusLogger,
  EventBusOptions,
  EventHandler,
} from "./types.ts";

const noopLogger: EventBusLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
};

interface Subscription {
  pattern: string;
  handler: EventHandler;
}

export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly subscriptions: Subscription[] = [];
  private readonly channelPrefix: string;
  private readonly maxRetries: number;
  private readonly logger: EventBusLogger;

  private redisPub: Redis | null = null;
  private redisSub: Redis | null = null;
  private closed = false;
  private pendingHandlers = 0;
  private drainResolvers: Array<() => void> = [];

  private readonly options: EventBusOptions;

  constructor(options: EventBusOptions = {}) {
    this.options = options;
    this.channelPrefix = options.channelPrefix ?? "vitasync";
    this.maxRetries = options.maxRetries ?? 3;
    this.logger = options.logger ?? noopLogger;

    if (options.redis) {
      this.initRedis(options.redis);
    }
  }

  // ── Redis setup ──────────────────────────────────────────────────────

  private initRedis(config: { host: string; port: number } | string): void {
    if (typeof config === "string") {
      this.redisPub = new Redis(config);
      this.redisSub = new Redis(config);
    } else {
      this.redisPub = new Redis(config);
      this.redisSub = new Redis(config);
    }

    this.redisSub.on("message", (_channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as DomainEvent;
        this.dispatchLocal(event).catch((err) => {
          this.logger.error("Error dispatching Redis event locally", err);
        });
      } catch (err) {
        this.logger.error("Failed to parse Redis event message", err);
      }
    });

    this.redisSub.subscribe(this.redisChannel, (err) => {
      if (err) {
        this.logger.error("Failed to subscribe to Redis channel", err);
      } else {
        this.logger.info(`Subscribed to Redis channel: ${this.redisChannel}`);
      }
    });
  }

  private get redisChannel(): string {
    return `${this.channelPrefix}:events`;
  }

  // ── Public API ───────────────────────────────────────────────────────

  async publish<T = unknown>(event: DomainEventInput<T>): Promise<DomainEvent<T>> {
    if (this.closed) throw new Error("EventBus is closed");

    const full = this.hydrateEvent(event);
    this.logger.info(`Publishing event: ${full.type} (${full.id})`);

    if (this.redisPub) {
      await this.redisPub.publish(this.redisChannel, JSON.stringify(full));
    } else {
      // Local-only mode — dispatch directly
      await this.dispatchLocal(full as DomainEvent);
    }

    return full;
  }

  /**
   * Publish an event and wait for all **local** handlers to finish.
   * (Remote handlers on other processes are fire-and-forget.)
   */
  async publishAndWait<T = unknown>(event: DomainEventInput<T>): Promise<DomainEvent<T>> {
    if (this.closed) throw new Error("EventBus is closed");

    const full = this.hydrateEvent(event);
    this.logger.info(`Publishing (and waiting): ${full.type} (${full.id})`);

    if (this.redisPub) {
      await this.redisPub.publish(this.redisChannel, JSON.stringify(full));
      // Wait for local dispatch triggered by the subscription callback
      await this.waitForDrain();
    } else {
      await this.dispatchLocal(full as DomainEvent);
    }

    return full;
  }

  subscribe<T = unknown>(pattern: string, handler: EventHandler<T>): void {
    if (this.closed) throw new Error("EventBus is closed");

    this.subscriptions.push({ pattern, handler: handler as EventHandler });
    this.logger.debug(`Subscribed handler for pattern: ${pattern}`);
  }

  unsubscribe<T = unknown>(pattern: string, handler: EventHandler<T>): void {
    const idx = this.subscriptions.findIndex(
      (s) => s.pattern === pattern && s.handler === (handler as EventHandler),
    );
    if (idx !== -1) {
      this.subscriptions.splice(idx, 1);
      this.logger.debug(`Unsubscribed handler for pattern: ${pattern}`);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.logger.info("Closing EventBus…");

    // Wait for in-flight handlers to finish
    if (this.pendingHandlers > 0) {
      await this.waitForDrain();
    }

    if (this.redisSub) {
      await this.redisSub.unsubscribe(this.redisChannel);
      this.redisSub.disconnect();
    }
    if (this.redisPub) {
      this.redisPub.disconnect();
    }

    this.subscriptions.length = 0;
    this.logger.info("EventBus closed");
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private hydrateEvent<T>(
    partial: DomainEventInput<T>,
  ): DomainEvent<T> {
    return {
      id: partial.id ?? randomUUID(),
      type: partial.type,
      aggregateType: partial.aggregateType,
      aggregateId: partial.aggregateId,
      payload: partial.payload,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 1,
        ...partial.metadata,
      },
    };
  }

  private async dispatchLocal(event: DomainEvent): Promise<void> {
    const matching = this.subscriptions.filter((s) =>
      matchEventType(s.pattern, event.type),
    );

    if (matching.length === 0) {
      this.logger.debug(`No handlers matched event: ${event.type}`);
      return;
    }

    this.logger.debug(
      `Dispatching ${event.type} to ${matching.length} handler(s)`,
    );

    this.pendingHandlers += matching.length;

    await Promise.all(
      matching.map(async (sub) => {
        let attempt = 0;
        while (attempt < this.maxRetries) {
          try {
            await sub.handler(event);
            break;
          } catch (err) {
            attempt++;
            if (attempt >= this.maxRetries) {
              this.logger.error(
                `Handler for pattern "${sub.pattern}" failed after ${this.maxRetries} attempt(s) on event ${event.type}`,
                err,
              );
            } else {
              this.logger.warn(
                `Handler for pattern "${sub.pattern}" failed (attempt ${attempt}/${this.maxRetries}), retrying…`,
                err,
              );
            }
          }
        }

        this.pendingHandlers--;
        if (this.pendingHandlers === 0) {
          for (const resolve of this.drainResolvers) resolve();
          this.drainResolvers.length = 0;
        }
      }),
    );
  }

  private waitForDrain(): Promise<void> {
    if (this.pendingHandlers === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.drainResolvers.push(resolve);
    });
  }
}
