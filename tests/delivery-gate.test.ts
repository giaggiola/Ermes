import assert from "node:assert/strict";
import test from "node:test";
import { EmailDeliveryDisabledError } from "../packages/core/dist/installation.js";
import { withDeliveryGate } from "../apps/worker/src/delivery-gate.ts";

test("paused delivery defers work, resuming runs it, and a mid-flight pause preserves it", async () => {
  let enabled = false,
    executions = 0,
    deferred = 0;
  const input = {
    enabled: async () => enabled,
    run: async () => {
      executions++;
    },
    defer: async () => {
      deferred++;
    },
  };
  await withDeliveryGate(input);
  assert.equal(executions, 0);
  assert.equal(deferred, 1);
  enabled = true;
  await withDeliveryGate(input);
  assert.equal(executions, 1);
  await withDeliveryGate({
    ...input,
    run: async () => {
      throw new EmailDeliveryDisabledError();
    },
  });
  assert.equal(deferred, 2);
  await assert.rejects(
    withDeliveryGate({
      ...input,
      run: async () => {
        throw new Error("provider failure");
      },
    }),
    /provider failure/,
  );
  assert.equal(deferred, 2);
  enabled = false;
  await assert.rejects(
    withDeliveryGate({
      ...input,
      defer: async () => {
        throw new Error("queue unavailable");
      },
    }),
    /queue unavailable/,
  );
});
