import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../event-bus.ts";
import { matchEventType } from "../event-matcher.ts";
import type { DomainEvent } from "../types.ts";

// ── Pattern matching ────────────────────────────────────────────────────

describe("matchEventType", () => {
  it("matches wildcard *", () => {
    assert.ok(matchEventType("*", "health.metric.recorded"));
    assert.ok(matchEventType("*", "anything"));
  });

  it("matches exact strings", () => {
    assert.ok(matchEventType("sync.completed", "sync.completed"));
    assert.ok(!matchEventType("sync.completed", "sync.failed"));
  });

  it("matches glob prefix patterns", () => {
    assert.ok(matchEventType("health.*", "health.metric.recorded"));
    assert.ok(matchEventType("health.*", "health.score.updated"));
    assert.ok(!matchEventType("health.*", "sync.completed"));
  });

  it("matches mid-string wildcards", () => {
    assert.ok(matchEventType("health.*.updated", "health.score.updated"));
    assert.ok(!matchEventType("health.*.updated", "health.score.recorded"));
  });
});

// ── EventBus (local-only, no Redis) ─────────────────────────────────────

describe("EventBus — local mode", () => {
  let bus: EventBus;

  before(() => {
    bus = new EventBus();
  });

  after(async () => {
    await bus.close();
  });

  it("delivers events to matching subscribers", async () => {
    const received: DomainEvent[] = [];

    bus.subscribe("health.*", async (event) => {
      received.push(event);
    });

    await bus.publish({
      type: "health.metric.recorded",
      aggregateType: "health-metric",
      aggregateId: "agg-1",
      payload: { value: 72 },
    });

    assert.equal(received.length, 1);
    assert.equal(received[0]!.type, "health.metric.recorded");
    assert.deepEqual(received[0]!.payload, { value: 72 });
  });

  it("auto-generates id and timestamp", async () => {
    let captured: DomainEvent | undefined;

    bus.subscribe("test.*", async (event) => {
      captured = event;
    });

    await bus.publish({
      type: "test.auto",
      aggregateType: "test",
      aggregateId: "agg-2",
      payload: {},
    });

    assert.ok(captured);
    assert.ok(captured.id, "should have an id");
    assert.ok(captured.metadata.timestamp, "should have a timestamp");
  });

  it("does not deliver events to non-matching subscribers", async () => {
    const received: DomainEvent[] = [];

    bus.subscribe("sync.*", async (event) => {
      received.push(event);
    });

    await bus.publish({
      type: "health.metric.recorded",
      aggregateType: "health-metric",
      aggregateId: "agg-3",
      payload: {},
    });

    assert.equal(received.length, 0);
  });

  it("supports unsubscribe", async () => {
    const received: string[] = [];

    const handler = async (event: DomainEvent) => {
      received.push(event.type);
    };

    bus.subscribe("unsub.*", handler);

    await bus.publish({
      type: "unsub.first",
      aggregateType: "test",
      aggregateId: "agg-4",
      payload: {},
    });

    bus.unsubscribe("unsub.*", handler);

    await bus.publish({
      type: "unsub.second",
      aggregateType: "test",
      aggregateId: "agg-5",
      payload: {},
    });

    assert.equal(received.length, 1);
    assert.equal(received[0], "unsub.first");
  });

  it("publishAndWait resolves after handlers complete", async () => {
    let completed = false;

    bus.subscribe("wait.*", async () => {
      await new Promise((r) => setTimeout(r, 50));
      completed = true;
    });

    await bus.publishAndWait({
      type: "wait.test",
      aggregateType: "test",
      aggregateId: "agg-6",
      payload: {},
    });

    assert.ok(completed, "handler should have completed before resolve");
  });
});

// ── Error isolation ─────────────────────────────────────────────────────

describe("EventBus — error isolation", () => {
  let bus: EventBus;

  before(() => {
    bus = new EventBus({ maxRetries: 1 });
  });

  after(async () => {
    await bus.close();
  });

  it("a failing handler does not block other handlers", async () => {
    const results: string[] = [];

    bus.subscribe("fail.*", async () => {
      throw new Error("boom");
    });

    bus.subscribe("fail.*", async () => {
      results.push("ok");
    });

    await bus.publish({
      type: "fail.test",
      aggregateType: "test",
      aggregateId: "agg-7",
      payload: {},
    });

    assert.equal(results.length, 1);
    assert.equal(results[0], "ok");
  });
});
