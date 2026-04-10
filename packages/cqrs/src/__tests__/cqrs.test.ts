import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../command-bus.ts";
import { QueryBus } from "../query-bus.ts";
import {
  loggingMiddleware,
  validationMiddleware,
  metricsMiddleware,
  cachingMiddleware,
} from "../middleware.ts";
import { createCommand, createQuery } from "../decorators.ts";
import {
  CommandNotRegisteredError,
  QueryNotRegisteredError,
  CommandValidationError,
} from "../errors.ts";
import type { Command, Query, CqrsLogger } from "../types.ts";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeCommandMeta() {
  return {
    userId: "user-1",
    workspaceId: "ws-1",
    requestId: "req-1",
    timestamp: new Date().toISOString(),
  };
}

function makeQueryMeta() {
  return { userId: "user-1", workspaceId: "ws-1", requestId: "req-1" };
}

// ── CommandBus ──────────────────────────────────────────────────────────

describe("CommandBus", () => {
  let bus: CommandBus;

  beforeEach(() => {
    bus = new CommandBus();
  });

  it("dispatches a command to the registered handler", async () => {
    bus.register("CreateUser", async (cmd) => ({
      id: "u-1",
      name: cmd.payload,
    }));

    const result = await bus.dispatch<{ id: string; name: string }>({
      type: "CreateUser",
      payload: "Alice",
      metadata: makeCommandMeta(),
    });

    assert.deepEqual(result, { id: "u-1", name: "Alice" });
  });

  it("throws CommandNotRegisteredError for unknown command", async () => {
    await assert.rejects(
      () =>
        bus.dispatch({
          type: "Unknown",
          payload: null,
          metadata: makeCommandMeta(),
        }),
      (err: unknown) => {
        assert.ok(err instanceof CommandNotRegisteredError);
        assert.equal(err.commandType, "Unknown");
        return true;
      },
    );
  });

  it("throws on duplicate handler registration", () => {
    bus.register("Dup", async () => "ok");
    assert.throws(() => bus.register("Dup", async () => "ok2"), /Duplicate/);
  });

  it("lists registered command types", () => {
    bus.register("A", async () => {});
    bus.register("B", async () => {});
    assert.deepEqual(bus.getRegisteredCommands().sort(), ["A", "B"]);
  });

  it("propagates handler errors", async () => {
    bus.register("Fail", async () => {
      throw new Error("handler boom");
    });

    await assert.rejects(
      () =>
        bus.dispatch({
          type: "Fail",
          payload: null,
          metadata: makeCommandMeta(),
        }),
      { message: "handler boom" },
    );
  });
});

// ── QueryBus ────────────────────────────────────────────────────────────

describe("QueryBus", () => {
  let bus: QueryBus;

  beforeEach(() => {
    bus = new QueryBus();
  });

  it("dispatches a query to the registered handler", async () => {
    bus.register("GetUser", async (q) => ({ id: q.params }));

    const result = await bus.dispatch<{ id: string }>({
      type: "GetUser",
      params: "u-1",
      metadata: makeQueryMeta(),
    });

    assert.deepEqual(result, { id: "u-1" });
  });

  it("throws QueryNotRegisteredError for unknown query", async () => {
    await assert.rejects(
      () =>
        bus.dispatch({
          type: "Unknown",
          params: null,
          metadata: makeQueryMeta(),
        }),
      (err: unknown) => {
        assert.ok(err instanceof QueryNotRegisteredError);
        assert.equal(err.queryType, "Unknown");
        return true;
      },
    );
  });

  it("throws on duplicate handler registration", () => {
    bus.register("Dup", async () => "ok");
    assert.throws(() => bus.register("Dup", async () => "ok2"), /Duplicate/);
  });

  it("lists registered query types", () => {
    bus.register("X", async () => {});
    bus.register("Y", async () => {});
    assert.deepEqual(bus.getRegisteredQueries().sort(), ["X", "Y"]);
  });
});

// ── Middleware pipeline ─────────────────────────────────────────────────

