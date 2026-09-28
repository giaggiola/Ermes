import assert from "node:assert/strict";
import test from "node:test";

import { newsletterSubscribeSchema } from "../apps/web/src/lib/newsletter-schema.ts";

test("newsletter consent timestamps accept RFC 3339 timezone forms", () => {
  for (const consented_at of [
    "2026-08-02T14:18:07Z",
    "2026-08-02T14:18:07+00:00",
    "2026-08-02T10:18:07-04:00",
  ]) {
    assert.equal(
      newsletterSubscribeSchema.safeParse({
        consented_at,
        email: "customer@example.com",
      }).success,
      true,
    );
  }
});

test("newsletter consent timestamps still require an explicit timezone", () => {
  assert.equal(
    newsletterSubscribeSchema.safeParse({
      consented_at: "2026-08-02T14:18:07",
      email: "customer@example.com",
    }).success,
    false,
  );
});