describe("Middleware pipeline", () => {
  it("executes command middleware in registration order", async () => {
    const bus = new CommandBus();
    const order: number[] = [];

    bus.use(async (_cmd, next) => {
      order.push(1);
      const result = await next();
      order.push(4);
      return result;
    });

    bus.use(async (_cmd, next) => {
      order.push(2);
      const result = await next();
      order.push(3);
      return result;
    });

    bus.register("Test", async () => "done");

    await bus.dispatch({
      type: "Test",
      payload: null,
      metadata: makeCommandMeta(),
    });

    assert.deepEqual(order, [1, 2, 3, 4]);
  });

  it("executes query middleware in registration order", async () => {
    const bus = new QueryBus();
    const order: number[] = [];

    bus.use(async (_q, next) => {
      order.push(1);
      const result = await next();
      order.push(4);
      return result;
    });

    bus.use(async (_q, next) => {
      order.push(2);
      const result = await next();
      order.push(3);
      return result;
    });

    bus.register("Test", async () => "done");

    await bus.dispatch({
      type: "Test",
      params: null,
      metadata: makeQueryMeta(),
    });

    assert.deepEqual(order, [1, 2, 3, 4]);
  });

  it("middleware can short-circuit the chain", async () => {
    const bus = new CommandBus();
    let handlerCalled = false;

    bus.use(async (_cmd, _next) => "intercepted");

    bus.register("Test", async () => {
      handlerCalled = true;
      return "from-handler";
    });

    const result = await bus.dispatch<string>({
      type: "Test",
      payload: null,
      metadata: makeCommandMeta(),
    });

    assert.equal(result, "intercepted");
    assert.equal(handlerCalled, false);
  });

  it("middleware can transform the result", async () => {
    const bus = new CommandBus();

    bus.use(async (_cmd, next) => {
      const result = await next();
      return `wrapped(${result})`;
    });

    bus.register("Test", async () => "inner");

    const result = await bus.dispatch<string>({
      type: "Test",
      payload: null,
      metadata: makeCommandMeta(),
    });

    assert.equal(result, "wrapped(inner)");
  });
});

// ── Validation middleware ───────────────────────────────────────────────

describe("validationMiddleware", () => {
  it("passes when schema validates", async () => {
    const bus = new CommandBus();

    const schemas = new Map<string, { safeParse: (d: unknown) => { success: boolean } }>();
    schemas.set("Valid", { safeParse: () => ({ success: true }) });

    bus.use(validationMiddleware(schemas as never));
    bus.register("Valid", async (cmd) => cmd.payload);

    const result = await bus.dispatch({
      type: "Valid",
      payload: { name: "Alice" },
      metadata: makeCommandMeta(),
    });

    assert.deepEqual(result, { name: "Alice" });
  });

  it("throws CommandValidationError when schema rejects", async () => {
    const bus = new CommandBus();

    const issues = [{ path: ["name"], message: "Required" }];
    const schemas = new Map<
      string,
      { safeParse: (d: unknown) => { success: boolean; error?: { issues: unknown[] } } }
    >();
    schemas.set("Invalid", {
      safeParse: () => ({ success: false, error: { issues } }),
    });

    bus.use(validationMiddleware(schemas as never));
    bus.register("Invalid", async () => "should not reach");

    await assert.rejects(
      () =>
        bus.dispatch({
          type: "Invalid",
          payload: {},
          metadata: makeCommandMeta(),
        }),
      (err: unknown) => {
        assert.ok(err instanceof CommandValidationError);
        assert.equal(err.commandType, "Invalid");
        assert.deepEqual(err.issues, issues);
        return true;
      },
    );
  });

  it("skips validation when no schema is registered for the command type", async () => {
    const bus = new CommandBus();
    const schemas = new Map();

    bus.use(validationMiddleware(schemas));
    bus.register("NoSchema", async () => "ok");

    const result = await bus.dispatch({
      type: "NoSchema",
      payload: {},
      metadata: makeCommandMeta(),
    });

    assert.equal(result, "ok");
  });
});

// ── Caching middleware ──────────────────────────────────────────────────

describe("cachingMiddleware", () => {
  it("caches query results", async () => {
    const bus = new QueryBus();
    const cache = new Map<string, { value: unknown; expiresAt: number }>();
    let callCount = 0;

    bus.use(cachingMiddleware(cache, 5000));
    bus.register("GetScore", async () => {
      callCount++;
      return { score: 42 };
    });

    const query: Query = {
      type: "GetScore",
      params: { userId: "u-1" },
      metadata: makeQueryMeta(),
    };

    const r1 = await bus.dispatch(query);
    const r2 = await bus.dispatch(query);

    assert.deepEqual(r1, { score: 42 });
    assert.deepEqual(r2, { score: 42 });
    assert.equal(callCount, 1, "handler should be called only once");
  });

  it("uses different cache keys for different params", async () => {
    const bus = new QueryBus();
    const cache = new Map<string, { value: unknown; expiresAt: number }>();
    let callCount = 0;

    bus.use(cachingMiddleware(cache, 5000));
    bus.register("GetScore", async (q) => {
      callCount++;
      return { userId: q.params };
    });

    await bus.dispatch({
      type: "GetScore",
      params: "u-1",
      metadata: makeQueryMeta(),
    });
    await bus.dispatch({
      type: "GetScore",
      params: "u-2",
      metadata: makeQueryMeta(),
    });

    assert.equal(callCount, 2);
  });

  it("expires cached entries after TTL", async () => {
    const bus = new QueryBus();
    const cache = new Map<string, { value: unknown; expiresAt: number }>();
    let callCount = 0;

    bus.use(cachingMiddleware(cache, 1)); // 1ms TTL
    bus.register("GetScore", async () => {
      callCount++;
      return callCount;
    });

    const query: Query = {
      type: "GetScore",
      params: {},
      metadata: makeQueryMeta(),
    };

    await bus.dispatch(query);
    await new Promise((r) => setTimeout(r, 10));
    await bus.dispatch(query);

    assert.equal(callCount, 2, "handler should be called twice after TTL expiry");
  });
});

// ── Logging middleware ──────────────────────────────────────────────────

describe("loggingMiddleware", () => {
  it("logs dispatch and completion", async () => {
    const bus = new CommandBus();
    const logs: string[] = [];
    const logger: CqrsLogger = {
      info: (msg: unknown) => logs.push(String(msg)),
      error: (msg: unknown) => logs.push(String(msg)),
      warn: (msg: unknown) => logs.push(String(msg)),
      debug: (msg: unknown) => logs.push(String(msg)),
    };

    bus.use(loggingMiddleware(logger));
    bus.register("Log", async () => "ok");

    await bus.dispatch({
      type: "Log",
      payload: null,
      metadata: makeCommandMeta(),
    });

    assert.ok(logs.some((l) => l.includes('Dispatching command "Log"')));
    assert.ok(logs.some((l) => l.includes('Command "Log" completed')));
  });

  it("logs errors", async () => {
    const bus = new CommandBus();
    const logs: string[] = [];
    const logger: CqrsLogger = {
      info: (msg: unknown) => logs.push(String(msg)),
      error: (msg: unknown) => logs.push(String(msg)),
      warn: (msg: unknown) => logs.push(String(msg)),
      debug: (msg: unknown) => logs.push(String(msg)),
    };

    bus.use(loggingMiddleware(logger));
    bus.register("Boom", async () => {
      throw new Error("fail");
    });

    await assert.rejects(() =>
      bus.dispatch({
        type: "Boom",
        payload: null,
        metadata: makeCommandMeta(),
      }),
    );

    assert.ok(logs.some((l) => l.includes('Command "Boom" failed')));
  });
});

// ── Metrics middleware ──────────────────────────────────────────────────

describe("metricsMiddleware", () => {
  it("reports execution duration on success", async () => {
    const bus = new CommandBus();
    const metrics: { type: string; ms: number; error: Error | undefined }[] = [];

    bus.use(metricsMiddleware((type, ms, error) => metrics.push({ type, ms, error })));
    bus.register("Metric", async () => "ok");

    await bus.dispatch({
      type: "Metric",
      payload: null,
      metadata: makeCommandMeta(),
    });

    assert.equal(metrics.length, 1);
    assert.equal(metrics[0]!.type, "Metric");
    assert.equal(typeof metrics[0]!.ms, "number");
    assert.equal(metrics[0]!.error, undefined);
  });

  it("reports execution duration on error", async () => {
    const bus = new CommandBus();
    const metrics: { type: string; ms: number; error: Error | undefined }[] = [];

    bus.use(metricsMiddleware((type, ms, error) => metrics.push({ type, ms, error })));
    bus.register("FailMetric", async () => {
      throw new Error("oops");
    });

    await assert.rejects(() =>
      bus.dispatch({
        type: "FailMetric",
        payload: null,
        metadata: makeCommandMeta(),
      }),
    );

    assert.equal(metrics.length, 1);
    assert.equal(metrics[0]!.error?.message, "oops");
  });
});

// ── Decorators / helpers ────────────────────────────────────────────────

describe("createCommand / createQuery", () => {
  it("creates a well-formed Command", () => {
    const meta = makeCommandMeta();
    const cmd = createCommand("RecordMetric", { value: 72 }, meta);

    assert.equal(cmd.type, "RecordMetric");
    assert.deepEqual(cmd.payload, { value: 72 });
    assert.equal(cmd.metadata, meta);
  });

  it("creates a well-formed Query", () => {
    const meta = makeQueryMeta();
    const q = createQuery("GetScore", { period: "week" }, meta);

    assert.equal(q.type, "GetScore");
    assert.deepEqual(q.params, { period: "week" });
    assert.equal(q.metadata, meta);
  });
});

// ── Error handling edge cases ───────────────────────────────────────────

describe("Error handling edge cases", () => {
  it("middleware error propagates and stops the chain", async () => {
    const bus = new CommandBus();
    let handlerCalled = false;

    bus.use(async (_cmd, _next) => {
      throw new Error("middleware exploded");
    });

    bus.register("Test", async () => {
      handlerCalled = true;
    });

    await assert.rejects(
      () =>
        bus.dispatch({
          type: "Test",
          payload: null,
          metadata: makeCommandMeta(),
        }),
      { message: "middleware exploded" },
    );

    assert.equal(handlerCalled, false);
  });

  it("async handler rejection is properly caught", async () => {
    const bus = new CommandBus();

    bus.register("AsyncFail", async () => {
      return Promise.reject(new Error("async rejection"));
    });

    await assert.rejects(
      () =>
        bus.dispatch({
          type: "AsyncFail",
          payload: null,
          metadata: makeCommandMeta(),
        }),
      { message: "async rejection" },
    );
  });
});
